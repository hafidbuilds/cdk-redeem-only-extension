const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.self = globalThis;
delete globalThis.MultiPageSignupFlowHelpers;
delete globalThis.MultiPageBackgroundStep4;
delete require.cache[require.resolve('../background/signup-flow-helpers.js')];
delete require.cache[require.resolve('../background/steps/fetch-signup-code.js')];
require('../background/signup-flow-helpers.js');
require('../background/steps/fetch-signup-code.js');

const { createSignupFlowHelpers } = globalThis.MultiPageSignupFlowHelpers;
const { createStep4Executor } = globalThis.MultiPageBackgroundStep4;

const TOTP_STATE = Object.freeze({
  state: 'verification_page',
  verificationKind: 'totp',
  hasVerificationTarget: true,
  verificationVisible: true,
});

function createHelper(overrides = {}) {
  const messages = [];
  const logs = [];
  const displayStatuses = [];
  const helper = createSignupFlowHelpers({
    addLog: async (...args) => logs.push(args),
    chrome: {
      tabs: {
        get: async () => ({ id: 41, url: 'https://chatgpt.com/' }),
      },
    },
    ensureContentScriptReadyOnTab: async () => {},
    generateTotpCode: async () => '123456',
    getState: async () => ({ email: 'existing.account@example.test' }),
    isLikelyLoggedInChatgptHomeUrl: (url) => url === 'https://chatgpt.com/',
    isRetryableContentScriptTransportError: () => false,
    resolveExistingTotpCredential: async () => ({
      email: 'existing.account@example.test',
      totpMfaSecret: 'JBSWY3DPEHPK3PXP',
    }),
    sendToContentScriptResilient: async (_source, message) => {
      messages.push(message);
      if (message.type === 'PREPARE_SIGNUP_VERIFICATION') {
        return {
          error: 'SIGNUP_USER_ALREADY_EXISTS::步骤 4：注册流程进入登录 TOTP 二次验证页。',
        };
      }
      if (message.type === 'FILL_CODE') return { success: true };
      if (message.type === 'GET_LOGIN_AUTH_STATE') return TOTP_STATE;
      throw new Error(`unexpected message: ${message.type}`);
    },
    setExistingTotpLoginDisplayStatus: async (status) => displayStatuses.push(status),
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
    ...overrides,
  });
  return { displayStatuses, helper, logs, messages };
}

test('step 3 finalizer logs into an existing TOTP account and skips registration verification', async () => {
  const { displayStatuses, helper, messages } = createHelper();

  const result = await helper.finalizeSignupPasswordSubmitInTab(41, 'fixture-password', 3);

  assert.equal(result.handled, true);
  assert.equal(result.existingTotpLogin, true);
  assert.equal(result.alreadyVerified, true);
  assert.equal(result.skipProfileStep, true);
  assert.equal(result.skipSetPasswordStep, true);
  assert.equal(result.skipSetPasswordStepReason, 'existing_totp_login');
  const fillCode = messages.find((message) => message.type === 'FILL_CODE');
  assert.ok(fillCode);
  assert.equal(fillCode.step, 8);
  assert.equal(fillCode.payload.code, '123456');
  assert.equal(fillCode.payload.verificationKind, 'totp');
  assert.equal(fillCode.payload.signupExistingTotpLogin, true);
  assert.equal(fillCode.payload.suppressVerificationCodeLog, true);
  assert.equal(fillCode.payload.backgroundOwnsWorkflowOutcome, true);
  const prepare = messages.find((message) => message.type === 'PREPARE_SIGNUP_VERIFICATION');
  const stateProbe = messages.find((message) => message.type === 'GET_LOGIN_AUTH_STATE');
  assert.equal(prepare.payload.backgroundOwnsWorkflowOutcome, true);
  assert.equal(stateProbe.payload.backgroundOwnsWorkflowOutcome, true);
  assert.deepEqual(displayStatuses, ['pending', 'running', 'completed']);
});

test('existing TOTP login without a saved secret keeps the original registered-account failure', async () => {
  const { displayStatuses, helper, messages, logs } = createHelper({
    resolveExistingTotpCredential: async () => null,
  });

  await assert.rejects(
    helper.finalizeSignupPasswordSubmitInTab(41, 'fixture-password', 3),
    /SIGNUP_USER_ALREADY_EXISTS::.*登录 TOTP 二次验证页/
  );
  assert.equal(messages.some((message) => message.type === 'FILL_CODE'), false);
  assert.equal(logs.some(([message]) => /没有当前邮箱的 TOTP 密钥/.test(message)), true);
  assert.deepEqual(displayStatuses, ['pending', 'running', 'failed']);
});

