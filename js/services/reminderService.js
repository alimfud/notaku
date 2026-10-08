import { dateShort, toWhatsAppNumber, rupiah } from '../format.js';
import { getProcessStatus, PROCESS_STATUS_LABEL } from './saleService.js';

function dayKey(offset = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getReminderItems(summaries) {
  const today = dayKey();
  const nextWeek = dayKey(7);
  const items = [];
  for (const summary of summaries) {
    const { sale, remaining } = summary;
    if (sale.isDeleted) continue;
    const phone = toWhatsAppNumber(sale.customerPhone);
    const overduePickup = !sale.completed && sale.saleDate < today;
    const upcomingPickup = !sale.completed && sale.saleDate >= today && sale.saleDate <= nextWeek;
    const hasPickupReminder = overduePickup || upcomingPickup;
    const hasPaymentReminder = remaining > 0.5 && sale.saleDate <= nextWeek;
    if (!hasPickupReminder && !hasPaymentReminder) continue;

    const pickupLabel = overduePickup ? 'Pengambilan terlewat' : `Ambil ${dateShort(sale.saleDate)}`;
    const paymentLabel = `Sisa ${rupiah(remaining)}`;
    const messageParts = [`Halo ${sale.customerName}, terkait nota ${sale.invoiceNumber} di NotaKu.`];
    if (hasPickupReminder) messageParts.push(overduePickup ? 'Pesanan belum diambil.' : `Pesanan dijadwalkan diambil ${dateShort(sale.saleDate)}.`);
    if (hasPaymentReminder) messageParts.push(`Sisa pembayaran ${rupiah(remaining)}.`);
    messageParts.push('Mohon konfirmasi ya. Terima kasih.');
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
      message: messageParts.join(' '),
    });
  }
  return items.sort((a, b) => a.priority - b.priority || (a.sale.saleDate + a.sale.saleTime).localeCompare(b.sale.saleDate + b.sale.saleTime));
}

export function reminderWhatsAppUrl(item) {
  return item.phone ? `https://wa.me/${item.phone}?text=${encodeURIComponent(item.message)}` : '';
}
