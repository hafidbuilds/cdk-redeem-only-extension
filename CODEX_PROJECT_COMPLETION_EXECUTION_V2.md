# Codex 执行任务书：补全 CDK Redeem Only 项目架构

> 文档整理说明（2026-07-26）：本任务书中的新增文档路径只代表职责建议。当前使用说明统一在 `docs/USER_GUIDE.md`，架构、权限、测试和发布规范统一在 `docs/DEVELOPMENT.md`，版本说明统一在 `CHANGELOG.md`，故障与阶段记录统一在 `docs/audit/`，历史计划统一在 `docs/history/`。不得为了匹配下文的旧文件名重新建立重复 Markdown 文档。

> 适用项目：`cdk-redeem-only-extension` / `CDK Redeem Only V1.0.14`
>
> 参考项目：`https://github.com/asz798838958/freeAgentIdentity`
>
> 执行方式：在当前项目仓库根目录直接实施，不要只输出建议或示例代码。
>
> 核心原则：只借鉴参考项目的架构思想，不复制其 AGPL-3.0 源代码；保持本项目为可直接加载的 Chrome Manifest V3 扩展。

---

## 0. 给 Codex 的直接指令

你现在是此仓库的主开发者。请完整阅读本任务书、仓库根目录的 `AGENTS.md`、`manifest.json`、`package.json`，以及：

```text
docs/DEVELOPMENT.md
docs/audit/project-completion-report.md
```

然后在当前仓库中直接完成改造。

不要只给出分析、计划、补丁示例或伪代码。必须实际创建和修改文件、补充测试、运行验证命令，并在最后给出完成报告。

执行时遵守以下规则：

1. 不询问用户是否继续，按阶段自动推进。
2. 不将项目改成 FastAPI、React、Electron、Docker 或依赖本地数据库的系统。
3. 不复制参考项目源代码，只自行实现相同类别的架构能力。
4. 不删除现有旧存储键；先通过兼容层逐步迁移。
5. 不改变 UPI、IDEAL、PIX 三个渠道的现有业务含义。
6. 不改变现有 Free/Plus 导出字段顺序。
7. 不重写已稳定的注册、验证码和登录流程，除非接入任务 ID 或统一账号写入口所必需。
8. 每完成一个阶段就运行定向测试；所有阶段完成后运行全量测试。
9. 遇到现有代码和本文档不完全一致时，以现有业务测试、现有兼容行为和更安全的处理方式为准。
10. 对远端请求状态无法确认时必须 fail closed，尤其禁止重复提交 CDK。
11. 所有测试数据必须为虚构数据，禁止写入真实邮箱、密码、Token、Cookie、API Key、CDK 或代理。
12. 不在大入口文件中继续堆代码；新逻辑必须放入职责明确的小模块。

---

## 1. 项目现状基线

这是一个原生 JavaScript 的 Chrome Manifest V3 扩展，主要目录包括：

```text
background.js
background/
content/
sidepanel/
shared/
scripts/
docs/
manifest.json
```

项目已经具备以下能力：

- 邮箱账号池；
- 多种邮箱 Provider；
- 自动注册；
- 验证码获取；
- 密码和 2FA；
- Access Token 获取和刷新；
- 会员资格和状态核验；
- UPI、IDEAL、PIX 三个独立 CDK 兑换渠道；
- 批量兑换；
- Free 与各渠道 Plus 分组；
- 设置导入导出；
- 大量 Node 单元测试和静态审计。

当前已验证的测试基线：

```text
node --test scripts/test-*.cjs
```

结果：

```text
312 tests passed
0 failed
```

当前 `scripts/audit-smoke-tests.mjs` 中存在的真实代码体积问题：

```text
sidepanel/sidepanel-app-controller.js
当前约 7909 行，要求不超过 7850 行

background/steps/upi-redeem/free-entry.js
当前约 603 行，要求不超过 580 行

background/steps/upi-redeem/channel-submission.js
当前约 1932 行，要求不超过 1900 行
```

如果当前工作目录来自压缩包而不是 Git 仓库，审计中的 `git ls-files` 相关失败属于环境问题；在真正 Git 仓库中必须正常通过。

项目当前最主要的问题不是缺少兑换功能，而是：

- 同一账号数据散落在多个存储中；
- 缺少唯一账号 Repository；
- 缺少统一任务、事件、资源锁和恢复机制；
- Provider 配置仍有较多硬编码；
- 账号按钮规则分散在多个 UI 模块；
- 普通备份和敏感备份没有严格分级；
- 缺少标准 npm 脚本和持续集成；
- 核心编排文件继续膨胀。

---

## 2. 总体完成目标

在保持现有产品形态和业务兼容的前提下，完成以下十项架构能力：

1. **唯一账号记录**：所有规范账号状态通过 `AccountRepository` 读取和写入。
2. **统一任务系统**：注册、补 AT、会员核验和兑换均拥有 `taskId`、状态、事件、checkpoint、取消和恢复策略。
3. **资源锁**：同一账号和同一 CDK 不得被并发任务重复使用。
4. **Provider Definition**：Provider 的配置字段、能力、校验和健康检查由元数据描述。
5. **统一账号操作策略**：按钮是否可用及其原因全部由统一策略函数返回。
6. **安全配置迁移**：V1 配置可迁移到 V2，普通备份默认不包含敏感凭证。
7. **验证码源契约**：所有邮箱和人工验证码来源使用统一等待、超时、新鲜度及去重协议。
8. **工作流版本和幂等账本**：任务绑定准确的流程定义版本，外部副作用可确认、可查询且不可盲目重复。
9. **自适应限流与人工处理队列**：远端限流、连续失败和未知结果有冷却、熔断及人工处置机制。
10. **MV3 生命周期与诊断安全**：存储访问边界、Service Worker 恢复、权限最小化和脱敏诊断包可验证。

完成后项目仍然必须：

- 使用原生 HTML、CSS 和 JavaScript；
- 使用 `chrome.storage.local` 和 `chrome.storage.session`；
- 可在 `chrome://extensions` 中直接加载；
- 不要求用户运行 Python、Node 服务或数据库；
- 保持 MIT 项目自身代码许可，不引入许可不兼容的复制代码。

---

## 3. 不可回归的业务规则

以下规则优先级最高，任何改造都不得破坏：

1. `upi`、`ideal`、`pix` 是三个独立规范渠道。
2. 三个渠道的 CDK 池、已使用记录、资格、失败次数、日限额和 Plus 分组互不覆盖。
3. 旧 `pixRedeem*` 字段只作为历史 UPI 兼容输入，不得解释为新的 PIX 渠道数据。
4. 新 PIX 规范字段继续使用现有 `pixChannelRedeem*` 语义。
5. “一键兑换全部”必须先显示渠道选择弹窗。
6. 一次“全部兑换”只能执行用户选中的一个渠道。
7. 不得自动串行尝试或回退到其他兑换渠道。
8. 同一账号同一时间不得被两个兑换任务占用。
9. 同一 CDK 同一时间不得被两个提交任务占用。
10. CDK 已提交但远端结果未知时，重启后必须先查询远端状态，不得盲目重新提交。
11. 网络错误、超时和远端 5xx 不得直接清除 Access Token。
12. 只有远端明确确认 Token 无效，并且刷新失败后，才允许清除旧 Token。
13. `account_deactivated`、`Authentication Error` 或明确删除/停用结果，应停止重试、保留账号记录并禁止继续兑换。
14. Free 和 Plus 当前文本导出格式必须保持兼容。
15. 现有流程继续使用 `activeFlowId`、`nodeId` 和 workflow 定义驱动。
16. 不用固定数字步骤替代 `nodeId`。
17. 迁移过程中不得静默丢失旧账号、历史、会员结果或渠道状态。
18. 删除账号的 tombstone 和现有手动移动行为必须保持兼容。

