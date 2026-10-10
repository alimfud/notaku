// pages/settings.js

import { getSettings, saveSettings } from '../services/settingsService.js';
import { OWNER_NAME, OWNER_WHATSAPP } from '../config.js';
import { createBackupBlob, downloadBackup, restoreFromFile, getBackupSummary, compareBackupFile } from '../services/backupService.js';
import { importLegacyFile } from '../services/legacyImportService.js';
import { escapeHtml, toWhatsAppNumber } from '../format.js';
import { confirmDialog, alertDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { navigate, setPageTitle, setTopbarActions, checkForUpdate } from '../app.js';
import { APP_VERSION } from '../version.js';
import { receiptLogo, logoWidth } from '../services/receiptLogo.js';
import * as db from '../db.js';
import { formatAuditDetails, getAuditLogs, recordAudit } from '../services/auditLogService.js';
import { registerBiometric, biometricAvailable } from '../services/appLockService.js';
import {
  DEFAULT_WHATSAPP_SHARE_MAIN_TEMPLATE,
  DEFAULT_WHATSAPP_SHARE_PRODUCT_TEMPLATE,
  DEFAULT_WHATSAPP_REMINDER_BOTH_TEMPLATE,
  DEFAULT_WHATSAPP_REMINDER_PICKUP_TEMPLATE,
  DEFAULT_WHATSAPP_REMINDER_PAYMENT_TEMPLATE,
} from '../services/whatsappTemplateService.js';

function setBackupLoading(visible, message = 'Sedang memproses…') {
  const overlay = document.getElementById('loadingOverlay');
  if (!overlay) return;
  const label = overlay.querySelector('#loadingMessage');
  if (label) label.textContent = message;
  overlay.classList.toggle('hidden', !visible);
}

function setInitialSyncPending(value) {
  try {
    if (value) sessionStorage.setItem('notaku-initial-sync-pending', '1');
    else sessionStorage.removeItem('notaku-initial-sync-pending');
  } catch { /* private mode */ }
}

function hasInitialSyncPending() {
  try { return sessionStorage.getItem('notaku-initial-sync-pending') === '1'; } catch { return false; }
}

async function runInitialConnectedSync(root, drive) {
  setInitialSyncPending(false);
  setBackupLoading(true, 'Memeriksa data perangkat dan Google Drive…');
  try {
    const result = await drive.initializeConnectedAccount();
    setBackupLoading(false);
    toast(result.message || 'Sinkronisasi awal selesai.');
    await renderAutoBackup(root);
  } catch (error) {
    setBackupLoading(false);
    await alertDialog({ title: 'Sinkronisasi Awal Gagal', message: error.message || 'Akun sudah terhubung, tetapi data belum berhasil diselaraskan.' });
    await renderAutoBackup(root);
  }
}

export async function render(root, params) {
  const sub = params[0];
  if (sub === 'store') return renderStore(root);
  if (sub === 'whatsapp') return renderWhatsapp(root);
  if (sub === 'invoice') return renderInvoice(root);
  if (sub === 'printer') return renderPrinter(root);
  if (sub === 'qris') return renderQris(root);
  if (sub === 'security') return renderSecurity(root);
  if (sub === 'help') return renderHelp(root);
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
      ${tile('💬', 'Format WhatsApp', 'Atur format nota dan pengingat pelanggan', 'settings/whatsapp')}
      ${tile('🧾', 'Nomor Nota', 'Prefix, digit, mode reset nomor', 'settings/invoice')}
      ${tile('🖨️', 'Printer', 'Ukuran kertas & printer Bluetooth', 'settings/printer')}
      ${tile('🔳', 'QRIS', 'Tampilkan kode QRIS di struk belum lunas', 'settings/qris')}
      ${tile('🔒', 'Kunci Aplikasi', 'Sidik jari saat membuka NotaKu', 'settings/security')}
      ${tile('💡', 'Pusat Bantuan', 'Instalasi, offline, versi & backup', 'settings/help')}
      <div class="settings-spacer"></div>
      ${tile('☁️', 'Backup / Restore', 'Cadangkan data & impor database lama', 'settings/backup')}
      ${tile('🗑️', 'Tempat Sampah', 'Pulihkan nota yang terhapus', 'settings/trash')}
      ${tile('🧾', 'Riwayat Aktivitas', 'Lihat perubahan penting pada data', 'settings/audit')}
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

async function renderHelp(root) {
  setPageTitle('Pusat Bantuan');
  setTopbarActions([]);
  const [settings, install] = await Promise.all([
    getSettings(),
    import('../installPrompt.js').then(({ getInstallReadiness }) => getInstallReadiness()),
  ]);
  const backup = settings.autoBackup || {};
  const renderBackupDate = (value) => value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : 'Belum pernah';
  const renderInstall = (status) => {
    const action = status.state === 'ready'
      ? '<button type="button" class="btn small" id="btnHelpInstall">Pasang sekarang</button>'
      : status.state === 'installed' ? '' : '<button type="button" class="btn small secondary" id="btnHelpInstall">Cara memasang</button>';
    return `<article class="settings-help-status" data-state="${escapeHtml(status.state)}"><span class="settings-help-status-icon">${status.state === 'installed' ? '✓' : '⌂'}</span><div><b>${escapeHtml(status.label)}</b><small>${escapeHtml(status.detail)}</small></div>${action}</article>`;
  };
  const backupState = backup.lastBackupError ? 'error' : backup.lastBackupAt ? 'success' : 'empty';
  const backupLabel = backup.lastBackupError ? 'Backup terakhir bermasalah' : backup.lastBackupAt ? 'Backup terakhir berhasil' : 'Belum ada backup';
  const backupDetail = backup.lastBackupError ? backup.lastBackupError : backup.lastBackupAt ? `Dibuat ${renderBackupDate(backup.lastBackupAt)}${backup.backupSizeBytes ? ` · ${(backup.backupSizeBytes / 1024).toFixed(1)} KB` : ''}` : 'Cadangkan data untuk menjaga data tetap aman.';
  const ownerNumber = toWhatsAppNumber(OWNER_WHATSAPP || settings.storePhone);
  const ownerContact = ownerNumber
    ? `<a class="settings-help-contact" href="https://wa.me/${ownerNumber}?text=${encodeURIComponent('Halo Developer NotaKu, saya ingin meminta bantuan terkait aplikasi NotaKu.')}" target="_blank" rel="noopener"><span class="settings-help-contact-icon">WA</span><span><b>Chat ${escapeHtml(OWNER_WHATSAPP ? OWNER_NAME : 'toko')}</b><small>Buka WhatsApp untuk meminta bantuan</small></span><i>›</i></a>`
    : '<div class="settings-help-contact settings-help-contact--empty"><span class="settings-help-contact-icon">?</span><span><b>Kontak bantuan belum diatur</b><small>Nomor WhatsApp owner belum tersedia.</small></span></div>';
  root.innerHTML = `<div class="settings-simple-page settings-help-page"><div class="settings-page-intro"><h2>Pusat Bantuan</h2><p>Periksa kondisi NotaKu dan cara memasangnya di perangkat.</p></div><section class="settings-help-list"><article class="settings-help-status" data-state="info"><span class="settings-help-status-icon">ℹ</span><div><b>Versi aplikasi</b><small>NotaKu Web v${escapeHtml(APP_VERSION)}</small></div><button type="button" class="btn small secondary" id="btnHelpUpdate">Cek pembaruan</button></article><article class="settings-help-status" data-state="${navigator.onLine ? 'online' : 'offline'}"><span class="settings-help-status-icon">${navigator.onLine ? '●' : '◌'}</span><div><b>Status koneksi</b><small>${navigator.onLine ? 'Online · koneksi internet tersedia' : 'Offline · data lokal tetap bisa digunakan'}</small></div></article>${renderInstall(install)}<article class="settings-help-status" data-state="${backupState}"><span class="settings-help-status-icon">${backupState === 'success' ? '✓' : backupState === 'error' ? '!' : '↓'}</span><div><b>${escapeHtml(backupLabel)}</b><small>${escapeHtml(backupDetail)}</small></div><button type="button" class="btn small secondary" id="btnHelpBackup">Buka backup</button></article></section><div class="settings-help-note">NotaKu menyimpan data utama di perangkat. Saat offline, transaksi tetap dapat dibuat dan dibaca; backup ke Google Drive membutuhkan internet.</div></div>`;
  root.querySelector('.settings-help-note').insertAdjacentHTML('beforebegin', `<section class="settings-help-section"><h3>Fitur NotaKu</h3><details open><summary>Penjualan dan nota</summary><p>Buat, ubah, gandakan, cetak, dan bagikan nota penjualan. Nota yang belum selesai dapat tersimpan sebagai draf otomatis.</p></details><details><summary>Proses pesanan</summary><p>Pantau pesanan dari <b>Baru</b>, <b>Dikerjakan</b>, <b>Siap Diambil</b>, sampai <b>Sudah Diambil</b>.</p></details><details><summary>Jadwal dan pengingat</summary><p>Jadwal pengambilan dan tagihan tampil dalam satu tempat. Tombol WA dapat mengirim pengingat langsung ke pelanggan.</p></details><details><summary>Pelanggan dan produk</summary><p>Simpan data pelanggan, riwayat nota, daftar produk, harga, dan kategori untuk mempercepat transaksi.</p></details><details><summary>Pembayaran dan laporan</summary><p>Catat pembayaran penuh atau sebagian, lihat status lunas, dan pantau penjualan, pembayaran, serta pengeluaran.</p></details><details><summary>Cetak dan berbagi</summary><p>Cetak nota melalui printer Bluetooth, simpan sebagai PDF, atau bagikan nota kepada pelanggan.</p></details><details><summary>QRIS</summary><p>Tampilkan QRIS toko pada nota yang belum lunas agar pelanggan dapat membayar dengan mudah.</p></details><details><summary>Keamanan dan privasi</summary><p>Gunakan kunci aplikasi dengan PIN atau biometrik, serta atur tampilan nomor WhatsApp pelanggan pada struk.</p></details><details><summary>Backup dan sinkronisasi</summary><p>Unduh backup lokal, pulihkan data, atau gunakan Google Drive untuk backup otomatis dan sinkronisasi antarperangkat.</p></details><details><summary>Riwayat aktivitas dan tempat sampah</summary><p>Periksa perubahan penting pada data dan pulihkan nota yang tidak sengaja dihapus.</p></details></section><section class="settings-help-section"><h3>Panduan singkat</h3><details><summary>Bagaimana cara memasang NotaKu?</summary><p>Gunakan tombol instalasi di atas. Jika belum tersedia, buka menu ⋮ Chrome lalu pilih <b>Instal aplikasi</b> atau <b>Tambahkan ke layar utama</b>.</p></details><details><summary>Apakah NotaKu bisa digunakan offline?</summary><p>Ya. Nota, pelanggan, produk, dan laporan tetap dapat dibuka tanpa internet. Google Drive, pembaruan, dan WhatsApp memerlukan koneksi.</p></details><details><summary>Bagaimana menjaga data tetap aman?</summary><p>Lakukan backup rutin, terutama sebelum berganti perangkat atau menghapus data browser.</p></details></section><section class="settings-help-section settings-help-contact-section"><h3>Bantuan dan kontak</h3>${ownerContact}</section>`);
  // Daftar fitur yang terlalu panjang dihapus dari tampilan; Pusat Bantuan
  // difokuskan pada kondisi aplikasi, panduan praktis, dan backup.
  root.querySelector('.settings-help-section')?.remove();
  root.querySelector('.settings-help-contact-section')?.remove();
  root.querySelector('.settings-help-note')?.remove();
  root.querySelector('.settings-help-section')?.insertAdjacentHTML('beforeend', '<details><summary>Bagaimana cara membuat nota?</summary><p>Buka menu <b>Buat Nota</b>, pilih pelanggan, masukkan produk dan jumlahnya, lalu simpan nota.</p></details><details><summary>Bagaimana mencatat pembayaran?</summary><p>Buka detail nota, pilih <b>Tambah Pembayaran</b>, masukkan nominal yang diterima, lalu simpan.</p></details><details><summary>Apa arti status proses pesanan?</summary><p><b>Baru</b> berarti belum dikerjakan, <b>Dikerjakan</b> sedang diproses, <b>Siap Diambil</b> sudah selesai, dan <b>Sudah Diambil</b> telah diserahkan ke pelanggan.</p></details><details><summary>Mengapa nota muncul di Jadwal &amp; Pengingat?</summary><p>Nota muncul jika jadwal pengambilan sudah dekat, terlewat, atau masih memiliki sisa pembayaran. Setelah diambil dan dilunasi, nota akan hilang dari daftar tersebut.</p></details><details><summary>Bagaimana memulihkan data?</summary><p>Buka <b>Backup / Restore</b>, pilih file cadangan NotaKu, lalu ikuti konfirmasi pemulihan. Pemulihan akan mengganti data lokal dengan isi backup.</p></details>');
  const faqDetails = [...(root.querySelector('.settings-help-section')?.querySelectorAll('details') || [])];
  faqDetails.forEach((detail) => detail.addEventListener('toggle', () => {
    if (!detail.open) return;
    faqDetails.forEach((other) => { if (other !== detail) other.open = false; });
  }));
  root.querySelector('#btnHelpUpdate').onclick = () => checkForUpdate(false);
  root.querySelector('#btnHelpBackup').onclick = () => navigate('settings/backup');
  root.querySelector('#btnHelpInstall')?.addEventListener('click', async () => {
    const { requestInstall, getInstallReadiness } = await import('../installPrompt.js');
    const installed = await requestInstall();
    if (!installed) {
      const current = await getInstallReadiness();
      alertDialog({ title: current.label, message: current.detail });
    }
    await renderHelp(root);
  });
  const refresh = () => {
    if (window.location.hash === '#/settings/help') renderHelp(root);
  };
  window.addEventListener('online', refresh, { once: true });
  window.addEventListener('offline', refresh, { once: true });
  window.addEventListener('notaku-install-status', refresh, { once: true });
}

async function renderSecurity(root) {
  setPageTitle('Kunci Aplikasi');
  setTopbarActions([]);
  const settings = await getSettings();
  const security = settings.security || {};
  const biometricReady = await biometricAvailable();
  root.innerHTML = `
    <div class="settings-simple-page settings-security-page">
      <div class="settings-page-intro">
        <h2>Kunci Aplikasi</h2>
        <p>Lindungi data NotaKu ketika aplikasi dibuka kembali dengan sidik jari atau Face Unlock perangkat.</p>
      </div>
      <section class="settings-security-card">
        <div class="settings-security-heading"><span class="settings-security-icon">👆</span><div><b>Sidik jari perangkat</b><small>${biometricReady ? 'Gunakan sidik jari atau Face Unlock perangkat' : 'Browser/perangkat ini belum mendukung WebAuthn'}</small></div><span class="settings-security-status" data-biometric-status>${security.biometricEnabled ? 'Aktif' : 'Belum aktif'}</span></div>
        <div class="settings-security-actions">
          <button type="button" class="btn small secondary" id="btnSetupBiometric" ${biometricReady ? '' : 'disabled'}>${security.biometricEnabled ? 'Daftar ulang' : 'Aktifkan sidik jari'}</button>
          ${security.biometricEnabled ? '<button type="button" class="btn small ghost" id="btnDisableBiometric">Matikan</button>' : ''}
        </div>
      </section>
      <label class="settings-security-toggle"><span><b>Kunci saat kembali ke aplikasi</b><small>NotaKu akan meminta sidik jari setelah tab ditinggalkan.</small></span><input type="checkbox" id="lockOnBackground" ${security.lockOnBackground !== false ? 'checked' : ''}></label>
      <div class="settings-security-note">Catatan: sidik jari tidak dibaca atau disimpan oleh NotaKu. Browser menampilkan verifikasi biometrik bawaan perangkat pada domain HTTPS.</div>
    </div>`;
  root.querySelector('#btnSetupBiometric').onclick = async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const credentialId = await registerBiometric();
      await saveSettings({ security: { ...security, biometricEnabled: true, biometricCredentialId: credentialId } });
      toast('Kunci sidik jari berhasil diaktifkan.');
      await renderSecurity(root);
    } catch (error) {
      toast(error?.name === 'NotAllowedError' ? 'Pendaftaran sidik jari dibatalkan.' : (error.message || 'Sidik jari belum dapat diaktifkan.'));
      button.disabled = false;
    }
  };
  root.querySelector('#btnDisableBiometric')?.addEventListener('click', async () => {
    await saveSettings({ security: { ...security, biometricEnabled: false, biometricCredentialId: '' } });
    toast('Kunci sidik jari dimatikan.');
    await renderSecurity(root);
  });
  root.querySelector('#lockOnBackground').onchange = async (event) => {
    await saveSettings({ security: { ...security, lockOnBackground: event.target.checked } });
    toast(event.target.checked ? 'Kunci otomatis diaktifkan.' : 'Kunci otomatis dimatikan.');
  };
}

