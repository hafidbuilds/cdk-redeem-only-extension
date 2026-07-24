(function authPageRecoveryModule(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }

  root.MultiPageAuthPageRecovery = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createAuthPageRecoveryModule() {
  function createAuthPageRecovery(deps = {}) {
    const {
      detailPattern = null,
      getActionText,
      getPageTextSnapshot,
      humanPause,
      isActionEnabled,
      isVisibleElement,
      log,
      performOperationWithDelay: injectedPerformOperationWithDelay,
      routeErrorPattern = null,
      simulateClick,
      sleep,
      throwIfStopped,
      titlePattern = null,
    } = deps;

    function matchesPathPatterns(pathname, pathPatterns = []) {
      if (!Array.isArray(pathPatterns) || !pathPatterns.length) {
        return true;
      }
      return pathPatterns.some((pattern) => pattern instanceof RegExp && pattern.test(pathname));
    }

    function getAuthRetryButton(options = {}) {
      const { allowDisabled = false } = options;
      const direct = document.querySelector('button[data-dd-action-name="Try again"]');
      if (direct && isVisibleElement(direct) && (allowDisabled || isActionEnabled(direct))) {
        return direct;
      }

      const candidates = document.querySelectorAll('button, [role="button"]');
      return Array.from(candidates).find((element) => {
        if (!isVisibleElement(element) || (!allowDisabled && !isActionEnabled(element))) {
          return false;
        }
        const text = typeof getActionText === 'function' ? getActionText(element) : '';
        return /重试|try\s+again|もう一度試す|再試行|やり直す|फिर\s+से\s+कोशिश\s+करें|दोबारा\s+कोशिश\s+करें|पुनः\s+प्रयास/i.test(text);
      }) || null;
    }

    function getAuthTimeoutErrorPageState(options = {}) {
      const { pathPatterns = [] } = options;
      const pathname = location.pathname || '';
      if (!matchesPathPatterns(pathname, pathPatterns)) {
        return null;
      }

      const text = typeof getPageTextSnapshot === 'function' ? getPageTextSnapshot() : '';
      const title = typeof document !== 'undefined' ? String(document.title || '') : '';
      const titleMatched = titlePattern instanceof RegExp
        ? titlePattern.test(text) || titlePattern.test(title)
        : false;
      const detailMatched = detailPattern instanceof RegExp
        ? detailPattern.test(text)
        : false;
      const routeErrorMatched = routeErrorPattern instanceof RegExp
        ? routeErrorPattern.test(text)
        : false;
      const httpErrorPage = /this\s+page\s+isn'?t\s+working|currently\s+unable\s+to\s+handle\s+this\s+request|HTTP\s+ERROR\s+5\d\d|ERR_HTTP_RESPONSE_CODE_FAILURE/i.test(`${title} ${text}`);
      const maxCheckAttemptsBlocked = /max_check_attempts|試行回数が多すぎ|数分待ってからもう一度|too\s+many\s+(?:attempts|checks|tries)|try\s+again\s+in\s+(?:a\s+)?few\s+minutes|बहुत\s+(?:ज़्यादा|ज्यादा)\s+(?:प्रयास|कोशिश)|कुछ\s+मिनट\s+बाद/i.test(text);
      const userAlreadyExistsBlocked = /user_already_exists/i.test(text);
      const fetchFailedMatched = /failed\s+to\s+fetch|network\s+error|fetch\s+failed/i.test(text);
      const invalidAuthStepMatched = /invalid\s+authorization\s+step|invalid_auth_step/i.test(text);
      const retryButton = getAuthRetryButton({ allowDisabled: true });

      if (!titleMatched && !detailMatched && !routeErrorMatched && !fetchFailedMatched && !invalidAuthStepMatched && !httpErrorPage && !maxCheckAttemptsBlocked && !userAlreadyExistsBlocked) {
        return null;
      }
      if (!retryButton && !httpErrorPage && !maxCheckAttemptsBlocked && !userAlreadyExistsBlocked) {
        return null;
      }

      return {
        path: pathname,
        url: location.href,
        retryButton,
        retryEnabled: Boolean(retryButton && isActionEnabled(retryButton)),
        titleMatched,
        detailMatched,
        routeErrorMatched,
        fetchFailedMatched,
        invalidAuthStepMatched,
        httpErrorPage,
        maxCheckAttemptsBlocked,
        userAlreadyExistsBlocked,
      };
    }

    async function getCustomRecoverySnapshot(isRecovered) {
      if (typeof isRecovered !== 'function') {
        return null;
      }
      try {
        const result = await isRecovered();
        if (!result) {
          return null;
        }
        return typeof result === 'object' ? result : { recovered: true };
      } catch {
        return null;
      }
    }

    async function waitForRetryPageRecoveryAfterClick(options = {}) {
      const {
        isRecovered = null,
        pathPatterns = [],
        pollIntervalMs = 250,
        settleAfterClickMs = 3000,
      } = options;
      const startedAt = Date.now();

      while (Date.now() - startedAt < settleAfterClickMs) {
        if (typeof throwIfStopped === 'function') {
          throwIfStopped();
        }

        const customRecovery = await getCustomRecoverySnapshot(isRecovered);
        if (customRecovery) {
          return {
            ...customRecovery,
            recovered: true,
            customRecovered: true,
            elapsedMs: Date.now() - startedAt,
          };
        }

        const retryState = getAuthTimeoutErrorPageState({ pathPatterns });
        if (!retryState) {
          return {
            recovered: true,
            elapsedMs: Date.now() - startedAt,
          };
        }

        await sleep(pollIntervalMs);
      }

      return {
        recovered: false,
        elapsedMs: Date.now() - startedAt,
      };
    }

    async function recoverAuthRetryPage(options = {}) {
      const rootScope = typeof self !== 'undefined' ? self : globalThis;
      const performOperationWithDelay = injectedPerformOperationWithDelay
        || rootScope.CodexOperationDelay?.performOperationWithDelay
        || (async (_metadata, operation) => operation());
      const {
        logLabel = '',
        maxClickAttempts = 5,
        isRecovered = null,
        pathPatterns = [],
        pollIntervalMs = 250,
        step = null,
        timeoutMs = 12000,
        waitAfterClickMs = 3000,
      } = options;
      const maxIdlePolls = timeoutMs > 0
        ? Math.max(1, Math.ceil(timeoutMs / Math.max(1, pollIntervalMs)))
        : Number.POSITIVE_INFINITY;
      let clickCount = 0;
      let idlePollCount = 0;

      while (clickCount < maxClickAttempts) {
        if (typeof throwIfStopped === 'function') {
          throwIfStopped();
        }

        const customRecovery = await getCustomRecoverySnapshot(isRecovered);
        if (customRecovery) {
          return {
            ...customRecovery,
            recovered: true,
            clickCount,
            customRecovered: true,
            url: customRecovery.url || location.href,
          };
        }

        const retryState = getAuthTimeoutErrorPageState({ pathPatterns });
        if (!retryState) {
          return {
            recovered: clickCount > 0,
            clickCount,
            url: location.href,
          };
        }

        if (retryState.maxCheckAttemptsBlocked) {
          throw new Error(
            'CF_SECURITY_BLOCKED::您已触发Cloudflare 安全防护系统，已完全停止流程，请不要短时间内多次进行重新发送验证码，连续刷新、反复点击重试会加重风控；请先关闭页面等待 15-30 分钟，让系统的临时限制自动解除。或者更换浏览器'
          );
        }

        if (retryState.userAlreadyExistsBlocked) {
          throw new Error(
            'SIGNUP_USER_ALREADY_EXISTS::步骤 4：检测到 user_already_exists，说明当前用户已存在，当前轮将直接停止。'
          );
        }

        if (retryState.retryButton && retryState.retryEnabled) {
          idlePollCount = 0;
          clickCount += 1;
          if (typeof log === 'function') {
            const prefix = logLabel || `步骤 ${step || '?'}：检测到重试页，正在点击“重试”恢复`;
            log(`${prefix}（第 ${clickCount} 次）...`, 'warn');
          }
          if (typeof humanPause === 'function') {
            await humanPause(300, 800);
          }
          await performOperationWithDelay({ stepKey: options.stepKey || '', kind: 'click', label: 'auth-retry-click' }, async () => {
            simulateClick(retryState.retryButton);
          });
          const recoveryResult = await waitForRetryPageRecoveryAfterClick({
            pathPatterns,
            pollIntervalMs,
            isRecovered,
            settleAfterClickMs: waitAfterClickMs,
          });
          if (recoveryResult.recovered) {
            return {
              ...recoveryResult,
              recovered: true,
              clickCount,
              url: recoveryResult.url || location.href,
            };
          }
          continue;
        }

        idlePollCount += 1;
        if (idlePollCount >= maxIdlePolls) {
          throw new Error(
            `${logLabel || `步骤 ${step || '?'}：重试页恢复`}超时：重试按钮长时间不可点击。URL: ${location.href}`
          );
        }

        await sleep(pollIntervalMs);
      }

      const customRecovery = await getCustomRecoverySnapshot(isRecovered);
      if (customRecovery) {
        return {
          ...customRecovery,
          recovered: true,
          clickCount,
          customRecovered: true,
          url: customRecovery.url || location.href,
        };
      }

      const finalRetryState = getAuthTimeoutErrorPageState({ pathPatterns });
      if (!finalRetryState) {
        return {
          recovered: clickCount > 0,
          clickCount,
          url: location.href,
        };
      }

      if (finalRetryState.maxCheckAttemptsBlocked) {
        throw new Error(
          'CF_SECURITY_BLOCKED::您已触发Cloudflare 安全防护系统，已完全停止流程，请不要短时间内多次进行重新发送验证码，连续刷新、反复点击重试会加重风控；请先关闭页面等待 15-30 分钟，让系统的临时限制自动解除。或者更换浏览器'
        );
      }

      if (finalRetryState.userAlreadyExistsBlocked) {
        throw new Error(
          'SIGNUP_USER_ALREADY_EXISTS::步骤 4：检测到 user_already_exists，说明当前用户已存在，当前轮将直接停止。'
        );
      }

      throw new Error(
        `${logLabel || `步骤 ${step || '?'}：重试页恢复`}失败：已连续点击“重试” ${maxClickAttempts} 次，页面仍未恢复。URL: ${location.href}`
      );
    }

    return {
      getAuthRetryButton,
      getAuthTimeoutErrorPageState,
      recoverAuthRetryPage,
    };
  }

  return {
    createAuthPageRecovery,
  };
});
