const test = require('node:test');
const assert = require('node:assert/strict');

const resultsApi = require('../shared/free-account-results.js');
const schema = require('../shared/account-record-schema.js');
const compatibility = require('../shared/account-compatibility-adapter.js');
const migrationApi = (() => {
  global.self = global;
  delete require.cache[require.resolve('../background/bootstrap/free-account-v3-migration.js')];
  require('../background/bootstrap/free-account-v3-migration.js');
  return global.MultiPageFreeAccountV3Migration;
})();
const serviceApi = require('../background/free-account-service.js');
const settingsTransferSecurity = require('../background/bootstrap/settings-transfer-security.js');

function createChrome(initialLocal = {}, options = {}) {
  const local = structuredClone(initialLocal);
  const session = {};
  function area(store, failSet = false) {
    return {
      get: async (keys) => {
        if (keys === null) return structuredClone(store);
        const list = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(list.filter((key) => Object.hasOwn(store, key)).map((key) => [key, structuredClone(store[key])]));
      },
      set: async (updates) => {
        if (failSet) throw new Error('fixture write failure');
        Object.assign(store, structuredClone(updates));
      },
      remove: async (keys) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key];
      },
    };
  }
  return {
    chrome: { storage: { local: area(local, options.failLocalSet), session: area(session) } },
    local,
    session,
  };
}

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  };
}

test('V3 result groups only explicit ineligible rows outside the Free group', () => {
  const normalized = resultsApi.normalizeResults({
    items: [
      { email: 'eligible@example.test', trialEligibilityStatus: 'eligible' },
      { email: 'unknown@example.test', trialEligibilityStatus: 'unknown' },
      { email: 'checking@example.test', trialEligibilityStatus: 'checking' },
      { email: 'failed@example.test', trialEligibilityStatus: 'failed' },
      { email: 'ineligible@example.test', trialEligibilityStatus: 'ineligible' },
      { email: 'paid@example.test', status: 'paid', redeemChannel: 'pix', cdkey: 'secret' },
    ],
  });
  assert.equal(normalized.schemaVersion, 3);
  assert.equal(normalized.items.length, 5);
  assert.equal(resultsApi.getItemGroup(normalized.items.find((item) => item.email === 'eligible@example.test')), 'free');
  assert.equal(resultsApi.getItemGroup(normalized.items.find((item) => item.email === 'unknown@example.test')), 'free');
  assert.equal(resultsApi.getItemGroup(normalized.items.find((item) => item.email === 'checking@example.test')), 'free');
  assert.equal(resultsApi.getItemGroup(normalized.items.find((item) => item.email === 'failed@example.test')), 'free');
  assert.equal(resultsApi.getItemGroup(normalized.items.find((item) => item.email === 'ineligible@example.test')), 'free-ineligible');
  assert.equal(normalized.ineligibleCount, 1);
  assert.equal(normalized.failedCount, 1);
  assert.equal(normalized.unknownCount, 1);
  assert.equal(normalized.items.some((item) => Object.hasOwn(item, 'cdkey')), false);
});

test('Free result items discard embedded runtime state while preserving account evidence', () => {
  const session = {
    user: { email: 'compact@example.test' },
    accessToken: 'session-at',
    expires: '2026-08-09T00:00:00.000Z',
  };
  const item = resultsApi.sanitizeFreeAccountItem({
    email: 'compact@example.test',
    password: 'pw',
    totpMfaSecret: 'JBSWY3DPEHPK3PXP',
    accessToken: 'at',
    session,
    sessionUpdatedAt: '2026-08-08T04:00:00.000Z',
    verificationUrl: 'https://mail.example.test/message/1',
    passkeyEnabled: true,
    passkeyCredentialId: 'credential-id',
    trialEligibilityStatus: 'eligible',
    trialEligibilityCheckedAt: '2026-08-08T04:01:00.000Z',
    freeAccountResults: { items: [{ email: 'nested@example.test' }] },
    accountRecordsV2: { items: { nested: {} } },
    accountRunHistory: [{ status: 'completed' }],
    customEmailPoolEntries: [{ email: 'pool@example.test' }],
    logs: [{ message: 'runtime log' }],
    runtimeState: { currentNodeId: 'check-trial-eligibility' },
  });

  assert.equal(item.email, 'compact@example.test');
  assert.equal(item.password, 'pw');
  assert.equal(item.totpMfaSecret, 'JBSWY3DPEHPK3PXP');
  assert.equal(item.accessToken, 'at');
  assert.deepEqual(item.session, session);
  assert.equal(item.passkeyCredentialId, 'credential-id');
  for (const key of ['freeAccountResults', 'accountRecordsV2', 'accountRunHistory', 'customEmailPoolEntries', 'logs', 'runtimeState']) {
    assert.equal(Object.hasOwn(item, key), false, `${key} must not be persisted inside a Free account item`);
  }
});