---

## 4. 目标架构

目标调用方向：

```text
Sidepanel UI
  -> Sidepanel Controller / Renderer
  -> Background Routes
  -> Application Services
  -> Repository / Registry / Existing Workflow Services
  -> chrome.storage / Remote API
```

职责约束：

- `background.js` 只负责脚本装载、依赖装配和 Chrome 事件注册。
- `background/routes/` 只负责消息输入校验、调用服务和返回结果。
- Repository 只负责数据规范化和持久化，不负责 UI 文案。
- Sidepanel 不直接拼接多个旧存储形成账号业务真相。
- Renderer 只渲染策略结果，不自行实现资格、Token、渠道或注销判断。
- Task Event 用于追踪，不作为账号最终业务状态来源。
- Provider Definition 只描述字段和能力，不直接实现网络请求。

---

# 阶段 0：修复工程基线并建立统一命令

## 0.1 修复当前三个体积审计失败

必须通过职责拆分减少以下文件行数，而不是简单提高阈值：

```text
sidepanel/sidepanel-app-controller.js <= 7850
background/steps/upi-redeem/free-entry.js <= 580
background/steps/upi-redeem/channel-submission.js <= 1900
```

建议优先抽取：

```text
sidepanel/account-overview-controller.js
sidepanel/provider-settings-orchestrator.js
background/steps/upi-redeem/free-entry-policy.js
background/steps/upi-redeem/submission-request-builder.js
background/steps/upi-redeem/submission-result-mapper.js
background/steps/upi-redeem/submission-error-policy.js
```

实际模块名可根据现有代码调整，但必须做到：

- 抽出的函数有明确职责；
- 不复制原逻辑形成两套实现；
- 脚本加载顺序正确；
- 原测试行为不变；
- 不提高审计阈值掩盖问题。

## 0.2 增加 npm scripts

修改根目录 `package.json`，至少加入：

```json
{
  "scripts": {
    "test": "node --test scripts/test-*.cjs",
    "audit": "node scripts/audit-smoke-tests.mjs && node scripts/audit-no-removed-network.mjs && node scripts/audit-no-phone-sms.mjs",
    "check": "npm run syntax && npm run test && npm run audit",
    "syntax": "node scripts/check-syntax.mjs",
    "package": "node scripts/build-release.mjs"
  }
}
```

如果现有脚本名不同，请先检查并复用；缺失的脚本再创建。

`check-syntax.mjs` 应检查所有受版本控制的 `.js`、`.mjs`、`.cjs` 文件，并对单个失败给出文件名。

## 0.3 增加 CI

创建：

```text
.github/workflows/ci.yml
```

至少执行：

```text
npm ci
npm run syntax
npm test
npm run audit
git diff --check
```

如果项目没有 lockfile，生成与当前依赖兼容的 `package-lock.json`。

## 阶段 0 验收

- [ ] 原有 312 项测试全部通过；测试数量增加是允许的。
- [ ] 三个文件均回到现有体积阈值以内。
- [ ] 不修改体积阈值来绕过问题。
- [ ] `npm run syntax` 可运行。
- [ ] `npm test` 可运行。
- [ ] `npm run audit` 在 Git 仓库环境中可运行。
- [ ] CI 文件语法正确。

---

# 阶段 1：AccountRecordV2 与只读兼容

## 1.1 创建账号规范模块

创建或按现有命名风格调整：

```text
shared/account-record-schema.js
shared/account-status-policy.js
background/accounts/account-repository.js
background/accounts/account-migration.js
background/accounts/account-compatibility-adapter.js
background/accounts/account-lifecycle-service.js
background/routes/account-v2-routes.js
```

不得机械创建空文件；每个模块必须有真实职责和测试。

## 1.2 规范存储键

使用：

```text
accountRecordsV2
```

建议根结构：

```javascript
{
  schemaVersion: 2,
  items: {
    "normalized@example.com": AccountRecord
  },
  updatedAt: ""
}
```

账号记录至少包含：

```javascript
{
  schemaVersion: 2,
  id: "normalized@example.com",
  identity: {
    type: "email",
    email: "normalized@example.com",
    source: "custom-pool",
    providerId: ""
  },
  credentials: {
    password: "",
    totpSecret: "",
    accessToken: "",
    accessTokenStatus: "missing",
    accessTokenUpdatedAt: ""
  },
  lifecycle: {
    validityStatus: "unknown",
    eligibilityStatus: "unknown",
    membershipStatus: "unknown",
    membershipChannel: "",
    reasonCode: "",
    reason: "",
    checkedAt: ""
  },
  redemption: {
    upi: {},
    ideal: {},
    pix: {}
  },
  workflow: {
    lastTaskId: "",
    lastNodeId: "",
    lastRunStatus: ""
  },
  metadata: {},
  createdAt: "",
  updatedAt: ""
}
```

## 1.3 统一账号 ID

账号 ID 由共享函数统一生成：

```javascript
normalizeAccountId(email)
```

规则：

- trim；
- 转小写；
- 非法或空邮箱不生成账号；
- 所有模块禁止自行重复实现邮箱 ID 规则。

## 1.4 状态必须拆维度

至少支持：

```text
validityStatus:
unknown / valid / invalid / deactivated

eligibilityStatus:
unknown / checking / eligible / ineligible / failed

membershipStatus:
unknown / free / plus / expired

accessTokenStatus:
missing / validating / valid / invalid / refreshing
```

禁止用一个总 `status` 同时表达账号有效性、会员、Token 和兑换状态。

每个渠道使用相同字段结构：

```javascript
{
  status: "idle",
  eligibilityStatus: "unknown",
  eligibilityReason: "",
  cdkey: "",
  remoteJobId: "",
  remoteStatus: "",
  failureCount: 0,
  dailyLimitBlockedAt: "",
  dailyLimitBlockedUntil: "",
  lastAttemptAt: "",
  lastErrorCode: "",
  lastError: ""
}
```

渠道状态允许值：

```text
idle / blocked / queued / submitting / pending / succeeded / failed / canceled
```

## 1.5 只读迁移

从以下旧数据源构造 V2：

```text
customEmailPoolEntries
accountRunHistory
upiCredentialMembershipCheckResults
upiAccountCredentialBackups
现有 CDK 使用记录
Free / UPI Plus / IDEAL Plus / PIX Plus 相关状态
```

要求：

- 迁移幂等；
- 不删除旧键；
- 不修改输入对象；
- 冲突时优先合法、信息更完整且 `updatedAt` 更新的记录；
- 保留三个渠道的独立状态；
- 旧 `pixRedeem*` 仅映射到 UPI 兼容数据；
- 非法记录不产生幽灵账号；
- 迁移失败不得破坏旧数据。

## 1.6 Sidepanel 只读接入

让账号列表可以消费 V2 只读模型，但阶段 1 暂时保留旧写路径。

必须使用对照测试证明：

- 账号数量一致；
- Free/Plus 分组一致；
- 渠道归属一致；
- 删除 tombstone 行为一致；
- 导出选择一致。

## 阶段 1 必须增加的测试

```text
scripts/test-account-record-schema.cjs
scripts/test-account-migration.cjs
scripts/test-account-status-policy.cjs
scripts/test-account-v2-read-model.cjs
```

至少覆盖：

