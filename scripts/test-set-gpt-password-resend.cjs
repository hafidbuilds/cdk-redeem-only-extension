const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'background', 'steps', 'set-gpt-password.js'),
  'utf8'
);
const contentSource = fs.readFileSync(
  path.join(__dirname, '..', 'content', 'signup-page.js'),
  'utf8'
);

function readNumericConstant(name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*(\\d+)`));
  assert.ok(match, `${name} should be declared as a numeric constant`);
  return Number(match[1]);
}

test('set GPT password resend waits long enough for page readiness and button click', () => {
  const buttonTimeout = readNumericConstant('PASSWORD_SETUP_RESEND_BUTTON_TIMEOUT_MS');
  const messageTimeout = readNumericConstant('PASSWORD_SETUP_RESEND_MESSAGE_TIMEOUT_MS');

  assert.ok(buttonTimeout >= 20000, 'resend button timeout should tolerate OpenAI page transitions');
  assert.ok(messageTimeout >= buttonTimeout + 15000, 'message timeout should cover readiness wait plus button wait');
  assert.match(source, /nodeId:\s*'set-gpt-password'/);
  assert.match(source, /resendTimeoutMs:\s*PASSWORD_SETUP_RESEND_BUTTON_TIMEOUT_MS/);
});

test('set GPT password supports the new settings fallback and inline success state', () => {
  assert.match(contentSource, /resetEntryMissing:\s*true/);
  assert.match(contentSource, /resetEntryClickFailed:\s*true/);
  assert.match(contentSource, /resolveChatGptSettingsPasswordClickable/);
  assert.match(contentSource, /element\.querySelectorAll\?\.\(actionableSelector\)/);
  assert.match(contentSource, /state:\s*'password_updated_page'/);
  assert.match(source, /prepareResult\?\.resetEntryMissing\s*\|\|\s*prepareResult\?\.resetEntryClickFailed/);
  assert.match(source, /isPasswordUpdatedPageState\(pageState\)/);
});