test('canonical V3 schema removes Plus and redemption dimensions while preserving validity', () => {
  const record = schema.normalizeAccountRecord({
    id: 'User@Example.test',
    credentials: { password: 'pw', accessToken: 'at', redemption: { upi: { status: 'success' } } },
    lifecycle: { membershipStatus: 'plus', validityStatus: 'deactivated', eligibilityStatus: 'ineligible' },
    metadata: { paidChannels: ['upi'], keep: true },
    redemption: { pix: { status: 'success' } },
  });
  assert.equal(record.schemaVersion, 3);
  assert.equal(record.id, 'user@example.test');
  assert.equal(record.lifecycle.membershipStatus, 'unknown');
  assert.equal(record.lifecycle.validityStatus, 'deactivated');
  assert.equal(Object.hasOwn(record, 'redemption'), false);
  assert.equal(Object.hasOwn(record.metadata, 'paidChannels'), false);
  assert.equal(record.metadata.keep, true);
});

test('canonical projection exposes only Free eligibility rows and keeps invalid accounts disabled', () => {
  const results = compatibility.projectAccountRecordsToMembershipResults({
    items: {
      'free@example.test': {
        id: 'free@example.test',
        credentials: { password: 'pw', accessToken: 'at' },
        lifecycle: { membershipStatus: 'free', eligibilityStatus: 'eligible', validityStatus: 'valid' },
      },
      'old-plus@example.test': {
        id: 'old-plus@example.test',
        credentials: { password: 'pw' },
        lifecycle: { membershipStatus: 'unknown', eligibilityStatus: 'unknown', validityStatus: 'valid' },
      },
      'disabled@example.test': {
        id: 'disabled@example.test',
        credentials: { password: 'pw' },
        lifecycle: { membershipStatus: 'free', eligibilityStatus: 'failed', validityStatus: 'deactivated' },
      },
    },
  });
  assert.deepEqual(results.items.map((item) => item.email), ['disabled@example.test', 'free@example.test']);
  assert.equal(results.items.find((item) => item.email === 'disabled@example.test').enabled, false);
});

test('one-time migration preserves Free credentials and ineligible evidence while purging CDK and Plus data', async () => {
  const harness = createChrome({
    upiCredentialMembershipCheckResults: {
      items: [
        { email: 'free@example.test', status: 'free', password: 'pw', accessToken: 'at', trialEligibilityStatus: 'failed' },
        { email: 'paid@example.test', status: 'paid', cdkey: 'secret', redeemChannel: 'upi' },
      ],
    },
    accountRecordsV2: {
      schemaVersion: 2,
      items: {
        'life@example.test': {
          id: 'life@example.test',
          credentials: { password: 'life-pw' },
          lifecycle: { membershipStatus: 'plus', eligibilityStatus: 'ineligible', validityStatus: 'invalid', reason: 'server-no' },
          redemption: { upi: { status: 'success' } },
          metadata: { paidChannels: ['upi'] },
        },
      },
    },
    accountTasksV1: { items: { old: { type: 'redeem' }, keep: { type: 'check_eligibility' } } },
    upiRedeemCdkeyPoolText: 'secret-cdk',
    idealRedeemCdkeyUsage: { secret: { usedAt: 1 } },
  });
  const migration = migrationApi.createFreeAccountV3Migration({ chrome: harness.chrome, resultsApi, logger: { info() {} } });
  const first = await migration.migrate('test');
  assert.equal(first.changed, true);
  assert.equal(harness.local.freeAccountToolV3MigrationCompleted, true);
  assert.equal(Object.hasOwn(harness.local, 'upiRedeemCdkeyPoolText'), false);
  assert.equal(Object.hasOwn(harness.local, 'idealRedeemCdkeyUsage'), false);
  assert.equal(first.results.items.some((item) => item.email === 'paid@example.test'), false);
  assert.equal(first.results.items.find((item) => item.email === 'free@example.test').password, 'pw');
  assert.equal(resultsApi.getItemGroup(first.results.items.find((item) => item.email === 'life@example.test')), 'free-ineligible');
  assert.equal(first.accountRecords.items['life@example.test'].lifecycle.validityStatus, 'invalid');
  assert.equal(Object.hasOwn(first.accountRecords.items['life@example.test'], 'redemption'), false);
  assert.deepEqual(Object.keys(harness.local.accountTasksV1.items), ['keep']);
  assert.equal((await migration.migrate('second')).changed, false);
});