- 邮箱标准化；
- 重复账号合并；
- 空记录过滤；
- 三渠道隔离；
- 旧 UPI 别名；
- Free 不等于 invalid；
- deactivated 保留记录；
- 迁移执行两次结果不变。

## 阶段 1 验收

- [ ] 同一邮箱最终只生成一个 ID。
- [ ] Sidepanel 可从 V2 模型渲染账号。
- [ ] 旧写路径尚未被破坏。
- [ ] 不删除旧存储。
- [ ] 对照测试全部通过。

---

# 阶段 2：AccountRepository 成为唯一账号写入口

## 2.1 Repository API

至少提供：

```javascript
getAccount(accountId)
getAccounts()
upsertAccount(record, context)
patchAccount(accountId, patch, context)
deleteAccount(accountId, context)
markAccountDeleted(accountId, context)
updateLifecycle(accountId, lifecyclePatch, context)
updateCredentials(accountId, credentialPatch, context)
updateRedemption(accountId, channel, redemptionPatch, context)
```

所有写操作必须：

- 校验输入；
- 标准化账号 ID；
- 更新时间；
- 保存稳定 `reasonCode`；
- 避免丢失其他渠道字段；
- 失败时返回结构化错误；
- 不把密码、Token、2FA Secret 写入日志。

## 2.2 迁移现有写路径

以下动作必须改为通过 Repository：

- 注册完成；
- 密码或 2FA 更新；
- Access Token 写入、验证、刷新和清除；
- 资格检测；
- 会员核验；
- UPI 兑换结果；
- IDEAL 兑换结果；
- PIX 兑换结果；
- 手动移动分组；
- 删除账号和 tombstone；
- 恢复历史账号。

## 2.3 兼容投影

尚未迁移完成的旧模块通过：

```text
background/accounts/account-compatibility-adapter.js
```

读取或接收旧结构投影。

禁止同一个业务动作：

1. 先直接写旧存储；
2. 再直接写 `accountRecordsV2`。

必须只写 Repository，由兼容层决定是否投影旧结构。

## 2.4 生命周期规则

必须集中实现：

- 网络错误不等于 Token 无效；
- 5xx 不等于 Token 无效；
- 明确 401 或等价结果才可标记 invalid；
- 刷新后的新 Token 必须核验账号归属；
- 新 Token 未验证前不得覆盖旧 Token；
- deactivated 停止重试并禁止兑换；
- Free 是会员状态，不是账号有效性状态；
- 缺 AT 和 AT invalid 是不同状态。

## 阶段 2 必须增加的测试

```text
scripts/test-account-repository.cjs
scripts/test-account-lifecycle-service.cjs
scripts/test-account-compatibility-adapter.cjs
scripts/test-account-repository-write-boundary.cjs
```

增加静态审计：

- 只有 `account-repository.js` 可以直接写 `accountRecordsV2`；
- Sidepanel 不能直接写 `accountRecordsV2`；
- 业务模块不能绕过 Repository。

## 阶段 2 验收

- [ ] 规范账号写入全部经过 Repository。
- [ ] 搜索生产代码时，没有其他模块直接写 `accountRecordsV2`。
- [ ] 三渠道更新不会互相覆盖。
- [ ] Token 生命周期规则测试通过。
- [ ] 旧 UI 和旧导出继续工作。

---

# 阶段 3：统一任务、事件、资源锁和恢复

## 3.1 创建模块

```text
shared/task-schema.js
background/tasks/task-repository.js
background/tasks/task-event-store.js
background/tasks/task-lock-manager.js
background/tasks/task-recovery-policy.js
background/tasks/task-runtime.js
background/routes/task-routes.js
sidepanel/task-event-view-model.js
sidepanel/task-event-renderer.js
```

## 3.2 存储键

```text
accountTasksV1
accountTaskEventsV1
```

任务至少包含：

```javascript
{
  taskId: "task_<timestamp>_<random>",
  type: "register",
  accountId: "",
  channel: "",
  status: "pending",
  nodeId: "",
  progress: { current: 0, total: 0 },
  resourceKeys: [],
  checkpoint: {},
  payload: {},
  result: {},
  errorCode: "",
  error: "",
  cancelRequested: false,
  createdAt: "",
  startedAt: "",
  updatedAt: "",
  finishedAt: ""
}
```

任务类型至少包括：

```text
register
refresh_access_token
verify_membership
redeem
provider_health_check
```

任务状态至少包括：

```text
pending
running
waiting_remote
cancel_requested
canceled
succeeded
failed
interrupted
```

事件结构至少包括：

```javascript
{
  eventId: "",
  taskId: "",
  type: "state",
  level: "info",
  code: "",
  nodeId: "",
  message: "",
  detail: {},
  createdAt: ""
}
```

## 3.3 事件安全

事件中禁止出现：

```text
password
完整 accessToken
cookie
2FA secret / totpSecret
API key
完整 CDK
代理密码
```

统一实现脱敏器，例如：

```text
shared/sensitive-data-redactor.js
```

所有任务事件、错误详情、状态广播和普通日志复用同一个脱敏器。

保留策略：

- 每个任务默认最多 100 条详细事件；
- 超出后压缩早期事件为摘要；
- 默认保留最近 100 个已完成任务；
- running、waiting_remote、cancel_requested 任务不得清理。

## 3.4 资源锁

至少支持：

```text
account:<accountId>
cdkey:<channel>:<normalizedCdkey>
auth-tab:<tabId>
mailbox:<providerId>:<mailboxId>
```

规则：

- 活动资源一次只能属于一个任务；
- 终态后释放；
- Service Worker 恢复时根据活动任务重建锁；
- 不得仅按超时时间盲目删除锁；
- 获取不到账号锁或 CDK 锁时等待、跳过或返回冲突，不得抢占；
- 一个渠道的锁不得污染另一个渠道。

## 3.5 接入现有业务

以下运行必须生成 taskId：

- 自动注册；
- 补 Access Token；
- 会员核验；
- 单账号兑换；
- 批量兑换；
- Provider 健康检查。

现有 `accountRunHistory` 逐步变为任务和事件的兼容视图，不再作为新的业务真相来源。

## 3.6 checkpoint 与恢复策略

至少保存以下 checkpoint：

- 当前 `activeFlowId`；
- 当前 `nodeId`；
- 账号 ID；
- 渠道；
- 是否已获取账号锁；
- 是否已获取 CDK 锁；
- CDK 是否尚未提交；
- 远端请求是否已发出；
- 远端 jobId；
- 远端状态；
- 是否已更新会员状态；
- 是否已移动 Plus 分组。

恢复规则：

1. 尚未产生外部副作用的安全节点可以重跑。
2. CDK 尚未提交时可以恢复到提交前。
3. CDK 请求可能已发出但本地无响应时，必须先使用已有标识查询远端。
4. 远端明确成功后，只能继续会员确认和本地落盘，不得重新提交。
5. 无法证明安全恢复时标记 `interrupted`，允许人工重试。
6. deactivated 任务直接失败，不自动恢复。
7. 取消只阻止新的副作用；已经提交的远端请求仍须查询最终结果。
8. 任务终态后再释放锁。

## 3.7 Sidepanel 任务查看

在现有侧栏增加紧凑任务列表或任务详情区域，不必重写整个 UI。

至少显示：

- 任务类型；
- 邮箱或账号；
- 渠道；
- 当前节点；
- 进度；
- 状态；
- 最后错误；
- 创建和更新时间；
- 取消、重试、查看事件操作。

事件必须按 `taskId` 隔离，不得混入其他任务日志。

## 阶段 3 必须增加的测试

