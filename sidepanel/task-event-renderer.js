(function attachTaskEventRenderer(root, factory) {
  const api = factory(root);
  root.SidepanelTaskEventRenderer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function createTaskEventRendererModule(root) {
  function appendText(parent, className, text) {
    const node = parent.ownerDocument.createElement('span');
    node.className = className;
    node.textContent = String(text || '');
    parent.appendChild(node);
    return node;
  }

  function renderTasks(container, tasks = []) {
    if (!container) return;
    container.replaceChildren();
    const viewModel = root.SidepanelTaskEventViewModel;
    if (!tasks.length) {
      appendText(container, 'account-task-empty', '暂无持久化任务');
      return;
    }
    tasks.forEach((task) => {
      const view = viewModel.toTaskView(task);
      const row = container.ownerDocument.createElement('article');
      row.className = `account-task-row is-${view.status}`;
      row.dataset.taskId = view.taskId;
      const primary = container.ownerDocument.createElement('div');
      primary.className = 'account-task-primary';
      appendText(primary, 'account-task-kind', view.typeLabel);
      appendText(primary, 'account-task-account', view.accountLabel);
      if (view.channelLabel) appendText(primary, 'account-task-channel', view.channelLabel);
      appendText(primary, `account-task-status is-${view.status}`, view.statusLabel);
      row.appendChild(primary);
      const detail = container.ownerDocument.createElement('div');
      detail.className = 'account-task-detail';
      appendText(detail, 'account-task-node mono', view.nodeLabel);
      appendText(detail, 'account-task-progress mono', view.progressLabel);
      appendText(detail, 'account-task-updated', view.updatedLabel);
      row.appendChild(detail);
      if (view.errorLabel) appendText(row, 'account-task-error', view.errorLabel);
      const actions = container.ownerDocument.createElement('div');
      actions.className = 'account-task-actions';
      const eventsButton = container.ownerDocument.createElement('button');
      eventsButton.type = 'button';
      eventsButton.className = 'btn btn-ghost btn-xs';
      eventsButton.dataset.taskAction = 'events';
      eventsButton.textContent = '事件';
      actions.appendChild(eventsButton);
      if (view.canCancel) {
        const cancelButton = container.ownerDocument.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'btn btn-ghost btn-xs';
        cancelButton.dataset.taskAction = 'cancel';
        cancelButton.textContent = '取消';
        actions.appendChild(cancelButton);
      }
      if (view.canDelete) {
        const deleteButton = container.ownerDocument.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'btn btn-danger btn-xs';
        deleteButton.dataset.taskAction = 'delete';
        deleteButton.textContent = '删除';
        actions.appendChild(deleteButton);
      }
      row.appendChild(actions);
      container.appendChild(row);
    });
  }

  function renderEvents(container, task, events = []) {
    if (!container) return;
    const previousScrollTop = Math.max(0, Number(container.scrollTop) || 0);
    const previousScrollHeight = Math.max(0, Number(container.scrollHeight) || 0);
    const clientHeight = Math.max(0, Number(container.clientHeight) || 0);
    const followLatest = previousScrollHeight <= clientHeight
      || previousScrollHeight - previousScrollTop - clientHeight <= 32;
    container.replaceChildren();
    container.hidden = false;
    const title = container.ownerDocument.createElement('div');
    title.className = 'account-task-events-title';
    appendText(title, '', `事件 · ${task?.taskId || ''}`);
    const closeButton = container.ownerDocument.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'modal-close';
    closeButton.dataset.taskAction = 'close-events';
    closeButton.setAttribute('aria-label', '关闭事件');
    closeButton.textContent = '×';
    title.appendChild(closeButton);
    container.appendChild(title);
    const viewModel = root.SidepanelTaskEventViewModel;
    events.forEach((event) => {
      const view = viewModel.toEventView(event);
      const row = container.ownerDocument.createElement('div');
      row.className = `account-task-event is-${view.level}`;
      appendText(row, 'account-task-event-time mono', view.createdLabel);
      appendText(row, 'account-task-event-code mono', view.code);
      appendText(row, 'account-task-event-message', view.message);
      container.appendChild(row);
    });
    if (!events.length) appendText(container, 'account-task-empty', '此任务暂无事件');
    container.scrollTop = followLatest
      ? container.scrollHeight
      : Math.min(previousScrollTop, Math.max(0, container.scrollHeight - clientHeight));
  }

  return { renderEvents, renderTasks };
});
