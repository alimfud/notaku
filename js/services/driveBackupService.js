// driveBackupService.js — sinkronisasi backup otomatis ke Google Drive.
//
// ============================== PENTING: SETUP AWAL ==============================
// Fitur ini BUTUH sebuah "OAuth Client ID" dari akun Google Cloud milikmu
// sendiri — ini bukan sesuatu yang bisa saya sediakan/aktifkan untuk kamu,
// karena terikat ke akun Google & domain situs kamu. Tapi ini GRATIS dan
// hanya perlu dilakukan SEKALI. Langkah-langkahnya ada di docs/DRIVE_SETUP.md.
// Setelah punya Client ID, isikan di js/config.js (GOOGLE_CLIENT_ID).
//
// Kalau GOOGLE_CLIENT_ID belum diisi, seluruh fitur di bagian "Atur Backup
// Otomatis" akan menampilkan pesan supaya diisi dulu — TIDAK membuat
// aplikasi error atau gagal dipakai untuk fitur lain.
//
// ============================== BATASAN JUJUR SOAL "OTOMATIS" ==============================
// Web app statis (tanpa server) TIDAK BISA menjalankan kode di jam tertentu
// kalau aplikasinya sedang tidak dibuka SAMA SEKALI (beda dengan aplikasi
// native Android yang punya background service). Yang dilakukan di sini,
// dan ini pendekatan terbaik yang tersedia untuk web app:
//   1. "Catch-up saat dibuka": begitu aplikasi dibuka/kembali aktif, dicek
//      apakah ada jadwal (mis. 07:00/12:00/17:00) yang harusnya sudah lewat
//      hari ini tapi belum di-backup — kalau iya, backup dijalankan saat itu
//      juga.
//   2. "Periodic Background Sync" (Chrome/Android, HANYA kalau aplikasi
//      sudah di-install ke HP) — Chrome MUNGKIN membangunkan service worker
//      secara periodik untuk sinkronisasi, tapi jadwalnya ditentukan browser
//      sendiri berdasarkan seberapa sering kamu memakai app (bisa cuma
//      sekali per beberapa jam sampai sehari), BUKAN persis jam 07:00/12:00/
//      17:00. Chrome TIDAK menjamin ini akan selalu berjalan.
// Jadi: backup di jam PERSIS yang kamu jadwalkan hanya terjamin kalau
// aplikasi kebetulan dibuka di sekitar jam itu. Untuk jaminan penuh 100%
// tepat waktu tanpa perlu membuka aplikasi sama sekali, itu butuh server
// atau aplikasi native — di luar kemampuan web app statis.
// ===================================================================================

import { GOOGLE_CLIENT_ID } from '../config.js';
import { getSettings, saveSettings } from './settingsService.js';
import { createBackupBlob } from './backupService.js';

const DRIVE_FOLDER_NAME = 'NotaKu Backups';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let _tokenClient = null;
let _accessToken = null;
let _tokenExpiryMs = 0;
let _gisLoadPromise = null;

export function isConfigured() {
  return !!GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID !== 'ISI_DENGAN_CLIENT_ID_GOOGLE_CLOUD_MU';
}

function loadGis() {
  if (_gisLoadPromise) return _gisLoadPromise;
  _gisLoadPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Gagal memuat layanan login Google. Periksa koneksi internet.'));
    document.head.appendChild(script);
  });
  return _gisLoadPromise;
}

function hasValidToken() {
  return _accessToken && Date.now() < _tokenExpiryMs - 30000;
}

