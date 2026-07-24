const test = require('node:test');
const assert = require('node:assert/strict');

const { createUpiRedeemSubmissionResponse } = require('../background/steps/upi-redeem/submission-response.js');
const response = createUpiRedeemSubmissionResponse({
  normalizeString: (value = '') => String(value || '').trim(),
});

test('submission response reads JSON and text response bodies', async () => {
  assert.deepEqual(await response.readResponseBody({ text: async () => '{"ok":true}' }), { ok: true });
  assert.equal(await response.readResponseBody({ text: async () => '<html>bad gateway</html>' }), '<html>bad gateway</html>');
  assert.equal(await response.readResponseBody({ text: async () => '  ' }), null);
});

test('submission response extracts bounded payload errors', () => {
  assert.equal(response.getPayloadError({ success: false, message: 'declined' }), 'declined');
  assert.equal(response.getPayloadErrorDetails('  remote   failure  '), 'remote failure');
  assert.equal(response.getPayloadError({ ok: true }), '');
});

test('submission response classifies only explicit token expiry evidence', () => {
  assert.equal(response.isUpiAccessTokenExpiredPayload({ code: '10002' }, 401), true);
  assert.equal(response.isUpiAccessTokenExpiredPayload({ message: 'session expired' }, 500), true);
  assert.equal(response.isUpiAccessTokenExpiredPayload({ message: 'gateway timeout' }, 504), false);
});

test('submission response detects HTML by header or body', () => {
  assert.equal(response.isHtmlResponsePayload({ headers: { get: () => 'text/html' } }, ''), true);
  assert.equal(response.isHtmlResponsePayload({ headers: { get: () => 'application/json' } }, '<!doctype html>'), true);
  assert.equal(response.isHtmlResponsePayload({ headers: { get: () => 'application/json' } }, { ok: true }), false);
});
