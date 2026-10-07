// pages/settings.js

import { getSettings, saveSettings } from '../services/settingsService.js';
import { createBackupBlob, downloadBackup, restoreFromFile, getBackupSummary } from '../services/backupService.js';
import { importLegacyFile } from '../services/legacyImportService.js';
import { escapeHtml } from '../format.js';
import { confirmDialog, alertDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { navigate, setPageTitle, setTopbarActions, checkForUpdate } from '../app.js';
import { APP_VERSION } from '../version.js';
import { receiptLogo, logoWidth } from '../services/receiptLogo.js';
import { bindThemeSwitch } from '../theme.js';
import * as db from '../db.js';
import { getAuditLogs, recordAudit } from '../services/auditLogService.js';

export async function render(root, params) {
  const sub = params[0];
  if (sub === 'store') return renderStore(root);
  if (sub === 'invoice') return renderInvoice(root);
  if (sub === 'printer') return renderPrinter(root);
  if (sub === 'qris') return renderQris(root);
  if (sub === 'backup') return renderBackup(root);
  if (sub === 'autobackup') return renderAutoBackup(root);
  if (sub === 'trash') return renderTrash(root);
  if (sub === 'audit') return renderAudit(root);
  return renderHub(root);
}

function tile(icon, title, sub, route) {
  return `
    <button class="settings-tile" data-route="${route}">
      <div class="icon-box">${icon}</div>
      <div class="settings-body"><div class="settings-title">${title}</div><div class="settings-sub">${sub}</div></div>
      <span class="settings-muted">›</span>
    </button>`;
}

function renderHub(root) {
  setPageTitle('Kelola Usaha');
  setTopbarActions([]);
  root.innerHTML = `
    <div class="settings-hub">
      ${tile('👥', 'Pelanggan', 'Daftar pelanggan & riwayat nota', 'customers')}
      ${tile('📊', 'Laporan', 'Penjualan, pembayaran & ringkasan usaha', 'reports')}
      <div class="settings-spacer"></div>
      ${tile('🏪', 'Info Toko', 'Nama, alamat, telepon toko', 'settings/store')}
      ${tile('🧾', 'Nomor Nota', 'Prefix, digit, mode reset nomor', 'settings/invoice')}
      ${tile('🖨️', 'Printer', 'Ukuran kertas & printer Bluetooth', 'settings/printer')}
      ${tile('🔳', 'QRIS', 'Tampilkan kode QRIS di struk belum lunas', 'settings/qris')}
      <div class="settings-spacer"></div>
      ${tile('☁️', 'Backup / Restore', 'Cadangkan data & impor database lama', 'settings/backup')}
      ${tile('🗑️', 'Tempat Sampah', 'Pulihkan nota yang terhapus', 'settings/trash')}
      ${tile('🧾', 'Riwayat Aktivitas', 'Lihat perubahan penting pada data', 'settings/audit')}
    </div>
    <div class="settings-theme">
      <div class="settings-theme-title">Tampilan</div>
      <div class="settings-theme-sub">Maroon (tema terang marun), Neo (tema gelap futuristik), Glass (kaca biru), atau Clay (pastel 3D).</div>
      <div class="theme-switch" role="group" aria-label="Pilih tema tampilan">
        <button type="button" data-theme-choice="light">🟥 Maroon</button>
        <button type="button" data-theme-choice="dark">🌌 Neo</button>
        <button type="button" data-theme-choice="glass">💎 Glass</button>
        <button type="button" data-theme-choice="clay">🧸 Clay</button>
      </div>
    </div>
    <div class="settings-version">NotaKu Web v${APP_VERSION}</div>
    <div class="settings-update-action">
      <button class="btn small secondary" id="btnCheckUpdate">Cek Pembaruan</button>
    </div>
  `;
  root.querySelector('#btnCheckUpdate').onclick = () => checkForUpdate(false);
  bindThemeSwitch(root);
  root.querySelectorAll('[data-route]').forEach((el) => {
    el.onclick = () => navigate(el.dataset.route);
  });
}

async function renderTrash(root) {
  setPageTitle('Tempat Sampah'); setTopbarActions([]);
  const deleted = (await db.getAll('sales')).filter((sale) => sale.isDeleted);
  root.innerHTML = `<div class="settings-simple-page settings-trash-page"><div class="settings-page-intro"><h2>Tempat Sampah</h2><p>Nota yang dihapus masih dapat dipulihkan.</p></div>
    <div class="settings-trash-list">${deleted.length ? deleted.map((sale) => `<article class="settings-trash-card" data-trash-id="${sale.id}"><div class="settings-trash-card-main"><span class="settings-trash-icon">🗑️</span><div><b>${escapeHtml(sale.invoiceNumber)}</b><span>${escapeHtml(sale.customerName)}</span><small>${escapeHtml(sale.saleDate)}${sale.saleTime ? ` · ${escapeHtml(sale.saleTime)}` : ''}</small></div></div><button class="settings-restore-button" data-restore="${sale.id}">Pulihkan</button></article>`).join('') : '<div class="settings-empty-card"><span>🗑️</span><b>Tempat sampah kosong</b><small>Nota yang dihapus akan muncul di sini.</small></div>'}</div></div>`;
  root.querySelectorAll('[data-restore]').forEach((button) => button.onclick = async () => {
    const sale = await db.get('sales', button.dataset.restore); if (!sale) return;
    sale.isDeleted = 0; sale.updatedAt = new Date().toISOString(); await db.put('sales', sale);
    await recordAudit('restore', 'sale', sale.id, `Nota ${sale.invoiceNumber} dipulihkan`); toast('Nota dipulihkan'); await renderTrash(root);
  });
}

async function renderAudit(root) {
  setPageTitle('Riwayat Aktivitas'); setTopbarActions([]);
  const logs = await getAuditLogs();
  root.innerHTML = `<div class="settings-simple-page settings-audit-page"><div class="settings-page-intro"><h2>Riwayat Aktivitas</h2><p>Perubahan penting pada data NotaKu.</p></div><div class="settings-audit-list">${logs.length ? logs.map((log) => `<article class="settings-audit-item"><span class="settings-audit-dot" data-action="${escapeHtml(log.action)}"></span><div><b>${escapeHtml(log.details || log.action)}</b><small>${escapeHtml(log.entityType)} · ${new Date(log.createdAt).toLocaleString('id-ID')}</small></div></article>`).join('') : '<div class="settings-empty-card"><span>✓</span><b>Belum ada aktivitas</b><small>Perubahan data akan tercatat di sini.</small></div>'}</div></div>`;
}

async function renderStore(root) {
  setPageTitle('Info Toko');
  setTopbarActions([]);
  const s = await getSettings();
  root.innerHTML = `
    <div class="field settings-store-logo">
      <label for="fLogo">Logo Toko (opsional)</label>
      <div class="settings-logo-preview"><img id="storeLogoPreview" class="receipt-logo logo-width-${logoWidth(s)}" src="${escapeHtml(receiptLogo(s))}" alt="Preview logo toko"></div>
      <div class="settings-logo-control">
        <label for="logoMaxWidth">Lebar Maksimum Logo <output id="logoWidthValue">${logoWidth(s)}%</output></label>
        <input id="logoMaxWidth" type="range" min="10" max="100" step="1" value="${logoWidth(s)}">
        <div class="settings-logo-limits" aria-hidden="true"><span>10%</span><span>100%</span></div>
      </div>
      <input id="fLogo" type="file" accept="image/*">
      <div class="row-meta">Jika kosong, NotaKu memakai logo bawaan. Ukuran berlaku sama pada nota dan Bluetooth.</div>
      <button class="settings-logo-remove btn small ghost ${s.storeLogoData ? '' : 'hidden'}" id="removeLogo">Hapus Logo</button>
    </div>
    <div class="field"><label>Nama Toko</label><input id="fName" value="${escapeHtml(s.storeName)}"></div>
    <div class="field"><label>Alamat</label><textarea id="fAddress" rows="2">${escapeHtml(s.storeAddress)}</textarea></div>
    <div class="field"><label>Telepon</label><input id="fPhone" value="${escapeHtml(s.storePhone)}"></div>
    <div class="field"><label>Catatan Kaki Struk</label><textarea id="fFooter" rows="3">${escapeHtml(s.footerNote)}</textarea><div class="row-meta"></div></div>
    <div class="section-title">Privasi Data Pelanggan</div>
    <label class="settings-privacy">
      <div>
        <div class="settings-label">Tampilan nomor HP pelanggan di struk</div>
        <div class="row-meta">Pilih tampil penuh, 3 digit terakhir, atau sembunyikan.</div>
      </div>
      <select class="settings-phone-select" id="phoneDisplay"><option value="FULL" ${(s.customerPhoneDisplay === 'FULL' || (!s.customerPhoneDisplay && !s.maskCustomerPhone)) ? 'selected' : ''}>Full</option><option value="LAST3" ${(s.customerPhoneDisplay === 'LAST3' || (!s.customerPhoneDisplay && s.maskCustomerPhone)) ? 'selected' : ''}>3 digit</option><option value="HIDDEN" ${s.customerPhoneDisplay === 'HIDDEN' ? 'selected' : ''}>Hidden</option></select>
    </label>
    <button class="btn" id="fSave">Simpan</button>
  `;
  root.querySelector('#phoneDisplay').onchange = async (e) => {
    await saveSettings({ customerPhoneDisplay: e.target.value, maskCustomerPhone: e.target.value !== 'FULL' });
    toast('Pengaturan privasi disimpan');
  };
  root.querySelector('#fSave').onclick = async () => {
    await saveSettings({
      storeName: root.querySelector('#fName').value.trim(),
      storeAddress: root.querySelector('#fAddress').value.trim(),
      storePhone: root.querySelector('#fPhone').value.trim(),
      footerNote: root.querySelector('#fFooter').value.trim(),
    });
    toast('Pengaturan toko disimpan');
  };
  root.querySelector('#fLogo').onchange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    if (!file.type.startsWith('image/')) { toast('Pilih file gambar.'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const image = new Image();
      image.src = reader.result;
      try { await image.decode(); } catch { toast('File gambar tidak dapat dibaca.'); return; }
      await saveSettings({ storeLogoData: reader.result });
      root.querySelector('#storeLogoPreview').src = reader.result;
      root.querySelector('#removeLogo').classList.remove('hidden');
      toast('Logo toko disimpan');
    };
    reader.onerror = () => toast('Gagal membaca gambar.');
    reader.readAsDataURL(file);
  };
  const logoSlider = root.querySelector('#logoMaxWidth');
  logoSlider.oninput = () => {
    root.querySelector('#logoWidthValue').value = `${logoSlider.value}%`;
    root.querySelector('#storeLogoPreview').className = `receipt-logo logo-width-${logoSlider.value}`;
  };
  logoSlider.onchange = async () => { await saveSettings({ storeLogoMaxWidth: Number(logoSlider.value) }); toast('Ukuran logo disimpan'); };
  const removeLogo = root.querySelector('#removeLogo');
  removeLogo.onclick = async () => {
    await saveSettings({ storeLogoData: '' });
    root.querySelector('#storeLogoPreview').src = receiptLogo({});
    root.querySelector('#fLogo').value = '';
    removeLogo.classList.add('hidden');
    toast('Logo bawaan digunakan');
  };
}

async function renderInvoice(root) {
  setPageTitle('Nomor Nota');
  setTopbarActions([]);
  const s = await getSettings();
  root.innerHTML = `
    <div class="field"><label>Awalan (Prefix)</label><input id="fPrefix" value="${escapeHtml(s.invoicePrefix)}"></div>

    <div class="section-title">Format Nomor</div>
    <label class="field-radio"><input type="radio" name="numformat" value="DAILY_SEQUENCE" ${s.invoiceNumberFormat === 'DAILY_SEQUENCE' ? 'checked' : ''}><div><div class="radio-title">Tahun Bulan + Urutan</div><div class="radio-sub">Format: Prefix + TahunBulan + nomor urut dua digit, reset setiap bulan. Contoh: INV-260901.</div></div></label>
    <label class="field-radio"><input type="radio" name="numformat" value="SEQUENTIAL" ${s.invoiceNumberFormat === 'SEQUENTIAL' ? 'checked' : ''}><div><div class="radio-title">Nomor Urut Saja</div><div class="radio-sub">Prefix + angka urut tanpa tanggal, dengan mode reset sendiri.</div></div></label>

    <div id="sequentialFields" class="${s.invoiceNumberFormat === 'SEQUENTIAL' ? '' : 'hidden'}">
      <div class="field"><label>Jumlah Digit</label><input id="fDigit" type="number" value="${s.invoiceDigitCount}"></div>
      <div class="field"><label>Nomor Berikutnya</label><input id="fNext" type="number" value="${s.invoiceNextNumber}"></div>
      <div class="section-title">Mode Reset</div>
      <label class="field-radio"><input type="radio" name="reset" value="NEVER" ${s.invoiceResetMode === 'NEVER' ? 'checked' : ''}><div><div class="radio-title">Tidak Pernah</div><div class="radio-sub">Nomor terus naik, tidak pernah kembali ke awal</div></div></label>
      <label class="field-radio"><input type="radio" name="reset" value="DAILY" ${s.invoiceResetMode === 'DAILY' ? 'checked' : ''}><div><div class="radio-title">Harian</div><div class="radio-sub">Nomor kembali ke 1 setiap hari baru</div></div></label>
      <label class="field-radio"><input type="radio" name="reset" value="MONTHLY" ${s.invoiceResetMode === 'MONTHLY' ? 'checked' : ''}><div><div class="radio-title">Bulanan</div><div class="radio-sub">Nomor kembali ke 1 setiap bulan baru</div></div></label>
    </div>
    <div id="dailySeqFields" class="${s.invoiceNumberFormat === 'DAILY_SEQUENCE' ? '' : 'hidden'}">
      <div class="field"><label>Jumlah Digit Urutan Bulanan</label><input id="fDigitDaily" type="number" min="2" value="${s.invoiceDigitCount}"></div>
    </div>

    <div class="settings-invoice-example info-card"><div class="info-text" id="preview"></div></div>
    <button class="btn" id="fSave">Simpan</button>
  `;

  function currentFormat() {
    return root.querySelector('input[name="numformat"]:checked').value;
  }

  function updatePreview() {
    const prefix = root.querySelector('#fPrefix').value;
    const now = new Date();
    if (currentFormat() === 'DAILY_SEQUENCE') {
      const yy = String(now.getFullYear()).slice(-2);
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const digit = Number(root.querySelector('#fDigitDaily').value) || 2;
      root.querySelector('#preview').textContent = `Contoh bulan ini: nota ke-1 -> ${prefix}${yy}${mm}${'1'.padStart(digit, '0')}, nota ke-2 -> ${prefix}${yy}${mm}${'2'.padStart(digit, '0')}`;
    } else {
      const digit = Number(root.querySelector('#fDigit').value) || 5;
      const next = Number(root.querySelector('#fNext').value) || 1;
      root.querySelector('#preview').textContent = `Contoh nomor: ${prefix}${String(next).padStart(digit, '0')}`;
    }
  }

  root.querySelectorAll('input[name="numformat"]').forEach((r) => {
    r.addEventListener('change', () => {
      root.querySelector('#sequentialFields').classList.toggle('hidden', r.value !== 'SEQUENTIAL');
      root.querySelector('#dailySeqFields').classList.toggle('hidden', r.value !== 'DAILY_SEQUENCE');
      updatePreview();
    });
  });
  root.querySelectorAll('input').forEach((i) => i.addEventListener('input', updatePreview));
  updatePreview();

  root.querySelector('#fSave').onclick = async () => {
    const format = currentFormat();
    const patch = { invoicePrefix: root.querySelector('#fPrefix').value.trim(), invoiceNumberFormat: format };
    if (format === 'SEQUENTIAL') {
      patch.invoiceDigitCount = Number(root.querySelector('#fDigit').value) || 5;
      patch.invoiceNextNumber = Number(root.querySelector('#fNext').value) || 1;
      patch.invoiceResetMode = root.querySelector('input[name="reset"]:checked').value;
    } else {
      patch.invoiceDigitCount = Number(root.querySelector('#fDigitDaily').value) || 2;
    }
    await saveSettings(patch);
    toast('Pengaturan nomor nota disimpan');
  };
}

async function renderPrinter(root) {
  setPageTitle('Printer');
  setTopbarActions([]);
  const s = await getSettings();
  const bt = await import('../services/printing/bluetoothPrinter.js');
  const btOk = bt.isConnected();
  const btInfo = bt.currentDeviceInfo();

  root.innerHTML = `
    <div class="section-title">Printer Bluetooth (Cetak Langsung)</div>
    <div class="settings-printer-section">
      <div class="settings-printer-info info-card">
        <div class="info-title">Catatan penting</div>
        <div class="info-text">Cetak Bluetooth langsung hanya untuk printer BLE (Bluetooth Low Energy) dan hanya jalan di Chrome/Edge Android — tidak di iPhone. Kalau printer kamu tidak muncul saat "Cari Printer", kemungkinan itu printer Bluetooth klasik yang memang tidak bisa diakses browser — pakai "Simpan PDF" sebagai gantinya.</div>
      </div>
      <div class="settings-printer-status">
        <div>
          <div class="settings-printer-status-label">${btOk ? 'Tersambung' : (s.btPrinterId ? 'Tersimpan (belum tersambung)' : 'Belum ada printer')}</div>
          <div class="row-meta">${btOk ? escapeHtml(btInfo.name) : (s.btPrinterName ? escapeHtml(s.btPrinterName) : '—')}</div>
        </div>
        <button class="settings-button btn small secondary" id="btnBtConnect">${btOk ? 'Sambung Ulang' : 'Cari Printer'}</button>
      </div>
      ${s.btPrinterId ? `<button class="settings-printer-forget btn small ghost" id="btnBtForget">Lupakan Printer Ini</button>` : ''}
    </div>

    <div class="section-title">Lebar Kertas Bluetooth</div>
    <label class="field-radio"><input type="radio" name="charwidth" value="32" ${s.btCharWidth === 32 ? 'checked' : ''}><div><div class="radio-title">58mm (32 karakter/baris)</div></div></label>
    <label class="field-radio"><input type="radio" name="charwidth" value="48" ${s.btCharWidth === 48 ? 'checked' : ''}><div><div class="radio-title">80mm (48 karakter/baris)</div></div></label>

    <div class="section-title">Ukuran Kertas PDF</div>
    <label class="field-radio"><input type="radio" name="paper" value="THERMAL_58MM" ${s.paperSize === 'THERMAL_58MM' ? 'checked' : ''}><div><div class="radio-title">Thermal 58mm</div><div class="radio-sub">Printer struk kecil (kasir portabel)</div></div></label>
    <label class="field-radio"><input type="radio" name="paper" value="THERMAL_80MM" ${s.paperSize === 'THERMAL_80MM' ? 'checked' : ''}><div><div class="radio-title">Thermal 80mm</div><div class="radio-sub">Printer struk standar toko</div></div></label>
    <label class="field-radio"><input type="radio" name="paper" value="PDF_A4" ${s.paperSize === 'PDF_A4' ? 'checked' : ''}><div><div class="radio-title">A4 (dokumen biasa)</div><div class="radio-sub">Untuk dicetak di printer biasa</div></div></label>
    <label class="settings-preview-toggle">
      <div><div class="settings-label">Preview sebelum cetak Bluetooth</div><div class="row-meta">Tampilkan gambar yang akan dikirim ke printer Bluetooth.</div></div>
      <input class="settings-preview-checkbox" id="printPreviewToggle" type="checkbox" ${s.printPreview ? 'checked' : ''}>
    </label>
    <div class="info-card">
      <div class="info-text">"Simpan PDF" membuat file nota yang dapat diunduh atau dibagikan. Ukuran kertas PDF terpisah dari lebar printer Bluetooth.</div>
    </div>
  `;

  root.querySelectorAll('input[name="paper"]').forEach((r) => {
    r.onchange = async () => { await saveSettings({ paperSize: r.value }); toast('Ukuran kertas disimpan'); };
  });
  root.querySelectorAll('input[name="charwidth"]').forEach((r) => {
    r.onchange = async () => { await saveSettings({ btCharWidth: Number(r.value) }); toast('Lebar kertas Bluetooth disimpan'); };
  });
  root.querySelector('#printPreviewToggle').onchange = async (e) => {
    await saveSettings({ printPreview: e.target.checked });
    toast(e.target.checked ? 'Preview Bluetooth diaktifkan' : 'Preview Bluetooth dinonaktifkan');
  };

  root.querySelector('#btnBtConnect').onclick = async () => {
    try {
      const info = await bt.scanAndConnect();
      await saveSettings({ btPrinterId: info.id, btPrinterName: info.name });
      toast(`Tersambung ke ${info.name}`);
      await renderPrinter(root);
    } catch (e) {
      toast(e.message || 'Gagal menyambungkan printer.');
    }
  };
  const forgetBtn = root.querySelector('#btnBtForget');
  if (forgetBtn) {
    forgetBtn.onclick = async () => {
      bt.disconnect();
      await saveSettings({ btPrinterId: '', btPrinterName: '' });
      toast('Printer dilupakan');
      await renderPrinter(root);
    };
  }
}

async function renderQris(root) {
  setPageTitle('QRIS');
  setTopbarActions([]);
  const s = await getSettings();
  root.innerHTML = `
    <div class="settings-section">
      <label class="settings-toggle-row">
        <div>
          <div class="settings-section-label">Tampilkan QRIS di Struk</div>
          <div class="row-meta">Muncul otomatis kalau nota BELUM LUNAS, hilang kalau sudah lunas.</div>
        </div>
        <input class="settings-checkbox" type="checkbox" id="qrisToggle" ${s.qrisEnabled ? 'checked' : ''}>
      </label>
    </div>
    <div class="settings-content">
      <div class="settings-image-label">Gambar QRIS</div>
      ${s.qrisImageData ? `<img class="settings-qris-image" src="${s.qrisImageData}">` : `<div class="settings-qris-empty info-card"><div class="info-text">Belum ada gambar QRIS. Upload dari galeri HP kamu (foto/screenshot kode QRIS statis milik tokomu, bisa didapat dari aplikasi bank/e-wallet).</div></div>`}
      <input class="settings-file-input" type="file" id="qrisFile" accept="image/*">
      <button class="btn secondary small" id="btnUploadQris">${s.qrisImageData ? 'Ganti Gambar' : 'Upload Gambar QRIS'}</button>
      ${s.qrisImageData ? `<button class="settings-remove-image btn danger small" id="btnRemoveQris">Hapus</button>` : ''}
    </div>
  `;
  root.querySelector('#qrisToggle').onchange = async (e) => {
    await saveSettings({ qrisEnabled: e.target.checked });
    toast(e.target.checked ? 'QRIS diaktifkan' : 'QRIS dimatikan');
  };
  root.querySelector('#btnUploadQris').onclick = () => root.querySelector('#qrisFile').click();
  root.querySelector('#qrisFile').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast('Ukuran gambar maksimal 2MB'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      await saveSettings({ qrisImageData: reader.result });
      toast('Gambar QRIS disimpan');
      await renderQris(root);
    };
    reader.readAsDataURL(file);
  };
  const removeBtn = root.querySelector('#btnRemoveQris');
  if (removeBtn) {
    removeBtn.onclick = async () => {
      await saveSettings({ qrisImageData: '' });
      toast('Gambar QRIS dihapus');
      await renderQris(root);
    };
  }
}

