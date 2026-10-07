import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));

test('PWA startup uses Clay and all declared icons exist at their actual sizes', async () => {
  assert.equal(manifest.background_color, '#fbf0e0');
  assert.equal(manifest.theme_color, '#fbf0e0');
  assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));
  for (const icon of manifest.icons) {
    const file = new URL(`../${icon.src.split('?')[0]}`, import.meta.url);
    const png = await readFile(file);
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
    assert.ok(source.includes(`'./${icon.src}'`), `${icon.src} must work offline`);
  }
  for (const size of [180, 192, 512]) {
    const png = await readFile(new URL(`../icons/icon-${size}.png`, import.meta.url));
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
});

test('icons folder contains only referenced assets, with a dedicated tab favicon', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const expected = ['favicon.svg', 'favicon-32.png', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'].sort();
  assert.deepEqual((await readdir(new URL('../icons/', import.meta.url))).sort(), expected);
  const favicon = await readFile(new URL('../icons/favicon.svg', import.meta.url), 'utf8');
  assert.match(favicon, /viewBox="0 0 32 32"/);
  assert.doesNotMatch(favicon, /<text\b/);
  for (const asset of expected) {
    assert.ok(html.includes(asset) || manifest.icons.some(icon => icon.src.includes(asset)), `${asset} must have a consumer`);
  }
  for (const asset of ['favicon.svg?v=2', 'favicon-32.png?v=2']) assert.ok(source.includes(`'./icons/${asset}'`));
  const fallback = await readFile(new URL('../icons/favicon-32.png', import.meta.url));
  assert.equal(fallback.readUInt32BE(16), 32);
  assert.equal(fallback.readUInt32BE(20), 32);
});

test('HTML opens with the animation, not an old bitmap logo', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const loader = html.slice(html.indexOf('<div id="loadingOverlay"'), html.indexOf('<script type="module"'));
  assert.match(loader, /class="is-startup"/);
  assert.match(loader, /class="thermal-printer"/);
  assert.doesNotMatch(loader, /<img\b/);
  assert.match(html, /apple-touch-icon" sizes="180x180"/);
});

for (const pathname of ['/manifest.json', '/icons/icon-192.png?v=printer-2', '/icons/favicon.svg?v=2']) {
  for (const online of [true, false]) {
    test(`${pathname}: branding refreshes online and keeps its offline fallback (${online ? 'online' : 'offline'})`, async () => {
      const handlers = {}, calls = [];
      let response;
      const context = vm.createContext({
        URL, Response, Promise,
        self: { location: { origin: 'https://nota.jajan.my.id' }, addEventListener(name, fn) { handlers[name] = fn; } },
        caches: {
          match: async () => new Response('cached'),
          open: async () => ({ put: async () => {} }),
        },
        fetch: async (request, options) => {
          calls.push(options?.cache);
          if (!online) throw new Error('offline');
          return new Response('updated');
        },
      });
      vm.runInContext(source, context);
      handlers.fetch({
        request: { method: 'GET', url: `https://nota.jajan.my.id${pathname}`, destination: pathname.includes('manifest') ? 'manifest' : 'image', mode: 'cors' },
        respondWith(promise) { response = promise; },
      });
      assert.equal(await (await response).text(), online ? 'updated' : 'cached');
      assert.deepEqual(calls, ['no-store']);
    });
  }
}
