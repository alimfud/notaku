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
//   1. Saat aplikasi dibuka/kembali aktif, periksa perubahan data dalam
//      rentang jam aktif. Di luar rentang itu, tunggu jam aktif berikutnya.
//   2. Timer memeriksa setiap menit selama aplikasi berjalan. Backup pertama
//      menunggu 15 menit; backup kedua hanya di 30 menit terakhir jam aktif.
//      Keduanya hanya berjalan jika data berubah sejak backup terakhir.
//      Browser dapat menunda timer ketika aplikasi berada di latar belakang.
// Jadi: backup di jam PERSIS yang kamu jadwalkan hanya terjamin kalau
// aplikasi kebetulan dibuka di sekitar jam itu. Untuk jaminan penuh 100%
// tepat waktu tanpa perlu membuka aplikasi sama sekali, itu butuh server
// atau aplikasi native — di luar kemampuan web app statis.
// ===================================================================================

import { GOOGLE_CLIENT_ID } from '../config.js';
import { getSettings, saveSettings } from './settingsService.js';
import { createBackupBlob } from './backupService.js';
import * as db from '../db.js';
import { backendEnabled, persistentAccess, beginPersistentLogin, disconnectPersistentSession, invalidatePersistentAccess, consumeGoogleLoginMessage as readGoogleLoginMessage } from './googleSessionService.js';

export function consumeGoogleLoginMessage() { return readGoogleLoginMessage(); }

const DRIVE_FOLDER_NAME = 'NotaKu Backups';
// drive.file memberi akses terbatas ke file aplikasi; scope identitas dipakai
// hanya untuk menampilkan akun Google yang sedang tersambung di pengaturan.
const SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.file';

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
export async function connectAccount({ renew = false } = {}) {
  if (!isConfigured()) throw new Error('GOOGLE_CLIENT_ID belum diisi. Lihat docs/DRIVE_SETUP.md.');
  if (await backendEnabled()) {
    const cfg = (await getSettings()).autoBackup;
    return beginPersistentLogin(renew || cfg.driveConnected ? cfg.driveAccountEmail : '');
  }
  await loadGis();
  const previous = (await getSettings()).autoBackup;
  const expectedEmail = renew ? previous.driveAccountEmail : '';
  _retryAfter = 0;
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
          if (expectedEmail && email.toLowerCase() !== expectedEmail.toLowerCase()) {
            _accessToken = null;
            _tokenExpiryMs = 0;
            throw new Error('Pilih akun Google yang sudah terhubung: ' + expectedEmail);
          }
          await saveSettings({ autoBackup: { ...(await getSettings()).autoBackup, driveConnected: true, driveAccountEmail: email } });
          resolve(email);
        } catch (e) {
          _accessToken = null;
          _tokenExpiryMs = 0;
          reject(e);
        }
      },
      error_callback: (error) => reject(new Error(error.type === 'popup_closed'
        ? 'Pembaruan akses Google dibatalkan. Akun tetap terhubung.'
        : 'Jendela Google tidak dapat dibuka. Izinkan popup lalu coba lagi.')),
    });
    _tokenClient.requestAccessToken({ prompt: renew ? '' : 'consent', ...(expectedEmail ? { hint: expectedEmail } : {}) });
  });
}

async function ensureToken({ interactive = true } = {}) {
  if (hasValidToken()) return _accessToken;
  await restoreGoogleAccess();
  if (hasValidToken()) return _accessToken;
  if (!interactive) throw new Error('Izin akses Google berakhir. Tekan Aktifkan akses Google untuk melanjutkan sinkron dan backup. Akun tidak perlu diputuskan.');
  await connectAccount({ renew: true });
  return _accessToken;
}

export async function restoreGoogleAccess() {
  if (hasValidToken() || navigator.onLine === false) return;
  const session = await persistentAccess();
  if (!session) return;
  const settings = await getSettings();
  const cfg = settings.autoBackup;
  if (cfg.driveConnected && cfg.driveAccountEmail && cfg.driveAccountEmail.toLowerCase() !== session.email.toLowerCase()) {
    throw new Error('Akun sesi server berbeda dari akun data perangkat ini. Hubungkan kembali akun yang sesuai.');
  }
  _accessToken = session.accessToken;
  _tokenExpiryMs = session.expiresAt;
  if (!cfg.driveConnected || cfg.driveAccountEmail !== session.email) {
    await saveSettings({ autoBackup: { ...cfg, driveConnected: true, driveAccountEmail: session.email } });
  }
}

