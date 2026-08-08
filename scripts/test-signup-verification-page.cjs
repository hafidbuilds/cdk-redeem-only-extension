const assert = require('node:assert/strict');
const test = require('node:test');

globalThis.self = globalThis;
const authPageDetectors = require('../content/auth-page-detectors.js');
require('../content/signup-dom-utils.js');
require('../content/signup-page-detector.js');
require('../content/signup-verification-page.js');

const { createSignupVerificationPage } = globalThis.MultiPageSignupVerificationPage;

function createPage(pathname = '/email-verification') {
  return createSignupVerificationPage({
    documentRef: {
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    locationRef: { pathname },
    verificationCodeInputSelector: 'input[name="code"]',
    loginTotpVerificationPattern: /totp/i,
    oneTimeCodeLoginPattern: /one-time/i,
    resendVerificationCodePattern: /resend/i,
    invalidVerificationCodePattern: /invalid/i,
    isVisibleElement: () => true,
    isActionEnabled: () => true,
    getActionText: () => '',
    getAssociatedInputText: () => '',
    getPageTextSnapshot: () => '',
  });
}

test('step 4 treats a temporarily missing input on the email verification page as render-pending', () => {
  const page = createPage();

  assert.equal(
    page.isVerificationTargetWaitRetryable(new Error('未找到验证码输入框。URL: https://auth.openai.com/email-verification'), 'verification'),
    true
  );
});

test('step 4 does not retry unrelated failures or missing inputs on another page state', () => {
  const page = createPage();

  assert.equal(page.isVerificationTargetWaitRetryable(new Error('HTTP 500'), 'verification'), false);
  assert.equal(page.isVerificationTargetWaitRetryable(new Error('未找到验证码输入框。'), 'password'), false);
  assert.equal(createPage('/log-in').isVerificationTargetWaitRetryable(new Error('未找到验证码输入框。'), 'verification'), false);
});

test('step 4 recognizes the Japanese invalid-code message from the verification page', () => {
  const errorElement = { textContent: '不正確なコード' };
  const page = createSignupVerificationPage({
    documentRef: {
      querySelector: () => null,
      querySelectorAll: () => [errorElement],
    },
    locationRef: { pathname: '/email-verification' },
    verificationCodeInputSelector: 'input[name="code"]',
    loginTotpVerificationPattern: /totp/i,
    oneTimeCodeLoginPattern: /one-time/i,
    resendVerificationCodePattern: /resend/i,
    invalidVerificationCodePattern: globalThis.MultiPageSignupPageDetector.constants.INVALID_VERIFICATION_CODE_PATTERN,
    isVisibleElement: () => true,
    isActionEnabled: () => true,
    getActionText: () => '',
    getAssociatedInputText: () => '',
    getPageTextSnapshot: () => '',
  });

  assert.equal(page.getVerificationErrorText(), '不正確なコード');
});

test('step 4 finds resend controls through Japanese text and structured DOM attributes', () => {
  const makeAction = (textContent, attrs = {}) => ({
    textContent,
    value: '',
    disabled: false,
    getAttribute(name) {
      if (name === 'aria-disabled') return 'false';
      return attrs[name] || '';
    },
  });
  const japaneseAction = makeAction('メールを再送信する', { 'data-testid': 'resend-verification-code' });
  const structuredAction = makeAction('', { 'data-testid': 'resend-verification-code' });
  const getActionText = globalThis.MultiPageSignupDomUtils.getActionText;
  const createPageWithAction = (action) => createSignupVerificationPage({
    documentRef: {
      querySelector: () => null,
      querySelectorAll: () => [action],
    },
    locationRef: { pathname: '/email-verification' },
    verificationCodeInputSelector: 'input[name="code"]',
    loginTotpVerificationPattern: /totp/i,
    oneTimeCodeLoginPattern: /one-time/i,
    resendVerificationCodePattern: /resend/i,
    invalidVerificationCodePattern: /invalid/i,
    isVisibleElement: () => true,
    isActionEnabled: () => true,
    getActionText,
    getAssociatedInputText: () => '',
    getPageTextSnapshot: () => '',
    authPageDetectors,
  });

  assert.equal(createPageWithAction(japaneseAction).findResendVerificationCodeTrigger(), japaneseAction);
  assert.equal(createPageWithAction(structuredAction).findResendVerificationCodeTrigger(), structuredAction);
});
