const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appStateModule = require('../sidepanel/app-state.js');
const settingsControllerModule = require('../sidepanel/settings-controller.js');

function createButton() {
  const listeners = new Map();
  return {
    disabled: false,
    textContent: '',
    addEventListener(type, listener) {
      const entries = listeners.get(type) || [];
      entries.push(listener);
      listeners.set(type, entries);
    },
    async dispatch(type, event = {}) {
      for (const listener of listeners.get(type) || []) {
        await listener({ type, target: this, ...event });
      }
    },
  };
}

function createSettingsCard() {
  return createButton();
}

test('sidepanel wires custom email pool readers into the settings controller', () => {
  const source = fs.readFileSync(path.join(__dirname, '../sidepanel/sidepanel-app-controller.js'), 'utf8');
  const start = source.indexOf('function buildSettingsControllerScopeValues()');
  const end = source.indexOf('function buildRuntimeMessageControllerScopeValues()', start);
  const wiring = source.slice(start, end);

  assert.match(wiring, /getNormalizedCustomEmailPoolEntriesState/);
  assert.match(wiring, /getActiveCustomEmailPoolEmails/);
});

test('settings controller marks dirty state and updates save button', () => {
  const appState = appStateModule.createSidepanelAppState({
    latestState: {},
    settingsDirty: false,
    settingsSaveInFlight: false,
    settingsAutoSaveTimer: null,
    settingsSaveRevision: 0,
    customPasswordSaveRevision: 0,
  });
  const btnSaveSettings = createButton();
  let configMenuUpdates = 0;

  const controller = settingsControllerModule.createSettingsController({
    appState,
    scopeValues: {
      btnSaveSettings,
      collectSettingsPayload: () => ({}),
      applySettingsState: () => {},
      syncLatestState: () => {},
      updatePanelModeUI: () => {},
      updateMailProviderUI: () => {},
      updateButtonStates: () => {},
      updateConfigMenuControls: () => {
        configMenuUpdates += 1;
      },
      showToast: () => {},
      currentAutoRun: { autoRunning: false },
      chrome: { runtime: { sendMessage: async () => ({}) } },
    },
  });

  controller.markSettingsDirty(true);

  assert.equal(appState.get('settingsDirty'), true);
  assert.equal(appState.get('settingsSaveRevision'), 1);
  assert.equal(btnSaveSettings.disabled, false);
  assert.equal(btnSaveSettings.textContent, '保存');
  assert.equal(configMenuUpdates > 0, true);
});

test('settings controller saves settings through runtime bridge and clears dirty flag', async () => {
  const appState = appStateModule.createSidepanelAppState({
    latestState: { preserved: true },
    settingsDirty: true,
    settingsSaveInFlight: false,
    settingsAutoSaveTimer: null,
    settingsSaveRevision: 4,
    customPasswordSaveRevision: 0,
  });
  const btnSaveSettings = createButton();
  const sentMessages = [];
  const syncedStates = [];

  const controller = settingsControllerModule.createSettingsController({
    appState,
    scopeValues: {
      btnSaveSettings,
      collectSettingsPayload: () => ({ alpha: 'beta' }),
      applySettingsState: () => {},
      syncLatestState: (payload) => {
        syncedStates.push(payload);
        appState.patchLatestState(payload);
        appState.set('settingsDirty', false);
      },
      updatePanelModeUI: () => {},
      updateMailProviderUI: () => {},
      updateButtonStates: () => {},
      updateConfigMenuControls: () => {},
      showToast: () => {},
      currentAutoRun: { autoRunning: false },
      chrome: {
        runtime: {
          sendMessage: async (message) => {
            sentMessages.push(message);
            return {};
          },
        },
      },
    },
  });

  await controller.saveSettings({ silent: true });

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, 'SAVE_SETTING');
  assert.deepEqual(sentMessages[0].payload, { alpha: 'beta' });
  assert.deepEqual(syncedStates, [{ alpha: 'beta' }]);
  assert.equal(appState.get('settingsDirty'), false);
  assert.equal(appState.get('settingsSaveInFlight'), false);
  assert.equal(btnSaveSettings.textContent, '保存');
});

