import { getAllSaleSummaries } from '../services/saleService.js';
import { getSettings } from '../services/settingsService.js';
import { getAll } from '../db.js';
import { rupiah, todayDbDate, dateShort, escapeHtml, initials, dbDate } from '../format.js';
import { STATUS_LABEL } from '../services/saleCalculation.js';
import { navigate, setPageTitle, setTopbarActions } from '../app.js';

export async function render(root) {
  setPageTitle('NotaKu');
  setTopbarActions([]);
  const [summaries, settings, payments] = await Promise.all([getAllSaleSummaries(), getSettings(), getAll('payments')]);
  if (root.dataset.page !== 'dashboard') return;
  const today = todayDbDate();
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const periodStart = dbDate(sevenDaysAgo);
  const sevenDaysAhead = new Date();
  sevenDaysAhead.setDate(sevenDaysAhead.getDate() + 6);
  const periodEnd = dbDate(sevenDaysAhead);
  const periodStartMs = new Date(periodStart + 'T00:00:00').getTime();
  const periodSales = summaries.filter(({ sale }) => {
    const createdMs = new Date(sale.createdAt || `${sale.saleDate}T${sale.saleTime || '00:00'}`).getTime();
    return createdMs >= periodStartMs && createdMs <= Date.now();
  });
  const activeIds = new Set(summaries.map(({ sale }) => sale.id));
  const received = payments.filter(p => p.paymentDate >= periodStart && p.paymentDate <= today && activeIds.has(p.saleId)).reduce((sum, p) => sum + p.amount, 0);
  const pending = summaries.filter(({ sale }) => !sale.completed);
  const pickupThisWeek = pending.filter(({ sale }) => sale.saleDate >= today && sale.saleDate <= periodEnd);
  const receivables = pickupThisWeek.filter(s => !['PAID', 'OVERPAID'].includes(s.displayStatus)).reduce((sum, s) => sum + Math.max(0, s.remaining), 0);
  const upcoming = pending.filter(({ sale }) => sale.saleDate >= today).sort((a, b) => (a.sale.saleDate + a.sale.saleTime).localeCompare(b.sale.saleDate + b.sale.saleTime)).slice(0, 5);
  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam';
  root.innerHTML = `
    <div class="dashboard-heading"><div><p class="dashboard-kicker">${escapeHtml(settings.storeName || 'Toko Saya')}</p><h2>${greeting}!</h2><p class="dashboard-date">${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p></div><button class="btn small" data-go="sale/new">+ Buat nota</button></div>
    <div class="dashboard-overview">
      <section class="dashboard-hero"><div class="dashboard-label">Penjualan 7 hari terakhir</div><div class="dashboard-revenue">${rupiah(periodSales.reduce((sum, s) => sum + s.sale.total, 0))}</div><div class="dashboard-hero-bottom"><div><span>Nota 7 hari</span><strong>${periodSales.length} nota</strong></div><div><span>Pembayaran 7 hari</span><strong>${rupiah(received)}</strong></div></div></section>
      <section class="dashboard-attention"><h3>Perlu perhatian</h3><button data-go="home"><span>Pengambilan 7 hari<small>Hari ini sampai 6 hari ke depan</small></span><strong>${pickupThisWeek.length}</strong></button><button data-go="reports"><span>Belum lunas 7 hari<small>Sisa tagihan jadwal tersebut</small></span><strong>${rupiah(receivables)}</strong></button></section>
    </div>
    <h3 class="dashboard-section">Akses cepat</h3>
    <div class="dashboard-shortcuts">${[['customers','Pelanggan','users'],['expenses','Pengeluaran','wallet'],['reports','Laporan','chart'],['settings','Pengaturan','settings']].map(([route, label, icon]) => `<button data-go="${route}"><span class="dashboard-shortcut-icon">${shortcutIcon(icon)}</span>${label}</button>`).join('')}</div>
    <div class="dashboard-section-row"><h3>Jadwal pengambilan</h3><button data-go="home">Semua nota →</button></div>
    <div class="dashboard-orders">${upcoming.length ? upcoming.map(s => `<button class="row" data-go="sale/${escapeHtml(s.sale.id)}"><span class="avatar">${escapeHtml(initials(s.sale.customerName))}</span><span class="row-body"><span class="row-title">${escapeHtml(s.sale.customerName)}</span><span class="row-meta">${escapeHtml(s.sale.invoiceNumber)} · ${dateShort(s.sale.saleDate)} ${escapeHtml(s.sale.saleTime || '')}</span></span><span class="row-trailing"><span class="row-money">${rupiah(s.sale.total)}</span><span class="payment-badge" data-status="${s.displayStatus}">${STATUS_LABEL[s.displayStatus]}</span></span></button>`).join('') : '<div class="empty-state"><p>Belum ada jadwal pengambilan mendatang.<br>Mulai dengan membuat nota baru.</p></div>'}</div>
  `;
  root.querySelectorAll('[data-go]').forEach(button => button.onclick = () => navigate(button.dataset.go));
}

function shortcutIcon(name) {
  const paths = {
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
    wallet: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 8h18M16 13h5M16 16h1"/>',
    chart: '<path d="M4 20V10M12 20V4M20 20v-7"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">${paths[name]}</svg>`;
}
