import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('../js/services/driveBackupService.js', import.meta.url), 'utf8'))
  .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
function fixture({ email = 'owner@example.com', popupError = false } = {}) {
  let settings = { autoBackup: { driveConnected: true, driveAccountEmail: 'owner@example.com', backupKeepCount: 10 } };
  let request;
  const context = vm.createContext({
    GOOGLE_CLIENT_ID: 'configured', navigator: { onLine: true },
    backendEnabled: async () => false, persistentAccess: async () => null,
    getSettings: async () => settings,
    saveSettings: async (partial) => { settings = { ...settings, ...partial }; },
    fetch: async () => ({ ok: true, json: async () => ({ email }) }),
    window: { google: { accounts: { oauth2: {
      initTokenClient(config) { return { requestAccessToken(options) {
        request = options;
        if (popupError) config.error_callback({ type: 'popup_closed' });
        else config.callback({ access_token: 'renewed', expires_in: 3600 });
      } }; },
      revoke() { throw new Error('Renewal must not revoke access'); },
    } } } },
  });
  vm.runInContext(source + '\nglobalThis.renew = () => connectAccount({ renew: true }); globalThis.state = getSyncDisplayState;', context);
  return { context, get request() { return request; }, get settings() { return settings; } };
}

test('renews the same account without revocation or forced consent', async () => {
  const f = fixture();
  assert.equal((await f.context.state()).needsAuthorization, true);
  await f.context.renew();
  assert.equal(f.request.prompt, '');
  assert.equal(f.request.hint, 'owner@example.com');
  assert.equal((await f.context.state()).needsAuthorization, false);
  assert.equal(f.settings.autoBackup.backupKeepCount, 10);
});

test('wrong account and cancelled popup keep the original account connected and block access', async () => {
  for (const options of [{ email: 'other@example.com' }, { popupError: true }]) {
    const f = fixture(options);
    await assert.rejects(f.context.renew());
    assert.equal(f.settings.autoBackup.driveAccountEmail, 'owner@example.com');
    assert.equal(f.settings.autoBackup.driveConnected, true);
    assert.equal((await f.context.state()).needsAuthorization, true);
  }
});
