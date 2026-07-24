(function attachMultiPageUpiRedeemFreeEntryCleanup(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.MultiPageUpiRedeemFreeEntryCleanup = api;
})(typeof self !== 'undefined' ? self : globalThis, function createMultiPageUpiRedeemFreeEntryCleanupModule() {
  function createUpiRedeemFreeEntryCleanup(context = {}) {
    const normalizeString = (...args) => context.normalizeString(...args);
    const parseCdkeyPoolText = (...args) => context.parseCdkeyPoolText(...args);
    const splitPoolEntrySource = (...args) => context.splitPoolEntrySource(...args);
    const parsePoolEntryEmail = (...args) => context.parsePoolEntryEmail(...args);

    function normalizeEmailPoolValues(value = []) {
      const seen = new Set();
      const entries = [];
      for (const item of splitPoolEntrySource(value)) {
        const rawValue = item && typeof item === 'object'
          ? (item.credential || item.email || '')
          : item;
        const email = parsePoolEntryEmail(rawValue);
        if (!email || seen.has(email)) {
          continue;
        }
        seen.add(email);
        entries.push(email);
      }
      return entries;
    }

    function normalizeCustomEmailPoolEntryObjectsForCleanup(value = []) {
      const seen = new Set();
      const entries = [];
      for (const rawEntry of splitPoolEntrySource(value)) {
        const source = rawEntry && typeof rawEntry === 'object' && !Array.isArray(rawEntry)
          ? rawEntry
          : { email: rawEntry };
        const email = parsePoolEntryEmail(source.credential || source.email || '');
        if (!email || seen.has(email)) {
          continue;
        }
        seen.add(email);
        entries.push({
          ...source,
          email,
          enabled: source.enabled !== undefined ? Boolean(source.enabled) : true,
          used: Boolean(source.used),
        });
      }
      return entries;
    }

    function removeCdkeyFromPoolText(value = '', cdkey = '') {
      const target = normalizeString(cdkey);
      return parseCdkeyPoolText(value)
        .filter((item) => item !== target)
        .join('\n');
    }

    function removeEmailFromPoolValues(value = [], email = '') {
      const target = normalizeString(email).toLowerCase();
      const seen = new Set();
      const entries = [];
      for (const item of splitPoolEntrySource(value)) {
        const rawValue = item && typeof item === 'object'
          ? (item.credential || item.email || '')
          : item;
        const entryText = normalizeString(rawValue);
        const entryEmail = parsePoolEntryEmail(entryText);
        if (!entryEmail || seen.has(entryEmail) || (target && entryEmail === target)) {
          continue;
        }
        seen.add(entryEmail);
        entries.push(entryText);
      }
      return entries;
    }

    function buildSuccessfulRedeemCleanupUpdates(state = {}, cdkey = '', email = '') {
      const updates = {};
      const normalizedEmail = normalizeString(email).toLowerCase();

      if (normalizedEmail) {
        const nextCustomMailProviderPool = removeEmailFromPoolValues(state.customMailProviderPool, normalizedEmail);
        if (normalizeEmailPoolValues(nextCustomMailProviderPool).join('\n') !== normalizeEmailPoolValues(state.customMailProviderPool).join('\n')) {
          updates.customMailProviderPool = nextCustomMailProviderPool;
        }

        if (normalizeString(state.selectedCustomEmailPoolEmail).toLowerCase() === normalizedEmail) {
          updates.selectedCustomEmailPoolEmail = '';
        }
      }

      return updates;
    }

    return {
      normalizeEmailPoolValues,
      normalizeCustomEmailPoolEntryObjectsForCleanup,
      removeCdkeyFromPoolText,
      removeEmailFromPoolValues,
      buildSuccessfulRedeemCleanupUpdates,
    };
  }

  return { createUpiRedeemFreeEntryCleanup };
});
