// app.js — bootstrap aplikasi & router SPA.
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

const TOP_LEVEL_ROUTES = ['home', 'products', 'customers', 'reports', 'settings'];

const PAGE_LOADERS = {
  home: () => import('./pages/home.js'),
  sale: () => import('./pages/createSaleOrDetail.js'),
  products: () => import('./pages/products.js'),
  customers: () => import('./pages/customers.js'),
  reports: () => import('./pages/reports.js'),
  settings: () => import('./pages/settings.js'),
};

let currentToken = 0;

export function setPageTitle(title) {
  pageTitleEl.textContent = title;
}

const ICONS = {
  share: '<svg viewBox="0 0 24 24"><path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  delete: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4l10.5-10.5a1.5 1.5 0 000-2.12l-1.88-1.88a1.5 1.5 0 00-2.12 0L4 16v4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
};

export function setTopbarActions(actions) {
  topbarActionsEl.innerHTML = '';
  for (const action of actions) {
    const btn = document.createElement('button');
    btn.className = 'icon-btn';
    btn.title = action.title || '';
    btn.innerHTML = ICONS[action.icon] || '';
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
  const route = parts[0] || 'home';
  const params = parts.slice(1);
  return { route, params };
}

async function handleRouteChange() {
  const token = ++currentToken;
  const { route, params } = parseHash();

  const isTopLevel = TOP_LEVEL_ROUTES.includes(route) && params.length === 0;
  btnBack.classList.toggle('hidden', isTopLevel);
  btnMenu.classList.toggle('hidden', !isTopLevel);
  bottomnav.classList.toggle('hidden', !isTopLevel);
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.route === route));

  const loader = PAGE_LOADERS[route];
  if (!loader) {
    pageRoot.innerHTML = `<div class="empty-state"><p>Halaman tidak ditemukan.</p></div>`;
    return;
  }

  try {
    const mod = await loader();
    if (token !== currentToken) return; // route berubah lagi sebelum modul selesai dimuat — buang hasil ini
    pageRoot.classList.remove('page-enter');
    // eslint-disable-next-line no-unused-expressions
    void pageRoot.offsetWidth; // restart animasi
    pageRoot.classList.add('page-enter');
    await mod.render(pageRoot, params);
  } catch (e) {
    console.error('[router]', e);
    pageRoot.innerHTML = `<div class="empty-state"><p>Gagal memuat halaman. Coba muat ulang aplikasi.</p></div>`;
  }
}

// Bottom nav & drawer wiring
document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => navigate(btn.dataset.route));
});
document.querySelectorAll('.drawer-item').forEach((btn) => {
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
  navigator.serviceWorker.register('./sw.js').then((reg) => {
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
  if (!window.location.hash) window.location.hash = '#/home';
  await handleRouteChange();
  registerServiceWorker();
  import('./installPrompt.js').then(({ initInstallPrompt }) => initInstallPrompt());
  runBackgroundChecks();

  // Ulangi pengecekan tiap kali aplikasi kembali aktif (mis. HP dibuka lagi
  // setelah dikunci) — ini bagian dari pendekatan "catch-up" untuk aturan
  // auto-lunas & jadwal backup, lihat komentar di saleService.js dan
  // driveBackupService.js soal batasan "otomatis" pada web app statis.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') runBackgroundChecks();
  });
})();

async function runBackgroundChecks() {
  try {
    const { applyAutoLunasRule, applyAutoCompleteRule } = await import('./services/saleService.js');
    const changed1 = await applyAutoLunasRule();
    const changed2 = await applyAutoCompleteRule();
    if (changed1 > 0 || changed2 > 0) {
      const { route } = parseHash();
      if (route === 'home') handleRouteChange(); // refresh list kalau lagi di Home
    }
  } catch (e) {
    console.error('[runBackgroundChecks] auto-lunas/auto-complete', e);
  }

  try {
    const { checkScheduleOnAppOpen } = await import('./services/driveBackupService.js');
    await checkScheduleOnAppOpen({
      onConfirm: async (slot) => {
        const { confirmDialog } = await import('./ui/dialog.js');
        return confirmDialog({
          title: 'Backup Terjadwal',
          message: `Sudah waktunya backup otomatis (jadwal ${slot}). Lanjutkan sekarang?`,
          confirmLabel: 'Backup Sekarang',
        });
      },
    });
  } catch (e) {
    console.error('[runBackgroundChecks] auto-backup', e);
  }
}
