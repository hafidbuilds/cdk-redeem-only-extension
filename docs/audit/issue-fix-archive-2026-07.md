# 2026-07 故障与修复档案

本文件合并保存 2026 年 7 月已确认问题的原始记录。每条记录保留来源文件名、日期、证据、根因、实现、安全边界和验证结果；后续修复只能追加新记录并由索引关联。

## 目录

- [最近失败诊断锚点修复](#2026-07-25-failure-diagnostics-anchor-fix)
- [最近失败诊断剪贴板导出](#2026-07-25-failure-diagnostics-clipboard)
- [Free 分组误分类修复](#2026-07-25-free-group-classification-fix)
- [免 2FA Free 导出兼容修复](#2026-07-25-no2fa-free-export-fix)
- [原始检出目录用户改动合并](#2026-07-25-original-checkout-user-edits-merge)
- [ChatGPT modal Continue button recovery](#2026-07-26-chatgpt-modal-continue-button)
- [ChatGPT Session 主 Frame 切换恢复](#2026-07-26-chatgpt-session-frame-recovery)
- [用户停止后日志连续刷新](#2026-07-26-manual-stop-log-replay)
- [Safe settings import recovery](#2026-07-26-safe-settings-import-recovery)
- [注册密码提交后过早重试与未知结果保护](#2026-07-26-signup-password-transition-timeout)
- [步骤 4 内容脚本响应超时误重开注册](#2026-07-26-step4-content-response-timeout)
- [步骤 6 安全设置页 interactive 误判](#2026-07-26-step6-interactive-settings-readiness)
- [步骤 6 invalid_state 会话失效原地重启](#2026-07-26-step6-invalid-state-restart)
- [步骤 6 invalid_state 恢复耗尽后误重开整轮](#2026-07-26-step6-invalid-state-round-restart)
- [步骤 6 可见 Password 入口误判与诊断快照抢占](#2026-07-26-step6-visible-password-entry-detection)
- [步骤 6 Password 慢跳转误耗尽恢复并打断工作流](#2026-07-26-step6-slow-reset-navigation-reconcile)
- [第 4 步验证码输入框延迟渲染时误重开注册](#2026-07-26-step4-late-verification-input-render)
- [第 6 步 Password 行延迟渲染时连续刷新并停机](#2026-07-26-step6-late-password-entry-render)
- [步骤 3.5 已有账号 TOTP 登录](#2026-07-26-existing-account-totp-login)
- [侧边栏缺少步骤 3.5 展示行](#2026-07-26-step3-5-sidepanel-display)
- [步骤 3.5 成功前旧失败广播排除邮箱](#2026-07-26-step3-5-node-error-race)
- [步骤 3.5 成功后仍重复执行步骤 6](#2026-07-26-step3-5-skip-redundant-password)
- [步骤 3.5 日志与侧边栏运行状态不一致](#2026-07-26-step3-5-ui-status-sync)
- [无试用资格状态的统一记录恢复](#2026-07-27-ineligible-email-canonical-recovery)
- [步骤 2 密码页等待与后台响应超时竞态](#2026-07-27-step2-password-page-response-timeout)

---

<a id="2026-07-27-step2-password-page-response-timeout"></a>

## 步骤 2 密码页等待被误报为内容脚本超时并重复提交邮箱

日期：2026-07-27

关联记录：[注册密码提交后未知状态保护](#2026-07-26-signup-password-transition-timeout)、[步骤 4 内容脚本响应窗口](#2026-07-26-step4-content-response-timeout)

### 故障现象与证据

脱敏诊断生成于 `2026-07-26T23:41:11.086Z`。步骤 2 已填写邮箱并点击 Continue，约 4 秒后新认证页内容脚本报告就绪；随后先出现“等待进入密码页超时”，约 0.3 至 0.7 秒后后台又把最终错误记录为“认证页 内容脚本 20 秒内未响应”。自动运行把后一个错误当作普通可重试故障，清理 Cookie、重开页面，并在同一轮对同一邮箱继续尝试，最终两个目标轮次都达到 3 次重试上限。档案不记录真实邮箱、密码、验证码、完整 AT、Cookie、CDK 或敏感 URL 参数。

### 根因

- `content/signup-password-page.js` 的 `ensureSignupPasswordPageReady()` 最长观察页面 20 秒。
- `background/signup-flow-helpers.js` 对同一条 `ENSURE_SIGNUP_PASSWORD_PAGE_READY` 消息也只给 `sendToContentScriptResilient()` 20 秒总预算；消息层会把单次响应上限裁剪到剩余总预算。
- 内容脚本准备返回真实页面错误时，后台定时器先结束等待，真实错误因约几百毫秒的调度和消息返回开销被“内容脚本未响应”覆盖。
- 自动运行只看到了可重试的传输错误，因此执行通用整轮重试；步骤 1 随之清理 Cookie 并再次提交当前邮箱。
- 该命令没有声明由后台统一裁决工作流结果，内容脚本和后台还会各记一次失败，进一步造成日志中的双重错误。

### 修复

- 后台消息显式传入 20 秒页面观察预算，同时把单次内容脚本响应预算设为 25 秒、有限恢复总预算设为 50 秒；页面观察总能先于通信定时器结束并返回真实结果。
- 内容脚本命令转发读取并限制后台传入的观察预算，允许范围为 1 至 30 秒，避免无界等待。
- 命令增加 `backgroundOwnsWorkflowOutcome=true`，页面助手只返回结构化结果，由后台节点唯一记录最终失败，避免竞争性失败广播。
- 页面导航替换主 Frame 时继续复用现有 resilient 消息通道，在总预算内重新连接；真实页面超时不是传输错误，不会被通信层重复吞掉。
- 邮箱已经提交后若后续页面仍无法确认，步骤 2 抛出 `SIGNUP_EMAIL_SUBMIT_UNCERTAIN`，明确设置 `retryable=false` 和 `preserveSignupSession=true`。
- 自动运行把该结构化错误归入现有的现场保留停机分支：本轮立即停止，不清 Cookie、不切换邮箱、不重复提交，也不固定返回成功。

### 安全与兼容边界

- 只有内容脚本通道明确发生页面换帧、端口关闭或接收端暂不可用时才在 50 秒总预算内有限重连；内容脚本返回的真实页面错误原样进入业务层，不按网络错误循环。
- 邮箱提交前的短暂入口通信故障仍沿用既有限次恢复；保护只在 Continue 已成功、远端后续状态可能已经变化后启用。
- 未确认密码页、验证码页或资料页时不会把节点标记完成，也不会推断账号已注册、已有试用资格或 Token 无效。
- 本修复不修改账号统一模型、Provider Definition、验证码邮件基线、CDK 幂等账本、UPI/IDEAL/PIX 独立状态、存储 schema、Manifest 权限或版本号。
- 日志与诊断继续经过既有脱敏链；新增测试只使用 `.test` 虚构邮箱和无敏感参数的示例 URL。

### 修改文件

- `background/signup-flow-helpers.js`
- `background/steps/submit-signup-email.js`
- `background/auto-run/retry-policy.js`
- `background/auto-run/session-runner.js`
- `content/signup-page-orchestrator.js`
- `scripts/test-signup-email-transition.cjs`
- `scripts/test-signup-page-orchestrator.cjs`
- `scripts/test-auto-run-email-guard.cjs`
- `scripts/test-auto-run-session-runner.cjs`
- `CHANGELOG.md`
- `docs/USER_GUIDE.md`
- `docs/audit/issue-fix-index.md`

### 回归覆盖

- 内容脚本 20 秒页面观察预算小于后台 25 秒单次响应预算，并处于 50 秒有限恢复总预算内。
- 内容脚本真实的“等待进入密码页超时”能够返回，不再被“内容脚本未响应”覆盖。
- 页面观察预算从后台 payload 传递到内容脚本，并限制为最多 30 秒。
- 邮箱已提交但后续页面未知时产生结构化不可重试错误，不完成步骤 2。
- 自动运行实际停机路径只执行一次当前尝试，保持当前邮箱选中，并明确提示不会清 Cookie、切换邮箱或重新提交。
- 既有密码提交未知状态、短暂传输恢复、无试用资格和邮箱池耗尽策略继续通过。

### 验证与提交影响

- 定向回归测试：`21/21` 通过。
- 完整单元测试：`512/512` 通过。
- 语法检查：`397` 个纳入本提交的 JavaScript 文件通过。
- 隔离 Chrome for Testing E2E：`1/1` 通过；实际为 `Chrome/150.0.7871.24`、Puppeteer 固定下载浏览器、临时 Profile、pipe 传输，没有连接系统 Chrome、Edge 或用户 Profile。
- Documentation、Smoke、Removed Network、Phone/SMS 审计全部通过；自动运行会话文件保持 `1100/1100` 行，未提高任何文件大小阈值。
- Manifest 引用审计通过且 `manifest.json` 仍为 `2.2.0`、未修改权限；差异未包含真实邮箱、密码、验证码、完整 AT、API Key、Cookie、CDK、代理或敏感 URL 参数。
- 仅保留既有非阻断警告：`background.js` 超过 8000 行。
- 修复、测试和档案由同一独立本地提交交付；本次未打包、未修改版本、未创建标签或 GitHub Release。

---

<a id="2026-07-27-ineligible-email-canonical-recovery"></a>

## 无试用资格状态被覆盖后长期显示未用

日期：2026-07-27

关联记录：[邮箱池完成状态回退](#2026-07-27-custom-email-pool-status-rollback)、[无资格邮箱排除展示](#2026-07-27-ineligible-email-exclusion-display)

### 故障现象与证据

脱敏诊断明确记录同一轮第 7 步先完成 2FA 并把当前邮箱标记为已用，随后资格接口明确返回 `not-eligible`，后台记录“已在邮箱池标记无试用资格”，下一轮也已经选择另一邮箱。用户侧截图中的原邮箱后来却只显示“未用”，没有无资格徽标。真实邮箱、AT、密码、TOTP、验证码、Cookie 和敏感 URL 参数未写入档案。

### 根因

- 前一修复已经阻止新的普通 `SAVE_SETTING` 快照覆盖邮箱池完成状态，但被旧版本覆盖过的历史条目本身已经丢失 `trialEligibilityStatus`。
- 无资格账号不会进入 Free 结果表，这是正确业务规则；统一账号迁移原先又没有从邮箱池资格字段吸收生命周期结论。
- 因此邮箱池字段一旦丢失，就没有第二份结构化证据可自动回填；日志文本虽然能说明该次故障，但不能作为运行时状态恢复来源。
- 侧栏的显式状态重置意图此前没有进入实际保存载荷，人工清除与后台保护也无法完整同步到统一账号记录。

### 修复

- 明确的 `eligible`、`ineligible` 或 `failed` 资格结果通过现有账号仓库写入统一账号生命周期；网络错误不会被升级为无资格。
- 统一账号迁移吸收邮箱池已有的资格状态、原因、原因码和检查时间，为现有正确条目建立持久恢复证据。
- 侧栏加载和运行时收到 `accountRecordsV2` 更新时，按邮箱把明确 `ineligible` 回填到邮箱池并立即重绘；缺 AT 时仍保持 `used=false`，但显示“已排除”。
- 邮箱卡片新增“标记无资格”，用于修复已经丢失结构化证据的旧条目；“清除无资格”会同步清除统一账号生命周期，避免随后又被自动回填。
- 显式状态重置标记现在真实传入后台保存路由；普通自动保存仍不能清除工作流写入的资格状态。

### 安全与兼容边界

- 只有结构化明确状态或用户主动确认才能写入无资格；超时、网络失败、5xx、HTML 响应和字段缺失保持失败/未知，不会被排除。
- 无资格且缺 AT 的邮箱不会伪装为已用账号，也不会进入 Free；可用性判断仍独立排除该邮箱。
- 不从脱敏日志反推完整邮箱，不自动篡改已经丢失全部结构化证据的历史条目。
- 不修改 Manifest 权限、Provider、CDK 幂等规则、外部副作用账本或 UPI/IDEAL/PIX 独立状态。

### 修改文件

- `background.js`
- `background/account-lifecycle-service.js`
- `background/account-record-migration.js`
- `background/custom-email-pool-state.js`
- `background/router/core-routes.js`
- `background/routes/settings-routes.js`
- `sidepanel/custom-email-pool-manager.js`
- `sidepanel/custom-email-pool-membership-sync.js`
- `sidepanel/runtime-message-data-handler.js`
- `sidepanel/settings-controller.js`
- `sidepanel/sidepanel-app-controller.js`
- 对应测试、`CHANGELOG.md`、`docs/USER_GUIDE.md` 和故障索引

### 回归覆盖

- 明确无资格进入统一账号生命周期，未知/网络错误不能生成无资格结论。
- 迁移从邮箱池保留资格状态、原因、原因码和时间。
- 统一账号的无资格证据可恢复邮箱池状态，但缺 AT 时不设置 `used=true`。
- `accountRecordsV2` 单独广播也会刷新邮箱池。
- 人工标记和清除资格同步统一账号生命周期，显式重置标记不会在侧栏载荷中丢失。

### 验证与提交影响

- 定向测试：`29/29` 通过。
- 完整单元测试：`508/508` 通过。
- 语法检查：`396` 个 Git 跟踪的 JavaScript 文件通过。
- Smoke 审计通过，仅保留既有 `background.js` 超过 8000 行的非阻断警告；没有提高文件阈值。
- 隔离 Chrome for Testing E2E：`1/1` 通过，实际浏览器为 `Chrome/150.0.7871.24`、临时 Profile、pipe 传输。
- Manifest 引用随 Smoke 审计通过且 `manifest.json` 未修改；差异敏感数据扫描未发现真实邮箱、密码、验证码、完整 AT、API Key、Cookie、CDK 或代理。
- 未打包、未修改 Manifest 版本、未创建标签或 GitHub Release。

---

<a id="2026-07-27-custom-email-pool-status-rollback"></a>

## 第 7 步已通过但邮箱池卡片回显示“未用”

日期：2026-07-27

### 故障现象与证据

用户截图显示自定义邮箱池当前邮箱仍显示“未用”，但卡片已经有资格检查时间；脱敏诊断同时记录过第 7 步 2FA 成功、邮箱池已标记为已用。日志和截图中的邮箱、AT、密码、验证码、TOTP、Cookie 及敏感 URL 参数均未写入档案。

### 根因

第 7 步和资格检查通过现有后台状态模块写入完整邮箱条目。侧栏仍可能持有流程开始前的旧条目，并在延迟自动保存或运行时同步时发送 `SAVE_SETTING`；后台保存路由原先按整组替换，旧的 `used: false`、空 AT 和空资格字段可以覆盖刚写入的结果。选中邮箱也可能因此回退到已经完成的邮箱。

### 修复

- `SAVE_SETTING` 普通回写按邮箱合并当前状态，保护工作流已经写入的 `used`、`lastUsedAt`、AT 和资格字段，并按合并后的可用条目重建旧式邮箱数组。
- 当旧快照试图重新选中已用邮箱时保留后台当前选中邮箱。
- 侧栏“标记未用”和“清除资格”发送显式状态重置标记；普通导入、自动保存、运行时同步不具备该标记，仍受保护。

### 安全与兼容边界

该修复不改变“没有 AT 时不自动标记已用”的安全规则，也不把网络错误或资格未知解释为成功。人工删除、启停、导入和手动状态按钮仍通过现有邮箱池流程处理；未新增权限、服务或存储格式。

### 修改文件

- `background/routes/settings-routes.js`
- `background/custom-email-pool-state.js`
- `background.js`
- `background/message-router.js`
- `background/router/core-routes.js`
- `sidepanel/custom-email-pool-manager.js`
- `scripts/test-background-settings-routes.cjs`
- `CHANGELOG.md`
- `docs/USER_GUIDE.md`
- `docs/audit/issue-fix-index.md`

### 回归覆盖

- 普通旧侧栏快照不能回退已用、AT、资格状态或选中邮箱。
- 明确的人工“标记未用”可以重置状态。
- 既有空邮箱池保护和显式删除行为保持不变。

### 验证与提交影响

- 定向测试：`4/4` 通过。
- 完整单元测试：`502/502` 通过。
- 语法检查：`396` 个 Git 跟踪的 JavaScript 文件通过。
- `npm run check`、Documentation、Smoke、Removed Network、Phone/SMS 审计全部通过；保留既有 `background.js` 超过 8000 行的非阻断警告。
- Manifest 引用检查随 Smoke 审计通过；敏感数据扫描未发现新增真实邮箱、密码、验证码、完整 AT、API Key、Cookie、CDK 或代理。
- 隔离 Chrome for Testing MV3 E2E：`1/1` 通过，使用固定 Chrome、临时 Profile 和 pipe 传输。
- 未打包、未修改 Manifest 版本、未创建 GitHub Release。


---

<a id="2026-07-27-ineligible-email-exclusion-display"></a>

## 无试用资格邮箱显示“未用”，疑似循环选择

日期：2026-07-27

关联记录：[邮箱池完成状态回退](#2026-07-27-custom-email-pool-status-rollback)

### 故障现象与证据

用户截图中当前邮箱卡片显示“未用”，并担心此前明确无试用资格的邮箱会被自动运行反复选择。脱敏诊断显示，无资格判定发生在第 `3/5` 轮的 `c***@icloud.com`；该轮随后完成，自动运行在第 `4/5` 轮预选并提交的是另一条 `g***@icloud.com`。因此诊断没有出现同一邮箱循环，实际问题是无资格且缺 AT 时卡片仍显示“未用”，容易把“凭据未形成已用状态”和“仍可被自动选择”混为一谈。

### 根因

- 后台 `isCustomEmailPoolEntryAvailable()` 已将 `trialEligibilityStatus=ineligible` 排除，自动运行不会再次选择该条目。
- Sidepanel 标签只区分 `used`、`registrationBlocked` 和普通未用；无资格但缺 AT 的条目按安全规则保持 `used=false`，因而错误显示“未用”。
- 卡片虽然同时显示“无试用资格”和禁用的“使用此邮箱”，但“未用”标签仍造成状态含义冲突。

### 修复

- 无资格且未标记已用的邮箱显示“已排除”，不再显示“未用”。
- 保留“无试用资格”徽标、详细原因和禁用的使用按钮。
- 增加渲染回归：自动运行当前邮箱指向无资格条目时，该条目不获得当前高亮，下一条可用邮箱成为当前项。

### 安全与兼容边界

本次不把缺少 AT 的账号伪造为“已用”，不改变资格判定、Free 分组或存储格式。只有远端明确判定无试用资格的条目显示“已排除”；网络失败和资格未知仍显示可重试状态，不会被误当成无资格。

### 修改文件

- `sidepanel/custom-email-pool-manager.js`
- `scripts/test-custom-email-pool-manager.cjs`
- `CHANGELOG.md`
- `docs/USER_GUIDE.md`
- `docs/audit/issue-fix-index.md`

### 回归覆盖

- 无资格、缺 AT、`used=false` 的条目显示“已排除”，不显示“未用”。
- 无资格条目不会成为自动运行当前邮箱，下一条可用邮箱会被选中。
- 缺 AT 的普通 Free 凭据仍不显示为已用，手动跳过条目仍保持原有展示。

### 验证与提交影响

- 定向测试：`31/31` 通过。
- 完整单元测试：`503/503` 通过。
- 语法检查：`396` 个 Git 跟踪的 JavaScript 文件通过。
- Documentation、Smoke、Removed Network、Phone/SMS 审计全部通过；仅保留既有 `background.js` 超过 8000 行的非阻断警告。
- 隔离 Chrome for Testing MV3 E2E：`1/1` 通过，使用固定 Chrome、临时 Profile 和 pipe 传输。
- Manifest 引用随 Smoke 审计通过，差异没有新增真实邮箱、密码、验证码、完整 AT、API Key、Cookie、CDK 或代理。
- 未打包、未修改 Manifest 版本、未创建 GitHub Release。

---

<a id="2026-07-26-existing-account-totp-login"></a>

## 步骤 3.5 已有账号 TOTP 登录

日期：2026-07-26

### 故障样本

脱敏诊断生成于 `2026-07-26T09:23:10.543Z`。自动流程为当前邮箱提交步骤 3 密码后，页面进入 OpenAI 的 `/log-in-with-totp` 登录二次验证页：

```text
步骤 3：密码已填写并提交
步骤 3 收尾：页面仍停留在密码页，继续观察
步骤 4：注册流程进入登录 TOTP 二次验证页
当前邮箱标记为已注册并排除
本轮触发 user_already_exists，直接切换下一邮箱
```

诊断中的邮箱、密码、动态码、Token 和敏感 URL 均已脱敏。页面明确要求 TOTP，说明步骤 3 使用的密码已进入已有账号登录链路；它不是注册验证码缺失、Token 无效或网络错误。

### 根因

- 注册内容脚本能够精确识别登录 TOTP 页面，但步骤 3 收尾和步骤 4 预检查都把该状态直接转换为 `SIGNUP_USER_ALREADY_EXISTS`。
- 当前流程没有在密码提交与注册邮箱验证码之间复用已经保存的 TOTP 密钥，因此即使统一账号模型或兼容凭据备份具备完整 2FA 材料，也不会尝试登录。
- `user_already_exists` 会触发当前邮箱排除和本轮不可重试终止，导致本可继续的已有账号被切换掉。

### 修复

- 在现有步骤 3 收尾中增加条件式“步骤 3.5：已有账号 2FA 登录”，不改变七步流程编号和现有工作流存储格式。
- 只在页面明确为 TOTP 登录验证时触发；按当前邮箱优先读取统一账号模型的 `credentials.totpSecret`，并兼容旧凭据备份和会员结果中的 TOTP 字段。
- 复用项目现有 Base32/HMAC-SHA1 TOTP 生成器，不创建第二套 2FA 算法；动态码不足 8 秒时等待下一周期后再提交。
- 动态码被明确拒绝时只等待下一周期重试一次。连续拒绝或登录结果未知时抛出结构化 `SIGNUP_EXISTING_TOTP_LOGIN_FAILED`，保留当前认证页和账号。
- 登录成功后返回 `alreadyVerified + skipProfileStep`；步骤 4 按已登录状态完成，不拉取注册验证码，步骤 5 注册资料页跳过。
- 步骤 4 如果绕过步骤 3 收尾而直接检测到 TOTP 页面，会调用同一个恢复函数，不保留两套实现。
- 内容脚本将该过程的日志归入步骤 3.5，并只记录“6 位验证码内容不写入日志”，不输出动态码或 TOTP 密钥。

### 安全与兼容边界

- 当前邮箱没有本地 TOTP 密钥时不猜测、不调用未知外部接口，继续使用既有“已注册并排除”规则。
- 网络、页面通信或跳转状态未知不会固定返回成功，也不会解释成 Token 无效；失败时不清 Cookie、不换邮箱、不删除账号。
- 只允许最多两次动态码提交，避免无限刷新或重复验证。
- 不修改 Provider、验证码新邮件基线、账号删除语义、Free/Plus 判断、UPI/IDEAL/PIX 独立渠道状态或 CDK 外部副作用账本。
- 不新增 Manifest 权限、独立服务或服务器数据库；不修改 Manifest 版本号，也不生成发布包。

### 修改文件

- `background/signup-flow-helpers.js`
- `background/bootstrap/signup-executor-registry.js`
- `background/steps/fetch-signup-code.js`
- `background.js`
- `content/signup-page-orchestrator.js`
- `content/signup-page.js`
- `scripts/test-signup-existing-totp-login.cjs`
- `scripts/test-signup-executor-registry.cjs`
- `scripts/test-signup-page-orchestrator.cjs`
- `CHANGELOG.md`
- `docs/USER_GUIDE.md`
- `docs/audit/issue-fix-index.md`

### 回归覆盖

- 步骤 3 收尾检测到 TOTP 页且存在密钥时提交动态码并跳过注册验证码/资料页。
- 当前邮箱没有密钥时不提交动态码并保留旧的已注册排除行为。
- 动态码连续被拒绝时仅提交两次，返回会话保留型结构化错误。
- 步骤 4 直接检测到 TOTP 页时复用步骤 3.5 恢复函数。
- 注册执行器将同一恢复函数同时注入步骤 3 收尾和步骤 4。
- 步骤 3.5 日志不包含六位动态码。

### 验证

- 修改前相关定向测试：20/20 通过。
- 修改后新增与相关定向测试：14/14 通过。
- 完整单元测试：487/487 通过。
- 语法检查：393 个 Git 跟踪的 JavaScript 文件通过。
- 隔离 Chrome for Testing MV3 E2E：1/1 通过；实际浏览器为 `Chrome/150.0.7871.24`，临时 Profile、pipe 传输，没有连接用户 Chrome 或回退 Edge。
- Documentation、Smoke、Removed Network、Phone/SMS 审计通过；Manifest 现有 25 个唯一运行时引用保持完整。
- `content/signup-page.js` 为 6989/7000 行，没有提高文件大小阈值；仅保留既有 `background.js` 超过 8000 行的非阻断警告。
- 差异敏感数据扫描没有发现高置信真实凭据；测试只使用 `.test` 虚构邮箱和 RFC 测试用 TOTP Secret。
- 本记录与修复代码在同一未发布提交中维护；未修改 `v2.2.0` 标签或 GitHub Release。

---

<a id="2026-07-26-step6-slow-reset-navigation-reconcile"></a>

## 步骤 6 Password 慢跳转误耗尽恢复并打断工作流

日期：2026-07-26

关联记录：[步骤 6 可见 Password 入口误判与诊断快照抢占](#2026-07-26-step6-visible-password-entry-detection)

### 故障现象与脱敏证据

诊断生成于 `2026-07-26T00:45:28.858Z`。第 3 轮已经完成账号创建并进入第 6 步，Password 行被成功识别和点击，但每次点击约 20 秒后仍未观察到 URL 或页面状态变化：

```text
08:31:14 点击 Password 入口
08:31:35 判定重置状态未建立，消耗第 2/2 次局部恢复
08:32:41 再次点击 Password 入口
08:33:01 返回 RESET_ENTRY_UNAVAILABLE
08:33:02 自动运行停止
```

导出诊断时，保留的当前页面已经是 `https://auth.openai.com/email-verification`，验证码输入框可见且没有页面错误。相邻成功轮次的快照还显示：Password 在 18:23:47 点击，直到 18:24:50 才确认验证码页就绪，真实导航耗时约 63 秒。这证明入口点击有效，只是 OpenAI 跳转晚于原 20 秒观察窗口。

### 根因

- 内容脚本正确区分了 `resetEntryMissing` 和 `resetEntryClickFailed`，但后台执行器又用 `||` 把两者合并成同一个 `RESET_ENTRY_UNAVAILABLE`。
- “入口确实缺失”和“入口已经点击、导航仍在进行”因此都会立即消耗一次第 6 步局部恢复。
- 连续三次慢跳转会在页面最终进入验证码页前耗尽恢复，自动运行按既有现场保护策略停止，造成用户看到验证码页但工作流已经被打断。

### 修复

- `resetEntryMissing` 继续沿用原有受限重启，不打开无状态的新密码 URL。
- `resetEntryClickFailed` 不再立即抛出重启错误；后台在当前标签页调用既有 `PREPARE_SET_GPT_PASSWORD` 复核循环，最多继续观察 45 秒。
- 复核期间一旦确认邮箱验证码页、邮箱已验证页或新密码页，立即在同一执行尝试继续，不消耗重启次数。
- 额外复核仍超时且页面状态未知时，才转换为结构化 `RESET_ENTRY_UNAVAILABLE` 并进入最多两次的原有局部恢复。

### 安全与兼容边界

- 修复不是固定返回成功。入口点击、HTTP 成功或 URL 短暂不变都不视为密码设置完成，必须确认目标页面状态。
- 不增加无限循环；额外复核上限为 45 秒，之后仍受两次第 6 步局部恢复上限约束。
- 恢复过程中保留同一账号、标签页、Cookie 和步骤 1-5 进度；检测到账号变化仍停止。
- 未改动邮箱 Provider、验证码新邮件基线、2FA、UPI/IDEAL/PIX、Free/Plus、AT 规则或 CDK 幂等账本。
- 文档和测试不包含真实邮箱、验证码、密码、AT、Cookie、API Key、CDK 或敏感 URL 参数。

### 修改文件

- `background/steps/set-gpt-password.js`
- `scripts/test-set-gpt-password-session-expiry.cjs`
- `scripts/test-set-gpt-password-resend.cjs`
- `docs/USER_GUIDE.md`
- `docs/DEVELOPMENT.md`
- `docs/audit/issue-fix-index.md`

### 回归覆盖

- Password 点击后首次观察超时、随后目标页就绪时，同一执行尝试继续且只调用一次重置入口。
- Password 入口确实缺失时仍受限重启，不打开无状态的新密码页。
- `invalid_state`、会话耗尽、账号一致性和整轮停止保护继续生效。
- 静态契约确认 `resetEntryMissing` 与 `resetEntryClickFailed` 分支处理，并复用 45 秒导航复核上限。

### 验证

- 定向测试：18/18 通过。
- 完整测试：475/475 通过，其中隔离 Chrome for Testing 的 MV3 加载与真实 DOM E2E 1/1 通过。
- 语法检查：392 个 tracked JavaScript 文件通过。
- Documentation、Smoke、Removed Network、Phone/SMS 审计全部通过；仅保留既有 `background.js` 超过 8000 行的非阻断警告。
- Manifest 和运行时注入清单未变化；修复复用现有 Background 执行器和内容脚本消息。
- 未生成发布 ZIP，未修改 Manifest 版本号。

---

<a id="2026-07-26-step3-5-sidepanel-display"></a>

## 侧边栏缺少步骤 3.5 展示行

日期：2026-07-26

### 故障样本

用户截图显示侧边栏流程列表只有步骤 1 至 7，没有步骤 3 和步骤 4 之间的“已有账号 2FA 登录”。后台已经具备条件式 TOTP 登录逻辑，但用户无法从页面确认该分支存在。

### 根因

- 侧边栏流程列表直接渲染可执行工作流节点。
- 步骤 3.5 是步骤 3 收尾期间的条件恢复分支，不是独立的后台节点，因此不会自然出现在七个真实节点列表中。
- 若机械加入真实节点，会改变自动运行链、节点状态和进度统计，导致未实现的独立执行入口。

### 修复

- 在 `sidepanel/workflow-state-view.js` 中为注册流程在 `fill-password` 和 `fetch-signup-code` 之间插入 UI-only 展示行：`3.5 已有账号 2FA 登录`。
- 展示行标记为“按需”、禁用按钮并保留 `display-only` 属性，不参与节点状态、进度计数、手动执行或跳过操作。
- 在侧边栏事件处理和手动跳过初始化中增加 display-only 防护，避免用户误触发不存在的后台节点。
- 增加展示行样式，保持现有流程列表布局；若未来定义模块已经提供该展示节点则不重复插入。

### 安全与兼容边界

- 后台仍保持七个真实可执行节点和原有自动运行链，不改变步骤 3.5 的触发条件与 TOTP 安全边界。
- 不新增 Manifest 权限、网络接口、存储字段或独立服务。
- 展示行不暴露邮箱、密码、TOTP 密钥、动态码、AT、Cookie 或 URL 参数。

### 修改文件

- `sidepanel/workflow-state-view.js`
- `sidepanel/sidepanel-app-controller.js`
- `sidepanel/sidepanel.css`
- `scripts/test-sidepanel-workflow-state-view.cjs`
- `scripts/test-extension-e2e.cjs`
- `CHANGELOG.md`
- `docs/USER_GUIDE.md`
- `docs/audit/issue-fix-index.md`

### 回归覆盖

- 真实步骤 3.5 展示行插入步骤 3 与步骤 4 之间，并显示 `3.5` 和“按需”。
- 展示行使用禁用按钮，不参与进度统计。
- 已有定义模块提供展示节点时不会重复渲染。
- display-only 行不会绑定手动跳过或执行节点处理。

### 验证

- 定向 UI 测试：2/2 通过。
- 完整单元测试：489/489 通过。
- 语法检查：394 个 tracked JavaScript 文件通过；隔离 Chrome for Testing MV3 E2E 通过。
- Documentation、Smoke、Removed Network、Phone/SMS 审计通过；仅保留 `background.js` 超过 8000 行的既有非阻断警告。
- 未生成发布 ZIP，未修改 Manifest 版本号或现有 `v2.2.0` Release。

---

<a id="2026-07-26-step3-5-node-error-race"></a>

## 步骤 3.5 成功前旧失败广播排除邮箱

日期：2026-07-26

### 故障样本

脱敏诊断生成于 `2026-07-26T11:29:44.012Z`。同一轮日志先显示步骤 3.5 已读取本地 TOTP 密钥，随后旧的 `SIGNUP_USER_ALREADY_EXISTS` 被记录为节点失败并排除当前邮箱；动态码实际上继续填写和提交，约 12 秒后又确认 2FA 登录成功。此时自动运行已经开始下一轮，上一轮的迟到成功导致新一轮收到停止请求。

### 根因

- 步骤 3 收尾通过 `PREPARE_SIGNUP_VERIFICATION` 等待内容脚本返回页面结果，后台收到 TOTP 页面后会进入步骤 3.5 恢复。
- 内容脚本的通用命令异常处理同时对该子请求广播 `NODE_ERROR`，而后台也在等待同一个结构化错误并决定是否恢复。
- 两个调用方同时裁决同一节点：自动运行器先消费 `NODE_ERROR` 并执行 `user_already_exists` 排除；后台恢复仍在异步提交 TOTP，最终成功变成跨轮迟到消息。

### 修复

- 为后台拥有最终裁决权的认证页请求增加 `backgroundOwnsWorkflowOutcome` 标记。
- 步骤 3 收尾的 `PREPARE_SIGNUP_VERIFICATION`、步骤 3.5 的 `GET_LOGIN_AUTH_STATE`/`FILL_CODE`、步骤 4 页面状态探测及填码前检查都携带该标记。
- 内容脚本仍将结构化错误返回给后台，但不再为这些子请求额外广播 `NODE_ERROR`；直接 `EXECUTE_NODE` 命令继续保留原有失败上报。
- 后台成为恢复流程的唯一裁决者：有密钥时等待步骤 3.5 最终成功/失败，缺少密钥时才沿用已注册排除规则。

### 安全与兼容边界

- 不吞掉直接节点执行错误，不固定返回成功，也不把网络错误解释成 Token 无效。
- TOTP 失败、结果未知和停止请求仍使用原有会话保留与有限重试规则。
- 不改变账号模型、Free/Plus 判断、UPI/IDEAL/PIX 状态、CDK 副作用账本、Manifest 权限或存储格式。
- 诊断、日志和测试不包含真实邮箱、密码、TOTP 密钥、动态码、AT、Cookie 或敏感 URL 参数。

### 修改文件

- `content/signup-page-orchestrator.js`
- `content/signup-page.js`
- `background/signup-flow-helpers.js`
- `background/steps/fetch-signup-code.js`
- `background/verification/resend-controller.js`
- `scripts/test-signup-page-orchestrator.cjs`
- `scripts/test-signup-existing-totp-login.cjs`
- `scripts/test-fetch-signup-code-prepare-timeout.cjs`
- `CHANGELOG.md`
- `docs/USER_GUIDE.md`
- `docs/audit/issue-fix-index.md`

### 回归覆盖

- 后台拥有结果的恢复请求不会触发内容脚本竞争性节点失败广播。
- 直接节点命令仍会报告错误。
- 步骤 3 收尾、步骤 3.5 状态探测/动态码提交及步骤 4 页面准备均传递所有权标记。
- 既有 TOTP 登录成功、缺少密钥、一次重试、通信中断确认和步骤 4 复用覆盖继续通过。

### 验证

- 定向测试：17/17 通过。
- 完整单元测试：490/490 通过。
- 语法检查：395 个 tracked JavaScript 文件通过；隔离 Chrome for Testing MV3 E2E 通过。
- Documentation、Smoke、Removed Network、Phone/SMS 审计通过；仅保留 `background.js` 超过 8000 行的既有非阻断警告。
- `background/verification/resend-controller.js` 保持 2000/2000 行，没有提高文件大小阈值。
- 未生成发布 ZIP，未修改 Manifest 版本号或现有 `v2.2.0` Release。

---

<a id="2026-07-26-step4-late-verification-input-render"></a>

## 第 4 步验证码输入框延迟渲染时误重开注册

日期：2026-07-26

### 故障现象与证据

脱敏诊断生成于 `2026-07-26T03:49:04.770Z`。同一注册目标连续出现三次相同时间线：

```text
步骤 2 提交邮箱后直接进入 email-verification，步骤 3 被正确跳过
步骤 4 开始确认验证码页面
约 33 秒后报告“未找到验证码输入框”
自动运行等待 60 秒，然后回到步骤 1 清理 Cookie 并重新提交同一邮箱
```

诊断导出时页面仍停留在脱敏后的 `email-verification` 路由，页面可见、提交按钮存在，并且验证码输入框探测已经返回 `detected: true`，没有验证码内容错误。这说明远端注册结果并非明确失败，输入框只是在步骤 4 的第一次等待窗口内尚未挂载。

### 根因

- `prepareSignupVerificationFlow()` 已正确识别 `snapshot.state === 'verification'`，外层为步骤 4 保留了 75 秒总观察预算。
- 进入该分支后，`waitForVerificationCodeTarget()` 使用独立的 30 秒窗口；窗口结束即抛出普通“未找到验证码输入框”错误，没有继续使用外层剩余预算。
- 后台收到普通错误后进入通用自动重开策略，等待 60 秒后回到步骤 1，清理 Cookie 并重复注册。
- 因而真实问题是验证码页 DOM 延迟挂载被过早升级为终止错误，不是邮箱、Token、验证码内容或 Provider 故障。

### 修复

- 在现有 `content/signup-verification-page.js` 增加严格的渲染等待判定：必须同时满足工作流状态为 `verification`、当前路径为 `email-verification`，并且错误明确为“未找到验证码输入框”。
- `content/signup-page.js` 捕获该精确情形后继续循环，并复用步骤 4 原有 75 秒总预算；每次输入框等待最长仍为 30 秒，不新增无界等待。
- 输入框出现后在当前页面继续取码，不返回步骤 1、不清 Cookie、不切换邮箱、不重复提交注册。
- 渲染等待提示每次步骤执行只记录一次，避免同一问题导致日志连续刷新。
- 75 秒总预算耗尽后沿用 `SIGNUP_PASSWORD_SUBMIT_UNCERTAIN`：保留当前认证页面并停止，不能固定返回成功。

### 安全与兼容边界

- 其他页面路径、其他工作流状态、HTTP 错误、验证码内容错误及任意非“未找到验证码输入框”错误不会进入该等待分支。
- 修复不延长步骤 4 的 75 秒总预算，也不提高文件尺寸审计阈值。
- 本次不修改邮箱 Provider、验证码新邮件基线、账号模型、2FA、UPI/IDEAL/PIX、会员资格、AT 或 CDK 副作用账本。
- 日志、测试和档案不包含真实邮箱、密码、验证码、完整 AT、Cookie、API Key、CDK、代理或敏感 URL 参数。

### 修改文件

- `content/signup-verification-page.js`
- `content/signup-page.js`
- `scripts/test-signup-verification-page.cjs`
- `scripts/test-fetch-signup-code-prepare-timeout.cjs`
- `docs/USER_GUIDE.md`
- `docs/DEVELOPMENT.md`
- `docs/audit/issue-fix-index.md`

### 回归覆盖

- 验证码路由和 `verification` 状态下暂未出现输入框时判为渲染中。
- 相同错误位于密码状态或其他路径时不重试。
- HTTP 等无关错误不会被吞掉。
- 主流程真实调用严格判定器，并保留明确的单次等待日志。
- 既有输入框恢复、定时停放和不重载有效验证码页行为继续通过。

### 验证

- 定向测试：`9/9` 通过。
- 完整单元测试：`478/478` 通过。
- 语法检查：`393` 个 Git 跟踪的 JavaScript 文件通过。
- 隔离 MV3 E2E：`1/1` 通过，使用 Puppeteer Chrome for Testing `150.0.7871.24`、临时 Profile 和 pipe transport；未连接用户本地 Chrome。
- Documentation、Smoke、Removed Network、Phone/SMS 审计通过；仅保留既有 `background.js` 超过 8000 行的非阻断警告。
- 受限文件保持原阈值：`content/signup-page.js` 为 `6962/7000` 行，`content/signup-verification-page.js` 为 `174/300` 行。
- Manifest 引用和运行时加载检查通过；没有新增运行时模块或孤立实现。
- `git diff --check` 通过；差异中未发现真实敏感数据。

### 提交与发布影响

本修复使用独立本地 Git 提交，不打包、不修改版本号、不推送远端。

---

<a id="2026-07-26-step4-late-input-timer-resume"></a>

## 步骤 4 验证码输入框晚挂载后终止

### 故障现象与证据

脱敏诊断生成于 `2026-07-26T05:37:48.647Z`。自动运行的 `fetch-signup-code` 节点已进入 `https://auth.openai.com/email-verification`，先记录“验证码页已打开，但输入框仍在渲染”，随后 75 秒预算耗尽并抛出 `SIGNUP_PASSWORD_SUBMIT_UNCERTAIN`，最终状态为 `failed/stopped`。

诊断导出时页面仍停在邮箱验证码路由，页面可见、没有验证码错误，而且验证码输入框已经检测到。这说明账号和注册页没有明确失败，输入框只是在旧等待窗口结束后才挂载。

### 根因与调用链

`content/signup-page.js` 的 `prepareSignupVerificationFlow()` 已能在单次 30 秒输入框等待结束后复用 75 秒总预算，但总预算耗尽时无条件生成终止型未知状态。该错误经 `background/steps/fetch-signup-code.js` 传回 `background.js` 后，会在内部恢复之前直接向上抛出；自动运行会话因此按不可重试故障停止。

旧逻辑无法区分“仍是明确邮箱验证码页，仅缺少输入框”和“路由、页面或远端注册状态未知”，也没有使用已有 MV3 Alarm 继续当前节点。

### 修复实现

- 只有最终路由仍为 `/email-verification`、页面状态仍为 `verification`，且先前输入框等待被现有分类器判为可恢复时，才抛出结构化 `SIGNUP_VERIFICATION_INPUT_RENDER_PENDING`。
- Background 在任何步骤 4 重开计数、下游失效或 `open-chatgpt` 重置之前识别该错误。
- 复用现有 `parkFetchSignupCodeRestart()` 和 MV3 Alarm，等待 15 秒后以 `mode: continue` 恢复同一轮、同一次尝试的首个未完成节点 `fetch-signup-code`。
- 倒计时日志改为“继续步骤 4”，明确保留当前页面、邮箱和注册会话，不再误写“重开注册”。
- 增加会话态计数，最多续等 3 次；步骤 4 真正完成后清零。达到上限仍无输入框时转为不可重试的未知状态并保留现场停止，避免无限等待。

### 安全与兼容边界

- 不重置 `open-chatgpt`，不清 Cookie，不关闭认证页，不换邮箱，不重新提交邮箱或密码。
- 其他 URL、验证码错误、认证错误页、通信耗尽或真实未知状态继续使用原有失败关闭策略。
- 不固定返回成功；必须真实找到验证码输入框并完成后续取码/填码，节点才会完成。
- 不修改 Provider、验证码新邮件基线、2FA、Free/Plus、UPI/IDEAL/PIX 或 CDK 逻辑。
- 不修改 Manifest、权限和版本号，不生成发布包。

### 回归与验证

- 定向测试：`24/24` 通过，覆盖精确路由分类、同节点倒计时、当前尝试保留、三次上限、未知状态停止及会话恢复。
- 完整单元测试：`481/481` 通过。
- 语法检查：`393` 个 Git 跟踪的 JavaScript 文件通过。
- 隔离 MV3 E2E：`1/1` 通过；Chrome for Testing `150.0.7871.24`、临时 Profile、pipe 传输，无系统 Chrome/Edge 回退。
- Documentation、Smoke、Removed Network、Phone/SMS 审计通过；仅保留既有 `background.js` 文件体积非阻断警告。
- `content/signup-page.js` 为 `6983/7000` 行，没有提高阈值；Manifest 版本保持 `2.1.0`。

### 提交与发布影响

本修复随当前故障修复创建独立本地 Git 提交；不打包、不推送、不发布新版本。

---

<a id="2026-07-26-step5-retry-rerender-refill"></a>

## 步骤 5 Try again 重建表单后未补填

### 故障现象与证据

同一份脱敏诊断还记录了步骤 5 的独立恢复缺口：资料首次提交后出现认证重试页，内容脚本点击 “Try again” 并因导航开始上报完成信号。新页面重新挂载后，后台明确检测到 `name、age` 均为空并禁止空表单提交，但随后只等待 60 秒，最终以 `profile_visible；已重提 0/3 次` 失败。通用重试又回到步骤 1 清理 Cookie。

### 根因与调用链

原页面中的 `waitForStep5SubmitOutcome()` 持有 `refillProfileFields` 闭包，可以处理同一 Document 内的 React 重渲染；但点击 “Try again” 触发 `pagehide` 后，完成信号会先交给 Background，旧 Document 和闭包随导航销毁。

`validateStep5PostCompletion()` 能识别新页面字段为空，却没有本轮生成的姓名和年龄，只能禁止提交并等待一个已经不存在的页面填写任务，因此恢复永远不会发生。

### 修复实现

- 步骤 5 完成信号携带当前轮临时 `profileDraft`，仅包含生成的姓名和年龄，供同一节点的后台复核使用。
- `validateStep5PostCompletion()` 在新页面发现资料字段为空时，把该草稿传给现有 `TRIGGER_STEP5_PROFILE_SUBMIT` 通道。
- `content/signup-profile-page.js` 的现有提交函数先调用 `refillProfileTextFields()`，重新查询并填写新 DOM；只有 `profileFieldsComplete=true` 才点击提交。
- 补填和重提共用既有最多 3 次上限；耗尽后保留真实失败，不进入无限点击。

### 安全与兼容边界

- 没有草稿、字段仍不完整或字段校验失败时继续禁止提交，不以固定成功绕过页面状态。
- 草稿只在当前完成信号和后台复核调用链中传递，不写入普通设置导出、日志或账号凭证。
- 不清 Cookie、不换邮箱、不重复步骤 1-4，也不改变姓名/年龄生成规则。
- 不影响生日模式、Provider、验证码、密码、2FA、会员资格或兑换状态。

### 回归与验证

- 新增动态单测确认空白资料表单收到草稿后先填入姓名和年龄，再且仅再提交一次。
- 静态集成检查确认完成信号携带草稿，后台空字段分支调用原有补填/提交通道。
- 定向测试纳入同批 `24/24`；完整单元测试 `481/481`、语法检查 `393` 个文件及隔离 MV3 E2E `1/1` 均通过。
- 全部审计通过，仅保留既有 `background.js` 文件体积非阻断警告；Manifest 版本保持 `2.1.0`，未生成 ZIP/CRX。

### 提交与发布影响

本修复与对应步骤 4 恢复修复同批创建本地行为提交，并保留独立故障索引；不打包、不推送、不发布新版本。

---

<a id="2026-07-26-step6-late-password-entry-render"></a>

## 第 6 步 Password 行延迟渲染时连续刷新并停机

日期：2026-07-26

关联记录：[步骤 6 可见 Password 入口误判与诊断快照抢占](#2026-07-26-step6-visible-password-entry-detection)、[步骤 6 Password 慢跳转误耗尽恢复并打断工作流](#2026-07-26-step6-slow-reset-navigation-reconcile)

### 故障现象与脱敏证据

脱敏诊断生成于 `2026-07-26T04:39:23.178Z`。第 5/33 轮已经完成注册验证码和资料填写，步骤 6 连续出现：

```text
12:30:35 打开 Security and login
12:31:00 Password 入口状态未建立，重启步骤 6（1/2）
12:32:17 再次打开 Security and login
12:32:42 Password 入口状态未建立，重启步骤 6（2/2）
12:33:59 第三次打开 Security and login
12:34:24 报告未显示 Password 入口并停止
```

停止后诊断仍显示当前页面为 `https://chatgpt.com/#settings/Security`，账号创建现场被正确保留，没有回步骤 1、清 Cookie 或更换邮箱。相邻成功轮次也显示 Security 页面加载 Password 行接近原 25 秒边界，说明设置页 DOM 渲染时间存在明显波动。

### 根因

- 内容脚本在每次步骤 6 尝试中只等待 Password 行 25 秒；入口未出现即返回 `resetEntryMissing`。
- 后台收到该结果后立即抛出 `SET_GPT_PASSWORD_RESET_ENTRY_UNAVAILABLE`，进入步骤 6 局部重启。
- 局部重启调用 `openPasswordSetupVerificationPage()`，其 `reloadIfSameUrl: true` 会刷新同一个 Security 地址，重新开始 React 页面渲染。
- 因而每次 25 秒边界到达都先刷新页面，缺少一个在已确认 Security 路由上保留当前 DOM、继续等待的恢复层。
- 既有慢跳转修复只处理“Password 已点击但尚未进入 OpenAI 验证码页”，没有覆盖“Security 已打开但 Password 行尚未挂载”。

### 修复

- 内容脚本的 Password 行等待支持受限参数，默认仍为 25 秒，最大不超过 60 秒。
- 后台只在返回 URL 精确属于 ChatGPT `#settings/Security` 且结果为 `resetEntryMissing` 时，保留当前标签页并发起一次 45 秒同页复核。
- 同页复核期间不调用 `reuseOrCreateTab`、不触发 `reloadIfSameUrl`，避免重置当前 React 渲染进度。
- Password 行出现后继续使用现有精确定位器点击，并继续验证 OpenAI 验证码页或新密码页状态。
- 同页 45 秒复核仍失败时，才进入既有最多两次的步骤 6 局部重启；恢复耗尽后继续保留现场停止。

### 安全与兼容边界

- 非 ChatGPT 主机、不是 `#settings/Security` 的 URL、明确会话失效、Password 已点击后的慢跳转和其他错误不会进入本分支。
- 修复没有扩大 Password 文本匹配或可点击元素范围，不会误点 Security keys、Passkey、2FA 或相邻设置项。
- Password 行可见、点击发生或 HTTP 成功都不代表密码设置成功；仍必须确认验证码页、新密码页或最终登录会话。
- 同页复核为一次且最长 45 秒，消息响应窗口为 75 秒，不新增无限循环。
- 本次不修改邮箱 Provider、验证码新邮件基线、账号模型、2FA、UPI/IDEAL/PIX、Free/Plus、AT 或 CDK 副作用账本。

### 修改文件

- `content/signup-page.js`
- `background/steps/set-gpt-password.js`
- `scripts/test-set-gpt-password-session-expiry.cjs`
- `scripts/test-set-gpt-password-resend.cjs`
- `docs/USER_GUIDE.md`
- `docs/DEVELOPMENT.md`
- `docs/audit/issue-fix-index.md`

### 回归覆盖

- Security 路由首次缺少 Password 行时，同一标签页二次等待后完成密码设置。
- 同页复核不重新打开或刷新标签页，并沿用相同账号。
- 延长等待参数由 Background 真实传入 Content Script，且有 60 秒上限。
- 非 Security 路由的入口缺失继续使用既有步骤 6 重启。
- `invalid_state`、Password 已点击慢跳转、账号一致性、无状态新密码页禁止和整轮停止保护继续通过。

### 验证

- 定向测试：`22/22` 通过。
- 完整单元测试：`479/479` 通过。
- 语法检查：`393` 个 Git 跟踪的 JavaScript 文件通过。
- 隔离 MV3 E2E：`1/1` 通过，使用 Puppeteer Chrome for Testing `150.0.7871.24`、临时 Profile 和 pipe transport，未连接用户本地 Chrome。
- Documentation、Smoke、Removed Network、Phone/SMS 审计通过；仅保留既有 `background.js` 超过 8000 行的非阻断警告。
- `content/signup-page.js` 为 `6966/7000` 行，没有提高尺寸阈值。
- Manifest 引用和运行时加载检查通过；没有新增运行时模块或孤立实现。
- `git diff --check` 通过；变更文件敏感扫描仅命中 `.test` 账号夹具中的显式虚构密码，未发现真实邮箱、密码、验证码、完整 AT、Cookie、API Key、CDK、代理或敏感 URL 参数。

### 提交与发布影响

本修复使用独立本地 Git 提交，不打包、不修改版本号、不推送远端。

---

<a id="2026-07-26-step6-visible-password-entry-detection"></a>

## 步骤 6 可见 Password 入口误判与诊断快照抢占

日期：2026-07-26

### 故障现象与脱敏证据

用户停止时的截图显示浏览器位于 `https://chatgpt.com/#settings/Security`，Security and login 弹窗已经打开，`Password / Add / 箭头` 设置行清楚可见。第 6 步却在两次局部恢复后返回 `SET_GPT_PASSWORD_RESET_ENTRY_UNAVAILABLE` 并安全停止。账号、Cookie、页面和步骤 1-5 的完成状态均被保留，没有切换邮箱重新注册。

同次诊断的真实当前错误发生在第 6 步，但停止流程随后追加了一个更早轮次的“快照”错误。旧诊断选择器只按日志数组位置从后查找 `error`，因此把位置更晚的历史快照误当成最近主故障。

### 根因

- Password 定位器只扫描 `button/a/role/tabindex/div/li`，没有扫描新版布局中的 `span/p/section` 文本叶子。
- 点击解析只检查当前元素及其后代，不会从 Password 叶子向上寻找对应的设置行或可点击祖先。
- 较大的父容器同时包含下一行 `Security keys & passkeys` 时，会被拒绝词 `passkey` 整体排除，即使其中的 Password 行真实可见。
- 失败诊断没有区分当前运行直接错误和停止时回放的历史 `快照` 错误。

### 实现

- 在已有 `content/signup-session-page.js` 中集中实现设置项定位，主注册脚本保留薄调用，未新建重复页面系统。
- 扫描范围扩展到 `span/p/section`；优先读取元素自身文本和可访问属性，精确找到 Password 叶子。
- 从叶子向上查找原生可点击祖先或紧凑的 Password 设置行；普通 React 行没有按钮角色时允许通过叶子点击向祖先冒泡。
- 遇到同时包含 passkey 等相邻安全项的大父容器时停止向上扩张，避免选错 Security keys & passkeys 行。
- 诊断选择器先查找当前直接错误；只有完全没有直接错误时，才回退到以“快照”或 `snapshot` 开头的历史错误。

### 安全与兼容边界

- 修复没有延长等待时间，也没有将 Password 可见、点击发生或 HTTP 成功直接解释为密码设置成功。
- 点击后仍必须通过 URL、验证码页或页面状态变化确认；结果未知时沿用有限次数的第 6 步恢复并保留认证现场。
- 历史快照仍保留在错误前后 100 条日志窗口中，只是不再覆盖当前主故障；没有直接错误时仍可作为诊断锚点。
- 未改动邮箱 Provider、验证码新邮件基线、2FA、UPI/IDEAL/PIX 状态、Free/Plus 分类、AT 失效规则或 CDK 幂等账本。
- 档案和日志不包含真实邮箱、密码、验证码、AT、Cookie、CDK、API Key 或敏感 URL 参数。

### 修改文件

- `content/signup-session-page.js`
- `content/signup-page.js`
- `sidepanel/failure-diagnostics.js`
- `scripts/test-signup-session-page.cjs`
- `scripts/test-sidepanel-failure-diagnostics.cjs`
- `scripts/test-set-gpt-password-resend.cjs`
- `scripts/test-extension-e2e.cjs`
- `docs/USER_GUIDE.md`
- `docs/DEVELOPMENT.md`
- `docs/audit/issue-fix-index.md`

### 回归覆盖

- Password 是普通 `span`，父级点击行为由 React 普通容器承载。
- 隔离 Chrome for Testing 的真实 DOM 点击会冒泡到普通 Password 行。
- Password 父面板同时包含 Security keys & passkeys 时仍选择正确行。
- Security keys & passkeys 行永远不作为 Password 操作入口。
- 当前第 6 步错误之后追加旧快照错误时，诊断仍锚定当前错误。
- 没有当前直接错误时，历史快照仍可作为诊断兜底。
- 既有 `invalid_state`、同账号受限重启、无状态新密码页禁止和验证码重发规则继续通过。

### 验证

- 定向测试：19/19 通过。
- 完整测试：474/474 通过，其中隔离 Chrome for Testing 的 MV3 Service Worker/Sidepanel 加载测试 1/1 通过。
- 语法检查：391 个 tracked JavaScript 文件通过。
- Documentation、Smoke、Removed Network、Phone/SMS 审计全部通过；仅保留既有 `background.js` 超过 8000 行的非阻断警告。
- 受限文件未提高阈值：`content/signup-page.js` 6941/7000 行、`content/signup-session-page.js` 219/220 行、`sidepanel/failure-diagnostics.js` 225/260 行。
- Manifest 和 Background 注入仍复用既有 `content/signup-session-page.js` 引用，没有新增孤立运行时模块。
- 隔离 Chrome E2E 证明扩展可真实加载，但未访问用户账号或在线 ChatGPT 安全设置页；新版 DOM 行为由脱敏截图证据和本地 DOM 回归夹具覆盖。
- 未生成发布 ZIP，未修改 Manifest 版本号。

---

<a id="2026-07-25-failure-diagnostics-anchor-fix"></a>

<!-- archived-from: docs/audit/2026-07-25-failure-diagnostics-anchor-fix.md -->

## 最近失败诊断锚点修复

日期：2026-07-25

### 问题

真实诊断中，较早位置存在 `error` 级别的认证页内容脚本未响应错误，后续流程重试成功。导出器却把后面的普通 `info` 日志“等待完成信号（超时 150 秒）”识别成最近失败，因为旧规则只要正文包含“超时”就会命中。

这会导致失败锚点、日志窗口和导出时页面状态被错误关联，也会让已成功完成的资料步骤看起来像发生了超时。

### 修复

- 第一轮从后向前查找 `error`、`failed`、`failure` 级别，保证真实失败级别优先于任何后续普通信息。
- 只有完全没有失败级别时，才使用明确的失败或超时结果文本兜底。
- “超时 150 秒”一类等待配置说明不再视为失败；“等待进入密码页超时。”一类明确结果仍可作为兜底锚点。
- 诊断脱敏新增姓名字段规则，“已生成姓名”和“姓名已填写”后的值输出为 `[NAME_REDACTED]`。

### 真实诊断回放

使用用户提供的 schemaVersion 1 诊断重新运行选择器：

- 修复前：错误选择后续 `info` 级别的 150 秒等待配置。
- 修复后：选择 `18:11:33` 的 `error` 级别，即第 2 次尝试中认证页内容脚本未响应。
- 后续成功日志不会覆盖真实失败锚点，但仍保留在失败后的日志窗口中。

回放只输出时间、级别和脱敏错误摘要，没有复制账号、验证码或 Token。

### 验证

- 定向测试：9/9 通过。
- 完整单元测试：427/427 通过。
- E2E：1/1 通过。
- 语法检查：383 个 tracked JavaScript 文件通过。
- 审计：Smoke、Removed Network、Phone/SMS 均通过；仅保留既有 `background.js` 15264 行警告。
- 本阶段未生成发布 ZIP。

---

<a id="2026-07-25-failure-diagnostics-clipboard"></a>

<!-- archived-from: docs/audit/2026-07-25-failure-diagnostics-clipboard.md -->

## 最近失败诊断剪贴板导出

日期：2026-07-25

### 实现

- 顶部“配置”菜单新增“导出最近一次失败诊断”。
- 点击后读取当前持久化日志，定位最近一条错误或失败消息，并保留其前后各 100 条日志。
- 读取活动标签页 URL，并通过现有 `GET_LOGIN_AUTH_STATE` 内容脚本消息获取认证页面和验证码输入框状态。
- 内容脚本不可用时仍导出日志、工作流状态、当前 URL 和脱敏后的探测错误。
- 诊断以 schemaVersion 1 的 JSON 直接写入剪贴板，不创建本地文件；成功后提示“已导出至剪贴板”。

### 安全边界

- 诊断只选择必要的日志、工作流和页面布尔状态，不序列化完整 Background State 或 DOM。
- 日志和页面错误再次脱敏验证码、密码、AT/JWT、Bearer Token、Cookie、2FA、API Key、CDK、长 Token 和完整邮箱。
- URL 查询参数值全部替换为 `[REDACTED]`，包含敏感参数的 Hash 不保留原值。
- 功能复用现有用户点击触发的 Clipboard API，没有新增 Manifest 权限。

### 验证

- 定向测试：7/7 通过，覆盖 201 条日志窗口、敏感信息脱敏、剪贴板内容和成功提示。
- 完整单元测试：419/419 通过。
- E2E：1/1 通过；真实点击菜单按钮、截获剪贴板 JSON、解析 schema 并验证成功 Toast。
- 语法检查：382 个 tracked JavaScript 文件通过。
- 审计：Smoke、Removed Network、Phone/SMS 均通过；仅保留既有 `background.js` 15243 行体积警告。
- Manifest：34 个引用，0 个缺失。
- CodeGraph：384 个文件、6899 个节点、26827 条边，索引 up to date。
- 本阶段不生成发布 ZIP。

---

<a id="2026-07-25-free-group-classification-fix"></a>

<!-- archived-from: docs/audit/2026-07-25-free-group-classification-fix.md -->

## Free 分组误分类修复

日期：2026-07-25

### 问题

导入 `multipage-settings-20260724-155641.json` 后，侧栏把邮箱池和运行历史中尚未完成会员检测的账号也显示为 Free，导致明确 Free 账号为 24 个时界面显示 95 个。

根因有两处：统一账号兼容投影把 `membershipStatus: unknown` 默认映射为 Free；侧栏展示模型又会为只有凭据、没有明确检测结果的账号构造 Free 兜底结果。

### 修复

- 统一账号只在会员状态明确为 `free` 时投影 Free；明确的旧 `failed` 结果继续投影为失败，`unknown` 和 `expired` 不进入会员分组。
- 侧栏只展示状态明确为 `free`、`paid` 或 `failed` 的会员结果。仅存在于凭据备份或邮箱池的账号继续保留在统一账号模型中，但不会被误归类。
- 新增迁移兼容和侧栏展示回归测试，覆盖 100 条邮箱池、20 条额外历史账号和 24 条明确 Free 结果。

### 真实配置验证

验证只输出聚合数量，没有输出邮箱、密码、Token 或其他敏感字段：

| 项目 | 数量 |
| --- | ---: |
| 邮箱池条目 | 100 |
| 统一账号 | 120 |
| 原始明确 Free | 24 |
| 兼容投影条目 | 24 |
| 侧栏 Free 行 | 24 |
| Free 中缺少 AT | 0 |

### 门禁

- `npm test`: 415/415 通过。
- `npm run syntax`: 380 个 tracked JavaScript 文件通过。
- `npm run audit`: 通过；仅保留既有 `background.js` 15243 行体积警告。
- `npm run e2e`: 1/1 通过。
- Manifest 引用检查：0 个缺失。
- 敏感数据扫描：未发现真实密钥、JWT 或被跟踪的运行时数据文件。
- CodeGraph：同步后 up to date。

本修复未重新生成发布 ZIP；已有 ZIP 不包含本次修复。

---

<a id="2026-07-25-no2fa-free-export-fix"></a>

<!-- archived-from: docs/audit/2026-07-25-no2fa-free-export-fix.md -->

## 免 2FA Free 导出兼容修复

日期：2026-07-25

### 问题

用户配置的安全导出摘要显示 49 个明确 Free 账号，但 Free TXT 只有 1 个完整 2FA 账号。TXT 经检查确实只有 1 个非空行，不是换行或下载截断问题。

根因是 Sidepanel 的 Free 分组已使用统一账号读模型，而后台 TXT 导出仍只读取旧会员结果存储。统一账号凭据和兼容投影还没有正式保留 `no2faFreeRoute`，导出器又要求该标记、AT，并在“取件地址：开”时要求取件地址，因此只存在于统一账号模型的免 2FA Free 账号被跳过。

### 修复

- 统一账号凭据正式保留 `no2faFreeRoute`，旧来源中的明确标记和 `no2faFreeRecordedAt` 可幂等迁移。
- 兼容投影保留免 2FA 标记；对旧 V2 记录，如果账号明确为 Free、存在 AT，且没有密码、TOTP 或 Passkey，则在读模型中恢复免 2FA 路线。
- 会员结果归一化使用相同结构规则，使缺少历史标记但结构完整的旧免 2FA Free 记录仍可导出。
- 后台导出在旧会员结果上合并当前 `accountRecordsV2` 投影，导出数据源与 Sidepanel 显示数据源保持一致。
- 修复只改变识别和导出，不删除或清空已有密码、TOTP、Passkey、AT、取件地址或旧存储数据。
- 普通 2FA、Passkey、免 2FA，以及 UPI、IDEAL、PIX 状态继续使用现有格式和独立渠道规则。

### 回归覆盖

- 明确带免 2FA 标记的统一账号归一化和迁移。
- 旧 V2 统一账号只有 Free + AT、没有密码/TOTP/Passkey 时的兼容恢复。
- 旧会员结果中不存在账号、但统一账号模型存在该免 2FA Free 账号时的 TXT 导出。
- 后续凭据备份补齐密码和 TOTP 时不会被过早误判为免 2FA。
- 免 2FA 标记不会擦除任何已有密码或 TOTP 字段。

### 验证

- 定向测试：29/29 通过。
- 完整单元测试：431/431 通过。
- 语法检查：383 个 tracked JavaScript 文件通过。
- 审计：Smoke、Removed Network、Phone/SMS 均通过；仅保留既有 `background.js` 15264 行非阻断警告。
- 真实 MV3 E2E：1/1 通过。
- Manifest：41 个引用、25 个唯一引用、0 缺失。
- 敏感运行时文件和高置信密钥命中：0。
- 本次未生成发布 ZIP，Manifest 版本保持 2.0.0。

---

<!-- issue-index-exempt: 2026-07-25-original-checkout-user-edits-merge; reason: merge record, not a confirmed defect -->
<a id="2026-07-25-original-checkout-user-edits-merge"></a>

<!-- archived-from: docs/audit/2026-07-25-original-checkout-user-edits-merge.md -->

## 原始检出目录用户改动合并

日期：2026-07-25

### 比较范围

- 来源目录：`cdk-redeem-only-extension-main`，基于 `v1.0.14` / `cf8d9b1`，保留 19 个已修改文件和 5 个未跟踪测试文件。
- 目标目录：当前工程 `cdk-redeem-only-extension-v1.0.14-working-20260725`，比较前 `main` 工作树干净。
- 比较方式：以当前工程初始提交 `e19e095` 为共同内容基线，先构造来源目录工作树相对该基线的增量，再对当前 `HEAD` 做三方应用；没有整文件覆盖当前阶段实现。

24 个候选文件中，13 个来源改动在当前工程建立时已经存在，其中 11 个至今仍逐字节一致，另外 2 个已在当前工程后续阶段继续演进。来源目录在工程建立后又产生 11 个文件的增量。

### 已合并

- 步骤 4 验证码页等待时间扩展到 30 秒，给动态挂载的验证码输入框留出稳定时间。
- 第一次出现“未找到验证码输入框”时先等待 3 秒并重新检测，不立即刷新有效验证页；第二次仍缺失时才刷新受信任的 OpenAI 验证页。
- 步骤 5 增加资料字段完整性检测，name 或 age 不完整时禁止内容脚本和 Background 恢复逻辑提交空表单。
- 页面重渲染清空资料字段后，使用既有输入函数重新填写并再次确认字段稳定，再允许提交。
- 新增资料页回归测试，并扩展验证码输入框恢复测试。

合并文件：

- `background.js`
- `background/verification/resend-controller.js`
- `content/signup-page.js`
- `content/signup-profile-page.js`
- `scripts/test-signup-profile-page.cjs`
- `scripts/test-step4-verification-input-recovery.cjs`

### 未重复引入

来源增量还包含日志区“导出诊断”按钮、下载 JSON 和一套局部脱敏逻辑，共 5 个文件。当前工程已经通过 `sidepanel/failure-diagnostics.js` 提供“导出最近一次失败诊断”到剪贴板，覆盖前后各 100 条日志、页面检测状态和更完整的敏感信息脱敏。

为避免长期保留两套诊断入口、两套脱敏规则和“下载文件/复制剪贴板”两种冲突行为，旧诊断增量未合并。当前唯一行为仍为复制 JSON 到剪贴板，并提示“已导出至剪贴板”。

### 验证

- 定向测试：7/7 通过。
- 完整单元测试：425/425 通过。
- E2E：1/1 通过。
- 语法检查：383 个 tracked JavaScript 文件通过。
- 审计：Smoke、Removed Network、Phone/SMS 均通过；仅保留既有 `background.js` 15264 行警告。
- 文件大小门禁：`background/verification/resend-controller.js` 2000 行，`content/signup-page.js` 7000 行，均未提高阈值。
- Manifest：MV3，全部引用存在。
- 敏感检查：被跟踪的敏感运行时文件 0，高置信密钥命中 0。
- 本阶段未生成发布 ZIP，来源目录的未提交工作树未被修改。

---

<a id="2026-07-26-chatgpt-modal-continue-button"></a>

<!-- archived-from: docs/audit/2026-07-26-chatgpt-modal-continue-button.md -->

## ChatGPT modal Continue button recovery

### Problem

On the `chatgpt.com` login modal, the email field could be filled while the email Continue button was still disabled. Step 2 retained that pre-fill button state and checked it immediately, so it reported that no clickable Continue button existed even though the page enabled the button shortly afterward.

### Implementation

- The signup entry helper now re-queries the current Continue button after filling the email.
- It waits up to five seconds for the current button to become enabled, which also handles React replacing the original button node.
- Stop requests remain active during the wait.
- Existing exact action-text matching continues to exclude Google, Apple, phone, and other provider buttons.
- The main signup content script remains within its existing 7000-line audit limit; no threshold was raised.

### Verification

- Focused authentication-entry tests: 11/11 passed.
- Full Node test suite: 441/441 passed.
- Syntax checks: 384 tracked JavaScript files passed.
- Smoke, removed-network, and phone/SMS audits passed; only the existing `background.js` size warning remains.
- Manifest references: 25 checked, 0 missing.
- High-confidence tracked-source credential matches: 0.

---

<a id="2026-07-26-chatgpt-session-frame-recovery"></a>

<!-- archived-from: docs/audit/2026-07-26-chatgpt-session-frame-recovery.md -->

## ChatGPT Session 主 Frame 切换恢复

日期：2026-07-26

### 故障样本

诊断文件生成于 `2026-07-25T18:32:56.684Z`。免 2FA Free 路线中，步骤 5 已确认完成账号创建，步骤 6 随后读取 ChatGPT Session/AT 时失败：

```text
Frame with ID 0 was removed.
```

失败后旧逻辑把 Chrome 页面通信异常当成普通轮次失败，在“跳过失败”开启时开始同轮第 2 次尝试并选择另一个邮箱。诊断结束时的页面探测还出现 `Receiving end does not exist`，与主 Frame 跳转后内容脚本暂时不可用一致。

### 根因

- `readCurrentChatGptSessionForExport()` 只解析一次 ChatGPT/OpenAI 标签页。
- 它通过 `chrome.scripting.executeScript()` 在目标标签页主 Frame 中请求 `/api/auth/session`。
- 注册资料提交完成后，认证页会跳转或替换主 Frame；已经发起的脚本此时可能收到 Chrome 的 `Frame with ID 0 was removed`。
- 旧实现没有把该错误归入页面生命周期异常，也没有重新解析当前标签页。
- 上层自动运行策略把未分类错误归入通用重试，因此可能放弃已完成注册的账号并换邮箱重开整轮。

该错误不表示邮箱无试用资格、AT 无效、验证码错误或账号被停用。原故障发生在读取 AT 之前，因此当时尚未完成资格检查，也尚未写入 Free。

### 修复

- 新增 `background/session-export-reader.js`，作为现有 Session 读取流程的恢复层，没有创建第二套账号或注册实现。
- 识别主 Frame 被替换、Frame 不存在、消息接收端不存在和消息通道关闭等 Chrome 生命周期错误。
- 每次恢复都会重新查询当前 ChatGPT/OpenAI 标签页，不复用已经失效的 Frame 或旧标签页快照。
- 最多原地恢复 3 次，恢复期间记录“重新定位当前标签页”的结构化警告；成功后继续原步骤 6，不重开注册流程。
- 普通 Session HTTP 失败、未登录和缺少 accessToken 不会被误判为 Frame 切换，不执行这类恢复。
- 三次恢复仍失败时返回 `CHATGPT_SESSION_FRAME_UNAVAILABLE`，标记为可人工恢复但不可整轮自动重试。
- 自动运行收到该错误后立即停止，保留当前账号现场，明确提示保持 ChatGPT 页面打开并重新执行步骤 6；即使开启“跳过失败”，也不会换邮箱重新注册。
- 中央页面通信错误分类同步识别 Frame 被移除，供其它已有页面通信路径使用。

### 回归覆盖

- `Frame with ID 0 was removed` 和 `No frame with id` 的分类。
- 旧 Frame 失败后重新解析到新标签页并成功读取 Session/AT。
- 真正的 Session/accessToken 错误只执行一次，不进行 Frame 恢复。
- 恢复耗尽后返回结构化人工恢复错误。
- 自动运行策略在“跳过失败”开启时仍停止，不选择新邮箱。
- 既有免 2FA 无资格终止、自定义邮箱池、自动运行恢复和发布包白名单行为保持不变。

### 验证

- 定向测试：17/17 通过。
- 完整单元测试：446/446 通过。
- 语法检查：386 个 tracked JavaScript 文件通过。
- 真实 MV3 E2E：1/1 通过，本机 Edge 成功加载 Service Worker 和 Sidepanel。
- Smoke、Removed Network、Phone/SMS 三项审计通过。
- Manifest/运行时引用由发布包白名单测试覆盖，新模块存在真实 `importScripts()` 调用方。
- 仅保留既有 `background.js` 超过 8000 行的非阻断警告；没有提高审计阈值。
- 未生成发布 ZIP，未修改 Manifest 版本号。

<a id="2026-07-26-isolated-chrome-e2e-harness"></a>

## 2026-07-26：E2E 实际使用 Edge，却被记录为 Chrome 验证

### 故障现象与证据

- 旧 `scripts/test-extension-e2e.cjs` 在 Windows 上硬编码启动 Microsoft Edge。
- 开发规范要求验证 Chrome Manifest V3 扩展，但旧测试的通过结果只能证明 Edge 环境可用，不能作为 Chrome 验证证据。
- 本机正式版 Chrome 150 禁止通过旧命令行方式加载未打包扩展，无法作为稳定、可重复的自动化测试入口。

### 根因

- E2E 脚本依赖本机浏览器路径和已安装的 Playwright，而没有管理自己的 Chrome 测试运行时。
- 测试报告没有区分 Edge 与 Chrome，导致浏览器证据边界不准确。
- 本机 Profile 和调试端口会引入残留状态、并发实例及环境差异，不适合作为扩展回归测试基础。

### 修复

- 将 E2E 驱动从 `playwright` 迁移到 `puppeteer@25.3.0`，使用 Puppeteer 管理的 Chrome for Testing 150.0.7871.24。
- 每次测试创建临时 Profile，并通过 `pipe: true` 连接浏览器，避免固定调试端口和用户浏览器数据。
- 最多进行 3 次浏览器启动尝试；Windows 隔离环境使用 `--no-sandbox`，测试完成后关闭浏览器并清理临时目录。
- 禁止通过 `PUPPETEER_EXECUTABLE_PATH` 覆盖为系统浏览器，保证 CI 和本机结果都明确来自受控 Chrome for Testing。
- E2E 只打开扩展自身的 `chrome-extension://` 页面，不访问外部业务网页。
- 验证 Service Worker、Side Panel、设置/账号/任务控件、Runtime 消息、诊断剪贴板 stub 和页面错误。
- 开发文档写明隔离 Chrome E2E 规则，避免后续再次把 Edge 结果记作 Chrome 结果。

### 安全与兼容边界

- 不使用用户本地 Chrome Profile，不读取真实 Cookie、账号、密码、AT 或浏览历史。
- `--no-sandbox` 仅用于不访问外部网站、使用临时 Profile 的受控测试进程，不改变扩展生产运行参数。
- 本修复不修改账号、验证码、2FA、会员判断、Free/Plus 分组、CDK 兑换或 Provider 业务逻辑。
- 未修改 `manifest.json`、扩展版本号或发布版本信息。

### 修改文件

- `package.json`
- `package-lock.json`
- `scripts/test-extension-e2e.cjs`
- `AGENTS.md`
- `CONTRIBUTING.md`
- `docs/DEVELOPMENT.md`
- `docs/audit/issue-fix-index.md`

### 回归覆盖与验证

- `npm run e2e` 连续运行 3 次，3/3 通过；每次均为 1/1 测试通过且首次启动成功。
- 每次 E2E 后 Puppeteer Chrome 残留进程为 0。
- 完整 `npm test`：466/466 通过。
- `npm run syntax`：389 个 JavaScript 文件通过。
- `npm run audit`：通过。
- Manifest 引用和运行时加载检查通过。
- 敏感信息检查未发现真实密钥或账号数据；仅有实施基线文件名中的 `sk-` 子串假阳性。
- 仅保留既有 `background.js` 超过 8000 行的非阻断警告；未提高审计阈值。
- 未生成发布 ZIP，未提交 GitHub Release。

---

<a id="2026-07-26-manual-stop-log-replay"></a>

<!-- archived-from: docs/audit/2026-07-26-manual-stop-log-replay.md -->

## 用户停止后日志连续刷新

### 故障现象

自动运行执行过至少一轮后，用户点击“停止”，侧栏日志会连续快速增加和滚动，看起来像停止后仍在疯狂刷新。

### 诊断证据与根因

停止按钮通过 `STOP_FLOW` 调用后台 `requestStop()`，停止标记随后使 `autoRunLoop()` 进入收尾分支。收尾代码无论是用户主动停止还是流程故障停机，都会调用 `replayPreviousSuccessfulAutoRunRoundLogSnapshot()`。

快照回放最多读取上一成功轮的 120 条日志，并对每一条依次调用 `addLog()`。每次调用都会单独写入状态并广播一条 `LOG_ENTRY`，侧栏也会逐条追加和滚动。因此这是有限但密集的旧日志回放，不是停止按钮重复触发或无限循环。

### 修复实现

- `background/auto-run/session-runner.js` 在收尾时记录 `stoppedByUser`。
- 用户主动停止时不再回放上一轮成功日志快照，只写入当前停止结果。
- 流程因内部故障自行停止时仍保留原有快照回放，便于诊断失败上下文。
- 快照仍保存在既有 `autoRunRoundLogSnapshots` 存储中，没有删除历史数据，也没有新建第二套日志系统。
- `scripts/test-auto-run-session-runner.cjs` 增加真实 `autoRunLoop()` 回归场景：第一轮完成、第二轮收到用户停止，断言快照回放调用次数为 0，运行状态正常结束在第二轮。

### 安全与兼容边界

- 不改变 `requestStop()`、内容脚本 `STOP_FLOW` 广播、任务状态或账号记录行为。
- 不改变故障停机的诊断快照回放。
- 不改变 UPI、IDEAL、PIX、CDK、AT、Free/Plus 或注册流程规则。
- 不修改 Manifest 权限和版本，不生成发布包。
- 没有提高文件体积审计阈值；`session-runner.js` 保持在 1100 行限制内。

### 验证结果

- 定向测试：`6/6` 通过。
- 完整单元测试：`465/465` 通过。
- 语法检查：`389` 个 Git 跟踪的 JavaScript 文件通过。
- MV3 E2E：`1/1` 通过，扩展和 Sidepanel 成功加载。
- Smoke、Removed Network、Phone/SMS 三项审计通过；仅保留既有 `background.js` 超过 8000 行的非阻断警告。
- Manifest 引用：`41` 个引用、`25` 个唯一文件、`0` 缺失。
- 差异敏感数据扫描：`0` 个凭证形态命中。
- `git diff --check` 通过。

### 提交与发布影响

本修复使用独立本地 Git 提交，不打包、不修改版本号、不推送远端。

---

<a id="2026-07-26-safe-settings-import-recovery"></a>

<!-- archived-from: docs/audit/2026-07-26-safe-settings-import-recovery.md -->

## Safe settings import recovery

### Problem

Schema V2 safe exports retained a redacted account run history and only a membership count summary. Import treated `containsSensitiveRuntimeData: false` as a reason to ignore all runtime data, so importing a safe bundle restored settings but left account identities and membership groups empty.

### Implementation

- Safe exports now include a whitelisted membership read model containing account identity, membership status, channel, timestamps, and status metadata only.
- Passwords, 2FA material, access tokens, CDKs, cookies, private keys, and provider secrets remain excluded.
- Safe imports restore the sanitized membership read model and sanitized account run history.
- Summary-only legacy safe exports restore account history but do not fabricate membership rows from aggregate counts.
- Runtime imports synchronously refresh the canonical account read model before broadcasting the completed import state.
- The canonical migration keeps existing records authoritative during ordinary background synchronization. During an explicit settings import, membership rows present in the bundle instead restore their lifecycle state and clear stale Free/Plus deletion tombstones for those rows only.
- Explicit imported credential fields update the canonical record, including an intentionally blank token after confirmed invalidation. Password, 2FA, and other credential fields absent from the bundle remain unchanged, and accounts absent from the import are not removed.
- The configuration menu and confirmation dialogs label safe exports versus complete backups, list the data each mode can restore, and repeat the distinction before import. Update guidance now directs users to the complete backup when they need email-pool and credential recovery.
- Explicit `ineligible` results from the no-2FA registration route now carry a non-retryable account error code. Auto-run ends that round immediately and advances to the next account instead of applying the generic same-round retry policy.

### Legacy recovery

`multipage-settings-20260725-084547.json` predates the redacted membership detail format, so its `freeCount: 49` cannot identify the 49 accounts by itself. A separate recovered sensitive bundle was generated from the persisted `test2` task ledger and pre-import backup. It contains 100 email-pool entries and 49 verified Free rows; one remotely confirmed invalid access token remains cleared.

### Verification

- Focused settings transfer and migration tests cover safe export redaction, safe detail import, summary-only legacy import, and account read-model synchronization.
- Live `test2` verification after extension reload and re-import rendered 49 Free rows and loaded 100 email-pool entries. Canonical storage contained 49 matching Free records, no stale Free deletion tombstones, and 48 complete access tokens; the remaining row is shown as missing AT.
- Final verification passed 440/440 Node tests, syntax checks for 384 tracked scripts, all three audits, 25 Manifest file references with no missing files, and tracked-source credential scans. The smoke audit retains the pre-existing `background.js` size warning.

---

<a id="2026-07-26-signup-password-transition-timeout"></a>

<!-- archived-from: docs/audit/2026-07-26-signup-password-transition-timeout.md -->

## 注册密码提交后过早重试与未知结果保护

日期：2026-07-26

### 故障样本

诊断文件生成于 `2026-07-25T19:42:14.259Z`。第 13/76 轮使用一个已脱敏的 iCloud 邮箱进入密码页，步骤 3 填入 14 位自定义密码后发生以下时间线：

```text
03:41:45.529 初次密码表单提交
03:41:47.331 第 1 次重新点击 Continue
03:41:51.793 第 2 次重新点击 Continue
03:41:56.279 第 3 次重新点击 Continue
03:41:58.197 按“已尝试 3/3 轮”判定失败
03:41:58.632 安排同轮第 2 次尝试
```

旧流程在约 13 秒内连续提交四次，随后清理现场并准备重新注册。错误发生在进入验证码页之前，不是邮箱取码失败，也不能证明密码无效或远端账号创建失败。

### 根因

- `prepareSignupVerificationFlow()` 虽收到 `timeoutMs: 75000`，循环条件还绑定了三次恢复计数。
- 每轮只观察 2.5 秒；按钮恢复可点击就立即再次提交，因此三次短轮询提前耗尽并绕过 75 秒总观察时间。
- 观察轮数和远端表单重交次数混用，页面仍在处理时也会重复点击。
- 初次和恢复提交只调用模拟点击，没有优先使用表单原生 `requestSubmit()`。
- 密码错误探测缺少 `aria-errormessage`、无效输入的 `aria-describedby`、结构化错误属性和 assertive live region。
- 超时错误没有稳定错误码，自动运行策略把它归入 `retry_generic`，即使远端提交结果未知也会清 Cookie、换邮箱并重开注册。

### 修复

- 保留现有 `content/signup-password-page.js` 和 `prepareSignupVerificationFlow()` 调用链，没有新增第二套注册流程。
- 步骤 3 初次提交后先观察 10 秒；步骤 4 恢复入口先观察 8 秒。
- 密码页最多只允许一次恢复提交；发生内容脚本重连时不再重复获得提交额度。
- 一次恢复提交后继续观察到完整 75 秒上限，不再按三次短轮询提前退出。
- 初次和恢复提交统一优先调用 `form.requestSubmit(button)`，表单关联不可用时才回退到现有点击方式。
- 密码错误探测新增 ARIA 关联、`data-error-message`、错误 test id、alert 和 assertive live region；普通密码规则提示不会在输入有效时被当成错误。
- 明确密码错误会立即停止当前观察，不再补交密码表单。
- 75 秒后仍无法确认页面状态时抛出 `SIGNUP_PASSWORD_SUBMIT_UNCERTAIN`，并跨内容脚本消息保留错误码、不可重试和保留会话标记。
- 自动运行把该错误映射为 `fail_signup_password_submit_uncertain`，无论是否开启“跳过失败”都立即停止，保持当前邮箱、Cookie、标签页和认证会话。
- 停止日志明确提示保持认证页打开，并从密码或验证码步骤人工继续。

### 安全边界

密码提交后的未知结果不能解释为提交失败，也不能解释为账号创建成功。未知状态下禁止清理 Cookie、切换邮箱、重开注册或继续自动提交；只能保留现场，等待人工检查当前认证页。明确页面错误仍按真实错误处理，验证码、密码和完整 AT 不写入档案或普通日志。

### 修改文件

- `content/signup-password-page.js`
- `content/signup-page.js`
- `background/signup-flow-helpers.js`
- `background/auto-run/retry-policy.js`
- `background/auto-run/session-runner.js`
- `scripts/test-signup-password-transition.cjs`
- `scripts/test-auto-run-email-guard.cjs`
- `scripts/test-auto-run-session-runner.cjs`
- `docs/audit/issue-fix-index.md`

### 回归覆盖

- 初次提交后的 10 秒观察期内不补交。
- 观察期结束后最多只补交一次，并继续观察至总超时。
- 原生 `requestSubmit()` 与点击回退路径。
- 明确密码错误和普通密码提示的区分。
- 结构化未知结果映射到终止动作。
- 开启“跳过失败”时仍只执行一次，不选择下一个邮箱。
- 既有免 2FA、自定义邮箱池、步骤 4 验证码恢复和自动运行恢复行为。

### 验证

- 定向测试：22/22 通过。
- 完整单元测试：454/454 通过。
- 语法检查：387 个 tracked JavaScript 文件通过。
- 真实 MV3 E2E：1/1 通过，本机 Edge 成功加载 Service Worker 和 Sidepanel。
- Smoke、Removed Network、Phone/SMS 三项审计通过。
- 受限文件保持原阈值：重试策略 396/400 行、自动运行会话 1100/1100 行、注册内容脚本 6993/7000 行、密码页模块 300/350 行。
- Manifest 和运行时注入继续引用现有 `content/signup-password-page.js`；没有新增孤立运行时文件。
- 敏感数据检查未发现真实邮箱、密码、验证码、完整 AT、API Key 或 Cookie。
- 仅保留既有 `background.js` 超过 8000 行的非阻断警告；没有提高审计阈值。
- 未生成发布 ZIP，未修改 Manifest 版本号。

---

<a id="2026-07-26-step4-content-response-timeout"></a>

<!-- archived-from: docs/audit/2026-07-26-step4-content-response-timeout.md -->

## 步骤 4 内容脚本响应超时误重开注册

日期：2026-07-26

关联记录：[注册密码提交后过早重试与未知结果保护](2026-07-26-signup-password-transition-timeout.md)

### 故障样本

诊断文件生成于 `2026-07-25T21:29:31.423Z`。第 6/57 轮中，步骤 2 已提交一个脱敏的自定义邮箱，并确认页面直接进入验证码页、跳过步骤 3。随后出现以下时间线：

```text
步骤 4 开始确认验证码页面
30.2 秒后：认证页内容脚本 30 秒内未响应
自动流程沿用当前邮箱回到 open-chatgpt 重开
步骤 1 再次清理 30 个 ChatGPT / OpenAI cookies
```

同一问题连续出现。诊断导出时的页面探测结果却明确显示：

```text
path: /email-verification
state: verification_page
verificationInput.detected: true
verificationInput.pageVisible: true
```

因此该错误不是验证码输入框不存在、邮箱取码失败或账号未创建，而是后台在页面完成响应前先触发了调用端超时。

### 根因

- 步骤 4 内容脚本的页面准备流程可能持续观察密码到验证码的过渡，并等待验证码输入框真正可交互。
- 上一修复已允许内容脚本观察更长时间，但 `background/steps/fetch-signup-code.js` 仍把总等待和单次响应窗口都固定为 30 秒。
- 该调用优先选择无恢复能力的 `sendToContentScript()`；只要它耗尽完整 30 秒，后面的恢复分支已经没有剩余时间。
- 通信超时以普通错误进入 `fetch-signup-code` 内部重开逻辑，先回到 `open-chatgpt` 并清 Cookie，最多重开三次后才交给自动运行总策略。
- 页面已经进入验证码阶段时重开注册会丢失当前认证现场，并可能重复提交同一个邮箱。

### 修复

- 保留现有步骤 4 执行器和验证码流程，没有新增第二套取码或注册实现。
- `PREPARE_SIGNUP_VERIFICATION` 明确传入 75 秒页面观察窗口。
- 步骤 4 只确认验证码页，不再获得额外密码补交额度，避免通信恢复时重复提交密码表单。
- 后台响应窗口扩大到 95 秒，总恢复窗口扩大到 105 秒，为页面观察、文档稳定和消息开销留出余量。
- 步骤 4 优先使用已有 `sendToContentScriptResilient()`，页面 Frame 或内容脚本短暂切换时可重新定位并继续等待；仅在该能力未注入时回退到直接通信。
- 移除已被内容脚本内部认证重试恢复覆盖的外层 30 秒循环，避免两套恢复计数互相抢先超时。
- 恢复窗口耗尽时返回结构化 `SIGNUP_PASSWORD_SUBMIT_UNCERTAIN`，标记为不可自动重试并要求保留注册会话。
- `fetch-signup-code` 内部重开逻辑在该未知状态出现时立即向上抛出，不增加步骤 4 重开计数，不回到步骤 1，不清 Cookie。
- 自动运行沿用既有终止保护，提示保持当前认证页面打开并从密码或验证码步骤继续。
- 内容脚本返回的错误码、可重试标记和保留会话标记在步骤 4 后台调用链中继续保留。

### 安全与兼容边界

- 页面通信超时不能解释为验证码错误、密码错误、邮箱无效或 Token 无效。
- 当注册页面状态无法确认时，禁止清 Cookie、切换邮箱、重新提交注册或继续自动取码；只能保留当前标签页供人工恢复。
- 明确的登录 TOTP、用户已存在、HTTP 错误页和真实验证码缺失仍使用原有独立处理，不被本修复固定为成功。
- 邮箱 Provider、验证码新邮件基线、免 2FA Free 写入、UPI 资格检查和 CDK 状态没有改动。
- 日志和档案仅保留脱敏邮箱与计时信息，不保存验证码、密码、完整 AT、Cookie 或敏感 URL 参数。

### 修改文件

- `background/steps/fetch-signup-code.js`
- `background.js`
- `background/auto-run/session-runner.js`
- `scripts/test-fetch-signup-code-prepare-timeout.cjs`
- `scripts/test-fetch-signup-code-restart-policy.cjs`
- `docs/audit/issue-fix-index.md`

### 回归覆盖

- 步骤 4 使用可恢复通信通道，并传递 75/95/105 秒三层窗口。
- 直接通信仅作为可恢复通道缺失时的兼容回退。
- 通信恢复耗尽返回不可重试、保留会话的结构化错误。
- 未知注册过渡状态在任何步骤 4 内部重开计数之前向上抛出。
- 自动运行即使开启“跳过失败”也不选择下一个邮箱。
- 既有验证码输入框短暂缺失、页面刷新恢复、密码页过渡、自定义邮箱池和免 2FA 路线保持通过。

### 验证

- 定向测试：24/24 通过。
- 完整单元测试：457/457 通过。
- 语法检查：388 个 tracked JavaScript 文件通过。
- 真实 MV3 E2E：1/1 通过，本机 Edge 成功加载 Service Worker 和 Sidepanel。
- Smoke、Removed Network、Phone/SMS 三项审计通过。
- 受限文件保持原阈值：自动运行会话 1100/1100 行、重试策略 396/400 行、注册内容脚本 6993/7000 行、密码页模块 300/350 行。
- Manifest 和运行时注入检查通过；新增文件只有自动测试和档案，没有孤立运行时模块。
- 敏感数据检查未发现真实邮箱、密码、验证码、完整 AT、API Key、Cookie、CDK 或代理。
- 仅保留既有 `background.js` 超过 8000 行的非阻断警告；没有提高审计阈值。
- 未生成发布 ZIP，未修改 Manifest 版本号，修复使用独立本地提交。

---

<a id="2026-07-26-step6-interactive-settings-readiness"></a>

<!-- archived-from: docs/audit/2026-07-26-step6-interactive-settings-readiness.md -->

## 步骤 6 安全设置页 interactive 误判

### 故障现象

账号注册和资料提交已经完成，步骤 6 打开 `https://chatgpt.com/#settings/Security` 后，页面长期保持 `document.readyState=interactive`。插件等待 30 秒后报“ChatGPT 安全设置页长时间未完成加载”，并把错误当作普通失败，从步骤 1 开始整轮重试。

脱敏诊断同时显示：步骤 1 至 5 已完成，失败发生在 `set-gpt-password`；停止前页面仍可访问，没有验证码输入错误、账号停用或诊断采集错误。

### 根因

`startSetGptPasswordResetFlow()` 在查询密码入口前，先调用 `waitForDocumentLoadComplete()`，硬性要求安全设置页达到 `readyState=complete`。

ChatGPT 设置页是动态页面，关键控件可以在 `interactive` 状态下已经可用，而部分资源可能使 `complete` 长时间不出现。这道硬门槛会阻止后续既有的密码入口和安全导航轮询，并抛出未结构化的普通错误，最终触发整轮注册重试。

### 修复实现

- 移除安全设置页专用的 `readyState=complete` 前置硬门槛。
- 继续复用 `waitForChatGptSettingsPasswordAction(25000)`，按可见、启用的密码入口或安全设置导航判断页面是否可操作。
- 页面处于 `interactive` 且关键控件已出现时直接继续步骤 6。
- 关键控件确实未出现时返回既有 `resetEntryMissing` 结构化结果，由后台使用同一账号限次重启步骤 6。
- 恢复耗尽后仍按既有保护停止当前轮，不返回步骤 1，不清理当前账号现场，也不重新注册邮箱。

### 安全与兼容边界

- 不改变步骤 1 至 5、验证码、账号、AT、Free/Plus、UPI、IDEAL、PIX 或 CDK 行为。
- 不固定返回成功；必须找到真实可操作的密码入口，或者进入既有受限恢复。
- 不删除账号或历史数据，不修改 Manifest、版本号或权限，不生成发布包。
- `content/signup-page.js` 从 6999 行降至 6998 行，没有提高 7000 行审计阈值。

### 回归覆盖

- 新增测试确认 `startSetGptPasswordResetFlow()` 不再调用 `waitForDocumentLoadComplete()`。
- 新增测试确认该流程仍调用密码入口轮询并保留 `resetEntryMissing` 结果。
- 既有测试确认缺少入口时使用同一邮箱重启步骤 6，不打开无状态新密码 URL。
- 既有测试确认步骤 6 恢复次数受限，耗尽后停止且不重启注册轮。

### 验证结果

- 定向测试：`17/17` 通过。
- 完整单元测试：`466/466` 通过。
- 语法检查：`389` 个 Git 跟踪的 JavaScript 文件通过。
- MV3 E2E：`1/1` 通过，扩展与 Sidepanel 成功加载。
- Smoke、Removed Network、Phone/SMS 三项审计通过；仅保留既有 `background.js` 超过 8000 行的非阻断警告。
- Manifest 引用：`41` 个引用、`25` 个唯一文件、`0` 缺失。
- 差异敏感数据扫描：`0` 个凭证形态命中。
- `git diff --check` 通过。

### 提交与发布影响

本修复使用独立本地 Git 提交，不打包、不修改版本号、不推送远端。

---

<a id="2026-07-26-step6-invalid-state-restart"></a>

<!-- archived-from: docs/audit/2026-07-26-step6-invalid-state-restart.md -->

## 步骤 6 invalid_state 会话失效原地重启

日期：2026-07-26

关联记录：[ChatGPT Session 主 Frame 切换恢复](2026-07-26-chatgpt-session-frame-recovery.md)

### 故障现象

步骤 6“设置 GPT 密码”执行期间，OpenAI 认证页明确显示：

```text
Session ended
Your sign-in session is no longer valid. Please start over to continue.
error_code: invalid_state
```

侧边栏同时显示 `set-gpt-password` 节点停止。该页面说明本次密码重置认证状态已经失效，不代表注册账号失效，也不要求回到步骤 1 更换邮箱重新注册。

### 根因

- 原有第 6 步只识别带 Try again 按钮的认证超时页，没有识别 `Session ended + error_code: invalid_state` 的终止状态。
- 页面状态因此可能落入未知页面或通信恢复分支，最终停止节点。
- 密码提交后的后台确认曾把“URL 已离开 `/reset-password/new-password`”直接视为成功；若跳到 OpenAI 认证错误页，存在误报密码设置成功的风险。
- 自动运行的通用整轮重试粒度过大，不适合这个已完成注册、只需重建密码重置状态的故障。

### 修复

- 在现有认证页恢复模块中增加精确检测：必须同时出现会话结束语义和完整 `error_code: invalid_state`，单独出现任一文本都不触发。
- `signup-page.js` 将命中页面转换为 `session_expired_page`，并抛出结构化 `SET_GPT_PASSWORD_SESSION_EXPIRED` 错误。
- 在现有 `set-gpt-password` 执行器内部捕获该错误，重新打开 ChatGPT 安全设置并从第 6 步起点重建密码重置流程。
- 重启沿用当前邮箱和已保存 GPT 密码，不清 Cookie、不切换邮箱、不重置步骤 1-5，也不重新提交注册。
- 单次节点执行最多自动重启第 6 步两次；第三次仍失效时保留真实错误并停止，防止无限循环。
- OpenAI 认证域页面不再仅凭“离开新密码 URL”判定成功，必须继续读取页面状态；`session_expired_page` 会进入第 6 步恢复。

### 安全与兼容边界

- 普通 `invalid_state` 文本、其他认证错误码或没有会话结束语义的页面不会触发本恢复。
- 已明确设置成功、密码重复、验证码错误、HTTP 500、Try again 恢复和内容脚本通信恢复继续使用原有独立路径。
- 账号身份在每次重启前与最新持久状态复核；检测到邮箱变化时停止，不跨账号继续。
- 本修复不修改邮箱 Provider、验证码新邮件基线、2FA、UPI 资格、CDK 幂等账本或兑换状态。
- 日志只记录错误类型和重启次数，不输出邮箱、验证码、密码、AT、Cookie 或敏感 URL 参数。

### 修改文件

- `content/auth-page-recovery.js`
- `content/signup-page.js`
- `background/steps/set-gpt-password.js`
- `scripts/test-set-gpt-password-session-expiry.cjs`
- `docs/audit/issue-fix-index.md`

### 回归覆盖

- 只有 `Session ended`/登录会话失效语义与 `error_code: invalid_state` 同时存在时才命中。
- 同一账号首次失效后原地重启第 6 步并完成密码设置。
- 连续失效只允许两次重启，随后抛出原结构化错误。
- OpenAI 认证错误 URL 会继续探测页面状态，不会固定返回成功。
- 无关 `invalid_state` 不触发第 6 步重启。

### 验证

- 定向测试：8/8 通过。
- 完整单元测试：462/462 通过。
- 语法检查：388 个 tracked JavaScript 文件通过。
- 真实 MV3 E2E：1/1 通过，本机浏览器成功加载 Service Worker 和 Sidepanel。
- Smoke、Removed Network、Phone/SMS 三项审计通过。
- `content/signup-page.js` 为 6999/7000 行；没有提高任何体积审计阈值。
- Manifest 引用检查通过：22 个唯一引用文件均存在。
- 差异敏感数据检查未发现真实邮箱、密码、验证码、完整 AT、API Key、Cookie、CDK 或代理；自动测试只使用 `.test` 虚构账号。
- 仅保留既有 `background.js` 超过 8000 行的非阻断警告。
- 未生成发布 ZIP，未修改 Manifest 版本号。

---

<a id="2026-07-26-step6-invalid-state-round-restart"></a>

<!-- archived-from: docs/audit/2026-07-26-step6-invalid-state-round-restart.md -->

## 步骤 6 invalid_state 恢复耗尽后误重开整轮

日期：2026-07-26

关联记录：[步骤 6 invalid_state 会话失效原地重启](2026-07-26-step6-invalid-state-restart.md)

### 故障样本

诊断文件生成于 `2026-07-25T22:16:03.293Z`。第 2/53 轮使用一个脱敏 iCloud 账号完成步骤 2-5 后进入 `set-gpt-password`：

```text
点击 ChatGPT 密码入口后 6 秒未跳转
直接打开 auth.openai.com/reset-password/new-password
填写并提交 GPT 密码
Session ended / invalid_state
原地重启步骤 6（1/2）
再次直接打开 new-password 并提交，仍为 invalid_state
原地重启步骤 6（2/2）
第三次提交仍为 invalid_state
第 2/53 轮第 1 次尝试失败
自动运行开始第 2 次整轮尝试，并在步骤 1 清理 39 个 Cookie
```

这不是 Token、验证码或网络错误。步骤 5 已完成，账号已经创建；问题发生在步骤 6 的密码重置状态和恢复耗尽后的自动运行策略。

### 根因

- 密码入口点击后的观察窗口只有 6 秒，慢跳转会被过早判为点击失败。
- 入口缺失或未跳转时，后台直接打开 `/reset-password/new-password`。该地址可以显示密码表单，但没有经过邮箱验证或密码入口建立的有效重置状态，提交时 OpenAI 返回 `invalid_state`。
- 第 6 步内部两次原地恢复耗尽后，结构化错误没有进入“保留认证现场”的终止分类。
- 自动运行把它当作普通可重试失败，进入同一轮第 2 次整轮尝试，从步骤 1 清 Cookie 并重新注册。

### 修复

- 将 ChatGPT 密码入口点击后的状态观察窗口从 6 秒延长到 20 秒。
- 密码入口缺失或未跳转时返回结构化 `SET_GPT_PASSWORD_RESET_ENTRY_UNAVAILABLE`，不再直接打开无状态的 `/reset-password/new-password`。
- 该错误沿用现有第 6 步局部恢复：重新打开 ChatGPT 安全设置并保留同一账号，最多重启两次。
- `SESSION_EXPIRED` 和 `RESET_ENTRY_UNAVAILABLE` 在局部恢复耗尽后均进入现有认证现场保护分类。
- 自动运行此时直接停止并保留当前账号和步骤 1-5 进度，不再进入整轮第 2 次尝试，不清 Cookie、不切换邮箱、不重新注册。
- `/reset-password/new-password` 只保留在邮箱已经明确验证、需要进入新密码页的现有合法路径中。

### 安全与兼容边界

- 本修复不把 `invalid_state` 固定解释成成功，也不在状态未知时重复确认密码已设置。
- 第 6 步局部恢复仍有两次上限，避免无休止点击和提交。
- 密码重复、验证码错误、HTTP 500、Try again 页面及明确密码设置成功继续使用各自原有路径。
- 邮箱 Provider、验证码新邮件基线、2FA、UPI 资格、Free/Plus 分组及 CDK 幂等账本没有改动。
- 日志和档案不包含真实邮箱、密码、验证码、AT、Cookie 或敏感 URL 参数。

### 修改文件

- `content/signup-page.js`
- `background/steps/set-gpt-password.js`
- `background/auto-run/retry-policy.js`
- `background/auto-run/session-runner.js`
- `scripts/test-set-gpt-password-session-expiry.cjs`
- `scripts/test-auto-run-email-guard.cjs`
- `docs/audit/issue-fix-index.md`

### 回归覆盖

- 密码入口未建立重置状态时原地重启第 6 步。
- 局部恢复不会导航到无状态的 `/reset-password/new-password`。
- `SESSION_EXPIRED` 恢复耗尽时不可进行整轮重试。
- 终止策略不要求新标签页、不切换邮箱并保留当前认证现场。
- 既有 `invalid_state` 精确检测、同账号重启、两次上限和认证错误页防误报覆盖继续通过。

### 验证

- 定向测试：21/21 通过。
- 完整单元测试：464/464 通过。
- 语法检查：389 个 tracked JavaScript 文件通过。
- 真实 MV3 E2E：1/1 通过，本机浏览器成功加载 Service Worker 和 Sidepanel。
- Smoke、Removed Network、Phone/SMS 三项审计通过。
- 受限文件保持原阈值：注册内容脚本 6999/7000 行、重试策略 396/400 行、自动运行会话 1100/1100 行。
- Manifest 引用和运行时加载检查通过；没有新增运行时模块或孤立实现。
- 敏感数据检查仅命中 `.test` 虚构邮箱，未发现真实邮箱、密码、验证码、完整 AT、API Key、Cookie、CDK 或代理。
- 仅保留既有 `background.js` 超过 8000 行的非阻断警告；没有提高审计阈值。
- 未生成发布 ZIP，未修改 Manifest 版本号。

---

<a id="2026-07-26-step3-5-skip-redundant-password"></a>

## 步骤 3.5 成功后仍重复执行步骤 6

日期：2026-07-26

关联记录：[已有账号 TOTP 登录](#2026-07-26-existing-account-totp-login)、[步骤 3.5 节点失败竞态](#2026-07-26-step3-5-node-error-race)

### 故障现象与证据

脱敏诊断生成于 `2026-07-26T12:31:48.298Z`。步骤 3 已提交账号现有密码，步骤 3.5 提交本地 TOTP 并明确记录登录成功；步骤 4 随后按已登录态完成，步骤 5 被跳过，但自动运行仍启动 `set-gpt-password`。由于现有账号没有本轮新建的密码重置状态，步骤 6 两次局部恢复后报错并停止整轮：

```text
步骤 3.5：2FA 登录成功
步骤 4：页面已直接进入 ChatGPT 已登录态
步骤 5：skipped
步骤 6：ChatGPT 密码入口未建立有效重置状态，需要重新启动当前步骤
```

账号、邮箱、密码、TOTP、AT、Cookie 和敏感 URL 参数均已从档案中移除。

### 根因

- `recoverRegisteredTotpLogin()` 已返回 `existingTotpLogin` 和跳过资料页信息，但没有明确声明现有密码已验证、无需再次设置密码。
- 内容脚本发送 `fill-password` 完成消息后，消息分发器调用步骤 3 后台收尾，却忽略了收尾函数的返回值；条件分支结果没有进入 `handleStepData()` 和自动运行完成通知。
- 若 TOTP 页面直到步骤 4 才被识别，步骤 4 后备恢复只转发跳过资料页字段，同样丢失密码步骤跳过语义。
- 节点协议因此只把步骤 5 标为 `skipped`，步骤 6 的 `set-gpt-password` 仍保持 `pending` 并被自动运行执行。

### 修复

- 步骤 3.5 只有在确认进入 ChatGPT 已登录态后才返回 `skipSetPasswordStep=true` 和稳定原因 `existing_totp_login`。
- `NODE_COMPLETE` 分发器合并步骤 3 后台收尾结果与原完成载荷，再用于状态处理和完成通知，避免条件分支字段在真实调用链中丢失。
- 节点协议收到完整的步骤 3.5 成功证据后，将未完成的步骤 4、5 和真实 `set-gpt-password` 节点标为 `skipped`，自动运行的下一个待执行节点变为步骤 7。
- 步骤 4 后备 TOTP 恢复同步转发相同字段；即使步骤 3 首次完成信号未携带结果，也能在步骤 4 收尾后跳过重复密码设置。
- 日志明确提示已有密码和 2FA 均已确认，并说明直接进入步骤 7。

### 安全与兼容边界

- 必须同时满足 `existingTotpLogin=true`、`skipSetPasswordStep=true` 和原因 `existing_totp_login` 才触发；普通已登录首页、缺少 TOTP 密钥、动态码失败、网络错误或远端状态未知均不会跳过步骤 6。
- 跳过前会解析当前工作流的步骤 6 节点。只有节点键为 `set-gpt-password` 才跳过；免 2FA 路线的 `persist-no-2fa-free` 保持待执行，继续读取会话并保存资格结果。
- 已处于 `running`、`completed`、`manual_completed` 或 `skipped` 的节点不会被重复改写。
- 本修复不修改账号模型、Provider、验证码新邮件基线、资格判定、Free/Plus 分组、CDK 幂等账本、UPI/IDEAL/PIX 独立状态、Manifest 权限或存储格式。
- 日志不记录密码、TOTP 密钥、六位动态码、完整 AT、Cookie 或其他真实凭据。

### 修改文件

- `background/signup-flow-helpers.js`
- `background/steps/fetch-signup-code.js`
- `background/router/message-dispatcher.js`
- `background/router/node-protocol-service.js`
- `scripts/test-signup-existing-totp-login.cjs`
- `scripts/test-existing-totp-workflow-skip.cjs`
- `CHANGELOG.md`
- `docs/USER_GUIDE.md`
- `docs/audit/issue-fix-index.md`

### 回归覆盖

- 步骤 3.5 成功结果包含明确的密码步骤跳过信号。
- 步骤 3 后台收尾结果会合并进节点状态处理和自动运行通知。
- 完整 2FA 路线跳过步骤 4/5/6，步骤 7 保持待执行。
- 步骤 4 后备 TOTP 恢复也跳过步骤 6。
- 免 2FA 路线不跳过 `persist-no-2fa-free`。
- 普通已登录分支没有完整步骤 3.5 成功证据时，步骤 6 保持待执行。

### 验证与提交影响

- 定向测试：`10/10` 通过。
- 完整单元测试：`495/495` 通过。
- 语法检查：`395` 个 Git 跟踪的 JavaScript 文件通过。
- 隔离 Chrome for Testing E2E 通过：`Chrome/150.0.7871.24`、Puppeteer 下载的固定浏览器、临时 Profile、pipe 传输；没有连接系统 Chrome、Edge 或用户 Profile。
- Documentation、Smoke、Removed Network、Phone/SMS 审计全部通过；路由节点协议保持 `700/700` 行，消息分发器保持 `991/1000` 行，没有提高阈值。
- Manifest 引用检查通过且 `manifest.json` 未修改；差异中没有真实邮箱、密码、验证码、完整 AT、API Key、Cookie、CDK、代理或敏感 URL 参数。
- 仅保留既有非阻断警告：`background.js` 超过 8000 行。
- 修复、测试和档案由同一独立本地提交交付；未打包、未修改 Manifest 版本、未创建标签或 GitHub Release。

---

<a id="2026-07-26-step3-5-ui-status-sync"></a>

## 步骤 3.5 日志与侧边栏运行状态不一致

日期：2026-07-26

关联记录：[步骤 3.5 侧边栏展示](#2026-07-26-step3-5-sidepanel-display)、[步骤 3.5 成功后跳过重复密码](#2026-07-26-step3-5-skip-redundant-password)

### 故障现象与证据

用户截图中，日志已经连续记录“步骤 3.5：已有账号 2FA 登录”并正在提交动态码；同一时刻流程列表仍把步骤 3 `fill-password` 标为运行，步骤 3.5 保持灰色“按需”，顶部状态仍显示 `节点 fill-password 运行中...`。截图中的邮箱、密码、TOTP、验证码、AT、Cookie 和其它敏感信息未写入档案。

### 根因

- 步骤 3.5 最初只作为 `displayOnly` 静态行插入侧边栏，不属于真实工作流节点集合。
- 状态渲染只遍历 7 个真实 `nodeId`；步骤 3.5 没有独立状态字段，因此永远保留初始“按需”样式。
- 步骤 3.5 的业务日志按实际归属继续使用步骤 3 / `fill-password`，顶部状态只读取真实运行节点，因而显示底层步骤 3，而不是当前正在处理的条件分支。

### 修复

- 在现有后台状态中增加仅用于展示的 `existingTotpLoginDisplayStatus`，允许 `pending`、`running`、`completed` 和 `failed`，不加入 `nodeStatuses`。
- 每次步骤 3 收尾先复位为 `pending`；确认真实 TOTP 登录页后切换为 `running`；只有确认进入 ChatGPT 已登录态后才切换为 `completed`；缺少本地密钥、动态码被拒、提交失败或结果未知时切换为 `failed`。
- 状态通过现有 `setState` 和 `DATA_UPDATED` 广播链同步到 Sidepanel；展示状态写入失败会被隔离，不会中断认证业务。
- 侧边栏流程行保留 `display-only` 属性和待机文案“按需”，运行、完成、失败时使用现有状态样式；自动运行重置后也会恢复待机状态。
- 顶部状态在非倒计时、非暂停状态下优先显示“步骤 3.5：已有账号 2FA 登录运行中...”，条件分支结束后继续使用原有真实节点状态。

### 安全与兼容边界

- 步骤 3.5 仍不是可执行、可手动点击或可跳过节点，不参与工作流锁、自动运行排序或完成通知。
- 进度分母和完成计数仍只包含原有 7 个真实节点，不会显示为 8 步，也不会改变步骤 3.5 成功后直达步骤 7 的现有逻辑。
- 日志的步骤归属仍保留为步骤 3，避免修改错误归类、重试策略和历史兼容；本次仅增加与真实分支生命周期同步的展示状态。
- 未修改账号模型、Provider、验证码新邮件基线、资格判定、Free/Plus 分组、CDK 幂等账本、UPI/IDEAL/PIX 独立状态、Manifest 权限或存储导出格式。
- 展示状态不包含邮箱、密码、TOTP 密钥、六位动态码、完整 AT、Cookie、CDK 或敏感 URL 参数。

### 修改文件

- `background.js`
- `background/bootstrap/signup-executor-registry.js`
- `background/signup-flow-helpers.js`
- `sidepanel/workflow-state-view.js`
- `sidepanel/workflow-status-display.js`
- `sidepanel/workflow-controller.js`
- `sidepanel/runtime-message-data-handler.js`
- `sidepanel/runtime-message-handlers.js`
- `scripts/test-signup-existing-totp-login.cjs`
- `scripts/test-sidepanel-workflow-state-view.cjs`
- `scripts/test-sidepanel-workflow-status-display.cjs`
- `scripts/test-custom-email-pool-runtime-sync.cjs`
- `CHANGELOG.md`
- `docs/USER_GUIDE.md`
- `docs/audit/issue-fix-index.md`

### 回归覆盖

- 步骤 3 收尾的展示生命周期为 `pending -> running -> completed`。
- 缺少本地 TOTP 密钥和连续动态码拒绝会显示 `failed`；普通邮箱验证码路径保持 `pending`。
- Sidepanel 收到运行时状态广播后同时刷新步骤 3.5 行和顶部状态。
- 步骤 3.5 在运行、完成、失败和待机之间切换时始终保留 `display-only`，待机仍显示“按需”。
- 步骤 3.5 运行时覆盖顶部的底层 `fill-password` 文案；自动暂停仍保持更高优先级。
- 进度统计排除步骤 3.5，既有成功后跳过步骤 4/5/6、免 2FA 路线不跳过资格保存节点的测试继续通过。

### 验证与提交影响

- 定向语法检查和相关回归测试：`27/27` 通过。
- 完整单元测试：`500/500` 通过。
- 语法检查：`396` 个 Git 跟踪的 JavaScript 文件通过。
- 隔离 Chrome for Testing E2E 通过：`Chrome/150.0.7871.24`、Puppeteer 下载的固定浏览器、临时 Profile、pipe 传输；没有连接系统 Chrome、Edge 或用户 Profile。
- Documentation、Smoke、Removed Network、Phone/SMS 审计全部通过；仅保留既有非阻断警告：`background.js` 超过 8000 行，未提高任何审计阈值。
- Manifest 运行时引用审计通过且 `manifest.json` 未修改；差异只包含虚构 `.test` 邮箱和固定测试 TOTP，不包含真实邮箱、密码、验证码、完整 AT、API Key、Cookie、CDK、代理或敏感 URL 参数。
- 修复、测试和档案由同一独立本地提交交付；未打包、未修改 Manifest 版本、未创建标签或 GitHub Release。

---
