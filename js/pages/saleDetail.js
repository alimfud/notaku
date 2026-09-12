// pages/saleDetail.js

import { getSaleSummary, addPayment, updatePayment, deletePayment, deleteSale, setCompleted, revertAutoLunas, AppError } from '../services/saleService.js';
import * as db from '../db.js';
import { getSettings } from '../services/settingsService.js';
import { rupiah, dateShort, escapeHtml, qtyLabel, resolveFooterNote, maskPhone, toWhatsAppNumber } from '../format.js';
import { openSheet, confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { navigate, setPageTitle, setTopbarActions, navigateBack } from '../app.js';
import { printReceipt, shareAsText, shareAsImage, buildShareText } from '../services/printerService.js';

export async function render(root, params) {
  setPageTitle('Detail Nota');
  const saleId = params[0];
  await draw(root, saleId);
}

function itemLineLabel(qty, unit, price) {
  // Format sesuai permintaan: "1 pcs x @ Rp10.000,-" (bukan "1 x Rp10.000").
  return `${qtyLabel(qty)} ${unit || ''} x @ ${rupiah(price)},-`.replace(/\s+x/, ' x');
}

async function draw(root, saleId) {
  const summary = await getSaleSummary(saleId);
  if (!summary) {
    root.innerHTML = `<div class="empty-state"><p>Nota tidak ditemukan.</p></div>`;
    return;
  }
  const items = await db.getByIndex('saleItems', 'saleId', saleId);
  items.sort((a, b) => a.sortOrder - b.sortOrder);
  const settings = await getSettings();
  const { sale, paidAmount, remaining, payments, displayStatus } = summary;
  const showQris = settings.qrisEnabled && settings.qrisImageData && displayStatus !== 'PAID' && displayStatus !== 'OVERPAID';
  const phoneDisplay = sale.customerPhone ? (settings.maskCustomerPhone ? maskPhone(sale.customerPhone) : sale.customerPhone) : '';

  setTopbarActions([
    { icon: 'edit', title: 'Ubah Nota', onClick: () => navigate(`sale/${saleId}/edit`) },
    { icon: 'share', title: 'Bagikan', onClick: () => showShareSheet(root, sale, items, settings, paidAmount, remaining) },
    { icon: 'delete', title: 'Hapus', onClick: () => handleDelete(root, saleId) },
  ]);

  const footerResolved = resolveFooterNote(settings.footerNote, sale.updatedAt);
  const addressPhoneLine = [sale.customerAddress, phoneDisplay].filter(Boolean).join(' • ');

  root.innerHTML = `
    ${sale.autoMarkedPaid ? `
      <div style="margin:16px 16px 0;padding:12px 14px;border-radius:12px;background:var(--primary-container);display:flex;align-items:center;gap:10px;">
        <div style="flex:1;font-size:12.5px;color:var(--ink-soft);">Ditandai <b>LUNAS otomatis</b> karena sudah &gt;2 hari dari tanggal pengambilan.</div>
        <button id="revertAutoBtn" style="background:none;border:1px solid var(--ink);border-radius:8px;padding:6px 10px;font-size:11.5px;font-weight:700;white-space:nowrap;">Batalkan</button>
      </div>` : ''}
    ${sale.autoCompleted ? `
      <div style="margin:${sale.autoMarkedPaid ? '8px' : '16px'} 16px 0;padding:12px 14px;border-radius:12px;background:var(--surface-dim);">
        <div style="font-size:12.5px;color:var(--ink-soft);">Ditandai <b>SELESAI otomatis</b> karena tanggal pengambilan sudah lewat. Ketuk "Tandai Belum Selesai" di bawah kalau ini keliru.</div>
      </div>` : ''}
    <div style="padding:16px;">
      <div class="receipt" id="receiptCapture" style="border:1px solid var(--outline);border-radius:16px;">
        <div class="receipt-shop">${escapeHtml(settings.storeName)}</div>
        ${settings.storeAddress ? `<div class="receipt-addr">${escapeHtml(settings.storeAddress)}</div>` : ''}
        ${settings.storePhone ? `<div class="receipt-addr">${escapeHtml(settings.storePhone)}</div>` : ''}
        <div class="receipt-meta">
          <span>${dateShort(sale.saleDate)}</span><span>${sale.saleTime}</span><span>${escapeHtml(sale.invoiceNumber)}</span>
        </div>
        <div class="receipt-customer">${escapeHtml(sale.customerName)}</div>
        ${addressPhoneLine ? `<div class="row-meta">${escapeHtml(addressPhoneLine)}</div>` : ''}
        ${items.map((it) => `
          <div class="receipt-item">
            <div class="ri-top"><span>${escapeHtml(it.productName)}</span><span>${rupiah(it.subtotal)}</span></div>
            <div class="ri-bottom"><span>${itemLineLabel(it.qty, it.unit, it.price)}</span></div>
            ${it.note ? `<div class="ri-bottom" style="font-style:italic;">${escapeHtml(it.note)}</div>` : ''}
          </div>`).join('')}
        <div class="receipt-totals">
          ${sale.discountAmount > 0 ? `<div class="tr"><span>Diskon</span><span>-${rupiah(sale.discountAmount)}</span></div>` : ''}
          ${sale.taxAmount > 0 ? `<div class="tr"><span>Pajak${sale.adjustments?.tax?.inclusive ? ' (termasuk harga)' : ''}</span><span>${sale.adjustments?.tax?.inclusive ? '' : '+'}${rupiah(sale.taxAmount)}</span></div>` : ''}
          ${sale.tax2Amount > 0 ? `<div class="tr"><span>Pajak #2${sale.adjustments?.tax2?.inclusive ? ' (termasuk harga)' : ''}</span><span>${sale.adjustments?.tax2?.inclusive ? '' : '+'}${rupiah(sale.tax2Amount)}</span></div>` : ''}
          ${sale.shippingAmount > 0 ? `<div class="tr"><span>Ongkos Kirim</span><span>+${rupiah(sale.shippingAmount)}</span></div>` : ''}
          ${sale.otherAmount > 0 ? `<div class="tr"><span>${escapeHtml(sale.otherLabel || 'Lain-lain')}</span><span>+${rupiah(sale.otherAmount)}</span></div>` : ''}
          <div class="tr grand"><span>TOTAL</span><span>${rupiah(sale.total)}</span></div>
          <div class="tr"><span>BAYAR</span><span>${rupiah(paidAmount)}</span></div>
          <div class="tr" style="color:${remaining > 0 ? 'var(--accent)' : 'var(--status-lunas)'};font-weight:700;">
            <span>${remaining > 0 ? 'SISA' : 'KEMBALI'}</span><span>${rupiah(Math.abs(remaining))}</span>
          </div>
        </div>
        ${sale.note ? `<div class="row-meta" style="margin-top:8px;">Catatan: ${escapeHtml(sale.note)}</div>` : ''}
        ${showQris ? `
          <div style="text-align:center;margin-top:14px;">
            <div style="font-size:12px;color:var(--ink-soft);margin-bottom:6px;">Scan QRIS untuk bayar</div>
            <img src="${settings.qrisImageData}" alt="QRIS" style="width:160px;height:160px;object-fit:contain;">
          </div>` : ''}
        ${footerResolved ? `<div class="receipt-footer">${escapeHtml(footerResolved)}</div>` : ''}
      </div>
    </div>
    ${payments.length ? `
      <div class="section-title">Riwayat Pembayaran <span style="font-weight:400;text-transform:none;font-style:italic;">(ketuk untuk koreksi)</span></div>
      <div class="list" style="padding:0 16px;">
        ${payments.map((p) => `
          <button class="row" data-pid="${p.id}" style="padding:8px 0;border-bottom:1px solid var(--outline);border-radius:0;background:none;">
            <div class="row-body">
              <div style="font-weight:600;font-size:14px;">${rupiah(p.amount)}</div>
              <div class="row-meta">${p.paymentDate} • ${p.paymentTime}${p.note ? ' • ' + escapeHtml(p.note) : ''}</div>
            </div>
            <span style="color:var(--muted);">✎</span>
          </button>`).join('')}
      </div>` : ''}
    <div style="padding:20px 16px;">
      <button id="toggleCompletedBtn" class="btn ${sale.completed ? 'secondary' : ''}" style="margin:0;">${sale.completed ? '↺ Tandai Belum Selesai' : '✓ Tandai Selesai'}</button>
      <button id="addPaymentBtn" class="btn secondary" style="margin-top:10px;">+ Tambah Pembayaran</button>
      <button id="printBtn" class="btn secondary" style="margin-top:10px;">Bagikan Nota</button>
    </div>
  `;

  root.querySelector('#addPaymentBtn').onclick = () => handleAddPayment(root, saleId, remaining);
  root.querySelector('#printBtn').onclick = () => showShareSheet(root, sale, items, settings, paidAmount, remaining);
  root.querySelector('#toggleCompletedBtn').onclick = async () => {
    await setCompleted(saleId, !sale.completed);
    toast(sale.completed ? 'Ditandai belum selesai' : 'Ditandai selesai');
    await draw(root, saleId);
  };
  const revertBtn = root.querySelector('#revertAutoBtn');
  if (revertBtn) {
    revertBtn.onclick = async () => {
      const confirmed = await confirmDialog({
        title: 'Batalkan LUNAS Otomatis?',
        message: 'Nota ini akan ditandai BELUM LUNAS lagi sesuai jumlah pembayaran yang sungguh tercatat. Nota ini tidak akan ditandai LUNAS otomatis lagi di kemudian hari.',
        confirmLabel: 'Ya, Batalkan',
      });
      if (!confirmed) return;
      await revertAutoLunas(saleId);
      toast('Status LUNAS otomatis dibatalkan');
      await draw(root, saleId);
    };
  }
  root.querySelectorAll('[data-pid]').forEach((btn) => {
    btn.onclick = () => handleEditPayment(root, saleId, payments.find((p) => p.id === btn.dataset.pid));
  });
}

async function handleAddPayment(root, saleId, remaining) {
  const result = await openSheet((body, close) => {
    body.innerHTML = `
      <div class="sheet-title">Tambah Pembayaran</div>
      <div style="padding:0 20px 8px;color:var(--muted);font-size:13px;">Sisa saat ini: ${rupiah(remaining)}</div>
      <div class="field"><label>Jumlah Bayar</label><input id="pAmount" type="number" inputmode="numeric" autofocus></div>
      <button class="btn" id="pSave">Simpan</button>
    `;
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
    body.innerHTML = `
      <div class="sheet-title">Koreksi Pembayaran</div>
      <div class="field"><label>Jumlah Bayar</label><input id="pAmount" type="number" inputmode="numeric" value="${Math.round(payment.amount)}" autofocus></div>
      <div class="field" style="display:flex;gap:12px;">
        <div style="flex:1;"><label>Tanggal</label><input id="pDate" type="date" value="${payment.paymentDate}"></div>
        <div style="flex:1;"><label>Jam</label><input id="pTime" type="time" value="${payment.paymentTime}"></div>
      </div>
      <div class="field"><label>Catatan (opsional)</label><input id="pNote" value="${escapeHtml(payment.note || '')}"></div>
      <button class="btn" id="pSave">Simpan Perubahan</button>
      <button class="btn danger" id="pDelete">Hapus Pembayaran Ini</button>
    `;
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
    storeName: settings.storeName,
    invoiceNumber: sale.invoiceNumber,
    dateLabel: dateShort(sale.saleDate),
    customerName: sale.customerName,
    lines: items.map((i) => ({ name: i.productName, qty: i.qty, unit: i.unit, subtotal: i.subtotal, price: i.price })),
    total: sale.total,
    paid: paidAmount,
    remaining,
    footerNote: resolveFooterNote(settings.footerNote, sale.updatedAt),
  };
}

async function showShareSheet(root, sale, items, settings, paidAmount, remaining) {
  const { isConnected, currentDeviceInfo } = await import('../services/printing/bluetoothPrinter.js');
  const btConnected = isConnected ? isConnected() : false;
  const btInfo = currentDeviceInfo ? currentDeviceInfo() : null;
  const hasPhone = !!sale.customerPhone;

  const result = await openSheet((body, close) => {
    body.innerHTML = `
      <div class="sheet-title">Bagikan Nota</div>
      ${hasPhone ? `<button class="settings-tile" id="chatWa"><div class="icon-box">💚</div><div class="settings-body"><div class="settings-title">Chat WA ${escapeHtml(sale.customerPhone)}</div><div class="settings-sub">Buka WhatsApp langsung ke nomor pelanggan</div></div></button>` : ''}
      <button class="settings-tile" id="btPrint"><div class="icon-box">🔵</div><div class="settings-body"><div class="settings-title">Cetak via Bluetooth</div><div class="settings-sub">${btConnected ? 'Tersambung: ' + escapeHtml(btInfo.name) : (settings.btPrinterId ? 'Tersimpan — akan coba sambung ulang' : 'Belum ada printer tersambung')}</div></div></button>
      <button class="settings-tile" id="shareImage"><div class="icon-box">🖼️</div><div class="settings-body"><div class="settings-title">Bagikan sebagai Gambar</div></div></button>
      <button class="settings-tile" id="shareText"><div class="icon-box">💬</div><div class="settings-body"><div class="settings-title">Bagikan sebagai Teks</div></div></button>
      <button class="settings-tile" id="doPrint"><div class="icon-box">🖨️</div><div class="settings-body"><div class="settings-title">Cetak / Simpan PDF</div></div></button>
    `;
    const chatBtn = body.querySelector('#chatWa');
    if (chatBtn) chatBtn.onclick = () => close('chatwa');
    body.querySelector('#btPrint').onclick = () => close('bluetooth');
    body.querySelector('#shareText').onclick = () => close('text');
    body.querySelector('#shareImage').onclick = () => close('image');
    body.querySelector('#doPrint').onclick = () => close('print');
  });

  if (result === 'print') { printReceipt(); return; }
  if (result === 'bluetooth') { await handleBluetoothPrint(sale, items, settings, paidAmount, remaining); return; }

  if (result === 'chatwa') {
    const waNumber = toWhatsAppNumber(sale.customerPhone);
    if (!waNumber) { toast('Nomor WA pelanggan tidak valid.'); return; }
    const text = buildShareText(buildReceiptDataForShare(sale, items, settings, paidAmount, remaining));
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`, '_blank');
    return;
  }

  if (result === 'text') {
    try {
      const status = await shareAsText(buildReceiptDataForShare(sale, items, settings, paidAmount, remaining));
      if (status === 'copied') toast('Teks nota disalin ke clipboard');
    } catch (e) { toast('Gagal membagikan nota.'); }
    return;
  }
  if (result === 'image') {
    try {
      const el = document.getElementById('receiptCapture');
      const status = await shareAsImage(el, sale.invoiceNumber);
      if (status === 'downloaded') toast('Gambar nota diunduh');
    } catch (e) { toast(e.message || 'Gagal membuat gambar nota.'); }
  }
}

