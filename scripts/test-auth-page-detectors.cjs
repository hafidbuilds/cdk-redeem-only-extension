const assert = require('node:assert/strict');
const test = require('node:test');

delete globalThis.MultiPageAuthPageDetectors;
const detectors = require('../content/auth-page-detectors.js');
globalThis.window = globalThis;
require('../content/signup-entry-page.js');
require('../content/signup-page-detector.js');
require('../content/signup-verification-page.js');

test('exports detector global and CommonJS API', () => {
  assert.equal(globalThis.MultiPageAuthPageDetectors, detectors);
  assert.equal(typeof detectors.normalizePageText, 'function');
});

test('recognizes Hindi auth labels', () => {
  assert.equal(detectors.isLoginEntryText('लॉग इन करें'), true);
  assert.equal(detectors.isContinueText('जारी रखें'), true);
  assert.equal(detectors.isResendEmailText('ईमेल दोबारा भेजें'), true);
});

test('does not treat Hindi plans/pricing as signup', () => {
  assert.equal(detectors.isSignupEntryText('प्लान्स और प्राइसिंग देखें'), false);
});

test('rejects non-auth action lookalikes', () => {
  assert.equal(detectors.isSignupEntryText('Registered devices'), false);
  assert.equal(detectors.isSignupEntryText('Registration status'), false);
  assert.equal(detectors.isSignupEntryText('View plans and pricing'), false);
  assert.equal(detectors.isSignupEntryText('प्लान्स और प्राइसिंग देखें'), false);
  assert.equal(detectors.isContinueText('Continue with Google'), false);
  assert.equal(detectors.isContinueText('Continue with Microsoft'), false);
  assert.equal(detectors.isResendEmailText('Resend marketing email'), false);
});

test('recognizes English auth labels', () => {
  assert.equal(detectors.isSignupEntryText('Sign up'), true);
  assert.equal(detectors.isLoginEntryText('Log in'), true);
  assert.equal(detectors.isContinueText('Continue'), true);
  assert.equal(detectors.isResendEmailText('Resend email'), true);
});

test('recognizes French ChatGPT home auth labels', () => {
  assert.equal(detectors.isSignupEntryText('Inscription gratuite'), true);
  assert.equal(detectors.isSignupEntryText("S'inscrire gratuitement"), true);
  assert.equal(detectors.isSignupEntryText('Voir les offres et les tarifs'), false);
  assert.equal(detectors.isLoginEntryText('Se connecter'), true);
});

test('recognizes auth URL detectors', () => {
  assert.equal(detectors.isPasswordPageUrl('https://auth.openai.com/create-account/password'), true);
  assert.equal(detectors.isPasswordPageUrl('https://auth.openai.com/u/signup/password'), true);
  assert.equal(detectors.isPasswordPageUrl('https://accounts.openai.com/u/login/password?state=abc'), true);
  assert.equal(detectors.isAboutYouUrl('https://auth.openai.com/about-you'), true);
  assert.equal(detectors.isSignupProfileUrl('https://accounts.openai.com/u/signup/profile?x=1'), true);
  assert.equal(detectors.isChatGptHomeUrl('https://chatgpt.com/'), true);
  assert.equal(detectors.isChatGptHomeUrl('https://chatgpt.com/auth/login'), false);
  assert.equal(detectors.isChatGptHomeUrl('https://chatgpt.com/create-account/start'), false);
  assert.equal(detectors.isChatGptHomeUrl('https://chatgpt.com/login'), false);
});

function makeAction(text, options = {}) {
  const {
    visible = true,
    enabled = true,
    attrs = {},
  } = options;
  return {
    textContent: text,
    value: '',
    disabled: !enabled,
    visible,
    tagName: 'BUTTON',
    getAttribute(name) {
      if (name === 'aria-disabled') return enabled ? 'false' : 'true';
      return attrs[name] || '';
    },
  };
}

function makeDocument(actions) {
  return {
    body: { textContent: '', innerText: '' },
    title: '',
    readyState: 'complete',
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return actions;
    },
  };
}

const domContext = {
  isVisibleElement: (el) => el?.visible !== false,
  isActionEnabled: (el) => Boolean(el && !el.disabled && el.getAttribute?.('aria-disabled') !== 'true'),
  getActionText: (el) => detectors.normalizePageText([el?.textContent, el?.value].filter(Boolean).join(' ')),
  getPageTextSnapshot: () => '',
};

