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

## v1.4.0 — satu tampilan kasir, data pelanggan bisa dikoreksi, tambahan biaya

### 🔗 Nota Baru & Ubah Nota kini SATU implementasi

Sebelumnya kedua layar ini punya kode terpisah yang lama-lama tampil beda.
Sekarang keduanya memakai satu modul bersama (`saleFormShared.js`) — apa pun
yang ditambahkan/diperbaiki di alur input nota otomatis konsisten di
keduanya, tidak akan pernah "diam-diam beda tampilan" lagi.

### ✏️ Data pelanggan bisa dikoreksi langsung di form nota

Nama, alamat, dan telepon pelanggan sekarang jadi kolom yang bisa diketik
langsung di form nota (bukan cuma dipilih dari daftar) — cocok kalau data
pelanggan kurang tepat pas transaksi berlangsung. Kalau pelanggan itu
terhubung ke data pelanggan tersimpan, koreksinya otomatis ikut memperbarui
data pelanggan itu juga (bukan cuma nota yang sedang dikerjakan).

### 💰 Fitur "Tambahan": Diskon, Pajak, Ongkos Kirim, Lain-lain

Tombol "Atur Tambahan" di form nota sekarang mendukung:
- **Diskon** — nominal (Rp) atau persen (%).
- **Pajak** dan **Pajak #2** — masing-masing dengan pilihan *inclusive*
  (sudah termasuk di harga barang, cuma ditampilkan sebagai rincian) atau
  ditambahkan ke total.
- **Ongkos Kirim** — nominal tetap.
- **Lain-lain** — label bebas + nominal (mis. biaya packing, biaya admin).

Semua komponen ini independen (bisa aktif sendiri-sendiri) dan tampil
sebagai rincian di struk (layar, cetak, Bluetooth, share).

### ✏️ Item bisa diubah satuan & diberi catatan

Ketuk item di daftar untuk mengubah nama, **satuan (bebas diketik, tidak
terkunci ke "pcs")**, harga, dan catatan khusus item itu (mis. "pedas level
2"). Sebelumnya satuan tidak bisa diubah setelah item ditambahkan.

### 🧾 Nomor invoice: tanggal + urutan harian (mengganti skema jam)

Setelah dipikir ulang, skema berbasis jam (`YYMMDDHH`) diganti karena dua
nota di jam yang sama bisa bentrok nomornya. Skema baru: prefix + tanggal +
nomor urut yang reset tiap hari — `INV #26091001`, `INV #26091002`, dst.
Selalu unik berapa pun banyaknya nota dalam sehari. Prefix bawaan juga
diubah jadi `INV #` (sebelumnya `INV-`) supaya sesuai konvensi yang lazim
dipakai. Opsi nomor urut tanpa tanggal tetap tersedia di pengaturan.

### ✅ Otomatis SELESAI begitu tanggal pengambilan lewat

Terpisah dari aturan LUNAS otomatis (tetap butuh 2 hari), nota sekarang
otomatis ditandai **SELESAI** begitu tanggal pengambilannya sudah terlewati
— asumsinya pesanan itu praktis sudah beres dikerjakan. Bisa dibatalkan
manual lewat tombol "Tandai Belum Selesai" di Detail Nota, dan begitu
dibatalkan, nota itu tidak akan diotomatiskan lagi.

Di Home: centang "Fokus yang belum selesai" diganti nama jadi **"Proses"**,
dan dropdown urutan disederhanakan jadi **"Tgl Ambil"** / **"Tgl Dibuat"**.

### 🖨️ Tombol Cetak di Detail Nota diganti jadi "Bagikan Nota"

Supaya tidak ada dua jalur berbeda yang bisa saling tidak konsisten, tombol
"Cetak" sekarang membuka sheet "Bagikan Nota" yang sama seperti ikon share
di pojok atas — satu pintu untuk Chat WA / Bluetooth / Gambar / Teks / Cetak-PDF.

### 🎨 Cetak Bluetooth dirapikan

Struk Bluetooth sekarang menampilkan **Total Qty** dan **Sub Total** sebagai
baris terpisah sebelum rincian Diskon/Pajak/Ongkir/Lain-lain dan TOTAL akhir
— jadi jelas dari mana angka TOTAL berasal, bukan langsung loncat dari
daftar item ke satu angka besar. Nama & alamat/telepon pelanggan digabung
jadi satu baris (konsisten dengan tampilan layar).

### ☁️ Backup Drive: pesan error lebih jelas + auto-retry

Kalau backup ke Drive gagal, pesan error sekarang menampilkan **alasan asli
dari Google** (bukan cuma "status 401"), dan kalau penyebabnya token yang
kedaluwarsa, sistem otomatis mencoba sekali lagi dengan token baru sebelum
benar-benar menyerah. Lihat `docs/DRIVE_SETUP.md` bagian Troubleshooting
untuk panduan lengkap kalau masih gagal.

### 🔄 Sinkronisasi Antar Perangkat (baru)

Setting → Backup/Restore → Atur Backup Otomatis → bagian "Sinkronisasi Antar
Perangkat": **Push** (kirim data perangkat ini ke Drive) dan **Pull** (tarik
data dari Drive ke perangkat ini), supaya beberapa HP/laptop bisa memakai
data yang sama. **Ini bukan sinkron otomatis dua-arah** — siapa yang push
TERAKHIR itu yang berlaku, jadi biasakan Pull sebelum mulai kerja dan Push
setelah selesai di tiap perangkat. Detail keterbatasannya ada di komentar
`js/services/driveBackupService.js`.

