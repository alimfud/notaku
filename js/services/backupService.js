// backupService.js — backup & restore data NotaKu SENDIRI (bukan impor dari
// aplikasi lain — untuk itu lihat legacyImportService.js).
//
// Format: JSON tunggal berisi seluruh isi database + metadata (versi backup,
// versi app, waktu dibuat). Dipilih di atas format biner supaya ringan, cepat
// dibuat/dibaca di browser, dan gampang diperiksa isinya kalau perlu debug.

import * as db from '../db.js';
import { APP_VERSION } from '../version.js';
import { invalidateCache as invalidateSettingsCache } from './settingsService.js';

export async function createBackupBlob() {
  const dump = await db.dumpAll();
  const payload = {
    app: 'notaku',
    backupVersion: 1,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    data: dump,
  };
  const json = JSON.stringify(payload);
  return new Blob([json], { type: 'application/json' });
}

export async function getBackupSummary() {
  const data = await db.dumpAll();
  const counts = Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, Array.isArray(rows) ? rows.length : 0]));
  return { counts, totalRecords: Object.values(counts).reduce((sum, count) => sum + count, 0) };
}

export async function compareBackupFile(file) {
  const text = await file.text();
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error('File cadangan tidak valid (bukan format JSON NotaKu).'); }
  if (payload.app !== 'notaku' || !payload.data) throw new Error('File ini bukan file cadangan NotaKu yang valid.');
  const local = await db.dumpAll();
  const keys = ['sales', 'saleItems', 'payments', 'products', 'customers', 'expenses', 'auditLogs'];
  const counts = Object.fromEntries(keys.map((key) => [key, { local: local[key]?.length || 0, backup: Array.isArray(payload.data[key]) ? payload.data[key].length : 0 }]));
  return { payload, counts, localTotal: keys.reduce((sum, key) => sum + counts[key].local, 0), backupTotal: keys.reduce((sum, key) => sum + counts[key].backup, 0) };
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

/** Restore MENGGANTI seluruh data aktif. Panggilan ini harus sudah dikonfirmasi user. */
export async function restoreFromFile(file) {
  const { payload } = await compareBackupFile(file);
  await db.restoreAll(payload.data);
  // Settings dibaca dan di-cache oleh UI. Tanpa ini, Pull dari cloud dapat
  // memakai konfigurasi lama lalu menimpanya lagi ketika status sync disimpan.
  invalidateSettingsCache();
  return payload;
}
