// pages/reports.js

import { generateReport } from '../services/reportService.js';
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
  `;
  root.querySelectorAll('.chip').forEach((c) => {
    c.classList.toggle('active', c.dataset.p === _period);
    c.onclick = () => { _period = c.dataset.p; drawReport(root); };
  });
  await drawReport(root);
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
