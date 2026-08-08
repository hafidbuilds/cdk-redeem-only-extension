const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.self = globalThis;
delete globalThis.MultiPageStepDefinitions;
delete require.cache[require.resolve('../data/step-definitions.js')];
require('../data/step-definitions.js');

const definitions = globalThis.MultiPageStepDefinitions;
const commonNodeIds = [
  'open-chatgpt',
  'submit-signup-email',
  'fill-password',
  'existing-totp-login',
  'fetch-signup-code',
  'fill-profile',
  'fetch-gpt-password-code',
  'set-gpt-password',
];

test('workflow version 3 exposes nine active positions and hides the former eligibility node', () => {
  assert.equal(definitions.WORKFLOW_VERSION, 3);

  const full = definitions.getNodes({ registrationFreeRoute: 'full-2fa' });
  const passkey = definitions.getNodes({ registrationFreeRoute: 'passkey-free' });
  const no2fa = definitions.getNodes({ registrationFreeRoute: 'no-2fa-free' });

  assert.deepEqual(full.map((node) => node.nodeId), [
    ...commonNodeIds,
    'enable-totp-mfa',
  ]);
  assert.deepEqual(passkey.map((node) => node.nodeId), [
    ...commonNodeIds,
    'enable-passkey',
  ]);
  assert.deepEqual(no2fa.map((node) => node.nodeId), [
    ...commonNodeIds,
    'persist-no-2fa-free',
  ]);
  assert.equal(full.length, 9);
  assert.equal(passkey.length, 9);
  assert.equal(no2fa.length, 9);
  assert.equal(definitions.getAllNodes().some((node) => node.nodeId === 'check-trial-eligibility'), false);
  assert.equal(full[3].applicability, 'conditional');
});

test('no-2FA route skips password setup and uses step 9 to save the Free account', () => {
  const statuses = definitions.getDefaultNodeStatuses({ registrationFreeRoute: 'no-2fa-free' });
  assert.equal(statuses['fetch-gpt-password-code'], 'skipped');
  assert.equal(statuses['set-gpt-password'], 'skipped');
  assert.equal(statuses['persist-no-2fa-free'], 'pending');
  assert.equal(statuses['security-factor-not-required'], undefined);
  assert.equal(Object.keys(statuses).length, 9);
});

test('v1 migration maps completed display-only TOTP evidence to formal step 4', () => {
  const migrated = definitions.migrateWorkflowState({
    workflowVersion: 1,
    registrationFreeRoute: 'full-2fa',
    existingTotpLogin: true,
    existingTotpLoginDisplayStatus: 'completed',
    nodeStatuses: {
      'open-chatgpt': 'completed',
      'submit-signup-email': 'completed',
      'fill-password': 'completed',
      'fetch-signup-code': 'running',
      'fill-profile': 'pending',
      'set-gpt-password': 'pending',
      'enable-totp-mfa': 'pending',
    },
  });

  assert.equal(migrated.workflowVersion, 3);
  assert.equal(migrated.nodeStatuses['existing-totp-login'], 'completed');
  for (const nodeId of ['fetch-signup-code', 'fill-profile', 'fetch-gpt-password-code', 'set-gpt-password']) {
    assert.equal(migrated.nodeStatuses[nodeId], 'skipped');
  }
  assert.equal(migrated.currentNodeId, 'enable-totp-mfa');
});

test('unfinished legacy password node always resumes from step 7', () => {
  const migrated = definitions.migrateWorkflowState({
    workflowVersion: 1,
    registrationFreeRoute: 'full-2fa',
    currentNodeId: 'set-gpt-password',
    nodeStatuses: {
      'open-chatgpt': 'completed',
      'submit-signup-email': 'completed',
      'fill-password': 'completed',
      'fetch-signup-code': 'completed',
      'fill-profile': 'completed',
      'set-gpt-password': 'failed',
      'enable-totp-mfa': 'pending',
    },
  });

  assert.equal(migrated.nodeStatuses['fetch-gpt-password-code'], 'pending');
  assert.equal(migrated.nodeStatuses['set-gpt-password'], 'pending');
  assert.equal(migrated.currentNodeId, 'fetch-gpt-password-code');
});

