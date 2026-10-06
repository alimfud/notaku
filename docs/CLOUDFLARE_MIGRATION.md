# Migrasi Cloudflare NotaKu

## Catatan penting untuk bantuan berikutnya

NotaKu sedang dimigrasikan dari Vercel ke Cloudflare Pages. Domain utama yang
dipakai saat ini adalah `https://nota.jajan.my.id`. Jika meminta bantuan
migrasi/deployment, pahami konteks berikut:

- Frontend adalah PWA statis dan data usaha utama berada di IndexedDB browser.
- Endpoint login Google berada di `/api/google` dan dijalankan sebagai Pages
  Function melalui `functions/api/google.js`.
- Google Drive dipakai langsung dari browser untuk backup dan sinkronisasi.
- Upstash Redis saat ini hanya menyimpan session Google persisten dan token
  yang disegel; Upstash tidak menyimpan data transaksi NotaKu.
- `APP_ORIGINS` harus memuat origin HTTPS secara persis tanpa slash akhir.
- Jangan memakai `npx wrangler deploy` pada project Pages. Deploy dilakukan
  oleh Cloudflare Pages dari branch GitHub `main`.

## Rencana penyederhanaan di masa depan

Konfigurasi saat ini sengaja mempertahankan Upstash agar migrasi session dari
backend Vercel mudah dan aman. Namun target jangka panjang adalah Cloudflare
only agar pengelolaan cukup melalui Google Cloud Console dan Cloudflare.

Rencana migrasi tahap berikutnya:

1. Ganti Upstash Redis dengan Cloudflare KV atau Durable Object sebagai
   penyimpanan session.
2. Pertahankan cookie HttpOnly, Secure, SameSite=Lax dan enkripsi token.
3. Pastikan logout, refresh token, expiry session, dan isolasi antar-domain
   tetap berjalan sebelum menghapus Redis.
4. Setelah seluruh sesi lama tidak diperlukan, hapus variable Upstash dari
   Cloudflare dan perbarui dokumentasi environment variable.

Jangan menghapus Upstash hanya dengan menghapus environment variable. Backend
harus diubah lebih dulu agar session tidak gagal dan pengguna tidak kehilangan
akses secara diam-diam.

## Pages setup

- Framework preset: `None`
- Production branch: `main`
- Build command: `exit 0`
- Build output directory: `.`
- Root directory: kosong
- Deploy command: jangan isi `npx wrangler deploy`

Pages Functions memakai `functions/api/google.js` untuk endpoint `/api/google`.

## Environment variables

Tambahkan di Cloudflare Pages → Settings → Variables and Secrets, untuk
Production dan Preview bila diperlukan:

- `APP_ORIGINS`: origin HTTPS yang dipakai, misalnya `https://rekening.example`;
  jangan menambahkan slash di akhir.
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET` sebagai secret
- `SESSION_ENCRYPTION_KEY` sebagai secret: 32 random bytes dalam base64
- `SESSION_DAYS`: opsional, default `180`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN` sebagai secret

Di Google Cloud Console, tambahkan callback:

`https://DOMAIN_NOTAKU/api/google?action=callback`

Aktifkan Node.js compatibility untuk Pages Functions karena adapter memakai
`node:crypto`. Setelah itu deploy ulang.
