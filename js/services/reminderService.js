import { dateShort, toWhatsAppNumber, rupiah } from '../format.js';
import { getProcessStatus, PROCESS_STATUS_LABEL } from './saleService.js';

const PRAYER_EMOJI_TOKEN = '__NOTAKU_PRAYER_EMOJI__';
const PRAYER_EMOJI_URL_BYTES = '%F0%9F%99%8F';

function dayKey(offset = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getReminderItems(summaries, { storeName = 'Toko Saya' } = {}) {
  const today = dayKey();
  const nextWeek = dayKey(7);
  const items = [];
  for (const summary of summaries) {
    const { sale, remaining } = summary;
    if (sale.isDeleted) continue;
    const pickedUp = Boolean(sale.completed) || getProcessStatus(sale) === 'PICKED_UP';
    const phone = toWhatsAppNumber(sale.customerPhone);
    const overduePickup = !pickedUp && sale.saleDate < today;
    const upcomingPickup = !pickedUp && sale.saleDate >= today && sale.saleDate <= nextWeek;
    const hasPickupReminder = overduePickup || upcomingPickup;
    const hasPaymentReminder = remaining > 0.01 && sale.saleDate <= nextWeek;
    if (!hasPickupReminder && !hasPaymentReminder) continue;

    // Tanggal pengambilan sudah tampil di baris utama; tampilkan label hanya
    // untuk kondisi khusus agar informasi tidak berulang.
    const pickupLabel = overduePickup ? 'Pengambilan terlewat' : '';
    const paymentLabel = `Sisa ${rupiah(remaining)}`;
    const message = buildReminderMessage({ sale, remaining, hasPickupReminder, overduePickup, hasPaymentReminder, storeName });
    items.push({
      type: hasPaymentReminder && !hasPickupReminder ? 'payment' : 'pickup',
      priority: overduePickup || summary.displayStatus === 'UNPAID' ? 0 : 1,
      sale,
      phone,
      pickupLabel: hasPickupReminder ? pickupLabel : '',
      paymentLabel: hasPaymentReminder ? paymentLabel : '',
      processLabel: PROCESS_STATUS_LABEL[getProcessStatus(sale)],
      displayStatus: summary.displayStatus,
      label: [hasPickupReminder ? pickupLabel : '', hasPaymentReminder ? paymentLabel : ''].filter(Boolean).join(' · '),
      message,
    });
  }
  return items.sort((a, b) => a.priority - b.priority || (a.sale.saleDate + a.sale.saleTime).localeCompare(b.sale.saleDate + b.sale.saleTime));
}

export function buildReminderMessage({ sale, remaining, hasPickupReminder, hasPaymentReminder, storeName = 'Toko Saya' }) {
  const details = [`· No. Nota: *${sale.invoiceNumber}*`];
  if (hasPickupReminder) details.push(`· Jadwal Pengambilan: *${dateShort(sale.saleDate)}*`);
  if (hasPaymentReminder) details.push(`· Sisa Pembayaran: *${rupiah(remaining)}*`);
  const confirmation = hasPickupReminder && hasPaymentReminder
    ? 'Mohon konfirmasi jadwal pengambilan dan sisa pembayaranNya.'
    : hasPickupReminder
      ? 'Mohon konfirmasi jadwal pengambilannya.'
      : 'Mohon konfirmasi sisa pembayarannya.';
  return `Halo *${sale.customerName}* ${PRAYER_EMOJI_TOKEN}\n\nKami ingin mengingatkan kembali mengenai pesananNya di *${storeName}*:\n${details.join('\n')}\n\n> ${confirmation}\nTerima kasih.`;
}

export function reminderWhatsAppUrl(item) {
  if (!item.phone) return '';
  // Jangan lewatkan emoji astral sebagai karakter mentah melalui HTML/redirect.
  // Sisipkan byte UTF-8 URL resminya setelah seluruh teks ASCII di-encode.
  const encodedToken = encodeURIComponent(PRAYER_EMOJI_TOKEN);
  const encodedMessage = encodeURIComponent(item.message).replace(encodedToken, PRAYER_EMOJI_URL_BYTES);
  // Endpoint API langsung menghindari halaman perantara wa.me yang pada
  // beberapa browser desktop merender emoji sebagai karakter pengganti.
  return `https://api.whatsapp.com/send?phone=${item.phone}&text=${encodedMessage}`;
}
