// saleService.js — orkestrasi nota: validasi -> hitung -> nomor invoice -> simpan.

import * as db from '../db.js';
import { uid, dbDate, timeLabel, todayDbDate } from '../format.js';
import { calculateSubtotal, computeAdjustments, defaultAdjustments, resolveStatus } from './saleCalculation.js';
import { generateAndAdvance } from './invoiceNumber.js';
import { saveCustomer } from './customerService.js';
import { getSaleProductPriceUpdates } from './productService.js';
import { isSettlementDue, settlementChanges } from './automaticSettlement.js';
import { recordAudit } from './auditLogService.js';

export class AppError extends Error {
  constructor(message) {
    super(message);
    this.userMessage = message;
  }
}

/**
 * Kalau [customer] terhubung ke record Pelanggan sungguhan (id terisi, bukan
 * sentinel CASH), simpan juga koreksi nama/alamat/telepon ke master data
 * Pelanggan — supaya perbaikan data (mis. salah ketik nomor HP) ikut
 * terbawa untuk transaksi berikutnya, bukan cuma nota yang sedang dibuat/diubah.
 */
async function syncCustomerMasterRecord(customer) {
  if (!customer || !customer.id) return;
  try {
    await saveCustomer({ id: customer.id, name: customer.name, phone: customer.phone, address: customer.address });
  } catch (e) {
    console.error('[syncCustomerMasterRecord]', e);
    // Gagal sinkron ke master data BUKAN alasan untuk membatalkan simpan nota
    // (data di nota tetap tersimpan sebagai snapshot apa adanya).
  }
}

