// sw.js — cache-first untuk app shell, supaya:
// 1. Kunjungan kedua dst SANGAT cepat (semua file JS/CSS diambil dari cache lokal, bukan jaringan)
// 2. Aplikasi tetap bisa dibuka walau offline
// 3. Auto-update: begitu file di GitHub berubah dan CACHE_VERSION dinaikkan,
//    versi baru diunduh di background lalu dipakai saat aplikasi dibuka ulang.

const CACHE_VERSION = 'notaku-web-v1.0.0'; // naikkan setiap rilis

const CORE_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/format.js',
  './js/version.js',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS)));
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
  // Jangan cache dependency eksternal besar (sql.js/html2canvas dari CDN) di
  // service worker kita — biarkan browser HTTP cache yang urus itu, supaya
  // sw.js sendiri tetap ringan dan cepat di-update.
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => cached);
      // Cache-first untuk kecepatan transisi; update cache di background (stale-while-revalidate).
      return cached || network;
    })
  );
});
