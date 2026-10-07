// app.js — bootstrap aplikasi & router SPA.
import { APP_VERSION } from './version.js';
import { initTheme } from './theme.js';
import { initBottomNavIndicator } from './navIndicator.js';
import { initMotion } from './motion.js';
//
// Kenapa hash router + dynamic import per halaman?
// - Hash router (#/rute) tidak perlu konfigurasi server apa pun — cocok untuk
//   GitHub Pages (hosting statis biasa, tanpa rewrite rule).
// - `import()` dinamis per halaman membuat beban AWAL aplikasi kecil (cuma
//   modul yang benar-benar dipakai saat itu), tapi begitu sebuah halaman
//   pernah dibuka, browser meng-cache modulnya — kunjungan berikutnya ke
//   halaman yang sama INSTAN (tidak ada request jaringan lagi).
// - Karena semua data ada di IndexedDB (lokal), tidak ada "loading" jaringan
//   sama sekali saat pindah halaman — hanya baca dari IndexedDB (sub-milidetik
//   untuk data skala UMKM) lalu render ulang #pageRoot.

const pageRoot = document.getElementById('pageRoot');
const topbarActionsEl = document.getElementById('topbarActions');
const pageTitleEl = document.getElementById('pageTitle');
const btnBack = document.getElementById('btnBack');
const btnMenu = document.getElementById('btnMenu');
const bottomnav = document.getElementById('bottomnav');
const drawer = document.getElementById('drawer');
const drawerOverlay = document.getElementById('drawerOverlay');
initTheme();
initBottomNavIndicator(bottomnav); // lekukan + bubble menu bawah (mobile)
initMotion(); // animasi angka: ringkasan menghitung naik

const TOP_LEVEL_ROUTES = ['dashboard', 'home', 'products', 'customers', 'expenses', 'reports', 'settings'];

const PAGE_LOADERS = {
  dashboard: () => import('./pages/dashboard.js'),
  home: () => import('./pages/home.js'),
  sale: () => import('./pages/createSaleOrDetail.js'),
  products: () => import('./pages/products.js'),
  customers: () => import('./pages/customers.js'),
  expenses: () => import('./pages/expenses.js'),
  reports: () => import('./pages/reports.js'),
  settings: () => import('./pages/settings.js'),
};

let currentToken = 0;
let syncPromptOpen = false;

// Keep the old page's styles while a destination waits for data. Once its
// first markup is inserted, switch page-scoped CSS in the same DOM checkpoint
// (before the browser paints), avoiding both a loader and a CSS mismatch.
new MutationObserver(() => {
  const pendingPage = pageRoot.dataset.pendingPage;
  if (!pendingPage || !pageRoot.hasChildNodes()) return;
  pageRoot.dataset.page = pendingPage;
  pageRoot.dataset.section = pageRoot.dataset.pendingSection || '';
}).observe(pageRoot, { childList: true });

export function setPageTitle(title) {
  pageTitleEl.textContent = title;
}

const ICONS = {
  share: '<svg viewBox="0 0 24 24"><path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bluetoothPrint: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8V3h8v5M6 17H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v2M7 14h8v7H7z"/><path d="m19 13 3 3-3 3v-6Zm0 3-2-2m2 2-2 2"/></svg>',
  payment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4M17 13v4M15 15h4"/></svg>',
  delete: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M5 3h12l4 4v14H3V3h2zm2 0v6h10V3M7 21v-8h10v8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4l10.5-10.5a1.5 1.5 0 000-2.12l-1.88-1.88a1.5 1.5 0 00-2.12 0L4 16v4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="11" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"/></svg>',
};

function closeSyncPrompt(backdrop) {
  if (!backdrop?.isConnected) return;
  backdrop.remove();
  syncPromptOpen = false;
}