test('completed legacy password and factor nodes migrate without recreating step 10', () => {
  const migrated = definitions.migrateWorkflowState({
    workflowVersion: 1,
    registrationFreeRoute: 'passkey-free',
    nodeStatuses: {
      'open-chatgpt': 'completed',
      'submit-signup-email': 'completed',
      'fill-password': 'completed',
      'fetch-signup-code': 'completed',
      'fill-profile': 'completed',
      'set-gpt-password': 'manual_completed',
      'enable-passkey': 'completed',
    },
  });

  assert.equal(migrated.nodeStatuses['fetch-gpt-password-code'], 'manual_completed');
  assert.equal(migrated.nodeStatuses['set-gpt-password'], 'manual_completed');
  assert.equal(migrated.nodeStatuses['enable-passkey'], 'completed');
  assert.equal(migrated.nodeStatuses['check-trial-eligibility'], undefined);
});

test('legacy no-2FA final status moves to the active step 9 save node', () => {
  const migrated = definitions.migrateWorkflowState({
    workflowVersion: 1,
    registrationFreeRoute: 'no-2fa-free',
    nodeStatuses: {
      'open-chatgpt': 'completed',
      'submit-signup-email': 'completed',
      'fill-password': 'completed',
      'fetch-signup-code': 'completed',
      'fill-profile': 'completed',
      'persist-no-2fa-free': 'completed',
    },
  });

  assert.equal(migrated.nodeStatuses['fetch-gpt-password-code'], 'skipped');
  assert.equal(migrated.nodeStatuses['set-gpt-password'], 'skipped');
  assert.equal(migrated.nodeStatuses['security-factor-not-required'], undefined);
  assert.equal(migrated.nodeStatuses['persist-no-2fa-free'], 'completed');
});

test('v2 step 10 state is removed and a completed security factor remains the final node', () => {
  const migrated = definitions.migrateWorkflowState({
    workflowVersion: 2,
    registrationFreeRoute: 'full-2fa',
    currentNodeId: 'check-trial-eligibility',
    nodeStatuses: {
      'open-chatgpt': 'completed',
      'submit-signup-email': 'completed',
      'fill-password': 'completed',
      'existing-totp-login': 'skipped',
      'fetch-signup-code': 'completed',
      'fill-profile': 'completed',
      'fetch-gpt-password-code': 'completed',
      'set-gpt-password': 'completed',
      'enable-totp-mfa': 'completed',
      'check-trial-eligibility': 'pending',
    },
  });

  assert.equal(migrated.workflowVersion, 3);
  assert.equal(migrated.nodeStatuses['enable-totp-mfa'], 'completed');
  assert.equal(migrated.nodeStatuses['check-trial-eligibility'], undefined);
  assert.equal(migrated.currentNodeId, '');
});

test('v2 no-2FA route resumes its save node when the removed placeholder was current', () => {
  const migrated = definitions.migrateWorkflowState({
    workflowVersion: 2,
    registrationFreeRoute: 'no-2fa-free',
    currentNodeId: 'security-factor-not-required',
    nodeStatuses: {
      'open-chatgpt': 'completed',
      'submit-signup-email': 'completed',
      'fill-password': 'completed',
      'existing-totp-login': 'skipped',
      'fetch-signup-code': 'completed',
      'fill-profile': 'completed',
      'fetch-gpt-password-code': 'skipped',
      'set-gpt-password': 'skipped',
      'security-factor-not-required': 'pending',
      'persist-no-2fa-free': 'pending',
    },
  });

  assert.equal(migrated.currentNodeId, 'persist-no-2fa-free');
  assert.equal(migrated.nodeStatuses['persist-no-2fa-free'], 'pending');
});
