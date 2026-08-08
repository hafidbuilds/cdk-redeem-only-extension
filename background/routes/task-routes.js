(function attachTaskRoutes(root, factory) {
  const api = factory(root); root.MultiPageTaskRoutes = api; if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createTaskRoutesModule(root) {
  function createTaskOperationTracker({ getNodeIdsForState, getState } = {}) {
    const runtime = root.MultiPageRuntimeTaskRuntime || null;
    function getAccountIds(payload = {}) {
      const credentials = Array.isArray(payload.credentials) ? payload.credentials : [];
      return Array.from(new Set([
        payload.email, payload.accountId, payload.credential?.email,
        ...credentials.map((item) => item?.email || item?.accountId),
      ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)));
    }
    function buildTaskInput(type, payload = {}, state = {}, overrides = {}) {
      const accountIds = getAccountIds(payload);
      const registrationAccountId = type === 'register' ? String(state.email || '').trim().toLowerCase() : '';
      if (!accountIds.length && registrationAccountId) accountIds.push(registrationAccountId);
      return {
        type,
        accountId: accountIds.length === 1 ? accountIds[0] : '',
        accountIds,
        payload,
        progress: { current: 0, total: Math.max(1, accountIds.length || Number(payload.totalRuns) || 1) },
        workflowSnapshot: {
          activeFlowId: String(state.activeFlowId || '').trim(),
          workflowVersion: Number(state.workflowVersion) || 3,
          nodeIds: typeof getNodeIdsForState === 'function' ? getNodeIdsForState(state) : [],
        },
        ...overrides,
      };
    }
    async function runTrackedTask(type, payload, operation, overrides = {}) {
      if (!runtime?.runTask) return { taskId: '', result: await operation(null) };
      return runtime.runTask(buildTaskInput(type, payload, await getState(), overrides), operation);
    }
    return { buildTaskInput, runTrackedTask, runtime };
  }
  function createTaskRoutes({ repository, eventStore, runtime } = {}) {
    return {
      GET_ACCOUNT_TASKS: async () => ({ ok: true, tasks: repository ? await repository.list() : [] }),
      GET_ACCOUNT_TASK_EVENTS: async (payload = {}) => {
        const taskId = String(payload.taskId || '').trim();
        if (!taskId) throw new Error('TASK_ID_REQUIRED');
        return { ok: true, events: eventStore ? await eventStore.list(taskId) : [] };
      },
      CANCEL_ACCOUNT_TASK: async (payload = {}) => {
        const taskId = String(payload.taskId || '').trim();
        if (!taskId) throw new Error('TASK_ID_REQUIRED');
        return { ok: true, task: await runtime.requestCancel(taskId) };
      },
      DELETE_ACCOUNT_TASK: async (payload = {}) => {
        const taskId = String(payload.taskId || '').trim();
        if (!taskId) throw new Error('TASK_ID_REQUIRED');
        if (!repository?.removeTerminal) throw new Error('TASK_DELETE_UNAVAILABLE');
        const task = await repository.removeTerminal(taskId);
        await eventStore?.removeMany?.([taskId]);
        return { ok: true, taskId, task };
      },
      DELETE_COMPLETED_ACCOUNT_TASKS: async () => {
        if (!repository?.clearTerminal) throw new Error('TASK_DELETE_UNAVAILABLE');
        const result = await repository.clearTerminal();
        await eventStore?.removeMany?.(result.deletedTaskIds);
        return { ok: true, ...result };
      },
      RECOVER_ACCOUNT_TASKS: async () => ({ ok: true, recovered: await runtime.recoverActiveTasks({ force: true }) }),
    };
  }
  return { createTaskOperationTracker, createTaskRoutes };
});
