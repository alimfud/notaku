// sw.js — cache-first untuk app shell, supaya:
// 1. Kunjungan kedua dst SANGAT cepat (semua file JS/CSS diambil dari cache lokal, bukan jaringan)
// 2. APLIKASI TETAP BISA DIBUKA & DIPAKAI PENUH SAAT OFFLINE, asalkan sudah
//    pernah dibuka sekali sebelumnya dalam keadaan online (mis. setelah
//    di-install). Ini prioritas penting: kalau koneksi internet toko
//    bermasalah, aplikasi nota TETAP JALAN karena semua kode (JS/CSS) dan
//    data (IndexedDB, di luar service worker) ada di HP, bukan di server.
// 3. Auto-update: begitu file di GitHub berubah dan CACHE_VERSION dinaikkan,
//    versi baru diunduh di background lalu dipakai saat aplikasi dibuka ulang.
//
// SEMUA file inti (setiap halaman, setiap service, bukan cuma app.js) sengaja
// di-precache di sini (bukan dibiarkan ke-cache "nanti kalau pernah dibuka"),
// supaya offline pertama kali pun semua menu (Nota/Produk/Pelanggan/Laporan/
// Setting) langsung bisa dibuka, bukan cuma halaman yang kebetulan pernah
// dikunjungi.
//
// Impor database lama memerlukan koneksi untuk sql.js. Modul gambar/PDF
// disimpan lokal dan di-precache, termasuk logo bawaan. Fitur inti (lihat/buat/ubah nota, produk,
// pelanggan, laporan, cetak, backup lokal) semuanya tetap jalan offline.

const CACHE_VERSION = 'notaku-web-v1.35.8'; // dibuat otomatis dari version.json

const CORE_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './css/theme.css',
  './css/charts.css',
  './css/neo.css',
  './css/clay.css',
  './css/bottomnav.css',
  './css/motion.css',
  './css/thermal-loader.css',
  './js/ui/businessCharts.js',
  './css/pages/dashboard.css',
  './js/pages/dashboard.js',
  './js/ui/productImage.js',
  './css/receipt.css',
  './css/pages/home.css',
  './css/pages/products.css',
  './css/pages/customers.css',
  './css/pages/expenses.css',
  './css/pages/reports.css',
  './css/pages/settings.css',
  './css/pages/sale-new.css',
  './css/pages/sale-edit.css',
  './css/pages/sale-form.css',
  './css/pages/sale-detail.css',
  './docs/logo.webp',
  './js/vendor/html2canvas.min.js',
  './js/vendor/jspdf.umd.min.js',
  './js/services/receiptLogo.js',
  './manifest.json',
  './version.json',
  './icons/favicon-32.png?v=2',
  './icons/favicon.svg?v=2',
  './icons/icon-180.png?v=printer-2',
  './icons/icon-192.png?v=printer-2',
  './icons/icon-512.png?v=printer-2',
  './icons/icon-maskable-512.png?v=printer-2',
  './js/app.js',
  './js/theme.js',
  './js/navIndicator.js',
  './js/motion.js',
  './js/config.js',
  './js/db.js',
  './js/format.js',
  './js/version.js',
  './js/installPrompt.js',
  './js/pages/createSale.js',
  './js/pages/createSaleOrDetail.js',
  './js/pages/customers.js',
  './js/pages/expenses.js',
  './js/pages/home.js',
  './js/pages/products.js',
  './js/pages/reports.js',
  './js/pages/saleDetail.js',
  './js/pages/saleEdit.js',
  './js/pages/saleFormShared.js',
  './js/pages/settings.js',
  './js/services/backupService.js',
  './js/services/customerService.js',
  './js/services/expenseService.js',
  './js/services/driveBackupService.js',
  './js/services/googleSessionService.js',
  './js/services/invoiceNumber.js',
  './js/services/legacyImportService.js',
  './js/services/printerService.js',
  './js/services/qrisService.js',
  './js/services/printing/bluetoothPrinter.js',
  './js/services/printing/escpos.js',
  './js/services/productService.js',
  './js/services/reportService.js',
  './js/services/saleCalculation.js',
  './js/services/saleService.js',
  './js/services/saleDraftService.js',
  './js/services/reminderService.js',
  './js/services/automaticSettlement.js',
  './js/services/settingsService.js',
  './js/services/sqlJsLoader.js',
  './js/ui/dialog.js',
  './js/ui/toast.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // addAll gagal semua kalau SATU URL gagal — pakai per-file supaya satu
      // aset yang gagal (mis. karena path relatif beda saat dev lokal) tidak
      // menggagalkan seluruh precache.
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

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Dependency eksternal besar (sql.js/html2canvas dari CDN) — biarkan
  // browser HTTP cache yang urus, service worker kita tidak ikut campur.
  // OAuth redirects and authenticated API responses must never enter the cache.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;
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
  // cache (baik cache SW maupun cache HTTP browser). Sebelumnya file ini
  // dilayani lewat jalur cache-first umum di bawah, dan karena URL-nya
  // diberi query string pembeda (?t=...) supaya tidak kena cache, itu
  // JUSTRU membuat servicenya SELALU cache-miss di sini — begitu fetch
  // jaringannya gagal karena sebab apa pun (walau cuma hiccup sesaat),
  // .catch() jatuh ke `cached` yang undefined, dan respondWith(undefined)
  // dianggap error KERAS oleh browser ("Failed to fetch") walau internet
  // sebenarnya menyala. Ini bug yang sudah diperbaiki di sini: sekarang
  // request ke version.json ditangani terpisah, tidak lewat cache lookup
  // sama sekali, dan SELALU mengembalikan Response yang valid.
  if (url.pathname.endsWith('version.json')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(() => caches.match('./version.json')) // fallback offline: versi lama yang sempat ter-precache
        .then((res) => res || new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }))
    );
    return;
  }

  // Halaman, JS, dan CSS selalu diambil dari jaringan dahulu. Ini membuat
  // perubahan yang sudah di-push langsung terlihat tanpa membersihkan cache;
  // cache tetap menjadi fallback ketika offline.
  const brandingAsset = url.pathname.endsWith('/manifest.json') || /\/icons\//.test(url.pathname);
  const liveAsset = event.request.mode === 'navigate' || event.request.destination === 'script' || event.request.destination === 'style' || brandingAsset;
  if (liveAsset) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' }).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
        }
        return res;
      }).catch(() => caches.match(event.request).then((cached) => cached || new Response('', {
        status: 504,
        statusText: 'Offline dan aset belum tersedia di cache',
      })))
    );
    return;
  }

  // Cache-first: navigasi dan import modul harus langsung memakai app shell
  // lokal. Versi baru tetap aman karena perubahan sw.js memasang CACHE_VERSION
  // baru secara atomik, sedangkan version.json memang ditangani network-first
  // pada blok khusus di atas.
  event.respondWith(
    caches.match(event.request).then((cached) => cached ||
      fetch(event.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
        }
        return res;
      }).catch(() => new Response('', { status: 504, statusText: 'Offline dan belum pernah di-cache' }))
    )
  );
});
