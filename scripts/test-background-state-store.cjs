const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.self = globalThis;
require('../background/bootstrap/state-store.js');
require('../background/runtime-state.js');

const { createBackgroundStateStore } = globalThis.MultiPageBackgroundStateStore;
const { createRuntimeStateHelpers } = globalThis.MultiPageBackgroundRuntimeState;

test('background state hydrates the persisted canonical account read model', async () => {
  const accountRecordsV2 = {
    schemaVersion: 2,
    items: {
      'fixture@example.com': { id: 'fixture@example.com' },
    },
    updatedAt: '2026-07-25T00:00:00.000Z',
  };
  const store = createBackgroundStateStore({
    chrome: {
      storage: {
        session: { get: async () => ({}) },
        local: {
          get: async (keys) => ({
            ...(keys.includes('accountRecordsV2') ? { accountRecordsV2 } : {}),
          }),
        },
      },
    },
    defaultState: {
      accountRecordsV2: { schemaVersion: 2, items: {}, updatedAt: '' },
      freeAccountResults: { schemaVersion: 3, items: [] },
    },
    buildStateViewWithRuntimeState: (state) => state,
  });

  const state = await store.getState();
  assert.deepEqual(state.accountRecordsV2, accountRecordsV2);
});

test('background state restores persisted custom email pool when session has stale empty pool', async () => {
  const sessionData = {
    customEmailPoolEntries: [],
    customEmailPool: [],
    selectedCustomEmailPoolEmail: '',
  };
  const persistedSettings = {
    customEmailPoolEntries: [{
      id: 'entry-1',
      email: 'saved@example.com',
      enabled: true,
      used: false,
    }],
    customEmailPool: ['saved@example.com'],
    selectedCustomEmailPoolEmail: 'saved@example.com',
  };
  const store = createBackgroundStateStore({
    chrome: {
      storage: {
        session: {
          get: async () => sessionData,
        },
        local: {
          get: async () => ({}),
        },
      },
    },
    defaultState: {
      customEmailPoolEntries: [],
      customEmailPool: [],
      selectedCustomEmailPoolEmail: '',
      upiCredentialMembershipCheckResults: { items: [] },
    },
    getPersistedSettings: async () => persistedSettings,
    buildStateViewWithRuntimeState: (state) => state,
  });

  const state = await store.getState();

  assert.deepEqual(state.customEmailPoolEntries, persistedSettings.customEmailPoolEntries);
  assert.deepEqual(state.customEmailPool, persistedSettings.customEmailPool);
  assert.equal(state.selectedCustomEmailPoolEmail, 'saved@example.com');
});

test('background state merges a partial session pool into the persisted full pool', async () => {
  const sessionData = {
    customEmailPoolEntries: [{
      id: 'entry-1',
      email: 'used@example.com',
      enabled: true,
      used: true,
      accessToken: 'at-current',
    }],
    customEmailPool: [],
    selectedCustomEmailPoolEmail: 'next@example.com',
  };
  const persistedSettings = {
    customEmailPoolEntries: [
      { id: 'entry-1', email: 'used@example.com', enabled: true, used: false },
      { id: 'entry-2', email: 'next@example.com', enabled: true, used: false },
      { id: 'entry-3', email: 'later@example.com', enabled: true, used: false },
    ],
    customEmailPool: ['next@example.com', 'later@example.com'],
    selectedCustomEmailPoolEmail: 'next@example.com',
  };
  const store = createBackgroundStateStore({
    chrome: {
      storage: {
        session: { get: async () => sessionData },
        local: { get: async () => ({}) },
      },
    },
    defaultState: { upiCredentialMembershipCheckResults: { items: [] } },
    getPersistedSettings: async () => persistedSettings,
    buildStateViewWithRuntimeState: (state) => state,
  });

  const state = await store.getState();

  assert.equal(state.customEmailPoolEntries.length, 3);
  assert.deepEqual(state.customEmailPoolEntries[0], sessionData.customEmailPoolEntries[0]);
  assert.deepEqual(state.customEmailPoolEntries.slice(1), persistedSettings.customEmailPoolEntries.slice(1));
  assert.deepEqual(state.customEmailPool, persistedSettings.customEmailPool);
  assert.equal(state.selectedCustomEmailPoolEmail, 'next@example.com');
});

test('background state keeps empty custom email pool when persisted settings are also empty', async () => {
  const store = createBackgroundStateStore({
    chrome: {
      storage: {
        session: {
          get: async () => ({
            customEmailPoolEntries: [],
            customEmailPool: [],
          }),
        },
        local: {
          get: async () => ({}),
        },
      },
    },
    defaultState: {
      customEmailPoolEntries: [],
      customEmailPool: [],
      upiCredentialMembershipCheckResults: { items: [] },
    },
    getPersistedSettings: async () => ({
      customEmailPoolEntries: [],
      customEmailPool: [],
    }),
    buildStateViewWithRuntimeState: (state) => state,
  });

  const state = await store.getState();

  assert.deepEqual(state.customEmailPoolEntries, []);
  assert.deepEqual(state.customEmailPool, []);
});

