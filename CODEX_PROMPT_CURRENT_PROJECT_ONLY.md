# Codex 执行提示词：仅基于当前 CDK Redeem Only 项目改造

> 文档整理说明（2026-07-26）：本任务书保留原始工程补全要求，但文档已按当前职责合并。`README-UPI-ONLY.md`、`docs/CONFIG-USAGE.md` 和 `项目完整链路说明.md` 由 `docs/USER_GUIDE.md` 取代；`项目文件结构说明.md`、`项目开发规范（AI协作）.md`、`docs/architecture/*` 和 `RELEASING.md` 由 `docs/DEVELOPMENT.md` 取代；`Release.md` 更名为 `CHANGELOG.md`；阶段报告、单问题档案和 `docs/superpowers/` 已分别合并到 `docs/audit/` 与 `docs/history/`。不得为了匹配本任务书中的旧路径重新创建这些零散文件，职责以当前文档入口和真实目录为准。

请接管当前已经解压的 Chrome 扩展项目，并直接在当前项目中完成改造。

本次工作只能以当前仓库的真实代码、真实目录、现有测试和现有业务行为为基础。不要套用其他项目的目录结构，不要重新创建另一套工程，也不要为了结构看起来漂亮而大规模搬迁文件。

## 一、项目目的

当前项目是一个 Chrome Manifest V3 扩展，名称为 `CDK Redeem Only`，当前版本为 `1.0.14`。

项目现有目标是保留并维护以下完整链路：

1. 导入、生成或管理注册邮箱；
2. 打开 OpenAI / ChatGPT 注册页面并提交邮箱；
3. 设置密码；
4. 从邮箱 Provider 获取验证码并完成验证；
5. 填写资料；
6. 等待注册完成；
7. 开通 2FA、读取 Access Token、检测试用资格；
8. 将符合条件的账号放入 Free 账号池；
9. 使用用户导入的 UPI、IDEAL、PIX 渠道 CDK 执行兑换；
10. 查询远端兑换和会员结果；
11. 将成功账号移动到对应渠道的 Plus 分组；
12. 保留失败、取消、等待、缺少 AT、AT 无效或账号停用等状态；
13. 支持账号、配置、凭证和 CDK 池的导入导出；
14. 支持单账号操作、批量操作、失败补兑、停止和恢复。

本次改造的目的不是增加新的产品，也不是把项目改造成前后端系统，而是在不破坏上述现有能力的前提下完成以下工作：

- 降低核心大文件的复杂度；
- 统一账号数据的读取和写入入口；
- 让注册、核验、补 AT 和兑换任务能够追踪、停止和恢复；
- 防止同一账号或同一 CDK 被重复处理；
- 防止 Service Worker 重启后重复提交外部请求；
- 统一邮箱 Provider 的定义、配置校验和连接测试方式；
- 加强验证码的新邮件匹配、去重和账号归属；
- 加强敏感数据、配置备份和日志安全；
- 补全统一测试、审计、打包和 CI 命令；
- 保持项目以后仍可以在当前架构中继续维护。

## 二、当前项目真实结构

当前项目已经存在以下结构。必须在此结构上渐进修改：

