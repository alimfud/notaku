// pages/saleEdit.js — edit nota yang SUDAH tersimpan (bukan buat baru).
// Beda dengan createSale.js: tidak ada field "Bayar" (pembayaran diedit
// terpisah lewat riwayat pembayaran di halaman detail), tapi ADA field
// tanggal & jam transaksi (bisa dikoreksi, mis. "waktu pengambilan").

import { getSaleSummary, updateSale, AppError } from '../services/saleService.js';
import * as db from '../db.js';
import { getAllCustomers, cashCustomer, saveCustomer } from '../services/customerService.js';
import { getAllProducts } from '../services/productService.js';
import { calculateSubtotal, calculateTotal } from '../services/saleCalculation.js';
import { rupiah, escapeHtml, qtyLabel } from '../format.js';
import { openSheet } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { setPageTitle, setTopbarActions, replaceRoute } from '../app.js';

let state;
let saleId;

export async function render(root, params) {
  saleId = params[0];
  setPageTitle('Ubah Nota');
  setTopbarActions([]);

  const summary = await getSaleSummary(saleId);
  if (!summary) {
    root.innerHTML = `<div class="empty-state"><p>Nota tidak ditemukan.</p></div>`;
    return;
  }
  const items = await db.getByIndex('saleItems', 'saleId', saleId);
  items.sort((a, b) => a.sortOrder - b.sortOrder);

  state = {
    customer: { id: summary.sale.customerId || '', name: summary.sale.customerName, phone: summary.sale.customerPhone, address: summary.sale.customerAddress },
    lines: items.map((it) => ({ productId: it.productId, name: it.productName, unit: it.unit, qty: it.qty, price: it.price })),
    discountAmount: summary.sale.discountAmount || 0,
    note: summary.sale.note || '',
    saleDate: summary.sale.saleDate,
    saleTime: summary.sale.saleTime,
  };

  draw(root);
}

function draw(root) {
  const subtotal = calculateSubtotal(state.lines);
  const total = calculateTotal(subtotal, state.discountAmount);

  root.innerHTML = `
    <div style="padding:16px;">
      <button id="pickCustomer" class="row" style="border:1px solid var(--outline);border-radius:12px;background:var(--surface-dim);">
        <span style="font-size:20px;">👤</span>
        <div class="row-body"><div class="row-title">${escapeHtml(state.customer.name)}</div></div>
        <span style="color:var(--muted);">›</span>
      </button>
    </div>
    <div class="field" style="display:flex;gap:12px;">
      <div style="flex:1;"><label>Tanggal Transaksi</label><input id="fDate" type="date" value="${state.saleDate}"></div>
      <div style="flex:1;"><label>Jam</label><input id="fTime" type="time" value="${state.saleTime}"></div>
    </div>
    <div style="display:flex;align-items:center;padding:8px 16px 0;">
      <div style="flex:1;font-size:15px;font-weight:700;">Item (${state.lines.length})</div>
      <button id="addItemBtn" class="btn small secondary">+ Tambah</button>
    </div>
    <div id="linesList"></div>
    <div style="padding:14px 16px;">
      <button id="discountBtn" class="btn secondary" style="margin:0;">Atur Diskon &amp; Catatan</button>
    </div>
    <div style="height:170px;"></div>
    <div style="position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:520px;background:#fff;border-top:1px solid var(--outline);padding:12px 16px calc(env(safe-area-inset-bottom,0px) + 12px);">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
        <span style="font-weight:700;">TOTAL</span>
        <span style="font-size:26px;font-weight:800;">${rupiah(total)}</span>
      </div>
      <button id="saveBtn" class="btn" style="margin:0;" ${state.lines.length ? '' : 'disabled'}>Simpan Perubahan</button>
    </div>
  `;

  drawLines(root);

  root.querySelector('#pickCustomer').onclick = () => pickCustomer(root);
  root.querySelector('#addItemBtn').onclick = () => addItem(root);
  root.querySelector('#discountBtn').onclick = () => editDiscountNote(root);
  root.querySelector('#fDate').onchange = (e) => { state.saleDate = e.target.value; };
  root.querySelector('#fTime').onchange = (e) => { state.saleTime = e.target.value; };
  root.querySelector('#saveBtn').onclick = () => save(root);
}

