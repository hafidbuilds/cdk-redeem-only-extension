const test = require('node:test');
const assert = require('node:assert/strict');

const { createRuntimeMessageHandlers } = require('../sidepanel/runtime-message-handlers.js');

function createClassList() {
  return {
    add() {},
    remove() {},
  };
}

test('auto-run reset uses the authoritative route node statuses from background', () => {
  const full2faDefaults = {
    'fetch-gpt-password-code': 'pending',
    'set-gpt-password': 'pending',
    'enable-totp-mfa': 'pending',
    'check-trial-eligibility': 'pending',
  };
  const no2faResetStatuses = {
    'fetch-gpt-password-code': 'skipped',
    'set-gpt-password': 'skipped',
    'security-factor-not-required': 'skipped',
    'persist-no-2fa-free': 'pending',
  };
  let syncedPatch = null;
  const handlers = createRuntimeMessageHandlers({
    scopeValues: {
      NODE_DEFAULT_STATUSES: full2faDefaults,
      applyAutoRunStatus() {},
      currentAutoRun: {},
      displayLocalhostUrl: { textContent: '', classList: createClassList() },
      displayOauthUrl: { textContent: '', classList: createClassList() },
      displayStatus: { textContent: '' },
      document: { querySelectorAll: () => [] },
      inputEmail: { value: '' },
      isLuckmailProvider: () => false,
      latestState: {},
      logArea: { innerHTML: '' },
      queueLuckmailPurchaseRefresh() {},
      renderHotmailAccounts() {},
      renderLegacyWalletAccounts() {},
      renderLuckmailAccounts() {},
      renderMail2925Accounts() {},
      renderStepStatuses() {},
      resetCustomEmailPoolManager() {},
      resetIcloudManager() {},
      resetLuckmailManager() {},
      setOauthLoginCodeDisplay() {},
      statusBar: { className: '' },
      syncAutoRunState() {},
      syncLatestState(patch) { syncedPatch = patch; },
      updateButtonStates() {},
      updateProgressCounter() {},
      updateRemovedPaymentWorkerUi() {},
      updateStatusDisplay() {},
    },
  });

  handlers.handleMessage({
    type: 'AUTO_RUN_RESET',
    payload: {
      registrationFreeRoute: 'no-2fa-free',
      currentNodeId: '',
      nodeStatuses: no2faResetStatuses,
    },
  }, {}, () => {});

  assert.equal(syncedPatch.registrationFreeRoute, 'no-2fa-free');
  assert.equal(syncedPatch.currentNodeId, '');
  assert.deepEqual(syncedPatch.nodeStatuses, no2faResetStatuses);
});
