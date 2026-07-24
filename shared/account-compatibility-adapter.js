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

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function getLegacyRowKey(row = {}) {
    const schema = getSchema();
    const email = schema.normalizeAccountId(row.email || row.accountIdentifier);
    if (!email) return '';
    const status = schema.normalizeText(row.status).toLowerCase();
    const channel = schema.normalizeRedeemChannel(row.redeemChannel || row.channel || row.paymentChannel) || 'upi';
    return status === 'paid' ? `paid:${channel}:${email}` : email;
  }

  function buildCredentialProjection(record = {}) {
    const credentials = asObject(record.credentials);
    return {
      password: credentials.password || '',
      gptPassword: credentials.password || '',
      totpMfaSecret: credentials.totpSecret || '',
      totpSecret: credentials.totpSecret || '',
      accessToken: credentials.accessToken || '',
      accessTokenStatus: credentials.accessTokenStatus || 'missing',
      accessTokenUpdatedAt: credentials.accessTokenUpdatedAt || '',
      verificationUrl: credentials.verificationUrl || '',
      passkeyEnabled: credentials.passkeyEnabled === true,
      passkeyEnabledAt: credentials.passkeyEnabledAt || '',
      passkeyCredentialId: credentials.passkeyCredentialId || '',
      passkeyFactorId: credentials.passkeyFactorId || '',
      passkeyRpId: credentials.passkeyRpId || '',
      passkeyUserHandle: credentials.passkeyUserHandle || '',
      passkeyPrivateJwk: credentials.passkeyPrivateJwk || null,
      passkeyPublicKeyCose: credentials.passkeyPublicKeyCose || '',
      ...(credentials.passkeySignCount !== undefined ? { passkeySignCount: credentials.passkeySignCount } : {}),
      ...(credentials.passkeyAlg !== undefined ? { passkeyAlg: credentials.passkeyAlg } : {}),
      passkeyApiPersisted: credentials.passkeyApiPersisted === true,
      twoFactorEnabled: credentials.twoFactorEnabled === true || Boolean(credentials.totpSecret),
    };
  }

  function projectAccountRecordToMembershipRows(record = {}) {
    const schema = getSchema();
    const normalized = schema.normalizeAccountRecord(record);
    if (!normalized) return [];
    const lifecycle = normalized.lifecycle;
    const base = {
      email: normalized.id,
      ...buildCredentialProjection(normalized),
      reasonCode: lifecycle.reasonCode,
      reason: lifecycle.reason,
      checkedAt: lifecycle.checkedAt,
      trialEligibilityStatus: lifecycle.eligibilityStatus,
      source: normalized.identity.source,
      accountValidityStatus: lifecycle.validityStatus,
    };
    if (lifecycle.validityStatus === 'deactivated' || lifecycle.validityStatus === 'invalid') {
      return [{ ...base, status: 'failed', planType: '', accountDeactivated: lifecycle.validityStatus === 'deactivated' }];
    }
    if (lifecycle.membershipStatus === 'free' || normalized.metadata?.legacyStatus === 'failed') {
      return [{
        ...base,
        status: normalized.metadata?.legacyStatus === 'failed' ? 'failed' : 'free',
        planType: lifecycle.membershipStatus === 'free' ? 'free' : '',
      }];
    }
    if (lifecycle.membershipStatus !== 'plus') return [];
    const channels = Array.from(new Set([
      ...asArray(normalized.metadata?.paidChannels),
      lifecycle.membershipChannel,
    ].map(schema.normalizeRedeemChannel).filter(Boolean)));
    if (!channels.length) channels.push('upi');
    return channels.map((channel) => ({
      ...base,
      status: 'paid',
      planType: normalized.metadata?.legacyPlanType || 'plus',
      redeemChannel: channel,
      channel,
      redeemStatus: normalized.redemption[channel].status === 'succeeded' ? 'success' : normalized.redemption[channel].status,
      redeemReason: normalized.redemption[channel].lastError || '',
      remoteStatus: normalized.redemption[channel].remoteStatus || '',
      remoteJobId: normalized.redemption[channel].remoteJobId || '',
      cdkey: normalized.redemption[channel].cdkey || '',
    }));
  }

  function projectAccountRecordsToMembershipResults(accountRecordsRoot = {}, fallbackResults = {}) {
    const schema = getSchema();
    const canonical = schema.normalizeAccountRecordsRoot(accountRecordsRoot);
    const fallback = asObject(fallbackResults);
    const rowMap = new Map();
    Object.values(canonical.items).forEach((record) => {
      projectAccountRecordToMembershipRows(record).forEach((row) => {
        const key = getLegacyRowKey(row);
        if (key) rowMap.set(key, row);
      });
    });
    // Runtime legacy results may be newer than the latest persisted read-model migration.
    asArray(fallback.items).forEach((row) => {
      const key = getLegacyRowKey(row);
      if (!key) return;
      rowMap.set(key, { ...(rowMap.get(key) || {}), ...row });
    });

    const deletedFree = new Set(asArray(fallback.redeemAutoDeletedEmails).map(schema.normalizeAccountId).filter(Boolean));
    const deletedByChannel = {
      upi: new Set(asArray(fallback.redeemPlusDeletedEmailsByChannel?.upi).map(schema.normalizeAccountId).filter(Boolean)),
      ideal: new Set(asArray(fallback.redeemPlusDeletedEmailsByChannel?.ideal).map(schema.normalizeAccountId).filter(Boolean)),
      pix: new Set(asArray(fallback.redeemPlusDeletedEmailsByChannel?.pix).map(schema.normalizeAccountId).filter(Boolean)),
    };
    Object.values(canonical.items).forEach((record) => {
      const deleted = asObject(record.metadata?.deleted);
      if (deleted.free === true) deletedFree.add(record.id);
      asArray(deleted.channels).forEach((channel) => {
        const normalizedChannel = schema.normalizeRedeemChannel(channel);
        if (normalizedChannel) deletedByChannel[normalizedChannel].add(record.id);
      });
    });

    const items = Array.from(rowMap.values());
    return {
      ...fallback,
      items,
      total: Math.max(Number(fallback.total) || 0, items.length),
      completed: Math.max(Number(fallback.completed) || 0, items.length),
      paidCount: items.filter((item) => item.status === 'paid').length,
      freeCount: items.filter((item) => item.status === 'free').length,
      failedCount: items.filter((item) => item.status === 'failed').length,
      redeemAutoDeletedEmails: Array.from(deletedFree),
      redeemAutoDeletedCount: deletedFree.size,
      redeemPlusDeletedEmailsByChannel: {
        upi: Array.from(deletedByChannel.upi),
        ideal: Array.from(deletedByChannel.ideal),
        pix: Array.from(deletedByChannel.pix),
      },
      redeemPlusDeletedCountByChannel: {
        upi: deletedByChannel.upi.size,
        ideal: deletedByChannel.ideal.size,
        pix: deletedByChannel.pix.size,
      },
      accountReadModelSchemaVersion: canonical.schemaVersion,
    };
  }

  return {
    getLegacyRowKey,
    projectAccountRecordToMembershipRows,
    projectAccountRecordsToMembershipResults,
  };
});
