// pages/createSale.js — wrapper tipis di atas saleFormShared.js.

import { renderSaleForm } from './saleFormShared.js';
import { cashCustomer } from '../services/customerService.js';
import { createSale, AppError } from '../services/saleService.js';
import { toast } from '../ui/toast.js';
import { setPageTitle, setTopbarActions, replaceRoute } from '../app.js';

export async function render(root) {
  setPageTitle('Nota Baru');
  setTopbarActions([]);
  await renderSaleForm(root, 'create', { customer: cashCustomer() }, async (state) => {
    try {
      const saleId = await createSale({
        customer: state.customer,
        lines: state.lines,
        adjustments: state.adjustments,
        initialPayment: state.payment,
        note: state.note,
      });
      toast('Nota tersimpan');
      replaceRoute(`sale/${saleId}`);
    } catch (e) {
      throw e instanceof AppError ? e : new AppError('Gagal menyimpan nota. Silakan coba lagi.');
    }
  });
}
