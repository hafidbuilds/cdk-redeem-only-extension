# 工程审查与阶段验收归档

本文件合并保存工程补全前的审查、真实基线、八个实施阶段、最终验收报告和隔离浏览器调研。记录反映执行当时的代码状态；当前行为以代码、自动测试、README 和开发指南为准。

## 目录

- [CDK Redeem Only 项目审查报告](#2026-07-04-project-audit)
- [Current Project Baseline](#current-project-baseline)
- [Stage 1 Engineering Foundation](#stage-1-engineering-foundation)
- [Stage 2 Canonical Account Records](#stage-2-canonical-account-records)
- [Stage 3 Recoverable Tasks](#stage-3-recoverable-tasks)
- [Stage 4: CDK Idempotency and Remote Effect Protection](#stage-4-cdk-idempotency)
- [Stage 5: Provider Definitions And Mail Baselines](#stage-5-provider-and-mail-baseline)
- [Stage 6: Unified Account Operation Policy](#stage-6-account-operation-policy)
- [Stage 7: Settings Migration, Storage, and Sensitive Data Security](#stage-7-storage-security)
- [Stage 8: Limited Concurrency, Retry, and Circuit Isolation](#stage-8-remote-operation-policy)
- [Final Validation Report](#final-validation-report)
- [MV3 扩展隔离浏览器测试工具调研](#2026-07-26-mv3-e2e-browser-tool-research)

---

<a id="2026-07-04-project-audit"></a>

<!-- archived-from: docs/audit/2026-07-04-project-audit.md -->

## CDK Redeem Only 项目审查报告

审查日期：2026-07-04

审查范围：当前工作树，不包含真实远端 API、OpenAI 页面、指纹浏览器端到端加载验证。

当前版本：`manifest.json` 为 `0.2.12`。

### 当前项目结构

- `manifest.json`：MV3 扩展入口，`background.js` 为 service worker，`sidepanel/sidepanel.html` 为侧栏入口。
- `background.js`：后台总入口，装载共享工具、邮箱 provider、流程步骤、message router、UPI/IDEAL 兑换与会员检测模块。
- `background/message-router.js`：侧栏消息路由，处理配置导入导出、会员检测、Free/Plus 操作、CDK 状态刷新。
- `background/steps/*.js`：7 步主流程实现；`background/steps/upi-redeem.js` 负责第 7 步资格检测、Free 写入、自动兑换、远端刷新。
- `background/upi-credential-membership-checker.js`：Free/Plus 分组、AT 补充、会员识别、UPI/IDEAL 卡密兑换、删除 tombstone、远端状态同步。
- `content/signup-page.js`：OpenAI/Auth 页面自动化，负责注册、密码、验证码、资料页、2FA/登录页面交互。
- `sidepanel/sidepanel.js`：侧栏主 glue 层，负责 DOM、配置、导入导出、CDK 池和 manager 实例化。
- `sidepanel/account-records-manager.js`：账号记录弹层、Free/UPI Plus/IDEAL Plus 分组、兑换按钮、导出删除等 UI 逻辑。
- `sidepanel/custom-email-pool-manager.js`：自定义邮箱池导入、筛选、启停、已用标记和删除。
- `shared/*` / `data/*` / `flows/*`：共享转换、步骤定义、静态资料、验证码规则。

### 当前本地改动

审查开始时已有未提交改动：

- `background.js`
- `sidepanel/custom-email-pool-manager.js`
- `sidepanel/sidepanel.html`
- `sidepanel/sidepanel.js`

本次审查新增：

- `scripts/audit-smoke-tests.mjs`
- `docs/audit/2026-07-04-project-audit.md`

### 主要发现

#### P1：导入 CDK 后自动续兑没有按渠道筛选候选

位置：`sidepanel/account-records-manager.js:4315` 到 `4340`

`resumeFreeRedeemAfterCdkImport()` 已经读取了导入渠道 `redeemChannel`，但候选账号使用的是 `getEnabledFreeUpiCredentialMembershipRows()`，这是 UPI/IDEAL 合并候选。后续调用 `startUpiCredentialMembershipFreeRedeem(..., { channel: redeemChannel })` 会把这批合并候选按导入渠道提交。

影响：

- 导入 IDEAL CDK 后，可能把仍应跑 UPI 的 Free 账号提交到 IDEAL。
- 导入 UPI CDK 后，可能把仅 IDEAL 可用的账号提交到 UPI。
- 这会让按钮数量、导入后自动续兑行为和分渠道策略不一致。

建议：

- 将候选改为 `getEnabledFreeUpiCredentialMembershipRowsForChannel(redeemChannel)`。
- 增加静态/单元测试：UPI 日限账号只进入 IDEAL 候选；普通 Free 只进入 UPI 候选。

#### P1：侧栏 JS 期待的部分 DOM 入口在 HTML 中缺失

位置：

- `sidepanel/sidepanel.js:308` 到 `316`
- `sidepanel/sidepanel.html:365` 到 `419`

`sidepanel.js` 仍绑定这些 ID：

- `btn-show-upi-credential-backups`
- `btn-export-upi-credential-backups`
- `btn-check-upi-credential-membership-local`
- `btn-import-upi-credential-membership-txt`
- `btn-import-upi-credential-membership-free-txt`
- `btn-stop-upi-credential-membership-check`
- `btn-export-upi-redeem-success-records`
- `btn-upi-redeem-cdkey-status-refresh`

但当前 HTML 在 CDK/会员区只保留了导入 CDK、一键删除、隐藏 file input、预览框和结果容器。代码使用可选链绑定，因此不会报错，但实际入口消失。

影响：

- 用户看不到手动刷新 CDK 状态按钮。
- 部分备份查看/导出、本地核验、TXT 导入、成功记录导出入口不可达。
- 如果这些功能是故意移除，JS 应清理；如果不是故意移除，HTML 应补回入口。

建议：

- 做一份 DOM 契约表：每个 `getElementById()` 要么在 HTML 存在，要么在允许缺失清单中注明“废弃/动态生成”。
- 最少应确认 `btn-upi-redeem-cdkey-status-refresh` 是否需要恢复，因为用户此前多次依赖“刷新状态”。

#### P2：单条删除 Plus 与分组删除 Plus 行为不一致

位置：

- 分组删除：`sidepanel/account-records-manager.js:4639` 到 `4653`
- 单条删除：`sidepanel/account-records-manager.js:4667` 到 `4713`

分组删除 `paid` 时只写对应渠道 tombstone，并清理禁用内存 Set；单条删除 `paid` 时写 tombstone 后，还会从 `upiCredentialMembershipPoolRows` 移除本地备份池里的邮箱。

影响：

- 单条删除 Plus 比分组删除更破坏性。
- 与“删除 Plus 不删除本地密码/2FA 备份”的预期不一致。
- 可能导致用户删除单行后，后续导出/登录/重新移动行为和批量删除不同。

建议：

- 统一删除语义：Plus 删除只写渠道 tombstone，不删除本地密码/2FA 池。
- 如果确实要删除本地备份，应在 UI 上使用单独按钮和明确提示。

#### P2：会员核验异常路径可能短暂残留 running 状态

位置：

- 单账号检测保存 running：`background/upi-credential-membership-checker.js:3424` 到 `3434`
- 单账号 finally：`background/upi-credential-membership-checker.js:3483` 到 `3485`
- 批量检测保存 running：`background/upi-credential-membership-checker.js:3519` 到 `3529`
- 批量 finally：`background/upi-credential-membership-checker.js:3609` 到 `3611`

单账号/批量核验正常完成会写 `running:false`；但如果中途发生未被业务分支捕获的异常，`finally` 只清内存 `batchRunning`，不保证落盘 `running:false`。

影响：

- 侧栏可能短暂显示仍在运行。
- 需要下一次读取/修复逻辑才能恢复，用户会感觉“卡住”。

建议：

- 在 catch/finally 中补一个安全落盘：保留 items，写 `running:false`、清 `flowStage` 或写失败原因。
- 对 stop 与异常分开记录，避免把用户停止误标为失败。

#### P2：文档与当前功能漂移

位置：

- `README.md`
- `项目文件结构说明.md`
- `项目完整链路说明.md`

当前代码已包含：

- IDEAL CDK 池与 IDEAL Plus 分组。
- 第 7 步资格通过后可自动提交兑换。
- Free 队列自动续兑和 5 秒刷新 CDK/远端状态。

但文档仍写：

- “UPI-only / UPI 专用版”。
- “第 7 步不会自动兑换 CDK”。
- 未描述 UPI/IDEAL 分渠道策略。

影响：

- GitHub 首页、教程和本地说明会误导使用者。
- 后续审查/发布时不容易判断当前行为是 bug 还是设计。

建议：

- 更新 README 和链路说明，把 Free 共用、UPI/IDEAL 分组、自动兑换策略、5 秒 CDK 刷新写清楚。

### 设计风险但不直接判 bug

#### 手动兑换在自动流程运行中可执行

位置：`background/message-router.js:3798` 到 `3807`

相邻的补 AT、识别 Plus、验证 Plus、登录、移动等操作会在自动流程运行中被锁住，但 `REDEEM_UPI_CREDENTIAL_MEMBERSHIP_FREE` 只校验 `manualTrigger`。从历史需求看，“自动注册运行中三个兑换按钮仍可用”可能是刻意设计。

建议：

- 如果继续允许并发，需要补测试保证不会抢同一个账号/CDK。
- 如果要更保守，应改成自动流程运行中禁止手动兑换或进入队列。

### 当前已验证

```powershell
node --check background.js
node --check background/message-router.js
node --check background/upi-credential-membership-checker.js
node --check background/steps/upi-redeem.js
node --check sidepanel/account-records-manager.js
node --check sidepanel/sidepanel.js
node --check sidepanel/custom-email-pool-manager.js
node scripts/audit-smoke-tests.mjs
```

实际执行过的更强验证：

```powershell
$failed=@(); git ls-files '*.js' '*.mjs' | ForEach-Object { node --check $_ }
node -e "const fs=require('fs'); for (const f of ['manifest.json','package.json','rules.json']) { JSON.parse(fs.readFileSync(f,'utf8')); console.log(f+': valid JSON'); }"
node scripts/audit-smoke-tests.mjs
```

结果：

- 所有 Git 跟踪的 JS/MJS 语法检查通过。
- `manifest.json`、`package.json`、`rules.json` 均为合法 JSON。
- smoke 测试通过，并提示 2 个文档漂移 warning。

### 测试示例

#### 自动 smoke 测试

运行：

```powershell
node scripts/audit-smoke-tests.mjs
```

覆盖：

- MV3 manifest 基础字段。
- 核心 JS 文件存在性。
- Git 跟踪 JS/MJS 的 `node --check`。
- 步间间隔默认 10 秒。
- 配置导出包含敏感运行数据标记。
- File System Access / `chrome.downloads` 导出路径锚点。
- UPI/IDEAL Plus 删除 tombstone 锚点。
- 远端 CDK 状态刷新路由与 `skipAutoRetry`。
- 自动兑换远端刷新 5 秒间隔。
- Free 组 CDK 续兑 5 秒刷新间隔。
- 敏感运行产物没有被 Git 跟踪。
- 文档与代码行为漂移 warning。

#### DOM 契约测试样例

目标：防止 JS 绑定了按钮但 HTML 中没有入口。

步骤：

1. 扫描 `sidepanel/sidepanel.js` 中所有 `document.getElementById('...')`。
2. 扫描 `sidepanel/sidepanel.html` 中所有 `id="..."`。
3. 差集按两类处理：
   - 动态创建/废弃入口：写进允许缺失清单。
   - 用户可见入口：测试失败。

重点 ID：

- `btn-upi-redeem-cdkey-status-refresh`
- `btn-import-upi-credential-membership-free-txt`
- `btn-export-upi-redeem-success-records`

#### UPI/IDEAL 导入续兑测试样例

目标：导入哪个渠道的 CDK，只续兑该渠道候选。

数据：

- A：普通 Free，有 AT，无日限，UPI 可兑。
- B：UPI 明确返回“该邮箱在该渠道今日提交次数已达上限 3 次 请 24 小时后再试”，IDEAL 可兑。
- C：IDEAL 失败 3 次，已封存。

期望：

- 导入 UPI CDK：只提交 A。
- 导入 IDEAL CDK：只提交 B。
- C 永远不被 UPI/IDEAL/全部选中。

#### Plus 删除测试样例

目标：删除 Plus 不回弹，且不误删本地密码/2FA。

步骤：

1. 准备同邮箱 UPI Plus 与 IDEAL Plus 各一条记录。
2. 删除 UPI Plus。
3. 刷新状态、重开侧栏、重载扩展。
4. 验证 UPI Plus 不回弹，IDEAL Plus 仍存在。
5. 验证本地密码/2FA 备份仍存在。
6. 用分组删除与单条删除各跑一次，比较结果一致性。

#### 主流程自动兑换测试样例

目标：第 7 步资格通过后，自动兑换行为可解释且不会抢错账号。

场景：

- 当前注册账号 UPI 可兑且 UPI 有 CDK：当前账号提交 UPI。
- 当前注册账号 UPI 日限，IDEAL 有 CDK：当前账号提交 IDEAL。
- 当前注册账号 UPI 日限，UPI 池还有 CDK，Free 队列里还有其它 UPI 候选：自动处理其它 UPI 候选。
- 远端提交后等待结果：每 5 秒刷新状态，只同步失败次数/状态，不在刷新线程里续兑。

#### 配置导入导出测试样例

目标：导出配置是可导入 JSON，且运行数据完整。

步骤：

1. 准备 Free、UPI Plus、IDEAL Plus、UPI CDK 池、IDEAL CDK 池、删除 tombstone、自定义邮箱池。
2. 点击导出配置。
3. 验证文件名为 `multipage-settings-*.json`，内容可 JSON.parse。
4. 清空本地配置后导入。
5. 验证：
   - IDEAL CDK 池还在。
   - UPI Plus/IDEAL Plus 数量一致。
   - tombstone 不丢失。
   - 自定义邮箱已用标记数量一致。

### 建议优先级

1. 先修 `resumeFreeRedeemAfterCdkImport()` 的分渠道候选筛选。
2. 再做 DOM 契约清理，决定缺失按钮是恢复还是删除死绑定。
3. 统一 Plus 单条删除/批量删除语义。
4. 给异常路径补 `running:false` 落盘。
5. 更新 README/链路文档，避免发布页误导。

---

<a id="current-project-baseline"></a>

<!-- archived-from: docs/audit/current-project-baseline.md -->

## Current Project Baseline

Date: 2026-07-25 (Asia/Shanghai)

Scope: extracted `CDK Redeem Only` Chrome Manifest V3 extension, version `1.0.14`.

### Repository State

- Working directory: `C:\Users\Z1803\Downloads\cdk-redeem-only-extension-v1.0.14-working-20260725`
- The extracted directory had no `.git` directory.
- `.gitignore` excludes local configuration, account history, logs, generated exports, release artifacts, backups, caches, worktrees, and `.codegraph`.
- Pre-change Git baseline: `e19e09516c601ecab638a4ddac2a319bd6c465d8`.
- Tracked baseline: 405 files, including 322 JavaScript/CJS/MJS files and 78 `test-*.cjs` files.
- The expected Chinese document `项目完整链路说明.md` exists with the correct filename; no rename is required.

### Security Review

The pre-change scan checked for ignored runtime files, `.env` files, `config.json`, account history exports, startup logs, JWT-shaped values, Bearer tokens, and common API-key prefixes. No real runtime credentials or account data were found. Email matches outside tests and docs were example placeholders such as `name@gmail.com` and `admin@example.com`.

Operational endpoints and provider names remain in source because they are existing product configuration, not embedded credentials.

### Runtime Boundaries

- Manifest: Chrome MV3.
- Service worker: `background.js`.
- Side panel: `sidepanel/sidepanel.html`.
- State: `chrome.storage.session` for runtime state plus `chrome.storage.local` for persistent settings and durable results.
- Primary durable keys: `accountRunHistory`, `upiAccountCredentialBackups`, `upiCredentialMembershipCheckResults`, `autoRunRoundLogSnapshots`, `upiRedeemCdkeyUsage`, `idealRedeemCdkeyUsage`, and `pixChannelRedeemCdkeyUsage`.
- Sidepanel-only preference keys use `localStorage`, including theme, prompt dismissal, custom-email-pool backup, and Free export URL preference.

### Providers And Channels

The current provider registry exposes `icloud`, `icloud-api`, `gmail`, `hotmail-api`, `luckmail-api`, `cloudflare-temp-email`, `cloudmail`, `freemail`, `moemail`, `yydsmail`, and `outlook-email-plus`. Generator aliases also include `gmail-alias`, `custom-pool`, and matching API-provider generators.

The only canonical redeem channels are `upi`, `ideal`, and `pix`. Their canonical pool/usage fields are independent:

| Channel | Pool | Usage | Failure field |
| --- | --- | --- | --- |
| UPI | `upiRedeemCdkeyPoolText` | `upiRedeemCdkeyUsage` | `upiRedeemFailureCount` |
| IDEAL | `idealRedeemCdkeyPoolText` | `idealRedeemCdkeyUsage` | `idealRedeemFailureCount` |
| PIX | `pixChannelRedeemCdkeyPoolText` | `pixChannelRedeemCdkeyUsage` | `pixRedeemFailureCount` |

Legacy `pixRedeem*` pool aliases remain UPI compatibility input and are not canonical PIX storage.

### Message And Load Boundaries

Routes are grouped under `background/routes/` and dispatched by `background/router/message-dispatcher.js`. Existing message families cover state/settings import-export, workflow start/stop/reset/schedule, email and provider operations, account history, membership/eligibility/AT refresh, and CDK redeem/refresh/cancel/retry.

The complete service-worker load order is the ordered `importScripts` list in `background.js`. The critical dependency order is shared registries and bootstrap modules, then redeem state/API helpers, route groups and dispatcher, membership services, workflow/verification modules, UPI redeem submodules, provider utilities, and finally `content/activation-utils.js`.

The complete sidepanel load order is the ordered script list at the end of `sidepanel/sidepanel.html`. Shared state and formatting modules load before account modules; controllers load before `sidepanel-app-controller.js`; bootstrap and `sidepanel.js` load last. Static audit enforces these order constraints.

### Baseline Verification

Commands run before source modification:

```text
node --test scripts/test-*.cjs
node scripts/audit-smoke-tests.mjs
node scripts/audit-no-removed-network.mjs
node scripts/audit-no-phone-sms.mjs
node --check background.js
node --check sidepanel/sidepanel.js
node --check background/steps/upi-redeem.js
```

Results:

- Unit tests: 312 passed, 0 failed, 0 skipped.
- Removed-network audit: passed.
- Phone/SMS audit: passed.
- Direct syntax checks: passed.
- Smoke audit before Git initialization: failed on three Git-dependent checks plus the three size guards below.
- Smoke audit after Git initialization: Git-dependent checks passed; only the three size guards failed.

| File | Actual | Limit |
| --- | ---: | ---: |
| `sidepanel/sidepanel-app-controller.js` | 7909 | 7850 |
| `background/steps/upi-redeem/free-entry.js` | 603 | 580 |
| `background/steps/upi-redeem/channel-submission.js` | 1932 | 1900 |

`background.js` has 15110 lines and produces the existing warning for tracked source over 8000 lines, but remains below its enforced 15400-line guard.

### Frozen Fixtures

`scripts/fixtures/current-project-baseline.cjs` contains only fictional `example.com` accounts and fictional channel CDKs. `scripts/test-current-project-baseline.cjs` freezes:

- Free, UPI Plus, IDEAL Plus, PIX Plus, missing-AT, invalid-AT, and deactivated account shapes;
- current Free text export field order;
- UPI/IDEAL/PIX channel isolation;
- one-channel-only all-redeem selection behavior.

---

<a id="stage-1-engineering-foundation"></a>

<!-- archived-from: docs/audit/stage-1-engineering-foundation.md -->

## Stage 1 Engineering Foundation

Date: 2026-07-25

This stage fixes the extracted project's three enforced size failures without changing their limits or removing behavior.

### Responsibility Splits

- `sidepanel/prompt-preferences.js` owns prompt dismissal and contribution-content version persistence.
- `sidepanel/download-service.js` now owns download timestamp, extension, and filename normalization.
- `background/steps/upi-redeem/free-entry-cleanup.js` owns successful redemption cleanup projections for email and CDK pools.
- `background/steps/upi-redeem/submission-response.js` owns remote response parsing, bounded error extraction, HTML detection, and explicit access-token-expiry payload classification.

All four modules have production callers, load-order checks, size guards, and focused tests. The UPI, IDEAL, and PIX state model is unchanged.

### Commands

`package.json` now provides:

```text
npm run syntax
npm test
npm run audit
npm run check
npm run package
```

The syntax command checks every Git-tracked JS/CJS/MJS file. The package command builds a loadable ZIP from an explicit runtime allowlist and verifies Manifest, Background, Sidepanel JS, and Sidepanel CSS references before compression.

### CI

`.github/workflows/ci.yml` runs on Windows with Node 22 and executes `npm ci`, syntax, tests, audits, package creation, and `git diff --check`.

### Security

The release allowlist excludes project tooling, Git metadata, local configuration, account history exports, logs, backups, caches, and generated release artifacts. It refuses to package a Manifest containing an extension `key`.

### Verification Results

- `npm ci`: passed, 0 vulnerabilities.
- `npm run syntax`: 334 tracked JS/CJS/MJS files passed.
- `npm test`: 330 passed, 0 failed, 0 skipped (312 original + 4 baseline + 14 stage 1 tests).
- `npm run audit`: smoke, removed-network, and phone/SMS audits passed.
- `npm run check`: passed end to end.
- Enforced file sizes: sidepanel app controller 7849/7850, Free entry 535/580, channel submission 1849/1900.
- `npm run package`: generated 252 runtime files in `release-artifacts/cdk-redeem-only-extension-v1.0.14.zip`.
- ZIP SHA-256: `B7B1C2C3C52D062690EC6CD6D8D333019EE667D6AAA987B51A8C7CC71F8CB23A`.
- ZIP reverse audit: 0 forbidden entries; required Manifest and runtime modules present.
- Edge package smoke: MV3 Service Worker started, Sidepanel returned 200 with title `CDK Redeem Only V1.0.14`, and no page or console errors were captured.

The smoke audit retains one non-failing warning: `background.js` is 15112 lines, above the general 8000-line warning level but below its enforced 15400-line guard.

---

<a id="stage-2-canonical-account-records"></a>

<!-- archived-from: docs/audit/stage-2-canonical-account-records.md -->

## Stage 2 Canonical Account Records

Date: 2026-07-25

This stage adds a canonical account read model inside the existing Chrome MV3 extension. It does not introduce a second application, server, database, or framework.

### Storage And Migration

- `accountRecordsV2` is the canonical root: `{ schemaVersion: 2, items, updatedAt }`.
- Account IDs use the shared `normalizeAccountId()` implementation and invalid emails are discarded.
- Service Worker startup reconstructs canonical records from the existing custom email pool, account run history, membership results, credential backups, and the three channel usage maps.
- Migration is idempotent and does not mutate or delete any legacy key.
- `accountRecordsV2MigrationBackupV1` records the pre-migration canonical root before the first Repository write. The legacy sources remain in place as the primary migration fallback.
- Legacy `pixRedeem*` usage continues to map only to UPI compatibility state. Canonical PIX reads only `pixChannelRedeem*` state.

### Ownership Boundaries

- `shared/account-record-schema.js` owns account ID, status, timestamp, record, and channel normalization.
- `background/account-record-migration.js` owns read-only reconstruction from existing storage shapes.
- `background/account-repository.js` is the only production module that writes `accountRecordsV2`.
- `background/account-lifecycle-service.js` separates account validity, trial eligibility, membership, and access-token state.
- `shared/account-compatibility-adapter.js` projects canonical records back to the existing membership row shape.
- `sidepanel/account-records-membership-state-sync.js` consumes the canonical projection while allowing newer in-flight legacy results to override stale projected fields.

The existing account display, Free/Plus groups, exports, deletion tombstones, manual actions, and channel-specific redemption controls remain active. Sidepanel does not write canonical storage directly.

### Lifecycle Rules

- Network errors, timeouts, and HTTP 5xx preserve the current AT and remain retryable.
- Only explicit 401 or equivalent invalid-token evidence marks an AT invalid.
- Missing AT and invalid AT remain different states.
- An unverified replacement AT never overwrites the old AT.
- A deactivated account remains recorded, clears its confirmed unusable AT, stops retries, and cannot redeem.
- Free membership does not imply an invalid account.

### Verification

- Focused account tests: 42 passed.
- Full unit tests: 348 passed, 0 failed, 0 skipped.
- Syntax: 346 tracked JS/CJS/MJS files passed.
- Audits: smoke, removed-network, and phone/SMS audits passed.
- Manifest: all 35 referenced runtime files exist.
- Sensitive scan: no private-key, AWS-key, OpenAI-key, or long Bearer-token pattern found.
- CodeGraph: initialized and synchronized; 348 indexed files, 6,572 nodes, 25,805 edges.
- Packaging: intentionally skipped for this stage per the staged execution instruction.

The smoke audit retains the existing non-failing warning that `background.js` exceeds the general 8000-line warning threshold; it remains below the enforced 15400-line limit, which was not changed.

---

<a id="stage-3-recoverable-tasks"></a>

<!-- archived-from: docs/audit/stage-3-recoverable-tasks.md -->

## Stage 3 Recoverable Tasks

Date: 2026-07-25

This stage adds persistent tasks and events to the existing Chrome MV3 extension. It extends the current workflow, membership, redemption, router, and Sidepanel modules; it does not add another application, server, database, framework, or long-lived worker.

### Storage And Ownership

- `accountTasksV1` stores `{ schemaVersion: 1, items, updatedAt }` and is written only by `background/task-repository.js`.
- `accountTaskEventsV1` stores events under `byTaskId` and is written only by `background/task-event-store.js`.
- Active tasks are never pruned. The Repository keeps the most recent 100 completed tasks, and the Event Store keeps 100 detailed events per task before compacting older events into a summary.
- Task payloads, results, errors, events, and ordinary background logs use `shared/sensitive-data-redactor.js` before persistence or broadcast.

### Real Callers

- Automatic registration creates a `register` task and checkpoints the active workflow node.
- Batch and single-account membership checks create `verify_membership` tasks.
- Free-group AT supplement and invalid-AT refresh create `refresh_access_token` tasks.
- Free-account UPI, IDEAL, or PIX redemption creates a channel-specific `redeem` task.
- Existing operations still perform the business work. The task runtime wraps those operations and does not replace the workflow engine or membership checker.

### Locks And Recovery

- Resource keys support accounts, channel-scoped CDKs, auth tabs, and mailboxes. Complete CDKs are normalized into one-way hashes before persistence.
- Conflicting account locks fail closed with `TASK_RESOURCE_CONFLICT`; UPI, IDEAL, and PIX CDK locks remain independent.
- Normal success, failure, and pre-side-effect cancellation release locks at terminal persistence.
- Unknown or pending remote results retain locks and enter `waiting_remote` or `manual_review`; they never become eligible for blind resubmission.
- Startup recovery is deduplicated once per Service Worker instance and classifies safe resume, verification wait, remote query, local finalization, interruption, manual review, cancellation after submit, and deactivated accounts.
- Deactivated accounts are retained, their confirmed unusable AT is cleared by the account lifecycle path, and redemption is not retried.

### Sidepanel

The existing account-records panel contains a compact task section. It calls the real `GET_ACCOUNT_TASKS`, `GET_ACCOUNT_TASK_EVENTS`, and `CANCEL_ACCOUNT_TASK` routes, displays task status and progress, and isolates event details by `taskId`.

### Verification

- Focused task tests: 33 passed, including the 10 required interruption scenarios.
- Full unit tests: 381 passed, 0 failed, 0 skipped.
- Syntax: 366 tracked JS/CJS/MJS files passed.
- Audits: smoke, removed-network, and phone/SMS audits passed.
- Manifest: all 25 unique runtime references exist.
- Sensitive production scan: no private-key, AWS-key, OpenAI-key, or long Bearer-token pattern found.
- CodeGraph: synchronized; 368 indexed files, 6,729 nodes, and 26,167 edges.
- Staged diff whitespace check: passed.
- Packaging: intentionally skipped for this stage.

The smoke audit retains the existing non-failing warning that `background.js` exceeds the general 8000-line warning threshold. It is 15,218 lines and remains below the unchanged enforced 15,400-line limit.

---

<a id="stage-4-cdk-idempotency"></a>

<!-- archived-from: docs/audit/stage-4-cdk-idempotency.md -->

## Stage 4: CDK Idempotency and Remote Effect Protection

### Implemented

- Account resource locks use the canonical normalized account ID.
- CDK resource locks include the normalized channel and `fnv1a_*` fingerprint; the complete CDK is never written to task events or ordinary logs.
- `externalEffectsV1` and `redeemAttemptsV1` are written only by `background/external-effect-ledger.js`.
- Redeem dispatch persists `prepared` before the request, records `dispatched` before fetch, and records `acknowledged` or `confirmed` only after explicit remote acceptance.
- Network, timeout, page-close, and Service Worker loss paths remain `unknown`; an unknown effect cannot be dispatched again.
- Service Worker recovery performs a query-only status refresh through the existing redeem status service. Confirmed and explicitly failed results resolve the task and release locks; unresolved results become `manual_review` and retain locks.
- UPI, IDEAL, and PIX keep separate CDK pools, usage, effects, and failure state. A matching CDK fingerprint in another channel does not block a dispatch.
- Stable `Idempotency-Key` headers are sent for tracked redeem submissions.

### Verification

- Targeted Stage 4 tests: `22/22` passed.
- Full unit tests: `396/396` passed with `node --test --test-concurrency=1 scripts/test-*.cjs`.
- Syntax: `370` tracked JavaScript files passed `scripts/check-syntax.mjs`.
- Audits: smoke, removed-network, and phone/SMS audits passed. The existing warning for `background.js` being over 8,000 lines remains; no threshold was changed.
- No release package was built in this stage.

---

<a id="stage-5-provider-and-mail-baseline"></a>

<!-- archived-from: docs/audit/stage-5-provider-and-mail-baseline.md -->

## Stage 5: Provider Definitions And Mail Baselines

### Scope

Stage 5 extends the existing `background/email/provider-registry.js` and verification flow. It does not add a second provider or mail service.

### Provider Definition

The registry now exposes `getProviderDefinition`, `listProviderDefinitions`, `normalizeProviderConfig`, `validateProviderConfig`, `redactProviderConfig`, and `testProviderConnection`. Definitions carry provider ID, display name, field/state keys, secret markers, defaults, normalization rules, capabilities, and dedicated-UI status. Existing Hotmail, 2925, iCloud, Gmail, and custom-mail managers remain dedicated UI providers. Background `getMailConfig` uses the canonical display name for shared providers.

Empty secret input can be normalized with a previous configuration so a settings save does not erase an existing key. Redacted configuration contains only a short preview and is suitable for status messages. Connection testing is an injected, side-effect-free entry point; it validates before invoking the existing provider-specific tester.

### Verification Mail Baseline

`background/verification/mail-baseline.js` stores only bounded metadata: request time, account/session scope, provider, message IDs, and stable FNV fingerprints. It never persists a full mail body. Resend requests establish `verificationMailBaseline` before the request and update the request timestamp after the page accepts it. Pollers receive consumed ID/fingerprint exclusions, while accepted results record a consumed marker after successful submission. Assurivo entries additionally carry their provider message ID/fingerprint into the existing custom-mail flow.

The existing timestamp, sender, subject, keyword, target-mailbox, resend, and provider-specific cursor rules remain authoritative. A network or provider error remains a transport/provider error; it is not translated into token invalidity.

### Verification

- Targeted Stage 5 tests: `15/15` (including existing verification regression tests).
- Full unit tests: `403/403`.
- Syntax: `372` tracked JavaScript files passed.
- Audits: smoke passed with the existing `background.js` size warning; removed-network and phone/SMS audits passed.
- Manifest references: `35` checked, `0` missing.
- CodeGraph: `377` files, `6,834` nodes, `26,572` edges, index up to date.
- Sensitive scan: only existing fake fixture/test secrets matched; no real credential-shaped value was added.

---

<a id="stage-6-account-operation-policy"></a>

<!-- archived-from: docs/audit/stage-6-account-operation-policy.md -->

## Stage 6: Unified Account Operation Policy

`sidepanel/membership-row-policy.js` now owns the operation decision contract for the existing account rows. `getOperationDecision` and `buildOperationDecisions` cover AT refresh, membership verification, UPI/IDEAL/PIX redeem, export, delete, retry, and stop. Every decision returns `allowed`, a stable `reasonCode`, and a readable `reason`; redeem decisions also carry the normalized channel.

`sidepanel/account-records-redeem-policy.js` exposes the same policy through the manager's existing wrapper. `account-records-display-model.js` attaches the policy result to each normalized display row as `operationDecisions`, so renderers can present the result without reimplementing eligibility, AT, account lock, daily-limit, or active-task checks. Existing channel state remains independent, including PIX.

The implementation reuses the current membership row, trial eligibility, redeem channel, and workflow modules. No second account list or write path was introduced.

Verification for this stage includes the existing membership, PIX, display model, manager, renderer, and workflow tests plus the new stable reason-code assertions.

Recorded gates: full unit tests `404/404`; syntax `375` tracked JavaScript files passed; smoke, removed-network, and phone/SMS audits passed with the existing `background.js` size warning; Manifest references `35/0`; CodeGraph `377` files, `6,839` nodes, `26,647` edges, up to date. Credential-shaped scan found no matches.

---

<a id="stage-7-storage-security"></a>

<!-- archived-from: docs/audit/stage-7-storage-security.md -->

## Stage 7: Settings Migration, Storage, and Sensitive Data Security

### Implementation

- `background/bootstrap/settings-transfer-security.js` owns schema migration, recursive sensitive-field omission, safe runtime summaries, and bounded pre-import backups.
- `background/bootstrap/settings-transfer.js` keeps the existing settings import/export path and delegates those security operations; v1 bundles migrate to the current schema v2 idempotently, while future versions fail closed.
- Ordinary exports use `exportMode: safe` and `containsSensitiveRuntimeData: false`. Sensitive runtime data is exported only when the caller sends both `includeSensitiveRuntimeData: true` and `confirmed: true`.
- The existing sidepanel configuration menu now exposes a separate sensitive-backup action with a destructive confirmation dialog. Existing account export formats are unchanged.
- `background/bootstrap/state-store.js` sets `storage.session` to `TRUSTED_CONTEXTS`; content scripts continue using Background message routes rather than reading protected storage.
- Manifest permission purposes are documented in `docs/architecture/permission-map.md` without removing permissions used by current automation.

### Verification

Focused tests in `scripts/test-settings-migration.cjs` cover v1 to v2 migration, idempotency, future-version rejection, safe export omission, explicit sensitive export confirmation, and pre-import backup persistence. Existing settings route, transfer manager, and state-store tests remain active.

Recorded gates for this stage: focused settings and sidepanel tests passed; smoke audit passed with only the existing `background.js` size warning. Full unit, syntax, manifest, sensitive-data, and CodeGraph gates are run before the stage commit.

---

<a id="stage-8-remote-operation-policy"></a>

<!-- archived-from: docs/audit/stage-8-remote-operation-policy.md -->

## Stage 8: Limited Concurrency, Retry, and Circuit Isolation

`background/runtime/remote-operation-policy.js` is the shared policy for independent remote queries. It clamps concurrency to 1-5 (default 3), supports bounded attempts, request timeouts, exponential jitter, numeric/date `Retry-After`, and persisted per-scope circuit states (`closed`, `open`, `half_open`). Provider scopes use `provider:<id>` and are isolated from channel scopes such as `channel:upi`.

The existing Provider Definition connection test now executes through this policy when the policy is available. Registration, page automation, and redeem submissions remain serial and continue to use the existing account/CDK locks; an unknown redeem outcome is therefore never retried by this helper.

`scripts/test-remote-operation-policy.cjs` covers concurrency bounds, Retry-After waiting, circuit persistence/isolation, and retry limits. No package is produced for this intermediate stage.

---

<a id="final-validation-report"></a>

<!-- archived-from: docs/audit/final-validation-report.md -->

## Final Validation Report

日期：2026-07-25

### 范围

本阶段在当前扩展目录内完成最终运行门禁，没有迁移目录、引入独立服务或创建第二套账号、任务、Provider、兑换实现。中间阶段没有生成发布包；只在最终门禁完成后运行一次 `npm run package`。

### 实现结果

- 修复 Service Worker 真实启动错误：远端操作策略的调用方使用导出的 `createRemoteOperationPolicy()`，消息监听可以完成注册。
- 新增 `scripts/test-extension-e2e.cjs` 和 `npm run e2e`，使用本机 Microsoft Edge 加载未打包 MV3 扩展。
- E2E 验证 Service Worker 启动、sidepanel 页面、设置卡片、账号列表、任务列表，以及 `SAVE_SETTING` 后 `GET_STATE` 的保存/恢复结果。
- 发布包仍由现有 `scripts/build-release.mjs` 的 Git 受控运行时白名单生成。

### 门禁结果

| 门禁 | 结果 |
| --- | --- |
| `npm run e2e` | 1/1 通过 |
| `npm test` | 413/413 通过 |
| `npm run syntax` | 379 个 tracked JavaScript 文件通过 |
| `npm run audit` | 通过；仅有既有 `background.js` 15243 行体积警告 |
| Removed Network audit | 通过 |
| Phone/SMS audit | 通过 |
| Manifest/运行时引用 | 41 个引用，25 个唯一引用，0 个缺失 |
| 敏感数据扫描 | 通过；未提交真实凭据、Token、Cookie、密码、手机号或运行日志 |
| `git diff --check` | 通过 |
| CodeGraph | 同步后 up to date |

E2E 依赖本机 Microsoft Edge：`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`。该依赖只用于验证浏览器真实扩展生命周期，不改变运行时架构。

### 发布包验收

最终只运行一次 `npm run package`，生成 `release-artifacts/cdk-redeem-only-extension-v1.0.14.zip`，包含 273 个运行时文件。`scripts/test-build-release.cjs` 的 2/2 测试通过；ZIP 内容检查发现 0 个禁止路径，Manifest 引用缺失数为 0。压缩包不包含 `.git`、`.codegraph`、`scripts/`、`docs/`、测试、`config.json`、运行历史、备份、日志或发布目录自身。

---

<a id="2026-07-26-mv3-e2e-browser-tool-research"></a>

<!-- archived-from: docs/audit/2026-07-26-mv3-e2e-browser-tool-research.md -->

## MV3 扩展隔离浏览器测试工具调研

调研日期：2026-07-26

### 目标

在不启动用户日常使用的 Google Chrome、不读取其登录状态、Cookie 或默认用户目录的前提下，自动加载当前未打包的 Manifest V3 扩展，并验证 Service Worker、扩展页面、Side Panel 和消息通信。

当前仓库已经使用 Node.js 和 Playwright。`scripts/test-extension-e2e.cjs` 通过 `launchPersistentContext('', ...)` 创建临时用户目录，但默认 `executablePath` 指向 Microsoft Edge。因此现有结果只能证明 Edge/Chromium 兼容性，不能称为 Google Chrome 验证。

### 浏览器边界

- Chrome 团队从正式版 Chrome 137 起移除了 `--load-extension`，从 Chrome 139 起又移除了品牌版 Chrome 中的 `--disable-extensions-except`。这些参数继续在 Chromium 和 Chrome for Testing 中工作。因此，正式安装版 Google Chrome 已不适合作为未打包扩展的稳定自动化目标。
- Chrome for Testing 是 Google 为自动化提供的固定版本 Chrome 发行物，不会自动更新，提供 `win32`、`win64`、Linux 和 macOS 下载。它与用户日常 Chrome 的程序目录和用户目录分离。
- Playwright 官方对扩展测试的建议是使用其随包 Chromium；Google Chrome 和 Microsoft Edge 不再是官方推荐的命令行侧载目标。
- Chrome for Testing 的下载索引项目采用 Apache-2.0，但下载得到的是 Chrome for Testing 浏览器发行物，不能把浏览器二进制本身表述为“纯开源 Chromium”。

来源：

- [Chrome 扩展团队关于品牌版 Chrome 侧载参数的公告](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/FxMU1TvxWWg/m/daZVTYNlBQAJ)
- [Chrome for Testing 官方介绍](https://developer.chrome.com/blog/chrome-for-testing/)
- [Chrome for Testing 下载索引与 Windows 平台说明](https://github.com/GoogleChromeLabs/chrome-for-testing)
- [Playwright Chrome extensions](https://playwright.dev/docs/chrome-extensions)

### 候选对比

| 候选 | 许可证与维护状态 | MV3/隔离能力 | Windows/CI 与当前项目接入 | 结论 |
| --- | --- | --- | --- | --- |
| **Puppeteer + Chrome for Testing** | Puppeteer 为 Apache-2.0；npm `25.3.0` 发布于 2026-07-01，仓库持续维护 | `enableExtensions` 可直接加载目录；有 `installExtension()`、扩展枚举、MV3 Service Worker、扩展 Action 和内容脚本 Realm API；默认下载匹配的 Chrome for Testing，并使用临时 Profile | 支持 Windows；可在本地或 CI 缓存浏览器。当前单个 Playwright E2E 可窄幅改写为 Puppeteer，不影响扩展业务代码 | **首选**，最接近真实 Chrome 且完全不碰本地 Chrome |
| **Playwright + 随包 Chromium** | Apache-2.0；npm `1.62.0` 发布于 2026-07-24，仓库持续维护 | 官方支持 persistent context、MV3 Service Worker、扩展页面和新版 headless；空 `userDataDir` 会创建临时目录 | Windows/CI 成熟；当前项目已经依赖 Playwright，只需安装其 Chromium 并停止硬编码 Edge | **最小改动备选**，但验证对象应明确写成 Chromium，不是 Google Chrome |
| **`@puppeteer/browsers` + Chrome for Testing + 现有 Playwright** | Apache-2.0；npm `3.0.6` 发布于 2026-07-01 | 工具负责下载、固定和定位 Chrome for Testing；当前 Playwright 仍负责测试 | Windows 有官方 `win32`/`win64` 资产；接入量小，但 Playwright 对自定义 `executablePath` 明确不保证最佳兼容性 | 可作为过渡方案，不如完整 Puppeteer 路线稳定 |
| **Mozilla web-ext + Chrome for Testing** | MPL-2.0；`10.5.0` 发布于 2026-07-10，仓库持续维护 | Chrome 126+ 可通过 CDP `Extensions.loadUnpacked` 加载目录，并可创建临时 Profile；适合启动、自动重载和基础验证 | 必须显式指定 CfT 路径才不会发现并调用本机浏览器；它不是完整断言框架，测试 UI 仍需 Puppeteer/WebDriver | 适合开发启动器，不适合单独替代当前 E2E |
| **Selenium WebDriver + Selenium Manager + Chrome for Testing** | Selenium 为 Apache-2.0；`selenium-webdriver 4.46.0` 发布于 2026-07-11 | ChromeOptions 可加载扩展和指定隔离用户目录；Selenium Manager 可管理浏览器/Driver | Windows 和 CI 支持成熟，但 MV3 Service Worker、扩展内部页面与 Side Panel 的操作不如 Puppeteer/Playwright 直接；需要重写现有 E2E | 可用但迁移成本高，不推荐当前项目采用 |

维护状态来自对应 GitHub API、GitHub Release 和 npm registry 的 2026-07-26 查询结果：

- [microsoft/playwright](https://github.com/microsoft/playwright)
- [puppeteer/puppeteer](https://github.com/puppeteer/puppeteer)
- [SeleniumHQ/selenium](https://github.com/SeleniumHQ/selenium)
- [mozilla/web-ext](https://github.com/mozilla/web-ext)
- [`@puppeteer/browsers`](https://pptr.dev/browsers-api/)

### 推荐方案

推荐采用 **Puppeteer + 自动下载的固定版本 Chrome for Testing + 每次测试独立临时 Profile**：

1. Puppeteer 是 Chrome Browser Automation 团队维护的开源 Node.js 项目，安装 `puppeteer` 时会下载与该版本匹配的 Chrome for Testing，不调用系统 Chrome。
2. 使用 `enableExtensions: [extensionRoot]` 加载当前仓库，无需打包 CRX，也不需要访问 `chrome://extensions` 手工安装。
3. 通过 `service_worker` Target 获取 MV3 后台，打开 `chrome-extension://<id>/sidepanel/sidepanel.html` 验证现有 Side Panel。
4. 默认临时 Profile 不包含用户账号、Cookie、密码和 AT；测试结束调用 `browser.close()`。
5. Side Panel 和其他可视 UI 使用 `headless: false`；仅 Service Worker 和基本页面回归可使用 Chrome 新版 headless。不要使用旧 `chrome-headless-shell` 作为扩展 UI 验证依据。
6. 在测试输出中固定打印并断言 `product/version`、浏览器可执行文件来源、Profile 类型和扩展 ID，使报告不会再把 Edge、Chromium 和 Chrome for Testing 混称为 Chrome。

### 本机隔离验证

2026-07-26 在系统临时目录安装 `puppeteer@25.3.0`，未修改本仓库依赖，也未读取或连接用户 Chrome Profile。Puppeteer 自动下载并启动 Chrome for Testing `150.0.7871.24`，使用临时 Profile 加载当前仓库：

- MV3 `background.js` Service Worker：已启动并识别；
- `sidepanel/sidepanel.html`：已加载；
- 设置区和配置按钮：已识别；
- 账号列表和任务列表：已识别；
- 本次验证未写入账号、设置、Cookie、密码、AT 或系统剪贴板。

Windows 上本次验证必须使用 `pipe: true`。默认 WebSocket 调试端口模式在调用 `Extensions.loadUnpacked` 时出现浏览器 Target 提前关闭；切换到 pipe 传输后，扩展加载和上述页面断言通过。因此，后续若正式接入 Puppeteer，应将 pipe 传输和独立临时 Profile 固化到测试启动配置，并为浏览器启动失败保留明确诊断。

官方接入依据：

- [Puppeteer 安装和自动下载 Chrome for Testing](https://pptr.dev/guides/installation)
- [Puppeteer 支持的浏览器版本](https://pptr.dev/supported-browsers)
- [Puppeteer Chrome Extensions API](https://pptr.dev/guides/chrome-extensions)
- [Chrome 官方扩展 E2E 测试指南](https://developer.chrome.com/docs/extensions/how-to/test/end-to-end-testing)
- [Chrome 官方 MV3 Service Worker 终止/恢复测试](https://developer.chrome.com/docs/extensions/how-to/test/test-serviceworker-termination-with-puppeteer)

### 不推荐的做法

- 不再以用户本地 Google Chrome、默认 User Data 或已经登录的 Profile 作为自动测试环境。
- 不再把 Microsoft Edge 的 E2E 结果写成 Google Chrome 已通过。
- 不把 Playwright 随包 Chromium 的结果写成 Chrome for Testing 已通过。
- 不依赖 Chrome 137/139 以后正式品牌版 Chrome 已移除的扩展侧载参数。
- 不为引入测试工具而迁移扩展目录、重写业务模块或新增独立服务。

本文件只记录调研结论，未修改业务代码、测试脚本、依赖或发布版本。
