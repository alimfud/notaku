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

import { GOOGLE_BACKEND_ORIGIN, GOOGLE_CLIENT_ID, GOOGLE_PICKER_API_KEY } from '../config.js';
import { getSettings, saveSettings } from './settingsService.js';
import { createBackupBlob } from './backupService.js';
import * as db from '../db.js';
import { backendEnabled, persistentAccess, beginPersistentLogin, disconnectPersistentSession, invalidatePersistentAccess, consumeGoogleLoginMessage as readGoogleLoginMessage } from './googleSessionService.js';
import { isNativeApp } from '../native.js';

export function consumeGoogleLoginMessage() { return readGoogleLoginMessage(); }

const DRIVE_FOLDER_NAME = 'NotaKu Backups';
const DRIVE_REQUEST_TIMEOUT_MS = 30000;
// drive.file memberi akses terbatas ke file aplikasi; scope identitas dipakai
// hanya untuk menampilkan akun Google yang sedang tersambung di pengaturan.
const SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.file';

let _tokenClient = null;
let _accessToken = null;
let _tokenExpiryMs = 0;
let _gisLoadPromise = null;
let _pickerLoadPromise = null;
let _fallbackDeviceSyncId = '';
let _nativeAppListenerPromise = null;
let _nativeBrowserListenerPromise = null;
let _nativeOAuthPending = null;

const NATIVE_SESSION_KEY = 'notaku-native-google-session';
const NATIVE_OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

const DEVICE_SYNC_ID_KEY = 'notaku-device-sync-id';

function createDeviceSyncId() {
  const bytes = new Uint8Array(6);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
  const value = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `NK-${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
}

/** ID lokal untuk membedakan perangkat pada layar pengaturan sinkronisasi. */
export function getDeviceSyncId() {
  try {
    const existing = localStorage.getItem(DEVICE_SYNC_ID_KEY);
    if (existing) return existing;
    const created = createDeviceSyncId();
    localStorage.setItem(DEVICE_SYNC_ID_KEY, created);
    return created;
  } catch {
    if (!_fallbackDeviceSyncId) _fallbackDeviceSyncId = createDeviceSyncId();
    return _fallbackDeviceSyncId;
  }
}

/** Label ringkas untuk UI; ID lengkap tetap disimpan lokal. */
export function getDeviceSyncLabel() {
  const compact = getDeviceSyncId().replace(/^NK-/, '').replace(/-/g, '').slice(0, 6).toUpperCase();
  return `NK-${compact}`;
}

function driveFetch(input, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DRIVE_REQUEST_TIMEOUT_MS);
  return fetch(input, { ...options, signal: controller.signal })
    .catch((error) => {
      if (error?.name === 'AbortError') throw new Error('Google Drive tidak merespons dalam 30 detik. Periksa koneksi internet lalu coba lagi.');
      throw error;
    })
    .finally(() => clearTimeout(timer));
}

export function isConfigured() {
  return !!GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID !== 'ISI_DENGAN_CLIENT_ID_GOOGLE_CLOUD_MU';
}

export function isSharedSyncPickerConfigured() {
  return !!GOOGLE_PICKER_API_KEY && GOOGLE_PICKER_API_KEY !== 'ISI_DENGAN_API_KEY_GOOGLE_PICKER';
}

function googleAppId() {
  return String(GOOGLE_CLIENT_ID || '').split('-')[0];
}

function loadPicker() {
  if (_pickerLoadPromise) return _pickerLoadPromise;
  _pickerLoadPromise = new Promise((resolve, reject) => {
    const initialize = () => {
      if (!globalThis.gapi?.load) { reject(new Error('Google Picker tidak dapat dimuat.')); return; }
      globalThis.gapi.load('picker', {
        callback: resolve,
        onerror: () => reject(new Error('Google Picker tidak dapat dimuat. Periksa koneksi internet.')),
        timeout: 15000,
        ontimeout: () => reject(new Error('Google Picker terlalu lama merespons. Coba lagi.')),
      });
    };
    if (globalThis.google?.picker && globalThis.gapi?.load) { resolve(); return; }
    if (globalThis.gapi?.load) { initialize(); return; }
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = initialize;
    script.onerror = () => reject(new Error('Gagal memuat Google Picker. Periksa koneksi internet.'));
    document.head.appendChild(script);
  }).catch((error) => { _pickerLoadPromise = null; throw error; });
  return _pickerLoadPromise;
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

function nativePlugin(name) {
  return window.Capacitor?.Plugins?.[name] || null;
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createNativeVerifier() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function createNativeChallenge(verifier) {
  const bytes = new TextEncoder().encode(verifier);
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}

function clearNativeLogin(error = new Error('Jendela login Google ditutup. Silakan tekan Hubungkan untuk mencoba lagi.')) {
  const pending = _nativeOAuthPending;
  if (!pending) return;
  _nativeOAuthPending = null;
  clearTimeout(pending.timer);
  pending.reject(error);
}

function nativeOAuthMessage(result) {
  return ({
    cancelled: 'Penyambungan Google dibatalkan.',
    invalid_state: 'Proses login Google sudah kedaluwarsa. Silakan coba lagi.',
    unavailable: 'Layanan Google sedang tidak tersedia. Silakan coba lagi.',
    consent_required: 'Google belum memberikan izin Drive. Silakan setujui semua izin yang diminta.',
    wrong_account: 'Pilih akun Google yang sebelumnya terhubung.',
    identity_failed: 'Akun Google belum dapat diverifikasi.',
  })[result] || 'Login Google dari APK belum berhasil.';
}

async function handleNativeOAuthUrl(url) {
  const pending = _nativeOAuthPending;
  if (!pending) return;
  _nativeOAuthPending = null;
  clearTimeout(pending.timer);
  try {
    const browser = nativePlugin('Browser');
    try { await browser?.close?.(); } catch { /* browser may already be closed */ }
    const callback = new URL(url);
    const result = callback.searchParams.get('google');
    if (result !== 'connected') throw new Error(nativeOAuthMessage(result));
    const handoff = callback.searchParams.get('handoff') || '';
    if (!handoff) throw new Error('Google selesai, tetapi hasil login tidak kembali ke APK.');
    const response = await fetch(`${GOOGLE_BACKEND_ORIGIN}/api/google?action=native-exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ handoff, verifier: pending.verifier }),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Hasil login Google tidak dapat diteruskan ke APK. Silakan coba lagi.');
    const resultData = await response.json();
    if (!resultData.accessToken || !resultData.email || !resultData.nativeSession) {
      throw new Error('Respons login Google tidak valid.');
    }
    localStorage.setItem(NATIVE_SESSION_KEY, resultData.nativeSession);
    _accessToken = resultData.accessToken;
    _tokenExpiryMs = Number(resultData.expiresAt) || Date.now() + 3600000;
    const current = await getSettings();
    await saveSettings({ autoBackup: { ...current.autoBackup, driveConnected: true, driveAccountEmail: resultData.email } });
    pending.resolve(resultData.email);
  } catch (error) {
    pending.reject(error);
  }
}