test('persisted settings win over stale session defaults after browser restart', async () => {
  const persistedSettings = {
    registrationFreeRoute: 'no-2fa-free',
    upiSubscriptionApiBaseUrl: 'https://saved-eligibility.example',
    upiCredentialMembershipCheckTotpApiBaseUrl: 'https://saved-totp.example',
    setGptPasswordVerificationWaitSeconds: 42,
    signupVerificationCodeWaitSeconds: 42,
    mailProvider: 'custom',
  };
  const staleSessionState = {
    currentNodeId: 'persist-no-2fa-free',
    registrationFreeRoute: 'full-2fa',
    upiSubscriptionApiBaseUrl: 'https://cha.nerver.cc',
    upiCredentialMembershipCheckTotpApiBaseUrl: 'https://cha.nerver.cc',
    setGptPasswordVerificationWaitSeconds: 10,
    signupVerificationCodeWaitSeconds: 10,
    mailProvider: 'hotmail-api',
  };
  const store = createBackgroundStateStore({
    chrome: {
      storage: {
        session: { get: async () => staleSessionState },
        local: { get: async () => ({}) },
      },
    },
    defaultState: {
      currentNodeId: '',
      registrationFreeRoute: 'full-2fa',
      upiSubscriptionApiBaseUrl: 'https://cha.nerver.cc',
      upiCredentialMembershipCheckTotpApiBaseUrl: 'https://cha.nerver.cc',
      setGptPasswordVerificationWaitSeconds: 10,
      signupVerificationCodeWaitSeconds: 10,
      mailProvider: 'hotmail-api',
      freeAccountResults: { schemaVersion: 3, items: [] },
    },
    getPersistedSettings: async () => persistedSettings,
    persistentSettingKeys: Object.keys(persistedSettings),
    buildStateViewWithRuntimeState: (state) => state,
  });

  const state = await store.getState();

  assert.equal(state.currentNodeId, 'persist-no-2fa-free');
  assert.equal(state.registrationFreeRoute, 'no-2fa-free');
  assert.equal(state.upiSubscriptionApiBaseUrl, 'https://saved-eligibility.example');
  assert.equal(state.upiCredentialMembershipCheckTotpApiBaseUrl, 'https://saved-totp.example');
  assert.equal(state.setGptPasswordVerificationWaitSeconds, 42);
  assert.equal(state.signupVerificationCodeWaitSeconds, 42);
  assert.equal(state.mailProvider, 'custom');
});

test('persistent settings are written locally and omitted from session state', async () => {
  const persistentWrites = [];
  const sessionWrites = [];
  const sessionData = {};
  const store = createBackgroundStateStore({
    chrome: {
      storage: {
        session: {
          get: async () => sessionData,
          set: async (patch) => {
            sessionWrites.push(patch);
            Object.assign(sessionData, patch);
          },
        },
        local: {
          get: async () => ({}),
          set: async () => {},
        },
      },
    },
    defaultState: {
      registrationFreeRoute: 'full-2fa',
      currentNodeId: '',
    },
    persistentSettingKeys: ['registrationFreeRoute'],
    setPersistentSettings: async (patch) => persistentWrites.push(patch),
    buildStatePatchWithRuntimeState: (_current, updates) => updates,
  });

  await store.setState({
    registrationFreeRoute: 'no-2fa-free',
    currentNodeId: 'persist-no-2fa-free',
  });

  assert.deepEqual(persistentWrites, [{ registrationFreeRoute: 'no-2fa-free' }]);
  assert.deepEqual(sessionWrites, [{ currentNodeId: 'persist-no-2fa-free' }]);
  assert.deepEqual(store.sanitizeSessionPatch({
    registrationFreeRoute: 'full-2fa',
    currentNodeId: 'open-chatgpt',
  }), { currentNodeId: 'open-chatgpt' });
});

test('background state persists Free results and ignores removed CDK fields', async () => {
  const localWrites = [];
  const sessionWrites = [];
  const sessionData = {};
  const freeAccountResults = {
    schemaVersion: 3,
    items: [{ email: 'current@example.com', status: 'free', trialEligibilityStatus: 'eligible' }],
  };
  const store = createBackgroundStateStore({
    chrome: {
      storage: {
        session: {
          get: async () => sessionData,
          set: async (patch) => { sessionWrites.push(patch); Object.assign(sessionData, patch); },
        },
        local: {
          get: async () => ({}),
          set: async (patch) => localWrites.push(patch),
        },
      },
    },
    defaultState: { freeAccountResults: { schemaVersion: 3, items: [] } },
    buildStatePatchWithRuntimeState: (_current, updates) => updates,
  });

  await store.setState({
    freeAccountResults,
    upiRedeemCdkeyUsage: { removed: true },
    idealRedeemCdkeyUsage: { removed: true },
    pixChannelRedeemCdkeyUsage: { removed: true },
  });

  assert.deepEqual(localWrites, [{ freeAccountResults }]);
  assert.equal(sessionWrites.some((patch) => Object.hasOwn(patch, 'freeAccountResults')), false);
  assert.equal(Object.hasOwn(sessionData, 'freeAccountResults'), false);
});

