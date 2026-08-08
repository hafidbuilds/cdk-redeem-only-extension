const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('../background/steps/fetch-signup-code.js');

const { createStep4Executor } = globalThis.MultiPageBackgroundStep4;
const signupPageSource = fs.readFileSync(path.join(__dirname, '..', 'content', 'signup-page.js'), 'utf8');

function createDeps(overrides = {}) {
  return {
    addLog: async () => {},
    chrome: { tabs: { update: async () => {} } },
    completeNodeFromBackground: async () => {},
    getTabId: async () => 41,
    isRetryableContentScriptTransportError: () => false,
    sendToContentScript: async (_source, message) => {
      if (message.type === 'GET_LOGIN_AUTH_STATE') return { state: 'verification_page', verificationKind: 'email' };
      throw new Error(`unexpected direct message: ${message.type}`);
    },
    sendToContentScriptResilient: async () => ({ alreadyVerified: true }),
    setState: async () => {},
    throwIfStopped: () => {},
    ...overrides,
  };
}

test('step 5 gives verification preparation enough time and uses resilient messaging', async () => {
  const calls = [];
  const completed = [];
  const statePatches = [];
  const executor = createStep4Executor(createDeps({
    completeNodeFromBackground: async (...args) => completed.push(args),
    setState: async (patch) => statePatches.push(patch),
    sendToContentScriptResilient: async (source, message, options) => {
      calls.push({ source, message, options });
      return { alreadyVerified: true };
    },
  }));

  await executor.executeStep4({ customPassword: 'fake-password', email: 'current@example.com' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].message.type, 'PREPARE_SIGNUP_VERIFICATION');
  assert.equal(calls[0].message.payload.timeoutMs, 75000);
  assert.equal(calls[0].message.payload.maxPasswordRecoverySubmits, 0);
  assert.equal(calls[0].message.payload.backgroundOwnsWorkflowOutcome, true);
  assert.equal(calls[0].options.timeoutMs, 105000);
  assert.equal(calls[0].options.responseTimeoutMs, 95000);
  assert.deepEqual(completed, [['fetch-signup-code', {}]]);
  assert.deepEqual(statePatches, [{ step4VerificationRenderResumeCount: 0 }]);
});

test('step 5 transport exhaustion stops with a session-preserving uncertain result', async () => {
  const executor = createStep4Executor(createDeps({
    isRetryableContentScriptTransportError: () => true,
    sendToContentScriptResilient: async () => {
      throw new Error('认证页 内容脚本 95 秒内未响应，请刷新页面后重试。');
    },
  }));

  await assert.rejects(
    executor.executeStep4({ customPassword: 'fake-password', email: 'current@example.com' }),
    (error) => {
      assert.equal(error.code, 'SIGNUP_PASSWORD_SUBMIT_UNCERTAIN');
      assert.equal(error.retryable, false);
      assert.equal(error.preserveSignupSession, true);
      assert.match(error.message, /^SIGNUP_PASSWORD_SUBMIT_UNCERTAIN::步骤 5/);
      return true;
    }
  );
});

test('step 5 marks an initially deactivated account and stops before verification preparation', async () => {
  const marked = [];
  const completed = [];
  let prepareCalls = 0;
  const executor = createStep4Executor(createDeps({
    completeNodeFromBackground: async (...args) => completed.push(args),
    markCurrentRegistrationAccountDeactivated: async (state, options) => {
      marked.push({ state, options });
      return { updated: true, email: options.email, nextEmail: 'next@example.com', poolUpdated: true };
    },
    sendToContentScript: async (_source, message) => {
      assert.equal(message.type, 'GET_LOGIN_AUTH_STATE');
      return {
        state: 'account_deactivated_page',
        accountDeactivated: true,
        errorCode: 'account_deactivated',
      };
    },
    sendToContentScriptResilient: async () => {
      prepareCalls += 1;
      return { alreadyVerified: true };
    },
  }));

  await assert.rejects(
    executor.executeStep4({ customPassword: 'fake-password', email: 'current@example.com' }),
    (error) => {
      assert.equal(error.code, 'ACCOUNT_DEACTIVATED');
      assert.equal(error.retryable, false);
      assert.equal(error.accountEmail, 'current@example.com');
      assert.equal(error.nextAccountEmail, 'next@example.com');
      return true;
    }
  );

  assert.equal(marked.length, 1);
  assert.equal(marked[0].options.reasonCode, 'ACCOUNT_DEACTIVATED');
  assert.equal(prepareCalls, 0);
  assert.deepEqual(completed, []);
});

test('step 5 stops when verification preparation transitions to account_deactivated', async () => {
  const marked = [];
  const completed = [];
  const executor = createStep4Executor(createDeps({
    completeNodeFromBackground: async (...args) => completed.push(args),
    markCurrentRegistrationAccountDeactivated: async (state, options) => {
      marked.push({ state, options });
      return { updated: true, email: options.email, nextEmail: '', poolUpdated: true };
    },
    sendToContentScriptResilient: async () => ({
      error: 'ACCOUNT_DEACTIVATED::账号已删除或停用，账户不可用',
      errorCode: 'ACCOUNT_DEACTIVATED',
      retryable: false,
    }),
  }));

  await assert.rejects(
    executor.executeStep4({ customPassword: 'fake-password', email: 'current@example.com' }),
    (error) => {
      assert.equal(error.code, 'ACCOUNT_DEACTIVATED');
      assert.equal(error.accountSourceExhausted, true);
      return true;
    }
  );

  assert.equal(marked.length, 1);
  assert.deepEqual(completed, []);
});

test('step 5 keeps observing a verified route when its input is still rendering', () => {
  assert.match(signupPageSource, /isVerificationTargetWaitRetryable\?\.\(error, snapshot\.state\)/);
  assert.match(signupPageSource, /验证码页已打开，但输入框仍在渲染/);
  assert.match(signupPageSource, /SIGNUP_VERIFICATION_INPUT_RENDER_PENDING_ERROR_CODE/);
  assert.match(signupPageSource, /renderPendingError\.preserveSignupSession = true/);
  assert.match(signupPageSource, /snapshot\.state === 'account_deactivated'/);
  assert.match(signupPageSource, /throw createAccountDeactivatedError\(\)/);
});
