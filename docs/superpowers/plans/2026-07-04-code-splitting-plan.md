# Code Splitting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the largest extension files into focused modules without changing user-visible behavior.

**Architecture:** Keep the current Chrome MV3 no-bundler architecture. Sidepanel modules continue to attach factories on `window`, and background modules continue to load through `importScripts`; the entry files become composition roots rather than feature containers.

**Tech Stack:** Plain JavaScript, Chrome Extension MV3, `importScripts`, ordered `<script>` tags, Node syntax checks, existing smoke tests.

---

## Current Hotspots

Measured on 2026-07-04:

| File | Lines | Functions | Split Priority | Main Mixed Responsibilities |
| --- | ---: | ---: | --- | --- |
| `sidepanel/sidepanel.js` | 24720 | 780 | P0 | DOM lookup, settings import/export, CDK pool UI, auto-run UI, network UI, config persistence, modal/download helpers |
| `background.js` | 18644 | 818 | P1 | service worker bootstrap, default settings, state guards, mail providers, auto-run orchestration, message listener glue |
| `content/signup-page.js` | 9474 | 366 | P2 | auth command dispatch, signup entry detection, phone input handling, password page handling, verification UI handling, profile page handling |
| `background/upi-credential-membership-checker.js` | 6331 | 221 | P1 | result storage, Free/Plus grouping, CDK usage, membership checks, redeem continuation |
| `sidepanel/account-records-manager.js` | 5177 | 240 | P1 | account records modal, Free/Plus display, export/delete, CDK redeem controls |
| `background/steps/upi-redeem.js` | 4813 | 189 | P1 | redeem API, CDK usage recovery, auto redeem, post-registration eligibility |
| `sidepanel/sidepanel.css` | 4672 | n/a | P2 | global layout, settings, CDK pool, account records, provider sections |
| `background/message-router.js` | 4348 | 112 | P1 | large switch router, settings export/import, CDK routes, account result routes |

Target after the first split pass:

- `sidepanel/sidepanel.js` under 16000 lines.
- `background.js` under 13000 lines.
- New modules under 1500 lines where practical.
- No behavior change except added tests/guards.

---

### Task 1: Add Size Guard And Baseline Report

**Files:**
- Create: `scripts/module-size-report.mjs`
- Modify: `scripts/audit-smoke-tests.mjs`

- [ ] **Step 1: Create a deterministic size report script**

Create `scripts/module-size-report.mjs`:

```javascript
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function gitLsFiles(patterns) {
  return execFileSync('git', ['ls-files', ...patterns], {
    cwd: root,
    encoding: 'utf8',
  }).split(/\r?\n/).filter(Boolean);
}

const files = gitLsFiles(['*.js', '*.mjs', '*.html', '*.css'])
  .map((file) => {
    const absolute = path.join(root, file);
    const text = fs.readFileSync(absolute, 'utf8');
    return {
      file,
      lines: text.split(/\r?\n/).length,
      bytes: Buffer.byteLength(text),
    };
  })
  .sort((left, right) => right.lines - left.lines);

for (const row of files.slice(0, 30)) {
  console.log(`${String(row.lines).padStart(6)} ${String(row.bytes).padStart(8)} ${row.file}`);
}
```

- [ ] **Step 2: Run the baseline script**

Run:

```powershell
node scripts/module-size-report.mjs
```

Expected: top entries include `sidepanel/sidepanel.js`, `background.js`, and `content/signup-page.js`.

- [ ] **Step 3: Add smoke thresholds for the new split**

In `scripts/audit-smoke-tests.mjs`, add a helper:

```javascript
function assertFileLineCountAtMost(file, maxLines, label) {
  const text = readText(file);
  const lines = text.split(/\r?\n/).length;
  assert(
    lines <= maxLines,
    `${label}: ${file} has ${lines} lines, expected <= ${maxLines}`
  );
}
```

At the end of `checkStaticContracts()`, add initial non-blocking post-split targets only after each task lands. Start with the new files:

