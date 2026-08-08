(function attachRouterMessageDispatcher(root, factory) {
  const api = factory();
  root.MultiPageRouterMessageDispatcher = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createRouterMessageDispatcherModule() {
  function getCollectionSize(value = null) {
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === 'object') return Object.keys(value).length;
    return 0;
  }

  function buildRuntimeStateMessageView(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const next = { ...source };
    const hasFreeResults = Object.prototype.hasOwnProperty.call(source, 'freeAccountResults');
    const hasAccountRecords = Object.prototype.hasOwnProperty.call(source, 'accountRecordsV2');
    const freeResults = source.freeAccountResults && typeof source.freeAccountResults === 'object'
      ? source.freeAccountResults
      : {};
    const accountRecords = source.accountRecordsV2 && typeof source.accountRecordsV2 === 'object'
      ? source.accountRecordsV2
      : {};
    if (hasFreeResults) {
      next.freeAccountSummary = {
        total: getCollectionSize(freeResults.items),
        eligibleCount: Math.max(0, Math.floor(Number(freeResults.eligibleCount) || 0)),
        ineligibleCount: Math.max(0, Math.floor(Number(freeResults.ineligibleCount) || 0)),
        failedCount: Math.max(0, Math.floor(Number(freeResults.failedCount) || 0)),
        checkingCount: Math.max(0, Math.floor(Number(freeResults.checkingCount) || 0)),
        unknownCount: Math.max(0, Math.floor(Number(freeResults.unknownCount) || 0)),
        updatedAt: String(freeResults.updatedAt || ''),
      };
    }
    if (hasAccountRecords) {
      next.accountRecordsSummary = {
        total: getCollectionSize(accountRecords.items),
        updatedAt: String(accountRecords.updatedAt || ''),
      };
    }
    delete next.freeAccountResults;
    delete next.accountRecordsV2;
    return next;
  }

  function compactRuntimeMessageResponse(message = {}, response = null) {
    if (String(message?.type || '').trim().toUpperCase() === 'GET_STATE') {
      return buildRuntimeStateMessageView(response);
    }
    if (!response || typeof response !== 'object' || Array.isArray(response)) return response;
    if (!Object.prototype.hasOwnProperty.call(response, 'state')) return response;
    return {
      ...response,
      state: buildRuntimeStateMessageView(response.state),
    };
  }

  function createRouterMessageDispatcher(context = {}) {
    const {
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
    } = context;

    const taskRuntime = (typeof self !== 'undefined' ? self : globalThis).MultiPageRuntimeTaskRuntime || null;

    async function ensureSessionFillIdle(actionLabel = '执行当前操作') {
      if (typeof isFreeAccountSessionFillActive === 'function' && await isFreeAccountSessionFillActive()) {
        throw new Error(`补充 Session 任务运行中，当前不能${actionLabel}。`);
      }
    }

    function getTaskAccountIds(payload = {}) {
      const credentials = Array.isArray(payload.credentials) ? payload.credentials : [];
      return Array.from(new Set([
        payload.email,
        payload.accountId,
        payload.credential?.email,
        ...credentials.map((item) => item?.email || item?.accountId),
      ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)));
    }

    async function runTrackedTask(type, payload, operation, checkpoint = {}) {
      if (!taskRuntime?.runTask) return { taskId: '', result: await operation(null) };
      const state = await getState();
      const accountIds = getTaskAccountIds(payload);
      return taskRuntime.runTask({
        type,
        accountId: accountIds.length === 1 ? accountIds[0] : '',
        accountIds,
        channel: String(payload.channel || '').trim().toLowerCase(),
        payload,
        progress: { current: 0, total: Math.max(1, accountIds.length) },
        checkpoint,
        workflowSnapshot: {
          activeFlowId: String(state.activeFlowId || '').trim(),
          workflowVersion: Number(state.workflowVersion) || 3,
          nodeIds: typeof getNodeIdsForState === 'function' ? getNodeIdsForState(state) : [],
        },
      }, operation);
    }

    async function handleMessage(rawMessage, sender) {
      const message = await normalizeNodeProtocolMessage(rawMessage);
      const rawType = String(message?.type || '').trim();
      const type = rawType;
      const payload = message?.payload || {};
      if (routeHandlers[type]) {
        return compactRuntimeMessageResponse(message, await routeHandlers[type](payload, message, sender));
      }

      switch (type) {
        case 'CONTENT_SCRIPT_READY': {
          const tabId = sender.tab?.id;
          if (tabId && message.source) {
            await registerTab(message.source, tabId);
            flushCommand(message.source, tabId);
            await addLog(`内容脚本已就绪：${getSourceLabel(message.source)}（标签页 ${tabId}）`);
          }
          return { ok: true };
        }

        case 'LOG': {
          const { message: msg, level, step: payloadStep, stepKey } = message.payload;
          const logStep = Math.floor(Number(message.step || payloadStep) || 0);
          await addLog(
            `[${getSourceLabel(message.source)}] ${msg}`,
            level,
            {
              step: logStep > 0 ? logStep : null,
              stepKey,
            }
          );
          return { ok: true };
        }

        case 'NODE_COMPLETE': {
          const currentStateForNode = await getState();
          const nodeId = String(message.nodeId || message.payload?.nodeId || '').trim();
          const activeTaskId = String(currentStateForNode.activeTaskId || '').trim();
          if (activeTaskId) {
            await taskRuntime?.createContext?.(activeTaskId)?.checkpoint?.({ nodeId, lastCompletedNodeId: nodeId });
            await taskRuntime?.createContext?.(activeTaskId)?.event?.({
              type: 'checkpoint',
              code: 'TASK_NODE_COMPLETED',
              nodeId,
              message: 'Workflow node completed',
            });
          }
          const resolvedStep = findStepByNodeId(nodeId, currentStateForNode);
          if (!nodeId || !resolvedStep) {
            throw new Error('NODE_COMPLETE 缺少 nodeId。');
          }
          const currentState = await getState();
          if (isStaleAutoRunNodeMessage(nodeId, currentState)) {
            await addLog(
              `自动运行：忽略过期的节点 ${nodeId} 完成消息，当前流程已在节点 ${currentState.currentNodeId || '未知'}。`,
              'warn',
              { nodeId }
            );
            return { ok: true, ignored: true };
          }
          if (getStopRequested()) {
            await setNodeStatus(nodeId, 'stopped');
            await appendManualAccountRunRecordIfNeeded(`node:${nodeId}:stopped`, null, '流程已被用户停止。');
            notifyNodeError(nodeId, '流程已被用户停止。');
            return { ok: true };
          }
          let completionPayload = { ...(message.payload || {}) };
          try {
            if (nodeId === 'fill-password' && typeof finalizeStep3Completion === 'function') {
              const shouldFinalizePasswordSubmit = completionPayload.skippedPasswordPage !== true
                && completionPayload.passwordSubmitAttempted !== false;
              let finalizeResult = null;
              if (shouldFinalizePasswordSubmit) {
                finalizeResult = await finalizeStep3Completion(completionPayload);
                if (finalizeResult && typeof finalizeResult === 'object' && !Array.isArray(finalizeResult)) {
                  completionPayload = {
                    ...completionPayload,
                    ...finalizeResult,
                  };
                }
              }
              completionPayload.signupPasswordCreated = Boolean(
                completionPayload.signupPasswordCreationAttempted === true
                && finalizeResult?.ready === true
                && finalizeResult?.existingTotpLoginRequired !== true
              );
            }
          } catch (error) {
            if (typeof isCloudflareSecurityBlockedError === 'function' && isCloudflareSecurityBlockedError(error)) {
              const userMessage = typeof handleCloudflareSecurityBlocked === 'function'
                ? await handleCloudflareSecurityBlocked(error)
                : (error?.message || String(error || ''));
              notifyNodeError(nodeId, '流程已被用户停止。');
              return { ok: true, error: userMessage };
            }
            const errorMessage = error?.message || String(error || '步骤 3 提交后确认失败');
            await setNodeStatus(nodeId, 'failed');
            await addLog(`失败：${errorMessage}`, 'error', {
              nodeId,
            });
            await appendManualAccountRunRecordIfNeeded(`node:${nodeId}:failed`, null, errorMessage);
            notifyNodeError(nodeId, error);
            return { ok: true, error: errorMessage };
          }

          const completionStateCandidate = await getState();
          const nodeIds = typeof getNodeIdsForState === 'function' ? getNodeIdsForState(completionStateCandidate) : [];
          const lastNodeId = nodeIds[nodeIds.length - 1] || '';
          const isFinalNode = nodeId === lastNodeId;
          const completionState = isFinalNode ? completionStateCandidate : null;
          await setNodeStatus(nodeId, 'completed');
          await addLog('已完成', 'ok', { nodeId });
          await handleStepData(resolvedStep, completionPayload);
          if (isFinalNode && typeof appendAccountRunRecord === 'function') {
            await appendAccountRunRecord('success', completionState);
          }
          notifyNodeComplete(nodeId, completionPayload);
          return { ok: true };
        }

        case 'NODE_ERROR': {
          const stateForNode = await getState();
          const nodeId = String(message.nodeId || message.payload?.nodeId || '').trim();
          const activeTaskId = String(stateForNode.activeTaskId || '').trim();
          if (activeTaskId) {
            await taskRuntime?.createContext?.(activeTaskId)?.checkpoint?.({ nodeId, lastFailedNodeId: nodeId });
            await taskRuntime?.createContext?.(activeTaskId)?.event?.({
              type: 'error',
              level: 'error',
              code: 'TASK_NODE_FAILED',
              nodeId,
              message: String(message.error || 'Workflow node failed'),
            });
          }
          const resolvedStep = findStepByNodeId(nodeId, stateForNode);
          if (!nodeId || !resolvedStep) {
            throw new Error('NODE_ERROR 缺少 nodeId。');
          }
          const staleCheckState = await getState();
          if (isStaleAutoRunNodeMessage(nodeId, staleCheckState)) {
            await addLog(
              `自动运行：忽略过期的节点 ${nodeId} 失败消息，当前流程已在节点 ${staleCheckState.currentNodeId || '未知'}。原始错误：${message.error || '未知错误'}`,
              'warn',
              { nodeId }
            );
            return { ok: true, ignored: true };
          }
          if (typeof isCloudflareSecurityBlockedError === 'function' && isCloudflareSecurityBlockedError(message.error)) {
            const userMessage = typeof handleCloudflareSecurityBlocked === 'function'
              ? await handleCloudflareSecurityBlocked(message.error)
              : (typeof message.error === 'string' ? message.error : String(message.error || ''));
            notifyNodeError(nodeId, '流程已被用户停止。');
            return { ok: true, error: userMessage };
          }
          if (isStopError(message.error)) {
            await setNodeStatus(nodeId, 'stopped');
            await addLog('已被用户停止', 'warn', { nodeId });
            await appendManualAccountRunRecordIfNeeded(`node:${nodeId}:stopped`, null, message.error);
            notifyNodeError(nodeId, message.error);
          } else {
            await setNodeStatus(nodeId, 'failed');
            await addLog(`失败：${message.error}`, 'error', {
              nodeId,
            });
            await appendManualAccountRunRecordIfNeeded(`node:${nodeId}:failed`, null, message.error);
            notifyNodeError(nodeId, message.error);
          }
          return { ok: true };
        }

        case 'RESOLVE_PLUS_MANUAL_CONFIRMATION': {
          const currentState = await getState();
          const step = Number(message.payload?.step) || Number(currentState?.plusManualConfirmationStep) || 0;
          const confirmationNodeId = getStepKeyForState(step, currentState) || String(currentState?.currentNodeId || '').trim();
          const confirmed = Boolean(message.payload?.confirmed);
          const requestId = String(message.payload?.requestId || '').trim();
          const currentRequestId = String(currentState?.plusManualConfirmationRequestId || '').trim();
          const method = String(currentState?.plusManualConfirmationMethod || '').trim().toLowerCase();
          const action = String(message.payload?.action || '').trim().toLowerCase();
          const isCardHelperOtp = method === 'legacyPay-otp';
          const isLegacyWalletHostedGenericError = method === 'legacyWallet-hosted-generic-error';
          if (!currentState?.plusManualConfirmationPending) {
            return { ok: true, ignored: true };
          }
          if (requestId && currentRequestId && requestId !== currentRequestId) {
            return { ok: true, ignored: true };
          }

          const clearManualConfirmationState = {
            plusManualConfirmationPending: false,
            plusManualConfirmationRequestId: '',
            plusManualConfirmationStep: 0,
            plusManualConfirmationMethod: '',
            plusManualConfirmationTitle: '',
            plusManualConfirmationMessage: '',
          };

          if (isLegacyWalletHostedGenericError) {
            if (action === 'check' && confirmed) {
              let inspection = null;
              try {
                clearStopRequest?.();
                inspection = await refreshChatGptSessionAndInspectPlusActivation();
              } catch (error) {
                const reason = normalizeString(error?.message || error) || '未知错误';
                await addLog(`步骤 6：已按你的选择刷新 ChatGPT 会话，但检查 PLUS 状态失败：${reason}`, 'warn');
                return { ok: true, plusActive: false, checkError: reason };
              }

              if (!inspection?.active) {
                const planSuffix = inspection?.planType ? `（planType=${inspection.planType}）` : '';
                await addLog(`步骤 6：已按你的选择刷新 ChatGPT 会话，但暂未检测到 PLUS 已生效${planSuffix}。`, 'warn');
                return { ok: true, plusActive: false, planType: inspection?.planType || '' };
              }

              await setState(clearManualConfirmationState);
              if (typeof broadcastDataUpdate === 'function') {
                broadcastDataUpdate(clearManualConfirmationState);
              }

              const completedNodeId = confirmationNodeId || 'chatgpt-session-reader-create';
              const completedStep = findStepByNodeId(completedNodeId, currentState) || step || 6;
              if (typeof invalidateDownstreamAfterStepRestart === 'function') {
                await invalidateDownstreamAfterStepRestart(completedStep, {
                  logLabel: 'LegacyWallet genericError 后检测到 PLUS 已生效',
                });
              }
              await addLog(`步骤 6：已检测到 PLUS 生效（planType=${inspection.planType || 'unknown'}），准备继续下一步。`, 'ok');
              if (typeof refreshOAuthTimeoutWindowAfterCheckoutSuccess === 'function') {
                await refreshOAuthTimeoutWindowAfterCheckoutSuccess({
                  source: 'legacyWallet-hosted-generic-error-check',
                });
              }
              await completeNodeFromBackground(completedNodeId, {
                plusDetectedPlanType: inspection.planType || '',
                chatgptSessionReaderTabId: inspection.tabId,
              });
              const latestExecutionState = await getState();
              if (shouldAutoContinueManualNode(completedNodeId, latestExecutionState)) {
                const nextNodeId = getNextNodeIdForState(completedNodeId, latestExecutionState);
                if (nextNodeId) {
                  await addLog(`步骤 ${completedStep} 已完成，正在继续执行下一节点 ${nextNodeId}。`, 'info', {
                    step: completedStep,
                    nodeId: completedNodeId,
                  });
                  await executeNodeForManualChain(nextNodeId);
                }
              }
              return { ok: true, plusActive: true, planType: inspection.planType || '' };
            }

            if (action === 'retry' && confirmed) {
              await setState({
                ...clearManualConfirmationState,
                legacyWalletGenericErrorRecoveryCount: 0,
                legacyWalletApprovalBranchRecoveryCount: 0,
              });
              if (typeof broadcastDataUpdate === 'function') {
                broadcastDataUpdate({
                  ...clearManualConfirmationState,
                  legacyWalletGenericErrorRecoveryCount: 0,
                  legacyWalletApprovalBranchRecoveryCount: 0,
                });
              }
              clearStopRequest?.();
              const retryNodeId = 'chatgpt-session-reader-create';
              const retryStep = findStepByNodeId(retryNodeId, currentState) || 6;
              await addLog('步骤 6：已按你的选择重新开始创建 ChatGPT 会话读取。', 'info');
              if (typeof invalidateDownstreamAfterStepRestart === 'function') {
                await invalidateDownstreamAfterStepRestart(retryStep, { logLabel: 'LegacyWallet genericError 后重试 ChatGPT 会话读取' });
              }
              await executeNodeForManualChain(retryNodeId);
              const latestExecutionState = await getState();
              if (shouldAutoContinueManualNode(retryNodeId, latestExecutionState)) {
                const nextNodeId = getNextNodeIdForState(retryNodeId, latestExecutionState);
                if (nextNodeId) {
                  await addLog(`步骤 ${retryStep} 已完成，正在继续执行下一节点 ${nextNodeId}。`, 'info', {
                    step: retryStep,
                    nodeId: retryNodeId,
                  });
                  await executeNodeForManualChain(nextNodeId);
                }
              }
              return { ok: true };
            }

            await setState(clearManualConfirmationState);
            if (typeof broadcastDataUpdate === 'function') {
              broadcastDataUpdate(clearManualConfirmationState);
            }

            const cancelMessage = '已取消 LegacyWallet Checkout 异常处理';
            await addLog(`步骤 ${step || 6}：${cancelMessage}。`, 'warn');
            return { ok: true };
          }

          if (isCardHelperOtp && confirmed) {
            const otp = String(message.payload?.otp || message.payload?.code || '').trim().replace(/[^\d]/g, '');
            if (!otp) {
              throw new Error('请输入 CARD_HELPER OTP 验证码。');
            }
            const otpUpdates = {
              ...clearManualConfirmationState,
              legacyPayHelperResolvedOtp: otp,
            };
            await setState(otpUpdates);
            if (typeof broadcastDataUpdate === 'function') {
              broadcastDataUpdate(otpUpdates);
            }
            await addLog(`步骤 ${step}：已收到 CARD_HELPER OTP，准备提交验证。`, 'ok');
            return { ok: true };
          }

          await setState(clearManualConfirmationState);
          if (typeof broadcastDataUpdate === 'function') {
            broadcastDataUpdate(clearManualConfirmationState);
          }

          if (confirmed) {
            const methodLabel = method === 'legacyPay' ? 'LegacyPay' : '手动';
            await addLog(`步骤 ${step}：已确认${methodLabel}订阅完成，准备继续下一步。`, 'ok');
            await completeNodeFromBackground(confirmationNodeId, {
              plusManualConfirmationMethod: currentState?.plusManualConfirmationMethod || '',
              plusManualConfirmedAt: Date.now(),
            });
            return { ok: true };
          }

          const cancelMessage = method === 'legacyPay'
            ? '已取消 LegacyPay 订阅确认'
            : (isCardHelperOtp ? '已取消 CARD_HELPER OTP 输入' : '已取消当前手动确认');
          await setNodeStatus(confirmationNodeId, 'failed');
          await addLog(`步骤 ${step}：${cancelMessage}。`, 'warn');
          await appendManualAccountRunRecordIfNeeded(
            confirmationNodeId ? `node:${confirmationNodeId}:failed` : 'failed',
            null,
            cancelMessage
          );
          notifyNodeError(confirmationNodeId, cancelMessage);
          return { ok: true };
        }

        case 'GET_STATE': {
          return buildRuntimeStateMessageView(await getState());
        }

        case 'EXPORT_CURRENT_SESSION_JSON': {
          if (typeof exportCurrentSessionJson !== 'function') {
            throw new Error('当前 SESSION JSON 导出能力未接入。');
          }
          return await exportCurrentSessionJson(message.payload || {});
        }

        case 'SET_CONTRIBUTION_MODE': {
          const enabled = Boolean(message.payload?.enabled);
          const state = await ensureManualInteractionAllowed(enabled ? '进入贡献模式' : '退出贡献模式');
          if (Object.values(state.nodeStatuses || {}).some((status) => status === 'running')) {
            throw new Error(enabled ? '当前有步骤正在执行，无法进入贡献模式。' : '当前有步骤正在执行，无法退出贡献模式。');
          }
          if (typeof setContributionMode !== 'function') {
            throw new Error('贡献模式切换能力未接入。');
          }
          return {
            ok: true,
            state: await setContributionMode(enabled),
          };
        }

        case 'START_CONTRIBUTION_FLOW': {
          const state = await ensureManualInteractionAllowed('开始贡献');
          if (Object.values(state.nodeStatuses || {}).some((status) => status === 'running')) {
            throw new Error('当前有步骤正在执行，无法开始贡献流程。');
          }
          if (typeof startContributionFlow !== 'function') {
            throw new Error('贡献 OAuth 流程尚未接入。');
          }
          return {
            ok: true,
            state: await startContributionFlow({
              nickname: message.payload?.nickname,
              qq: message.payload?.qq,
            }),
          };
        }

        case 'SET_CONTRIBUTION_PROFILE': {
          const state = await getState();
          if (!state?.contributionMode) {
            throw new Error('请先进入贡献模式。');
          }
          const nickname = String(message.payload?.nickname || '').trim();
          const qq = String(message.payload?.qq || '').trim();
          if (qq && !/^\d{1,20}$/.test(qq)) {
            throw new Error('QQ 只能填写数字，且长度不能超过 20 位。');
          }
          await setState({
            contributionNickname: nickname,
            contributionQq: qq,
          });
          return {
            ok: true,
            state: await getState(),
          };
        }

        case 'POLL_CONTRIBUTION_STATUS': {
          if (typeof pollContributionStatus !== 'function') {
            throw new Error('贡献状态轮询能力尚未接入。');
          }
          return {
            ok: true,
            state: await pollContributionStatus({
              reason: message.payload?.reason || 'sidepanel_poll',
            }),
          };
        }

        case 'TAKEOVER_AUTO_RUN': {
          await requestStop({ logMessage: '已确认手动接管，正在停止自动流程并切换为手动控制...' });
          await addLog('自动流程已切换为手动控制。', 'warn');
          return { ok: true };
        }

        case 'SKIP_NODE': {
          const nodeId = String(message.nodeId || message.payload?.nodeId || '').trim();
          if (!nodeId) {
            throw new Error('SKIP_NODE 缺少 nodeId。');
          }
          return await skipNode(nodeId);
        }

        case 'EXPORT_UPI_ACCOUNT_CREDENTIAL_BACKUPS': {
          if (typeof exportUpiAccountCredentialBackupTextFile !== 'function') {
            throw new Error('UPI 密码 2FA 备份导出能力尚未接入。');
          }
          return { ok: true, ...(await exportUpiAccountCredentialBackupTextFile()) };
        }

        case 'REFRESH_FREE_ACCOUNT_ACCESS_TOKENS': {
          await ensureSessionFillIdle('刷新 AT');
          clearStopRequest();
          const state = await getState();
          if (isAutoRunLockedState(state)) {
            throw new Error('自动流程运行中，当前不能检查并刷新 AT。');
          }
          if (typeof refreshFreeAccountAccessTokens !== 'function') {
            throw new Error('Free 账号 AT 检查刷新能力尚未接入。');
          }
          const refreshPayload = message.payload || {};
          const tracked = await runTrackedTask('refresh_access_token', refreshPayload, async (taskContext) => {
            await taskContext?.checkpoint?.({ nodeId: 'refresh-access-token', remoteRequestSent: false });
            return refreshFreeAccountAccessTokens(refreshPayload);
          });
          return { ok: true, taskId: tracked.taskId, ...tracked.result };
        }

        case 'LOGIN_FREE_ACCOUNT': {
          await ensureSessionFillIdle('登录账号');
          clearStopRequest();
          const state = await getState();
          if (isAutoRunLockedState(state)) {
            throw new Error('自动流程运行中，当前不能登录 UPI 分组账号。');
          }
          if (typeof loginFreeAccount !== 'function') {
            throw new Error('Free 账号登录能力尚未接入。');
          }
          const result = await loginFreeAccount({
            ...(message.payload || {}),
            source: 'row-login',
            readAccessToken: false,
            refreshAccessToken: false,
          });
          return { ok: true, ...result };
        }

        case 'IMPORT_FREE_ACCOUNT_RESULTS': {
          await ensureSessionFillIdle('导入或修改账号');
          clearStopRequest();
          if (typeof importFreeAccountResults !== 'function') {
            throw new Error('Free 账号导入能力尚未接入。');
          }
          const result = await importFreeAccountResults(message.payload || {});
          return {
            ok: true,
            results: result,
            importedCount: Math.max(0, Math.floor(Number(result?.importedCount) || 0)),
            restoredCount: Math.max(0, Math.floor(Number(result?.restoredCount) || 0)),
            restoredEmails: Array.isArray(result?.restoredEmails) ? result.restoredEmails : [],
            skippedCount: Math.max(0, Math.floor(Number(result?.skippedCount) || 0)),
            skippedEmails: Array.isArray(result?.skippedEmails) ? result.skippedEmails : [],
          };
        }

        case 'GET_FREE_ACCOUNT_RESULTS': {
          if (typeof getFreeAccountResults !== 'function') {
            throw new Error('Free 账号结果读取能力尚未接入。');
          }
          return { ok: true, results: await getFreeAccountResults() };
        }

        case 'DELETE_FREE_ACCOUNT_RESULTS': {
          await ensureSessionFillIdle('删除账号');
          if (typeof deleteFreeAccountResults !== 'function') {
            throw new Error('Free 账号结果删除能力尚未接入。');
          }
          return { ok: true, ...(await deleteFreeAccountResults(message.payload || {})) };
        }

        case 'EXPORT_FREE_ACCOUNT_RESULTS': {
          if (typeof exportFreeAccountResults !== 'function') {
            throw new Error('Free 账号导出能力尚未接入。');
          }
          return { ok: true, ...(await exportFreeAccountResults(message.payload || {})) };
        }

        case 'STOP_FREE_ACCOUNT_CHECK': {
          if (typeof stopFreeAccountCheck !== 'function') {
            throw new Error('Free 账号资格检测停止能力尚未接入。');
          }
          return { ok: true, results: await stopFreeAccountCheck() };
        }

        case 'REFRESH_CARD_HELPER_CARD_BALANCE': {
          if (typeof refreshCardHelperCardBalance !== 'function') {
            throw new Error('CARD_HELPER API Key 余额查询能力尚未接入。');
          }
          const state = await getState();
          const result = await refreshCardHelperCardBalance({
            ...(state || {}),
            ...(message.payload || {}),
          }, {
            reason: message.payload?.reason,
          });
          return { ok: true, ...result };
        }

        case 'UPSERT_HOTMAIL_ACCOUNT': {
          const account = await upsertHotmailAccount(message.payload || {});
          return { ok: true, account };
        }

        case 'UPSERT_LEGACY_WALLET_ACCOUNT': {
          const account = await upsertLegacyWalletAccount(message.payload || {});
          return { ok: true, account };
        }

        case 'SELECT_LEGACY_WALLET_ACCOUNT': {
          const account = await setCurrentLegacyWalletAccount(String(message.payload?.accountId || ''));
          return { ok: true, account };
        }

        case 'DELETE_HOTMAIL_ACCOUNT': {
          await deleteHotmailAccount(String(message.payload?.accountId || ''));
          return { ok: true };
        }

        case 'DELETE_HOTMAIL_ACCOUNTS': {
          const result = await deleteHotmailAccounts(String(message.payload?.mode || 'all'));
          return { ok: true, ...result };
        }

        case 'SELECT_HOTMAIL_ACCOUNT': {
          const account = await setCurrentHotmailAccount(String(message.payload?.accountId || ''), {
            markUsed: false,
            syncEmail: true,
          });
          return { ok: true, account };
        }

        case 'PATCH_HOTMAIL_ACCOUNT': {
          const account = await patchHotmailAccount(
            String(message.payload?.accountId || ''),
            message.payload?.updates || {}
          );
          return { ok: true, account };
        }

        case 'VERIFY_HOTMAIL_ACCOUNT':
        case 'AUTHORIZE_HOTMAIL_ACCOUNT': {
          const accountId = String(message.payload?.accountId || '');
          try {
            const result = await verifyHotmailAccount(accountId);
            await setCurrentHotmailAccount(result.account.id, { markUsed: false, syncEmail: true });
            await addLog(`Hotmail 账号 ${result.account.email} 校验通过，可直接用于收信。`, 'ok');
            return { ok: true, account: result.account, messageCount: result.messageCount };
          } catch (err) {
            const state = await getState();
            const accounts = normalizeHotmailAccounts(state.hotmailAccounts);
            const target = findHotmailAccount(accounts, accountId);
            if (target) {
              target.status = 'error';
              target.lastError = err.message;
              await syncHotmailAccounts(accounts.map((item) => (item.id === target.id ? target : item)));
            }
            throw err;
          }
        }

        case 'TEST_HOTMAIL_ACCOUNT': {
          const result = await testHotmailAccountMailAccess(String(message.payload?.accountId || ''));
          return { ok: true, ...result };
        }

        case 'UPSERT_MAIL2925_ACCOUNT': {
          const account = await upsertMail2925Account(message.payload || {});
          return { ok: true, account };
        }

        case 'DELETE_MAIL2925_ACCOUNT': {
          await deleteMail2925Account(String(message.payload?.accountId || ''));
          return { ok: true };
        }

        case 'DELETE_MAIL2925_ACCOUNTS': {
          const result = await deleteMail2925Accounts(String(message.payload?.mode || 'all'));
          return { ok: true, ...result };
        }

        case 'SELECT_MAIL2925_ACCOUNT': {
          const account = await setCurrentMail2925Account(String(message.payload?.accountId || ''), {
            updateLastUsedAt: false,
          });
          return { ok: true, account };
        }

        case 'PATCH_MAIL2925_ACCOUNT': {
          const account = await patchMail2925Account(
            String(message.payload?.accountId || ''),
            message.payload?.updates || {}
          );
          return { ok: true, account };
        }

        case 'LOGIN_MAIL2925_ACCOUNT': {
          const accountId = String(message.payload?.accountId || '');
          const account = await setCurrentMail2925Account(accountId, {
            updateLastUsedAt: false,
          });
          if (typeof deps.ensureMail2925MailboxSession !== 'function') {
            throw new Error('2925 登录能力尚未接入。');
          }
          await deps.ensureMail2925MailboxSession({
            accountId: account.id,
            forceRelogin: Boolean(message.payload?.forceRelogin),
            actionLabel: '侧边栏手动登录 2925 账号',
          });
          return { ok: true, account };
        }

        case 'LIST_LUCKMAIL_PURCHASES': {
          const purchases = await listLuckmailPurchasesForManagement();
          return { ok: true, purchases };
        }

        case 'SELECT_LUCKMAIL_PURCHASE': {
          const purchase = await selectLuckmailPurchase(message.payload?.purchaseId);
          return { ok: true, purchase };
        }

        case 'SET_LUCKMAIL_PURCHASE_USED_STATE': {
          const result = await setLuckmailPurchaseUsedState(message.payload?.purchaseId, Boolean(message.payload?.used));
          return { ok: true, ...result };
        }

        case 'SET_LUCKMAIL_PURCHASE_PRESERVED_STATE': {
          const purchase = await setLuckmailPurchasePreservedState(message.payload?.purchaseId, Boolean(message.payload?.preserved));
          return { ok: true, purchase };
        }

        case 'SET_LUCKMAIL_PURCHASE_DISABLED_STATE': {
          const purchase = await setLuckmailPurchaseDisabledState(message.payload?.purchaseId, Boolean(message.payload?.disabled));
          return { ok: true, purchase };
        }

        case 'BATCH_UPDATE_LUCKMAIL_PURCHASES': {
          const result = await batchUpdateLuckmailPurchases(message.payload || {});
          return { ok: true, ...result };
        }

        case 'DISABLE_USED_LUCKMAIL_PURCHASES': {
          const result = await disableUsedLuckmailPurchases();
          return { ok: true, ...result };
        }

        case 'FETCH_HOSTED_CHECKOUT_VERIFICATION_CODE': {
          if (typeof fetchHostedCheckoutVerificationCodeManually !== 'function') {
            throw new Error('Hosted checkout 手动获取验证码能力尚未接入。');
          }
          const result = await fetchHostedCheckoutVerificationCodeManually(message.payload || {});
          return {
            ok: true,
            code: String(result?.code || '').trim(),
            verificationUrl: String(result?.verificationUrl || '').trim(),
          };
        }

        case 'TEST_CHATGPT_SESSION_READER_CONVERSION_PROXY': {
          const state = await getState();
          if (isAutoRunLockedState(state)) {
            throw new Error('自动流程运行中，当前不能测试支付转换代理。');
          }
          if (typeof testCheckoutConversionProxy !== 'function') {
            throw new Error('支付转换代理测试能力尚未接入。');
          }
          const result = await testCheckoutConversionProxy(message.payload || {});
          return {
            ok: true,
            proxyDisplayName: String(result?.proxyDisplayName || '').trim(),
            exitIp: String(result?.exitIp || '').trim(),
            exitRegion: String(result?.exitRegion || '').trim(),
            exitSource: String(result?.exitSource || '').trim(),
            exitEndpoint: String(result?.exitEndpoint || '').trim(),
            targetEndpoint: String(result?.targetEndpoint || '').trim(),
            diagnostics: String(result?.diagnostics || '').trim(),
          };
        }

        case 'REMOVED_PAYMENT_WORKER_PAUSE_JOB': {
          if (typeof pauseRemovedPaymentWorkerJob !== 'function') {
            throw new Error('RemovedPaymentWorker 暂停能力尚未接入。');
          }
          const result = await pauseRemovedPaymentWorkerJob();
          return { ok: true, state: result };
        }

        case 'REMOVED_PAYMENT_WORKER_RESUME_JOB': {
          if (typeof resumeRemovedPaymentWorkerJob !== 'function') {
            throw new Error('RemovedPaymentWorker 继续能力尚未接入。');
          }
          const result = await resumeRemovedPaymentWorkerJob();
          return { ok: true, state: result };
        }

        case 'STOP_FLOW': {
          await requestStop();
          return { ok: true };
        }

        default:
          console.warn('Unknown message type:', message.type);
          return { error: `Unknown message type: ${message.type}` };
      }
    }

    return {
      handleMessage,
    };
  }

  return {
    buildRuntimeStateMessageView,
    compactRuntimeMessageResponse,
    createRouterMessageDispatcher,
  };
});
