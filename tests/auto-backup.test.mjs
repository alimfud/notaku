import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('../js/services/driveBackupService.js', import.meta.url), 'utf8'))
  .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
function fixture({ failUpload = false, token = true } = {}) {
  let settings = { autoBackup: { enabled: true, driveConnected: true, scheduleTimes: ['00:00', '00:01'], lastCheckedSlots: [] } };
  let uploads = 0;
  let popups = 0;
  const context = vm.createContext({
    GOOGLE_CLIENT_ID: 'configured',
    getSettings: async () => settings,
    saveSettings: async (partial) => { settings = { ...settings, ...partial }; },
    createBackupBlob: async () => new Blob(['{}']), Blob, FormData,
    navigator: { onLine: true }, console: { error() {} },
    fetch: async (url) => {
      if (url.includes('/upload/')) {
        uploads++;
        if (failUpload) throw new Error('Network unavailable');
        return { ok: true, json: async () => ({ id: 'backup' }) };
      }
      return { ok: true, json: async () => ({ files: [{ id: 'folder' }] }) };
    },
    window: { google: { accounts: { oauth2: { initTokenClient() { popups++; throw new Error('Unexpected popup'); } } } } },
    document: { createElement() { throw new Error('Unexpected login script'); } },
  });
  vm.runInContext(source + '\n globalThis.check = checkScheduleOnAppOpen;', context);
  if (token) vm.runInContext('_accessToken = "valid"; _tokenExpiryMs = Date.now() + 3600000;', context);
  return { context, get settings() { return settings; }, get uploads() { return uploads; }, get popups() { return popups; } };
}

test('concurrent schedule checks upload once and complete all overdue slots', async () => {
  const f = fixture();
  await Promise.all([f.context.check(), f.context.check(), f.context.check()]);
  assert.equal(f.uploads, 1);
  assert.deepEqual(Array.from(f.settings.autoBackup.lastCheckedSlots), ['00:00', '00:01']);
  assert.ok(f.settings.autoBackup.lastBackupAt);
  await f.context.check();
  assert.equal(f.uploads, 1);
  assert.equal(f.popups, 0);
});

test('failed uploads keep schedules pending and throttle retry', async () => {
  const f = fixture({ failUpload: true });
  await f.context.check();
  assert.equal(f.uploads, 1);
  assert.equal(f.settings.autoBackup.lastCheckedSlots.length, 0);
  assert.equal(f.settings.autoBackup.lastBackupAt, undefined);
  assert.match(f.settings.autoBackup.lastBackupError, /Network/);
  await f.context.check();
  assert.equal(f.uploads, 1);
  vm.runInContext('_retryAfter = 0;', f.context);
  await f.context.check();
  assert.equal(f.uploads, 2);
});

test('expired sessions defer backups without prompting the user', async () => {
  const f = fixture({ token: false });
  await f.context.check();
  assert.equal(f.uploads, 0);
  assert.equal(f.popups, 0);
  assert.equal(f.settings.autoBackup.lastCheckedSlots.length, 0);
  assert.match(f.settings.autoBackup.lastBackupError, /Hubungkan ulang/);
});

test('offline and disabled backups perform no uploads', async () => {
  const f = fixture();
  f.context.navigator.onLine = false;
  await f.context.check();
  f.context.navigator.onLine = true;
  f.settings.autoBackup.enabled = false;
  await f.context.check();
  assert.equal(f.uploads, 0);
});
