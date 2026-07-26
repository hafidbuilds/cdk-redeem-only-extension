const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');

const extensionRoot = path.resolve(__dirname, '..');
const launchAttempts = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function launchIsolatedBrowser() {
  assert.equal(
    process.env.PUPPETEER_EXECUTABLE_PATH,
    undefined,
    'E2E must use Puppeteer-managed Chrome for Testing, not a system browser override',
  );

  let lastError;
  for (let attempt = 1; attempt <= launchAttempts; attempt += 1) {
    try {
      const browser = await puppeteer.launch({
        headless: true,
        pipe: true,
        args: ['--no-sandbox'],
        enableExtensions: [extensionRoot],
      });
      return { browser, attempt };
    } catch (error) {
      lastError = error;
      if (attempt < launchAttempts) await sleep(1000);
    }
  }

  throw new Error(
    `Chrome for Testing failed to start after ${launchAttempts} attempts: ${lastError?.message || lastError}`,
    { cause: lastError },
  );
}

test('isolated Chrome for Testing loads MV3 extension and sidepanel', { timeout: 90000 }, async (t) => {
  const executablePath = await puppeteer.executablePath();
  const { browser, attempt } = await launchIsolatedBrowser();
  t.after(async () => browser.close());

  const serviceWorker = await browser.waitForTarget(
    (target) => target.type() === 'service_worker' && target.url().endsWith('/background.js'),
    { timeout: 30000 },
  );
  assert.ok(serviceWorker, 'MV3 service worker should start');

  const extensionId = new URL(serviceWorker.url()).host;
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });
  await page.waitForSelector('#settings-card', { visible: true, timeout: 15000 });

  const controls = await page.evaluate(() => ({
    configMenu: Boolean(document.querySelector('#btn-config-menu')),
    failureDiagnostics: Boolean(document.querySelector('#btn-export-failure-diagnostics')),
    accountRecords: Boolean(document.querySelector('#account-records-list')),
    accountTasks: Boolean(document.querySelector('#account-task-list')),
    existingTotpLogin: Boolean(document.querySelector('.step-btn[data-node-id="existing-totp-login"]')),
    existingTotpLoginDisabled: document.querySelector('.step-btn[data-node-id="existing-totp-login"]')?.disabled === true,
  }));
  assert.deepEqual(controls, {
    configMenu: true,
    failureDiagnostics: true,
    accountRecords: true,
    accountTasks: true,
    existingTotpLogin: true,
    existingTotpLoginDisabled: true,
  });

  const sendMessage = (message) => page.evaluate(async ({ payload, targetExtensionId }) => {
    for (let messageAttempt = 0; messageAttempt < 20; messageAttempt += 1) {
      try {
        const response = await Promise.race([
          chrome.runtime.sendMessage(targetExtensionId, payload),
          new Promise((resolve) => setTimeout(() => resolve({ error: 'E2E_MESSAGE_TIMEOUT' }), 1000)),
        ]);
        if (response?.error !== 'E2E_MESSAGE_TIMEOUT') return { response, lastError: '' };
      } catch (error) {
        return { response: null, lastError: String(error?.message || error) };
      }
    }
    return { response: { error: 'E2E_MESSAGE_TIMEOUT' }, lastError: '' };
  }, { payload: message, targetExtensionId: extensionId });

  const saveEnvelope = await sendMessage({
    type: 'SAVE_SETTING', source: 'sidepanel', payload: { autoStepDelaySeconds: 4 },
  });
  assert.equal(saveEnvelope?.lastError, '', JSON.stringify(saveEnvelope));
  assert.equal(saveEnvelope?.response?.ok, true, JSON.stringify(saveEnvelope));

  const stateEnvelope = await sendMessage({ type: 'GET_STATE', source: 'sidepanel' });
  assert.equal(stateEnvelope?.lastError, '', JSON.stringify(stateEnvelope));
  assert.equal(Number(stateEnvelope?.response?.autoStepDelaySeconds), 4, JSON.stringify(stateEnvelope));

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value) => { window.__copiedFailureDiagnostics = String(value || ''); },
      },
    });
  });

  await page.click('#btn-config-menu');
  await page.click('#btn-export-failure-diagnostics');
  await page.waitForFunction(
    () => [...document.querySelectorAll('.toast-success .toast-msg')]
      .some((node) => node.textContent?.includes('已导出至剪贴板')),
    { timeout: 5000 },
  );

  const copiedDiagnostics = await page.evaluate(() => window.__copiedFailureDiagnostics || '');
  const diagnosticPayload = JSON.parse(copiedDiagnostics);
  assert.equal(diagnosticPayload.schemaVersion, 1);
  assert.equal(diagnosticPayload.scope, 'latest-failure');
  assert.ok(Array.isArray(diagnosticPayload.logWindow.entries));
  assert.equal(typeof diagnosticPayload.verificationInput.detected, 'boolean');
  assert.deepEqual(errors, []);

  const settingsPage = await browser.newPage();
  await settingsPage.setContent(`
    <section id="security-panel">
      <div id="password-row"><span>Password</span><span>Add</span><svg aria-label="Open password settings"></svg></div>
      <div id="passkey-row"><span>Security keys &amp; passkeys</span><span>Add</span></div>
    </section>
  `);
  await settingsPage.addScriptTag({
    content: fs.readFileSync(path.join(extensionRoot, 'content', 'signup-session-page.js'), 'utf8'),
  });
  const passwordAction = await settingsPage.evaluate(() => {
    const passwordRow = document.querySelector('#password-row');
    const passkeyRow = document.querySelector('#passkey-row');
    let bubbledClicks = 0;
    passwordRow.addEventListener('click', () => { bubbledClicks += 1; });
    const helper = self.MultiPageSignupSessionPage.createSignupSessionPage({
      documentRef: document,
      locationRef: location,
      getActionText: (element) => element.textContent || '',
      isVisibleElement: () => true,
      isActionEnabled: () => true,
    });
    const action = helper.findChatGptSettingsPasswordAction();
    action?.click();
    return {
      foundInsidePasswordRow: Boolean(action && passwordRow.contains(action)),
      foundInsidePasskeyRow: Boolean(action && passkeyRow.contains(action)),
      bubbledClicks,
    };
  });
  assert.deepEqual(passwordAction, {
    foundInsidePasswordRow: true,
    foundInsidePasskeyRow: false,
    bubbledClicks: 1,
  });

  console.log(JSON.stringify({
    browser: await browser.version(),
    executablePath,
    profile: 'temporary-isolated',
    transport: 'pipe',
    launchAttempt: attempt,
  }));
});
