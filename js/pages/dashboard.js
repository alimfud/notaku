import { getAllSaleSummaries } from '../services/saleService.js';
import { getSettings } from '../services/settingsService.js';
import { generateReport } from '../services/reportService.js';
import { dailyChart, wireBusinessCharts } from '../ui/businessCharts.js';
import { rupiah, dateShort, escapeHtml, initials } from '../format.js';
import { STATUS_LABEL } from '../services/saleCalculation.js';
import { navigate, setPageTitle, setTopbarActions } from '../app.js';

export async function render(root) {
  setPageTitle('NotaKu');
  setTopbarActions([]);
  const [summaries, settings, report, orders] = await Promise.all([getAllSaleSummaries(), getSettings(), generateReport('week'), generateReport('orders-last7')]);
  if (root.dataset.page !== 'dashboard') return;
  const { start, end } = report;
  const periodLabel = `${dateShort(start)} – ${dateShort(end)}`;
  const orderPeriodLabel = `${dateShort(orders.start)} – ${dateShort(orders.end)}`;
  const pending = summaries.filter(({ sale }) => !sale.completed);
  const pickupThisWeek = pending.filter(({ sale }) => sale.saleDate >= start && sale.saleDate <= end);
  const upcoming = [...pickupThisWeek].sort((a, b) => (a.sale.saleDate + a.sale.saleTime).localeCompare(b.sale.saleDate + b.sale.saleTime)).slice(0, 5);
  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam';
  root.innerHTML = `
    <div class="dashboard-heading"><div><p class="dashboard-kicker">${escapeHtml(settings.storeName || 'Toko Saya')}</p><h2>${greeting}!</h2><p class="dashboard-date">${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p></div><button class="dashboard-primary-action" data-go="sale/new"><span>+</span> Nota baru</button></div>
    <div class="dashboard-overview">
      <section class="dashboard-hero"><div class="dashboard-label">Nilai pesanan</div><small class="dashboard-period">7 hari terakhir · ${orderPeriodLabel}</small><div class="dashboard-revenue">${rupiah(orders.revenue)}</div><div class="dashboard-hero-bottom"><div><span>Nota dibuat</span><strong>${orders.transactionCount} nota</strong></div><div><span>Pembayaran masuk</span><strong>${rupiah(orders.received)}</strong></div></div></section>
      <section class="dashboard-attention"><div class="dashboard-card-heading"><div><span>RINGKASAN</span><h3>Perlu perhatian</h3></div><small>${periodLabel}</small></div><button data-go="home"><span><b>Jadwal pengambilan</b><small>Pesanan belum selesai</small></span><strong>${pickupThisWeek.length}<i>›</i></strong></button><button data-go="reports"><span><b>Belum lunas</b><small>Piutang pada periode ini</small></span><strong>${rupiah(report.totalReceivables)}<i>›</i></strong></button></section>
    </div>
    <div class="dashboard-section"><h3>Akses cepat</h3></div>
    <div class="dashboard-shortcuts">${[['customers','Pelanggan','users'],['expenses','Pengeluaran','wallet'],['reports','Laporan','chart'],['settings','Pengaturan','settings']].map(([route, label, icon]) => `<button data-go="${route}"><span class="dashboard-shortcut-icon">${shortcutIcon(icon)}</span>${label}</button>`).join('')}</div>
    
	
    
	<div class="dashboard-section-row"><div><h3>Jadwal pengambilan</h3></div><button data-go="home">Lihat semua <i>›</i></button></div>
    <div class="dashboard-orders">${upcoming.length ? upcoming.map(s => `<button class="row" data-go="sale/${escapeHtml(s.sale.id)}"><span class="avatar">${escapeHtml(initials(s.sale.customerName))}</span><span class="row-body"><span class="row-title">${escapeHtml(s.sale.customerName)}</span><span class="row-meta">${escapeHtml(s.sale.invoiceNumber)} · ${dateShort(s.sale.saleDate)} ${escapeHtml(s.sale.saleTime || '')}</span></span><span class="row-trailing"><span class="row-money">${rupiah(s.sale.total)}</span><span class="payment-badge" data-status="${s.displayStatus}">${STATUS_LABEL[s.displayStatus]}</span></span><span class="dashboard-row-arrow" aria-hidden="true">›</span></button>`).join('') : '<div class="empty-state"><p>Belum ada jadwal pengambilan mendatang.<br>Mulai dengan membuat nota baru.</p></div>'}</div>
	
	${dailyChart(orders.daily, { compact: true, dateBasis: 'created', periodLabel: orderPeriodLabel })}
  `;
  root.querySelectorAll('[data-go]').forEach(button => button.onclick = () => navigate(button.dataset.go));
  wireBusinessCharts(root);
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
