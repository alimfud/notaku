// format.js — formatter mata uang & tanggal. Semua tampilan uang/tanggal WAJIB
// lewat sini supaya konsisten (setara AppFormatters di versi Flutter).

export function rupiah(value) {
  const rounded = Math.round(value || 0);
  const neg = rounded < 0;
  const str = Math.abs(rounded).toString();
  let out = '';
  for (let i = 0; i < str.length; i++) {
    if (i > 0 && (str.length - i) % 3 === 0) out += '.';
    out += str[i];
  }
  return (neg ? '-Rp' : 'Rp') + out;
}

/** yyyy-MM-dd -> Date */
export function parseDbDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Date -> yyyy-MM-dd (dipakai sebagai key tersimpan, bisa diurutkan sebagai string) */
export function dbDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Date -> HH:mm */
export function timeLabel(date) {
  return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
}

const MONTHS_ID = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

/** yyyy-MM-dd -> "19 Agu 2026" */
export function dateShort(dbDateStr) {
  if (!dbDateStr) return '-';
  const d = parseDbDate(dbDateStr);
  return `${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
}

export function todayDbDate() {
  return dbDate(new Date());
}

export function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const a = parts[0] ? parts[0][0] : '';
  const b = parts[1] ? parts[1][0] : '';
  return (a + b).toUpperCase();
}

export function qtyLabel(qty) {
  return qty === Math.round(qty) ? String(Math.round(qty)) : String(qty);
}

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

/** "085156657771" -> "*********771" (tampilkan cuma 3 digit terakhir). */
export function maskPhone(phone) {
  if (!phone) return '';
  const digits = phone.trim();
  if (digits.length <= 3) return digits;
  return '*'.repeat(digits.length - 3) + digits.slice(-3);
}

/** ISO datetime -> "09/09/2026 21:12:16" (dipakai untuk stempel "terakhir diperbarui" di catatan kaki struk). */
export function fullDateTimeLabel(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}`;
}

/** Ubah nomor telepon lokal (mis. "0851...") jadi format internasional untuk link wa.me (mis. "6285..."). */
export function toWhatsAppNumber(phone) {
  const digits = (phone || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  return digits.startsWith('0') ? '62' + digits.slice(1) : digits;
}

/**
 * Ganti token [printed_datetime] pada catatan kaki struk dengan tanggal & jam
 * TERAKHIR NOTA DIPERBARUI (bukan waktu mencetak) — begitu ada penambahan
 * pembayaran atau nota diedit, tanggal/jam ini ikut ter-update, TAPI nomor
 * invoice tetap seperti semula (tidak pernah berubah setelah dibuat).
 */
export function resolveFooterNote(footerNote, updatedAtIso) {
  if (!footerNote) return '';
  return footerNote.replace(/\[printed_datetime\]/gi, fullDateTimeLabel(updatedAtIso));
}
