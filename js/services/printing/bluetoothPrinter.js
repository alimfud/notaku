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
// klasik — solusinya pakai "Cetak / Simpan PDF" lalu bagikan ke app seperti
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
    throw new Error('Browser ini tidak mendukung Bluetooth langsung. Pakai Chrome/Edge di Android, atau gunakan "Cetak / Simpan PDF".');
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

/**
 * Cetak struk lewat printer Bluetooth yang sedang tersambung.
 * `receiptData` sama seperti dipakai PdfReceiptAdapter (lihat receiptData.js kalau ada).
 * `qrisCanvas` opsional: elemen <canvas> berisi QR code untuk dicetak (kalau QRIS aktif & belum lunas).
 */
export async function printReceiptViaBluetooth(receiptData, { charWidth = 32, qrisCanvas = null } = {}) {
  if (!isConnected()) throw new Error('Printer belum tersambung. Sambungkan dulu lewat Setting → Printer.');

  const b = new EscPosBuilder();
  b.align('center');
  b.bold(true).size(1);
  b.line(receiptData.storeName);
  b.size(0).bold(false);
  if (receiptData.storeAddress) b.line(receiptData.storeAddress);
  if (receiptData.storePhone) b.line(receiptData.storePhone);
  b.divider(charWidth);
  b.align('left');
  b.twoColumn(receiptData.dateLabel, receiptData.timeLabel, charWidth);
  b.line(receiptData.invoiceNumber);
  b.divider(charWidth);
  b.bold(true).line(receiptData.customerName).bold(false);
  b.feed(1);

  for (const line of receiptData.lines) {
    b.line(line.name);
    const qty = `${line.qty} ${line.unit || ''}`.trim();
    b.twoColumn(`  ${qty} x ${line.price.toLocaleString('id-ID')}`, line.subtotal.toLocaleString('id-ID'), charWidth);
  }
  b.divider(charWidth);
  if (receiptData.discount > 0) b.twoColumn('Diskon', '-' + receiptData.discount.toLocaleString('id-ID'), charWidth);
  b.bold(true).size(1);
  b.twoColumn('TOTAL', receiptData.total.toLocaleString('id-ID'), Math.floor(charWidth * 0.7));
  b.size(0).bold(false);
  b.twoColumn('BAYAR', receiptData.paid.toLocaleString('id-ID'), charWidth);
  const remLabel = receiptData.remaining > 0 ? 'SISA' : 'KEMBALI';
  b.twoColumn(remLabel, Math.abs(receiptData.remaining).toLocaleString('id-ID'), charWidth);

  if (receiptData.note) { b.feed(1); b.line('Catatan: ' + receiptData.note); }

  if (qrisCanvas) {
    b.feed(1);
    b.align('center');
    b.line('Scan QRIS untuk bayar:');
    const { widthPx, heightPx, bits } = imageToMonochromeBits(qrisCanvas, Math.min(charWidth * 8, 384));
    b.rasterImage(widthPx, heightPx, bits);
  }

  b.feed(1);
  b.align('center');
  if (receiptData.footerNote) {
    for (const l of receiptData.footerNote.split('\n')) b.line(l);
  }
  b.feed(3);
  b.cut();

  await writeBytes(b.toBytes());
}