function drawLines(root) {
  const el = root.querySelector('#linesList');
  if (!state.lines.length) {
    el.innerHTML = `<div style="padding:24px;text-align:center;color:var(--muted);font-size:13.5px;">Belum ada item.</div>`;
    return;
  }
  el.innerHTML = state.lines.map((l, i) => `
    <div class="item-line" data-i="${i}">
      <div style="flex:1;min-width:0;">
        <div class="il-name">${escapeHtml(l.name)}</div>
        <div class="il-detail">${qtyLabel(l.qty)} ${escapeHtml(l.unit || '')} x ${rupiah(l.price)}</div>
      </div>
      <div style="text-align:right;">
        <div class="il-total">${rupiah(l.qty * l.price)}</div>
        <button class="il-remove" data-i="${i}">Hapus</button>
      </div>
    </div>`).join('');

  el.querySelectorAll('.item-line').forEach((line) => {
    line.addEventListener('click', (e) => {
      if (e.target.classList.contains('il-remove')) return;
      editLine(root, Number(line.dataset.i));
    });
  });
  el.querySelectorAll('.il-remove').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      state.lines.splice(Number(btn.dataset.i), 1);
      draw(root);
    };
  });
}

async function pickCustomer(root) {
  const customers = await getAllCustomers();
  const selected = await openSheet((body, close) => {
    body.innerHTML = `
      <div class="sheet-title">Pilih Pelanggan</div>
      <div class="field"><input id="custSearch" placeholder="Cari nama pelanggan" autofocus></div>
      <button class="row" id="cashOpt"><div class="avatar" style="background:var(--primary);">C</div><div class="row-body"><div class="row-title">CASH</div></div></button>
      <button class="row" id="newOpt"><div class="avatar">+</div><div class="row-body"><div class="row-title">Tambah Pelanggan Baru</div></div></button>
      <div id="custList" class="list"></div>
    `;
    const listEl = body.querySelector('#custList');
    function drawList(filter) {
      const f = filter.toLowerCase();
      const rows = customers.filter((c) => c.name.toLowerCase().includes(f));
      listEl.innerHTML = rows.map((c) => `
        <button class="row" data-id="${c.id}">
          <div class="avatar">${c.name[0]?.toUpperCase() || '?'}</div>
          <div class="row-body"><div class="row-title">${escapeHtml(c.name)}</div>${c.phone ? `<div class="row-meta">${escapeHtml(c.phone)}</div>` : ''}</div>
        </button>`).join('');
      listEl.querySelectorAll('.row').forEach((r) => { r.onclick = () => close(rows.find((c) => c.id === r.dataset.id)); });
    }
    drawList('');
    body.querySelector('#custSearch').oninput = (e) => drawList(e.target.value);
    body.querySelector('#cashOpt').onclick = () => close(cashCustomer());
    body.querySelector('#newOpt').onclick = () => close('new');
  });

  if (selected === 'new') {
    const created = await promptNewCustomer();
    if (created) { state.customer = created; draw(root); }
  } else if (selected) {
    state.customer = selected;
    draw(root);
  }
}

async function promptNewCustomer() {
  return openSheet((body, close) => {
    body.innerHTML = `
      <div class="sheet-title">Pelanggan Baru</div>
      <div class="field"><label>Nama</label><input id="nName" autofocus></div>
      <div class="field"><label>Telepon (opsional)</label><input id="nPhone"></div>
      <button class="btn" id="nSave">Simpan &amp; Pilih</button>
    `;
    body.querySelector('#nSave').onclick = async () => {
      const name = body.querySelector('#nName').value.trim();
      if (!name) { toast('Nama pelanggan wajib diisi'); return; }
      try {
        const created = await saveCustomer({ name, phone: body.querySelector('#nPhone').value });
        close(created);
      } catch (e) { toast(e.message); }
    };
  });
}

