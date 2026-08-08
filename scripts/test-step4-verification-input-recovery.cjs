const assert = require('node:assert/strict');
const test = require('node:test');

require('../background/verification/manual-confirmation.js');
require('../background/verification/resend-controller.js');

const { createVerificationResendController } = globalThis.MultiPageVerificationResendController;

test('step 4 reloads a stale email-verification page before filling a fetched code', async () => {
  const messages = [];
  const reloads = [];
  let prepareAttempts = 0;

  const controller = createVerificationResendController({
    constants: {
      POST_SUBMIT_CONFIRM_TIMEOUT_MS: 3000,
      POST_SUBMIT_CONFIRM_POLL_INTERVAL_MS: 100,
      STEP4_STUCK_VERIFICATION_RESUBMIT_LIMIT: 0,
    },
    addLog: async () => {},
    chrome: {
      tabs: {
        async update() {},
        async get() {
          return {
            id: 41,
            status: 'complete',
            url: 'https://auth.openai.com/email-verification',
          };
        },
        async reload(tabId, options) {
          reloads.push({ tabId, options });
        },
      },
    },
    getTabId: async () => 41,
    isRetryableVerificationTransportError: () => false,
    sendToContentScriptResilient: async (_source, message) => {
      messages.push(message.type);
      if (message.type === 'PREPARE_SIGNUP_VERIFICATION') {
        prepareAttempts += 1;
        if (prepareAttempts <= 2) {
          return {
            error: '未找到验证码输入框。URL: https://auth.openai.com/email-verification',
          };
        }
        return { ready: true };
      }
      if (message.type === 'FILL_CODE') {
        return { success: true };
      }
      throw new Error(`unexpected message: ${message.type}`);
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const result = await controller.submitVerificationCode(4, '123456');

  assert.equal(result.success, true);
  assert.equal(prepareAttempts, 3);
  assert.deepEqual(reloads, [{ tabId: 41, options: { bypassCache: true } }]);
  assert.deepEqual(messages, [
    'PREPARE_SIGNUP_VERIFICATION',
    'PREPARE_SIGNUP_VERIFICATION',
    'PREPARE_SIGNUP_VERIFICATION',
    'FILL_CODE',
  ]);
});

test('step 4 does not reload a valid verification page for one transient missing-input result', async () => {
  const reloads = [];
  let prepareAttempts = 0;

  const controller = createVerificationResendController({
    constants: {
      POST_SUBMIT_CONFIRM_TIMEOUT_MS: 3000,
      POST_SUBMIT_CONFIRM_POLL_INTERVAL_MS: 100,
      STEP4_STUCK_VERIFICATION_RESUBMIT_LIMIT: 0,
    },
    addLog: async () => {},
    chrome: {
      tabs: {
        async update() {},
        async get() {
          return { id: 41, status: 'complete', url: 'https://auth.openai.com/email-verification' };
        },
        async reload(tabId, options) {
          reloads.push({ tabId, options });
        },
      },
    },
    getTabId: async () => 41,
    isRetryableVerificationTransportError: () => false,
    sendToContentScriptResilient: async (_source, message) => {
      if (message.type === 'PREPARE_SIGNUP_VERIFICATION') {
        prepareAttempts += 1;
        if (prepareAttempts === 1) {
          return { error: '未找到验证码输入框。URL: https://auth.openai.com/email-verification' };
        }
        return { ready: true };
      }
      if (message.type === 'FILL_CODE') return { success: true };
      throw new Error(`unexpected message: ${message.type}`);
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const result = await controller.submitVerificationCode(4, '123456');

  assert.equal(result.success, true);
  assert.equal(prepareAttempts, 2);
  assert.deepEqual(reloads, []);
});

test('step 4 requests a fresh code after the page reports a Japanese invalid-code error', async () => {
  const messages = [];
  const state = {
    email: 'signup-user@example.test',
    signupVerificationCodeWaitSeconds: 0,
  };
  let fetchAttempt = 0;
  let fillAttempt = 0;
  let completed = 0;

  const controller = createVerificationResendController({
    constants: {
      DEFAULT_SIGNUP_VERIFICATION_CODE_WAIT_SECONDS: 0,
      MAX_SIGNUP_VERIFICATION_CODE_WAIT_SECONDS: 300,
      STEP4_ASSURIVO_RESEND_CONFIRM_TIMEOUT_MS: 1,
      STEP4_ASSURIVO_EMPTY_FEED_WAIT_MS: 1,
      POST_SUBMIT_CONFIRM_TIMEOUT_MS: 1000,
      POST_SUBMIT_CONFIRM_POLL_INTERVAL_MS: 100,
      STEP4_STUCK_VERIFICATION_RESUBMIT_LIMIT: 2,
    },
    addLog: async () => {},
    chrome: { tabs: { update: async () => {} } },
    completeNodeFromBackground: async () => { completed += 1; },
    fetchCustomEmailVerificationCode: async () => {
      fetchAttempt += 1;
      return {
        handled: true,
        code: fetchAttempt === 1 ? '123456' : '654321',
        emailTimestamp: fetchAttempt,
        verificationUrl: 'https://mail.example.test/latest',
      };
    },
    getNodeIdForStep: async () => 'fetch-signup-code',
    getState: async () => ({ ...state }),
    getTabId: async () => 41,
    isAssurivoEmptyFeedVerificationFetchError: () => false,
    isCustomEmailNonVerificationNotificationError: () => false,
    isRetryableCustomEmailVerificationFetchError: () => false,
    isRetryableVerificationTransportError: () => false,
    isStopError: () => false,
    normalizeDigits: (value) => String(value || '').replace(/\D/g, ''),
    sendToContentScript: async (_source, message) => {
      messages.push(message.type);
      return {};
    },
    sendToContentScriptResilient: async (_source, message) => {
      messages.push(message.type);
      if (message.type === 'PREPARE_SIGNUP_VERIFICATION') return { ready: true };
      if (message.type === 'FILL_CODE') {
        fillAttempt += 1;
        return fillAttempt === 1
          ? { invalidCode: true, errorText: '不正確なコード' }
          : { success: true, url: 'https://auth.openai.com/about-you' };
      }
      throw new Error(`unexpected message: ${message.type}`);
    },
    setState: async (patch) => Object.assign(state, patch),
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  const result = await controller.resolveCustomEmailVerificationStep(4, state, {
    maxSubmitAttempts: 2,
  });

  assert.equal(result.handled, true);
  assert.equal(fetchAttempt, 2);
  assert.equal(fillAttempt, 2);
  assert.equal(completed, 1);
  assert.deepEqual(messages, [
    'PREPARE_SIGNUP_VERIFICATION',
    'FILL_CODE',
    'RESEND_VERIFICATION_CODE',
    'PREPARE_SIGNUP_VERIFICATION',
    'FILL_CODE',
  ]);
});

function createManualVerificationController(pageState, options = {}) {
  const nodeStatuses = [];
  const stateUpdates = [];
  const logs = [];
  const controller = createVerificationResendController({
    constants: {
      POST_SUBMIT_CONFIRM_TIMEOUT_MS: 1000,
      POST_SUBMIT_CONFIRM_POLL_INTERVAL_MS: 100,
    },
    addLog: async (message, level) => logs.push({ message, level }),
    chrome: {
      tabs: {
        async get() {
          return { id: 41, status: 'complete', url: 'https://auth.openai.com/email-verification' };
        },
      },
    },
    confirmCustomVerificationStepBypassRequest: async () => ({ confirmed: true }),
    getNodeIdForStep: async () => 'fetch-signup-code',
    getTabId: async () => 41,
    sendToContentScriptResilient: async (_source, message) => {
      assert.equal(message.type, 'GET_SIGNUP_VERIFICATION_POST_SUBMIT_STATE');
      return pageState;
    },
    setNodeStatus: async (nodeId, status) => nodeStatuses.push({ nodeId, status }),
    setState: async (updates) => stateUpdates.push(updates),
    sleepWithStop: options.sleepWithStop || (async () => {}),
    throwIfStopped: () => {},
  });
  return { controller, logs, nodeStatuses, stateUpdates };
}

test('manual step 4 confirmation advances only after the signup profile is observed', async () => {
  const harness = createManualVerificationController({
    url: 'https://auth.openai.com/u/signup/profile',
    successState: 'step5',
  });

  const result = await harness.controller.confirmCustomVerificationStepBypass(4);

  assert.equal(result.success, true);
  assert.equal(result.reason, 'signup_profile');
  assert.deepEqual(harness.nodeStatuses, [{ nodeId: 'fetch-signup-code', status: 'skipped' }]);
  assert.deepEqual(harness.stateUpdates, [{
    lastEmailTimestamp: null,
    signupVerificationRequestedAt: null,
    loginVerificationRequestedAt: null,
  }]);
  assert.ok(harness.logs.some((entry) => /已确认手动验证码通过/.test(entry.message)));
});

test('manual step 4 confirmation preserves the signup session when OpenAI rejects the code', async () => {
  const harness = createManualVerificationController({
    url: 'https://auth.openai.com/email-verification',
    invalidCode: true,
    errorText: '验证码不正确',
  });

  await assert.rejects(
    harness.controller.confirmCustomVerificationStepBypass(4),
    (error) => {
      assert.equal(error.code, 'SIGNUP_MANUAL_VERIFICATION_REJECTED');
      assert.equal(error.retryable, false);
      assert.equal(error.preserveSignupSession, true);
      assert.match(error.message, /OpenAI 未接受手动输入的验证码/);
      return true;
    }
  );
  assert.deepEqual(harness.nodeStatuses, []);
  assert.deepEqual(harness.stateUpdates, []);
});

test('manual step 4 confirmation does not skip while the verification page remains unresolved', async () => {
  let clock = 1000;
  const originalNow = Date.now;
  Date.now = () => clock;
  const harness = createManualVerificationController({
    url: 'https://auth.openai.com/email-verification',
    verificationVisible: true,
    successState: '',
  }, {
    sleepWithStop: async () => {
      clock += 1000;
    },
  });

  try {
    await assert.rejects(
      harness.controller.confirmCustomVerificationStepBypass(4),
      (error) => {
        assert.equal(error.code, 'SIGNUP_MANUAL_VERIFICATION_UNCONFIRMED');
        assert.equal(error.retryable, false);
        assert.equal(error.preserveSignupSession, true);
        assert.match(error.message, /仍未确认进入注册资料页/);
        return true;
      }
    );
  } finally {
    Date.now = originalNow;
  }

  assert.deepEqual(harness.nodeStatuses, []);
  assert.deepEqual(harness.stateUpdates, []);
});
