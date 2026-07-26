const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { createAuthPageRecovery } = require('../content/auth-page-recovery.js');

const backgroundModulePath = path.join(__dirname, '..', 'background', 'steps', 'set-gpt-password.js');
delete require.cache[require.resolve(backgroundModulePath)];
delete globalThis.MultiPageBackgroundSetGptPassword;
require(backgroundModulePath);

const {
  createSetGptPasswordExecutor,
  isSetGptPasswordSessionExpiredError,
} = globalThis.MultiPageBackgroundSetGptPassword;

function createSessionExpiryHarness(options = {}) {
  const state = {
    email: 'same-account@example.test',
    password: 'Example-password-1',
    passwordAccountIdentifier: 'same-account@example.test',
    passwordAccountIdentifierType: 'email',
  };
  const calls = {
    complete: 0,
    prepare: 0,
    resetEmails: [],
    resetWaits: [],
    tabUrls: [],
    updatedUrls: [],
  };
  let resetCalls = 0;
  let passwordSubmitCalls = 0;
  const executor = createSetGptPasswordExecutor({
    addLog: async () => {},
    chrome: {
      tabs: {
        get: async () => ({
          id: 7,
          url: options.expireDuringPasswordPoll
            ? 'https://auth.openai.com/error'
            : 'https://chatgpt.com/#settings/Security',
        }),
        update: async (_tabId, update) => {
          if (update?.url) calls.updatedUrls.push(update.url);
          return {};
        },
      },
    },
    completeNodeFromBackground: async () => { calls.complete += 1; },
    ensureContentScriptReadyOnTab: async () => {},
    getState: async () => ({ ...state }),
    reuseOrCreateTab: async (_source, url) => {
      calls.tabUrls.push(url);
      return 7;
    },
    sendToContentScriptResilient: async (_source, message) => {
      if (message.type === 'START_SET_GPT_PASSWORD_RESET') {
        resetCalls += 1;
        calls.resetEmails.push(message.payload.email);
        calls.resetWaits.push(message.payload.passwordActionWaitMs);
        if (options.expireDuringPasswordPoll) {
          return { ready: true, alreadyOnNewPasswordPage: true };
        }
        if (options.lateSettingsPasswordEntry && resetCalls === 1) {
          return {
            ready: false,
            resetEntryMissing: true,
            url: 'https://chatgpt.com/#settings/Security',
          };
        }
        if (options.slowResetEntryTransition && resetCalls === 1) {
          return { ready: false, resetEntryClickFailed: true };
        }
        if (options.resetEntryMissing && resetCalls === 1) {
          return { ready: false, resetEntryMissing: true };
        }
        if (options.alwaysExpire || resetCalls === 1) {
          throw new Error('SET_GPT_PASSWORD_SESSION_EXPIRED::redacted session expired');
        }
        return { ready: true, alreadyOnNewPasswordPage: true };
      }
      if (message.type === 'PREPARE_SET_GPT_PASSWORD' && options.slowResetEntryTransition) {
        calls.prepare += 1;
        return { ready: true, alreadyOnNewPasswordPage: true };
      }
      if (message.type === 'SET_GPT_PASSWORD') {
        passwordSubmitCalls += 1;
        if (options.expireDuringPasswordPoll && passwordSubmitCalls === 1) {
          return {};
        }
        return { success: true, gptPasswordSet: true };
      }
      if (message.type === 'GET_SET_GPT_PASSWORD_STATE' && options.expireDuringPasswordPoll) {
        return { state: 'session_expired_page', errorCode: 'invalid_state', url: 'https://auth.openai.com/error' };
      }
      throw new Error(`Unexpected message: ${message.type}`);
    },
    setState: async (patch) => Object.assign(state, patch),
  });
  return { calls, executor, state };
}