function showSyncPrompt(event = {}) {
  if (syncPromptOpen || document.querySelector('.sync-required-backdrop')) return;
  syncPromptOpen = true;
  const pendingCheck = Boolean(event.detail?.pendingCheck);
  const backdrop = document.createElement('div');
  backdrop.className = 'sync-required-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-labelledby', 'syncRequiredTitle');
  backdrop.innerHTML = `
    <section class="sync-required-dialog">
      <button class="sync-required-close" type="button" aria-label="Tutup pengingat sinkronisasi">×</button>
      <div class="sync-required-icon" aria-hidden="true">↻</div>
      <h2 id="syncRequiredTitle">${pendingCheck ? 'Pemeriksaan sinkronisasi tertunda' : 'Sinkronisasi diperlukan'}</h2>
      <p>${pendingCheck ? 'Aplikasi belum dapat memeriksa data terbaru di Google Drive. Pemeriksaan akan dilanjutkan saat koneksi dan akses Google tersedia.' : 'Ada perubahan data yang perlu diselaraskan dengan Google Drive sebelum kamu melanjutkan.'}</p>
      <button class="sync-required-action btn" type="button">${pendingCheck ? 'Aktifkan akses Google' : 'Sinkron sekarang'}</button>
    </section>`;
  document.body.appendChild(backdrop);
  const close = () => closeSyncPrompt(backdrop);
  backdrop.querySelector('.sync-required-close').onclick = close;
  backdrop.querySelector('.sync-required-action').onclick = async () => {
    const action = backdrop.querySelector('.sync-required-action');
    // Saat token Google sudah tidak tersedia, pemeriksaan ulang tidak dapat
    // membuka login secara otomatis karena pemeriksaan latar belakang memang
    // harus non-interaktif. Arahkan pengguna ke halaman backup agar tombol
    // "Aktifkan akses Google" menjalankan alur OAuth secara langsung.
    if (pendingCheck) {
      close();
      window.location.hash = '#/settings/autobackup';
      return;
    }
    action.disabled = true;
      action.textContent = pendingCheck ? 'Memeriksa…' : 'Menyinkronkan…';
    try {
      await checkAutomaticSync({ force: true });
      const { getSyncDisplayState } = await import('./services/driveBackupService.js');
      const state = await getSyncDisplayState();
      if (state.lastSyncProblem || state.needsAuthorization || state.offline) {
        throw new Error(state.lastSyncStatus || 'Sinkronisasi belum berhasil.');
      }
      close();
    } catch (error) {
      action.disabled = false;
      action.textContent = pendingCheck ? 'Aktifkan akses Google' : 'Coba sinkron lagi';
      console.error('[sync-prompt] manual sync failed', error);
    }
  };
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });
}

window.addEventListener('notaku-sync-required', showSyncPrompt);

export function setTopbarActions(actions) {
  topbarActionsEl.innerHTML = '';
  for (const action of actions) {
    const btn = document.createElement('button');
    btn.className = 'icon-btn';
    btn.title = action.title || '';
    btn.innerHTML = ICONS[action.icon] || '';
    if (action.label) {
      btn.classList.add('topbar-action-btn');
      const label = document.createElement('span');
      label.className = 'topbar-action-label';
      label.textContent = action.label;
      btn.appendChild(label);
    }
    btn.onclick = action.onClick;
    topbarActionsEl.appendChild(btn);
  }
}

export function navigate(route) {
  window.location.hash = '#/' + route;
}

export function replaceRoute(route) {
  history.replaceState(null, '', '#/' + route);
  handleRouteChange();
}

export function navigateBack() {
  if (pageRoot.dataset.formDirty === '1' && !window.confirm('Data nota belum disimpan. Yakin ingin keluar tanpa menyimpan?')) return;
  delete pageRoot.dataset.formDirty;
  // Setelah OAuth Google selesai, halaman login tidak boleh muncul lagi saat
  // pengguna menekan Back dari halaman Atur Backup Otomatis.
  if (window.location.hash === '#/settings/autobackup') {
    try {
      if (sessionStorage.getItem('notaku-google-returned') === '1') {
        sessionStorage.removeItem('notaku-google-returned');
        navigate('home');
        return;
      }
    } catch { /* private mode */ }
  }
  if (window.history.length > 1) {
    history.back();
  } else {
    navigate('home');
  }
}

