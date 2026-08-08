(function attachRegistrationAccountState(root, factory) {
  const api = factory();
  root.MultiPageRegistrationAccountState = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof self !== 'undefined' ? self : globalThis, function createRegistrationAccountStateRegistry() {
  function wrapDependency(fn) {
    return typeof fn === 'function' ? (...args) => fn(...args) : undefined;
  }

  function isAccountDeactivatedFailure(error) {
    const message = String(error?.message || error || '');
    return error?.code === 'ACCOUNT_DEACTIVATED'
      || /ACCOUNT_DEACTIVATED::|account[_\s-]*deactivated|账号.*(?:删除|停用|封禁)/i.test(message);
  }

  function createAccountDeactivationMarker(deps = {}) {
    return async function markCurrentRegistrationAccountDeactivated(state = {}, options = {}) {
      const providedState = state && typeof state === 'object' ? state : {};
      const currentState = await deps.getState();
      const latestState = {
        ...providedState,
        ...(currentState && typeof currentState === 'object' ? currentState : {}),
      };
      const email = String(
        options.email
        || latestState.email
        || latestState.registrationEmailState?.current
        || latestState.selectedCustomEmailPoolEmail
        || ''
      ).trim().toLowerCase();
      if (!email) {
        throw new Error('无法标记账号封禁：当前账号邮箱为空。');
      }

      const checkedAt = String(options.checkedAt || new Date().toISOString()).trim();
      const reason = String(options.reason || 'OpenAI 认证页返回 account_deactivated，账号已删除或停用。').trim();
      const passwordOwner = String(latestState.passwordAccountIdentifier || '').trim().toLowerCase();
      const password = !passwordOwner || passwordOwner === email
        ? String(latestState.password || '').trim()
        : '';
      const existingRecord = await deps.accountRepository.getAccount(email).catch(() => null);
      const credentialPatch = {
        ...(existingRecord?.credentials || {}),
        ...(password ? { password } : {}),
      };

      await deps.accountRepository.upsertAccount({
        ...(existingRecord || {}),
        id: email,
        identity: {
          ...(existingRecord?.identity || {}),
          type: 'email',
          email,
          source: String(existingRecord?.identity?.source || latestState.emailGenerator || latestState.mailProvider || '').trim(),
          providerId: String(existingRecord?.identity?.providerId || latestState.currentHotmailAccountId || latestState.currentMail2925AccountId || '').trim(),
        },
        credentials: credentialPatch,
        workflow: {
          ...(existingRecord?.workflow || {}),
          lastTaskId: String(latestState.activeTaskId || existingRecord?.workflow?.lastTaskId || '').trim(),
          lastNodeId: 'fetch-signup-code',
          lastRunStatus: 'account_deactivated',
        },
      }, {
        now: checkedAt,
        source: 'signup-step4-account-deactivated',
      });

      const lifecycleResult = await deps.accountLifecycleService.applyAccessTokenEvidence(email, {
        errorCode: 'account_deactivated',
        message: reason,
      }, {
        checkedAt,
        source: 'signup-step4-account-deactivated',
      });
      const poolResult = await deps.customEmailPoolStateRegistry.markCurrentCustomEmailPoolEntryRegistrationBlocked({
        ...latestState,
        email,
      }, {
        email,
        reason,
        reasonCode: 'account_deactivated',
        blockedAt: checkedAt,
        logPrefix: `${String(options.logPrefix || '步骤 4').trim()}：自定义邮箱池`,
        level: options.level || 'warn',
      });
      const sourceResult = await deps.markCurrentRegistrationAccountUnavailable({
        ...latestState,
        email,
      }, {
        logPrefix: String(options.logPrefix || '步骤 4').trim(),
        level: options.level || 'warn',
        reason: 'account_deactivated',
        reasonLabel: '账号封禁',
        skipCustomEmailPool: true,
      });

      deps.broadcastDataUpdate({ accountRecordsV2: await deps.accountRepository.readRoot() });
      await deps.addLog(`${String(options.logPrefix || '步骤 4').trim()}：当前账号已标记为封禁，后续不会再用于注册或兑换。`, options.level || 'warn');
      return {
        updated: true,
        email,
        checkedAt,
        nextEmail: String(poolResult?.selectedCustomEmailPoolEmail || '').trim().toLowerCase(),
        poolUpdated: Boolean(poolResult?.updated),
        sourceUpdated: Boolean(sourceResult?.updated),
        record: lifecycleResult?.record || null,
      };
    };
  }

  function createTrialIneligibleMarker(deps = {}) {
    return async function markCurrentRegistrationAccountTrialIneligible(state = {}, options = {}) {
      const providedState = state && typeof state === 'object' ? state : {};
      const currentState = await deps.getState();
      const latestState = {
        ...providedState,
        ...(currentState && typeof currentState === 'object' ? currentState : {}),
      };
      const email = String(
        options.email
        || latestState.email
        || latestState.registrationEmailState?.current
        || latestState.step8VerificationTargetEmail
        || latestState.selectedCustomEmailPoolEmail
        || ''
      ).trim().toLowerCase();
      if (!email) {
        return { updated: false, email: '' };
      }

      const reason = String(options.reason || '账号无试用资格').trim();
      const reasonCode = String(options.reasonCode || 'UPI_TRIAL_INELIGIBLE').trim();
      const checkedAt = String(options.checkedAt || new Date().toISOString()).trim();
      const accessToken = String(
        options.accessToken
        || latestState.accessToken
        || ''
      ).trim();
      const poolResult = await deps.customEmailPoolStateRegistry.markCurrentCustomEmailPoolEntryTrialIneligible({
        ...latestState,
        email,
      }, {
        email,
        reason,
        reasonCode,
        checkedAt,
        accessToken,
        accessTokenUpdatedAt: String(options.accessTokenUpdatedAt || checkedAt).trim(),
        logPrefix: `${String(options.logPrefix || '第 10 步 GCash 资格检查').trim()}：自定义邮箱池`,
        level: options.level || 'warn',
      });
      const sourceResult = await deps.markCurrentRegistrationAccountUnavailable({
        ...latestState,
        email,
      }, {
        logPrefix: String(options.logPrefix || '第 10 步 GCash 资格检查').trim(),
        level: options.level || 'warn',
        reason: 'trial_ineligible',
        reasonLabel: '无试用资格',
        skipCustomEmailPool: true,
      });
      const lifecycleRecord = await deps.accountLifecycleService.applyTrialEligibilityEvidence(email, {
        status: 'ineligible',
        reason,
        reasonCode,
        checkedAt,
      }, {
        checkedAt,
        source: 'registration-upi-eligibility',
      });

      if (deps.accountRepository?.readRoot) {
        deps.broadcastDataUpdate({ accountRecordsV2: await deps.accountRepository.readRoot() });
      }
      await deps.addLog(
        `${String(options.logPrefix || '第 10 步 GCash 资格检查').trim()}：当前账号已标记为无 GCash 资格，后续不会再次用于当前注册流程。`,
        options.level || 'warn'
      );
      return {
        updated: Boolean(poolResult?.updated || sourceResult?.updated || lifecycleRecord),
        email,
        reason,
        checkedAt,
        nextEmail: String(poolResult?.selectedCustomEmailPoolEmail || '').trim().toLowerCase(),
        poolUpdated: Boolean(poolResult?.updated),
        sourceUpdated: Boolean(sourceResult?.updated),
        record: lifecycleRecord || null,
      };
    };
  }

  function createRegistrationAccountState(deps = {}) {
    return {
      isAccountDeactivatedFailure,
      markCurrentRegistrationAccountDeactivated: wrapDependency(deps.markCurrentRegistrationAccountDeactivated)
        || createAccountDeactivationMarker(deps),
      markCurrentRegistrationAccountRegistrationBlocked: wrapDependency(deps.markCurrentRegistrationAccountRegistrationBlocked),
      markCurrentRegistrationAccountUsed: wrapDependency(deps.markCurrentRegistrationAccountUsed),
      markCurrentRegistrationAccountTrialIneligible: createTrialIneligibleMarker(deps),
      recordStep7AccountCheckpoint: wrapDependency(deps.recordStep7AccountCheckpoint),
    };
  }

  return {
    createRegistrationAccountState,
    createTrialIneligibleMarker,
    isAccountDeactivatedFailure,
  };
});
