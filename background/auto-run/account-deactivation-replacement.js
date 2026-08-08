(function attachAccountDeactivationReplacement(root, factory) {
  const api = factory();
  if (root) root.MultiPageBackgroundAccountDeactivationReplacement = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createAccountDeactivationReplacementModule() {
  function createAccountDeactivationReplacementHandler(deps = {}) {
    return async function replaceDeactivatedAccount(options = {}) {
      const {
        error,
        targetRun,
        totalRuns,
        attemptRun,
        replacementCount = 0,
        seenEmails = new Set(),
        markRoundFailed,
      } = options;
      const stateBeforeReplacement = await deps.getState();
      const accountEmail = String(
        error?.accountEmail
        || stateBeforeReplacement?.email
        || stateBeforeReplacement?.registrationEmailState?.current
        || ''
      ).trim().toLowerCase();

      if (!accountEmail || seenEmails.has(accountEmail)) {
        const terminalReason = !accountEmail
          ? '检测到账号封禁，但无法确定当前账号标识，已停止以避免误换号。'
          : '封禁账号再次被选中，已停止以避免自动运行循环。';
        await markRoundFailed(terminalReason, error);
        deps.cancelPendingCommands(terminalReason);
        await deps.broadcastStopToContentScripts();
        await deps.addLog(terminalReason, 'error');
        await deps.broadcastAutoRunStatus('stopped', {
          currentRun: targetRun,
          totalRuns,
          attemptRun,
          sessionId: 0,
        });
        return { shouldStop: true, replacementCount };
      }

      seenEmails.add(accountEmail);
      const nextReplacementCount = replacementCount + 1;
      const markResult = typeof deps.markCurrentRegistrationAccountDeactivated === 'function'
        ? await deps.markCurrentRegistrationAccountDeactivated(stateBeforeReplacement, {
            email: accountEmail,
            reason: 'OpenAI 认证页返回 account_deactivated，账号已删除或停用。',
            reasonCode: 'ACCOUNT_DEACTIVATED',
            logPrefix: '自动运行步骤 4',
            level: 'warn',
          })
        : null;
      const stateAfterReplacement = await deps.getState();
      const customPoolEntries = Array.isArray(stateAfterReplacement?.customEmailPoolEntries)
        ? stateAfterReplacement.customEmailPoolEntries
        : [];
      const matchedCustomPoolEntry = customPoolEntries.some((entry) => (
        String(entry?.email || '').trim().toLowerCase() === accountEmail
      ));
      const availableCustomPool = Array.isArray(stateAfterReplacement?.customEmailPool)
        ? stateAfterReplacement.customEmailPool
        : [];
      const sourceExhausted = error?.accountSourceExhausted === true
        || (matchedCustomPoolEntry && availableCustomPool.length === 0);

      deps.cancelPendingCommands('当前账号已封禁，正在切换下一个账号。');
      await deps.broadcastStopToContentScripts();
      const trackedTabIds = Array.from(new Set(
        Object.values(stateBeforeReplacement?.tabRegistry || {})
          .map((entry) => Number(entry?.tabId))
          .filter((tabId) => Number.isInteger(tabId) && tabId > 0)
      ));
      if (trackedTabIds.length && typeof deps.chrome?.tabs?.remove === 'function') {
        await deps.chrome.tabs.remove(trackedTabIds).catch(() => {});
      }

      if (sourceExhausted) {
        const terminalReason = '当前账号已封禁，且账号池中已无下一个可用账号，自动运行已停止。';
        await markRoundFailed(terminalReason, error);
        await deps.addLog(terminalReason, 'error');
        await deps.broadcastAutoRunStatus('stopped', {
          currentRun: targetRun,
          totalRuns,
          attemptRun,
          sessionId: 0,
        });
        return { shouldStop: true, replacementCount: nextReplacementCount };
      }

      const nextEmailAvailable = String(
        error?.nextAccountEmail
        || markResult?.nextEmail
        || stateAfterReplacement?.selectedCustomEmailPoolEmail
        || ''
      ).trim();
      await deps.addLog(
        `第 ${targetRun}/${totalRuns} 轮检测到账号已封禁，已完成第 ${nextReplacementCount} 次换号；当前目标次数不变${nextEmailAvailable ? '，正在使用下一个可用账号' : '，正在重新选择可用账号'}。`,
        'warn'
      );
      return { shouldStop: false, replacementCount: nextReplacementCount };
    };
  }

  return { createAccountDeactivationReplacementHandler };
});
