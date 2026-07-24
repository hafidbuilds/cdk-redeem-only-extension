const assert = require('node:assert/strict');
const test = require('node:test');

const lifecycle = require('../background/account-lifecycle-service.js');

test('network, timeout, and 5xx evidence preserve the current access token', () => {
  const current = { accessToken: 'preserved-token', accessTokenStatus: 'valid' };
  for (const evidence of [{ networkError: true }, { timeout: true }, { httpStatus: 503 }]) {
    const patch = lifecycle.buildAccessTokenPatch(current, evidence, { checkedAt: '2026-07-25T00:00:00Z' });
    assert.equal(patch.credentials.accessToken, 'preserved-token');
    assert.equal(patch.credentials.accessTokenStatus, 'valid');
    assert.equal(patch.retryable, true);
  }
});

test('only explicit invalidity marks a token invalid, while missing remains distinct', () => {
  const invalid = lifecycle.buildAccessTokenPatch({ accessToken: 'old-token', accessTokenStatus: 'valid' }, { httpStatus: 401 });
  assert.equal(invalid.credentials.accessTokenStatus, 'invalid');
  assert.equal(invalid.credentials.accessToken, 'old-token');
  assert.deepEqual(lifecycle.canRedeemAccount({
    lifecycle: { validityStatus: 'valid' },
    credentials: { accessTokenStatus: 'missing' },
  }), { allowed: false, reasonCode: 'ACCESS_TOKEN_MISSING' });
});

test('unverified replacement cannot overwrite the old token and deactivated accounts cannot redeem', () => {
  const replacement = lifecycle.buildAccessTokenPatch(
    { accessToken: 'old-token', accessTokenStatus: 'invalid' },
    {},
    { replacementToken: 'new-unverified-token', replacementVerified: false }
  );
  assert.equal(replacement.credentials.accessToken, 'old-token');
  assert.equal(replacement.credentials.accessTokenStatus, 'validating');

  const deactivated = lifecycle.buildAccessTokenPatch(
    { accessToken: 'old-token', accessTokenStatus: 'valid' },
    { errorCode: 'account_deactivated' }
  );
  assert.equal(deactivated.credentials.accessToken, '');
  assert.equal(deactivated.lifecycle.validityStatus, 'deactivated');
  assert.equal(lifecycle.canRedeemAccount({ lifecycle: deactivated.lifecycle, credentials: deactivated.credentials }).allowed, false);
});