```text
project-root/
├─ manifest.json
├─ package.json
├─ package-lock.json
├─ background.js
├─ README.md
├─ README-UPI-ONLY.md
├─ AGENTS.md
├─ CONTRIBUTING.md
├─ SECURITY.md
├─ RELEASING.md
├─ Release.md
├─ rules.json
│
├─ background/
│  ├─ auto-run/
│  ├─ bootstrap/
│  ├─ email/
│  ├─ membership/
│  ├─ redeem/
│  ├─ router/
│  ├─ routes/
│  ├─ steps/
│  │  └─ upi-redeem/
│  ├─ verification/
│  ├─ account-run-history.js
│  ├─ auto-run-controller.js
│  ├─ custom-email-pool-state.js
│  ├─ message-router.js
│  ├─ persistent-settings.js
│  ├─ registration-account-state.js
│  ├─ registration-email-state.js
│  ├─ runtime-state.js
│  ├─ workflow-engine.js
│  └─ 其他现有模块
│
├─ content/
│  ├─ signup-page.js
│  ├─ signup-page-orchestrator.js
│  ├─ signup-verification-page.js
│  ├─ signup-password-page.js
│  ├─ signup-profile-page.js
│  ├─ signup-session-page.js
│  ├─ auth-page-detectors.js
│  ├─ auth-page-recovery.js
│  ├─ icloud-mail.js
│  ├─ qq-mail.js
│  ├─ mail-163.js
│  ├─ duck-mail.js
│  └─ 其他现有页面脚本
│
├─ flows/
│  └─ openai/
│     └─ mail-rules.js
│
├─ shared/
│  ├─ flow-capabilities.js
│  ├─ membership-credential-format.js
│  ├─ redeem-channel-state.js
│  ├─ session-to-json-converter.js
│  ├─ source-registry.js
│  └─ trial-eligibility-api.js
│
├─ sidepanel/
│  ├─ sidepanel.html
│  ├─ sidepanel.css
│  ├─ sidepanel.js
│  ├─ sidepanel-bootstrap.js
│  ├─ sidepanel-app-controller.js
│  ├─ app-state.js
│  ├─ dom-bindings.js
│  ├─ settings-controller.js
│  ├─ settings-field-bindings.js
│  ├─ settings-normalization.js
│  ├─ settings-state-manager.js
│  ├─ settings-transfer-manager.js
│  ├─ account-records-manager.js
│  ├─ account-records-renderer.js
│  ├─ account-records-*.js
│  ├─ cdk-pool-manager.js
│  ├─ custom-email-pool-manager.js
│  ├─ hotmail-manager.js
│  ├─ icloud-manager.js
│  ├─ luckmail-manager.js
│  ├─ mail-2925-manager.js
│  ├─ workflow-controller.js
│  ├─ workflow-*.js
│  └─ styles/
│
├─ scripts/
│  ├─ audit-smoke-tests.mjs
│  ├─ audit-no-removed-network.mjs
│  ├─ audit-no-phone-sms.mjs
│  ├─ module-size-report.mjs
│  ├─ test-*.cjs
│  └─ 其他现有脚本
│
├─ docs/
│  ├─ architecture/
│  ├─ audit/
│  ├─ chrome-extension-dev/
│  ├─ md/
│  ├─ releases/
│  └─ superpowers/
│
├─ data/
├─ icons/
└─ 根目录现有邮箱 Provider 工具文件
```

根目录还存在这些 Provider 或邮箱相关工具：

- `cloudflare-temp-email-utils.js`
- `cloudmail-utils.js`
- `freemail-utils.js`
- `hotmail-utils.js`
- `icloud-utils.js`
- `luckmail-utils.js`
- `mail-provider-utils.js`
- `mail2925-utils.js`
- `managed-alias-utils.js`
- `microsoft-email.js`
- `moemail-utils.js`
- `outlook-email-plus-utils.js`
- `yydsmail-utils.js`

必须保留现有加载方式和浏览器全局 namespace 模式。不得擅自改成 ES Module 打包工程。

## 三、结构约束

### 1. 禁止创建另一套理想化项目

不要为了套用模板而批量创建以下不存在的整套目录：

- `domain/`
- `repositories/`
- `application/`
- `views/`
- `models/`
- `frontend/`
- `backend/`
- `server/`
- `database/`

除非当前代码确实需要，而且能够证明新增单个目录比放入现有目录更合理，否则不要增加新的顶层目录。

### 2. 优先修改现有模块

新能力应优先接入以下现有位置：

- Service Worker 装载和依赖装配：`background.js`；
- 启动、状态恢复和设置默认值：`background/bootstrap/`；
- 账号和设置消息：`background/routes/`；
- 消息分发：`background/message-router.js`、`background/router/`；
- 注册主流程：`background/auto-run/`、`background/steps/`、`background/workflow-engine.js`；
- 会员、AT、账号池和兑换结果：`background/membership/`；
- CDK 使用和兑换 API：`background/redeem/`、`background/steps/upi-redeem/`；
- 邮箱 Provider：`background/email/provider-registry.js`、现有 Provider 模块和根目录 Provider 工具；
- 验证码：`background/verification/`、`background/steps/fetch-signup-code.js`、`content/signup-verification-page.js`；
- 账号 UI：现有 `sidepanel/account-records-*.js`；
- CDK UI：`sidepanel/cdk-pool-manager.js`、`sidepanel/upi-redeem-cdk-*.js`；
- 设置 UI：`sidepanel/settings-*.js`、各 Provider manager；
- 工作流 UI：`sidepanel/workflow-*.js`；
- 测试和静态审计：`scripts/`。

