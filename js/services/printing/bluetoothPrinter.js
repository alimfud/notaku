// bluetoothPrinter.js — cetak langsung ke printer thermal via Bluetooth
// memakai Web Bluetooth API (BLE/GATT).
//
// ============================== BATASAN PENTING ==============================
// Web Bluetooth API browser HANYA bisa bicara dengan printer BLUETOOTH LOW
// ENERGY (BLE/GATT). BANYAK printer thermal murah yang beredar (terutama yang
// lebih tua) sebenarnya memakai BLUETOOTH KLASIK / SPP (Serial Port Profile) —
// jenis ini TIDAK BISA diakses dari browser web sama sekali, di platform
// manapun. Ini bukan keterbatasan kode ini, tapi keterbatasan platform web
// (Chrome/Edge sengaja tidak mengekspos socket Bluetooth klasik ke halaman
// web, alasan keamanan). Kalau setelah "Cari Printer" printer kamu tidak
// muncul di daftar sama sekali, kemungkinan besar itu printer Bluetooth
// klasik — solusinya pakai "Simpan PDF" lalu bagikan ke app seperti
// RawBT (app Android terpisah yang bisa jembatani ke printer klasik).
//
// Web Bluetooth JUGA hanya didukung Chrome/Edge di Android & Desktop —
// TIDAK didukung Safari/iOS sama sekali (kebijakan Apple).
// ===============================================================================

import { EscPosBuilder, imageToMonochromeBits } from './escpos.js';

// UUID service/characteristic yang umum dipakai modul BLE UART pada printer
// thermal murah (banyak printer generic Cina memakai salah satu dari ini).
// Kalau printer kamu tidak cocok dengan daftar ini, sayangnya cetak Bluetooth
// langsung belum bisa dipakai untuk model itu.
const KNOWN_PROFILES = [
  { service: '000018f0-0000-1000-8000-00805f9b34fb', write: '00002af1-0000-1000-8000-00805f9b34fb' },
  { service: '0000ff00-0000-1000-8000-00805f9b34fb', write: '0000ff02-0000-1000-8000-00805f9b34fb' },
  { service: '49535343-fe7d-4ae5-8fa9-9fafd205e455', write: '49535343-8841-43f4-a8d4-ecbe34729bb3' },
];

let _device = null;
let _server = null;
let _writeChar = null;
let _mtu = 180; // ukuran potongan tulis per chunk (aman untuk sebagian besar BLE stack)

function isSupported() {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

async function findWritableCharacteristic(server) {
  // 1) Coba profil yang sudah dikenal dulu (lebih cepat, tidak perlu enumerasi semua service).
  for (const profile of KNOWN_PROFILES) {
    try {
      const service = await server.getPrimaryService(profile.service);
      const char = await service.getCharacteristic(profile.write);
      return char;
    } catch (e) { /* coba profil berikutnya */ }
  }
  // 2) Fallback: enumerasi semua service/characteristic, cari yang bisa di-write.
  try {
    const services = await server.getPrimaryServices();
    for (const service of services) {
      const chars = await service.getCharacteristics();
      for (const c of chars) {
        if (c.properties.write || c.properties.writeWithoutResponse) return c;
      }
    }
  } catch (e) { /* device tidak expose service publik apa pun */ }
  return null;
}

/** Buka dialog pemilih perangkat Bluetooth Android/Chrome, lalu hubungkan. */
export async function scanAndConnect() {
  if (!isSupported()) {
    throw new Error('Perangkat ini tidak mendukung Bluetooth langsung. Gunakan "Simpan PDF" sebagai alternatif.');
  }
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: KNOWN_PROFILES.map((p) => p.service),
  });
  return connectToDevice(device);
}

async function connectToDevice(device) {
  const server = await device.gatt.connect();
  const writeChar = await findWritableCharacteristic(server);
  if (!writeChar) {
    server.disconnect?.();
    throw new Error(`Printer "${device.name || 'tanpa nama'}" tersambung tapi tidak dikenali sebagai printer thermal yang didukung.`);
  }
  _device = device;
  _server = server;
  _writeChar = writeChar;

  device.addEventListener('gattserverdisconnected', () => {
    _server = null;
    _writeChar = null;
  });

  return { id: device.id, name: device.name || 'Printer Bluetooth' };
}

