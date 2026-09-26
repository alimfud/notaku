# Pembaruan otomatis NotaKu (PWA)

1. Upload isi folder ini ke root repository GitHub NotaKu, termasuk folder `.github` dan `scripts`.
2. Sekali saja: GitHub repository → Settings → Pages → Build and deployment → **Source: GitHub Actions** (bukan Deploy from a branch). Workflow akan menjalankan `scripts/prepare_release.py` pada setiap push `main`.
3. Setelah deployment, HP dengan internet akan mengambil versi terbaru saat NotaKu dibuka/kembali aktif. Cache offline tetap tersedia dan database IndexedDB **tidak dihapus**.
4. Setiap perubahan file aplikasi (JS/CSS/HTML/ikon) mendapatkan fingerprint rilis baru. URL ikon pada manifest dan halaman juga berubah otomatis **ketika file ikon berubah**.
5. Batasan OS: Android/iOS yang sudah menyimpan ikon shortcut di launcher dapat menolak mengganti ikonnya. Ini tidak bisa dipaksa oleh situs/PWA. Jika launcher tetap menampilkan ikon lama, pengguna perlu menghapus **shortcut/aplikasi PWA saja**, lalu memasang ulang dari situs. **Jangan menghapus data browser/situs**; backup data dahulu untuk berjaga-jaga (sebagian OS dapat menghapus data PWA saat aplikasi dilepas).

Jika tidak memakai GitHub Actions, jalankan `python3 scripts/prepare_release.py` **sebelum setiap upload**. Jika hanya upload manual tanpa menjalankan skrip, deteksi setiap perubahan tidak terjamin.