### 3. 允许新增文件的原则

可以新增少量职责清晰的文件，但必须满足：

- 放在最接近现有职责的目录；
- 有真实调用方；
- 有对应测试；
- 已在 `background.js` 或 `sidepanel/sidepanel.html` 中按正确顺序装载；
- 已加入 `scripts/audit-smoke-tests.mjs` 的加载顺序或大小审计；
- 不创建空文件、TODO、占位模块或未接入的抽象层。

例如，账号规范、任务持久化、锁、Provider 定义等能力，可以作为现有 `background/`、`background/bootstrap/`、`background/routes/`、`background/membership/`、`background/email/`、`shared/` 或 `sidepanel/` 下的相邻模块实现，不要求搬成新的大型目录树。

## 四、当前真实基线

开始修改前重新运行并记录基线，不要直接相信固定数字；当前压缩包检查到的基线如下：

- 项目文件总数约 404；
- JS、CJS、MJS 文件约 322；
- `node --test scripts/test-*.cjs` 当前共 312 项测试，全部通过；
- `node scripts/audit-no-removed-network.mjs` 当前通过；
- `node scripts/audit-no-phone-sms.mjs` 当前通过；
- `node scripts/audit-smoke-tests.mjs` 当前不通过。

当前已知审计问题：

1. 解压目录可能没有 `.git`，导致 `git ls-files` 审计失败；
2. `sidepanel/sidepanel-app-controller.js` 当前约 7909 行，审计上限为 7850；
3. `background/steps/upi-redeem/free-entry.js` 当前约 603 行，审计上限为 580；
4. `background/steps/upi-redeem/channel-submission.js` 当前约 1932 行，审计上限为 1900；
5. 审计期待 `项目完整链路说明.md`，但压缩包中的部分中文文件名可能因编码解压为乱码。

处理要求：

- 如果没有 Git 仓库，先检查 `.gitignore`，确认不会提交真实敏感数据，然后初始化 Git 并提交未修改基线；
- 不得通过提高大小阈值解决三个超限文件；
- 必须按职责提取真实逻辑并保持行为不变；
- 对中文文档名称问题，先读取现有乱码文件内容，确认哪一个是真正的 `项目完整链路说明.md`，再安全重命名；
- 不得创建空白同名文档欺骗审计；
- 修复后重新运行完整审计。

将实际基线写入：

```text
docs/audit/current-project-baseline.md
```

## 五、不可改变的业务基线

必须保持以下当前行为：

1. 项目仍是 Chrome Manifest V3 扩展；
2. `background.js` 仍是 Service Worker 入口；
3. `sidepanel/sidepanel.html` 仍是 Side Panel 入口；
4. 现有 Content Script 匹配范围和加载顺序不能被无依据破坏；
5. 现有 7 步注册主流程继续由 `activeFlowId`、`nodeId` 和现有 workflow 定义驱动；
6. 不用固定数字步骤替代 `nodeId`；
7. UPI、IDEAL、PIX 是独立渠道；
8. 各渠道的 CDK 池、使用状态、失败次数、资格和 Plus 分组互不覆盖；
9. 旧兼容字段不得被重新解释成另一渠道的新数据；
10. 同一个账号不能同时执行冲突的兑换任务；
11. 同一个 CDK 不能同时分配给两个账号；
12. 已向远端发出兑换请求但结果未知时，不能因为重启或重复点击再次提交；
13. 网络错误、超时或远端 5xx 不能直接判定 Access Token 无效；
14. 只有远端明确确认 Token 无效，并且刷新或补充流程失败后，才能清除已确认无效的 AT；
15. 明确停用或注销的账号必须保留记录、停止重试并禁止兑换；
16. Free 和 Plus 的现有文本导出格式保持兼容；
17. 现有邮箱、密码、2FA、AT、会员核验、CDK 导入和失败补兑入口保持可用；
18. 旧配置和旧运行数据不得在迁移中静默丢失；
19. 不恢复已经明确移除的旧支付、旧钱包、旧网络切换或手机短信模块；
20. 不修改远端服务的业务协议，除非当前代码和真实接口明确要求。

## 六、实施任务

必须按以下顺序渐进实施。每阶段完成后运行定向测试和全量回归，不要一次性重写。

### 阶段 0：冻结真实基线

