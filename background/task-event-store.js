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
    function compactEvents(events, taskId) {
      if (events.length <= maxPerTask) return events;
      const priorCompactedCount = events
        .filter((event) => event?.code === 'EVENTS_COMPACTED')
        .reduce((total, event) => total + Math.max(0, Math.floor(Number(event?.detail?.compactedCount) || 0)), 0);
      const candidates = events.filter((event) => event?.code !== 'EVENTS_COMPACTED');
      if (maxPerTask <= 1) return [candidates.filter((event) => event?.level === 'error').at(-1) || candidates.at(-1)];
      const capacity = maxPerTask - 1;
      const indexed = candidates.map((event, index) => ({ event, index }));
      const failures = indexed.filter(({ event }) => event?.level === 'error').slice(-capacity);
      const selectedIndexes = new Set(failures.map(({ index }) => index));
      const remainingCapacity = capacity - failures.length;
      const recent = remainingCapacity > 0
        ? indexed.filter(({ index }) => !selectedIndexes.has(index)).slice(-remainingCapacity)
        : [];
      const selected = [...failures, ...recent].sort((left, right) => left.index - right.index);
      const compactedCount = priorCompactedCount + candidates.length - selected.length;
      const firstRetainedAt = selected[0]?.event?.createdAt || candidates.at(-1)?.createdAt || now();
      return [{
        eventId: `summary_${taskId}`,
        taskId,
        type: 'summary',
        level: 'info',
        code: 'EVENTS_COMPACTED',
        nodeId: '',
        message: `${compactedCount} earlier events compacted; recent failure events were retained`,
        detail: { compactedCount, failureCount: failures.length },
        createdAt: firstRetainedAt,
      }, ...selected.map(({ event }) => event)];
    }
    function append(input = {}) { const run = queue.then(async () => { const taskId = String(input.taskId || '').trim(); if (!taskId) throw new Error('TASK_EVENT_TASK_ID_REQUIRED'); const rootValue = await readRoot(); const createdAt = now(); const event = redactor.redactSensitiveData({ eventId: String(input.eventId || `event_${Date.parse(createdAt)}_${Math.random().toString(36).slice(2, 8)}`), taskId, type: String(input.type || 'state'), level: String(input.level || 'info'), code: String(input.code || ''), nodeId: String(input.nodeId || ''), message: redactor.redactText(input.message || ''), detail: input.detail && typeof input.detail === 'object' ? input.detail : {}, createdAt }); const current = Array.isArray(rootValue.byTaskId[taskId]) ? rootValue.byTaskId[taskId] : []; const trimmed = compactEvents([...current, event], taskId); const next = { schemaVersion: 1, byTaskId: { ...rootValue.byTaskId, [taskId]: trimmed }, updatedAt: createdAt }; await chromeApi.storage.local.set({ [STORAGE_KEY]: next }); return event; }); queue = run.catch(() => {}); return run; }
    async function list(taskId) { return [...((await readRoot()).byTaskId[String(taskId || '').trim()] || [])]; }
    function removeMany(taskIds = []) {
      const run = queue.then(async () => {
        const ids = new Set((Array.isArray(taskIds) ? taskIds : [taskIds]).map((value) => String(value || '').trim()).filter(Boolean));
        if (!ids.size) return { deletedCount: 0 };
        const rootValue = await readRoot();
        const byTaskId = { ...rootValue.byTaskId };
        let deletedCount = 0;
        ids.forEach((taskId) => {
          if (!Object.hasOwn(byTaskId, taskId)) return;
          delete byTaskId[taskId];
          deletedCount += 1;
        });
        if (deletedCount) {
          await chromeApi.storage.local.set({
            [STORAGE_KEY]: { schemaVersion: 1, byTaskId, updatedAt: now() },
          });
        }
        return { deletedCount };
      });
      queue = run.catch(() => {});
      return run;
    }
    return { append, list, readRoot, removeMany };
  }
  return { STORAGE_KEY, createTaskEventStore };
});
