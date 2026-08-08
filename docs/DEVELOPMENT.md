# 开发指南

本文档是 Free Account Tool `3.0.0` 的当前开发入口。自动化开发还必须遵守根目录 [AGENTS.md](../AGENTS.md)。

## 文档优先级

1. 当前仓库中的真实代码、目录、测试和审计结果。
2. 本开发指南、[使用指南](USER_GUIDE.md) 和当前故障档案。
3. 根目录工程基线文档。
4. `docs/history/` 中仅用于追溯的历史计划和设计。

历史文档中的 CDK、兑换和 Plus 设计不再代表当前功能。

## 项目结构

| 路径 | 职责 |
| --- | --- |
| `manifest.json` | MV3 权限、Content Script、Side Panel 和 Service Worker 入口 |
| `background.js` | Service Worker 脚本装载与启动编排 |
| `background/steps/` | 注册、密码、2FA/Passkey、AT 和资格节点 |
| `background/free-account-service.js` | V3 Free 结果导入导出、资格复检、登录和 AT 操作 |
| `background/free-account-session-fill-task.js` | 持久化 Session 补充任务、断点续跑与 Background TXT 下载 |
| `background/bootstrap/free-account-v3-migration.js` | V3 一次性迁移与旧数据清理 |
| `background/routes/`、`background/router/` | 运行时消息路由和调度 |
| `content/` | OpenAI/Auth/iCloud 等页面 DOM 自动化与恢复 |
| `sidepanel/` | 操作界面、两个 Free 分组、设置和工作流状态 |
| `shared/free-account-results.js` | `freeAccountResults` schema、分组、统计和旧结果迁移 |
| `shared/account-record-schema.js` | 账号规范模型与生命周期 |
| `shared/task-schema.js` | `register`、`refresh_access_token`、`fill_session`、`check_eligibility` 等任务类型 |
| `scripts/` | Node 单测、语法检查、静态审计、E2E 和发布工具 |
| `docs/audit/` | 故障索引、月度修复档案和验收记录 |
| `docs/history/` | 历史设计与实施结果，不作为当前规范 |

已删除的运行时目录和模块不得重新接入：`background/redeem/`、`background/steps/upi-redeem/`、CDK 路由、兑换刷新服务、Plus 验证服务、兑换服务和 Side Panel 卡密池/Plus 组件。

## V3 数据模型

规范结果存储键为 `freeAccountResults`，根对象使用 `schemaVersion: 3`。它保留：

- `items`；
- 运行进度、停止状态和更新时间；
- `eligibleCount`、`ineligibleCount`、`failedCount`、`checkingCount`、`unknownCount` 等派生统计。

账号分组只由 `trialEligibilityStatus` 决定：

```text
eligible | unknown | checking | failed -> free
ineligible                           -> free-ineligible
```

`free-ineligible` 是 UI/查询分组名，不应写入账号生命周期。账号规范模型的 `membershipStatus` 只允许 `unknown`、`free`。账号有效性由 `validityStatus` 独立保存，迁移和资格复检不得恢复已停用或无效账号。

## 配置与运行状态存储

`PERSISTED_SETTING_KEYS` 中的用户配置只以 `chrome.storage.local` 为权威来源。`background/bootstrap/state-store.js` 读取状态时必须剥离 Session 中遗留的持久配置键，再合并 Local；写状态时如果 patch 包含持久配置键，必须先调用 `setPersistentSettings()`，随后从 Session patch 中删除这些键。`resetState()` 同样只能把过滤后的运行状态写入 Session。

自定义邮箱池是旧版本兼容例外：读取历史 Session 时可把当前账号的较新运行字段合入 Local 的完整邮箱池，避免流程进度回退；新写入仍应持久化到 Local 并从 Session 剥离。当前节点、验证码请求时间、倒计时、标签页注册表和自动运行状态继续使用 Session。不同浏览器 Profile 或不同扩展 ID 的 Local 存储彼此隔离，不提供隐式跨 Profile 恢复。

每条结果可保留邮箱、密码、TOTP/Passkey、AT、注册最终步骤或补充任务读取的完整 ChatGPT Session、取件地址、启用状态、来源和资格证据。禁止重新加入 `redeemChannel`、`cdkey`、`redeemStatus`、`membershipChannel`、`paidChannels` 或 `redemption` 子树。

## 注册最终保存与资格复检

`workflowVersion: 3` 的三条注册路线都只有九个活动节点。原 `check-trial-eligibility` 执行器和 GCash API 客户端保留，但不进入 `getNodes()` / `getAllNodes()`，自动运行和手动节点列表都不会调度它。

