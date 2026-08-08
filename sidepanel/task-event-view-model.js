(function attachTaskEventViewModel(root, factory) {
  const api = factory();
  root.SidepanelTaskEventViewModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function createTaskEventViewModelModule() {
  const TYPE_LABELS = Object.freeze({
    register: '注册',
    refresh_access_token: '补充 AT',
    fill_session: '补充 Session',
    check_eligibility: '资格复检',
    provider_health_check: 'Provider 检查',
  });
  const STATUS_LABELS = Object.freeze({
    pending: '等待', running: '运行中', retry_wait: '等待重试',
    cancel_requested: '正在取消', canceled: '已取消', succeeded: '成功', failed: '失败',
    interrupted: '已中断', manual_review: '人工处理',
  });
  const TERMINAL = new Set(['canceled', 'succeeded', 'failed', 'interrupted', 'manual_review']);
  const EVENT_MESSAGES = Object.freeze({
    TASK_STARTED: '任务已开始。',
    TASK_RESUMED: '任务已继续运行。',
    TASK_CANCEL_REQUESTED: '已请求取消任务。',
    TASK_CANCELED: '任务已取消。',
    TASK_SUCCEEDED: '任务已完成。',
    TASK_RECOVERY_RESUME_SAFE: '检测到任务可以安全继续。',
    TASK_RECOVERY_RETRY: '检测到任务可以重试。',
    TASK_RECOVERY_MANUAL_REVIEW: '任务需要人工检查后再继续。',
  });

  function formatTime(value = '') {
    const timestamp = Date.parse(String(value || ''));
    if (!Number.isFinite(timestamp)) return '-';
    return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
  }

  function toTaskView(task = {}) {
    const current = Math.max(0, Number(task.progress?.current) || 0);
    const total = Math.max(0, Number(task.progress?.total) || 0);
    const checkpoint = task.checkpoint || {};
    const currentIndex = Math.max(0, Number(checkpoint.currentIndex) || current);
    const successCount = Math.max(0, Number(checkpoint.successCount) || 0);
    const failedCount = Math.max(0, Number(checkpoint.failedCount) || 0);
    const skippedCount = Math.max(0, Number(checkpoint.skippedCount) || 0);
    const outcome = String(checkpoint.lastOutcome || '');
    let statusLabel = STATUS_LABELS[task.status] || task.status || '等待';
    if (task.type === 'fill_session' && task.status === 'succeeded' && task.result?.partialFailure === true) {
      statusLabel = '完成，部分失败';
    } else if (task.type === 'fill_session' && task.status === 'succeeded' && task.result?.downloadStatus === 'failed') {
      statusLabel = '完成，下载失败';
    }
    let progressLabel = total ? `${Math.min(current, total)}/${total}` : '-';
    let nodeLabel = String(task.nodeId || checkpoint.nodeId || '-');
    if (task.type === 'fill_session' && total) {
      const countSuffix = `成功 ${successCount} · 失败 ${failedCount}${skippedCount ? ` · 跳过 ${skippedCount}` : ''}`;
      if (task.status === 'running' && outcome === 'processing') {
        progressLabel = `处理中 ${Math.min(currentIndex, total)}/${total} · ${countSuffix}`;
        nodeLabel = '正在登录并读取 Session';
      } else {
        const processed = Math.min(successCount + failedCount + skippedCount, total);
        progressLabel = `已处理 ${processed}/${total} · ${countSuffix}`;
      }
    }
    return {
      taskId: String(task.taskId || ''),
      typeLabel: TYPE_LABELS[task.type] || task.type || '任务',
      accountLabel: String(task.accountId || '批量任务'),
      status: String(task.status || 'pending'),
      statusLabel,
      nodeLabel,
      progressLabel,
      errorLabel: String(task.error || task.errorCode || ''),
      createdLabel: formatTime(task.createdAt),
      updatedLabel: formatTime(task.updatedAt),
      canCancel: !TERMINAL.has(task.status) && task.status !== 'cancel_requested',
      canDelete: TERMINAL.has(task.status),
    };
  }

  function toEventView(event = {}) {
    const code = String(event.code || event.type || 'EVENT');
    return {
      eventId: String(event.eventId || ''),
      level: String(event.level || 'info'),
      code,
      nodeId: String(event.nodeId || ''),
      message: EVENT_MESSAGES[code] || String(event.message || ''),
      createdLabel: formatTime(event.createdAt),
    };
  }

  return { formatTime, toEventView, toTaskView };
});