test('migration write failure leaves all legacy data intact for the next startup', async () => {
  const harness = createChrome({
    upiCredentialMembershipCheckResults: { items: [{ email: 'retry@example.test', status: 'free' }] },
    upiRedeemCdkeyPoolText: 'still-here',
  }, { failLocalSet: true });
  const migration = migrationApi.createFreeAccountV3Migration({ chrome: harness.chrome, resultsApi, logger: { info() {} } });
  await assert.rejects(() => migration.migrate('failure'), /fixture write failure/);
  assert.equal(harness.local.upiRedeemCdkeyPoolText, 'still-here');
  assert.equal(harness.local.freeAccountToolV3MigrationCompleted, undefined);
});

test('completed V3 migration compacts recursively polluted Free results exactly once', async () => {
  const session = {
    user: { email: 'repair@example.test' },
    accessToken: 'session-at',
  };
  const harness = createChrome({
    freeAccountToolV3MigrationCompleted: true,
    freeAccountResults: {
      schemaVersion: 3,
      items: [{
        email: 'repair@example.test',
        password: 'pw',
        accessToken: 'at',
        session,
        passkeyEnabled: true,
        passkeyCredentialId: 'credential-id',
        trialEligibilityStatus: 'eligible',
        freeAccountResults: { items: [{ email: 'nested@example.test' }] },
        accountRecordsV2: { items: { nested: {} } },
        accountRunHistory: [{ status: 'completed' }],
        customEmailPoolEntries: [{ email: 'pool@example.test' }],
        logs: [{ message: 'runtime log' }],
        runtimeState: { currentNodeId: 'check-trial-eligibility' },
      }],
    },
  });
  const migration = migrationApi.createFreeAccountV3Migration({ chrome: harness.chrome, resultsApi, logger: { info() {} } });

  const repaired = await migration.migrate('repair');
  assert.equal(repaired.changed, true);
  assert.equal(harness.local.freeAccountResultsV3CompactionCompleted, true);
  assert.equal(harness.local.freeAccountResults.items.length, 1);
  assert.equal(harness.local.freeAccountResults.items[0].password, 'pw');
  assert.equal(harness.local.freeAccountResults.items[0].accessToken, 'at');
  assert.deepEqual(harness.local.freeAccountResults.items[0].session, session);
  assert.equal(harness.local.freeAccountResults.items[0].passkeyCredentialId, 'credential-id');
  assert.equal(Object.hasOwn(harness.local.freeAccountResults.items[0], 'freeAccountResults'), false);
  assert.equal(Object.hasOwn(harness.local.freeAccountResults.items[0], 'accountRecordsV2'), false);
  assert.equal(Object.hasOwn(harness.local.freeAccountResults.items[0], 'logs'), false);
  assert.equal((await migration.migrate('second-repair')).changed, false);
});

