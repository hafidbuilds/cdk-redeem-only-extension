const assert = require('node:assert/strict');
const test = require('node:test');

const lifecycle = require('../background/account-lifecycle-service.js');
const { createRegistrationAccountState } = require('../background/registration-account-state.js');

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
  assert.deepEqual(lifecycle.canUseAccount({
    lifecycle: { validityStatus: 'valid' },
    credentials: { accessTokenStatus: 'missing' },
  }), { allowed: false, reasonCode: 'ACCESS_TOKEN_MISSING' });
});

test('unverified replacement cannot overwrite the old token and deactivated accounts remain unusable', () => {
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
  assert.equal(deactivated.credentials.accessTokenStatus, 'invalid');
  assert.equal(deactivated.lifecycle.validityStatus, 'deactivated');
  assert.equal(deactivated.lifecycle.reasonCode, 'ACCOUNT_DEACTIVATED');
  assert.equal(lifecycle.canUseAccount({ lifecycle: deactivated.lifecycle, credentials: deactivated.credentials }).allowed, false);
});

test('deactivation evidence preserves password and TOTP while clearing the access token', async () => {
  let record = {
    id: 'sample@example.com',
    credentials: {
      password: 'preserved-password',
      totpSecret: 'PRESERVEDTOTP',
      accessToken: 'old-token',
      accessTokenStatus: 'valid',
    },
    lifecycle: { validityStatus: 'valid' },
  };
  const service = lifecycle.createAccountLifecycleService({
    repository: {
      getAccount: async () => record,
      updateCredentials: async (_accountId, credentials) => {
        record = { ...record, credentials };
        return record;
      },
      updateLifecycle: async (_accountId, lifecyclePatch) => {
        record = { ...record, lifecycle: { ...record.lifecycle, ...lifecyclePatch } };
        return record;
      },
    },
  });

  const result = await service.applyAccessTokenEvidence('sample@example.com', {
    errorCode: 'account_deactivated',
    message: '账号已停用。',
  }, { checkedAt: '2026-08-02T00:00:00.000Z' });

  assert.equal(result.retryable, false);
  assert.equal(result.record.credentials.password, 'preserved-password');
  assert.equal(result.record.credentials.totpSecret, 'PRESERVEDTOTP');
  assert.equal(result.record.credentials.accessToken, '');
  assert.equal(result.record.credentials.accessTokenStatus, 'invalid');
  assert.equal(result.record.lifecycle.validityStatus, 'deactivated');
  assert.equal(result.record.lifecycle.reason, '账号已停用。');
});

test('registration deactivation marker creates one canonical account and is idempotent', async () => {
  let record = null;
  const lifecycleEvidence = [];
  const broadcasts = [];
  const state = {
    email: 'sample@example.com',
    password: 'preserved-password',
    passwordAccountIdentifier: 'sample@example.com',
    emailGenerator: 'custom-pool',
    customEmailPoolEntries: [{ email: 'sample@example.com', enabled: true, used: false }],
  };
  const registry = createRegistrationAccountState({
    getState: async () => state,
    accountRepository: {
      getAccount: async () => record,
      upsertAccount: async (nextRecord) => {
        record = nextRecord;
        return record;
      },
      readRoot: async () => ({ accounts: record ? [record] : [] }),
    },
    accountLifecycleService: {
      applyAccessTokenEvidence: async (_email, evidence, options) => {
        lifecycleEvidence.push({ evidence, options });
        record = {
          ...record,
          credentials: { ...record.credentials, accessToken: '', accessTokenStatus: 'invalid' },
          lifecycle: { validityStatus: 'deactivated', reasonCode: 'ACCOUNT_DEACTIVATED' },
        };
        return { record, retryable: false };
      },
    },
    customEmailPoolStateRegistry: {
      markCurrentCustomEmailPoolEntryRegistrationBlocked: async () => ({
        updated: true,
        selectedCustomEmailPoolEmail: 'next@example.com',
      }),
    },
    markCurrentRegistrationAccountUnavailable: async () => ({ updated: true }),
    broadcastDataUpdate: (payload) => broadcasts.push(payload),
    addLog: async () => {},
  });

  const first = await registry.markCurrentRegistrationAccountDeactivated(state, {
    checkedAt: '2026-08-02T00:00:00.000Z',
  });
  const second = await registry.markCurrentRegistrationAccountDeactivated(state, {
    checkedAt: '2026-08-02T00:00:00.000Z',
  });

  assert.equal(record.id, 'sample@example.com');
  assert.equal(record.credentials.password, 'preserved-password');
  assert.equal(record.credentials.accessToken, '');
  assert.equal(record.credentials.accessTokenStatus, 'invalid');
  assert.equal(record.lifecycle.validityStatus, 'deactivated');
  assert.equal(first.nextEmail, 'next@example.com');
  assert.equal(second.nextEmail, 'next@example.com');
  assert.equal(lifecycleEvidence.length, 2);
  assert.equal(lifecycleEvidence[0].evidence.errorCode, 'account_deactivated');
  assert.equal(broadcasts.length, 2);
});

test('trial eligibility lifecycle requires explicit evidence', () => {
  const ineligible = lifecycle.buildTrialEligibilityPatch({
    status: 'ineligible',
    reason: 'not-eligible',
  }, { checkedAt: '2026-07-27T01:00:00Z' });
  assert.equal(ineligible.eligibilityStatus, 'ineligible');
  assert.equal(ineligible.reasonCode, 'UPI_TRIAL_INELIGIBLE');
  assert.equal(ineligible.reason, 'not-eligible');
  assert.throws(
    () => lifecycle.buildTrialEligibilityPatch({ status: 'unknown', reason: 'network error' }),
    /明确状态/
  );
});