export async function createSale({ customer, lines, adjustments = null, discountAmount = 0, initialPayment = 0, saleDate = '', saleTime = '', note = '' }) {
  if (!lines.length) throw new AppError('Transaksi harus mempunyai minimal 1 item.');
  for (const line of lines) {
    if (line.qty <= 0) throw new AppError(`Jumlah untuk "${line.name}" harus lebih dari 0.`);
    if (line.price < 0) throw new AppError(`Harga untuk "${line.name}" tidak valid.`);
  }
  if (initialPayment < 0) throw new AppError('Jumlah pembayaran tidak valid.');
  if (!customer || !customer.name || !customer.name.trim()) throw new AppError('Nama pelanggan wajib diisi.');

  try {
    const now = new Date();
    const subtotal = calculateSubtotal(lines);
    // Backward-compat: kalau caller lama masih kirim discountAmount langsung
    // (bukan objek adjustments lengkap), bungkus jadi adjustments sederhana.
    const adj = adjustments || { ...defaultAdjustments(), discount: { enabled: discountAmount > 0, mode: 'amount', value: discountAmount } };
    const calc = computeAdjustments(subtotal, adj);
    const status = resolveStatus(calc.total, initialPayment);
    const invoiceNumber = await generateAndAdvance(now);
    const saleId = uid();

    await syncCustomerMasterRecord(customer);

    const sale = {
      id: saleId,
      invoiceNumber,
      customerId: customer.id || null,
      customerName: customer.name,
      customerPhone: customer.phone || '',
      customerAddress: customer.address || '',
      // Fallback dipertahankan untuk impor/caller lama; form baru mewajibkan keduanya.
      saleDate: saleDate || dbDate(now),
      saleTime: saleTime || timeLabel(now),
      subtotal,
      discountAmount: calc.discountAmount,
      taxAmount: calc.taxAmount,
      tax2Amount: calc.tax2Amount,
      shippingAmount: calc.shippingAmount,
      otherAmount: calc.otherAmount,
      otherLabel: adj.other?.label || '',
      adjustments: adj, // konfigurasi lengkap (enabled/percent/inclusive/dsb) disimpan apa adanya supaya bisa dibuka lagi saat edit
      total: calc.total,
      note,
      status,
      isDeleted: 0,
      completed: 0,        // penanda "sudah selesai dikerjakan/diambil" — beda dari status pembayaran
      autoMarkedPaid: 0,   // LUNAS otomatis 1 hari setelah tanggal pengambilan
      autoLunasOverridden: 0, // true kalau user pernah membatalkan status LUNAS otomatis -> aturan tidak berlaku lagi utk nota ini
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const items = lines.map((l, i) => ({
      id: uid(),
      saleId,
      productId: l.productId || null,
      productName: l.name,
      unit: l.unit || '',
      qty: l.qty,
      price: l.price,
      subtotal: l.qty * l.price,
      note: l.note || '',
      sortOrder: i,
    }));

    const writes = { sales: [sale], saleItems: items };
    const productUpdates = await getSaleProductPriceUpdates(lines);
    if (productUpdates.length) writes.products = productUpdates;
    if (initialPayment > 0) {
      writes.payments = [{
        id: uid(),
        saleId,
        amount: initialPayment,
        paymentDate: dbDate(now),
        paymentTime: timeLabel(now),
        note: 'Pembayaran awal',
        createdAt: now.toISOString(),
      }];
    }
    await db.bulkPutMulti(writes);
    await recordAudit('create', 'sale', saleId, `Nota ${invoiceNumber} dibuat`);
    return saleId;
  } catch (e) {
    if (e instanceof AppError) throw e;
    console.error('[SaleService.createSale]', e);
    throw new AppError('Gagal menyimpan nota. Silakan coba lagi.');
  }
}

export async function addPayment(saleId, amount, note = '') {
  if (amount <= 0) throw new AppError('Jumlah pembayaran harus lebih dari 0.');
  try {
    const now = new Date();
    const payment = {
      id: uid(),
      saleId,
      amount,
      paymentDate: dbDate(now),
      paymentTime: timeLabel(now),
      note,
      createdAt: now.toISOString(),
    };
    await db.put('payments', payment);
    await recomputeSaleStatus(saleId);
  } catch (e) {
    if (e instanceof AppError) throw e;
    console.error('[SaleService.addPayment]', e);
    throw new AppError('Gagal mencatat pembayaran. Silakan coba lagi.');
  }
}

/** Koreksi pembayaran yang sudah tercatat (mis. salah ketik nominal). */
export async function updatePayment(paymentId, { amount, paymentDate, paymentTime, note }) {
  if (amount <= 0) throw new AppError('Jumlah pembayaran harus lebih dari 0.');
  try {
    const existing = await db.get('payments', paymentId);
    if (!existing) throw new AppError('Pembayaran tidak ditemukan.');
    await db.mutateSalePayments(existing.saleId, (sale, payments) => {
      const current = payments.find(p => p.id === paymentId);
      if (!current) return null;
      const updated = { ...current, amount, paymentDate: paymentDate || current.paymentDate, paymentTime: paymentTime || current.paymentTime, note: note ?? current.note };
      if (current.isAutomatic) {
        updated.isAutomatic = false;
        updated.correctedAt = new Date().toISOString();
        sale.autoMarkedPaid = 0;
        sale.autoLunasOverridden = 1;
      }
      const paid = payments.reduce((sum, p) => sum + (p.id === paymentId ? amount : p.amount), 0);
      if (current.isAutomatic && sale.autoCompleted && sale.total - paid > 0.5) {
        sale.completed = 0;
        sale.autoCompleted = 0;
      }
      return { sale: { ...sale, status: resolveStatus(sale.total, paid), updatedAt: new Date().toISOString() }, payments: [updated] };
    });
  } catch (e) {
    if (e instanceof AppError) throw e;
    console.error('[SaleService.updatePayment]', e);
    throw new AppError('Gagal mengubah pembayaran. Silakan coba lagi.');
  }
}

export async function deletePayment(paymentId) {
  try {
    const existing = await db.get('payments', paymentId);
    if (!existing) return;
    await db.mutateSalePayments(existing.saleId, (sale, payments) => {
      const current = payments.find(p => p.id === paymentId);
      if (!current) return null;
      if (current.isAutomatic) {
        sale.autoMarkedPaid = 0;
        sale.autoLunasOverridden = 1;
        if (sale.autoCompleted) { sale.completed = 0; sale.autoCompleted = 0; }
      }
      const paid = payments.filter(p => p.id !== paymentId).reduce((sum, p) => sum + p.amount, 0);
      return { sale: { ...sale, status: resolveStatus(sale.total, paid), updatedAt: new Date().toISOString() }, removeIds: [paymentId] };
    });
  } catch (e) {
    console.error('[SaleService.deletePayment]', e);
    throw new AppError('Gagal menghapus pembayaran. Silakan coba lagi.');
  }
}

async function recomputeSaleStatus(saleId) {
  const sale = await db.get('sales', saleId);
  if (!sale) return;
  const allPayments = await db.getByIndex('payments', 'saleId', saleId);
  const paidAmount = allPayments.reduce((s, p) => s + p.amount, 0);
  sale.status = resolveStatus(sale.total, paidAmount);
  sale.updatedAt = new Date().toISOString();
  await db.put('sales', sale);
}

/**
 * Ubah nota yang SUDAH TERSIMPAN: pelanggan, item, diskon, tanggal/jam
 * transaksi, dan catatan. Riwayat pembayaran tidak disentuh di sini — itu
 * diedit lewat updatePayment/deletePayment secara terpisah.
 */
export async function updateSale(saleId, { customer, lines, adjustments = null, discountAmount = 0, saleDate, saleTime, note = '' }) {
  if (!lines.length) throw new AppError('Transaksi harus mempunyai minimal 1 item.');
  for (const line of lines) {
    if (line.qty <= 0) throw new AppError(`Jumlah untuk "${line.name}" harus lebih dari 0.`);
    if (line.price < 0) throw new AppError(`Harga untuk "${line.name}" tidak valid.`);
  }
  if (!customer || !customer.name || !customer.name.trim()) throw new AppError('Nama pelanggan wajib diisi.');
  try {
    const existing = await db.get('sales', saleId);
    if (!existing) throw new AppError('Nota tidak ditemukan.');

    const subtotal = calculateSubtotal(lines);
    const adj = adjustments || existing.adjustments || { ...defaultAdjustments(), discount: { enabled: discountAmount > 0, mode: 'amount', value: discountAmount } };
    const calc = computeAdjustments(subtotal, adj);
    const allPayments = await db.getByIndex('payments', 'saleId', saleId);
    const paidAmount = allPayments.reduce((s, p) => s + p.amount, 0);

    await syncCustomerMasterRecord(customer);

    const updatedSale = {
      ...existing,
      customerId: customer.id || null,
      customerName: customer.name,
      customerPhone: customer.phone || '',
      customerAddress: customer.address || '',
      saleDate: saleDate || existing.saleDate,
      saleTime: saleTime || existing.saleTime,
      subtotal,
      discountAmount: calc.discountAmount,
      taxAmount: calc.taxAmount,
      tax2Amount: calc.tax2Amount,
      shippingAmount: calc.shippingAmount,
      otherAmount: calc.otherAmount,
      otherLabel: adj.other?.label || '',
      adjustments: adj,
      total: calc.total,
      note,
      status: resolveStatus(calc.total, paidAmount),
      updatedAt: new Date().toISOString(),
    };

    const newItems = lines.map((l, i) => ({
      id: uid(),
      saleId,
      productId: l.productId || null,
      productName: l.name,
      unit: l.unit || '',
      qty: l.qty,
      price: l.price,
      subtotal: l.qty * l.price,
      note: l.note || '',
      sortOrder: i,
    }));

    // Ganti seluruh baris item lama dengan yang baru (lebih sederhana &
    // aman daripada mencocokkan satu-satu item mana yang berubah).
    const writes = { sales: [updatedSale], saleItems: newItems };
    const productUpdates = await getSaleProductPriceUpdates(lines);
    if (productUpdates.length) writes.products = productUpdates;
    await db.removeByIndex('saleItems', 'saleId', saleId);
    await db.bulkPutMulti(writes);
  } catch (e) {
    if (e instanceof AppError) throw e;
    console.error('[SaleService.updateSale]', e);
    throw new AppError('Gagal menyimpan perubahan nota. Silakan coba lagi.');
  }
}

export async function deleteSale(saleId) {
  try {
    const sale = await db.get('sales', saleId);
    if (!sale) return;
    sale.isDeleted = 1;
    sale.deletedAt = new Date().toISOString();
    sale.updatedAt = new Date().toISOString();
    await db.put('sales', sale);
    await recordAudit('trash', 'sale', saleId, `Nota ${sale.invoiceNumber} dipindahkan ke tempat sampah`);
  } catch (e) {
    console.error('[SaleService.deleteSale]', e);
    throw new AppError('Gagal menghapus data. Silakan coba lagi.');
  }
}

export async function duplicateSale(saleId) {
  const source = await getSaleSummary(saleId);
  if (!source) throw new AppError('Nota tidak ditemukan.');
  const items = await db.getByIndex('saleItems', 'saleId', saleId);
  const lines = items.map((item) => ({ productId: item.productId, name: item.productName, unit: item.unit, qty: item.qty, price: item.price, note: item.note }));
  const id = await createSale({
    customer: { id: source.sale.customerId, name: source.sale.customerName, phone: source.sale.customerPhone, address: source.sale.customerAddress },
    lines, adjustments: source.sale.adjustments, saleDate: todayDbDate(), saleTime: timeLabel(new Date()), note: source.sale.note || '',
  });
  await recordAudit('duplicate', 'sale', id, `Salinan dari nota ${source.sale.invoiceNumber}`);
  return id;
}

/**
 * Status mengikuti jumlah pembayaran, termasuk pelunasan otomatis yang
 * benar-benar dicatat di tabel pembayaran oleh applyAutoLunasRule.
 */
export function computeDisplayStatus(sale, paidAmount) {
  return resolveStatus(sale.total, paidAmount);
}

/** Tandai nota selesai dikerjakan/diambil atau belum — independen dari status pembayaran. */
export async function setCompleted(saleId, completed) {
  let sale = await db.get('sales', saleId);
  if (!sale) return;
  // Reopening an auto-paid order is an explicit correction, so cancel that
  // automatic assumption as well rather than closing it again on the next read.
  if (!completed && sale.autoMarkedPaid) {
    await revertAutoLunas(saleId);
    sale = await db.get('sales', saleId);
  }
  sale.completed = completed ? 1 : 0;
  if (!completed) {
    sale.completedOverridden = 1;
    sale.autoCompleted = 0;
  }
  sale.updatedAt = new Date().toISOString();
  await db.put('sales', sale);
}

// One run for payment + completion; never reuse an old changed-count as a new event.
let automaticStatusRun = null;
let lastSuccessfulCheck = null;
let autoCacheGeneration = 0;
const AUTO_STATUS_CACHE_DURATION_MS = 30000;

export function applyAutomaticStatusRules() {
  if (automaticStatusRun) return automaticStatusRun;
  const today = todayDbDate();
  const now = Date.now();
  const revision = db.salePaymentRevision();
  if (lastSuccessfulCheck &&
      lastSuccessfulCheck.day === today &&
      lastSuccessfulCheck.revision === revision &&
      lastSuccessfulCheck.generation === autoCacheGeneration &&
      now - lastSuccessfulCheck.time >= 0 &&
      now - lastSuccessfulCheck.time < AUTO_STATUS_CACHE_DURATION_MS) {
    return Promise.resolve(0);
  }
  const generation = autoCacheGeneration;
  automaticStatusRun = db.mutateSettlementBatch(
    sale => isSettlementDue(sale, today),
    (sales, payments) => settlementChanges(sales, payments, today, new Date().toISOString()),
  ).then(changed => {
    lastSuccessfulCheck = { day: today, revision: db.salePaymentRevision(), generation, time: Date.now() };
    return changed;
  }).catch(error => {
    lastSuccessfulCheck = null; // a failed run must be retryable immediately
    throw error;
  }).finally(() => { automaticStatusRun = null; });
  return automaticStatusRun;
}

// Compatibility for callers: both rules now commit as a single atomic batch.
export function applyAutoLunasRule() { return applyAutomaticStatusRules(); }
export function applyAutoCompleteRule() { return applyAutomaticStatusRules(); }

export function invalidateAutoStatusCache() {
  autoCacheGeneration++;
  lastSuccessfulCheck = null;
}

/** Batalkan status LUNAS otomatis (user tahu kalau nota itu SUNGGUH belum dibayar). */
export async function revertAutoLunas(saleId) {
  await db.mutateSalePayments(saleId, (sale, payments) => {
    const removeIds = payments.filter(p => p.isAutomatic).map(p => p.id);
    const paidAmount = payments.filter(p => !p.isAutomatic).reduce((sum, p) => sum + p.amount, 0);
    sale.autoMarkedPaid = 0;
    sale.autoLunasOverridden = 1;
    if (sale.autoCompleted) { sale.completed = 0; sale.autoCompleted = 0; }
    return { sale: { ...sale, status: resolveStatus(sale.total, paidAmount), updatedAt: new Date().toISOString() }, removeIds };
  });
}

/** Ambil nota + agregat sudah-dibayar (setara SaleSummary Flutter). */
export async function getSaleSummary(saleId) {
  await applyAutomaticStatusRules();
  const sale = await db.get('sales', saleId);
  if (!sale) return null;
  const payments = await db.getByIndex('payments', 'saleId', saleId);
  const paidAmount = payments.reduce((s, p) => s + p.amount, 0);
  return { sale, paidAmount, remaining: sale.total - paidAmount, payments, displayStatus: computeDisplayStatus(sale, paidAmount) };
}

/**
 * @param {string} sortBy 'pickup' (tanggal pengambilan, default) | 'created' (tanggal/waktu nota dibuat)
 * @param {boolean} onlyIncomplete kalau true, hanya kembalikan nota yang BELUM ditandai selesai
 */
export async function getAllSaleSummaries({ search = '', dateFrom = null, dateTo = null, sortBy = 'pickup', onlyIncomplete = false } = {}) {
  await applyAutomaticStatusRules();
  let sales = await db.getAll('sales');
  sales = sales.filter((s) => !s.isDeleted);
  if (onlyIncomplete) sales = sales.filter((s) => !s.completed);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    sales = sales.filter((s) => s.customerName.toLowerCase().includes(q) || s.invoiceNumber.toLowerCase().includes(q));
  }
  if (dateFrom) sales = sales.filter((s) => s.saleDate >= dateFrom);
  if (dateTo) sales = sales.filter((s) => s.saleDate <= dateTo);

  if (sortBy === 'created') {
    sales.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } else {
    sales.sort((a, b) => (b.saleDate + b.saleTime).localeCompare(a.saleDate + a.saleTime) || b.createdAt.localeCompare(a.createdAt));
  }

  const allPayments = await db.getAll('payments');
  const paidBySale = new Map();
  for (const p of allPayments) paidBySale.set(p.saleId, (paidBySale.get(p.saleId) || 0) + p.amount);

  return sales.map((sale) => {
    const paidAmount = paidBySale.get(sale.id) || 0;
    return { sale, paidAmount, remaining: sale.total - paidAmount, displayStatus: computeDisplayStatus(sale, paidAmount) };
  });
}
