const assert = require('node:assert/strict');
const test = require('node:test');

require('../shared/account-record-schema.js');
const migration = require('../background/account-record-migration.js');

const NOW = '2026-07-25T02:00:00.000Z';

function buildSources() {
  return {
    customEmailPoolEntries: [
      { email: ' DUP@example.com ', password: 'pool-password' },
      {
        email: 'ineligible@example.com',
        trialEligibilityStatus: 'ineligible',
        trialEligibilityReason: 'not-eligible',
        trialEligibilityReasonCode: 'UPI_TRIAL_INELIGIBLE',
        trialEligibilityCheckedAt: '2026-07-25T01:10:00Z',
      },
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
  assert.equal(root.items['ineligible@example.com'].lifecycle.eligibilityStatus, 'ineligible');
  assert.equal(root.items['ineligible@example.com'].lifecycle.reason, 'not-eligible');
  assert.equal(root.items['ineligible@example.com'].lifecycle.reasonCode, 'UPI_TRIAL_INELIGIBLE');
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

test('settings import restores explicit membership rows without erasing unrelated canonical data', () => {
  const schema = globalThis.MultiPageAccountRecordSchema;
  const restored = schema.createEmptyAccountRecord('restored@example.com', { now: NOW });
  restored.credentials.password = 'keep-existing-password';
  restored.credentials.accessToken = 'old-token';
  restored.credentials.accessTokenStatus = 'valid';
  restored.metadata.deleted = { free: true, marked: true };
  const untouched = schema.createEmptyAccountRecord('untouched@example.com', { now: NOW });
  untouched.metadata.deleted = { free: true };
  const invalidToken = schema.createEmptyAccountRecord('invalid-token@example.com', { now: NOW });
  invalidToken.credentials.accessToken = 'confirmed-invalid-token';
  invalidToken.credentials.accessTokenStatus = 'invalid';
  const sources = {
    accountRecordsV2: {
      items: { [restored.id]: restored, [untouched.id]: untouched, [invalidToken.id]: invalidToken },
    },
    customEmailPoolEntries: [{
      email: restored.id,
      accessToken: 'restored-token',
      accessTokenStatus: 'valid',
      no2faFreeRoute: true,
    }, {
      email: invalidToken.id,
      accessToken: '',
      accessTokenStatus: 'invalid',
    }],
    upiCredentialMembershipCheckResults: {
      items: [
        { email: restored.id, status: 'free', trialEligibilityStatus: 'eligible' },
        { email: invalidToken.id, status: 'free' },
      ],
      redeemAutoDeletedEmails: [],
    },
  };

  const normal = migration.buildAccountRecordsV2FromLegacy(sources, { now: NOW });
  assert.equal(normal.items[restored.id].metadata.deleted.free, true);
  assert.equal(normal.items[restored.id].credentials.accessToken, 'old-token');

  const imported = migration.buildAccountRecordsV2FromLegacy(sources, {
    now: NOW,
    preferLegacyMembershipResults: true,
  });
  assert.equal(imported.items[restored.id].lifecycle.membershipStatus, 'free');
  assert.equal(imported.items[restored.id].lifecycle.eligibilityStatus, 'eligible');
  assert.equal(imported.items[restored.id].metadata.deleted.free, undefined);
  assert.equal(imported.items[restored.id].metadata.deleted.marked, true);
  assert.equal(imported.items[restored.id].credentials.accessToken, 'restored-token');
  assert.equal(imported.items[restored.id].credentials.password, 'keep-existing-password');
  assert.equal(imported.items[restored.id].credentials.no2faFreeRoute, true);
  assert.equal(imported.items[invalidToken.id].credentials.accessToken, '');
  assert.equal(imported.items[invalidToken.id].credentials.accessTokenStatus, 'invalid');
  assert.equal(imported.items[untouched.id].metadata.deleted.free, true);
});
