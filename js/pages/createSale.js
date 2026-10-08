// pages/createSale.js — wrapper tipis di atas saleFormShared.js.

import { renderSaleForm } from './saleFormShared.js';
import { cashCustomer } from '../services/customerService.js';
import { createSale, AppError } from '../services/saleService.js';
import { toast } from '../ui/toast.js';
import { setPageTitle, setTopbarActions, replaceRoute } from '../app.js';
import { todayDbDate, timeLabel } from '../format.js';
import { getSaleDraft, clearSaleDraft } from '../services/saleDraftService.js';

export async function render(root) {
  setPageTitle('Nota Baru');
  setTopbarActions([]);
  const savedDraft = getSaleDraft();
  const shouldResume = savedDraft && (savedDraft.lines?.length || savedDraft.note || savedDraft.customer?.name || savedDraft.payment)
    ? window.confirm('Draf nota sebelumnya ditemukan. Lanjutkan draf tersebut?')
    : false;
  if (savedDraft && !shouldResume) clearSaleDraft();
  const initial = shouldResume
    ? { ...savedDraft, draftRestored: true, customer: savedDraft.customer || cashCustomer() }
    : { customer: cashCustomer(), saleDate: todayDbDate(), saleTime: timeLabel(new Date()) };
  await renderSaleForm(root, 'create', initial, async (state) => {
    try {
      const saleId = await createSale({
        customer: state.customer,
        lines: state.lines,
        adjustments: state.adjustments,
        initialPayment: state.payment,
        saleDate: state.saleDate,
        saleTime: state.saleTime,
        note: state.note,
      });
      clearSaleDraft();
      toast('Nota tersimpan');
      replaceRoute(`sale/${saleId}`);
    } catch (e) {
      throw e instanceof AppError ? e : new AppError('Gagal menyimpan nota. Silakan coba lagi.');
    }
  });
}
