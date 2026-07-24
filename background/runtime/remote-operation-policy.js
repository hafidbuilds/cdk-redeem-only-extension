(function attachRemoteOperationPolicy(root, factory) {
  const api = factory();
  root.MultiPageRemoteOperationPolicy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createRemoteOperationPolicyModule() {
  const STATES = Object.freeze(['closed', 'open', 'half_open']);

  function clampConcurrency(value = 3) {
    return Math.min(5, Math.max(1, Math.floor(Number(value) || 3)));
  }

  function parseRetryAfter(value, now = Date.now()) {
    if (value === undefined || value === null || value === '') return 0;
    const text = String(value).trim();
    if (/^\d+(?:\.\d+)?$/.test(text)) return Math.max(0, Math.ceil(Number(text) * 1000));
    const at = Date.parse(text);
    return Number.isFinite(at) ? Math.max(0, at - now) : 0;
  }

  function createRemoteOperationPolicy(options = {}) {
    const {
      chromeApi = globalThis.chrome,
      storageKey = 'remoteOperationPolicyV1',
      maxConcurrency = 3,
      maxAttempts = 3,
      cooldownMs = 60000,
      stopOnConsecutiveErrors = 5,
      requestTimeoutMs = 30000,
      random = Math.random,
      now = () => Date.now(),
    } = options;
    let memory = {};
    let loaded = false;
    let loadPromise = null;

    async function load() {
      if (loaded) return memory;
      if (!loadPromise) {
        loadPromise = chromeApi?.storage?.local?.get?.([storageKey]).then((stored) => {
          memory = stored?.[storageKey] && typeof stored[storageKey] === 'object' ? stored[storageKey] : {};
          loaded = true;
          return memory;
        }).catch(() => {
          loaded = true;
          memory = {};
          return memory;
        });
      }
      return loadPromise;
    }

    async function persist() {
      await chromeApi?.storage?.local?.set?.({ [storageKey]: memory });
    }

    function normalizeScope(scope = '') {
      return String(scope || 'default').trim().toLowerCase() || 'default';
    }

    function getRecord(scope) {
      const key = normalizeScope(scope);
      const current = memory[key] || {};
      const state = STATES.includes(current.state) ? current.state : 'closed';
      return {
        state,
        consecutiveErrors: Math.max(0, Number(current.consecutiveErrors) || 0),
        openedAt: Math.max(0, Number(current.openedAt) || 0),
        cooldownUntil: Math.max(0, Number(current.cooldownUntil) || 0),
        nextAllowedAt: Math.max(0, Number(current.nextAllowedAt) || 0),
        updatedAt: current.updatedAt || '',
      };
    }

    async function getState(scope) {
      await load();
      return { scope: normalizeScope(scope), ...getRecord(scope) };
    }

    async function setRecord(scope, record) {
      const key = normalizeScope(scope);
      memory[key] = { ...record, updatedAt: new Date(now()).toISOString() };
      await persist();
      return { scope: key, ...getRecord(key) };
    }

    function makeError(code, message, extra = {}) {
      const error = new Error(message);
      error.code = code;
      Object.assign(error, extra);
      return error;
    }

    function isRetryable(error) {
      if (typeof error?.retryable === 'boolean') return error.retryable;
      const status = Number(error?.status || error?.response?.status) || 0;
      return status === 429 || status >= 500 || /timeout|network|fetch failed|temporar/i.test(error?.message || '');
    }

    function getRetryAfter(error) {
      return Math.max(
        Number(error?.retryAfterMs) || 0,
        parseRetryAfter(error?.retryAfter || error?.headers?.get?.('Retry-After'))
      );
    }

    async function execute(scope, operation, executeOptions = {}) {
      await load();
      const key = normalizeScope(scope);
      const attempts = Math.min(3, Math.max(1, Math.floor(Number(executeOptions.maxAttempts) || maxAttempts)));
      const timeout = Math.max(1, Number(executeOptions.requestTimeoutMs) || requestTimeoutMs);
      let state = getRecord(key);
      const current = now();
      if (state.state === 'open' && current < state.cooldownUntil) {
        throw makeError('RATE_LIMIT_CIRCUIT_OPEN', `远端 ${key} 冷却中。`, { retryable: true, cooldownUntil: state.cooldownUntil });
      }
      if (state.state === 'open') {
        state = await setRecord(key, { ...state, state: 'half_open' });
      }
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          let timeoutId = null;
          const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(makeError('REMOTE_TIMEOUT', '远端请求超时。', { retryable: true })), timeout);
          });
          let result;
          try {
            result = await Promise.race([
              Promise.resolve().then(() => operation({ attempt, scope: key })),
              timeoutPromise,
            ]);
          } finally {
            if (timeoutId) clearTimeout(timeoutId);
          }
          await setRecord(key, { ...state, state: 'closed', consecutiveErrors: 0, openedAt: 0, cooldownUntil: 0, nextAllowedAt: 0 });
          return result;
        } catch (error) {
          if (!isRetryable(error) || attempt >= attempts) {
            const failures = state.consecutiveErrors + 1;
            const opened = failures >= stopOnConsecutiveErrors;
            await setRecord(key, {
              ...state,
              state: opened ? 'open' : 'closed',
              consecutiveErrors: failures,
              openedAt: opened ? now() : state.openedAt,
              cooldownUntil: opened ? now() + cooldownMs : state.cooldownUntil,
            });
            throw error;
          }
          const delay = Math.max(getRetryAfter(error), Math.min(30000, 250 * (2 ** (attempt - 1)) + Math.floor(random() * 250)));
          state = await setRecord(key, { ...state, nextAllowedAt: now() + delay });
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
      throw makeError('REMOTE_RETRY_EXHAUSTED', '远端重试次数已耗尽。');
    }

    async function mapWithConcurrency(items = [], worker = async (item) => item, requested = maxConcurrency) {
      const list = Array.isArray(items) ? items : [];
      const limit = clampConcurrency(requested);
      const results = new Array(list.length);
      let cursor = 0;
      async function consume() {
        while (cursor < list.length) {
          const index = cursor;
          cursor += 1;
          results[index] = await worker(list[index], index);
        }
      }
      await Promise.all(Array.from({ length: Math.min(limit, list.length) }, consume));
      return results;
    }

    return { clampConcurrency, getState, execute, mapWithConcurrency, parseRetryAfter };
  }

  return { STATES, clampConcurrency, createRemoteOperationPolicy, parseRetryAfter };
});
