// pages/createSale.js
//
// "Mode Kasir Mini Market": input item lewat kolom pencarian/barcode yang
// selalu terlihat (bukan lewat sheet terpisah) + stepper qty, supaya kasir
// bisa scan/ketik berturut-turut tanpa buka-tutup dialog setiap tambah item.
// Cocok dipakai dengan barcode scanner fisik (yang berperilaku seperti
// keyboard: ketik kode lalu otomatis "Enter").

import { getAllCustomers, cashCustomer, saveCustomer } from '../services/customerService.js';
import { getAllProducts } from '../services/productService.js';
import { createSale, AppError } from '../services/saleService.js';
import { calculateSubtotal, calculateTotal } from '../services/saleCalculation.js';
import { rupiah, escapeHtml, qtyLabel } from '../format.js';
import { openSheet } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { setPageTitle, setTopbarActions, replaceRoute } from '../app.js';

let state;

function resetState() {
  state = { customer: null, lines: [], discountAmount: 0, payment: 0, note: '', stepperQty: 1, products: [] };
}

export async function render(root) {
  resetState();
  setPageTitle('Nota Baru');
  setTopbarActions([]);
  state.products = await getAllProducts();
  draw(root);
}

function draw(root) {
  const subtotal = calculateSubtotal(state.lines);
  const total = calculateTotal(subtotal, state.discountAmount);
  const totalQty = state.lines.reduce((s, l) => s + l.qty, 0);

  root.innerHTML = `
    <div style="padding:16px 16px 0;">
      <button id="pickCustomer" class="row" style="border:1px solid var(--outline);border-radius:12px;background:var(--surface-dim);">
        <span style="font-size:20px;">👤</span>
        <div class="row-body"><div class="row-title">${state.customer ? escapeHtml(state.customer.name) : 'Pilih pelanggan'}</div></div>
        <span style="color:var(--muted);">›</span>
      </button>
    </div>

    <div style="padding:12px 16px 0;display:flex;gap:8px;align-items:stretch;">
      <div style="display:flex;align-items:center;border:1px solid var(--outline);border-radius:10px;overflow:hidden;flex-shrink:0;">
        <button id="qtyMinus" style="width:38px;height:42px;border:none;background:var(--surface-dim);font-size:18px;font-weight:700;">-</button>
        <input id="qtyStepper" type="number" value="${state.stepperQty}" style="width:44px;height:42px;border:none;text-align:center;font-size:15px;font-weight:700;">
        <button id="qtyPlus" style="width:38px;height:42px;border:none;background:var(--surface-dim);font-size:18px;font-weight:700;">+</button>
      </div>
      <div style="position:relative;flex:1;">
        <input id="scanInput" placeholder="Cari nama produk / scan barcode" autocomplete="off"
          style="width:100%;height:42px;border:1px solid var(--outline);border-radius:10px;padding:0 12px;font-size:14.5px;box-sizing:border-box;">
        <div id="suggestList" style="position:absolute;top:46px;left:0;right:0;background:#fff;border:1px solid var(--outline);border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,.12);max-height:260px;overflow-y:auto;z-index:30;display:none;"></div>
      </div>
    </div>
    <div style="padding:6px 16px 0;text-align:right;">
      <button id="manualItemBtn" style="background:none;border:none;color:var(--ink-soft);font-size:12px;text-decoration:underline;">+ item bebas (bukan dari daftar produk)</button>
    </div>

    <div style="display:flex;align-items:center;padding:14px 16px 0;">
      <div style="flex:1;font-size:15px;font-weight:700;">Item (${state.lines.length})</div>
    </div>
    <div id="linesList"></div>
    <div style="padding:14px 16px;">
      <button id="discountPaymentBtn" class="btn secondary" style="margin:0;">Atur Diskon &amp; Pembayaran</button>
    </div>
    <div style="height:210px;"></div>

    <div style="position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:520px;background:#fff;border-top:1px solid var(--outline);padding:10px 16px calc(env(safe-area-inset-bottom,0px) + 12px);">
      <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--muted);margin-bottom:4px;">
        <span>Item: ${state.lines.length}</span><span>Qty: ${qtyLabel(totalQty)}</span><span>Subtotal: ${rupiah(subtotal)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
        <span style="font-weight:700;">TOTAL</span>
        <span style="font-size:26px;font-weight:800;">${rupiah(total)}</span>
      </div>
      <button id="saveBtn" class="btn" style="margin:0;" ${state.lines.length ? '' : 'disabled'}>Simpan Nota</button>
    </div>
  `;

  drawLines(root);
  wireScanInput(root);

  root.querySelector('#pickCustomer').onclick = () => pickCustomer(root);
  root.querySelector('#discountPaymentBtn').onclick = () => editDiscountPayment(root);
  root.querySelector('#manualItemBtn').onclick = () => addManualItem(root);
  root.querySelector('#saveBtn').onclick = () => save(root);

  root.querySelector('#qtyMinus').onclick = () => {
    state.stepperQty = Math.max(1, state.stepperQty - 1);
    root.querySelector('#qtyStepper').value = state.stepperQty;
  };
  root.querySelector('#qtyPlus').onclick = () => {
    state.stepperQty += 1;
    root.querySelector('#qtyStepper').value = state.stepperQty;
  };
  root.querySelector('#qtyStepper').onchange = (e) => {
    state.stepperQty = Math.max(1, Number(e.target.value) || 1);
  };
}

