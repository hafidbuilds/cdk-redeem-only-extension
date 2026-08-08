(function attachNo2faFreeRouteExecutor(root, factory) {
  root.MultiPageBackgroundNo2faFreeRoute = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createNo2faFreeRouteModule() {
  function normalizeString(value = '') {
    return String(value || '').trim();
  }

  function normalizeEmail(value = '') {
    return normalizeString(value).toLowerCase();
  }

  function normalizeTimestamp(value, fallback = Date.now()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.floor(numeric > 1000000000000 ? numeric / 1000 : numeric);
    }
    const parsed = Date.parse(String(value || ''));
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed / 1000);
    }
    const fallbackNumber = Number(fallback) || Date.now();
    return Math.max(1, Math.floor(fallbackNumber > 1000000000000 ? fallbackNumber / 1000 : fallbackNumber));
  }

  function decodeJwtPayload(token = '') {
    const rawPayload = normalizeString(token).split('.')[1] || '';
    if (!rawPayload) {
      return null;
    }
    try {
      const padded = rawPayload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(rawPayload.length / 4) * 4, '=');
      const json = typeof atob === 'function'
        ? atob(padded)
        : Buffer.from(padded, 'base64').toString('utf8');
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  function getAccessTokenIssuedAtSeconds(token = '') {
    const payload = decodeJwtPayload(token);
    const issuedAt = Number(payload?.iat);
    return Number.isFinite(issuedAt) && issuedAt > 0 ? normalizeTimestamp(issuedAt, 0) : 0;
  }

  function getSessionEmail(session = {}) {
    return normalizeEmail(
      session?.user?.email
      || session?.email
      || session?.account?.email
      || session?.profile?.email
      || ''
    );
  }

  function isValidEmail(value = '') {
    return /^[^\s@:/?#]+@[^\s@:/?#]+\.[^\s@:/?#]+$/.test(normalizeEmail(value));
  }

  function normalizeVerificationUrl(value = '') {
    const raw = normalizeString(value);
    if (!/^https?:\/\//i.test(raw)) {
      return '';
    }
    try {
      const parsed = new URL(raw);
      return /^https?:$/i.test(parsed.protocol) ? parsed.toString() : '';
    } catch {
      return '';
    }
  }

  function normalizeAssurivoOpenVerificationUrl(value = '') {
    const normalizedUrl = normalizeVerificationUrl(value);
    if (!normalizedUrl) {
      return '';
    }
    try {
      const parsed = new URL(normalizedUrl);
      if (
        parsed.hostname.toLowerCase() !== 'assurivo.com'
        || !['/console/open.php', '/console/feed.php'].includes(parsed.pathname)
      ) {
        return '';
      }
      parsed.pathname = '/console/open.php';
      return parsed.toString();
    } catch {
      return '';
    }
  }

  function normalizeVerificationUrlForFreeRecord(value = '') {
    const normalizedUrl = normalizeVerificationUrl(value);
    return normalizeAssurivoOpenVerificationUrl(normalizedUrl) || normalizedUrl;
  }

  function getEmailFromVerificationUrl(value = '') {
    const normalizedUrl = normalizeVerificationUrl(value);
    if (!normalizedUrl) {
      return '';
    }
    try {
      const parsed = new URL(normalizedUrl);
      const email = normalizeEmail(parsed.searchParams.get('mail') || parsed.searchParams.get('email') || '');
      return isValidEmail(email) ? email : '';
    } catch {
      return '';
    }
  }

  function splitPoolEntrySource(value = []) {
    if (Array.isArray(value)) {
      return value;
    }
    return normalizeString(value).split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean);
  }

  function getFirstVerificationUrlFromParts(parts = []) {
    for (const part of parts) {
      const verificationUrl = normalizeVerificationUrlForFreeRecord(part);
      if (verificationUrl) {
        return verificationUrl;
      }
    }
    return '';
  }

  function buildAssurivoOpenUrlFromCredential(value = '', fallbackEmail = '', state = {}) {
    const raw = normalizeString(value);
    if (!raw) {
      return '';
    }
    const directUrl = normalizeVerificationUrlForFreeRecord(raw);
    if (directUrl) {
      return directUrl;
    }
    const parts = raw.split(/-{3,}/).map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) {
      return '';
    }
    const urlFromParts = getFirstVerificationUrlFromParts(parts.slice(1));
    if (urlFromParts) {
      return urlFromParts;
    }
    const email = isValidEmail(parts[0]) ? normalizeEmail(parts[0]) : normalizeEmail(fallbackEmail);
    const pwd = normalizeString(parts[1]);
    if (!email || !pwd) {
      return '';
    }
    const limit = Math.max(1, Math.min(20, Math.floor(Number(state?.assurivoMailLimit) || 5)));
    const url = new URL('https://assurivo.com/console/open.php');
    url.searchParams.set('mail', email);
    url.searchParams.set('pwd', pwd);
    url.searchParams.set('limit', String(limit));
    return url.toString();
  }

  function getEmailFromCredential(value = '') {
    const raw = normalizeString(value);
    if (!raw) {
      return '';
    }
    const parts = raw.split(/-{3,}/).map((part) => part.trim()).filter(Boolean);
    const candidate = parts.length ? parts[0] : raw;
    return isValidEmail(candidate) ? normalizeEmail(candidate) : '';
  }

  function normalizeTotpSecret(value = '') {
    return normalizeString(value).replace(/\s+/g, '').toUpperCase();
  }

  function createExistingTotpPersistenceError(message) {
    const error = new Error(`SIGNUP_EXISTING_TOTP_LOGIN_FAILED::${message}`);
    error.code = 'SIGNUP_EXISTING_TOTP_LOGIN_FAILED';
    error.retryable = false;
    error.preserveSignupSession = true;
    return error;
  }

  function createAutoRunSessionSupersededError() {
    const error = new Error('自动运行会话已被新一轮替换。');
    error.code = 'AUTO_RUN_SESSION_SUPERSEDED';
    error.retryable = false;
    return error;
  }

  function createNo2faFreeRouteExecutor(deps = {}) {
    const {
      addLog = async () => {},
      checkRegistrationUpiTrialEligibility = null,
      completeNodeFromBackground = async () => {},
      getCustomEmailPoolEntries = null,
      getState = async () => ({}),
      markCurrentRegistrationAccountUsed = null,
      readCurrentChatGptSessionForExport = null,
      resolveExistingTotpCredential = null,
      setState = async () => {},
      throwIfStopped = () => {},
      upsertRegistrationResult = null,
    } = deps;

    async function addStepLog(message, level = 'info') {
      return addLog(message, level, {
        step: 9,
        stepKey: 'persist-no-2fa-free',
        nodeId: 'persist-no-2fa-free',
      });
    }

    async function addLegacyStepLog(message, level = 'info') {
      return addLog(message, level, {
        step: 10,
        stepKey: 'persist-no-2fa-free',
        nodeId: 'persist-no-2fa-free',
      });
    }

    function resolveVerificationUrl(state = {}, email = '') {
      const direct = normalizeVerificationUrlForFreeRecord(
        state.verificationUrl
        || state.emailVerificationUrl
        || state.currentVerificationUrl
        || state.currentEmailVerificationUrl
        || ''
      );
      if (direct) {
        return direct;
      }

      const entries = typeof getCustomEmailPoolEntries === 'function'
        ? getCustomEmailPoolEntries(state)
        : [];
      const rawEntries = [
        ...entries,
        ...splitPoolEntrySource(state.customEmailPoolEntries),
        ...splitPoolEntrySource(state.customEmailPool),
      ];
      const normalizedEmail = normalizeEmail(email);
      const matched = rawEntries.find((rawEntry) => {
        const entry = rawEntry && typeof rawEntry === 'object' ? rawEntry : { credential: rawEntry, email: rawEntry };
        const candidateUrl = normalizeVerificationUrlForFreeRecord(
          entry?.verificationUrl
          || entry?.emailVerificationUrl
          || entry?.url
          || entry?.fetchUrl
          || entry?.codeUrl
          || entry?.queryUrl
          || ''
        ) || buildAssurivoOpenUrlFromCredential(entry?.credential || entry?.email || '', entry?.email, state);
        const explicitEmailSource = entry?.email || entry?.mail || entry?.address || '';
        const explicitEmail = getEmailFromCredential(explicitEmailSource) || normalizeEmail(explicitEmailSource);
        const entryEmail = (isValidEmail(explicitEmail) ? explicitEmail : '')
          || getEmailFromVerificationUrl(candidateUrl)
          || getEmailFromCredential(entry?.credential);
        return entryEmail && entryEmail === normalizedEmail;
      });
      if (!matched) {
        return '';
      }
      const matchedEntry = matched && typeof matched === 'object' ? matched : { credential: matched, email: matched };
      return normalizeVerificationUrlForFreeRecord(
        matchedEntry?.verificationUrl
        || matchedEntry?.emailVerificationUrl
        || matchedEntry?.url
        || matchedEntry?.fetchUrl
        || matchedEntry?.codeUrl
        || matchedEntry?.queryUrl
        || ''
      ) || buildAssurivoOpenUrlFromCredential(matchedEntry?.credential || matchedEntry?.email || '', normalizedEmail, state);
    }

    async function executeNo2faFreeRoute(state = {}) {
      throwIfStopped();
      const expectedAutoRunSessionId = Math.max(0, Math.floor(Number(state?.autoRunSessionId) || 0));
      const assertAutoRunSessionCurrent = async () => {
        if (!expectedAutoRunSessionId) return;
        const currentState = await getState().catch(() => ({}));
        const currentSessionId = Math.max(0, Math.floor(Number(currentState?.autoRunSessionId) || 0));
        if (currentSessionId !== expectedAutoRunSessionId) {
          throw createAutoRunSessionSupersededError();
        }
      };
      await assertAutoRunSessionCurrent();
      const latestState = {
        ...(await getState().catch(() => ({}))),
        ...(state || {}),
      };
      await addStepLog('免 2FA Free 路线：开始保存账号；自动 GCash 资格检测已停用。', 'info');
      if (typeof readCurrentChatGptSessionForExport !== 'function') {
        throw new Error('免 2FA Free 路线缺少 ChatGPT session 读取能力。');
      }
      if (typeof upsertRegistrationResult !== 'function') {
        const error = new Error('第 9 步无法保存 Free 账号：账号保存能力尚未接入。');
        error.code = 'FREE_ACCOUNT_PERSISTENCE_UNAVAILABLE';
        error.preserveSignupSession = true;
        throw error;
      }

      const sessionResult = await readCurrentChatGptSessionForExport();
      await assertAutoRunSessionCurrent();
      const session = sessionResult?.session || {};
      const accessToken = normalizeString(sessionResult?.accessToken || session?.accessToken);
      const targetEmail = normalizeEmail(latestState.existingTotpLoginEmail)
        || normalizeEmail(latestState.email)
        || normalizeEmail(latestState.registrationEmailState?.current)
        || normalizeEmail(latestState.selectedCustomEmailPoolEmail);
      const sessionEmail = getSessionEmail(session);
      if (targetEmail && sessionEmail && targetEmail !== sessionEmail) {
        throw createExistingTotpPersistenceError('当前 Session 账号与本轮账号不一致，未写入 Free 并保留当前认证页。');
      }
      const email = targetEmail || sessionEmail;
      if (!email) {
        throw new Error('免 2FA Free 路线未读取到当前 ChatGPT 邮箱。');
      }
      if (!accessToken) {
        throw new Error('免 2FA Free 路线未读取到当前账号的 AT，账号未进入 Free。');
      }

      const verificationUrl = resolveVerificationUrl(latestState, email);
      if (!verificationUrl) {
        throw new Error('免 2FA Free 路线未找到当前账号的邮箱取码链接，账号未进入 Free。');
      }

      const existingTotpLogin = latestState.existingTotpLogin === true;
      const persistenceState = { ...latestState };
      let credentialPatch = {
        no2faFreeRoute: true,
        twoFactorEnabled: false,
        password: '',
        gptPassword: '',
        totpMfaSecret: '',
      };
      if (existingTotpLogin) {
        if (typeof resolveExistingTotpCredential !== 'function') {
          throw createExistingTotpPersistenceError('缺少已有账号凭据读取能力，未写入 Free。');
        }
        const existingCredential = await resolveExistingTotpCredential(email, latestState);
        const totpMfaSecret = normalizeTotpSecret(
          existingCredential?.totpMfaSecret
          || existingCredential?.totpSecret
          || existingCredential?.credentials?.totpSecret
        );
        if (!totpMfaSecret) {
          throw createExistingTotpPersistenceError('已有账号的 TOTP 密钥不可用，未按免 2FA 账号覆盖保存。');
        }
        const password = normalizeString(
          existingCredential?.password
          || existingCredential?.gptPassword
          || existingCredential?.credentials?.password
          || latestState.password
          || latestState.gptPassword
        );
        credentialPatch = {
          no2faFreeRoute: false,
          twoFactorEnabled: true,
          password,
          gptPassword: password,
          totpMfaSecret,
        };
        delete persistenceState.no2faFreeRecordedAt;
        persistenceState.no2faFreeRoute = false;
        persistenceState.twoFactorEnabled = true;
      }

      const recordedAt = getAccessTokenIssuedAtSeconds(accessToken)
        || normalizeTimestamp(existingTotpLogin ? latestState.recordedAt : latestState.no2faFreeRecordedAt);
      const recordedAtPatch = existingTotpLogin
        ? { recordedAt }
        : { recordedAt, no2faFreeRecordedAt: recordedAt };
      const savedAt = new Date().toISOString();
      const eligibilityPatch = {
        trialEligibilityStatus: 'unknown',
        trialEligibilityReason: '注册流程已完成；自动 GCash 资格检测已停用，可稍后手动复检。',
        trialEligibilityReasonCode: 'GCASH_ELIGIBILITY_DISABLED',
        trialEligibilityCheckedAt: savedAt,
      };
      try {
        await upsertRegistrationResult({
          email,
          session,
          accessToken,
          accessTokenUpdatedAt: savedAt,
          sessionUpdatedAt: savedAt,
          verificationUrl,
          ...recordedAtPatch,
          ...credentialPatch,
          ...eligibilityPatch,
          source: 'registration-step-9-no-2fa',
        });
      } catch (error) {
        error.preserveSignupSession = true;
        throw error;
      }
      await assertAutoRunSessionCurrent();
      const completionPatch = {
        email,
        verificationUrl,
        ...recordedAtPatch,
        ...credentialPatch,
        accessToken,
        accessTokenUpdatedAt: savedAt,
        ...eligibilityPatch,
      };
      await setState(completionPatch);
      if (typeof markCurrentRegistrationAccountUsed === 'function') {
        await assertAutoRunSessionCurrent();
        await markCurrentRegistrationAccountUsed({
          ...persistenceState,
          ...completionPatch,
        }, {
          logPrefix: '免 2FA Free 路线',
          level: 'ok',
          preferProvidedState: true,
        });
      }
      await assertAutoRunSessionCurrent();
      await addStepLog('免 2FA Free 账号已保存，当前注册轮次完成。', 'ok');
      await completeNodeFromBackground('persist-no-2fa-free', completionPatch);
      return {
        eligible: null,
        ...eligibilityPatch,
      };
    }

    async function executeNo2faFreeRouteWithEligibility(state = {}) {
      throwIfStopped();
      const expectedAutoRunSessionId = Math.max(0, Math.floor(Number(state?.autoRunSessionId) || 0));
      const assertAutoRunSessionCurrent = async () => {
        if (!expectedAutoRunSessionId) return;
        const currentState = await getState().catch(() => ({}));
        const currentSessionId = Math.max(0, Math.floor(Number(currentState?.autoRunSessionId) || 0));
        if (currentSessionId !== expectedAutoRunSessionId) {
          throw createAutoRunSessionSupersededError();
        }
      };
      await assertAutoRunSessionCurrent();
      const latestState = {
        ...(await getState().catch(() => ({}))),
        ...(state || {}),
      };
      await addLegacyStepLog('免 2FA Free 路线：步骤 7–9 已跳过，开始执行步骤 10 的 GCash 资格验证与 Free 保存。', 'info');
      if (typeof readCurrentChatGptSessionForExport !== 'function') {
        throw new Error('免 2FA Free 路线缺少 ChatGPT session 读取能力。');
      }
      if (typeof checkRegistrationUpiTrialEligibility !== 'function') {
        throw new Error('免 2FA Free 路线缺少 GCash 资格检测能力。');
      }

      const sessionResult = await readCurrentChatGptSessionForExport();
      await assertAutoRunSessionCurrent();
      const session = sessionResult?.session || {};
      const accessToken = normalizeString(sessionResult?.accessToken || session?.accessToken);
      const targetEmail = normalizeEmail(latestState.existingTotpLoginEmail)
        || normalizeEmail(latestState.email)
        || normalizeEmail(latestState.registrationEmailState?.current)
        || normalizeEmail(latestState.selectedCustomEmailPoolEmail);
      const sessionEmail = getSessionEmail(session);
      if (targetEmail && sessionEmail && targetEmail !== sessionEmail) {
        throw createExistingTotpPersistenceError('当前 Session 账号与本轮账号不一致，未写入 Free 并保留当前认证页。');
      }
      const email = targetEmail || sessionEmail;
      if (!email) {
        throw new Error('免 2FA Free 路线未读取到当前 ChatGPT 邮箱。');
      }
      if (!accessToken) {
        throw new Error(`免 2FA Free 路线未读取到 ${email} 的 AT，账号未进入 Free。`);
      }

      const verificationUrl = resolveVerificationUrl(latestState, email);
      if (!verificationUrl) {
        throw new Error(`免 2FA Free 路线未找到 ${email} 的邮箱取码链接，账号未进入 Free。`);
      }

      const existingTotpLogin = latestState.existingTotpLogin === true;
      const persistenceState = { ...latestState };
      let credentialPatch = {
        no2faFreeRoute: true,
        twoFactorEnabled: false,
        password: '',
        gptPassword: '',
        totpMfaSecret: '',
      };
      if (existingTotpLogin) {
        if (typeof resolveExistingTotpCredential !== 'function') {
          throw createExistingTotpPersistenceError('缺少已有账号凭据读取能力，未写入 Free。');
        }
        const existingCredential = await resolveExistingTotpCredential(email, latestState);
        const totpMfaSecret = normalizeTotpSecret(
          existingCredential?.totpMfaSecret
          || existingCredential?.totpSecret
          || existingCredential?.credentials?.totpSecret
        );
        if (!totpMfaSecret) {
          throw createExistingTotpPersistenceError('已有账号的 TOTP 密钥不可用，未按免 2FA 账号覆盖保存。');
        }
        const password = normalizeString(
          existingCredential?.password
          || existingCredential?.gptPassword
          || existingCredential?.credentials?.password
          || latestState.password
          || latestState.gptPassword
        );
        credentialPatch = {
          no2faFreeRoute: false,
          twoFactorEnabled: true,
          password,
          gptPassword: password,
          totpMfaSecret,
        };
        delete persistenceState.no2faFreeRecordedAt;
        persistenceState.no2faFreeRoute = false;
        persistenceState.twoFactorEnabled = true;
      }

      const recordedAt = getAccessTokenIssuedAtSeconds(accessToken)
        || normalizeTimestamp(existingTotpLogin ? latestState.recordedAt : latestState.no2faFreeRecordedAt);
      const recordedAtPatch = existingTotpLogin
        ? { recordedAt }
        : { recordedAt, no2faFreeRecordedAt: recordedAt };
      const eligibility = await checkRegistrationUpiTrialEligibility({
        state: persistenceState,
        email,
        session,
        accessToken,
        visibleStep: 10,
        patch: {
          email,
          verificationUrl,
          recordedAt,
          ...credentialPatch,
        },
      });
      await assertAutoRunSessionCurrent();
      const trialEligibilityStatus = normalizeString(eligibility?.trialEligibilityStatus).toLowerCase() || 'failed';
      const trialEligibilityCheckedAt = normalizeString(eligibility?.trialEligibilityCheckedAt) || new Date().toISOString();
      await setState({
        email,
        verificationUrl,
        ...recordedAtPatch,
        accessToken,
        accessTokenUpdatedAt: trialEligibilityCheckedAt,
        trialEligibilityStatus,
        trialEligibilityReason: normalizeString(eligibility?.trialEligibilityReason || eligibility?.reason),
        trialEligibilityReasonCode: normalizeString(eligibility?.trialEligibilityReasonCode),
        trialEligibilityCheckedAt,
      });
      if (!eligibility?.eligible) {
        const reason = eligibility?.reason || '未知原因';
        const error = new Error(`免 2FA Free 路线：账号未通过 GCash 资格检测：${reason}`);
        error.code = trialEligibilityStatus === 'ineligible'
          ? 'UPI_ACCOUNT_INELIGIBLE'
          : 'UPI_ELIGIBILITY_CHECK_FAILED';
        error.trialEligibilityStatus = trialEligibilityStatus;
        error.retryable = trialEligibilityStatus !== 'ineligible' && eligibility?.retryable !== false;
        error.preserveSignupSession = true;
        throw error;
      }

      await addLegacyStepLog('免 2FA Free 路线：已检测到 GCash 资格并写入 Free。', 'ok');
      if (typeof markCurrentRegistrationAccountUsed === 'function') {
        await assertAutoRunSessionCurrent();
        await markCurrentRegistrationAccountUsed({
          ...persistenceState,
          email,
          verificationUrl,
          ...recordedAtPatch,
          accessToken,
          accessToken,
        }, {
          logPrefix: '免 2FA Free 路线',
          level: 'ok',
          preferProvidedState: true,
        });
      }
      await assertAutoRunSessionCurrent();
      await completeNodeFromBackground('persist-no-2fa-free', {
        email,
        accessToken,
        verificationUrl,
        recordedAt,
        trialEligibilityStatus: 'eligible',
      });
      return eligibility;
    }

    return {
      executeNo2faFreeRoute,
      executeNo2faFreeRouteWithEligibility,
      resolveVerificationUrl,
    };
  }

  return {
    createNo2faFreeRouteExecutor,
  };
});