1. 阅读 `AGENTS.md`、`README.md`、`manifest.json`、现有架构文档和全部测试入口；
2. 记录当前目录、存储键、消息类型、Provider 列表、渠道字段和脚本加载顺序；
3. 运行全部现有测试与审计；
4. 建立完全虚构的 Free、Plus、缺 AT、AT 无效、账号停用、UPI/IDEAL/PIX 状态夹具；
5. 固定现有导入导出格式和 Action Modal 行为；
6. 创建基线文档和 Git 基线提交。

### 阶段 1：修复当前工程问题

1. 修复三个真实文件的大小审计失败；
2. 保持 `background.js` 只做装载、装配和事件注册，继续把新增业务逻辑放入现有子模块；
3. 修复中文文档名称或解压编码导致的审计问题；
4. 给当前 `package.json` 增加脚本，但不要引入新的构建框架：

```json
{
  "scripts": {
    "syntax": "node scripts/check-syntax.mjs",
    "test": "node --test scripts/test-*.cjs",
    "audit": "node scripts/audit-smoke-tests.mjs && node scripts/audit-no-removed-network.mjs && node scripts/audit-no-phone-sms.mjs",
    "check": "npm run syntax && npm test && npm run audit",
    "package": "node scripts/build-release.mjs"
  }
}
```

如果项目已有等价脚本，复用现有实现，不重复创建。

5. `check-syntax.mjs` 应检查项目内实际 JS、CJS、MJS 文件；
6. `build-release.mjs` 应生成可加载的脱敏扩展包，排除 `.git`、真实账号、密码、AT、Cookie、API Key、CDK、运行历史、临时文件和本地备份；
7. 增加最小 CI，仅运行当前项目自己的 syntax、test、audit 和 package；
8. 不得为了通过审计删除功能、删除测试或提高审计阈值。

### 阶段 2：在现有账号链路中建立统一账号记录

当前账号事实分散在：

- `customEmailPoolEntries`；
- `accountRunHistory`；
- 会员结果存储；
- Free、UPI Plus、IDEAL Plus、PIX Plus 分组；
- 当前运行状态；
- CDK 使用和兑换结果。

需要在当前架构中建立统一账号规范记录，建议存储键为：

```text
accountRecordsV2
```

要求：

1. 账号 ID 使用统一的小写规范邮箱；
2. 邮箱标准化只能有一个共享实现；
3. 账号有效性、试用资格、会员状态和 AT 状态必须分开；
4. UPI、IDEAL、PIX 的状态必须分开；
5. 先实现“规范记录优先、旧数据兼容构建”的只读模式；
6. 再让注册完成、AT 更新、资格检测、会员核验、兑换结果、删除和手动移动逐步通过统一写入口；
7. 旧模块尚未迁移时，通过兼容适配器生成旧格式，不允许一次业务动作分别直接写两套数据；
8. 迁移必须幂等；
9. 迁移前保留备份；
10. 本阶段不默认删除旧存储键；
11. `sidepanel/account-records-manager.js` 应逐步消费规范账号视图，不再自行拼接所有业务真相；
12. 现有 `account-records-*.js` 的展示、导出、删除、会员和兑换行为必须保持兼容。

新增文件应放在当前结构的相邻位置，例如 `shared/`、`background/`、`background/bootstrap/` 或 `background/routes/`，不要创建独立后端式目录树。

### 阶段 3：在现有 auto-run、workflow 和兑换链路中加入可恢复任务

不要替换现有 workflow 引擎，而是在以下现有模块上接入任务：

- `background/auto-run/`；
- `background/auto-run-controller.js`；
- `background/workflow-engine.js`；
- `background/steps/`；
- `background/membership/`；
- `background/steps/upi-redeem/`；
- `background/account-run-history.js`；
- `background/routes/workflow-routes.js`；
- `sidepanel/workflow-*.js`。

建议任务存储：

```text
accountTasksV1
accountTaskEventsV1
```

至少覆盖任务类型：

- 注册；
- 补充或刷新 Access Token；
- 会员核验；
- CDK 兑换；
- Provider 连接测试。

任务必须保存：

- `taskId`；
- `type`；
- `accountId`；
- `channel`；
- `status`；
- `nodeId`；
- `progress`；
- `checkpoint`；
- `resourceKeys`；
- `createdAt`、`updatedAt`、`finishedAt`；
- 稳定错误码和脱敏错误说明。

至少支持状态：

