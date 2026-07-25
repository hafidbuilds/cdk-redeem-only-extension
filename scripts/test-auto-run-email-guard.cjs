const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createAutoRunRetryPolicy } = require('../background/auto-run/retry-policy.js');

function loadFlowCapabilities() {
  const sandbox = { self: {} };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../shared/flow-capabilities.js'), 'utf8'),
    sandbox,
    { filename: 'shared/flow-capabilities.js' }
  );
  return sandbox.self.MultiPageFlowCapabilities;
}

test('custom email pool cannot start auto-run without an available email', () => {
  const registry = loadFlowCapabilities().createFlowCapabilityRegistry();
  const result = registry.validateAutoRunStart({
    state: {
      emailGenerator: 'custom-pool',
      customEmailPoolEntries: [],
      customEmailPool: [],
    },
    totalRuns: 1,
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'custom_email_pool_empty');
});

test('custom email pool cannot schedule more rounds than available emails', () => {
  const registry = loadFlowCapabilities().createFlowCapabilityRegistry();
  const result = registry.validateAutoRunStart({
    state: {
      emailGenerator: 'custom-pool',
      customEmailPoolEntries: [
        { email: 'one@example.com', enabled: true, used: false },
        { email: 'used@example.com', enabled: true, used: true },
      ],
      customEmailPool: ['one@example.com'],
    },
    totalRuns: 2,
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'custom_email_pool_insufficient');
});

test('custom email pool exhaustion is terminal and never retryable', () => {
  const policy = createAutoRunRetryPolicy({
    AUTO_RUN_MAX_RETRIES_PER_ROUND: 3,
    getErrorMessage: (error) => error?.message || String(error || ''),
  });
  const result = policy.evaluateAttemptFailure({
    error: new Error('CUSTOM_EMAIL_POOL_EXHAUSTED::自定义邮箱池没有可用邮箱。'),
    attemptRun: 1,
    autoRunSkipFailures: true,
    maxAttemptsForRound: 4,
  });
  const action = policy.selectFailureAction(result);

  assert.equal(result.blockedByCustomEmailPoolEmpty, true);
  assert.equal(result.canRetry, false);
  assert.equal(action.code, 'fail_custom_email_pool_empty');
  assert.equal(action.shouldStop, true);
});

test('explicit no-2FA UPI ineligibility skips same-round retries', () => {
  const policy = createAutoRunRetryPolicy({
    AUTO_RUN_MAX_RETRIES_PER_ROUND: 3,
    getErrorMessage: (error) => error?.message || String(error || ''),
  });
  const result = policy.evaluateAttemptFailure({
    error: new Error('免 2FA Free 路线：账号未通过 UPI 试用资格检测，未进入 Free：not-eligible'),
    attemptRun: 1,
    autoRunSkipFailures: true,
    autoRunRetryNonFreeTrial: true,
    maxAttemptsForRound: 4,
  });
  const action = policy.selectFailureAction(result);

  assert.equal(result.blockedByUpiAccountIneligible, true);
  assert.equal(result.canRetry, false);
  assert.equal(action.code, 'fail_upi_account_ineligible');
  assert.equal(action.shouldRetry, undefined);
});

test('structured UPI ineligibility status is terminal even when the message changes', () => {
  const policy = createAutoRunRetryPolicy({
    AUTO_RUN_MAX_RETRIES_PER_ROUND: 3,
    getErrorMessage: (error) => error?.message || String(error || ''),
  });
  const error = new Error('provider response rejected this account');
  error.code = 'UPI_ACCOUNT_INELIGIBLE';
  error.trialEligibilityStatus = 'ineligible';
  const result = policy.evaluateAttemptFailure({
    error,
    attemptRun: 1,
    autoRunSkipFailures: true,
    maxAttemptsForRound: 4,
  });

  assert.equal(result.blockedByUpiAccountIneligible, true);
  assert.equal(result.canRetry, false);
  assert.equal(policy.selectFailureAction(result).code, 'fail_upi_account_ineligible');
});

test('exhausted session frame recovery stops instead of registering another email', () => {
  const policy = createAutoRunRetryPolicy({
    AUTO_RUN_MAX_RETRIES_PER_ROUND: 3,
    getErrorMessage: (error) => error?.message || String(error || ''),
  });
  const error = new Error('ChatGPT page frame recovery exhausted');
  error.code = 'CHATGPT_SESSION_FRAME_UNAVAILABLE';
  error.retryable = false;
  const result = policy.evaluateAttemptFailure({
    error,
    attemptRun: 1,
    autoRunSkipFailures: true,
    maxAttemptsForRound: 4,
  });
  const action = policy.selectFailureAction(result);

  assert.equal(result.blockedBySessionFrameUnavailable, true);
  assert.equal(result.canRetry, false);
  assert.equal(action.code, 'fail_session_frame_unavailable');
  assert.equal(action.shouldStop, true);
  assert.equal(action.forceFreshTabsNextRun, false);
});

test('uncertain password submit always stops and preserves the current signup session', () => {
  const policy = createAutoRunRetryPolicy({
    AUTO_RUN_MAX_RETRIES_PER_ROUND: 3,
    getErrorMessage: (error) => error?.message || String(error || ''),
  });
  const error = new Error('password transition still unknown');
  error.code = 'SIGNUP_PASSWORD_SUBMIT_UNCERTAIN';
  error.retryable = false;
  error.preserveSignupSession = true;
  const result = policy.evaluateAttemptFailure({
    error,
    attemptRun: 1,
    autoRunSkipFailures: true,
    maxAttemptsForRound: 4,
  });
  const action = policy.selectFailureAction(result);

  assert.equal(result.blockedBySignupPasswordSubmitUncertain, true);
  assert.equal(result.canRetry, false);
  assert.equal(action.code, 'fail_signup_password_submit_uncertain');
  assert.equal(action.shouldStop, true);
  assert.equal(action.forceFreshTabsNextRun, false);
});
