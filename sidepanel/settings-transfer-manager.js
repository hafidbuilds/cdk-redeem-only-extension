(function attachSidepanelSettingsTransferManager(globalScope) {
  function createSettingsTransferManager(context = {}) {
    const {
      controls = {},
      helpers = {},
      runtime = {},
    } = context;

    function setActionInFlight(value) {
      controls.setConfigActionInFlight?.(Boolean(value));
      controls.updateConfigMenuControls?.();
    }

    async function exportSettingsFile(options = {}) {
      const sensitive = options?.includeSensitiveRuntimeData === true;
      if (sensitive) {
        const confirmed = await helpers.openConfirmModal?.({
          title: '导出完整备份',
          message: '完整备份可恢复邮箱池、账号、完整 AT/Session、密码和 2FA。文件还可能包含 Cookie 和 API Key，仅应保存到受信任位置。',
          confirmLabel: '确认导出完整备份',
          confirmVariant: 'btn-danger',
        });
        if (!confirmed) return;
      } else if (typeof helpers.openConfirmModal === 'function') {
        const confirmed = await helpers.openConfirmModal({
          title: '导出安全配置',
          message: '安全配置可恢复设置、账号邮箱、两个 Free 分组和运行历史，但不包含邮箱池、完整 AT/Session、密码或 2FA。需要完整迁移时，请取消并选择“导出完整备份”。',
          confirmLabel: '继续安全导出',
        });
        if (!confirmed) return;
      }
      const saveTarget = await helpers.requestTextFileSaveTarget?.(
        `multipage-settings-${helpers.buildDownloadFileTimestamp?.()}.json`,
        'application/json;charset=utf-8'
      );
      if (saveTarget?.cancelled) {
        helpers.showToast?.('已取消导出配置。', 'info', 1800);
        return;
      }
      if (saveTarget?.error) {
        helpers.showToast?.('导出配置失败：' + (saveTarget.error?.message || '无法打开保存窗口。'), 'error');
        return;
      }

      helpers.closeConfigMenu?.();
      setActionInFlight(true);

      try {
        await helpers.flushPendingSettingsBeforeExport?.();
        await helpers.persistCustomEmailPoolBeforeExport?.();
        const response = await runtime.sendMessage?.({
          type: 'EXPORT_SETTINGS',
          source: 'sidepanel',
          payload: sensitive ? { includeSensitiveRuntimeData: true, confirmed: true } : {},
        });

        if (response?.error) {
          throw new Error(response.error);
        }
        if (!response?.fileContent || !response?.fileName) {
          throw new Error('未生成可下载的配置文件。');
        }

        const downloadResult = await helpers.downloadTextFile?.(
          response.fileContent,
          response.fileName,
          'application/json;charset=utf-8',
          { saveTarget }
        );
        if (downloadResult?.cancelled) {
          helpers.showToast?.('已取消导出配置。', 'info', 1800);
          return;
        }
        helpers.showToast?.(
          (sensitive ? '完整备份已导出：' : '安全配置已导出（不含邮箱池、AT/Session、密码和 2FA）：')
            + (downloadResult?.fileName || response.fileName),
          'success',
          sensitive ? 2600 : 3600
        );
      } catch (error) {
        helpers.showToast?.('导出配置失败：' + (error?.message || error), 'error');
      } finally {
        setActionInFlight(false);
      }
    }

    async function exportSensitiveSettingsFile() {
      return exportSettingsFile({ includeSensitiveRuntimeData: true });
    }

    async function importSettingsFromFile(file) {
      if (!file) {
        return;
      }

      setActionInFlight(true);
      helpers.closeConfigMenu?.();

      try {
        await helpers.settlePendingSettingsBeforeImport?.();
        const rawText = await file.text();

        let parsedConfig = null;
        try {
          parsedConfig = JSON.parse(rawText);
        } catch {
          throw new Error('配置文件不是有效的 JSON。');
        }

        const confirmed = await helpers.openConfirmModal?.({
          title: '导入配置',
          message: parsedConfig?.containsSensitiveRuntimeData === true
            ? '这是完整备份，可恢复邮箱池、账号、AT/Session、密码和 2FA。确认导入文件 "' + file.name + '" 并覆盖当前配置吗？'
            : '这是安全配置，只恢复设置、账号邮箱、两个 Free 分组和历史，不包含邮箱池、完整 AT/Session、密码或 2FA。确认导入文件 "' + file.name + '" 吗？',
          confirmLabel: '确认覆盖导入',
          confirmVariant: 'btn-danger',
        });
        if (!confirmed) {
          return;
        }

        const response = await runtime.sendMessage?.({
          type: 'IMPORT_SETTINGS',
          source: 'sidepanel',
          payload: {
            config: parsedConfig,
          },
        });

        if (response?.error) {
          throw new Error(response.error);
        }
        if (!response?.state) {
          throw new Error('导入后未返回最新配置状态。');
        }

        helpers.applySettingsState?.(response.state);
        await helpers.reloadUpiCredentialMembershipAfterRuntimeImport?.();
        helpers.updateStatusDisplay?.();
        helpers.showToast?.('配置已导入，当前配置已覆盖。', 'success', 2200);
      } catch (error) {
        helpers.showToast?.('导入配置失败：' + (error?.message || error), 'error');
      } finally {
        setActionInFlight(false);
        controls.resetImportSettingsFile?.();
      }
    }

    return {
      exportSettingsFile,
      exportSensitiveSettingsFile,
      importSettingsFromFile,
    };
  }

  globalScope.SidepanelSettingsTransferManager = {
    createSettingsTransferManager,
  };
})(window);