async function renderBackup(root) {
  setPageTitle('Backup / Restore');
  setTopbarActions([]);
  const backupSummary = await getBackupSummary();
  const backupSettings = (await getSettings()).autoBackup;
  root.innerHTML = `
    <div class="settings-section backup-section backup-section--download">
      <div class="settings-heading settings-heading-with-info"><span>Cadangkan Data</span><button type="button" class="backup-info-toggle" aria-expanded="false" aria-label="Info cadangkan data">ⓘ</button></div>
      <div class="settings-description backup-info-text" hidden>Unduh file cadangan seluruh data NotaKu (nota, produk, pelanggan, pengaturan), lalu simpan ke Google Drive atau tempat lain lewat aplikasi file HP kamu.</div>
      <button class="settings-button btn" id="btnBackup">Unduh Cadangan</button>
      <div class="backup-data-summary"><div><small>Data tercatat</small><b>${backupSummary.totalRecords} baris</b></div><div><small>Backup terakhir</small><b>${backupSettings.lastBackupAt ? new Date(backupSettings.lastBackupAt).toLocaleString('id-ID') : 'Belum pernah'}</b></div><div><small>Ukuran terakhir</small><b>${backupSettings.backupSizeBytes ? `${(backupSettings.backupSizeBytes / 1024).toFixed(1)} KB` : 'Belum ada'}</b></div><div><small>Status</small><b>${backupSettings.lastBackupError ? 'Gagal / tertunda' : backupSettings.lastBackupAt ? 'Berhasil' : 'Belum ada backup'}</b></div></div>
    </div>
    <div class="settings-section-bottom backup-section backup-section--auto">
      ${tile('⏱️', 'Atur Backup Otomatis', 'Jadwalkan backup ke Google Drive', 'settings/autobackup')}
    </div>
    <div class="settings-section-bottom backup-section backup-section--restore">
      <div class="settings-heading settings-heading-with-info"><span>Pulihkan dari Cadangan NotaKu</span><button type="button" class="backup-info-toggle" aria-expanded="false" aria-label="Info pulihkan cadangan">ⓘ</button></div>
      <div class="settings-description backup-info-text" hidden>Pilih file cadangan .json yang pernah dibuat NotaKu. <b>PERHATIAN:</b> ini akan MENGGANTI seluruh data yang ada saat ini.</div>
      <button class="settings-button btn secondary" id="btnRestore">Pilih File &amp; Pulihkan</button>
      <input class="settings-file-input" type="file" id="fileRestore" accept="application/json,.json">
    </div>
    <div class="settings-section-bottom backup-section backup-section--import">
      <div class="settings-heading settings-heading-with-info"><span>Impor Database Aplikasi Lama</span><button type="button" class="backup-info-toggle" aria-expanded="false" aria-label="Info impor database">ⓘ</button></div>
      <div class="settings-printer-info info-card backup-info-text" hidden>
        <div class="info-title">Pindah dari aplikasi nota lain?</div>
        <div class="info-text">Kalau kamu punya file .db dari aplikasi nota sebelumnya (di HP atau Google Drive), NotaKu bisa membaca dan MENAMBAHKAN riwayat nota, produk, dan pelanggan dari file itu — data yang sudah ada di NotaKu tetap aman.</div>
      </div>
      <button class="settings-button btn secondary" id="btnImport">Pilih File &amp; Impor</button>
      <input class="settings-file-input" type="file" id="fileImport" accept=".db,application/octet-stream">
      <div class="settings-help backup-info-text" hidden>Tips: kalau file tersimpan di Google Drive, pilih "Files"/"Berkas" pada layar pemilih file lalu masuk ke akun Drive-mu — file akan diunduh sementara secara otomatis oleh browser untuk dibaca.</div>
    </div>
  `;

  root.querySelectorAll('[data-route]').forEach((el) => { el.onclick = () => navigate(el.dataset.route); });
  root.querySelectorAll('.backup-info-toggle').forEach((button) => {
    button.onclick = () => {
      const info = button.closest('.settings-section, .settings-section-bottom').querySelector('.backup-info-text');
      const visible = info.hasAttribute('hidden');
      info.toggleAttribute('hidden', !visible);
      button.setAttribute('aria-expanded', String(visible));
    };
  });

  root.querySelector('#btnBackup').onclick = async () => {
    try {
      const blob = await createBackupBlob();
      downloadBackup(blob);
      const latest = await getSettings();
      await saveSettings({ autoBackup: { ...latest.autoBackup, backupSizeBytes: blob.size, lastBackupError: '' } });
      toast('Cadangan diunduh');
    } catch (e) { toast('Gagal membuat cadangan.'); }
  };

  root.querySelector('#btnRestore').onclick = () => root.querySelector('#fileRestore').click();
  root.querySelector('#fileRestore').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const confirmed = await confirmDialog({
      title: 'Timpa Semua Data?',
      message: `Seluruh nota, produk, dan pelanggan yang ada SAAT INI akan diganti dengan isi file "${file.name}". Tindakan ini tidak bisa dibatalkan. Lanjutkan?`,
      confirmLabel: 'Ya, Timpa Data', dangerous: true,
    });
    e.target.value = '';
    if (!confirmed) return;
    try {
      await restoreFromFile(file);
      await alertDialog({ title: 'Berhasil', message: 'Data berhasil dipulihkan dari cadangan.' });
      navigate('home');
    } catch (err) { toast(err.message || 'Gagal memulihkan data.'); }
  };

  root.querySelector('#btnImport').onclick = () => root.querySelector('#fileImport').click();
  root.querySelector('#fileImport').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const confirmed = await confirmDialog({
      title: 'Impor Database Lama?',
      message: `NotaKu akan membaca file "${file.name}" dan MENAMBAHKAN seluruh nota, produk, dan pelanggan di dalamnya ke data yang sudah ada (data lama tidak dihapus). Proses ini bisa memakan waktu beberapa detik. Lanjutkan?`,
      confirmLabel: 'Ya, Impor',
    });
    e.target.value = '';
    if (!confirmed) return;
    document.getElementById('loadingOverlay').classList.remove('hidden');
    try {
      const result = await importLegacyFile(file);
      document.getElementById('loadingOverlay').classList.add('hidden');
      await alertDialog({
        title: 'Impor Berhasil',
        message: `Berhasil mengimpor:\n• ${result.productsImported} produk\n• ${result.customersImported} pelanggan\n• ${result.salesImported} nota\n• ${result.paymentsImported} riwayat pembayaran${result.storeInfoImported ? '\n\nInfo toko dari file lama juga ikut diperbarui.' : ''}`,
      });
      navigate('home');
    } catch (err) {
      document.getElementById('loadingOverlay').classList.add('hidden');
      toast(err.message || 'Gagal mengimpor database lama.');
    }
  };
}

