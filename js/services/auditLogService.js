import * as db from '../db.js';
import { uid } from '../format.js';

export async function recordAudit(action, entityType, entityId = '', details = '') {
  try {
    await db.put('auditLogs', {
      id: uid(), action, entityType, entityId, details,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('[audit]', error);
  }
}

export async function getAuditLogs(limit = 200) {
  const rows = await db.getAll('auditLogs');
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}
