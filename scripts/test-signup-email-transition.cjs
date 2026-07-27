const test = require('node:test');
const assert = require('node:assert/strict');

delete globalThis.MultiPageSignupFlowHelpers;
delete globalThis.MultiPageBackgroundStep2;
require('../background/signup-flow-helpers.js');
require('../background/steps/submit-signup-email.js');

const { createSignupFlowHelpers } = globalThis.MultiPageSignupFlowHelpers;
const { createStep2Executor } = globalThis.MultiPageBackgroundStep2;

test('password page observation finishes before the background response budget', async () => {
  const calls = [];
  const helper = createSignupFlowHelpers({
    chrome: { tabs: { get: async () => ({ url: 'https://auth.openai.com/create-account/password' }) } },
    ensureContentScriptReadyOnTab: async () => {},
    isSignupPasswordPageUrl: (url) => /\/create-account\/password/.test(url),
    isSignupEmailVerificationPageUrl: () => false,
    sendToContentScriptResilient: async (source, message, options) => {
      calls.push({ source, message, options });
      return { error: '等待进入密码页超时。URL: https://auth.openai.com/create-account/password' };
    },
  });

  await assert.rejects(
    helper.ensureSignupPostEmailPageReadyInTab(17, 2, { skipUrlWait: true }),
    /等待进入密码页超时/
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].message.payload.timeoutMs, 20000);
  assert.equal(calls[0].message.payload.backgroundOwnsWorkflowOutcome, true);
  assert.equal(calls[0].options.responseTimeoutMs, 25000);
  assert.equal(calls[0].options.timeoutMs, 50000);
  assert.ok(calls[0].options.responseTimeoutMs > calls[0].message.payload.timeoutMs);
});

test('step 2 preserves the signup session when the post-email page stays unknown', async () => {
  let completed = false;
  const executor = createStep2Executor({
    addLog: async () => {},
    chrome: {
      tabs: {
        get: async () => ({ url: 'https://auth.openai.com/create-account/password' }),
        update: async () => {},
      },
    },
    completeNodeFromBackground: async () => { completed = true; },
    ensureContentScriptReadyOnTab: async () => {},
    ensureSignupPostEmailPageReadyInTab: async () => {
      throw new Error('等待进入密码页超时。URL: https://auth.openai.com/create-account/password');
    },
    getTabId: async () => 17,
    isTabAlive: async () => true,
    resolveSignupEmailForFlow: async () => 'current@example.test',
    sendToContentScriptResilient: async (_source, message) => {
      if (message.type === 'ENSURE_SIGNUP_ENTRY_READY') return { state: 'email_entry' };
      if (message.type === 'EXECUTE_NODE') return { submitted: true };
      throw new Error(`unexpected message: ${message.type}`);
    },
  });

  await assert.rejects(
    executor.executeStep2({ email: 'current@example.test' }),
    (error) => {
      assert.equal(error.code, 'SIGNUP_EMAIL_SUBMIT_UNCERTAIN');
      assert.equal(error.retryable, false);
      assert.equal(error.preserveSignupSession, true);
      assert.match(error.message, /不会自动重新提交/);
      return true;
    }
  );
  assert.equal(completed, false);
});
