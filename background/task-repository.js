(function attachTaskRepository(root, factory) {
  const api = factory(root);
  root.MultiPageTaskRepository = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createTaskRepositoryModule(root) {
  const STORAGE_KEY = 'accountTasksV1';
  function createTaskRepository({ chromeApi = root.chrome, maxCompleted = 100, now = () => new Date().toISOString() } = {}) {
    const schema = root.MultiPageTaskSchema || (typeof require === 'function' ? require('../shared/task-schema.js') : null);
    const redactor = root.MultiPageSensitiveDataRedactor || (typeof require === 'function' ? require('../shared/sensitive-data-redactor.js') : null);
    let queue = Promise.resolve();
    async function readRoot() { const stored = await chromeApi.storage.local.get([STORAGE_KEY]); const value = stored?.[STORAGE_KEY]; return { schemaVersion: 1, items: value?.items && typeof value.items === 'object' ? value.items : {}, updatedAt: value?.updatedAt || '' }; }
    function enqueue(fn) { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; }
    function prune(items) {
      const active = []; const completed = [];
      Object.values(items).forEach((task) => (schema.TERMINAL_STATUSES.has(task.status) ? completed : active).push(task));
      completed.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      return Object.fromEntries([...active, ...completed.slice(0, maxCompleted)].map((task) => [task.taskId, task]));
    }
    async function write(task) { const rootValue = await readRoot(); const normalized = schema.normalizeTask(task, { now: now() }); if (!normalized) throw new Error('TASK_INVALID'); const safeTask = redactor.redactSensitiveData(normalized); const next = { schemaVersion: 1, items: prune({ ...rootValue.items, [safeTask.taskId]: safeTask }), updatedAt: safeTask.updatedAt }; await chromeApi.storage.local.set({ [STORAGE_KEY]: next }); return safeTask; }
    async function save(task) { return enqueue(() => write(task)); }
    async function create(input) { return save(schema.normalizeTask({ ...input, status: input.status || 'pending' }, { now: now() })); }
    async function patch(taskId, patchValue = {}) { return enqueue(async () => { const task = (await readRoot()).items[String(taskId || '').trim()] || null; if (!task) throw new Error('TASK_NOT_FOUND'); const timestamp = now(); const status = patchValue.status ? schema.normalizeStatus(patchValue.status) : task.status; return write({ ...task, ...patchValue, taskId: task.taskId, status, checkpoint: { ...task.checkpoint, ...(patchValue.checkpoint || {}) }, workflowSnapshot: { ...task.workflowSnapshot, ...(patchValue.workflowSnapshot || {}) }, updatedAt: timestamp, startedAt: task.startedAt || (status === 'running' ? timestamp : ''), finishedAt: schema.TERMINAL_STATUSES.has(status) ? timestamp : '' }); }); }
    async function get(taskId) { return (await readRoot()).items[String(taskId || '').trim()] || null; }
    async function list() { return Object.values((await readRoot()).items).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)); }
    async function listActive() { return (await list()).filter((task) => !schema.TERMINAL_STATUSES.has(task.status)); }
    return { create, get, list, listActive, patch, readRoot, save };
  }
  return { STORAGE_KEY, createTaskRepository };
});
