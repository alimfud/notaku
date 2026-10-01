# NotaKu

NotaKu adalah aplikasi kasir dan nota penjualan yang tersedia sebagai aplikasi Android mandiri dan versi web/PWA. Data toko disimpan lokal di perangkat melalui IndexedDB sehingga fitur inti tetap dapat dipakai tanpa koneksi internet.

- **Versi saat ini:** v1.7.6
- **APK Android:** [Unduh NotaKu v1.7.6](https://github.com/alimfud/notaku/releases/download/v1.7.6/NotaKu-v1.7.6.apk)
- **Riwayat rilis:** [GitHub Releases](https://github.com/alimfud/notaku/releases)

## Untuk pengguna Android

1. Unduh APK dari tautan rilis di atas.
2. Buka file APK, lalu pilih **Instal**.
3. Untuk versi berikutnya, **jangan uninstall aplikasi lama**. Instal APK baru di atas aplikasi yang sudah ada agar data nota, produk, pelanggan, dan pengaturan tetap tersimpan.

NotaKu memeriksa GitHub Releases saat aplikasi dibuka. Jika tersedia versi baru, pilih **Unduh & Update**. APK akan diunduh dari GitHub lalu pemasang Android dibuka secara otomatis.

Pada update pertama dari dalam aplikasi, Android mungkin meminta izin **Instal aplikasi tidak dikenal dari NotaKu**. Konfirmasi pemasangan Android tetap diperlukan sebagai perlindungan perangkat.

## Fitur utama

- Buat, ubah, dan kelola nota penjualan.
- Produk, pelanggan, barcode, diskon, pajak, ongkir, serta biaya tambahan.
- Riwayat pembayaran dapat ditambah, dikoreksi, atau dihapus; status pembayaran dihitung ulang otomatis.
- Dashboard dan laporan penjualan, piutang, serta pesanan tujuh hari terakhir.
- Bagikan nota sebagai teks, gambar, atau PDF; Chat WhatsApp pelanggan.
- Cetak Bluetooth BLE, dengan hasil yang mengikuti representasi nota/preview.
- QRIS, backup/restore lokal, dan integrasi backup Google Drive.
- Aset aplikasi tersedia offline; Bluetooth, berbagi file, dan penyimpanan file memakai integrasi Android pada APK.

## Satu sumber untuk web dan APK

Tampilan dan logika utama hanya diedit satu kali di sumber proyek:

- `index.html`
- `css/`
- `js/`
- `icons/`, `docs/`, `manifest.json`, dan `sw.js`

Saat APK dibuat, `npm run android:sync` menyalin aset tersebut ke bundle Android. Jangan mengedit folder `web/` atau `android/app/src/main/assets/public/` secara langsung karena keduanya adalah hasil build.

Perubahan yang dipush ke `main` langsung tersedia untuk versi web, tetapi APK yang telah terpasang tetap memakai aset yang dibundel di dalam versi sebelumnya. Untuk mengirim perubahan itu ke APK, buat rilis versi baru seperti panduan di bawah.

## Rilis APK melalui GitHub

Workflow GitHub Actions di `.github/workflows/android-apk.yml` bekerja sebagai berikut:

- Push ke `main` membuat APK debug sebagai artefak build.
- Rilis APK dilakukan dari halaman GitHub Actions dan otomatis membuat tag, APK bertanda tangan, serta GitHub Release.

Sebelum membuat rilis, naikkan nomor versi secara konsisten pada:

- `js/version.js`
- `version.json`
- `package.json` dan `package-lock.json`
- `android/app/build.gradle` (`versionCode` harus selalu bertambah)
- `sw.js` (`CACHE_VERSION`)

Setelah perubahan versi sudah di-commit dan di-push ke `main`, buka **Actions** → **Android APK** → **Run workflow**. Pilih `main`, isi **release_version** dengan format seperti `v1.7.4`, lalu klik **Run workflow**.

Setelah workflow selesai, APK muncul di halaman [GitHub Releases](https://github.com/alimfud/notaku/releases). Aplikasi NotaKu versi sebelumnya akan mendeteksi rilis tersebut sebagai pembaruan.

> Penting: jangan kehilangan `android/notaku-release.jks`. APK pembaruan harus memakai kunci penandatanganan yang sama agar Android dapat memperbarui aplikasi lama tanpa menghapus data.

## Build dan pengujian lokal

Kebutuhan: Node.js 24, JDK 21, dan Android SDK.

```powershell
npm install
npm test
npm run android:sync
cd android
.\gradlew.bat assembleDebug
```

APK debug berada di `android/app/build/outputs/apk/debug/app-debug.apk`.

Untuk APK release lokal yang telah ditandatangani, gunakan konfigurasi kunci pada `android/keystore.properties`, lalu jalankan:

```powershell
cd android
.\gradlew.bat assembleRelease
```

Dokumentasi Android yang lebih teknis tersedia di [docs/ANDROID.md](docs/ANDROID.md). Panduan backup Google Drive tersedia di [docs/DRIVE_SETUP.md](docs/DRIVE_SETUP.md).

## Versi web/PWA

Versi web tetap dapat dijalankan dari server statis atau GitHub Pages. Service worker menyimpan aset inti agar aplikasi bisa dipakai offline setelah dibuka. Pembaruan versi web memakai `version.json` dan `sw.js`.

Perlu diperhatikan bahwa browser hanya mendukung akses printer Bluetooth **BLE/GATT**. APK Android memakai jalur Bluetooth native untuk printer BLE; printer Bluetooth Classic/SPP tetap memerlukan solusi atau driver khusus dari perangkat atau printer.

## Riwayat perubahan

### v1.7.2 — 29 September 2026

- Tampilan riwayat pembayaran diperbarui.
- Form koreksi pembayaran dirapikan, termasuk tanggal, jam, catatan, dan tindakan hapus pembayaran.
- Perubahan web tersebut sekarang tersedia juga sebagai APK release.

### v1.7.1 — 29 September 2026

- Pembaruan APK dari dalam NotaKu: cek rilis GitHub, unduh APK, lalu buka pemasang Android.
- Update di atas aplikasi lama mempertahankan data selama package dan kunci penandatanganan sama.
- Ukuran teks Android dinaikkan agar lebih nyaman dibaca.

### v1.7.0 — 26 September 2026

- NotaKu dikemas sebagai APK Android mandiri berbasis Capacitor, bukan tab browser.
- Integrasi Android untuk Bluetooth BLE, berbagi nota, penyimpanan file, ikon, dan splash screen.
- GitHub Actions menyiapkan build APK dan GitHub Releases bertanda tangan.

### Sebelumnya

- Redesign marun, dashboard penjualan, foto produk, laporan pesanan tujuh hari, dan pencatatan Lunas Otomatis.
- Penyelarasan hasil preview/detail nota dengan cetak Bluetooth.
- Pengembangan fitur produk, pelanggan, laporan, backup/restore, QRIS, serta berbagi nota.
