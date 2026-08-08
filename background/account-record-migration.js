(function attachAccountRecordMigration(root, factory) {
  const api = factory(root);
  root.MultiPageAccountRecordMigration = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createAccountRecordMigrationModule(root) {
  function getSchema() {
    if (root.MultiPageAccountRecordSchema) return root.MultiPageAccountRecordSchema;
    if (typeof require === 'function') return require('../shared/account-record-schema.js');
    throw new Error('Account record schema module is not loaded.');
  }

  function asArray(value) { return Array.isArray(value) ? value : []; }
  function asObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  function text(value = '') { return String(value || '').trim(); }
  function readEmail(item = {}) { return text(item.email || item.accountIdentifier || item.id).toLowerCase(); }

  function normalizeEligibility(value = '') {
    const normalized = text(value).toLowerCase().replace(/[\s-]+/g, '_');
    if (['eligible', 'ineligible', 'checking', 'failed', 'unknown'].includes(normalized)) return normalized;
    if (['not_eligible', 'no_trial', 'trial_ineligible', 'rejected'].includes(normalized)) return 'ineligible';
    return 'unknown';
  }

  function inferValidityStatus(item = {}) {
    const explicit = text(item.accountValidityStatus || item.validityStatus).toLowerCase();
    if (['valid', 'invalid', 'deactivated'].includes(explicit)) return explicit;
    if (item.accountDeactivated === true || item.deactivated === true) return 'deactivated';
    return 'unknown';
  }

  function inferEligibilityStatus(item = {}) {
    return normalizeEligibility(item.trialEligibilityStatus || item.eligibilityStatus || item.upiTrialEligibilityStatus);
  }

  function inferMembershipStatus(item = {}) {
    const status = text(item.status || item.membershipStatus).toLowerCase();
    if (status === 'paid' || status === 'plus' || status === 'pro' || status === 'team') return 'unknown';
    return status === 'free' || status === 'failed' || inferEligibilityStatus(item) !== 'unknown' ? 'free' : 'unknown';
  }

  function inferAccessTokenStatus(item = {}) {
    const explicit = text(item.accessTokenStatus).toLowerCase();
    if (['missing', 'validating', 'valid', 'invalid', 'refreshing'].includes(explicit)) return explicit;
    return text(item.accessToken || item.token || item.access_token) ? 'valid' : 'missing';
  }

  function buildCredentialPatch(item = {}) {
    const accessToken = text(item.accessToken || item.token || item.access_token);
    const totpSecret = text(item.totpMfaSecret || item.totpSecret).replace(/\s+/g, '').toUpperCase();
    const password = text(item.gptPassword || item.password);
    return {
      ...(password ? { password } : {}),
      ...(totpSecret ? { totpSecret } : {}),
      ...(item.no2faFreeRoute === true ? { no2faFreeRoute: true } : {}),
      ...(accessToken ? { accessToken, accessTokenStatus: inferAccessTokenStatus(item) } : {}),
      ...(text(item.accessTokenUpdatedAt || item.checkedAt) ? { accessTokenUpdatedAt: text(item.accessTokenUpdatedAt || item.checkedAt) } : {}),
      ...(text(item.verificationUrl) ? { verificationUrl: text(item.verificationUrl) } : {}),
      ...(item.passkeyEnabled === true ? { passkeyEnabled: true } : {}),
      ...(text(item.passkeyCredentialId) ? { passkeyCredentialId: text(item.passkeyCredentialId) } : {}),
      ...(text(item.passkeyFactorId) ? { passkeyFactorId: text(item.passkeyFactorId) } : {}),
      ...(text(item.passkeyRpId) ? { passkeyRpId: text(item.passkeyRpId) } : {}),
      ...(text(item.passkeyUserHandle) ? { passkeyUserHandle: text(item.passkeyUserHandle) } : {}),
      ...(item.passkeyPrivateJwk ? { passkeyPrivateJwk: item.passkeyPrivateJwk } : {}),
      ...(item.passkeyPublicKeyCose ? { passkeyPublicKeyCose: item.passkeyPublicKeyCose } : {}),
      ...(item.passkeySignCount !== undefined ? { passkeySignCount: item.passkeySignCount } : {}),
      ...(item.passkeyAlg !== undefined ? { passkeyAlg: item.passkeyAlg } : {}),
    };
  }

  function collectLegacyRows(sources = {}) {
    return [
      ...asArray(sources.freeAccountResults?.items),
      ...asArray(sources.upiCredentialMembershipCheckResults?.items),
      ...asArray(sources.upiAccountCredentialBackups),
      ...asArray(sources.accountRunHistory),
      ...asArray(sources.customEmailPoolEntries),
    ];
  }

  function buildAccountRecordsV2FromLegacy(sources = {}, options = {}) {
    const schema = getSchema();
    const now = schema.normalizeIsoTimestamp(options.now) || new Date().toISOString();
    const existing = schema.normalizeAccountRecordsRoot(sources.accountRecordsV2);
    const items = { ...existing.items };
    for (const rawItem of collectLegacyRows(sources)) {
      const item = asObject(rawItem);
      const id = schema.normalizeAccountId(readEmail(item));
      if (!id) continue;
      const current = items[id] || schema.createEmptyAccountRecord(id, { now, source: text(item.source) });
      const inferredValidity = inferValidityStatus(item);
      const eligibilityStatus = inferEligibilityStatus(item);
      const membershipStatus = inferMembershipStatus(item);
      items[id] = schema.mergeAccountRecord(current, {
        identity: { source: text(item.source || current.identity?.source) },
        credentials: buildCredentialPatch(item),
        lifecycle: {
          validityStatus: ['invalid', 'deactivated'].includes(current.lifecycle?.validityStatus)
            ? current.lifecycle.validityStatus
            : (inferredValidity === 'unknown' ? current.lifecycle?.validityStatus : inferredValidity),
          eligibilityStatus: eligibilityStatus === 'unknown' ? current.lifecycle?.eligibilityStatus : eligibilityStatus,
          membershipStatus: membershipStatus === 'free' ? 'free' : current.lifecycle?.membershipStatus,
          reasonCode: text(item.trialEligibilityReasonCode || item.reasonCode || current.lifecycle?.reasonCode),
          reason: text(item.trialEligibilityReason || item.reason || current.lifecycle?.reason),
          checkedAt: text(item.trialEligibilityCheckedAt || item.checkedAt || current.lifecycle?.checkedAt),
        },
        workflow: {
          lastTaskId: text(item.taskId || current.workflow?.lastTaskId),
          lastNodeId: text(item.nodeId || current.workflow?.lastNodeId),
          lastRunStatus: text(item.finalStatus || item.displayStatus || current.workflow?.lastRunStatus).toLowerCase(),
        },
      }, { now: text(item.updatedAt || item.checkedAt) || now, preserveUpdatedAt: true });
    }
    const normalized = schema.normalizeAccountRecordsRoot({ items });
    const unchanged = JSON.stringify(normalized.items) === JSON.stringify(existing.items);
    return { ...normalized, updatedAt: unchanged && existing.updatedAt ? existing.updatedAt : now };
  }

  return {
    buildAccountRecordsV2FromLegacy,
    buildCredentialPatch,
    inferAccessTokenStatus,
    inferEligibilityStatus,
    inferMembershipStatus,
    inferValidityStatus,
  };
});
