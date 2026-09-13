// pages/saleFormShared.js
//
// Satu implementasi UI dipakai BERSAMA oleh "Nota Baru" (createSale.js) dan
// "Ubah Nota" (saleEdit.js) — supaya keduanya TIDAK PERNAH tampil beda lagi.
// Beda antara mode 'create' dan 'edit' HANYA pada: field tanggal/jam (cuma
// muncul di mode edit) dan field pembayaran awal (cuma muncul di mode create,
// karena di mode edit pembayaran diatur terpisah lewat riwayat pembayaran).

import { getAllCustomers, cashCustomer, saveCustomer } from '../services/customerService.js';
import { getAllProducts, saveProduct } from '../services/productService.js';
import { calculateSubtotal, computeAdjustments, defaultAdjustments } from '../services/saleCalculation.js';
import { rupiah, escapeHtml, qtyLabel } from '../format.js';
import { openSheet } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';

/**
 * @param {HTMLElement} root
 * @param {'create'|'edit'} mode
 * @param {object} initial - { customer, lines, adjustments, note, payment, saleDate, saleTime }
 * @param {(state) => Promise<void>} onSave - dipanggil saat tombol Simpan ditekan, `state` berisi seluruh data form saat ini
 */
export async function renderSaleForm(root, mode, initial, onSave) {
  const state = {
    customer: initial.customer || { id: '', name: '', phone: '', address: '' },
    lines: initial.lines || [],
    adjustments: initial.adjustments || defaultAdjustments(),
    note: initial.note || '',
    payment: initial.payment || 0,
    saleDate: initial.saleDate || null,
    saleTime: initial.saleTime || null,
    stepperQty: 1,
    products: await getAllProducts(),
    saving: false,
  };

  draw(root, mode, state, onSave);
}

