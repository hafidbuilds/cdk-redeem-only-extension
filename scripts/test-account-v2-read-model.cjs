const assert = require('node:assert/strict');
const test = require('node:test');

require('../shared/account-record-schema.js');
const migration = require('../background/account-record-migration.js');
const adapter = require('../shared/account-compatibility-adapter.js');

test('V2 read model keeps legacy display count, groups, and export selection', () => {
  const legacy = {
    items: [
      { email: 'free@example.com', status: 'free', password: 'fixture-password', totpMfaSecret: 'FIXTURESECRET' },
      { email: 'upi@example.com', status: 'paid', planType: 'plus', redeemChannel: 'upi' },
      { email: 'ideal@example.com', status: 'paid', planType: 'plus', redeemChannel: 'ideal' },
      { email: 'pix@example.com', status: 'paid', planType: 'plus', redeemChannel: 'pix' },
      { email: 'deactivated@example.com', status: 'failed', reasonCode: 'account_deactivated' },
    ],
    redeemAutoDeletedEmails: [],
    redeemPlusDeletedEmailsByChannel: { upi: [], ideal: [], pix: [] },
  };
  const canonical = migration.buildAccountRecordsV2FromLegacy({
    upiCredentialMembershipCheckResults: legacy,
  }, { now: '2026-07-25T06:00:00.000Z' });
  const projected = adapter.projectAccountRecordsToMembershipResults(canonical);

  assert.equal(projected.items.length, legacy.items.length);
  assert.deepEqual(
    projected.items.map((row) => `${row.status}:${row.redeemChannel || ''}`).sort(),
    legacy.items.map((row) => `${row.status}:${row.redeemChannel || ''}`).sort()
  );
  const legacyExport = legacy.items.filter((row) => row.status === 'free' && row.password && row.totpMfaSecret).map((row) => row.email);
  const projectedExport = projected.items.filter((row) => row.status === 'free' && row.password && row.totpMfaSecret).map((row) => row.email);
  assert.deepEqual(projectedExport, legacyExport);
});
