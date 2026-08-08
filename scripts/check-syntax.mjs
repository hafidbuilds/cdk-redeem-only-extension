#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function getTrackedJavaScriptFiles() {
  try {
    return execFileSync('git', ['ls-files', '-z', '--', '*.js', '*.cjs', '*.mjs'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).split('\0').filter(Boolean);
  } catch {
    const ignoredDirectories = new Set(['.git', '.codegraph', 'node_modules', 'release-artifacts']);
    const files = [];
    function visit(directory) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(absolutePath);
        else if (/\.(?:js|cjs|mjs)$/i.test(entry.name)) files.push(path.relative(root, absolutePath));
      }
    }
    visit(root);
    return files.sort();
  }
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
  console.log(`Syntax check passed for ${files.length} JavaScript file(s).`);
}
