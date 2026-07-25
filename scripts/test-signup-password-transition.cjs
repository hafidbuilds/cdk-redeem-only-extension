const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createSignupPasswordPage } = require('../content/signup-password-page.js');

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
    locationRef: { pathname: '/create-account/password', href: 'https://auth.openai.com/create-account/password' },
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

  assert.match(source, /while \(Date\.now\(\) - start < effectiveTimeout\)/);
  assert.doesNotMatch(source, /while \(Date\.now\(\) - start < effectiveTimeout && recoveryRound/);
  assert.match(source, /maxPasswordRecoverySubmits = Math\.max/);
  assert.match(source, /SIGNUP_PASSWORD_SUBMIT_UNCERTAIN_ERROR_CODE = 'SIGNUP_PASSWORD_SUBMIT_UNCERTAIN'/);
  assert.match(source, /`\$\{SIGNUP_PASSWORD_SUBMIT_UNCERTAIN_ERROR_CODE\}::密码提交后等待/);
});