```text
pending
running
waiting_remote
retry_wait
cancel_requested
canceled
succeeded
failed
interrupted
manual_review
```

要求：

1. 每次真实运行都有唯一 `taskId`；
2. 任务事件按 `taskId` 隔离；
3. 现有文本日志可保留，但不能成为恢复判断的唯一来源；
4. 停止后不能启动新的页面或远端副作用；
5. Service Worker 重启后从持久化 checkpoint 判断恢复、查询远端、失败或进入人工处理；
6. 现有 `accountRunHistory` 可以作为兼容视图，但不能继续作为唯一任务模型；
7. 不使用死循环、空消息、高频 alarm 或 Offscreen Document 强行保活。

### 阶段 4：接入账号锁、CDK 锁和远端副作用保护

重点修改现有兑换链路：

- `background/membership/redeem-service.js`；
- `background/membership/redeem-attempt-history.js`；
- `background/redeem/redeem-cdkey-usage.js`；
- `background/redeem/upi-redeem-api-client.js`；
- `background/steps/upi-redeem/`；
- `background/routes/cdkey-routes.js`；
- `sidepanel/account-records-redeem-*.js`；
- `sidepanel/cdk-pool-*.js`；
- `sidepanel/upi-redeem-cdk-*.js`。

要求：

1. 账号锁键使用规范账号 ID；
2. CDK 锁必须包含渠道和不可逆指纹；
3. 完整 CDK 不进入普通日志或任务事件；
4. 远端请求发出前先持久化 `prepared`；
5. 请求发出后记录 `dispatched`；
6. 收到远端确认后记录 `acknowledged` 或 `confirmed`；
7. 本地超时、页面关闭或 Service Worker 回收后记录 `unknown`；
8. `unknown` 状态只能优先查询远端，不能自动再次提交；
9. 无法确认结果时进入 `manual_review`；
10. 用户重复点击、消息重复投递、扩展 reload 和浏览器重启均不得造成重复 CDK 消费；
11. 成功后只移动到对应渠道 Plus；
12. 失败、取消、等待或未知状态继续保留正确账号和 CDK 状态；
13. 释放锁必须与最终状态匹配，不能提前把仍可能被远端处理的 CDK 放回可用池。

### 阶段 5：基于现有 Provider 体系统一定义和验证码匹配

必须复用：

- `background/email/provider-registry.js`；
- 当前 `background/*-provider.js`；
- 根目录各 `*-utils.js`；
- `sidepanel/*-manager.js`；
- `sidepanel/settings-controller.js`；
- `sidepanel/settings-field-bindings.js`；
- `sidepanel/settings-normalization.js`；
- `sidepanel/mail-provider-state.js`；
- `background/verification/`；
- `background/steps/fetch-signup-code.js`；
- `flows/openai/mail-rules.js`。

Provider 定义至少描述：

- Provider ID；
- 显示名称；
- 所需字段；
- 密钥字段；
- 默认值；
- 标准化规则；
- 校验规则；
- 支持的能力；
- 是否需要专用 UI；
- 连接测试入口。

要求：

1. 不删除复杂 Provider 的现有专用 Manager；
2. 普通 Provider 的保存、恢复、校验和脱敏尽量由统一定义驱动；
3. 新增普通 Provider 不应再修改大量无关文件；
4. 空密钥输入表示保留旧值，不能把已保存密钥覆盖为空；
5. 连接测试不修改已保存配置；
6. 状态广播只返回脱敏预览，不返回原始密钥；
7. Provider 模块加载失败必须产生可见错误。

验证码要求：

1. 发起验证码请求前记录邮箱新邮件基线；
2. 只接受基线之后的新邮件；
3. 校验邮箱账号、Provider、发送人、标题、时间和邮件类别；
4. 使用 `messageId` 或稳定指纹去重；
5. 旧验证码不能重复使用；
6. 账号 A 不能使用账号 B 的验证码；
7. 任务 A 不能消费任务 B 的邮件；
8. 验证码等待状态可以在 Service Worker 重启后恢复；
9. 普通日志不保存完整邮件正文；
10. 不破坏现有验证码提取、重发和页面恢复测试。

### 阶段 6：把账号操作判断收敛到现有策略模块

优先扩展和复用：

