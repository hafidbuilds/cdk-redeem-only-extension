(function attachExternalEffectLedger(root, factory) {
  const api = factory(root);
  root.MultiPageExternalEffectLedger = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createExternalEffectLedgerModule(root) {
  const EFFECTS_STORAGE_KEY = 'externalEffectsV1';
  const ATTEMPTS_STORAGE_KEY = 'redeemAttemptsV1';
  const EFFECT_STATUSES = new Set(['prepared', 'dispatched', 'acknowledged', 'unknown', 'confirmed', 'failed']);
  const BLOCKING_STATUSES = new Set(['prepared', 'dispatched', 'acknowledged', 'unknown', 'confirmed']);

  function createExternalEffectLedger({
    chromeApi = root.chrome,
    schema = root.MultiPageTaskSchema,
    now = () => new Date().toISOString(),
    random = () => Math.random(),
  } = {}) {
    let queue = Promise.resolve();

    function enqueue(operation) {
      const run = queue.then(operation, operation);
      queue = run.catch(() => {});
      return run;
    }

    function text(value = '') {
      return String(value ?? '').trim();
    }

    function normalizeChannel(value = '') {
      const channel = text(value).toLowerCase();
      return ['upi', 'ideal', 'pix'].includes(channel) ? channel : 'upi';
    }

    function fingerprintCdkey(cdkey = '') {
      const normalized = text(cdkey).toLowerCase().replace(/[\s-]+/g, '');
      return normalized ? schema.stableHash(normalized) : '';
    }

    function createId(prefix, seed) {
      const stamp = Math.max(0, Date.parse(now()) || Date.now()).toString(36);
      const entropy = Math.floor(Number(random()) * 0x100000000).toString(36).padStart(7, '0');
      return `${prefix}_${stamp}_${schema.stableHash(seed).slice(6)}_${entropy}`;
    }

    async function readRoots() {
      const stored = await chromeApi.storage.local.get([EFFECTS_STORAGE_KEY, ATTEMPTS_STORAGE_KEY]);
      return {
        effects: {
          schemaVersion: 1,
          items: stored?.[EFFECTS_STORAGE_KEY]?.items && typeof stored[EFFECTS_STORAGE_KEY].items === 'object'
            ? stored[EFFECTS_STORAGE_KEY].items
            : {},
          updatedAt: text(stored?.[EFFECTS_STORAGE_KEY]?.updatedAt),
        },
        attempts: {
          schemaVersion: 1,
          items: stored?.[ATTEMPTS_STORAGE_KEY]?.items && typeof stored[ATTEMPTS_STORAGE_KEY].items === 'object'
            ? stored[ATTEMPTS_STORAGE_KEY].items
            : {},
          updatedAt: text(stored?.[ATTEMPTS_STORAGE_KEY]?.updatedAt),
        },
      };
    }

    async function writeRoots(roots, timestamp = now()) {
      const effects = { schemaVersion: 1, items: roots.effects.items, updatedAt: timestamp };
      const attempts = { schemaVersion: 1, items: roots.attempts.items, updatedAt: timestamp };
      await chromeApi.storage.local.set({
        [EFFECTS_STORAGE_KEY]: effects,
        [ATTEMPTS_STORAGE_KEY]: attempts,
      });
      return { effects, attempts };
    }

    function buildActivityKey({ accountId = '', channel = 'upi', resourceFingerprint = '' } = {}) {
      return [text(accountId).toLowerCase(), normalizeChannel(channel), text(resourceFingerprint)].join('|');
    }

    async function prepareRedeem(input = {}) {
      return enqueue(async () => {
        const taskId = text(input.taskId);
        const accountId = text(input.accountId).toLowerCase();
        const channel = normalizeChannel(input.channel);
        const resourceFingerprint = fingerprintCdkey(input.cdkey);
        if (!taskId) throw Object.assign(new Error('TASK_ID_REQUIRED'), { code: 'TASK_ID_REQUIRED' });
        if (!accountId) throw Object.assign(new Error('ACCOUNT_ID_REQUIRED'), { code: 'ACCOUNT_ID_REQUIRED' });
        if (!resourceFingerprint) throw Object.assign(new Error('REDEEM_CDK_REQUIRED'), { code: 'REDEEM_CDK_REQUIRED' });

        const roots = await readRoots();
        const activityKey = buildActivityKey({ accountId, channel, resourceFingerprint });
        const existing = Object.values(roots.effects.items).find((effect) => (
          effect.activityKey === activityKey && BLOCKING_STATUSES.has(effect.status)
        ));
        if (existing) {
          return {
            effect: existing,
            attempt: roots.attempts.items[existing.redeemAttemptId] || null,
            reused: true,
            canDispatch: existing.taskId === taskId && existing.status === 'prepared',
          };
        }

        const timestamp = now();
        const effectId = createId('effect', `${taskId}|${activityKey}`);
        const redeemAttemptId = createId('redeem', `${effectId}|${activityKey}`);
        const idempotencyKey = `redeem_${schema.stableHash(`${taskId}|${activityKey}`)}`;
        const effect = {
          effectId,
          idempotencyKey,
          activityKey,
          taskId,
          channel,
          nodeId: text(input.nodeId) || 'cdk-redeem-submit',
          type: 'redeem_submit',
          resourceFingerprint,
          status: 'prepared',
          remoteJobId: '',
          requestStartedAt: '',
          acknowledgedAt: '',
          confirmedAt: '',
          lastCheckedAt: '',
          errorCode: '',
          redeemAttemptId,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        const attempt = {
          redeemAttemptId,
          taskId,
          accountId,
          channel,
          cdkeyFingerprint: resourceFingerprint,
          assignedAt: timestamp,
          submittedAt: '',
          confirmedAt: '',
          remoteJobId: '',
          finalStatus: '',
          errorCode: '',
        };
        roots.effects.items[effectId] = effect;
        roots.attempts.items[redeemAttemptId] = attempt;
        await writeRoots(roots, timestamp);
        return { effect, attempt, reused: false, canDispatch: true };
      });
    }

    async function transition(effectId, status, patch = {}) {
      return enqueue(async () => {
        const normalizedStatus = text(status).toLowerCase();
        if (!EFFECT_STATUSES.has(normalizedStatus)) throw new Error('EXTERNAL_EFFECT_STATUS_INVALID');
        const roots = await readRoots();
        const current = roots.effects.items[text(effectId)];
        if (!current) throw new Error('EXTERNAL_EFFECT_NOT_FOUND');
        const timestamp = now();
        const effect = {
          ...current,
          ...patch,
          effectId: current.effectId,
          status: normalizedStatus,
          resourceFingerprint: current.resourceFingerprint,
          activityKey: current.activityKey,
          updatedAt: timestamp,
        };
        const currentAttempt = roots.attempts.items[current.redeemAttemptId] || {};
        const attempt = {
          ...currentAttempt,
          ...(normalizedStatus === 'dispatched' ? { submittedAt: timestamp } : {}),
          ...(['confirmed', 'failed'].includes(normalizedStatus) ? {
            finalStatus: normalizedStatus,
            confirmedAt: normalizedStatus === 'confirmed' ? timestamp : currentAttempt.confirmedAt || '',
          } : {}),
          ...(Object.prototype.hasOwnProperty.call(patch, 'remoteJobId') ? { remoteJobId: text(patch.remoteJobId) } : {}),
          ...(Object.prototype.hasOwnProperty.call(patch, 'errorCode') ? { errorCode: text(patch.errorCode) } : {}),
        };
        roots.effects.items[current.effectId] = effect;
        roots.attempts.items[current.redeemAttemptId] = attempt;
        await writeRoots(roots, timestamp);
        return { effect, attempt };
      });
    }

    function markDispatched(effectId) {
      return transition(effectId, 'dispatched', { requestStartedAt: now(), errorCode: '' });
    }

    function acknowledge(effectId, input = {}) {
      return transition(effectId, 'acknowledged', {
        remoteJobId: text(input.remoteJobId),
        acknowledgedAt: now(),
        lastCheckedAt: now(),
        errorCode: '',
      });
    }

    function markUnknown(effectId, input = {}) {
      return transition(effectId, 'unknown', {
        remoteJobId: text(input.remoteJobId),
        lastCheckedAt: now(),
        errorCode: text(input.errorCode) || 'REDEEM_REMOTE_STATUS_UNKNOWN',
      });
    }

    function confirm(effectId, input = {}) {
      return transition(effectId, 'confirmed', {
        remoteJobId: text(input.remoteJobId),
        confirmedAt: now(),
        lastCheckedAt: now(),
        errorCode: '',
      });
    }

    function fail(effectId, input = {}) {
      return transition(effectId, 'failed', {
        remoteJobId: text(input.remoteJobId),
        lastCheckedAt: now(),
        errorCode: text(input.errorCode) || 'REDEEM_REMOTE_REJECTED',
      });
    }

    async function get(effectId) {
      return (await readRoots()).effects.items[text(effectId)] || null;
    }

    async function listByTask(taskId) {
      const normalizedTaskId = text(taskId);
      return Object.values((await readRoots()).effects.items).filter((effect) => effect.taskId === normalizedTaskId);
    }

    async function listRecordsByTask(taskId) {
      const normalizedTaskId = text(taskId);
      const roots = await readRoots();
      return Object.values(roots.effects.items)
        .filter((effect) => effect.taskId === normalizedTaskId)
        .map((effect) => ({
          effect,
          attempt: roots.attempts.items[effect.redeemAttemptId] || null,
        }));
    }

    function extractRemoteJobId(payload = {}) {
      const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
      const candidates = [
        source.remoteJobId, source.remote_job_id, source.jobId, source.job_id,
        source.taskId, source.task_id, source.data?.remoteJobId, source.data?.jobId,
        source.data?.taskId, source.items?.[0]?.jobId, source.items?.[0]?.taskId,
      ];
      return text(candidates.find((value) => text(value)) || '');
    }

    return {
      acknowledge,
      confirm,
      extractRemoteJobId,
      fail,
      fingerprintCdkey,
      get,
      listByTask,
      listRecordsByTask,
      markDispatched,
      markUnknown,
      prepareRedeem,
      readRoots,
      transition,
    };
  }

  return {
    ATTEMPTS_STORAGE_KEY,
    BLOCKING_STATUSES,
    EFFECTS_STORAGE_KEY,
    EFFECT_STATUSES,
    createExternalEffectLedger,
  };
});