let removeSyncStatusListener = null;

async function renderAutoBackup(root) {
  removeSyncStatusListener?.();
  setPageTitle('Atur Backup Otomatis');
  const drive = await import('../services/driveBackupService.js');
  try { await drive.restoreGoogleAccess(); } catch { /* Status panel displays connection errors. */ }
  const s = await getSettings();
  const cfg = s.autoBackup;
  const configured = drive.isConfigured();
  const loginMessage = drive.consumeGoogleLoginMessage();
  if (loginMessage) toast(loginMessage);

  setTopbarActions(configured ? [{ icon: 'save', title: 'Simpan', onClick: () => saveAutoBackupForm(root) }] : []);

  if (!configured) {
    root.innerHTML = `
      <div class="settings-setup-info info-card">
        <div class="info-title">Perlu setup sekali sebelum dipakai</div>
        <div class="info-text">Fitur ini butuh Google Client ID yang didaftarkan sendiri di Google Cloud Console (gratis). Ikuti langkah di <b>docs/DRIVE_SETUP.md</b> pada project NotaKu, lalu isi <code>js/config.js</code>.</div>
      </div>`;
    return;
  }

  const timeOptions = (value) => Array.from({ length: 48 }, (_, index) => {
    const hour = String(Math.floor(index / 2)).padStart(2, '0');
    const minute = String((index % 2) * 30).padStart(2, '0');
    const time = `${hour}:${minute}`;
    return `<button type="button" class="settings-time-option${time === value ? ' selected' : ''}" data-time-value="${time}">${time}</button>`;
  }).join('');
  const timePicker = (id, value, label) => `<div class="settings-time-picker">
    <input id="${id}" type="hidden" value="${escapeHtml(value)}" required>
    <button type="button" class="settings-time-trigger" data-time-toggle="${id}" aria-label="${label}" aria-expanded="false">${escapeHtml(value)}⌄</button>
    <div class="settings-time-menu" data-time-menu="${id}">${timeOptions(value)}</div>
  </div>`;

  root.innerHTML = `
    <div class="settings-section">
      <label class="settings-backup-toggle">
        <div class="settings-section-label">Backup otomatis</div>
        <input class="settings-checkbox" type="checkbox" id="enableToggle" ${cfg.enabled ? 'checked' : ''}>
      </label>

      <div class="settings-backup-options">
        <div class="settings-backup-options-title settings-heading-with-info"><span>Jadwal &amp; penyimpanan</span><button type="button" class="backup-info-toggle" data-autobackup-info="schedule" aria-expanded="false" aria-label="Info jadwal dan penyimpanan">ⓘ</button></div>
        <div class="backup-info-text autobackup-info-text" data-autobackup-info-panel="schedule" hidden>Backup otomatis berjalan selama aplikasi terbuka dan koneksi internet tersedia. Jumlah file menentukan berapa cadangan terbaru yang dipertahankan.</div>
        <div class="settings-backup-option-row settings-backup-window">
          <div><span class="settings-schedule-label">Jam aktif</span><small>Waktu backup berjalan</small></div>
          <div class="settings-backup-window-times">
            ${timePicker('backupWindowStart', cfg.backupWindowStart || '07:00', 'Mulai backup otomatis')}
            <span>–</span>
            ${timePicker('backupWindowEnd', cfg.backupWindowEnd || '19:00', 'Selesai backup otomatis')}
          </div>
        </div>
        <label class="settings-backup-option-row" for="backupDailyLimit"><span><b>Maksimal backup</b><small>Batas backup otomatis per hari</small></span>
          <select id="backupDailyLimit"><option value="1" ${cfg.backupDailyLimit === 1 ? 'selected' : ''}>1 kali sehari</option><option value="2" ${cfg.backupDailyLimit !== 1 ? 'selected' : ''}>2 kali sehari</option></select>
        </label>
        <div class="settings-backup-option-row settings-retention">
          <label for="backupKeepCount"><b>Simpan backup terbaru</b><small>File backup yang dipertahankan</small></label>
          <div class="settings-retention-value"><input id="backupKeepCount" type="number" min="1" step="1" required value="${Number(cfg.backupKeepCount) || 15}" aria-describedby="backupRetentionHelp"><span>file</span></div>
        </div>
      </div>

      ${cfg.lastBackupError ? `<div class="settings-backup-info info-card"><div class="info-text">Backup tertunda: ${escapeHtml(cfg.lastBackupError)}</div></div>` : ''}

      ${cfg.lastBackupAt ? `<div class="settings-last-backup">Backup terakhir: ${new Date(cfg.lastBackupAt).toLocaleString('id-ID')}</div>` : ''}

      <button class="btn" id="btnBackupNow">Backup Sekarang</button>

      <div class="settings-sync-panel">
        <div class="settings-sync-header">
          <div>
            <div class="settings-sync-heading section-title settings-heading-with-info"><span>Google Drive</span><button type="button" class="backup-info-toggle" data-autobackup-info="drive" aria-expanded="false" aria-label="Info Google Drive">ⓘ</button></div>
            <div class="settings-drive-label">Akun dan sinkronisasi</div>
          </div>
          <button class="settings-button btn small secondary" id="btnDriveConnect">${cfg.driveConnected ? 'Putuskan' : 'Hubungkan'}</button>
        </div>
        <div class="backup-info-text autobackup-info-text" data-autobackup-info-panel="drive" hidden>Gunakan akun Google yang sama di semua perangkat. Akun ini dipakai untuk backup dan sinkronisasi selama akses Google masih aktif.</div>
        <div class="settings-sync-account" id="syncAccountStatus" role="status" aria-live="polite" aria-atomic="true">
          ${cfg.driveConnected
            ? `<span class="settings-drive-status-dot" aria-hidden="true"></span><span><b>${cfg.lastSyncAt ? 'Tersinkron' : 'Terhubung'}</b> · ${escapeHtml(cfg.driveAccountEmail || 'akun Google')}</span>`
            : '<span class="row-meta">Akun Google belum terhubung</span>'}
          ${cfg.lastSyncAt ? `<small>Terakhir sinkron: ${formatSyncDate(cfg.lastSyncAt)}</small>` : '<small>Belum pernah sinkron</small>'}
        </div>
        <button class="settings-sync-now btn" id="btnSyncNow" ${cfg.driveConnected ? '' : 'disabled'}>Sinkron sekarang</button>
        <label class="settings-sync-interval"><span>Interval sinkron</span>
          <select id="autoSyncInterval">
            ${[1, 5, 10, 15, 30].map((minutes) => `<option value="${minutes}" ${(cfg.autoSyncIntervalMinutes || 5) === minutes ? 'selected' : ''}>Tiap ${minutes} menit</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="settings-sync-status" id="syncStatus">Memeriksa status...</div>
      <details class="settings-backup-details">
        <summary>Sinkronisasi lanjutan</summary>
        <p class="settings-advanced-sync-help">Gunakan hanya jika perlu menentukan sumber data secara manual: <b>Push</b> menjadikan data perangkat ini sebagai data Google Drive, sedangkan <b>Tarik</b> mengganti data perangkat ini dengan data dari Google Drive.</p>
        <div class="settings-sync-actions">
        <button class="settings-sync-button btn secondary" id="btnPush">⬆ Push ke Google Drive</button>
        <button class="settings-sync-button btn secondary" id="btnPull">⬇ Tarik dari Google Drive</button>
        </div>
      </details>
      <span id="backupRetentionHelp" class="visually-hidden">Jumlah file menentukan berapa backup terbaru yang disimpan.</span>
    </div>
  `;

  root.querySelectorAll('[data-autobackup-info]').forEach((button) => {
    button.onclick = () => {
      const panel = root.querySelector(`[data-autobackup-info-panel="${button.dataset.autobackupInfo}"]`);
      const visible = panel.hasAttribute('hidden');
      panel.toggleAttribute('hidden', !visible);
      button.setAttribute('aria-expanded', String(visible));
    };
  });

  root.querySelectorAll('[data-time-toggle]').forEach((trigger) => {
    trigger.onclick = () => {
      const menu = root.querySelector(`[data-time-menu="${trigger.dataset.timeToggle}"]`);
      const open = menu.classList.toggle('open');
      trigger.setAttribute('aria-expanded', String(open));
      root.querySelectorAll('.settings-time-menu.open').forEach((other) => {
        if (other !== menu) other.classList.remove('open');
      });
    };
  });
  root.querySelectorAll('.settings-time-option').forEach((option) => {
    option.onclick = () => {
      const picker = option.closest('.settings-time-picker');
      const input = picker.querySelector('input[type="hidden"]');
      const trigger = picker.querySelector('.settings-time-trigger');
      input.value = option.dataset.timeValue;
      trigger.childNodes[0].textContent = option.dataset.timeValue;
      picker.querySelectorAll('.settings-time-option').forEach((item) => item.classList.toggle('selected', item === option));
      picker.querySelector('.settings-time-menu').classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    };
  });

  const accountPanel = root.querySelector('#syncAccountStatus');
  const onSyncStatus = (event) => {
    if (!accountPanel.isConnected || root.querySelector('#syncAccountStatus') !== accountPanel) {
      window.removeEventListener('notaku-sync-status', onSyncStatus);
      return;
    }
    renderSyncStatus(root, event.detail);
  };
  window.addEventListener('notaku-sync-status', onSyncStatus);
  removeSyncStatusListener = () => window.removeEventListener('notaku-sync-status', onSyncStatus);
  await refreshSyncStatus(root, drive);

  root.querySelector('#autoSyncInterval').onchange = async (event) => {
    const latest = await getSettings();
    await saveSettings({ autoBackup: { ...latest.autoBackup, autoSyncEnabled: true, autoSyncIntervalMinutes: Number(event.target.value) } });
    toast(`Sinkron otomatis diatur tiap ${event.target.value} menit`);
    void drive.checkAutomaticSync({ force: true });
  };

  root.querySelector('#btnSyncNow').onclick = async () => {
    if (!cfg.driveConnected) { toast('Hubungkan akun Google Drive dulu'); return; }
    const button = root.querySelector('#btnSyncNow');
    button.disabled = true;
    button.textContent = 'Menyinkronkan…';
    try {
      const access = await drive.getSyncDisplayState();
      if (access.needsAuthorization) {
        await drive.connectAccount({ renew: true });
        await drive.checkScheduleOnAppOpen();
      }
      await drive.checkAutomaticSync({ force: true });
      await refreshSyncStatus(root, drive);
      const latest = await getSettings();
      if (latest.autoBackup.lastSyncStatus) toast(latest.autoBackup.lastSyncStatus);
    } catch (error) {
      toast(error.message || 'Gagal memperbarui akses Google.');
    } finally {
      if (root.querySelector('#btnSyncNow')) {
        await refreshSyncStatus(root, drive);
      }
    }
  };

  root.querySelector('#enableToggle').onchange = () => saveAutoBackupForm(root);
  root.querySelector('#btnPush').onclick = async () => {
    if (!cfg.driveConnected) { toast('Hubungkan akun Google Drive dulu'); return; }
    const confirmed = await confirmDialog({
      title: 'Push ke Cloud?',
      message: 'Data di Drive akan DITIMPA dengan data perangkat ini. Perangkat lain yang belum sempat push perubahannya sendiri akan kehilangan perubahan itu kalau nanti mereka pull. Lanjutkan?',
      confirmLabel: 'Ya, Push',
    });
    if (!confirmed) return;
    document.getElementById('loadingOverlay').classList.remove('hidden');
    try {
      await drive.pushToCloud();
      toast('Berhasil push ke Drive');
      await refreshSyncStatus(root, drive);
    } catch (e) {
      await alertDialog({ title: 'Push Gagal', message: e.message || 'Terjadi kesalahan.' });
    } finally {
      document.getElementById('loadingOverlay').classList.add('hidden');
    }
  };

  root.querySelector('#btnPull').onclick = async () => {
    if (!cfg.driveConnected) { toast('Hubungkan akun Google Drive dulu'); return; }
    const confirmed = await confirmDialog({
      title: 'Tarik dari Cloud?',
      message: 'SELURUH data di perangkat ini (nota, produk, pelanggan) akan DIGANTI dengan data dari Drive. Perubahan yang belum di-push dari perangkat ini akan HILANG. Lanjutkan?',
      confirmLabel: 'Ya, Timpa & Tarik',
      dangerous: true,
    });
    if (!confirmed) return;
    document.getElementById('loadingOverlay').classList.remove('hidden');
    try {
      await drive.pullFromCloud();
      await alertDialog({ title: 'Berhasil', message: 'Data berhasil ditarik dari Drive.' });
      navigate('home');
    } catch (e) {
      await alertDialog({ title: 'Pull Gagal', message: e.message || 'Terjadi kesalahan.' });
    } finally {
      document.getElementById('loadingOverlay').classList.add('hidden');
    }
  };

  root.querySelector('#btnDriveConnect').onclick = async () => {
    if (cfg.driveConnected) {
      try {
        await drive.disconnectAccount();
        toast('Akun Google Drive diputuskan');
        await renderAutoBackup(root);
      } catch (error) { toast(error.message || 'Gagal memutuskan akun.'); }
      return;
    }
    try {
      const email = await drive.connectAccount();
      toast(`Tersambung sebagai ${email}`);
      await saveAutoBackupForm(root);
      await drive.checkAutomaticSync({ force: true });
      await renderAutoBackup(root);
    } catch (e) { toast(e.message || 'Gagal menghubungkan akun Google.'); }
  };

  for (const id of ['backupWindowStart', 'backupWindowEnd', 'backupDailyLimit', 'backupKeepCount']) {
    root.querySelector(`#${id}`).onchange = () => saveAutoBackupForm(root);
  }

  root.querySelector('#btnBackupNow').onclick = async () => {
    if (!cfg.driveConnected) { toast('Hubungkan akun Google Drive dulu'); return; }
    document.getElementById('loadingOverlay').classList.remove('hidden');
    try {
      await drive.runBackupNow();
      toast('Backup berhasil diunggah ke Drive');
      await renderAutoBackup(root);
    } catch (e) {
      await alertDialog({ title: 'Backup Gagal', message: (e.message || 'Terjadi kesalahan.') + '\n\nLihat docs/DRIVE_SETUP.md bagian Troubleshooting untuk arti pesan ini.' });
    } finally {
      document.getElementById('loadingOverlay').classList.add('hidden');
    }
  };
}

