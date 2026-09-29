# NotaKu Android

NotaKu Android membundel seluruh HTML, CSS, JavaScript, gambar, dan database IndexedDB ke aplikasi Android Capacitor. Aplikasi tidak membuka GitHub Pages di dalam browser dan tetap dapat dipakai offline.

## Build lokal

```powershell
npm install
npm run android:sync
cd android
.\gradlew.bat assembleDebug
```

APK debug berada di `android/app/build/outputs/apk/debug/app-debug.apk`.

## Rilis dan pembaruan lewat GitHub

Workflow `.github/workflows/android-apk.yml` membangun APK pada setiap push ke `main`. Tag `v...` (contoh `v1.7.1`) membangun APK release bertanda tangan dan memasangnya ke GitHub Releases. Aplikasi memeriksa rilis terbaru saat dibuka dan tombol **Cek Pembaruan** dapat dipakai untuk pemeriksaan manual. Jika ada versi baru, NotaKu mengunduh APK langsung lalu membuka pemasang Android untuk memperbarui aplikasi tanpa menghapus data.

Pada penggunaan pertama updater, Android meminta izin **Instal aplikasi tidak dikenal** untuk NotaKu. Setiap pembaruan tetap menampilkan konfirmasi pemasangan milik Android; instalasi sepenuhnya tanpa konfirmasi hanya tersedia bagi aplikasi sistem/perangkat terkelola.

Tampilan Android memakai pembesaran teks WebView 110% agar tulisan tidak tampak lebih kecil daripada versi browser. Seluruh halaman, data, dan aturan tampilan tetap berasal dari HTML/JS/CSS yang sama.

Empat GitHub Actions secret wajib untuk rilis:

- `ANDROID_KEYSTORE_BASE64`: isi `android/notaku-release.jks` dalam Base64.
- `ANDROID_KEYSTORE_PASSWORD`: nilai `storePassword` dari `android/keystore.properties`.
- `ANDROID_KEY_ALIAS`: `notaku`.
- `ANDROID_KEY_PASSWORD`: nilai `keyPassword` dari `android/keystore.properties`.

Jangan kehilangan atau mengganti `notaku-release.jks`. Android hanya dapat memperbarui APK lama dengan APK baru yang memakai kunci yang sama.
