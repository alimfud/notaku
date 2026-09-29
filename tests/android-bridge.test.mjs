import assert from 'node:assert/strict';
import test from 'node:test';

const writes = [];
const savedFiles = [];
const shares = [];
const updates = [];

globalThis.window = {
  Capacitor: {
    isNativePlatform: () => true,
    Plugins: {
      BluetoothLe: {
        initialize: async () => {},
        requestDevice: async () => ({ deviceId: 'printer-1', name: 'Printer Uji' }),
        connect: async () => {},
        disconnect: async () => {},
        getServices: async () => ({
          services: [{
            uuid: '000018f0-0000-1000-8000-00805f9b34fb',
            characteristics: [{
              uuid: '00002af1-0000-1000-8000-00805f9b34fb',
              properties: { write: true, writeWithoutResponse: false },
            }],
          }],
        }),
        getMtu: async () => ({ value: 43 }),
        addListener: async () => ({ remove: async () => {} }),
        write: async (options) => writes.push(options),
      },
      Filesystem: {
        requestPermissions: async () => ({ publicStorage: 'granted' }),
        writeFile: async (options) => {
          savedFiles.push(options);
          return { uri: `content://notaku/${options.path}` };
        },
      },
      Share: {
        share: async (options) => shares.push(options),
      },
      AppUpdater: {
        downloadAndInstall: async (options) => {
          updates.push(options);
          return { installerOpened: true };
        },
      },
    },
  },
};
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });

const bluetooth = await import('../js/services/printing/bluetoothPrinter.js');
const printer = await import('../js/services/printerService.js');
const native = await import('../js/native.js');

test('bridge Bluetooth Android memilih karakteristik, mengikuti MTU, dan menulis ESC/POS', async () => {
  const device = await bluetooth.scanAndConnect();
  assert.deepEqual(device, { id: 'printer-1', name: 'Printer Uji' });
  await bluetooth.printReceiptViaBluetooth({ storeName: 'NotaKu', total: 10000, paid: 10000, remaining: 0, lines: [] });
  assert.ok(writes.length > 0);
  assert.ok(writes.every((entry) => entry.deviceId === 'printer-1'));
  assert.ok(writes.every((entry) => entry.value.length <= 80));
});

test('berbagi teks memakai Android Sharesheet', async () => {
  const status = await printer.shareAsText({
    storeName: 'NotaKu', invoiceNumber: 'INV-1', dateLabel: '26/09/2026', customerName: 'Pelanggan',
    lines: [], discount: 0, shipping: 0, other: 0, total: 10000, paid: 10000, remaining: 0, footerNote: 'Terima kasih',
  });
  assert.equal(status, 'shared');
  assert.equal(shares.at(-1).title, 'Nota INV-1');
});

test('simpan dan bagikan file memakai Filesystem native', async () => {
  const file = new File(['nota'], 'INV-1.pdf', { type: 'application/pdf' });
  assert.equal(await printer.downloadReceiptFile(file), 'saved');
  assert.equal(savedFiles.at(-1).directory, 'DOCUMENTS');
  assert.equal(await printer.shareReceiptFile(file), 'shared');
  assert.equal(savedFiles.at(-1).directory, 'CACHE');
  assert.match(shares.at(-1).files[0], /^content:\/\/notaku\//);
});

test('pembaruan Android mengunduh APK melalui updater native', async () => {
  const result = await native.downloadAndInstallUpdate(
    'https://github.com/alimfud/notaku/releases/download/v1.7.1/NotaKu-v1.7.1.apk',
    '1.7.1',
  );
  assert.equal(result.installerOpened, true);
  assert.deepEqual(updates.at(-1), {
    url: 'https://github.com/alimfud/notaku/releases/download/v1.7.1/NotaKu-v1.7.1.apk',
    version: '1.7.1',
  });
});
