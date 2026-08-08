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
  await page.setViewport({ width: 1440, height: 1400 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto(`chrome-extension://${extensionId}/sidepanel/sidepanel.html`, {
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  });
  await page.waitForSelector('#settings-card', { visible: true, timeout: 15000 });
  await page.waitForSelector('[data-upi-membership-section="free"]', { timeout: 15000 });
  await page.waitForSelector('[data-upi-membership-section="free-ineligible"]', { timeout: 15000 });

  const controls = await page.evaluate(() => ({
    configMenu: Boolean(document.querySelector('#btn-config-menu')),
    failureDiagnostics: Boolean(document.querySelector('#btn-export-failure-diagnostics')),
    accountRecords: Boolean(document.querySelector('#upi-credential-membership-check-results')),
    freeGroups: [...document.querySelectorAll('[data-upi-membership-section]')]
      .map((node) => node.getAttribute('data-upi-membership-section')),
    accountTasks: Boolean(document.querySelector('#account-task-list')),
    accountTaskClear: Boolean(document.querySelector('#btn-clear-account-tasks')),
    existingTotpLogin: Boolean(document.querySelector('.step-btn[data-node-id="existing-totp-login"]')),
    existingTotpLoginDisabled: document.querySelector('.step-btn[data-node-id="existing-totp-login"]')?.disabled === true,
    finalStepSkipButton: Boolean(document.querySelector('.step-row[data-step="10"] .step-manual-btn')),
    exportCredentialModes: [...document.querySelectorAll('[data-free-account-export-credential-mode]')]
      .map((node) => node.value),
    commonActionGroups: [...document.querySelectorAll('[data-free-account-common-actions]')]
      .map((node) => node.getAttribute('data-free-account-common-actions')),
    freeOnlyActionGroups: [...document.querySelectorAll('[data-free-account-group-actions]')]
      .map((node) => node.getAttribute('data-free-account-group-actions')),
    sessionFillGroups: [...document.querySelectorAll('[data-free-account-fill-session]')]
      .map((node) => node.getAttribute('data-free-account-fill-session')),
    onlineTools: [...document.querySelectorAll('[data-online-tool]')].map((node) => ({
      tool: node.getAttribute('data-online-tool'),
      href: node.href,
      target: node.target,
      rel: node.rel,
      displayed: Boolean(node.offsetParent),
    })),
  }));
  assert.deepEqual(controls, {
    configMenu: true,
    failureDiagnostics: true,
    accountRecords: true,
    freeGroups: ['free', 'free-ineligible'],
    accountTasks: true,
    accountTaskClear: true,
    existingTotpLogin: true,
    existingTotpLoginDisabled: true,
    finalStepSkipButton: false,
    exportCredentialModes: ['access-token', 'access-token'],
    commonActionGroups: ['free', 'free-ineligible'],
    freeOnlyActionGroups: ['free'],
    sessionFillGroups: ['free', 'free-ineligible'],
    onlineTools: [
      {
        tool: 'gcash',
        href: 'https://gcash.20000408.xyz/',
        target: '_blank',
        rel: 'noopener noreferrer',
        displayed: true,
      },
      {
        tool: 'cdk',
        href: 'https://cdk.334401.xyz/',
        target: '_blank',
        rel: 'noopener noreferrer',
        displayed: true,
      },
    ],
  });

  await page.evaluate(async () => {
    const state = await chrome.runtime.sendMessage({ type: 'GET_STATE', source: 'sidepanel' });
    const saved = await chrome.runtime.sendMessage({
      type: 'SAVE_SETTING',
      source: 'sidepanel',
      payload: { registrationFreeRoute: 'no-2fa-free' },
    });
    if (saved?.error) {
      throw new Error(saved.error);
    }
    await chrome.storage.session.set({
      registrationFreeRoute: 'full-2fa',
      currentNodeId: 'persist-no-2fa-free',
      nodeStatuses: {
        ...(state?.nodeStatuses || {}),
        'fetch-gpt-password-code': 'skipped',
        'set-gpt-password': 'skipped',
        'persist-no-2fa-free': 'pending',
      },
    });
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('#select-registration-free-route')?.value === 'no-2fa-free');
  await page.waitForSelector('.step-row[data-node-id="persist-no-2fa-free"]');
  await page.select('#select-registration-free-route', 'full-2fa');
  await page.waitForSelector('.step-row[data-node-id="enable-totp-mfa"]');
  const full2faRouteReset = await page.evaluate(() => ({
    step7Class: document.querySelector('.step-row[data-node-id="fetch-gpt-password-code"]')?.className || '',
    step8Class: document.querySelector('.step-row[data-node-id="set-gpt-password"]')?.className || '',
    displayStatus: document.querySelector('#display-status')?.textContent || '',
    hasNo2faSaveNode: Boolean(document.querySelector('.step-row[data-node-id="persist-no-2fa-free"]')),
    hasFull2faFactorNode: Boolean(document.querySelector('.step-row[data-node-id="enable-totp-mfa"]')),
  }));
  assert.equal(full2faRouteReset.hasNo2faSaveNode, false, JSON.stringify(full2faRouteReset));
  assert.equal(full2faRouteReset.hasFull2faFactorNode, true, JSON.stringify(full2faRouteReset));
  assert.doesNotMatch(full2faRouteReset.step7Class, /\bskipped\b|\broute-skipped\b/, JSON.stringify(full2faRouteReset));
  assert.doesNotMatch(full2faRouteReset.step8Class, /\bskipped\b|\broute-skipped\b/, JSON.stringify(full2faRouteReset));
  assert.doesNotMatch(full2faRouteReset.displayStatus, /persist-no-2fa-free/, JSON.stringify(full2faRouteReset));
  await page.waitForFunction(async () => {
    const state = await chrome.runtime.sendMessage({ type: 'GET_STATE', source: 'sidepanel' });
    return state?.registrationFreeRoute === 'full-2fa'
      && state?.currentNodeId === ''
      && state?.nodeStatuses?.['fetch-gpt-password-code'] === 'pending'
      && state?.nodeStatuses?.['set-gpt-password'] === 'pending'
      && state?.nodeStatuses?.['enable-totp-mfa'] === 'pending'
      && !Object.hasOwn(state?.nodeStatuses || {}, 'security-factor-not-required');
  }, { timeout: 15000 });
  const persistedFull2faRouteReset = await page.evaluate(async () => {
    const state = await chrome.runtime.sendMessage({ type: 'GET_STATE', source: 'sidepanel' });
    return {
      registrationFreeRoute: state?.registrationFreeRoute || '',
      currentNodeId: state?.currentNodeId || '',
      nodeStatuses: state?.nodeStatuses || {},
    };
  });
  assert.equal(persistedFull2faRouteReset.registrationFreeRoute, 'full-2fa', JSON.stringify(persistedFull2faRouteReset));
  assert.equal(persistedFull2faRouteReset.currentNodeId, '', JSON.stringify(persistedFull2faRouteReset));
  assert.equal(persistedFull2faRouteReset.nodeStatuses['fetch-gpt-password-code'], 'pending', JSON.stringify(persistedFull2faRouteReset));
  assert.equal(persistedFull2faRouteReset.nodeStatuses['set-gpt-password'], 'pending', JSON.stringify(persistedFull2faRouteReset));
  assert.equal(persistedFull2faRouteReset.nodeStatuses['enable-totp-mfa'], 'pending', JSON.stringify(persistedFull2faRouteReset));
  assert.equal(Object.hasOwn(persistedFull2faRouteReset.nodeStatuses, 'security-factor-not-required'), false, JSON.stringify(persistedFull2faRouteReset));

  await page.select('[data-free-account-export-credential-mode]', 'session');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-free-account-export-credential-mode]')]
    .every((node) => node.value === 'session'));

  const darkExportSelectStyle = await page.evaluate(() => {
    const root = document.documentElement;
    const previousTheme = root.dataset.theme;
    root.dataset.theme = 'dark';
    const select = document.querySelector('[data-free-account-export-credential-mode]');
    const option = select?.querySelector('option[value="session"]');
    const selectStyle = select ? getComputedStyle(select) : null;
    const optionStyle = option ? getComputedStyle(option) : null;
    const result = {
      colorScheme: selectStyle?.colorScheme || '',
      optionColor: optionStyle?.color || '',
      optionBackground: optionStyle?.backgroundColor || '',
    };
    if (previousTheme) root.dataset.theme = previousTheme;
    else delete root.dataset.theme;
    return result;
  });
  assert.equal(darkExportSelectStyle.colorScheme, 'dark');
  assert.equal(darkExportSelectStyle.optionColor, 'rgb(237, 245, 243)');
  assert.equal(darkExportSelectStyle.optionBackground, 'rgb(29, 39, 42)');

  const accountRecordsOpener = await page.evaluate(() => {
    const node = document.querySelector('#btn-open-account-records');
    const rect = node?.getBoundingClientRect();
    return {
      viewportHeight: window.innerHeight,
      top: rect?.top ?? Infinity,
      width: rect?.width ?? 0,
      height: rect?.height ?? 0,
      displayed: Boolean(node?.offsetParent),
    };
  });
  assert.ok(
    accountRecordsOpener.displayed
      && accountRecordsOpener.width > 0
      && accountRecordsOpener.height > 0
      && accountRecordsOpener.top >= 0
      && accountRecordsOpener.top < accountRecordsOpener.viewportHeight,
    `Free account entry should be discoverable in the initial sidepanel viewport: ${JSON.stringify(accountRecordsOpener)}`,
  );

  await page.setViewport({ width: 360, height: 900 });
  const narrowOnlineTools = await page.evaluate(() => {
    const bar = document.querySelector('.online-tools-bar');
    const links = [...document.querySelectorAll('[data-online-tool]')];
    const barRect = bar?.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      bar: {
        displayed: Boolean(bar?.offsetParent),
        left: barRect?.left ?? -1,
        right: barRect?.right ?? Infinity,
        top: barRect?.top ?? Infinity,
        bottom: barRect?.bottom ?? Infinity,
      },
      links: links.map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          tool: node.getAttribute('data-online-tool'),
          displayed: Boolean(node.offsetParent),
          width: rect.width,
          height: rect.height,
          left: rect.left,
          right: rect.right,
        };
      }),
    };
  });
  assert.ok(
    narrowOnlineTools.bar.displayed
      && narrowOnlineTools.bar.left >= 0
      && narrowOnlineTools.bar.right <= narrowOnlineTools.viewportWidth
      && narrowOnlineTools.bar.top >= 0
      && narrowOnlineTools.bar.bottom <= narrowOnlineTools.viewportHeight,
    `Online tool bar should remain visible in a narrow sidepanel: ${JSON.stringify(narrowOnlineTools)}`,
  );
  assert.equal(narrowOnlineTools.links.length, 2, JSON.stringify(narrowOnlineTools));
  for (const link of narrowOnlineTools.links) {
    assert.ok(
      link.displayed
        && link.width > 0
        && link.height >= 44
        && link.left >= 0
        && link.right <= narrowOnlineTools.viewportWidth,
      `Online tool link should fit in a narrow sidepanel: ${JSON.stringify(link)}`,
    );
  }
  await page.setViewport({ width: 1440, height: 1400 });

  await page.click('#btn-open-account-records');
  await page.waitForFunction(() => document.querySelector('#account-records-overlay')?.hidden === false);
  await page.evaluate(async () => {
    const now = new Date().toISOString();
    await chrome.storage.local.set({
      accountTasksV1: {
        schemaVersion: 1,
        updatedAt: now,
        items: {
          task_session_progress_fixture: {
            taskId: 'task_session_progress_fixture',
            type: 'fill_session',
            channel: 'free',
            status: 'interrupted',
            nodeId: 'fill-session',
            progress: { current: 0, total: 120 },
            checkpoint: {
              nodeId: 'fill-session',
              currentIndex: 0,
              lastOutcome: '',
              successCount: 0,
              failedCount: 0,
              skippedCount: 0,
            },
            recovery: { canRetry: true },
            createdAt: now,
            updatedAt: now,
          },
        },
      },
      accountTaskEventsV1: {
        schemaVersion: 1,
        updatedAt: now,
        byTaskId: {
          task_session_progress_fixture: [{
            eventId: 'event_session_progress_fixture',
            taskId: 'task_session_progress_fixture',
            type: 'progress',
            level: 'info',
            code: 'TASK_RECOVERY_RESUME_SAFE',
            message: 'Recovery decision: resume_safe',
            createdAt: now,
          }],
        },
      },
    });
  });
  await page.evaluate(() => { document.querySelector('#account-task-meta').textContent = '待刷新'; });
  await page.click('#btn-refresh-account-tasks');
  await page.waitForFunction(() => document.querySelector('#account-task-meta')?.textContent?.includes('已刷新'));
  await page.waitForFunction(() => document.querySelector('.account-task-progress')?.textContent?.includes('已处理 0/120'));
  await page.evaluate(async () => {
    const stored = await chrome.storage.local.get(['accountTasksV1', 'accountTaskEventsV1']);
    const now = new Date().toISOString();
    const task = stored.accountTasksV1.items.task_session_progress_fixture;
    task.status = 'running';
    task.progress = { current: 19, total: 120 };
    task.checkpoint = {
      ...task.checkpoint,
      currentIndex: 19,
      lastOutcome: 'processing',
      successCount: 0,
      failedCount: 18,
      skippedCount: 0,
    };
    task.updatedAt = now;
    stored.accountTasksV1.updatedAt = now;
    stored.accountTaskEventsV1.byTaskId.task_session_progress_fixture.push({
      eventId: 'event_session_failure_fixture',
      taskId: 'task_session_progress_fixture',
      type: 'progress',
      level: 'error',
      code: 'LOGIN_PAGE_TIMEOUT',
      message: '第 18/120 个账号失败：等待登录页面可操作状态超时。（LOGIN_PAGE_TIMEOUT）。成功 0，失败 18，跳过 0。',
      createdAt: now,
    });
    stored.accountTaskEventsV1.updatedAt = now;
    await chrome.storage.local.set(stored);
  });
  await page.waitForFunction(() => document.querySelector('.account-task-progress')?.textContent?.includes('处理中 19/120 · 成功 0 · 失败 18'));
  await page.click('[data-task-id="task_session_progress_fixture"] [data-task-action="events"]');
  await page.waitForFunction(() => {
    const panel = document.querySelector('#account-task-events');
    return panel?.hidden === false
      && panel.textContent.includes('等待登录页面可操作状态超时')
      && panel.textContent.includes('检测到任务可以安全继续');
  });
  await page.evaluate(async () => {
    const stored = await chrome.storage.local.get(['accountTaskEventsV1']);
    const now = new Date().toISOString();
    stored.accountTaskEventsV1.byTaskId.task_session_progress_fixture.push({
      eventId: 'event_session_live_refresh_fixture',
      taskId: 'task_session_progress_fixture',
      type: 'progress',
      level: 'error',
      code: 'FREE_ACCOUNT_SESSION_INCOMPLETE',
      message: '第 19/120 个账号失败：登录完成但未读取到完整 ChatGPT Session。（FREE_ACCOUNT_SESSION_INCOMPLETE）。成功 0，失败 19，跳过 0。',
      createdAt: now,
    });
    stored.accountTaskEventsV1.updatedAt = now;
    await chrome.storage.local.set(stored);
  });
  await page.waitForFunction(() => document.querySelector('#account-task-events')?.textContent?.includes('第 19/120 个账号失败'));

  const groupViewport = await page.evaluate(() => {
    const measure = (selector) => {
      const node = document.querySelector(selector);
      const rect = node?.getBoundingClientRect();
      return {
        left: rect?.left ?? Infinity,
        bottom: rect?.bottom ?? Infinity,
        top: rect?.top ?? Infinity,
        width: rect?.width ?? 0,
        height: rect?.height ?? 0,
        displayed: Boolean(node?.offsetParent),
      };
    };
    return {
      viewportHeight: window.innerHeight,
      free: measure('[data-upi-membership-section="free"]'),
      ineligible: measure('[data-upi-membership-section="free-ineligible"]'),
      freeCommonActions: measure('[data-free-account-common-actions="free"]'),
      ineligibleCommonActions: measure('[data-free-account-common-actions="free-ineligible"]'),
      freeOnlyActions: measure('[data-free-account-group-actions="free"]'),
    };
  });
  assert.ok(
    groupViewport.free.displayed
      && groupViewport.free.width > 0
      && groupViewport.free.height > 0
      && groupViewport.free.top >= 0
      && groupViewport.free.top < groupViewport.viewportHeight,
    `Free group should be visible in the initial sidepanel viewport: ${JSON.stringify(groupViewport)}`,
  );
  assert.ok(
    groupViewport.ineligible.displayed
      && groupViewport.ineligible.width > 0
      && groupViewport.ineligible.height > 0
      && groupViewport.ineligible.top >= 0
      && groupViewport.ineligible.top < groupViewport.viewportHeight,
    `Ineligible Free group should be visible in the initial sidepanel viewport: ${JSON.stringify(groupViewport)}`,
  );
  assert.equal(
    Math.round(groupViewport.freeCommonActions.left),
    Math.round(groupViewport.ineligibleCommonActions.left),
    `Free group common toolbars should share the same left edge: ${JSON.stringify(groupViewport)}`,
  );
  assert.ok(
    groupViewport.freeOnlyActions.top >= groupViewport.freeCommonActions.bottom,
    `Free-only actions should render below the shared toolbar: ${JSON.stringify(groupViewport)}`,
  );

  await page.setViewport({ width: 1000, height: 500 });
  const modalScrollBefore = await page.evaluate(() => {
    const panel = document.querySelector('.account-records-panel');
    const bodyStyle = getComputedStyle(document.body);
    const panelStyle = panel ? getComputedStyle(panel) : null;
    return {
      bodyLocked: document.body.classList.contains('account-records-open'),
      bodyOverflow: bodyStyle.overflow,
      bodyScrollY: window.scrollY,
      clientHeight: panel?.clientHeight || 0,
      overflowY: panelStyle?.overflowY || '',
      scrollHeight: panel?.scrollHeight || 0,
      scrollTop: panel?.scrollTop || 0,
    };
  });
  assert.equal(modalScrollBefore.bodyLocked, true, JSON.stringify(modalScrollBefore));
  assert.equal(modalScrollBefore.bodyOverflow, 'hidden', JSON.stringify(modalScrollBefore));
  assert.equal(modalScrollBefore.overflowY, 'auto', JSON.stringify(modalScrollBefore));
  assert.ok(
    modalScrollBefore.scrollHeight > modalScrollBefore.clientHeight,
    `Free account panel should own vertical overflow in a short viewport: ${JSON.stringify(modalScrollBefore)}`,
  );
  await page.hover('.account-records-panel');
  await page.mouse.wheel({ deltaY: 420 });
  await page.waitForFunction(() => document.querySelector('.account-records-panel')?.scrollTop > 0);
  const modalScrollAfter = await page.evaluate(() => ({
    bodyScrollY: window.scrollY,
    panelScrollTop: document.querySelector('.account-records-panel')?.scrollTop || 0,
  }));
  assert.ok(modalScrollAfter.panelScrollTop > modalScrollBefore.scrollTop, JSON.stringify(modalScrollAfter));
  assert.equal(modalScrollAfter.bodyScrollY, modalScrollBefore.bodyScrollY, JSON.stringify(modalScrollAfter));

  await page.click('#btn-close-account-records');
  await page.waitForFunction(() => !document.body.classList.contains('account-records-open'));
  await page.setViewport({ width: 1440, height: 1400 });

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

  await page.evaluate(() => {
    const input = document.querySelector('#input-auto-step-delay-seconds');
    const saveButton = document.querySelector('#btn-save-settings');
    if (!input || !saveButton) throw new Error('E2E_SETTINGS_SAVE_CONTROLS_MISSING');
    input.value = '7';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    saveButton.click();
  });
  await page.waitForFunction(async () => {
    const stored = await chrome.storage.local.get(['autoStepDelaySeconds']);
    const state = await chrome.runtime.sendMessage({ type: 'GET_STATE', source: 'sidepanel' });
    return Number(stored?.autoStepDelaySeconds) === 7 && Number(state?.autoStepDelaySeconds) === 7;
  }, { timeout: 10000 });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForFunction(() => document.querySelector('#input-auto-step-delay-seconds')?.value === '7', { timeout: 10000 });

  const saveEnvelope = await sendMessage({
    type: 'SAVE_SETTING', source: 'sidepanel', payload: { autoStepDelaySeconds: 4 },
  });
  assert.equal(saveEnvelope?.lastError, '', JSON.stringify(saveEnvelope));
  assert.equal(saveEnvelope?.response?.ok, true, JSON.stringify(saveEnvelope));

  const stateEnvelope = await sendMessage({ type: 'GET_STATE', source: 'sidepanel' });
  assert.equal(stateEnvelope?.lastError, '', JSON.stringify(stateEnvelope));
  assert.equal(Number(stateEnvelope?.response?.autoStepDelaySeconds), 4, JSON.stringify(stateEnvelope));

  await page.evaluate(async () => {
    await chrome.storage.local.set({
      freeAccountResults: {
        schemaVersion: 3,
        items: [{
          email: 'runtime-state-pollution@example.test',
          password: 'fixture-password',
          accessToken: 'fixture-access-token',
          trialEligibilityStatus: 'eligible',
          freeAccountResults: { items: [{ email: 'nested@example.test' }] },
          accountRecordsV2: { items: { nested: { id: 'nested' } } },
          accountRunHistory: [{ status: 'completed' }],
          customEmailPoolEntries: [{ email: 'pool@example.test' }],
          logs: [{ message: 'fixture runtime log' }],
          runtimeState: { currentNodeId: 'check-trial-eligibility' },
        }],
      },
    });
  });
  const compactStateEnvelope = await sendMessage({ type: 'GET_STATE', source: 'sidepanel' });
  assert.equal(compactStateEnvelope?.lastError, '', JSON.stringify(compactStateEnvelope));
  assert.equal(Number(compactStateEnvelope?.response?.autoStepDelaySeconds), 4, JSON.stringify(compactStateEnvelope));
  assert.equal(Object.hasOwn(compactStateEnvelope?.response || {}, 'freeAccountResults'), false);
  assert.equal(compactStateEnvelope?.response?.freeAccountSummary?.total, 1);

  const compactResultsEnvelope = await sendMessage({ type: 'GET_FREE_ACCOUNT_RESULTS', source: 'sidepanel' });
  assert.equal(compactResultsEnvelope?.lastError, '', JSON.stringify(compactResultsEnvelope));
  const compactItem = compactResultsEnvelope?.response?.results?.items?.[0] || {};
  assert.equal(compactItem.email, 'runtime-state-pollution@example.test');
  assert.equal(compactItem.password, 'fixture-password');
  assert.equal(Object.hasOwn(compactItem, 'freeAccountResults'), false);
  assert.equal(Object.hasOwn(compactItem, 'accountRecordsV2'), false);
  assert.equal(Object.hasOwn(compactItem, 'logs'), false);

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