async function ensureNativeAppListener() {
  if (_nativeAppListenerPromise) return _nativeAppListenerPromise;
  _nativeAppListenerPromise = (async () => {
    const app = nativePlugin('App');
    if (!app?.addListener) throw new Error('Komponen callback APK belum tersedia. Instal APK versi terbaru.');
    await app.addListener('appUrlOpen', ({ url }) => {
      if (String(url || '').startsWith('id.notaku.app://oauth2callback')) void handleNativeOAuthUrl(url);
    });
  })().catch((error) => {
    _nativeAppListenerPromise = null;
    throw error;
  });
  return _nativeAppListenerPromise;
}

async function ensureNativeBrowserListener() {
  if (_nativeBrowserListenerPromise) return _nativeBrowserListenerPromise;
  _nativeBrowserListenerPromise = (async () => {
    const browser = nativePlugin('Browser');
    if (!browser?.addListener) throw new Error('Komponen browser APK belum tersedia. Instal APK versi terbaru.');
    await browser.addListener('browserFinished', () => {
      clearNativeLogin();
    });
  })().catch((error) => {
    _nativeBrowserListenerPromise = null;
    throw error;
  });
  return _nativeBrowserListenerPromise;
}

async function connectNativeAccount({ renew = false } = {}) {
  const browser = nativePlugin('Browser');
  if (!browser?.open) throw new Error('Browser APK belum tersedia. Instal APK versi terbaru.');
  await ensureNativeAppListener();
  await ensureNativeBrowserListener();
  if (_nativeOAuthPending) throw new Error('Jendela login Google sedang terbuka.');
  const previous = (await getSettings()).autoBackup;
  const expectedEmail = renew ? previous.driveAccountEmail : '';
  const verifier = createNativeVerifier();
  const challenge = await createNativeChallenge(verifier);
  const target = new URL(`${GOOGLE_BACKEND_ORIGIN}/api/google`);
  target.searchParams.set('action', 'start');
  target.searchParams.set('native', '1');
  target.searchParams.set('native_challenge', challenge);
  if (expectedEmail) target.searchParams.set('email', expectedEmail);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (_nativeOAuthPending?.reject === reject) {
        clearNativeLogin(new Error('Login Google terlalu lama. Kembali ke APK lalu coba lagi.'));
        void browser.close().catch(() => {});
      }
    }, NATIVE_OAUTH_TIMEOUT_MS);
    _nativeOAuthPending = { resolve, reject, timer, verifier };
    browser.open({ url: target.href }).catch((error) => {
      if (_nativeOAuthPending?.reject === reject) clearNativeLogin(error);
    });
  });
}

async function restoreNativeAccess() {
  let nativeSession = '';
  try { nativeSession = localStorage.getItem(NATIVE_SESSION_KEY) || ''; } catch { /* private storage */ }
  if (!nativeSession) return null;
  const response = await fetch(`${GOOGLE_BACKEND_ORIGIN}/api/google?action=native-session`, {
    method: 'POST',
    headers: { 'X-Notaku-Native-Session': nativeSession },
    cache: 'no-store',
  });
  if (response.status === 401) {
    try { localStorage.removeItem(NATIVE_SESSION_KEY); } catch { /* private storage */ }
    return null;
  }
  if (!response.ok) throw new Error('Sesi Google APK belum dapat dipulihkan.');
  const result = await response.json();
  if (!result.accessToken || !result.email || !Number.isFinite(result.expiresAt)) return null;
  _accessToken = result.accessToken;
  _tokenExpiryMs = result.expiresAt;
  return result;
}

