(function attachAccountRecordSchema(root, factory) {
  const api = factory();
  root.MultiPageAccountRecordSchema = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createAccountRecordSchemaModule() {
  const SCHEMA_VERSION = 3;
  const VALIDITY_STATUSES = new Set(['unknown', 'valid', 'invalid', 'deactivated']);
  const ELIGIBILITY_STATUSES = new Set(['unknown', 'checking', 'eligible', 'ineligible', 'failed']);
  const MEMBERSHIP_STATUSES = new Set(['unknown', 'free']);
  const ACCESS_TOKEN_STATUSES = new Set(['missing', 'validating', 'valid', 'invalid', 'refreshing']);

  function normalizeText(value = '') {
    return String(value ?? '').trim();
  }

  function normalizeAccountId(value = '') {
    const email = normalizeText(value).toLowerCase();
    return email && email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
  }

  function normalizeEnum(value, allowed, fallback) {
    const normalized = normalizeText(value).toLowerCase();
    return allowed.has(normalized) ? normalized : fallback;
  }

  function normalizeIsoTimestamp(value = '') {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return new Date(value).toISOString();
    const text = normalizeText(value);
    if (!text) return '';
    const timestamp = Date.parse(text);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
  }

  function normalizeCredentials(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const accessToken = normalizeText(source.accessToken);
    const no2faFreeRoute = source.no2faFreeRoute === true;
    const password = normalizeText(source.password);
    const totpSecret = normalizeText(source.totpSecret).replace(/\s+/g, '').toUpperCase();
    const session = source.session && typeof source.session === 'object' && !Array.isArray(source.session)
      ? source.session
      : null;
    return {
      ...source,
      password,
      totpSecret,
      no2faFreeRoute,
      twoFactorEnabled: no2faFreeRoute ? false : (source.twoFactorEnabled === true || Boolean(totpSecret)),
      accessToken,
      session,
      accessTokenStatus: normalizeEnum(source.accessTokenStatus, ACCESS_TOKEN_STATUSES, accessToken ? 'valid' : 'missing'),
      accessTokenUpdatedAt: normalizeIsoTimestamp(source.accessTokenUpdatedAt),
      sessionUpdatedAt: normalizeIsoTimestamp(source.sessionUpdatedAt),
    };
  }

  function normalizeLifecycle(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
      validityStatus: normalizeEnum(source.validityStatus, VALIDITY_STATUSES, 'unknown'),
      eligibilityStatus: normalizeEnum(source.eligibilityStatus, ELIGIBILITY_STATUSES, 'unknown'),
      membershipStatus: normalizeEnum(source.membershipStatus, MEMBERSHIP_STATUSES, 'unknown'),
      reasonCode: normalizeText(source.reasonCode),
      reason: normalizeText(source.reason),
      checkedAt: normalizeIsoTimestamp(source.checkedAt),
    };
  }

  function createEmptyAccountRecord(accountId, options = {}) {
    const id = normalizeAccountId(accountId);
    if (!id) return null;
    const now = normalizeIsoTimestamp(options.now) || new Date().toISOString();
    return {
      schemaVersion: SCHEMA_VERSION,
      id,
      identity: { type: 'email', email: id, source: normalizeText(options.source), providerId: normalizeText(options.providerId) },
      credentials: normalizeCredentials({}),
      lifecycle: normalizeLifecycle({}),
      workflow: { lastTaskId: '', lastNodeId: '', lastRunStatus: '' },
      metadata: {},
      createdAt: now,
      updatedAt: now,
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
    const workflow = source.workflow && typeof source.workflow === 'object' ? source.workflow : {};
    const metadata = source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata) ? { ...source.metadata } : {};
    delete metadata.paidChannels;
    delete metadata.legacyPlanType;
    return {
      schemaVersion: SCHEMA_VERSION,
      id,
      identity: {
        type: 'email', email: id,
        source: normalizeText(identity.source || fallback.identity.source),
        providerId: normalizeText(identity.providerId || fallback.identity.providerId),
      },
      credentials: normalizeCredentials(source.credentials),
      lifecycle: normalizeLifecycle(source.lifecycle),
      workflow: {
        lastTaskId: normalizeText(workflow.lastTaskId),
        lastNodeId: normalizeText(workflow.lastNodeId),
        lastRunStatus: normalizeText(workflow.lastRunStatus).toLowerCase(),
      },
      metadata,
      createdAt: normalizeIsoTimestamp(source.createdAt) || fallback.createdAt,
      updatedAt: normalizeIsoTimestamp(source.updatedAt) || fallback.updatedAt,
    };
  }

  function normalizeAccountRecordsRoot(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const rawItems = source.items && typeof source.items === 'object' && !Array.isArray(source.items) ? source.items : {};
    const items = {};
    Object.entries(rawItems).forEach(([key, item]) => {
      const normalized = normalizeAccountRecord(item, { accountId: key });
      if (normalized) items[normalized.id] = normalized;
    });
    return { schemaVersion: SCHEMA_VERSION, items, updatedAt: normalizeIsoTimestamp(source.updatedAt) };
  }

  function mergeDefined(base = {}, patch = {}) {
    const next = { ...base };
    Object.entries(patch || {}).forEach(([key, value]) => { if (value !== undefined) next[key] = value; });
    return next;
  }

  function mergeAccountRecord(currentValue = {}, patchValue = {}, options = {}) {
    const id = normalizeAccountId(patchValue?.id || patchValue?.identity?.email || currentValue?.id || currentValue?.identity?.email);
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
      workflow: mergeDefined(current.workflow, patch.workflow),
      metadata: mergeDefined(current.metadata, patch.metadata),
      createdAt: current.createdAt || patch.createdAt || now,
      updatedAt: options.preserveUpdatedAt ? (normalizeIsoTimestamp(patch.updatedAt) || current.updatedAt) : now,
    }, { accountId: id, now });
  }

  return {
    ACCESS_TOKEN_STATUSES,
    ELIGIBILITY_STATUSES,
    MEMBERSHIP_STATUSES,
    SCHEMA_VERSION,
    VALIDITY_STATUSES,
    createEmptyAccountRecord,
    mergeAccountRecord,
    normalizeAccountId,
    normalizeAccountRecord,
    normalizeAccountRecordsRoot,
    normalizeIsoTimestamp,
    normalizeText,
  };
});