test('session-ended detector requires both the terminal message and exact invalid_state code', () => {
  const originalDocument = globalThis.document;
  try {
    globalThis.document = { title: 'Session ended' };
    let pageText = 'Your sign-in session is no longer valid. error_code: invalid_state';
    const recovery = createAuthPageRecovery({ getPageTextSnapshot: () => pageText });
    assert.equal(recovery.isSessionEndedInvalidStatePage(), true);

    globalThis.document.title = 'Authentication error';
    pageText = 'A different request reported error_code: invalid_state';
    assert.equal(recovery.isSessionEndedInvalidStatePage(), false);

    globalThis.document.title = 'Session ended';
    pageText = 'Please start over. error_code: access_denied';
    assert.equal(recovery.isSessionEndedInvalidStatePage(), false);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('step 6 restarts in place with the same account after invalid_state', async () => {
  const { calls, executor, state } = createSessionExpiryHarness();
  const result = await executor.executeSetGptPassword({ ...state, nodeId: 'set-gpt-password', visibleStep: 6 });

  assert.equal(result.gptPasswordSet, true);
  assert.deepEqual(calls.resetEmails, ['same-account@example.test', 'same-account@example.test']);
  assert.equal(calls.tabUrls.length, 2);
  assert.equal(calls.complete, 1);
  assert.equal(state.email, 'same-account@example.test');
});

test('step 6 session restart is bounded to two restarts', async () => {
  const { calls, executor, state } = createSessionExpiryHarness({ alwaysExpire: true });
  await assert.rejects(
    executor.executeSetGptPassword({ ...state, nodeId: 'set-gpt-password', visibleStep: 6 }),
    (error) => isSetGptPasswordSessionExpiredError(error)
  );
  assert.equal(calls.resetEmails.length, 3);
  assert.equal(calls.complete, 0);
});

test('auth error URL is probed and restarts step 6 instead of being treated as password success', async () => {
  const { calls, executor, state } = createSessionExpiryHarness({ expireDuringPasswordPoll: true });
  const result = await executor.executeSetGptPassword({ ...state, nodeId: 'set-gpt-password', visibleStep: 6 });
  assert.equal(result.gptPasswordSet, true);
  assert.deepEqual(calls.resetEmails, ['same-account@example.test', 'same-account@example.test']);
  assert.equal(calls.complete, 1);
});

test('missing reset entry restarts step 6 without opening the stateless new-password URL', async () => {
  const { calls, executor, state } = createSessionExpiryHarness({ resetEntryMissing: true });
  const result = await executor.executeSetGptPassword({ ...state, nodeId: 'set-gpt-password', visibleStep: 6 });
  assert.equal(result.gptPasswordSet, true);
  assert.deepEqual(calls.resetEmails, ['same-account@example.test', 'same-account@example.test']);
  assert.equal(calls.updatedUrls.includes('https://auth.openai.com/reset-password/new-password'), false);
  assert.equal(calls.complete, 1);
});

test('late Password entry is rechecked on the same Security page before restarting step 6', async () => {
  const { calls, executor, state } = createSessionExpiryHarness({ lateSettingsPasswordEntry: true });

  const result = await executor.executeSetGptPassword({ ...state, nodeId: 'set-gpt-password', visibleStep: 6 });

  assert.equal(result.gptPasswordSet, true);
  assert.deepEqual(calls.resetEmails, ['same-account@example.test', 'same-account@example.test']);
  assert.equal(calls.tabUrls.length, 1);
  assert.equal(calls.resetWaits[0], undefined);
  assert.ok(calls.resetWaits[1] >= 45000);
  assert.equal(calls.complete, 1);
});

test('slow reset-entry navigation is reconciled on the same attempt instead of stopping the workflow', async () => {
  const { calls, executor, state } = createSessionExpiryHarness({ slowResetEntryTransition: true });

  const result = await executor.executeSetGptPassword({ ...state, nodeId: 'set-gpt-password', visibleStep: 6 });

  assert.equal(result.gptPasswordSet, true);
  assert.deepEqual(calls.resetEmails, ['same-account@example.test']);
  assert.equal(calls.prepare, 1);
  assert.equal(calls.complete, 1);
});

test('unrelated invalid_state text is not classified as a step 6 restart signal', () => {
  assert.equal(isSetGptPasswordSessionExpiredError(new Error('invalid_state')), false);
  assert.equal(isSetGptPasswordSessionExpiredError('SET_GPT_PASSWORD_SESSION_EXPIRED::redacted'), true);
  assert.equal(isSetGptPasswordSessionExpiredError('SET_GPT_PASSWORD_RESET_ENTRY_UNAVAILABLE::redacted'), true);
});
