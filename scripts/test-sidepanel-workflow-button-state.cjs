const test = require('node:test');
const assert = require('node:assert/strict');

delete globalThis.SidepanelWorkflowButtonState;
const workflowButtonState = require('../sidepanel/workflow-button-state.js');

function createManager(overrides = {}) {
  return workflowButtonState.createWorkflowButtonStateManager({
    getNodeIds: () => ['open-chatgpt', 'submit-email', 'fetch-code', 'set-password'],
    getIndependentExecuteNodes: () => new Set(['fetch-code']),
    getSkippableNodes: () => new Set(['fetch-code']),
    isDoneStatus: (status) => status === 'completed' || status === 'manual_completed' || status === 'skipped',
    ...overrides,
  });
}

test('first workflow node can run while later nodes wait for completed previous nodes', () => {
  const manager = createManager();
  const statuses = {
    'open-chatgpt': 'pending',
    'submit-email': 'pending',
    'fetch-code': 'pending',
    'set-password': 'pending',
  };

  assert.deepEqual(manager.getStepButtonState({ nodeId: 'open-chatgpt', index: 0, statuses }), {
    canRun: true,
    disabled: false,
  });
  assert.deepEqual(manager.getStepButtonState({ nodeId: 'submit-email', index: 1, statuses }), {
    canRun: false,
    disabled: true,
  });

  statuses['open-chatgpt'] = 'completed';
  assert.deepEqual(manager.getStepButtonState({ nodeId: 'submit-email', index: 1, statuses }), {
    canRun: true,
    disabled: false,
  });
});

test('independent nodes still require all previous nodes ready', () => {
  const manager = createManager();
  const statuses = {
    'open-chatgpt': 'completed',
    'submit-email': 'pending',
    'fetch-code': 'pending',
    'set-password': 'pending',
  };

  assert.equal(manager.canExecuteNodeWithoutPreviousNode('fetch-code', statuses), false);
  statuses['submit-email'] = 'completed';
  assert.equal(manager.canExecuteNodeWithoutPreviousNode('fetch-code', statuses), true);
});

test('auto-run locks disable otherwise runnable step buttons', () => {
  const manager = createManager();
  const statuses = {
    'open-chatgpt': 'completed',
    'submit-email': 'pending',
  };

  assert.equal(manager.getStepButtonState({
    nodeId: 'submit-email',
    index: 1,
    statuses,
    anyRunning: true,
  }).disabled, true);
  assert.equal(manager.getStepButtonState({
    nodeId: 'submit-email',
    index: 1,
    statuses,
    autoScheduled: true,
  }).disabled, true);
});

test('skip button is available only for skippable unfinished nodes with previous node done', () => {
  const manager = createManager();
  const statuses = {
    'open-chatgpt': 'completed',
    'submit-email': 'completed',
    'fetch-code': 'pending',
  };

  assert.deepEqual(manager.getManualSkipButtonState({ nodeId: 'fetch-code', statuses }), {
    canSkip: true,
    visible: true,
    disabled: false,
    title: '跳过节点 fetch-code',
  });

  statuses['fetch-code'] = 'completed';
  assert.deepEqual(manager.getManualSkipButtonState({ nodeId: 'fetch-code', statuses }), {
    canSkip: false,
    visible: false,
    disabled: true,
    title: '当前不可跳过',
  });
});

test('final eligibility nodes are never manually skippable', () => {
  const nodeIds = [
    'open-chatgpt',
    'fetch-gpt-password-code',
    'set-gpt-password',
    'enable-totp-mfa',
    'check-trial-eligibility',
    'persist-no-2fa-free',
  ];
  const skippableNodes = workflowButtonState.createSkippableNodeSet(nodeIds);

  assert.equal(skippableNodes.has('fetch-gpt-password-code'), true);
  assert.equal(skippableNodes.has('enable-totp-mfa'), true);
  assert.equal(skippableNodes.has('check-trial-eligibility'), false);
  assert.equal(skippableNodes.has('persist-no-2fa-free'), false);

  const manager = workflowButtonState.createWorkflowButtonStateManager({
    getNodeIds: () => nodeIds,
    getIndependentExecuteNodes: () => new Set(),
    getSkippableNodes: () => skippableNodes,
    isDoneStatus: (status) => status === 'completed' || status === 'manual_completed' || status === 'skipped',
  });
  const statuses = Object.fromEntries(nodeIds.map((nodeId) => [nodeId, 'completed']));
  statuses['check-trial-eligibility'] = 'pending';

  assert.equal(manager.getManualSkipButtonState({
    nodeId: 'check-trial-eligibility',
    statuses,
  }).visible, false);
});