```text
scripts/test-task-schema.cjs
scripts/test-task-repository.cjs
scripts/test-task-event-store.cjs
scripts/test-task-lock-manager.cjs
scripts/test-task-recovery-policy.cjs
scripts/test-task-runtime.cjs
scripts/test-task-sensitive-redaction.cjs
```

必须模拟以下中断：

1. 注册邮箱提交前；
2. 验证码等待中；
3. AT 远端验证中；
4. AT 刷新完成但尚未保存；
5. CDK 尚未提交；
6. CDK 请求已发出但本地未收到响应；
7. 远端任务 pending；
8. 远端成功但本地尚未移动 Plus 分组；
9. 用户请求取消，但远端请求已提交；
10. 账号被标记为 deactivated。

每个场景断言：

- 能否重试；
- 能否重新提交外部请求；
- 是否保留账号；
- 是否保留或清理 AT；
- 是否释放锁；
- 最终进入哪个账号分组。

## 阶段 3 验收

- [ ] 注册、补 AT、核验和兑换均有 taskId。
- [ ] 同账号不能并发兑换。
- [ ] 同 CDK 不能并发提交。
- [ ] 模拟重启不会重复提交 CDK。
- [ ] 事件不泄露敏感信息。
- [ ] 任务列表和事件查看可用。

---

# 阶段 4：Provider Definition 和统一健康检查

## 4.1 创建模块

```text
shared/provider-definition-schema.js
background/providers/provider-definition-registry.js
background/providers/provider-settings-service.js
background/providers/provider-health-service.js
background/routes/provider-routes.js
sidepanel/provider-settings-controller.js
sidepanel/provider-settings-renderer.js
```

## 4.2 Provider 定义结构

每个 Provider 至少声明：

```javascript
{
  id: "provider-id",
  label: "Provider Name",
  kind: "mail-provider",
  category: "api-mail",
  capabilities: [
    "generate-email",
    "poll-code",
    "health-check"
  ],
  fields: [],
  customUiKey: "",
  healthCheckCommand: "",
  enabled: true
}
```

字段至少支持：

```text
text
password
number
checkbox
select
textarea
url
```

字段定义至少支持：

```text
key
label
type
category
required
secret
defaultValue
placeholder
options
min
max
```

## 4.3 普通与复杂 Provider

- 普通 API Provider 使用通用表单。
- iCloud、Hotmail、2925 等复杂交互允许保留专用 UI。
- 专用 UI 仍必须通过统一 settings service 保存和校验。
- Provider Definition 不承载网络实现。
- 新增普通 Provider 不应再修改通用保存函数和大段 HTML。

## 4.4 密钥处理

- 密钥字段不回显原值。
- UI 中空密钥表示保留旧值，不得覆盖为空字符串。
- 普通状态广播只返回 `configured: true/false` 或脱敏预览。
- “测试连接”使用当前表单值但不自动保存。
- 测试成功与失败都返回稳定错误码和可读信息。

## 4.5 渐进迁移

先选择一个结构相对简单的现有 Provider 完成全链路迁移，验证框架后再迁移其他普通 Provider。

复杂 Provider 不必为了追求统一而删除专用功能。

## 阶段 4 必须增加的测试

```text
scripts/test-provider-definition-schema.cjs
scripts/test-provider-definition-registry.cjs
scripts/test-provider-settings-service.cjs
scripts/test-provider-health-service.cjs
scripts/test-provider-secret-handling.cjs
```

## 阶段 4 验收

- [ ] 至少一个普通 Provider 完成定义驱动迁移。
- [ ] 新增同类 Provider 不需修改通用保存函数。
- [ ] 空密钥不会清除旧密钥。
- [ ] 连接测试不写入配置。
- [ ] 状态广播不包含原始密钥。
- [ ] 复杂 Provider 原有功能无回归。

---

# 阶段 5：统一账号操作策略和运营概览

## 5.1 创建统一操作策略

创建：

```text
sidepanel/account-records-action-policy.js
```

或者如果已有同名/近似模块，则合并为唯一实现。

导出：

```javascript
getAvailableAccountActions(account, runtimeContext)
```

返回示例：

```javascript
{
  refreshAccessToken: { enabled: true, reason: "" },
  checkEligibility: { enabled: true, reason: "" },
  redeemUpi: { enabled: false, reason: "缺少可用 UPI CDK" },
  redeemIdeal: { enabled: true, reason: "" },
  redeemPix: { enabled: false, reason: "PIX 渠道无资格" },
  login: { enabled: true, reason: "" },
  export: { enabled: true, reason: "" },
  delete: { enabled: true, reason: "" }
}
```

策略必须考虑：

- 账号有效性；
- deactivated；
- Access Token 状态；
- 当前活动任务和资源锁；
- 各渠道资格；
- 各渠道 CDK 可用数量；
- 各渠道日限额；
- 当前 membership；
- 当前选择和 UI 模式。

Renderer 只消费结果，不再次实现同一业务判断。

## 5.2 运营概览

创建：

```text
sidepanel/account-overview-view-model.js
sidepanel/account-overview-renderer.js
```

在现有 Sidepanel 中增加紧凑统计，不做营销式首页，也不要求 React。

至少显示：

- 账号总数；
- Free 数量；
- UPI Plus 数量；
- IDEAL Plus 数量；
- PIX Plus 数量；
- 缺 AT；
- AT 无效；
- deactivated；
- 正在运行；
- 等待远端结果；
- UPI 失败；
- IDEAL 失败；
- PIX 失败；
- 有资格但缺少对应渠道 CDK。

统计必须和账号列表使用同一个 V2 数据源。

点击统计卡片时筛选现有账号列表；可以清除筛选；不得创建第二份账号集合。

## 5.3 逐步删除重复判断

检查以下已有模块中的重复规则：

```text
sidepanel/account-records-redeem-policy.js
sidepanel/membership-row-policy.js
sidepanel/workflow-button-state.js
sidepanel/account-records-manager.js
sidepanel/account-records-*.js
```

将重复业务判断收敛到统一策略；兼容导出可以保留薄适配器，但不能保留两套事实逻辑。

## 阶段 5 必须增加的测试

```text
scripts/test-account-records-action-policy.cjs
scripts/test-account-overview-view-model.cjs
scripts/test-account-overview-filtering.cjs
```

## 阶段 5 验收

- [ ] 所有账号操作按钮均由 action policy 控制。
- [ ] 禁用按钮显示明确原因。
- [ ] 概览数字与账号列表一致。
- [ ] 点击统计可以筛选并恢复。
- [ ] Renderer 不再重复实现资格、AT、注销和渠道判断。
- [ ] 侧栏没有横向溢出或按钮遮挡。

---

# 阶段 6：配置迁移、敏感导出和有限并发

## 6.1 设置 schema V2

修改现有设置传输模块，建立迁移链：

```text
background/migrations/settings-v1-to-v2.js
background/migrations/settings-migrator.js
```

或者使用符合现有目录规范的路径。

要求：

- V1 可导入 V2；
- 迁移不修改原始输入对象；
- 迁移幂等；
- 未来未知版本明确拒绝；
- 迁移失败返回可读错误；
- 保留 UPI、IDEAL、PIX 三渠道数据；
- 保留旧 UPI 兼容字段读取能力。

## 6.2 三种导出模式

至少支持：

```text
settings-only
accounts-redacted
full-sensitive-backup
```

### settings-only

只导出非敏感运行配置，不包含：

- 密码；
- Access Token；
- 2FA Secret；
- Cookie；
- API Key；
- CDK；
- 代理密码；
- 完整任务日志。

### accounts-redacted

可包含账号结构和状态，但敏感值必须脱敏或清空。

