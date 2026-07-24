const assert = require('node:assert/strict');
const test = require('node:test');

const schema = require('../shared/account-record-schema.js');

test('normalizeAccountId trims, lowercases, and rejects invalid identities', () => {
  assert.equal(schema.normalizeAccountId('  User.Name@Example.COM  '), 'user.name@example.com');
  assert.equal(schema.normalizeAccountId(''), '');
  assert.equal(schema.normalizeAccountId('not-an-email'), '');
  assert.equal(schema.normalizeAccountId('two@@example.com'), '');
});

test('account status dimensions and redemption channels remain independent', () => {
  const record = schema.normalizeAccountRecord({
    id: 'person@example.com',
    credentials: { accessToken: '', accessTokenStatus: 'missing' },
    lifecycle: {
      validityStatus: 'valid',
      eligibilityStatus: 'eligible',
      membershipStatus: 'free',
    },
    redemption: {
      upi: { status: 'failed', failureCount: 2 },
      ideal: { status: 'succeeded' },
      pix: { status: 'pending' },
    },
  });

  assert.equal(record.lifecycle.validityStatus, 'valid');
  assert.equal(record.lifecycle.membershipStatus, 'free');
  assert.equal(record.credentials.accessTokenStatus, 'missing');
  assert.equal(record.redemption.upi.status, 'failed');
  assert.equal(record.redemption.ideal.status, 'succeeded');
  assert.equal(record.redemption.pix.status, 'pending');
});

test('merging one redemption channel does not overwrite the other channels', () => {
  const current = schema.normalizeAccountRecord({
    id: 'channels@example.com',
    redemption: { upi: { status: 'succeeded' }, ideal: { status: 'failed' }, pix: { status: 'pending' } },
  });
  const merged = schema.mergeAccountRecord(current, {
    redemption: { ideal: { status: 'succeeded', remoteJobId: 'job_ideal' } },
  }, { now: '2026-07-25T01:00:00.000Z' });

  assert.equal(merged.redemption.upi.status, 'succeeded');
  assert.equal(merged.redemption.ideal.status, 'succeeded');
  assert.equal(merged.redemption.ideal.remoteJobId, 'job_ideal');
  assert.equal(merged.redemption.pix.status, 'pending');
});