function draw(root, mode, state, onSave) {
  // Disimpan di elemen root supaya semua handler internal (tambah item,
  // hapus item, dst) yang memicu redraw bisa selalu tahu mode & callback
  // simpan yang sedang aktif, tanpa perlu diteruskan manual di tiap pemanggilan.
  root._notakuFormMode = mode;
  root._notakuFormOnSave = onSave;

  const subtotal = calculateSubtotal(state.lines);
  const calc = computeAdjustments(subtotal, state.adjustments);
  const totalQty = state.lines.reduce((s, l) => s + l.qty, 0);
  const c = state.customer;

  root.innerHTML = `
    <div style="padding:16px 16px 0;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;">Kepada Yth</div>
        <button id="pickCustomerBtn" style="background:none;border:none;color:var(--ink);font-size:12.5px;text-decoration:underline;">Pilih dari daftar</button>
      </div>
      <div class="field" style="border:1px solid var(--outline);border-radius:10px;margin-bottom:8px;"><label>Nama</label><input id="custName" value="${escapeHtml(c.name)}" placeholder="Nama pelanggan"></div>
      <div style="display:flex;gap:8px;">
        <div class="field" style="flex:1;border:1px solid var(--outline);border-radius:10px;"><label>Alamat</label><input id="custAddress" value="${escapeHtml(c.address)}" placeholder="(opsional)"></div>
        <div class="field" style="flex:1;border:1px solid var(--outline);border-radius:10px;"><label>Telepon</label><input id="custPhone" value="${escapeHtml(c.phone)}" placeholder="(opsional)"></div>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:4px;">Data di atas bisa diedit langsung kalau kurang tepat — perubahan ikut memperbarui data pelanggan tersimpan.</div>
    </div>

    ${mode === 'edit' ? `
    <div class="field" style="padding:12px 16px 0;display:flex;gap:12px;">
      <div style="flex:1;"><label>Tanggal Transaksi</label><input id="fDate" type="date" value="${state.saleDate}"></div>
      <div style="flex:1;"><label>Jam</label><input id="fTime" type="time" value="${state.saleTime}"></div>
    </div>` : ''}

    <div style="padding:14px 16px 0;display:flex;gap:8px;align-items:stretch;">
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
      <button id="adjustmentsBtn" class="btn secondary" style="margin:0;">Atur Tambahan (Diskon, Pajak, Ongkir, dll)</button>
    </div>
    <div style="height:230px;"></div>

    <div style="position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:520px;background:#fff;border-top:1px solid var(--outline);padding:10px 16px calc(env(safe-area-inset-bottom,0px) + 12px);">
      <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--muted);margin-bottom:4px;">
        <span>Item: ${state.lines.length}</span><span>Qty: ${qtyLabel(totalQty)}</span><span>Subtotal: ${rupiah(subtotal)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
        <span style="font-weight:700;">TOTAL</span>
        <span style="font-size:26px;font-weight:800;">${rupiah(calc.total)}</span>
      </div>
      <button id="saveBtn" class="btn" style="margin:0;" ${state.lines.length ? '' : 'disabled'}>${mode === 'edit' ? 'Simpan Perubahan' : 'Simpan Nota'}</button>
    </div>
  `;

  drawLines(root, state);
  wireScanInput(root, state);

  root.querySelector('#custName').oninput = (e) => { state.customer.name = e.target.value; };
  root.querySelector('#custAddress').oninput = (e) => { state.customer.address = e.target.value; };
  root.querySelector('#custPhone').oninput = (e) => { state.customer.phone = e.target.value; };
  root.querySelector('#pickCustomerBtn').onclick = () => pickCustomer(root, mode, state, onSave);

  if (mode === 'edit') {
    root.querySelector('#fDate').onchange = (e) => { state.saleDate = e.target.value; };
    root.querySelector('#fTime').onchange = (e) => { state.saleTime = e.target.value; };
  }

  root.querySelector('#adjustmentsBtn').onclick = () => editAdjustments(root, mode, state, onSave);
  root.querySelector('#manualItemBtn').onclick = () => addManualItem(root, mode, state, onSave);
  root.querySelector('#saveBtn').onclick = () => save(root, mode, state, onSave);

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

function wireScanInput(root, state) {
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
      r.onclick = () => addProductToLines(root, state, state.products.find((p) => p.id === r.dataset.id));
    });
  }

  input.oninput = (e) => renderSuggestions(e.target.value);

  input.onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    const exact = state.products.find((p) => p.barcode && p.barcode === q);
    if (exact) { addProductToLines(root, state, exact); return; }
    const nameMatches = state.products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
    if (nameMatches.length === 1) { addProductToLines(root, state, nameMatches[0]); return; }
    toast('Tidak ditemukan produk dengan kode/nama itu.');
  };

  document.addEventListener('click', (e) => {
    if (!suggestBox.contains(e.target) && e.target !== input) suggestBox.style.display = 'none';
  });
}

function addProductToLines(root, state, product) {
  if (!product) return;
  const qty = state.stepperQty || 1;
  const existing = state.lines.find((l) => l.productId === product.id);
  if (existing) existing.qty += qty;
  else state.lines.push({ productId: product.id, name: product.name, unit: product.unit, qty, price: product.price });
  state.stepperQty = 1;
  draw(root, root._notakuFormMode, state, root._notakuFormOnSave);
  const input = root.querySelector('#scanInput');
  if (input) input.focus();
  toast(`+${qty} ${product.name}`);
}

