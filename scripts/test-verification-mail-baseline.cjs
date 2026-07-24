const test = require('node:test');
const assert = require('node:assert/strict');

const baseline = require('../background/verification/mail-baseline.js');

test('baseline rejects known and consumed messages without storing body text', () => {
  const oldMessage = { id: 'old-1', subject: 'ChatGPT verification code', bodyPreview: '123456', receivedAt: Date.now() - 1000 };
  const nextMessage = { id: 'new-1', subject: 'ChatGPT verification code', bodyPreview: '654321', receivedAt: Date.now() + 1000 };
  const state = baseline.createBaseline({ requestedAt: Date.now(), knownMessageIds: ['old-1'] });
  assert.equal(baseline.isMessageFresh(oldMessage, state), false);
  assert.equal(baseline.isMessageFresh(nextMessage, state), true);
  const consumed = baseline.markConsumed(state, nextMessage);
  assert.equal(baseline.isMessageFresh(nextMessage, consumed), false);
  assert.doesNotMatch(JSON.stringify(consumed), /654321/);
});

test('baseline fingerprint is stable when provider has no message id', () => {
  const message = { subject: 'ChatGPT verification code', sender: 'no-reply@openai.com', bodyPreview: 'code hidden', receivedAt: 1700000000000 };
  assert.equal(baseline.getMessageFingerprint(message), baseline.getMessageFingerprint({ ...message }));
  assert.match(baseline.getMessageFingerprint(message), /^mail:fnv1a_[0-9a-f]{8}$/);
});
