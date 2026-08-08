(function attachAccountCompatibilityAdapter(root, factory) {
  const api = factory(root);
  root.MultiPageAccountCompatibilityAdapter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createAccountCompatibilityAdapterModule(root) {
  function getSchema() {
    if (root.MultiPageAccountRecordSchema) return root.MultiPageAccountRecordSchema;
    if (typeof require === 'function') return require('./account-record-schema.js');
    throw new Error('Account record schema module is not loaded.');
  }

  function getResultsApi() {
    if (root.MultiPageFreeAccountResults) return root.MultiPageFreeAccountResults;
    if (typeof require === 'function') return require('./free-account-results.js');
    return null;
  }

  function projectAccountRecordToMembershipRows(record = {}) {
    const schema = getSchema();
    const normalized = schema.normalizeAccountRecord(record);
    if (!normalized) return [];
    const lifecycle = normalized.lifecycle || {};
    if (lifecycle.membershipStatus !== 'free' && lifecycle.eligibilityStatus === 'unknown') return [];
    const credentials = normalized.credentials || {};
    return [{
      email: normalized.id,
      status: 'free',
      password: credentials.password || '',
      gptPassword: credentials.password || '',
      totpMfaSecret: credentials.totpSecret || '',
      totpSecret: credentials.totpSecret || '',
      no2faFreeRoute: credentials.no2faFreeRoute === true,
      accessToken: credentials.accessToken || '',
      session: credentials.session || null,
      accessTokenStatus: credentials.accessTokenStatus || 'missing',
      accessTokenUpdatedAt: credentials.accessTokenUpdatedAt || '',
      verificationUrl: credentials.verificationUrl || '',
      passkeyEnabled: credentials.passkeyEnabled === true,
      passkeyCredentialId: credentials.passkeyCredentialId || '',
      passkeyFactorId: credentials.passkeyFactorId || '',
      passkeyRpId: credentials.passkeyRpId || '',
      passkeyUserHandle: credentials.passkeyUserHandle || '',
      passkeyPrivateJwk: credentials.passkeyPrivateJwk || null,
      passkeyPublicKeyCose: credentials.passkeyPublicKeyCose || '',
      trialEligibilityStatus: lifecycle.eligibilityStatus || 'unknown',
      trialEligibilityReason: lifecycle.reason || '',
      trialEligibilityReasonCode: lifecycle.reasonCode || '',
      trialEligibilityCheckedAt: lifecycle.checkedAt || '',
      accountValidityStatus: lifecycle.validityStatus || 'unknown',
      enabled: !['invalid', 'deactivated'].includes(lifecycle.validityStatus),
      source: normalized.identity?.source || '',
    }];
  }

  function projectAccountRecordsToMembershipResults(accountRecordsRoot = {}, fallbackResults = {}) {
    const schema = getSchema();
    const resultsApi = getResultsApi();
    const canonical = schema.normalizeAccountRecordsRoot(accountRecordsRoot);
    const projected = Object.values(canonical.items).flatMap(projectAccountRecordToMembershipRows);
    const fallbackItems = Array.isArray(fallbackResults?.items) ? fallbackResults.items : [];
    const value = { ...fallbackResults, schemaVersion: 3, items: [...fallbackItems, ...projected] };
    return resultsApi?.normalizeResults ? resultsApi.normalizeResults(value) : value;
  }

  return {
    getLegacyRowKey: (row = {}) => getSchema().normalizeAccountId(row.email || row.accountIdentifier),
    projectAccountRecordToMembershipRows,
    projectAccountRecordsToMembershipResults,
  };
});
