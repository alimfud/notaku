// reportService.js

import * as db from '../db.js';
import { dbDate, todayDbDate } from '../format.js';

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
