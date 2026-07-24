(function attachTaskRuntime(root, factory) {
  const api = factory(root); root.MultiPageTaskRuntime = api; if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createTaskRuntimeModule(root) {
  function createTaskRuntime({ repository, eventStore, lockManager, recoveryPolicy = root.MultiPageTaskRecoveryPolicy } = {}) {
    let bootRecoveryPromise = null;
    let remoteRecoveryHandler = null;
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
        acquireResources: (resourceKeys = []) => lockManager?.acquire?.(taskId, resourceKeys),
        checkpoint: (patch = {}) => repository.patch(taskId, {
          checkpoint: patch,
          nodeId: patch.nodeId || undefined,
          progress: patch.progress || undefined,
        }),
        event: (event) => eventStore.append({ ...event, taskId }),
        getTask: () => repository.get(taskId),
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

    async function resolveRemoteTask(taskId, resolution = {}) {
      const current = await repository.get(taskId);
      if (!current) throw createTaskError('TASK_NOT_FOUND');
      const outcome = String(resolution.outcome || '').trim().toLowerCase();
      const confirmed = outcome === 'confirmed';
      const failed = outcome === 'failed';
      const status = confirmed ? 'succeeded' : (failed ? 'failed' : 'manual_review');
      const releaseLocks = confirmed || failed;
      const errorCode = confirmed
        ? ''
        : String(resolution.errorCode || (failed ? 'REDEEM_REMOTE_REJECTED' : 'REDEEM_REMOTE_STATUS_UNRESOLVED'));
      const task = await repository.patch(taskId, {
        status,
        errorCode,
        error: confirmed ? '' : String(resolution.message || ''),
        result: confirmed ? { ...current.result, ...(resolution.result || {}), remoteConfirmed: true } : current.result,
        recovery: {
          action: confirmed ? 'remote_confirmed' : (failed ? 'remote_failed' : 'manual_review'),
          canRetry: false,
          canResubmit: failed,
          releaseLocks,
          errorCode,
        },
        checkpoint: {
          externalSideEffectStatus: confirmed ? 'confirmed' : (failed ? 'failed' : 'unknown'),
          remoteRequestSent: !releaseLocks,
          locksReleased: releaseLocks,
          remoteResolvedAt: new Date().toISOString(),
        },
      });
      await appendStateEvent(
        taskId,
        confirmed ? 'TASK_REMOTE_CONFIRMED' : (failed ? 'TASK_REMOTE_FAILED' : 'TASK_REMOTE_MANUAL_REVIEW'),
        confirmed ? 'Remote side effect confirmed' : (failed ? 'Remote side effect explicitly failed' : 'Remote side effect requires manual review'),
        { outcome: confirmed ? 'confirmed' : (failed ? 'failed' : 'manual_review') }
      );
      if (releaseLocks) await lockManager?.release?.(taskId);
      return task;
    }

    function setRemoteRecoveryHandler(handler) {
      remoteRecoveryHandler = typeof handler === 'function' ? handler : null;
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
        const recoveredItem = { task: next, decision };
        if (decision.action === 'query_remote' && remoteRecoveryHandler) {
          try {
            const resolution = await remoteRecoveryHandler({ task: next, decision });
            recoveredItem.resolution = resolution || null;
            recoveredItem.task = resolution?.task || await repository.get(task.taskId) || next;
          } catch {
            recoveredItem.task = await resolveRemoteTask(task.taskId, {
              outcome: 'manual_review',
              errorCode: 'REDEEM_REMOTE_RECOVERY_FAILED',
              message: 'Remote recovery query failed; manual review is required.',
            });
          }
        }
        recovered.push(recoveredItem);
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
      resolveRemoteTask,
      runTask,
      setRemoteRecoveryHandler,
      startTask,
    };
  }
  return { createTaskRuntime };
});
