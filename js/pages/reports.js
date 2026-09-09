// pages/reports.js

import { generateReport, generateAllTimeSummary } from '../services/reportService.js';
import { STATUS_LABEL } from '../services/saleCalculation.js';
import { rupiah, qtyLabel, escapeHtml } from '../format.js';
import { setPageTitle, setTopbarActions } from '../app.js';

let _period = 'today';

export async function render(root) {
  setPageTitle('Laporan');
  setTopbarActions([]);
  root.innerHTML = `
    <div class="chip-scroll" style="padding-top:16px;">
      <button class="chip" data-p="today">Hari Ini</button>
      <button class="chip" data-p="week">Minggu Ini</button>
      <button class="chip" data-p="month">Bulan Ini</button>
    </div>
    <div id="reportBody" style="padding:0 16px;"></div>
    <div class="section-title">Omset Keseluruhan</div>
    <div id="allTimeBody" style="padding:0 16px 30px;"></div>
  `;
  root.querySelectorAll('.chip').forEach((c) => {
    c.classList.toggle('active', c.dataset.p === _period);
    c.onclick = () => { _period = c.dataset.p; drawReport(root); };
  });
  await drawReport(root);
  await drawAllTime(root);
}

async function drawReport(root) {
  root.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.p === _period));
  const data = await generateReport(_period);
  const el = root.querySelector('#reportBody');
  el.innerHTML = `
    <div style="display:flex;gap:12px;margin-bottom:12px;">
      <div style="flex:1;padding:16px;border-radius:14px;background:var(--surface-dim);">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;">Omzet ${data.periodLabel}</div>
        <div style="font-size:20px;font-weight:800;margin-top:6px;">${rupiah(data.revenue)}</div>
      </div>
      <div style="flex:1;padding:16px;border-radius:14px;background:var(--surface-dim);">
        <div style="font-size:11px;color:var(--muted);text-transform:uppercase;">Transaksi</div>
        <div style="font-size:20px;font-weight:800;margin-top:6px;">${data.transactionCount}</div>
      </div>
    </div>
    <div style="padding:16px;border-radius:14px;background:var(--surface-dim);margin-bottom:20px;">
      <div style="font-size:11px;color:var(--muted);text-transform:uppercase;">Total Piutang (Belum Lunas)</div>
      <div style="font-size:20px;font-weight:800;margin-top:6px;color:var(--accent);">${rupiah(data.totalReceivables)}</div>
    </div>
    <div style="font-size:14.5px;font-weight:700;margin-bottom:8px;">Produk Terlaris (${data.periodLabel})</div>
    ${data.topProducts.length ? data.topProducts.map((p) => `
      <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--outline);">
        <div>
          <div style="font-size:14px;font-weight:600;">${escapeHtml(p.name)}</div>
          <div class="row-meta">${qtyLabel(p.qty)} terjual</div>
        </div>
        <div style="font-weight:700;font-size:14px;">${rupiah(p.amount)}</div>
      </div>`).join('') : `<div style="padding:16px 0;color:var(--muted);font-size:13px;">Belum ada penjualan pada periode ini.</div>`}
  `;
}

async function drawAllTime(root) {
  const data = await generateAllTimeSummary();
  const el = root.querySelector('#allTimeBody');

  const statusRows = [
    ['PAID', 'var(--status-lunas)'],
    ['PARTIAL', 'var(--status-partial)'],
    ['UNPAID', 'var(--status-unpaid)'],
    ['OVERPAID', 'var(--status-overpaid)'],
  ];

  el.innerHTML = `
    <div style="padding:18px;border-radius:14px;background:var(--ink);color:#fff;margin-bottom:14px;">
      <div style="font-size:11px;color:rgba(255,255,255,.6);text-transform:uppercase;">Total Omset Sepanjang Waktu</div>
      <div style="font-size:26px;font-weight:800;margin-top:6px;">${rupiah(data.totalRevenue)}</div>
      <div style="font-size:12.5px;color:rgba(255,255,255,.7);margin-top:4px;">${data.totalTransactions} nota tercatat</div>
    </div>

    <div style="display:flex;gap:12px;margin-bottom:16px;">
      <div style="flex:1;padding:14px;border-radius:12px;background:var(--surface-dim);">
        <div style="font-size:10.5px;color:var(--muted);text-transform:uppercase;">Sudah Diterima (tercatat)</div>
        <div style="font-size:17px;font-weight:800;margin-top:5px;color:var(--status-lunas);">${rupiah(data.totalPaidCollected)}</div>
      </div>
      <div style="flex:1;padding:14px;border-radius:12px;background:var(--surface-dim);">
        <div style="font-size:10.5px;color:var(--muted);text-transform:uppercase;">Piutang Belum Lunas</div>
        <div style="font-size:17px;font-weight:800;margin-top:5px;color:var(--accent);">${rupiah(data.totalReceivables)}</div>
      </div>
    </div>

    <div style="font-size:14.5px;font-weight:700;margin-bottom:8px;">Rincian per Status Pembayaran</div>
    <div style="margin-bottom:20px;">
      ${statusRows.map(([key, color]) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--outline);">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;"></span>
            <span style="font-size:13.5px;font-weight:600;">${STATUS_LABEL[key]}</span>
            <span style="font-size:12px;color:var(--muted);">(${data.statusBreakdown[key].count} nota)</span>
          </div>
          <div style="font-weight:700;font-size:13.5px;">${rupiah(data.statusBreakdown[key].amount)}</div>
        </div>`).join('')}
      ${data.autoMarkedCount > 0 ? `<div style="font-size:11.5px;color:var(--muted);padding-top:8px;font-style:italic;">${data.autoMarkedCount} di antaranya ditandai LUNAS otomatis (2 hari setelah tanggal pengambilan).</div>` : ''}
    </div>

    <div style="font-size:14.5px;font-weight:700;margin-bottom:8px;">Rincian per Bulan</div>
    ${data.monthlyBreakdown.length ? data.monthlyBreakdown.map((m) => `
      <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--outline);">
        <div>
          <div style="font-size:13.5px;font-weight:600;">${m.label}</div>
          <div class="row-meta">${m.count} nota</div>
        </div>
        <div style="font-weight:700;font-size:13.5px;">${rupiah(m.revenue)}</div>
      </div>`).join('') : `<div style="padding:16px 0;color:var(--muted);font-size:13px;">Belum ada data.</div>`}
  `;
}
