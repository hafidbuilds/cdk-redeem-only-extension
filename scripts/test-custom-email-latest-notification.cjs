const assert = require('node:assert/strict');
const test = require('node:test');

const { createAssurivoFeedClient } = require('../background/verification/assurivo-feed-client.js');
require('../background/verification/manual-confirmation.js');
const { createVerificationResendController } = require('../background/verification/resend-controller.js');

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
