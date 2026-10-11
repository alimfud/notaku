import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const web = resolve(root, 'web');
const entries = ['index.html', 'manifest.json', 'sw.js', 'version.json', 'css', 'docs', 'icons', 'js'];

await rm(web, { recursive: true, force: true });
await mkdir(web, { recursive: true });
for (const entry of entries) {
  await cp(resolve(root, entry), resolve(web, entry), { recursive: true });
}

// Capacitor menyuntikkan bridge native secara otomatis. Service worker tidak
// diperlukan untuk file yang sudah berada di dalam APK dan dapat menghambat
// pergantian aset ketika APK diperbarui.
const indexPath = resolve(web, 'index.html');
const index = await readFile(indexPath, 'utf8');
await writeFile(indexPath, index.replace('<body>', '<body data-native-app="true">'));

console.log('Aset web NotaKu siap dibundel ke APK.');
