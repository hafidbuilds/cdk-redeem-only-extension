const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

globalThis.self = globalThis;
delete globalThis.MultiPageBackgroundSettingsDefaults;
delete require.cache[require.resolve('../background/bootstrap/settings-defaults.js')];
require('../background/bootstrap/settings-defaults.js');

test('settings defaults use V3 and omit removed CDK pool state', () => {
  const settings = globalThis.MultiPageBackgroundSettingsDefaults.create();
  const defaults = settings.PERSISTED_SETTING_DEFAULTS;
  assert.equal(settings.SETTINGS_EXPORT_SCHEMA_VERSION, 3);
  assert.equal(defaults.upiCredentialMembershipCheckTotpApiBaseUrl, 'https://cha.nerver.cc');
  for (const key of [
    'upiRedeemCdkeyPoolText', 'upiRedeemCdkeyUsage',
    'idealRedeemCdkeyPoolText', 'idealRedeemCdkeyUsage',
    'pixRedeemCdkeyPoolText', 'pixRedeemCdkeyUsage',
    'pixChannelRedeemCdkeyPoolText', 'pixChannelRedeemCdkeyUsage',
  ]) {
    assert.equal(Object.hasOwn(defaults, key), false, `${key} should be removed`);
  }
});

test('background settings normalization no longer recognizes CDK pool fields', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
  assert.doesNotMatch(source, /case '(?:upi|ideal|pix)(?:Channel)?RedeemCdkey(?:PoolText|Usage)':/);
});