test('settings save button is bound and persists the current form payload', async () => {
  const appState = appStateModule.createSidepanelAppState({
    latestState: {},
    settingsDirty: true,
    settingsSaveInFlight: false,
    settingsAutoSaveTimer: null,
    settingsSaveRevision: 1,
    customPasswordSaveRevision: 0,
  });
  const btnSaveSettings = createButton();
  const sentMessages = [];
  const controller = settingsControllerModule.createSettingsController({
    appState,
    scopeValues: {
      btnSaveSettings,
      settingsCard: createSettingsCard(),
      collectSettingsPayload: () => ({ registrationFreeRoute: 'no-2fa-free' }),
      applySettingsState: () => appState.set('settingsDirty', false),
      syncLatestState: () => appState.set('settingsDirty', false),
      updatePanelModeUI: () => {},
      updateMailProviderUI: () => {},
      updateButtonStates: () => {},
      updateConfigMenuControls: () => {},
      showToast: () => {},
      currentAutoRun: { autoRunning: false },
      chrome: { runtime: { sendMessage: async (message) => { sentMessages.push(message); return {}; } } },
    },
  });

  controller.bindEvents();
  await btnSaveSettings.dispatch('click');

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, 'SAVE_SETTING');
  assert.equal(sentMessages[0].payload.registrationFreeRoute, 'no-2fa-free');
});

test('settings card change immediately persists fields without dedicated listeners', async () => {
  const appState = appStateModule.createSidepanelAppState({
    latestState: {},
    settingsDirty: false,
    settingsSaveInFlight: false,
    settingsAutoSaveTimer: null,
    settingsSaveRevision: 0,
    customPasswordSaveRevision: 0,
  });
  const settingsCard = createSettingsCard();
  const sentMessages = [];
  const target = {
    id: 'fixture-select',
    type: 'select-one',
    matches: (selector) => selector === 'input, select, textarea',
  };
  const controller = settingsControllerModule.createSettingsController({
    appState,
    scopeValues: {
      btnSaveSettings: createButton(),
      settingsCard,
      collectSettingsPayload: () => ({ mailProvider: 'cloudmail' }),
      applySettingsState: () => appState.set('settingsDirty', false),
      syncLatestState: () => appState.set('settingsDirty', false),
      updatePanelModeUI: () => {},
      updateMailProviderUI: () => {},
      updateButtonStates: () => {},
      updateConfigMenuControls: () => {},
      showToast: () => {},
      currentAutoRun: { autoRunning: false },
      chrome: { runtime: { sendMessage: async (message) => { sentMessages.push(message); return {}; } } },
    },
  });

  controller.bindEvents();
  await settingsCard.dispatch('change', { target });

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].payload.mailProvider, 'cloudmail');
});

test('panel unload queues the latest dirty settings behind an in-flight save', async () => {
  const appState = appStateModule.createSidepanelAppState({
    latestState: {},
    settingsDirty: true,
    settingsSaveInFlight: false,
    settingsAutoSaveTimer: null,
    settingsSaveRevision: 1,
    customPasswordSaveRevision: 0,
  });
  let payloadValue = 'first';
  let releaseFirstSave;
  const firstSaveBlocked = new Promise((resolve) => { releaseFirstSave = resolve; });
  const sentMessages = [];
  const controller = settingsControllerModule.createSettingsController({
    appState,
    scopeValues: {
      btnSaveSettings: createButton(),
      settingsCard: createSettingsCard(),
      collectSettingsPayload: () => ({ fixture: payloadValue }),
      applySettingsState: () => appState.set('settingsDirty', false),
      syncLatestState: () => appState.set('settingsDirty', false),
      updatePanelModeUI: () => {},
      updateMailProviderUI: () => {},
      updateButtonStates: () => {},
      updateConfigMenuControls: () => {},
      showToast: () => {},
      currentAutoRun: { autoRunning: false },
      chrome: {
        runtime: {
          sendMessage: async (message) => {
            sentMessages.push(message);
            if (sentMessages.length === 1) await firstSaveBlocked;
            return {};
          },
        },
      },
    },
  });

  const firstSave = controller.saveSettings({ silent: true });
  await new Promise((resolve) => setImmediate(resolve));
  payloadValue = 'latest';
  controller.markSettingsDirty(true);
  const unloadSave = controller.flushDirtySettingsBeforePanelUnload();
  releaseFirstSave();
  await firstSave;
  await unloadSave;

  assert.equal(sentMessages.length, 2);
  assert.equal(sentMessages[1].payload.fixture, 'latest');
});

