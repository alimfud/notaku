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
  assert.match(buildShareText(receiptData('Jajan Hajatan')), /^Jajan Hajatan\nINV-001/);
  assert.match(buildShareText(receiptData('')), /^INV-001/);
});

test('Bluetooth receipt omits store-name bytes when disabled', async () => {
  const visible = Buffer.from(await buildReceiptBytes(receiptData('Jajan Hajatan'))).toString('latin1');
  const hidden = Buffer.from(await buildReceiptBytes(receiptData(''))).toString('latin1');
  assert.match(visible, /Jajan Hajatan/);
  assert.doesNotMatch(hidden, /Jajan Hajatan/);
  assert.match(hidden, /INV-001/);
});
