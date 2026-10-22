import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const testFiles = (await readdir(resolve(root, 'tests')))
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => resolve(root, 'tests', name));

const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
const usesStableIsolationFlag = nodeMajor > 23 || (nodeMajor === 23 && nodeMinor >= 6);
const isolationFlag = usesStableIsolationFlag
  ? '--test-isolation=none'
  : '--experimental-test-isolation=none';

const result = spawnSync(process.execPath, ['--test', isolationFlag, ...testFiles], {
  cwd: root,
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
