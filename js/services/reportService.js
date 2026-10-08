// reportService.js

import * as db from '../db.js';
import { dbDate, todayDbDate } from '../format.js';
import { computeDisplayStatus, applyAutomaticStatusRules } from './saleService.js';

function orderDate(sale) {
  // Legacy imports set createdAt to import time, not the source nota date.
  if (String(sale.id).startsWith('legacy-tbjual-')) return sale.saleDate;
  const created = new Date(sale.createdAt);
  return Number.isNaN(created.getTime()) ? '' : dbDate(created);
}

export async function generateReport(period, referenceDate = new Date()) {
  await applyAutomaticStatusRules();
  const now = new Date();
  const selected = referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
    ? new Date(referenceDate)
    : new Date(now);
  let start, end, label;

  if (period === 'orders-around-today') {
    const firstDay = new Date(now);
    firstDay.setDate(now.getDate() - 7);
    const lastDay = new Date(now);
    lastDay.setDate(now.getDate() + 7);
    start = dbDate(firstDay);
    end = dbDate(lastDay);
    label = '7 Hari Sebelum & Sesudah';
  } else if (period === 'today') {
    start = end = todayDbDate();
    label = 'Hari Ini';
  } else if (period === 'week') {
    const lastDay = new Date(now);
    lastDay.setDate(now.getDate() + 6);
    start = todayDbDate();
    end = dbDate(lastDay);
    label = '7 Hari';
  } else if (period === 'year') {
    const year = Math.min(selected.getFullYear(), now.getFullYear());
    start = `${year}-01-01`;
    end = year === now.getFullYear() ? todayDbDate() : `${year}-12-31`;
    label = `Tahun ${year}`;
  } else {
    const year = selected.getFullYear();
    const month = selected.getMonth();
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
    start = dbDate(new Date(year, month, 1));
    end = isCurrentMonth ? todayDbDate() : dbDate(new Date(year, month + 1, 0));
    label = `${MONTH_LABELS_ID[month]} ${year}`;
  }

  const saleDateKey = period === 'orders-around-today' ? orderDate : sale => sale.saleDate;
  const sales = (await db.getAll('sales')).filter(s => {
    const date = saleDateKey(s);
    return !s.isDeleted && date >= start && date <= end;
  });
  const expenses = await db.getAll('expenses');
  const periodExpenses = expenses.filter((e) => e.expenseDate >= start && e.expenseDate <= end);
  const revenue = sales.reduce((sum, s) => sum + s.total, 0);
  const expenseTotal = periodExpenses.reduce((sum, e) => sum + e.amount, 0);
  const transactionCount = sales.length;

  const allSales = (await db.getAll('sales')).filter((s) => !s.isDeleted);
  const allPayments = await db.getAll('payments');
  const paidBySale = new Map();
  for (const p of allPayments) paidBySale.set(p.saleId, (paidBySale.get(p.saleId) || 0) + p.amount);
  let totalReceivables = 0;
  for (const s of sales) {
    const paid = paidBySale.get(s.id) || 0;
    const status = computeDisplayStatus(s, paid);
    if (status === 'PAID' || status === 'OVERPAID') continue; // termasuk yang LUNAS otomatis
    if (s.total - paid > 0.5) totalReceivables += s.total - paid;
  }

  const saleIds = new Set(sales.map((s) => s.id));
  const allItems = await db.getAll('saleItems');
  const productAgg = new Map();
  for (const item of allItems) {
    if (!saleIds.has(item.saleId)) continue;
    const key = item.productName;
    const agg = productAgg.get(key) || { name: key, qty: 0, amount: 0 };
    agg.qty += item.qty;
    agg.amount += item.subtotal;
    productAgg.set(key, agg);
  }
  const soldProducts = [...productAgg.values()].sort((a, b) => b.qty - a.qty || b.amount - a.amount || String(a.name || '').localeCompare(String(b.name || '')));
  const topProducts = soldProducts.slice(0, 10);

  const activeIds = new Set(allSales.map(s => s.id));
  const periodPayments = allPayments.filter(p => activeIds.has(p.saleId) && p.paymentDate >= start && p.paymentDate <= end);
  const received = periodPayments.reduce((sum, p) => sum + p.amount, 0);
  const activity = new Map();
  const chartGranularity = period === 'year' ? 'month' : 'day';
  const cursor = new Date(start + 'T12:00:00');
  while (dbDate(cursor) <= end) {
    const date = dbDate(cursor);
    const key = chartGranularity === 'month' ? date.slice(0, 7) : date;
    if (!activity.has(key)) {
      activity.set(key, {
        date: chartGranularity === 'month' ? `${key}-01` : key,
        label: chartGranularity === 'month' ? `${MONTH_LABELS_ID[cursor.getMonth()]} ${cursor.getFullYear()}` : '',
        revenue: 0,
        expenses: 0,
        received: 0,
        count: 0,
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  const statusBreakdown = { PAID: 0, PARTIAL: 0, UNPAID: 0, OVERPAID: 0 };
  for (const sale of sales) {
    const saleDate = saleDateKey(sale);
    const day = activity.get(chartGranularity === 'month' ? saleDate.slice(0, 7) : saleDate);
    day.revenue += sale.total;
    day.count++;
    statusBreakdown[computeDisplayStatus(sale, paidBySale.get(sale.id) || 0)]++;
  }
  for (const payment of periodPayments) activity.get(chartGranularity === 'month' ? payment.paymentDate.slice(0, 7) : payment.paymentDate).received += payment.amount;
  for (const expense of periodExpenses) activity.get(chartGranularity === 'month' ? expense.expenseDate.slice(0, 7) : expense.expenseDate).expenses += expense.amount;
  return { periodLabel: label, start, end, received, daily: [...activity.values()], chartGranularity, statusBreakdown, revenue, expenseTotal, netIncome: revenue - expenseTotal, expenseCount: periodExpenses.length, transactionCount, totalReceivables, topProducts, soldProducts };
}

/** Ringkasan bulanan satu tahun untuk mini grafik finansial Dashboard. */
export async function generateAnnualTrend(year = new Date().getFullYear()) {
  await applyAutomaticStatusRules();
  const monthly = Array.from({ length: 12 }, (_, month) => ({ month, revenue: 0, expenses: 0, profit: 0 }));
  const yearPrefix = `${year}-`;
  const sales = (await db.getAll('sales')).filter((sale) => !sale.isDeleted && String(sale.saleDate || '').startsWith(yearPrefix));
  const expenses = (await db.getAll('expenses')).filter((expense) => String(expense.expenseDate || '').startsWith(yearPrefix));

  for (const sale of sales) {
    const month = Number(String(sale.saleDate).slice(5, 7)) - 1;
    if (month >= 0 && month < 12) monthly[month].revenue += Number(sale.total) || 0;
  }
  for (const expense of expenses) {
    const month = Number(String(expense.expenseDate).slice(5, 7)) - 1;
    if (month >= 0 && month < 12) monthly[month].expenses += Number(expense.amount) || 0;
  }
  for (const month of monthly) month.profit = month.revenue - month.expenses;
  return { year, monthly };
}

const MONTH_LABELS_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

/**
 * Ringkasan OMSET KESELURUHAN (sepanjang waktu) + rincian per bulan & per
 * status pembayaran. Dipakai halaman Laporan bagian "Omset Keseluruhan".
 */
export async function generateAllTimeSummary() {
  await applyAutomaticStatusRules();
  const sales = (await db.getAll('sales')).filter((s) => !s.isDeleted);
  const allPayments = await db.getAll('payments');
  const paidBySale = new Map();
  for (const p of allPayments) paidBySale.set(p.saleId, (paidBySale.get(p.saleId) || 0) + p.amount);

  const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
  const expenses = await db.getAll('expenses');
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalTransactions = sales.length;
  const totalPaidCollected = [...paidBySale.values()].reduce((s, v) => s + v, 0);

  const statusBreakdown = {
    PAID: { count: 0, amount: 0 },
    PARTIAL: { count: 0, amount: 0 },
    UNPAID: { count: 0, amount: 0 },
    OVERPAID: { count: 0, amount: 0 },
  };
  let totalReceivables = 0;
  let autoMarkedCount = 0;

  const monthlyMap = new Map(); // 'yyyy-MM' -> { revenue, count }
  for (const s of sales) {
    const paid = paidBySale.get(s.id) || 0;
    const status = computeDisplayStatus(s, paid);
    statusBreakdown[status].count += 1;
    statusBreakdown[status].amount += s.total;
    if (status !== 'PAID' && status !== 'OVERPAID' && s.total - paid > 0.5) totalReceivables += s.total - paid;
    if (s.autoMarkedPaid) autoMarkedCount += 1;

    const monthKey = s.saleDate.slice(0, 7);
    const agg = monthlyMap.get(monthKey) || { revenue: 0, count: 0 };
    agg.revenue += s.total;
    agg.count += 1;
    monthlyMap.set(monthKey, agg);
  }

  const monthlyBreakdown = [...monthlyMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, agg]) => {
      const [y, m] = key.split('-');
      return { monthKey: key, label: `${MONTH_LABELS_ID[Number(m) - 1]} ${y}`, revenue: agg.revenue, count: agg.count };
    });

  return {
    totalRevenue,
    totalExpenses,
    netIncome: totalRevenue - totalExpenses,
    totalExpenseCount: expenses.length,
    totalTransactions,
    totalPaidCollected,
    totalReceivables,
    autoMarkedCount,
    statusBreakdown,
    monthlyBreakdown,
  };
}
