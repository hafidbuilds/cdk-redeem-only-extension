const assert = require('node:assert/strict');
const test = require('node:test');

require('../shared/account-record-schema.js');
const migration = require('../background/account-record-migration.js');

const NOW = '2026-07-25T02:00:00.000Z';

function buildSources() {
  return {
    customEmailPoolEntries: [
      { email: ' DUP@example.com ', password: 'pool-password' },
      { email: 'invalid-row' },
    ],
    accountRunHistory: [
      { email: 'dup@example.com', finalStatus: 'success', finishedAt: '2026-07-25T01:00:00Z' },
      { email: 'deactivated@example.com', status: 'failed', reasonCode: 'account_deactivated' },
    ],
    upiCredentialMembershipCheckResults: {
      updatedAt: '2026-07-25T01:30:00Z',
      items: [
        { email: 'dup@example.com', status: 'free', trialEligibilityStatus: 'eligible', accessToken: 'token-fixture' },
        {
          email: 'no2fa@example.com',
          status: 'free',
          accessToken: 'no2fa-token-fixture',
          verificationUrl: 'https://pickup.example/no2fa',
          no2faFreeRecordedAt: 1700000000,
        },
        { email: 'multi@example.com', status: 'paid', planType: 'plus', redeemChannel: 'ideal', redeemStatus: 'success' },
        { email: 'multi@example.com', status: 'paid', planType: 'plus', redeemChannel: 'pix', redeemStatus: 'pending' },
      ],
      redeemAutoDeletedEmails: ['deleted-free@example.com'],
      redeemPlusDeletedEmailsByChannel: { upi: ['deleted-upi@example.com'], ideal: [], pix: ['deleted-pix@example.com'] },
    },
    upiAccountCredentialBackups: {
      'dup@example.com': { email: 'dup@example.com', password: 'newer-password', totpMfaSecret: 'abcd 1234', updatedAt: '2026-07-25T01:45:00Z' },
    },
    pixRedeemCdkeyUsage: {
      UPI_FIXTURE: { email: 'legacy-alias@example.com', status: 'success' },
    },
    pixChannelRedeemCdkeyUsage: {
      PIX_FIXTURE: { email: 'pix-real@example.com', status: 'pending' },
    },
  };
}

test('migration merges duplicates, filters invalid rows, and preserves separate lifecycle dimensions', () => {
  const root = migration.buildAccountRecordsV2FromLegacy(buildSources(), { now: NOW });
  assert.equal(Object.hasOwn(root.items, 'invalid-row'), false);
  assert.equal(Object.keys(root.items).filter((id) => id === 'dup@example.com').length, 1);
  assert.equal(root.items['dup@example.com'].credentials.password, 'newer-password');
  assert.equal(root.items['dup@example.com'].credentials.totpSecret, 'ABCD1234');
  assert.equal(root.items['dup@example.com'].lifecycle.validityStatus, 'valid');
  assert.equal(root.items['dup@example.com'].lifecycle.membershipStatus, 'free');
  assert.equal(root.items['dup@example.com'].lifecycle.eligibilityStatus, 'eligible');
  assert.equal(root.items['no2fa@example.com'].credentials.no2faFreeRoute, true);
  assert.equal(root.items['no2fa@example.com'].credentials.twoFactorEnabled, false);
  assert.equal(root.items['deactivated@example.com'].lifecycle.validityStatus, 'deactivated');
});

test('migration keeps UPI, IDEAL, and PIX state isolated and maps old pixRedeem alias to UPI only', () => {
  const root = migration.buildAccountRecordsV2FromLegacy(buildSources(), { now: NOW });
  const multi = root.items['multi@example.com'];
  assert.equal(multi.redemption.ideal.status, 'succeeded');
  assert.equal(multi.redemption.pix.status, 'pending');
  assert.equal(multi.redemption.upi.status, 'idle');
  assert.equal(root.items['legacy-alias@example.com'].redemption.upi.status, 'succeeded');
  assert.equal(root.items['legacy-alias@example.com'].redemption.pix.status, 'idle');
  assert.equal(root.items['pix-real@example.com'].redemption.pix.status, 'pending');
});

test('migration retains deletion tombstones and is idempotent', () => {
  const first = migration.buildAccountRecordsV2FromLegacy(buildSources(), { now: NOW });
  const second = migration.buildAccountRecordsV2FromLegacy({ ...buildSources(), accountRecordsV2: first }, {
    now: '2026-07-25T03:00:00.000Z',
  });
  assert.deepEqual(second, first);
  assert.equal(first.items['deleted-free@example.com'].metadata.deleted.free, true);
  assert.deepEqual(first.items['deleted-upi@example.com'].metadata.deleted.channels, ['upi']);
  assert.deepEqual(first.items['deleted-pix@example.com'].metadata.deleted.channels, ['pix']);
});
