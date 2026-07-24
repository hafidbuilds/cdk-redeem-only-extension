#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDirectories = Object.freeze([
  'background/',
  'content/',
  'data/',
  'flows/',
  'icons/',
  'shared/',
  'sidepanel/',
]);
const runtimeRootFiles = new Set([
  'manifest.json',
  'background.js',
  'rules.json',
  'cloudflare-temp-email-utils.js',
  'cloudmail-utils.js',
  'freemail-utils.js',
  'hotmail-utils.js',
  'icloud-utils.js',
  'luckmail-utils.js',
  'mail-provider-utils.js',
  'mail2925-utils.js',
  'managed-alias-utils.js',
  'microsoft-email.js',
  'moemail-utils.js',
  'outlook-email-plus-utils.js',
  'yydsmail-utils.js',
]);
const forbiddenPathPatterns = [
  /(^|\/)\.git(\/|$)/i,
  /(^|\/)\.env(?:\.|$)/i,
  /(^|\/)config\.json$/i,
  /^(?:data\/)?account-run-history\.(?:txt|json)$/i,
  /(?:^|\/)(?:backup|release-artifacts|\.audit_tmp|\.runtime)(?:\/|$)/i,
  /used-.*email-password-2fa/i,
  /(?:^|\/)(?:[^/]*\.log|[^/]*cookie[^/]*|[^/]*credential-export[^/]*)$/i,
];

function normalizeRelativePath(value = '') {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function isSafeReleasePath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  return Boolean(normalized)
    && !forbiddenPathPatterns.some((pattern) => pattern.test(normalized));
}

function shouldIncludeReleaseFile(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!isSafeReleasePath(normalized)) return false;
  return runtimeRootFiles.has(normalized)
    || runtimeDirectories.some((directory) => normalized.startsWith(directory));
}

function getTrackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .map(normalizeRelativePath);
}

function getManifestReferences(manifest) {
  const references = new Set([
    manifest.background?.service_worker,
    manifest.side_panel?.default_path,
    manifest.action?.default_popup,
    ...Object.values(manifest.action?.default_icon || {}),
    ...Object.values(manifest.icons || {}),
    ...(manifest.content_scripts || []).flatMap((entry) => [
      ...(entry.js || []),
      ...(entry.css || []),
    ]),
    ...(manifest.declarative_net_request?.rule_resources || []).map((entry) => entry.path),
  ]);
  return [...references].filter(Boolean).map(normalizeRelativePath);
}

function assertRuntimeReferences(files) {
  const included = new Set(files);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.key) {
    throw new Error('manifest.json contains an extension key; refusing to package.');
  }
  const backgroundSource = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
  const backgroundReferences = [...backgroundSource.matchAll(/^\s*'([^']+\.js)',?\s*$/gm)]
    .map((match) => normalizeRelativePath(match[1]));
  const sidepanelSource = fs.readFileSync(path.join(root, 'sidepanel', 'sidepanel.html'), 'utf8');
  const sidepanelReferences = [...sidepanelSource.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)]
    .map((match) => normalizeRelativePath(path.posix.normalize(path.posix.join('sidepanel', match[1]))));
  const requiredFiles = [
    ...getManifestReferences(manifest),
    ...backgroundReferences,
    ...sidepanelReferences,
  ];
  const missing = [...new Set(requiredFiles)].filter((file) => !included.has(file));
  if (missing.length > 0) {
    throw new Error(`Release package is missing manifest references: ${missing.join(', ')}`);
  }
}

function assertInsideRoot(target, parent) {
  const relative = path.relative(parent, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Unsafe release path: ${target}`);
  }
}

function compressRelease(stagingDirectory, outputFile) {
  if (process.platform === 'win32') {
    const quote = (value) => String(value).replace(/'/g, "''");
    const command = `Compress-Archive -Path '${quote(path.join(stagingDirectory, '*'))}' -DestinationPath '${quote(outputFile)}' -Force`;
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error(String(result.stderr || result.stdout || 'Compress-Archive failed').trim());
    }
    return;
  }
  const result = spawnSync('zip', ['-q', '-r', outputFile, '.'], {
    cwd: stagingDirectory,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(String(result.stderr || result.stdout || 'zip failed').trim());
  }
}

function buildRelease() {
  const files = getTrackedFiles().filter(shouldIncludeReleaseFile);
  assertRuntimeReferences(files);

  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const stagingDirectory = path.join(root, '.audit_tmp', 'release-build');
  const outputDirectory = path.join(root, 'release-artifacts');
  const outputFile = path.join(outputDirectory, `cdk-redeem-only-extension-v${manifest.version}.zip`);
  assertInsideRoot(stagingDirectory, root);
  assertInsideRoot(outputDirectory, root);

  fs.rmSync(stagingDirectory, { recursive: true, force: true });
  fs.mkdirSync(stagingDirectory, { recursive: true });
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.rmSync(outputFile, { force: true });

  for (const file of files) {
    const source = path.join(root, file);
    const destination = path.join(stagingDirectory, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }

  compressRelease(stagingDirectory, outputFile);
  fs.rmSync(stagingDirectory, { recursive: true, force: true });
  console.log(`Created ${path.relative(root, outputFile)} with ${files.length} runtime file(s).`);
  return { files, outputFile };
}

export {
  getManifestReferences,
  isSafeReleasePath,
  normalizeRelativePath,
  shouldIncludeReleaseFile,
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  buildRelease();
}