test('signup entry helper uses shared auth detectors for candidates', () => {
  const registeredDevices = makeAction('Registered devices');
  const signup = makeAction('Sign up');
  const helper = globalThis.MultiPageSignupEntryPage.createSignupEntryPage({
    ...domContext,
    authPageDetectors: detectors,
    documentRef: makeDocument([registeredDevices, signup]),
    windowRef: { innerWidth: 1024, innerHeight: 768, outerWidth: 1024, outerHeight: 768 },
  });

  assert.equal(helper.findSignupEntryTrigger(), signup);
  assert.equal(helper.isSignupEntryTriggerText('Registered devices'), false);
});

test('signup entry helper ignores OAuth provider continue buttons', () => {
  const provider = makeAction('Continue with Google');
  const continueButton = makeAction('Continue');
  const helper = globalThis.MultiPageSignupEntryPage.createSignupEntryPage({
    ...domContext,
    authPageDetectors: detectors,
    documentRef: makeDocument([provider, continueButton]),
    windowRef: { innerWidth: 1024, innerHeight: 768, outerWidth: 1024, outerHeight: 768 },
  });

  assert.equal(helper.getSignupEmailContinueButton(), continueButton);
});

test('signup entry waits for the current email Continue button to become enabled', async () => {
  const continueButton = makeAction('Continue', { enabled: false });
  continueButton.getAttribute = function getAttribute(name) {
    if (name === 'aria-disabled') return this.disabled ? 'true' : 'false';
    return '';
  };
  let waitCount = 0;
  const helper = globalThis.MultiPageSignupEntryPage.createSignupEntryPage({
    ...domContext,
    authPageDetectors: detectors,
    documentRef: {
      ...makeDocument([continueButton]),
      querySelector() {
        return continueButton;
      },
    },
    windowRef: { innerWidth: 1024, innerHeight: 768, outerWidth: 1024, outerHeight: 768 },
    sleep: async () => {
      waitCount += 1;
      continueButton.disabled = false;
    },
  });

  const result = await helper.waitForEnabledSignupEmailContinueButton({
    timeout: 1000,
    pollInterval: 25,
  });

  assert.equal(result, continueButton);
  assert.equal(waitCount, 1);
});

test('signup entry poll hook can restore a rerendered email form before Continue enables', async () => {
  const continueButton = makeAction('Continue', { enabled: false });
  continueButton.getAttribute = function getAttribute(name) {
    if (name === 'aria-disabled') return this.disabled ? 'true' : 'false';
    return '';
  };
  let restored = false;
  const helper = globalThis.MultiPageSignupEntryPage.createSignupEntryPage({
    ...domContext,
    authPageDetectors: detectors,
    documentRef: {
      ...makeDocument([continueButton]),
      querySelector() { return continueButton; },
    },
    windowRef: { innerWidth: 1024, innerHeight: 768, outerWidth: 1024, outerHeight: 768 },
    sleep: async () => {},
  });

  const result = await helper.waitForEnabledSignupEmailContinueButton({
    timeout: 1000,
    pollInterval: 25,
    onPoll: async () => {
      restored = true;
      continueButton.disabled = false;
    },
  });

  assert.equal(restored, true);
  assert.equal(result, continueButton);
});

test('signup entry uses one Enter sequence and the form default submit without clicking', () => {
  const events = [];
  let requestSubmitCount = 0;
  const form = { requestSubmit() { requestSubmitCount += 1; } };
  const input = {
    form,
    visible: true,
    disabled: false,
    focus() { events.push('focus'); },
    dispatchEvent(event) { events.push(event.type); return true; },
    getAttribute(name) { return name === 'aria-disabled' ? 'false' : ''; },
  };
  class FakeKeyboardEvent {
    constructor(type, init) {
      this.type = type;
      this.key = init.key;
      this.code = init.code;
    }
  }
  const helper = globalThis.MultiPageSignupEntryPage.createSignupEntryPage({
    ...domContext,
    authPageDetectors: detectors,
    documentRef: makeDocument([]),
    windowRef: {
      innerWidth: 1024,
      innerHeight: 768,
      outerWidth: 1024,
      outerHeight: 768,
      KeyboardEvent: FakeKeyboardEvent,
    },
  });

  assert.equal(helper.submitSignupEmailWithEnter(input), true);
  assert.deepEqual(events, ['focus', 'keydown', 'keypress', 'keyup']);
  assert.equal(requestSubmitCount, 1);
});

