// saleCalculation.js — kalkulasi murni (tanpa efek samping), setara
// SaleCalculationService di versi Flutter. Dipisah supaya gampang diuji.

export const STATUS = {
  UNPAID: 'UNPAID',
  PARTIAL: 'PARTIAL',
  PAID: 'PAID',
  OVERPAID: 'OVERPAID',
};

export function calculateSubtotal(lines) {
  return lines.reduce((sum, l) => sum + l.qty * l.price, 0);
}

export function calculateTotal(subtotal, discountAmount) {
  const total = subtotal - discountAmount;
  return total < 0 ? 0 : total;
}

export function calculateRemaining(total, paidAmount) {
  return total - paidAmount;
}

/**
 * Kalkulasi "Tambahan" (Diskon, Pajak, Pajak #2, Ongkos Kirim, Lain-lain) di
 * atas subtotal. Setiap komponen independen dan opsional (enabled: false
 * berarti tidak dihitung sama sekali, bukan cuma nilai 0).
 *
 * `adjustments` shape:
 * {
 *   discount: { enabled, mode: 'amount'|'percent', value },
 *   tax:      { enabled, percent, inclusive },
 *   tax2:     { enabled, percent, inclusive },
 *   shipping: { enabled, amount },
 *   other:    { enabled, label, amount },
 * }
 *
 * Pajak "inclusive" berarti pajak itu SUDAH termasuk di harga barang (cuma
 * dihitung buat ditampilkan sebagai rincian), jadi TIDAK ditambahkan lagi ke
 * total. Pajak non-inclusive dihitung dari (subtotal - diskon) dan
 * ditambahkan ke total seperti biasa.
 */
export function computeAdjustments(subtotal, adjustments = {}) {
  const d = adjustments.discount || { enabled: false };
  const t1 = adjustments.tax || { enabled: false };
  const t2 = adjustments.tax2 || { enabled: false };
  const ship = adjustments.shipping || { enabled: false };
  const other = adjustments.other || { enabled: false };

  let discountAmount = 0;
  if (d.enabled) {
    discountAmount = d.mode === 'percent' ? subtotal * (Number(d.value) || 0) / 100 : (Number(d.value) || 0);
  }
  discountAmount = Math.min(Math.max(discountAmount, 0), subtotal);

  const afterDiscount = subtotal - discountAmount;

  const taxAmount = t1.enabled ? afterDiscount * (Number(t1.percent) || 0) / 100 : 0;
  const tax2Amount = t2.enabled ? afterDiscount * (Number(t2.percent) || 0) / 100 : 0;
  const shippingAmount = ship.enabled ? (Number(ship.amount) || 0) : 0;
  const otherAmount = other.enabled ? (Number(other.amount) || 0) : 0;

  const taxAddToTotal = t1.enabled && !t1.inclusive ? taxAmount : 0;
  const tax2AddToTotal = t2.enabled && !t2.inclusive ? tax2Amount : 0;

  const total = Math.max(0, afterDiscount + taxAddToTotal + tax2AddToTotal + shippingAmount + otherAmount);

  return {
    subtotal, discountAmount, afterDiscount,
    taxAmount, tax2Amount, taxAddToTotal, tax2AddToTotal,
    shippingAmount, otherAmount, total,
  };
}

export function defaultAdjustments() {
  return {
    discount: { enabled: false, mode: 'amount', value: 0 },
    tax: { enabled: false, percent: 0, inclusive: false },
    tax2: { enabled: false, percent: 0, inclusive: false },
    shipping: { enabled: false, amount: 0 },
    other: { enabled: false, label: '', amount: 0 },
  };
}

export function resolveStatus(total, paidAmount) {
  if (paidAmount <= 0) return STATUS.UNPAID;
  if (paidAmount < total) return STATUS.PARTIAL;
  if (paidAmount > total) return STATUS.OVERPAID;
  return STATUS.PAID;
}

export function isValidLine(line) {
  return line.qty > 0 && line.price >= 0;
}

export function isValidPayment(amount) {
  return amount >= 0;
}

export const STATUS_LABEL = {
  UNPAID: 'BELUM BAYAR',
  PARTIAL: 'SEBAGIAN',
  PAID: 'LUNAS',
  OVERPAID: 'LEBIH BAYAR',
};
