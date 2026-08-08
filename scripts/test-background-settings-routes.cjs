const test = require('node:test');
const assert = require('node:assert/strict');

require('../data/step-definitions.js');
const { createSettingsRoutes } = require('../background/routes/settings-routes.js');
const { createCustomEmailPoolState } = require('../background/custom-email-pool-state.js');
const workflowDefinitions = globalThis.MultiPageStepDefinitions;

function createRouteHarness() {
  const writes = [];
  const lifecycleTransitions = [];
  const customEmailPoolState = createCustomEmailPoolState();
  let state = {
    customEmailPoolEntries: [
      { email: 'one@example.com', enabled: true, used: false },
      { email: 'two@example.com', enabled: true, used: false },
    ],
    customEmailPool: ['one@example.com', 'two@example.com'],
    selectedCustomEmailPoolEmail: 'one@example.com',
  };
  const routes = createSettingsRoutes({
    addLog: async () => {},
    broadcastDataUpdate: () => {},
    buildLuckmailSessionSettingsPayload: () => ({}),
    buildPersistentSettingsPayload: (payload = {}) => {
      const { allowEmptyCustomEmailPool, allowCustomEmailPoolStatusReset, ...settings } = payload;
      return settings;
    },
    mergeCustomEmailPoolEntriesForSettings: (currentEntries, incomingEntries) => incomingEntries.map((entry) => {
      const current = currentEntries.find((candidate) => candidate.email === entry.email);
      return current?.used
        ? { ...entry, used: true, accessToken: entry.accessToken || current.accessToken, trialEligibilityStatus: entry.trialEligibilityStatus || current.trialEligibilityStatus, lastUsedAt: Math.max(entry.lastUsedAt || 0, current.lastUsedAt || 0) }
        : entry;
    }),
    exportSettingsBundle: async () => ({}),
    getNodeIdsForState: (nextState = {}) => workflowDefinitions.getNodes(nextState).map((node) => node.nodeId),
    getState: async () => state,
    getStepIdsForState: (nextState = {}) => workflowDefinitions.getSteps(nextState).map((step) => step.id),
    getStepKeyForState: (stepId, nextState = {}) => workflowDefinitions.getSteps(nextState)
      .find((step) => Number(step.id) === Number(stepId))?.key || '',
    importSettingsBundle: async () => ({}),
    normalizeHotmailAccounts: (value = []) => Array.isArray(value) ? value : [],
    resolveSignupMethod: () => 'email',
    setPersistentSettings: async (updates) => writes.push({ ...updates }),
    setState: async (updates) => {
      state = { ...state, ...updates };
    },
    syncCustomEmailPoolTrialEligibilityTransitions: (currentEntries, nextEntries, options) => (
      customEmailPoolState.syncCustomEmailPoolTrialEligibilityTransitions(currentEntries, nextEntries, {
        ...options,
        accountLifecycleService: {
          applyTrialEligibilityEvidence: async (email, evidence) => lifecycleTransitions.push({ email, status: evidence.status }),
          clearTrialEligibilityEvidence: async (email) => lifecycleTransitions.push({ email, status: 'unknown' }),
        },
      })
    ),
    validateModeSwitch: () => ({ normalizedUpdates: {} }),
  });
  return { routes, writes, lifecycleTransitions, getState: () => state };
}

test('ordinary settings save cannot replace a populated custom email pool with empty arrays', async () => {
  const harness = createRouteHarness();

  await harness.routes.SAVE_SETTING({
    customEmailPoolEntries: [],
    customEmailPool: [],
    selectedCustomEmailPoolEmail: '',
  });

  assert.equal(Object.hasOwn(harness.writes[0], 'customEmailPoolEntries'), false);
  assert.equal(Object.hasOwn(harness.writes[0], 'customEmailPool'), false);
  assert.equal(harness.getState().customEmailPoolEntries.length, 2);
  assert.equal(harness.getState().customEmailPool.length, 2);
  assert.equal(harness.getState().selectedCustomEmailPoolEmail, 'one@example.com');
});

test('explicit custom email pool deletion may persist empty arrays', async () => {
  const harness = createRouteHarness();

  await harness.routes.SAVE_SETTING({
    customEmailPoolEntries: [],
    customEmailPool: [],
    selectedCustomEmailPoolEmail: '',
    allowEmptyCustomEmailPool: true,
  });

  assert.deepEqual(harness.writes[0].customEmailPoolEntries, []);
  assert.deepEqual(harness.writes[0].customEmailPool, []);
  assert.equal(harness.getState().customEmailPoolEntries.length, 0);
});

