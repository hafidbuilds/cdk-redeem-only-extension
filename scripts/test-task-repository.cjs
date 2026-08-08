const test = require('node:test');
const assert = require('node:assert/strict');

require('../shared/task-schema.js');
require('../shared/sensitive-data-redactor.js');
const repositoryApi = require('../background/task-repository.js');

function createStorage() {
  const store = {};
  return {
    store,
    chromeApi: { storage: { local: {
      async get(keys) {
        return Object.fromEntries((Array.isArray(keys) ? keys : [keys])
          .filter((key) => Object.hasOwn(store, key))
          .map((key) => [key, structuredClone(store[key])]));
      },
      async set(values) { Object.assign(store, structuredClone(values)); },
    } } },
  };
}

test('task repository deletes terminal tasks but protects active tasks', async () => {
  const storage = createStorage();
  let tick = 0;
  const repository = repositoryApi.createTaskRepository({
    chromeApi: storage.chromeApi,
    now: () => new Date(Date.UTC(2026, 7, 5, 4, 0, tick++)).toISOString(),
  });
  const running = await repository.create({ taskId: 'task_running', type: 'register', status: 'running' });
  const succeeded = await repository.create({ taskId: 'task_succeeded', type: 'check_eligibility', status: 'succeeded' });
  await assert.rejects(repository.removeTerminal(running.taskId), /TASK_NOT_TERMINAL/);
  assert.equal((await repository.removeTerminal(succeeded.taskId)).status, 'succeeded');
  assert.equal(await repository.get(succeeded.taskId), null);
  assert.equal((await repository.get(running.taskId)).status, 'running');
});

test('task repository clears all terminal tasks and preserves active work', async () => {
  const storage = createStorage();
  const repository = repositoryApi.createTaskRepository({ chromeApi: storage.chromeApi });
  await repository.create({ taskId: 'task_running', type: 'register', status: 'running' });
  await repository.create({ taskId: 'task_failed', type: 'register', status: 'failed' });
  await repository.create({ taskId: 'task_succeeded', type: 'check_eligibility', status: 'succeeded' });
  const result = await repository.clearTerminal();
  assert.equal(result.deletedCount, 2);
  assert.deepEqual(new Set(result.deletedTaskIds), new Set(['task_failed', 'task_succeeded']));
  assert.deepEqual((await repository.list()).map((task) => task.taskId), ['task_running']);
});
