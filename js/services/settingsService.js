// settingsService.js — pengaturan toko (satu baris, id = 1).

import * as db from '../db.js';

const DEFAULTS = {
  id: 1,
  storeName: 'Toko Saya',
  storeAddress: '',
  storePhone: '',
  footerNote: 'Terima kasih atas kunjungan Anda.',
  invoicePrefix: 'INV-',
  invoiceDigitCount: 5,
  invoiceNextNumber: 1,
  invoiceResetMode: 'NEVER', // NEVER | DAILY | MONTHLY
  invoiceLastResetDate: '',
  paperSize: 'THERMAL_58MM', // THERMAL_58MM | THERMAL_80MM | PDF_A4
};

let _cache = null;

export async function getSettings() {
  if (_cache) return _cache;
  const existing = await db.get('settings', 1);
  if (existing) {
    _cache = { ...DEFAULTS, ...existing };
    return _cache;
  }
  await db.put('settings', DEFAULTS);
  _cache = { ...DEFAULTS };
  return _cache;
}

export async function saveSettings(partial) {
  const current = await getSettings();
  const updated = { ...current, ...partial, id: 1 };
  await db.put('settings', updated);
  _cache = updated;
  return updated;
}

export function invalidateCache() {
  _cache = null;
}