1. 完整 2FA 和 Passkey 路线在第 9 步完成安全因子后调用 `upsertRegistrationResult()`。
2. 免 2FA 路线使用 `persist-no-2fa-free` 作为第 9 步，校验当前 Session/AT 与本轮邮箱一致后直接保存。
3. 三条路线统一写入 `trialEligibilityStatus: unknown` 和 `GCASH_ELIGIBILITY_DISABLED`，先持久化账号、AT/Session 与取件地址，再完成最终节点。
4. 存储失败必须保留当前登录现场且不得完成节点；保存成功后本轮立即结束，不再产生第 10 步。

单个/批量资格复检继续通过 `free-account-service.checkEligibility()` 调用 `/api/v1/check`。明确 `ineligible` 必须保存服务端原因、原因码和时间；网络超时、5xx、HTML 响应、字段缺失和账号不一致统一归为 `failed` 或结构化临时错误，账号保持在 Free。资格复检是独立任务，不得改写已完成注册工作流的节点状态。

新轮次只重置当前九步工作流节点，不清理上一账号的 V3 结果。第 9 步的 Side Panel 状态必须使用 Background 广播的权威节点图，避免跨轮高亮残留。v2 状态迁移必须删除旧资格节点；完整 2FA/Passkey 保留安全因子状态，免 2FA 把旧 `persist-no-2fa-free` 状态映射到新的第 9 步。

`freeAccountResults` 和规范账号都可能包含完整 Session。Chrome 的 `storage.local` 默认总容量有限，因此 Manifest 必须保留 `unlimitedStorage`；smoke audit 会拒绝移除该权限。`free-account-service.saveResults()` 将 `kQuotaBytes`、`QUOTA_BYTES` 和常见 quota 文案规范为 `FREE_ACCOUNT_STORAGE_QUOTA_EXCEEDED`，并标记需要保留当前注册现场。

`freeAccountResults.items` 必须经过 `sanitizeFreeAccountItem()` 的持久字段白名单。调用方可以传入运行状态用于资格判断，但账号行只允许身份、密码、2FA/Passkey、AT、完整 Session、取件地址、启用状态、来源、有效性和资格证据；严禁持久化 `freeAccountResults`、`accountRecordsV2`、日志、运行历史、邮箱池或 `runtimeState`。`freeAccountResultsV3CompactionCompleted` 负责对已经完成 V3 迁移但含错误嵌套字段的数据执行一次性压缩修复。

最终保存节点遇到结构化存储错误时，`getPostStep6AutoRestartDecision()` 必须返回当前步骤而不是认证链起点，并标记 `storage-quota`。节点图只把当前第 9 步恢复为 `pending`，不探测认证页，不修改免 2FA 第 7、8 步的 `skipped` 状态；有限重试耗尽后停止并保留账号。旧资格执行器的 `eligibility-transient` 分支继续保留给兼容测试和独立调用，但不再属于活动注册节点图。

手动节点前置检查必须同时遵守节点状态和 `applicability`。状态为 `pending` 的 `conditional` 节点在没有显式运行要求时不阻塞后续节点；当前唯一此类节点是 `existing-totp-login`。第 3 步检测到真实 TOTP 挑战时必须写入 `existingTotpLoginRequired=true`，Side Panel 与 Background 都继续阻止绕过第 4 步；未检测到挑战时，用户可直接执行免 2FA 第 9 步，Background 在执行前把被旁路的条件节点原子标为 `skipped`。最终账号保存节点不可人工跳过，自动运行锁定状态仍禁用所有手动节点操作。

## 结构化故障诊断

`sidepanel/failure-diagnostics.js` 在普通敏感信息脱敏前临时保护以 `::` 结尾的大写下划线错误码，例如 `SIGNUP_USER_ALREADY_EXISTS::`。完成 Bearer、JWT、凭据标签、验证码、姓名、长令牌、数字和邮箱脱敏后再恢复错误码。新增错误码必须保持这一格式，并增加测试证明错误码可见而真实凭据仍被遮盖。

页面恢复器必须使用调用方传入的正式步骤号生成诊断文本。第 5 步资料提交后的 `user_already_exists` 统一说明邮箱已注册、当前轮结束并排除邮箱；第 4 步及其它调用保持各自步骤号。账号排除、自动切换下一轮和跳过失败策略由 Background 继续裁决，诊断层不得改变业务状态。

## Free 账号消息接口

当前公开消息为：

