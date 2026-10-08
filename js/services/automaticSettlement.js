import { resolveStatus } from './saleCalculation.js';

// Calendar days in the device's local date: pickup yesterday becomes due today.
export function isPickupDatePassed(sale, today) {
  const pickup = Date.parse(`${sale.saleDate}T00:00:00Z`);
  const day = Date.parse(`${today}T00:00:00Z`);
  return day - pickup >= 86400000;
}

export function isSettlementDue(sale, today) {
  const pickupConfirmed = sale.processStatus === 'PICKED_UP';
  return !sale.isDeleted
    && (pickupConfirmed || isPickupDatePassed(sale, today))
    && (!sale.autoLunasOverridden || pickupConfirmed);
}

// Runs inside one IndexedDB transaction. O(sales + payments), no per-sale reads.
export function settlementChanges(sales, payments, today, timestamp) {
  const updates = [], additions = [], removeIds = [];
  const EPSILON = 0.01;
  const paymentsBySale = new Map();
  for (const payment of payments) {
    const salePayments = paymentsBySale.get(payment.saleId) || [];
    salePayments.push(payment);
    paymentsBySale.set(payment.saleId, salePayments);
  }
  for (const current of sales) {
    if (!isSettlementDue(current, today)) continue;
    const sale = { ...current };
    const datePassed = isPickupDatePassed(sale, today);
    const id = `auto-lunas:${sale.id}`;
    const salePayments = paymentsBySale.get(sale.id) || [];
    // Jangan ikut menghitung pelunasan otomatis saat menentukan sisa manual.
    // Ini penting untuk memperbaiki payment otomatis lama yang nominalnya salah.
    const automaticPayments = salePayments.filter((payment) => payment.isAutomatic || payment.id === id);
    const manualPaid = salePayments
      .filter((payment) => !automaticPayments.includes(payment))
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const remaining = Number(sale.total) - manualPaid;
    if (!Number.isFinite(remaining)) continue;
    let changed = false;
    let settledPaid = manualPaid;
    const targetAutomaticAmount = Math.max(0, remaining);
    const existingAutomatic = automaticPayments.find((payment) => payment.id === id) || automaticPayments[0];

    if (targetAutomaticAmount > EPSILON) {
      if (existingAutomatic) {
        // Repair nominal pelunasan otomatis yang tersimpan tidak sesuai sisa.
        if (Math.abs(Number(existingAutomatic.amount || 0) - targetAutomaticAmount) > EPSILON || existingAutomatic.id !== id || !existingAutomatic.isAutomatic) {
          additions.push({ ...existingAutomatic, id, amount: targetAutomaticAmount, saleId: sale.id,
            paymentDate: sale.saleDate, paymentTime: sale.saleTime || '00:00',
            note: 'Pelunasan otomatis saat pengambilan', isAutomatic: true, updatedAt: timestamp });
          changed = true;
        }
        for (const payment of automaticPayments) {
          if (payment.id !== id) {
            removeIds.push(payment.id);
            changed = true;
          }
        }
      } else {
        additions.push({ id, saleId: sale.id, amount: targetAutomaticAmount,
          paymentDate: sale.saleDate, paymentTime: sale.saleTime || '00:00',
          note: 'Pelunasan otomatis saat pengambilan', isAutomatic: true, createdAt: timestamp });
        changed = true;
      }
      settledPaid += targetAutomaticAmount;
    } else {
      // Pembayaran manual sudah lunas/lebih bayar; hapus catatan auto-lunas
      // yang mungkin tertinggal agar total pembayaran tidak membengkak.
      for (const payment of automaticPayments) {
        removeIds.push(payment.id);
        changed = true;
      }
      if (sale.autoMarkedPaid || sale.autoPaymentRecorded) {
        sale.autoMarkedPaid = 0;
        sale.autoPaymentRecorded = 0;
        changed = true;
      }
    }

    if (targetAutomaticAmount > EPSILON && !sale.autoMarkedPaid) {
      sale.autoMarkedPaid = 1;
      changed = true;
    }
    const shouldFinalize = Boolean(datePassed || sale.autoMarkedPaid || targetAutomaticAmount > EPSILON || automaticPayments.length);
    if (shouldFinalize) {
      // Nota tanpa total tetap dianggap lunas setelah tanggal pengambilan.
      const status = Number(sale.total) <= 0 ? 'PAID' : resolveStatus(sale.total, settledPaid);
      if (targetAutomaticAmount > EPSILON && (!sale.autoPaymentRecorded || sale.status !== status)) {
        sale.autoPaymentRecorded = 1;
        sale.status = status;
        changed = true;
      } else if (targetAutomaticAmount <= EPSILON && sale.status !== status) {
        sale.status = status;
        changed = true;
      }
      if (datePassed && ['PAID', 'OVERPAID'].includes(status) && (!sale.completed || sale.processStatus !== 'PICKED_UP')) {
        sale.autoCompleted = 1;
        sale.completed = 1;
        sale.processStatus = 'PICKED_UP';
        changed = true;
      }
    }
    if (changed) updates.push({ ...sale, updatedAt: timestamp });
  }
  return { sales: updates, payments: additions, removeIds };
}
