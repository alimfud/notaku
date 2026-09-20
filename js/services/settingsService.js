// settingsService.js — pengaturan toko (satu baris, id = 1).
//
// PENTING (perbaikan): pengaturan yang tersimpan bisa berasal dari versi
// aplikasi yang lebih lama (mis. field `invoiceNumberFormat` bernilai 'DATETIME'
// pada rilis sebelum diganti 'DAILY_SEQUENCE'). Kalau nilai seperti itu
// diteruskan mentah ke UI, halaman Setting → Nomor Nota bisa gagal dirender di
// perangkat yang datanya masih lama (tapi normal di perangkat baru yang
// pengaturannya sudah default). Karena itu semua data yang dibaca SELALU
// dinormalisasi lewat normalizeSettings() → selalu ada fallback/default, tidak
// pernah error walau field belum ada / nilainya tidak dikenal.

import * as db from '../db.js';

const DEFAULTS = {
  id: 1,
  storeName: 'Toko Saya',
  storeAddress: '',
  storePhone: '',
  footerNote: 'Terima kasih atas kunjungan Anda.',
  invoicePrefix: 'INV #',
  invoiceDigitCount: 2,
  invoiceNextNumber: 1,
  invoiceResetMode: 'NEVER', // NEVER | DAILY | MONTHLY (hanya dipakai mode SEQUENTIAL)
  invoiceLastResetDate: '',
  invoiceNumberFormat: 'DAILY_SEQUENCE', // 'DAILY_SEQUENCE' (prefix+YYMMDD+urutan harian) | 'SEQUENTIAL' (prefix+nomor urut biasa)
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
    lastSyncPushAt: '',     // ISO datetime terakhir kali PUSH ke file sinkron antar perangkat
    lastSyncPullAt: '',     // ISO datetime terakhir kali PULL dari file sinkron antar perangkat
  },
};

const VALID_FORMATS = ['DAILY_SEQUENCE', 'SEQUENTIAL'];
const VALID_RESET_MODES = ['NEVER', 'DAILY', 'MONTHLY'];
const VALID_PAPERS = ['THERMAL_58MM', 'THERMAL_80MM', 'PDF_A4'];

function clampInt(value, min, max, fallback) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function asString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Satukan data tersimpan dengan default, dan pastikan setiap field punya nilai
 * yang valid & dikenal oleh kode versi saat ini. Dipakai baik saat membaca
 * maupun saat menyimpan, supaya pengaturan tidak pernah "setengah jadi".
 */
function normalizeSettings(input) {
  const src = input || {};
  const s = { ...DEFAULTS, ...src };

  // Nested: autoBackup harus di-merge, bukan digantikan utuh — data lama yang
  // menyimpan autoBackup sebagian (mis. cuma {enabled:true}) tetap aman.
  const srcAuto = src.autoBackup && typeof src.autoBackup === 'object' ? src.autoBackup : {};
  s.autoBackup = { ...DEFAULTS.autoBackup, ...srcAuto };
  if (!Array.isArray(s.autoBackup.scheduleTimes)) s.autoBackup.scheduleTimes = [...DEFAULTS.autoBackup.scheduleTimes];
  if (!Array.isArray(s.autoBackup.lastCheckedSlots)) s.autoBackup.lastCheckedSlots = [];
  s.autoBackup.deleteOlderThanDays = clampInt(s.autoBackup.deleteOlderThanDays, 0, 3650, DEFAULTS.autoBackup.deleteOlderThanDays);
  s.autoBackup.enabled = !!s.autoBackup.enabled;
  s.autoBackup.driveConnected = !!s.autoBackup.driveConnected;
  s.autoBackup.confirmBeforeBackup = !!s.autoBackup.confirmBeforeBackup;
  s.autoBackup.driveAccountEmail = asString(s.autoBackup.driveAccountEmail);
  s.autoBackup.lastBackupAt = asString(s.autoBackup.lastBackupAt);
  s.autoBackup.lastCheckedDate = asString(s.autoBackup.lastCheckedDate);
  s.autoBackup.lastSyncPushAt = asString(s.autoBackup.lastSyncPushAt);
  s.autoBackup.lastSyncPullAt = asString(s.autoBackup.lastSyncPullAt);

  // Field nomor nota — nilai warisan/tak dikenal dikembalikan ke default yang valid.
  if (!VALID_FORMATS.includes(s.invoiceNumberFormat)) s.invoiceNumberFormat = DEFAULTS.invoiceNumberFormat;
  if (!VALID_RESET_MODES.includes(s.invoiceResetMode)) s.invoiceResetMode = DEFAULTS.invoiceResetMode;
  if (!VALID_PAPERS.includes(s.paperSize)) s.paperSize = DEFAULTS.paperSize;

  s.invoicePrefix = asString(s.invoicePrefix, DEFAULTS.invoicePrefix);
  s.invoiceDigitCount = clampInt(s.invoiceDigitCount, 1, 6, DEFAULTS.invoiceDigitCount);
  s.invoiceNextNumber = clampInt(s.invoiceNextNumber, 1, 999999999, DEFAULTS.invoiceNextNumber);
  s.invoiceLastResetDate = asString(s.invoiceLastResetDate);

  s.storeName = asString(s.storeName, DEFAULTS.storeName);
  s.storeAddress = asString(s.storeAddress);
  s.storePhone = asString(s.storePhone);
  s.footerNote = asString(s.footerNote, DEFAULTS.footerNote);

  const w = Number(s.btCharWidth);
  s.btCharWidth = (w === 32 || w === 48) ? w : DEFAULTS.btCharWidth;
  s.btPrinterId = asString(s.btPrinterId);
  s.btPrinterName = asString(s.btPrinterName);

  s.qrisEnabled = !!s.qrisEnabled;
  s.qrisImageData = asString(s.qrisImageData);
  s.maskCustomerPhone = src.maskCustomerPhone === undefined ? DEFAULTS.maskCustomerPhone : !!src.maskCustomerPhone;

  s.id = 1;
  return s;
}

let _cache = null;

export async function getSettings() {
  if (_cache) return _cache;

  let existing = null;
  try {
    existing = await db.get('settings', 1);
  } catch (e) {
    // Kalau baca gagal (storage bermasalah / private mode), tetap kembalikan
    // default supaya halaman Setting tidak error sama sekali.
    console.error('[settingsService] getSettings gagal baca, pakai default', e);
  }

  const normalized = normalizeSettings(existing);

  // Simpan versi ternormalisasi SEKALI kalau baris belum ada — supaya default
  // baru otomatis terbentuk. Kalau sudah ada, cukup dikembalikan secara
  // in-memory (tidak menulis tiap kali dibuka, menghindari race antar tab).
  if (!existing) {
    try { await db.put('settings', normalized); } catch (e) { console.error('[settingsService] gagal simpan default', e); }
  }

  _cache = normalized;
  return _cache;
}

export async function saveSettings(partial) {
  const current = await getSettings();
  const updated = normalizeSettings({ ...current, ...partial, id: 1 });
  await db.put('settings', updated);
  _cache = updated;
  return updated;
}

export function invalidateCache() {
  _cache = null;
}

/** Dipakai oleh backup/restore supaya pengaturan yang disimpan ke file ikut ternormalisasi. */
export function normalizeForStorage(input) {
  return normalizeSettings(input);
}