test('Free service persists eligible, ineligible and transient failures into the correct groups', async () => {
  const harness = createChrome();
  const replies = [
    response({ token_ok: true, eligible: true, email: 'eligible@example.test' }),
    response({ token_ok: true, eligible: false, reason: 'not-eligible', email: 'ineligible@example.test' }),
    response({ token_ok: true }),
    response({ token_ok: true }),
    response({ token_ok: true }),
  ];
  const service = serviceApi.createFreeAccountService({
    chrome: harness.chrome,
    fetchImpl: async () => replies.shift(),
    sleepWithStop: async () => {},
  });
  const result = await service.checkEligibility({
    settings: { gcashEligibilityApiToken: 'fixture-service-token' },
    credentials: [
      { email: 'eligible@example.test', accessToken: 'at-1' },
      { email: 'ineligible@example.test', accessToken: 'at-2' },
      { email: 'failed@example.test', accessToken: 'at-3' },
    ],
  });
  assert.deepEqual(result.eligible, ['eligible@example.test']);
  assert.deepEqual(result.ineligible, ['ineligible@example.test']);
  assert.deepEqual(result.retryable, ['failed@example.test']);
  assert.equal(resultsApi.getItemGroup(result.results.items.find((item) => item.email === 'ineligible@example.test')), 'free-ineligible');
  assert.equal(resultsApi.getItemGroup(result.results.items.find((item) => item.email === 'failed@example.test')), 'free');
});

test('Free service turns Chrome local quota failures into a structured final-save error', async () => {
  const chromeApi = {
    storage: {
      local: {
        get: async () => ({}),
        set: async () => {
          throw new Error('Resource::kQuotaBytes quota exceeded');
        },
      },
    },
  };
  const service = serviceApi.createFreeAccountService({ chrome: chromeApi });

  await assert.rejects(
    () => service.saveResults({ items: [] }),
    (error) => error.code === 'FREE_ACCOUNT_STORAGE_QUOTA_EXCEEDED'
      && error.preserveSignupSession === true
      && /重新加载扩展.*重试当前最终保存节点/.test(error.message)
  );
});

test('text and V3 JSON import, group TXT export and group deletion preserve eligibility evidence', async () => {
  const harness = createChrome();
  const service = serviceApi.createFreeAccountService({ chrome: harness.chrome });
  const textImport = await service.importResults({ text: 'plain@example.test----pw----JBSWY3DPEHPK3PXP----at' });
  assert.equal(textImport.items[0].trialEligibilityStatus, 'unknown');
  await service.importResults({ results: {
    schemaVersion: 3,
    items: [{
      email: 'no@example.test',
      password: 'pw2',
      totpMfaSecret: 'JBSWY3DPEHPK3PXP',
      accessToken: 'ineligible-at',
      recordedAt: '2026-08-05T03:00:00.000Z',
      trialEligibilityStatus: 'ineligible',
      trialEligibilityReason: 'server-no',
    }],
  } });
  const exported = await service.exportResults({ status: 'free-ineligible' });
  assert.match(exported.fileName, /free-ineligible-at-\d{8}-\d{6}\.txt$/);
  assert.equal(exported.mimeType, 'text/plain;charset=utf-8');
  assert.equal(
    exported.fileContent,
    'no@example.test---pw2---JBSWY3DPEHPK3PXP---ineligible-at---2026-08-05 11:00:00 +08:00\n'
  );
  assert.deepEqual(exported.results.items.map((item) => item.email), ['no@example.test']);
  assert.equal(exported.results.items[0].trialEligibilityReason, 'server-no');
  const deleted = await service.deleteResults({ status: 'free-ineligible' });
  assert.equal(deleted.deletedCount, 1);
  assert.deepEqual(deleted.results.items.map((item) => item.email), ['plain@example.test']);
});

