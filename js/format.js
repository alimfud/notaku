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