## v1.3.0 — mode kasir, printer, dan nomor invoice

### 🐛 Perbaikan: TOTAL berantakan saat cetak Bluetooth

Ditemukan penyebabnya: teks "TOTAL" dan nama toko dicetak dengan mode "lebar
ganda" (double-width) di printer, tapi perhitungan lebar kolom di kode tidak
menyesuaikan — hasilnya teks kepanjangan dari muatan kertas dan tabrakan.
Sekarang dicetak bold saja (tanpa lebar ganda), jauh lebih aman dan konsisten
di berbagai printer thermal murah.

### 🔳 QRIS dihapus dari cetak Bluetooth

QRIS **tidak lagi dicetak** lewat printer Bluetooth — resolusi cetak printer
thermal murah sering membuat kode QR tidak bisa di-scan sama sekali. QRIS
tetap tampil di layar (Detail Nota) dan saat dibagikan sebagai gambar/PDF,
yang resolusinya utuh dan tetap bisa di-scan dari layar HP.

### 🛒 Mode Kasir Mini Market

Layar "Nota Baru" sekarang punya kolom pencarian/scan barcode yang selalu
terlihat (bukan pop-up terpisah) + stepper jumlah — cocok dipakai berturutan
dengan barcode scanner fisik (yang berperilaku seperti keyboard: ketik kode
lalu "Enter" otomatis). Ketik nama produk untuk cari, atau scan barcode untuk
langsung menambah. Bar ringkasan di bawah selalu menampilkan Item / Qty /
Subtotal berjalan.

### 📵 Privasi nomor HP pelanggan di struk

Setting → Info Toko → "Sembunyikan nomor HP pelanggan di struk" (aktif
secara default): struk cuma menampilkan 3 digit terakhir nomor HP pelanggan
(mis. `*********771`). Bisa dimatikan kalau ingin nomor penuh tetap tampil.

### 💚 Chat WA langsung dari nota

Menu "Bagikan" di Detail Nota sekarang punya opsi "Chat WA [nomor]" di
posisi paling atas — langsung membuka WhatsApp ke nomor pelanggan dengan isi
nota sudah terisi otomatis di kolom pesan, tanpa perlu copy-paste manual.

### 🔤 Format item pakai tanda "@"

Baris item di struk (preview, cetak, share) sekarang format:
`2 pcs x @ Rp15.000,-` (sebelumnya `2 pcs x Rp15.000`, tanpa tanda "@").

### 🧾 Nomor invoice berbasis waktu (default baru)

Setting → Nomor Nota → dua pilihan format:
- **Berdasarkan Waktu Dibuat** (default): prefix + YYMMDDHH, contoh nota
  dibuat 9 September 2026 jam 21:xx -> `INV-26090921`. Perlu diketahui: dua
  nota yang dibuat di jam yang sama pada hari yang sama akan mendapat nomor
  invoice yang **sama** di skema ini (cuma presisi sampai jam) — ID internal
  tiap nota tetap selalu unik untuk semua keperluan teknis, ini murni soal
  nomor yang tercetak di struk.
- **Nomor Urut**: skema lama (prefix + angka urut + mode reset), dijamin
  unik, tetap tersedia kalau kamu lebih suka ini.

### 🕓 Catatan kaki struk mengikuti waktu TERAKHIR DIPERBARUI

Tanggal/jam di bawah "Terima kasih" (token `[printed_datetime]`) sekarang
mengikuti kapan nota **terakhir diubah** (edit item, tambah/ubah/hapus
pembayaran) — bukan waktu pengambilan yang tetap. **Nomor invoice di bagian
atas TIDAK ikut berubah** — begitu dibuat, nomor itu permanen, cuma stempel
tanggal di footer yang ter-update mengikuti perubahan terakhir.

## v1.2.0 — fitur baru & perbaikan bug

