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

export const DEFAULT_WHATSAPP_REMINDER_TEMPLATE = `Halo *{{pelanggan}}* {{emoji_salam}}

Kami ingin mengingatkan kembali mengenai pesanan Kak di *{{toko}}*:
· No. Nota: *{{invoice}}*
{{#jadwal}}· Jadwal Pengambilan: *{{tanggal}}*
{{/jadwal}}{{#pembayaran}}· Sisa Pembayaran: *{{sisa}}*
{{/pembayaran}}
{{#jadwal_dan_pembayaran}}> Mohon konfirmasi jadwal pengambilan dan sisa pembayarannya ya, Kak.
{{/jadwal_dan_pembayaran}}{{#hanya_jadwal}}> Mohon konfirmasi jadwal pengambilannya ya, Kak.
{{/hanya_jadwal}}{{#hanya_pembayaran}}> Mohon konfirmasi sisa pembayarannya ya, Kak.
{{/hanya_pembayaran}}Terima kasih.`;

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
