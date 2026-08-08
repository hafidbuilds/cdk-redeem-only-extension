const test = require('node:test');
const assert = require('node:assert/strict');
const redactor = require('../shared/sensitive-data-redactor.js');

test('shared redactor removes credentials, CDKs and raw mail bodies recursively', () => {
  const input = {
    password: 'password-value',
    credentials: [{ accessToken: 'access-token-value', totpSecret: 'totp-value' }],
    cdkey: 'ABCD-EFGH-IJKL',
    mailBody: 'Your verification code is 123456',
    safe: { accountId: 'user@example.com', status: 'running' },
  };
  const output = redactor.redactSensitiveData(input);
  const serialized = JSON.stringify(output);
  assert.doesNotMatch(serialized, /password-value|access-token-value|totp-value|ABCD-EFGH-IJKL|verification code/);
  assert.equal(output.safe.accountId, 'user@example.com');
  assert.equal(output.safe.status, 'running');
});

test('shared redactor removes labeled secrets and bearer tokens from text', () => {
  const value = redactor.redactText('password=hunter2 accessToken=abcdef123456 Bearer token-value-123456789 cdk=ABCD-EFGH');
  assert.doesNotMatch(value, /hunter2|abcdef123456|token-value-123456789|ABCD-EFGH/);
});

test('background log persistence uses the shared redactor', async () => {
  const state = { logs: [] };
  const logging = require('../background/logging-status.js').createLoggingStatus({
    chrome: { runtime: { sendMessage: async () => {} } },
    DEFAULT_STATE: { nodeStatuses: {} },
    getState: async () => state,
    setState: async (patch) => Object.assign(state, patch),
    redactText: redactor.redactText,
  });
  await logging.addLog('password=plain-secret Bearer token-value-123456789');
  assert.doesNotMatch(JSON.stringify(state.logs), /plain-secret|token-value-123456789/);
});

test('background log append reads only the session log buffer when available', async () => {
  const state = { logs: [{ message: 'existing', timestamp: 1 }] };
  let fullStateReads = 0;
  let sessionLogReads = 0;
  const logging = require('../background/logging-status.js').createLoggingStatus({
    chrome: { runtime: { sendMessage: async () => {} } },
    DEFAULT_STATE: { nodeStatuses: {} },
    getState: async () => {
      fullStateReads += 1;
      return state;
    },
    getSessionLogs: async () => {
      sessionLogReads += 1;
      return state.logs;
    },
    setState: async (patch) => Object.assign(state, patch),
    redactText: redactor.redactText,
  });

  await logging.addLog('next');

  assert.equal(fullStateReads, 0);
  assert.equal(sessionLogReads, 1);
  assert.equal(state.logs.length, 2);
});
