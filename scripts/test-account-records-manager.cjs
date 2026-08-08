const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.MultiPageFreeAccountResults = require('../shared/free-account-results.js');
const { createAccountRecordsMembershipResultsRenderer } = require('../sidepanel/account-records-membership-results-renderer.js');
const { createAccountRecordsManager } = require('../sidepanel/account-records-manager.js');

function createContainer() {
  return {
    hidden: true,
    innerHTML: '',
    textContent: '',
    addEventListener() {},
    querySelector() { return null; },
  };
}

test('Free account renderer exposes the V3 renderer factory', () => {
  assert.equal(typeof createAccountRecordsMembershipResultsRenderer, 'function');
});

test('Free account renderer shows exactly the two eligibility groups and V3 summary', () => {
  const container = createContainer();
  const results = {
    schemaVersion: 3,
    items: [
      { email: 'eligible@example.com', status: 'free', trialEligibilityStatus: 'eligible', accessToken: 'at' },
      { email: 'unknown@example.com', status: 'free', trialEligibilityStatus: 'unknown' },
      { email: 'failed@example.com', status: 'free', trialEligibilityStatus: 'failed' },
      { email: 'ineligible@example.com', status: 'free', trialEligibilityStatus: 'ineligible' },
    ],
  };
  const renderer = createAccountRecordsMembershipResultsRenderer({
    dom: { upiCredentialMembershipCheckResults: container },
    state: { getLatestState: () => ({ autoRunning: false }) },
    getUpiCredentialMembershipCheckResults: () => results,
    buildUpiCredentialMembershipDisplayRows: () => results.items,
    getUpiCredentialMembershipRowStatusMeta: (row) => ({ className: 'pending', label: row.trialEligibilityStatus, detail: '' }),
  });

  renderer.renderUpiCredentialMembershipCheckResults();

  assert.match(container.innerHTML, />Free 组</);
  assert.match(container.innerHTML, />无资格 Free 组</);
  assert.match(container.innerHTML, /有资格 1 · 待检测 1 · 检测失败 1 · 无资格 1 · 缺 AT 3 · 缺 Session 4/);
  assert.match(container.innerHTML, /缺 AT 2 · 缺 Session 3/);
  assert.match(container.innerHTML, /data-free-account-fill-session="free"[^>]*>补充 Session\(3\)/);
  assert.match(container.innerHTML, /data-free-account-fill-session="free-ineligible"[^>]*>补充 Session\(1\)/);
  assert.match(container.innerHTML, /data-free-account-export-credential-mode/);
  assert.match(container.innerHTML, /<option value="access-token" selected>AT<\/option>/);
  assert.match(container.innerHTML, /<option value="session" >Session<\/option>/);
  assert.match(container.innerHTML, /data-free-account-common-actions="free"/);
  assert.match(container.innerHTML, /data-free-account-common-actions="free-ineligible"/);
  assert.match(container.innerHTML, /data-free-account-group-actions="free"/);
  assert.equal((container.innerHTML.match(/data-free-account-group-actions=/g) || []).length, 1);
  const freeCommonActions = container.innerHTML.match(/data-free-account-common-actions="free">([\s\S]*?)<\/div>/)?.[1] || '';
  assert.ok(freeCommonActions.indexOf('data-free-account-export-credential-mode') < freeCommonActions.indexOf('data-upi-membership-export="free"'));
  assert.ok(freeCommonActions.indexOf('data-upi-membership-export="free"') < freeCommonActions.indexOf('data-upi-membership-delete-group="free"'));
  assert.doesNotMatch(freeCommonActions, /data-upi-membership-import-free|data-upi-membership-toggle-export-verification-url/);
  assert.doesNotMatch(container.innerHTML, /Plus 组|兑换|移动/);
});

