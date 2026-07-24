#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function getTrackedJavaScriptFiles() {
  return execFileSync('git', ['ls-files', '-z', '--', '*.js', '*.cjs', '*.mjs'], {
    cwd: root,
    encoding: 'utf8',
  }).split('\0').filter(Boolean);
}

const failures = [];
const files = getTrackedJavaScriptFiles();
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    failures.push(`${file}\n${String(result.stderr || result.stdout || '').trim()}`);
  }
}

if (failures.length > 0) {
  console.error(`Syntax check failed for ${failures.length} file(s):\n${failures.join('\n\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Syntax check passed for ${files.length} tracked JavaScript file(s).`);
}
