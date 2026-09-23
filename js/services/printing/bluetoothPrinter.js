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
    throw new Error('Browser ini tidak mendukung Bluetooth langsung. Pakai Chrome/Edge di Android, atau gunakan "Simpan PDF".');
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
  _device = null; _server = null; _writeChar = null;
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
export async function printReceiptViaBluetooth(receiptData, { charWidth = 32 } = {}) {
  if (!isConnected()) throw new Error('Printer belum tersambung. Sambungkan dulu lewat Setting → Printer.');
  await writeBytes(await buildReceiptBytes(receiptData, charWidth));
}

export async function buildReceiptBytes(data, charWidth = 32) {
  const width = Number(charWidth) >= 48 ? 48 : 32;
  const paperDots = width * 12;
  const rp = (value) => 'Rp' + Math.round(Number(value) || 0).toLocaleString('id-ID');
  const b = new EscPosBuilder().font('A').size(0);

  b.align('center');
  if (data.logoData) {
    try {
      const logo = await imageToCanvas(data.logoData);
      const percent = Math.min(100, Math.max(10, Number(data.logoMaxWidth) || 100));
      const target = Math.max(8, Math.floor(paperDots * percent / 100 / 8) * 8);
      const raster = imageToMonochromeBits(logo, target, 190);
      b.rasterImage(raster.widthPx, raster.heightPx, raster.bits).feed(1);
    } catch { /* logo must not stop text printing */ }
  }
  b.bold(true);
  centeredLines(b, data.storeName, width);
  b.bold(false);
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
  b.align('left').feed(1);

  for (const item of data.lines || []) {
    b.bold(true);
    twoColumnWrapped(b, item.name, rp(item.subtotal), width);
    b.bold(false);
    const qty = `${item.qty} ${item.unit || ''}`.trim();
    compactQuantityLine(b, `${qty} x`, `@ ${rp(item.price)},-`, paperDots);
    if (item.note) wrappedLines(b, item.note, width);
    b.divider(width, '.');
  }

  if (data.discount > 0) b.twoColumn('Diskon', '-' + rp(data.discount), width);
  if (data.shipping > 0) b.twoColumn('Ongkos Kirim', '+' + rp(data.shipping), width);
  if (data.other > 0) twoColumnWrapped(b, data.otherLabel || 'Lain-lain', '+' + rp(data.other), width);
  b.divider(width);

  b.bold(true).size(2);
  b.twoColumn('TOTAL', rp(data.total), width);
  b.size(0).bold(false);
  b.twoColumn('BAYAR', rp(data.paid), width);
  b.bold(true).twoColumn(data.remaining > 0 ? 'SISA' : 'KEMBALI', rp(Math.abs(data.remaining)), width).bold(false);

  if (data.note) {
    b.feed(1).bold(true).line('Catatan:').bold(false);
    wrappedLines(b, data.note, width);
  }

  if (data.qrisImageData) {
    try {
      const qris = await imageToCanvas(data.qrisImageData);
      const qrisWidth = width >= 48 ? 240 : 192;
      const raster = imageToMonochromeBits(qris, qrisWidth, 180);
      b.feed(1).align('center').line('Scan QRIS untuk bayar');
      b.rasterImage(raster.widthPx, raster.heightPx, raster.bits);
    } catch { /* QRIS image is optional */ }
  }

  b.feed(1).align('center');
  for (const line of String(data.footerNote || '').split('\n')) centeredLines(b, line, width);
  return b.size(0).bold(false).feed(3).cut().toBytes();
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
  canvas.height = 22;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  ctx.font = '16px Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(leftText, 0, 11);
  ctx.fillText(rightText, Math.ceil(ctx.measureText(leftText).width) + 14, 11);
  const raster = imageToMonochromeBits(canvas, paperDots, 150);
  builder.rasterImage(raster.widthPx, raster.heightPx, raster.bits);
}

async function imageToCanvas(src) {
  const image = new Image();
  image.src = src;
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('Gambar tidak dapat dimuat.'));
  });
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext('2d').drawImage(image, 0, 0);
  return canvas;
}
