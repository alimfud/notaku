import { getAllSaleSummaries } from '../services/saleService.js';
import { getSettings } from '../services/settingsService.js';
import { generateReport, generateAnnualTrend } from '../services/reportService.js';
import { dailyChart, wireBusinessCharts } from '../ui/businessCharts.js';
import { rupiah, dateShort, escapeHtml, initials } from '../format.js';
import { STATUS_LABEL } from '../services/saleCalculation.js';
import { navigate, setPageTitle, setTopbarActions } from '../app.js';

export async function render(root) {
  setPageTitle('NotaKu');
  setTopbarActions([]);
  const [summaries, settings, report, orders, annual] = await Promise.all([getAllSaleSummaries(), getSettings(), generateReport('week'), generateReport('orders-last7'), generateAnnualTrend()]);
  if (root.dataset.page !== 'dashboard') return;
  const { start, end } = report;
  const periodLabel = `${dateShort(start)} – ${dateShort(end)}`;
  const orderPeriodLabel = `${dateShort(orders.start)} – ${dateShort(orders.end)}`;
  const pending = summaries.filter(({ sale }) => !sale.completed);
  const pickupThisWeek = pending.filter(({ sale }) => sale.saleDate >= start && sale.saleDate <= end);
  const upcoming = [...pickupThisWeek].sort((a, b) => (a.sale.saleDate + a.sale.saleTime).localeCompare(b.sale.saleDate + b.sale.saleTime)).slice(0, 5);
  const pickupCountText = numberToIndonesian(pickupThisWeek.length);
  const pickupShowArrow = pickupCountText.length <= 8;
  const unpaidValue = rupiah(report.totalReceivables);
  const unpaidShowArrow = unpaidValue.length < 10;
  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam';
  root.innerHTML = `
    <div class="dashboard-heading"><div><p class="dashboard-kicker">${escapeHtml(settings.storeName || 'Toko Saya')}</p><h2>${greeting}!</h2><p class="dashboard-date">${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p></div><button class="dashboard-primary-action" data-go="sale/new"><span>+</span> Nota baru</button></div>
    <div class="dashboard-overview">
      <section class="dashboard-hero"><div class="dashboard-label">Nilai pesanan</div><small class="dashboard-period">7 hari terakhir · ${orderPeriodLabel}</small><div class="dashboard-revenue">${rupiah(orders.revenue)}</div>${annualMiniChart(annual)}<div class="dashboard-hero-bottom"><div><span>Nota dibuat</span><strong>${orders.transactionCount} nota</strong></div><div><span>Pembayaran masuk</span><strong>${rupiah(orders.received)}</strong></div></div></section>
      <section class="dashboard-attention"><div class="dashboard-card-heading"><div><span>PERLU PERHATIAN </span></div><small>${periodLabel}</small></div><div class="dashboard-attention-list"><div class="dashboard-attention-item dashboard-attention-item--pickup"><span class="dashboard-attention-icon" aria-hidden="true">${shortcutIcon('calendar')}</span><span class="dashboard-attention-copy"><b>Jadwal Pickup</b><small>Pesanan akan diambil</small></span><button class="dashboard-attention-action" data-go="home/pickup" aria-label="Buka Jadwal Pickup"><strong>${pickupCountText}${pickupShowArrow ? '<i aria-hidden="true">›</i>' : ''}</strong></button></div><div class="dashboard-attention-item dashboard-attention-item--unpaid"><span class="dashboard-attention-icon" aria-hidden="true">${shortcutIcon('wallet')}</span><span class="dashboard-attention-copy"><b>Belum Lunas</b><small>Piutang periode ini</small></span><button class="dashboard-attention-action" data-go="home/unpaid" aria-label="Buka daftar Belum Lunas"><strong>${unpaidValue}${unpaidShowArrow ? '<i aria-hidden="true">›</i>' : ''}</strong></button></div></div></section>
    </div>
    <div class="dashboard-section"><h3>Akses cepat</h3></div>
    <div class="dashboard-shortcuts">${[['customers','Pelanggan','users'],['expenses','Pengeluaran','wallet'],['reports','Laporan','chart'],['settings','Lainnya','settings']].map(([route, label, icon]) => `<button data-go="${route}"><span class="dashboard-shortcut-icon">${shortcutIcon(icon)}</span>${label}</button>`).join('')}</div>
    
	
    
	<div class="dashboard-section-row"><div><h3>Jadwal pengambilan</h3></div><button data-go="home">Lihat semua <i>›</i></button></div>
    <div class="dashboard-orders">${upcoming.length ? upcoming.map(s => `<button class="row" data-go="sale/${escapeHtml(s.sale.id)}"><span class="avatar"><span>${escapeHtml(initials(s.sale.customerName))}</span></span><span class="row-body"><span class="row-title">${escapeHtml(s.sale.customerName)}</span>${s.sale.customerAddress?.trim() ? `<span class="nota-address">${escapeHtml(s.sale.customerAddress.trim())}</span>` : ''}<span class="row-meta"><span class="nota-date">${dateShort(s.sale.saleDate)} • ${escapeHtml(s.sale.saleTime || '')}</span> <span class="nota-invoice">• ${escapeHtml(s.sale.invoiceNumber)}</span></span></span><span class="row-trailing"><span class="row-money">${rupiah(s.sale.total)}</span><span class="payment-badge" data-status="${s.displayStatus}">${STATUS_LABEL[s.displayStatus]}</span></span></button>`).join('') : '<div class="empty-state"><p>Belum ada jadwal pengambilan mendatang.<br>Mulai dengan membuat nota baru.</p></div>'}</div>
	
	${dailyChart(orders.daily, { compact: true, dateBasis: 'created', periodLabel: orderPeriodLabel })}
  `;
  root.querySelectorAll('[data-go]').forEach(button => button.onclick = () => navigate(button.dataset.go));
  wireBusinessCharts(root);
}

