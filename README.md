# NotaKu

NotaKu adalah aplikasi kasir dan nota penjualan berbasis web/PWA. Data toko disimpan lokal melalui IndexedDB, sehingga aplikasi tetap dapat dipakai setelah dibuka sekali saat online.

- **Versi saat ini:** v1.12.1
- **Versi aplikasi:** buka dari browser atau instal sebagai PWA melalui Chrome/Edge.

## Cara pakai di HP

1. Buka alamat NotaKu di Chrome atau Edge.
2. Pilih menu browser **Tambahkan ke layar utama** / **Install aplikasi**.
3. Buka NotaKu dari ikon layar utama seperti aplikasi biasa.

Tidak ada APK, Android Studio, atau proses update APK. Pembaruan HTML, CSS, dan JavaScript yang sudah dipush akan diambil saat NotaKu dibuka ketika perangkat terhubung internet. Saat offline, browser memakai salinan terakhir yang sudah tersedia.

## Pembaruan web dan cache

NotaKu memakai service worker agar dapat berjalan offline. Agar perubahan tampilan tidak tertahan cache:

- `sw.js` selalu memeriksa pembaruan saat aplikasi dibuka.
- HTML, CSS, dan JavaScript memakai strategi **jaringan dahulu, cache sebagai cadangan**.
- `version.json` tidak pernah dilayani dari cache saat jaringan tersedia.

Jadi untuk perubahan biasa, cukup edit sumber utama lalu push ke `main`. Jika browser sedang terbuka, tutup aplikasi/PWA lalu buka kembali. Untuk perubahan versi yang terencana, naikkan `version` di `version.json` dan jalankan:

```powershell
npm run version:sync
```

## Sumber utama

Edit hanya berkas berikut sesuai kebutuhan:

- `index.html`, `css/`, dan `js/` untuk tampilan serta fungsi.
- `version.json` untuk nomor versi.
- `sw.js` untuk daftar aset offline dan perilaku cache.
- `manifest.json` dan `icons/` untuk instalasi PWA.

## Pengujian

```powershell
npm test
```

## Catatan Bluetooth

Browser mendukung cetak Bluetooth langsung hanya untuk printer **BLE/GATT** pada Chrome atau Edge. Printer Bluetooth Classic/SPP perlu memakai PDF/gambar nota lalu dibagikan ke aplikasi pencetak yang sesuai.

## Riwayat

Riwayat versi dan APK lama tetap tersimpan di GitHub sebagai arsip, tetapi pengembangan NotaKu sekarang kembali fokus pada web/PWA.
