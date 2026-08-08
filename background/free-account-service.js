(function attachFreeAccountService(root, factory) {
  const api = factory(root);
  root.MultiPageBackgroundFreeAccountService = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createFreeAccountServiceModule(root) {
  const DEFAULT_API_BASE_URL = 'https://cha.nerver.cc';
  const DEFAULT_TIMEOUT_MS = 30000;
  const DEFAULT_RETRY_DELAYS_MS = [1500, 3000];
  const COOKIE_CLEAR_DOMAINS = [
    'chatgpt.com',
    'chat.openai.com',
    'openai.com',
    'auth.openai.com',
    'auth0.openai.com',
    'accounts.openai.com',
  ];
  const COOKIE_CLEAR_ORIGINS = COOKIE_CLEAR_DOMAINS.map((domain) => `https://${domain}`);

  function normalizeText(value = '') {
    return String(value ?? '').trim();
  }

  function isStorageQuotaExceededError(error) {
    const code = normalizeText(error?.code || error?.name).toUpperCase();
    const message = normalizeText(error?.message || error);
    return code === 'FREE_ACCOUNT_STORAGE_QUOTA_EXCEEDED'
      || code === 'QUOTA_BYTES'
      || /(?:Resource::)?kQuotaBytes|QUOTA_BYTES|storage\s+quota(?:\s+bytes)?\s+exceeded|quota(?:\s+bytes)?\s+exceeded/i.test(message);
  }

  function createStorageQuotaExceededError(error) {
    const quotaError = new Error(
      'FREE_ACCOUNT_STORAGE_QUOTA_EXCEEDED::Chrome 本地存储容量已满，Free 结果尚未完成写入。请重新加载扩展以启用 unlimitedStorage，然后仅重试当前最终保存节点。'
    );
    quotaError.code = 'FREE_ACCOUNT_STORAGE_QUOTA_EXCEEDED';
    quotaError.retryable = false;
    quotaError.preserveSignupSession = true;
    quotaError.cause = error;
    return quotaError;
  }

  function normalizeEmail(value = '') {
    return normalizeText(value).toLowerCase();
  }

  function normalizeTotpSecret(value = '') {
    return normalizeText(value).replace(/\s+/g, '').toUpperCase();
  }

  function uniqueEmails(values = []) {
    return [...new Set((Array.isArray(values) ? values : []).map(normalizeEmail).filter(Boolean))];
  }

  function getResultsApi() {
    if (root.MultiPageFreeAccountResults) return root.MultiPageFreeAccountResults;
    if (typeof require === 'function') return require('../shared/free-account-results.js');
    throw new Error('Free account results module is unavailable.');
  }

  function getEligibilityApi() {
    if (root.MultiPageTrialEligibilityApi) return root.MultiPageTrialEligibilityApi;
    if (typeof require === 'function') return require('../shared/trial-eligibility-api.js');
    throw new Error('Trial eligibility API module is unavailable.');
  }

  function normalizeApiBaseUrl(value = '') {
    return normalizeText(value || DEFAULT_API_BASE_URL)
      .replace(/#.*$/g, '')
      .replace(/\/+$/g, '')
      .replace(/\/api\/v1\/(?:check|totp\/lookup|passkey\/login)$/i, '')
      .replace(/\/api$/i, '')
      .replace(/\/+$/g, '') || DEFAULT_API_BASE_URL;
  }

  function resolveApiBaseUrl(state = {}) {
    return normalizeApiBaseUrl(
      state.trialEligibilityApiBaseUrl
      || state.upiSubscriptionApiBaseUrl
      || state.upiCredentialMembershipCheckTotpApiBaseUrl
      || DEFAULT_API_BASE_URL
    );
  }

  function decodeJwtPayload(token = '') {
    const rawPayload = normalizeText(token).split('.')[1] || '';
    if (!rawPayload) return null;
    try {
      const padded = rawPayload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(rawPayload.length / 4) * 4, '=');
      const text = typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf8');
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  function getAccessTokenEmail(token = '') {
    const payload = decodeJwtPayload(token) || {};
    const profile = payload?.['https://api.openai.com/profile'];
    return normalizeEmail(
      profile?.email
      || payload?.email
      || payload?.user?.email
      || payload?.account?.email
    );
  }

  function maskAccessToken(token = '') {
    const value = normalizeText(token);
    if (!value) return '';
    if (value.length <= 12) return `${value.slice(0, 3)}***`;
    return `${value.slice(0, 6)}...${value.slice(-4)}`;
  }

  function normalizeSessionPayload(value = null) {
    let session = value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0
      ? value
      : null;
    for (let depth = 0; session && depth < 3; depth += 1) {
      const nested = session.session;
      const hasNestedSession = nested && typeof nested === 'object' && !Array.isArray(nested) && Object.keys(nested).length > 0;
      if (!hasNestedSession) break;
      const outerHasSessionIdentity = Boolean(session.user || session.account || session.expires || session.authProvider);
      const looksLikeReaderEnvelope = !outerHasSessionIdentity && (
        Object.hasOwn(session, 'ok')
        || Object.hasOwn(session, 'status')
        || Boolean(session.accessToken || session.access_token || session.email)
        || Boolean(nested.user || nested.account || nested.email)
      );
      if (!looksLikeReaderEnvelope) break;
      session = nested;
    }
    return session;
  }

  function getSessionEmail(value = null) {
    const session = normalizeSessionPayload(value) || {};
    return normalizeEmail(
      session?.user?.email
      || session?.email
      || session?.account?.email
    );
  }

  function normalizeExportCredentialMode(value = '') {
    return normalizeText(value).toLowerCase() === 'session' ? 'session' : 'access-token';
  }

  function normalizeCredential(value = {}) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const no2faFreeRoute = source.no2faFreeRoute === true;
    const passkeyCredentialId = normalizeText(source.passkeyCredentialId || source.credentialId || source.credential_id);
    return {
      ...source,
      email: normalizeEmail(source.email || source.accountIdentifier || source.id),
      password: no2faFreeRoute ? '' : normalizeText(source.password || source.gptPassword),
      gptPassword: no2faFreeRoute ? '' : normalizeText(source.gptPassword || source.password),
      totpMfaSecret: no2faFreeRoute ? '' : normalizeTotpSecret(source.totpMfaSecret || source.totpSecret),
      totpSecret: no2faFreeRoute ? '' : normalizeTotpSecret(source.totpSecret || source.totpMfaSecret),
      accessToken: normalizeText(source.accessToken || source.token || source.access_token),
      session: normalizeSessionPayload(source.session || source.chatgptSession || source.authSession),
      verificationUrl: normalizeText(source.verificationUrl || source.emailVerificationUrl || source.url),
      passkeyEnabled: !no2faFreeRoute && (source.passkeyEnabled === true || Boolean(passkeyCredentialId)),
      passkeyCredentialId,
      no2faFreeRoute,
      enabled: source.enabled !== false,
      status: 'free',
    };
  }

  function mergeCredential(primary = {}, fallback = {}) {
    const left = normalizeCredential(primary);
    const right = normalizeCredential(fallback);
    const merged = { ...right, ...left };
    for (const key of [
      'password', 'gptPassword', 'totpMfaSecret', 'totpSecret', 'accessToken', 'verificationUrl',
      'passkeyCredentialId', 'passkeyFactorId', 'passkeyRpId', 'passkeyUserHandle',
      'passkeyPublicKeyCose', 'accessTokenUpdatedAt', 'sessionUpdatedAt', 'recordedAt',
    ]) {
      if (!normalizeText(merged[key])) merged[key] = right[key] ?? left[key] ?? '';
    }
    if (!merged.passkeyPrivateJwk) merged.passkeyPrivateJwk = right.passkeyPrivateJwk || left.passkeyPrivateJwk || null;
    if (!normalizeSessionPayload(merged.session)) merged.session = right.session || left.session || null;
    merged.passkeyEnabled = left.passkeyEnabled === true || right.passkeyEnabled === true;
    merged.no2faFreeRoute = left.no2faFreeRoute === true || right.no2faFreeRoute === true;
    merged.enabled = primary.enabled !== undefined ? primary.enabled !== false : fallback.enabled !== false;
    return merged;
  }

  function findEligibilityPayload(payload = {}) {
    const candidates = [
      payload,
      payload?.data,
      payload?.item,
      payload?.result,
      ...(Array.isArray(payload?.items) ? payload.items : []),
      ...(Array.isArray(payload?.data?.items) ? payload.data.items : []),
      ...(Array.isArray(payload?.results) ? payload.results : []),
    ];
    return candidates.find((item) => item && typeof item === 'object' && !Array.isArray(item) && (
      Object.hasOwn(item, 'token_ok')
      || Object.hasOwn(item, 'tokenOk')
      || Object.hasOwn(item, 'eligible')
      || Object.hasOwn(item, 'gcash_pm_eligible')
      || Object.hasOwn(item, 'gcashPmEligible')
      || Object.hasOwn(item, 'gcash_pm_eligible_reason')
      || Object.hasOwn(item, 'gcashPmEligibleReason')
      || Object.hasOwn(item, 'reason')
    )) || {};
  }

  function parsePasskeyTextMarker(value = '') {
    const raw = normalizeText(value);
    if (!/^PASSKEY:/i.test(raw)) return null;
    const [credentialPart, ...metadataParts] = raw.slice(raw.indexOf(':') + 1).split(';');
    const credentialId = normalizeText(credentialPart);
    if (!credentialId) return null;
    const result = { passkeyEnabled: true, passkeyCredentialId: credentialId };
    for (const part of metadataParts) {
      const [rawKey, rawValue] = part.split('=', 2);
      const key = normalizeText(rawKey).toLowerCase().replace(/_/g, '');
      const number = Number(normalizeText(rawValue));
      if (!Number.isInteger(number)) continue;
      if (key === 'signcount') result.passkeySignCount = Math.max(0, number);
      if (key === 'alg') result.passkeyAlg = number;
    }
    return result;
  }

  function parsePlainTextCredentials(text = '') {
    const lines = normalizeText(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const rows = [];
    for (const line of lines) {
      if (/^\s*[#;]/.test(line)) continue;
      const delimiter = line.includes('---') ? /-{3,}/ : (line.includes('\t') ? /\t+/ : /\s*[|,]\s*/);
      const parts = line.split(delimiter).map((part) => part.trim());
      const emailIndex = parts.findIndex((part) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part));
      if (emailIndex < 0) continue;
      const email = normalizeEmail(parts[emailIndex]);
      const tail = parts.slice(emailIndex + 1);
      const accessToken = tail.find((part) => /^eyJ[A-Za-z0-9_-]+\./.test(part)) || '';
      const verificationUrl = tail.find((part) => /^https?:\/\//i.test(part)) || '';
      const passkeyMarker = tail.find((part) => /^PASSKEY:/i.test(part)) || '';
      const passkey = parsePasskeyTextMarker(passkeyMarker) || {};
      const totpMfaSecret = tail.find((part) => /^[A-Z2-7]{16,}$/i.test(part.replace(/\s+/g, ''))) || '';
      const password = tail.find((part) => part && part !== accessToken && part !== verificationUrl && part !== passkeyMarker && part !== totpMfaSecret) || '';
      rows.push(normalizeCredential({
        email,
        password,
        totpMfaSecret,
        accessToken,
        verificationUrl,
        ...passkey,
        trialEligibilityStatus: 'unknown',
        source: 'text-import',
      }));
    }
    return rows;
  }

  function buildTimestampedFileName(group = 'free', extension = 'json') {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `free-account-tool-${group}-${stamp}.${extension}`;
  }

  function normalizeExportTextField(value = '') {
    return String(value ?? '').replace(/\r?\n/g, '\\n').trim();
  }

  function formatExportRecordedAt(value = '') {
    const raw = normalizeText(value);
    if (!raw) return '';
    let timestampMs;
    if (/^-?\d+(?:\.\d+)?$/.test(raw)) {
      const numeric = Number(raw);
      timestampMs = Math.abs(numeric) < 100000000000 ? numeric * 1000 : numeric;
    } else {
      timestampMs = Date.parse(raw);
    }
    if (!Number.isFinite(timestampMs)) return raw;
    const chinaTime = new Date(timestampMs + (8 * 60 * 60 * 1000));
    if (!Number.isFinite(chinaTime.getTime())) return raw;
    const pad = (part) => String(part).padStart(2, '0');
    return `${chinaTime.getUTCFullYear()}-${pad(chinaTime.getUTCMonth() + 1)}-${pad(chinaTime.getUTCDate())} `
      + `${pad(chinaTime.getUTCHours())}:${pad(chinaTime.getUTCMinutes())}:${pad(chinaTime.getUTCSeconds())} +08:00`;
  }

  function buildPasskeyExportMarker(item = {}) {
    const sharedBuilder = root.MultiPagePasskeyApiLoginExecutor?.buildPasskeyExportMarker;
    if (typeof sharedBuilder === 'function') return normalizeExportTextField(sharedBuilder(item));
    const credentialId = normalizeText(item.passkeyCredentialId || item.credentialId || item.credential_id);
    if (!credentialId) return '';
    const segments = [`PASSKEY:${credentialId}`];
    if (Number.isInteger(Number(item.passkeySignCount))) segments.push(`signCount=${Math.max(0, Number(item.passkeySignCount))}`);
    if (Number.isInteger(Number(item.passkeyAlg))) segments.push(`alg=${Number(item.passkeyAlg)}`);
    return segments.join(';');
  }

  function formatFreeAccountTextLine(item = {}, options = {}) {
    const credentialMode = normalizeExportCredentialMode(options.credentialMode);
    const includeVerificationUrl = options.includeVerificationUrl !== false;
    const session = normalizeSessionPayload(item.session);
    const credential = credentialMode === 'session'
      ? (session ? JSON.stringify(session) : '')
      : normalizeText(item.accessToken || item.token || item.access_token);
    const recordedAt = formatExportRecordedAt(
      item.recordedAt
      || item.trialEligibilityCheckedAt
      || item.accessTokenUpdatedAt
      || item.updatedAt
    );
    const verificationUrl = includeVerificationUrl ? normalizeText(item.verificationUrl) : '';
    const fields = [normalizeEmail(item.email)];
    if (item.no2faFreeRoute === true) {
      if (verificationUrl) fields.push(verificationUrl);
    } else {
      const passkeyMarker = item.passkeyEnabled === true || normalizeText(item.passkeyCredentialId)
        ? buildPasskeyExportMarker(item)
        : '';
      fields.push(
        normalizeText(item.password || item.gptPassword),
        passkeyMarker || normalizeTotpSecret(item.totpMfaSecret || item.totpSecret)
      );
      if (verificationUrl) fields.push(verificationUrl);
    }
    fields.push(credential, recordedAt);
    return fields.map(normalizeExportTextField).join('---');
  }

  function decodeBase32Secret(secret = '') {
    const normalized = normalizeTotpSecret(secret).replace(/=+$/g, '');
    if (!normalized) throw new Error('TOTP secret 为空。');
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0;
    let value = 0;
    const bytes = [];
    for (const char of normalized) {
      const index = alphabet.indexOf(char);
      if (index < 0) throw new Error('TOTP secret 不是有效的 Base32 字符串。');
      value = (value << 5) | index;
      bits += 5;
      if (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return new Uint8Array(bytes);
  }

  function buildCounterBytes(counter) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    const safeCounter = Math.max(0, Math.floor(Number(counter) || 0));
    view.setUint32(0, Math.floor(safeCounter / 0x100000000), false);
    view.setUint32(4, safeCounter >>> 0, false);
    return new Uint8Array(buffer);
  }

  async function generateTotpCode(secret = '', options = {}) {
    const period = Math.max(1, Math.floor(Number(options.period) || 30));
    const digits = Math.max(1, Math.floor(Number(options.digits) || 6));
    const keyBytes = decodeBase32Secret(secret);
    const timestampSeconds = Math.floor(Number(options.forTime ?? (Date.now() / 1000)) || 0);
    const counterBytes = buildCounterBytes(Math.floor(timestampSeconds / period));
    let digest;
    if (globalThis.crypto?.subtle?.importKey && globalThis.crypto?.subtle?.sign) {
      const key = await globalThis.crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
      digest = new Uint8Array(await globalThis.crypto.subtle.sign('HMAC', key, counterBytes));
    } else if (typeof require === 'function') {
      const crypto = require('node:crypto');
      digest = new Uint8Array(crypto.createHmac('sha1', Buffer.from(keyBytes)).update(Buffer.from(counterBytes)).digest());
    } else {
      throw new Error('当前环境不支持生成 TOTP 验证码。');
    }
    const offset = digest[digest.length - 1] & 0x0f;
    const binary = ((digest[offset] & 0x7f) << 24)
      | ((digest[offset + 1] & 0xff) << 16)
      | ((digest[offset + 2] & 0xff) << 8)
      | (digest[offset + 3] & 0xff);
    return String(binary % (10 ** digits)).padStart(digits, '0');
  }

  function createFreeAccountService(deps = {}) {
    const {
      accountLifecycleService = null,
      accountRepository = null,
      addLog = async () => {},
      broadcastDataUpdate = () => {},
      chrome: chromeApi = globalThis.chrome,
      ensureContentScriptReadyOnTabUntilStopped = null,
      fetchImpl = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
      fetchVerificationCodeOnly = null,
      getState = async () => ({}),
      isTabAlive = async () => true,
      loginAndReadAccessTokenImpl = null,
      markCustomEmailPoolEntryTrialEligibility = null,
      registerTab = async () => {},
      reuseOrCreateTab = null,
      sendTabMessageUntilStopped = null,
      setState = null,
      SIGNUP_PAGE_INJECT_FILES = [],
      sleepWithStop = async (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      throwIfStopped = () => {},
    } = deps;
    const resultsApi = getResultsApi();
    const eligibilityApi = getEligibilityApi();
    let stopRequested = false;
    let running = false;
    let loginExecutor = null;

    function throwIfCheckStopped() {
      try {
        throwIfStopped();
      } catch (error) {
        if (!normalizeText(error?.code)) error.code = 'FREE_ACCOUNT_CHECK_STOPPED';
        error.retryable = false;
        throw error;
      }
      if (!stopRequested) return;
      const error = new Error('Free 账号资格检测已停止');
      error.code = 'FREE_ACCOUNT_CHECK_STOPPED';
      error.retryable = false;
      throw error;
    }

    async function getResults() {
      const stored = await chromeApi.storage.local.get([resultsApi.STORAGE_KEY]).catch(() => ({}));
      return resultsApi.normalizeResults(stored?.[resultsApi.STORAGE_KEY]);
    }

    async function saveResults(value = {}) {
      const payload = resultsApi.normalizeResults({ ...value, updatedAt: normalizeText(value.updatedAt) || new Date().toISOString() });
      try {
        await chromeApi.storage.local.set({ [resultsApi.STORAGE_KEY]: payload });
      } catch (error) {
        if (isStorageQuotaExceededError(error)) {
          throw createStorageQuotaExceededError(error);
        }
        throw error;
      }
      if (typeof setState === 'function') await setState({ [resultsApi.STORAGE_KEY]: payload }).catch(() => {});
      broadcastDataUpdate({ [resultsApi.STORAGE_KEY]: payload });
      return payload;
    }

    async function applyCanonicalEvidence(item = {}) {
      const email = normalizeEmail(item.email);
      if (!email || !accountRepository) return null;
      const credentials = normalizeCredential(item);
      await accountRepository.updateCredentials(email, {
        password: credentials.password,
        totpSecret: credentials.totpMfaSecret,
        no2faFreeRoute: credentials.no2faFreeRoute,
        accessToken: credentials.accessToken,
        accessTokenStatus: credentials.accessToken ? 'valid' : 'missing',
        accessTokenUpdatedAt: normalizeText(item.accessTokenUpdatedAt || item.trialEligibilityCheckedAt),
        session: credentials.session,
        sessionUpdatedAt: normalizeText(item.sessionUpdatedAt || item.accessTokenUpdatedAt),
        verificationUrl: credentials.verificationUrl,
        passkeyEnabled: credentials.passkeyEnabled,
        passkeyCredentialId: credentials.passkeyCredentialId,
        passkeyFactorId: normalizeText(credentials.passkeyFactorId),
        passkeyRpId: normalizeText(credentials.passkeyRpId),
        passkeyUserHandle: normalizeText(credentials.passkeyUserHandle),
        passkeyPrivateJwk: credentials.passkeyPrivateJwk || null,
        passkeyPublicKeyCose: credentials.passkeyPublicKeyCose || null,
        passkeySignCount: credentials.passkeySignCount,
        passkeyAlg: credentials.passkeyAlg,
      }, { source: normalizeText(item.source) || 'free-account-service' });
      await accountRepository.updateLifecycle(email, { membershipStatus: 'free' }, { source: normalizeText(item.source) || 'free-account-service' });
      const status = resultsApi.getItemEligibilityStatus(item);
      if (accountLifecycleService && ['eligible', 'ineligible', 'failed'].includes(status)) {
        return accountLifecycleService.applyTrialEligibilityEvidence(email, {
          status,
          reason: item.trialEligibilityReason,
          reasonCode: item.trialEligibilityReasonCode,
          checkedAt: item.trialEligibilityCheckedAt,
        }, { source: normalizeText(item.source) || 'free-account-service' });
      }
      if (accountLifecycleService && status === 'unknown') {
        return accountLifecycleService.clearTrialEligibilityEvidence(email, { source: normalizeText(item.source) || 'free-account-service' });
      }
      return null;
    }

    async function upsertItem(nextItem = {}, options = {}) {
      const current = await getResults();
      const item = resultsApi.sanitizeFreeAccountItem(nextItem);
      if (!item) throw new Error('Free 账号记录缺少有效邮箱。');
      const existing = current.items.find((row) => normalizeEmail(row.email) === item.email) || {};
      const merged = resultsApi.sanitizeFreeAccountItem(mergeCredential({ ...existing, ...item }, existing));
      const results = await saveResults({
        ...current,
        items: [...current.items.filter((row) => normalizeEmail(row.email) !== item.email), merged],
      });
      try {
        await applyCanonicalEvidence(merged);
      } catch (error) {
        if (options.strictCanonical === true) {
          await saveResults(current).catch((rollbackError) => {
            error.rollbackError = rollbackError;
          });
          throw error;
        }
        console.warn('[FreeAccountService] canonical sync failed:', error);
      }
      return { results, item: results.items.find((row) => row.email === item.email) || merged };
    }

    async function postEligibilityCheck(accessToken = '', state = {}, expectedEmail = '') {
      if (typeof fetchImpl !== 'function') throw new Error('当前环境不支持 fetch，无法检查资格。');
      const token = normalizeText(accessToken);
      if (!token) throw new Error('缺少 ChatGPT accessToken，无法检查资格。');
      const serviceToken = normalizeText(state.gcashEligibilityApiToken);
      if (!serviceToken) {
        const error = new Error('步骤 10 缺少 GCash 资格 API 授权令牌，请在设置中填写。');
        error.code = 'GCASH_ELIGIBILITY_API_TOKEN_MISSING';
        error.retryable = false;
        error.preserveSignupSession = true;
        throw error;
      }
      const tokenEmail = getAccessTokenEmail(token);
      const targetEmail = normalizeEmail(expectedEmail);
      if (tokenEmail && targetEmail && tokenEmail !== targetEmail) {
        const error = new Error(`GCash 资格检查使用的 AT 属于 ${tokenEmail}，不是当前账号 ${targetEmail}。`);
        error.code = 'FREE_ACCOUNT_ACCESS_TOKEN_EMAIL_MISMATCH';
        error.retryable = false;
        throw error;
      }
      const url = `${resolveApiBaseUrl(state)}/api/v1/check`;
      const timeoutMs = Math.max(3000, Math.floor(Number(state.trialEligibilityTimeoutMs) || DEFAULT_TIMEOUT_MS));
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
      try {
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${serviceToken}`,
          },
          body: JSON.stringify({ token, check_gcash_pm: true }),
          ...(controller ? { signal: controller.signal } : {}),
        });
        const text = await response.text().catch(() => '');
        let payload;
        try {
          payload = text ? JSON.parse(text) : {};
        } catch {
          payload = { raw: text, message: text };
        }
        if (!response.ok) {
          const embedded = findEligibilityPayload(payload);
          if (!Object.keys(embedded).length) {
            const unauthorized = response.status === 401 || response.status === 403;
            const error = new Error(unauthorized
              ? `GCash 资格 API 授权失败（HTTP ${response.status}），请检查资格 API 授权令牌。`
              : `GCash 资格接口返回 HTTP ${response.status}${normalizeText(payload?.message || payload?.reason) ? `：${normalizeText(payload.message || payload.reason)}` : ''}`);
            error.status = response.status;
            error.code = unauthorized ? 'GCASH_ELIGIBILITY_API_UNAUTHORIZED' : 'GCASH_ELIGIBILITY_API_HTTP_ERROR';
            error.retryable = !unauthorized && (response.status >= 500 || response.status === 408 || response.status === 429);
            error.preserveSignupSession = true;
            throw error;
          }
        }
        const decision = eligibilityApi.normalizeTrialEligibilityApiItem(findEligibilityPayload(payload));
        if (eligibilityApi.isTrialEligibilityDecisionEmailMismatch?.(decision, targetEmail)) {
          const error = new Error(eligibilityApi.buildTrialEligibilityEmailMismatchReason(decision, targetEmail));
          error.retryable = false;
          throw error;
        }
        return decision;
      } catch (error) {
        if (error?.name === 'AbortError') {
          const timeoutError = new Error(`GCash 资格检查接口请求超时（>${Math.round(timeoutMs / 1000)} 秒）。`);
          timeoutError.code = 'FREE_ACCOUNT_ELIGIBILITY_TIMEOUT';
          timeoutError.retryable = true;
          throw timeoutError;
        }
        if (error?.retryable === undefined && /failed to fetch|network|网络|load failed/i.test(normalizeText(error?.message || error))) {
          error.retryable = true;
        }
        throw error;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    async function checkDecisionWithRetry(accessToken, state, email) {
      let lastError = null;
      for (let attempt = 0; attempt <= DEFAULT_RETRY_DELAYS_MS.length; attempt += 1) {
        throwIfCheckStopped();
        try {
          const decision = await postEligibilityCheck(accessToken, state, email);
          const status = resultsApi.normalizeEligibilityStatus(decision.trialEligibilityStatus);
          if (status !== 'failed' || decision.trialEligibilityRetryable !== true || attempt >= DEFAULT_RETRY_DELAYS_MS.length) {
            return decision;
          }
          lastError = new Error(decision.trialEligibilityReason || 'GCash 资格检查返回不完整。');
          lastError.retryable = true;
        } catch (error) {
          lastError = error;
          if (error?.retryable === false || attempt >= DEFAULT_RETRY_DELAYS_MS.length) throw error;
        }
        const delayMs = DEFAULT_RETRY_DELAYS_MS[attempt];
        await addLog(`GCash 资格检查：${email} 遇到临时错误，${Math.round(delayMs / 1000)} 秒后重试（${attempt + 2}/${DEFAULT_RETRY_DELAYS_MS.length + 1}）。`, 'warn');
        await sleepWithStop(delayMs);
      }
      throw lastError || new Error('GCash 资格检查失败。');
    }

    async function markEmailPool(item = {}) {
      if (typeof markCustomEmailPoolEntryTrialEligibility !== 'function') return null;
      const status = resultsApi.getItemEligibilityStatus(item);
      return markCustomEmailPoolEntryTrialEligibility(await getState().catch(() => ({})), {
        email: item.email,
        status,
        reason: item.trialEligibilityReason,
        reasonCode: item.trialEligibilityReasonCode,
        checkedAt: item.trialEligibilityCheckedAt,
        accessToken: item.accessToken,
        accessTokenUpdatedAt: item.accessTokenUpdatedAt,
        markUsed: status === 'eligible' || status === 'ineligible',
        clearSelectedEmail: status === 'eligible' || status === 'ineligible',
        log: false,
      }).catch(() => null);
    }

    async function persistDecision(credential = {}, decision = {}, options = {}) {
      const checkedAt = normalizeText(options.checkedAt) || new Date().toISOString();
      const status = resultsApi.normalizeEligibilityStatus(decision.trialEligibilityStatus || options.status);
      const reason = normalizeText(decision.trialEligibilityReason || options.reason)
        || (status === 'eligible' ? '账号具有 GCash 资格。' : status === 'ineligible' ? '账号没有 GCash 资格。' : status === 'failed' ? 'GCash 资格检测失败，可稍后重试。' : '未检测 GCash 资格。');
      const item = {
        ...normalizeCredential(credential),
        source: normalizeText(options.source || credential.source) || 'free-account-service',
        trialEligibilityStatus: status,
        trialEligibilityReason: reason,
        trialEligibilityReasonCode: normalizeText(decision.trialEligibilityReasonCode || options.reasonCode),
        trialEligibilityCheckedAt: checkedAt,
        accessTokenUpdatedAt: normalizeText(credential.accessTokenUpdatedAt) || (credential.accessToken ? checkedAt : ''),
      };
      const persisted = await upsertItem(item);
      await markEmailPool(persisted.item);
      return persisted;
    }

    async function checkCredential(inputCredential = {}, settings = {}, options = {}) {
      const current = await getResults();
      const email = normalizeEmail(inputCredential.email);
      const stored = current.items.find((item) => item.email === email) || {};
      let credential = mergeCredential(inputCredential, stored);
      if (!credential.email) throw new Error('GCash 资格检查缺少账号邮箱。');
      await persistDecision(credential, { trialEligibilityStatus: 'checking', trialEligibilityReason: '正在检测 GCash 资格。' }, {
        source: options.source,
      });
      try {
        if (!credential.accessToken) {
          const loginResult = await loginAndReadAccessToken(credential, settings, { readAccessToken: true, source: options.source });
          credential = mergeCredential({
            ...credential,
            accessToken: loginResult.accessToken,
            session: normalizeSessionPayload(loginResult.session),
            accessTokenUpdatedAt: new Date().toISOString(),
          }, stored);
        }
        const decision = await checkDecisionWithRetry(credential.accessToken, settings, credential.email);
        const persisted = await persistDecision(credential, decision, { source: options.source });
        return { credential, decision, ...persisted };
      } catch (error) {
        if (error?.code === 'FREE_ACCOUNT_CHECK_STOPPED') throw error;
        const decision = error?.trialEligibilityDecision || {
          trialEligibilityStatus: 'failed',
          trialEligibilityReason: normalizeText(error?.message || error) || '资格检测失败，可稍后重试。',
          trialEligibilityReasonCode: normalizeText(error?.code) || 'FREE_ACCOUNT_ELIGIBILITY_FAILED',
          trialEligibilityRetryable: error?.retryable !== false,
        };
        const persisted = await persistDecision(credential, decision, { source: options.source });
        return { credential, decision: { ...decision, trialEligibilityStatus: 'failed' }, error, ...persisted };
      }
    }

    async function checkEligibility(input = {}) {
      if (running) throw new Error('Free 账号资格检测正在运行，请等待完成或先停止。');
      running = true;
      stopRequested = false;
      const source = normalizeText(input.source) || 'manual-free-eligibility-check';
      const state = { ...(await getState().catch(() => ({}))), ...(input.settings || {}) };
      const current = await getResults();
      const requestedEmails = uniqueEmails(input.emails);
      const credentials = (Array.isArray(input.credentials) ? input.credentials : [])
        .map(normalizeCredential)
        .filter((item) => item.email);
      if (!credentials.length && requestedEmails.length) {
        credentials.push(...current.items.filter((item) => requestedEmails.includes(item.email)).map(normalizeCredential));
      }
      const startedAt = new Date().toISOString();
      await saveResults({ ...current, running: true, stoppedAt: '', startedAt, source, total: credentials.length, completed: 0, flowStage: 'check-eligibility' });
      const eligible = [];
      const ineligible = [];
      const retryable = [];
      const failed = [];
      try {
        for (let index = 0; index < credentials.length; index += 1) {
          throwIfCheckStopped();
          const credential = credentials[index];
          const active = await getResults();
          await saveResults({ ...active, running: true, source, total: credentials.length, completed: index, flowStage: 'check-eligibility', flowStageEmail: credential.email });
          const result = await checkCredential(credential, state, { source });
          const status = resultsApi.getItemEligibilityStatus(result.item);
          if (status === 'eligible') eligible.push(credential.email);
          else if (status === 'ineligible') ineligible.push(credential.email);
          else {
            failed.push(credential.email);
            if (result.decision?.trialEligibilityRetryable !== false) retryable.push(credential.email);
          }
        }
        const final = await getResults();
        const finishedAt = new Date().toISOString();
        const results = await saveResults({ ...final, running: false, finishedAt, stoppedAt: '', flowStage: '', flowStageEmail: '', total: credentials.length, completed: credentials.length });
        return { results, eligible, ineligible, retryable, failed };
      } catch (error) {
        const currentResults = await getResults();
        const stopped = error?.code === 'FREE_ACCOUNT_CHECK_STOPPED' || stopRequested;
        const results = await saveResults({
          ...currentResults,
          running: false,
          stoppedAt: stopped ? new Date().toISOString() : '',
          finishedAt: stopped ? '' : new Date().toISOString(),
        });
        if (stopped) return { results, eligible, ineligible, retryable, failed, stopped: true };
        throw error;
      } finally {
        running = false;
      }
    }

    async function importResults(input = {}) {
      const current = await getResults();
      let importedItems = [];
      if (input.results && typeof input.results === 'object') {
        const source = Array.isArray(input.results) ? { items: input.results } : input.results;
        importedItems = resultsApi.normalizeResults(source).items;
      } else {
        const text = normalizeText(input.text || input.fileContent);
        if (/^[{[]/.test(text)) {
          try {
            const parsed = JSON.parse(text);
            importedItems = resultsApi.normalizeResults(Array.isArray(parsed) ? { items: parsed } : parsed).items;
          } catch {
            importedItems = parsePlainTextCredentials(text);
          }
        } else {
          importedItems = parsePlainTextCredentials(text);
        }
      }
      const existingByEmail = new Map(current.items.map((item) => [item.email, item]));
      const mergedItems = [...current.items];
      for (const rawItem of importedItems) {
        const normalized = resultsApi.sanitizeFreeAccountItem({ ...rawItem, source: normalizeText(input.source || rawItem.source) || 'free-import' });
        if (!normalized) continue;
        const existing = existingByEmail.get(normalized.email) || {};
        const merged = resultsApi.sanitizeFreeAccountItem(mergeCredential({ ...existing, ...normalized }, existing));
        const index = mergedItems.findIndex((item) => item.email === normalized.email);
        if (index >= 0) mergedItems[index] = merged;
        else mergedItems.push(merged);
        existingByEmail.set(normalized.email, merged);
      }
      const results = await saveResults({ ...current, items: mergedItems, source: normalizeText(input.source) || 'free-import' });
      for (const item of importedItems) await applyCanonicalEvidence(item).catch(() => null);
      return Object.assign(results, { importedCount: importedItems.length, restoredCount: importedItems.length, restoredEmails: importedItems.map((item) => item.email), skippedCount: 0, skippedEmails: [] });
    }

    async function exportResults(input = {}) {
      const current = await getResults();
      const group = normalizeText(input.status || input.group) === 'free-ineligible' ? 'free-ineligible' : 'free';
      const credentialMode = normalizeExportCredentialMode(input.credentialMode || input.exportCredentialMode);
      const emailSet = new Set(uniqueEmails(input.emails));
      const selectedItems = current.items.filter((item) => (
        resultsApi.getItemGroup(item) === group
        && (!emailSet.size || emailSet.has(item.email))
      ));
      const missingSessionEmails = credentialMode === 'session'
        ? selectedItems.filter((item) => !resultsApi.hasCompleteSession(item)).map((item) => item.email)
        : [];
      const items = selectedItems.map((item) => {
        const copy = { ...item };
        if (input.includeVerificationUrl === false) delete copy.verificationUrl;
        if (credentialMode === 'session') {
          copy.session = normalizeSessionPayload(item.session);
          delete copy.accessToken;
          delete copy.token;
          delete copy.access_token;
          delete copy.accessTokenStatus;
          delete copy.accessTokenUpdatedAt;
        } else {
          delete copy.session;
          delete copy.chatgptSession;
          delete copy.authSession;
        }
        return copy;
      });
      const payload = {
        ...resultsApi.normalizeResults({ items, source: `export-${group}`, updatedAt: new Date().toISOString() }),
        credentialExportMode: credentialMode,
        missingSessionCount: missingSessionEmails.length,
      };
      const lines = selectedItems.map((item) => formatFreeAccountTextLine(item, {
        credentialMode,
        includeVerificationUrl: input.includeVerificationUrl,
      }));
      return {
        fileName: buildTimestampedFileName(`${group}-${credentialMode === 'session' ? 'session' : 'at'}`, 'txt'),
        fileContent: lines.length ? `${lines.join('\n')}\n` : '',
        mimeType: 'text/plain;charset=utf-8',
        count: items.length,
        credentialMode,
        missingSessionCount: missingSessionEmails.length,
        missingSessionEmails,
        results: payload,
      };
    }

    async function deleteResults(input = {}) {
      const current = await getResults();
      const emails = new Set(uniqueEmails(input.emails));
      const group = normalizeText(input.status || input.group);
      const shouldDelete = (item) => {
        if (emails.size) return emails.has(item.email);
        if (group === 'free' || group === 'free-ineligible') return resultsApi.getItemGroup(item) === group;
        return true;
      };
      const deletedEmails = current.items.filter(shouldDelete).map((item) => item.email);
      const results = await saveResults({ ...current, items: current.items.filter((item) => !shouldDelete(item)) });
      return { results, deletedCount: deletedEmails.length, deletedEmails };
    }

    async function stopCheck() {
      stopRequested = true;
      const current = await getResults();
      return saveResults({ ...current, running: false, stoppedAt: new Date().toISOString() });
    }

    async function removeOpenAiCookie(cookie) {
      const host = normalizeText(cookie?.domain).replace(/^\.+/, '');
      if (!host) return false;
      const path = normalizeText(cookie?.path || '/');
      const details = { url: `https://${host}${path.startsWith('/') ? path : `/${path}`}`, name: cookie.name };
      if (cookie.storeId) details.storeId = cookie.storeId;
      if (cookie.partitionKey) details.partitionKey = cookie.partitionKey;
      try { return Boolean(await chromeApi.cookies.remove(details)); } catch { return false; }
    }

    async function clearOpenAiCookies() {
      if (!chromeApi?.cookies?.getAll || !chromeApi.cookies?.remove) return;
      const cookies = await chromeApi.cookies.getAll({}).catch(() => []);
      for (const cookie of cookies) {
        const domain = normalizeText(cookie?.domain).replace(/^\.+/, '').toLowerCase();
        if (COOKIE_CLEAR_DOMAINS.some((target) => domain === target || domain.endsWith(`.${target}`))) {
          await removeOpenAiCookie(cookie);
        }
      }
      await chromeApi.browsingData?.removeCookies?.({ since: 0, origins: COOKIE_CLEAR_ORIGINS }).catch(() => null);
    }

    async function requestTotpLookup(state = {}, credential = {}) {
      const response = await fetchImpl(`${resolveApiBaseUrl(state)}/api/v1/totp/lookup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: credential.email,
          ...(normalizeText(state.upiCredentialMembershipCheckTotpLookupKey) ? { key: normalizeText(state.upiCredentialMembershipCheckTotpLookupKey) } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      const code = normalizeText(payload.code).replace(/\D/g, '');
      if (!response.ok || code.length !== 6) throw new Error(normalizeText(payload.message || payload.reason) || 'TOTP lookup 未返回 6 位动态码。');
      return { code, source: 'lookup', secondsRemaining: Math.max(0, Math.floor(Number(payload.secondsRemaining || payload.seconds_remaining) || 0)) };
    }

    async function getTotpCodeForCredential({ state, credential, throwIfStopRequested }) {
      throwIfStopRequested?.();
      if (normalizeTotpSecret(credential.totpMfaSecret || credential.totpSecret)) {
        return { code: await generateTotpCode(credential.totpMfaSecret || credential.totpSecret), source: 'local', secondsRemaining: 30 };
      }
      return requestTotpLookup(state, credential);
    }

    function createLoginExecutor() {
      if (loginExecutor) return loginExecutor;
      const loginModule = root.MultiPageMembershipLoginSessionExecutor;
      const passkeyModule = root.MultiPagePasskeyApiLoginExecutor;
      if (!loginModule?.createMembershipLoginSessionExecutor) throw new Error('Free account login executor is unavailable.');
      let passkeyExecutor = null;
      const resolveStopChecker = (options = {}) => options.throwIfStopRequested || throwIfCheckStopped;
      const sessionExecutor = loginModule.createMembershipLoginSessionExecutor({
        addLog,
        chrome: chromeApi,
        clearOpenAiCookies,
        ensureContentScriptReadyOnTabUntilStopped,
        fetchVerificationCodeOnly,
        getTotpCodeForCredential,
        hasPasskeyCredential: passkeyModule?.hasPasskeyCredential || (() => false),
        hasWrittenPasskeySessionCookie: (...args) => passkeyExecutor?.hasWrittenPasskeySessionCookie?.(...args) === true,
        isTabAlive,
        maskAccessToken,
        registerTab,
        resolveStopChecker,
        reuseOrCreateTab,
        sendTabMessageUntilStopped,
        SIGNUP_PAGE_INJECT_FILES,
        sleepWithStop,
        tryPasskeyApiLoginAndReadAccessToken: (...args) => passkeyExecutor?.tryPasskeyApiLoginAndReadAccessToken?.(...args),
      });
      passkeyExecutor = passkeyModule?.createPasskeyApiLoginExecutor?.({
        addLog,
        chromeApi,
        clearOpenAiCookies,
        fetchImpl,
        hasPasskeyCredential: passkeyModule?.hasPasskeyCredential,
        maskAccessToken,
        normalizeEmail,
        normalizeString: normalizeText,
        openFreshLoginTab: sessionExecutor.openFreshLoginTab,
        resolveStopChecker,
      }) || null;
      loginExecutor = sessionExecutor;
      return loginExecutor;
    }

    async function loginAndReadAccessToken(credential = {}, state = {}, options = {}) {
      const normalized = normalizeCredential(credential);
      if (!normalized.email) throw new Error('登录缺少账号邮箱。');
      if (typeof loginAndReadAccessTokenImpl === 'function') {
        return loginAndReadAccessTokenImpl(normalized, state, {
          ...options,
          readAccessToken: options.readAccessToken !== false,
          throwIfStopRequested: throwIfCheckStopped,
        });
      }
      return createLoginExecutor().loginAndReadAccessToken(normalized, state, {
        ...options,
        readAccessToken: options.readAccessToken !== false,
        throwIfStopRequested: throwIfCheckStopped,
      });
    }

    async function loginAccount(input = {}) {
      if (running) throw new Error('Free 账号资格检测正在运行，请等待完成或先停止。');
      stopRequested = false;
      const current = await getResults();
      const email = normalizeEmail(input.email || input.credential?.email);
      const stored = current.items.find((item) => item.email === email) || {};
      const credential = mergeCredential(input.credential || { email }, stored);
      const state = { ...(await getState().catch(() => ({}))), ...(input.settings || {}) };
      const result = await loginAndReadAccessToken(credential, state, { readAccessToken: input.readAccessToken === true });
      let results = current;
      if (normalizeText(result.accessToken)) {
        results = (await upsertItem({
          ...credential,
          accessToken: result.accessToken,
          session: normalizeSessionPayload(result.session),
          accessTokenUpdatedAt: new Date().toISOString(),
        })).results;
      }
      return { ...result, results };
    }

    async function fillAccessTokens(input = {}) {
      if (running) throw new Error('Free 账号任务正在运行，请等待完成或先停止。');
      running = true;
      stopRequested = false;
      const state = { ...(await getState().catch(() => ({}))), ...(input.settings || {}) };
      const current = await getResults();
      const credentials = (Array.isArray(input.credentials) ? input.credentials : current.items).map((item) => {
        const stored = current.items.find((row) => row.email === normalizeEmail(item.email)) || {};
        return mergeCredential(item, stored);
      }).filter((item) => item.email && !item.accessToken && item.enabled !== false);
      const updated = [];
      const failed = [];
      try {
        for (const credential of credentials) {
          throwIfCheckStopped();
          try {
            const login = await loginAndReadAccessToken(credential, state, { readAccessToken: true });
            if (!normalizeText(login.accessToken)) throw new Error('登录完成但未读取到 AT。');
            await upsertItem({
              ...credential,
              accessToken: login.accessToken,
              session: normalizeSessionPayload(login.session),
              accessTokenUpdatedAt: new Date().toISOString(),
            });
            updated.push(credential.email);
          } catch (error) {
            failed.push({ email: credential.email, reason: normalizeText(error?.message || error) });
          }
        }
        return { results: await getResults(), updated, failed };
      } finally {
        running = false;
      }
    }

    async function refreshAccessTokens(input = {}) {
      const current = await getResults();
      const requested = (Array.isArray(input.credentials) ? input.credentials : current.items).map(normalizeCredential).filter((item) => item.email && item.enabled !== false);
      return fillAccessTokens({
        ...input,
        credentials: requested.map((item) => ({ ...item, accessToken: '' })),
        source: normalizeText(input.source) || 'free-refresh-access-token',
      });
    }

    async function listSessionFillTargets(input = {}) {
      const current = await getResults();
      const group = normalizeText(input.group || input.status) === 'free-ineligible' ? 'free-ineligible' : 'free';
      const onlyMissing = input.onlyMissing !== false;
      const requestedEmails = new Set(uniqueEmails(input.emails || input.targetEmails));
      const emails = current.items.filter((item) => (
        resultsApi.getItemGroup(item) === group
        && item.enabled !== false
        && (!requestedEmails.size || requestedEmails.has(item.email))
        && (!onlyMissing || !resultsApi.hasCompleteSession(item))
      )).map((item) => item.email);
      return { group, emails, count: emails.length };
    }

    async function fillSessions(input = {}, hooks = {}) {
      if (running) throw new Error('Free 账号任务正在运行，请等待完成或先停止。');
      running = true;
      stopRequested = false;
      const state = { ...(await getState().catch(() => ({}))), ...(input.settings || {}) };
      const selection = await listSessionFillTargets({
        group: input.group,
        onlyMissing: input.onlyMissing,
        targetEmails: input.targetEmails,
      });
      const targetEmails = uniqueEmails(input.targetEmails?.length ? input.targetEmails : selection.emails);
      const completedEmails = new Set(uniqueEmails(input.completedEmails));
      const failedEmails = new Set(uniqueEmails(input.failedEmails));
      const skippedEmails = new Set(uniqueEmails(input.skippedEmails));
      let nextIndex = Math.max(0, Math.min(targetEmails.length, Math.floor(Number(input.nextIndex) || 0)));

      const reportProgress = async (patch = {}) => {
        if (typeof hooks.onProgress !== 'function') return;
        const currentIndex = Math.max(0, Math.floor(Number(patch.currentIndex) || 0));
        await hooks.onProgress({
          group: selection.group,
          targetEmails,
          completedEmails: [...completedEmails],
          failedEmails: [...failedEmails],
          skippedEmails: [...skippedEmails],
          nextIndex,
          currentIndex,
          successCount: completedEmails.size,
          failedCount: failedEmails.size,
          skippedCount: skippedEmails.size,
          progress: { current: nextIndex, total: targetEmails.length },
          ...patch,
        });
      };

      const assertNotCanceled = async () => {
        throwIfCheckStopped();
        if (typeof hooks.isCanceled === 'function' && await hooks.isCanceled()) {
          const error = new Error('Session 补充任务已取消。');
          error.code = 'TASK_CANCELED';
          throw error;
        }
      };

      try {
        await reportProgress({ currentEmail: '' });
        for (let index = nextIndex; index < targetEmails.length; index += 1) {
          await assertNotCanceled();
          const email = targetEmails[index];
          const latest = await getResults();
          const row = latest.items.find((item) => item.email === email) || null;
          if (!row || row.enabled === false || resultsApi.getItemGroup(row) !== selection.group || resultsApi.hasCompleteSession(row)) {
            skippedEmails.add(email);
            failedEmails.delete(email);
            nextIndex = index + 1;
            await reportProgress({ currentEmail: email, currentIndex: index + 1, outcome: 'skipped' });
            continue;
          }

          const credential = mergeCredential(row, row);
          let session;
          let accessToken = '';
          try {
            await reportProgress({
              currentEmail: email,
              currentIndex: index + 1,
              outcome: 'processing',
              progress: { current: index + 1, total: targetEmails.length },
            });
            const login = await loginAndReadAccessToken(credential, state, {
              readAccessToken: true,
              source: normalizeText(input.source) || 'fill-free-account-session',
            });
            await assertNotCanceled();
            session = normalizeSessionPayload(login?.session || login);
            const sessionEmail = getSessionEmail(session);
            accessToken = normalizeText(
              login?.accessToken
              || session?.accessToken
              || session?.access_token
            );
            if (!session || !session?.user || !accessToken) {
              const error = new Error('登录完成但未读取到完整 ChatGPT Session。');
              error.code = 'FREE_ACCOUNT_SESSION_INCOMPLETE';
              throw error;
            }
            if (!sessionEmail || sessionEmail !== email) {
              const error = new Error('读取到的 ChatGPT Session 与目标账号不一致。');
              error.code = 'FREE_ACCOUNT_SESSION_EMAIL_MISMATCH';
              throw error;
            }
          } catch (error) {
            if (error?.code === 'TASK_CANCELED' || error?.code === 'FREE_ACCOUNT_CHECK_STOPPED') throw error;
            failedEmails.add(email);
            nextIndex = index + 1;
            await reportProgress({
              currentEmail: email,
              currentIndex: index + 1,
              outcome: 'failed',
              errorCode: normalizeText(error?.code) || 'FREE_ACCOUNT_SESSION_ACCOUNT_FAILED',
              errorMessage: normalizeText(error?.message || error) || '账号登录或 Session 读取失败。',
            });
            continue;
          }
          const capturedAt = new Date().toISOString();
          await upsertItem({
            ...credential,
            accessToken,
            session,
            accessTokenUpdatedAt: capturedAt,
            sessionUpdatedAt: capturedAt,
            recordedAt: capturedAt,
            source: normalizeText(input.source) || 'fill-free-account-session',
          }, { strictCanonical: true });
          completedEmails.add(email);
          failedEmails.delete(email);
          skippedEmails.delete(email);
          nextIndex = index + 1;
          await reportProgress({ currentEmail: email, currentIndex: index + 1, outcome: 'completed' });
        }
        return {
          group: selection.group,
          targetEmails,
          completedEmails: [...completedEmails],
          failedEmails: [...failedEmails],
          skippedEmails: [...skippedEmails],
          nextIndex,
          total: targetEmails.length,
          successCount: completedEmails.size,
          failedCount: failedEmails.size,
          skippedCount: skippedEmails.size,
          results: await getResults(),
        };
      } finally {
        running = false;
      }
    }

    function requestStop() {
      stopRequested = true;
      return { stopped: true };
    }

    async function checkRegistrationEligibility(input = {}) {
      stopRequested = false;
      const state = { ...(await getState().catch(() => ({}))), ...(input.state || {}) };
      const credential = normalizeCredential({
        ...state,
        ...(input.patch || {}),
        email: input.email || state.email,
        accessToken: input.accessToken || input.token || input.session?.accessToken || input.session?.access_token,
        session: input.session,
        source: 'registration-eligibility',
      });
      const email = normalizeEmail(credential.email || input.session?.user?.email || input.session?.email);
      credential.email = email;
      if (!email || !credential.accessToken) throw new Error('注册资格检测缺少账号邮箱或 AT。');
      const result = await checkCredential(credential, state, { source: 'registration-eligibility' });
      const status = resultsApi.getItemEligibilityStatus(result.item);
      return {
        eligible: status === 'eligible',
        reason: result.item.trialEligibilityReason,
        trialEligibilityStatus: status,
        trialEligibilityReason: result.item.trialEligibilityReason,
        trialEligibilityReasonCode: result.item.trialEligibilityReasonCode,
        trialEligibilityCheckedAt: result.item.trialEligibilityCheckedAt,
        item: result.item,
        results: result.results,
        retryable: status === 'failed' && result.decision?.trialEligibilityRetryable !== false,
      };
    }

    async function upsertRegistrationResult(input = {}) {
      const status = resultsApi.normalizeEligibilityStatus(input.trialEligibilityStatus || 'eligible');
      return (await persistDecision(input, {
        trialEligibilityStatus: status,
        trialEligibilityReason: input.trialEligibilityReason || input.reason,
        trialEligibilityReasonCode: input.trialEligibilityReasonCode,
      }, { source: normalizeText(input.source) || 'registration-eligibility' })).results;
    }

    return {
      checkEligibility,
      checkRegistrationEligibility,
      deleteResults,
      exportResults,
      fillAccessTokens,
      fillSessions,
      getResults,
      importResults,
      listSessionFillTargets,
      loginAccount,
      refreshAccessTokens,
      requestStop,
      saveResults,
      stopCheck,
      upsertItem,
      upsertRegistrationResult,
    };
  }

  return {
    DEFAULT_API_BASE_URL,
    createFreeAccountService,
    decodeJwtPayload,
    formatFreeAccountTextLine,
    generateTotpCode,
    getAccessTokenEmail,
    isStorageQuotaExceededError,
    normalizeApiBaseUrl,
    normalizeCredential,
    parsePlainTextCredentials,
  };
});