async function fetchAccountEmail() {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${_accessToken}` },
  });
  if (!res.ok) throw new Error('Gagal memastikan akun Google. Silakan coba lagi.');
  const data = await res.json();
  return data.email || '';
}

export async function disconnectAccount() {
  const persistent = await disconnectPersistentSession();
  if (!persistent && _accessToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(_accessToken, () => {});
  }
  _accessToken = null;
  _tokenExpiryMs = 0;
  const settings = await getSettings();
  await saveSettings({ autoBackup: { ...settings.autoBackup, driveConnected: false, driveAccountEmail: '' } });
}

function stableData(data) {
  const copy = JSON.parse(JSON.stringify(data));
  // Konfigurasi backup dan status akun bersifat lokal perangkat, bukan data usaha.
  for (const row of copy.settings || []) {
    if (row.id === 1) delete row.autoBackup;
  }
  return JSON.stringify(copy);
}

function fingerprint(data) {
  const value = stableData(data);
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

async function localFingerprint() {
  return fingerprint(await db.dumpAll());
}

async function readSyncFile(token, file) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Gagal membaca data sinkron: ' + await readGoogleError(res));
  const payload = await res.json();
  if (payload.app !== 'notaku' || !payload.data) throw new Error('File sinkron di Drive bukan data NotaKu yang valid.');
  return payload;
}

async function saveSyncState({ fingerprint: value, status = '' }) {
  const settings = await getSettings();
  const now = new Date().toISOString();
  await saveSettings({ autoBackup: {
    ...settings.autoBackup,
    ...(value ? { lastSyncAt: now } : {}),
    lastSyncFingerprint: value || settings.autoBackup.lastSyncFingerprint || '',
    lastSyncStatus: status,
    lastSyncProblem: !value,
  } });
}

/** Periksa dan sinkronkan perubahan satu arah; perubahan bersamaan ditahan agar tidak tertimpa. */
let _autoSyncInFlight = null;
let _lastAutoSyncCheckAt = 0;
let _syncRunning = false;

export async function getSyncDisplayState() {
  let sessionError = '';
  try { await restoreGoogleAccess(); } catch (error) { sessionError = error.message; }
  const { autoBackup: cfg } = await getSettings();
  return { ...cfg, ...(sessionError ? { lastSyncProblem: true, lastSyncStatus: sessionError } : {}), syncing: _syncRunning, needsAuthorization: !sessionError && cfg.driveConnected && !hasValidToken(), offline: navigator.onLine === false };
}

async function publishSyncStatus() {
  window.dispatchEvent(new CustomEvent('notaku-sync-status', { detail: await getSyncDisplayState() }));
}

export function checkAutomaticSync({ force = false, promptIfNeeded = false } = {}) {
  if (_autoSyncInFlight) return _autoSyncInFlight;
  _autoSyncInFlight = (async () => {
    await restoreGoogleAccess();
    const settings = await getSettings();
    const cfg = settings.autoBackup;
    if (!cfg?.driveConnected || !isConfigured() || navigator.onLine === false) return;
    const interval = Math.max(1, Number(cfg.autoSyncIntervalMinutes) || 5) * 60000;
    if (!force && Date.now() - _lastAutoSyncCheckAt < interval) return;
    _lastAutoSyncCheckAt = Date.now();
    if (promptIfNeeded) {
      const prompt = await checkSyncNeeded();
      if (prompt.needsSync) {
        window.dispatchEvent(new CustomEvent('notaku-sync-required', { detail: prompt }));
        return;
      }
    }
    _syncRunning = true;
    await publishSyncStatus();
    try {
      await runAutomaticSync();
    } finally {
      _syncRunning = false;
      await publishSyncStatus();
    }
  })().finally(() => {
    _autoSyncInFlight = null;
  });
  return _autoSyncInFlight;
}

/**
 * Periksa apakah perangkat ini perlu meminta sinkronisasi sebelum aktivitas
 * dilanjutkan. Pemeriksaan hanya berlaku setelah perangkat pernah tersinkron.
 * Tidak mengubah data dan tidak melakukan push/pull.
 */
export async function checkSyncNeeded() {
  const settings = await getSettings();
  const cfg = settings.autoBackup;
  if (!cfg?.driveConnected || !cfg.autoSyncEnabled || !cfg.lastSyncAt || !isConfigured() || navigator.onLine === false) {
    return { needsSync: false };
  }

  try {
    const token = await ensureToken({ interactive: false });
    const file = await findSyncFile(token);
    if (!file) return { needsSync: true, reason: 'File sinkron di Google Drive tidak ditemukan.' };
    const payload = await readSyncFile(token, file);
    const localHash = await localFingerprint();
    const cloudHash = fingerprint(payload.data);
    return {
      needsSync: localHash !== cloudHash,
      reason: localHash !== cloudHash ? 'Ada perubahan data yang belum tersinkron.' : '',
    };
  } catch (error) {
    console.error('[driveBackupService] sync-needed check failed', error);
    return { needsSync: false };
  }
}

async function runAutomaticSync() {
  const settings = await getSettings();
  const cfg = settings.autoBackup;
  if (!cfg?.driveConnected || !isConfigured() || navigator.onLine === false) return;
  try {
    const token = await ensureToken({ interactive: false });
    const file = await findSyncFile(token);
    const localHash = await localFingerprint();
    if (!file) {
      await pushToCloud();
      await saveSyncState({ fingerprint: localHash, status: 'Data lokal dikirim ke cloud.' });
      return;
    }
    const payload = await readSyncFile(token, file);
    const cloudHash = fingerprint(payload.data);
    const baseline = cfg.lastSyncFingerprint;
    if (localHash === cloudHash) {
      await saveSyncState({ fingerprint: localHash, status: 'Data sudah sama.' });
      return;
    }
    if (!baseline) {
      await saveSyncState({ status: 'Pilih Push atau Tarik sekali untuk memulai sinkron otomatis.' });
      return;
    }
    const localChanged = localHash !== baseline;
    const cloudChanged = cloudHash !== baseline;
    if (localChanged && cloudChanged && localHash !== cloudHash) {
      await saveSyncState({ status: 'Ada perubahan di kedua sisi. Push atau Tarik secara manual untuk menghindari data tertimpa.' });
    } else if (localChanged && localHash !== cloudHash) {
      await pushToCloud();
      await saveSyncState({ fingerprint: localHash, status: 'Perubahan perangkat ini dikirim ke cloud.' });
    } else if (cloudChanged && localHash !== cloudHash) {
      await applyCloudPayload(payload);
      const latest = await getSettings();
      await saveSettings({ autoBackup: { ...latest.autoBackup, lastSyncPullAt: new Date().toISOString() } });
      await saveSyncState({ fingerprint: cloudHash, status: 'Perubahan dari cloud ditarik ke perangkat ini.' });
    } else {
      await saveSyncState({ fingerprint: localHash, status: 'Data sudah sama.' });
    }
  } catch (e) {
    const latest = await getSettings();
    await saveSettings({ autoBackup: { ...latest.autoBackup, lastSyncProblem: true, lastSyncStatus: e.message || 'Sinkronisasi gagal.' } });
    console.error('[driveBackupService] automatic sync failed', e);
  }
}

async function applyCloudPayload(payload) {
  const localSettings = await getSettings();
  const { restoreFromFile } = await import('./backupService.js');
  await restoreFromFile(new Blob([JSON.stringify(payload)], { type: 'application/json' }));
  await saveSettings({ autoBackup: localSettings.autoBackup });
}

/**
 * Ambil pesan error SUNGGUHAN dari Google (bukan cuma nomor status), supaya
 * masalah seperti 401/403 bisa didiagnosis dari toast/dialog yang tampil ke
 * user, tanpa perlu buka console. Google selalu mengirim body JSON berisi
 * `error.message` yang menjelaskan akar masalah (token invalid, API belum
 * diaktifkan, scope tidak diizinkan, dst).
 */
async function readGoogleError(res) {
  if (res.status === 401) {
    invalidatePersistentAccess();
    _accessToken = null;
    _tokenExpiryMs = 0;
  }
  try {
    const data = await res.json();
    const msg = data?.error?.message || data?.error_description || JSON.stringify(data);
    return `${msg} (HTTP ${res.status})`;
  } catch (e) {
    return `HTTP ${res.status} ${res.statusText}`;
  }
}

async function findOrCreateFolder(token) {
  const q = encodeURIComponent(`name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!searchRes.ok) throw new Error('Gagal mengakses Google Drive: ' + await readGoogleError(searchRes));
  const searchData = await searchRes.json();
  if (searchData.files?.length) return searchData.files[0].id;

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  });
  if (!createRes.ok) throw new Error('Gagal membuat folder di Drive: ' + await readGoogleError(createRes));
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
  if (!res.ok) throw new Error('Upload ke Drive gagal: ' + await readGoogleError(res));
  return res.json();
}