async function addManualItem(root, mode, state, onSave) {
  const line = await openSheet((body, close) => {
    body.innerHTML = `
      <div class="sheet-title">Item Bebas</div>
      <div class="field"><label>Nama item</label><input id="mName" autofocus></div>
      <div style="display:flex;gap:8px;">
        <div class="field" style="flex:1;"><label>Satuan</label><input id="mUnit" placeholder="pcs, kg, box, ..." value="pcs"></div>
        <div class="field" style="flex:1;"><label>Jumlah</label><input id="mQty" type="number" inputmode="decimal" value="${state.stepperQty}"></div>
      </div>
      <div class="field"><label>Harga satuan</label><input id="mPrice" type="number" inputmode="numeric"></div>
      <div style="font-size:11px;color:var(--muted);padding:0 20px 8px;">Kalau nama ini belum ada di daftar produk, otomatis disimpan sebagai produk baru supaya bisa dicari/dipakai lagi lain kali.</div>
      <button class="btn" id="mAdd">Tambahkan</button>
    `;
    body.querySelector('#mAdd').onclick = () => {
      const name = body.querySelector('#mName').value.trim();
      if (!name) return;
      const unit = body.querySelector('#mUnit').value.trim() || 'pcs';
      const qty = Number(body.querySelector('#mQty').value) || 1;
      const price = Number(body.querySelector('#mPrice').value) || 0;
      close({ productId: null, name, unit, qty, price });
    };
  });
  if (!line) return;

  // Kalau namanya sudah ada di daftar produk (tidak peka huruf besar/kecil),
  // pakai produk itu (id-nya) — jangan bikin produk duplikat. Kalau belum
  // ada, simpan sebagai produk baru supaya lain kali bisa dicari/di-scan,
  // TIDAK peduli item ditambahkan lewat "item bebas" atau jalur mana pun.
  const existing = state.products.find((p) => p.name.toLowerCase() === name_lower(line.name));
  if (existing) {
    line.productId = existing.id;
  } else {
    try {
      const created = await saveProduct({ name: line.name, unit: line.unit, price: line.price, category: '', cost: 0, stock: 0 });
      line.productId = created.id;
      state.products.push(created); // supaya langsung bisa dicari di sesi yang sama tanpa reload
      toast(`"${created.name}" disimpan sebagai produk baru`);
    } catch (e) {
      console.error('[addManualItem] gagal menyimpan produk baru', e);
      // Tetap lanjut menambahkan ke nota walau gagal disimpan sebagai produk —
      // jangan sampai kegagalan simpan produk menghalangi transaksi berjalan.
    }
  }

  state.lines.push(line);
  state.stepperQty = 1;
  draw(root, mode, state, onSave);
}

function name_lower(s) {
  return (s || '').trim().toLowerCase();
}

function drawLines(root, state) {
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
      editLine(root, state, Number(line.dataset.i));
    });
  });
  el.querySelectorAll('.il-remove').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      state.lines.splice(Number(btn.dataset.i), 1);
      draw(root, root._notakuFormMode, state, root._notakuFormOnSave);
    };
  });
}

async function editLine(root, state, index) {
  const line = state.lines[index];
  await openSheet((body, close) => {
    body.innerHTML = `
      <div class="sheet-title">${escapeHtml(line.name)}</div>
      <div class="field"><label>Nama Item</label><input id="eName" value="${escapeHtml(line.name)}"></div>
      <div style="display:flex;gap:8px;">
        <div class="field" style="flex:1;"><label>Satuan</label><input id="eUnit" value="${escapeHtml(line.unit || '')}" placeholder="pcs, kg, box, dus, ..."></div>
        <div class="field" style="flex:1;"><label>Jumlah</label><input id="eQty" type="number" inputmode="decimal" value="${line.qty}"></div>
      </div>
      <div class="field"><label>Harga Satuan</label><input id="ePrice" type="number" inputmode="numeric" value="${Math.round(line.price)}"></div>
      <div class="field"><label>Catatan Item (opsional)</label><input id="eNote" value="${escapeHtml(line.note || '')}" placeholder="mis. pedas level 2, tanpa bawang"></div>
      <div class="total-box" style="margin:16px;">
        <div class="total-row grand"><span>Jumlah Harga</span><span id="eSubtotalPreview">${rupiah(line.qty * line.price)}</span></div>
      </div>
      <button class="btn" id="eApply">Terapkan</button>
    `;
    const qtyInput = body.querySelector('#eQty');
    const priceInput = body.querySelector('#ePrice');
    const preview = body.querySelector('#eSubtotalPreview');
    function updatePreview() {
      const q = Number(qtyInput.value) || 0;
      const p = Number(priceInput.value) || 0;
      preview.textContent = rupiah(q * p);
    }
    qtyInput.addEventListener('input', updatePreview);
    priceInput.addEventListener('input', updatePreview);
    body.querySelector('#eApply').onclick = () => {
      const name = body.querySelector('#eName').value.trim();
      if (name) line.name = name;
      line.unit = body.querySelector('#eUnit').value.trim();
      line.qty = Number(qtyInput.value) || line.qty;
      line.price = Number(priceInput.value) || 0;
      line.note = body.querySelector('#eNote').value.trim();
      close(true);
    };
  });
  draw(root, root._notakuFormMode, state, root._notakuFormOnSave);
}

