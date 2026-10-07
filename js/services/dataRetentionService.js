import * as db from '../db.js';
import { purgeExpiredAuditLogs } from './auditLogService.js';

const RETENTION_DAYS = 30;
let cleanupPromise = null;

export function cleanupExpiredData() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const sales = await db.getAll('sales');
    const expiredSales = sales.filter((sale) => sale.isDeleted && sale.deletedAt && new Date(sale.deletedAt).getTime() < cutoff);
    for (const sale of expiredSales) {
      await db.removeByIndex('saleItems', 'saleId', sale.id);
      await db.removeByIndex('payments', 'saleId', sale.id);
      await db.remove('sales', sale.id);
    }
    await purgeExpiredAuditLogs(RETENTION_DAYS);
  })().catch((error) => console.warn('[retention]', error)).finally(() => { cleanupPromise = null; });
  return cleanupPromise;
}
