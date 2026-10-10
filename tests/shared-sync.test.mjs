import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('../js/services/driveBackupService.js', import.meta.url), 'utf8'))
  .replace(/^import .*;$/gm, '').replace(/^export /gm, '');

function contextFor({ settings, fetch, pickerKey = '', globals = {} }) {
  const context = vm.createContext({
    Date, Math, Uint8Array, Blob, FormData, AbortController, setTimeout, clearTimeout,
    GOOGLE_CLIENT_ID: '329437953527-client.apps.googleusercontent.com', GOOGLE_PICKER_API_KEY: pickerKey, navigator: { onLine: true },
    persistentAccess: async () => null,
    getSettings: async () => settings,
    saveSettings: async (partial) => { settings = { ...settings, ...partial }; },
    createBackupBlob: async () => new Blob([JSON.stringify({ app: 'notaku', data: { products: [] } })], { type: 'application/json' }),
    db: { dumpAll: async () => ({ products: [], settings: [] }) },
    fetch,
    window: { dispatchEvent() {} }, CustomEvent: class {}, console: { error() {} },
    ...globals,
  });
  vm.runInContext(source + `
    globalThis.codeFor = createSharedSyncCode;
    globalThis.parseCode = parseSharedSyncCode;
    globalThis.findFile = findSyncFile;
    globalThis.createSpace = createSharedSyncSpace;
    globalThis.invite = inviteSharedSyncMember;
    globalThis.leaveSpace = leaveSharedSyncSpace;
    globalThis.listSpaces = listSharedSyncSpaces;
    globalThis.trashSpace = trashSharedSyncSpace;
    globalThis.pushCloud = pushToCloud;
    globalThis.authorizeFile = authorizeSharedSyncFile;
    _accessToken = "valid";
    _tokenExpiryMs = Date.now() + 3600000;
  `, context);
  return { context, get settings() { return settings; } };
}

test('shared sync codes accept codes and Drive links but reject arbitrary text', () => {
  const f = contextFor({ settings: { autoBackup: {} }, fetch: async () => ({ ok: true }) });
  const id = '1AbCdEfGhIjKlMnOpQrStUv';
  assert.match(f.context.codeFor(id), /^[0-9A-HJKMNP-TV-Z]{8}$/);
  assert.equal(f.context.codeFor(id).length, 8);
  assert.equal(f.context.parseCode(f.context.codeFor(id)), '');
  assert.equal(f.context.parseCode(`NK1.${id}`), id);
  assert.equal(f.context.parseCode(`https://drive.google.com/file/d/${id}/view`), id);
  assert.equal(f.context.parseCode('bukan-kode'), '');
});

test('personal mode keeps name lookup while shared mode addresses the invited file directly', async () => {
  const requests = [];
  const settings = { autoBackup: { syncMode: 'personal' } };
  const f = contextFor({
    settings,
    fetch: async (url) => {
      requests.push(url);
      if (url.includes('/files?')) return { ok: true, json: async () => ({ files: [{ id: 'personal-file' }] }) };
      return { ok: true, json: async () => ({ id: '1SharedFileAbCd', name: 'NotaKu Sync - Cabang.json', mimeType: 'application/json', appProperties: { notakuSyncSpace: '1' }, capabilities: { canEdit: true } }) };
    },
  });
  assert.equal((await f.context.findFile('token')).id, 'personal-file');
  settings.autoBackup = { syncMode: 'shared', sharedSyncFileId: '1SharedFileAbCd' };
  assert.equal((await f.context.findFile('token')).id, '1SharedFileAbCd');
  assert.match(requests[0], /\/files\?/);
  assert.match(requests[1], /\/files\/1SharedFileAbCd\?/);
});

