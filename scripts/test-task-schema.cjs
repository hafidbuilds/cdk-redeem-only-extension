const test = require('node:test');
const assert = require('node:assert/strict');
const schema = require('../shared/task-schema.js');

test('task schema normalizes required fields and creates a stable workflow hash', () => {
  const task = schema.normalizeTask({
    type: 'REDEEM',
    accountId: ' User@Example.com ',
    channel: 'PIX',
    workflowSnapshot: { activeFlowId: 'openai', workflowVersion: 2, nodeIds: ['start', 'redeem'] },
  }, { now: '2026-07-25T08:00:00.000Z', random: 0.5 });
  assert.equal(task.type, 'redeem');
  assert.equal(task.accountId, 'user@example.com');
  assert.equal(task.channel, 'pix');
  assert.match(task.taskId, /^task_\d+_/);
  assert.equal(task.workflowSnapshot.definitionHash, schema.stableHash({ activeFlowId: 'openai', workflowVersion: 2, nodeIds: ['start', 'redeem'] }));
});

test('task schema rejects unknown types and preserves independent channel state', () => {
  assert.equal(schema.normalizeTask({ type: 'unknown' }), null);
  assert.equal(schema.normalizeChannel('upi'), 'upi');
  assert.equal(schema.normalizeChannel('ideal'), 'ideal');
  assert.equal(schema.normalizeChannel('pix'), 'pix');
  assert.equal(schema.normalizeChannel('shared'), '');
});

test('task schema retains recovery decisions and all supported statuses', () => {
  for (const status of schema.TASK_STATUSES) {
    const task = schema.normalizeTask({ type: 'register', status, recovery: { action: 'resume_safe' } });
    assert.equal(task.status, status);
    assert.equal(task.recovery.action, 'resume_safe');
  }
});
