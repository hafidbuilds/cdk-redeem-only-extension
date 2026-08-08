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
      return [...(getWorkflowNodes() || [])];
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
        const routeSkipped = node.applicability === 'route-skipped';
        const rowClass = displayOnly
          ? 'step-row pending display-only'
          : `step-row ${routeSkipped ? 'pending' : (node.defaultStatus || 'pending')}${routeSkipped ? ' route-skipped' : ''}`;
        const statusText = displayOnly || routeSkipped ? escapeHtml(node.ui?.statusText || '') : '';
        return `
          <div class="${rowClass}" data-step="${escapeHtml(step)}" data-node-id="${escapeHtml(nodeId)}" data-step-key="${escapeHtml(executeKey)}" data-display-only="${displayOnly ? 'true' : 'false'}" data-route-skipped="${routeSkipped ? 'true' : 'false'}">
            <div class="step-indicator" data-step="${escapeHtml(step)}" data-node-id="${escapeHtml(nodeId)}"><span class="step-num">${escapeHtml(stepLabel)}</span></div>
            <button class="step-btn" type="button" data-step="${escapeHtml(step)}" data-node-id="${escapeHtml(nodeId)}" data-step-key="${escapeHtml(executeKey)}" data-display-only="${displayOnly ? 'true' : 'false'}"${displayOnly || routeSkipped ? ' disabled aria-disabled="true"' : ''}>${escapeHtml(node.title || executeKey || `步骤 ${stepLabel}`)}</button>
            <span class="step-status" data-step="${escapeHtml(step)}" data-node-id="${escapeHtml(nodeId)}"${displayOnly || routeSkipped ? ` data-pending-text="${escapeHtml(node.ui?.statusText || '')}"` : ''}>${statusText}</span>
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
      const routeSkipped = row?.dataset?.routeSkipped === 'true';
      if (statusEl) {
        statusEl.textContent = (routeSkipped || normalizedStatus === 'pending') && statusEl.dataset?.pendingText
          ? statusEl.dataset.pendingText
          : (constants.statusIcons?.[normalizedStatus] || '');
      }
      if (row) {
        const displayOnlyClass = row.dataset?.displayOnly === 'true' ? ' display-only' : '';
        const routeSkippedClass = routeSkipped ? ' route-skipped' : '';
        row.className = `step-row ${routeSkipped ? 'pending' : normalizedStatus}${displayOnlyClass}${routeSkippedClass}`;
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
      const nodeIds = getNodeIds();
      const completed = nodeIds.filter((nodeId) => helpers.isDoneStatus?.(statuses[nodeId])).length;
      dom.stepsProgress.textContent = `${completed} / ${nodeIds.length}`;
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