test('creating a shared space preserves personal mode as a reversible setting and invitations grant writer access', async () => {
  const requests = [];
  let settings = { autoBackup: { driveConnected: true, syncMode: 'personal', autoSyncEnabled: true } };
  const f = contextFor({
    settings,
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      if (url.includes('upload/drive')) return { ok: true, json: async () => ({ id: '1SharedFileAbCd', name: 'NotaKu Sync - Toko Pusat.json' }) };
      if (url.includes('/permissions')) return { ok: true, json: async () => ({ id: 'permission-1' }) };
      return { ok: true, json: async () => ({ id: '1SharedFileAbCd', name: 'NotaKu Sync - Toko Pusat.json', mimeType: 'application/json', appProperties: { notakuSyncSpace: '1' }, ownedByMe: true, capabilities: { canEdit: true, canShare: true } }) };
    },
  });

  const created = await f.context.createSpace('Toko Pusat');
  assert.equal(created.code, f.context.codeFor('1SharedFileAbCd'));
  assert.equal(created.code.length, 8);
  assert.equal(f.settings.autoBackup.syncMode, 'shared');
  assert.equal(f.settings.autoBackup.sharedSyncOwner, true);

  const invited = await f.context.invite('staf@example.com');
  assert.equal(invited.email, 'staf@example.com');
  const permission = requests.find((request) => request.url.includes('/permissions'));
  assert.deepEqual(JSON.parse(permission.options.body), { type: 'user', role: 'writer', emailAddress: 'staf@example.com' });

  await f.context.leaveSpace();
  assert.equal(f.settings.autoBackup.syncMode, 'personal');
  assert.equal(f.settings.autoBackup.sharedSyncFileId, '');
  assert.equal(requests.some((request) => request.options.method === 'DELETE'), false);
});

test('shared upload refuses to overwrite a newer Drive revision', async () => {
  let uploads = 0;
  const f = contextFor({
    settings: { autoBackup: { driveConnected: true, syncMode: 'shared', sharedSyncFileId: '1SharedFileAbCd' } },
    fetch: async (url, options = {}) => {
      if (options.method === 'PATCH') uploads++;
      return {
        ok: true,
        headers: { get: (name) => name.toLowerCase() === 'etag' ? 'revision-new' : '' },
        json: async () => ({ id: '1SharedFileAbCd', name: 'NotaKu Sync - Toko Pusat.json', mimeType: 'application/json', appProperties: { notakuSyncSpace: '1' }, capabilities: { canEdit: true } }),
      };
    },
  });
  await assert.rejects(() => f.context.pushCloud({ expectedEtag: 'revision-old' }), /berubah dari perangkat lain/);
  assert.equal(uploads, 0);
});

test('failed join identifies the exact Google account that still needs permission', async () => {
  const f = contextFor({
    settings: { autoBackup: { driveConnected: true, driveAccountEmail: 'anggota@example.com', syncMode: 'shared', sharedSyncFileId: '1SharedFileAbCd' } },
    fetch: async () => ({ ok: false, status: 404 }),
  });
  await assert.rejects(() => f.context.findFile('token'), /anggota@example\.com.*“Undang”/s);
});

test('members cannot invite another account even when their Drive permission allows sharing', async () => {
  let permissionRequests = 0;
  const f = contextFor({
    settings: { autoBackup: { driveConnected: true, syncMode: 'shared', sharedSyncFileId: '1MemberRoomAbCd', sharedSyncOwner: false } },
    fetch: async (url) => {
      if (url.includes('/permissions')) permissionRequests++;
      return { ok: true, json: async () => ({ id: '1MemberRoomAbCd', name: 'NotaKu Sync - Cabang.json', mimeType: 'application/json', appProperties: { notakuSyncSpace: '1' }, ownedByMe: false, capabilities: { canEdit: true, canShare: true } }) };
    },
  });
  await assert.rejects(() => f.context.invite('teman@example.com'), /Hanya pemilik ruang/);
  assert.equal(permissionRequests, 0);
});

test('the connected owner account cannot be invited as its own member', async () => {
  let requests = 0;
  const f = contextFor({
    settings: { autoBackup: { driveConnected: true, driveAccountEmail: 'owner@example.com', syncMode: 'shared', sharedSyncFileId: '1OwnerRoomAbCd', sharedSyncOwner: true } },
    fetch: async () => { requests++; return { ok: true }; },
  });
  await assert.rejects(() => f.context.invite('OWNER@example.com'), /akun pemilik/);
  assert.equal(requests, 0);
});

