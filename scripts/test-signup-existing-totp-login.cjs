const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.self = globalThis;
delete globalThis.MultiPageSignupFlowHelpers;
delete globalThis.MultiPageBackgroundExistingTotpLogin;
delete globalThis.MultiPageBackgroundStep4;
delete require.cache[require.resolve('../background/signup-flow-helpers.js')];
delete require.cache[require.resolve('../background/steps/existing-totp-login.js')];
delete require.cache[require.resolve('../background/steps/fetch-signup-code.js')];
require('../background/signup-flow-helpers.js');
require('../background/steps/existing-totp-login.js');
require('../background/steps/fetch-signup-code.js');

const { createSignupFlowHelpers } = globalThis.MultiPageSignupFlowHelpers;
const { createExistingTotpLoginExecutor } = globalThis.MultiPageBackgroundExistingTotpLogin;
const { createStep4Executor } = globalThis.MultiPageBackgroundStep4;

const EMAIL = 'existing.account@example.test';
const TOTP_STATE = Object.freeze({
  state: 'verification_page',
  verificationKind: 'totp',
  hasVerificationTarget: true,
  verificationVisible: true,
  displayedEmail: EMAIL,
});

function createHelper(overrides = {}) {
  const messages = [];
  const logs = [];
  const helper = createSignupFlowHelpers({
    addLog: async (...args) => logs.push(args),
    chrome: {
      tabs: {
        get: async () => ({ id: 41, url: 'https://chatgpt.com/' }),
      },
    },
    ensureContentScriptReadyOnTab: async () => {},
    generateTotpCode: async () => '123456',
    getState: async () => ({ email: EMAIL }),
    isLikelyLoggedInChatgptHomeUrl: (url) => url === 'https://chatgpt.com/',
    isRetryableContentScriptTransportError: () => false,
    readChatGptSessionForTotpRecovery: async () => ({
      accessToken: 'fixture-access-token',
      session: { user: { email: EMAIL } },
    }),
    resolveExistingTotpCredential: async () => ({
      email: EMAIL,
      totpMfaSecret: 'JBSWY3DPEHPK3PXP',
    }),
    sendToContentScriptResilient: async (_source, message) => {
      messages.push(message);
      if (message.type === 'PREPARE_SIGNUP_VERIFICATION') {
        return {
          error: 'SIGNUP_USER_ALREADY_EXISTS::步骤 3：注册流程进入登录 TOTP 二次验证页。',
        };
      }
      if (message.type === 'FILL_CODE') return { success: true };
      if (message.type === 'GET_LOGIN_AUTH_STATE') return TOTP_STATE;
      throw new Error(`unexpected message: ${message.type}`);
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
    ...overrides,
  });
  return { helper, logs, messages };
}

function createFormalStep4(overrides = {}) {
  const completed = [];
  const nodeStatuses = [];
  const statePatches = [];
  const marks = [];
  const executor = createExistingTotpLoginExecutor({
    addLog: async () => {},
    completeNodeFromBackground: async (...args) => completed.push(args),
    getState: async () => ({ email: EMAIL }),
    getTabId: async () => 41,
    markCurrentRegistrationAccountDeactivated: async (...args) => {
      marks.push(args);
      return {};
    },
    recoverRegisteredTotpLogin: async () => ({
      handled: true,
      existingTotpLogin: true,
      existingTotpLoginEmail: EMAIL,
    }),
    sendToContentScriptResilient: async () => TOTP_STATE,
    setNodeStatus: async (...args) => nodeStatuses.push(args),
    setState: async (patch) => statePatches.push(patch),
    ...overrides,
  });
  return { completed, executor, marks, nodeStatuses, statePatches };
}

test('step 3 only classifies an existing-account TOTP challenge', async () => {
  const { helper, messages } = createHelper();

  const result = await helper.finalizeSignupPasswordSubmitInTab(41, 'fixture-password', 3);

  assert.deepEqual(result, {
    ready: true,
    state: 'registered_login_totp_page',
    existingTotpLoginRequired: true,
  });
  assert.equal(messages.some((message) => message.type === 'FILL_CODE'), false);
});

test('step 3 returns the ordinary email-verification state without TOTP side effects', async () => {
  const { helper, messages } = createHelper({
    sendToContentScriptResilient: async (_source, message) => {
      messages.push(message);
      if (message.type === 'PREPARE_SIGNUP_VERIFICATION') {
        return { ready: true, state: 'verification_page', verificationKind: 'email' };
      }
      throw new Error(`unexpected message: ${message.type}`);
    },
  });

  const result = await helper.finalizeSignupPasswordSubmitInTab(41, 'fixture-password', 3);

  assert.equal(result.ready, true);
  assert.equal(result.verificationKind, 'email');
  assert.equal(messages.some((message) => message.type === 'FILL_CODE'), false);
});

test('formal step 4 skips a new account that is waiting for email verification', async () => {
  const { executor, nodeStatuses, statePatches } = createFormalStep4({
    sendToContentScriptResilient: async () => ({
      state: 'verification_page',
      verificationKind: 'email',
    }),
  });

  const result = await executor.executeExistingTotpLogin({ nodeId: 'existing-totp-login' });

  assert.deepEqual(result, { skipped: true, reason: 'not_totp_login' });
  assert.deepEqual(nodeStatuses, [['existing-totp-login', 'skipped']]);
  assert.deepEqual(statePatches, [{ existingTotpLogin: false, existingTotpLoginEmail: '' }]);
});

test('formal step 4 completes an existing-account TOTP login and checkpoints later registration skips', async () => {
  let recoveredInput = null;
  const { completed, executor, statePatches } = createFormalStep4({
    recoverRegisteredTotpLogin: async (input) => {
      recoveredInput = input;
      return {
        handled: true,
        existingTotpLogin: true,
        existingTotpLoginEmail: EMAIL,
      };
    },
  });

  const result = await executor.executeExistingTotpLogin({ nodeId: 'existing-totp-login' });

  assert.equal(recoveredInput.tabId, 41);
  assert.equal(recoveredInput.step, 4);
  assert.equal(recoveredInput.authState.verificationKind, 'totp');
  assert.equal(result.skipRegistrationAfterExistingTotp, true);
  const expectedPatch = {
    existingTotpLogin: true,
    existingTotpLoginEmail: EMAIL,
    twoFactorEnabled: true,
    skipRegistrationAfterExistingTotp: true,
  };
  assert.deepEqual(statePatches, [expectedPatch]);
  assert.deepEqual(completed, [['existing-totp-login', expectedPatch]]);
});

test('formal step 4 preserves the existing error when the local TOTP secret is missing', async () => {
  const { executor } = createFormalStep4({
    recoverRegisteredTotpLogin: async () => ({ handled: false, reason: 'missing_totp_secret' }),
  });

  await assert.rejects(
    executor.executeExistingTotpLogin({ nodeId: 'existing-totp-login' }),
    (error) => {
      assert.equal(error.code, 'SIGNUP_EXISTING_TOTP_LOGIN_FAILED');
      assert.equal(error.retryable, false);
      assert.equal(error.preserveSignupSession, true);
      return /缺少本地 TOTP 密钥/.test(error.message);
    }
  );
});

test('shared TOTP recovery refuses an account mismatch before generating a code', async () => {
  let credentialLookups = 0;
  const { helper, messages } = createHelper({
    resolveExistingTotpCredential: async () => {
      credentialLookups += 1;
      return { totpMfaSecret: 'JBSWY3DPEHPK3PXP' };
    },
  });

  await assert.rejects(
    helper.recoverRegisteredTotpLogin({
      tabId: 41,
      state: { email: EMAIL },
      authState: { ...TOTP_STATE, displayedEmail: 'different.account@example.test' },
    }),
    (error) => {
      assert.equal(error.code, 'SIGNUP_EXISTING_TOTP_LOGIN_FAILED');
      assert.equal(error.preserveSignupSession, true);
      return /2FA 页面账号与本轮账号不一致/.test(error.message);
    }
  );

  assert.equal(credentialLookups, 0);
  assert.equal(messages.some((message) => message.type === 'FILL_CODE'), false);
});

test('shared TOTP recovery retries once and keeps the existing rejection error', async () => {
  let fillCount = 0;
  const { helper } = createHelper({
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
      state: { email: EMAIL },
      authState: TOTP_STATE,
    }),
    (error) => {
      assert.equal(error.code, 'SIGNUP_EXISTING_TOTP_LOGIN_FAILED');
      assert.equal(error.preserveSignupSession, true);
      return /连续两次 2FA 动态码/.test(error.message);
    }
  );
  assert.equal(fillCount, 2);
});

