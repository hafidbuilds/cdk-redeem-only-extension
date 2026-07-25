const assert = require('node:assert/strict');
const test = require('node:test');

const schema = require('../shared/account-record-schema.js');
const adapter = require('../shared/account-compatibility-adapter.js');

test('compatibility projection preserves Free/Plus groups and channel ownership', () => {
  const free = schema.normalizeAccountRecord({
    id: 'free@example.com',
    credentials: { accessTokenStatus: 'missing' },
    lifecycle: { validityStatus: 'valid', membershipStatus: 'free', eligibilityStatus: 'eligible' },
  });
  const plus = schema.normalizeAccountRecord({
    id: 'plus@example.com',
    lifecycle: { validityStatus: 'valid', membershipStatus: 'plus', membershipChannel: 'ideal' },
    metadata: { paidChannels: ['ideal', 'pix'] },
    redemption: { ideal: { status: 'succeeded' }, pix: { status: 'succeeded' } },
  });
  const projected = adapter.projectAccountRecordsToMembershipResults({
    schemaVersion: 2,
    items: { [free.id]: free, [plus.id]: plus },
  });

  assert.equal(projected.items.filter((row) => row.status === 'free').length, 1);
  assert.deepEqual(
    projected.items.filter((row) => row.status === 'paid').map((row) => row.redeemChannel).sort(),
    ['ideal', 'pix']
  );
});

test('latest legacy rows override stale projected fields while tombstones are merged', () => {
  const canonical = schema.normalizeAccountRecord({
    id: 'live@example.com',
    lifecycle: { membershipStatus: 'free' },
    metadata: { deleted: { channels: ['upi'] } },
  });
  const projected = adapter.projectAccountRecordsToMembershipResults({
    schemaVersion: 2,
    items: { [canonical.id]: canonical },
  }, {
    items: [{ email: 'live@example.com', status: 'free', reason: 'fresh runtime result' }],
    redeemAutoDeletedEmails: ['free-deleted@example.com'],
    redeemPlusDeletedEmailsByChannel: { upi: [], ideal: [], pix: ['pix-deleted@example.com'] },
  });

  assert.equal(projected.items.length, 1);
  assert.equal(projected.items[0].reason, 'fresh runtime result');
  assert.deepEqual(projected.redeemAutoDeletedEmails, ['free-deleted@example.com']);
  assert.deepEqual(projected.redeemPlusDeletedEmailsByChannel.upi, ['live@example.com']);
  assert.deepEqual(projected.redeemPlusDeletedEmailsByChannel.pix, ['pix-deleted@example.com']);
});

test('compatibility projection restores no-2FA route for legacy canonical Free credentials', () => {
  const canonical = schema.normalizeAccountRecord({
    id: 'no2fa@example.com',
    credentials: {
      accessToken: 'fixture-token',
      verificationUrl: 'https://pickup.example/no2fa',
    },
    lifecycle: { validityStatus: 'valid', membershipStatus: 'free' },
  });
  const projected = adapter.projectAccountRecordsToMembershipResults({
    schemaVersion: 2,
    items: { [canonical.id]: canonical },
  });

  assert.equal(projected.items[0].no2faFreeRoute, true);
  assert.equal(projected.items[0].twoFactorEnabled, false);
});
