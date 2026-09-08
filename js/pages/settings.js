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
  if (sub === 'backup') return renderBackup(root);
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
      ${tile('🖨️', 'Printer', 'Ukuran kertas struk', 'settings/printer')}
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
    <button class="btn" id="fSave">Simpan</button>
  `;
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
    <div class="field"><label>Jumlah Digit</label><input id="fDigit" type="number" value="${s.invoiceDigitCount}"></div>
    <div class="field"><label>Nomor Berikutnya</label><input id="fNext" type="number" value="${s.invoiceNextNumber}"></div>
    <div class="section-title">Mode Reset</div>
    <label class="field-radio"><input type="radio" name="reset" value="NEVER" ${s.invoiceResetMode === 'NEVER' ? 'checked' : ''}><div><div class="radio-title">Tidak Pernah</div><div class="radio-sub">Nomor terus naik, tidak pernah kembali ke awal</div></div></label>
    <label class="field-radio"><input type="radio" name="reset" value="DAILY" ${s.invoiceResetMode === 'DAILY' ? 'checked' : ''}><div><div class="radio-title">Harian</div><div class="radio-sub">Nomor kembali ke 1 setiap hari baru</div></div></label>
    <label class="field-radio"><input type="radio" name="reset" value="MONTHLY" ${s.invoiceResetMode === 'MONTHLY' ? 'checked' : ''}><div><div class="radio-title">Bulanan</div><div class="radio-sub">Nomor kembali ke 1 setiap bulan baru</div></div></label>
    <div class="info-card" style="margin-top:14px;"><div class="info-text" id="preview"></div></div>
    <button class="btn" id="fSave">Simpan</button>
  `;
  function updatePreview() {
    const prefix = root.querySelector('#fPrefix').value;
    const digit = Number(root.querySelector('#fDigit').value) || 5;
    const next = Number(root.querySelector('#fNext').value) || 1;
    root.querySelector('#preview').textContent = `Contoh nomor: ${prefix}${String(next).padStart(digit, '0')}`;
  }
  root.querySelectorAll('input').forEach((i) => i.addEventListener('input', updatePreview));
  updatePreview();
  root.querySelector('#fSave').onclick = async () => {
    const resetMode = root.querySelector('input[name="reset"]:checked').value;
    await saveSettings({
      invoicePrefix: root.querySelector('#fPrefix').value.trim(),
      invoiceDigitCount: Number(root.querySelector('#fDigit').value) || 5,
      invoiceNextNumber: Number(root.querySelector('#fNext').value) || 1,
      invoiceResetMode: resetMode,
    });
    toast('Pengaturan nomor nota disimpan');
  };
}

async function renderPrinter(root) {
  setPageTitle('Printer');
  setTopbarActions([]);
  const s = await getSettings();
  root.innerHTML = `
    <div class="section-title">Ukuran Kertas</div>
    <label class="field-radio"><input type="radio" name="paper" value="THERMAL_58MM" ${s.paperSize === 'THERMAL_58MM' ? 'checked' : ''}><div><div class="radio-title">Thermal 58mm</div><div class="radio-sub">Printer struk kecil (kasir portabel)</div></div></label>
    <label class="field-radio"><input type="radio" name="paper" value="THERMAL_80MM" ${s.paperSize === 'THERMAL_80MM' ? 'checked' : ''}><div><div class="radio-title">Thermal 80mm</div><div class="radio-sub">Printer struk standar toko</div></div></label>
    <label class="field-radio"><input type="radio" name="paper" value="PDF_A4" ${s.paperSize === 'PDF_A4' ? 'checked' : ''}><div><div class="radio-title">A4 (dokumen biasa)</div><div class="radio-sub">Untuk dicetak di printer biasa</div></div></label>
    <div class="info-card">
      <div class="info-text">Cetak memakai fitur cetak bawaan browser (window.print), cocok untuk printer thermal yang sudah terpasang sebagai printer sistem, atau "Simpan sebagai PDF" bawaan browser/HP.</div>
    </div>
  `;
  root.querySelectorAll('input[name="paper"]').forEach((r) => {
    r.onchange = async () => { await saveSettings({ paperSize: r.value }); toast('Ukuran kertas disimpan'); };
  });
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