- `GET_FREE_ACCOUNT_RESULTS`
- `IMPORT_FREE_ACCOUNT_RESULTS`
- `EXPORT_FREE_ACCOUNT_RESULTS`
- `DELETE_FREE_ACCOUNT_RESULTS`
- `CHECK_FREE_ACCOUNT_ELIGIBILITY`
- `LOGIN_FREE_ACCOUNT`
- `FILL_FREE_ACCOUNT_ACCESS_TOKENS`
- `REFRESH_FREE_ACCOUNT_ACCESS_TOKENS`
- `STOP_FREE_ACCOUNT_CHECK`
- `START_FILL_FREE_ACCOUNT_SESSIONS`
- `RESUME_FREE_ACCOUNT_SESSION_FILL`
- `STOP_FREE_ACCOUNT_SESSION_FILL`

不得恢复 `REDEEM_*`、`*_CDKEY_*`、`IDENTIFY_*_PLUS`、`VERIFY_*_PLUS` 或 `MOVE_*_GROUP`。资格复检任务使用 `check_eligibility`，任务 schema 不再接受 `redeem` 和 `verify_membership`。

Side Panel 在自动注册运行期间必须保持只读，仅允许查询和导出；所有会改写账号、AT 或资格状态的入口都要同时在 UI 和 Background 边界防止竞争。

## Session 补充任务

`fill_session` 是独立持久任务，不执行资格检查，也不改动 Free 分组。启动消息只接受 `group`、`includeVerificationUrl`、`onlyMissing` 和 `autoExport`；Background 自行从 `freeAccountResults` 读取凭据。任务 payload、checkpoint、result 和事件只允许保存分组、目标邮箱、完成/失败/跳过邮箱、下一索引、数量、文件名、下载 ID 和下载状态，禁止保存密码、AT、Session、Cookie、2FA、验证码或取件地址。

`GET_STATE` 和带 `state` 的设置响应属于轻量运行状态接口，不得携带完整 `freeAccountResults` 或 `accountRecordsV2`。它们只返回设置、工作流运行态和账号数量摘要；Free 账号明细必须通过 `GET_FREE_ACCOUNT_RESULTS` 按需读取。这样可以避免完整 Session 仓库超过 Chrome 单条运行时消息 `64 MiB` 上限，并防止账号数据增长拖垮每次侧栏初始化和保存响应。

任务使用现有 `login-session-executor` 和 Passkey 登录器串行登录。登录器通过 `reuseOrCreateTab(..., forceNew: true)` 创建替换标签页后关闭上一 ChatGPT/OpenAI 标签页族，因此任一时刻只保留一个受管登录标签页。每次成功必须同时满足：Session 非空、包含用户对象、包含 AT、Session 邮箱与目标邮箱一致。随后原子更新 `freeAccountResults`，并通过账号仓库同步完整 Session、同次 AT、`sessionUpdatedAt` 和 `accessTokenUpdatedAt`。

Session 服务边界必须规范化读取器响应：直接的 `/api/auth/session` 对象原样保留；无外层用户身份且包含 `ok`、`status`、顶层 AT/邮箱或内层身份的 `{ session: {...} }` 响应视为读取器外壳，最多递归解包三层。只保存解包后的接口对象，不把 transport 元数据写入账号记录。解包后仍执行用户、AT 和目标邮箱一致性校验。

账号级登录错误写入失败集合并继续；结果存储或规范账号写入失败属于任务级错误。每次成功后立即更新 checkpoint。Service Worker 启动恢复把活动任务标记为 `interrupted` 并释放锁；`RESUME_FREE_ACCOUNT_SESSION_FILL` 复用同一任务和 checkpoint，只处理仍缺完整 Session 的账号。停止同时设置任务取消状态和登录器停止标志，当前安全边界之前的成功记录不回滚。

`fill_session` 每次进入实际执行函数前必须调用 Background 提供的 `clearStopRequest()`，隔离上一轮自动注册留下的全局停止状态。底层 Free 服务也必须把全局 `throwIfStopped()` 抛出的停止错误规范化为 `FREE_ACCOUNT_CHECK_STOPPED`；这样新的停止信号属于任务级取消，不会在单账号 catch 中被吞掉并扩散成整批逐条失败。

自动导出调用现有 `credentialMode=session` TXT 格式化器，只选择 checkpoint 中本任务成功邮箱。文件内容只在 Background 内存和 `chrome.downloads.download` 的 data URL 参数中短暂存在，不写任务仓库或日志。任务结果只保存计数、文件名、下载 ID/状态；下载失败不删除账号 Session，成功数为 0 时不创建空文件。

