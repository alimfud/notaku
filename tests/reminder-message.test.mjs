import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('../js/services/reminderService.js', import.meta.url), 'utf8'))
  .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
const context = vm.createContext({
  Date,
  dateShort: () => '10 Okt 2026',
  rupiah: (value) => 'Rp' + Math.round(value).toLocaleString('id-ID'),
  toWhatsAppNumber: (value) => value,
  getProcessStatus: () => 'NEW',
  PROCESS_STATUS_LABEL: { NEW: 'Baru' },
  encodeURIComponent,
});
vm.runInContext(source + '\nglobalThis.buildMessage = buildReminderMessage; globalThis.waUrl = reminderWhatsAppUrl;', context);

const sale = {
  customerName: 'NAMA Pelanggan',
  invoiceNumber: 'INV-260901',
  saleDate: '2026-10-10',
};

test('pickup and payment reminder follows the WhatsApp paragraph format', () => {
  const message = context.buildMessage({
    sale,
    remaining: 1015000,
    hasPickupReminder: true,
    overduePickup: false,
    hasPaymentReminder: true,
    storeName: 'Jajan Hajatan',
  });
  assert.equal(message,
    'Halo *NAMA Pelanggan* __NOTAKU_PRAYER_EMOJI__\n\n' +
    'Kami ingin mengingatkan kembali mengenai pesanan Kak di *Jajan Hajatan*:\n' +
    '· No. Nota: *INV-260901*\n' +
    '· Jadwal Pengambilan: *10 Okt 2026*\n' +
    '· Sisa Pembayaran: *Rp1.015.000*\n\n' +
    '> Mohon konfirmasi jadwal pengambilan dan sisa pembayarannya ya, Kak.\n' +
    'Terima kasih.');
  const url = context.waUrl({ phone: '6285156654155', message });
  assert.match(url, /^https:\/\/api\.whatsapp\.com\/send\?phone=/);
  assert.match(url, /%F0%9F%99%8F/);
  assert.doesNotMatch(url, /NOTAKU_PRAYER_EMOJI/);
  assert.equal(
    decodeURIComponent(url.split('text=')[1]),
    message.replace('__NOTAKU_PRAYER_EMOJI__', String.fromCodePoint(0x1F64F)),
  );
});

test('payment-only reminder omits pickup wording', () => {
  const message = context.buildMessage({
    sale,
    remaining: 50000,
    hasPickupReminder: false,
    overduePickup: false,
    hasPaymentReminder: true,
    storeName: 'Jajan Hajatan',
  });
  assert.doesNotMatch(message, /dijadwalkan|belum diambil/);
  assert.match(message, /Sisa Pembayaran: \*Rp50\.000\*/);
  assert.match(message, /> Mohon konfirmasi sisa pembayarannya ya, Kak\./);
});
