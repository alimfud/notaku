// pages/saleDetail.js

import { getSaleSummary, addPayment, deleteSale, AppError } from '../services/saleService.js';
import * as db from '../db.js';
import { getSettings } from '../services/settingsService.js';
import { rupiah, dateShort, escapeHtml, qtyLabel } from '../format.js';
import { openSheet, confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { setPageTitle, setTopbarActions, navigateBack } from '../app.js';
import { printReceipt, shareAsText, shareAsImage } from '../services/printerService.js';

export async function render(root, params) {
  setPageTitle('Detail Nota');
  const saleId = params[0];
  await draw(root, saleId);
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
  const { sale, paidAmount, remaining, payments } = summary;

  setTopbarActions([
    { icon: 'share', title: 'Bagikan', onClick: () => showShareSheet(root, sale, items, settings, paidAmount, remaining) },
    { icon: 'delete', title: 'Hapus', onClick: () => handleDelete(root, saleId) },
  ]);

  root.innerHTML = `
    <div style="padding:16px;">
      <div class="receipt" id="receiptCapture" style="border:1px solid var(--outline);border-radius:16px;">
        <div class="receipt-shop">${escapeHtml(settings.storeName)}</div>
        ${settings.storeAddress ? `<div class="receipt-addr">${escapeHtml(settings.storeAddress)}</div>` : ''}
        <div class="receipt-meta">
          <span>${dateShort(sale.saleDate)}</span><span>${sale.saleTime}</span><span>${escapeHtml(sale.invoiceNumber)}</span>
        </div>
        <div class="receipt-customer">${escapeHtml(sale.customerName)}</div>
        ${items.map((it) => `
          <div class="receipt-item">
            <div class="ri-top"><span>${escapeHtml(it.productName)}</span><span>${rupiah(it.subtotal)}</span></div>
            <div class="ri-bottom"><span>${qtyLabel(it.qty)} ${escapeHtml(it.unit || '')} x ${rupiah(it.price)}</span></div>
          </div>`).join('')}
        <div class="receipt-totals">
          ${sale.discountAmount > 0 ? `<div class="tr"><span>Diskon</span><span>-${rupiah(sale.discountAmount)}</span></div>` : ''}
          <div class="tr grand"><span>TOTAL</span><span>${rupiah(sale.total)}</span></div>
          <div class="tr"><span>BAYAR</span><span>${rupiah(paidAmount)}</span></div>
          <div class="tr" style="color:${remaining > 0 ? 'var(--accent)' : 'var(--status-lunas)'};font-weight:700;">
            <span>${remaining > 0 ? 'SISA' : 'KEMBALI'}</span><span>${rupiah(Math.abs(remaining))}</span>
          </div>
        </div>
        ${sale.note ? `<div class="row-meta" style="margin-top:8px;">Catatan: ${escapeHtml(sale.note)}</div>` : ''}
        ${settings.footerNote ? `<div class="receipt-footer">${escapeHtml(settings.footerNote)}</div>` : ''}
      </div>
    </div>
    ${payments.length ? `
      <div class="section-title">Riwayat Pembayaran</div>
      <div class="list" style="padding:0 16px;">
        ${payments.map((p) => `
          <div style="padding:8px 0;border-bottom:1px solid var(--outline);display:flex;justify-content:space-between;">
            <div>
              <div style="font-weight:600;font-size:14px;">${rupiah(p.amount)}</div>
              <div class="row-meta">${p.paymentDate} • ${p.paymentTime}${p.note ? ' • ' + escapeHtml(p.note) : ''}</div>
            </div>
          </div>`).join('')}
      </div>` : ''}
    <div style="padding:20px 16px;">
      ${remaining > 0 ? `<button id="addPaymentBtn" class="btn" style="margin:0;">+ Tambah Pembayaran</button>` : ''}
      <button id="printBtn" class="btn secondary" style="margin-top:10px;">Cetak</button>
    </div>
  `;

  const addBtn = root.querySelector('#addPaymentBtn');
  if (addBtn) addBtn.onclick = () => handleAddPayment(root, saleId, remaining);
  root.querySelector('#printBtn').onclick = () => printReceipt();
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

async function showShareSheet(root, sale, items, settings, paidAmount, remaining) {
  const result = await openSheet((body, close) => {
    body.innerHTML = `
      <div class="sheet-title">Bagikan Nota</div>
      <button class="settings-tile" id="shareText"><div class="icon-box">💬</div><div class="settings-body"><div class="settings-title">Bagikan sebagai Teks</div></div></button>
      <button class="settings-tile" id="shareImage"><div class="icon-box">🖼️</div><div class="settings-body"><div class="settings-title">Bagikan sebagai Gambar</div></div></button>
      <button class="settings-tile" id="doPrint"><div class="icon-box">🖨️</div><div class="settings-body"><div class="settings-title">Cetak</div></div></button>
    `;
    body.querySelector('#shareText').onclick = () => close('text');
    body.querySelector('#shareImage').onclick = () => close('image');
    body.querySelector('#doPrint').onclick = () => close('print');
  });

  if (result === 'print') { printReceipt(); return; }
  if (result === 'text') {
    const receiptData = {
      storeName: settings.storeName, invoiceNumber: sale.invoiceNumber, dateLabel: dateShort(sale.saleDate),
      customerName: sale.customerName, lines: items.map((i) => ({ name: i.productName, qty: i.qty, unit: i.unit, subtotal: i.subtotal })),
      total: sale.total, paid: paidAmount, remaining, footerNote: settings.footerNote,
    };
    try {
      const status = await shareAsText(receiptData);
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