async function handleBluetoothPrint(sale, items, settings, paidAmount, remaining) {
  const bt = await import('../services/printing/bluetoothPrinter.js');
  const phoneDisplay = sale.customerPhone ? (settings.maskCustomerPhone ? maskPhone(sale.customerPhone) : sale.customerPhone) : '';
  const receiptData = {
    storeName: settings.storeName, storeAddress: settings.storeAddress, storePhone: settings.storePhone,
    invoiceNumber: sale.invoiceNumber, dateLabel: dateShort(sale.saleDate), timeLabel: sale.saleTime,
    customerName: sale.customerName, customerAddress: sale.customerAddress, customerPhoneDisplay: phoneDisplay,
    lines: items.map((i) => ({ name: i.productName, qty: i.qty, unit: i.unit, price: i.price, subtotal: i.subtotal, note: i.note })),
    subtotal: sale.subtotal, discount: sale.discountAmount,
    tax: sale.taxAmount, taxInclusive: sale.adjustments?.tax?.inclusive,
    tax2: sale.tax2Amount, tax2Inclusive: sale.adjustments?.tax2?.inclusive,
    shipping: sale.shippingAmount, other: sale.otherAmount, otherLabel: sale.otherLabel,
    total: sale.total, paid: paidAmount, remaining, note: sale.note,
    footerNote: resolveFooterNote(settings.footerNote, sale.updatedAt),
  };

  document.getElementById('loadingOverlay').classList.remove('hidden');
  try {
    if (!bt.isConnected()) {
      const reconnected = settings.btPrinterId ? await bt.reconnectSaved(settings.btPrinterId) : null;
      if (!reconnected) {
        document.getElementById('loadingOverlay').classList.add('hidden');
        const confirmScan = await confirmDialog({
          title: 'Printer Belum Tersambung',
          message: 'Cari printer Bluetooth sekarang? Pastikan printer sudah menyala dan Bluetooth HP aktif.',
          confirmLabel: 'Cari Printer',
        });
        if (!confirmScan) return;
        document.getElementById('loadingOverlay').classList.remove('hidden');
        await bt.scanAndConnect();
      }
    }

    await bt.printReceiptViaBluetooth(receiptData, { charWidth: settings.btCharWidth || 32 });
    toast('Berhasil dikirim ke printer');
  } catch (e) {
    toast(e.message || 'Gagal mencetak via Bluetooth.');
  } finally {
    document.getElementById('loadingOverlay').classList.add('hidden');
  }
}
