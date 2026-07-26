// content/signup-session-page.js - ChatGPT session helpers for signup flows.
(function attachSignupSessionPage(root) {
  function createSignupSessionPage(context = {}) {
    const {
      documentRef = document,
      locationRef = location,
      fetchRef = typeof fetch === 'function' ? fetch.bind(root) : null,
      sessionApiUrl = 'https://chatgpt.com/api/auth/session',
      findSignupEntryTrigger = null,
      getActionText = null,
      isVisibleElement = null,
      isActionEnabled = null,
    } = context;
    const settingsCandidateSelector = 'button, a, [role="button"], [role="link"], [tabindex], div, li, span, p, section';
    const actionableSelector = 'button, a, [role="button"], [role="link"], [tabindex]';
    const passwordPattern = /密码|パスワード|पासवर्ड|(?:^|[\s_-])pass(?:word|wd)(?:[\s_-]|$)|change\s+password|set\s+(?:a\s+)?password|add\s+(?:a\s+)?password|manage\s+password/i;
    const passwordRejectPattern = /安全密钥|通行密钥|セキュリティキー|パスキー|passkey|security\s+key|authenticator|authentication\s+app|mfa|2fa|two[-\s]*factor|one[-\s]*time\s+(?:password|passcode|code)|otp|text\s+message|sms|session|会话|高级|advanced|सुरक्षा\s+कुंजी|पासकी|प्रमाणक|ऑथेंटिकेटर|सत्र|उन्नत|एक\s+बार\s+(?:का\s+)?(?:पासवर्ड|कोड)/i;

    function normalizeInlineText(value = '') {
      return String(value || '').replace(/\s+/g, ' ').trim();
    }
    function getChatGptSettingsActionText(element) {
      return normalizeInlineText([
        typeof getActionText === 'function' ? getActionText(element) : '',
        element?.textContent || '',
        element?.getAttribute?.('aria-label') || '',
        element?.getAttribute?.('title') || '',
        element?.getAttribute?.('data-testid') || '',
        element?.id || '',
      ].filter(Boolean).join(' '));
    }
    function getOwnSettingsActionText(element) {
      const ownText = Array.from(element?.childNodes || [])
        .filter((node) => node?.nodeType === 3)
        .map((node) => node.nodeValue || '')
        .join(' ');
      return normalizeInlineText([
        ownText,
        element?.getAttribute?.('aria-label') || '',
        element?.getAttribute?.('title') || '',
        element?.getAttribute?.('data-testid') || '',
        element?.id || '',
      ].filter(Boolean).join(' '));
    }
    function isChatGptSettingsPasswordActionText(text = '') {
      const normalized = normalizeInlineText(text);
      return Boolean(normalized && passwordPattern.test(normalized) && !passwordRejectPattern.test(normalized));
    }
    function isUsableSettingsElement(element) {
      const visible = typeof isVisibleElement === 'function' ? isVisibleElement(element) : Boolean(element);
      const enabled = typeof isActionEnabled === 'function'
        ? isActionEnabled(element)
        : (Boolean(element) && !element.disabled && element?.getAttribute?.('aria-disabled') !== 'true');
      return visible && enabled;
    }
    function resolveChatGptSettingsPasswordClickable(element) {
      if (!element || !isUsableSettingsElement(element)) return null;
      if (element.matches?.(actionableSelector)) return element;

      let ancestor = element.parentElement;
      for (let depth = 0; ancestor && depth < 5; depth += 1, ancestor = ancestor.parentElement) {
        if (!isUsableSettingsElement(ancestor)) continue;
        if (ancestor.matches?.(actionableSelector)) return ancestor;
        const text = getChatGptSettingsActionText(ancestor);
        if (text.length <= 180 && isChatGptSettingsPasswordActionText(text)) {
          const nestedAction = Array.from(ancestor.querySelectorAll?.(actionableSelector) || [])
            .find((candidate) => isUsableSettingsElement(candidate));
          return nestedAction || ancestor;
        }
        if (passwordRejectPattern.test(text)) break;
      }

      // React rows commonly attach the click handler to a plain ancestor; clicking the label still bubbles to it.
      return element;
    }
    function findChatGptSettingsPasswordAction() {
      if (!documentRef || typeof documentRef.querySelectorAll !== 'function') return null;
      const candidates = Array.from(documentRef.querySelectorAll(settingsCandidateSelector));
      const exactLabels = candidates.filter((element) => {
        if (!isUsableSettingsElement(element)) return false;
        const ownText = getOwnSettingsActionText(element);
        return ownText.length <= 120 && isChatGptSettingsPasswordActionText(ownText);
      });
      const fallbacks = candidates.filter((element) => {
        if (!isUsableSettingsElement(element)) return false;
        const text = getChatGptSettingsActionText(element);
        return text.length <= 180 && isChatGptSettingsPasswordActionText(text);
      });

      for (const element of [...exactLabels, ...fallbacks]) {
        const clickable = resolveChatGptSettingsPasswordClickable(element);
        if (clickable && isUsableSettingsElement(clickable)) return clickable;
      }
      return null;
    }

    async function readChatGptSession() {
      if (typeof fetchRef !== 'function') {
        throw new Error('当前环境不支持 fetch，无法读取 ChatGPT 会话。');
      }

      const sessionResponse = await fetchRef(sessionApiUrl, {
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });
      if (!sessionResponse.ok) {
        throw new Error(`读取 ChatGPT 会话失败（HTTP ${sessionResponse.status}）。`);
      }

      const session = await sessionResponse.json().catch(() => ({}));
      if (!session || typeof session !== 'object' || Array.isArray(session) || !Object.keys(session).length) {
        throw new Error('当前页面未返回可用 ChatGPT session，无法导出登录态。');
      }

      return session;
    }

    function extractAccessToken(session = {}) {
      return String(session?.accessToken || session?.access_token || '').trim();
    }

    async function readChatGptSessionExportData() {
      const session = await readChatGptSession();
      return {
        session,
        accessToken: extractAccessToken(session),
        email: String(session?.user?.email || '').trim(),
        expiresAt: session?.expires || '',
      };
    }

    function detectLoggedInHome(rawUrl = locationRef.href) {
      const url = String(rawUrl || '').trim();
      if (!url) {
        return false;
      }

      try {
        const parsed = new URL(url);
        const host = String(parsed.hostname || '').toLowerCase();
        if (!['chatgpt.com', 'www.chatgpt.com', 'chat.openai.com'].includes(host)) {
          return false;
        }

        const path = String(parsed.pathname || '');
        if (/^\/(?:auth\/|create-account\/|email-verification|log-in)(?:[/?#]|$)/i.test(path)) {
          return false;
        }

        const signupTrigger = typeof findSignupEntryTrigger === 'function'
          ? findSignupEntryTrigger()
          : null;
        if (signupTrigger) {
          return false;
        }

        if (documentRef && typeof documentRef.querySelectorAll === 'function') {
          const loginActionPattern = /登录|log\s*in|sign\s*in/i;
          const candidates = documentRef.querySelectorAll(
            'a, button, [role="button"], [role="link"], input[type="button"], input[type="submit"]'
          );

          for (const el of candidates) {
            const text = typeof getActionText === 'function'
              ? getActionText(el)
              : [
                el?.textContent,
                el?.value,
                el?.getAttribute?.('aria-label'),
                el?.getAttribute?.('title'),
              ]
                .filter(Boolean)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (!text || !loginActionPattern.test(text)) {
              continue;
            }

            const visible = typeof isVisibleElement === 'function'
              ? isVisibleElement(el)
              : true;
            if (!visible) {
              continue;
            }

            const enabled = typeof isActionEnabled === 'function'
              ? isActionEnabled(el)
              : (Boolean(el) && !el.disabled && el?.getAttribute?.('aria-disabled') !== 'true');
            if (enabled) {
              return false;
            }
          }
        }

        return true;
      } catch {
        return false;
      }
    }

    return {
      readChatGptSession,
      extractAccessToken,
      detectLoggedInHome,
      findChatGptSettingsPasswordAction,
      getChatGptSettingsActionText,
      isChatGptSettingsPasswordActionText,
      readChatGptSessionExportData,
      resolveChatGptSettingsPasswordClickable,
    };
  }

  root.MultiPageSignupSessionPage = { createSignupSessionPage };
})(typeof self !== 'undefined' ? self : window);
