# Setup Google Drive untuk Backup Otomatis

Fitur "Atur Backup Otomatis" butuh sebuah **OAuth Client ID** dari Google —
gratis, sekali bikin, tidak perlu kartu kredit. Ini terikat ke akun Google
kamu sendiri (bukan sesuatu yang bisa disediakan siap pakai di dalam kode),
persis seperti aplikasi lain (mis. e-Nota) yang juga minta kamu login Google
sendiri untuk fitur Drive-nya.

## Langkah-langkah

1. Buka https://console.cloud.google.com dan login dengan akun Google kamu.
2. Klik **Buat Proyek Baru** (New Project) di pojok kiri atas → beri nama
   bebas, misal "NotaKu" → Create.
3. Di kotak pencarian atas, ketik **"Google Drive API"** → klik hasil yang
   muncul → klik **Enable**.
4. Buka menu **APIs & Services → OAuth consent screen**:
   - User Type: pilih **External** → Create.
   - Isi App name: `NotaKu`, User support email: email kamu, Developer
     contact: email kamu → Save and Continue terus sampai selesai.
   - Di bagian **Test users**, tambahkan alamat email Google yang akan
     dipakai untuk login ke fitur backup ini (email kamu sendiri, dan email
     staf lain kalau ada).
5. Buka menu **APIs & Services → Credentials** → klik **Create Credentials
   → OAuth client ID**.
   - Application type: **Web application**.
   - Name: bebas, misal `NotaKu Web`.
   - **Authorized JavaScript origins**: isi alamat GitHub Pages kamu, contoh:
     `https://USERNAME.github.io`
     (tanpa garis miring di akhir, dan HARUS persis sama dengan alamat yang
     dipakai buka NotaKu — kalau pakai custom domain, isi domain itu).
   - Klik **Create**.
6. Akan muncul **Client ID** (format panjang diakhiri `.apps.googleusercontent.com`).
   Copy nilai itu.
7. Buka file `js/config.js` di project NotaKu kamu, ganti baris:
   ```js
   export const GOOGLE_CLIENT_ID = 'ISI_DENGAN_CLIENT_ID_GOOGLE_CLOUD_MU';
   ```
   menjadi:
   ```js
   export const GOOGLE_CLIENT_ID = 'xxxxxxxxxx.apps.googleusercontent.com';
   ```
   (pakai Client ID kamu sendiri)
8. Upload ulang file `js/config.js` yang sudah diubah ke GitHub (timpa yang lama).
9. Buka NotaKu → Setting → Backup/Restore → Atur Backup Otomatis →
   "Hubungkan Akun Google Drive" → pilih akun Google yang tadi didaftarkan
   sebagai Test User di langkah 4.

## Kalau muncul peringatan "Google hasn't verified this app"

Ini normal untuk app yang masih mode "Testing" (belum disubmit untuk
verifikasi Google, yang prosesnya bisa berminggu-minggu dan biasanya cuma
perlu untuk aplikasi publik besar). Klik **Advanced → Go to NotaKu (unsafe)**
untuk lanjut — ini aman karena ini aplikasimu sendiri, kamu yang membuat
credential-nya. Peringatan ini hanya akan muncul untuk email yang terdaftar
sebagai Test User; orang lain di luar daftar itu tidak akan bisa login sama
sekali (dan itu bagus, supaya tidak sembarang orang bisa pakai fitur ini).

## Batasan yang perlu diketahui

- Mode Testing di Google Cloud membatasi maksimal **100 test user** dan
  **refresh token kadaluarsa setelah 7 hari** — artinya kamu perlu klik
  "Hubungkan Akun Google Drive" ulang setiap minggu kalau app dipakai jarang.
  Kalau backup otomatis penting untuk dipakai terus-menerus tanpa perlu
  login ulang, submit app untuk verifikasi Google (gratis, tapi butuh
  proses review beberapa hari — ikuti tombol "Publish App" di OAuth consent
  screen).
- Baca juga catatan jujur soal keterbatasan "otomatis" di komentar bagian
  atas `js/services/driveBackupService.js` — backup di jam PERSIS yang
  dijadwalkan hanya terjamin kalau aplikasi kebetulan dibuka sekitar jam itu.
