const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createSignupPasswordPage } = require('../content/signup-password-page.js');
delete globalThis.MultiPageBackgroundStep3;
require('../background/steps/fill-password.js');
const { createStep3Executor } = globalThis.MultiPageBackgroundStep3;

function createDocument({ passwordInput = null, elementsById = {}, explicitErrors = [] } = {}) {
  return {
    body: { innerText: '' },
    querySelector: (selector) => selector === 'input[type="password"]' ? passwordInput : null,
    querySelectorAll: (selector) => selector.includes('data-error-message') ? explicitErrors : [],
    getElementById: (id) => elementsById[id] || null,
  };
}

function createInput(attributes = {}) {
  return {
    value: '',
    getAttribute: (name) => attributes[name] || '',
  };
}

function createHelpers(options = {}) {
  return createSignupPasswordPage({
    documentRef: options.documentRef || createDocument(),
    locationRef: options.locationRef || { pathname: '/create-account/password', href: 'https://auth.openai.com/create-account/password' },
    windowRef: { setTimeout },
    isVisibleElement: () => true,
    isActionEnabled: () => true,
    getActionText: () => 'Continue',
    simulateClick: options.simulateClick || (() => {}),
  });
}

test('password submit uses native requestSubmit when the button belongs to a form', () => {
  let submittedButton = null;
  let clickCount = 0;
  const form = { requestSubmit: (button) => { submittedButton = button; } };
  const button = { form };
  const helpers = createHelpers({ simulateClick: () => { clickCount += 1; } });

  assert.deepEqual(helpers.submitSignupPasswordButton(button), { method: 'requestSubmit' });
  assert.equal(submittedButton, button);
  assert.equal(clickCount, 0);
});

test('password submit falls back to click when requestSubmit is unavailable', () => {
  let clickedButton = null;
  const button = { form: {} };
  const helpers = createHelpers({ simulateClick: (target) => { clickedButton = target; } });

  assert.deepEqual(helpers.submitSignupPasswordButton(button), { method: 'click' });
  assert.equal(clickedButton, button);
});

test('password page kind keeps signup creation separate from existing-account login', () => {
  const signupHelpers = createHelpers();
  const loginHelpers = createHelpers({
    locationRef: {
      pathname: '/log-in/password',
      href: 'https://auth.openai.com/log-in/password',
    },
  });

  assert.equal(signupHelpers.getPasswordPageKind(), 'signup_create');
  assert.equal(signupHelpers.detectSignupCreatePasswordPage(), true);
  assert.equal(loginHelpers.getPasswordPageKind(), 'login');
  assert.equal(loginHelpers.detectPasswordPage(), true);
  assert.equal(loginHelpers.detectSignupCreatePasswordPage(), false);
});

function createStep3Harness({
  matchedTab = { id: 17, url: 'https://auth.openai.com/create-account/password' },
  passwordSwitchRouteKind = 'signup_create',
  httpErrorRecovery = false,
  httpErrorAtStart = false,
} = {}) {
  const calls = [];
  const stateUpdates = [];
  let waitCalls = 0;
  let reloadCount = 0;
  const currentTab = {
    id: 17,
    url: httpErrorAtStart
      ? 'https://auth.openai.com/email-verification'
      : 'https://auth.openai.com/create-account/password',
    title: httpErrorAtStart ? 'auth.openai.com' : 'ChatGPT',
    status: 'complete',
  };
  const executor = createStep3Executor({
    addLog: async (message) => calls.push(['log', message]),
    chrome: {
      tabs: {
        update: async () => {},
        get: async () => (httpErrorRecovery || httpErrorAtStart ? currentTab : null),
        reload: async () => {
          reloadCount += 1;
          currentTab.url = 'https://auth.openai.com/create-account/password';
          currentTab.title = 'ChatGPT';
        },
      },
    },
    ensureContentScriptReadyOnTab: async () => calls.push(['ready']),
    waitForTabStableComplete: async () => calls.push(['stable']),
    generatePassword: () => 'GeneratedPassword123!',
    getTabId: async () => 17,
    isTabAlive: async () => true,
    sendToContentScript: async (_source, message) => {
      calls.push(['send', message]);
      return { ok: true, passwordPageNavigationScheduled: true, passwordSwitchRouteKind };
    },
    sendToContentScriptResilient: async (_source, message) => {
      calls.push(['resume', message]);
      return message.payload?.passwordSwitchResumed === true
        ? { ok: true }
        : { ok: true, passwordPageNavigationScheduled: true, passwordSwitchRouteKind };
    },
    setPasswordState: async () => {},
    setState: async (updates) => stateUpdates.push(updates),
    SIGNUP_PAGE_INJECT_FILES: ['content/signup-page.js'],
    waitForTabUrlMatch: async (_tabId, predicate) => {
      waitCalls += 1;
      if (httpErrorRecovery && waitCalls === 1) {
        currentTab.url = 'https://auth.openai.com/email-verification';
        currentTab.title = 'auth.openai.com';
        return null;
      }
      return matchedTab && predicate(matchedTab.url) ? matchedTab : null;
    },
  });
  return { calls, executor, reloadCount: () => reloadCount, stateUpdates };
}

