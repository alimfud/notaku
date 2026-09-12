// pages/saleEdit.js — wrapper tipis di atas saleFormShared.js (mode 'edit').

import { renderSaleForm } from './saleFormShared.js';
import { getSaleSummary, updateSale, AppError } from '../services/saleService.js';
import * as db from '../db.js';
import { toast } from '../ui/toast.js';
import { setPageTitle, setTopbarActions, replaceRoute } from '../app.js';

export async function render(root, params) {
  const saleId = params[0];
  setPageTitle('Ubah Nota');
  setTopbarActions([]);

  const summary = await getSaleSummary(saleId);
  if (!summary) {
    root.innerHTML = `<div class="empty-state"><p>Nota tidak ditemukan.</p></div>`;
    return;
  }
  const items = await db.getByIndex('saleItems', 'saleId', saleId);
  items.sort((a, b) => a.sortOrder - b.sortOrder);
  const { sale } = summary;

  const initial = {
    customer: { id: sale.customerId || '', name: sale.customerName, phone: sale.customerPhone, address: sale.customerAddress },
    lines: items.map((it) => ({ productId: it.productId, name: it.productName, unit: it.unit, qty: it.qty, price: it.price, note: it.note || '' })),
    adjustments: sale.adjustments || null,
    note: sale.note || '',
    saleDate: sale.saleDate,
    saleTime: sale.saleTime,
  };

  await renderSaleForm(root, 'edit', initial, async (state) => {
    try {
      await updateSale(saleId, {
        customer: state.customer,
        lines: state.lines,
        adjustments: state.adjustments,
        saleDate: state.saleDate,
        saleTime: state.saleTime,
        note: state.note,
      });
      toast('Perubahan nota disimpan');
      replaceRoute(`sale/${saleId}`);
    } catch (e) {
      throw e instanceof AppError ? e : new AppError('Gagal menyimpan perubahan.');
    }
  });
}