async function pickCustomer(root, mode, state, onSave) {
  const customers = await getAllCustomers();
  const selected = await openSheet((body, close) => {
    body.innerHTML = `
      <div class="sheet-title">Pilih Pelanggan</div>
      <div class="field"><input id="custSearch" placeholder="Cari nama pelanggan" autofocus></div>
      <button class="row" id="cashOpt"><div class="avatar" style="background:var(--primary);">C</div><div class="row-body"><div class="row-title">CASH</div><div class="row-meta">Kosongkan data (isi manual)</div></div></button>
      <div id="custList" class="list"></div>
    `;
    const listEl = body.querySelector('#custList');
    function drawList(filter) {
      const f = filter.toLowerCase();
      const rows = customers.filter((c2) => c2.name.toLowerCase().includes(f));
      listEl.innerHTML = rows.map((c2) => `
        <button class="row" data-id="${c2.id}">
          <div class="avatar">${c2.name[0]?.toUpperCase() || '?'}</div>
          <div class="row-body"><div class="row-title">${escapeHtml(c2.name)}</div>${c2.phone ? `<div class="row-meta">${escapeHtml(c2.phone)}</div>` : ''}</div>
        </button>`).join('');
      listEl.querySelectorAll('.row').forEach((r) => {
        r.onclick = () => close(rows.find((c2) => c2.id === r.dataset.id));
      });
    }
    drawList('');
    body.querySelector('#custSearch').oninput = (e) => drawList(e.target.value);
    body.querySelector('#cashOpt').onclick = () => close(cashCustomer());
  });

  if (selected) {
    state.customer = { id: selected.id || '', name: selected.name, phone: selected.phone || '', address: selected.address || '' };
    draw(root, mode, state, onSave);
  }
}

