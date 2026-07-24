# Audit Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 2026-07-04 项目审查中发现的渠道续兑、Plus 删除、侧栏入口、运行态残留和文档漂移问题，并保留可重复运行的 smoke 测试。

**Architecture:** 不重构大文件，只在现有 MV3 原生 JS 架构里做小范围修复。侧栏继续由 `sidepanel/sidepanel.js` 绑定静态 DOM，由 `sidepanel/account-records-manager.js` 渲染 Free/Plus 分组；后台继续由 `background/upi-credential-membership-checker.js` 管理会员核验状态。

**Tech Stack:** Chrome MV3 extension, plain JavaScript, PowerShell, Node.js `--check`, custom smoke script.

---

## File Structure

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

### Task 1: Backup Current Worktree

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

### Task 2: Fix Channel-Specific CDK Import Continuation

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

### Task 3: Fix Single Plus Delete Semantics

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

### Task 4: Clear Membership Running State On Unexpected Errors

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

### Task 5: Restore Missing Sidepanel Entrypoints

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

### Task 6: Update Documentation Drift

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

### Task 7: Final Verification

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

## Self-Review

- Spec coverage: backup, channel-specific continuation, Plus deletion, running-state cleanup, missing sidepanel entrypoints, docs drift, and smoke tests are all mapped to tasks.
- Placeholder scan: no `TBD`, no generic “add tests” without commands, no unresolved file names.
- Type consistency: existing project names are preserved: `redeemChannel`, `getEnabledFreeUpiCredentialMembershipRowsForChannel`, `redeemPlusDeletedEmailsByChannel`, `running`, `stoppedAt`.
