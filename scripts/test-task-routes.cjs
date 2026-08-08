const test = require('node:test');
const assert = require('node:assert/strict');

const trackedInputs = [];
globalThis.MultiPageRuntimeTaskRuntime = {
  async runTask(input, operation) {
    trackedInputs.push(input);
    return { taskId: 'task_tracked', result: await operation({ taskId: 'task_tracked' }) };
  },
};
const routesApi = require('../background/routes/task-routes.js');

test('task operation tracker creates a real task around an existing operation', async () => {
  const tracker = routesApi.createTaskOperationTracker({
    getNodeIdsForState: () => ['start', 'finish'],
    getState: async () => ({ activeFlowId: 'openai', workflowVersion: 3 }),
  });
  const tracked = await tracker.runTrackedTask('check_eligibility', {
    credential: { email: 'User@Example.com' },
  }, async (context) => ({ contextTaskId: context.taskId }));
  assert.equal(tracked.taskId, 'task_tracked');
  assert.equal(tracked.result.contextTaskId, 'task_tracked');
  assert.equal(trackedInputs[0].accountId, 'user@example.com');
  assert.deepEqual(trackedInputs[0].workflowSnapshot.nodeIds, ['start', 'finish']);
});

test('registration tasks use the current workflow email when the message has none', async () => {
  const tracker = routesApi.createTaskOperationTracker({
    getNodeIdsForState: () => ['start'],
    getState: async () => ({ email: 'Current@Example.com' }),
  });
  await tracker.runTrackedTask('register', {}, async () => ({}));
  assert.equal(trackedInputs.at(-1).accountId, 'current@example.com');
});

test('task snapshots default to workflow version 3 when state has no version', () => {
  const tracker = routesApi.createTaskOperationTracker({
    getNodeIdsForState: () => ['open-chatgpt', 'existing-totp-login'],
    getState: async () => ({}),
  });

  const input = tracker.buildTaskInput('register', {}, { email: 'account@example.test' });

  assert.equal(input.workflowSnapshot.workflowVersion, 3);
  assert.deepEqual(input.workflowSnapshot.nodeIds, ['open-chatgpt', 'existing-totp-login']);
});

test('task routes isolate event queries and forward cancellation', async () => {
  const calls = [];
  const routes = routesApi.createTaskRoutes({
    repository: {
      list: async () => [{ taskId: 'task_a' }],
      removeTerminal: async (taskId) => { calls.push(['delete', taskId]); return { taskId, status: 'succeeded' }; },
      clearTerminal: async () => {
        calls.push(['clear']);
        return { deletedTaskIds: ['task_a', 'task_b'], deletedCount: 2 };
      },
    },
    eventStore: {
      list: async (taskId) => { calls.push(['events', taskId]); return [{ taskId }]; },
      removeMany: async (taskIds) => { calls.push(['remove-events', taskIds]); return { deletedCount: taskIds.length }; },
    },
    runtime: {
      requestCancel: async (taskId) => { calls.push(['cancel', taskId]); return { taskId, status: 'cancel_requested' }; },
      recoverActiveTasks: async (options) => { calls.push(['recover', options.force]); return []; },
    },
  });
  assert.equal((await routes.GET_ACCOUNT_TASKS()).tasks.length, 1);
  assert.equal((await routes.GET_ACCOUNT_TASK_EVENTS({ taskId: 'task_a' })).events[0].taskId, 'task_a');
  assert.equal((await routes.CANCEL_ACCOUNT_TASK({ taskId: 'task_a' })).task.status, 'cancel_requested');
  assert.equal((await routes.DELETE_ACCOUNT_TASK({ taskId: 'task_a' })).task.status, 'succeeded');
  assert.equal((await routes.DELETE_COMPLETED_ACCOUNT_TASKS()).deletedCount, 2);
  await routes.RECOVER_ACCOUNT_TASKS();
  assert.deepEqual(calls, [
    ['events', 'task_a'],
    ['cancel', 'task_a'],
    ['delete', 'task_a'],
    ['remove-events', ['task_a']],
    ['clear'],
    ['remove-events', ['task_a', 'task_b']],
    ['recover', true],
  ]);
  await assert.rejects(routes.GET_ACCOUNT_TASK_EVENTS({}), /TASK_ID_REQUIRED/);
  await assert.rejects(routes.DELETE_ACCOUNT_TASK({}), /TASK_ID_REQUIRED/);
});
