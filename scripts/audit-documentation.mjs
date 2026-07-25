#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultRoot = path.resolve(__dirname, '..');

export const currentDocumentationPaths = Object.freeze([
  'README.md',
  'AGENTS.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
  'SECURITY.md',
  'THIRD_PARTY_NOTICES.md',
  'CODEX_PROMPT_CURRENT_PROJECT_ONLY.md',
  'CODEX_PROJECT_COMPLETION_EXECUTION_V2.md',
  'docs/USER_GUIDE.md',
  'docs/DEVELOPMENT.md',
  'docs/audit/issue-fix-index.md',
  'docs/audit/project-completion-report.md',
  'docs/chrome-extension-dev/README.md',
]);

const livingReferencePaths = Object.freeze([
  'README.md',
  'AGENTS.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'THIRD_PARTY_NOTICES.md',
  'docs/USER_GUIDE.md',
  'docs/DEVELOPMENT.md',
  'docs/audit/issue-fix-index.md',
  'docs/chrome-extension-dev/README.md',
]);

const exactAllowedPaths = new Set(currentDocumentationPaths);
const allowedArchivePatterns = Object.freeze([
  /^docs\/audit\/issue-fix-archive-\d{4}-\d{2}\.md$/,
  /^docs\/history\/(?:feature-designs|implementation-plans)-\d{4}-\d{2}(?:-\d{2}-to-\d{2})?\.md$/,
]);
const deprecatedReferenceNames = Object.freeze([
  'README-UPI-ONLY.md',
  'RELEASING.md',
  'Release.md',
  'docs/CONFIG-USAGE.md',
  'docs/architecture/module-map.md',
  'docs/architecture/permission-map.md',
  'docs/md/',
  '项目完整链路说明.md',
  '项目文件结构说明.md',
  '项目开发规范（AI协作）.md',
]);

function normalizePath(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\.\//, '');
}

export function isAllowedMarkdownPath(relativePath) {
  const normalized = normalizePath(relativePath);
  return exactAllowedPaths.has(normalized)
    || allowedArchivePatterns.some((pattern) => pattern.test(normalized));
}

function listTrackedMarkdown(rootDir) {
  return execFileSync('git', ['ls-files', '*.md'], { cwd: rootDir, encoding: 'utf8' })
    .split(/\r?\n/)
    .map(normalizePath)
    .filter(Boolean);
}

function walkMarkdown(directory, rootDir, results) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkMarkdown(absolutePath, rootDir, results);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      results.add(normalizePath(path.relative(rootDir, absolutePath)));
    }
  }
}

function listWorkspaceMarkdown(rootDir) {
  const results = new Set(listTrackedMarkdown(rootDir));
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      results.add(normalizePath(entry.name));
    }
  }
  walkMarkdown(path.join(rootDir, 'docs'), rootDir, results);
  walkMarkdown(path.join(rootDir, '.github'), rootDir, results);
  return [...results].sort();
}

