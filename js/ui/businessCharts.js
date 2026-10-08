import { rupiah, dateShort, escapeHtml } from '../format.js';

const series = [
  { key: 'revenue', label: 'Nilai nota', color: '#ff9a3c' },
  { key: 'received', label: 'Pembayaran tercatat', color: '#2fe0b0' },
  { key: 'expenses', label: 'Pengeluaran', color: '#ff5d7a' },
];

function activityLinePath(days, key, ceiling) {
  if (!days.length) return '';
  const points = days.map((day, index) => ({
    x: (index + .5) / days.length * 100,
    y: 153 - Math.max(0, day[key]) / ceiling * 148,
  }));
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
}

function donutSegmentPath(outerRadius, innerRadius, startDegrees, endDegrees) {
  const center = 120;
  const point = (radius, degrees) => {
    const angle = (degrees - 90) * Math.PI / 180;
    return [center + radius * Math.cos(angle), center + radius * Math.sin(angle)];
  };
  if (endDegrees - startDegrees >= 359.9) {
    const outerTop = point(outerRadius, 0);
    const outerBottom = point(outerRadius, 180);
    const innerTop = point(innerRadius, 0);
    const innerBottom = point(innerRadius, 180);
    return `M ${outerTop[0]} ${outerTop[1]} A ${outerRadius} ${outerRadius} 0 1 1 ${outerBottom[0]} ${outerBottom[1]} A ${outerRadius} ${outerRadius} 0 1 1 ${outerTop[0]} ${outerTop[1]} L ${innerTop[0]} ${innerTop[1]} A ${innerRadius} ${innerRadius} 0 1 0 ${innerBottom[0]} ${innerBottom[1]} A ${innerRadius} ${innerRadius} 0 1 0 ${innerTop[0]} ${innerTop[1]} Z`;
  }
  const outerStart = point(outerRadius, startDegrees);
  const outerEnd = point(outerRadius, endDegrees);
  const innerEnd = point(innerRadius, endDegrees);
  const innerStart = point(innerRadius, startDegrees);
  const largeArc = endDegrees - startDegrees > 180 ? 1 : 0;
  return `M ${outerStart[0].toFixed(2)} ${outerStart[1].toFixed(2)} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd[0].toFixed(2)} ${outerEnd[1].toFixed(2)} L ${innerEnd[0].toFixed(2)} ${innerEnd[1].toFixed(2)} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart[0].toFixed(2)} ${innerStart[1].toFixed(2)} Z`;
}

function radialDailyChart(days, { visible, dateBasis, periodLabel, granularity }) {
  const totalNotes = days.reduce((sum, day) => sum + (Number(day.count) || 0), 0);
  const segmentAngle = 360 / Math.max(days.length, 1);
  const gap = days.length === 1 ? 0 : days.length > 24 ? .55 : days.length > 12 ? 1.1 : 2.2;
  const detailFor = (day) => `${granularity === 'month' ? day.label : dateShort(day.date)} · ${day.count} nota · ${visible.map(seriesItem => `${seriesItem.label}: ${rupiah(day[seriesItem.key])}`).join(' · ')}`;
  const monthLabel = (day) => new Date(`${day.date}T12:00:00`).toLocaleDateString('id-ID', { month: 'short' }).replace('.', '');
  const segmentMarkup = days.map((day, index) => {
    const start = -90 + index * segmentAngle + gap / 2;
    const end = -90 + (index + 1) * segmentAngle - gap / 2;
    const detail = detailFor(day);
    const revenueActive = day.revenue > 0;
    const paymentActive = day.received > 0;
    const label = days.length <= 16 ? (granularity === 'month' ? monthLabel(day) : day.date.slice(8)) : '';
    const labelAngle = -90 + (index + .5) * segmentAngle;
    const labelX = 120 + 113 * Math.cos(labelAngle * Math.PI / 180);
    const labelY = 120 + 113 * Math.sin(labelAngle * Math.PI / 180);
    const expenseActive = day.expenses > 0;
    return `<g class="business-radial-day" role="button" tabindex="0" aria-pressed="false" data-chart-detail="${escapeHtml(detail)}" aria-label="${escapeHtml(detail)}"><path class="business-radial-segment business-radial-segment--revenue ${revenueActive ? 'is-active' : ''}" d="${donutSegmentPath(99,81,start,end)}"/><path class="business-radial-segment business-radial-segment--received ${paymentActive ? 'is-active' : ''}" d="${donutSegmentPath(75,57,start,end)}"/><path class="business-radial-segment business-radial-segment--expenses ${expenseActive ? 'is-active' : ''}" d="${donutSegmentPath(51,33,start,end)}"/>${label ? `<text class="business-radial-label" x="${labelX.toFixed(2)}" y="${labelY.toFixed(2)}">${escapeHtml(label)}</text>` : ''}</g>`;
  }).join('');
  const notesText = `${totalNotes} nota`;
  return `<section class="business-chart business-chart--compact business-chart--radial"><div class="business-chart-heading"><h3>Aktivitas per ${granularity === 'month' ? 'bulan' : 'tanggal'}</h3><p>${periodLabel ? `${escapeHtml(periodLabel)}<br>` : ''}${dateBasis === 'created' ? '' : 'Nilai nota mengikuti tanggal pengambilan.'}</p></div>
    <div class="business-legend">${visible.map(item => `<span><i style="background:${item.color}"></i>${item.label}</span>`).join('')}</div>
    ${days.some(day => visible.some(item => day[item.key] > 0)) ? '' : '<p class="business-chart-empty">Belum ada transaksi atau pengeluaran pada periode ini.</p>'}
    <div class="business-radial-wrap"><svg class="business-radial-chart" viewBox="0 0 240 240" role="group" aria-label="Grafik aktivitas per tanggal berbentuk tiga cincin. Ketuk segmen untuk melihat rincian.">${segmentMarkup}<text class="business-radial-center-label" x="120" y="108">TOTAL NOTA</text><text class="business-radial-center-value" x="120" y="132">${totalNotes}</text><text class="business-radial-center-caption" x="120" y="147">${notesText}</text></svg></div>
    <p class="business-chart-detail" aria-live="polite">Ketuk segmen untuk melihat rincian tanggal.</p>
    <p class="business-chart-note">Cincin luar menunjukkan nilai nota, cincin tengah pembayaran tercatat, dan cincin dalam pengeluaran. ${dateBasis === 'created' ? 'Nilai nota dihitung dari tanggal nota dibuat.' : 'Nilai nota mengikuti tanggal pengambilan.'}</p></section>`;
}

