const assert = require('node:assert/strict');
const test = require('node:test');

const { createAssurivoFeedClient } = require('../background/verification/assurivo-feed-client.js');
require('../background/verification/manual-confirmation.js');
const { createVerificationResendController } = require('../background/verification/resend-controller.js');
require('../background/steps/set-gpt-password.js');
const { createSetGptPasswordExecutor } = globalThis.MultiPageBackgroundSetGptPassword;

const SIGN_IN_NOTIFICATION_HTML = `<!DOCTYPE html>
<html>
  <head><title>New sign-in to your OpenAI account</title></head>
  <body>We noticed a new sign-in to your OpenAI account.</body>
</html>`;

test('custom email fetch classifies an OpenAI sign-in notification without logging raw HTML', async () => {
  const client = createAssurivoFeedClient({
    constants: {
      ASSURIVO_VERIFICATION_FILTER_SKEW_MS: 90000,
      ASSURIVO_RESEND_SAME_CODE_GRACE_MS: 3000,
    },
    addLog: async () => {},
    collectCustomEmailVerificationCodes: () => [],
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => SIGN_IN_NOTIFICATION_HTML,
    }),
    getCompletionStep: (step) => step,
    getVerificationCodeLabel: () => '注册',
    isAssurivoVerificationPayload: () => false,
    resolveInitialVerificationRequestedAt: () => 0,
  });

  await assert.rejects(
    client.fetchCustomEmailVerificationCode(4, {
      email: 'user@example.com',
      customEmailPoolEntries: [{
        email: 'user@example.com',
        verificationUrl: 'https://mail.example.test/json/token/user@example.com',
      }],
    }),
    (error) => {
      assert.equal(error.code, 'CUSTOM_EMAIL_LATEST_NON_VERIFICATION');
      assert.match(error.message, /New sign-in to your OpenAI account/);
      assert.doesNotMatch(error.message, /<!DOCTYPE|<html|<head>/i);
      return true;
    }
  );
});

test('step 4 requests one fresh code after the latest custom email stays a sign-in notification', async () => {
  let fetchAttempts = 0;
  const sentMessages = [];
  const notificationError = () => Object.assign(
    new Error('步骤 4：最新邮件是登录通知“New sign-in to your OpenAI account”，不是验证码邮件。'),
    { code: 'CUSTOM_EMAIL_LATEST_NON_VERIFICATION' }
  );

  const controller = createVerificationResendController({
    constants: {
      DEFAULT_SIGNUP_VERIFICATION_CODE_WAIT_SECONDS: 0,
      MAX_SIGNUP_VERIFICATION_CODE_WAIT_SECONDS: 300,
      STEP4_ASSURIVO_RESEND_CONFIRM_TIMEOUT_MS: 1,
      STEP4_ASSURIVO_EMPTY_FEED_WAIT_MS: 1,
      POST_SUBMIT_CONFIRM_TIMEOUT_MS: 1000,
      POST_SUBMIT_CONFIRM_POLL_INTERVAL_MS: 100,
      STEP4_STUCK_VERIFICATION_RESUBMIT_LIMIT: 0,
    },
    addLog: async () => {},
    chrome: {
      tabs: {
        async update() {},
      },
    },
    fetchCustomEmailVerificationCode: async () => {
      fetchAttempts += 1;
      throw notificationError();
    },
    getNodeIdForStep: async () => 'fetch-signup-code',
    getState: async () => ({ signupVerificationCodeWaitSeconds: 0 }),
    getTabId: async () => 41,
    isAssurivoEmptyFeedVerificationFetchError: () => false,
    isCustomEmailNonVerificationNotificationError: (error) => (
      error?.code === 'CUSTOM_EMAIL_LATEST_NON_VERIFICATION'
    ),
    isRetryableCustomEmailVerificationFetchError: () => true,
    isStopError: () => false,
    normalizeDigits: (value) => String(value || '').replace(/\D/g, ''),
    sendToContentScript: async (_source, message) => {
      sentMessages.push(message.type);
      return {};
    },
    setState: async () => {},
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
  });

  await assert.rejects(
    controller.resolveCustomEmailVerificationStep(4, {
      email: 'user@example.com',
      signupVerificationCodeWaitSeconds: 0,
    }, {
      maxSubmitAttempts: 2,
    }),
    /最新邮件是登录通知/
  );

  assert.equal(fetchAttempts, 3);
  assert.deepEqual(sentMessages, ['RESEND_VERIFICATION_CODE']);
});

test('step 6 keeps polling after a sign-in notification instead of restarting registration', async () => {
  const logs = [];
  const state = {
    email: 'current@example.test',
    password: 'Example-password-1',
    customPassword: 'Example-password-1',
    passwordAccountIdentifier: 'current@example.test',
    setGptPasswordCodeMaxAttempts: 5,
    setGptPasswordVerificationWaitSeconds: 0,
  };
  let fetchAttempts = 0;
  let resetStarts = 0;
  let completed = 0;
  const executor = createSetGptPasswordExecutor({
    addLog: async (message) => logs.push(message),
    chrome: {
      tabs: {
        get: async () => ({ id: 7, url: 'https://auth.openai.com/email-verification' }),
        update: async () => ({}),
      },
    },
    completeNodeFromBackground: async () => { completed += 1; },
    ensureContentScriptReadyOnTab: async () => {},
    fetchVerificationCodeOnly: async () => {
      fetchAttempts += 1;
      if (fetchAttempts === 1) {
        throw Object.assign(
          new Error('步骤 6：最新邮件是 OpenAI 登录通知，不是验证码邮件。'),
          { code: 'CUSTOM_EMAIL_LATEST_NON_VERIFICATION' }
        );
      }
      return { handled: true, code: '123456', emailTimestamp: 123 };
    },
    getMailConfig: () => ({ provider: 'custom', label: '自定义邮箱取码 URL' }),
    getState: async () => ({ ...state }),
    getVerificationCodeStateKey: () => 'lastLoginCode',
    reuseOrCreateTab: async () => 7,
    sendToContentScriptResilient: async (_source, message) => {
      if (message.type === 'START_SET_GPT_PASSWORD_RESET') {
        resetStarts += 1;
        return { ready: true };
      }
      if (message.type === 'SUBMIT_SET_GPT_PASSWORD_CODE') {
        return { requiresNewPasswordNavigation: true };
      }
      if (message.type === 'SET_GPT_PASSWORD') {
        return { success: true, gptPasswordSet: true };
      }
      throw new Error(`unexpected message: ${message.type}`);
    },
    setState: async (patch) => Object.assign(state, patch),
    sleepWithStop: async () => {},
  });

  const result = await executor.executeSetGptPassword({
    ...state,
    nodeId: 'set-gpt-password',
    visibleStep: 6,
  });

  assert.equal(result.gptPasswordSet, true);
  assert.equal(fetchAttempts, 2);
  assert.equal(resetStarts, 1);
  assert.equal(completed, 1);
  assert.equal(logs.some((message) => message.includes('本次取码临时失败，将继续等待下一次尝试（2/5）')), true);
});
