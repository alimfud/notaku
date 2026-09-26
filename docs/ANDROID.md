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

Workflow `.github/workflows/android-apk.yml` membangun APK pada setiap push ke `main`. Tag `v...` (contoh `v1.7.0`) membangun APK release bertanda tangan dan memasangnya ke GitHub Releases. Tombol **Cek Pembaruan** di aplikasi Android membuka rilis terbaru jika versinya berbeda.

Empat GitHub Actions secret wajib untuk rilis:

- `ANDROID_KEYSTORE_BASE64`: isi `android/notaku-release.jks` dalam Base64.
- `ANDROID_KEYSTORE_PASSWORD`: nilai `storePassword` dari `android/keystore.properties`.
- `ANDROID_KEY_ALIAS`: `notaku`.
- `ANDROID_KEY_PASSWORD`: nilai `keyPassword` dari `android/keystore.properties`.

Jangan kehilangan atau mengganti `notaku-release.jks`. Android hanya dapat memperbarui APK lama dengan APK baru yang memakai kunci yang sama.
