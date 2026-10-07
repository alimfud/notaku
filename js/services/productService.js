// productService.js

import * as db from '../db.js';
import { uid } from '../format.js';
import { recordAudit } from './auditLogService.js';

export async function getAllProducts({ search = '' } = {}) {
  let rows = await db.getAll('products');
  rows = rows.filter((p) => p.isActive !== 0);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    rows = rows.filter((p) => p.name.toLowerCase().includes(q));
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

export async function getProduct(id) {
  return db.get('products', id);
}

/** Build price changes for catalog products represented on the saved sale. */
export async function getSaleProductPriceUpdates(lines) {
  const latestPriceByProduct = new Map();
  for (const line of lines) {
    if (line.updateProductPrice && line.productId && Number.isFinite(Number(line.price)) && Number(line.price) >= 0) {
      latestPriceByProduct.set(line.productId, Number(line.price));
    }
  }
  if (!latestPriceByProduct.size) return [];

  const products = await db.getAll('products');
  const productsById = new Map(products.map((product) => [product.id, product]));
  const now = new Date().toISOString();
  return [...latestPriceByProduct].flatMap(([id, price]) => {
    const product = productsById.get(id);
    if (!product || Number(product.price) === price) return [];
    return [{ ...product, price, updatedAt: now }];
  });
}

export async function saveProduct({ id, name, category, unit, price, cost, stock, barcode, imageData }) {
  if (!name || !name.trim()) throw new Error('Nama produk wajib diisi.');
  const now = new Date().toISOString();
  if (id) {
    const existing = await db.get('products', id);
    const updated = {
      ...existing,
      imageData: imageData === undefined ? (existing?.imageData || '') : imageData,
      name: name.trim(),
      category: (category || '').trim(),
      unit: (unit || 'pcs').trim() || 'pcs',
      price: Number(price) || 0,
      cost: Number(cost) || 0,
      stock: Number(stock) || 0,
      barcode: (barcode || '').trim(),
      updatedAt: now,
    };
    await db.put('products', updated);
    await recordAudit('update', 'product', updated.id, `Produk diperbarui: ${updated.name}`);
    return updated;
  }
  const created = {
    imageData: imageData || '',
    id: uid(),
    name: name.trim(),
    category: (category || '').trim(),
    unit: (unit || 'pcs').trim() || 'pcs',
    price: Number(price) || 0,
    cost: Number(cost) || 0,
    stock: Number(stock) || 0,
    barcode: (barcode || '').trim(),
    isActive: 1,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('products', created);
  await recordAudit('create', 'product', created.id, `Produk dibuat: ${created.name}`);
  return created;
}

export async function deleteProduct(id) {
  const existing = await db.get('products', id);
  if (!existing) return;
  existing.isActive = 0;
  existing.updatedAt = new Date().toISOString();
  await db.put('products', existing);
  await recordAudit('delete', 'product', id, `Produk dinonaktifkan: ${existing.name}`);
}
