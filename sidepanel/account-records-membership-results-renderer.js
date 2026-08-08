(function attachSidepanelAccountRecordsMembershipResultsRenderer(globalScope) {
  function createAccountRecordsMembershipResultsRenderer(context = {}) {
    const dom = context.dom || {};
    const state = context.state || {};
    const escapeHtml = typeof context.escapeHtml === 'function' ? context.escapeHtml : fallbackEscapeHtml;
    const formatTime = typeof context.formatAccountRecordTime === 'function' ? context.formatAccountRecordTime : () => '--:--';
    const setNodeHidden = typeof context.setNodeHidden === 'function' ? context.setNodeHidden : fallbackSetNodeHidden;
    const restoreScrollTop = typeof context.restoreScrollTopAfterRender === 'function' ? context.restoreScrollTopAfterRender : () => {};
    const getResults = typeof context.getUpiCredentialMembershipCheckResults === 'function'
      ? context.getUpiCredentialMembershipCheckResults
      : () => ({ items: [] });
    const buildRows = typeof context.buildUpiCredentialMembershipDisplayRows === 'function'
      ? context.buildUpiCredentialMembershipDisplayRows
      : (results) => results?.items || [];
    const normalizeEmail = typeof context.normalizeUpiCredentialMembershipEmail === 'function'
      ? context.normalizeUpiCredentialMembershipEmail
      : (value = '') => String(value || '').trim().toLowerCase();
    const normalizeText = typeof context.normalizeUpiCredentialMembershipText === 'function'
      ? context.normalizeUpiCredentialMembershipText
      : (value = '') => String(value || '').trim();
    const getRowStatusMeta = typeof context.getUpiCredentialMembershipRowStatusMeta === 'function'
      ? context.getUpiCredentialMembershipRowStatusMeta
      : fallbackStatusMeta;
    const hasLoginMaterial = typeof context.hasUpiCredentialMembershipLoginMaterial === 'function'
      ? context.hasUpiCredentialMembershipLoginMaterial
      : () => false;
    const isAutoRunBusy = typeof context.isAutoRunRecordDisplayRunning === 'function'
      ? context.isAutoRunRecordDisplayRunning
      : () => false;
    const getCheckBusy = typeof context.getUpiCredentialMembershipCheckBusy === 'function'
      ? context.getUpiCredentialMembershipCheckBusy
      : () => false;
    const getCheckingEmail = typeof context.getUpiCredentialMembershipCheckingEmail === 'function'
      ? context.getUpiCredentialMembershipCheckingEmail
      : () => '';
    const getLoginEmail = typeof context.getUpiCredentialMembershipLoginEmail === 'function'
      ? context.getUpiCredentialMembershipLoginEmail
      : () => '';
    const getIncludeVerificationUrl = typeof context.getFreeExportIncludeVerificationUrl === 'function'
      ? context.getFreeExportIncludeVerificationUrl
      : () => true;
    const getExportCredentialMode = typeof context.getFreeExportCredentialMode === 'function'
      ? context.getFreeExportCredentialMode
      : () => 'access-token';
    const getSessionFillTask = typeof context.getFreeSessionFillTask === 'function'
      ? context.getFreeSessionFillTask
      : () => null;
    const isSessionFillActive = typeof context.isFreeSessionFillActive === 'function'
      ? context.isFreeSessionFillActive
      : () => false;

    function eligibilityStatus(row = {}) {
      const api = globalScope.MultiPageFreeAccountResults;
      return api?.getItemEligibilityStatus
        ? api.getItemEligibilityStatus(row)
        : normalizeText(row.trialEligibilityStatus || 'unknown').toLowerCase();
    }

    function getGroup(row = {}) {
      return eligibilityStatus(row) === 'ineligible' ? 'free-ineligible' : 'free';
    }

    function hasCompleteSession(row = {}) {
      const api = globalScope.MultiPageFreeAccountResults;
      return typeof api?.hasCompleteSession === 'function'
        ? api.hasCompleteSession(row)
        : Boolean(row?.session?.user?.email && (row?.session?.accessToken || row?.session?.access_token));
    }

    function getProgressText(results = {}) {
      if (results.running) return `资格检测中 ${results.completed || 0}/${results.total || 0}`;
      if (results.stoppedAt) return `资格检测已停止 ${results.completed || 0}/${results.total || 0}`;
      return `总账号 ${Array.isArray(results.items) ? results.items.length : 0}`;
    }

    function renderRows(rows = [], group = 'free', flags = {}) {
      if (!rows.length) {
        return `<div class="upi-membership-check-empty">${group === 'free-ineligible' ? '无资格 Free' : 'Free'} 分组暂无账号</div>`;
      }
      return `
        <div class="upi-membership-check-status-header free-account-status-header"><span>启用</span><span>邮箱</span><span>资格状态</span><span>登录</span><span>资格复检</span><span>删除</span></div>
        <div class="upi-membership-check-list" data-upi-membership-list="${escapeHtml(group)}">
          ${rows.map((row) => {
            const email = normalizeEmail(row.email);
            const meta = getRowStatusMeta(row, getResults());
            const checking = normalizeEmail(getCheckingEmail()) === email;
            const loggingIn = normalizeEmail(getLoginEmail()) === email;
            const title = [email, meta.detail, row.checkedAt ? formatTime(row.checkedAt) : ''].filter(Boolean).join('\n');
            return `
              <div class="upi-membership-check-item free-account-item" data-upi-membership-email="${escapeHtml(email)}" title="${escapeHtml(title)}">
                <label class="toggle-switch upi-membership-check-enabled-toggle">
                  <input type="checkbox" data-upi-membership-toggle="${escapeHtml(email)}" ${row.enabled === false ? '' : 'checked'} ${flags.mutatingBusy ? 'disabled' : ''} aria-label="启用账号 ${escapeHtml(email)}" />
                  <span class="toggle-switch-track"><span class="toggle-switch-thumb"></span></span>
                </label>
                <button class="upi-membership-check-email upi-membership-check-email-action mono" type="button" data-upi-membership-check-one="${escapeHtml(email)}" ${flags.mutatingBusy || checking || row.enabled === false ? 'disabled' : ''} title="重新检测试用资格">${escapeHtml(email)}</button>
                <button class="icloud-tag upi-membership-check-status-action ${escapeHtml(meta.className)}" type="button" data-upi-membership-check-one="${escapeHtml(email)}" ${flags.mutatingBusy || checking || row.enabled === false ? 'disabled' : ''} title="${escapeHtml(meta.detail || '重新检测试用资格')}">${escapeHtml(meta.label)}</button>
                <button class="icloud-tag upi-membership-check-login-action" type="button" data-upi-membership-login="${escapeHtml(email)}" ${flags.mutatingBusy || loggingIn || row.enabled === false || !hasLoginMaterial(row) ? 'disabled' : ''}>登录</button>
                <button class="icloud-tag upi-membership-check-status-action" type="button" data-upi-membership-check-one="${escapeHtml(email)}" ${flags.mutatingBusy || checking || row.enabled === false ? 'disabled' : ''}>复检</button>
                <button class="icloud-tag danger upi-membership-check-delete-action" type="button" data-upi-membership-delete="${escapeHtml(email)}" ${flags.mutatingBusy ? 'disabled' : ''}>删除</button>
              </div>`;
          }).join('')}
        </div>`;
    }

    function renderSection(group, title, rows, flags) {
      const missingAtCount = rows.filter((row) => row.enabled !== false && !normalizeText(row.accessToken)).length;
      const missingSessionCount = rows.filter((row) => row.enabled !== false && !hasCompleteSession(row)).length;
      const includeVerificationUrl = getIncludeVerificationUrl();
      const exportCredentialMode = getExportCredentialMode() === 'session' ? 'session' : 'access-token';
      const sessionTask = getSessionFillTask(group) || {};
      const sessionTaskStatus = normalizeText(sessionTask.status).toLowerCase();
      const sessionTaskProgress = sessionTask.progress || sessionTask.checkpoint?.progress || {};
      const current = Math.max(0, Math.floor(Number(sessionTaskProgress.current) || 0));
      const total = Math.max(0, Math.floor(Number(sessionTaskProgress.total) || 0));
      const sessionTaskActive = ['pending', 'running', 'cancel_requested'].includes(sessionTaskStatus);
      const sessionTaskResumable = sessionTaskStatus === 'interrupted' && missingSessionCount > 0;
      const sessionTaskButton = sessionTaskActive
        ? `<button class="btn btn-primary btn-xs" type="button" disabled>补充 Session ${current}/${total}</button><button class="btn btn-ghost btn-xs" type="button" data-free-account-stop-session="${escapeHtml(sessionTask.taskId || '')}" ${sessionTaskStatus === 'cancel_requested' ? 'disabled' : ''}>停止</button>`
        : sessionTaskResumable
          ? `<button class="btn btn-primary btn-xs" type="button" data-free-account-resume-session="${escapeHtml(sessionTask.taskId || '')}" ${flags.mutatingBusy ? 'disabled' : ''}>继续补充 Session(${missingSessionCount})</button>`
          : `<button class="btn btn-ghost btn-xs" type="button" data-free-account-fill-session="${escapeHtml(group)}" ${missingSessionCount && !flags.mutatingBusy ? '' : 'disabled'}>补充 Session(${missingSessionCount})</button>`;
      return `
        <div class="upi-membership-check-section" data-upi-membership-section="${escapeHtml(group)}">
          <div class="upi-membership-check-head upi-membership-section-head"><span class="upi-membership-section-title">${escapeHtml(title)}</span><span class="upi-membership-section-meta">${rows.length} 个账号 · 缺 AT ${missingAtCount} · 缺 Session ${missingSessionCount}</span></div>
          <div class="upi-membership-check-actions">
            <div class="free-account-common-actions" data-free-account-common-actions="${escapeHtml(group)}">
              <label class="free-account-export-mode" title="选择导出 accessToken，或注册最终步骤读取的完整 /api/auth/session JSON">
                <span>凭据</span>
                <select data-free-account-export-credential-mode aria-label="导出凭据类型">
                  <option value="access-token" ${exportCredentialMode === 'access-token' ? 'selected' : ''}>AT</option>
                  <option value="session" ${exportCredentialMode === 'session' ? 'selected' : ''}>Session</option>
                </select>
              </label>
              <button class="btn btn-ghost btn-xs" type="button" data-upi-membership-export="${escapeHtml(group)}" ${rows.length ? '' : 'disabled'}>导出(${rows.length})</button>
              <button class="btn btn-ghost btn-xs" type="button" data-upi-membership-delete-group="${escapeHtml(group)}" ${rows.length && !flags.mutatingBusy ? '' : 'disabled'}>删除全部(${rows.length})</button>
              <button class="btn btn-ghost btn-xs" type="button" data-upi-membership-fill-free-at data-free-account-group="${escapeHtml(group)}" ${missingAtCount && !flags.mutatingBusy ? '' : 'disabled'}>补充 AT(${missingAtCount})</button>
              <button class="btn btn-ghost btn-xs" type="button" data-upi-membership-refresh-invalid-at data-free-account-group="${escapeHtml(group)}" ${rows.length && !flags.mutatingBusy ? '' : 'disabled'}>刷新 AT</button>
              ${sessionTaskButton}
              <button class="btn btn-primary btn-xs" type="button" data-free-account-check-group="${escapeHtml(group)}" ${rows.length && !flags.mutatingBusy ? '' : 'disabled'}>批量复检资格(${rows.length})</button>
              ${getResults().running ? '<button class="btn btn-ghost btn-xs" type="button" data-upi-membership-stop-check>停止检测</button>' : ''}
            </div>
            ${group === 'free' ? `
              <div class="free-account-group-actions" data-free-account-group-actions="free">
                <button class="btn btn-ghost btn-xs" type="button" data-upi-membership-import-free ${flags.mutatingBusy ? 'disabled' : ''}>导入 Free</button>
                <button class="btn btn-ghost btn-xs${includeVerificationUrl ? ' is-active' : ''}" type="button" data-upi-membership-toggle-export-verification-url aria-pressed="${includeVerificationUrl ? 'true' : 'false'}">取件地址：${includeVerificationUrl ? '开' : '关'}</button>
              </div>` : ''}
          </div>
          ${renderRows(rows, group, flags)}
        </div>`;
    }

    function renderUpiCredentialMembershipCheckResults() {
      const container = dom.upiCredentialMembershipCheckResults;
      if (!container) return;
      const results = getResults();
      const rows = buildRows(results).filter((row) => normalizeText(row.status).toLowerCase() !== 'paid');
      const freeRows = rows.filter((row) => getGroup(row) === 'free');
      const ineligibleRows = rows.filter((row) => getGroup(row) === 'free-ineligible');
      const counts = rows.reduce((summary, row) => {
        const status = eligibilityStatus(row);
        summary[status] = (summary[status] || 0) + 1;
        if (!normalizeText(row.accessToken)) summary.missingAt += 1;
        if (!hasCompleteSession(row)) summary.missingSession += 1;
        return summary;
      }, { eligible: 0, unknown: 0, checking: 0, failed: 0, ineligible: 0, missingAt: 0, missingSession: 0 });
      const autoRunBusy = isAutoRunBusy(state.getLatestState?.() || {});
      const flags = { mutatingBusy: autoRunBusy || getCheckBusy() || results.running === true || isSessionFillActive() };
      const scrollTop = {
        free: container.querySelector('[data-upi-membership-list="free"]')?.scrollTop || 0,
        ineligible: container.querySelector('[data-upi-membership-list="free-ineligible"]')?.scrollTop || 0,
      };
      setNodeHidden(container, false);
      container.innerHTML = `
        <div class="upi-membership-check-head"><span>${escapeHtml(getProgressText(results))} · 有资格 ${counts.eligible} · 待检测 ${counts.unknown + counts.checking} · 检测失败 ${counts.failed} · 无资格 ${counts.ineligible} · 缺 AT ${counts.missingAt} · 缺 Session ${counts.missingSession}</span>${results.updatedAt ? `<span class="mono">${escapeHtml(formatTime(results.updatedAt))}</span>` : ''}</div>
        ${autoRunBusy ? '<div class="upi-membership-check-detail">自动注册运行中，只允许查看和导出。</div>' : ''}
        ${renderSection('free', 'Free 组', freeRows, flags)}
        ${renderSection('free-ineligible', '无资格 Free 组', ineligibleRows, flags)}`;
      restoreScrollTop(container.querySelector('[data-upi-membership-list="free"]'), scrollTop.free);
      restoreScrollTop(container.querySelector('[data-upi-membership-list="free-ineligible"]'), scrollTop.ineligible);
    }

    return { renderUpiCredentialMembershipCheckResults };
  }

  function fallbackEscapeHtml(value = '') {
    return String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function fallbackSetNodeHidden(node, hidden) {
    if (node) node.hidden = Boolean(hidden);
  }

  function fallbackStatusMeta(row = {}) {
    const status = String(row.trialEligibilityStatus || 'unknown').trim().toLowerCase();
    if (status === 'eligible') return { className: 'success', label: '有试用资格', detail: row.trialEligibilityReason || '' };
    if (status === 'ineligible') return { className: 'failed', label: '无试用资格', detail: row.trialEligibilityReason || '' };
    if (status === 'failed') return { className: 'failed', label: '资格检测失败', detail: row.trialEligibilityReason || '' };
    if (status === 'checking') return { className: 'pending', label: '检测中', detail: '' };
    return { className: 'pending', label: '未检测资格', detail: row.trialEligibilityReason || '' };
  }

  const api = { createAccountRecordsMembershipResultsRenderer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  globalScope.SidepanelAccountRecordsMembershipResultsRenderer = api;
})(typeof window !== 'undefined' ? window : globalThis);
