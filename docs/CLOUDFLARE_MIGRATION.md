# Migrasi Cloudflare NotaKu

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
