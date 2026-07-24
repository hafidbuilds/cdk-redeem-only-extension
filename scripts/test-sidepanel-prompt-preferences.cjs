const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createPreferences() {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const window = { localStorage: storage };
  const source = fs.readFileSync(path.join(__dirname, '../sidepanel/prompt-preferences.js'), 'utf8');
  vm.runInNewContext(source, { window });
  return window.SidepanelPromptPreferences.createPromptPreferences({
    storage,
    keys: {
      newUserGuide: 'guide',
      contributionContentVersion: 'content-version',
      autoSkipFailures: 'skip',
      autoRunFallbackRisk: 'fallback',
      cloudflareRegistrationLookup: 'cloudflare',
    },
  });
}

test('prompt preferences persist and clear boolean dismissals', () => {
  const preferences = createPreferences();
  assert.equal(preferences.isAutoSkipFailuresPromptDismissed(), false);
  preferences.setAutoSkipFailuresPromptDismissed(true);
  assert.equal(preferences.isAutoSkipFailuresPromptDismissed(), true);
  preferences.setAutoSkipFailuresPromptDismissed(false);
  assert.equal(preferences.isAutoSkipFailuresPromptDismissed(), false);
});

test('prompt preferences normalize contribution content version', () => {
  const preferences = createPreferences();
  preferences.setDismissedContributionContentPromptVersion('  v2  ');
  assert.equal(preferences.getDismissedContributionContentPromptVersion(), 'v2');
  preferences.setDismissedContributionContentPromptVersion('');
  assert.equal(preferences.getDismissedContributionContentPromptVersion(), '');
});
