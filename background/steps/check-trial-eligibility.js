(function attachBackgroundCheckTrialEligibility(root, factory) {
  root.MultiPageBackgroundCheckTrialEligibility = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundCheckTrialEligibilityModule() {
  function normalizeString(value = '') {
    return String(value || '').trim();
  }

  function normalizeEmail(value = '') {
    return normalizeString(value).toLowerCase();
  }

  function getSessionEmail(session = {}) {
    return normalizeEmail(
      session?.user?.email
      || session?.email
      || session?.account?.email
      || session?.profile?.email
    );
  }

  function normalizeRoute(value = '') {
    const route = normalizeString(value).toLowerCase();
    return route === 'passkey-free' ? 'passkey-free' : 'full-2fa';
  }

  function createCheckTrialEligibilityExecutor(deps = {}) {
    const {
      addLog = async () => {},
      checkRegistrationUpiTrialEligibility = null,
      completeNodeFromBackground = async () => {},
      getState = async () => ({}),
      markCurrentRegistrationAccountUsed = null,
      readCurrentChatGptSessionForExport = null,
      setState = async () => {},
      throwIfStopped = () => {},
    } = deps;

    async function executeCheckTrialEligibility(state = {}) {
      throwIfStopped();
      const latestState = { ...(await getState().catch(() => ({}))), ...(state || {}) };
      const visibleStep = Math.max(1, Math.floor(Number(latestState.visibleStep) || 10));
      const route = normalizeRoute(latestState.registrationFreeRoute);
      if (route === 'passkey-free') {
        if (latestState.passkeyEnabled !== true) {
          throw new Error(`步骤 ${visibleStep}：Passkey 尚未设置完成，不能开始 GCash 资格验证。`);
        }
      } else if (latestState.totpMfaEnabled !== true && !normalizeString(latestState.totpMfaSecret)) {
        throw new Error(`步骤 ${visibleStep}：2FA 尚未设置或校验完成，不能开始 GCash 资格验证。`);
      }
      if (typeof readCurrentChatGptSessionForExport !== 'function') {
        throw new Error(`步骤 ${visibleStep}：缺少 ChatGPT Session 读取能力。`);
      }
      if (typeof checkRegistrationUpiTrialEligibility !== 'function') {
        throw new Error(`步骤 ${visibleStep}：缺少 GCash 资格检测能力。`);
      }

      await addLog('步骤 10：正在读取当前 ChatGPT Session 并验证 GCash 资格...', 'info', {
        step: visibleStep,
        stepKey: 'check-trial-eligibility',
        nodeId: 'check-trial-eligibility',
      });
      const sessionResult = await readCurrentChatGptSessionForExport();
      const session = sessionResult?.session || {};
      const accessToken = normalizeString(sessionResult?.accessToken || session?.accessToken);
      const targetEmail = normalizeEmail(
        latestState.existingTotpLoginEmail
        || latestState.email
        || latestState.registrationEmailState?.current
        || latestState.accountIdentifier
      );
      const sessionEmail = getSessionEmail(session);
      if (targetEmail && sessionEmail && targetEmail !== sessionEmail) {
        const error = new Error('当前 Session 账号与本轮账号不一致，未执行 GCash 资格验证。');
        error.code = 'UPI_ELIGIBILITY_CHECK_FAILED';
        error.retryable = false;
        throw error;
      }
      const email = targetEmail || sessionEmail;
      if (!email || !accessToken) {
        const error = new Error(`步骤 ${visibleStep}：未读取到当前账号邮箱或 AT，无法验证 GCash 资格。`);
        error.code = 'UPI_ELIGIBILITY_CHECK_FAILED';
        error.retryable = true;
        throw error;
      }

      const credentialPatch = route === 'passkey-free'
        ? {
          passkeyEnabled: true,
          passkeyCredentialId: normalizeString(latestState.passkeyCredentialId),
          twoFactorEnabled: true,
          no2faFreeRoute: false,
        }
        : {
          totpMfaEnabled: true,
          totpMfaSecret: normalizeString(latestState.totpMfaSecret),
          twoFactorEnabled: true,
          no2faFreeRoute: false,
        };
      const eligibility = await checkRegistrationUpiTrialEligibility({
        state: { ...latestState, email },
        patch: credentialPatch,
        session,
        accessToken,
        email,
        visibleStep,
      });
      const status = normalizeString(eligibility?.trialEligibilityStatus).toLowerCase() || 'failed';
      const checkedAt = normalizeString(eligibility?.trialEligibilityCheckedAt) || new Date().toISOString();
      const eligibilityStatePatch = {
        email,
        accessToken,
        accessTokenUpdatedAt: checkedAt,
        trialEligibilityStatus: status,
        trialEligibilityReason: normalizeString(eligibility?.trialEligibilityReason || eligibility?.reason),
        trialEligibilityReasonCode: normalizeString(eligibility?.trialEligibilityReasonCode),
        trialEligibilityCheckedAt: checkedAt,
      };
      await setState(eligibilityStatePatch);
      if (!eligibility?.eligible) {
        const error = new Error(`账号未通过 GCash 资格检测：${eligibility?.reason || '未知原因'}`);
        error.code = status === 'ineligible' ? 'UPI_ACCOUNT_INELIGIBLE' : 'UPI_ELIGIBILITY_CHECK_FAILED';
        error.trialEligibilityStatus = status;
        error.retryable = status !== 'ineligible' && eligibility?.retryable !== false;
        error.preserveSignupSession = true;
        throw error;
      }

      const patch = eligibilityStatePatch;
      if (typeof markCurrentRegistrationAccountUsed === 'function') {
        await markCurrentRegistrationAccountUsed({ ...latestState, ...credentialPatch, ...patch, accessToken }, {
          logPrefix: '步骤 10 GCash 资格验证完成',
          level: 'ok',
          preferProvidedState: true,
        });
      }
      await addLog(`步骤 10：${email} 已通过 GCash 资格验证。`, 'ok', {
        step: visibleStep,
        stepKey: 'check-trial-eligibility',
        nodeId: 'check-trial-eligibility',
      });
      await completeNodeFromBackground(state?.nodeId || 'check-trial-eligibility', patch);
      return eligibility;
    }

    return { executeCheckTrialEligibility };
  }

  return { createCheckTrialEligibilityExecutor };
});
