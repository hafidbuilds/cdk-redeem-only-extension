const test = require('node:test');
const assert = require('node:assert/strict');

const runtimeApi = require('../background/task-runtime.js');

function createHarness(status = 'interrupted') {
  let task = {
    taskId: 'task_fill_session',
    type: 'fill_session',
    status,
    checkpoint: { nextIndex: 2, locksReleased: true },
    recovery: { canRetry: true },
    cancelRequested: false,
    resourceKeys: ['free-session-fill:free'],
  };
  const events = [];
  const locks = [];
  const repository = {
    async get(taskId) { return taskId === task.taskId ? structuredClone(task) : null; },
    async patch(taskId, patch = {}) {
      assert.equal(taskId, task.taskId);
      task = {
        ...task,
        ...patch,
        checkpoint: { ...task.checkpoint, ...(patch.checkpoint || {}) },
      };
      return structuredClone(task);
    },
    async listActive() { return []; },
  };
  const runtime = runtimeApi.createTaskRuntime({
    repository,
    eventStore: { async append(event) { events.push(event); return event; } },
    lockManager: {
      async acquire(taskId, resourceKeys) { locks.push(['acquire', taskId, resourceKeys]); return resourceKeys; },
      async release(taskId) { locks.push(['release', taskId]); return true; },
    },
  });
  return { events, getTask: () => task, locks, runtime };
}

test('task runtime resumes an interrupted fill_session task with its checkpoint', async () => {
  const harness = createHarness();
  const result = await harness.runtime.resumeTask('task_fill_session', async (context) => {
    await context.checkpoint({ progress: { current: 3, total: 5 }, nextIndex: 3 });
    return { successCount: 3 };
  }, ['free-session-fill:free']);

  assert.equal(result.task.status, 'succeeded');
  assert.equal(result.task.checkpoint.nextIndex, 3);
  assert.deepEqual(result.result, { successCount: 3 });
  assert.deepEqual(harness.locks[0], ['acquire', 'task_fill_session', ['free-session-fill:free']]);
  assert.equal(harness.events.some((event) => event.code === 'TASK_RESUMED'), true);
});

test('task runtime rejects a terminal task that is not resumable', async () => {
  const harness = createHarness('succeeded');
  await assert.rejects(
    harness.runtime.resumeTask('task_fill_session', async () => ({})),
    /Task cannot be resumed/
  );
});

test('task runtime finalizes a cancel-requested operation with its partial result', async () => {
  const harness = createHarness('running');
  const result = await harness.runtime.executeTask('task_fill_session', async (context) => {
    await harness.runtime.requestCancel('task_fill_session');
    assert.equal(await context.isCancelRequested(), true);
    return { successCount: 2, stopped: true };
  });

  assert.equal(result.task.status, 'canceled');
  assert.deepEqual(result.task.result, { successCount: 2, stopped: true });
  assert.equal(harness.locks.some((entry) => entry[0] === 'release'), true);
});
