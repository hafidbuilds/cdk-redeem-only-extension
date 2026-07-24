const test = require('node:test');
const assert = require('node:assert/strict');

require('../shared/sensitive-data-redactor.js');
const eventStoreApi = require('../background/task-event-store.js');

function createStorage() {
  const store = {};
  return { store, chromeApi: { storage: { local: {
    async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter((key) => Object.hasOwn(store, key)).map((key) => [key, structuredClone(store[key])])); },
    async set(values) { Object.assign(store, structuredClone(values)); },
  } } } };
}

test('task events remain isolated by taskId and redact nested secrets', async () => {
  const storage = createStorage();
  const events = eventStoreApi.createTaskEventStore({ chromeApi: storage.chromeApi });
  await events.append({ taskId: 'task_a', message: 'Bearer secret-token-123456', detail: { password: 'secret-password' } });
  await events.append({ taskId: 'task_b', message: 'other' });
  const first = await events.list('task_a');
  assert.equal(first.length, 1);
  assert.doesNotMatch(JSON.stringify(first), /secret-token-123456|secret-password/);
  assert.equal((await events.list('task_b')).length, 1);
});

test('task event store compacts early events per task', async () => {
  const storage = createStorage();
  let tick = 0;
  const events = eventStoreApi.createTaskEventStore({ chromeApi: storage.chromeApi, maxPerTask: 3, now: () => new Date(1721894400000 + tick++).toISOString() });
  for (let index = 0; index < 5; index += 1) await events.append({ taskId: 'task_a', code: `E${index}` });
  const saved = await events.list('task_a');
  assert.equal(saved.length, 3);
  assert.equal(saved[0].code, 'EVENTS_COMPACTED');
  assert.deepEqual(saved.slice(1).map((event) => event.code), ['E3', 'E4']);
});