export async function checkForUpdate(silent = true) {
  const { toast } = await import('./ui/toast.js');
  try {
    // cache: 'no-store' memaksa browser mengambil langsung dari jaringan
    // tanpa lewat HTTP cache — tidak perlu trik query-string "?t=..." lagi
    // (yang sebelumnya justru memicu bug di sw.js, sudah diperbaiki juga).
    const res = await fetch('./version.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.version && data.version !== APP_VERSION) {
      toast(`Versi baru ${data.version} tersedia. Tutup dan buka lagi aplikasi untuk update.`);
    } else if (!silent) {
      toast('Aplikasi sudah versi terbaru (' + APP_VERSION + ')');
    }
  } catch (e) {
    console.error('[checkForUpdate]', e);
    if (!silent) toast('Gagal memeriksa pembaruan. Periksa koneksi internet.');
  }
}

function parseHash() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/').filter(Boolean);
  const route = parts[0] || 'dashboard';
  const params = parts.slice(1);
  return { route, params };
}

async function handleRouteChange() {
  const token = ++currentToken;
  const { route, params } = parseHash();

  const isTopLevel = TOP_LEVEL_ROUTES.includes(route) && params.length === 0;
  const hasWideSidebar = window.matchMedia('(min-width:800px)').matches;
  const keepDesktopSettingsNav = route === 'settings' && hasWideSidebar;
  btnBack.classList.toggle('hidden', isTopLevel);
  btnMenu.classList.toggle('hidden', !isTopLevel);
  bottomnav.classList.toggle('hidden', !isTopLevel && !keepDesktopSettingsNav);
  // Di mobile semua halaman pengaturan memakai satu tombol "Lainnya";
  // sub-menu tetap bisa memiliki tombol spesifik di sidebar desktop.
  const navRoute = !hasWideSidebar && (['customers', 'reports'].includes(route) || route === 'settings')
    ? 'settings'
    : route === 'settings' && params.length
      ? (params[0] === 'autobackup' ? 'settings/backup' : `settings/${params[0]}`)
      : route;
  document.querySelectorAll('.nav-btn').forEach((b) => {
    const active = b.dataset.route === navRoute;
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });

  const page = route === 'sale'
    ? (params[0] === 'new' ? 'sale-new' : params[1] === 'edit' ? 'sale-edit' : 'sale-detail')
    : route;
  const section = route === 'settings' ? (params[0] || 'hub') : '';
  const loader = PAGE_LOADERS[route];
  pageRoot.dataset.pendingPage = page;
  pageRoot.dataset.pendingSection = section;
  if (!loader) {
    pageRoot.dataset.page = 'not-found';
    pageRoot.dataset.section = '';
    delete pageRoot.dataset.pendingPage;
    delete pageRoot.dataset.pendingSection;
    pageRoot.innerHTML = `<div class="empty-state"><p>Halaman tidak ditemukan.</p></div>`;
    return;
  }

  try {
    const mod = await loader();
    if (token !== currentToken) return; // route berubah lagi sebelum modul selesai dimuat — buang hasil ini
    await mod.render(pageRoot, params);
    if (token !== currentToken) return;
    // Pertahankan CSS halaman lama sampai DOM halaman baru siap agar tidak
    // menampilkan konten lama dengan selector CSS milik halaman tujuan.
    pageRoot.dataset.page = page;
    pageRoot.dataset.section = section;
    delete pageRoot.dataset.pendingPage;
    delete pageRoot.dataset.pendingSection;
  } catch (e) {
    console.error('[router]', e);
    if (token !== currentToken) return;
    pageRoot.dataset.page = page;
    pageRoot.dataset.section = section;
    delete pageRoot.dataset.pendingPage;
    delete pageRoot.dataset.pendingSection;
    pageRoot.innerHTML = `<div class="empty-state"><p>Gagal memuat halaman. Coba muat ulang aplikasi.</p></div>`;
  }
}

// Bottom nav & drawer wiring
document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => navigate(btn.dataset.route));
});
document.querySelectorAll('.drawer-item').forEach((btn) => {
  if (!btn.dataset.route) return; // tombol tema ditangani js/theme.js
  btn.addEventListener('click', () => {
    navigate(btn.dataset.route);
    closeDrawer();
  });
});
function openDrawer() { drawer.classList.add('open'); drawerOverlay.classList.remove('hidden'); }
function closeDrawer() { drawer.classList.remove('open'); drawerOverlay.classList.add('hidden'); }
btnMenu.addEventListener('click', openDrawer);
drawerOverlay.addEventListener('click', closeDrawer);
btnBack.addEventListener('click', () => navigateBack());

