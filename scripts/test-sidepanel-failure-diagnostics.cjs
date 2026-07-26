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

test('failure diagnostics does not let an informational timeout setting replace a real error', () => {
  const logs = [
    { timestamp: 1, level: 'error', message: '认证页 内容脚本 20 秒内未响应，请刷新页面后重试。' },
    { timestamp: 2, level: 'info', message: '自动运行：节点 fill-profile 已发起，正在等待完成信号（超时 150 秒）。' },
    { timestamp: 3, level: 'ok', message: '步骤 5：资料提交成功。' },
  ];

  const selected = diagnostics.selectFailureLogWindow(logs);

  assert.equal(selected.failureIndex, 0);
  assert.equal(selected.failure.message, logs[0].message);
});

test('failure diagnostics accepts explicit timeout outcomes but ignores timeout configuration text', () => {
  const ignored = diagnostics.selectFailureLogWindow([
    { level: 'info', message: '正在等待完成信号（超时 150 秒）。' },
  ]);
  const selected = diagnostics.selectFailureLogWindow([
    { level: 'warn', message: '等待进入密码页超时。URL: https://auth.openai.com/' },
  ]);

  assert.equal(ignored.failureFound, false);
  assert.equal(selected.failureFound, true);
  assert.equal(selected.failureIndex, 0);
});

test('failure diagnostics prefers the current direct error over a later archived snapshot error', () => {
  const logs = [
    { timestamp: 1, level: 'error', message: 'SET_GPT_PASSWORD_RESET_ENTRY_UNAVAILABLE：未找到可用密码入口。' },
    { timestamp: 2, level: 'error', message: '第 4/51 轮账号创建已完成，但当前认证现场无法安全继续。' },
    { timestamp: 3, level: 'info', message: '失败轮次：第 4 轮。' },
    { timestamp: 4, level: 'error', message: '快照 17:07:44 错误 第 3/51 轮第 1 次尝试失败：步骤 2 未找到继续按钮。' },
  ];

  const selected = diagnostics.selectFailureLogWindow(logs);

  assert.equal(selected.failureIndex, 1);
  assert.equal(selected.failure.message, logs[1].message);
});

test('failure diagnostics falls back to an archived snapshot when no direct failure exists', () => {
  const logs = [
    { timestamp: 1, level: 'info', message: '流程启动。' },
    { timestamp: 2, level: 'error', message: '快照 17:07:44 错误 第 3/51 轮失败。' },
  ];

  const selected = diagnostics.selectFailureLogWindow(logs);

  assert.equal(selected.failureIndex, 1);
  assert.equal(selected.failure.message, logs[1].message);
});

test('failure diagnostics redacts credentials, verification codes, emails, and URL parameters', () => {
  const sanitized = diagnostics.sanitizeDiagnosticText(
    '姓名已填写：Mary Sanchez，邮箱 user@example.com 验证码：123456 password=hunter2 access_token=abcdef '
      + 'Bearer secret-token-123456789 https://auth.example.com/callback?code=oauth-code&state=session-state'
  );

  assert.doesNotMatch(sanitized, /Mary Sanchez|user@example\.com|123456|hunter2|abcdef|secret-token|oauth-code|session-state/);
  assert.match(sanitized, /u\*\*\*@example\.com/);
  assert.match(sanitized, /NAME_REDACTED/);
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