test('settings controller does not overwrite custom email pool selection during automatic runs', async () => {
  const appState = appStateModule.createSidepanelAppState({
    latestState: { autoRunPhase: 'running' },
    settingsDirty: true,
    settingsSaveInFlight: false,
    settingsAutoSaveTimer: null,
    settingsSaveRevision: 1,
    customPasswordSaveRevision: 0,
  });
  const sentMessages = [];
  const controller = settingsControllerModule.createSettingsController({
    appState,
    scopeValues: {
      btnSaveSettings: createButton(),
      collectSettingsPayload: () => ({
        otherSetting: 'keep',
        customEmailPoolEntries: [{ email: 'stale@example.com' }],
        customEmailPool: ['stale@example.com'],
        selectedCustomEmailPoolEmail: 'stale@example.com',
      }),
      applySettingsState: () => {},
      syncLatestState: () => {},
      updatePanelModeUI: () => {},
      updateMailProviderUI: () => {},
      updateButtonStates: () => {},
      updateConfigMenuControls: () => {},
      showToast: () => {},
      currentAutoRun: { autoRunning: true },
      chrome: {
        runtime: {
          sendMessage: async (message) => {
            sentMessages.push(message);
            return {};
          },
        },
      },
    },
  });

  await controller.saveSettings({ silent: true });

  assert.deepEqual(sentMessages[0].payload, { otherSetting: 'keep' });
});

test('settings controller preserves custom email pool when save response omits it', async () => {
  const appState = appStateModule.createSidepanelAppState({
    latestState: {},
    settingsDirty: true,
    settingsSaveInFlight: false,
    settingsAutoSaveTimer: null,
    settingsSaveRevision: 1,
    customPasswordSaveRevision: 0,
  });
  const btnSaveSettings = createButton();
  const appliedStates = [];
  const payload = {
    customEmailPool: ['sample@example.com'],
    customEmailPoolEntries: [{ id: 'entry-1', email: 'sample@example.com', enabled: true, used: false }],
  };

  const controller = settingsControllerModule.createSettingsController({
    appState,
    scopeValues: {
      btnSaveSettings,
      collectSettingsPayload: () => payload,
      applySettingsState: (state) => appliedStates.push(state),
      preserveHotmailAccountsForSettingsSaveResponse: (state) => ({ ...state }),
      syncLatestState: () => {},
      updatePanelModeUI: () => {},
      updateMailProviderUI: () => {},
      updateButtonStates: () => {},
      updateConfigMenuControls: () => {},
      showToast: () => {},
      currentAutoRun: { autoRunning: false },
      chrome: { runtime: { sendMessage: async () => ({ state: { customEmailPool: [], customEmailPoolEntries: [] } }) } },
    },
  });

  await controller.saveSettings({ silent: true, force: true });

  assert.equal(appliedStates.length, 1);
  assert.deepEqual(appliedStates[0].customEmailPoolEntries, payload.customEmailPoolEntries);
  assert.deepEqual(appliedStates[0].customEmailPool, payload.customEmailPool);
});

test('custom email pool settings payload falls back to the local backup when runtime entries are empty', () => {
  const appState = appStateModule.createSidepanelAppState({
    latestState: { selectedCustomEmailPoolEmail: 'backup@example.com' },
    settingsDirty: false,
    settingsSaveInFlight: false,
    settingsAutoSaveTimer: null,
    settingsSaveRevision: 0,
    customPasswordSaveRevision: 0,
  });
  const backupEntries = [{ id: 'backup', email: 'backup@example.com', enabled: true, used: false }];
  const controller = settingsControllerModule.createSettingsController({
    appState,
    scopeValues: {
      btnSaveSettings: createButton(),
      getNormalizedCustomEmailPoolEntriesState: () => [],
      getCustomEmailPoolBackupEntries: () => backupEntries,
      getActiveCustomEmailPoolEmails: (entries) => entries.map((entry) => entry.email),
      updateConfigMenuControls: () => {},
      showToast: () => {},
      currentAutoRun: { autoRunning: false },
      chrome: { runtime: { sendMessage: async () => ({}) } },
    },
  });

  const payload = controller.buildCustomEmailPoolSettingsPayload();

  assert.deepEqual(payload.customEmailPoolEntries, backupEntries);
  assert.deepEqual(payload.customEmailPool, ['backup@example.com']);
});

test('custom email pool settings payload forwards explicit status reset intent', () => {
  const appState = appStateModule.createSidepanelAppState({
    latestState: {},
  });
  const controller = settingsControllerModule.createSettingsController({
    appState,
    scopeValues: {
      btnSaveSettings: createButton(),
      getNormalizedCustomEmailPoolEntriesState: () => [{ email: 'sample@example.com' }],
      getActiveCustomEmailPoolEmails: (entries) => entries.map((entry) => entry.email),
      updateConfigMenuControls: () => {},
      showToast: () => {},
      currentAutoRun: { autoRunning: false },
      chrome: { runtime: { sendMessage: async () => ({}) } },
    },
  });

  const payload = controller.buildCustomEmailPoolSettingsPayload({
    allowCustomEmailPoolStatusReset: true,
  });
  assert.equal(payload.allowCustomEmailPoolStatusReset, true);
});