async function refreshSyncStatus(root, drive) {
  const panel = root.querySelector('#syncAccountStatus');
  const state = await drive.getSyncDisplayState();
  if (panel && root.querySelector('#syncAccountStatus') === panel) renderSyncStatus(root, state);
}

function renderSyncStatus(root, state) {
  const panel = root.querySelector('#syncAccountStatus');
  if (!panel) return;
  const accessLabel = root.querySelector('#driveAccessLabel');
  if (accessLabel) accessLabel.textContent = state.needsAuthorization ? 'Akun tersimpan · izin akses perlu diperbarui' : 'Terhubung · akses aktif';
  const phase = state.syncing ? 'syncing' : !state.driveConnected ? 'disconnected'
    : state.offline || state.needsAuthorization || state.lastSyncProblem ? 'pending' : state.lastSyncAt ? 'synced' : 'connected';
  const label = { syncing: 'Menyinkronkan…', disconnected: 'Belum terhubung', pending: 'Sinkron tertunda', synced: 'Tersinkron', connected: 'Terhubung' }[phase];
  const message = state.syncing ? 'Menyinkronkan…' : !state.driveConnected ? 'Hubungkan akun Google untuk sinkronisasi.'
    : state.offline ? 'Menunggu koneksi internet.' : state.needsAuthorization ? 'Akun tetap terhubung. Aktifkan kembali izin akses Google untuk melanjutkan sinkron dan backup.' : state.lastSyncStatus || 'Menunggu sinkronisasi pertama.';
  panel.dataset.state = phase;
  panel.innerHTML = `<span class="settings-drive-status-dot" aria-hidden="true"></span>
    <span><b>${label}</b>${state.driveConnected ? ` · ${escapeHtml(state.driveAccountEmail || 'akun Google')}` : ''}</span>
    <small>Terakhir sinkron: ${state.lastSyncAt ? formatSyncDate(state.lastSyncAt) : 'Belum pernah sinkron'}</small>
    <small>${escapeHtml(message)}</small>`;
  const details = root.querySelector('#syncStatus');
  if (details) details.textContent = '';
  const button = root.querySelector('#btnSyncNow');
  if (button) {
    button.disabled = state.syncing || !state.driveConnected;
    button.textContent = state.syncing ? 'Menyinkronkan…' : state.needsAuthorization ? 'Aktifkan akses Google' : 'Sinkron sekarang';
  }
}

