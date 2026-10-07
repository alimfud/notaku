import * as db from '../db.js';
import { uid, todayDbDate } from '../format.js';
import { recordAudit } from './auditLogService.js';

export const EXPENSE_CATEGORIES = ['Transport', 'Gaji', 'Operasional', 'Lainnya'];
export const EXPENSE_METHODS = ['Tunai', 'Transfer'];

export async function getExpenses({ dateFrom, dateTo } = {}) {
  let rows = await db.getAll('expenses');
  if (dateFrom) rows = rows.filter((e) => e.expenseDate >= dateFrom);
  if (dateTo) rows = rows.filter((e) => e.expenseDate <= dateTo);
  return rows.sort((a, b) => (b.expenseDate + b.createdAt).localeCompare(a.expenseDate + a.createdAt));
}

function validate(data) {
  if (!data.title?.trim()) throw new Error('Judul pengeluaran wajib diisi.');
  if (!EXPENSE_CATEGORIES.includes(data.category)) throw new Error('Kategori pengeluaran tidak valid.');
  if (!(Number(data.amount) > 0)) throw new Error('Nominal pengeluaran harus lebih dari nol.');
  if (!data.expenseDate) throw new Error('Tanggal pengeluaran wajib diisi.');
  if (!EXPENSE_METHODS.includes(data.method)) throw new Error('Metode pengeluaran tidak valid.');
}

export async function saveExpense(data) {
  validate(data);
  const now = new Date().toISOString();
  const existing = data.id ? await db.get('expenses', data.id) : null;
  const row = {
    id: existing?.id || uid(), title: data.title.trim(), category: data.category,
    amount: Number(data.amount), expenseDate: data.expenseDate || todayDbDate(),
    method: data.method, note: data.note?.trim() || '',
    createdAt: existing?.createdAt || now, updatedAt: now,
  };
  await db.put('expenses', row);
  await recordAudit(data.id ? 'update' : 'create', 'expense', row.id, `${data.id ? 'Pengeluaran diperbarui' : 'Pengeluaran dibuat'}: ${row.title}`);
  return row;
}

export async function deleteExpense(id) { const expense = await db.get('expenses', id); await db.remove('expenses', id); await recordAudit('delete', 'expense', id, `Pengeluaran dihapus: ${expense?.title || id}`); }
