// appLockService.js — kunci biometrik lokal saat aplikasi dibuka kembali.
// WebAuthn membuat sidik jari/Face Unlock tetap diproses oleh perangkat,
// bukan dibaca atau disimpan oleh NotaKu.

import { getSettings } from './settingsService.js';

let lockBackdrop = null;
let unlocked = false;

function bytesToBase64Url(bytes) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value) {
  const base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function biometricSupported() {
  return Boolean(
    window.isSecureContext
      && window.PublicKeyCredential
      && navigator.credentials?.create
      && navigator.credentials?.get,
  );
}

export async function biometricAvailable() {
  if (!biometricSupported()) return false;
  if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return true;
  try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch { return false; }
}

export async function registerBiometric() {
  if (!(await biometricAvailable())) throw new Error('Sidik jari tidak tersedia di browser atau perangkat ini.');
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'NotaKu', id: location.hostname },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: 'notaku-user',
        displayName: 'Pengguna NotaKu',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'required',
        userVerification: 'required',
      },
      timeout: 60000,
      attestation: 'none',
    },
  });
  if (!credential?.rawId) throw new Error('Pendaftaran sidik jari dibatalkan.');
  return bytesToBase64Url(new Uint8Array(credential.rawId));
}

export async function authenticateBiometric(credentialId) {
  if (!(await biometricAvailable())) throw new Error('Sidik jari tidak tersedia di browser atau perangkat ini.');
  if (!credentialId) throw new Error('Sidik jari belum diaktifkan.');
  await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: base64UrlToBytes(credentialId) }],
      userVerification: 'required',
      timeout: 60000,
    },
  });
  return true;
}

function removeLockScreen() {
  lockBackdrop?.remove();
  lockBackdrop = null;
  document.body.classList.remove('app-is-locked');
}

function showLockScreen(settings) {
  if (lockBackdrop) return;
  const security = settings.security || {};
  lockBackdrop = document.createElement('div');
  lockBackdrop.className = 'app-lock-backdrop';
  lockBackdrop.setAttribute('role', 'dialog');
  lockBackdrop.setAttribute('aria-modal', 'true');
  lockBackdrop.setAttribute('aria-labelledby', 'appLockTitle');
  lockBackdrop.innerHTML = `
    <section class="app-lock-card">
      <div class="app-lock-mark" aria-hidden="true">🔒</div>
      <h1 id="appLockTitle">NotaKu terkunci</h1>
      <p>Verifikasi sidik jari atau Face Unlock untuk melanjutkan aktivitas di aplikasi.</p>
      <button type="button" class="btn app-lock-biometric">Buka dengan sidik jari</button>
      <div class="app-lock-error" role="alert" aria-live="polite"></div>
    </section>`;
  document.body.appendChild(lockBackdrop);
  document.body.classList.add('app-is-locked');
  const error = lockBackdrop.querySelector('.app-lock-error');
  lockBackdrop.querySelector('.app-lock-biometric').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    error.textContent = 'Menunggu verifikasi perangkat…';
    try {
      await authenticateBiometric(security.biometricCredentialId);
      unlocked = true;
      removeLockScreen();
    } catch (reason) {
      error.textContent = reason?.name === 'NotAllowedError' ? 'Verifikasi dibatalkan atau tidak berhasil.' : (reason?.message || 'Sidik jari belum berhasil diverifikasi.');
      button.disabled = false;
    }
  });
}

export async function lockApplication({ force = false, background = false } = {}) {
  const settings = await getSettings();
  const security = settings.security || {};
  if (!security.biometricEnabled) return false;
  if (!(await biometricAvailable())) {
    // Membersihkan status lama yang mungkin pernah ikut tersalin dari
    // perangkat lain sebelum pengaturan keamanan dibuat lokal per perangkat.
    await saveLocalBiometricState(false);
    return false;
  }
  if (background && security.lockOnBackground === false) return false;
  if (force) unlocked = false;
  if (unlocked) return false;
  showLockScreen(settings);
  return true;
}

async function saveLocalBiometricState(enabled) {
  const settings = await getSettings();
  if (!settings.security?.biometricEnabled) return;
  const security = enabled
    ? settings.security
    : { ...settings.security, biometricEnabled: false, biometricCredentialId: '' };
  const { saveSettings } = await import('./settingsService.js');
  await saveSettings({ security });
}

export function isApplicationLocked() {
  return Boolean(lockBackdrop);
}
