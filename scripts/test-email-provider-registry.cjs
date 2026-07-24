const test = require('node:test');
const assert = require('node:assert/strict');

require('../background/email/provider-registry.js');
const registry = globalThis.MultiPageEmailProviderRegistry.create();

test('provider definitions cover shared and dedicated providers', () => {
  const ids = registry.listProviderDefinitions().map((item) => item.id);
  assert.ok(ids.includes('luckmail-api'));
  assert.ok(ids.includes('outlook-email-plus'));
  assert.equal(registry.getProviderDefinition('hotmail-api').dedicatedUi, true);
  assert.ok(registry.getProviderDefinition('moemail').fields.some((field) => field.secret));
});

test('provider normalization keeps previous secret when input is empty', () => {
  const normalized = registry.normalizeProviderConfig('moemail', {
    baseUrl: 'https://mail.example.test/',
    apiKey: '',
  }, {
    previousConfig: { apiKey: 'secret-value' },
  });
  assert.equal(normalized.baseUrl, 'https://mail.example.test');
  assert.equal(normalized.apiKey, 'secret-value');
});

test('provider validation and redaction do not expose secret values', () => {
  const config = {
    baseUrl: 'https://mail.example.test',
    apiKey: 'secret-value',
  };
  const validation = registry.validateProviderConfig('moemail', config);
  assert.equal(validation.ok, true);
  const redacted = registry.redactProviderConfig('moemail', config);
  assert.equal(redacted.apiKey, 'se***');
  assert.doesNotMatch(JSON.stringify(redacted), /secret-value/);
});

test('connection test entry is side-effect free and uses supplied tester', async () => {
  let received;
  const result = await registry.testProviderConnection('moemail', {
    baseUrl: 'https://mail.example.test',
    apiKey: 'secret-value',
  }, {
    testConnection: async (config) => {
      received = config;
      return { ok: true, status: 204 };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(received.apiKey, 'secret-value');
});
