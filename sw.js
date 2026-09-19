// sw.js — ONLINE-FIRST + OFFLINE FALLBACK.
//
// Prinsip (sesuai permintaan):
//   - Saat ONLINE  : Server → ambil versi terbaru → simpan ke cache → pakai
//                    versi terbaru. Jadi user SELALU otomatis ikut kode
//                    terbaru dari server, tanpa perlu Clear Cache/Storage
//                    manual setelah ada perubahan kode.
//   - Saat OFFLINE : pakai cache terakhir → aplikasi tetap berjalan penuh.
//
// Kenapa dulu bermasalah: strategi lama murni CACHE-FIRST, sehingga file yang
// sudah ter-cache tidak pernah diganti selama versi cache belum dinaikkan —
// user harus Clear Cache manual. Sekarang aset inti memakai NETWORK-FIRST.
//
// Semua file inti (setiap halaman & service) sengaja di-precache supaya
// offline pertama kali pun semua menu langsung bisa dibuka.

const CACHE_VERSION = 'notaku-web-v1.5.0'; // naikkan setiap rilis

const CORE_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './manifest.json',
  './version.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/app.js',
  './js/config.js',
  './js/db.js',
  './js/format.js',
  './js/version.js',
  './js/installPrompt.js',
  './js/pages/createSale.js',
  './js/pages/createSaleOrDetail.js',
  './js/pages/customers.js',
  './js/pages/home.js',
  './js/pages/products.js',
  './js/pages/reports.js',
  './js/pages/saleDetail.js',
  './js/pages/saleEdit.js',
  './js/pages/saleFormShared.js',
  './js/pages/settings.js',
  './js/services/backupService.js',
  './js/services/customerService.js',
  './js/services/driveBackupService.js',
  './js/services/invoiceNumber.js',
  './js/services/legacyImportService.js',
  './js/services/printerService.js',
  './js/services/printing/bluetoothPrinter.js',
  './js/services/printing/escpos.js',
  './js/services/productService.js',
  './js/services/reportService.js',
  './js/services/saleCalculation.js',
  './js/services/saleService.js',
  './js/services/settingsService.js',
  './js/services/sqlJsLoader.js',
  './js/ui/dialog.js',
  './js/ui/toast.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // addAll gagal semua kalau SATU URL gagal — pakai per-file supaya satu
      // aset yang gagal tidak menggagalkan seluruh precache.
      Promise.allSettled(CORE_ASSETS.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

/** Ambil dari jaringan dulu; kalau berhasil, perbarui cache; kalau gagal, pakai cache. */
async function networkFirst(request) {
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
    }
    return res;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Fallback khusus navigasi: sajikan index.html dari cache supaya SPA tetap
    // terbuka saat offline.
    if (request.mode === 'navigate') {
      const shell = await caches.match('./index.html');
      if (shell) return shell;
    }
    return new Response('', { status: 504, statusText: 'Offline dan belum pernah di-cache' });
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Dependency eksternal besar (sql.js/html2canvas dari CDN) — biarkan
  // browser HTTP cache yang urus, service worker kita tidak ikut campur.
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
        .then((res) => res || Response.error())
    );
    return;
  }

  // version.json HARUS SELALU diambil langsung dari jaringan — tujuannya
  // memang mengecek versi TERBARU, jadi tidak boleh pernah dilayani dari
  // cache. Selalu mengembalikan Response valid (walau offline).
  if (url.pathname.endsWith('version.json')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(() => caches.match('./version.json'))
        .then((res) => res || new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }))
    );
    return;
  }

  // Aset inti (HTML/CSS/JS/dll): NETWORK-FIRST + fallback cache.
  // Ini kunci "user tidak perlu Clear Cache manual" — begitu kode di server
  // berubah, kunjungan berikutnya otomatis memakai versi terbaru.
  event.respondWith(networkFirst(event.request));
});
