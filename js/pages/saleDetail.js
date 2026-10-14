// pages/saleDetail.js

import { getSaleSummary, addPayment, updatePayment, deletePayment, deleteSale, duplicateSale, setProcessStatus, getProcessStatus, PROCESS_STATUS, PROCESS_STATUS_LABEL, AppError } from '../services/saleService.js';
import * as db from '../db.js';
import { getSettings } from '../services/settingsService.js';
import { rupiah, dateShort, escapeHtml, qtyLabel, resolveFooterNote, maskPhone, toWhatsAppNumber } from '../format.js';
import { openSheet, confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { navigate, setPageTitle, setTopbarActions, navigateBack } from '../app.js';
import { shareAsText, buildShareText, createReceiptImage, createReceiptPdf, createImageFileFromDataUrl, downloadReceiptFile, shareReceiptFile } from '../services/printerService.js';
import { receiptLogo, logoWidth } from '../services/receiptLogo.js';
import { dynamicQrisImage } from '../services/qrisService.js';

/**
 * PERFORMANCE FIX #4: Timeout & Loading UI
 * Utility function untuk prevent infinite loading pada jaringan lambat
 */
async function withTimeout(promise, ms = 10000) {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Operasi memakan waktu terlalu lama (>${(ms/1000).toFixed(0)}s). Periksa koneksi internet Anda.`));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]);
}

export async function render(root, params) {
  setPageTitle('Detail Nota');
  const saleId = params[0];
  
  // Identitas aplikasi tampil tenang tanpa spinner bundar berulang.
  root.innerHTML = `
    <div class="sale-detail-loading" role="status" aria-label="Menyiapkan nota">
      ${document.querySelector('#loadingOverlay .thermal-printer')?.outerHTML || ''}
      <span>Menyiapkan nota</span>
    </div>
  `;
  
  try {
    await draw(root, saleId);
  } catch (e) {
    console.error('[saleDetail.render]', e);
    root.innerHTML = `
      <div style="padding:2em;text-align:center;">
        <p style="font-size:1.5em;margin-bottom:0.5em;">❌ Gagal memuat nota</p>
        <p style="color:#666;margin-bottom:1em;">${escapeHtml(e.message || 'Periksa koneksi internet atau coba reload aplikasi.')}</p>
        <button onclick="location.reload()" style="padding:0.8em 1.5em;background:#791e38;color:white;border:none;border-radius:4px;cursor:pointer;font-size:1em;">
          🔄 Coba Lagi
        </button>
      </div>
    `;
  }
}

async function draw(root, saleId) {
  // Gunakan timeout untuk prevent infinite loading
  const summary = await withTimeout(getSaleSummary(saleId), 8000);
  if (!summary) {
    root.innerHTML = `<div class="empty-state"><p>Nota tidak ditemukan.</p></div>`;
    return;
  }
  const items = await withTimeout(db.getByIndex('saleItems', 'saleId', saleId), 8000);
  items.sort((a, b) => a.sortOrder - b.sortOrder);
  const settings = await withTimeout(getSettings(), 5000);
  const { sale, paidAmount, remaining, payments, displayStatus } = summary;
  const processStatus = getProcessStatus(sale);
  const showQris = settings.qrisEnabled && settings.qrisImageData && displayStatus !== 'PAID' && displayStatus !== 'OVERPAID';
  const qrisImageData = showQris
    ? dynamicQrisImage(settings, remaining, sale.invoiceNumber)
    : '';
  const receiptQrisImageData = settings.qrisShowOnReceipt !== false ? qrisImageData : '';
  const bluetoothQrisImageData = settings.qrisShowOnBluetooth !== false ? qrisImageData : '';
  const phoneDisplay = displayPhone(sale.customerPhone, settings);

  setTopbarActions([
    { icon: 'edit', label: 'Edit', title: 'Ubah Nota', onClick: () => navigate(`sale/${saleId}/edit`) },
    { icon: 'bluetoothPrint', label: 'Print', title: 'Cetak Bluetooth', onClick: () => handleBluetoothPrint(sale, items, settings, paidAmount, remaining, bluetoothQrisImageData) },
    { icon: 'payment', label: 'Bayar', title: 'Tambah Pembayaran', onClick: () => handleAddPayment(root, saleId, remaining) },
    { icon: 'delete', label: 'Hapus', title: 'Hapus', onClick: () => handleDelete(root, saleId) },
  ]);

  const footerResolved = resolveFooterNote(settings.footerNote);
  const addressPhoneLine = [sale.customerAddress, phoneDisplay].filter(Boolean).join(' • ');

  root.innerHTML = `
    ${sale.autoMarkedPaid || sale.autoCompleted ? `
      <div class="receipt-alert">
        <div class="receipt-alert-text"><b>LUNAS dan SUDAH DIAMBIL otomatis</b> karena tanggal pengambilan telah lewat. Jika pesanan sebenarnya belum diambil, ubah Status Proses di bawah atau tekan tombol <b>Belum Diambil</b>. DP dan pembayaran manual tetap tersimpan.</div>
        <button id="revertAutoBtn" class="receipt-alert-action">Belum Diambil</button>
      </div>` : ''}
    <section class="sale-process-card">
      <div class="sale-process-card-copy"><small>STATUS PROSES PESANAN</small><strong>${PROCESS_STATUS_LABEL[processStatus]}</strong></div>
      <select id="processStatus" aria-label="Status proses pesanan">
        ${Object.entries(PROCESS_STATUS_LABEL).map(([value, label]) => `<option value="${value}" ${value === processStatus ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
    </section>
    <div class="sale-detail-receipt-wrap">
      <div class="receipt" id="receiptCapture">
        ${receiptLogoMarkup(settings)}
        ${settings.showStoreNameOnReceipt !== false ? `<div class="receipt-shop">${escapeHtml(settings.storeName)}</div>` : ''}
        ${settings.storeAddress ? `<div class="receipt-addr">${escapeHtml(settings.storeAddress)}</div>` : ''}
        ${settings.storePhone ? `<div class="receipt-addr">${escapeHtml(settings.storePhone)}</div>` : ''}
        <div class="receipt-meta">
          <span>${dateShort(sale.saleDate)}</span><span>${sale.saleTime}</span><span>${escapeHtml(sale.invoiceNumber)}</span>
        </div>
        <div class="receipt-customer">${escapeHtml(sale.customerName)}</div>
        ${addressPhoneLine ? `<div class="row-meta receipt-customer-info">${escapeHtml(addressPhoneLine)}</div>` : ''}
        ${items.map((it) => `
          <div class="receipt-item">
            <div class="ri-top"><span>${escapeHtml(it.productName)}</span><span>${rupiah(it.subtotal)}</span></div>
            <div class="ri-bottom"><span class="ri-qty">${qtyLabel(it.qty)} ${escapeHtml(it.unit || '')} x</span><span class="ri-price">@ ${rupiah(it.price)},-</span></div>
            ${it.note ? `<div class="ri-bottom receipt-note">${escapeHtml(it.note)}</div>` : ''}
          </div>`).join('')}
        <div class="receipt-totals">
          ${sale.discountAmount > 0 ? `<div class="tr"><span>Diskon</span><span>-${rupiah(sale.discountAmount)}</span></div>` : ''}
          ${sale.shippingAmount > 0 ? `<div class="tr"><span>Ongkos Kirim</span><span>+${rupiah(sale.shippingAmount)}</span></div>` : ''}
          ${sale.otherAmount > 0 ? `<div class="tr"><span>${escapeHtml(sale.otherLabel || 'Lain-lain')}</span><span>+${rupiah(sale.otherAmount)}</span></div>` : ''}
          <div class="tr grand"><span>TOTAL</span><span>${rupiah(sale.total)}</span></div>
          <div class="tr receipt-payment-detail"><span>BAYAR</span><span>${rupiah(paidAmount)}</span></div>
          <div class="tr receipt-payment-detail receipt-balance ${remaining > 0 ? 'receipt-balance--due' : 'receipt-balance--paid'}">
            <span>${remaining > 0 ? 'SISA' : 'KEMBALI'}</span><span>${rupiah(Math.abs(remaining))}</span>
          </div>
        </div>
        ${sale.note ? `<div class="row-meta receipt-note">Catatan: ${escapeHtml(sale.note)}</div>` : ''}
        ${receiptQrisImageData ? `
          <div class="receipt-qris">
            <div class="receipt-qris-label">Scan QRIS untuk bayar</div>
            <img src="${escapeHtml(receiptQrisImageData)}" alt="QRIS" class="receipt-qris-image">
          </div>` : ''}
        ${footerResolved ? `<div class="receipt-footer">${escapeHtml(footerResolved)}</div>` : ''}
      </div>
    </div>
    ${payments.length ? `
      <div class="sale-detail-section-heading"><div><h3>Riwayat pembayaran</h3></div><small>${payments.length} catatan</small></div>
      <div class="sale-detail-payment-list list">
        ${payments.map((p, index) => `
          <button class="sale-detail-payment-row row" data-pid="${p.id}">
            <span class="sale-detail-payment-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4"/></svg></span>
            <span class="sale-detail-payment-body">
              <span class="sale-detail-payment-label">Pembayaran ${index + 1}</span>
              <span class="sale-detail-payment-meta">${dateShort(p.paymentDate)} · ${escapeHtml(p.paymentTime || '')}</span>
              ${p.note ? `<span class="sale-detail-payment-note">${escapeHtml(p.note)}</span>` : ''}
            </span>
            <span class="sale-detail-payment-trailing"><strong>${rupiah(p.amount)}</strong><i aria-hidden="true">›</i></span>
          </button>`).join('')}
      </div>` : ''}
    <div class="sale-detail-actions">
      <button id="addPaymentBtn" class="sale-detail-secondary-action btn secondary">+ Tambah Pembayaran</button>
      <button id="printBtn" class="sale-detail-secondary-action btn secondary">Bagikan / Salin Nota</button>
    </div>
  `;

  root.querySelector('#addPaymentBtn').onclick = () => handleAddPayment(root, saleId, remaining);
  root.querySelector('#processStatus').onchange = async (event) => {
    try {
      await setProcessStatus(saleId, event.target.value);
      toast(`Status proses: ${PROCESS_STATUS_LABEL[event.target.value]}`);
      await draw(root, saleId);
    } catch (error) {
      toast(error.userMessage || error.message || 'Gagal mengubah status proses.');
    }
  };
  root.querySelector('#printBtn').onclick = () => showShareSheet(root, saleId, sale, items, settings, paidAmount, remaining);
  const revertBtn = root.querySelector('#revertAutoBtn');
  if (revertBtn) {
    revertBtn.onclick = async () => {
      const confirmed = await confirmDialog({
        title: 'Pesanan Belum Diambil?',
        message: 'Pelunasan otomatis akan dihapus dan status proses dikembalikan ke BARU. DP serta pembayaran manual tetap tersimpan. Setelah itu status dapat diubah menjadi DIKERJAKAN atau SIAP DIAMBIL.',
        confirmLabel: 'Ya, Belum Diambil',
      });
      if (!confirmed) return;
      await setProcessStatus(saleId, PROCESS_STATUS.NEW);
      toast('Pelunasan otomatis dibatalkan dan status dikembalikan ke BARU');
      await draw(root, saleId);
    };
  }
  root.querySelectorAll('[data-pid]').forEach((btn) => {
    btn.onclick = () => handleEditPayment(root, saleId, payments.find((p) => p.id === btn.dataset.pid));
  });
}

async function handleDuplicate(saleId) {
  const confirmed = await confirmDialog({
    title: 'Salin nota ini?',
    message: 'Nota baru akan dibuat dengan pelanggan, produk, dan nominal yang sama. Nomor nota serta pembayaran tidak disalin, dan data baru masih dapat kamu edit sebelum disimpan.',
    confirmLabel: 'Lanjutkan Salin',
  });
  if (!confirmed) return;
  try {
    const id = await duplicateSale(saleId);
    toast('Nota berhasil diduplikasi');
    navigate(`sale/${id}/edit`);
  } catch (error) {
    toast(error.userMessage || error.message || 'Gagal menduplikasi nota.');
  }
}

async function handleAddPayment(root, saleId, remaining) {
  const result = await openSheet((body, close) => {
    body.classList.add('sale-detail-payment-sheet');
    body.innerHTML = `
      <div class="sale-detail-sheet-header"><div><small>PEMBAYARAN</small><div class="sheet-title">Tambah Pembayaran</div></div><button class="sale-detail-sheet-close" id="paymentClose" type="button" aria-label="Tutup">×</button></div>
      <div class="sale-detail-payment-summary"><span>Sisa tagihan</span><strong>${rupiah(remaining)}</strong></div>
      <label class="sale-detail-sheet-field"><span>Jumlah bayar</span><div><b>Rp</b><input id="pAmount" type="number" inputmode="numeric" min="1" placeholder="0" autofocus></div></label>
      <div class="sale-detail-sheet-footer"><button class="btn" id="pSave" type="button">Simpan Pembayaran</button></div>
    `;
    body.querySelector('#paymentClose').onclick = () => close(undefined);
    body.querySelector('#pSave').onclick = () => {
      const amount = Number(body.querySelector('#pAmount').value) || 0;
      if (amount <= 0) return;
      close(amount);
    };
  });
  if (!result) return;
  try {
    await addPayment(saleId, result);
    toast('Pembayaran ditambahkan');
    await draw(root, saleId);
  } catch (e) {
    toast(e instanceof AppError ? e.userMessage : 'Gagal mencatat pembayaran.');
  }
}

async function handleEditPayment(root, saleId, payment) {
  const result = await openSheet((body, close) => {
    body.classList.add('sale-detail-payment-edit-sheet');
    body.innerHTML = `
      <div class="sale-detail-sheet-header"><div><small>PEMBAYARAN</small><div class="sheet-title">Koreksi Pembayaran</div></div><button class="sale-detail-sheet-close" id="paymentEditClose" type="button" aria-label="Tutup">×</button></div>
      <div class="sale-detail-payment-edit-fields">
        <label class="sale-detail-sheet-field"><span>Jumlah bayar</span><div><b>Rp</b><input id="pAmount" type="number" inputmode="numeric" min="1" value="${Math.round(payment.amount)}" autofocus></div></label>
        <div class="sale-detail-payment-datetime">
          <label class="sale-detail-sheet-field"><span>Tanggal</span><div><input id="pDate" type="date" value="${payment.paymentDate}"></div></label>
          <label class="sale-detail-sheet-field"><span>Jam</span><div><input id="pTime" type="time" value="${payment.paymentTime}"></div></label>
        </div>
        <label class="sale-detail-sheet-field"><span>Catatan <em>Opsional</em></span><div><input id="pNote" value="${escapeHtml(payment.note || '')}" placeholder="Tambahkan catatan"></div></label>
      </div>
      <div class="sale-detail-sheet-footer has-delete">
        <button class="btn danger" id="pDelete" type="button">Hapus</button>
        <button class="btn" id="pSave" type="button">Simpan Perubahan</button>
      </div>
    `;
    body.querySelector('#paymentEditClose').onclick = () => close(undefined);
    body.querySelector('#pSave').onclick = () => {
      const amount = Number(body.querySelector('#pAmount').value) || 0;
      if (amount <= 0) { toast('Jumlah harus lebih dari 0'); return; }
      close({
        action: 'update',
        amount,
        paymentDate: body.querySelector('#pDate').value,
        paymentTime: body.querySelector('#pTime').value,
        note: body.querySelector('#pNote').value,
      });
    };
    body.querySelector('#pDelete').onclick = () => close({ action: 'delete' });
  });
  if (!result) return;

  try {
    if (result.action === 'delete') {
      const confirmed = await confirmDialog({
        title: 'Hapus Pembayaran?',
        message: 'Catatan pembayaran ini akan dihapus dan sisa tagihan akan dihitung ulang.',
        confirmLabel: 'Hapus',
        dangerous: true,
      });
      if (!confirmed) return;
      await deletePayment(payment.id);
      toast('Pembayaran dihapus');
    } else {
      await updatePayment(payment.id, result);
      toast('Pembayaran diperbarui');
    }
    await draw(root, saleId);
  } catch (e) {
    toast(e instanceof AppError ? e.userMessage : 'Gagal memperbarui pembayaran.');
  }
}

async function handleDelete(root, saleId) {
  const confirmed = await confirmDialog({
    title: 'Hapus Nota?',
    message: 'Nota ini akan disembunyikan dari daftar. Tindakan ini tidak menghapus data secara permanen.',
    confirmLabel: 'Hapus',
    dangerous: true,
  });
  if (!confirmed) return;
  try {
    await deleteSale(saleId);
    toast('Nota dihapus');
    navigateBack();
  } catch (e) {
    toast(e instanceof AppError ? e.userMessage : 'Gagal menghapus nota.');
  }
}

function buildReceiptDataForShare(sale, items, settings, paidAmount, remaining) {
  return {
    storeName: settings.showStoreNameOnReceipt !== false ? settings.storeName : '',
    invoiceNumber: sale.invoiceNumber,
    dateLabel: dateShort(sale.saleDate),
    customerName: sale.customerName,
    lines: items.map((i) => ({ name: i.productName, qty: i.qty, unit: i.unit, subtotal: i.subtotal, price: i.price, note: i.note })),
    discount: sale.discountAmount, shipping: sale.shippingAmount,
    other: sale.otherAmount, otherLabel: sale.otherLabel, note: sale.note,
    total: sale.total,
    paid: paidAmount,
    remaining,
    footerNote: resolveFooterNote(settings.footerNote),
    whatsappTextTemplate: settings.whatsappShareTemplate || '',
    whatsappProductTemplate: settings.whatsappShareProductTemplate || '',
  };
}

function receiptLogoMarkup(settings) {
  return `<div class="receipt-logo-wrap"><img src="${escapeHtml(receiptLogo(settings))}" alt="Logo toko" class="receipt-logo logo-width-${logoWidth(settings)}"></div>`;
}

async function showShareSheet(root, saleId, sale, items, settings, paidAmount, remaining) {
  const hasPhone = !!sale.customerPhone;
  const qrisImageData = settings.qrisEnabled && settings.qrisImageData && remaining > 0
    ? dynamicQrisImage(settings, remaining, sale.invoiceNumber)
    : '';
  const canShareQris = !!qrisImageData && settings.qrisShowOnShare !== false;

  const result = await openSheet((body, close) => {
    body.classList.add('sale-detail-share-sheet');
    body.innerHTML = `
      <div class="sale-detail-sheet-header"><div><small>KIRIM &amp; SIMPAN</small><div class="sheet-title">Bagikan Nota</div></div><button class="sale-detail-sheet-close" id="shareClose" type="button" aria-label="Tutup">×</button></div>
      <div class="sale-detail-share-options">
      ${hasPhone ? `<button class="settings-tile" id="chatWa"><div class="icon-box">💚</div><div class="settings-body"><div class="settings-title">Chat WA ${escapeHtml(sale.customerPhone)}</div><div class="settings-sub">Buka WhatsApp langsung ke nomor pelanggan</div></div></button>` : ''}
      <button class="settings-tile" id="shareImage"><div class="icon-box">🖼️</div><div class="settings-body"><div class="settings-title">Bagikan sebagai Gambar</div></div></button>
      <button class="settings-tile" id="shareText"><div class="icon-box">💬</div><div class="settings-body"><div class="settings-title">Bagikan sebagai Teks</div></div></button>
      <button class="settings-tile" id="doPrint"><div class="icon-box">🖨️</div><div class="settings-body"><div class="settings-title">Simpan PDF</div></div></button>
      ${canShareQris ? '<button class="settings-tile" id="shareQris"><div class="icon-box">🔳</div><div class="settings-body"><div class="settings-title">Bagikan QRIS</div><div class="settings-sub">Kirim gambar QRIS langsung ke pelanggan</div></div></button>' : ''}
      <button class="settings-tile" id="duplicateSale"><div class="icon-box">⧉</div><div class="settings-body"><div class="settings-title">Salin sebagai Nota Baru</div><div class="settings-sub">Buat nota baru dari data nota ini</div></div></button>
      </div>
    `;
    body.querySelector('#shareClose').onclick = () => close(undefined);
    const chatBtn = body.querySelector('#chatWa');
    if (chatBtn) chatBtn.onclick = () => close('chatwa');
    body.querySelector('#shareText').onclick = () => close('text');
    body.querySelector('#shareImage').onclick = () => close('image');
    body.querySelector('#doPrint').onclick = () => close('print');
    body.querySelector('#shareQris')?.addEventListener('click', () => close('qris'));
    body.querySelector('#duplicateSale').onclick = () => close('duplicate');
  });

  if (result === 'chatwa') {
    const waNumber = toWhatsAppNumber(sale.customerPhone);
    if (!waNumber) { toast('Nomor WA pelanggan tidak valid.'); return; }
    window.open(`https://wa.me/${waNumber}`, '_blank');
    return;
  }

  if (result === 'duplicate') {
    await handleDuplicate(saleId);
    return;
  }

  if (result === 'text') {
    try {
      const shareData = buildReceiptDataForShare(sale, items, settings, paidAmount, remaining);
      const waNumber = toWhatsAppNumber(sale.customerPhone);
      if (waNumber) {
        window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(buildShareText(shareData))}`, '_blank');
        return;
      }
      const status = await shareAsText(shareData);
      if (status === 'copied') toast('Teks nota disalin ke clipboard');
    } catch (e) { toast('Gagal membagikan nota.'); }
    return;
  }
  if (result === 'qris') {
    document.getElementById('loadingOverlay').classList.remove('hidden');
    try {
      const file = await createImageFileFromDataUrl(qrisImageData, `QRIS-${sale.invoiceNumber}`);
      document.getElementById('loadingOverlay').classList.add('hidden');
      await showFileShare(file, toWhatsAppNumber(sale.customerPhone), false, 'QRIS');
    } catch (e) { toast(e.message || 'Gagal menyiapkan gambar QRIS.'); }
    finally { document.getElementById('loadingOverlay').classList.add('hidden'); }
    return;
  }
  if (result === 'image' || result === 'print') {
    document.getElementById('loadingOverlay').classList.remove('hidden');
    try {
      const el = document.getElementById('receiptCapture');
      const file = result === 'image'
        ? await createReceiptImage(el, sale.invoiceNumber)
        : await createReceiptPdf(el, sale.invoiceNumber, settings.paperSize);
      document.getElementById('loadingOverlay').classList.add('hidden');
      await showFileShare(file, toWhatsAppNumber(sale.customerPhone), result === 'print', 'Nota');
    } catch (e) { toast(e.message || 'Gagal membuat file nota.'); }
    finally { document.getElementById('loadingOverlay').classList.add('hidden'); }
  }
}

// A fresh tap after file generation preserves Web Share / popup user activation.
async function showFileShare(file, waNumber, isPdf, label = 'Nota') {
  await openSheet((body, close) => {
    body.innerHTML = `<div class="sheet-title">${isPdf ? 'PDF' : 'Gambar'} ${label} Siap</div>
      ${waNumber ? '<p class="receipt-share-help">Unduh file dan buka chat pelanggan, lalu lampirkan file tersebut di WhatsApp. Menu berbagi perangkat juga tersedia.</p>' : ''}
      ${waNumber ? '<button class="btn" id="fileWa">Unduh &amp; Buka WA Pelanggan</button>' : ''}
      <button class="btn secondary" id="fileShare">Bagikan ${isPdf ? 'PDF' : 'Gambar'} ${label}</button>
      <button class="btn secondary" id="fileSave">Simpan ${isPdf ? 'PDF' : 'Gambar'} ${label}</button>`;
    const wa = body.querySelector('#fileWa');
    if (wa) wa.onclick = async () => {
      await downloadReceiptFile(file);
      window.open(`https://wa.me/${waNumber}`, '_blank', 'noopener');
      close();
    };
    body.querySelector('#fileSave').onclick = async () => {
      try {
        await downloadReceiptFile(file);
        toast('File nota diunduh');
        close();
      } catch (e) { toast(e.message || 'Gagal menyimpan file nota.'); }
    };
    body.querySelector('#fileShare').onclick = async () => {
      try {
        const status = await shareReceiptFile(file);
        if (status === 'downloaded') toast('File nota diunduh');
        if (status !== 'cancelled') close();
      } catch (e) { toast(e.message || 'Gagal membagikan file nota.'); }
    };
  });
}

function buildBluetoothReceiptData(sale, items, settings, paidAmount, remaining, qrisImageData = '') {
  return {
    storeName: settings.showStoreNameOnBluetooth !== false ? settings.storeName : '',
    storeAddress: settings.storeAddress,
    storePhone: settings.storePhone,
    logoData: receiptLogo(settings),
    logoMaxWidth: logoWidth(settings),
    invoiceNumber: sale.invoiceNumber,
    dateLabel: dateShort(sale.saleDate),
    timeLabel: sale.saleTime,
    customerName: sale.customerName,
    customerAddress: sale.customerAddress,
    customerPhoneDisplay: displayPhone(sale.customerPhone, settings),
    lines: items.map((item) => ({
      name: item.productName, qty: item.qty, unit: item.unit,
      price: item.price, subtotal: item.subtotal, note: item.note,
    })),
    discount: sale.discountAmount,
    shipping: sale.shippingAmount,
    other: sale.otherAmount,
    otherLabel: sale.otherLabel,
    total: sale.total,
    paid: paidAmount,
    remaining,
    note: sale.note,
    qrisImageData: settings.qrisEnabled && remaining > 0 ? qrisImageData : '',
    footerNote: resolveFooterNote(settings.footerNote),
  };
}

async function handleBluetoothPrint(sale, items, settings, paidAmount, remaining, qrisImageData = '') {
  const bt = await import('../services/printing/bluetoothPrinter.js');
  const receiptData = buildBluetoothReceiptData(sale, items, settings, paidAmount, remaining, qrisImageData);
  const loading = document.getElementById('loadingOverlay');
  loading.classList.remove('hidden');
  try {
    loading.classList.add('hidden');
    if (settings.printPreview && !await showBluetoothPreview(receiptData, settings.btCharWidth)) return;
    loading.classList.remove('hidden');
    if (!bt.isConnected()) {
      const reconnected = settings.btPrinterId ? await bt.reconnectSaved(settings.btPrinterId) : null;
      if (!reconnected) {
        loading.classList.add('hidden');
        const connected = await openSheet((body, close) => {
          body.innerHTML = '<div class="sheet-title">Printer Belum Tersambung</div><p class="receipt-share-help">Nyalakan printer dan Bluetooth perangkat, lalu pilih printer.</p><button class="btn" id="connectReceiptPrinter">Cari Printer</button>';
          body.querySelector('#connectReceiptPrinter').onclick = async (event) => {
            event.currentTarget.disabled = true;
            try {
              const info = await bt.scanAndConnect();
              const { saveSettings } = await import('../services/settingsService.js');
              await saveSettings({ btPrinterId: info.id, btPrinterName: info.name });
              close(true);
            } catch (error) {
              toast(error.message || 'Gagal menyambungkan printer.');
              body.querySelector('#connectReceiptPrinter').disabled = false;
            }
          };
        });
        if (!connected) return;
        loading.classList.remove('hidden');
      }
    }
    await bt.printReceiptViaBluetooth(receiptData, { charWidth: settings.btCharWidth || 32 });
    toast('Berhasil dikirim ke printer');
  } catch (e) {
    toast(e.message || 'Gagal mencetak via Bluetooth.');
  } finally {
    loading.classList.add('hidden');
  }
}

async function showBluetoothPreview(data, charWidth) {
  const is80mm = Number(charWidth) >= 48;
  const widthClass = is80mm ? 'bluetooth-native-preview--80' : 'bluetooth-native-preview--58';
  return await openSheet((body, close) => {
    body.innerHTML = `<div class="sheet-title">Preview Bluetooth</div><div class="print-preview-label">Teks tajam • Bluetooth ${is80mm ? '80mm' : '58mm'}</div><div class="print-preview-wrap"><div class="bluetooth-native-preview ${widthClass}">
      <div class="bluetooth-native-center"><img src="${escapeHtml(data.logoData)}" class="receipt-logo logo-width-${data.logoMaxWidth}" alt="Logo">${data.storeName ? `<b>${escapeHtml(data.storeName)}</b>` : ''}${data.storeAddress ? `<span>${escapeHtml(data.storeAddress)}</span>` : ''}${data.storePhone ? `<span>${escapeHtml(data.storePhone)}</span>` : ''}</div>
      <div class="bluetooth-native-divider"></div>
      <div class="bluetooth-native-columns"><span>${escapeHtml(data.dateLabel)}</span><span>${escapeHtml(data.timeLabel)}</span><span>${escapeHtml(data.invoiceNumber)}</span></div>
      <div class="bluetooth-native-divider"></div>
      <div class="bluetooth-native-center"><b>${escapeHtml(data.customerName)}</b>${data.customerAddress || data.customerPhoneDisplay ? `<span>${escapeHtml([data.customerAddress, data.customerPhoneDisplay].filter(Boolean).join(' - '))}</span>` : ''}</div>
      <div class="bluetooth-native-gap"></div>
      ${data.lines.map((item) => `<div class="bluetooth-native-item"><div class="bluetooth-native-pair bluetooth-native-bold"><span>${escapeHtml(item.name)}</span><span>${rupiah(item.subtotal)}</span></div><div class="bluetooth-native-quantity"><span>${qtyLabel(item.qty)} ${escapeHtml(item.unit || '')} x</span><span>@ ${rupiah(item.price)},-</span></div>${item.note ? `<div>${escapeHtml(item.note)}</div>` : ''}</div>`).join('')}
      ${data.discount > 0 ? `<div class="bluetooth-native-pair"><span>Diskon</span><span>-${rupiah(data.discount)}</span></div>` : ''}
      ${data.shipping > 0 ? `<div class="bluetooth-native-pair"><span>Ongkos Kirim</span><span>+${rupiah(data.shipping)}</span></div>` : ''}
      ${data.other > 0 ? `<div class="bluetooth-native-pair"><span>${escapeHtml(data.otherLabel || 'Lain-lain')}</span><span>+${rupiah(data.other)}</span></div>` : ''}
      <div class="bluetooth-native-divider"></div>
      <div class="bluetooth-native-pair bluetooth-native-total"><span>TOTAL</span><span>${rupiah(data.total)}</span></div>
      <div class="bluetooth-native-pair"><span>BAYAR</span><span>${rupiah(data.paid)}</span></div>
      <div class="bluetooth-native-pair bluetooth-native-bold"><span>${data.remaining > 0 ? 'SISA' : 'KEMBALI'}</span><span>${rupiah(Math.abs(data.remaining))}</span></div>
      ${data.note ? `<div class="bluetooth-native-note"><b>Catatan:</b><br>${escapeHtml(data.note)}</div>` : ''}
      ${data.qrisImageData ? `<div class="bluetooth-native-center"><span>Scan QRIS untuk bayar</span><img class="bluetooth-native-qris" src="${escapeHtml(data.qrisImageData)}" alt="QRIS"></div>` : ''}
      <div class="bluetooth-native-footer">${escapeHtml(data.footerNote)}</div>
    </div></div><div class="sheet-actions"><button class="btn secondary" id="cancelPreview">Kembali</button><button class="btn" id="confirmPrint">Cetak Bluetooth</button></div>`;
    body.querySelector('#cancelPreview').onclick = () => close(false);
    body.querySelector('#confirmPrint').onclick = () => close(true);
  }) === true;
}

function displayPhone(phone, settings) {
  if (!phone || settings.customerPhoneDisplay === 'HIDDEN') return '';
  if (settings.customerPhoneDisplay === 'FULL' || (!settings.customerPhoneDisplay && !settings.maskCustomerPhone)) return phone;
  return maskPhone(phone);
}
