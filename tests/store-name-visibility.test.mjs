import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShareText } from '../js/services/printerService.js';
import { buildReceiptBytes } from '../js/services/printing/bluetoothPrinter.js';

function receiptData(storeName) {
  return {
    storeName,
    storeAddress: '', storePhone: '', logoData: '',
    invoiceNumber: 'INV-001', dateLabel: '9 Okt 2026', timeLabel: '12:00',
    customerName: 'Pelanggan', customerAddress: '', customerPhoneDisplay: '',
    lines: [], discount: 0, shipping: 0, other: 0,
    total: 10000, paid: 10000, remaining: 0,
    note: '', qrisImageData: '', footerNote: 'Terima kasih',
  };
}

test('shared receipt text omits the store-name line when disabled', () => {
  assert.match(buildShareText(receiptData('Jajan Hajatan')), /Toko: _Jajan Hajatan_/);
  assert.doesNotMatch(buildShareText(receiptData('')), /Toko:/);
});

test('shared receipt text uses the compact receipt layout', () => {
  const data = receiptData('');
  data.lines = [{ name: 'Bugis', qty: 30, unit: 'pcs', price: 7500, subtotal: 225000 }];
  data.total = 225000;
  data.paid = 100000;
  data.remaining = 125000;
  data.footerNote = 'Terimakasih\nwww.jajan.my.id\n09/10/2026 15:55:00';
  const text = buildShareText(data);
  assert.match(text, /\*NOTA PESANAN\*/);
  assert.match(text, /INV-001 \|\| 9 Okt 2026/);
  assert.match(text, /Pelanggan: \*Pelanggan\*/);
  assert.match(text, /1\. _Bugis_\n      30 pcs × Rp7\.500 = _Rp225\.000_/);
  assert.match(text, /Total: \*Rp225\.000\*\nDibayar: `Rp100\.000`\nSisa: _Rp125\.000_/);
  assert.match(text, /\*\*\* www\.jajan\.my\.id \*\*\*/);
  assert.match(text, /\n09\/10\/2026$/);
});

test('Bluetooth receipt omits store-name bytes when disabled', async () => {
  const visible = Buffer.from(await buildReceiptBytes(receiptData('Jajan Hajatan'))).toString('latin1');
  const hidden = Buffer.from(await buildReceiptBytes(receiptData(''))).toString('latin1');
  assert.match(visible, /Jajan Hajatan/);
  assert.doesNotMatch(hidden, /Jajan Hajatan/);
  assert.match(hidden, /INV-001/);
});
