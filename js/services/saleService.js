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

    const sale = await db.get('sales', saleId);
    if (sale) {
      const allPayments = await db.getByIndex('payments', 'saleId', saleId);
      const paidAmount = allPayments.reduce((s, p) => s + p.amount, 0);
      sale.status = resolveStatus(sale.total, paidAmount);
      sale.updatedAt = now.toISOString();
      await db.put('sales', sale);
    }
  } catch (e) {
    if (e instanceof AppError) throw e;
    console.error('[SaleService.addPayment]', e);
    throw new AppError('Gagal mencatat pembayaran. Silakan coba lagi.');
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
