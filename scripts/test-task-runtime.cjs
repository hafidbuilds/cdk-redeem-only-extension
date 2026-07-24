const test = require('node:test');
const assert = require('node:assert/strict');

require('../shared/sensitive-data-redactor.js');
require('../shared/task-schema.js');
const repositoryApi = require('../background/task-repository.js');
const eventStoreApi = require('../background/task-event-store.js');
const lockApi = require('../background/task-lock-manager.js');
const recoveryPolicy = require('../background/task-recovery-policy.js');
const runtimeApi = require('../background/task-runtime.js');

function createRuntime() {
  const store = {};
  const chromeApi = { storage: { local: {
    async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter((key) => Object.hasOwn(store, key)).map((key) => [key, structuredClone(store[key])])); },
    async set(values) { Object.assign(store, structuredClone(values)); },
  } } };
  const repository = repositoryApi.createTaskRepository({ chromeApi });
  const eventStore = eventStoreApi.createTaskEventStore({ chromeApi });
  const lockManager = lockApi.createTaskLockManager({ repository });
  return { repository, eventStore, runtime: runtimeApi.createTaskRuntime({ repository, eventStore, lockManager, recoveryPolicy }) };
}

test('task runtime persists checkpoints, result and terminal lock release', async () => {
  const fixture = createRuntime();
  const run = await fixture.runtime.runTask({ type: 'verify_membership', accountId: 'user@example.com' }, async (context) => {
    await context.checkpoint({ nodeId: 'verify', progress: { current: 1, total: 1 } });
    return { membership: 'free' };
  });
  assert.equal(run.task.status, 'succeeded');
  assert.equal(run.task.checkpoint.nodeId, 'verify');
  assert.equal(run.task.checkpoint.locksReleased, true);
  assert.equal((await fixture.eventStore.list(run.taskId)).at(-1).code, 'TASK_SUCCEEDED');
});

test('cancel requested after remote submission waits for remote result', async () => {
  const fixture = createRuntime();
  const task = await fixture.runtime.startTask({ type: 'redeem', accountId: 'user@example.com', checkpoint: { remoteRequestSent: true } });
  const canceled = await fixture.runtime.requestCancel(task.taskId);
  assert.equal(canceled.status, 'waiting_remote');
  assert.equal(canceled.cancelRequested, true);
});

test('unknown remote failure stays query-only and keeps locks', async () => {
  const fixture = createRuntime();
  const task = await fixture.runtime.startTask({ type: 'redeem', accountId: 'user@example.com' });
  await assert.rejects(fixture.runtime.executeTask(task.taskId, async (context) => {
    await context.checkpoint({ cdkSubmitted: true, remoteRequestSent: true });
    throw new Error('network timeout');
  }), /network timeout/);
  const saved = await fixture.repository.get(task.taskId);
  assert.equal(saved.status, 'waiting_remote');
  assert.equal(saved.recovery.canResubmit, false);
  assert.equal(saved.checkpoint.locksReleased, false);
});

test('startup recovery is deduplicated within one service worker instance', async () => {
  const fixture = createRuntime();
  await fixture.runtime.startTask({ type: 'register', checkpoint: { registrationEmailSubmitted: false } });
  const first = await fixture.runtime.recoverActiveTasks();
  const second = await fixture.runtime.recoverActiveTasks();
  assert.deepEqual(second, first);
  const taskId = first[0].task.taskId;
  assert.equal((await fixture.eventStore.list(taskId)).filter((event) => event.code === 'TASK_RECOVERY_RESUME_SAFE').length, 1);
});