test('automatic registration keeps exports enabled and disables mutations', () => {
  const container = createContainer();
  const results = {
    schemaVersion: 3,
    items: [{ email: 'eligible@example.com', status: 'free', trialEligibilityStatus: 'eligible', password: 'pw', no2faFreeRoute: true }],
  };
  const renderer = createAccountRecordsMembershipResultsRenderer({
    dom: { upiCredentialMembershipCheckResults: container },
    state: { getLatestState: () => ({ autoRunning: true }) },
    getUpiCredentialMembershipCheckResults: () => results,
    buildUpiCredentialMembershipDisplayRows: () => results.items,
    getUpiCredentialMembershipRowStatusMeta: () => ({ className: 'success', label: '有试用资格', detail: '' }),
    hasUpiCredentialMembershipLoginMaterial: () => true,
    isAutoRunRecordDisplayRunning: () => true,
  });

  renderer.renderUpiCredentialMembershipCheckResults();

  assert.match(container.innerHTML, /自动注册运行中，只允许查看和导出/);
  assert.match(container.innerHTML, /data-upi-membership-export="free"/);
  assert.match(container.innerHTML, /data-upi-membership-delete-group="free" disabled/);
  assert.match(container.innerHTML, /data-upi-membership-login="eligible@example\.com" disabled/);
  assert.match(container.innerHTML, /data-free-account-fill-session="free" disabled/);
  assert.match(container.innerHTML, /data-upi-membership-import-free disabled/);
});

test('Session fill task renders progress and stop while disabling other account mutations', () => {
  const container = createContainer();
  const results = {
    schemaVersion: 3,
    items: [{ email: 'missing@example.com', status: 'free', trialEligibilityStatus: 'unknown', password: 'pw' }],
  };
  const task = {
    taskId: 'task_fill',
    type: 'fill_session',
    status: 'running',
    payload: { group: 'free' },
    progress: { current: 17, total: 120 },
  };
  const renderer = createAccountRecordsMembershipResultsRenderer({
    dom: { upiCredentialMembershipCheckResults: container },
    state: { getLatestState: () => ({ autoRunning: false }) },
    getUpiCredentialMembershipCheckResults: () => results,
    buildUpiCredentialMembershipDisplayRows: () => results.items,
    getFreeSessionFillTask: (group) => group === 'free' ? task : null,
    isFreeSessionFillActive: () => true,
  });

  renderer.renderUpiCredentialMembershipCheckResults();

  assert.match(container.innerHTML, /补充 Session 17\/120/);
  assert.match(container.innerHTML, /data-free-account-stop-session="task_fill"/);
  assert.match(container.innerHTML, /data-upi-membership-delete-group="free" disabled/);
  assert.match(container.innerHTML, /data-upi-membership-export="free"/);
});

test('interrupted Session fill task exposes a continue action for still-missing rows', () => {
  const container = createContainer();
  const results = {
    schemaVersion: 3,
    items: [{ email: 'missing@example.com', status: 'free', trialEligibilityStatus: 'unknown' }],
  };
  const renderer = createAccountRecordsMembershipResultsRenderer({
    dom: { upiCredentialMembershipCheckResults: container },
    state: { getLatestState: () => ({ autoRunning: false }) },
    getUpiCredentialMembershipCheckResults: () => results,
    buildUpiCredentialMembershipDisplayRows: () => results.items,
    getFreeSessionFillTask: () => ({ taskId: 'task_interrupted', type: 'fill_session', status: 'interrupted', payload: { group: 'free' } }),
  });

  renderer.renderUpiCredentialMembershipCheckResults();

  assert.match(container.innerHTML, /data-free-account-resume-session="task_interrupted"[^>]*>继续补充 Session\(1\)/);
});

test('account records manager reads freeAccountResults and renders through the V3 manager', () => {
  const container = createContainer();
  const stateValue = {
    autoRunning: false,
    freeAccountResults: {
      schemaVersion: 3,
      items: [{ email: 'sample@example.com', status: 'free', trialEligibilityStatus: 'unknown' }],
    },
  };
  const manager = createAccountRecordsManager({
    state: { getLatestState: () => stateValue, syncLatestState() {} },
    dom: { upiCredentialMembershipCheckResults: container, accountRecordsMeta: createContainer() },
  });

  manager.render();

  assert.match(container.innerHTML, /sample@example\.com/);
  assert.match(container.innerHTML, /未检测资格/);
  assert.equal(manager.getFreeExportIncludeVerificationUrl(), true);
  assert.equal(manager.getFreeExportCredentialMode(), 'access-token');
});
