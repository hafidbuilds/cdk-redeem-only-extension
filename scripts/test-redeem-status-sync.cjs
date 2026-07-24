const test = require('node:test');
const assert = require('node:assert/strict');

const syncApi = require('../background/membership/redeem-status-sync.js');

test('pending redeem refresh targets preserve UPI, IDEAL and PIX channel isolation', () => {
  const helpers = syncApi.createRedeemStatusSyncHelpers();
  const state = {
    upiCredentialMembershipCheckResults: {
      items: [
        { email: 'upi@example.com', redeemChannel: 'upi', upiRedeemCdkey: 'SAME-CDK', redeemStatus: 'submitted' },
        { email: 'ideal@example.com', redeemChannel: 'ideal', upiRedeemCdkey: 'SAME-CDK', redeemStatus: 'submitted' },
        { email: 'pix@example.com', redeemChannel: 'pix', upiRedeemCdkey: 'SAME-CDK', redeemStatus: 'submitted' },
      ],
    },
  };
  const targets = helpers.buildPendingUpiCredentialMembershipRedeemRefreshTargets(state);
  assert.deepEqual(targets.upi, ['SAME-CDK']);
  assert.deepEqual(targets.ideal, ['SAME-CDK']);
  assert.deepEqual(targets.pix, ['SAME-CDK']);
  assert.equal(targets.cdkCount, 3);
});

test('explicit recovery CDKs are queried even when the result row is no longer pending', () => {
  const helpers = syncApi.createRedeemStatusSyncHelpers();
  const targets = helpers.buildPendingUpiCredentialMembershipRedeemRefreshTargets({
    upiCredentialMembershipCheckResults: { items: [{ email: 'pix@example.com', redeemChannel: 'pix', upiRedeemCdkey: 'SAME-CDK', redeemStatus: 'failed' }] },
  }, { channel: 'pix', cdkeys: ['SAME-CDK'] });
  assert.deepEqual(targets.pix, ['SAME-CDK']);
  assert.equal(targets.cdkCount, 1);
});
