export const DEFAULT_WHATSAPP_SHARE_TEMPLATE = `*NOTA PESANAN*

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

export const DEFAULT_WHATSAPP_REMINDER_TEMPLATE = `Halo *{{pelanggan}}* {{emoji_salam}}

Kami ingin mengingatkan kembali mengenai pesanan Kak di *{{toko}}*:
{{detail}}

> {{konfirmasi}}
Terima kasih.`;
