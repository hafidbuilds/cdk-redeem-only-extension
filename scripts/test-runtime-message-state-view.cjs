const test = require('node:test');
const assert = require('node:assert/strict');

const dispatcherApi = require('../background/router/message-dispatcher.js');

test('runtime state message view omits canonical account payloads that can exceed Chrome message limits', () => {
  assert.equal(typeof dispatcherApi.buildRuntimeStateMessageView, 'function');
  const state = {
    autoStepDelaySeconds: 7,
    customEmailPoolEntries: [{ email: 'pool@example.test' }],
    freeAccountResults: { total: 100, items: [{ email: 'free@example.test', session: { large: 'x'.repeat(1024) } }] },
    accountRecordsV2: { items: { 'free@example.test': { id: 'free@example.test' } } },
  };

  const view = dispatcherApi.buildRuntimeStateMessageView(state);

  assert.equal(view.autoStepDelaySeconds, 7);
  assert.deepEqual(view.customEmailPoolEntries, [{ email: 'pool@example.test' }]);
  assert.equal(Object.hasOwn(view, 'freeAccountResults'), false);
  assert.equal(Object.hasOwn(view, 'accountRecordsV2'), false);
  assert.equal(view.freeAccountSummary.total, 1);
  assert.equal(view.accountRecordsSummary.total, 1);
});

test('runtime response compaction applies to direct GET_STATE and nested state envelopes', () => {
  assert.equal(typeof dispatcherApi.compactRuntimeMessageResponse, 'function');
  const state = {
    autoStepDelaySeconds: 7,
    freeAccountResults: { items: [{ email: 'free@example.test' }] },
    accountRecordsV2: { items: { 'free@example.test': {} } },
  };

  const direct = dispatcherApi.compactRuntimeMessageResponse({ type: 'GET_STATE' }, state);
  assert.equal(direct.autoStepDelaySeconds, 7);
  assert.equal(Object.hasOwn(direct, 'freeAccountResults'), false);
  assert.equal(dispatcherApi.compactRuntimeMessageResponse({ type: 'GET_STATE' }, direct).freeAccountSummary.total, 1);

  const envelope = dispatcherApi.compactRuntimeMessageResponse({ type: 'SAVE_SETTING' }, { ok: true, state });
  assert.equal(envelope.ok, true);
  assert.equal(envelope.state.autoStepDelaySeconds, 7);
  assert.equal(Object.hasOwn(envelope.state, 'freeAccountResults'), false);
});