function formatSyncDate(value) {
  return new Date(value).toLocaleString('id-ID', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace(',', '');
}

async function saveAutoBackupForm(root) {
  const s = await getSettings();
  if (!root.querySelector('#enableToggle')) return;
  const retentionInput = root.querySelector('#backupKeepCount');
  if (!retentionInput.reportValidity()) return;
  const backupKeepCount = Number(retentionInput.value);
  if (!Number.isSafeInteger(backupKeepCount) || backupKeepCount < 1) {
    toast('Jumlah backup harus bilangan bulat minimal 1.');
    return;
  }
  const startInput = root.querySelector('#backupWindowStart');
  const endInput = root.querySelector('#backupWindowEnd');
  if (!startInput.reportValidity() || !endInput.reportValidity()) return;
  if (startInput.value >= endInput.value) {
    toast('Jam selesai harus sesudah jam mulai pada hari yang sama.');
    return;
  }
  await saveSettings({
    autoBackup: {
      ...s.autoBackup,
      enabled: root.querySelector('#enableToggle').checked,
      backupWindowStart: startInput.value,
      backupWindowEnd: endInput.value,
      backupDailyLimit: Number(root.querySelector('#backupDailyLimit').value) === 1 ? 1 : 2,
      backupKeepCount,
      confirmBeforeBackup: false,
    },
  });
  toast('Pengaturan backup otomatis disimpan');
  const drive = await import('../services/driveBackupService.js');
  void drive.checkScheduleOnAppOpen().catch((e) => console.error('[auto-backup]', e));
}
