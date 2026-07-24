const test = require('node:test');
const assert = require('node:assert/strict');

const renders = [];
globalThis.SidepanelTaskEventRenderer = {
  renderTasks(_container, tasks) { renders.push(['tasks', tasks]); },
  renderEvents(_container, task, events) { renders.push(['events', task, events]); },
};
const viewModel = require('../sidepanel/task-event-view-model.js');
const controllerApi = require('../sidepanel/task-panel-controller.js');

function eventTarget(extra = {}) {
  return { addEventListener() {}, ...extra };
}

test('task view model exposes required task status details without secrets', () => {
  const view = viewModel.toTaskView({
    taskId: 'task_a', type: 'redeem', accountId: 'user@example.com', channel: 'pix',
    status: 'waiting_remote', nodeId: 'submit', progress: { current: 1, total: 2 },
    errorCode: 'REMOTE_PENDING', updatedAt: '2026-07-25T08:00:00.000Z',
  });
  assert.equal(view.typeLabel, 'CDK 兑换');
  assert.equal(view.channelLabel, 'PIX');
  assert.equal(view.progressLabel, '1/2');
  assert.equal(view.canCancel, true);
});

test('task panel controller calls task list, event, and cancellation routes', async () => {
  const calls = [];
  const dom = {
    accountTaskList: eventTarget(),
    accountTaskEvents: eventTarget({ hidden: true }),
    accountTaskMeta: { textContent: '' },
    btnRefreshAccountTasks: eventTarget(),
    btnOpenAccountRecords: eventTarget(),
  };
  const controller = controllerApi.createTaskPanelController({
    dom,
    async sendMessage(message) {
      calls.push(message.type);
      if (message.type === 'GET_ACCOUNT_TASKS') return { tasks: [{ taskId: 'task_a', type: 'register' }] };
      if (message.type === 'GET_ACCOUNT_TASK_EVENTS') return { events: [{ taskId: 'task_a', code: 'START' }] };
      return { task: { taskId: 'task_a', status: 'cancel_requested' } };
    },
  });
  await controller.refresh();
  await controller.showEvents('task_a');
  await controller.cancel('task_a');
  assert.deepEqual(calls, ['GET_ACCOUNT_TASKS', 'GET_ACCOUNT_TASK_EVENTS', 'CANCEL_ACCOUNT_TASK', 'GET_ACCOUNT_TASKS']);
  assert.equal(dom.accountTaskMeta.textContent, '最近 1 个');
  assert.equal(renders.filter(([type]) => type === 'events').length, 1);
});
