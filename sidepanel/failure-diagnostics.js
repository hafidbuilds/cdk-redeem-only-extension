(function attachSidepanelFailureDiagnostics(root, factory) {
  const api = factory(root);
  root.SidepanelFailureDiagnostics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function createFailureDiagnosticsModule(root) {
  const FAILURE_MESSAGE_PATTERN = /\b(?:failed|failure|exception)\b|(?:^|[\s:：])(?:失败|错误|异常)(?=[：:，,。！!\s]|$)/i;
  const TIMEOUT_OUTCOME_PATTERN = /\b(?:timed\s+out|timeout)(?=\s*(?:[.:!]|$))|超时(?=\s*(?:[：:，,。！!]|URL\b|$))/i;
  const FAILURE_LEVELS = new Set(['error', 'failed', 'failure']);
  const LOG_RADIUS = 100;

  function sanitizePlainText(value = '') {
    return String(value ?? '')
      .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, 'Bearer [REDACTED]')
      .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[JWT_REDACTED]')
      .replace(/\b(?:sk|key|token)-[A-Za-z0-9_-]{8,}\b/gi, '[TOKEN_REDACTED]')
      .replace(/\b(password|passphrase|access_?token|refresh_?token|api_?key|cookie|totp|2fa[_ -]?secret|cdk(?:ey)?)\s*[:=：]\s*([^\s,;]+)/gi, '$1=[REDACTED]')
      .replace(/(?:验证码|校验码|verification\s*code|one[- ]time\s*code|otp|code)\s*(?:is|为|[:=：])?\s*[A-Za-z0-9-]{4,12}/gi, (match) => {
        const label = match.match(/^(?:验证码|校验码|verification\s*code|one[- ]time\s*code|otp|code)/i)?.[0] || 'code';
        return `${label} [REDACTED]`;
      })
      .replace(/((?:已生成)?姓名(?:已填写)?\s*[:：]?\s*)(?:[A-Z][A-Z .'-]{1,80}|[\u3400-\u9fff·]{2,20})(?=\s*(?:[,，。;；]|$))/gi, '$1[NAME_REDACTED]')
      .replace(/\b[A-Za-z0-9._~+\/-]{20,}\b/g, '[TOKEN_REDACTED]')
      .replace(/\b\d{4,8}\b/g, '[NUMBER_REDACTED]')
      .replace(/\b([A-Z0-9._%+-])[A-Z0-9._%+-]*@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi, '$1***@$2');
  }

  function sanitizeUrl(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const parsed = new URL(raw);
      const keys = Array.from(parsed.searchParams.keys());
      keys.forEach((key) => parsed.searchParams.set(key, '[REDACTED]'));
      parsed.pathname = sanitizePlainText(parsed.pathname);
      if (parsed.hash && /[?=&]|code|token|key|secret|password|state/i.test(parsed.hash)) {
        parsed.hash = '#[REDACTED]';
      } else if (parsed.hash) {
        parsed.hash = sanitizePlainText(parsed.hash);
      }
      return parsed.toString();
    } catch {
      return sanitizePlainText(raw.replace(/([?&][^=&#]+)=([^&#]*)/g, '$1=[REDACTED]'));
    }
  }

  function sanitizeDiagnosticText(value = '') {
    const withSafeUrls = String(value ?? '').replace(/https?:\/\/[^\s)\]}]+/gi, (url) => sanitizeUrl(url));
    return sanitizePlainText(withSafeUrls);
  }

  function isFailureLevel(entry = {}) {
    return FAILURE_LEVELS.has(String(entry?.level || '').trim().toLowerCase());
  }

  function isExplicitFailureMessage(entry = {}) {
    const message = String(entry?.message || '');
    return FAILURE_MESSAGE_PATTERN.test(message) || TIMEOUT_OUTCOME_PATTERN.test(message);
  }

  function isArchivedSnapshot(entry = {}) {
    return /^\s*(?:快照|snapshot)(?:\s|[:：])/i.test(String(entry?.message || ''));
  }

  function findLatestFailureIndex(source = []) {
    for (let index = source.length - 1; index >= 0; index -= 1) {
      if (!isArchivedSnapshot(source[index]) && isFailureLevel(source[index])) return index;
    }
    for (let index = source.length - 1; index >= 0; index -= 1) {
      if (!isArchivedSnapshot(source[index]) && isExplicitFailureMessage(source[index])) return index;
    }
    for (let index = source.length - 1; index >= 0; index -= 1) {
      if (isFailureLevel(source[index]) || isExplicitFailureMessage(source[index])) return index;
    }
    return -1;
  }

  function normalizeLogEntry(entry = {}) {
    return {
      timestamp: Number(entry?.timestamp) || null,
      level: sanitizePlainText(String(entry?.level || 'info').trim().toLowerCase() || 'info'),
      step: Math.max(0, Math.floor(Number(entry?.step) || 0)) || null,
      stepKey: sanitizePlainText(entry?.stepKey || ''),
      nodeId: sanitizePlainText(entry?.nodeId || ''),
      message: sanitizeDiagnosticText(entry?.message || ''),
    };
  }

  function selectFailureLogWindow(logs = [], radius = LOG_RADIUS) {
    const source = Array.isArray(logs) ? logs : [];
    const safeRadius = Math.max(0, Math.floor(Number(radius) || 0));
    const failureIndex = findLatestFailureIndex(source);
    const anchor = failureIndex >= 0 ? failureIndex : Math.max(0, source.length - 1);
    const start = source.length ? Math.max(0, anchor - safeRadius) : 0;
    const end = source.length ? Math.min(source.length, anchor + safeRadius + 1) : 0;
    return {
      failureFound: failureIndex >= 0,
      failureIndex,
      beforeCount: failureIndex >= 0 ? failureIndex - start : 0,
      afterCount: failureIndex >= 0 ? end - failureIndex - 1 : 0,
      failure: failureIndex >= 0 ? normalizeLogEntry(source[failureIndex]) : null,
      logs: source.slice(start, end).map(normalizeLogEntry),
    };
  }

  function normalizePageSnapshot(snapshot = {}) {
    const source = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : {};
    return {
      available: Object.keys(source).length > 0,
      state: sanitizePlainText(source.state || 'unknown'),
      path: sanitizePlainText(source.path || ''),
      verificationKind: sanitizePlainText(source.verificationKind || ''),
      retryEnabled: Boolean(source.retryEnabled),
      accountDeactivated: Boolean(source.accountDeactivated),
      authHttpErrorPage: Boolean(source.authHttpErrorPage),
      maxCheckAttemptsBlocked: Boolean(source.maxCheckAttemptsBlocked),
      emailInUseBlocked: Boolean(source.emailInUseBlocked),
      hasPasswordInput: Boolean(source.hasPasswordInput),
      hasEmailInput: Boolean(source.hasEmailInput),
      hasSubmitButton: Boolean(source.hasSubmitButton),
      oauthConsentPage: Boolean(source.oauthConsentPage),
      consentReady: Boolean(source.consentReady),
    };
  }

  function buildDiagnosticBundle({ state = {}, stateError = '', pageContext = {} } = {}) {
    const logWindow = selectFailureLogWindow(state.logs, LOG_RADIUS);
    const pageSnapshot = normalizePageSnapshot(pageContext.snapshot);
    const currentNodeId = sanitizePlainText(state.currentNodeId || '');
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      scope: 'latest-failure',
      logWindow: {
        radius: LOG_RADIUS,
        failureFound: logWindow.failureFound,
        beforeCount: logWindow.beforeCount,
        afterCount: logWindow.afterCount,
        failure: logWindow.failure,
        entries: logWindow.logs,
      },
      workflow: {
        currentNodeId,
        currentNodeStatus: sanitizePlainText(state.nodeStatuses?.[currentNodeId] || ''),
        autoRunPhase: sanitizePlainText(state.autoRunPhase || ''),
        autoRunning: Boolean(state.autoRunning),
      },
      page: {
        currentUrl: sanitizeUrl(pageContext.url || pageContext.snapshot?.url || ''),
        ...pageSnapshot,
        probeError: sanitizeDiagnosticText(pageContext.error || ''),
      },
      verificationInput: {
        detected: Boolean(pageContext.snapshot?.hasVerificationTarget),
        pageVisible: Boolean(pageContext.snapshot?.verificationVisible),
        kind: sanitizePlainText(pageContext.snapshot?.verificationKind || ''),
        errorDetected: Boolean(String(pageContext.snapshot?.verificationErrorText || '').trim()),
        errorText: sanitizeDiagnosticText(pageContext.snapshot?.verificationErrorText || ''),
      },
      collectionErrors: [stateError, pageContext.error]
        .map(sanitizeDiagnosticText)
        .filter(Boolean),
    };
  }

  async function readRuntimeState(chromeApi) {
    try {
      const value = await chromeApi?.runtime?.sendMessage?.({ type: 'GET_STATE', source: 'sidepanel' });
      return { value: value && typeof value === 'object' ? value : {}, error: '' };
    } catch (error) {
      return { value: {}, error: error?.message || String(error || '') };
    }
  }

  async function readActivePageContext(chromeApi) {
    try {
      const tabs = await chromeApi?.tabs?.query?.({ active: true, lastFocusedWindow: true });
      const tab = Array.isArray(tabs) ? tabs[0] : null;
      if (!Number.isInteger(tab?.id)) return { url: tab?.url || '', snapshot: {}, error: '未找到活动标签页。' };
      try {
        const snapshot = await chromeApi.tabs.sendMessage(tab.id, {
          type: 'GET_LOGIN_AUTH_STATE',
          source: 'sidepanel',
          payload: {},
        });
        if (snapshot?.error) {
          return { url: tab.url || snapshot?.url || '', snapshot: {}, error: snapshot.error };
        }
        return { url: tab.url || snapshot?.url || '', snapshot: snapshot || {}, error: '' };
      } catch (error) {
        return { url: tab.url || '', snapshot: {}, error: error?.message || String(error || '') };
      }
    } catch (error) {
      return { url: '', snapshot: {}, error: error?.message || String(error || '') };
    }
  }

  async function copyLatestFailureDiagnostics(context = {}) {
    const chromeApi = context.chromeApi || root.chrome;
    const copyTextToClipboard = context.copyTextToClipboard;
    if (typeof copyTextToClipboard !== 'function') throw new Error('剪贴板服务不可用。');
    const [stateResult, pageContext] = await Promise.all([
      readRuntimeState(chromeApi),
      readActivePageContext(chromeApi),
    ]);
    const bundle = buildDiagnosticBundle({
      state: stateResult.value,
      stateError: stateResult.error,
      pageContext,
    });
    const text = JSON.stringify(bundle, null, 2);
    await copyTextToClipboard(text);
    context.closeConfigMenu?.();
    context.showToast?.('已导出至剪贴板', 'success', 2200);
    return { bundle, text };
  }

  return {
    buildDiagnosticBundle,
    copyLatestFailureDiagnostics,
    normalizeLogEntry,
    sanitizeDiagnosticText,
    sanitizeUrl,
    selectFailureLogWindow,
  };
});
