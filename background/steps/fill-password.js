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
      waitForTabUrlMatch,
    } = deps;

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
        const passwordSwitchRouteKind = String(initialResult?.passwordSwitchRouteKind || '').trim();
        await addLog('步骤 3：已点击官网“使用密码继续”，正在等待密码页加载。', 'info', {
          step: 3,
          stepKey: 'fill-password',
        });
        const matchedTab = typeof waitForTabUrlMatch === 'function'
          ? await waitForTabUrlMatch(
              signupTabId,
              (url) => isVerificationPasswordSwitchTargetUrl(url),
              { timeoutMs: 20000, retryDelayMs: 250 }
            )
          : null;
        if (!matchedTab) {
          throw createSignupPasswordSubmitUncertainError(
            '点击“使用密码继续”后 20 秒内未进入密码页；已保留当前认证页面，请从步骤 3 重试。'
          );
        }

        await ensureContentScriptReadyOnTab('signup-page', signupTabId, {
          inject: SIGNUP_PAGE_INJECT_FILES,
          injectSource: 'signup-page',
          timeoutMs: 45000,
          retryDelayMs: 700,
          logMessage: '步骤 3：密码页正在加载，等待内容脚本恢复后继续填写密码...',
        });

        const resumeSender = typeof sendToContentScriptResilient === 'function'
          ? sendToContentScriptResilient
          : sendToContentScript;
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