async function deleteOldBackups(token, folderId, keepCount = 15) {
  if (!Number.isSafeInteger(keepCount) || keepCount < 1) throw new Error('Jumlah backup yang disimpan minimal 1 file.');
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and name contains 'notaku-backup-'`);
  const headers = { Authorization: `Bearer ${token}` };
  const files = [];
  let pageToken = '';
  // Baca seluruh halaman sebelum menghapus, agar pagination tidak bergeser.
  do {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=100&fields=nextPageToken,files(id,name,createdTime)${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`, { headers });
    if (!res.ok) throw new Error('Gagal membaca daftar backup: ' + await readGoogleError(res));
    const page = await res.json();
    files.push(...(page.files || []).filter((file) => file.name?.startsWith('notaku-backup-')));
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  files.sort((a, b) => Date.parse(b.createdTime) - Date.parse(a.createdTime) || a.id.localeCompare(b.id));
  for (const file of files.slice(keepCount)) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}`, { method: 'DELETE', headers });
    if (!res.ok && res.status !== 404) throw new Error('Gagal menghapus backup lama: ' + await readGoogleError(res));
  }
}

export async function listBackupHistory() {
  const token = await ensureToken();
  const folderId = await findOrCreateFolder(token);
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and name contains 'notaku-backup-'`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=10&fields=files(id,name,createdTime,size)`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Gagal membaca histori backup: ' + await readGoogleError(res));
  return (await res.json()).files || [];
}

/** Jalankan satu kali backup ke Drive sekarang juga. */
let _backupInFlight = null;

export function runBackupNow(options = {}) {
  if (_backupInFlight) return _backupInFlight;
  _backupInFlight = runBackupWithRetry(options).finally(() => { _backupInFlight = null; });
  return _backupInFlight;
}

async function runBackupWithRetry(options) {
  try {
    await runBackupOnce(options);
  } catch (e) {
    // Kalau gagalnya karena token invalid/kedaluwarsa (401), coba SEKALI lagi
    // dengan token baru sebelum benar-benar menyerah — banyak kasus "gagal
    // padahal baru saja login" sebenarnya cuma token basi yang belum sempat
    // di-refresh otomatis.
    if (String(e.message).includes('401') || String(e.message).toLowerCase().includes('invalid')) {
      _accessToken = null;
      _tokenExpiryMs = 0;
      await runBackupOnce(options);
    } else {
      throw e;
    }
  }
}

async function runBackupOnce(options) {
  const token = await ensureToken(options);
  const folderId = await findOrCreateFolder(token);
  const blob = await createBackupBlob();
  const backedUpFingerprint = fingerprint(JSON.parse(await blob.text()).data);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  await uploadBackupFile(token, folderId, blob, `notaku-backup-${stamp}.json`);
  const settings = await getSettings();
  const dateKey = options.backupDate;
  await saveSettings({ autoBackup: {
    ...settings.autoBackup,
    lastBackupAt: new Date().toISOString(), lastBackupError: '',
    lastBackupFingerprint: backedUpFingerprint, backupPendingSince: '',
    ...(options.automatic ? {
      backupCountDate: dateKey,
      backupCountToday: (settings.autoBackup.backupCountDate === dateKey ? Number(settings.autoBackup.backupCountToday) || 0 : 0) + 1,
    } : {}),
  } });
  // Upload sudah berhasil; kegagalan pembersihan tidak membuat jadwal diulang.
  await deleteOldBackups(token, folderId, settings.autoBackup.backupKeepCount).catch((e) => {
    console.error('[driveBackupService] cleanup failed', e);
  });
}

/**
 * Dipanggil setiap menit dan saat aplikasi kembali aktif. Hanya membuat
 * backup jika data berubah, masih dalam jam aktif, dan kuota harian tersedia.
 */
let _scheduleInFlight = null;
let _retryAfter = 0;

export function checkScheduleOnAppOpen() {
  if (_scheduleInFlight) return _scheduleInFlight;
  _scheduleInFlight = checkSchedule().finally(() => { _scheduleInFlight = null; });
  return _scheduleInFlight;
}

async function checkSchedule() {
  await restoreGoogleAccess();
  const settings = await getSettings();
  const cfg = settings.autoBackup;
  if (!cfg?.enabled || !cfg.driveConnected || !isConfigured()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (Date.now() < _retryAfter) return;

  const now = new Date();
  // Jadwal mengikuti tanggal lokal yang sama dengan jam pilihan pengguna.
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const minutes = (value) => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return NaN;
    const [h, m] = value.split(':').map(Number);
    return h * 60 + m;
  };
  const start = minutes(cfg.backupWindowStart || '07:00');
  const end = minutes(cfg.backupWindowEnd || '19:00');
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || nowMinutes < start || nowMinutes >= end) return;
  const count = cfg.backupCountDate === todayKey ? Number(cfg.backupCountToday) || 0 : 0;
  const limit = cfg.backupDailyLimit === 1 ? 1 : 2;
  if (count >= limit) return;

  try {
    const dump = await db.dumpAll();
    const currentFingerprint = fingerprint(dump);
    // Instalasi kosong belum memerlukan arsip. Simpan patokan agar perubahan
    // pertama (termasuk pengaturan toko) dapat terdeteksi pada pemeriksaan berikutnya.
    if (!cfg.lastBackupFingerprint && !Object.entries(dump).some(([store, rows]) => store !== 'settings' && rows.length > 0)) {
      const latest = await getSettings();
      await saveSettings({ autoBackup: { ...latest.autoBackup, lastBackupFingerprint: currentFingerprint, backupPendingSince: '' } });
      return;
    }
    if (currentFingerprint === cfg.lastBackupFingerprint) {
      if (cfg.backupPendingSince) {
        const latest = await getSettings();
        await saveSettings({ autoBackup: { ...latest.autoBackup, backupPendingSince: '' } });
      }
      return;
    }
    let pendingSince = Date.parse(cfg.backupPendingSince);
    if (!Number.isFinite(pendingSince) || pendingSince > now.getTime()) {
      pendingSince = now.getTime();
      const latest = await getSettings();
      await saveSettings({ autoBackup: { ...latest.autoBackup, backupPendingSince: now.toISOString() } });
    }
    // Backup pertama setelah perubahan terkumpul 15 menit. Backup berikutnya
    // hanya pada 30 menit terakhir rentang aktif, jika isi data berubah lagi.
    const closingWindow = nowMinutes >= Math.max(start, end - 30);
    if (count > 0 && !closingWindow) return;
    if (!closingWindow && now.getTime() - pendingSince < 15 * 60000) return;
    await runBackupNow({ interactive: false, automatic: true, backupDate: todayKey });
    _retryAfter = 0;
  } catch (e) {
    // Jadwal tetap tertunda sampai upload benar-benar berhasil.
    _retryAfter = Date.now() + 60000;
    const latest = await getSettings();
    await saveSettings({ autoBackup: { ...latest.autoBackup, lastBackupError: e.message } });
    console.error('[driveBackupService] scheduled backup failed', e);
  }
}

// ======================================================================
// SINKRONISASI ANTAR PERANGKAT (satu database yang sama, beberapa HP/laptop)
// ======================================================================
//
// Berbeda dengan "Backup Otomatis" di atas (yang membuat FILE BARU bertanda
// waktu setiap kali jalan, murni untuk arsip/pemulihan), fitur ini memakai
// SATU FILE TETAP di Drive ("notaku-sync.json") sebagai "titik temu" data
// antar perangkat: perangkat mana pun bisa mendorong (push) data lokalnya ke
// file itu, atau menarik (pull) isi file itu untuk menimpa data lokalnya.
//
// ============================== BATASAN JUJUR ==============================
// Ini BUKAN sinkronisasi realtime/otomatis dua-arah dengan penggabungan
// perubahan (merge) seperti Google Docs. Yang tersedia: "last write wins" —
// siapa pun yang terakhir menekan tombol PUSH, itulah yang akan dibaca
// perangkat lain saat mereka PULL. Kalau dua HP mengedit data BERBEDA di
// waktu yang sama lalu keduanya push, yang push BELAKANGAN akan menimpa
// push yang lebih dulu (perubahan yang lebih dulu akan hilang tertimpa).
//
// Sinkron otomatis memeriksa fingerprint data pada interval pilihan ketika app
// terbuka. Jika perubahan hanya ada di satu sisi, sisi lain diperbarui. Jika
// kedua sisi berubah sejak sinkron terakhir, tidak ada yang ditimpa; pengguna
// perlu memilih Push atau Pull secara manual. Pemeriksaan pertama untuk file
// yang sudah ada juga perlu pilihan manual sebagai patokan awal.
// Halaman yang ditutup tidak bisa menjalankan sinkronisasi. Sesi Google juga
// perlu masih aktif; setelah token habis pengguna perlu menghubungkan ulang.
// ============================================================================

const SYNC_FILE_NAME = 'notaku-sync.json';

async function findSyncFile(token) {
  const q = encodeURIComponent(`name='${SYNC_FILE_NAME}' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Gagal memeriksa file sinkron di Drive: ' + await readGoogleError(res));
  const data = await res.json();
  return data.files?.[0] || null;
}

