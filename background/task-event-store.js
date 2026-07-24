(function attachTaskEventStore(root, factory) {
  const api = factory(root);
  root.MultiPageTaskEventStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createTaskEventStoreModule(root) {
  const STORAGE_KEY = 'accountTaskEventsV1';
  function createTaskEventStore({ chromeApi = root.chrome, maxPerTask = 100, now = () => new Date().toISOString() } = {}) {
    const redactor = root.MultiPageSensitiveDataRedactor || (typeof require === 'function' ? require('../shared/sensitive-data-redactor.js') : null);
    let queue = Promise.resolve();
    async function readRoot() { const stored = await chromeApi.storage.local.get([STORAGE_KEY]); const value = stored?.[STORAGE_KEY]; return { schemaVersion: 1, byTaskId: value?.byTaskId && typeof value.byTaskId === 'object' ? value.byTaskId : {}, updatedAt: value?.updatedAt || '' }; }
    function append(input = {}) { const run = queue.then(async () => { const taskId = String(input.taskId || '').trim(); if (!taskId) throw new Error('TASK_EVENT_TASK_ID_REQUIRED'); const rootValue = await readRoot(); const createdAt = now(); const event = redactor.redactSensitiveData({ eventId: String(input.eventId || `event_${Date.parse(createdAt)}_${Math.random().toString(36).slice(2, 8)}`), taskId, type: String(input.type || 'state'), level: String(input.level || 'info'), code: String(input.code || ''), nodeId: String(input.nodeId || ''), message: redactor.redactText(input.message || ''), detail: input.detail && typeof input.detail === 'object' ? input.detail : {}, createdAt }); const current = Array.isArray(rootValue.byTaskId[taskId]) ? rootValue.byTaskId[taskId] : []; const nextEvents = [...current, event]; const trimmed = nextEvents.length <= maxPerTask ? nextEvents : [{ eventId: `summary_${taskId}`, taskId, type: 'summary', level: 'info', code: 'EVENTS_COMPACTED', nodeId: '', message: `${nextEvents.length - maxPerTask + 1} earlier events compacted`, detail: { compactedCount: nextEvents.length - maxPerTask + 1 }, createdAt: nextEvents[nextEvents.length - maxPerTask].createdAt }, ...nextEvents.slice(-(maxPerTask - 1))]; const next = { schemaVersion: 1, byTaskId: { ...rootValue.byTaskId, [taskId]: trimmed }, updatedAt: createdAt }; await chromeApi.storage.local.set({ [STORAGE_KEY]: next }); return event; }); queue = run.catch(() => {}); return run; }
    async function list(taskId) { return [...((await readRoot()).byTaskId[String(taskId || '').trim()] || [])]; }
    return { append, list, readRoot };
  }
  return { STORAGE_KEY, createTaskEventStore };
});
