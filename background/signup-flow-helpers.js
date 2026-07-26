(function attachSignupFlowHelpers(root, factory) {
  root.MultiPageSignupFlowHelpers = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createSignupFlowHelpersModule() {
  function createSignupFlowHelpers(deps = {}) {
    const {
      addLog,
      buildGeneratedAliasEmail,
      chrome,
      ensureContentScriptReadyOnTab,
      ensureHotmailAccountForFlow,
      ensureMail2925AccountForFlow,
      ensureLuckmailPurchaseForFlow,
      fetchGeneratedEmail,
      generateTotpCode = null,
      getState = null,
      isGeneratedAliasProvider,
      isReusableGeneratedAliasEmail,
      isHotmailProvider,
      isLikelyLoggedInChatgptHomeUrl = null,
      isRetryableContentScriptTransportError = () => false,
      isLuckmailProvider,
      isSignupEmailVerificationPageUrl,
      isSignupPasswordPageUrl,
      isSignupProfilePageUrl = null,
      persistRegistrationEmailState = null,
      resolveExistingTotpCredential = null,
      reuseOrCreateTab,
      sendToContentScriptResilient,
      setEmailState,
      setState,
      sleepWithStop = null,
      SIGNUP_AUTH_ENTRY_URL = 'https://chatgpt.com/auth/login',
      SIGNUP_ENTRY_URL,
      SIGNUP_PAGE_INJECT_FILES,
      throwIfStopped = null,
      waitForTabStableComplete = null,
      waitForTabUrlMatch,
    } = deps;

    const SIGNUP_EXISTING_TOTP_LOGIN_ERROR_PREFIX = 'SIGNUP_EXISTING_TOTP_LOGIN_FAILED::';

    function normalizeEmail(value = '') {
      return String(value || '').trim().toLowerCase();
    }

    function normalizeTotpSecret(value = '') {
      return String(value || '').replace(/\s+/g, '').trim().toUpperCase();
    }

    function isRegisteredLoginTotpState(snapshot = null) {
      const stateName = String(snapshot?.state || '').trim().toLowerCase();
      const verificationKind = String(snapshot?.verificationKind || '').trim().toLowerCase();
      return verificationKind === 'totp' && (
        stateName === 'verification_page'
        || snapshot?.hasVerificationTarget === true
        || snapshot?.verificationVisible === true
      );
    }

    function isRegisteredLoginTotpFailure(error) {
      const message = String(error?.message || error || '').trim();
      return /SIGNUP_USER_ALREADY_EXISTS::[\s\S]*登录\s*TOTP\s*二次验证页/i.test(message);
    }

    function createExistingTotpLoginError(message) {
      const error = new Error(`${SIGNUP_EXISTING_TOTP_LOGIN_ERROR_PREFIX}${message}`);
      error.code = 'SIGNUP_EXISTING_TOTP_LOGIN_FAILED';
      error.preserveSignupSession = true;
      return error;
    }

    async function sleepForTotpLogin(milliseconds) {
      if (typeof sleepWithStop === 'function') {
        await sleepWithStop(milliseconds);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, milliseconds));
    }

    function checkTotpLoginStop() {
      if (typeof throwIfStopped === 'function') {
        throwIfStopped();
      }
    }

    async function getFreshTotpCode(secret) {
      if (typeof generateTotpCode !== 'function') {
        throw createExistingTotpLoginError('本地 TOTP 生成器未加载，无法完成步骤 3.5。');
      }
      const nowSeconds = Math.floor(Date.now() / 1000);
      const secondsRemaining = 30 - (nowSeconds % 30 || 0);
      if (secondsRemaining <= 7) {
        await addLog?.(`步骤 3.5：当前 2FA 动态码即将过期，等待 ${secondsRemaining + 1} 秒后使用下一周期。`, 'info', {
          step: 3,
          stepKey: 'fill-password',
        });
        await sleepForTotpLogin((secondsRemaining + 1) * 1000);
        checkTotpLoginStop();
      }
      const code = String(await generateTotpCode(secret) || '').replace(/\D/g, '');
      if (!/^\d{6}$/.test(code)) {
        throw createExistingTotpLoginError('本地 TOTP 生成器未返回有效的 6 位动态码。');
      }
      return code;
    }

    async function getLoginAuthStateForTotpRecovery(tabId) {
      try {
        return await sendToContentScriptResilient('signup-page', {
          type: 'GET_LOGIN_AUTH_STATE',
          step: 3,
          source: 'background',
          payload: { backgroundOwnsWorkflowOutcome: true },
        }, {
          timeoutMs: 8000,
          responseTimeoutMs: 6000,
          retryDelayMs: 400,
          logMessage: '步骤 3.5：正在确认 2FA 登录页状态...',
        });
      } catch {
        return null;
      }
    }

    async function waitForExistingTotpLoginOutcome(tabId, timeoutMs = 45000) {
      const startedAt = Date.now();
      let lastAuthState = null;
      let lastUrl = '';
      while (Date.now() - startedAt < timeoutMs) {
        checkTotpLoginStop();
        const tab = await chrome?.tabs?.get?.(tabId).catch(() => null);
        lastUrl = String(tab?.url || lastUrl || '').trim();
        if (typeof isLikelyLoggedInChatgptHomeUrl === 'function'
          && isLikelyLoggedInChatgptHomeUrl(lastUrl)) {
          return { success: true, url: lastUrl };
        }

        lastAuthState = await getLoginAuthStateForTotpRecovery(tabId);
        if (lastAuthState?.accountDeactivated === true || lastAuthState?.state === 'account_deactivated_page') {
          throw createExistingTotpLoginError('账号已删除或停用，无法完成 2FA 登录。');
        }
        if (isRegisteredLoginTotpState(lastAuthState) && lastAuthState?.verificationErrorText) {
          return {
            success: false,
            invalidCode: true,
            errorText: String(lastAuthState.verificationErrorText || '').trim(),
            url: lastUrl,
          };
        }
        await sleepForTotpLogin(500);
      }
      return {
        success: false,
        invalidCode: false,
        authState: lastAuthState,
        url: lastUrl,
      };
    }

    async function recoverRegisteredTotpLogin(input = {}) {
      const tabId = Number(input?.tabId);
      if (!Number.isInteger(tabId)) {
        return { handled: false, reason: 'missing_tab' };
      }
      checkTotpLoginStop();
      const authState = input?.authState || await getLoginAuthStateForTotpRecovery(tabId);
      if (!isRegisteredLoginTotpState(authState)) {
        return { handled: false, reason: 'not_totp_login' };
      }

      const state = input?.state || (typeof getState === 'function' ? await getState() : {});
      const email = normalizeEmail(
        state?.email
        || state?.registrationEmailState?.current
        || state?.accountIdentifier
        || authState?.displayedEmail
      );
      const credential = typeof resolveExistingTotpCredential === 'function'
        ? await resolveExistingTotpCredential(email, state)
        : null;
      const secret = normalizeTotpSecret(
        credential?.totpMfaSecret
        || credential?.totpSecret
        || credential?.credentials?.totpSecret
      );
      if (!email || !secret) {
        await addLog?.('步骤 3.5：检测到已有账号的 2FA 登录页，但本地没有当前邮箱的 TOTP 密钥，将保留原有“已注册并排除”处理。', 'warn', {
          step: 3,
          stepKey: 'fill-password',
        });
        return { handled: false, reason: 'missing_totp_secret' };
      }

      await addLog?.('步骤 3.5：检测到已有账号的 2FA 登录页，正在使用本地保存的 TOTP 密钥完成登录。', 'info', {
        step: 3,
        stepKey: 'fill-password',
      });

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        checkTotpLoginStop();
        const code = await getFreshTotpCode(secret);
        let submitResult = null;
        try {
          submitResult = await sendToContentScriptResilient('signup-page', {
            type: 'FILL_CODE',
            step: 8,
            source: 'background',
            payload: {
              code,
              visibleStep: 3,
              purpose: 'login',
              verificationKind: 'totp',
              signupExistingTotpLogin: true,
              suppressVerificationCodeLog: true,
              backgroundOwnsWorkflowOutcome: true,
            },
          }, {
            timeoutMs: 50000,
            responseTimeoutMs: 47000,
            retryDelayMs: 500,
            logMessage: `步骤 3.5：正在提交 2FA 动态码（${attempt}/2）...`,
          });
        } catch (error) {
          if (!isRetryableContentScriptTransportError(error)) {
            throw createExistingTotpLoginError('2FA 动态码提交失败，已保留当前认证页和账号。');
          }
          await addLog?.('步骤 3.5：提交后认证页发生跳转并中断通信，正在从当前标签页确认登录结果。', 'warn', {
            step: 3,
            stepKey: 'fill-password',
          });
        }
        checkTotpLoginStop();

        const outcome = submitResult?.invalidCode
          ? {
              success: false,
              invalidCode: true,
              errorText: String(submitResult.errorText || '').trim(),
            }
          : await waitForExistingTotpLoginOutcome(tabId);
        if (outcome.success) {
          await addLog?.('步骤 3.5：2FA 登录成功，步骤 4 将按已登录状态完成，不再获取注册验证码。', 'ok', {
            step: 3,
            stepKey: 'fill-password',
          });
          return {
            handled: true,
            ready: true,
            alreadyVerified: true,
            skipProfileStep: true,
            skipProfileStepReason: 'existing_totp_login',
            existingTotpLogin: true,
            url: outcome.url || '',
          };
        }

        if (outcome.invalidCode && attempt < 2) {
          const secondsRemaining = 30 - (Math.floor(Date.now() / 1000) % 30 || 0);
          await addLog?.('步骤 3.5：本轮 2FA 动态码未通过，等待下一周期后仅重试一次。', 'warn', {
            step: 3,
            stepKey: 'fill-password',
          });
          await sleepForTotpLogin((secondsRemaining + 1) * 1000);
          continue;
        }

        const reason = outcome.invalidCode
          ? '连续两次 2FA 动态码均被页面拒绝，已保留当前认证页和账号。'
          : '提交 2FA 动态码后未确认进入 ChatGPT 已登录状态，已保留当前认证页和账号。';
        throw createExistingTotpLoginError(reason);
      }

      throw createExistingTotpLoginError('2FA 登录恢复未完成。');
    }

    async function waitForSignupEntryTabToSettle(tabId, step = 1) {
      if (step !== 2 || !Number.isInteger(tabId) || typeof waitForTabStableComplete !== 'function') {
        return null;
      }

      // Do not request window focus here. The automation tab is already
      // locked to the selected Chrome window; raising that window would
      // interrupt the user's active workspace.

      if (typeof addLog === 'function') {
        await addLog(
          `步骤 ${step}：注册页已打开，正在等待页面加载完成并额外稳定 3 秒...`,
          'info',
          { step, stepKey: 'signup-entry' }
        );
      }

      return waitForTabStableComplete(tabId, {
        timeoutMs: 45000,
        retryDelayMs: 300,
        stableMs: 3000,
        initialDelayMs: 300,
      });
    }

    async function openSignupEntryTab(step = 1, options = {}) {
      const tabId = await reuseOrCreateTab('signup-page', SIGNUP_ENTRY_URL, {
        inject: SIGNUP_PAGE_INJECT_FILES,
        injectSource: 'signup-page',
        forceNew: Boolean(options?.forceNew),
      });

      await waitForSignupEntryTabToSettle(tabId, step);

      await ensureContentScriptReadyOnTab('signup-page', tabId, {
        inject: SIGNUP_PAGE_INJECT_FILES,
        injectSource: 'signup-page',
        timeoutMs: 45000,
        retryDelayMs: 900,
        logMessage: `步骤 ${step}：ChatGPT 官网仍在加载，正在重试连接内容脚本...`,
      });

      return tabId;
    }

    async function openSignupAuthEntryTab(step = 2, options = {}) {
      const tabId = await reuseOrCreateTab('signup-page', options?.url || SIGNUP_AUTH_ENTRY_URL, {
        inject: SIGNUP_PAGE_INJECT_FILES,
        injectSource: 'signup-page',
        forceNew: Boolean(options?.forceNew),
      });

      await waitForSignupEntryTabToSettle(tabId, step);

      await ensureContentScriptReadyOnTab('signup-page', tabId, {
        inject: SIGNUP_PAGE_INJECT_FILES,
        injectSource: 'signup-page',
        timeoutMs: 45000,
        retryDelayMs: 900,
        logMessage: `步骤 ${step}：认证入口页仍在加载，正在重试连接内容脚本...`,
      });

      return tabId;
    }

    async function ensureSignupEntryPageReady(step = 1, options = {}) {
      const tabId = await openSignupEntryTab(step, options);
      const result = await sendToContentScriptResilient('signup-page', {
        type: 'ENSURE_SIGNUP_ENTRY_READY',
        step,
        source: 'background',
        payload: {},
      }, {
        timeoutMs: 35000,
        retryDelayMs: 700,
        logMessage: `步骤 ${step}：官网注册入口正在切换，等待页面恢复...`,
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      return { tabId, result: result || {} };
    }

    async function ensureSignupAuthEntryPageReady(step = 2, options = {}) {
      const tabId = await openSignupAuthEntryTab(step, options);
      const result = await sendToContentScriptResilient('signup-page', {
        type: 'ENSURE_SIGNUP_ENTRY_READY',
        step,
        source: 'background',
        payload: {},
      }, {
        timeoutMs: 35000,
        retryDelayMs: 700,
        logMessage: `步骤 ${step}：认证入口页正在切换，等待邮箱输入页恢复...`,
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      return { tabId, result: result || {} };
    }

    function parseUrlSafely(rawUrl) {
      if (!rawUrl) return null;
      try {
        return new URL(rawUrl);
      } catch {
        return null;
      }
    }

    function fallbackSignupProfilePageUrl(rawUrl) {
      const parsed = parseUrlSafely(rawUrl);
      if (!parsed) return false;
      return /\/(?:create-account\/profile|u\/signup\/profile|signup\/profile|about-you)(?:[/?#]|$)/i.test(parsed.pathname || '');
    }

    function resolveSignupPostIdentityState(rawUrl) {
      if (isSignupPasswordPageUrl(rawUrl)) {
        return 'password_page';
      }
      if (isSignupEmailVerificationPageUrl(rawUrl)) {
        return 'verification_page';
      }
      const isProfileUrl = typeof isSignupProfilePageUrl === 'function'
        ? isSignupProfilePageUrl(rawUrl)
        : fallbackSignupProfilePageUrl(rawUrl);
      if (isProfileUrl) {
        return 'profile_page';
      }
      return '';
    }

    async function ensureSignupPostIdentityPageReadyInTab(tabId, step = 2, options = {}) {
      const { skipUrlWait = false } = options;
      let landingUrl = '';
      let landingState = '';

      if (!skipUrlWait) {
        const matchedTab = await waitForTabUrlMatch(tabId, (url) => Boolean(resolveSignupPostIdentityState(url)), {
          timeoutMs: 45000,
          retryDelayMs: 300,
        });
        if (!matchedTab) {
          throw new Error('等待注册身份提交后的页面跳转超时，请检查页面是否仍停留在输入页。');
        }

        landingUrl = matchedTab.url || '';
        landingState = resolveSignupPostIdentityState(landingUrl);
      }

      if (!landingState) {
        try {
          const currentTab = await chrome.tabs.get(tabId);
          landingUrl = landingUrl || currentTab?.url || '';
          landingState = resolveSignupPostIdentityState(landingUrl);
        } catch {
          landingUrl = landingUrl || '';
        }
      }

      if (!landingState) {
        throw new Error(`注册身份提交后未能识别当前页面，既不是密码页、验证码页，也不是资料页。URL: ${landingUrl || 'unknown'}`);
      }

      if (landingState !== 'password_page' && typeof waitForTabStableComplete === 'function') {
        const stableTab = await waitForTabStableComplete(tabId, {
          timeoutMs: 45000,
          retryDelayMs: 300,
          stableMs: 800,
          initialDelayMs: 300,
        });
        if (stableTab?.url) {
          const stableState = resolveSignupPostIdentityState(stableTab.url);
          if (stableState) {
            landingUrl = stableTab.url;
            landingState = stableState;
          }
        }
      }

      await ensureContentScriptReadyOnTab('signup-page', tabId, {
        inject: SIGNUP_PAGE_INJECT_FILES,
        injectSource: 'signup-page',
        timeoutMs: 45000,
        retryDelayMs: 900,
        logMessage: landingState === 'password_page'
          ? `步骤 ${step}：密码页仍在加载，正在重试连接内容脚本...`
          : `步骤 ${step}：注册后续页面仍在加载，正在等待页面恢复...`,
      });

      if (landingState !== 'password_page') {
        return {
          ready: true,
          state: landingState,
          url: landingUrl,
        };
      }

      const result = await sendToContentScriptResilient('signup-page', {
        type: 'ENSURE_SIGNUP_PASSWORD_PAGE_READY',
        step,
        source: 'background',
        payload: {},
      }, {
        timeoutMs: 20000,
        retryDelayMs: 700,
        logMessage: `步骤 ${step}：认证页正在切换，等待密码页重新就绪...`,
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      return {
        ...(result || {}),
        ready: true,
        state: landingState,
        url: landingUrl,
      };
    }

    async function ensureSignupPostEmailPageReadyInTab(tabId, step = 2, options = {}) {
      return ensureSignupPostIdentityPageReadyInTab(tabId, step, options);
    }

    async function ensureSignupPasswordPageReadyInTab(tabId, step = 2, options = {}) {
      const result = await ensureSignupPostEmailPageReadyInTab(tabId, step, options);
      if (result.state !== 'password_page') {
        throw new Error(`当前页面不是密码页，实际落地为 ${result.state || 'unknown'}。URL: ${result.url || 'unknown'}`);
      }
      return result;
    }

    async function finalizeSignupPasswordSubmitInTab(tabId, password = '', step = 3) {
      if (!Number.isInteger(tabId)) {
        throw new Error(`认证页面标签页已关闭，无法完成步骤 ${step} 的提交后确认。`);
      }

      const maxFinalizeAttempts = 3;
      let lastRetryableError = null;

      for (let attempt = 1; attempt <= maxFinalizeAttempts; attempt += 1) {
        try {
          await ensureContentScriptReadyOnTab('signup-page', tabId, {
            inject: SIGNUP_PAGE_INJECT_FILES,
            injectSource: 'signup-page',
            timeoutMs: attempt === 1 ? 45000 : 60000,
            retryDelayMs: 900,
            logMessage: attempt === 1
              ? `步骤 ${step}：认证页仍在切换，正在等待页面恢复后继续确认提交流程...`
              : `步骤 ${step}：认证页通信中断，正在重新连接内容脚本后继续确认（${attempt}/${maxFinalizeAttempts}）...`,
          });

          const result = await sendToContentScriptResilient('signup-page', {
            type: 'PREPARE_SIGNUP_VERIFICATION',
            step,
            source: 'background',
            payload: {
              password: password || '',
              prepareSource: 'step3_finalize',
              prepareLogLabel: '步骤 3 收尾',
              timeoutMs: 75000,
              maxPasswordRecoverySubmits: attempt === 1 ? 1 : 0,
              backgroundOwnsWorkflowOutcome: true,
            },
          }, {
            timeoutMs: 90000,
            responseTimeoutMs: 82000,
            retryDelayMs: 700,
            logMessage: `步骤 ${step}：密码已提交，正在确认是否进入下一页面，必要时自动恢复重试页...`,
          });

          if (result?.error) {
            const contentError = new Error(result.error);
            if (result.errorCode) contentError.code = String(result.errorCode);
            if (typeof result.retryable === 'boolean') contentError.retryable = result.retryable;
            if (result.preserveSignupSession === true) contentError.preserveSignupSession = true;
            throw contentError;
          }

          return result || {};
        } catch (error) {
          if (isRegisteredLoginTotpFailure(error)) {
            const recovered = await recoverRegisteredTotpLogin({ tabId, step, error });
            if (recovered?.handled) {
              return recovered;
            }
          }
          if (!isRetryableContentScriptTransportError(error)) {
            throw error;
          }

          lastRetryableError = error;
          if (attempt >= maxFinalizeAttempts) {
            break;
          }

          if (typeof addLog === 'function') {
            await addLog(
              `步骤 ${step}：认证页提交后仍在切换，日本节点可能较慢；通信暂时中断，等待页面恢复后继续确认（${attempt}/${maxFinalizeAttempts}）。`,
              'warn'
            );
          }

          if (typeof waitForTabStableComplete === 'function') {
            await waitForTabStableComplete(tabId, {
              timeoutMs: 30000,
              retryDelayMs: 300,
              stableMs: 1000,
              initialDelayMs: 1500,
            }).catch(() => null);
          }
        }
      }

      const message = `步骤 ${step}：认证页在提交后切换过程中页面通信超时，已重连确认 ${maxFinalizeAttempts} 次仍未重新就绪，暂时无法确认是否进入下一页面。请重试当前轮。`;
      if (typeof addLog === 'function') {
        await addLog(message, 'warn');
        if (lastRetryableError) {
          await addLog(`步骤 ${step}：最后一次通信错误：${lastRetryableError?.message || lastRetryableError}`, 'warn');
        }
      }
      throw new Error(message);
    }

    async function persistResolvedSignupEmail(resolvedEmail, state = {}, options = {}) {
      if (resolvedEmail === state.email && !options?.preserveAccountIdentity) {
        return;
      }
      const generatedEmailAlreadyPersisted = Boolean(options?.generatedEmailAlreadyPersisted);
      if (typeof persistRegistrationEmailState === 'function') {
        if (!generatedEmailAlreadyPersisted) {
          await persistRegistrationEmailState(state, resolvedEmail, {
            source: 'flow',
            preserveAccountIdentity: Boolean(options?.preserveAccountIdentity),
          });
        }
        return;
      }
      if (resolvedEmail !== state.email) {
        await setEmailState(resolvedEmail);
      }
    }

    async function resolveSignupEmailForFlow(state, options = {}) {
      const ignoreCurrentEmail = Boolean(options?.ignoreCurrentEmail);
      let resolvedEmail = ignoreCurrentEmail ? '' : state.email;
      let generatedEmailAlreadyPersisted = false;
      if (isHotmailProvider(state)) {
        const preserveAccountIdentity = Boolean(options?.preserveAccountIdentity);
        const account = await ensureHotmailAccountForFlow({
          allowAllocate: true,
          allowUsedCurrent: preserveAccountIdentity,
          markUsed: !preserveAccountIdentity,
          preferredAccountId: state.currentHotmailAccountId || null,
        });
        resolvedEmail = account.registrationAliasEmail || account.email;
      } else if (isLuckmailProvider(state)) {
        const purchase = await ensureLuckmailPurchaseForFlow({ allowReuse: true });
        resolvedEmail = purchase.email_address;
      } else if (isGeneratedAliasProvider(state)) {
        if (Boolean(state?.mail2925UseAccountPool)
          && String(state?.mailProvider || '').trim().toLowerCase() === '2925'
          && typeof ensureMail2925AccountForFlow === 'function') {
          await ensureMail2925AccountForFlow({
            allowAllocate: true,
            preferredAccountId: state.currentMail2925AccountId || null,
            markUsed: true,
          });
        }
        if (!isReusableGeneratedAliasEmail?.(state, resolvedEmail)) {
          resolvedEmail = buildGeneratedAliasEmail(state);
        }
      } else if (!resolvedEmail && typeof fetchGeneratedEmail === 'function') {
        resolvedEmail = await fetchGeneratedEmail(state, options);
        generatedEmailAlreadyPersisted = true;
      }

      if (!resolvedEmail) {
        throw new Error('缺少邮箱地址，请先在侧边栏粘贴邮箱。');
      }

      if (!generatedEmailAlreadyPersisted || options?.preserveAccountIdentity) {
        await persistResolvedSignupEmail(resolvedEmail, state, {
          ...options,
          generatedEmailAlreadyPersisted,
        });
      }

      return resolvedEmail;
    }

    return {
      ensureSignupAuthEntryPageReady,
      ensureSignupEntryPageReady,
      ensureSignupPostIdentityPageReadyInTab,
      ensureSignupPostEmailPageReadyInTab,
      finalizeSignupPasswordSubmitInTab,
      ensureSignupPasswordPageReadyInTab,
      openSignupAuthEntryTab,
      openSignupEntryTab,
      recoverRegisteredTotpLogin,
      resolveSignupEmailForFlow,
    };
  }

  return {
    createSignupFlowHelpers,
  };
});