/** Minta izin akses Google Drive (membuka popup login Google). Hasil dari klik tombol user. */
export async function connectAccount() {
  if (!isConfigured()) throw new Error('GOOGLE_CLIENT_ID belum diisi. Lihat docs/DRIVE_SETUP.md.');
  await loadGis();
  return new Promise((resolve, reject) => {
    _tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: async (resp) => {
        if (resp.error) { reject(new Error('Login Google dibatalkan atau gagal.')); return; }
        _accessToken = resp.access_token;
        _tokenExpiryMs = Date.now() + (resp.expires_in || 3600) * 1000;
        try {
          const email = await fetchAccountEmail();
          await saveSettings({ autoBackup: { ...(await getSettings()).autoBackup, driveConnected: true, driveAccountEmail: email } });
          resolve(email);
        } catch (e) { reject(e); }
      },
    });
    _tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

async function ensureToken() {
  if (hasValidToken()) return _accessToken;
  if (!_tokenClient) await connectAccount();
  else {
    await new Promise((resolve, reject) => {
      _tokenClient.callback = (resp) => {
        if (resp.error) { reject(new Error('Sesi Google berakhir, silakan hubungkan ulang.')); return; }
        _accessToken = resp.access_token;
        _tokenExpiryMs = Date.now() + (resp.expires_in || 3600) * 1000;
        resolve();
      };
      _tokenClient.requestAccessToken({ prompt: '' });
    });
  }
  return _accessToken;
}

async function fetchAccountEmail() {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${_accessToken}` },
  });
  if (!res.ok) return '';
  const data = await res.json();
  return data.email || '';
}

export async function disconnectAccount() {
  if (_accessToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(_accessToken, () => {});
  }
  _accessToken = null;
  _tokenExpiryMs = 0;
  const settings = await getSettings();
  await saveSettings({ autoBackup: { ...settings.autoBackup, driveConnected: false, driveAccountEmail: '' } });
}

async function findOrCreateFolder(token) {
  const q = encodeURIComponent(`name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const searchData = await searchRes.json();
  if (searchData.files?.length) return searchData.files[0].id;

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  });
  const createData = await createRes.json();
  return createData.id;
}

async function uploadBackupFile(token, folderId, blob, filename) {
  const metadata = { name: filename, parents: [folderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error('Upload ke Drive gagal (status ' + res.status + ').');
  return res.json();
}

async function deleteOldBackups(token, folderId, olderThanDays) {
  if (!olderThanDays || olderThanDays <= 0) return;
  const cutoff = new Date(Date.now() - olderThanDays * 86400000).toISOString();
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and createdTime < '${cutoff}'`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  for (const f of data.files || []) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
}

/** Jalankan satu kali backup ke Drive sekarang juga. */
export async function runBackupNow() {
  const token = await ensureToken();
  const folderId = await findOrCreateFolder(token);
  const blob = await createBackupBlob();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  await uploadBackupFile(token, folderId, blob, `notaku-backup-${stamp}.json`);
  const settings = await getSettings();
  await deleteOldBackups(token, folderId, settings.autoBackup.deleteOlderThanDays);
  await saveSettings({ autoBackup: { ...settings.autoBackup, lastBackupAt: new Date().toISOString() } });
}

/**
 * Dipanggil setiap kali aplikasi dibuka/kembali fokus (lihat app.js). Kalau
 * ada jam terjadwal yang sudah lewat hari ini dan belum dieksekusi, backup
 * dijalankan sekarang ("catch-up"). Lihat catatan batasan di atas file ini.
 */
export async function checkScheduleOnAppOpen({ onConfirm } = {}) {
  const settings = await getSettings();
  const cfg = settings.autoBackup;
  if (!cfg?.enabled || !cfg?.driveConnected || !isConfigured()) return;

  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  let slotsToday = cfg.lastCheckedSlots || [];
  if (cfg.lastCheckedDate !== todayKey) slotsToday = [];

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const dueSlot = (cfg.scheduleTimes || []).find((t) => {
    if (slotsToday.includes(t)) return false;
    const [h, m] = t.split(':').map(Number);
    return nowMinutes >= h * 60 + m;
  });
  if (!dueSlot) {
    if (cfg.lastCheckedDate !== todayKey) {
      await saveSettings({ autoBackup: { ...cfg, lastCheckedDate: todayKey, lastCheckedSlots: [] } });
    }
    return;
  }

  if (cfg.confirmBeforeBackup && onConfirm) {
    const proceed = await onConfirm(dueSlot);
    if (!proceed) {
      await saveSettings({ autoBackup: { ...cfg, lastCheckedDate: todayKey, lastCheckedSlots: [...slotsToday, dueSlot] } });
      return;
    }
  }

  try {
    await runBackupNow();
  } catch (e) {
    console.error('[driveBackupService] scheduled backup failed', e);
  } finally {
    const latest = await getSettings();
    await saveSettings({ autoBackup: { ...latest.autoBackup, lastCheckedDate: todayKey, lastCheckedSlots: [...slotsToday, dueSlot] } });
  }
}
