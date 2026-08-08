(function attachFreeAccountResults(root, factory) {
  const api = factory();
  root.MultiPageFreeAccountResults = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createFreeAccountResultsModule() {
  const SCHEMA_VERSION = 3;
  const STORAGE_KEY = 'freeAccountResults';
  const LEGACY_STORAGE_KEY = 'upiCredentialMembershipCheckResults';
  const ELIGIBILITY_STATUSES = new Set(['unknown', 'checking', 'eligible', 'ineligible', 'failed']);
  const PERSISTED_ITEM_KEYS = new Set([
    'email', 'status', 'password', 'gptPassword', 'totpMfaSecret', 'totpSecret',
    'totpMfaEnabled', 'twoFactorEnabled', 'no2faFreeRoute', 'accessToken',
    'accessTokenStatus', 'accessTokenUpdatedAt', 'session', 'sessionUpdatedAt',
    'verificationUrl', 'passkeyEnabled', 'passkeyCredentialId', 'passkeyFactorId',
    'passkeyRpId', 'passkeyUserHandle', 'passkeyPrivateJwk', 'passkeyPublicKeyCose',
    'passkeySignCount', 'passkeyAlg', 'accountValidityStatus', 'enabled', 'source',
    'sourceStep', 'recordedAt', 'createdAt', 'updatedAt', 'trialEligibilityStatus',
    'trialEligibilityReason', 'trialEligibilityReasonCode', 'trialEligibilityCheckedAt',
    'trialEligibilityRetryable',
  ]);
  const REMOVED_ITEM_KEYS = new Set([
    'cdkey',
    'upiRedeemCdkey',
    'redeemChannel',
    'channel',
    'paymentChannel',
    'redeemStatus',
    'redeemReason',
    'redeemSuccessAt',
    'redeemStartedAt',
    'redeemCompletedAt',
    'remoteStatus',
    'remoteJobId',
    'jobId',
    'failureCount',
    'redeemFailureCount',
    'dailyLimitBlockedAt',
    'dailyLimitBlockedUntil',
    'membershipOverrideStatus',
    'membershipOverrideCheckedAt',
    'planType',
    'subscriptionPlanType',
    'isPlus',
    'isPro',
    'isTeam',
    'hasActiveSubscription',
    'has_active_subscription',
    'subscriptionActive',
    'subscription_active',
    'upiRedeemSuccess',
    'upiRedeemSubscriptionActive',
    'upiRedeemHasActiveSubscription',
    'upiRedeemSubscriptionPlanType',
    'upiRedeemSubscriptionCheckedAt',
  ]);

  function normalizeText(value = '') {
    return String(value || '').trim();
  }

  function normalizeEmail(value = '') {
    return normalizeText(value).toLowerCase();
  }

  function normalizeEligibilityStatus(value = '') {
    const normalized = normalizeText(value).toLowerCase();
    if (['not_eligible', 'no_trial', 'trial_ineligible', 'rejected'].includes(normalized)) return 'ineligible';
    if (normalized === 'skipped') return 'unknown';
    return ELIGIBILITY_STATUSES.has(normalized) ? normalized : 'unknown';
  }

  function getItemEligibilityStatus(item = {}) {
    return normalizeEligibilityStatus(
      item.trialEligibilityStatus
      || item.eligibilityStatus
      || item.upiTrialEligibilityStatus
    );
  }

  function getItemGroup(item = {}) {
    return getItemEligibilityStatus(item) === 'ineligible' ? 'free-ineligible' : 'free';
  }

  function hasCompleteSession(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const session = source.session && typeof source.session === 'object' && !Array.isArray(source.session)
      ? source.session
      : source;
    const email = normalizeEmail(session?.user?.email || session?.email || session?.account?.email);
    const accessToken = normalizeText(session?.accessToken || session?.access_token);
    return Boolean(session?.user && email && accessToken);
  }

  function sanitizeFreeAccountItem(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const email = normalizeEmail(source.email || source.accountIdentifier || source.id);
    if (!email || normalizeText(source.status).toLowerCase() === 'paid') return null;
    const item = {};
    Object.entries(source).forEach(([key, entryValue]) => {
      if (PERSISTED_ITEM_KEYS.has(key) && !REMOVED_ITEM_KEYS.has(key)) item[key] = entryValue;
    });
    const trialEligibilityStatus = getItemEligibilityStatus(source);
    return {
      ...item,
      email,
      status: 'free',
      trialEligibilityStatus,
      trialEligibilityReason: normalizeText(
        source.trialEligibilityReason
        || source.eligibilityReason
        || source.reason
      ),
      trialEligibilityReasonCode: normalizeText(
        source.trialEligibilityReasonCode
        || source.eligibilityReasonCode
        || source.reasonCode
      ),
      trialEligibilityCheckedAt: normalizeText(
        source.trialEligibilityCheckedAt
        || source.eligibilityCheckedAt
        || source.checkedAt
      ),
      enabled: source.enabled !== false,
    };
  }

  function resultsNeedCompaction(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const items = Array.isArray(source.items) ? source.items : [];
    return items.some((rawItem) => {
      if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) return true;
      return Object.keys(rawItem).some((key) => !PERSISTED_ITEM_KEYS.has(key) || REMOVED_ITEM_KEYS.has(key));
    });
  }

  function mergeItems(items = []) {
    const byEmail = new Map();
    for (const rawItem of Array.isArray(items) ? items : []) {
      const item = sanitizeFreeAccountItem(rawItem);
      if (!item) continue;
      const previous = byEmail.get(item.email) || {};
      const previousStatus = getItemEligibilityStatus(previous);
      const nextStatus = getItemEligibilityStatus(item);
      const useNextEligibility = nextStatus !== 'unknown' || previousStatus === 'unknown';
      byEmail.set(item.email, {
        ...previous,
        ...item,
        trialEligibilityStatus: useNextEligibility ? nextStatus : previousStatus,
        trialEligibilityReason: useNextEligibility
          ? item.trialEligibilityReason
          : previous.trialEligibilityReason,
        trialEligibilityReasonCode: useNextEligibility
          ? item.trialEligibilityReasonCode
          : previous.trialEligibilityReasonCode,
        trialEligibilityCheckedAt: useNextEligibility
          ? item.trialEligibilityCheckedAt
          : previous.trialEligibilityCheckedAt,
      });
    }
    return [...byEmail.values()].sort((left, right) => left.email.localeCompare(right.email));
  }

  function normalizeResults(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const items = mergeItems(source.items);
    const eligibleCount = items.filter((item) => getItemEligibilityStatus(item) === 'eligible').length;
    const ineligibleCount = items.filter((item) => getItemEligibilityStatus(item) === 'ineligible').length;
    const failedCount = items.filter((item) => getItemEligibilityStatus(item) === 'failed').length;
    const checkingCount = items.filter((item) => getItemEligibilityStatus(item) === 'checking').length;
    const unknownCount = items.length - eligibleCount - ineligibleCount - failedCount - checkingCount;
    return {
      schemaVersion: SCHEMA_VERSION,
      items,
      running: source.running === true && !source.stoppedAt,
      startedAt: normalizeText(source.startedAt),
      updatedAt: normalizeText(source.updatedAt),
      finishedAt: normalizeText(source.finishedAt),
      stoppedAt: normalizeText(source.stoppedAt),
      source: normalizeText(source.source),
      flowStage: normalizeText(source.flowStage),
      flowStageEmail: normalizeEmail(source.flowStageEmail),
      total: Math.max(items.length, Math.floor(Number(source.total) || 0)),
      completed: Math.max(items.length, Math.floor(Number(source.completed) || 0)),
      eligibleCount,
      ineligibleCount,
      failedCount,
      checkingCount,
      unknownCount,
    };
  }

  function projectAccountRecord(record = {}) {
    const source = record && typeof record === 'object' && !Array.isArray(record) ? record : {};
    const lifecycle = source.lifecycle && typeof source.lifecycle === 'object' ? source.lifecycle : {};
    const membershipStatus = normalizeText(lifecycle.membershipStatus).toLowerCase();
    const eligibilityStatus = normalizeEligibilityStatus(lifecycle.eligibilityStatus);
    if (membershipStatus !== 'free' && eligibilityStatus === 'unknown') return null;
    const credentials = source.credentials && typeof source.credentials === 'object' ? source.credentials : {};
    return sanitizeFreeAccountItem({
      email: source.id,
      status: 'free',
      password: credentials.password,
      gptPassword: credentials.password,
      totpMfaSecret: credentials.totpSecret,
      totpSecret: credentials.totpSecret,
      no2faFreeRoute: credentials.no2faFreeRoute === true,
      accessToken: credentials.accessToken,
      session: credentials.session,
      sessionUpdatedAt: credentials.sessionUpdatedAt,
      accessTokenStatus: credentials.accessTokenStatus,
      accessTokenUpdatedAt: credentials.accessTokenUpdatedAt,
      verificationUrl: credentials.verificationUrl,
      passkeyEnabled: credentials.passkeyEnabled === true,
      passkeyCredentialId: credentials.passkeyCredentialId,
      passkeyFactorId: credentials.passkeyFactorId,
      passkeyRpId: credentials.passkeyRpId,
      passkeyUserHandle: credentials.passkeyUserHandle,
      passkeyPrivateJwk: credentials.passkeyPrivateJwk,
      passkeyPublicKeyCose: credentials.passkeyPublicKeyCose,
      passkeySignCount: credentials.passkeySignCount,
      passkeyAlg: credentials.passkeyAlg,
      accountValidityStatus: lifecycle.validityStatus,
      trialEligibilityStatus: eligibilityStatus,
      trialEligibilityReason: lifecycle.reason,
      trialEligibilityReasonCode: lifecycle.reasonCode,
      trialEligibilityCheckedAt: lifecycle.checkedAt,
      source: source.identity?.source,
    });
  }

  function projectCustomEmailEntry(entry = {}) {
    const status = normalizeEligibilityStatus(entry?.trialEligibilityStatus);
    if (status !== 'ineligible') return null;
    return sanitizeFreeAccountItem({
      ...entry,
      email: entry.email,
      status: 'free',
      trialEligibilityStatus: status,
      trialEligibilityReason: entry.trialEligibilityReason || entry.note,
      trialEligibilityReasonCode: entry.trialEligibilityReasonCode,
      trialEligibilityCheckedAt: entry.trialEligibilityCheckedAt,
      source: entry.source || 'custom-email-pool',
    });
  }

  function migrateLegacyResults({ legacyResults = {}, accountRecords = {}, customEmailPoolEntries = [] } = {}) {
    const canonicalItems = Object.values(accountRecords?.items || {}).map(projectAccountRecord).filter(Boolean);
    const customItems = (Array.isArray(customEmailPoolEntries) ? customEmailPoolEntries : [])
      .map(projectCustomEmailEntry)
      .filter(Boolean);
    return normalizeResults({
      ...legacyResults,
      items: [
        ...(Array.isArray(legacyResults?.items) ? legacyResults.items : []),
        ...canonicalItems,
        ...customItems,
      ],
      running: false,
      updatedAt: normalizeText(legacyResults?.updatedAt) || new Date().toISOString(),
      flowStage: '',
      flowStageEmail: '',
    });
  }

  return {
    ELIGIBILITY_STATUSES,
    LEGACY_STORAGE_KEY,
    PERSISTED_ITEM_KEYS,
    REMOVED_ITEM_KEYS,
    SCHEMA_VERSION,
    STORAGE_KEY,
    getItemEligibilityStatus,
    getItemGroup,
    hasCompleteSession,
    mergeItems,
    migrateLegacyResults,
    normalizeEligibilityStatus,
    normalizeResults,
    resultsNeedCompaction,
    sanitizeFreeAccountItem,
  };
});
