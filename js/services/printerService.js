// One DOM capture for image, PDF, and Bluetooth output.
import { rupiah } from '../format.js';
import { renderWhatsAppTemplate } from './whatsappTemplateService.js';

function itemText(data) {
  return data.lines.map((l, i) => [
    `${i + 1}. _${l.name}_`,
    `      ${l.qty} ${l.unit || ''} × ${rupiah(l.price)} = _${rupiah(l.subtotal)}_`,
    ...(l.note ? [`      ${l.note}`] : []),
  ].join('\n')).join('\n');
}

function detailText(data) {
  const lines = [itemText(data)];
  if (data.discount > 0) lines.push(`Diskon: -${rupiah(data.discount)}`);
  if (data.shipping > 0) lines.push(`Ongkos Kirim: +${rupiah(data.shipping)}`);
  if (data.other > 0) lines.push(`${data.otherLabel || 'Lain-lain'}: +${rupiah(data.other)}`);
  return lines.filter(Boolean).join('\n');
}

function footerText(footerNote) {
  return String(footerNote || '').split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const dateOnly = line.match(/^(\d{2}\/\d{2}\/\d{4})(?:\s+\d{2}:\d{2}:\d{2})?$/);
    if (dateOnly) return dateOnly[1];
    if (/^(?:https?:\/\/|www\.)/i.test(line)) return `*** ${line.replace(/^\*+|\*+$/g, '').trim()} ***`;
    return line;
  }).join('\n');
}

function customShareText(data, template) {
  const products = data.lines.map((line, index) => ({
    nomor: index + 1,
    nama_produk: line.name || '',
    jumlah: line.qty,
    satuan: line.unit || '',
    harga: rupiah(line.price),
    subtotal: rupiah(line.subtotal),
    catatan_produk: line.note || '',
  }));
  const values = {
    invoice: data.invoiceNumber || '',
    tanggal: data.dateLabel || '',
    pelanggan: data.customerName || '',
    toko: data.storeName || '',
    detail: detailText(data),
    produk: products.length > 0,
    diskon: data.discount > 0 ? rupiah(data.discount) : '',
    ongkir: data.shipping > 0 ? rupiah(data.shipping) : '',
    biaya_lain: data.other > 0 ? rupiah(data.other) : '',
    label_biaya_lain: data.otherLabel || 'Lain-lain',
    total: rupiah(data.total),
    dibayar: rupiah(data.paid),
    label_sisa: data.remaining > 0 ? 'Sisa' : 'Kembali',
    sisa: rupiah(Math.abs(data.remaining)),
    catatan: data.note || '',
    footer: footerText(data.footerNote),
  };
  const optional = new Set(['toko', 'catatan']);
  const prepared = template.includes('{{#') ? template : template.split('\n').filter((line) => {
    const keys = [...line.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)].map((match) => match[1].toLowerCase());
    return !keys.some((key) => optional.has(key) && !values[key]);
  }).join('\n');
  return renderWhatsAppTemplate(prepared, values, { produk: products });
}

export function buildShareText(data) {
  const template = String(data.whatsappTextTemplate || '').trim();
  if (template) return customShareText(data, template);
  const separator = '────────────';
  const lines = [
    '*NOTA PESANAN*',
    '',
    `${data.invoiceNumber} || ${data.dateLabel}`,
    `Pelanggan: *${data.customerName}*`,
  ];
  if (data.storeName) lines.push(`Toko: _${data.storeName}_`);
  lines.push(separator, '', '*RINCIAN PESANAN*');

  lines.push(itemText(data));
  if (data.discount > 0) lines.push(`Diskon: -${rupiah(data.discount)}`);
  if (data.shipping > 0) lines.push(`Ongkos Kirim: +${rupiah(data.shipping)}`);
  if (data.other > 0) lines.push(`${data.otherLabel || 'Lain-lain'}: +${rupiah(data.other)}`);

  lines.push(
    separator,
    `Total: *${rupiah(data.total)}*`,
    `Dibayar: \`${rupiah(data.paid)}\``,
    `${data.remaining > 0 ? 'Sisa' : 'Kembali'}: _${rupiah(Math.abs(data.remaining))}_`,
  );
  if (data.note) lines.push(`Catatan: ${data.note}`);
  lines.push(separator, '');
  lines.push(footerText(data.footerNote));
  return lines.join('\n');
}

