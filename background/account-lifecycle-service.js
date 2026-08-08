(function attachAccountLifecycleService(root, factory) {
  const api = factory(root);
  root.MultiPageAccountLifecycleService = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createAccountLifecycleServiceModule(root) {
  function normalizeText(value = '') {
    return String(value ?? '').trim();
  }

  function classifyAccessTokenEvidence(evidence = {}) {
    const statusCode = Math.floor(Number(evidence.httpStatus || evidence.statusCode) || 0);
    const errorCode = normalizeText(evidence.errorCode || evidence.code).toLowerCase();
    const message = normalizeText(evidence.message || evidence.error).toLowerCase();
    const combined = `${errorCode} ${message}`;
    if (/account[_ -]?deactivated|account[_ -]?deleted|账号.*(?:注销|停用)/i.test(combined)) {
      return { kind: 'deactivated', retryable: false, clearToken: true };
    }
    if (statusCode === 401 || /token[_ -]?401|invalid[_ -]?(?:access[_ -]?)?token|token[_ -]?invalid/i.test(combined)) {
      return { kind: 'invalid', retryable: false, clearToken: false };
    }
    if (evidence.networkError === true || evidence.timeout === true || statusCode >= 500) {
      return { kind: 'transient', retryable: true, clearToken: false };
    }
    if (evidence.valid === true || (statusCode >= 200 && statusCode < 300)) {
      return { kind: 'valid', retryable: false, clearToken: false };
    }
    return { kind: 'unknown', retryable: false, clearToken: false };
  }

  function buildAccessTokenPatch(currentCredentials = {}, evidence = {}, options = {}) {
    const current = currentCredentials && typeof currentCredentials === 'object' ? currentCredentials : {};
    const classification = classifyAccessTokenEvidence(evidence);
    const replacementToken = normalizeText(options.replacementToken);
    const replacementVerified = options.replacementVerified === true;
    const checkedAt = normalizeText(options.checkedAt) || new Date().toISOString();
    if (replacementToken && replacementVerified) {
      return {
        credentials: {
          ...current,
          accessToken: replacementToken,
          accessTokenStatus: 'valid',
          accessTokenUpdatedAt: checkedAt,
        },
        lifecycle: { validityStatus: 'valid', reasonCode: 'ACCESS_TOKEN_REPLACED_VERIFIED', checkedAt },
        retryable: false,
      };
    }
    if (replacementToken && !replacementVerified) {
      return {
        credentials: { ...current, accessTokenStatus: 'validating' },
        lifecycle: { reasonCode: 'ACCESS_TOKEN_REPLACEMENT_UNVERIFIED', checkedAt },
        retryable: false,
      };
    }
    if (classification.kind === 'deactivated') {
      return {
        credentials: { ...current, accessToken: '', accessTokenStatus: 'invalid', accessTokenUpdatedAt: checkedAt },
        lifecycle: {
          validityStatus: 'deactivated',
          reasonCode: 'ACCOUNT_DEACTIVATED',
          reason: normalizeText(evidence.message || evidence.error) || '账号已删除或停用，账户不可用。',
          checkedAt,
        },
        retryable: false,
      };
    }
    if (classification.kind === 'invalid') {
      return {
        credentials: { ...current, accessTokenStatus: 'invalid', accessTokenUpdatedAt: checkedAt },
        lifecycle: { reasonCode: 'ACCESS_TOKEN_CONFIRMED_INVALID', checkedAt },
        retryable: false,
      };
    }
    if (classification.kind === 'valid') {
      return {
        credentials: { ...current, accessTokenStatus: current.accessToken ? 'valid' : 'missing', accessTokenUpdatedAt: checkedAt },
        lifecycle: { validityStatus: 'valid', reasonCode: 'ACCESS_TOKEN_VALID', checkedAt },
        retryable: false,
      };
    }
    return {
      credentials: { ...current },
      lifecycle: { reasonCode: classification.kind === 'transient' ? 'ACCESS_TOKEN_CHECK_TRANSIENT' : 'ACCESS_TOKEN_CHECK_UNKNOWN', checkedAt },
      retryable: classification.retryable,
    };
  }

  function canUseAccount(record = {}) {
    const validityStatus = normalizeText(record.lifecycle?.validityStatus).toLowerCase();
    const accessTokenStatus = normalizeText(record.credentials?.accessTokenStatus).toLowerCase();
    if (validityStatus === 'deactivated' || validityStatus === 'invalid') {
      return { allowed: false, reasonCode: validityStatus === 'deactivated' ? 'ACCOUNT_DEACTIVATED' : 'ACCOUNT_INVALID' };
    }
    if (accessTokenStatus === 'invalid') return { allowed: false, reasonCode: 'ACCESS_TOKEN_INVALID' };
    if (accessTokenStatus === 'missing') return { allowed: false, reasonCode: 'ACCESS_TOKEN_MISSING' };
    return { allowed: true, reasonCode: '' };
  }

  function buildTrialEligibilityPatch(evidence = {}, options = {}) {
    const status = normalizeText(
      evidence.status || evidence.trialEligibilityStatus || evidence.eligibilityStatus
    ).toLowerCase();
    if (!['eligible', 'ineligible', 'failed'].includes(status)) {
      throw new Error('试用资格证据缺少明确状态。');
    }
    const checkedAt = normalizeText(options.checkedAt || evidence.checkedAt) || new Date().toISOString();
    return {
      eligibilityStatus: status,
      reasonCode: normalizeText(
        evidence.reasonCode || evidence.trialEligibilityReasonCode
      ) || (status === 'ineligible' ? 'UPI_TRIAL_INELIGIBLE' : status === 'eligible' ? 'UPI_TRIAL_ELIGIBLE' : 'UPI_TRIAL_CHECK_FAILED'),
      reason: normalizeText(
        evidence.reason || evidence.trialEligibilityReason
      ) || (status === 'ineligible' ? '账号无试用资格。' : status === 'eligible' ? '账号有试用资格。' : '资格检查失败，可稍后重试。'),
      checkedAt,
    };
  }

  function createAccountLifecycleService(deps = {}) {
    const repository = deps.repository;
    if (!repository?.updateCredentials || !repository?.updateLifecycle) {
      throw new Error('Account lifecycle service requires an account repository.');
    }

    async function applyAccessTokenEvidence(accountId, evidence = {}, options = {}) {
      const current = await repository.getAccount(accountId);
      if (!current) throw new Error('账号不存在。');
      const patch = buildAccessTokenPatch(current.credentials, evidence, options);
      await repository.updateCredentials(accountId, patch.credentials, options);
      const record = await repository.updateLifecycle(accountId, patch.lifecycle, options);
      return { record, retryable: patch.retryable };
    }

    async function applyTrialEligibilityEvidence(accountId, evidence = {}, options = {}) {
      const patch = buildTrialEligibilityPatch(evidence, options);
      return repository.updateLifecycle(accountId, patch, options);
    }

    async function clearTrialEligibilityEvidence(accountId, options = {}) {
      return repository.updateLifecycle(accountId, {
        eligibilityStatus: 'unknown',
        reasonCode: '',
        reason: '',
        checkedAt: normalizeText(options.checkedAt) || new Date().toISOString(),
      }, options);
    }

    return {
      applyAccessTokenEvidence,
      applyTrialEligibilityEvidence,
      clearTrialEligibilityEvidence,
    };
  }

  return {
    buildAccessTokenPatch,
    buildTrialEligibilityPatch,
    canUseAccount,
    classifyAccessTokenEvidence,
    createAccountLifecycleService,
  };
});
