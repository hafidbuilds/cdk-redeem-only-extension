(function attachSidepanelUiHelpers(globalScope) {
  function createSidepanelUiHelpers(context = {}) {
    const {
      documentRef = globalScope.document,
      navigatorRef = globalScope.navigator,
      icons = {},
    } = context;
    const eyeOpenIcon = icons.eyeOpen || '';
    const eyeClosedIcon = icons.eyeClosed || '';

    function syncToggleButtonLabel(button, input, labels) {
      if (!button || !input) return;

      const isHidden = input.type === 'password';
      button.innerHTML = isHidden ? eyeOpenIcon : eyeClosedIcon;
      button.setAttribute('aria-label', isHidden ? labels.show : labels.hide);
      button.title = isHidden ? labels.show : labels.hide;
    }

    function getPasswordToggleLabels(button) {
      if (!button) {
        return {
          show: '\u663e\u793a\u5185\u5bb9',
          hide: '\u9690\u85cf\u5185\u5bb9',
        };
      }
      const show = button.dataset?.showLabel
        || button.getAttribute('aria-label')
        || button.title
        || '\u663e\u793a\u5185\u5bb9';
      const hide = button.dataset?.hideLabel
        || String(show).replace(/^\u663e\u793a/, '\u9690\u85cf')
        || '\u9690\u85cf\u5185\u5bb9';
      return { show, hide };
    }

    function syncPasswordVisibilityToggle(button) {
      const targetId = String(button?.dataset?.passwordToggle || '').trim();
      const input = targetId ? documentRef.getElementById(targetId) : null;
      if (!button || !input) return;
      syncToggleButtonLabel(button, input, getPasswordToggleLabels(button));
    }

    function syncPasswordVisibilityToggles(root = documentRef) {
      root.querySelectorAll?.('[data-password-toggle]').forEach(syncPasswordVisibilityToggle);
    }

    function bindPasswordVisibilityToggles(root = documentRef) {
      root.querySelectorAll?.('[data-password-toggle]').forEach((button) => {
        if (button.dataset?.passwordToggleBound === 'true') {
          syncPasswordVisibilityToggle(button);
          return;
        }
        if (button.dataset) {
          button.dataset.passwordToggleBound = 'true';
        }
        syncPasswordVisibilityToggle(button);
        button.addEventListener('click', () => {
          const targetId = String(button.dataset?.passwordToggle || '').trim();
          const input = targetId ? documentRef.getElementById(targetId) : null;
          if (!input) return;
          input.type = input.type === 'password' ? 'text' : 'password';
          syncPasswordVisibilityToggle(button);
        });
      });
    }

    async function copyTextToClipboard(text) {
      const value = String(text || '').trim();
      if (!value) {
        throw new Error('没有可复制的内容。');
      }
      if (!navigatorRef.clipboard?.writeText) {
        throw new Error('当前环境不支持剪贴板复制。');
      }
      await navigatorRef.clipboard.writeText(value);
    }

    return {
      syncPasswordVisibilityToggle,
      syncPasswordVisibilityToggles,
      bindPasswordVisibilityToggles,
      copyTextToClipboard,
    };
  }

  globalScope.SidepanelUiHelpers = {
    createSidepanelUiHelpers,
  };
})(window);
