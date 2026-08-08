(function attachFreeAccountV3Migration(globalScope) {
  const MIGRATION_MARKER = 'freeAccountToolV3MigrationCompleted';
  const RESULTS_COMPACTION_MARKER = 'freeAccountResultsV3CompactionCompleted';
  const DEPRECATED_STORAGE_KEYS = Object.freeze([
    'upiCredentialMembershipCheckResults',
    'cdkPoolText',
    'upiRedeemCdkPoolText',
    'upiRedeemCdkeyPoolText',
    'pixRedeemCdkeyPoolText',
    'idealCdkPoolText',
    'idealRedeemCdkPoolText',
    'idealRedeemCdkeyPoolText',
    'pixChannelRedeemCdkeyPoolText',
    'cdkUsage',
    'upiRedeemCdkUsage',
    'upiRedeemCdkeyUsage',
    'pixRedeemCdkeyUsage',
    'idealCdkUsage',
    'idealRedeemCdkUsage',
    'idealRedeemCdkeyUsage',
    'pixChannelRedeemCdkeyUsage',
    'upiRedeemApiBaseUrl',
    'upiRedeemExternalApiKey',
    'upiRedeemClientId',
    'upiRedeemStopAfterRedeem',
    'upiRedeemContinueAfterRedeem',
    'upiRedeemFailedAccountRetryLimit',
    'pixRedeemApiBaseUrl',
    'pixRedeemExternalApiKey',
    'pixRedeemClientId',
    'pixRedeemStopAfterRedeem',
    'pixRedeemContinueAfterRedeem',
  ]);

  function cleanAccountRecords(root = {}) {
    const source = root && typeof root === 'object' && !Array.isArray(root) ? root : {};
    const items = {};
    Object.entries(source.items || {}).forEach(([id, rawRecord]) => {
      const record = rawRecord && typeof rawRecord === 'object' ? rawRecord : {};
      const lifecycle = record.lifecycle && typeof record.lifecycle === 'object' ? record.lifecycle : {};
      const metadata = record.metadata && typeof record.metadata === 'object' ? { ...record.metadata } : {};
      delete metadata.paidChannels;
      delete metadata.legacyPlanType;
      items[id] = {
        ...record,
        lifecycle: {
          ...lifecycle,
          membershipStatus: lifecycle.membershipStatus === 'free' ? 'free' : 'unknown',
        },
        metadata,
      };
      delete items[id].lifecycle.membershipChannel;
      delete items[id].redemption;
    });
    return {
      ...source,
      schemaVersion: Math.max(3, Number(source.schemaVersion) || 0),
      items,
      updatedAt: new Date().toISOString(),
    };
  }

  function cleanLegacyTasks(root = {}) {
    const source = root && typeof root === 'object' && !Array.isArray(root) ? root : {};
    const items = {};
    Object.entries(source.items || {}).forEach(([taskId, task]) => {
      if (!['redeem', 'verify_membership'].includes(String(task?.type || '').trim().toLowerCase())) {
        items[taskId] = task;
      }
    });
    return { ...source, items, updatedAt: new Date().toISOString() };
  }

  function createFreeAccountV3Migration(deps = {}) {
    const chromeApi = deps.chrome || globalScope.chrome;
    const resultsApi = deps.resultsApi || globalScope.MultiPageFreeAccountResults;
    const logger = deps.logger || console;

    async function migrate(reason = 'startup') {
      const markers = await chromeApi.storage.local.get([MIGRATION_MARKER, RESULTS_COMPACTION_MARKER]);
      if (markers?.[MIGRATION_MARKER] === true) {
        const stored = await chromeApi.storage.local.get([resultsApi.STORAGE_KEY]);
        const rawResults = stored?.[resultsApi.STORAGE_KEY] || {};
        const existing = resultsApi.normalizeResults(rawResults);
        const needsCompaction = markers?.[RESULTS_COMPACTION_MARKER] !== true
          || resultsApi.resultsNeedCompaction?.(rawResults) === true;
        if (!needsCompaction) {
          return { changed: false, results: existing };
        }
        await chromeApi.storage.local.set({
          [resultsApi.STORAGE_KEY]: existing,
          [RESULTS_COMPACTION_MARKER]: true,
        });
        logger.info?.('[FreeAccountTool]', 'Compacted Free account results:', JSON.stringify({
          reason,
          freeAccounts: existing.items.length,
        }));
        return { changed: true, repaired: true, results: existing };
      }

      const local = await chromeApi.storage.local.get(null);

      const cleanedAccountRecords = cleanAccountRecords(local?.accountRecordsV2 || {});
      const results = resultsApi.migrateLegacyResults({
        legacyResults: local?.[resultsApi.LEGACY_STORAGE_KEY] || existing,
        accountRecords: cleanedAccountRecords,
        customEmailPoolEntries: local?.customEmailPoolEntries || [],
      });
      const updates = {
        [resultsApi.STORAGE_KEY]: results,
        accountRecordsV2: cleanedAccountRecords,
        accountTasksV1: cleanLegacyTasks(local?.accountTasksV1 || {}),
        [MIGRATION_MARKER]: true,
        [RESULTS_COMPACTION_MARKER]: true,
      };

      await chromeApi.storage.local.set(updates);
      await Promise.all([
        chromeApi.storage.local.remove(DEPRECATED_STORAGE_KEYS),
        chromeApi.storage.session.remove([...DEPRECATED_STORAGE_KEYS, resultsApi.STORAGE_KEY]),
      ]);
      logger.info?.('[FreeAccountTool]', 'V3 migration completed:', JSON.stringify({
        reason,
        freeAccounts: results.items.length,
        ineligibleAccounts: results.ineligibleCount,
      }));
      return { changed: true, results, accountRecords: cleanedAccountRecords };
    }

    return { migrate };
  }

  globalScope.MultiPageFreeAccountV3Migration = {
    DEPRECATED_STORAGE_KEYS,
    MIGRATION_MARKER,
    RESULTS_COMPACTION_MARKER,
    cleanAccountRecords,
    cleanLegacyTasks,
    createFreeAccountV3Migration,
  };
})(self);
