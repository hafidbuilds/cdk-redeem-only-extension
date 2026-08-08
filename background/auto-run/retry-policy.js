(function attachBackgroundAutoRunRetryPolicy(root, factory) {
  const api = factory();
  if (root) root.MultiPageBackgroundAutoRunRetryPolicy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundAutoRunRetryPolicyModule() {
  const NODE_FETCH_NETWORK_RETRY_POLICIES = new Map([
    ['fetch-signup-code', [3, 12000]], ['fetch-gpt-password-code', [3, 12000]], ['check-trial-eligibility', [3, 12000]],
  ]);
  function getNodeFetchNetworkRetryPolicy(nodeId = '', executeKey = '') {
    const [maxAttempts, cooldownMs] = NODE_FETCH_NETWORK_RETRY_POLICIES.get(String(executeKey || nodeId || '').trim()) || [];
    return maxAttempts ? { maxAttempts, cooldownMs } : null;
  }
  function createAutoRunRetryPolicy(deps = {}) {
    const getErrorMessage = typeof deps.getErrorMessage === 'function'
      ? deps.getErrorMessage
      : (error) => String(error?.message || error || '');
    const isHostedCheckoutCardFallbackFailure = typeof deps.isHostedCheckoutCardFallbackFailure === 'function'
      ? deps.isHostedCheckoutCardFallbackFailure
      : (typeof globalThis.isHostedCheckoutCardFallbackFailure === 'function'
          ? globalThis.isHostedCheckoutCardFallbackFailure.bind(globalThis)
          : null);
    function normalizeRecordNode(value = '') { return String(value || '').trim(); }
    function extractNodeFromRecordStatus(status = '') {
      const match = String(status || '').trim().match(/^node:([^:]+):(failed|stopped)$/i);
      return match ? normalizeRecordNode(match[1]) : '';
    }
    function getKnownNodeIdsFromState(state = {}) {
      const ids = new Set();
      for (const key of Object.keys(state?.nodeStatuses || {})) {
        const nodeId = normalizeRecordNode(key);
        if (nodeId) {
          ids.add(nodeId);
        }
      }
      const currentNodeId = normalizeRecordNode(state?.currentNodeId);
      if (currentNodeId) {
        ids.add(currentNodeId);
      }

      return Array.from(ids);
    }
    function inferRecordNodeFromState(state = {}, preferredStatuses = []) {
      const statuses = state?.nodeStatuses || {};
      const preferredStatusSet = new Set(preferredStatuses.map((item) => String(item || '').trim()).filter(Boolean));
      const nodeIds = getKnownNodeIdsFromState(state);
      const currentNodeId = normalizeRecordNode(state?.currentNodeId);

      if (currentNodeId && preferredStatusSet.has(String(statuses[currentNodeId] || '').trim())) {
        return currentNodeId;
      }

      const matchingNodes = nodeIds.filter((nodeId) => preferredStatusSet.has(String(statuses[nodeId] || '').trim()));
      if (matchingNodes.length) {
        return matchingNodes[matchingNodes.length - 1];
      }

      if (currentNodeId) {
        const currentStatus = String(statuses[currentNodeId] || '').trim();
        if (!['', 'pending', 'completed', 'manual_completed', 'skipped'].includes(currentStatus)) {
          return currentNodeId;
        }
      }

      return '';
    }
    function inferRecordNodeFromError(errorLike = null) {
      if (!errorLike || typeof errorLike !== 'object') {
        return '';
      }

      return normalizeRecordNode(errorLike.failedNodeId)
        || normalizeRecordNode(errorLike.nodeId)
        || normalizeRecordNode(errorLike.currentNodeId);
    }
    function resolveAutoRunAccountRecordStatus(status, state = {}, errorLike = null) {
      const normalizedStatus = String(status || '').trim().toLowerCase();
      const explicitNode = extractNodeFromRecordStatus(status);
      if (explicitNode) {
        return `node:${explicitNode}:${normalizedStatus.endsWith(':stopped') ? 'stopped' : 'failed'}`;
      }
      if (normalizedStatus === 'failed') {
        const failedNode = inferRecordNodeFromError(errorLike)
          || inferRecordNodeFromState(state, ['failed', 'running']);
        return failedNode ? `node:${failedNode}:failed` : status;
      }

      if (normalizedStatus === 'stopped') {
        const stoppedNode = inferRecordNodeFromError(errorLike)
          || inferRecordNodeFromState(state, ['stopped', 'running']);
        return stoppedNode ? `node:${stoppedNode}:stopped` : status;
      }

      return status;
    }
    function isUpiAccountIneligibleFailure(error) {
      const rawMessage = String(typeof error === 'string' ? error : error?.message || '');
      const message = String(getErrorMessage(error) || rawMessage);
      const combinedMessage = `${rawMessage}\n${message}`;
      const status = String(
        error?.trialEligibilityStatus
        || error?.trialEligibilityDecision?.trialEligibilityStatus
        || ''
      ).trim().toLowerCase();
      if (error?.code === 'UPI_ACCOUNT_INELIGIBLE' || status === 'ineligible') {
        return true;
      }
      const hasUpiEligibilityContext = /UPI|试用资格|trial[\s_-]*eligibility/i.test(combinedMessage);
      const hasExplicitIneligibleResult = /UPI_ACCOUNT_INELIGIBLE::|not[\s_-]*eligible|ineligible|无试用资格|账号[^\n]*无资格|未通过[^\n]*试用资格/i.test(combinedMessage);
      return hasUpiEligibilityContext && hasExplicitIneligibleResult;
    }
    function isSessionFrameUnavailableFailure(error) {
      const message = String(getErrorMessage(error) || error?.message || error || '');
      return error?.code === 'CHATGPT_SESSION_FRAME_UNAVAILABLE'
        || /CHATGPT_SESSION_FRAME_UNAVAILABLE|SET_GPT_PASSWORD_(?:SESSION_EXPIRED|RESET_ENTRY_UNAVAILABLE)|读取 SESSION\/AT 时持续切换|重新定位标签页\s*\d+\s*次仍未恢复/i.test(message);
    }
    function isSignupPasswordSubmitUncertainFailure(error) {
      const message = String(getErrorMessage(error) || error?.message || error || '');
      return ['SIGNUP_EMAIL_SUBMIT_UNCERTAIN', 'SIGNUP_PASSWORD_SUBMIT_UNCERTAIN'].includes(error?.code) || /SIGNUP_(?:EMAIL|PASSWORD)_SUBMIT_UNCERTAIN::/i.test(message);
    }
    function isSignupExistingTotpLoginFailure(error) {
      const message = String(getErrorMessage(error) || error?.message || error || '');
      return error?.code === 'SIGNUP_EXISTING_TOTP_LOGIN_FAILED' || /SIGNUP_EXISTING_TOTP_LOGIN_FAILED::/i.test(message);
    }
    function getMaxAttemptsForRound(options = {}) {
      const attemptRun = Math.max(1, Math.floor(Number(options.attemptRun) || 1));
      const maxRetriesPerRound = Math.max(0, Math.floor(Number(deps.AUTO_RUN_MAX_RETRIES_PER_ROUND) || 0));
      return options.autoRunSkipFailures || options.autoRunRetryNonFreeTrial || options.autoRunRetryLegacyWalletCallback ? maxRetriesPerRound + 1 : Math.max(maxRetriesPerRound + 1, attemptRun);
    }

    function evaluateAttemptFailure(options = {}) {
      const error = options.error;
      const attemptRun = Math.max(1, Math.floor(Number(options.attemptRun) || 1));
      const maxAttemptsForRound = Math.max(
        attemptRun,
        Math.floor(Number(options.maxAttemptsForRound) || getMaxAttemptsForRound(options))
      );
      const maxRetryAttempts = Math.max(1, Math.floor(Number(deps.AUTO_RUN_MAX_RETRIES_PER_ROUND) || 0) + 1);
      const rawReason = String(getErrorMessage(error) || '').trim()
        || String(error?.message || error || '未知错误');
      const blockedByCustomEmailPoolEmpty = /CUSTOM_EMAIL_POOL_EXHAUSTED::|自定义邮箱池(?:为空|没有可用邮箱|可用邮箱不足|第\s*\d+\s*个邮箱不存在)/i.test(rawReason);
      const reason = blockedByCustomEmailPoolEmpty
        ? rawReason.replace(/^CUSTOM_EMAIL_POOL_EXHAUSTED::/i, '').trim()
        : rawReason;
      const blockedByUpiAccountIneligible = isUpiAccountIneligibleFailure(error);
      const blockedBySessionFrameUnavailable = isSessionFrameUnavailableFailure(error);
      const blockedBySignupPasswordSubmitUncertain = isSignupPasswordSubmitUncertainFailure(error);
      const blockedBySignupExistingTotpLogin = isSignupExistingTotpLoginFailure(error);
      const blockedByAccountDeactivated = typeof deps.isAccountDeactivatedFailure === 'function'
        ? deps.isAccountDeactivatedFailure(error)
        : error?.code === 'ACCOUNT_DEACTIVATED' || /ACCOUNT_DEACTIVATED::|account[_\s-]*deactivated|账号.*(?:删除|停用|封禁)/i.test(rawReason);
      const blockedByPreserveSignupSession = error?.preserveSignupSession === true;
      const blockedByPlusNonFreeTrial = !blockedByUpiAccountIneligible
        && typeof deps.isChatgptSessionReaderNonFreeTrialFailure === 'function'
        && deps.isChatgptSessionReaderNonFreeTrialFailure(error);
      const blockedByCardHelperTaskEnded = typeof deps.isCardHelperTaskEndedFailure === 'function'
        ? deps.isCardHelperTaskEndedFailure(error)
        : /CARD_HELPER_TASK_ENDED::/i.test(error?.message || String(error || ''));
      const blockedByHostedCheckoutGenericError = typeof deps.isHostedCheckoutGenericErrorFailure === 'function'
        ? deps.isHostedCheckoutGenericErrorFailure(error)
        : /HOSTED_CHECKOUT_GENERIC_ERROR::/i.test(error?.message || String(error || ''));
      const blockedByHostedCheckoutCardFallback = typeof isHostedCheckoutCardFallbackFailure === 'function'
        ? isHostedCheckoutCardFallbackFailure(error)
        : /HOSTED_CHECKOUT_CARD_FALLBACK::/i.test(error?.message || String(error || ''));
      const blockedByHostedCheckoutVerificationResendLimit = typeof deps.isHostedCheckoutVerificationResendLimitFailure === 'function'
        ? deps.isHostedCheckoutVerificationResendLimitFailure(error)
        : /HOSTED_CHECKOUT_VERIFICATION_RESEND_LIMIT::/i.test(error?.message || String(error || ''));
      const blockedByCloudCheckoutAlreadyPaid = typeof deps.isCloudCheckoutAlreadyPaidFailure === 'function'
        ? deps.isCloudCheckoutAlreadyPaidFailure(error)
        : /\buser\s+is\s+already\s+paid\b|already\s+(?:paid|subscribed)/i.test(error?.message || String(error || ''));
      const blockedBySignupUserAlreadyExists = typeof deps.isSignupUserAlreadyExistsFailure === 'function'
        && deps.isSignupUserAlreadyExistsFailure(error);
      const blockedByStep4Route405 = typeof deps.isStep4Route405RecoveryLimitFailure === 'function'
        && deps.isStep4Route405RecoveryLimitFailure(error);
      const retryablePlusNonFreeTrial = blockedByPlusNonFreeTrial
        && options.autoRunRetryNonFreeTrial
        && attemptRun < maxRetryAttempts;
      const retryableHostedCheckoutGenericError = blockedByHostedCheckoutGenericError
        && options.autoRunRetryLegacyWalletCallback
        && attemptRun < maxRetryAttempts;
      const retryableHostedCheckoutCardFallback = blockedByHostedCheckoutCardFallback
        && attemptRun < maxRetryAttempts;
      const canRetry = !blockedByUpiAccountIneligible
        && !blockedByAccountDeactivated
        && !blockedBySessionFrameUnavailable
        && !blockedBySignupPasswordSubmitUncertain
        && !blockedBySignupExistingTotpLogin
        && !blockedByPreserveSignupSession
        && !blockedByCustomEmailPoolEmpty
        && !blockedByPlusNonFreeTrial
        && !blockedByCardHelperTaskEnded
        && !blockedByHostedCheckoutGenericError
        && !blockedByHostedCheckoutCardFallback
        && !blockedByHostedCheckoutVerificationResendLimit
        && !blockedByCloudCheckoutAlreadyPaid
        && !blockedBySignupUserAlreadyExists
        && options.autoRunSkipFailures
        && attemptRun < maxAttemptsForRound;
      return {
        reason,
        attemptRun,
        autoRunSkipFailures: Boolean(options.autoRunSkipFailures),
        autoRunRetryNonFreeTrial: Boolean(options.autoRunRetryNonFreeTrial),
        autoRunRetryLegacyWalletCallback: Boolean(options.autoRunRetryLegacyWalletCallback),
        maxAttemptsForRound,
        maxRetryAttempts,
        blockedByCardHelperTaskEnded,
        blockedByAccountDeactivated,
        blockedByCloudCheckoutAlreadyPaid,
        blockedByCustomEmailPoolEmpty,
        blockedByHostedCheckoutCardFallback,
        blockedByHostedCheckoutGenericError,
        blockedByHostedCheckoutVerificationResendLimit,
        blockedByPlusNonFreeTrial,
        blockedByPreserveSignupSession,
        blockedBySignupExistingTotpLogin,
        blockedBySignupUserAlreadyExists,
        blockedBySessionFrameUnavailable,
        blockedBySignupPasswordSubmitUncertain,
        blockedByStep4Route405,
        blockedByUpiAccountIneligible,
        canRetry,
        restartCurrentAttempt: typeof deps.isRestartCurrentAttemptError === 'function'
          && deps.isRestartCurrentAttemptError(error),
        retryableHostedCheckoutCardFallback,
        retryableHostedCheckoutGenericError,
        retryablePlusNonFreeTrial,
      };
    }

    function selectFailureAction(result = {}) {
      const terminalStop = (code) => ({ code, forceFreshTabsNextRun: false, shouldFailRound: true, shouldStop: true });
      if (result.blockedByAccountDeactivated) return { code: 'replace_account_deactivated', forceFreshTabsNextRun: true, shouldReplaceAccount: true };
      if (result.blockedByCustomEmailPoolEmpty) return terminalStop('fail_custom_email_pool_empty');
      if (result.blockedBySessionFrameUnavailable) return terminalStop('fail_session_frame_unavailable');
      if (result.blockedBySignupPasswordSubmitUncertain) return terminalStop('fail_signup_password_submit_uncertain');
      if (result.blockedBySignupExistingTotpLogin) return terminalStop('fail_signup_existing_totp_login');
      if (result.blockedByPreserveSignupSession) return terminalStop('fail_preserve_signup_session');
      if (result.retryablePlusNonFreeTrial) {
        return {
          code: 'retry_plus_non_free_trial',
          forceFreshTabsNextRun: true,
          shouldRetry: true,
        };
      }
      if (result.retryableHostedCheckoutGenericError) {
        return {
          code: 'retry_hosted_checkout_generic_error',
          forceFreshTabsNextRun: true,
          shouldRetry: true,
        };
      }
      if (result.retryableHostedCheckoutCardFallback) {
        return {
          code: 'retry_hosted_checkout_card_fallback',
          forceFreshTabsNextRun: true,
          shouldRetry: true,
        };
      }
      if (result.blockedByUpiAccountIneligible) {
        return {
          code: 'fail_upi_account_ineligible',
          forceFreshTabsNextRun: true,
          shouldFailRound: true,
        };
      }
      if (result.blockedByPlusNonFreeTrial) {
        return {
          code: 'fail_plus_non_free_trial',
          forceFreshTabsNextRun: result.autoRunSkipFailures,
          shouldFailRound: true,
          shouldStop: !result.autoRunSkipFailures,
        };
      }
      if (result.blockedByCardHelperTaskEnded) {
        return {
          code: 'fail_card_helper_task_ended',
          forceFreshTabsNextRun: result.autoRunSkipFailures,
          shouldFailRound: true,
          shouldStop: !result.autoRunSkipFailures,
        };
      }
      if (result.blockedByHostedCheckoutGenericError) {
        return {
          code: 'fail_hosted_checkout_generic_error',
          forceFreshTabsNextRun: result.autoRunSkipFailures,
          shouldFailRound: true,
          shouldStop: !result.autoRunSkipFailures,
        };
      }
      if (result.blockedByHostedCheckoutCardFallback) {
        return {
          code: 'fail_hosted_checkout_card_fallback',
          forceFreshTabsNextRun: result.autoRunSkipFailures,
          shouldFailRound: true,
          shouldStop: !result.autoRunSkipFailures,
        };
      }
      if (result.blockedByHostedCheckoutVerificationResendLimit) {
        return {
          code: 'fail_hosted_checkout_verification_resend_limit',
          forceFreshTabsNextRun: result.autoRunSkipFailures,
          shouldFailRound: true,
          shouldStop: !result.autoRunSkipFailures,
        };
      }
      if (result.blockedByCloudCheckoutAlreadyPaid) {
        return {
          code: 'fail_cloud_checkout_already_paid',
          forceFreshTabsNextRun: result.autoRunSkipFailures,
          shouldFailRound: true,
          shouldStop: !result.autoRunSkipFailures,
        };
      }
      if (result.blockedBySignupUserAlreadyExists) {
        return {
          code: 'fail_signup_user_already_exists',
          forceFreshTabsNextRun: result.autoRunSkipFailures,
          shouldFailRound: true,
          shouldStop: !result.autoRunSkipFailures,
        };
      }
      if (result.blockedByStep4Route405) {
        return {
          code: 'fail_step4_route405',
          forceFreshTabsNextRun: result.autoRunSkipFailures,
          shouldFailRound: true,
          shouldStop: !result.autoRunSkipFailures,
        };
      }
      if (result.canRetry) {
        return {
          code: 'retry_generic',
          forceFreshTabsNextRun: true,
          shouldRetry: true,
        };
      }
      return {
        code: 'fail_generic',
        forceFreshTabsNextRun: result.autoRunSkipFailures,
        shouldFailRound: true,
        shouldStop: !result.autoRunSkipFailures,
      };
    }

    return {
      evaluateAttemptFailure,
      getMaxAttemptsForRound,
      resolveAutoRunAccountRecordStatus,
      selectFailureAction,
    };
  }

  return {
    createAutoRunRetryPolicy,
    getNodeFetchNetworkRetryPolicy,
  };
});