test('page detector and verification helper use shared action detectors', () => {
  const provider = makeAction('Continue with Google');
  const continueButton = makeAction('Continue');
  const pageDetector = globalThis.MultiPageSignupPageDetector.createSignupPageDetector({
    authPageDetectors: detectors,
    documentRef: makeDocument([provider, continueButton]),
    locationRef: { href: 'https://auth.openai.com/', pathname: '/' },
    getSignupDomUtils: () => domContext,
    getSignupVerificationPageHelpers: () => ({}),
  });
  assert.equal(pageDetector.findContinueButton(), continueButton);

  const marketing = makeAction('Resend marketing email');
  const resend = makeAction('Resend email');
  const verification = globalThis.MultiPageSignupVerificationPage.createSignupVerificationPage({
    ...domContext,
    authPageDetectors: detectors,
    documentRef: makeDocument([marketing, resend]),
    locationRef: { pathname: '/email-verification' },
    verificationCodeInputSelector: 'input[name="code"]',
    loginTotpVerificationPattern: /totp/i,
    oneTimeCodeLoginPattern: /one-time/i,
    resendVerificationCodePattern: /resend/i,
    invalidVerificationCodePattern: /invalid/i,
    getAssociatedInputText: () => '',
  });
  assert.equal(verification.findResendVerificationCodeTrigger(), resend);
});

test('signup password switch prefers the create-account password href and rejects login password links', () => {
  const loginPassword = makeAction('Continue with password', {
    attrs: { href: 'https://auth.openai.com/log-in/password' },
  });
  const signupPassword = makeAction('Use another method', {
    attrs: { href: 'https://auth.openai.com/create-account/password' },
  });
  const pageDetector = globalThis.MultiPageSignupPageDetector.createSignupPageDetector({
    authPageDetectors: detectors,
    documentRef: makeDocument([loginPassword, signupPassword]),
    locationRef: { href: 'https://auth.openai.com/email-verification', pathname: '/email-verification' },
    getSignupDomUtils: () => domContext,
    getSignupVerificationPageHelpers: () => ({}),
  });

  assert.equal(pageDetector.findSignupPasswordSwitchTrigger(), signupPassword);
  assert.equal(pageDetector.findLoginPasswordSwitchTrigger(), loginPassword);
});

test('login password switch is classified separately and never becomes signup password creation', () => {
  const loginPassword = makeAction('Continuer avec un mot de passe', {
    attrs: { href: 'https://auth.openai.com/log-in/password' },
  });
  const pageDetector = globalThis.MultiPageSignupPageDetector.createSignupPageDetector({
    authPageDetectors: detectors,
    documentRef: makeDocument([loginPassword]),
    locationRef: { href: 'https://auth.openai.com/email-verification', pathname: '/email-verification' },
    getSignupDomUtils: () => domContext,
    getSignupVerificationPageHelpers: () => ({}),
  });

  assert.equal(pageDetector.findSignupPasswordSwitchTrigger(), null);
  assert.equal(pageDetector.findLoginPasswordSwitchTrigger(), loginPassword);
});

test('signup password switch recognizes supported localized labels without a href', () => {
  for (const label of [
    '使用密码继续',
    'Continue with password',
    'パスワードで続行',
    'पासवर्ड से जारी रखें',
  ]) {
    const action = makeAction(label);
    const pageDetector = globalThis.MultiPageSignupPageDetector.createSignupPageDetector({
      authPageDetectors: detectors,
      documentRef: makeDocument([action]),
      locationRef: { href: 'https://auth.openai.com/email-verification', pathname: '/email-verification' },
      getSignupDomUtils: () => domContext,
      getSignupVerificationPageHelpers: () => ({}),
    });

    assert.equal(pageDetector.findSignupPasswordSwitchTrigger(), action, label);
  }
});

test('signup password switch recognizes the French verification-page label without a href', () => {
  const action = makeAction('Continuer avec un mot de passe');
  const pageDetector = globalThis.MultiPageSignupPageDetector.createSignupPageDetector({
    authPageDetectors: detectors,
    documentRef: makeDocument([action]),
    locationRef: { href: 'https://auth.openai.com/email-verification', pathname: '/email-verification' },
    getSignupDomUtils: () => domContext,
    getSignupVerificationPageHelpers: () => ({}),
  });

  assert.equal(pageDetector.findSignupPasswordSwitchTrigger(), action);
});

