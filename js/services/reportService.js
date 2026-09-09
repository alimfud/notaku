// reportService.js

import * as db from '../db.js';
import { dbDate, todayDbDate } from '../format.js';
import { computeDisplayStatus } from './saleService.js';

export async function generateReport(period) {
  const now = new Date();
  let start, end, label;

  if (period === 'today') {
    start = end = todayDbDate();
    label = 'Hari Ini';
  } else if (period === 'week') {
    const day = now.getDay() === 0 ? 7 : now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day - 1));
    start = dbDate(monday);
    end = todayDbDate();
    label = 'Minggu Ini';
  } else {
    start = dbDate(new Date(now.getFullYear(), now.getMonth(), 1));
    end = todayDbDate();
    label = 'Bulan Ini';
  }

  const sales = (await db.getAll('sales')).filter((s) => !s.isDeleted && s.saleDate >= start && s.saleDate <= end);
  const revenue = sales.reduce((sum, s) => sum + s.total, 0);
  const transactionCount = sales.length;

  const allSales = (await db.getAll('sales')).filter((s) => !s.isDeleted);
  const allPayments = await db.getAll('payments');
  const paidBySale = new Map();
  for (const p of allPayments) paidBySale.set(p.saleId, (paidBySale.get(p.saleId) || 0) + p.amount);
  let totalReceivables = 0;
  for (const s of allSales) {
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
  const topProducts = [...productAgg.values()].sort((a, b) => b.qty - a.qty).slice(0, 10);

  return { periodLabel: label, revenue, transactionCount, totalReceivables, topProducts };
}

const MONTH_LABELS_ID = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

/**
 * Ringkasan OMSET KESELURUHAN (sepanjang waktu) + rincian per bulan & per
 * status pembayaran. Dipakai halaman Laporan bagian "Omset Keseluruhan".
 */
export async function generateAllTimeSummary() {
  const sales = (await db.getAll('sales')).filter((s) => !s.isDeleted);
  const allPayments = await db.getAll('payments');
  const paidBySale = new Map();
  for (const p of allPayments) paidBySale.set(p.saleId, (paidBySale.get(p.saleId) || 0) + p.amount);

  const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
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
    totalTransactions,
    totalPaidCollected,
    totalReceivables,
    autoMarkedCount,
    statusBreakdown,
    monthlyBreakdown,
  };
}