### 🐛 Perbaikan: "Cek Pembaruan" selalu gagal padahal online

**Penyebabnya ditemukan dan diperbaiki**: `sw.js` (service worker) sebelumnya
memakai strategi cache yang, khusus untuk request `version.json` (yang sengaja
diberi query string `?t=...` supaya selalu fresh, tidak kena cache), punya
celah — kalau fetch jaringannya gagal karena sebab apa pun (bahkan hiccup
sesaat), service worker mengembalikan `undefined` alih-alih sebuah Response,
yang oleh browser dianggap error KERAS ("Failed to fetch") walau internet
sebenarnya menyala. Sekarang `version.json` ditangani jalur khusus yang
SELALU mengembalikan Response valid, dan tidak lagi butuh trik query-string
cache-busting (pakai `cache: 'no-store'` di fetch API sebagai gantinya).
**Upload ulang `sw.js` dan `js/app.js` supaya perbaikan ini aktif** (service
worker versi baru akan otomatis menggantikan yang lama begitu pengguna
membuka aplikasi).

### 🖨️ Cetak langsung ke printer Bluetooth

Setting → Printer → "Cari Printer" untuk menyambungkan printer thermal via
Bluetooth. Sekali tersambung, NotaKu mengingat printer itu — buka nota lain
kapan saja, pilih "Cetak via Bluetooth", dan (kalau printer menyala &
Bluetooth HP aktif) langsung tersambung ulang tanpa perlu cari lagi.

**Batasan platform yang jujur perlu diketahui** (bukan keterbatasan kode ini,
tapi keterbatasan Web Bluetooth API di browser):
- **Hanya untuk printer Bluetooth Low Energy (BLE)**. Banyak printer thermal
  murah memakai Bluetooth Classic/SPP — jenis ini **tidak bisa** diakses dari
  browser web sama sekali, di platform apa pun. Kalau printer kamu tidak
  muncul saat "Cari Printer", kemungkinan itu penyebabnya — pakai
  "Cetak / Simpan PDF" sebagai gantinya (bisa dibagikan ke app seperti RawBT
  yang bisa menjembatani ke printer Classic).
- **Hanya Chrome/Edge di Android & Desktop** — Safari/iPhone tidak mendukung
  Web Bluetooth sama sekali (ini kebijakan Apple, bukan sesuatu yang bisa
  diakali dari kode web).
- Support mencakup UUID service/characteristic yang UMUM dipakai printer
  thermal generic — printer dengan chipset yang sangat berbeda mungkin tetap
  tidak terdeteksi meski BLE.

### 🔳 QRIS otomatis di struk

Setting → QRIS → aktifkan & upload gambar kode QRIS statis tokomu (dari
aplikasi bank/e-wallet). QRIS otomatis muncul di struk (preview, cetak PDF,
maupun cetak Bluetooth) **hanya kalau nota belum lunas** — begitu status
LUNAS, QRIS otomatis hilang dari tampilan struk berikutnya.

### ☁️ Backup terjadwal ke Google Drive

Setting → Backup/Restore → Atur Backup Otomatis: hubungkan akun Google,
jadwalkan beberapa jam backup per hari, atur penghapusan file lama otomatis.
**Butuh setup sekali** (Google Client ID gratis milikmu sendiri) — lihat
[docs/DRIVE_SETUP.md](docs/DRIVE_SETUP.md) untuk langkah lengkapnya.

Baca juga catatan jujur soal keterbatasan "otomatis" pada web app statis di
dalam dokumen itu dan di komentar `js/services/driveBackupService.js` —
backup di jam PERSIS yang dijadwalkan hanya terjamin kalau aplikasi kebetulan
dibuka/aktif sekitar jam itu, bukan berjalan di latar belakang 100% pasti
seperti aplikasi native.

### ✅ Tandai nota selesai / belum selesai

Fokus ke pekerjaan yang belum kelar: di Detail Nota ada tombol "Tandai
Selesai". Di Home, ada centang "Fokus yang belum selesai" (aktif secara
default) supaya daftar nota tidak dipenuhi pesanan lama yang sudah beres.
Nota hasil impor dari database lama otomatis ditandai selesai dari awal
(riwayat lama, bukan pekerjaan yang sedang berjalan).

### 🕑 LUNAS otomatis setelah 2 hari dari tanggal pengambilan

Kalau nota belum dibayar tapi sudah lewat 2 hari dari tanggal pengambilan,
NotaKu otomatis menandainya LUNAS (asumsi: biasanya pelanggan sudah bayar
saat ambil, cuma lupa dicatat). Ada label "(otomatis)" kecil di status, dan
di Detail Nota ada tombol "Batalkan" kalau ternyata memang belum dibayar —
setelah dibatalkan, nota itu **tidak akan** ditandai LUNAS otomatis lagi.