function readText(rootDir, relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function extractLinkTarget(rawTarget) {
  const value = String(rawTarget || '').trim();
  if (!value) return '';
  if (value.startsWith('<')) {
    const end = value.indexOf('>');
    return end === -1 ? value.slice(1) : value.slice(1, end);
  }
  return value.split(/\s+["']/u, 1)[0];
}

export function findBrokenRelativeLinks(rootDir, sourcePaths) {
  const failures = [];
  for (const sourcePath of sourcePaths) {
    const sourceText = readText(rootDir, sourcePath);
    const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/gu;
    for (const match of sourceText.matchAll(linkPattern)) {
      const target = extractLinkTarget(match[1]);
      if (!target || target.startsWith('#') || /^[a-z][a-z\d+.-]*:/iu.test(target) || target.startsWith('//')) {
        continue;
      }
      const pathPart = target.split('#', 1)[0];
      if (!pathPart) continue;
      let decodedPath = pathPart;
      try {
        decodedPath = decodeURIComponent(pathPart);
      } catch {
        failures.push(`${sourcePath} has an invalid encoded link: ${target}`);
        continue;
      }
      const absoluteTarget = path.resolve(rootDir, path.dirname(sourcePath), decodedPath);
      const relativeTarget = normalizePath(path.relative(rootDir, absoluteTarget));
      if (relativeTarget.startsWith('../') || path.isAbsolute(relativeTarget)) {
        failures.push(`${sourcePath} links outside the repository: ${target}`);
      } else if (!fs.existsSync(absoluteTarget)) {
        failures.push(`${sourcePath} has a broken relative link: ${target}`);
      }
    }
  }
  return failures;
}

function collectMatches(text, pattern, groupIndex = 1) {
  return [...text.matchAll(pattern)].map((match) => match[groupIndex]);
}

export function findIssueIndexProblems(indexText, archiveTexts) {
  const failures = [];
  const referencePattern = /\((docs\/audit\/)?(issue-fix-archive-\d{4}-\d{2}\.md)#([a-z\d-]+)\)/giu;
  const references = [...indexText.matchAll(referencePattern)].map((match) => ({
    archivePath: `docs/audit/${match[2]}`,
    anchor: match[3],
  }));
  const referenceKeys = new Set();

  for (const reference of references) {
    const key = `${reference.archivePath}#${reference.anchor}`;
    if (referenceKeys.has(key)) {
      failures.push(`issue index contains a duplicate reference: ${key}`);
    }
    referenceKeys.add(key);
    const archiveText = archiveTexts.get(reference.archivePath);
    if (!archiveText) {
      failures.push(`issue index references a missing archive: ${reference.archivePath}`);
    } else if (!archiveText.includes(`<a id="${reference.anchor}"></a>`)) {
      failures.push(`issue index references a missing anchor: ${key}`);
    }
  }

  for (const [archivePath, archiveText] of archiveTexts) {
    const anchors = collectMatches(archiveText, /^<a id="([a-z\d-]+)"><\/a>$/gimu);
    const exemptions = new Set(collectMatches(
      archiveText,
      /<!--\s*issue-index-exempt:\s*([a-z\d-]+)(?:;[^>]*)?-->/giu,
    ));
    const seenAnchors = new Set();
    for (const anchor of anchors) {
      if (seenAnchors.has(anchor)) {
        failures.push(`${archivePath} contains a duplicate anchor: ${anchor}`);
      }
      seenAnchors.add(anchor);
      if (!referenceKeys.has(`${archivePath}#${anchor}`) && !exemptions.has(anchor)) {
        failures.push(`${archivePath} anchor is missing from the issue index: ${anchor}`);
      }
    }
    for (const exemption of exemptions) {
      if (!seenAnchors.has(exemption)) {
        failures.push(`${archivePath} has an exemption for a missing anchor: ${exemption}`);
      }
    }
  }

  return failures;
}

export function auditDocumentation(rootDir = defaultRoot) {
  const failures = [];
  const workspaceMarkdown = listWorkspaceMarkdown(rootDir);
  for (const relativePath of workspaceMarkdown) {
    if (!isAllowedMarkdownPath(relativePath)) {
      failures.push(`unexpected Markdown file: ${relativePath}; merge it into a current document or dated archive`);
    }
  }

  for (const requiredPath of currentDocumentationPaths) {
    if (!fs.existsSync(path.join(rootDir, requiredPath))) {
      failures.push(`missing current document: ${requiredPath}`);
    }
  }

  const availableCurrentPaths = currentDocumentationPaths.filter((relativePath) => (
    fs.existsSync(path.join(rootDir, relativePath))
  ));
  failures.push(...findBrokenRelativeLinks(rootDir, availableCurrentPaths));

  const currentText = livingReferencePaths
    .filter((relativePath) => fs.existsSync(path.join(rootDir, relativePath)))
    .map((relativePath) => readText(rootDir, relativePath))
    .join('\n');
  for (const deprecatedName of deprecatedReferenceNames) {
    if (currentText.includes(deprecatedName)) {
      failures.push(`current documentation still references deprecated documentation: ${deprecatedName}`);
    }
  }

  const archivePaths = workspaceMarkdown.filter((relativePath) => (
    /^docs\/audit\/issue-fix-archive-\d{4}-\d{2}\.md$/.test(relativePath)
  ));
  const archiveTexts = new Map(archivePaths.map((relativePath) => [
    relativePath,
    readText(rootDir, relativePath),
  ]));
  const issueIndex = fs.existsSync(path.join(rootDir, 'docs/audit/issue-fix-index.md'))
    ? readText(rootDir, 'docs/audit/issue-fix-index.md')
    : '';
  failures.push(...findIssueIndexProblems(issueIndex, archiveTexts));

  for (const historyPath of workspaceMarkdown.filter((relativePath) => relativePath.startsWith('docs/history/'))) {
    const historyText = readText(rootDir, historyPath);
    if (!historyText.includes('仅用于追溯') || !historyText.includes('当前')) {
      failures.push(`${historyPath} must state that it is historical and current docs take precedence`);
    }
  }

  try {
    const manifest = JSON.parse(readText(rootDir, 'manifest.json'));
    const changelog = readText(rootDir, 'CHANGELOG.md');
    const latestVersion = changelog.match(/^## CDK Redeem Only V([^\s]+)\s*$/mu)?.[1] || '';
    if (latestVersion !== manifest.version) {
      failures.push(`CHANGELOG latest version ${latestVersion || '(missing)'} does not match manifest ${manifest.version}`);
    }
  } catch (error) {
    failures.push(`cannot validate documentation version: ${error.message}`);
  }

  const development = fs.existsSync(path.join(rootDir, 'docs/DEVELOPMENT.md'))
    ? readText(rootDir, 'docs/DEVELOPMENT.md')
    : '';
  const contributing = fs.existsSync(path.join(rootDir, 'CONTRIBUTING.md'))
    ? readText(rootDir, 'CONTRIBUTING.md')
    : '';
  const agents = fs.existsSync(path.join(rootDir, 'AGENTS.md'))
    ? readText(rootDir, 'AGENTS.md')
    : '';
  if (!development.includes('npm run docs:check') || !development.includes('同一个提交')) {
    failures.push('docs/DEVELOPMENT.md must define the enforced documentation lifecycle');
  }
  if (!contributing.includes('npm run docs:check')) {
    failures.push('CONTRIBUTING.md must require the documentation audit');
  }
  if (!agents.includes('## Documentation Lifecycle')) {
    failures.push('AGENTS.md must retain the documentation lifecycle rules');
  }

  return failures;
}

function main() {
  let failures;
  try {
    failures = auditDocumentation(defaultRoot);
  } catch (error) {
    failures = [`documentation audit crashed: ${error.stack || error.message}`];
  }
  if (failures.length) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    process.exit(1);
  }
  console.log('PASS documentation structure, links, versions, and archive indexes are current.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
