import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('../js/services/driveBackupService.js', import.meta.url), 'utf8'))
  .replace(/^import .*;$/gm, '').replace(/^export /gm, '');

function fixture({ count = 125, failPage = false } = {}) {
  const files = Array.from({ length: count }, (_, i) => ({
    id: String(i), name: `notaku-backup-${i}.json`,
    createdTime: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
  })).reverse();
  const deleted = [];
  const requests = [];
  let pages = 0;
  const context = vm.createContext({
    fetch: async (url, options) => {
      requests.push(url);
      if (options.method === 'DELETE') {
        assert.equal(pages, Math.ceil(count / 100));
        deleted.push(url.split('/').at(-1));
        return { ok: true };
      }
      const params = new URL(url).searchParams;
      assert.match(params.get('q'), /'folder' in parents/);
      assert.match(params.get('q'), /name contains 'notaku-backup-'/);
      assert.ok(!params.get('q').includes('createdTime <'));
      const offset = Number(params.get('pageToken') || 0);
      pages++;
      if (failPage && offset) return { ok: false, status: 503, json: async () => ({ error: { message: 'Unavailable' } }) };
      return { ok: true, json: async () => ({
        files: [...files.slice(offset, offset + 100), { id: 'sync', name: 'notaku-sync.json', createdTime: '2025-01-01T00:00:00Z' }],
        nextPageToken: offset + 100 < count ? String(offset + 100) : undefined,
      }) };
    },
  });
  vm.runInContext(source + '\n globalThis.cleanup = deleteOldBackups;', context);
  return { cleanup: (limit) => context.cleanup('token', 'folder', limit), deleted, requests };
}

test('retains newest ten across all pages and deletes only older backup files', async () => {
  const f = fixture();
  await f.cleanup(10);
  assert.equal(f.deleted.length, 115);
  assert.deepEqual(f.deleted, Array.from({ length: 115 }, (_, i) => String(114 - i)));
  assert.ok(!f.deleted.includes('sync'));
});

test('uses selected limit and retains all files when below the limit, regardless of age', async () => {
  const f = fixture({ count: 8 });
  await f.cleanup(3);
  assert.deepEqual(f.deleted, ['4', '3', '2', '1', '0']);
  const small = fixture({ count: 3 });
  await small.cleanup(10);
  assert.equal(small.deleted.length, 0);
});

test('failed pagination cannot delete files from an incomplete listing', async () => {
  const f = fixture({ failPage: true });
  await assert.rejects(f.cleanup(10), /Unavailable/);
  assert.equal(f.deleted.length, 0);
});

test('invalid limits never issue requests; old settings default to ten', async () => {
  for (const limit of [0, -1, 1.5, NaN]) {
    const f = fixture();
    await assert.rejects(f.cleanup(limit), /minimal 1/);
    assert.equal(f.requests.length, 0);
  }
  const legacy = fixture({ count: 12 });
  await legacy.cleanup(undefined);
  assert.deepEqual(legacy.deleted, ['1', '0']);
});
