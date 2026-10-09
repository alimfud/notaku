import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('../js/services/driveBackupService.js', import.meta.url), 'utf8'))
  .replace(/^import .*;$/gm, '').replace(/^export /gm, '');

function fixture({ enabled = true, fail = false } = {}) {
  let now = Date.parse('2026-10-05T14:30:00Z');
  const data = { products: [], customers: [], sales: [], saleItems: [], payments: [], expenses: [], settings: [] };
  let settings = { autoBackup: { driveConnected: true, autoSyncEnabled: enabled, autoSyncIntervalMinutes: 5, lastSyncAt: '2026-10-05T14:25:00Z' } };
  const events = [];
  let requests = 0;
  let release;
  let gate = new Promise((resolve) => { release = resolve; });
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const context = vm.createContext({
    Date: Clock, GOOGLE_CLIENT_ID: 'configured', navigator: { onLine: true },
    AbortController, setTimeout, clearTimeout,
    persistentAccess: async () => null,
    getSettings: async () => settings,
    saveSettings: async (partial) => { settings = { ...settings, ...partial }; },
    db: { dumpAll: async () => data },
    window: { dispatchEvent(event) { events.push(event.detail); } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    console: { error() {} },
    fetch: async (url) => {
      requests++;
      if (!url.includes('alt=media')) return { ok: true, json: async () => ({ files: [{ id: 'sync' }] }) };
      await gate;
      if (fail) throw new Error('Koneksi terputus');
      return { ok: true, json: async () => ({ app: 'notaku', data }) };
    },
  });
  vm.runInContext(source + '\n globalThis.sync = checkAutomaticSync; _accessToken = "valid"; _tokenExpiryMs = Date.now() + 3600000;', context);
  return { context, events, get settings() { return settings; }, get requests() { return requests; },
    advance(ms) { now += ms; }, release() { release(); gate = Promise.resolve(); } };
}

test('automatic sync publishes running and success states without a click; next interval advances the timestamp', async () => {
  const f = fixture();
  const pending = f.context.sync();
  await new Promise(setImmediate);
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0].syncing, true);
  assert.equal(f.events[0].lastSyncAt, '2026-10-05T14:25:00Z');
  assert.equal(f.context.sync(), pending);
  f.release();
  await pending;
  assert.equal(f.events.at(-1).syncing, false);
  assert.equal(f.events.at(-1).lastSyncAt, '2026-10-05T14:30:00.000Z');
  assert.equal(f.events.at(-1).lastSyncProblem, false);
  assert.ok(f.settings.autoBackup.lastSyncFingerprint);
  const requests = f.requests;
  f.advance(60000);
  await f.context.sync();
  assert.equal(f.requests, requests);
  assert.equal(f.events.length, 2);
  f.advance(240000);
  await f.context.sync();
  assert.equal(f.events.at(-1).lastSyncAt, '2026-10-05T14:35:00.000Z');
  assert.equal(f.events.length, 4);
});

test('failed automatic sync keeps the last successful timestamp and publishes pending status', async () => {
  const f = fixture({ fail: true });
  f.release();
  await f.context.sync();
  assert.equal(f.events.at(-1).syncing, false);
  assert.equal(f.events.at(-1).lastSyncProblem, true);
  assert.equal(f.events.at(-1).lastSyncAt, '2026-10-05T14:25:00Z');
  assert.equal(f.events.at(-1).lastSyncStatus, 'Koneksi terputus');
});

test('paused automatic sync is silent but Sync now still works', async () => {
  const f = fixture({ enabled: false });
  await f.context.sync();
  assert.equal(f.events.length, 0);
  assert.equal(f.requests, 0);
  f.release();
  await f.context.sync({ force: true });
  assert.equal(f.events.at(-1).lastSyncAt, '2026-10-05T14:30:00.000Z');
});

test('merge keeps additions from every device across related stores', () => {
  const context = vm.createContext({ Date, console });
  vm.runInContext(source + '\nglobalThis.mergeData = mergeSyncData;', context);
  const local = {
    products: [{ id: 'p-local', name: 'Lokal', updatedAt: '2026-10-05T10:00:00Z' }],
    customers: [],
    sales: [{ id: 's-local', updatedAt: '2026-10-05T10:00:00Z' }],
    saleItems: [{ id: 'i-local', saleId: 's-local', productName: 'Lokal' }],
    payments: [{ id: 'pay-local', saleId: 's-local', amount: 10, createdAt: '2026-10-05T10:00:00Z' }],
    expenses: [], settings: [], auditLogs: [],
  };
  const cloud = {
    products: [{ id: 'p-cloud', name: 'Cloud', updatedAt: '2026-10-05T11:00:00Z' }],
    customers: [{ id: 'c-cloud', name: 'Pelanggan Cloud', updatedAt: '2026-10-05T11:00:00Z' }],
    sales: [{ id: 's-cloud', updatedAt: '2026-10-05T11:00:00Z' }],
    saleItems: [{ id: 'i-cloud', saleId: 's-cloud', productName: 'Cloud' }],
    payments: [{ id: 'pay-cloud', saleId: 's-cloud', amount: 20, createdAt: '2026-10-05T11:00:00Z' }],
    expenses: [{ id: 'e-cloud', title: 'Ongkir', updatedAt: '2026-10-05T11:00:00Z' }],
    settings: [], auditLogs: [],
  };

  const merged = context.mergeData(local, cloud);
  assert.deepEqual([...merged.products].map((row) => row.id), ['p-cloud', 'p-local']);
  assert.deepEqual([...merged.sales].map((row) => row.id), ['s-cloud', 's-local']);
  assert.deepEqual([...merged.saleItems].map((row) => row.id), ['i-cloud', 'i-local']);
  assert.deepEqual([...merged.payments].map((row) => row.id), ['pay-cloud', 'pay-local']);
  assert.equal(merged.customers[0].id, 'c-cloud');
  assert.equal(merged.expenses[0].id, 'e-cloud');
});