export async function shareAsText(data) {
  const text = buildShareText(data);
  if (navigator.share) {
    try {
      await navigator.share({ title: `Nota ${data.invoiceNumber}`, text });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
    }
  }
  await navigator.clipboard.writeText(text);
  return 'copied';
}

const loaders = new Map();
function loadScript(path, ready) {
  if (ready()) return Promise.resolve();
  if (!loaders.has(path)) {
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL(path, import.meta.url).href;
      script.onload = () => ready() ? resolve() : reject(new Error('Modul nota tidak tersedia.'));
      script.onerror = () => { script.remove(); reject(new Error('Gagal memuat modul nota. Muat ulang aplikasi.')); };
      document.head.appendChild(script);
    }).catch((error) => { loaders.delete(path); throw error; });
    loaders.set(path, promise);
  }
  return loaders.get(path);
}

export async function captureReceipt(element) {
  if (!element?.isConnected) throw new Error('Detail nota tidak tersedia.');
  await loadScript('../vendor/html2canvas.min.js', () => !!window.html2canvas);
  await document.fonts.ready;
  await Promise.all(Array.from(element.querySelectorAll('img')).map(async (img) => {
    try { await img.decode(); } catch { throw new Error('Logo atau QRIS gagal dimuat. Coba muat ulang nota.'); }
  }));
  return window.html2canvas(element, { scale: 2, backgroundColor: '#ffffff', logging: false });
}

function filename(invoiceNumber, extension) {
  return `${invoiceNumber.replace(/[^A-Za-z0-9-]/g, '_')}.${extension}`;
}

export async function createReceiptImage(element, invoiceNumber) {
  const canvas = await captureReceipt(element);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Gagal membuat gambar nota.');
  return new File([blob], filename(invoiceNumber, 'png'), { type: 'image/png' });
}

export async function createReceiptPdf(element, invoiceNumber, paperSize) {
  const canvas = await captureReceipt(element);
  await loadScript('../vendor/jspdf.umd.min.js', () => !!window.jspdf);
  const a4 = paperSize === 'PDF_A4';
  const width = a4 ? 210 : paperSize === 'THERMAL_80MM' ? 80 : 58;
  const margin = a4 ? 10 : 0;
  const contentWidth = width - margin * 2;
  const imageHeight = canvas.height * contentWidth / canvas.width;
  // Paginate long receipts instead of exceeding PDF page dimension limits.
  const height = a4 ? 297 : Math.min(1000, Math.max(width, imageHeight));
  const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: [width, height], orientation: 'portrait' });
  const rowsPerPage = Math.max(1, Math.floor((height - margin * 2) * canvas.width / contentWidth));
  for (let y = 0; y < canvas.height; y += rowsPerPage) {
    if (y) pdf.addPage([width, height], 'portrait');
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = Math.min(rowsPerPage, canvas.height - y);
    slice.getContext('2d').drawImage(canvas, 0, y, slice.width, slice.height, 0, 0, slice.width, slice.height);
    pdf.addImage(slice.toDataURL('image/png'), 'PNG', margin, margin, contentWidth, slice.height * contentWidth / slice.width);
  }
  return new File([pdf.output('blob')], filename(invoiceNumber, 'pdf'), { type: 'application/pdf' });
}

export async function downloadReceiptFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'downloaded';
}

export async function shareReceiptFile(file) {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
    }
  }
  await downloadReceiptFile(file);
  return 'downloaded';
}
