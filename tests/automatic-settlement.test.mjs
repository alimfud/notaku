import test from 'node:test';
import assert from 'node:assert/strict';
import { settlementChanges, isSettlementDue } from '../js/services/automaticSettlement.js';

const today = '2026-10-01';
const stamp = '2026-10-01T00:00:00+07:00';
const sale = (extra = {}) => ({ id: 's1', total: 500000, saleDate: '2026-09-30', saleTime: '17:00', status: 'PARTIAL', completed: 0, ...extra });
const dp = { id: 'dp1', saleId: 's1', amount: 150000 };

test('one calendar day after pickup, including month/year boundaries', () => {
  assert.equal(isSettlementDue(sale(), today), true);
  assert.equal(isSettlementDue(sale({ saleDate: today }), today), false);
  assert.equal(isSettlementDue(sale({ saleDate: '2026-10-02' }), today), false);
  assert.equal(isSettlementDue(sale({ saleDate: '2026-12-31' }), '2027-01-01'), true);
  assert.equal(isSettlementDue(sale({ saleDate: 'invalid' }), today), false);
});

test('remaining balance is recorded at pickup date/time and marked completed', () => {
  const result = settlementChanges([sale()], [dp], today, stamp);
  assert.equal(result.payments.length, 1);
  assert.equal(result.payments[0].amount, 350000);
  assert.equal(result.payments[0].paymentDate, '2026-09-30');
  assert.equal(result.payments[0].paymentTime, '17:00');
  assert.equal(result.sales[0].status, 'PAID');
  assert.equal(result.sales[0].autoCompleted, 1);
  assert.equal(result.sales[0].completed, 1);
  assert.deepEqual(settlementChanges(result.sales, [dp, ...result.payments], today, stamp), { sales: [], payments: [] });
});

test('manual payments and cancellation are respected', () => {
  assert.equal(settlementChanges([sale({ autoLunasOverridden: 1 })], [dp], today, stamp).sales.length, 0);
  assert.equal(settlementChanges([sale({ isDeleted: 1 })], [dp], today, stamp).sales.length, 0);
  for (const amount of [500000, 600000]) {
    assert.deepEqual(settlementChanges([sale()], [{ ...dp, amount }], today, stamp), { sales: [], payments: [] });
  }
});

test('repair legacy paid flags or interrupted writes without another payment', () => {
  const old = sale({ autoMarkedPaid: 1, autoPaymentRecorded: 1, status: 'PAID' });
  const repaired = settlementChanges([old], [dp], today, stamp);
  assert.equal(repaired.payments[0].amount, 350000);
  const result = settlementChanges([old], [dp, ...repaired.payments], today, stamp);
  assert.equal(result.sales[0].autoCompleted, 1);
  assert.equal(result.payments.length, 0);
});

test('edited automatic payment is not silently topped up', () => {
  const result = settlementChanges([sale({ autoMarkedPaid: 1, autoPaymentRecorded: 1 })], [dp, { id: 'auto-lunas:s1', saleId: 's1', amount: 10000 }], today, stamp);
  assert.equal(result.payments.length, 0);
  assert.ok(result.sales.every(s => !s.completed));
});

test('large batch stays linear and does not mutate input records', () => {
  const sales = Array.from({ length: 10000 }, (_, i) => sale({ id: `s${i}` }));
  const payments = sales.map(s => ({ id: `dp:${s.id}`, saleId: s.id, amount: 100000 }));
  const result = settlementChanges(sales, payments, today, stamp);
  assert.equal(result.sales.length, 10000);
  assert.equal(result.payments.length, 10000);
  assert.equal(sales[0].completed, 0);
  assert.equal(new Set(result.payments.map(p => p.id)).size, 10000);
});
