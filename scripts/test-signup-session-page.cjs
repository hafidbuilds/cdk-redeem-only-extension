const assert = require('node:assert/strict');
const test = require('node:test');

globalThis.self = globalThis;
require('../content/signup-session-page.js');

const { createSignupSessionPage } = globalThis.MultiPageSignupSessionPage;

function createElement(tagName, text = '', attributes = {}) {
  const element = {
    tagName: String(tagName || 'div').toUpperCase(),
    textContent: text,
    childNodes: text ? [{ nodeType: 3, nodeValue: text }] : [],
    children: [],
    parentElement: null,
    attributes: { ...attributes },
    disabled: false,
    append(...children) {
      children.forEach((child) => {
        child.parentElement = this;
        this.children.push(child);
      });
      this.textContent = `${this.childNodes.map((node) => node.nodeValue || '').join(' ')} ${this.children.map((child) => child.textContent).join(' ')}`.trim();
      return this;
    },
    contains(candidate) {
      return candidate === this || this.children.some((child) => child.contains(candidate));
    },
    getAttribute(name) {
      return this.attributes[name] ?? null;
    },
    matches(selector) {
      const selectors = String(selector || '').split(',').map((value) => value.trim());
      return selectors.some((value) => (
        value === this.tagName.toLowerCase()
        || (value === '[role="button"]' && this.attributes.role === 'button')
        || (value === '[role="link"]' && this.attributes.role === 'link')
        || (value === '[tabindex]' && this.attributes.tabindex != null)
      ));
    },
    querySelectorAll(selector) {
      const results = [];
      const visit = (candidate) => {
        if (candidate.matches(selector)) results.push(candidate);
        candidate.children.forEach(visit);
      };
      this.children.forEach(visit);
      return results;
    },
  };
  return element;
}

function createSettingsFixture() {
  const passwordLabel = createElement('span', 'Password');
  const passwordAdd = createElement('span', 'Add');
  const passwordArrow = createElement('svg', '', { 'aria-label': 'Open password settings' });
  const passwordRow = createElement('div', '', { 'data-testid': 'password-row' })
    .append(passwordLabel, passwordAdd, passwordArrow);
  const passkeyRow = createElement('div', '', { 'data-testid': 'passkey-row' })
    .append(createElement('span', 'Security keys & passkeys'), createElement('span', 'Add'));
  const panel = createElement('section').append(passwordRow, passkeyRow);
  const all = [panel, passwordRow, passwordLabel, passwordAdd, passwordArrow, passkeyRow, ...passkeyRow.children];
  const documentRef = {
    querySelectorAll() {
      return all;
    },
  };
  const page = createSignupSessionPage({
    documentRef,
    locationRef: { href: 'https://chatgpt.com/#settings/Security' },
    getActionText: (element) => element.textContent || '',
    isVisibleElement: () => true,
    isActionEnabled: (element) => !element.disabled,
  });
  return { page, panel, passkeyRow, passwordLabel, passwordRow };
}

test('step 6 finds a visible Password span even when its parent panel also contains passkeys', () => {
  const { page, passwordLabel, passwordRow } = createSettingsFixture();

  const action = page.findChatGptSettingsPasswordAction();

  assert.ok(action === passwordRow || action === passwordLabel);
  assert.ok(passwordRow.contains(action));
});

test('step 6 never selects the Security keys and passkeys row as the Password action', () => {
  const { page, passkeyRow } = createSettingsFixture();

  const action = page.findChatGptSettingsPasswordAction();

  assert.notEqual(action, passkeyRow);
  assert.equal(passkeyRow.contains(action), false);
});

test('step 6 can bubble a click from an exact Password leaf to a plain React row', () => {
  const { page, passwordLabel, passwordRow } = createSettingsFixture();

  const action = page.resolveChatGptSettingsPasswordClickable(passwordLabel);

  assert.ok(action === passwordRow || action === passwordLabel);
});