- `sidepanel/account-records-redeem-policy.js`；
- `sidepanel/membership-row-policy.js`；
- `sidepanel/workflow-button-state.js`；
- `shared/flow-capabilities.js`；
- `shared/redeem-channel-state.js`；
- `sidepanel/account-records-view-model.js`；
- `sidepanel/account-records-display-model.js`。

要求：

1. 统一推导补 AT、会员核验、UPI/IDEAL/PIX 兑换、导出、删除、重试和停止等操作是否可用；
2. 每个禁用操作必须有稳定原因码和可读原因；
3. Renderer 只展示策略结果，不复制资格、AT、注销和渠道判断；
4. 不引入另一套账号列表；
5. 概览数字、筛选和账号列表必须使用同一规范账号集合；
6. 在现有 Sidepanel 中增加紧凑概览和任务查看即可，不要重写成新的 SPA；
7. 保持现有侧栏宽度、样式和操作入口，不出现横向溢出。

### 阶段 7：设置迁移、存储和敏感数据安全

优先修改：

- `background/bootstrap/settings-defaults.js`；
- `background/bootstrap/settings-transfer.js`；
- `background/persistent-settings.js`；
- `background/routes/settings-routes.js`；
- `sidepanel/settings-transfer-manager.js`；
- `sidepanel/settings-state-manager.js`；
- `sidepanel/settings-normalization.js`；
- 现有导入导出服务。

要求：

1. 设置导出具有明确 `schemaVersion`；
2. 支持从当前旧版本逐步迁移；
3. 迁移函数幂等；
4. 导入前保留原始备份；
5. 未来不支持的版本必须明确拒绝；
6. 普通配置导出默认不包含密码、AT、2FA Secret、Cookie、API Key 和完整 CDK；
7. 账号导出保持现有用户格式兼容，但必须由用户明确操作；
8. 完整敏感备份必须显式选择、二次确认并明确标记；
9. 建立统一脱敏函数，供日志、任务事件、诊断和普通导出复用；
10. 检查 `chrome.storage.local` 和 `chrome.storage.session` 的访问级别，在不破坏 Sidepanel 和 Background 的前提下限制 Content Script 直接读取敏感数据；
11. Content Script 通过 Background 白名单消息获取最少必要数据；
12. 先生成当前 Manifest 权限用途表，再决定是否缩小权限；
13. 不得为了减少权限警告而破坏现有邮箱、页面自动化、Cookie、下载或兑换功能。

权限用途文档写入：

```text
docs/architecture/permission-map.md
```

### 阶段 8：有限并发、重试和熔断

只允许为彼此独立的远端查询增加有限并发，例如：

- 多账号会员状态查询；
- 多账号 AT 有效性查询；
- Provider 连接测试。

要求：

1. 默认并发不超过 3；
2. 最大可配置并发不超过 5；
3. 浏览器注册流程保持串行；
4. 同一邮箱、账号、页面、CDK 和兑换提交保持互斥；
5. 支持超时、最大尝试次数、指数退避、随机抖动和 `Retry-After`；
6. Provider 和兑换渠道的冷却状态相互隔离；
7. 连续远端故障时打开熔断；
8. 熔断状态至少包含 `closed`、`open`、`half_open`；
9. 冷却和熔断状态要持久化，Service Worker 重启后继续生效；
10. 一个 Provider 故障不能停止所有其他 Provider。

### 阶段 9：测试、E2E、文档和发布

1. 所有新增关键模块必须增加 `scripts/test-*.cjs`；
2. 静态集成和加载顺序检查继续放在 `scripts/audit-smoke-tests.mjs`；
3. 复用当前 Playwright 依赖，增加最小扩展 E2E；
4. E2E 至少验证扩展能加载、Sidepanel 能打开、设置能保存恢复、账号列表能渲染、任务状态能显示；
5. 无真实第三方凭证时使用虚构 Fixture 或 Mock，不得把真实凭证写入测试；
6. 更新当前 README、架构文档、配置说明和发布说明；
7. 生成脱敏发布压缩包；
8. 输出最终验证报告：

```text
docs/audit/final-validation-report.md
```

## 七、测试要求

必须保留当前全部测试，并增加以下覆盖。

### 账号

- 规范邮箱和稳定 ID；
- 多旧来源合并成一个账号；
- 空或非法记录不生成幽灵账号；
- Free、Plus、无效和停用状态；
- UPI、IDEAL、PIX 状态隔离；
- 迁移执行一次和多次结果一致；
- 写入失败不破坏旧数据；
- 删除和手动移动兼容。

