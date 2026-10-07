// appLockService.js — kunci lokal untuk melindungi aplikasi saat dibuka kembali.
// PIN tidak disimpan dalam bentuk asli. Biometrik memakai WebAuthn sehingga
// sidik jari tetap diproses oleh sistem operasi/browser, bukan oleh NotaKu.

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

export async function hashPin(pin) {
  const value = new TextEncoder().encode(String(pin));
  const digest = await crypto.subtle.digest('SHA-256', value);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyPin(pin, expectedHash) {
  if (!expectedHash) return false;
  return (await hashPin(pin)) === expectedHash;
}

export async function registerBiometric() {
  if (!biometricSupported()) throw new Error('Sidik jari tidak tersedia di browser atau perangkat ini.');
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
  if (!biometricSupported()) throw new Error('Sidik jari tidak tersedia di browser atau perangkat ini.');
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
      <p>Masukkan PIN untuk melanjutkan aktivitas di aplikasi.</p>
      <form class="app-lock-pin-form" novalidate>
        <label for="appLockPin">PIN aplikasi</label>
        <input id="appLockPin" type="password" inputmode="numeric" pattern="[0-9]*" minlength="4" maxlength="12" autocomplete="off" placeholder="Minimal 4 digit">
        <button class="btn app-lock-submit" type="submit">Buka dengan PIN</button>
      </form>
      ${security.biometricEnabled ? '<button type="button" class="btn secondary app-lock-biometric">Gunakan sidik jari</button>' : ''}
      <div class="app-lock-error" role="alert" aria-live="polite"></div>
    </section>`;
  document.body.appendChild(lockBackdrop);
  document.body.classList.add('app-is-locked');
  const pinInput = lockBackdrop.querySelector('#appLockPin');
  const error = lockBackdrop.querySelector('.app-lock-error');
  const fail = (message) => {
    error.textContent = message;
    pinInput.value = '';
    pinInput.focus();
  };
  lockBackdrop.querySelector('.app-lock-pin-form').onsubmit = async (event) => {
    event.preventDefault();
    const pin = pinInput.value.trim();
    if (!/^\d{4,12}$/.test(pin)) {
      fail('PIN harus berisi 4–12 digit angka.');
      return;
    }
    const valid = await verifyPin(pin, security.pinHash);
    if (!valid) {
      fail('PIN salah. Coba lagi.');
      return;
    }
    unlocked = true;
    removeLockScreen();
  };
  lockBackdrop.querySelector('.app-lock-biometric')?.addEventListener('click', async (event) => {
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
  pinInput.focus();
}

export async function lockApplication({ force = false, background = false } = {}) {
  const settings = await getSettings();
  const security = settings.security || {};
  if (!security.pinEnabled && !security.biometricEnabled) return false;
  if (background && security.lockOnBackground === false) return false;
  if (force) unlocked = false;
  if (unlocked) return false;
  showLockScreen(settings);
  return true;
}

export function isApplicationLocked() {
  return Boolean(lockBackdrop);
}
