(function attachSidepanelDownloadService(globalScope) {
  function buildDownloadFileTimestamp(date = new Date()) {
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }

  function inferDownloadExtension(mimeType = '') {
    const normalized = String(mimeType || '').toLowerCase();
    if (normalized.includes('text/plain')) return 'txt';
    if (normalized.includes('json')) return 'json';
    return 'txt';
  }

  function normalizeDownloadFileName(fileName = '', mimeType = '') {
    const extension = inferDownloadExtension(mimeType);
    const sanitized = String(fileName || '')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/^\.+/g, '')
      .trim();
    const fallback = `download-${buildDownloadFileTimestamp()}.${extension}`;
    const safeName = sanitized || fallback;
    return /\.[a-z0-9]{1,8}$/i.test(safeName) ? safeName : `${safeName}.${extension}`;
  }

  function createDownloadService(context = {}) {
    const normalizeFileName = context.normalizeDownloadFileName || normalizeDownloadFileName;
    const inferExtension = context.inferDownloadExtension || inferDownloadExtension;
    const chromeApi = context.chromeApi || globalScope.chrome;

    function triggerAnchorDownload(objectUrl, fileName) {
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }

    function buildDownloadDataUrl(content, mimeType = 'application/json;charset=utf-8') {
      return `data:${mimeType},${encodeURIComponent(String(content ?? ''))}`;
    }

    function canUseTextFileSavePicker() {
      return typeof globalScope.showSaveFilePicker === 'function';
    }

    async function requestTextFileSaveTarget(fileName, mimeType = 'application/json;charset=utf-8') {
      if (!canUseTextFileSavePicker()) {
        return { saved: false, unavailable: true };
      }
      const downloadFileName = normalizeFileName(fileName, mimeType);
      const extension = inferExtension(mimeType);
      const baseMimeType = String(mimeType || 'text/plain').split(';')[0] || 'text/plain';
      try {
        const handle = await globalScope.showSaveFilePicker({
          suggestedName: downloadFileName,
          types: [
            {
              description: extension === 'json' ? 'JSON 文件' : '文本文件',
              accept: {
                [baseMimeType]: [`.${extension}`],
              },
            },
          ],
        });
        return { saved: false, handle, fileName: downloadFileName, method: 'file-picker' };
      } catch (error) {
        if (error?.name === 'AbortError') {
          return { saved: false, cancelled: true };
        }
        return { saved: false, error };
      }
    }

    async function writeTextFileToSaveTarget(saveTarget, content, mimeType = 'application/json;charset=utf-8') {
      if (!saveTarget?.handle || typeof saveTarget.handle.createWritable !== 'function') {
        return { saved: false, unavailable: true };
      }
      try {
        const writable = await saveTarget.handle.createWritable();
        await writable.write(new Blob([content], { type: mimeType }));
        await writable.close();
        return { saved: true, fileName: saveTarget.fileName || 'download', method: 'file-picker' };
      } catch (error) {
        return { saved: false, error };
      }
    }

    async function saveTextFileWithPicker(content, fileName, mimeType = 'application/json;charset=utf-8') {
      const saveTarget = await requestTextFileSaveTarget(fileName, mimeType);
      if (saveTarget.cancelled || saveTarget.unavailable || saveTarget.error) {
        return saveTarget;
      }
      return writeTextFileToSaveTarget(saveTarget, content, mimeType);
    }

    async function downloadTextFile(content, fileName, mimeType = 'application/json;charset=utf-8', options = {}) {
      const downloadFileName = normalizeFileName(fileName, mimeType);
      const pickerResult = options?.saveTarget?.handle
        ? await writeTextFileToSaveTarget(options.saveTarget, content, mimeType)
        : await saveTextFileWithPicker(content, downloadFileName, mimeType);
      if (pickerResult.saved || pickerResult.cancelled) {
        return pickerResult;
      }
      if (pickerResult.error) {
        throw pickerResult.error;
      }

      if (chromeApi?.downloads?.download) {
        const downloadUrl = buildDownloadDataUrl(content, mimeType);
        try {
          return await new Promise((resolve) => {
            chromeApi.downloads.download({
              url: downloadUrl,
              filename: downloadFileName,
              conflictAction: 'uniquify',
              saveAs: false,
            }, () => {
              const error = chromeApi.runtime?.lastError;
              if (error) {
                const blob = new Blob([content], { type: mimeType });
                const objectUrl = URL.createObjectURL(blob);
                triggerAnchorDownload(objectUrl, downloadFileName);
                setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
                resolve({ saved: true, fileName: downloadFileName, method: 'anchor-fallback', error });
                return;
              }
              resolve({ saved: true, fileName: downloadFileName, method: 'downloads' });
            });
          });
        } catch {
          // Fall through to the anchor fallback below.
        }
      }

      const blob = new Blob([content], { type: mimeType });
      const objectUrl = URL.createObjectURL(blob);
      triggerAnchorDownload(objectUrl, downloadFileName);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      return { saved: true, fileName: downloadFileName, method: 'anchor' };
    }

    return {
      requestTextFileSaveTarget,
      downloadTextFile,
    };
  }

  globalScope.SidepanelDownloadService = {
    buildDownloadFileTimestamp,
    inferDownloadExtension,
    normalizeDownloadFileName,
    createDownloadService,
  };
})(window);
