// saleService.js — orkestrasi nota: validasi -> hitung -> nomor invoice -> simpan.

import * as db from '../db.js';
import { uid, dbDate, timeLabel, todayDbDate } from '../format.js';
import { calculateSubtotal, computeAdjustments, defaultAdjustments, resolveStatus } from './saleCalculation.js';
import { generateAndAdvance } from './invoiceNumber.js';
import { saveCustomer } from './customerService.js';

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
      autoMarkedPaid: 0,   // true kalau LUNAS ini hasil aturan otomatis (2 hari lewat tgl pengambilan), bukan input manual
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
    await db.removeByIndex('saleItems', 'saleId', saleId);
    await db.bulkPutMulti({ sales: [updatedSale], saleItems: newItems });
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
    sale.updatedAt = new Date().toISOString();
    await db.put('sales', sale);
  } catch (e) {
    console.error('[SaleService.deleteSale]', e);
    throw new AppError('Gagal menghapus data. Silakan coba lagi.');
  }
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

/**
 * Aturan otomatis: setelah lewat minimal 2 hari dari TANGGAL PENGAMBILAN dan
 * nota telah mendapat status LUNAS OTOMATIS, nota ikut ditandai SELESAI.
 * Termasuk nota LUNAS otomatis lama yang belum ikut ditandai selesai.
 */
export async function applyAutoCompleteRule() {
  const sales = (await db.getAll('sales')).filter(s => !s.isDeleted && !s.completed && s.autoMarkedPaid);
  const todayMs = Date.parse(todayDbDate() + 'T00:00:00Z');
  let changed = 0;
  for (const candidate of sales) {
    const updated = await db.mutateSalePayments(candidate.id, (sale, payments) => {
      if (sale.isDeleted || sale.completed || !sale.autoMarkedPaid) return null;
      const paid = payments.reduce((sum, p) => sum + p.amount, 0);
      const status = resolveStatus(sale.total, paid);
      const daysPast = Math.floor((todayMs - Date.parse(sale.saleDate + 'T00:00:00Z')) / 86400000);
      if (!(daysPast >= 2) || !['PAID', 'OVERPAID'].includes(status)) return null;
      return { sale: { ...sale, status, completed: 1, autoCompleted: 1, updatedAt: new Date().toISOString() } };
    });
    if (updated) changed++;
  }
  return changed;
}

/**
 * Aturan otomatis: kalau sudah lewat >= 2 hari dari TANGGAL PENGAMBILAN dan
 * nota belum lunas, anggap LUNAS (asumsi: pelanggan sudah bayar saat ambil,
 * tokonya cuma lupa mencatat). Dipanggil saat aplikasi dibuka (lihat app.js).
 * Nota yang PERNAH dibatalkan manual oleh user (autoLunasOverridden) tidak
 * akan disentuh lagi oleh aturan ini selamanya — keputusan manual dihormati.
 */
export async function applyAutoLunasRule() {
  const sales = (await db.getAll('sales')).filter(s => !s.isDeleted && !s.autoLunasOverridden && !s.autoPaymentRecorded);
  const todayMs = Date.parse(todayDbDate() + 'T00:00:00Z');
  let changed = 0;
  for (const candidate of sales) {
    if (!(todayMs - Date.parse(candidate.saleDate + 'T00:00:00Z') >= 2 * 86400000)) continue;
    const updated = await db.mutateSalePayments(candidate.id, (sale, payments) => {
      if (sale.isDeleted || sale.autoLunasOverridden || sale.autoPaymentRecorded) return null;
      if (!(todayMs - Date.parse(sale.saleDate + 'T00:00:00Z') >= 2 * 86400000)) return null;
      const paid = payments.reduce((sum, p) => sum + p.amount, 0);
      const remaining = sale.total - paid;
      const now = new Date().toISOString();
      // A deterministic ID plus the shared read/write transaction prevents
      // duplicate payments when several tabs open or legacy data is repaired.
      const id = `auto-lunas:${sale.id}`;
      const recorded = payments.find(p => p.id === id);
      if (recorded || remaining <= 0.5) {
        if (!sale.autoMarkedPaid) return null;
        return { sale: { ...sale, autoPaymentRecorded: 1, status: resolveStatus(sale.total, paid), updatedAt: now } };
      }
      return {
        sale: { ...sale, autoMarkedPaid: 1, autoPaymentRecorded: 1, status: 'PAID', completed: 1, autoCompleted: sale.completed ? (sale.autoCompleted || 0) : 1, updatedAt: now },
        payments: [{ id, saleId: sale.id, amount: remaining, paymentDate: sale.saleDate, paymentTime: sale.saleTime || '00:00', note: 'Pelunasan otomatis saat pengambilan', isAutomatic: true, createdAt: now }],
      };
    });
    if (updated) changed++;
  }
  return changed;
}

// Serialize concurrent page/background checks to avoid stale overlapping writes.
let automaticStatusRun = null;
export function applyAutomaticStatusRules() {
  if (!automaticStatusRun) {
    automaticStatusRun = (async () => {
      const paid = await applyAutoLunasRule();
      const completed = await applyAutoCompleteRule();
      return paid + completed;
    })().finally(() => { automaticStatusRun = null; });
  }
  return automaticStatusRun;
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
