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

test('step 2 recovers a failed home-page probe inside the first execution', async () => {
  const messages = [];
  const logs = [];
  let authEntryOpenCount = 0;
  let completedPayload = null;
  const executor = createStep2Executor({
    addLog: async (message) => { logs.push(message); },
    chrome: {
      tabs: {
        get: async () => ({ url: 'https://chatgpt.com/' }),
        update: async () => {},
      },
    },
    completeNodeFromBackground: async (_nodeId, payload) => { completedPayload = payload; },
    ensureContentScriptReadyOnTab: async () => {},
    ensureSignupAuthEntryPageReady: async () => {
      authEntryOpenCount += 1;
      return { tabId: 19, result: { state: 'email_entry' } };
    },
    ensureSignupEntryPageReady: async () => ({ tabId: 17 }),
    ensureSignupPostEmailPageReadyInTab: async () => ({
      state: 'verification_page',
      url: 'https://auth.openai.com/email-verification',
    }),
    getTabId: async () => 17,
    isTabAlive: async () => true,
    resolveSignupEmailForFlow: async () => 'first-attempt@example.test',
    sendToContentScriptResilient: async (_source, message) => {
      messages.push(message);
      if (message.type === 'ENSURE_SIGNUP_ENTRY_READY') {
        return { error: '当前页面没有可用的注册入口，也不在邮箱/密码页。URL: https://chatgpt.com/' };
      }
      if (message.type === 'EXECUTE_NODE') {
        return { submitted: true };
      }
      throw new Error(`unexpected message: ${message.type}`);
    },
  });

  await executor.executeStep2({ email: 'first-attempt@example.test' });

  assert.equal(authEntryOpenCount, 1);
  assert.equal(messages.filter((message) => message.type === 'EXECUTE_NODE').length, 1);
  assert.ok(messages.every((message) => message.payload.backgroundOwnsWorkflowOutcome === true));
  assert.ok(logs.some((message) => /正在打开认证入口页再提交邮箱/.test(message)));
  assert.equal(completedPayload.nextSignupState, 'verification_page');
});

test('step 2 retries a missing Continue button inside the current round', async () => {
  const calls = [];
  const entryReadyMessages = [];
  const executeMessages = [];
  let completedPayload = null;
  const executor = createStep2Executor({
    addLog: async (message) => { calls.push(['log', message]); },
    chrome: {
      tabs: {
        get: async () => ({ url: 'https://chatgpt.com/' }),
        update: async () => {},
      },
    },
    completeNodeFromBackground: async (_nodeId, payload) => { completedPayload = payload; },
    ensureContentScriptReadyOnTab: async () => {},
    ensureSignupAuthEntryPageReady: async () => ({ tabId: 19, result: { state: 'email_entry' } }),
    ensureSignupEntryPageReady: async () => ({ tabId: 17 }),
    ensureSignupPostEmailPageReadyInTab: async () => ({
      state: 'verification_page',
      url: 'https://auth.openai.com/email-verification',
    }),
    getTabId: async () => 17,
    isTabAlive: async () => true,
    resolveSignupEmailForFlow: async () => 'current@example.test',
    sendToContentScriptResilient: async (_source, message) => {
      calls.push(['message', message.type]);
      if (message.type === 'ENSURE_SIGNUP_ENTRY_READY') {
        entryReadyMessages.push(message);
        return { state: 'email_entry' };
      }
      executeMessages.push(message);
      const executeCount = calls.filter((item) => item[0] === 'message' && item[1] === 'EXECUTE_NODE').length;
      if (executeCount === 1) {
        return { error: '步骤 2：未找到可点击的“继续”按钮。URL: https://chatgpt.com/' };
      }
      return { submitted: true };
    },
  });

  await executor.executeStep2({ email: 'current@example.test' });

  assert.equal(calls.filter((item) => item[0] === 'message' && item[1] === 'EXECUTE_NODE').length, 2);
  assert.equal(entryReadyMessages.length, 1);
  assert.equal(entryReadyMessages[0].payload.backgroundOwnsWorkflowOutcome, true);
  assert.equal(executeMessages.length, 2);
  assert.ok(executeMessages.every((message) => message.payload.backgroundOwnsWorkflowOutcome === true));
  assert.ok(calls.some((item) => item[0] === 'log' && /打开认证入口页后重试一次/.test(item[1])));
  assert.equal(completedPayload.nextSignupState, 'verification_page');
  assert.equal(completedPayload.skippedPasswordStep, false);
});
