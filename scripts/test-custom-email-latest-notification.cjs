const assert = require('node:assert/strict');
const test = require('node:test');

const { createVerificationCodeExtractor } = require('../background/verification/code-extractor.js');
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

test('generic mail HTML uses the prompt-bound code and never falls through to hidden six-digit values', () => {
  const extractor = createVerificationCodeExtractor();
  const client = createAssurivoFeedClient({
    collectCustomEmailVerificationCodes: extractor.collectCustomEmailVerificationCodes,
    getStrictVerificationBodyCodeDetails: extractor.getStrictVerificationBodyCodeDetails,
    isAssurivoVerificationPayload: () => false,
  });
  const html = `<!DOCTYPE html>
    <html data-message-id="654321"><body>
      <p>Enter this temporary verification code to continue:</p>
      <strong>123456</strong>
      <a href="https://tracking.example.test/event/987654">Help center</a>
    </body></html>`;

  assert.deepEqual(client.extractCustomEmailVerificationCodeDetails(html), {
    code: '123456',
    source: 'generic-strict',
  });
  assert.deepEqual(client.extractCustomEmailVerificationCodeDetails(html, {
    excludeCodes: ['123456'],
  }), {
    code: '',
    source: 'generic-strict',
  });
});

test('step 6 login-code email is accepted when the body contains a temporary code', () => {
  const extractor = createVerificationCodeExtractor();
  const client = createAssurivoFeedClient({
    collectCustomEmailVerificationCodes: extractor.collectCustomEmailVerificationCodes,
    getStrictVerificationBodyCodeDetails: extractor.getStrictVerificationBodyCodeDetails,
    isAssurivoVerificationPayload: () => false,
  });
  const html = `<!DOCTYPE html><html><head><title>Your temporary ChatGPT verification code</title></head><body>
    <p>Log in to ChatGPT with the button below.</p><p>You can also enter this temporary code:</p><strong>246810</strong>
  </body></html>`;

  assert.deepEqual(client.extractCustomEmailVerificationCodeDetails(html), {
    code: '246810',
    source: 'generic-strict',
  });
});

test('custom direct mail fetch adds a cache-busting query value', async () => {
  const extractor = createVerificationCodeExtractor();
  const requests = [];
  const client = createAssurivoFeedClient({
    addLog: async () => {},
    collectCustomEmailVerificationCodes: extractor.collectCustomEmailVerificationCodes,
    fetchImpl: async (url) => {
      requests.push(url);
      return { ok: true, status: 200, text: async () => '<title>Your temporary ChatGPT verification code</title>Enter this temporary code: 246810' };
    },
    getCompletionStep: (step) => step,
    getStrictVerificationBodyCodeDetails: extractor.getStrictVerificationBodyCodeDetails,
    getVerificationCodeLabel: () => '设置 GPT 密码',
    isAssurivoVerificationPayload: () => false,
    resolveInitialVerificationRequestedAt: () => 0,
  });

  const result = await client.fetchCustomEmailVerificationCode(6, {
    email: 'user@example.test',
    customEmailPoolEntries: [{ email: 'user@example.test', verificationUrl: 'https://mail.example.test/latest?token=redacted' }],
  });

  assert.equal(result.code, '246810');
  assert.equal(new URL(requests[0]).searchParams.has('_mp_cache_bust'), true);
});

test('custom email fetch classifies an OpenAI sign-in notification without logging raw HTML', async () => {
  const client = createAssurivoFeedClient({
    constants: {
      ASSURIVO_VERIFICATION_FILTER_SKEW_MS: 90000,
      ASSURIVO_RESEND_SAME_CODE_GRACE_MS: 3000,
    },
    addLog: async () => {},
    collectCustomEmailVerificationCodes: () => [],
    getStrictVerificationBodyCodeDetails: () => ({ codes: [], promptMatched: false }),
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

test('step 7 keeps polling after a sign-in notification without setting the password', async () => {
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
      throw new Error(`unexpected message: ${message.type}`);
    },
    setState: async (patch) => Object.assign(state, patch),
    sleepWithStop: async () => {},
  });

  const result = await executor.executeFetchGptPasswordCode({
    ...state,
    nodeId: 'fetch-gpt-password-code',
    visibleStep: 7,
  });

  assert.equal(result.gptPasswordResetStage, 'new_password_ready');
  assert.equal(result.gptPasswordSet, false);
  assert.equal(fetchAttempts, 2);
  assert.equal(resetStarts, 1);
  assert.equal(completed, 1);
  assert.equal(logs.some((message) => message.includes('本次取码临时失败，将继续等待下一次尝试（2/5）')), true);
});

test('step 7 code-fetch exhaustion preserves the current page instead of restarting the round', async () => {
  const state = {
    email: 'current@example.test',
    password: 'Example-password-1',
    customPassword: 'Example-password-1',
    passwordAccountIdentifier: 'current@example.test',
    setGptPasswordCodeMaxAttempts: 2,
    setGptPasswordVerificationWaitSeconds: 0,
  };
  let fetchAttempts = 0;
  let resetStarts = 0;
  const executor = createSetGptPasswordExecutor({
    addLog: async () => {},
    chrome: { tabs: { get: async () => ({ id: 7, url: 'https://auth.openai.com/email-verification' }), update: async () => ({}) } },
    completeNodeFromBackground: async () => {},
    ensureContentScriptReadyOnTab: async () => {},
    fetchVerificationCodeOnly: async () => {
      fetchAttempts += 1;
      throw Object.assign(new Error('<html><title>Your temporary ChatGPT verification code</title></html>'), { code: 'CUSTOM_EMAIL_LATEST_NON_VERIFICATION' });
    },
    getMailConfig: () => ({ provider: 'custom', label: '自定义邮箱取码 URL' }),
    getState: async () => ({ ...state }),
    getVerificationCodeStateKey: () => 'lastLoginCode',
    reuseOrCreateTab: async () => 7,
    sendToContentScriptResilient: async (_source, message) => {
      if (message.type === 'START_SET_GPT_PASSWORD_RESET') { resetStarts += 1; return { ready: true }; }
      throw new Error(`unexpected message: ${message.type}`);
    },
    setState: async (patch) => Object.assign(state, patch),
    sleepWithStop: async () => {},
  });

  await assert.rejects(
    executor.executeFetchGptPasswordCode({ ...state, nodeId: 'fetch-gpt-password-code', visibleStep: 7 }),
    (error) => {
      assert.equal(error.code, 'SET_GPT_PASSWORD_CODE_FETCH_UNCERTAIN');
      assert.equal(error.retryable, false);
      assert.equal(error.preserveSignupSession, true);
      assert.match(error.message, /保留当前步骤 7 页面/);
      assert.doesNotMatch(error.message, /<html/i);
      return true;
    }
  );
  assert.equal(fetchAttempts, 2);
  assert.equal(resetStarts, 1);
});