function hasValidToken() {
  return _accessToken && Date.now() < _tokenExpiryMs - 30000;
}

/** Minta izin akses Google Drive (membuka popup login Google). Hasil dari klik tombol user. */
export async function connectAccount({ renew = false } = {}) {
  if (!isConfigured()) throw new Error('GOOGLE_CLIENT_ID belum diisi. Lihat docs/DRIVE_SETUP.md.');
  if (isNativeApp()) return connectNativeAccount({ renew });
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
  if (isNativeApp()) {
    const session = await restoreNativeAccess();
    if (!session) return;
    const settings = await getSettings();
    const cfg = settings.autoBackup;
    if (cfg.driveConnected && cfg.driveAccountEmail && cfg.driveAccountEmail.toLowerCase() !== session.email.toLowerCase()) {
      throw new Error('Akun sesi Google berbeda dari akun data perangkat ini. Hubungkan kembali akun yang sesuai.');
    }
    if (!cfg.driveConnected || cfg.driveAccountEmail !== session.email) {
      await saveSettings({ autoBackup: { ...cfg, driveConnected: true, driveAccountEmail: session.email } });
    }
    return;
  }
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
  const res = await driveFetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${_accessToken}` },
  });
  if (!res.ok) throw new Error('Gagal memastikan akun Google. Silakan coba lagi.');
  const data = await res.json();
  return data.email || '';
}

export async function disconnectAccount() {
  if (isNativeApp()) {
    let nativeSession = '';
    try {
      nativeSession = localStorage.getItem(NATIVE_SESSION_KEY) || '';
      localStorage.removeItem(NATIVE_SESSION_KEY);
    } catch { /* private storage */ }
    if (nativeSession) {
      await fetch(`${GOOGLE_BACKEND_ORIGIN}/api/google?action=native-disconnect`, {
        method: 'POST',
        headers: { 'X-Notaku-Native-Session': nativeSession },
        cache: 'no-store',
      }).catch(() => {});
    }
    _accessToken = null;
    _tokenExpiryMs = 0;
    const settings = await getSettings();
    await saveSettings({ autoBackup: { ...settings.autoBackup, driveConnected: false, driveAccountEmail: '' } });
    return;
  }
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
    if (row.id === 1) {
      delete row.autoBackup;
      // Kunci FingerPin/biometrik terikat pada perangkat/browser ini dan
      // tidak boleh membuat perangkat lain dianggap punya data berbeda.
      delete row.security;
    }
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

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function recordTimestamp(row) {
  for (const key of ['updatedAt', 'deletedAt', 'createdAt']) {
    const value = Date.parse(row?.[key] || '');
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function preferredRecord(localRow, cloudRow) {
  if (!localRow) return { row: cloudRow, source: 'cloud' };
  if (!cloudRow) return { row: localRow, source: 'local' };
  const localValue = canonicalJson(localRow);
  const cloudValue = canonicalJson(cloudRow);
  if (localValue === cloudValue) return { row: localRow, source: 'both' };
  const localTime = recordTimestamp(localRow);
  const cloudTime = recordTimestamp(cloudRow);
  if (localTime !== cloudTime) return localTime > cloudTime
    ? { row: localRow, source: 'local' }
    : { row: cloudRow, source: 'cloud' };
  // Data lama tidak selalu memiliki updatedAt. Pilihan leksikal membuat semua
  // perangkat tetap menghasilkan pemenang yang sama tanpa dialog/manual.
  return localValue > cloudValue
    ? { row: localRow, source: 'local' }
    : { row: cloudRow, source: 'cloud' };
}

function mergeRows(localRows = [], cloudRows = []) {
  const localById = new Map(localRows.map((row) => [row.id, row]));
  const cloudById = new Map(cloudRows.map((row) => [row.id, row]));
  const ids = [...new Set([...localById.keys(), ...cloudById.keys()])]
    .sort((a, b) => String(a).localeCompare(String(b)));
  const sources = new Map();
  const rows = ids.map((id) => {
    const selected = preferredRecord(localById.get(id), cloudById.get(id));
    sources.set(id, selected.source);
    return selected.row;
  });
  return { rows, sources };
}

function mergeSettings(localRows = [], cloudRows = []) {
  const stripLocalState = (row) => {
    const copy = { ...(row || {}) };
    delete copy.autoBackup;
    delete copy.security;
    return copy;
  };
  const local = localRows.find((row) => row.id === 1) || localRows[0];
  const cloud = cloudRows.find((row) => row.id === 1) || cloudRows[0];
  if (!local) return cloud ? [cloud] : [];
  if (!cloud) return [local];
  const selected = preferredRecord(stripLocalState(local), stripLocalState(cloud));
  return [{ ...(selected.source === 'cloud' ? cloud : local) }];
}

function mergeSaleItems(localRows = [], cloudRows = [], saleSources) {
  const group = (rows) => {
    const grouped = new Map();
    for (const row of rows) {
      if (!grouped.has(row.saleId)) grouped.set(row.saleId, []);
      grouped.get(row.saleId).push(row);
    }
    return grouped;
  };
  const localBySale = group(localRows);
  const cloudBySale = group(cloudRows);
  const saleIds = [...new Set([...localBySale.keys(), ...cloudBySale.keys()])]
    .sort((a, b) => String(a).localeCompare(String(b)));
  return saleIds.flatMap((saleId) => {
    const source = saleSources.get(saleId);
    // Mengedit nota mengganti semua saleItems sekaligus dan memperbarui
    // updatedAt nota. Karena itu item harus mengikuti sisi nota yang menang,
    // bukan di-union dengan item lama yang sudah diganti.
    if (source === 'local') return localBySale.get(saleId) || [];
    if (source === 'cloud') return cloudBySale.get(saleId) || [];
    return mergeRows(localBySale.get(saleId) || [], cloudBySale.get(saleId) || []).rows;
  }).sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

/**
 * Gabungkan dump dua perangkat. ID berbeda selalu dipertahankan; ID yang sama
 * memakai record terbaru. Fungsi ini murni agar kebijakan merge dapat diuji.
 */
export function mergeSyncData(localData = {}, cloudData = {}) {
  const merged = {};
  const sales = mergeRows(localData.sales || [], cloudData.sales || []);
  const stores = new Set([...Object.keys(localData), ...Object.keys(cloudData)]);
  for (const store of stores) {
    if (store === 'sales') merged.sales = sales.rows;
    else if (store === 'saleItems') merged.saleItems = mergeSaleItems(localData.saleItems || [], cloudData.saleItems || [], sales.sources);
    else if (store === 'settings') merged.settings = mergeSettings(localData.settings || [], cloudData.settings || []);
    else merged[store] = mergeRows(localData[store] || [], cloudData[store] || []).rows;
  }
  // Backup sangat lama mungkin belum memiliki salah satu store inti.
  for (const store of ['products', 'customers', 'sales', 'saleItems', 'payments', 'expenses', 'settings', 'auditLogs']) {
    if (!Array.isArray(merged[store])) merged[store] = [];
  }
  return merged;
}

async function localFingerprint() {
  return fingerprint(await db.dumpAll());
}

async function readSyncFile(token, file) {
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
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
  if (value) await clearSyncPromptMarker();
}

/** Periksa dan sinkronkan perubahan satu arah; perubahan bersamaan ditahan agar tidak tertimpa. */
let _autoSyncInFlight = null;
let _lastAutoSyncCheckAt = 0;
let _syncRunning = false;
const SYNC_PROMPT_MARKER = 'notaku-sync-prompt-marker';

function syncPromptKey(prompt) {
  return [prompt?.reason || '', prompt?.localHash || '', prompt?.cloudHash || ''].join('|');
}

function wasSyncPromptShown(prompt, cfg) {
  const key = syncPromptKey(prompt);
  if (cfg?.lastSyncPromptKey === key) return true;
  try { return sessionStorage.getItem(SYNC_PROMPT_MARKER) === key; } catch { return false; }
}

async function rememberSyncPrompt(prompt, cfg) {
  const key = syncPromptKey(prompt);
  try { sessionStorage.setItem(SYNC_PROMPT_MARKER, key); } catch { /* private mode */ }
  if (cfg?.lastSyncPromptKey !== key) {
    await saveSettings({ autoBackup: { ...cfg, lastSyncPromptKey: key } });
  }
}

async function clearSyncPromptMarker() {
  try { sessionStorage.removeItem(SYNC_PROMPT_MARKER); } catch { /* private mode */ }
  const settings = await getSettings();
  if (settings.autoBackup?.lastSyncPromptKey) {
    await saveSettings({ autoBackup: { ...settings.autoBackup, lastSyncPromptKey: '' } });
  }
}

export async function getSyncDisplayState() {
  let sessionError = '';
  try { await restoreGoogleAccess(); } catch (error) { sessionError = error.message; }
  const { autoBackup: cfg } = await getSettings();
  return { ...cfg, ...(sessionError ? { lastSyncProblem: true, lastSyncStatus: sessionError } : {}), deviceSyncId: getDeviceSyncLabel(), syncing: _syncRunning, needsAuthorization: !sessionError && cfg.driveConnected && !hasValidToken(), offline: navigator.onLine === false };
}

async function publishSyncStatus() {
  window.dispatchEvent(new CustomEvent('notaku-sync-status', { detail: await getSyncDisplayState() }));
}

export function checkAutomaticSync({ force = false, promptIfNeeded = false } = {}) {
  if (_autoSyncInFlight) return _autoSyncInFlight;
  _autoSyncInFlight = (async () => {
    let restoreError = null;
    try {
      await restoreGoogleAccess();
    } catch (error) {
      restoreError = error;
    }
    const settings = await getSettings();
    const cfg = settings.autoBackup;
    // Mode yang baru dipilih belum memiliki baseline. Izinkan tombol
    // "Sinkron sekarang" menjalankan merge pertama, tetapi jangan memulainya
    // diam-diam dari timer.
    if (!cfg?.driveConnected || !isConfigured() || (!cfg.lastSyncAt && !force) || (!force && cfg.autoSyncEnabled === false)) return;
    const interval = Math.max(1, Number(cfg.autoSyncIntervalMinutes) || 5) * 60000;
    if (!force && Date.now() - _lastAutoSyncCheckAt < interval) return;
    _lastAutoSyncCheckAt = Date.now();
    if (promptIfNeeded) {
      const prompt = restoreError
        ? { pendingCheck: true, reason: restoreError.message || 'Akses Google Drive perlu diperiksa kembali.' }
        : await checkSyncNeeded();
      if (prompt.pendingCheck) {
        // Popup hanya diperlukan jika pemeriksaan belum bisa dilakukan (offline
        // atau izin Google habis). Perbedaan data sendiri langsung di-merge.
        if (!wasSyncPromptShown(prompt, cfg)) {
          await rememberSyncPrompt(prompt, cfg);
          window.dispatchEvent(new CustomEvent('notaku-sync-required', { detail: prompt }));
        }
        return;
      }
      await clearSyncPromptMarker();
    }
    if (restoreError) throw restoreError;
    if (navigator.onLine === false) return;
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
  if (!cfg?.driveConnected || !cfg.lastSyncAt || !isConfigured()) {
    return { needsSync: false };
  }

  if (navigator.onLine === false) {
    return { pendingCheck: true, reason: 'Koneksi internet belum tersedia.' };
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
      localHash,
      cloudHash,
      reason: localHash !== cloudHash ? 'Ada perubahan data yang belum tersinkron.' : '',
    };
  } catch (error) {
    console.error('[driveBackupService] sync-needed check failed', error);
    return { pendingCheck: true, reason: error.message || 'Akses Google Drive perlu diperiksa kembali.' };
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
    const localChanged = localHash !== baseline;
    const cloudChanged = cloudHash !== baseline;
    if (!baseline || (localChanged && cloudChanged && localHash !== cloudHash)) {
      await mergeCloudPayload(payload, file.etag);
    } else if (localChanged && localHash !== cloudHash) {
      await pushToCloud({ expectedEtag: file.etag });
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
  await saveSettings({ autoBackup: localSettings.autoBackup, security: localSettings.security });
}

async function mergeCloudPayload(payload, expectedEtag = '') {
  const localData = await db.dumpAll();
  const mergedData = mergeSyncData(localData, payload.data);
  const localHash = fingerprint(localData);
  const mergedHash = fingerprint(mergedData);
  if (localHash !== mergedHash) {
    await applyCloudPayload({ ...payload, data: mergedData });
    const latest = await getSettings();
    await saveSettings({ autoBackup: { ...latest.autoBackup, lastSyncPullAt: new Date().toISOString() } });
  }
  await pushToCloud({ expectedEtag });
  const finalHash = await localFingerprint();
  await saveSyncState({ fingerprint: finalHash, status: 'Perubahan dari semua perangkat digabung otomatis.' });
}

/**
 * Menyiapkan sinkronisasi pertama setelah akun Google berhasil dihubungkan.
 * Semua data lokal dan cloud digabung otomatis tanpa meminta pilihan sumber.
 */
export async function initializeConnectedAccount() {
  const token = await ensureToken({ interactive: false });
  const file = await findSyncFile(token);
  const localData = await db.dumpAll();
  const localHash = fingerprint(localData);

  if (!file) {
    await pushToCloud();
    return { action: 'push', message: 'Data perangkat dikirim ke Google Drive.' };
  }

  const payload = await readSyncFile(token, file);
  const cloudHash = fingerprint(payload.data);
  if (localHash === cloudHash) {
    await saveSyncState({ fingerprint: localHash, status: 'Data perangkat dan Drive sudah sama.' });
    return { action: 'same', message: 'Data perangkat dan Google Drive sudah sama.' };
  }

  await mergeCloudPayload(payload, file.etag);
  return { action: 'merge', message: 'Data perangkat dan Google Drive berhasil digabung otomatis.' };
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
  const searchRes = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!searchRes.ok) throw new Error('Gagal mengakses Google Drive: ' + await readGoogleError(searchRes));
  const searchData = await searchRes.json();
  if (searchData.files?.length) return searchData.files[0].id;

  const createRes = await driveFetch('https://www.googleapis.com/drive/v3/files', {
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

  const res = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime', {
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
    const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=100&fields=nextPageToken,files(id,name,createdTime)${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`, { headers });
    if (!res.ok) throw new Error('Gagal membaca daftar backup: ' + await readGoogleError(res));
    const page = await res.json();
    files.push(...(page.files || []).filter((file) => file.name?.startsWith('notaku-backup-')));
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  files.sort((a, b) => Date.parse(b.createdTime) - Date.parse(a.createdTime) || a.id.localeCompare(b.id));
  for (const file of files.slice(keepCount)) {
    const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}`, { method: 'DELETE', headers });
    if (!res.ok && res.status !== 404) throw new Error('Gagal menghapus backup lama: ' + await readGoogleError(res));
  }
}

export async function listBackupHistory() {
  const token = await ensureToken();
  const folderId = await findOrCreateFolder(token);
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and name contains 'notaku-backup-'`);
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=10&fields=files(id,name,createdTime,size)`, { headers: { Authorization: `Bearer ${token}` } });
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
// Sinkron otomatis memeriksa fingerprint data pada interval pilihan ketika app
// terbuka. Tambahan dengan ID berbeda dipertahankan dari semua perangkat. Jika
// record yang sama berubah di dua sisi, record dengan updatedAt terbaru dipakai
// (data lama tanpa timestamp diselesaikan secara deterministik). Hasil gabungan
// ditulis kembali ke perangkat dan file sinkron tanpa pilihan Push/Pull.
// Halaman yang ditutup tidak bisa menjalankan sinkronisasi. Sesi Google juga
// perlu masih aktif; setelah token habis pengguna perlu menghubungkan ulang.
// ============================================================================

const SYNC_FILE_NAME = 'notaku-sync.json';
const SHARED_SYNC_CODE_PREFIX = 'NK1.';
const SHARED_SYNC_SHORT_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SHARED_SYNC_SHORT_LENGTH = 8;

function normalizeSharedFileId(value) {
  const raw = String(value || '').trim();
  const fromUrl = raw.match(/\/d\/([A-Za-z0-9_-]{10,})/)?.[1]
    || raw.match(/[?&]id=([A-Za-z0-9_-]{10,})/)?.[1];
  const candidate = fromUrl || raw.replace(/^NK1\./i, '');
  return /^[A-Za-z0-9_-]{10,}$/.test(candidate) ? candidate : '';
}

function normalizeShortSharedCode(value) {
  const compact = String(value || '').trim().replace(/[\s-]/g, '').toUpperCase();
  return new RegExp(`^[${SHARED_SYNC_SHORT_ALPHABET}]{${SHARED_SYNC_SHORT_LENGTH}}$`).test(compact) ? compact : '';
}

function shortSharedCodeForFile(fileId) {
  const normalized = normalizeSharedFileId(fileId);
  if (!normalized) throw new Error('ID ruang sinkron tidak valid.');
  let hash = 14695981039346656037n;
  for (let index = 0; index < normalized.length; index++) {
    hash ^= BigInt(normalized.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  let code = '';
  for (let index = 0; index < SHARED_SYNC_SHORT_LENGTH; index++) {
    code = SHARED_SYNC_SHORT_ALPHABET[Number(hash & 31n)] + code;
    hash >>= 5n;
  }
  return code;
}

/** Kode pendek dicocokkan setelah anggota memilih file; izin tetap diperiksa Drive. */
export function createSharedSyncCode(fileId) {
  return shortSharedCodeForFile(fileId);
}

/** Membaca kode lama/link Drive yang masih memuat ID file secara langsung. */
export function parseSharedSyncCode(value) {
  const raw = String(value || '').trim();
  if (/^NK1\./i.test(raw) || /^https:\/\/drive\.google\.com\//i.test(raw)) return normalizeSharedFileId(raw);
  return '';
}

async function getSharedSyncFile(token, fileId) {
  const id = normalizeSharedFileId(fileId);
  if (!id) throw new Error('Kode ruang sinkron tidak valid.');
  const fields = 'id,name,mimeType,modifiedTime,ownedByMe,appProperties,capabilities(canEdit,canShare)';
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=${encodeURIComponent(fields)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    if (res.status === 403 || res.status === 404) {
      const settings = await getSettings();
      const account = settings.autoBackup?.driveAccountEmail || 'akun Google yang sedang terhubung';
      let reason = '';
      try {
        const data = await res.json();
        reason = data?.error?.errors?.[0]?.reason || '';
      } catch { /* Respons 403/404 tidak selalu berisi JSON. */ }
      const error = new Error(reason === 'appNotAuthorizedToFile'
        ? `Izin Editor untuk ${account} sudah ada, tetapi NotaKu belum diizinkan membuka file ini. Pilih file ruang melalui Google Picker satu kali.`
        : `Akun ${account} belum dapat membuka ruang ini. Pastikan pemilik sudah menekan “Undang”, lalu pilih file ruang melalui Google Picker.`);
      error.code = 'shared_file_access_required';
      throw error;
    }
    throw new Error('Gagal membuka ruang sinkron: ' + await readGoogleError(res));
  }
  const file = await res.json();
  if (file.appProperties?.notakuSyncSpace !== '1') {
    throw new Error('File yang dipilih bukan Ruang Sinkron Bersama NotaKu. Pilih file bernama “NotaKu Sync - NAMA RUANG.json”.');
  }
  if (file.mimeType && file.mimeType !== 'application/json') {
    throw new Error('Format file ruang sinkron tidak didukung. Pilih file ruang NotaKu berformat JSON.');
  }
  const etag = res.headers?.get?.('etag') || '';
  return etag ? { ...file, etag } : file;
}

/**
 * Membuat file bersama menjadi file yang secara eksplisit dibuka oleh app pada
 * akun anggota. Ini diwajibkan oleh scope drive.file meski ACL Editor sudah ada.
 */
export async function authorizeSharedSyncFile(code) {
  const legacyFileId = parseSharedSyncCode(code);
  const shortCode = normalizeShortSharedCode(code);
  if (!legacyFileId && !shortCode) throw new Error('Kode ruang sinkron tidak valid.');
  if (!isSharedSyncPickerConfigured()) {
    throw new Error('Google Picker belum dikonfigurasi. Aktifkan Google Picker API, buat API key, lalu isi GOOGLE_PICKER_API_KEY di js/config.js.');
  }
  const token = await ensureToken();
  await loadPicker();
  return new Promise((resolve, reject) => {
    const pickerApi = globalThis.google?.picker;
    if (!pickerApi) { reject(new Error('Google Picker belum siap. Coba lagi.')); return; }
    const view = new pickerApi.DocsView(pickerApi.ViewId.DOCS);
    view.setIncludeFolders(false);
    view.setMimeTypes('application/json');
    view.setQuery('NotaKu Sync');
    if (pickerApi.DocsViewMode?.LIST) view.setMode(pickerApi.DocsViewMode.LIST);

    const picker = new pickerApi.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(GOOGLE_PICKER_API_KEY)
      .setAppId(googleAppId())
      .setOrigin(location.origin)
      .setTitle('Pilih file ruang sinkron NotaKu')
      .setCallback((data) => {
        const action = data?.[pickerApi.Response.ACTION] || data?.action;
        if (action === pickerApi.Action.PICKED || String(action).toLowerCase() === 'picked') {
          const selected = data?.[pickerApi.Response.DOCUMENTS]?.[0] || data?.docs?.[0];
          const selectedId = selected?.[pickerApi.Document.ID] || selected?.id;
          if (!selectedId) {
            reject(new Error('Google Picker tidak mengembalikan ID file. Pilih ulang file ruang NotaKu.'));
            return;
          }
          const matchesCode = legacyFileId ? selectedId === legacyFileId : shortSharedCodeForFile(selectedId) === shortCode;
          if (!matchesCode) {
            reject(new Error('File yang dipilih tidak cocok dengan kode ruang. Pilih file NotaKu yang dibagikan oleh pemilik.'));
            return;
          }
          resolve(selectedId);
        } else if (action === pickerApi.Action.CANCEL || String(action).toLowerCase() === 'cancel') {
          reject(new Error('Pemilihan file ruang dibatalkan.'));
        }
      })
      .build();
    picker.setVisible(true);
  });
}

async function findSyncFile(token) {
  const { autoBackup: cfg } = await getSettings();
  if (cfg?.syncMode === 'shared' && cfg.sharedSyncFileId) {
    return getSharedSyncFile(token, cfg.sharedSyncFileId);
  }
  const q = encodeURIComponent(`name='${SYNC_FILE_NAME}' and trashed=false`);
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Gagal memeriksa file sinkron di Drive: ' + await readGoogleError(res));
  const data = await res.json();
  return data.files?.[0] || null;
}

function sharedSpaceNameFromFile(file) {
  return String(file?.name || '').replace(/^NotaKu Sync\s*[—-]\s*/i, '').replace(/\.json$/i, '').trim() || 'Ruang bersama';
}

/** Buat file terpisah agar file sinkron personal lama tidak berubah. */
export async function createSharedSyncSpace(name) {
  const cleanName = String(name || '').trim().replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').slice(0, 60);
  if (!cleanName) throw new Error('Nama ruang sinkron wajib diisi.');
  const token = await ensureToken();
  const blob = await createBackupBlob();
  const metadata = {
    name: `NotaKu Sync - ${cleanName}.json`,
    appProperties: { notakuSyncSpace: '1' },
  };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);
  const res = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
  });
  if (!res.ok) throw new Error('Gagal membuat ruang sinkron: ' + await readGoogleError(res));
  const file = await res.json();
  if (!file.id) throw new Error('Google Drive tidak mengembalikan ID ruang sinkron.');
  const settings = await getSettings();
  const localHash = await localFingerprint();
  const now = new Date().toISOString();
  await saveSettings({ autoBackup: {
    ...settings.autoBackup,
    syncMode: 'shared', sharedSyncFileId: file.id, sharedSyncName: cleanName, sharedSyncOwner: true,
    lastSyncAt: now, lastSyncPushAt: now, lastSyncFingerprint: localHash,
    lastSyncProblem: false, lastSyncStatus: `Terhubung ke ruang bersama “${cleanName}”.`, lastSyncPromptKey: '',
  } });
  return { id: file.id, name: cleanName, code: createSharedSyncCode(file.id) };
}

/** Bagikan ruang aktif ke akun Google lain; token masing-masing tetap terpisah. */
export async function inviteSharedSyncMember(email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 254) {
    throw new Error('Alamat email undangan tidak valid.');
  }
  const settings = await getSettings();
  const cfg = settings.autoBackup;
  if (cfg.syncMode !== 'shared' || !cfg.sharedSyncFileId) throw new Error('Buat atau gabung ruang sinkron terlebih dahulu.');
  if (cleanEmail === String(cfg.driveAccountEmail || '').trim().toLowerCase()) {
    throw new Error('Email tersebut adalah akun pemilik yang sedang terhubung. Masukkan email anggota lain.');
  }
  const token = await ensureToken();
  const file = await getSharedSyncFile(token, cfg.sharedSyncFileId);
  if (file.ownedByMe !== true) throw new Error('Hanya pemilik ruang yang dapat mengundang anggota.');
  if (file.capabilities?.canShare === false) throw new Error('Akun pemilik ini tidak memiliki izin untuk mengundang anggota.');
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/permissions?sendNotificationEmail=true&fields=id`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'user', role: 'writer', emailAddress: cleanEmail }),
  });
  if (!res.ok) throw new Error('Gagal mengundang anggota: ' + await readGoogleError(res));
  return { email: cleanEmail, code: createSharedSyncCode(file.id) };
}

