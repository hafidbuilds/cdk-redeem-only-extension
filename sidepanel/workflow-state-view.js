// sidepanel/workflow-state-view.js - Workflow status list rendering only.
(function attachSidepanelWorkflowStateView(globalScope) {
  function create(context = {}) {
    const {
      dom = {},
      constants = {},
      helpers = {},
      state = {},
      callbacks = {},
    } = context;

    const escapeHtml = typeof helpers.escapeHtml === 'function'
      ? helpers.escapeHtml
      : (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[char] || char));
    const escapeCssValue = typeof helpers.escapeCssValue === 'function'
      ? helpers.escapeCssValue
      : (value = '') => String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    function getWorkflowNodes() {
      return typeof constants.getWorkflowNodes === 'function'
        ? constants.getWorkflowNodes()
        : (constants.workflowNodes || []);
    }

    function getNodeIds() {
      return typeof constants.getNodeIds === 'function'
        ? constants.getNodeIds()
        : (constants.nodeIds || []);
    }

    function getDisplayWorkflowNodes() {
      const nodes = [...(getWorkflowNodes() || [])];
      if (nodes.some((node) => String(node?.nodeId || '').trim() === 'existing-totp-login')) {
        return nodes;
      }

      const passwordIndex = nodes.findIndex((node) => String(node?.nodeId || '').trim() === 'fill-password');
      const verificationIndex = nodes.findIndex((node) => String(node?.nodeId || '').trim() === 'fetch-signup-code');
      if (passwordIndex < 0 || verificationIndex < 0 || passwordIndex >= verificationIndex) {
        return nodes;
      }

      const displayNode = {
        nodeId: 'existing-totp-login',
        title: '已有账号 2FA 登录',
        displayOrder: 35,
        nodeType: 'display',
        executeKey: 'existing-totp-login',
        ui: {
          displayOnly: true,
          stepLabel: '3.5',
          statusText: '按需',
        },
      };
      return [
        ...nodes.slice(0, passwordIndex + 1),
        displayNode,
        ...nodes.slice(passwordIndex + 1),
      ];
    }

    function getLatestState() {
      return state.getLatestState?.() || {};
    }

    function renderStepsList() {
      if (!dom.stepsList) {
        return;
      }

      dom.stepsList.innerHTML = getDisplayWorkflowNodes().map((node) => {
        const nodeId = String(node.nodeId || '').trim();
        const step = helpers.getStepIdByNodeIdForCurrentMode?.(nodeId);
        const stepLabel = String(node.ui?.stepLabel || step || node.displayOrder || '').trim();
        const executeKey = String(node.executeKey || nodeId).trim();
        const displayOnly = node.ui?.displayOnly === true || node.nodeType === 'display';
        const rowClass = displayOnly ? 'step-row pending display-only' : 'step-row pending';
        const statusText = displayOnly ? escapeHtml(node.ui?.statusText || '按需') : '';
        return `
          <div class="${rowClass}" data-step="${escapeHtml(step)}" data-node-id="${escapeHtml(nodeId)}" data-step-key="${escapeHtml(executeKey)}" data-display-only="${displayOnly ? 'true' : 'false'}">
            <div class="step-indicator" data-step="${escapeHtml(step)}" data-node-id="${escapeHtml(nodeId)}"><span class="step-num">${escapeHtml(stepLabel)}</span></div>
            <button class="step-btn" type="button" data-step="${escapeHtml(step)}" data-node-id="${escapeHtml(nodeId)}" data-step-key="${escapeHtml(executeKey)}" data-display-only="${displayOnly ? 'true' : 'false'}"${displayOnly ? ' disabled aria-disabled="true"' : ''}>${escapeHtml(node.title || executeKey || `步骤 ${stepLabel}`)}</button>
            <span class="step-status" data-step="${escapeHtml(step)}" data-node-id="${escapeHtml(nodeId)}">${statusText}</span>
          </div>
        `;
      }).join('');

      callbacks.initializeManualStepActions?.();
      renderStepStatuses(getLatestState());
      callbacks.updateButtonStates?.();
    }

    function renderSingleNodeStatus(nodeId, status) {
      const normalizedNodeId = String(nodeId || '').trim();
      if (!normalizedNodeId) {
        return;
      }
      const normalizedStatus = status || 'pending';
      const selectorNodeId = escapeCssValue(normalizedNodeId);
      const statusEl = document.querySelector(`.step-status[data-node-id="${selectorNodeId}"]`);
      const row = document.querySelector(`.step-row[data-node-id="${selectorNodeId}"]`);
      if (statusEl) {
        statusEl.textContent = constants.statusIcons?.[normalizedStatus] || '';
      }
      if (row) {
        row.className = `step-row ${normalizedStatus}`;
      }
    }

    function renderSingleStepStatus(step, status) {
      const nodeId = helpers.getNodeIdByStepForCurrentMode?.(step);
      if (nodeId) {
        renderSingleNodeStatus(nodeId, status);
        return;
      }
      const normalizedStatus = status || 'pending';
      const statusEl = document.querySelector(`.step-status[data-step="${escapeCssValue(step)}"]`);
      const row = document.querySelector(`.step-row[data-step="${escapeCssValue(step)}"]`);
      if (statusEl) {
        statusEl.textContent = constants.statusIcons?.[normalizedStatus] || '';
      }
      if (row) {
        row.className = `step-row ${normalizedStatus}`;
      }
    }

    function renderStepStatuses(currentState = getLatestState()) {
      const statuses = helpers.getNodeStatuses?.(currentState) || {};
      getNodeIds().forEach((nodeId) => {
        renderSingleNodeStatus(nodeId, statuses[nodeId]);
      });
      updateProgressCounter();
    }

    function updateProgressCounter() {
      if (!dom.stepsProgress) {
        return;
      }
      const statuses = helpers.getNodeStatuses?.(getLatestState()) || {};
      const completed = Object.values(statuses).filter((status) => helpers.isDoneStatus?.(status)).length;
      dom.stepsProgress.textContent = `${completed} / ${getNodeIds().length}`;
    }

    return {
      renderStepsList,
      renderSingleNodeStatus,
      renderSingleStepStatus,
      renderStepStatuses,
      updateProgressCounter,
    };
  }

  const api = {
    create,
  };
  globalScope.SidepanelWorkflowStateView = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(self);
