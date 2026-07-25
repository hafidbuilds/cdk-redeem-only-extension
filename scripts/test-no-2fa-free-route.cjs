const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadModule() {
  const sandbox = { self: {}, URL, Buffer };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../background/steps/no-2fa-free-route.js'), 'utf8'),
    sandbox,
    { filename: 'background/steps/no-2fa-free-route.js' }
  );
  return sandbox.self.MultiPageBackgroundNo2faFreeRoute;
}

test('no-2FA route exposes explicit ineligibility as a non-retryable account error', async () => {
  const executor = loadModule().createNo2faFreeRouteExecutor({
    checkRegistrationUpiTrialEligibility: async () => ({
      eligible: false,
      reason: 'not-eligible',
      trialEligibilityStatus: 'ineligible',
    }),
    getState: async () => ({
      email: 'ineligible@example.com',
      verificationUrl: 'https://pickup.example/ineligible',
    }),
    readCurrentChatGptSessionForExport: async () => ({
      accessToken: 'fixture-access-token',
      session: { user: { email: 'ineligible@example.com' } },
    }),
    setState: async () => {},
  });

  await assert.rejects(
    () => executor.executeNo2faFreeRoute(),
    (error) => {
      assert.equal(error.code, 'UPI_ACCOUNT_INELIGIBLE');
      assert.equal(error.trialEligibilityStatus, 'ineligible');
      assert.equal(error.retryable, false);
      assert.match(error.message, /not-eligible/);
      return true;
    }
  );
});
