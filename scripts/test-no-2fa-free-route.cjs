const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadModule() {
  const sandbox = { self: {}, URL, Buffer };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../background/steps/no-2fa-free-route.js'), 'utf8'),
    sandbox,
    { filename: 'background/steps/no-2fa-free-route.js' }
  );
  return sandbox.self.MultiPageBackgroundNo2faFreeRoute;
}

test('no-2FA route exposes explicit ineligibility as a non-retryable account error', async () => {
  const executor = loadModule().createNo2faFreeRouteExecutor({
    checkRegistrationUpiTrialEligibility: async () => ({
      eligible: false,
      reason: 'not-eligible',
      trialEligibilityStatus: 'ineligible',
    }),
    getState: async () => ({
      email: 'ineligible@example.com',
      verificationUrl: 'https://pickup.example/ineligible',
    }),
    readCurrentChatGptSessionForExport: async () => ({
      accessToken: 'fixture-access-token',
      session: { user: { email: 'ineligible@example.com' } },
    }),
    setState: async () => {},
  });

  await assert.rejects(
    () => executor.executeNo2faFreeRouteWithEligibility(),
    (error) => {
      assert.equal(error.code, 'UPI_ACCOUNT_INELIGIBLE');
      assert.equal(error.trialEligibilityStatus, 'ineligible');
      assert.equal(error.retryable, false);
      assert.match(error.message, /not-eligible/);
      return true;
    }
  );
});

test('active no-2FA save keeps existing TOTP credentials without checking eligibility', async () => {
  let eligibilityCalls = 0;
  let persistedInput = null;
  const statePatches = [];
  const markedStates = [];
  const executor = loadModule().createNo2faFreeRouteExecutor({
    checkRegistrationUpiTrialEligibility: async () => { eligibilityCalls += 1; },
    getState: async () => ({
      email: 'existing.account@example.test',
      existingTotpLogin: true,
      existingTotpLoginEmail: 'existing.account@example.test',
      verificationUrl: 'https://pickup.example/existing',
      no2faFreeRoute: true,
      no2faFreeRecordedAt: 1700000000,
      recordedAt: 1700000100,
    }),
    readCurrentChatGptSessionForExport: async () => ({
      accessToken: 'fixture-access-token',
      session: { user: { email: 'existing.account@example.test' } },
    }),
    resolveExistingTotpCredential: async () => ({
      email: 'existing.account@example.test',
      password: 'fixture-password',
      gptPassword: 'fixture-password',
      totpMfaSecret: 'JBSWY3DPEHPK3PXP',
    }),
    markCurrentRegistrationAccountUsed: async (state) => {
      markedStates.push(state);
    },
    setState: async (patch) => {
      statePatches.push(patch);
    },
    upsertRegistrationResult: async (input) => {
      persistedInput = input;
    },
  });

  await executor.executeNo2faFreeRoute();

  assert.equal(eligibilityCalls, 0);
  assert.ok(persistedInput);
  assert.equal(persistedInput.no2faFreeRoute, false);
  assert.equal(persistedInput.twoFactorEnabled, true);
  assert.equal(persistedInput.password, 'fixture-password');
  assert.equal(persistedInput.gptPassword, 'fixture-password');
  assert.equal(persistedInput.totpMfaSecret, 'JBSWY3DPEHPK3PXP');
  assert.equal(persistedInput.trialEligibilityStatus, 'unknown');
  assert.equal(persistedInput.trialEligibilityReasonCode, 'GCASH_ELIGIBILITY_DISABLED');
  assert.equal(Object.hasOwn(persistedInput, 'no2faFreeRecordedAt'), false);
  assert.equal(statePatches.length, 1);
  assert.equal(statePatches[0].recordedAt, 1700000100);
  assert.equal(Object.hasOwn(statePatches[0], 'no2faFreeRecordedAt'), false);
  assert.equal(markedStates.length, 1);
  markedStates.forEach((state) => {
    assert.equal(state.no2faFreeRoute, false);
    assert.equal(state.recordedAt, 1700000100);
    assert.equal(Object.hasOwn(state, 'no2faFreeRecordedAt'), false);
  });
});

