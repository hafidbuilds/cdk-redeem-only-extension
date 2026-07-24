(function attachMultiPageUpiRedeemEffectGuard(root, factory) {
  const api = factory(root);
  root.MultiPageUpiRedeemEffectGuard = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createUpiRedeemEffectGuardModule(root) {
  function createUpiRedeemEffectGuard({ ledger, taskRuntime } = {}) {
    function text(value = '') {
      return String(value ?? '').trim();
    }

    function describeCdkey(cdkey = '', channel = 'upi') {
      const fingerprint = ledger?.fingerprintCdkey?.(cdkey)
        || root.MultiPageTaskSchema?.stableHash?.(text(cdkey).toLowerCase().replace(/[\s-]+/g, ''))
        || 'unavailable';
      return `cdkey:${text(channel).toLowerCase() || 'upi'}:${fingerprint}`;
    }

    function getContext(taskId) {
      const normalizedTaskId = text(taskId);
      return normalizedTaskId && taskRuntime?.createContext
        ? taskRuntime.createContext(normalizedTaskId)
        : null;
    }

    async function prepare(input = {}) {
      const taskId = text(input.taskId);
      const descriptor = describeCdkey(input.cdkey, input.channel);
      if (!taskId || !ledger?.prepareRedeem) {
        return { tracked: false, descriptor, effect: null, taskContext: null };
      }
      const taskContext = getContext(taskId);
      const prepared = await ledger.prepareRedeem(input);
      await taskContext?.checkpoint?.({
        nodeId: text(input.nodeId) || 'cdk-redeem-submit',
        channel: text(input.channel).toLowerCase(),
        cdkFingerprint: prepared.effect.resourceFingerprint,
        externalEffectId: prepared.effect.effectId,
        externalSideEffectStatus: prepared.effect.status,
        cdkSubmitted: false,
        remoteRequestSent: false,
      });
      if (!prepared.canDispatch) {
        if (prepared.effect.taskId === taskId) {
          await taskContext?.setStatus?.('waiting_remote', {
            checkpoint: { locksReleased: false, externalSideEffectStatus: prepared.effect.status },
          });
        }
        const error = new Error('A persisted redeem effect already exists; query its remote status instead of resubmitting.');
        error.code = 'REDEEM_DUPLICATE_DISPATCH_BLOCKED';
        error.detail = {
          effectId: prepared.effect.effectId,
          effectTaskId: prepared.effect.taskId,
          status: prepared.effect.status,
          resourceFingerprint: prepared.effect.resourceFingerprint,
        };
        throw error;
      }
      await taskContext?.acquireResources?.([
        `cdkey:${text(input.channel).toLowerCase()}:${prepared.effect.resourceFingerprint}`,
      ]);
      await taskContext?.event?.({
        type: 'checkpoint',
        code: 'REDEEM_EFFECT_PREPARED',
        nodeId: text(input.nodeId) || 'cdk-redeem-submit',
        message: 'Redeem side effect prepared before dispatch',
        detail: { channel: text(input.channel).toLowerCase(), resourceFingerprint: prepared.effect.resourceFingerprint },
      });
      return { ...prepared, tracked: true, descriptor, taskContext };
    }

    async function dispatched(handle) {
      if (!handle?.tracked) return handle;
      const updated = await ledger.markDispatched(handle.effect.effectId);
      await handle.taskContext?.checkpoint?.({
        externalSideEffectStarted: true,
        externalSideEffectStatus: 'dispatched',
        remoteRequestSent: true,
      });
      await handle.taskContext?.event?.({
        type: 'checkpoint',
        code: 'REDEEM_EFFECT_DISPATCHED',
        message: 'Redeem request dispatch started',
        detail: { resourceFingerprint: handle.effect.resourceFingerprint },
      });
      return { ...handle, ...updated };
    }

    async function acknowledged(handle, payload = {}) {
      if (!handle?.tracked) return handle;
      const remoteJobId = ledger.extractRemoteJobId(payload);
      const updated = await ledger.acknowledge(handle.effect.effectId, { remoteJobId });
      await handle.taskContext?.checkpoint?.({
        cdkSubmitted: true,
        externalSideEffectStatus: 'acknowledged',
        remoteJobId,
        remoteRequestSent: true,
      });
      await handle.taskContext?.event?.({
        type: 'checkpoint',
        code: 'REDEEM_EFFECT_ACKNOWLEDGED',
        message: 'Remote redeem request acknowledged',
        detail: { remoteJobId, resourceFingerprint: handle.effect.resourceFingerprint },
      });
      return { ...handle, ...updated };
    }

    async function unknown(handle, error) {
      if (!handle?.tracked) return handle;
      const updated = await ledger.markUnknown(handle.effect.effectId, {
        errorCode: text(error?.code) || 'REDEEM_REMOTE_STATUS_UNKNOWN',
      });
      await handle.taskContext?.setStatus?.('waiting_remote', {
        errorCode: 'REDEEM_REMOTE_STATUS_UNKNOWN',
        checkpoint: {
          cdkSubmitted: true,
          externalSideEffectStatus: 'unknown',
          locksReleased: false,
          remoteRequestSent: true,
        },
      });
      await handle.taskContext?.event?.({
        type: 'error',
        level: 'error',
        code: 'REDEEM_REMOTE_STATUS_UNKNOWN',
        message: 'Redeem dispatch outcome is unknown; remote query is required',
        detail: { resourceFingerprint: handle.effect.resourceFingerprint },
      });
      return { ...handle, ...updated };
    }

    async function failed(handle, errorCode = 'REDEEM_REMOTE_REJECTED') {
      if (!handle?.tracked) return handle;
      const updated = await ledger.fail(handle.effect.effectId, { errorCode });
      await handle.taskContext?.checkpoint?.({
        cdkSubmitted: false,
        externalSideEffectStatus: 'failed',
        remoteRequestSent: false,
      });
      return { ...handle, ...updated };
    }

    async function confirmed(handle, input = {}) {
      if (!handle?.tracked) return handle;
      const updated = await ledger.confirm(handle.effect.effectId, input);
      await handle.taskContext?.setStatus?.('running', {
        checkpoint: {
          cdkSubmitted: true,
          externalSideEffectStatus: 'confirmed',
          remoteRequestSent: false,
        },
      });
      return { ...handle, ...updated };
    }

    async function waitingRemote(handle) {
      if (!handle?.tracked) return handle;
      await handle.taskContext?.setStatus?.('waiting_remote', {
        checkpoint: {
          cdkSubmitted: true,
          externalSideEffectStatus: 'acknowledged',
          locksReleased: false,
          remoteRequestSent: true,
        },
      });
      return handle;
    }

    function getChannelUsage(state = {}, channel = 'upi') {
      const normalizedChannel = text(channel).toLowerCase() || 'upi';
      const helper = root.MultiPageRedeemCdkeyUsage?.getRedeemChannelUsage;
      if (typeof helper === 'function') return helper(state, normalizedChannel) || {};
      if (normalizedChannel === 'ideal') return state?.idealRedeemCdkeyUsage || {};
      if (normalizedChannel === 'pix') return state?.pixChannelRedeemCdkeyUsage || {};
      return state?.upiRedeemCdkeyUsage || state?.upiRedeemCdkUsage || state?.cdkUsage || {};
    }

    function findCdkeyByFingerprint(state = {}, channel = 'upi', fingerprint = '') {
      return Object.keys(getChannelUsage(state, channel)).find((cdkey) => (
        ledger?.fingerprintCdkey?.(cdkey) === text(fingerprint)
      )) || '';
    }

    function classifyRemoteUsage(entry = {}) {
      const status = text(entry.remoteStatus || entry.status || entry.state || entry.remoteMessage)
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
      if (entry.subscriptionActive === true || ['success', 'succeeded', 'redeemed', 'used', 'completed', 'complete'].includes(status)) {
        return 'confirmed';
      }
      if (['failed', 'rejected', 'invalid', 'error', 'canceled', 'cancelled', 'not_found', 'unused', 'available', 'new', 'ready'].includes(status)) {
        return 'failed';
      }
      return 'manual_review';
    }

    async function recoverTask(task = {}, input = {}) {
      const taskId = text(task.taskId);
      const getState = input.getState;
      const refreshRemoteStatuses = input.refreshRemoteStatuses;
      const records = typeof ledger?.listRecordsByTask === 'function'
        ? await ledger.listRecordsByTask(taskId)
        : [];
      const activeRecords = records.filter(({ effect }) => ['dispatched', 'acknowledged', 'unknown'].includes(text(effect?.status).toLowerCase()));
      if (!taskId || !activeRecords.length || typeof getState !== 'function' || typeof refreshRemoteStatuses !== 'function') {
        const resolvedTask = await taskRuntime?.resolveRemoteTask?.(taskId, {
          outcome: 'manual_review',
          errorCode: 'REDEEM_EFFECT_RECOVERY_CONTEXT_MISSING',
          message: 'Persisted redeem recovery context is incomplete.',
        });
        return { outcome: 'manual_review', task: resolvedTask || task, records: [] };
      }

      const results = [];
      for (const record of activeRecords) {
        const channel = text(record.attempt?.channel || record.effect?.channel || task.channel).toLowerCase() || 'upi';
        let state = await getState();
        const cdkey = findCdkeyByFingerprint(state, channel, record.effect.resourceFingerprint);
        if (!cdkey) {
          await ledger.markUnknown(record.effect.effectId, { errorCode: 'REDEEM_CDK_RECOVERY_REFERENCE_MISSING' });
          results.push({ effectId: record.effect.effectId, channel, outcome: 'manual_review' });
          continue;
        }
        let outcome = classifyRemoteUsage(getChannelUsage(state, channel)[cdkey] || {});
        if (outcome === 'manual_review') {
          const refresh = await refreshRemoteStatuses({
            taskId,
            accountEmail: task.accountId,
            channel,
            cdkeys: [cdkey],
            skipAutoRetry: true,
          }).catch(() => ({ ok: false }));
          state = await getState();
          outcome = refresh?.ok === true
            ? classifyRemoteUsage(getChannelUsage(state, channel)[cdkey] || {})
            : 'manual_review';
        }
        const usageEntry = getChannelUsage(state, channel)[cdkey] || {};
        const remoteJobId = text(usageEntry.remoteJobId || usageEntry.jobId);
        if (outcome === 'confirmed') {
          await ledger.confirm(record.effect.effectId, { remoteJobId });
        } else if (outcome === 'failed') {
          await ledger.fail(record.effect.effectId, { remoteJobId, errorCode: 'REDEEM_REMOTE_EXPLICIT_FAILURE' });
        } else {
          await ledger.markUnknown(record.effect.effectId, { remoteJobId, errorCode: 'REDEEM_REMOTE_STATUS_UNRESOLVED' });
        }
        results.push({ effectId: record.effect.effectId, channel, outcome });
      }

      const outcome = results.every((result) => result.outcome === 'confirmed')
        ? 'confirmed'
        : (results.some((result) => result.outcome === 'manual_review') ? 'manual_review' : 'failed');
      const resolvedTask = await taskRuntime.resolveRemoteTask(taskId, {
        outcome,
        errorCode: outcome === 'failed' ? 'REDEEM_REMOTE_EXPLICIT_FAILURE' : 'REDEEM_REMOTE_STATUS_UNRESOLVED',
        message: outcome === 'manual_review' ? 'Remote redeem result remains unresolved after a query-only recovery.' : '',
        result: { externalEffectIds: results.map((result) => result.effectId) },
      });
      return { outcome, task: resolvedTask, records: results };
    }

    return { acknowledged, classifyRemoteUsage, confirmed, describeCdkey, dispatched, failed, findCdkeyByFingerprint, prepare, recoverTask, unknown, waitingRemote };
  }

  return { createUpiRedeemEffectGuard };
});
