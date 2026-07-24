(function attachTaskEventViewModel(root, factory) {
  const api = factory();
  root.SidepanelTaskEventViewModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function createTaskEventViewModelModule() {
  const TYPE_LABELS = Object.freeze({
    register: '注册',
    refresh_access_token: '补充 AT',
    verify_membership: '会员核验',
    redeem: 'CDK 兑换',
    provider_health_check: 'Provider 检查',
  });
  const STATUS_LABELS = Object.freeze({
    pending: '等待', running: '运行中', waiting_remote: '等待远端', retry_wait: '等待重试',
    cancel_requested: '正在取消', canceled: '已取消', succeeded: '成功', failed: '失败',
    interrupted: '已中断', manual_review: '人工处理',
  });
  const TERMINAL = new Set(['canceled', 'succeeded', 'failed', 'interrupted', 'manual_review']);

  function formatTime(value = '') {
    const timestamp = Date.parse(String(value || ''));
    if (!Number.isFinite(timestamp)) return '-';
    return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
  }

  function toTaskView(task = {}) {
    const current = Math.max(0, Number(task.progress?.current) || 0);
    const total = Math.max(0, Number(task.progress?.total) || 0);
    return {
      taskId: String(task.taskId || ''),
      typeLabel: TYPE_LABELS[task.type] || task.type || '任务',
      accountLabel: String(task.accountId || '批量任务'),
      channelLabel: String(task.channel || '').toUpperCase(),
      status: String(task.status || 'pending'),
      statusLabel: STATUS_LABELS[task.status] || task.status || '等待',
      nodeLabel: String(task.nodeId || task.checkpoint?.nodeId || '-'),
      progressLabel: total ? `${Math.min(current, total)}/${total}` : '-',
      errorLabel: String(task.error || task.errorCode || ''),
      createdLabel: formatTime(task.createdAt),
      updatedLabel: formatTime(task.updatedAt),
      canCancel: !TERMINAL.has(task.status) && task.status !== 'cancel_requested',
    };
  }

  function toEventView(event = {}) {
    return {
      eventId: String(event.eventId || ''),
      level: String(event.level || 'info'),
      code: String(event.code || event.type || 'EVENT'),
      nodeId: String(event.nodeId || ''),
      message: String(event.message || ''),
      createdLabel: formatTime(event.createdAt),
    };
  }

  return { formatTime, toEventView, toTaskView };
});