export function dailyChart(days, { compact = false, dateBasis = 'pickup', periodLabel = '', granularity = 'day' } = {}) {
  const visible = series;
  if (compact) return radialDailyChart(days, { visible, dateBasis, periodLabel, granularity });
  const max = Math.max(0, ...days.flatMap(d => visible.map(s => d[s.key])));
  const ceiling = max > 0 ? Math.ceil(max / 10 ** Math.floor(Math.log10(max))) * 10 ** Math.floor(Math.log10(max)) : 1;
  const itemLabel = d => granularity === 'month' ? d.label : dateShort(d.date);
  const axisLabel = d => granularity === 'month' ? d.date.slice(5, 7) : `${d.date.slice(8)}/${d.date.slice(5, 7)}`;
  const detail = d => `${itemLabel(d)} · ${d.count} nota · ${visible.map(s => `${s.label}: ${rupiah(d[s.key])}`).join(' · ')}`;
  const linePaths = visible.map((item, index) => `<path d="${activityLinePath(days, item.key, ceiling)}" style="--activity-line:${item.color};--activity-delay:${index * 130}ms"/>`).join('');
  return `<section class="business-chart"><div class="business-chart-heading"><h3>Aktivitas per ${granularity === 'month' ? 'bulan' : 'tanggal'}</h3><p>${periodLabel ? `${escapeHtml(periodLabel)}<br>` : ''}${dateBasis === 'created' ? '' : 'Nilai nota mengikuti tanggal pengambilan.'}</p></div>
    <div class="business-legend">${visible.map(s => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join('')}</div>
    ${max ? '' : '<p class="business-chart-empty">Belum ada nilai transaksi pada periode ini.</p>'}
    <div class="business-plot"><div class="business-axis"><span>${max ? compactMoney(ceiling) : 'Rp0'}</span><span>${max ? compactMoney(ceiling / 2) : ''}</span><span>0</span></div>
      <div class="business-bars-scroll"><div class="business-chart-canvas"><svg class="business-activity-lines" viewBox="0 0 100 155" preserveAspectRatio="none" aria-hidden="true">${linePaths}</svg><div class="business-bars" style="--day-count:${Math.max(1, days.length)}">${days.map(d => `<button type="button" class="business-day" data-chart-detail="${escapeHtml(detail(d))}" aria-label="${escapeHtml(detail(d))}"><span class="business-columns">${visible.map((s, index) => { const value = Math.max(0, d[s.key]); return `<span class="business-column-3d ${value ? '' : 'is-zero'}" style="--column-height:${value / ceiling * 100}%;--column-color:${s.color};--column-delay:${index * 60}ms"><i></i></span>`; }).join('')}</span><span class="business-day-label">${axisLabel(d)}</span></button>`).join('')}</div></div></div></div>
    <p class="business-chart-detail" aria-live="polite">Ketuk batang untuk melihat nominal.</p>
    <p class="business-chart-note">Pembayaran mengikuti tanggal bayar, termasuk pelunasan saat diambil. Pengeluaran mengikuti tanggal pencatatan.</p></section>`;
}

export function statusChart(counts) {
  const statuses = [['PAID', 'Lunas', '#2fe0b0'], ['PARTIAL', 'Sebagian', '#ff5d7a'], ['UNPAID', 'Belum lunas', '#ff6f86'], ['OVERPAID', 'Lebih bayar', '#8f7bff']];
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
    const selectSegment = () => {
      const chart = button.closest('.business-chart');
      chart.querySelectorAll('[data-chart-detail]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      chart.querySelector('.business-chart-detail').textContent = button.dataset.chartDetail;
    };
    button.onclick = selectSegment;
    if (button.tagName.toLowerCase() !== 'button') {
      button.onkeydown = (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        selectSegment();
      };
    }
  });
}

function compactMoney(value) {
  if (value >= 1e9) return `${Number((value / 1e9).toFixed(1))} M`;
  if (value >= 1e6) return `${Number((value / 1e6).toFixed(1))} jt`;
  if (value >= 1e3) return `${Number((value / 1e3).toFixed(1))} rb`;
  return String(Math.round(value));
}
