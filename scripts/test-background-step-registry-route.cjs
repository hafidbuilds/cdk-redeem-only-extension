const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadGetStepRegistryForState() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
  const start = source.indexOf('function getStepRegistryForState(state = {})');
  const end = source.indexOf('async function requestOAuthUrlFromPanel', start);
  assert.ok(start >= 0 && end > start, 'getStepRegistryForState source should be extractable');

  const registries = {
    normal: { id: 'normal' },
    full2fa: { id: 'full-2fa' },
    no2fa: { id: 'no-2fa-free' },
    passkey: { id: 'passkey-free' },
    localNoRt: { id: 'local-cpa-json-no-rt' },
  };
  const context = {
    DEFAULT_ACTIVE_FLOW_ID: 'openai',
    getPanelMode: (state = {}) => state.panelMode || 'local-cpa-json',
    isPlusModeState: (state = {}) => Boolean(state.plusModeEnabled),
    localCpaJsonNoRtStepRegistry: registries.localNoRt,
    no2faFreeStepRegistry: registries.no2fa,
    normalStepRegistry: registries.normal,
    normalizeRegistrationFreeRoute: (value = '') => {
      const normalized = String(value || '').trim().toLowerCase();
      return ['no-2fa-free', 'passkey-free'].includes(normalized) ? normalized : 'full-2fa';
    },
    passkeyFreeStepRegistry: registries.passkey,
    plusUpiStepRegistry: registries.full2fa,
    result: null,
  };
  vm.runInNewContext(`${source.slice(start, end)}\nresult = getStepRegistryForState;`, context);
  return { getStepRegistryForState: context.result, registries };
}

test('free registration routes select their own registry without the removed Plus mode flag', () => {
  const { getStepRegistryForState, registries } = loadGetStepRegistryForState();

  assert.equal(getStepRegistryForState({ registrationFreeRoute: 'no-2fa-free', plusModeEnabled: false }), registries.no2fa);
  assert.equal(getStepRegistryForState({ registrationFreeRoute: 'passkey-free', plusModeEnabled: false }), registries.passkey);
});

test('full 2FA and local no-RT registry selection keep their existing behavior', () => {
  const { getStepRegistryForState, registries } = loadGetStepRegistryForState();

  assert.equal(getStepRegistryForState({ registrationFreeRoute: 'full-2fa', plusModeEnabled: false }), registries.normal);
  assert.equal(getStepRegistryForState({ registrationFreeRoute: 'full-2fa', plusModeEnabled: true }), registries.full2fa);
  assert.equal(getStepRegistryForState({ panelMode: 'local-cpa-json-no-rt', registrationFreeRoute: 'no-2fa-free' }), registries.localNoRt);
});
