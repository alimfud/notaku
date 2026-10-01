import { resolveStatus } from './saleCalculation.js';

// Calendar days in the device's local date: pickup yesterday becomes due today.
export function isSettlementDue(sale, today) {
  const pickup = Date.parse(`${sale.saleDate}T00:00:00Z`);
  const day = Date.parse(`${today}T00:00:00Z`);
  return !sale.isDeleted && !sale.autoLunasOverridden && day - pickup >= 86400000;
}

// Runs inside one IndexedDB transaction. O(sales + payments), no per-sale reads.
export function settlementChanges(sales, payments, today, timestamp) {
  const totals = new Map();
  const paymentIds = new Set();
  for (const payment of payments) {
    totals.set(payment.saleId, (totals.get(payment.saleId) || 0) + Number(payment.amount));
    paymentIds.add(payment.id);
  }
  const updates = [], additions = [];
  for (const current of sales) {
    if (!isSettlementDue(current, today)) continue;
    const sale = { ...current };
    const paid = totals.get(sale.id) || 0;
    const remaining = Number(sale.total) - paid;
    if (!Number.isFinite(remaining)) continue;
    const id = `auto-lunas:${sale.id}`;
    const recorded = paymentIds.has(id);
    let changed = false;
    let settledPaid = paid;
    // Also repair old versions that saved the sale flag before the payment.
    if (remaining > 0.5 && !recorded && (!sale.autoPaymentRecorded || sale.autoMarkedPaid)) {
      additions.push({ id, saleId: sale.id, amount: remaining,
        paymentDate: sale.saleDate, paymentTime: sale.saleTime || '00:00',
        note: 'Pelunasan otomatis saat pengambilan', isAutomatic: true, createdAt: timestamp });
      sale.autoMarkedPaid = 1;
      settledPaid += remaining;
      changed = true;
    }
    if (!sale.autoMarkedPaid) continue; // manual paid/overpaid orders are left alone
    const status = resolveStatus(sale.total, settledPaid);
    if (!sale.autoPaymentRecorded || sale.status !== status) {
      sale.autoPaymentRecorded = 1;
      sale.status = status;
      changed = true;
    }
    if (['PAID', 'OVERPAID'].includes(status) && !sale.completed) {
      sale.autoCompleted = 1;
      sale.completed = 1;
      changed = true;
    }
    if (changed) updates.push({ ...sale, updatedAt: timestamp });
  }
  return { sales: updates, payments: additions };
}
