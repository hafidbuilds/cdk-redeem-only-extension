(function attachSessionExportReader(root, factory) {
  const api = factory();
  root.MultiPageBackgroundSessionExportReader = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createSessionExportReaderModule() {
  function getErrorMessage(error) {
    return String(typeof error === 'string' ? error : error?.message || '').trim();
  }

  function isTransientSessionFrameError(error, isRetryableTransportError = null) {
    if (typeof isRetryableTransportError === 'function') {
      try {
        if (isRetryableTransportError(error)) return true;
      } catch {
        // Fall through to the session-specific Chrome error patterns.
      }
    }
    return /frame with id \d+ was removed|no frame with id \d+ in tab|the frame was removed|receiving end does not exist|message channel is closed|back\/forward cache|port closed before a response was received/i
      .test(getErrorMessage(error));
  }

  function createSessionExportReader(deps = {}) {
    const {
      resolveTabs = async () => [],
      pickPreferredTab = () => null,
      readFromTab = async () => null,
      isRetryableTransportError = null,
      sleep = async () => {},
      onRetry = async () => {},
      maxAttempts = 3,
      retryDelayMs = 750,
    } = deps;
    const attemptLimit = Math.min(5, Math.max(1, Math.floor(Number(maxAttempts) || 3)));
    const delayMs = Math.max(0, Math.floor(Number(retryDelayMs) || 0));

    async function readCurrentSession() {
      const errors = [];
      let foundSupportedTab = false;

      for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
        const tabs = await resolveTabs();
        const orderedTabs = [
          pickPreferredTab(tabs),
          ...(Array.isArray(tabs) ? tabs : []),
        ].filter(Boolean);
        const seen = new Set();
        let transientError = null;

        for (const tab of orderedTabs) {
          if (!Number.isInteger(tab?.id) || seen.has(tab.id)) continue;
          seen.add(tab.id);
          foundSupportedTab = true;
          try {
            return await readFromTab(tab);
          } catch (error) {
            const transient = isTransientSessionFrameError(error, isRetryableTransportError);
            errors.push({ error, transient });
            if (transient) transientError = error;
          }
        }

        if (!transientError || attempt >= attemptLimit) break;
        await onRetry({
          attempt,
          nextAttempt: attempt + 1,
          maxAttempts: attemptLimit,
          error: transientError,
        });
        await sleep(delayMs);
      }

      if (!foundSupportedTab) {
        throw new Error('未找到 ChatGPT / OpenAI 标签页，请先打开一个已登录页面后再导出。');
      }

      const nonTransient = errors.find((entry) => !entry.transient);
      if (nonTransient?.error) throw nonTransient.error;

      const error = new Error(
        `ChatGPT 页面在读取 SESSION/AT 时持续切换，已重新定位标签页 ${attemptLimit} 次仍未恢复。请保持当前已登录页面打开后重试。`
      );
      error.code = 'CHATGPT_SESSION_FRAME_UNAVAILABLE';
      error.retryable = false;
      error.recoverable = true;
      error.resumeNodeId = 'persist-no-2fa-free';
      if (errors.length) error.cause = errors.at(-1).error;
      throw error;
    }

    return { readCurrentSession };
  }

  return {
    createSessionExportReader,
    isTransientSessionFrameError,
  };
});
