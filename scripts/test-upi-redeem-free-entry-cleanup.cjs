const test = require('node:test');
const assert = require('node:assert/strict');

const { createUpiRedeemFreeEntryCleanup } = require('../background/steps/upi-redeem/free-entry-cleanup.js');

function createCleanup() {
  return createUpiRedeemFreeEntryCleanup({
    normalizeString: (value = '') => String(value || '').trim(),
    parseCdkeyPoolText: (value = '') => String(value || '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
    splitPoolEntrySource: (value = []) => Array.isArray(value) ? value : [],
    parsePoolEntryEmail: (value = '') => {
      const source = value && typeof value === 'object' ? (value.email || value.credential || '') : value;
      return String(source || '').split('----')[0].trim().toLowerCase();
    },
  });
}

test('Free cleanup normalizes and deduplicates email pool values', () => {
  const cleanup = createCleanup();
  assert.deepEqual(cleanup.normalizeEmailPoolValues([
    ' First@Example.com ',
    { credential: 'first@example.com----code' },
    { email: 'second@example.com' },
  ]), ['first@example.com', 'second@example.com']);
});

test('Free cleanup removes only the completed account from provider pool', () => {
  const cleanup = createCleanup();
  const updates = cleanup.buildSuccessfulRedeemCleanupUpdates({
    customMailProviderPool: ['done@example.com----one', 'keep@example.com----two'],
    selectedCustomEmailPoolEmail: 'done@example.com',
  }, 'FIXTURE-CDK', 'done@example.com');

  assert.deepEqual(updates.customMailProviderPool, ['keep@example.com----two']);
  assert.equal(updates.selectedCustomEmailPoolEmail, '');
});

test('Free cleanup removes only the selected CDK text entry', () => {
  const cleanup = createCleanup();
  assert.equal(cleanup.removeCdkeyFromPoolText('FIXTURE-A\nFIXTURE-B', 'FIXTURE-A'), 'FIXTURE-B');
});
