import { rupiah, dateShort, escapeHtml } from '../format.js';

const series = [
  { key: 'revenue', label: 'Nilai nota', color: '#8d2947' },
  { key: 'received', label: 'Pembayaran tercatat', color: '#398178' },
  { key: 'expenses', label: 'Pengeluaran', color: '#d68b3b' },
];

export function dailyChart(days, { compact = false, dateBasis = 'pickup', periodLabel = '' } = {}) {
  const visible = compact ? series.slice(0, 2) : series;
  const max = Math.max(0, ...days.flatMap(d => visible.map(s => d[s.key])));
  const ceiling = max > 0 ? Math.ceil(max / 10 ** Math.floor(Math.log10(max))) * 10 ** Math.floor(Math.log10(max)) : 1;
  const detail = d => `${dateShort(d.date)} · ${d.count} nota · ${visible.map(s => `${s.label}: ${rupiah(d[s.key])}`).join(' · ')}`;
  return `<section class="business-chart"><div class="business-chart-heading"><h3>Aktivitas per tanggal</h3><p>${periodLabel ? `${escapeHtml(periodLabel)}<br>` : ''}${dateBasis === 'created' ? 'Nominal yang tercantum mengikuti tanggal pembuatan Nota' : 'Nilai nota mengikuti tanggal pengambilan.'}</p></div>
    <div class="business-legend">${visible.map(s => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join('')}</div>
    ${max ? '' : '<p class="business-chart-empty">Belum ada nilai transaksi pada periode ini.</p>'}
    <div class="business-plot"><div class="business-axis"><span>${max ? compactMoney(ceiling) : 'Rp0'}</span><span>${max ? compactMoney(ceiling / 2) : ''}</span><span>0</span></div>
      <div class="business-bars-scroll"><div class="business-bars" style="--day-count:${Math.max(1, days.length)}">${days.map(d => `<button type="button" class="business-day" data-chart-detail="${escapeHtml(detail(d))}" aria-label="${escapeHtml(detail(d))}"><span class="business-columns">${visible.map(s => `<span style="height:${Math.max(0, d[s.key]) / ceiling * 100}%;background:${s.color}"></span>`).join('')}</span><span class="business-day-label">${d.date.slice(8)}/${d.date.slice(5, 7)}</span></button>`).join('')}</div></div></div>
    <p class="business-chart-detail" aria-live="polite">Ketuk batang untuk melihat nominal.</p>
    <p class="business-chart-note">Pembayaran lunas otomatis saat pengambilan, dan pengeluaran dicatat sesuai tanggal transaksi.</p></section>`;
}

export function statusChart(counts) {
  const statuses = [['PAID', 'Lunas', '#398178'], ['PARTIAL', 'Sebagian', '#d68b3b'], ['UNPAID', 'Belum lunas', '#b43d5c'], ['OVERPAID', 'Lebih bayar', '#8270ae']];
  const total = statuses.reduce((sum, [key]) => sum + counts[key], 0);
  let angle = 0;
  const stops = statuses.map(([key, , color]) => {
    const start = angle;
    angle += total ? counts[key] / total * 360 : 0;
    return `${color} ${start}deg ${angle}deg`;
  });
  return `<section class="business-chart"><div class="business-chart-heading"><h3>Status pembayaran</h3><p>Jumlah nota pada periode yang dipilih.</p></div><div class="business-donut-layout"><div class="business-donut" role="img" aria-label="${escapeHtml(statuses.map(([key, label]) => `${label}: ${counts[key]} nota`).join(', '))}" style="background:${total ? `conic-gradient(${stops.join(',')})` : '#e6d8d4'}"><div><strong>${total}</strong><span>nota</span></div></div><div class="business-status-list">${statuses.map(([key, label, color]) => `<div><span><i style="background:${color}"></i>${label}</span><strong>${counts[key]} <small>(${total ? Math.round(counts[key] / total * 100) : 0}%)</small></strong></div>`).join('')}</div></div></section>`;
}

export function wireBusinessCharts(root) {
  root.querySelectorAll('[data-chart-detail]').forEach(button => {
    button.onclick = () => {
      const chart = button.closest('.business-chart');
      chart.querySelectorAll('[data-chart-detail]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      chart.querySelector('.business-chart-detail').textContent = button.dataset.chartDetail;
    };
  });
}

function compactMoney(value) {
  if (value >= 1e9) return `${Number((value / 1e9).toFixed(1))} M`;
  if (value >= 1e6) return `${Number((value / 1e6).toFixed(1))} jt`;
  if (value >= 1e3) return `${Number((value / 1e3).toFixed(1))} rb`;
  return String(Math.round(value));
}