### Access Token 和会员

- 缺 AT 与 AT 无效分开；
- 网络错误不清除 AT；
- 明确 401 才进入刷新或补充；
- 新 AT 验证账号归属后才替换；
- 停用账号停止重试；
- 补 AT 不触发 CDK 兑换；
- AT 不进入普通日志和普通备份。

### 任务和恢复

- 创建、运行、等待、取消、成功和失败；
- 非法状态转换；
- Service Worker 重启恢复；
- 注册邮箱提交前中断；
- 等待验证码时中断；
- AT 验证中中断；
- AT 已获取但尚未保存时中断；
- CDK 提交前中断；
- CDK 已发出但未收到响应时中断；
- 远端 pending 时中断；
- 远端成功但尚未移动 Plus 时中断；
- 用户取消但请求已经发出；
- 停用账号任务恢复。

### CDK

- 账号锁冲突；
- CDK 锁冲突；
- 同一 CDK 重复导入；
- 重复点击保护；
- 重复消息保护；
- 本地超时进入 `unknown`；
- `unknown` 不重新提交；
- 远端查询后确认；
- 人工处理；
- 重启后锁和状态恢复；
- 成功只进入对应渠道 Plus；
- 完整 CDK 不进入日志。

### Provider 和验证码

- Provider 定义加载；
- 配置必填和格式校验；
- 密钥保留语义；
- 连接测试不落盘；
- 新邮件基线；
- 排除旧邮件；
- 排除错误邮箱、Sender、Subject 和过期邮件；
- Message ID 去重；
- 跨账号和跨任务验证码隔离；
- 验证码等待恢复；
- Provider 限流和熔断。

### 设置和安全

- 旧设置迁移；
- 重复迁移；
- 未来版本拒绝；
- 普通导出脱敏；
- 敏感备份警告；
- 日志和任务事件脱敏；
- Content Script 无法直接读取完整敏感状态；
- Background 消息白名单；
- Manifest 文件引用；
- Manifest 权限用途；
- 发布包不包含真实运行数据。

测试不能只检查文件或函数存在，必须断言实际状态变化、存储结果、错误路径、恢复路径和幂等结果。

## 八、验收标准

只有全部满足以下条件，才可以报告完成。

### 1. 当前项目结构被保留

- 没有创建另一套前端、后端或数据库工程；
- 没有用理想化目录替换现有目录；
- 主要修改均发生在当前 `background/`、`content/`、`shared/`、`sidepanel/`、`scripts/` 和 `docs/` 中；
- 新文件数量合理，均有真实调用方和测试；
- 没有大规模无意义搬家。

### 2. 扩展能够运行

- `manifest.json` 有效；
- Chrome 开发者模式可以加载当前目录；
- Background Service Worker 可以启动；
- Sidepanel 可以打开；
- Content Script 正常加载；
- Manifest 引用文件全部存在；
- 控制台没有阻断性加载错误。

### 3. 现有功能无回归

- 现有 312 项基线测试全部继续通过；
- 新增测试也全部通过；
- 邮箱导入、生成和 Provider 选择仍可用；
- 验证码、注册、密码、2FA、AT 和资格检测仍可用；
- Free、UPI Plus、IDEAL Plus、PIX Plus 逻辑不互相污染；
- CDK 导入、单个兑换、批量兑换和失败补兑入口仍可用；
- 账号和配置导入导出保持兼容；
- 已移除功能没有被重新加入。

### 4. 当前审计问题全部解决

- `sidepanel/sidepanel-app-controller.js` 低于现有 7850 行限制；
- `background/steps/upi-redeem/free-entry.js` 低于现有 580 行限制；
- `background/steps/upi-redeem/channel-submission.js` 低于现有 1900 行限制；
- 不得提高上述阈值；
- 中文文档名称问题真实修复；
- Git 相关审计能够执行；
- `audit-smoke-tests.mjs` 全部通过；
- 两个移除功能审计继续通过。

### 5. 账号数据统一落地

- 存在唯一规范账号 ID；
- 主要账号读取使用规范记录；
- 新业务写入经过统一入口；
- Sidepanel 不再自行决定所有账号真相；
- 旧数据可迁移且不丢失；
- 重复迁移不产生重复账号；
- 渠道状态保持隔离。

### 6. 任务和恢复落地