function wireScanInput(root) {
  const input = root.querySelector('#scanInput');
  const suggestBox = root.querySelector('#suggestList');

  function renderSuggestions(query) {
    const q = query.trim().toLowerCase();
    if (!q) { suggestBox.style.display = 'none'; return; }
    const matches = state.products.filter((p) =>
      p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.toLowerCase() === q)
    ).slice(0, 8);
    if (!matches.length) {
      suggestBox.innerHTML = `<div style="padding:12px;color:var(--muted);font-size:13px;">Tidak ditemukan. Ketuk "+ item bebas" untuk input manual.</div>`;
      suggestBox.style.display = 'block';
      return;
    }
    suggestBox.innerHTML = matches.map((p) => `
      <button class="row" data-id="${p.id}" style="width:100%;border-bottom:1px solid var(--outline);padding:10px 12px;">
        <div class="row-body"><div class="row-title">${escapeHtml(p.name)}</div>${p.category ? `<div class="row-meta">${escapeHtml(p.category)}</div>` : ''}</div>
        <div class="row-money">${rupiah(p.price)}</div>
      </button>`).join('');
    suggestBox.style.display = 'block';
    suggestBox.querySelectorAll('.row').forEach((r) => {
      r.onclick = () => addProductToLines(root, state.products.find((p) => p.id === r.dataset.id));
    });
  }

  input.oninput = (e) => renderSuggestions(e.target.value);

  input.onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    // Cocok PERSIS dengan barcode -> langsung tambah (perilaku scanner fisik).
    const exact = state.products.find((p) => p.barcode && p.barcode === q);
    if (exact) { addProductToLines(root, exact); return; }
    // Kalau cuma satu produk cocok berdasarkan nama, tambahkan juga.
    const nameMatches = state.products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
    if (nameMatches.length === 1) { addProductToLines(root, nameMatches[0]); return; }
    toast('Tidak ditemukan produk dengan kode/nama itu.');
  };

  document.addEventListener('click', (e) => {
    if (!suggestBox.contains(e.target) && e.target !== input) suggestBox.style.display = 'none';
  });
}

function addProductToLines(root, product) {
  if (!product) return;
  const qty = state.stepperQty || 1;
  const existing = state.lines.find((l) => l.productId === product.id);
  if (existing) existing.qty += qty;
  else state.lines.push({ productId: product.id, name: product.name, unit: product.unit, qty, price: product.price });
  state.stepperQty = 1;
  draw(root);
  // Fokus ulang ke input pencarian supaya bisa lanjut scan/ketik tanpa sentuh layar lagi.
  const input = root.querySelector('#scanInput');
  if (input) input.focus();
  toast(`+${qty} ${product.name}`);
}

