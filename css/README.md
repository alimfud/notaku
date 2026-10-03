# Pengaturan CSS NotaKu

- `style.css`: komponen dasar bersama (navigasi, tombol, popup, struktur field).
- `theme.css`: tema marun berwarna dan navigasi responsif; palet layar tidak mengubah warna struk.
- `pages/dashboard.css`: beranda ringkasan usaha, akses cepat, dan jadwal pengambilan.
- `neo.css`: tema "Neo Dark" 3D (navy, tombol pil gradasi amber/oranye/koral, kartu berbayangan lembut); hanya aktif saat pengguna memilih tema Gelap (Setting atau menu samping); tema Terang memakai maroon asli. Struk tidak diubah.
- `glass.css`: tema "Glass" (kaca buram biru muda, tombol pil gradasi biru-cyan); hanya aktif saat dipilih di Setting atau menu samping. Struk tidak diubah.
- `clay.css`: tema "Clay" (pastel 3D ala tanah liat: krem, mint, peach, tombol koral); hanya aktif saat dipilih di Setting atau menu samping. Struk tidak diubah.
- `charts.css`: grafik harian dan diagram status pembayaran pada Beranda/Laporan, tanpa dependensi jaringan.
- `pages/home.css`: daftar nota, tanggal, dan nomor invoice.
- `pages/products.css`: daftar produk dan popup tambah/ubah produk.
- `pages/customers.css`: daftar pelanggan dan popup pelanggan.
- `pages/expenses.css`: pengeluaran dan popup tambah/ubah pengeluaran.
- `pages/reports.css`: laporan dan keterangan jumlah nota.
- `pages/settings.css`: pengaturan, termasuk Info Toko, Nomor Nota, dan QRIS.
- `pages/sale-new.css`: form nota baru dan popup-nya.
- `pages/sale-edit.css`: form ubah nota dan popup-nya.
- `pages/sale-form.css`: tampilan profesional bersama untuk form nota baru/ubah nota dan popup terkait.
- `pages/sale-detail.css`: halaman Detail Nota dan popup pembayaran.
- `receipt.css`: komponen struk, logo, dan preview Bluetooth.

Untuk mengubah satu halaman, gunakan file halaman tersebut dengan awalan
`[data-page="..."]`. Jangan menambahkan `.field` atau `.row-meta` tanpa awalan
halaman di stylesheet halaman. Setiap selector ditulis dalam blok tersendiri.

Contoh khusus Ubah Nota:

```css
[data-page="sale-edit"] .field { text-align-last: center; }
```

Contoh khusus Info Toko:

```css
[data-page="settings"][data-section="store"] .field { padding: 12px 16px; }
```

Router memberi atribut halaman pada `pageRoot`. Popup menyalin atribut itu
saat dibuka, jadi pengaturan popup produk tidak mengikuti CSS form nota.
