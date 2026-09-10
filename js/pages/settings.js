// pages/settings.js

import { getSettings, saveSettings } from '../services/settingsService.js';
import { createBackupBlob, downloadBackup, restoreFromFile } from '../services/backupService.js';
import { importLegacyFile } from '../services/legacyImportService.js';
import { escapeHtml } from '../format.js';
import { confirmDialog, alertDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { navigate, setPageTitle, setTopbarActions, checkForUpdate } from '../app.js';
import { APP_VERSION } from '../version.js';

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
      <span style="color:var(--muted);">›</span>
    </button>`;
}

function renderHub(root) {
  setPageTitle('Setting');
  setTopbarActions([]);
  root.innerHTML = `
    <div style="padding-top:8px;">
      ${tile('🏪', 'Info Toko', 'Nama, alamat, telepon toko', 'settings/store')}
      ${tile('🧾', 'Nomor Nota', 'Prefix, digit, mode reset nomor', 'settings/invoice')}
      ${tile('🖨️', 'Printer', 'Ukuran kertas & printer Bluetooth', 'settings/printer')}
      ${tile('🔳', 'QRIS', 'Tampilkan kode QRIS di struk belum lunas', 'settings/qris')}
      <div style="height:8px;"></div>
      ${tile('☁️', 'Backup / Restore', 'Cadangkan data & impor database lama', 'settings/backup')}
    </div>
    <div style="padding:20px 16px;color:var(--muted);font-size:12px;text-align:center;">NotaKu Web v${APP_VERSION}</div>
    <div style="padding:0 16px 20px;text-align:center;">
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
    <div class="field"><label>Catatan Kaki Struk</label><textarea id="fFooter" rows="3">${escapeHtml(s.footerNote)}</textarea></div>
    <div class="section-title">Privasi Data Pelanggan</div>
    <label style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;">
      <div>
        <div style="font-size:14px;font-weight:600;">Sembunyikan nomor HP pelanggan di struk</div>
        <div class="row-meta">Kalau aktif, struk cuma menampilkan 3 digit terakhir (mis. *********771)</div>
      </div>
      <input type="checkbox" id="maskPhoneToggle" ${s.maskCustomerPhone ? 'checked' : ''} style="width:44px;height:24px;flex-shrink:0;margin-left:12px;">
    </label>
    <button class="btn" id="fSave">Simpan</button>
  `;
  root.querySelector('#maskPhoneToggle').onchange = async (e) => {
    await saveSettings({ maskCustomerPhone: e.target.checked });
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
}

async function renderInvoice(root) {
  setPageTitle('Nomor Nota');
  setTopbarActions([]);
  const s = await getSettings();
  root.innerHTML = `
    <div class="field"><label>Awalan (Prefix)</label><input id="fPrefix" value="${escapeHtml(s.invoicePrefix)}"></div>

    <div class="section-title">Format Nomor</div>
    <label class="field-radio"><input type="radio" name="numformat" value="DATETIME" ${s.invoiceNumberFormat === 'DATETIME' ? 'checked' : ''}><div><div class="radio-title">Berdasarkan Waktu Dibuat</div><div class="radio-sub">Format: Prefix + TahunBulanTanggalJam, contoh nota dibuat hari ini jam 21 -> tampil seperti pratinjau di bawah. Sederhana, tapi dua nota di jam yang sama bisa punya nomor sama.</div></div></label>
    <label class="field-radio"><input type="radio" name="numformat" value="SEQUENTIAL" ${s.invoiceNumberFormat === 'SEQUENTIAL' ? 'checked' : ''}><div><div class="radio-title">Nomor Urut</div><div class="radio-sub">Prefix + angka urut yang selalu naik dan dijamin unik.</div></div></label>

    <div id="sequentialFields" style="${s.invoiceNumberFormat === 'SEQUENTIAL' ? '' : 'display:none;'}">
      <div class="field"><label>Jumlah Digit</label><input id="fDigit" type="number" value="${s.invoiceDigitCount}"></div>
      <div class="field"><label>Nomor Berikutnya</label><input id="fNext" type="number" value="${s.invoiceNextNumber}"></div>
      <div class="section-title">Mode Reset</div>
      <label class="field-radio"><input type="radio" name="reset" value="NEVER" ${s.invoiceResetMode === 'NEVER' ? 'checked' : ''}><div><div class="radio-title">Tidak Pernah</div><div class="radio-sub">Nomor terus naik, tidak pernah kembali ke awal</div></div></label>
      <label class="field-radio"><input type="radio" name="reset" value="DAILY" ${s.invoiceResetMode === 'DAILY' ? 'checked' : ''}><div><div class="radio-title">Harian</div><div class="radio-sub">Nomor kembali ke 1 setiap hari baru</div></div></label>
      <label class="field-radio"><input type="radio" name="reset" value="MONTHLY" ${s.invoiceResetMode === 'MONTHLY' ? 'checked' : ''}><div><div class="radio-title">Bulanan</div><div class="radio-sub">Nomor kembali ke 1 setiap bulan baru</div></div></label>
    </div>

    <div class="info-card" style="margin-top:14px;"><div class="info-text" id="preview"></div></div>
    <button class="btn" id="fSave">Simpan</button>
  `;

  function currentFormat() {
    return root.querySelector('input[name="numformat"]:checked').value;
  }

  function updatePreview() {
    const prefix = root.querySelector('#fPrefix').value;
    const now = new Date();
    if (currentFormat() === 'DATETIME') {
      const yy = String(now.getFullYear()).slice(-2);
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const hh = String(now.getHours()).padStart(2, '0');
      root.querySelector('#preview').textContent = `Contoh nomor (sekarang): ${prefix}${yy}${mm}${dd}${hh}`;
    } else {
      const digit = Number(root.querySelector('#fDigit').value) || 5;
      const next = Number(root.querySelector('#fNext').value) || 1;
      root.querySelector('#preview').textContent = `Contoh nomor: ${prefix}${String(next).padStart(digit, '0')}`;
    }
  }

  root.querySelectorAll('input[name="numformat"]').forEach((r) => {
    r.addEventListener('change', () => {
      root.querySelector('#sequentialFields').style.display = r.value === 'SEQUENTIAL' ? '' : 'none';
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
    <div style="padding:0 16px 12px;">
      <div class="info-card" style="margin:0 0 12px;">
        <div class="info-title">Catatan penting</div>
        <div class="info-text">Cetak Bluetooth langsung hanya untuk printer BLE (Bluetooth Low Energy) dan hanya jalan di Chrome/Edge Android — tidak di iPhone. Kalau printer kamu tidak muncul saat "Cari Printer", kemungkinan itu printer Bluetooth klasik yang memang tidak bisa diakses browser — pakai "Cetak / Simpan PDF" sebagai gantinya.</div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--outline);">
        <div>
          <div style="font-size:14px;font-weight:700;">${btOk ? 'Tersambung' : (s.btPrinterId ? 'Tersimpan (belum tersambung)' : 'Belum ada printer')}</div>
          <div class="row-meta">${btOk ? escapeHtml(btInfo.name) : (s.btPrinterName ? escapeHtml(s.btPrinterName) : '—')}</div>
        </div>
        <button class="btn small secondary" id="btnBtConnect" style="margin:0;">${btOk ? 'Sambung Ulang' : 'Cari Printer'}</button>
      </div>
      ${s.btPrinterId ? `<button class="btn small ghost" id="btnBtForget" style="margin:10px 0 0;">Lupakan Printer Ini</button>` : ''}
    </div>

    <div class="section-title">Lebar Kertas Bluetooth</div>
    <label class="field-radio"><input type="radio" name="charwidth" value="32" ${s.btCharWidth === 32 ? 'checked' : ''}><div><div class="radio-title">58mm (32 karakter/baris)</div></div></label>
    <label class="field-radio"><input type="radio" name="charwidth" value="48" ${s.btCharWidth === 48 ? 'checked' : ''}><div><div class="radio-title">80mm (48 karakter/baris)</div></div></label>

    <div class="section-title">Ukuran Kertas (Cetak / Simpan PDF)</div>
    <label class="field-radio"><input type="radio" name="paper" value="THERMAL_58MM" ${s.paperSize === 'THERMAL_58MM' ? 'checked' : ''}><div><div class="radio-title">Thermal 58mm</div><div class="radio-sub">Printer struk kecil (kasir portabel)</div></div></label>
    <label class="field-radio"><input type="radio" name="paper" value="THERMAL_80MM" ${s.paperSize === 'THERMAL_80MM' ? 'checked' : ''}><div><div class="radio-title">Thermal 80mm</div><div class="radio-sub">Printer struk standar toko</div></div></label>
    <label class="field-radio"><input type="radio" name="paper" value="PDF_A4" ${s.paperSize === 'PDF_A4' ? 'checked' : ''}><div><div class="radio-title">A4 (dokumen biasa)</div><div class="radio-sub">Untuk dicetak di printer biasa</div></div></label>
    <div class="info-card">
      <div class="info-text">"Cetak / Simpan PDF" memakai fitur cetak bawaan browser — cocok untuk printer apa pun yang sudah terpasang sebagai printer sistem HP/laptop, atau kalau printer Bluetooth-mu tidak didukung cetak langsung.</div>
    </div>
  `;

  root.querySelectorAll('input[name="paper"]').forEach((r) => {
    r.onchange = async () => { await saveSettings({ paperSize: r.value }); toast('Ukuran kertas disimpan'); };
  });
  root.querySelectorAll('input[name="charwidth"]').forEach((r) => {
    r.onchange = async () => { await saveSettings({ btCharWidth: Number(r.value) }); toast('Lebar kertas Bluetooth disimpan'); };
  });

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
    <div style="padding:16px;">
      <label style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <div style="font-size:15px;font-weight:700;">Tampilkan QRIS di Struk</div>
          <div class="row-meta">Muncul otomatis kalau nota BELUM LUNAS, hilang kalau sudah lunas.</div>
        </div>
        <input type="checkbox" id="qrisToggle" ${s.qrisEnabled ? 'checked' : ''} style="width:44px;height:24px;">
      </label>
    </div>
    <div style="padding:0 16px;">
      <div style="font-size:13px;font-weight:700;margin-bottom:8px;">Gambar QRIS</div>
      ${s.qrisImageData ? `<img src="${s.qrisImageData}" style="width:160px;height:160px;object-fit:contain;border:1px solid var(--outline);border-radius:12px;display:block;margin-bottom:10px;">` : `<div class="info-card" style="margin:0 0 10px;"><div class="info-text">Belum ada gambar QRIS. Upload dari galeri HP kamu (foto/screenshot kode QRIS statis milik tokomu, bisa didapat dari aplikasi bank/e-wallet).</div></div>`}
      <input type="file" id="qrisFile" accept="image/*" style="display:none">
      <button class="btn secondary small" id="btnUploadQris">${s.qrisImageData ? 'Ganti Gambar' : 'Upload Gambar QRIS'}</button>
      ${s.qrisImageData ? `<button class="btn danger small" id="btnRemoveQris" style="margin-left:8px;">Hapus</button>` : ''}
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
    <div style="padding:16px;">
      <div style="font-size:16px;font-weight:800;margin-bottom:6px;">Cadangkan Data</div>
      <div style="font-size:13px;color:var(--ink-soft);margin-bottom:12px;">Unduh file cadangan seluruh data NotaKu (nota, produk, pelanggan, pengaturan), lalu simpan ke Google Drive atau tempat lain lewat aplikasi file HP kamu.</div>
      <button class="btn" id="btnBackup" style="margin:0;">Unduh Cadangan</button>
    </div>
    <div style="padding:0 16px 16px;">
      ${tile('⏱️', 'Atur Backup Otomatis', 'Jadwalkan backup ke Google Drive', 'settings/autobackup')}
    </div>
    <div style="padding:0 16px 16px;">
      <div style="font-size:16px;font-weight:800;margin-bottom:6px;">Pulihkan dari Cadangan NotaKu</div>
      <div style="font-size:13px;color:var(--ink-soft);margin-bottom:12px;">Pilih file cadangan .json yang pernah dibuat NotaKu. <b>PERHATIAN:</b> ini akan MENGGANTI seluruh data yang ada saat ini.</div>
      <button class="btn secondary" id="btnRestore" style="margin:0;">Pilih File &amp; Pulihkan</button>
      <input type="file" id="fileRestore" accept="application/json,.json" style="display:none">
    </div>
    <div style="padding:0 16px 16px;">
      <div style="font-size:16px;font-weight:800;margin-bottom:6px;">Impor Database Aplikasi Lama</div>
      <div class="info-card" style="margin:0 0 12px;">
        <div class="info-title">Pindah dari aplikasi nota lain?</div>
        <div class="info-text">Kalau kamu punya file .db dari aplikasi nota sebelumnya (di HP atau Google Drive), NotaKu bisa membaca dan MENAMBAHKAN riwayat nota, produk, dan pelanggan dari file itu — data yang sudah ada di NotaKu tetap aman.</div>
      </div>
      <button class="btn secondary" id="btnImport" style="margin:0;">Pilih File &amp; Impor</button>
      <input type="file" id="fileImport" accept=".db,application/octet-stream" style="display:none">
      <div style="font-size:11.5px;color:var(--muted);margin-top:10px;">Tips: kalau file tersimpan di Google Drive, pilih "Files"/"Berkas" pada layar pemilih file lalu masuk ke akun Drive-mu — file akan diunduh sementara secara otomatis oleh browser untuk dibaca.</div>
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
      <div class="info-card" style="margin:16px;">
        <div class="info-title">Perlu setup sekali sebelum dipakai</div>
        <div class="info-text">Fitur ini butuh Google Client ID yang didaftarkan sendiri di Google Cloud Console (gratis). Ikuti langkah di <b>docs/DRIVE_SETUP.md</b> pada project NotaKu, lalu isi <code>js/config.js</code>.</div>
      </div>`;
    return;
  }

  root.innerHTML = `
    <div style="padding:16px;">
      <label style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div style="font-size:15px;font-weight:700;">Aktifkan Backup Otomatis</div>
        <input type="checkbox" id="enableToggle" ${cfg.enabled ? 'checked' : ''} style="width:44px;height:24px;">
      </label>

      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-top:1px solid var(--outline);border-bottom:1px solid var(--outline);margin-bottom:16px;">
        <div>
          <div style="font-size:13.5px;font-weight:700;">Akun Google Drive</div>
          <div class="row-meta">${cfg.driveConnected ? escapeHtml(cfg.driveAccountEmail || 'Tersambung') : 'Belum tersambung'}</div>
        </div>
        <button class="btn small secondary" id="btnDriveConnect" style="margin:0;">${cfg.driveConnected ? 'Putuskan' : 'Hubungkan'}</button>
      </div>
      <div class="info-card" style="margin:0 0 20px;">
        <div class="info-text">Gunakan akun Google yang sama di semua perangkat kalau ingin semua HP/laptop toko mengakses file backup yang sama.</div>
      </div>

      <div style="font-size:13.5px;font-weight:700;margin-bottom:10px;">Jam Backup</div>
      <div id="timeSlots">
        ${(cfg.scheduleTimes || []).map((t, i) => `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;" data-slot="${i}">
            <input type="checkbox" checked disabled>
            <input type="time" value="${t}" class="slotTime" style="border:1px solid var(--outline);border-radius:8px;padding:6px 8px;">
            <button class="btn small ghost removeSlot" style="margin:0;">Hapus</button>
          </div>`).join('')}
      </div>
      <button class="btn small secondary" id="btnAddSlot" style="margin:0 0 20px;">+ Tambah Jam</button>

      <div class="field" style="padding:0;margin-bottom:16px;">
        <label>Hapus file backup yang lebih lama dari (hari)</label>
        <input id="deleteOlderThan" type="number" value="${cfg.deleteOlderThanDays}">
      </div>

      <label style="display:flex;align-items:flex-start;gap:10px;margin-bottom:20px;">
        <input type="checkbox" id="confirmToggle" ${cfg.confirmBeforeBackup ? 'checked' : ''} style="margin-top:2px;">
        <span style="font-size:13.5px;">Konfirmasi sebelum backup (muncul dialog tiap kali sebelum upload)</span>
      </label>

      ${cfg.lastBackupAt ? `<div style="font-size:12px;color:var(--muted);margin-bottom:16px;">Backup terakhir: ${new Date(cfg.lastBackupAt).toLocaleString('id-ID')}</div>` : ''}

      <button class="btn" id="btnBackupNow">Backup Sekarang</button>

      <div class="info-card" style="margin-top:20px;">
        <div class="info-title">Soal "otomatis"</div>
        <div class="info-text">Backup di jam yang dijadwalkan akan berjalan begitu aplikasi dibuka/kembali aktif SETELAH jam tersebut lewat — bukan persis di jam itu kalau aplikasi sedang tidak dibuka sama sekali (keterbatasan web app tanpa server, lihat docs/DRIVE_SETUP.md).</div>
      </div>
    </div>
  `;

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
    div.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:10px;';
    div.innerHTML = `<input type="checkbox" checked disabled><input type="time" value="09:00" class="slotTime" style="border:1px solid var(--outline);border-radius:8px;padding:6px 8px;"><button class="btn small ghost removeSlot" style="margin:0;">Hapus</button>`;
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
      toast(e.message || 'Backup gagal.');
    } finally {
      document.getElementById('loadingOverlay').classList.add('hidden');
    }
  };
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
