// pages/settings.js

import { getSettings, saveSettings } from '../services/settingsService.js';
import { createBackupBlob, downloadBackup, restoreFromFile } from '../services/backupService.js';
import { importLegacyFile } from '../services/legacyImportService.js';
import { escapeHtml } from '../format.js';
import { confirmDialog, alertDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { navigate, setPageTitle, setTopbarActions, checkForUpdate } from '../app.js';
import { APP_VERSION } from '../version.js';
import { receiptLogo, logoWidth } from '../services/receiptLogo.js';

export async function render(root, params) {
  const sub = params[0];
  if (sub === 'store') return renderStore(root);
  if (sub === 'invoice') return renderInvoice(root);
  if (sub === 'printer') return renderPrinter(root);
  if (sub === 'qris') return renderQris(root);
  if (sub === 'backup') return renderBackup(root);
  if (sub === 'autobackup') return renderAutoBackup(root);
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
  setPageTitle('Setting');
  setTopbarActions([]);
  root.innerHTML = `
    <div class="settings-hub">
      ${tile('🏪', 'Info Toko', 'Nama, alamat, telepon toko', 'settings/store')}
      ${tile('🧾', 'Nomor Nota', 'Prefix, digit, mode reset nomor', 'settings/invoice')}
      ${tile('🖨️', 'Printer', 'Ukuran kertas & printer Bluetooth', 'settings/printer')}
      ${tile('🔳', 'QRIS', 'Tampilkan kode QRIS di struk belum lunas', 'settings/qris')}
      <div class="settings-spacer"></div>
      ${tile('☁️', 'Backup / Restore', 'Cadangkan data & impor database lama', 'settings/backup')}
    </div>
    <div class="settings-version">NotaKu Web v${APP_VERSION}</div>
    <div class="settings-update-action">
      <button class="btn small secondary" id="btnCheckUpdate">Cek Pembaruan</button>
    </div>
  `;
  root.querySelector('#btnCheckUpdate').onclick = () => checkForUpdate(false);
  root.querySelectorAll('[data-route]').forEach((el) => {
    el.onclick = () => navigate(el.dataset.route);
  });
}

async function renderStore(root) {
  setPageTitle('Info Toko');
  setTopbarActions([]);
  const s = await getSettings();
  root.innerHTML = `
    <div class="field"><label>Nama Toko</label><input id="fName" value="${escapeHtml(s.storeName)}"></div>
    <div class="field"><label>Alamat</label><textarea id="fAddress" rows="2">${escapeHtml(s.storeAddress)}</textarea></div>
    <div class="field"><label>Telepon</label><input id="fPhone" value="${escapeHtml(s.storePhone)}"></div>
    <div class="field"><label>Catatan Kaki Struk</label><textarea id="fFooter" rows="3">${escapeHtml(s.footerNote)}</textarea><div class="row-meta">Tanggal/jam cetak selalu ditambahkan. Gunakan [print_datetime] bila ingin menaruhnya di posisi tertentu.</div></div>
    <div class="field"><label>Logo Toko (opsional)</label><input id="fLogo" type="file" accept="image/*"><div class="row-meta">Jika kosong, NotaKu memakai logo bawaan. Ukuran berlaku sama pada nota dan Bluetooth.</div><button class="settings-logo-remove btn small ghost ${s.storeLogoData ? '' : 'hidden'}" id="removeLogo">Hapus Logo</button></div>
    <div class="field logo-size-field"><label for="logoMaxWidth">Lebar Maksimum Logo <output id="logoWidthValue">${logoWidth(s)}%</output></label><input id="logoMaxWidth" type="range" min="10" max="100" step="1" value="${logoWidth(s)}"><div class="settings-logo-preview"><img id="storeLogoPreview" class="receipt-logo logo-width-${logoWidth(s)}" src="${escapeHtml(receiptLogo(s))}" alt="Preview logo toko"></div></div>
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
  root.innerHTML = `
    <div class="settings-section">
      <div class="settings-heading">Cadangkan Data</div>
      <div class="settings-description">Unduh file cadangan seluruh data NotaKu (nota, produk, pelanggan, pengaturan), lalu simpan ke Google Drive atau tempat lain lewat aplikasi file HP kamu.</div>
      <button class="settings-button btn" id="btnBackup">Unduh Cadangan</button>
    </div>
    <div class="settings-section-bottom">
      ${tile('⏱️', 'Atur Backup Otomatis', 'Jadwalkan backup ke Google Drive', 'settings/autobackup')}
    </div>
    <div class="settings-section-bottom">
      <div class="settings-heading">Pulihkan dari Cadangan NotaKu</div>
      <div class="settings-description">Pilih file cadangan .json yang pernah dibuat NotaKu. <b>PERHATIAN:</b> ini akan MENGGANTI seluruh data yang ada saat ini.</div>
      <button class="settings-button btn secondary" id="btnRestore">Pilih File &amp; Pulihkan</button>
      <input class="settings-file-input" type="file" id="fileRestore" accept="application/json,.json">
    </div>
    <div class="settings-section-bottom">
      <div class="settings-heading">Impor Database Aplikasi Lama</div>
      <div class="settings-printer-info info-card">
        <div class="info-title">Pindah dari aplikasi nota lain?</div>
        <div class="info-text">Kalau kamu punya file .db dari aplikasi nota sebelumnya (di HP atau Google Drive), NotaKu bisa membaca dan MENAMBAHKAN riwayat nota, produk, dan pelanggan dari file itu — data yang sudah ada di NotaKu tetap aman.</div>
      </div>
      <button class="settings-button btn secondary" id="btnImport">Pilih File &amp; Impor</button>
      <input class="settings-file-input" type="file" id="fileImport" accept=".db,application/octet-stream">
      <div class="settings-help">Tips: kalau file tersimpan di Google Drive, pilih "Files"/"Berkas" pada layar pemilih file lalu masuk ke akun Drive-mu — file akan diunduh sementara secara otomatis oleh browser untuk dibaca.</div>
    </div>
  `;

  root.querySelectorAll('[data-route]').forEach((el) => { el.onclick = () => navigate(el.dataset.route); });

  root.querySelector('#btnBackup').onclick = async () => {
    try {
      const blob = await createBackupBlob();
      downloadBackup(blob);
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

async function renderAutoBackup(root) {
  setPageTitle('Atur Backup Otomatis');
  const s = await getSettings();
  const cfg = s.autoBackup;
  const drive = await import('../services/driveBackupService.js');
  const configured = drive.isConfigured();

  setTopbarActions([{ icon: 'edit', title: 'Simpan', onClick: () => saveAutoBackupForm(root) }]);

  if (!configured) {
    root.innerHTML = `
      <div class="settings-setup-info info-card">
        <div class="info-title">Perlu setup sekali sebelum dipakai</div>
        <div class="info-text">Fitur ini butuh Google Client ID yang didaftarkan sendiri di Google Cloud Console (gratis). Ikuti langkah di <b>docs/DRIVE_SETUP.md</b> pada project NotaKu, lalu isi <code>js/config.js</code>.</div>
      </div>`;
    return;
  }

  root.innerHTML = `
    <div class="settings-section">
      <label class="settings-backup-toggle">
        <div class="settings-section-label">Aktifkan Backup Otomatis</div>
        <input class="settings-checkbox" type="checkbox" id="enableToggle" ${cfg.enabled ? 'checked' : ''}>
      </label>

      <div class="settings-drive-account">
        <div>
          <div class="settings-drive-label">Akun Google Drive</div>
          <div class="row-meta">${cfg.driveConnected ? escapeHtml(cfg.driveAccountEmail || 'Tersambung') : 'Belum tersambung'}</div>
        </div>
        <button class="settings-button btn small secondary" id="btnDriveConnect">${cfg.driveConnected ? 'Putuskan' : 'Hubungkan'}</button>
      </div>
      <div class="settings-backup-info info-card">
        <div class="info-text">Gunakan akun Google yang sama di semua perangkat kalau ingin semua HP/laptop toko mengakses file backup yang sama.</div>
      </div>

      <div class="settings-schedule-label">Jam Backup</div>
      <div id="timeSlots">
        ${(cfg.scheduleTimes || []).map((t, i) => `
          <div class="settings-backup-slot" data-slot="${i}">
            <input type="checkbox" checked disabled>
            <input type="time" value="${t}" class="settings-time-input slotTime">
            <button class="settings-button btn small ghost removeSlot">Hapus</button>
          </div>`).join('')}
      </div>
      <button class="settings-backup-info btn small secondary" id="btnAddSlot">+ Tambah Jam</button>

      <div class="settings-retention field">
        <label>Hapus file backup yang lebih lama dari (hari)</label>
        <input id="deleteOlderThan" type="number" value="${cfg.deleteOlderThanDays}">
      </div>

      <label class="settings-confirm-backup">
        <input class="settings-confirm-checkbox" type="checkbox" id="confirmToggle" ${cfg.confirmBeforeBackup ? 'checked' : ''}>
        <span class="settings-confirm-label">Konfirmasi sebelum backup (muncul dialog tiap kali sebelum upload)</span>
      </label>

      ${cfg.lastBackupAt ? `<div class="settings-last-backup">Backup terakhir: ${new Date(cfg.lastBackupAt).toLocaleString('id-ID')}</div>` : ''}

      <button class="btn" id="btnBackupNow">Backup Sekarang</button>

      <div class="settings-backup-note info-card">
        <div class="info-title">Soal "otomatis"</div>
        <div class="info-text">Backup di jam yang dijadwalkan akan berjalan begitu aplikasi dibuka/kembali aktif SETELAH jam tersebut lewat — bukan persis di jam itu kalau aplikasi sedang tidak dibuka sama sekali (keterbatasan web app tanpa server, lihat docs/DRIVE_SETUP.md).</div>
      </div>

      <div class="settings-sync-heading section-title">Sinkronisasi Antar Perangkat</div>
      <div class="settings-sync-info info-card">
        <div class="info-title">Satu database, banyak perangkat</div>
        <div class="info-text">Dorong (push) data dari perangkat ini ke Drive, lalu tarik (pull) dari perangkat lain yang login akun Google sama supaya datanya ikut sama. <b>Bukan sinkron realtime</b> — siapa yang push TERAKHIR itu yang berlaku; kalau dua HP push beda perubahan bersamaan, yang belakangan menimpa yang duluan. Selalu Pull dulu sebelum mulai kerja di sebuah perangkat, Push setelah selesai.</div>
      </div>
      <div class="settings-sync-status" id="syncStatus">Memeriksa status...</div>
      <div class="settings-sync-actions">
        <button class="settings-sync-button btn secondary" id="btnPush">⬆ Push ke Cloud</button>
        <button class="settings-sync-button btn secondary" id="btnPull">⬇ Tarik dari Cloud</button>
      </div>
    </div>
  `;

  refreshSyncStatus(root, drive);

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
      await drive.disconnectAccount();
      toast('Akun Google Drive diputuskan');
      await renderAutoBackup(root);
      return;
    }
    try {
      const email = await drive.connectAccount();
      toast(`Tersambung sebagai ${email}`);
      await renderAutoBackup(root);
    } catch (e) { toast(e.message || 'Gagal menghubungkan akun Google.'); }
  };

  root.querySelector('#btnAddSlot').onclick = () => {
    const container = root.querySelector('#timeSlots');
    const div = document.createElement('div');
    div.className = 'settings-backup-slot';
    div.innerHTML = `<input type="checkbox" checked disabled><input type="time" value="09:00" class="settings-time-input slotTime"><button class="settings-button btn small ghost removeSlot">Hapus</button>`;
    container.appendChild(div);
    div.querySelector('.removeSlot').onclick = () => div.remove();
  };
  root.querySelectorAll('.removeSlot').forEach((btn) => {
    btn.onclick = (e) => e.target.closest('[data-slot]')?.remove();
  });

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
  const el = root.querySelector('#syncStatus');
  if (!el) return;
  try {
    const status = await drive.getCloudSyncStatus();
    const parts = [];
    parts.push(status.cloudExists ? `Data di cloud: ${new Date(status.cloudModifiedTime).toLocaleString('id-ID')}` : 'Belum ada data di cloud');
    if (status.lastPushedAt) parts.push(`Terakhir push dari sini: ${new Date(status.lastPushedAt).toLocaleString('id-ID')}`);
    if (status.lastPulledAt) parts.push(`Terakhir pull ke sini: ${new Date(status.lastPulledAt).toLocaleString('id-ID')}`);
    el.innerHTML = parts.join('<br>');
  } catch (e) {
    el.textContent = 'Gagal memeriksa status cloud (' + (e.message || 'koneksi bermasalah') + ')';
  }
}

async function saveAutoBackupForm(root) {
  const s = await getSettings();
  const times = Array.from(root.querySelectorAll('.slotTime')).map((i) => i.value).filter(Boolean);
  await saveSettings({
    autoBackup: {
      ...s.autoBackup,
      enabled: root.querySelector('#enableToggle').checked,
      scheduleTimes: times,
      deleteOlderThanDays: Number(root.querySelector('#deleteOlderThan').value) || 0,
      confirmBeforeBackup: root.querySelector('#confirmToggle').checked,
    },
  });
  toast('Pengaturan backup otomatis disimpan');
}