test('step 3 resumes on the new create-account password page after the official switch link navigates', async () => {
  const harness = createStep3Harness();

  await harness.executor.executeStep3({
    email: 'new.account@example.test',
    accounts: [],
  });

  assert.equal(harness.calls.filter(([kind]) => kind === 'send').length, 1);
  assert.equal(harness.calls.filter(([kind]) => kind === 'resume').length, 1);
  const resumedMessage = harness.calls.find(([kind]) => kind === 'resume')[1];
  assert.equal(resumedMessage.payload.passwordSwitchResumed, true);
  assert.equal(resumedMessage.payload.passwordSwitchRouteKind, 'signup_create');
  assert.equal(resumedMessage.payload.email, 'new.account@example.test');
  assert.equal(harness.calls.filter(([kind]) => kind === 'ready').length, 2);
});

test('step 3 follows the official verification-page password action when it uses log-in/password', async () => {
  const harness = createStep3Harness({
    matchedTab: { id: 17, url: 'https://auth.openai.com/log-in/password' },
    passwordSwitchRouteKind: 'login',
  });

  await harness.executor.executeStep3({
    email: 'new.account@example.test',
    accounts: [],
  });

  const resumedMessage = harness.calls.find(([kind]) => kind === 'resume')[1];
  assert.equal(resumedMessage.payload.passwordSwitchResumed, true);
  assert.equal(resumedMessage.payload.passwordSwitchRouteKind, 'login');
  assert.equal(resumedMessage.payload.email, 'new.account@example.test');
});

test('step 3 reloads a transient HTTP 500 verification page before retrying the password switch', async () => {
  const harness = createStep3Harness({ httpErrorRecovery: true });

  await harness.executor.executeStep3({
    email: 'new.account@example.test',
    accounts: [],
  });

  assert.equal(harness.reloadCount(), 1);
  assert.equal(harness.calls.filter(([kind]) => kind === 'stable').length, 1);
  assert.equal(harness.calls.filter(([kind]) => kind === 'resume').length, 2);
  const retryMessage = harness.calls
    .filter(([kind]) => kind === 'resume')[0][1];
  assert.equal(retryMessage.payload.passwordSwitchRetry, 1);
  const resumedMessage = harness.calls
    .filter(([kind]) => kind === 'resume')[1][1];
  assert.equal(resumedMessage.payload.passwordSwitchResumed, true);
});

test('step 3 refreshes an HTTP 500 page before the content script handshake', async () => {
  const harness = createStep3Harness({ httpErrorAtStart: true });

  await harness.executor.executeStep3({
    email: 'new.account@example.test',
    accounts: [],
  });

  assert.equal(harness.reloadCount(), 1);
  assert.equal(harness.calls.filter(([kind]) => kind === 'stable').length, 1);
  assert.equal(harness.calls.filter(([kind]) => kind === 'ready').length, 2);
});

test('step 3 preserves the signup session when the password switch never reaches the create page', async () => {
  const harness = createStep3Harness({ matchedTab: null });

  await assert.rejects(
    harness.executor.executeStep3({ email: 'new.account@example.test', accounts: [] }),
    (error) => {
      assert.equal(error.code, 'SIGNUP_PASSWORD_SUBMIT_UNCERTAIN');
      assert.equal(error.retryable, false);
      assert.equal(error.preserveSignupSession, true);
      assert.match(error.message, /20 秒内未进入密码页/);
      return true;
    }
  );
  assert.equal(harness.calls.filter(([kind]) => kind === 'resume').length, 0);
});

test('password recovery waits ten seconds and allows only one recovery submit', () => {
  const helpers = createHelpers();

  assert.equal(helpers.getSignupPasswordRecoveryDecision({
    elapsedMs: 9999,
    initialObservationMs: 10000,
    recoverySubmitCount: 0,
    maxRecoverySubmits: 1,
    submitReady: true,
  }), 'observe');
  assert.equal(helpers.getSignupPasswordRecoveryDecision({
    elapsedMs: 10000,
    initialObservationMs: 10000,
    recoverySubmitCount: 0,
    maxRecoverySubmits: 1,
    submitReady: true,
  }), 'resubmit');
  assert.equal(helpers.getSignupPasswordRecoveryDecision({
    elapsedMs: 70000,
    initialObservationMs: 10000,
    recoverySubmitCount: 1,
    maxRecoverySubmits: 1,
    submitReady: true,
  }), 'observe');
});

