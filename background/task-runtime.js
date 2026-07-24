(function attachTaskRuntime(root, factory) {
  const api = factory(root); root.MultiPageTaskRuntime = api; if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createTaskRuntimeModule(root) {
  function createTaskRuntime({ repository, eventStore, lockManager, recoveryPolicy = root.MultiPageTaskRecoveryPolicy } = {}) {
    let bootRecoveryPromise = null;
    const runningOperations = new Map();

    function createTaskError(code, message = code) {
      const error = new Error(message);
      error.code = code;
      return error;
    }

    function getAccountResourceKeys(input = {}) {
      const accountIds = [input.accountId]
        .concat(Array.isArray(input.accountIds) ? input.accountIds : [])
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean);
      return Array.from(new Set(accountIds.map((accountId) => `account:${accountId}`)));
    }

    async function appendStateEvent(taskId, code, message, detail = {}) {
      return eventStore.append({ taskId, type: 'state', code, message, detail });
    }

    async function startTask(input = {}) {
      const requestedResourceKeys = Array.from(new Set([
        ...(Array.isArray(input.resourceKeys) ? input.resourceKeys : []),
        ...getAccountResourceKeys(input),
      ]));
      const task = await repository.create({
        ...input,
        resourceKeys: [],
        status: 'pending',
        checkpoint: { ...(input.checkpoint || {}), taskStarted: false },
      });
      try {
        await lockManager?.acquire?.(task.taskId, requestedResourceKeys);
        const running = await repository.patch(task.taskId, {
          status: 'running',
          checkpoint: { taskStarted: true },
        });
        await appendStateEvent(task.taskId, 'TASK_STARTED', 'Task started', {
          type: running.type,
          channel: running.channel,
        });
        return running;
      } catch (error) {
        const code = String(error?.code || 'TASK_START_FAILED');
        await repository.patch(task.taskId, {
          status: 'failed',
          errorCode: code,
          error: String(error?.message || error),
        });
        await eventStore.append({
          taskId: task.taskId,
          type: 'error',
          level: 'error',
          code,
          message: String(error?.message || error),
          detail: error?.detail || {},
        });
        throw error;
      }
    }

    function createContext(taskId) {
      return {
        taskId,
        checkpoint: (patch = {}) => repository.patch(taskId, {
          checkpoint: patch,
          nodeId: patch.nodeId || undefined,
          progress: patch.progress || undefined,
        }),
        event: (event) => eventStore.append({ ...event, taskId }),
        setStatus: (status, patch = {}) => repository.patch(taskId, { ...patch, status }),
        isCancelRequested: async () => (await repository.get(taskId))?.cancelRequested === true,
        assertNotCanceled: async () => {
          if ((await repository.get(taskId))?.cancelRequested === true) {
            throw createTaskError('TASK_CANCELED', 'Task cancellation requested');
          }
        },
      };
    }

    async function completeTask(taskId, result = {}) {
      const current = await repository.get(taskId);
      if (!current) throw createTaskError('TASK_NOT_FOUND');
      const status = current.cancelRequested ? 'canceled' : 'succeeded';
      const completed = await repository.patch(taskId, {
        status,
        result: result && typeof result === 'object' ? result : {},
        checkpoint: { locksReleased: true },
      });
      await appendStateEvent(taskId, status === 'canceled' ? 'TASK_CANCELED' : 'TASK_SUCCEEDED', status === 'canceled' ? 'Task canceled' : 'Task succeeded');
      await lockManager?.release?.(taskId);
      return completed;
    }

    async function failTask(taskId, error) {
      const current = await repository.get(taskId);
      if (!current) throw createTaskError('TASK_NOT_FOUND');
      const checkpoint = current.checkpoint || {};
      const hasUnconfirmedSideEffect = checkpoint.remoteRequestSent === true
        || Boolean(checkpoint.remoteJobId)
        || checkpoint.externalSideEffectStarted === true
        || checkpoint.cdkSubmitted === true
        || (checkpoint.accessTokenRefreshed === true && checkpoint.accessTokenSaved !== true);
      const recoveryDecision = hasUnconfirmedSideEffect ? recoveryPolicy.decideTaskRecovery(current) : null;
      const code = String(recoveryDecision?.errorCode || error?.code || 'TASK_OPERATION_FAILED');
      const canceled = code === 'TASK_CANCELED';
      const status = canceled ? 'canceled' : (recoveryDecision?.status || 'failed');
      const releaseLocks = canceled || !recoveryDecision || recoveryDecision.releaseLocks === true;
      const failed = await repository.patch(taskId, {
        status,
        errorCode: code,
        error: String(error?.message || error),
        recovery: recoveryDecision || {},
        checkpoint: { locksReleased: releaseLocks },
      });
      await eventStore.append({
        taskId,
        type: canceled ? 'state' : 'error',
        level: canceled ? 'info' : 'error',
        code,
        message: String(error?.message || error),
        detail: error?.detail || {},
      });
      if (releaseLocks) await lockManager?.release?.(taskId);
      return failed;
    }

    async function executeTask(taskId, operation) {
      if (typeof operation !== 'function') throw createTaskError('TASK_OPERATION_REQUIRED');
      const normalizedTaskId = String(taskId || '').trim();
      if (runningOperations.has(normalizedTaskId)) return runningOperations.get(normalizedTaskId);
      const run = (async () => {
        const context = createContext(normalizedTaskId);
        try {
          await context.assertNotCanceled();
          const result = await operation(context);
          const current = await repository.get(normalizedTaskId);
          const task = current && ['pending', 'running'].includes(current.status)
            ? await completeTask(normalizedTaskId, result)
            : current;
          return { taskId: normalizedTaskId, task, result };
        } catch (error) {
          await failTask(normalizedTaskId, error);
          throw error;
        } finally {
          runningOperations.delete(normalizedTaskId);
        }
      })();
      runningOperations.set(normalizedTaskId, run);
      return run;
    }

    async function runTask(input = {}, operation) {
      const task = await startTask(input);
      return executeTask(task.taskId, operation);
    }

    async function requestCancel(taskId) {
      const current = await repository.get(taskId);
      if (!current) throw createTaskError('TASK_NOT_FOUND');
      if (root.MultiPageTaskSchema?.TERMINAL_STATUSES?.has(current.status)) return current;
      const remotePending = current.checkpoint?.remoteRequestSent === true || Boolean(current.checkpoint?.remoteJobId);
      const task = await repository.patch(taskId, {
        status: remotePending ? 'waiting_remote' : 'cancel_requested',
        cancelRequested: true,
      });
      await appendStateEvent(taskId, 'TASK_CANCEL_REQUESTED', 'Task cancellation requested', { remotePending });
      return task;
    }

    async function performRecovery() {
      const lockState = await lockManager?.rebuild?.() || { conflicts: [] };
      const conflictedTaskIds = new Set((lockState.conflicts || []).map((item) => item.taskId));
      const tasks = await repository.listActive();
      const recovered = [];
      for (const task of tasks) {
        const decision = conflictedTaskIds.has(task.taskId)
          ? { status: 'manual_review', action: 'manual_review', canRetry: false, canResubmit: false, releaseLocks: false, errorCode: 'TASK_LOCK_CONFLICT' }
          : recoveryPolicy.decideTaskRecovery(task);
        const next = await repository.patch(task.taskId, {
          status: decision.status,
          errorCode: decision.errorCode || task.errorCode,
          recovery: decision,
          checkpoint: { recoveredAtStartup: true, locksReleased: decision.releaseLocks === true },
        });
        await eventStore.append({
          taskId: task.taskId,
          code: `TASK_RECOVERY_${decision.action.toUpperCase()}`,
          message: `Recovery decision: ${decision.action}`,
          detail: { canRetry: decision.canRetry, canResubmit: decision.canResubmit },
        });
        if (decision.releaseLocks) await lockManager?.release?.(task.taskId);
        recovered.push({ task: next, decision });
      }
      return recovered;
    }

    function recoverActiveTasks(options = {}) {
      if (options.force === true) return performRecovery();
      if (!bootRecoveryPromise) bootRecoveryPromise = performRecovery();
      return bootRecoveryPromise;
    }

    async function findActiveTask(predicate = () => true) {
      return (await repository.listActive()).find(predicate) || null;
    }

    return {
      completeTask,
      createContext,
      executeTask,
      failTask,
      findActiveTask,
      recoverActiveTasks,
      requestCancel,
      runTask,
      startTask,
    };
  }
  return { createTaskRuntime };
});
