(function attachTaskPanelController(root, factory) {
  const api = factory(root);
  root.SidepanelTaskPanelController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function createTaskPanelControllerModule(root) {
  function createTaskPanelController({
    dom = {},
    sendMessage,
    showToast = () => {},
    confirmAction = (message) => root.confirm?.(message) !== false,
    now = () => new Date(),
    setTimer = (callback, delay) => root.setTimeout?.(callback, delay),
    clearTimer = (timerId) => root.clearTimeout?.(timerId),
    pollIntervalMs = 1200,
  } = {}) {
    let tasks = [];
    let loading = false;
    let pollTimer = null;
    let activeEventTaskId = '';
    const renderer = root.SidepanelTaskEventRenderer;

    function clearPoll() {
      if (pollTimer !== null) clearTimer?.(pollTimer);
      pollTimer = null;
    }

    function isPanelOpen() {
      return dom.accountRecordsOverlay?.hidden === false;
    }

    function schedulePoll() {
      clearPoll();
      if (!isPanelOpen() || typeof setTimer !== 'function' || pollIntervalMs <= 0) return;
      pollTimer = setTimer(async () => {
        pollTimer = null;
        if (!isPanelOpen()) return;
        await refresh().catch((error) => showToast(error.message, 'error'));
      }, pollIntervalMs);
    }

    function terminalTaskCount() {
      return tasks.filter((task) => ['canceled', 'succeeded', 'failed', 'interrupted', 'manual_review'].includes(task.status)).length;
    }

    function updateControls() {
      if (dom.btnClearAccountTasks) dom.btnClearAccountTasks.disabled = terminalTaskCount() === 0;
    }

    function setRefreshState(active) {
      if (!dom.btnRefreshAccountTasks) return;
      dom.btnRefreshAccountTasks.disabled = active;
      dom.btnRefreshAccountTasks.classList?.toggle?.('is-loading', active);
      dom.btnRefreshAccountTasks.setAttribute?.('aria-busy', active ? 'true' : 'false');
    }

    async function refresh() {
      if (loading || typeof sendMessage !== 'function') return tasks;
      loading = true;
      setRefreshState(true);
      if (dom.accountTaskMeta) dom.accountTaskMeta.textContent = '刷新中...';
      try {
        const response = await sendMessage({ type: 'GET_ACCOUNT_TASKS', source: 'sidepanel', payload: {} });
        if (response?.error) throw new Error(response.error);
        tasks = Array.isArray(response?.tasks) ? response.tasks : [];
        renderer.renderTasks(dom.accountTaskList, tasks);
        const refreshedAt = now().toLocaleTimeString('zh-CN', { hour12: false });
        if (dom.accountTaskMeta) {
          dom.accountTaskMeta.textContent = tasks.length
            ? `最近 ${tasks.length} 个 · 已刷新 ${refreshedAt}`
            : `暂无任务 · 已刷新 ${refreshedAt}`;
        }
        updateControls();
        if (activeEventTaskId && dom.accountTaskEvents?.hidden === false) {
          await refreshEvents(activeEventTaskId);
        }
        return tasks;
      } finally {
        loading = false;
        setRefreshState(false);
        schedulePoll();
      }
    }

    async function refreshEvents(taskId, { bringIntoView = false } = {}) {
      const response = await sendMessage({ type: 'GET_ACCOUNT_TASK_EVENTS', source: 'sidepanel', payload: { taskId } });
      if (response?.error) throw new Error(response.error);
      if (activeEventTaskId !== taskId) return;
      if (dom.accountTaskEvents) dom.accountTaskEvents.hidden = false;
      renderer.renderEvents(dom.accountTaskEvents, tasks.find((task) => task.taskId === taskId) || { taskId }, response.events || []);
      if (bringIntoView) {
        dom.accountTaskEvents?.focus?.({ preventScroll: true });
        dom.accountTaskEvents?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
      }
    }

    async function showEvents(taskId) {
      activeEventTaskId = taskId;
      await refreshEvents(taskId, { bringIntoView: true });
    }

    async function cancel(taskId) {
      const response = await sendMessage({ type: 'CANCEL_ACCOUNT_TASK', source: 'sidepanel', payload: { taskId } });
      if (response?.error) throw new Error(response.error);
      showToast('已请求取消任务。', 'info', 1800);
      await refresh();
    }

    async function deleteTask(taskId) {
      if (!confirmAction('确定删除这条已结束任务及其事件记录吗？')) return;
      const response = await sendMessage({ type: 'DELETE_ACCOUNT_TASK', source: 'sidepanel', payload: { taskId } });
      if (response?.error) throw new Error(response.error);
      if (activeEventTaskId === taskId) activeEventTaskId = '';
      if (dom.accountTaskEvents) dom.accountTaskEvents.hidden = true;
      showToast('任务记录已删除。', 'success', 1800);
      await refresh();
    }

    async function clearCompleted() {
      const count = terminalTaskCount();
      if (!count) {
        showToast('没有可删除的已结束任务。', 'info', 1800);
        return;
      }
      if (!confirmAction(`确定删除全部 ${count} 条已结束任务及其事件记录吗？`)) return;
      const response = await sendMessage({ type: 'DELETE_COMPLETED_ACCOUNT_TASKS', source: 'sidepanel', payload: {} });
      if (response?.error) throw new Error(response.error);
      activeEventTaskId = '';
      if (dom.accountTaskEvents) dom.accountTaskEvents.hidden = true;
      showToast(`已删除 ${Number(response?.deletedCount) || 0} 条任务记录。`, 'success', 1800);
      await refresh();
    }

    function bind() {
      dom.btnRefreshAccountTasks?.addEventListener('click', () => refresh().catch((error) => showToast(error.message, 'error')));
      dom.btnClearAccountTasks?.addEventListener('click', () => clearCompleted().catch((error) => showToast(error.message, 'error')));
      dom.btnOpenAccountRecords?.addEventListener('click', () => {
        setTimeout(() => refresh().catch((error) => showToast(error.message, 'error')), 0);
      });
      dom.accountTaskList?.addEventListener('click', (event) => {
        const button = event.target.closest?.('[data-task-action]');
        const taskId = button?.closest?.('[data-task-id]')?.dataset?.taskId || '';
        if (!button || !taskId) return;
        const action = button.dataset.taskAction;
        const operation = action === 'events'
          ? showEvents(taskId)
          : action === 'cancel'
            ? cancel(taskId)
            : action === 'delete'
              ? deleteTask(taskId)
              : null;
        operation?.catch((error) => showToast(error.message, 'error'));
      });
      dom.accountTaskEvents?.addEventListener('click', (event) => {
        if (event.target.closest?.('[data-task-action="close-events"]')) {
          activeEventTaskId = '';
          dom.accountTaskEvents.hidden = true;
        }
      });
    }

    bind();
    updateControls();
    return { cancel, clearCompleted, deleteTask, refresh, showEvents };
  }

  function attachTaskPanelController({ chromeApi = root.chrome, showToast } = {}) {
    return createTaskPanelController({
      dom: root.SidepanelDomBindings.getBindings(),
      sendMessage: (message) => chromeApi.runtime.sendMessage(message),
      showToast,
    });
  }

  return { attachTaskPanelController, createTaskPanelController };
});
