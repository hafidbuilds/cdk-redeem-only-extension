(function attachBackgroundStateStore(globalScope) {
  function createBackgroundStateStore(deps = {}) {
    const {
      accountRecordsStorageKey = 'accountRecordsV2',
      buildStatePatchWithRuntimeState = (_currentState, updates) => updates || {},
      buildStateViewWithRuntimeState = (state) => state || {},
      chrome: chromeApi = globalScope.chrome,
      defaultState = {},
      getPersistedAccountRunHistory = async () => [],
      getPersistedAliasState = async () => ({}),
      getPersistedSettings = async () => ({}),
      logPrefix = '[MultiPage]',
      membershipResultsStorageKey = 'freeAccountResults',
      migrateStateView = null,
      normalizeBooleanMap = (value) => value || {},
      normalizeIcloudAliasCacheList = (value) => Array.isArray(value) ? value : [],
      normalizePersistentSettingValue = (_key, value) => value,
      persistentSettingKeys = [],
      protectFreshMembershipResultsInStatePatch = async () => {},
      setPersistentSettings = async () => {},
      statePatchNeedsCurrentState = () => true,
    } = deps;
    const persistentSettingKeySet = new Set(
      (Array.isArray(persistentSettingKeys) ? persistentSettingKeys : [])
        .map((key) => String(key || '').trim())
        .filter(Boolean)
    );
    const customEmailPoolSessionCompatKeys = new Set([
      'customEmailPoolEntries',
      'customEmailPool',
      'selectedCustomEmailPoolEmail',
    ]);

    function hasNonEmptyArray(value) {
      return Array.isArray(value) && value.length > 0;
    }

    function getCustomEmailPoolEntryKey(entry) {
      const raw = entry && typeof entry === 'object'
        ? (entry.email || entry.credential || '')
        : entry;
      return String(raw || '').split('----')[0].trim().toLowerCase();
    }

    function mergePartialCustomEmailPoolEntries(persistedEntries = [], sessionEntries = []) {
      const sessionEntriesByEmail = new Map();
      const persistedEmails = new Set();

      for (const entry of sessionEntries) {
        const email = getCustomEmailPoolEntryKey(entry);
        if (email) {
          sessionEntriesByEmail.set(email, entry);
        }
      }

      const mergedEntries = persistedEntries.map((entry) => {
        const email = getCustomEmailPoolEntryKey(entry);
        if (email) {
          persistedEmails.add(email);
        }
        const sessionEntry = sessionEntriesByEmail.get(email);
        return sessionEntry && typeof entry === 'object' && typeof sessionEntry === 'object'
          ? { ...entry, ...sessionEntry }
          : (sessionEntry || entry);
      });

      for (const entry of sessionEntries) {
        const email = getCustomEmailPoolEntryKey(entry);
        if (!email || !persistedEmails.has(email)) {
          mergedEntries.push(entry);
        }
      }

      return mergedEntries;
    }

    function protectPersistedCustomEmailPoolOnReload(state = {}, persistedSettings = {}) {
      const merged = { ...(state || {}) };
      const sessionEntries = state?.customEmailPoolEntries;
      const persistedEntries = persistedSettings?.customEmailPoolEntries;
      const sessionPool = state?.customEmailPool;
      const persistedPool = persistedSettings?.customEmailPool;
      const persistedEntryEmails = new Set(
        (Array.isArray(persistedEntries) ? persistedEntries : [])
          .map(getCustomEmailPoolEntryKey)
          .filter(Boolean)
      );
      const sessionEntryEmails = new Set(
        (Array.isArray(sessionEntries) ? sessionEntries : [])
          .map(getCustomEmailPoolEntryKey)
          .filter(Boolean)
      );
      const shouldRestoreStructuredEntries = Array.isArray(sessionEntries)
        && hasNonEmptyArray(persistedEntries)
        && [...persistedEntryEmails].some((email) => !sessionEntryEmails.has(email));
      const shouldRestoreLegacyPool = Array.isArray(sessionPool)
        && sessionPool.length < (Array.isArray(persistedPool) ? persistedPool.length : 0)
        && hasNonEmptyArray(persistedPool);

      if (shouldRestoreStructuredEntries) {
        // Workflow snapshots can carry only the account currently in progress.
        // Preserve that account's fresh fields while retaining the stored pool.
        merged.customEmailPoolEntries = mergePartialCustomEmailPoolEntries(persistedEntries, sessionEntries);
      }
      if (shouldRestoreLegacyPool) {
        merged.customEmailPool = persistedPool;
      }
      if (
        (shouldRestoreStructuredEntries || shouldRestoreLegacyPool)
        && !String(merged.selectedCustomEmailPoolEmail || '').trim()
        && String(persistedSettings?.selectedCustomEmailPoolEmail || '').trim()
      ) {
        merged.selectedCustomEmailPoolEmail = persistedSettings.selectedCustomEmailPoolEmail;
      }
      return merged;
    }

    function omitPersistentSettings(source = {}, options = {}) {
      const { preserveCustomEmailPoolCompat = false } = options;
      const next = { ...(source || {}) };
      for (const key of persistentSettingKeySet) {
        if (preserveCustomEmailPoolCompat && customEmailPoolSessionCompatKeys.has(key)) {
          continue;
        }
        delete next[key];
      }
      return next;
    }

    function sanitizeSessionPatch(patch = {}) {
      const next = omitPersistentSettings(patch);
      delete next[membershipResultsStorageKey];
      delete next[accountRecordsStorageKey];
      return next;
    }

    function pickPersistentSettingsPatch(source = {}) {
      const patch = {};
      for (const key of persistentSettingKeySet) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
          patch[key] = source[key];
        }
      }
      return patch;
    }

    async function getState() {
      const [state, persistedSettings, persistedAliasState, accountRunHistory, persistedAccountState] = await Promise.all([
        chromeApi.storage.session.get(null),
        getPersistedSettings(),
        getPersistedAliasState(),
        getPersistedAccountRunHistory(),
        chromeApi.storage.local.get([membershipResultsStorageKey, accountRecordsStorageKey]).catch(() => ({})),
      ]);
      const persistedCredentialMembershipCheckResults = persistedAccountState?.[membershipResultsStorageKey]
        || defaultState.freeAccountResults;
      const protectedSessionState = protectPersistedCustomEmailPoolOnReload(state, persistedSettings);
      const sessionState = omitPersistentSettings(protectedSessionState, {
        preserveCustomEmailPoolCompat: true,
      });
      const stateView = buildStateViewWithRuntimeState({
        ...defaultState,
        ...persistedSettings,
        ...persistedAliasState,
        ...sessionState,
        freeAccountResults: persistedCredentialMembershipCheckResults,
        accountRecordsV2: persistedAccountState?.[accountRecordsStorageKey] || defaultState.accountRecordsV2,
        accountRunHistory,
      });
      if (typeof migrateStateView !== 'function') {
        return stateView;
      }
      const migrationPatch = migrateStateView(stateView, { sessionState: state || {} });
      if (!migrationPatch || typeof migrationPatch !== 'object' || Array.isArray(migrationPatch) || !Object.keys(migrationPatch).length) {
        return stateView;
      }
      const safeMigrationPatch = sanitizeSessionPatch(migrationPatch);
      if (Object.keys(safeMigrationPatch).length > 0) {
        await chromeApi.storage.session.set(safeMigrationPatch);
      }
      return buildStateViewWithRuntimeState({ ...stateView, ...migrationPatch });
    }

    async function initializeSessionStorageAccess() {
      try {
        if (chromeApi.storage?.session?.setAccessLevel) {
          await chromeApi.storage.session.setAccessLevel({
            accessLevel: 'TRUSTED_CONTEXTS',
          });
          console.log(logPrefix, 'Restricted storage.session to trusted extension contexts');
        }
      } catch (err) {
        console.warn(logPrefix, 'Failed to enable storage.session for content scripts:', err?.message || err);
      }
      try {
        await chromeApi.storage?.session?.remove?.([membershipResultsStorageKey, accountRecordsStorageKey]);
      } catch (err) {
        console.warn(logPrefix, 'Failed to remove canonical local data from storage.session:', err?.message || err);
      }
    }

    async function setState(updates) {
      if (Object.keys(updates || {}).length <= 0) {
        return;
      }

      const currentSessionState = statePatchNeedsCurrentState(updates)
        ? await chromeApi.storage.session.get(null)
        : {};
      const sessionUpdates = buildStatePatchWithRuntimeState({
        ...defaultState,
        ...currentSessionState,
      }, updates);
      await protectFreshMembershipResultsInStatePatch(sessionUpdates);

      const persistentSettingsPatch = pickPersistentSettingsPatch(sessionUpdates);
      if (Object.keys(persistentSettingsPatch).length > 0) {
        await setPersistentSettings(persistentSettingsPatch);
      }

      if (Object.prototype.hasOwnProperty.call(sessionUpdates, membershipResultsStorageKey)) {
        await chromeApi.storage.local.set({
          [membershipResultsStorageKey]: sessionUpdates[membershipResultsStorageKey],
        });
      }

      const safeSessionUpdates = sanitizeSessionPatch(sessionUpdates);
      if (Object.keys(safeSessionUpdates).length > 0) {
        await chromeApi.storage.session.set(safeSessionUpdates);
      }

      const persistentAliasUpdates = {};
      if (Object.prototype.hasOwnProperty.call(sessionUpdates, 'manualAliasUsage')) {
        persistentAliasUpdates.manualAliasUsage = normalizeBooleanMap(sessionUpdates.manualAliasUsage);
      }
      if (Object.prototype.hasOwnProperty.call(sessionUpdates, 'preservedAliases')) {
        persistentAliasUpdates.preservedAliases = normalizeBooleanMap(sessionUpdates.preservedAliases);
      }
      if (Object.prototype.hasOwnProperty.call(sessionUpdates, 'icloudAliasCache')) {
        persistentAliasUpdates.icloudAliasCache = normalizeIcloudAliasCacheList(sessionUpdates.icloudAliasCache);
      }
      if (Object.prototype.hasOwnProperty.call(sessionUpdates, 'icloudAliasCacheAt')) {
        persistentAliasUpdates.icloudAliasCacheAt = Math.max(0, Number(sessionUpdates.icloudAliasCacheAt) || 0);
      }
      if (Object.keys(persistentAliasUpdates).length > 0) {
        await chromeApi.storage.local.set(persistentAliasUpdates);
      }

    }

    return {
      getState,
      initializeSessionStorageAccess,
      sanitizeSessionPatch,
      setState,
    };
  }

  globalScope.MultiPageBackgroundStateStore = {
    createBackgroundStateStore,
  };
})(self);