test('newest edit wins for the same sale and its replacement item set', () => {
  const context = vm.createContext({ Date, console });
  vm.runInContext(source + '\nglobalThis.mergeData = mergeSyncData;', context);
  const base = { products: [], customers: [], payments: [], expenses: [], settings: [], auditLogs: [] };
  const local = {
    ...base,
    sales: [{ id: 'sale-1', note: 'lama', updatedAt: '2026-10-05T10:00:00Z' }],
    saleItems: [{ id: 'old-item', saleId: 'sale-1', productName: 'Item lama' }],
  };
  const cloud = {
    ...base,
    sales: [{ id: 'sale-1', note: 'baru', updatedAt: '2026-10-05T12:00:00Z' }],
    saleItems: [{ id: 'new-item', saleId: 'sale-1', productName: 'Item baru' }],
  };

  const merged = context.mergeData(local, cloud);
  assert.equal(merged.sales[0].note, 'baru');
  assert.deepEqual([...merged.saleItems].map((row) => row.id), ['new-item']);
});

test('initial connection merges both devices and uploads the combined result without a choice', async () => {
  let localData = {
    products: [{ id: 'local-product', updatedAt: '2026-10-05T10:00:00Z' }],
    customers: [], sales: [], saleItems: [], payments: [], expenses: [], settings: [], auditLogs: [],
  };
  const cloudData = {
    products: [{ id: 'cloud-product', updatedAt: '2026-10-05T11:00:00Z' }],
    customers: [], sales: [], saleItems: [], payments: [], expenses: [], settings: [], auditLogs: [],
  };
  let settings = { autoBackup: { driveConnected: true }, security: {} };
  let uploads = 0;
  const restoreFromFile = async (file) => { localData = JSON.parse(await file.text()).data; };
  const context = vm.createContext({
    Date, GOOGLE_CLIENT_ID: 'configured', navigator: { onLine: true }, AbortController, setTimeout, clearTimeout,
    Blob, FormData, restoreFromFile,
    persistentAccess: async () => null,
    getSettings: async () => settings,
    saveSettings: async (partial) => { settings = { ...settings, ...partial }; },
    db: { dumpAll: async () => localData },
    createBackupBlob: async () => new Blob([JSON.stringify({ app: 'notaku', data: localData })], { type: 'application/json' }),
    window: { dispatchEvent() {} }, CustomEvent: class {}, console: { error() {} },
    fetch: async (url) => {
      if (url.includes('/upload/')) { uploads++; return { ok: true, json: async () => ({ id: 'sync' }) }; }
      if (url.includes('alt=media')) return { ok: true, json: async () => ({ app: 'notaku', data: cloudData }) };
      return { ok: true, json: async () => ({ files: [{ id: 'sync' }] }) };
    },
  });
  const runnable = source.replace("  const { restoreFromFile } = await import('./backupService.js');\n", '');
  vm.runInContext(runnable + '\nglobalThis.initialize = initializeConnectedAccount; _accessToken = "valid"; _tokenExpiryMs = Date.now() + 3600000;', context);

  const result = await context.initialize();
  assert.equal(result.action, 'merge');
  assert.deepEqual(localData.products.map((row) => row.id), ['cloud-product', 'local-product']);
  assert.equal(uploads, 1);
  assert.match(settings.autoBackup.lastSyncStatus, /digabung otomatis/);
});

test('device sync ID is stable and has a short display label', () => {
  const storage = new Map();
  const context = vm.createContext({
    Date, Math, Uint8Array,
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
    },
  });
  vm.runInContext(source + '\nglobalThis.deviceId = getDeviceSyncId; globalThis.deviceLabel = getDeviceSyncLabel;', context);
  const first = context.deviceId();
  assert.match(first, /^NK-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  assert.equal(context.deviceId(), first);
  assert.equal(storage.get('notaku-device-sync-id'), first);
  assert.match(context.deviceLabel(), /^NK-[0-9A-F]{6}$/);
  assert.equal(context.deviceLabel(), `NK-${first.replace(/^NK-/, '').replace(/-/g, '').slice(0, 6)}`);
});
