// One DOM capture for image, PDF, and Bluetooth output.
import { rupiah } from '../format.js';
import { isNativeApp } from '../native.js';

function nativePlugin(name) {
  return isNativeApp() ? window.Capacitor?.Plugins?.[name] : null;
}

async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function writeNativeFile(file, directory) {
  const filesystem = nativePlugin('Filesystem');
  if (!filesystem) throw new Error('Penyimpanan Android tidak tersedia.');
  if (directory === 'DOCUMENTS') {
    const permission = await filesystem.requestPermissions();
    if (permission.publicStorage === 'denied') throw new Error('Izin penyimpanan ditolak.');
  }
  return filesystem.writeFile({
    path: `NotaKu/${file.name.replace(/[^A-Za-z0-9._-]/g, '_')}`,
    data: await fileToBase64(file),
    directory,
    recursive: true,
  });
}

export function buildShareText(data) {
  let text = `${data.storeName}\n${data.invoiceNumber} - ${data.dateLabel}\nKepada: ${data.customerName}\n\n`;
  data.lines.forEach((l, i) => {
    text += `${i + 1}. ${l.name}\n${l.qty} ${l.unit || ''} x @ ${rupiah(l.price)},- = ${rupiah(l.subtotal)}\n`;
    if (l.note) text += `${l.note}\n`;
  });
  if (data.discount > 0) text += `Diskon: -${rupiah(data.discount)}\n`;
  if (data.shipping > 0) text += `Ongkos Kirim: +${rupiah(data.shipping)}\n`;
  if (data.other > 0) text += `${data.otherLabel || 'Lain-lain'}: +${rupiah(data.other)}\n`;
  text += `\nTOTAL: ${rupiah(data.total)}\nBAYAR: ${rupiah(data.paid)}\n`;
  text += `${data.remaining > 0 ? 'SISA' : 'KEMBALI'}: ${rupiah(Math.abs(data.remaining))}\n`;
  if (data.note) text += `Catatan: ${data.note}\n`;
  return text + `\n${data.footerNote}`;
}

export async function shareAsText(data) {
  const text = buildShareText(data);
  const nativeShare = nativePlugin('Share');
  if (nativeShare) {
    await nativeShare.share({ title: `Nota ${data.invoiceNumber}`, text, dialogTitle: 'Bagikan nota' });
    return 'shared';
  }
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
  if (isNativeApp()) {
    await writeNativeFile(file, 'DOCUMENTS');
    return 'saved';
  }
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
  const nativeShare = nativePlugin('Share');
  if (nativeShare) {
    const saved = await writeNativeFile(file, 'CACHE');
    await nativeShare.share({ title: file.name, files: [saved.uri], dialogTitle: 'Bagikan nota' });
    return 'shared';
  }
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