test('Free exports can select AT or the complete step 10 Session payload', async () => {
  const harness = createChrome();
  const service = serviceApi.createFreeAccountService({ chrome: harness.chrome });
  const session = {
    user: { id: 'user-id', email: 'session@example.test', name: 'Fixture User' },
    account: { id: 'account-id', planType: 'free' },
    accessToken: 'session-access-token',
    expires: '2026-08-05T00:00:00.000Z',
  };
  await service.importResults({ results: {
    schemaVersion: 3,
    items: [
      {
        email: 'session@example.test',
        password: 'session-password',
        totpMfaSecret: 'JBSWY3DPEHPK3PXP',
        verificationUrl: 'https://mail.example.test/session',
        accessToken: 'session-access-token',
        session,
        recordedAt: 1785904323,
        trialEligibilityStatus: 'eligible',
      },
      {
        email: 'legacy@example.test',
        accessToken: 'legacy-at',
        no2faFreeRoute: true,
        recordedAt: '2026-08-05T02:00:00.000Z',
        trialEligibilityStatus: 'eligible',
      },
    ],
  } });

  const atExport = await service.exportResults({ status: 'free', credentialMode: 'access-token' });
  assert.match(atExport.fileName, /free-at-\d{8}-\d{6}\.txt$/);
  assert.equal(atExport.mimeType, 'text/plain;charset=utf-8');
  assert.equal(atExport.results.credentialExportMode, 'access-token');
  assert.equal(atExport.results.items.some((item) => Object.hasOwn(item, 'session')), false);
  assert.equal(atExport.results.items.find((item) => item.email === 'session@example.test').accessToken, 'session-access-token');
  assert.match(
    atExport.fileContent,
    /^session@example\.test---session-password---JBSWY3DPEHPK3PXP---https:\/\/mail\.example\.test\/session---session-access-token---2026-08-05 12:32:03 \+08:00$/m
  );
  assert.match(atExport.fileContent, /^legacy@example\.test---legacy-at---2026-08-05 10:00:00 \+08:00$/m);

  const sessionExport = await service.exportResults({ status: 'free', credentialMode: 'session' });
  assert.match(sessionExport.fileName, /free-session-\d{8}-\d{6}\.txt$/);
  assert.equal(sessionExport.results.credentialExportMode, 'session');
  assert.deepEqual(sessionExport.results.items.find((item) => item.email === 'session@example.test').session, session);
  assert.equal(sessionExport.results.items.find((item) => item.email === 'session@example.test').accessToken, undefined);
  assert.match(sessionExport.fileContent, new RegExp(
    `^session@example\\.test---session-password---JBSWY3DPEHPK3PXP---https://mail\\.example\\.test/session---${JSON.stringify(session).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}---2026-08-05 12:32:03 \\+08:00$`,
    'm'
  ));
  assert.doesNotMatch(sessionExport.fileContent, /^\s*\{/);
  assert.equal(sessionExport.missingSessionCount, 1);
  assert.deepEqual(sessionExport.missingSessionEmails, ['legacy@example.test']);
});

test('registration eligibility persists the complete Session used by step 10', async () => {
  const harness = createChrome();
  const session = {
    user: { email: 'registered@example.test' },
    account: { id: 'account-id' },
    accessToken: 'registered-at',
    expires: '2026-08-05T00:00:00.000Z',
  };
  const service = serviceApi.createFreeAccountService({
    chrome: harness.chrome,
    fetchImpl: async () => response({ token_ok: true, eligible: true, email: 'registered@example.test' }),
    getState: async () => ({ gcashEligibilityApiToken: 'fixture-service-token' }),
  });
  const result = await service.checkRegistrationEligibility({
    email: 'registered@example.test',
    accessToken: 'registered-at',
    session,
  });

  assert.deepEqual(result.item.session, session);
  assert.deepEqual(harness.local.freeAccountResults.items[0].session, session);
});

test('step 10 sends the documented GCash request with a separate Bearer token', async () => {
  const harness = createChrome();
  const requests = [];
  const logs = [];
  const serviceToken = 'fixture-gcash-service-token';
  const accessToken = 'fixture-chatgpt-access-token';
  const service = serviceApi.createFreeAccountService({
    chrome: harness.chrome,
    addLog: async (message) => logs.push(String(message)),
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return response({ gcash_pm_eligible: true, gcash_pm_eligible_reason: 'eligible' });
    },
  });

  const result = await service.checkEligibility({
    settings: {
      upiSubscriptionApiBaseUrl: 'https://eligibility.example.test',
      gcashEligibilityApiToken: serviceToken,
    },
    credentials: [{ email: 'gcash@example.test', accessToken }],
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://eligibility.example.test/api/v1/check');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.headers.authorization, `Bearer ${serviceToken}`);
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    token: accessToken,
    check_gcash_pm: true,
  });
  assert.deepEqual(result.eligible, ['gcash@example.test']);
  const observable = JSON.stringify({ result, logs, stored: harness.local });
  assert.doesNotMatch(observable, new RegExp(serviceToken));
});

