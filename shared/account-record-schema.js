(function attachAccountRecordSchema(root, factory) {
  const api = factory();
  root.MultiPageAccountRecordSchema = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createAccountRecordSchemaModule() {
  const SCHEMA_VERSION = 2;
  const REDEEM_CHANNELS = Object.freeze(['upi', 'ideal', 'pix']);
  const VALIDITY_STATUSES = new Set(['unknown', 'valid', 'invalid', 'deactivated']);
  const ELIGIBILITY_STATUSES = new Set(['unknown', 'checking', 'eligible', 'ineligible', 'failed']);
  const MEMBERSHIP_STATUSES = new Set(['unknown', 'free', 'plus', 'expired']);
  const ACCESS_TOKEN_STATUSES = new Set(['missing', 'validating', 'valid', 'invalid', 'refreshing']);
  const REDEMPTION_STATUSES = new Set(['idle', 'blocked', 'queued', 'submitting', 'pending', 'succeeded', 'failed', 'canceled']);

  function normalizeText(value = '') {
    return String(value ?? '').trim();
  }

  function normalizeAccountId(value = '') {
    const email = normalizeText(value).toLowerCase();
    if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return '';
    }
    return email;
  }

  function normalizeEnum(value, allowed, fallback) {
    const normalized = normalizeText(value).toLowerCase();
    return allowed.has(normalized) ? normalized : fallback;
  }

  function normalizeIsoTimestamp(value = '') {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return new Date(value).toISOString();
    }
    const text = normalizeText(value);
    if (!text) return '';
    const timestamp = Date.parse(text);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
  }

  function normalizeRedeemChannel(value = '') {
    const normalized = normalizeText(value).toLowerCase();
    return REDEEM_CHANNELS.includes(normalized) ? normalized : '';
  }

  function createRedemptionChannelRecord(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
      status: normalizeEnum(source.status, REDEMPTION_STATUSES, 'idle'),
      eligibilityStatus: normalizeEnum(source.eligibilityStatus, ELIGIBILITY_STATUSES, 'unknown'),
      eligibilityReason: normalizeText(source.eligibilityReason),
      cdkey: normalizeText(source.cdkey),
      remoteJobId: normalizeText(source.remoteJobId),
      remoteStatus: normalizeText(source.remoteStatus),
      failureCount: Math.max(0, Math.floor(Number(source.failureCount) || 0)),
      dailyLimitBlockedAt: normalizeIsoTimestamp(source.dailyLimitBlockedAt),
      dailyLimitBlockedUntil: normalizeIsoTimestamp(source.dailyLimitBlockedUntil),
      lastAttemptAt: normalizeIsoTimestamp(source.lastAttemptAt),
      lastErrorCode: normalizeText(source.lastErrorCode),
      lastError: normalizeText(source.lastError),
    };
  }

  function createEmptyAccountRecord(accountId, options = {}) {
    const id = normalizeAccountId(accountId);
    if (!id) return null;
    const now = normalizeIsoTimestamp(options.now) || new Date().toISOString();
    return {
      schemaVersion: SCHEMA_VERSION,
      id,
      identity: {
        type: 'email',
        email: id,
        source: normalizeText(options.source),
        providerId: normalizeText(options.providerId),
      },
      credentials: {
        password: '',
        totpSecret: '',
        no2faFreeRoute: false,
        accessToken: '',
        accessTokenStatus: 'missing',
        accessTokenUpdatedAt: '',
      },
      lifecycle: {
        validityStatus: 'unknown',
        eligibilityStatus: 'unknown',
        membershipStatus: 'unknown',
        membershipChannel: '',
        reasonCode: '',
        reason: '',
        checkedAt: '',
      },
      redemption: {
        upi: createRedemptionChannelRecord(),
        ideal: createRedemptionChannelRecord(),
        pix: createRedemptionChannelRecord(),
      },
      workflow: {
        lastTaskId: '',
        lastNodeId: '',
        lastRunStatus: '',
      },
      metadata: {},
      createdAt: now,
      updatedAt: now,
    };
  }

  function normalizeCredentials(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const accessToken = normalizeText(source.accessToken);
    const no2faFreeRoute = source.no2faFreeRoute === true;
    const password = normalizeText(source.password);
    const totpSecret = normalizeText(source.totpSecret).replace(/\s+/g, '').toUpperCase();
    return {
      ...source,
      password,
      totpSecret,
      no2faFreeRoute,
      twoFactorEnabled: no2faFreeRoute ? false : (source.twoFactorEnabled === true || Boolean(totpSecret)),
      accessToken,
      accessTokenStatus: normalizeEnum(
        source.accessTokenStatus,
        ACCESS_TOKEN_STATUSES,
        accessToken ? 'valid' : 'missing'
      ),
      accessTokenUpdatedAt: normalizeIsoTimestamp(source.accessTokenUpdatedAt),
    };
  }

  function normalizeLifecycle(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
      validityStatus: normalizeEnum(source.validityStatus, VALIDITY_STATUSES, 'unknown'),
      eligibilityStatus: normalizeEnum(source.eligibilityStatus, ELIGIBILITY_STATUSES, 'unknown'),
      membershipStatus: normalizeEnum(source.membershipStatus, MEMBERSHIP_STATUSES, 'unknown'),
      membershipChannel: normalizeRedeemChannel(source.membershipChannel),
      reasonCode: normalizeText(source.reasonCode),
      reason: normalizeText(source.reason),
      checkedAt: normalizeIsoTimestamp(source.checkedAt),
    };
  }

  function normalizeAccountRecord(value = {}, options = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const id = normalizeAccountId(source.id || source.identity?.email || source.email || options.accountId);
    if (!id) return null;
    const fallback = createEmptyAccountRecord(id, {
      now: source.createdAt || source.updatedAt || options.now,
      source: source.identity?.source || options.source,
      providerId: source.identity?.providerId || options.providerId,
    });
    const identity = source.identity && typeof source.identity === 'object' ? source.identity : {};
    const redemption = source.redemption && typeof source.redemption === 'object' ? source.redemption : {};
    const workflow = source.workflow && typeof source.workflow === 'object' ? source.workflow : {};
    const metadata = source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)
      ? source.metadata
      : {};
    return {
      schemaVersion: SCHEMA_VERSION,
      id,
      identity: {
        type: 'email',
        email: id,
        source: normalizeText(identity.source || fallback.identity.source),
        providerId: normalizeText(identity.providerId || fallback.identity.providerId),
      },
      credentials: normalizeCredentials(source.credentials),
      lifecycle: normalizeLifecycle(source.lifecycle),
      redemption: {
        upi: createRedemptionChannelRecord(redemption.upi),
        ideal: createRedemptionChannelRecord(redemption.ideal),
        pix: createRedemptionChannelRecord(redemption.pix),
      },
      workflow: {
        lastTaskId: normalizeText(workflow.lastTaskId),
        lastNodeId: normalizeText(workflow.lastNodeId),
        lastRunStatus: normalizeText(workflow.lastRunStatus).toLowerCase(),
      },
      metadata: { ...metadata },
      createdAt: normalizeIsoTimestamp(source.createdAt) || fallback.createdAt,
      updatedAt: normalizeIsoTimestamp(source.updatedAt) || fallback.updatedAt,
    };
  }

  function normalizeAccountRecordsRoot(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const rawItems = source.items && typeof source.items === 'object' && !Array.isArray(source.items)
      ? source.items
      : {};
    const items = {};
    Object.entries(rawItems).forEach(([key, item]) => {
      const normalized = normalizeAccountRecord(item, { accountId: key });
      if (normalized) items[normalized.id] = normalized;
    });
    return {
      schemaVersion: SCHEMA_VERSION,
      items,
      updatedAt: normalizeIsoTimestamp(source.updatedAt),
    };
  }

  function mergeDefined(base = {}, patch = {}) {
    const next = { ...base };
    Object.entries(patch || {}).forEach(([key, value]) => {
      if (value !== undefined) next[key] = value;
    });
    return next;
  }

  function mergeAccountRecord(currentValue = {}, patchValue = {}, options = {}) {
    const id = normalizeAccountId(
      patchValue?.id || patchValue?.identity?.email || currentValue?.id || currentValue?.identity?.email
    );
    if (!id) return null;
    const now = normalizeIsoTimestamp(options.now) || new Date().toISOString();
    const current = normalizeAccountRecord(currentValue, { accountId: id, now });
    const patch = patchValue && typeof patchValue === 'object' ? patchValue : {};
    return normalizeAccountRecord({
      ...current,
      ...patch,
      id,
      identity: mergeDefined(current.identity, patch.identity),
      credentials: mergeDefined(current.credentials, patch.credentials),
      lifecycle: mergeDefined(current.lifecycle, patch.lifecycle),
      redemption: {
        upi: mergeDefined(current.redemption.upi, patch.redemption?.upi),
        ideal: mergeDefined(current.redemption.ideal, patch.redemption?.ideal),
        pix: mergeDefined(current.redemption.pix, patch.redemption?.pix),
      },
      workflow: mergeDefined(current.workflow, patch.workflow),
      metadata: mergeDefined(current.metadata, patch.metadata),
      createdAt: current.createdAt || patch.createdAt || now,
      updatedAt: options.preserveUpdatedAt
        ? (normalizeIsoTimestamp(patch.updatedAt) || current.updatedAt)
        : now,
    }, { accountId: id, now });
  }

  return {
    ACCESS_TOKEN_STATUSES,
    ELIGIBILITY_STATUSES,
    MEMBERSHIP_STATUSES,
    REDEEM_CHANNELS,
    REDEMPTION_STATUSES,
    SCHEMA_VERSION,
    VALIDITY_STATUSES,
    createEmptyAccountRecord,
    createRedemptionChannelRecord,
    mergeAccountRecord,
    normalizeAccountId,
    normalizeAccountRecord,
    normalizeAccountRecordsRoot,
    normalizeIsoTimestamp,
    normalizeRedeemChannel,
    normalizeText,
  };
});