async function editAdjustments(root, mode, state, onSave) {
  const a = state.adjustments;
  await openSheet((body, close) => {
    body.innerHTML = `
      <div class="sheet-title">Tambahan</div>

      <label style="display:flex;align-items:center;justify-content:space-between;padding:12px 20px 0;">
        <span style="font-weight:700;font-size:14px;">Diskon</span>
        <input type="checkbox" id="tDiscOn" ${a.discount.enabled ? 'checked' : ''}>
      </label>
      <div class="field" style="display:flex;gap:8px;align-items:center;">
        <select id="tDiscMode" style="border:none;font-size:14px;background:transparent;">
          <option value="amount" ${a.discount.mode === 'amount' ? 'selected' : ''}>Rp</option>
          <option value="percent" ${a.discount.mode === 'percent' ? 'selected' : ''}>%</option>
        </select>
        <input id="tDiscValue" type="number" inputmode="numeric" value="${a.discount.value || ''}" placeholder="0" style="flex:1;">
      </div>

      <label style="display:flex;align-items:center;justify-content:space-between;padding:12px 20px 0;">
        <span style="font-weight:700;font-size:14px;">Pajak</span>
        <input type="checkbox" id="tTaxOn" ${a.tax.enabled ? 'checked' : ''}>
      </label>
      <div class="field" style="display:flex;gap:10px;align-items:center;">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;white-space:nowrap;"><input type="checkbox" id="tTaxIncl" ${a.tax.inclusive ? 'checked' : ''}> Inclusive</label>
        <input id="tTaxPercent" type="number" inputmode="numeric" value="${a.tax.percent || ''}" placeholder="0" style="flex:1;"> <span>%</span>
      </div>

      <label style="display:flex;align-items:center;justify-content:space-between;padding:12px 20px 0;">
        <span style="font-weight:700;font-size:14px;">Pajak #2</span>
        <input type="checkbox" id="tTax2On" ${a.tax2.enabled ? 'checked' : ''}>
      </label>
      <div class="field" style="display:flex;gap:10px;align-items:center;">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;white-space:nowrap;"><input type="checkbox" id="tTax2Incl" ${a.tax2.inclusive ? 'checked' : ''}> Inclusive</label>
        <input id="tTax2Percent" type="number" inputmode="numeric" value="${a.tax2.percent || ''}" placeholder="0" style="flex:1;"> <span>%</span>
      </div>

      <label style="display:flex;align-items:center;justify-content:space-between;padding:12px 20px 0;">
        <span style="font-weight:700;font-size:14px;">Ongkos Kirim</span>
        <input type="checkbox" id="tShipOn" ${a.shipping.enabled ? 'checked' : ''}>
      </label>
      <div class="field"><input id="tShipAmount" type="number" inputmode="numeric" value="${a.shipping.amount || ''}" placeholder="0"></div>

      <label style="display:flex;align-items:center;justify-content:space-between;padding:12px 20px 0;">
        <span style="font-weight:700;font-size:14px;">Lain-lain</span>
        <input type="checkbox" id="tOtherOn" ${a.other.enabled ? 'checked' : ''}>
      </label>
      <div class="field" style="display:flex;gap:8px;">
        <input id="tOtherLabel" value="${escapeHtml(a.other.label || '')}" placeholder="Label" style="flex:1;">
        <input id="tOtherAmount" type="number" inputmode="numeric" value="${a.other.amount || ''}" placeholder="0" style="flex:1;">
      </div>

      ${mode === 'create' ? `
      <div class="section-title">Pembayaran</div>
      <div class="field"><label>Bayar Sekarang (Rp)</label><input id="tPayment" type="number" inputmode="numeric" value="${state.payment || ''}"></div>` : ''}

      <div class="field"><label>Catatan (opsional)</label><textarea id="tNote" rows="2">${escapeHtml(state.note)}</textarea></div>

      <button class="btn" id="tApply">Terapkan</button>
    `;
    body.querySelector('#tApply').onclick = () => {
      state.adjustments = {
        discount: { enabled: body.querySelector('#tDiscOn').checked, mode: body.querySelector('#tDiscMode').value, value: Number(body.querySelector('#tDiscValue').value) || 0 },
        tax: { enabled: body.querySelector('#tTaxOn').checked, inclusive: body.querySelector('#tTaxIncl').checked, percent: Number(body.querySelector('#tTaxPercent').value) || 0 },
        tax2: { enabled: body.querySelector('#tTax2On').checked, inclusive: body.querySelector('#tTax2Incl').checked, percent: Number(body.querySelector('#tTax2Percent').value) || 0 },
        shipping: { enabled: body.querySelector('#tShipOn').checked, amount: Number(body.querySelector('#tShipAmount').value) || 0 },
        other: { enabled: body.querySelector('#tOtherOn').checked, label: body.querySelector('#tOtherLabel').value.trim(), amount: Number(body.querySelector('#tOtherAmount').value) || 0 },
      };
      if (mode === 'create') state.payment = Number(body.querySelector('#tPayment').value) || 0;
      state.note = body.querySelector('#tNote').value;
      close(true);
    };
  });
  draw(root, mode, state, onSave);
}

async function save(root, mode, state, onSave) {
  if (!state.customer.name.trim()) { toast('Nama pelanggan wajib diisi.'); return; }
  if (state.saving) return;
  state.saving = true;
  const saveBtn = root.querySelector('#saveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Menyimpan...';
  try {
    await onSave(state);
  } catch (e) {
    toast(e.userMessage || e.message || 'Gagal menyimpan. Silakan coba lagi.');
    state.saving = false;
    saveBtn.disabled = false;
    saveBtn.textContent = mode === 'edit' ? 'Simpan Perubahan' : 'Simpan Nota';
  }
}
