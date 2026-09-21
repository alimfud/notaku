import { getExpenses, saveExpense, deleteExpense, EXPENSE_CATEGORIES, EXPENSE_METHODS } from '../services/expenseService.js';
import { rupiah, escapeHtml, dateShort, todayDbDate } from '../format.js';
import { setPageTitle, setTopbarActions } from '../app.js';
import { openSheet, confirmDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';

export async function render(root) { setPageTitle('Pengeluaran'); setTopbarActions([]); await draw(root); }
async function draw(root) {
  const rows = await getExpenses();
  const total = rows.reduce((s, e) => s + e.amount, 0);
  root.innerHTML = `<div class="summary-card"><div class="summary-block"><div class="summary-label">TOTAL PENGELUARAN</div><div class="summary-value">${rupiah(total)}</div></div><div class="summary-divider"></div><div class="summary-block"><div class="summary-label">CATATAN</div><div class="summary-value">${rows.length}</div></div></div>
  <div class="section-title">Riwayat Pengeluaran</div><div class="list">${rows.length ? rows.map(e => `<button class="row expense-row" data-id="${e.id}"><div class="avatar">−</div><div class="row-body"><div class="row-title">${escapeHtml(e.title)}</div><div class="row-meta">${escapeHtml(e.category)} · ${escapeHtml(e.method)} · ${dateShort(e.expenseDate)}</div></div><div class="row-trailing"><div class="row-money">${rupiah(e.amount)}</div></div></button>`).join('') : '<div class="empty-state"><p>Belum ada pengeluaran tercatat.</p></div>'}</div><button class="fab" id="addExpense" aria-label="Tambah pengeluaran">+</button>`;
  root.querySelector('#addExpense').onclick = () => openForm(root);
  root.querySelectorAll('.expense-row').forEach(b => b.onclick = () => openForm(root, rows.find(e => e.id === b.dataset.id)));
}
async function openForm(root, expense = null) {
  await openSheet((body, close) => {
    const e = expense || { title: '', category: 'Operasional', amount: '', expenseDate: todayDbDate(), method: 'Tunai', note: '' };
    body.innerHTML = `<div class="sheet-title">${expense ? 'Ubah Pengeluaran' : 'Tambah Pengeluaran'}</div><div class="field"><label>Judul / Nama</label><input id="eTitle" value="${escapeHtml(e.title)}" placeholder="Contoh: Bensin antar pesanan"></div><div class="field"><label>Kategori</label><select id="eCategory">${EXPENSE_CATEGORIES.map(x => `<option ${x === e.category ? 'selected' : ''}>${x}</option>`).join('')}</select></div><div class="field"><label>Nominal</label><input id="eAmount" type="number" inputmode="numeric" min="1" value="${e.amount}" placeholder="0"></div><div class="field"><label>Tanggal</label><input id="eDate" type="date" value="${e.expenseDate}"></div><div class="field"><label>Metode</label><select id="eMethod">${EXPENSE_METHODS.map(x => `<option ${x === e.method ? 'selected' : ''}>${x}</option>`).join('')}</select></div><div class="field"><label>Catatan (opsional)</label><textarea id="eNote" rows="2">${escapeHtml(e.note)}</textarea></div><button class="btn" id="saveExpense">Simpan</button>${expense ? '<button class="btn danger" id="deleteExpense">Hapus</button>' : ''}`;
    body.querySelector('#saveExpense').onclick = async () => { try { await saveExpense({ id: expense?.id, title: body.querySelector('#eTitle').value, category: body.querySelector('#eCategory').value, amount: body.querySelector('#eAmount').value, expenseDate: body.querySelector('#eDate').value, method: body.querySelector('#eMethod').value, note: body.querySelector('#eNote').value }); close(true); toast('Pengeluaran disimpan'); await draw(root); } catch (err) { toast(err.message); } };
    if (expense) body.querySelector('#deleteExpense').onclick = async () => { if (await confirmDialog({ title: 'Hapus pengeluaran?', message: 'Catatan pengeluaran ini akan dihapus.', confirmLabel: 'Hapus', dangerous: true })) { await deleteExpense(expense.id); close(true); toast('Pengeluaran dihapus'); await draw(root); } };
  });
}
