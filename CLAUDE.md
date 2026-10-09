# NotaKu — Pedoman Project

## Arsitektur
NotaKu adalah PWA statis (HTML/CSS/JavaScript ES modules) dengan hash-router. UI halaman ada di `js/pages`, logika bisnis di `js/services`, dan akses data hanya melalui `js/db.js`.

## Struktur folder
- `index.html`, `js/app.js`: shell aplikasi dan router.
- `js/pages/`: halaman Nota, Produk, Pelanggan, Pengeluaran, Laporan, Setting.
- `js/services/`: transaksi, pengeluaran, laporan, cetak, backup, sinkronisasi.
- `js/services/printing/`: ESC/POS dan Bluetooth BLE.
- `css/`: tampilan aplikasi; `sw.js`: cache PWA.

## Fitur utama
Invoice/transaksi, pembayaran, produk, pelanggan, pengeluaran, laporan, QRIS, backup/restore, serta cetak browser dan Bluetooth thermal.

## Database dan penyimpanan
Semua data permanen berada di IndexedDB `notaku-db`: `products`, `customers`, `sales`, `saleItems`, `payments`, `expenses`, dan `settings`. Jangan akses IndexedDB langsung dari halaman; gunakan `js/db.js` atau service terkait. Migrasi store wajib menaikkan `DB_VERSION`.

## Sync dan backup
`backupService` selalu dump/restore seluruh store. Google Drive memakai backup arsip terjadwal dan satu file sinkron antarperangkat; auto-sync memeriksa pada interval pilihan (default lima menit) saat app terbuka dan menggabungkan perubahan semua perangkat berdasarkan ID. Konflik pada ID yang sama memakai `updatedAt` terbaru; `saleItems` mengikuti versi induk `sales`. Setelah restore, cache settings harus di-invalidasi. Jangan mengubah format payload tanpa tetap menerima backup lama.

## Offline dan cache
`sw.js` melakukan precache app shell; data tetap tersedia dari IndexedDB offline. Jika menambah modul yang dipakai saat offline, masukkan ke `CORE_ASSETS` dan naikkan `CACHE_VERSION` bersama `version.json`/`js/version.js`.

## Bluetooth printing
Gunakan `EscPosBuilder` untuk alignment ESC/POS, bukan spasi manual. Lebar karakter mengikuti setting 32 (58mm) atau 48 (80mm). Jaga struk ringkas: tanpa QTY/SUBTOTAL, tampilkan TOTAL dan komponen opsional. Bluetooth web hanya mendukung printer BLE di Chrome/Edge.

## Aturan coding
Jangan rewrite bagian yang berfungsi. Pertahankan ES modules tanpa dependency baru jika tidak perlu. Sanitasi teks HTML dengan `escapeHtml`; format uang/tanggal dengan `format.js`; validasi dan simpan melalui service. Fitur baru yang berupa data wajib masuk dump/restore dan laporan bila relevan.

## Menjalankan dan menguji
Jalankan dari web server XAMPP pada folder ini, misalnya `http://localhost/notaku/`. Uji pembuatan/edit/hapus data, refresh aplikasi, backup lalu restore, mode offline setelah app shell termuat, dan cetak di 58/80mm bila perangkat tersedia. Pemeriksaan sintaks dapat memakai `node --check <file>`.

## Jangan diubah sembarangan
Jangan menghapus/mengosongkan store, menaikkan versi database tanpa migrasi, membuat restore parsial, atau menghilangkan fallback cache offline. Pertahankan merge otomatis sinkronisasi dan kompatibilitas payload lama. Jangan mengandalkan spasi untuk layout printer.
