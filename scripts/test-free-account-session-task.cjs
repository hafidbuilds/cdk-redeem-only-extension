const test = require('node:test');
const assert = require('node:assert/strict');

const taskApi = require('../background/free-account-session-fill-task.js');
const membershipRoutesApi = require('../background/routes/membership-routes.js');

test('membership routes expose start, resume, and stop Session fill messages', async () => {
  const calls = [];
  const routes = membershipRoutesApi.createMembershipRoutes({
    checkTrialEligibility: async () => ({}),
    fillFreeAccessTokens: async () => ({}),
    startFillSessions: async (payload) => { calls.push(['start', payload]); return { taskId: 'task_start' }; },
    resumeFillSessions: async (payload) => { calls.push(['resume', payload]); return { taskId: payload.taskId }; },
    stopFillSessions: async (payload) => { calls.push(['stop', payload]); return { stopped: true }; },
  });

  assert.equal((await routes.START_FILL_FREE_ACCOUNT_SESSIONS({ group: 'free' })).taskId, 'task_start');
  assert.equal((await routes.RESUME_FREE_ACCOUNT_SESSION_FILL({ taskId: 'task_resume' })).taskId, 'task_resume');
  assert.equal((await routes.STOP_FREE_ACCOUNT_SESSION_FILL({ taskId: 'task_stop' })).stopped, true);
  assert.deepEqual(calls, [
    ['start', { group: 'free' }],
    ['resume', { taskId: 'task_resume' }],
    ['stop', { taskId: 'task_stop' }],
  ]);
});

test('Session fill task returns immediately, checkpoints email-only progress, and downloads TXT in Background', async () => {
  let releaseFill;
  const fillGate = new Promise((resolve) => { releaseFill = resolve; });
  const checkpointPatches = [];
  const taskEvents = [];
  const downloads = [];
  const lifecycleCalls = [];
  const tasks = new Map();
  let executionPromise;
  const taskRuntime = {
    async startTask(input) {
      const task = { ...input, taskId: 'task_fill', status: 'running' };
      tasks.set(task.taskId, task);
      return task;
    },
    executeTask(_taskId, operation) {
      executionPromise = operation();
      return executionPromise;
    },
    createContext() {
      return {
        checkpoint: async (patch) => checkpointPatches.push(structuredClone(patch)),
        event: async (event) => taskEvents.push(structuredClone(event)),
        isCancelRequested: async () => false,
      };
    },
  };
  const service = {
    listSessionFillTargets: async () => ({ group: 'free', emails: ['one@example.test'], count: 1 }),
    async fillSessions(_input, hooks) {
      await hooks.onProgress({
        group: 'free',
        targetEmails: ['one@example.test'],
        completedEmails: [],
        failedEmails: ['one@example.test'],
        skippedEmails: [],
        nextIndex: 1,
        currentIndex: 1,
        progress: { current: 1, total: 1 },
        currentEmail: 'one@example.test',
        outcome: 'failed',
        errorCode: 'LOGIN_PAGE_TIMEOUT',
        errorMessage: '等待登录页面可操作状态超时。',
      });
      await hooks.onProgress({
        group: 'free',
        targetEmails: ['one@example.test'],
        completedEmails: [],
        failedEmails: [],
        skippedEmails: [],
        nextIndex: 0,
        currentIndex: 1,
        progress: { current: 1, total: 1 },
        currentEmail: 'one@example.test',
        outcome: 'processing',
      });
      await hooks.onProgress({
        group: 'free',
        targetEmails: ['one@example.test'],
        completedEmails: [],
        failedEmails: [],
        skippedEmails: [],
        nextIndex: 0,
        progress: { current: 0, total: 1 },
      });
      await fillGate;
      await hooks.onProgress({
        group: 'free',
        targetEmails: ['one@example.test'],
        completedEmails: ['one@example.test'],
        failedEmails: [],
        skippedEmails: [],
        nextIndex: 1,
        currentIndex: 1,
        progress: { current: 1, total: 1 },
        outcome: 'completed',
      });
      return {
        group: 'free',
        targetEmails: ['one@example.test'],
        completedEmails: ['one@example.test'],
        failedEmails: [],
        skippedEmails: [],
        nextIndex: 1,
      };
    },
    exportResults: async () => ({
      fileName: 'free-account-tool-free-session-fixture.txt',
      fileContent: 'one@example.test---{\"accessToken\":\"secret-at\"}\n',
      mimeType: 'text/plain;charset=utf-8',
    }),
  };
  const controller = taskApi.createFreeAccountSessionFillTaskController({
    chromeApi: { downloads: { download: async (input) => { downloads.push(input); return 17; } } },
    clearStopRequest: () => lifecycleCalls.push('clear-stop'),
    freeAccountService: service,
    taskRepository: { get: async (taskId) => tasks.get(taskId), list: async () => [...tasks.values()] },
    taskRuntime,
    logger: { error() {}, warn() {} },
  });

  const started = await controller.start({ group: 'free', onlyMissing: true, autoExport: true });
  assert.deepEqual(started, { taskId: 'task_fill', count: 1, group: 'free' });
  assert.equal(downloads.length, 0);
  assert.deepEqual(tasks.get('task_fill').payload, {
    group: 'free', includeVerificationUrl: true, onlyMissing: true, autoExport: true, targetEmails: ['one@example.test'],
  });
  releaseFill();
  const result = await executionPromise;

  assert.deepEqual(lifecycleCalls, ['clear-stop']);
  assert.equal(result.successCount, 1);
  assert.equal(result.downloadId, 17);
  assert.equal(result.fileContent, undefined);
  assert.equal(downloads.length, 1);
  assert.match(downloads[0].url, /^data:text\/plain;charset=utf-8,/);
  assert.equal(checkpointPatches.some((patch) => JSON.stringify(patch).includes('secret-at')), false);
  assert.equal(JSON.stringify(tasks.get('task_fill')).includes('secret-at'), false);
  assert.equal(taskEvents.some((event) => event.code === 'FREE_ACCOUNT_SESSION_PROCESSING'), true);
  assert.equal(taskEvents.some((event) => event.code === 'FREE_ACCOUNT_SESSION_COMPLETED'), true);
  assert.equal(taskEvents.some((event) => event.code === 'LOGIN_PAGE_TIMEOUT'), true);
  assert.equal(taskEvents.some((event) => event.message.includes('等待登录页面可操作状态超时')), true);
  assert.equal(taskEvents.every((event) => !JSON.stringify(event).includes('one@example.test')), true);
});

test('Session fill stop requests task cancellation and the login service stop flag', async () => {
  const calls = [];
  const task = { taskId: 'task_stop', type: 'fill_session', status: 'running' };
  const controller = taskApi.createFreeAccountSessionFillTaskController({
    chromeApi: {},
    freeAccountService: {
      listSessionFillTargets: async () => ({ emails: [] }),
      fillSessions: async () => ({}),
      requestStop: () => calls.push('service-stop'),
    },
    taskRepository: { get: async () => task, list: async () => [task] },
    taskRuntime: {
      startTask: async () => task,
      executeTask: async () => ({}),
      requestCancel: async () => { calls.push('task-cancel'); return { ...task, status: 'cancel_requested' }; },
    },
  });

  const result = await controller.stop({ taskId: 'task_stop' });
  assert.equal(result.stopped, true);
  assert.deepEqual(calls, ['service-stop', 'task-cancel']);
});