test('background state removes canonical local data left in session storage', async () => {
  const removed = [];
  const store = createBackgroundStateStore({
    chrome: {
      storage: {
        session: {
          async setAccessLevel() {},
          async remove(keys) { removed.push(keys); },
        },
      },
    },
    membershipResultsStorageKey: 'freeAccountResults',
    accountRecordsStorageKey: 'accountRecordsV2',
  });

  await store.initializeSessionStorageAccess();

  assert.deepEqual(removed, [['freeAccountResults', 'accountRecordsV2']]);
  assert.deepEqual(store.sanitizeSessionPatch({
    freeAccountResults: { items: [{ session: { large: true } }] },
    accountRecordsV2: { items: { a: {} } },
    currentNodeId: 'open-chatgpt',
  }), { currentNodeId: 'open-chatgpt' });
});

test('large Free Session payload stays local and cannot exhaust session storage', async () => {
  const localWrites = [];
  const sessionWrites = [];
  const freeAccountResults = {
    schemaVersion: 3,
    items: Array.from({ length: 40 }, (_, index) => ({
      email: `large-${index}@example.test`,
      trialEligibilityStatus: 'eligible',
      session: { accessToken: 'x'.repeat(5000), account: { id: String(index) } },
    })),
  };
  const store = createBackgroundStateStore({
    chrome: {
      storage: {
        session: {
          async get() { return {}; },
          async set(patch) {
            if (JSON.stringify(patch).length > 2000) throw new Error('Session storage quota bytes exceeded. Values were not stored.');
            sessionWrites.push(patch);
          },
        },
        local: {
          async get() { return {}; },
          async set(patch) { localWrites.push(patch); },
        },
      },
    },
    defaultState: { freeAccountResults: { schemaVersion: 3, items: [] } },
    buildStatePatchWithRuntimeState: (_current, updates) => updates,
  });

  await store.setState({ freeAccountResults, currentNodeId: 'open-chatgpt' });

  assert.deepEqual(localWrites, [{ freeAccountResults }]);
  assert.deepEqual(sessionWrites, [{ currentNodeId: 'open-chatgpt' }]);
});

test('plain log updates avoid full session reads and runtime-state rewrites', async () => {
  let fullSessionReads = 0;
  const sessionWrites = [];
  const runtimeStateHelpers = createRuntimeStateHelpers({
    defaultNodeStatuses: { 'open-chatgpt': 'pending' },
  });
  const store = createBackgroundStateStore({
    chrome: {
      storage: {
        session: {
          async get(keys) {
            if (keys === null) fullSessionReads += 1;
            return {
              runtimeState: {
                flowId: 'openai',
                currentNodeId: 'open-chatgpt',
                nodeStatuses: { 'open-chatgpt': 'running' },
                serviceState: { largePayload: 'x'.repeat(200000) },
              },
            };
          },
          async set(patch) {
            sessionWrites.push(patch);
          },
        },
        local: {
          async get() { return {}; },
          async set() {},
        },
      },
    },
    defaultState: {},
    buildStatePatchWithRuntimeState: runtimeStateHelpers.buildSessionStatePatch,
    statePatchNeedsCurrentState: runtimeStateHelpers.statePatchNeedsCurrentState,
  });
  const logs = [{ message: 'fixture log', timestamp: 1 }];

  await store.setState({ logs });

  assert.equal(fullSessionReads, 0);
  assert.deepEqual(sessionWrites, [{ logs }]);
  assert.equal(Object.hasOwn(sessionWrites[0], 'runtimeState'), false);
});

test('runtime updates still hydrate the current runtime state before writing', async () => {
  let fullSessionReads = 0;
  const sessionWrites = [];
  const runtimeStateHelpers = createRuntimeStateHelpers({
    defaultNodeStatuses: { 'open-chatgpt': 'pending', 'enter-email': 'pending' },
  });
  const store = createBackgroundStateStore({
    chrome: {
      storage: {
        session: {
          async get(keys) {
            if (keys === null) fullSessionReads += 1;
            return {
              flowId: 'openai',
              currentNodeId: 'open-chatgpt',
              nodeStatuses: { 'open-chatgpt': 'completed', 'enter-email': 'pending' },
            };
          },
          async set(patch) {
            sessionWrites.push(patch);
          },
        },
        local: {
          async get() { return {}; },
          async set() {},
        },
      },
    },
    defaultState: {},
    buildStatePatchWithRuntimeState: runtimeStateHelpers.buildSessionStatePatch,
    statePatchNeedsCurrentState: runtimeStateHelpers.statePatchNeedsCurrentState,
  });

  await store.setState({ currentNodeId: 'enter-email' });

  assert.equal(fullSessionReads, 1);
  assert.equal(sessionWrites[0].runtimeState.currentNodeId, 'enter-email');
  assert.equal(sessionWrites[0].runtimeState.nodeStatuses['open-chatgpt'], 'completed');
});
