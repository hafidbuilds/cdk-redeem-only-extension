(function attachTaskSchema(root, factory) {
  const api = factory(root);
  root.MultiPageTaskSchema = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createTaskSchemaModule(root) {
  const TASK_TYPES = new Set(['register', 'refresh_access_token', 'verify_membership', 'redeem', 'provider_health_check']);
  const TASK_STATUSES = new Set(['pending', 'running', 'waiting_remote', 'retry_wait', 'cancel_requested', 'canceled', 'succeeded', 'failed', 'interrupted', 'manual_review']);
  const TERMINAL_STATUSES = new Set(['canceled', 'succeeded', 'failed', 'interrupted', 'manual_review']);

  function text(value = '') { return String(value ?? '').trim(); }
  function iso(value = '') { const time = Date.parse(text(value)); return Number.isFinite(time) ? new Date(time).toISOString() : ''; }
  function normalizeType(value) { const normalized = text(value).toLowerCase(); return TASK_TYPES.has(normalized) ? normalized : ''; }
  function normalizeStatus(value) { const normalized = text(value).toLowerCase(); return TASK_STATUSES.has(normalized) ? normalized : 'pending'; }
  function normalizeChannel(value) { const normalized = text(value).toLowerCase(); return ['upi', 'ideal', 'pix'].includes(normalized) ? normalized : ''; }

  function stableHash(value) {
    const input = typeof value === 'string' ? value : JSON.stringify(value, Object.keys(value || {}).sort());
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  function createTaskId(nowMs = Date.now(), random = Math.random()) {
    return `task_${Math.max(0, Math.floor(Number(nowMs) || 0))}_${Math.floor(Number(random) * 0x100000000).toString(36).padStart(7, '0')}`;
  }

  function normalizeTask(value = {}, options = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const type = normalizeType(source.type);
    if (!type) return null;
    const now = iso(options.now) || new Date().toISOString();
    const status = normalizeStatus(source.status);
    const workflowSnapshot = source.workflowSnapshot && typeof source.workflowSnapshot === 'object' ? source.workflowSnapshot : {};
    return {
      taskId: text(source.taskId) || createTaskId(Date.parse(now), options.random),
      type,
      accountId: root.MultiPageAccountRecordSchema?.normalizeAccountId?.(source.accountId) || text(source.accountId).toLowerCase(),
      channel: normalizeChannel(source.channel),
      status,
      nodeId: text(source.nodeId),
      progress: { current: Math.max(0, Number(source.progress?.current) || 0), total: Math.max(0, Number(source.progress?.total) || 0) },
      resourceKeys: Array.from(new Set((Array.isArray(source.resourceKeys) ? source.resourceKeys : []).map(text).filter(Boolean))),
      checkpoint: source.checkpoint && typeof source.checkpoint === 'object' ? { ...source.checkpoint } : {},
      payload: source.payload && typeof source.payload === 'object' ? { ...source.payload } : {},
      result: source.result && typeof source.result === 'object' ? { ...source.result } : {},
      workflowSnapshot: {
        activeFlowId: text(workflowSnapshot.activeFlowId),
        workflowVersion: Math.max(0, Math.floor(Number(workflowSnapshot.workflowVersion) || 0)),
        nodeIds: Array.isArray(workflowSnapshot.nodeIds) ? workflowSnapshot.nodeIds.map(text).filter(Boolean) : [],
        definitionHash: text(workflowSnapshot.definitionHash) || stableHash({
          activeFlowId: workflowSnapshot.activeFlowId || '',
          workflowVersion: workflowSnapshot.workflowVersion || 0,
          nodeIds: workflowSnapshot.nodeIds || [],
        }),
      },
      errorCode: text(source.errorCode),
      error: text(source.error),
      recovery: source.recovery && typeof source.recovery === 'object' ? { ...source.recovery } : {},
      cancelRequested: source.cancelRequested === true || status === 'cancel_requested',
      createdAt: iso(source.createdAt) || now,
      startedAt: iso(source.startedAt),
      updatedAt: iso(source.updatedAt) || now,
      finishedAt: iso(source.finishedAt),
    };
  }

  return { TASK_STATUSES, TASK_TYPES, TERMINAL_STATUSES, createTaskId, normalizeChannel, normalizeStatus, normalizeTask, normalizeType, stableHash };
});
