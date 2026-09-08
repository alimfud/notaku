# NotaKu Web

Versi web (JavaScript murni, tanpa build tools) dari NotaKu. Logika bisnis
(kalkulasi nota, status pembayaran, penomoran invoice, laporan, backup/restore,
impor database lama) **sama persis** dengan versi Flutter — sudah diuji ulang
di sini untuk memastikan hasilnya identik.

## Cara pakai (paling cepat — coba dulu)

Tidak perlu install apa pun di komputer. Cukup:

1. Buat repository baru di GitHub (public), upload SEMUA isi folder ini
   (jangan folder `notaku-web`-nya, tapi ISINYA — `index.html` harus ada
   persis di root repo).
2. Buka **Settings → Pages** di repo itu → Branch: `main`, folder `/ (root)` → Save.
3. Tunggu 1–2 menit, GitHub kasih alamat: `https://USERNAME.github.io/NAMA-REPO/`
4. Buka alamat itu di HP. Aplikasi langsung jalan.

Detail lengkap ada di bagian [Deploy ke GitHub Pages](#deploy-ke-github-pages) di bawah.

## Kenapa dijamin tidak lemot antar halaman

- **Semua data di HP/browser sendiri** (IndexedDB) — pindah halaman tidak
  pernah menunggu jaringan, cuma baca data lokal (di bawah 1 milidetik untuk
  ukuran data toko UMKM).
- **Routing SPA** (`#/nota`, `#/produk`, dst) — pindah "halaman" cuma mengganti
  isi satu elemen HTML, bukan reload seluruh halaman dari server.
- **Modul JS dimuat sekali, di-cache browser** — halaman yang sudah pernah
  dibuka, kunjungan berikutnya instan.
- **Service worker** meng-cache seluruh app shell — bahkan saat offline atau
  sinyal lemot, aplikasi tetap terbuka cepat dari cache lokal.
- Library besar (`sql.js` untuk baca database lama, `html2canvas` untuk
  bagikan-sebagai-gambar) **sengaja TIDAK dimuat di awal** — baru diunduh
  kalau fiturnya benar-benar dipakai, supaya buka aplikasi sehari-hari tetap
  ringan.

## "Dipaksa install" di HP — realitanya

Browser (Chrome/Safari/Edge) **tidak mengizinkan** web page memaksa instalasi
tanpa ada interaksi dari pengguna — ini pembatasan keamanan dari pihak
browser, bukan keterbatasan kode ini. Yang sudah dibuat di sini, dan ini
paling maksimal yang bisa dilakukan sebuah web app:

- Banner mencolok muncul begitu aplikasi dibuka di HP, mendorong ketuk tombol
  **Install** (memicu prompt instalasi native Android Chrome/Edge).
- Kalau aplikasi sudah pernah diinstall (dibuka dalam mode "standalone"),
  banner tidak muncul lagi.
- Khusus iPhone (Safari): event instalasi otomatis tidak didukung sama sekali
  oleh Apple, jadi banner menampilkan instruksi manual ("Bagikan → Tambah ke
  Layar Utama").

Setelah diinstall, aplikasi muncul sebagai ikon sendiri di HP, terbuka layar
penuh tanpa address bar — dari segi tampilan & rasa pakai, sama seperti
aplikasi native.

## Deploy ke GitHub Pages

1. Buat repo baru di https://github.com (Public).
2. Upload semua file **di dalam** folder ini (`index.html`, `css/`, `js/`,
   `icons/`, `manifest.json`, `sw.js`, `version.json`) ke root repo tersebut.
3. Repo → **Settings → Pages** → Branch: `main`, Folder: `/(root)` → **Save**.
4. Tunggu ~1-2 menit, alamat situsnya muncul di halaman yang sama.
5. Buka alamat itu → coba install lewat banner yang muncul.

### Auto-update

Setiap kamu mengedit file di GitHub (langsung di web GitHub juga bisa) dan
menaikkan versi di dua tempat:
- `sw.js` → ubah `CACHE_VERSION` (mis. dari `v1.0.0` ke `v1.0.1`)
- `version.json` → ubah `"version"` jadi sama

...maka pengguna yang sudah install akan otomatis mengunduh versi baru di
background begitu mereka membuka aplikasi (ada notifikasi kecil, lalu reload
otomatis). Tidak perlu proses publish/submit apa pun — beda dengan Play Store.

## Fitur

Sama seperti versi Flutter: Nota (buat/lihat/**ubah**/cetak/bagikan/bayar), Produk,
Pelanggan, Laporan, Setting (info toko, nomor nota, printer), Backup/Restore,
dan **Impor Database Aplikasi Lama** (baca file `.db` dari aplikasi nota lain,
bisa dipilih dari Google Drive lewat pemilih file bawaan HP).

### Edit nota yang sudah tersimpan (v1.1.0)

Nota yang sudah disimpan **bisa diubah sepenuhnya** lewat ikon pensil di
halaman Detail Nota:
- Ganti pelanggan, tambah/hapus/ubah item (qty & harga), ubah diskon, ubah catatan.
- **Tanggal & jam transaksi bisa dikoreksi** — berguna kalau tanggal/jam yang
  tercatat otomatis (waktu nota dibuat) berbeda dari waktu pengambilan/transaksi
  sesungguhnya.
- **Riwayat pembayaran bisa dikoreksi satu per satu** — ketuk baris pembayaran
  mana pun di Detail Nota untuk mengubah nominal/tanggal/catatannya, atau
  menghapusnya kalau salah input. Status LUNAS/SEBAGIAN/dst otomatis dihitung
  ulang setiap kali.
- Nomor telepon toko sekarang ikut tampil di struk (sebelumnya cuma alamat).
- Token `[printed_datetime]` di catatan kaki (biasanya terbawa dari import
  database lama) otomatis diganti tanggal & jam **transaksi** — bukan
  ditampilkan mentah sebagai teks `[printed_datetime]`.

## Offline setelah terinstall (v1.1.0)

Prioritas: aplikasi tetap bisa dipakai penuh kalau internet toko bermasalah,
ASALKAN sudah pernah dibuka sekali dalam keadaan online setelah install/update
(supaya service worker sempat menyimpan semua file ke cache HP).

Yang tetap jalan offline: buat/lihat/ubah nota, produk, pelanggan, laporan,
cetak, dan backup lokal (mengunduh file cadangan) — semuanya karena data ada
di IndexedDB (lokal) dan seluruh kode aplikasi (setiap halaman, bukan cuma
shell utama) sengaja di-precache oleh service worker (`sw.js`), bukan dimuat
dari jaringan setiap saat.

Yang **butuh koneksi internet** (karena mengandalkan file besar dari CDN
eksternal, sengaja tidak dibundel supaya beban awal aplikasi tetap ringan):
- **Impor database aplikasi lama** (perlu mengunduh `sql.js` ~1MB sekali)
- **Bagikan nota sebagai gambar** (perlu mengunduh `html2canvas` sekali)

Begitu kedua fitur itu pernah dipakai sekali secara online, browser akan
meng-cache library-nya sendiri (HTTP cache biasa) dan kemungkinan besar tetap
bisa dipakai offline setelahnya juga — tapi ini tidak dijamin 100% (tidak
seperti file inti NotaKu yang sengaja di-precache eksplisit).

## Cetak & bagikan (perbedaan dari versi APK)

- **Cetak**: pakai `window.print()` bawaan browser — muncul dialog cetak
  sistem, bisa pilih printer (kalau ada driver-nya di HP/laptop) atau simpan
  sebagai PDF.
- **Bagikan sebagai teks/gambar**: pakai Web Share API (`navigator.share`) —
  di HP akan membuka menu bagikan asli Android/iOS (WhatsApp, Telegram, dst).
  Kalau browser tidak mendukung (jarang, biasanya browser lama), otomatis
  fallback ke unduh file / salin ke clipboard.

## Validasi yang sudah dilakukan

Berbeda dengan versi Flutter (yang belum sempat di-build sungguhan), **versi
web ini SUDAH diuji jalan sungguhan** dengan Node.js + jsdom + fake-indexeddb
(simulasi browser tanpa perlu browser sungguhan):

- ✅ Aplikasi boot tanpa error, halaman Home merender dengan benar.
- ✅ Alur bisnis nyata diuji: buat produk, buat pelanggan, penomoran invoice
  (mode NEVER), buat nota dengan diskon → status PARTIAL, tambah pembayaran →
  status berubah jadi PAID, skenario lebih bayar → OVERPAID, hapus nota →
  soft delete (tidak muncul lagi di list aktif), validasi menolak item
  kosong/qty negatif — **semua sesuai ekspektasi**.
- ✅ **Impor database asli kamu** (`Imroatul2_20260819_001324.db`) diuji
  end-to-end: 106 produk, 136 pelanggan, 198 nota berhasil masuk, dan total
  piutang yang dihitung ulang (Rp204.142.989) **cocok persis** dengan yang
  ditampilkan aplikasi aslinya.
- ✅ **Ditemukan & diperbaiki bug nyata** dalam proses ini: dua produk di
  database asli ternyata punya NAMA SAMA ("Blimbingan") tapi harga berbeda
  (Rp8.000 vs Rp12.000) — kode awal memakai nama sebagai kunci unik sehingga
  salah satu varian akan hilang tertimpa. Sudah diperbaiki memakai `rowid`
  asli tiap baris sebagai kunci, dan diuji ulang: sekarang kedua varian
  tersimpan.
- ✅ Impor diuji 2x berturut-turut dengan file yang sama — jumlah data tidak
  berubah (tidak terjadi duplikasi).
- ✅ **(v1.1.0)** Edit nota diuji: ubah qty item lama + tambah item baru →
  item lama tidak terduplikasi (diganti bersih), tanggal/jam transaksi
  berubah sesuai input, total dihitung ulang dengan benar.
- ✅ **(v1.1.0)** Koreksi pembayaran diuji: ubah nominal pembayaran yang salah
  ketik → status LUNAS/SEBAGIAN dihitung ulang otomatis; hapus pembayaran →
  status kembali ke BELUM BAYAR.
- ✅ **(v1.1.0)** Token `[printed_datetime]` diuji tergantikan dengan tanggal
  & jam transaksi yang benar, bukan tampil mentah sebagai teks.
- ✅ **(v1.1.0)** Rute baru `sale/:id/edit` diuji lewat router sungguhan
  (bukan cuma manggil fungsi service langsung) — navigasi, judul halaman,
  dan render form semua diverifikasi jalan.

Yang **belum** diuji: interaksi UI penuh di browser sungguhan (klik tombol,
transisi visual, dsb) — jsdom mensimulasikan DOM tapi tidak me-render
tampilan. Setelah upload ke GitHub Pages, coba klik-klik semua menu untuk
memastikan tidak ada yang aneh secara visual; kalau ada yang janggal, kirim
screenshot & saya bantu perbaiki.

## Catatan untuk versi APK (Flutter) yang sebelumnya kamu minta

Bug "dua produk nama sama saling menimpa" di atas **juga ada** di kode Flutter
yang saya kirim sebelumnya (logika impornya sama). Kalau kamu masih berencana
lanjut build versi APK itu, kabari saya — saya bantu tempelkan perbaikan yang
sama ke situ juga.
