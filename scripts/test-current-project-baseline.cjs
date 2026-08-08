const test = require('node:test');
const assert = require('node:assert/strict');

const fixture = require('./fixtures/current-project-baseline.cjs');
const accountSchema = require('../shared/account-record-schema.js');
const freeResults = require('../shared/free-account-results.js');

test('baseline fixture covers all V3 Free eligibility and validity states', () => {
  assert.deepEqual(Object.keys(fixture.accounts), [
    'eligible', 'unknown', 'failed', 'ineligible', 'missingAccessToken', 'deactivated',
  ]);
  assert.equal(fixture.accounts.missingAccessToken.accessTokenStatus, 'missing');
  assert.equal(fixture.accounts.deactivated.validityStatus, 'deactivated');
});

test('V3 grouping only places explicit ineligible accounts in the ineligible group', () => {
  assert.equal(freeResults.getItemGroup(fixture.accounts.eligible), 'free');
  assert.equal(freeResults.getItemGroup(fixture.accounts.unknown), 'free');
  assert.equal(freeResults.getItemGroup(fixture.accounts.failed), 'free');
  assert.equal(freeResults.getItemGroup(fixture.accounts.ineligible), 'free-ineligible');
});

test('canonical membership status rejects historical Plus classification', () => {
  const normalized = accountSchema.normalizeAccountRecord({
    id: 'legacy@example.com',
    lifecycle: { membershipStatus: 'plus', eligibilityStatus: 'eligible' },
    metadata: { paidChannels: ['upi'], legacyPlanType: 'plus', keep: 'history' },
  });
  assert.equal(normalized.schemaVersion, 3);
  assert.equal(normalized.lifecycle.membershipStatus, 'unknown');
  assert.equal(Object.hasOwn(normalized.metadata, 'paidChannels'), false);
  assert.equal(Object.hasOwn(normalized.metadata, 'legacyPlanType'), false);
  assert.equal(normalized.metadata.keep, 'history');
});
