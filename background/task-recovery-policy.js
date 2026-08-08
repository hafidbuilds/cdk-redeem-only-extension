(function attachTaskRecoveryPolicy(root, factory) {
  const api = factory(); root.MultiPageTaskRecoveryPolicy = api; if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createTaskRecoveryPolicyModule() {
  function decideTaskRecovery(task = {}) {
    const checkpoint = task.checkpoint || {};
    const base = {
      preserveAccount: true,
      clearAccessToken: false,
      finalAccountGroup: '',
    };
    if (checkpoint.accountDeactivated === true) return { ...base, status: 'failed', action: 'stop', canRetry: false, canResubmit: false, releaseLocks: true, clearAccessToken: true, finalAccountGroup: 'failed', errorCode: 'ACCOUNT_DEACTIVATED' };
    if (checkpoint.accessTokenRefreshed === true && checkpoint.accessTokenSaved !== true) return { ...base, status: 'manual_review', action: 'manual_review', canRetry: false, canResubmit: false, releaseLocks: true, errorCode: 'ACCESS_TOKEN_SAVE_UNCONFIRMED' };
    if (checkpoint.waitingForVerificationCode === true) return { ...base, status: 'interrupted', action: 'resume_wait', canRetry: true, canResubmit: false, releaseLocks: false, errorCode: 'VERIFICATION_WAIT_INTERRUPTED' };
    if (checkpoint.externalSideEffectStarted === true) return { ...base, status: 'manual_review', action: 'manual_review', canRetry: false, canResubmit: false, releaseLocks: false, errorCode: 'TASK_RECOVERY_AMBIGUOUS' };
    if (checkpoint.registrationEmailSubmitted !== true || checkpoint.remoteValidationStarted !== true) return { ...base, status: 'interrupted', action: 'resume_safe', canRetry: true, canResubmit: true, releaseLocks: true, errorCode: 'TASK_INTERRUPTED_SAFE' };
    return { ...base, status: 'manual_review', action: 'manual_review', canRetry: false, canResubmit: false, releaseLocks: false, errorCode: 'TASK_RECOVERY_AMBIGUOUS' };
  }
  return { decideTaskRecovery };
});
