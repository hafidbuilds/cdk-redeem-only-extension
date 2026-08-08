const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.self = globalThis;
delete globalThis.MultiPageBackgroundEnableTotpMfa;
delete globalThis.MultiPageBackgroundEnablePasskey;
delete globalThis.MultiPageBackgroundCheckTrialEligibility;
delete require.cache[require.resolve('../background/steps/enable-totp-mfa.js')];
delete require.cache[require.resolve('../background/steps/enable-passkey.js')];
delete require.cache[require.resolve('../background/steps/check-trial-eligibility.js')];
require('../background/steps/enable-totp-mfa.js');
require('../background/steps/enable-passkey.js');
require('../background/steps/check-trial-eligibility.js');

const { createEnableTotpMfaExecutor } = globalThis.MultiPageBackgroundEnableTotpMfa;
const { createEnablePasskeyExecutor } = globalThis.MultiPageBackgroundEnablePasskey;
const { createCheckTrialEligibilityExecutor } = globalThis.MultiPageBackgroundCheckTrialEligibility;

const EMAIL = 'account@example.test';
const TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

test('step 9 validates an existing TOTP credential without opening the enable API or checking eligibility', async () => {
  let fetchCalls = 0;
  let eligibilityCalls = 0;
  const completed = [];
  const persisted = [];
  const executor = createEnableTotpMfaExecutor({
    addLog: async () => {},
    checkRegistrationUpiTrialEligibility: async () => {
      eligibilityCalls += 1;
    },
    completeNodeFromBackground: async (...args) => completed.push(args),
    fetchImpl: async () => {
      fetchCalls += 1;
      throw new Error('enable API must not be called');
    },
    getState: async () => ({}),
    resolveExistingTotpCredential: async () => ({
      email: EMAIL,
      totpMfaSecret: TOTP_SECRET,
      totpMfaEnabledAt: '2026-08-01T00:00:00.000Z',
    }),
    setState: async () => {},
    throwIfStopped: () => {},
    upsertRegistrationResult: async (input) => persisted.push(input),
  });

  const patch = await executor.executeEnableTotpMfa({
    nodeId: 'enable-totp-mfa',
    existingTotpLogin: true,
    existingTotpLoginEmail: EMAIL,
  });

  assert.equal(patch.totpMfaAlreadyEnabled, true);
  assert.equal(patch.totpMfaSecret, TOTP_SECRET);
  assert.equal(fetchCalls, 0);
  assert.equal(eligibilityCalls, 0);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].email, EMAIL);
  assert.equal(persisted[0].trialEligibilityStatus, 'unknown');
  assert.equal(persisted[0].trialEligibilityReasonCode, 'GCASH_ELIGIBILITY_DISABLED');
  assert.equal(completed.length, 1);
  assert.equal(completed[0][0], 'enable-totp-mfa');
});

test('step 9 Passkey route still calls the Passkey enable API and does not check eligibility', async () => {
  let fetchCalls = 0;
  let eligibilityCalls = 0;
  const completed = [];
  const persisted = [];
  const statePatches = [];
  const executor = createEnablePasskeyExecutor({
    addLog: async () => {},
    checkRegistrationUpiTrialEligibility: async () => {
      eligibilityCalls += 1;
    },
    chrome: {
      cookies: {
        getAll: async () => [],
        getAllCookieStores: async () => [{ id: '0' }],
      },
      scripting: {
        executeScript: async () => [{
          result: {
            ok: true,
            status: 200,
            payload: {
              accessToken: 'fixture-access-token',
              sessionToken: 'fixture-session-token',
              user: { email: EMAIL },
            },
          },
        }],
      },
      tabs: {
        get: async () => ({ id: 42, url: 'https://chatgpt.com/#settings/Security' }),
        update: async () => ({ id: 42, url: 'https://chatgpt.com/#settings/Security' }),
      },
    },
    completeNodeFromBackground: async (...args) => completed.push(args),
    fetchImpl: async () => {
      fetchCalls += 1;
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({
          credentialId: 'fixture-credential-id',
          factorId: 'fixture-factor-id',
          persisted: true,
        }),
      };
    },
    getState: async () => ({}),
    getTabId: async () => 42,
    isTabAlive: async () => true,
    now: () => Date.parse('2026-08-02T00:00:00.000Z'),
    setState: async (patch) => statePatches.push(patch),
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
    upsertRegistrationResult: async (input) => persisted.push(input),
    waitForTabCompleteUntilStopped: async () => {},
  });

  const patch = await executor.executeEnablePasskey({
    nodeId: 'enable-passkey',
    email: EMAIL,
    passwordAccountIdentifierType: 'email',
    passwordAccountIdentifier: EMAIL,
    gptPasswordSet: true,
  });

  assert.equal(patch.passkeyEnabled, true);
  assert.equal(patch.passkeyCredentialId, 'fixture-credential-id');
  assert.equal(fetchCalls, 1);
  assert.equal(eligibilityCalls, 0);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].email, EMAIL);
  assert.equal(persisted[0].passkeyEnabled, true);
  assert.equal(persisted[0].trialEligibilityStatus, 'unknown');
  assert.equal(persisted[0].trialEligibilityReasonCode, 'GCASH_ELIGIBILITY_DISABLED');
  assert.equal(completed.length, 1);
  assert.equal(completed[0][0], 'enable-passkey');
  assert.equal(statePatches.some((item) => item.passkeyEnabled === true), true);
});

