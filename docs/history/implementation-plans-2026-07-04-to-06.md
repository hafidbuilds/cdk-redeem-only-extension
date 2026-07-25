# 实施计划归档：2026-07-04 至 2026-07-06

这些计划已执行或被后续实现取代，仅用于追溯。文件内路径、模块名、命令和阶段判断不得覆盖当前代码与开发指南。

## 目录

- [Audit Repair Implementation Plan](#2026-07-04-audit-repair-plan)
- [Code Splitting Implementation Plan](#2026-07-04-code-splitting-plan)
- [No-2FA Free Route Implementation Plan](#2026-07-05-no-2fa-free-route-implementation)
- [Remove Removed Network And Phone SMS Implementation Plan](#2026-07-05-remove-removed-network-and-phone-sms)
- [Codebase Decomposition Phase Three Implementation Plan](#2026-07-06-codebase-decomposition-phase-three-plan)
- [Codebase Decomposition Implementation Plan](#2026-07-06-codebase-decomposition-plan)
- [Current Code Splitting Implementation Plan](#2026-07-06-current-code-splitting-plan)
- [Passkey AT Login Optimization Implementation Plan](#2026-07-06-passkey-at-login-optimization)
- [Trial Eligibility API Alignment Implementation Plan](#2026-07-06-trial-eligibility-api-alignment)

---

<a id="2026-07-04-audit-repair-plan"></a>

<!-- archived-from: docs/superpowers/plans/2026-07-04-audit-repair-plan.md -->

## Audit Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 2026-07-04 项目审查中发现的渠道续兑、Plus 删除、侧栏入口、运行态残留和文档漂移问题，并保留可重复运行的 smoke 测试。

**Architecture:** 不重构大文件，只在现有 MV3 原生 JS 架构里做小范围修复。侧栏继续由 `sidepanel/sidepanel.js` 绑定静态 DOM，由 `sidepanel/account-records-manager.js` 渲染 Free/Plus 分组；后台继续由 `background/upi-credential-membership-checker.js` 管理会员核验状态。

**Tech Stack:** Chrome MV3 extension, plain JavaScript, PowerShell, Node.js `--check`, custom smoke script.

---

### File Structure

- Modify: `sidepanel/account-records-manager.js`
  - `resumeFreeRedeemAfterCdkImport()` 使用分渠道候选。
  - `deleteUpiCredentialMembershipCredential()` 统一 Plus 删除语义。
- Modify: `background/upi-credential-membership-checker.js`
  - 单账号/批量会员核验异常时安全落盘 `running:false`。
- Modify: `sidepanel/sidepanel.html`
  - 恢复 CDK 状态刷新按钮和备份工具入口。
- Modify: `sidepanel/sidepanel.js`
  - 统一刷新按钮文案。
- Modify: `sidepanel/sidepanel.css`
  - 让恢复的备份工具按钮在窄侧栏中自动换行。
- Modify: `README.md`, `项目文件结构说明.md`, `项目完整链路说明.md`
  - 更新为 UPI/IDEAL 双渠道和主流程自动兑换现状。
- Modify: `scripts/audit-smoke-tests.mjs`
  - 增加分渠道续兑、Plus 删除、DOM 入口防回归检查。
- Create/Keep: `.codex-backups/repair-backup-20260704-233314`
  - 保存修复前快照、diff 和 git 状态。

---

#### Task 1: Backup Current Worktree

**Files:**
- Create: `.codex-backups/repair-backup-20260704-233314/BACKUP-MANIFEST.txt`
- Create: `.codex-backups/repair-backup-20260704-233314/git-status.txt`
- Create: `.codex-backups/repair-backup-20260704-233314/working-tree.diff`
- Create: `.codex-backups/repair-backup-20260704-233314/untracked-files.txt`
- Create: `.codex-backups/repair-backup-20260704-233314/workspace-snapshot/`

- [x] **Step 1: Create backup directory**

Run:

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path (Join-Path (Get-Location).Path '.codex-backups') "repair-backup-$stamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
```

Expected: `.codex-backups/repair-backup-<timestamp>` exists.

- [x] **Step 2: Save git evidence**

Run:

```powershell
git status --short | Set-Content -LiteralPath (Join-Path $backupDir 'git-status.txt') -Encoding UTF8
git diff --binary | Set-Content -LiteralPath (Join-Path $backupDir 'working-tree.diff') -Encoding UTF8
git ls-files --others --exclude-standard | Set-Content -LiteralPath (Join-Path $backupDir 'untracked-files.txt') -Encoding UTF8
```

Expected: status, diff, and untracked lists are available before any repair edits.

- [x] **Step 3: Copy workspace snapshot**

Run:

```powershell
$snapshotDir = Join-Path $backupDir 'workspace-snapshot'
New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null
$excludeNames = @('.git', '.codegraph', '.codex-backups', 'release-artifacts', '_metadata', 'node_modules')
Get-ChildItem -LiteralPath (Get-Location).Path -Force |
  Where-Object { $excludeNames -notcontains $_.Name } |
  ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $snapshotDir -Recurse -Force }
```

Expected: snapshot contains current source files, excluding generated/internal directories.

---

#### Task 2: Fix Channel-Specific CDK Import Continuation

**Files:**
- Modify: `sidepanel/account-records-manager.js:4315-4340`
- Modify: `scripts/audit-smoke-tests.mjs`

- [x] **Step 1: Add smoke assertion**

Add this check in `checkStaticContracts()`:

```javascript
assertIncludes(
  accountRecords,
  'const credentials = getEnabledFreeUpiCredentialMembershipRowsForChannel(redeemChannel);',
  'CDK import resume must use channel-specific Free candidates'
);
assertNotMatch(
  accountRecords,
  /const credentials = getEnabledFreeUpiCredentialMembershipRows\(\);\s+if \(!credentials\.length\)/,
  'CDK import resume must not use merged UPI/IDEAL candidates'
);
```

- [x] **Step 2: Implement channel-specific candidate selection**

Replace:

```javascript
const credentials = getEnabledFreeUpiCredentialMembershipRows();
```

with:

```javascript
const credentials = getEnabledFreeUpiCredentialMembershipRowsForChannel(redeemChannel);
```

- [x] **Step 3: Verify**

Run:

```powershell
node --check sidepanel/account-records-manager.js
node scripts/audit-smoke-tests.mjs
```

Expected: both commands exit 0.

---

#### Task 3: Fix Single Plus Delete Semantics

**Files:**
- Modify: `sidepanel/account-records-manager.js:4667-4713`
- Modify: `scripts/audit-smoke-tests.mjs`

- [x] **Step 1: Add smoke assertion**

Add this check in `checkStaticContracts()`:

```javascript
assertIncludes(
  accountRecords,
  "if (deleteStatus === 'free') {\n            setUpiCredentialMembershipPoolRows",
  'single Plus delete must not remove local backup pool rows'
);
```

- [x] **Step 2: Implement Free-only pool removal**

Keep tombstone writes for paid rows, but only remove local backup pool rows when deleting Free:

```javascript
deletedEmails.forEach((email) => disabledUpiCredentialMembershipEmails.delete(email));
if (deleteStatus === 'free') {
  setUpiCredentialMembershipPoolRows(
    upiCredentialMembershipPoolRows.filter((item) => !deletedSet.has(normalizeUpiCredentialMembershipEmail(item.email))),
    upiCredentialMembershipPoolSource
  );
}
```

- [x] **Step 3: Verify**

Run:

```powershell
node --check sidepanel/account-records-manager.js
node scripts/audit-smoke-tests.mjs
```

Expected: both commands exit 0.

---

#### Task 4: Clear Membership Running State On Unexpected Errors

**Files:**
- Modify: `background/upi-credential-membership-checker.js:3438-3485`
- Modify: `background/upi-credential-membership-checker.js:3500-3611`

- [x] **Step 1: Add single-account catch**

Add a `catch` before the existing `finally`:

```javascript
} catch (error) {
  const finishedAt = new Date().toISOString();
  const stopped = isMembershipStopError(error) || batchStopRequested;
  await saveResults({
    ...currentResults,
    items,
    running: false,
    updatedAt: finishedAt,
    finishedAt: stopped ? (currentResults.finishedAt || '') : finishedAt,
    stoppedAt: stopped ? finishedAt : (currentResults.stoppedAt || ''),
    flowStage: stopped ? currentResults.flowStage : '',
    flowStageEmail: stopped ? currentResults.flowStageEmail : '',
  }).catch(() => null);
  throw error;
} finally {
  batchRunning = false;
}
```

- [x] **Step 2: Lift batch state variables**

Before the batch `try`, define:

```javascript
let currentResults = null;
let items = [];
let source = '';
let credentials = [];
```

Then assign `source`, `credentials`, and `currentResults` inside the `try`.

- [x] **Step 3: Add batch catch**

Add a `catch` before the existing `finally`:

```javascript
} catch (error) {
  if (currentResults) {
    const finishedAt = new Date().toISOString();
    const stopped = isMembershipStopError(error) || batchStopRequested;
    await saveResults({
      ...currentResults,
      items,
      running: false,
      updatedAt: finishedAt,
      finishedAt: stopped ? '' : finishedAt,
      stoppedAt: stopped ? finishedAt : '',
      flowStage: stopped ? currentResults.flowStage : '',
      flowStageEmail: stopped ? currentResults.flowStageEmail : '',
      source,
      total: credentials.length,
      completed: items.length,
    }).catch(() => null);
  }
  throw error;
} finally {
  batchRunning = false;
}
```

- [x] **Step 4: Verify**

Run:

```powershell
node --check background/upi-credential-membership-checker.js
```

Expected: command exits 0.

---

#### Task 5: Restore Missing Sidepanel Entrypoints

**Files:**
- Modify: `sidepanel/sidepanel.html:365-419`
- Modify: `sidepanel/sidepanel.js:4152-4155`
- Modify: `sidepanel/sidepanel.css`
- Modify: `scripts/audit-smoke-tests.mjs`

- [x] **Step 1: Restore CDK status refresh button**

Add this button in the UPI CDK toolbar:

```html
<button id="btn-upi-redeem-cdkey-status-refresh" class="btn btn-outline btn-sm" type="button">刷新全部状态</button>
```

- [x] **Step 2: Restore backup/member utility buttons**

Add this toolbar after `input-upi-credential-membership-txt`:

```html
<div class="data-inline upi-credential-backup-actions">
  <button id="btn-show-upi-credential-backups" class="btn btn-ghost btn-xs" type="button">查看全部已存密码2FA</button>
  <button id="btn-export-upi-credential-backups" class="btn btn-ghost btn-xs" type="button">导出当前 CDK 成功密码2FA</button>
  <button id="btn-export-upi-redeem-success-records" class="btn btn-ghost btn-xs" type="button">导出已开通会员密码2FA</button>
  <button id="btn-check-upi-credential-membership-local" class="btn btn-ghost btn-xs" type="button">核验启用已存备份</button>
  <button id="btn-import-upi-credential-membership-txt" class="btn btn-ghost btn-xs" type="button">导入备份TXT并核验</button>
  <button id="btn-import-upi-credential-membership-free-txt" class="btn btn-ghost btn-xs" type="button">导入 Free TXT</button>
  <button id="btn-stop-upi-credential-membership-check" class="btn btn-danger btn-xs" type="button">停止核验</button>
</div>
```

- [x] **Step 3: Keep refresh label stable**

Set the post-refresh button text to:

```javascript
btnUpiRedeemCdkeyStatusRefresh.textContent = '刷新全部状态';
```

- [x] **Step 4: Add wrap styling**

Add:

```css
.upi-credential-backup-actions {
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0 8px;
}

.upi-credential-backup-actions .btn {
  flex: 0 0 auto;
}
```

- [x] **Step 5: Verify**

Run:

```powershell
node --check sidepanel/sidepanel.js
node scripts/audit-smoke-tests.mjs
```

Expected: both commands exit 0 and all required HTML IDs exist.

---

#### Task 6: Update Documentation Drift

**Files:**
- Modify: `README.md`
- Modify: `项目文件结构说明.md`
- Modify: `项目完整链路说明.md`
- Modify: `scripts/audit-smoke-tests.mjs`

- [x] **Step 1: Update README**

Document these facts:

```text
Free 组共用；UPI/IDEAL 双 CDK 池；UPI Plus/IDEAL Plus 分组；第 7 步资格通过后有可用 CDK 时会自动提交兑换；远端等待状态 5 秒刷新。
```

- [x] **Step 2: Update structure and flow docs**

Replace stale `UPI-only` wording with CDK 双渠道 wording, and describe:

```text
UPI 只有明确今日提交次数上限才进入 IDEAL 候选；IDEAL 失败满 3 次封存；Plus 删除只隐藏渠道绑定，不删除本地密码/2FA 备份。
```

- [x] **Step 3: Verify smoke warnings disappear**

Run:

```powershell
node scripts/audit-smoke-tests.mjs
```

Expected: command exits 0 with `0 warning(s)`.

---

#### Task 7: Final Verification

**Files:**
- Verify only.

- [x] **Step 1: Run full syntax check**

Run:

```powershell
$failed=@()
git ls-files '*.js' '*.mjs' | ForEach-Object {
  node --check $_
  if ($LASTEXITCODE -ne 0) { $failed += $_ }
}
if ($failed.Count) { throw "FAILED: $($failed -join ', ')" }
```

Expected: no failed files.

- [x] **Step 2: Validate JSON files**

Run:

```powershell
node -e "const fs=require('fs'); for (const f of ['manifest.json','package.json','rules.json']) { JSON.parse(fs.readFileSync(f,'utf8')); console.log(f+': valid JSON'); }"
```

Expected:

```text
manifest.json: valid JSON
package.json: valid JSON
rules.json: valid JSON
```

- [x] **Step 3: Run smoke tests**

Run:

```powershell
node scripts/audit-smoke-tests.mjs
```

Expected:

```text
PASS audit smoke checks completed with 0 warning(s).
```

- [x] **Step 4: Inspect git status**

Run:

```powershell
git status --short
```

Expected: only intentional source/doc/test changes plus `.codex-backups` ignored by `.gitignore`.

---

### Self-Review

- Spec coverage: backup, channel-specific continuation, Plus deletion, running-state cleanup, missing sidepanel entrypoints, docs drift, and smoke tests are all mapped to tasks.
- Placeholder scan: no `TBD`, no generic “add tests” without commands, no unresolved file names.
- Type consistency: existing project names are preserved: `redeemChannel`, `getEnabledFreeUpiCredentialMembershipRowsForChannel`, `redeemPlusDeletedEmailsByChannel`, `running`, `stoppedAt`.

---

<a id="2026-07-04-code-splitting-plan"></a>

<!-- archived-from: docs/superpowers/plans/2026-07-04-code-splitting-plan.md -->

## Code Splitting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the largest extension files into focused modules without changing user-visible behavior.

**Architecture:** Keep the current Chrome MV3 no-bundler architecture. Sidepanel modules continue to attach factories on `window`, and background modules continue to load through `importScripts`; the entry files become composition roots rather than feature containers.

**Tech Stack:** Plain JavaScript, Chrome Extension MV3, `importScripts`, ordered `<script>` tags, Node syntax checks, existing smoke tests.

---

### Current Hotspots

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

#### Task 1: Add Size Guard And Baseline Report

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

#### Task 2: Extract Sidepanel Download Service

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

#### Task 3: Extract Sidepanel CDK Pool Manager

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

#### Task 4: Extract Settings Import/Export Manager

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

#### Task 5: Split Background Settings And Flow Definition Helpers

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

#### Task 6: Split CDK/Redeem Domain Helpers From Membership Checker

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

#### Task 7: Split `content/signup-page.js` By Auth Page Domain

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

#### Task 8: CSS Split After JS Boundaries Stabilize

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

### Execution Order

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

### Final Verification

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

### Self-Review

- Spec coverage: The plan identifies current large files, prioritizes the worst concentration points, and gives a staged refactor path.
- Placeholder scan: No task depends on an unnamed future module; every new file has a concrete public API.
- Type consistency: Sidepanel modules use the existing `globalScope.SidepanelX = { createX }` pattern; background modules use existing `self.MultiPageX` globals; content scripts use `self.MultiPageSignupX` globals.

---

<a id="2026-07-05-no-2fa-free-route-implementation"></a>

<!-- archived-from: docs/superpowers/plans/2026-07-05-no-2fa-free-route-implementation.md -->

## No-2FA Free Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a selectable no-2FA registration route that writes trial-eligible accounts to Free with `email---verificationUrl---accessToken---timestamp`.

**Architecture:** Keep the existing full 2FA workflow unchanged. Add a persisted `registrationFreeRoute` setting that makes `data/step-definitions.js` return either the current 7-step workflow or a no-2FA workflow that replaces steps 6/7 with one background finalization node. Reuse the existing ChatGPT session reader and `checkRegistrationUpiTrialEligibility()`/`upsertTrialEligibleFreeCredential()` path so eligibility and Free writes stay centralized.

**Tech Stack:** Chrome MV3 extension, vanilla JavaScript, background service worker modules, sidepanel DOM UI, Node syntax/audit scripts.

---

### File Structure

- Modify `data/step-definitions.js`
  - Owns the full 2FA vs no-2FA workflow shape.
  - Adds route constants and the `persist-no-2fa-free` node.
- Modify `sidepanel/sidepanel.html`
  - Adds a visible route selector in the main settings area.
- Modify `sidepanel/sidepanel.js`
  - Reads/writes `registrationFreeRoute`.
  - Rebuilds visible steps when the selector changes.
  - Saves the setting with other persistent settings.
- Modify `background.js`
  - Adds persisted default/normalization for `registrationFreeRoute`.
  - Registers the new background executor.
  - Passes dependencies needed by the executor.
- Create `background/steps/no-2fa-free-route.js`
  - Performs the no-2FA route finalization after step 5.
  - Reads ChatGPT session, resolves email, resolves verification URL, checks eligibility, writes Free.
- Modify `background/upi-credential-membership-checker.js`
  - Preserves `verificationUrl`, `recordedAt`, `twoFactorEnabled`, `gptPassword`/empty password semantics on Free rows.
  - Exports no-2FA Free rows as `email---verificationUrl---accessToken---recordedAt`.
- Modify `background/steps/upi-redeem.js`
  - Extends `buildCurrentUpiCredentialForMembership()` and `checkRegistrationUpiTrialEligibility()` input handling so no-2FA metadata is passed through.
- Modify `Release.md`, `manifest.json`, `sidepanel/sidepanel.html` after implementation if the user asks to publish a version.

---

#### Task 1: Add Route Setting And Workflow Shape

**Files:**
- Modify: `data/step-definitions.js:4-86`
- Modify: `background.js:809-850`, `background.js:2600-2878`
- Modify: `sidepanel/sidepanel.html:318-326`
- Modify: `sidepanel/sidepanel.js:180-200`, `sidepanel/sidepanel.js:554-591`, `sidepanel/sidepanel.js:628-727`, `sidepanel/sidepanel.js:2640-2690`, `sidepanel/sidepanel.js:4800-4890`, `sidepanel/sidepanel.js:10070-10150`

- [ ] **Step 1: Add route constants and a failing workflow check**

Create a temporary check command that should fail before implementation:

```powershell
node -e "const fs=require('fs'); const vm=require('vm'); const src=fs.readFileSync('data/step-definitions.js','utf8'); const ctx={}; vm.createContext(ctx); vm.runInContext(src,ctx); const defs=ctx.MultiPageStepDefinitions; const full=defs.getNodes({registrationFreeRoute:'full-2fa'}).map(n=>n.nodeId); const no=defs.getNodes({registrationFreeRoute:'no-2fa-free'}).map(n=>n.nodeId); if (!full.includes('enable-totp-mfa')) throw new Error('full route missing enable-totp-mfa'); if (no.includes('set-gpt-password') || no.includes('enable-totp-mfa')) throw new Error('no-2fa route still includes password/2FA'); if (!no.includes('persist-no-2fa-free')) throw new Error('no-2fa route missing finalization node'); console.log('PASS route workflow check');"
```

Expected before implementation: FAIL with `no-2fa route still includes password/2FA` or `missing finalization node`.

- [ ] **Step 2: Implement route-aware step definitions**

In `data/step-definitions.js`, add constants near the top:

```javascript
const REGISTRATION_FREE_ROUTE_FULL_2FA = 'full-2fa';
const REGISTRATION_FREE_ROUTE_NO_2FA = 'no-2fa-free';
```

Add:

```javascript
function normalizeRegistrationFreeRoute(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === REGISTRATION_FREE_ROUTE_NO_2FA
    ? REGISTRATION_FREE_ROUTE_NO_2FA
    : REGISTRATION_FREE_ROUTE_FULL_2FA;
}
```

Add a second workflow:

```javascript
const NO_2FA_FREE_STEP_DEFINITIONS = Object.freeze([
  ...UPI_STEP_DEFINITIONS.filter((step) => Number(step.id) <= 5),
  {
    id: 6,
    order: 60,
    key: 'persist-no-2fa-free',
    title: '免 2FA 检测资格并进入 Free',
    sourceId: 'chatgpt',
    driverId: null,
    command: 'persist-no-2fa-free',
  },
]);
```

Change `getSteps(options = {})` to:

```javascript
function getSteps(options = {}) {
  const flowId = normalizeActiveFlowId(options?.activeFlowId, DEFAULT_ACTIVE_FLOW_ID);
  const route = normalizeRegistrationFreeRoute(options?.registrationFreeRoute);
  const steps = route === REGISTRATION_FREE_ROUTE_NO_2FA
    ? NO_2FA_FREE_STEP_DEFINITIONS
    : UPI_STEP_DEFINITIONS;
  return cloneSteps(steps, options, flowId);
}
```

Export the new constants and normalizer from the returned object.

- [ ] **Step 3: Persist `registrationFreeRoute` in background state**

In `background.js`, add default:

```javascript
registrationFreeRoute: 'full-2fa',
```

Add a normalizer near persistent setting normalization:

```javascript
function normalizeRegistrationFreeRoute(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'no-2fa-free' ? 'no-2fa-free' : 'full-2fa';
}
```

In `normalizePersistentSettingValue`, add:

```javascript
case 'registrationFreeRoute':
  return normalizeRegistrationFreeRoute(value);
```

- [ ] **Step 4: Add sidepanel route selector**

In `sidepanel/sidepanel.html`, near the current `row-totp-mfa-after-profile-enabled`, add:

```html
<div class="data-row" id="row-registration-free-route">
  <span class="data-label">主流程路线</span>
  <select id="select-registration-free-route" class="data-input">
    <option value="full-2fa">完整 2FA 路线</option>
    <option value="no-2fa-free">免 2FA Free 路线</option>
  </select>
</div>
```

Keep `row-totp-mfa-after-profile-enabled` untouched for compatibility, but do not use it as the new route selector.

- [ ] **Step 5: Wire selector into sidepanel state and workflow refresh**

In `sidepanel/sidepanel.js`, add DOM ref:

```javascript
const selectRegistrationFreeRoute = document.getElementById('select-registration-free-route');
```

Add constants:

```javascript
const REGISTRATION_FREE_ROUTE_FULL_2FA = 'full-2fa';
const REGISTRATION_FREE_ROUTE_NO_2FA = 'no-2fa-free';
const DEFAULT_REGISTRATION_FREE_ROUTE = REGISTRATION_FREE_ROUTE_FULL_2FA;
```

Add:

```javascript
function normalizeRegistrationFreeRoute(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === REGISTRATION_FREE_ROUTE_NO_2FA
    ? REGISTRATION_FREE_ROUTE_NO_2FA
    : REGISTRATION_FREE_ROUTE_FULL_2FA;
}

function getSelectedRegistrationFreeRoute(state = latestState) {
  return normalizeRegistrationFreeRoute(selectRegistrationFreeRoute?.value || state?.registrationFreeRoute);
}
```

Pass `registrationFreeRoute` into every `getStepDefinitionsForMode()`, `getWorkflowNodesForMode()`, and `syncWorkflowDefinitions()` options object that already passes `totpMfaAfterProfileEnabled`.

When applying state to UI:

```javascript
if (selectRegistrationFreeRoute) {
  selectRegistrationFreeRoute.value = normalizeRegistrationFreeRoute(normalizedState?.registrationFreeRoute);
}
```

When saving settings, include:

```javascript
registrationFreeRoute: getSelectedRegistrationFreeRoute(latestState),
```

Add a `change` listener:

```javascript
selectRegistrationFreeRoute?.addEventListener('change', () => {
  const registrationFreeRoute = getSelectedRegistrationFreeRoute(latestState);
  syncWorkflowDefinitions(latestState.plusModeEnabled, {
    ...latestState,
    registrationFreeRoute,
  });
  syncLatestState({ registrationFreeRoute });
  saveSettings({ silent: true });
  renderWorkflow();
});
```

- [ ] **Step 6: Run route checks**

Run:

```powershell
node -e "const fs=require('fs'); const vm=require('vm'); const src=fs.readFileSync('data/step-definitions.js','utf8'); const ctx={}; vm.createContext(ctx); vm.runInContext(src,ctx); const defs=ctx.MultiPageStepDefinitions; const full=defs.getNodes({registrationFreeRoute:'full-2fa'}).map(n=>n.nodeId); const no=defs.getNodes({registrationFreeRoute:'no-2fa-free'}).map(n=>n.nodeId); if (!full.includes('set-gpt-password') || !full.includes('enable-totp-mfa')) throw new Error('full route changed'); if (no.includes('set-gpt-password') || no.includes('enable-totp-mfa')) throw new Error('no-2fa route includes password/2FA'); if (!no.includes('persist-no-2fa-free')) throw new Error('no-2fa route missing finalization node'); console.log('PASS route workflow check');"
node --check data/step-definitions.js
node --check sidepanel/sidepanel.js
node --check background.js
```

Expected: all PASS/no output for `node --check`.

- [ ] **Step 7: Commit**

```powershell
git add data/step-definitions.js sidepanel/sidepanel.html sidepanel/sidepanel.js background.js
git commit -m "feat: add registration free route selector"
```

---

#### Task 2: Implement No-2FA Free Finalization Executor

**Files:**
- Create: `background/steps/no-2fa-free-route.js`
- Modify: `background.js:1-45`, `background.js:13550-13673`, `background.js:13760-13823`
- Modify: `background/steps/upi-redeem.js:724-744`, `background/steps/upi-redeem.js:3019-3118`

- [ ] **Step 1: Write a static failing check for executor registration**

Run before implementation:

```powershell
node -e "const fs=require('fs'); const bg=fs.readFileSync('background.js','utf8'); if (!bg.includes('background/steps/no-2fa-free-route.js')) throw new Error('missing import'); if (!bg.includes(\"'persist-no-2fa-free'\")) throw new Error('missing executor map key'); console.log('PASS no-2fa executor registration');"
```

Expected before implementation: FAIL.

- [ ] **Step 2: Create executor module**

Create `background/steps/no-2fa-free-route.js`:

```javascript
(function attachNo2faFreeRouteExecutor(root, factory) {
  root.MultiPageBackgroundNo2faFreeRoute = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createNo2faFreeRouteModule() {
  function normalizeString(value = '') {
    return String(value || '').trim();
  }

  function normalizeEmail(value = '') {
    return normalizeString(value).toLowerCase();
  }

  function normalizeTimestamp(value, fallback = Date.now()) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : Math.floor(Number(fallback) || Date.now());
  }

  function createNo2faFreeRouteExecutor(deps = {}) {
    const {
      addLog = async () => {},
      checkRegistrationUpiTrialEligibility = null,
      completeNodeFromBackground = async () => {},
      getState = async () => ({}),
      getCustomEmailPoolEntries = null,
      readCurrentChatGptSessionForExport = null,
      setState = async () => {},
      throwIfStopped = () => {},
    } = deps;

    async function addStepLog(message, level = 'info') {
      return addLog(message, level, {
        step: 6,
        stepKey: 'persist-no-2fa-free',
        nodeId: 'persist-no-2fa-free',
      });
    }

    function resolveVerificationUrl(state = {}, email = '') {
      const direct = normalizeString(state.verificationUrl || state.emailVerificationUrl || state.currentVerificationUrl);
      if (direct) return direct;
      const entries = typeof getCustomEmailPoolEntries === 'function'
        ? getCustomEmailPoolEntries(state)
        : [];
      const normalizedEmail = normalizeEmail(email);
      const matched = entries.find((entry) => normalizeEmail(entry?.email) === normalizedEmail);
      return normalizeString(matched?.verificationUrl || matched?.url);
    }

    async function executeNo2faFreeRoute(state = {}) {
      throwIfStopped();
      const latestState = {
        ...(await getState().catch(() => ({}))),
        ...(state || {}),
      };
      await addStepLog('免 2FA Free 路线：第 5 步完成，开始读取邮箱、取码链接和 AT。', 'info');
      if (typeof readCurrentChatGptSessionForExport !== 'function') {
        throw new Error('免 2FA Free 路线缺少 ChatGPT SESSION 读取能力。');
      }
      if (typeof checkRegistrationUpiTrialEligibility !== 'function') {
        throw new Error('免 2FA Free 路线缺少 UPI 试用资格检测能力。');
      }

      const sessionResult = await readCurrentChatGptSessionForExport();
      const session = sessionResult.session || {};
      const accessToken = normalizeString(sessionResult.accessToken || session.accessToken);
      const email = normalizeEmail(session?.user?.email || latestState.email || latestState.registrationEmailState?.current);
      if (!email) {
        throw new Error('免 2FA Free 路线未读取到当前 ChatGPT 邮箱。');
      }
      if (!accessToken) {
        throw new Error(`免 2FA Free 路线未读取到 ${email} 的 AT，账号未进入 Free。`);
      }
      const verificationUrl = resolveVerificationUrl(latestState, email);
      if (!verificationUrl) {
        throw new Error(`免 2FA Free 路线未找到 ${email} 的邮箱取码链接，账号未进入 Free。`);
      }
      const recordedAt = normalizeTimestamp(latestState.no2faFreeRecordedAt);
      await setState({
        email,
        verificationUrl,
        no2faFreeRecordedAt: recordedAt,
        upiRedeemAccessToken: accessToken,
      });

      const eligibility = await checkRegistrationUpiTrialEligibility({
        state: latestState,
        email,
        session,
        accessToken,
        visibleStep: 6,
        patch: {
          email,
          verificationUrl,
          recordedAt,
          no2faFreeRoute: true,
          twoFactorEnabled: false,
          password: '',
          gptPassword: '',
          totpMfaSecret: '',
        },
      });
      if (!eligibility?.eligible) {
        throw new Error(`免 2FA Free 路线：账号未通过 UPI 试用资格检测，未进入 Free：${eligibility?.reason || '未知原因'}`);
      }
      await addStepLog(`免 2FA Free 路线：已检测到 UPI 试用资格，写入 Free：${email}。`, 'ok');
      await completeNodeFromBackground('persist-no-2fa-free', {
        email,
        accessToken,
        verificationUrl,
        recordedAt,
        trialEligibilityStatus: 'eligible',
      });
      return eligibility;
    }

    return {
      executeNo2faFreeRoute,
      resolveVerificationUrl,
    };
  }

  return {
    createNo2faFreeRouteExecutor,
  };
});
```

- [ ] **Step 3: Register executor in `background.js`**

Add to `BACKGROUND_SCRIPT_FILES` near other step files:

```javascript
'background/steps/no-2fa-free-route.js',
```

Create executor after `upiRedeemExecutor` dependencies are available:

```javascript
const no2faFreeRouteExecutor = self.MultiPageBackgroundNo2faFreeRoute?.createNo2faFreeRouteExecutor({
  addLog,
  checkRegistrationUpiTrialEligibility: (...args) => upiRedeemExecutor.checkRegistrationUpiTrialEligibility(...args),
  completeNodeFromBackground,
  getCustomEmailPoolEntries,
  getState,
  readCurrentChatGptSessionForExport,
  setState,
  throwIfStopped,
});
```

Add to `stepExecutorsByKey`:

```javascript
'persist-no-2fa-free': (state) => no2faFreeRouteExecutor.executeNo2faFreeRoute(state),
```

- [ ] **Step 4: Pass no-2FA metadata through eligibility write**

In `background/steps/upi-redeem.js`, extend `buildCurrentUpiCredentialForMembership()`:

```javascript
verificationUrl: normalizeString(state.verificationUrl || state.emailVerificationUrl || ''),
recordedAt: Math.max(0, Math.floor(Number(state.recordedAt || state.no2faFreeRecordedAt) || 0)),
twoFactorEnabled: state.twoFactorEnabled === true || Boolean(state.totpMfaSecret || state.totpSecret),
no2faFreeRoute: state.no2faFreeRoute === true,
```

In `checkRegistrationUpiTrialEligibility()`, when calling `upsertTrialEligibleFreeCredential`, pass:

```javascript
verificationUrl: normalizeString(patch.verificationUrl || runtimeState.verificationUrl || ''),
recordedAt: Math.max(0, Math.floor(Number(patch.recordedAt || runtimeState.no2faFreeRecordedAt) || Date.now())),
twoFactorEnabled: patch.twoFactorEnabled === true,
no2faFreeRoute: patch.no2faFreeRoute === true,
```

- [ ] **Step 5: Run executor checks**

```powershell
node -e "const fs=require('fs'); const bg=fs.readFileSync('background.js','utf8'); if (!bg.includes('background/steps/no-2fa-free-route.js')) throw new Error('missing import'); if (!bg.includes(\"'persist-no-2fa-free'\")) throw new Error('missing executor map key'); const step=fs.readFileSync('background/steps/no-2fa-free-route.js','utf8'); if (!step.includes('createNo2faFreeRouteExecutor')) throw new Error('missing factory'); console.log('PASS no-2fa executor registration');"
node --check background/steps/no-2fa-free-route.js
node --check background/steps/upi-redeem.js
node --check background.js
```

Expected: all PASS/no output for `node --check`.

- [ ] **Step 6: Commit**

```powershell
git add background.js background/steps/no-2fa-free-route.js background/steps/upi-redeem.js
git commit -m "feat: persist no-2fa free route accounts"
```

---

#### Task 3: Preserve No-2FA Free Fields In Result Storage

**Files:**
- Modify: `background/upi-credential-membership-checker.js:953-1022`, `background/upi-credential-membership-checker.js:1931-2097`

- [ ] **Step 1: Write a static failing check for fields**

```powershell
node -e "const fs=require('fs'); const src=fs.readFileSync('background/upi-credential-membership-checker.js','utf8'); for (const token of ['verificationUrl','recordedAt','no2faFreeRoute','twoFactorEnabled']) { if (!src.includes(token)) throw new Error('missing '+token); } console.log('PASS no-2fa fields present');"
```

Expected before implementation: FAIL for at least one field.

- [ ] **Step 2: Extend `normalizeResultItem()`**

Inside the `normalized` object returned by `normalizeResultItem(item)`, add:

```javascript
verificationUrl: normalizeString(item.verificationUrl || item.emailVerificationUrl || item.url),
recordedAt: Math.max(0, Math.floor(Number(item.recordedAt || item.no2faFreeRecordedAt) || 0)),
no2faFreeRoute: item.no2faFreeRoute === true,
twoFactorEnabled: item.twoFactorEnabled === true || Boolean(normalizeTotpSecret(item.totpMfaSecret)),
gptPassword: normalizeString(item.gptPassword || item.password),
```

Keep existing `password` behavior; do not require `password` for no-2FA records.

- [ ] **Step 3: Extend `upsertTrialEligibleFreeCredential()`**

Before building `nextItems`, compute:

```javascript
const verificationUrl = normalizeString(
  input.verificationUrl
  || credential.verificationUrl
  || credential.emailVerificationUrl
  || existingItem.verificationUrl
);
const recordedAt = Math.max(0, Math.floor(Number(
  input.recordedAt
  || credential.recordedAt
  || existingItem.recordedAt
  || Date.now()
) || Date.now()));
const no2faFreeRoute = input.no2faFreeRoute === true || credential.no2faFreeRoute === true || existingItem.no2faFreeRoute === true;
const twoFactorEnabled = input.twoFactorEnabled === true
  || credential.twoFactorEnabled === true
  || Boolean(credential.totpMfaSecret || input.totpMfaSecret || backupCredential.totpMfaSecret || existingItem.totpMfaSecret);
```

Add these fields to the object passed to `upsertResultItem()`:

```javascript
verificationUrl,
recordedAt,
no2faFreeRoute,
twoFactorEnabled,
gptPassword: normalizeString(credential.gptPassword || input.gptPassword || credential.password || input.password || backupCredential.password || existingItem.gptPassword || existingItem.password),
```

- [ ] **Step 4: Run checks**

```powershell
node -e "const fs=require('fs'); const src=fs.readFileSync('background/upi-credential-membership-checker.js','utf8'); for (const token of ['verificationUrl','recordedAt','no2faFreeRoute','twoFactorEnabled']) { if (!src.includes(token)) throw new Error('missing '+token); } console.log('PASS no-2fa fields present');"
node --check background/upi-credential-membership-checker.js
```

Expected: PASS/no syntax output.

- [ ] **Step 5: Commit**

```powershell
git add background/upi-credential-membership-checker.js
git commit -m "feat: preserve no-2fa free metadata"
```

---

#### Task 4: Export And Import No-2FA Free Rows

**Files:**
- Modify: `background/upi-credential-membership-checker.js:1143-1186`, `background/upi-credential-membership-checker.js:6252-6319`
- Modify: `sidepanel/account-records-manager.js:4455-4524`

- [ ] **Step 1: Add export format check**

Use a static check that should fail before export logic is changed:

```powershell
node -e "const fs=require('fs'); const src=fs.readFileSync('background/upi-credential-membership-checker.js','utf8'); if (!src.includes('verificationUrl') || !src.includes('recordedAt')) throw new Error('missing no-2fa export fields'); if (!src.includes('no2faFreeRoute')) throw new Error('missing no-2fa export branch'); console.log('PASS no-2fa export markers present');"
```

Expected before implementation: FAIL if no no-2FA branch exists.

- [ ] **Step 2: Change `buildResultExportRows()` free branch**

In `buildResultExportRows()`, replace the Free password/2FA requirement:

```javascript
if (normalizedStatus !== 'failed' && (!item.password || !item.totpMfaSecret)) return false;
```

with:

```javascript
if (normalizedStatus !== 'failed') {
  const no2faExportable = normalizedStatus === 'free'
    && item.no2faFreeRoute === true
    && item.email
    && item.verificationUrl
    && item.accessToken;
  const password2faExportable = Boolean(item.password && item.totpMfaSecret);
  if (!no2faExportable && !password2faExportable) return false;
}
```

Inside the `normalizedStatus === 'free'` map branch, use:

```javascript
if (item.no2faFreeRoute === true && item.verificationUrl && item.accessToken) {
  const timestamp = Math.max(0, Math.floor(Number(item.recordedAt) || Date.parse(item.checkedAt || '') || Date.now()));
  return `${item.email}---${item.verificationUrl}---${item.accessToken}---${timestamp}`;
}
const timestamp = item.trialEligibilityCheckedAt || item.checkedAt || item.accessTokenUpdatedAt || '';
return `${item.email}---${item.password}---${item.totpMfaSecret}---${item.accessToken || ''}---${timestamp}`;
```

- [ ] **Step 3: Allow export counting for no-2FA Free**

In `exportUpiCredentialMembershipCheckResults()`, replace:

```javascript
if (status !== 'failed' && !Boolean(item.email && item.password && item.totpMfaSecret)) return false;
```

with the same `no2faExportable || password2faExportable` condition from Step 2.

- [ ] **Step 4: Update file naming for Free export**

When exporting Free rows, keep existing filename unless all exported rows are no-2FA. If all exported rows contain `---http`/`---https` and 4 segments, use:

```javascript
free: 'upi-membership-free-email-url-at',
```

If mixed, keep `upi-membership-free-password-2fa` to avoid breaking old workflows.

- [ ] **Step 5: Add import parser support if import path rejects four segments**

If current import Free TXT parser rejects `email---url---AT---timestamp`, update it to recognize:

```javascript
const [email, verificationUrl, accessToken, recordedAt] = line.split('---');
```

Set:

```javascript
{
  email,
  verificationUrl,
  accessToken,
  recordedAt: Number(recordedAt) || Date.now(),
  no2faFreeRoute: true,
  twoFactorEnabled: false,
  password: '',
  totpMfaSecret: '',
}
```

The likely import path is in `background/upi-credential-membership-checker.js` around `parseCredentialBackupText()` and `checkUpiCredentialMembershipBatch()`.

- [ ] **Step 6: Run export/import checks**

```powershell
node -e "const fs=require('fs'); const src=fs.readFileSync('background/upi-credential-membership-checker.js','utf8'); for (const token of ['no2faFreeRoute','verificationUrl','recordedAt','accessToken']) { if (!src.includes(token)) throw new Error('missing '+token); } console.log('PASS no-2fa export/import markers present');"
node --check background/upi-credential-membership-checker.js
node --check sidepanel/account-records-manager.js
```

Expected: PASS/no syntax output.

- [ ] **Step 7: Commit**

```powershell
git add background/upi-credential-membership-checker.js sidepanel/account-records-manager.js
git commit -m "feat: export no-2fa free accounts"
```

---

#### Task 5: UI Display And Safety Labels

**Files:**
- Modify: `sidepanel/account-records-manager.js:1480-1780`, `sidepanel/account-records-manager.js:2300-2324`
- Modify: `sidepanel/sidepanel.js:7600-8300` if route-specific captions need refresh.

- [ ] **Step 1: Mark no-2FA rows in Free detail text**

In the row metadata builder that currently produces Free row details, add a label when `row.no2faFreeRoute === true`:

```javascript
const no2faLabel = row.no2faFreeRoute === true ? '免 2FA Free' : '';
```

Include it in detail/title parts only when non-empty.

- [ ] **Step 2: Ensure missing AT rule remains unchanged**

Do not count no-2FA rows without `accessToken` as redeemable. The existing redeemable filters should continue to require `accessToken`.

Add a static assertion command:

```powershell
node -e "const fs=require('fs'); const src=fs.readFileSync('sidepanel/account-records-manager.js','utf8'); if (!/accessToken/.test(src)) throw new Error('missing AT checks'); console.log('PASS AT checks still present');"
```

- [ ] **Step 3: Add route-specific sidepanel caption**

Near the new route selector, add a caption in HTML or dynamic text:

```text
免 2FA Free 路线会在第 5 步后读取邮箱、取码链接和 AT，检测有试用资格后直接进入 Free。
```

Do not add marketing-style explanatory blocks elsewhere.

- [ ] **Step 4: Run checks**

```powershell
node --check sidepanel/account-records-manager.js
node --check sidepanel/sidepanel.js
```

- [ ] **Step 5: Commit**

```powershell
git add sidepanel/account-records-manager.js sidepanel/sidepanel.html sidepanel/sidepanel.js
git commit -m "feat: label no-2fa free route records"
```

---

#### Task 6: Regression Sweep And Release Prep

**Files:**
- Modify only if publishing: `manifest.json`, `sidepanel/sidepanel.html`, `Release.md`, `RELEASING.md`

- [ ] **Step 1: Run syntax sweep**

```powershell
$ErrorActionPreference = 'Stop'
$files = Get-ChildItem -Recurse -File -Include *.js,*.mjs | Where-Object { $_.FullName -notmatch '\\node_modules\\|\\release-artifacts\\|\\.git\\|\\.codegraph\\' }
foreach ($file in $files) { node --check $file.FullName | Out-Null }
"PASS node --check sweep ($($files.Count) files)"
```

Expected: `PASS node --check sweep (...)`.

- [ ] **Step 2: Run existing audits**

```powershell
node scripts/audit-smoke-tests.mjs
node scripts/audit-no-phone-sms.mjs
node scripts/audit-no-removed-network.mjs
```

Expected:

```text
PASS audit smoke checks completed with 0 warning(s).
No phone SMS signup remnants found.
No Removed Network remnants found.
```

- [ ] **Step 3: Manual smoke checklist**

Use the unpacked extension locally:

```text
1. Select 完整 2FA 路线.
2. Confirm workflow still shows 打开官网 -> 注册 -> 密码 -> 验证码 -> 资料 -> 设置 GPT 密码 -> 开通 2FA 并检测资格.
3. Select 免 2FA Free 路线.
4. Confirm workflow shows 打开官网 -> 注册 -> 密码 -> 验证码 -> 资料 -> 免 2FA 检测资格并进入 Free.
5. Run one account through step 5 on the no-2FA route.
6. Confirm logs say it reads email/link/AT and checks eligibility.
7. Confirm eligible account enters Free with AT and no 2FA secret.
8. Export Free and confirm row shape is email---verificationUrl---accessToken---timestamp.
9. Confirm UPI/IDEAL buttons count the no-2FA row only when AT exists.
```

- [ ] **Step 4: Commit any final fixes**

If validation changes files:

```powershell
git add <changed-files>
git commit -m "fix: stabilize no-2fa free route"
```

- [ ] **Step 5: Publish only after user asks**

When the user asks to publish, bump from the current version to the next patch version, then:

```powershell
git archive --format=zip --output=release-artifacts/cdk-redeem-only-extension-vNEXT.zip HEAD
git tag -a vNEXT -m "CDK Redeem Only VNEXT"
git push origin main
git push origin vNEXT
gh release create vNEXT release-artifacts/cdk-redeem-only-extension-vNEXT.zip --title "CDK Redeem Only VNEXT" --notes-file <notes-file> --latest
```

Also upload `tutorial.docx` if the Release should keep the tutorial asset.

---

### Self-Review

- Spec coverage: The plan covers the selectable route, no-2FA path after step 5, required eligibility check, Free record fields, four-part export format, import compatibility, UI labels, tests, and release steps.
- Placeholder scan: No task contains `TBD`, `TODO`, or unspecified “add appropriate handling” instructions.
- Type consistency: The route key is consistently `registrationFreeRoute`; allowed values are `full-2fa` and `no-2fa-free`; the new node key is consistently `persist-no-2fa-free`; Free metadata fields are `verificationUrl`, `accessToken`, `recordedAt`, `no2faFreeRoute`, and `twoFactorEnabled`.

---

<a id="2026-07-05-remove-removed-network-and-phone-sms"></a>

<!-- archived-from: docs/superpowers/plans/2026-07-05-remove-removed-network-and-phone-sms.md -->

## Remove Removed Network And Phone SMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the unused IP proxy pool / Removed Network feature first, then delete the phone SMS signup feature without breaking email signup, email verification, UPI/IDEAL redeem, export/import, or release packaging.

**Architecture:** Treat this as two independent removals. Phase A removes the already-disabled Removed Network runtime, routes, UI, settings, and compatibility fields. Phase B removes phone signup and SMS provider plumbing while keeping email verification scripts and shared activation utilities that are still used by the normal email registration flow.

**Tech Stack:** Chrome MV3 extension, plain JavaScript, background service worker modules, content scripts, sidepanel UI, Node syntax checks, repository smoke scripts.

---

### Scope Split

The selected items touch different subsystems:

- `先删 IP 代理池 / Removed Network`: low risk because the runtime is already disabled by `LEGACY_REMOVED_NETWORK_FEATURE_ENABLED = false`; deletion should be completed and committed first.
- `手机接码`: higher risk because the phone branch shares step 2, step 4, registration state, content script manifest entries, and verification helpers with email signup. Execute this only after the Removed Network commit is green.

Do not push to GitHub, update the version, build a zip, or publish a release during this plan unless the user explicitly asks after implementation.

### File Structure Map

#### Phase A: Removed Network / IP Proxy Pool

- Modify `background.js`
  - Remove Removed Network constants, default state keys, persisted settings, normalizers, runtime disable helpers, auto sync alarm handling, startup/install disable calls, and injected message-router dependencies.
- Modify `background/message-router.js`
  - Remove message handlers and dependency parameters for `RUN_REMOVED_NETWORK_AUTO_SYNC_NOW`, `REFRESH_REMOVED_NETWORK_POOL`, `SWITCH_REMOVED_NETWORK`, `CHANGE_REMOVED_NETWORK_EXIT`, and `PROBE_REMOVED_NETWORK_EXIT`.
- Modify `sidepanel/sidepanel.js`
  - Remove Removed Network state normalization, settings rendering, event listeners, data merge, import/export payload keys, and any visible IP proxy pool controls.
- Modify `sidepanel/styles/settings.css`
  - Remove CSS blocks used only by Removed Network controls.
- Modify `sidepanel/sidepanel.html`
  - Remove static Removed Network sections if present.
- Modify `scripts/audit-smoke-tests.mjs`
  - Remove any assertion that expects Removed Network controls or settings.
- Create `scripts/audit-no-removed-network.mjs`
  - Static regression check that fails if Removed Network identifiers remain in runtime/UI files.

#### Phase B: Phone SMS Signup

- Modify `manifest.json`
  - Remove `content/signup-phone-page.js` from content scripts.
  - Keep `content/signup-verification-page.js` unless implementation proves it is phone-only. It is also part of generic verification handling, so do not delete it blindly.
- Delete `content/signup-phone-page.js`
  - Remove only after manifest and background routes no longer reference it.
- Modify `content/activation-utils.js`
  - Remove phone-only helpers only if they are not called by email signup, email verification, or shared content script activation.
- Modify `shared/flow-capabilities.js`
  - Remove `SIGNUP_METHOD_PHONE`, phone capability flags, phone provider validation, and phone signup labels.
- Modify `background.js`
  - Remove phone/SMS provider constants, default state fields, provider factory wiring, `phoneVerificationHelpers`, and step dependencies for phone flows.
- Modify `background/steps/submit-signup-email.js`
  - Remove phone signup branch and ensure step 2 always routes to email registration.
- Modify `background/steps/fill-password.js`
  - Remove phone identity/password branch while preserving email password state.
- Modify `background/steps/fetch-signup-code.js`
  - Remove `executeSignupPhoneCodeStep()` and phone branch selection. Keep `executeSignupEmailVerificationStep()`.
- Modify `background/auto-run-controller.js`
  - Remove phone-specific failure handling, add-phone recovery, and phone supply exhaustion handling.
- Modify `background/message-router.js`
  - Remove phone-only messages if any remain after background cleanup.
- Modify `sidepanel/sidepanel.js`
  - Remove phone signup method controls, provider settings, phone wait/poll settings, and import/export keys for phone providers.
- Modify `sidepanel/sidepanel.html`
  - Remove static phone settings sections if present.
- Modify `sidepanel/styles/settings.css`
  - Remove phone-provider-only styles after confirming no shared settings style uses them.
- Modify `scripts/audit-smoke-tests.mjs`
  - Remove assertions that require phone signup content scripts.
- Create `scripts/audit-no-phone-sms.mjs`
  - Static regression check that fails if phone signup/SMS provider identifiers remain in runtime/UI files.

---

### Phase A: Remove Removed Network / IP Proxy Pool

#### Task A1: Add Removed Network Static Guard

**Files:**
- Create: `scripts/audit-no-removed-network.mjs`

- [ ] **Step 1: Create the failing audit script**

Create `scripts/audit-no-removed-network.mjs` with this exact content:

```javascript
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const checks = [
  {
    file: 'background.js',
    patterns: [
      /removedNetwork/i,
      /REMOVED_NETWORK/,
      /RemovedNetwork/,
      /legacy removed network/i,
      /switchRemovedNetwork/,
      /refreshRemovedNetworkPool/,
      /disableLegacyRemovedNetworkFeatureRuntime/,
    ],
  },
  {
    file: 'background/message-router.js',
    patterns: [
      /RUN_REMOVED_NETWORK_AUTO_SYNC_NOW/,
      /REFRESH_REMOVED_NETWORK_POOL/,
      /SWITCH_REMOVED_NETWORK/,
      /CHANGE_REMOVED_NETWORK_EXIT/,
      /PROBE_REMOVED_NETWORK_EXIT/,
      /removedNetwork/i,
    ],
  },
  {
    file: 'sidepanel/sidepanel.js',
    patterns: [
      /removedNetwork/i,
      /REMOVED_NETWORK/,
      /Removed Network/i,
      /IP\s*代理池/,
      /刷新代理池/,
      /切换出口/,
    ],
  },
  {
    file: 'sidepanel/sidepanel.html',
    patterns: [
      /removedNetwork/i,
      /removed-network/i,
      /Removed Network/i,
      /IP\s*代理池/,
    ],
  },
  {
    file: 'sidepanel/styles/settings.css',
    patterns: [
      /removed-network/i,
      /removedNetwork/i,
      /proxy-pool/i,
    ],
  },
  {
    file: 'scripts/audit-smoke-tests.mjs',
    patterns: [
      /removedNetwork/i,
      /REMOVED_NETWORK/,
      /Removed Network/i,
    ],
  },
];

const failures = [];

for (const check of checks) {
  const absolute = path.join(repoRoot, check.file);
  if (!fs.existsSync(absolute)) {
    continue;
  }
  const text = fs.readFileSync(absolute, 'utf8');
  const lines = text.split(/\r?\n/);
  for (const pattern of check.patterns) {
    lines.forEach((line, index) => {
      if (pattern.test(line)) {
        failures.push(`${check.file}:${index + 1}: ${pattern} :: ${line.trim()}`);
      }
    });
  }
}

if (failures.length) {
  console.error('Removed Network remnants found:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('No Removed Network remnants found.');
```

- [ ] **Step 2: Run audit and confirm it fails before deletion**

Run:

```powershell
node scripts/audit-no-removed-network.mjs
```

Expected: FAIL with one or more Removed Network matches. If it passes before deletion, inspect the file list because the audit is not covering the current code.

- [ ] **Step 3: Commit only after later tasks pass**

Do not commit this script alone. It should be committed with the deletion that makes it pass.

#### Task A2: Remove Removed Network Background State And Runtime

**Files:**
- Modify: `background.js`

- [ ] **Step 1: Remove constants**

Delete the Removed Network constants block from `background.js`. The block includes these identifiers:

```javascript
DEFAULT_REMOVED_NETWORK_SERVICE_URL
DEFAULT_REMOVED_NETWORK_SERVICE_TIMEOUT_MS
DEFAULT_REMOVED_NETWORK_AUTO_SYNC_ENABLED
DEFAULT_REMOVED_NETWORK_AUTO_SYNC_INTERVAL_MINUTES
DEFAULT_REMOVED_NETWORK_SWITCH_INTERVAL_MINUTES
DEFAULT_REMOVED_NETWORK_MODE
DEFAULT_REMOVED_NETWORK_PROTOCOL
DEFAULT_REMOVED_NETWORK_ROUTE
LEGACY_REMOVED_NETWORK_FEATURE_ENABLED
```

After deletion, run:

```powershell
node --check background.js
```

Expected: PASS.

- [ ] **Step 2: Remove default state keys**

Delete every `DEFAULT_STATE` field whose name starts with:

```javascript
removedNetwork
```

Also delete adjacent default fields that only exist to support Removed Network exit, pool, sync, or route state.

Run:

```powershell
node --check background.js
```

Expected: PASS. If a reference error appears, continue removing the matching runtime code in this task before moving on.

- [ ] **Step 3: Remove persisted settings keys**

Delete every Removed Network key from `PERSISTED_SETTING_KEYS` and settings migration helpers. Remove keys whose names start with:

```javascript
removedNetwork
```

Run:

```powershell
node --check background.js
```

Expected: PASS.

- [ ] **Step 4: Remove helper functions**

Delete the functions and any local-only helpers used only by them:

```javascript
normalizeRemovedNetworkServiceUrl
normalizeRemovedNetworkMode
normalizeRemovedNetworkProtocol
normalizeRemovedNetworkRoute
normalizeRemovedNetworkPool
normalizeRemovedNetworkExit
buildRemovedNetworkSettingsPatch
applyRemovedNetworkSettingsFromState
refreshRemovedNetworkPool
switchRemovedNetwork
changeRemovedNetworkExit
probeRemovedNetworkExit
runRemovedNetworkAutoSyncNow
scheduleRemovedNetworkAutoSyncAlarm
disableLegacyRemovedNetworkFeatureRuntime
```

If a name is not present, skip that exact name and remove the current equivalent found in the same Removed Network block.

Run:

```powershell
node --check background.js
```

Expected: PASS.

- [ ] **Step 5: Remove startup/install/alarm calls**

Delete startup/install/alarm code that calls Removed Network helpers. Specifically remove calls that mention:

```javascript
removedNetwork
REMOVED_NETWORK
disableLegacyRemovedNetworkFeatureRuntime
scheduleRemovedNetworkAutoSyncAlarm
```

Run:

```powershell
node --check background.js
```

Expected: PASS.

- [ ] **Step 6: Remove message-router dependencies**

When `createMessageRouter(...)` is called from `background.js`, remove dependency properties that only serve Removed Network:

```javascript
applyRemovedNetworkSettingsFromState
changeRemovedNetworkExit
probeRemovedNetworkExit
refreshRemovedNetworkPool
runRemovedNetworkAutoSyncNow
switchRemovedNetwork
```

Run:

```powershell
node --check background.js
```

Expected: PASS.

#### Task A3: Remove Removed Network Message Routes

**Files:**
- Modify: `background/message-router.js`

- [ ] **Step 1: Remove dependency destructuring**

Delete these dependency names from the router factory destructuring:

```javascript
applyRemovedNetworkSettingsFromState
changeRemovedNetworkExit
probeRemovedNetworkExit
refreshRemovedNetworkPool
runRemovedNetworkAutoSyncNow
switchRemovedNetwork
```

Run:

```powershell
node --check background/message-router.js
```

Expected: PASS or a clear reference error from routes that are removed in the next step.

- [ ] **Step 2: Remove route cases**

Delete message cases for:

```javascript
RUN_REMOVED_NETWORK_AUTO_SYNC_NOW
REFRESH_REMOVED_NETWORK_POOL
SWITCH_REMOVED_NETWORK
CHANGE_REMOVED_NETWORK_EXIT
PROBE_REMOVED_NETWORK_EXIT
```

After deletion, there should be no switch case, if-branch, or handler object key for those message types.

Run:

```powershell
node --check background/message-router.js
```

Expected: PASS.

- [ ] **Step 3: Remove Removed Network route helpers**

Delete small router-only helpers that exist solely to validate, normalize, or report Removed Network route responses.

Run:

```powershell
node --check background/message-router.js
node scripts/audit-no-removed-network.mjs
```

Expected: `message-router.js` syntax PASS. The audit can still fail because UI files are not cleaned yet.

#### Task A4: Remove Removed Network Sidepanel UI And State

**Files:**
- Modify: `sidepanel/sidepanel.js`
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/styles/settings.css`

- [ ] **Step 1: Remove sidepanel constants and local state**

Delete constants, cached DOM references, and local state keys in `sidepanel/sidepanel.js` that include:

```javascript
removedNetwork
REMOVED_NETWORK
removed-network
```

Run:

```powershell
node --check sidepanel/sidepanel.js
```

Expected: PASS or a clear reference error from UI render/event code removed in the next steps.

- [ ] **Step 2: Remove render functions**

Delete Removed Network render/update functions in `sidepanel/sidepanel.js`, including functions whose names contain:

```javascript
RemovedNetwork
removedNetwork
```

Keep generic settings rendering helpers if other settings sections call them.

Run:

```powershell
node --check sidepanel/sidepanel.js
```

Expected: PASS or a clear reference error from event listeners removed in the next step.

- [ ] **Step 3: Remove event listeners and background messages**

Delete event handlers and `chrome.runtime.sendMessage` calls in `sidepanel/sidepanel.js` for:

```javascript
RUN_REMOVED_NETWORK_AUTO_SYNC_NOW
REFRESH_REMOVED_NETWORK_POOL
SWITCH_REMOVED_NETWORK
CHANGE_REMOVED_NETWORK_EXIT
PROBE_REMOVED_NETWORK_EXIT
```

Run:

```powershell
node --check sidepanel/sidepanel.js
```

Expected: PASS.

- [ ] **Step 4: Remove static HTML section if present**

Search only `sidepanel/sidepanel.html` for:

```text
removedNetwork
removed-network
Removed Network
IP 代理池
```

If matches exist, delete the complete settings section that owns those IDs/classes. Do not delete neighboring settings cards.

Run:

```powershell
node --check sidepanel/sidepanel.js
```

Expected: PASS.

- [ ] **Step 5: Remove CSS selectors**

Delete CSS rules in `sidepanel/styles/settings.css` whose selectors contain:

```text
removed-network
removedNetwork
proxy-pool
```

If a CSS rule is shared with another settings component, split it by selector first, then delete only the Removed Network selector.

Run:

```powershell
node --check sidepanel/sidepanel.js
node scripts/audit-no-removed-network.mjs
```

Expected: syntax PASS. The audit should now fail only if import/export or smoke tests still mention Removed Network.

#### Task A5: Remove Removed Network Config Import/Export Compatibility

**Files:**
- Modify: `sidepanel/sidepanel.js`
- Modify: `background.js`
- Modify: `scripts/audit-smoke-tests.mjs`

- [ ] **Step 1: Remove export payload keys**

In `sidepanel/sidepanel.js`, remove every exported config key that starts with:

```javascript
removedNetwork
```

Exported settings files should no longer contain IP proxy pool or Removed Network settings.

Run:

```powershell
node --check sidepanel/sidepanel.js
```

Expected: PASS.

- [ ] **Step 2: Remove import merge keys**

In `sidepanel/sidepanel.js`, remove import merge logic for keys that start with:

```javascript
removedNetwork
```

Old configuration files may still contain those keys; the importer should ignore unknown fields instead of writing them into active state.

Run:

```powershell
node --check sidepanel/sidepanel.js
```

Expected: PASS.

- [ ] **Step 3: Remove background persistence**

In `background.js`, remove any persistence or state migration path that writes Removed Network fields back into storage.

Run:

```powershell
node --check background.js
```

Expected: PASS.

- [ ] **Step 4: Update smoke audit**

If `scripts/audit-smoke-tests.mjs` expects Removed Network text, IDs, message types, or config keys, delete those assertions.

Run:

```powershell
node scripts/audit-smoke-tests.mjs
node scripts/audit-no-removed-network.mjs
```

Expected: both PASS.

#### Task A6: Verify And Commit Removed Network Deletion

**Files:**
- Verify all files touched in Phase A.

- [ ] **Step 1: Run targeted syntax checks**

Run:

```powershell
node --check background.js
node --check background/message-router.js
node --check sidepanel/sidepanel.js
node --check scripts/audit-no-removed-network.mjs
```

Expected: all PASS.

- [ ] **Step 2: Run smoke checks**

Run:

```powershell
node scripts/audit-smoke-tests.mjs
node scripts/audit-no-removed-network.mjs
```

Expected: both PASS.

- [ ] **Step 3: Run full JavaScript syntax check**

Run:

```powershell
$failed = @()
git ls-files '*.js' '*.mjs' | ForEach-Object {
  if (Test-Path -LiteralPath $_) {
    node --check $_
    if ($LASTEXITCODE -ne 0) { $failed += $_ }
  }
}
if ($failed.Count) { throw "Syntax check failed: $($failed -join ', ')" }
```

Expected: command completes without throwing.

- [ ] **Step 4: Review diff**

Run:

```powershell
git diff -- background.js background/message-router.js sidepanel/sidepanel.js sidepanel/sidepanel.html sidepanel/styles/settings.css scripts/audit-smoke-tests.mjs scripts/audit-no-removed-network.mjs
```

Expected: diff contains only Removed Network deletion and the new audit script.

- [ ] **Step 5: Commit Phase A**

Run:

```powershell
git add background.js background/message-router.js sidepanel/sidepanel.js sidepanel/sidepanel.html sidepanel/styles/settings.css scripts/audit-smoke-tests.mjs scripts/audit-no-removed-network.mjs
git commit -m "refactor: remove Removed Network proxy pool"
```

Expected: commit succeeds.

---

### Phase B: Remove Phone SMS Signup

Execute Phase B only after Phase A is committed and all checks are green.

#### Task B1: Add Phone SMS Static Guard

**Files:**
- Create: `scripts/audit-no-phone-sms.mjs`

- [ ] **Step 1: Create the failing audit script**

Create `scripts/audit-no-phone-sms.mjs` with this exact content:

```javascript
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const checks = [
  {
    file: 'manifest.json',
    patterns: [
      /signup-phone-page\.js/,
    ],
  },
  {
    file: 'background.js',
    patterns: [
      /createPhoneVerificationHelpers/,
      /phoneVerificationHelpers/,
      /DEFAULT_FIVE_SIM_/,
      /DEFAULT_REMOVED_SMS_/,
      /DEFAULT_SMS_VERIFICATION_NUMBER_/,
      /DEFAULT_GRIZZLY/,
      /DEFAULT_PHONE_CODE_/,
      /signupPhone/,
      /accountIdentifierType.*phone/,
    ],
  },
  {
    file: 'background/steps/submit-signup-email.js',
    patterns: [
      /SIGNUP_METHOD_PHONE/,
      /signupPhone/,
      /phoneSignup/i,
      /accountIdentifierType.*phone/,
    ],
  },
  {
    file: 'background/steps/fill-password.js',
    patterns: [
      /SIGNUP_METHOD_PHONE/,
      /signupPhone/,
      /phoneSignup/i,
      /accountIdentifierType.*phone/,
    ],
  },
  {
    file: 'background/steps/fetch-signup-code.js',
    patterns: [
      /executeSignupPhoneCodeStep/,
      /completeSignupPhoneVerificationFlow/,
      /phoneVerificationHelpers/,
      /signupPhone/,
      /accountIdentifierType.*phone/,
    ],
  },
  {
    file: 'background/auto-run-controller.js',
    patterns: [
      /phoneSignup/i,
      /signupPhone/,
      /add-phone/,
      /phone supply/i,
      /accountIdentifierType.*phone/,
    ],
  },
  {
    file: 'shared/flow-capabilities.js',
    patterns: [
      /SIGNUP_METHOD_PHONE/,
      /supportsPhoneSignup/,
      /phoneVerificationEnabled/,
      /signupPhone/,
    ],
  },
  {
    file: 'sidepanel/sidepanel.js',
    patterns: [
      /SIGNUP_METHOD_PHONE/,
      /signupPhone/,
      /phoneProvider/i,
      /phoneCode/i,
      /5sim/i,
      /grizzlysms/i,
      /removedSms/i,
      /smsVerificationNumber/i,
    ],
  },
  {
    file: 'scripts/audit-smoke-tests.mjs',
    patterns: [
      /signup-phone-page\.js/,
      /SIGNUP_METHOD_PHONE/,
      /supportsPhoneSignup/,
    ],
  },
];

const failures = [];

for (const check of checks) {
  const absolute = path.join(repoRoot, check.file);
  if (!fs.existsSync(absolute)) {
    continue;
  }
  const text = fs.readFileSync(absolute, 'utf8');
  const lines = text.split(/\r?\n/);
  for (const pattern of check.patterns) {
    lines.forEach((line, index) => {
      if (pattern.test(line)) {
        failures.push(`${check.file}:${index + 1}: ${pattern} :: ${line.trim()}`);
      }
    });
  }
}

const deletedPhonePage = !fs.existsSync(path.join(repoRoot, 'content/signup-phone-page.js'));
if (!deletedPhonePage) {
  failures.push('content/signup-phone-page.js still exists');
}

if (failures.length) {
  console.error('Phone SMS signup remnants found:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('No phone SMS signup remnants found.');
```

- [ ] **Step 2: Run audit and confirm it fails before deletion**

Run:

```powershell
node scripts/audit-no-phone-sms.mjs
```

Expected: FAIL with phone/SMS matches.

#### Task B2: Remove Phone Signup Capability Flags

**Files:**
- Modify: `shared/flow-capabilities.js`
- Modify: `data/step-definitions.js`

- [ ] **Step 1: Remove phone signup constants**

Delete constants and exports for:

```javascript
SIGNUP_METHOD_PHONE
supportsPhoneSignup
phoneVerificationEnabled
```

Keep email signup capability and UPI/IDEAL redeem capability unchanged.

Run:

```powershell
node --check shared/flow-capabilities.js
node --check data/step-definitions.js
```

Expected: PASS or reference errors from call sites that are removed in following tasks.

- [ ] **Step 2: Force signup method resolution to email**

If `shared/flow-capabilities.js` has a method resolver, reduce it to email-only behavior:

```javascript
function resolveSignupMethod() {
  return 'email';
}
```

If this function is not exported, remove the resolver and update call sites to stop asking for phone mode.

Run:

```powershell
node --check shared/flow-capabilities.js
```

Expected: PASS.

- [ ] **Step 3: Remove phone step definitions**

In `data/step-definitions.js`, remove phone-only step labels and prerequisites. Keep the existing email registration steps and the UPI step 7 flow.

Run:

```powershell
node --check data/step-definitions.js
```

Expected: PASS.

#### Task B3: Remove Phone Branches From Registration Steps

**Files:**
- Modify: `background/steps/submit-signup-email.js`
- Modify: `background/steps/fill-password.js`
- Modify: `background/steps/fetch-signup-code.js`

- [ ] **Step 1: Remove step 2 phone branch**

In `background/steps/submit-signup-email.js`, delete branches that test phone signup mode or submit phone numbers. Step 2 should only submit an email identity.

Preserve the existing email flow behavior:

```javascript
// Step 2 remains email-only after this deletion.
// Keep the current email submission implementation and remove only phone-mode branches.
```

Run:

```powershell
node --check background/steps/submit-signup-email.js
```

Expected: PASS.

- [ ] **Step 2: Remove step 3 phone identity password handling**

In `background/steps/fill-password.js`, delete phone identity branches and keep email password handling.

After deletion, password state should only store an email identifier:

```javascript
accountIdentifierType: 'email'
```

Run:

```powershell
node --check background/steps/fill-password.js
```

Expected: PASS.

- [ ] **Step 3: Remove step 4 phone code flow**

In `background/steps/fetch-signup-code.js`, delete:

```javascript
executeSignupPhoneCodeStep
isPhoneSignupState
phoneVerificationHelpers dependency
resolveSignupMethod dependency
completeSignupPhoneVerificationFlow calls
```

Keep:

```javascript
executeSignupEmailVerificationStep
resolveCustomEmailVerificationStep
resolveVerificationStep
```

Run:

```powershell
node --check background/steps/fetch-signup-code.js
```

Expected: PASS.

#### Task B4: Remove Phone Provider Runtime From Background

**Files:**
- Modify: `background.js`
- Modify: `background/message-router.js`
- Modify: `background/auto-run-controller.js`

- [ ] **Step 1: Remove phone provider constants and default state**

In `background.js`, delete constants and state fields for:

```javascript
fiveSim
removedSms
removedSmsVendor
removedSmsVendorB
smsVerificationNumber
grizzlySms
removedTextPool
signupPhone
phoneCode
phoneVerification
```

Do not remove email provider constants or Assurivo/mail verification constants.

Run:

```powershell
node --check background.js
```

Expected: PASS or reference errors from helper wiring removed in the next step.

- [ ] **Step 2: Remove provider factories and helper wiring**

In `background.js`, delete:

```javascript
phoneVerificationHelpers
self.MultiPageBackgroundPhoneVerification?.createPhoneVerificationHelpers(...)
createFiveSimProvider
createRemovedSmsVendorBProvider
createRemovedSmsProvider
createRemovedSmsVendorProvider
createSmsVerificationNumberProvider
createGrizzlySmsProvider
createRemovedTextPoolProvider
```

Also remove script imports or module registrations for phone provider modules if present.

Run:

```powershell
node --check background.js
```

Expected: PASS.

- [ ] **Step 3: Remove phone dependencies passed into step executors**

In `background.js`, remove `phoneVerificationHelpers` and `resolveSignupMethod` dependencies when creating the step 2/3/4 executors if those dependencies are phone-only after Task B3.

Run:

```powershell
node --check background.js
```

Expected: PASS.

- [ ] **Step 4: Remove phone auto-run failure handling**

In `background/auto-run-controller.js`, delete phone-specific branches for add-phone pages, phone supply exhaustion, phone activation, and phone identity failure summaries.

Run:

```powershell
node --check background/auto-run-controller.js
```

Expected: PASS.

- [ ] **Step 5: Remove phone message routes**

In `background/message-router.js`, delete message routes and dependencies that exist only for phone provider testing, phone number allocation, phone code polling, or phone activation.

Run:

```powershell
node --check background/message-router.js
```

Expected: PASS.

#### Task B5: Remove Phone Content Script And Manifest Entry

**Files:**
- Modify: `manifest.json`
- Delete: `content/signup-phone-page.js`
- Modify: `content/activation-utils.js`
- Keep unless audited phone-only: `content/signup-verification-page.js`

- [ ] **Step 1: Remove manifest content script entry**

In `manifest.json`, remove the content script entry or file reference:

```json
"content/signup-phone-page.js"
```

Keep content scripts used by email registration and email verification.

Run:

```powershell
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"
```

Expected: prints `manifest ok`.

- [ ] **Step 2: Delete phone page content script**

Delete:

```text
content/signup-phone-page.js
```

Run:

```powershell
Test-Path -LiteralPath 'content/signup-phone-page.js'
```

Expected: `False`.

- [ ] **Step 3: Keep generic verification content script unless proven phone-only**

Inspect references to `content/signup-verification-page.js`. If email verification still uses it, keep the file and remove only phone-specific branches inside it.

Run:

```powershell
node --check content/signup-verification-page.js
```

Expected: PASS if the file remains.

- [ ] **Step 4: Clean shared activation helpers**

In `content/activation-utils.js`, delete phone-only helpers only after verifying they are not used by:

```text
content/signup-page.js
content/signup-verification-page.js
content/chatgpt-page.js
```

Run:

```powershell
node --check content/activation-utils.js
```

Expected: PASS.

#### Task B6: Remove Phone Sidepanel Settings And Import/Export Keys

**Files:**
- Modify: `sidepanel/sidepanel.js`
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/styles/settings.css`

- [ ] **Step 1: Remove phone provider settings UI**

In `sidepanel/sidepanel.js`, delete UI state, renderers, inputs, and event listeners for:

```javascript
fiveSim
removedSms
removedSmsVendor
removedSmsVendorB
smsVerificationNumber
grizzlySms
removedTextPool
signupPhone
phoneProvider
phoneCode
```

Run:

```powershell
node --check sidepanel/sidepanel.js
```

Expected: PASS or clear reference errors from import/export code removed in the next step.

- [ ] **Step 2: Remove phone config import/export keys**

In `sidepanel/sidepanel.js`, remove phone provider keys from exported configuration and imported configuration merge logic.

Old config files may still contain these fields; importer should ignore them as unknown fields after deletion.

Run:

```powershell
node --check sidepanel/sidepanel.js
```

Expected: PASS.

- [ ] **Step 3: Remove static phone HTML sections**

In `sidepanel/sidepanel.html`, delete settings sections whose IDs/classes/text are phone provider specific:

```text
phone
5sim
GrizzlySMS
Removed SMS
接码
手机号
```

Do not delete email provider settings, Assurivo settings, UPI/IDEAL CDK settings, or Free/Plus group UI.

Run:

```powershell
node --check sidepanel/sidepanel.js
```

Expected: PASS.

- [ ] **Step 4: Remove phone-only CSS**

In `sidepanel/styles/settings.css`, remove selectors used only by phone provider panels. Keep shared setting row/button styles.

Run:

```powershell
node --check sidepanel/sidepanel.js
```

Expected: PASS.

#### Task B7: Update Audits And Verify Phone Removal

**Files:**
- Modify: `scripts/audit-smoke-tests.mjs`
- Verify: `scripts/audit-no-phone-sms.mjs`

- [ ] **Step 1: Remove phone content script assertion**

In `scripts/audit-smoke-tests.mjs`, remove assertions that require:

```javascript
content/signup-phone-page.js
SIGNUP_METHOD_PHONE
supportsPhoneSignup
phoneVerificationEnabled
```

Keep assertions for email signup, email verification, UPI/IDEAL redeem, export/import, and sidepanel loading.

Run:

```powershell
node scripts/audit-smoke-tests.mjs
```

Expected: PASS.

- [ ] **Step 2: Run phone deletion audit**

Run:

```powershell
node scripts/audit-no-phone-sms.mjs
```

Expected: PASS.

- [ ] **Step 3: Run targeted syntax checks**

Run:

```powershell
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"
node --check background.js
node --check background/message-router.js
node --check background/auto-run-controller.js
node --check background/steps/submit-signup-email.js
node --check background/steps/fill-password.js
node --check background/steps/fetch-signup-code.js
node --check shared/flow-capabilities.js
node --check sidepanel/sidepanel.js
node --check content/signup-page.js
node --check content/signup-verification-page.js
node --check content/activation-utils.js
node --check scripts/audit-no-phone-sms.mjs
```

Expected: JSON parse prints `manifest ok`; all JavaScript files PASS.

- [ ] **Step 4: Run full syntax check**

Run:

```powershell
$failed = @()
git ls-files '*.js' '*.mjs' | ForEach-Object {
  if (Test-Path -LiteralPath $_) {
    node --check $_
    if ($LASTEXITCODE -ne 0) { $failed += $_ }
  }
}
if ($failed.Count) { throw "Syntax check failed: $($failed -join ', ')" }
```

Expected: command completes without throwing.

- [ ] **Step 5: Review diff**

Run:

```powershell
git diff -- manifest.json background.js background/message-router.js background/auto-run-controller.js background/steps/submit-signup-email.js background/steps/fill-password.js background/steps/fetch-signup-code.js shared/flow-capabilities.js sidepanel/sidepanel.js sidepanel/sidepanel.html sidepanel/styles/settings.css content/activation-utils.js content/signup-verification-page.js scripts/audit-smoke-tests.mjs scripts/audit-no-phone-sms.mjs
```

Expected: diff removes phone signup/SMS functionality only. It must not remove email verification, Assurivo, UPI/IDEAL CDK pools, Free/Plus groups, or export/import for remaining settings.

- [ ] **Step 6: Commit Phase B**

Run:

```powershell
git add manifest.json background.js background/message-router.js background/auto-run-controller.js background/steps/submit-signup-email.js background/steps/fill-password.js background/steps/fetch-signup-code.js shared/flow-capabilities.js sidepanel/sidepanel.js sidepanel/sidepanel.html sidepanel/styles/settings.css content/activation-utils.js content/signup-verification-page.js scripts/audit-smoke-tests.mjs scripts/audit-no-phone-sms.mjs
git add -u content/signup-phone-page.js
git commit -m "refactor: remove phone SMS signup flow"
```

Expected: commit succeeds.

---

### Final Verification After Both Phases

- [ ] **Step 1: Confirm worktree is clean**

Run:

```powershell
git status --short
```

Expected: no output.

- [ ] **Step 2: Confirm Removed Network audit is still green**

Run:

```powershell
node scripts/audit-no-removed-network.mjs
```

Expected: PASS.

- [ ] **Step 3: Confirm phone SMS audit is green**

Run:

```powershell
node scripts/audit-no-phone-sms.mjs
```

Expected: PASS.

- [ ] **Step 4: Confirm smoke tests are green**

Run:

```powershell
node scripts/audit-smoke-tests.mjs
```

Expected: PASS.

- [ ] **Step 5: Confirm full syntax is green**

Run:

```powershell
$failed = @()
git ls-files '*.js' '*.mjs' | ForEach-Object {
  if (Test-Path -LiteralPath $_) {
    node --check $_
    if ($LASTEXITCODE -ne 0) { $failed += $_ }
  }
}
if ($failed.Count) { throw "Syntax check failed: $($failed -join ', ')" }
```

Expected: command completes without throwing.

### Manual Smoke Checklist

- [ ] Extension sidepanel opens without console errors.
- [ ] Settings page no longer shows Removed Network, IP proxy pool, phone signup, or SMS provider controls.
- [ ] Exported configuration no longer contains Removed Network or phone SMS provider keys.
- [ ] Importing an old configuration with Removed Network/phone keys does not recreate the removed UI or crash.
- [ ] Email registration still reaches the email verification page.
- [ ] Assurivo/iCloud/custom email code fetching still works.
- [ ] Step 7 UPI eligibility check still writes eligible accounts to Free.
- [ ] UPI and IDEAL CDK pools still import, redeem, refresh, cancel, retry, and delete independently.
- [ ] Free/UPI Plus/IDEAL Plus grouping still renders correctly.

### Self-Review Notes

- Spec coverage: the plan deletes the selected `IP 代理池 / Removed Network` first and includes a separate phone SMS deletion phase.
- Boundary protection: the plan explicitly preserves email verification and does not blindly delete `content/signup-verification-page.js` or `content/activation-utils.js`.
- Verification: each phase has a static guard, syntax checks, smoke checks, diff review, and its own commit.

---

<a id="2026-07-06-codebase-decomposition-phase-three-plan"></a>

<!-- archived-from: docs/superpowers/plans/2026-07-06-codebase-decomposition-phase-three-plan.md -->

## Codebase Decomposition Phase Three Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continue reducing `background.js` and `sidepanel/sidepanel.js` while first fixing the small fallback-compatibility risk introduced by the previous auto-run normalizer extraction.

**Architecture:** Keep the existing Chrome MV3 no-bundler architecture. New browser files expose globals on `self.*` or `window.*`, and are loaded by ordered `importScripts(...)` or ordered `<script>` tags. Each task preserves existing wrapper function names in composition roots so current callers keep working while logic moves into focused modules.

**Tech Stack:** Plain JavaScript, Chrome Extension MV3 service worker, side panel DOM scripts, CommonJS `node:test` scripts, `node --check`, existing audit scripts.

---

### Execution Results

| Task | Result |
| --- | --- |
| Sidepanel normalizer fallback | Added regression tests and preserved legacy fallback defaults. |
| Background auto-run status | Extracted status payload and phase predicates into `background/bootstrap/auto-run-status.js`. |
| Sidepanel auto-run state | Extracted current auto-run state sync and pending run-count gate into `sidepanel/auto-run-state.js`; preserved nullish phase fallback semantics. |

### Current State

| File | Lines | Note |
| --- | ---: | --- |
| `background.js` | 15,901 | Still mixes auto-run status broadcasting, runtime orchestration, provider glue, and startup wiring. |
| `sidepanel/sidepanel.js` | 10,659 | Still mixes auto-run state sync, settings/event wiring, config actions, and top-level message handling. |
| `background/upi-credential-membership-checker.js` | 7,497 | Large but under current smoke warning threshold; leave for a later membership-focused pass. |
| `content/signup-page.js` | 6,820 | Large but already split into page detector/orchestrator helpers; leave for later. |

### File Structure For This Phase

Create or extend these focused modules:

- `scripts/test-sidepanel-auto-run-normalizers.cjs`: regression tests for sidepanel numeric normalizer fallback semantics.
- `sidepanel/auto-run-normalizers.js`: keep all sidepanel auto-run numeric setting normalizers here; preserve old fallback behavior exactly.
- `background/bootstrap/auto-run-status.js`: build and broadcast auto-run status payloads, plus auto-run phase predicates.
- `scripts/test-background-auto-run-status.cjs`: direct unit tests for background auto-run status payload and phase predicates.
- `sidepanel/auto-run-state.js`: sidepanel auto-run state model, pending start run-count gate, phase predicates, label generation, and source sync policy.
- `scripts/test-sidepanel-auto-run-state.cjs`: direct unit tests for sidepanel auto-run state sync and pending run-count behavior.
- `docs/superpowers/plans/2026-07-06-codebase-decomposition-phase-three-plan.md`: execution notes and final size snapshot.

Existing composition roots remain:

- `background.js`: imports modules, creates managers, and keeps compatibility wrappers.
- `sidepanel/sidepanel.js`: creates managers, delegates to them, and keeps compatibility wrappers.
- `sidepanel/sidepanel.html`: preserves ordered script loading.
- `scripts/audit-smoke-tests.mjs`: guards new modules and ordered loads.

### Non-Goals

- Do not change registration, trial eligibility, UPI/IDEAL redemption, Passkey/2FA route behavior, Free/Plus grouping, export formats, or GitHub release behavior.
- Do not introduce bundling, ES module conversion, TypeScript, or build tooling.
- Do not remove compatibility wrapper functions in `background.js` or `sidepanel/sidepanel.js` during this phase.

---

#### Task 1: Lock And Fix Sidepanel Auto-Run Normalizer Fallbacks

**Files:**
- Create: `scripts/test-sidepanel-auto-run-normalizers.cjs`
- Modify: `sidepanel/auto-run-normalizers.js`

- [ ] **Step 1: Add regression tests for old fallback behavior**

Create `scripts/test-sidepanel-auto-run-normalizers.cjs` with exactly this content:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

delete globalThis.SidepanelAutoRunNormalizers;
const normalizerModule = require('../sidepanel/auto-run-normalizers.js');

const normalizers = normalizerModule.createAutoRunNormalizers({
  autoDelayDefaultMinutes: 30,
  autoDelayMaxMinutes: 1440,
  autoDelayMinMinutes: 1,
  autoRunThreadIntervalDefaultMinutes: 0,
  autoRunThreadIntervalMaxMinutes: 1440,
  autoRunThreadIntervalMinMinutes: 0,
  autoStepDelayDefaultSeconds: 10,
  autoStepDelayMaxSeconds: 600,
  autoStepDelayMinSeconds: 0,
});

test('verification poll attempts keep legacy fallback defaults', () => {
  assert.equal(normalizers.normalizeRemovedContactVerificationPollAttempts('', 6), 6);
  assert.equal(normalizers.normalizeRemovedContactVerificationPollAttempts('bad', 6), 6);
  assert.equal(normalizers.normalizeRemovedContactVerificationPollAttempts('', 0), 6);
  assert.equal(normalizers.normalizeRemovedContactVerificationPollAttempts('bad', 0), 6);
  assert.equal(normalizers.normalizeRemovedContactVerificationPollAttempts('0', 6), 1);
  assert.equal(normalizers.normalizeRemovedContactVerificationPollAttempts('99', 6), 60);
});

test('verification poll interval keeps legacy fallback defaults', () => {
  assert.equal(normalizers.normalizeRemovedContactVerificationPollIntervalSeconds('', 5), 5);
  assert.equal(normalizers.normalizeRemovedContactVerificationPollIntervalSeconds('bad', 5), 5);
  assert.equal(normalizers.normalizeRemovedContactVerificationPollIntervalSeconds('', 0), 5);
  assert.equal(normalizers.normalizeRemovedContactVerificationPollIntervalSeconds('bad', 0), 5);
  assert.equal(normalizers.normalizeRemovedContactVerificationPollIntervalSeconds('0', 5), 1);
  assert.equal(normalizers.normalizeRemovedContactVerificationPollIntervalSeconds('99', 5), 60);
});

test('resend attempts and wait seconds keep zero-capable legacy fallback behavior', () => {
  assert.equal(normalizers.normalizeRemovedContactVerificationResendMaxAttempts('', 0), 0);
  assert.equal(normalizers.normalizeRemovedContactVerificationResendMaxAttempts('bad', 0), 0);
  assert.equal(normalizers.normalizeRemovedContactVerificationResendMaxAttempts('99', 1), 10);
  assert.equal(normalizers.normalizeRemovedContactResendWaitSeconds('', 0), 0);
  assert.equal(normalizers.normalizeRemovedContactResendWaitSeconds('bad', 0), 0);
  assert.equal(normalizers.normalizeRemovedContactResendWaitSeconds('999', 20), 300);
});
```

- [ ] **Step 2: Run the new test to verify it exposes the fallback gap**

Run:

```powershell
node --test scripts/test-sidepanel-auto-run-normalizers.cjs
```

Expected before the fix: at least the two cases with fallback `0` for poll attempts/interval fail because they return `1` instead of `6` / `5`.

- [ ] **Step 3: Preserve legacy fallback defaults in the normalizer module**

In `sidepanel/auto-run-normalizers.js`, replace the helper and the two polling functions with this implementation shape:

```javascript
function normalizeBoundedInteger(value, fallback, min, max, options = {}) {
  const rawValue = String(value ?? '').trim();
  const defaultFallback = options.defaultFallback;
  const fallbackSource = Number.isFinite(Number(fallback)) && Number(fallback) !== 0
    ? fallback
    : (defaultFallback !== undefined ? defaultFallback : fallback);
  const fallbackValue = Math.min(max, Math.max(min, Math.floor(Number(fallbackSource) || 0)));
  if (!rawValue && options.emptyAsFallback !== false) {
    return fallbackValue;
  }

  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) {
    return fallbackValue;
  }

  return Math.min(max, Math.max(min, Math.floor(numeric)));
}

function normalizeRemovedContactVerificationPollAttempts(value, fallback = 6) {
  return normalizeBoundedInteger(value, fallback, 1, 60, { defaultFallback: 6 });
}

function normalizeRemovedContactVerificationPollIntervalSeconds(value, fallback = 5) {
  return normalizeBoundedInteger(value, fallback, 1, 60, { defaultFallback: 5 });
}
```

Keep the other normalizer function names and exports unchanged.

- [ ] **Step 4: Verify the fix**

Run:

```powershell
node --check sidepanel/auto-run-normalizers.js
node --test scripts/test-sidepanel-auto-run-normalizers.cjs
node --test scripts/test-*.cjs
```

Expected: all commands exit `0`; total test count increases by 3 because of the new file.

- [ ] **Step 5: Commit**

```powershell
git add sidepanel/auto-run-normalizers.js scripts/test-sidepanel-auto-run-normalizers.cjs
git commit -m "test: lock sidepanel auto-run normalizers"
```

#### Task 2: Extract Background Auto-Run Status Payload Helpers

**Files:**
- Create: `background/bootstrap/auto-run-status.js`
- Create: `scripts/test-background-auto-run-status.cjs`
- Modify: `background.js`
- Modify: `scripts/audit-smoke-tests.mjs`

- [ ] **Step 1: Add unit tests for status payload and phase predicates**

Create `scripts/test-background-auto-run-status.cjs` with exactly this content:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

delete globalThis.MultiPageBackgroundAutoRunStatus;
const statusModule = require('../background/bootstrap/auto-run-status.js');

const manager = statusModule.createAutoRunStatusManager({
  getCurrentAutoRunRuntime: () => ({ currentRun: 2, totalRuns: 5, attemptRun: 1, sessionId: 88 }),
  normalizeAutoRunSessionId: (value) => Math.max(0, Math.floor(Number(value) || 0)),
});

test('builds running status payload with runtime fallbacks', () => {
  assert.deepEqual(manager.getAutoRunStatusPayload('running'), {
    autoRunning: true,
    autoRunPhase: 'running',
    autoRunCurrentRun: 2,
    autoRunTotalRuns: 5,
    autoRunAttemptRun: 1,
    autoRunSessionId: 88,
    scheduledAutoRunAt: null,
    autoRunCountdownAt: null,
    autoRunCountdownTitle: '',
    autoRunCountdownNote: '',
  });
});

test('normalizes explicit schedule and countdown values', () => {
  const payload = manager.getAutoRunStatusPayload('scheduled', {
    currentRun: 0,
    totalRuns: 3,
    attemptRun: 0,
    sessionId: '42',
    scheduledAt: '1000',
    countdownAt: '2000',
    countdownTitle: '标题',
    countdownNote: '说明',
  });
  assert.equal(payload.autoRunning, true);
  assert.equal(payload.autoRunSessionId, 42);
  assert.equal(payload.scheduledAutoRunAt, 1000);
  assert.equal(payload.autoRunCountdownAt, 2000);
  assert.equal(payload.autoRunCountdownTitle, '标题');
  assert.equal(payload.autoRunCountdownNote, '说明');
});

test('phase predicates match existing auto-run lock behavior', () => {
  assert.equal(manager.isAutoRunLockedState({ autoRunning: true, autoRunPhase: 'running' }), true);
  assert.equal(manager.isAutoRunLockedState({ autoRunning: true, autoRunPhase: 'waiting_step' }), true);
  assert.equal(manager.isAutoRunLockedState({ autoRunning: true, autoRunPhase: 'retrying' }), true);
  assert.equal(manager.isAutoRunLockedState({ autoRunning: true, autoRunPhase: 'waiting_interval' }), true);
  assert.equal(manager.isAutoRunLockedState({ autoRunning: true, autoRunPhase: 'scheduled' }), false);
  assert.equal(manager.isAutoRunPausedState({ autoRunning: true, autoRunPhase: 'waiting_email' }), true);
});
```

- [ ] **Step 2: Create the status helper module**

Create `background/bootstrap/auto-run-status.js` with this public shape:

```javascript
(function attachBackgroundAutoRunStatus(globalScope) {
  const ACTIVE_PHASES = new Set(['scheduled', 'running', 'waiting_step', 'waiting_email', 'retrying', 'waiting_interval']);
  const LOCKED_PHASES = new Set(['running', 'waiting_step', 'retrying', 'waiting_interval']);

  function createAutoRunStatusManager(deps = {}) {
    const {
      getCurrentAutoRunRuntime = () => ({ currentRun: 0, totalRuns: 1, attemptRun: 0, sessionId: 0 }),
      normalizeAutoRunSessionId = (value) => Math.max(0, Math.floor(Number(value) || 0)),
    } = deps;

    function getAutoRunStatusPayload(phase, payload = {}) {
      const runtime = getCurrentAutoRunRuntime() || {};
      const normalizedPayload = {
        ...payload,
        currentRun: payload.currentRun ?? runtime.currentRun ?? 0,
        totalRuns: payload.totalRuns ?? runtime.totalRuns ?? 1,
        attemptRun: payload.attemptRun ?? runtime.attemptRun ?? 0,
        sessionId: payload.sessionId ?? payload.autoRunSessionId ?? runtime.sessionId ?? 0,
      };
      return {
        autoRunning: ACTIVE_PHASES.has(phase),
        autoRunPhase: phase,
        autoRunCurrentRun: normalizedPayload.currentRun ?? 0,
        autoRunTotalRuns: normalizedPayload.totalRuns ?? 1,
        autoRunAttemptRun: normalizedPayload.attemptRun ?? 0,
        autoRunSessionId: normalizeAutoRunSessionId(normalizedPayload.sessionId),
        scheduledAutoRunAt: Number.isFinite(Number(normalizedPayload.scheduledAt)) ? Number(normalizedPayload.scheduledAt) : null,
        autoRunCountdownAt: Number.isFinite(Number(normalizedPayload.countdownAt)) ? Number(normalizedPayload.countdownAt) : null,
        autoRunCountdownTitle: normalizedPayload.countdownTitle === undefined ? '' : String(normalizedPayload.countdownTitle || ''),
        autoRunCountdownNote: normalizedPayload.countdownNote === undefined ? '' : String(normalizedPayload.countdownNote || ''),
      };
    }

    function isAutoRunLockedState(state = {}) {
      return Boolean(state.autoRunning) && LOCKED_PHASES.has(state.autoRunPhase);
    }

    function isAutoRunPausedState(state = {}) {
      return Boolean(state.autoRunning) && state.autoRunPhase === 'waiting_email';
    }

    function isAutoRunScheduledState(state = {}, options = {}) {
      const plan = typeof options.getPendingAutoRunTimerPlan === 'function'
        ? options.getPendingAutoRunTimerPlan(state)
        : null;
      const scheduledAt = state.scheduledAutoRunAt === null ? null : Number(state.scheduledAutoRunAt);
      return Boolean(state.autoRunning)
        && state.autoRunPhase === 'scheduled'
        && Number.isFinite(scheduledAt)
        && (!options.scheduledStartKind || plan?.kind === options.scheduledStartKind);
    }

    return {
      getAutoRunStatusPayload,
      isAutoRunLockedState,
      isAutoRunPausedState,
      isAutoRunScheduledState,
    };
  }

  const api = { createAutoRunStatusManager };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  globalScope.MultiPageBackgroundAutoRunStatus = api;
})(typeof self !== 'undefined' ? self : globalThis);
```

- [ ] **Step 3: Load the helper before `background.js` uses it**

In `background.js`, add this entry in `importScripts(...)` after `background/bootstrap/auto-run-timer-plan.js`:

```javascript
'background/bootstrap/auto-run-status.js',
```

- [ ] **Step 4: Create a manager and keep compatibility wrappers**

In `background.js`, create:

```javascript
const autoRunStatusManager = self.MultiPageBackgroundAutoRunStatus.createAutoRunStatusManager({
  getCurrentAutoRunRuntime: () => ({
    currentRun: autoRunCurrentRun,
    totalRuns: autoRunTotalRuns,
    attemptRun: autoRunAttemptRun,
    sessionId: getCurrentAutoRunSessionId(),
  }),
  normalizeAutoRunSessionId: (value) => normalizeAutoRunSessionId(value),
});
```

Then replace the bodies of these existing functions with wrappers:

```javascript
function getAutoRunStatusPayload(phase, payload = {}) {
  if (typeof loggingStatus !== 'undefined' && loggingStatus?.getAutoRunStatusPayload) {
    const runtime = {
      currentRun: payload.currentRun ?? autoRunCurrentRun,
      totalRuns: payload.totalRuns ?? autoRunTotalRuns,
      attemptRun: payload.attemptRun ?? autoRunAttemptRun,
      sessionId: payload.sessionId ?? payload.autoRunSessionId ?? getCurrentAutoRunSessionId(),
    };
    return loggingStatus.getAutoRunStatusPayload(phase, runtime);
  }
  return autoRunStatusManager.getAutoRunStatusPayload(phase, payload);
}

function isAutoRunLockedState(state) {
  return autoRunStatusManager.isAutoRunLockedState(state);
}

function isAutoRunPausedState(state) {
  return autoRunStatusManager.isAutoRunPausedState(state);
}

function isAutoRunScheduledState(state) {
  return autoRunStatusManager.isAutoRunScheduledState(state, {
    getPendingAutoRunTimerPlan,
    scheduledStartKind: AUTO_RUN_TIMER_KIND_SCHEDULED_START,
  });
}
```

Leave `broadcastAutoRunStatus(...)` in `background.js` for this task; this keeps the first status extraction small and reversible.

- [ ] **Step 5: Add smoke checks**

In `scripts/audit-smoke-tests.mjs`:

- Add `background/bootstrap/auto-run-status.js` to `checkCoreFiles()`.
- Add `const autoRunStatus = readText('background/bootstrap/auto-run-status.js');` in `checkStaticContracts()`.
- Add these assertions:

```javascript
assertIncludes(background, "'background/bootstrap/auto-run-status.js'", 'background auto-run status script load');
assertIncludes(autoRunStatus, 'MultiPageBackgroundAutoRunStatus', 'background auto-run status global');
assertIncludes(autoRunStatus, 'createAutoRunStatusManager', 'background auto-run status factory');
assertIncludes(autoRunStatus, 'isAutoRunLockedState', 'background auto-run locked predicate');
assertFileLineCountAtMost('background/bootstrap/auto-run-status.js', 220, 'auto-run status size guard');
```

- [ ] **Step 6: Verify**

Run:

```powershell
node --check background/bootstrap/auto-run-status.js
node --check background.js
node --check scripts/audit-smoke-tests.mjs
node scripts/audit-smoke-tests.mjs
node --test scripts/test-background-auto-run-status.cjs
node --test scripts/test-*.cjs
```

Expected: all commands exit `0`; smoke warnings remain only for `background.js` and `sidepanel/sidepanel.js` over 8,000 lines.

- [ ] **Step 7: Commit**

```powershell
git add background.js background/bootstrap/auto-run-status.js scripts/audit-smoke-tests.mjs scripts/test-background-auto-run-status.cjs
git commit -m "refactor: extract background auto-run status helpers"
```

#### Task 3: Extract Sidepanel Auto-Run State Model

**Files:**
- Create: `sidepanel/auto-run-state.js`
- Create: `scripts/test-sidepanel-auto-run-state.cjs`
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/sidepanel.js`
- Modify: `scripts/audit-smoke-tests.mjs`

- [ ] **Step 1: Add tests for the state model**

Create `scripts/test-sidepanel-auto-run-state.cjs` with exactly this content:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

delete globalThis.SidepanelAutoRunState;
const stateModule = require('../sidepanel/auto-run-state.js');

test('syncs auto-run state from background payload aliases', () => {
  const model = stateModule.createAutoRunStateModel({ now: () => 1000 });
  const state = model.syncAutoRunState({
    autoRunning: true,
    autoRunPhase: 'waiting_step',
    autoRunCurrentRun: 2,
    autoRunTotalRuns: 5,
    autoRunAttemptRun: 3,
    scheduledAutoRunAt: 2000,
    autoRunCountdownAt: 3000,
    autoRunCountdownTitle: '标题',
    autoRunCountdownNote: '说明',
  });
  assert.deepEqual(state, {
    autoRunning: true,
    phase: 'waiting_step',
    currentRun: 2,
    totalRuns: 5,
    attemptRun: 3,
    scheduledAt: 2000,
    countdownAt: 3000,
    countdownTitle: '标题',
    countdownNote: '说明',
  });
  assert.equal(model.isAutoRunLockedPhase(), true);
  assert.equal(model.isAutoRunWaitingStepPhase(), true);
});

test('pending start run count blocks mismatched early status sync', () => {
  const model = stateModule.createAutoRunStateModel({ now: () => 1000 });
  model.registerPendingAutoRunStartRunCount(10);
  assert.equal(model.shouldSyncRunCountFromAutoRunSource({ autoRunning: true, autoRunTotalRuns: 2 }), false);
  assert.equal(model.shouldSyncRunCountFromAutoRunSource({ autoRunning: true, autoRunTotalRuns: 10 }), true);
  assert.equal(model.getPendingAutoRunStartRunCount(), 0);
});

test('auto-run labels match scheduled and retry attempts', () => {
  const model = stateModule.createAutoRunStateModel({ now: () => 1000 });
  assert.equal(model.getAutoRunLabel({ phase: 'scheduled', totalRuns: 3 }), ' (3轮)');
  assert.equal(model.getAutoRunLabel({ phase: 'running', currentRun: 2, totalRuns: 5, attemptRun: 3 }), ' (2/5 · 尝试3)');
  assert.equal(model.getAutoRunLabel({ phase: 'running', currentRun: 1, totalRuns: 1, attemptRun: 2 }), ' (尝试2)');
});
```

- [ ] **Step 2: Create the model module**

Create `sidepanel/auto-run-state.js` with this public API:

```javascript
(function attachSidepanelAutoRunState(globalScope) {
  const ACTIVE_PHASES = new Set(['scheduled', 'running', 'waiting_step', 'waiting_email', 'retrying', 'waiting_interval']);
  const LOCKED_PHASES = new Set(['running', 'waiting_step', 'retrying', 'waiting_interval']);

  function createDefaultAutoRunState() {
    return {
      autoRunning: false,
      phase: 'idle',
      currentRun: 0,
      totalRuns: 1,
      attemptRun: 0,
      scheduledAt: null,
      countdownAt: null,
      countdownTitle: '',
      countdownNote: '',
    };
  }

  function hasOwnStateValue(source, key) {
    return Object.prototype.hasOwnProperty.call(source, key);
  }

  function readAutoRunStateValue(source, keys, fallback) {
    for (const key of keys) {
      if (hasOwnStateValue(source, key)) {
        return source[key];
      }
    }
    return fallback;
  }

  function normalizePendingAutoRunStartRunCount(value) {
    const numeric = Math.floor(Number(value) || 0);
    return numeric > 0 ? numeric : 0;
  }

  function createAutoRunStateModel(options = {}) {
    const now = typeof options.now === 'function' ? options.now : () => Date.now();
    let currentAutoRun = createDefaultAutoRunState();
    let pendingAutoRunStartTotalRuns = 0;
    let pendingAutoRunStartExpiresAt = 0;

    function getAutoRunState() {
      return { ...currentAutoRun };
    }

    function registerPendingAutoRunStartRunCount(totalRuns) {
      pendingAutoRunStartTotalRuns = normalizePendingAutoRunStartRunCount(totalRuns);
      pendingAutoRunStartExpiresAt = pendingAutoRunStartTotalRuns > 0 ? now() + 30000 : 0;
    }

    function clearPendingAutoRunStartRunCount() {
      pendingAutoRunStartTotalRuns = 0;
      pendingAutoRunStartExpiresAt = 0;
    }

    function getPendingAutoRunStartRunCount() {
      if (pendingAutoRunStartTotalRuns > 0 && pendingAutoRunStartExpiresAt > 0 && now() > pendingAutoRunStartExpiresAt) {
        clearPendingAutoRunStartRunCount();
      }
      return pendingAutoRunStartTotalRuns;
    }

    function getAutoRunSourceTotalRuns(source = {}) {
      return normalizePendingAutoRunStartRunCount(readAutoRunStateValue(source, ['autoRunTotalRuns', 'totalRuns'], 0));
    }

    function syncAutoRunState(source = {}) {
      const phase = source.autoRunPhase ?? source.phase ?? currentAutoRun.phase;
      const autoRunning = source.autoRunning !== undefined
        ? Boolean(source.autoRunning)
        : (source.autoRunPhase !== undefined || source.phase !== undefined ? ACTIVE_PHASES.has(phase) : currentAutoRun.autoRunning);
      currentAutoRun = {
        autoRunning,
        phase,
        currentRun: readAutoRunStateValue(source, ['autoRunCurrentRun', 'currentRun'], currentAutoRun.currentRun),
        totalRuns: readAutoRunStateValue(source, ['autoRunTotalRuns', 'totalRuns'], currentAutoRun.totalRuns),
        attemptRun: readAutoRunStateValue(source, ['autoRunAttemptRun', 'attemptRun'], currentAutoRun.attemptRun),
        scheduledAt: readAutoRunStateValue(source, ['scheduledAutoRunAt', 'scheduledAt'], currentAutoRun.scheduledAt),
        countdownAt: readAutoRunStateValue(source, ['autoRunCountdownAt', 'countdownAt'], currentAutoRun.countdownAt),
        countdownTitle: readAutoRunStateValue(source, ['autoRunCountdownTitle', 'countdownTitle'], currentAutoRun.countdownTitle),
        countdownNote: readAutoRunStateValue(source, ['autoRunCountdownNote', 'countdownNote'], currentAutoRun.countdownNote),
      };
      return getAutoRunState();
    }

    function isAutoRunLockedPhase() {
      return LOCKED_PHASES.has(currentAutoRun.phase);
    }

    function isAutoRunPausedPhase() {
      return currentAutoRun.phase === 'waiting_email';
    }

    function isAutoRunWaitingStepPhase() {
      return currentAutoRun.phase === 'waiting_step';
    }

    function isAutoRunScheduledPhase() {
      return currentAutoRun.phase === 'scheduled';
    }

    function isAutoRunSourceSyncPhase(phase) {
      return ACTIVE_PHASES.has(phase);
    }

    function shouldSyncRunCountFromAutoRunSource(source = {}) {
      const phase = source.autoRunPhase ?? source.phase ?? currentAutoRun.phase;
      const autoRunning = source.autoRunning !== undefined ? Boolean(source.autoRunning) : isAutoRunSourceSyncPhase(phase);
      const shouldSync = autoRunning || isAutoRunSourceSyncPhase(phase);
      if (!shouldSync) {
        return false;
      }
      const pendingTotalRuns = getPendingAutoRunStartRunCount();
      if (pendingTotalRuns > 0) {
        const sourceTotalRuns = getAutoRunSourceTotalRuns(source);
        if (sourceTotalRuns > 0 && sourceTotalRuns !== pendingTotalRuns) {
          return false;
        }
        if (sourceTotalRuns === pendingTotalRuns) {
          clearPendingAutoRunStartRunCount();
        }
      }
      return true;
    }

    function getAutoRunLabel(payload = currentAutoRun) {
      if ((payload.phase ?? currentAutoRun.phase) === 'scheduled') {
        return (payload.totalRuns || 1) > 1 ? ` (${payload.totalRuns}轮)` : '';
      }
      const attemptLabel = payload.attemptRun ? ` · 尝试${payload.attemptRun}` : '';
      if ((payload.totalRuns || 1) > 1) {
        return ` (${payload.currentRun}/${payload.totalRuns}${attemptLabel})`;
      }
      return attemptLabel ? ` (${attemptLabel.slice(3)})` : '';
    }

    return {
      clearPendingAutoRunStartRunCount,
      getAutoRunLabel,
      getAutoRunSourceTotalRuns,
      getAutoRunState,
      getPendingAutoRunStartRunCount,
      isAutoRunLockedPhase,
      isAutoRunPausedPhase,
      isAutoRunScheduledPhase,
      isAutoRunSourceSyncPhase,
      isAutoRunWaitingStepPhase,
      registerPendingAutoRunStartRunCount,
      shouldSyncRunCountFromAutoRunSource,
      syncAutoRunState,
    };
  }

  const api = {
    createAutoRunStateModel,
    createDefaultAutoRunState,
    normalizePendingAutoRunStartRunCount,
    readAutoRunStateValue,
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  globalScope.SidepanelAutoRunState = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 3: Load the state model before `sidepanel.js`**

In `sidepanel/sidepanel.html`, add this before `sidepanel.js` and after `auto-run-countdown-view.js`:

```html
<script src="auto-run-state.js"></script>
```

- [ ] **Step 4: Wire wrappers in `sidepanel.js`**

In `sidepanel/sidepanel.js`, replace the `currentAutoRun` object and pending run-count variables with:

```javascript
const autoRunStateModel = window.SidepanelAutoRunState.createAutoRunStateModel();
let currentAutoRun = autoRunStateModel.getAutoRunState();
```

Then replace these existing function bodies with wrappers:

```javascript
function readAutoRunStateValue(source, keys, fallback) {
  return window.SidepanelAutoRunState.readAutoRunStateValue(source, keys, fallback);
}

function normalizePendingAutoRunStartRunCount(value) {
  return window.SidepanelAutoRunState.normalizePendingAutoRunStartRunCount(value);
}

function registerPendingAutoRunStartRunCount(totalRuns) {
  autoRunStateModel.registerPendingAutoRunStartRunCount(totalRuns);
}

function clearPendingAutoRunStartRunCount() {
  autoRunStateModel.clearPendingAutoRunStartRunCount();
}

function getPendingAutoRunStartRunCount() {
  return autoRunStateModel.getPendingAutoRunStartRunCount();
}

function getAutoRunSourceTotalRuns(source = {}) {
  return autoRunStateModel.getAutoRunSourceTotalRuns(source);
}

function syncAutoRunState(source = {}) {
  currentAutoRun = autoRunStateModel.syncAutoRunState(source);
}

function isAutoRunLockedPhase() {
  return autoRunStateModel.isAutoRunLockedPhase();
}

function isAutoRunPausedPhase() {
  return autoRunStateModel.isAutoRunPausedPhase();
}

function isAutoRunWaitingStepPhase() {
  return autoRunStateModel.isAutoRunWaitingStepPhase();
}

function isAutoRunScheduledPhase() {
  return autoRunStateModel.isAutoRunScheduledPhase();
}

function isAutoRunSourceSyncPhase(phase) {
  return autoRunStateModel.isAutoRunSourceSyncPhase(phase);
}

function shouldSyncRunCountFromAutoRunSource(source = {}) {
  return autoRunStateModel.shouldSyncRunCountFromAutoRunSource(source);
}

function getAutoRunLabel(payload = currentAutoRun) {
  return autoRunStateModel.getAutoRunLabel(payload);
}
```

Leave callers unchanged.

- [ ] **Step 5: Add smoke checks**

In `scripts/audit-smoke-tests.mjs`:

- Add `sidepanel/auto-run-state.js` to `checkCoreFiles()`.
- Add `const autoRunState = readText('sidepanel/auto-run-state.js');`.
- Add these assertions:

```javascript
assertIncludes(sidepanelHtml, 'src="auto-run-state.js"', 'sidepanel auto-run state script load');
assertBefore(sidepanelHtml, 'src="auto-run-state.js"', 'src="sidepanel.js"', 'sidepanel auto-run state must load before sidepanel.js');
assertIncludes(autoRunState, 'SidepanelAutoRunState', 'sidepanel auto-run state global');
assertIncludes(autoRunState, 'createAutoRunStateModel', 'sidepanel auto-run state model factory');
assertIncludes(autoRunState, 'shouldSyncRunCountFromAutoRunSource', 'sidepanel auto-run run-count sync guard');
assertFileLineCountAtMost('sidepanel/auto-run-state.js', 280, 'sidepanel auto-run state size guard');
```

- [ ] **Step 6: Verify**

Run:

```powershell
node --check sidepanel/auto-run-state.js
node --check sidepanel/sidepanel.js
node --check scripts/audit-smoke-tests.mjs
node scripts/audit-smoke-tests.mjs
node --test scripts/test-sidepanel-auto-run-state.cjs
node --test scripts/test-*.cjs
```

Expected: all commands exit `0`; `sidepanel/sidepanel.js` line count drops by roughly 90-130 lines.

- [ ] **Step 7: Commit**

```powershell
git add sidepanel/auto-run-state.js sidepanel/sidepanel.html sidepanel/sidepanel.js scripts/audit-smoke-tests.mjs scripts/test-sidepanel-auto-run-state.cjs
git commit -m "refactor: extract sidepanel auto-run state model"
```

#### Task 4: Update Phase Three Results And Run Full Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-07-06-codebase-decomposition-phase-three-plan.md`

- [ ] **Step 1: Record final module sizes**

Run:

```powershell
node scripts/module-size-report.mjs
```

Update the `Current State` table in this plan with final line counts.

- [ ] **Step 2: Record execution results**

Add an `Execution Results` section above `Current State` with rows for:

```markdown
| Task | Result |
| --- | --- |
| Sidepanel normalizer fallback | Added regression tests and preserved legacy fallback defaults. |
| Background auto-run status | Extracted status payload and phase predicates into `background/bootstrap/auto-run-status.js`. |
| Sidepanel auto-run state | Extracted current auto-run state sync and pending run-count gate into `sidepanel/auto-run-state.js`. |
```

- [ ] **Step 3: Full verification**

Run:

```powershell
node --check background.js
node --check background/bootstrap/auto-run-status.js
node --check sidepanel/sidepanel.js
node --check sidepanel/auto-run-normalizers.js
node --check sidepanel/auto-run-state.js
node scripts/audit-smoke-tests.mjs
node scripts/audit-no-phone-sms.mjs
node scripts/audit-no-removed-network.mjs
node --test scripts/test-*.cjs
```

Expected: all commands exit `0`; smoke warnings may remain for `background.js` and `sidepanel/sidepanel.js` until later phases.

- [ ] **Step 4: Commit**

```powershell
git add docs/superpowers/plans/2026-07-06-codebase-decomposition-phase-three-plan.md
git commit -m "docs: add decomposition phase three results"
```

### Self-Review

- Spec coverage: covers the known fallback compatibility issue, one background extraction, one sidepanel extraction, smoke guards, tests, and final documentation.
- Placeholder scan: no placeholder markers, unnamed files, or generic “write tests” steps remain; each code/test task provides concrete code and commands.
- Type consistency: module globals are `MultiPageBackgroundAutoRunStatus`, `SidepanelAutoRunState`, and `SidepanelAutoRunNormalizers`; wrapper function names match existing callers in `background.js` and `sidepanel/sidepanel.js`.
- Scope check: this is refactor-only plus one compatibility fix discovered during review; no release, no GitHub push, no business-rule changes.

---

<a id="2026-07-06-codebase-decomposition-plan"></a>

<!-- archived-from: docs/superpowers/plans/2026-07-06-codebase-decomposition-plan.md -->

## Codebase Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce large-file concentration so future fixes can target small modules instead of editing `background.js`, `sidepanel/sidepanel.js`, `account-records-manager.js`, `upi-credential-membership-checker.js`, and `content/signup-page.js` directly.

**Architecture:** Keep the existing Chrome MV3 no-bundler design. New files must expose globals on `self.*` and be loaded through ordered `importScripts(...)` or ordered `<script>` tags. Each extraction must preserve behavior first; renaming APIs and deleting legacy compatibility happen only after tests prove no caller remains.

**Tech Stack:** Plain JavaScript, Chrome Extension MV3 service worker, side panel DOM scripts, content scripts, Node `--check`, Node `node:test`, existing audit scripts.

---

### Baseline

Current tracked-source pressure points:

| Area | File | Current Size | Problem |
| --- | --- | ---: | --- |
| Background entry | `background.js` | ~16.5k lines | Imports, defaults, state, providers, flow runtime, and message wiring are mixed. |
| Side panel entry | `sidepanel/sidepanel.js` | ~10.9k lines | DOM bindings, settings, workflow controls, log rendering, state sync, and event wiring are mixed. |
| Membership/redeem | `background/upi-credential-membership-checker.js` | ~7.5k lines | Result storage, CDK status sync, AT refresh, manual redeem, and export logic are mixed. |
| Signup content | `content/signup-page.js` | ~6.9k lines | Page detection, localized selectors, form actions, and orchestration are mixed. |
| Membership UI | `sidepanel/account-records-manager.js` | ~5.6k lines | Parsing, grouping, candidate rules, rendering, export, and click handlers are mixed. |

### Execution Results

Implemented on `main` as incremental refactor commits. The pass kept the MV3 no-bundler architecture and added smoke checks for the new ordered script modules.

| Task | Result |
| --- | --- |
| Size guard | Added tracked-source size report and non-fatal smoke warnings for files over 8,000 lines. |
| Sidepanel bindings/log/workflow | Extracted DOM bindings, log panel rendering, and workflow status rendering. |
| Membership UI | Extracted row policy and progress/flow rendering helpers. |
| Background bootstrap | Extracted flow runtime and persisted-settings defaults. |
| Background state store | Extracted service worker state/session-storage wrappers into `background/bootstrap/state-store.js`. |
| Background legacy cleanup | Extracted removed-network/IP-proxy residue cleanup into `background/bootstrap/legacy-cleanup.js`. |
| Background auto-run session | Extracted auto-run session ID state into `background/bootstrap/auto-run-session.js`. |
| Background auto-run timer plan | Extracted timer-plan normalization/status payload helpers into `background/bootstrap/auto-run-timer-plan.js`. |
| Email providers | Extracted provider/generator registry wrappers. |
| Membership helpers | Extracted access-token refresh classifiers and pending redeem status target builder. |
| Signup content | Extracted detector constants/helpers and command orchestration wrappers. |
| Sidepanel toast service | Extracted toast rendering/dismissal into `sidepanel/toast-service.js`. |
| Sidepanel auto-run helpers | Extracted auto-run numeric normalizers and countdown ticker view into `sidepanel/auto-run-normalizers.js` and `sidepanel/auto-run-countdown-view.js`. |

Final size snapshot from `node scripts/module-size-report.mjs`:

| File | Final Lines | Status |
| --- | ---: | --- |
| `background.js` | 15,915 | Still over target; next split should move runtime orchestration, status broadcasting, and remaining provider helpers. |
| `sidepanel/sidepanel.js` | 10,732 | Still over target; next split should move settings/event wiring and state sync managers. |
| `background/upi-credential-membership-checker.js` | 7,497 | Improved but still large; export/import and redeem batch runners remain candidates. |
| `content/signup-page.js` | 6,820 | Improved; further split should move page-specific action bodies. |
| `sidepanel/account-records-manager.js` | 5,481 | Improved via policy/renderer extraction; click handlers and export actions remain candidates. |
| `background/message-router.js` | 4,007 | Reduced by moving pending redeem target selection. |

Non-goals:

- Do not change registration, trial eligibility, Free/Plus grouping, UPI/IDEAL rules, Passkey/2FA routes, exports, or GitHub release behavior.
- Do not introduce a bundler or ES module conversion in this pass.
- Do not delete existing compatibility globals until all consumers are switched.

### Target File Boundaries

Create or extend these focused modules:

- `sidepanel/dom-bindings.js`: all `document.getElementById` and static DOM lookup.
- `sidepanel/log-panel-manager.js`: log rendering, clear/export, previous-round snapshot display.
- `sidepanel/workflow-state-view.js`: flow step status/progress rendering only.
- `sidepanel/membership-row-policy.js`: pure Free/Plus grouping, eligibility, candidate counts.
- `sidepanel/membership-renderer.js`: Free/UPI Plus/IDEAL Plus table rendering only.
- `background/bootstrap/flow-runtime.js`: step definitions, step IDs, node IDs, flow lookup helpers.
- `background/bootstrap/settings-defaults.js`: persistent defaults, legacy key maps, setting schema constants.
- `background/email/provider-registry.js`: provider constants, provider selection, current mailbox metadata.
- `background/membership/redeem-status-sync.js`: remote CDK job refresh and submitted-result synchronization.
- `background/membership/access-token-refresh.js`: Free/Plus AT refill orchestration.
- `content/signup-page-detector.js`: page state detection and localized text matchers.
- `content/signup-page-orchestrator.js`: high-level signup action dispatch.

Existing files remain composition roots:

- `background.js` loads modules and wires dependencies.
- `sidepanel/sidepanel.js` initializes managers and handles top-level messages.
- `content/signup-page.js` attaches content-script API to `self`.

---

#### Task 1: Add Size Guard And Baseline Report

**Files:**
- Modify: `scripts/module-size-report.mjs`
- Modify: `scripts/audit-smoke-tests.mjs`

- [ ] **Step 1: Add a tracked-code-only mode to the size report**

Update `scripts/module-size-report.mjs` so it ignores `.git`, `.codegraph`, `.codex-backups`, `_metadata`, and `release-artifacts`, and prints the top 20 tracked JavaScript/HTML/CSS files.

- [ ] **Step 2: Add a smoke warning for files over 8,000 lines**

In `scripts/audit-smoke-tests.mjs`, add a non-fatal warning list for tracked source files over 8,000 lines. This keeps current oversized files visible while allowing incremental refactors.

- [ ] **Step 3: Verify baseline**

Run:

```powershell
node --check scripts/module-size-report.mjs
node --check scripts/audit-smoke-tests.mjs
node scripts/module-size-report.mjs
node scripts/audit-smoke-tests.mjs
```

Expected: commands exit 0; oversized files are reported as warnings, not failures.

- [ ] **Step 4: Commit**

```powershell
git add scripts/module-size-report.mjs scripts/audit-smoke-tests.mjs
git commit -m "chore: track module size pressure"
```

#### Task 2: Split Sidepanel DOM Bindings

**Files:**
- Create: `sidepanel/dom-bindings.js`
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/sidepanel.js`

- [ ] **Step 1: Create DOM binding module**

Move top-level DOM lookup constants from `sidepanel/sidepanel.js` into:

```javascript
self.SidepanelDomBindings = {
  getBindings() {
    return {
      logArea: document.getElementById('log-area'),
      btnAutoRun: document.getElementById('btn-auto-run'),
      btnStop: document.getElementById('btn-stop'),
      btnConfigMenu: document.getElementById('btn-config-menu'),
      // Move every existing DOM lookup here, preserving the original key names.
    };
  },
};
```

The implementation must include every existing lookup, not just the example keys.

- [ ] **Step 2: Load before `sidepanel.js`**

Add this before `sidepanel.js` in `sidepanel/sidepanel.html`:

```html
<script src="dom-bindings.js"></script>
```

- [ ] **Step 3: Replace local declarations**

In `sidepanel/sidepanel.js`, replace the moved declarations with:

```javascript
const dom = self.SidepanelDomBindings.getBindings();
const {
  logArea,
  btnAutoRun,
  btnStop,
  btnConfigMenu,
} = dom;
```

Include all moved binding names in the destructuring so existing references continue to work.

- [ ] **Step 4: Verify**

Run:

```powershell
node --check sidepanel/dom-bindings.js
node --check sidepanel/sidepanel.js
node scripts/audit-smoke-tests.mjs
```

Expected: no `ReferenceError` for DOM names, side panel loads, workflow buttons still render.

- [ ] **Step 5: Commit**

```powershell
git add sidepanel/dom-bindings.js sidepanel/sidepanel.html sidepanel/sidepanel.js
git commit -m "refactor: extract sidepanel DOM bindings"
```

#### Task 3: Split Sidepanel Log And Workflow Views

**Files:**
- Create: `sidepanel/log-panel-manager.js`
- Create: `sidepanel/workflow-state-view.js`
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/sidepanel.js`

- [ ] **Step 1: Move log-only functions**

Move functions that only append, clear, trim, or render logs into `sidepanel/log-panel-manager.js`:

```javascript
self.SidepanelLogPanelManager = {
  create({ logArea, state, sendMessage }) {
    return {
      appendLog,
      clearLog,
      renderLogs,
      renderPreviousRoundSnapshot,
    };
  },
};
```

The module must not read unrelated settings inputs.

- [ ] **Step 2: Move flow-render-only functions**

Move flow progress/status rendering into `sidepanel/workflow-state-view.js`:

```javascript
self.SidepanelWorkflowStateView = {
  create({ stepsProgress, state }) {
    return {
      renderStepList,
      renderCurrentNodeStatus,
      renderProgressCount,
    };
  },
};
```

- [ ] **Step 3: Wire managers from `sidepanel.js`**

Instantiate both modules after DOM bindings and before event handlers. Keep old function names as local wrappers for one commit if many callers still use them.

- [ ] **Step 4: Verify**

Run:

```powershell
node --check sidepanel/log-panel-manager.js
node --check sidepanel/workflow-state-view.js
node --check sidepanel/sidepanel.js
node scripts/audit-smoke-tests.mjs
```

Manual check: start and stop one workflow; logs and progress should still update.

- [ ] **Step 5: Commit**

```powershell
git add sidepanel/log-panel-manager.js sidepanel/workflow-state-view.js sidepanel/sidepanel.html sidepanel/sidepanel.js
git commit -m "refactor: split sidepanel logs and workflow view"
```

#### Task 4: Split Membership UI Policy From Rendering

**Files:**
- Create: `sidepanel/membership-row-policy.js`
- Create: `sidepanel/membership-renderer.js`
- Modify: `sidepanel/account-records-manager.js`
- Modify: `sidepanel/sidepanel.html`
- Test: `scripts/test-membership-view-model.cjs`

- [ ] **Step 1: Extract pure row policy**

Move pure helpers from `account-records-manager.js` into `sidepanel/membership-row-policy.js`: channel normalization, deleted Plus tombstones, Free/Plus grouping, failure-limit checks, daily-limit checks, and candidate filtering.

Expose:

```javascript
self.SidepanelMembershipRowPolicy = {
  normalizeRedeemChannel,
  getMembershipGroup,
  isRedeemableFreeRowForChannel,
  getNotRedeemableReason,
  summarizeRows,
};
```

- [ ] **Step 2: Add focused tests**

Extend `scripts/test-membership-view-model.cjs` with cases for:

- UPI manual candidate ignores generic failure count.
- `pm-unavailable`/cross-region payment rows are not redeemable.
- Deleted UPI Plus tombstone does not hide IDEAL Plus.
- Missing AT rows are counted as not redeemable.

- [ ] **Step 3: Extract renderer**

Move HTML-building functions for Free, UPI Plus, IDEAL Plus, progress bars, and empty states into `sidepanel/membership-renderer.js`.

Expose:

```javascript
self.SidepanelMembershipRenderer = {
  renderGroups({ rows, policy, actions, state }),
};
```

The renderer receives action callbacks; it must not send Chrome messages itself.

- [ ] **Step 4: Verify**

Run:

```powershell
node --check sidepanel/membership-row-policy.js
node --check sidepanel/membership-renderer.js
node --check sidepanel/account-records-manager.js
node --test scripts/test-membership-view-model.cjs
node scripts/audit-smoke-tests.mjs
```

- [ ] **Step 5: Commit**

```powershell
git add sidepanel/membership-row-policy.js sidepanel/membership-renderer.js sidepanel/account-records-manager.js sidepanel/sidepanel.html scripts/test-membership-view-model.cjs
git commit -m "refactor: split membership row policy and renderer"
```

#### Task 5: Split Background Flow Runtime And Settings Defaults

**Files:**
- Create: `background/bootstrap/flow-runtime.js`
- Create: `background/bootstrap/settings-defaults.js`
- Modify: `background.js`

- [ ] **Step 1: Extract flow definition helpers**

Move step-definition constants and helpers from the top of `background.js` into `background/bootstrap/flow-runtime.js`.

Expose:

```javascript
self.MultiPageBackgroundFlowRuntime = {
  create({ defaultActiveFlowId = 'openai' } = {}) {
    return {
      DEFAULT_ACTIVE_FLOW_ID,
      getStepDefinitionsForState,
      getStepIdsForState,
      getNodeDefinitionsForState,
      getNodeTitleForState,
    };
  },
};
```

- [ ] **Step 2: Extract persistent defaults**

Move `PERSISTED_SETTING_DEFAULTS`, legacy setting key maps, schema constants, and setting clamp defaults into `background/bootstrap/settings-defaults.js`.

Expose:

```javascript
self.MultiPageBackgroundSettingsDefaults = {
  getDefaults() {
    return { ...PERSISTED_SETTING_DEFAULTS };
  },
  LEGACY_UPI_REDEEM_SETTING_KEY_MAP,
  SETTINGS_EXPORT_SCHEMA_VERSION,
};
```

- [ ] **Step 3: Wire imports**

Add both files to `importScripts(...)` before `background/persistent-settings.js` consumers are initialized.

- [ ] **Step 4: Verify**

Run:

```powershell
node --check background/bootstrap/flow-runtime.js
node --check background/bootstrap/settings-defaults.js
node --check background.js
node scripts/audit-smoke-tests.mjs
```

Manual check: side panel still shows all workflow routes: full 2FA, no-2FA Free, Passkey Free, and redeem-only.

- [ ] **Step 5: Commit**

```powershell
git add background/bootstrap/flow-runtime.js background/bootstrap/settings-defaults.js background.js
git commit -m "refactor: extract background flow and settings bootstrap"
```

#### Task 6: Split Email Provider Registry Out Of `background.js`

**Files:**
- Create: `background/email/provider-registry.js`
- Modify: `background.js`

- [ ] **Step 1: Move provider constants**

Move provider and generator constants such as `ICLOUD_PROVIDER`, `CUSTOM_EMAIL_POOL_GENERATOR`, `HOTMAIL_PROVIDER`, `LUCKMAIL_PROVIDER`, and related mailbox/default constants into `background/email/provider-registry.js`.

- [ ] **Step 2: Move provider selection helpers**

Move functions that pick or normalize provider/generator state, but do not move provider API calls yet.

Expose:

```javascript
self.MultiPageEmailProviderRegistry = {
  constants,
  normalizeProvider,
  normalizeGenerator,
  isCustomEmailPoolGenerator,
  getProviderLabel,
};
```

- [ ] **Step 3: Keep compatibility aliases**

In `background.js`, destructure registry constants back to the existing local names for one commit. This avoids changing every caller in the same task.

- [ ] **Step 4: Verify**

Run:

```powershell
node --check background/email/provider-registry.js
node --check background.js
node scripts/audit-smoke-tests.mjs
```

Manual check: custom email pool, iCloud, Hotmail, Luckmail, and 2925 selectors still show and save.

- [ ] **Step 5: Commit**

```powershell
git add background/email/provider-registry.js background.js
git commit -m "refactor: extract email provider registry"
```

#### Task 7: Split Membership Remote Sync And AT Refresh

**Files:**
- Create: `background/membership/redeem-status-sync.js`
- Create: `background/membership/access-token-refresh.js`
- Modify: `background/upi-credential-membership-checker.js`
- Modify: `background/message-router.js`
- Test: `scripts/test-redeem-cdkey-usage.cjs`

- [ ] **Step 1: Extract remote submitted-job refresh**

Move logic that refreshes `submitted`, remote failed, canceled, timeout, approve-blocked, and success CDK job states into `background/membership/redeem-status-sync.js`.

Expose:

```javascript
self.MultiPageRedeemStatusSync = {
  create({ getStoredResults, saveResults, redeemApiClient, log }) {
    return {
      refreshSubmittedJobs,
      refreshChannelStatuses,
    };
  },
};
```

- [ ] **Step 2: Extract AT refill orchestration**

Move Free/Plus access-token refill queue logic into `background/membership/access-token-refresh.js`.

Expose:

```javascript
self.MultiPageAccessTokenRefresh = {
  create({ loginExecutor, getStoredResults, saveResults, log }) {
    return {
      refillMissingAccessTokens,
      refillOneAccount,
    };
  },
};
```

- [ ] **Step 3: Preserve message names**

Existing messages such as `REFRESH_UPI_REDEEM_CDKEY_STATUSES` and Free AT refill actions must keep the same external names. Only their internals should delegate to the new modules.

- [ ] **Step 4: Verify**

Run:

```powershell
node --check background/membership/redeem-status-sync.js
node --check background/membership/access-token-refresh.js
node --check background/upi-credential-membership-checker.js
node --check background/message-router.js
node --test scripts/test-redeem-cdkey-usage.cjs
node scripts/audit-smoke-tests.mjs
```

Manual check: refresh CDK statuses and one-key AT refill still work.

- [ ] **Step 5: Commit**

```powershell
git add background/membership/redeem-status-sync.js background/membership/access-token-refresh.js background/upi-credential-membership-checker.js background/message-router.js scripts/test-redeem-cdkey-usage.cjs
git commit -m "refactor: split membership sync and AT refresh"
```

#### Task 8: Split Signup Content Detector And Orchestrator

**Files:**
- Create: `content/signup-page-detector.js`
- Create: `content/signup-page-orchestrator.js`
- Modify: `content/signup-page.js`
- Modify: `manifest.json`

- [ ] **Step 1: Extract page detection**

Move page-state detection, localized button text matchers, Hindi/English/Japanese/Chinese labels, and diagnostic snapshot builders into `content/signup-page-detector.js`.

Expose:

```javascript
self.SignupPageDetector = {
  detectPageState,
  findSignupEntryAction,
  findContinueButton,
  findResendButton,
  buildDiagnosticSnapshot,
};
```

- [ ] **Step 2: Extract high-level orchestration**

Move high-level action dispatch into `content/signup-page-orchestrator.js`:

```javascript
self.SignupPageOrchestrator = {
  create({ detector, domUtils, passwordPage, verificationPage, profilePage }) {
    return {
      submitEmail,
      submitPassword,
      fetchVerificationState,
      fillProfile,
      recoverAuthPage,
    };
  },
};
```

- [ ] **Step 3: Keep `signup-page.js` as API adapter**

After extraction, `content/signup-page.js` should mostly attach message handlers and delegate to detector/orchestrator modules.

- [ ] **Step 4: Update script order**

In `manifest.json`, load the new files after `content/signup-dom-utils.js` and before `content/signup-page.js`.

- [ ] **Step 5: Verify**

Run:

```powershell
node --check content/signup-page-detector.js
node --check content/signup-page-orchestrator.js
node --check content/signup-page.js
node --check manifest.json
node scripts/audit-smoke-tests.mjs
```

Manual check: step 2 email entry, step 4 verification, step 5 profile, and step 6 password page still work on English and Hindi pages.

- [ ] **Step 6: Commit**

```powershell
git add content/signup-page-detector.js content/signup-page-orchestrator.js content/signup-page.js manifest.json
git commit -m "refactor: split signup page detection and orchestration"
```

#### Task 9: Final Cleanup And Size Gate

**Files:**
- Modify: `scripts/audit-smoke-tests.mjs`
- Modify: `docs/superpowers/plans/2026-07-06-codebase-decomposition-plan.md`

- [ ] **Step 1: Turn new files into expected structure checks**

Add smoke checks that confirm these files are loaded:

- `sidepanel/dom-bindings.js`
- `sidepanel/log-panel-manager.js`
- `sidepanel/membership-renderer.js`
- `background/bootstrap/flow-runtime.js`
- `background/email/provider-registry.js`
- `background/membership/redeem-status-sync.js`
- `content/signup-page-detector.js`

- [ ] **Step 2: Record final sizes**

Run:

```powershell
node scripts/module-size-report.mjs
```

Update this plan with a final size table. Target reductions:

- `background.js` under 9,000 lines.
- `sidepanel/sidepanel.js` under 6,000 lines.
- `account-records-manager.js` under 3,500 lines.
- `content/signup-page.js` under 4,000 lines.
- `upi-credential-membership-checker.js` under 5,000 lines.

- [ ] **Step 3: Full verification**

Run:

```powershell
node --check background.js
node --check background/message-router.js
node --check background/upi-credential-membership-checker.js
node --check background/steps/upi-redeem.js
node --check content/signup-page.js
node --check sidepanel/sidepanel.js
node --check sidepanel/account-records-manager.js
node scripts/audit-smoke-tests.mjs
node scripts/audit-no-phone-sms.mjs
node scripts/audit-no-removed-network.mjs
node --test scripts/test-*.cjs
```

Expected: all commands pass.

- [ ] **Step 4: Commit**

```powershell
git add scripts/audit-smoke-tests.mjs docs/superpowers/plans/2026-07-06-codebase-decomposition-plan.md
git commit -m "docs: record codebase decomposition results"
```

### Execution Notes

- Work one task per commit. If a task becomes too large, stop after creating a compatibility wrapper and commit that safe checkpoint.
- Do not combine behavior fixes with extraction commits. If a bug is found, commit the behavior fix separately before continuing the refactor.
- After every background-file extraction, reload the extension from `chrome://extensions`; refreshing the side panel alone is not enough for MV3 service worker code.
- Prefer moving pure functions to `shared/` only when both background and side panel need them. Otherwise keep files close to their owner directory.
- Keep old global names for at least one task after extraction, then remove them only when `rg "oldName"` proves no caller remains.

### Self-Review

- Spec coverage: the plan covers side panel, background entry, membership/redeem, signup content, and guard scripts.
- Placeholder scan: no task relies on "TBD" or unnamed files; every task names exact files and verification commands.
- Type consistency: all new modules expose `self.*` namespaces because this project uses ordered scripts, not imports.
- Scope check: this is a refactor-only plan; feature removals, version release, and behavior changes are intentionally excluded.

---

<a id="2026-07-06-current-code-splitting-plan"></a>

<!-- archived-from: docs/superpowers/plans/2026-07-06-current-code-splitting-plan.md -->

## Current Code Splitting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the current V1.0.6 codebase into focused modules without changing registration, custom email pool, Free/Plus, UPI/IDEAL redeem, Passkey, TXT/JSON export, or fingerprint-browser download behavior.

**Architecture:** Keep the current Chrome MV3 no-bundler architecture. Reuse existing split points first: `MultiPageRedeemChannelState`, `MultiPageRedeemCdkeyUsage`, and `SidepanelSettingsTransferManager` already exist and must be extended or moved, not duplicated. Existing entry files remain compatibility composition roots until their callers are safely switched.

**Tech Stack:** Plain JavaScript, Chrome Extension MV3, ordered `importScripts`, ordered sidepanel `<script>` tags, Node syntax checks, existing audit scripts, Node test runner.

---

### Current Baseline

Measured on 2026-07-06 with `node scripts/module-size-report.mjs`:

| Priority | File | Lines | Bytes | Split Direction |
| --- | --- | ---: | ---: | --- |
| P0 | `background.js` | 16460 | 610746 | Split stable state registries after low-risk shared helpers. |
| P0 | `sidepanel/sidepanel.js` | 10875 | 469939 | Keep as composition root; extract settings/workflow managers after parser and view-model work. |
| P0 | `background/upi-credential-membership-checker.js` | 7488 | 342641 | Extract credential format, results store, and access-token helpers. |
| P1 | `content/signup-page.js` | 6751 | 250241 | Split page-type helpers after background/sidepanel behavior is stable. |
| P1 | `sidepanel/account-records-manager.js` | 5522 | 247511 | Extract parser delegation, view model, then renderer. |
| P1 | `background/steps/upi-redeem.js` | 5065 | 209962 | Extend current CDK helper, then split API client. |
| P1 | `background/message-router.js` | 4048 | 172621 | Move routes only after domain helpers are shared. |

### Corrections To The Previous Draft

- Do not create `shared/redeem-channel-policy.js`; move and extend existing `background/redeem/redeem-channel-state.js`.
- Do not create `background/redeem/cdkey-usage-state.js`; extend existing `background/redeem/redeem-cdkey-usage.js`.
- Do not create `sidepanel/config-transfer-manager.js`; `sidepanel/settings-transfer-manager.js` already owns config import/export.
- Do not remove contextual checks from `shouldRedeemItemUseChannel`; current callers require `trialEligibilityStatus === "eligible"` and `isTrialEligibilityChannelAllowed`.
- Do not parse TXT credential rows with `.filter(Boolean)`; current import uses `line.split(/---+/)` and relies on stable column positions.
- Keep legacy redeem failure behavior: `redeemFailureCount` applies only when the legacy stored channel matches the requested channel.

### File Structure

- Move: `background/redeem/redeem-channel-state.js` -> `shared/redeem-channel-state.js`
  - Pure UPI/IDEAL channel normalization, field names, failure counts, daily-limit blocking, lock patches, and caller-provided eligibility policy.
- Keep and extend: `background/redeem/redeem-cdkey-usage.js`
  - CDK state aliases, pool parsing, usage normalization, selectable CDK filtering, usage updates.
- Create: `shared/membership-credential-format.js`
  - Parse and format Free TXT lines for 2FA, Passkey, and no-2FA rows while preserving current field names.
- Create: `background/redeem/upi-redeem-api-client.js`
  - POST JSON wrappers for redeem and eligibility APIs; no orchestration.
- Create: `background/membership/results-store.js`
  - Membership result storage get/save and deletion-state merge.
- Create: `background/membership/access-token-login.js`
  - Access-token expiry, masking, and login-material helpers.
- Create: `sidepanel/membership-view-model.js`
  - Pure Free/UPI Plus/IDEAL Plus grouping and counts.
- Create: `sidepanel/membership-renderer.js`
  - HTML rendering only; action handlers remain in `account-records-manager.js` for one commit.
- Create: `sidepanel/settings-state-manager.js`
  - Collect/apply settings state by delegating existing `sidepanel.js` helpers.
- Create: `sidepanel/workflow-controls-manager.js`
  - Start/continue/stop/reset/render workflow controls by delegating existing `sidepanel.js` helpers.

### Baseline Verification After Every Task

Run the task-specific commands plus:

```powershell
node scripts/audit-smoke-tests.mjs
node scripts/audit-no-phone-sms.mjs
node scripts/audit-no-removed-network.mjs
node --test scripts/test-trial-eligibility-api.cjs
node --test scripts/test-passkey-login-core.cjs
```

Expected: all commands pass. `audit-smoke-tests.mjs` warnings are acceptable only when the script exits with code 0.

---

#### Task 1: Move And Extend Redeem Channel State

**Files:**
- Move: `background/redeem/redeem-channel-state.js` -> `shared/redeem-channel-state.js`
- Modify: `background.js`
- Modify: `sidepanel/sidepanel.html`
- Modify: `scripts/audit-smoke-tests.mjs`
- Create: `scripts/test-redeem-channel-state.cjs`

- [ ] **Step 1: Write failing tests**

Create `scripts/test-redeem-channel-state.cjs`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

delete globalThis.MultiPageRedeemChannelState;
const policy = require('../shared/redeem-channel-state.js');

test('legacy failure count applies only when legacy channel matches', () => {
  assert.equal(policy.getRedeemChannelFailureCount({ redeemChannel: 'ideal', redeemFailureCount: 2 }, 'ideal'), 2);
  assert.equal(policy.getRedeemChannelFailureCount({ redeemChannel: 'ideal', redeemFailureCount: 2 }, 'upi'), 0);
});

test('UPI failures do not block an otherwise eligible UPI account', () => {
  assert.equal(policy.shouldRedeemItemUseChannel({ trialEligibilityStatus: 'eligible', upiRedeemFailureCount: 9 }, 'upi'), true);
});

test('trial eligibility and channel eligibility are preserved', () => {
  assert.equal(policy.shouldRedeemItemUseChannel({ trialEligibilityStatus: 'unknown' }, 'upi'), false);
  assert.equal(policy.shouldRedeemItemUseChannel(
    { trialEligibilityStatus: 'eligible' },
    'ideal',
    { isTrialEligibilityChannelAllowed: () => false }
  ), false);
});

test('IDEAL is locked after three IDEAL failures', () => {
  assert.equal(policy.isRedeemAccountLocked({ idealRedeemFailureCount: 3 }), true);
  assert.equal(policy.shouldRedeemItemUseChannel({ trialEligibilityStatus: 'eligible', idealRedeemFailureCount: 3 }, 'ideal'), false);
});

test('daily-limit blocking supports explicit until and legacy reason fields', () => {
  const nowMs = Date.parse('2026-07-06T00:00:00.000Z');
  assert.equal(policy.isRedeemChannelDailyLimitBlocked({
    upiRedeemDailyLimitBlockedUntil: '2026-07-06T01:00:00.000Z',
  }, 'upi', { nowMs }), true);
  assert.equal(policy.isRedeemChannelDailyLimitBlocked({
    redeemChannel: 'ideal',
    redeemReason: '该邮箱在该渠道今日提交次数已达上限 3 次 请 24 小时后再试',
    redeemLastFailedAt: '2026-07-05T23:00:00.000Z',
  }, 'ideal', { nowMs }), true);
});
```

- [ ] **Step 2: Confirm the test fails**

Run:

```powershell
node --test scripts/test-redeem-channel-state.cjs
```

Expected: FAIL because `../shared/redeem-channel-state.js` does not exist.

- [ ] **Step 3: Move the module**

Run:

```powershell
git mv background/redeem/redeem-channel-state.js shared/redeem-channel-state.js
```

- [ ] **Step 4: Extend the moved module**

In `shared/redeem-channel-state.js`, keep the existing IIFE style, add CommonJS export support, and expose these functions:

```javascript
const REDEEM_CHANNEL_FAILURE_LIMIT = 3;
const REDEEM_CHANNEL_DAILY_LIMIT_BLOCK_MS = 24 * 60 * 60 * 1000;

function normalizeRetryCount(value = 0) {
  const count = Math.floor(Number(value) || 0);
  return count > 0 ? count : 0;
}

function getRedeemChannelFailureCount(item = {}, channel = 'upi') {
  const normalizedChannel = normalizeRedeemChannel(channel);
  const field = getRedeemChannelFailureField(normalizedChannel);
  if (Object.prototype.hasOwnProperty.call(item || {}, field)) {
    return normalizeRetryCount(item?.[field]);
  }
  const legacyChannel = normalizeString(item?.redeemChannel || item?.channel || item?.paymentChannel)
    ? normalizeRedeemChannel(item.redeemChannel || item.channel || item.paymentChannel)
    : '';
  return legacyChannel === normalizedChannel ? normalizeRetryCount(item?.redeemFailureCount) : 0;
}

function isRedeemChannelDailyLimitBlocked(item = {}, channel = 'upi', options = {}) {
  const normalizedChannel = normalizeRedeemChannel(channel);
  const nowMs = Math.max(1, Math.floor(Number(options.nowMs) || Date.now()));
  const blockedUntil = Date.parse(normalizeString(item?.[getRedeemChannelDailyLimitBlockedUntilField(normalizedChannel)]));
  if (Number.isFinite(blockedUntil) && blockedUntil > nowMs) return true;
  const blockedAt = Date.parse(normalizeString(item?.[getRedeemChannelDailyLimitBlockedAtField(normalizedChannel)]));
  const storedReason = item?.[getRedeemChannelDailyLimitReasonField(normalizedChannel)];
  if (
    Number.isFinite(blockedAt)
    && blockedAt + REDEEM_CHANNEL_DAILY_LIMIT_BLOCK_MS > nowMs
    && isRedeemChannelDailyLimitReason(storedReason || item?.redeemReason || item?.reason)
  ) {
    return true;
  }
  const itemChannel = normalizeRedeemChannel(item?.redeemChannel || item?.channel || item?.paymentChannel);
  if (itemChannel !== normalizedChannel) return false;
  const legacyReason = item?.redeemReason || item?.reason || item?.remoteMessage;
  if (!isRedeemChannelDailyLimitReason(legacyReason)) return false;
  const legacyBlockedAt = Date.parse(normalizeString(item?.redeemLastFailedAt || item?.redeemAttemptedAt || item?.checkedAt || item?.updatedAt));
  return !Number.isFinite(legacyBlockedAt) || legacyBlockedAt + REDEEM_CHANNEL_DAILY_LIMIT_BLOCK_MS > nowMs;
}

function isRedeemAccountLocked(item = {}) {
  return item?.redeemLocked === true
    || getRedeemChannelFailureCount(item, 'ideal') >= REDEEM_CHANNEL_FAILURE_LIMIT;
}

function shouldRedeemItemUseChannel(item = {}, channel = 'upi', options = {}) {
  const normalizedChannel = normalizeRedeemChannel(channel);
  if (isRedeemAccountLocked(item)) return false;
  if (isRedeemChannelDailyLimitBlocked(item, normalizedChannel, options)) return false;
  if (options.requireTrialEligibility !== false && normalizeString(item?.trialEligibilityStatus).toLowerCase() !== 'eligible') return false;
  if (
    typeof options.isTrialEligibilityChannelAllowed === 'function'
    && !options.isTrialEligibilityChannelAllowed(item, normalizedChannel)
  ) {
    return false;
  }
  if (normalizedChannel === 'upi') return true;
  return getRedeemChannelFailureCount(item, normalizedChannel) < REDEEM_CHANNEL_FAILURE_LIMIT;
}
```

Add these names to the returned API:

```javascript
REDEEM_CHANNEL_FAILURE_LIMIT,
REDEEM_CHANNEL_DAILY_LIMIT_BLOCK_MS,
normalizeRetryCount,
getRedeemChannelFailureCount,
isRedeemChannelDailyLimitBlocked,
isRedeemAccountLocked,
shouldRedeemItemUseChannel,
```

Add CommonJS export support:

```javascript
(function attachRedeemChannelState(root, factory) {
  const api = factory();
  root.MultiPageRedeemChannelState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createRedeemChannelState() {
```

- [ ] **Step 5: Update load order**

In `background.js`, replace:

```javascript
'background/redeem/redeem-channel-state.js',
```

with:

```javascript
'shared/redeem-channel-state.js',
```

In `sidepanel/sidepanel.html`, insert before `cdk-pool-manager.js`:

```html
  <script src="../shared/redeem-channel-state.js"></script>
```

- [ ] **Step 6: Update audit contracts**

In `scripts/audit-smoke-tests.mjs`, update references from `background/redeem/redeem-channel-state.js` to `shared/redeem-channel-state.js`, and add:

```javascript
assertIncludes(background, "'shared/redeem-channel-state.js'", 'background redeem channel state script load');
assertIncludes(sidepanelHtml, 'src="../shared/redeem-channel-state.js"', 'sidepanel redeem channel state script load');
assertIncludes(redeemChannelState, 'getRedeemChannelFailureCount', 'redeem channel failure count helper');
assertIncludes(redeemChannelState, 'shouldRedeemItemUseChannel', 'redeem channel use policy helper');
assertFileLineCountAtMost('shared/redeem-channel-state.js', 700, 'redeem channel state size guard');
```

- [ ] **Step 7: Verify and commit**

Run:

```powershell
node --test scripts/test-redeem-channel-state.cjs
node --check shared/redeem-channel-state.js
node --check background.js
node scripts/audit-smoke-tests.mjs
git add shared/redeem-channel-state.js scripts/test-redeem-channel-state.cjs background.js sidepanel/sidepanel.html scripts/audit-smoke-tests.mjs
git add -u background/redeem/redeem-channel-state.js
git commit -m "refactor: share redeem channel state"
```

Expected: the commit contains one moved channel-state module, not two implementations.

---

#### Task 2: Delegate Redeem Channel Consumers

**Files:**
- Modify: `background/steps/upi-redeem.js`
- Modify: `background/upi-credential-membership-checker.js`
- Modify: `background/message-router.js`
- Modify: `sidepanel/account-records-manager.js`
- Modify: `sidepanel/cdk-pool-manager.js`

- [ ] **Step 1: Preserve contextual eligibility in background wrappers**

In `background/steps/upi-redeem.js` and `background/upi-credential-membership-checker.js`, replace `shouldRedeemItemUseChannel` with:

```javascript
function shouldRedeemItemUseChannel(item = {}, channel = 'upi') {
  const helper = getRedeemChannelStateHelpers().shouldRedeemItemUseChannel;
  if (typeof helper === 'function') {
    return helper(item, channel, {
      nowMs: now(),
      isTrialEligibilityChannelAllowed,
    });
  }
  if (isRedeemAccountLocked(item)) return false;
  if (isRedeemChannelDailyLimitBlocked(item, channel)) return false;
  if (normalizeString(item?.trialEligibilityStatus).toLowerCase() !== 'eligible') return false;
  if (!isTrialEligibilityChannelAllowed(item, channel)) return false;
  if (normalizeRedeemChannel(channel) === 'upi') return true;
  return getRedeemChannelFailureCount(item, channel) < REDEEM_CHANNEL_FAILURE_LIMIT;
}
```

- [ ] **Step 2: Delegate repeated field/count/daily-limit helpers**

In `background/steps/upi-redeem.js`, `background/upi-credential-membership-checker.js`, and `background/message-router.js`, keep local function names but delegate these bodies to `getRedeemChannelStateHelpers()`:

```text
normalizeRedeemChannel
getRedeemChannelFailureField
getRedeemChannelFailureCount
getRedeemChannelDailyLimitBlockedAtField
getRedeemChannelDailyLimitBlockedUntilField
getRedeemChannelDailyLimitReasonField
isRedeemChannelDailyLimitReason
isRedeemCrossRegionPaymentUnavailableReason
isRedeemChannelDailyLimitBlocked
isRedeemAccountLocked
```

Each fallback body must remain byte-for-byte equivalent to the current behavior until the task is committed.

- [ ] **Step 3: Add sidepanel helper lookup**

Near the top of `createAccountRecordsManager` in `sidepanel/account-records-manager.js`, add:

```javascript
function getRedeemChannelStateHelpers() {
  const rootScope = typeof window !== 'undefined' ? window : globalThis;
  return rootScope.MultiPageRedeemChannelState || {};
}
```

Delegate `normalizeRedeemChannel`, failure field/count helpers, daily-limit helpers, and lock helpers through this lookup while keeping their names.

- [ ] **Step 4: Delegate `sidepanel/cdk-pool-manager.js` normalizer**

Keep its local `normalizeRedeemChannel` name:

```javascript
function normalizeRedeemChannel(value = '') {
  const helper = globalScope.MultiPageRedeemChannelState?.normalizeRedeemChannel;
  if (typeof helper === 'function') return helper(value);
  return normalizeText(value).toLowerCase() === 'ideal' ? 'ideal' : 'upi';
}
```

- [ ] **Step 5: Verify and commit**

Run:

```powershell
node --test scripts/test-redeem-channel-state.cjs
node --check background/steps/upi-redeem.js
node --check background/upi-credential-membership-checker.js
node --check background/message-router.js
node --check sidepanel/account-records-manager.js
node --check sidepanel/cdk-pool-manager.js
node scripts/audit-smoke-tests.mjs
git add background/steps/upi-redeem.js background/upi-credential-membership-checker.js background/message-router.js sidepanel/account-records-manager.js sidepanel/cdk-pool-manager.js
git commit -m "refactor: delegate redeem channel helpers"
```

---

#### Task 3: Add Shared Membership Credential Format

**Files:**
- Create: `shared/membership-credential-format.js`
- Create: `scripts/test-membership-credential-format.cjs`
- Modify: `sidepanel/sidepanel.html`
- Modify: `scripts/audit-smoke-tests.mjs`

- [ ] **Step 1: Write failing parser/formatter tests**

Create `scripts/test-membership-credential-format.cjs`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

const format = require('../shared/membership-credential-format.js');

test('parses full 2FA Free row with URL and access token', () => {
  const row = format.parseCredentialLine(
    'a@icloud.com---pw---SECRET---https://assurivo.com/console/feed.php?mail=a%40icloud.com&pwd=x&limit=5---at-token---2026-07-06 15:00:00',
    { source: 'txt', nowMs: Date.parse('2026-07-06T07:00:00.000Z') }
  );
  assert.equal(row.email, 'a@icloud.com');
  assert.equal(row.password, 'pw');
  assert.equal(row.gptPassword, 'pw');
  assert.equal(row.totpMfaSecret, 'SECRET');
  assert.equal(row.verificationUrl, 'https://assurivo.com/console/open.php?mail=a%40icloud.com&pwd=x&limit=5');
  assert.equal(row.accessToken, 'at-token');
  assert.equal(row.accessTokenUpdatedAt, '2026-07-06 15:00:00');
  assert.equal(row.checkedAt, '2026-07-06 15:00:00');
  assert.equal(row.twoFactorEnabled, true);
  assert.equal(row.source, 'txt');
});

test('parses no-2FA Free row without shifting columns', () => {
  const row = format.parseCredentialLine(
    'a@icloud.com---https://assurivo.com/console/open.php?mail=a%40icloud.com&pwd=x&limit=5---at-token---2026-07-06 15:00:00',
    { source: 'txt' }
  );
  assert.equal(row.password, '');
  assert.equal(row.gptPassword, '');
  assert.equal(row.totpMfaSecret, '');
  assert.equal(row.no2faFreeRoute, true);
  assert.equal(row.twoFactorEnabled, false);
  assert.equal(row.accessToken, 'at-token');
});

test('parses Passkey marker with semicolon metadata', () => {
  const row = format.parseCredentialLine(
    'a@icloud.com---pw---PASSKEY:cred-1;signCount=7;alg=-7---https://assurivo.com/console/open.php?mail=a%40icloud.com&pwd=x&limit=5---at-token---2026-07-06 15:00:00',
    { source: 'txt' }
  );
  assert.equal(row.passkeyEnabled, true);
  assert.equal(row.passkeyCredentialId, 'cred-1');
  assert.equal(row.passkeySignCount, 7);
  assert.equal(row.passkeyAlg, -7);
  assert.equal(row.totpMfaSecret, '');
  assert.equal(row.twoFactorEnabled, true);
});

test('formats current Free export row shapes', () => {
  assert.equal(format.formatFreeCredentialLine({
    email: 'a@icloud.com',
    no2faFreeRoute: true,
    verificationUrl: 'https://assurivo.com/console/feed.php?mail=a%40icloud.com&pwd=x&limit=5',
    accessToken: 'at-token',
    checkedAt: '2026-07-06 15:00:00',
  }), 'a@icloud.com---https://assurivo.com/console/open.php?mail=a%40icloud.com&pwd=x&limit=5---at-token---2026-07-06 15:00:00');
});
```

- [ ] **Step 2: Create `shared/membership-credential-format.js`**

The module must attach `MultiPageMembershipCredentialFormat`, support CommonJS exports, and expose:

```javascript
normalizeText,
normalizeEmail,
normalizeTotpSecret,
isLikelyVerificationUrl,
isLikelyTimestamp,
normalizeVerificationUrlForExport,
normalizeRecordedAt,
isPasskeyMarker,
parsePasskeyMarker,
buildPasskeyMarker,
parseCredentialParts,
parseCredentialLine,
formatFreeCredentialLine,
```

Use these exact compatibility rules:

```javascript
function parseCredentialLine(line = '', options = {}) {
  return parseCredentialParts(String(line || '').trim().split(/---+/).map((part) => part.trim()), options);
}

function isPasskeyMarker(value = '') {
  return /^PASSKEY(?::|$)/i.test(normalizeText(value));
}

function parsePasskeyMarker(value = '') {
  const marker = normalizeText(value);
  if (!isPasskeyMarker(marker)) return { credentialId: '' };
  const [credentialIdPart, ...metadataParts] = marker.replace(/^PASSKEY:?/i, '').trim().split(';');
  const metadata = {};
  for (const part of metadataParts) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex <= 0) continue;
    const key = normalizeText(part.slice(0, separatorIndex)).toLowerCase();
    const rawValue = normalizeText(part.slice(separatorIndex + 1));
    if (!rawValue) continue;
    if (key === 'signcount' || key === 'sign_count') metadata.signCount = rawValue;
    if (key === 'alg') metadata.alg = rawValue;
  }
  return {
    credentialId: normalizeText(credentialIdPart),
    ...buildPasskeyNumericMetadataPatch(metadata),
  };
}
```

`parseCredentialParts(parts, options)` must return the same field names currently produced by both existing parsers:

```text
email
password
gptPassword
totpMfaSecret
verificationUrl
accessToken
accessTokenUpdatedAt
checkedAt
recordedAt
no2faFreeRoute
twoFactorEnabled
passkeyEnabled
passkeyCredentialId
passkeySignCount
passkeyAlg
source
```

- [ ] **Step 3: Load and audit the shared format**

In `sidepanel/sidepanel.html`, insert before `account-records-manager.js`:

```html
  <script src="../shared/membership-credential-format.js"></script>
```

In `scripts/audit-smoke-tests.mjs`, add the file to `checkCoreFiles()` and add:

```javascript
const membershipCredentialFormat = readText('shared/membership-credential-format.js');
assertIncludes(sidepanelHtml, 'src="../shared/membership-credential-format.js"', 'sidepanel membership credential format script load');
assertIncludes(membershipCredentialFormat, 'MultiPageMembershipCredentialFormat', 'membership credential format global');
assertIncludes(membershipCredentialFormat, 'formatFreeCredentialLine', 'membership Free export formatter');
assertFileLineCountAtMost('shared/membership-credential-format.js', 900, 'membership credential format size guard');
```

- [ ] **Step 4: Verify and commit**

Run:

```powershell
node --test scripts/test-membership-credential-format.cjs
node --check shared/membership-credential-format.js
node scripts/audit-smoke-tests.mjs
git add shared/membership-credential-format.js scripts/test-membership-credential-format.cjs sidepanel/sidepanel.html scripts/audit-smoke-tests.mjs
git commit -m "refactor: share membership credential format"
```

---

#### Task 4: Delegate Membership Credential Parsing And Free Export Formatting

**Files:**
- Modify: `background/upi-credential-membership-checker.js`
- Modify: `sidepanel/account-records-manager.js`

- [ ] **Step 1: Delegate background parser**

In `background/upi-credential-membership-checker.js`, add:

```javascript
function getMembershipCredentialFormat() {
  const rootScope = typeof self !== 'undefined' ? self : globalThis;
  return rootScope.MultiPageMembershipCredentialFormat || {};
}
```

Replace `parseCredentialBackupParts(parts = [])` with a delegating wrapper:

```javascript
function parseCredentialBackupParts(parts = []) {
  const helper = getMembershipCredentialFormat().parseCredentialParts;
  if (typeof helper === 'function') {
    return helper(parts, { nowMs: Date.now() });
  }
  return parseCredentialBackupPartsFallback(parts);
}
```

Rename the current body to `parseCredentialBackupPartsFallback(parts = [])` for this commit only.

- [ ] **Step 2: Delegate sidepanel parser**

In `sidepanel/account-records-manager.js`, add:

```javascript
function getMembershipCredentialFormat() {
  const rootScope = typeof window !== 'undefined' ? window : globalThis;
  return rootScope.MultiPageMembershipCredentialFormat || {};
}
```

Replace `parseUpiCredentialMembershipParts(parts = [])` with:

```javascript
function parseUpiCredentialMembershipParts(parts = []) {
  const helper = getMembershipCredentialFormat().parseCredentialParts;
  if (typeof helper === 'function') {
    return helper(parts, { source: 'txt', nowMs: Date.now() });
  }
  return parseUpiCredentialMembershipPartsFallback(parts);
}
```

Rename the current body to `parseUpiCredentialMembershipPartsFallback(parts = [])` for this commit only.

- [ ] **Step 3: Delegate Free export formatter**

In `buildResultExportRows`, replace only the `normalizedStatus === 'free'` formatting branch with:

```javascript
if (normalizedStatus === 'free') {
  const formatFreeCredentialLine = getMembershipCredentialFormat().formatFreeCredentialLine;
  if (typeof formatFreeCredentialLine === 'function') {
    return formatFreeCredentialLine({
      ...item,
      checkedAt: formatNo2faFreeExportTime(getNo2faFreeExportTimestamp(item)),
    });
  }
  return buildResultExportRowsFreeFallback(item);
}
```

Move the old Free branch into `buildResultExportRowsFreeFallback(item = {})` for this commit only.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
node --test scripts/test-membership-credential-format.cjs
node --test scripts/test-passkey-login-core.cjs
node --check background/upi-credential-membership-checker.js
node --check sidepanel/account-records-manager.js
node scripts/audit-smoke-tests.mjs
git add background/upi-credential-membership-checker.js sidepanel/account-records-manager.js
git commit -m "refactor: delegate membership credential format"
```

---

#### Task 5: Extend Existing CDK Usage Helper

**Files:**
- Modify: `background/redeem/redeem-cdkey-usage.js`
- Modify: `background/steps/upi-redeem.js`
- Create: `scripts/test-redeem-cdkey-usage.cjs`

- [ ] **Step 1: Write failing tests**

Create `scripts/test-redeem-cdkey-usage.cjs`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

delete globalThis.MultiPageRedeemChannelState;
delete globalThis.MultiPageRedeemCdkeyUsage;
require('../shared/redeem-channel-state.js');
const usage = require('../background/redeem/redeem-cdkey-usage.js');

test('reads legacy UPI CDK pool aliases', () => {
  assert.equal(usage.getRedeemChannelPoolText({ cdkPoolText: 'A\nB' }, 'upi'), 'A\nB');
});

test('filters unavailable CDKs from pool text', () => {
  assert.deepEqual(usage.getAvailableCdkeys('A\nB\nC', {
    A: { enabled: false },
    B: { usedAt: '2026-07-06T00:00:00.000Z' },
    C: { remoteStatus: 'failed' },
  }), ['C']);
  assert.deepEqual(usage.getAvailableCdkeys('A\nB', {
    A: { remoteStatus: 'pending' },
    B: { usedAt: '2026-07-06T00:00:00.000Z', recoverable: true },
  }), ['B']);
});
```

- [ ] **Step 2: Extend current module, not a new module**

In `background/redeem/redeem-cdkey-usage.js`, add CommonJS export support and these helpers:

```javascript
function parseCdkeyPoolText(value = '') {
  return String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function normalizeCdkeyUsage(rawUsage = {}) {
  return rawUsage && typeof rawUsage === 'object' && !Array.isArray(rawUsage) ? rawUsage : {};
}

function isActiveRemoteStatus(status = '') {
  return /^(submitted|pending|processing|running|审核中)$/i.test(String(status || '').trim());
}

function isSelectableUsageEntry(entry = {}) {
  if (!entry || typeof entry !== 'object') return true;
  if (entry.enabled === false) return false;
  if (entry.usedAt && !entry.recoverable) return false;
  if (isActiveRemoteStatus(entry.remoteStatus)) return false;
  return true;
}

function getAvailableCdkeys(poolText = '', usage = {}) {
  const normalizedUsage = normalizeCdkeyUsage(usage);
  return parseCdkeyPoolText(poolText).filter((cdkey) => isSelectableUsageEntry(normalizedUsage[cdkey]));
}
```

Add all five helper names to the returned API.

- [ ] **Step 3: Delegate CDK selection in `background/steps/upi-redeem.js`**

Add this wrapper:

```javascript
function getAvailableCdkeysForChannel(state = {}, channel = 'upi') {
  const helper = getRedeemCdkeyUsageHelpers().getAvailableCdkeys;
  const poolText = getRedeemChannelPoolText(state, channel);
  const usage = getRedeemChannelUsage(state, channel);
  if (typeof helper === 'function') return helper(poolText, usage);
  return String(poolText || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}
```

Use it where the file currently reads pool text and filters usage inline.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
node --test scripts/test-redeem-cdkey-usage.cjs
node --check background/redeem/redeem-cdkey-usage.js
node --check background/steps/upi-redeem.js
node scripts/audit-smoke-tests.mjs
git add background/redeem/redeem-cdkey-usage.js background/steps/upi-redeem.js scripts/test-redeem-cdkey-usage.cjs
git commit -m "refactor: extend redeem CDK usage helper"
```

---

#### Task 6: Split UPI Redeem API Client

**Files:**
- Create: `background/redeem/upi-redeem-api-client.js`
- Modify: `background.js`
- Modify: `background/steps/upi-redeem.js`
- Create: `scripts/test-upi-redeem-api-client.cjs`

- [ ] **Step 1: Write API client tests**

Create `scripts/test-upi-redeem-api-client.cjs`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

const api = require('../background/redeem/upi-redeem-api-client.js');

test('redeemCdkey posts JSON with auth headers', async () => {
  const requests = [];
  const client = api.createUpiRedeemApiClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
    },
  });
  const payload = await client.redeemCdkey({
    apiUrl: 'https://example.test/redeem',
    externalApiKey: 'key',
    clientId: 'client',
    cdkey: 'CDK',
    session: 'session',
    accessToken: 'at',
    channel: 'ideal',
  });
  assert.deepEqual(payload, { ok: true });
  assert.equal(requests[0].options.headers.authorization, 'Bearer key');
  assert.equal(JSON.parse(requests[0].options.body).channel, 'ideal');
});

test('postJson throws payload error on non-OK response', async () => {
  const client = api.createUpiRedeemApiClient({
    fetchImpl: async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ error: 'bad cdk' }) }),
  });
  await assert.rejects(() => client.postJson({ url: 'https://example.test', body: {} }), /bad cdk/);
});
```

- [ ] **Step 2: Create the client module**

Create `background/redeem/upi-redeem-api-client.js` exposing:

```javascript
createUpiRedeemApiClient
```

The factory must return:

```javascript
postJson
redeemCdkey
checkEligibility
```

The `redeemCdkey` request body must be:

```javascript
{ cdkey, session, accessToken, channel }
```

The headers must include:

```javascript
authorization: `Bearer ${externalApiKey}`,
'x-client-id': clientId,
'content-type': 'application/json'
```

- [ ] **Step 3: Load and wire**

In `background.js`, add after `background/redeem/redeem-cdkey-usage.js`:

```javascript
'background/redeem/upi-redeem-api-client.js',
```

In `background/steps/upi-redeem.js`, instantiate:

```javascript
const upiRedeemApiClient = self.MultiPageUpiRedeemApiClient?.createUpiRedeemApiClient?.({ fetchImpl }) || null;
```

Replace `postUPIJson` and `postEligibilityCheckJson` bodies with calls to the client while keeping their old names as wrappers.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
node --test scripts/test-upi-redeem-api-client.cjs
node --check background/redeem/upi-redeem-api-client.js
node --check background/steps/upi-redeem.js
node --check background.js
node scripts/audit-smoke-tests.mjs
git add background/redeem/upi-redeem-api-client.js background/steps/upi-redeem.js background.js scripts/test-upi-redeem-api-client.cjs
git commit -m "refactor: split UPI redeem API client"
```

---

#### Task 7: Split Membership Results Store

**Files:**
- Create: `background/membership/results-store.js`
- Modify: `background.js`
- Modify: `background/upi-credential-membership-checker.js`
- Create: `scripts/test-membership-results-store.cjs`

- [ ] **Step 1: Create store test**

Create `scripts/test-membership-results-store.cjs`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

const moduleApi = require('../background/membership/results-store.js');

test('saveResults normalizes, merges deletion state, persists, and broadcasts', async () => {
  const stored = {
    upiCredentialMembershipCheckResults: {
      items: [{ email: 'old@example.com' }],
      redeemPlusDeletedEmailsByChannel: { ideal: ['gone@example.com'] },
    },
  };
  const writes = [];
  const broadcasts = [];
  const store = moduleApi.createMembershipResultsStore({
    chromeApi: { storage: { local: { get: async () => stored, set: async (patch) => writes.push(patch) } } },
    storageKey: 'upiCredentialMembershipCheckResults',
    normalizeResultsPayload: (value) => ({
      items: Array.isArray(value?.items) ? value.items : [],
      redeemPlusDeletedEmailsByChannel: value?.redeemPlusDeletedEmailsByChannel || {},
    }),
    mergeRedeemDeletionStateForSave: (previous) => ({
      redeemPlusDeletedEmailsByChannel: previous.redeemPlusDeletedEmailsByChannel,
    }),
    broadcastDataUpdate: (patch) => broadcasts.push(patch),
  });
  const saved = await store.saveResults({ items: [{ email: 'new@example.com' }] });
  assert.equal(saved.items[0].email, 'new@example.com');
  assert.deepEqual(saved.redeemPlusDeletedEmailsByChannel, { ideal: ['gone@example.com'] });
  assert.equal(writes.length, 1);
  assert.equal(broadcasts.length, 1);
});
```

- [ ] **Step 2: Create `background/membership/results-store.js`**

Expose `MultiPageMembershipResultsStore.createMembershipResultsStore(deps)` with:

```javascript
async function getStoredResults() {
  const stored = await chromeApi.storage.local.get([storageKey]).catch(() => ({}));
  return normalizeResultsPayload(stored?.[storageKey]);
}

async function saveResults(results = {}) {
  const stored = await chromeApi.storage.local.get([storageKey]).catch(() => ({}));
  const previousPayload = normalizeResultsPayload(stored?.[storageKey]);
  const payload = normalizeResultsPayload({
    ...results,
    ...mergeRedeemDeletionStateForSave(previousPayload, results),
  });
  await chromeApi.storage.local.set({ [storageKey]: payload });
  if (typeof setState === 'function') await setState({ [storageKey]: payload }).catch(() => {});
  broadcastDataUpdate({ [storageKey]: payload });
  return payload;
}
```

- [ ] **Step 3: Load and wire**

In `background.js`, add before `background/upi-credential-membership-checker.js`:

```javascript
'background/membership/results-store.js',
```

Inside `createUpiCredentialMembershipChecker`, instantiate the store and replace local result get/save storage calls.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
node --test scripts/test-membership-results-store.cjs
node --check background/membership/results-store.js
node --check background/upi-credential-membership-checker.js
node --check background.js
node scripts/audit-smoke-tests.mjs
git add background/membership/results-store.js background/upi-credential-membership-checker.js background.js scripts/test-membership-results-store.cjs
git commit -m "refactor: split membership results store"
```

---

#### Task 8: Split Sidepanel Membership View Model

**Files:**
- Create: `sidepanel/membership-view-model.js`
- Modify: `sidepanel/account-records-manager.js`
- Modify: `sidepanel/sidepanel.html`
- Create: `scripts/test-membership-view-model.cjs`

- [ ] **Step 1: Create view-model tests**

Create `scripts/test-membership-view-model.cjs`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

const vm = require('../sidepanel/membership-view-model.js');

test('groups paid rows by redeem channel and keeps free rows separate', () => {
  assert.equal(vm.getGroup({ status: 'paid', redeemChannel: 'ideal' }), 'ideal-plus');
  assert.equal(vm.getGroup({ status: 'paid', redeemChannel: 'upi' }), 'upi-plus');
  assert.equal(vm.getGroup({ status: 'free', redeemChannel: 'ideal' }), 'free');
});

test('buildRows normalizes email and summarize counts groups', () => {
  const rows = vm.buildRows({ items: [
    { email: 'A@icloud.com', status: 'free', accessToken: 'at' },
    { email: 'B@icloud.com', status: 'paid', redeemChannel: 'ideal' },
  ] });
  assert.deepEqual(rows.map((row) => row.email), ['a@icloud.com', 'b@icloud.com']);
  assert.deepEqual(vm.summarize(rows), { total: 2, withAt: 1, free: 1, 'upi-plus': 0, 'ideal-plus': 1 });
});
```

- [ ] **Step 2: Create `sidepanel/membership-view-model.js`**

Expose:

```javascript
buildRows
summarize
getGroup
```

with CommonJS export support for Node tests and `window.SidepanelMembershipViewModel` for the sidepanel.

- [ ] **Step 3: Load and delegate**

In `sidepanel/sidepanel.html`, insert before `account-records-manager.js`:

```html
  <script src="membership-view-model.js"></script>
```

In `sidepanel/account-records-manager.js`, keep old display-row function names and delegate pure grouping/counting to:

```javascript
const membershipViewModel = globalScope.SidepanelMembershipViewModel;
```

- [ ] **Step 4: Verify and commit**

Run:

```powershell
node --test scripts/test-membership-view-model.cjs
node --check sidepanel/membership-view-model.js
node --check sidepanel/account-records-manager.js
node scripts/audit-smoke-tests.mjs
git add sidepanel/membership-view-model.js sidepanel/account-records-manager.js sidepanel/sidepanel.html scripts/test-membership-view-model.cjs
git commit -m "refactor: split membership view model"
```

---

#### Task 9: Split Sidepanel Workflow Managers Without Duplicating Settings Transfer

**Files:**
- Create: `sidepanel/settings-state-manager.js`
- Create: `sidepanel/workflow-controls-manager.js`
- Modify: `sidepanel/sidepanel.js`
- Modify: `sidepanel/sidepanel.html`

- [ ] **Step 1: Create `sidepanel/settings-state-manager.js`**

```javascript
(function attachSettingsStateManager(root) {
  function createSettingsStateManager(context = {}) {
    const { helpers = {} } = context;
    return {
      collectSettingsPayload: () => helpers.collectSettingsPayload(),
      applySettingsToForm: (settings = {}) => helpers.applySettingsToForm(settings),
    };
  }
  root.SidepanelSettingsStateManager = { createSettingsStateManager };
})(window);
```

- [ ] **Step 2: Create `sidepanel/workflow-controls-manager.js`**

```javascript
(function attachWorkflowControlsManager(root) {
  function createWorkflowControlsManager(context = {}) {
    const { helpers = {} } = context;
    return {
      startAutoRun: (...args) => helpers.startAutoRun(...args),
      continueAutoRun: (...args) => helpers.continueAutoRun(...args),
      stopCurrentOperation: (...args) => helpers.stopCurrentOperation(...args),
      resetState: (...args) => helpers.resetState(...args),
      renderStepsList: (...args) => helpers.renderStepsList(...args),
      renderStepStatuses: (...args) => helpers.renderStepStatuses(...args),
    };
  }
  root.SidepanelWorkflowControlsManager = { createWorkflowControlsManager };
})(window);
```

- [ ] **Step 3: Load managers**

In `sidepanel/sidepanel.html`, insert after `settings-transfer-manager.js`:

```html
  <script src="settings-state-manager.js"></script>
  <script src="workflow-controls-manager.js"></script>
```

- [ ] **Step 4: Wire managers**

In `sidepanel/sidepanel.js`, instantiate both managers near the existing `settingsTransferManager`. Keep `SidepanelSettingsTransferManager` as the only import/export manager.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
node --check sidepanel/settings-state-manager.js
node --check sidepanel/workflow-controls-manager.js
node --check sidepanel/sidepanel.js
node scripts/audit-smoke-tests.mjs
git add sidepanel/settings-state-manager.js sidepanel/workflow-controls-manager.js sidepanel/sidepanel.js sidepanel/sidepanel.html
git commit -m "refactor: split sidepanel workflow managers"
```

---

#### Task 10: Split Background State Registries

**Files:**
- Create: `background/persistent-settings.js`
- Create: `background/custom-email-pool-state.js`
- Create: `background/registration-account-state.js`
- Modify: `background.js`

- [ ] **Step 1: Create `background/persistent-settings.js`**

```javascript
(function attachPersistentSettings(root) {
  function createPersistentSettingsModule(defaults = {}) {
    const keys = Object.keys(defaults);
    function pickPersistedSettings(source = {}) {
      return Object.fromEntries(keys.map((key) => [key, source[key] ?? defaults[key]]));
    }
    return { defaults, keys, pickPersistedSettings };
  }
  root.MultiPagePersistentSettings = { createPersistentSettingsModule };
})(self);
```

- [ ] **Step 2: Create state wrapper modules**

Create `background/custom-email-pool-state.js`:

```javascript
(function attachCustomEmailPoolState(root) {
  function createCustomEmailPoolState(deps = {}) {
    return {
      getCustomEmailPoolEntries: deps.getCustomEmailPoolEntries,
      markCustomEmailPoolEntryTrialEligibility: deps.markCustomEmailPoolEntryTrialEligibility,
      markCurrentCustomEmailPoolEntryUsed: deps.markCurrentCustomEmailPoolEntryUsed,
      markCurrentCustomEmailPoolEntryTrialIneligible: deps.markCurrentCustomEmailPoolEntryTrialIneligible,
    };
  }
  root.MultiPageCustomEmailPoolState = { createCustomEmailPoolState };
})(self);
```

Create `background/registration-account-state.js`:

```javascript
(function attachRegistrationAccountState(root) {
  function createRegistrationAccountState(deps = {}) {
    return {
      markCurrentRegistrationAccountUsed: deps.markCurrentRegistrationAccountUsed,
      markCurrentRegistrationAccountTrialIneligible: deps.markCurrentRegistrationAccountTrialIneligible,
      recordStep7AccountCheckpoint: deps.recordStep7AccountCheckpoint,
    };
  }
  root.MultiPageRegistrationAccountState = { createRegistrationAccountState };
})(self);
```

- [ ] **Step 3: Load and delegate**

In `background.js`, load after `background/registration-email-state.js`:

```javascript
'background/persistent-settings.js',
'background/custom-email-pool-state.js',
'background/registration-account-state.js',
```

Instantiate each module with current local functions as dependencies, then replace callers one group at a time.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
node --check background/persistent-settings.js
node --check background/custom-email-pool-state.js
node --check background/registration-account-state.js
node --check background.js
node scripts/audit-smoke-tests.mjs
git add background/persistent-settings.js background/custom-email-pool-state.js background/registration-account-state.js background.js
git commit -m "refactor: split background state registries"
```

---

#### Task 11: Thin Message Router Into Route Handlers

**Files:**
- Create: `background/routes/membership-routes.js`
- Create: `background/routes/cdkey-routes.js`
- Create: `background/routes/workflow-routes.js`
- Modify: `background/message-router.js`
- Modify: `background.js`

- [ ] **Step 1: Create route factories**

Create `background/routes/membership-routes.js`:

```javascript
(function attachMembershipRoutes(root) {
  function createMembershipRoutes(deps = {}) {
    return {
      async CHECK_UPI_CREDENTIAL_MEMBERSHIP(payload) {
        return deps.checkUpiCredentialMembershipBatch(payload);
      },
      async CHECK_UPI_CREDENTIAL_MEMBERSHIP_TRIAL_ELIGIBILITY(payload) {
        return deps.checkUpiCredentialMembershipTrialEligibility(payload);
      },
      async FILL_UPI_CREDENTIAL_MEMBERSHIP_FREE_ACCESS_TOKENS(payload) {
        return deps.fillUpiCredentialMembershipFreeAccessTokens(payload);
      },
    };
  }
  root.MultiPageMembershipRoutes = { createMembershipRoutes };
})(self);
```

Create `background/routes/cdkey-routes.js`:

```javascript
(function attachCdkeyRoutes(root) {
  function createCdkeyRoutes(deps = {}) {
    return {
      async REFRESH_UPI_REDEEM_CDKEY_STATUSES(payload) {
        return deps.refreshPendingUpiCredentialMembershipRedeemStatuses(payload);
      },
      async CANCEL_UPI_REDEEM_CDKEY_JOBS(payload) {
        return deps.cancelPendingUpiCredentialMembershipRedeemJobs(payload);
      },
      async RETRY_UPI_REDEEM_CDKEY_JOBS(payload) {
        return deps.retryFailedUpiRedeemCdkeyJobs(payload);
      },
    };
  }
  root.MultiPageCdkeyRoutes = { createCdkeyRoutes };
})(self);
```

Create `background/routes/workflow-routes.js`:

```javascript
(function attachWorkflowRoutes(root) {
  function createWorkflowRoutes(deps = {}) {
    return {
      async START_AUTO_RUN(payload) {
        return deps.startAutoRun(payload);
      },
      async STOP_CURRENT_OPERATION(payload) {
        return deps.stopCurrentOperation(payload);
      },
      async EXECUTE_NODE(payload) {
        return deps.executeNode(payload);
      },
      async RESET_STATE(payload) {
        return deps.resetState(payload);
      },
    };
  }
  root.MultiPageWorkflowRoutes = { createWorkflowRoutes };
})(self);
```

- [ ] **Step 2: Load and dispatch route table**

In `background.js`, load route files before `background/message-router.js`.

In `background/message-router.js`, build:

```javascript
const routeHandlers = {
  ...self.MultiPageMembershipRoutes.createMembershipRoutes(deps),
  ...self.MultiPageCdkeyRoutes.createCdkeyRoutes(deps),
  ...self.MultiPageWorkflowRoutes.createWorkflowRoutes(deps),
};
```

At the top of `handleMessage`:

```javascript
if (routeHandlers[type]) {
  return routeHandlers[type](payload, rawMessage, sender);
}
```

Remove old switch cases only after each route path passes audit.

- [ ] **Step 3: Verify and commit**

Run:

```powershell
node --check background/routes/membership-routes.js
node --check background/routes/cdkey-routes.js
node --check background/routes/workflow-routes.js
node --check background/message-router.js
node --check background.js
node scripts/audit-smoke-tests.mjs
git add background/routes/membership-routes.js background/routes/cdkey-routes.js background/routes/workflow-routes.js background/message-router.js background.js
git commit -m "refactor: split background message routes"
```

---

#### Task 12: Split Remaining Auth Content Page By Page Type

**Files:**
- Create: `content/signup-password-page.js`
- Create: `content/signup-profile-page.js`
- Create: `content/signup-session-page.js`
- Modify: `content/signup-page.js`
- Modify: `manifest.json`
- Modify: `scripts/audit-smoke-tests.mjs`

- [ ] **Step 1: Create page modules**

Create `content/signup-password-page.js`:

```javascript
(function attachSignupPasswordPage(root) {
  function createSignupPasswordPage(deps = {}) {
    return {
      setPassword: deps.setPassword,
      detectPasswordPage: deps.detectPasswordPage,
    };
  }
  root.MultiPageSignupPasswordPage = { createSignupPasswordPage };
})(self);
```

Create `content/signup-profile-page.js`:

```javascript
(function attachSignupProfilePage(root) {
  function createSignupProfilePage(deps = {}) {
    return {
      detectProfilePage: deps.detectProfilePage,
      fillProfileNameAndBirthday: deps.fillProfileNameAndBirthday,
      submitProfilePage: deps.submitProfilePage,
    };
  }
  root.MultiPageSignupProfilePage = { createSignupProfilePage };
})(self);
```

Create `content/signup-session-page.js`:

```javascript
(function attachSignupSessionPage(root) {
  function createSignupSessionPage(deps = {}) {
    return {
      readChatGptSession: deps.readChatGptSession,
      extractAccessToken: deps.extractAccessToken,
      detectLoggedInHome: deps.detectLoggedInHome,
    };
  }
  root.MultiPageSignupSessionPage = { createSignupSessionPage };
})(self);
```

- [ ] **Step 2: Update manifest order**

In `manifest.json`, load new scripts after existing signup helpers and before `content/signup-page.js`:

```json
"content/signup-dom-utils.js",
"content/signup-entry-page.js",
"content/signup-verification-page.js",
"content/signup-password-page.js",
"content/signup-profile-page.js",
"content/signup-session-page.js",
"content/signup-page.js"
```

- [ ] **Step 3: Move real helper bodies**

Move password/profile/session helper bodies from `content/signup-page.js` into their modules. Keep compatibility wrappers in `content/signup-page.js` for this commit.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
node --check content/signup-password-page.js
node --check content/signup-profile-page.js
node --check content/signup-session-page.js
node --check content/signup-page.js
node scripts/audit-smoke-tests.mjs
git add content/signup-password-page.js content/signup-profile-page.js content/signup-session-page.js content/signup-page.js manifest.json scripts/audit-smoke-tests.mjs
git commit -m "refactor: split signup page handlers"
```

---

### Recommended Execution Order

1. Task 1: move and extend redeem channel state.
2. Task 2: delegate redeem channel consumers.
3. Task 3: add shared membership credential format.
4. Task 4: delegate membership credential parsing and Free export formatting.
5. Task 5: extend existing CDK usage helper.
6. Task 6: split UPI redeem API client.
7. Task 7: split membership results store.
8. Task 8: split sidepanel membership view model.
9. Task 9: split sidepanel workflow managers.
10. Task 10: split background state registries.
11. Task 11: split background message routes.
12. Task 12: split remaining signup page handlers.

Do not start with a wholesale `background.js` split. Start with pure helpers and parser/formatter tests because those protect Free import/export, Passkey, no-2FA Free, UPI/IDEAL channel selection, and CDK auto-redeem behavior.

### Final Verification

Run:

```powershell
node scripts/module-size-report.mjs
node scripts/audit-smoke-tests.mjs
node scripts/audit-no-phone-sms.mjs
node scripts/audit-no-removed-network.mjs
node --test scripts/test-trial-eligibility-api.cjs
node --test scripts/test-passkey-login-core.cjs
node --test scripts/test-redeem-channel-state.cjs
node --test scripts/test-membership-credential-format.cjs
node --test scripts/test-redeem-cdkey-usage.cjs
node --test scripts/test-upi-redeem-api-client.cjs
node --test scripts/test-membership-results-store.cjs
node --test scripts/test-membership-view-model.cjs
$failed=@()
git ls-files '*.js' '*.mjs' | ForEach-Object {
  node --check $_
  if ($LASTEXITCODE -ne 0) { $failed += $_ }
}
if ($failed.Count) {
  Write-Error ('FAILED: ' + ($failed -join ', '))
  exit 1
}
Write-Output 'All tracked JS/MJS files passed node --check.'
```

Manual smoke:

- Main flow through steps 1-7 with full 2FA route.
- Main flow through Passkey route.
- Main flow through no-2FA Free route.
- Custom email pool row `检查资格` with saved AT.
- Free export/import for full 2FA, Passkey, and no-2FA formats.
- UPI one-click redeem, IDEAL one-click redeem, and all redeem.
- Remote CDK status refresh after failure.
- Delete UPI Plus and IDEAL Plus and confirm deleted Plus rows do not return after refresh.
- Fingerprint browser config export produces a `.json` filename through the current download service.

### Self-Review

- Spec coverage: The plan covers all current hotspots and preserves existing behavior gates for registration, custom email pool, Free/Plus, UPI/IDEAL redeem, Passkey, export, and fingerprint-browser download behavior.
- Placeholder scan: No task creates duplicate modules for existing responsibilities. Every new module has a concrete API, exact load location, exact verification command, and commit message.
- Type consistency: Shared/background globals use `MultiPage*`; sidepanel globals use `Sidepanel*`; CommonJS export fallbacks are added only to modules tested directly by Node.

Plan complete and saved to `docs/superpowers/plans/2026-07-06-current-code-splitting-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

---

<a id="2026-07-06-passkey-at-login-optimization"></a>

<!-- archived-from: docs/superpowers/plans/2026-07-06-passkey-at-login-optimization.md -->

## Passkey AT Login Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize Passkey Free accounts so “一键补充 AT” and row “登录” prefer the Nerver Passkey login API used by `C:/Users/Z1803/Downloads/gpt-login-ext`, then fall back to the existing web login when the API cannot complete.

**Architecture:** Add a small pure helper for Passkey login request/response/cookie normalization, then wire it into `background/upi-credential-membership-checker.js` before the current browser login path. Successful API login stores the returned AT immediately and, when cookies/sessionToken are returned, can inject ChatGPT cookies to make the browser login state available. Existing email-code/TOTP browser login remains the fallback.

**Tech Stack:** Chrome MV3 extension, vanilla JavaScript, `chrome.cookies`, `chrome.tabs`, Nerver `/api/v1/passkey/login`, Node `node:test` smoke tests.

---

### Reference Findings

- Reference folder: `C:/Users/Z1803/Downloads/gpt-login-ext`.
- Reference login endpoint: `https://cha.nerver.cc/api/v1/passkey/login`.
- Reference request body is built from:

```javascript
{
  email,
  deviceId,
  credentialId,
  privateJwk,
  rpId,
  userHandle,
  signCount,
  alg
}
```

- Reference response accepts:
  - `accessToken` / `access_token`
  - `cookies` as object map or array
  - `sessionToken` / `session_token`
- Reference cookie behavior:
  - normalize object cookies to `.chatgpt.com`, `/`, `secure: true`, `sameSite: 'lax'`
  - preserve array cookie attributes when returned by backend
  - support sessionToken fallback when no cookies are returned

### Current Project Findings

- Current補 AT entrypoint: `C:/Users/Z1803/Downloads/projict/cdk-redeem-only-extension-main/background/upi-credential-membership-checker.js:4819` `fillUpiCredentialMembershipFreeAccessTokens()`.
- Current login implementation: `background/upi-credential-membership-checker.js:3423` `loginAndReadAccessToken()`.
- Current behavior: clear OpenAI cookies, open ChatGPT login page, fill email/password, handle email code or TOTP, then read session/AT from page.
- Existing Passkey registration persists usable fields in `background/steps/enable-passkey.js:856-878`:
  - `passkeyCredentialId`
  - `passkeyFactorId`
  - `passkeyRpId`
  - `passkeyUserHandle`
  - `passkeyPrivateJwk`
  - `passkeyPublicKeyCose`
  - `passkeyApiPersisted`
- Current worktree already has unrelated local `pm-unavailable` classification changes in:
  - `background/message-router.js`
  - `background/redeem/redeem-channel-state.js`
  - `background/steps/upi-redeem.js`
  - `background/upi-credential-membership-checker.js`

---

#### Task 0: Protect Existing Local Changes

**Files:**
- Inspect only: `C:/Users/Z1803/Downloads/projict/cdk-redeem-only-extension-main`

- [ ] **Step 1: Check current worktree**

Run:

```powershell
git status --short
```

Expected before starting this plan:

```text
 M background/message-router.js
 M background/redeem/redeem-channel-state.js
 M background/steps/upi-redeem.js
 M background/upi-credential-membership-checker.js
```

- [ ] **Step 2: Commit or stash the `pm-unavailable` change first**

Recommended commit:

```powershell
git add background/message-router.js background/redeem/redeem-channel-state.js background/steps/upi-redeem.js background/upi-credential-membership-checker.js
git commit -m "fix: lock accounts on pm-unavailable redeem failure"
```

Expected:

```text
[main <hash>] fix: lock accounts on pm-unavailable redeem failure
```

- [ ] **Step 3: Confirm clean start**

Run:

```powershell
git status --short
```

Expected:

```text
```

---

#### Task 1: Add Pure Passkey Login Helper

**Files:**
- Create: `C:/Users/Z1803/Downloads/projict/cdk-redeem-only-extension-main/background/passkey-login-core.js`
- Create: `C:/Users/Z1803/Downloads/projict/cdk-redeem-only-extension-main/scripts/test-passkey-login-core.cjs`
- Modify: `C:/Users/Z1803/Downloads/projict/cdk-redeem-only-extension-main/background.js:3-63`

- [ ] **Step 1: Create the helper file**

Create `background/passkey-login-core.js`:

```javascript
(function attachPasskeyLoginCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.MultiPagePasskeyLoginCore = api;
})(typeof self !== 'undefined' ? self : globalThis, function createPasskeyLoginCore() {
  const DEFAULT_COOKIE_DOMAIN = '.chatgpt.com';
  const DEFAULT_COOKIE_PATH = '/';
  const OPTIONAL_LOGIN_FIELDS = [
    'deviceId',
    'credentialId',
    'privateJwk',
    'rpId',
    'userHandle',
    'signCount',
    'alg',
  ];
  const FAILURE_MESSAGES = Object.freeze({
    'missing-credential': '没有找到该邮箱的 Passkey 凭据',
    'rate-limited': '请求太频繁，请稍后再试',
    'server-error': '服务器错误，请稍后重试',
  });
  const SAME_SITE_VALUES = Object.freeze({
    lax: true,
    strict: true,
    no_restriction: true,
    unspecified: true,
  });

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
  }

  function hasProvidedValue(value) {
    return value !== undefined && value !== null && value !== '';
  }

  function ownValue(object, key) {
    return object && hasOwn(object, key) ? object[key] : undefined;
  }

  function defineOwn(object, key, value) {
    Object.defineProperty(object, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }

  function cleanToken(value = '') {
    return String(value || '').trim().replace(/[\r\n]/g, '');
  }

  function isValidEmail(value = '') {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  function normalizeSameSite(value) {
    if (!hasProvidedValue(value)) return 'lax';
    const normalized = String(value).trim().toLowerCase();
    if (normalized === 'none') return 'no_restriction';
    if (hasOwn(SAME_SITE_VALUES, normalized)) return normalized;
    return 'lax';
  }

  function normalizeExpirationDate(value) {
    if (value === undefined || value === null || value === '') return null;
    const expirationDate = Number(value);
    if (!Number.isFinite(expirationDate) || expirationDate <= 0) return null;
    return expirationDate;
  }

  function buildPasskeyLoginRequest(email, options = {}) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      throw new Error('请输入正确的邮箱');
    }
    const body = { email: normalizedEmail };
    OPTIONAL_LOGIN_FIELDS.forEach((key) => {
      if (hasOwn(options, key) && hasProvidedValue(options[key])) {
        body[key] = options[key];
      }
    });
    return body;
  }

  function normalizeCookieEntry(cookie, options = {}) {
    if (!cookie || typeof cookie !== 'object' || Array.isArray(cookie)) return null;
    const name = String(ownValue(cookie, 'name') || '').trim();
    const value = ownValue(cookie, 'value');
    if (!name || value === undefined || value === null) return null;

    const isHostCookie = name.startsWith('__Host-');
    const pathValue = ownValue(cookie, 'path');
    const secureValue = ownValue(cookie, 'secure');
    const entry = {
      name,
      value: String(value),
      path: isHostCookie ? DEFAULT_COOKIE_PATH : (hasProvidedValue(pathValue) ? String(pathValue) : DEFAULT_COOKIE_PATH),
      secure: isHostCookie ? true : (secureValue === undefined ? true : Boolean(secureValue)),
      httpOnly: ownValue(cookie, 'httpOnly') === true,
      sameSite: normalizeSameSite(ownValue(cookie, 'sameSite')),
    };

    if (!isHostCookie) {
      const domainValue = ownValue(cookie, 'domain');
      if (hasProvidedValue(domainValue)) {
        defineOwn(entry, 'domain', String(domainValue));
      } else if (options.defaultDomain === true) {
        defineOwn(entry, 'domain', DEFAULT_COOKIE_DOMAIN);
      }
      if (options.preserveHostOnly === true && ownValue(cookie, 'hostOnly') === true) {
        defineOwn(entry, 'hostOnly', true);
      }
    }

    const expirationDate = normalizeExpirationDate(ownValue(cookie, 'expirationDate'));
    if (expirationDate !== null) {
      defineOwn(entry, 'expirationDate', expirationDate);
    }

    return entry;
  }

  function normalizeCookieEntries(cookies) {
    if (!cookies) return [];
    if (Array.isArray(cookies)) {
      return cookies
        .map((cookie) => normalizeCookieEntry(cookie, { defaultDomain: false, preserveHostOnly: true }))
        .filter(Boolean);
    }
    if (typeof cookies === 'object') {
      return Object.keys(cookies)
        .map((name) => {
          const value = cookies[name];
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            return normalizeCookieEntry({
              name: hasProvidedValue(ownValue(value, 'name')) ? ownValue(value, 'name') : name,
              value: ownValue(value, 'value'),
              domain: ownValue(value, 'domain'),
              path: ownValue(value, 'path'),
              secure: ownValue(value, 'secure'),
              httpOnly: ownValue(value, 'httpOnly'),
              sameSite: ownValue(value, 'sameSite'),
              expirationDate: ownValue(value, 'expirationDate'),
              hostOnly: ownValue(value, 'hostOnly'),
            }, { defaultDomain: true });
          }
          return normalizeCookieEntry({ name, value }, { defaultDomain: true });
        })
        .filter(Boolean);
    }
    return [];
  }

  function getLoginFailureMessage(data = {}) {
    const reason = hasOwn(data, 'reason') ? String(data.reason || '') : '';
    if (hasOwn(FAILURE_MESSAGES, reason)) return FAILURE_MESSAGES[reason];
    if (hasOwn(data, 'message')) return String(data.message || '');
    if (hasOwn(data, 'error')) return String(data.error || '');
    return '登录失败，请稍后重试';
  }

  function normalizePasskeyLoginResponse(response = {}) {
    const data = response && typeof response === 'object' && !Array.isArray(response) ? response : {};
    if (data.ok !== true) {
      throw new Error(getLoginFailureMessage(data));
    }
    const cookieEntries = normalizeCookieEntries(data.cookies);
    const sessionToken = cleanToken(data.sessionToken || data.session_token);
    if (!cookieEntries.length && !sessionToken && !cleanToken(data.accessToken || data.access_token)) {
      throw new Error('后端未返回可导入的 cookies、sessionToken 或 accessToken');
    }
    const result = {
      email: String(data.email || '').trim().toLowerCase(),
      accessToken: cleanToken(data.accessToken || data.access_token),
      cookieEntries,
    };
    if (sessionToken) {
      result.sessionToken = sessionToken;
      result.sessionRaw = JSON.stringify({ sessionToken });
    }
    return result;
  }

  return {
    buildPasskeyLoginRequest,
    normalizePasskeyLoginResponse,
    normalizeCookieEntries,
    getLoginFailureMessage,
  };
});
```

- [ ] **Step 2: Add tests copied from the reference behavior**

Create `scripts/test-passkey-login-core.cjs`:

```javascript
const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildPasskeyLoginRequest,
  normalizePasskeyLoginResponse,
  normalizeCookieEntries,
  getLoginFailureMessage,
} = require('../background/passkey-login-core.js');

test('builds passkey login request with allowed optional fields only', () => {
  const privateJwk = { kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'd' };
  assert.deepEqual(buildPasskeyLoginRequest(' USER@example.com ', {
    deviceId: 'device-1',
    credentialId: 'credential-1',
    privateJwk,
    rpId: 'openai.com',
    userHandle: 'handle-1',
    signCount: 0,
    alg: -7,
    ignored: 'value',
  }), {
    email: 'user@example.com',
    deviceId: 'device-1',
    credentialId: 'credential-1',
    privateJwk,
    rpId: 'openai.com',
    userHandle: 'handle-1',
    signCount: 0,
    alg: -7,
  });
});

test('normalizes object cookies and accessToken from login response', () => {
  const response = {
    ok: true,
    email: 'user@example.com',
    accessToken: `eyJ${'a'.repeat(120)}`,
    cookies: {
      '__Secure-next-auth.session-token': `eyJ${'s'.repeat(120)}`,
      '__Host-next-auth.csrf-token': 'csrf-value',
    },
  };
  const result = normalizePasskeyLoginResponse(response);
  assert.equal(result.email, 'user@example.com');
  assert.equal(result.accessToken, response.accessToken);
  assert.equal(result.cookieEntries.length, 2);
  assert.equal(result.cookieEntries[0].domain, '.chatgpt.com');
  assert.equal(result.cookieEntries[0].path, '/');
  assert.equal(result.cookieEntries[0].secure, true);
});

test('normalizes __Host cookies without domain', () => {
  const entries = normalizeCookieEntries([
    {
      name: '__Host-next-auth.csrf-token',
      value: 'csrf-value',
      domain: '.chatgpt.com',
      path: '/wrong',
      secure: false,
      sameSite: 'none',
    },
  ]);
  assert.deepEqual(entries[0], {
    name: '__Host-next-auth.csrf-token',
    value: 'csrf-value',
    path: '/',
    secure: true,
    httpOnly: false,
    sameSite: 'no_restriction',
  });
});

test('falls back to sessionToken without cookies', () => {
  const sessionToken = `eyJ${'s'.repeat(120)}`;
  const result = normalizePasskeyLoginResponse({
    ok: true,
    email: 'user@example.com',
    sessionToken,
  });
  assert.equal(result.sessionToken, sessionToken);
  assert.equal(result.sessionRaw, JSON.stringify({ sessionToken }));
});

test('allows accessToken-only response for AT supplement', () => {
  const accessToken = `eyJ${'a'.repeat(120)}`;
  const result = normalizePasskeyLoginResponse({
    ok: true,
    email: 'user@example.com',
    accessToken,
  });
  assert.equal(result.accessToken, accessToken);
  assert.deepEqual(result.cookieEntries, []);
});

test('maps backend failure reasons', () => {
  assert.equal(getLoginFailureMessage({ ok: false, reason: 'missing-credential' }), '没有找到该邮箱的 Passkey 凭据');
  assert.equal(getLoginFailureMessage({ ok: false, reason: 'rate-limited' }), '请求太频繁，请稍后再试');
  assert.equal(getLoginFailureMessage({ ok: false, reason: 'server-error' }), '服务器错误，请稍后重试');
  assert.equal(getLoginFailureMessage({ ok: false, reason: '__proto__' }), '登录失败，请稍后重试');
});
```

- [ ] **Step 3: Run the helper tests**

Run:

```powershell
node --test scripts/test-passkey-login-core.cjs
```

Expected:

```text
# pass
```

- [ ] **Step 4: Load helper in the MV3 service worker**

Modify `background.js` importScripts block:

```javascript
  'background/redeem/redeem-cdkey-usage.js',
  'background/passkey-login-core.js',
  'background/generated-email-helpers.js',
```

- [ ] **Step 5: Run syntax checks**

Run:

```powershell
node --check background/passkey-login-core.js
node --check background.js
node --test scripts/test-passkey-login-core.cjs
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```powershell
git add background/passkey-login-core.js background.js scripts/test-passkey-login-core.cjs
git commit -m "feat: add passkey login core helper"
```

---

#### Task 2: Add Passkey API Login Executor

**Files:**
- Modify: `C:/Users/Z1803/Downloads/projict/cdk-redeem-only-extension-main/background/upi-credential-membership-checker.js`

- [ ] **Step 1: Add helper accessors near existing Passkey helpers**

Insert after `hasPasskeyCredential()`:

```javascript
  function getPasskeyLoginCore() {
    return (typeof self !== 'undefined' ? self : globalThis).MultiPagePasskeyLoginCore || {};
  }

  function normalizeNerverPasskeyLoginBaseUrl(value = '') {
    let normalized = normalizeString(value || 'https://cha.nerver.cc').replace(/\/+$/g, '');
    try {
      const parsed = new URL(normalized);
      if (!/^https?:$/i.test(parsed.protocol)) {
        throw new Error('Passkey Login API Base URL 只支持 http/https。');
      }
      parsed.pathname = parsed.pathname
        .replace(/\/api\/v1\/passkey\/(?:enable|login)$/i, '')
        .replace(/\/api\/v1\/totp\/(?:enable|lookup|code)$/i, '')
        .replace(/\/+$/g, '');
      parsed.search = '';
      parsed.hash = '';
      normalized = parsed.toString().replace(/\/+$/g, '');
    } catch (error) {
      throw new Error(`Passkey Login API Base URL 格式无效：${normalizeString(error?.message || error) || value}`);
    }
    return normalized || 'https://cha.nerver.cc';
  }

  function buildPasskeyLoginApiUrl(state = {}) {
    const baseUrl = normalizeNerverPasskeyLoginBaseUrl(
      state.passkeyLoginApiBaseUrl
      || state.passkeyApiBaseUrl
      || state.upiCredentialMembershipCheckTotpApiBaseUrl
      || state.totpMfaApiBaseUrl
      || 'https://cha.nerver.cc'
    );
    return `${baseUrl}/api/v1/passkey/login`;
  }

  function buildPasskeyLoginOptionsFromCredential(credential = {}, state = {}) {
    const deviceId = normalizeString(
      credential.passkeyDeviceId
      || credential.deviceId
      || state.passkeyLoginDeviceId
      || state.passkeyDeviceId
      || state.totpMfaDeviceId
    );
    const options = {
      deviceId,
      credentialId: normalizeString(credential.passkeyCredentialId || credential.credentialId || credential.credential_id),
      privateJwk: credential.passkeyPrivateJwk || credential.privateJwk || credential.private_jwk || null,
      rpId: normalizeString(credential.passkeyRpId || credential.rpId || credential.rp_id),
      userHandle: normalizeString(credential.passkeyUserHandle || credential.userHandle || credential.user_handle),
      signCount: Number.isFinite(Number(credential.passkeySignCount ?? credential.signCount))
        ? Math.max(0, Math.floor(Number(credential.passkeySignCount ?? credential.signCount)))
        : undefined,
      alg: Number.isFinite(Number(credential.passkeyAlg ?? credential.alg))
        ? Number(credential.passkeyAlg ?? credential.alg)
        : undefined,
    };
    Object.keys(options).forEach((key) => {
      if (options[key] === undefined || options[key] === null || options[key] === '') {
        delete options[key];
      }
    });
    return options;
  }
```

- [ ] **Step 2: Add cookie injection helpers near `clearOpenAiCookies()` helpers**

Insert before `loginAndReadAccessToken()`:

```javascript
    function buildChatGptCookieUrl(entry = {}) {
      const domain = normalizeString(entry.domain || '.chatgpt.com').replace(/^\./, '') || 'chatgpt.com';
      const path = normalizeString(entry.path || '/');
      return `https://${domain}${path.startsWith('/') ? path : `/${path}`}`;
    }

    async function setChatGptCookieEntries(cookieEntries = []) {
      if (!chromeApi?.cookies?.set) {
        return { setCount: 0, skipped: cookieEntries.length };
      }
      let setCount = 0;
      for (const entry of cookieEntries) {
        const name = normalizeString(entry?.name);
        const value = normalizeString(entry?.value);
        if (!name || !value) continue;
        const details = {
          url: buildChatGptCookieUrl(entry),
          name,
          value,
          path: normalizeString(entry.path || '/'),
          secure: entry.secure !== false,
          httpOnly: entry.httpOnly === true,
          sameSite: normalizeString(entry.sameSite || 'lax'),
        };
        if (!name.startsWith('__Host-') && normalizeString(entry.domain)) {
          details.domain = normalizeString(entry.domain);
        }
        if (Number.isFinite(Number(entry.expirationDate)) && Number(entry.expirationDate) > 0) {
          details.expirationDate = Number(entry.expirationDate);
        }
        await chromeApi.cookies.set(details);
        setCount += 1;
      }
      return { setCount, skipped: Math.max(0, cookieEntries.length - setCount) };
    }

    async function applyPasskeyLoginCookies(loginResult = {}, credential = {}, options = {}) {
      const cookieEntries = Array.isArray(loginResult.cookieEntries) ? loginResult.cookieEntries : [];
      if (!cookieEntries.length && !loginResult.sessionToken) {
        return { tabId: 0, setCount: 0 };
      }
      await clearOpenAiCookies();
      const target = await openFreshLoginTab(credential.email);
      if (cookieEntries.length) {
        const cookieResult = await setChatGptCookieEntries(cookieEntries);
        await addLog(`UPI Passkey 登录：${credential.email} 已写入 ${cookieResult.setCount} 个 ChatGPT Cookie。`, 'ok');
      }
      if (!cookieEntries.length && loginResult.sessionToken) {
        await setChatGptCookieEntries([{
          name: '__Secure-next-auth.session-token',
          value: loginResult.sessionToken,
          domain: '.chatgpt.com',
          path: '/',
          secure: true,
          httpOnly: true,
          sameSite: 'lax',
        }]);
        await addLog(`UPI Passkey 登录：${credential.email} 已写入 sessionToken Cookie。`, 'ok');
      }
      if (chromeApi?.tabs?.reload) {
        await chromeApi.tabs.reload(target).catch(() => {});
      }
      return { tabId: target, setCount: cookieEntries.length || 1 };
    }
```

If `openFreshLoginTab()` returns a tab id in this file, keep `target` as that id. If it returns an object in the live code at execution time, adjust to `target.tabId || target.id`.

- [ ] **Step 3: Add the Passkey API login function**

Insert before `loginAndReadAccessToken()`:

```javascript
    async function tryPasskeyApiLoginAndReadAccessToken(credential = {}, state = {}, options = {}) {
      const throwIfStopRequested = resolveStopChecker(options, 'check');
      if (!hasPasskeyCredential(credential)) {
        return null;
      }
      const core = getPasskeyLoginCore();
      if (
        typeof core.buildPasskeyLoginRequest !== 'function'
        || typeof core.normalizePasskeyLoginResponse !== 'function'
      ) {
        await addLog(`UPI Passkey 登录：${credential.email} -> Passkey 登录 helper 未加载，回落网页登录。`, 'warn');
        return null;
      }

      const apiUrl = buildPasskeyLoginApiUrl(state);
      const requestBody = core.buildPasskeyLoginRequest(
        credential.email,
        buildPasskeyLoginOptionsFromCredential(credential, state)
      );
      await addLog(`UPI Passkey 登录：${credential.email} 正在调用 ${apiUrl} 获取 AT/Cookie。`, 'info');
      throwIfStopRequested();
      const response = await fetchImpl(apiUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      const text = await response.text();
      let payload = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = { ok: false, reason: text || `HTTP ${response.status}` };
      }
      if (!response.ok) {
        throw new Error(core.getLoginFailureMessage?.(payload) || payload.reason || `HTTP ${response.status}`);
      }
      const loginResult = core.normalizePasskeyLoginResponse(payload);
      const responseEmail = normalizeEmail(loginResult.email || credential.email);
      const targetEmail = normalizeEmail(credential.email);
      if (responseEmail && targetEmail && responseEmail !== targetEmail) {
        throw createSessionAccountMismatchError(
          `UPI Passkey 登录：返回账号 ${responseEmail} 与目标 ${targetEmail} 不一致。`,
          { sessionEmail: responseEmail, targetEmail }
        );
      }
      if (options.applyCookies !== false) {
        await applyPasskeyLoginCookies(loginResult, credential, options);
      }
      if (loginResult.accessToken) {
        await addLog(`UPI Passkey 登录：${credential.email} 已通过 Passkey API 获取 AT。`, 'ok');
      } else {
        await addLog(`UPI Passkey 登录：${credential.email} 已通过 Passkey API 获取登录 Cookie，将继续读取页面 AT。`, 'ok');
      }
      return {
        tabId: 0,
        accessToken: loginResult.accessToken,
        session: {
          accessToken: loginResult.accessToken,
          accountEmail: responseEmail || targetEmail,
          email: responseEmail || targetEmail,
          passkeyLogin: true,
        },
        passkeyLoginResult: loginResult,
      };
    }
```

- [ ] **Step 4: Run syntax check**

Run:

```powershell
node --check background/upi-credential-membership-checker.js
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```powershell
git add background/upi-credential-membership-checker.js
git commit -m "feat: add passkey API login executor"
```

---

#### Task 3: Prefer Passkey API Login in AT Supplement and Row Login

**Files:**
- Modify: `C:/Users/Z1803/Downloads/projict/cdk-redeem-only-extension-main/background/upi-credential-membership-checker.js:3423-3607`
- Modify: `C:/Users/Z1803/Downloads/projict/cdk-redeem-only-extension-main/sidepanel/account-records-manager.js:2288-2296`

- [ ] **Step 1: Add Passkey stage reporting at the start of `loginAndReadAccessToken()`**

In `loginAndReadAccessToken()`, after the existing-session reuse block and before `clearOpenAiCookies()`, insert:

```javascript
      if (hasPasskeyCredential(credential)) {
        try {
          await reportStage('passkey-login');
          const passkeySession = await tryPasskeyApiLoginAndReadAccessToken(credential, state, {
            ...options,
            applyCookies: true,
          });
          const passkeyLoginResult = passkeySession?.passkeyLoginResult || {};
          const hasPasskeyBrowserSession = Boolean(
            passkeyLoginResult.sessionToken
            || (Array.isArray(passkeyLoginResult.cookieEntries) && passkeyLoginResult.cookieEntries.length)
          );
          if (shouldReadAccessToken && passkeySession?.accessToken) {
            await reportStage('token');
            return passkeySession;
          }
          if (!shouldReadAccessToken && passkeySession && hasPasskeyBrowserSession) {
            await addLog(`UPI 账号登录：${credential.email} 已通过 Passkey API 登录。`, 'ok');
            return {
              tabId: passkeySession.tabId || 0,
              loggedIn: true,
              passkeyLogin: true,
            };
          }
          if (!shouldReadAccessToken && passkeySession && !hasPasskeyBrowserSession) {
            await addLog(`UPI Passkey 登录：${credential.email} -> 后端只返回 AT，未返回 Cookie/sessionToken，行登录回落网页登录。`, 'warn');
          }
        } catch (passkeyError) {
          await addLog(
            `UPI Passkey 登录：${credential.email} -> ${getErrorMessage(passkeyError) || passkeyError}，回落网页登录。`,
            'warn'
          );
        }
      }
```

Expected behavior:
- Passkey Free with backend `accessToken` returns before webpage login.
- Passkey Free with cookies/sessionToken but no `accessToken` logs in browser, then falls through to existing page session read.
- Row `登录` only treats the Passkey API path as logged in when cookies/sessionToken were written; an accessToken-only backend response falls back to the existing webpage login.
- API failure does not break existing password/email-code/TOTP fallback.

- [ ] **Step 2: Ensure `fillUpiCredentialMembershipFreeAccessTokens()` logs clearer Passkey path**

Replace the existing Passkey/TOTP material warning:

```javascript
          if (!normalizeTotpSecret(activeCredential.totpMfaSecret || activeCredential.totpSecret) && !hasPasskeyCredential(activeCredential)) {
            await addLog(`UPI Free 分组补充 AT：${email} -> 未保存 2FA/Passkey，先按邮箱+密码登录；如页面要求验证码会按实际错误返回。`, 'info');
          }
```

with:

```javascript
          if (hasPasskeyCredential(activeCredential)) {
            await addLog(`UPI Free 分组补充 AT：${email} -> 检测到 Passkey，优先使用 Nerver Passkey 登录接口补 AT。`, 'info');
          } else if (!normalizeTotpSecret(activeCredential.totpMfaSecret || activeCredential.totpSecret)) {
            await addLog(`UPI Free 分组补充 AT：${email} -> 未保存 2FA/Passkey，先按邮箱+密码登录；如页面要求验证码会按实际错误返回。`, 'info');
          }
```

- [ ] **Step 3: Add `passkey-login` to sidepanel progress stage mapping**

In `sidepanel/account-records-manager.js`, find the stage checks around `stage === 'login' || stage === 'totp' || stage === 'token'`.

Update them to include `passkey-login`:

```javascript
if (stage === 'login' || stage === 'passkey-login' || stage === 'totp' || stage === 'token' || stage === 'subscription-check') {
```

and:

```javascript
if (stage === 'open-chatgpt' || stage === 'login' || stage === 'passkey-login' || stage === 'totp') {
```

- [ ] **Step 4: Run syntax checks**

Run:

```powershell
node --check background/upi-credential-membership-checker.js
node --check sidepanel/account-records-manager.js
```

Expected: both exit 0.

- [ ] **Step 5: Commit**

```powershell
git add background/upi-credential-membership-checker.js sidepanel/account-records-manager.js
git commit -m "feat: prefer passkey login for AT supplement"
```

---

#### Task 4: Preserve More Passkey Login Material Across Import/Export

**Files:**
- Modify: `C:/Users/Z1803/Downloads/projict/cdk-redeem-only-extension-main/background/upi-credential-membership-checker.js`
- Modify: `C:/Users/Z1803/Downloads/projict/cdk-redeem-only-extension-main/sidepanel/account-records-manager.js`
- Modify: `C:/Users/Z1803/Downloads/projict/cdk-redeem-only-extension-main/background.js:3890-3990`

- [ ] **Step 1: Preserve `passkeySignCount` and `passkeyAlg` in normalizers**

Where each file currently preserves `passkeyPrivateJwk`, `passkeyPublicKeyCose`, and `passkeyApiPersisted`, add:

```javascript
passkeySignCount: Number.isFinite(Number(source.passkeySignCount ?? source.signCount))
  ? Math.max(0, Math.floor(Number(source.passkeySignCount ?? source.signCount)))
  : 0,
passkeyAlg: Number.isFinite(Number(source.passkeyAlg ?? source.alg))
  ? Number(source.passkeyAlg ?? source.alg)
  : 0,
```

Use the correct local variable name (`source`, `record`, `item`, or `rawRecord`) for each normalizer.

- [ ] **Step 2: Update `mergeCredentialAuthMaterial()`**

Inside the Passkey merge block, after `passkeyPublicKeyCose`, add:

```javascript
      target.passkeySignCount = Number.isFinite(Number(target.passkeySignCount ?? source.passkeySignCount ?? source.signCount))
        ? Math.max(0, Math.floor(Number(target.passkeySignCount ?? source.passkeySignCount ?? source.signCount)))
        : 0;
      target.passkeyAlg = Number.isFinite(Number(target.passkeyAlg ?? source.passkeyAlg ?? source.alg))
        ? Number(target.passkeyAlg ?? source.passkeyAlg ?? source.alg)
        : 0;
```

- [ ] **Step 3: Run static validation**

Run:

```powershell
rg -n "passkeySignCount|passkeyAlg" background.js background/upi-credential-membership-checker.js sidepanel/account-records-manager.js
```

Expected: all three files include both fields.

- [ ] **Step 4: Run syntax checks**

Run:

```powershell
node --check background.js
node --check background/upi-credential-membership-checker.js
node --check sidepanel/account-records-manager.js
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```powershell
git add background.js background/upi-credential-membership-checker.js sidepanel/account-records-manager.js
git commit -m "fix: preserve passkey login metadata"
```

---

#### Task 5: End-to-End Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run focused tests**

```powershell
node --test scripts/test-passkey-login-core.cjs
node --check background/passkey-login-core.js
node --check background.js
node --check background/message-router.js
node --check background/upi-credential-membership-checker.js
node --check sidepanel/account-records-manager.js
node --check sidepanel/sidepanel.js
git diff --check
```

Expected:
- `node --test` passes.
- all `node --check` commands exit 0.
- `git diff --check` only shows possible LF/CRLF warnings, no whitespace errors.

- [ ] **Step 2: Manual smoke test with a Passkey Free account lacking AT**

Preconditions:
- Free row has `email`, `password`, `passkeyEnabled=true`, and `passkeyCredentialId`.
- Nerver backend has the Passkey credential for that email.

Steps:
1. Reload extension in browser extension management page.
2. Open sidepanel.
3. Confirm a Passkey Free row shows `缺 AT`.
4. Click `一键补充 AT`.

Expected logs:

```text
UPI Free 分组补充 AT：<email> -> 检测到 Passkey，优先使用 Nerver Passkey 登录接口补 AT。
UPI Passkey 登录：<email> 正在调用 https://cha.nerver.cc/api/v1/passkey/login 获取 AT/Cookie。
UPI Passkey 登录：<email> 已通过 Passkey API 获取 AT。
UPI Free 分组补充 AT：<email> -> 已保存 AT。
```

Expected UI:
- row no longer shows `缺 AT`
- `一键兑换 UPI/IDEAL/全部` counts include the row when other redeem conditions match

- [ ] **Step 3: Manual fallback smoke test**

Temporarily set an invalid `passkeyLoginApiBaseUrl` in local settings or use a Passkey email not present in backend.

Expected:
- log contains `回落网页登录`
- existing browser login path still handles email code/TOTP as before

- [ ] **Step 4: Manual row login smoke test**

Click row `登录` on a Passkey Free row.

Expected:
- Passkey API writes cookies/sessionToken when backend returns them
- ChatGPT tab opens logged in to the target email
- if backend returns only AT, row login falls back to browser login rather than silently claiming success

- [ ] **Step 5: Commit final verification notes if needed**

If manual verification changes docs or release notes:

```powershell
git add Release.md RELEASING.md
git commit -m "docs: document passkey login optimization"
```

---

### Rollback Plan

If Passkey API login creates instability:

1. Revert the Task 3 commit only:

```powershell
git revert <task-3-commit>
```

2. Keep `background/passkey-login-core.js` and tests if they are harmless, or revert Task 1 and Task 2 commits too.
3. Existing browser login path remains the fallback and should continue to work.

### Self-Review

- Spec coverage: uses `gpt-login-ext` GPT login method, optimizes Passkey AT supplement, and covers row login.
- No placeholders: every task lists exact files, code blocks, commands, and expected output.
- Type consistency: request fields match reference (`deviceId`, `credentialId`, `privateJwk`, `rpId`, `userHandle`, `signCount`, `alg`); stored fields use current project prefixes (`passkeyCredentialId`, `passkeyPrivateJwk`, `passkeyRpId`, `passkeyUserHandle`, `passkeySignCount`, `passkeyAlg`).

---

<a id="2026-07-06-trial-eligibility-api-alignment"></a>

<!-- archived-from: docs/superpowers/plans/2026-07-06-trial-eligibility-api-alignment.md -->

## Trial Eligibility API Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align local trial-eligibility handling with the backend `POST /api/v1/check` contract so Free entry is gated by coupon eligibility, while UPI/IDEAL channel availability controls only the redeem candidates.

**Architecture:** Add one focused shared adapter for `/api/v1/check` responses, then wire background step 7, stored result rows, and sidepanel candidate filters to the same decision model. Keep Free membership eligibility separate from UPI/IDEAL channel eligibility to avoid dropping accounts that are coupon-eligible but only redeemable through IDEAL or temporarily not redeemable through UPI.

Network instability is modeled as a retryable check state, not as account ineligibility. Users get explicit single-row and batch manual check controls so they can retry `/api/v1/check` after a proxy/backend fluctuation without re-running the whole registration flow.

**Tech Stack:** MV3 extension service worker, plain JavaScript globals/CommonJS-compatible helper, Node built-in test runner, existing `node --check` syntax checks.

---

### Backend Contract Summary

The backend `/api/v1/check` response fields from the API page are:

- `token_ok: boolean` means the ChatGPT access token is valid.
- `eligible: boolean` means the account has coupon/trial eligibility.
- `reason: string` is one of `eligible`, `not-eligible`, `token-401`, `jwt-expired`, `empty-token`, `fetch-error`, `http-error`, `unknown-coupon-state`.
- `upi_eligible: boolean` means the account can submit through UPI.
- `upi_eligible_reason: string|null` explains UPI denial, e.g. `account-not-phone`, `email-not-whitelisted`, `feature-disabled`.
- `ideal_eligible: boolean` means the account can submit through IDEAL.
- `ideal_eligible_reason: string|null` explains IDEAL denial.
- `reg_type`, `phone_number`, `phone_verified`, `coupon_state`, `email`, `account_id`, `plan_type`, `jwt_expired`, `jwt_exp_in_sec` are metadata.

Important local policy:

- Free entry should require `token_ok === true` and `eligible === true`.
- `upi_eligible === false` must not block Free entry; it should only block UPI candidate selection.
- `ideal_eligible === false` must not block Free entry; it should only block IDEAL candidate selection.
- Missing required backend booleans must be treated as an incomplete/failed check, not as "no trial eligibility".
- `fetch-error`, `http-error`, `unknown-coupon-state`, request timeout, HTTP 429, and HTTP 5xx are network/backend fluctuation states. They must be saved as retryable check failures, not as "无试用资格".
- Retryable failures should preserve the account/email, show a clear retry reason, and expose manual check buttons.
- Only `token_ok === true && eligible === false` or equivalent explicit `reason=not-eligible` should mark the source mailbox as no trial eligibility.

### File Structure

- Create: `shared/trial-eligibility-api.js`
  - Single responsibility: normalize `/api/v1/check` payloads into a strict local decision.
  - Exports globals on `self.MultiPageTrialEligibilityApi` and `module.exports` for Node tests.
- Create: `scripts/test-trial-eligibility-api.cjs`
  - Unit tests for strict decision behavior and channel metadata.
- Modify: `background.js`
  - Load `shared/trial-eligibility-api.js` before `background/steps/upi-redeem.js` and `background/upi-credential-membership-checker.js`.
- Modify: `sidepanel/sidepanel.html`
  - Load `shared/trial-eligibility-api.js` before `sidepanel/account-records-manager.js`.
- Modify: `background/steps/upi-redeem.js`
  - Replace local ad-hoc eligibility failure logic with the shared adapter.
  - Step 7 writes Free only when coupon eligibility is true.
  - Step 7 stores UPI/IDEAL channel eligibility fields on the result item.
- Modify: `background/upi-credential-membership-checker.js`
  - Preserve channel eligibility fields in `normalizeResultItem()` and `upsertTrialEligibleFreeCredential()`.
  - Filter auto-continuation and background redeem candidates by channel eligibility.
  - Provide a manual trial-eligibility check method that can reuse existing AT or login to refresh AT.
- Modify: `background/message-router.js`
  - Route single-row and batch manual eligibility check messages to the checker.
- Modify: `sidepanel/account-records-manager.js`
  - Filter UPI/IDEAL button counts by channel eligibility.
  - Update Free row reason/skip reason so "eligible but UPI unavailable" is visible.
  - Allow manual trial-eligibility check for rows with AT, Passkey, no-2FA route, or password-only login fallback.
  - Add row-level and batch manual trial-eligibility check controls.

---

#### Task 1: Add Strict Backend API Adapter

**Files:**
- Create: `shared/trial-eligibility-api.js`
- Create: `scripts/test-trial-eligibility-api.cjs`

- [ ] **Step 1: Create failing tests for backend response decisions**

Create `scripts/test-trial-eligibility-api.cjs`:

```javascript
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  normalizeTrialEligibilityApiItem,
  isTrialEligibilityAccountIneligibleDecision,
  isTrialEligibilityTokenInvalidDecision,
  isTrialEligibilityEligibleDecision,
  isTrialEligibilityChannelAllowed,
} = require('../shared/trial-eligibility-api.js');

test('eligible coupon enters Free even when UPI channel is denied', () => {
  const decision = normalizeTrialEligibilityApiItem({
    token_ok: true,
    eligible: true,
    reason: 'eligible',
    upi_eligible: false,
    upi_eligible_reason: 'account-not-phone',
    ideal_eligible: true,
    ideal_eligible_reason: null,
    reg_type: 'email',
    email: 'a@example.com',
  });

  assert.equal(isTrialEligibilityEligibleDecision(decision), true);
  assert.equal(decision.trialEligibilityStatus, 'eligible');
  assert.equal(decision.upiChannelEligibilityStatus, 'ineligible');
  assert.equal(decision.upiChannelEligibilityReason, 'account-not-phone');
  assert.equal(decision.idealChannelEligibilityStatus, 'eligible');
  assert.equal(isTrialEligibilityChannelAllowed(decision, 'upi'), false);
  assert.equal(isTrialEligibilityChannelAllowed(decision, 'ideal'), true);
});

test('eligible coupon enters Free even when both channels are denied', () => {
  const decision = normalizeTrialEligibilityApiItem({
    token_ok: true,
    eligible: true,
    reason: 'eligible',
    upi_eligible: false,
    upi_eligible_reason: 'feature-disabled',
    ideal_eligible: false,
    ideal_eligible_reason: 'email-not-whitelisted',
  });

  assert.equal(isTrialEligibilityEligibleDecision(decision), true);
  assert.equal(decision.trialEligibilityStatus, 'eligible');
  assert.equal(decision.upiChannelEligibilityStatus, 'ineligible');
  assert.equal(decision.idealChannelEligibilityStatus, 'ineligible');
});

test('not eligible coupon is account ineligible and should not enter Free', () => {
  const decision = normalizeTrialEligibilityApiItem({
    token_ok: true,
    eligible: false,
    reason: 'not-eligible',
    message: '账号没有试用资格',
  });

  assert.equal(isTrialEligibilityAccountIneligibleDecision(decision), true);
  assert.equal(decision.trialEligibilityStatus, 'ineligible');
  assert.match(decision.trialEligibilityReason, /账号没有试用资格|not-eligible/);
});

test('token invalid is not account ineligible', () => {
  const decision = normalizeTrialEligibilityApiItem({
    token_ok: false,
    reason: 'jwt-expired',
    message: 'JWT 已过期',
  });

  assert.equal(isTrialEligibilityTokenInvalidDecision(decision), true);
  assert.equal(isTrialEligibilityAccountIneligibleDecision(decision), false);
  assert.equal(decision.trialEligibilityStatus, 'failed');
});

test('missing eligible field is incomplete check, not account ineligible', () => {
  const decision = normalizeTrialEligibilityApiItem({
    token_ok: true,
    reason: 'eligible',
    upi_eligible: true,
  });

  assert.equal(decision.trialEligibilityStatus, 'failed');
  assert.equal(isTrialEligibilityAccountIneligibleDecision(decision), false);
  assert.match(decision.trialEligibilityReason, /缺少 eligible/);
});

test('missing token_ok field is incomplete check, not account ineligible', () => {
  const decision = normalizeTrialEligibilityApiItem({
    eligible: true,
    reason: 'eligible',
  });

  assert.equal(decision.trialEligibilityStatus, 'failed');
  assert.equal(isTrialEligibilityAccountIneligibleDecision(decision), false);
  assert.match(decision.trialEligibilityReason, /缺少 token_ok/);
});

test('unknown coupon state without explicit eligible false is failed check', () => {
  const decision = normalizeTrialEligibilityApiItem({
    token_ok: true,
    reason: 'unknown-coupon-state',
    message: 'OpenAI 优惠状态未知',
  });

  assert.equal(decision.trialEligibilityStatus, 'failed');
  assert.equal(isTrialEligibilityAccountIneligibleDecision(decision), false);
  assert.equal(decision.trialEligibilityRetryable, true);
  assert.equal(decision.trialEligibilityTransientFailure, true);
});

test('fetch-error is retryable network fluctuation and not account ineligible', () => {
  const decision = normalizeTrialEligibilityApiItem({
    token_ok: true,
    reason: 'fetch-error',
    message: '后端请求 OpenAI 失败',
  });

  assert.equal(decision.trialEligibilityStatus, 'failed');
  assert.equal(isTrialEligibilityAccountIneligibleDecision(decision), false);
  assert.equal(decision.trialEligibilityRetryable, true);
  assert.equal(decision.trialEligibilityTransientFailure, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test scripts/test-trial-eligibility-api.cjs
```

Expected: FAIL because `shared/trial-eligibility-api.js` does not exist.

- [ ] **Step 3: Implement the shared adapter**

Create `shared/trial-eligibility-api.js`:

```javascript
(function attachTrialEligibilityApi(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.MultiPageTrialEligibilityApi = api;
})(typeof self !== 'undefined' ? self : globalThis, function createTrialEligibilityApi() {
  function normalizeString(value = '') {
    return String(value || '').trim();
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
  }

  function normalizeBoolean(value) {
    if (value === true) return true;
    if (value === false || value === null || value === undefined) return false;
    const normalized = normalizeString(value).toLowerCase();
    return ['1', 'true', 'yes', 'y', 'ok', 'active', 'success'].includes(normalized);
  }

  function readOwnBoolean(source = {}, keys = []) {
    for (const key of keys) {
      if (hasOwn(source, key)) {
        return {
          present: true,
          value: normalizeBoolean(source[key]),
          raw: source[key],
          key,
        };
      }
    }
    return {
      present: false,
      value: false,
      raw: undefined,
      key: '',
    };
  }

  function pickMessage(source = {}, fallback = '') {
    return normalizeString(
      source.message
      || source.error
      || source.reason
      || fallback
    );
  }

  function isTransientFailureReason(reason = '') {
    return /^(?:fetch-error|http-error|unknown-coupon-state)$/i.test(normalizeString(reason));
  }

  function normalizeChannelStatus(source = {}, channel = 'upi') {
    const normalizedChannel = normalizeString(channel).toLowerCase() === 'ideal' ? 'ideal' : 'upi';
    const keys = normalizedChannel === 'ideal'
      ? ['ideal_eligible', 'idealEligible']
      : ['upi_eligible', 'upiEligible'];
    const reasonKeys = normalizedChannel === 'ideal'
      ? ['ideal_eligible_reason', 'idealEligibleReason']
      : ['upi_eligible_reason', 'upiEligibleReason'];
    const field = readOwnBoolean(source, keys);
    let reason = '';
    for (const key of reasonKeys) {
      if (hasOwn(source, key)) {
        reason = normalizeString(source[key]);
        break;
      }
    }
    if (!field.present) {
      return {
        status: 'unknown',
        reason,
      };
    }
    return {
      status: field.value ? 'eligible' : 'ineligible',
      reason: field.value ? '' : (reason || `${normalizedChannel.toUpperCase()} 渠道不可用`),
    };
  }

  function normalizeTrialEligibilityApiItem(item = {}) {
    const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
    const reasonCode = normalizeString(source.reason).toLowerCase();
    const tokenOk = readOwnBoolean(source, ['token_ok', 'tokenOk']);
    const eligible = readOwnBoolean(source, ['eligible']);
    const upi = normalizeChannelStatus(source, 'upi');
    const ideal = normalizeChannelStatus(source, 'ideal');
    const base = {
      trialEligibilityStatus: 'failed',
      trialEligibilityReason: '',
      trialEligibilityReasonCode: reasonCode,
      trialEligibilityCheckedByApi: true,
      trialEligibilityTransientFailure: isTransientFailureReason(reasonCode),
      trialEligibilityRetryable: false,
      couponState: normalizeString(source.coupon_state || source.couponState),
      registrationType: normalizeString(source.reg_type || source.regType),
      phoneNumber: normalizeString(source.phone_number || source.phoneNumber),
      phoneVerified: readOwnBoolean(source, ['phone_verified', 'phoneVerified']).value,
      accountId: normalizeString(source.account_id || source.accountId),
      planType: normalizeString(source.plan_type || source.planType),
      responseEmail: normalizeString(source.email).toLowerCase(),
      jwtExpired: readOwnBoolean(source, ['jwt_expired', 'jwtExpired']).value,
      jwtExpiresInSeconds: Math.max(0, Math.floor(Number(source.jwt_exp_in_sec || source.jwtExpInSec) || 0)),
      upiChannelEligibilityStatus: upi.status,
      upiChannelEligibilityReason: upi.reason,
      idealChannelEligibilityStatus: ideal.status,
      idealChannelEligibilityReason: ideal.reason,
    };

    if (!tokenOk.present) {
      return {
        ...base,
        trialEligibilityStatus: 'failed',
        trialEligibilityReason: pickMessage(source, '资格检查接口返回不完整：缺少 token_ok。'),
        trialEligibilityRetryable: true,
      };
    }
    if (!tokenOk.value) {
      return {
        ...base,
        trialEligibilityStatus: 'failed',
        trialEligibilityReason: pickMessage(source, 'ChatGPT accessToken 无效或已过期。'),
        tokenInvalid: true,
      };
    }
    if (!eligible.present) {
      return {
        ...base,
        trialEligibilityStatus: 'failed',
        trialEligibilityReason: pickMessage(source, '资格检查接口返回不完整：缺少 eligible。'),
        trialEligibilityRetryable: true,
      };
    }
    if (!eligible.value) {
      return {
        ...base,
        trialEligibilityStatus: 'ineligible',
        trialEligibilityReason: pickMessage(source, '账号无试用资格。'),
      };
    }
    return {
      ...base,
      trialEligibilityStatus: 'eligible',
      trialEligibilityReason: pickMessage(source, '账号有试用资格。'),
    };
  }

  function isTrialEligibilityEligibleDecision(decision = {}) {
    return normalizeString(decision.trialEligibilityStatus).toLowerCase() === 'eligible';
  }

  function isTrialEligibilityAccountIneligibleDecision(decision = {}) {
    return normalizeString(decision.trialEligibilityStatus).toLowerCase() === 'ineligible';
  }

  function isTrialEligibilityTokenInvalidDecision(decision = {}) {
    return decision.tokenInvalid === true;
  }

  function isTrialEligibilityChannelAllowed(item = {}, channel = 'upi') {
    const normalizedChannel = normalizeString(channel).toLowerCase() === 'ideal' ? 'ideal' : 'upi';
    const field = normalizedChannel === 'ideal'
      ? 'idealChannelEligibilityStatus'
      : 'upiChannelEligibilityStatus';
    const status = normalizeString(item[field]).toLowerCase();
    return !status || status === 'unknown' || status === 'eligible';
  }

  function buildTrialEligibilityResultPatch(decision = {}) {
    return {
      trialEligibilityStatus: normalizeString(decision.trialEligibilityStatus),
      trialEligibilityReason: normalizeString(decision.trialEligibilityReason),
      trialEligibilityReasonCode: normalizeString(decision.trialEligibilityReasonCode),
      trialEligibilityCheckedByApi: decision.trialEligibilityCheckedByApi === true,
      trialEligibilityTransientFailure: decision.trialEligibilityTransientFailure === true,
      trialEligibilityRetryable: decision.trialEligibilityRetryable === true,
      couponState: normalizeString(decision.couponState),
      registrationType: normalizeString(decision.registrationType),
      phoneNumber: normalizeString(decision.phoneNumber),
      phoneVerified: decision.phoneVerified === true,
      accountId: normalizeString(decision.accountId),
      responseEmail: normalizeString(decision.responseEmail).toLowerCase(),
      jwtExpired: decision.jwtExpired === true,
      jwtExpiresInSeconds: Math.max(0, Math.floor(Number(decision.jwtExpiresInSeconds) || 0)),
      upiChannelEligibilityStatus: normalizeString(decision.upiChannelEligibilityStatus),
      upiChannelEligibilityReason: normalizeString(decision.upiChannelEligibilityReason),
      idealChannelEligibilityStatus: normalizeString(decision.idealChannelEligibilityStatus),
      idealChannelEligibilityReason: normalizeString(decision.idealChannelEligibilityReason),
    };
  }

  return {
    normalizeTrialEligibilityApiItem,
    isTrialEligibilityEligibleDecision,
    isTrialEligibilityAccountIneligibleDecision,
    isTrialEligibilityTokenInvalidDecision,
    isTrialEligibilityChannelAllowed,
    buildTrialEligibilityResultPatch,
  };
});
```

- [ ] **Step 4: Run tests and syntax checks**

Run:

```powershell
node --test scripts/test-trial-eligibility-api.cjs
node --check shared/trial-eligibility-api.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add shared/trial-eligibility-api.js scripts/test-trial-eligibility-api.cjs
git commit -m "test: add trial eligibility api adapter"
```

---

#### Task 2: Load Adapter in Background and Sidepanel

**Files:**
- Modify: `background.js:3-45`
- Modify: `sidepanel/sidepanel.html:1401-1425`

- [ ] **Step 1: Load shared adapter in the service worker**

In `background.js`, add the shared script before `background/steps/upi-redeem.js`:

```javascript
  'background/passkey-login-core.js',
  'background/passkey-api-login-executor.js',
  'shared/trial-eligibility-api.js',
  'background/generated-email-helpers.js',
```

- [ ] **Step 2: Load shared adapter in the sidepanel**

In `sidepanel/sidepanel.html`, add the shared script before `account-records-manager.js`:

```html
  <script src="../shared/flow-capabilities.js"></script>
  <script src="../shared/trial-eligibility-api.js"></script>
  <script src="../data/step-definitions.js"></script>
```

- [ ] **Step 3: Run syntax checks**

```powershell
node --check background.js
node --check shared/trial-eligibility-api.js
```

Expected: no syntax errors.

- [ ] **Step 4: Commit**

```powershell
git add background.js sidepanel/sidepanel.html
git commit -m "chore: load trial eligibility adapter"
```

---

#### Task 3: Align Step 7 Eligibility Decisions with Backend Contract

**Files:**
- Modify: `background/steps/upi-redeem.js:1806-1878`
- Modify: `background/steps/upi-redeem.js:2456-2471`
- Modify: `background/steps/upi-redeem.js:3128-3282`

- [ ] **Step 1: Replace ad-hoc failure helpers with adapter calls**

In `background/steps/upi-redeem.js`, add local accessors near the existing helper functions:

```javascript
    function getTrialEligibilityApiHelpers() {
      const rootScope = typeof self !== 'undefined' ? self : globalThis;
      return rootScope.MultiPageTrialEligibilityApi || {};
    }

    function normalizeTrialEligibilityApiItem(item = {}) {
      const helper = getTrialEligibilityApiHelpers().normalizeTrialEligibilityApiItem;
      if (typeof helper === 'function') {
        return helper(item);
      }
      return {
        trialEligibilityStatus: 'failed',
        trialEligibilityReason: '资格检查适配器未加载。',
      };
    }

    function isTrialEligibilityAccountIneligibleDecision(decision = {}) {
      const helper = getTrialEligibilityApiHelpers().isTrialEligibilityAccountIneligibleDecision;
      return typeof helper === 'function'
        ? helper(decision)
        : normalizeString(decision.trialEligibilityStatus).toLowerCase() === 'ineligible';
    }

    function isTrialEligibilityTokenInvalidDecision(decision = {}) {
      const helper = getTrialEligibilityApiHelpers().isTrialEligibilityTokenInvalidDecision;
      return typeof helper === 'function' ? helper(decision) : decision.tokenInvalid === true;
    }

    function buildTrialEligibilityResultPatch(decision = {}) {
      const helper = getTrialEligibilityApiHelpers().buildTrialEligibilityResultPatch;
      return typeof helper === 'function' ? helper(decision) : {};
    }
```

Replace `getEligibilityFailureMessage()` and `isEligibilityAccountIneligibleItem()` with wrappers that preserve existing call sites:

```javascript
    function getEligibilityFailureMessage(item) {
      const decision = normalizeTrialEligibilityApiItem(item);
      return decision.trialEligibilityStatus === 'eligible'
        ? ''
        : normalizeString(decision.trialEligibilityReason || 'UPI 资格检查失败。');
    }

    function isEligibilityTokenInvalidItem(item = {}) {
      return isTrialEligibilityTokenInvalidDecision(normalizeTrialEligibilityApiItem(item));
    }

    function isEligibilityAccountIneligibleItem(item = {}) {
      return isTrialEligibilityAccountIneligibleDecision(normalizeTrialEligibilityApiItem(item));
    }
```

- [ ] **Step 2: Return both raw item and normalized decision from the check function**

Change `checkUPIAccessTokenEligibility()`:

```javascript
    async function checkUPIAccessTokenEligibility({ checkUrl, externalApiKey, clientId, cdkey, session, accessToken }) {
      const payload = await postEligibilityCheckJson({
        apiUrl: checkUrl,
        token: accessToken || getChatGptSessionAccessToken(session),
      });
      const item = getEligibilityItem(payload, cdkey);
      const decision = normalizeTrialEligibilityApiItem(item);
      const failureMessage = getEligibilityFailureMessage(item);
      if (failureMessage) {
        const accountIneligible = isTrialEligibilityAccountIneligibleDecision(decision);
        const tokenInvalid = isTrialEligibilityTokenInvalidDecision(decision);
        const prefix = accountIneligible
          ? UPI_ACCOUNT_INELIGIBLE_ERROR_PREFIX
          : (tokenInvalid ? UPI_ACCESS_TOKEN_EXPIRED_ERROR_PREFIX : '');
        const error = new Error(`${prefix}UPI 资格检查失败：${failureMessage}`);
        error.trialEligibilityDecision = decision;
        throw error;
      }
      return {
        ...item,
        trialEligibilityDecision: decision,
      };
    }
```

- [ ] **Step 3: Store channel fields when Step 7 writes Free**

In `checkRegistrationUpiTrialEligibility()`, after a successful check:

```javascript
        const eligibilityDecision = eligibility?.item?.trialEligibilityDecision
          || normalizeTrialEligibilityApiItem(eligibility?.item || {});
        const eligibilityPatch = buildTrialEligibilityResultPatch(eligibilityDecision);
        const reason = normalizeString(eligibilityPatch.trialEligibilityReason)
          || normalizeString(eligibility?.item?.message || eligibility?.item?.reason)
          || '账号有试用资格，已进入 Free 分组';
```

Pass the patch to `upsertTrialEligibleFreeCredential()`:

```javascript
          reason,
          checkedAt,
          ...eligibilityPatch,
          trialEligibilityStatus: 'eligible',
          trialEligibilityReason: reason,
          trialEligibilityCheckedAt: checkedAt,
```

Keep `trialEligibilityStatus: 'eligible'` because this branch only runs after the adapter says the coupon is eligible.

- [ ] **Step 4: Use decision on failed checks**

In the catch block of `checkRegistrationUpiTrialEligibility()`, use the decision if it exists:

```javascript
        const decision = error?.trialEligibilityDecision || null;
        const message = normalizeString(decision?.trialEligibilityReason) || getErrorMessage(error) || 'UPI 试用资格检测失败。';
        const failedAt = toIsoTimestamp();
        const trialEligibilityStatus = isTrialEligibilityAccountIneligibleDecision(decision || {})
          || isUpiAccountIneligibleError(error)
          ? 'ineligible'
          : 'failed';
```

This keeps incomplete responses and token failures out of the "无试用资格" path.

- [ ] **Step 5: Run syntax checks**

```powershell
node --check background/steps/upi-redeem.js
node --test scripts/test-trial-eligibility-api.cjs
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add background/steps/upi-redeem.js
git commit -m "fix: align trial eligibility decisions with backend api"
```

---

#### Task 4: Persist Channel Eligibility Fields on Result Rows

**Files:**
- Modify: `background/upi-credential-membership-checker.js:1199-1284`
- Modify: `background/upi-credential-membership-checker.js:2276-2511`
- Modify: `sidepanel/account-records-manager.js`

- [ ] **Step 1: Preserve new fields in background result normalization**

In `normalizeResultItem()`, add these fields after `trialEligibilityCheckedAt`:

```javascript
      trialEligibilityReasonCode: normalizeString(item.trialEligibilityReasonCode),
      trialEligibilityCheckedByApi: item.trialEligibilityCheckedByApi === true,
      trialEligibilityTransientFailure: item.trialEligibilityTransientFailure === true,
      trialEligibilityRetryable: item.trialEligibilityRetryable === true,
      trialEligibilityRetryCount: Math.max(0, Math.floor(Number(item.trialEligibilityRetryCount) || 0)),
      trialEligibilityLastError: normalizeString(item.trialEligibilityLastError),
      couponState: normalizeString(item.couponState || item.coupon_state),
      registrationType: normalizeString(item.registrationType || item.reg_type),
      phoneNumber: normalizeString(item.phoneNumber || item.phone_number),
      phoneVerified: item.phoneVerified === true,
      accountId: normalizeString(item.accountId || item.account_id),
      responseEmail: normalizeEmail(item.responseEmail || item.emailFromApi || item.apiEmail),
      jwtExpired: item.jwtExpired === true,
      jwtExpiresInSeconds: Math.max(0, Math.floor(Number(item.jwtExpiresInSeconds || item.jwt_exp_in_sec) || 0)),
      upiChannelEligibilityStatus: normalizeString(item.upiChannelEligibilityStatus || item.upiEligibilityStatus),
      upiChannelEligibilityReason: normalizeString(item.upiChannelEligibilityReason || item.upi_eligible_reason || item.upiEligibleReason),
      idealChannelEligibilityStatus: normalizeString(item.idealChannelEligibilityStatus || item.idealEligibilityStatus),
      idealChannelEligibilityReason: normalizeString(item.idealChannelEligibilityReason || item.ideal_eligible_reason || item.idealEligibleReason),
```

- [ ] **Step 2: Preserve fields in `upsertTrialEligibleFreeCredential()`**

Before `nextItems`, compute:

```javascript
      const trialEligibilityReasonCode = normalizeString(input.trialEligibilityReasonCode || credential.trialEligibilityReasonCode || existingItem.trialEligibilityReasonCode);
      const trialEligibilityTransientFailure = input.trialEligibilityTransientFailure === true || credential.trialEligibilityTransientFailure === true;
      const trialEligibilityRetryable = input.trialEligibilityRetryable === true || credential.trialEligibilityRetryable === true || trialEligibilityTransientFailure;
      const trialEligibilityRetryCount = Math.max(0, Math.floor(Number(input.trialEligibilityRetryCount || credential.trialEligibilityRetryCount || existingItem.trialEligibilityRetryCount) || 0));
      const trialEligibilityLastError = normalizeString(input.trialEligibilityLastError || credential.trialEligibilityLastError || existingItem.trialEligibilityLastError);
      const couponState = normalizeString(input.couponState || credential.couponState || existingItem.couponState);
      const registrationType = normalizeString(input.registrationType || credential.registrationType || existingItem.registrationType);
      const phoneNumber = normalizeString(input.phoneNumber || credential.phoneNumber || existingItem.phoneNumber);
      const phoneVerified = input.phoneVerified === true || credential.phoneVerified === true || existingItem.phoneVerified === true;
      const accountId = normalizeString(input.accountId || credential.accountId || existingItem.accountId);
      const responseEmail = normalizeEmail(input.responseEmail || credential.responseEmail || existingItem.responseEmail);
      const jwtExpired = input.jwtExpired === true || credential.jwtExpired === true || existingItem.jwtExpired === true;
      const jwtExpiresInSeconds = Math.max(0, Math.floor(Number(input.jwtExpiresInSeconds || credential.jwtExpiresInSeconds || existingItem.jwtExpiresInSeconds) || 0));
      const upiChannelEligibilityStatus = normalizeString(input.upiChannelEligibilityStatus || credential.upiChannelEligibilityStatus || existingItem.upiChannelEligibilityStatus);
      const upiChannelEligibilityReason = normalizeString(input.upiChannelEligibilityReason || credential.upiChannelEligibilityReason || existingItem.upiChannelEligibilityReason);
      const idealChannelEligibilityStatus = normalizeString(input.idealChannelEligibilityStatus || credential.idealChannelEligibilityStatus || existingItem.idealChannelEligibilityStatus);
      const idealChannelEligibilityReason = normalizeString(input.idealChannelEligibilityReason || credential.idealChannelEligibilityReason || existingItem.idealChannelEligibilityReason);
```

Add them to the item passed into `upsertResultItem()`:

```javascript
        trialEligibilityReasonCode,
        trialEligibilityCheckedByApi: input.trialEligibilityCheckedByApi === true || credential.trialEligibilityCheckedByApi === true || existingItem.trialEligibilityCheckedByApi === true,
        trialEligibilityTransientFailure,
        trialEligibilityRetryable,
        trialEligibilityRetryCount,
        trialEligibilityLastError,
        couponState,
        registrationType,
        phoneNumber,
        phoneVerified,
        accountId,
        responseEmail,
        jwtExpired,
        jwtExpiresInSeconds,
        upiChannelEligibilityStatus,
        upiChannelEligibilityReason,
        idealChannelEligibilityStatus,
        idealChannelEligibilityReason,
```

- [ ] **Step 3: Preserve fields in sidepanel action credentials**

In `buildUpiCredentialMembershipActionCredential(row = {})`, add:

```javascript
        trialEligibilityReasonCode: normalizeUpiCredentialMembershipText(row.trialEligibilityReasonCode),
        trialEligibilityCheckedByApi: row.trialEligibilityCheckedByApi === true,
        trialEligibilityTransientFailure: row.trialEligibilityTransientFailure === true,
        trialEligibilityRetryable: row.trialEligibilityRetryable === true,
        trialEligibilityRetryCount: Math.max(0, Math.floor(Number(row.trialEligibilityRetryCount) || 0)),
        trialEligibilityLastError: normalizeUpiCredentialMembershipText(row.trialEligibilityLastError),
        couponState: normalizeUpiCredentialMembershipText(row.couponState),
        registrationType: normalizeUpiCredentialMembershipText(row.registrationType),
        phoneNumber: normalizeUpiCredentialMembershipText(row.phoneNumber),
        phoneVerified: row.phoneVerified === true,
        accountId: normalizeUpiCredentialMembershipText(row.accountId),
        responseEmail: normalizeUpiCredentialMembershipEmail(row.responseEmail),
        jwtExpired: row.jwtExpired === true,
        jwtExpiresInSeconds: Math.max(0, Math.floor(Number(row.jwtExpiresInSeconds) || 0)),
        upiChannelEligibilityStatus: normalizeUpiCredentialMembershipText(row.upiChannelEligibilityStatus),
        upiChannelEligibilityReason: normalizeUpiCredentialMembershipText(row.upiChannelEligibilityReason),
        idealChannelEligibilityStatus: normalizeUpiCredentialMembershipText(row.idealChannelEligibilityStatus),
        idealChannelEligibilityReason: normalizeUpiCredentialMembershipText(row.idealChannelEligibilityReason),
```

- [ ] **Step 4: Run syntax checks**

```powershell
node --check background/upi-credential-membership-checker.js
node --check sidepanel/account-records-manager.js
```

Expected: pass.

- [ ] **Step 5: Commit**

```powershell
git add background/upi-credential-membership-checker.js sidepanel/account-records-manager.js
git commit -m "feat: persist trial channel eligibility fields"
```

---

#### Task 5: Filter UPI/IDEAL Candidates by Channel Eligibility

**Files:**
- Modify: `background/steps/upi-redeem.js:253-267`
- Modify: `background/upi-credential-membership-checker.js:2568-2582`
- Modify: `sidepanel/account-records-manager.js:2159-2205`
- Modify: `sidepanel/account-records-manager.js:2260-2296`

- [ ] **Step 1: Add channel eligibility helper in background step file**

In `background/steps/upi-redeem.js`, add:

```javascript
    function isTrialEligibilityChannelAllowed(item = {}, channel = 'upi') {
      const helper = getTrialEligibilityApiHelpers().isTrialEligibilityChannelAllowed;
      if (typeof helper === 'function') {
        return helper(item, channel);
      }
      const normalizedChannel = normalizeRedeemChannel(channel);
      const field = normalizedChannel === 'ideal'
        ? 'idealChannelEligibilityStatus'
        : 'upiChannelEligibilityStatus';
      const status = normalizeString(item?.[field]).toLowerCase();
      return !status || status === 'unknown' || status === 'eligible';
    }
```

Change `shouldRedeemItemUseChannel()`:

```javascript
      if (!isTrialEligibilityChannelAllowed(item, channel)) {
        return false;
      }
```

Place it after the `trialEligibilityStatus === 'ineligible'` check.

- [ ] **Step 2: Add channel filter in background membership checker**

In `background/upi-credential-membership-checker.js`, add a local helper near other redeem helpers:

```javascript
  function isTrialEligibilityChannelAllowed(item = {}, channel = 'upi') {
    const rootScope = typeof self !== 'undefined' ? self : globalThis;
    const helper = rootScope.MultiPageTrialEligibilityApi?.isTrialEligibilityChannelAllowed;
    if (typeof helper === 'function') {
      return helper(item, channel);
    }
    const normalizedChannel = normalizeRedeemChannel(channel);
    const field = normalizedChannel === 'ideal'
      ? 'idealChannelEligibilityStatus'
      : 'upiChannelEligibilityStatus';
    const status = normalizeString(item?.[field]).toLowerCase();
    return !status || status === 'unknown' || status === 'eligible';
  }
```

In `buildAutoContinuationRedeemCandidates()`, filter out channel-denied rows:

```javascript
      const normalizedChannel = normalizeRedeemChannel(channel);
```

Then inside the item filter:

```javascript
      if (!isTrialEligibilityChannelAllowed(item, normalizedChannel)) return false;
```

- [ ] **Step 3: Add sidepanel channel filter**

In `sidepanel/account-records-manager.js`, add:

```javascript
    function isTrialEligibilityChannelAllowed(row = {}, channel = 'upi') {
      const helper = (typeof window !== 'undefined' ? window.MultiPageTrialEligibilityApi : null)?.isTrialEligibilityChannelAllowed;
      if (typeof helper === 'function') {
        return helper(row, channel);
      }
      const redeemChannel = normalizeRedeemChannel(channel);
      const field = redeemChannel === 'ideal'
        ? 'idealChannelEligibilityStatus'
        : 'upiChannelEligibilityStatus';
      const status = normalizeUpiCredentialMembershipText(row[field]).toLowerCase();
      return !status || status === 'unknown' || status === 'eligible';
    }
```

In `isRedeemableFreeUpiCredentialMembershipRowForChannel()`, after the `trialEligibilityStatus === 'ineligible'` check:

```javascript
      if (!isTrialEligibilityChannelAllowed(row, redeemChannel)) {
        return false;
      }
```

- [ ] **Step 4: Improve skip reason**

In the function that returns row skip text around `sidepanel/account-records-manager.js:2260`, add before the generic "当前不可兑换":

```javascript
      if (!isTrialEligibilityChannelAllowed(row, 'upi') && !isTrialEligibilityChannelAllowed(row, 'ideal')) {
        return normalizeUpiCredentialMembershipText(row.upiChannelEligibilityReason || row.idealChannelEligibilityReason)
          || '账号有试用资格，但当前 UPI/IDEAL 渠道均不可兑换';
      }
```

Also add channel-specific reasons if this function is later passed a channel-specific context.

- [ ] **Step 5: Run syntax checks**

```powershell
node --check background/steps/upi-redeem.js
node --check background/upi-credential-membership-checker.js
node --check sidepanel/account-records-manager.js
```

Expected: pass.

- [ ] **Step 6: Commit**

```powershell
git add background/steps/upi-redeem.js background/upi-credential-membership-checker.js sidepanel/account-records-manager.js
git commit -m "fix: filter redeem candidates by channel eligibility"
```

---

#### Task 6: Fix Manual Trial Eligibility Recheck Coverage

**Files:**
- Modify: `sidepanel/account-records-manager.js:2299-2308`
- Modify: `sidepanel/account-records-manager.js:3590-3599`

- [ ] **Step 1: Make checkable row logic route-aware**

Replace `isTrialEligibilityCheckableFreeUpiCredentialMembershipRow(row = {})` with:

```javascript
    function isTrialEligibilityCheckableFreeUpiCredentialMembershipRow(row = {}) {
      const status = String(row.status || '').trim().toLowerCase();
      const trialStatus = normalizeTrialEligibilityStatus(row.trialEligibilityStatus);
      const hasAccessToken = Boolean(normalizeUpiCredentialMembershipText(row.accessToken));
      const hasPassword = Boolean(normalizeUpiCredentialMembershipText(row.password));
      const hasTotp = Boolean(normalizeUpiCredentialMembershipTotpSecret(row.totpMfaSecret));
      const hasPasskey = row.passkeyEnabled === true || Boolean(normalizeUpiCredentialMembershipText(row.passkeyCredentialId));
      const hasEmailUrl = Boolean(normalizeUpiCredentialMembershipText(row.verificationUrl || row.emailVerificationUrl || row.url));
      return row?.email
        && row.enabled !== false
        && status === 'free'
        && trialStatus !== 'eligible'
        && (
          hasAccessToken
          || hasTotp
          || hasPasskey
          || row.no2faFreeRoute === true
          || (hasPassword && hasEmailUrl)
          || hasPassword
        );
    }
```

The last `hasPassword` is intentional because row login now supports password-only fallback and will report the real page challenge.

- [ ] **Step 2: Send complete credential payload for rechecks**

Change `getTrialEligibilityCheckableFreeUpiCredentialMembershipRows()` mapping:

```javascript
        .map((row) => buildUpiCredentialMembershipActionCredential(row))
        .filter((row) => row.email);
```

This preserves Passkey, verification URL, no-2FA route, and AT fields.

- [ ] **Step 3: Run syntax checks**

```powershell
node --check sidepanel/account-records-manager.js
```

Expected: pass.

- [ ] **Step 4: Commit**

```powershell
git add sidepanel/account-records-manager.js
git commit -m "fix: broaden trial eligibility recheck routes"
```

---

#### Task 7: Add User-Driven Manual Eligibility Checks

**Files:**
- Modify: `background/upi-credential-membership-checker.js`
- Modify: `background/message-router.js`
- Modify: `sidepanel/account-records-manager.js`

- [ ] **Step 1: Add background single/batch manual check method**

In `background/upi-credential-membership-checker.js`, add a method inside `createUpiCredentialMembershipChecker()`:

```javascript
    async function checkUpiCredentialMembershipTrialEligibility(input = {}) {
      if (batchRunning || redeemRunning || cdkeyRetryRunning) {
        throw new Error('UPI 账号核验/兑换正在运行，请等待完成或先停止。');
      }
      batchRunning = true;
      batchStopRequested = false;
      const startedAt = new Date().toISOString();
      let currentResults = await getStoredResults();
      let items = mergeCredentialsIntoResultItems(
        currentResults.items,
        resolveInputCredentials(input).filter((credential) => credential.email)
      );
      const credentials = resolveInputCredentials(input).filter((credential) => credential.email);
      const runtimeState = {
        ...(await getState()),
        ...(input.settings || {}),
      };
      const eligible = [];
      const ineligible = [];
      const retryable = [];
      const failed = [];
      const skipped = [];

      const saveProgress = async (stage = 'trial-eligibility', email = '') => {
        currentResults = await saveResults({
          ...currentResults,
          items,
          running: true,
          updatedAt: new Date().toISOString(),
          flowStage: stage,
          flowStageEmail: normalizeEmail(email),
          source: normalizeString(input.source || 'manual-trial-eligibility-check'),
          total: credentials.length,
          completed: eligible.length + ineligible.length + retryable.length + failed.length + skipped.length,
        });
      };

      try {
        await addLog(`UPI 试用资格手动检查：开始处理 ${credentials.length} 个账号。`, 'info');
        for (const rawCredential of credentials) {
          throwIfMembershipStopRequested('check');
          const email = normalizeEmail(rawCredential.email);
          const existingItem = items.find((item) => normalizeEmail(item?.email) === email) || {};
          let credential = normalizeResultItem({
            ...existingItem,
            ...rawCredential,
            email,
            status: existingItem.status || rawCredential.status || 'free',
            planType: existingItem.planType || rawCredential.planType || 'free',
          });
          const backupCredential = await findBackupCredentialByEmail(email);
          if (backupCredential?.email) {
            credential = normalizeResultItem(mergeCredentialAuthMaterial(credential, backupCredential));
          }
          if (!credential.accessToken && !credential.password) {
            const reason = '缺少 AT 且缺少 GPT 密码，无法检查资格';
            skipped.push({ email, reason });
            items = upsertResultItem(items, {
              ...credential,
              reason,
              trialEligibilityRetryable: true,
              trialEligibilityLastError: reason,
            });
            await saveProgress('trial-eligibility', email);
            continue;
          }

          try {
            await saveProgress(credential.accessToken ? 'trial-eligibility' : 'token', email);
            let accessToken = normalizeString(credential.accessToken);
            if (!accessToken) {
              const session = await loginAndReadAccessToken(credential, runtimeState, {
                onStage: async (stage) => saveProgress(stage, email),
                throwIfStopRequested: () => throwIfMembershipStopRequested('check'),
              });
              accessToken = normalizeString(session.accessToken || getChatGptSessionAccessToken(session.session || session));
            }
            const response = await checkUpiRedeemAccessTokenEligibility({
              state: runtimeState,
              accessToken,
            });
            const decision = response?.trialEligibilityDecision
              || normalizeTrialEligibilityApiItem(response || {});
            const patch = buildTrialEligibilityResultPatch(decision);
            const checkedAt = new Date().toISOString();
            if (patch.trialEligibilityStatus === 'eligible') {
              currentResults = await upsertTrialEligibleFreeCredential({
                source: 'manual-trial-eligibility-check',
                email,
                credential,
                accessToken,
                accessTokenMasked: maskAccessToken(accessToken),
                checkedAt,
                reason: patch.trialEligibilityReason || '账号有试用资格',
                ...patch,
                trialEligibilityRetryCount: 0,
                trialEligibilityLastError: '',
              });
              items = currentResults.items;
              eligible.push({ email, reason: patch.trialEligibilityReason });
            } else if (patch.trialEligibilityStatus === 'ineligible') {
              if (typeof markRegistrationEmailTrialIneligible === 'function') {
                await markRegistrationEmailTrialIneligible({ email, reason: patch.trialEligibilityReason, checkedAt });
              }
              items = upsertResultItem(items, {
                ...credential,
                ...patch,
                checkedAt,
                reason: patch.trialEligibilityReason || '账号无试用资格',
              });
              ineligible.push({ email, reason: patch.trialEligibilityReason });
            } else {
              const reason = patch.trialEligibilityReason || '资格检查失败，可手动重试';
              retryable.push({ email, reason });
              items = upsertResultItem(items, {
                ...credential,
                ...patch,
                checkedAt,
                reason,
                trialEligibilityStatus: 'failed',
                trialEligibilityRetryable: true,
                trialEligibilityRetryCount: normalizeRetryCount(credential.trialEligibilityRetryCount) + 1,
                trialEligibilityLastError: reason,
              });
            }
            await saveProgress('trial-eligibility', email);
          } catch (error) {
            const reason = getErrorMessage(error) || '资格检查失败，可手动重试';
            const retryableCheck = !isUpiTrialIneligibleError(error);
            (retryableCheck ? retryable : failed).push({ email, reason });
            items = upsertResultItem(items, {
              ...credential,
              status: credential.status || 'free',
              planType: credential.planType || 'free',
              checkedAt: new Date().toISOString(),
              reason,
              trialEligibilityStatus: 'failed',
              trialEligibilityReason: reason,
              trialEligibilityRetryable: retryableCheck,
              trialEligibilityTransientFailure: retryableCheck,
              trialEligibilityRetryCount: normalizeRetryCount(credential.trialEligibilityRetryCount) + 1,
              trialEligibilityLastError: reason,
            });
            await saveProgress('trial-eligibility', email);
          }
        }

        const finishedAt = new Date().toISOString();
        const results = await saveResults({
          ...currentResults,
          items,
          running: false,
          updatedAt: finishedAt,
          finishedAt,
          flowStage: '',
          flowStageEmail: '',
          source: normalizeString(input.source || 'manual-trial-eligibility-check'),
          total: credentials.length,
          completed: eligible.length + ineligible.length + retryable.length + failed.length + skipped.length,
        });
        await addLog(
          `UPI 试用资格手动检查完成：有资格 ${eligible.length}，无资格 ${ineligible.length}，可重试 ${retryable.length}，失败 ${failed.length}，跳过 ${skipped.length}。`,
          'ok'
        );
        return { results, eligible, ineligible, retryable, failed, skipped };
      } finally {
        batchRunning = false;
      }
    }
```

Add this method to the object returned by `createUpiCredentialMembershipChecker()`:

```javascript
      checkUpiCredentialMembershipTrialEligibility,
```

- [ ] **Step 2: Add message routes**

In `background/message-router.js`, add routes near other UPI credential membership routes:

```javascript
      case 'CHECK_UPI_CREDENTIAL_MEMBERSHIP_TRIAL_ELIGIBILITY': {
        const checker = getUpiCredentialMembershipChecker();
        return checker.checkUpiCredentialMembershipTrialEligibility({
          ...(message.payload || {}),
          source: message.payload?.source || 'manual-trial-eligibility-check',
        });
      }
      case 'CHECK_UPI_CREDENTIAL_MEMBERSHIP_TRIAL_ELIGIBILITY_BATCH': {
        const checker = getUpiCredentialMembershipChecker();
        return checker.checkUpiCredentialMembershipTrialEligibility({
          ...(message.payload || {}),
          source: message.payload?.source || 'manual-trial-eligibility-batch',
        });
      }
```

- [ ] **Step 3: Add sidepanel candidate helper**

In `sidepanel/account-records-manager.js`, add:

```javascript
    function isManualTrialEligibilityCheckableRow(row = {}) {
      const status = String(row.status || '').trim().toLowerCase();
      const trialStatus = normalizeTrialEligibilityStatus(row.trialEligibilityStatus);
      const hasAccessToken = Boolean(normalizeUpiCredentialMembershipText(row.accessToken));
      const hasPassword = Boolean(normalizeUpiCredentialMembershipText(row.password));
      const isRetryable = row.trialEligibilityRetryable === true
        || trialStatus === 'failed'
        || !trialStatus;
      return row?.email
        && row.enabled !== false
        && status === 'free'
        && trialStatus !== 'eligible'
        && trialStatus !== 'ineligible'
        && isRetryable
        && (hasAccessToken || hasPassword);
    }

    function getManualTrialEligibilityCheckRows() {
      return buildUpiCredentialMembershipDisplayRows(getUpiCredentialMembershipCheckResults())
        .filter(isManualTrialEligibilityCheckableRow)
        .map((row) => buildUpiCredentialMembershipActionCredential(row))
        .filter((row) => row.email);
    }
```

- [ ] **Step 4: Add sidepanel actions**

Add a batch action near existing Free group actions:

```javascript
    async function checkAllUpiCredentialMembershipTrialEligibility() {
      const credentials = getManualTrialEligibilityCheckRows();
      if (!credentials.length) {
        helpers.showToast?.('没有可检查的 Free 账号；需要账号有 AT 或 GPT 密码。', 'warn', 2200);
        return;
      }
      try {
        upiCredentialMembershipCheckBusy = true;
        render();
        const response = await runtime.sendMessage({
          type: 'CHECK_UPI_CREDENTIAL_MEMBERSHIP_TRIAL_ELIGIBILITY_BATCH',
          source: 'sidepanel',
          payload: {
            credentials,
            settings: getMembershipCheckSettingsPayload(),
          },
        });
        if (response?.error) {
          throw new Error(response.error);
        }
        if (response?.results) {
          state.syncLatestState({
            upiCredentialMembershipCheckResults: mergeManualFreeMembershipOverridesIntoResults(response.results),
          });
        }
        helpers.showToast?.(
          `试用资格检查完成：有资格 ${response?.eligible?.length || 0}，无资格 ${response?.ineligible?.length || 0}，可重试 ${response?.retryable?.length || 0}，失败 ${response?.failed?.length || 0}，跳过 ${response?.skipped?.length || 0}。`,
          'success',
          3000
        );
      } catch (error) {
        helpers.showToast?.(`试用资格检查失败：${error.message}`, 'error');
      } finally {
        upiCredentialMembershipCheckBusy = false;
        await refreshUpiCredentialMembershipCheckResults().catch(() => null);
        render();
      }
    }

    async function checkSingleUpiCredentialMembershipTrialEligibility(email = '') {
      const normalizedEmail = normalizeUpiCredentialMembershipEmail(email);
      const row = getUpiCredentialMembershipDisplayRowByEmail(normalizedEmail);
      if (!row) {
        helpers.showToast?.(`未找到账号 ${normalizedEmail}`, 'warn', 1800);
        return;
      }
      const credential = buildUpiCredentialMembershipActionCredential(row);
      const response = await runtime.sendMessage({
        type: 'CHECK_UPI_CREDENTIAL_MEMBERSHIP_TRIAL_ELIGIBILITY',
        source: 'sidepanel',
        payload: {
          credentials: [credential],
          settings: getMembershipCheckSettingsPayload(),
        },
      });
      if (response?.error) {
        throw new Error(response.error);
      }
      if (response?.results) {
        state.syncLatestState({
          upiCredentialMembershipCheckResults: mergeManualFreeMembershipOverridesIntoResults(response.results),
        });
      }
      helpers.showToast?.(
        `${normalizedEmail} 资格检查完成：${response?.eligible?.length ? '有资格' : response?.ineligible?.length ? '无资格' : response?.retryable?.length ? '网络波动，可重试' : '检查失败'}`,
        response?.eligible?.length ? 'success' : 'warn',
        2600
      );
    }
```

Add a Free-group button:

```javascript
      createButton(`检查试用资格(${getManualTrialEligibilityCheckRows().length})`, checkAllUpiCredentialMembershipTrialEligibility)
```

Add a row-level button or menu item:

```javascript
      createButton('检查资格', () => checkSingleUpiCredentialMembershipTrialEligibility(row.email))
```

- [ ] **Step 5: Show retryable network state in rows**

Where row reason text is rendered, prefer `trialEligibilityLastError` when retryable:

```javascript
      const trialStatus = normalizeTrialEligibilityStatus(row.trialEligibilityStatus);
      if (trialStatus === 'failed' && row.trialEligibilityRetryable === true) {
        return normalizeUpiCredentialMembershipText(row.trialEligibilityLastError || row.trialEligibilityReason || row.reason)
          || '资格检查失败，可手动重试';
      }
```

Expected visible text examples:

- `资格检查失败，可手动重试：fetch-error`
- `资格检查失败，可手动重试：http-error`
- `资格检查失败，可手动重试：unknown-coupon-state`

- [ ] **Step 6: Run syntax checks**

```powershell
node --check background/upi-credential-membership-checker.js
node --check background/message-router.js
node --check sidepanel/account-records-manager.js
```

Expected: pass.

- [ ] **Step 7: Commit**

```powershell
git add background/upi-credential-membership-checker.js background/message-router.js sidepanel/account-records-manager.js
git commit -m "feat: add manual trial eligibility checks"
```

---

#### Task 8: Verification and Regression Checks

**Files:**
- No new code unless a previous task fails.

- [ ] **Step 1: Run full syntax checks**

```powershell
node --check background.js
node --check shared/trial-eligibility-api.js
node --check background/steps/upi-redeem.js
node --check background/upi-credential-membership-checker.js
node --check background/message-router.js
node --check sidepanel/account-records-manager.js
node --check sidepanel/sidepanel.js
```

Expected: all pass.

- [ ] **Step 2: Run focused tests**

```powershell
node --test scripts/test-trial-eligibility-api.cjs
node --test scripts/test-passkey-login-core.cjs
```

Expected: all tests pass.

- [ ] **Step 3: Run project smoke audits**

```powershell
node scripts/audit-smoke-tests.mjs
node scripts/audit-no-phone-sms.mjs
node scripts/audit-no-removed-network.mjs
git diff --check
```

Expected:

- `audit-smoke-tests.mjs`: `PASS audit smoke checks completed with 0 warning(s).`
- no syntax or whitespace errors.

- [ ] **Step 4: Manual test matrix**

Use controlled backend responses or a local mocked response path:

1. `token_ok=true, eligible=true, upi_eligible=true, ideal_eligible=true`
   - Expected: account enters Free, UPI candidate yes, IDEAL candidate yes.
2. `token_ok=true, eligible=true, upi_eligible=false, ideal_eligible=true`
   - Expected: account enters Free, UPI candidate no, IDEAL candidate yes.
3. `token_ok=true, eligible=true, upi_eligible=true, ideal_eligible=false`
   - Expected: account enters Free, UPI candidate yes, IDEAL candidate no.
4. `token_ok=true, eligible=true, upi_eligible=false, ideal_eligible=false`
   - Expected: account enters Free, neither redeem button selects it, row reason shows channel unavailable.
5. `token_ok=true, eligible=false, reason=not-eligible`
   - Expected: does not enter Free, source mailbox marked no trial eligibility.
6. `token_ok=false, reason=jwt-expired`
   - Expected: does not mark no trial eligibility; reports AT/login failure.
7. `token_ok=true, reason=eligible` but `eligible` missing
   - Expected: reports incomplete check/failed, does not mark no trial eligibility.
8. Network timeout or backend `reason=fetch-error`
   - Expected: does not enter Free, does not mark no trial eligibility, row/mailbox shows retryable check failure.
9. Backend `reason=http-error` or HTTP 429/5xx
   - Expected: retryable failure state is saved, no email is deleted or marked no trial eligibility.
10. Click single-row `检查资格` after a retryable failure
   - Expected: one account is checked again; eligible result enters Free, not-eligible result marks mailbox no trial eligibility, network failure stays retryable.
11. Click batch `检查试用资格(N)`
   - Expected: only rows with AT or login material are selected; toast shows 有资格/无资格/可重试/失败/跳过 counts.

- [ ] **Step 5: Commit verification docs if needed**

If manual test notes are added:

```powershell
git add docs/superpowers/plans/2026-07-06-trial-eligibility-api-alignment.md
git commit -m "docs: document trial eligibility api alignment plan"
```

If no docs changed, skip this commit.

---

### Self-Review

**Spec coverage:** The plan covers the backend API fields in the screenshot, Free entry gating, UPI/IDEAL channel eligibility, incomplete responses, token failures, network fluctuation retry states, manual single/batch eligibility checks, manual recheck routes, and candidate counts.

**Placeholder scan:** No task uses TBD/TODO/later wording. Each code task includes exact file names and concrete snippets.

**Type consistency:** New result fields use one normalized naming scheme:

- `trialEligibilityStatus`
- `trialEligibilityReason`
- `trialEligibilityReasonCode`
- `trialEligibilityTransientFailure`
- `trialEligibilityRetryable`
- `trialEligibilityRetryCount`
- `trialEligibilityLastError`
- `upiChannelEligibilityStatus`
- `upiChannelEligibilityReason`
- `idealChannelEligibilityStatus`
- `idealChannelEligibilityReason`

Existing code can continue reading old fields; new code writes the normalized fields.
