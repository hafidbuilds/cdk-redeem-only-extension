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
    taskId: 'task_a', type: 'check_eligibility', accountId: 'user@example.com',
    status: 'running', nodeId: 'check', progress: { current: 1, total: 2 },
    updatedAt: '2026-07-25T08:00:00.000Z',
  });
  assert.equal(view.typeLabel, '资格复检');
  assert.equal(view.progressLabel, '1/2');
  assert.equal(view.canCancel, true);
  assert.equal(view.canDelete, false);
  assert.equal(viewModel.toTaskView({ status: 'succeeded' }).canDelete, true);
  assert.equal(viewModel.toTaskView({ type: 'fill_session' }).typeLabel, '补充 Session');
});

test('Session task view distinguishes partial completion and download failure', () => {
  const partial = viewModel.toTaskView({ type: 'fill_session', status: 'succeeded', result: { partialFailure: true } });
  const downloadFailed = viewModel.toTaskView({ type: 'fill_session', status: 'succeeded', result: { downloadStatus: 'failed' } });
  assert.equal(partial.statusLabel, '完成，部分失败');
  assert.equal(downloadFailed.statusLabel, '完成，下载失败');
});

test('task event view translates common lifecycle events into Chinese', () => {
  assert.equal(viewModel.toEventView({ code: 'TASK_STARTED', message: 'Task started' }).message, '任务已开始。');
  assert.equal(viewModel.toEventView({ code: 'TASK_RECOVERY_RESUME_SAFE', message: 'Recovery decision: resume_safe' }).message, '检测到任务可以安全继续。');
  assert.equal(viewModel.toEventView({ code: 'TASK_RESUMED', message: 'Task resumed' }).message, '任务已继续运行。');
});

test('running Session task shows the active account position and outcome counts', () => {
  const view = viewModel.toTaskView({
    taskId: 'task_live',
    type: 'fill_session',
    status: 'running',
    progress: { current: 1, total: 120 },
    checkpoint: {
      currentIndex: 1,
      lastOutcome: 'processing',
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
    },
  });

  assert.equal(view.progressLabel, '处理中 1/120 · 成功 0 · 失败 0');
});

test('task panel controller refreshes visibly and calls event, cancel, and delete routes', async () => {
  const calls = [];
  const dom = {
    accountTaskList: eventTarget(),
    accountTaskEvents: eventTarget({ hidden: true }),
    accountTaskMeta: { textContent: '' },
    btnRefreshAccountTasks: eventTarget({
      disabled: false,
      classList: { toggle() {} },
      setAttribute() {},
    }),
    btnClearAccountTasks: eventTarget({ disabled: false }),
    btnOpenAccountRecords: eventTarget(),
  };
  const controller = controllerApi.createTaskPanelController({
    dom,
    now: () => new Date('2026-08-05T04:05:06.000Z'),
    confirmAction: () => true,
    async sendMessage(message) {
      calls.push(message.type);
      if (message.type === 'GET_ACCOUNT_TASKS') {
        return { tasks: [{ taskId: 'task_a', type: 'register', status: 'succeeded' }] };
      }
      if (message.type === 'GET_ACCOUNT_TASK_EVENTS') return { events: [{ taskId: 'task_a', code: 'START' }] };
      if (message.type === 'DELETE_COMPLETED_ACCOUNT_TASKS') return { deletedCount: 1 };
      return { task: { taskId: 'task_a', status: 'cancel_requested' } };
    },
  });
  await controller.refresh();
  await controller.showEvents('task_a');
  await controller.cancel('task_a');
  await controller.deleteTask('task_a');
  await controller.clearCompleted();
  assert.deepEqual(calls, [
    'GET_ACCOUNT_TASKS',
    'GET_ACCOUNT_TASK_EVENTS',
    'CANCEL_ACCOUNT_TASK',
    'GET_ACCOUNT_TASKS',
    'GET_ACCOUNT_TASK_EVENTS',
    'DELETE_ACCOUNT_TASK',
    'GET_ACCOUNT_TASKS',
    'DELETE_COMPLETED_ACCOUNT_TASKS',
    'GET_ACCOUNT_TASKS',
  ]);
  assert.match(dom.accountTaskMeta.textContent, /^最近 1 个 · 已刷新 /);
  assert.equal(dom.btnClearAccountTasks.disabled, false);
  assert.equal(dom.accountTaskEvents.hidden, true);
  assert.equal(renders.filter(([type]) => type === 'events').length, 2);
});

