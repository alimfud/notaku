// Refresh tokens stay on the backend. Short-lived access tokens live only in memory.
let backendCheck;
let access;
let inFlight;
let missingUntil = 0;
let refreshForced = false;

export function invalidatePersistentAccess() {
  access = null;
  missingUntil = 0;
  refreshForced = true;
}

export function backendEnabled() {
  if (!backendCheck) {
    backendCheck = fetch('/api/google?action=status', { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(10000) })
      .then(async (response) => {
        if (response.status === 404) return false;
        if (!response.ok) throw new Error('Backend Google sedang tidak tersedia. Coba lagi setelah koneksi pulih.');
        if (!response.headers.get('content-type')?.includes('application/json')) return false;
        return (await response.json()).configured === true;
      }).catch((error) => { backendCheck = null; throw error; });
  }
  return backendCheck;
}

export async function persistentAccess() {
  if (!(await backendEnabled())) return null;
  if (access && access.expiresAt > Date.now() + 60000) return access;
  if (Date.now() < missingUntil) return null;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const response = await fetch('/api/google?action=session' + (refreshForced ? '&refresh=1' : ''), { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(25000) });
    if (response.status === 401) {
      access = null; missingUntil = Date.now() + 30000;
      return null;
    }
    if (!response.ok) throw new Error('Akses Google belum dapat diperbarui. Backend akan dicoba lagi; akun tidak perlu diputuskan.');
    const result = await response.json();
    if (!result.accessToken || !result.email || !Number.isFinite(result.expiresAt)) throw new Error('Respons sesi Google tidak valid.');
    access = result; missingUntil = 0; refreshForced = false;
    return access;
  })().finally(() => { inFlight = null; });
  return inFlight;
}

export function beginPersistentLogin(email = '') {
  const target = new URL('/api/google', location.origin);
  target.searchParams.set('action', 'start');
  if (email) target.searchParams.set('email', email);
  // Jangan menambahkan URL OAuth ke history browser. Jika memakai assign(),
  // tombol Back dapat membuka ulang halaman persetujuan Google.
  try { sessionStorage.setItem('notaku-google-login-active', '1'); } catch { /* private mode */ }
  location.replace(target.href);
  return new Promise(() => {});
}

export async function disconnectPersistentSession() {
  if (!(await backendEnabled())) return false;
  const response = await fetch('/api/google?action=disconnect', { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Gagal memutuskan sesi server. Coba lagi saat koneksi tersedia.');
  access = null; missingUntil = Date.now() + 30000;
  return true;
}

export function consumeGoogleLoginMessage() {
  const url = new URL(location.href);
  const result = url.searchParams.get('google');
  if (!result) return '';
  url.searchParams.delete('google');
  history.replaceState(null, '', url.href);
  try {
    sessionStorage.removeItem('notaku-google-login-active');
    sessionStorage.setItem('notaku-google-returned', '1');
  } catch { /* private mode */ }
  return ({ connected: 'Akun Google terhubung. Sesi dipulihkan otomatis saat aplikasi dibuka.',
    cancelled: 'Penyambungan Google dibatalkan.', wrong_account: 'Pilih akun Google yang sebelumnya terhubung.',
    consent_required: 'Google belum memberikan akses berkelanjutan. Hubungkan akun lagi dan setujui izin yang diminta.',
    invalid_state: 'Proses login sudah kedaluwarsa. Silakan mulai lagi.',
    identity_failed: 'Akun Google belum dapat diverifikasi.', unavailable: 'Layanan Google atau penyimpanan sesi sedang tidak tersedia.',
  })[result] || 'Proses penyambungan Google belum berhasil.';
}
