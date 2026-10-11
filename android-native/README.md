# NotaKu Native Android

Proyek ini adalah fondasi APK native Kotlin/Jetpack Compose. Tidak ada Capacitor atau WebView.

## Build

Di GitHub Actions, push biasa menghasilkan APK debug sebagai artifact. Tag `v1.35.0` atau versi berikutnya menghasilkan APK release di GitHub Releases.

```bash
gradle assembleDebug
```

Versi aplikasi saat ini mengikuti `version.json` di root repository dan perlu dinaikkan bersamaan sebelum membuat tag release.

Fitur aplikasi web sedang dimigrasikan ke modul native secara bertahap. Jangan menghapus aplikasi lama dari perangkat sebelum migrasi database selesai.