### 🔀 Urutkan nota: tanggal pengambilan vs tanggal dibuat

Di Home ada dropdown untuk memilih urutan daftar nota: berdasarkan **tanggal
pengambilan** (default — tanggal/jam yang ditampilkan di setiap baris nota
memang tanggal pengambilan, bukan waktu nota dibuat) atau **tanggal nota
dibuat** (waktu pemesanan).

### 📊 Omzet bulan ini di beranda, dan laporan omset keseluruhan

Kartu ringkasan di Home sekarang menampilkan **Omzet Bulan Ini** (bukan cuma
hari ini). Halaman Laporan punya bagian baru **"Omset Keseluruhan"**: total
omzet sepanjang waktu, total sudah diterima vs piutang, rincian per status
pembayaran (LUNAS/SEBAGIAN/BELUM BAYAR/LEBIH BAYAR beserta jumlah & nominal),
dan rincian omzet per bulan.

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
- ✅ **(v1.2.0)** Urutkan nota (pengambilan vs dibuat) diuji: nota dengan
  tanggal pengambilan lebih baru vs nota yang dibuat lebih baru muncul di
  urutan berbeda sesuai mode yang dipilih.
- ✅ **(v1.2.0)** Filter "belum selesai" diuji: nota yang ditandai selesai
  otomatis tersembunyi dari daftar fokus.
- ✅ **(v1.2.0)** Aturan LUNAS otomatis diuji lengkap: nota 5 hari lalu belum
  bayar → otomatis LUNAS; nota 1 hari lalu → TIDAK disentuh (belum 2 hari);
  dibatalkan manual → kembali BELUM BAYAR dan **tidak pernah** ditandai
  otomatis lagi walau aturan dijalankan ulang.
- ✅ **(v1.2.0)** QRIS diuji: muncul di struk saat nota belum lunas, otomatis
  hilang begitu nota dilunasi — diverifikasi lewat render sungguhan, bukan
  cuma baca kode.
- ✅ **(v1.2.0)** Laporan omset keseluruhan diuji: total omzet, jumlah
  transaksi, dan rincian per status pembayaran dihitung ulang manual dan
  dicocokkan dengan hasil kode — sama persis.
- ✅ **(v1.2.0)** Semua halaman Setting baru (Printer+Bluetooth, QRIS, Backup,
  Atur Backup Otomatis) diuji render tanpa error lewat router sungguhan.
- ✅ **(v1.2.0)** Bug "Cek Pembaruan selalu gagal" — akar masalah ditemukan
  dengan menelusuri logika `sw.js` baris demi baris (bukan tebak-tebakan),
  dan perbaikannya membuat jalur tersebut tidak mungkin lagi mengembalikan
  respons tidak valid.
- ✅ **(v1.3.0)** Mode Kasir Mini Market diuji lewat router sungguhan: cari
  produk by nama, scan barcode (exact match + Enter, meniru perilaku scanner
  fisik), stepper qty, penggabungan qty saat produk sama discan dua kali —
  semua diverifikasi lewat interaksi DOM nyata (klik, input, keydown), bukan
  cuma manggil fungsi service.
- ✅ **(v1.3.0)** Masking nomor HP pelanggan diuji: struk menampilkan format
  `*********771`, nomor lengkap TIDAK bocor ke tampilan struk; sekaligus
  diverifikasi tombol "Chat WA" tetap menampilkan nomor lengkap (karena itu
  memang aksi yang butuh nomor utuh untuk membuka WhatsApp).
- ✅ **(v1.3.0)** Nomor invoice format DATETIME diuji hasilnya persis sesuai
  spesifikasi (`INV-26090921` untuk nota dibuat 9 Sep 2026 jam 21:xx); mode
  SEQUENTIAL lama diuji ulang untuk pastikan tidak rusak oleh perubahan ini.
- ✅ **(v1.3.0)** Diuji: nomor invoice TIDAK berubah setelah nota diedit,
  sementara `updatedAt` (sumber tanggal footer) berubah — sesuai permintaan
  "nomor invoice tetap, tanggal footer ikut update".

Yang **belum** diuji: interaksi Bluetooth/Drive sungguhan (jsdom tidak
mendukung Web Bluetooth API maupun kanvas gambar) — ini WAJAR karena
keduanya butuh hardware/akun nyata, hanya bisa diuji di HP/browser
sungguhan. Kode sudah ditulis mengikuti spesifikasi resmi API-nya dengan
penanganan error yang jelas, tapi belum ada jaminan "sudah pasti jalan
100%" seperti fitur lain yang berhasil diuji end-to-end secara terprogram.

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
