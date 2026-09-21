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
 * Kalkulasi "Tambahan" (Diskon, Ongkos Kirim, Lain-lain) di
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
  const ship = adjustments.shipping || { enabled: false };
  const other = adjustments.other || { enabled: false };

  let discountAmount = 0;
  if (d.enabled) {
    discountAmount = d.mode === 'percent' ? subtotal * (Number(d.value) || 0) / 100 : (Number(d.value) || 0);
  }
  discountAmount = Math.min(Math.max(discountAmount, 0), subtotal);

  const afterDiscount = subtotal - discountAmount;

  const shippingAmount = ship.enabled ? (Number(ship.amount) || 0) : 0;
  const otherAmount = other.enabled ? (Number(other.amount) || 0) : 0;

  const total = Math.max(0, afterDiscount + shippingAmount + otherAmount);

  return {
    subtotal, discountAmount, afterDiscount,
    taxAmount: 0, tax2Amount: 0, taxAddToTotal: 0, tax2AddToTotal: 0,
    shippingAmount, otherAmount, total,
  };
}

export function defaultAdjustments() {
  return {
    discount: { enabled: false, mode: 'amount', value: 0 },
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
