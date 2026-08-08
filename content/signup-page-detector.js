// content/signup-page-detector.js - Shared signup page detection helpers.
(function attachSignupPageDetector(root) {
  if (root.MultiPageSignupPageDetector?.createSignupPageDetector) {
    root.SignupPageDetector = root.SignupPageDetector || root.MultiPageSignupPageDetector;
    return;
  }

  function createDetectorBackedPattern(detectorName, fallbackPattern) {
    return Object.freeze({
      test(text = '') {
        const detector = root.MultiPageAuthPageDetectors?.[detectorName];
        return typeof detector === 'function'
          ? detector(text)
          : fallbackPattern.test(String(text || ''));
      },
    });
  }

  const constants = Object.freeze({
    VERIFICATION_CODE_INPUT_SELECTOR: [
      'input[name="code"]',
      'input[name="otp"]',
      'input[autocomplete="one-time-code"]',
      'input[type="text"][maxlength="6"]',
      'input[type="tel"][maxlength="6"]',
      'input[aria-label*="code" i]',
      'input[aria-label*="कोड"]',
      'input[aria-label*="सत्यापन"]',
      'input[placeholder*="code" i]',
      'input[placeholder*="कोड"]',
      'input[placeholder*="सत्यापन"]',
      'input[inputmode="numeric"]',
    ].join(', '),
    ONE_TIME_CODE_LOGIN_PATTERN: /使用一次性验证码登录|改用(?:一次性)?验证码(?:登录)?|使用验证码登录|一次性验证码|验证码登录|one[-\s]*time\s*(?:passcode|password|code)|use\s+(?:a\s+)?one[-\s]*time\s*(?:passcode|password|code)(?:\s+instead)?|use\s+(?:a\s+)?code(?:\s+instead)?|sign\s+in\s+with\s+(?:email|code)|email\s+(?:me\s+)?(?:a\s+)?code|(?:एक[-\s]*)?बार(?:\s+का)?\s+(?:कोड|पासकोड)|कोड\s+(?:से|का)\s+(?:लॉग\s*इन|साइन\s*इन)/i,
    SIGNUP_PASSWORD_SWITCH_PATTERN: /^(?:使用密码继续|继续使用密码|使用密码|continue\s+with\s+password|use\s+(?:a\s+)?password(?:\s+instead)?|continuer\s+avec\s+(?:(?:un|le|votre)\s+)?mot\s+de\s+passe|utiliser\s+(?:(?:un|le|votre)\s+)?mot\s+de\s+passe|パスワードで続行|パスワードを使用して続行|पासवर्ड\s+से\s+जारी\s+रखें|पासवर्ड\s+का\s+उपयोग\s+करके\s+जारी\s+रखें)$/i,
    SIGNUP_PASSWORD_SWITCH_PHRASE_PATTERN: /使用\s*密码\s*(?:继续)?|继续\s*(?:使用)?\s*密码|continue\s+with\s+password|use\s+(?:a\s+)?password(?:\s+instead)?|continuer\s+avec\s+(?:(?:un|le|votre)\s+)?mot\s+de\s+passe|utiliser\s+(?:(?:un|le|votre)\s+)?mot\s+de\s+passe|パスワード(?:を使用して)?で?続行|पासवर्ड\s+(?:से|का\s+उपयोग\s+करके)\s+जारी\s+रखें/i,
    HINDI_LOGIN_ENTRY_PATTERN: /लॉग\s*इन(?:\s*करें)?|साइन\s*इन(?:\s*करें)?/i,
    LOGIN_ENTRY_ACTION_PATTERN: /(?:^|\b)(?:log\s*in|sign\s*in|continue\s+(?:with|using)\s+(?:email|chatgpt)|use\s+(?:an?\s+)?email|email\s+address)(?:\b|$)|登录|登陆|邮箱|电子邮件|लॉग\s*इन(?:\s*करें)?|साइन\s*इन(?:\s*करें)?|ई-?मेल(?:\s+पता)?/i,
    LOGIN_MORE_OPTIONS_PATTERN: /更多(?:选项|登录方式|方式)|其他(?:登录方式|选项|方式)|显示更多|more\s+(?:login\s+|sign[-\s]*in\s+)?options|other\s+(?:login\s+|sign[-\s]*in\s+)?(?:options|ways)|show\s+more|(?:और|अन्य)\s+(?:विकल्प|तरीके)|ज़्यादा\s+दिखाएं/i,
    LOGIN_EXTERNAL_IDP_PATTERN: /google|microsoft|apple|sso|single\s+sign[-\s]*on|企业|工作区|workspace/i,
    LOGIN_CODE_ONLY_ACTION_PATTERN: /one[-\s]*time|passcode|use\s+(?:a\s+)?code|验证码|一次性/i,
    LOGIN_TOTP_VERIFICATION_PATTERN: /authenticator|authentication\s+app|one[-\s]*time\s+password\s+application|two[-\s]*factor|2fa|mfa|multi[-\s]*factor|verification\s+app|totp|身份验证器|认证器|双重验证|两步验证|多重验证|动态验证码/i,
    LOGIN_EMAIL_VERIFICATION_PATTERN: /检查您的收件箱|输入我们刚刚向|重新发送电子邮件|email\s+verification|check\s+your\s+inbox|we\s+(?:just\s+)?(?:sent|emailed)|sent\s+(?:a\s+)?code\s+to|emailed\s+(?:a\s+)?code|email\s+(?:address|code)|收件箱|邮箱|电子邮件|(?:अपना\s+)?इनबॉक्स\s+देखें|(?:सत्यापन|वेरिफिकेशन)\s+कोड|(?:ई-?मेल|मेल)\s+(?:कोड|पता)|हमने.*(?:कोड|ई-?मेल)/i,
    RESEND_VERIFICATION_CODE_PATTERN: createDetectorBackedPattern('isResendEmailText', /^(?:重新发送(?:验证码|电子邮件|邮件)?|再次发送(?:验证码|电子邮件|邮件)?|重发(?:验证码)?|未收到(?:验证码|邮件)|(?:メール|コード|確認コード|認証コード)を再送信(?:する|します)?|resend(?:\s+(?:code|email|verification\s+(?:code|email)))?|send\s+(?:a\s+)?new\s+code|send\s+(?:it\s+)?again|request\s+(?:a\s+)?new\s+code|didn'?t\s+receive(?:\s+(?:the\s+)?(?:code|email))?\??|(?:कोड|ई-?मेल|मेल)\s+(?:फिर\s+से|दोबारा|पुनः)\s+भेजें|(?:फिर\s+से|दोबारा|पुनः)\s+(?:कोड|ई-?मेल|मेल)\s+भेजें|प्राप्त\s+नहीं\s+हुआ)$/i),
    CONTACT_VERIFICATION_SERVER_ERROR_PATTERN: /this\s+page\s+isn['’]?t\s+working|currently\s+unable\s+to\s+handle\s+this\s+request|http\s+error\s+500|500\s+internal\s+server\s+error/i,
    INVALID_VERIFICATION_CODE_PATTERN: /代码不正确|验证码不正确|验证码错误|(?:不正確な|無効な)(?:確認|認証)?コード|(?:確認|認証)?コードが(?:不正確|無効)(?:です)?|コードが正しくありません|確認コードが正しくありません|認証コードが正しくありません|コードが間違っています|code\s+(?:is\s+)?incorrect|invalid\s+code|incorrect\s+code|try\s+again|गलत\s+कोड|अमान्य\s+कोड|कोड\s+गलत/i,
    EMAIL_ALREADY_VERIFIED_PATTERN: /email\s+verified|already\s+been\s+verified|邮箱已验证|电子邮件已验证|已经验证|メール(?:アドレス)?は確認済み|確認済み/i,
    VERIFICATION_PAGE_PATTERN: /检查您的收件箱|输入我们刚刚向|重新发送电子邮件|重新发送验证码|代码不正确|受信トレイ|メールを確認|コードを入力|確認コード|認証コード|メールを再送信|コードを再送信|email\s+verification|check\s+your\s+inbox|enter\s+the\s+code|we\s+just\s+sent|we\s+emailed|resend|इनबॉक्स\s+देखें|कोड\s+दर्ज\s+करें|(?:सत्यापन|वेरिफिकेशन)\s+कोड|(?:ई-?मेल|कोड)\s+(?:फिर\s+से|दोबारा|पुनः)\s+भेजें/i,
    OAUTH_CONSENT_PAGE_PATTERN: /使用\s*ChatGPT\s*登录到\s*Codex|sign\s+in\s+to\s+codex(?:\s+with\s+chatgpt)?|login\s+to\s+codex|log\s+in\s+to\s+codex|authorize|授权/i,
    OAUTH_CONSENT_FORM_SELECTOR: 'form[action*="/sign-in-with-chatgpt/" i][action*="/consent" i]',
    CONTINUE_ACTION_PATTERN: createDetectorBackedPattern('isContinueText', /^(?:继续|下一步|送信|続行|続ける|次へ|continue|next|submit|send|जारी\s+रखें|आगे|सबमिट|भेजें)$/i),
    ADD_EMAIL_PAGE_PATTERN: /add[\s-]*email|添加(?:电子邮件|邮箱)|要求提供(?:电子邮件|邮箱)地址|提供(?:电子邮件|邮箱)地址|provide\s+(?:an?\s+)?email\s+address|email\s+address\s+required/i,
  });

  function createSignupPageDetector(context = {}) {
    const {
      documentRef = document,
      locationRef = location,
      getSignupDomUtils = () => root.MultiPageSignupDomUtils || {},
      getSignupVerificationPageHelpers = () => ({}),
    } = context;
    const authPageDetectors = context.authPageDetectors || root.MultiPageAuthPageDetectors || {};

    function getPageTextSnapshot() {
      const text = documentRef.body?.innerText || documentRef.body?.textContent || '';
      return typeof authPageDetectors.normalizePageText === 'function'
        ? authPageDetectors.normalizePageText(text)
        : String(text || '').replace(/\s+/g, ' ').trim();
    }

    function isVisibleElement(el) {
      const helper = getSignupDomUtils().isVisibleElement;
      return typeof helper === 'function' ? helper(el) : false;
    }

    function getVisibleSplitVerificationInputs() {
      return getSignupVerificationPageHelpers().getVisibleSplitVerificationInputs?.() || [];
    }

    function getAssociatedInputText(input) {
      const helper = getSignupDomUtils().getAssociatedInputText;
      return typeof helper === 'function' ? helper(input) : '';
    }

    function getFallbackVerificationCodeInput() {
      return getSignupVerificationPageHelpers().getFallbackVerificationCodeInput?.() || null;
    }

    function getVerificationCodeTarget() {
      return getSignupVerificationPageHelpers().getVerificationCodeTarget?.() || null;
    }

    function getLoginVerificationDisplayedEmail() {
      const pageText = getPageTextSnapshot();
      const matches = pageText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig) || [];
      return matches[0] ? String(matches[0]).trim().toLowerCase() : '';
    }

    function getLoginVerificationKind() {
      const path = `${locationRef.pathname || ''} ${locationRef.href || ''}`;
      if (/\/(?:mfa|totp|2fa|two-factor)(?:[/?#]|$)/i.test(path)) {
        return 'totp';
      }
      if (isEmailVerificationPage()) {
        return 'email';
      }

      const pageText = getPageTextSnapshot();
      if (constants.LOGIN_TOTP_VERIFICATION_PATTERN.test(pageText)) {
        return 'totp';
      }
      if (constants.LOGIN_EMAIL_VERIFICATION_PATTERN.test(pageText) || getLoginVerificationDisplayedEmail()) {
        return 'email';
      }

      return 'unknown';
    }

    function getActionText(el) {
      const helper = getSignupDomUtils().getActionText;
      return typeof helper === 'function' ? helper(el) : '';
    }

    function isActionEnabled(el) {
      const helper = getSignupDomUtils().isActionEnabled;
      return typeof helper === 'function' ? helper(el) : false;
    }

    function findOneTimeCodeLoginTrigger() {
      const candidates = documentRef.querySelectorAll(
        'button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"]'
      );

      for (const el of candidates) {
        if (!isVisibleElement(el)) continue;
        if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;

        const text = [
          el.textContent,
          el.value,
          el.getAttribute('aria-label'),
          el.getAttribute('title'),
        ]
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (text && constants.ONE_TIME_CODE_LOGIN_PATTERN.test(text)) {
          return el;
        }
      }

      return null;
    }

    function isSignupCreatePasswordHref(value = '') {
      const rawHref = String(value || '').trim();
      if (!rawHref) return false;
      try {
        const parsed = new URL(rawHref, locationRef.href || 'https://auth.openai.com/');
        return /\/(?:u\/)?(?:create-account|signup)\/password(?:[/?#]|$)/i.test(parsed.pathname || '');
      } catch {
        return /\/(?:u\/)?(?:create-account|signup)\/password(?:[/?#]|$)/i.test(rawHref);
      }
    }

    function isLoginPasswordHref(value = '') {
      const rawHref = String(value || '').trim();
      if (!rawHref) return false;
      try {
        const parsed = new URL(rawHref, locationRef.href || 'https://auth.openai.com/');
        return /\/(?:u\/)?log-in\/password(?:[/?#]|$)/i.test(parsed.pathname || '');
      } catch {
        return /\/(?:u\/)?log-in\/password(?:[/?#]|$)/i.test(rawHref);
      }
    }

    function normalizeSignupPasswordSwitchText(value = '') {
      return String(value || '')
        .normalize('NFKC')
        .replace(/[\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function getSignupPasswordSwitchTextCandidates(el) {
      const values = [
        getActionText(el),
        el?.textContent,
        el?.innerText,
        el?.value,
        el?.getAttribute?.('aria-label'),
        el?.getAttribute?.('title'),
        el?.getAttribute?.('data-dd-action-name'),
        el?.getAttribute?.('data-testid'),
      ];
      return Array.from(new Set(values
        .map(normalizeSignupPasswordSwitchText)
        .filter(Boolean)));
    }

    function isSignupPasswordSwitchText(value = '') {
      const normalized = normalizeSignupPasswordSwitchText(value);
      if (!normalized) return false;
      return constants.SIGNUP_PASSWORD_SWITCH_PATTERN.test(normalized)
        || constants.SIGNUP_PASSWORD_SWITCH_PATTERN.test(normalized.replace(/[-_]+/g, ' '))
        || (
          normalized.length <= 220
          && constants.SIGNUP_PASSWORD_SWITCH_PHRASE_PATTERN.test(normalized)
        );
    }

    function getSignupPasswordSwitchSearchRoots() {
      const roots = [];
      const queued = [documentRef];
      const seen = new Set();

      while (queued.length && roots.length < 20) {
        const rootNode = queued.shift();
        if (!rootNode || seen.has(rootNode)) continue;
        seen.add(rootNode);
        roots.push(rootNode);

        let descendants = [];
        try {
          descendants = Array.from(rootNode.querySelectorAll?.('*') || []).slice(0, 1500);
        } catch {}

        for (const element of descendants) {
          if (element?.shadowRoot && !seen.has(element.shadowRoot)) {
            queued.push(element.shadowRoot);
          }
          if (/^(?:iframe|frame)$/i.test(String(element?.tagName || ''))) {
            try {
              if (element.contentDocument && !seen.has(element.contentDocument)) {
                queued.push(element.contentDocument);
              }
            } catch {}
          }
        }
      }

      return roots;
    }

    function querySignupPasswordSwitchElements(selector) {
      const matches = [];
      const seen = new Set();
      for (const rootNode of getSignupPasswordSwitchSearchRoots()) {
        let candidates = [];
        try {
          candidates = Array.from(rootNode.querySelectorAll?.(selector) || []);
        } catch {}
        for (const candidate of candidates) {
          if (!candidate || seen.has(candidate)) continue;
          seen.add(candidate);
          matches.push(candidate);
        }
      }
      return matches;
    }

    function safelyCheckSignupPasswordSwitchVisibility(el) {
      try {
        return Boolean(isVisibleElement(el));
      } catch {
        return false;
      }
    }

    function isSignupPasswordSwitchVisiblyRepresented(el) {
      if (!el) return false;
      let visibilityNode = el;
      for (let depth = 0; visibilityNode && depth < 8; depth += 1, visibilityNode = visibilityNode.parentElement) {
        const hiddenAttributePresent = typeof visibilityNode.hasAttribute === 'function'
          ? visibilityNode.hasAttribute('hidden')
          : /^(?:true|hidden)$/i.test(String(visibilityNode.getAttribute?.('hidden') || ''));
        if (
          visibilityNode.hidden === true
          || hiddenAttributePresent
          || visibilityNode.getAttribute?.('aria-hidden') === 'true'
        ) {
          return false;
        }
      }
      if (safelyCheckSignupPasswordSwitchVisibility(el)) return true;

      let descendants = [];
      try {
        descendants = Array.from(el.querySelectorAll?.('*') || []).slice(0, 200);
      } catch {}
      if (descendants.some(safelyCheckSignupPasswordSwitchVisibility)) return true;

      let ancestor = el.parentElement || null;
      for (let depth = 0; ancestor && depth < 5; depth += 1, ancestor = ancestor.parentElement) {
        if (!safelyCheckSignupPasswordSwitchVisibility(ancestor)) continue;
        const ancestorTexts = getSignupPasswordSwitchTextCandidates(ancestor);
        if (ancestorTexts.some(isSignupPasswordSwitchText)) return true;
      }

      return false;
    }

    function resolveSignupPasswordSwitchAction(el) {
      if (!el) return null;
      const explicitClickableSelector = [
        'a',
        'button',
        '[role="button"]',
        '[role="link"]',
        'input[type="button"]',
        'input[type="submit"]',
        '[onclick]',
        '[tabindex]:not([tabindex="-1"])',
      ].join(', ');
      if (el.matches?.(explicitClickableSelector)) return el;

      const clickableAncestor = el.closest?.(explicitClickableSelector);
      if (clickableAncestor) return clickableAncestor;

      let clickableDescendants = [];
      try {
        clickableDescendants = Array.from(el.querySelectorAll?.(explicitClickableSelector) || []);
      } catch {}
      const matchingDescendant = clickableDescendants.find((candidate) => (
        getSignupPasswordSwitchTextCandidates(candidate).some(isSignupPasswordSwitchText)
      ));
      if (matchingDescendant) return matchingDescendant;
      if (clickableDescendants.length === 1) return clickableDescendants[0];

      let ancestor = el.parentElement || null;
      for (let depth = 0; ancestor && depth < 6; depth += 1, ancestor = ancestor.parentElement) {
        const ancestorTexts = getSignupPasswordSwitchTextCandidates(ancestor);
        if (!ancestorTexts.some(isSignupPasswordSwitchText)) continue;
        let nestedActions = [];
        try {
          nestedActions = Array.from(ancestor.querySelectorAll?.(explicitClickableSelector) || []);
        } catch {}
        const matchingAction = nestedActions.find((candidate) => (
          getSignupPasswordSwitchTextCandidates(candidate).some(isSignupPasswordSwitchText)
        ));
        if (matchingAction) return matchingAction;
        if (nestedActions.length === 1) return nestedActions[0];
        if (isSignupPasswordSwitchVisiblyRepresented(ancestor)) return ancestor;
      }

      return el;
    }

    function isAllowedSignupPasswordSwitchAction(el, { allowDisabled = false } = {}) {
      if (!el || !isSignupPasswordSwitchVisiblyRepresented(el) || (!allowDisabled && !isActionEnabled(el))) {
        return false;
      }
      const href = String(el.getAttribute?.('href') || el.href || '').trim();
      return !isLoginPasswordHref(href);
    }

    function hasSignupPasswordSwitchTextHint() {
      for (const rootNode of getSignupPasswordSwitchSearchRoots()) {
        const rootText = normalizeSignupPasswordSwitchText(
          rootNode?.body?.innerText
          || rootNode?.body?.textContent
          || rootNode?.host?.innerText
          || rootNode?.textContent
          || ''
        );
        if (!rootText) continue;
        const lines = rootText.split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean);
        if (lines.some(isSignupPasswordSwitchText)) return true;
        if (constants.SIGNUP_PASSWORD_SWITCH_PHRASE_PATTERN.test(rootText)) return true;
      }
      return false;
    }

    function findSignupPasswordSwitchTrigger({ allowDisabled = false } = {}) {
      const primaryCandidates = querySignupPasswordSwitchElements([
        'a',
        'button',
        '[role="button"]',
        '[role="link"]',
        'input[type="button"]',
        'input[type="submit"]',
        '[data-dd-action-name]',
        '[data-testid]',
        '[tabindex]',
        '[onclick]',
      ].join(', '));

      const hrefMatch = primaryCandidates.find((el) => {
        if (!isAllowedSignupPasswordSwitchAction(el, { allowDisabled })) return false;
        return isSignupCreatePasswordHref(el.getAttribute?.('href') || el.href || '');
      });
      if (hrefMatch) return hrefMatch;

      const primaryTextMatch = primaryCandidates.find((el) => {
        if (!isAllowedSignupPasswordSwitchAction(el, { allowDisabled })) return false;
        return getSignupPasswordSwitchTextCandidates(el).some(isSignupPasswordSwitchText);
      });
      if (primaryTextMatch) return primaryTextMatch;

      const textNodes = querySignupPasswordSwitchElements('*')
        .map((element) => {
          const matchedLengths = getSignupPasswordSwitchTextCandidates(element)
            .filter(isSignupPasswordSwitchText)
            .map((value) => value.length);
          return {
            element,
            matchedLength: matchedLengths.length ? Math.min(...matchedLengths) : Number.POSITIVE_INFINITY,
          };
        })
        .filter((item) => Number.isFinite(item.matchedLength))
        .sort((left, right) => left.matchedLength - right.matchedLength);
      for (const { element: textNode } of textNodes) {
        const action = resolveSignupPasswordSwitchAction(textNode);
        if (isAllowedSignupPasswordSwitchAction(action, { allowDisabled })) return action;
      }

      return null;
    }

    function findLoginPasswordSwitchTrigger({ allowDisabled = false } = {}) {
      const textNodes = querySignupPasswordSwitchElements('*')
        .map((element) => {
          const matchedLengths = getSignupPasswordSwitchTextCandidates(element)
            .filter(isSignupPasswordSwitchText)
            .map((value) => value.length);
          return {
            element,
            matchedLength: matchedLengths.length ? Math.min(...matchedLengths) : Number.POSITIVE_INFINITY,
          };
        })
        .filter((item) => Number.isFinite(item.matchedLength))
        .sort((left, right) => left.matchedLength - right.matchedLength);

      for (const { element } of textNodes) {
        const action = resolveSignupPasswordSwitchAction(element);
        if (
          !action
          || !isSignupPasswordSwitchVisiblyRepresented(action)
          || (!allowDisabled && !isActionEnabled(action))
        ) {
          continue;
        }
        const href = String(action.getAttribute?.('href') || action.href || '').trim();
        if (isLoginPasswordHref(href)) return action;
      }

      return null;
    }

    function buildSignupPasswordSwitchDiagnostic() {
      const roots = getSignupPasswordSwitchSearchRoots();
      const allElements = querySignupPasswordSwitchElements('*');
      const candidates = [];

      for (const element of allElements) {
        const matchedValues = getSignupPasswordSwitchTextCandidates(element).filter(isSignupPasswordSwitchText);
        if (!matchedValues.length) continue;
        const action = resolveSignupPasswordSwitchAction(element);
        const href = String(action?.getAttribute?.('href') || action?.href || '').trim();
        candidates.push({
          tag: String(element?.tagName || '').toLowerCase(),
          role: String(element?.getAttribute?.('role') || ''),
          visible: safelyCheckSignupPasswordSwitchVisibility(element),
          represented: isSignupPasswordSwitchVisiblyRepresented(element),
          enabled: Boolean(isActionEnabled(element)),
          matchedLength: Math.min(...matchedValues.map((value) => value.length)),
          actionTag: String(action?.tagName || '').toLowerCase(),
          actionRole: String(action?.getAttribute?.('role') || ''),
          actionVisible: safelyCheckSignupPasswordSwitchVisibility(action),
          actionRepresented: isSignupPasswordSwitchVisiblyRepresented(action),
          actionEnabled: Boolean(action && isActionEnabled(action)),
          hrefKind: isSignupCreatePasswordHref(href)
            ? 'signup-password'
            : (isLoginPasswordHref(href) ? 'login-password' : 'none'),
        });
        if (candidates.length >= 12) break;
      }

      return {
        rootCount: roots.length,
        elementCount: allElements.length,
        candidateCount: candidates.length,
        candidates,
      };
    }

    function findResendVerificationCodeTrigger({ allowDisabled = false } = {}) {
      return getSignupVerificationPageHelpers().findResendVerificationCodeTrigger?.({ allowDisabled }) || null;
    }

    function isEmailVerificationPage() {
      return Boolean(getSignupVerificationPageHelpers().isEmailVerificationPage?.());
    }

    function getVerificationErrorText() {
      return getSignupVerificationPageHelpers().getVerificationErrorText?.() || '';
    }

    function getContactVerificationServerErrorText() {
      const path = String(locationRef?.pathname || '');
      if (!/\/contact-verification(?:[/?#]|$)/i.test(path)) {
        return '';
      }
      const text = String(getPageTextSnapshot?.() || documentRef?.body?.textContent || '').replace(/\s+/g, ' ').trim();
      const title = String(documentRef?.title || '').replace(/\s+/g, ' ').trim();
      const combined = `${title} ${text}`.trim();
      if (!constants.CONTACT_VERIFICATION_SERVER_ERROR_PATTERN.test(combined)) {
        return '';
      }
      return combined || 'OpenAI contact-verification page returned HTTP ERROR 500 after resend.';
    }

    function throwIfContactVerificationServerError() {
      const serverErrorText = getContactVerificationServerErrorText();
      if (serverErrorText) {
        throw new Error(`CONTACT_VERIFICATION_SERVER_ERROR::${serverErrorText}`);
      }
    }

    function findContinueButton({ allowDisabled = false } = {}) {
      const candidates = documentRef.querySelectorAll(
        'button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"]'
      );
      return Array.from(candidates).find((el) => {
        if (!isVisibleElement(el) || (!allowDisabled && !isActionEnabled(el))) return false;
        const text = getActionText(el);
        return typeof authPageDetectors.isContinueText === 'function'
          ? authPageDetectors.isContinueText(text)
          : constants.CONTINUE_ACTION_PATTERN.test(text);
      }) || null;
    }

    function detectPageState() {
      const verificationTarget = getVerificationCodeTarget();
      if (verificationTarget) {
        return {
          state: 'verification_page',
          url: locationRef.href,
          verificationTarget,
          verificationKind: getLoginVerificationKind(),
        };
      }
      if (isEmailVerificationPage()) {
        return {
          state: 'email_verification_page',
          url: locationRef.href,
          verificationKind: getLoginVerificationKind(),
        };
      }
      if (findOneTimeCodeLoginTrigger()) {
        return {
          state: 'one_time_code_login_available',
          url: locationRef.href,
        };
      }
      return {
        state: 'unknown',
        url: locationRef.href,
      };
    }

    function buildDiagnosticSnapshot() {
      return {
        url: locationRef.href,
        title: documentRef.title || '',
        readyState: documentRef.readyState || '',
        verificationTargetFound: Boolean(getVerificationCodeTarget()),
        resendButtonFound: Boolean(findResendVerificationCodeTrigger({ allowDisabled: true })),
        loginVerificationKind: getLoginVerificationKind(),
        bodyTextPreview: getPageTextSnapshot().slice(0, 300),
      };
    }

    return {
      constants,
      detectPageState,
      findSignupEntryAction: () => null,
      findContinueButton,
      findResendButton: findResendVerificationCodeTrigger,
      buildDiagnosticSnapshot,
      getPageTextSnapshot,
      isVisibleElement,
      getVisibleSplitVerificationInputs,
      getAssociatedInputText,
      getFallbackVerificationCodeInput,
      getVerificationCodeTarget,
      getLoginVerificationDisplayedEmail,
      getLoginVerificationKind,
      getActionText,
      isActionEnabled,
      findOneTimeCodeLoginTrigger,
      findSignupPasswordSwitchTrigger,
      findLoginPasswordSwitchTrigger,
      hasSignupPasswordSwitchTextHint,
      buildSignupPasswordSwitchDiagnostic,
      findResendVerificationCodeTrigger,
      isEmailVerificationPage,
      getVerificationErrorText,
      getContactVerificationServerErrorText,
      throwIfContactVerificationServerError,
    };
  }

  root.MultiPageSignupPageDetector = {
    constants,
    createSignupPageDetector,
  };
  root.SignupPageDetector = root.MultiPageSignupPageDetector;
})(typeof self !== 'undefined' ? self : globalThis);