test('signup password switch matches individual fields when accessible text is duplicated', () => {
  const label = 'Continuer avec un mot de passe';
  const action = makeAction(label, {
    attrs: {
      'aria-label': label,
      'data-dd-action-name': 'continue-with-password',
    },
  });
  const pageDetector = globalThis.MultiPageSignupPageDetector.createSignupPageDetector({
    authPageDetectors: detectors,
    documentRef: makeDocument([action]),
    locationRef: { href: 'https://auth.openai.com/email-verification', pathname: '/email-verification' },
    getSignupDomUtils: () => ({
      ...domContext,
      getActionText: (el) => [
        el?.textContent,
        el?.getAttribute?.('aria-label'),
      ].filter(Boolean).join(' '),
    }),
    getSignupVerificationPageHelpers: () => ({}),
  });

  assert.equal(pageDetector.findSignupPasswordSwitchTrigger(), action);
});

test('signup password switch can report a visible disabled candidate without clicking it', () => {
  const action = makeAction('Continuer avec un mot de passe', { enabled: false });
  const pageDetector = globalThis.MultiPageSignupPageDetector.createSignupPageDetector({
    authPageDetectors: detectors,
    documentRef: makeDocument([action]),
    locationRef: { href: 'https://auth.openai.com/email-verification', pathname: '/email-verification' },
    getSignupDomUtils: () => domContext,
    getSignupVerificationPageHelpers: () => ({}),
  });

  assert.equal(pageDetector.findSignupPasswordSwitchTrigger(), null);
  assert.equal(pageDetector.findSignupPasswordSwitchTrigger({ allowDisabled: true }), action);
});

test('signup password switch resolves a French text leaf to its clickable parent', () => {
  const action = makeAction('');
  const textLeaf = {
    textContent: 'Continuer avec un mot de passe',
    value: '',
    visible: true,
    getAttribute: () => '',
    closest: () => action,
  };
  const documentRef = makeDocument([]);
  documentRef.body.innerText = 'Code\nContinuer\nContinuer avec un mot de passe';
  documentRef.querySelectorAll = (selector) => selector === '*' ? [textLeaf] : [];
  const pageDetector = globalThis.MultiPageSignupPageDetector.createSignupPageDetector({
    authPageDetectors: detectors,
    documentRef,
    locationRef: { href: 'https://auth.openai.com/email-verification', pathname: '/email-verification' },
    getSignupDomUtils: () => domContext,
    getSignupVerificationPageHelpers: () => ({}),
  });

  assert.equal(pageDetector.findSignupPasswordSwitchTrigger(), action);
  assert.equal(pageDetector.hasSignupPasswordSwitchTextHint(), true);
});

test('signup password switch tolerates invisible Unicode and extra wrapper text', () => {
  const action = makeAction('');
  const textWrapper = {
    textContent: 'OU  Continuer avec un \u200emot de passe  Conditions d’utilisation',
    innerText: 'OU  Continuer avec un \u200emot de passe  Conditions d’utilisation',
    value: '',
    visible: true,
    getAttribute: () => '',
    closest: () => null,
    matches: () => false,
    querySelectorAll: () => [action],
  };
  const documentRef = makeDocument([]);
  documentRef.body.innerText = 'Code Continuer Renvoyer un e-mail OU Continuer avec un mot de passe Conditions d’utilisation';
  documentRef.querySelectorAll = (selector) => {
    if (selector === '*') return [textWrapper, action];
    if (selector === 'span, p, label, div, strong, small') return [textWrapper];
    return [];
  };
  const pageDetector = globalThis.MultiPageSignupPageDetector.createSignupPageDetector({
    authPageDetectors: detectors,
    documentRef,
    locationRef: { href: 'https://auth.openai.com/email-verification', pathname: '/email-verification' },
    getSignupDomUtils: () => domContext,
    getSignupVerificationPageHelpers: () => ({}),
  });

  assert.equal(pageDetector.findSignupPasswordSwitchTrigger(), action);
  assert.equal(pageDetector.hasSignupPasswordSwitchTextHint(), true);
});

