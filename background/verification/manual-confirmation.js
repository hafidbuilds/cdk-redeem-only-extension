(function attachManualVerificationConfirmation(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.MultiPageManualVerificationConfirmation = api;
})(typeof self !== 'undefined' ? self : globalThis, function createManualVerificationConfirmationModule() {
  function createSessionPreservingError(code, message) {
    const error = new Error(`${code}::${message}`);
    error.code = code;
    error.retryable = false;
    error.preserveSignupSession = true;
    return error;
  }

  function createManualVerificationConfirmation(context = {}) {
    const constants = context.constants || {};
    const {
      POST_SUBMIT_CONFIRM_TIMEOUT_MS,
      POST_SUBMIT_CONFIRM_POLL_INTERVAL_MS,
    } = constants;
    const {
      addLog,
      confirmCustomVerificationStepBypassRequest,
      detectStep4PostSubmitFallback,
      getCompletionStep,
      getNodeIdForStep,
      getStep4FallbackLabel,
      getTabId,
      getVerificationCodeLabel,
      setNodeStatus,
      setState,
    } = context;

    async function confirmCustomVerificationStepBypass(step, options = {}) {
      const completionStep = getCompletionStep(step, options);
      const promptStep = getCompletionStep(step, { completionStep: options.promptStep ?? completionStep });
      const verificationLabel = getVerificationCodeLabel(step);
      await addLog(`步骤 ${completionStep}：当前为自定义邮箱模式，请手动在页面中输入${verificationLabel}验证码并进入下一页面。`, 'warn');

      let response = null;
      try {
        response = await confirmCustomVerificationStepBypassRequest(promptStep);
      } catch {
        throw new Error(`步骤 ${completionStep}：无法打开确认弹窗，请先保持侧边栏打开后重试。`);
      }
      if (response?.error) throw new Error(response.error);
      if (!response?.confirmed) {
        throw new Error(`步骤 ${completionStep}：已取消手动${verificationLabel}验证码确认。`);
      }

      let confirmedStep4State = null;
      if (step === 4) {
        const signupTabId = await getTabId('signup-page');
        if (!signupTabId) {
          throw createSessionPreservingError(
            'SIGNUP_MANUAL_VERIFICATION_UNCONFIRMED',
            '步骤 4：认证页面标签页已关闭，无法确认手动验证码是否通过。'
          );
        }
        confirmedStep4State = await detectStep4PostSubmitFallback(signupTabId, {
          timeoutMs: Math.max(1000, Number(POST_SUBMIT_CONFIRM_TIMEOUT_MS) || 12000),
          pollIntervalMs: Math.max(100, Number(POST_SUBMIT_CONFIRM_POLL_INTERVAL_MS) || 300),
        });
        if (confirmedStep4State?.invalidCode) {
          const detail = String(confirmedStep4State.errorText || '验证码被拒绝。').trim();
          throw createSessionPreservingError(
            'SIGNUP_MANUAL_VERIFICATION_REJECTED',
            `步骤 4：OpenAI 未接受手动输入的验证码：${detail}`
          );
        }
        if (!confirmedStep4State?.success) {
          throw createSessionPreservingError(
            'SIGNUP_MANUAL_VERIFICATION_UNCONFIRMED',
            '步骤 4：点击继续后仍未确认进入注册资料页、通行密钥页或 ChatGPT 已登录页。请保留当前页面，确认验证码已提交且页面完成跳转后再继续。'
          );
        }
        await addLog(
          `步骤 ${completionStep}：已确认手动验证码通过，页面进入${getStep4FallbackLabel(confirmedStep4State)}。`,
          'ok'
        );
      }

      await setState({
        lastEmailTimestamp: null,
        signupVerificationRequestedAt: null,
        loginVerificationRequestedAt: null,
      });
      const completionNodeId = await getNodeIdForStep(completionStep);
      if (!completionNodeId) throw new Error(`步骤 ${completionStep} 未映射到验证码节点。`);
      await setNodeStatus(completionNodeId, 'skipped');
      await addLog(`步骤 ${completionStep}：已确认手动完成${verificationLabel}验证码输入，当前步骤已跳过。`, 'warn');
      return {
        confirmed: true,
        ...(confirmedStep4State ? {
          success: true,
          reason: confirmedStep4State.reason || '',
          skipProfileStep: Boolean(confirmedStep4State.skipProfileStep),
          passkeyEnrollmentRequired: Boolean(confirmedStep4State.passkeyEnrollmentRequired),
          url: confirmedStep4State.url || '',
        } : {}),
      };
    }

    return { confirmCustomVerificationStepBypass };
  }

  return { createManualVerificationConfirmation };
});