### full-sensitive-backup

- 用户必须显式选择；
- UI 必须显示风险警告；
- 文件名包含 `SENSITIVE-BACKUP`；
- 不得通过默认按钮直接触发；
- 文档明确说明文件需离线安全保存。

## 6.3 发布包安全

审计发布包不得包含：

```text
本地账号导出
真实配置
任务日志
运行历史快照
Cookie
Token
密码
2FA Secret
真实 CDK 池
.env
```

## 6.4 有限并发

只允许对互不共享浏览器页面和邮箱资源的远端查询增加并发，例如：

- 多账号会员状态查询；
- 多账号 AT 有效性验证；
- Provider 健康检查。

默认并发 3，最大不超过 5。

以下必须保持串行或受资源锁互斥：

- 浏览器注册主流程；
- 同一邮箱或别名池；
- 同一账号登录；
- 同一账号 AT 刷新；
- 同一账号兑换；
- 同一 CDK 提交；
- “一键兑换全部”选定渠道后的账号分配。

## 阶段 6 必须增加的测试

```text
scripts/test-settings-schema-migrations.cjs
scripts/test-settings-export-modes.cjs
scripts/test-sensitive-data-redactor.cjs
scripts/test-limited-concurrency.cjs
scripts/test-release-sensitive-file-audit.cjs
```

## 阶段 6 验收

- [ ] V1 备份可迁移到 V2。
- [ ] 迁移两次结果一致。
- [ ] 普通备份不包含敏感字段。
- [ ] 敏感备份需明确选择并带警告。
- [ ] 并发不会造成重复账号操作。
- [ ] 并发不会导致跨渠道污染。
- [ ] 发布包不包含运行数据。


---

# 阶段 7：统一验证码源、邮件匹配和新鲜度保证

此阶段借鉴可插拔批量注册框架和验证码收件箱的职责拆分，但必须自行实现，不复制 GPL/AGPL 项目代码，也不得默认把邮件正文发送给任何 AI 服务。

## 7.1 创建统一验证码源契约

建议创建：

```text
shared/verification-code-source-schema.js
background/verification-code/source-registry.js
background/verification-code/mail-match-rule.js
background/verification-code/code-freshness-policy.js
background/verification-code/message-deduplicator.js
background/verification-code/wait-for-code-service.js
background/verification-code/manual-code-source.js
```

每个验证码源至少实现等价契约：

```javascript
{
  id: "qq-mail",
  capabilities: ["wait-code", "wait-link"],
  init(context) {},
  close(context) {},
  async waitForCode({
    taskId,
    accountId,
    email,
    flowId,
    baseline,
    notBefore,
    timeoutMs,
    abortSignal,
    matchRule
  }) {}
}
```

返回结果至少包含：

```javascript
{
  sourceId: "",
  messageId: "",
  fingerprint: "",
  receivedAt: "",
  sender: "",
  subject: "",
  category: "registration",
  code: "",
  link: ""
}
```

## 7.2 每个流程声明邮件匹配规则

邮件匹配规则必须由流程或站点适配器提供，不得散落在邮箱 Provider 内：

```javascript
{
  senderKeywords: [],
  subjectKeywords: [],
  codeRegex: "",
  linkPatterns: [],
  allowedCategories: ["registration"],
  maxAgeMs: 10 * 60 * 1000,
  clockSkewMs: 2 * 60 * 1000
}
```

至少支持以下类别：

```text
registration
login_code
password_reset
account_security
payment
other
```

默认注册任务只能接收 `registration` 类邮件；不得误用密码重置、安全告警或支付邮件中的验证码。

## 7.3 基线、新鲜度和去重

触发验证码邮件之前必须先记录邮箱基线：

```text
baselineMessageId
baselineReceivedAt
codeRequestedAt
```

规则：

1. 只接受基线之后出现的邮件。
2. 邮件时间必须不早于 `codeRequestedAt - clockSkewMs`。
3. 同一 `messageId` 或 `fingerprint` 只能被一个任务消费一次。
4. 相同验证码但不同邮件不得仅凭验证码文本判定重复。
5. 超时后返回稳定错误码，不得无限轮询。
6. 取消任务后必须立即停止轮询和网络请求。
7. 默认不删除邮件；只有 Provider 明确支持且用户设置允许时，才在验证码确认使用后标记已消费或删除。
8. 旧验证码、其他站点验证码和其他账号验证码必须被拒绝。
9. 人工输入验证码也必须经过相同超时、取消和任务归属检查。

## 7.4 等待状态进入任务 checkpoint

验证码等待期间至少保存：

```text
sourceId
mailboxId
baselineMessageId
codeRequestedAt
lastPolledAt
pollCount
seenFingerprints
```

Service Worker 恢复后允许继续等待，但不得重新触发发送验证码，除非流程节点明确允许并且重发次数未超限。

## 阶段 7 必须增加的测试

```text
scripts/test-verification-code-source-contract.cjs
scripts/test-mail-match-rule.cjs
scripts/test-code-freshness-policy.cjs
scripts/test-verification-message-deduplicator.cjs
scripts/test-wait-for-code-service.cjs
```

必须覆盖：

- 基线之前的旧验证码被拒绝；
- 发码后新验证码被接受；
- 相同邮件不会被两个任务消费；
- 密码重置验证码不会被注册流程使用；
- 超时、取消和 Service Worker 恢复；
- 人工验证码源和邮箱验证码源返回相同规范结构。

## 阶段 7 验收

- [ ] 所有验证码来源通过统一契约注册。
- [ ] 站点规则和邮箱 Provider 解耦。
- [ ] 不会使用基线之前的旧验证码。
- [ ] 不会跨账号或跨任务消费同一封邮件。
- [ ] 默认实现不向外部 AI 服务发送邮件正文。

---

# 阶段 8：工作流定义快照、节点执行策略和外部副作用幂等

当前项目已有 `workflowVersion` 字段，但任务恢复不能只依赖运行时最新代码。每个任务必须绑定创建时使用的准确流程定义和关键策略。

## 8.1 工作流定义版本

建议创建：

```text
shared/workflow-definition-schema.js
background/workflows/workflow-definition-registry.js
background/workflows/workflow-definition-hasher.js
background/workflows/workflow-migration-registry.js
background/workflows/node-execution-policy.js
```

任务新增：

```javascript
{
  workflowId: "",
  workflowDefinitionVersion: 1,
  workflowDefinitionHash: "sha256:...",
  workflowSnapshot: {
    nodeIds: [],
    transitions: {},
    nodePolicies: {}
  }
}
```

规则：

1. 新建任务时记录流程版本和确定性 hash。
2. 任务恢复必须使用原版本快照或明确的迁移器。
3. 扩展升级后如果原节点不存在，不得直接跳到同名或相邻节点。
4. 无安全迁移路径时进入 `manual_review`，不得猜测继续。
5. 工作流快照只能保存结构和非敏感配置，不能复制密码、Token、Cookie 或完整 CDK。
6. `activeFlowId`、`nodeId` 和版本 hash 必须同时进入 checkpoint。

## 8.2 节点执行策略

每个会运行的节点必须有明确策略：

```javascript
{
  timeoutMs: 30000,
  maxAttempts: 3,
  backoff: "exponential-jitter",
  retryableErrorCodes: [],
  onError: "stop",
  fallbackNodeId: "",
  sideEffect: "none"
}
```

`sideEffect` 至少支持：

```text
none
read_remote
write_local
write_remote
irreversible_remote
```

要求：

