(function attachTaskLockManager(root, factory) {
  const api = factory(root);
  root.MultiPageTaskLockManager = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createTaskLockManagerModule(root) {
  function createTaskLockManager({ repository, schema = root.MultiPageTaskSchema } = {}) {
    let queue = Promise.resolve();
    const owners = new Map();

    function normalizeResourceKey(value = '') {
      return String(value || '').trim().toLowerCase();
    }

    function normalizeResourceKeys(values = []) {
      return Array.from(new Set((Array.isArray(values) ? values : [])
        .map(normalizeResourceKey)
        .filter(Boolean)));
    }

    function withQueue(operation) {
      const run = queue.then(operation, operation);
      queue = run.catch(() => {});
      return run;
    }

    async function rebuild() {
      return withQueue(async () => {
        owners.clear();
        const conflicts = [];
        for (const task of await repository.list()) {
          if (schema.TERMINAL_STATUSES.has(task.status) && task.checkpoint?.locksReleased !== false) continue;
          for (const key of normalizeResourceKeys(task.resourceKeys)) {
            const owner = owners.get(key);
            if (owner && owner !== task.taskId) {
              conflicts.push({ key, ownerTaskId: owner, taskId: task.taskId });
              continue;
            }
            owners.set(key, task.taskId);
          }
        }
        return { lockCount: owners.size, conflicts };
      });
    }

    async function acquire(taskId, resourceKeys = []) {
      return withQueue(async () => {
        const normalizedTaskId = String(taskId || '').trim();
        const currentTask = await repository.get(normalizedTaskId);
        if (!currentTask) throw new Error('TASK_NOT_FOUND');
        const keys = normalizeResourceKeys([
          ...(Array.isArray(currentTask.resourceKeys) ? currentTask.resourceKeys : []),
          ...(Array.isArray(resourceKeys) ? resourceKeys : []),
        ]);
        const activeTasks = (await repository.list()).filter((task) => (
          !schema.TERMINAL_STATUSES.has(task.status) || task.checkpoint?.locksReleased === false
        ));
        owners.clear();
        activeTasks.forEach((task) => {
          normalizeResourceKeys(task.resourceKeys).forEach((key) => {
            if (!owners.has(key)) owners.set(key, task.taskId);
          });
        });
        const conflicts = keys
          .map((key) => ({ key, ownerTaskId: owners.get(key) || '' }))
          .filter((item) => item.ownerTaskId && item.ownerTaskId !== normalizedTaskId);
        if (conflicts.length) {
          const error = new Error(`Task resource is already locked: ${conflicts[0].key}`);
          error.code = 'TASK_RESOURCE_CONFLICT';
          error.detail = { conflicts };
          throw error;
        }
        keys.forEach((key) => owners.set(key, normalizedTaskId));
        if (keys.length) {
          await repository.patch(normalizedTaskId, {
            resourceKeys: keys,
            checkpoint: {
              locksAcquired: true,
              accountLockAcquired: keys.some((key) => key.startsWith('account:')),
            },
          });
        }
        return keys;
      });
    }

    async function release(taskId) {
      return withQueue(async () => {
        const normalizedTaskId = String(taskId || '').trim();
        for (const [key, ownerTaskId] of owners.entries()) {
          if (ownerTaskId === normalizedTaskId) owners.delete(key);
        }
        return true;
      });
    }

    function getOwner(resourceKey) {
      return owners.get(normalizeResourceKey(resourceKey)) || '';
    }

    return { acquire, getOwner, normalizeResourceKey, normalizeResourceKeys, rebuild, release };
  }

  return { createTaskLockManager };
});