/** Gabungkan data lokal dengan file yang sudah dibagikan ke akun ini. */
export async function joinSharedSyncSpace(code, { authorizedFileId = '' } = {}) {
  const pickerFileId = normalizeSharedFileId(authorizedFileId);
  let fileId = parseSharedSyncCode(code);
  const shortCode = normalizeShortSharedCode(code);
  if (!fileId && !shortCode) throw new Error('Kode ruang sinkron tidak valid.');
  if (pickerFileId) {
    const pickerMatchesCode = fileId ? pickerFileId === fileId : shortSharedCodeForFile(pickerFileId) === shortCode;
    if (!pickerMatchesCode) throw new Error('File yang dipilih tidak cocok dengan kode ruang.');
    fileId = pickerFileId;
  }
  const token = await ensureToken();
  let file;
  if (shortCode && !pickerFileId) {
    fileId = await authorizeSharedSyncFile(shortCode);
    file = await getSharedSyncFile(token, fileId);
  } else {
    try {
      file = await getSharedSyncFile(token, fileId);
    } catch (error) {
      if (error.code !== 'shared_file_access_required') throw error;
      fileId = await authorizeSharedSyncFile(code);
      file = await getSharedSyncFile(token, fileId);
    }
  }
  if (file.capabilities?.canEdit === false) throw new Error('Ruang ini hanya memberi akses baca. Minta pemilik memberikan akses Editor.');
  const payload = await readSyncFile(token, file);
  const settings = await getSettings();
  const previous = settings.autoBackup;
  const name = sharedSpaceNameFromFile(file);
  await saveSettings({ autoBackup: {
    ...previous,
    syncMode: 'shared', sharedSyncFileId: file.id, sharedSyncName: name, sharedSyncOwner: file.ownedByMe === true,
    lastSyncAt: '', lastSyncPushAt: '', lastSyncPullAt: '', lastSyncFingerprint: '',
    lastSyncProblem: false, lastSyncStatus: '', lastSyncPromptKey: '',
  } });
  try {
    await mergeCloudPayload(payload, file.etag);
  } catch (error) {
    await saveSettings({ autoBackup: previous });
    throw error;
  }
  return { id: file.id, name, code: createSharedSyncCode(file.id) };
}

