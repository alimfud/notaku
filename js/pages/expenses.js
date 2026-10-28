import { getExpenses, saveExpense, deleteExpense, EXPENSE_CATEGORIES, EXPENSE_METHODS } from '../services/expenseService.js';
import { rupiah, escapeHtml, dateShort, todayDbDate } from '../format.js';
import { setPageTitle, setTopbarActions } from '../app.js';
import { openSheet, confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';

export async function render(root) { setPageTitle('Pengeluaran'); setTopbarActions([]); await draw(root); }
async function draw(root) {
  const rows = await getExpenses();
  const total = rows.reduce((s, e) => s + e.amount, 0);
  root.innerHTML = `
    <div class="expense-page">
      <section class="expense-summary">
        <div>
          <span>Total pengeluaran</span>
          <strong>${rupiah(total)}</strong>
        </div>
        <div class="expense-summary-count"><strong>${rows.length}</strong><span>catatan</span></div>
      </section>

      <div class="expense-list-heading">
        <div><span>Riwayat</span><h2>Daftar pengeluaran</h2></div>
        <small>Ketuk untuk mengubah</small>
      </div>

      <div class="list expense-list">
        ${rows.length ? rows.map(e => `
          <button class="row expense-row" data-id="${escapeHtml(e.id)}" type="button">
            <div class="avatar">−</div>
            <div class="row-body">
              <div class="row-title">${escapeHtml(e.title)}</div>
              <div class="row-meta">${escapeHtml(e.category)} · ${escapeHtml(e.method)} · ${dateShort(e.expenseDate)}</div>
            </div>
            <div class="row-trailing"><div class="row-money">${rupiah(e.amount)}</div></div>
          </button>`).join('') : '<div class="empty-state"><p>Belum ada pengeluaran tercatat.</p></div>'}
      </div>
    </div>
    <button class="fab" id="addExpense" aria-label="Tambah pengeluaran">+</button>`;
  root.querySelector('#addExpense').onclick = () => openForm(root);
  root.querySelectorAll('.expense-row').forEach(b => b.onclick = () => openForm(root, rows.find(e => e.id === b.dataset.id)));
}
async function openForm(root, expense = null) {
  await openSheet((body, close) => {
    const e = expense || { title: '', category: 'Operasional', amount: '', expenseDate: todayDbDate(), method: 'Tunai', note: '' };
    body.classList.add('expense-form-sheet');
    body.innerHTML = `
      <div class="expense-sheet-header">
        <div class="sheet-title">${expense ? 'Ubah Pengeluaran' : 'Tambah Pengeluaran'}</div>
        <button type="button" class="expense-sheet-close" id="expenseClose" aria-label="Tutup">×</button>
      </div>

      <div class="expense-form-fields">
        <label class="expense-field">
          <span>Judul / nama</span>
          <input id="eTitle" value="${escapeHtml(e.title)}" placeholder="Contoh: Bensin antar pesanan">
        </label>

        <div class="expense-field-grid">
          <label class="expense-field">
            <span>Kategori</span>
            <select id="eCategory">${EXPENSE_CATEGORIES.map(x => `<option ${x === e.category ? 'selected' : ''}>${x}</option>`).join('')}</select>
          </label>
          <label class="expense-field">
            <span>Metode</span>
            <select id="eMethod">${EXPENSE_METHODS.map(x => `<option ${x === e.method ? 'selected' : ''}>${x}</option>`).join('')}</select>
          </label>
        </div>

        <label class="expense-field">
          <span>Nominal</span>
          <div class="expense-money-input"><b>Rp</b><input id="eAmount" type="number" inputmode="numeric" min="1" value="${e.amount}" placeholder="0"></div>
        </label>

        <label class="expense-field">
          <span>Tanggal</span>
          <input id="eDate" type="date" value="${e.expenseDate}">
        </label>

        <label class="expense-field">
          <span>Catatan <em>Opsional</em></span>
          <textarea id="eNote" rows="2" placeholder="Catatan singkat">${escapeHtml(e.note)}</textarea>
        </label>
      </div>

      <div class="expense-sheet-actions ${expense ? 'has-delete' : ''}">
        ${expense ? '<button class="btn danger" id="deleteExpense" type="button">Hapus</button>' : ''}
        <button class="btn" id="saveExpense" type="button">${expense ? 'Simpan Perubahan' : 'Simpan'}</button>
      </div>`;
    body.querySelector('#expenseClose').onclick = () => close(undefined);
    body.querySelector('#saveExpense').onclick = async () => { try { await saveExpense({ id: expense?.id, title: body.querySelector('#eTitle').value, category: body.querySelector('#eCategory').value, amount: body.querySelector('#eAmount').value, expenseDate: body.querySelector('#eDate').value, method: body.querySelector('#eMethod').value, note: body.querySelector('#eNote').value }); close(true); toast('Pengeluaran disimpan'); await draw(root); } catch (err) { toast(err.message); } };
    if (expense) body.querySelector('#deleteExpense').onclick = async () => { if (await confirmDialog({ title: 'Hapus pengeluaran?', message: 'Catatan pengeluaran ini akan dihapus.', confirmLabel: 'Hapus', dangerous: true })) { await deleteExpense(expense.id); close(true); toast('Pengeluaran dihapus'); await draw(root); } };
  });
}
