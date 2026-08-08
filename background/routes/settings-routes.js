(function attachSettingsRoutes(root, factory) {
  const api = factory(root);
  root.MultiPageSettingsRoutes = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createSettingsRoutesModule(rootScope) {
  function requireHandler(handler, name) {
    if (typeof handler !== 'function') {
      throw new Error(`Missing settings route handler: ${name}`);
    }
    return handler;
  }
  function hasOwn(source = {}, key = '') {
    return Object.prototype.hasOwnProperty.call(source, key);
  }
  function normalizeString(value = '') {
    return String(value || '').trim();
  }

  function normalizePlusPaymentMethodForDisplay(value = '') {
    const normalized = normalizeString(value).toLowerCase();
    if (normalized === 'legacyPay') {
      return 'legacyPay';
    }
    if (normalized === 'cardHelper-helper') {
      return 'cardHelper-helper';
    }
    if (normalized === 'upi' || normalized === 'pix') {
      return 'upi';
    }
    return 'legacyWallet';
  }
  function getPlusPaymentMethodLabel(value = '') {
    const method = normalizePlusPaymentMethodForDisplay(value);
    if (method === 'cardHelper-helper') {
      return 'CARD_HELPER';
    }
    if (method === 'upi') {
      return 'UPI';
    }
    return method === 'legacyPay' ? 'LegacyPay' : 'LegacyWallet';
  }
  function createSettingsRoutes(deps = {}) {
    const {
      addLog,
      broadcastDataUpdate,
      buildLuckmailSessionSettingsPayload,
      buildPersistentSettingsPayload,
      mergeCustomEmailPoolEntriesForSettings,
      exportSettingsBundle,
      getNodeIdsForState,
      getState,
      getStepIdsForState,
      getStepKeyForState,
      importSettingsBundle,
      normalizeHotmailAccounts,
      resolveSignupMethod,
      setContributionMode,
      syncCustomEmailPoolTrialEligibilityTransitions,
      setPersistentSettings,
      setState,
      validateModeSwitch,
    } = deps;
    async function saveSetting(payload = {}) {
      const currentState = await requireHandler(getState, 'getState')();
      const updates = requireHandler(buildPersistentSettingsPayload, 'buildPersistentSettingsPayload')(payload || {});
      const allowEmptyCustomEmailPool = payload?.allowEmptyCustomEmailPool === true, allowCustomEmailPoolStatusReset = payload?.allowCustomEmailPoolStatusReset === true;
      if (
        !allowCustomEmailPoolStatusReset
        && hasOwn(updates, 'customEmailPoolEntries')
        && Array.isArray(updates.customEmailPoolEntries)
        && Array.isArray(currentState?.customEmailPoolEntries)
        && currentState.customEmailPoolEntries.length > 0
      ) {
        updates.customEmailPoolEntries = requireHandler(mergeCustomEmailPoolEntriesForSettings, 'mergeCustomEmailPoolEntriesForSettings')(
          currentState.customEmailPoolEntries,
          updates.customEmailPoolEntries,
        );
        if (hasOwn(updates, 'customEmailPool')) {
          updates.customEmailPool = updates.customEmailPoolEntries
            .filter((entry) => entry && entry.enabled !== false && entry.used !== true && entry.registrationBlocked !== true && String(entry.trialEligibilityStatus || '').trim().toLowerCase() !== 'ineligible')
            .map((entry) => String(entry?.email || entry?.credential || '').split('----')[0].trim().toLowerCase()).filter(Boolean);
        }
        const incomingSelectedEmail = normalizeString(updates.selectedCustomEmailPoolEmail).toLowerCase();
        const currentSelectedEmail = normalizeString(currentState.selectedCustomEmailPoolEmail).toLowerCase();
        const selectedEntry = updates.customEmailPoolEntries.find((entry) => String(entry?.email || entry?.credential || '').split('----')[0].trim().toLowerCase() === incomingSelectedEmail);
        if (currentSelectedEmail && (!incomingSelectedEmail || selectedEntry?.used === true)) {
          updates.selectedCustomEmailPoolEmail = currentSelectedEmail;
        }
      }
      if (
        !allowEmptyCustomEmailPool
        && hasOwn(updates, 'customEmailPoolEntries')
        && Array.isArray(updates.customEmailPoolEntries)
        && updates.customEmailPoolEntries.length === 0
        && Array.isArray(currentState?.customEmailPoolEntries)
        && currentState.customEmailPoolEntries.length > 0
      ) {
        delete updates.customEmailPoolEntries;
        if (hasOwn(updates, 'customEmailPool') && Array.isArray(updates.customEmailPool) && updates.customEmailPool.length === 0) {
          delete updates.customEmailPool;
        }
        if (hasOwn(updates, 'selectedCustomEmailPoolEmail') && !normalizeString(updates.selectedCustomEmailPoolEmail)) {
          delete updates.selectedCustomEmailPoolEmail;
        }
      }
      if (
        hasOwn(updates, 'hotmailAccounts')
        && requireHandler(normalizeHotmailAccounts, 'normalizeHotmailAccounts')(updates.hotmailAccounts).length === 0
        && requireHandler(normalizeHotmailAccounts, 'normalizeHotmailAccounts')(currentState.hotmailAccounts).length > 0
      ) {
        delete updates.hotmailAccounts;
      }
      const sessionUpdates = requireHandler(buildLuckmailSessionSettingsPayload, 'buildLuckmailSessionSettingsPayload')(payload || {});
      const modeValidation = requireHandler(validateModeSwitch, 'validateModeSwitch')({
        ...currentState,
        ...updates,
        resolvedSignupMethod: null,
      }, {
        changedKeys: Object.keys(updates),
      });
      if (modeValidation?.normalizedUpdates && Object.keys(modeValidation.normalizedUpdates).length > 0) {
        Object.assign(updates, modeValidation.normalizedUpdates);
      }
      const nextSignupState = {
        ...currentState,
        ...updates,
        resolvedSignupMethod: null,
      };
      if (
        hasOwn(updates, 'plusModeEnabled')
        || hasOwn(updates, 'signupMethod')
        || hasOwn(updates, 'panelMode')
        || hasOwn(updates, 'activeFlowId')
        || hasOwn(updates, 'contributionMode')
      ) {
        updates.signupMethod = requireHandler(resolveSignupMethod, 'resolveSignupMethod')(nextSignupState);
      }
      const modeChanged = hasOwn(updates, 'plusModeEnabled')
        && Boolean(currentState?.plusModeEnabled) !== Boolean(updates.plusModeEnabled);
      const plusPaymentChanged = hasOwn(updates, 'plusPaymentMethod')
        && normalizePlusPaymentMethodForDisplay(currentState?.plusPaymentMethod || 'legacyWallet')
          !== normalizePlusPaymentMethodForDisplay(updates.plusPaymentMethod || 'legacyWallet');
      const registrationRouteChanged = hasOwn(updates, 'registrationFreeRoute')
        && normalizeString(currentState?.registrationFreeRoute).toLowerCase()
          !== normalizeString(updates.registrationFreeRoute).toLowerCase();
      const nextPlusModeEnabled = hasOwn(updates, 'plusModeEnabled')
        ? Boolean(updates.plusModeEnabled)
        : Boolean(currentState?.plusModeEnabled);
      const stepModeChanged = modeChanged
        || registrationRouteChanged
        || (nextPlusModeEnabled && plusPaymentChanged);
      const oauthFlowTimeoutDisabled = hasOwn(updates, 'oauthFlowTimeoutEnabled')
        && updates.oauthFlowTimeoutEnabled === false;
      await requireHandler(setPersistentSettings, 'setPersistentSettings')(updates);
      const stateUpdates = {
        ...updates,
        ...sessionUpdates,
        ...(oauthFlowTimeoutDisabled ? {
          oauthFlowDeadlineAt: null,
          oauthFlowDeadlineSourceUrl: null,
        } : {}),
      };
      if (hasOwn(updates, 'icloudHostPreference')) {
        const nextHostPreference = String(updates.icloudHostPreference || '').trim().toLowerCase();
        stateUpdates.preferredIcloudHost = nextHostPreference === 'icloud.com' || nextHostPreference === 'icloud.com.cn'
          ? nextHostPreference
          : '';
      }
      if (stepModeChanged && typeof getStepIdsForState === 'function') {
        const nextStateForSteps = { ...currentState, ...stateUpdates };
        const nextNodeIds = typeof getNodeIdsForState === 'function' ? getNodeIdsForState(nextStateForSteps) : getStepIdsForState(nextStateForSteps)
          .map((stepId) => requireHandler(getStepKeyForState, 'getStepKeyForState')(stepId, nextStateForSteps)).filter(Boolean);
        const routeDefaults = rootScope.MultiPageStepDefinitions?.getDefaultNodeStatuses?.(nextStateForSteps) || {};
        stateUpdates.nodeStatuses = Object.fromEntries(nextNodeIds.map((nodeId) => [nodeId, String(routeDefaults[nodeId] || 'pending').trim()]));
        stateUpdates.workflowVersion = rootScope.MultiPageStepDefinitions?.WORKFLOW_VERSION || 3;
        stateUpdates.currentNodeId = '';
      }
      await requireHandler(setState, 'setState')(stateUpdates);
      await syncCustomEmailPoolTrialEligibilityTransitions?.(currentState?.customEmailPoolEntries, updates.customEmailPoolEntries, { enabled: allowCustomEmailPoolStatusReset });
      if (Boolean(currentState?.contributionMode) && typeof setContributionMode === 'function') await setContributionMode(true);
      if (Object.keys(stateUpdates).length > 0 && typeof broadcastDataUpdate === 'function') broadcastDataUpdate(stateUpdates);
      if (modeChanged) {
        const selectedPlusPaymentMethod = getPlusPaymentMethodLabel(stateUpdates.plusPaymentMethod ?? currentState?.plusPaymentMethod ?? 'legacyWallet');
        await requireHandler(addLog, 'addLog')(
          Boolean(updates.plusModeEnabled)
            ? `Plus 模式已开启，已切换为 ChatGPT 会话读取 步骤，当前支付方式：${selectedPlusPaymentMethod}。`
            : 'Plus 模式已关闭，已恢复普通注册授权步骤。',
          'info'
        );
      } else if (plusPaymentChanged && nextPlusModeEnabled) {
        const selectedPlusPaymentMethod = getPlusPaymentMethodLabel(
          stateUpdates.plusPaymentMethod ?? currentState?.plusPaymentMethod ?? 'legacyWallet'
        );
        await requireHandler(addLog, 'addLog')(`Plus 支付方式已切换为 ${selectedPlusPaymentMethod}，已更新对应的 Plus 步骤。`, 'info');
      }
      return {
        ok: true,
        modeValidation,
        state: await requireHandler(getState, 'getState')(),
      };
    }
    async function exportSettings(payload = {}) {
      return { ok: true, ...(await requireHandler(exportSettingsBundle, 'exportSettingsBundle')(payload || {})) };
    }
    async function importSettings(payload = {}) {
      const state = await requireHandler(importSettingsBundle, 'importSettingsBundle')(payload?.config || null);
      return { ok: true, state };
    }
    return {
      SAVE_SETTING: saveSetting,
      EXPORT_SETTINGS: exportSettings,
      IMPORT_SETTINGS: importSettings,
    };
  }

  return {
    createSettingsRoutes,
  };
});
