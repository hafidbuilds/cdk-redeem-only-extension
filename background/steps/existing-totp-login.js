(function attachBackgroundExistingTotpLogin(root, factory) {
  root.MultiPageBackgroundExistingTotpLogin = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundExistingTotpLoginModule() {
  function normalizeString(value = '') {
    return String(value || '').trim();
  }

  function isTotpChallenge(state = {}) {
    const name = normalizeString(state?.state).toLowerCase();
    const kind = normalizeString(state?.verificationKind || state?.challengeType).toLowerCase();
    return state?.registeredLoginTotp === true
      || state?.isRegisteredLoginTotp === true
      || name === 'registered_login_totp_page'
      || (name === 'verification_page' && kind === 'totp');
  }

  function isAccountDeactivated(state = {}) {
    const name = normalizeString(state?.state).toLowerCase();
    const code = normalizeString(state?.errorCode || state?.error_code).toLowerCase();
    return state?.accountDeactivated === true
      || name === 'account_deactivated_page'
      || code === 'account_deactivated';
  }

  function createExistingTotpError(message) {
    const error = new Error(`SIGNUP_EXISTING_TOTP_LOGIN_FAILED::${message}`);
    error.code = 'SIGNUP_EXISTING_TOTP_LOGIN_FAILED';
    error.retryable = false;
    error.preserveSignupSession = true;
    error.nodeId = 'existing-totp-login';
    error.failedNodeId = 'existing-totp-login';
    return error;
  }

  function createExistingTotpLoginExecutor(deps = {}) {
    const {
      addLog,
      completeNodeFromBackground,
      getState,
      getTabId,
      markCurrentRegistrationAccountDeactivated,
      recoverRegisteredTotpLogin,
      sendToContentScriptResilient,
      setNodeStatus,
      setState,
    } = deps;

    async function executeExistingTotpLogin(state = {}) {
      const latestState = typeof getState === 'function' ? await getState() : state;
      const tabId = Number(await getTabId?.('signup-page'));
      if (!Number.isInteger(tabId)) {
        throw createExistingTotpError('认证页面标签页已关闭，无法执行已有账号 2FA 登录。');
      }

      const authState = await sendToContentScriptResilient('signup-page', {
        type: 'GET_LOGIN_AUTH_STATE',
        source: 'background',
        payload: { visibleStep: 4, nodeId: 'existing-totp-login' },
      }, {
        timeoutMs: 30000,
        responseTimeoutMs: 25000,
        retryDelayMs: 500,
        logMessage: '步骤 4：正在确认是否为已有账号 2FA 登录页...',
      });

      if (isAccountDeactivated(authState)) {
        if (typeof markCurrentRegistrationAccountDeactivated === 'function') {
          await markCurrentRegistrationAccountDeactivated(latestState, {
            logPrefix: '步骤 4 检测到账号已封禁',
            level: 'warn',
          });
        }
        const error = new Error('账号已封禁，无法继续已有账号 2FA 登录。');
        error.code = 'ACCOUNT_DEACTIVATED';
        error.retryable = false;
        error.nodeId = 'existing-totp-login';
        error.failedNodeId = 'existing-totp-login';
        throw error;
      }

      if (!isTotpChallenge(authState)) {
        await setState?.({ existingTotpLogin: false, existingTotpLoginEmail: '' });
        await setNodeStatus?.(state?.nodeId || 'existing-totp-login', 'skipped');
        await addLog?.('步骤 4：当前账号不需要已有账号 2FA 登录，已跳过并继续获取注册验证码。', 'info', {
          step: 4,
          stepKey: 'existing-totp-login',
          nodeId: 'existing-totp-login',
        });
        return { skipped: true, reason: 'not_totp_login' };
      }

      if (typeof recoverRegisteredTotpLogin !== 'function') {
        throw createExistingTotpError('已有账号 2FA 登录执行器未接入。');
      }
      let result = null;
      try {
        result = await recoverRegisteredTotpLogin({
          tabId,
          state: latestState,
          authState,
          step: 4,
        });
      } catch (error) {
        if (isAccountDeactivated(error)) {
          if (typeof markCurrentRegistrationAccountDeactivated === 'function') {
            const markResult = await markCurrentRegistrationAccountDeactivated(latestState, {
              email: normalizeString(latestState.email).toLowerCase(),
              reason: 'OpenAI 认证页返回 account_deactivated，账号已删除或停用。',
              reasonCode: 'ACCOUNT_DEACTIVATED',
              logPrefix: '步骤 4 检测到账号已封禁',
              level: 'warn',
            });
            error.nextAccountEmail = normalizeString(markResult?.nextEmail).toLowerCase();
            error.accountSourceExhausted = markResult?.poolUpdated === true && !error.nextAccountEmail;
          }
          error.code = 'ACCOUNT_DEACTIVATED';
          error.retryable = false;
          error.nodeId = 'existing-totp-login';
          error.failedNodeId = 'existing-totp-login';
        }
        throw error;
      }
      if (!result?.handled) {
        throw createExistingTotpError(
          result?.reason === 'missing_totp_secret'
            ? '当前邮箱缺少本地 TOTP 密钥，已保留认证页面。'
            : '未能确认已有账号 2FA 登录状态，已保留认证页面。'
        );
      }

      const patch = {
        existingTotpLogin: true,
        existingTotpLoginEmail: normalizeString(result.existingTotpLoginEmail || latestState.email).toLowerCase(),
        twoFactorEnabled: true,
        skipRegistrationAfterExistingTotp: true,
      };
      await setState?.(patch);
      await completeNodeFromBackground(state?.nodeId || 'existing-totp-login', patch);
      return { ...result, ...patch };
    }

    return { executeExistingTotpLogin };
  }

  return {
    createExistingTotpLoginExecutor,
    isAccountDeactivated,
    isTotpChallenge,
  };
});