async function renderTrash(root) {
  setPageTitle('Tempat Sampah'); setTopbarActions([]);
  const deleted = (await db.getAll('sales')).filter((sale) => sale.isDeleted);
  root.innerHTML = `<div class="settings-simple-page settings-trash-page"><div class="settings-page-intro"><h2>Tempat Sampah</h2><p>Nota yang dihapus masih dapat dipulihkan.</p></div>
    <div class="settings-trash-list">${deleted.length ? deleted.map((sale) => `<article class="settings-trash-card" data-trash-id="${sale.id}"><div class="settings-trash-card-main"><span class="settings-trash-icon">🗑️</span><div><b>${escapeHtml(sale.invoiceNumber)}</b><span>${escapeHtml(sale.customerName)}</span><small>${escapeHtml(sale.saleDate)}${sale.saleTime ? ` · ${escapeHtml(sale.saleTime)}` : ''}</small></div></div><button class="settings-restore-button" data-restore="${sale.id}">Pulihkan</button></article>`).join('') : '<div class="settings-empty-card"><span>🗑️</span><b>Tempat sampah kosong</b><small>Nota yang dihapus akan muncul di sini.</small></div>'}</div></div>`;
  root.querySelectorAll('[data-restore]').forEach((button) => button.onclick = async () => {
    const sale = await db.get('sales', button.dataset.restore); if (!sale) return;
    sale.isDeleted = 0; delete sale.deletedAt; sale.updatedAt = new Date().toISOString(); await db.put('sales', sale);
    await recordAudit('restore', 'sale', sale.id, `Nota ${sale.invoiceNumber} dipulihkan`); toast('Nota dipulihkan'); await renderTrash(root);
  });
}

