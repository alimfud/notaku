// pages/reports.js

import { generateReport, generateAllTimeSummary } from '../services/reportService.js';
import { STATUS_LABEL } from '../services/saleCalculation.js';
import { rupiah, qtyLabel, escapeHtml, dateShort } from '../format.js';
import { dailyChart, statusChart, wireBusinessCharts } from '../ui/businessCharts.js';
import { setPageTitle, setTopbarActions } from '../app.js';

let _period = 'week';
let reportRequest = 0;

export async function render(root) {
  setPageTitle('Laporan');
  setTopbarActions([]);
  root.innerHTML = `
    <div class="reports-layout-1 chip-scroll">
      <button class="chip" data-p="today">Hari Ini</button>
      <button class="chip" data-p="week">7 Hari</button>
      <button class="chip" data-p="month">Bulan Ini</button>
    </div>
    <div class="reports-layout-2" id="reportBody"></div>
    <div class="section-title">Omset Keseluruhan</div>
    <div class="reports-layout-3" id="allTimeBody"></div>
  `;
  root.querySelectorAll('.chip').forEach((c) => {
    c.classList.toggle('active', c.dataset.p === _period);
    c.onclick = () => { _period = c.dataset.p; drawReport(root); };
  });
  await drawReport(root);
  await drawAllTime(root);
}

async function drawReport(root) {
  const request = ++reportRequest;
  root.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.p === _period));
  const data = await generateReport(_period);
  if (request !== reportRequest || root.dataset.page !== 'reports') return;
  const el = root.querySelector('#reportBody');
  el.innerHTML = `
    <p class="business-period">${dateShort(data.start)} – ${dateShort(data.end)}<br>Nilai nota berdasarkan tanggal pengambilan.</p>
    <div class="reports-layout-4">
      <div class="reports-layout-5">
        <div class="reports-layout-6">Omzet ${data.periodLabel}</div>
        <div class="reports-layout-7">${rupiah(data.revenue)}</div>
      </div>
      <div class="reports-layout-5">
        <div class="reports-layout-6">Transaksi</div>
        <div class="reports-layout-7">${data.transactionCount}</div>
      </div>
    </div>
    <div class="reports-layout-4">
      <div class="reports-layout-5"><div class="reports-layout-6">Pengeluaran</div><div class="reports-layout-8">${rupiah(data.expenseTotal)}</div><div class="row-meta">${data.expenseCount} catatan</div></div>
      <div class="reports-layout-5"><div class="reports-layout-6">Sisa Omzet</div><div class="reports-layout-7">${rupiah(data.netIncome)}</div></div>
    </div>
    <div class="reports-layout-9">
      <div class="reports-layout-6">Piutang Periode Ini (Belum Lunas)</div>
      <div class="reports-layout-8">${rupiah(data.totalReceivables)}</div>
    </div>
    ${dailyChart(data.daily)}
    ${statusChart(data.statusBreakdown)}
    <div class="reports-layout-10">Produk Terlaris (${data.periodLabel})</div>
    ${data.topProducts.length ? data.topProducts.map((p) => `
      <div class="reports-layout-11">
        <div>
          <div class="reports-layout-12">${escapeHtml(p.name)}</div>
          <div class="row-meta">${qtyLabel(p.qty)} terjual</div>
        </div>
        <div class="reports-layout-13">${rupiah(p.amount)}</div>
      </div>`).join('') : `<div class="reports-layout-14">Belum ada penjualan pada periode ini.</div>`}
  `;
  wireBusinessCharts(el);
}

async function drawAllTime(root) {
  const data = await generateAllTimeSummary();
  const el = root.querySelector('#allTimeBody');
  if (!el) return;

  const statusRows = [
    ['PAID', 'var(--status-lunas)'],
    ['PARTIAL', 'var(--status-partial)'],
    ['UNPAID', 'var(--status-unpaid)'],
    ['OVERPAID', 'var(--status-overpaid)'],
  ];

  el.innerHTML = `
    <div class="reports-layout-15">
      <div class="reports-layout-16">Total Omset Sepanjang Waktu</div>
      <div class="reports-layout-17">${rupiah(data.totalRevenue)}</div>
      <div class="reports-layout-18">${data.totalTransactions} nota tercatat</div>
    </div>

    <div class="reports-layout-19">
      <div class="reports-layout-20">
        <div class="reports-layout-21">Sudah Diterima (tercatat)</div>
        <div class="reports-layout-22">${rupiah(data.totalPaidCollected)}</div>
      </div>
      <div class="reports-layout-20">
        <div class="reports-layout-21">Piutang Belum Lunas</div>
        <div class="reports-layout-23">${rupiah(data.totalReceivables)}</div>
      </div>
    </div>
    <div class="reports-layout-19"><div class="reports-layout-20"><div class="reports-layout-21">Total Pengeluaran</div><div class="reports-layout-23">${rupiah(data.totalExpenses)}</div><div class="row-meta">${data.totalExpenseCount} catatan</div></div><div class="reports-layout-20"><div class="reports-layout-21">Sisa Omzet</div><div class="reports-layout-24">${rupiah(data.netIncome)}</div></div></div>

    <div class="reports-layout-10">Rincian per Status Pembayaran</div>
    <div class="reports-layout-25">
      ${statusRows.map(([key, color]) => `
        <div class="reports-layout-26">
          <div class="reports-layout-27">
            <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;"></span>
            <span class="reports-layout-28">${STATUS_LABEL[key]}</span>
            <span class="reports-layout-29">(${data.statusBreakdown[key].count} nota)</span>
          </div>
          <div class="reports-layout-30">${rupiah(data.statusBreakdown[key].amount)}</div>
        </div>`).join('')}
      ${data.autoMarkedCount > 0 ? `<div class="reports-layout-31">${data.autoMarkedCount} di antaranya ditandai LUNAS otomatis (mulai 1 hari setelah tanggal pengambilan).</div>` : ''}
    </div>

    <div class="reports-layout-10">Rincian per Bulan</div>
    ${data.monthlyBreakdown.length ? data.monthlyBreakdown.map((m) => `
      <div class="reports-layout-11">
        <div>
          <div class="reports-layout-28">${m.label}</div>
          <div class="row-meta">${m.count} nota</div>
        </div>
        <div class="reports-layout-30">${rupiah(m.revenue)}</div>
      </div>`).join('') : `<div class="reports-layout-14">Belum ada data.</div>`}
  `;
}
