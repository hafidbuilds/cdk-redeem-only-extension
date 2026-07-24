const test = require('node:test');
const assert = require('node:assert/strict');
const { createRemoteOperationPolicy, clampConcurrency, parseRetryAfter } = require('../background/runtime/remote-operation-policy.js');

function harness(options = {}) {
  const local = {};
  return createRemoteOperationPolicy({
    chromeApi: { storage: { local: { get: async () => local, set: async (value) => Object.assign(local, value) } } },
    cooldownMs: 100,
    stopOnConsecutiveErrors: 2,
    ...options,
  });
}

test('clamps independent query concurrency and parses Retry-After', () => {
  assert.equal(clampConcurrency(99), 5);
  assert.equal(clampConcurrency(0), 3);
  assert.equal(parseRetryAfter('2'), 2000);
  assert.equal(parseRetryAfter('not-a-date'), 0);
});

test('mapWithConcurrency never exceeds the configured limit', async () => {
  const policy = harness();
  let active = 0;
  let peak = 0;
  const result = await policy.mapWithConcurrency([1, 2, 3, 4, 5], async (value) => {
    active += 1; peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return value * 2;
  }, 2);
  assert.deepEqual(result, [2, 4, 6, 8, 10]);
  assert.equal(peak, 2);
});

test('circuit state is isolated and persists across policy instances', async () => {
  const local = {};
  let calls = 0;
  const make = () => createRemoteOperationPolicy({
    chromeApi: { storage: { local: { get: async () => local, set: async (value) => Object.assign(local, value) } } },
    cooldownMs: 10000,
    stopOnConsecutiveErrors: 2,
    maxAttempts: 1,
  });
  const policy = make();
  await assert.rejects(() => policy.execute('provider:a', async () => { calls += 1; throw Object.assign(new Error('503'), { status: 503 }); }), /503/);
  await assert.rejects(() => policy.execute('provider:a', async () => { calls += 1; throw Object.assign(new Error('503'), { status: 503 }); }), /503/);
  assert.equal((await policy.getState('provider:a')).state, 'open');
  await assert.rejects(() => policy.execute('provider:a', async () => { calls += 1; }), /冷却/);
  assert.equal(calls, 2);
  assert.equal((await make().getState('provider:a')).state, 'open');
  assert.equal((await policy.getState('provider:b')).state, 'closed');
});

test('retry-after is respected before a retry', async () => {
  const policy = harness({ maxAttempts: 2, random: () => 0 });
  let calls = 0;
  const started = Date.now();
  const result = await policy.execute('channel:upi', async () => {
    calls += 1;
    if (calls === 1) throw Object.assign(new Error('limited'), { status: 429, retryAfterMs: 8 });
    return 'ok';
  });
  assert.equal(result, 'ok');
  assert.equal(calls, 2);
  assert.ok(Date.now() - started >= 8);
});