test('invalid password aria-describedby text is treated as an error', () => {
  const passwordInput = createInput({ 'aria-invalid': 'true', 'aria-describedby': 'password-help password-error' });
  const elementsById = {
    'password-help': { textContent: 'Use at least 12 characters.' },
    'password-error': { textContent: 'Password is not accepted.' },
  };
  const helpers = createHelpers({ documentRef: createDocument({ passwordInput, elementsById }) });

  assert.equal(helpers.getSignupPasswordFieldErrorText(), 'Password is not accepted.');
});

test('ordinary password guidance is not treated as an error while input is valid', () => {
  const passwordInput = createInput({ 'aria-invalid': 'false', 'aria-describedby': 'password-help' });
  const elementsById = { 'password-help': { textContent: 'Use at least 12 characters.' } };
  const helpers = createHelpers({ documentRef: createDocument({ passwordInput, elementsById }) });

  assert.equal(helpers.getSignupPasswordFieldErrorText(), '');
});

test('step 3 transition observation is timeout-based and emits a terminal uncertain code', () => {
  const source = fs.readFileSync(path.join(__dirname, '../content/signup-page.js'), 'utf8');
  const step3Start = source.indexOf('async function step3_fillEmailPassword');
  const step3End = source.indexOf('// Step 4:', step3Start);
  const step3Source = source.slice(step3Start, step3End);
  const backgroundSource = fs.readFileSync(path.join(__dirname, '../background/steps/fill-password.js'), 'utf8');

  assert.match(source, /while \(Date\.now\(\) - start < effectiveTimeout\)/);
  assert.doesNotMatch(source, /while \(Date\.now\(\) - start < effectiveTimeout && recoveryRound/);
  assert.match(source, /maxPasswordRecoverySubmits = Math\.max/);
  assert.match(source, /SIGNUP_PASSWORD_SUBMIT_UNCERTAIN_ERROR_CODE = 'SIGNUP_PASSWORD_SUBMIT_UNCERTAIN'/);
  assert.match(source, /`\$\{SIGNUP_PASSWORD_SUBMIT_UNCERTAIN_ERROR_CODE\}::密码提交后等待/);
  assert.match(source, /passwordPageNavigationScheduled:\s*true/);
  assert.match(source, /findVerificationPasswordSwitchTrigger\(\)/);
  assert.match(source, /await waitForVerificationPasswordSwitchTrigger\(5000\)/);
  assert.match(source, /findVerificationPasswordSwitchTrigger\(\{ allowDisabled: true \}\)/);
  assert.match(step3Source, /passwordSwitchRouteKind:\s*passwordSwitchMatch\.routeKind/);
  assert.match(step3Source, /resumedFromVerificationPasswordSwitch/);
  assert.doesNotMatch(step3Source, /loginPasswordSwitchOnly:\s*true/);
  assert.doesNotMatch(step3Source, /不将其当作注册密码创建/);
  assert.match(source, /hasSignupPasswordSwitchTextHint\?\.\(\) === true/);
  assert.match(source, /buildSignupPasswordSwitchDiagnostic\?\.\(\)/);
  assert.match(source, /密码入口定位摘要/);
  assert.match(source, /trigger\?\.isConnected !== false/);
  assert.match(source, /入口组件在点击前已被页面重新渲染/);
  assert.doesNotMatch(source, /api\/accounts\/user\/register/);
  assert.doesNotMatch(step3Source, /completionPayload\s*=\s*\{[\s\S]{0,160}\b(?:email|accountIdentifier)\s*[,}]/);
  assert.doesNotMatch(step3Source, /目标邮箱\s*\$\{email\}|当前密码页邮箱为/);
  assert.doesNotMatch(source, /SIGNUP_PASSWORD_SUBMIT_UNCERTAIN_ERROR_CODE\}[\s\S]{0,300}location\.href/);
  assert.doesNotMatch(backgroundSource, /步骤 3：正在填写密码[^\n]*identity\.accountIdentifier/);
});

test('step 7 recognizes and advances the current-password challenge with the shared password submitter', () => {
  const source = fs.readFileSync(path.join(__dirname, '../content/signup-page.js'), 'utf8');
  const stateStart = source.indexOf('function isSetGptPasswordCurrentPasswordPage()');
  const stateEnd = source.indexOf('function normalizeSetGptPasswordPrepareWaitMs', stateStart);
  assert.ok(stateStart >= 0 && stateEnd > stateStart);
  const context = {
    authPageRecovery: { isSessionEndedInvalidStatePage: () => false },
    getResetPasswordInputs: () => ({ inputs: [], passwordInput: null, confirmInput: null }),
    getSignupPasswordDisplayedEmail: () => 'same-account@example.test',
    getSignupPasswordFieldErrorText: () => '',
    getSignupPasswordInput: () => ({}),
    isResetPasswordNewPasswordPage: () => false,
    location: {
      href: 'https://auth.openai.com/log-in/password',
      pathname: '/log-in/password',
    },
    result: null,
  };
  vm.runInNewContext(`${source.slice(stateStart, stateEnd)}\nresult = getSetGptPasswordPageState();`, context);

  assert.equal(context.result.state, 'current_password_page');
  assert.match(source, /state:\s*'current_password_page'/);
  assert.match(source, /async function submitSetGptPasswordCurrentPasswordChallenge/);
  assert.match(source, /fillSignupPasswordPageAndSubmit\(snapshot,\s*currentPassword,/);
  assert.match(source, /\['email_verification_page', 'new_password_page', 'email_already_verified_page', 'current_password_page'\]/);
  assert.match(source, /function resolveSetGptPasswordStepKey[\s\S]*?'fetch-gpt-password-code'/);
});

test('step 7 classifies the ChatGPT settings session-expired modal as terminal', () => {
  const source = fs.readFileSync(path.join(__dirname, '../content/signup-page.js'), 'utf8');
  const stateStart = source.indexOf('function isSetGptPasswordCurrentPasswordPage()');
  const stateEnd = source.indexOf('function normalizeSetGptPasswordPrepareWaitMs', stateStart);
  assert.ok(stateStart >= 0 && stateEnd > stateStart);
  const context = {
    authPageRecovery: {
      isChatGptSessionExpiredPage: () => true,
      isSessionEndedInvalidStatePage: () => false,
    },
    getSetGptPasswordAuthRetryPageState: () => null,
    getResetPasswordInputs: () => ({ inputs: [], passwordInput: null, confirmInput: null }),
    getSignupPasswordInput: () => null,
    isEmailAlreadyVerifiedPage: () => false,
    isSetGptPasswordEmailVerificationPage: () => false,
    isResetPasswordNewPasswordPage: () => false,
    location: {
      href: 'https://chatgpt.com/#settings/Security',
      pathname: '/',
    },
    result: null,
  };
  vm.runInNewContext(`${source.slice(stateStart, stateEnd)}\nresult = getSetGptPasswordPageState();`, context);

  assert.equal(context.result.state, 'session_expired_page');
  assert.equal(context.result.errorCode, 'chatgpt_session_expired');
});

test('step 8 recognizes the Korean password-reuse error before retrying', () => {
  const contentSource = fs.readFileSync(path.join(__dirname, '../content/signup-page.js'), 'utf8');
  const detectorStart = contentSource.indexOf('function getResetPasswordFieldErrorText()');
  const detectorEnd = contentSource.indexOf('function resolveSetGptPasswordStepKey', detectorStart);
  assert.ok(detectorStart >= 0 && detectorEnd > detectorStart);
  const koreanError = '비밀번호를 재사용할 수 없습니다';
  const contentContext = {
    document: {
      querySelectorAll: () => [{ textContent: koreanError }],
    },
    getPageTextSnapshot: () => koreanError,
    isVisibleElement: () => true,
    errorText: '',
    passwordReused: false,
  };
  vm.runInNewContext(
    `${contentSource.slice(detectorStart, detectorEnd)}\nerrorText = getResetPasswordFieldErrorText();\npasswordReused = isResetPasswordReuseErrorText(errorText);`,
    contentContext
  );

  assert.equal(contentContext.errorText, koreanError);
  assert.equal(contentContext.passwordReused, true);

  const backgroundSource = fs.readFileSync(path.join(__dirname, '../background/steps/set-gpt-password.js'), 'utf8');
  const classifierStart = backgroundSource.indexOf('function isSetGptPasswordReuseErrorText');
  const classifierEnd = backgroundSource.indexOf('function isRetryablePasswordSetupCodeFetchError', classifierStart);
  assert.ok(classifierStart >= 0 && classifierEnd > classifierStart);
  const backgroundContext = { koreanError, passwordReused: false };
  vm.runInNewContext(
    `${backgroundSource.slice(classifierStart, classifierEnd)}\npasswordReused = isSetGptPasswordReuseErrorText(koreanError);`,
    backgroundContext
  );

  assert.equal(backgroundContext.passwordReused, true);
});
