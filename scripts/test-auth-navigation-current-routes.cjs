const assert = require('node:assert/strict');
const test = require('node:test');

require('../background/navigation-utils.js');

const navigation = globalThis.MultiPageBackgroundNavigationUtils.createNavigationUtils({});

test('navigation recognizes current OpenAI signup password and verification routes', () => {
  assert.equal(navigation.isSignupPasswordPageUrl('https://auth.openai.com/u/signup/password'), true);
  assert.equal(navigation.isSignupPasswordPageUrl('https://accounts.openai.com/u/login/password?state=abc'), true);
  assert.equal(navigation.isSignupEmailVerificationPageUrl('https://auth.openai.com/u/email-verification'), true);
  assert.equal(navigation.isSignupEmailVerificationPageUrl('https://accounts.openai.com/email-verification?state=abc'), true);
});

test('navigation never treats ChatGPT authentication routes as logged-in destinations', () => {
  assert.equal(navigation.isLikelyLoggedInChatgptHomeUrl('https://chatgpt.com/'), true);
  assert.equal(navigation.isLikelyLoggedInChatgptHomeUrl('https://chatgpt.com/auth/login'), false);
  assert.equal(navigation.isLikelyLoggedInChatgptHomeUrl('https://chatgpt.com/create-account/start'), false);
  assert.equal(navigation.isLikelyLoggedInChatgptHomeUrl('https://chatgpt.com/login'), false);
});
