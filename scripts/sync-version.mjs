<<<<<<< HEAD
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const checkOnly = process.argv.includes('--check');
const versionInfo = JSON.parse(await readFile(resolve(root, 'version.json'), 'utf8'));
const version = String(versionInfo.version || '').trim();

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`Versi di version.json tidak valid: ${version || '(kosong)'}`);
}

const [major, minor, patch] = version.split('.').map(Number);
const androidVersionCode = major * 100000 + minor * 100 + patch;

const changes = [];

async function syncText(relativePath, update) {
  const path = resolve(root, relativePath);
  const current = await readFile(path, 'utf8');
  const next = update(current);
  if (next === current) return;
  changes.push(relativePath);
  if (!checkOnly) await writeFile(path, next);
}

async function syncJson(relativePath, update) {
  await syncText(relativePath, (source) => {
    const data = JSON.parse(source);
    update(data);
    return `${JSON.stringify(data, null, 2)}\n`;
  });
}

await syncJson('package.json', (data) => {
  data.version = version;
});

await syncJson('package-lock.json', (data) => {
  data.version = version;
  if (data.packages?.['']) data.packages[''].version = version;
});

await syncText('js/version.js', () => `// Dibuat otomatis dari version.json oleh scripts/sync-version.mjs.\nexport const APP_VERSION = '${version}';\n`);

await syncText('sw.js', (source) => source.replace(
  /const CACHE_VERSION = 'notaku-web-v[^']+';/,
  `const CACHE_VERSION = 'notaku-web-v${version}';`,
));

await syncText('README.md', (source) => source
  .replace(/\*\*Versi saat ini:\*\* v\d+\.\d+\.\d+/, `**Versi saat ini:** v${version}`));

await syncText('android/app/build.gradle', (source) => source
  .replace(/versionCode\s+\d+/, `versionCode ${androidVersionCode}`)
  .replace(/versionName\s+"[^"]+"/, `versionName "${version}"`));

if (checkOnly && changes.length) {
  throw new Error(`Metadata versi belum sinkron dengan version.json: ${changes.join(', ')}`);
}

console.log(changes.length
  ? `Versi ${version} disinkronkan ke: ${changes.join(', ')}`
  : `Semua metadata sudah sinkron pada versi ${version}.`);
=======
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const checkOnly = process.argv.includes('--check');
const versionInfo = JSON.parse(await readFile(resolve(root, 'version.json'), 'utf8'));
const version = String(versionInfo.version || '').trim();

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`Versi di version.json tidak valid: ${version || '(kosong)'}`);
}

const [major, minor, patch] = version.split('.').map(Number);
const androidVersionCode = major * 100000 + minor * 100 + patch;

const changes = [];

async function syncText(relativePath, update) {
  const path = resolve(root, relativePath);
  const current = await readFile(path, 'utf8');
  const next = update(current);
  if (next === current) return;
  changes.push(relativePath);
  if (!checkOnly) await writeFile(path, next);
}

async function syncJson(relativePath, update) {
  await syncText(relativePath, (source) => {
    const data = JSON.parse(source);
    update(data);
    return `${JSON.stringify(data, null, 2)}\n`;
  });
}

await syncJson('package.json', (data) => {
  data.version = version;
});

await syncJson('package-lock.json', (data) => {
  data.version = version;
  if (data.packages?.['']) data.packages[''].version = version;
});

await syncText('js/version.js', () => `// Dibuat otomatis dari version.json oleh scripts/sync-version.mjs.\nexport const APP_VERSION = '${version}';\n`);

await syncText('sw.js', (source) => source.replace(
  /const CACHE_VERSION = 'notaku-web-v[^']+';/,
  `const CACHE_VERSION = 'notaku-web-v${version}';`,
));

await syncText('README.md', (source) => source
  .replace(/\*\*Versi saat ini:\*\* v\d+\.\d+\.\d+/, `**Versi saat ini:** v${version}`));

await syncText('android/app/build.gradle', (source) => source
  .replace(/versionCode\s+\d+/, `versionCode ${androidVersionCode}`)
  .replace(/versionName\s+"[^"]+"/, `versionName "${version}"`));

if (checkOnly && changes.length) {
  throw new Error(`Metadata versi belum sinkron dengan version.json: ${changes.join(', ')}`);
}

console.log(changes.length
  ? `Versi ${version} disinkronkan ke: ${changes.join(', ')}`
  : `Semua metadata sudah sinkron pada versi ${version}.`);

>>>>>>> e011ddef4267c03bd6564ef9c47510b4a14d2ac0
