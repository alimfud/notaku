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
