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
export const GOOGLE_CLIENT_ID = '329437953527-qd9l3k29qa4dfpjn3v8jh35nbgnpejqb.apps.googleusercontent.com';
