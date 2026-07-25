const test = require('node:test');
const assert = require('node:assert/strict');
const { createSettingsTransfer } = require('../background/bootstrap/settings-transfer.js');

function createHarness(overrides = {}) {
  const local = {};
  const state = { nodeStatuses: {} };
  const transfer = createSettingsTransfer({
    chromeApi: {
      runtime: { getManifest: () => ({ version: '1.0.14' }) },
      storage: {
        local: {
          get: async (keys) => {
            if (Array.isArray(keys)) return Object.fromEntries(keys.filter((key) => Object.hasOwn(local, key)).map((key) => [key, local[key]]));
            return { ...local };
          },
          set: async (updates) => Object.assign(local, updates),
        },
      },
    },
    settingsExportSchemaVersion: 2,
    settingsImportBackupStorageKey: 'settingsImportBackupsV1',
    getPersistedSettings: async () => ({
      customPassword: 'secret-password',
      upiRedeemExternalApiKey: 'api-secret',
      customEmailPool: ['a@example.com----pool-password'],
      safeSetting: 'kept',
    }),
    getSettingsRuntimeDataForExport: undefined,
    defaultState: { upiCredentialMembershipCheckResults: { items: [] } },
    buildPersistentSettingsPayload: (value) => ({ ...value }),
    setPersistentSettings: async () => {},
    setState: async (updates) => Object.assign(state, updates),
    getState: async () => ({ ...state }),
    ensureManualInteractionAllowed: async () => ({ nodeStatuses: {} }),
    ...overrides,
  });
  return { transfer, local, state };
}

test('migrates v1 to v2 idempotently and rejects future versions', () => {
  const { transfer } = createHarness();
  const v1 = { schemaVersion: 1, containsSensitiveRuntimeData: true, settings: { safeSetting: 'x' } };
  const once = transfer.migrateSettingsBundle(v1);
  const twice = transfer.migrateSettingsBundle(once);
  assert.equal(once.schemaVersion, 2);
  assert.equal(once.exportMode, 'sensitive');
  assert.deepEqual(twice, once);
  assert.throws(() => transfer.migrateSettingsBundle({ schemaVersion: 3 }), /未来/);
});

test('ordinary export omits sensitive settings and runtime credentials', async () => {
  const harness = createHarness({
    getPersistedAliasState: async () => ({
      manualAliasUsage: { 'a@example.com': true },
      preservedAliases: {},
      icloudAliasCache: [],
    }),
  });
  harness.local.upiCredentialMembershipCheckResults = {
    items: [{ email: 'a@example.com', status: 'free', accessToken: 'at-secret' }],
  };
  harness.local.upiAccountCredentialBackups = { 'a@example.com': { password: 'pw' } };
  const result = await harness.transfer.exportSettingsBundle();
  const bundle = JSON.parse(result.fileContent);
  assert.equal(bundle.schemaVersion, 2);
  assert.equal(bundle.exportMode, 'safe');
  assert.equal(bundle.containsSensitiveRuntimeData, false);
  assert.equal(Object.hasOwn(bundle.settings, 'customPassword'), false);
  assert.equal(Object.hasOwn(bundle.settings, 'upiRedeemExternalApiKey'), false);
  assert.equal(Object.hasOwn(bundle.settings, 'customEmailPool'), false);
  assert.equal(JSON.stringify(bundle).includes('pool-password'), false);
  assert.equal(Object.hasOwn(bundle.runtimeData, 'upiAccountCredentialBackups'), false);
  assert.equal(JSON.stringify(bundle).includes('at-secret'), false);
  assert.equal(bundle.runtimeData.upiCredentialMembershipCheckResults.items.length, 1);
  assert.equal(bundle.runtimeData.upiCredentialMembershipCheckResults.items[0].email, 'a@example.com');
  assert.equal(Object.hasOwn(bundle.runtimeData.upiCredentialMembershipCheckResults.items[0], 'accessToken'), false);
});

test('sensitive export requires explicit confirmation', async () => {
  const { transfer } = createHarness();
  await assert.rejects(() => transfer.exportSettingsBundle({ includeSensitiveRuntimeData: true }), /二次确认/);
  const result = await transfer.exportSettingsBundle({ includeSensitiveRuntimeData: true, confirmed: true });
  const bundle = JSON.parse(result.fileContent);
  assert.equal(bundle.exportMode, 'sensitive');
  assert.equal(bundle.containsSensitiveRuntimeData, true);
});

test('import stores a bounded raw backup before applying sensitive runtime data', async () => {
  const harness = createHarness({
    getSettingsRuntimeDataForExport: async () => ({ upiAccountCredentialBackups: { 'a@example.com': { password: 'pw' } } }),
  });
  await harness.transfer.importSettingsBundle({
    schemaVersion: 1,
    containsSensitiveRuntimeData: true,
    settings: { safeSetting: 'imported' },
    runtimeData: { upiAccountCredentialBackups: { 'b@example.com': { password: 'new-pw' } } },
  });
  assert.equal(Array.isArray(harness.local.settingsImportBackupsV1), true);
  assert.equal(harness.local.settingsImportBackupsV1.length, 1);
  assert.equal(harness.local.settingsImportBackupsV1[0].settings.customPassword, 'secret-password');
});

test('safe import restores redacted membership rows and account history without credentials', async () => {
  let syncReason = '';
  const harness = createHarness({
    synchronizeAccountReadModel: async (reason) => {
      syncReason = reason;
      return { root: { schemaVersion: 2, items: { 'free@example.com': { id: 'free@example.com' } } } };
    },
  });
  await harness.transfer.importSettingsBundle({
    schemaVersion: 2,
    exportMode: 'safe',
    containsSensitiveRuntimeData: false,
    settings: { safeSetting: 'imported' },
    runtimeData: {
      upiCredentialMembershipCheckResults: {
        items: [{
          email: 'free@example.com',
          status: 'free',
          accessToken: 'must-not-import',
          password: 'must-not-import',
        }],
      },
      accountRunHistory: [{
        email: 'free@example.com',
        finalStatus: 'success',
        accessToken: 'must-not-import',
        password: 'must-not-import',
      }],
    },
  });

  assert.equal(syncReason, 'settings-import');
  assert.equal(harness.local.upiCredentialMembershipCheckResults.items.length, 1);
  assert.equal(harness.local.upiCredentialMembershipCheckResults.items[0].status, 'free');
  assert.equal(Object.hasOwn(harness.local.upiCredentialMembershipCheckResults.items[0], 'accessToken'), false);
  assert.equal(Object.hasOwn(harness.local.upiCredentialMembershipCheckResults.items[0], 'password'), false);
  assert.equal(harness.local.accountRunHistory.length, 1);
  assert.equal(Object.hasOwn(harness.local.accountRunHistory[0], 'accessToken'), false);
  assert.equal(Object.hasOwn(harness.local.accountRunHistory[0], 'password'), false);
});

test('summary-only safe import restores history without fabricating Free membership rows', async () => {
  const harness = createHarness();
  await harness.transfer.importSettingsBundle({
    schemaVersion: 2,
    exportMode: 'safe',
    containsSensitiveRuntimeData: false,
    settings: { safeSetting: 'imported' },
    runtimeData: {
      membershipSummary: { total: 49, freeCount: 49 },
      accountRunHistory: [{ email: 'history@example.com', finalStatus: 'success' }],
    },
  });

  assert.equal(harness.local.accountRunHistory.length, 1);
  assert.equal(Object.hasOwn(harness.local, 'upiCredentialMembershipCheckResults'), false);
});
