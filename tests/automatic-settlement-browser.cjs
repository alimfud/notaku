// Isolated browser context: never opens the user's browser/database profile.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ timezoneId: 'Asia/Jakarta', serviceWorkers: 'block' });
    await context.route('http://localhost/notaku/', route => route.fulfill({ contentType: 'text/html', body: '<title>Automation test</title>' }));
    await context.addInitScript(() => {
      const NativeDate = Date;
      window.__testNow = NativeDate.parse('2026-10-01T23:59:55+07:00');
      window.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [window.__testNow])); }
        static now() { return window.__testNow; }
      };
      window.__transactions = 0;
      const transaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (...args) { window.__transactions++; return transaction.apply(this, args); };
    });
    const first = await context.newPage(), second = await context.newPage();
    for (const page of [first, second]) {
      await page.goto('http://localhost/notaku/');
      await page.evaluate(async () => {
        window.db = await import('./js/db.js');
        window.service = await import('./js/services/saleService.js');
      });
    }
    await first.evaluate(async () => {
      const sales = Array.from({ length: 10000 }, (_, i) => ({ id: `batch-${i}`, total: 500000, status: 'PARTIAL', saleDate: '2026-09-30', saleTime: '15:00', completed: 0 }));
      const payments = sales.map(s => ({ id: `dp:${s.id}`, saleId: s.id, amount: 150000 }));
      await db.bulkPutMulti({ sales, payments });
    });
    const started = Date.now();
    const counts = await Promise.all([first, second].map(page => page.evaluate(() => service.applyAutomaticStatusRules())));
    assert.equal(counts.reduce((a, b) => a + b, 0), 10000);
    const totals = await first.evaluate(async () => {
      const sales = await db.getAll('sales'), payments = await db.getAll('payments');
      return { complete: sales.filter(s => s.autoCompleted && s.completed).length, auto: payments.filter(p => p.isAutomatic).length, paid: payments.reduce((sum, p) => sum + p.amount, 0) };
    });
    assert.deepEqual(totals, { complete: 10000, auto: 10000, paid: 5000000000 });
    console.log(`PASS 10,000 notes across two concurrent tabs: ${Date.now() - started}ms including reads/verification; no duplicate payments`);
    const cache = await first.evaluate(async () => {
      await service.applyAutomaticStatusRules();
      const count = window.__transactions;
      const changes = await Promise.all(Array.from({ length: 100 }, () => service.applyAutomaticStatusRules()));
      return { transactions: window.__transactions - count, changes: changes.reduce((a, b) => a + b, 0) };
    });
    assert.deepEqual(cache, { transactions: 0, changes: 0 });
    console.log('PASS 100 repeated checks: zero database transactions');
    const rollback = await first.evaluate(async () => {
      await db.put('sales', { id: 'rollback', total: 100, saleDate: '2026-09-30', status: 'UNPAID', completed: 0 });
      // Wait for commit before injecting an error into the settlement transaction.
      await db.getAll('sales');
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value, ...rest) {
        if (this.name === 'payments' && value.saleId === 'rollback') throw new Error('Injected payment failure');
        return put.call(this, value, ...rest);
      };
      let failed = false;
      try { await service.applyAutomaticStatusRules(); } catch { failed = true; }
      finally { IDBObjectStore.prototype.put = put; }
      const sale = await db.get('sales', 'rollback');
      const payments = await db.getByIndex('payments', 'saleId', 'rollback');
      const retry = await service.applyAutomaticStatusRules();
      return { failed, completed: sale.completed, payments: payments.length, retry };
    });
    assert.deepEqual(rollback, { failed: true, completed: 0, payments: 0, retry: 1 });
    console.log('PASS atomic rollback and immediate retry after a failed payment write');
    const correction = await first.evaluate(async () => {
      await service.revertAutoLunas('batch-0');
      await service.applyAutomaticStatusRules();
      const summary = await service.getSaleSummary('batch-0');
      return { paid: summary.paidAmount, remaining: summary.remaining, completed: summary.sale.completed, count: summary.payments.length };
    });
    assert.deepEqual(correction, { paid: 150000, remaining: 350000, completed: 0, count: 1 });
    console.log('PASS cancellation keeps DP and does not regenerate settlement');
    const rollover = await first.evaluate(async () => {
      await db.bulkPut('sales', [{ id: 'midnight', total: 1000, saleDate: '2026-10-01', status: 'UNPAID', completed: 0 }]);
      const before = await service.applyAutomaticStatusRules();
      window.__testNow += 10000; // 00:00:05, still within the 30-second cache TTL.
      const after = await service.applyAutomaticStatusRules();
      const summary = await service.getSaleSummary('midnight');
      return { before, after, paid: summary.paidAmount, complete: summary.sale.completed };
    });
    assert.deepEqual(rollover, { before: 0, after: 1, paid: 1000, complete: 1 });
    console.log('PASS midnight invalidates cache inside 30 seconds; today is untouched until tomorrow');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