- 注册、补 AT、会员核验和兑换都有 `taskId`；
- 任务和事件持久化；
- 至少一个真实完整兑换流程接入任务和 checkpoint；
- 任务可取消；
- Service Worker 重启不会丢失任务摘要；
- 无法安全恢复的任务进入 `interrupted` 或 `manual_review`；
- Sidepanel 能查看真实任务状态和事件。

### 7. CDK 不会重复消费

- 同一账号不能并发运行冲突兑换；
- 同一 CDK 不能并发绑定多个账号；
- 请求前有持久化记录；
- 本地超时进入 `unknown`；
- `unknown` 不自动重发；
- 重复点击、重复消息、扩展 reload 和浏览器重启不导致重复提交；
- 完整 CDK 不进入普通日志；
- 不确定结果有人工处理路径。

### 8. Provider 和验证码可维护

- Provider 定义和现有 registry 已接通；
- 至少两个当前 Provider 接入统一配置校验或连接测试；
- 复杂 Provider 的现有专用 UI 保留；
- 新邮件基线生效；
- 旧邮件、跨账号邮件和重复邮件不会被误用；
- Service Worker 重启后验证码等待可以恢复；
- 普通日志不保存完整邮件正文。

### 9. 设置和安全合格

- 设置有明确版本并能迁移；
- 迁移前有备份；
- 普通配置导出不包含敏感凭证；
- 敏感备份有明确警告；
- 普通日志、任务事件和诊断不出现完整密码、AT、Cookie、API Key、2FA Secret、CDK 或邮件正文；
- Content Script 只能获得必要数据；
- 权限用途文档与实际 Manifest 一致；
- 发布包不包含真实运行数据。

### 10. 命令全部可用

至少以下命令必须成功：

```bash
npm run syntax
npm test
npm run audit
npm run check
npm run package
```

如果增加 `npm run e2e`，在当前环境无法启动 Chrome 时，必须保留可执行测试并明确本地运行方式；不能删除 E2E 或伪造通过结果。

### 11. 文档和 Git 完整

- 有修改前基线提交；
- 每个主要阶段有独立、可回滚提交；
- 文档描述与实际代码一致；
- 最终报告列出新增、修改和删除文件；
- 最终报告列出所有命令和测试数量；
- 最终报告列出无法因第三方服务或凭证验证的项目；
- Git 中没有真实账号、密码、AT、Cookie、API Key、CDK、代理、运行日志或本地备份。

## 九、执行纪律

1. 先阅读当前项目，不要只回复计划；
2. 不要询问是否继续，按阶段持续执行；
3. 每阶段完成后运行定向测试和全量测试；
4. 发现当前文档与真实代码冲突时，以真实代码、现有测试和本提示词为准；
5. 不要使用之前任何虚构的目标目录树；
6. 不要克隆、复制或移植其他项目源代码；
7. 不要改成 React、Vue、FastAPI、Electron、Docker 或独立后端；
8. 不要删除失败测试；
9. 不要固定返回成功；
10. 不要用 TODO 或空模块冒充完成；
11. 不要通过扩大审计阈值解决文件过大；
12. 不要在没有测试保护的情况下批量重写核心流程；
13. 不要在普通日志中打印敏感信息；
14. 不要提交真实凭证；
15. 对无法确认的远端状态必须 fail closed，优先停止重复副作用。

## 十、最终回复格式

完成后必须给出：

1. 实际完成的阶段；
2. 每阶段改动说明；
3. 新增文件列表；
4. 修改文件列表；
5. 删除或重命名文件列表；
6. 当前账号存储结构和版本；
7. 当前任务存储结构和版本；
8. 旧数据迁移方式；
9. Service Worker 恢复机制；
10. CDK 防重复机制；
11. Provider 和验证码改造方式；
12. 设置和安全改进；
13. Manifest 权限是否变化及原因；
14. 执行过的全部测试命令；
15. 基线测试数量、新增测试数量和最终通过数量；
16. 审计结果；
17. 发布包路径；
18. Git 提交记录；
19. 已知问题；
20. 需要人工在 Chrome 中验证的步骤；
21. 因缺少真实第三方凭证而未能验证的部分。

现在开始：

1. 完整读取当前仓库；
2. 检查是否存在 Git 仓库和敏感文件；
3. 运行真实基线测试；
4. 写入基线报告；
5. 修复当前审计失败；
6. 按阶段继续改造；
7. 不要只输出实施计划。
