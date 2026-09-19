// escpos.js — pembuat perintah ESC/POS mentah untuk printer thermal.
//
// Referensi perintah dasar (didukung hampir semua printer thermal ESC/POS,
// termasuk printer 58mm/80mm murah yang umum dipakai UMKM):
//   ESC @   -> reset/inisialisasi
//   ESC a n -> alignment (0 kiri, 1 tengah, 2 kanan)
//   ESC E n -> bold on/off
//   GS ! n  -> ukuran teks (font size multiplier)
//   GS V n  -> potong kertas (kalau printer punya auto-cutter)
//   GS v 0  -> cetak gambar raster (dipakai untuk QRIS)

const ESC = 0x1b;
const GS = 0x1d;

function repeatChar(ch, n) {
  return n > 0 ? ch.repeat(n) : '';
}

/**
 * Susun satu baris teks dari beberapa kolom supaya TOTAL panjangnya selalu
 * <= charWidth (lebar kolom printer yang sebenarnya). Ini inti perbaikan
 * "dynamic printable width": tidak ada lagi spasi manual yang bisa membuat
 * teks melebihi lebar kertas lalu wrap ke baris berikutnya.
 *
 * cols diurutkan berdasarkan PRIORITAS potong: kolom BELAKANG (kanan) paling
 * dipertahankan, kolom depan dipotong lebih dulu kalau ruang tidak cukup.
 * Pemisah antar kolom memakai satu spasi.
 */
function composeRow(cols, charWidth) {
  const total = Math.max(8, charWidth | 0);
  const items = cols.map((c) => ({ text: String(c.text ?? '') }));
  // Ruang untuk teks + pemisah 1 spasi antar kolom.
  let available = total - (items.length - 1);
  if (available < 1) available = 1;

  // Potong dari kolom paling depan (prioritas paling rendah) sampai muat.
  for (let i = 0; i < items.length; i++) {
    const need = items.reduce((s, it) => s + it.text.length, 0);
    if (need <= available) break;
    const cut = need - available;
    const t = items[i].text;
    items[i].text = t.slice(0, Math.max(0, t.length - cut));
  }

  let line = items.map((it) => it.text).join(' ').trimEnd();
  if (line.length > total) line = line.slice(0, total);
  return line;
}

export class EscPosBuilder {
  constructor() {
    this.bytes = [];
    this._append([ESC, 0x40]); // reset
  }

  _append(arr) {
    this.bytes.push(...arr);
    return this;
  }

  _text(str) {
    // Encoding sederhana: printer thermal murah umumnya pakai code page
    // mirip CP437/Windows-1252 untuk karakter dasar. Untuk huruf Indonesia
    // standar (tanpa aksen), UTF-8 byte per karakter ASCII sudah cukup.
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      bytes.push(code < 256 ? code : 0x3f); // karakter di luar Latin-1 -> '?'
    }
    return bytes;
  }

  align(mode) {
    // 'left' | 'center' | 'right'
    const n = mode === 'center' ? 1 : mode === 'right' ? 2 : 0;
    return this._append([ESC, 0x61, n]);
  }

  bold(on) {
    return this._append([ESC, 0x45, on ? 1 : 0]);
  }

  /** size 0 = normal, 1 = lebar 2x, 2 = tinggi 2x, 3 = lebar+tinggi 2x */
  size(mode) {
    const map = { 0: 0x00, 1: 0x10, 2: 0x01, 3: 0x11 };
    return this._append([GS, 0x21, map[mode] ?? 0x00]);
  }

  line(str = '') {
    this._append(this._text(str));
    return this._append([0x0a]);
  }

  feed(n = 1) {
    for (let i = 0; i < n; i++) this._append([0x0a]);
    return this;
  }

  divider(charWidth = 32, ch = '-') {
    return this.line(ch.repeat(Math.max(8, charWidth)));
  }

  /**
   * Kolom kiri-kanan (dipakai untuk baris "Label ..... Nilai").
   * Lebar mengikuti `charWidth` yang sebenarnya (dynamic printable width):
   * 32 utk 58mm, 48 utk 80mm, dst — BUKAN spasi manual yang ditebak-tebak.
   * Kalau isi terlalu panjang, teks dipotong agar TIDAK PERNAH turun ke baris
   * berikutnya secara tidak semestinya (kolom kanan dipertahankan).
   */
  twoColumn(left, right, charWidth = 32) {
    return this.line(composeRow([{ text: left }, { text: right }], charWidth));
  }

  /**
   * Tiga kolom sebaris: kiri (mis. tanggal), tengah (mis. jam), kanan (mis.
   * nomor invoice). Dipakai supaya Tanggal • Jam • No. Nota SELALU sejajar di
   * satu baris dan tidak ada yang bergeser/drop ke baris bawah. Kolom kanan
   * (nomor invoice) paling diprioritaskan, disusul kiri, lalu tengah.
   */
  threeColumn(left, center, right, charWidth = 32) {
    return this.line(composeRow([{ text: left }, { text: center }, { text: right }], charWidth));
  }

  cut() {
    return this._append([GS, 0x56, 0x00]);
  }

  /**
   * Cetak gambar raster monokrom (dipakai untuk QRIS).
   * `imageData` adalah ImageData (dari canvas) yang SUDAH di-threshold jadi
   * hitam-putih oleh caller (lihat imageToMonochrome di file yang sama).
   */
  rasterImage(widthPx, heightPx, monoBits) {
    // GS v 0: cetak raster bit image. widthBytes = ceil(width/8).
    const widthBytes = Math.ceil(widthPx / 8);
    this._append([GS, 0x76, 0x30, 0x00]);
    this._append([widthBytes & 0xff, (widthBytes >> 8) & 0xff]);
    this._append([heightPx & 0xff, (heightPx >> 8) & 0xff]);
    this._append(Array.from(monoBits));
    return this;
  }

  toBytes() {
    return new Uint8Array(this.bytes);
  }
}

/**
 * Ubah elemen <img>/<canvas> jadi bitmap monokrom 1-bit untuk rasterImage().
 * Dithering sederhana (threshold) — cukup untuk QR code (kontras tinggi,
 * tidak butuh gradasi warna).
 */
export function imageToMonochromeBits(canvas, targetWidthPx) {
  const scale = targetWidthPx / canvas.width;
  const targetHeight = Math.round(canvas.height * scale);
  const off = document.createElement('canvas');
  off.width = targetWidthPx;
  off.height = targetHeight;
  const ctx = off.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, off.width, off.height);
  ctx.drawImage(canvas, 0, 0, off.width, off.height);
  const imgData = ctx.getImageData(0, 0, off.width, off.height);

  const widthBytes = Math.ceil(targetWidthPx / 8);
  const bits = new Uint8Array(widthBytes * targetHeight);
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidthPx; x++) {
      const idx = (y * targetWidthPx + x) * 4;
      const r = imgData.data[idx], g = imgData.data[idx + 1], b = imgData.data[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const dark = lum < 160; // threshold
      if (dark) {
        const byteIndex = y * widthBytes + (x >> 3);
        bits[byteIndex] |= 0x80 >> (x % 8);
      }
    }
  }
  return { widthPx: targetWidthPx, heightPx: targetHeight, bits };
}
