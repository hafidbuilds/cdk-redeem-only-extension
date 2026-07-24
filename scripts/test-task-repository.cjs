const test = require('node:test');
const assert = require('node:assert/strict');

require('../shared/sensitive-data-redactor.js');
require('../shared/task-schema.js');
const repositoryApi = require('../background/task-repository.js');

function createStorage(initial = {}) {
  const store = structuredClone(initial);
  return {
    store,
    chromeApi: { storage: { local: {
      async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter((key) => Object.hasOwn(store, key)).map((key) => [key, structuredClone(store[key])])); },
      async set(values) { Object.assign(store, structuredClone(values)); },
    } } },
  };
}

test('task repository serializes concurrent patches without losing checkpoints', async () => {
  const storage = createStorage();
  let tick = 0;
  const repository = repositoryApi.createTaskRepository({ chromeApi: storage.chromeApi, now: () => `2026-07-25T08:00:0${tick++}.000Z` });
  const task = await repository.create({ type: 'register' });
  await Promise.all([
    repository.patch(task.taskId, { checkpoint: { emailSubmitted: true } }),
    repository.patch(task.taskId, { checkpoint: { nodeId: 'verification' } }),
  ]);
  const saved = await repository.get(task.taskId);
  assert.equal(saved.checkpoint.emailSubmitted, true);
  assert.equal(saved.checkpoint.nodeId, 'verification');
});

test('task repository redacts task payload result and errors before persistence', async () => {
  const storage = createStorage();
  const repository = repositoryApi.createTaskRepository({ chromeApi: storage.chromeApi });
  const task = await repository.create({
    type: 'refresh_access_token',
    payload: { password: 'secret-password', accessToken: 'token-value-123456789' },
    result: { cookie: 'session-cookie' },
    error: 'accessToken=plain-token-value',
  });
  const serialized = JSON.stringify(storage.store.accountTasksV1);
  assert.doesNotMatch(serialized, /secret-password|token-value-123456789|session-cookie|plain-token-value/);
  assert.match(task.payload.password, /REDACTED/);
});

test('task repository prunes old completed tasks but never active tasks', async () => {
  const storage = createStorage();
  let tick = 0;
  const repository = repositoryApi.createTaskRepository({ chromeApi: storage.chromeApi, maxCompleted: 2, now: () => new Date(1721894400000 + tick++ * 1000).toISOString() });
  const active = await repository.create({ type: 'register', status: 'running' });
  for (let index = 0; index < 4; index += 1) await repository.create({ type: 'verify_membership', status: 'succeeded' });
  const tasks = await repository.list();
  assert.ok(tasks.some((task) => task.taskId === active.taskId));
  assert.equal(tasks.filter((task) => task.status === 'succeeded').length, 2);
});
