// pages/createSaleOrDetail.js — dispatcher kecil untuk rute "sale/*".
// "sale/new" -> form buat nota baru. "sale/<id>" -> detail nota.

export async function render(root, params) {
  if (params[0] === 'new') {
    const mod = await import('./createSale.js');
    return mod.render(root, params.slice(1));
  }
  const mod = await import('./saleDetail.js');
  return mod.render(root, params);
}