test('no-2FA step 9 can run when the unused conditional step 4 remains pending', () => {
  const nodeIds = [
    'open-chatgpt',
    'submit-signup-email',
    'fill-password',
    'existing-totp-login',
    'fetch-signup-code',
    'fill-profile',
    'fetch-gpt-password-code',
    'set-gpt-password',
    'persist-no-2fa-free',
  ];
  const nodeDefinitions = new Map(nodeIds.map((nodeId) => [nodeId, {
    nodeId,
    applicability: nodeId === 'existing-totp-login' ? 'conditional' : 'required',
  }]));
  const workflowState = {
    currentNodeId: 'existing-totp-login',
    existingTotpLoginRequired: false,
  };
  const manager = workflowButtonState.createWorkflowButtonStateManager({
    getNodeIds: () => nodeIds,
    getNodeDefinition: (nodeId) => nodeDefinitions.get(nodeId) || null,
    getIndependentExecuteNodes: () => new Set(),
    getSkippableNodes: () => workflowButtonState.createSkippableNodeSet(nodeIds),
    isConditionalNodeRequired: (nodeId) => (
      nodeId === 'existing-totp-login' && workflowState.existingTotpLoginRequired === true
    ),
    isDoneStatus: (status) => status === 'completed' || status === 'manual_completed' || status === 'skipped',
  });
  const statuses = {
    'open-chatgpt': 'manual_completed',
    'submit-signup-email': 'manual_completed',
    'fill-password': 'manual_completed',
    'existing-totp-login': 'pending',
    'fetch-signup-code': 'manual_completed',
    'fill-profile': 'manual_completed',
    'fetch-gpt-password-code': 'skipped',
    'set-gpt-password': 'skipped',
    'persist-no-2fa-free': 'pending',
  };

  assert.deepEqual(manager.getStepButtonState({
    nodeId: 'persist-no-2fa-free',
    index: 8,
    statuses,
  }), {
    canRun: true,
    disabled: false,
  });
  assert.equal(manager.getManualSkipButtonState({
    nodeId: 'persist-no-2fa-free',
    statuses,
  }).visible, false);
});

test('no-2FA step 9 stays blocked when the conditional TOTP step is explicitly required', () => {
  const nodeIds = ['fill-password', 'existing-totp-login', 'persist-no-2fa-free'];
  const manager = workflowButtonState.createWorkflowButtonStateManager({
    getNodeIds: () => nodeIds,
    getNodeDefinition: (nodeId) => ({
      nodeId,
      applicability: nodeId === 'existing-totp-login' ? 'conditional' : 'required',
    }),
    getIndependentExecuteNodes: () => new Set(),
    getSkippableNodes: () => workflowButtonState.createSkippableNodeSet(nodeIds),
    isConditionalNodeRequired: (nodeId) => nodeId === 'existing-totp-login',
    isDoneStatus: (status) => status === 'completed' || status === 'manual_completed' || status === 'skipped',
  });

  assert.equal(manager.getStepButtonState({
    nodeId: 'persist-no-2fa-free',
    statuses: {
      'fill-password': 'completed',
      'existing-totp-login': 'pending',
      'persist-no-2fa-free': 'pending',
    },
  }).disabled, true);
});

test('reset and active control state follow running scheduled paused and locked flags', () => {
  const manager = createManager();

  assert.equal(manager.isResetDisabled({}), false);
  assert.equal(manager.isActiveControlEnabled({}), true);
  assert.equal(manager.isResetDisabled({ anyRunning: true }), true);
  assert.equal(manager.isResetDisabled({ autoScheduled: true }), true);
  assert.equal(manager.isResetDisabled({ autoPaused: true }), true);
  assert.equal(manager.isResetDisabled({ autoLocked: true }), true);
  assert.equal(manager.isActiveControlEnabled({ autoLocked: true }), false);
});