test('step 10 fails clearly without a GCash service token and does not fetch', async () => {
  const harness = createChrome();
  let fetchCalls = 0;
  const service = serviceApi.createFreeAccountService({
    chrome: harness.chrome,
    fetchImpl: async () => {
      fetchCalls += 1;
      return response({ gcash_pm_eligible: true });
    },
  });

  const result = await service.checkRegistrationEligibility({
    email: 'missing-token@example.test',
    accessToken: 'fixture-chatgpt-access-token',
  });

  assert.equal(fetchCalls, 0);
  assert.equal(result.trialEligibilityStatus, 'failed');
  assert.equal(result.retryable, false);
  assert.equal(result.trialEligibilityReasonCode, 'GCASH_ELIGIBILITY_API_TOKEN_MISSING');
  assert.match(result.trialEligibilityReason, /GCash.*授权令牌/);
});

test('120-row text import keeps credentials and reports every Session as missing', async () => {
  const harness = createChrome();
  const service = serviceApi.createFreeAccountService({ chrome: harness.chrome });
  const rows = Array.from({ length: 120 }, (_, index) => {
    const suffix = String(index + 1).padStart(3, '0');
    return `fixture-${suffix}@example.test---password-${suffix}---JBSWY3DPEHPK3PXP---https://mail.example.test/${suffix}---eyJfixture.${suffix}.token`;
  });

  const imported = await service.importResults({ text: rows.join('\n'), source: 'fixture-120-import' });
  const selection = await service.listSessionFillTargets({ group: 'free', onlyMissing: true });

  assert.equal(imported.importedCount, 120);
  assert.equal(new Set(imported.items.map((item) => item.email)).size, 120);
  assert.equal(imported.items.every((item) => item.password && item.totpMfaSecret && item.verificationUrl && item.accessToken), true);
  assert.equal(imported.items.every((item) => !item.session), true);
  assert.equal(selection.count, 120);
});

