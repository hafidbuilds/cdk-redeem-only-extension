const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

globalThis.window = globalThis;
require('../content/signup-profile-page.js');

const { createSignupProfilePage } = globalThis.MultiPageSignupProfilePage;
const signupPageSource = fs.readFileSync(path.join(__dirname, '..', 'content', 'signup-page.js'), 'utf8');
const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

function createProfileFixture({ name = '', age = '', submitClickable = true } = {}) {
  const nameInput = { name: 'name', value: name };
  const ageInput = { name: 'age', value: age };
  const submitButton = {
    disabled: !submitClickable,
    clickCount: 0,
    click() {
      this.clickCount += 1;
    },
    closest() {
      return null;
    },
    getAttribute() {
      return null;
    },
  };
  const documentRef = {
    querySelector(selector) {
      const value = String(selector || '');
      if (value.includes('button[type="submit"]')) return submitButton;
      if (value.includes('input[name="name"]')) return nameInput;
      if (value.includes('input[name="age"]')) return ageInput;
      return null;
    },
    querySelectorAll(selector) {
      const value = String(selector || '');
      if (value.includes('[aria-invalid="true"]')) return [];
      if (value.includes('button')) return [submitButton];
      return [];
    },
  };
  const page = createSignupProfilePage({
    documentRef,
    locationRef: { href: 'https://auth.openai.com/u/signup/profile' },
    windowRef: {
      getComputedStyle() {
        return { opacity: '1', pointerEvents: 'auto' };
      },
    },
    getActionText: () => 'Finish creating account',
    fillInput: (element, value) => {
      element.value = String(value);
    },
    isActionEnabled: () => submitClickable,
    isVisibleElement: () => true,
    simulateClick: (element) => element.click(),
    sleep: async () => {},
  });
  return { ageInput, nameInput, page, submitButton };
}

test('step 5 state reports blank name and age fields as incomplete', () => {
  const { page } = createProfileFixture();
  const state = page.getStep5SubmitState();

  assert.equal(state.profileVisible, true);
  assert.equal(state.profileFieldsComplete, false);
  assert.deepEqual(state.incompleteProfileFields, ['name', 'age']);
});

test('step 5 recovery never submits while required profile fields are blank', async () => {
  const { page, submitButton } = createProfileFixture();
  const result = await page.submitProfilePage({ attempt: 1 });

  assert.equal(result.clicked, false);
  assert.equal(result.reason, 'profile_fields_incomplete');
  assert.equal(submitButton.clickCount, 0);
});

test('step 5 recovery may submit after name and age are populated', async () => {
  const { page, submitButton } = createProfileFixture({ name: 'Alex Chen', age: '24' });
  const result = await page.submitProfilePage({ attempt: 1 });

  assert.equal(result.profileFieldsComplete, true);
  assert.equal(result.clicked, true);
  assert.equal(submitButton.clickCount, 1);
});

test('step 5 refills name and age after a profile rerender clears them', async () => {
  const { ageInput, nameInput, page } = createProfileFixture();
  const result = await page.refillProfileTextFields({
    fullName: 'Alex Chen',
    age: 24,
  });

  assert.equal(nameInput.value, 'Alex Chen');
  assert.equal(ageInput.value, '24');
  assert.equal(result.profileFieldsComplete, true);
});

test('real step 5 flow refills cleared fields and background refuses blank-form resubmission', () => {
  assert.match(signupPageSource, /await refillProfileFields\(\);/);
  assert.match(signupPageSource, /waitForStep5SubmitOutcome\(\{ refillProfileFields \}\)/);
  assert.match(signupPageSource, /refillResult\?\.refilled/);
  assert.match(backgroundSource, /pageState\?\.profileFieldsComplete !== false/);
  assert.match(backgroundSource, /检测到资料字段为空/);
});
