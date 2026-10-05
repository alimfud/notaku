# Sesi Google persisten di Vercel

Kode backend tersedia di `api/google.js` dan `server/google-auth.js`. Backend belum aktif sampai environment variables dan Google OAuth diatur, lalu deployment berhasil.

## 1. Penyimpanan sesi

Hubungkan satu database Upstash Redis melalui Vercel Storage/Marketplace, atau gunakan database Redis REST yang sudah tersedia. Gunakan database khusus NotaKu. Pilih paket sesuai kebutuhan dan konfirmasi biaya sebelum membuat layanan berbayar.

Backend menerima `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, atau nama integrasi lama `KV_REST_API_URL` + `KV_REST_API_TOKEN`. Gunakan token tulis, bukan read-only.

Refresh token dan access token disimpan dalam record terenkripsi AES-256-GCM. Browser hanya memegang cookie session ID acak, HttpOnly, Secure, SameSite=Lax, tanpa refresh token. Session ID di database di-hash dan terikat domain. Sesi kedaluwarsa setelah 30 hari tanpa permintaan sesi ke backend; aktivitas sesi memperpanjangnya. Putuskan akun menghapus sesi perangkat tersebut, tanpa memutus sesi perangkat lain.

## 2. Environment variables Vercel

Pada proyek `notaku`, Settings → Environment Variables, isi untuk Production:

| Nama | Nilai |
| --- | --- |
| `APP_ORIGINS` | `https://nota.jajan.my.id,https://notakuu.vercel.app` |
| `GOOGLE_CLIENT_ID` | Client ID web yang sama dengan `js/config.js` |
| `GOOGLE_CLIENT_SECRET` | Secret dari client Google tersebut |
| `SESSION_ENCRYPTION_KEY` | 32 byte acak, dikodekan base64 |
| `UPSTASH_REDIS_REST_URL` | REST URL database Redis |
| `UPSTASH_REDIS_REST_TOKEN` | REST token database Redis |

Jangan menyimpan secret di GitHub, kode frontend, chat, atau prefix publik seperti `VITE_`/`NEXT_PUBLIC_`. Simpan encryption key yang sama lintas deployment. Mengganti key membuat sesi lama tidak dapat dibaca.

Untuk menghasilkan encryption key pada terminal pribadi:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

## 3. Google Cloud Console

Gunakan OAuth client tipe Web application yang sama dengan aplikasi saat ini. Tambahkan **Authorized redirect URIs** berikut secara persis:

```text
https://nota.jajan.my.id/api/google?action=callback
https://notakuu.vercel.app/api/google?action=callback
```

Pertahankan scope `openid email profile https://www.googleapis.com/auth/drive.file`. Aktifkan Drive API. Periksa publishing status: refresh token aplikasi eksternal berstatus Testing biasanya berakhir setelah 7 hari untuk scope Drive. Ikuti persyaratan publikasi Google jika aplikasi digunakan terus-menerus.

## 4. Deployment dan penggunaan

Deploy commit berisi backend dan frontend baru ke Vercel. Framework preset Other dengan endpoint `api/google.js`; `vercel.json` mengatur durasi function. Kedua domain harus mengarah ke proyek Vercel yang sama agar `/api/google` tersedia. Jangan mengalihkan domain secara paksa karena IndexedDB pengguna tersimpan terpisah menurut origin.

`GET /api/google?action=status` harus mengembalikan `{"configured":true}`. Ini memeriksa keberadaan konfigurasi, bukan koneksi Google/Redis. Pada penggunaan pertama, Hubungkan Google sekali dan setujui izin offline. Setelah kembali ke aplikasi, token dipulihkan otomatis lewat cookie; refresh dilakukan di backend jika akses Google kedaluwarsa.

Periksa di akun sendiri: login → reload → tutup/buka aplikasi → sinkron → putuskan akun. Uji juga setelah token akses kedaluwarsa. Jangan menjalankan backup/pull pada data usaha untuk sekadar pengujian.

Jika sesi hilang, cookie dibersihkan, atau Google mencabut izin, pengguna perlu menghubungkan sekali lagi. Backend tidak membuat aplikasi tertutup bisa membaca perubahan IndexedDB atau menjalankan jadwal lokal. Saat backend belum dikonfigurasi, metode browser sebelumnya tetap tersedia.

Referensi: [Google web server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Vercel Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js), [Upstash REST API](https://upstash.com/docs/redis/features/restapi).
