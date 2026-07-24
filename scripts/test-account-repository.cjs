const assert = require('node:assert/strict');
const test = require('node:test');

require('../shared/account-record-schema.js');
require('../background/account-record-migration.js');
const repositoryApi = require('../background/account-repository.js');

function createChromeStorage(initial = {}) {
  const store = structuredClone(initial);
  return {
    store,
    chromeApi: {
      storage: {
        local: {
          async get(keys) {
            const selected = {};
            for (const key of Array.isArray(keys) ? keys : [keys]) {
              if (Object.hasOwn(store, key)) selected[key] = structuredClone(store[key]);
            }
            return selected;
          },
          async set(values) {
            Object.assign(store, structuredClone(values));
          },
        },
      },
    },
  };
}

test('repository is the canonical write entry and preserves other channel state', async () => {
  const storage = createChromeStorage();
  const repository = repositoryApi.createAccountRepository({
    chromeApi: storage.chromeApi,
    now: () => '2026-07-25T04:00:00.000Z',
  });
  await repository.upsertAccount({
    id: ' Repo@Example.com ',
    lifecycle: { validityStatus: 'valid', membershipStatus: 'free' },
  });
  await repository.updateRedemption('repo@example.com', 'upi', { status: 'succeeded' });
  await repository.updateRedemption('repo@example.com', 'pix', { status: 'failed', failureCount: 1 });
  await repository.updateLifecycle('repo@example.com', { membershipStatus: 'plus', membershipChannel: 'upi', reasonCode: 'MEMBERSHIP_VERIFIED' });

  const record = await repository.getAccount('REPO@example.com');
  assert.equal(record.id, 'repo@example.com');
  assert.equal(record.redemption.upi.status, 'succeeded');
  assert.equal(record.redemption.ideal.status, 'idle');
  assert.equal(record.redemption.pix.status, 'failed');
  assert.equal(record.lifecycle.reasonCode, 'MEMBERSHIP_VERIFIED');
  assert.ok(storage.store.accountRecordsV2);
  assert.ok(storage.store.accountRecordsV2MigrationBackupV1);
});

test('repository migration retains old source keys and does not rewrite an unchanged root', async () => {
  const storage = createChromeStorage({
    customEmailPoolEntries: [{ email: 'kept@example.com' }],
  });
  const repository = repositoryApi.createAccountRepository({
    chromeApi: storage.chromeApi,
    now: () => '2026-07-25T05:00:00.000Z',
  });
  const source = { customEmailPoolEntries: storage.store.customEmailPoolEntries };
  const first = await repository.migrateLegacySources(source);
  const second = await repository.migrateLegacySources(source);

  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.deepEqual(storage.store.customEmailPoolEntries, [{ email: 'kept@example.com' }]);
  assert.equal(second.accountCount, 1);
});

test('repository rejects invalid account IDs and invalid channels with structured codes', async () => {
  const storage = createChromeStorage();
  const repository = repositoryApi.createAccountRepository({ chromeApi: storage.chromeApi });
  await assert.rejects(repository.upsertAccount({ id: 'invalid' }), { code: 'ACCOUNT_ID_INVALID' });
  await assert.rejects(repository.updateRedemption('valid@example.com', 'shared', {}), { code: 'ACCOUNT_CHANNEL_INVALID' });
});
