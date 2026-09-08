// productService.js

import * as db from '../db.js';
import { uid } from '../format.js';

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

export async function saveProduct({ id, name, category, unit, price, cost, stock, barcode }) {
  if (!name || !name.trim()) throw new Error('Nama produk wajib diisi.');
  const now = new Date().toISOString();
  if (id) {
    const existing = await db.get('products', id);
    const updated = {
      ...existing,
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
    return updated;
  }
  const created = {
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
  return created;
}

export async function deleteProduct(id) {
  const existing = await db.get('products', id);
  if (!existing) return;
  existing.isActive = 0;
  existing.updatedAt = new Date().toISOString();
  await db.put('products', existing);
}
