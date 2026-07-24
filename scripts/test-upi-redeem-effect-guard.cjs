const test = require('node:test');
const assert = require('node:assert/strict');

require('../shared/task-schema.js');
const ledgerApi = require('../background/external-effect-ledger.js');
const guardApi = require('../background/steps/upi-redeem/effect-guard.js');

function createFixture() {
  const store = {};
  const chromeApi = { storage: { local: {
    async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter((key) => Object.hasOwn(store, key)).map((key) => [key, structuredClone(store[key])])); },
    async set(values) { Object.assign(store, structuredClone(values)); },
  } } };
  const ledger = ledgerApi.createExternalEffectLedger({ chromeApi, random: () => 0.125 });
  const calls = [];
  const resolutions = [];
  const context = {
    acquireResources: async (keys) => calls.push(['acquire', keys]),
    checkpoint: async (patch) => calls.push(['checkpoint', patch]),
    event: async (event) => calls.push(['event', event]),
    setStatus: async (status, patch) => calls.push(['status', status, patch]),
  };
  const taskRuntime = {
    createContext: () => context,
    async resolveRemoteTask(taskId, resolution) {
      resolutions.push({ taskId, resolution });
      return { taskId, status: resolution.outcome === 'confirmed' ? 'succeeded' : resolution.outcome };
    },
  };
  return { calls, guard: guardApi.createUpiRedeemEffectGuard({ ledger, taskRuntime }), ledger, resolutions, store };
}

test('effect guard persists prepare before dispatch and never emits a complete CDK', async () => {
  const fixture = createFixture();
  let handle = await fixture.guard.prepare({
    taskId: 'task-1',
    accountId: 'user@example.com',
    channel: 'upi',
    cdkey: 'UPI-SENSITIVE-1234',
  });
  handle = await fixture.guard.dispatched(handle);
  handle = await fixture.guard.acknowledged(handle, { data: { jobId: 'job-1' } });
  assert.deepEqual(fixture.calls[1][0], 'acquire');
  assert.match(fixture.calls[1][1][0], /^cdkey:upi:/);
  assert.doesNotMatch(JSON.stringify(fixture.calls), /UPI-SENSITIVE-1234/);
  assert.doesNotMatch(JSON.stringify(fixture.store), /UPI-SENSITIVE-1234/);
  assert.equal(handle.effect.status, 'acknowledged');
});

test('effect guard marks uncertain dispatch query-only and retains task locks', async () => {
  const fixture = createFixture();
  let handle = await fixture.guard.prepare({ taskId: 'task-1', accountId: 'user@example.com', channel: 'pix', cdkey: 'PIX-ONE' });
  handle = await fixture.guard.dispatched(handle);
  await fixture.guard.unknown(handle, Object.assign(new Error('timeout'), { code: 'REDEEM_REMOTE_STATUS_UNKNOWN' }));
  const effect = await fixture.ledger.get(handle.effect.effectId);
  assert.equal(effect.status, 'unknown');
  const waiting = fixture.calls.find((call) => call[0] === 'status' && call[1] === 'waiting_remote');
  assert.equal(waiting[2].checkpoint.locksReleased, false);
  assert.equal(waiting[2].checkpoint.remoteRequestSent, true);
});

test('effect guard refuses a second task for the same account channel and CDK', async () => {
  const fixture = createFixture();
  let first = await fixture.guard.prepare({ taskId: 'task-1', accountId: 'user@example.com', channel: 'ideal', cdkey: 'IDEAL-ONE' });
  first = await fixture.guard.dispatched(first);
  await assert.rejects(
    fixture.guard.prepare({ taskId: 'task-2', accountId: 'user@example.com', channel: 'ideal', cdkey: 'IDEAL-ONE' }),
    { code: 'REDEEM_DUPLICATE_DISPATCH_BLOCKED' }
  );
});

test('startup recovery queries status and confirms the persisted effect without redispatch', async () => {
  const fixture = createFixture();
  let handle = await fixture.guard.prepare({ taskId: 'task-1', accountId: 'user@example.com', channel: 'upi', cdkey: 'UPI-ONE' });
  handle = await fixture.guard.dispatched(handle);
  await fixture.guard.unknown(handle, Object.assign(new Error('timeout'), { code: 'REDEEM_REMOTE_STATUS_UNKNOWN' }));
  let state = { upiRedeemCdkeyUsage: { 'UPI-ONE': { remoteStatus: 'unknown' } } };
  let queryCount = 0;
  const recovered = await fixture.guard.recoverTask({ taskId: 'task-1', accountId: 'user@example.com', channel: 'upi' }, {
    getState: async () => state,
    refreshRemoteStatuses: async () => {
      queryCount += 1;
      state = { upiRedeemCdkeyUsage: { 'UPI-ONE': { remoteStatus: 'success', remoteJobId: 'job-1' } } };
      return { ok: true };
    },
  });
  assert.equal(queryCount, 1);
  assert.equal(recovered.outcome, 'confirmed');
  assert.equal((await fixture.ledger.get(handle.effect.effectId)).status, 'confirmed');
  assert.equal(fixture.resolutions[0].resolution.outcome, 'confirmed');
});

test('startup recovery sends an unresolved remote result to manual review and keeps the ledger blocking', async () => {
  const fixture = createFixture();
  let handle = await fixture.guard.prepare({ taskId: 'task-1', accountId: 'user@example.com', channel: 'pix', cdkey: 'PIX-ONE' });
  handle = await fixture.guard.dispatched(handle);
  await fixture.guard.unknown(handle, Object.assign(new Error('timeout'), { code: 'REDEEM_REMOTE_STATUS_UNKNOWN' }));
  const state = { pixChannelRedeemCdkeyUsage: { 'PIX-ONE': { remoteStatus: 'unknown' } } };
  const recovered = await fixture.guard.recoverTask({ taskId: 'task-1', accountId: 'user@example.com', channel: 'pix' }, {
    getState: async () => state,
    refreshRemoteStatuses: async () => ({ ok: false, errors: [{ channel: 'pix' }] }),
  });
  assert.equal(recovered.outcome, 'manual_review');
  assert.equal((await fixture.ledger.get(handle.effect.effectId)).status, 'unknown');
  assert.equal(fixture.resolutions[0].resolution.outcome, 'manual_review');
});
