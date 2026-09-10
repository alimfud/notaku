// printerService.js — cetak & bagikan struk.
//
// "Cetak" pakai window.print() dengan CSS khusus (@media print di style.css)
// yang menyembunyikan semua elemen KECUALI struk — ini instan, tidak perlu
// library apa pun. "Bagikan sebagai gambar" pakai Web Share API + canvas
// (html2canvas dimuat lazy). "Bagikan sebagai teks" pakai Web Share API teks
// biasa / clipboard fallback.

import { rupiah } from '../format.js';

export function printReceipt() {
  window.print();
}

export function buildShareText(data) {
  let text = `${data.storeName}\n${data.invoiceNumber} - ${data.dateLabel}\nKepada: ${data.customerName}\n\n`;
  data.lines.forEach((l, i) => {
    text += `${i + 1}. ${l.name}\n    ${l.qty} ${l.unit} x @ ${rupiah(l.price)},- = ${rupiah(l.subtotal)}\n`;
  });
  text += `\nTOTAL: ${rupiah(data.total)}\nBAYAR: ${rupiah(data.paid)}\n`;
  text += data.remaining > 0 ? `SISA: ${rupiah(data.remaining)}\n` : 'LUNAS\n';
  text += `\n${data.footerNote}`;
  return text;
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

/** Render elemen struk jadi gambar PNG lalu bagikan/unduh. */
export async function shareAsImage(receiptElement, invoiceNumber) {
  await loadHtml2Canvas();
  const canvas = await window.html2canvas(receiptElement, { scale: 2, backgroundColor: '#ffffff' });
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  const filename = `${invoiceNumber.replace(/[^A-Za-z0-9-]/g, '_')}.png`;
  const file = new File([blob], filename, { type: 'image/png' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `Nota ${invoiceNumber}` });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}

let _html2canvasPromise = null;
function loadHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve();
  if (_html2canvasPromise) return _html2canvasPromise;
  _html2canvasPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Gagal memuat modul gambar. Periksa koneksi internet.'));
    document.head.appendChild(script);
  });
  return _html2canvasPromise;
}
