const test = require('node:test');
const assert = require('node:assert/strict');

delete globalThis.SidepanelWorkflowStateView;
globalThis.self = globalThis;
globalThis.document = {
  querySelector: () => null,
};
const workflowStateView = require('../sidepanel/workflow-state-view.js');

test('workflow list renders existing-account 2FA as the real fourth node', () => {
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
        { nodeId: 'existing-totp-login', title: '已有账号 2FA 登录', displayOrder: 40, applicability: 'conditional' },
        { nodeId: 'fetch-signup-code', title: '获取注册验证码', displayOrder: 50 },
        { nodeId: 'fill-profile', title: '填写姓名和生日', displayOrder: 60 },
        { nodeId: 'fetch-gpt-password-code', title: '收取设置密码验证码', displayOrder: 70 },
        { nodeId: 'set-gpt-password', title: '设置 GPT 密码', displayOrder: 80 },
        { nodeId: 'enable-totp-mfa', title: '设置或校验 2FA', displayOrder: 90 },
      ],
      nodeIds: ['open-chatgpt', 'submit-signup-email', 'fill-password', 'existing-totp-login', 'fetch-signup-code', 'fill-profile', 'fetch-gpt-password-code', 'set-gpt-password', 'enable-totp-mfa'],
      statusIcons: {},
    },
    helpers: {
      getStepIdByNodeIdForCurrentMode: (nodeId) => ({
        'fill-password': 3,
        'existing-totp-login': 4,
        'fetch-signup-code': 5,
        'fill-profile': 6,
        'fetch-gpt-password-code': 7,
        'set-gpt-password': 8,
        'enable-totp-mfa': 9,
      }[nodeId] || null),
      getNodeStatuses: () => ({}),
      isDoneStatus: () => false,
    },
    callbacks: {},
  });

  view.renderStepsList();
  const html = dom.stepsList.innerHTML;
  assert.ok(html.indexOf('填写密码并继续') < html.indexOf('已有账号 2FA 登录'));
  assert.ok(html.indexOf('已有账号 2FA 登录') < html.indexOf('获取注册验证码'));
  assert.match(html, /step-num">4<\/span>/);
  assert.match(html, /data-node-id="existing-totp-login" data-step-key="existing-totp-login" data-display-only="false"/);
  assert.doesNotMatch(html, /step-num">3\.5<\/span>/);
  assert.equal(dom.stepsProgress.textContent, '0 / 9');
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
        { nodeId: 'existing-totp-login', title: '已有账号 2FA 登录', displayOrder: 40, applicability: 'conditional' },
        { nodeId: 'fetch-signup-code', title: '获取注册验证码', displayOrder: 50 },
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

test('formal step 4 renders live node states and participates in nine-node progress', () => {
  const statusEl = { textContent: '', dataset: {} };
  const row = { className: 'step-row pending', dataset: { displayOnly: 'false', routeSkipped: 'false' } };
  globalThis.document.querySelector = (selector) => {
    if (!selector.includes('existing-totp-login')) return null;
    return selector.startsWith('.step-status') ? statusEl : row;
  };
  const dom = {
    stepsList: { innerHTML: '' },
    stepsProgress: { textContent: '' },
  };
  let currentState = {
    nodeStatuses: {
      'open-chatgpt': 'completed',
      'submit-signup-email': 'completed',
      'fill-password': 'completed',
      'existing-totp-login': 'running',
      'fetch-signup-code': 'pending',
      'fill-profile': 'pending',
      'fetch-gpt-password-code': 'pending',
      'set-gpt-password': 'pending',
      'enable-totp-mfa': 'pending',
    },
  };
  const view = workflowStateView.create({
    dom,
    constants: {
      workflowNodes: [],
      nodeIds: ['open-chatgpt', 'submit-signup-email', 'fill-password', 'existing-totp-login', 'fetch-signup-code', 'fill-profile', 'fetch-gpt-password-code', 'set-gpt-password', 'enable-totp-mfa'],
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
  assert.equal(row.className, 'step-row running');
  assert.equal(statusEl.textContent, '');
  assert.equal(dom.stepsProgress.textContent, '3 / 9');

  currentState.nodeStatuses['existing-totp-login'] = 'completed';
  view.renderStepStatuses(currentState);
  assert.equal(row.className, 'step-row completed');
  assert.equal(statusEl.textContent, '完成');
  assert.equal(dom.stepsProgress.textContent, '4 / 9');

  currentState.nodeStatuses['existing-totp-login'] = 'failed';
  view.renderStepStatuses(currentState);
  assert.equal(row.className, 'step-row failed');
  assert.equal(statusEl.textContent, '失败');

  currentState.nodeStatuses['existing-totp-login'] = 'pending';
  view.renderStepStatuses(currentState);
  assert.equal(row.className, 'step-row pending');
  assert.equal(statusEl.textContent, '');
});

test('route-skipped nodes stay neutral and show the route explanation when status is skipped', () => {
  const statusEl = { textContent: '', dataset: { pendingText: '当前路线跳过' } };
  const row = { className: 'step-row skipped route-skipped', dataset: { displayOnly: 'false', routeSkipped: 'true' } };
  globalThis.document.querySelector = (selector) => {
    if (!selector.includes('security-factor-not-required')) return null;
    return selector.startsWith('.step-status') ? statusEl : row;
  };
  const view = workflowStateView.create({
    constants: {
      statusIcons: { skipped: '跳过' },
    },
  });

  view.renderSingleNodeStatus('security-factor-not-required', 'skipped');

  assert.equal(statusEl.textContent, '当前路线跳过');
  assert.equal(row.className, 'step-row pending route-skipped');
});
