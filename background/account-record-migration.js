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

  function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function firstText(...values) {
    const { normalizeText } = getSchema();
    for (const value of values) {
      const text = normalizeText(value);
      if (text) return text;
    }
    return '';
  }

  function readEmail(value = {}) {
    const source = asObject(value);
    const raw = firstText(source.email, source.accountIdentifier, source.id, source.identity?.email);
    return raw.split('----')[0];
  }

  function readTimestamp(value = {}) {
    const source = asObject(value);
    return firstText(
      source.updatedAt,
      source.checkedAt,
      source.finishedAt,
      source.recordedAt,
      source.createdAt,
      source.accessTokenUpdatedAt
    );
  }

  function normalizePlanType(value = '') {
    const { normalizeText } = getSchema();
    const normalized = normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_');
    if (normalized.includes('free')) return 'free';
    if (normalized.includes('plus') || normalized.includes('pro') || normalized.includes('team')) return 'plus';
    return '';
  }

  function inferMembershipStatus(item = {}) {
    const { normalizeText } = getSchema();
    const status = normalizeText(item.status || item.membershipStatus).toLowerCase();
    const plan = normalizePlanType(item.planType || item.subscriptionPlanType || item.upiRedeemSubscriptionPlanType);
    if (status === 'paid' || status === 'plus' || plan === 'plus') return 'plus';
    if (status === 'free' || plan === 'free') return 'free';
    if (status === 'expired') return 'expired';
    return 'unknown';
  }

  function inferValidityStatus(item = {}) {
    const { normalizeText } = getSchema();
    const haystack = [item.reasonCode, item.errorCode, item.reason, item.error, item.status]
      .map((value) => normalizeText(value).toLowerCase())
      .join(' ');
    if (/account[_ -]?deactivated|deactivat|account[_ -]?deleted|账号.*(?:注销|停用)/i.test(haystack)) {
      return 'deactivated';
    }
    if (/account[_ -]?invalid|invalid[_ -]?account/i.test(haystack)) return 'invalid';
    if (item.valid === true || item.active === true || ['free', 'paid', 'success'].includes(normalizeText(item.status).toLowerCase())) {
      return 'valid';
    }
    return 'unknown';
  }

  function inferEligibilityStatus(item = {}) {
    const { normalizeText } = getSchema();
    const raw = normalizeText(
      item.eligibilityStatus || item.trialEligibilityStatus || item.upiTrialEligibilityStatus
    ).toLowerCase();
    if (['eligible', 'ineligible', 'checking', 'failed'].includes(raw)) return raw;
    if (item.trialEligible === true || item.eligible === true) return 'eligible';
    if (item.trialEligible === false || item.eligible === false) return 'ineligible';
    return 'unknown';
  }

  function inferAccessTokenStatus(item = {}, accessToken = '') {
    const { normalizeText } = getSchema();
    const explicit = normalizeText(item.accessTokenStatus).toLowerCase();
    if (['missing', 'validating', 'valid', 'invalid', 'refreshing'].includes(explicit)) return explicit;
    const haystack = [item.reasonCode, item.errorCode, item.reason, item.error]
      .map((value) => normalizeText(value).toLowerCase())
      .join(' ');
    if (/token[_ -]?401|invalid[_ -]?(?:access[_ -]?)?token|token[_ -]?invalid/i.test(haystack)) return 'invalid';
    return accessToken ? 'valid' : 'missing';
  }

  function inferRedemptionStatus(item = {}) {
    const { normalizeText } = getSchema();
    const raw = normalizeText(
      item.redeemStatus || item.remoteStatus || item.status
    ).toLowerCase().replace(/[\s-]+/g, '_');
    if (['success', 'succeeded', 'paid', 'completed', 'active'].includes(raw)) return 'succeeded';
    if (['pending', 'processing', 'submitted', 'waiting_remote'].includes(raw)) return 'pending';
    if (['submitting'].includes(raw)) return 'submitting';
    if (['queued', 'queue'].includes(raw)) return 'queued';
    if (['blocked', 'limit'].includes(raw)) return 'blocked';
    if (['failed', 'error', 'rejected'].includes(raw)) return 'failed';
    if (['canceled', 'cancelled', 'stopped'].includes(raw)) return 'canceled';
    return 'idle';
  }

  function buildCredentialPatch(item = {}) {
    const source = asObject(item);
    const accessToken = firstText(
      source.accessToken,
      source.access_token,
      source.token,
      source.upiRedeemAccessToken
    );
    const patch = {
      password: firstText(source.password, source.gptPassword),
      totpSecret: firstText(source.totpSecret, source.totpMfaSecret).replace(/\s+/g, '').toUpperCase(),
      accessToken,
      accessTokenStatus: inferAccessTokenStatus(source, accessToken),
      accessTokenUpdatedAt: firstText(source.accessTokenUpdatedAt, source.checkedAt, source.updatedAt),
    };
    const optionalFields = [
      'verificationUrl', 'passkeyEnabled', 'passkeyEnabledAt', 'passkeyCredentialId',
      'passkeyFactorId', 'passkeyRpId', 'passkeyUserHandle', 'passkeyPrivateJwk',
      'passkeyPublicKeyCose', 'passkeySignCount', 'passkeyAlg', 'passkeyApiPersisted',
      'twoFactorEnabled', 'gptPasswordSet', 'totpMfaEnabled',
    ];
    optionalFields.forEach((key) => {
      if (source[key] !== undefined) patch[key] = source[key];
    });
    return patch;
  }

  function mergeNonEmpty(current = {}, patch = {}) {
    const next = { ...current };
    Object.entries(patch).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      if (value === false && current[key] === true) return;
      next[key] = value;
    });
    return next;
  }

  function buildAccountRecordsV2FromLegacy(sources = {}, options = {}) {
    const schema = getSchema();
    const now = schema.normalizeIsoTimestamp(options.now) || new Date().toISOString();
    const existing = schema.normalizeAccountRecordsRoot(sources.accountRecordsV2);
    const items = {};

    function getFallbackTimestamp(id) {
      return existing.items[id]?.updatedAt || existing.items[id]?.createdAt || existing.updatedAt || now;
    }

    function ensureAccount(rawEmail, metadata = {}) {
      const id = schema.normalizeAccountId(rawEmail);
      if (!id) return null;
      if (!items[id]) {
        items[id] = schema.createEmptyAccountRecord(id, {
          now: getFallbackTimestamp(id),
          source: metadata.source,
          providerId: metadata.providerId,
        });
      }
      return items[id];
    }

    function patchAccount(rawEmail, patch = {}, sourceTimestamp = '') {
      const id = schema.normalizeAccountId(rawEmail);
      const current = ensureAccount(id, patch.identity);
      if (!current) return;
      items[id] = schema.mergeAccountRecord(current, patch, {
        now: schema.normalizeIsoTimestamp(sourceTimestamp) || current.updatedAt || getFallbackTimestamp(id),
        preserveUpdatedAt: true,
      });
    }

    function patchMetadata(rawEmail, patch = {}) {
      const id = schema.normalizeAccountId(rawEmail);
      const current = ensureAccount(id);
      if (!current) return;
      patchAccount(id, { metadata: mergeNonEmpty(current.metadata, patch) }, current.updatedAt);
    }

    asArray(sources.customEmailPoolEntries).forEach((entry) => {
      const source = typeof entry === 'string' ? { email: entry } : asObject(entry);
      const email = readEmail(source) || String(entry || '').split('----')[0];
      patchAccount(email, {
        identity: {
          source: firstText(source.source, 'custom-pool'),
          providerId: firstText(source.providerId, source.mailProvider),
        },
        credentials: buildCredentialPatch(source),
        metadata: {
          customPoolUsed: source.used === true,
          customPoolDisabled: source.disabled === true,
        },
      }, readTimestamp(source));
    });

    asArray(sources.accountRunHistory).forEach((record) => {
      const email = readEmail(record);
      const finalStatus = firstText(record.displayStatus, record.finalStatus, record.status).toLowerCase();
      patchAccount(email, {
        identity: { source: firstText(record.source, 'account-run-history') },
        credentials: buildCredentialPatch(record),
        lifecycle: {
          validityStatus: inferValidityStatus(record),
          reasonCode: firstText(record.reasonCode, record.errorCode),
          reason: firstText(record.reason, record.error),
          checkedAt: readTimestamp(record),
        },
        workflow: {
          lastTaskId: firstText(record.taskId, record.runId),
          lastNodeId: firstText(record.nodeId, record.currentNodeId),
          lastRunStatus: finalStatus,
        },
        metadata: {
          lastRunRecordId: firstText(record.recordId, record.id),
        },
      }, readTimestamp(record));
    });

    const results = asObject(sources.upiCredentialMembershipCheckResults);
    asArray(results.items).forEach((item) => {
      const email = readEmail(item);
      const channel = schema.normalizeRedeemChannel(
        item.redeemChannel || item.channel || item.paymentChannel
      );
      const membershipStatus = inferMembershipStatus(item);
      const redemptionPatch = channel ? {
        [channel]: {
          status: inferRedemptionStatus(item),
          eligibilityStatus: inferEligibilityStatus(item),
          eligibilityReason: firstText(item.eligibilityReason, item.trialEligibilityReason),
          cdkey: firstText(item.cdkey, item.upiRedeemCdkey),
          remoteJobId: firstText(item.remoteJobId, item.jobId),
          remoteStatus: firstText(item.remoteStatus, item.redeemRemoteStatus),
          failureCount: Math.max(0, Math.floor(Number(item.failureCount || item.redeemFailureCount) || 0)),
          dailyLimitBlockedAt: item.dailyLimitBlockedAt,
          dailyLimitBlockedUntil: item.dailyLimitBlockedUntil,
          lastAttemptAt: firstText(item.lastAttemptAt, item.redeemStartedAt, item.checkedAt),
          lastErrorCode: firstText(item.lastErrorCode, item.errorCode),
          lastError: firstText(item.lastError, item.redeemReason, item.reason),
        },
      } : {};
      const current = ensureAccount(email);
      const paidChannels = new Set(asArray(current?.metadata?.paidChannels));
      if (membershipStatus === 'plus' && channel) paidChannels.add(channel);
      patchAccount(email, {
        identity: { source: firstText(item.source, results.source, 'membership-results') },
        credentials: mergeNonEmpty(current?.credentials, buildCredentialPatch(item)),
        lifecycle: {
          validityStatus: inferValidityStatus(item),
          eligibilityStatus: inferEligibilityStatus(item),
          membershipStatus,
          membershipChannel: membershipStatus === 'plus' ? (channel || current?.lifecycle?.membershipChannel) : '',
          reasonCode: firstText(item.reasonCode, item.errorCode),
          reason: firstText(item.reason, item.error, item.redeemReason),
          checkedAt: readTimestamp(item),
        },
        redemption: redemptionPatch,
        metadata: {
          ...current?.metadata,
          paidChannels: Array.from(paidChannels),
          legacyStatus: firstText(item.status),
          legacyPlanType: firstText(item.planType),
        },
      }, readTimestamp(item) || results.updatedAt);
    });

    const backups = asObject(sources.upiAccountCredentialBackups || sources.credentialBackups);
    Object.entries(backups).forEach(([key, backup]) => {
      const record = asObject(backup);
      const email = readEmail(record) || key;
      const current = ensureAccount(email);
      patchAccount(email, {
        identity: { source: firstText(record.source, current?.identity?.source, 'credential-backup') },
        credentials: mergeNonEmpty(current?.credentials, buildCredentialPatch(record)),
      }, readTimestamp(record));
    });

    const deletion = {
      free: asArray(results.redeemAutoDeletedEmails),
      channels: asObject(results.redeemPlusDeletedEmailsByChannel),
    };
    deletion.free.forEach((email) => {
      const current = ensureAccount(email);
      if (!current) return;
      patchMetadata(email, {
        deleted: {
          ...(asObject(current.metadata.deleted)),
          free: true,
        },
      });
    });
    schema.REDEEM_CHANNELS.forEach((channel) => {
      asArray(deletion.channels[channel]).forEach((email) => {
        const current = ensureAccount(email);
        if (!current) return;
        const deleted = asObject(current.metadata.deleted);
        patchMetadata(email, {
          deleted: {
            ...deleted,
            channels: Array.from(new Set([...asArray(deleted.channels), channel])),
          },
        });
      });
    });

    function applyUsage(channel, usageValue = {}) {
      const usage = asObject(usageValue);
      Object.entries(usage).forEach(([cdkey, rawEntry]) => {
        const entry = asObject(rawEntry);
        const email = readEmail(entry);
        if (!email) return;
        const current = ensureAccount(email);
        patchAccount(email, {
          redemption: {
            [channel]: {
              ...current.redemption[channel],
              status: inferRedemptionStatus(entry),
              cdkey: firstText(entry.cdkey, cdkey),
              remoteJobId: firstText(entry.remoteJobId, entry.jobId),
              remoteStatus: firstText(entry.remoteStatus, entry.status),
              failureCount: Math.max(0, Math.floor(Number(entry.failureCount || entry.retryCount) || 0)),
              lastAttemptAt: firstText(entry.lastAttemptAt, entry.updatedAt, entry.submittedAt),
              lastErrorCode: firstText(entry.lastErrorCode, entry.errorCode),
              lastError: firstText(entry.lastError, entry.error, entry.reason),
            },
          },
        }, readTimestamp(entry));
      });
    }

    applyUsage('upi',
      sources.upiRedeemCdkeyUsage
      || sources.cdkUsage
      || sources.upiRedeemCdkUsage
      || sources.pixRedeemCdkeyUsage
    );
    applyUsage('ideal', sources.idealRedeemCdkeyUsage);
    applyUsage('pix', sources.pixChannelRedeemCdkeyUsage);

    // Canonical records always win over reconstructed legacy fields.
    Object.entries(existing.items).forEach(([id, record]) => {
      const current = items[id] || schema.createEmptyAccountRecord(id, { now: record.createdAt || now });
      items[id] = schema.mergeAccountRecord(current, record, {
        now: record.updatedAt || current.updatedAt,
        preserveUpdatedAt: true,
      });
    });

    const normalizedItems = schema.normalizeAccountRecordsRoot({ items }).items;
    const unchanged = JSON.stringify(normalizedItems) === JSON.stringify(existing.items);
    return {
      schemaVersion: schema.SCHEMA_VERSION,
      items: normalizedItems,
      updatedAt: unchanged && existing.updatedAt ? existing.updatedAt : now,
    };
  }

  return {
    buildAccountRecordsV2FromLegacy,
    buildCredentialPatch,
    inferAccessTokenStatus,
    inferEligibilityStatus,
    inferMembershipStatus,
    inferRedemptionStatus,
    inferValidityStatus,
  };
});
