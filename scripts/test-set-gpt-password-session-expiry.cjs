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
    completedNodes: [],
    generatePassword: 0,
    prepare: 0,
    resetEmails: [],
    resetPasswords: [],
    resetWaits: [],
    sentNodeIds: [],
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
          url: options.expireDuringPasswordPoll && passwordSubmitCalls > 0
            ? 'https://auth.openai.com/error'
            : (options.newPasswordReady
              ? 'https://auth.openai.com/reset-password/new-password'
              : 'https://chatgpt.com/#settings/Security'),
        }),
        update: async (_tabId, update) => {
          if (update?.url) calls.updatedUrls.push(update.url);
          return {};
        },
      },
    },
    completeNodeFromBackground: async (nodeId) => {
      calls.complete += 1;
      calls.completedNodes.push(nodeId);
    },
    ensureContentScriptReadyOnTab: async () => {},
    generatePassword: () => {
      calls.generatePassword += 1;
      return 'Generated-password-2';
    },
    getTabId: async () => 7,
    getState: async () => ({ ...state }),
    isTabAlive: async () => true,
    reuseOrCreateTab: async (_source, url) => {
      calls.tabUrls.push(url);
      return 7;
    },
    sendToContentScriptResilient: async (_source, message) => {
      calls.sentNodeIds.push([message.type, message.payload?.nodeId]);
      if (message.type === 'START_SET_GPT_PASSWORD_RESET') {
        resetCalls += 1;
        calls.resetEmails.push(message.payload.email);
        calls.resetPasswords.push(message.payload.currentPassword);
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

test('ChatGPT settings session-expired modal is detected across supported locales', () => {
  const originalDocument = globalThis.document;
  try {
    globalThis.document = { title: 'ChatGPT' };
    let pageText = '';
    const recovery = createAuthPageRecovery({ getPageTextSnapshot: () => pageText });

    for (const localizedText of [
      'Session expired. Log in to continue using the app.',
      '会话已过期。要继续使用此应用，请登录。',
      '세션이 만료되었습니다 앱을 계속 사용하려면 로그인하세요. 로그인',
      'セッションの有効期限が切れました。アプリを引き続き使用するにはログインしてください。',
      'सत्र समाप्त हो गया। ऐप का उपयोग जारी रखने के लिए लॉग इन करें।',
    ]) {
      pageText = localizedText;
      assert.equal(recovery.isChatGptSessionExpiredPage(), true, localizedText);
    }

    pageText = 'Session management settings. Log in to manage another account.';
    assert.equal(recovery.isChatGptSessionExpiredPage(), false);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('step 7 restarts its reset entry in place with the same account after invalid_state', async () => {
  const { calls, executor, state } = createSessionExpiryHarness();
  const result = await executor.executeFetchGptPasswordCode({ ...state, nodeId: 'fetch-gpt-password-code', visibleStep: 7 });

  assert.equal(result.gptPasswordResetStage, 'new_password_ready');
  assert.deepEqual(calls.resetEmails, ['same-account@example.test', 'same-account@example.test']);
  assert.equal(calls.tabUrls.length, 2);
  assert.equal(calls.complete, 1);
  assert.deepEqual(calls.completedNodes, ['fetch-gpt-password-code']);
  assert.equal(calls.generatePassword, 0);
  assert.equal(calls.sentNodeIds.every(([, nodeId]) => nodeId === 'fetch-gpt-password-code'), true);
  assert.equal(state.email, 'same-account@example.test');
});

test('step 7 passes the password already bound to the current account for the current-password challenge', async () => {
  const { calls, executor, state } = createSessionExpiryHarness({ newPasswordReady: true });

  await executor.executeFetchGptPasswordCode({ ...state, nodeId: 'fetch-gpt-password-code', visibleStep: 7 });

  assert.ok(calls.resetPasswords.length >= 1);
  assert.equal(calls.resetPasswords.every((password) => password === 'Example-password-1'), true);
  assert.equal(calls.generatePassword, 0);
});

test('step 7 does not send a password that belongs to a different account', async () => {
  const { calls, executor, state } = createSessionExpiryHarness({ newPasswordReady: true });
  state.passwordAccountIdentifier = 'different-account@example.test';

  await executor.executeFetchGptPasswordCode({ ...state, nodeId: 'fetch-gpt-password-code', visibleStep: 7 });

  assert.ok(calls.resetPasswords.length >= 1);
  assert.equal(calls.resetPasswords.every((password) => password === ''), true);
});

test('step 7 reset entry recovery is bounded to two restarts', async () => {
  const { calls, executor, state } = createSessionExpiryHarness({ alwaysExpire: true });
  await assert.rejects(
    executor.executeFetchGptPasswordCode({ ...state, nodeId: 'fetch-gpt-password-code', visibleStep: 7 }),
    (error) => isSetGptPasswordSessionExpiredError(error)
  );
  assert.equal(calls.resetEmails.length, 3);
  assert.equal(calls.complete, 0);
});

test('step 8 requires the step 7 checkpoint and never starts the reset flow itself', async () => {
  const { calls, executor, state } = createSessionExpiryHarness({ newPasswordReady: true });
  await assert.rejects(
    executor.executeSetGptPassword({ ...state, nodeId: 'set-gpt-password', visibleStep: 8 }),
    (error) => error.code === 'SET_GPT_PASSWORD_SESSION_EXPIRED'
      && error.restartNodeId === 'fetch-gpt-password-code'
  );
  assert.equal(calls.resetEmails.length, 0);
  assert.equal(calls.complete, 0);
});

test('missing reset entry restarts step 7 without opening the stateless new-password URL', async () => {
  const { calls, executor, state } = createSessionExpiryHarness({ resetEntryMissing: true });
  const result = await executor.executeFetchGptPasswordCode({ ...state, nodeId: 'fetch-gpt-password-code', visibleStep: 7 });
  assert.equal(result.gptPasswordResetStage, 'new_password_ready');
  assert.deepEqual(calls.resetEmails, ['same-account@example.test', 'same-account@example.test']);
  assert.equal(calls.updatedUrls.includes('https://auth.openai.com/reset-password/new-password'), false);
  assert.equal(calls.complete, 1);
});

test('late Password entry is rechecked on the same Security page before restarting step 7', async () => {
  const { calls, executor, state } = createSessionExpiryHarness({ lateSettingsPasswordEntry: true });

  const result = await executor.executeFetchGptPasswordCode({ ...state, nodeId: 'fetch-gpt-password-code', visibleStep: 7 });

  assert.equal(result.gptPasswordResetStage, 'new_password_ready');
  assert.deepEqual(calls.resetEmails, ['same-account@example.test', 'same-account@example.test']);
  assert.equal(calls.tabUrls.length, 1);
  assert.equal(calls.resetWaits[0], undefined);
  assert.ok(calls.resetWaits[1] >= 45000);
  assert.equal(calls.complete, 1);
});

test('slow reset-entry navigation is reconciled on the same attempt instead of stopping the workflow', async () => {
  const { calls, executor, state } = createSessionExpiryHarness({ slowResetEntryTransition: true });

  const result = await executor.executeFetchGptPasswordCode({ ...state, nodeId: 'fetch-gpt-password-code', visibleStep: 7 });

  assert.equal(result.gptPasswordResetStage, 'new_password_ready');
  assert.deepEqual(calls.resetEmails, ['same-account@example.test']);
  assert.equal(calls.prepare, 1);
  assert.equal(calls.complete, 1);
});

test('step 8 submits only on the same account new-password page', async () => {
  const { calls, executor, state } = createSessionExpiryHarness({ newPasswordReady: true });
  Object.assign(state, {
    gptPasswordResetStage: 'new_password_ready',
    gptPasswordResetEmail: state.email,
    gptPasswordResetReadyAt: new Date().toISOString(),
  });

  const result = await executor.executeSetGptPassword({ ...state, nodeId: 'set-gpt-password', visibleStep: 8 });

  assert.equal(result.gptPasswordSet, true);
  assert.equal(calls.resetEmails.length, 0);
  assert.deepEqual(calls.completedNodes, ['set-gpt-password']);
  assert.equal(calls.sentNodeIds.every(([, nodeId]) => nodeId === 'set-gpt-password'), true);
});

test('step 8 session loss requests an automatic restart from step 7', async () => {
  const { calls, executor, state } = createSessionExpiryHarness({ newPasswordReady: true, expireDuringPasswordPoll: true });
  Object.assign(state, {
    gptPasswordResetStage: 'new_password_ready',
    gptPasswordResetEmail: state.email,
    gptPasswordResetReadyAt: new Date().toISOString(),
  });

  await assert.rejects(
    executor.executeSetGptPassword({ ...state, nodeId: 'set-gpt-password', visibleStep: 8 }),
    (error) => error.code === 'SET_GPT_PASSWORD_SESSION_EXPIRED'
      && error.restartNodeId === 'fetch-gpt-password-code'
  );
  assert.equal(calls.resetEmails.length, 0);
  assert.equal(calls.complete, 0);
});

test('unrelated invalid_state text is not classified as a password split restart signal', () => {
  assert.equal(isSetGptPasswordSessionExpiredError(new Error('invalid_state')), false);
  assert.equal(isSetGptPasswordSessionExpiredError('SET_GPT_PASSWORD_SESSION_EXPIRED::redacted'), true);
  assert.equal(isSetGptPasswordSessionExpiredError('SET_GPT_PASSWORD_RESET_ENTRY_UNAVAILABLE::redacted'), true);
});
