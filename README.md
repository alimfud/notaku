<<<<<<< HEAD
# NotaKu

NotaKu adalah aplikasi kasir dan nota penjualan berbasis web/PWA. Data toko disimpan lokal melalui IndexedDB, sehingga aplikasi tetap dapat dipakai setelah dibuka sekali saat online.

- **Versi saat ini:** v1.36.13
- **Versi aplikasi:** buka dari browser atau instal sebagai PWA melalui Chrome/Edge.

## Cara pakai di HP

1. Buka alamat NotaKu di Chrome atau Edge.
2. Pilih menu browser **Tambahkan ke layar utama** / **Install aplikasi**.
3. Buka NotaKu dari ikon layar utama seperti aplikasi biasa.

Tidak ada APK, Android Studio, atau proses update APK. Pembaruan HTML, CSS, dan JavaScript yang sudah dipush akan diambil saat NotaKu dibuka ketika perangkat terhubung internet. Saat offline, browser memakai salinan terakhir yang sudah tersedia.

## Pembaruan web dan cache

NotaKu memakai service worker agar dapat berjalan offline. Agar perubahan tampilan tidak tertahan cache:

- `sw.js` selalu memeriksa pembaruan saat aplikasi dibuka.
- HTML, CSS, dan JavaScript memakai strategi **jaringan dahulu, cache sebagai cadangan**.
- `version.json` tidak pernah dilayani dari cache saat jaringan tersedia.

Jadi untuk perubahan biasa, cukup edit sumber utama lalu push ke `main`. Jika browser sedang terbuka, tutup aplikasi/PWA lalu buka kembali. Untuk perubahan versi yang terencana, naikkan `version` di `version.json` dan jalankan:

```powershell
npm run version:sync
```

## Sumber utama

Backend sesi Google persisten untuk Cloudflare Pages tersedia melalui `functions/api/google.js` dan `server/`. Konfigurasinya memakai Google OAuth, `SESSION_ENCRYPTION_KEY`, dan Cloudflare KV binding `SESSIONS`.

Edit hanya berkas berikut sesuai kebutuhan:

- `index.html`, `css/`, dan `js/` untuk tampilan serta fungsi.
- `version.json` untuk nomor versi.
- `sw.js` untuk daftar aset offline dan perilaku cache.
- `manifest.json` dan `icons/` untuk instalasi PWA.

### Identitas dan layar pembuka

Ikon instalasi NotaKu mengikuti printer thermal pada animasi pembuka: printer krem Clay di atas latar gelap Neo agar siluetnya jelas pada layar utama HP. Warna latar animasi/pembuka PWA tetap Clay; perubahan warna ini khusus gambar ikon. Sumber vektornya `scripts/artwork/printer.svg`. Favicon tab browser menggunakan gambar sederhana tanpa latar di `icons/favicon.svg`, dengan fallback PNG 32×32. PNG dibuat dengan `node scripts/build-icons.cjs` (memerlukan Playwright dan Edge); skrip hanya menghasilkan ukuran yang benar-benar dipakai. Folder `icons/` berisi enam aset aktif: favicon SVG/PNG, ikon iPhone 180, ikon PWA 192/512, dan ikon maskable 512 yang memiliki ruang aman untuk pemotongan Android. Logo toko pada nota di `docs/logo.webp` bukan ikon aplikasi dan tidak diubah.

Layar pembuka pertama pada PWA terpasang dibuat oleh Android/browser, bukan HTML; layar tersebut tidak dapat menjalankan animasi CSS. Warna dan ikonnya mengikuti `manifest.json`. Setelah halaman siap, animasi printer langsung tampil tanpa layar logo statis tambahan. Pembaruan manifest/ikon pada PWA yang sudah terpasang dapat memerlukan waktu karena cache sistem; buka aplikasi saat online, tutup, lalu buka kembali setelah browser memperbaruinya. Jangan hapus data situs untuk memperbarui ikon karena transaksi tersimpan lokal.

## Pengujian

```powershell
npm test
```

## Catatan Bluetooth

Browser mendukung cetak Bluetooth langsung hanya untuk printer **BLE/GATT** pada Chrome atau Edge. Printer Bluetooth Classic/SPP perlu memakai PDF/gambar nota lalu dibagikan ke aplikasi pencetak yang sesuai.

## Riwayat

Riwayat versi dan APK lama tetap tersimpan di GitHub sebagai arsip, tetapi pengembangan NotaKu sekarang kembali fokus pada web/PWA.
=======
# NotaKu

