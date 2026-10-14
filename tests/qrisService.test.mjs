import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDynamicQrisPayload, isValidQrisPayload } from '../js/services/qrisService.js';

const STATIC_QRIS = '00020101021126610016ID.CO.SHOPEE.WWW01189360091800230223530208230223530303UMI51440014ID.CO.QRIS.WWW0215ID10265163524850303UMI5204581753033605802ID5913Chick n booth6010PEKALONGAN61055118262070703A016304B9ED';

function parseTlv(payload) {
  const body = payload.replace(/6304[0-9A-F]{4}$/i, '');
  const entries = [];
  let offset = 0;
  while (offset < body.length) {
    const tag = body.slice(offset, offset + 2);
    const length = Number(body.slice(offset + 2, offset + 4));
    const start = offset + 4;
    entries.push({ tag, value: body.slice(start, start + length) });
    offset = start + length;
  }
  return entries;
}

test('buildDynamicQrisPayload creates a valid amount-specific payload', () => {
  const dynamic = buildDynamicQrisPayload(STATIC_QRIS, 12500, 'INV-001');
  const entries = parseTlv(dynamic);
  const amount = entries.find((entry) => entry.tag === '54');
  const poi = entries.find((entry) => entry.tag === '01');
  const additional = entries.find((entry) => entry.tag === '62');

  assert.equal(isValidQrisPayload(dynamic), true);
  assert.equal(poi?.value, '12');
  assert.equal(amount?.value, '12500.00');
  assert.match(additional?.value || '', /0507INV-001/);
  assert.match(dynamic, /6304[0-9A-F]{4}$/i);
});

test('payload whitespace in merchant data is preserved', () => {
  const dynamic = buildDynamicQrisPayload(STATIC_QRIS, 5000, 'INV-002');
  assert.match(dynamic, /5913Chick n booth/);
  assert.equal(isValidQrisPayload(dynamic), true);
});
