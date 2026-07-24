const test = require('node:test');
const assert = require('node:assert/strict');
const diagnostics = require('../sidepanel/failure-diagnostics.js');

test('failure diagnostics keeps one hundred log entries around the latest failure', () => {
  const logs = Array.from({ length: 301 }, (_, index) => ({
    timestamp: index + 1,
    level: index === 150 ? 'error' : 'info',
    message: index === 150 ? 'latest failure' : `entry ${index}`,
  }));

  const selected = diagnostics.selectFailureLogWindow(logs);

  assert.equal(selected.failureFound, true);
  assert.equal(selected.failureIndex, 150);
  assert.equal(selected.beforeCount, 100);
  assert.equal(selected.afterCount, 100);
  assert.equal(selected.logs.length, 201);
  assert.equal(selected.logs[0].timestamp, 51);
  assert.equal(selected.logs.at(-1).timestamp, 251);
});

test('failure diagnostics redacts credentials, verification codes, emails, and URL parameters', () => {
  const sanitized = diagnostics.sanitizeDiagnosticText(
    '邮箱 user@example.com 验证码：123456 password=hunter2 access_token=abcdef '
      + 'Bearer secret-token-123456789 https://auth.example.com/callback?code=oauth-code&state=session-state'
  );

  assert.doesNotMatch(sanitized, /user@example\.com|123456|hunter2|abcdef|secret-token|oauth-code|session-state/);
  assert.match(sanitized, /u\*\*\*@example\.com/);
  assert.match(sanitized, /REDACTED/);
});

test('copy diagnostics writes safe JSON to clipboard and shows the success toast', async () => {
  let copied = '';
  const toasts = [];
  let closed = 0;
  const chromeApi = {
    runtime: {
      sendMessage: async () => ({
        currentNodeId: 'fill-password',
        nodeStatuses: { 'fill-password': 'failed' },
        logs: [
          { timestamp: 1, level: 'info', message: 'password=hunter2' },
          { timestamp: 2, level: 'error', message: '验证码 123456 被拒绝，AT token-abcdefghijklmnop' },
        ],
      }),
    },
    tabs: {
      query: async () => [{ id: 7, url: 'https://auth.example.com/verify?code=secret-code' }],
      sendMessage: async () => ({
        state: 'verification_page',
        url: 'https://auth.example.com/verify?code=secret-code',
        path: '/verify',
        verificationKind: 'email',
        hasVerificationTarget: true,
        verificationVisible: true,
        verificationErrorText: '验证码 123456 不正确',
      }),
    },
  };

  const result = await diagnostics.copyLatestFailureDiagnostics({
    chromeApi,
    copyTextToClipboard: async (value) => { copied = value; },
    showToast: (...args) => toasts.push(args),
    closeConfigMenu: () => { closed += 1; },
  });

  assert.equal(copied, result.text);
  assert.equal(result.bundle.verificationInput.detected, true);
  assert.equal(result.bundle.logWindow.failureFound, true);
  assert.doesNotMatch(copied, /hunter2|123456|secret-code|abcdefghijklmnop/);
  assert.deepEqual(toasts, [['已导出至剪贴板', 'success', 2200]]);
  assert.equal(closed, 1);
});