- 所有远端请求必须有超时；
- 重试次数必须有上限；
- 永久错误不重试；
- `irreversible_remote` 节点不得自动跳过；
- fallback 必须显式配置，禁止隐式切换渠道；
- 超时不能自动解释为失败或成功，只能根据副作用类型进入相应恢复策略。

## 8.3 外部副作用账本

建议增加存储键：

```text
externalEffectsV1
redeemAttemptsV1
```

副作用记录至少包含：

```javascript
{
  effectId: "",
  idempotencyKey: "",
  taskId: "",
  nodeId: "",
  type: "redeem_submit",
  resourceFingerprint: "",
  status: "prepared",
  remoteJobId: "",
  requestStartedAt: "",
  acknowledgedAt: "",
  confirmedAt: "",
  lastCheckedAt: "",
  errorCode: "",
  createdAt: "",
  updatedAt: ""
}
```

状态至少包括：

```text
prepared
dispatched
acknowledged
unknown
confirmed
failed
```

CDK 尝试记录至少包含：

```javascript
{
  redeemAttemptId: "",
  taskId: "",
  accountId: "",
  channel: "upi",
  cdkeyFingerprint: "",
  assignedAt: "",
  submittedAt: "",
  confirmedAt: "",
  remoteJobId: "",
  finalStatus: "",
  errorCode: ""
}
```

规则：

1. 在发送外部写请求之前，先原子保存 `prepared` 记录。
2. 请求开始时更新为 `dispatched`。
3. 收到远端 jobId 或明确受理信息后更新为 `acknowledged`。
4. 本地超时但无法确认结果时标记 `unknown`。
5. `unknown` 只能查询，不得重新提交。
6. 远端接口支持幂等键时，使用稳定的 `idempotencyKey`；不支持时仍必须使用本地账本和远端状态查询。
7. 完整 CDK 不写入事件和普通诊断；账本使用不可逆 fingerprint。
8. 同一账号、渠道、CDK fingerprint 的活动尝试必须唯一。
9. 任务重试必须复用原副作用记录，不得创建一个看似新任务来绕过防重。

## 8.4 稳定错误码

建立统一错误分类：

```text
VALIDATION_*
AUTH_*
ACCOUNT_*
PROVIDER_*
MAIL_*
RATE_LIMIT_*
REMOTE_*
REDEEM_*
TASK_*
STORAGE_*
PERMISSION_*
```

错误对象至少包含：

```javascript
{
  code: "REDEEM_REMOTE_STATUS_UNKNOWN",
  retryable: false,
  requiresManualReview: true,
  userMessage: "",
  technicalMessage: "",
  detail: {}
}
```

## 阶段 8 必须增加的测试

```text
scripts/test-workflow-definition-hash.cjs
scripts/test-workflow-version-recovery.cjs
scripts/test-node-execution-policy.cjs
scripts/test-external-effect-ledger.cjs
scripts/test-redeem-attempt-ledger.cjs
scripts/test-error-taxonomy.cjs
```

必须模拟：

- 扩展升级后节点顺序变化；
- 原节点被删除；
- 远端写请求发出前崩溃；
- 写请求发出后本地超时；
- 已拿到 remoteJobId 后重启；
- 用户点击重试；
- 同一 CDK 被第二个任务分配。

## 阶段 8 验收

- [ ] 每个任务绑定准确流程版本和 hash。
- [ ] 升级后不会按新流程盲目恢复旧任务。
- [ ] 所有远端副作用都有持久化账本。
- [ ] `unknown` 状态不会重新提交 CDK。
- [ ] 兑换尝试历史与当前账号状态分离。
- [ ] 错误码稳定且可用于重试和 UI 判断。

---

# 阶段 9：自适应限流、熔断、停止阈值和人工处理队列

批量操作不能只设置固定并发数。不同 Provider 和兑换渠道必须独立限流，连续失败时应停止扩大影响。

## 9.1 运行策略

建议创建：

```text
background/runtime/adaptive-throttler.js
background/runtime/retry-after-parser.js
background/runtime/circuit-breaker.js
background/runtime/batch-stop-policy.js
background/tasks/manual-review-queue.js
sidepanel/manual-review-view-model.js
sidepanel/manual-review-renderer.js
```

每个 Provider 或渠道支持：

```javascript
{
  maxConcurrency: 3,
  delayMinMs: 1000,
  delayMaxMs: 5000,
  requestTimeoutMs: 30000,
  maxAttempts: 3,
  stopOnConsecutiveErrors: 5,
  cooldownMs: 60000
}
```

## 9.2 Retry-After 和退避

规则：

1. 识别 HTTP `Retry-After` 的秒数和日期格式。
2. 429 或明确限流错误优先遵守远端等待时间。
3. 没有 `Retry-After` 时使用指数退避和随机抖动。
4. 等待状态必须持久化，Service Worker 重启后不能立即重放请求。
5. UPI、IDEAL、PIX 和各邮箱 Provider 分别维护限流状态。
6. 一个 Provider 被限流不得停止其他无关 Provider。
7. 网络断开和远端 5xx 可重试，但不得清除 Token 或账号。

## 9.3 熔断器

状态：

```text
closed
open
half_open
```

规则：

- 连续可归因于同一远端的错误达到阈值后打开熔断；
- 熔断打开时不发新请求，任务进入等待或人工处理；
- 冷却结束后只允许少量探测请求；
- 探测成功后关闭；失败则重新打开；
- 熔断状态要持久化，并显示作用范围和恢复时间；
- 账号注销、参数错误、CDK 无效等永久错误不计入远端可用性熔断。

## 9.4 人工处理队列

任务新增状态：

```text
manual_review
```

人工处理项至少包含：

```javascript
{
  reviewId: "",
  taskId: "",
  reasonCode: "",
  summary: "",
  evidence: {},
  allowedActions: [],
  createdAt: "",
  resolvedAt: ""
}
```

允许操作必须由策略明确控制，例如：

```text
query_remote_again
mark_failed
mark_confirmed
return_cdkey_to_pool
keep_cdkey_reserved
resume_from_checkpoint
```

禁止提供无条件“再次提交 CDK”按钮。

以下情况必须进入人工处理或 fail closed：

- CDK 请求可能已发出但远端无法查询；
- 流程版本无法安全迁移；
- 账号、CDK 或远端 jobId 出现冲突；
- 存储迁移发现无法自动解决的渠道数据冲突；
- 同一账号出现互相矛盾的成功与失败证据。

## 9.5 批量结果摘要

每次批量任务结束显示：

```text
总数
成功
明确失败
等待远端
人工处理
取消
跳过
限流等待
平均耗时
按错误码分组
```

## 阶段 9 必须增加的测试

```text
scripts/test-retry-after-parser.cjs
scripts/test-adaptive-throttler.cjs
scripts/test-circuit-breaker.cjs
scripts/test-batch-stop-policy.cjs
scripts/test-manual-review-queue.cjs
scripts/test-batch-result-summary.cjs
```

## 阶段 9 验收

- [ ] 429 会遵守 Retry-After。
- [ ] 连续远端错误会停止继续扩大批量请求。
- [ ] 熔断状态按 Provider/渠道隔离。
- [ ] 重启后冷却时间继续有效。
- [ ] 危险未知状态进入人工处理。
- [ ] 不存在无条件重复提交 CDK 的操作。

---

# 阶段 10：MV3 存储边界、Service Worker 生命周期、权限审计和诊断包

Chrome MV3 Service Worker 会被系统终止。任何只存在于全局变量中的运行状态都不可靠；扩展存储的默认访问范围也必须主动收紧。

## 10.1 限制存储访问范围

在 Background 启动阶段检查支持情况并设置：

