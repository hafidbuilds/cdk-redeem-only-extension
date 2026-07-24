const test = require('node:test');
const assert = require('node:assert/strict');

test('release builder includes runtime files and excludes project tooling', async () => {
  const release = await import('../scripts/build-release.mjs');
  assert.equal(release.shouldIncludeReleaseFile('manifest.json'), true);
  assert.equal(release.shouldIncludeReleaseFile('background/steps/open-chatgpt.js'), true);
  assert.equal(release.shouldIncludeReleaseFile('sidepanel/sidepanel.html'), true);
  assert.equal(release.shouldIncludeReleaseFile('scripts/test-build-release.cjs'), false);
  assert.equal(release.shouldIncludeReleaseFile('docs/CONFIG-USAGE.md'), false);
});

test('release builder rejects sensitive runtime artifacts', async () => {
  const release = await import('../scripts/build-release.mjs');
  assert.equal(release.isSafeReleasePath('config.json'), false);
  assert.equal(release.isSafeReleasePath('data/account-run-history.json'), false);
  assert.equal(release.isSafeReleasePath('runtime.log'), false);
  assert.equal(release.isSafeReleasePath('content/signup-page.js'), true);
});
