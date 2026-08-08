(function attachSidepanelAccountRecordsManager(globalScope) {
  function createAccountRecordsManager(context = {}) {
    const { state = {}, dom = {}, helpers = {}, runtime = {} } = context;
    const normalizeText = (value = '') => String(value || '').trim();
    const normalizeEmail = (value = '') => normalizeText(value).toLowerCase();
    const resultsApi = globalScope.MultiPageFreeAccountResults || {};
    let eventsBound = false;
    let checkingEmail = '';
    let loginEmail = '';
    let busy = false;
    let includeVerificationUrl = true;
    let exportCredentialMode = 'access-token';
    let sessionTasks = [];
    let sessionTaskPollTimer = null;
    let panelOpen = false;

    function escapeHtml(value = '') {
      if (typeof helpers.escapeHtml === 'function') return helpers.escapeHtml(String(value || ''));
      return String(value || '').replace(/[&<>'"]/g, (char) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
      }[char]));
    }

    function getResults(currentState = state.getLatestState?.() || {}) {
      const source = currentState.freeAccountResults || {};
      return typeof resultsApi.normalizeResults === 'function'
        ? resultsApi.normalizeResults(source)
        : { schemaVersion: 3, items: [], ...source };
    }

    function syncResults(results) {
      if (!results) return;
      state.syncLatestState?.({ freeAccountResults: results });
    }

    function getRows(results = getResults()) {
      return (Array.isArray(results.items) ? results.items : [])
        .map((row) => ({ ...row, email: normalizeEmail(row?.email) }))
        .filter((row) => row.email);
    }

    function getRowByEmail(email = '') {
      const target = normalizeEmail(email);
      return getRows().find((row) => row.email === target) || null;
    }

    function hasCompleteSession(row = {}) {
      return typeof resultsApi.hasCompleteSession === 'function'
        ? resultsApi.hasCompleteSession(row)
        : Boolean(row?.session?.user?.email && (row?.session?.accessToken || row?.session?.access_token));
    }

    function getSessionTaskGroup(task = {}) {
      return normalizeText(task?.payload?.group || task?.checkpoint?.group) === 'free-ineligible'
        ? 'free-ineligible'
        : 'free';
    }

    function getSessionTask(group = 'free') {
      const normalizedGroup = group === 'free-ineligible' ? 'free-ineligible' : 'free';
      return sessionTasks.find((task) => task?.type === 'fill_session' && getSessionTaskGroup(task) === normalizedGroup) || null;
    }

    function isSessionTaskActive(task = getSessionTask()) {
      return ['pending', 'running', 'cancel_requested'].includes(normalizeText(task?.status));
    }

    function hasActiveSessionTask() {
      return sessionTasks.some((task) => task?.type === 'fill_session' && isSessionTaskActive(task));
    }

    function clearSessionTaskPoll() {
      if (sessionTaskPollTimer) globalScope.clearTimeout?.(sessionTaskPollTimer);
      sessionTaskPollTimer = null;
    }

    function scheduleSessionTaskPoll() {
      clearSessionTaskPoll();
      if (!panelOpen || !hasActiveSessionTask()) return;
      sessionTaskPollTimer = globalScope.setTimeout?.(() => {
        sessionTaskPollTimer = null;
        void refreshResults().catch(() => null).finally(() => {
          render();
          scheduleSessionTaskPoll();
        });
      }, 1200);
    }

    function hasLoginMaterial(row = {}) {
      return Boolean(
        normalizeText(row.password || row.gptPassword)
        && (
          row.no2faFreeRoute === true
          || normalizeText(row.totpMfaSecret || row.totpSecret)
          || row.passkeyEnabled === true
          || row.passkeyPrivateJwk
        )
      );
    }

    function buildCredential(row = {}) {
      return {
        email: normalizeEmail(row.email),
        password: normalizeText(row.password || row.gptPassword),
        gptPassword: normalizeText(row.gptPassword || row.password),
        totpMfaSecret: normalizeText(row.totpMfaSecret || row.totpSecret),
        totpSecret: normalizeText(row.totpSecret || row.totpMfaSecret),
        no2faFreeRoute: row.no2faFreeRoute === true,
        accessToken: normalizeText(row.accessToken),
        session: row.session && typeof row.session === 'object' && !Array.isArray(row.session) ? row.session : null,
        verificationUrl: normalizeText(row.verificationUrl),
        passkeyEnabled: row.passkeyEnabled === true,
        passkeyCredentialId: normalizeText(row.passkeyCredentialId),
        passkeyFactorId: normalizeText(row.passkeyFactorId),
        passkeyRpId: normalizeText(row.passkeyRpId),
        passkeyUserHandle: normalizeText(row.passkeyUserHandle),
        passkeyPrivateJwk: row.passkeyPrivateJwk || null,
        passkeyPublicKeyCose: row.passkeyPublicKeyCose || null,
        passkeySignCount: row.passkeySignCount,
        passkeyAlg: row.passkeyAlg,
      };
    }

    function getSettingsPayload() {
      const currentState = state.getLatestState?.() || {};
      return {
        upiCredentialMembershipCheckTotpApiBaseUrl: normalizeText(currentState.upiCredentialMembershipCheckTotpApiBaseUrl || 'https://cha.nerver.cc'),
        upiCredentialMembershipCheckTotpLookupKey: normalizeText(currentState.upiCredentialMembershipCheckTotpLookupKey),
      };
    }

    function formatTime(value = '') {
      const timestamp = Date.parse(String(value || ''));
      if (!Number.isFinite(timestamp)) return '--:--';
      return new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      }).format(new Date(timestamp));
    }

    function getStatusMeta(row = {}) {
      if (normalizeEmail(checkingEmail) === normalizeEmail(row.email)) {
        return { className: 'pending', label: '检测中', detail: '正在重新检测试用资格' };
      }
      if (normalizeEmail(loginEmail) === normalizeEmail(row.email)) {
        return { className: 'pending', label: '登录中', detail: '正在登录账号' };
      }
      const status = typeof resultsApi.getItemEligibilityStatus === 'function'
        ? resultsApi.getItemEligibilityStatus(row)
        : normalizeText(row.trialEligibilityStatus || 'unknown').toLowerCase();
      const detail = normalizeText(row.trialEligibilityReason || row.reason);
      if (status === 'eligible') return { className: 'success', label: '有试用资格', detail: detail || '已确认有试用资格' };
      if (status === 'ineligible') return { className: 'failed', label: '无试用资格', detail: detail || '服务端明确返回无试用资格' };
      if (status === 'failed') return { className: 'failed', label: '资格检测失败', detail: detail || '临时失败，账号保留在 Free 组' };
      if (status === 'checking') return { className: 'pending', label: '检测中', detail: detail || '资格检测进行中' };
      return { className: 'pending', label: '未检测资格', detail: detail || '等待资格检测' };
    }

    const rendererFactory = globalScope.SidepanelAccountRecordsMembershipResultsRenderer?.createAccountRecordsMembershipResultsRenderer;
    if (typeof rendererFactory !== 'function') throw new Error('Free account results renderer is not loaded.');
    const membershipRenderer = rendererFactory({
      dom,
      state,
      escapeHtml,
      formatAccountRecordTime: formatTime,
      getUpiCredentialMembershipCheckResults: getResults,
      buildUpiCredentialMembershipDisplayRows: getRows,
      normalizeUpiCredentialMembershipEmail: normalizeEmail,
      normalizeUpiCredentialMembershipText: normalizeText,
      getUpiCredentialMembershipRowStatusMeta: getStatusMeta,
      hasUpiCredentialMembershipLoginMaterial: hasLoginMaterial,
      isAutoRunRecordDisplayRunning: (currentState = {}) => Boolean(currentState.autoRunning),
      getUpiCredentialMembershipCheckBusy: () => busy,
      getUpiCredentialMembershipCheckingEmail: () => checkingEmail,
      getUpiCredentialMembershipLoginEmail: () => loginEmail,
      getFreeExportIncludeVerificationUrl: () => includeVerificationUrl,
      getFreeExportCredentialMode: () => exportCredentialMode,
      getFreeSessionFillTask: getSessionTask,
      isFreeSessionFillActive: hasActiveSessionTask,
    });

    async function refreshResults() {
      const [response, taskResponse] = await Promise.all([
        runtime.sendMessage?.({ type: 'GET_FREE_ACCOUNT_RESULTS', source: 'sidepanel', payload: {} }),
        runtime.sendMessage?.({ type: 'GET_ACCOUNT_TASKS', source: 'sidepanel', payload: {} }).catch?.(() => null),
      ]);
      if (response?.error) throw new Error(response.error);
      if (response?.results) syncResults(response.results);
      if (Array.isArray(taskResponse?.tasks)) sessionTasks = taskResponse.tasks;
      return response?.results || getResults();
    }

    function render(currentState = state.getLatestState?.() || {}) {
      if (currentState.freeAccountResults && currentState !== state.getLatestState?.()) syncResults(currentState.freeAccountResults);
      const results = getResults(currentState);
      if (dom.accountRecordsMeta) dom.accountRecordsMeta.textContent = `Free 账号 ${results.items.length} 个`;
      membershipRenderer.renderUpiCredentialMembershipCheckResults();
    }

    function groupRows(group = 'free') {
      return getRows().filter((row) => {
        const itemGroup = resultsApi.getItemGroup?.(row) || 'free';
        return itemGroup === group && row.enabled !== false;
      });
    }

    async function runBusy(action) {
      if (busy || state.getLatestState?.()?.autoRunning || hasActiveSessionTask()) return;
      busy = true;
      render();
      try {
        await action();
      } catch (error) {
        helpers.showToast?.(error?.message || String(error), 'error');
      } finally {
        busy = false;
        await refreshResults().catch(() => null);
        render();
      }
    }

    async function checkGroup(group = 'free') {
      const credentials = groupRows(group).map(buildCredential);
      if (!credentials.length) return helpers.showToast?.('当前分组没有可复检的启用账号。', 'warn', 1800);
      await runBusy(async () => {
        const response = await runtime.sendMessage?.({
          type: 'CHECK_FREE_ACCOUNT_ELIGIBILITY', source: 'sidepanel',
          payload: { source: group === 'free-ineligible' ? 'ineligible-free-recheck' : 'free-recheck', credentials, settings: getSettingsPayload() },
        });
        if (response?.error) throw new Error(response.error);
        syncResults(response?.results);
        helpers.showToast?.(`资格复检完成：有资格 ${response?.eligible?.length || 0}，无资格 ${response?.ineligible?.length || 0}，可重试 ${response?.retryable?.length || 0}。`, 'success', 2800);
      });
    }

    async function checkOne(email = '') {
      const row = getRowByEmail(email);
      if (!row || row.enabled === false || checkingEmail) return;
      checkingEmail = row.email;
      await runBusy(async () => {
        const response = await runtime.sendMessage?.({
          type: 'CHECK_FREE_ACCOUNT_ELIGIBILITY', source: 'sidepanel',
          payload: { source: 'single-free-eligibility-check', credentials: [buildCredential(row)], settings: getSettingsPayload() },
        });
        if (response?.error) throw new Error(response.error);
        syncResults(response?.results);
      });
      checkingEmail = '';
      render();
    }

    async function login(email = '') {
      const row = getRowByEmail(email);
      if (!row || !hasLoginMaterial(row) || loginEmail) return;
      loginEmail = row.email;
      await runBusy(async () => {
        const response = await runtime.sendMessage?.({
          type: 'LOGIN_FREE_ACCOUNT', source: 'sidepanel',
          payload: { email: row.email, source: 'row-login', readAccessToken: false, credential: buildCredential(row), settings: getSettingsPayload() },
        });
        if (response?.error) throw new Error(response.error);
        syncResults(response?.results);
        helpers.showToast?.(`${row.email} 登录完成。`, 'success', 2000);
      });
      loginEmail = '';
      render();
    }

    async function fillAccessTokens(group = 'free') {
      const credentials = groupRows(group).filter((row) => !normalizeText(row.accessToken)).map(buildCredential);
      if (!credentials.length) return helpers.showToast?.('当前分组没有缺 AT 的启用账号。', 'warn', 1800);
      await runBusy(async () => {
        const response = await runtime.sendMessage?.({
          type: 'FILL_FREE_ACCOUNT_ACCESS_TOKENS', source: 'sidepanel',
          payload: { source: 'free-fill-at', credentials, settings: getSettingsPayload() },
        });
        if (response?.error) throw new Error(response.error);
        syncResults(response?.results);
      });
    }

    async function refreshAccessTokens(group = 'free') {
      const credentials = groupRows(group).filter((row) => normalizeText(row.accessToken)).map(buildCredential);
      if (!credentials.length) return helpers.showToast?.('当前分组没有带 AT 的启用账号。', 'warn', 1800);
      await runBusy(async () => {
        const response = await runtime.sendMessage?.({
          type: 'REFRESH_FREE_ACCOUNT_ACCESS_TOKENS', source: 'sidepanel',
          payload: { source: 'free-refresh-at', credentials, settings: getSettingsPayload() },
        });
        if (response?.error) throw new Error(response.error);
        syncResults(response?.results);
      });
    }

    async function startSessionFill(group = 'free') {
      if (busy || hasActiveSessionTask() || state.getLatestState?.()?.autoRunning) return;
      const targets = groupRows(group).filter((row) => !hasCompleteSession(row));
      if (!targets.length) return helpers.showToast?.('当前分组没有缺 Session 的启用账号。', 'warn', 1800);
      const confirmed = await helpers.openConfirmModal?.({
        title: `补充 Session（${targets.length} 个账号）`,
        message: `任务会按顺序逐个登录 ${targets.length} 个账号，并切换当前 Chrome 中的 ChatGPT Cookie。开始后将退出当前 ChatGPT 登录，结束时浏览器可能停留在最后一个成功账号。每成功一个账号都会立即保存，完成后自动下载 Session TXT。`,
        confirmLabel: '开始补充 Session',
        confirmVariant: 'btn-primary',
      });
      if (!confirmed) return;
      busy = true;
      render();
      try {
        const response = await runtime.sendMessage?.({
          type: 'START_FILL_FREE_ACCOUNT_SESSIONS',
          source: 'sidepanel',
          payload: {
            group,
            includeVerificationUrl: group === 'free' && includeVerificationUrl,
            onlyMissing: true,
            autoExport: true,
          },
        });
        if (response?.error) throw new Error(response.error);
        helpers.showToast?.(`已开始补充 Session：${response?.count || targets.length} 个账号。`, 'success', 2200);
      } catch (error) {
        helpers.showToast?.(error?.message || String(error), 'error');
      } finally {
        busy = false;
        await refreshResults().catch(() => null);
        render();
        scheduleSessionTaskPoll();
      }
    }

    async function resumeSessionFill(taskId = '') {
      if (!normalizeText(taskId) || busy || hasActiveSessionTask() || state.getLatestState?.()?.autoRunning) return;
      try {
        const response = await runtime.sendMessage?.({
          type: 'RESUME_FREE_ACCOUNT_SESSION_FILL',
          source: 'sidepanel',
          payload: { taskId: normalizeText(taskId) },
        });
        if (response?.error) throw new Error(response.error);
        helpers.showToast?.(`已继续补充 Session，剩余约 ${response?.remainingCount || 0} 个账号。`, 'success', 2200);
      } catch (error) {
        helpers.showToast?.(error?.message || String(error), 'error');
      } finally {
        await refreshResults().catch(() => null);
        render();
        scheduleSessionTaskPoll();
      }
    }

    async function stopSessionFill(taskId = '') {
      try {
        const response = await runtime.sendMessage?.({
          type: 'STOP_FREE_ACCOUNT_SESSION_FILL',
          source: 'sidepanel',
          payload: { taskId: normalizeText(taskId) },
        });
        if (response?.error) throw new Error(response.error);
        helpers.showToast?.('已请求停止，将在当前账号到达安全边界后退出。', 'warn', 2400);
      } catch (error) {
        helpers.showToast?.(error?.message || String(error), 'error');
      } finally {
        await refreshResults().catch(() => null);
        render();
        scheduleSessionTaskPoll();
      }
    }

    async function exportGroup(group = 'free') {
      const rows = groupRows(group);
      if (!rows.length) return helpers.showToast?.('当前分组没有可导出的账号。', 'warn', 1800);
      const response = await runtime.sendMessage?.({
        type: 'EXPORT_FREE_ACCOUNT_RESULTS', source: 'sidepanel',
        payload: {
          status: group,
          emails: rows.map((row) => row.email),
          includeVerificationUrl: group === 'free' && includeVerificationUrl,
          credentialMode: exportCredentialMode,
        },
      });
      if (response?.error) throw new Error(response.error);
      await helpers.downloadTextFile?.(
        response.fileContent || '',
        response.fileName || `${group}.txt`,
        response.mimeType || 'text/plain;charset=utf-8'
      );
      if (response.missingSessionCount > 0) {
        helpers.showToast?.(`已导出；其中 ${response.missingSessionCount} 个旧账号没有注册最终步骤保存的完整 Session。`, 'warn', 3200);
      } else {
        helpers.showToast?.(`已导出 ${rows.length} 个账号（${exportCredentialMode === 'session' ? 'Session' : 'AT'}）。`, 'success', 2200);
      }
    }

    async function deleteRows(emails = [], group = '') {
      const normalized = [...new Set(emails.map(normalizeEmail).filter(Boolean))];
      if (!normalized.length) return;
      const confirmed = await helpers.openConfirmModal?.({
        title: group ? `删除${group === 'free-ineligible' ? '无资格 Free' : 'Free'}分组` : '删除 Free 账号',
        message: `确认删除 ${normalized.length} 条 Free 账号记录吗？账号运行历史不会被删除。`,
        confirmLabel: '确认删除', confirmVariant: 'btn-danger',
      });
      if (!confirmed) return;
      await runBusy(async () => {
        const response = await runtime.sendMessage?.({ type: 'DELETE_FREE_ACCOUNT_RESULTS', source: 'sidepanel', payload: { status: group, emails: normalized } });
        if (response?.error) throw new Error(response.error);
        syncResults(response?.results);
      });
    }

    async function setEnabled(email = '', enabled = true) {
      const row = getRowByEmail(email);
      if (!row) return;
      const nextItems = getRows().map((item) => item.email === row.email ? { ...item, enabled } : item);
      const nextResults = resultsApi.normalizeResults?.({ ...getResults(), items: nextItems, updatedAt: new Date().toISOString() }) || { ...getResults(), items: nextItems };
      syncResults(nextResults);
      await runtime.sendMessage?.({
        type: 'IMPORT_FREE_ACCOUNT_RESULTS', source: 'sidepanel',
        payload: { source: 'toggle-enabled', results: nextResults },
      }).then((response) => {
        if (response?.error) throw new Error(response.error);
        syncResults(response?.results);
      }).catch((error) => helpers.showToast?.(`更新启用状态失败：${error.message}`, 'error'));
      render();
    }

    async function importFile(event) {
      const input = event?.target;
      const file = input?.files?.[0];
      if (input) input.value = '';
      if (!file) return;
      const text = await file.text();
      if (!text.trim()) return helpers.showToast?.('导入文件为空。', 'warn', 1800);
      await runBusy(async () => {
        let payload = { source: 'free-import', text };
        if (/^\s*[{[]/.test(text)) {
          try { payload = { source: 'free-v3-json', results: JSON.parse(text) }; } catch { /* plain text */ }
        }
        const response = await runtime.sendMessage?.({ type: 'IMPORT_FREE_ACCOUNT_RESULTS', source: 'sidepanel', payload });
        if (response?.error) throw new Error(response.error);
        syncResults(response?.results);
        helpers.showToast?.(`已导入 ${response?.importedCount || 0} 条 Free 账号。`, 'success', 2200);
      });
    }

    async function stopCheck() {
      const response = await runtime.sendMessage?.({ type: 'STOP_FREE_ACCOUNT_CHECK', source: 'sidepanel', payload: {} });
      if (response?.error) throw new Error(response.error);
      syncResults(response?.results);
      busy = false;
      render();
    }

    function handleClick(event) {
      const target = event?.target?.closest?.('[data-free-account-check-group],[data-free-account-fill-session],[data-free-account-resume-session],[data-free-account-stop-session],[data-upi-membership-check-one],[data-upi-membership-login],[data-upi-membership-export],[data-upi-membership-delete-group],[data-upi-membership-delete],[data-upi-membership-fill-free-at],[data-upi-membership-refresh-invalid-at],[data-upi-membership-import-free],[data-upi-membership-stop-check],[data-upi-membership-toggle-export-verification-url]');
      if (!target) return;
      if (target.hasAttribute('data-free-account-check-group')) return void checkGroup(target.getAttribute('data-free-account-check-group') || 'free');
      if (target.hasAttribute('data-upi-membership-check-one')) return void checkOne(target.getAttribute('data-upi-membership-check-one'));
      if (target.hasAttribute('data-upi-membership-login')) return void login(target.getAttribute('data-upi-membership-login'));
      if (target.hasAttribute('data-upi-membership-export')) return void exportGroup(target.getAttribute('data-upi-membership-export') || 'free');
      if (target.hasAttribute('data-upi-membership-delete-group')) {
        const group = target.getAttribute('data-upi-membership-delete-group') || 'free';
        return void deleteRows(groupRows(group).map((row) => row.email), group);
      }
      if (target.hasAttribute('data-upi-membership-delete')) return void deleteRows([target.getAttribute('data-upi-membership-delete')]);
      if (target.hasAttribute('data-upi-membership-fill-free-at')) return void fillAccessTokens(target.getAttribute('data-free-account-group') || 'free');
      if (target.hasAttribute('data-upi-membership-refresh-invalid-at')) return void refreshAccessTokens(target.getAttribute('data-free-account-group') || 'free');
      if (target.hasAttribute('data-free-account-fill-session')) return void startSessionFill(target.getAttribute('data-free-account-fill-session') || 'free');
      if (target.hasAttribute('data-free-account-resume-session')) return void resumeSessionFill(target.getAttribute('data-free-account-resume-session'));
      if (target.hasAttribute('data-free-account-stop-session')) return void stopSessionFill(target.getAttribute('data-free-account-stop-session'));
      if (target.hasAttribute('data-upi-membership-import-free')) return void dom.inputUpiCredentialMembershipTxt?.click?.();
      if (target.hasAttribute('data-upi-membership-stop-check')) return void stopCheck();
      if (target.hasAttribute('data-upi-membership-toggle-export-verification-url')) {
        includeVerificationUrl = !includeVerificationUrl;
        render();
      }
    }

    function bindEvents() {
      if (eventsBound) return;
      eventsBound = true;
      dom.btnOpenAccountRecords?.addEventListener('click', openPanel);
      dom.btnCloseAccountRecords?.addEventListener('click', closePanel);
      dom.accountRecordsOverlay?.addEventListener('click', (event) => {
        if (event.target === dom.accountRecordsOverlay) closePanel();
      });
      dom.upiCredentialMembershipCheckResults?.addEventListener('click', handleClick);
      dom.upiCredentialMembershipCheckResults?.addEventListener('change', (event) => {
        const exportMode = event?.target?.closest?.('[data-free-account-export-credential-mode]');
        if (exportMode) {
          exportCredentialMode = exportMode.value === 'session' ? 'session' : 'access-token';
          render();
          return;
        }
        const toggle = event?.target?.closest?.('[data-upi-membership-toggle]');
        if (toggle) void setEnabled(toggle.getAttribute('data-upi-membership-toggle'), toggle.checked !== false);
      });
      dom.inputUpiCredentialMembershipTxt?.addEventListener('change', (event) => void importFile(event));
    }

    function openPanel() {
      panelOpen = true;
      if (dom.accountRecordsOverlay) dom.accountRecordsOverlay.hidden = false;
      globalScope.document?.body?.classList?.add('account-records-open');
      void refreshResults().catch(() => null).finally(() => {
        render();
        scheduleSessionTaskPoll();
      });
    }

    function closePanel() {
      panelOpen = false;
      clearSessionTaskPoll();
      if (dom.accountRecordsOverlay) dom.accountRecordsOverlay.hidden = true;
      globalScope.document?.body?.classList?.remove('account-records-open');
    }

    return {
      bindEvents,
      closePanel,
      getFreeExportCredentialMode: () => exportCredentialMode,
      getFreeExportIncludeVerificationUrl: () => includeVerificationUrl,
      openPanel,
      reloadUpiCredentialMembershipAfterRuntimeImport: refreshResults,
      render,
      reset: render,
      summarizeAccountRunHistory: () => ({ total: 0, success: 0, running: 0, failed: 0, stopped: 0, retryRecordCount: 0, retryTotal: 0 }),
      toggleFreeExportIncludeVerificationUrl: () => { includeVerificationUrl = !includeVerificationUrl; render(); },
    };
  }

  const api = { createAccountRecordsManager };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  globalScope.SidepanelAccountRecordsManager = api;
})(typeof window !== 'undefined' ? window : globalThis);
