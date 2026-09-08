// customerService.js

import * as db from '../db.js';
import { uid } from '../format.js';

export async function getAllCustomers({ search = '' } = {}) {
  let rows = await db.getAll('customers');
  rows = rows.filter((c) => c.isActive !== 0);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    rows = rows.filter((c) => c.name.toLowerCase().includes(q) || (c.phone || '').includes(q));
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

export async function getCustomer(id) {
  return db.get('customers', id);
}

export async function saveCustomer({ id, name, phone, address }) {
  if (!name || !name.trim()) throw new Error('Nama pelanggan wajib diisi.');
  const now = new Date().toISOString();
  if (id) {
    const existing = await db.get('customers', id);
    const updated = { ...existing, name: name.trim(), phone: (phone || '').trim(), address: (address || '').trim(), updatedAt: now };
    await db.put('customers', updated);
    return updated;
  }
  const created = {
    id: uid(),
    name: name.trim(),
    phone: (phone || '').trim(),
    address: (address || '').trim(),
    isActive: 1,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('customers', created);
  return created;
}

export async function deleteCustomer(id) {
  const existing = await db.get('customers', id);
  if (!existing) return;
  existing.isActive = 0;
  existing.updatedAt = new Date().toISOString();
  await db.put('customers', existing);
}

export function cashCustomer() {
  return { id: '', name: 'CASH', phone: '', address: '' };
}
