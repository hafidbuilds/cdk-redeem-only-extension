const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createAutoRunRetryPolicy } = require('../background/auto-run/retry-policy.js');

async function runPostAuthRestartDecision(step, error, options = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8');
  const start = source.indexOf('async function getPostStep6AutoRestartDecision');
  const end = source.indexOf('function isAuthHttpErrorPageState', start);
  assert.ok(start >= 0 && end > start);
  const finalNodeId = options.route === 'no-2fa-free' ? 'persist-no-2fa-free' : 'check-trial-eligibility';
  const context = {
    FINAL_OAUTH_CHAIN_START_STEP: 7,
    LAST_STEP_ID: 10,
    console,
    error,
    getAuthChainStartStepId: () => 7,
    getErrorMessage: (value) => value?.message || String(value || ''),
    getLastStepIdForState: () => 10,
    getLoginAuthStateFromContent: async () => {
      context.authStateProbeCount += 1;
      return { state: 'chatgpt_home', url: 'https://chatgpt.com/' };
    },
    getState: async () => ({
      nodeStatuses: {
        'fetch-gpt-password-code': 'completed',
        'set-gpt-password': 'completed',
        'enable-totp-mfa': 'completed',
        [finalNodeId]: 'failed',
      },
    }),
    getStepExecutionKeyForState: (stepId) => ({
      7: 'fetch-gpt-password-code',
      8: 'set-gpt-password',
      9: 'enable-totp-mfa',
      10: finalNodeId,
    })[stepId] || '',
    getStepIdsForState: () => [7, 8, 9, 10],
    authStateProbeCount: 0,
    result: null,
    step,
  };
  vm.runInNewContext(
    `${source.slice(start, end)}\nresult = getPostStep6AutoRestartDecision(step, error);`,
    context
  );
  return {
    decision: await context.result,
    authStateProbeCount: context.authStateProbeCount,
  };
}

async function runSkipNode(nodeId) {
  const source = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8');
  const start = source.indexOf('const REQUIRED_FINAL_WORKFLOW_NODE_IDS');
  const end = source.indexOf('function throwIfStopped', start);
  assert.ok(start >= 0 && end > start);
  const context = {
    addLog: async () => {},
    ensureManualInteractionAllowed: async () => ({ nodeStatuses: {} }),
    getNodeIdsForState: () => ['check-trial-eligibility', 'persist-no-2fa-free'],
    isStepDoneStatus: () => false,
    nodeId,
    normalizeStatusMapForNodes: () => ({}),
    result: null,
    setNodeStatus: async () => {
      context.setNodeStatusCalls += 1;
    },
    setNodeStatusCalls: 0,
  };
  vm.runInNewContext(
    `${source.slice(start, end)}\nresult = skipNode(nodeId);`,
    context
  );
  return {
    result: context.result,
    getSetNodeStatusCalls: () => context.setNodeStatusCalls,
  };
}

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

