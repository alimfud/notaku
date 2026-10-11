// config.js — nilai konfigurasi yang HARUS diisi sendiri per deployment
// (beda akun Google/domain GitHub Pages tiap orang, jadi tidak bisa
// disertakan siap pakai di kode ini).

/**
 * OAuth 2.0 Client ID dari Google Cloud Console, dipakai fitur
 * "Backup Otomatis ke Google Drive". Kalau belum diisi, fitur itu akan
 * menampilkan instruksi setup alih-alih error — fitur lain NotaKu tetap
 * jalan normal tanpa ini.
 *
 * Cara mendapatkannya: lihat docs/DRIVE_SETUP.md (gratis, sekali setup).
 */
export const GOOGLE_CLIENT_ID = '329437953527-hloho20c8qv1kt25j09r46vvunc8vrlt.apps.googleusercontent.com';

// Origin backend OAuth yang dipakai oleh APK saat login melalui browser sistem.
// Jangan gunakan localhost di sini: localhost hanya merupakan origin WebView
// APK, sedangkan proses OAuth native diselesaikan oleh situs produksi.
export const GOOGLE_BACKEND_ORIGIN = 'https://nota.jajan.my.id';

// API key untuk Google Picker. Dibutuhkan hanya saat akun berbeda pertama
// kali membuka file Ruang Sinkron Bersama. Lihat docs/DRIVE_SETUP.md.
export const GOOGLE_PICKER_API_KEY = 'AIzaSyBv4OJ1cTn9x47wlkgc77fAbKejDnoVSac';

// Kontak bantuan pemilik NotaKu (opsional). Isi dengan nomor WhatsApp lokal.
// Jika kosong, Pusat Bantuan memakai nomor toko dari Info Toko bila tersedia.
export const OWNER_NAME = 'Developer NotaKu';
export const OWNER_WHATSAPP = '6285156657771';