test('Session fill selects only enabled missing rows and saves matching Session with its latest AT', async () => {
  const harness = createChrome({
    freeAccountResults: resultsApi.normalizeResults({
      items: [
        { email: 'target@example.test', password: 'pw', totpMfaSecret: 'JBSWY3DPEHPK3PXP', accessToken: 'old-at', trialEligibilityStatus: 'eligible' },
        { email: 'existing@example.test', enabled: true, session: { user: { email: 'existing@example.test' }, accessToken: 'existing-at' }, trialEligibilityStatus: 'eligible' },
        { email: 'disabled@example.test', enabled: false, password: 'pw', trialEligibilityStatus: 'eligible' },
        { email: 'other-group@example.test', enabled: true, password: 'pw', trialEligibilityStatus: 'ineligible' },
      ],
    }),
  });
  const progress = [];
  let releaseLogin;
  let markLoginStarted;
  const loginGate = new Promise((resolve) => { releaseLogin = resolve; });
  const loginStarted = new Promise((resolve) => { markLoginStarted = resolve; });
  const session = { user: { email: 'target@example.test' }, account: { id: 'acct' }, accessToken: 'new-at', expires: '2026-08-06T00:00:00.000Z' };
  const service = serviceApi.createFreeAccountService({
    chrome: harness.chrome,
    loginAndReadAccessTokenImpl: async () => {
      markLoginStarted();
      await loginGate;
      return { accessToken: 'new-at', session };
    },
  });

  const selection = await service.listSessionFillTargets({ group: 'free', onlyMissing: true });
  assert.deepEqual(selection.emails, ['target@example.test']);
  const fillPromise = service.fillSessions({ group: 'free', onlyMissing: true }, {
    onProgress: async (value) => progress.push(value),
  });
  await loginStarted;
  assert.equal(progress.at(-1).outcome, 'processing');
  assert.deepEqual(progress.at(-1).progress, { current: 1, total: 1 });
  releaseLogin();
  const result = await fillPromise;

  const stored = result.results.items.find((item) => item.email === 'target@example.test');
  assert.deepEqual(stored.session, session);
  assert.equal(stored.accessToken, 'new-at');
  assert.match(stored.sessionUpdatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(stored.accessTokenUpdatedAt, stored.sessionUpdatedAt);
  assert.equal(stored.trialEligibilityStatus, 'eligible');
  assert.deepEqual(result.completedEmails, ['target@example.test']);
  assert.equal(progress.at(-1).outcome, 'completed');
  assert.deepEqual(progress.at(-1).completedEmails, ['target@example.test']);
});

test('Session fill unwraps the Session reader response envelope before validation and storage', async () => {
  const harness = createChrome({
    freeAccountResults: resultsApi.normalizeResults({
      items: [{ email: 'wrapped@example.test', password: 'pw', trialEligibilityStatus: 'unknown' }],
    }),
  });
  const completeSession = {
    user: { email: 'wrapped@example.test' },
    account: { id: 'acct_wrapped' },
    accessToken: 'wrapped-at',
    expires: '2026-08-06T00:00:00.000Z',
  };
  const service = serviceApi.createFreeAccountService({
    chrome: harness.chrome,
    loginAndReadAccessTokenImpl: async () => ({
      accessToken: 'wrapped-at',
      session: {
        ok: true,
        status: 200,
        session: completeSession,
        accessToken: 'wrapped-at',
        email: 'wrapped@example.test',
      },
    }),
  });

  const result = await service.fillSessions({ group: 'free', onlyMissing: true });

  assert.deepEqual(result.completedEmails, ['wrapped@example.test']);
  assert.deepEqual(result.failedEmails, []);
  assert.deepEqual(result.results.items.find((item) => item.email === 'wrapped@example.test').session, completeSession);
});

test('Session email mismatch fails one row and continues with the next account', async () => {
  const harness = createChrome({
    freeAccountResults: resultsApi.normalizeResults({
      items: [
        { email: 'first@example.test', password: 'pw', trialEligibilityStatus: 'unknown' },
        { email: 'second@example.test', password: 'pw', trialEligibilityStatus: 'unknown' },
      ],
    }),
  });
  const service = serviceApi.createFreeAccountService({
    chrome: harness.chrome,
    loginAndReadAccessTokenImpl: async (credential) => credential.email === 'first@example.test'
      ? { accessToken: 'wrong-at', session: { user: { email: 'wrong@example.test' }, accessToken: 'wrong-at' } }
      : { accessToken: 'second-at', session: { user: { email: 'second@example.test' }, accessToken: 'second-at' } },
  });
  const progress = [];

  const result = await service.fillSessions({ group: 'free' }, {
    onProgress: async (value) => progress.push(value),
  });
  assert.deepEqual(result.failedEmails, ['first@example.test']);
  assert.deepEqual(result.completedEmails, ['second@example.test']);
  assert.equal(result.results.items.find((item) => item.email === 'first@example.test').session, undefined);
  assert.equal(result.results.items.find((item) => item.email === 'second@example.test').accessToken, 'second-at');
  const failedProgress = progress.find((item) => item.outcome === 'failed');
  assert.equal(failedProgress.errorCode, 'FREE_ACCOUNT_SESSION_EMAIL_MISMATCH');
  assert.match(failedProgress.errorMessage, /Session 与目标账号不一致/);
});

test('Session storage failure stops the batch after preserving earlier successful writes', async () => {
  const initial = resultsApi.normalizeResults({
    items: [
      { email: 'first@example.test', password: 'pw', trialEligibilityStatus: 'unknown' },
      { email: 'second@example.test', password: 'pw', trialEligibilityStatus: 'unknown' },
    ],
  });
  const local = { freeAccountResults: structuredClone(initial) };
  let writes = 0;
  const chromeApi = {
    storage: {
      local: {
        get: async (keys) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter((key) => Object.hasOwn(local, key)).map((key) => [key, structuredClone(local[key])])),
        set: async (updates) => {
          writes += 1;
          if (writes === 2) throw new Error('fixture quota failure');
          Object.assign(local, structuredClone(updates));
        },
      },
    },
  };
  const service = serviceApi.createFreeAccountService({
    chrome: chromeApi,
    loginAndReadAccessTokenImpl: async (credential) => ({
      accessToken: `${credential.email}-at`,
      session: { user: { email: credential.email }, accessToken: `${credential.email}-at` },
    }),
  });

  await assert.rejects(() => service.fillSessions({ group: 'free' }), /fixture quota failure/);
  assert.equal(local.freeAccountResults.items.find((item) => item.email === 'first@example.test').session.user.email, 'first@example.test');
  assert.equal(local.freeAccountResults.items.find((item) => item.email === 'second@example.test').session, undefined);
});

