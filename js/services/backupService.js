// backupService.js — backup & restore data NotaKu SENDIRI (bukan impor dari
// aplikasi lain — untuk itu lihat legacyImportService.js).
//
// Format: JSON tunggal berisi seluruh isi database + metadata (versi backup,
// versi app, waktu dibuat). Dipilih di atas format biner supaya ringan, cepat
// dibuat/dibaca di browser, dan gampang diperiksa isinya kalau perlu debug.
//
// PERBAIKAN PENTING (backup = snapshot SELURUH aplikasi):
// - Backup mengambil SEMUA store sekaligus lewat db.dumpAll() (produk,
//   pelanggan, nota, item nota, pembayaran, pengaturan), bukan sebagian.
// - Setelah restore, cache pengaturan in-memory WAJIB di-invalidate. Tanpa ini,
//   data toko/setting yang baru saja dipulihkan tidak terpakai karena aplikasi
//   masih memegang salinan lama di memori — inilah sebab "data toko kosong
//   setelah restore" walau file cadangannya lengkap.

import * as db from '../db.js';
import { APP_VERSION } from '../version.js';
import { invalidateCache as invalidateSettingsCache } from './settingsService.js';

// Semua store yang merupakan bagian dari snapshot aplikasi. Dipakai untuk
// memvalidasi & menormalkan file cadangan (termasuk cadangan lama/parsial).
const KNOWN_STORES = ['products', 'customers', 'sales', 'saleItems', 'payments', 'settings'];

export async function createBackupBlob() {
  const dump = await db.dumpAll();
  const payload = {
    app: 'notaku',
    backupVersion: 2,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    stores: KNOWN_STORES,
    data: dump,
  };
  const json = JSON.stringify(payload);
  return new Blob([json], { type: 'application/json' });
}

export function downloadBackup(blob) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `notaku-backup-${stamp}.json`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return filename;
}

/**
 * Ambil payload cadangan dari file/Blob, validasi bentuknya, dan normalkan
 * setiap store jadi array supaya proses restore tidak pernah error karena
 * field tertentu hilang di file cadangan lama.
 */
async function readAndValidatePayload(fileLike) {
  const text = await fileLike.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (e) {
    throw new Error('File cadangan tidak valid (bukan format JSON NotaKu).');
  }
  if (payload.app !== 'notaku' || !payload.data) {
    throw new Error('File ini bukan file cadangan NotaKu yang valid.');
  }
  const data = {};
  for (const store of KNOWN_STORES) {
    data[store] = Array.isArray(payload.data[store]) ? payload.data[store] : [];
  }
  return { payload, data };
}

/** Restore MENGGANTI seluruh data aktif. Panggilan ini harus sudah dikonfirmasi user. */
export async function restoreFromFile(file) {
  const { payload, data } = await readAndValidatePayload(file);
  await db.restoreAll(data);
  // WAJIB: buang cache pengaturan lama supaya data toko/setting yang baru
  // dipulihkan langsung dipakai oleh seluruh halaman.
  invalidateSettingsCache();
  return payload;
}
