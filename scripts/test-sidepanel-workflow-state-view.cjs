const test = require('node:test');
const assert = require('node:assert/strict');

delete globalThis.SidepanelWorkflowStateView;
globalThis.self = globalThis;
globalThis.document = {
  querySelector: () => null,
};
const workflowStateView = require('../sidepanel/workflow-state-view.js');

test('workflow list visibly inserts the conditional existing-account 2FA row between steps 3 and 4', () => {
  const dom = {
    stepsList: {
      innerHTML: '',
      querySelector: () => null,
    },
    stepsProgress: { textContent: '' },
  };
  const view = workflowStateView.create({
    dom,
    constants: {
      workflowNodes: [
        { nodeId: 'fill-password', title: '填写密码并继续', displayOrder: 30 },
        { nodeId: 'fetch-signup-code', title: '获取注册验证码', displayOrder: 40 },
      ],
      nodeIds: ['fill-password', 'fetch-signup-code'],
      statusIcons: {},
    },
    helpers: {
      getStepIdByNodeIdForCurrentMode: (nodeId) => ({
        'fill-password': 3,
        'fetch-signup-code': 4,
      }[nodeId] || null),
      getNodeStatuses: () => ({ 'fill-password': 'pending', 'fetch-signup-code': 'pending' }),
      isDoneStatus: () => false,
    },
    callbacks: {},
  });

  view.renderStepsList();
  const html = dom.stepsList.innerHTML;
  assert.ok(html.indexOf('填写密码并继续') < html.indexOf('已有账号 2FA 登录'));
  assert.ok(html.indexOf('已有账号 2FA 登录') < html.indexOf('获取注册验证码'));
  assert.match(html, /step-num">3\.5<\/span>/);
  assert.match(html, /data-display-only="true" disabled aria-disabled="true"/);
  assert.match(html, />按需<\/span>/);
  assert.equal(dom.stepsProgress.textContent, '0 / 2');
});

test('workflow list does not duplicate the 2FA display row when a definition already provides it', () => {
  const dom = {
    stepsList: {
      innerHTML: '',
      querySelector: () => null,
    },
  };
  const view = workflowStateView.create({
    dom,
    constants: {
      workflowNodes: [
        { nodeId: 'fill-password', title: '填写密码并继续', displayOrder: 30 },
        { nodeId: 'existing-totp-login', title: '已有账号 2FA 登录', displayOrder: 35, ui: { displayOnly: true, stepLabel: '3.5' } },
        { nodeId: 'fetch-signup-code', title: '获取注册验证码', displayOrder: 40 },
      ],
      nodeIds: ['fill-password', 'fetch-signup-code'],
    },
    helpers: {
      getStepIdByNodeIdForCurrentMode: () => null,
      getNodeStatuses: () => ({}),
      isDoneStatus: () => false,
    },
    callbacks: {},
  });

  view.renderStepsList();
  assert.equal((dom.stepsList.innerHTML.match(/已有账号 2FA 登录/g) || []).length, 1);
});

test('conditional 2FA row renders live states without changing the seven-node progress model', () => {
  const statusEl = { textContent: '', dataset: { pendingText: '按需' } };
  const row = { className: 'step-row pending display-only', dataset: { displayOnly: 'true' } };
  globalThis.document.querySelector = (selector) => {
    if (!selector.includes('existing-totp-login')) return null;
    return selector.startsWith('.step-status') ? statusEl : row;
  };
  const dom = {
    stepsList: { innerHTML: '' },
    stepsProgress: { textContent: '' },
  };
  let currentState = {
    existingTotpLoginDisplayStatus: 'running',
    nodeStatuses: { 'fill-password': 'completed', 'fetch-signup-code': 'pending' },
  };
  const view = workflowStateView.create({
    dom,
    constants: {
      workflowNodes: [
        { nodeId: 'fill-password', title: '填写密码并继续', displayOrder: 30 },
        { nodeId: 'fetch-signup-code', title: '获取注册验证码', displayOrder: 40 },
      ],
      nodeIds: ['fill-password', 'fetch-signup-code'],
      statusIcons: { running: '', completed: '完成', failed: '失败' },
    },
    helpers: {
      getStepIdByNodeIdForCurrentMode: () => null,
      getNodeStatuses: (state) => state?.nodeStatuses || currentState.nodeStatuses,
      isDoneStatus: (status) => status === 'completed',
    },
    state: { getLatestState: () => currentState },
  });

  view.renderStepStatuses(currentState);
  assert.equal(row.className, 'step-row running display-only');
  assert.equal(statusEl.textContent, '');
  assert.equal(dom.stepsProgress.textContent, '1 / 2');

  currentState = { ...currentState, existingTotpLoginDisplayStatus: 'completed' };
  view.renderStepStatuses(currentState);
  assert.equal(row.className, 'step-row completed display-only');
  assert.equal(statusEl.textContent, '完成');
  assert.equal(dom.stepsProgress.textContent, '1 / 2');

  currentState = { ...currentState, existingTotpLoginDisplayStatus: 'failed' };
  view.renderStepStatuses(currentState);
  assert.equal(row.className, 'step-row failed display-only');
  assert.equal(statusEl.textContent, '失败');

  currentState = { ...currentState, existingTotpLoginDisplayStatus: 'pending' };
  view.renderStepStatuses(currentState);
  assert.equal(row.className, 'step-row pending display-only');
  assert.equal(statusEl.textContent, '按需');
});