```javascript
await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
```

要求：

1. Content Script 不得直接读取账号、Token、Cookie、API Key、2FA Secret 或 CDK 存储。
2. Content Script 需要数据时只能调用经过白名单校验的 Background Route。
3. Route 只返回完成当前页面动作所需的最小字段。
4. 敏感数据不得进入 `storage.sync`。
5. 临时运行敏感值优先放 `storage.session`；必须持久保存的值要明确记录原因并在导出中受保护。
6. 增加静态审计，禁止新 Content Script 直接访问敏感存储键。

## 10.2 Service Worker 生命周期设计

规则：

- 不依赖全局变量保存任务真相；
- 重要状态在产生副作用前持久化；
- Background 每次启动执行 hydrate、迁移检查、活动任务扫描和锁重建；
- `running` 任务不得一律重置为可重跑，必须根据节点副作用和账本决定状态；
- `chrome.alarms` 只用于到期唤醒和轮询调度，不作为保持 Service Worker 永久存活的技巧；
- 不使用空消息、死循环、频繁 alarm 或无业务意义的连接强行 keepalive；
- Offscreen Document 只在确实需要 DOM API 时使用，不得用于一般任务队列或伪 keepalive；
- 单次远端请求和节点执行必须低于明确超时，长任务拆为可恢复的短步骤。

如果实现依赖 Chrome 120 的 30 秒 alarm 周期，必须设置合适的 `minimum_chrome_version`；否则使用兼容当前目标版本的周期。

## 10.3 生命周期测试矩阵

Playwright 扩展测试至少覆盖：

1. Background 初次启动；
2. Sidepanel 打开和关闭；
3. Service Worker 被回收后重新唤醒；
4. 等待验证码时恢复；
5. 等待远端 job 时恢复；
6. 写请求处于 `unknown` 时恢复；
7. 扩展 reload；
8. 浏览器重启后的持久任务恢复；
9. 存储迁移失败时保留旧数据；
10. 权限未授予时显示可操作错误。

无法完全自动触发 Service Worker 回收时，建立可测试的启动恢复入口，并在手工测试文档中写出 Chrome DevTools 操作步骤。

## 10.4 权限和 Host Permission 审计

创建：

```text
docs/architecture/permission-map.md
scripts/audit-manifest-permissions.mjs
```

权限映射至少说明：

```text
权限或域名
使用功能
调用文件
是否核心必需
是否可改为 optional
用户拒绝后的降级行为
```

要求：

- 尽量将非核心权限迁移到 `optional_permissions` 或 `optional_host_permissions`；
- 能使用精确域名时不要依赖 `<all_urls>`；
- 不得为了减少警告而破坏现有必须功能；
- 每次请求可选权限前说明用途；
- 用户拒绝后只禁用相关 Provider 或流程，不得使整个扩展崩溃；
- 审计 `debugger`、`browsingData`、`cookies`、`downloads`、`scripting`、`tabs`、`webNavigation` 的真实调用位置。

## 10.5 脱敏诊断包

增加“导出诊断包”功能，但默认只包含：

```text
扩展版本和 manifest 版本
浏览器版本与平台摘要
存储 schema 版本
已授予权限列表
Provider configured/healthy 摘要
最近任务的脱敏状态和错误码
最近事件的脱敏摘要
模块加载和迁移结果
```

禁止包含：

```text
完整邮箱列表（默认只保留局部掩码）
密码
Access Token
Cookie
API Key
2FA Secret
完整 CDK
代理密码
邮件正文
完整网页 HTML
截图
```

建议创建：

```text
background/diagnostics/support-bundle-builder.js
background/diagnostics/environment-summary.js
background/diagnostics/diagnostic-redaction-policy.js
sidepanel/support-bundle-controller.js
scripts/test-support-bundle-redaction.cjs
```

诊断模式应有明确开关和自动过期时间，避免长期产生高体积日志。

## 10.6 存储配额和压缩

要求：

- 使用 `chrome.storage.*.getBytesInUse()` 监控账号、任务和事件占用；
- 达到警戒值时先压缩旧事件和已完成任务摘要；
- 不清理活动、等待远端或人工处理任务；
- 清理策略必须可测试、可预测；
- UI 显示存储占用和最近清理结果；
- 不通过申请 `unlimitedStorage` 掩盖无界日志增长，除非有明确必要并写入权限说明。

## 阶段 10 必须增加的测试

```text
scripts/test-storage-access-boundary.cjs
scripts/test-background-hydration.cjs
scripts/test-service-worker-recovery-matrix.cjs
scripts/test-manifest-permission-map.cjs
scripts/test-support-bundle-redaction.cjs
scripts/test-storage-retention-policy.cjs
```

## 阶段 10 验收

- [ ] Content Script 无法直接读取敏感存储。
- [ ] Background 重启后任务和锁按副作用策略恢复。
- [ ] 没有伪 keepalive 实现。
- [ ] Manifest 权限均有用途映射。
- [ ] 能安全降级处理未授予的可选权限。
- [ ] 诊断包不包含敏感数据。
- [ ] 任务和事件存储不会无限增长。

---

## 第二轮参考项目和借鉴边界

本任务书新增内容来自对以下项目和官方资料的架构对比：

| 项目 | 可借鉴内容 | 许可与边界 |
| --- | --- | --- |
| `2noScript/kernel-script` | Chrome 扩展任务队列、IndexedDB 持久化、重启 hydration、Engine Registry、批量取消和重试 | MIT；仍建议自行实现以适配现有原生结构，不直接引入 React 依赖 |
| `tangsong404/signup-god` | Account Generator、Checkcode Source、Registrar 三类契约；邮件匹配规则由站点注册器声明 | GPL-3.0；只借鉴职责划分和接口思想，禁止复制源码 |
| `TooonyChen/AuthInbox` | 新邮件处理、验证码/链接分类、等待新验证码、数据库迁移、敏感内容隔离 | MIT；不要默认引入 AI 邮件解析或外部服务 |
| `browser-use/workflow-use` | 确定性工作流、结构化变量、工作流存储、执行日志、未来 workflow diff/self-healing 思想 | AGPL-3.0；禁止复制源码，不在本项目引入 AI self-healing |
| `AutomaApp/automa` | 节点级超时、错误处理、状态复用、日志和调试模式 | AGPL/商业混合许可；只借鉴产品行为，不复制实现 |
| `furic/filament-redeem-codes` | 批次与兑换记录分离、`redeemed_at` 时间语义、结构化错误码、限流和真实测试 | MIT；只借鉴数据建模，不引入 Laravel/PHP |
| Chrome Extensions 官方文档 | Service Worker 终止模型、storage access level、session 存储、权限最小化、Offscreen 使用边界 | 以官方行为作为实现和测试依据 |

明确禁止：

- 不把其他项目代码直接粘贴到当前 MIT 仓库；
- 不新增 Python、FastAPI、Cloudflare、Laravel、React 或 AI 邮件解析运行依赖；
- 不因为参考项目使用 IndexedDB 就强制迁移所有现有数据；任务事件量确实超过 `chrome.storage` 适用范围时，才通过抽象 Repository 评估 IndexedDB；
- 不实现自动破解验证码、绕过风控或规避站点安全措施；
- 不让“自愈”自动修改生产工作流并继续执行不可逆操作。

---

## 5. 需要重点修改的现有文件

以下文件可以修改，但要控制职责：

