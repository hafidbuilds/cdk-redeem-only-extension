const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const modulePromise = import('./audit-documentation.mjs');

test('documentation audit allows only current documents and dated archives', async () => {
  const api = await modulePromise;
  assert.equal(api.isAllowedMarkdownPath('docs/DEVELOPMENT.md'), true);
  assert.equal(api.isAllowedMarkdownPath('docs/audit/issue-fix-archive-2026-08.md'), true);
  assert.equal(api.isAllowedMarkdownPath('docs/history/feature-designs-2026-08.md'), true);
  assert.equal(api.isAllowedMarkdownPath('docs/new-feature-plan.md'), false);
  assert.equal(api.isAllowedMarkdownPath('docs/audit/2026-08-01-one-problem.md'), false);
});

test('documentation audit detects broken relative links', async (t) => {
  const api = await modulePromise;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-audit-links-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'README.md'), '[ok](docs/guide.md) [bad](docs/missing.md)\n');
  fs.writeFileSync(path.join(root, 'docs', 'guide.md'), '# Guide\n');

  assert.deepEqual(api.findBrokenRelativeLinks(root, ['README.md']), [
    'README.md has a broken relative link: docs/missing.md',
  ]);
});

test('issue archive anchors require an index entry or an explicit exemption', async () => {
  const api = await modulePromise;
  const archivePath = 'docs/audit/issue-fix-archive-2026-08.md';
  const indexedAnchor = '2026-08-01-indexed';
  const exemptAnchor = '2026-08-01-design-note';
  const index = `[record](issue-fix-archive-2026-08.md#${indexedAnchor})`;
  const archive = [
    `<a id="${indexedAnchor}"></a>`,
    `<!-- issue-index-exempt: ${exemptAnchor}; reason: design note -->`,
    `<a id="${exemptAnchor}"></a>`,
  ].join('\n');

  assert.deepEqual(api.findIssueIndexProblems(index, new Map([[archivePath, archive]])), []);
  assert.deepEqual(
    api.findIssueIndexProblems(index, new Map([[archivePath, `${archive}\n<a id="2026-08-02-missing"></a>`]])),
    [`${archivePath} anchor is missing from the issue index: 2026-08-02-missing`],
  );
});
