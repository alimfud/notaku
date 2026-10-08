import * as db from '../db.js';
import { dateShort, rupiah, uid } from '../format.js';

const PAYMENT_STATUS_LABEL = {
  UNPAID: 'Belum bayar',
  PARTIAL: 'Sebagian dibayar',
  PAID: 'Lunas',
  OVERPAID: 'Lebih bayar',
};

const AUDIT_FIELD_LABEL = {
  customerName: 'Nama pelanggan',
  customerPhone: 'No. WhatsApp',
  customerAddress: 'Alamat pelanggan',
  saleDate: 'Tanggal nota',
  saleTime: 'Jam pengambilan',
  total: 'Total nota',
  note: 'Catatan',
  status: 'Status pembayaran',
};

function displayAuditValue(field, value) {
  const text = String(value ?? '').trim();
  if (!text) return 'kosong';
  if (field === 'saleDate') return dateShort(text) || text;
  if (field === 'total') return rupiah(Number(text));
  if (field === 'status') return PAYMENT_STATUS_LABEL[text] || text;
  return text;
}

export function formatAuditChange(field, before, after) {
  // ID pelanggan adalah detail teknis, bukan informasi yang berguna bagi pengguna.
  if (field === 'customerId') return '';
  const label = AUDIT_FIELD_LABEL[field] || field;
  return `${label}: “${displayAuditValue(field, before)}” → “${displayAuditValue(field, after)}”`;
}

/**
 * Menerjemahkan log perubahan versi lama yang masih menyimpan nama field
 * database, supaya riwayat yang sudah tersimpan tetap mudah dibaca.
 */
export function formatAuditDetails(details) {
  const text = String(details || '').trim();
  if (!text) return 'Aktivitas dicatat.';

  const marker = ' diubah — ';
  if (!text.includes(marker)) {
    return text
      .replace(/^Status proses nota (.+?): (NEW|IN_PROGRESS|READY|PICKED_UP)$/i, (_, invoice, status) => {
        const labels = { NEW: 'Baru', IN_PROGRESS: 'Dikerjakan', READY: 'Siap diambil', PICKED_UP: 'Sudah diambil' };
        return `Status proses nota ${invoice}: ${labels[status.toUpperCase()] || status}`;
      });
  }

  const [prefix, rawChanges] = text.split(marker);
  const readablePrefix = prefix.replace(/ diubah$/, '');
  const changes = [];
  const changePattern = /(customerId|customerName|customerPhone|customerAddress|saleDate|saleTime|total|note|status): "([^"]*)" → "([^"]*)"/g;
  let match;
  while ((match = changePattern.exec(rawChanges))) {
    const formatted = formatAuditChange(match[1], match[2], match[3]);
    if (formatted) changes.push(formatted);
  }
  if (!changes.length) return `${readablePrefix} diperbarui.`;
  return `${readablePrefix}: ${changes.join('; ')}`;
}

export async function recordAudit(action, entityType, entityId = '', details = '') {
  try {
    await db.put('auditLogs', {
      id: uid(), action, entityType, entityId, details,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('[audit]', error);
  }
}

export async function getAuditLogs(limit = 200) {
  const rows = await db.getAll('auditLogs');
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

export async function purgeExpiredAuditLogs(days = 30) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const rows = await db.getAll('auditLogs');
  const expired = rows.filter((row) => row.createdAt && new Date(row.createdAt).getTime() < cutoff);
  await Promise.all(expired.map((row) => db.remove('auditLogs', row.id)));
  return expired.length;
}