任务面板轮询不仅刷新任务快照，也要在事件容器可见且存在当前任务 ID 时同步调用 `GET_ACCOUNT_TASK_EVENTS`。事件关闭、单条任务删除或批量清理后必须清除当前事件任务 ID，防止隐藏面板继续请求或异步响应重新打开已关闭面板。自动刷新只重绘内容，不重复执行外层 `scrollIntoView()`；渲染前若用户位于事件容器底部 `32px` 范围内，重绘后继续跟随最新事件，否则保留原滚动位置。

任务事件仓库保持每任务有界容量，但压缩时必须先保留错误级事件，再用最新普通事件填充剩余空间。旧的 `EVENTS_COMPACTED` 摘要不参与候选选择，其 `compactedCount` 要在后续压缩中累计，避免连续压缩后把早期失败原因或已丢弃数量重置。

## 导入导出

普通文本导入创建 `unknown` Free 记录，支持 `---`、制表符及受控历史分隔符。Passkey 标记支持恢复 `credentialId` 和可识别元数据。

V3 JSON 导入可恢复明确 `ineligible` 及其证据。输入中的 CDK、渠道、兑换和 Plus 字段必须在规范化阶段丢弃，不能进入持久化状态。

Free 与无资格 Free 分组独立导出为 UTF-8 `.txt`，每个账号一行并沿用 `---` 分隔格式，不得把 `freeAccountResults`、`schemaVersion` 或 `items` 外层对象序列化成下载文件。`credentialMode=access-token` 在凭据字段输出独立 AT；`credentialMode=session` 在同一字段输出完整 Session 的紧凑单行 JSON 文本并删除独立 AT 及其兼容别名。完整 2FA/Passkey 行保留邮箱、密码、安全因子标记、可选取件地址、凭据和时间；免 2FA 行不伪造密码或安全因子。旧记录缺少 Session 时返回 `missingSessionCount` 和脱敏邮箱列表。安全配置导出必须同时排除 AT 与完整 Session；敏感备份需要明确确认。

## 一次性迁移

`freeAccountToolV3MigrationCompleted` 是持久迁移标记。迁移顺序：

1. 读取旧结果、账号记录、任务和自定义邮箱池。
2. 规范化旧 Free/失败行，丢弃 `paid` 行。
3. 合并账号生命周期和邮箱池中的明确无资格证据。
4. 清理账号的 Plus 分类、渠道、`redemption` 数据，保留身份、凭据、有效性和历史。
5. 删除旧 `redeem`、`verify_membership` 任务。
6. 原子写入 `freeAccountResults`、清理后的账号记录、任务和迁移标记。
7. 写入成功后再删除旧结果键、CDK 池别名、usage 和兑换配置。

写入失败不得删除旧键或写迁移标记，下次 Service Worker 启动必须重试。迁移和安全脱敏模块可以识别历史 CDK/Plus 字段，但当前运行时不得使用这些字段执行业务。

V3 主迁移标记已经存在时仍要检查 `freeAccountResultsV3CompactionCompleted`。若账号行含非白名单字段，迁移器规范化并原子重写结果后再写压缩标记；写入失败保留原始结果并在下次启动重试。

## 测试策略

### 状态写入性能

`backgroundStateStore.setState()` 必须区分运行态更新和普通字段更新。只有 `flowId`、`runId`、当前节点、节点状态、共享运行字段或流程字段发生变化时，才允许读取当前完整 Session 并重建 `runtimeState`；日志、倒计时之外的普通数据 patch 应直接写实际字段，不得附带完整运行态。

后台日志追加只读取 `chrome.storage.session` 的 `logs` 键，不得调用聚合 `getState()`。后者还会读取 Local 中的 Free 结果、规范账号、运行历史和持久配置，账号数据增大后会把每条日志变成高成本全状态读取。回归测试必须同时证明普通日志 patch 不触发 `storage.session.get(null)`，而节点更新仍读取并保留已有节点状态。

### 设置保存与恢复

设置保存按钮必须显式绑定 `saveSettings({ force: true })`。`settings-card` 的普通 `input` 使用防抖保存，`change` 事件立即保存，避免没有专用监听器的控件只修改 DOM 而不进入 Background。所有保存请求通过同一 Promise 队列串行执行；保存期间出现的新 revision 必须由下一次队列任务重新采集完整表单，不能让旧响应清除新 dirty 状态。

