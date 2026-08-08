# 2026-08 故障与修复档案

本文件合并保存 2026 年 8 月已确认问题的原始记录。每条记录保留日期、脱敏证据、根因、实现、安全边界和真实验证结果；后续修复只能追加新记录并由索引关联。

## 目录

- [步骤 4 账号停用后仍继续当前账号](#2026-08-02-step4-account-deactivated-replacement)
- [2FA 七步工作流无法细粒度恢复与连续推进](#2026-08-02-workflow-v2-ten-step-refactor)
- [第 10 步无试用资格后再次选择同一账号](#2026-08-03-trial-ineligible-account-reselection)
- [第 7 步当前密码确认页被误判并回退](#2026-08-03-step7-current-password-challenge)
- [第 7 步会话过期弹窗被误判为 Password 入口慢渲染](#2026-08-03-step7-chatgpt-session-expired-modal)
- [第 8 步韩文密码复用错误未触发密码替换](#2026-08-03-step8-korean-password-reuse)
- [第 10 步无资格后错误回退第 7 步](#2026-08-03-step10-ineligible-post-auth-restart)
- [免 2FA Free 路线在自动运行重置后仍执行第 7 步](#2026-08-04-no-2fa-route-reset-step7)
- [免 2FA 下一轮仍显示第 10 步完成](#2026-08-04-auto-run-reset-stale-step10-ui)
- [免 2FA 第 9 步固定跳过却显示蓝色高亮](#2026-08-04-route-skipped-step9-active-style)
- [Free Account Tool V3.0.0 移除 CDK 与 Plus 全链路](#2026-08-04-free-account-tool-v3-removal)
- [V3 两个 Free 分组入口藏在首屏之外](#2026-08-04-free-groups-entry-hidden-below-fold)
- [第 10 步资格落库节点仍可单独跳过](#2026-08-04-step10-manual-skip-button)
- [深色主题下 Session 导出选项文字不可见](#2026-08-04-session-export-select-dark-contrast)
- [两个 Free 分组的工具栏公共操作不对齐](#2026-08-04-free-group-toolbar-alignment)
- [完整 2FA 路线混入免 2FA 的跳过与完成状态](#2026-08-04-full-2fa-route-stale-no2fa-state)
- [免 2FA 第 10 步误报当前模式不存在](#2026-08-05-no2fa-step10-registry-plus-flag)
- [AT/Session 分组导出错误生成 V3 JSON 文件](#2026-08-05-free-export-txt-format)
- [Free 账号分组弹窗滚动穿透主界面](#2026-08-05-free-account-modal-scroll)
- [任务列表刷新无反馈且无法删除历史记录](#2026-08-05-account-task-refresh-delete)
- [步骤 2 Continue 按钮慢渲染导致整轮重试](#2026-08-05-step2-continue-enter-fallback)
- [自动运行启动时 Session storage 超出配额](#2026-08-05-session-storage-quota-free-results)
- [120 个账号缺少 Session 且无法持久批量补充](#2026-08-05-batch-fill-free-account-sessions)
- [旧自动运行结果串入新会话并触发错误恢复](#2026-08-08-auto-run-superseded-session-race)
- [验证码页官方密码按钮被主动跳过并误报完成](#2026-08-08-step3-login-password-switch-click)
- [第 10 步仍使用旧资格接口契约](#2026-08-08-step10-gcash-api-contract)
- [GitHub Actions 账号弹窗滚动 E2E 受 Runner 视口影响失败](#2026-08-08-github-actions-e2e-scroll-viewport)
- [第三步验证码页 HTTP 500 导致密码入口切换停在错误页](#2026-08-08-step3-password-switch-http-500)

---

<a id="2026-08-02-step4-account-deactivated-replacement"></a>

## 步骤 4 账号停用后仍继续当前账号

日期：2026-08-02

关联记录：[步骤 4 内容脚本响应超时误重开注册](issue-fix-archive-2026-07.md#2026-07-26-step4-content-response-timeout)、[第 4 步验证码输入框延迟渲染时误重开注册](issue-fix-archive-2026-07.md#2026-07-26-step4-late-verification-input-render)

### 故障现象与证据

用户提供的截图显示 OpenAI 认证页进入 `Authentication Error`，页面明确给出 `error_code: account_deactivated`，并说明账号已经删除或停用。脱敏内存复现向第 4 步首次页面探测返回 `state=account_deactivated_page`、`accountDeactivated=true` 和 `errorCode=account_deactivated`；修复前执行器没有拒绝该状态，仍可继续完成步骤 4。归档不保存截图中的请求标识、邮箱、验证码或其它敏感值。

### 根因与影响范围

认证页 Content Script 已能识别账号停用页面，但 `inspectSignupVerificationState()` 没有把该状态纳入步骤 4 验证码准备状态机，Background 的首次 `GET_LOGIN_AUTH_STATE` 也只处理 HTTP 错误和 TOTP 登录页。错误随后可能进入验证码等待，或被外层步骤 4 通用恢复当作可沿用当前邮箱的整轮重开。自动运行策略没有账号停用专用动作，注册阶段也没有将该证据写入统一账号生命周期。

问题影响注册步骤 4 首次探测和密码提交后准备验证码页两个入口。普通网络超时、验证码输入框延迟、账号已存在、步骤 3.5 TOTP 登录以及步骤 6 会话保留规则不属于本次修改范围。

### 实现与安全边界

- Content Script 和第 4 步执行器优先识别结构化 `account_deactivated_page`、`accountDeactivated` 和错误码，页面文字仅作多语言兜底；命中后统一抛出 `ACCOUNT_DEACTIVATED`、`retryable=false`，并在取码、Resend 和节点完成前终止。
- 新增幂等账号停用落库入口：必要时创建统一账号记录，设置 `validityStatus=deactivated`、`reasonCode=ACCOUNT_DEACTIVATED` 和检查时间，清除不可用 AT，同时保留密码、TOTP、任务和历史记录。兑换资格检查继续拒绝该账号。
- 自定义邮箱池条目保留但设置 `registrationBlocked=true`、`registrationBlockedReasonCode=account_deactivated` 和“账号已封禁”，后续选择会跳过并推进到下一条。其他邮箱来源复用已有不可用账号处理和运行时清理逻辑。
- 手动第 4 步只完成标记并显示失败，不主动启动下一个账号。自动运行使用独立 `replace_account_deactivated` 动作：不依赖普通失败跳过设置、不增加普通尝试次数、不等待重试延迟，从步骤 1 使用干净 OpenAI 会话继续当前目标轮次。
- 自动运行维护本轮封禁邮箱集合，并关闭已登记的旧流程标签页；同一账号再次出现或账号池耗尽时明确停止，避免循环。日志不输出密码、TOTP、AT、验证码、页面请求标识或完整诊断页面。

### 回归覆盖

- `scripts/test-fetch-signup-code-prepare-timeout.cjs` 覆盖首次页面探测和验证码准备阶段的账号停用，验证不会调用验证码准备、轮询或节点完成。
- `scripts/test-auto-run-email-guard.cjs` 覆盖专用换号动作不受普通重试开关与重试上限影响。
- `scripts/test-auto-run-session-runner.cjs` 覆盖同一目标轮次换号、普通尝试计数保持不变、旧流程标签关闭及下一邮箱继续。
- `scripts/test-custom-email-pool-state.cjs` 覆盖封禁条目标记、保留、排除和选择推进。
- `scripts/test-account-lifecycle-service.cjs` 覆盖密码/TOTP 保留、AT 清除和兑换阻止。

### 验证与提交影响

- 五个定向测试文件共 `49/49` 通过，新增覆盖规范账号记录缺失时的幂等封禁落库，以及 `accountSourceExhausted=true` 时的立即停机。
- `npm test` 共 `540/540` 通过；隔离浏览器 E2E 使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时 Profile 和 pipe transport，验证 MV3 Service Worker、Side Panel、运行时消息与诊断剪贴板流程。
- 当前目录不含 `.git`，因此直接执行依赖 `git ls-files` 的门禁会被环境拦截。使用临时且已清理的 Git 元数据执行原样 `npm run check` 后通过：`399` 个跟踪 JavaScript 文件语法通过，文档结构/链接/版本/问题索引通过，Smoke 审计通过，Removed Network 与手机号短信残留审计通过。Smoke 仅保留 `background.js` 超过 8000 行的非阻断警告，实际 `15395` 行仍低于强制上限 `15400`。
- 未提交、未打包、未修改 Manifest 版本，未创建标签或发布；临时 Git 元数据已删除。

---

<a id="2026-08-02-workflow-v2-ten-step-refactor"></a>

## 2FA 七步工作流无法细粒度恢复与连续推进

日期：2026-08-02

关联记录：[步骤 3 后进入已有账号 TOTP 页时被直接排除](issue-fix-archive-2026-07.md#2026-07-26-existing-account-totp-login)、[步骤 3.5 登录成功后仍执行步骤 6](issue-fix-archive-2026-07.md#2026-07-26-step3-5-skip-redundant-password)、[步骤 6 取码耗尽后重开整轮注册](issue-fix-archive-2026-07.md#2026-07-30-step6-code-fetch-round-restart)

### 故障现象与证据

原七步模型把已有账号 TOTP 登录作为合成的“步骤 3.5”展示状态，把 GPT 密码验证码获取和密码设置合并在一个节点，又把安全因子设置和试用资格检查合并在最终节点。页面或扩展在这些组合操作之间中断时，状态只能回到组合节点起点，可能重复取码、重复进入密码重置入口或重复调用安全因子接口；按数字步骤维护的重试规则也会在重新编号后误匹配其它业务节点。

### 根因与影响范围

工作流定义、侧栏展示和自动运行仍以七个位置为稳定协议，`existingTotpLoginDisplayStatus` 只是一层额外 UI 状态，无法参与统一前置条件、迁移和断点续跑。密码重置及最终安全流程的外部副作用没有独立节点检查点，节点完成语义同时代表多项业务结果。

问题覆盖完整 2FA、Passkey 和免 2FA 三条注册路线的节点定义、状态迁移、手动执行、自动续跑、重试策略和侧栏进度。邮箱供应商协议、资格判定标准、账号封禁策略、凭据格式、扩展权限和 Manifest 版本不在修改范围内。

### 实现与安全边界

- 工作流升级为 `workflowVersion=2`，三条路线统一为十个正式位置。步骤 4 使用真实 `existing-totp-login` 条件节点；步骤 7/8 分别负责获取并提交密码验证码、设置并持久化 GPT 密码；步骤 9/10 分别负责路线安全因子和试用资格检查。
- 节点定义增加 `required`、`conditional` 和 `route-skipped` 适用性。侧栏移除合成步骤 3.5，直接按十个节点状态渲染并统一计算 `10 / 10` 进度。
- 步骤 3 只判断注册验证码页或 TOTP 挑战。新账号原子跳过步骤 4；已有账号由步骤 4 复用原 TOTP 恢复、邮箱绑定、Session 校验和动态码逻辑，成功后跳过步骤 5–8。步骤 5 再次发现 TOTP 页面时委托步骤 4，不维护第二套登录实现。
- 密码重置收拢到共享控制器。步骤 7 完成 Security 入口、请求或 Resend、邮箱轮询和验证码提交，仅保存 `gptPasswordResetStage`、目标邮箱和就绪时间；步骤 8 必须验证同一邮箱及新密码页，不能自行取码。会话失效继续使用 `SET_GPT_PASSWORD_SESSION_EXPIRED` 并指向步骤 7 恢复。
- 完整 2FA 和 Passkey 路线的步骤 9 完成安全因子及凭据收尾后立即结束，不再执行资格请求；已有 TOTP 账号只校验和归档，不重复开通。步骤 10 统一复用现有资格检查、Session/AT 邮箱一致性和生命周期写入。免 2FA 路线固定跳过步骤 7–9，由步骤 10 复用免 2FA Free 持久化并保留真实 TOTP 凭据。
- 自动运行按节点状态连续推进，步骤 7→8、9→10 在检查点已就绪时不增加固定等待，也不重复邮箱轮询或外部安全因子调用。数字步骤判断和网络重试表改为按 `nodeId`/`executeKey` 匹配。
- 启动与导入会幂等迁移旧状态：遗留 `running` 转为 `pending`；旧步骤 3.5、密码节点、安全/资格合并节点及免 2FA 最终节点按已有证据映射。未完成的旧密码节点从步骤 7 重启，禁止无检查点直接进入步骤 8；迁移完成后不再维护旧展示字段。

### 回归覆盖

- `scripts/test-workflow-v2-10-step.cjs` 覆盖三条路线的十个位置、适用性、状态迁移、手动前置条件、侧栏状态和进度。
- `scripts/test-existing-totp-workflow-skip.cjs`、`scripts/test-signup-existing-totp-login.cjs` 和注册步骤测试覆盖步骤 3 分类、步骤 4 条件执行与跳过、步骤 5 防御性委托、Session/邮箱一致性、TOTP 拒绝及账号停用。
- `scripts/test-verification-flow-split.cjs`、密码重置 Resend 与会话过期测试覆盖步骤 7/8 检查点、职责隔离、页面丢失、通信恢复和回退节点。
- `scripts/test-workflow-v2-security-eligibility.cjs` 及资格测试覆盖步骤 9 不触发资格请求、已有 TOTP 不重复开通、Passkey 路线、免 2FA 跳过，以及步骤 10 的 eligible、ineligible 和失败策略。

### 验证与提交影响

- 十步工作流定向回归共 `67/67` 通过；相关文件 `node --check` 通过。
- `npm run syntax` 检查 `403` 个受跟踪 JavaScript 文件并通过；`npm test` 共 `557/557` 通过。
- `npm run docs:check` 通过；`npm run audit` 和完整 `npm run check` 均通过。Smoke 审计仅报告 `background.js` 超过 8000 行的非阻断警告；强制体积门禁均满足，其中 `background.js` 为 `15395/15400` 行。
- 独立 `npm run e2e` 使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile、pipe transport，`1/1` 通过，验证 MV3 扩展和 Side Panel 加载。
- 未提交、未打包、未发布、未升级 Manifest 版本；验证用临时 Git 元数据在完成全部门禁后清理。

---

<a id="2026-08-03-trial-ineligible-account-reselection"></a>

## 第 10 步无试用资格后再次选择同一账号

日期：2026-08-03

关联记录：[无试用资格邮箱显示“未用”，疑似循环选择](issue-fix-archive-2026-07.md#2026-07-27-ineligible-email-exclusion-display)、[无试用资格状态被覆盖后长期显示未用](issue-fix-archive-2026-07.md#2026-07-27-ineligible-email-canonical-recovery)、[2FA 七步工作流无法细粒度恢复与连续推进](#2026-08-02-workflow-v2-ten-step-refactor)

### 故障现象与证据

用户报告第 10 步确认当前账号没有试用资格后，后续流程会直接再次使用该账号。最小内存回归使用两个脱敏邮箱模拟当前账号和下一账号：修复前注册账号状态模块没有独立的无资格落库入口，测试 `0/1` 失败；旧入口只更新匹配的自定义邮箱池条目，非邮箱池 Provider 没有统一执行来源失效和账号生命周期写入。

### 根因与影响范围

`checkRegistrationUpiTrialEligibility()` 已能把明确无资格分类为 `ineligible`，并把结果交给注册账号状态入口；但该入口仍留在 `background.js`，只调用自定义邮箱池资格更新。邮箱池存在匹配条目时可以推进选择，Hotmail 等其它 Provider 或没有匹配邮箱池条目时返回 `updated=false`，随后不会清理当前注册邮箱和来源选择，也没有把资格结论写入统一账号生命周期。自动运行结束当前失败轮后，下一次来源选择因此可能再次取得同一账号。

问题只影响结构化明确无试用资格后的账号排除和下一账号选择。资格通过、Session/AT 邮箱校验、账号封禁、网络失败、超时、5xx、HTML 响应及未知资格状态不属于该分支。

### 实现与安全边界

- 将 `markCurrentRegistrationAccountTrialIneligible` 收拢到 `background/registration-account-state.js`，由第 10 步现有资格服务继续调用，不新增错误码或第二套资格判断。
- 明确 `ineligible` 时先更新自定义邮箱池：对应条目标记无资格并从可用集合排除，选中项推进到下一条；没有匹配邮箱池条目时继续处理其它来源。
- 复用已有 `markCurrentRegistrationAccountUnavailable`，并设置 `skipCustomEmailPool=true`，让 Hotmail、别名及其它现有 Provider 按原规则失效当前来源和清理注册运行时身份，避免再次选择同一账号，同时不重复修改邮箱池。
- 通过 `accountLifecycleService.applyTrialEligibilityEvidence` 写入统一账号生命周期，并广播最新规范账号记录，保证侧栏重载后仍可恢复无资格证据。
- 只有结构化明确的 `ineligible` 进入该入口；网络、超时、5xx、HTML、字段缺失和未知状态仍保持现有失败/重试语义，不会误排除账号。账号记录不删除，密码、TOTP、任务和历史信息不因本修复清除。

### 回归覆盖

- `scripts/test-registration-account-state.cjs` 覆盖自定义邮箱池 A/B 两账号：A 无资格后写入生命周期、排除 A、清理当前身份并使下一次选择返回 B。
- 同一测试覆盖没有邮箱池匹配条目的 Provider 来源，验证仍执行已有来源失效逻辑并写入生命周期。
- 第 10 步、自动运行、免 2FA、邮箱池和账号生命周期相关测试继续验证临时失败可重试、明确无资格不可重试，以及其它路线不受影响。

### 验证与提交影响

- 新增回归 `2/2` 通过；第 10 步、自动运行、邮箱池、账号生命周期和执行器装配定向测试共 `62/62` 通过。
- `background/registration-account-state.js`、`background.js` 和新增测试的 `node --check` 通过。
- `npm test` 共 `559/559` 通过，其中仓库隔离 E2E 继续使用 `Chrome/150.0.7871.24`、临时 Profile 和 pipe transport。
- 完整 `npm run check` 通过：`404` 个受跟踪 JavaScript 文件语法通过，文档结构/链接/版本/问题索引通过，Smoke、Removed Network 和 Phone/SMS 审计通过。Smoke 仅保留 `background.js` 超过 8000 行的非阻断警告，实际 `15349` 行仍低于强制上限 `15400`。
- 未提交、未打包、未发布、未修改 Manifest 版本、权限、邮箱协议、资格标准、凭据格式或账号封禁策略。

---

<a id="2026-08-03-step7-current-password-challenge"></a>

## 第 7 步当前密码确认页被误判并回退

日期：2026-08-03

关联记录：[2FA 七步工作流无法细粒度恢复与连续推进](#2026-08-02-workflow-v2-ten-step-refactor)、[步骤 6 出现 invalid_state 后直接停止或误判成功](issue-fix-archive-2026-07.md#2026-07-26-step6-invalid-state-restart)

### 故障现象与证据

用户提供的脱敏失败诊断显示，固定十步流程的第 7 步点击 ChatGPT Security 中的 Password 后，认证标签页进入 `/log-in/password`，页面要求先完成当前密码确认。修复前该页面被记录为 `unknown`，第 7 步在同一账号上多次重新打开密码入口，始终没有建立 `gptPasswordResetStage=new_password_ready`；用户随后手动执行第 8 步时收到 `SET_GPT_PASSWORD_SESSION_EXPIRED`，提示第 7 步检查点不存在或账号已变化。归档不保存截图中的真实邮箱、密码、验证码、Cookie、请求标识或 URL 敏感参数。

### 根因与影响范围

`content/signup-page.js` 的设置密码状态机只接受邮箱验证码页、邮箱已验证页和新密码页，没有把 OpenAI 合法的 `/log-in/password` 当前密码确认页纳入第 7 步状态。Background 发起密码重置时也只传递目标邮箱，没有把已经绑定到同一账号的现有密码短暂交给认证页。因此页面跳转本身成功，却被后续准备逻辑当作重置状态未建立，进入已有的有限第 7 步重启，最终仍无法建立第 8 步检查点。

问题只影响第 7 步 Password 入口需要 recent-auth 当前密码确认的账号。直接进入邮箱验证码页、新密码页或邮箱已验证页的原流程不变；第 8 步的同邮箱新密码页检查点、邮箱取码、Resend、账号封禁、试用资格和安全因子逻辑不在本次行为修改范围内。

### 实现与安全边界

- 设置密码页面状态增加 `current_password_page`，只在认证路由为 `/log-in/password` 且存在可填写密码输入框时成立；该页面不再作为 `unknown` 触发第 7 步重开。
- Background 只读取已经通过 `passwordAccountIdentifier` 绑定到本轮邮箱的现有密码，并仅在第 7 步的 `START_SET_GPT_PASSWORD_RESET` / `PREPARE_SET_GPT_PASSWORD` 消息中短暂传递。属于其它账号的密码按空值处理，禁止借用。
- Content Script 在提交前必须取得页面显示的完整邮箱并与本轮邮箱一致；随后复用现有 `fillSignupPasswordPageAndSubmit()` 完成填写和原生表单提交，不新增第二套密码 DOM 操作。
- 当前密码通过后继续等待邮箱验证码页、邮箱已验证页或新密码页；只有到达新密码页后才由第 7 步建立检查点。页面邮箱缺失或不一致、没有已绑定密码、密码被拒绝及会话失效继续复用 `SET_GPT_PASSWORD_SESSION_EXPIRED`，不新增错误码。
- 第 7 步内部的页面准备、当前密码提交、验证码填写和恢复日志统一使用 `fetch-gpt-password-code`；第 8 步继续使用 `set-gpt-password`。消息结果和状态检查点不保存当前密码、验证码、Cookie 或页面请求标识。

### 回归覆盖

- `scripts/test-signup-password-transition.cjs` 运行真实状态函数片段，覆盖 `/log-in/password` 被识别为 `current_password_page`，并锁定复用共享密码提交器及第 7 步节点键。
- `scripts/test-set-gpt-password-session-expiry.cjs` 覆盖同邮箱已绑定密码在首次与恢复请求中保持一致、其它账号密码不会发送、第 8 步仍拒绝缺失检查点执行，以及已有的有限第 7 步恢复边界。
- `scripts/test-set-gpt-password-resend.cjs` 和 `scripts/test-custom-email-latest-notification.cjs` 继续覆盖 Password 入口慢渲染、Resend、登录通知过滤、取码耗尽保留现场和步骤 7/8 职责隔离。

### 验证与提交影响

- 修复前两条新增回归分别因缺少 `currentPassword` 消息字段和 `current_password_page` 状态而失败；修复后四个定向测试文件共 `29/29` 通过。
- `content/signup-page.js`、`content/signup-password-page.js` 和 `background/steps/set-gpt-password.js` 的 `node --check` 通过。
- `npm test` 共 `562/562` 通过；其中隔离浏览器 E2E 使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时 Profile 和 pipe transport，通过 MV3 扩展与 Side Panel 验证。
- 完整 `npm run check` 通过：`404` 个受跟踪 JavaScript 文件语法通过，`562/562` 测试通过，文档结构、链接、版本、问题索引、Smoke、Removed Network 和 Phone/SMS 审计通过。`content/signup-page.js` 为 `6994/7000` 行；Smoke 仅保留 `background.js` 超过 8000 行的既有非阻断警告，实际 `15349` 行仍低于强制上限 `15400`。
- 未提交、未打包、未发布、未修改 Manifest 版本、扩展权限、邮箱 Provider 协议、资格标准、账号封禁策略或凭据持久化格式。

---

<a id="2026-08-03-step7-chatgpt-session-expired-modal"></a>

## 第 7 步会话过期弹窗被误判为 Password 入口慢渲染

日期：2026-08-03

关联记录：[步骤 6 出现 invalid_state 后直接停止或误判成功](issue-fix-archive-2026-07.md#2026-07-26-step6-invalid-state-restart)、[第 7 步当前密码确认页被误判并回退](#2026-08-03-step7-current-password-challenge)

### 故障现象与证据

用户提供的脱敏失败诊断显示，第 7 步停在 `https://chatgpt.com/#settings/Security` 后多次记录“密码入口仍在渲染”，最后报“认证页 内容脚本 75 秒内未响应”。同一时刻截图中的 ChatGPT 设置页已经显示韩文会话过期弹窗，标题为“세션이 만료되었습니다”，正文要求重新登录后继续使用。诊断快照仍将页面记录为 `state=unknown`、`hasPasswordInput=false`、`hasSubmitButton=false`，证明流程没有识别该终止状态。归档不保存真实邮箱、密码、验证码、Cookie、请求标识或敏感 URL 参数。

### 根因与影响范围

`content/auth-page-recovery.js` 只识别 OpenAI 认证错误页的 `Session ended + error_code: invalid_state`，没有识别 ChatGPT 主站设置弹窗的多语言“会话已过期 + 登录继续”组合语义。`content/signup-page.js` 因而让 `getSetGptPasswordPageState()` 返回 `unknown`，而 `waitForChatGptSettingsPasswordAction()` 在等待 Password DOM 的循环中也没有重新检查会话终止状态。第 7 步持续消耗同页渲染预算，错误最终被内容脚本响应超时覆盖。

问题影响第 7 步停留在 ChatGPT Security 设置页期间发生登录会话过期的账号。正常 Password 行慢渲染、`/log-in/password` 当前密码确认、邮箱验证码、新密码页和已有的 `invalid_state` 恢复路径保持原行为。

### 实现与安全边界

- 认证恢复助手增加 ChatGPT 会话过期弹窗探针，要求同时命中过期标题语义和重新登录继续语义；覆盖英文、中文、韩文、日文和印地文，避免仅凭页面中普通的 `session` 或 `login` 字样误判。
- 设置 GPT 密码页面状态把该探针映射为 `session_expired_page` 和 `errorCode=chatgpt_session_expired`，复用现有 `SET_GPT_PASSWORD_SESSION_EXPIRED` 错误协议。
- Security Password 入口等待循环每轮先复核页面状态，命中后立即终止，不再等待 Password DOM 或让真实原因被 75 秒通信错误覆盖。
- 修复不会自动点击弹窗中的登录按钮，不清理 Cookie，不切换邮箱或账号，不生成密码，不改变第 7→8 步检查点和外层有限恢复边界。

### 回归覆盖

- `scripts/test-set-gpt-password-session-expiry.cjs` 使用截图中的韩文弹窗文本，验证底层探针返回真；原有 `invalid_state` 必须同时包含终止文案和精确错误码的边界继续保留。
- `scripts/test-signup-password-transition.cjs` 运行真实 `getSetGptPasswordPageState()` 函数片段，验证 Security 页弹窗返回 `session_expired_page` 和 `chatgpt_session_expired`，不再返回 `unknown`。
- `scripts/test-signup-session-page.cjs` 继续覆盖正常 Security Password 行定位，确保会话过期修复没有破坏 Password 与 Passkey 行区分。

### 验证与提交影响

- 修复前两条新增回归分别因探针不存在、真实状态仍为 `unknown` 而失败；修复后会话过期、密码页面转换、Security DOM 和 Resend 四个定向测试文件共 `27/27` 通过。
- `content/auth-page-recovery.js` 和 `content/signup-page.js` 的 `node --check` 通过；`content/signup-page.js` 保持 `6994/7000` 行，没有突破 Smoke 增长上限。
- `npm test` 共 `564/564` 通过；隔离浏览器 E2E 使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时 Profile 和 pipe transport，通过 MV3 扩展与 Side Panel 验证。
- 当前源目录没有 `.git`，直接执行 `npm run check` 和 `npm run docs:check` 会在 `git ls-files` 处被基础设施阻断。将同一工作区复制到系统临时目录并建立一次性 Git 索引后，`404` 个受跟踪 JavaScript 文件语法通过，文档结构/链接/版本/问题索引通过，Smoke、Removed Network 和 Phone/SMS 审计通过；Smoke 只保留 `background.js` 为 `15349` 行的既有非阻断警告。
- 未提交、未打包、未发布、未修改 Manifest 版本、扩展权限、邮箱 Provider 协议、资格标准、账号生命周期或凭据持久化格式。

---

<a id="2026-08-03-step8-korean-password-reuse"></a>

## 第 8 步韩文密码复用错误未触发密码替换

日期：2026-08-03

关联记录：[第 7 步当前密码确认页被误判并回退](#2026-08-03-step7-current-password-challenge)、[第 7 步会话过期弹窗被误判为 Password 入口慢渲染](#2026-08-03-step7-chatgpt-session-expired-modal)

### 故障现象与证据

用户截图显示，第 8 步的新密码表单在提交后明确显示韩文错误“비밀번호를 재사용할 수 없습니다”，含义为不能重复使用密码。脱敏失败诊断同时显示页面持续被分类为 `new_password_page`：流程提交当前 GPT 密码后等待约 60 秒，按 `2/3`、`3/3` 再次提交同一个密码，最终报“GPT 密码提交后未确认成功”，并反复回到第 7 步重新开始授权流程。归档不保存真实邮箱、密码、验证码、Cookie、请求标识或敏感 URL 参数。

### 根因与影响范围

`content/signup-page.js` 的密码字段错误提取器和复用错误分类器覆盖了既有英文、中文、日文与印地文语义，但没有覆盖 OpenAI 韩文界面的“비밀번호 + 재사용”组合。页面错误因此没有进入 `passwordReused` 结果，Background 只看到仍处于 `new_password_page`，沿用普通页面未完成的同密码重提和外层第 7 步恢复。`background/steps/set-gpt-password.js` 的防御性复用分类器同样缺少韩文，即使错误文本被上送也无法触发替换。

问题只影响第 8 步遇到韩文密码复用限制的账号。正常新密码提交、其它已支持语言的密码复用、非复用字段校验、步骤 7 取码与检查点、账号身份绑定、会话失效和后续安全因子流程不在本次行为修改范围内。

### 实现与安全边界

- `getResetPasswordFieldErrorText()` 的字段错误模式增加韩文密码校验语义，使密码输入框附近的“비밀번호를 재사용할 수 없습니다”可被提取，不再作为无错误的新密码页处理。
- Content Script 的 `isResetPasswordReuseErrorText()` 与 Background 的 `isSetGptPasswordReuseErrorText()` 同步增加韩文“재사용 / 다시 사용 / 이전에 사용 / 같은 비밀번호”匹配，前后两层必须同时确认明确的复用语义。
- 命中后继续返回既有 `passwordReused: true`，由 Background 调用 `generateReplacementGptPassword(...)` 生成不同密码、写入本轮状态并在第 8 步重试；不新增密码算法、错误码或另一套恢复流程。
- 普通字段错误、未知页面状态和会话失效不会进入密码替换路径。本修复不重新取码、不清 Cookie、不切换邮箱或账号，也不放宽第 7→8 步同邮箱检查点。

### 回归覆盖

- `scripts/test-signup-password-transition.cjs` 执行真实源码函数片段，以截图中的韩文文本验证字段错误提取器返回完整错误、Content Script 复用分类器返回真、Background 防御性分类器也返回真。
- 新回归先在修复前运行并因提取结果为空字符串而失败，证明测试能够复现漏识别；补充韩文模式后转绿。
- 原有密码页面状态、当前密码确认、会话过期与步骤 7/8 职责边界测试继续运行，确保新增语言匹配不会把普通新密码页或非复用错误误判为替换密码。

### 验证与提交影响

- 密码页面转换定向测试共 `25/25` 通过；`content/signup-page.js`、`background/steps/set-gpt-password.js` 和 `scripts/test-signup-password-transition.cjs` 的 `node --check` 通过。
- `content/signup-page.js` 保持 `6994/7000` 行，没有突破 Smoke 增长上限。
- `npm test` 共 `565/565` 通过；隔离浏览器 E2E 使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时 Profile 和 pipe transport，通过 MV3 Service Worker、Side Panel、运行时消息、诊断剪贴板和零未捕获页面错误验证。
- 当前源目录没有 `.git`；在系统临时目录的一次性 Git 索引副本中验证后，`404` 个受跟踪 JavaScript 文件语法通过，文档结构/链接/版本/问题索引通过，Smoke、Removed Network 和 Phone/SMS 审计通过。Smoke 只保留 `background.js` 为 `15349` 行的既有非阻断警告；静态门禁未连接用户安装的浏览器或真实 Profile。
- 未提交、未打包、未发布、未修改 Manifest 版本、扩展权限、邮箱 Provider 协议、账号身份、Cookie、资格标准、安全因子流程或凭据持久化格式。

---

<a id="2026-08-03-step10-ineligible-post-auth-restart"></a>

## 第 10 步无资格后错误回退第 7 步

日期：2026-08-03

关联记录：[第 10 步无试用资格后再次选择同一账号](#2026-08-03-trial-ineligible-account-reselection)、[2FA 七步工作流无法细粒度恢复与连续推进](#2026-08-02-workflow-v2-ten-step-refactor)

### 故障现象与证据

用户提供的脱敏失败诊断显示，第 9 步已经完成 2FA 开通并把账号记录写入邮箱池；随后正式第 10 步调用 UPI 资格接口，明确得到 `not-eligible`，记录“已在邮箱池标记无试用资格，不会写入 Free”，并抛出“账号未通过 UPI 试用资格检测”。紧接着自动运行却把该错误记录为“认证后链路报错”，重置第 7–10 步并让同一账号再次从第 7 步收取设置密码验证码。用户在新的第 7 步开始后手动停止。归档不保存真实邮箱、密码、TOTP 密钥、验证码、Access Token、Cookie、接口地址或敏感 URL 参数。

### 根因与影响范围

`background/steps/check-trial-eligibility.js` 已正确为明确无资格结果设置 `code=UPI_ACCOUNT_INELIGIBLE`、`trialEligibilityStatus=ineligible` 和 `retryable=false`，外层 `background/auto-run/retry-policy.js` 也已把该结构化错误分类为 `fail_upi_account_ineligible`，其预期行为是标记当前轮失败并切换下一账号。但 `runAutoSequenceFromNodeGraph()` 在错误离开节点图之前先调用 `getPostStep6AutoRestartDecision()`；该通用函数对认证链起点之后的所有错误都返回 `shouldRestart=true`，因此外层无资格策略始终没有机会执行。

问题影响第 10 步明确判定无资格且自动运行仍在节点图内部的流程。第 9 步安全因子本身已成功，不是资格检测步骤；资格接口未知结果、网络错误、缺少字段、Session 身份不一致、账号封禁和密码步骤的结构化恢复不在本次行为修改范围内。

### 实现与安全边界

- `getPostStep6AutoRestartDecision()` 在认证页探测和下游节点失效前检查结构化无资格证据；命中 `UPI_ACCOUNT_INELIGIBLE` 或 `trialEligibilityStatus=ineligible` 时返回 `shouldRestart=false`。
- 原错误随后到达既有外层轮次策略，由 `fail_upi_account_ineligible` 标记当前轮失败、取消当前轮命令、保留账号生命周期和邮箱池排除证据，并在存在后续轮次时使用新账号开始下一轮。
- 修复不把无资格当作普通重试，不重新执行第 7、8、9 步，也不清除无资格结论。只有 `UPI_ELIGIBILITY_CHECK_FAILED` 等未知或临时结果继续使用既有有限网络重试。
- 本次不修改资格判定标准、2FA/TOTP 凭据、账号密码、Cookie 清理范围、邮箱 Provider 选择或 Free 入池条件。

### 回归覆盖

- `scripts/test-auto-run-email-guard.cjs` 直接执行 `background.js` 中真实的 `getPostStep6AutoRestartDecision()` 源码片段，构造第 10 步结构化无资格错误，验证 `shouldRestart=false` 且不会调用认证页状态探针。
- 新回归在修复前实际得到 `shouldRestart=true` 并失败；增加结构化终止分支后转绿。
- 自动运行轮次策略、资格节点、账号生命周期和邮箱池排除的既有测试共同验证：明确无资格进入 `fail_upi_account_ineligible` 并选择下一账号，临时资格失败仍保持可重试。

### 验证与提交影响

- 自动运行、资格节点、账号生命周期和轮次策略定向测试共 `32/32` 通过；`background.js` 与新增回归的 `node --check` 通过。
- `npm test` 共 `566/566` 通过；隔离浏览器 E2E 使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时 Profile 和 pipe transport，通过 MV3 Service Worker、Side Panel、运行时消息、诊断剪贴板和零未捕获页面错误验证。
- 当前源目录没有 `.git`；在系统临时目录的一次性 Git 索引副本中验证后，`404` 个受跟踪 JavaScript 文件语法通过，文档结构/链接/版本/问题索引通过，Smoke、Removed Network 和 Phone/SMS 审计通过。Smoke 只保留 `background.js` 为 `15358` 行的既有非阻断警告，仍低于 `15400` 行强制上限。
- 未提交、未打包、未发布、未修改 Manifest 版本、扩展权限、资格标准、账号生命周期结构、邮箱协议、密码/TOTP 凭据格式或 Cookie 清理范围。

---

<a id="2026-08-04-no-2fa-route-reset-step7"></a>

## 免 2FA Free 路线在自动运行重置后仍执行第 7 步

日期：2026-08-04

关联记录：[2FA 七步工作流无法细粒度恢复与连续推进](#2026-08-02-workflow-v2-ten-step-refactor)、[第 10 步无资格后错误回退第 7 步](#2026-08-03-step10-ineligible-post-auth-restart)

### 故障现象与证据

用户报告已经选择“免 2FA Free”路线，但自动运行在步骤 1–6 完成后仍开始第 7 步 `fetch-gpt-password-code`。脱敏诊断显示第 7 步不是因步骤 10 无资格或密码会话错误回退，而是在本轮开始时就被视为 `pending`；用户随后手动停止。归档不保存真实邮箱、密码、验证码、Access Token、Cookie、接口凭据或敏感 URL 参数。

### 根因与影响范围

`background/auto-run/session-runner.js` 在每次全新自动运行尝试前先保存一组运行设置、调用 `resetState()`，再把设置写回。保存列表遗漏了 `registrationFreeRoute`；同时写回后没有根据恢复后的路线重新生成 `nodeStatuses`。因此重置过程若从持久化设置或默认状态得到 `full-2fa`，第 7–9 步会按完整 2FA 路线初始化为 `pending`，即使侧栏在启动前已经保存了 `no-2fa-free`。

问题影响自动运行以全新尝试启动或重置的免 2FA Free 路线。手动节点执行、续跑已有节点进度、完整 2FA、Passkey、步骤 10 资格判定，以及明确无资格后的轮次失败策略不属于本次行为修改范围。

### 实现与安全边界

- 自动运行的新尝试把 `registrationFreeRoute` 纳入跨重置保留的设置。
- `resetState()` 完成后，运行器读取实际重置状态并合并保留设置，再通过步骤定义的 `getDefaultNodeStatuses()` 按最终路线重新生成节点图；同时清空 `currentNodeId`，避免旧节点指针与新路线不一致。
- Background 显式向自动运行会话运行器注入步骤定义函数；运行器仍保留无该依赖时的兼容路径，不改变独立测试或旧加载环境的其它设置恢复行为。
- 免 2FA Free 路线因此保持第 7–9 步 `skipped`，第 10 步 `persist-no-2fa-free` 保持 `pending`。修复不绕过资格保存，不把账号提前写入 Free，也不修改密码、TOTP、Passkey、邮箱池或 Cookie 数据。

### 回归覆盖

- `scripts/test-auto-run-session-runner.cjs` 使用真实会话运行器构造免 2FA 状态，并让测试 `resetState()` 模拟过时的完整 2FA 节点图；验证执行步骤前路线仍为 `no-2fa-free`，第 7–9 步为 `skipped`，第 10 步为 `pending`。
- 新回归在修复前实际得到 `registrationFreeRoute=full-2fa` 并失败；保留路线和重新生成节点状态后转绿。
- 工作流十步定义和免 2FA 保存节点既有测试继续覆盖三条路线的固定十步结构、免 2FA 第 7–9 步默认跳过，以及第 10 步账号身份和资格持久化边界。

### 验证与提交影响

- 自动运行会话、十步工作流和免 2FA 保存节点定向测试共 `22/22` 通过；`background/auto-run/session-runner.js`、`background.js` 和新增回归的 `node --check` 通过。
- `npm test` 共 `567/567` 通过；隔离浏览器 E2E 使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时 Profile 和 pipe transport，通过 MV3 Service Worker、Side Panel、运行时消息、诊断剪贴板和零未捕获页面错误验证。
- 当前源目录没有 `.git`；在系统临时目录的一次性 Git 索引副本中验证后，`404` 个受跟踪 JavaScript 文件语法通过，文档结构/链接/版本/问题索引通过，Smoke、Removed Network 和 Phone/SMS 审计通过。Smoke 只保留 `background.js` 为 `15360` 行的既有非阻断警告，仍低于 `15400` 行强制上限；`background/auto-run/session-runner.js` 保持 `1100/1100` 行。
- 未提交、未打包、未发布、未修改 Manifest 版本、扩展权限、资格标准、账号数据结构、邮箱 Provider 协议、密码/TOTP/Passkey 凭据格式或 Cookie 清理范围。

---

<a id="2026-08-04-session-export-select-dark-contrast"></a>

## 深色主题下 Session 导出选项文字不可见

日期：2026-08-04

关联记录：[Free Account Tool V3.0.0 移除 CDK 与 Plus 全链路](#2026-08-04-free-account-tool-v3-removal)、[V3 两个 Free 分组入口藏在首屏之外](#2026-08-04-free-groups-entry-hidden-below-fold)

### 故障现象与证据

用户截图显示 Free 组工具栏的“凭据”下拉框在深色主题中展开后，当前 `AT` 选项使用蓝底白字，但未选中的 `Session` 使用白色系统背景和接近白色的文字，几乎无法辨认。截图只包含界面控件，不包含账号邮箱、密码、AT、Session 内容、2FA/Passkey、Cookie 或其它敏感凭据。

### 根因与影响范围

导出选择框本身使用 `var(--text-primary)`，深色主题下该变量是浅色文字；但 Windows Chrome 的原生 `<select>` 弹出选项没有继承控件背景，而是使用系统白色菜单背景。原样式没有声明 `color-scheme`，也没有为 `<option>` 指定主题背景和文字颜色，因此形成白底浅字。

问题只影响 AT/Session 导出模式选择框的视觉可读性。当前模式值、两个 Free 分组同步切换、导出文件内容、第 10 步 Session 落库、资格判断和账号数据均未出错。

### 实现与安全边界

- 选择框增加稳定的内边距、边框、字段背景和焦点轮廓基础，使闭合状态与账号面板其它输入控件一致。
- 浅色主题显式使用 `color-scheme: light`，原生选项固定为白底深字。
- 深色主题显式使用 `color-scheme: dark`，原生选项固定为深底浅字；当前选项仍由浏览器使用标准高亮色展示。
- 修复不自绘下拉弹层、不修改选项值或事件逻辑，不影响 Windows 之外浏览器的键盘、鼠标和辅助功能操作。

### 回归覆盖

- `scripts/test-extension-e2e.cjs` 在隔离 Chrome for Testing 中切换两个分组的导出模式，并在深色主题下读取选择框与 `Session` 选项的实际计算样式。
- 回归要求选择框 `colorScheme=dark`，选项文字为 `rgb(237, 245, 243)`，背景为 `rgb(29, 39, 42)`，避免再次退回白底浅字。

### 验证与发布影响

- `npm run syntax` 通过，共检查 `290` 个 JavaScript 文件；`npm test` 共 `375/375` 通过。
- `npm run audit` 通过：文档结构、链接、版本和问题索引一致，V3 Smoke 检查 `149` 个运行时文件，Removed Network 与 Phone/SMS 审计无残留。
- `npm run e2e` 独立通过 `1/1`；使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport。
- 当前目录没有 `.git`，因此未提交、未创建标签、未打包、未发布，也未修改 Manifest 版本、扩展权限、资格标准、Session/AT 导出格式或账号结果 schema。用户需要在 `chrome://extensions` 重新加载扩展，使新的 Side Panel 样式生效。

---

<a id="2026-08-04-free-group-toolbar-alignment"></a>

## 两个 Free 分组的工具栏公共操作不对齐

日期：2026-08-04

关联记录：[Free Account Tool V3.0.0 移除 CDK 与 Plus 全链路](#2026-08-04-free-account-tool-v3-removal)、[深色主题下 Session 导出选项文字不可见](#2026-08-04-session-export-select-dark-contrast)

### 故障现象与证据

用户截图显示 Free 组的工具栏以“导入 Free”开头，并把“取件地址”插在导出与删除之间；无资格 Free 组则直接从“凭据”开始。相同的导出、删除、补充 AT、刷新 AT 和批量复检操作因此起点、顺序和换行位置均不一致，两个分组上下对照时明显不对称。截图中的账号数量均为零，不包含邮箱、密码、AT、Session、2FA/Passkey、Cookie 或其它敏感凭据。

### 根因与影响范围

`sidepanel/account-records-membership-results-renderer.js` 把公共操作和 Free 专属操作渲染在同一个可换行 Flex 容器中，并按业务添加顺序交错排列。Free 组多出的两个按钮会参与同一行宽计算，把最后一个公共按钮挤到下一行；无资格 Free 组没有这两个按钮，因此布局不同。

问题仅影响两个分组工具栏的视觉层级和对齐。导入目标、取件地址开关、AT/Session 导出、删除、AT 补充/刷新、资格复检、运行时锁和账号数据均未发生逻辑错误。

### 实现与安全边界

- 两个分组统一建立 `free-account-common-actions` 公共操作行，固定顺序为“凭据、导出、删除全部、补充 AT、刷新 AT、批量复检资格”；运行中的“停止检测”继续追加在公共行末尾。
- Free 组独有的“导入 Free”和“取件地址”移动到 `free-account-group-actions` 专属操作行，通过分隔线与公共操作区分；无资格 Free 组不增加不适用的占位按钮或功能。
- 两行内部仍允许在窄侧栏中自然换行，按钮事件继续使用原有 `data-*` 属性和容器事件委托；不修改消息类型、存储 schema、导出内容或资格分组规则。

### 回归覆盖

- `scripts/test-account-records-manager.cjs` 验证两个分组都生成公共操作行，只有 Free 组生成专属操作行，并检查公共按钮顺序以及专属按钮未混入公共行。
- `scripts/test-extension-e2e.cjs` 在隔离 Chrome for Testing 中打开真实账号面板，测量两个公共操作行的实际左边界相同，并验证 Free 专属操作行位于公共行下方。

### 验证与发布影响

- 定向渲染回归 `4/4` 通过；`npm run syntax` 通过，共检查 `290` 个 JavaScript 文件；`npm test` 共 `375/375` 通过。
- `npm run e2e` 独立通过 `1/1`；实际使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport，Side Panel 无未捕获页面错误。
- `npm run audit` 通过：文档结构、链接、版本和问题索引一致，V3 Smoke 检查 `149` 个运行时文件，Removed Network 与 Phone/SMS 审计无残留。
- 当前目录没有 `.git`，因此未提交、未创建标签、未打包、未发布，也未修改 Manifest 版本、扩展权限、资格标准、Free 结果 schema 或 AT/Session 导出格式。用户需要在 `chrome://extensions` 重新加载扩展后查看新布局。

---

<a id="2026-08-04-full-2fa-route-stale-no2fa-state"></a>

## 完整 2FA 路线混入免 2FA 的跳过与完成状态

日期：2026-08-04

关联记录：[免 2FA Free 路线在自动运行重置后仍执行第 7 步](#2026-08-04-no-2fa-route-reset-step7)、[免 2FA 下一轮仍显示第 10 步完成](#2026-08-04-auto-run-reset-stale-step10-ui)、[免 2FA 第 9 步固定跳过却显示蓝色高亮](#2026-08-04-route-skipped-step9-active-style)

### 故障现象与证据

用户截图显示已经选择完整 2FA 路线，但第 7 步“收取设置密码验证码”和第 8 步“设置 GPT 密码”仍使用蓝色跳过状态，顶部状态栏继续显示“节点 security-factor-not-required 已完成”，进度为 `2 / 10`。第 9 步标题已经切换为完整路线的“设置或校验 2FA”，说明步骤定义与运行状态属于不同路线。截图不包含邮箱、密码、验证码、AT、Session、2FA 密钥、Passkey、Cookie 或其它敏感凭据。

隔离 Chrome for Testing 使用旧免 2FA 状态启动 Side Panel 后切换到完整 2FA，修复前稳定得到 `step7Class="step-row skipped"`、`step8Class="step-row skipped"` 和 `displayStatus="节点 security-factor-not-required 已完成"`。进一步捕获 `SAVE_SETTING` 响应得到 `{ error: "root is not defined" }`，后台路线仍为 `no-2fa-free`，与用户截图一致。

### 根因与影响范围

- Side Panel 切换路线时先重建新路线步骤定义，但 `syncStepDefinitionsForMode()` 会把旧 `nodeStatuses` 合并到新定义。免 2FA 的第 7、8 步 `skipped` 因节点 ID 与完整路线相同而被保留，旧 `currentNodeId=security-factor-not-required` 也未即时清空。
- `background/routes/settings-routes.js` 的模块包装器调用 `factory()` 时没有把 `root` 传入，但路线变化分支却读取 `root.MultiPageStepDefinitions`。普通设置保存不经过该分支，因此长期未暴露；路线切换进入分支后抛出 `ReferenceError`，新路线和干净节点图无法持久化。

问题影响完整 2FA、Passkey 与免 2FA 之间的人工路线切换。它不会直接执行错误节点或修改账号凭据，但会造成 Side Panel 与 Background 路线不一致；重新打开侧栏后可能恢复旧路线，继续操作时会依据错误的跳过状态判断进度和可执行按钮。

### 实现与安全边界

- Side Panel 在检测到 `registrationFreeRoute` 实际变化时，立即使用新路线的 `NODE_DEFAULT_STATUSES` 替换旧节点图，同时清空 `currentNodeId`、同步新路线值并刷新步骤与顶部状态，不再等待后台保存完成后才纠正界面。
- Background 设置路由工厂现在显式接收 `rootScope`，路线变化分支从该作用域读取工作流版本和默认节点状态；保存成功后写入新路线、空 `currentNodeId` 和只包含新路线节点的状态图。
- 路线切换仍遵守现有自动运行锁和设置保存机制。本修复不改变十步定义、各路线默认跳过规则、资格标准、邮箱选择、账号凭据、AT/Session、Cookie 或远端接口调用。

### 回归覆盖

- `scripts/test-background-settings-routes.cjs` 从包含 `security-factor-not-required=completed` 和第 7、8 步 `skipped` 的免 2FA 状态切换到完整 2FA；修复前稳定抛出 `ReferenceError: root is not defined`，修复后验证路线、空当前节点和完整 2FA 默认节点图全部写入。
- `scripts/test-extension-e2e.cjs` 在临时隔离 Profile 中注入与截图一致的旧状态，重新加载真实 Side Panel 后切换完整 2FA；验证第 7、8 步不含跳过类、旧免 2FA 节点消失、完整 2FA 第 9 步存在、顶部不再显示旧节点，并复查后台持久状态。

### 验证与发布影响

- 后台设置路由定向测试 `6/6` 通过；`npm run syntax` 通过，共检查 `290` 个 JavaScript 文件；`npm test` 共 `376/376` 通过。
- `npm run e2e` 独立通过 `1/1`；实际使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport，MV3 Service Worker、Side Panel、路线即时状态与后台持久状态均通过，页面无未捕获错误。
- `npm run audit` 通过：文档结构、链接、版本和问题索引一致，V3 Smoke 检查 `149` 个运行时文件，Removed Network 与 Phone/SMS 审计无残留。
- 当前目录没有 `.git`，因此未提交、未创建标签、未打包、未发布，也未修改 Manifest 版本、扩展权限、工作流版本、账号结果 schema 或凭据格式。用户需要在 `chrome://extensions` 重新加载扩展，使 Side Panel 与 Service Worker 同时使用修复后的代码。

---

<a id="2026-08-04-step10-manual-skip-button"></a>

## 第 10 步资格落库节点仍可单独跳过

日期：2026-08-04

关联记录：[Free Account Tool V3.0.0 移除 CDK 与 Plus 全链路](#2026-08-04-free-account-tool-v3-removal)、[免 2FA 下一轮仍显示第 10 步完成](#2026-08-04-auto-run-reset-stale-step10-ui)

### 故障现象与证据

用户截图显示工作流第 10 步“验证资格并进入 Free”右侧仍有单独的“跳过”按钮。该节点负责调用资格服务并把 `eligible`、`failed`、`unknown` 或明确 `ineligible` 结果写入账号生命周期和 `freeAccountResults`；如果允许人工跳过，本轮账号可能没有可供两个 Free 分组恢复的资格记录。截图和归档不保存真实邮箱、密码、验证码、Access Token、Cookie、2FA/Passkey 或接口凭据。

隔离 Side Panel 回归在修复前确认第 10 步会生成 `.step-manual-btn`。按钮来源不是路线定义错误，而是侧栏把当前节点图中所有节点统一加入人工跳过集合，没有排除最终资格落库节点。

### 根因与影响范围

`sidepanel/sidepanel-app-controller.js` 初始化手动动作时直接使用全部 `nodeId`，路线同步和定义重建也重复构造同样的集合。因此完整 2FA/Passkey 的 `check-trial-eligibility` 与免 2FA 的 `persist-no-2fa-free` 都会得到跳过按钮。Background 的 `skipNode()` 此前也没有最终节点约束，旧 Side Panel 或直接发送 `SKIP_NODE` 消息仍可把第 10 步写成 `skipped`。

问题只影响人工跳过入口和消息防线。自动执行顺序、资格判定标准、临时失败重试、明确无资格切换下一账号、两个 Free 分组规则和第 7–9 步既有人工跳过行为不改变。

### 实现与安全边界

- `sidepanel/workflow-button-state.js` 集中定义人工可跳过节点集合，明确排除 `check-trial-eligibility` 和 `persist-no-2fa-free`。
- Side Panel 初始化、路线同步和工作流定义重建统一复用该策略，不为两个最终节点创建按钮；事件处理层再次拒绝第 10 步跳过请求。
- Background 增加相同的最终必经节点集合，`skipNode()` 在任何状态写入前拒绝请求，防止旧界面或直接运行时消息绕过前端。
- 第 7、8、9 步及其它原本允许跳过的节点继续遵循现有前置状态、运行锁和完成状态检查；本修复不新增自动点击、远端请求或账号数据迁移。

### 回归覆盖

- `scripts/test-sidepanel-workflow-button-state.cjs` 验证两个第 10 步节点永远不会进入人工跳过集合，同时保留普通节点的既有可跳过判断。
- `scripts/test-extension-e2e.cjs` 打开真实 Side Panel，断言第 10 步没有 `.step-manual-btn`，并继续验证两个 Free 分组入口、运行时消息、诊断剪贴板和零未捕获页面错误。
- `scripts/test-auto-run-email-guard.cjs` 通过 `vm` 执行 `background.js` 中真实的 `REQUIRED_FINAL_WORKFLOW_NODE_IDS` 与 `skipNode()` 源码，分别请求跳过两个路线节点，验证均抛出“第 10 步资格检测与结果保存不能跳过”，且 `setNodeStatus` 调用数保持为零。

### 验证与发布影响

- 跳过策略与后台防线定向测试共 `20/20` 通过。
- 修改后的隔离 Side Panel 截图确认第 7–10 步区域中，第 10 步右侧不再显示“跳过”；截图使用空测试数据和临时隔离 Profile。
- `npm run syntax` 通过，共检查 `290` 个 JavaScript 文件；`npm test` 共 `372/372` 通过。
- `npm run docs:check` 与 `npm run audit` 通过：文档结构、链接、版本和问题索引一致，V3 Smoke 检查 `149` 个运行时文件，Removed Network 与 Phone/SMS 审计无残留。
- `npm run e2e` 独立通过 `1/1`；使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport。
- 当前目录没有 `.git`，因此未提交、未创建标签、未打包、未发布，也未修改 Manifest 版本、扩展权限、资格标准或账号结果 schema。用户需要在 `chrome://extensions` 重新加载扩展，新的 Side Panel 与 Service Worker 防线才会生效。

---

<a id="2026-08-04-free-groups-entry-hidden-below-fold"></a>

## V3 两个 Free 分组入口藏在首屏之外

日期：2026-08-04

关联记录：[Free Account Tool V3.0.0 移除 CDK 与 Plus 全链路](#2026-08-04-free-account-tool-v3-removal)

### 故障现象与证据

用户升级到 Free Account Tool V3.0.0 后提供侧栏截图，页面首屏包含运行控制、资格配置和邮箱池，但没有 Free 组和无资格 Free 组，也没有明显的账号入口。隔离浏览器复现确认两个分组 DOM 已生成，数据渲染器和 V3 结果读取都正常；账号弹窗父容器按设计保持隐藏，唯一入口仍是日志区中的“记录”按钮。

在与截图接近的 `1440 × 1400` CSS 视口中，旧入口顶部坐标为 `1533.1875px`，已经位于首屏下方。用户需要继续滚动到页面底部、找到日志标题旁含义不明确的“记录”按钮后，才可能打开两个分组。归档不保存用户截图中的账号密码、API 配置、邮箱、AT、2FA/Passkey、Cookie 或其它敏感值。

### 根因与影响范围

V3 删除 CDK 和 Plus 界面时复用了旧账号记录弹窗及其打开逻辑，但没有重新评估入口位置和名称。`#account-records-overlay`、V3 渲染器和事件绑定均有效，问题是 `#btn-open-account-records` 仍放在 DOM 末端的日志标题栏，并继续使用旧文案“记录”。因此已有 E2E 只断言分组节点存在，未验证入口是否能在用户常用视口中发现，也未验证打开后节点是否具有真实布局宽高。

问题只影响两个 Free 分组的可发现性和弹窗展示宽度。账号数据、迁移、资格判定、导入导出、登录、AT 操作、复检、自动注册和任务状态没有丢失或改变。

### 实现与安全边界

- 将现有 `#btn-open-account-records` 从页面底部日志栏移到顶栏运行控制区，使用账号图标和明确文案“Free 账号”；继续复用原 `openPanel()`、关闭按钮和遮罩点击关闭逻辑，不建立第二套账号面板。
- 弹窗标题改为“Free 账号分组”，宽度从 `420px` 扩展到最大 `920px`，使两个分组的汇总、工具栏和账号列在桌面宽度下有足够空间。
- 顶栏保持可换行布局；`420 × 900` 窄侧栏截图验证入口仍可见，分组按钮自然换行，没有横向溢出、文字遮挡或嵌套卡片。
- 修复不自动打开或强制常驻弹窗，不遮挡注册主流程；不修改账号数据、资格分组规则、运行中只读策略、消息接口、存储、权限或远端请求。

### 回归覆盖

- `scripts/test-extension-e2e.cjs` 使用隔离 Chrome for Testing 和 `1440 × 1400` 视口，先断言“Free 账号”入口具有真实宽高且位于首屏，再点击入口并断言 Free 与无资格 Free 两个分组均具有真实布局、位于弹窗视口内。
- 回归在修复前连续两次稳定失败，记录旧入口 `top=1533.1875`；移动到顶栏后转绿。
- E2E 增加等待两个异步分组节点生成的条件，避免 Side Panel DOM 已加载但 V3 结果渲染尚未完成时产生空分组竞态。
- 额外使用 `1440 × 1400` 和 `420 × 900` 两个视口生成本地截图并人工检查桌面、窄侧栏布局；截图只使用空测试数据和临时隔离 Profile。

### 验证与发布影响

- `npm run syntax` 通过，共检查 `290` 个 JavaScript 文件。
- `npm test` 共 `370/370` 通过，包含更新后的隔离浏览器回归。
- `npm run e2e` 独立通过 `1/1`；使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport。
- 当前源码目录没有 `.git`，因此未提交、未创建标签、未打包、未发布，也未修改 Manifest 版本。用户需要在 `chrome://extensions/` 重新加载扩展，顶栏才会出现新的“Free 账号”入口。

---

<a id="2026-08-04-free-account-tool-v3-removal"></a>

## Free Account Tool V3.0.0 移除 CDK 与 Plus 全链路

日期：2026-08-04

关联记录：[第 10 步无资格后错误回退第 7 步](#2026-08-03-step10-ineligible-post-auth-restart)、[免 2FA 下一轮仍显示第 10 步完成](#2026-08-04-auto-run-reset-stale-step10-ui)、[免 2FA 第 9 步固定跳过却显示蓝色高亮](#2026-08-04-route-skipped-step9-active-style)

### 故障现象与诊断证据

用户要求账号工具移除全部 UPI、IDEAL、PIX 卡密池、兑换任务和 Plus 分组，只保留 Free 与无资格 Free。此前侧栏、Background、任务、配置和兼容数据仍围绕 CDK 渠道和 Free/Plus 投影组织；第 9、10 步的前序缺陷又证明资格状态、自动运行节点状态和账号结果之间存在多套兼容路径，明确无资格可能在界面丢失、回退旧节点或无法稳定留在独立分组。

代码盘点确认旧实现同时包含三套卡密池与 usage、兑换消息和任务、远端刷新与资源锁、Plus 识别/验证、渠道投影、兑换历史、Side Panel 卡密池和四个 Plus 操作区。旧结果键 `upiCredentialMembershipCheckResults` 还允许 `paid`、渠道和兑换字段，无法直接表达“只有明确 ineligible 才进入无资格组”的 V3 规则。档案不保存真实账号、密码、2FA/Passkey、AT、Cookie、API Key、CDK、代理或敏感 URL 参数。

### 根因与影响范围

旧数据模型把资格、会员、兑换渠道和兑换结果耦合在同一会员结果及兼容投影中。Side Panel 的分组和操作因此依赖 `paid`、UPI/IDEAL/PIX 渠道、兑换状态及多组 tombstone；Background 也需要维护兑换任务、外部副作用账本、CDK 占用/释放和 Plus 状态同步。即使只想管理 Free 资格，旧字段仍可能从配置导入、状态归一化、旧任务恢复或侧栏回写重新进入运行状态。

本次影响账号规范模型、资格落库、Side Panel 账号区、消息路由、任务 schema、设置导入导出、一次性升级迁移、Manifest 权限、静态审计、文档和浏览器 E2E。邮箱 Provider、十步注册主体、2FA/Passkey 登录、密码设置、AT 获取及账号有效性继续保留。

### 实现变化

- 扩展更名为 `Free Account Tool`，Manifest、package 和侧栏版本统一为 `3.0.0`。
- 新增 `freeAccountResults` / `schemaVersion: 3`。`eligible`、`unknown`、`checking`、`failed` 归入 Free；只有明确 `ineligible` 归入无资格 Free。每行保留身份、凭据、启用状态、来源和资格证据，移除 CDK、渠道、兑换和 Plus 字段。
- 账号规范模型的 `membershipStatus` 只接受 `unknown`、`free`，删除 `membershipChannel`、`paidChannels` 和 `redemption`。账号有效性独立保留，已停用或无效账号不会因迁移恢复启用。
- 第 10 步三条路线统一先写账号生命周期和 V3 结果，再完成节点或抛出结构化无资格错误。明确无资格排除当前邮箱、结束本轮并选择下一账号；网络、超时、5xx、HTML 响应和字段缺失只记为 `failed`，不进入无资格组。
- Side Panel 只渲染 Free 与无资格 Free，汇总显示总账号、有资格、待检测、检测失败、无资格和缺 AT。保留导入、分组导出、删除、启停、登录、补充/刷新 AT、单个和批量复检；自动注册运行期间只允许查看和导出。
- 新增并接入 `GET/IMPORT/EXPORT/DELETE/CHECK/LOGIN/FILL/REFRESH/STOP_FREE_ACCOUNT_*` 消息。任务只保留 `check_eligibility` 资格复检，删除 `redeem`、`verify_membership` 及兑换/Plus 消息。
- 删除兑换目录、UPI 兑换步骤、外部副作用账本、CDK 路由、远端刷新服务、Plus 验证和兑换服务、卡密池/Plus Side Panel 模块及相关脚本清单；删除 `chong.nerver.cc` 权限和 DNR 规则，保留资格、2FA 和 Passkey 仍依赖的 `cha.nerver.cc`。
- 普通文本导入默认创建 `unknown` Free，支持 `---` 和 Passkey 元数据；V3 JSON 可恢复明确无资格证据。配置 schema 升到 V3，旧 CDK、兑换和 Plus 字段导入时被忽略。

### 迁移与安全边界

- `freeAccountToolV3MigrationCompleted` 保证一次性迁移。迁移合并旧会员结果、账号生命周期和自定义邮箱池中的明确无资格证据，删除 `paid` 行，并为只有生命周期证据的账号创建无资格 Free 结果。
- 迁移保留邮箱、密码、2FA/Passkey、AT、取件地址、来源、启用状态、账号有效性和运行历史；清除三套卡密池及别名、usage、兑换配置、旧兑换/会员任务、Plus 分类、渠道和 `redemption` 数据。
- 新数据、清理后的账号记录、任务和迁移标记先写入；只有写入成功才删除旧存储键。写入失败不设置完成标记、不删除旧数据，下次 Service Worker 启动重试。
- 历史 Plus 账号只保留基础账号记录，不会自动进入两个 Free 分组；必须经过资格复检产生新结果。无资格复检转为有资格时清除排除原因，但不会把已使用邮箱恢复为未使用。
- 迁移与安全脱敏路径可以识别历史 CDK/Plus 字段以便删除或遮蔽；当前运行时、消息和 UI 不再使用这些字段。`Outlook Email Plus` 作为邮箱 Provider 名称不属于账号 Plus 分组，保持不变。

### 回归覆盖

- `scripts/test-free-account-v3.cjs` 覆盖五种资格状态分组、规范账号 schema、历史 Plus/CDK/任务迁移、迁移写入失败保留旧数据、资格检查结果落库、文本/V3 JSON 导入、分组导出和删除。
- 工作流测试覆盖完整 2FA、免 2FA、Passkey 第 10 步，明确无资格切换下一账号、临时失败可重试，以及新轮次不会保留上一轮第 9/10 步视觉高亮。
- Side Panel 测试覆盖两个 Free 分组、V3 汇总、单个/批量复检入口和自动运行期间只读。
- V3 Smoke 审计检查新模块与消息、已删除文件、Manifest 权限、账号 schema、任务类型和运行时旧字段残留；Removed Network 与 Phone/SMS 审计继续验证其它已删除能力没有回流。

### 验证与发布影响

- `npm run syntax` 通过，共检查 `290` 个 JavaScript 文件。
- `npm test` 通过，共 `370/370` 项；其中包含隔离浏览器测试，并验证 `Chrome/150.0.7871.24`、临时 Profile 和 pipe transport。
- `npm run docs:check` 通过，文档路径、相对链接、Manifest/CHANGELOG 版本和问题索引锚点一致。文档检查器在无 `.git` 源码快照中使用工作区枚举回退，不需要伪造 Git 元数据。
- `npm run audit` 通过：V3 Smoke 检查 `149` 个运行时文件，Removed Network 与 Phone/SMS 均无残留。Phone/SMS 审计目标已从删除的旧会员/CDK 模块切换到 V3 Free 服务、迁移、共享结果和新渲染器。
- `npm run e2e` 独立通过 `1/1`；使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport，验证 MV3 Service Worker、Side Panel、运行时消息、诊断剪贴板和零未捕获页面错误。
- 当前目录没有 `.git`，因此未提交、未创建标签、未打包、未发布。Manifest 和 package 已升级为 `3.0.0`；用户需要在 `chrome://extensions/` 重新加载扩展，使新的 MV3 Service Worker 和一次性迁移生效。

---

<a id="2026-08-04-route-skipped-step9-active-style"></a>

## 免 2FA 第 9 步固定跳过却显示蓝色高亮

日期：2026-08-04

关联记录：[免 2FA 下一轮仍显示第 10 步完成](#2026-08-04-auto-run-reset-stale-step10-ui)、[免 2FA Free 路线在自动运行重置后仍执行第 7 步](#2026-08-04-no-2fa-route-reset-step7)

### 故障现象与证据

用户截图显示免 2FA 路线的第 7、8 步以灰色“当前路线跳过”展示，但同属固定路线跳过的第 9 步“无需设置 2FA / Passkey”显示蓝色“跳过”徽标和蓝色节点边框，看起来仍处于可操作或高亮状态。用户明确期望第 9 步与第 7、8 步一致。截图和归档不保存真实邮箱、密码、验证码、Access Token、Cookie 或接口凭据。

### 根因与影响范围

步骤定义已正确为免 2FA 第 7–9 步设置 `applicability=route-skipped`、`defaultStatus=skipped` 和 `ui.statusText=当前路线跳过`。但 `sidepanel/workflow-state-view.js` 在实时渲染节点状态时只在 `pending` 状态使用 `ui.statusText`，收到真实 `skipped` 状态后改用通用“跳过”图标；同时行级样式使用通用 `.step-row.skipped`，因此显示为蓝色。第 7、8 步此前呈灰色是因为旧侧栏状态曾保留为 `pending`，不是路线跳过展示本身正确区分。

问题影响所有 `route-skipped` 节点在状态同步后的视觉语义。后台节点图、跳过状态、进度计算、自动执行顺序和第 10 步资格保存没有错误；普通人工跳过节点仍应使用蓝色“跳过”状态，不属于本次修改范围。

### 实现与安全边界

- 工作流列表首次生成时，`route-skipped` 行固定采用中性的 `pending route-skipped` 视觉类，不再短暂套用通用蓝色 skipped 样式。
- 实时状态渲染识别行上的 `data-route-skipped=true`：状态文字始终使用步骤定义的 `ui.statusText`，行视觉保持灰置；底层 `nodeStatuses` 仍为 `skipped`，所以进度计数和前置节点完成判断保持原语义。
- 普通 `skipped`、`manual_completed`、失败、运行和完成节点继续使用既有颜色与徽标；修复不改变按钮权限、节点执行、路线定义、资格判断或账号数据。

### 回归覆盖

- `scripts/test-sidepanel-workflow-state-view.cjs` 新增路线跳过实时渲染回归，构造 `security-factor-not-required=skipped`，验证状态文字为“当前路线跳过”，行类为 `step-row pending route-skipped`。修复前实际显示“跳过”并失败。
- 自动运行重置、侧栏消息处理和十步工作流既有测试继续覆盖免 2FA 第 7–9 步底层均为 `skipped`，第 10 步为本轮待执行。

### 验证与提交影响

- 侧栏工作流视图、自动运行重置、运行时消息和十步定义定向测试共 `22/22` 通过；相关生产文件和回归测试的 `node --check` 通过。
- `npm test` 共 `569/569` 通过，包含隔离 Chrome for Testing 的 MV3 Service Worker、Side Panel、运行时消息、诊断剪贴板和零未捕获页面错误验证。
- 当前源目录没有 `.git`；在系统临时目录的一次性 Git 索引副本中验证后，`405` 个受跟踪 JavaScript 文件语法通过，文档结构/链接/版本/问题索引通过，Smoke、Removed Network 和 Phone/SMS 审计通过。Smoke 只保留 `background.js` 为 `15360` 行的既有非阻断警告，仍低于 `15400` 行强制上限。
- 未提交、未打包、未发布、未修改 Manifest 版本、扩展权限、资格标准、账号数据结构、邮箱 Provider 协议、密码/TOTP/Passkey 凭据格式或 Cookie 清理范围。

---

<a id="2026-08-04-auto-run-reset-stale-step10-ui"></a>

## 免 2FA 下一轮仍显示第 10 步完成

日期：2026-08-04

关联记录：[免 2FA Free 路线在自动运行重置后仍执行第 7 步](#2026-08-04-no-2fa-route-reset-step7)

### 故障现象与证据

用户截图显示自动运行已经进入第 `3/29` 轮并正在执行第 5 步，但免 2FA 路线的第 10 步“验证资格并进入 Free”仍显示绿色“完成”，顶部进度也提前计入该节点。第 7、8 步显示当前路线跳过，说明路线本身已正确恢复；异常仅存在于下一轮侧栏节点状态。截图和归档不保存真实邮箱、密码、验证码、Access Token、Cookie 或接口凭据。

### 根因与影响范围

Background 在新一轮开始前已经按 `no-2fa-free` 重建并持久化节点图，第 10 步 `persist-no-2fa-free` 的真实状态是 `pending`。但 `AUTO_RUN_RESET` 消息没有携带这份节点图；Side Panel 处理消息时使用创建消息处理器时捕获的 `NODE_DEFAULT_STATUSES`。该缓存可能属于初始化时的完整 2FA 路线，只包含 `check-trial-eligibility`，不包含免 2FA 的 `persist-no-2fa-free`。`syncLatestState()` 又采用合并语义，因此上一轮 `persist-no-2fa-free=completed` 没有被覆盖，持续显示完成。

问题影响自动运行跨轮次切换时的路线专属节点显示和进度计数。Background 的真实节点状态、第 10 步实际执行时机、资格判断和账号持久化没有被提前完成；完整 2FA、Passkey 与免 2FA 的业务节点实现不属于本次修改范围。

### 实现与安全边界

- 自动运行会话运行器在完成 `resetState()`、恢复路线并重建节点图后，将 `registrationFreeRoute`、空 `currentNodeId` 和完整 `nodeStatuses` 放入 `AUTO_RUN_RESET` 消息。
- Side Panel 优先采用消息携带的权威节点图；仅为兼容旧 Background 消息时才回退到本地默认状态。免 2FA 第 10 步因此会被明确覆盖为 `pending`，第 7–9 步继续保持路线默认 `skipped`。
- 修复不依赖延迟刷新或额外轮询，不改变后台执行顺序、资格服务调用、账号入池条件、密码/TOTP/Passkey 凭据、邮箱选择或 Cookie 清理行为。

### 回归覆盖

- `scripts/test-auto-run-session-runner.cjs` 在既有免 2FA 重置回归中新增消息断言，要求 `AUTO_RUN_RESET` 携带同一份路线、空当前节点和默认节点图；修复前实际得到缺失 `payload` 并失败。
- 新增 `scripts/test-sidepanel-runtime-message-handlers.cjs`，让消息处理器持有一套完整 2FA 缓存默认值，同时发送免 2FA 权威节点图；验证侧栏同步采用消息中的 `persist-no-2fa-free=pending`，而不是旧缓存。修复前实际缺少路线字段并使用旧默认值失败。

### 验证与提交影响

- 自动运行会话、侧栏运行时消息处理与消息控制器定向测试共 `14/14` 通过；相关生产文件和新增测试的 `node --check` 通过。
- `npm test` 共 `568/568` 通过，包含隔离 Chrome for Testing 的 MV3 Service Worker、Side Panel、运行时消息、诊断剪贴板和零未捕获页面错误验证。
- 当前源目录没有 `.git`；在系统临时目录的一次性 Git 索引副本中验证后，`405` 个受跟踪 JavaScript 文件语法通过，文档结构/链接/版本/问题索引通过，Smoke、Removed Network 和 Phone/SMS 审计通过。Smoke 只保留 `background.js` 为 `15360` 行的既有非阻断警告，仍低于 `15400` 行强制上限；`background/auto-run/session-runner.js` 保持 `1100/1100` 行。
- 未提交、未打包、未发布、未修改 Manifest 版本、扩展权限、资格标准、账号数据结构、邮箱 Provider 协议、密码/TOTP/Passkey 凭据格式或 Cookie 清理范围。

---

<a id="2026-08-05-no2fa-step10-registry-plus-flag"></a>

## 免 2FA 第 10 步被误报为当前模式不存在并回退第 7 步

日期：2026-08-05

关联记录：[免 2FA Free 路线在自动运行重置后仍执行第 7 步](#2026-08-04-no-2fa-route-reset-step7)、[Free Account Tool V3.0.0 移除 CDK 与 Plus 全链路](#2026-08-04-free-account-tool-v3-removal)

### 故障现象与诊断证据

用户导出的最近失败诊断显示，免 2FA 路线已经完成注册验证码并进入 ChatGPT 登录首页，第 7、8、9 步也按路线状态跳过；自动运行随后正确准备执行第 10 步 `persist-no-2fa-free`，但 Background 立即报错“当前模式下不存在节点：persist-no-2fa-free”。认证后链路恢复器又把这类普通节点错误解释为第 10 步认证链异常，因此回到第 7 步重新开始设置密码流程。

诊断同时证明页面当时位于 `https://chatgpt.com/`，不是注册、验证码、2FA、Passkey 或资格接口失败。归档只保留脱敏节点和状态，不保存真实邮箱、密码、验证码、Session、AT、Cookie、2FA/Passkey 凭据或敏感 URL 参数。

### 根因与影响范围

V3 已删除 Plus 分组和相关能力，路线定义也已经只由 `registrationFreeRoute` 决定；但是 `background.js#getStepRegistryForState` 仍先检查历史 `plusModeEnabled`。当该旧标志为 `false` 时，函数直接返回完整 2FA 的普通注册表，根本不会继续检查 `no-2fa-free` 或 `passkey-free`。Side Panel、工作流定义和自动运行节点图因此都认为 `persist-no-2fa-free` 合法，真正执行时却被另一套旧条件拒绝，形成同一状态的定义/执行分裂。

问题直接影响旧 Plus 标志为关闭状态时的免 2FA 第 10 步，也潜在影响同条件下的 Passkey 第 9 步。完整 2FA、无 RT 面板、账号资格标准、Session/AT 读取、账号落库和邮箱排除逻辑本身没有发生故障。

### 实现与安全边界

- Background 注册表选择先处理无 RT 面板，再按 `registrationFreeRoute` 选择免 2FA 或 Passkey 注册表；只有完整 2FA 路线继续按现有兼容标志选择完整 2FA 注册表。
- 免 2FA 和 Passkey 的节点执行不再依赖已移除的 Plus UI/分组状态，因此 Side Panel 节点图、自动运行调度和 Background 执行器使用同一条路线事实。
- 保留完整 2FA 与历史标志的原选择结果，也保留 `local-cpa-json-no-rt` 的最高优先级；不修改路线文案、步骤顺序、资格接口、失败重试、邮箱选择、账号凭据或存储 schema。
- 已经注册并登录成功的本次账号不会再因为注册表误选而回退第 7 步；第 10 步仍必须真实完成资格检测和 Free 结果保存，不能被跳过或伪造完成。

### 回归覆盖

- 新增 `scripts/test-background-step-registry-route.cjs`，直接执行生产函数并构造 `plusModeEnabled=false`，验证免 2FA 仍选中 `persist-no-2fa-free` 所属注册表，Passkey 仍选中 Passkey 注册表。
- 同一测试验证完整 2FA 在历史标志开/关时保持原选择，无 RT 面板仍优先使用自己的六步注册表。
- 自动运行、路线设置和十步定义定向回归共 `25/25` 通过；完整 `npm test` 共 `378/378` 通过，包含隔离 Chrome for Testing 的 MV3 E2E。

### 验证与发布影响

- `npm run syntax` 通过，共检查 `291` 个 JavaScript 文件。
- `npm test` 共 `378/378` 通过；测试中的隔离浏览器为 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时 Profile 和 pipe transport。
- `npm run audit` 通过：文档结构、链接、版本与问题索引一致，V3 Smoke 检查 `149` 个运行时文件，Removed Network 与 Phone/SMS 审计无残留。
- `npm run e2e` 独立通过 `1/1`；实际使用 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport，验证 MV3 Service Worker 与 Side Panel 正常加载。
- 修复不修改 Manifest 版本、扩展权限、资格标准、Free 结果 schema、账号凭据格式或远端服务地址。当前源码目录没有 `.git`，因此未提交、未打包、未发布；需要在 `chrome://extensions/` 重新加载扩展后，新的 Service Worker 路线选择才会生效。

---

<a id="2026-08-05-free-export-txt-format"></a>

## AT/Session 分组导出错误生成 V3 JSON 文件

日期：2026-08-05

关联记录：[深色主题下 Session 导出选项文字不可见](#2026-08-04-session-export-select-dark-contrast)、[Free Account Tool V3.0.0 移除 CDK 与 Plus 全链路](#2026-08-04-free-account-tool-v3-removal)

### 故障现象与证据

用户在 Free 账号面板选择 AT 或 Session 后点击导出，实际下载文件扩展名为 `.json`，内容是包含 `schemaVersion`、`items`、运行统计和 `credentialExportMode` 的完整 V3 结果对象。用户需要的是原账号工具兼容的 `.txt` 文件，而不是账号结果数据库的 JSON 快照。

代码检查确认 `background/free-account-service.js#exportResults` 固定调用 `buildTimestampedFileName(..., 'json')` 并对整个 payload 执行格式化 `JSON.stringify`；Side Panel 又固定使用 `application/json` MIME 和 `.json` 回退文件名，因此不是浏览器自动改扩展名。归档不保存实际导出文件、邮箱、密码、AT、Session、2FA/Passkey、Cookie 或取件地址。

### 根因与影响范围

V3 重构导入导出时，为了保留资格证据复用了 V3 JSON 备份结构，但把“V3 JSON 可导入恢复”错误等同于“账号分组应导出为 JSON”。后来增加 AT/Session 选择时，只删除另一种凭据字段，仍保留了外层结果对象和 JSON 下载参数，导致用户选择改变了 JSON 内容，却没有恢复实际需要的逐行 TXT 文件。

问题影响 Free 与无资格 Free 两个分组的 AT/Session 下载格式。第 10 步 Session 落库、V3 JSON 导入、完整敏感备份、普通安全配置导出、资格分组和账号凭据本身没有损坏。

### 实现与安全边界

- 分组导出统一生成 UTF-8 `.txt`，Side Panel 下载 MIME 改为 `text/plain;charset=utf-8`，文件名分别标识分组及 `at` 或 `session`。
- 每个账号输出一行并沿用 `---` 分隔。完整 2FA 与 Passkey 行保留邮箱、密码、TOTP/Passkey 标记、可选取件地址、所选凭据和记录时间；免 2FA 行不添加伪造的密码或安全因子字段。
- AT 模式输出独立 AT；Session 模式把第 10 步保存的完整 Session 使用紧凑单行序列化后放入同一凭据字段。Session 自身的结构全部保留，但文件不再包含 V3 `schemaVersion`、`items`、统计或资格证据外壳。
- 取件地址开关继续只控制对应字段；旧账号缺少 Session 时继续返回缺失数量并由界面警告，不用 AT 冒充 Session，也不改变账号数据。
- V3 JSON 导入和完整备份保持原格式，避免把分组 TXT 下载与灾难恢复备份混为同一接口。

### 回归覆盖

- `scripts/test-free-account-v3.cjs` 精确验证无资格 Free、完整 2FA 和免 2FA 的逐行 TXT；断言文件名为 `.txt`、MIME 为 `text/plain`，AT 与 Session 分别出现在凭据字段，Session 下载不以 `{` 开始。
- 回归同时验证 Session 完整对象仍保留在服务返回结果中、Session 模式不输出独立 AT、旧记录缺少 Session 时继续返回 `missingSessionCount`。
- Free 服务、账号面板和下载服务定向测试共 `17/17` 通过；完整 `npm test` 共 `378/378` 通过，包含隔离 Chrome for Testing 的 MV3 E2E。

### 验证与发布影响

- `npm run syntax` 通过，共检查 `291` 个 JavaScript 文件。
- `npm test` 共 `378/378` 通过；测试内浏览器为 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport。
- `npm run audit` 通过：文档结构、链接、版本与问题索引一致，V3 Smoke 检查 `149` 个运行时文件，Removed Network 与 Phone/SMS 审计无残留。
- `npm run e2e` 独立通过 `1/1`；实际使用 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport，MV3 Service Worker 与 Side Panel 正常加载。
- 未修改 Manifest 版本、扩展权限、资格标准、Free 结果 schema、Session 落库内容、V3 JSON 导入或完整备份格式。当前源码目录没有 `.git`，因此未提交、未打包、未发布；需要重新加载扩展后新的 Background 和 Side Panel 下载参数才会生效。

---

<a id="2026-08-05-free-account-modal-scroll"></a>

## Free 账号分组弹窗滚动穿透主界面

日期：2026-08-05

关联记录：[V3 两个 Free 分组入口藏在首屏之外](#2026-08-04-free-groups-entry-hidden-below-fold)、[两个 Free 分组的工具栏公共操作不对齐](#2026-08-04-free-group-toolbar-alignment)

### 故障现象与证据

用户截图显示“Free 账号分组”弹窗内容已经超过可视高度，内部包含 Free 组、无资格 Free 组和任务列表；在弹窗区域向下滑动时，右侧主页面滚动条移动，弹窗内容没有独立向下滚动。截图中的账号和任务信息不写入归档，真实邮箱、密码、AT、Session、2FA/Passkey、Cookie 和取件地址均不保留。

### 根因与影响范围

`.account-records-panel` 只设置了最大高度，没有设置纵向溢出容器；超出高度的内容虽然仍可见，但滚轮事件会沿 DOM 传播给 Side Panel 主页面。补上 `overflow-y: auto` 后，弹窗的 Flex 直接子项仍允许默认收缩，在短视口下会被压缩到容器高度，可能无法形成真实的 `scrollHeight`。

问题只影响 Free 账号分组弹窗的滚轮和触摸纵向滚动。两个 Free 分组的数据、资格状态、导入导出、登录、AT/Session、复检、任务执行和主页面正常滚动不属于本次修改范围。

### 实现与安全边界

- 弹窗面板使用 `100dvh` 高度约束、`overflow-y: auto`、`overflow-x: hidden` 和 `overscroll-behavior: contain`，由面板自身承接纵向滚动并阻止滚动链传递到底层页面。
- 弹窗遮罩禁用自身溢出和滚动链；面板打开时为 `body` 添加 `account-records-open` 并锁定主页面滚动，关闭时立即移除该类恢复原行为。
- 标题、两个 Free 分组结果区和任务区禁止 Flex 收缩，确保内容超过短视口时产生真实滚动距离；保留账号列表内部已有的独立滚动区域。
- 修复不拦截按钮点击、键盘焦点、导出下载或任务消息，也不修改账号存储、资格分组和自动注册期间的只读规则。

### 回归覆盖

- `scripts/test-extension-e2e.cjs` 在弹窗打开后切换到 `1000 x 500` 短视口，验证 `body` 已锁定、面板为纵向自动溢出且 `scrollHeight > clientHeight`。
- 测试把鼠标悬停在弹窗内并发送纵向滚轮，验证面板 `scrollTop` 增加而主页面 `window.scrollY` 不变；关闭弹窗后验证主页面锁被移除。
- E2E 继续使用隔离的 Chrome for Testing、临时 Profile 和 pipe transport，不连接用户安装的浏览器或真实登录数据。

### 验证与发布影响

- `npm run syntax` 通过，共检查 `291` 个 JavaScript 文件。
- `npm test` 共 `378/378` 通过。
- `npm run e2e` 独立通过 `1/1`；实际使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport。
- 未修改 Manifest 版本、扩展权限、Free 结果 schema、账号凭据格式或远端服务。当前源码目录没有 `.git`，因此未提交、未打包、未发布；重新加载扩展后新的 Side Panel 样式和脚本生效。

---

<a id="2026-08-05-account-task-refresh-delete"></a>

## 任务列表刷新无反馈且无法删除历史记录

日期：2026-08-05

关联记录：[Free 账号分组弹窗滚动穿透主界面](#2026-08-05-free-account-modal-scroll)、[Free Account Tool V3.0.0 移除 CDK 与 Plus 全链路](#2026-08-04-free-account-tool-v3-removal)

### 故障现象与证据

用户截图显示 Free 账号分组底部已经积累最近 `36` 个资格复检等持久化任务。标题栏只有刷新图标，点击后列表、标题和按钮均没有可见变化，无法判断请求是否执行；任务卡片只有“事件”，成功等已结束任务没有删除入口，标题栏也没有批量清理按钮。归档不保存截图中的真实邮箱、任务标识、凭据、事件详情或时间关联数据。

### 根因与影响范围

刷新控制器虽然会发送 `GET_ACCOUNT_TASKS`，但刷新期间没有禁用或旋转状态，完成后仍只显示相同的“最近 N 个”；如果打开面板触发的刷新尚未结束，用户再次点击会被 `loading` 守卫静默忽略。任务仓库、事件仓库和 Background 路由只提供读取、取消和恢复能力，没有删除终态任务或清理对应事件的接口，因此界面无法提供真实删除按钮。

问题影响任务历史列表的刷新反馈与维护。账号记录、Free 分组、资格结果、自动注册执行、运行中任务取消和任务恢复语义不属于本次修改范围。

### 实现与安全边界

- 刷新开始时按钮禁用并旋转，标题显示“刷新中”；完成后显示“已刷新 HH:mm:ss”，即使任务数量和顺序没有变化也能确认请求已完成。
- 每条终态任务增加“删除”按钮，标题栏增加“清空”按钮用于删除全部终态任务；两种操作均先确认，并同步清理对应任务事件。
- Background 新增单条删除和批量删除路由，任务仓库只允许删除 `canceled`、`succeeded`、`failed`、`interrupted`、`manual_review`。`pending`、`running`、`retry_wait` 和 `cancel_requested` 会被明确保护，仍只能走取消流程。
- 批量删除按仓库当前状态重新筛选，不信任 Side Panel 显示数量；没有可删除记录时按钮禁用并给出提示。删除不会修改账号、资格证据、AT/Session、自动运行状态或任务以外的日志。

### 回归覆盖

- 任务仓库测试覆盖单条终态删除、活动任务拒绝删除，以及批量清理终态任务时保留运行中任务。
- 事件仓库测试覆盖只清理被删除任务的事件；任务路由测试覆盖单条和批量删除及事件联动。
- Side Panel 控制器测试覆盖带时间的刷新反馈、取消、单条删除和批量清理消息；视图模型验证活动任务只显示取消、终态任务显示删除。
- 隔离浏览器 E2E 验证真实 Side Panel 存在“清空”按钮，点击刷新后标题出现“已刷新”，同时继续验证弹窗独立滚动和零未捕获页面错误。

### 验证与发布影响

- 定向任务测试共 `11/11` 通过。
- `npm run syntax` 通过，共检查 `292` 个 JavaScript 文件。
- `npm test` 共 `381/381` 通过。
- `npm run e2e` 独立通过 `1/1`；实际使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport。
- 未修改 Manifest 版本、扩展权限、账号 schema、Free 分组或远端服务。当前源码目录没有 `.git`，因此未提交、未打包、未发布；重新加载扩展后新的任务按钮、路由和 Service Worker 生效。

---

<a id="2026-08-05-step2-continue-enter-fallback"></a>

## 步骤 2 Continue 按钮慢渲染导致整轮重试

日期：2026-08-05

关联记录：[ChatGPT 登录弹窗 Continue 稍晚启用时被误报不可点击](issue-fix-archive-2026-07.md#2026-07-26-chatgpt-modal-continue-button)、[步骤 2 密码页等待被误报为内容脚本超时并重复提交邮箱](issue-fix-archive-2026-07.md#2026-07-27-step2-password-page-response-timeout)

### 故障现象与诊断证据

用户导出的最近失败诊断显示，第 `1/69` 轮步骤 2 在 `chatgpt.com` 点击登录认证入口，填入可见的 `login_hint` 邮箱输入框后，约 5 秒内没有找到可点击的 Continue，于是当前尝试失败并进入整轮重试。下一次尝试使用同一邮箱时正常找到 Continue，并直接进入 `auth.openai.com/email-verification`，证明邮箱和路线有效，首次失败属于认证表单渲染时序。

诊断还显示失败发生在邮箱提交前，没有密码、验证码或资格请求副作用。归档不保存真实邮箱、Cookie、Session、AT、密码、2FA/Passkey、验证码或标签页标识。

### 根因与影响范围

步骤 2 填写邮箱后只等待 Continue 5 秒。ChatGPT 首页认证弹窗可能先挂载 `login_hint`，随后由 React 替换成正式 `email` 表单；旧输入节点被替换时，已填值可能丢失，Continue 也可能在等待窗口之后才启用。内容脚本最终返回“未找到可点击的继续按钮”，但 Background 的入口恢复分类只识别“未找到邮箱输入框”，因此没有在当前轮内部恢复，而是交给外层整轮重试。

问题影响步骤 2 的 ChatGPT 首页认证弹窗和统一认证入口。步骤 3 密码提交、验证码、账号选择、邮箱池状态、资格检测和其它页面按钮不使用本次回车兜底。

### 实现与安全边界

- Continue 等待窗口从 5 秒延长到 15 秒；轮询期间持续重新定位当前可见邮箱输入框，只有节点被替换或目标值丢失时才恢复同一个邮箱。
- 如果步骤 2 等待结束后仍没有真实可点击的 Continue，且当前可见输入框的值与目标邮箱完全一致，则只执行一次 Enter 键序列，并调用同一表单的默认 `requestSubmit()` 完成回车语义提交；不点击不可用按钮。
- 回车兜底只存在于步骤 2，不用于步骤 3 或其它输入框；邮箱缺失、不一致、输入框不可见或不可操作时禁止触发。
- 回车提交后仍由 Background 验证是否进入密码页、邮箱验证码页或后续权威状态。页面没有离开邮箱页时按“邮箱提交结果未知”保留当前页面、邮箱和 Cookie，不自动重复提交。
- “Continue 不可点击”被纳入步骤 2 可恢复入口错误；尚未执行回车或回车入口本身不可用时，Background 在当前轮内重新打开认证入口并重试，不直接消耗整轮账号尝试。

### 回归覆盖

- 认证入口测试覆盖 Continue 延迟启用、React 表单替换后的邮箱恢复，以及只发送一次 `keydown`、`keypress`、`keyup` 和一次表单默认提交，不触发按钮点击。
- 步骤 2 Background 测试覆盖首次返回 Continue 不可点击时，在当前轮打开认证入口并第二次提交成功，最终识别邮箱验证码页并跳过密码节点。
- 既有不确定提交测试继续验证邮箱提交后页面状态无法确认时禁止整轮重试、禁止更换邮箱并保留认证现场。

### 验证与发布影响

- 认证入口与步骤 2 定向测试共 `16/16` 通过。
- `npm run syntax` 通过，共检查 `292` 个 JavaScript 文件。
- `npm test` 共 `384/384` 通过。
- `npm run e2e` 独立通过 `1/1`；实际使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport。
- 未修改 Manifest 版本、扩展权限、邮箱池、账号 schema、资格标准或远端服务。当前源码目录没有 `.git`，因此未提交、未打包、未发布；重新加载扩展后新的步骤 2 Content Script 和 Background 恢复逻辑生效。

---

<a id="2026-08-05-session-storage-quota-free-results"></a>

## 自动运行启动时 Session storage 超出配额

日期：2026-08-05

关联记录：[Free Account Tool V3.0.0 移除 CDK 与 Plus 全链路](#2026-08-04-free-account-tool-v3-removal)、[AT/Session 分组导出错误生成 V3 JSON 文件](#2026-08-05-free-export-txt-format)

### 故障现象与诊断证据

用户导出的最近失败诊断只有一条错误：`Session storage quota bytes exceeded. Values were not stored.`。自动运行尚停留在 `open-chatgpt=pending` 就异常终止，当前页面虽然是 `chatgpt.com`，但后续页面探测返回 `Receiving end does not exist`。这说明主故障发生在自动运行重置写状态阶段，页面连接错误只是流程停止后 Content Script 尚未连接的伴随现象，不是第 1 步网页失败。

归档不保存用户的 Local/Session 存储内容、邮箱、完整 ChatGPT Session、AT、Cookie、密码、2FA/Passkey 或其它凭据。

### 根因与影响范围

V3 的规范 `freeAccountResults` 已持久化在 `chrome.storage.local`，每个账号还可能包含第 10 步保存的完整 `/api/auth/session` 内容；但状态管理器、一次性迁移和 `resetState()` 又把整份结果复制进容量较小的 `chrome.storage.session`。账号数量和 Session 内容逐渐增长后，自动运行重置先清空 Session，再写入包含全部 Free 结果的单个 payload，该 payload 本身超过配额并导致流程在第 1 步前终止。

问题影响拥有较多 Free 账号或较大 Session 内容的自动运行启动、状态更新和旧版本升级。Local 中的规范账号、资格结果和完整 Session 没有损坏，也不需要删除账号来恢复空间。

### 实现与安全边界

- `freeAccountResults` 和 `accountRecordsV2` 明确设为 Local-only 规范数据；所有 Session 状态补丁在写入前统一剥离这两个字段，运行态 `getState()` 继续从 Local 合并完整结果。
- 自动运行 `resetState()` 不再把 Free 结果复制进 Session；V3 迁移也不再写 Session 副本。扩展 Service Worker 初始化时主动清除旧版本遗留的两个规范数据键，释放已占用的 Session 配额。
- `setState()` 收到 Free 结果时先写 Local，再把剩余的小型流程字段写 Session；即使 Session 后续写入失败，已经产生的账号和资格结果仍不会丢失。
- 状态写入日志不再对完整更新对象执行 `JSON.stringify`，只记录字段名，避免复制大型 Session 内容和在 Service Worker 控制台泄露凭据片段。
- 修复不清空 `storage.local`，不改变 Free 分组、Session 导出内容、账号有效性、资格证据、邮箱池或自动运行节点语义。

### 回归覆盖

- 状态仓库测试验证 Free 结果仍写入 Local，但任何 Session patch 都不包含 `freeAccountResults` 或 `accountRecordsV2`。
- 新增配额模拟：构造 `40` 个账号、每个包含大型 Session 的 Free 结果，并让测试 Session 存储在超过小型配额时主动报错；验证完整数据成功写入 Local，Session 只接收 `currentNodeId` 小补丁。
- 初始化测试验证旧 Session 规范数据键会被主动删除；V3 迁移测试继续验证账号凭据和资格证据完整保留。
- 隔离浏览器 E2E 继续验证 MV3 Service Worker、Side Panel、运行时消息、诊断剪贴板和零未捕获页面错误。

### 验证与发布影响

- 状态仓库与 V3 定向测试共 `17/17` 通过。
- `npm run syntax` 通过，共检查 `292` 个 JavaScript 文件。
- `npm test` 共 `386/386` 通过。
- `npm run e2e` 独立通过 `1/1`；实际使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport。
- 未修改 Manifest 版本、扩展权限、Local 数据 schema、资格标准或远端服务。当前源码目录没有 `.git`，因此未提交、未打包、未发布；重新加载扩展后 Service Worker 会自动清理旧 Session 副本并使用新的 Local-only 存储边界。

---

<a id="2026-08-05-free-export-readable-timestamp"></a>

## V3 AT/Session TXT 导出末列重新显示数字时间戳

日期：2026-08-05

关联记录：[AT/Session 分组导出错误生成 V3 JSON 文件](#2026-08-05-free-export-txt-format)

### 故障现象与诊断证据

用户提供的 Session TXT 中，完整 Session JSON 可以正常解析，包含 `accessToken`、`account`、`authProvider`、`expires`、`sessionToken` 和 `user` 等接口字段；但整行最后一列直接显示 `1785904323` 一类 Unix 秒数，无法直观看出记录时间。脱敏解析确认该值对应北京时间 `2026-08-05 12:32:03 +08:00`，并与 Session 的 `user.iat` 和 Access Token 签发时间一致。

归档不保存用户文件中的邮箱、密码、2FA/Passkey、取件地址、AT、Session、JWT、Cookie 或账号标识。

### 根因与影响范围

V3 重写 Free 账号导出时，`formatFreeAccountTextLine()` 直接对 `recordedAt`、资格检测时间或 AT 更新时间调用字符串规范化，没有复用旧版已经存在的可读时间转换行为。因此数字时间值虽然完整存在，却原样落入 TXT；ISO 来源则保持另一种显示，末列格式也不统一。

问题同时影响 Free 与无资格 Free 的 AT、Session 两种 TXT 导出。账号存储、Session 捕获、资格判断、分组、登录和导入数据没有缺失或损坏。

### 实现与安全边界

- 导出层新增统一时间格式化，识别 Unix 秒、Unix 毫秒和 ISO 日期字符串，输出固定北京时间 `YYYY-MM-DD HH:mm:ss +08:00`。
- 无法解析的历史值继续原样导出，避免为了显示格式丢弃证据；空时间仍保持空字段。
- 只调整 TXT 最后一列，账号存储中的原始时间不改写，完整 `/api/auth/session` JSON 不筛选、不重排、不追加内部字段。
- 文件名、UTF-8 TXT、一账号一行、`---` 分隔、AT/Session 选择和缺少 Session 提示保持不变。

### 回归覆盖

- V3 Free 导出测试使用用户问题同形的 Unix 秒值 `1785904323`，验证 AT 与完整 Session 两种输出均为 `2026-08-05 12:32:03 +08:00`。
- 同一测试继续验证完整 Session 对象原样保留，Session 模式不额外输出独立 AT，旧账号缺少 Session 的统计不变。
- 分组导出测试覆盖 ISO 来源转换为北京时间，确认 Free 与无资格 Free 使用同一格式化路径。

### 验证与发布影响

- `node --check background/free-account-service.js` 通过。
- 对源码目录实际存在的 `292` 个 JavaScript 文件逐个执行 `node --check`，全部通过；当前 Git 索引为空，因此仓库脚本 `npm run syntax` 本轮只枚举到 `0` 个文件，未将该空结果作为语法验证依据。
- V3 Free 定向测试共 `10/10` 通过。
- `npm test` 共 `386/386` 通过，其中隔离浏览器 E2E 使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport。
- `npm run audit` 通过：文档检查、V3 smoke、Removed Network 和手机短信残留审计均通过。
- 未修改 Manifest 版本、扩展权限、账号 schema、资格标准或远端服务；重新加载扩展后新导出的 TXT 会显示可读北京时间，已经下载的旧 TXT 不会被自动改写。

---

<a id="2026-08-05-batch-fill-free-account-sessions"></a>

## 120 个账号缺少 Session 且无法持久批量补充

日期：2026-08-05

关联记录：[自动运行启动时 Session storage 超出配额](#2026-08-05-session-storage-quota-free-results)、[AT/Session 分组导出错误生成 V3 JSON 文件](#2026-08-05-free-export-txt-format)

### 故障现象与诊断证据

用户确认一个合并 TXT 共包含 `120` 个不重复账号，每条有密码、2FA、取件地址和 AT，但完整 Session 数量为 `0`。现有“刷新 AT”会在一次 Side Panel 消息中同步处理账号，没有独立的缺 Session 选择、停止标志、持久 checkpoint、中断续跑或任务结束自动导出，无法可靠完成长时间的 120 账号补充。

源文件只做了字段数量、邮箱去重和 Session 缺失统计，未把真实邮箱、密码、2FA、取件地址、AT 或文件内容写入测试、日志和本档案。回归使用完全虚构的 `.test` 账号。

### 根因与影响范围

账号服务虽然已有登录后读取 Session 的底层能力，但该能力只作为资格检查或 AT 刷新的附带结果，任务 schema 也没有 `fill_session` 类型。长批次请求会依赖 Side Panel 消息持续等待，Service Worker 或浏览器中断后不能从同一任务恢复，也无法区分本任务成功账号并自动导出。

问题影响两个 Free 分组中已导入且缺少完整 Session 的启用账号。已有完整 Session、停用账号、资格证据、分组规则、密码、2FA/Passkey、取件地址和账号有效性不应被改变。

### 实现与安全边界

- 新增 `fill_session` 任务以及开始、继续、停止三个消息接口。启动只传分组和行为选项，Background 从 `freeAccountResults` 读取凭据并立即返回 `taskId` 与目标数量。
- 任务使用单个受管登录标签页串行处理。每次登录后要求完整 Session 包含用户邮箱和 AT，且邮箱必须与目标账号一致；成功时同步保存本次 Session、最新 AT、`sessionUpdatedAt` 和 `accessTokenUpdatedAt`。
- 每成功一个账号立即写入 Free 结果和规范账号记录，再更新目标邮箱、完成/失败/跳过邮箱和下一索引 checkpoint。账号级错误继续下一条；存储失败停止整批，之前成功记录不回滚。
- 用户停止同时设置任务取消状态和登录器停止标志。Service Worker 启动恢复把活动任务标为中断，继续时复用同一任务并跳过已经保存完整 Session 的账号。
- 完成后 Background 复用现有 Session TXT 格式化器，只导出本任务成功账号。任务仓库、事件和普通日志不保存密码、AT、Session、Cookie、2FA、验证码或取件地址；结果只保存数量、文件名、下载 ID 和下载状态。
- 两个 Free 分组增加缺 Session 统计、补充按钮、启动确认、进度、停止和继续入口。任务运行时保留查看和手动导出，其它写操作禁用。补充 Session 不检测资格，也不移动分组。

### 回归覆盖

- 使用 120 条虚构账号验证文本导入、去重、密码/2FA/取件地址/AT 识别和全部缺 Session 选择。
- 覆盖仅选择当前分组中启用且缺完整 Session 的账号；已有 Session、停用账号和另一分组账号跳过。
- 覆盖完整 Session 与同次 AT 保存、邮箱不匹配继续下一条、账号级失败隔离、存储失败立即停批和停止边界。
- 覆盖任务启动立即返回、checkpoint 不含敏感凭据、Background TXT 下载、停止消息和 `fill_session` 中断恢复状态机。
- 覆盖两个分组的缺 Session 汇总、补充按钮、运行进度、停止、继续以及“完成，部分失败/下载失败”任务文案。

### 验证与发布影响

- `npm test` 共 `401/401` 通过，覆盖 Session、V3、任务运行时、账号服务、账号面板和下载行为。
- 实际递归 `node --check` 共检查 `295` 个 JavaScript 文件，全部通过；仓库 Git 索引为空，因此未采用只读取已跟踪文件的数量作为语法证据。
- `npm run audit` 通过：文档结构、链接、版本和归档索引检查通过，V3 smoke audit 检查 `150` 个运行时文件，Removed Network 与 Phone/SMS 审计均无残留。
- `npm run e2e` 独立通过 `1/1`；实际使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport，验证 MV3 Service Worker、Side Panel、两个补充 Session 入口、运行时消息、下载调用和零未捕获页面错误。
- 未修改 Manifest 版本、远端资格接口、分组标准或扩展权限；使用现有 `downloads`、`cookies`、`tabs` 和 `scripting` 权限。
- 本轮尚未打包或发布；重新加载扩展后才会出现缺 Session 统计和补充 Session 任务入口。

---

<a id="2026-08-05-session-fill-progress-events-visibility"></a>

## 补充 Session 长时间显示 0/120 且事件按钮无可见反馈

日期：2026-08-05

关联记录：[120 个账号缺少 Session 且无法持久批量补充](#2026-08-05-batch-fill-free-account-sessions)、[任务列表刷新没有反馈且缺少删除入口](#2026-08-05-account-task-refresh-delete)

### 故障现象与诊断证据

用户启动 `120` 个账号的补充 Session 任务后，任务卡长时间保持 `0/120`；点击“事件”没有看到任何界面变化。续跑后事件已经显示正在处理第 `19/120` 个账号且前 `18` 个失败，任务卡仍保持续跑前的“已中断、已处理 0/120、失败 0”快照。已有失败事件只显示累计失败数量，没有登录器错误码或具体原因。

回归通过真实的任务列表委托点击和一个阻塞中的虚构登录器稳定复现：登录器已经开始处理第一个账号时，最后一条进度仍没有 `processing` 状态；事件请求完成后，事件容器也没有被控制器主动显示或滚入当前面板视口。

### 根因与影响范围

- Session 服务只在账号成功、失败或跳过后推进 `nextIndex`，进入单账号登录前没有报告当前序号，因此第一条或任意一条登录耗时时，任务卡会一直显示上一个已结束位置。
- 任务卡只格式化裸 `current/total`，没有显示成功、失败和跳过计数，也没有区分“正在处理”与“已经处理”。
- 事件容器位于任务列表之后；控制器依赖渲染器间接取消 `hidden`，且没有滚动或聚焦动作。在任务列表自身和账号面板都有滚动区时，事件内容可能已经生成但仍在当前视口之外。
- 原 Session 任务除了通用任务状态和导出错误，没有逐账号进度事件，因此即使打开事件区，也无法用于判断批次运行到哪里。
- Free 分组控制器会轮询任务以更新补充按钮，但任务卡列表由另一个控制器维护，只在打开面板或手动刷新时读取任务。续跑从 Free 分组按钮触发后，任务事件和仓库已更新，任务卡仍可能显示旧的 interrupted 快照。
- 账号级 catch 只向进度回调传递 `failed`，丢弃了原始错误码和错误消息，事件层无法解释失败原因。

### 实现与安全边界

- 每个账号调用登录器前立即写入 `processing`、当前序号和 `current/total`；完成、失败和跳过继续在安全边界后更新同一检查点。
- 检查点同步保存成功、失败和跳过计数。任务卡运行时显示“处理中 当前/总数 · 成功 X · 失败 Y · 跳过 Z”，非处理中状态显示已处理数量。
- 逐账号开始、成功、失败或跳过会生成任务事件，内容只包含序号和计数，不包含邮箱、密码、2FA、AT、Session、Cookie、验证码或取件地址。
- “事件”按钮请求成功后由控制器显式显示事件容器、聚焦并滚入视口；事件区放在任务列表前方，打开后自动滚到最新事件。
- 账号级失败进度保留登录器错误码和错误消息；写入事件前替换目标邮箱，再由统一事件仓库执行二次敏感信息脱敏。事件使用实际错误码并显示具体原因。
- 通用 `TASK_STARTED`、恢复、继续、取消和完成事件在 Side Panel 映射为中文，不改写后台原始事件数据。
- 任务卡控制器在账号面板打开期间每 `1.2` 秒读取一次最新任务快照，面板关闭后自动停止轮询；续跑后无需手动点击刷新即可纠正状态与计数。
- 不改变 Session 登录器、账号选择、分组、资格证据、停止/续跑、落库、自动下载和失败重试策略。

### 回归覆盖

- 阻塞登录器验证账号登录已经开始但尚未结束时，进度立即变为 `processing 1/1`。
- 任务视图验证 `120` 条批次显示当前序号以及成功、失败和跳过计数。
- 委托点击测试验证真实“事件”动作调用事件路由、显示事件容器并执行滚入视口。
- Session 任务测试验证逐账号处理和完成事件存在，且事件文本不包含目标邮箱或 Session/AT 内容。
- 邮箱不匹配回归验证失败进度带有 `FREE_ACCOUNT_SESSION_EMAIL_MISMATCH` 和具体原因；任务事件测试验证登录超时错误码及消息可见。
- 任务面板轮询测试从“已中断 0/120”切换到“运行中 19/120、失败 18”，验证无需手动刷新即可替换旧快照。
- 隔离浏览器 E2E 使用完全虚构任务复现同一状态切换，并点击真实事件按钮验证中文恢复文案和登录页面超时原因可见。

### 验证与发布影响

- Session、V3、任务面板定向回归共 `26/26` 通过。
- `npm test` 共 `405/405` 通过。
- `npm run e2e` 独立通过 `1/1`；实际使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport，Side Panel 无未捕获页面错误。
- 修改的 Background、Side Panel 和测试脚本通过 `node --check`。
- 未修改 Manifest 版本、扩展权限、账号 schema、Free 分组标准或远端接口。重新加载扩展后当前旧运行任务会先转为“已中断”，点击“继续补充 Session”后使用新进度与事件显示并跳过已经成功保存 Session 的账号。

---

<a id="2026-08-05-session-fill-stale-global-stop"></a>

## 补充 Session 连续处理账号但成功始终为 0

日期：2026-08-05

关联记录：[120 个账号缺少 Session 且无法持久批量补充](#2026-08-05-batch-fill-free-account-sessions)、[补充 Session 长时间显示 0/120 且事件按钮无可见反馈](#2026-08-05-session-fill-progress-events-visibility)

### 故障现象与诊断证据

用户的 `120` 账号补充 Session 任务已经处理约 `20` 个账号，但成功数量始终为 `0`，导出的 Session TXT 仍为 `0/120`。脱敏检查确认源账号 `120/120` 都有邮箱、密码、有效形态的 TOTP 密钥、取件地址和 AT，导入解析不是共同失败点；所有账号都在共享的登录与 Session 读取路径中失败。

代码链路检查发现，补充任务自己的 `stopRequested` 会在开始时重置，但登录器每个安全边界还会调用 Background 自动注册的全局 `throwIfStopped()`。用户此前停止过自动注册时，这个全局标志保持为 `true`，而补充任务启动和断点继续都没有清除它。

归档不保存真实邮箱、密码、2FA、取件地址、AT、Session、Cookie、验证码、任务 checkpoint 或浏览器存储内容。

### 根因与影响范围

`freeAccountService.throwIfCheckStopped()` 先调用全局 `throwIfStopped()`，再检查 Free 服务自己的停止标志。全局停止异常没有结构化错误码，因此被 `fillSessions()` 的单账号 catch 当成普通登录失败：当前邮箱加入失败集合，索引推进，随后下一个账号再次遇到同一遗留异常。结果是任务看起来持续运行，实际上不会进入登录页、验证码或 `/api/auth/session` 读取，最终可能把全部目标账号逐条记为失败。

问题只在全局自动注册停止标志仍为真时影响新启动或恢复的 Free 资格、AT/Session 登录任务。账号凭据、已有 AT、资格证据、两个 Free 分组和源 TXT 没有损坏。

### 实现与安全边界

- `free-account-session-fill-task` 接收 Background 的 `clearStopRequest()`，每次实际执行开始前调用；开始任务和断点继续共用同一入口，因此都不会继承上一轮自动注册的停止状态。
- Free 服务捕获全局停止异常后统一补充 `FREE_ACCOUNT_CHECK_STOPPED` 和 `retryable=false`，让运行途中新的全局停止信号退出整批，而不是落入单账号失败分支继续污染计数。
- 用户通过补充任务自身“停止”按钮产生的取消语义保持不变；当前安全边界前已经保存的 Session 不回滚。
- 不修改登录页面自动化、密码/TOTP/邮箱验证码/Passkey、Session 完整性与邮箱一致性校验、账号选择、资格状态、分组或自动下载格式。

### 回归覆盖

- Session 任务控制器测试验证进入实际账号循环前只调用一次全局停止清理，并保持启动消息立即返回与 Background 下载行为。
- Free 服务测试模拟全局 `throwIfStopped()` 抛出无错误码的遗留停止异常，验证其被规范化为 `FREE_ACCOUNT_CHECK_STOPPED`、不会调用登录器，也不会把账号记为普通失败后继续。
- 既有停止边界、单账号失败隔离、Session 邮箱不匹配、存储失败停批和中断续跑测试保持通过。

### 验证与发布影响

- Session/V3 定向测试共 `20/20` 通过。
- `npm test` 共 `406/406` 通过。
- 递归 `node --check` 共检查 `295` 个 JavaScript 文件，全部通过；仓库脚本因当前 Git 索引为空只报告 `0` 个文件，因此未把该空结果作为语法证据。
- `npm run audit` 通过：文档结构、链接、版本、归档索引、V3 smoke、Removed Network 和 Phone/SMS 审计均通过。
- `npm run e2e` 独立通过 `1/1`；实际使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport，Side Panel 无未捕获页面错误。
- 未修改 Manifest 版本、扩展权限、账号 schema、Free 分组标准或远端接口。重新加载扩展后，应先停止当前旧任务；点击“补充 Session”重新开始，或在扩展重载后对中断任务点击“继续补充 Session”，新执行入口才会使用修复后的停止状态隔离。

---

<a id="2026-08-05-task-events-stale-after-open"></a>

## 补充 Session 任务已推进但事件面板停在第一条

日期：2026-08-05

关联记录：[补充 Session 长时间显示 0/120 且事件按钮无可见反馈](#2026-08-05-session-fill-progress-events-visibility)、[补充 Session 连续处理账号但成功始终为 0](#2026-08-05-session-fill-stale-global-stop)

### 故障现象与诊断证据

用户截图显示同一个 `fill_session` 任务卡已经更新为“处理中 `12/100`、成功 `0`、失败 `11`”，Free 组按钮也显示“补充 Session `12/100`”；但上方已打开的事件面板仍只有任务开始和“第 `1/100` 个账号正在处理”两条事件。任务实际继续推进，事件视图没有显示后续逐账号失败原因。

回归测试先打开一个运行中任务的事件，再触发任务面板定时轮询。轮询后 `GET_ACCOUNT_TASKS` 正常执行并更新任务卡，但 `GET_ACCOUNT_TASK_EVENTS` 请求次数仍保持为 `1`，事件渲染也只有首次打开时的一次，稳定复现截图状态。

归档不保存截图中的真实任务 ID、邮箱、密码、2FA、AT、Session、Cookie、验证码或事件敏感内容。

### 根因与影响范围

任务控制器的 `showEvents(taskId)` 只在用户点击“事件”时读取一次事件。`schedulePoll()` 每 `1.2` 秒调用 `refresh()`，但 `refresh()` 只更新任务列表，不记录当前打开的任务 ID，也不刷新可见事件容器。因此任务卡和事件面板由两条不同生命周期驱动，前者持续更新，后者成为静态快照。

问题影响所有运行中任务的已打开事件面板，补充 Session 长任务最明显。Background 事件仓库仍在正常追加逐账号事件，任务执行、Session 保存和失败计数没有因该 UI 缺陷停止。

### 实现与安全边界

- 任务面板控制器保存当前打开的 `activeEventTaskId`，把事件读取拆为可复用的 `refreshEvents()`。
- 任务列表每次轮询完成后，如果事件容器仍可见，则同步读取当前任务的最新事件并重绘；事件渲染器继续把内部滚动位置移动到最新一条。
- 自动刷新不重复调用外层 `scrollIntoView()`，避免每 `1.2` 秒把整个账号面板强制拉动；只有用户首次点击“事件”时执行聚焦和带入视口。
- 用户关闭事件、删除当前任务或批量清理终态任务时清除当前任务 ID。异步事件响应返回前若面板已关闭，不会重新显示事件容器。
- 不改变 Background 事件格式、脱敏、压缩上限、任务轮询间隔、Session 登录器、失败策略或账号数据。

### 回归覆盖

- 新增红绿回归：打开事件后触发一次任务轮询，验证事件请求从 `1` 增至 `2`、事件重绘两次且最后一次包含新事件。
- 既有测试继续覆盖首次点击事件时显示、聚焦和带入视口，任务卡从中断旧快照刷新为运行中新序号，以及取消、删除和批量清理路由。
- 定向任务面板测试共 `8/8` 通过。

### 验证与发布影响

- `npm test` 共 `407/407` 通过。
- 递归 `node --check` 共检查 `295` 个 JavaScript 文件，全部通过。
- `npm run audit` 通过：文档结构、链接、版本、归档索引、V3 smoke、Removed Network 和 Phone/SMS 审计均通过。
- `npm run e2e` 独立通过 `1/1`；隔离 Chrome 场景在事件面板已经打开后追加新事件，并验证无需再次点击即可自动显示。实际使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport。
- 未修改 Manifest 版本、扩展权限、任务或账号 schema、Free 分组标准及远端接口。重新加载扩展后，再打开运行中任务的“事件”，事件会跟随任务卡自动刷新。

---

<a id="2026-08-05-session-reader-envelope-incomplete"></a>

## 登录完成但完整 Session 被响应外壳误判为缺失

日期：2026-08-05

关联记录：[补充 Session 连续处理账号但成功始终为 0](#2026-08-05-session-fill-stale-global-stop)、[补充 Session 任务已推进但事件面板停在第一条](#2026-08-05-task-events-stale-after-open)

### 故障现象与诊断证据

事件面板修复后，用户看到前 `11` 个账号统一失败，错误码为 `FREE_ACCOUNT_SESSION_INCOMPLETE`，提示“登录完成但未读取到完整 ChatGPT Session”。事件同时显示账号确实完成了登录阶段，任务在第 `12/100` 个账号开始前被用户取消，成功数量仍为 `0`。

使用与 Content Script 读取器一致的脱敏夹具复现：登录器返回顶层 `ok`、HTTP `status`、AT 和邮箱，完整 `/api/auth/session` 对象位于顶层 `session` 字段。该内层对象包含用户、账号、AT 和过期时间，但批量任务仍把账号加入失败集合并产生相同错误码。

归档和测试只使用 `.test` 虚构账号，不保存用户真实邮箱、密码、2FA、AT、Session、Cookie、验证码或任务 ID。

### 根因与影响范围

`login-session-executor` 的页面消息沿用 Session 读取器响应格式，可能返回 `{ ok, status, session, accessToken, email }`。`free-account-service.normalizeSessionPayload()` 原本只判断传入对象是否非空，不解包内层 `session`；`fillSessions()` 随后检查外层 `session.user`，必然为空，于是把已经存在的完整内层 Session 误判为不完整。

问题影响所有通过响应外壳返回 Session 的密码、TOTP 或邮箱验证码登录结果，因此会表现为多个账号同码连续失败。登录、验证码和接口请求本身可能已经成功；错误发生在结果规范化与落库前，账号旧 AT、资格证据和分组没有被覆盖。

### 实现与安全边界

- `normalizeSessionPayload()` 识别无外层用户身份、但包含读取状态、顶层 AT/邮箱或内层账号身份的 Session 读取器外壳，并最多递归解包三层。
- `fillSessions()` 同时接受 `login.session` 包装形式和登录器直接返回完整 Session 的形式，再统一执行完整性、AT 和目标邮箱一致性校验。
- 存储中只保存内层完整 `/api/auth/session` 内容，不写入 `ok`、HTTP `status` 等 transport 元数据；同次 AT 和更新时间继续同步保存。
- 空响应、空内层对象、缺用户、缺 AT 或邮箱不一致仍产生失败，不会为了提高成功数放宽安全校验。
- 不修改密码、2FA/Passkey、取件地址、资格状态、Free 分组、Cookie 清理、登录顺序或自动导出格式。

### 回归覆盖

- 新增红绿回归使用读取器同形外壳：修复前稳定得到成功 `0`，修复后账号进入完成集合、失败集合为空，并只保存内层完整 Session。
- 既有测试继续覆盖直接 Session 返回、Session 邮箱不一致、存储失败停批、规范账号写入回滚、停止边界和 120 条缺 Session 导入。
- Session/V3 定向测试共 `21/21` 通过。

### 验证与发布影响

- `npm test` 共 `408/408` 通过。
- 递归 `node --check` 共检查 `295` 个 JavaScript 文件，全部通过。
- `npm run audit` 通过：文档结构、链接、版本、归档索引、V3 smoke、Removed Network 和 Phone/SMS 审计均通过。
- `npm run e2e` 独立通过 `1/1`；实际使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport，Side Panel 无未捕获页面错误。
- 未修改 Manifest 版本、扩展权限、账号或任务 schema、Free 分组标准及远端接口。重新加载扩展后重新启动“补充 Session”，此前失败且仍缺 Session 的账号会再次进入选择范围并使用新的解包逻辑。

---

<a id="2026-08-06-task-event-failure-retention-scroll"></a>

## 补充 Session 部分失败后无法查看早期失败原因

日期：2026-08-06

关联记录：[补充 Session 长时间显示 0/120 且事件按钮无可见反馈](#2026-08-05-session-fill-progress-events-visibility)、[补充 Session 任务已推进但事件面板停在第一条](#2026-08-05-task-events-stale-after-open)、[登录完成但完整 Session 被响应外壳误判为缺失](#2026-08-05-session-reader-envelope-incomplete)

### 故障现象与诊断证据

用户完成一批 `15` 个账号的补充 Session，任务结果为成功 `11`、失败 `4`。打开事件后只能看到后段成功和进度记录，向上滚动时又会被每 `1.2` 秒的自动刷新拉回底部，因此无法找到四个账号的具体失败原因。用户确认没有其它诊断或事件内容可提供。

现有任务中的四条历史失败原因无法可靠还原：如果错误事件已经被旧压缩策略删除，任务结果只剩失败数量，不保存密码、验证码、Session 或原始登录器响应，不能根据后续成功事件推测具体账号级原因。归档不保存真实邮箱、任务 ID、密码、2FA、AT、Session、Cookie、验证码或浏览器登录数据。

### 根因与影响范围

- `renderEvents()` 每次重绘后无条件把 `scrollTop` 设为新的 `scrollHeight`。任务轮询持续刷新已打开的事件容器，用户手动向上滚动也会在下一次轮询被强制带回底部。
- 事件仓库超过 `maxPerTask` 后只保留最近事件。批量 Session 任务每个账号会产生处理、成功或失败等多条事件，早期错误可能先于后续普通进度被移除。
- 仓库再次压缩时旧 `EVENTS_COMPACTED` 摘要会参与候选选择，摘要中的历史压缩数量也没有累加，连续压缩后的数量可能失真。
- 问题只影响历史事件的查看与保留，不改变任务成功/失败计数、Session 落库、AT、账号分组、登录流程或自动下载结果。`11/15` 成功说明本批次不是共享 Session 提取链路整体失效，剩余 `4/15` 属于账号级失败。

### 实现与安全边界

- 事件渲染前记录容器的滚动位置、高度和可视高度。用户原本距离底部不超过 `32px` 时继续跟随最新事件；用户已向上查阅时，刷新后保留原位置，并限制在新的合法滚动范围内。
- 事件压缩先选择错误级事件，再用最新的未选普通事件填满剩余容量，最终仍严格受 `maxPerTask` 限制。
- 旧 `EVENTS_COMPACTED` 摘要不再占用候选容量；历史 `compactedCount` 与本轮删除数量累计，摘要同时记录当前保留的失败数量。
- 事件继续经过统一敏感信息脱敏。修复不扩大事件上限，不在任务仓库中增加账号凭据，也不尝试从账号数据重建旧失败原因。

### 回归覆盖

- 渲染器测试覆盖用户已向上滚动时保留位置，以及用户原本接近底部时继续跟随最新事件。
- 事件仓库测试先写入一个早期 `LOGIN_PAGE_TIMEOUT` 错误，再追加多条普通进度，验证早期原因仍存在、容量不超限，连续压缩后的累计数量准确。
- 任务面板既有测试继续覆盖已打开事件随任务轮询刷新、首次点击带入视口、关闭和删除时解除当前事件任务。

### 验证与发布影响

- 事件渲染、事件仓库和任务面板定向测试共 `14/14` 通过。
- `npm test` 共 `411/411` 通过。
- `npm run syntax` 通过但因当前 Git 索引为空只报告 `0` 个文件；递归 `node --check` 共检查 `296` 个 JavaScript 文件，全部通过，并作为实际语法证据。
- `npm run docs:check` 与 `npm run audit` 通过：文档结构、链接、版本、归档索引、V3 smoke、Removed Network 和 Phone/SMS 审计均无错误。
- `npm run e2e` 独立通过 `1/1`；实际使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport，MV3 Service Worker 与 Side Panel 正常加载且没有连接用户浏览器。
- 未修改 Manifest 版本、扩展权限、账号或任务 schema、Free 分组标准、Session 完整性校验及远端接口。重新加载扩展后再次启动补充 Session，只会选择仍缺 Session 的账号；旧任务已被压缩的四条原因无法恢复，新运行产生的失败会按新规则保留。

---

<a id="2026-08-07-step5-user-already-exists-diagnostic"></a>

## 第 5 步已注册邮箱被误报为步骤 4 且错误码被遮盖

日期：2026-08-07

关联记录：[第 5 步 Try again 重建资料表单后字段为空](issue-fix-archive-2026-07.md#2026-07-26-step5-retry-rerender-refill)、[自定义邮箱池已注册账号阻止规则](issue-fix-archive-2026-07.md#2026-07-25-custom-email-pool-selection-safety)

### 故障现象与诊断证据

用户导出的最近失败诊断显示，当前失败节点为 `fill-profile`，资料提交后页面返回 `user_already_exists`，但错误文案写成“步骤 4”，结构化错误码位置又显示为 `[TOKEN_REDACTED]::`。同一诊断末尾已经进入下一轮并运行 `submit-signup-email`，证明自动流程没有卡死；上一轮独立出现的第 10 步无资格结果也已正常切换账号，与本故障无关。归档不保存真实邮箱、姓名、生日、密码、验证码、AT、Session、Cookie、标签页或任务标识。

### 根因与影响范围

- `content/signup-page.js` 的通用 `createSignupUserAlreadyExistsError()` 默认文案来自第 4 步，第 5 步的三个检测出口调用时没有传入自己的文案。
- `content/auth-page-recovery.js` 已接收 `step`，但两个 `user_already_exists` 抛错分支仍硬编码“步骤 4”。
- `sidepanel/failure-diagnostics.js` 使用通用的二十字符以上令牌正则，`SIGNUP_USER_ALREADY_EXISTS` 也符合该形状，因此在导出时被误遮盖。
- 问题只影响诊断可读性和步骤定位。Background 仍会把明确已注册邮箱标记为注册阻止、从注册池排除、结束当前轮，并在允许跳过失败时选择下一账号。

### 实现与安全边界

- 第 5 步三个 `user_already_exists` 出口统一使用“资料提交后检测到”的第 5 步文案，明确邮箱已注册、当前轮结束并排除该邮箱。
- 通用认证重试器将步骤号规范为调用方传入值，缺失时才回退第 4 步；第 5 步额外标明错误发生在资料提交之后。
- 诊断脱敏先用短占位符保护 `UPPER_SNAKE_CASE::` 错误码，执行原有敏感信息遮盖后再恢复；JWT、Bearer、AT、密码、验证码、邮箱和普通长令牌继续脱敏。
- 不改变邮箱池状态机、自动运行重试策略、Free 分组、资格检测、登录路线或存储 schema，也不推测性增加已有账号登录恢复。

### 回归覆盖

- 诊断测试验证 `SIGNUP_USER_ALREADY_EXISTS::` 保持可见，同时 JWT、Access Token 和普通长令牌不可见。
- 第 5 步测试让通用认证恢复器在 `user_already_exists` 页面以 `step: 5` 执行，精确断言结构化错误和第 5 步文案，并检查三个资料提交出口都使用专用文案。
- 自动运行既有测试继续验证已注册邮箱被阻止、写入注册排除状态并继续下一账号，未改变业务裁决。

### 验证与发布影响

- 定向诊断、资料页和自动运行测试共 `26/26` 通过。
- `npm test` 共 `413/413` 通过。
- `npm run syntax` 通过但因当前 Git 索引为空只报告 `0` 个文件；递归 `node --check` 共检查 `296` 个 JavaScript 文件，全部通过。
- `npm run docs:check` 与 `npm run audit` 通过：文档结构、相对链接、版本、归档索引、V3 smoke、Removed Network 和 Phone/SMS 审计均无错误。
- `npm run e2e` 独立通过 `1/1`；实际使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport，MV3 Service Worker、Side Panel、运行时消息和诊断剪贴板正常，且没有连接用户浏览器。
- 未修改 Manifest 版本、扩展权限、远端接口、账号 schema 或自动运行状态机。重新加载扩展后，新导出的最近失败会显示完整错误码和正确步骤；旧剪贴板诊断文件不会被追溯改写。

---

<a id="2026-08-07-no2fa-step10-storage-quota-retry"></a>

## 免 2FA 第 10 步存储配额超限后错误回到第 7 步

日期：2026-08-07

关联记录：[自动运行启动时 Session storage 超出配额](#2026-08-05-session-storage-quota-free-results)、[免 2FA 第 10 步无资格后错误回退第 7 步](#2026-08-03-step10-ineligible-post-auth-restart)

### 故障现象与诊断证据

用户日志显示，免 2FA 路线已明确记录“步骤 7–9 已跳过，开始执行步骤 10 的资格验证与 Free 保存”；两秒后报 `Resource::kQuotaBytes quota exceeded`，随后又记录“步骤 10：正在确认当前认证页状态，以决定是否回到步骤 7 重开”。这证明失败发生在第 10 步本地保存阶段，却被通用认证后链路恢复器误当成登录会话问题。归档不保存真实邮箱、密码、验证码、AT、完整 Session、Cookie、标签页或任务标识。

### 根因与影响范围

- `freeAccountResults` 和规范账号记录都会保存账号凭据与完整 Session；Manifest 只有 `storage` 权限时，`chrome.storage.local` 受默认总容量限制，累计数据会触发 Chromium 的 `Resource::kQuotaBytes quota exceeded`。
- `free-account-service.saveResults()` 原样抛出 Chrome 错误，没有结构化标明这是本地存储配额问题。
- `getPostStep6AutoRestartDecision()` 只排除了明确 `ineligible`；其余第 7–10 步错误都会探测认证页并返回授权链起点。免 2FA 的第 10 步因此错误回到第 7 步，破坏第 7–9 步固定跳过语义。
- 配额错误发生时 Free 结果尚未完成写入。资格接口、Session 身份校验和免 2FA 路线选择本身没有失败。

### 实现与安全边界

- Manifest 增加 `unlimitedStorage`，使大量 Free Session 和规范账号数据不再受 `storage.local` 默认容量上限约束；smoke audit 固定检查该权限。
- Free 结果写入将 `kQuotaBytes`、`QUOTA_BYTES` 和常见 quota 文案转换为 `FREE_ACCOUNT_STORAGE_QUOTA_EXCEEDED`，提示重新加载扩展并保留当前注册现场。
- 最终资格节点的配额错误不再调用认证页探测。自动运行把当前第 10 步恢复为 `pending` 并有限重试，节点索引保持当前节点；免 2FA 第 7–9 步继续是 `skipped`。
- 当前节点重试耗尽后标记不可进行整轮重试并停止，保留当前账号、标签页和登录状态，不清 Cookie、不换邮箱、不删除已有账号数据。
- 明确 `not-eligible` 仍不重试第 10 步，按既有规则保存无资格证据、排除邮箱并进入下一账号。真正的认证链错误仍可按原策略回到授权起点。

### 回归覆盖

- 免 2FA 第 10 步测试使用原始 `Resource::kQuotaBytes quota exceeded`，验证恢复步骤仍为 `10`、标记 `retryCurrentNode=true`，且认证页探测次数为 `0`。
- 节点恢复分支测试验证只把当前节点置为 `pending`、索引保持当前节点，分支内不存在认证页探测或第 7 步锚点。
- Free 服务测试验证 Chrome 配额错误转换为 `FREE_ACCOUNT_STORAGE_QUOTA_EXCEEDED`，并带有保留现场和重新加载后重试第 10 步提示。
- smoke audit 验证 Manifest 必须包含 `unlimitedStorage`。

### 验证与发布影响

- 配额恢复与 V3 Free 服务定向测试共 `35/35` 通过。
- `npm test` 共 `416/416` 通过。
- `npm run syntax` 通过但因当前 Git 索引为空只报告 `0` 个文件；递归 `node --check` 共检查 `296` 个 JavaScript 文件，全部通过。
- `npm run docs:check` 与 `npm run audit` 通过：文档结构、相对链接、版本、归档索引、V3 smoke、Removed Network 和 Phone/SMS 审计均无错误；smoke audit 已确认 `unlimitedStorage` 存在。
- `npm run e2e` 独立通过 `1/1`；实际使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport，MV3 Service Worker 与 Side Panel 正常加载，且没有连接用户浏览器。
- Manifest 版本仍为 `3.0.0`，但权限列表新增 `unlimitedStorage`。必须在 `chrome://extensions/` 重新加载扩展后再重试第 10 步；已有账号、资格记录和 Session 不需要删除。

---

<a id="2026-08-07-no2fa-step10-manual-execution"></a>

## 免 2FA 手动跳过前六步后无法直接执行第 10 步

日期：2026-08-07

关联记录：[十步工作流重构](#2026-08-02-workflow-v2-ten-step-refactor)、[第 10 步不再允许单独跳过](#2026-08-04-step10-manual-skip-button)、[免 2FA 第 10 步存储配额超限后错误回到第 7 步](#2026-08-07-no2fa-step10-storage-quota-retry)

### 故障现象与诊断证据

用户选择免 2FA Free 路线并手动处理前六步后，第 7–9 步正确显示“当前路线跳过”，但第 10 步“验证资格并进入 Free”仍为灰色且无法点击。截图显示进度为 `8 / 10`，第 4 步“已有账号 2FA 登录”仍处于待处理状态；这条条件分支并未实际触发，却被当作第 10 步的必需前置节点。归档不保存真实邮箱、密码、TOTP、验证码、AT、完整 Session、Cookie、标签页或任务标识。

### 根因与影响范围

- Side Panel 的 `arePreviousNodesReadyForManualExecute()` 只接受 `completed`、`manual_completed` 和 `skipped`，没有读取节点的 `applicability: conditional`。
- Background 的 `ensurePreviousNodesReadyForManualExecute()` 独立实现了同样的全必需判断；即使只放开按钮，后台仍会用“请先完成或跳过前置步骤”拒绝第 10 步。
- 第 4 步只有在第 3 步检测到已有账号 TOTP 挑战时才真正必需。未触发挑战的待处理状态不应阻塞后续手动节点。
- 问题只影响手动节点直达与进度收尾；自动运行、资格检测、Free 落库、无资格裁决和第 10 步不可人工跳过规则没有失效。

### 实现与安全边界

- 工作流按钮状态管理器新增节点定义和条件节点必需性判断；未显式要求的 `conditional` 待处理节点视为非阻塞。
- Side Panel 只有在 `existingTotpLoginRequired=true` 时，才继续把第 4 步作为强制前置节点；`currentNodeId` 可能只是迁移后的首个未完成节点，不能单独作为 TOTP 挑战证据。
- 第 3 步把真实 TOTP 挑战持久化为 `existingTotpLoginRequired=true`，普通新账号路径写为 `false`；第 4 步登录成功后清除该标记。
- Background 在直接执行第 10 步前把被旁路的第 4 步标记为 `skipped`，因此第 10 步完成后进度可达到 `10 / 10`。
- `persist-no-2fa-free` 和 `check-trial-eligibility` 仍不生成“跳过”按钮，Background 仍拒绝 `SKIP_NODE`；自动运行锁、完整 2FA 和 Passkey 路线保持不变。

### 回归覆盖

- 侧栏按钮状态测试复现第 1–3、5–6 步已处理、第 4 步待处理、第 7–9 步路线跳过、第 10 步待执行的免 2FA 状态，验证第 10 步按钮启用且仍无跳过按钮。
- Background 前置校验测试验证同一状态可以直接执行第 10 步，并自动把第 4 步写为 `skipped`。
- 反向测试写入真实 TOTP 挑战标志，验证 Side Panel 与 Background 都继续阻止绕过第 4 步。
- 既有测试继续覆盖最终资格节点不可跳过、路线重置、无资格切换账号和第 10 步配额错误只重试当前节点。

### 验证与发布影响

- 工作流、Side Panel、路由和自动运行定向测试共 `50/50` 通过。
- `npm test` 共 `420/420` 通过。
- `npm run syntax` 通过但因当前 Git 索引为空只报告 `0` 个文件；另行递归 `node --check` 共检查 `296` 个 JavaScript 文件，全部通过。
- `npm run docs:check` 与 `npm run audit` 通过：文档结构、链接、版本、归档索引、V3 smoke、Removed Network 和 Phone/SMS 审计均无错误。
- `npm run e2e` 独立通过 `1/1`；实际使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport，MV3 Service Worker 与 Side Panel 正常加载，且没有连接用户浏览器。
- Manifest 版本、权限、Free schema、账号分组和远端接口均未修改。重新加载扩展后，免 2FA 手动流程可直接点击第 10 步；若页面确实要求 TOTP，仍需先完成第 4 步。

---

<a id="2026-08-07-no2fa-step10-eligibility-timeout-retry"></a>

## 免 2FA 第 10 步资格接口超时后错误回到第 7 步

日期：2026-08-07

关联记录：[免 2FA 第 10 步无资格后错误回退第 7 步](#2026-08-03-step10-ineligible-post-auth-restart)、[免 2FA 第 10 步存储配额超限后错误回到第 7 步](#2026-08-07-no2fa-step10-storage-quota-retry)

### 故障现象与诊断证据

用户最近失败诊断显示，免 2FA 路线已经进入 `persist-no-2fa-free`，第 10 步资格接口等待超过 30 秒后返回可重试失败；下一条日志却开始“确认当前认证页状态，以决定是否回到步骤 7 重开”，随后节点从最终资格保存切换到第 7 步取密码验证码。故障发生在资格服务请求阶段，没有证据表明密码、验证码或当前登录态失效。归档不保存真实邮箱、密码、验证码、AT、完整 Session、Cookie、标签页、任务标识或远端请求内容。

### 根因与影响范围

- 第 10 步把资格超时归一化为 `UPI_ELIGIBILITY_CHECK_FAILED`、`trialEligibilityStatus: failed` 和 `retryable: true`，本身没有误判账号为无资格。
- `getPostStep6AutoRestartDecision()` 之前只为本地存储配额错误提供当前节点重试。其它第 7–10 步异常会落入通用认证后恢复，先探测页面，再把恢复起点设为认证链第 7 步。
- 当前节点重试执行分支的日志和耗尽错误又被写死为存储配额语义；即使复用该分支，资格超时也可能被错误改写为 `FREE_ACCOUNT_STORAGE_QUOTA_EXCEEDED`。
- 问题影响完整 2FA、Passkey 和免 2FA 共用的两个最终资格节点；免 2FA 最明显，因为其第 7–9 步按路线本应始终跳过。

### 实现与安全边界

- 最终资格节点收到可重试的 `trialEligibilityStatus: failed`、`UPI_ELIGIBILITY_CHECK_FAILED` 或 `FREE_ACCOUNT_ELIGIBILITY_TIMEOUT` 时，恢复决策标记为 `eligibility-transient`，恢复步骤保持当前第 10 步。
- 该分支不调用认证页探测，只把当前节点恢复为 `pending` 并有限重试；保留当前账号、登录现场和免 2FA 第 7–9 步的 `skipped` 状态，不清 Cookie、不换邮箱、不重做密码流程。
- 当前节点重试器改为读取决策中的原因标签、耗尽错误码和提示。资格重试耗尽后保留原资格错误类型，设置 `retryable=false` 和 `preserveSignupSession=true` 后停止，存储配额仍使用独立 `storage-quota` 语义。
- 明确 `ineligible` 仍先保存无资格证据，再结束当前账号并选择下一账号；真实认证或会话错误仍可进入认证链恢复，本修复不把所有第 10 步错误一律留在原节点。

### 回归覆盖

- 新增自动运行回归，使用与诊断一致的资格超时结构化错误，验证 `restartStep=10`、`retryCurrentNode=true`、`retryKind=eligibility-transient`，认证页探测次数为 `0`，错误码保持 `UPI_ELIGIBILITY_CHECK_FAILED`。
- 既有回归继续分别覆盖明确无资格切换下一账号、存储配额只重试第 10 步、最终资格节点不可人工跳过和免 2FA 路线第 7–9 步固定跳过。

### 验证与发布影响

- `node --check background.js` 与定向自动运行测试通过，定向结果为 `17/17`。
- 递归 `node --check` 共检查 `296` 个 JavaScript 文件，全部通过；`npm run syntax` 通过但因当前 Git 索引为空只报告 `0` 个文件。
- `npm test` 共 `421/421` 通过，包含隔离 Chrome for Testing 的 MV3 E2E 用例。
- `npm run docs:check` 与 `npm run audit` 通过：文档结构、相对链接、版本、归档索引、V3 smoke、Removed Network 和 Phone/SMS 审计均无错误；smoke audit 检查了 `150` 个运行文件。
- `npm run e2e` 独立通过 `1/1`；实际使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport，MV3 Service Worker 与 Side Panel 正常加载，且没有连接用户浏览器。
- Manifest 版本、权限、Free schema、账号分组、资格接口和重试次数上限均未修改。重新加载扩展后，新的资格接口临时失败只会重试第 10 步；已产生的旧日志不会被追溯改写。

---

<a id="2026-08-07-persisted-settings-session-override"></a>

## 指纹浏览器重启后插件配置恢复为默认值

日期：2026-08-07

关联记录：[自动运行启动时 Session storage 超出配额](#2026-08-05-session-storage-quota-free-results)、[切回完整 2FA 后残留免 2FA 路线状态](#2026-08-04-full-2fa-route-stale-no2fa-state)

### 故障现象与诊断证据

用户反馈每次关闭并重新打开指纹浏览器后，扩展配置都会恢复，截图中主流程路线、资格/TOTP API 和取码等待等字段显示默认值，但自定义邮箱池及其使用统计仍存在。这表明扩展身份和部分持久数据没有整体丢失，更符合启动状态合并覆盖，而不是完整 Profile 被清空。归档不保存用户真实邮箱、密码、查询 Key、API 凭据、AT、Session、Cookie、代理或指纹浏览器标识。

### 根因与影响范围

- 状态读取顺序为 Default、`chrome.storage.local` 持久配置、`chrome.storage.session` 运行状态；Session 中同名键最后合并，因此旧快照可覆盖 Local 已保存值。
- 流程重置会把包含 `PERSISTED_SETTING_DEFAULTS` 的完整状态重新写入 Session；普通 `setState()` 也没有使用已经注入的 `setPersistentSettings`，配置副本长期同时存在于两套存储。
- 自定义邮箱池已有 `protectPersistedCustomEmailPoolOnReload()`，会用 Local 完整列表修复 Session 空列表或局部列表；其它配置没有同类保护，形成“邮箱池还在但设置恢复默认”的特征。
- 问题影响路线、资格/TOTP API、查询 Key、等待时间、邮箱 Provider 及所有 `PERSISTED_SETTING_KEYS`。账号结果、规范账号记录和邮箱池 Local 数据本身没有被本次覆盖删除。

### 实现与安全边界

- 状态仓库接收完整 `PERSISTED_SETTING_KEYS`，读取时从旧 Session 状态剥离这些键，使 Local 成为持久配置的唯一权威来源；当前节点、倒计时、标签页和自动运行等运行字段仍由 Session 恢复。
- `setState()` 遇到配置键时先调用 `setPersistentSettings()` 写入 Local，再从 Session patch 删除配置键。设置路由已有的 Local 先写逻辑保留，因此即使后续 Session 写入失败，配置仍不会回退。
- `resetState()` 通过同一 `sanitizeSessionPatch()` 过滤后再写 Session，不再复制完整配置默认值。
- 为兼容旧数据，历史 Session 中的自定义邮箱池局部运行字段仍可与 Local 完整列表合并；新写入会同步到 Local 并从 Session 删除。
- 同一 Profile 和同一扩展 ID 的重启受本修复保护。若指纹浏览器每次创建新 Profile、清除扩展 Local 数据或改变扩展 ID，存储天然隔离，需要通过配置导入恢复，本修复不跨越该浏览器安全边界。

### 回归覆盖

- 新增精确重启回归：Local 保存免 2FA、自定义资格/TOTP API、42 秒等待和自定义邮箱服务，Session 保留完整 2FA、默认 API、10 秒等待和 Hotmail；修复前稳定失败并恢复成 `full-2fa`，修复后 Local 全部胜出，Session 当前节点仍保留。
- 新增写入回归，验证 `setState()` 中的路线配置调用 Local 持久化，Session 只接收当前节点；`sanitizeSessionPatch()` 会删除遗留配置键。
- 既有邮箱池测试继续覆盖空 Session 恢复、局部运行状态与 Local 完整列表合并，以及状态更新不得回滚已用和资格证据。

### 验证与发布影响

- 精确状态仓库回归 `9/9` 通过；设置默认值、保存路由、Side Panel 保存控制器和状态仓库定向测试共 `24/24` 通过。
- `npm test` 共 `423/423` 通过。浏览器 E2E 先通过设置消息把免 2FA 写入 Local，再注入过期的完整 2FA Session 快照并重新加载侧栏，验证界面仍恢复 Local 路线且后续路线切换正常。
- `npm run syntax` 通过但因当前 Git 索引为空只报告 `0` 个文件；递归 `node --check` 共检查 `296` 个 JavaScript 文件，全部通过。
- `npm run docs:check` 与 `npm run audit` 通过：文档结构、相对链接、版本、归档索引、V3 smoke、Removed Network 和 Phone/SMS 审计均无错误；smoke audit 检查了 `150` 个运行文件。
- `npm run e2e` 独立通过 `1/1`；实际使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport，没有连接用户的指纹浏览器或日常 Chrome。
- Manifest 版本、权限、配置 schema、账号 schema、Free 分组和远端接口均未修改。重新加载扩展后需重新设置一次当前值，后续同一 Profile 重启应继续恢复；旧 Session 快照不会被继续采用为配置。

---

<a id="2026-08-07-fingerprint-browser-state-write-lag"></a>

## 指纹浏览器中账号越多、日志越长，自动运行越卡

日期：2026-08-07

关联记录：[自动运行启动时 Session storage 超出配额](#2026-08-05-session-storage-quota-free-results)、[指纹浏览器重启后插件配置恢复为默认值](#2026-08-07-persisted-settings-session-override)

### 故障现象与诊断证据

用户反馈同一扩展在指纹浏览器中运行明显卡顿。代码调用链显示，每次 `addLog()` 都先调用聚合 `getState()`，同时读取 Session、持久配置、账号运行历史、Free 结果和规范账号；随后 `setState({ logs })` 再执行一次 `storage.session.get(null)`。运行态 patch 构造器即使只收到 `logs`，仍会附加完整 `runtimeState` 和节点状态。账号记录和日志增长后，高频日志因此反复读取大量无关 Local 数据，并重复序列化整份运行态。归档不保存真实邮箱、密码、AT、Session、Cookie、代理、验证码或指纹浏览器标识。

### 根因与影响范围

- 日志持久化错误复用了面向完整界面状态的 `getState()`；该接口适合状态视图恢复，不适合高频追加日志。
- `buildSessionStatePatch()` 对所有 patch 都重建运行态，导致普通日志、设置和独立数据更新携带未变化的 `runtimeState`。
- `backgroundStateStore.setState()` 无条件读取完整 Session，即使 patch 与流程节点无关。
- 指纹浏览器的 Profile 资源隔离、磁盘调度和同时运行环境会放大上述扩展内部开销。代理延迟、CPU/内存限额、硬件加速和其它扩展仍属于外部性能边界。

### 实现与安全边界

- 运行态帮助器新增 patch 分类；只有流程 ID、运行 ID、当前节点、节点状态、共享运行字段或 OpenAI 流程字段变化时才读取当前 Session 并重建运行态。
- 普通日志和设置 patch 直接返回实际变化字段，状态仓库不再为它们调用 `storage.session.get(null)`，也不附带完整 `runtimeState`。
- 日志模块新增范围读取，只获取 `chrome.storage.session` 的 `logs` 键，不再加载 Free 结果、规范账号、运行历史和持久配置。
- 日志仍保持最多 500 条、实时 `LOG_ENTRY` 广播、敏感信息脱敏和 Session 持久化；节点更新仍完整合并已有节点状态，未改变工作流恢复语义。
- 未降低资格、登录或页面等待时间，也未绕过指纹浏览器资源策略。外部代理或页面本身慢时仍会按原超时和重试规则执行。

### 回归覆盖

- 新增普通日志 patch 回归，构造带大体积服务状态的 Session，验证日志更新不执行完整 Session 读取，写入结果只含 `logs`。
- 新增反向运行态回归，验证当前节点更新仍读取 Session，并保留已有其它节点状态。
- 新增日志范围读取回归，验证提供 Session 日志读取器时不再调用聚合 `getState()`，且原日志与新日志正常合并。
- 既有敏感信息脱敏、状态持久化、自动运行、账号任务和隔离浏览器 E2E 继续覆盖原行为。

### 验证与发布影响

- 状态仓库定向测试 `11/11`、日志脱敏与范围读取测试 `4/4` 通过。
- `npm test` 共 `426/426` 通过。
- 递归 `node --check` 共检查 `296` 个 JavaScript 文件，全部通过；`npm run syntax` 通过但因当前 Git 索引为空只报告 `0` 个文件。
- `npm run docs:check` 与 `npm run audit` 通过：文档结构、链接、版本、归档索引、V3 smoke、Removed Network 和 Phone/SMS 审计均无错误；smoke audit 检查了 `150` 个运行文件。
- `npm run e2e` 独立通过 `1/1`；实际使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport，没有连接用户的指纹浏览器或日常 Chrome。
- Manifest 版本、权限、账号 schema、Free 分组、任务 schema 和远端接口均未修改。重新加载扩展后新的 Background Service Worker 才会使用范围读取与精简 patch。

---

<a id="2026-08-07-sidepanel-settings-save-and-restore"></a>

## 设置显示已保存但重载侧栏后又恢复默认值

日期：2026-08-07

关联记录：[指纹浏览器重启后插件配置恢复为默认值](#2026-08-07-persisted-settings-session-override)、[指纹浏览器中账号越多、日志越长，自动运行越卡](#2026-08-07-fingerprint-browser-state-write-lag)

### 故障现象与诊断证据

用户在前一轮 Local 权威存储修复后再次反馈设置没有保存。真实浏览器回归把步间隔从默认 `2` 修改为 `7` 并点击“保存”：保存后 `chrome.storage.local` 和 `GET_STATE` 都返回 `7`，界面也提示“配置已保存”；重载侧栏后 Local 与 Background 仍为 `7`，但输入框重新显示 HTML 默认值 `2`。代码审计同时发现 `btn-save-settings` 没有任何点击监听器，已实现的设置区通用自动保存函数也没有挂到 DOM。归档不保存真实账号、密码、AT、Session、Cookie、API Key、代理或指纹浏览器标识。

### 根因与影响范围

- `applySettingsState()` 是首次状态恢复入口，但只回填部分路线、API 和邮箱设置，遗漏步间隔、自动重试、自动延迟、线程间隔、Cookie 清理和 OAuth 总超时等字段。
- `DATA_UPDATED` 增量处理器包含这些字段，因此运行过程中收到广播时可能显示正确；重新打开侧栏只走不完整的全量恢复，形成“后台保存了、界面却恢复默认”的错觉。
- “保存”按钮只有 DOM 和样式，没有绑定 `saveSettings()`；用户主动点击不会产生保存消息。
- `queueSettingsCardAutosaveFromEvent()` 已实现但没有注册到 `settings-card`，没有专用监听器的字段不会自动保存。
- 多个专用监听器并发调用保存时没有统一队列，旧请求响应可能遇到新 revision，依赖后续定时保存才能收尾。

### 实现与安全边界

- 设置控制器新增幂等 `bindEvents()`：保存按钮强制保存当前完整表单；设置区 `input` 使用原有防抖，`change` 立即保存。
- 所有 `saveSettings()` 调用通过 Promise 队列串行执行。旧请求期间出现的新 dirty revision 保留，下一项重新采集当前表单后再保存。
- 侧栏关闭时若上一笔保存仍在进行，不再跳过最新的 dirty revision；卸载刷新会把最新表单快照排到保存队列后面，避免快速修改后立即关闭时丢失最后一次设置。
- `applySettingsState()` 补齐自动重试、Cookie 清理、自动延迟、延迟分钟、失败线程间隔、步间隔和 OAuth 总超时控件，并同步相关禁用状态。
- Local 仍是持久配置唯一权威来源，Session 不重新保存配置副本；本修复没有恢复此前会覆盖 Local 的旧合并顺序。
- 自动运行期间自定义邮箱池保护、敏感配置规范化、Background 保存路由和配置导入导出格式保持不变。

### 回归覆盖

- 新增保存按钮单测，验证点击后发送 `SAVE_SETTING` 并包含当前表单路线值。
- 新增设置区通用 `change` 单测，验证没有专用监听器的字段也立即进入保存。
- 新增卸载竞态单测，验证第一笔保存尚未完成时产生的新修改会排队成为第二笔保存，并使用最新表单值。
- 浏览器 E2E 使用真实输入框把步间隔改为 `7`，立即点击真实“保存”按钮，同时验证 Local 和 `GET_STATE` 为 `7`；随后重载侧栏并验证输入框仍显示 `7`。
- 既有重启回归继续验证 Local 配置覆盖旧 Session 默认值；状态仓库性能回归继续验证普通设置 patch 不读取完整 Session。

### 验证与发布影响

- 设置控制器定向测试 `9/9` 通过。
- `npm test` 共 `428/428` 通过，包含真实保存按钮与重载恢复的隔离浏览器回归。
- 递归 `node --check` 共检查 `296` 个 JavaScript 文件，全部通过；`npm run syntax` 通过但因当前 Git 索引为空只报告 `0` 个文件。
- Manifest 版本、权限、配置 schema、账号 schema、Free 分组和远端接口均未修改。重新加载扩展并重新设置一次当前值后，同一 Profile 的侧栏重载应显示 Local 中的真实配置。

---

<a id="2026-08-08-free-results-recursive-state-message-limit"></a>

## 设置修复后设置、邮箱池和账号列表同时显示为空

日期：2026-08-08

关联记录：[设置显示已保存但重载侧栏后又恢复默认值](#2026-08-07-sidepanel-settings-save-and-restore)、[指纹浏览器中账号越多、日志越长，自动运行越卡](#2026-08-07-fingerprint-browser-state-write-lag)、[自动运行因 Session storage quota 超限终止](#2026-08-05-session-storage-quota-free-results)

### 故障现象与诊断证据

用户重新加载修复后的扩展后反馈设置内容、邮箱和账号列表全部消失。对当前 RoxyBrowser Profile 进行只读诊断后确认扩展 ID 与加载路径未变化，`chrome.storage.local` 中仍有自定义邮箱池 `20` 条、规范账号 `268` 条、Free 结果 `6` 条，Local 总量约 `92.6 MB`。侧栏直接调用 `GET_STATE` 返回 `Message exceeded maximum allowed size of 64MiB.`，因此首次恢复没有收到任何状态，输入框显示 HTML 默认值，邮箱池和账号面板也呈现为空。归档不保存真实 Profile ID、扩展 ID、邮箱、密码、AT、Session、Cookie、API Key、代理或验证码。

进一步按键统计发现 `freeAccountResults` 单键约 `90.5 MB`。6 个账号行每行都错误包含 `accountRecordsV2`、运行历史、日志、邮箱池、`runtimeState`，并从第二条开始递归包含上一版 `freeAccountResults`；最大单行约 `46 MB`。这说明数据没有被删除，而是账号结果递归膨胀后使运行时消息整体超限。

### 根因与影响范围

- `normalizeCredential()` 保留输入对象的所有字段；第 10 步把聚合 `getState()` 与账号补丁合并后传给 Free 服务，整份运行状态进入 credential。
- `sanitizeFreeAccountItem()` 过去使用“只删除 CDK/Plus 字段”的黑名单，未知运行字段会原样进入账号行，没有建立 V3 账号记录白名单边界。
- 后续账号保存又读取已膨胀的 `freeAccountResults`，使新账号行嵌套上一版完整结果，形成递归增长。
- `GET_STATE` 和 `SAVE_SETTING` 返回完整聚合状态，包含完整 Free 结果与规范账号；超过 Chrome 单条消息上限后，设置虽然仍在 Local，侧栏却无法恢复任何字段。

### 实现与安全边界

- `sanitizeFreeAccountItem()` 改为持久字段白名单，只允许邮箱、密码、2FA/Passkey、AT、完整 Session、取件地址、启用状态、来源、有效性和资格证据。运行状态、日志、历史、邮箱池、规范账号和递归结果全部拒绝进入账号行。
- 新增 `freeAccountResultsV3CompactionCompleted`。即使 `freeAccountToolV3MigrationCompleted` 已存在，只要旧行含非白名单字段，启动迁移仍会规范化并原子重写 Free 结果；密码、TOTP、Passkey 私钥材料、AT、Session、时间和资格结论保留。
- `GET_STATE` 及带 `state` 的设置响应删除完整 `freeAccountResults` 和 `accountRecordsV2`，只保留账号数量与资格统计摘要。账号面板继续通过 `GET_FREE_ACCOUNT_RESULTS` 按需读取明细。
- 修复前先把当前扩展 LevelDB 原样复制到用户下载目录作为恢复备份；不删除原 Profile、不清空 Local、不重新导入账号。
- 规范账号仓库、自定义邮箱池和其它配置没有参与压缩清理；业务分组、资格状态、登录器、导出格式和远端接口不变。

### 回归覆盖

- 新增 Free 项白名单回归，构造含递归结果、规范账号、历史、日志、邮箱池和运行态的账号行，验证这些字段全部剥离，同时保留密码、TOTP、AT、Session 和 Passkey。
- 新增已完成 V3 迁移后的压缩回归，验证旧污染数据只修复一次，写入失败边界继续保留原始数据。
- 新增运行时消息视图回归，验证直接 `GET_STATE` 和 `SAVE_SETTING.state` 都不携带完整账号仓库，并保留设置值和摘要。
- 隔离浏览器 E2E 注入模拟污染行，验证设置仍可读取，`GET_STATE` 不返回完整 Free 结果，账号专用接口返回清理后的账号行。

### 验证与发布影响

- 定向回归 `33/33` 通过；`npm test` 共 `433/433` 通过。
- 递归 `node --check` 共检查 `297` 个 JavaScript 文件，全部通过。
- `npm run e2e` 独立通过 `1/1`；实际使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport。
- 当前用户 Profile 的原始扩展 LevelDB 已备份到下载目录；重新加载扩展后由一次性压缩迁移修复现有 Free 结果。
- Manifest 版本、权限、账号 schema 版本、Free 分组、任务 schema 和远端接口均未修改。

---

<a id="2026-08-08-step3-email-verification-password-switch"></a>

## 邮箱注册默认进入验证码页后第 3 步无法创建密码

日期：2026-08-08

关联记录：[注册密码提交后快速重复点击并换邮箱重试](issue-fix-archive-2026-07.md#2026-07-26-signup-password-transition-timeout)、[第 7 步当前密码确认页被误判](#2026-08-03-step7-current-password-challenge)、[十步工作流重构](#2026-08-02-workflow-v2-ten-step-refactor)

### 故障现象与诊断证据

用户反馈 OpenAI 邮箱注册大部分情况下直接进入 `email-verification`，扩展因此找不到原先预期的密码输入框。2026-08-08 使用隔离浏览器核对当前官网页面后确认，验证码页会在部分会话显示“使用密码继续”，点击后进入 `/create-account/password`；官网页面自行提交密码表单。诊断只记录页面路径和分支，不保存真实邮箱、密码、验证码、Cookie、Sentinel token、请求 ID 或请求头值。

### 根因与影响范围

- 步骤 2 把“邮箱提交后进入验证码页”等同于“本轮没有密码页”，立即把步骤 3 标记为跳过，步骤 3 没有机会检查官网的新入口。
- 步骤 3 即使被手动执行，也会把验证码页直接作为 `skippedPasswordPage` 完成，不识别“使用密码继续”。
- 注册密码页与已有账号 `/log-in/password` 共用宽泛页面判断，缺少“注册创建密码”和“登录验证密码”的明确类型。
- 点击链接会替换整个文档；如果只在原内容脚本内等待新页面，执行上下文会随导航销毁，无法可靠完成后续填写。

### 实现与安全边界

- 步骤 2 进入验证码页后保持步骤 3 待执行。步骤 3 优先按 `/create-account/password` 链接识别入口，并支持中、英、日、印地语文本后备；明确排除 `/log-in/password`。
- 内容脚本先安排受操作延迟控制的官网链接点击并返回导航状态；Background 限时确认标签页进入注册密码页、恢复内容脚本后重新执行步骤 3，复用现有 `form.requestSubmit()` 密码表单逻辑。
- 点击后 20 秒仍未进入注册密码页，或恢复后的提交结果不确定时，返回 `SIGNUP_PASSWORD_SUBMIT_UNCERTAIN`，保留当前认证页和会话，不静默降级或直接重提注册请求。
- 后台只在密码提交后页面复核成功且来源为注册创建密码时写入 `gptPasswordSet=true` 和确认时间，并跳过尚未执行的 `fetch-gpt-password-code`、`set-gpt-password`；运行中、已完成、人工完成或已跳过状态不覆盖。
- 验证码页没有入口时保持 `gptPasswordSet=false`，步骤 7、8 继续待执行。扩展没有新增 `fetch`、Manifest 权限或未公开注册接口调用。

### 回归覆盖

- 页面检测覆盖注册链接优先级、多语言文本后备以及登录密码链接排除。
- 步骤 2 覆盖验证码落地后步骤 3不再预跳过；步骤 3 Background 覆盖跨导航恢复和 20 秒跳转失败的会话保留错误。
- 密码页帮助器覆盖 `signup_create` 与 `login` 类型；既有原生 `requestSubmit()` 和 `/log-in/password` 当前密码确认回归继续通过。
- 完成协议覆盖确认创建后写入密码状态并跳过步骤 7、8、受保护状态不覆盖，以及无入口时不执行密码提交复核且保留后续密码步骤。
- 静态回归确认运行代码未加入 `/api/accounts/user/register` 直调字符串，测试账号统一使用 `.test` 虚构地址。

### 验证与发布影响

- 注册页面与工作流聚焦回归 `50/50` 通过。
- `npm test` 共 `443/443` 通过，其中 MV3 E2E 使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport。
- 本次修改的 8 个 JavaScript 文件逐一执行 `node --check`，全部通过；`npm run syntax` 通过，但当前 Git 索引为空，因此脚本报告检查 `0` 个文件。
- `npm run docs:check`、`npm run audit` 和 `npm run check` 均通过；smoke audit 检查 `150` 个运行文件，Removed Network 与 Phone/SMS 审计无残留。
- Manifest 版本、权限、账号 schema、Free 分组和远端接口均未修改。重新加载扩展后新的 Service Worker 与内容脚本才会使用该分支。

---

<a id="2026-08-08-step3-french-password-switch-label"></a>

## 法语验证码页显示密码入口但第 3 步没有点击

日期：2026-08-08

关联记录：[邮箱注册默认进入验证码页后第 3 步无法创建密码](#2026-08-08-step3-email-verification-password-switch)

### 故障现象与诊断证据

用户在法语 OpenAI 邮箱验证码页执行第 3 步，页面底部明确显示 `Continuer avec un mot de passe`，但扩展没有点击。用户截图确认该入口是可见按钮；归档不保存截图中的真实邮箱、验证码、密码、Cookie、认证 URL 参数或请求头值。

### 根因与影响范围

- 第 3 步会先按 `/create-account/password` 的 `href` 识别入口；按钮没有注册链接时才使用文本后备。
- 文本后备只覆盖中文、英文、日文和印地语，没有覆盖法语 `Continuer avec un mot de passe`，因此该可见按钮被当作入口不存在，错误保留了免密码流程。
- 已有 `/log-in/password` 排除、跨页面恢复、密码提交和完成状态处理不受影响。

### 实现与安全边界

- 注册密码入口模式新增 `Continuer avec un mot de passe`，并兼容法语“继续使用密码”和“使用密码”的常见冠词表达。
- 仍要求元素可见且可用，仍优先使用注册链接，仍明确排除 `/log-in/password`；没有新增页面权限、远程请求或未公开接口调用。
- 日志、错误和完成载荷不新增真实邮箱、密码、验证码、Cookie、认证 URL 参数或请求头内容。

### 回归覆盖

- 新增独立回归，使用截图中的精确法语文案构造无 `href` 的可见按钮，验证 `findSignupPasswordSwitchTrigger()` 返回该按钮。
- 既有多语言文本、注册链接优先级和登录密码链接排除回归继续通过。

### 验证与发布影响

- `node --check` 检查页面检测器和测试文件，全部通过。
- 页面检测聚焦回归 `16/16` 通过；`npm test` 共 `444/444` 通过，其中隔离 MV3 E2E 继续使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时 Profile 和 pipe transport。
- `npm run docs:check`、`npm run audit` 和 `npm run check` 均通过；smoke audit 检查 `150` 个运行文件。
- Manifest 版本、权限、账号 schema、Free 分组和远端接口均未修改。重新加载扩展后，新内容脚本才会识别法语按钮。

---

<a id="2026-08-08-step3-password-switch-accessible-text"></a>

## 法语密码入口仍可见但第 3 步瞬间完成

日期：2026-08-08

关联记录：[邮箱注册默认进入验证码页后第 3 步无法创建密码](#2026-08-08-step3-email-verification-password-switch)、[法语验证码页显示密码入口但第 3 步没有点击](#2026-08-08-step3-french-password-switch-label)

### 故障现象与诊断证据

用户重新加载扩展后再次执行，法语验证码页仍显示 `Continuer avec un mot de passe`，但第 3 步约几十毫秒内直接报告完成，随后进入注册验证码取码。脱敏诊断确认当前页面为 `/email-verification`、验证码输入框可见，第三步日志没有出现“检测到使用密码继续”或实际点击记录；归档不保存截图和诊断中的真实邮箱、验证码、密码、Cookie、认证 URL 参数、标签页 ID 或请求信息。

### 根因与影响范围

- 页面组件可能同时在 `textContent`、`aria-label`、`title` 或遥测属性中提供操作名称。检测器过去先把字段拼成一个字符串，再使用锚定整句正则；同一句法语出现两次后不再匹配。
- 第 3 步只在进入验证码页时扫描一次。入口稍晚渲染或仍带禁用状态时，会被立即当成“入口不存在”，从而错误保留免密码流程。
- 注册密码页跳转、原生表单提交和后台成功复核本身未执行，因此不会真正创建密码。

### 实现与安全边界

- 密码入口改为分别检查可见文字、输入值、`aria-label`、`title`、`data-dd-action-name` 和 `data-testid`，并兼容属性值中的连字符和下划线。
- 第 3 步在验证码页等待最多 5 秒重新查询可见且可用的入口。若入口已经可见但持续不可点击，抛出保留注册会话的 `SIGNUP_PASSWORD_SUBMIT_UNCERTAIN`，不再静默完成。
- 仍优先使用 `/create-account/password` 链接并排除 `/log-in/password`；没有新增页面权限、远程请求或未公开接口调用。

### 回归覆盖

- 新增重复无障碍文本回归，模拟可见文字和 `aria-label` 都为法语文案，同时提供 `data-dd-action-name=continue-with-password`，验证能够找到同一按钮。
- 新增禁用入口回归，验证默认不点击，但诊断查询可以识别可见的禁用按钮；静态回归确认第三步执行 5 秒有界等待和会话保留分支。
- 既有多语言、注册链接优先级、登录密码链接排除、跨页面恢复和原生密码表单提交回归继续通过。

### 验证与发布影响

- 页面检测和密码转换聚焦回归 `30/30` 通过；相关 JavaScript 文件 `node --check` 全部通过。
- `npm test` 共 `446/446` 通过，其中隔离 MV3 E2E 继续使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时 Profile 和 pipe transport。
- `npm run docs:check`、`npm run audit` 和 `npm run check` 均通过；smoke audit 检查 `150` 个运行文件。
- Manifest 版本、权限、账号 schema、Free 分组和远端接口均未修改。必须重新加载扩展并刷新当前认证页，才能替换已注入的旧检测器实例。

---

<a id="2026-08-08-step3-password-switch-text-leaf"></a>

## 第 3 步等待后仍跳过可见的法语密码入口

日期：2026-08-08

关联记录：[法语验证码页显示密码入口但第 3 步没有点击](#2026-08-08-step3-french-password-switch-label)、[法语密码入口仍可见但第 3 步瞬间完成](#2026-08-08-step3-password-switch-accessible-text)

### 故障现象与诊断证据

用户应用逐字段识别和 5 秒等待修复后再次提交脱敏诊断。第三步从开始填写密码到内容脚本报告完成间隔约 5 秒，证明新等待逻辑已经运行；期间仍没有“检测到使用密码继续”和点击日志，页面快照继续确认 `/email-verification`、邮箱验证码输入框和提交按钮可见。由此排除旧脚本、单次扫描和按钮延迟启用，确认现有标准操作元素选择器没有包含承载法语文字的实际 DOM 节点。归档不保存真实邮箱、密码、验证码、Cookie、认证 URL 参数、标签页 ID 或取码内容。

### 根因与影响范围

- 官网组件的 `Continuer avec un mot de passe` 可能位于嵌套 `span` 或 `div` 中，点击由上层组件处理；上层不一定使用 `a`、`button`、显式 `role` 或输入按钮标签。
- 逐字段修复仍只遍历标准可点击候选，因此看得见的文字叶节点没有参加匹配，5 秒等待只会重复相同的空结果。
- 入口未定位后旧分支仍按免密码页面完成第三步，继续执行注册验证码；密码页跳转和密码表单提交没有发生。

### 实现与安全边界

- 标准候选增加 `data-dd-action-name`、`data-testid` 和 `tabindex`；标准候选未命中时，再有限扫描 `span`、`p`、`label`、`div` 的精确密码入口文本。
- 找到文字叶节点后优先通过 `closest()` 解析标准操作父级；没有标准父级时保留文字节点本身，让原生冒泡点击到达组件处理器。
- 新增页面文本提示检查。验证码页明确包含受支持的密码入口整句但仍没有可点击目标时，抛出保留会话的不确定错误，不再写入第三步完成结果。
- `/log-in/password` 排除、可见/启用检查、注册链接优先级和敏感数据边界保持不变；没有新增权限、远程请求或接口直调。

### 回归覆盖

- 新增嵌套法语文字叶节点回归：标准按钮查询返回空，后备查询返回 `span`，并验证检测器解析并返回其点击父级。
- 同一回归验证页面文本提示能够识别独立一行的法语密码入口；静态回归确认该提示会阻止第三步静默跳过。
- 既有多语言、重复无障碍字段、禁用入口、登录密码链接排除、跨页面恢复和原生密码提交测试继续通过。

### 验证与发布影响

- 页面检测和密码转换聚焦回归 `31/31` 通过；相关 JavaScript 文件 `node --check` 全部通过。
- `npm test` 共 `447/447` 通过，其中隔离 MV3 E2E 继续使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时 Profile 和 pipe transport。
- Manifest 版本、权限、账号 schema、Free 分组和远端接口均未修改。重新测试前必须重新加载扩展、刷新认证页，并重新开始已把第三步记录为完成的旧轮次。

---

<a id="2026-08-08-step3-password-switch-deep-dom"></a>

## 文字叶节点修复后第 3 步仍等待并误完成

日期：2026-08-08

关联记录：[法语密码入口仍可见但第 3 步瞬间完成](#2026-08-08-step3-password-switch-accessible-text)、[第 3 步等待后仍跳过可见的法语密码入口](#2026-08-08-step3-password-switch-text-leaf)

### 故障现象与诊断证据

用户应用嵌套文字叶节点修复后再次提交脱敏诊断。第三步仍从开始到完成间隔约 5 秒，且没有“检测到使用密码继续”、法语入口点击或进入 `/create-account/password` 的日志；停止时页面快照仍为 `/email-verification`。这证明入口等待逻辑已加载，但检测结果仍为空，随后进入了 `skippedPasswordPage` 完成分支。归档不保存真实邮箱、密码、验证码、Cookie、认证 URL 参数、标签页 ID、取码内容或请求信息。

### 根因与影响范围

- 上一版后备逻辑仍要求单个候选字段近似等于完整入口文案，并只查询主文档内有限标签。官网组件若在可见文字中插入不可见 Unicode、把入口文字与 `OU` 或页脚说明包装在同一短容器、放入开放 Shadow DOM 或同源子框架，仍可能无法命中。
- 延迟点击保存的是初次识别到的元素引用。React 在操作延迟期间重绘组件时，旧节点可能脱离文档，点击不会作用于当前页面。
- 入口识别为空且页面文本提示也被包装文本绕过时，第三步会错误报告免密码完成；后续验证码提交可以成功，但注册密码从未创建。

### 实现与安全边界

- 密码入口文本先执行 NFKC 规范化，移除零宽、方向和格式控制字符；保留精确整句匹配，并允许在不超过 220 个字符的候选容器内匹配完整密码入口短语。
- 检测器有限遍历主文档、最多 20 个开放 Shadow DOM 或可访问同源子框架，每个根最多检查 1500 个元素；优先返回明确的按钮、链接、角色控件、`onclick` 或有效 `tabindex`，也可从文字容器解析唯一可点击子元素。
- 页面级提示改为在规范化后的完整可见文本中查找受支持的密码入口短语。文字仍可见但没有可用动作时继续抛出保留会话的 `SIGNUP_PASSWORD_SUBMIT_UNCERTAIN`，不写入第三步完成状态。
- 延迟操作执行前重新调用检测器获取当前控件；只有原节点仍连接页面时才作为后备。官方页面点击、`/create-account/password` 跳转等待和原生密码表单提交链保持不变。
- 没有增加 Manifest 权限、远程请求、未公开接口调用或敏感日志字段；`/log-in/password` 仍明确排除。

### 回归覆盖

- 新增法语包装文本回归，包含不可见方向字符、`OU` 和页脚说明，验证能够识别完整短语并返回容器内唯一按钮，同时页面提示不再漏报。
- 新增开放 Shadow DOM 回归，验证主文档标准查询为空时仍能定位 Shadow Root 内的法语按钮。
- 静态回归验证延迟点击前会重新定位控件，并在组件重绘后无法恢复时产生明确错误；既有多语言、禁用入口、登录密码链接排除、跨页面恢复和密码创建状态回归继续通过。

### 验证与发布影响

- 相关 JavaScript 文件直接 `node --check` 全部通过；页面检测、密码转换和状态处理聚焦回归 `47/47` 通过。
- `npm test` 共 `449/449` 通过，其中隔离 MV3 E2E 使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时 Profile 和 pipe transport。
- `npm run syntax` 成功，但当前 Git 索引为空，因此脚本报告检查 `0` 个 JavaScript 文件；本次修改文件已由直接 `node --check` 覆盖。
- `npm run docs:check`、`npm run audit` 和 `npm run check` 均通过；smoke audit 检查 `150` 个运行文件，未发现已移除网络能力或手机短信注册残留。
- Manifest 版本、权限、账号 schema、Free 分组和远端接口均未修改。重新测试前必须重新加载扩展、刷新认证页，并重新开始上一轮已把第三步记录为完成的注册任务。

---

<a id="2026-08-08-step3-password-switch-structural-action"></a>

## 指纹浏览器中已识别密码文案但仍无法解析点击目标

日期：2026-08-08

关联记录：[第 3 步等待后仍跳过可见的法语密码入口](#2026-08-08-step3-password-switch-text-leaf)、[文字叶节点修复后第 3 步仍等待并误完成](#2026-08-08-step3-password-switch-deep-dom)

### 故障现象与诊断证据

用户在指纹 Chromium 浏览器中重新执行第 3 步。最新脱敏诊断确认当前页面仍为 `/email-verification`，页面级检查已经识别到法语密码入口短语，但 `findSignupPasswordSwitchTrigger()` 没有返回点击目标；流程现在正确抛出 `SIGNUP_PASSWORD_SUBMIT_UNCERTAIN` 并保留页面，没有再把第 3 步误记为完成。由于认证页位于独立指纹浏览器 Profile，普通 Chrome 调试会话不能直接检查该标签页。归档不保存真实邮箱、密码、验证码、Cookie、浏览器指纹、认证 URL 参数、请求 ID 或页面文字快照。

### 根因与影响范围

- 深层 DOM 修复的文字后备仍只扫描预先列出的常见文本标签。密码入口若由 `slot`、自定义元素或其它标签承载，页面级文案可以命中，但元素级候选仍为空。
- 某些组件把点击监听器放在 `display: contents` 或自身几何尺寸为零的容器上，由可见子节点实际呈现文字。通用可见性帮助器会拒绝该容器，导致已经解析到的操作仍不能返回。
- 受影响范围仅为验证码页切换到官网注册密码页的入口定位。页面跳转、注册密码原生表单提交、`/log-in/password` 排除以及后台成功复核没有改变。

### 实现与安全边界

- 文字后备在既有根节点和数量上限内改为查询 `*`，覆盖标准标签、`slot` 和自定义元素；仍限制最多 20 个可访问根、每个根 1500 个元素。
- 操作可见性先排除 `hidden`、`aria-hidden` 等隐藏祖先，再接受元素自身可见、存在可见后代，或匹配短语的可见祖先。这样可以兼容零尺寸和 `display: contents` 操作容器。
- 解析顺序保留明确链接/按钮/角色控件，随后检查可点击祖先、匹配的可点击后代和唯一可点击后代；`/log-in/password` 继续拒绝。
- 新增脱敏结构摘要，只记录根和元素数量、候选/操作标签、角色、可见/启用状态、匹配长度及 `signup-password`、`login-password`、`none` 三类链接结果。摘要不记录匹配文字、邮箱、密码、验证码、Cookie、浏览器指纹、完整 URL、认证参数或请求标识。
- 没有新增 Manifest 权限、远程请求、未公开接口调用或对指纹浏览器 Profile 的外部调试连接。

### 回归覆盖

- 新增未列出标签回归，使用 `slot` 承载法语密码入口文字并解析其点击父级。
- 新增零尺寸操作回归，验证容器自身不可见但可见后代实际呈现时仍能返回操作。
- 新增结构摘要回归，验证只输出允许的结构字段，并确认不包含测试文案、邮箱、密码或完整 URL。
- 既有注册链接优先级、多语言文字、Shadow DOM、包装文字、禁用入口、登录密码页排除、跨导航恢复和注册密码完成状态回归继续通过。

### 验证与发布影响

- 页面检测、注册转换和状态处理聚焦回归 `52/52` 通过；修改的页面检测器、内容脚本和测试文件直接 `node --check` 全部通过。
- `npm test` 共 `451/451` 通过。
- `npm run e2e` 独立通过 `1/1`；实际使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport，没有连接用户的指纹浏览器或已登录 Profile。
- `npm run docs:check`、`npm run audit` 和 `npm run check` 均通过；smoke audit 检查 `150` 个运行文件，未发现已移除网络能力或手机短信注册残留。
- `npm run syntax` 通过，但当前 Git 索引为空，因此脚本报告检查 `0` 个 JavaScript 文件；本次修改的 JavaScript 文件已由直接 `node --check` 覆盖。
- Manifest 版本、权限、账号 schema、Free 分组和远端接口均未修改。指纹浏览器各 Profile 需要分别重新加载扩展并刷新认证页，旧内容脚本实例不会自动替换。

---

<a id="2026-08-08-step3-login-password-switch-fallback"></a>

## 密码入口已定位但实际为已有账号登录路由

日期：2026-08-08

关联记录：[邮箱注册默认进入验证码页后第 3 步无法创建密码](#2026-08-08-step3-email-verification-password-switch)、[指纹浏览器中已识别密码文案但仍无法解析点击目标](#2026-08-08-step3-password-switch-structural-action)

### 故障现象与诊断证据

用户在指纹 Chromium 浏览器中应用全元素和零尺寸组件兼容后重新执行。脱敏结构摘要返回 `candidateCount: 6`，所有候选及解析后的操作均为可见、可用的链接，但 `hrefKind` 全部为 `login-password`；当前页面仍为 `/email-verification`。因此元素定位已经成功，真正阻止点击的是 `/log-in/password` 注册保护规则。第 3 步随后进入页面文字提示分支，错误报告“未能定位可点击元素”并停止整轮。归档不保存真实邮箱、密码、验证码、Cookie、浏览器指纹、完整 URL、认证参数、请求 ID 或页面文字。

### 根因与影响范围

- 官网当前验证码页可以使用“继续使用密码”文案链接到 `/log-in/password`。该路由表示已有账号密码登录方式，不是 `/create-account/password` 注册创建密码页。
- 检测器正确拒绝把登录路由作为注册密码入口，但步骤 3 没有区分“没有动作”和“动作存在但属于登录路由”，后续页面文案检查把两者合并成结构定位失败。
- 直接放开原排除会让扩展把本轮新生成密码提交到已有账号登录页，并可能把登录结果误当作创建密码，因此不能按文案直接点击。

### 实现与安全边界

- 页面检测器新增独立 `findLoginPasswordSwitchTrigger()`，仍要求匹配受支持的密码入口文案、元素实际可见且操作可用，并只返回 `/log-in/password` 分类。
- `findSignupPasswordSwitchTrigger()` 继续拒绝 `/log-in/password`，注册密码页类型判断继续只把 `/create-account/password` 和 `/signup/password` 视为 `signup_create`。
- 第 3 步确认页面仅提供登录密码入口时返回 `skippedPasswordPage=true`、`signupPasswordCreated=false`、`signupPasswordCreationAttempted=false` 和内部 `loginPasswordSwitchOnly=true`，继续官网邮箱验证码流程。
- 该分支不点击登录链接、不填写或提交本轮密码、不写入 `gptPasswordSet`，也不跳过步骤 7、8；后续仍通过已有 Security and login 设置密码流程处理。
- 没有新增 Manifest 权限、远程请求、未公开接口调用或敏感日志字段。

### 回归覆盖

- 扩展注册链接和登录密码链接同时存在的检测回归，验证注册链接保持优先，登录链接只由独立分类方法返回。
- 新增法语登录密码链接回归，验证注册入口查询返回空、登录入口分类返回对应链接。
- 静态流程回归确认登录入口分支位于页面文字不确定错误之前，并返回 `loginPasswordSwitchOnly=true`，同时保留注册密码创建状态为 false。
- 既有 `/log-in/password` 页面类型隔离、注册密码创建成功复核、步骤 7、8 状态保护和敏感信息检查继续通过。

### 验证与发布影响

- 页面检测、注册转换和状态处理聚焦回归 `53/53` 通过；修改的页面检测器、内容脚本和测试文件直接 `node --check` 全部通过。
- `npm test` 和最终 `npm run check` 均为 `452/452` 通过，其中 MV3 E2E 使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport。
- `npm run docs:check`、`npm run audit` 和 `npm run check` 均通过；smoke audit 检查 `150` 个运行文件，未发现已移除网络能力或手机短信注册残留。
- `npm run syntax` 通过，但当前 Git 索引为空，因此脚本报告检查 `0` 个 JavaScript 文件；本次修改文件已由直接 `node --check` 覆盖。
- Manifest 版本、权限、账号 schema、Free 分组和远端接口均未修改。指纹浏览器 Profile 重新加载扩展并刷新认证页后，该分支才会替换旧内容脚本。

---

<a id="2026-08-08-auto-run-superseded-session-race"></a>

## 旧自动运行结果串入新会话并触发错误恢复

日期：2026-08-08

关联记录：[免 2FA 第 10 步资格接口超时后错误回到第 7 步](#2026-08-07-no2fa-step10-eligibility-timeout-retry)、[用户停止自动运行后日志连续刷新](issue-fix-archive-2026-07.md#2026-07-26-manual-stop-log-replay)

### 故障现象与诊断证据

用户在指纹 Chromium 浏览器中重新执行注册。脱敏日志确认第 3 步已经提交注册密码并完成，随后第 5 步进入邮箱验证码页、取得验证码并开始填写。此时上一自动运行会话遗留的第 10 步资格请求先返回超时，随后又开始重试并读取到尚未登录的 Session；旧结果把节点状态改为第 10 步失败，触发认证后恢复并提前启动第 7 步，而第 5 步仍在提交验证码。同一份诊断还显示，用户停止后立即开始的新一轮中，步骤 2 曾在 ChatGPT 首页短暂报告注册入口不可用，但之后已打开认证入口、重新提交邮箱并将该节点标为完成；最近失败导出仍错误选择了这条已恢复错误。

第 7 步后来在 Security 页面等待密码入口渲染，用户约 50 秒后主动停止。现有日志没有最终超时、页面终止状态或独立失败结果，因此本记录不把该等待单独定性为缺陷。归档不保存真实邮箱、密码、验证码、Cookie、Session、访问令牌、请求标识、完整 URL 参数、标签页标识或浏览器指纹数据。

### 根因与影响范围

- 自动运行会话 ID 原先主要约束外层循环和计时计划，没有贯穿到节点执行上下文及第 10 步内部的 Session 读取、资格请求、状态持久化和完成回写。
- 节点协议只把已经进入终态的消息识别为陈旧消息；旧节点仍标记为 `running` 时，即使 `currentNodeId` 已属于新会话的其它节点，晚到的完成或失败消息仍可能被接受。
- 被替换的旧循环可能继续执行失败处理或最终清理，从而停止、广播或清空较新的自动运行会话。
- 最近失败诊断按错误级别和时间选锚点，没有排除同一节点后来明确记录“已完成”的恢复性错误。

影响范围是停止、重开或恢复自动运行时仍存在后台异步工作的场景，尤其是 Session 读取、资格接口重试和依赖完成信号的节点。正常单会话顺序执行、手动节点执行和官网注册密码表单逻辑不在本次行为变更范围内。

### 实现与安全边界

- 被新一轮替换的会话统一抛出不可重试的 `AUTO_RUN_SESSION_SUPERSEDED`；旧循环识别后静默退出，不写停止/完成汇总，也不清理新会话。
- 自动运行把 `autoRunSessionId` 传入工作流执行上下文；Background 在节点开始、异步执行返回和失败写入前复核会话，旧节点不能更新新会话状态。
- 节点协议在自动运行锁定期间要求消息节点与 `currentNodeId` 一致；来自其它 `running` 节点的晚到消息也按陈旧消息拒绝。
- 免 2FA 第 10 步在读取 Session、调用资格服务、写入状态、标记账号和发送节点完成前复核会话。旧资格结果不能落库、完成节点或触发认证链恢复。
- 最近失败诊断若发现同一 `nodeId` 后续有成功完成日志，会跳过该旧错误并继续寻找真正未恢复的失败。
- 未增加 Manifest 权限、远程接口或 OpenAI 未公开接口调用；会话 ID 仅为扩展内部运行标识。日志、错误和测试数据继续使用虚构身份并脱敏敏感字段。

### 回归覆盖

- 被替换会话返回独立错误码，旧自动运行循环不能清空、停止或覆盖新会话。
- 自动运行中其它 `running` 节点的完成/失败消息不能越过当前节点约束。
- 第 10 步在 Session 读取后发现会话已替换时，不调用资格服务、不写状态且不完成节点。
- 同一节点先报错、后完成时，最近失败诊断不再把旧错误作为最终失败。
- 既有注册密码创建、步骤 4 条件分支、免 2FA 第 10 步持久化及诊断敏感信息遮盖回归继续通过。

### 验证与发布影响

- 修改的运行文件和测试文件直接 `node --check` 全部通过。
- 会话、节点协议、免 2FA 第 10 步和失败诊断聚焦回归 `43/43` 通过。
- `npm test` 共 `457/457` 通过。
- MV3 E2E 使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport，扩展 Service Worker、Side Panel、运行时消息、诊断剪贴板和零未捕获页面错误检查均通过；未连接用户的指纹浏览器或已登录 Profile。
- `npm run syntax` 通过，但当前 Git 索引为空，因此脚本报告检查 `0` 个 JavaScript 文件；修改的 JavaScript 文件已由直接 `node --check` 覆盖。
- `npm run docs:check`、`npm run audit` 和 `npm run check` 均通过；Manifest 版本、权限、账号 schema、Free 分组和远端接口未修改。
- 指纹浏览器的每个 Profile 都需要在扩展管理页重新加载扩展，并刷新现有认证标签页后再开始新一轮；旧 Service Worker 或旧内容脚本不会自动替换。

---

<a id="2026-08-08-step3-login-password-switch-click"></a>

## 验证码页官方密码按钮被主动跳过并误报完成

日期：2026-08-08

关联记录：[密码入口已定位但实际为已有账号登录路由](#2026-08-08-step3-login-password-switch-fallback)、[邮箱注册默认进入验证码页后第 3 步无法创建密码](#2026-08-08-step3-email-verification-password-switch)

### 故障现象与诊断证据

用户在指纹 Chromium 浏览器中重新加载扩展后执行第三步。截图显示邮箱验证码页底部有清晰、可用的法语“使用密码继续”按钮；页面仍停留在 `/email-verification`。脱敏日志中第三步约五秒后直接发送“已成功完成”和节点完成消息，但期间没有“已点击官网使用密码继续”、密码页加载、密码输入或密码表单提交日志，页面也始终没有离开验证码页。用户多次单独重新执行第三步，结果均相同。

结合上一条结构诊断，该按钮的实际链接分类为 `/log-in/password`。因此这次不是元素不可见、不可点击或内容脚本未加载，而是第三步命中了旧的 `loginPasswordSwitchOnly` 分支，主动不点击该按钮并把密码页记为跳过。归档不保存截图中的真实邮箱、密码、验证码、Cookie、Session、访问令牌、完整 URL 参数、请求标识、标签页标识或浏览器指纹数据。

### 根因与影响范围

- 页面检测器为防止把已有账号登录误当作注册创建密码，正确地把 `/log-in/password` 与 `/create-account/password` 分开分类。
- 第三步把“直接打开已有账号登录页”和“邮箱验证码页明确展示的官方密码切换入口”当成同一种情况。后一种情况虽然有明确用户界面来源，仍被直接跳过。
- 跳过分支调用 `reportComplete()` 并返回 `skippedPasswordPage=true`，导致侧栏显示第三步成功，实际按钮未点击、密码未填写，用户只能看到页面原地不动。
- Background 的跳转等待只接受注册创建密码 URL，即使 Content Script 改为点击该官方按钮，也会因目标是登录密码 URL 而在 20 秒后误报切换失败。

影响验证码优先注册页面上官方密码入口使用登录密码路由的变体。直接打开的已有账号密码登录、步骤 7 当前密码确认、没有密码入口的免密码注册以及明确 `/create-account/password` 的注册页面不改变原有边界。

### 实现与安全边界

- 第三步新增统一的验证码页密码入口查询：仍优先 `/create-account/password`，没有注册链接时接受当前验证码页明确展示、文字匹配且可见可用的 `/log-in/password` 官方入口。
- 延迟点击前按原路由分类重新定位当前控件，避免 React 重绘后点击旧节点；点击仍使用现有操作延迟和页面原生事件，不构造远程请求。
- Content Script 将入口路由类型返回 Background；Background 的 20 秒跳转等待同时接受注册创建和登录密码页，并在内容脚本恢复后继续原生密码表单填写与提交。
- 只有 `passwordSwitchResumed=true` 且来源路由类型是本次验证码页官方入口时，登录密码页的提交才参与第三步密码有效性确认。提交后仍停留密码页、字段报错、账号不一致或页面结果不确定时，不写 `signupPasswordCreated`，并按现有会话保留错误停止。
- 直接进入 `/log-in/password` 的其它流程仍保持 `login` 分类，不会仅凭 URL 被记为注册密码创建；已有账号 TOTP 分支仍由正式第 4 步处理。
- 未增加 Manifest 权限、OpenAI 未公开接口、直接 `fetch` 或敏感日志字段。

### 回归覆盖

- 新增验证码页官方密码入口指向 `/log-in/password` 时，Background 接受跳转并把路由来源传给恢复后的第三步。
- 保留注册链接优先、登录链接单独分类、法语文案、开放 Shadow DOM、非标准标签和零尺寸容器的检测回归。
- 静态流程检查确认第三步不再包含 `loginPasswordSwitchOnly` 原地完成分支，同时仍禁止未公开注册接口调用和敏感身份日志。
- 第三步只有成功提交且 Background 收尾确认页面转换后才记录密码有效；TOTP、免密码注册和步骤 7 当前密码确认回归继续通过。

### 验证与发布影响

- 修改的 Content Script、Background 执行器和测试文件直接 `node --check` 全部通过。
- 密码入口检测、第三步跳转、密码创建状态及 TOTP 分支聚焦回归 `52/52` 通过。
- `npm test` 共 `458/458` 通过，其中 MV3 E2E 使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport；未连接用户的指纹浏览器或已登录 Profile。
- `npm run syntax` 通过，但当前 Git 索引为空，因此脚本报告检查 `0` 个 JavaScript 文件；修改文件已由直接 `node --check` 覆盖。
- `npm run docs:check`、`npm run audit` 和 `npm run check` 均通过；smoke audit 检查 `150` 个运行文件。
- Manifest 版本、权限、账号 schema、Free 分组和远端接口未修改。指纹浏览器 Profile 必须重新加载扩展并刷新验证码页，旧内容脚本不会自动采用新点击逻辑。

---

<a id="2026-08-08-step2-first-attempt-recovery-error-race"></a>

## 步骤 2 首次恢复成功却被提前标记失败

日期：2026-08-08

关联记录：[步骤 2 Continue 按钮慢渲染导致整轮重试](#2026-08-05-step2-continue-enter-fallback)、[旧自动运行结果串入新会话并触发错误恢复](#2026-08-08-auto-run-superseded-session-race)

### 故障现象与诊断证据

用户在指纹 Chromium 浏览器中执行自动注册时发现，步骤 2 第一次通常显示失败，重新执行第二次则可以成功。脱敏最近失败诊断显示，第一次在 `https://chatgpt.com/` 等待约 25 秒后报告“当前页面没有可用的注册入口”；紧接着 Background 已打开 `/auth/login`、识别邮箱表单、填写虚构账号对应的邮箱并提交，后续同一节点还可能记录完成。法语主页快照同时显示可见、可用的“Se connecter”和“Inscription gratuite”，但注册入口候选为空。归档不保存真实邮箱、密码、验证码、Cookie、Session、访问令牌、认证参数、标签页标识或浏览器指纹数据。

### 根因与影响范围

- 共享认证入口检测器没有覆盖法语主页的“Inscription gratuite”和“Se connecter”，因此本可直接点击的可见入口被遗漏，步骤 2 每次都进入主页探测超时后的认证页恢复分支。
- `ENSURE_SIGNUP_ENTRY_READY` 探测和后续 `EXECUTE_NODE` 邮箱提交都由 Background 负责重试与最终完成，但消息载荷没有声明 `backgroundOwnsWorkflowOutcome=true`。内容脚本在返回可恢复错误的同时抢先广播 `NODE_ERROR`，把 `submit-signup-email` 标记为失败；Background 仍继续打开认证入口并提交成功，形成同一执行中的竞争状态。
- 问题影响步骤 2 从 ChatGPT 主页进入统一认证页的首次执行和内部恢复。邮箱提交后的不确定状态保护、恢复耗尽错误、步骤 3 密码创建、邮箱池选择和其它工作流节点不改变。

### 实现与安全边界

- 共享检测器增加严格整句匹配的法语注册与登录标签，包括“Inscription gratuite”、“S'inscrire gratuitement”和“Se connecter”；仍使用完整字符串锚定，不把“查看套餐与价格”等营销文案识别为认证入口。
- Background 发出的步骤 2 主页就绪探测和邮箱提交命令统一携带 `backgroundOwnsWorkflowOutcome=true`。内容脚本仍把错误序列化返回给调用方，但不再同时广播竞争性的节点失败。
- Background 保持步骤 2 唯一最终裁决者：主页入口不可用时在同一次执行中打开 `/auth/login` 并继续；内部恢复和刷新预算耗尽后仍抛出原错误并正常停止，不吞掉真实失败。
- 未修改等待时间、Manifest 权限、远端接口、OpenAI 未公开接口、邮箱 Provider、账号 schema 或敏感日志结构。

### 回归覆盖

- 共享检测器覆盖法语“Inscription gratuite”、“S'inscrire gratuitement”和“Se connecter”，并验证法语套餐/价格文案不会误匹配。
- 步骤 2 模拟首次主页探测返回入口不可用，验证同一次执行只打开一次认证入口、只提交一次邮箱并完成到验证码页，不要求第二次人工重试。
- 步骤 2 的主页探测与每次邮箱提交消息都验证携带 Background 最终裁决标记；内容脚本编排器既有回归确认该标记禁止竞争性 `NODE_ERROR` 广播。
- 既有邮箱提交后页面未知的会话保留、Continue 不可点击的当前轮恢复和密码页观察预算测试继续通过。

### 验证与发布影响

- 修改的 Background、共享检测器和测试文件直接 `node --check` 通过；步骤 2、认证入口和编排器聚焦回归 `33/33` 通过。
- `npm run syntax` 通过；当前 Git 索引为空，因此脚本报告检查 `0` 个 JavaScript 文件，修改文件已由直接语法检查覆盖。
- `npm test` 共 `460/460` 通过，其中 MV3 E2E 使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport；未连接用户的指纹浏览器或已登录 Profile。
- Manifest 版本、权限、账号 schema、Free 分组和远端接口未修改。指纹浏览器的实际 Profile 需要在扩展管理页重新加载扩展，并刷新或重新打开认证页后再开始新一轮。

---

<a id="2026-08-08-step10-gcash-api-contract"></a>

## 第 10 步仍使用旧资格接口契约

日期：2026-08-08

关联记录：[第 10 步无试用资格后再次选择同一账号](#2026-08-03-trial-ineligible-account-reselection)、[免 2FA 第 10 步资格接口超时后错误回到第 7 步](#2026-08-07-no2fa-step10-eligibility-timeout-retry)

### 故障现象与诊断证据

用户核对资格服务文档后确认，第 10 步应向 `/api/v1/check` 提交 ChatGPT AT 和 `check_gcash_pm=true`，并用独立服务令牌执行 Bearer 授权；判定字段应为 `gcash_pm_eligible` 和 `gcash_pm_eligible_reason`。代码检查显示旧实现只发送 `{ token }`，没有 Authorization 请求头，并只识别 `token_ok`、`eligible` 和 `reason`。因此新接口即使返回明确 GCash 结论，也会被当成字段缺失；服务授权或服务端代理配置错误还可能与账号无资格混淆。诊断和测试不包含真实 AT、服务令牌、Cookie、邮箱、代理或请求标识。

### 根因与影响范围

- 第 10 步请求构造仍停留在旧资格协议，没有随服务端 GCash 检查契约升级。
- 响应归一化没有识别 snake_case 和 camelCase 的 GCash 字段，也没有区分普通无资格、服务授权失败、服务端代理缺失和临时错误。
- 设置模型没有独立保存服务 Bearer 令牌，无法同时表达 ChatGPT AT 与资格服务授权令牌这两种不同凭据。
- 问题影响完整 2FA、Passkey 和免 2FA 三条路线共同的最终资格节点，以及账号面板的手动复检；注册、取码、密码设置和安全因子步骤不在请求契约修改范围内。

### 实现与安全边界

- 第 10 步请求体改为 `{ token, check_gcash_pm: true }`，请求头增加由 `gcashEligibilityApiToken` 提供的 Bearer 授权；缺少服务令牌时在 `fetch` 前返回不可重试配置错误并保留当前登录会话。
- 响应优先识别 `gcash_pm_eligible` / `gcashPmEligible` 和对应原因字段；普通 `false` 仍写为无资格，`proxy-required`、`unauthorized` 写为配置失败，`rate-limited`、`fetch-error`、`http-error`、`server-error` 写为可重试失败。旧 `token_ok` / `eligible` 契约继续兼容。
- Side Panel 在资格 API 地址旁新增密码类型的“GCash 授权令牌”输入框，并纳入本地设置恢复、运行时同步和自动保存。安全配置导出按敏感字段规则删除所有 token 字段。
- 第 10 步标题、日志和错误提示改为 GCash 资格，内部 `trialEligibility*` 存储键及既有 UPI 错误码暂时保留，避免破坏账号 schema、恢复策略和历史数据。
- 扩展不调用 OpenAI 未公开注册接口，不新增 Manifest 权限，也不把服务令牌写入日志、错误载荷、账号结果或测试快照。资格服务的上游网络使用服务端配置的代理，不会自动继承指纹浏览器 Profile 的本地代理。

### 回归覆盖

- 新增 GCash 资格通过、普通无资格、`proxy-required` 配置失败和临时服务错误归一化测试，同时保留旧响应兼容测试。
- 新增请求契约测试，验证 URL、POST 方法、Bearer 请求头以及 `{ token, check_gcash_pm: true }` 请求体。
- 新增缺少服务令牌时零网络调用测试，以及服务令牌不进入日志、结果、本地账号数据和安全配置导出的测试。
- Smoke audit 检查 Side Panel 令牌输入框和持久化默认值；既有第 10 步可重试、无资格终止、Session 邮箱校验和三路线工作流测试继续覆盖。

### 验证与发布影响

- 修改的 `14` 个 JavaScript 文件直接 `node --check` 通过；接口、Free 服务、第 10 步和运行时消息聚焦回归 `47/47` 通过。
- `npm run syntax` 通过，但当前 Git 索引为空，因此脚本报告检查 `0` 个 JavaScript 文件；修改文件已由直接语法检查覆盖。
- `npm test` 和最终 `npm run check` 均为 `467/467` 通过，其中 MV3 E2E 使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport；未连接用户的指纹浏览器或已登录 Profile。
- `npm run docs:check`、`npm run audit` 和 `npm run check` 均通过；Smoke audit 检查 `150` 个运行文件，未发现已移除网络能力或手机短信注册残留。
- Manifest 权限、账号 schema 和 Free 分组没有变化；新增配置默认为空，升级后需在实际指纹浏览器 Profile 中重新加载扩展并填写服务令牌后再执行第 10 步。

---

<a id="2026-08-08-step10-hidden-nine-step-workflow"></a>

## 注册完成后仍显示并执行不再需要的第 10 步

日期：2026-08-08

关联记录：[十步工作流重构](#2026-08-02-workflow-v2-ten-step-refactor)、[第 10 步 GCash 接口契约适配](#2026-08-08-step10-gcash-api-contract)

### 故障现象与诊断证据

用户确认当前注册不再需要自动执行 GCash 资格检测，要求前端隐藏第 10 步，并在完成一轮后直接结束。代码检查显示完整 2FA、Passkey 和免 2FA 三条活动节点图仍分别以 `check-trial-eligibility` 或 `persist-no-2fa-free` 作为第 10 步；如果只隐藏 Side Panel 行而保留节点图，自动运行仍会继续执行资格请求。进一步检查发现，完整 2FA/Passkey 的第 9 步只记录安全因子，免 2FA 的账号保存又与旧第 10 步绑定，直接删除节点会使账号无法可靠进入 `freeAccountResults`。诊断和测试只使用虚构账号，不保存真实邮箱、密码、验证码、AT、Session、Cookie、服务令牌、代理或请求标识。

### 根因与影响范围

- 工作流定义、Side Panel 应急定义和状态迁移都把资格检测建模为固定第 10 步，注册完成条件因此依赖十节点图。
- 完整 2FA 与 Passkey 的第 9 步没有写入 Free 结果；免 2FA 的保存逻辑又先调用资格接口，导致“隐藏界面”和“停止执行”不能只通过 CSS 或删除一行定义完成。
- v2 状态中可能保留 `check-trial-eligibility`、`security-factor-not-required` 和旧第 10 步当前节点；没有版本迁移会造成升级后进度残留或继续调度旧节点。
- 问题影响三条注册路线、手动节点列表、自动运行完成判定和跨版本恢复。账号面板的单个/批量资格复检、GCash API 客户端及历史资格证据仍需保留。

### 实现与安全边界

- 工作流升级为 `workflowVersion: 3`。完整 2FA、Passkey 和免 2FA 都只暴露九个活动节点，Side Panel 主定义和应急定义均不再渲染 `check-trial-eligibility`；免 2FA 使用 `persist-no-2fa-free` 作为新的第 9 步。
- 完整 2FA 与 Passkey 第 9 步在安全因子成功后调用 `upsertRegistrationResult()`，保存显式凭据、AT/Session 和取件地址，并写入 `trialEligibilityStatus: unknown`、`GCASH_ELIGIBILITY_DISABLED` 后才完成节点。
- 免 2FA 第 9 步校验当前 Session 邮箱与本轮账号一致，直接保存 Free 账号并结束本轮，不调用资格服务。已有 TOTP 登录仍保留真实密码和 TOTP 材料，不按免 2FA 凭据覆盖。
- v1/v2 状态迁移删除旧资格节点；完整 2FA/Passkey 保留安全因子状态，免 2FA 保留旧保存状态，并把旧占位节点恢复位置映射到新的第 9 步。
- 原 `check-trial-eligibility` 执行器、旧免 2FA 资格执行路径、`POST /api/v1/check` 客户端和独立 Bearer 令牌设置继续保留，供账号面板单个/批量手动复检及兼容测试使用，但不注册到活动工作流。
- 未增加 Manifest 权限、远端接口或敏感日志。新增持久化调用只传账号结果允许的显式字段，不把运行状态、服务令牌、Cookie 或请求标识写入结果和完成载荷。

### 回归覆盖

- 三条路线均验证只有九个活动节点，原第 10 步和免 2FA 占位安全因子节点不再出现在定义、Side Panel 和进度计数中。
- 覆盖 v1/v2 迁移：旧资格当前节点被移除，已完成安全因子保持最终完成，免 2FA 旧保存节点和占位节点正确映射到新第 9 步。
- 覆盖完整 2FA、Passkey 和免 2FA 第 9 步写入 `unknown`，并验证注册执行路径不会调用 GCash 资格接口。
- 覆盖 Session 邮箱不一致、已有 TOTP 凭据缺失、旧自动运行会话结果返回和存储能力缺失时保留当前注册现场且不误报完成。
- 隔离 Chrome E2E 验证免 2FA 只显示第 9 步保存节点，切换完整 2FA 后旧路线节点消失，进度与路由状态正常重建。
- 原 GCash 请求契约、Bearer 授权、明确无资格、临时失败和缺令牌测试继续保留，证明底层复检代码没有删除。

### 验证与发布影响

- 修改的 `27` 个 JavaScript/CJS 文件直接 `node --check` 通过；工作流、三路线保存、迁移、Side Panel、自动运行、Free 服务和隔离浏览器聚焦回归 `113/113` 通过。
- `npm run syntax` 通过；当前 Git 索引为空，因此脚本报告检查 `0` 个 JavaScript 文件，修改文件已由直接语法检查覆盖。
- `npm test` 共 `469/469` 通过，其中 MV3 E2E 使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport；未连接用户的指纹浏览器或已登录 Profile。
- `npm run docs:check`、`npm run audit` 和完整 `npm run check` 均通过；Smoke Audit 检查 `150` 个运行时文件。
- Manifest 权限、Free schema、账号分组和 GCash 接口契约没有变化。升级后需在实际指纹浏览器 Profile 中重新加载扩展；旧 v2 运行态会在读取时迁移到九步节点图，新注册账号默认进入“未检测资格”，需要时从 Free 账号面板手动复检。

---

<a id="2026-08-08-github-actions-e2e-scroll-viewport"></a>

## GitHub Actions 账号弹窗滚动 E2E 受 Runner 视口影响失败

日期：2026-08-08

关联记录：[Free 账号分组弹窗滚动穿透主界面](#2026-08-05-free-account-modal-scroll)、[注册完成后仍显示并执行不再需要的第 10 步](#2026-08-08-step10-hidden-nine-step-workflow)

### 故障现象与诊断证据

`release: v3.0.0` 提交 `79c8b17` 在 GitHub Actions 的 `main` 运行 `31256643710` 和标签 `v3.0.0` 运行 `31256917636` 中显示红色失败状态。失败发生在 `npm test` 的隔离 MV3 E2E，业务与单元测试共 `468/469` 通过；唯一失败位于 `scripts/test-extension-e2e.cjs` 的账号弹窗滚动断言。Windows Runner 执行 `page.setViewport({ width: 1000, height: 500 })` 后，页面诊断仍为 `clientHeight=939`、`scrollHeight=939`，因此测试没有构造出预期的可滚动几何条件。证据不包含账号、令牌、Cookie、邮箱、代理或浏览器 Profile 数据。

### 根因与影响范围

- E2E 通过改变浏览器视口高度间接制造弹窗内容溢出，断言实际依赖 GitHub Windows Runner 和 Chrome for Testing 对视口调整的具体行为。
- Runner 中页面内部高度没有按请求缩小，账号弹窗内容刚好无需滚动，导致“弹窗应拥有纵向滚动”断言失败；这不是 Side Panel 产品样式或滚动锁失效。
- 问题只影响 CI 测试稳定性和提交状态展示，不影响扩展运行时、九步工作流、账号数据、Manifest 权限或发布包功能。

### 实现与安全边界

- E2E 打开账号弹窗后，在隔离测试页面内把 `.account-records-panel` 的 `height` 和 `maxHeight` 固定为 `260px`，并将 `scrollTop` 归零，直接建立可重复的溢出条件。
- 诊断对象增加 `viewportHeight`，后续失败时可以区分浏览器视口与弹窗自身几何尺寸。
- 原断言语义保持不变：验证 `body` 滚动锁、弹窗 `overflow-y: auto`、纵向滚动由弹窗承担，并确认滚动弹窗时页面主体位置不变。
- 修改仅存在于仓库自有的隔离浏览器测试，不接触用户安装的 Chrome、指纹浏览器、登录 Profile 或外部站点，也不修改产品 CSS 和运行时代码。

### 回归覆盖

- 直接语法检查覆盖修改后的 E2E 文件。
- 聚焦隔离浏览器 E2E 验证 MV3 Service Worker、Side Panel、账号弹窗滚动、运行时消息和诊断剪贴板流程。
- 完整门禁覆盖全部 Node 测试、隔离浏览器 E2E、文档检查和 Smoke Audit。

### 验证与发布影响

- `node --check scripts/test-extension-e2e.cjs` 通过。
- 聚焦 E2E `1/1` 通过，使用 Puppeteer 管理的 `Chrome/150.0.7871.24`、临时隔离 Profile 和 pipe transport。
- `npm run check` 通过：`297` 个 JavaScript 文件语法检查通过，测试 `469/469` 通过，隔离 MV3 E2E、文档检查和审计均通过；Smoke Audit 检查 `150` 个运行时文件。
- Manifest、扩展版本、`v3.0.0` 标签和现有 Release 资产未修改。历史失败运行保留作为发布提交的检查记录；修复通过后续 `main` 提交触发独立 CI 验证。

---

<a id="2026-08-08-step3-password-switch-http-500"></a>

## 第三步验证码页 HTTP 500 导致密码入口切换停在错误页

日期：2026-08-08

关联记录：[验证码页官方密码按钮被主动跳过并误报完成](#2026-08-08-step3-login-password-switch-click)、[邮箱注册默认进入验证码页后无法在第 3 步创建密码](#2026-08-08-step3-email-verification-password-switch)

### 故障现象与诊断证据

用户在第三步执行密码创建时，指纹浏览器标签页停留在 `auth.openai.com/email-verification`，页面显示“このページは動作していません / HTTP ERROR 500”。用户网络连接正常；该现象发生在验证码页点击官网密码入口后的认证路由切换期间。脱敏代码路径显示第三步只等待 `/create-account/password` 或 `/log-in/password`，等待超时后直接返回 `SIGNUP_PASSWORD_SUBMIT_UNCERTAIN`，没有处理仍停在验证码路由的认证 HTTP 500 页面。记录不保存邮箱、密码、验证码、Cookie、Session、指纹参数或请求标识。

### 根因与影响范围

- 官网认证服务在密码入口切换期间可能短暂返回同一路径的 HTTP 500 错误页；这不等同于本地网络不可用，也不能仅通过判断 URL 是否仍为 `/email-verification` 来区分。
- 第三步已有验证码取码和 GPT 密码重置流程的 HTTP 500 刷新逻辑，但注册密码切换执行器没有复用这一恢复边界，因此页面会停在浏览器错误页并等待最终超时。
- 问题影响验证码优先注册路线的第三步密码切换；正常验证码页、已存在账号的 `/log-in/password` 登录验证、密码提交未知状态和后续步骤不改变。

### 实现与安全边界

- 第三步在等待密码页超时后检查当前标签页：仅当主机为 `auth.openai.com`、路径为 `/email-verification` 且标题/状态呈现浏览器 HTTP 500 特征时，才执行带 `bypassCache` 的标签页刷新。
- 刷新后重新等待内容脚本并重新执行官方“使用密码继续”入口，最多自动恢复两轮；成功进入 `/create-account/password` 或 `/log-in/password` 后继续原生密码表单逻辑。
- 刷新后无法恢复内容脚本、入口消失、再次跳转未知或密码提交结果不确定时，抛出不可静默降级的 `SIGNUP_PASSWORD_SUBMIT_UNCERTAIN`，保留当前标签页、邮箱和注册会话，不写入密码已设置成功状态，不重复创建账号记录。
- 新增 `waitForTabStableComplete` 依赖仅用于等待当前标签页加载稳定；不增加 Manifest 权限、远程接口或直接 `fetch`，不修改 OpenAI 未公开注册接口调用。

### 回归覆盖

- 第三步注册密码、已有账号登录密码页、跳转失败保留会话的既有测试继续通过。
- 新增瞬时 HTTP 500 场景：首次等待未进入密码页，刷新一次，重新点击入口，再恢复密码页提交；验证只执行一次刷新且不重复最终恢复提交。
- 测试使用虚构账号和假密码，不写入任何真实认证材料。

### 验证与发布影响

- `node --check background/steps/fill-password.js`、`background/bootstrap/signup-executor-registry.js` 和 `scripts/test-signup-password-transition.cjs` 通过。
- `node --test scripts/test-signup-password-transition.cjs`：`14/14` 通过。
- 完整 `npm run check` 通过：语法检查 `297` 个 JavaScript 文件，测试 `470/470` 通过，文档检查、Smoke Audit `150` 个运行时文件、Removed Network 审计和手机号短信残留审计均通过。Manifest、版本号、账号 schema、邮箱 Provider 和既有发布标签不变。
