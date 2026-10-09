// settingsService.js — pengaturan toko (satu baris, id = 1).

import * as db from '../db.js';

const DEFAULTS = {
  id: 1,
  storeName: 'Toko Saya',
  storeAddress: '',
  storePhone: '',
  footerNote: 'Terima kasih atas kunjungan Anda.',
  storeLogoData: '',
  storeLogoMaxWidth: 100,
  showStoreNameOnReceipt: true,
  showStoreNameOnBluetooth: true,
  invoicePrefix: 'INV-',
  invoiceDigitCount: 2,
  invoiceNextNumber: 1,
  invoiceResetMode: 'MONTHLY', // NEVER | DAILY | MONTHLY (hanya dipakai mode SEQUENTIAL)
  invoiceLastResetDate: '',
  invoiceNumberFormat: 'DAILY_SEQUENCE', // prefix+YYMM+urutan bulanan | 'SEQUENTIAL' (prefix+nomor urut biasa)
  paperSize: 'THERMAL_58MM', // THERMAL_58MM | THERMAL_80MM | PDF_A4
  printPreview: true,        // pratinjau bitmap sebelum cetak Bluetooth

  // Printer Bluetooth (BLE)
  btPrinterId: '',          // id perangkat Web Bluetooth yang terakhir tersambung (untuk sambung ulang otomatis)
  btPrinterName: '',
  btCharWidth: 32,          // 32 (58mm) atau 48 (80mm) karakter per baris

  // QRIS
  qrisEnabled: false,
  qrisImageData: '',        // base64 data URL gambar QRIS

  // Privasi data pelanggan di struk
  maskCustomerPhone: true,  // kalau true, nomor HP pelanggan di struk cuma tampil 3 digit terakhir
  customerPhoneDisplay: 'LAST3', // FULL | LAST3 | HIDDEN

  // Kunci aplikasi (PIN lokal dan biometrik perangkat melalui WebAuthn).
  security: {
    pinEnabled: false,
    pinHash: '',
    biometricEnabled: false,
    biometricCredentialId: '',
    lockOnBackground: true,
  },

  // Auto backup ke Google Drive
  autoBackup: {
    enabled: false,
    driveConnected: false,
    driveAccountEmail: '',
    backupWindowStart: '07:00',
    backupWindowEnd: '19:00',
    backupDailyLimit: 2,
    backupKeepCount: 15,
    lastBackupFingerprint: '',
    backupPendingSince: '',
    backupCountDate: '',
    backupCountToday: 0,
    confirmBeforeBackup: false,
    lastBackupAt: '',       // ISO datetime backup terakhir berhasil
    lastSyncPushAt: '',     // ISO datetime terakhir kali PUSH ke file sinkron antar perangkat
    lastSyncPullAt: '',     // ISO datetime terakhir kali PULL dari file sinkron antar perangkat
    lastSyncAt: '',         // ISO datetime sinkron otomatis/manual terakhir
    lastSyncFingerprint: '',// sidik data terakhir yang sama di lokal dan Drive
    lastSyncStatus: '',     // status terakhir sinkron otomatis
    lastSyncProblem: false,
    lastSyncPromptKey: '',  // penanda popup mismatch terakhir agar tidak berulang
    autoSyncEnabled: true,
    autoSyncIntervalMinutes: 5,
  },
};

let _cache = null;

export async function getSettings() {
  if (_cache) return _cache;
  const existing = await db.get('settings', 1);
  if (existing) {
    _cache = {
      ...DEFAULTS,
      ...existing,
      autoBackup: { ...DEFAULTS.autoBackup, ...existing.autoBackup },
      security: { ...DEFAULTS.security, ...existing.security },
    };
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