/** Coba sambung ulang ke printer yang PERNAH dipilih sebelumnya, TANPA dialog pemilih. */
export async function reconnectSaved(savedDeviceId) {
  if (!isSupported() || !savedDeviceId) return null;
  if (!navigator.bluetooth.getDevices) return null; // browser lama tidak dukung reconnect diam-diam
  try {
    const devices = await navigator.bluetooth.getDevices();
    const found = devices.find((d) => d.id === savedDeviceId);
    if (!found) return null;
    return await connectToDevice(found);
  } catch (e) {
    return null;
  }
}

export function isConnected() {
  return !!(_server && _server.connected && _writeChar);
}

export function currentDeviceInfo() {
  if (!_device) return null;
  return { id: _device.id, name: _device.name || 'Printer Bluetooth' };
}

export function disconnect() {
  try { _server?.disconnect(); } catch (e) { /* noop */ }
  _device = null; _server = null; _writeChar = null; _mtu = 180;
}

async function writeBytes(bytes) {
  if (!_writeChar) throw new Error('Printer belum tersambung.');
  for (let i = 0; i < bytes.length; i += _mtu) {
    const chunk = bytes.slice(i, i + _mtu);
    if (_writeChar.properties.writeWithoutResponse) {
      await _writeChar.writeValueWithoutResponse(chunk);
    } else {
      await _writeChar.writeValue(chunk);
    }
    // Jeda kecil supaya buffer printer murah tidak kebanjiran data.
    await new Promise((r) => setTimeout(r, 12));
  }
}

/** Print text with the printer's native font. Only logo/QRIS remain bitmaps. */
export async function printReceiptViaBluetooth(receiptData, { charWidth = 32, autoCut = true } = {}) {
  if (!isConnected()) throw new Error('Printer belum tersambung. Sambungkan dulu lewat Setting → Printer.');
  await writeBytes(await buildReceiptBytes(receiptData, charWidth, autoCut));
}

export async function buildReceiptBytes(data, charWidth = 32, autoCut = true) {
  const width = Number(charWidth) >= 48 ? 48 : 32;
  const paperDots = width * 12;
  const rp = (value) => 'Rp' + Math.round(Number(value) || 0).toLocaleString('id-ID');
  const b = new EscPosBuilder().font('A').size(0);

  b.align('center');
  if (data.logoData) {
    try {
      const logo = await imageToCanvas(data.logoData, true);
      const percent = Math.min(100, Math.max(10, Number(data.logoMaxWidth) || 100));
      const target = Math.max(8, Math.floor(paperDots * percent / 100 / 8) * 8);
      const raster = imageToMonochromeBits(logo, target, 190);
      b.rasterImage(raster.widthPx, raster.heightPx, raster.bits);
    } catch { /* logo must not stop text printing */ }
  }
  if (data.storeName) {
    b.bold(true);
    centeredLines(b, data.storeName, width);
    b.bold(false);
  }
  if (data.storeAddress) centeredLines(b, data.storeAddress, width);
  if (data.storePhone) centeredLines(b, data.storePhone, width);

  b.align('left').divider(width);
  b.threeColumn(data.dateLabel || '', data.timeLabel || '', data.invoiceNumber || '', width);
  b.divider(width);

  b.align('center').bold(true);
  centeredLines(b, data.customerName, width);
  b.bold(false);
  const customerInfo = [data.customerAddress, data.customerPhoneDisplay].filter(Boolean).join(' - ');
  if (customerInfo) centeredLines(b, customerInfo, width);
  b.align('left');

  for (const item of data.lines || []) {
    b.bold(true);
    twoColumnWrapped(b, item.name, rp(item.subtotal), width);
    b.bold(false);
    const qty = `${item.qty} ${item.unit || ''}`.trim();
    compactQuantityLine(b, `${qty} x`, `@ ${rp(item.price)},-`, paperDots);
    if (item.note) wrappedLines(b, item.note, width);
  }

  if (data.discount > 0) b.twoColumn('Diskon', '-' + rp(data.discount), width);
  if (data.shipping > 0) b.twoColumn('Ongkos Kirim', '+' + rp(data.shipping), width);
  if (data.other > 0) twoColumnWrapped(b, data.otherLabel || 'Lain-lain', '+' + rp(data.other), width);
  b.divider(width);

  b.bold(true).size(2);
  b.twoColumn('TOTAL', rp(data.total), width);
  b.size(0).bold(false);
  if (data.isPaid) {
    const paidRow = await paidAmountRowCanvas(data, rp(data.paid), rp(data.total), rp(Math.abs(data.remaining)), paperDots);
    const raster = imageToMonochromeBits(paidRow, paperDots, 184);
    b.rasterImage(raster.widthPx, raster.heightPx, raster.bits);
  } else {
    b.twoColumn('BAYAR', rp(data.paid), width);
  }
  b.bold(true).twoColumn(data.remaining > 0 ? 'SISA' : 'KEMBALI', rp(Math.abs(data.remaining)), width).bold(false);

  if (data.note) {
    b.feed(1).bold(true).line('Catatan:').bold(false);
    wrappedLines(b, data.note, width);
  }

  if (data.qrisImageData) {
    try {
      const qris = await imageToCanvas(data.qrisImageData);
      const qrisWidth = width >= 48 ? 280 : 220;
      const raster = imageToMonochromeBits(qris, qrisWidth, 180);
      b.feed(1).align('center').line('Scan QRIS untuk bayar');
      b.rasterImage(raster.widthPx, raster.heightPx, raster.bits);
    } catch { /* QRIS image is optional */ }
  }

  b.align('center');
  for (const line of String(data.footerNote || '').split('\n')) centeredLines(b, line, width);
  b.size(0).bold(false).feed(1);
  if (autoCut) b.cut();
  return b.toBytes();
}

