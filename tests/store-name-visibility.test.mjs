import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShareText } from '../js/services/printerService.js';
import { buildReceiptBytes } from '../js/services/printing/bluetoothPrinter.js';
import { DEFAULT_WHATSAPP_SHARE_MAIN_TEMPLATE, DEFAULT_WHATSAPP_SHARE_PRODUCT_TEMPLATE } from '../js/services/whatsappTemplateService.js';

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
  data.whatsappTextTemplate = DEFAULT_WHATSAPP_SHARE_MAIN_TEMPLATE;
  data.whatsappProductTemplate = DEFAULT_WHATSAPP_SHARE_PRODUCT_TEMPLATE;
  const text = buildShareText(data);
  assert.match(text, /\*NOTA PESANAN\*/);
  assert.match(text, /INV-001 \|\| 9 Okt 2026/);
  assert.match(text, /Pelanggan: \*Pelanggan\*/);
  assert.match(text, /1\. _Bugis_\n      30 pcs × Rp7\.500 = _Rp225\.000_/);
  assert.match(text, /Total: \*Rp225\.000\*\nDibayar: `Rp100\.000`\nSisa: _Rp125\.000_/);
  assert.match(text, /\*\*\* www\.jajan\.my\.id \*\*\*/);
  assert.match(text, /\n09\/10\/2026$/);
  assert.doesNotMatch(text, /\{\{/);
});

test('shared receipt text accepts a custom template', () => {
  const data = receiptData('Jajan Hajatan');
  data.lines = [{ name: 'Bugis', qty: 2, unit: 'pcs', price: 7500, subtotal: 15000 }];
  data.whatsappTextTemplate = 'Nota {{invoice}}\nPelanggan: {{pelanggan}}\n{{detail}}\nTotal {{total}}';
  const text = buildShareText(data);
  assert.equal(text, 'Nota INV-001\nPelanggan: Pelanggan\n1. _Bugis_\n      2 pcs × Rp7.500 = _Rp15.000_\nTotal Rp10.000');
});

test('Bluetooth receipt omits store-name bytes when disabled', async () => {
  const visible = Buffer.from(await buildReceiptBytes(receiptData('Jajan Hajatan'))).toString('latin1');
  const hidden = Buffer.from(await buildReceiptBytes(receiptData(''))).toString('latin1');
  assert.match(visible, /Jajan Hajatan/);
  assert.doesNotMatch(hidden, /Jajan Hajatan/);
  assert.match(hidden, /INV-001/);
});

test('Bluetooth auto cutter is enabled by default and can be disabled', async () => {
  const cutCommand = Buffer.from([0x1d, 0x56, 0x00]);
  const defaultBytes = Buffer.from(await buildReceiptBytes(receiptData('')));
  const disabledBytes = Buffer.from(await buildReceiptBytes(receiptData(''), 32, false));

  assert.notEqual(defaultBytes.indexOf(cutCommand), -1);
  assert.equal(disabledBytes.indexOf(cutCommand), -1);
});
