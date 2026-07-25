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
  assert.match(backgroundSource, /isSignupTransitionUncertainFailure\(err\)[\s\S]{0,80}throw err/);
  const uncertainGuardIndex = backgroundSource.indexOf('if (isSignupTransitionUncertainFailure(err))');
  const restartIncrementIndex = backgroundSource.indexOf('step4RestartCount += 1;', uncertainGuardIndex);
  assert.ok(uncertainGuardIndex >= 0);
  assert.ok(restartIncrementIndex > uncertainGuardIndex);
});
