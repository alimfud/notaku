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
