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
