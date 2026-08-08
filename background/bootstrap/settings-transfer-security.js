(function attachSettingsTransferSecurity(root, factory) {
  const api = factory();
  root.MultiPageSettingsTransferSecurity = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createSettingsTransferSecurity() {
  const SENSITIVE_KEY = /password|passphrase|authorization|token|^(?:session|auth.?session|chatgpt.?session)$|cookie|totp|2fa|api.?key|secret|private.?jwk|proxy.?password|cdkey|cdk|mail.?body|message.?body|raw.?mail|customEmailPool|hotmailAccounts|mail2925Accounts/i;
  const SAFE_MEMBERSHIP_ITEM_KEYS = [
    'email',
    'accountIdentifier',
    'status',
    'membershipStatus',
    'checkedAt',
    'updatedAt',
    'source',
    'reasonCode',
    'errorCode',
    'trialEligibilityStatus',
    'eligibilityStatus',
    'accountValidityStatus',
    'validityStatus',
    'accountDeactivated',
    'enabled',
  ];
  const SAFE_MEMBERSHIP_ROOT_KEYS = [
    'total',
    'completed',
    'eligibleCount',
    'ineligibleCount',
    'unknownCount',
    'checkingCount',
    'failedCount',
    'startedAt',
    'finishedAt',
    'updatedAt',
    'source',
    'trialEligibilitySummary',
  ];

  function omitSensitiveFields(value, seen = new WeakSet()) {
    if (value === null || value === undefined || typeof value !== 'object') return value;
    if (seen.has(value)) return '[CIRCULAR]';
    seen.add(value);
    if (Array.isArray(value)) return value.map((item) => omitSensitiveFields(item, seen));
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) continue;
      output[key] = omitSensitiveFields(item, seen);
    }
    return output;
  }

  function migrateSettingsBundle(input = {}, currentVersion = 1) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('配置文件内容无效。');
    const version = Number(input.schemaVersion);
    if (!Number.isInteger(version) || version < 1) throw new Error('配置文件缺少有效 schemaVersion。');
    if (version > currentVersion) throw new Error(`不支持未来的 schemaVersion=${version}，当前支持到 ${currentVersion}。`);
    if (version === currentVersion) return { ...input, schemaVersion: currentVersion };
    return {
      ...input,
      schemaVersion: currentVersion,
      exportMode: input.containsSensitiveRuntimeData === true ? 'sensitive' : 'safe',
      containsSensitiveRuntimeData: input.containsSensitiveRuntimeData === true,
    };
  }

  function buildSafeMembershipResults(value = null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const output = {};
    SAFE_MEMBERSHIP_ROOT_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        output[key] = omitSensitiveFields(value[key]);
      }
    });
    output.items = (Array.isArray(value.items) ? value.items : [])
      .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
      .map((item) => Object.fromEntries(SAFE_MEMBERSHIP_ITEM_KEYS
        .filter((key) => Object.prototype.hasOwnProperty.call(item, key))
        .map((key) => [key, omitSensitiveFields(item[key])])));
    output.running = false;
    return output;
  }

  function buildSafeRuntimeData(runtimeData = {}, helpers = {}) {
    const membership = helpers.normalizeMembership?.(
      runtimeData.freeAccountResults
    );
    const history = helpers.normalizeHistory?.(runtimeData.accountRunHistory) || [];
    const aliases = helpers.normalizeAlias?.(runtimeData.aliasState) || {};
    return {
      membershipSummary: membership ? {
        total: membership.total,
        completed: membership.completed,
        eligibleCount: membership.eligibleCount,
        ineligibleCount: membership.ineligibleCount,
        unknownCount: membership.unknownCount,
        checkingCount: membership.checkingCount,
        failedCount: membership.failedCount,
        updatedAt: membership.updatedAt,
      } : null,
      ...(membership ? {
        freeAccountResults: buildSafeMembershipResults(membership),
      } : {}),
      accountRunHistory: omitSensitiveFields(history),
      aliasSummary: {
        manualAliasCount: Object.keys(aliases.manualAliasUsage || {}).length,
        preservedAliasCount: Object.keys(aliases.preservedAliases || {}).length,
        cacheCount: Array.isArray(aliases.icloudAliasCache) ? aliases.icloudAliasCache.length : 0,
        updatedAt: aliases.icloudAliasCacheAt || 0,
      },
    };
  }

  async function saveImportBackup(context = {}) {
    const {
      chromeApi,
      getPersistedSettings = async () => ({}),
      getSettingsRuntimeDataForExport = async () => ({}),
      storageKey = 'settingsImportBackupsV1',
      limit = 3,
      currentVersion = 1,
    } = context;
    const [settings, runtimeData] = await Promise.all([
      getPersistedSettings(),
      getSettingsRuntimeDataForExport(),
    ]);
    const stored = await chromeApi.storage.local.get([storageKey]).catch(() => ({}));
    const existing = Array.isArray(stored?.[storageKey]) ? stored[storageKey] : [];
    const backup = {
      schemaVersion: currentVersion,
      backupId: `settings-backup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      containsSensitiveRuntimeData: true,
      settings,
      runtimeData,
    };
    await chromeApi.storage.local.set({ [storageKey]: [...existing, backup].slice(-Math.max(1, limit)) });
    return backup;
  }

  return {
    buildSafeMembershipResults,
    buildSafeRuntimeData,
    migrateSettingsBundle,
    omitSensitiveFields,
    saveImportBackup,
  };
});