NotaKu adalah aplikasi kasir dan nota penjualan berbasis web/PWA. Data toko disimpan lokal melalui IndexedDB, sehingga aplikasi tetap dapat dipakai setelah dibuka sekali saat online.

- **Versi saat ini:** v1.36.13
- **Versi aplikasi:** buka dari browser atau instal sebagai PWA melalui Chrome/Edge.

## Cara pakai di HP

1. Buka alamat NotaKu di Chrome atau Edge.
2. Pilih menu browser **Tambahkan ke layar utama** / **Install aplikasi**.
3. Buka NotaKu dari ikon layar utama seperti aplikasi biasa.

Tidak ada APK, Android Studio, atau proses update APK. Pembaruan HTML, CSS, dan JavaScript yang sudah dipush akan diambil saat NotaKu dibuka ketika perangkat terhubung internet. Saat offline, browser memakai salinan terakhir yang sudah tersedia.

## Pembaruan web dan cache

NotaKu memakai service worker agar dapat berjalan offline. Agar perubahan tampilan tidak tertahan cache:

- `sw.js` selalu memeriksa pembaruan saat aplikasi dibuka.
- HTML, CSS, dan JavaScript memakai strategi **jaringan dahulu, cache sebagai cadangan**.
- `version.json` tidak pernah dilayani dari cache saat jaringan tersedia.

Jadi untuk perubahan biasa, cukup edit sumber utama lalu push ke `main`. Jika browser sedang terbuka, tutup aplikasi/PWA lalu buka kembali. Untuk perubahan versi yang terencana, naikkan `version` di `version.json` dan jalankan:

```powershell
npm run version:sync
```

## Sumber utama

Backend sesi Google persisten untuk Cloudflare Pages tersedia melalui `functions/api/google.js` dan `server/`. Konfigurasinya memakai Google OAuth, `SESSION_ENCRYPTION_KEY`, dan Cloudflare KV binding `SESSIONS`.

Edit hanya berkas berikut sesuai kebutuhan:

- `index.html`, `css/`, dan `js/` untuk tampilan serta fungsi.
- `version.json` untuk nomor versi.
- `sw.js` untuk daftar aset offline dan perilaku cache.
- `manifest.json` dan `icons/` untuk instalasi PWA.

### Identitas dan layar pembuka

Ikon instalasi NotaKu mengikuti printer thermal pada animasi pembuka: printer krem Clay di atas latar gelap Neo agar siluetnya jelas pada layar utama HP. Warna latar animasi/pembuka PWA tetap Clay; perubahan warna ini khusus gambar ikon. Sumber vektornya `scripts/artwork/printer.svg`. Favicon tab browser menggunakan gambar sederhana tanpa latar di `icons/favicon.svg`, dengan fallback PNG 32×32. PNG dibuat dengan `node scripts/build-icons.cjs` (memerlukan Playwright dan Edge); skrip hanya menghasilkan ukuran yang benar-benar dipakai. Folder `icons/` berisi enam aset aktif: favicon SVG/PNG, ikon iPhone 180, ikon PWA 192/512, dan ikon maskable 512 yang memiliki ruang aman untuk pemotongan Android. Logo toko pada nota di `docs/logo.webp` bukan ikon aplikasi dan tidak diubah.

Layar pembuka pertama pada PWA terpasang dibuat oleh Android/browser, bukan HTML; layar tersebut tidak dapat menjalankan animasi CSS. Warna dan ikonnya mengikuti `manifest.json`. Setelah halaman siap, animasi printer langsung tampil tanpa layar logo statis tambahan. Pembaruan manifest/ikon pada PWA yang sudah terpasang dapat memerlukan waktu karena cache sistem; buka aplikasi saat online, tutup, lalu buka kembali setelah browser memperbaruinya. Jangan hapus data situs untuk memperbarui ikon karena transaksi tersimpan lokal.

## Pengujian

```powershell
npm test
```

## Catatan Bluetooth

Browser mendukung cetak Bluetooth langsung hanya untuk printer **BLE/GATT** pada Chrome atau Edge. Printer Bluetooth Classic/SPP perlu memakai PDF/gambar nota lalu dibagikan ke aplikasi pencetak yang sesuai.

## Riwayat

Riwayat versi dan APK lama tetap tersimpan di GitHub sebagai arsip, tetapi pengembangan NotaKu sekarang kembali fokus pada web/PWA.

>>>>>>> e011ddef4267c03bd6564ef9c47510b4a14d2ac0
