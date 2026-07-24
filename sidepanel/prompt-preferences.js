(function attachSidepanelPromptPreferences(globalScope) {
  function createPromptPreferences(context = {}) {
    const storage = context.storage || globalScope.localStorage;
    const keys = context.keys || {};

    function isPromptDismissed(storageKey) {
      return storage?.getItem(storageKey) === '1';
    }

    function setPromptDismissed(storageKey, dismissed) {
      if (dismissed) {
        storage?.setItem(storageKey, '1');
      } else {
        storage?.removeItem(storageKey);
      }
    }

    function getDismissedContributionContentPromptVersion() {
      return String(storage?.getItem(keys.contributionContentVersion) || '').trim();
    }

    function setDismissedContributionContentPromptVersion(version) {
      const normalized = String(version || '').trim();
      if (normalized) {
        storage?.setItem(keys.contributionContentVersion, normalized);
      } else {
        storage?.removeItem(keys.contributionContentVersion);
      }
    }

    return {
      isNewUserGuidePromptDismissed: () => isPromptDismissed(keys.newUserGuide),
      setNewUserGuidePromptDismissed: (dismissed) => setPromptDismissed(keys.newUserGuide, dismissed),
      getDismissedContributionContentPromptVersion,
      setDismissedContributionContentPromptVersion,
      isAutoSkipFailuresPromptDismissed: () => isPromptDismissed(keys.autoSkipFailures),
      setAutoSkipFailuresPromptDismissed: (dismissed) => setPromptDismissed(keys.autoSkipFailures, dismissed),
      isAutoRunFallbackRiskPromptDismissed: () => isPromptDismissed(keys.autoRunFallbackRisk),
      setAutoRunFallbackRiskPromptDismissed: (dismissed) => setPromptDismissed(keys.autoRunFallbackRisk, dismissed),
      isCloudflareTempEmailRegistrationLookupPromptDismissed: () => isPromptDismissed(keys.cloudflareRegistrationLookup),
      setCloudflareTempEmailRegistrationLookupPromptDismissed: (dismissed) => setPromptDismissed(keys.cloudflareRegistrationLookup, dismissed),
    };
  }

  globalScope.SidepanelPromptPreferences = { createPromptPreferences };
})(window);