/** Kembali ke file personal tanpa menghapus file bersama atau data lokal. */
export async function leaveSharedSyncSpace() {
  const settings = await getSettings();
  await saveSettings({ autoBackup: {
    ...settings.autoBackup,
    syncMode: 'personal', sharedSyncFileId: '', sharedSyncName: '', sharedSyncOwner: false,
    lastSyncAt: '', lastSyncPushAt: '', lastSyncPullAt: '', lastSyncFingerprint: '',
    lastSyncProblem: false, lastSyncStatus: 'Mode sinkron personal aktif.', lastSyncPromptKey: '',
  } });
}

/** Daftar ruang yang dibuat/dibuka oleh NotaKu dan masih tersedia di Drive. */
export async function listSharedSyncSpaces() {
  const token = await ensureToken();
  const q = encodeURIComponent("appProperties has { key='notakuSyncSpace' and value='1' } and trashed=false");
  const fields = encodeURIComponent('files(id,name,createdTime,modifiedTime,ownedByMe,capabilities(canTrash))');
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=100&fields=${fields}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Gagal membaca daftar ruang sinkron: ' + await readGoogleError(res));
  const data = await res.json();
  const settings = await getSettings();
  return (data.files || []).map((file) => ({
    ...file,
    displayName: sharedSpaceNameFromFile(file),
    active: settings.autoBackup?.syncMode === 'shared' && settings.autoBackup.sharedSyncFileId === file.id,
    canTrash: file.ownedByMe === true || file.capabilities?.canTrash === true,
  }));
}