test('task event delegated click opens the event panel and brings it into view', async () => {
  let listClickHandler = null;
  let scrolled = 0;
  const calls = [];
  const taskRow = { dataset: { taskId: 'task_live' } };
  const eventsButton = {
    dataset: { taskAction: 'events' },
    closest(selector) {
      if (selector === '[data-task-action]') return this;
      if (selector === '[data-task-id]') return taskRow;
      return null;
    },
  };
  const dom = {
    accountTaskList: eventTarget({
      addEventListener(type, handler) {
        if (type === 'click') listClickHandler = handler;
      },
    }),
    accountTaskEvents: eventTarget({
      hidden: true,
      scrollIntoView() { scrolled += 1; },
    }),
    accountTaskMeta: { textContent: '' },
    btnRefreshAccountTasks: eventTarget({
      disabled: false,
      classList: { toggle() {} },
      setAttribute() {},
    }),
    btnClearAccountTasks: eventTarget({ disabled: false }),
    btnOpenAccountRecords: eventTarget(),
  };
  const controller = controllerApi.createTaskPanelController({
    dom,
    async sendMessage(message) {
      calls.push(message.type);
      if (message.type === 'GET_ACCOUNT_TASKS') {
        return { tasks: [{ taskId: 'task_live', type: 'fill_session', status: 'running' }] };
      }
      return { events: [{ taskId: 'task_live', code: 'TASK_STARTED', message: 'Task started' }] };
    },
  });

  await controller.refresh();
  listClickHandler({ target: eventsButton });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls, ['GET_ACCOUNT_TASKS', 'GET_ACCOUNT_TASK_EVENTS']);
  assert.equal(dom.accountTaskEvents.hidden, false);
  assert.equal(scrolled, 1);
});

test('task panel polls while the account panel is open and replaces a stale interrupted snapshot', async () => {
  let timerCallback = null;
  let refreshCount = 0;
  const dom = {
    accountRecordsOverlay: { hidden: false },
    accountTaskList: eventTarget(),
    accountTaskEvents: eventTarget({ hidden: true }),
    accountTaskMeta: { textContent: '' },
    btnRefreshAccountTasks: eventTarget({
      disabled: false,
      classList: { toggle() {} },
      setAttribute() {},
    }),
    btnClearAccountTasks: eventTarget({ disabled: false }),
    btnOpenAccountRecords: eventTarget(),
  };
  const controller = controllerApi.createTaskPanelController({
    dom,
    setTimer(callback) {
      timerCallback = callback;
      return 1;
    },
    clearTimer() {},
    async sendMessage(message) {
      if (message.type !== 'GET_ACCOUNT_TASKS') return { events: [] };
      refreshCount += 1;
      if (refreshCount === 1) {
        return { tasks: [{ taskId: 'task_resume', type: 'fill_session', status: 'interrupted', progress: { current: 0, total: 120 } }] };
      }
      return {
        tasks: [{
          taskId: 'task_resume',
          type: 'fill_session',
          status: 'running',
          progress: { current: 19, total: 120 },
          checkpoint: { currentIndex: 19, lastOutcome: 'processing', successCount: 0, failedCount: 18, skippedCount: 0 },
        }],
      };
    },
  });

  await controller.refresh();
  assert.equal(typeof timerCallback, 'function');
  await timerCallback();

  const latestTasks = renders.filter(([type]) => type === 'tasks').at(-1)[1];
  assert.equal(latestTasks[0].status, 'running');
  assert.equal(viewModel.toTaskView(latestTasks[0]).progressLabel, '处理中 19/120 · 成功 0 · 失败 18');
});

test('task panel polling refreshes the currently open event stream', async () => {
  let timerCallback = null;
  let eventRequestCount = 0;
  const renderStart = renders.length;
  const dom = {
    accountRecordsOverlay: { hidden: false },
    accountTaskList: eventTarget(),
    accountTaskEvents: eventTarget({ hidden: true, scrollIntoView() {} }),
    accountTaskMeta: { textContent: '' },
    btnRefreshAccountTasks: eventTarget({
      disabled: false,
      classList: { toggle() {} },
      setAttribute() {},
    }),
    btnClearAccountTasks: eventTarget({ disabled: false }),
    btnOpenAccountRecords: eventTarget(),
  };
  const controller = controllerApi.createTaskPanelController({
    dom,
    setTimer(callback) {
      timerCallback = callback;
      return 1;
    },
    clearTimer() {},
    async sendMessage(message) {
      if (message.type === 'GET_ACCOUNT_TASKS') {
        return { tasks: [{ taskId: 'task_live', type: 'fill_session', status: 'running' }] };
      }
      if (message.type === 'GET_ACCOUNT_TASK_EVENTS') {
        eventRequestCount += 1;
        return { events: [{ taskId: 'task_live', code: `EVENT_${eventRequestCount}` }] };
      }
      return {};
    },
  });

  await controller.refresh();
  await controller.showEvents('task_live');
  await timerCallback();

  assert.equal(eventRequestCount, 2);
  const eventRenders = renders.slice(renderStart).filter(([type]) => type === 'events');
  assert.equal(eventRenders.length, 2);
  assert.equal(eventRenders.at(-1)[2][0].code, 'EVENT_2');
  assert.equal(dom.accountTaskEvents.hidden, false);
});