`applySettingsState()` 是首次打开、页面重载和保存响应的完整 UI 恢复边界。新增持久设置时必须同时更新完整恢复和运行时 `DATA_UPDATED` 增量恢复；至少覆盖自动重试、Cookie 清理、自动延迟、线程间隔、步间隔、操作延迟和 OAuth 总超时。浏览器 E2E 必须通过真实输入与“保存”按钮写入 Local，再重载侧栏验证控件值，而不能只调用 `SAVE_SETTING` 消息证明 Background 有值。

测试使用 Node 内置 `node:test` 和 `node:assert/strict`。功能修改至少覆盖相应单测；共享数据模型、迁移、任务或用户主流程修改应运行完整门禁。

V3 回归重点：

- 三套旧卡密池、别名、usage、旧任务和 Plus 行迁移清理；
- 账号凭据、有效性和明确无资格证据保留；
- `eligible`、`unknown`、`checking`、`failed`、`ineligible` 分组；
- 三条九步路线、第 9 步保存 `unknown`、自动注册不调用资格接口，以及手动复检跨分组移动；
- 单个/批量复检跨分组移动，临时失败不进入无资格组；
- 文本导入、V3 JSON 导入、AT/Session 两种分组导出和删除；
- 120 条虚构账号导入、缺 Session 统计、逐账号 Session/AT 同步落库、邮箱不匹配继续下一条；
- `fill_session` 停止、任务级存储失败、启动立即返回、checkpoint 脱敏、Background 自动下载和中断续跑；
- Side Panel 只有两个 Free 分组，运行中只读；
- 源码、HTML、Manifest 和配置导出中没有卡密池、兑换按钮或 Plus 分组接口。
- Local 持久配置覆盖旧 Session 默认值，状态更新同步配置到 Local，流程重置不把配置副本重新写回 Session；自定义邮箱池兼容合并仍保留当前账号的新状态。

完整门禁：

```powershell
npm run syntax
npm test
npm run docs:check
npm run audit
npm run e2e
```

`npm run audit` 已包含文档结构、V3 Smoke、已移除网络和 Phone/SMS 审计。发布前不得只运行定向测试代替完整门禁。

## 浏览器 E2E

MV3 E2E 必须使用 Puppeteer 下载并锁定版本的 Chrome for Testing、`pipe: true` 和全新临时 Profile。不得连接用户安装的 Chrome、默认 `User Data`、登录态、Cookie 或其它扩展，也不得回退 Edge、系统 Chrome 或 Playwright Chromium。

结果必须打印实际产品/版本、可执行文件来源和 Profile 类型。最低验证范围：

- MV3 Service Worker 可启动；
- Side Panel 成功渲染且只有两个 Free 分组；
- 账号和任务控件存在；
- 两个分组的补充 Session 控件存在；
- 运行时消息可用；
- 页面本地剪贴板 stub 可完成诊断导出；
- 无未捕获页面错误；
- `finally` 关闭浏览器并确认没有测试进程残留。

## 安全与权限

`cha.nerver.cc` 仍用于资格检测、2FA 和 Passkey 登录。`chong.nerver.cc` host permission 与对应 DNR 规则已删除。权限调整必须基于真实调用方，不能为减少权限破坏邮箱、认证、Cookie、下载或资格流程。

日志、测试夹具和文档不得保存真实邮箱、密码、Access Token、TOTP、Passkey 私密材料、验证码、Cookie、API Key、代理或敏感 URL 参数。迁移测试只使用假数据。

## 文档生命周期

`README.md`、`docs/USER_GUIDE.md`、`docs/DEVELOPMENT.md`、`CHANGELOG.md` 和 `docs/audit/issue-fix-index.md` 是当前入口。行为变更必须在同一个提交更新受影响的当前文档。

已确认缺陷必须在同一个提交追加到当月 `docs/audit/issue-fix-archive-YYYY-MM.md`，并在索引加入稳定锚点。历史设计和实施结果追加到现有 `docs/history/` 月度文件，不建立单独计划或发布说明文档。

完成前必须运行：

```powershell
npm run docs:check
```

文档审计检查允许的 Markdown 路径、相对链接、Manifest/CHANGELOG 版本、历史免责声明及问题索引/档案锚点一致性。

## 发布流程

1. 确认 `manifest.json`、`package.json`、Side Panel 标题和 CHANGELOG 版本一致。
2. 运行完整五道门禁。
3. 检查发布包白名单和敏感数据排除规则。
4. 运行 `npm run package`。
5. 只发布构建出的脱敏 ZIP，不打包测试浏览器、文档、日志或本地配置。

当前源码目录若没有 `.git`，不要伪造提交或发布状态；应如实记录可运行的命令和环境限制。
