(function attachFreeAccountSessionFillTask(root, factory) {
  const api = factory(root);
  root.MultiPageFreeAccountSessionFillTask = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createFreeAccountSessionFillTaskModule(root) {
  const ACTIVE_STATUSES = new Set(['pending', 'running', 'cancel_requested']);

  function normalizeText(value = '') {
    return String(value ?? '').trim();
  }

  function normalizeEmail(value = '') {
    return normalizeText(value).toLowerCase();
  }

  function uniqueEmails(values = []) {
    return [...new Set((Array.isArray(values) ? values : []).map(normalizeEmail).filter(Boolean))];
  }

  function normalizeGroup(value = '') {
    return normalizeText(value) === 'free-ineligible' ? 'free-ineligible' : 'free';
  }

  function sanitizeOptions(input = {}) {
    return {
      group: normalizeGroup(input.group || input.status),
      includeVerificationUrl: input.includeVerificationUrl !== false,
      onlyMissing: input.onlyMissing !== false,
      autoExport: input.autoExport !== false,
    };
  }

  function createFreeAccountSessionFillTaskController(deps = {}) {
    const {
      chromeApi = root.chrome,
      clearStopRequest = () => {},
      freeAccountService,
      taskRepository,
      taskRuntime,
      logger = console,
    } = deps;

    if (!freeAccountService?.listSessionFillTargets || !freeAccountService?.fillSessions) {
      throw new Error('FREE_ACCOUNT_SESSION_SERVICE_UNAVAILABLE');
    }
    if (!taskRepository?.get || !taskRuntime?.startTask || !taskRuntime?.executeTask) {
      throw new Error('FREE_ACCOUNT_SESSION_TASK_RUNTIME_UNAVAILABLE');
    }

    function getResourceKeys(emails = []) {
      return ['free-account-session-fill', ...uniqueEmails(emails).map((email) => `account:${email}`)];
    }

    async function downloadExport(exported = {}) {
      const fileContent = normalizeText(exported.fileContent);
      const fileName = normalizeText(exported.fileName);
      if (!fileContent || !fileName) {
        return { downloadStatus: 'skipped', downloadId: 0, fileName: '' };
      }
      if (!chromeApi?.downloads?.download) {
        throw new Error('浏览器下载能力不可用。');
      }
      const mimeType = normalizeText(exported.mimeType) || 'text/plain;charset=utf-8';
      const downloadId = await chromeApi.downloads.download({
        url: `data:${mimeType},${encodeURIComponent(fileContent)}`,
        filename: fileName,
        saveAs: false,
        conflictAction: 'uniquify',
      });
      return {
        downloadStatus: 'started',
        downloadId: Math.max(0, Math.floor(Number(downloadId) || 0)),
        fileName,
      };
    }

    async function exportCompleted(options, completedEmails) {
      const emails = uniqueEmails(completedEmails);
      if (!options.autoExport || !emails.length) {
        return { downloadStatus: 'skipped', downloadId: 0, fileName: '' };
      }
      const exported = await freeAccountService.exportResults({
        group: options.group,
        emails,
        credentialMode: 'session',
        includeVerificationUrl: options.includeVerificationUrl,
      });
      return downloadExport(exported);
    }

    function buildSummary(checkpoint = {}, download = {}, extra = {}) {
      const targetEmails = uniqueEmails(checkpoint.targetEmails);
      const completedEmails = uniqueEmails(checkpoint.completedEmails);
      const failedEmails = uniqueEmails(checkpoint.failedEmails);
      const skippedEmails = uniqueEmails(checkpoint.skippedEmails);
      return {
        group: normalizeGroup(checkpoint.group),
        total: targetEmails.length,
        successCount: completedEmails.length,
        failedCount: failedEmails.length,
        skippedCount: skippedEmails.length,
        fileName: normalizeText(download.fileName),
        downloadStatus: normalizeText(download.downloadStatus) || 'skipped',
        downloadId: Math.max(0, Math.floor(Number(download.downloadId) || 0)),
        ...extra,
      };
    }

    async function runOperation(taskId, options, initialCheckpoint = {}) {
      clearStopRequest();
      const context = taskRuntime.createContext(taskId);
      let checkpoint = {
        group: options.group,
        targetEmails: uniqueEmails(initialCheckpoint.targetEmails),
        completedEmails: uniqueEmails(initialCheckpoint.completedEmails),
        failedEmails: uniqueEmails(initialCheckpoint.failedEmails),
        skippedEmails: uniqueEmails(initialCheckpoint.skippedEmails),
        nextIndex: Math.max(0, Math.floor(Number(initialCheckpoint.nextIndex) || 0)),
      };

      const persistProgress = async (patch = {}) => {
        checkpoint = {
          ...checkpoint,
          ...patch,
          targetEmails: uniqueEmails(patch.targetEmails || checkpoint.targetEmails),
          completedEmails: uniqueEmails(patch.completedEmails || checkpoint.completedEmails),
          failedEmails: uniqueEmails(patch.failedEmails || checkpoint.failedEmails),
          skippedEmails: uniqueEmails(patch.skippedEmails || checkpoint.skippedEmails),
          nextIndex: Math.max(0, Math.floor(Number(patch.nextIndex ?? checkpoint.nextIndex) || 0)),
        };
        const outcome = normalizeText(patch.outcome);
        const currentIndex = Math.max(0, Math.floor(Number(patch.currentIndex) || 0));
        const successCount = uniqueEmails(checkpoint.completedEmails).length;
        const failedCount = uniqueEmails(checkpoint.failedEmails).length;
        const skippedCount = uniqueEmails(checkpoint.skippedEmails).length;
        const errorCode = normalizeText(patch.errorCode);
        const currentEmail = normalizeEmail(patch.currentEmail);
        const rawErrorMessage = normalizeText(patch.errorMessage);
        const errorMessage = currentEmail
          ? rawErrorMessage.replace(new RegExp(currentEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[账号]')
          : rawErrorMessage;
        await context.checkpoint({
          nodeId: 'fill-session',
          group: options.group,
          targetEmails: checkpoint.targetEmails,
          completedEmails: checkpoint.completedEmails,
          failedEmails: checkpoint.failedEmails,
          skippedEmails: checkpoint.skippedEmails,
          nextIndex: checkpoint.nextIndex,
          currentEmail,
          currentIndex,
          lastOutcome: outcome,
          lastErrorCode: outcome === 'failed' ? errorCode : '',
          lastErrorMessage: outcome === 'failed' ? errorMessage : '',
          successCount,
          failedCount,
          skippedCount,
          progress: {
            current: Math.max(0, Math.floor(Number(patch.progress?.current ?? checkpoint.nextIndex) || 0)),
            total: checkpoint.targetEmails.length,
          },
        });
        const eventMeta = {
          processing: ['FREE_ACCOUNT_SESSION_PROCESSING', '正在处理'],
          completed: ['FREE_ACCOUNT_SESSION_COMPLETED', '已成功保存'],
          failed: ['FREE_ACCOUNT_SESSION_ACCOUNT_FAILED', '处理失败，继续下一账号'],
          skipped: ['FREE_ACCOUNT_SESSION_ACCOUNT_SKIPPED', '已跳过'],
        }[outcome];
        if (eventMeta && currentIndex > 0) {
          const failureReason = outcome === 'failed'
            ? `：${errorMessage || '未提供具体失败原因'}${errorCode ? `（${errorCode}）` : ''}`
            : '';
          await context.event({
            type: 'progress',
            level: outcome === 'failed' ? 'error' : 'info',
            code: outcome === 'failed' && errorCode ? errorCode : eventMeta[0],
            message: `第 ${currentIndex}/${checkpoint.targetEmails.length} 个账号${failureReason || `：${eventMeta[1]}`}。成功 ${successCount}，失败 ${failedCount}，跳过 ${skippedCount}。`,
          });
        }
      };

      try {
        const result = await freeAccountService.fillSessions({
          ...options,
          source: 'fill-free-account-session-task',
          targetEmails: checkpoint.targetEmails,
          completedEmails: checkpoint.completedEmails,
          failedEmails: checkpoint.failedEmails,
          skippedEmails: checkpoint.skippedEmails,
          nextIndex: checkpoint.nextIndex,
        }, {
          isCanceled: () => context.isCancelRequested(),
          onProgress: persistProgress,
        });
        checkpoint = { ...checkpoint, ...result };
        let download = { downloadStatus: 'skipped', downloadId: 0, fileName: '' };
        try {
          download = await exportCompleted(options, checkpoint.completedEmails);
        } catch (error) {
          download = { downloadStatus: 'failed', downloadId: 0, fileName: '' };
          await context.event({
            type: 'error',
            level: 'error',
            code: 'FREE_ACCOUNT_SESSION_EXPORT_FAILED',
            message: normalizeText(error?.message || error) || 'Session TXT 自动下载失败。',
          });
        }
        const summary = buildSummary(checkpoint, download, {
          partialFailure: uniqueEmails(checkpoint.failedEmails).length > 0,
        });
        await context.checkpoint({ sessionFillFinished: true, ...summary });
        return summary;
      } catch (error) {
        let download = { downloadStatus: 'skipped', downloadId: 0, fileName: '' };
        try {
          download = await exportCompleted(options, checkpoint.completedEmails);
        } catch (downloadError) {
          download = { downloadStatus: 'failed', downloadId: 0, fileName: '' };
          logger?.warn?.('[SessionFillTask] partial export failed:', downloadError?.message || downloadError);
        }
        const canceled = ['TASK_CANCELED', 'FREE_ACCOUNT_CHECK_STOPPED'].includes(normalizeText(error?.code));
        const summary = buildSummary(checkpoint, download, { stopped: canceled });
        await context.checkpoint({
          sessionFillFinished: canceled,
          sessionFillTaskError: canceled ? '' : normalizeText(error?.code) || 'FREE_ACCOUNT_SESSION_FILL_FAILED',
          ...summary,
        });
        if (canceled) return summary;
        throw error;
      }
    }

    async function start(input = {}) {
      const options = sanitizeOptions(input);
      const selection = await freeAccountService.listSessionFillTargets(options);
      const targetEmails = uniqueEmails(selection.emails);
      const task = await taskRuntime.startTask({
        type: 'fill_session',
        channel: options.group,
        accountId: targetEmails.length === 1 ? targetEmails[0] : '',
        accountIds: targetEmails,
        resourceKeys: getResourceKeys(targetEmails),
        payload: { ...options, targetEmails },
        progress: { current: 0, total: targetEmails.length },
        checkpoint: {
          nodeId: 'fill-session',
          group: options.group,
          targetEmails,
          completedEmails: [],
          failedEmails: [],
          skippedEmails: [],
          nextIndex: 0,
        },
      });
      void taskRuntime.executeTask(task.taskId, () => runOperation(task.taskId, options, task.checkpoint))
        .catch((error) => logger?.error?.('[SessionFillTask] task failed:', error?.message || error));
      return { taskId: task.taskId, count: targetEmails.length, group: options.group };
    }

    async function resume(input = {}) {
      const taskId = normalizeText(input.taskId);
      if (!taskId) throw new Error('TASK_ID_REQUIRED');
      const task = await taskRepository.get(taskId);
      if (!task || task.type !== 'fill_session') throw new Error('FREE_ACCOUNT_SESSION_TASK_NOT_FOUND');
      if (!['interrupted', 'retry_wait'].includes(task.status) || task.recovery?.canRetry === false) {
        throw new Error('TASK_NOT_RESUMABLE');
      }
      const options = sanitizeOptions(task.payload || {});
      const checkpoint = task.checkpoint || {};
      const targetEmails = uniqueEmails(checkpoint.targetEmails || task.payload?.targetEmails);
      void taskRuntime.resumeTask(
        taskId,
        () => runOperation(taskId, options, { ...checkpoint, targetEmails }),
        getResourceKeys(targetEmails)
      ).catch((error) => logger?.error?.('[SessionFillTask] resume failed:', error?.message || error));
      return {
        taskId,
        count: targetEmails.length,
        remainingCount: Math.max(0, targetEmails.length - uniqueEmails(checkpoint.completedEmails).length),
        group: options.group,
      };
    }

    async function stop(input = {}) {
      let taskId = normalizeText(input.taskId);
      if (!taskId) {
        const tasks = await taskRepository.list();
        taskId = normalizeText(tasks.find((task) => task.type === 'fill_session' && ACTIVE_STATUSES.has(task.status))?.taskId);
      }
      if (!taskId) return { taskId: '', stopped: false };
      const task = await taskRepository.get(taskId);
      if (!task || task.type !== 'fill_session') throw new Error('FREE_ACCOUNT_SESSION_TASK_NOT_FOUND');
      freeAccountService.requestStop?.();
      const next = await taskRuntime.requestCancel(taskId);
      return { taskId, stopped: true, task: next };
    }

    async function isActive() {
      const tasks = await taskRepository.list();
      return tasks.some((task) => task.type === 'fill_session' && ACTIVE_STATUSES.has(task.status));
    }

    return { isActive, resume, start, stop };
  }

  return { createFreeAccountSessionFillTaskController };
});
