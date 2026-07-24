const test = require('node:test');
const assert = require('node:assert/strict');

const submissionApi = require('../background/steps/upi-redeem/channel-submission.js');
const sessionMaterialApi = require('../background/steps/upi-redeem/session-material.js');

function createSubmission(handler) {
  const requests = [];
  const normalizeString = (value = '') => String(value ?? '').trim();
  const sessionMaterial = sessionMaterialApi.createUpiRedeemSessionMaterial({
    constants: { UPI_ACCESS_TOKEN_EXPIRED_ERROR_PREFIX: 'UPI_ACCESS_TOKEN_EXPIRED::' },
    normalizeString,
    now: Date.now,
  });
  const submission = submissionApi.createUpiRedeemChannelSubmission({
    constants: {
      UPI_REDEEM_TIMEOUT_MS: 1000,
      UPI_REDEEM_BACKEND_FAILED_ERROR_PREFIX: 'UPI_REDEEM_BACKEND_FAILED::',
      UPI_REDEEM_AUTH_ERROR_PREFIX: 'UPI_REDEEM_AUTH_ERROR::',
      UPI_REDEEM_DUPLICATE_CDK_ERROR_PREFIX: 'UPI_REDEEM_DUPLICATE_CDK::',
      UPI_REDEEM_NOT_ACCEPTED_ERROR_PREFIX: 'UPI_REDEEM_NOT_ACCEPTED::',
      UPI_REDEEM_NETWORK_ERROR_PREFIX: 'UPI_REDEEM_NETWORK::',
      REDEEM_REMOTE_STATUS_UNKNOWN_ERROR_PREFIX: 'REDEEM_REMOTE_STATUS_UNKNOWN::',
      UPI_ACCESS_TOKEN_EXPIRED_ERROR_PREFIX: 'UPI_ACCESS_TOKEN_EXPIRED::',
    },
    fetchImpl: async () => ({}),
    upiRedeemApiClient: {
      postJson: async (request) => {
        requests.push(request);
        return handler(request, requests.length);
      },
    },
    normalizeString,
    normalizeRedeemChannel: (value = '') => ['ideal', 'pix'].includes(String(value).toLowerCase()) ? String(value).toLowerCase() : 'upi',
    normalizeUpiRedeemRemoteStatus: (value = '') => String(value || '').trim().toLowerCase(),
    getPayloadItems: (payload = {}) => Array.isArray(payload?.items) ? payload.items : [],
    getRemoteStatusMessage: (item = {}, status = '') => String(item.message || status || ''),
    isFailureStatus: (status = '') => ['failed', 'error', 'invalid'].includes(String(status).toLowerCase()),
    isApproveBlockedRemoteResult: () => false,
    isApproveBlockedError: () => false,
    isFetchNetworkError: (error) => /failed to fetch/i.test(String(error?.message || error)),
    getErrorMessage: (error) => String(error?.message || error || '').replace(/^[A-Z_]+::/, ''),
    buildUpiRedeemStatusApiUrl: () => 'https://example.test/status',
    buildUpiRedeemSessionItem: sessionMaterial.buildUpiRedeemSessionItem,
    sleepWithStop: async () => {},
    maskExternalApiKey: () => '***',
  });
  return { requests, submission };
}

function ok(payload) {
  return {
    response: { ok: true, status: 200, headers: { get: () => 'application/json' } },
    payload,
  };
}

test('redeem submission forwards its stable idempotency key', async () => {
  const fixture = createSubmission(() => ok({ items: [{ cdkey: 'CDK-ONE', status: 'queued', jobId: 'job-1' }] }));
  await fixture.submission.postUpiRedeem({
    apiUrl: 'https://example.test/redeem', externalApiKey: 'key', clientId: 'client',
    cdkey: 'CDK-ONE', session: { accessToken: 'at' }, accessToken: 'at', channel: 'pix', idempotencyKey: 'redeem_fnv1a_12345678',
  });
  assert.equal(fixture.requests[0].headers['Idempotency-Key'], 'redeem_fnv1a_12345678');
  assert.equal(fixture.requests[0].body.channel, 'pix');
});

test('failed remote status queries keep a dispatched redeem outcome unknown', async () => {
  const fixture = createSubmission((_request, index) => {
    if (index === 1) return ok({ acceptedCount: 1 });
    throw new TypeError('Failed to fetch');
  });
  await assert.rejects(
    fixture.submission.postUpiRedeem({ apiUrl: 'https://example.test/redeem', externalApiKey: 'key', clientId: 'client', cdkey: 'CDK-ONE', session: { accessToken: 'at' }, accessToken: 'at' }),
    (error) => error.code === 'REDEEM_REMOTE_STATUS_UNKNOWN' && /REDEEM_REMOTE_STATUS_UNKNOWN::/.test(error.message)
  );
  assert.equal(fixture.requests.length, 4);
});

test('only an explicit successful not-found query allows unaccepted release', async () => {
  const fixture = createSubmission((_request, index) => index === 1 ? ok({}) : ok({ items: [] }));
  await assert.rejects(
    fixture.submission.postUpiRedeem({ apiUrl: 'https://example.test/redeem', externalApiKey: 'key', clientId: 'client', cdkey: 'CDK-ONE', session: { accessToken: 'at' }, accessToken: 'at' }),
    /UPI_REDEEM_NOT_ACCEPTED::/
  );
  assert.equal(fixture.requests.length, 4);
});
