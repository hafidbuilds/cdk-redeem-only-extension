const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.self = globalThis;
delete globalThis.MultiPageRuntimeTaskRuntime;
delete globalThis.MultiPageRouterMessageDispatcher;
delete globalThis.MultiPageRouterNodeProtocolService;
delete require.cache[require.resolve('../background/router/message-dispatcher.js')];
delete require.cache[require.resolve('../background/router/node-protocol-service.js')];
require('../background/router/message-dispatcher.js');
require('../background/router/node-protocol-service.js');

const { createRouterMessageDispatcher } = globalThis.MultiPageRouterMessageDispatcher;
const { createRouterNodeProtocolService } = globalThis.MultiPageRouterNodeProtocolService;

const existingTotpResult = Object.freeze({
  handled: true,
  existingTotpLogin: true,
  skipProfileStep: true,
  skipProfileStepReason: 'existing_totp_login',
  skipSetPasswordStep: true,
  skipSetPasswordStepReason: 'existing_totp_login',
});

test('fill-password completion merges the step 3.5 result into workflow handling and notification', async () => {
  const handled = [];
  const notified = [];
  const dispatcher = createRouterMessageDispatcher({
    addLog: async () => {},
    appendManualAccountRunRecordIfNeeded: async () => {},
    finalizeStep3Completion: async () => existingTotpResult,
    findStepByNodeId: () => 3,
    getNodeIdsForState: () => ['fill-password', 'fetch-signup-code'],
    getState: async () => ({ activeTaskId: '', currentNodeId: 'fill-password' }),
    getStopRequested: () => false,
    handleStepData: async (step, payload) => handled.push({ step, payload }),
    isStaleAutoRunNodeMessage: () => false,
    normalizeNodeProtocolMessage: async (message) => message,
    notifyNodeComplete: (nodeId, payload) => notified.push({ nodeId, payload }),
    notifyNodeError: () => {},
    routeHandlers: {},
    setNodeStatus: async () => {},
  });

  const response = await dispatcher.handleMessage({
    type: 'NODE_COMPLETE',
    nodeId: 'fill-password',
    payload: { email: 'existing.account@example.test' },
  }, {});

  assert.deepEqual(response, { ok: true });
  assert.equal(handled.length, 1);
  assert.equal(handled[0].step, 3);
  assert.equal(handled[0].payload.email, 'existing.account@example.test');
  assert.equal(handled[0].payload.existingTotpLogin, true);
  assert.equal(handled[0].payload.skipSetPasswordStep, true);
  assert.equal(notified.length, 1);
  assert.equal(notified[0].payload.skipSetPasswordStepReason, 'existing_totp_login');
});

function createWorkflowHarness(step6Key) {
  const steps = [
    { id: 1, key: 'open-chatgpt' },
    { id: 2, key: 'submit-signup-email' },
    { id: 3, key: 'fill-password' },
    { id: 4, key: 'fetch-signup-code' },
    { id: 5, key: 'fill-profile' },
    { id: 6, key: step6Key },
    ...(step6Key === 'set-gpt-password' ? [{ id: 7, key: 'enable-totp-mfa' }] : []),
  ];
  const state = {
    email: 'existing.account@example.test',
    nodeStatuses: Object.fromEntries(steps.map((step) => [step.key, 'pending'])),
  };
  state.nodeStatuses['fill-password'] = 'completed';
  const logs = [];
  let markedUsedCount = 0;
  const service = createRouterNodeProtocolService({
    addLog: async (...args) => logs.push(args),
    getState: async () => state,
    getStepDefinitionForState: (step) => steps.find((item) => item.id === Number(step)) || null,
    markCurrentRegistrationAccountUsed: async () => {
      markedUsedCount += 1;
    },
    setNodeStatus: async (nodeId, status) => {
      state.nodeStatuses[nodeId] = status;
    },
    setState: async (updates) => Object.assign(state, updates),
  });
  return {
    service,
    state,
    logs,
    getMarkedUsedCount: () => markedUsedCount,
  };
}

test('confirmed step 3.5 login skips registration steps and set-password before step 7', async () => {
  const harness = createWorkflowHarness('set-gpt-password');

  await harness.service.handleStepData(3, existingTotpResult);

  assert.equal(harness.state.nodeStatuses['fetch-signup-code'], 'skipped');
  assert.equal(harness.state.nodeStatuses['fill-profile'], 'skipped');
  assert.equal(harness.state.nodeStatuses['set-gpt-password'], 'skipped');
  assert.equal(harness.state.nodeStatuses['enable-totp-mfa'], 'pending');
  assert.equal(harness.getMarkedUsedCount(), 1);
  assert.equal(harness.logs.some(([message]) => /直接进入步骤 7/.test(message)), true);
});

test('step 4 fallback TOTP recovery also skips set-password before step 7', async () => {
  const harness = createWorkflowHarness('set-gpt-password');

  await harness.service.handleStepData(4, existingTotpResult);

  assert.equal(harness.state.nodeStatuses['fill-profile'], 'skipped');
  assert.equal(harness.state.nodeStatuses['set-gpt-password'], 'skipped');
  assert.equal(harness.state.nodeStatuses['enable-totp-mfa'], 'pending');
});

test('confirmed step 3.5 login does not skip the no-2FA Free persistence node', async () => {
  const harness = createWorkflowHarness('persist-no-2fa-free');

  await harness.service.handleStepData(3, existingTotpResult);

  assert.equal(harness.state.nodeStatuses['fetch-signup-code'], 'skipped');
  assert.equal(harness.state.nodeStatuses['fill-profile'], 'skipped');
  assert.equal(harness.state.nodeStatuses['persist-no-2fa-free'], 'pending');
  assert.equal(harness.logs.some(([message]) => /步骤 6 不是设置密码节点/.test(message)), true);
});

test('ordinary logged-in completion without confirmed step 3.5 keeps step 6 pending', async () => {
  const harness = createWorkflowHarness('set-gpt-password');

  await harness.service.handleStepData(3, {
    skipProfileStep: true,
    skipProfileStepReason: 'logged_in_home',
  });

  assert.equal(harness.state.nodeStatuses['fetch-signup-code'], 'pending');
  assert.equal(harness.state.nodeStatuses['fill-profile'], 'skipped');
  assert.equal(harness.state.nodeStatuses['set-gpt-password'], 'pending');
});
