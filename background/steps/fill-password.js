(function attachBackgroundStep3(root, factory) {
  root.MultiPageBackgroundStep3 = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundStep3Module() {
  function createStep3Executor(deps = {}) {
    const {
      addLog,
      appendAccountRunRecord,
      chrome,
      ensureContentScriptReadyOnTab,
      generatePassword,
      getTabId,
      isTabAlive,
      sendToContentScript,
      sendToContentScriptResilient,
      setPasswordState,
      setState,
      SIGNUP_PAGE_INJECT_FILES,
      waitForTabStableComplete,
      waitForTabUrlMatch,
    } = deps;

    const PASSWORD_SWITCH_HTTP_ERROR_RELOAD_LIMIT = 2;

    function createSignupPasswordSubmitUncertainError(message = '') {
      const error = new Error(`SIGNUP_PASSWORD_SUBMIT_UNCERTAIN::${String(message || '注册密码页切换结果未知。')}`);
      error.code = 'SIGNUP_PASSWORD_SUBMIT_UNCERTAIN';
      error.retryable = false;
      error.preserveSignupSession = true;
      return error;
    }

    function isSignupCreatePasswordUrl(url = '') {
      try {
        const parsed = new URL(String(url || ''));
        return /\/(?:u\/)?(?:create-account|signup)\/password(?:[/?#]|$)/i.test(parsed.pathname || '');
      } catch {
        return /\/(?:u\/)?(?:create-account|signup)\/password(?:[/?#]|$)/i.test(String(url || ''));
      }
    }

    function isLoginPasswordUrl(url = '') {
      try {
        const parsed = new URL(String(url || ''));
        return /\/(?:u\/)?log-in\/password(?:[/?#]|$)/i.test(parsed.pathname || '');
      } catch {
        return /\/(?:u\/)?log-in\/password(?:[/?#]|$)/i.test(String(url || ''));
      }
    }

    function isVerificationPasswordSwitchTargetUrl(url = '') {
      return isSignupCreatePasswordUrl(url) || isLoginPasswordUrl(url);
    }

    function isReloadableSignupAuthHttpErrorUrl(url = '') {
      try {
        const parsed = new URL(String(url || ''));
        return parsed.hostname === 'auth.openai.com'
          && /\/(?:u\/)?email-verification(?:[/?#]|$)/i.test(parsed.pathname || '');
      } catch {
        return false;
      }
    }

    function isLikelySignupAuthHttpErrorTab(tab = null) {
      if (!isReloadableSignupAuthHttpErrorUrl(tab?.url || '')) {
        return false;
      }
      const title = String(tab?.title || '').trim();
      return /This page isn'?t working|HTTP\s+ERROR|auth\.openai\.com/i.test(title)
        || (!title && String(tab?.status || '').toLowerCase() === 'complete');
    }

    async function reloadSignupAuthHttpErrorPage(tabId, context = '') {
      if (!tabId || !chrome?.tabs?.get || !chrome?.tabs?.reload) {
        return false;
      }
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (!isLikelySignupAuthHttpErrorTab(tab)) {
        return false;
      }
      await addLog(
        `步骤 3：官网验证码页返回 HTTP 500，正在刷新页面后重试。${context ? `原因：${context}` : ''}`,
        'warn',
        { step: 3, stepKey: 'fill-password' }
      );
      await chrome.tabs.reload(tabId, { bypassCache: true }).catch(() => {});
      if (typeof waitForTabStableComplete === 'function') {
        await waitForTabStableComplete(tabId, {
          timeoutMs: 30000,
          retryDelayMs: 300,
          stableMs: 800,
          initialDelayMs: 500,
        }).catch(() => null);
      }
      return true;
    }

    function buildStep3Message(identity, password, extraPayload = {}) {
      return {
        type: 'EXECUTE_NODE',
        nodeId: 'fill-password',
        step: 3,
        source: 'background',
        payload: {
          email: identity.email,
          accountIdentifierType: identity.accountIdentifierType,
          accountIdentifier: identity.accountIdentifier,
          password,
          ...extraPayload,
        },
      };
    }

    function resolveStep3AccountIdentity(state = {}) {
      const resolvedEmail = String(state?.email || '').trim();

      return {
        accountIdentifierType: 'email',
        accountIdentifier: resolvedEmail,
        email: resolvedEmail,
      };
    }

    function normalizePasswordAccountIdentifierType(value = '') {
      return 'email';
    }

    function normalizePasswordAccountIdentifierValue(type, value = '') {
      const normalizedType = normalizePasswordAccountIdentifierType(type);
      const normalizedValue = String(value || '').trim();
      return normalizedType === 'email' ? normalizedValue.toLowerCase() : normalizedValue;
    }

    function isStatePasswordForIdentity(state = {}, identity = {}) {
      const password = String(state?.password || '').trim();
      if (!password) return false;
      const accountIdentifier = normalizePasswordAccountIdentifierValue(
        identity.accountIdentifierType,
        identity.accountIdentifier
      );
      if (!accountIdentifier) return false;
      const stateIdentifier = normalizePasswordAccountIdentifierValue(
        state?.passwordAccountIdentifierType,
        state?.passwordAccountIdentifier
      );
      const stateType = normalizePasswordAccountIdentifierType(state?.passwordAccountIdentifierType);
      const identityType = normalizePasswordAccountIdentifierType(identity.accountIdentifierType);
      return Boolean(stateIdentifier && stateIdentifier === accountIdentifier && stateType === identityType);
    }

    function resolvePasswordForIdentity(state = {}, identity = {}) {
      if (state.customPassword) {
        return state.customPassword;
      }
      if (isStatePasswordForIdentity(state, identity)) {
        return state.password;
      }
      return generatePassword();
    }

    async function executeStep3(state) {
      const identity = resolveStep3AccountIdentity(state);
      if (!identity.accountIdentifier) {
        throw new Error('缺少注册账号，请先完成步骤 2。');
      }

      const signupTabId = await getTabId('signup-page');
      if (!signupTabId || !(await isTabAlive('signup-page'))) {
        throw new Error('认证页面标签页已关闭，请先重新完成步骤 2。');
      }

      const password = resolvePasswordForIdentity(state, identity);
      await setPasswordState(password, identity);

      const accounts = Array.isArray(state.accounts) ? state.accounts.slice() : [];
      accounts.push({
        email: identity.email,
        accountIdentifierType: identity.accountIdentifierType,
        accountIdentifier: identity.accountIdentifier,
        password,
        createdAt: new Date().toISOString(),
      });
      await setState({ accounts });

      await chrome.tabs.update(signupTabId, { active: true });
      await ensureContentScriptReadyOnTab('signup-page', signupTabId, {
        inject: SIGNUP_PAGE_INJECT_FILES,
        injectSource: 'signup-page',
        timeoutMs: 45000,
        retryDelayMs: 900,
        logMessage: '步骤 3：密码页内容脚本未就绪，正在等待页面恢复...',
      });

      await addLog(
        `步骤 3：正在填写密码，密码为${state.customPassword ? '自定义' : '自动生成'}（${password.length} 位）`
      );
      const initialResult = await sendToContentScript(
        'signup-page',
        buildStep3Message(identity, password)
      );

      if (initialResult?.passwordPageNavigationScheduled === true) {
        let passwordSwitchRouteKind = String(initialResult?.passwordSwitchRouteKind || '').trim();
        await addLog('步骤 3：已点击官网“使用密码继续”，正在等待密码页加载。', 'info', {
          step: 3,
          stepKey: 'fill-password',
        });

        const resumeSender = typeof sendToContentScriptResilient === 'function'
          ? sendToContentScriptResilient
          : sendToContentScript;
        let matchedTab = null;
        let httpErrorReloadCount = 0;
        let passwordSubmitAlreadyAttempted = false;

        while (httpErrorReloadCount <= PASSWORD_SWITCH_HTTP_ERROR_RELOAD_LIMIT) {
          matchedTab = typeof waitForTabUrlMatch === 'function'
            ? await waitForTabUrlMatch(
                signupTabId,
                (url) => isVerificationPasswordSwitchTargetUrl(url),
                { timeoutMs: 20000, retryDelayMs: 250 }
              )
            : null;
          if (matchedTab) break;

          if (httpErrorReloadCount >= PASSWORD_SWITCH_HTTP_ERROR_RELOAD_LIMIT) break;
          const reloaded = await reloadSignupAuthHttpErrorPage(
            signupTabId,
            `切换密码页等待超时（${httpErrorReloadCount + 1}/${PASSWORD_SWITCH_HTTP_ERROR_RELOAD_LIMIT}）`
          );
          if (!reloaded) break;

          httpErrorReloadCount += 1;
          try {
            await ensureContentScriptReadyOnTab('signup-page', signupTabId, {
              inject: SIGNUP_PAGE_INJECT_FILES,
              injectSource: 'signup-page',
              timeoutMs: 45000,
              retryDelayMs: 700,
              logMessage: '步骤 3：验证码页刷新后内容脚本正在恢复，继续定位密码入口...',
            });
          } catch (error) {
            throw createSignupPasswordSubmitUncertainError(
              `验证码页 HTTP 500 刷新后认证页通信仍未恢复。原因：${error?.message || error}`
            );
          }

          const retryResult = await resumeSender(
            'signup-page',
            buildStep3Message(identity, password, {
              passwordSwitchRetry: httpErrorReloadCount,
            }),
            {
              timeoutMs: 45000,
              responseTimeoutMs: 30000,
              retryDelayMs: 700,
              logMessage: '步骤 3：验证码页刷新后正在重新点击“使用密码继续”...',
              logStep: 3,
              logStepKey: 'fill-password',
            }
          );
          if (retryResult?.error) {
            throw createSignupPasswordSubmitUncertainError(
              `验证码页 HTTP 500 刷新后未能重新进入密码页。原因：${retryResult.error}`
            );
          }
          if (retryResult?.passwordSwitchRouteKind) {
            passwordSwitchRouteKind = String(retryResult.passwordSwitchRouteKind).trim() || passwordSwitchRouteKind;
          }
          if (retryResult?.passwordPageNavigationScheduled !== true) {
            if (retryResult?.passwordSubmitAttempted === true) {
              passwordSubmitAlreadyAttempted = true;
              break;
            }
            throw createSignupPasswordSubmitUncertainError(
              '验证码页 HTTP 500 刷新后未能再次定位“使用密码继续”；已保留当前认证页面，请从步骤 3 重试。'
            );
          }
        }

        if (!matchedTab && !passwordSubmitAlreadyAttempted) {
          throw createSignupPasswordSubmitUncertainError(
            httpErrorReloadCount > 0
              ? `验证码页 HTTP 500 刷新 ${httpErrorReloadCount} 次后仍未进入密码页；已保留当前认证页面，请从步骤 3 重试。`
              : '点击“使用密码继续”后 20 秒内未进入密码页；已保留当前认证页面，请从步骤 3 重试。'
          );
        }

        if (!passwordSubmitAlreadyAttempted) {
          await ensureContentScriptReadyOnTab('signup-page', signupTabId, {
            inject: SIGNUP_PAGE_INJECT_FILES,
            injectSource: 'signup-page',
            timeoutMs: 45000,
            retryDelayMs: 700,
            logMessage: '步骤 3：密码页正在加载，等待内容脚本恢复后继续填写密码...',
          });

          const resumedResult = await resumeSender(
            'signup-page',
            buildStep3Message(identity, password, {
              passwordSwitchResumed: true,
              passwordSwitchRouteKind,
            }),
            {
              timeoutMs: 45000,
              responseTimeoutMs: 30000,
              retryDelayMs: 700,
              logMessage: '步骤 3：注册密码页通信仍在恢复，正在继续等待...',
              logStep: 3,
              logStepKey: 'fill-password',
            }
          );
          if (resumedResult?.error) {
            throw createSignupPasswordSubmitUncertainError(
              `密码页恢复后未能提交密码。原因：${resumedResult.error}`
            );
          }
        }
      } else if (initialResult?.error) {
        throw new Error(initialResult.error);
      }

      if (typeof appendAccountRunRecord === 'function') {
        try {
          await appendAccountRunRecord('running', {
            ...state,
            ...identity,
            password,
            currentNodeId: 'fill-password',
          });
        } catch (err) {
          await addLog(`步骤 3：密码已填写，但预保存账号记录失败：${err?.message || err}`, 'warn');
        }
      }
    }

    return { executeStep3 };
  }

  return { createStep3Executor };
});