| 文件 | 允许修改的内容 |
| --- | --- |
| `background.js` | 新模块加载和依赖装配；不得加入新的大段业务逻辑 |
| `background/message-router.js` | 装配 route group；不得堆积大量 handler |
| `background/bootstrap/state-store.js` | 接入规范账号和任务摘要 |
| `background/bootstrap/settings-defaults.js` | 增加 schema 默认值 |
| `background/bootstrap/settings-transfer.js` | 接入迁移和导出模式 |
| `background/account-run-history.js` | 转为 Task/Event 兼容视图 |
| `background/upi-credential-membership-checker.js` | 通过 Repository 写账号生命周期 |
| `background/membership/*.js` | 统一生命周期写入 |
| `background/auto-run/*.js` | 绑定 taskId、checkpoint 和恢复 |
| `background/steps/upi-redeem/*.js` | 资源锁、checkpoint、远端恢复和拆分大文件 |
| `sidepanel/sidepanel.html` | 按依赖顺序加载新模块和增加必要容器 |
| `sidepanel/sidepanel-app-controller.js` | 只保留编排；继续减小体积 |
| `sidepanel/account-records-manager.js` | 消费 V2 账号和统一 action policy |
| `sidepanel/account-records-*.js` | 移除重复状态推导或变成薄适配器 |
| `scripts/audit-smoke-tests.mjs` | 增加写边界、敏感字段、加载顺序和体积审计 |
| `docs/CONFIG-USAGE.md` | 更新导入导出和敏感备份说明 |
| `RELEASING.md` | 更新检查和发布安全步骤 |

---

## 6. 禁止事项

不得进行以下操作：

- 不得复制 `freeAgentIdentity` 的 Python、TypeScript 或其他 AGPL-3.0 代码。
- 不得把本项目改造成前后端服务。
- 不得引入 React 仅为了重做侧栏。
- 不得引入 SQLite 作为扩展运行依赖。
- 不得引入 Electron、Docker、noVNC、代理池、Turnstile Solver、Cursor 或 Kiro 功能。
- 不得删除现有旧存储键来简化迁移。
- 不得将 UPI、IDEAL、PIX 合并成一个共享状态对象。
- 不得提高静态审计的体积阈值来掩盖文件膨胀。
- 不得使用 `setTimeout` 猜测远端提交是否成功。
- 不得在远端状态未知时重新提交 CDK。
- 不得把网络错误当作账号注销或 Token 无效。
- 不得在日志、事件或普通备份中输出完整敏感信息。
- 不得删除现有测试以使新实现通过。
- 不得以大规模格式化造成无法审查的无关 diff。
- 不得修改现有用户可见文案和流程含义，除非实现新任务/概览 UI 所必需。

---

## 7. 静态审计必须新增的规则

在 `scripts/audit-smoke-tests.mjs` 或独立审计脚本中增加：

1. 新模块在 `background.js` 和 `sidepanel.html` 中按正确依赖顺序加载。
2. 只有 `account-repository.js` 可以直接写 `accountRecordsV2`。
3. 只有 Task Repository 和 Event Store 可以写任务存储键。
4. Sidepanel 不得直接写规范账号和任务存储键。
5. Provider 原始密钥不得出现在状态广播白名单。
6. Task Event 禁止常见敏感字段名和值。
7. `REDEEM_CHANNELS` 继续只包含 `upi`、`ideal`、`pix`。
8. 旧 `pixRedeem*` 和新 `pixChannelRedeem*` 不得错误混用。
9. 新增核心模块必须存在对应测试。
10. `background.js`、`sidepanel-app-controller.js` 和兑换编排文件继续受体积守卫约束。
11. 发布包不得包含敏感运行文件。
12. `accountRecordsV2`、`accountTasksV1`、`accountTaskEventsV1` 的写入边界明确。

---

## 8. 最终全量验证

完成全部阶段后，在 Git 仓库根目录运行：

```powershell
npm ci
npm run syntax
npm test
npm run audit
node --check background.js
node --check sidepanel/sidepanel.js
node --check sidepanel/sidepanel-app-controller.js
node --check background/steps/upi-redeem.js
git diff --check
git status --short
```

还必须：

1. 检查 `manifest.json` 引用的每个脚本均存在。
2. 检查 `background.js` 的 `importScripts` 顺序。
3. 检查 `sidepanel.html` 的脚本顺序。
4. 检查所有新增消息 route 在 Service Worker 恢复后可用。
5. 使用虚构数据运行迁移测试。
6. 使用虚构账号运行三渠道状态隔离测试。
7. 使用模拟远端响应验证“请求已提交但本地超时”的恢复行为。
8. 手工加载扩展并确认 Sidepanel 无明显报错或横向溢出。

如无法在当前环境完成真实 Chrome 手工回归，必须：

- 完成所有可自动化测试；
- 增加 Playwright 或可复用的扩展加载 smoke 测试；
- 在最终报告中明确列出唯一未完成的手工步骤；
- 不得声称已经完成未实际执行的验证。

---

## 9. 整体完成定义

只有同时满足以下条件才算完成：

- [ ] 原有业务测试全部保持通过。
- [ ] 新增测试全部通过。
- [ ] 语法检查全部通过。
- [ ] 静态审计全部通过。
- [ ] 三个现有体积超限问题已通过真实拆分解决。
- [ ] 所有规范账号写入经过 AccountRepository。
- [ ] 注册、补 AT、会员核验和兑换都有 taskId。
- [ ] 有账号锁和 CDK 锁。
- [ ] Service Worker 重启不会重复提交 CDK。
- [ ] 三渠道状态完全隔离。
- [ ] 旧 UPI 兼容字段行为保持。
- [ ] Provider 普通配置支持定义驱动。
- [ ] 所有账号按钮由统一 action policy 控制。
- [ ] V1 配置可安全迁移到 V2。
- [ ] 普通备份和日志不包含敏感凭证。
- [ ] Free/Plus 导出格式保持兼容。
- [ ] 项目仍是无需本地服务的 Chrome MV3 扩展。
- [ ] 文档与最终实现一致。
- [ ] 验证码只消费发码基线之后且符合站点规则的新邮件。
- [ ] 每个任务绑定流程版本和定义 hash。
- [ ] 所有不可逆远端请求进入副作用账本。
- [ ] 429、连续错误和冷却状态按 Provider/渠道隔离。
- [ ] 危险未知结果进入人工处理而不是自动重试。
- [ ] Content Script 无法直接读取敏感存储。
- [ ] Manifest 权限有完整用途映射。
- [ ] 脱敏诊断包和存储保留策略通过测试。

---

## 10. Codex 最终回复格式

完成实际修改后，最终回复必须按以下结构，不要只说“已完成”：

```markdown
# 完成结果

## 已实施
- 按阶段列出完成的功能。

## 关键文件
- 列出新增文件及职责。
- 列出主要修改文件及改动目的。

## 数据迁移
- 说明旧数据如何读取、迁移和兼容。
- 说明是否保留所有旧存储键。

## 安全与兼容
- 说明三渠道隔离如何保证。
- 说明如何避免重复提交 CDK。
- 说明敏感数据如何脱敏。

## 测试结果
- 列出实际执行的命令。
- 列出通过、失败和跳过数量。

## 未完成或需要人工验证
- 只列真实未完成项。
- 不得隐藏失败或声称执行过未执行的测试。

## 建议提交信息
- 给出 1 个符合项目风格的 commit message。
```

---

## 11. 开始执行

现在开始：

1. 读取项目规范和现有实现；
2. 记录基线；
3. 先修复体积审计；
4. 按阶段 1 至阶段 10 实施；
5. 每阶段补测试并验证；
6. 完成全量验证；
7. 更新相关文档；
8. 输出真实完成报告。

不要停留在分析阶段，直接修改当前仓库。