function normalizedText(value) {
  return String(value || '').replace(/[•–—]/g, '-').replace(/\s+/g, ' ').trim();
}

export function wrapText(value, maxChars) {
  const text = normalizedText(value);
  if (!text) return [];
  const lines = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    let cut = remaining.lastIndexOf(' ', maxChars);
    if (cut < Math.floor(maxChars / 2)) cut = maxChars;
    lines.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) lines.push(remaining);
  return lines;
}

function wrappedLines(builder, value, width) {
  for (const line of wrapText(value, width)) builder.line(line);
}

function centeredLines(builder, value, width) {
  for (const line of wrapText(value, width)) builder.line(line);
}

function twoColumnWrapped(builder, left, right, width) {
  const rightText = normalizedText(right);
  const maxLeft = Math.max(8, width - rightText.length - 1);
  const leftLines = wrapText(left, maxLeft);
  builder.twoColumn(leftLines.shift() || '', rightText, width);
  for (const line of leftLines) builder.line(line);
}

function compactQuantityLine(builder, left, right, paperDots) {
  const leftText = normalizedText(left);
  const rightText = normalizedText(right);
  const canvas = document.createElement('canvas');
  canvas.width = paperDots;
  canvas.height = 28;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  ctx.font = '20px Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(leftText, 0, 14);
  ctx.fillText(rightText, Math.ceil(ctx.measureText(leftText).width) + 16, 14);
  const raster = imageToMonochromeBits(canvas, paperDots, 150);
  builder.rasterImage(raster.widthPx, raster.heightPx, raster.bits);
}

// =====================================================================
// STEMPEL LUNAS UNTUK CETAK BLUETOOTH  (gambar: icons/stamp-lunas.png)
// >>> UBAH POSISI / UKURAN STEMPEL DI SINI <<<
//   PAID_STAMP_WIDTH_RATIO : lebar stempel = rasio x lebar kertas (0.50 = 50%)
//                            makin kecil angka, makin kecil stempel
//   PAID_STAMP_OFFSET_X    : geser kiri(-) / kanan(+), dalam rasio lebar kertas
//                            contoh 0.05 = geser kanan 5%
//   PAID_STAMP_OFFSET_Y    : geser atas(-) / bawah(+), dalam rasio tinggi baris
//   PAID_STAMP_OPACITY     : 0.1 (tipis) sampai 1 (pekat)
// =====================================================================
const PAID_STAMP_SRC = 'icons/stamp-lunas.png';
const PAID_STAMP_WIDTH_RATIO = 0.4;
const PAID_STAMP_OFFSET_X = 0;
const PAID_STAMP_OFFSET_Y = 0.5;
const PAID_STAMP_OPACITY = 0.5;
const PAID_STAMP_ROTATE = -10;