test('canonical account write failure stops Session fill and rolls back the current Free row', async () => {
  const harness = createChrome({
    freeAccountResults: resultsApi.normalizeResults({
      items: [{ email: 'canonical@example.test', password: 'pw', accessToken: 'old-at', trialEligibilityStatus: 'unknown' }],
    }),
  });
  const service = serviceApi.createFreeAccountService({
    chrome: harness.chrome,
    accountRepository: {
      updateCredentials: async () => { throw new Error('canonical fixture failure'); },
      updateLifecycle: async () => ({}),
    },
    loginAndReadAccessTokenImpl: async () => ({
      accessToken: 'new-at',
      session: { user: { email: 'canonical@example.test' }, accessToken: 'new-at' },
    }),
  });

  await assert.rejects(() => service.fillSessions({ group: 'free' }), /canonical fixture failure/);
  const stored = harness.local.freeAccountResults.items.find((item) => item.email === 'canonical@example.test');
  assert.equal(stored.accessToken, 'old-at');
  assert.equal(stored.session, undefined);
});

test('Session fill stop flag cancels at a safe account boundary', async () => {
  const harness = createChrome({
    freeAccountResults: resultsApi.normalizeResults({
      items: [{ email: 'stop@example.test', password: 'pw', trialEligibilityStatus: 'unknown' }],
    }),
  });
  const service = serviceApi.createFreeAccountService({
    chrome: harness.chrome,
    loginAndReadAccessTokenImpl: async () => {
      throw new Error('login should not start after stop');
    },
  });

  await assert.rejects(() => service.fillSessions({ group: 'free' }, {
    onProgress: async () => service.requestStop(),
  }), (error) => error?.code === 'FREE_ACCOUNT_CHECK_STOPPED');
});

test('global workflow stop is normalized as a task-level Session fill cancellation', async () => {
  const harness = createChrome({
    freeAccountResults: resultsApi.normalizeResults({
      items: [{ email: 'stale-stop@example.test', password: 'pw', trialEligibilityStatus: 'unknown' }],
    }),
  });
  let loginCalls = 0;
  const service = serviceApi.createFreeAccountService({
    chrome: harness.chrome,
    throwIfStopped: () => { throw new Error('自动运行已停止'); },
    loginAndReadAccessTokenImpl: async () => {
      loginCalls += 1;
      return {};
    },
  });

  await assert.rejects(
    () => service.fillSessions({ group: 'free' }),
    (error) => error?.code === 'FREE_ACCOUNT_CHECK_STOPPED' && error?.retryable === false
  );
  assert.equal(loginCalls, 0);
});

test('safe settings export never includes the stored ChatGPT Session payload', () => {
  const safe = settingsTransferSecurity.buildSafeMembershipResults({
    schemaVersion: 3,
    items: [{
      email: 'safe@example.test',
      accessToken: 'secret-at',
      session: { user: { email: 'safe@example.test' }, accessToken: 'secret-at', sessionToken: 'secret-session' },
      trialEligibilityStatus: 'eligible',
    }],
  });

  assert.equal(safe.items[0].email, 'safe@example.test');
  assert.equal(Object.hasOwn(safe.items[0], 'accessToken'), false);
  assert.equal(Object.hasOwn(safe.items[0], 'session'), false);
});

test('safe settings export omits the GCash service token', () => {
  const safe = settingsTransferSecurity.omitSensitiveFields({
    gcashEligibilityApiToken: 'fixture-secret-token',
    upiSubscriptionApiBaseUrl: 'https://eligibility.example.test',
  });

  assert.equal(Object.hasOwn(safe, 'gcashEligibilityApiToken'), false);
  assert.equal(safe.upiSubscriptionApiBaseUrl, 'https://eligibility.example.test');
});