test('formal step 4 marks and throws ACCOUNT_DEACTIVATED when recovery reaches a deactivated page', async () => {
  const deactivated = new Error('ACCOUNT_DEACTIVATED::账号已删除或停用');
  deactivated.code = 'ACCOUNT_DEACTIVATED';
  deactivated.accountDeactivated = true;
  const { executor, marks } = createFormalStep4({
    markCurrentRegistrationAccountDeactivated: async (...args) => {
      marks.push(args);
      return { nextEmail: 'next.account@example.test', poolUpdated: true };
    },
    recoverRegisteredTotpLogin: async () => {
      throw deactivated;
    },
  });

  await assert.rejects(
    executor.executeExistingTotpLogin({ nodeId: 'existing-totp-login' }),
    (error) => {
      assert.equal(error.code, 'ACCOUNT_DEACTIVATED');
      assert.equal(error.retryable, false);
      assert.equal(error.nodeId, 'existing-totp-login');
      assert.equal(error.nextAccountEmail, 'next.account@example.test');
      return true;
    }
  );
  assert.equal(marks.length, 1);
});

test('step 5 defensively delegates a TOTP page to formal step 4', async () => {
  const delegated = [];
  const nodeStatuses = [];
  const statePatches = [];
  let prepareCalls = 0;
  const executor = createStep4Executor({
    addLog: async () => {},
    chrome: { tabs: { update: async () => {} } },
    executeExistingTotpLogin: async (state) => {
      delegated.push(state);
      return { handled: true, existingTotpLogin: true };
    },
    getTabId: async () => 41,
    sendToContentScriptResilient: async (_source, message) => {
      if (message.type === 'GET_LOGIN_AUTH_STATE') return TOTP_STATE;
      if (message.type === 'PREPARE_SIGNUP_VERIFICATION') prepareCalls += 1;
      throw new Error(`unexpected message: ${message.type}`);
    },
    setNodeStatus: async (...args) => nodeStatuses.push(args),
    setState: async (patch) => statePatches.push(patch),
    setPasswordState: async () => {},
    throwIfStopped: () => {},
  });

  await executor.executeStep4({ email: EMAIL, password: 'fixture-password' });

  assert.equal(delegated.length, 1);
  assert.equal(delegated[0].nodeId, 'existing-totp-login');
  assert.equal(delegated[0].visibleStep, 4);
  assert.deepEqual(nodeStatuses, [['fetch-signup-code', 'skipped']]);
  assert.deepEqual(statePatches, [{ step4VerificationRenderResumeCount: 0 }]);
  assert.equal(prepareCalls, 0);
});