test('existing TOTP login retries one fresh code then preserves the session on rejection', async () => {
  let fillCount = 0;
  const { displayStatuses, helper } = createHelper({
    sendToContentScriptResilient: async (_source, message) => {
      if (message.type === 'FILL_CODE') {
        fillCount += 1;
        return { invalidCode: true, errorText: 'Incorrect code' };
      }
      if (message.type === 'GET_LOGIN_AUTH_STATE') return TOTP_STATE;
      throw new Error(`unexpected message: ${message.type}`);
    },
  });

  await assert.rejects(
    helper.recoverRegisteredTotpLogin({
      tabId: 41,
      state: { email: 'existing.account@example.test' },
      authState: TOTP_STATE,
    }),
    (error) => {
      assert.equal(error.code, 'SIGNUP_EXISTING_TOTP_LOGIN_FAILED');
      assert.equal(error.preserveSignupSession, true);
      return /连续两次 2FA 动态码/.test(error.message);
    }
  );
  assert.equal(fillCount, 2);
  assert.deepEqual(displayStatuses, ['running', 'failed']);
});

test('TOTP submit transport interruption is reconciled from the current logged-in tab', async () => {
  const { displayStatuses, helper } = createHelper({
    isRetryableContentScriptTransportError: () => true,
    sendToContentScriptResilient: async (_source, message) => {
      if (message.type === 'FILL_CODE') {
        throw new Error('The frame was removed.');
      }
      if (message.type === 'GET_LOGIN_AUTH_STATE') return TOTP_STATE;
      throw new Error(`unexpected message: ${message.type}`);
    },
  });

  const result = await helper.recoverRegisteredTotpLogin({
    tabId: 41,
    state: { email: 'existing.account@example.test' },
    authState: TOTP_STATE,
  });

  assert.equal(result.handled, true);
  assert.equal(result.existingTotpLogin, true);
  assert.deepEqual(displayStatuses, ['running', 'completed']);
});

test('ordinary step 3 finalization leaves the conditional 2FA display pending', async () => {
  const { displayStatuses, helper } = createHelper({
    sendToContentScriptResilient: async (_source, message) => {
      if (message.type === 'PREPARE_SIGNUP_VERIFICATION') {
        return { ready: true, state: 'verification_page', verificationKind: 'email' };
      }
      throw new Error(`unexpected message: ${message.type}`);
    },
  });

  const result = await helper.finalizeSignupPasswordSubmitInTab(41, 'fixture-password', 3);

  assert.equal(result.ready, true);
  assert.deepEqual(displayStatuses, ['pending']);
});

test('display-state synchronization failure never interrupts a successful TOTP login', async () => {
  const { helper } = createHelper({
    setExistingTotpLoginDisplayStatus: async () => {
      throw new Error('display channel unavailable');
    },
  });

  const result = await helper.finalizeSignupPasswordSubmitInTab(41, 'fixture-password', 3);

  assert.equal(result.handled, true);
  assert.equal(result.existingTotpLogin, true);
});

test('step 4 reuses the same TOTP login recovery before fetching signup mail', async () => {
  const completed = [];
  let recoveredInput = null;
  const executor = createStep4Executor({
    addLog: async () => {},
    chrome: { tabs: { update: async () => {} } },
    completeNodeFromBackground: async (...args) => completed.push(args),
    getTabId: async () => 41,
    recoverRegisteredTotpLogin: async (input) => {
      recoveredInput = input;
      return {
        handled: true,
        skipProfileStep: true,
        skipSetPasswordStep: true,
        skipSetPasswordStepReason: 'existing_totp_login',
      };
    },
    sendToContentScript: async (_source, message) => {
      if (message.type === 'GET_LOGIN_AUTH_STATE') return TOTP_STATE;
      throw new Error(`unexpected message: ${message.type}`);
    },
    setState: async () => {},
    throwIfStopped: () => {},
  });

  await executor.executeStep4({
    email: 'existing.account@example.test',
    password: 'fixture-password',
    passwordAccountIdentifierType: 'email',
    passwordAccountIdentifier: 'existing.account@example.test',
  });

  assert.equal(recoveredInput.tabId, 41);
  assert.equal(recoveredInput.authState.verificationKind, 'totp');
  assert.deepEqual(completed, [[
    'fetch-signup-code',
    {
      skipProfileStep: true,
      skipProfileStepReason: 'existing_totp_login',
      skipSetPasswordStep: true,
      skipSetPasswordStepReason: 'existing_totp_login',
      existingTotpLogin: true,
    },
  ]]);
});