test('shared mode rejects an ordinary JSON file that is not a NotaKu sync room', async () => {
  const f = contextFor({
    settings: { autoBackup: { driveConnected: true, syncMode: 'shared', sharedSyncFileId: '1OrdinaryJsonFile' } },
    fetch: async () => ({ ok: true, json: async () => ({ id: '1OrdinaryJsonFile', name: 'data.json', mimeType: 'application/json', capabilities: { canEdit: true } }) }),
  });
  await assert.rejects(() => f.context.findFile('token'), /bukan Ruang Sinkron Bersama NotaKu/);
});

test('Picker matches an eight-character room code to the selected shared file', async () => {
  const fileId = '1SharedFileAbCd';
  let selectedFileId = fileId;
  let callback;
  class DocsView {
    setIncludeFolders() { return this; }
    setMimeTypes() { return this; }
    setQuery() { return this; }
    setMode() { return this; }
  }
  class PickerBuilder {
    addView() { return this; }
    setOAuthToken() { return this; }
    setDeveloperKey() { return this; }
    setAppId() { return this; }
    setOrigin() { return this; }
    setTitle() { return this; }
    setCallback(value) { callback = value; return this; }
    build() { return { setVisible() { callback({ action: 'picked', docs: [{ id: selectedFileId }] }); } }; }
  }
  const picker = {
    DocsView, PickerBuilder, ViewId: { DOCS: 'docs' }, DocsViewMode: { LIST: 'list' },
    Response: { ACTION: 'action', DOCUMENTS: 'docs' }, Document: { ID: 'id' }, Action: { PICKED: 'picked', CANCEL: 'cancel' },
  };
  const f = contextFor({
    settings: { autoBackup: { driveConnected: true } }, pickerKey: 'picker-key',
    fetch: async () => ({ ok: true }),
    globals: { google: { picker }, gapi: { load() {} }, location: { origin: 'https://nota.example' } },
  });
  const shortCode = f.context.codeFor(fileId);
  assert.equal(shortCode.length, 8);
  assert.equal(await f.context.authorizeFile(shortCode.toLowerCase()), fileId);
  selectedFileId = '1DifferentSharedFile';
  await assert.rejects(() => f.context.authorizeFile(shortCode), /tidak cocok dengan kode ruang/);
});

test('room manager only trashes owner rooms and returns active sync to personal mode', async () => {
  const requests = [];
  let settings = { autoBackup: { driveConnected: true, syncMode: 'shared', sharedSyncFileId: '1OwnedRoomAbCd', sharedSyncName: 'Lama' } };
  const f = contextFor({
    settings,
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      if (options.method === 'PATCH') return { ok: true, json: async () => ({ id: '1OwnedRoomAbCd', trashed: true }) };
      return { ok: true, json: async () => ({ files: [
        { id: '1OwnedRoomAbCd', name: 'NotaKu Sync - Lama.json', modifiedTime: '2026-10-10T07:00:00.000Z', ownedByMe: true, capabilities: { canTrash: true } },
        { id: '1MemberRoomXyz', name: 'NotaKu Sync - Cabang.json', ownedByMe: false, capabilities: { canTrash: false } },
      ] }) };
    },
  });

  const spaces = await f.context.listSpaces();
  assert.equal(spaces[0].displayName, 'Lama');
  assert.equal(spaces[0].active, true);
  assert.equal(spaces[1].canTrash, false);

  const removed = await f.context.trashSpace('1OwnedRoomAbCd');
  assert.equal(removed.wasActive, true);
  assert.equal(f.settings.autoBackup.syncMode, 'personal');
  const patchRequest = requests.find((request) => request.options.method === 'PATCH');
  assert.deepEqual(JSON.parse(patchRequest.options.body), { trashed: true });
  await assert.rejects(() => f.context.trashSpace('1MemberRoomXyz'), /dimiliki akun lain/);
  assert.equal(requests.filter((request) => request.options.method === 'PATCH').length, 1);
  assert.equal(requests.some((request) => request.options.method === 'DELETE'), false);
});
