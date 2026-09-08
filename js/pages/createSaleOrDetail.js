// pages/createSaleOrDetail.js — dispatcher kecil untuk rute "sale/*".
// "sale/new"        -> form buat nota baru
// "sale/<id>/edit"  -> form ubah nota yang sudah ada
// "sale/<id>"       -> detail nota

export async function render(root, params) {
  if (params[0] === 'new') {
    const mod = await import('./createSale.js');
    return mod.render(root, params.slice(1));
  }
  if (params[1] === 'edit') {
    const mod = await import('./saleEdit.js');
    return mod.render(root, [params[0]]);
  }
  const mod = await import('./saleDetail.js');
  return mod.render(root, params);
}
