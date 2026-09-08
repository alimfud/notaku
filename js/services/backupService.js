// backupService.js — backup & restore data NotaKu SENDIRI (bukan impor dari
// aplikasi lain — untuk itu lihat legacyImportService.js).
//
// Format: JSON tunggal berisi seluruh isi database + metadata (versi backup,
// versi app, waktu dibuat). Dipilih di atas format biner supaya ringan, cepat
// dibuat/dibaca di browser, dan gampang diperiksa isinya kalau perlu debug.

import * as db from '../db.js';
import { APP_VERSION } from '../version.js';

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
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (e) {
    throw new Error('File cadangan tidak valid (bukan format JSON NotaKu).');
  }
  if (payload.app !== 'notaku' || !payload.data) {
    throw new Error('File ini bukan file cadangan NotaKu yang valid.');
  }
  await db.restoreAll(payload.data);
  return payload;
}