async function paidAmountRowCanvas(data, paidLabel, totalLabel, balanceLabel, paperDots) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const fontSize = Math.max(18, Math.round(paperDots * 0.055));
  const totalFontSize = Math.round(fontSize * 1.8);
  let stampImage = null;
  
  try { 
    stampImage = await loadStampImage(PAID_STAMP_SRC); 
  } catch { /* tanpa stempel jika gambar gagal dimuat */ }
  
  const stampWidth = paperDots * PAID_STAMP_WIDTH_RATIO;
  const stampHeight = stampImage ? stampWidth * stampImage.naturalHeight / stampImage.naturalWidth : 0;
  
  // 👈 HITUNG ROTASI UNTUK MEMASTIKAN CANVAS TIDAK TERPOTONG
  const stampAngle = PAID_STAMP_ROTATE * Math.PI / 180;
  const stampBoxHeight = Math.abs(stampWidth * Math.sin(stampAngle)) + Math.abs(stampHeight * Math.cos(stampAngle));
  
  const lineStep = fontSize * 1.5;
  canvas.width = paperDots;
  
  // 👈 GUNAKAN stampBoxHeight PADA PERHITUNGAN TINGGI CANVAS
  canvas.height = Math.ceil(Math.max(lineStep * 2 + totalFontSize, stampBoxHeight) + 8);
  
  const centerY = canvas.height / 2;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `bold ${totalFontSize}px Arial, sans-serif`;
  ctx.fillText('TOTAL', 0, centerY - lineStep);
  ctx.textAlign = 'right';
  ctx.fillText(totalLabel, paperDots - 2, centerY - lineStep);
  ctx.fillStyle = '#111';
  ctx.textAlign = 'left';
  ctx.font = `${fontSize}px Arial, sans-serif`;
  ctx.fillText('BAYAR', 0, centerY);
  ctx.textAlign = 'right';
  ctx.fillText(paidLabel, paperDots - 2, centerY);
  ctx.textAlign = 'left';
  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  ctx.fillText(data.remaining > 0 ? 'SISA' : 'KEMBALI', 0, centerY + lineStep);
  ctx.textAlign = 'right';
  ctx.fillText(balanceLabel, paperDots - 2, centerY + lineStep);

  if (stampImage) {
    ctx.save();
    ctx.globalAlpha = PAID_STAMP_OPACITY;
    
    // 👈 TERAPKAN TRANSLATE & ROTATE PADA STEMPEL
    const cx = paperDots / 2 + paperDots * PAID_STAMP_OFFSET_X;
    const cy = centerY + lineStep * PAID_STAMP_OFFSET_Y;
    ctx.translate(cx, cy);
    ctx.rotate(stampAngle);
    
    // 👈 GAMBAR STEMPEL DENGAN TITIK TENGAH (TANPA OFFSET X/Y LAGI)
    ctx.drawImage(stampImage, -stampWidth / 2, -stampHeight / 2, stampWidth, stampHeight);
    
    ctx.restore();
  }
  return canvas;
}

function loadStampImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Gambar stempel tidak dapat dimuat.'));
    image.src = src;
  });
}

async function imageToCanvas(src, trimWhitespace = false) {
  const image = new Image();
  image.src = src;
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('Gambar tidak dapat dimuat.'));
  });
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  return trimWhitespace ? trimWhiteEdges(canvas) : canvas;
}

function trimWhiteEdges(canvas) {
  const { width, height } = canvas;
  const pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const alpha = pixels[index + 3];
      const light = (pixels[index] * 0.299) + (pixels[index + 1] * 0.587) + (pixels[index + 2] * 0.114);
      if (alpha > 20 && light < 248) {
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < left || bottom < top) return canvas;
  const padding = 2;
  const cropped = document.createElement('canvas');
  cropped.width = Math.min(width, (right - left + 1) + (padding * 2));
  cropped.height = Math.min(height, (bottom - top + 1) + (padding * 2));
  cropped.getContext('2d').drawImage(canvas, left - padding, top - padding, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
  return cropped;
}