/** Pindahkan ruang milik pengguna ke Sampah Drive agar masih bisa dipulihkan. */
export async function trashSharedSyncSpace(fileId) {
  const id = normalizeSharedFileId(fileId);
  if (!id) throw new Error('ID ruang sinkron tidak valid.');
  const spaces = await listSharedSyncSpaces();
  const target = spaces.find((space) => space.id === id);
  if (!target) throw new Error('Ruang sinkron tidak ditemukan atau sudah dihapus.');
  if (!target.canTrash) throw new Error('Ruang ini dimiliki akun lain. Minta pemilik ruang menghapusnya.');
  const token = await ensureToken();
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,trashed`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
  if (!res.ok) throw new Error('Gagal memindahkan ruang ke Sampah Drive: ' + await readGoogleError(res));
  const settings = await getSettings();
  const wasActive = settings.autoBackup?.syncMode === 'shared' && settings.autoBackup.sharedSyncFileId === id;
  if (wasActive) await leaveSharedSyncSpace();
  return { id, name: target.displayName, wasActive };
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
export async function pushToCloud({ expectedEtag = '' } = {}) {
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

  const headers = { Authorization: `Bearer ${token}` };
  // File bersama lebih mungkin ditulis hampir bersamaan oleh akun berbeda.
  // Jika Drive memberikan ETag, cegah perangkat ini menimpa revisi yang baru
  // masuk setelah pemeriksaan terakhir; putaran sinkron berikutnya akan merge.
  if (expectedEtag && existing?.etag && existing.etag !== expectedEtag) {
    throw new Error('Ruang berubah dari perangkat lain saat sinkron. Tekan Sinkron sekarang untuk menggabungkan revisi terbaru.');
  }
  if (expectedEtag || existing?.etag) headers['If-Match'] = expectedEtag || existing.etag;
  const res = await driveFetch(url, { method, headers, body: form });
  if (res.status === 412) throw new Error('Ruang berubah dari perangkat lain saat sinkron. Tekan Sinkron sekarang untuk menggabungkan revisi terbaru.');
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

  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
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
