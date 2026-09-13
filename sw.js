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
// Yang TIDAK bisa dipakai offline (butuh koneksi karena filenya besar & dari
// CDN eksternal): impor database lama (perlu sql.js) dan bagikan-sebagai-
// gambar (perlu html2canvas). Fitur inti (lihat/buat/ubah nota, produk,
// pelanggan, laporan, cetak, backup lokal) semuanya tetap jalan offline.

const CACHE_VERSION = 'notaku-web-v1.4.1'; // naikkan setiap rilis

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

  // Aset lain: cache-first (kecepatan transisi), lalu perbarui cache di
  // background kalau memang perlu ambil dari jaringan. PENTING: jalur ini
  // sekarang dijamin SELALU mengembalikan sebuah Response yang valid —
  // tidak pernah `undefined` — supaya tidak mengulang bug yang sama.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => new Response('', { status: 504, statusText: 'Offline dan belum pernah di-cache' }));
    })
  );
});