test('signup password switch searches an open shadow root', () => {
  const action = makeAction('Continuer avec un mot de passe');
  const shadowRoot = {
    textContent: 'Continuer avec un mot de passe',
    querySelectorAll(selector) {
      if (selector === '*') return [action];
      return selector.includes('button') ? [action] : [];
    },
  };
  const shadowHost = { shadowRoot };
  const documentRef = makeDocument([]);
  documentRef.querySelectorAll = (selector) => selector === '*' ? [shadowHost] : [];
  const pageDetector = globalThis.MultiPageSignupPageDetector.createSignupPageDetector({
    authPageDetectors: detectors,
    documentRef,
    locationRef: { href: 'https://auth.openai.com/email-verification', pathname: '/email-verification' },
    getSignupDomUtils: () => domContext,
    getSignupVerificationPageHelpers: () => ({}),
  });

  assert.equal(pageDetector.findSignupPasswordSwitchTrigger(), action);
  assert.equal(pageDetector.hasSignupPasswordSwitchTextHint(), true);
});

test('signup password switch scans an unlisted text tag and resolves its clickable parent', () => {
  const action = makeAction('');
  const customText = {
    tagName: 'SLOT',
    textContent: 'Continuer avec un mot de passe',
    innerText: 'Continuer avec un mot de passe',
    value: '',
    visible: true,
    parentElement: action,
    getAttribute: () => '',
    closest: () => action,
    matches: () => false,
    querySelectorAll: () => [],
  };
  const documentRef = makeDocument([]);
  documentRef.querySelectorAll = (selector) => selector === '*' ? [customText, action] : [];
  const pageDetector = globalThis.MultiPageSignupPageDetector.createSignupPageDetector({
    authPageDetectors: detectors,
    documentRef,
    locationRef: { href: 'https://auth.openai.com/email-verification', pathname: '/email-verification' },
    getSignupDomUtils: () => domContext,
    getSignupVerificationPageHelpers: () => ({}),
  });

  assert.equal(pageDetector.findSignupPasswordSwitchTrigger(), action);
});

test('signup password switch accepts a zero-size action with a visible rendered descendant', () => {
  const visibleText = {
    tagName: 'SPAN',
    textContent: 'Continuer avec un mot de passe',
    innerText: 'Continuer avec un mot de passe',
    value: '',
    visible: true,
    getAttribute: () => '',
    querySelectorAll: () => [],
  };
  const action = makeAction('Continuer avec un mot de passe', { visible: false });
  action.matches = () => true;
  action.querySelectorAll = (selector) => selector === '*' ? [visibleText] : [];
  visibleText.parentElement = action;
  visibleText.closest = () => action;
  const documentRef = makeDocument([]);
  documentRef.querySelectorAll = (selector) => selector === '*' ? [action, visibleText] : [action];
  const pageDetector = globalThis.MultiPageSignupPageDetector.createSignupPageDetector({
    authPageDetectors: detectors,
    documentRef,
    locationRef: { href: 'https://auth.openai.com/email-verification', pathname: '/email-verification' },
    getSignupDomUtils: () => domContext,
    getSignupVerificationPageHelpers: () => ({}),
  });

  assert.equal(pageDetector.findSignupPasswordSwitchTrigger(), action);
  const diagnostic = pageDetector.buildSignupPasswordSwitchDiagnostic();
  assert.equal(diagnostic.candidateCount > 0, true);
  assert.equal(diagnostic.candidates[0].actionRepresented, true);
  assert.equal(Object.hasOwn(diagnostic.candidates[0], 'text'), false);
});

test('verification helper falls back to visible Resend email text nodes', () => {
  const clickableParent = makeAction('', { attrs: { role: 'button' } });
  const resendText = {
    textContent: 'Resend email',
    value: '',
    visible: true,
    disabled: false,
    getAttribute(name) {
      return name === 'aria-disabled' ? 'false' : '';
    },
    closest() {
      return clickableParent;
    },
  };
  const verification = globalThis.MultiPageSignupVerificationPage.createSignupVerificationPage({
    ...domContext,
    authPageDetectors: detectors,
    documentRef: {
      ...makeDocument([]),
      querySelectorAll(selector) {
        return String(selector || '').includes('span') ? [resendText] : [];
      },
    },
    locationRef: { pathname: '/email-verification' },
    verificationCodeInputSelector: 'input[name="code"]',
    loginTotpVerificationPattern: /totp/i,
    oneTimeCodeLoginPattern: /one-time/i,
    resendVerificationCodePattern: /resend/i,
    invalidVerificationCodePattern: /invalid/i,
    getAssociatedInputText: () => '',
  });

  assert.equal(verification.findResendVerificationCodeTrigger(), clickableParent);
});