```javascript
assertFileLineCountAtMost('sidepanel/download-service.js', 500, 'download service size');
assertFileLineCountAtMost('sidepanel/cdk-pool-manager.js', 1800, 'CDK pool manager size');
```

- [ ] **Step 4: Verify**

Run:

```powershell
node --check scripts/module-size-report.mjs
node --check scripts/audit-smoke-tests.mjs
node scripts/audit-smoke-tests.mjs
```

Expected: syntax passes. Smoke passes after referenced split files exist.

---

### Task 2: Extract Sidepanel Download Service

**Files:**
- Create: `sidepanel/download-service.js`
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/sidepanel.js`
- Modify: `scripts/audit-smoke-tests.mjs`

- [ ] **Step 1: Create the service wrapper**

Create `sidepanel/download-service.js`:

```javascript
(function attachSidepanelDownloadService(globalScope) {
  function createDownloadService(context = {}) {
    const {
      normalizeDownloadFileName,
      inferDownloadExtension,
      buildDownloadFileTimestamp,
      showToast,
      chromeApi = globalScope.chrome,
    } = context;

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
      const downloadFileName = normalizeDownloadFileName(fileName, mimeType);
      const extension = inferDownloadExtension(mimeType);
      const baseMimeType = String(mimeType || 'text/plain').split(';')[0] || 'text/plain';
      try {
        const handle = await globalScope.showSaveFilePicker({
          suggestedName: downloadFileName,
          types: [{
            description: extension === 'json' ? 'JSON 文件' : '文本文件',
            accept: { [baseMimeType]: [`.${extension}`] },
          }],
        });
        return { saved: false, handle, fileName: downloadFileName, method: 'file-picker' };
      } catch (error) {
        return error?.name === 'AbortError'
          ? { saved: false, cancelled: true }
          : { saved: false, error };
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
      const downloadFileName = normalizeDownloadFileName(fileName, mimeType);
      const pickerResult = options?.saveTarget?.handle
        ? await writeTextFileToSaveTarget(options.saveTarget, content, mimeType)
        : await saveTextFileWithPicker(content, downloadFileName, mimeType);
      if (pickerResult.saved || pickerResult.cancelled) return pickerResult;
      if (pickerResult.error) throw pickerResult.error;

      if (chromeApi?.downloads?.download) {
        const downloadUrl = buildDownloadDataUrl(content, mimeType);
        return new Promise((resolve) => {
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
      }

      const blob = new Blob([content], { type: mimeType });
      const objectUrl = URL.createObjectURL(blob);
      triggerAnchorDownload(objectUrl, downloadFileName);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      return { saved: true, fileName: downloadFileName, method: 'anchor' };
    }

    return {
      buildDownloadFileTimestamp,
      requestTextFileSaveTarget,
      writeTextFileToSaveTarget,
      downloadTextFile,
      showToast,
    };
  }

  globalScope.SidepanelDownloadService = { createDownloadService };
})(window);
```

- [ ] **Step 2: Load it before `sidepanel.js`**

In `sidepanel/sidepanel.html`, insert before `account-records-manager.js`:

```html
  <script src="download-service.js"></script>
```

- [ ] **Step 3: Replace inline helper bodies with service delegation**

In `sidepanel/sidepanel.js`, keep the existing public function names but delegate to the service:

```javascript
const downloadService = window.SidepanelDownloadService?.createDownloadService?.({
  normalizeDownloadFileName,
  inferDownloadExtension,
  buildDownloadFileTimestamp,
  showToast,
  chromeApi: chrome,
});

async function requestTextFileSaveTarget(fileName, mimeType = 'application/json;charset=utf-8') {
  return downloadService.requestTextFileSaveTarget(fileName, mimeType);
}

async function downloadTextFile(content, fileName, mimeType = 'application/json;charset=utf-8', options = {}) {
  return downloadService.downloadTextFile(content, fileName, mimeType, options);
}
```

Remove the moved function bodies from `sidepanel/sidepanel.js`.

- [ ] **Step 4: Add smoke contracts**

In `scripts/audit-smoke-tests.mjs`, add:

```javascript
const downloadService = readText('sidepanel/download-service.js');
assertIncludes(sidepanelHtml, 'src="download-service.js"', 'download service script load');
assertIncludes(downloadService, 'createDownloadService', 'download service factory');
assertIncludes(downloadService, 'chromeApi.downloads.download', 'download service browser API fallback');
```

- [ ] **Step 5: Verify**

Run:

```powershell
node --check sidepanel/download-service.js
node --check sidepanel/sidepanel.js
node --check scripts/audit-smoke-tests.mjs
node scripts/audit-smoke-tests.mjs
```

Expected: all pass, and settings export still produces a `.json` filename in the fingerprint browser.

---

### Task 3: Extract Sidepanel CDK Pool Manager

**Files:**
- Create: `sidepanel/cdk-pool-manager.js`
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/sidepanel.js`
- Modify: `scripts/audit-smoke-tests.mjs`

- [ ] **Step 1: Create a focused manager**

Create `sidepanel/cdk-pool-manager.js` with this public API shape:

```javascript
(function attachSidepanelCdkPoolManager(globalScope) {
  function createCdkPoolManager(context = {}) {
    const {
      state,
      dom,
      helpers,
      accountRecordsManager,
    } = context;

    function normalizeRedeemChannel(channel = 'upi') {
      return String(channel || '').trim().toLowerCase() === 'ideal' ? 'ideal' : 'upi';
    }

    async function importCdkPoolFromTextarea(options = {}) {
      const redeemChannel = normalizeRedeemChannel(options.channel || options.redeemChannel);
      return helpers.importCdkPoolFromTextarea({
        channel: redeemChannel,
        autoResume: options.autoResume === true,
      });
    }

    function bindEvents() {
      dom.btnImportCdkPool?.addEventListener('click', () => {
        importCdkPoolFromTextarea({ channel: 'upi', autoResume: true }).catch((error) => {
          helpers.showToast(`导入 CDK 失败：${error.message}`, 'error');
        });
      });
      dom.btnImportIdealCdkPool?.addEventListener('click', () => {
        importCdkPoolFromTextarea({ channel: 'ideal', autoResume: true }).catch((error) => {
          helpers.showToast(`导入 IDEAL CDK 失败：${error.message}`, 'error');
        });
      });
    }

    return {
      bindEvents,
      importCdkPoolFromTextarea,
    };
  }

  globalScope.SidepanelCdkPoolManager = { createCdkPoolManager };
})(window);
```

- [ ] **Step 2: Move CDK-specific DOM bindings**

Move these event bindings out of `sidepanel/sidepanel.js` into `sidepanel/cdk-pool-manager.js`:

```javascript
btnImportCdkPool
btnDeleteAllCdkPool
btnImportIdealCdkPool
btnDeleteAllIdealCdkPool
inputUpiRedeemCdkeyPool Ctrl+Enter
inputIdealRedeemCdkeyPool Ctrl+Enter
btnUpiRedeemCdkeyStatusRefresh
```

Keep shared low-level helpers in `sidepanel/sidepanel.js` for the first pass and pass them through `helpers` to avoid a risky all-at-once move.

- [ ] **Step 3: Load and instantiate**

In `sidepanel/sidepanel.html`, add before `sidepanel.js`:

```html
  <script src="cdk-pool-manager.js"></script>
```

In `sidepanel/sidepanel.js`, instantiate after `accountRecordsManager` is created:

```javascript
const cdkPoolManager = window.SidepanelCdkPoolManager?.createCdkPoolManager?.({
  state: {
    get latestState() { return latestState; },
    syncLatestState,
  },
  dom: {
    btnImportCdkPool,
    btnDeleteAllCdkPool,
    btnImportIdealCdkPool,
    btnDeleteAllIdealCdkPool,
    inputUpiRedeemCdkeyPool,
    inputIdealRedeemCdkeyPool,
    btnUpiRedeemCdkeyStatusRefresh,
  },
  helpers: {
    showToast,
    importCdkPoolFromTextarea,
    deleteAllUpiRedeemCdkeys,
    refreshUpiRedeemCdkeyStatuses,
  },
  accountRecordsManager,
});

cdkPoolManager?.bindEvents?.();
```

- [ ] **Step 4: Verify no duplicate listeners**

Remove the old CDK event bindings from `sidepanel/sidepanel.js`.

Run:

```powershell
Select-String -Path sidepanel/sidepanel.js -Pattern "btnImportCdkPool\\?\\.addEventListener|btnImportIdealCdkPool\\?\\.addEventListener"
```

Expected: no matches in `sidepanel/sidepanel.js`; matches exist in `sidepanel/cdk-pool-manager.js`.

- [ ] **Step 5: Verify**

Run:

```powershell
node --check sidepanel/cdk-pool-manager.js
node --check sidepanel/sidepanel.js
node scripts/audit-smoke-tests.mjs
```

Expected: syntax and smoke pass; importing UPI CDK resumes only UPI candidates, importing IDEAL CDK resumes only IDEAL candidates.

---

### Task 4: Extract Settings Import/Export Manager

**Files:**
- Create: `sidepanel/settings-transfer-manager.js`
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/sidepanel.js`
- Modify: `scripts/audit-smoke-tests.mjs`

- [ ] **Step 1: Create manager shell**

Create `sidepanel/settings-transfer-manager.js`:

```javascript
(function attachSidepanelSettingsTransferManager(globalScope) {
  function createSettingsTransferManager(context = {}) {
    const {
      runtime,
      helpers,
      controls,
    } = context;

    async function exportSettingsFile() {
      const saveTarget = await helpers.requestTextFileSaveTarget(
        `multipage-settings-${helpers.buildDownloadFileTimestamp()}.json`,
        'application/json;charset=utf-8'
      );
      if (saveTarget?.cancelled) {
        helpers.showToast('已取消导出配置。', 'info', 1800);
        return;
      }
      if (saveTarget?.error) {
        helpers.showToast('导出配置失败：' + (saveTarget.error?.message || '无法打开保存窗口。'), 'error');
        return;
      }

      controls.setConfigActionInFlight(true);
      try {
        const response = await runtime.sendMessage({
          type: 'EXPORT_SETTINGS',
          source: 'sidepanel',
        });
        if (response?.error) throw new Error(response.error);
        if (!response?.fileContent || !response?.fileName) {
          throw new Error('未生成可下载的配置文件。');
        }
        const downloadResult = await helpers.downloadTextFile(
          response.fileContent,
          response.fileName,
          'application/json;charset=utf-8',
          { saveTarget }
        );
        if (downloadResult?.cancelled) {
          helpers.showToast('已取消导出配置。', 'info', 1800);
          return;
        }
        helpers.showToast('配置已导出。', 'success', 1800);
      } catch (error) {
        helpers.showToast('导出配置失败：' + error.message, 'error');
      } finally {
        controls.setConfigActionInFlight(false);
      }
    }

    return { exportSettingsFile };
  }

  globalScope.SidepanelSettingsTransferManager = { createSettingsTransferManager };
})(window);
```

- [ ] **Step 2: Move import logic in a second commit**

After export works, move `importSettingsFile` and file input change handling into the same manager.

Use this public API:

```javascript
return {
  exportSettingsFile,
  importSettingsFile,
  bindEvents,
};
```

- [ ] **Step 3: Verify**

Run:

```powershell
node --check sidepanel/settings-transfer-manager.js
node --check sidepanel/sidepanel.js
node scripts/audit-smoke-tests.mjs
```

Expected: exporting config creates a `.json` file name instead of a UUID-only blob download.

---

### Task 5: Split Background Settings And Flow Definition Helpers

**Files:**
- Create: `background/settings-normalizers.js`
- Create: `background/flow-definition-resolver.js`
- Modify: `background.js`
- Modify: `scripts/audit-smoke-tests.mjs`

- [ ] **Step 1: Extract settings normalizers**

Move the normalize functions from `background.js` lines around `1479-2189` into `background/settings-normalizers.js`.

Expose:

```javascript
self.MultiPageBackgroundSettingsNormalizers = {
  normalizeAutoRunDelayMinutes,
  normalizeAutoRunFallbackThreadIntervalMinutes,
  normalizeAutoStepDelaySeconds,
  normalizeVerificationResendCount,
  normalizeSignupMethod,
  normalizeRemovedNetworkServiceProfilesForSettings,
};
```

- [ ] **Step 2: Import before `background.js` uses them**

In `background.js importScripts(...)`, insert after `background/runtime-state.js`:

```javascript
'background/settings-normalizers.js',
'background/flow-definition-resolver.js',
```

- [ ] **Step 3: Extract flow resolver helpers**

Move these functions to `background/flow-definition-resolver.js`:

```javascript
getSignupMethodForStepDefinitions
getStepDefinitionsForState
getStepIdsForState
getLastStepIdForState
getAuthChainStartStepId
getStepDefinitionForState
getStepIdByKeyForState
getNodeDefinitionsForState
getNodeIdsForState
getNodeDefinitionForState
getLastNodeIdForState
getNodeIdByStepForState
getStepIdByNodeIdForState
getNodeTitleForState
```

Expose:

```javascript
self.MultiPageFlowDefinitionResolver = {
  createFlowDefinitionResolver,
};
```

- [ ] **Step 4: Keep compatibility wrappers in `background.js`**

In `background.js`, create the resolver and keep current function names:

```javascript
const flowDefinitionResolver = self.MultiPageFlowDefinitionResolver.createFlowDefinitionResolver({
  getSteps: self.MultiPageStepDefinitions.getSteps,
  getWorkflowNodes: self.MultiPageStepDefinitions.getWorkflowNodes,
  defaultActiveFlowId: DEFAULT_ACTIVE_FLOW_ID,
});

function getStepDefinitionsForState(state = {}) {
  return flowDefinitionResolver.getStepDefinitionsForState(state);
}
```

- [ ] **Step 5: Verify**

Run:

```powershell
node --check background/settings-normalizers.js
node --check background/flow-definition-resolver.js
node --check background.js
node scripts/audit-smoke-tests.mjs
```

Expected: background syntax passes and startup still has the same default settings values.

---

### Task 6: Split CDK/Redeem Domain Helpers From Membership Checker

**Files:**
- Create: `background/redeem/redeem-channel-state.js`
- Create: `background/redeem/redeem-cdkey-usage.js`
- Modify: `background/upi-credential-membership-checker.js`
- Modify: `background/steps/upi-redeem.js`
- Modify: `background.js`

- [ ] **Step 1: Extract channel state helpers**

Create `background/redeem/redeem-channel-state.js`:

```javascript
(function attachRedeemChannelState(globalScope) {
  function normalizeRedeemChannel(channel = 'upi') {
    return String(channel || '').trim().toLowerCase() === 'ideal' ? 'ideal' : 'upi';
  }

  function getRedeemChannelFailureField(channel = 'upi') {
    return normalizeRedeemChannel(channel) === 'ideal'
      ? 'idealRedeemFailureCount'
      : 'upiRedeemFailureCount';
  }

  function isRedeemChannelDailyLimitReason(message = '') {
    const text = String(message || '').trim();
    return /该邮箱/.test(text)
      && /在该渠道今日提交次数已达上限/.test(text)
      && /3\s*次/.test(text)
      && /请\s*24\s*小时后再试/.test(text);
  }

  globalScope.MultiPageRedeemChannelState = {
    normalizeRedeemChannel,
    getRedeemChannelFailureField,
    isRedeemChannelDailyLimitReason,
  };
})(self);
```

- [ ] **Step 2: Load before dependent files**

In `background.js importScripts(...)`, load these before `background/upi-credential-membership-checker.js` and `background/steps/upi-redeem.js`:

```javascript
'background/redeem/redeem-channel-state.js',
'background/redeem/redeem-cdkey-usage.js',
```

- [ ] **Step 3: Replace duplicated helper bodies**

In both `background/upi-credential-membership-checker.js` and `background/steps/upi-redeem.js`, use:

```javascript
const {
  normalizeRedeemChannel,
  getRedeemChannelFailureField,
  isRedeemChannelDailyLimitReason,
} = self.MultiPageRedeemChannelState;
```

- [ ] **Step 4: Verify**

Run:

```powershell
node --check background/redeem/redeem-channel-state.js
node --check background/redeem/redeem-cdkey-usage.js
node --check background/upi-credential-membership-checker.js
node --check background/steps/upi-redeem.js
node --check background.js
node scripts/audit-smoke-tests.mjs
```

Expected: UPI/IDEAL failure rules remain unchanged.

---

### Task 7: Split `content/signup-page.js` By Auth Page Domain

**Files:**
- Create: `content/signup-dom-utils.js`
- Create: `content/signup-entry-page.js`
- Create: `content/signup-phone-page.js`
- Create: `content/signup-verification-page.js`
- Modify: `manifest.json`
- Modify: `content/signup-page.js`

- [ ] **Step 1: Extract DOM utility functions**

Move these to `content/signup-dom-utils.js`:

```javascript
isVisibleElement
getActionText
isActionEnabled
getAssociatedInputText
```

Expose:

```javascript
self.MultiPageSignupDomUtils = {
  isVisibleElement,
  getActionText,
  isActionEnabled,
  getAssociatedInputText,
};
```

- [ ] **Step 2: Extract signup entry detection**

Move these to `content/signup-entry-page.js`:

```javascript
SIGNUP_ENTRY_TRIGGER_PATTERN
SIGNUP_AUTH_ENTRY_TRIGGER_PATTERN
SIGNUP_ENTRY_EXCLUDED_ACTION_PATTERN
getSignupEmailInput
findSignupEntryTrigger
inspectSignupEntryState
getSignupEntryDiagnostics
ensureSignupEntryReady
fillSignupEmailAndContinue
```

Expose:

```javascript
self.MultiPageSignupEntryPage = {
  getSignupEmailInput,
  findSignupEntryTrigger,
  inspectSignupEntryState,
  getSignupEntryDiagnostics,
  ensureSignupEntryReady,
  fillSignupEmailAndContinue,
};
```

- [ ] **Step 3: Extract phone helpers**

Move phone-specific helpers from `content/signup-page.js` lines around `1679-2889` to `content/signup-phone-page.js`.

Expose:

```javascript
self.MultiPageSignupPhonePage = {
  getSignupPhoneInput,
  ensureSignupPhoneEntryReady,
  submitSignupPhoneNumberAndContinue,
};
```

- [ ] **Step 4: Extract verification helpers**

Move verification helpers to `content/signup-verification-page.js`:

```javascript
getVerificationCodeTarget
findResendVerificationCodeTrigger
resendVerificationCode
isEmailVerificationPage
getVerificationErrorText
```

Expose:

```javascript
self.MultiPageSignupVerificationPage = {
  getVerificationCodeTarget,
  findResendVerificationCodeTrigger,
  resendVerificationCode,
  isEmailVerificationPage,
  getVerificationErrorText,
};
```

- [ ] **Step 5: Update content script order**

In `manifest.json`, for the OpenAI auth content script, load the new files before `content/signup-page.js`:

```json
"content/signup-dom-utils.js",
"content/signup-entry-page.js",
"content/signup-phone-page.js",
"content/signup-verification-page.js",
"content/signup-page.js"
```

- [ ] **Step 6: Verify**

Run:

```powershell
node --check content/signup-dom-utils.js
node --check content/signup-entry-page.js
node --check content/signup-phone-page.js
node --check content/signup-verification-page.js
node --check content/signup-page.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"
```

Expected: syntax and manifest parsing pass. Manual smoke: Hindi login entry, email signup, resend verification, and password page still work.

---

### Task 8: CSS Split After JS Boundaries Stabilize

**Files:**
- Create: `sidepanel/styles/account-records.css`
- Create: `sidepanel/styles/cdk-pools.css`
- Create: `sidepanel/styles/settings.css`
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/sidepanel.css`

- [ ] **Step 1: Move account records styles**

Move selectors containing these prefixes into `sidepanel/styles/account-records.css`:

```css
.account-records
.upi-credential
.membership
```

- [ ] **Step 2: Move CDK pool styles**

Move selectors containing these prefixes into `sidepanel/styles/cdk-pools.css`:

```css
.cdk
.upi-redeem
.redeem-cdkey
```

- [ ] **Step 3: Move settings/config styles**

Move selectors containing these prefixes into `sidepanel/styles/settings.css`:

```css
.settings
.config
.form-row
```

- [ ] **Step 4: Load split styles**

In `sidepanel/sidepanel.html`, add:

```html
<link rel="stylesheet" href="styles/settings.css">
<link rel="stylesheet" href="styles/cdk-pools.css">
<link rel="stylesheet" href="styles/account-records.css">
```

- [ ] **Step 5: Verify**

Run:

```powershell
node scripts/module-size-report.mjs
```

Expected: `sidepanel/sidepanel.css` drops below 2500 lines.

---

## Execution Order

1. Task 1: add size guard.
2. Task 2: extract download service.
3. Task 3: extract CDK pool manager.
4. Task 4: extract settings transfer manager.
5. Task 5: split background settings/flow helpers.
6. Task 6: split redeem domain helpers.
7. Task 7: split signup content script.
8. Task 8: split CSS.

Recommended commit rhythm:

```powershell
git add scripts/module-size-report.mjs scripts/audit-smoke-tests.mjs
git commit -m "test: add module size guard"

git add sidepanel/download-service.js sidepanel/sidepanel.html sidepanel/sidepanel.js scripts/audit-smoke-tests.mjs
git commit -m "refactor: extract sidepanel download service"
```

Continue one commit per task.

---

## Final Verification

Run after all tasks:

```powershell
node scripts/module-size-report.mjs
node scripts/audit-smoke-tests.mjs
$failed=@(); git ls-files '*.js' '*.mjs' | ForEach-Object { node --check $_ 2>&1 | ForEach-Object { $_ }; if($LASTEXITCODE -ne 0){ $failed += $_ } }; if($failed.Count){ Write-Error ('FAILED: ' + ($failed -join ', ')); exit 1 } else { Write-Output 'All tracked JS/MJS files passed node --check.' }
node -e "const fs=require('fs'); for (const f of ['manifest.json','package.json','rules.json']) { JSON.parse(fs.readFileSync(f,'utf8')); console.log(f+': valid JSON'); }"
```

Manual smoke:

- Export settings in the fingerprint browser and confirm the downloaded file is named `multipage-settings-*.json`.
- Import UPI CDK and confirm only UPI candidates resume.
- Import IDEAL CDK and confirm only IDEAL candidates resume.
- Run main flow through steps 2-7 once.
- Run Hindi auth page path once.
- Delete UPI Plus and IDEAL Plus rows and confirm they do not return after refresh.

---

## Self-Review

- Spec coverage: The plan identifies current large files, prioritizes the worst concentration points, and gives a staged refactor path.
- Placeholder scan: No task depends on an unnamed future module; every new file has a concrete public API.
- Type consistency: Sidepanel modules use the existing `globalScope.SidepanelX = { createX }` pattern; background modules use existing `self.MultiPageX` globals; content scripts use `self.MultiPageSignupX` globals.
