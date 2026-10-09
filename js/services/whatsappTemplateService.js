export const LEGACY_DEFAULT_WHATSAPP_SHARE_TEMPLATE = `*NOTA PESANAN*

{{invoice}} || {{tanggal}}
Pelanggan: *{{pelanggan}}*
Toko: _{{toko}}_
────────────

*RINCIAN PESANAN*
{{detail}}
────────────
Total: *{{total}}*
Dibayar: \`{{dibayar}}\`
{{label_sisa}}: _{{sisa}}_
Catatan: {{catatan}}
────────────

{{footer}}`;

export const LEGACY_DEFAULT_WHATSAPP_REMINDER_TEMPLATE = `Halo *{{pelanggan}}* {{emoji_salam}}

Kami ingin mengingatkan kembali mengenai pesanan Kak di *{{toko}}*:
{{detail}}

> {{konfirmasi}}
Terima kasih.`;

const REMINDER_DETAIL_TEMPLATE = `· No. Nota: *{{invoice}}*
{{#jadwal}}· Jadwal Pengambilan: *{{tanggal}}*
{{/jadwal}}{{#pembayaran}}· Sisa Pembayaran: *{{sisa}}*
{{/pembayaran}}`;

const REMINDER_CONFIRMATION_TEMPLATE = `{{#jadwal_dan_pembayaran}}Mohon konfirmasi jadwal pengambilan dan sisa pembayarannya ya, Kak.
{{/jadwal_dan_pembayaran}}{{#hanya_jadwal}}Mohon konfirmasi jadwal pengambilannya ya, Kak.
{{/hanya_jadwal}}{{#hanya_pembayaran}}Mohon konfirmasi sisa pembayarannya ya, Kak.
{{/hanya_pembayaran}}`;

const REMINDER_QUOTED_CONFIRMATION_TEMPLATE = REMINDER_CONFIRMATION_TEMPLATE.replace(/\}\}(?=Mohon)/g, '}}> ');
const PRAYER_EMOJI = String.fromCodePoint(0x1F64F);

export const DEFAULT_WHATSAPP_SHARE_TEMPLATE = `*NOTA PESANAN*

{{invoice}} || {{tanggal}}
Pelanggan: *{{pelanggan}}*
{{#toko}}Toko: _{{toko}}_
{{/toko}}────────────

*RINCIAN PESANAN*
{{#produk}}{{nomor}}. _{{nama_produk}}_
      {{jumlah}} {{satuan}} × {{harga}} = _{{subtotal}}_
{{#catatan_produk}}      {{catatan_produk}}
{{/catatan_produk}}{{/produk}}
{{#diskon}}Diskon: -{{diskon}}
{{/diskon}}{{#ongkir}}Ongkos Kirim: +{{ongkir}}
{{/ongkir}}{{#biaya_lain}}{{label_biaya_lain}}: +{{biaya_lain}}
{{/biaya_lain}}────────────
Total: *{{total}}*
Dibayar: \`{{dibayar}}\`
{{label_sisa}}: _{{sisa}}_
{{#catatan}}Catatan: {{catatan}}
{{/catatan}}────────────

{{footer}}`;

export const LEGACY_DETAILED_WHATSAPP_REMINDER_TEMPLATE = `Halo *{{pelanggan}}* {{emoji_salam}}

Kami ingin mengingatkan kembali mengenai pesanan Kak di *{{toko}}*:
${REMINDER_DETAIL_TEMPLATE}
${REMINDER_QUOTED_CONFIRMATION_TEMPLATE}Terima kasih.`;

export const DEFAULT_WHATSAPP_REMINDER_BOTH_TEMPLATE = `Halo *{{pelanggan}}* ${PRAYER_EMOJI}

Kami ingin mengingatkan kembali mengenai pesanan di *{{toko}}*:
· No. Nota: *{{invoice}}*
· Jadwal Pengambilan: *{{tanggal}}*
· Sisa Pembayaran: *{{sisa}}*

> Mohon konfirmasi jadwal pengambilan dan sisa pembayarannya ya, Kak.
Terima kasih.`;

export const DEFAULT_WHATSAPP_REMINDER_PICKUP_TEMPLATE = `Halo *{{pelanggan}}* ${PRAYER_EMOJI}

Kami ingin mengingatkan kembali mengenai pesanan di *{{toko}}*:
· No. Nota: *{{invoice}}*
· Jadwal Pengambilan: *{{tanggal}}*

> Mohon konfirmasi jadwal pengambilannya ya, Kak.
Terima kasih.`;

export const DEFAULT_WHATSAPP_REMINDER_PAYMENT_TEMPLATE = `Halo *{{pelanggan}}* ${PRAYER_EMOJI}

Kami ingin mengingatkan kembali mengenai pesanan di *{{toko}}*:
· No. Nota: *{{invoice}}*
· Sisa Pembayaran: *{{sisa}}*

> Mohon konfirmasi sisa pembayarannya ya, Kak.
Terima kasih.`;

// Alias kompatibilitas untuk pemanggil lama.
export const DEFAULT_WHATSAPP_REMINDER_TEMPLATE = DEFAULT_WHATSAPP_REMINDER_BOTH_TEMPLATE;

export function expandWhatsAppReminderTemplate(template) {
  return String(template || '')
    .replace(/\{\{\s*detail\s*\}\}/gi, REMINDER_DETAIL_TEMPLATE)
    .replace(/>[ \t]*\{\{\s*konfirmasi\s*\}\}/gi, REMINDER_QUOTED_CONFIRMATION_TEMPLATE)
    .replace(/\{\{\s*konfirmasi\s*\}\}/gi, REMINDER_CONFIRMATION_TEMPLATE)
    .trim();
}

export function reminderTemplateForScenario(template, scenario) {
  const values = {
    jadwal: scenario !== 'payment',
    pembayaran: scenario !== 'pickup',
    jadwal_dan_pembayaran: scenario === 'both',
    hanya_jadwal: scenario === 'pickup',
    hanya_pembayaran: scenario === 'payment',
  };
  return renderWhatsAppTemplate(expandWhatsAppReminderTemplate(template), values);
}

export function renderWhatsAppTemplate(template, values = {}, arrays = {}) {
  let output = String(template || '');
  for (const [name, rows] of Object.entries(arrays)) {
    const block = new RegExp(`\\{\\{#${name}\\}\\}([\\s\\S]*?)\\{\\{\\/${name}\\}\\}`, 'gi');
    output = output.replace(block, (_match, body) => (rows || []).map((row) => renderWhatsAppTemplate(body, { ...values, ...row })).join('\n'));
  }
  const conditional = /\{\{#([a-z_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/gi;
  let previous;
  do {
    previous = output;
    output = output.replace(conditional, (_match, name, body) => values[name.toLowerCase()] ? body : '');
  } while (output !== previous);
  return output
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, key) => Object.hasOwn(values, key.toLowerCase()) ? String(values[key.toLowerCase()] ?? '') : match)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