function numberToIndonesian(value) {
  const number = Math.max(0, Math.floor(Number(value) || 0));
  if (number === 0) return 'nol';

  const smallNumbers = ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  const scales = ['', 'ribu', 'juta', 'miliar', 'triliun', 'kuadriliun'];
  const underThousand = (n) => {
    if (n < 12) return smallNumbers[n];
    if (n < 20) return `${smallNumbers[n - 10]} belas`;
    if (n < 100) return `${smallNumbers[Math.floor(n / 10)]} puluh${n % 10 ? ` ${underThousand(n % 10)}` : ''}`;
    if (n < 200) return `seratus${n % 100 ? ` ${underThousand(n % 100)}` : ''}`;
    return `${underThousand(Math.floor(n / 100))} ratus${n % 100 ? ` ${underThousand(n % 100)}` : ''}`;
  };

  const chunks = [];
  let remaining = number;
  let scaleIndex = 0;
  while (remaining > 0) {
    const chunk = remaining % 1000;
    if (chunk) {
      const words = scaleIndex === 1 && chunk === 1 ? 'seribu' : `${underThousand(chunk)}${scaleIndex ? ` ${scales[scaleIndex] || 'kuintiliun'}` : ''}`;
      chunks.unshift(words);
    }
    remaining = Math.floor(remaining / 1000);
    scaleIndex += 1;
  }
  return chunks.join(' ');
}

function annualMiniChart({ year, monthly }) {
  const keys = ['revenue', 'expenses', 'profit'];
  const values = monthly.flatMap((month) => keys.map((key) => month[key]));
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(1, ...values);
  const range = maximum - minimum || 1;
  const positiveMaximum = Math.max(1, ...monthly.flatMap((month) => [month.revenue, month.expenses, Math.max(0, month.profit)]));
  const pointsFor = (key) => monthly.map((month, index) => ({
    x: 5 + index * (190 / 11),
    // Pengeluaran nol harus tepat di baseline/pemisah bawah grafik.
    y: key === 'expenses'
      ? 78 - (Math.max(0, month.expenses) / positiveMaximum) * 68
      : 72 - ((month[key] - minimum) / range) * 62,
  }));
  const pathFor = (points) => {
    let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
    for (let index = 0; index < points.length - 1; index += 1) {
      const previous = points[Math.max(0, index - 1)];
      const current = points[index];
      const next = points[index + 1];
      const after = points[Math.min(points.length - 1, index + 2)];
      const control1X = current.x + (next.x - previous.x) / 6;
      const control1Y = current.y + (next.y - previous.y) / 6;
      const control2X = next.x - (after.x - current.x) / 6;
      const control2Y = next.y - (after.y - current.y) / 6;
      path += ` C ${control1X.toFixed(2)} ${control1Y.toFixed(2)}, ${control2X.toFixed(2)} ${control2Y.toFixed(2)}, ${next.x.toFixed(2)} ${next.y.toFixed(2)}`;
    }
    return path;
  };
  const series = keys.map((key, index) => {
    const points = pointsFor(key);
    const dots = points.map((point, month) => `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="${month === new Date().getMonth() ? '2.3' : '1.25'}"/>`).join('');
    return `<g class="dashboard-finance-series dashboard-finance-${key}" style="--series-delay:${index * 180}ms"><path d="${pathFor(points)}"/>${dots}</g>`;
  }).join('');
  const revenuePeak = Math.max(1, ...monthly.map((month) => month.revenue));
  const volume = monthly.map((month, index) => {
    const height = Math.max(3, month.revenue / revenuePeak * 27);
    const x = 5 + index * (190 / 11) - 3.5;
    const y = 77 - height;
    const right = x + 7;
    return `<g class="dashboard-finance-volume-column" style="--volume-delay:${index * 42}ms"><rect class="dashboard-volume-front" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="7" height="${height.toFixed(2)}"/><path class="dashboard-volume-top" d="M ${x.toFixed(2)} ${y.toFixed(2)} l 2.4 -2.4 h 7 l -2.4 2.4 z"/><path class="dashboard-volume-side" d="M ${right.toFixed(2)} ${y.toFixed(2)} l 2.4 -2.4 v ${height.toFixed(2)} l -2.4 2.4 z"/><circle class="dashboard-volume-spark" cx="${(x + 4.7).toFixed(2)}" cy="${(y - 3).toFixed(2)}" r="1.15" style="--spark-delay:${700 + index * 75}ms"/></g>`;
  }).join('');
  const revenue = monthly.reduce((sum, month) => sum + month.revenue, 0);
  const expenses = monthly.reduce((sum, month) => sum + month.expenses, 0);
  const profit = revenue - expenses;
  return `<div class="dashboard-annual-visual" role="img" aria-label="Grafik tahun ${year}. Pemasukan ${rupiah(revenue)}, pengeluaran ${rupiah(expenses)}, laba ${rupiah(profit)}"><svg class="dashboard-finance-lines" viewBox="0 0 200 80" preserveAspectRatio="none" aria-hidden="true"><g class="dashboard-finance-volume">${volume}</g><line class="dashboard-finance-floor" x1="0" y1="78" x2="200" y2="78"/>${series}</svg></div>`;
}

function shortcutIcon(name) {
  const paths = {
    users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
    wallet: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 8h18M16 13h5M16 16h1"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 9h18M8 3v4M16 3v4M8 13h3M8 17h6"/>',
    chart: '<path d="M4 20V10M12 20V4M20 20v-7"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">${paths[name]}</svg>`;
}
