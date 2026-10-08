// Draf nota baru disimpan lokal di perangkat yang sedang dipakai.
// Draf tidak masuk laporan, stok, atau nomor nota sampai pengguna menekan Simpan.

const DRAFT_KEY = 'notaku-sale-draft-v1';

function canUseStorage() {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export function getSaleDraft() {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft || typeof draft !== 'object') return null;
    return draft;
  } catch {
    return null;
  }
}

export function saveSaleDraft(state) {
  if (!canUseStorage()) return;
  try {
    const draft = {
      customer: state.customer,
      lines: state.lines,
      adjustments: state.adjustments,
      note: state.note || '',
      payment: Number(state.payment) || 0,
      saleDate: state.saleDate || '',
      saleTime: state.saleTime || '',
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch (error) {
    console.warn('[saleDraft] gagal menyimpan draf', error);
  }
}

export function clearSaleDraft() {
  if (!canUseStorage()) return;
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}

export function hasSaleDraft() {
  const draft = getSaleDraft();
  return Boolean(draft && (draft.lines?.length || draft.note || draft.customer?.name || draft.payment));
}