function createEligibilityHarness(overrides = {}) {
  const completed = [];
  const marks = [];
  const statePatches = [];
  const eligibilityInputs = [];
  const executor = createCheckTrialEligibilityExecutor({
    addLog: async () => {},
    checkRegistrationUpiTrialEligibility: async (input) => {
      eligibilityInputs.push(input);
      return { eligible: true, trialEligibilityStatus: 'eligible' };
    },
    completeNodeFromBackground: async (...args) => completed.push(args),
    getState: async () => ({}),
    markCurrentRegistrationAccountUsed: async (...args) => marks.push(args),
    readCurrentChatGptSessionForExport: async () => ({
      accessToken: 'fixture-access-token',
      session: { user: { email: EMAIL } },
    }),
    setState: async (patch) => statePatches.push(patch),
    throwIfStopped: () => {},
    ...overrides,
  });
  return { completed, eligibilityInputs, executor, marks, statePatches };
}

test('step 10 performs the eligibility request and persists eligible state', async () => {
  const harness = createEligibilityHarness();

  const result = await harness.executor.executeCheckTrialEligibility({
    nodeId: 'check-trial-eligibility',
    email: EMAIL,
    registrationFreeRoute: 'full-2fa',
    totpMfaEnabled: true,
    totpMfaSecret: TOTP_SECRET,
  });

  assert.equal(result.eligible, true);
  assert.equal(harness.eligibilityInputs.length, 1);
  assert.equal(harness.eligibilityInputs[0].email, EMAIL);
  assert.equal(harness.eligibilityInputs[0].accessToken, 'fixture-access-token');
  assert.deepEqual(harness.eligibilityInputs[0].session, { user: { email: EMAIL } });
  assert.equal(harness.statePatches[0].trialEligibilityStatus, 'eligible');
  assert.equal(harness.completed[0][0], 'check-trial-eligibility');
  assert.equal(harness.marks.length, 1);
});

test('step 10 preserves the ineligible result and does not complete the node', async () => {
  const harness = createEligibilityHarness({
    checkRegistrationUpiTrialEligibility: async () => ({
      eligible: false,
      trialEligibilityStatus: 'ineligible',
      reason: 'fixture-ineligible',
    }),
  });

  await assert.rejects(
    harness.executor.executeCheckTrialEligibility({
      email: EMAIL,
      totpMfaEnabled: true,
      totpMfaSecret: TOTP_SECRET,
    }),
    (error) => {
      assert.equal(error.code, 'UPI_ACCOUNT_INELIGIBLE');
      assert.equal(error.retryable, false);
      return true;
    }
  );
  assert.equal(harness.completed.length, 0);
});

test('step 10 keeps temporary eligibility failures retryable', async () => {
  const harness = createEligibilityHarness({
    checkRegistrationUpiTrialEligibility: async () => ({
      eligible: false,
      trialEligibilityStatus: 'unknown',
      reason: 'temporary-network-failure',
    }),
  });

  await assert.rejects(
    harness.executor.executeCheckTrialEligibility({
      email: EMAIL,
      totpMfaEnabled: true,
      totpMfaSecret: TOTP_SECRET,
    }),
    (error) => {
      assert.equal(error.code, 'UPI_ELIGIBILITY_CHECK_FAILED');
      assert.equal(error.retryable, true);
      return true;
    }
  );
});

test('step 10 rejects a missing access token before calling eligibility', async () => {
  const harness = createEligibilityHarness({
    readCurrentChatGptSessionForExport: async () => ({
      accessToken: '',
      session: { user: { email: EMAIL } },
    }),
  });

  await assert.rejects(
    harness.executor.executeCheckTrialEligibility({
      email: EMAIL,
      totpMfaEnabled: true,
      totpMfaSecret: TOTP_SECRET,
    }),
    (error) => {
      assert.equal(error.code, 'UPI_ELIGIBILITY_CHECK_FAILED');
      assert.equal(error.retryable, true);
      return /邮箱或 AT/.test(error.message);
    }
  );
  assert.equal(harness.eligibilityInputs.length, 0);
});

test('step 10 rejects a Session email mismatch without calling eligibility', async () => {
  const harness = createEligibilityHarness({
    readCurrentChatGptSessionForExport: async () => ({
      accessToken: 'fixture-access-token',
      session: { user: { email: 'different.account@example.test' } },
    }),
  });

  await assert.rejects(
    harness.executor.executeCheckTrialEligibility({
      email: EMAIL,
      totpMfaEnabled: true,
      totpMfaSecret: TOTP_SECRET,
    }),
    (error) => {
      assert.equal(error.code, 'UPI_ELIGIBILITY_CHECK_FAILED');
      assert.equal(error.retryable, false);
      return /Session 账号与本轮账号不一致/.test(error.message);
    }
  );
  assert.equal(harness.eligibilityInputs.length, 0);
});
