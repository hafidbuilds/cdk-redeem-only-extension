(function attachRouterCoreRoutes(root, factory) {
  const api = factory();
  root.MultiPageRouterCoreRoutes = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createRouterCoreRoutesModule() {
  function getRootScope() {
    return typeof self !== 'undefined' ? self : globalThis;
  }

  function createRouterCoreRoutes(deps = {}) {
    const {
      addLog,
      broadcastDataUpdate,
      buildLuckmailSessionSettingsPayload,
      buildPersistentSettingsPayload,
      mergeCustomEmailPoolEntriesForSettings = null,
      cancelScheduledAutoRun,
      checkIcloudSession,
      clearAccountRunHistory,
      deleteAccountRunHistoryRecords,
      clearAutoRunTimerAlarm,
      clearStopRequest,
      deleteIcloudAlias,
      deleteUsedIcloudAliases,
      checkFreeAccountEligibility = null,
      fillFreeAccountAccessTokens = null,
      startFillFreeAccountSessions = null,
      resumeFillFreeAccountSessions = null,
      stopFillFreeAccountSessions = null,
      isFreeAccountSessionFillActive = null,
      exportSettingsBundle,
      fetchGeneratedEmail,
      getPendingAutoRunTimerPlan,
      getState,
      getNodeIdsForState,
      getStepIdsForState,
      getStepKeyForState,
      handleAutoRunLoopUnhandledError,
      importSettingsBundle,
      invalidateDownstreamAfterStepRestart,
      isAutoRunLockedState,
      launchAutoRunTimerPlan,
      listIcloudAliases,
      lockAutomationWindowFromMessage,
      ensureManualInteractionAllowed,
      ensureManualStepPrerequisites,
      executeNodeForManualChain,
      findStepByNodeId,
      getNextNodeIdForState,
      normalizeHotmailAccounts,
      normalizeRunCount,
      AUTO_RUN_TIMER_KIND_SCHEDULED_START,
      resolveSignupMethod,
      resetState,
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
    } = deps;

    function normalizeString(value = '') {
      return String(value || '').trim();
    }

    const taskTracker = getRootScope().MultiPageTaskRoutes?.createTaskOperationTracker?.({ getNodeIdsForState, getState }) || {};
    const runTrackedTask = taskTracker.runTrackedTask || (async (_type, _payload, operation) => ({ taskId: '', result: await operation(null) }));

    async function ensureSessionFillIdle(actionLabel = '执行当前操作') {
      if (typeof isFreeAccountSessionFillActive === 'function' && await isFreeAccountSessionFillActive()) {
        throw new Error(`补充 Session 任务运行中，当前不能${actionLabel}。`);
      }
    }

    async function handleResetRoute() {
      clearStopRequest();
      await clearAutoRunTimerAlarm();
      await resetState();
      await addLog('流程已重置', 'info');
      return { ok: true };
    }

    async function handleExecuteNodeRoute(_payload, message, sender) {
      clearStopRequest();
      const requestState = await getState();
      const nodeId = String(message.nodeId || message.payload?.nodeId || '').trim();
      const resolvedStep = findStepByNodeId(nodeId, requestState);
      if (!nodeId || !resolvedStep) {
        throw new Error('EXECUTE_NODE 缺少 nodeId。');
      }
      if (message.source === 'sidepanel') {
        await lockAutomationWindowFromMessage(message, sender);
        await ensureManualInteractionAllowed('手动执行节点');
      }
      if (message.source === 'sidepanel') {
        await ensureManualStepPrerequisites(resolvedStep, nodeId, requestState);
      }
      if (message.source === 'sidepanel') {
        await invalidateDownstreamAfterStepRestart(resolvedStep, { logLabel: `节点 ${nodeId} 重新执行` });
      }
      if (nodeId === 'chatgpt-session-reader-create') {
        await setState({
          legacyWalletGenericErrorRecoveryCount: 0,
          legacyWalletApprovalBranchRecoveryCount: 0,
        });
      }
      if (message.payload.email) {
        await setEmailState(message.payload.email);
      }
      if (message.payload.emailPrefix !== undefined) {
        await setPersistentSettings({ emailPrefix: message.payload.emailPrefix });
        await setState({ emailPrefix: message.payload.emailPrefix });
      }
      const manualEnableTotpUseCurrentSession = message.source === 'sidepanel' && nodeId === 'enable-totp-mfa';
      const manualEnablePasskeyUseCurrentSession = message.source === 'sidepanel' && nodeId === 'enable-passkey';
      if (manualEnableTotpUseCurrentSession || manualEnablePasskeyUseCurrentSession) {
        await setState({
          manualEnableTotpUseCurrentSession: manualEnableTotpUseCurrentSession ? true : null,
          manualEnablePasskeyUseCurrentSession: manualEnablePasskeyUseCurrentSession ? true : null,
        });
      }
      try {
        await executeNodeForManualChain(nodeId);

        const latestExecutionState = await getState();
        if (message.source === 'sidepanel' && shouldAutoContinueManualNode(nodeId, latestExecutionState)) {
          const nextNodeId = getNextNodeIdForState(nodeId, latestExecutionState);
          if (nextNodeId) {
            await addLog(
              `步骤 ${resolvedStep} 已完成，正在继续执行下一节点 ${nextNodeId}。`,
              'info',
              { step: resolvedStep, nodeId }
            );
            await executeNodeForManualChain(nextNodeId);
          }
        }
      } finally {
        if (manualEnableTotpUseCurrentSession || manualEnablePasskeyUseCurrentSession) {
          await setState({
            manualEnableTotpUseCurrentSession: null,
            manualEnablePasskeyUseCurrentSession: null,
          });
        }
      }
      return { ok: true };
    }

    async function applyContributionMode(message) {
      if (Boolean(message.payload?.contributionMode) && typeof setContributionMode === 'function') {
        await setContributionMode(true);
        if (typeof setState === 'function') {
          const contributionNickname = String(message.payload?.contributionNickname || '').trim();
          const contributionQq = String(message.payload?.contributionQq || '').trim();
          await setState({
            contributionNickname,
            contributionQq,
          });
        }
      }
    }

    async function handleAutoRunRoute(_payload, message, sender) {
      clearStopRequest();
      if (message.source === 'sidepanel') {
        await lockAutomationWindowFromMessage(message, sender);
      }
      await applyContributionMode(message);
      const state = await getState();
      const totalRuns = normalizeRunCount(message.payload?.totalRuns || 1);
      const autoRunStartValidation = validateAutoRunStart(state, { state, totalRuns });
      if (autoRunStartValidation?.ok === false) {
        throw new Error(autoRunStartValidation.errors?.[0]?.message || '当前设置不支持启动自动流程。');
      }
      if (getPendingAutoRunTimerPlan(state)) {
        throw new Error('已有自动运行倒计时计划，请先取消或立即开始。');
      }
      const autoRunSkipFailures = true;
      const autoRunRetryNonFreeTrial = Boolean(message.payload?.autoRunRetryNonFreeTrial);
      const autoRunRetryLegacyWalletCallback = Boolean(message.payload?.autoRunRetryLegacyWalletCallback);
      const mode = message.payload?.mode === 'continue' ? 'continue' : 'restart';
      await setState({ autoRunSkipFailures, autoRunRetryNonFreeTrial, autoRunRetryLegacyWalletCallback });
      const runtime = taskTracker.runtime;
      if (!runtime?.startTask || !runtime?.executeTask) {
        startAutoRunLoop(totalRuns, { autoRunSkipFailures, autoRunRetryNonFreeTrial, autoRunRetryLegacyWalletCallback, mode });
        return { ok: true };
      }
      const task = await runtime.startTask(taskTracker.buildTaskInput('register', message.payload || {}, state, {
        checkpoint: { activeFlowId: state.activeFlowId || '', nodeId: state.currentNodeId || '', registrationEmailSubmitted: false },
      }));
      runtime.executeTask(task.taskId, async (taskContext) => {
        await taskContext.checkpoint({ nodeId: state.currentNodeId || '', activeFlowId: state.activeFlowId || '' });
        await startAutoRunLoop(totalRuns, { autoRunSkipFailures, autoRunRetryNonFreeTrial, autoRunRetryLegacyWalletCallback, mode, taskId: task.taskId });
        const finalState = await getState();
        if (getPendingAutoRunTimerPlan(finalState)) {
          await taskContext.setStatus('retry_wait', {
            checkpoint: { nodeId: finalState.currentNodeId || '', waitingForTimer: true },
          });
        }
        return { completedRuns: Number(finalState.autoRunCurrentRun) || 0, totalRuns };
      }).catch(() => {});
      return { ok: true, taskId: task.taskId };
    }

    async function handleScheduleAutoRunRoute(_payload, message, sender) {
      clearStopRequest();
      if (message.source === 'sidepanel') {
        await lockAutomationWindowFromMessage(message, sender);
      }
      await applyContributionMode(message);
      const state = await getState();
      const totalRuns = normalizeRunCount(message.payload?.totalRuns || 1);
      const autoRunStartValidation = validateAutoRunStart(state, { state, totalRuns });
      if (autoRunStartValidation?.ok === false) {
        throw new Error(autoRunStartValidation.errors?.[0]?.message || '当前设置不支持启动自动流程。');
      }
      return await scheduleAutoRun(totalRuns, {
        delayMinutes: message.payload?.delayMinutes,
        autoRunSkipFailures: true,
        autoRunRetryNonFreeTrial: Boolean(message.payload?.autoRunRetryNonFreeTrial),
        autoRunRetryLegacyWalletCallback: Boolean(message.payload?.autoRunRetryLegacyWalletCallback),
        mode: message.payload?.mode,
      });
    }

    async function handleStartScheduledAutoRunNowRoute(_payload, message, sender) {
      clearStopRequest();
      if (message.source === 'sidepanel') {
        await lockAutomationWindowFromMessage(message, sender);
      }
      const started = await launchAutoRunTimerPlan('manual', {
        expectedKinds: [AUTO_RUN_TIMER_KIND_SCHEDULED_START],
      });
      if (!started) {
        throw new Error('当前没有可立即开始的倒计时计划。');
      }
      return { ok: true };
    }

    async function handleCancelScheduledAutoRunRoute() {
      const cancelled = await cancelScheduledAutoRun();
      if (!cancelled) {
        throw new Error('当前没有可取消的倒计时计划。');
      }
      return { ok: true };
    }

    async function handleSkipAutoRunCountdownRoute(_payload, message, sender) {
      clearStopRequest();
      if (message.source === 'sidepanel') {
        await lockAutomationWindowFromMessage(message, sender);
      }
      const skipped = await skipAutoRunCountdown();
      if (!skipped) {
        throw new Error('当前没有可立即开始的倒计时。');
      }
      return { ok: true };
    }

    async function handleResumeAutoRunRoute(_payload, message, sender) {
      clearStopRequest();
      if (message.source === 'sidepanel') {
        await lockAutomationWindowFromMessage(message, sender);
      }
      if (message.payload.email) {
        await setEmailState(message.payload.email);
      }
      resumeAutoRun().catch((error) => {
        handleAutoRunLoopUnhandledError(error).catch(() => {});
      });
      return { ok: true };
    }

    async function handleCheckFreeAccountEligibilityRoute(_payload, message) {
      await ensureSessionFillIdle('复检资格');
      clearStopRequest();
      const payload = message.payload || {};
      const allowAutoRunEmailPoolCheck = payload.source === 'custom-email-pool-trial-eligibility-check'
        && Array.isArray(payload.credentials)
        && payload.credentials.length > 0
        && payload.credentials.every((credential) => String(
          credential?.accessToken
          || credential?.token
          || credential?.access_token
          || ''
        ).trim());
      const state = await getState();
      if (isAutoRunLockedState(state) && !allowAutoRunEmailPoolCheck) {
        throw new Error('自动注册运行中，当前不能手动检查 Free 账号试用资格。');
      }
      if (typeof checkFreeAccountEligibility !== 'function') {
        throw new Error('Free 账号试用资格检查能力尚未接入。');
      }
      const operationPayload = {
        ...payload,
        source: payload.source
          || 'manual-trial-eligibility-check',
      };
      const tracked = await runTrackedTask('check_eligibility', operationPayload, async (taskContext) => {
        await taskContext?.checkpoint?.({ nodeId: 'trial-eligibility-check' });
        return checkFreeAccountEligibility(operationPayload);
      });
      return { ok: true, taskId: tracked.taskId, ...tracked.result };
    }

    async function handleFillFreeAccountAccessTokensRoute(_payload, message) {
      await ensureSessionFillIdle('补充 AT');
      clearStopRequest();
      const state = await getState();
      if (isAutoRunLockedState(state)) {
        throw new Error('自动注册运行中，当前不能补充 Free 账号 AT。');
      }
      if (typeof fillFreeAccountAccessTokens !== 'function') {
        throw new Error('Free 账号 AT 补充能力尚未接入。');
      }
      const tracked = await runTrackedTask('refresh_access_token', message.payload || {}, async (taskContext) => {
        await taskContext?.checkpoint?.({ nodeId: 'fill-access-token', remoteRequestSent: false });
        return fillFreeAccountAccessTokens(message.payload || {});
      });
      return { ok: true, taskId: tracked.taskId, ...tracked.result };
    }

    async function handleStartFillFreeAccountSessionsRoute(payload = {}) {
      clearStopRequest();
      const state = await getState();
      if (isAutoRunLockedState(state)) {
        throw new Error('自动注册运行中，当前不能补充 Free 账号 Session。');
      }
      if (typeof startFillFreeAccountSessions !== 'function') {
        throw new Error('Free 账号 Session 补充能力尚未接入。');
      }
      return { ok: true, ...(await startFillFreeAccountSessions(payload)) };
    }

    async function handleResumeFillFreeAccountSessionsRoute(payload = {}) {
      clearStopRequest();
      const state = await getState();
      if (isAutoRunLockedState(state)) {
        throw new Error('自动注册运行中，当前不能继续补充 Free 账号 Session。');
      }
      if (typeof resumeFillFreeAccountSessions !== 'function') {
        throw new Error('Free 账号 Session 续跑能力尚未接入。');
      }
      return { ok: true, ...(await resumeFillFreeAccountSessions(payload)) };
    }

    async function handleStopFillFreeAccountSessionsRoute(payload = {}) {
      if (typeof stopFillFreeAccountSessions !== 'function') {
        throw new Error('Free 账号 Session 停止能力尚未接入。');
      }
      return { ok: true, ...(await stopFillFreeAccountSessions(payload)) };
    }

    const rootScope = getRootScope();
    const routeHandlers = {
      ...(rootScope.MultiPageMembershipRoutes?.createMembershipRoutes?.({
        checkTrialEligibility: handleCheckFreeAccountEligibilityRoute,
        fillFreeAccessTokens: handleFillFreeAccountAccessTokensRoute,
        startFillSessions: handleStartFillFreeAccountSessionsRoute,
        resumeFillSessions: handleResumeFillFreeAccountSessionsRoute,
        stopFillSessions: handleStopFillFreeAccountSessionsRoute,
      }) || {}),
      ...(rootScope.MultiPageWorkflowRoutes?.createWorkflowRoutes?.({
        autoRun: handleAutoRunRoute,
        cancelScheduledAutoRun: handleCancelScheduledAutoRunRoute,
        executeNode: handleExecuteNodeRoute,
        reset: handleResetRoute,
        resumeAutoRun: handleResumeAutoRunRoute,
        scheduleAutoRun: handleScheduleAutoRunRoute,
        skipAutoRunCountdown: handleSkipAutoRunCountdownRoute,
        startScheduledAutoRunNow: handleStartScheduledAutoRunNowRoute,
      }) || {}),
      ...(rootScope.MultiPageSettingsRoutes?.createSettingsRoutes?.({
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
        setPersistentSettings,
        setState,
        syncCustomEmailPoolTrialEligibilityTransitions: (currentEntries, nextEntries, options) => rootScope.MultiPageRuntimeCustomEmailPoolState?.syncCustomEmailPoolTrialEligibilityTransitions?.(currentEntries, nextEntries, { ...options, accountLifecycleService: rootScope.MultiPageRuntimeAccountLifecycleService }),
        validateModeSwitch,
      }) || {}),
      ...(rootScope.MultiPageAccountRecordRoutes?.createAccountRecordRoutes?.({
        accountRepository: rootScope.MultiPageRuntimeAccountRepository,
        clearAccountRunHistory,
        deleteAccountRunHistoryRecords,
        getState,
        isAutoRunLockedState,
      }) || {}),
      ...(rootScope.MultiPageTaskRoutes?.createTaskRoutes?.({
        repository: rootScope.MultiPageRuntimeTaskRepository,
        eventStore: rootScope.MultiPageRuntimeTaskEventStore,
        runtime: rootScope.MultiPageRuntimeTaskRuntime,
      }) || {}),
      ...(rootScope.MultiPageEmailPoolRoutes?.createEmailPoolRoutes?.({
        checkIcloudSession,
        clearStopRequest,
        deleteIcloudAlias,
        deleteUsedIcloudAliases,
        fetchGeneratedEmail,
        getState,
        isAutoRunLockedState,
        listIcloudAliases,
        resumeAutoRun,
        setEmailState,
        setEmailStateSilently,
        setIcloudAliasPreservedState,
        setIcloudAliasUsedState,
      }) || {}),
    };

    return {
      normalizeString,
      routeHandlers,
    };
  }

  return {
    createRouterCoreRoutes,
  };
});
