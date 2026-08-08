(function attachBackgroundMessageRouter(root, factory) {
  root.MultiPageBackgroundMessageRouter = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundMessageRouterModule() {
  function createMessageRouter(deps = {}) {
    const {
      addLog,
      appendAccountRunRecord,
      batchUpdateLuckmailPurchases,
      buildLocalhostCleanupPrefix,
      buildLuckmailSessionSettingsPayload,
      buildPersistentSettingsPayload,
      mergeCustomEmailPoolEntriesForSettings = null,
      broadcastDataUpdate,
      cancelScheduledAutoRun,
      checkIcloudSession,
      clearAccountRunHistory,
      deleteAccountRunHistoryRecords,
      clearAutoRunTimerAlarm,
      clearLuckmailRuntimeState,
      clearStopRequest,
      closeLocalhostCallbackTabs,
      closeTabsByUrlPrefix,
      completeNodeFromBackground,
      deleteHotmailAccount,
      deleteHotmailAccounts,
      deleteIcloudAlias,
      deleteUsedIcloudAliases,
      disableUsedLuckmailPurchases,
      doesNodeUseCompletionSignal,
      ensureMail2925MailboxSession,
      ensureManualInteractionAllowed,
      executeNode,
      executeNodeViaCompletionSignal,
      exportCurrentSessionJson,
      exportUpiAccountCredentialBackupTextFile = null,
      checkFreeAccountEligibility = null,
      deleteFreeAccountResults = null,
      exportFreeAccountResults = null,
      fillFreeAccountAccessTokens = null,
      startFillFreeAccountSessions = null,
      resumeFillFreeAccountSessions = null,
      stopFillFreeAccountSessions = null,
      isFreeAccountSessionFillActive = null,
      getFreeAccountResults = null,
      importFreeAccountResults = null,
      loginFreeAccount = null,
      refreshFreeAccountAccessTokens = null,
      stopFreeAccountCheck = null,
      exportSettingsBundle,
      ensureContentScriptReadyOnTabUntilStopped = null,
      fetchHostedCheckoutVerificationCodeManually = null,
      testCheckoutConversionProxy = null,
      fetchGeneratedEmail,
      refreshCardHelperCardBalance,
      refreshOAuthTimeoutWindowAfterCheckoutSuccess = null,
      finalizeStep3Completion,
      finalizeIcloudAliasAfterSuccessfulFlow,
      findHotmailAccount,
      findLegacyWalletAccount,
      flushCommand,
      getCurrentLuckmailPurchase,
      getCurrentLegacyWalletAccount,
      getCurrentMail2925Account,
      getPendingAutoRunTimerPlan,
      getSourceLabel,
      getState,
      getNodeDefinitionForState,
      getNodeIdsForState,
      getStepIdByNodeIdForState,
      getStepDefinitionForState,
      getStepIdsForState,
      getLastStepIdForState,
      resolveSignupMethod = (state = {}) => {
        const rootScope = typeof self !== 'undefined' ? self : globalThis;
        const capabilityRegistry = rootScope.MultiPageFlowCapabilities?.createFlowCapabilityRegistry?.({
          defaultFlowId: 'openai',
        }) || null;
        if (capabilityRegistry?.resolveSignupMethod) {
          return capabilityRegistry.resolveSignupMethod(state, 'email');
        }
        return 'email';
      },
      validateAutoRunStart = (state = {}, options = {}) => {
        const validationState = options?.state || state;
        const rootScope = typeof self !== 'undefined' ? self : globalThis;
        const capabilityRegistry = rootScope.MultiPageFlowCapabilities?.createFlowCapabilityRegistry?.({
          defaultFlowId: 'openai',
        }) || null;
        if (!capabilityRegistry?.validateAutoRunStart) {
          return { ok: true, errors: [] };
        }
        return capabilityRegistry.validateAutoRunStart({
          activeFlowId: options?.activeFlowId ?? validationState?.activeFlowId,
          panelMode: options?.panelMode ?? validationState?.panelMode,
          signupMethod: options?.signupMethod ?? validationState?.signupMethod,
          state: validationState,
        });
      },
      validateModeSwitch = (state = {}, options = {}) => {
        const validationState = options?.state || state;
        const rootScope = typeof self !== 'undefined' ? self : globalThis;
        const capabilityRegistry = rootScope.MultiPageFlowCapabilities?.createFlowCapabilityRegistry?.({
          defaultFlowId: 'openai',
        }) || null;
        if (!capabilityRegistry?.validateModeSwitch) {
          return {
            ok: true,
            changedKeys: Array.isArray(options?.changedKeys) ? options.changedKeys : [],
            errors: [],
            normalizedUpdates: {},
          };
        }
        return capabilityRegistry.validateModeSwitch({
          activeFlowId: options?.activeFlowId ?? validationState?.activeFlowId,
          changedKeys: options?.changedKeys,
          panelMode: options?.panelMode ?? validationState?.panelMode,
          signupMethod: options?.signupMethod ?? validationState?.signupMethod,
          state: validationState,
        });
      },
      getTabId,
      getStopRequested,
      handleAutoRunLoopUnhandledError,
      importSettingsBundle,
      invalidateDownstreamAfterStepRestart,
      isCloudflareSecurityBlockedError,
      isAutoRunLockedState,
      isHotmailProvider,
      isLocalhostOAuthCallbackUrl,
      isLuckmailProvider,
      isStopError,
      isTabAlive,
      launchAutoRunTimerPlan,
      listIcloudAliases,
      listLuckmailPurchasesForManagement,
      markCurrentCustomEmailPoolEntryUsed,
      markCurrentRegistrationAccountUsed,
      normalizeHotmailAccounts,
      normalizeMail2925Accounts,
      normalizeLegacyWalletAccounts,
      normalizeRunCount,
      AUTO_RUN_TIMER_KIND_SCHEDULED_START,
      notifyNodeComplete,
      notifyNodeError,
      patchMail2925Account,
      patchHotmailAccount,
      pollContributionStatus,
      pauseRemovedPaymentWorkerJob = null,
      registerTab,
      requestStop,
      handleCloudflareSecurityBlocked,
      resetState,
      resumeRemovedPaymentWorkerJob = null,
      resumeAutoRun,
      scheduleAutoRun,
      sendTabMessageUntilStopped = null,
      selectLuckmailPurchase,
      sleepWithStop = async () => {},
      setCurrentLegacyWalletAccount,
      setCurrentMail2925Account,
      setCurrentHotmailAccount,
      setContributionMode,
      setEmailState,
      setEmailStateSilently,
      persistRegistrationEmailState,
      setIcloudAliasPreservedState,
      setIcloudAliasUsedState,
      setLuckmailPurchaseDisabledState,
      setLuckmailPurchasePreservedState,
      setLuckmailPurchaseUsedState,
      setPersistentSettings,
      setState,
      setNodeStatus,
      skipAutoRunCountdown,
      skipNode,
      startContributionFlow,
      startAutoRunLoop,
      waitForTabCompleteUntilStopped = async () => {},
      deleteMail2925Account,
      deleteMail2925Accounts,
      syncHotmailAccounts,
      syncLegacyWalletAccounts,
      testHotmailAccountMailAccess,
      upsertLegacyWalletAccount,
      upsertMail2925Account,
      upsertHotmailAccount,
      verifyHotmailAccount,
    } = deps;

    function getRouterNodeProtocolServiceModule() {
      const rootScope = typeof self !== 'undefined' ? self : globalThis;
      return rootScope.MultiPageRouterNodeProtocolService || {};
    }

    function getRouterPaymentSessionServiceModule() {
      const rootScope = typeof self !== 'undefined' ? self : globalThis;
      return rootScope.MultiPageRouterPaymentSessionService || {};
    }

    function getRouterCoreRoutesModule() {
      const rootScope = typeof self !== 'undefined' ? self : globalThis;
      return rootScope.MultiPageRouterCoreRoutes || {};
    }

    function getRouterMessageDispatcherModule() {
      const rootScope = typeof self !== 'undefined' ? self : globalThis;
      return rootScope.MultiPageRouterMessageDispatcher || {};
    }

    const createRouterPaymentSessionService = getRouterPaymentSessionServiceModule().createRouterPaymentSessionService;
    if (typeof createRouterPaymentSessionService !== 'function') {
      throw new Error('Router payment session service module is not loaded.');
    }
    const {
      cleanupPaymentTabsAfterSuccessfulFlow,
      normalizePlusPaymentMethod,
      refreshChatGptSessionAndInspectPlusActivation,
    } = createRouterPaymentSessionService({
      addLog,
      ensureContentScriptReadyOnTabUntilStopped,
      getState,
      getTabId,
      registerTab,
      sendTabMessageUntilStopped,
      setState,
      sleepWithStop,
      waitForTabCompleteUntilStopped,
    });

    const createRouterNodeProtocolService = getRouterNodeProtocolServiceModule().createRouterNodeProtocolService;
    if (typeof createRouterNodeProtocolService !== 'function') {
      throw new Error('Router node protocol service module is not loaded.');
    }
    const {
      appendManualAccountRunRecordIfNeeded,
      ensureManualStepPrerequisites,
      executeNodeForManualChain,
      findStepByNodeId,
      getLastNodeIdForState,
      getNextNodeIdForState,
      getStepKeyForState,
      handleStepData,
      isStaleAutoRunNodeMessage,
      lockAutomationWindowFromMessage,
      normalizeNodeProtocolMessage,
      shouldAutoContinueManualNode,
    } = createRouterNodeProtocolService({
      addLog,
      appendAccountRunRecord,
      broadcastDataUpdate,
      buildLocalhostCleanupPrefix,
      cleanupPaymentTabsAfterSuccessfulFlow,
      clearLuckmailRuntimeState,
      closeLocalhostCallbackTabs,
      closeTabsByUrlPrefix,
      doesNodeUseCompletionSignal,
      executeNode,
      executeNodeViaCompletionSignal,
      finalizeIcloudAliasAfterSuccessfulFlow,
      getCurrentLuckmailPurchase,
      getNodeIdsForState,
      getState,
      getStepDefinitionForState,
      getStepIdByNodeIdForState,
      getStepIdsForState,
      getTabId,
      isAutoRunLockedState,
      isHotmailProvider,
      isLocalhostOAuthCallbackUrl,
      isLuckmailProvider,
      isTabAlive,
      markCurrentRegistrationAccountUsed,
      normalizePlusPaymentMethod,
      patchHotmailAccount,
      patchMail2925Account,
      setEmailState,
      setLuckmailPurchaseUsedState,
      setNodeStatus,
      setState,
    });

    const createRouterCoreRoutes = getRouterCoreRoutesModule().createRouterCoreRoutes;
    if (typeof createRouterCoreRoutes !== 'function') {
      throw new Error('Router core routes module is not loaded.');
    }
    const {
      normalizeString,
      routeHandlers,
    } = createRouterCoreRoutes({
      AUTO_RUN_TIMER_KIND_SCHEDULED_START,
      addLog,
      broadcastDataUpdate,
      buildLuckmailSessionSettingsPayload,
      buildPersistentSettingsPayload,
      mergeCustomEmailPoolEntriesForSettings,
      cancelScheduledAutoRun,
      checkIcloudSession,
      checkFreeAccountEligibility,
      clearAccountRunHistory,
      clearAutoRunTimerAlarm,
      clearStopRequest,
      deleteAccountRunHistoryRecords,
      deleteIcloudAlias,
      deleteUsedIcloudAliases,
      ensureManualInteractionAllowed,
      ensureManualStepPrerequisites,
      executeNodeForManualChain,
      exportSettingsBundle,
      fetchGeneratedEmail,
      fillFreeAccountAccessTokens,
      startFillFreeAccountSessions,
      resumeFillFreeAccountSessions,
      stopFillFreeAccountSessions,
      isFreeAccountSessionFillActive,
      findStepByNodeId,
      getNextNodeIdForState,
      getNodeIdsForState,
      getPendingAutoRunTimerPlan,
      getState,
      getStepIdsForState,
      getStepKeyForState,
      handleAutoRunLoopUnhandledError,
      importSettingsBundle,
      invalidateDownstreamAfterStepRestart,
      isAutoRunLockedState,
      launchAutoRunTimerPlan,
      listIcloudAliases,
      lockAutomationWindowFromMessage,
      normalizeHotmailAccounts,
      normalizeRunCount,
      resetState,
      resolveSignupMethod,
      resumeAutoRun,
      scheduleAutoRun,
      setContributionMode,
      setEmailState,
      setEmailStateSilently,
      setIcloudAliasPreservedState,
      setIcloudAliasUsedState,
      setPersistentSettings,
      setState,
      shouldAutoContinueManualNode,
      skipAutoRunCountdown,
      startAutoRunLoop,
      validateAutoRunStart,
      validateModeSwitch,
    });

    const routerMessageDispatcherModule = getRouterMessageDispatcherModule();
    const createRouterMessageDispatcher = routerMessageDispatcherModule.createRouterMessageDispatcher;
    if (typeof createRouterMessageDispatcher !== 'function') {
      throw new Error('Router message dispatcher module is not loaded.');
    }
    const { handleMessage: dispatchMessage } = createRouterMessageDispatcher({
      addLog,
      appendAccountRunRecord,
      appendManualAccountRunRecordIfNeeded,
      batchUpdateLuckmailPurchases,
      broadcastDataUpdate,
      clearStopRequest,
      completeNodeFromBackground,
      deleteHotmailAccount,
      deleteHotmailAccounts,
      deleteMail2925Account,
      deleteMail2925Accounts,
      deleteFreeAccountResults,
      deps,
      disableUsedLuckmailPurchases,
      executeNodeForManualChain,
      exportCurrentSessionJson,
      exportUpiAccountCredentialBackupTextFile,
      exportFreeAccountResults,
      fetchHostedCheckoutVerificationCodeManually,
      fillFreeAccountAccessTokens,
      finalizeStep3Completion,
      findHotmailAccount,
      findStepByNodeId,
      flushCommand,
      getNextNodeIdForState,
      getNodeIdsForState,
      getSourceLabel,
      getState,
      getStepKeyForState,
      getStopRequested,
      getFreeAccountResults,
      handleCloudflareSecurityBlocked,
      handleStepData,
      importFreeAccountResults,
      isFreeAccountSessionFillActive,
      invalidateDownstreamAfterStepRestart,
      isAutoRunLockedState,
      isCloudflareSecurityBlockedError,
      isStaleAutoRunNodeMessage,
      isStopError,
      listLuckmailPurchasesForManagement,
      loginFreeAccount,
      normalizeHotmailAccounts,
      normalizeNodeProtocolMessage,
      normalizeString,
      notifyNodeComplete,
      notifyNodeError,
      patchHotmailAccount,
      patchMail2925Account,
      pauseRemovedPaymentWorkerJob,
      pollContributionStatus,
      refreshFreeAccountAccessTokens,
      refreshCardHelperCardBalance,
      refreshChatGptSessionAndInspectPlusActivation,
      refreshOAuthTimeoutWindowAfterCheckoutSuccess,
      registerTab,
      requestStop,
      resumeRemovedPaymentWorkerJob,
      routeHandlers,
      selectLuckmailPurchase,
      setContributionMode,
      setCurrentHotmailAccount,
      setCurrentLegacyWalletAccount,
      setCurrentMail2925Account,
      setLuckmailPurchaseDisabledState,
      setLuckmailPurchasePreservedState,
      setLuckmailPurchaseUsedState,
      setNodeStatus,
      setState,
      shouldAutoContinueManualNode,
      skipNode,
      startContributionFlow,
      stopFreeAccountCheck,
      syncHotmailAccounts,
      testCheckoutConversionProxy,
      testHotmailAccountMailAccess,
      upsertHotmailAccount,
      upsertLegacyWalletAccount,
      upsertMail2925Account,
      verifyHotmailAccount,
    });

    async function handleMessage(message, sender) {
      const response = await dispatchMessage(message, sender);
      const compactResponse = routerMessageDispatcherModule.compactRuntimeMessageResponse;
      return typeof compactResponse === 'function'
        ? compactResponse(message, response)
        : response;
    }

    return {
      handleMessage,
      handleStepData,
    };
  }

  return {
    createMessageRouter,
  };
});