test('stale custom email pool settings cannot roll back workflow status or selection', async () => {
  const harness = createRouteHarness();
  harness.getState().customEmailPoolEntries[0] = {
    email: 'one@example.com',
    enabled: true,
    used: true,
    lastUsedAt: 123,
    accessToken: 'at-current',
    accessTokenMasked: 'at-cu****rent',
    trialEligibilityStatus: 'eligible',
    trialEligibilityCheckedAt: '2026-07-26T10:00:00.000Z',
  };
  harness.getState().selectedCustomEmailPoolEmail = 'two@example.com';

  await harness.routes.SAVE_SETTING({
    customEmailPoolEntries: [
      { email: 'one@example.com', enabled: true, used: false, lastUsedAt: 0 },
      { email: 'two@example.com', enabled: true, used: false },
    ],
    customEmailPool: ['one@example.com', 'two@example.com'],
    selectedCustomEmailPoolEmail: 'one@example.com',
  });

  const saved = harness.writes.at(-1);
  assert.equal(saved.customEmailPoolEntries[0].used, true);
  assert.equal(saved.customEmailPoolEntries[0].accessToken, 'at-current');
  assert.equal(saved.customEmailPoolEntries[0].trialEligibilityStatus, 'eligible');
  assert.deepEqual(saved.customEmailPool, ['two@example.com']);
  assert.equal(saved.selectedCustomEmailPoolEmail, 'two@example.com');
});

test('explicit custom email pool status reset permits manual mark-unused', async () => {
  const harness = createRouteHarness();
  harness.getState().customEmailPoolEntries[0] = {
    email: 'one@example.com',
    enabled: true,
    used: true,
    accessToken: 'at-current',
  };

  await harness.routes.SAVE_SETTING({
    customEmailPoolEntries: [
      { email: 'one@example.com', enabled: true, used: false },
      { email: 'two@example.com', enabled: true, used: false },
    ],
    customEmailPool: ['one@example.com', 'two@example.com'],
    allowCustomEmailPoolStatusReset: true,
  });

  const saved = harness.writes.at(-1);
  assert.equal(saved.customEmailPoolEntries[0].used, false);
  assert.deepEqual(saved.customEmailPool, ['one@example.com', 'two@example.com']);
});

test('explicit trial status changes synchronize the canonical account lifecycle', async () => {
  const harness = createRouteHarness();

  await harness.routes.SAVE_SETTING({
    customEmailPoolEntries: [
      {
        email: 'one@example.com',
        enabled: true,
        used: false,
        trialEligibilityStatus: 'ineligible',
        trialEligibilityReason: 'manual confirmation',
      },
      { email: 'two@example.com', enabled: true, used: false },
    ],
    customEmailPool: ['two@example.com'],
    allowCustomEmailPoolStatusReset: true,
  });
  assert.deepEqual(harness.lifecycleTransitions, [{ email: 'one@example.com', status: 'ineligible' }]);

  await harness.routes.SAVE_SETTING({
    customEmailPoolEntries: [
      { email: 'one@example.com', enabled: true, used: false, trialEligibilityStatus: '' },
      { email: 'two@example.com', enabled: true, used: false },
    ],
    customEmailPool: ['one@example.com', 'two@example.com'],
    allowCustomEmailPoolStatusReset: true,
  });
  assert.deepEqual(harness.lifecycleTransitions.at(-1), { email: 'one@example.com', status: 'unknown' });
});

test('registration route switch clears stale no-2FA runtime state', async () => {
  const harness = createRouteHarness();
  Object.assign(harness.getState(), {
    registrationFreeRoute: 'no-2fa-free',
    currentNodeId: 'persist-no-2fa-free',
    nodeStatuses: {
      'open-chatgpt': 'pending',
      'submit-signup-email': 'pending',
      'fill-password': 'pending',
      'existing-totp-login': 'pending',
      'fetch-signup-code': 'pending',
      'fill-profile': 'pending',
      'fetch-gpt-password-code': 'skipped',
      'set-gpt-password': 'skipped',
      'persist-no-2fa-free': 'pending',
    },
  });

  const response = await harness.routes.SAVE_SETTING({ registrationFreeRoute: 'full-2fa' });

  assert.equal(response.ok, true);
  assert.equal(harness.getState().registrationFreeRoute, 'full-2fa');
  assert.equal(harness.getState().currentNodeId, '');
  assert.deepEqual(harness.getState().nodeStatuses, workflowDefinitions.getDefaultNodeStatuses({
    registrationFreeRoute: 'full-2fa',
  }));
});
