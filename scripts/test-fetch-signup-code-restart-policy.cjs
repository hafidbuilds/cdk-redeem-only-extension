const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backgroundSource = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

test('fetch-signup-code missing verification input is parked by timer before restart', () => {
  assert.match(backgroundSource, /function\s+isSignupVerificationInputMissingFailure\s*\(/);
  assert.match(backgroundSource, /未找到验证码输入框/);
  assert.match(backgroundSource, /isSignupVerificationInputMissingFailure\(err\)[\s\S]{0,240}parkFetchSignupCodeRestart\(/);
});

test('fetch-signup-code uncertain transition escapes before any internal restart', () => {
  assert.match(backgroundSource, /function\s+isSignupTransitionUncertainFailure\s*\(/);
  assert.match(backgroundSource, /SIGNUP_MANUAL_VERIFICATION_\(\?:REJECTED\|UNCONFIRMED\)/);
  assert.match(backgroundSource, /isSignupTransitionUncertainFailure\(err\)[\s\S]{0,80}throw err/);
  const uncertainGuardIndex = backgroundSource.indexOf('if (isSignupTransitionUncertainFailure(err))');
  const restartIncrementIndex = backgroundSource.indexOf('step4RestartCount += 1;', uncertainGuardIndex);
  assert.ok(uncertainGuardIndex >= 0);
  assert.ok(restartIncrementIndex > uncertainGuardIndex);
});

test('late verification input parks and resumes the same step before any registration restart', () => {
  const pendingGuardIndex = backgroundSource.indexOf('if (isSignupVerificationInputRenderPendingFailure(err))');
  const uncertainGuardIndex = backgroundSource.indexOf('if (isSignupTransitionUncertainFailure(err))', pendingGuardIndex);
  const restartIncrementIndex = backgroundSource.indexOf('step4RestartCount += 1;', pendingGuardIndex);
  const pendingBranch = backgroundSource.slice(pendingGuardIndex, uncertainGuardIndex);

  assert.ok(pendingGuardIndex >= 0);
  assert.ok(uncertainGuardIndex > pendingGuardIndex);
  assert.ok(restartIncrementIndex > uncertainGuardIndex);
  assert.match(pendingBranch, /parkFetchSignupCodeRestart\(err/);
  assert.match(pendingBranch, /resumeLabel: '继续步骤 4'/);
  assert.match(pendingBranch, /resumeCounterKey: 'step4VerificationRenderResumeCount'/);
  assert.match(pendingBranch, /maxResumeCount: 3/);
  assert.doesNotMatch(pendingBranch, /invalidateDownstreamAfterAutoRunNodeRestart|setRestartNode\('open-chatgpt'\)/);
  assert.match(backgroundSource, /mode: 'continue'/);
  assert.match(backgroundSource, /resumeCount >= maxResumeCount[\s\S]{0,500}SIGNUP_PASSWORD_SUBMIT_UNCERTAIN/);
});
