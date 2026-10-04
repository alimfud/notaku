// customerService.js

import * as db from '../db.js';
import { uid } from '../format.js';

function normalizedName(name) {
  return (name || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID');
}

async function mergeDuplicateCustomers(rows) {
  const groups = new Map();
  for (const customer of rows.filter((row) => row.isActive !== 0)) {
    const key = normalizedName(customer.name);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(customer);
  }

  const updates = [];
  const mergedInto = new Map();
  const now = new Date().toISOString();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id));
    const [canonical, ...duplicates] = group;
    const merged = {
      ...canonical,
      phone: canonical.phone || duplicates.find((customer) => customer.phone)?.phone || '',
      address: canonical.address || duplicates.find((customer) => customer.address)?.address || '',
      updatedAt: now,
    };
    updates.push(merged);
    for (const duplicate of duplicates) {
      updates.push({ ...duplicate, isActive: 0, mergedIntoId: canonical.id, updatedAt: now });
      mergedInto.set(duplicate.id, canonical.id);
    }
  }
  if (!updates.length) return rows;

  const sales = await db.getAll('sales');
  const updatedSales = sales
    .filter((sale) => mergedInto.has(sale.customerId))
    .map((sale) => ({ ...sale, customerId: mergedInto.get(sale.customerId) }));
  const writes = { customers: updates };
  if (updatedSales.length) writes.sales = updatedSales;
  await db.bulkPutMulti(writes);
  const updatedById = new Map(updates.map((customer) => [customer.id, customer]));
  return rows.map((customer) => updatedById.get(customer.id) || customer);
}

export async function getAllCustomers({ search = '' } = {}) {
  let rows = await db.getAll('customers');
  rows = await mergeDuplicateCustomers(rows);
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
  const customers = await db.getAll('customers');
  const normalized = normalizedName(name);
  const current = id ? customers.find((customer) => customer.id === id) : null;
  const matches = customers.filter((customer) => customer.isActive !== 0 && normalizedName(customer.name) === normalized);
  const canonical = (current && normalizedName(current.name) === normalized ? current : matches[0]) || current || null;
  const candidates = [...new Map([...matches, ...(current ? [current] : [])].map((customer) => [customer.id, customer])).values()]
    .filter((customer) => customer.id !== canonical?.id);
  const canClearContact = Boolean(current && current.id === canonical?.id && candidates.length === 0);
  const canonicalId = canonical?.id || uid();
  const merged = {
    ...(canonical || {}),
    id: canonicalId,
    name: name.trim().replace(/\s+/g, ' '),
    phone: canClearContact ? (phone || '').trim() : (phone || '').trim() || canonical?.phone || candidates.find((customer) => customer.phone)?.phone || '',
    address: canClearContact ? (address || '').trim() : (address || '').trim() || canonical?.address || candidates.find((customer) => customer.address)?.address || '',
    isActive: 1,
    createdAt: canonical?.createdAt || now,
    updatedAt: now,
  };
  const writes = { customers: [merged] };
  const mergedIds = new Set(candidates.map((customer) => customer.id));
  if (candidates.length) {
    writes.customers.push(...candidates.map((customer) => ({ ...customer, isActive: 0, mergedIntoId: canonicalId, updatedAt: now })));
    const sales = await db.getAll('sales');
    const updatedSales = sales
      .filter((sale) => mergedIds.has(sale.customerId))
      .map((sale) => ({ ...sale, customerId: canonicalId }));
    if (updatedSales.length) writes.sales = updatedSales;
  }
  await db.bulkPutMulti(writes);
  return merged;
}

export async function deleteCustomer(id) {
  const existing = await db.get('customers', id);
  if (!existing) return;
  existing.isActive = 0;
  existing.updatedAt = new Date().toISOString();
  await db.put('customers', existing);
}

export function cashCustomer() {
  return { id: '', name: '', phone: '', address: '' };
}
