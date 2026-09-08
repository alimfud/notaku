// saleService.js — orkestrasi nota: validasi -> hitung -> nomor invoice -> simpan.

import * as db from '../db.js';
import { uid, dbDate, timeLabel } from '../format.js';
import { calculateSubtotal, calculateTotal, resolveStatus } from './saleCalculation.js';
import { generateAndAdvance } from './invoiceNumber.js';

export class AppError extends Error {
  constructor(message) {
    super(message);
    this.userMessage = message;
  }
}

export async function createSale({ customer, lines, discountAmount = 0, initialPayment = 0, note = '' }) {
  if (!lines.length) throw new AppError('Transaksi harus mempunyai minimal 1 item.');
  for (const line of lines) {
    if (line.qty <= 0) throw new AppError(`Jumlah untuk "${line.name}" harus lebih dari 0.`);
    if (line.price < 0) throw new AppError(`Harga untuk "${line.name}" tidak valid.`);
  }
  if (initialPayment < 0) throw new AppError('Jumlah pembayaran tidak valid.');

  try {
    const now = new Date();
    const subtotal = calculateSubtotal(lines);
    const total = calculateTotal(subtotal, discountAmount);
    const status = resolveStatus(total, initialPayment);
    const invoiceNumber = await generateAndAdvance(now);
    const saleId = uid();

    const sale = {
      id: saleId,
      invoiceNumber,
      customerId: customer.id || null,
      customerName: customer.name,
      customerPhone: customer.phone || '',
      customerAddress: customer.address || '',
      saleDate: dbDate(now),
      saleTime: timeLabel(now),
      subtotal,
      discountAmount,
      total,
      note,
      status,
      isDeleted: 0,
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
    const updated = { ...existing, amount, paymentDate: paymentDate || existing.paymentDate, paymentTime: paymentTime || existing.paymentTime, note: note ?? existing.note };
    await db.put('payments', updated);
    await recomputeSaleStatus(existing.saleId);
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
    await db.remove('payments', paymentId);
    await recomputeSaleStatus(existing.saleId);
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
export async function updateSale(saleId, { customer, lines, discountAmount = 0, saleDate, saleTime, note = '' }) {
  if (!lines.length) throw new AppError('Transaksi harus mempunyai minimal 1 item.');
  for (const line of lines) {
    if (line.qty <= 0) throw new AppError(`Jumlah untuk "${line.name}" harus lebih dari 0.`);
    if (line.price < 0) throw new AppError(`Harga untuk "${line.name}" tidak valid.`);
  }
  try {
    const existing = await db.get('sales', saleId);
    if (!existing) throw new AppError('Nota tidak ditemukan.');

    const subtotal = calculateSubtotal(lines);
    const total = calculateTotal(subtotal, discountAmount);
    const allPayments = await db.getByIndex('payments', 'saleId', saleId);
    const paidAmount = allPayments.reduce((s, p) => s + p.amount, 0);

    const updatedSale = {
      ...existing,
      customerId: customer.id || null,
      customerName: customer.name,
      customerPhone: customer.phone || '',
      customerAddress: customer.address || '',
      saleDate: saleDate || existing.saleDate,
      saleTime: saleTime || existing.saleTime,
      subtotal,
      discountAmount,
      total,
      note,
      status: resolveStatus(total, paidAmount),
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

/** Ambil nota + agregat sudah-dibayar (setara SaleSummary Flutter). */
export async function getSaleSummary(saleId) {
  const sale = await db.get('sales', saleId);
  if (!sale) return null;
  const payments = await db.getByIndex('payments', 'saleId', saleId);
  const paidAmount = payments.reduce((s, p) => s + p.amount, 0);
  return { sale, paidAmount, remaining: sale.total - paidAmount, payments };
}

export async function getAllSaleSummaries({ search = '', dateFrom = null, dateTo = null } = {}) {
  let sales = await db.getAll('sales');
  sales = sales.filter((s) => !s.isDeleted);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    sales = sales.filter((s) => s.customerName.toLowerCase().includes(q) || s.invoiceNumber.toLowerCase().includes(q));
  }
  if (dateFrom) sales = sales.filter((s) => s.saleDate >= dateFrom);
  if (dateTo) sales = sales.filter((s) => s.saleDate <= dateTo);
  sales.sort((a, b) => (b.saleDate + b.saleTime).localeCompare(a.saleDate + a.saleTime) || b.createdAt.localeCompare(a.createdAt));

  const allPayments = await db.getAll('payments');
  const paidBySale = new Map();
  for (const p of allPayments) paidBySale.set(p.saleId, (paidBySale.get(p.saleId) || 0) + p.amount);

  return sales.map((sale) => {
    const paidAmount = paidBySale.get(sale.id) || 0;
    return { sale, paidAmount, remaining: sale.total - paidAmount };
  });
}
