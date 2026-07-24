const test = require('node:test');
const assert = require('node:assert/strict');

const fixture = require('./fixtures/current-project-baseline.cjs');
const credentialFormat = require('../shared/membership-credential-format.js');
const redeemChannelState = require('../shared/redeem-channel-state.js');

test('baseline fixture covers current Free, Plus, token, and deactivated states', () => {
  assert.deepEqual(Object.keys(fixture.accounts), [
    'free',
    'upiPlus',
    'idealPlus',
    'pixPlus',
    'missingAccessToken',
    'invalidAccessToken',
    'deactivated',
  ]);
  assert.equal(fixture.accounts.missingAccessToken.accessTokenStatus, 'missing');
  assert.equal(fixture.accounts.invalidAccessToken.accessTokenStatus, 'invalid');
  assert.equal(fixture.accounts.deactivated.validityStatus, 'deactivated');
  assert.equal(fixture.accounts.upiPlus.redeemChannel, 'upi');
  assert.equal(fixture.accounts.idealPlus.redeemChannel, 'ideal');
  assert.equal(fixture.accounts.pixPlus.redeemChannel, 'pix');
});

test('baseline Free export field order remains compatible', () => {
  assert.equal(
    credentialFormat.formatFreeCredentialLine(fixture.accounts.free),
    'free.account@example.com---fixture-password---FIXTURETOTPSECRET---fixture-access-token---2026-07-25 00:00:00'
  );
});

test('baseline channel state stays independent', () => {
  assert.deepEqual(redeemChannelState.REDEEM_CHANNELS, ['upi', 'ideal', 'pix']);
  assert.equal(fixture.channels.upi.failureCount, 1);
  assert.equal(fixture.channels.ideal.failureCount, 2);
  assert.equal(fixture.channels.pix.failureCount, 0);
  assert.notEqual(fixture.channels.upi.pool[0], fixture.channels.pix.pool[0]);
});

test('baseline all-redeem choice enables only the selected viable channel', () => {
  const selectable = Object.entries(fixture.redeemChoice)
    .filter(([, state]) => state.redeemCount > 0)
    .map(([channel]) => channel);
  assert.deepEqual(selectable, ['pix']);
});
