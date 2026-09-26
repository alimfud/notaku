#!/usr/bin/env python3
"""Run on every deployment: fingerprint app changes AND actual icon bytes.
Standard library only. Safe and idempotent; does not change user data.
"""
from pathlib import Path
import hashlib, json, re

root = Path(__file__).resolve().parents[1]
icons = root / 'icons'
# Ignore generated filenames when computing content hashes.
for size in (192, 512):
    original = icons / f'icon-{size}.png'
    digest = hashlib.sha256(original.read_bytes()).hexdigest()[:12]
    target = icons / f'icon-{size}-{digest}.png'
    target.write_bytes(original.read_bytes())

manifest = root / 'manifest.json'
m = json.loads(manifest.read_text(encoding='utf-8'))
for icon in m['icons']:
    size = int(icon['sizes'].split('x')[0])
    digest = hashlib.sha256((icons / f'icon-{size}.png').read_bytes()).hexdigest()[:12]
    icon['src'] = f'icons/icon-{size}-{digest}.png'
# The same id MUST remain stable across logo/version changes.
m['id'] = './index.html'
manifest.write_text(json.dumps(m, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

html = root / 'index.html'
s = html.read_text(encoding='utf-8')
icon_digest = hashlib.sha256((icons / 'icon-192.png').read_bytes()).hexdigest()[:12]
s = re.sub(r'href="icons/icon-192(?:-[a-f0-9]{12})?\.png"',
           f'href="icons/icon-192-{icon_digest}.png"', s)
html.write_text(s, encoding='utf-8')
# fingerprint app content (source, no generated release numbers)
paths = [root / 'index.html', root / 'manifest.json', root / 'sw.js']
paths += [p for base in ('js','css','docs','icons') for p in (root / base).rglob('*')
          if p.is_file() and not re.fullmatch(r'icon-(192|512)-[a-f0-9]{12}\.png', p.name)]
h = hashlib.sha256()
for path in sorted(set(paths)):
    data = path.read_bytes()
    if path == html:
        data = re.sub(rb'js/app\.js\?release=[a-f0-9]{12}', b'js/app.js', data)
        data = re.sub(rb'manifest\.json\?release=[a-f0-9]{12}', b'manifest.json', data)
    if path == root / 'sw.js':
        data = re.sub(rb"const CACHE_VERSION = '[^']+';", b"const CACHE_VERSION = '<generated>';", data)
        data = re.sub(rb"icon-(192|512)(?:-[a-f0-9]{12})?\.png", rb"icon-\1.png", data)
    if path == root / 'js/version.js':
        data = b'export const APP_VERSION = <generated>;' 
    h.update(str(path.relative_to(root)).encode() + b'\0' + data + b'\0')
release = h.hexdigest()[:12]
s = re.sub(r'js/app\.js(?:\?release=[a-f0-9]{12})?', f'js/app.js?release={release}', s)
s = re.sub(r'manifest\.json(?:\?release=[a-f0-9]{12})?', f'manifest.json?release={release}', s)
html.write_text(s, encoding='utf-8')
version = f'1.6.6-{release}'
(root / 'js/version.js').write_text(f"export const APP_VERSION = '{version}';\n", encoding='utf-8')
(root / 'version.json').write_text(json.dumps({
  'version': version,
  'notes': 'Update otomatis. Konten dan ikon diberi fingerprint agar tidak tertahan cache.'
}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
sw = root / 'sw.js'
sw_text = sw.read_text(encoding='utf-8')
sw_text = re.sub(r"const CACHE_VERSION = '[^']+';", f"const CACHE_VERSION = 'notaku-web-{release}';", sw_text)
sw_text = re.sub(r"'\./icons/icon-192(?:-[a-f0-9]{12})?\.png'", f"'./icons/icon-192-{icon_digest}.png'", sw_text)
d512 = hashlib.sha256((icons / 'icon-512.png').read_bytes()).hexdigest()[:12]
sw_text = re.sub(r"'\./icons/icon-512(?:-[a-f0-9]{12})?\.png'", f"'./icons/icon-512-{d512}.png'", sw_text)
sw.write_text(sw_text, encoding='utf-8')
print('NotaKu release:', version)