test('account deactivation replaces the account without ordinary retry settings', () => {
  const policy = createAutoRunRetryPolicy({
    AUTO_RUN_MAX_RETRIES_PER_ROUND: 0,
    getErrorMessage: (error) => error?.message || String(error || ''),
  });
  const error = new Error('ACCOUNT_DEACTIVATED::account is unavailable');
  error.code = 'ACCOUNT_DEACTIVATED';
  error.retryable = false;
  const result = policy.evaluateAttemptFailure({
    error,
    attemptRun: 1,
    autoRunSkipFailures: false,
    maxAttemptsForRound: 1,
  });
  const action = policy.selectFailureAction(result);

  assert.equal(result.blockedByAccountDeactivated, true);
  assert.equal(result.canRetry, false);
  assert.equal(action.code, 'replace_account_deactivated');
  assert.equal(action.shouldReplaceAccount, true);
  assert.equal(action.shouldFailRound, undefined);
  assert.equal(action.shouldStop, undefined);
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

test('step 10 account ineligibility reaches the outer round policy without restarting step 7', async () => {
  const error = new Error('账号未通过 UPI 试用资格检测：not-eligible');
  error.code = 'UPI_ACCOUNT_INELIGIBLE';
  error.trialEligibilityStatus = 'ineligible';
  error.retryable = false;

  const result = await runPostAuthRestartDecision(10, error);

  assert.equal(result.decision.shouldRestart, false);
  assert.equal(result.authStateProbeCount, 0);
});

test('no-2FA step 10 storage quota failure retries only the current final node', async () => {
  const error = new Error('Resource::kQuotaBytes quota exceeded');
  const result = await runPostAuthRestartDecision(10, error, { route: 'no-2fa-free' });

  assert.equal(result.decision.shouldRestart, true);
  assert.equal(result.decision.restartStep, 10);
  assert.equal(result.decision.retryCurrentNode, true);
  assert.equal(result.authStateProbeCount, 0);
});

test('no-2FA step 10 eligibility timeout retries only the current final node', async () => {
  const error = new Error('免 2FA Free 路线：账号未通过试用资格检测：资格检查接口请求超时（>30 秒）。');
  error.code = 'UPI_ELIGIBILITY_CHECK_FAILED';
  error.trialEligibilityStatus = 'failed';
  error.retryable = true;
  const result = await runPostAuthRestartDecision(10, error, { route: 'no-2fa-free' });

  assert.equal(result.decision.shouldRestart, true);
  assert.equal(result.decision.restartStep, 10);
  assert.equal(result.decision.retryCurrentNode, true);
  assert.equal(result.decision.retryKind, 'eligibility-transient');
  assert.equal(result.decision.exhaustedErrorCode, 'UPI_ELIGIBILITY_CHECK_FAILED');
  assert.equal(result.authStateProbeCount, 0);
});

test('final-node storage retry handler never routes quota failures through step 7 auth recovery', () => {
  const source = fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8');
  const start = source.indexOf('if (restartDecision.retryCurrentNode)');
  const end = source.indexOf('postStep7RestartCount += 1;', start);
  assert.ok(start >= 0 && end > start);
  const branch = source.slice(start, end);

  assert.match(branch, /setNodeStatus\(nodeId, 'pending'\)/);
  assert.match(branch, /getNodeIndex\(await getState\(\), nodeId\)/);
  assert.match(branch, /不会回到第 7 步/);
  assert.doesNotMatch(branch, /getLoginAuthStateFromContent|restartAnchorStep/);
});

test('background rejects manual skip requests for final persistence nodes', async () => {
  for (const nodeId of ['check-trial-eligibility', 'persist-no-2fa-free']) {
    const execution = await runSkipNode(nodeId);
    await assert.rejects(execution.result, /最终账号保存节点不能跳过/);
    assert.equal(execution.getSetNodeStatusCalls(), 0);
  }
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

test('exhausted step 6 reset recovery stops without restarting the registration round', () => {
  const policy = createAutoRunRetryPolicy({
    AUTO_RUN_MAX_RETRIES_PER_ROUND: 3,
    getErrorMessage: (error) => error?.message || String(error || ''),
  });
  const result = policy.evaluateAttemptFailure({
    error: new Error('SET_GPT_PASSWORD_SESSION_EXPIRED::step 6 reset state expired'),
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

test('uncertain email submit stops before cookies or another email can be selected', () => {
  const policy = createAutoRunRetryPolicy({
    AUTO_RUN_MAX_RETRIES_PER_ROUND: 3,
    getErrorMessage: (error) => error?.message || String(error || ''),
  });
  const error = new Error('email accepted but password page state is unknown');
  error.code = 'SIGNUP_EMAIL_SUBMIT_UNCERTAIN';
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

test('step 3.5 login failure stops auto-run and preserves the current authentication session', () => {
  const policy = createAutoRunRetryPolicy({
    AUTO_RUN_MAX_RETRIES_PER_ROUND: 3,
    getErrorMessage: (error) => error?.message || String(error || ''),
  });
  const error = new Error('SIGNUP_EXISTING_TOTP_LOGIN_FAILED::2FA login result is unknown');
  const result = policy.evaluateAttemptFailure({
    error,
    attemptRun: 1,
    autoRunSkipFailures: true,
    maxAttemptsForRound: 4,
  });
  const action = policy.selectFailureAction(result);

  assert.equal(result.blockedBySignupExistingTotpLogin, true);
  assert.equal(result.canRetry, false);
  assert.equal(action.code, 'fail_signup_existing_totp_login');
  assert.equal(action.shouldStop, true);
  assert.equal(action.forceFreshTabsNextRun, false);
});

test('step 6 code-fetch exhaustion stops without restarting the registration round', () => {
  const policy = createAutoRunRetryPolicy({
    AUTO_RUN_MAX_RETRIES_PER_ROUND: 3,
    getErrorMessage: (error) => error?.message || String(error || ''),
  });
  const error = new Error('SET_GPT_PASSWORD_CODE_FETCH_UNCERTAIN::redacted');
  error.code = 'SET_GPT_PASSWORD_CODE_FETCH_UNCERTAIN';
  error.retryable = false;
  error.preserveSignupSession = true;
  const result = policy.evaluateAttemptFailure({
    error,
    attemptRun: 1,
    autoRunSkipFailures: true,
    maxAttemptsForRound: 4,
  });
  const action = policy.selectFailureAction(result);

  assert.equal(result.blockedByPreserveSignupSession, true);
  assert.equal(result.canRetry, false);
  assert.equal(action.code, 'fail_preserve_signup_session');
  assert.equal(action.shouldStop, true);
  assert.equal(action.forceFreshTabsNextRun, false);
});
