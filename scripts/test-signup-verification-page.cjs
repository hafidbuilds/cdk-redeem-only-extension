const assert = require('node:assert/strict');
const test = require('node:test');

globalThis.self = globalThis;
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
