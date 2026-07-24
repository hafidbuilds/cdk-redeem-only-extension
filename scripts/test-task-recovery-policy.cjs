const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../background/task-recovery-policy.js');

const scenarios = [
  ['registration before email submit', { type: 'register', checkpoint: { registrationEmailSubmitted: false } }, 'resume_safe', true, true, true, '', false, ''],
  ['verification code wait', { type: 'register', checkpoint: { registrationEmailSubmitted: true, waitingForVerificationCode: true } }, 'resume_wait', true, false, false, '', false, ''],
  ['AT remote validation', { type: 'refresh_access_token', checkpoint: { remoteValidationStarted: true, remoteRequestSent: true } }, 'query_remote', true, false, false, '', false, ''],
  ['AT refreshed before save', { type: 'refresh_access_token', checkpoint: { accessTokenRefreshed: true, accessTokenSaved: false } }, 'manual_review', false, false, true, '', false, ''],
  ['CDK before submit', { type: 'redeem', checkpoint: { cdkSubmitted: false } }, 'resume_safe', true, true, true, '', false, ''],
  ['CDK sent without response', { type: 'redeem', checkpoint: { cdkSubmitted: true, remoteRequestSent: true } }, 'query_remote', true, false, false, '', false, ''],
  ['remote pending', { type: 'redeem', checkpoint: { remoteStatus: 'pending', remoteJobId: 'job_hash' } }, 'query_remote', true, false, false, '', false, ''],
  ['remote success before Plus move', { type: 'redeem', checkpoint: { remoteSucceeded: true, plusGroupMoved: false } }, 'finalize_local', true, false, false, 'plus', false, ''],
  ['cancel after remote submit', { type: 'redeem', cancelRequested: true, checkpoint: { remoteRequestSent: true } }, 'query_remote', false, false, false, '', false, ''],
  ['deactivated account', { type: 'redeem', checkpoint: { accountDeactivated: true } }, 'stop', false, false, true, 'failed', true, 'ACCOUNT_DEACTIVATED'],
];

for (const [name, task, action, canRetry, canResubmit, releaseLocks, finalGroup, clearAccessToken, errorCode] of scenarios) {
  test(`recovery: ${name}`, () => {
    const decision = policy.decideTaskRecovery(task);
    assert.equal(decision.action, action);
    assert.equal(decision.canRetry, canRetry);
    assert.equal(decision.canResubmit, canResubmit);
    assert.equal(decision.releaseLocks, releaseLocks);
    assert.equal(decision.preserveAccount, true);
    assert.equal(decision.clearAccessToken, clearAccessToken);
    assert.equal(decision.finalAccountGroup, finalGroup);
    if (errorCode) assert.equal(decision.errorCode, errorCode);
  });
}