async function renderAudit(root) {
  setPageTitle('Riwayat Aktivitas'); setTopbarActions([]);
  const logs = await getAuditLogs();
  const entityLabels = { sale: 'Nota', customer: 'Pelanggan', product: 'Produk', expense: 'Pengeluaran' };
  root.innerHTML = `<div class="settings-simple-page settings-audit-page"><div class="settings-page-intro"><h2>Riwayat Aktivitas</h2><p>Perubahan penting pada data NotaKu.</p></div><div class="settings-audit-list">${logs.length ? logs.map((log) => `<article class="settings-audit-item"><span class="settings-audit-dot" data-action="${escapeHtml(log.action)}"></span><div><b>${escapeHtml(formatAuditDetails(log.details || log.action))}</b><small>${escapeHtml(entityLabels[log.entityType] || 'Data')} · ${new Date(log.createdAt).toLocaleString('id-ID')}</small></div></article>`).join('') : '<div class="settings-empty-card"><span>✓</span><b>Belum ada aktivitas</b><small>Perubahan data akan tercatat di sini.</small></div>'}</div></div>`;
}

async function renderWhatsapp(root) {
  setPageTitle('Format WhatsApp');
  setTopbarActions([]);
  const settings = await getSettings();
  const shareTemplate = settings.whatsappShareTemplate || DEFAULT_WHATSAPP_SHARE_MAIN_TEMPLATE;
  const shareProductTemplate = settings.whatsappShareProductTemplate || DEFAULT_WHATSAPP_SHARE_PRODUCT_TEMPLATE;
  const reminderBothTemplate = settings.whatsappReminderBothTemplate || DEFAULT_WHATSAPP_REMINDER_BOTH_TEMPLATE;
  const reminderPickupTemplate = settings.whatsappReminderPickupTemplate || DEFAULT_WHATSAPP_REMINDER_PICKUP_TEMPLATE;
  const reminderPaymentTemplate = settings.whatsappReminderPaymentTemplate || DEFAULT_WHATSAPP_REMINDER_PAYMENT_TEMPLATE;
  root.innerHTML = `
    <div class="settings-simple-page settings-whatsapp-page">
      <div class="settings-page-intro settings-whatsapp-intro"><div><h2>Format WhatsApp</h2><p>Sesuaikan pesan yang dikirim kepada pelanggan. Format bawaan sudah diisikan dan dapat diubah kapan saja.</p></div><button type="button" class="settings-whatsapp-save-icon" id="saveWhatsappTemplatesTop" aria-label="Simpan Format WhatsApp" title="Simpan"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3h12l2 2v16H5zM8 3v6h8V3M8 21v-7h8v7"/></svg></button></div>
      <section class="settings-whatsapp-card">
        <div class="settings-whatsapp-heading"><div><b>Bagikan nota sebagai teks</b><small>Digunakan dari tombol Bagikan Sebagai Teks pada detail nota.</small></div><button type="button" class="btn small ghost" id="resetWhatsappShare">Kembalikan default</button></div>
        <textarea id="fWhatsappTemplate" rows="22" spellcheck="false">${escapeHtml(shareTemplate)}</textarea>
        <div class="settings-whatsapp-help"><div class="settings-whatsapp-help-title">Cara menggunakan</div><p>Letakkan <code>{{daftar_produk}}</code> pada posisi daftar produk. Baris toko, diskon, ongkir, biaya lain, dan catatan otomatis disembunyikan saat datanya kosong.</p><div class="settings-whatsapp-help-label">Data nota</div><div class="settings-whatsapp-chips"><code>{{invoice}}</code><code>{{tanggal}}</code><code>{{pelanggan}}</code><code>{{toko}}</code><code>{{daftar_produk}}</code><code>{{total}}</code><code>{{dibayar}}</code><code>{{label_sisa}}</code><code>{{sisa}}</code><code>{{diskon}}</code><code>{{ongkir}}</code><code>{{label_biaya_lain}}</code><code>{{biaya_lain}}</code><code>{{catatan}}</code><code>{{footer}}</code></div></div>
        <div class="settings-whatsapp-subformat"><b>Format setiap produk</b><small>Format ini diulang otomatis untuk seluruh produk dalam nota.</small><textarea id="fWhatsappProductTemplate" rows="4" spellcheck="false">${escapeHtml(shareProductTemplate)}</textarea><div class="settings-whatsapp-help settings-whatsapp-help--compact"><div class="settings-whatsapp-help-label">Data produk</div><div class="settings-whatsapp-chips"><code>{{nomor}}</code><code>{{nama_produk}}</code><code>{{jumlah}}</code><code>{{satuan}}</code><code>{{harga}}</code><code>{{subtotal}}</code><code>{{catatan_produk}}</code></div></div></div>
      </section>
      <section class="settings-whatsapp-card">
        <div class="settings-whatsapp-heading"><div><b>Pengingat jadwal + pembayaran</b><small>Dipakai ketika nota memiliki jadwal pengambilan dan masih memiliki sisa pembayaran.</small></div><button type="button" class="btn small ghost" id="resetWhatsappReminderBoth">Kembalikan default</button></div>
        <textarea id="fWhatsappReminderBoth" rows="12" spellcheck="false">${escapeHtml(reminderBothTemplate)}</textarea>
      </section>
      <section class="settings-whatsapp-card">
        <div class="settings-whatsapp-heading"><div><b>Pengingat hanya jadwal</b><small>Dipakai ketika hanya jadwal pengambilan yang perlu diingatkan.</small></div><button type="button" class="btn small ghost" id="resetWhatsappReminderPickup">Kembalikan default</button></div>
        <textarea id="fWhatsappReminderPickup" rows="11" spellcheck="false">${escapeHtml(reminderPickupTemplate)}</textarea>
      </section>
      <section class="settings-whatsapp-card">
        <div class="settings-whatsapp-heading"><div><b>Pengingat hanya pembayaran</b><small>Dipakai ketika hanya sisa pembayaran yang perlu diingatkan.</small></div><button type="button" class="btn small ghost" id="resetWhatsappReminderPayment">Kembalikan default</button></div>
        <textarea id="fWhatsappReminderPayment" rows="11" spellcheck="false">${escapeHtml(reminderPaymentTemplate)}</textarea>
        <div class="settings-whatsapp-help settings-whatsapp-help--compact"><p>Tulis kalimat biasa secara langsung. Gunakan rumus berikut hanya untuk data yang berubah otomatis.</p><div class="settings-whatsapp-help-label">Data pengingat</div><div class="settings-whatsapp-chips"><code>{{pelanggan}}</code><code>{{toko}}</code><code>{{invoice}}</code><code>{{tanggal}}</code><code>{{sisa}}</code></div></div>
      </section>
      <button class="btn" id="saveWhatsappTemplates">Simpan Format WhatsApp</button>
    </div>`;
  const shareInput = root.querySelector('#fWhatsappTemplate');
  const shareProductInput = root.querySelector('#fWhatsappProductTemplate');
  const reminderBothInput = root.querySelector('#fWhatsappReminderBoth');
  const reminderPickupInput = root.querySelector('#fWhatsappReminderPickup');
  const reminderPaymentInput = root.querySelector('#fWhatsappReminderPayment');
  root.querySelector('#resetWhatsappShare').onclick = () => {
    shareInput.value = DEFAULT_WHATSAPP_SHARE_MAIN_TEMPLATE;
    shareProductInput.value = DEFAULT_WHATSAPP_SHARE_PRODUCT_TEMPLATE;
  };
  root.querySelector('#resetWhatsappReminderBoth').onclick = () => { reminderBothInput.value = DEFAULT_WHATSAPP_REMINDER_BOTH_TEMPLATE; };
  root.querySelector('#resetWhatsappReminderPickup').onclick = () => { reminderPickupInput.value = DEFAULT_WHATSAPP_REMINDER_PICKUP_TEMPLATE; };
  root.querySelector('#resetWhatsappReminderPayment').onclick = () => { reminderPaymentInput.value = DEFAULT_WHATSAPP_REMINDER_PAYMENT_TEMPLATE; };
  const saveWhatsappTemplates = async () => {
    const whatsappShareTemplate = shareInput.value.trim() || DEFAULT_WHATSAPP_SHARE_MAIN_TEMPLATE;
    const whatsappShareProductTemplate = shareProductInput.value.trim() || DEFAULT_WHATSAPP_SHARE_PRODUCT_TEMPLATE;
    const whatsappReminderBothTemplate = reminderBothInput.value.trim() || DEFAULT_WHATSAPP_REMINDER_BOTH_TEMPLATE;
    const whatsappReminderPickupTemplate = reminderPickupInput.value.trim() || DEFAULT_WHATSAPP_REMINDER_PICKUP_TEMPLATE;
    const whatsappReminderPaymentTemplate = reminderPaymentInput.value.trim() || DEFAULT_WHATSAPP_REMINDER_PAYMENT_TEMPLATE;
    shareInput.value = whatsappShareTemplate;
    shareProductInput.value = whatsappShareProductTemplate;
    reminderBothInput.value = whatsappReminderBothTemplate;
    reminderPickupInput.value = whatsappReminderPickupTemplate;
    reminderPaymentInput.value = whatsappReminderPaymentTemplate;
    await saveSettings({ whatsappShareTemplate, whatsappShareProductTemplate, whatsappReminderBothTemplate, whatsappReminderPickupTemplate, whatsappReminderPaymentTemplate });
    toast('Format WhatsApp disimpan');
  };
  root.querySelector('#saveWhatsappTemplatesTop').onclick = saveWhatsappTemplates;
  root.querySelector('#saveWhatsappTemplates').onclick = saveWhatsappTemplates;
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
    <div class="section-title">Tampilkan Nama Toko</div>
    <div class="settings-store-name-options">
      <label class="settings-store-name-toggle">
        <div><div class="settings-label">Detail nota &amp; file</div><div class="row-meta">Termasuk gambar, PDF, dan teks yang dibagikan.</div></div>
        <input class="settings-checkbox" id="showStoreNameOnReceipt" type="checkbox" ${s.showStoreNameOnReceipt !== false ? 'checked' : ''}>
      </label>
      <label class="settings-store-name-toggle">
        <div><div class="settings-label">Printer Bluetooth</div><div class="row-meta">Termasuk preview sebelum dicetak.</div></div>
        <input class="settings-checkbox" id="showStoreNameOnBluetooth" type="checkbox" ${s.showStoreNameOnBluetooth !== false ? 'checked' : ''}>
      </label>
    </div>
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
      showStoreNameOnReceipt: root.querySelector('#showStoreNameOnReceipt').checked,
      showStoreNameOnBluetooth: root.querySelector('#showStoreNameOnBluetooth').checked,
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
      await saveSettings({ autoBackup: { ...latest.autoBackup, backupSizeBytes: blob.size, lastBackupAt: new Date().toISOString(), lastBackupError: '' } });
      toast('Cadangan diunduh');
    } catch (e) { toast('Gagal membuat cadangan.'); }
  };

  root.querySelector('#btnRestore').onclick = () => root.querySelector('#fileRestore').click();
  root.querySelector('#fileRestore').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const comparison = await compareBackupFile(file);
      const c = comparison.counts;
      const confirmed = await confirmDialog({
        title: 'Periksa sebelum memulihkan',
        message: `File "${file.name}" berisi ${comparison.backupTotal} data, sedangkan perangkat ini memiliki ${comparison.localTotal} data.\n\nNota: ${c.sales.local} → ${c.sales.backup}\nProduk: ${c.products.local} → ${c.products.backup}\nPelanggan: ${c.customers.local} → ${c.customers.backup}\nPengeluaran: ${c.expenses.local} → ${c.expenses.backup}\n\nData lokal akan DIGANTI dengan isi file backup.`,
        confirmLabel: 'Ya, Pulihkan Data', dangerous: true,
      });
      e.target.value = '';
      if (!confirmed) return;
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
  const initialSyncPending = cfg.driveConnected && (hasInitialSyncPending() || Boolean(loginMessage));

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

  const sharedSyncActive = cfg.syncMode === 'shared' && cfg.sharedSyncFileId;
  const sharedSyncCode = sharedSyncActive ? drive.createSharedSyncCode(cfg.sharedSyncFileId) : '';
  const sharedSyncPickerReady = drive.isSharedSyncPickerConfigured();
  const sharedSyncControls = sharedSyncActive ? `
    <div class="settings-shared-sync" data-active="true">
      <div class="settings-shared-sync-title"><span>Ruang Sinkron Bersama</span><span class="settings-experimental-badge">UJI COBA</span></div>
      <div class="settings-shared-space-summary">
        <small>Ruang aktif</small><b>${escapeHtml(cfg.sharedSyncName || 'Ruang bersama')}</b>
        <span>Data lokal perangkat ini disinkronkan dengan anggota ruang.</span>
      </div>
      <div class="settings-shared-guide"><b>Cara mengundang:</b><span>1. Masukkan email Google yang terlihat di perangkat anggota.</span><span>2. Tekan “Undang + Salin”.</span><span>3. Kirim kode yang sudah disalin kepada anggota.</span></div>
      <label class="settings-shared-field"><span>Email Google anggota</span>
        <div><input id="sharedMemberEmail" type="email" autocomplete="email" maxlength="254" placeholder="nama@gmail.com"><button type="button" class="settings-button btn small secondary" id="btnInviteSharedMember">Undang + Salin</button></div>
      </label>
      <label class="settings-shared-field"><span>Kode ruang</span>
        <div><input id="sharedSyncCodeDisplay" value="${escapeHtml(sharedSyncCode)}" readonly><button type="button" class="settings-button btn small secondary" id="btnCopySharedCode">Salin lagi</button></div>
      </label>
      <button type="button" class="settings-shared-leave" id="btnLeaveSharedSpace">Kembali ke sinkron personal</button>
    </div>` : `
    <div class="settings-shared-sync">
      <div class="settings-shared-sync-title"><span>Ruang Sinkron Bersama</span><span class="settings-experimental-badge">UJI COBA</span></div>
      <p>Akun Google berbeda dapat memakai satu file sinkron. Pemilik membuat ruang dan mengundang email anggota; anggota lalu menempel kode ruang.</p>
      <label class="settings-shared-field"><span>Buat ruang baru</span>
        <div><input id="sharedSpaceName" maxlength="60" placeholder="Contoh: Toko Pusat"><button type="button" class="settings-button btn small secondary" id="btnCreateSharedSpace" ${cfg.driveConnected ? '' : 'disabled'}>Buat</button></div>
      </label>
      <div class="settings-shared-member-hint">Akun yang harus diundang pemilik: <b>${escapeHtml(cfg.driveAccountEmail || 'hubungkan Google Drive dahulu')}</b></div>
      ${sharedSyncPickerReady ? '<div class="settings-shared-picker-ready">Saat bergabung, pilih file <b>NotaKu Sync</b> yang dibagikan pemilik.</div>' : '<div class="settings-shared-picker-warning">Google Picker belum dikonfigurasi oleh pengelola aplikasi. Isi <code>GOOGLE_PICKER_API_KEY</code> agar akun berbeda dapat memilih file bersama.</div>'}
      <label class="settings-shared-field"><span>Tempel kode dari pemilik</span>
        <div><input id="sharedJoinCode" autocomplete="off" placeholder="NK1.xxxxx"><button type="button" class="settings-button btn small secondary" id="btnJoinSharedSpace" ${cfg.driveConnected ? '' : 'disabled'}>Gabung</button></div>
      </label>
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
        <div class="backup-info-text autobackup-info-text" data-autobackup-info-panel="drive" hidden>Mode personal memakai akun Google yang sama di semua perangkat. Ruang Sinkron Bersama dapat dipakai secara opsional untuk akun berbeda. Tambahan dari setiap perangkat tetap digabung otomatis.</div>
        <div class="settings-sync-account" id="syncAccountStatus" role="status" aria-live="polite" aria-atomic="true">
          ${cfg.driveConnected
            ? `<span class="settings-drive-status-dot" aria-hidden="true"></span><span><b>${cfg.lastSyncAt ? 'Tersinkron' : 'Terhubung'}</b> · ${escapeHtml(cfg.driveAccountEmail || 'akun Google')}</span>`
            : '<span class="row-meta">Akun Google belum terhubung</span>'}
          ${cfg.lastSyncAt ? `<small>Terakhir sinkron: ${formatSyncDate(cfg.lastSyncAt)}</small>` : '<small>Belum pernah sinkron</small>'}
          <small>ID perangkat: ${escapeHtml(drive.getDeviceSyncLabel())}</small>
        </div>
        ${sharedSyncControls}
        <button class="settings-sync-now btn" id="btnSyncNow" ${cfg.driveConnected ? '' : 'disabled'}>Sinkron sekarang</button>
        <label class="settings-sync-interval"><span>Interval sinkron</span>
          <select id="autoSyncInterval">
            ${[1, 5, 10, 15, 30].map((minutes) => `<option value="${minutes}" ${(cfg.autoSyncIntervalMinutes || 5) === minutes ? 'selected' : ''}>Tiap ${minutes} menit</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="settings-sync-status" id="syncStatus">Memeriksa status...</div>
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
      setInitialSyncPending(true);
      const email = await drive.connectAccount();
      toast(`Tersambung sebagai ${email}`);
      await saveAutoBackupForm(root);
      await runInitialConnectedSync(root, drive);
    } catch (e) { toast(e.message || 'Gagal menghubungkan akun Google.'); }
  };

  root.querySelector('#btnCreateSharedSpace')?.addEventListener('click', async () => {
    const name = root.querySelector('#sharedSpaceName').value.trim();
    if (!name) { toast('Isi nama ruang sinkron terlebih dahulu'); return; }
    setBackupLoading(true, 'Membuat ruang sinkron bersama…');
    try {
      const result = await drive.createSharedSyncSpace(name);
      toast(`Ruang “${result.name}” berhasil dibuat`);
      await renderAutoBackup(root);
    } catch (error) {
      setBackupLoading(false);
      await alertDialog({ title: 'Ruang Gagal Dibuat', message: error.message || 'Ruang sinkron belum berhasil dibuat.' });
    } finally { setBackupLoading(false); }
  });

  root.querySelector('#btnJoinSharedSpace')?.addEventListener('click', async () => {
    const code = root.querySelector('#sharedJoinCode').value.trim();
    if (!code) { toast('Masukkan kode ruang sinkron'); return; }
    const confirmed = await confirmDialog({
      title: 'Gabung ruang bersama?',
      message: 'Data pada perangkat ini dan data ruang bersama akan digabung otomatis. Pastikan pemilik sudah mengundang email Google yang sedang terhubung.',
      confirmLabel: 'Gabung & Sinkronkan',
    });
    if (!confirmed) return;
    try {
      if (drive.isSharedSyncPickerConfigured()) {
        toast('Pilih file NotaKu Sync yang dibagikan pemilik');
        await drive.authorizeSharedSyncFile(code);
      }
      setBackupLoading(true, 'Membuka dan menggabungkan ruang sinkron…');
      const result = await drive.joinSharedSyncSpace(code);
      toast(`Berhasil bergabung ke “${result.name}”`);
      await renderAutoBackup(root);
    } catch (error) {
      setBackupLoading(false);
      await alertDialog({ title: 'Tidak Dapat Bergabung', message: error.message || 'Kode atau izin ruang sinkron belum sesuai.' });
    } finally { setBackupLoading(false); }
  });

  root.querySelector('#btnCopySharedCode')?.addEventListener('click', async () => {
    const input = root.querySelector('#sharedSyncCodeDisplay');
    try {
      await navigator.clipboard.writeText(input.value);
      toast('Kode ruang disalin');
    } catch {
      input.select();
      document.execCommand('copy');
      toast('Kode ruang disalin');
    }
  });

  root.querySelector('#btnInviteSharedMember')?.addEventListener('click', async () => {
    const emailInput = root.querySelector('#sharedMemberEmail');
    const email = emailInput.value.trim();
    if (!email) { toast('Masukkan email anggota'); return; }
    setBackupLoading(true, 'Mengirim undangan ruang sinkron…');
    try {
      const result = await drive.inviteSharedSyncMember(email);
      let copied = false;
      try {
        await navigator.clipboard.writeText(result.code);
        copied = true;
      } catch { /* Kode tetap terlihat dan dapat disalin manual. */ }
      emailInput.value = '';
      setBackupLoading(false);
      await alertDialog({
        title: 'Undangan Siap',
        message: `${email} sudah diberi akses Editor.\n\n${copied ? 'Kode ruang sudah disalin. Kirim atau tempelkan kode itu di perangkat anggota.' : `Salin kode ruang berikut lalu kirim ke anggota:\n${result.code}`}`,
        okLabel: 'Mengerti',
      });
    } catch (error) {
      setBackupLoading(false);
      await alertDialog({ title: 'Undangan Gagal', message: error.message || 'Email belum berhasil diundang.' });
    } finally { setBackupLoading(false); }
  });

  root.querySelector('#btnLeaveSharedSpace')?.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Kembali ke sinkron personal?',
      message: 'File ruang bersama tidak dihapus dan data yang sudah ada di perangkat tetap tersimpan. Sinkron berikutnya akan kembali memakai file personal akun ini.',
      confirmLabel: 'Kembali ke Personal',
    });
    if (!confirmed) return;
    await drive.leaveSharedSyncSpace();
    toast('Mode sinkron personal aktif');
    await renderAutoBackup(root);
  });

  for (const id of ['backupWindowStart', 'backupWindowEnd', 'backupDailyLimit', 'backupKeepCount']) {
    root.querySelector(`#${id}`).onchange = () => saveAutoBackupForm(root);
  }

  root.querySelector('#btnBackupNow').onclick = async () => {
    if (!cfg.driveConnected) { toast('Hubungkan akun Google Drive dulu'); return; }
    setBackupLoading(true, 'Membuat dan mengunggah backup ke Google Drive…');
    try {
      await drive.runBackupNow();
      toast('Backup berhasil diunggah ke Drive');
      await renderAutoBackup(root);
    } catch (e) {
      setBackupLoading(false);
      await alertDialog({ title: 'Backup Gagal', message: (e.message || 'Terjadi kesalahan.') + '\n\nLihat docs/DRIVE_SETUP.md bagian Troubleshooting untuk arti pesan ini.' });
    } finally {
      setBackupLoading(false);
    }
  };

  if (initialSyncPending) setTimeout(() => runInitialConnectedSync(root, drive), 0);
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
    <small>Mode: ${state.syncMode === 'shared' ? `Ruang bersama · ${escapeHtml(state.sharedSyncName || 'Tanpa nama')}` : 'Personal'}</small>
    <small>Terakhir sinkron: ${state.lastSyncAt ? formatSyncDate(state.lastSyncAt) : 'Belum pernah sinkron'}</small>
    <small>ID perangkat: ${escapeHtml(state.deviceSyncId || '-')}</small>
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
