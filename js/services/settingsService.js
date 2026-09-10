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
  invoiceNumberFormat: 'DATETIME', // 'DATETIME' (prefix+YYMMDDHH) | 'SEQUENTIAL' (prefix+nomor urut)
  paperSize: 'THERMAL_58MM', // THERMAL_58MM | THERMAL_80MM | PDF_A4

  // Printer Bluetooth (BLE)
  btPrinterId: '',          // id perangkat Web Bluetooth yang terakhir tersambung (untuk sambung ulang otomatis)
  btPrinterName: '',
  btCharWidth: 32,          // 32 (58mm) atau 48 (80mm) karakter per baris

  // QRIS
  qrisEnabled: false,
  qrisImageData: '',        // base64 data URL gambar QRIS

  // Privasi data pelanggan di struk
  maskCustomerPhone: true,  // kalau true, nomor HP pelanggan di struk cuma tampil 3 digit terakhir

  // Auto backup ke Google Drive
  autoBackup: {
    enabled: false,
    driveConnected: false,
    driveAccountEmail: '',
    scheduleTimes: ['07:00', '12:00', '17:00'],
    deleteOlderThanDays: 30,
    confirmBeforeBackup: false,
    lastBackupAt: '',       // ISO datetime backup terakhir berhasil
    lastCheckedDate: '',    // yyyy-MM-dd, dipakai supaya tidak backup berkali-kali di hari yang sama untuk jam yang sama
    lastCheckedSlots: [],   // daftar jam yang SUDAH dieksekusi hari ini, direset saat lastCheckedDate berganti
  },
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
