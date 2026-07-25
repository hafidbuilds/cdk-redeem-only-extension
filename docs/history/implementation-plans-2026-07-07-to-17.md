# 实施计划归档：2026-07-07 至 2026-07-17

这些计划已执行或被后续实现取代，仅用于追溯。文件内路径、模块名、命令和阶段判断不得覆盖当前代码与开发指南。

## 目录

- [Codebase Decomposition Finish Implementation Plan](#2026-07-07-codebase-decomposition-finish-plan)
- [Codebase Decomposition Next Steps Implementation Plan](#2026-07-07-codebase-decomposition-next-steps)
- [Codebase Decomposition Phase Eight Implementation Plan](#2026-07-07-codebase-decomposition-phase-eight-plan)
- [Codebase Decomposition Phase Five Implementation Plan](#2026-07-07-codebase-decomposition-phase-five-plan)
- [Codebase Decomposition Phase Four Implementation Plan](#2026-07-07-codebase-decomposition-phase-four-plan)
- [Codebase Decomposition Phase Six Implementation Plan](#2026-07-07-codebase-decomposition-phase-six-plan)
- [Complete Module Split Implementation Plan](#2026-07-07-complete-module-split)
- [Free Export Verification URL Toggle Implementation Plan](#2026-07-10-free-export-verification-url-toggle)
- [PIX Redeem Channel Implementation Plan](#2026-07-17-pix-redeem-channel)

---

<a id="2026-07-07-codebase-decomposition-finish-plan"></a>

<!-- archived-from: docs/superpowers/plans/2026-07-07-codebase-decomposition-finish-plan.md -->

## Codebase Decomposition Finish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the next decomposition pass by shrinking the remaining entry files without changing runtime behavior.

**Architecture:** Extract focused helper modules from `background.js` and `sidepanel/sidepanel.js`, then keep the entry files as wiring layers. New modules use the repository's existing IIFE globals plus CommonJS exports for Node tests.

**Tech Stack:** Chrome MV3 extension, plain JavaScript, `importScripts`, sidepanel script globals, Node `node:test`.

### Global Constraints

- Work on branch `codex/codebase-decomposition-finish`.
- No GitHub push, no version bump, no release packaging.
- Preserve behavior and script order.
- Keep new modules small and covered by focused tests.
- Run syntax, smoke, removed-feature audits, and Node tests before completion.

---

#### Task 1: Background State Patch Helpers

**Files:**
- Create: `background/bootstrap/state-patch-helpers.js`
- Modify: `background.js`
- Test: `scripts/test-background-state-patch-helpers.cjs`

**Interfaces:**
- Produces: `self.MultiPageBackgroundStatePatchHelpers.createStatePatchHelpers(context)`.
- Consumes: registration email helpers, runtime state helpers, `chrome.storage.local`, storage key names, and logger.

- [ ] Extract registration email fallback helpers, runtime state patch helpers, stale membership-result protection, UPI CDK alias alignment, and state patch comparison.
- [ ] Replace the matching definitions in `background.js` with destructuring from the helper module.
- [ ] Add tests for stale-result protection and alias alignment.
- [ ] Run `node --check background/bootstrap/state-patch-helpers.js` and the new test.
- [ ] Commit `refactor: extract background state patch helpers`.

#### Task 2: Background Settings Bundle Transfer

**Files:**
- Create: `background/bootstrap/settings-transfer.js`
- Modify: `background.js`
- Test: `scripts/test-background-settings-transfer.cjs`

**Interfaces:**
- Produces: `self.MultiPageBackgroundSettingsTransfer.createSettingsTransfer(context)`.
- Consumes: persisted settings builders, runtime storage keys, alias state helpers, state setters, and broadcaster callbacks.

- [ ] Extract settings export filename building, runtime data normalization, runtime data export/import, settings bundle export, and settings bundle import.
- [ ] Replace `background.js` functions with destructured functions from the transfer module.
- [ ] Add tests for filename format, membership result normalization, and runtime import update building.
- [ ] Run `node --check background/bootstrap/settings-transfer.js` and the new test.
- [ ] Commit `refactor: extract background settings transfer`.

#### Task 3: Sidepanel CDK Pool Pure State

**Files:**
- Create: `sidepanel/cdk-pool-state.js`
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/sidepanel.js`
- Test: `scripts/test-sidepanel-cdk-pool-state.cjs`

**Interfaces:**
- Produces: `window.SidepanelCdkPoolState.createCdkPoolStateHelpers(context)`.
- Consumes: UPI/IDEAL state objects and channel aliases.

- [ ] Extract pure CDK pool text, usage, channel, job capability, remote status, selectable, and state-patch helpers.
- [ ] Load `cdk-pool-state.js` before `sidepanel.js`.
- [ ] Replace duplicate helper bodies in `sidepanel.js` with module delegates.
- [ ] Add tests for UPI/IDEAL patch aliases and selectable status.
- [ ] Run `node --check sidepanel/cdk-pool-state.js` and the new test.
- [ ] Commit `refactor: extract sidepanel cdk pool state`.

#### Task 4: Sidepanel Settings Normalization

**Files:**
- Create: `sidepanel/settings-normalization.js`
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/sidepanel.js`
- Test: `scripts/test-sidepanel-settings-normalization.cjs`

**Interfaces:**
- Produces: `window.SidepanelSettingsNormalization.createSettingsNormalization(context)`.
- Consumes: constants for bounded fields and provider defaults.

- [ ] Extract the remaining pure sidepanel normalization helpers for auto-run delays, verification resend counts, provider domains, custom email pool entries, and panel mode selection.
- [ ] Load `settings-normalization.js` before `sidepanel.js`.
- [ ] Delegate matching functions in `sidepanel.js` to the module.
- [ ] Add tests for custom pool availability and bounded numeric normalization.
- [ ] Run `node --check sidepanel/settings-normalization.js` and the new test.
- [ ] Commit `refactor: extract sidepanel settings normalization`.

#### Task 5: Final Guards and Verification

**Files:**
- Modify: `scripts/audit-smoke-tests.mjs`
- Modify: this plan file with final results.

- [ ] Tighten line-count guards for `background.js` and `sidepanel/sidepanel.js`.
- [ ] Add guards for new modules.
- [ ] Run:
  - `node --check background.js`
  - `node --check sidepanel/sidepanel.js`
  - `node scripts/audit-smoke-tests.mjs`
  - `node scripts/audit-no-phone-sms.mjs`
  - `node scripts/audit-no-removed-network.mjs`
  - `node --test scripts/test-*.cjs`
  - `node scripts/module-size-report.mjs`
- [ ] Commit `test: guard final decomposition modules`.

### Execution Notes

- Prefer extracting pure helpers first; if a dependency-heavy function would require broad behavior changes, leave it in the entry file and document the next split target.
- Passing tests and unchanged user-facing behavior are more important than maximizing removed line count in one risky edit.

### Execution Results

- Created `background/bootstrap/state-patch-helpers.js` and moved registration email state fallbacks, runtime state patch wrappers, stale membership result protection, UPI CDK alias alignment, and state-patch comparison.
- Created `background/bootstrap/settings-transfer.js` and moved settings export filename generation plus runtime data export/import normalization and settings bundle import/export.
- Created `sidepanel/cdk-pool-state.js` and moved CDK pool text/usage/channel helpers, remote status normalization, selectability, retry, and cancel policy helpers.
- Created `sidepanel/settings-normalization.js` and moved custom email pool entry normalization plus provider domain/base URL normalizers.
- Added focused Node tests for all four new modules.
- Tightened audit guards: `background.js <= 15400`, `sidepanel/sidepanel.js <= 10100`, and new modules have individual size guards.

Final verification on branch `codex/codebase-decomposition-finish`:

- `node --check background.js`
- `node --check sidepanel/sidepanel.js`
- `node --check background/bootstrap/state-patch-helpers.js`
- `node --check background/bootstrap/settings-transfer.js`
- `node --check sidepanel/cdk-pool-state.js`
- `node --check sidepanel/settings-normalization.js`
- `node scripts/audit-smoke-tests.mjs`
- `node scripts/audit-no-phone-sms.mjs`
- `node scripts/audit-no-removed-network.mjs`
- `node --test scripts/test-*.cjs`
- `node scripts/module-size-report.mjs`

Result: all verification passed; `137/137` Node tests passed. Remaining warnings are the expected tracked-source warnings for `background.js` and `sidepanel/sidepanel.js` still being over 8000 lines.

---

<a id="2026-07-07-codebase-decomposition-next-steps"></a>

<!-- archived-from: docs/superpowers/plans/2026-07-07-codebase-decomposition-next-steps.md -->

## Codebase Decomposition Next Steps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continue splitting the remaining oversized source files while preserving the current registration, email-pool, Free/Plus, UPI/IDEAL, 2FA, Passkey, AT supplement, and export behavior.

**Architecture:** Keep the current Chrome MV3 no-bundler style: each extracted browser module attaches one explicit `window`/`globalThis` namespace and also exports CommonJS for tests. Split pure policy/format/view-model code first, then move browser side-effect executors after characterization tests protect current behavior.

**Tech Stack:** Plain JavaScript, Chrome extension MV3, global IIFE modules, CommonJS `node:test`, `node --check`, existing smoke and removal audits.

---

### Current Split State

| Area | Current State | Next Risk |
| --- | --- | --- |
| `sidepanel/sidepanel.js` | Workflow button state and status display are already extracted. | Still owns broad page orchestration and event wiring. |
| `sidepanel/account-records-manager.js` | Still mixes Free/Plus row policy, credential import/export, redeem progress, record history UI, and DOM rendering. | Highest sidepanel regression risk. |
| `background/upi-credential-membership-checker.js` | Still mixes result normalization, storage, deletion, login/AT supplement, eligibility, and redeem orchestration. | Highest background behavior risk. |
| `content/signup-page.js` | Still mixes page detection, localized text, actions, and step commands. | Page-change fixes remain hard to isolate. |
| `background.js` | Still too large as a bootstrap/orchestration file. | Should become dependency wiring only after helpers move out. |

### Guardrails

- Do not change user-visible behavior during this decomposition pass.
- Do not remove Free/Plus, UPI/IDEAL, Passkey, no-2FA, 2FA, eligibility, export, or email-pool functionality.
- Do not update version, create release assets, or publish to GitHub as part of this plan.
- Commit after each completed task.
- Every extracted module must have a small CommonJS test if it contains pure logic.

### Preflight

- [ ] **Step 1: Confirm clean workspace**

Run:

```powershell
git status --short
```

Expected: no output. If there is output, inspect it and do not overwrite unrelated user changes.

- [ ] **Step 2: Capture baseline checks**

Run:

```powershell
node scripts/audit-smoke-tests.mjs
node scripts/audit-no-phone-sms.mjs
node scripts/audit-no-removed-network.mjs
node --test scripts/test-*.cjs
```

Expected: all commands exit `0`. `audit-smoke-tests.mjs` may continue warning that `background.js` and `sidepanel/sidepanel.js` are over the line-count threshold.

---

#### Task 1: Make Sidepanel Free Import/Export Use The Shared Credential Format

**Files:**
- Modify: `sidepanel/account-records-manager.js`
- Modify: `scripts/audit-smoke-tests.mjs`
- Create: `scripts/test-sidepanel-membership-format-compat.cjs`
- Reuse: `shared/membership-credential-format.js`

- [ ] **Step 1: Add compatibility tests for current Free text formats**

Create `scripts/test-sidepanel-membership-format-compat.cjs`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const format = require('../shared/membership-credential-format.js');

test('formats full 2FA Free rows with verification URL, AT, and timestamp', () => {
  const line = format.formatFreeCredentialLine({
    email: 'User@Test.com',
    password: 'pw',
    totpMfaSecret: 'abcd efgh',
    verificationUrl: 'https://assurivo.com/console/feed.php?mail=user%40test.com&pwd=x&limit=5',
    accessToken: 'at-token',
    checkedAt: '2026-07-07 12:00:00',
  });
  assert.equal(
    line,
    'user@test.com---pw---ABCDEFGH---https://assurivo.com/console/open.php?mail=user%40test.com&pwd=x&limit=5---at-token---2026-07-07 12:00:00',
  );
});

test('formats no-2FA Free rows as email URL AT timestamp', () => {
  const line = format.formatFreeCredentialLine({
    email: 'user@test.com',
    verificationUrl: 'https://assurivo.com/console/open.php?mail=user%40test.com&pwd=x&limit=5',
    accessToken: 'at-token',
    checkedAt: '2026-07-07 12:00:00',
    no2faFreeRoute: true,
  });
  assert.equal(
    line,
    'user@test.com---https://assurivo.com/console/open.php?mail=user%40test.com&pwd=x&limit=5---at-token---2026-07-07 12:00:00',
  );
});

test('parses Passkey marker rows without shifting AT and timestamp columns', () => {
  const row = format.parseCredentialLine(
    'user@test.com---pw---PASSKEY:cred-1;signCount=7;alg=-7---at-token---2026-07-07 12:00:00',
  );
  assert.equal(row.email, 'user@test.com');
  assert.equal(row.password, 'pw');
  assert.equal(row.passkeyEnabled, true);
  assert.equal(row.passkeyCredentialId, 'cred-1');
  assert.equal(row.passkeySignCount, 7);
  assert.equal(row.passkeyAlg, -7);
  assert.equal(row.accessToken, 'at-token');
  assert.equal(row.checkedAt, '2026-07-07 12:00:00');
});
```

- [ ] **Step 2: Run the new characterization test**

Run:

```powershell
node --test scripts/test-sidepanel-membership-format-compat.cjs
```

Expected: PASS before extraction, proving the shared parser/formatter already covers the sidepanel row shapes.

- [ ] **Step 3: Delegate duplicate sidepanel format helpers**

In `sidepanel/account-records-manager.js`, keep compatibility function names but delegate these local helpers to `window.MultiPageMembershipCredentialFormat`:

```javascript
function getMembershipCredentialFormatHelpers() {
  const helpers = root.MultiPageMembershipCredentialFormat;
  if (!helpers || typeof helpers.parseCredentialLine !== 'function') {
    throw new Error('Membership credential format module is not loaded.');
  }
  return helpers;
}
```

Use that helper for:

- `normalizeUpiCredentialMembershipCredential`
- `parseUpiCredentialMembershipText`
- Free export row construction where the output shape is `email---password---2FA/PASSKEY---url---AT---timestamp` or `email---url---AT---timestamp`.

- [ ] **Step 4: Verify script order remains valid**

Confirm `sidepanel/sidepanel.html` keeps:

```html
<script src="../shared/membership-credential-format.js"></script>
<script src="account-records-manager.js"></script>
```

Add an audit assertion in `scripts/audit-smoke-tests.mjs` that `membership-credential-format.js` appears before `account-records-manager.js`.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
node --check sidepanel/account-records-manager.js
node --check shared/membership-credential-format.js
node --check scripts/audit-smoke-tests.mjs
node scripts/audit-smoke-tests.mjs
node --test scripts/test-sidepanel-membership-format-compat.cjs
node --test scripts/test-*.cjs
git add sidepanel/account-records-manager.js scripts/audit-smoke-tests.mjs scripts/test-sidepanel-membership-format-compat.cjs
git commit -m "refactor: share membership credential formatting in sidepanel"
```

---

#### Task 2: Extract Account Record View Model And Filters

**Files:**
- Create: `sidepanel/account-records-view-model.js`
- Create: `scripts/test-account-records-view-model.cjs`
- Modify: `sidepanel/account-records-manager.js`
- Modify: `sidepanel/sidepanel.html`
- Modify: `scripts/audit-smoke-tests.mjs`

- [ ] **Step 1: Add pure view-model module**

Create `sidepanel/account-records-view-model.js` with this public factory:

```javascript
(function attachAccountRecordsViewModel(root, factory) {
  const api = factory();
  root.SidepanelAccountRecordsViewModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createAccountRecordsViewModelModule() {
  function normalizeText(value = '') {
    return String(value || '').trim();
  }

  function normalizeEmail(value = '') {
    return normalizeText(value).toLowerCase();
  }

  function buildRecordId(record = {}) {
    return normalizeText(record.id)
      || normalizeText(record.recordId)
      || normalizeEmail(record.email)
      || normalizeText(record.accountId)
      || normalizeText(record.runId);
  }

  function getRecordEmail(record = {}) {
    return normalizeEmail(record.email || record.accountEmail || record.sessionEmail);
  }

  function getRecordStatus(record = {}) {
    return normalizeText(record.status || record.result || record.state).toLowerCase();
  }

  function summarizeAccountRunHistory(records = []) {
    const summary = { total: 0, success: 0, failed: 0, running: 0, stopped: 0 };
    for (const record of Array.isArray(records) ? records : []) {
      summary.total += 1;
      const status = getRecordStatus(record);
      if (status === 'success' || status === 'completed') summary.success += 1;
      else if (status === 'failed' || status === 'error') summary.failed += 1;
      else if (status === 'running' || status === 'active') summary.running += 1;
      else if (status === 'stopped' || status === 'cancelled') summary.stopped += 1;
    }
    return summary;
  }

  function filterRecords(records = [], filterKey = 'all') {
    const list = Array.isArray(records) ? records : [];
    const normalizedFilter = normalizeText(filterKey).toLowerCase() || 'all';
    if (normalizedFilter === 'all') return list;
    if (normalizedFilter === 'success') {
      return list.filter((record) => ['success', 'completed'].includes(getRecordStatus(record)));
    }
    if (normalizedFilter === 'failed') {
      return list.filter((record) => ['failed', 'error'].includes(getRecordStatus(record)));
    }
    if (normalizedFilter === 'running') {
      return list.filter((record) => ['running', 'active'].includes(getRecordStatus(record)));
    }
    return list;
  }

  return {
    buildRecordId,
    getRecordEmail,
    getRecordStatus,
    summarizeAccountRunHistory,
    filterRecords,
  };
});
```

- [ ] **Step 2: Add unit tests**

Create `scripts/test-account-records-view-model.cjs` covering ID fallback, email normalization, history summary, and status filters:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const viewModel = require('../sidepanel/account-records-view-model.js');

test('buildRecordId falls back to normalized email', () => {
  assert.equal(viewModel.buildRecordId({ email: 'User@Test.com' }), 'user@test.com');
});

test('summarizeAccountRunHistory counts current statuses', () => {
  assert.deepEqual(viewModel.summarizeAccountRunHistory([
    { status: 'success' },
    { status: 'completed' },
    { status: 'failed' },
    { status: 'running' },
    { status: 'stopped' },
  ]), { total: 5, success: 2, failed: 1, running: 1, stopped: 1 });
});

test('filterRecords returns matching status groups', () => {
  const records = [{ status: 'success' }, { status: 'failed' }, { status: 'running' }];
  assert.equal(viewModel.filterRecords(records, 'success').length, 1);
  assert.equal(viewModel.filterRecords(records, 'failed').length, 1);
  assert.equal(viewModel.filterRecords(records, 'running').length, 1);
  assert.equal(viewModel.filterRecords(records, 'all').length, 3);
});
```

- [ ] **Step 3: Delegate pure record helpers from the manager**

In `sidepanel/account-records-manager.js`, create:

```javascript
const accountRecordsViewModel = root.SidepanelAccountRecordsViewModel;
if (!accountRecordsViewModel) {
  throw new Error('Account records view model module is not loaded.');
}
```

Delegate `buildRecordId`, `getRecordEmail`, `summarizeAccountRunHistory`, and filtered-record decisions to this module. Keep DOM rendering, event listeners, pagination state, and modal actions inside `account-records-manager.js`.

- [ ] **Step 4: Load and audit the module**

In `sidepanel/sidepanel.html`, load the new file before `account-records-manager.js`:

```html
<script src="account-records-view-model.js"></script>
<script src="account-records-manager.js"></script>
```

Update `scripts/audit-smoke-tests.mjs` to assert:

- `sidepanel/account-records-view-model.js` exists.
- It contains `SidepanelAccountRecordsViewModel`.
- It is loaded before `account-records-manager.js`.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
node --check sidepanel/account-records-view-model.js
node --check sidepanel/account-records-manager.js
node --check scripts/audit-smoke-tests.mjs
node scripts/audit-smoke-tests.mjs
node --test scripts/test-account-records-view-model.cjs
node --test scripts/test-*.cjs
git add sidepanel/account-records-view-model.js sidepanel/account-records-manager.js sidepanel/sidepanel.html scripts/audit-smoke-tests.mjs scripts/test-account-records-view-model.cjs
git commit -m "refactor: extract account records view model"
```

---

#### Task 3: Extract Membership Redeem Progress View Logic

**Files:**
- Create: `sidepanel/membership-redeem-progress.js`
- Create: `scripts/test-membership-redeem-progress.cjs`
- Modify: `sidepanel/account-records-manager.js`
- Modify: `sidepanel/sidepanel.html`
- Modify: `scripts/audit-smoke-tests.mjs`

- [ ] **Step 1: Move progress metadata and HTML generation**

Create `sidepanel/membership-redeem-progress.js` with:

```javascript
(function attachMembershipRedeemProgress(root, factory) {
  const api = factory();
  root.SidepanelMembershipRedeemProgress = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createMembershipRedeemProgressModule() {
  function clampPercent(value = 0) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.min(100, Math.round(numeric)));
  }

  function getProgressMeta(row = {}) {
    const status = String(row.redeemStatus || row.status || '').trim().toLowerCase();
    if (status === 'submitted' || status === 'pending') return { active: true, percent: 50, label: '兑换中' };
    if (status === 'paid' || status === 'success') return { active: false, percent: 100, label: '已完成' };
    if (status === 'failed') return { active: false, percent: 100, label: '失败' };
    return { active: false, percent: 0, label: '' };
  }

  function renderProgress(row = {}) {
    const meta = getProgressMeta(row);
    if (!meta.label) return '';
    const percent = clampPercent(meta.percent);
    return `<div class="redeem-progress" data-active="${meta.active ? '1' : '0'}"><span class="redeem-progress-bar" style="width:${percent}%"></span><span class="redeem-progress-label">${meta.label}</span></div>`;
  }

  return { clampPercent, getProgressMeta, renderProgress };
});
```

- [ ] **Step 2: Add unit tests**

Create `scripts/test-membership-redeem-progress.cjs`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const progress = require('../sidepanel/membership-redeem-progress.js');

test('clampPercent keeps progress between 0 and 100', () => {
  assert.equal(progress.clampPercent(-1), 0);
  assert.equal(progress.clampPercent(48.4), 48);
  assert.equal(progress.clampPercent(101), 100);
});

test('submitted rows render active progress', () => {
  const html = progress.renderProgress({ redeemStatus: 'submitted' });
  assert.match(html, /data-active="1"/);
  assert.match(html, /兑换中/);
});

test('unknown rows render no progress html', () => {
  assert.equal(progress.renderProgress({ status: 'free' }), '');
});
```

- [ ] **Step 3: Delegate progress rendering from account records manager**

Replace local progress helpers in `sidepanel/account-records-manager.js` with calls to `root.SidepanelMembershipRedeemProgress`. Keep row layout and click handlers inside the manager.

- [ ] **Step 4: Load and audit the module**

Load before `account-records-manager.js`:

```html
<script src="membership-redeem-progress.js"></script>
<script src="account-records-manager.js"></script>
```

Add smoke checks for file existence, global namespace, and script order.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
node --check sidepanel/membership-redeem-progress.js
node --check sidepanel/account-records-manager.js
node --check scripts/audit-smoke-tests.mjs
node scripts/audit-smoke-tests.mjs
node --test scripts/test-membership-redeem-progress.cjs
node --test scripts/test-*.cjs
git add sidepanel/membership-redeem-progress.js sidepanel/account-records-manager.js sidepanel/sidepanel.html scripts/audit-smoke-tests.mjs scripts/test-membership-redeem-progress.cjs
git commit -m "refactor: extract membership redeem progress view"
```

---

#### Task 4: Extract Background Membership Result State

**Files:**
- Create: `background/membership/result-state.js`
- Create: `scripts/test-membership-result-state.cjs`
- Modify: `background/upi-credential-membership-checker.js`
- Modify: `background.js`
- Modify: `scripts/audit-smoke-tests.mjs`

- [ ] **Step 1: Extract pure result normalization**

Create `background/membership/result-state.js` and move pure helpers for:

- `normalizeRedeemPlusDeletedEmailsByChannel`
- `addRedeemPlusDeletedEmailsByChannel`
- `buildRedeemDeletionStatePatch`
- `mergeRedeemDeletionStateForSave`
- `normalizeResultItem`
- `dedupeResultItemsByEmail`
- `normalizeResultsPayload`
- `buildResultExportRows`

The module must attach:

```javascript
root.MultiPageMembershipResultState = {
  normalizeRedeemPlusDeletedEmailsByChannel,
  addRedeemPlusDeletedEmailsByChannel,
  buildRedeemDeletionStatePatch,
  mergeRedeemDeletionStateForSave,
  normalizeResultItem,
  dedupeResultItemsByEmail,
  normalizeResultsPayload,
  buildResultExportRows,
};
```

- [ ] **Step 2: Add result-state tests**

Create `scripts/test-membership-result-state.cjs` with tests for:

- deleted UPI Plus tombstones do not hide IDEAL Plus.
- duplicate emails keep the newest updated result.
- Free export rows preserve password, 2FA/Passkey marker, URL, AT, and timestamp.
- `normalizeResultsPayload` preserves `redeemPlusDeletedEmailsByChannel`.

- [ ] **Step 3: Delegate from checker**

In `background/upi-credential-membership-checker.js`, replace local pure implementations with:

```javascript
function getMembershipResultStateHelpers() {
  const helpers = root.MultiPageMembershipResultState;
  if (!helpers || typeof helpers.normalizeResultsPayload !== 'function') {
    throw new Error('Membership result state module is not loaded.');
  }
  return helpers;
}
```

Keep the existing exported checker API unchanged.

- [ ] **Step 4: Load and audit the module**

Ensure `background.js` imports `background/membership/result-state.js` before `background/membership/results-store.js` and before `background/upi-credential-membership-checker.js`.

Update `scripts/audit-smoke-tests.mjs` to assert the new import order.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
node --check background/membership/result-state.js
node --check background/upi-credential-membership-checker.js
node --check background.js
node --check scripts/audit-smoke-tests.mjs
node scripts/audit-smoke-tests.mjs
node --test scripts/test-membership-result-state.cjs
node --test scripts/test-*.cjs
git add background/membership/result-state.js background/upi-credential-membership-checker.js background.js scripts/audit-smoke-tests.mjs scripts/test-membership-result-state.cjs
git commit -m "refactor: extract membership result state helpers"
```

---

#### Task 5: Extract Background Login And AT Supplement Executor

**Files:**
- Create: `background/membership/login-session-executor.js`
- Create: `scripts/test-login-session-executor.cjs`
- Modify: `background/upi-credential-membership-checker.js`
- Modify: `background.js`
- Modify: `scripts/audit-smoke-tests.mjs`

- [ ] **Step 1: Move login-session side-effect functions behind one factory**

Create `background/membership/login-session-executor.js` exposing:

```javascript
root.MultiPageMembershipLoginSessionExecutor = {
  createMembershipLoginSessionExecutor,
};
```

The factory receives dependencies explicitly:

```javascript
function createMembershipLoginSessionExecutor({
  addLog,
  chromeApi,
  fetchImpl,
  clearOpenAiCookies,
  ensureContentScriptReadyOnTabUntilStopped,
  fetchVerificationCodeOnly,
  registerTab,
  reuseOrCreateTab,
  sendTabMessageUntilStopped,
  sleepWithStop,
  throwIfStopped,
}) {
  return {
    getLoginEmailCodeForCredential,
    openFreshLoginTab,
    loginAndReadAccessToken,
    loginUpiCredentialMembershipAccount,
  };
}
```

Move browser-login and AT-reading functions from `background/upi-credential-membership-checker.js` into this executor. Keep checker orchestration responsible for choosing which credential to process.

- [ ] **Step 2: Add pure login helper tests**

Create `scripts/test-login-session-executor.cjs` for pure helpers exported by the module:

- `buildLoginFailureReason(snapshot, fallback)`
- `hasLoginVerificationChallenge(snapshot)`
- `isEmailVerificationChallenge(snapshot)`
- `isTotpVerificationChallenge(snapshot)`

Use representative snapshots with Hindi/English labels only as strings; do not require a browser.

- [ ] **Step 3: Wire checker to the executor**

Inside `createUpiCredentialMembershipChecker`, instantiate:

```javascript
const loginSessionExecutor = root.MultiPageMembershipLoginSessionExecutor.createMembershipLoginSessionExecutor({
  addLog,
  chromeApi,
  fetchImpl,
  clearOpenAiCookies,
  ensureContentScriptReadyOnTabUntilStopped,
  fetchVerificationCodeOnly,
  registerTab,
  reuseOrCreateTab,
  sendTabMessageUntilStopped,
  sleepWithStop,
  throwIfStopped,
});
```

Delegate `loginAndReadAccessToken` and `loginUpiCredentialMembershipAccount` calls to `loginSessionExecutor`.

- [ ] **Step 4: Load and audit the module**

Ensure `background.js` imports `background/membership/login-session-executor.js` before `background/upi-credential-membership-checker.js`.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
node --check background/membership/login-session-executor.js
node --check background/upi-credential-membership-checker.js
node --check background.js
node --check scripts/audit-smoke-tests.mjs
node scripts/audit-smoke-tests.mjs
node --test scripts/test-login-session-executor.cjs
node --test scripts/test-*.cjs
git add background/membership/login-session-executor.js background/upi-credential-membership-checker.js background.js scripts/audit-smoke-tests.mjs scripts/test-login-session-executor.cjs
git commit -m "refactor: extract membership login session executor"
```

---

#### Task 6: Extract Auth Page Detectors From Content Script

**Files:**
- Create: `content/auth-page-detectors.js`
- Create: `scripts/test-auth-page-detectors.cjs`
- Modify: `content/signup-page.js`
- Modify: `manifest.json` or background injection file list if content scripts are injected manually
- Modify: `scripts/audit-smoke-tests.mjs`

- [ ] **Step 1: Move text and URL detectors**

Create `content/auth-page-detectors.js` exposing:

```javascript
root.MultiPageAuthPageDetectors = {
  normalizePageText,
  isSignupEntryText,
  isLoginEntryText,
  isContinueText,
  isResendEmailText,
  isPasswordPageText,
  isAboutYouUrl,
  isChatGptHomeUrl,
};
```

Move localized matching tables for English, Chinese, Japanese, and Hindi into this file. Keep DOM clicks and form filling in `content/signup-page.js`.

- [ ] **Step 2: Add detector tests**

Create `scripts/test-auth-page-detectors.cjs`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const detectors = require('../content/auth-page-detectors.js');

test('recognizes Hindi login and continue labels', () => {
  assert.equal(detectors.isLoginEntryText('लॉग इन करें'), true);
  assert.equal(detectors.isContinueText('जारी रखें'), true);
});

test('does not treat Hindi plans pricing as signup', () => {
  assert.equal(detectors.isSignupEntryText('प्लान्स और प्राइसिंग देखें'), false);
});

test('recognizes resend email labels', () => {
  assert.equal(detectors.isResendEmailText('Resend email'), true);
  assert.equal(detectors.isResendEmailText('ईमेल दोबारा भेजें'), true);
});
```

- [ ] **Step 3: Delegate from signup-page**

In `content/signup-page.js`, replace local text detector implementations with `root.MultiPageAuthPageDetectors`. Keep public message handlers and DOM operations in `signup-page.js`.

- [ ] **Step 4: Update injection order**

If content scripts are injected through a file list, ensure `content/auth-page-detectors.js` is injected before `content/signup-page.js`.

Update `scripts/audit-smoke-tests.mjs` to assert the file is present in the injection list before `signup-page.js`.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
node --check content/auth-page-detectors.js
node --check content/signup-page.js
node --check scripts/audit-smoke-tests.mjs
node scripts/audit-smoke-tests.mjs
node --test scripts/test-auth-page-detectors.cjs
node --test scripts/test-*.cjs
git add content/auth-page-detectors.js content/signup-page.js manifest.json background.js scripts/audit-smoke-tests.mjs scripts/test-auth-page-detectors.cjs
git commit -m "refactor: extract auth page text detectors"
```

---

#### Task 7: Re-run Size Audit And Set Next Thresholds

**Files:**
- Modify: `scripts/audit-smoke-tests.mjs`
- Modify: `docs/superpowers/plans/2026-07-07-codebase-decomposition-next-steps.md`

**Execution Results:**

| File | Current Lines | Guard |
| --- | ---: | ---: |
| `content/signup-page.js` | 6,855 | 7,000 |
| `background/upi-credential-membership-checker.js` | 6,529 | 6,700 |
| `sidepanel/account-records-manager.js` | 5,438 | 5,600 |

The two largest files, `background.js` and `sidepanel/sidepanel.js`, remain above the global smoke warning threshold and should be handled in later focused passes.

- [x] **Step 1: Measure tracked source sizes**

Run:

```powershell
Get-ChildItem -File -Recurse -Include *.js,*.mjs,*.cjs |
  Where-Object { $_.FullName -notmatch '\\.git\\|node_modules|\\.codegraph\\|\\.codex-backups\\' } |
  ForEach-Object {
    $lines = (Get-Content -LiteralPath $_.FullName | Measure-Object -Line).Lines
    [PSCustomObject]@{ Lines = $lines; Path = $_.FullName.Substring((Get-Location).Path.Length + 1) }
  } |
  Sort-Object Lines -Descending |
  Select-Object -First 20 |
  Format-Table -AutoSize
```

- [x] **Step 2: Tighten smoke warning targets only when achieved**

If `sidepanel/account-records-manager.js`, `background/upi-credential-membership-checker.js`, or `content/signup-page.js` drop below a meaningful boundary, add warnings in `scripts/audit-smoke-tests.mjs` to prevent those files from growing back above that boundary.

Applied achieved thresholds:

```javascript
assertFileLineCountAtMost('content/signup-page.js', 7000, 'signup content script growth guard');
assertFileLineCountAtMost('background/upi-credential-membership-checker.js', 6700, 'membership checker growth guard');
assertFileLineCountAtMost('sidepanel/account-records-manager.js', 5600, 'account records manager growth guard');
```

- [x] **Step 3: Run the full verification set**

Run:

```powershell
node scripts/audit-smoke-tests.mjs
node scripts/audit-no-phone-sms.mjs
node scripts/audit-no-removed-network.mjs
node --test scripts/test-*.cjs
```

Expected: all commands exit `0`.

- [x] **Step 4: Commit the audit boundary**

Run:

Committed as `test: tighten decomposition size guards`.

---

### Manual Smoke Checklist After The Full Pass

- Load the unpacked extension locally.
- Open sidepanel and confirm the main workflow still shows 7 steps.
- Import one Free TXT with full 2FA format.
- Import one Free TXT with no-2FA format.
- Import one Free TXT with Passkey marker format.
- Confirm Free rows show the same status/counts as before.
- Run one manual eligibility check from the email pool.
- Run one `一键补充 AT` on a row with valid material.
- Confirm UPI/IDEAL buttons still show counts.
- Export Free and verify the row delimiter remains `---`.
- Confirm logs no longer show missing-module errors.

### Self-Review

- Spec coverage: This plan addresses the biggest remaining files by extracting sidepanel record logic, background membership state, background login/AT side effects, and content-page detectors.
- Placeholder scan: No task relies on unspecified files or unnamed helpers.
- Type consistency: All new modules use the existing project pattern of a global namespace plus CommonJS export for tests.

---

<a id="2026-07-07-codebase-decomposition-phase-eight-plan"></a>

<!-- archived-from: docs/superpowers/plans/2026-07-07-codebase-decomposition-phase-eight-plan.md -->

## Codebase Decomposition Phase Eight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continue shrinking `sidepanel/sidepanel.js` by extracting pure settings/state normalization helpers into focused sidepanel modules.

**Architecture:** Keep `sidepanel.js` as the composition root and move low-risk pure functions behind browser globals that also export through CommonJS for Node tests. New modules load before `sidepanel.js` in `sidepanel/sidepanel.html`.

**Tech Stack:** Chrome Manifest V3, plain JavaScript, browser globals, Node `node:test`.

### Global Constraints

- Do not change product behavior, version numbers, packaging, or publishing.
- Prefer pure extraction plus focused regression tests.
- Keep script load order explicit in `sidepanel/sidepanel.html`.
- Run syntax checks and smoke audits before committing.

---

#### Task 1: Extract ChatGPT Session Reader Settings

**Files:**
- Create: `sidepanel/chatgpt-session-reader-settings.js`
- Create: `scripts/test-sidepanel-chatgpt-session-reader-settings.cjs`
- Modify: `sidepanel/sidepanel.js`
- Modify: `sidepanel/sidepanel.html`

**Interfaces:**
- Produces: `SidepanelChatgptSessionReaderSettings.createChatgptSessionReaderSettings(context)`
- Consumes: `autoRunNormalizers` and URL/string normalizers supplied by `sidepanel.js`.

- [ ] Move default profile, profile normalization, profile map normalization, legacy patch, and UI state normalization into the new module.
- [ ] Add tests for legacy fallback, JP profile inheritance, URL/key/proxy cleanup, and legacy patch generation.
- [ ] Wire `sidepanel.js` to call the new module API.

#### Task 2: Extract RemovedPaymentWorker Settings

**Files:**
- Create or extend: `sidepanel/chatgpt-session-reader-settings.js`
- Create or extend test: `scripts/test-sidepanel-chatgpt-session-reader-settings.cjs`
- Modify: `sidepanel/sidepanel.js`

**Interfaces:**
- Produces: `buildDefaultRemovedPaymentWorkerSettings`, `normalizeRemovedPaymentWorkerSettingsValue`, and the small field normalizers.

- [ ] Move RemovedPaymentWorker defaults and normalization helpers into the same settings module.
- [ ] Keep DOM input synchronization in `sidepanel.js`.
- [ ] Add tests for API base URL cleanup, backend fallback, legacy proxy/profile migration, and attempt bounds.

#### Task 3: Extract UPI Info Helper State

**Files:**
- Create: `sidepanel/upi-info-helper-state.js`
- Create: `scripts/test-sidepanel-upi-info-helper-state.cjs`
- Modify: `sidepanel/sidepanel.js`
- Modify: `sidepanel/sidepanel.html`

**Interfaces:**
- Produces: `SidepanelUpiInfoHelperState.createUpiInfoHelperState(context)`
- Consumes: optional `LegacyPayUtils.normalizeUpiInfoRemainingUses`.

- [ ] Move auto-mode permission parsing and payload recursion into the new module.
- [ ] Move pure remaining-use / OTP channel / SMS field parsing only if dependencies stay local and testable.
- [ ] Add tests for boolean/string/number permission values and nested payloads.

#### Task 4: Guards, Verification, Commit

**Files:**
- Modify: `scripts/audit-smoke-tests.mjs`
- Run checks.

- [ ] Add new modules to core file checks and load-order assertions.
- [ ] Lower `sidepanel/sidepanel.js` growth guard after measuring the new line count.
- [ ] Run:
  - `node --check sidepanel/sidepanel.js`
  - `node --check sidepanel/chatgpt-session-reader-settings.js`
  - `node --check sidepanel/upi-info-helper-state.js`
  - `node scripts/audit-smoke-tests.mjs`
  - `node scripts/audit-no-phone-sms.mjs`
  - `node scripts/audit-no-removed-network.mjs`
  - `node --test scripts/test-*.cjs`
  - `node scripts/module-size-report.mjs`
- [ ] Commit the completed extraction.

---

<a id="2026-07-07-codebase-decomposition-phase-five-plan"></a>

<!-- archived-from: docs/superpowers/plans/2026-07-07-codebase-decomposition-phase-five-plan.md -->

## Codebase Decomposition Phase Five Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continue reducing `sidepanel/sidepanel.js` by extracting workflow status-bar text and tone rules into a focused, tested module.

**Architecture:** Keep DOM mutation in `sidepanel.js`; move pure status-display decisions into `sidepanel/workflow-status-display.js`. The module exposes `window.SidepanelWorkflowStatusDisplay` for browser use and CommonJS exports for tests.

**Tech Stack:** Plain JavaScript, side panel DOM scripts, CommonJS `node:test`, `node --check`, existing smoke audit.

---

### Current State

| File | Lines | Note |
| --- | ---: | --- |
| `background.js` | 15,901 | Still the largest file; leave for a later background-focused pass. |
| `sidepanel/sidepanel.js` | 10,659 | Still mixes workflow status display, settings/event wiring, and top-level message handling. |
| `sidepanel/workflow-button-state.js` | 137 | Pure workflow button state rules from Phase 4. |

### Execution Results

| Task | Result |
| --- | --- |
| Workflow status display | Extracted status-bar text and tone decisions into `sidepanel/workflow-status-display.js`. |

### File Structure For This Phase

- `sidepanel/workflow-status-display.js`: pure workflow status-bar display decisions.
- `scripts/test-sidepanel-workflow-status-display.cjs`: unit tests for countdown, paused/locked, running/failed/stopped, completed, and ready states.
- `sidepanel/sidepanel.html`: loads the new module before `sidepanel.js`.
- `sidepanel/sidepanel.js`: delegates `updateStatusDisplay()` decision logic to the new module and keeps DOM mutation local.
- `scripts/audit-smoke-tests.mjs`: guards new file presence, global name, factory name, and sidepanel script order.

### Non-Goals

- Do not change workflow behavior, registration logic, trial eligibility, UPI/IDEAL redemption, Passkey/2FA behavior, Free/Plus grouping, export formats, or release behavior.
- Do not move status-bar DOM mutation into the pure status-display module.

---

#### Task 1: Extract Sidepanel Workflow Status Display Rules

**Files:**
- Create: `sidepanel/workflow-status-display.js`
- Create: `scripts/test-sidepanel-workflow-status-display.cjs`
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/sidepanel.js`
- Modify: `scripts/audit-smoke-tests.mjs`

- [x] **Step 1: Add a pure status display module**

Create `sidepanel/workflow-status-display.js` with `createWorkflowStatusDisplayManager()`. It returns `getStatusDisplayState()` and accepts helper functions `isDoneStatus` and `formatCountdown`.

- [x] **Step 2: Add unit tests**

Create `scripts/test-sidepanel-workflow-status-display.cjs` covering:

- active countdown shows remaining time and scheduled/running tone.
- paused auto-run displays paused text.
- locked auto-run displays running nodes or retry text.
- running/failed/stopped node statuses take the expected tone.
- all completed displays completed tone.
- no progress displays `就绪` with empty tone.

- [x] **Step 3: Wire sidepanel loading and wrapper**

Load `workflow-status-display.js` after `workflow-button-state.js` and before `sidepanel.js`. In `sidepanel.js`, create `workflowStatusDisplayManager` and delegate `updateStatusDisplay()` display decision to it.

- [x] **Step 4: Add smoke checks**

Update `scripts/audit-smoke-tests.mjs` to require the new file, assert the `SidepanelWorkflowStatusDisplay` global and `createWorkflowStatusDisplayManager` factory, and check script order before `sidepanel.js`.

- [x] **Step 5: Verify**

Run:

```powershell
node --check sidepanel/workflow-status-display.js
node --check sidepanel/sidepanel.js
node --check scripts/audit-smoke-tests.mjs
node scripts/audit-smoke-tests.mjs
node --test scripts/test-sidepanel-workflow-status-display.cjs
node --test scripts/test-*.cjs
```

Expected: all commands exit `0`; smoke warnings may remain only for existing large tracked files.

---

<a id="2026-07-07-codebase-decomposition-phase-four-plan"></a>

<!-- archived-from: docs/superpowers/plans/2026-07-07-codebase-decomposition-phase-four-plan.md -->

## Codebase Decomposition Phase Four Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continue reducing `sidepanel/sidepanel.js` by extracting workflow button enablement rules into a focused, tested module.

**Architecture:** Keep the Chrome MV3 no-bundler architecture. The new sidepanel file exposes `window.SidepanelWorkflowButtonState` and is loaded before `sidepanel.js`. `sidepanel.js` keeps DOM wiring and compatibility function names while delegating pure state decisions to the new module.

**Tech Stack:** Plain JavaScript, side panel DOM scripts, CommonJS `node:test`, `node --check`, existing smoke audit.

---

### Current State

| File | Lines | Note |
| --- | ---: | --- |
| `background.js` | 15,901 | Still the largest file; leave for a later background-focused pass. |
| `sidepanel/sidepanel.js` | 10,659 | Still mixes workflow UI rules, settings/event wiring, and top-level message handling. |
| `sidepanel/workflow-state-view.js` | 129 | Renders workflow rows and status icons only. |

### Execution Results

| Task | Result |
| --- | --- |
| Workflow button state | Extracted manual execute, skip, reset, and active-control decision rules into `sidepanel/workflow-button-state.js`. |

### File Structure For This Phase

- `sidepanel/workflow-button-state.js`: pure workflow button enablement and visibility decisions.
- `scripts/test-sidepanel-workflow-button-state.cjs`: unit tests for manual execute, skip, reset, and active control rules.
- `sidepanel/sidepanel.html`: loads the new module before `sidepanel.js`.
- `sidepanel/sidepanel.js`: delegates existing button state calculations to the new module while keeping DOM updates local.
- `scripts/audit-smoke-tests.mjs`: guards new file presence, global name, factory name, and sidepanel script order.

### Non-Goals

- Do not change workflow behavior, registration logic, trial eligibility, UPI/IDEAL redemption, Passkey/2FA behavior, Free/Plus grouping, export formats, or release behavior.
- Do not move DOM querying into the pure button state module.

---

#### Task 1: Extract Sidepanel Workflow Button State Rules

**Files:**
- Create: `sidepanel/workflow-button-state.js`
- Create: `scripts/test-sidepanel-workflow-button-state.cjs`
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/sidepanel.js`
- Modify: `scripts/audit-smoke-tests.mjs`

- [x] **Step 1: Add a pure workflow button state module**

Create `sidepanel/workflow-button-state.js` with a `createWorkflowButtonStateManager()` factory. The manager accepts `nodeIds`, `independentExecuteNodes`, `skippableNodes`, and `isDoneStatus`, and returns `arePreviousNodesReadyForManualExecute()`, `canExecuteNodeWithoutPreviousNode()`, `getStepButtonState()`, `getManualSkipButtonState()`, `isResetDisabled()`, and `isActiveControlEnabled()`.

- [x] **Step 2: Add unit tests**

Create `scripts/test-sidepanel-workflow-button-state.cjs` covering:

- First node can run when idle.
- Later nodes require previous nodes done.
- Independent nodes can run only when previous nodes are ready.
- Running or scheduled auto-run disables step buttons.
- Skip button is visible only for skippable, unfinished nodes whose previous node is done.
- Reset is disabled when running/scheduled/paused/locked.

- [x] **Step 3: Wire sidepanel loading and wrappers**

Load `workflow-button-state.js` after `workflow-state-view.js` and before `sidepanel.js`. In `sidepanel.js`, create `workflowButtonStateManager` and delegate the existing `arePreviousNodesReadyForManualExecute()`, `canExecuteNodeWithoutPreviousNode()`, and `updateButtonStates()` calculations to it.

- [x] **Step 4: Add smoke checks**

Update `scripts/audit-smoke-tests.mjs` to require the new file, assert the `SidepanelWorkflowButtonState` global and `createWorkflowButtonStateManager` factory, and check script order before `sidepanel.js`.

- [x] **Step 5: Verify**

Run:

```powershell
node --check sidepanel/workflow-button-state.js
node --check sidepanel/sidepanel.js
node --check scripts/audit-smoke-tests.mjs
node scripts/audit-smoke-tests.mjs
node --test scripts/test-sidepanel-workflow-button-state.cjs
node --test scripts/test-*.cjs
```

Expected: all commands exit `0`; smoke warnings may remain only for existing large tracked files.

---

<a id="2026-07-07-codebase-decomposition-phase-six-plan"></a>

<!-- archived-from: docs/superpowers/plans/2026-07-07-codebase-decomposition-phase-six-plan.md -->

## Codebase Decomposition Phase Six Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continue reducing `background.js` and `sidepanel/sidepanel.js` by moving remaining bootstrap, listener, and UI binding glue into focused tested modules.

**Architecture:** Keep the extension's current no-bundler MV3 pattern. Extract modules as IIFE globals with CommonJS exports for tests, keep behavior in the same load order, and leave high-risk registration, eligibility, Free/Plus, UPI/IDEAL, 2FA, Passkey, AT supplement, and export logic unchanged.

**Tech Stack:** Plain JavaScript, Chrome Manifest V3 service worker, side panel DOM scripts, CommonJS `node:test`, `node --check`, existing smoke and removal audits.

### Global Constraints

- Do not change user-visible workflow behavior, CDK redeem behavior, account grouping, import/export formats, email-pool status rules, or GitHub release metadata.
- Do not bump version, tag, package, push, or publish during this decomposition pass.
- Use CodeGraph before modifying source files because this repo has `.codegraph/`.
- Preserve script order in `background.js`, `manifest.json`, and `sidepanel/sidepanel.html`.
- Every new browser module must expose one explicit namespace and CommonJS exports for tests.
- Commit after each completed task.
- If an existing user change appears, preserve it and work around it; do not revert unrelated edits.

---

### Current Baseline

Measured with `node scripts/module-size-report.mjs` on 2026-07-07:

| File | Lines | Current role |
| --- | ---: | --- |
| `background.js` | 15,904 | Service worker composition root, constants, executor wiring, runtime listeners, tab helpers. |
| `sidepanel/sidepanel.js` | 10,620 | Side panel composition root, config menu, settings/event binding, workflow action binding. |
| `content/signup-page.js` | 6,855 | Already under the current 7,000-line guard after detector/page splits. |
| `background/upi-credential-membership-checker.js` | 6,529 | Already under the current 6,700-line guard after membership state/login splits. |
| `sidepanel/account-records-manager.js` | 5,438 | Already under the current 5,600-line guard after view-model/progress splits. |

Already-split modules to reuse, not duplicate:

- `sidepanel/workflow-button-state.js`
- `sidepanel/workflow-status-display.js`
- `sidepanel/auto-run-state.js`
- `sidepanel/settings-state-manager.js`
- `sidepanel/settings-transfer-manager.js`
- `sidepanel/cdk-pool-manager.js`
- `sidepanel/account-records-view-model.js`
- `sidepanel/membership-redeem-progress.js`
- `background/bootstrap/auto-run-status.js`
- `background/membership/result-state.js`
- `background/membership/login-session-executor.js`
- `content/auth-page-detectors.js`

### Execution Results

Implemented on branch `codex/codebase-decomposition-phase-six`.

| Task | Commit(s) | Result |
| --- | --- | --- |
| Task 1 | `8d0e3a7` | Extracted `background/bootstrap/content-script-registry.js`. |
| Task 2 | `d657b6b`, `0ff9665` | Extracted `background/bootstrap/signup-executor-registry.js` and removed an accidental out-of-scope UPI dependency during review. |
| Task 3 | `665b417` | Extracted `background/bootstrap/runtime-listeners.js`. |
| Task 4 | `f11703b`, `c40f536` | Extracted `sidepanel/config-menu-controller.js` and added async callback error handling during review. |
| Task 5 | `3a21b43` | Extracted `sidepanel/workflow-action-bindings.js`. |
| Task 6 | `aa1829a` | Extracted `sidepanel/settings-field-bindings.js`. |

Final tracked source size snapshot:

| File | Baseline lines | Final lines | Note |
| --- | ---: | ---: | --- |
| `background.js` | 15,904 | 15,693 | Reduced by moving content script, executor, and listener glue out. |
| `sidepanel/sidepanel.js` | 10,620 | 10,628 | Remained stable while moving config/action/settings binding glue out and adding small integration calls. |
| `background/bootstrap/content-script-registry.js` | 0 | 49 | New focused module. |
| `background/bootstrap/signup-executor-registry.js` | 0 | 437 | New focused module. |
| `background/bootstrap/runtime-listeners.js` | 0 | 35 | New focused module. |
| `sidepanel/config-menu-controller.js` | 0 | 118 | New focused module. |
| `sidepanel/workflow-action-bindings.js` | 0 | 29 | New focused module. |
| `sidepanel/settings-field-bindings.js` | 0 | 28 | New focused module. |

### Target File Structure

- `background/bootstrap/content-script-registry.js`: owns signup/auth content-script file order and normalization.
- `background/bootstrap/signup-executor-registry.js`: owns construction of panel bridge, signup helpers, verification helpers, and step executors.
- `background/bootstrap/runtime-listeners.js`: owns service-worker event listener registration.
- `sidepanel/config-menu-controller.js`: owns config-menu open/close state and config import/export button binding.
- `sidepanel/workflow-action-bindings.js`: owns top-level workflow action button and step-list event binding.
- `sidepanel/settings-field-bindings.js`: owns repeatable settings input/change/blur binding helpers.

### Preflight

- [ ] **Step 1: Confirm branch and workspace**

Run:

```powershell
git status --short --branch
```

Expected: branch is the current decomposition branch and output has no unrelated modified files. If files are modified, inspect before editing.

- [ ] **Step 2: Capture baseline**

Run:

```powershell
node scripts/module-size-report.mjs
node scripts/audit-smoke-tests.mjs
node scripts/audit-no-phone-sms.mjs
node scripts/audit-no-removed-network.mjs
node --test scripts/test-*.cjs
```

Expected: all commands exit `0`. Existing large-file warnings may remain for `background.js` and `sidepanel/sidepanel.js`.

---

#### Task 1: Extract Background Content Script Registry

**Files:**
- Create: `background/bootstrap/content-script-registry.js`
- Create: `scripts/test-content-script-registry.cjs`
- Modify: `background.js`
- Modify: `scripts/audit-smoke-tests.mjs`

**Interfaces:**
- Produces: `self.MultiPageBackgroundContentScriptRegistry`
- Produces: `createContentScriptRegistry()`
- Produces: `normalizeInjectFileList(files = [])`
- Produces: `getSignupEntryUrl()`
- Produces: `getSignupAuthEntryUrl()`
- Produces: `getSignupPageInjectFiles()`
- Consumes: no project globals

- [ ] **Step 1: Write the test**

Create `scripts/test-content-script-registry.cjs`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const registryModule = require('../background/bootstrap/content-script-registry.js');

test('signup content scripts keep auth detectors before signup-page', () => {
  const registry = registryModule.createContentScriptRegistry();
  const files = registry.getSignupPageInjectFiles();
  assert.equal(files[0], 'content/utils.js');
  assert.ok(files.includes('content/auth-page-detectors.js'));
  assert.ok(files.includes('content/signup-page.js'));
  assert.ok(files.indexOf('content/auth-page-detectors.js') < files.indexOf('content/signup-page.js'));
  assert.equal(new Set(files).size, files.length);
});

test('normalizes duplicate and blank inject files', () => {
  assert.deepEqual(
    registryModule.normalizeInjectFileList([' a.js ', '', 'a.js', 'b.js']),
    ['a.js', 'b.js'],
  );
});

test('entry URLs remain stable', () => {
  const registry = registryModule.createContentScriptRegistry();
  assert.equal(registry.getSignupEntryUrl(), 'https://chatgpt.com/');
  assert.equal(registry.getSignupAuthEntryUrl(), 'https://chatgpt.com/auth/login');
});
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
node --test scripts/test-content-script-registry.cjs
```

Expected: FAIL because `background/bootstrap/content-script-registry.js` does not exist.

- [ ] **Step 3: Add the registry module**

Create `background/bootstrap/content-script-registry.js`:

```javascript
(function attachContentScriptRegistry(root, factory) {
  const api = factory();
  root.MultiPageBackgroundContentScriptRegistry = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createContentScriptRegistryModule() {
  const SIGNUP_ENTRY_URL = 'https://chatgpt.com/';
  const SIGNUP_AUTH_ENTRY_URL = 'https://chatgpt.com/auth/login';
  const SIGNUP_PAGE_INJECT_FILES = Object.freeze([
    'content/utils.js',
    'content/operation-delay.js',
    'content/auth-page-recovery.js',
    'content/auth-page-detectors.js',
    'content/signup-dom-utils.js',
    'content/signup-entry-page.js',
    'content/signup-verification-page.js',
    'content/signup-password-page.js',
    'content/signup-profile-page.js',
    'content/signup-session-page.js',
    'content/signup-page-detector.js',
    'content/signup-page-orchestrator.js',
    'content/signup-page.js',
  ]);

  function normalizeInjectFileList(files = []) {
    const seen = new Set();
    const result = [];
    for (const value of Array.isArray(files) ? files : []) {
      const file = String(value || '').trim();
      if (!file || seen.has(file)) continue;
      seen.add(file);
      result.push(file);
    }
    return result;
  }

  function createContentScriptRegistry() {
    return {
      getSignupEntryUrl: () => SIGNUP_ENTRY_URL,
      getSignupAuthEntryUrl: () => SIGNUP_AUTH_ENTRY_URL,
      getSignupPageInjectFiles: () => normalizeInjectFileList(SIGNUP_PAGE_INJECT_FILES),
    };
  }

  return {
    createContentScriptRegistry,
    normalizeInjectFileList,
  };
});
```

- [ ] **Step 4: Wire `background.js`**

In `background.js`, add `background/bootstrap/content-script-registry.js` after `background/bootstrap/auto-run-status.js` in `importScripts(...)`.

Replace local `SIGNUP_ENTRY_URL`, `SIGNUP_AUTH_ENTRY_URL`, and `SIGNUP_PAGE_INJECT_FILES` declarations with:

```javascript
const contentScriptRegistry = self.MultiPageBackgroundContentScriptRegistry.createContentScriptRegistry();
const SIGNUP_ENTRY_URL = contentScriptRegistry.getSignupEntryUrl();
const SIGNUP_AUTH_ENTRY_URL = contentScriptRegistry.getSignupAuthEntryUrl();
const SIGNUP_PAGE_INJECT_FILES = contentScriptRegistry.getSignupPageInjectFiles();
```

- [ ] **Step 5: Add smoke checks**

In `scripts/audit-smoke-tests.mjs`, assert:

```javascript
readText('background/bootstrap/content-script-registry.js');
assertIncludes(background, 'background/bootstrap/content-script-registry.js', 'content script registry import');
assertIncludes(background, 'MultiPageBackgroundContentScriptRegistry.createContentScriptRegistry()', 'content script registry wiring');
```

- [ ] **Step 6: Verify and commit**

Run:

```powershell
node --check background/bootstrap/content-script-registry.js
node --check background.js
node --check scripts/audit-smoke-tests.mjs
node scripts/audit-smoke-tests.mjs
node --test scripts/test-content-script-registry.cjs
node --test scripts/test-*.cjs
git add background/bootstrap/content-script-registry.js background.js scripts/audit-smoke-tests.mjs scripts/test-content-script-registry.cjs
git commit -m "refactor: extract background content script registry"
```

---

#### Task 2: Extract Background Signup Executor Registry

**Files:**
- Create: `background/bootstrap/signup-executor-registry.js`
- Create: `scripts/test-signup-executor-registry.cjs`
- Modify: `background.js`
- Modify: `scripts/audit-smoke-tests.mjs`

**Interfaces:**
- Produces: `self.MultiPageBackgroundSignupExecutorRegistry`
- Produces: `createSignupExecutorRegistry(deps)`
- Produces: returned object with `panelBridge`, `signupFlowHelpers`, `verificationFlowHelpers`, `executors`
- Consumes: current factory globals from `self.MultiPageBackgroundStep1` through `self.MultiPageBackgroundUpiRedeem`

- [ ] **Step 1: Add factory characterization test**

Create `scripts/test-signup-executor-registry.cjs`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const moduleApi = require('../background/bootstrap/signup-executor-registry.js');

function createFactory(name, calls) {
  return {
    [`create${name}`]: (deps) => {
      calls.push({ name, deps });
      return { name, deps };
    },
  };
}

test('creates core signup helpers and step executors with shared inject list', () => {
  const calls = [];
  const root = {
    MultiPageBackgroundPanelBridge: { createPanelBridge: (deps) => { calls.push({ name: 'PanelBridge', deps }); return { name: 'PanelBridge' }; } },
    MultiPageSignupFlowHelpers: { createSignupFlowHelpers: (deps) => { calls.push({ name: 'SignupFlowHelpers', deps }); return { ensureSignupPostIdentityPageReadyInTab: () => {} }; } },
    MultiPageOpenAiMailRules: { createOpenAiMailRules: (deps) => { calls.push({ name: 'OpenAiMailRules', deps }); return { name: 'OpenAiMailRules' }; } },
    MultiPageBackgroundMailRuleRegistry: { createMailRuleRegistry: (deps) => { calls.push({ name: 'MailRuleRegistry', deps }); return { buildVerificationPollPayload: () => ({}) }; } },
    MultiPageBackgroundVerificationFlow: { createVerificationFlowHelpers: (deps) => { calls.push({ name: 'VerificationFlowHelpers', deps }); return { confirmCustomVerificationStepBypass: () => {}, resolveCustomEmailVerificationStep: () => {}, resolveVerificationStep: () => {} }; } },
    MultiPageBackgroundStep1: { createStep1Executor: (deps) => { calls.push({ name: 'Step1', deps }); return { nodeId: 'open-chatgpt' }; } },
    MultiPageBackgroundStep2: { createStep2Executor: (deps) => { calls.push({ name: 'Step2', deps }); return { nodeId: 'submit-signup-email' }; } },
  };

  const registry = moduleApi.createSignupExecutorRegistry({
    root,
    SIGNUP_PAGE_INJECT_FILES: ['content/utils.js', 'content/signup-page.js'],
    SIGNUP_ENTRY_URL: 'https://chatgpt.com/',
    SIGNUP_AUTH_ENTRY_URL: 'https://chatgpt.com/auth/login',
    addLog: () => {},
  });

  assert.equal(registry.executors.step1.nodeId, 'open-chatgpt');
  assert.equal(registry.executors.step2.nodeId, 'submit-signup-email');
  assert.deepEqual(calls.find((call) => call.name === 'Step2').deps.SIGNUP_PAGE_INJECT_FILES, ['content/utils.js', 'content/signup-page.js']);
});
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
node --test scripts/test-signup-executor-registry.cjs
```

Expected: FAIL because the registry module does not exist.

- [ ] **Step 3: Create the registry shell**

Create `background/bootstrap/signup-executor-registry.js`:

```javascript
(function attachSignupExecutorRegistry(root, factory) {
  const api = factory();
  root.MultiPageBackgroundSignupExecutorRegistry = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createSignupExecutorRegistryModule() {
  function requireFactory(root, namespace, factoryName) {
    const factory = root?.[namespace]?.[factoryName];
    if (typeof factory !== 'function') {
      throw new Error(`${namespace}.${factoryName} is not available.`);
    }
    return factory;
  }

  function createSignupExecutorRegistry(deps = {}) {
    const root = deps.root || (typeof self !== 'undefined' ? self : globalThis);
    const panelBridge = root.MultiPageBackgroundPanelBridge?.createPanelBridge?.(deps) || null;
    const signupFlowHelpers = root.MultiPageSignupFlowHelpers?.createSignupFlowHelpers?.(deps) || {};
    const openAiMailRules = root.MultiPageOpenAiMailRules?.createOpenAiMailRules?.(deps) || null;
    const mailRuleRegistry = root.MultiPageBackgroundMailRuleRegistry?.createMailRuleRegistry?.({
      ...deps,
      flowBuilders: { openai: openAiMailRules },
    }) || null;
    const verificationFlowHelpers = root.MultiPageBackgroundVerificationFlow?.createVerificationFlowHelpers?.({
      ...deps,
      buildVerificationPollPayload: mailRuleRegistry?.buildVerificationPollPayload,
    }) || {};
    const executors = {
      step1: root.MultiPageBackgroundStep1?.createStep1Executor?.(deps) || null,
      step2: root.MultiPageBackgroundStep2?.createStep2Executor?.({
        ...deps,
        ensureSignupPostIdentityPageReadyInTab: signupFlowHelpers.ensureSignupPostIdentityPageReadyInTab,
      }) || null,
    };
    return { panelBridge, signupFlowHelpers, openAiMailRules, mailRuleRegistry, verificationFlowHelpers, executors };
  }

  return {
    createSignupExecutorRegistry,
    requireFactory,
  };
});
```

- [ ] **Step 4: Move executor construction incrementally**

Move the existing helper and executor construction block from `background.js` into `createSignupExecutorRegistry(deps)` in small slices:

1. `panelBridge`
2. `signupFlowHelpers`
3. `openAiMailRules`
4. `mailRuleRegistry`
5. `verificationFlowHelpers`
6. step executors already constructed near the `Signup / OAuth Helpers` block

In `background.js`, leave local destructuring only:

```javascript
const signupExecutorRegistry = self.MultiPageBackgroundSignupExecutorRegistry.createSignupExecutorRegistry({
  root: self,
  chrome,
  addLog,
  SIGNUP_ENTRY_URL,
  SIGNUP_AUTH_ENTRY_URL,
  SIGNUP_PAGE_INJECT_FILES,
  buildGeneratedAliasEmail,
  buildHotmailLocalEndpoint,
  closeConflictingTabsForSource,
  completeNodeFromBackground,
  createAutomationTab,
  ensureContentScriptReadyOnTab,
  ensureContentScriptReadyOnTabUntilStopped,
  ensureHotmailAccountForFlow,
  ensureIcloudMailSessionForVerification,
  ensureLuckmailPurchaseForFlow,
  ensureMail2925AccountForFlow,
  fetchGeneratedEmail,
  generatePassword,
  generateRandomBirthday,
  generateRandomName,
  getMailConfig,
  getPanelMode,
  getState,
  getTabId,
  isGeneratedAliasProvider,
  isHotmailProvider,
  isLuckmailProvider,
  isRetryableContentScriptTransportError,
  isReusableGeneratedAliasEmail,
  isSignupEmailVerificationPageUrl,
  isSignupPasswordPageUrl,
  isTabAlive,
  persistRegistrationEmailState,
  resolveSignupEmailForFlow,
  reuseOrCreateTab,
  sendToContentScript,
  sendToContentScriptResilient,
  sendToMailContentScriptResilient,
  setEmailState,
  setNodeStatus,
  setPasswordState,
  setState,
  shouldUseCustomRegistrationEmail,
  sleepWithStop,
  throwIfStopped,
  waitForTabStableComplete,
  waitForTabUrlMatch,
});
const {
  panelBridge,
  signupFlowHelpers,
  verificationFlowHelpers,
  executors: {
    step1: step1Executor,
    step2: step2Executor,
    step3: step3Executor,
    step4: step4Executor,
    step5: step5Executor,
    step6: step6Executor,
    step7: step7Executor,
    step8: step8Executor,
    step9: step9Executor,
    enableTotpMfa: enableTotpMfaExecutor,
    enablePasskey: enablePasskeyExecutor,
    no2faFree: no2faFreeRouteExecutor,
    upiRedeem: upiRedeemExecutor,
  },
} = signupExecutorRegistry;
```

Do not rename executor variables used later by `background.js`.

- [ ] **Step 5: Add smoke checks**

Update `scripts/audit-smoke-tests.mjs` to assert:

```javascript
readText('background/bootstrap/signup-executor-registry.js');
assertIncludes(background, 'background/bootstrap/signup-executor-registry.js', 'signup executor registry import');
assertIncludes(background, 'MultiPageBackgroundSignupExecutorRegistry.createSignupExecutorRegistry', 'signup executor registry wiring');
```

- [ ] **Step 6: Verify and commit**

Run:

```powershell
node --check background/bootstrap/signup-executor-registry.js
node --check background.js
node --check scripts/audit-smoke-tests.mjs
node scripts/audit-smoke-tests.mjs
node --test scripts/test-signup-executor-registry.cjs
node --test scripts/test-*.cjs
git add background/bootstrap/signup-executor-registry.js background.js scripts/audit-smoke-tests.mjs scripts/test-signup-executor-registry.cjs
git commit -m "refactor: extract signup executor registry"
```

---

#### Task 3: Extract Service Worker Runtime Listener Registrar

**Files:**
- Create: `background/bootstrap/runtime-listeners.js`
- Create: `scripts/test-background-runtime-listeners.cjs`
- Modify: `background.js`
- Modify: `scripts/audit-smoke-tests.mjs`

**Interfaces:**
- Produces: `self.MultiPageBackgroundRuntimeListeners`
- Produces: `createRuntimeListenerRegistrar(deps)`
- Consumes: `chromeApi`, `handleMessage`, `handleAlarm`, `handleTabUpdated`, `handleStartup`, `handleInstalled`, `handleError`

- [ ] **Step 1: Add listener registrar tests**

Create `scripts/test-background-runtime-listeners.cjs`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const moduleApi = require('../background/bootstrap/runtime-listeners.js');

function createEventSink() {
  const listeners = [];
  return { listeners, addListener: (listener) => listeners.push(listener) };
}

test('registers runtime, alarm, tab, startup, and installed listeners', () => {
  const events = {
    onMessage: createEventSink(),
    onAlarm: createEventSink(),
    onUpdated: createEventSink(),
    onStartup: createEventSink(),
    onInstalled: createEventSink(),
  };
  const chromeApi = {
    runtime: { onMessage: events.onMessage, onStartup: events.onStartup, onInstalled: events.onInstalled },
    alarms: { onAlarm: events.onAlarm },
    tabs: { onUpdated: events.onUpdated },
  };
  const registrar = moduleApi.createRuntimeListenerRegistrar({
    chromeApi,
    handleMessage: () => true,
    handleAlarm: () => {},
    handleTabUpdated: () => {},
    handleStartup: () => {},
    handleInstalled: () => {},
  });

  registrar.registerRuntimeListeners();

  assert.equal(events.onMessage.listeners.length, 1);
  assert.equal(events.onAlarm.listeners.length, 1);
  assert.equal(events.onUpdated.listeners.length, 1);
  assert.equal(events.onStartup.listeners.length, 1);
  assert.equal(events.onInstalled.listeners.length, 1);
});
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
node --test scripts/test-background-runtime-listeners.cjs
```

Expected: FAIL because `background/bootstrap/runtime-listeners.js` does not exist.

- [ ] **Step 3: Add registrar module**

Create `background/bootstrap/runtime-listeners.js`:

```javascript
(function attachRuntimeListeners(root, factory) {
  const api = factory();
  root.MultiPageBackgroundRuntimeListeners = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis, function createRuntimeListenersModule() {
  function createRuntimeListenerRegistrar({
    chromeApi,
    handleMessage,
    handleAlarm,
    handleTabUpdated,
    handleStartup,
    handleInstalled,
    handleError = () => {},
  } = {}) {
    function registerRuntimeListeners() {
      chromeApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
        try {
          return handleMessage(message, sender, sendResponse);
        } catch (error) {
          handleError('runtime.onMessage', error);
          throw error;
        }
      });
      chromeApi.alarms.onAlarm.addListener((alarm) => handleAlarm(alarm));
      chromeApi.tabs.onUpdated.addListener((tabId, changeInfo, tab) => handleTabUpdated(tabId, changeInfo, tab));
      chromeApi.runtime.onStartup.addListener(() => handleStartup());
      chromeApi.runtime.onInstalled.addListener((details) => handleInstalled(details));
    }

    return { registerRuntimeListeners };
  }

  return { createRuntimeListenerRegistrar };
});
```

- [ ] **Step 4: Wire `background.js`**

Add `background/bootstrap/runtime-listeners.js` after `background/bootstrap/content-script-registry.js` in `importScripts(...)`.

Replace the bottom `chrome.runtime.onMessage`, `chrome.alarms.onAlarm`, `chrome.tabs.onUpdated`, `chrome.runtime.onStartup`, and `chrome.runtime.onInstalled` listener registration with:

```javascript
const runtimeListenerRegistrar = self.MultiPageBackgroundRuntimeListeners.createRuntimeListenerRegistrar({
  chromeApi: chrome,
  handleMessage: (message, sender, sendResponse) => handleRuntimeMessage(message, sender, sendResponse),
  handleAlarm: (alarm) => handleAutoRunTimerAlarm(alarm),
  handleTabUpdated: (tabId, changeInfo, tab) => handleTrackedTabUpdated(tabId, changeInfo, tab),
  handleStartup: () => handleServiceWorkerStartup(),
  handleInstalled: (details) => handleExtensionInstalled(details),
  handleError: handleBackgroundStartupError,
});
runtimeListenerRegistrar.registerRuntimeListeners();
```

The dependency names in this snippet are the registrar contract. If the current bottom block contains inline logic, first wrap that logic in local functions named `handleRuntimeMessage`, `handleAutoRunTimerAlarm`, `handleTrackedTabUpdated`, `handleServiceWorkerStartup`, and `handleExtensionInstalled`, then pass those functions to the registrar.

- [ ] **Step 5: Add smoke checks**

Update `scripts/audit-smoke-tests.mjs`:

```javascript
readText('background/bootstrap/runtime-listeners.js');
assertIncludes(background, 'MultiPageBackgroundRuntimeListeners.createRuntimeListenerRegistrar', 'runtime listener registrar wiring');
```

- [ ] **Step 6: Verify and commit**

Run:

```powershell
node --check background/bootstrap/runtime-listeners.js
node --check background.js
node --check scripts/audit-smoke-tests.mjs
node scripts/audit-smoke-tests.mjs
node --test scripts/test-background-runtime-listeners.cjs
node --test scripts/test-*.cjs
git add background/bootstrap/runtime-listeners.js background.js scripts/audit-smoke-tests.mjs scripts/test-background-runtime-listeners.cjs
git commit -m "refactor: extract background runtime listener registrar"
```

---

#### Task 4: Extract Sidepanel Config Menu Controller

**Files:**
- Create: `sidepanel/config-menu-controller.js`
- Create: `scripts/test-sidepanel-config-menu-controller.cjs`
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/sidepanel.js`
- Modify: `scripts/audit-smoke-tests.mjs`

**Interfaces:**
- Produces: `window.SidepanelConfigMenuController`
- Produces: `createConfigMenuController(deps)`
- Consumes: config DOM nodes, `exportSettings`, `importSettingsFromFile`, `showToast`, `scheduleSettingsSave`

- [ ] **Step 1: Add controller tests**

Create `scripts/test-sidepanel-config-menu-controller.cjs`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const moduleApi = require('../sidepanel/config-menu-controller.js');

function fakeButton() {
  const listeners = {};
  return {
    classList: { values: new Set(), toggle(name, enabled) { enabled ? this.values.add(name) : this.values.delete(name); } },
    addEventListener(type, listener) { listeners[type] = listener; },
    click() { listeners.click?.({ preventDefault() {}, stopPropagation() {} }); },
    listeners,
  };
}

test('config menu toggles open state and calls update callback', () => {
  const button = fakeButton();
  const menu = fakeButton();
  let updated = 0;
  const controller = moduleApi.createConfigMenuController({
    dom: { btnConfigMenu: button, configMenu: menu },
    onUpdate: () => { updated += 1; },
  });
  controller.bind();
  button.click();
  assert.equal(controller.isOpen(), true);
  assert.equal(updated, 1);
});
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
node --test scripts/test-sidepanel-config-menu-controller.cjs
```

Expected: FAIL because the controller module does not exist.

- [ ] **Step 3: Create the controller module**

Create `sidepanel/config-menu-controller.js`:

```javascript
(function attachConfigMenuController(root, factory) {
  const api = factory();
  root.SidepanelConfigMenuController = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function createConfigMenuControllerModule() {
  function createConfigMenuController({
    dom = {},
    exportSettings = async () => {},
    importSettingsFromFile = async () => {},
    onUpdate = () => {},
  } = {}) {
    let open = false;

    function setOpen(nextOpen) {
      open = nextOpen === true;
      dom.configMenu?.classList?.toggle?.('open', open);
      dom.btnConfigMenu?.classList?.toggle?.('active', open);
      onUpdate(open);
    }

    function bind() {
      dom.btnConfigMenu?.addEventListener?.('click', (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        setOpen(!open);
      });
      dom.btnExportSettings?.addEventListener?.('click', async (event) => {
        event?.preventDefault?.();
        await exportSettings();
        setOpen(false);
      });
      dom.inputImportSettingsFile?.addEventListener?.('change', async () => {
        await importSettingsFromFile(dom.inputImportSettingsFile?.files?.[0] || null);
      });
    }

    return {
      bind,
      close: () => setOpen(false),
      isOpen: () => open,
      setOpen,
    };
  }

  return { createConfigMenuController };
});
```

- [ ] **Step 4: Wire sidepanel**

Load `config-menu-controller.js` before `sidepanel.js` in `sidepanel/sidepanel.html`.

In `sidepanel/sidepanel.js`, replace `configMenuOpen`, `updateConfigMenuControls()`, and `bindConfigMenuEvents()` implementation with a controller instance:

```javascript
const configMenuController = window.SidepanelConfigMenuController.createConfigMenuController({
  dom: { btnConfigMenu, configMenu, btnExportSettings, btnImportSettings, inputImportSettingsFile },
  exportSettings,
  importSettingsFromFile,
  onUpdate: () => updateSaveButtonState(),
});
```

Keep existing helper function names as thin wrappers if other code calls them:

```javascript
function updateConfigMenuControls() {
  configMenuController.setOpen(configMenuController.isOpen());
}

function bindConfigMenuEvents() {
  configMenuController.bind();
}
```

- [ ] **Step 5: Verify and commit**

Run:

```powershell
node --check sidepanel/config-menu-controller.js
node --check sidepanel/sidepanel.js
node --check scripts/audit-smoke-tests.mjs
node scripts/audit-smoke-tests.mjs
node --test scripts/test-sidepanel-config-menu-controller.cjs
node --test scripts/test-*.cjs
git add sidepanel/config-menu-controller.js sidepanel/sidepanel.html sidepanel/sidepanel.js scripts/audit-smoke-tests.mjs scripts/test-sidepanel-config-menu-controller.cjs
git commit -m "refactor: extract sidepanel config menu controller"
```

---

#### Task 5: Extract Sidepanel Workflow Action Bindings

**Files:**
- Create: `sidepanel/workflow-action-bindings.js`
- Create: `scripts/test-sidepanel-workflow-action-bindings.cjs`
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/sidepanel.js`
- Modify: `scripts/audit-smoke-tests.mjs`

**Interfaces:**
- Produces: `window.SidepanelWorkflowActionBindings`
- Produces: `createWorkflowActionBindings(deps)`
- Consumes: top-level workflow DOM nodes and action callbacks

- [ ] **Step 1: Add action binding tests**

Create `scripts/test-sidepanel-workflow-action-bindings.cjs`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const moduleApi = require('../sidepanel/workflow-action-bindings.js');

function fakeElement() {
  const listeners = {};
  return {
    addEventListener(type, listener) { listeners[type] = listener; },
    click() { return listeners.click?.({ preventDefault() {} }); },
    listeners,
  };
}

test('binds auto run and stop buttons to callbacks', async () => {
  const btnAutoRun = fakeElement();
  const btnStop = fakeElement();
  const calls = [];
  const bindings = moduleApi.createWorkflowActionBindings({
    dom: { btnAutoRun, btnStop },
    actions: {
      startAutoRun: async () => calls.push('start'),
      stopCurrentRun: async () => calls.push('stop'),
    },
  });
  bindings.bind();
  await btnAutoRun.click();
  await btnStop.click();
  assert.deepEqual(calls, ['start', 'stop']);
});
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
node --test scripts/test-sidepanel-workflow-action-bindings.cjs
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Create action binding module**

Create `sidepanel/workflow-action-bindings.js`:

```javascript
(function attachWorkflowActionBindings(root, factory) {
  const api = factory();
  root.SidepanelWorkflowActionBindings = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function createWorkflowActionBindingsModule() {
  function bindClick(element, callback) {
    element?.addEventListener?.('click', async (event) => {
      event?.preventDefault?.();
      await callback(event);
    });
  }

  function createWorkflowActionBindings({ dom = {}, actions = {} } = {}) {
    function bind() {
      bindClick(dom.btnAutoRun, actions.startAutoRun || (async () => {}));
      bindClick(dom.btnAutoContinue, actions.autoContinue || (async () => {}));
      bindClick(dom.btnAutoRunNow, actions.runScheduledNow || (async () => {}));
      bindClick(dom.btnAutoCancelSchedule, actions.cancelSchedule || (async () => {}));
      bindClick(dom.btnStop, actions.stopCurrentRun || (async () => {}));
      bindClick(dom.btnReset, actions.resetWorkflow || (async () => {}));
      bindClick(dom.btnClearLog, actions.clearLog || (async () => {}));
      dom.stepsList?.addEventListener?.('click', (event) => actions.handleStepListClick?.(event));
    }
    return { bind };
  }

  return { bindClick, createWorkflowActionBindings };
});
```

- [ ] **Step 4: Wire sidepanel**

Load `workflow-action-bindings.js` before `sidepanel.js`.

Replace the bottom workflow button listener block in `sidepanel/sidepanel.js` with:

```javascript
const workflowActionBindings = window.SidepanelWorkflowActionBindings.createWorkflowActionBindings({
  dom: { stepsList, btnAutoRun, btnAutoContinue, btnAutoRunNow, btnAutoCancelSchedule, btnStop, btnReset, btnClearLog },
  actions: {
    handleStepListClick,
    startAutoRun,
    autoContinue,
    runScheduledNow,
    cancelSchedule,
    stopCurrentRun,
    resetWorkflow,
    clearLog,
  },
});
workflowActionBindings.bind();
```

Keep existing action function bodies in `sidepanel/sidepanel.js`.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
node --check sidepanel/workflow-action-bindings.js
node --check sidepanel/sidepanel.js
node --check scripts/audit-smoke-tests.mjs
node scripts/audit-smoke-tests.mjs
node --test scripts/test-sidepanel-workflow-action-bindings.cjs
node --test scripts/test-*.cjs
git add sidepanel/workflow-action-bindings.js sidepanel/sidepanel.html sidepanel/sidepanel.js scripts/audit-smoke-tests.mjs scripts/test-sidepanel-workflow-action-bindings.cjs
git commit -m "refactor: extract workflow action bindings"
```

---

#### Task 6: Extract Sidepanel Settings Field Binding Helper

**Files:**
- Create: `sidepanel/settings-field-bindings.js`
- Create: `scripts/test-sidepanel-settings-field-bindings.cjs`
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/sidepanel.js`
- Modify: `scripts/audit-smoke-tests.mjs`

**Interfaces:**
- Produces: `window.SidepanelSettingsFieldBindings`
- Produces: `createSettingsFieldBindings({ scheduleSettingsSave })`
- Produces: `bindInput(element, options)`
- Produces: `bindChange(element, options)`
- Produces: `bindBlur(element, options)`

- [ ] **Step 1: Add helper tests**

Create `scripts/test-sidepanel-settings-field-bindings.cjs`:

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const moduleApi = require('../sidepanel/settings-field-bindings.js');

function fakeInput(value = '') {
  const listeners = {};
  return {
    value,
    addEventListener(type, listener) { listeners[type] = listener; },
    dispatch(type) { listeners[type]?.({ target: this }); },
    listeners,
  };
}

test('bindInput normalizes value and schedules save', () => {
  const input = fakeInput('  abc  ');
  const calls = [];
  const binder = moduleApi.createSettingsFieldBindings({
    scheduleSettingsSave: (patch) => calls.push(patch),
  });
  binder.bindInput(input, {
    key: 'sampleKey',
    normalize: (value) => String(value).trim(),
  });
  input.dispatch('input');
  assert.deepEqual(calls, [{ sampleKey: 'abc' }]);
});

test('bindBlur applies optional afterBlur callback', () => {
  const input = fakeInput('7');
  let afterBlurValue = '';
  const binder = moduleApi.createSettingsFieldBindings({ scheduleSettingsSave: () => {} });
  binder.bindBlur(input, {
    normalize: (value) => String(Number(value) + 1),
    afterBlur: (value) => { afterBlurValue = value; },
  });
  input.dispatch('blur');
  assert.equal(afterBlurValue, '8');
});
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
node --test scripts/test-sidepanel-settings-field-bindings.cjs
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Add helper module**

Create `sidepanel/settings-field-bindings.js`:

```javascript
(function attachSettingsFieldBindings(root, factory) {
  const api = factory();
  root.SidepanelSettingsFieldBindings = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function createSettingsFieldBindingsModule() {
  function createSettingsFieldBindings({ scheduleSettingsSave = () => {} } = {}) {
    function applyBinding(element, eventName, options = {}) {
      element?.addEventListener?.(eventName, () => {
        const rawValue = element.type === 'checkbox' ? element.checked : element.value;
        const value = typeof options.normalize === 'function' ? options.normalize(rawValue, element) : rawValue;
        if (options.key) {
          scheduleSettingsSave({ [options.key]: value });
        }
        options.afterChange?.(value, element);
        if (eventName === 'blur') options.afterBlur?.(value, element);
      });
    }

    return {
      bindInput: (element, options) => applyBinding(element, 'input', options),
      bindChange: (element, options) => applyBinding(element, 'change', options),
      bindBlur: (element, options) => applyBinding(element, 'blur', options),
    };
  }

  return { createSettingsFieldBindings };
});
```

- [ ] **Step 4: Convert only simple setting fields**

Load `settings-field-bindings.js` before `sidepanel.js`.

In `sidepanel/sidepanel.js`, instantiate:

```javascript
const settingsFieldBindings = window.SidepanelSettingsFieldBindings.createSettingsFieldBindings({
  scheduleSettingsSave,
});
```

Use it only for simple fields whose current listeners directly call `scheduleSettingsSave` with one key:

- `inputVpsUrl`
- `inputVpsPassword`
- `inputPassword`
- `inputEmailPrefix`
- `inputInbucketMailbox`
- `inputInbucketHost`
- `inputRunCount`
- `inputAutoStepDelaySeconds`

Do not convert complex handlers that call provider refresh, account pool sync, modal logic, CDK actions, Removed Payment Worker controls, or any workflow start/stop behavior.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
node --check sidepanel/settings-field-bindings.js
node --check sidepanel/sidepanel.js
node --check scripts/audit-smoke-tests.mjs
node scripts/audit-smoke-tests.mjs
node --test scripts/test-sidepanel-settings-field-bindings.cjs
node --test scripts/test-*.cjs
git add sidepanel/settings-field-bindings.js sidepanel/sidepanel.html sidepanel/sidepanel.js scripts/audit-smoke-tests.mjs scripts/test-sidepanel-settings-field-bindings.cjs
git commit -m "refactor: extract simple settings field bindings"
```

---

#### Task 7: Update Audit Boundaries And Final Verification

**Files:**
- Modify: `scripts/audit-smoke-tests.mjs`
- Modify: `docs/superpowers/plans/2026-07-07-codebase-decomposition-phase-six-plan.md`

**Interfaces:**
- Consumes: line counts achieved by Tasks 1-6
- Produces: tighter size guards for new modules and any large files that dropped meaningfully

- [ ] **Step 1: Measure final sizes**

Run:

```powershell
node scripts/module-size-report.mjs
```

Expected: `background.js` and `sidepanel/sidepanel.js` line counts are lower than the baseline at the top of this plan.

- [ ] **Step 2: Add guards for new modules**

In `scripts/audit-smoke-tests.mjs`, add:

```javascript
assertFileLineCountAtMost('background/bootstrap/content-script-registry.js', 120, 'content script registry size guard');
assertFileLineCountAtMost('background/bootstrap/signup-executor-registry.js', 900, 'signup executor registry size guard');
assertFileLineCountAtMost('background/bootstrap/runtime-listeners.js', 180, 'runtime listeners size guard');
assertFileLineCountAtMost('sidepanel/config-menu-controller.js', 220, 'config menu controller size guard');
assertFileLineCountAtMost('sidepanel/workflow-action-bindings.js', 220, 'workflow action bindings size guard');
assertFileLineCountAtMost('sidepanel/settings-field-bindings.js', 180, 'settings field bindings size guard');
```

Only lower `background.js` and `sidepanel/sidepanel.js` guards if the final line counts are safely below the new threshold.

- [ ] **Step 3: Run full verification**

Run:

```powershell
node --check background/bootstrap/content-script-registry.js
node --check background/bootstrap/signup-executor-registry.js
node --check background/bootstrap/runtime-listeners.js
node --check sidepanel/config-menu-controller.js
node --check sidepanel/workflow-action-bindings.js
node --check sidepanel/settings-field-bindings.js
node --check background.js
node --check sidepanel/sidepanel.js
node --check scripts/audit-smoke-tests.mjs
node scripts/audit-smoke-tests.mjs
node scripts/audit-no-phone-sms.mjs
node scripts/audit-no-removed-network.mjs
node --test scripts/test-*.cjs
```

Expected: all commands exit `0`.

- [ ] **Step 4: Commit audit updates**

Run:

```powershell
git add scripts/audit-smoke-tests.mjs docs/superpowers/plans/2026-07-07-codebase-decomposition-phase-six-plan.md
git commit -m "test: guard decomposition phase six modules"
```

---

### Manual Smoke Checklist

- Reload the unpacked extension from `chrome://extensions`.
- Confirm the side panel still shows the 7-step main workflow.
- Open and close the config menu; export settings; import a known settings JSON.
- Start and stop a single manual workflow step.
- Start auto run with one test account, then stop it.
- Confirm logs and progress counter still update.
- Import Free text containing full 2FA, no-2FA, and Passkey rows.
- Confirm Free buttons still show expected counts.
- Confirm UPI/IDEAL CDK pool sections still render and their buttons still respond.

### Self-Review

- Spec coverage: This plan targets the remaining large composition roots, avoids already-extracted modules, preserves behavior, and adds tests for each new boundary.
- Placeholder scan: No task contains deferred-work markers or unnamed implementation work; each module has exact names, commands, and expected outcomes.
- Type consistency: Browser namespaces and CommonJS exports match across tests, smoke checks, and wiring steps.

---

<a id="2026-07-07-complete-module-split"></a>

<!-- archived-from: docs/superpowers/plans/2026-07-07-complete-module-split.md -->

## Complete Module Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前 Chrome MV3 扩展中的大文件拆成职责清晰、可测试、可维护的小模块，同时保持现有功能和导入导出格式不变。

**Architecture:** 继续沿用当前项目的全局命名空间工厂模式，例如 `SidepanelAccountRecordsExportBuilders.create...()` 和 `MultiPage...create...()`，不引入打包器、不改 Manifest 架构。拆分顺序按“纯函数 -> 渲染 -> 运行态动作 -> 后台路由 -> 后台业务流”推进，每个任务独立测试和提交。

**Tech Stack:** Plain JavaScript, Chrome Manifest V3, Node `--check`, Node `node:test`, existing smoke audits.

### Global Constraints

- 不删除现有业务功能：注册、取码、2FA、Passkey、免 2FA Free、UPI/IDEAL、AT 补充、配置导入导出都必须保留。
- 不引入 npm 依赖、不改构建方式、不改 Manifest V3 基础结构。
- 新模块继续使用 IIFE + global namespace + optional CommonJS export。
- 每个新增 sidepanel 脚本必须加入 `sidepanel/sidepanel.html`，并在 `scripts/audit-smoke-tests.mjs` 加载顺序断言。
- 每个新增 background 模块必须加入 `background.js` 或已有 bootstrap registry，并加 smoke 断言。
- 每个任务完成后运行对应 `node --check`、相关 `node --test`、`node scripts/audit-smoke-tests.mjs`、`git diff --check`。
- 每个任务单独提交，提交信息使用 `refactor:` 前缀。
- 目标行数：普通 helper 模块不超过 250 行；复杂 controller 不超过 700 行；最终 `sidepanel/sidepanel.js` 不超过 1500 行；`sidepanel/account-records-manager.js` 不超过 900 行；`background/message-router.js` 不超过 700 行；`background/upi-credential-membership-checker.js` 不超过 1200 行；`background/steps/upi-redeem.js` 不超过 1200 行。

---

### File Structure Target

#### Sidepanel Account Records

- Create `sidepanel/account-records-credential-parser.js`
  - Owns Free/Plus text line parsing, Passkey marker parsing, timestamp/url detection, credential normalization.
- Create `sidepanel/account-records-display-model.js`
  - Owns result lookup, display row merge, row sanitization, group filtering, status metadata.
- Create `sidepanel/account-records-flow-view.js`
  - Owns membership flow steps, flow status, flow detail, flow HTML rendering.
- Create `sidepanel/account-records-renderer.js`
  - Owns account history panel rendering: header, chips, pagination, empty state, record list.
- Create `sidepanel/account-records-dom-actions.js`
  - Owns DOM click handlers, closest/dataset helpers, selection state update glue.
- Create `sidepanel/account-records-membership-actions.js`
  - Owns runtime actions for check, import, export, AT supplement, login, move group, delete.
- Create `sidepanel/account-records-redeem-actions.js`
  - Owns UPI/IDEAL redeem actions, all redeem, single redeem, cancel job, status refresh.
- Keep `sidepanel/account-records-manager.js`
  - Becomes orchestration facade only: creates submodules, exposes public methods, passes shared deps.

#### Sidepanel Main

- Create `sidepanel/app-state.js`
  - Owns sidepanel local mutable state and state patch helpers.
- Create `sidepanel/settings-controller.js`
  - Owns settings hydration, save payload construction, settings UI sync.
- Create `sidepanel/workflow-controller.js`
  - Owns workflow button state, step rendering, auto-run labels, current step actions.
- Create `sidepanel/runtime-message-controller.js`
  - Owns `chrome.runtime.onMessage` handling and message dispatch to sidepanel modules.
- Create `sidepanel/sidepanel-bootstrap.js`
  - Owns app initialization order and module construction.
- Keep `sidepanel/sidepanel.js`
  - Becomes thin compatibility entrypoint that calls `SidepanelBootstrap.createSidepanelApp(...).start()`.

#### Background Routing

- Create `background/routes/settings-routes.js`
  - Owns `SAVE_SETTING`, import/export settings, runtime state patch endpoints.
- Create `background/routes/account-record-routes.js`
  - Owns account run history and current account record messages.
- Create `background/routes/email-pool-routes.js`
  - Owns custom email pool, used marker, provider pool operations.
- Create `background/routes/passkey-routes.js`
  - Owns passkey enable/login/AT supplement route messages.
- Keep existing `background/routes/membership-routes.js`, `cdkey-routes.js`, `workflow-routes.js`.
- Keep `background/message-router.js`
  - Becomes route registry and shared response wrapper.

#### Background Membership Checker

- Create `background/membership/trial-eligibility-service.js`
  - Owns eligibility API request/response normalization and retry classification.
- Create `background/membership/membership-result-sync.js`
  - Owns result item merge, group movement, deletion tombstone rules, import/export compatibility.
- Create `background/membership/access-token-supplement-service.js`
  - Owns AT supplement by password, 2FA, Passkey, email-code fallback handling.
- Create `background/membership/free-pool-service.js`
  - Owns Free group candidate selection, no-trial marking, manual eligibility check from email pool.
- Create `background/membership/redeem-candidate-service.js`
  - Owns UPI/IDEAL candidate classification, pm-unavailable/cross-region handling, daily limit, failure counts.
- Keep `background/upi-credential-membership-checker.js`
  - Becomes membership workflow facade and public API compatibility layer.

#### Background UPI Redeem Step

- Create `background/steps/upi-redeem/session-material.js`
  - Owns session email, access token, password, 2FA/passkey/no-2FA credential material collection.
- Create `background/steps/upi-redeem/free-entry.js`
  - Owns “有试用资格才入 Free” and “无资格仅标记邮箱池” logic.
- Create `background/steps/upi-redeem/channel-submission.js`
  - Owns UPI/IDEAL CDK selection and remote submission.
- Create `background/steps/upi-redeem/status-polling.js`
  - Owns remote status refresh every 5 seconds and skip-auto-retry behavior.
- Create `background/steps/upi-redeem/finalize.js`
  - Owns result logs, used email marking, auto-run continuation decisions.
- Keep `background/steps/upi-redeem.js`
  - Becomes executor facade.

#### Verification Flow

- Create `background/verification/assurivo-time.js`
  - Owns UTC epoch parsing and Assurivo UTC+8 fallback.
- Create `background/verification/verification-keywords.js`
  - Owns English/Japanese/Hindi ChatGPT/OpenAI semantic matching keywords.
- Create `background/verification/assurivo-feed-client.js`
  - Owns feed.php/open.php fetch, JSON parsing, retryable errors.
- Create `background/verification/code-extractor.js`
  - Owns strict body-only 6-digit code extraction.
- Create `background/verification/resend-controller.js`
  - Owns resend timing, rejected-code exclusion, attempt counters.
- Keep `background/verification-flow.js`
  - Becomes public facade for step 4 and step 6.

---

### Task 1: Account Credential Parser Split

**Files:**
- Create: `sidepanel/account-records-credential-parser.js`
- Modify: `sidepanel/account-records-manager.js`
- Modify: `sidepanel/sidepanel.html`
- Modify: `scripts/audit-smoke-tests.mjs`
- Modify: `scripts/test-account-records-manager.cjs`
- Test: `scripts/test-membership-credential-format.cjs`
- Test: `scripts/test-sidepanel-membership-format-compat.cjs`

**Interfaces:**
- Produces:
  - `SidepanelAccountRecordsCredentialParser.createAccountRecordsCredentialParser(deps)`
  - `parseUpiCredentialMembershipParts(parts: string[]): object`
  - `normalizeUpiCredentialMembershipCredential(rawItem: object, fallbackSource?: string): object`
  - `parseUpiCredentialMembershipText(text: string): object[]`
  - `normalizeUpiCredentialMembershipTotpSecret(value: string): string`
  - `parseUpiCredentialMembershipPasskeyMarker(value: string): object`
- Consumes:
  - `MultiPageMembershipCredentialFormat.parseCredentialLine`
  - Current manager helpers `normalizeUpiCredentialMembershipEmail`, `normalizeUpiCredentialMembershipText`

- [ ] **Step 1: Create module skeleton**

```javascript
(function attachSidepanelAccountRecordsCredentialParser(globalScope) {
  function createAccountRecordsCredentialParser(context = {}) {
    const normalizeEmail = context.normalizeEmail || ((value = '') => String(value || '').trim().toLowerCase());
    const normalizeText = context.normalizeText || ((value = '') => String(value || '').trim());
    return {
      normalizeEmail,
      normalizeText,
    };
  }
  const api = { createAccountRecordsCredentialParser };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  globalScope.SidepanelAccountRecordsCredentialParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 2: Move parser functions from manager**

Move the functions currently named `readFirstUpiCredentialMembershipNumericMetadataValue`, `readUpiCredentialMembershipPasskeySignCount`, `readUpiCredentialMembershipPasskeyAlg`, `buildUpiCredentialMembershipPasskeyNumericMetadataPatch`, `normalizeUpiCredentialMembershipTotpSecret`, `isLikelyUpiCredentialMembershipTimestamp`, `isLikelyUpiCredentialMembershipVerificationUrl`, `isUpiCredentialMembershipPasskeyMarker`, `getUpiCredentialMembershipPasskeyCredentialId`, `parseUpiCredentialMembershipPasskeyMarker`, `getMembershipCredentialFormat`, `parseUpiCredentialMembershipParts`, `parseUpiCredentialMembershipPartsFallback`, `normalizeUpiCredentialMembershipCredential`, and `parseUpiCredentialMembershipText`.

- [ ] **Step 3: Wire manager to parser module**

In `sidepanel/account-records-manager.js`, instantiate:

```javascript
const accountRecordsCredentialParser = globalScope.SidepanelAccountRecordsCredentialParser || {};
if (typeof accountRecordsCredentialParser.createAccountRecordsCredentialParser !== 'function') {
  throw new Error('Account records credential parser module is not loaded.');
}
const {
  parseUpiCredentialMembershipText,
  normalizeUpiCredentialMembershipCredential,
  parseUpiCredentialMembershipParts,
  normalizeUpiCredentialMembershipTotpSecret,
  parseUpiCredentialMembershipPasskeyMarker,
} = accountRecordsCredentialParser.createAccountRecordsCredentialParser({
  normalizeEmail: (value) => normalizeUpiCredentialMembershipEmail(value),
  normalizeText: (value) => normalizeUpiCredentialMembershipText(value),
  getMembershipCredentialFormatHelpers,
});
```

- [ ] **Step 4: Add script and smoke contracts**

Add `<script src="account-records-credential-parser.js"></script>` before `account-records-manager.js`, and add smoke assertions for global, factory, load order, and line count.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
node --check sidepanel\account-records-credential-parser.js
node --check sidepanel\account-records-manager.js
node scripts\audit-smoke-tests.mjs
node --test scripts\test-membership-credential-format.cjs scripts\test-sidepanel-membership-format-compat.cjs scripts\test-account-records-manager.cjs
git diff --check
git add sidepanel\account-records-credential-parser.js sidepanel\account-records-manager.js sidepanel\sidepanel.html scripts\audit-smoke-tests.mjs scripts\test-account-records-manager.cjs
git commit -m "refactor: extract account records credential parser"
```

Expected: all checks pass; `account-records-manager.js` loses the credential parser block.

### Task 2: Account Display Model Split

**Files:**
- Create: `sidepanel/account-records-display-model.js`
- Modify: `sidepanel/account-records-manager.js`
- Modify: `sidepanel/sidepanel.html`
- Modify: `scripts/audit-smoke-tests.mjs`
- Test: `scripts/test-membership-results-store.cjs`
- Test: `scripts/test-sidepanel-membership-format-compat.cjs`

**Interfaces:**
- Produces:
  - `buildUpiCredentialMembershipResultLookup(items: object[]): object`
  - `sanitizeUpiCredentialMembershipDisplayRow(row: object): object`
  - `mergeUpiCredentialMembershipDisplayCredentialResult(credential: object, result: object): object`
  - `buildUpiCredentialMembershipDisplayRows(results: object): object[]`
  - `getUpiCredentialMembershipRowStatusMeta(row: object, results: object): object`
- Consumes:
  - Credential parser outputs from Task 1
  - Existing group helpers and redeem status helpers

- [ ] **Step 1: Create `SidepanelAccountRecordsDisplayModel` factory**

Use:

```javascript
(function attachSidepanelAccountRecordsDisplayModel(globalScope) {
  function createAccountRecordsDisplayModel(context = {}) {
    return {
      buildUpiCredentialMembershipResultLookup: context.buildUpiCredentialMembershipResultLookup,
    };
  }
  const api = { createAccountRecordsDisplayModel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  globalScope.SidepanelAccountRecordsDisplayModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 2: Move display row functions**

Move current manager functions `buildUpiCredentialMembershipResultLookup`, `sanitizeUpiCredentialMembershipDisplayRow`, `mergeUpiCredentialMembershipDisplayCredentialResult`, `buildUpiCredentialMembershipDisplayRows`, and `getUpiCredentialMembershipRowStatusMeta`.

- [ ] **Step 3: Keep stateful access as dependencies**

Inject `getUpiCredentialMembershipCheckResults`, `isRedeemPlusDeletedDisplayRow`, `applyUpiRedeemSuccessMembershipPatch`, `buildMembershipViewModelRows`, `buildUpiCredentialMembershipDisplayRowKey`, and `getUpiCredentialMembershipRedeemProgressMeta` into the display module.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
node --check sidepanel\account-records-display-model.js
node --check sidepanel\account-records-manager.js
node scripts\audit-smoke-tests.mjs
node --test scripts\test-membership-results-store.cjs scripts\test-sidepanel-membership-format-compat.cjs scripts\test-account-records-manager.cjs
git diff --check
git add sidepanel\account-records-display-model.js sidepanel\account-records-manager.js sidepanel\sidepanel.html scripts\audit-smoke-tests.mjs
git commit -m "refactor: extract account records display model"
```

Expected: display row behavior unchanged; group counts and deleted tombstones still pass tests.

### Task 3: Account Flow View Split

**Files:**
- Create: `sidepanel/account-records-flow-view.js`
- Modify: `sidepanel/account-records-manager.js`
- Modify: `sidepanel/sidepanel.html`
- Modify: `scripts/audit-smoke-tests.mjs`

**Interfaces:**
- Produces:
  - `getUpiCredentialMembershipFlowTitle(stepKey: string, results: object): string`
  - `getUpiCredentialMembershipFlowSteps(results: object): object[]`
  - `normalizeUpiCredentialMembershipFlowStage(value: string, results: object): string`
  - `getUpiCredentialMembershipFlowStatus(stepKey: string, results: object, rows: object[]): string`
  - `getUpiCredentialMembershipFlowDetail(results: object): string`
  - `renderUpiCredentialMembershipFlow(results: object, rows: object[]): string`

- [ ] **Step 1: Move flow helper functions**

Move current functions from `getUpiCredentialMembershipFlowTitle` through `renderUpiCredentialMembershipFlow`.

- [ ] **Step 2: Inject UI dependencies**

Inject:

```javascript
{
  escapeHtml,
  compactMembershipReason,
  getMembershipStatusTitle,
  getRedeemChannelLabel,
  getChannelFailureLimitBlockedFreeRows,
  isRedeemableFreeUpiCredentialMembershipRowForChannel
}
```

- [ ] **Step 3: Verify and commit**

Run:

```powershell
node --check sidepanel\account-records-flow-view.js
node --check sidepanel\account-records-manager.js
node scripts\audit-smoke-tests.mjs
node --test scripts\test-account-records-manager.cjs scripts\test-sidepanel-workflow-status-display.cjs
git diff --check
git add sidepanel\account-records-flow-view.js sidepanel\account-records-manager.js sidepanel\sidepanel.html scripts\audit-smoke-tests.mjs
git commit -m "refactor: extract account records flow view"
```

Expected: Free/UPI/IDEAL flow progress text stays unchanged.

### Task 4: Account Renderer Split

**Files:**
- Create: `sidepanel/account-records-renderer.js`
- Modify: `sidepanel/account-records-manager.js`
- Modify: `sidepanel/sidepanel.html`
- Modify: `scripts/audit-smoke-tests.mjs`

**Interfaces:**
- Produces:
  - `renderAccountRecordsPanel(currentState: object): void`
  - `renderUpiCredentialMembershipCheckResults(): void`
  - `updateHeader(allRecords: object[], filteredRecords: object[]): void`
  - `updateStats(allRecords: object[]): void`
  - `updatePagination(totalRecords: number): void`

- [ ] **Step 1: Move account history render functions**

Move `formatAccountRecordTime`, `getStatusMeta`, `getRecordSummaryText`, `getRecordTooltipText`, `createStatChip`, `updateHeader`, `updateStats`, `updateToolbarState`, `updatePagination`, `renderEmptyState`, `renderRecordList`, and `render`.

- [ ] **Step 2: Move membership result render entry**

Move `renderUpiCredentialMembershipCheckResults` and its direct HTML helpers into the renderer module.

- [ ] **Step 3: Keep manager state outside renderer**

The renderer receives `currentPage`, `activeFilter`, `selectionMode`, and selected ids through getter functions:

```javascript
{
  getCurrentPage: () => currentPage,
  getActiveFilter: () => activeFilter,
  getSelectionMode: () => selectionMode,
  isRecordSelected: (id) => selectedRecordIds.has(id)
}
```

- [ ] **Step 4: Verify and commit**

Run:

```powershell
node --check sidepanel\account-records-renderer.js
node --check sidepanel\account-records-manager.js
node scripts\audit-smoke-tests.mjs
node --test scripts\test-account-records-manager.cjs
git diff --check
git add sidepanel\account-records-renderer.js sidepanel\account-records-manager.js sidepanel\sidepanel.html scripts\audit-smoke-tests.mjs
git commit -m "refactor: extract account records renderer"
```

Expected: sidepanel script VM load passes; no blank panel regression.

### Task 5: Account Runtime Actions Split

**Files:**
- Create: `sidepanel/account-records-membership-actions.js`
- Create: `sidepanel/account-records-redeem-actions.js`
- Modify: `sidepanel/account-records-manager.js`
- Modify: `sidepanel/sidepanel.html`
- Modify: `scripts/audit-smoke-tests.mjs`

**Interfaces:**
- Membership actions produce:
  - `refreshUpiCredentialMembershipCheckResults(): Promise<void>`
  - `fillFreeUpiCredentialMembershipAccessTokens(): Promise<void>`
  - `identifyFreeUpiCredentialMembershipPlus(options?: object): Promise<void>`
  - `verifyPlusUpiCredentialMembershipRows(): Promise<void>`
  - `loginUpiCredentialMembershipAccount(email: string): Promise<void>`
  - `moveUpiCredentialMembershipAccountGroup(email: string, targetStatus: string): Promise<void>`
- Redeem actions produce:
  - `startUpiCredentialMembershipFreeRedeem(inputCredentials?: object[] | null, options?: object): Promise<void>`
  - `startUpiCredentialMembershipAllRedeem(): Promise<void>`
  - `startSingleUpiCredentialMembershipFreeRedeem(email: string): Promise<void>`
  - `refreshUpiCredentialMembershipRedeemStatuses(): Promise<void>`
  - `cancelUpiCredentialMembershipRedeemJob(email: string, cdkey: string, channel: string): Promise<void>`

- [ ] **Step 1: Extract membership-only runtime calls**

Move check, AT supplement, login, move group, plus verify, import-related runtime message functions to `account-records-membership-actions.js`.

- [ ] **Step 2: Extract redeem runtime calls**

Move redeem start, all redeem, single redeem, redeem status refresh, cancel job, and channel post-refresh functions to `account-records-redeem-actions.js`.

- [ ] **Step 3: Keep manager public API unchanged**

`account-records-manager.js` still returns:

```javascript
{
  bindEvents,
  clearRecords,
  closePanel,
  deleteSelectedRecords,
  exportUpiCredentialBackupTextFile,
  exportUpiRedeemSuccessEmailTextFile,
  openPanel,
  reloadUpiCredentialMembershipAfterRuntimeImport,
  render,
  reset,
  resumeFreeRedeemAfterCdkImport,
  setSelectionMode,
  showUpiCredentialBackupText,
  summarizeAccountRunHistory,
  toggleSelectionMode
}
```

- [ ] **Step 4: Verify and commit**

Run:

```powershell
node --check sidepanel\account-records-membership-actions.js
node --check sidepanel\account-records-redeem-actions.js
node --check sidepanel\account-records-manager.js
node scripts\audit-smoke-tests.mjs
node --test scripts\test-account-records-manager.cjs scripts\test-membership-view-model.cjs scripts\test-membership-redeem-progress.cjs scripts\test-redeem-cdkey-usage.cjs
git diff --check
git add sidepanel\account-records-membership-actions.js sidepanel\account-records-redeem-actions.js sidepanel\account-records-manager.js sidepanel\sidepanel.html scripts\audit-smoke-tests.mjs
git commit -m "refactor: extract account records runtime actions"
```

Expected: manager becomes facade under 900 lines after Task 5 or Task 6.

### Task 6: Sidepanel Main Bootstrap Split

**Files:**
- Create: `sidepanel/app-state.js`
- Create: `sidepanel/settings-controller.js`
- Create: `sidepanel/runtime-message-controller.js`
- Create: `sidepanel/sidepanel-bootstrap.js`
- Modify: `sidepanel/sidepanel.js`
- Modify: `sidepanel/sidepanel.html`
- Modify: `scripts/audit-smoke-tests.mjs`

**Interfaces:**
- `SidepanelAppState.createSidepanelAppState(initialState?: object)`
- `SidepanelSettingsController.createSettingsController(deps)`
- `SidepanelRuntimeMessageController.createRuntimeMessageController(deps)`
- `SidepanelBootstrap.createSidepanelApp(deps).start(): Promise<void>`

- [ ] **Step 1: Move mutable state declarations**

Move top-level sidepanel mutable state from `sidepanel.js` into `app-state.js`. Keep access through getters/setters:

```javascript
const appState = SidepanelAppState.createSidepanelAppState();
appState.getLatestState();
appState.patchLatestState({ key: value });
```

- [ ] **Step 2: Move settings hydration and save**

Move settings read/write and UI sync code into `settings-controller.js`.

- [ ] **Step 3: Move runtime message listener**

Move `chrome.runtime.onMessage` dispatch logic into `runtime-message-controller.js`.

- [ ] **Step 4: Add bootstrap facade**

`sidepanel.js` should only build dependencies and call:

```javascript
SidepanelBootstrap.createSidepanelApp({
  chromeApi: chrome,
  document,
  window,
}).start();
```

- [ ] **Step 5: Verify and commit**

Run:

```powershell
node --check sidepanel\app-state.js
node --check sidepanel\settings-controller.js
node --check sidepanel\runtime-message-controller.js
node --check sidepanel\sidepanel-bootstrap.js
node --check sidepanel\sidepanel.js
node scripts\audit-smoke-tests.mjs
node --test scripts\test-sidepanel-*.cjs scripts\test-account-records-manager.cjs
git diff --check
git add sidepanel\app-state.js sidepanel\settings-controller.js sidepanel\runtime-message-controller.js sidepanel\sidepanel-bootstrap.js sidepanel\sidepanel.js sidepanel\sidepanel.html scripts\audit-smoke-tests.mjs
git commit -m "refactor: split sidepanel bootstrap"
```

Expected: `sidepanel.js` under 1500 lines.

### Task 7: Background Message Router Split

**Files:**
- Create: `background/routes/settings-routes.js`
- Create: `background/routes/account-record-routes.js`
- Create: `background/routes/email-pool-routes.js`
- Create: `background/routes/passkey-routes.js`
- Modify: `background.js`
- Modify: `background/message-router.js`
- Modify: `scripts/audit-smoke-tests.mjs`

**Interfaces:**
- Each route module exports:

```javascript
globalThis.MultiPageBackgroundSettingsRoutes = {
  registerSettingsRoutes(router, deps) {}
};
```

- [ ] **Step 1: Create route registration contract**

Add helper in `message-router.js`:

```javascript
function registerExternalRoutes(routeModule, name) {
  if (!routeModule || typeof routeModule.register !== 'function') {
    throw new Error(`${name} route module is not loaded.`);
  }
  routeModule.register(routeRegistry, deps);
}
```

- [ ] **Step 2: Move settings routes**

Move settings save/import/export message cases from `message-router.js` to `settings-routes.js`.

- [ ] **Step 3: Move account record routes**

Move account history and account status message cases to `account-record-routes.js`.

- [ ] **Step 4: Move email pool routes**

Move custom email pool and provider pool routes to `email-pool-routes.js`.

- [ ] **Step 5: Move passkey routes**

Move passkey enable/login and passkey AT supplement routes to `passkey-routes.js`.

- [ ] **Step 6: Verify and commit**

Run:

```powershell
node --check background\message-router.js
node --check background\routes\settings-routes.js
node --check background\routes\account-record-routes.js
node --check background\routes\email-pool-routes.js
node --check background\routes\passkey-routes.js
node scripts\audit-smoke-tests.mjs
node --test scripts\test-background-runtime-listeners.cjs scripts\test-background-settings-transfer.cjs scripts\test-passkey-login-core.cjs
git diff --check
git add background.js background\message-router.js background\routes\settings-routes.js background\routes\account-record-routes.js background\routes\email-pool-routes.js background\routes\passkey-routes.js scripts\audit-smoke-tests.mjs
git commit -m "refactor: split background message routes"
```

Expected: `background/message-router.js` under 700 lines.

### Task 8: Membership Checker Service Split

**Files:**
- Create: `background/membership/trial-eligibility-service.js`
- Create: `background/membership/membership-result-sync.js`
- Create: `background/membership/access-token-supplement-service.js`
- Create: `background/membership/free-pool-service.js`
- Create: `background/membership/redeem-candidate-service.js`
- Modify: `background.js`
- Modify: `background/upi-credential-membership-checker.js`
- Modify: `scripts/audit-smoke-tests.mjs`

**Interfaces:**
- `MultiPageTrialEligibilityService.createTrialEligibilityService(deps)`
- `MultiPageMembershipResultSync.createMembershipResultSync(deps)`
- `MultiPageAccessTokenSupplementService.createAccessTokenSupplementService(deps)`
- `MultiPageFreePoolService.createFreePoolService(deps)`
- `MultiPageRedeemCandidateService.createRedeemCandidateService(deps)`

- [ ] **Step 1: Extract trial eligibility service**

Move trial eligibility API helpers and classification rules. Preserve tests in `scripts/test-trial-eligibility-api.cjs`.

- [ ] **Step 2: Extract result sync service**

Move save/merge/update/group/tombstone logic that writes `upiCredentialMembershipCheckResults`.

- [ ] **Step 3: Extract AT supplement service**

Move password/2FA/passkey/no-email-code AT supplement flow and its backend response normalization.

- [ ] **Step 4: Extract free pool service**

Move email pool manual eligibility check, used marker handling, no-trial marker handling, and “not enter Free when no trial” behavior.

- [ ] **Step 5: Extract redeem candidate service**

Move UPI/IDEAL candidate decision logic, `pm-unavailable` classification, cross-region payment blocking, daily limit, and failure count decisions.

- [ ] **Step 6: Verify and commit**

Run:

```powershell
node --check background\upi-credential-membership-checker.js
node --check background\membership\trial-eligibility-service.js
node --check background\membership\membership-result-sync.js
node --check background\membership\access-token-supplement-service.js
node --check background\membership\free-pool-service.js
node --check background\membership\redeem-candidate-service.js
node scripts\audit-smoke-tests.mjs
node --test scripts\test-trial-eligibility-api.cjs scripts\test-membership-result-state.cjs scripts\test-membership-results-store.cjs scripts\test-passkey-login-core.cjs scripts\test-redeem-channel-state.cjs
git diff --check
git add background.js background\upi-credential-membership-checker.js background\membership\trial-eligibility-service.js background\membership\membership-result-sync.js background\membership\access-token-supplement-service.js background\membership\free-pool-service.js background\membership\redeem-candidate-service.js scripts\audit-smoke-tests.mjs
git commit -m "refactor: split membership checker services"
```

Expected: `background/upi-credential-membership-checker.js` under 1200 lines.

### Task 9: UPI Redeem Executor Split

**Files:**
- Create: `background/steps/upi-redeem/session-material.js`
- Create: `background/steps/upi-redeem/free-entry.js`
- Create: `background/steps/upi-redeem/channel-submission.js`
- Create: `background/steps/upi-redeem/status-polling.js`
- Create: `background/steps/upi-redeem/finalize.js`
- Modify: `background/steps/upi-redeem.js`
- Modify: `background/bootstrap/signup-executor-registry.js`
- Modify: `scripts/audit-smoke-tests.mjs`

**Interfaces:**
- `createUpiRedeemSessionMaterial(deps)`
- `createUpiRedeemFreeEntry(deps)`
- `createUpiRedeemChannelSubmission(deps)`
- `createUpiRedeemStatusPolling(deps)`
- `createUpiRedeemFinalize(deps)`

- [ ] **Step 1: Extract session material**

Move session email, AT, password, 2FA, passkey, verification URL material extraction.

- [ ] **Step 2: Extract Free entry**

Move trial eligibility gate, “有试用资格才入 Free”, and “无资格只标记邮箱池” logic.

- [ ] **Step 3: Extract channel submission**

Move UPI/IDEAL CDK selection, backend submit payload, and channel-specific failure handling.

- [ ] **Step 4: Extract status polling**

Move submitted remote status polling, 5-second refresh, skip-auto-retry, and stop-on-user-stop rules.

- [ ] **Step 5: Extract finalize**

Move logs, custom email pool used marker, auto-run continuation, and final summary fields.

- [ ] **Step 6: Verify and commit**

Run:

```powershell
node --check background\steps\upi-redeem.js
node --check background\steps\upi-redeem\session-material.js
node --check background\steps\upi-redeem\free-entry.js
node --check background\steps\upi-redeem\channel-submission.js
node --check background\steps\upi-redeem\status-polling.js
node --check background\steps\upi-redeem\finalize.js
node scripts\audit-smoke-tests.mjs
node --test scripts\test-signup-executor-registry.cjs scripts\test-trial-eligibility-api.cjs scripts\test-upi-redeem-api-client.cjs scripts\test-redeem-cdkey-usage.cjs
git diff --check
git add background\steps\upi-redeem.js background\steps\upi-redeem\session-material.js background\steps\upi-redeem\free-entry.js background\steps\upi-redeem\channel-submission.js background\steps\upi-redeem\status-polling.js background\steps\upi-redeem\finalize.js background\bootstrap\signup-executor-registry.js scripts\audit-smoke-tests.mjs
git commit -m "refactor: split upi redeem executor"
```

Expected: `background/steps/upi-redeem.js` under 1200 lines.

### Task 10: Verification Flow Split

**Files:**
- Create: `background/verification/assurivo-time.js`
- Create: `background/verification/verification-keywords.js`
- Create: `background/verification/assurivo-feed-client.js`
- Create: `background/verification/code-extractor.js`
- Create: `background/verification/resend-controller.js`
- Modify: `background.js`
- Modify: `background/verification-flow.js`
- Modify: `background/steps/fetch-signup-code.js`
- Modify: `background/steps/set-gpt-password.js`
- Modify: `scripts/audit-smoke-tests.mjs`

**Interfaces:**
- `parseAssurivoTimestamp(value: string): number`
- `isVerificationMailText(value: string): boolean`
- `extractStrictVerificationCodeFromBody(body: string): object`
- `fetchAssurivoFeed(options: object): Promise<object[]>`
- `createVerificationResendController(deps)`

- [ ] **Step 1: Extract Assurivo time parser**

Move UTC epoch ms parsing, Assurivo UTC+8 fallback, display log formatting.

- [ ] **Step 2: Extract verification keywords**

Move ChatGPT/OpenAI semantic keyword lists for English, Japanese, Hindi.

- [ ] **Step 3: Extract code extractor**

Move strict body-only 6-digit extraction and HTML body normalization.

- [ ] **Step 4: Extract feed client**

Move feed.php/open.php fetch, JSON response handling, retryable error classification.

- [ ] **Step 5: Extract resend controller**

Move resend button timing, attempt counters, old-code exclusion, resend logs.

- [ ] **Step 6: Verify and commit**

Run:

```powershell
node --check background\verification-flow.js
node --check background\verification\assurivo-time.js
node --check background\verification\verification-keywords.js
node --check background\verification\assurivo-feed-client.js
node --check background\verification\code-extractor.js
node --check background\verification\resend-controller.js
node --check background\steps\fetch-signup-code.js
node --check background\steps\set-gpt-password.js
node scripts\audit-smoke-tests.mjs
node --test scripts\test-auth-page-detectors.cjs scripts\test-signup-executor-registry.cjs
git diff --check
git add background.js background\verification-flow.js background\verification\assurivo-time.js background\verification\verification-keywords.js background\verification\assurivo-feed-client.js background\verification\code-extractor.js background\verification\resend-controller.js background\steps\fetch-signup-code.js background\steps\set-gpt-password.js scripts\audit-smoke-tests.mjs
git commit -m "refactor: split verification flow services"
```

Expected: Hindi/English/Japanese verification behavior unchanged; `background/verification-flow.js` under 900 lines.

### Task 11: Auto Run Controller Split

**Files:**
- Create: `background/auto-run/session-runner.js`
- Create: `background/auto-run/retry-policy.js`
- Create: `background/auto-run/log-snapshot.js`
- Create: `background/auto-run/summary-builder.js`
- Modify: `background/auto-run-controller.js`
- Modify: `scripts/audit-smoke-tests.mjs`

**Interfaces:**
- `createAutoRunSessionRunner(deps)`
- `createAutoRunRetryPolicy(deps)`
- `createAutoRunLogSnapshot(deps)`
- `createAutoRunSummaryBuilder(deps)`

- [ ] **Step 1: Extract retry policy**

Move retryable failure classification, stop/continue decisions, max retry handling.

- [ ] **Step 2: Extract log snapshot**

Move per-round log snapshot preservation and previous-round log retrieval.

- [ ] **Step 3: Extract summary builder**

Move final success/failure/unfinished summary generation.

- [ ] **Step 4: Extract session runner**

Move per-round node execution loop and state transitions.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
node --check background\auto-run-controller.js
node --check background\auto-run\session-runner.js
node --check background\auto-run\retry-policy.js
node --check background\auto-run\log-snapshot.js
node --check background\auto-run\summary-builder.js
node scripts\audit-smoke-tests.mjs
node --test scripts\test-background-auto-run-status.cjs scripts\test-background-runtime-listeners.cjs
git diff --check
git add background\auto-run-controller.js background\auto-run\session-runner.js background\auto-run\retry-policy.js background\auto-run\log-snapshot.js background\auto-run\summary-builder.js scripts\audit-smoke-tests.mjs
git commit -m "refactor: split auto run controller"
```

Expected: stop request, previous round log snapshot, retry disabled behavior unchanged.

### Task 12: Final Contract Audit And Size Gates

**Files:**
- Modify: `scripts/audit-smoke-tests.mjs`
- Modify: `AGENTS.md` if module map needs updating
- Create: `docs/architecture/module-map.md`

**Interfaces:**
- Produces `docs/architecture/module-map.md` with module ownership table.

- [ ] **Step 1: Add final size gates**

Set smoke size guards:

```javascript
assertFileLineCountAtMost('sidepanel/sidepanel.js', 1500, 'sidepanel entrypoint size guard');
assertFileLineCountAtMost('sidepanel/account-records-manager.js', 900, 'account records manager facade size guard');
assertFileLineCountAtMost('background/message-router.js', 700, 'message router facade size guard');
assertFileLineCountAtMost('background/upi-credential-membership-checker.js', 1200, 'membership checker facade size guard');
assertFileLineCountAtMost('background/steps/upi-redeem.js', 1200, 'UPI redeem facade size guard');
assertFileLineCountAtMost('background/verification-flow.js', 900, 'verification flow facade size guard');
```

- [ ] **Step 2: Add module map doc**

Create `docs/architecture/module-map.md` with these sections:

```markdown
# Module Map

## Sidepanel
- sidepanel/sidepanel.js: compatibility entrypoint
- sidepanel/sidepanel-bootstrap.js: app startup and controller construction
- sidepanel/account-records-manager.js: account records facade

## Background
- background/message-router.js: route registry facade
- background/upi-credential-membership-checker.js: membership workflow facade
- background/steps/upi-redeem.js: UPI redeem executor facade
- background/verification-flow.js: verification facade
```

- [ ] **Step 3: Run final verification**

Run:

```powershell
node scripts\audit-smoke-tests.mjs
node --test scripts\test-*.cjs
git diff --check
```

Expected: all tests pass; no source file outside explicitly allowed legacy files exceeds target size.

- [ ] **Step 4: Commit final audit**

```powershell
git add scripts\audit-smoke-tests.mjs docs\architecture\module-map.md AGENTS.md
git commit -m "docs: add module map and split size gates"
```

### Execution Order

1. Task 1 Account Credential Parser Split
2. Task 2 Account Display Model Split
3. Task 3 Account Flow View Split
4. Task 4 Account Renderer Split
5. Task 5 Account Runtime Actions Split
6. Task 6 Sidepanel Main Bootstrap Split
7. Task 7 Background Message Router Split
8. Task 8 Membership Checker Service Split
9. Task 9 UPI Redeem Executor Split
10. Task 10 Verification Flow Split
11. Task 11 Auto Run Controller Split
12. Task 12 Final Contract Audit And Size Gates

### Review Gates

- Gate A after Task 5: account records UI still renders and import/export formats stay byte-compatible.
- Gate B after Task 6: sidepanel loads without blank screen; run VM sidepanel script order check.
- Gate C after Task 8: manual trial eligibility and Free/no-trial marking remain unchanged.
- Gate D after Task 9: UPI/IDEAL redemption, `pm-unavailable`, and status polling remain unchanged.
- Gate E after Task 10: step 4 and step 6 verification code retrieval still work for English/Japanese/Hindi.
- Gate F after Task 12: final module map and size guards enforce the new structure.

### Self-Review

- Spec coverage: The plan covers current large files in sidepanel, account records, router, membership checker, UPI redeem, verification flow, and auto-run.
- Placeholder scan: No task uses open-ended “implement later” language; each task lists exact files, interfaces, commands, and commit.
- Type consistency: Factory names use existing global namespace patterns and return plain objects with explicit function names.

---

<a id="2026-07-10-free-export-verification-url-toggle"></a>

<!-- archived-from: docs/superpowers/plans/2026-07-10-free-export-verification-url-toggle.md -->

## Free Export Verification URL Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent Free export button that includes or removes the email verification URL while keeping every supported TXT format importable.

**Architecture:** A new sidepanel preference module owns the persisted boolean. The UI reads and toggles that preference, the export action sends `includeVerificationUrl` to the background, and the shared credential formatter remains the only place that decides column layout. The parser gains an unambiguous three-field no-2FA branch.

**Tech Stack:** Chrome Manifest V3, plain JavaScript, browser globals, `localStorage`, Node `node:test` and `node:assert/strict`.

### Global Constraints

- The button is shown only in the Free group and defaults to enabled.
- Persist the setting under `localStorage` key `upiFreeExportIncludeVerificationUrl`.
- Only the exact stored string `false` disables the option; missing or invalid values enable it.
- The setting changes exported text only and never removes `verificationUrl` from stored records.
- Missing `includeVerificationUrl` backend parameters must preserve V1.0.10 behavior.
- Plus exports must remain unchanged.
- Do not update the extension version, create a package, or publish GitHub changes as part of implementation.

---

#### Task 1: Add The Persistent Free Export Preference

**Files:**
- Create: `sidepanel/account-records-free-export-preferences.js`
- Create: `scripts/test-account-records-free-export-preferences.cjs`
- Modify: `sidepanel/sidepanel.html`
- Modify: `sidepanel/account-records-manager.js`
- Modify: `scripts/test-account-records-manager.cjs`

**Interfaces:**
- Produces: `SidepanelAccountRecordsFreeExportPreferences.createFreeExportPreferences(options)`.
- Produces instance methods `getIncludeVerificationUrl(): boolean`, `setIncludeVerificationUrl(value): boolean`, and `toggleIncludeVerificationUrl(): boolean`.
- Consumes optional `options.storage`, defaulting to `globalScope.localStorage`.

- [ ] **Step 1: Write failing preference tests**

```javascript
test('Free export verification URL preference defaults on and persists off', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
  };
  const prefs = api.createFreeExportPreferences({ storage });
  assert.equal(prefs.getIncludeVerificationUrl(), true);
  assert.equal(prefs.setIncludeVerificationUrl(false), false);
  assert.equal(values.get('upiFreeExportIncludeVerificationUrl'), 'false');
  assert.equal(prefs.getIncludeVerificationUrl(), false);
  assert.equal(prefs.toggleIncludeVerificationUrl(), true);
});

test('Free export preference falls back on for invalid or unavailable storage', () => {
  const invalid = api.createFreeExportPreferences({ storage: { getItem: () => 'broken' } });
  assert.equal(invalid.getIncludeVerificationUrl(), true);
  const unavailable = api.createFreeExportPreferences({ storage: { getItem: () => { throw new Error('blocked'); } } });
  assert.equal(unavailable.getIncludeVerificationUrl(), true);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test scripts/test-account-records-free-export-preferences.cjs`

Expected: FAIL because `account-records-free-export-preferences.js` does not exist.

- [ ] **Step 3: Implement the focused preference module**

```javascript
(function attachFreeExportPreferences(globalScope) {
  const STORAGE_KEY = 'upiFreeExportIncludeVerificationUrl';

  function createFreeExportPreferences(options = {}) {
    const storage = options.storage || globalScope.localStorage;
    function getIncludeVerificationUrl() {
      try {
        return storage?.getItem(STORAGE_KEY) !== 'false';
      } catch {
        return true;
      }
    }
    function setIncludeVerificationUrl(value) {
      const enabled = value !== false;
      try { storage?.setItem(STORAGE_KEY, String(enabled)); } catch {}
      return enabled;
    }
    function toggleIncludeVerificationUrl() {
      return setIncludeVerificationUrl(!getIncludeVerificationUrl());
    }
    return { getIncludeVerificationUrl, setIncludeVerificationUrl, toggleIncludeVerificationUrl };
  }

  const api = { STORAGE_KEY, createFreeExportPreferences };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  globalScope.SidepanelAccountRecordsFreeExportPreferences = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

Load the new script before `account-records-manager.js`. In the manager, fail loudly if the factory is missing, create one instance, and expose its getter/toggler to later UI tasks.

- [ ] **Step 4: Run focused tests**

Run: `node --test scripts/test-account-records-free-export-preferences.cjs scripts/test-account-records-manager.cjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add sidepanel/account-records-free-export-preferences.js sidepanel/sidepanel.html sidepanel/account-records-manager.js scripts/test-account-records-free-export-preferences.cjs scripts/test-account-records-manager.cjs
git commit -m "feat: persist Free export address preference"
```

---

#### Task 2: Support URL-Free Free Credential Formats

**Files:**
- Modify: `shared/membership-credential-format.js`
- Modify: `scripts/test-membership-credential-format.cjs`
- Modify: `background/membership/result-state.js`
- Modify: `background/upi-credential-membership-checker.js`
- Modify: `scripts/test-membership-result-state.cjs`

**Interfaces:**
- Changes: `formatFreeCredentialLine(item, options = {})`, where `options.includeVerificationUrl !== false` preserves the URL.
- Changes: `buildResultExportRows(results, status, channel, emails, options = {})` and its checker wrapper.
- Adds parse support for `email---accessToken---timestamp` when the third field is a recognizable timestamp.

- [ ] **Step 1: Add failing shared formatter and parser tests**

```javascript
test('formats every Free route without verification URL when disabled', () => {
  assert.equal(format.formatFreeCredentialLine({
    email: 'no2fa@example.com', no2faFreeRoute: true,
    verificationUrl: 'https://assurivo.com/console/open.php?id=1',
    accessToken: 'at-no2fa', checkedAt: '2026-07-10 12:00:00',
  }, { includeVerificationUrl: false }), 'no2fa@example.com---at-no2fa---2026-07-10 12:00:00');
  assert.equal(format.formatFreeCredentialLine({
    email: 'twofa@example.com', password: 'pw', totpMfaSecret: 'SECRET',
    verificationUrl: 'https://assurivo.com/console/open.php?id=2',
    accessToken: 'at-2fa', checkedAt: '2026-07-10 12:00:00',
  }, { includeVerificationUrl: false }), 'twofa@example.com---pw---SECRET---at-2fa---2026-07-10 12:00:00');
});

test('parses URL-free no-2FA Free row without mistaking three-field 2FA', () => {
  const row = format.parseCredentialLine('no2fa@example.com---at-token---2026-07-10 12:00:00');
  assert.equal(row.no2faFreeRoute, true);
  assert.equal(row.accessToken, 'at-token');
  assert.equal(row.checkedAt, '2026-07-10 12:00:00');
  const legacy = format.parseCredentialLine('twofa@example.com---pw---SECRET');
  assert.equal(legacy.no2faFreeRoute, undefined);
  assert.equal(legacy.password, 'pw');
  assert.equal(legacy.totpMfaSecret, 'SECRET');
});
```

- [ ] **Step 2: Run shared tests and verify failure**

Run: `node --test scripts/test-membership-credential-format.cjs`

Expected: FAIL because the formatter ignores options and the parser treats the three-field row as password/2FA.

- [ ] **Step 3: Implement formatter and parser branches**

Add this branch before Passkey parsing:

```javascript
if (normalizedParts.length === 3 && isLikelyTimestamp(normalizedParts[2])) {
  return buildCredentialRow({
    email: normalizedParts[0],
    accessToken: normalizedParts[1],
    accessTokenUpdatedAt: normalizedParts[2],
    checkedAt: normalizedParts[2],
    no2faFreeRoute: true,
    twoFactorEnabled: false,
  }, options);
}
```

In `formatFreeCredentialLine`, derive `const includeVerificationUrl = options.includeVerificationUrl !== false`; omit the URL for all three routes when false.

Pass the same option through `buildResultExportRows`. Preserve the default by passing an empty options object from legacy callers.

- [ ] **Step 4: Add and run result-state coverage**

Extend the existing Free export test to call:

```javascript
const rows = resultState.buildResultExportRows(results, 'free', '', [], {
  includeVerificationUrl: false,
});
```

Assert URL-free 2FA and Passkey rows plus `email---AT---time` for no-2FA. Run:

`node --test scripts/test-membership-credential-format.cjs scripts/test-membership-result-state.cjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add shared/membership-credential-format.js background/membership/result-state.js background/upi-credential-membership-checker.js scripts/test-membership-credential-format.cjs scripts/test-membership-result-state.cjs
git commit -m "feat: support URL-free Free credential rows"
```

---

#### Task 3: Propagate The Export Option Through The Background

**Files:**
- Modify: `background/membership/import-export-service.js`
- Create: `scripts/test-membership-import-export-service.cjs`

**Interfaces:**
- Consumes: `input.includeVerificationUrl` from the sidepanel message.
- Calls: `buildResultExportRows(results, status, channel, allowedEmails, { includeVerificationUrl })`.
- Produces filename prefix `upi-membership-free-email-at` for all-no-2FA URL-free exports.

- [ ] **Step 1: Write failing service tests**

Build the service with dependency stubs and capture the fifth `buildResultExportRows` argument:

```javascript
function createService({ buildRows, results }) {
  return api.createImportExportService({
    buildRedeemAccountUnlockedPatch: () => ({}),
    buildResultExportRows: buildRows,
    buildTimestampedFileName: (prefix) => `${prefix}-20260710.txt`,
    deleteUpiCredentialMembershipCheckResults: async () => ({ deletedCount: 0 }),
    getActiveRedeemCdkeyUsageEmailSetFromState: () => new Set(),
    getResultItemRedeemChannel: (item) => item.redeemChannel || 'upi',
    getState: async () => ({}),
    getStoredResults: async () => results,
    isActiveUpiCredentialMembershipRedeemResultItem: () => false,
    isBatchRunning: () => false,
    isCdkeyRetryRunning: () => false,
    isLikelyVerificationUrl: (value) => /^https?:\/\//i.test(String(value || '')),
    isPasskeyExportMarker: (value) => /^PASSKEY:/i.test(String(value || '')),
    isRedeemRunning: () => false,
    isResultItemHiddenByPlusDeletion: () => false,
    isResultItemPasskeyExportableForStatus: () => false,
    normalizeEmail: (value) => String(value || '').trim().toLowerCase(),
    normalizeEmailList: (values) => values.map((value) => String(value || '').trim().toLowerCase()),
    normalizeRedeemChannel: (value) => String(value || '').trim().toLowerCase() === 'ideal' ? 'ideal' : 'upi',
    normalizeResultItem: (item) => item,
    normalizeResultsPayload: (value) => value,
    normalizeString: (value) => String(value || '').trim().toLowerCase(),
    resolveInputCredentials: () => [],
    saveResults: async (value) => value,
  });
}

test('Free export forwards disabled URL option and selects URL-free filename', async () => {
  let capturedOptions;
  const service = createService({
    buildRows(_results, _status, _channel, _emails, options) {
      capturedOptions = options;
      return ['a@example.com---at-token---2026-07-10 12:00:00'];
    },
    results: { items: [{ email: 'a@example.com', status: 'free', no2faFreeRoute: true, accessToken: 'at-token' }] },
  });
  const output = await service.exportUpiCredentialMembershipCheckResults({
    status: 'free', emails: ['a@example.com'], includeVerificationUrl: false,
  });
  assert.deepEqual(capturedOptions, { includeVerificationUrl: false });
  assert.match(output.fileName, /^upi-membership-free-email-at-/);
});
```

Add a second assertion that omitting the parameter forwards `{ includeVerificationUrl: true }` and retains `upi-membership-free-email-url-at` for four-field rows.

- [ ] **Step 2: Run the service test and verify failure**

Run: `node --test scripts/test-membership-import-export-service.cjs`

Expected: FAIL because the service currently calls `buildResultExportRows` with four arguments and recognizes only four-field no-2FA rows.

- [ ] **Step 3: Implement option normalization and filename detection**

```javascript
const includeVerificationUrl = input.includeVerificationUrl !== false;
const rows = buildResultExportRows(results, status, channel, allowedEmails, {
  includeVerificationUrl,
});
const allFreeRowsAreNo2faWithUrl = status === 'free' && rows.length > 0
  && rows.every((row) => {
    const parts = String(row || '').split(/---+/).map((part) => part.trim());
    return parts.length === 4 && isLikelyVerificationUrl(parts[1]);
  });
const allFreeRowsAreNo2faWithoutUrl = status === 'free' && rows.length > 0
  && rows.every((row) => {
    const parts = String(row || '').split(/---+/).map((part) => part.trim());
    return parts.length === 3 && !isLikelyVerificationUrl(parts[1]);
  });
```

Select `upi-membership-free-email-at` for the second case. For no-2FA export eligibility, require `verificationUrl` only when `includeVerificationUrl` is true.

- [ ] **Step 4: Run focused backend tests**

Run: `node --test scripts/test-membership-import-export-service.cjs scripts/test-membership-result-state.cjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add background/membership/import-export-service.js scripts/test-membership-import-export-service.cjs
git commit -m "feat: control Free export address columns"
```

---

#### Task 4: Add The Free Group Toggle Button And Message Payload

**Files:**
- Modify: `sidepanel/account-records-membership-results-renderer.js`
- Modify: `sidepanel/account-records-panel-events.js`
- Modify: `sidepanel/account-records-membership-result-ops.js`
- Modify: `sidepanel/account-records-manager.js`
- Create: `scripts/test-account-records-free-export-ui.cjs`

**Interfaces:**
- Renderer consumes `getFreeExportIncludeVerificationUrl(): boolean`.
- Panel events consume `toggleFreeExportIncludeVerificationUrl(): boolean`.
- Result operations consume `getFreeExportIncludeVerificationUrl(): boolean`.

- [ ] **Step 1: Write failing UI and payload tests**

Test renderer output in both states:

```javascript
function renderWithPreference(includeVerificationUrl) {
  const container = {
    innerHTML: '',
    querySelector: () => null,
  };
  const renderer = rendererApi.createAccountRecordsMembershipResultsRenderer({
    dom: { upiCredentialMembershipCheckResults: container },
    state: { getLatestState: () => ({}) },
    getUpiCredentialMembershipCheckResults: () => ({ items: [{}], completed: 1, total: 1 }),
    buildUpiCredentialMembershipDisplayRows: () => [{
      email: 'free@example.com', status: 'free', enabled: true, accessToken: 'at-token',
    }],
    getUpiCredentialMembershipUiGroup: () => 'free',
    summarizeMembershipViewModelRows: () => ({ free: 1, 'upi-plus': 0, 'ideal-plus': 0 }),
    getFreeExportIncludeVerificationUrl: () => includeVerificationUrl,
  });
  renderer.renderUpiCredentialMembershipCheckResults();
  return container.innerHTML;
}

assert.match(renderWithPreference(true), /data-upi-membership-toggle-export-verification-url[^>]*is-active/);
assert.match(renderWithPreference(true), /取件地址：开/);
assert.match(renderWithPreference(false), /取件地址：关/);
assert.doesNotMatch(renderWithPreference(false), /toggle-export-verification-url[^>]*is-active/);
```

Test panel click invokes the toggle callback, and test result operations send:

```javascript
assert.equal(message.payload.includeVerificationUrl, false);
```

for Free while the paid payload has no `includeVerificationUrl` property.

- [ ] **Step 2: Run UI tests and verify failure**

Run: `node --test scripts/test-account-records-free-export-ui.cjs`

Expected: FAIL because the button, event branch, and payload field do not exist.

- [ ] **Step 3: Render and bind the button**

Place this button immediately after `导出 Free`:

```javascript
const includeVerificationUrl = getFreeExportIncludeVerificationUrl();
const verificationUrlToggle = `<button
  class="btn btn-ghost btn-xs${includeVerificationUrl ? ' is-active' : ''}"
  type="button"
  data-upi-membership-toggle-export-verification-url
  aria-pressed="${includeVerificationUrl ? 'true' : 'false'}"
  title="控制 Free TXT 导出是否包含邮箱取件地址"
>取件地址：${includeVerificationUrl ? '开' : '关'}</button>`;
```

Handle the dataset action before the normal export branch, toggle the preference, and call `render()`.

- [ ] **Step 4: Add the conditional export payload**

```javascript
const payload = { status: payloadStatus, emails: exportEmails, removeAfterExport: false };
if (normalizedStatus === 'free') {
  payload.includeVerificationUrl = getFreeExportIncludeVerificationUrl();
}
```

Inject the same preference instance from `account-records-manager.js` into renderer, panel events, and result operations.

- [ ] **Step 5: Run focused UI tests**

Run: `node --test scripts/test-account-records-free-export-ui.cjs scripts/test-account-records-manager.cjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add sidepanel/account-records-membership-results-renderer.js sidepanel/account-records-panel-events.js sidepanel/account-records-membership-result-ops.js sidepanel/account-records-manager.js scripts/test-account-records-free-export-ui.cjs
git commit -m "feat: add Free export address toggle"
```

---

#### Task 5: Update Static Contracts And Run Full Verification

**Files:**
- Modify: `scripts/audit-smoke-tests.mjs`

**Interfaces:**
- Static audit must require the new preference script before `account-records-manager.js`.
- Static audit must verify the new global factory and the `includeVerificationUrl` export contract.

- [ ] **Step 1: Add failing audit contracts**

Add the source loading variable and these exact assertions:

```javascript
const accountRecordsFreeExportPreferences = readText('sidepanel/account-records-free-export-preferences.js');
assertIncludes(sidepanelHtml, 'src="account-records-free-export-preferences.js"', 'Free export preference script load');
assertBefore(sidepanelHtml, 'src="account-records-free-export-preferences.js"', 'src="account-records-manager.js"', 'Free export preferences must load before manager');
assertIncludes(accountRecordsFreeExportPreferences, 'createFreeExportPreferences', 'Free export preference factory');
assertIncludes(accountRecordsMembershipResultOps, 'includeVerificationUrl', 'Free export address payload');
```

- [ ] **Step 2: Run syntax and focused tests**

```powershell
node --check sidepanel/account-records-free-export-preferences.js
node --check sidepanel/account-records-membership-results-renderer.js
node --check sidepanel/account-records-panel-events.js
node --check sidepanel/account-records-membership-result-ops.js
node --check shared/membership-credential-format.js
node --check background/membership/result-state.js
node --check background/membership/import-export-service.js
node --test scripts/test-account-records-free-export-preferences.cjs scripts/test-account-records-free-export-ui.cjs scripts/test-membership-credential-format.cjs scripts/test-membership-result-state.cjs scripts/test-membership-import-export-service.cjs
```

Expected: all commands exit 0.

- [ ] **Step 3: Run the complete regression suite**

Run: `node --test scripts/test-*.cjs`

Expected: all tests pass with zero failures.

- [ ] **Step 4: Run the static audit and compare with baseline**

Run: `node scripts/audit-smoke-tests.mjs`

Expected: no new contract failures. Until the separate decomposition work changes the baseline, the command exits 1 with exactly the existing size-guard failures for `sidepanel/sidepanel-app-controller.js`, `background/steps/upi-redeem/free-entry.js`, and `background/steps/upi-redeem/channel-submission.js`.

- [ ] **Step 5: Inspect final diff and commit audit coverage**

```powershell
git diff --check
git status --short
git diff --stat HEAD~4..HEAD
git add scripts/audit-smoke-tests.mjs
git commit -m "test: cover Free export address toggle"
```

Expected: only intended source, tests, spec, and plan changes are present; no generated exports, credentials, or release artifacts are tracked.

---

<a id="2026-07-17-pix-redeem-channel"></a>

<!-- archived-from: docs/superpowers/plans/2026-07-17-pix-redeem-channel.md -->

## PIX Redeem Channel Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add an independent PIX redemption channel and change “一键兑换全部” to let the user choose exactly one CDK pool before running.

**Architecture:** Extend the shared redeem-channel registry from the current UPI/IDEAL binary to explicit upi, ideal, and pix metadata. Keep legacy pixRedeem* aliases mapped to UPI, while new PIX pool/usage state uses pixChannelRedeem*. Thread the selected channel through the existing API, membership result, status refresh, cancel/retry, and sidepanel paths. Reuse the existing Action Modal with three channel actions and disabled unavailable choices.

**Tech Stack:** Chrome Manifest V3, plain JavaScript, browser storage, existing Action Modal, Node node:test/node:assert/strict, static smoke audit.

### Global Constraints

- Preserve legacy pixRedeem* fields as UPI compatibility aliases; never reinterpret them as the new PIX pool.
- New API redemption/status/cancel/retry requests use channel: "pix".
- “一键兑换全部” executes exactly one user-selected channel; it does not auto-fallback to another channel.
- PIX ordinary failures use the existing non-UPI three-failure channel limit; existing IDEAL account-lock behavior remains unchanged.
- Use two-space indentation, existing namespace/module patterns, and apply_patch for edits.
- Every production behavior change must have a failing test observed before the implementation is added.

---

#### Task 1: Add the three-channel registry and channel-state policy

**Files:**
- Modify: shared/redeem-channel-state.js
- Modify: sidepanel/membership-row-policy.js
- Modify: sidepanel/membership-view-model.js
- Test: scripts/test-redeem-channel-state.cjs

**Interfaces:**
- Export REDEEM_CHANNELS = ['upi', 'ideal', 'pix'].
- normalizeRedeemChannel(value) returns only upi, ideal, or pix; unknown values fall back to upi.
- getRedeemChannelLabel(channel) returns UPI, IDEAL, or PIX.
- Failure and daily-limit field helpers return channel-specific fields for all three channels.
- isRedeemAccountLocked keeps the existing global lock and IDEAL legacy lock only.

- [ ] Step 1: Write the failing tests.

Add these tests:

~~~javascript
test('normalizes PIX and exposes all channel labels', () => {
  assert.equal(policy.normalizeRedeemChannel('pix'), 'pix');
  assert.equal(policy.normalizeRedeemChannel('PIX'), 'pix');
  assert.equal(policy.normalizeRedeemChannel('unknown'), 'upi');
  assert.deepEqual(policy.REDEEM_CHANNELS, ['upi', 'ideal', 'pix']);
  assert.equal(policy.getRedeemChannelLabel('pix'), 'PIX');
});

test('PIX failure and daily-limit fields stay isolated', () => {
  assert.equal(policy.getRedeemChannelFailureField('pix'), 'pixRedeemFailureCount');
  assert.equal(policy.getRedeemChannelDailyLimitBlockedUntilField('pix'), 'pixRedeemDailyLimitBlockedUntil');
  assert.equal(policy.getRedeemChannelFailureCount({ pixRedeemFailureCount: 2 }, 'pix'), 2);
  assert.equal(policy.getRedeemChannelFailureCount({ pixRedeemFailureCount: 2 }, 'upi'), 0);
});

test('PIX becomes unavailable after its channel failure limit without changing UPI state', () => {
  const item = { trialEligibilityStatus: 'eligible', pixRedeemFailureCount: 3 };
  assert.equal(policy.shouldRedeemItemUseChannel(item, 'pix'), false);
  assert.equal(policy.shouldRedeemItemUseChannel(item, 'upi'), true);
});
~~~

- [ ] Step 2: Run the focused test and verify RED.

Run: node --test scripts/test-redeem-channel-state.cjs

Expected: FAIL because pix currently normalizes to upi and the registry/label/field helpers do not exist.

- [ ] Step 3: Implement the minimal registry and policy.

Add frozen channel metadata in shared/redeem-channel-state.js:

~~~javascript
const REDEEM_CHANNELS = Object.freeze(['upi', 'ideal', 'pix']);
const REDEEM_CHANNEL_METADATA = Object.freeze({
  upi: { label: 'UPI', failureField: 'upiRedeemFailureCount', dailyLimitPrefix: 'upiRedeem' },
  ideal: { label: 'IDEAL', failureField: 'idealRedeemFailureCount', dailyLimitPrefix: 'idealRedeem' },
  pix: { label: 'PIX', failureField: 'pixRedeemFailureCount', dailyLimitPrefix: 'pixRedeem' },
});
~~~

Make existing helpers read metadata, export the registry and label helper, and update sidepanel fallbacks to recognize pix and pix-plus while preserving IDEAL locking.

- [ ] Step 4: Run the focused test and verify GREEN.

Run: node --test scripts/test-redeem-channel-state.cjs

Expected: all channel-state tests pass.

- [ ] Step 5: Commit.

~~~powershell
git add shared/redeem-channel-state.js sidepanel/membership-row-policy.js sidepanel/membership-view-model.js scripts/test-redeem-channel-state.cjs
git commit -m "feat: add PIX redeem channel policy"
~~~

#### Task 2: Add independent PIX pool/usage storage without breaking legacy aliases

**Files:**
- Modify: background/redeem/redeem-cdkey-usage.js
- Modify: background/bootstrap/settings-defaults.js
- Modify: background/bootstrap/state-patch-helpers.js
- Modify: background/upi-credential-membership-checker.js
- Modify: background.js
- Modify: sidepanel/cdk-pool-state.js
- Modify: sidepanel/account-records-cdk-pool-text.js
- Test: scripts/test-redeem-cdkey-usage.cjs
- Test: scripts/test-sidepanel-cdk-pool-state.cjs
- Test: scripts/test-background-state-patch-helpers.cjs

**Interfaces:**
- Canonical PIX keys are pixChannelRedeemCdkeyPoolText and pixChannelRedeemCdkeyUsage.
- getRedeemChannelPoolKey, getRedeemChannelUsageKey, getRedeemChannelPoolText, getRedeemChannelUsage, and buildRedeemChannelUsageUpdates support pix.
- pixRedeemCdkeyPoolText and pixRedeemCdkeyUsage remain legacy UPI aliases only.
- A PIX sidepanel patch writes only canonical PIX fields; UPI keeps its existing aliases.

- [ ] Step 1: Write the failing tests.

~~~javascript
test('PIX uses independent canonical pool and usage keys', () => {
  const pixUsage = { PIX_A: { remoteStatus: 'failed' } };
  assert.equal(usage.getRedeemChannelPoolKey('pix'), 'pixChannelRedeemCdkeyPoolText');
  assert.equal(usage.getRedeemChannelUsageKey('pix'), 'pixChannelRedeemCdkeyUsage');
  assert.equal(usage.getRedeemChannelPoolText({ pixChannelRedeemCdkeyPoolText: 'PIX_A' }, 'pix'), 'PIX_A');
  assert.deepEqual(usage.getRedeemChannelUsage({ pixChannelRedeemCdkeyUsage: pixUsage }, 'pix'), pixUsage);
  assert.deepEqual(usage.buildRedeemChannelUsageUpdates('pix', pixUsage), { pixChannelRedeemCdkeyUsage: pixUsage });
});

test('legacy pixRedeem pool aliases remain UPI aliases', () => {
  assert.equal(usage.getRedeemChannelPoolText({ pixRedeemCdkeyPoolText: 'OLD_UPI' }, 'upi'), 'OLD_UPI');
  assert.equal(usage.getRedeemChannelPoolText({ pixRedeemCdkeyPoolText: 'OLD_UPI' }, 'pix'), '');
});
~~~

Add PIX patch assertions to the existing state-patch and sidepanel pool tests, including the invariant that a PIX patch does not write UPI aliases.

- [ ] Step 2: Run focused tests and verify RED.

Run: node --test scripts/test-redeem-cdkey-usage.cjs scripts/test-sidepanel-cdk-pool-state.cjs scripts/test-background-state-patch-helpers.cjs

Expected: FAIL on missing PIX keys and isolation assertions.

- [ ] Step 3: Implement canonical PIX storage and settings defaults.

Add empty canonical PIX fields to settings-defaults.js, branch state-patch helpers on channel === 'pix', and update all pool/usage readers to use shared key helpers. Keep legacy alias arrays. Update background.js settings normalization/export/import to preserve old UPI aliases and include new PIX fields.

- [ ] Step 4: Run focused tests and verify GREEN.

Run the same focused command. Expected: all pool/state tests pass and existing UPI alias assertions remain green.

- [ ] Step 5: Commit.

~~~powershell
git add background/redeem/redeem-cdkey-usage.js background/bootstrap/settings-defaults.js background/bootstrap/state-patch-helpers.js background/upi-credential-membership-checker.js background.js sidepanel/cdk-pool-state.js sidepanel/account-records-cdk-pool-text.js scripts/test-redeem-cdkey-usage.cjs scripts/test-sidepanel-cdk-pool-state.cjs scripts/test-background-state-patch-helpers.cjs
git commit -m "feat: isolate PIX redeem pool state"
~~~

#### Task 3: Thread PIX through eligibility, result normalization, and membership grouping

**Files:**
- Modify: shared/trial-eligibility-api.js
- Modify: background/membership/trial-eligibility-service.js
- Modify: background/membership/free-pool-service.js
- Modify: background/membership/result-state.js
- Modify: background/membership/membership-result-sync.js
- Modify: sidepanel/account-records-membership-helpers.js
- Modify: sidepanel/account-records-trial-eligibility.js
- Modify: sidepanel/membership-renderer.js
- Test: scripts/test-trial-eligibility-api.cjs
- Test: scripts/test-membership-result-state.cjs
- Test: scripts/test-membership-view-model.cjs

**Interfaces:**
- Eligibility normalization exposes pixChannelEligibilityStatus and pixChannelEligibilityReason.
- Result normalization preserves PIX eligibility, failure, daily-limit, and channel fields.
- Membership view-model maps paid PIX rows to pix-plus and supports paid-pix UI group filtering.

- [ ] Step 1: Write the failing tests.

Add this fixture to test-trial-eligibility-api.cjs and PIX paid-row fixtures to result/view-model tests:

~~~javascript
test('trial eligibility preserves PIX channel status and reason', () => {
  const decision = normalizeTrialEligibilityDecision({
    trial_eligible: true,
    channels: { pix: { status: 'eligible', reason: 'pix-ok' } },
  });
  assert.equal(decision.pixChannelEligibilityStatus, 'eligible');
  assert.equal(decision.pixChannelEligibilityReason, 'pix-ok');
  assert.equal(isTrialEligibilityChannelAllowed(decision, 'pix'), true);
});
~~~

- [ ] Step 2: Run focused tests and verify RED.

Run: node --test scripts/test-trial-eligibility-api.cjs scripts/test-membership-result-state.cjs scripts/test-membership-view-model.cjs

Expected: FAIL because unknown channels collapse to UPI and no PIX group exists.

- [ ] Step 3: Implement PIX normalization and grouping.

Extend channel-specific response parsing and result sanitization with PIX fields. If the backend response has no PIX channel object, leave PIX status unknown rather than copying UPI/IDEAL. Update group labels, summary counters, and row-policy dependencies.

- [ ] Step 4: Run focused tests and verify GREEN.

Run the same command. Expected: PIX fixtures and all existing UPI/IDEAL fixtures pass.

- [ ] Step 5: Commit.

~~~powershell
git add shared/trial-eligibility-api.js background/membership/trial-eligibility-service.js background/membership/free-pool-service.js background/membership/result-state.js background/membership/membership-result-sync.js sidepanel/account-records-membership-helpers.js sidepanel/account-records-trial-eligibility.js sidepanel/membership-renderer.js scripts/test-trial-eligibility-api.cjs scripts/test-membership-result-state.cjs scripts/test-membership-view-model.cjs
git commit -m "feat: normalize PIX membership results"
~~~

#### Task 4: Thread the selected channel through redeem submission and remote job operations

**Files:**
- Modify: background/steps/upi-redeem.js
- Modify: background/steps/upi-redeem/channel-submission.js
- Modify: background/steps/upi-redeem/status-polling.js
- Modify: background/steps/upi-redeem/finalize.js
- Modify: background/redeem/upi-redeem-api-client.js
- Modify: background/membership/redeem-candidate-service.js
- Modify: background/membership/redeem-service.js
- Modify: background/membership/redeem-status-sync.js
- Modify: background/router/redeem-refresh-service.js
- Modify: background/router/core-routes.js
- Test: scripts/test-upi-redeem-api-client.cjs
- Test: scripts/test-redeem-channel-state.cjs
- Test: scripts/test-membership-redeem-progress.cjs

**Interfaces:**
- Redeem, refresh, cancel, and retry requests preserve normalized channel.
- Candidate selection uses channel pool/usage helpers for PIX and writes PIX usage only.
- redeemChannel: 'pix' reaches the remote API body and status persistence.

- [ ] Step 1: Write the failing tests.

Add this API test and state-isolation cases:

~~~javascript
test('redeemCdkey sends the PIX channel to the remote API', async () => {
  const requests = [];
  const client = api.createUpiRedeemApiClient({
    fetchImpl: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return { ok: true, text: async () => JSON.stringify({ status: 'queued' }) };
    },
  });
  await client.redeemCdkey({ apiUrl: 'https://example.test/redeem', cdkey: 'PIX_A', channel: 'pix' });
  assert.equal(requests[0].channel, 'pix');
});
~~~

- [ ] Step 2: Run focused tests and verify RED.

Run: node --test scripts/test-upi-redeem-api-client.cjs scripts/test-redeem-channel-state.cjs scripts/test-membership-redeem-progress.cjs

Expected: the new PIX request/state-isolation assertions fail.

- [ ] Step 3: Implement channel propagation.

Replace remaining binary fallbacks with the shared registry, pass normalized channel to submission/status/finalize helpers, and make refresh/cancel/retry payloads include PIX canonical pool text plus channel: 'pix'. Preserve existing UPI legacy payload aliases for old callers.

- [ ] Step 4: Run focused tests and verify GREEN.

Run the same focused command. Expected: all API/progress tests pass.

- [ ] Step 5: Commit.

~~~powershell
git add background/steps/upi-redeem.js background/steps/upi-redeem/channel-submission.js background/steps/upi-redeem/status-polling.js background/steps/upi-redeem/finalize.js background/redeem/upi-redeem-api-client.js background/membership/redeem-candidate-service.js background/membership/redeem-service.js background/membership/redeem-status-sync.js background/router/redeem-refresh-service.js background/router/core-routes.js scripts/test-upi-redeem-api-client.cjs scripts/test-redeem-channel-state.cjs scripts/test-membership-redeem-progress.cjs
git commit -m "feat: submit and track PIX redemptions"
~~~

#### Task 5: Add PIX card-pool UI and status operations

**Files:**
- Modify: sidepanel/sidepanel.html
- Modify: sidepanel/dom-bindings.js
- Modify: sidepanel/cdk-pool-state.js
- Modify: sidepanel/cdk-pool-manager.js
- Modify: sidepanel/upi-redeem-cdk-controller.js
- Modify: sidepanel/upi-redeem-cdk-status-view.js
- Modify: sidepanel/sidepanel-app-controller.js
- Modify: sidepanel/sidepanel.css
- Test: scripts/test-sidepanel-cdk-pool-state.cjs

**Interfaces:**
- DOM exposes PIX pool input/import/delete/summary/status-list nodes.
- Pool controller, status view, and refresh iteration accept pix.
- PIX pool edits produce canonical pixChannelRedeemCdkeyPoolText/pixChannelRedeemCdkeyUsage patches.

- [ ] Step 1: Write the failing test.

~~~javascript
test('PIX pool patch uses canonical PIX fields without UPI aliases', () => {
  const patch = helpers.buildCdkPoolStatePatch('PIX_A', { PIX_A: { enabled: true } }, 'pix');
  assert.equal(patch.pixChannelRedeemCdkeyPoolText, 'PIX_A');
  assert.ok(patch.pixChannelRedeemCdkeyUsage.PIX_A);
  assert.equal(patch.upiRedeemCdkeyPoolText, undefined);
  assert.equal(patch.pixRedeemCdkeyPoolText, undefined);
});
~~~

- [ ] Step 2: Run the focused test and verify RED.

Run: node --test scripts/test-sidepanel-cdk-pool-state.cjs

Expected: FAIL because the helper only has UPI and IDEAL branches.

- [ ] Step 3: Add the PIX panel and wire controllers.

Duplicate the IDEAL panel markup in sidepanel/sidepanel.html with PIX IDs and data-cdk-channel="pix". Bind the nodes, extend channel lists to ['upi', 'ideal', 'pix'], and use channel metadata for labels and stored values. Add only the minimum CSS needed for the existing grid/list layout.

- [ ] Step 4: Run focused test and syntax checks.

Run:
~~~powershell
node --test scripts/test-sidepanel-cdk-pool-state.cjs
node --check sidepanel/cdk-pool-state.js
node --check sidepanel/upi-redeem-cdk-controller.js
node --check sidepanel/upi-redeem-cdk-status-view.js
~~~

Expected: PASS with exit code 0.

- [ ] Step 5: Commit.

~~~powershell
git add sidepanel/sidepanel.html sidepanel/dom-bindings.js sidepanel/cdk-pool-state.js sidepanel/cdk-pool-manager.js sidepanel/upi-redeem-cdk-controller.js sidepanel/upi-redeem-cdk-status-view.js sidepanel/sidepanel-app-controller.js sidepanel/sidepanel.css scripts/test-sidepanel-cdk-pool-state.cjs
git commit -m "feat: add PIX CDK pool controls"
~~~

#### Task 6: Add the channel chooser and selected-channel all-redeem flow

**Files:**
- Modify: sidepanel/action-modal-service.js
- Modify: sidepanel/sidepanel-app-controller.js
- Modify: sidepanel/account-records-redeem-actions.js
- Modify: sidepanel/account-records-panel-events.js
- Modify: sidepanel/account-records-membership-results-renderer.js
- Test: scripts/test-account-records-redeem-actions.cjs
- Test: scripts/test-action-modal-service.cjs (create)

**Interfaces:**
- openActionModal honors action.disabled without resolving when disabled.
- openRedeemChannelChoiceDialog(options) returns Promise<'upi'|'ideal'|'pix'|null>.
- startUpiCredentialMembershipAllRedeem(channel) accepts the selected channel and runs only that channel.

- [ ] Step 1: Write the failing tests.

Create test-action-modal-service.cjs with a fake DOM asserting disabled PIX cannot resolve and enabled PIX resolves pix. Add a redeem-actions case asserting startUpiCredentialMembershipAllRedeem('pix') calls startUpiCredentialMembershipFreeRedeem exactly once with channel pix and fromAll true, never with UPI or IDEAL.

~~~javascript
test('selected PIX all-redeem path runs only PIX', async () => {
  const calls = [];
  const actions = createActionsForTest({
    startUpiCredentialMembershipFreeRedeem: async (_rows, options) => {
      calls.push(options);
      return { results: { items: [], freeCount: 0, paidCount: 0, failedCount: 0 } };
    },
  });
  await actions.startUpiCredentialMembershipAllRedeem('pix');
  assert.deepEqual(calls.map((item) => item.channel), ['pix']);
  assert.equal(calls[0].fromAll, true);
});
~~~

- [ ] Step 2: Run focused tests and verify RED.

Run: node --test scripts/test-action-modal-service.cjs scripts/test-account-records-redeem-actions.cjs

Expected: FAIL because all-redeem is hard-coded UPI then IDEAL and the modal has no disabled-action support.

- [ ] Step 3: Implement chooser and selected flow.

Add disabled handling to configureActionModalButton, add a controller wrapper that builds three actions from current candidate/CDK counts, and update the panel event handler to await the chooser before calling the selected-channel all-redeem function. Re-fetch state after selection, build candidates for only that channel, and keep direct UPI/IDEAL behavior unchanged. Add a direct PIX button and count/title to the Free action row.

- [ ] Step 4: Run focused tests and syntax checks.

Run:
~~~powershell
node --test scripts/test-action-modal-service.cjs scripts/test-account-records-redeem-actions.cjs
node --check sidepanel/action-modal-service.js
node --check sidepanel/account-records-redeem-actions.js
node --check sidepanel/account-records-membership-results-renderer.js
~~~

Expected: PASS with exit code 0.

- [ ] Step 5: Commit.

~~~powershell
git add sidepanel/action-modal-service.js sidepanel/sidepanel-app-controller.js sidepanel/account-records-redeem-actions.js sidepanel/account-records-panel-events.js sidepanel/account-records-membership-results-renderer.js scripts/test-account-records-redeem-actions.cjs scripts/test-action-modal-service.cjs
git commit -m "feat: choose redeem pool for all accounts"
~~~

#### Task 7: Add PIX Plus rendering, export, deletion, and operation labels

**Files:**
- Modify: sidepanel/account-records-membership-results-renderer.js
- Modify: sidepanel/account-records-membership-groups.js
- Modify: sidepanel/account-records-export-builders.js
- Modify: sidepanel/account-records-deletion-state.js
- Modify: sidepanel/account-records-redeem-status.js
- Modify: sidepanel/account-records-status-meta.js
- Modify: background/membership/import-export-service.js
- Test: scripts/test-membership-import-export-service.cjs
- Test: scripts/test-account-records-redeem-actions.cjs

**Interfaces:**
- PIX rows render as PIX Plus and export/delete filters accept paid-pix.
- Import/export sanitization preserves PIX channel fields and canonical pool keys.
- Cancel/retry/delete operations preserve channel pix.

- [ ] Step 1: Write failing tests.

Add import/export fixtures containing a PIX paid row and canonical PIX pool/usage state. Assert round-trip preservation, paid-pix export selection, and PIX cancel/retry payload channel.

- [ ] Step 2: Run focused tests and verify RED.

Run: node --test scripts/test-membership-import-export-service.cjs scripts/test-account-records-redeem-actions.cjs

Expected: FAIL because result grouping and export filters only recognize UPI and IDEAL.

- [ ] Step 3: Implement PIX group and operation handling.

Extend group maps, summary counters, export builders, deletion state, status metadata, and import/export sanitizers with PIX. Update all hard-coded paid-group lists to include paid-pix, and ensure operation payloads use the row’s normalized channel.

- [ ] Step 4: Run focused tests and verify GREEN.

Run the same focused command. Expected: PIX round-trip/group/operation tests and existing tests pass.

- [ ] Step 5: Commit.

~~~powershell
git add sidepanel/account-records-membership-results-renderer.js sidepanel/account-records-membership-groups.js sidepanel/account-records-export-builders.js sidepanel/account-records-deletion-state.js sidepanel/account-records-redeem-status.js sidepanel/account-records-status-meta.js background/membership/import-export-service.js scripts/test-membership-import-export-service.cjs scripts/test-account-records-redeem-actions.cjs
git commit -m "feat: render and export PIX memberships"
~~~

#### Task 8: Run full verification and reconcile remaining binary assumptions

**Files:**
- Modify: remaining files reported by the channel search only when a failing test or smoke audit identifies a PIX omission.
- Test: scripts/audit-smoke-tests.mjs

- [ ] Step 1: Search for remaining binary channel assumptions.

Run:
~~~powershell
rg -n "\['upi', 'ideal'\]|=== 'ideal'|=== 'upi'|pixRedeemCdkeyPoolText|pixRedeemCdkeyUsage" background sidepanel shared scripts
~~~

Review each match. Legacy alias matches are allowed only in UPI compatibility maps; executable channel branches must use the shared registry or include PIX explicitly.

- [ ] Step 2: Run the full test suite and syntax checks.

~~~powershell
node --test scripts/test-*.cjs
node scripts/audit-smoke-tests.mjs
node --check background.js
node --check sidepanel/sidepanel.js
node --check background/steps/upi-redeem.js
git diff --check
~~~

Expected: all Node tests pass, smoke audit exits successfully (pre-existing warnings documented if unchanged), syntax checks exit 0, and diff check is clean.

- [ ] Step 3: Verify the working tree and sensitive-data boundary.

~~~powershell
git status --short
git log -8 --oneline --decorate
~~~

Confirm only intended PIX implementation commits are present and no sensitive settings, credentials, tokens, cookies, proxies, phone numbers, or generated exports were added.

- [ ] Step 4: Commit any final focused fix.

Only if Step 2 identifies a real regression, add a focused regression test first, observe RED, implement the minimal fix, rerun the affected test and full suite, then commit with a behavior-specific fix: message.