async function addManualItem(root) {
  const line = await openSheet((body, close) => {
    body.innerHTML = `
      <div class="sheet-title">Item Bebas</div>
      <div class="field"><label>Nama item</label><input id="mName" autofocus></div>
      <div class="field"><label>Jumlah</label><input id="mQty" type="number" inputmode="decimal" value="${state.stepperQty}"></div>
      <div class="field"><label>Harga satuan</label><input id="mPrice" type="number" inputmode="numeric"></div>
      <button class="btn" id="mAdd">Tambahkan</button>
    `;
    body.querySelector('#mAdd').onclick = () => {
      const name = body.querySelector('#mName').value.trim();
      if (!name) return;
      const qty = Number(body.querySelector('#mQty').value) || 1;
      const price = Number(body.querySelector('#mPrice').value) || 0;
      close({ productId: null, name, unit: '', qty, price });
    };
  });
  if (line) { state.lines.push(line); state.stepperQty = 1; draw(root); }
}

function drawLines(root) {
  const el = root.querySelector('#linesList');
  if (!state.lines.length) {
    el.innerHTML = `<div style="padding:24px;text-align:center;color:var(--muted);font-size:13.5px;">Belum ada item. Cari/scan produk di atas untuk menambah.</div>`;
    return;
  }
  el.innerHTML = state.lines.map((l, i) => `
    <div class="item-line" data-i="${i}">
      <div style="flex:1;min-width:0;">
        <div class="il-name">${escapeHtml(l.name)}</div>
        <div class="il-detail">${qtyLabel(l.qty)} ${escapeHtml(l.unit || '')} x @ ${rupiah(l.price)},-</div>
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
      <button class="row" id="cashOpt"><div class="avatar" style="background:var(--primary);">C</div><div class="row-body"><div class="row-title">CASH</div><div class="row-meta">Pelanggan tanpa data</div></div></button>
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
      listEl.querySelectorAll('.row').forEach((r) => {
        r.onclick = () => close(rows.find((c) => c.id === r.dataset.id));
      });
    }
    drawList('');
    body.querySelector('#custSearch').oninput = (e) => drawList(e.target.value);
    body.querySelector('#cashOpt').onclick = () => close(cashCustomer());
    body.querySelector('#newOpt').onclick = () => close('new');
  });

  if (selected === 'new') {
    const newCustomer = await promptNewCustomer();
    if (newCustomer) { state.customer = newCustomer; draw(root); }
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
      <div class="field"><label>Alamat (opsional)</label><input id="nAddress"></div>
      <button class="btn" id="nSave">Simpan &amp; Pilih</button>
    `;
    body.querySelector('#nSave').onclick = async () => {
      const name = body.querySelector('#nName').value.trim();
      if (!name) { toast('Nama pelanggan wajib diisi'); return; }
      try {
        const created = await saveCustomer({ name, phone: body.querySelector('#nPhone').value, address: body.querySelector('#nAddress').value });
        close(created);
      } catch (e) { toast(e.message); }
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

async function editDiscountPayment(root) {
  await openSheet((body, close) => {
    body.innerHTML = `
      <div class="sheet-title">Diskon &amp; Pembayaran</div>
      <div class="field"><label>Diskon (Rp)</label><input id="dDiscount" type="number" inputmode="numeric" value="${state.discountAmount || ''}"></div>
      <div class="field"><label>Bayar (Rp)</label><input id="dPayment" type="number" inputmode="numeric" value="${state.payment || ''}"></div>
      <div class="field"><label>Catatan (opsional)</label><textarea id="dNote" rows="2">${escapeHtml(state.note)}</textarea></div>
      <button class="btn" id="dApply">Terapkan</button>
    `;
    body.querySelector('#dApply').onclick = () => {
      state.discountAmount = Number(body.querySelector('#dDiscount').value) || 0;
      state.payment = Number(body.querySelector('#dPayment').value) || 0;
      state.note = body.querySelector('#dNote').value;
      close(true);
    };
  });
  draw(root);
}

async function save(root) {
  if (!state.customer) { toast('Pilih pelanggan terlebih dahulu.'); return; }
  const saveBtn = root.querySelector('#saveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Menyimpan...';
  try {
    const saleId = await createSale({
      customer: state.customer,
      lines: state.lines,
      discountAmount: state.discountAmount,
      initialPayment: state.payment,
      note: state.note,
    });
    toast('Nota tersimpan');
    replaceRoute(`sale/${saleId}`);
  } catch (e) {
    toast(e instanceof AppError ? e.userMessage : 'Gagal menyimpan nota. Silakan coba lagi.');
    saveBtn.disabled = false;
    saveBtn.textContent = 'Simpan Nota';
  }
}
