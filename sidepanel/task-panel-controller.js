(function attachTaskPanelController(root, factory) {
  const api = factory(root);
  root.SidepanelTaskPanelController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function createTaskPanelControllerModule(root) {
  function createTaskPanelController({ dom = {}, sendMessage, showToast = () => {} } = {}) {
    let tasks = [];
    let loading = false;
    const renderer = root.SidepanelTaskEventRenderer;

    async function refresh() {
      if (loading || typeof sendMessage !== 'function') return tasks;
      loading = true;
      try {
        const response = await sendMessage({ type: 'GET_ACCOUNT_TASKS', source: 'sidepanel', payload: {} });
        if (response?.error) throw new Error(response.error);
        tasks = Array.isArray(response?.tasks) ? response.tasks : [];
        renderer.renderTasks(dom.accountTaskList, tasks);
        if (dom.accountTaskMeta) dom.accountTaskMeta.textContent = tasks.length ? `最近 ${tasks.length} 个` : '暂无任务';
        return tasks;
      } finally {
        loading = false;
      }
    }

    async function showEvents(taskId) {
      const response = await sendMessage({ type: 'GET_ACCOUNT_TASK_EVENTS', source: 'sidepanel', payload: { taskId } });
      if (response?.error) throw new Error(response.error);
      renderer.renderEvents(dom.accountTaskEvents, tasks.find((task) => task.taskId === taskId), response.events || []);
    }

    async function cancel(taskId) {
      const response = await sendMessage({ type: 'CANCEL_ACCOUNT_TASK', source: 'sidepanel', payload: { taskId } });
      if (response?.error) throw new Error(response.error);
      showToast('已请求取消任务。', 'info', 1800);
      await refresh();
    }

    function bind() {
      dom.btnRefreshAccountTasks?.addEventListener('click', () => refresh().catch((error) => showToast(error.message, 'error')));
      dom.btnOpenAccountRecords?.addEventListener('click', () => {
        setTimeout(() => refresh().catch((error) => showToast(error.message, 'error')), 0);
      });
      dom.accountTaskList?.addEventListener('click', (event) => {
        const button = event.target.closest?.('[data-task-action]');
        const taskId = button?.closest?.('[data-task-id]')?.dataset?.taskId || '';
        if (!button || !taskId) return;
        const action = button.dataset.taskAction;
        const operation = action === 'events' ? showEvents(taskId) : action === 'cancel' ? cancel(taskId) : null;
        operation?.catch((error) => showToast(error.message, 'error'));
      });
      dom.accountTaskEvents?.addEventListener('click', (event) => {
        if (event.target.closest?.('[data-task-action="close-events"]')) dom.accountTaskEvents.hidden = true;
      });
    }

    bind();
    return { cancel, refresh, showEvents };
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
