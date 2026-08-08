const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

delete globalThis.MultiPageSignupPageOrchestrator;
delete globalThis.SignupPageOrchestrator;
require('../content/signup-page-orchestrator.js');
const signupPageSource = fs.readFileSync(path.join(__dirname, '..', 'content', 'signup-page.js'), 'utf8');

function createRequiredHandler(name) {
  return () => {
    throw new Error(`${name} should not be called`);
  };
}

test('signup page orchestrator forwards resend timeout payload', async () => {
  const calls = [];
  const orchestrator = globalThis.MultiPageSignupPageOrchestrator.createSignupPageOrchestrator({
    fillVerificationCode: createRequiredHandler('fillVerificationCode'),
    serializeLoginAuthState: createRequiredHandler('serializeLoginAuthState'),
    inspectLoginAuthState: createRequiredHandler('inspectLoginAuthState'),
    submitAddEmailAndContinue: createRequiredHandler('submitAddEmailAndContinue'),
    getStep5SubmitState: createRequiredHandler('getStep5SubmitState'),
    getSignupVerificationPostSubmitState: createRequiredHandler('getSignupVerificationPostSubmitState'),
    skipCreateAccountEnrollPasskey: createRequiredHandler('skipCreateAccountEnrollPasskey'),
    prepareSignupVerificationFlow: createRequiredHandler('prepareSignupVerificationFlow'),
    recoverCurrentAuthRetryPage: createRequiredHandler('recoverCurrentAuthRetryPage'),
    recoverStep5SubmitRetryPage: createRequiredHandler('recoverStep5SubmitRetryPage'),
    triggerStep5ProfileSubmit: createRequiredHandler('triggerStep5ProfileSubmit'),
    resendVerificationCode: async (step, timeout, payload) => {
      calls.push({ step, timeout, payload });
      return { resent: true };
    },
    ensureSignupEntryReady: createRequiredHandler('ensureSignupEntryReady'),
    ensureSignupPasswordPageReady: createRequiredHandler('ensureSignupPasswordPageReady'),
    startSetGptPasswordResetFlow: createRequiredHandler('startSetGptPasswordResetFlow'),
    prepareSetGptPasswordFlow: createRequiredHandler('prepareSetGptPasswordFlow'),
    submitSetGptPasswordVerificationCode: createRequiredHandler('submitSetGptPasswordVerificationCode'),
    setGptPasswordOnResetPage: createRequiredHandler('setGptPasswordOnResetPage'),
    getSetGptPasswordPageState: createRequiredHandler('getSetGptPasswordPageState'),
    recoverSetGptPasswordAuthRetryPage: createRequiredHandler('recoverSetGptPasswordAuthRetryPage'),
    readChatGptSessionExportData: createRequiredHandler('readChatGptSessionExportData'),
    step8FindAndClick: createRequiredHandler('step8FindAndClick'),
    getStep8State: createRequiredHandler('getStep8State'),
    step8TriggerContinue: createRequiredHandler('step8TriggerContinue'),
  });

  const result = await orchestrator.handleCommand({
    type: 'RESEND_VERIFICATION_CODE',
    payload: {
      visibleStep: 7,
      nodeId: 'fetch-gpt-password-code',
      resendTimeoutMs: 8000,
    },
  });

  assert.deepEqual(result, { resent: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].step, 7);
  assert.equal(calls[0].timeout, 8000);
  assert.equal(calls[0].payload.resendTimeoutMs, 8000);
});

test('signup password readiness uses the bounded page observation budget from background', async () => {
  const calls = [];
  const orchestrator = globalThis.MultiPageSignupPageOrchestrator.createSignupPageOrchestrator({
    ensureSignupPasswordPageReady: async (timeoutMs) => {
      calls.push(timeoutMs);
      return { ready: true };
    },
  });

  assert.deepEqual(await orchestrator.handleCommand({
    type: 'ENSURE_SIGNUP_PASSWORD_PAGE_READY',
    payload: { timeoutMs: 20000 },
  }), { ready: true });
  assert.deepEqual(calls, [20000]);

  await orchestrator.handleCommand({
    type: 'ENSURE_SIGNUP_PASSWORD_PAGE_READY',
    payload: { timeoutMs: 90000 },
  });
  assert.deepEqual(calls, [20000, 30000]);
});

test('existing-account TOTP login redacts complete and partial split-input values', () => {
  const entries = [];
  const orchestrator = globalThis.MultiPageSignupPageOrchestrator.createSignupPageOrchestrator({
    log: (...args) => entries.push(args),
  });

  orchestrator.logVerificationCode(8, {
    signupExistingTotpLogin: true,
    suppressVerificationCodeLog: true,
  }, '步骤 8：分格验证码输入框已稳定显示 123456。');
  orchestrator.logVerificationCode(8, {
    signupExistingTotpLogin: true,
    suppressVerificationCodeLog: true,
  }, '步骤 8：分格验证码输入框未稳定呈现目标值，当前页面值为 12_4__，准备继续观察提交流程。', 'warn');

  assert.equal(entries.length, 2);
  assert.match(entries[0][0], /^步骤 4：已有账号 2FA 登录：/);
  assert.doesNotMatch(entries[0][0], /123456/);
  assert.doesNotMatch(entries[1][0], /12_4__/);
  assert.match(entries[0][0], /\[REDACTED\]/);
  assert.match(entries[1][0], /\[REDACTED\]/);
  assert.deepEqual(entries[0][2], { step: 4, stepKey: 'existing-totp-login' });
});

test('background-owned recovery commands return errors without broadcasting a competing node failure', () => {
  const api = globalThis.MultiPageSignupPageOrchestrator;
  assert.equal(api.shouldReportCommandErrorToWorkflow({
    type: 'PREPARE_SIGNUP_VERIFICATION',
    payload: { backgroundOwnsWorkflowOutcome: true },
  }), false);
  assert.equal(api.shouldReportCommandErrorToWorkflow({
    type: 'EXECUTE_NODE',
    payload: {},
  }), true);
  assert.match(signupPageSource, /if \(shouldReportWorkflowError\) reportError\(reportedNodeId \|\| reportedStep, err\.message\)/);
});
