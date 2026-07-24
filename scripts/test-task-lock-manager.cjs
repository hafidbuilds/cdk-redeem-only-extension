const test = require('node:test');
const assert = require('node:assert/strict');

require('../shared/sensitive-data-redactor.js');
const schema = require('../shared/task-schema.js');
const repositoryApi = require('../background/task-repository.js');
const lockApi = require('../background/task-lock-manager.js');

function createRepository() {
  const store = {};
  const chromeApi = { storage: { local: {
    async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter((key) => Object.hasOwn(store, key)).map((key) => [key, structuredClone(store[key])])); },
    async set(values) { Object.assign(store, structuredClone(values)); },
  } } };
  return repositoryApi.createTaskRepository({ chromeApi });
}

test('task lock manager prevents concurrent account ownership', async () => {
  const repository = createRepository();
  const first = await repository.create({ type: 'redeem', status: 'running' });
  const second = await repository.create({ type: 'redeem', status: 'pending' });
  const locks = lockApi.createTaskLockManager({ repository, schema });
  await locks.acquire(first.taskId, ['account:user@example.com']);
  await assert.rejects(locks.acquire(second.taskId, ['account:user@example.com']), { code: 'TASK_RESOURCE_CONFLICT' });
});

test('CDK locks are channel scoped and never persist a complete CDK', async () => {
  const repository = createRepository();
  const upi = await repository.create({ type: 'redeem', status: 'running' });
  const pix = await repository.create({ type: 'redeem', status: 'running' });
  const locks = lockApi.createTaskLockManager({ repository, schema });
  await locks.acquire(upi.taskId, ['cdkey:upi:ABCD-EFGH-IJKL']);
  await locks.acquire(pix.taskId, ['cdkey:pix:ABCD-EFGH-IJKL']);
  assert.match((await repository.get(upi.taskId)).resourceKeys[0], /^cdkey:upi:fnv1a_/);
  assert.doesNotMatch(JSON.stringify(await repository.list()), /ABCD-EFGH-IJKL/);
});

test('unresolved terminal tasks keep locks across manager rebuild', async () => {
  const repository = createRepository();
  const task = await repository.create({ type: 'redeem', status: 'running' });
  const locks = lockApi.createTaskLockManager({ repository, schema });
  await locks.acquire(task.taskId, ['account:locked@example.com']);
  await repository.patch(task.taskId, { status: 'manual_review', checkpoint: { locksReleased: false } });
  const rebuilt = lockApi.createTaskLockManager({ repository, schema });
  await rebuilt.rebuild();
  assert.equal(rebuilt.getOwner('account:locked@example.com'), task.taskId);
});

test('adding a CDK lock preserves the task account lock', async () => {
  const repository = createRepository();
  const task = await repository.create({ type: 'redeem', status: 'running' });
  const locks = lockApi.createTaskLockManager({ repository, schema });
  await locks.acquire(task.taskId, ['account:user@example.com']);
  await locks.acquire(task.taskId, ['cdkey:ideal:IDEAL-SECRET']);
  const resourceKeys = (await repository.get(task.taskId)).resourceKeys;
  assert.equal(resourceKeys.includes('account:user@example.com'), true);
  assert.equal(resourceKeys.some((key) => /^cdkey:ideal:fnv1a_/.test(key)), true);
  assert.doesNotMatch(JSON.stringify(resourceKeys), /IDEAL-SECRET/);
});
