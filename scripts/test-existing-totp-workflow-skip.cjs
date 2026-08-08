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
  existingTotpLoginEmail: 'existing.account@example.test',
  twoFactorEnabled: true,
});

test('auto-run rejects a running node message when another node is current', () => {
  const service = createRouterNodeProtocolService({
    isAutoRunLockedState: () => true,
  });
  const state = {
    currentNodeId: 'fetch-signup-code',
    nodeStatuses: {
      'fetch-signup-code': 'running',
      'persist-no-2fa-free': 'running',
    },
  };

  assert.equal(service.isStaleAutoRunNodeMessage('persist-no-2fa-free', state), true);
  assert.equal(service.isStaleAutoRunNodeMessage('fetch-signup-code', state), false);
});

test('fill-password completion only classifies the TOTP branch for formal step 4', async () => {
  const handled = [];
  const notified = [];
  const dispatcher = createRouterMessageDispatcher({
    addLog: async () => {},
    appendManualAccountRunRecordIfNeeded: async () => {},
    finalizeStep3Completion: async () => ({
      ready: true,
      state: 'registered_login_totp_page',
      existingTotpLoginRequired: true,
    }),
    findStepByNodeId: () => 3,
    getNodeIdsForState: () => ['fill-password', 'existing-totp-login', 'fetch-signup-code'],
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
  assert.equal(handled[0].payload.existingTotpLoginRequired, true);
  assert.equal(handled[0].payload.existingTotpLogin, undefined);
  assert.equal(notified.length, 1);
  assert.equal(notified[0].payload.existingTotpLoginRequired, true);
  assert.equal(notified[0].payload.signupPasswordCreated, false);
});

test('fill-password completion marks signup password creation only after finalization confirms the next page', async () => {
  const handled = [];
  const notified = [];
  const dispatcher = createRouterMessageDispatcher({
    addLog: async () => {},
    appendManualAccountRunRecordIfNeeded: async () => {},
    finalizeStep3Completion: async () => ({ ready: true, prepareSource: 'step3_finalize' }),
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

  await dispatcher.handleMessage({
    type: 'NODE_COMPLETE',
    nodeId: 'fill-password',
    payload: {
      passwordSubmitAttempted: true,
      signupPasswordCreationAttempted: true,
    },
  }, {});

  assert.equal(handled[0].payload.signupPasswordCreated, true);
  assert.equal(notified[0].payload.signupPasswordCreated, true);
});

test('passwordless step 3 completion does not run password finalization', async () => {
  let finalizeCount = 0;
  const notified = [];
  const dispatcher = createRouterMessageDispatcher({
    addLog: async () => {},
    appendManualAccountRunRecordIfNeeded: async () => {},
    finalizeStep3Completion: async () => {
      finalizeCount += 1;
      return { ready: true };
    },
    findStepByNodeId: () => 3,
    getNodeIdsForState: () => ['fill-password', 'fetch-signup-code'],
    getState: async () => ({ activeTaskId: '', currentNodeId: 'fill-password' }),
    getStopRequested: () => false,
    handleStepData: async () => {},
    isStaleAutoRunNodeMessage: () => false,
    normalizeNodeProtocolMessage: async (message) => message,
    notifyNodeComplete: (nodeId, payload) => notified.push({ nodeId, payload }),
    notifyNodeError: () => {},
    routeHandlers: {},
    setNodeStatus: async () => {},
  });

  await dispatcher.handleMessage({
    type: 'NODE_COMPLETE',
    nodeId: 'fill-password',
    payload: {
      skippedPasswordPage: true,
      passwordSubmitAttempted: false,
      signupPasswordCreationAttempted: false,
    },
  }, {});

  assert.equal(finalizeCount, 0);
  assert.equal(notified[0].payload.signupPasswordCreated, false);
});

test('fill-password finalization preserves structured account deactivation errors', async () => {
  const failure = new Error('ACCOUNT_DEACTIVATED::account is unavailable');
  failure.code = 'ACCOUNT_DEACTIVATED';
  failure.retryable = false;
  let notifiedError = null;
  const dispatcher = createRouterMessageDispatcher({
    addLog: async () => {},
    appendManualAccountRunRecordIfNeeded: async () => {},
    finalizeStep3Completion: async () => {
      throw failure;
    },
    findStepByNodeId: () => 3,
    getNodeIdsForState: () => ['fill-password', 'existing-totp-login', 'fetch-signup-code'],
    getState: async () => ({ activeTaskId: '', currentNodeId: 'fill-password' }),
    getStopRequested: () => false,
    handleStepData: async () => {},
    isCloudflareSecurityBlockedError: () => false,
    isStaleAutoRunNodeMessage: () => false,
    normalizeNodeProtocolMessage: async (message) => message,
    notifyNodeComplete: () => {},
    notifyNodeError: (_nodeId, error) => {
      notifiedError = error;
    },
    routeHandlers: {},
    setNodeStatus: async () => {},
  });

  const response = await dispatcher.handleMessage({
    type: 'NODE_COMPLETE',
    nodeId: 'fill-password',
    payload: {},
  }, {});

  assert.equal(response.error, failure.message);
  assert.equal(notifiedError, failure);
  assert.equal(notifiedError.code, 'ACCOUNT_DEACTIVATED');
  assert.equal(notifiedError.retryable, false);
});

function createWorkflowHarness(route = 'full-2fa') {
  const steps = [
    { id: 1, key: 'open-chatgpt' },
    { id: 2, key: 'submit-signup-email' },
    { id: 3, key: 'fill-password' },
    { id: 4, key: 'existing-totp-login', applicability: 'conditional' },
    { id: 5, key: 'fetch-signup-code' },
    { id: 6, key: 'fill-profile' },
    { id: 7, key: 'fetch-gpt-password-code' },
    { id: 8, key: 'set-gpt-password' },
    { id: 9, key: route === 'no-2fa-free' ? 'persist-no-2fa-free' : 'enable-totp-mfa' },
  ];
  const state = {
    email: 'existing.account@example.test',
    nodeStatuses: Object.fromEntries(steps.map((step) => [step.key, 'pending'])),
  };
  if (route === 'no-2fa-free') {
    state.nodeStatuses['fetch-gpt-password-code'] = 'skipped';
    state.nodeStatuses['set-gpt-password'] = 'skipped';
  }
  state.nodeStatuses['fill-password'] = 'completed';
  const logs = [];
  let markedUsedCount = 0;
  const service = createRouterNodeProtocolService({
    addLog: async (...args) => logs.push(args),
    getState: async () => state,
    getNodeIdsForState: () => steps.map((step) => step.key),
    getNodeDefinitionForState: (nodeId) => {
      const step = steps.find((item) => item.key === nodeId);
      return step ? { nodeId: step.key, applicability: step.applicability || 'required' } : null;
    },
    getStepIdByNodeIdForState: (nodeId) => steps.find((item) => item.key === nodeId)?.id || 0,
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

test('step 3 keeps formal step 4 pending when a TOTP challenge is detected', async () => {
  const harness = createWorkflowHarness();

  await harness.service.handleStepData(3, { existingTotpLoginRequired: true });

  assert.equal(harness.state.nodeStatuses['existing-totp-login'], 'pending');
  assert.equal(harness.state.existingTotpLoginRequired, true);
  assert.equal(harness.state.nodeStatuses['fetch-signup-code'], 'pending');
  assert.equal(harness.logs.some(([message]) => /独立步骤 4/.test(message)), true);
});

test('step 3 atomically skips formal step 4 for a new signup account', async () => {
  const harness = createWorkflowHarness();

  await harness.service.handleStepData(3, { signupVerificationRequestedAt: Date.now() });

  assert.equal(harness.state.nodeStatuses['existing-totp-login'], 'skipped');
  assert.equal(harness.state.existingTotpLoginRequired, false);
  assert.equal(harness.state.nodeStatuses['fetch-signup-code'], 'pending');
});

test('confirmed signup password creation records state and skips pending steps 7 and 8', async () => {
  const harness = createWorkflowHarness();

  await harness.service.handleStepData(3, {
    signupVerificationRequestedAt: Date.now(),
    signupPasswordCreated: true,
  });

  assert.equal(harness.state.gptPasswordSet, true);
  assert.equal(Number.isNaN(Date.parse(harness.state.gptPasswordSetAt)), false);
  assert.equal(harness.state.nodeStatuses['fetch-gpt-password-code'], 'skipped');
  assert.equal(harness.state.nodeStatuses['set-gpt-password'], 'skipped');
  assert.equal(harness.logs.some(([message]) => /跳过步骤 7、8/.test(message)), true);
});

test('confirmed signup password creation preserves protected step 7 and 8 statuses', async () => {
  const harness = createWorkflowHarness();
  harness.state.nodeStatuses['fetch-gpt-password-code'] = 'running';
  harness.state.nodeStatuses['set-gpt-password'] = 'manual_completed';

  await harness.service.handleStepData(3, { signupPasswordCreated: true });

  assert.equal(harness.state.nodeStatuses['fetch-gpt-password-code'], 'running');
  assert.equal(harness.state.nodeStatuses['set-gpt-password'], 'manual_completed');
});

test('passwordless signup fallback keeps steps 7 and 8 pending', async () => {
  const harness = createWorkflowHarness();
  harness.state.gptPasswordSet = true;
  harness.state.gptPasswordSetAt = '2026-08-01T00:00:00.000Z';

  await harness.service.handleStepData(3, {
    skippedPasswordPage: true,
    signupPasswordCreated: false,
  });

  assert.equal(harness.state.gptPasswordSet, false);
  assert.equal(harness.state.gptPasswordSetAt, null);
  assert.equal(harness.state.nodeStatuses['fetch-gpt-password-code'], 'pending');
  assert.equal(harness.state.nodeStatuses['set-gpt-password'], 'pending');
});

test('formal step 4 completion skips steps 5 through 8 and keeps step 9 pending', async () => {
  const harness = createWorkflowHarness();

  await harness.service.handleStepData(4, existingTotpResult);

  assert.equal(harness.state.nodeStatuses['fetch-signup-code'], 'skipped');
  assert.equal(harness.state.nodeStatuses['fill-profile'], 'skipped');
  assert.equal(harness.state.nodeStatuses['fetch-gpt-password-code'], 'skipped');
  assert.equal(harness.state.nodeStatuses['set-gpt-password'], 'skipped');
  assert.equal(harness.state.nodeStatuses['enable-totp-mfa'], 'pending');
  assert.equal(harness.state.nodeStatuses['check-trial-eligibility'], undefined);
  assert.equal(harness.state.existingTotpLogin, true);
  assert.equal(harness.state.existingTotpLoginRequired, false);
  assert.equal(harness.state.existingTotpLoginEmail, 'existing.account@example.test');
  assert.equal(harness.getMarkedUsedCount(), 1);
});

test('formal step 4 completion preserves the no-2FA step 9 persistence node', async () => {
  const harness = createWorkflowHarness('no-2fa-free');

  await harness.service.handleStepData(4, existingTotpResult);

  assert.equal(harness.state.nodeStatuses['fetch-signup-code'], 'skipped');
  assert.equal(harness.state.nodeStatuses['fill-profile'], 'skipped');
  assert.equal(harness.state.nodeStatuses['fetch-gpt-password-code'], 'skipped');
  assert.equal(harness.state.nodeStatuses['set-gpt-password'], 'skipped');
  assert.equal(harness.state.nodeStatuses['persist-no-2fa-free'], 'pending');
  assert.equal(harness.state.existingTotpLogin, true);
  assert.equal(harness.state.twoFactorEnabled, true);
});

test('manual no-2FA step 9 ignores an unused pending conditional step 4', async () => {
  const harness = createWorkflowHarness('no-2fa-free');
  Object.assign(harness.state.nodeStatuses, {
    'open-chatgpt': 'manual_completed',
    'submit-signup-email': 'manual_completed',
    'fill-password': 'manual_completed',
    'existing-totp-login': 'pending',
    'fetch-signup-code': 'manual_completed',
    'fill-profile': 'manual_completed',
    'fetch-gpt-password-code': 'skipped',
    'set-gpt-password': 'skipped',
    'persist-no-2fa-free': 'pending',
  });
  harness.state.currentNodeId = 'existing-totp-login';

  await assert.doesNotReject(() => harness.service.ensureManualStepPrerequisites(
    9,
    'persist-no-2fa-free',
    harness.state
  ));
  assert.equal(harness.state.nodeStatuses['existing-totp-login'], 'skipped');
});

test('manual no-2FA step 9 still requires step 4 after a real TOTP challenge', async () => {
  const harness = createWorkflowHarness('no-2fa-free');
  Object.assign(harness.state, {
    existingTotpLoginRequired: true,
    nodeStatuses: {
      ...harness.state.nodeStatuses,
      'open-chatgpt': 'manual_completed',
      'submit-signup-email': 'manual_completed',
      'fill-password': 'completed',
      'existing-totp-login': 'pending',
      'fetch-signup-code': 'skipped',
      'fill-profile': 'skipped',
    },
  });

  await assert.rejects(
    () => harness.service.ensureManualStepPrerequisites(9, 'persist-no-2fa-free', harness.state),
    /前置步骤：4/
  );
});

test('ordinary logged-in completion without TOTP keeps password setup pending', async () => {
  const harness = createWorkflowHarness();

  await harness.service.handleStepData(3, {
    skipProfileStep: true,
    skipProfileStepReason: 'logged_in_home',
  });

  assert.equal(harness.state.nodeStatuses['existing-totp-login'], 'skipped');
  assert.equal(harness.state.nodeStatuses['fetch-signup-code'], 'pending');
  assert.equal(harness.state.nodeStatuses['fill-profile'], 'skipped');
  assert.equal(harness.state.nodeStatuses['fetch-gpt-password-code'], 'pending');
  assert.equal(harness.state.nodeStatuses['set-gpt-password'], 'pending');
  assert.equal(harness.state.existingTotpLogin, false);
  assert.equal(harness.state.existingTotpLoginEmail, '');
});
