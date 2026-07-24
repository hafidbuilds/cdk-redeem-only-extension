const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const extensionRoot = path.resolve(__dirname, '..');

test('MV3 extension loads and sidepanel renders settings, accounts, and tasks', { timeout: 60000 }, async (t) => {
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    executablePath: process.env.CHROME_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    args: [
      `--disable-extensions-except=${extensionRoot}`,
      `--load-extension=${extensionRoot}`,
      '--no-sandbox',
    ],
  });
  t.after(async () => context.close());

  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
  }
  assert.ok(serviceWorker, 'MV3 service worker should start');
  const extensionId = new URL(serviceWorker.url()).host;
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
  await page.locator('#settings-card').waitFor({ state: 'visible', timeout: 15000 });
  assert.ok(await page.locator('#btn-config-menu').isVisible());
  assert.ok(await page.locator('#account-records-list').count());
  assert.ok(await page.locator('#account-task-list').count());

  const sendMessage = (message) => page.evaluate(async ({ payload, extensionId: targetExtensionId }) => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
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
  }, { payload: message, extensionId });
  const saveEnvelope = await sendMessage({
    type: 'SAVE_SETTING', source: 'sidepanel', payload: { autoStepDelaySeconds: 4 },
  });
  assert.equal(saveEnvelope?.lastError, '', JSON.stringify(saveEnvelope));
  assert.equal(saveEnvelope?.response?.ok, true, JSON.stringify(saveEnvelope));
  const stateEnvelope = await sendMessage({ type: 'GET_STATE', source: 'sidepanel' });
  assert.equal(stateEnvelope?.lastError, '', JSON.stringify(stateEnvelope));
  assert.equal(Number(stateEnvelope?.response?.autoStepDelaySeconds), 4, JSON.stringify(stateEnvelope));
  assert.deepEqual(errors, []);
});
