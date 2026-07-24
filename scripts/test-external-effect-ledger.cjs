const test = require('node:test');
const assert = require('node:assert/strict');

require('../shared/task-schema.js');
const ledgerApi = require('../background/external-effect-ledger.js');

function createLedger() {
  const store = {};
  let tick = 0;
  const chromeApi = { storage: { local: {
    async get(keys) {
      return Object.fromEntries((Array.isArray(keys) ? keys : [keys])
        .filter((key) => Object.hasOwn(store, key))
        .map((key) => [key, structuredClone(store[key])]));
    },
    async set(values) { Object.assign(store, structuredClone(values)); },
  } } };
  const ledger = ledgerApi.createExternalEffectLedger({
    chromeApi,
    now: () => new Date(Date.UTC(2026, 6, 25, 0, 0, tick++)).toISOString(),
    random: () => 0.25,
  });
  return { ledger, store };
}

test('redeem effect persists prepared through confirmed without storing the CDK', async () => {
  const { ledger, store } = createLedger();
  const prepared = await ledger.prepareRedeem({
    taskId: 'task-1',
    accountId: 'User@Example.com',
    channel: 'pix',
    cdkey: 'PIX-SECRET-1234',
  });
  assert.equal(prepared.effect.status, 'prepared');
  assert.match(prepared.effect.resourceFingerprint, /^fnv1a_[0-9a-f]{8}$/);
  await ledger.markDispatched(prepared.effect.effectId);
  await ledger.acknowledge(prepared.effect.effectId, { remoteJobId: 'job-123' });
  const confirmed = await ledger.confirm(prepared.effect.effectId, { remoteJobId: 'job-123' });
  assert.equal(confirmed.effect.status, 'confirmed');
  assert.equal(confirmed.attempt.finalStatus, 'confirmed');
  assert.doesNotMatch(JSON.stringify(store), /PIX-SECRET-1234/);
});

test('active redeem activity blocks duplicate task dispatch and preserves channel isolation', async () => {
  const { ledger } = createLedger();
  const upi = await ledger.prepareRedeem({ taskId: 'task-upi', accountId: 'user@example.com', channel: 'upi', cdkey: 'SAME-CDK' });
  await ledger.markDispatched(upi.effect.effectId);
  const duplicate = await ledger.prepareRedeem({ taskId: 'task-other', accountId: 'user@example.com', channel: 'upi', cdkey: 'SAME-CDK' });
  const pix = await ledger.prepareRedeem({ taskId: 'task-pix', accountId: 'user@example.com', channel: 'pix', cdkey: 'SAME-CDK' });
  const ideal = await ledger.prepareRedeem({ taskId: 'task-ideal', accountId: 'user@example.com', channel: 'ideal', cdkey: 'SAME-CDK' });
  assert.equal(duplicate.reused, true);
  assert.equal(duplicate.canDispatch, false);
  assert.equal(duplicate.effect.effectId, upi.effect.effectId);
  assert.equal(pix.reused, false);
  assert.equal(pix.canDispatch, true);
  assert.equal(ideal.reused, false);
  assert.equal(ideal.canDispatch, true);
});

test('unknown effect is query-only across ledger recreation', async () => {
  const fixture = createLedger();
  const prepared = await fixture.ledger.prepareRedeem({ taskId: 'task-1', accountId: 'user@example.com', channel: 'ideal', cdkey: 'IDEAL-ONE' });
  await fixture.ledger.markDispatched(prepared.effect.effectId);
  await fixture.ledger.markUnknown(prepared.effect.effectId);
  const rebuilt = ledgerApi.createExternalEffectLedger({
    chromeApi: { storage: { local: {
      async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter((key) => Object.hasOwn(fixture.store, key)).map((key) => [key, structuredClone(fixture.store[key])])); },
      async set(values) { Object.assign(fixture.store, structuredClone(values)); },
    } } },
  });
  const resumed = await rebuilt.prepareRedeem({ taskId: 'task-1', accountId: 'user@example.com', channel: 'ideal', cdkey: 'IDEAL-ONE' });
  assert.equal(resumed.effect.status, 'unknown');
  assert.equal(resumed.canDispatch, false);
});

test('explicitly failed effect permits a later safe attempt', async () => {
  const { ledger } = createLedger();
  const first = await ledger.prepareRedeem({ taskId: 'task-1', accountId: 'user@example.com', channel: 'upi', cdkey: 'UPI-ONE' });
  await ledger.fail(first.effect.effectId, { errorCode: 'REDEEM_REMOTE_REJECTED' });
  const second = await ledger.prepareRedeem({ taskId: 'task-2', accountId: 'user@example.com', channel: 'upi', cdkey: 'UPI-ONE' });
  assert.equal(second.reused, false);
  assert.notEqual(second.effect.effectId, first.effect.effectId);
});