/** Info status sinkron untuk ditampilkan di UI (tanpa mengunduh isi filenya). */
export async function getCloudSyncStatus() {
  const settings = await getSettings();
  let file = null;
  let cloudError = '';
  try {
    const token = await ensureToken({ interactive: false });
    file = await findSyncFile(token);
  } catch (e) {
    cloudError = e.message || 'Sesi Google perlu dihubungkan ulang.';
  }
  return {
    cloudExists: !!file,
    cloudModifiedTime: file?.modifiedTime || null,
    cloudError,
    lastPushedAt: settings.autoBackup.lastSyncPushAt || null,
    lastPulledAt: settings.autoBackup.lastSyncPullAt || null,
    lastSyncAt: settings.autoBackup.lastSyncAt || null,
    lastSyncStatus: settings.autoBackup.lastSyncStatus || '',
  };
}

/** Kirim (timpa) data lokal ke file sinkron di Drive. */
export async function pushToCloud() {
  const token = await ensureToken();
  const existing = await findSyncFile(token);
  const blob = await createBackupBlob();
  const metadata = { name: SYNC_FILE_NAME };
  const form = new FormData();

  let url, method;
  if (existing) {
    url = `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart`;
    method = 'PATCH';
    form.append('metadata', new Blob([JSON.stringify({})], { type: 'application/json' }));
  } else {
    url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    method = 'POST';
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  }
  form.append('file', blob);

  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` }, body: form });
  if (!res.ok) throw new Error('Gagal mengirim data ke Drive: ' + await readGoogleError(res));

  const settings = await getSettings();
  const localHash = await localFingerprint();
  await saveSettings({ autoBackup: { ...settings.autoBackup, lastSyncPushAt: new Date().toISOString(), lastSyncFingerprint: localHash, lastSyncAt: new Date().toISOString(), lastSyncProblem: false, lastSyncStatus: 'Data perangkat ini dikirim ke cloud.' } });
}

/**
 * Ambil data dari file sinkron di Drive dan TIMPA seluruh data lokal.
 * Pemanggil (UI) WAJIB sudah menampilkan dialog konfirmasi sebelum ini,
 * sama seperti restore backup biasa.
 */
export async function pullFromCloud() {
  const token = await ensureToken();
  const file = await findSyncFile(token);
  if (!file) throw new Error('Belum ada data sinkron di Drive. Push dari salah satu perangkat dulu.');

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Gagal mengambil data dari Drive: ' + await readGoogleError(res));

  const payload = await res.json();
  if (payload.app !== 'notaku' || !payload.data) throw new Error('File sinkron di Drive bukan data NotaKu yang valid.');
  await applyCloudPayload(payload);
  const settings = await getSettings();
  const cloudHash = fingerprint(payload.data);
  await saveSettings({ autoBackup: { ...settings.autoBackup, lastSyncPullAt: new Date().toISOString(), lastSyncAt: new Date().toISOString(), lastSyncFingerprint: cloudHash, lastSyncProblem: false, lastSyncStatus: 'Data terbaru ditarik dari cloud.' } });
}
