const test = require('node:test');
const assert = require('node:assert/strict');

const { createCustomEmailPoolState } = require('../background/custom-email-pool-state.js');
const { createRegistrationAccountState } = require('../background/registration-account-state.js');

test('trial-ineligible registration account is excluded before the next account is selected', async () => {
  let state = {
    email: 'first@example.test',
    emailGenerator: 'custom-pool',
    selectedCustomEmailPoolEmail: 'first@example.test',
    customEmailPoolEntries: [
      { email: 'first@example.test', enabled: true, used: false },
      { email: 'second@example.test', enabled: true, used: false },
    ],
    customEmailPool: ['first@example.test', 'second@example.test'],
  };
  const lifecycleEvidence = [];
  const unavailableCalls = [];
  const mergeState = async (patch = {}) => {
    state = { ...state, ...patch };
  };
  const customEmailPoolStateRegistry = createCustomEmailPoolState({
    addLog: async () => {},
    broadcastDataUpdate: () => {},
    getState: async () => state,
    setPersistentSettings: mergeState,
    setState: mergeState,
  });
  const registry = createRegistrationAccountState({
    accountLifecycleService: {
      applyTrialEligibilityEvidence: async (email, evidence, options) => {
        lifecycleEvidence.push({ email, evidence, options });
        return { record: { id: email, lifecycle: { eligibilityStatus: evidence.status } } };
      },
    },
    accountRepository: { readRoot: async () => ({ schemaVersion: 2, items: {} }) },
    addLog: async () => {},
    broadcastDataUpdate: () => {},
    customEmailPoolStateRegistry,
    getState: async () => state,
    markCurrentRegistrationAccountUnavailable: async (_currentState, options) => {
      unavailableCalls.push(options);
      await mergeState({ email: null, registrationEmailState: { current: null } });
      return { updated: true };
    },
  });

  const result = await registry.markCurrentRegistrationAccountTrialIneligible(state, {
    email: 'first@example.test',
    reason: 'fixture-ineligible',
    checkedAt: '2026-08-03T00:00:00.000Z',
  });

  assert.equal(result.updated, true);
  assert.equal(lifecycleEvidence.length, 1);
  assert.equal(lifecycleEvidence[0].email, 'first@example.test');
  assert.equal(lifecycleEvidence[0].evidence.status, 'ineligible');
  assert.equal(unavailableCalls.length, 1);
  assert.equal(unavailableCalls[0].skipCustomEmailPool, true);
  assert.equal(state.customEmailPoolEntries[0].trialEligibilityStatus, 'ineligible');
  assert.equal(state.selectedCustomEmailPoolEmail, 'second@example.test');
  assert.equal(customEmailPoolStateRegistry.getCustomEmailPoolEmailForRun(state, 2), 'second@example.test');
});

test('trial-ineligible registration account retires a non-pool provider source', async () => {
  const state = {
    email: 'provider-account@example.test',
    emailGenerator: 'hotmail',
    mailProvider: 'hotmail',
    currentHotmailAccountId: 'provider-account-1',
  };
  const lifecycleEvidence = [];
  const unavailableCalls = [];
  const registry = createRegistrationAccountState({
    accountLifecycleService: {
      applyTrialEligibilityEvidence: async (email, evidence) => {
        lifecycleEvidence.push({ email, evidence });
        return { id: email, lifecycle: { eligibilityStatus: evidence.status } };
      },
    },
    accountRepository: { readRoot: async () => ({ schemaVersion: 2, items: {} }) },
    addLog: async () => {},
    broadcastDataUpdate: () => {},
    customEmailPoolStateRegistry: {
      markCurrentCustomEmailPoolEntryTrialIneligible: async () => ({ updated: false }),
    },
    getState: async () => state,
    markCurrentRegistrationAccountUnavailable: async (_currentState, options) => {
      unavailableCalls.push(options);
      return { updated: true };
    },
  });

  const result = await registry.markCurrentRegistrationAccountTrialIneligible(state, {
    reason: 'fixture-ineligible',
  });

  assert.equal(result.updated, true);
  assert.equal(result.poolUpdated, false);
  assert.equal(result.sourceUpdated, true);
  assert.equal(lifecycleEvidence[0].email, 'provider-account@example.test');
  assert.equal(lifecycleEvidence[0].evidence.status, 'ineligible');
  assert.equal(unavailableCalls.length, 1);
  assert.equal(unavailableCalls[0].reason, 'trial_ineligible');
  assert.equal(unavailableCalls[0].skipCustomEmailPool, true);
});
