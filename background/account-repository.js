(function attachAccountRepository(root, factory) {
  const api = factory(root);
  root.MultiPageAccountRepository = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createAccountRepositoryModule(root) {
  const ACCOUNT_RECORDS_STORAGE_KEY = 'accountRecordsV2';
  const MIGRATION_BACKUP_STORAGE_KEY = 'accountRecordsV2MigrationBackupV1';

  function getSchema() {
    if (root.MultiPageAccountRecordSchema) return root.MultiPageAccountRecordSchema;
    if (typeof require === 'function') return require('../shared/account-record-schema.js');
    throw new Error('Account record schema module is not loaded.');
  }

  function getMigration() {
    if (root.MultiPageAccountRecordMigration) return root.MultiPageAccountRecordMigration;
    if (typeof require === 'function') return require('./account-record-migration.js');
    throw new Error('Account record migration module is not loaded.');
  }

  function createRepositoryError(code, message, detail = {}) {
    const error = new Error(message);
    error.code = code;
    error.detail = detail;
    return error;
  }

  function createAccountRepository(deps = {}) {
    const chromeApi = deps.chromeApi || root.chrome;
    const now = typeof deps.now === 'function' ? deps.now : () => new Date().toISOString();
    const schema = deps.schema || getSchema();
    const migration = deps.migration || getMigration();
    let writeQueue = Promise.resolve();

    if (!chromeApi?.storage?.local) {
      throw createRepositoryError('ACCOUNT_STORAGE_UNAVAILABLE', '账号存储不可用。');
    }

    function normalizeId(accountId) {
      const id = schema.normalizeAccountId(accountId);
      if (!id) {
        throw createRepositoryError('ACCOUNT_ID_INVALID', '账号邮箱无效。');
      }
      return id;
    }

    async function readRoot() {
      const stored = await chromeApi.storage.local.get([ACCOUNT_RECORDS_STORAGE_KEY]);
      return schema.normalizeAccountRecordsRoot(stored?.[ACCOUNT_RECORDS_STORAGE_KEY]);
    }

    async function ensureMigrationBackup(rootValue) {
      const stored = await chromeApi.storage.local.get([MIGRATION_BACKUP_STORAGE_KEY]);
      if (stored?.[MIGRATION_BACKUP_STORAGE_KEY]) return;
      await chromeApi.storage.local.set({
        [MIGRATION_BACKUP_STORAGE_KEY]: {
          schemaVersion: 1,
          accountRecordsBeforeMigration: schema.normalizeAccountRecordsRoot(rootValue),
          createdAt: schema.normalizeIsoTimestamp(now()) || new Date().toISOString(),
          note: '旧存储键继续保留；此快照只记录迁移前的规范账号根。',
        },
      });
    }

    function enqueueWrite(operation) {
      const run = writeQueue.then(operation, operation);
      writeQueue = run.catch(() => {});
      return run;
    }

    async function writeRoot(nextRoot, options = {}) {
      const normalized = schema.normalizeAccountRecordsRoot(nextRoot);
      if (options.backupBeforeWrite !== false) {
        await ensureMigrationBackup(options.previousRoot || {});
      }
      await chromeApi.storage.local.set({ [ACCOUNT_RECORDS_STORAGE_KEY]: normalized });
      return normalized;
    }

    async function mutate(mutator, options = {}) {
      return enqueueWrite(async () => {
        const current = await readRoot();
        const next = await mutator(current);
        const normalized = schema.normalizeAccountRecordsRoot(next);
        const changed = JSON.stringify(normalized.items) !== JSON.stringify(current.items);
        if (!changed) return current;
        normalized.updatedAt = schema.normalizeIsoTimestamp(options.updatedAt || now()) || new Date().toISOString();
        return writeRoot(normalized, { previousRoot: current });
      });
    }

    async function getAccount(accountId) {
      const id = normalizeId(accountId);
      const rootValue = await readRoot();
      return rootValue.items[id] || null;
    }

    async function getAccounts() {
      const rootValue = await readRoot();
      return Object.values(rootValue.items).sort((left, right) => left.id.localeCompare(right.id));
    }

    async function upsertAccount(record = {}, context = {}) {
      const id = normalizeId(record.id || record.identity?.email || record.email);
      let result = null;
      await mutate((current) => {
        const currentRecord = current.items[id] || schema.createEmptyAccountRecord(id, {
          now: context.now || now(),
          source: context.source,
          providerId: context.providerId,
        });
        result = schema.mergeAccountRecord(currentRecord, record, { now: context.now || now() });
        return {
          ...current,
          items: { ...current.items, [id]: result },
        };
      }, context);
      return result;
    }

    async function patchAccount(accountId, patch = {}, context = {}) {
      const id = normalizeId(accountId);
      const existing = await getAccount(id);
      if (!existing && context.createIfMissing === false) {
        throw createRepositoryError('ACCOUNT_NOT_FOUND', '账号不存在。', { accountId: id });
      }
      return upsertAccount({ ...(existing || {}), ...patch, id }, context);
    }

    async function deleteAccount(accountId, context = {}) {
      const id = normalizeId(accountId);
      let deleted = false;
      await mutate((current) => {
        if (!current.items[id]) return current;
        const items = { ...current.items };
        delete items[id];
        deleted = true;
        return { ...current, items };
      }, context);
      return { accountId: id, deleted };
    }

    async function markAccountDeleted(accountId, context = {}) {
      const id = normalizeId(accountId);
      const existing = await getAccount(id) || schema.createEmptyAccountRecord(id, { now: context.now || now() });
      const deletedChannels = schema.REDEEM_CHANNELS.filter((channel) => context.channel === channel);
      return upsertAccount({
        ...existing,
        metadata: {
          ...existing.metadata,
          deleted: {
            ...(existing.metadata?.deleted || {}),
            marked: true,
            channels: Array.from(new Set([
              ...(Array.isArray(existing.metadata?.deleted?.channels) ? existing.metadata.deleted.channels : []),
              ...deletedChannels,
            ])),
            reasonCode: String(context.reasonCode || 'ACCOUNT_DELETED').trim(),
            at: schema.normalizeIsoTimestamp(context.now || now()),
          },
        },
      }, context);
    }

    async function updateLifecycle(accountId, lifecyclePatch = {}, context = {}) {
      const id = normalizeId(accountId);
      const existing = await getAccount(id) || schema.createEmptyAccountRecord(id, { now: context.now || now() });
      return upsertAccount({
        ...existing,
        lifecycle: {
          ...existing.lifecycle,
          ...lifecyclePatch,
          reasonCode: String(
            lifecyclePatch.reasonCode ?? existing.lifecycle.reasonCode ?? context.reasonCode ?? ''
          ).trim(),
        },
      }, context);
    }

    async function updateCredentials(accountId, credentialPatch = {}, context = {}) {
      const id = normalizeId(accountId);
      const existing = await getAccount(id) || schema.createEmptyAccountRecord(id, { now: context.now || now() });
      return upsertAccount({
        ...existing,
        credentials: { ...existing.credentials, ...credentialPatch },
      }, context);
    }

    async function updateRedemption(accountId, channel, redemptionPatch = {}, context = {}) {
      const id = normalizeId(accountId);
      const normalizedChannel = schema.normalizeRedeemChannel(channel);
      if (!normalizedChannel) {
        throw createRepositoryError('ACCOUNT_CHANNEL_INVALID', '兑换渠道无效。', { channel: String(channel || '') });
      }
      const existing = await getAccount(id) || schema.createEmptyAccountRecord(id, { now: context.now || now() });
      return upsertAccount({
        ...existing,
        redemption: {
          ...existing.redemption,
          [normalizedChannel]: {
            ...existing.redemption[normalizedChannel],
            ...redemptionPatch,
          },
        },
      }, context);
    }

    async function migrateLegacySources(sources = {}, context = {}) {
      return enqueueWrite(async () => {
        const current = await readRoot();
        const migrated = migration.buildAccountRecordsV2FromLegacy({
          ...sources,
          accountRecordsV2: current,
        }, { now: context.now || now() });
        if (JSON.stringify(migrated) === JSON.stringify(current)) {
          return { changed: false, root: current, accountCount: Object.keys(current.items).length };
        }
        const written = await writeRoot(migrated, { previousRoot: current });
        return { changed: true, root: written, accountCount: Object.keys(written.items).length };
      });
    }

    return {
      deleteAccount,
      getAccount,
      getAccounts,
      markAccountDeleted,
      migrateLegacySources,
      patchAccount,
      readRoot,
      updateCredentials,
      updateLifecycle,
      updateRedemption,
      upsertAccount,
    };
  }

  return {
    ACCOUNT_RECORDS_STORAGE_KEY,
    MIGRATION_BACKUP_STORAGE_KEY,
    createAccountRepository,
    createRepositoryError,
  };
});
