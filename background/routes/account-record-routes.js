(function attachAccountRecordRoutes(root, factory) {
  const api = factory();
  root.MultiPageAccountRecordRoutes = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createAccountRecordRoutesModule() {
  function createAccountRecordRoutes(deps = {}) {
    const {
      clearAccountRunHistory,
      deleteAccountRunHistoryRecords,
      getState,
      isAutoRunLockedState,
      accountRepository,
    } = deps;

    async function clearAccountRunHistoryRoute() {
      const state = await getState();
      if (isAutoRunLockedState(state)) {
        throw new Error('自动流程运行中，当前不能清理邮箱记录。');
      }
      if (typeof clearAccountRunHistory !== 'function') {
        return { ok: true, clearedCount: 0 };
      }
      const result = await clearAccountRunHistory(state);
      return { ok: true, ...result };
    }

    async function deleteAccountRunHistoryRecordsRoute(payload = {}) {
      const state = await getState();
      if (isAutoRunLockedState(state)) {
        throw new Error('自动流程运行中，当前不能删除邮箱记录。');
      }
      if (typeof deleteAccountRunHistoryRecords !== 'function') {
        return { ok: true, deletedCount: 0, remainingCount: 0 };
      }
      const recordIds = Array.isArray(payload?.recordIds) ? payload.recordIds : [];
      const result = await deleteAccountRunHistoryRecords(recordIds, state);
      return { ok: true, ...result };
    }

    async function getAccountRecordsV2Route() {
      if (!accountRepository?.readRoot) return { ok: true, schemaVersion: 2, items: {}, updatedAt: '' };
      const records = await accountRepository.readRoot();
      return { ok: true, ...records };
    }

    async function patchAccountRecordV2Route(payload = {}) {
      if (!accountRepository?.patchAccount) throw new Error('规范账号仓库尚未加载。');
      const record = await accountRepository.patchAccount(payload.accountId, payload.patch || {}, {
        source: 'account-record-route',
        reasonCode: payload.reasonCode,
      });
      return { ok: true, record };
    }

    return {
      CLEAR_ACCOUNT_RUN_HISTORY: clearAccountRunHistoryRoute,
      DELETE_ACCOUNT_RUN_HISTORY_RECORDS: deleteAccountRunHistoryRecordsRoute,
      GET_ACCOUNT_RECORDS_V2: getAccountRecordsV2Route,
      PATCH_ACCOUNT_RECORD_V2: patchAccountRecordV2Route,
    };
  }

  return {
    createAccountRecordRoutes,
  };
});