window.addEventListener('hashchange', handleRouteChange);

// ---------------- Service worker + update check ----------------
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
    // Selalu periksa service worker saat aplikasi dibuka, termasuk domain produksi.
    reg.update().catch(() => {});
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          import('./ui/toast.js').then(({ toast }) => toast('Update tersedia — memuat versi terbaru...'));
          setTimeout(() => location.reload(), 1200);
        }
      });
    });
  }).catch(() => {});
}

// ---------------- Boot ----------------
(async function boot() {
  if (!window.location.hash) window.location.hash = '#/dashboard';
  await handleRouteChange();
  // Pastikan pengingat sinkronisasi tampil sebelum aplikasi mulai memuat
  // navigasi tambahan atau menjalankan aktivitas latar belakang lain.
  await checkAutomaticSync({ promptIfNeeded: true });
  registerServiceWorker();
  import('./installPrompt.js').then(({ initInstallPrompt }) => initInstallPrompt());
  runBackgroundChecks();
  warmNavigation();
  scheduleAutomaticStatusRollover();
  setInterval(() => checkAutomaticBackup(), 60000);
  setInterval(() => checkAutomaticSync(), 60000);
  window.addEventListener('online', checkAutomaticBackup);
  window.addEventListener('online', () => checkAutomaticSync({ force: true, promptIfNeeded: true }));

  // Ulangi pengecekan tiap kali aplikasi kembali aktif (mis. HP dibuka lagi
  // setelah dikunci) — ini bagian dari pendekatan "catch-up" untuk aturan
  // auto-lunas & jadwal backup, lihat komentar di saleService.js dan
  // driveBackupService.js soal batasan "otomatis" pada web app statis.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      runBackgroundChecks();
      checkAutomaticSync({ promptIfNeeded: true });
    }
  });
})();

// Muat modul halaman dan data form yang paling sering dipakai saat browser
// sedang senggang. Klik pertama (terutama "+ Nota Baru") tidak lagi harus
// menunggu download/parse modul atau pembacaan daftar produk.
function warmNavigation() {
  const warm = () => {
    Promise.allSettled([
      ...Object.values(PAGE_LOADERS).map((loader) => loader()),
      import('./pages/createSale.js'),
      import('./pages/saleEdit.js'),
      import('./pages/saleDetail.js'),
      import('./services/productService.js').then(({ getAllProducts }) => getAllProducts()),
      import('./services/customerService.js').then(({ getAllCustomers }) => getAllCustomers()),
    ]);
  };
  if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 1200 });
  else setTimeout(warm, 0);
}

// Only one timer at midnight; no repeated full-database polling while idle.
function scheduleAutomaticStatusRollover() {
  const nextDay = new Date();
  nextDay.setHours(24, 0, 1, 0);
  setTimeout(async () => {
    await refreshAutomaticStatuses();
    scheduleAutomaticStatusRollover();
  }, Math.max(1000, nextDay.getTime() - Date.now()));
}

async function refreshAutomaticStatuses() {
  try {
    const { applyAutomaticStatusRules } = await import('./services/saleService.js');
    const changed = await applyAutomaticStatusRules();
    if (changed > 0) {
      const { route } = parseHash();
      if (route === 'home' || route === 'dashboard' || route === 'reports') await handleRouteChange();
    }
  } catch (e) {
    console.error('[runBackgroundChecks] auto-lunas/auto-complete', e);
  }
}

async function runBackgroundChecks() {
  await refreshAutomaticStatuses();

  await checkAutomaticBackup();
}

async function checkAutomaticBackup() {
  try {
    const { checkScheduleOnAppOpen } = await import('./services/driveBackupService.js');
    await checkScheduleOnAppOpen();
  } catch (e) {
    console.error('[runBackgroundChecks] auto-backup', e);
  }
}

async function checkAutomaticSync(options = {}) {
  try {
    const { checkAutomaticSync: sync } = await import('./services/driveBackupService.js');
    await sync(options);
  } catch (e) {
    console.error('[runBackgroundChecks] auto-sync', e);
  }
}