async function addItem(root) {
  const products = await getAllProducts();
  const result = await openSheet((body, close) => {
    body.innerHTML = `
      <div class="sheet-title">Pilih Produk</div>
      <div class="field"><input id="prodSearch" placeholder="Cari produk" autofocus></div>
      <div id="prodList" class="list"></div>
      <div style="padding:14px 16px;"><button class="btn secondary" id="manualBtn" style="margin:0;">+ Item Bebas (Ketik Manual)</button></div>
    `;
    const listEl = body.querySelector('#prodList');
    function drawList(filter) {
      const f = filter.toLowerCase();
      const rows = products.filter((p) => p.name.toLowerCase().includes(f));
      listEl.innerHTML = rows.length ? rows.map((p) => `
        <button class="row" data-id="${p.id}">
          <div class="row-body"><div class="row-title">${escapeHtml(p.name)}</div>${p.category ? `<div class="row-meta">${escapeHtml(p.category)}</div>` : ''}</div>
          <div class="row-money">${rupiah(p.price)}</div>
        </button>`).join('') : `<div class="empty-state"><p>Produk tidak ditemukan.</p></div>`;
      listEl.querySelectorAll('.row').forEach((r) => { r.onclick = () => close(rows.find((p) => p.id === r.dataset.id)); });
    }
    drawList('');
    body.querySelector('#prodSearch').oninput = (e) => drawList(e.target.value);
    body.querySelector('#manualBtn').onclick = () => close('manual');
  });

  if (result === 'manual') {
    const line = await promptManualItem();
    if (line) { state.lines.push(line); draw(root); }
  } else if (result) {
    const existing = state.lines.find((l) => l.productId === result.id);
    if (existing) existing.qty += 1;
    else state.lines.push({ productId: result.id, name: result.name, unit: result.unit, qty: 1, price: result.price });
    draw(root);
  }
}

async function promptManualItem() {
  return openSheet((body, close) => {
    body.innerHTML = `
      <div class="sheet-title">Item Bebas</div>
      <div class="field"><label>Nama item</label><input id="mName" autofocus></div>
      <div class="field"><label>Harga satuan</label><input id="mPrice" type="number" inputmode="numeric"></div>
      <button class="btn" id="mAdd">Tambahkan</button>
    `;
    body.querySelector('#mAdd').onclick = () => {
      const name = body.querySelector('#mName').value.trim();
      if (!name) return;
      const price = Number(body.querySelector('#mPrice').value) || 0;
      close({ productId: null, name, unit: '', qty: 1, price });
    };
  });
}

async function editLine(root, index) {
  const line = state.lines[index];
  await openSheet((body, close) => {
    body.innerHTML = `
      <div class="sheet-title">${escapeHtml(line.name)}</div>
      <div class="field"><label>Jumlah</label><input id="eQty" type="number" inputmode="decimal" value="${line.qty}"></div>
      <div class="field"><label>Harga Satuan</label><input id="ePrice" type="number" inputmode="numeric" value="${Math.round(line.price)}"></div>
      <button class="btn" id="eApply">Terapkan</button>
    `;
    body.querySelector('#eApply').onclick = () => {
      line.qty = Number(body.querySelector('#eQty').value) || line.qty;
      line.price = Number(body.querySelector('#ePrice').value) || 0;
      close(true);
    };
  });
  draw(root);
}

async function editDiscountNote(root) {
  await openSheet((body, close) => {
    body.innerHTML = `
      <div class="sheet-title">Diskon &amp; Catatan</div>
      <div class="field"><label>Diskon (Rp)</label><input id="dDiscount" type="number" inputmode="numeric" value="${state.discountAmount || ''}"></div>
      <div class="field"><label>Catatan (opsional)</label><textarea id="dNote" rows="2">${escapeHtml(state.note)}</textarea></div>
      <button class="btn" id="dApply">Terapkan</button>
    `;
    body.querySelector('#dApply').onclick = () => {
      state.discountAmount = Number(body.querySelector('#dDiscount').value) || 0;
      state.note = body.querySelector('#dNote').value;
      close(true);
    };
  });
  draw(root);
}

async function save(root) {
  const saveBtn = root.querySelector('#saveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Menyimpan...';
  try {
    await updateSale(saleId, {
      customer: state.customer,
      lines: state.lines,
      discountAmount: state.discountAmount,
      saleDate: state.saleDate,
      saleTime: state.saleTime,
      note: state.note,
    });
    toast('Perubahan nota disimpan');
    replaceRoute(`sale/${saleId}`);
  } catch (e) {
    toast(e instanceof AppError ? e.userMessage : 'Gagal menyimpan perubahan.');
    saveBtn.disabled = false;
    saveBtn.textContent = 'Simpan Perubahan';
  }
}