test('ordinary no-2FA step 9 saves an unknown-eligibility account without calling the eligibility API', async () => {
  let eligibilityCalls = 0;
  let persistedInput = null;
  const statePatches = [];
  const executor = loadModule().createNo2faFreeRouteExecutor({
    checkRegistrationUpiTrialEligibility: async () => { eligibilityCalls += 1; },
    getState: async () => ({
      email: 'no2fa@example.test',
      verificationUrl: 'https://pickup.example/no2fa',
      no2faFreeRecordedAt: 1700000200,
    }),
    readCurrentChatGptSessionForExport: async () => ({
      accessToken: 'fixture-access-token',
      session: { user: { email: 'no2fa@example.test' } },
    }),
    setState: async (patch) => {
      statePatches.push(patch);
    },
    upsertRegistrationResult: async (input) => {
      persistedInput = input;
    },
  });

  await executor.executeNo2faFreeRoute();

  assert.equal(eligibilityCalls, 0);
  assert.equal(persistedInput.no2faFreeRoute, true);
  assert.equal(persistedInput.twoFactorEnabled, false);
  assert.equal(persistedInput.password, '');
  assert.equal(persistedInput.gptPassword, '');
  assert.equal(persistedInput.totpMfaSecret, '');
  assert.equal(persistedInput.trialEligibilityStatus, 'unknown');
  assert.equal(persistedInput.trialEligibilityReasonCode, 'GCASH_ELIGIBILITY_DISABLED');
  assert.deepEqual(persistedInput.session, { user: { email: 'no2fa@example.test' } });
  assert.equal(statePatches.length, 1);
  assert.equal(statePatches[0].recordedAt, 1700000200);
  assert.equal(statePatches[0].no2faFreeRecordedAt, 1700000200);
});

test('existing TOTP credential failure does not mutate state or mark the registration account used', async () => {
  let eligibilityCalls = 0;
  let stateWrites = 0;
  let markCalls = 0;
  const executor = loadModule().createNo2faFreeRouteExecutor({
    checkRegistrationUpiTrialEligibility: async () => {
      eligibilityCalls += 1;
      return { eligible: true };
    },
    getState: async () => ({
      email: 'missing.totp@example.test',
      existingTotpLogin: true,
      existingTotpLoginEmail: 'missing.totp@example.test',
      verificationUrl: 'https://pickup.example/missing-totp',
    }),
    markCurrentRegistrationAccountUsed: async () => {
      markCalls += 1;
    },
    readCurrentChatGptSessionForExport: async () => ({
      accessToken: 'fixture-access-token',
      session: { user: { email: 'missing.totp@example.test' } },
    }),
    resolveExistingTotpCredential: async () => null,
    setState: async () => {
      stateWrites += 1;
    },
    upsertRegistrationResult: async () => {},
  });

  await assert.rejects(
    executor.executeNo2faFreeRoute(),
    (error) => {
      assert.equal(error.code, 'SIGNUP_EXISTING_TOTP_LOGIN_FAILED');
      assert.equal(error.preserveSignupSession, true);
      return /TOTP 密钥不可用/.test(error.message);
    }
  );
  assert.equal(stateWrites, 0);
  assert.equal(markCalls, 0);
  assert.equal(eligibilityCalls, 0);
});

test('Free persistence rejects a Session email that differs from the workflow account', async () => {
  let eligibilityCalls = 0;
  const executor = loadModule().createNo2faFreeRouteExecutor({
    checkRegistrationUpiTrialEligibility: async () => {
      eligibilityCalls += 1;
      return { eligible: true };
    },
    getState: async () => ({
      email: 'expected.account@example.test',
      existingTotpLogin: true,
      existingTotpLoginEmail: 'expected.account@example.test',
      verificationUrl: 'https://pickup.example/expected',
    }),
    readCurrentChatGptSessionForExport: async () => ({
      accessToken: 'fixture-access-token',
      session: { user: { email: 'different.account@example.test' } },
    }),
    setState: async () => {},
    upsertRegistrationResult: async () => {},
  });

  await assert.rejects(
    executor.executeNo2faFreeRoute(),
    (error) => {
      assert.equal(error.code, 'SIGNUP_EXISTING_TOTP_LOGIN_FAILED');
      assert.equal(error.preserveSignupSession, true);
      return /Session 账号与本轮账号不一致/.test(error.message);
    }
  );
  assert.equal(eligibilityCalls, 0);
});

test('superseded no-2FA eligibility result cannot mutate the newer auto-run session', async () => {
  let currentSessionId = 41;
  let eligibilityCalls = 0;
  let stateWrites = 0;
  let completionCalls = 0;
  const executor = loadModule().createNo2faFreeRouteExecutor({
    checkRegistrationUpiTrialEligibility: async () => {
      eligibilityCalls += 1;
      return { eligible: true };
    },
    completeNodeFromBackground: async () => { completionCalls += 1; },
    getState: async () => ({ autoRunSessionId: currentSessionId }),
    readCurrentChatGptSessionForExport: async () => {
      currentSessionId = 42;
      return {
        accessToken: 'fixture-access-token',
        session: { user: { email: 'stale.account@example.test' } },
      };
    },
    setState: async () => { stateWrites += 1; },
    upsertRegistrationResult: async () => {},
  });

  await assert.rejects(
    () => executor.executeNo2faFreeRoute({
      autoRunSessionId: 41,
      email: 'stale.account@example.test',
      verificationUrl: 'https://pickup.example/stale',
    }),
    (error) => error?.code === 'AUTO_RUN_SESSION_SUPERSEDED'
  );

  assert.equal(eligibilityCalls, 0);
  assert.equal(stateWrites, 0);
  assert.equal(completionCalls, 0);
});
