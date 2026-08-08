const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadModule() {
  const sandbox = { window: {} };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../sidepanel/settings-transfer-manager.js'), 'utf8'),
    sandbox,
    { filename: 'sidepanel/settings-transfer-manager.js' }
  );
  return sandbox.window.SidepanelSettingsTransferManager;
}

test('settings export persists the visible custom email pool before reading background settings', async () => {
  const calls = [];
  const manager = loadModule().createSettingsTransferManager({
    controls: {},
    helpers: {
      openConfirmModal: async (options) => {
        calls.push(['confirm', options]);
        return true;
      },
      requestTextFileSaveTarget: async () => ({ handle: 'save-target' }),
      buildDownloadFileTimestamp: () => '20260710-000000',
      closeConfigMenu: () => {},
      flushPendingSettingsBeforeExport: async () => calls.push('flush'),
      persistCustomEmailPoolBeforeExport: async () => calls.push('pool'),
      downloadTextFile: async () => ({ fileName: 'settings.json' }),
      showToast: () => {},
    },
    runtime: {
      sendMessage: async () => {
        calls.push('export');
        return { fileContent: '{}', fileName: 'settings.json' };
      },
    },
  });

  await manager.exportSettingsFile();

  assert.equal(calls[0][0], 'confirm');
  assert.equal(calls[0][1].title, '导出安全配置');
  assert.match(calls[0][1].message, /不包含邮箱池、完整 AT\/Session、密码或 2FA/);
  assert.deepEqual(calls.slice(1), ['flush', 'pool', 'export']);
});

test('sensitive settings export explains complete recovery and sends explicit confirmation', async () => {
  const calls = [];
  const manager = loadModule().createSettingsTransferManager({
    controls: {},
    helpers: {
      openConfirmModal: async (options) => {
        calls.push(['confirm', options]);
        return true;
      },
      requestTextFileSaveTarget: async () => ({ handle: 'save-target' }),
      downloadTextFile: async () => ({ fileName: 'complete.json' }),
      showToast: (message) => calls.push(['toast', message]),
    },
    runtime: {
      sendMessage: async (message) => {
        calls.push(['message', message]);
        return { fileContent: '{}', fileName: 'complete.json' };
      },
    },
  });

  await manager.exportSensitiveSettingsFile();

  assert.equal(calls[0][1].title, '导出完整备份');
  assert.match(calls[0][1].message, /恢复邮箱池、账号、完整 AT\/Session、密码和 2FA/);
  assert.equal(calls[1][1].payload.includeSensitiveRuntimeData, true);
  assert.equal(calls[1][1].payload.confirmed, true);
  assert.match(calls[2][1], /完整备份已导出/);
});

test('settings import identifies safe bundles before confirmation', async () => {
  let confirmation = null;
  const manager = loadModule().createSettingsTransferManager({
    controls: {},
    helpers: {
      openConfirmModal: async (options) => {
        confirmation = options;
        return false;
      },
    },
  });

  await manager.importSettingsFromFile({
    name: 'safe.json',
    text: async () => JSON.stringify({ schemaVersion: 2, containsSensitiveRuntimeData: false }),
  });

  assert.match(confirmation.message, /这是安全配置/);
  assert.match(confirmation.message, /不包含邮箱池、完整 AT\/Session、密码或 2FA/);
});
