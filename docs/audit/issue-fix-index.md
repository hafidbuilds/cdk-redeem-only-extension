# 故障与修复索引

本索引用于快速查询真实出现过的问题。详细记录按月合并，避免每个问题产生一个 Markdown 文件，同时保留原始日期、脱敏证据、根因、实现、安全边界和验证结果。

## 查询

```powershell
rg -n "关键词" docs/audit/issue-fix-archive-*.md
git log --oneline -- docs/audit
```

## 2026-08

| 日期 | 问题 | 修复结论 | 详细记录 |
| --- | --- | --- | --- |
| 2026-08-08 | 日文验证码错误后第 4 步重复提交旧码，没有点击重新发送 | 识别日文错误和重发句尾变体，增加结构化属性后备；明确拒绝后请求新验证码 | [记录](issue-fix-archive-2026-08.md#2026-08-08-step4-japanese-invalid-code-resend) |
| 2026-08-08 | 第三步点击密码入口后验证码页返回 HTTP 500，页面停在错误页 | 仅对可确认的认证 HTTP 500 页面刷新并限次重新点击密码入口，失败时保留注册会话 | [记录](issue-fix-archive-2026-08.md#2026-08-08-step3-password-switch-http-500) |
| 2026-08-08 | GitHub Actions 中账号弹窗滚动 E2E 受 Runner 视口影响失败 | 在隔离测试页直接固定弹窗高度，稳定构造溢出并保留原滚动行为断言 | [记录](issue-fix-archive-2026-08.md#2026-08-08-github-actions-e2e-scroll-viewport) |
| 2026-08-08 | 注册完成后仍显示并执行不再需要的第 10 步 | 工作流升级为九步，第 9 步保存 `unknown` 后结束；资格接口代码保留供手动复检 | [记录](issue-fix-archive-2026-08.md#2026-08-08-step10-hidden-nine-step-workflow) |
| 2026-08-08 | 第 10 步仍按旧协议请求资格接口，缺少 GCash 检查参数和服务授权 | 发送 `check_gcash_pm` 与独立 Bearer 令牌，按 GCash 字段区分无资格、配置失败和临时错误 | [记录](issue-fix-archive-2026-08.md#2026-08-08-step10-gcash-api-contract) |
| 2026-08-02 | 第 4 步账号已停用时仍继续等待验证码或重开当前账号 | 标记账号封禁；手动停止，自动运行同轮换下一个账号 | [记录](issue-fix-archive-2026-08.md#2026-08-02-step4-account-deactivated-replacement) |
| 2026-08-02 | 七步工作流的步骤 3.5、密码重置和最终安全流程无法独立恢复 | 升级为固定十步；按节点检查点连续推进并迁移旧状态 | [记录](issue-fix-archive-2026-08.md#2026-08-02-workflow-v2-ten-step-refactor) |
| 2026-08-03 | 第 10 步确认无试用资格后又选择同一账号 | 统一写入生命周期、排除邮箱池并让 Provider 来源失效 | [记录](issue-fix-archive-2026-08.md#2026-08-03-trial-ineligible-account-reselection) |
| 2026-08-03 | 第 7 步进入当前密码确认页后被误判并回退，导致第 8 步缺少检查点 | 识别 `/log-in/password`，同邮箱提交已绑定密码后继续第 7 步 | [记录](issue-fix-archive-2026-08.md#2026-08-03-step7-current-password-challenge) |
| 2026-08-03 | 第 7 步遇到 ChatGPT 会话过期弹窗后仍等待 Password 入口并报 75 秒超时 | 识别多语言过期弹窗并立即提示重新登录 | [记录](issue-fix-archive-2026-08.md#2026-08-03-step7-chatgpt-session-expired-modal) |
| 2026-08-03 | 第 8 步未识别韩文密码复用错误，反复提交同一密码并回退第 7 步 | 提取并分类韩文错误，生成不同密码后在第 8 步重试 | [记录](issue-fix-archive-2026-08.md#2026-08-03-step8-korean-password-reuse) |
| 2026-08-03 | 第 10 步明确无资格后，同一账号又回第 7 步重新执行 | 无资格绕过认证链恢复，结束当前轮并切换下一账号 | [记录](issue-fix-archive-2026-08.md#2026-08-03-step10-ineligible-post-auth-restart) |
| 2026-08-04 | 选择免 2FA Free 路线后，自动运行仍执行第 7 步 | 重置时保留路线，并按恢复后的路线重建默认节点状态 | [记录](issue-fix-archive-2026-08.md#2026-08-04-no-2fa-route-reset-step7) |
| 2026-08-04 | 免 2FA 完成一轮后，第 10 步在下一轮仍显示完成 | 重置消息携带权威路线节点图，侧栏用本轮待执行状态覆盖旧高亮 | [记录](issue-fix-archive-2026-08.md#2026-08-04-auto-run-reset-stale-step10-ui) |
| 2026-08-04 | 免 2FA 第 9 步固定跳过却一直显示蓝色高亮 | 路线跳过节点统一灰置并显示“当前路线跳过” | [记录](issue-fix-archive-2026-08.md#2026-08-04-route-skipped-step9-active-style) |
| 2026-08-04 | 账号工具仍保留卡密池、兑换和 Plus 分组，资格结果无法按两个 Free 分组统一管理 | 升级到 Free Account Tool V3.0.0，迁移 `freeAccountResults` 并删除 CDK/Plus 全链路 | [记录](issue-fix-archive-2026-08.md#2026-08-04-free-account-tool-v3-removal) |
| 2026-08-04 | V3 两个 Free 分组已经生成，但首屏找不到入口 | 将“Free 账号”入口移到顶栏，点击后直接显示两个分组 | [记录](issue-fix-archive-2026-08.md#2026-08-04-free-groups-entry-hidden-below-fold) |
| 2026-08-04 | 第 10 步资格落库节点仍显示并接受单独“跳过” | 三条路线的最终节点不再生成跳过按钮，Side Panel 与 Background 双重拒绝 | [记录](issue-fix-archive-2026-08.md#2026-08-04-step10-manual-skip-button) |
| 2026-08-04 | 深色主题的 AT/Session 导出下拉框中 Session 文字几乎不可见 | 为原生选择框和选项显式设置明暗主题配色及 color-scheme | [记录](issue-fix-archive-2026-08.md#2026-08-04-session-export-select-dark-contrast) |
| 2026-08-04 | Free 组与无资格 Free 组的公共操作起点、顺序和换行位置不对齐 | 公共操作使用一致顺序，Free 专属操作移入独立工具行 | [记录](issue-fix-archive-2026-08.md#2026-08-04-free-group-toolbar-alignment) |
| 2026-08-04 | 切回完整 2FA 后仍显示免 2FA 的第 7/8 步跳过和旧节点完成状态 | 即时重置 Side Panel 路线状态，并修复 Background 路线保存的作用域异常 | [记录](issue-fix-archive-2026-08.md#2026-08-04-full-2fa-route-stale-no2fa-state) |
| 2026-08-05 | 免 2FA 第 10 步被误报为当前模式不存在并回退第 7 步 | 路线注册表不再依赖已删除的 Plus 标志，免 2FA 与 Passkey 按所选路线执行 | [记录](issue-fix-archive-2026-08.md#2026-08-05-no2fa-step10-registry-plus-flag) |
| 2026-08-05 | Free 与无资格 Free 的 AT/Session 导出错误下载为 V3 JSON | 改为逐账号一行的 UTF-8 TXT，Session 作为凭据字段保留完整内容 | [记录](issue-fix-archive-2026-08.md#2026-08-05-free-export-txt-format) |
| 2026-08-05 | Free 账号分组弹窗无法独立上下滑动，滚轮会移动主界面 | 面板建立真实纵向滚动区，打开时锁定底层页面并阻止滚动穿透 | [记录](issue-fix-archive-2026-08.md#2026-08-05-free-account-modal-scroll) |
| 2026-08-05 | 任务列表刷新没有反馈，已结束任务也没有删除入口 | 刷新显示忙碌状态和完成时间；支持逐条及批量删除终态任务与事件 | [记录](issue-fix-archive-2026-08.md#2026-08-05-account-task-refresh-delete) |
| 2026-08-05 | 步骤 2 邮箱已填写但 Continue 慢渲染，导致当前账号整轮重试 | 延长等待并恢复重渲染表单；按钮不可用时对匹配邮箱执行一次回车提交 | [记录](issue-fix-archive-2026-08.md#2026-08-05-step2-continue-enter-fallback) |
| 2026-08-05 | 自动运行在第 1 步前因 Session storage quota 超限终止 | Free 结果与规范账号改为 Local-only，启动时清除旧 Session 重复副本 | [记录](issue-fix-archive-2026-08.md#2026-08-05-session-storage-quota-free-results) |
| 2026-08-05 | 120 个已导入账号缺少 Session，现有 AT 刷新无法持久续跑或自动导出 | 新增缺 Session 统计和可停止、可续跑的串行补充 Session 任务，逐条落库并自动下载 TXT | [记录](issue-fix-archive-2026-08.md#2026-08-05-batch-fill-free-account-sessions) |
| 2026-08-05 | 补充 Session 卡片长期显示 0/120 或续跑前旧状态，事件看不到失败原因 | 登录开始即写序号和计数，任务卡自动刷新；事件显示脱敏错误码、具体原因和中文生命周期文案 | [记录](issue-fix-archive-2026-08.md#2026-08-05-session-fill-progress-events-visibility) |
| 2026-08-05 | 补充 Session 已处理约 20 个账号但成功始终为 0 | 启动和续跑前清除自动注册遗留停止标志；新的停止信号按整批取消处理 | [记录](issue-fix-archive-2026-08.md#2026-08-05-session-fill-stale-global-stop) |
| 2026-08-05 | 补充 Session 任务卡已推进到 12/100，事件面板仍停在 1/100 | 打开事件后随任务轮询同步刷新；关闭或删除时解除当前事件任务 | [记录](issue-fix-archive-2026-08.md#2026-08-05-task-events-stale-after-open) |
| 2026-08-05 | 登录完成后连续报 `FREE_ACCOUNT_SESSION_INCOMPLETE`，成功仍为 0 | 解包 Session 读取器响应外壳，保存和校验内层完整接口内容 | [记录](issue-fix-archive-2026-08.md#2026-08-05-session-reader-envelope-incomplete) |
| 2026-08-06 | 补充 Session 部分失败后无法查看早期原因，事件自动刷新总拉回底部 | 压缩优先保留错误事件；用户向上滚动时保持位置 | [记录](issue-fix-archive-2026-08.md#2026-08-06-task-event-failure-retention-scroll) |
| 2026-08-07 | 第 5 步已注册邮箱被诊断成步骤 4，结构化错误码又被误遮盖 | 按调用步骤输出文案并保护 `SIGNUP_USER_ALREADY_EXISTS` 错误码 | [记录](issue-fix-archive-2026-08.md#2026-08-07-step5-user-already-exists-diagnostic) |
| 2026-08-07 | 免 2FA 第 10 步存储配额超限后只能回第 7 步重试 | 增加 `unlimitedStorage`，配额错误只有限重试当前第 10 步 | [记录](issue-fix-archive-2026-08.md#2026-08-07-no2fa-step10-storage-quota-retry) |
| 2026-08-07 | 免 2FA 手动处理前六步后第 10 步仍灰置，无法直接执行 | 未触发 TOTP 时条件性第 4 步不再阻塞，第 10 步执行前自动补记跳过 | [记录](issue-fix-archive-2026-08.md#2026-08-07-no2fa-step10-manual-execution) |
| 2026-08-07 | 免 2FA 第 10 步资格接口超时后又自动回到第 7 步 | 临时资格失败只有限重试当前第 10 步，不再探测认证页或重置密码链 | [记录](issue-fix-archive-2026-08.md#2026-08-07-no2fa-step10-eligibility-timeout-retry) |
| 2026-08-07 | 重启同一指纹浏览器 Profile 后插件配置恢复为默认值 | Local 成为配置唯一权威来源，旧 Session 快照不再覆盖已保存设置 | [记录](issue-fix-archive-2026-08.md#2026-08-07-persisted-settings-session-override) |
| 2026-08-08 | 邮箱注册默认进入验证码页后无法在第 3 步创建密码 | 点击官网“使用密码继续”，确认创建后跳过步骤 7、8；无入口时保留免密码流程 | [记录](issue-fix-archive-2026-08.md#2026-08-08-step3-email-verification-password-switch) |
| 2026-08-08 | 法语验证码页显示密码入口但第 3 步没有点击 | 识别法语“Continuer avec un mot de passe”及同义文本并复用既有切换流程 | [记录](issue-fix-archive-2026-08.md#2026-08-08-step3-french-password-switch-label) |
| 2026-08-08 | 法语密码入口仍可见，但第 3 步瞬间完成并继续取验证码 | 逐字段识别按钮并等待渲染/启用；可见但不可点击时保留会话停止 | [记录](issue-fix-archive-2026-08.md#2026-08-08-step3-password-switch-accessible-text) |
| 2026-08-08 | 第 3 步等待 5 秒后仍跳过页面上可见的法语密码入口 | 从嵌套文字叶节点解析父级点击组件；有入口文案却无法定位时禁止静默跳过 | [记录](issue-fix-archive-2026-08.md#2026-08-08-step3-password-switch-text-leaf) |
| 2026-08-08 | 文字叶节点修复后第 3 步仍等待 5 秒并误完成 | 规范化隐藏字符、匹配短语包装文本、遍历开放 Shadow DOM，并在延迟点击前重新定位 | [记录](issue-fix-archive-2026-08.md#2026-08-08-step3-password-switch-deep-dom) |
| 2026-08-08 | 指纹浏览器中已识别密码入口文案，但第 3 步仍无法解析点击目标 | 扫描所有元素类型，兼容零尺寸操作容器，并输出脱敏结构摘要 | [记录](issue-fix-archive-2026-08.md#2026-08-08-step3-password-switch-structural-action) |
| 2026-08-08 | 密码入口已定位但实际为 `/log-in/password`，第 3 步仍报无法点击并停止 | 单独分类已有账号登录入口，不点击或误报创建密码，继续验证码流程 | [记录](issue-fix-archive-2026-08.md#2026-08-08-step3-login-password-switch-fallback) |
| 2026-08-08 | 旧第 10 步结果在新会话第 5 步期间回写并提前触发第 7 步 | 全链路复核自动运行会话，拒绝旧节点消息和晚到资格结果；诊断忽略已恢复错误 | [记录](issue-fix-archive-2026-08.md#2026-08-08-auto-run-superseded-session-race) |
| 2026-08-08 | 验证码页明确显示密码按钮，但第 3 步不点击并原地报完成 | 受控点击官方 `/log-in/password` 入口，等待密码页并继续原生表单提交 | [记录](issue-fix-archive-2026-08.md#2026-08-08-step3-login-password-switch-click) |
| 2026-08-08 | 步骤 2 首次误报主页无注册入口，第二次重试才显示成功 | 识别法语主页入口，并由 Background 独占首次探测、跳转和提交的最终状态裁决 | [记录](issue-fix-archive-2026-08.md#2026-08-08-step2-first-attempt-recovery-error-race) |

## 2026-07

| 日期 | 问题 | 修复结论 | 详细记录 |
| --- | --- | --- | --- |
| 2026-07-25 | 邮箱池和未知会员状态被误归入 Free | 只有明确 `free` 的账号进入 Free 分组 | [记录](issue-fix-archive-2026-07.md#2026-07-25-free-group-classification-fix) |
| 2026-07-25 | 最近失败诊断需要反复保存和发送文件 | 诊断脱敏后直接写入剪贴板并提示成功 | [记录](issue-fix-archive-2026-07.md#2026-07-25-failure-diagnostics-clipboard) |
| 2026-07-25 | 普通超时配置日志被误选为最近失败 | 优先真实错误级别并排除配置说明 | [记录](issue-fix-archive-2026-07.md#2026-07-25-failure-diagnostics-anchor-fix) |
| 2026-07-25 | 免 2FA Free 账号在 TXT 导出中缺失 | 导出合并统一账号模型并保留免 2FA 路线 | [记录](issue-fix-archive-2026-07.md#2026-07-25-no2fa-free-export-fix) |
| 2026-07-26 | 安全配置导入后账号和 Free/Plus 分组为空 | 安全导出保存脱敏账号明细，导入后同步统一账号模型 | [记录](issue-fix-archive-2026-07.md#2026-07-26-safe-settings-import-recovery) |
| 2026-07-26 | ChatGPT 登录弹窗 Continue 稍晚启用时被误报不可点击 | 填写邮箱后重新查询按钮并等待启用 | [记录](issue-fix-archive-2026-07.md#2026-07-26-chatgpt-modal-continue-button) |
| 2026-07-26 | 步骤 6 读取 Session/AT 时主 Frame 被替换 | 原地重新定位标签页；耗尽后停止并禁止换邮箱 | [记录](issue-fix-archive-2026-07.md#2026-07-26-chatgpt-session-frame-recovery) |
| 2026-07-26 | 注册密码提交后快速重复点击并换邮箱重试 | 最多补交一次；未知结果保留页面和邮箱后停机 | [记录](issue-fix-archive-2026-07.md#2026-07-26-signup-password-transition-timeout) |
| 2026-07-26 | 步骤 4 后台响应超时早于验证码页就绪 | 对齐等待窗口；通信耗尽时保留页面并禁止内部重开 | [记录](issue-fix-archive-2026-07.md#2026-07-26-step4-content-response-timeout) |
| 2026-07-26 | 步骤 6 出现 `invalid_state` 后直接停止或误判成功 | 保留同一账号并受限重启步骤 6 | [记录](issue-fix-archive-2026-07.md#2026-07-26-step6-invalid-state-restart) |
| 2026-07-26 | 步骤 6 恢复耗尽后回步骤 1 清 Cookie | 禁止裸新密码页；耗尽后保留现场并停止 | [记录](issue-fix-archive-2026-07.md#2026-07-26-step6-invalid-state-round-restart) |
| 2026-07-26 | 用户停止自动运行后日志连续刷新 | 主动停止不再回放旧日志，故障快照仍保留 | [记录](issue-fix-archive-2026-07.md#2026-07-26-manual-stop-log-replay) |
| 2026-07-26 | 步骤 6 页面停在 interactive 时被误判加载失败 | 按密码入口是否可操作判断；缺失时仅限次重启步骤 6 | [记录](issue-fix-archive-2026-07.md#2026-07-26-step6-interactive-settings-readiness) |
| 2026-07-26 | E2E 实际使用 Edge，却被记录为 Chrome 验证 | 改用隔离的 Chrome for Testing 和临时 Profile | [记录](issue-fix-archive-2026-07.md#2026-07-26-isolated-chrome-e2e-harness) |
| 2026-07-26 | 步骤 6 可见 Password 被误判缺失，诊断又被旧快照覆盖 | 精确定位 Password 行；当前直接错误优先于历史快照 | [记录](issue-fix-archive-2026-07.md#2026-07-26-step6-visible-password-entry-detection) |
| 2026-07-26 | Password 已点击但 OpenAI 慢跳转耗尽恢复并打断工作流 | 同一标签页继续复核，确认超时后才消耗受限恢复 | [记录](issue-fix-archive-2026-07.md#2026-07-26-step6-slow-reset-navigation-reconcile) |
| 2026-07-26 | 第 4 步已进入验证码页但输入框延迟渲染时重开注册 | 复用 75 秒总预算继续等待；耗尽后保留现场停止 | [记录](issue-fix-archive-2026-07.md#2026-07-26-step4-late-verification-input-render) |
| 2026-07-26 | 第 6 步 Security 页面 Password 行稍晚渲染时连续刷新并停机 | 先在同一标签页额外等待 45 秒，再进入有限重启 | [记录](issue-fix-archive-2026-07.md#2026-07-26-step6-late-password-entry-render) |
| 2026-07-26 | 第 4 步验证码输入框超过 75 秒才挂载时工作流停止 | 保留同一会话并由有限倒计时恢复当前节点 | [记录](issue-fix-archive-2026-07.md#2026-07-26-step4-late-input-timer-resume) |
| 2026-07-26 | 第 5 步 Try again 重建表单后空字段一直无人补填 | 携带本轮资料草稿并在原页补填后受限重提 | [记录](issue-fix-archive-2026-07.md#2026-07-26-step5-retry-rerender-refill) |
| 2026-07-26 | 步骤 3 后进入已有账号 TOTP 页时被直接排除 | 增加步骤 3.5，复用本地 TOTP 密钥完成登录 | [记录](issue-fix-archive-2026-07.md#2026-07-26-existing-account-totp-login) |
| 2026-07-26 | 侧边栏流程列表没有显示步骤 3.5 | 增加不参与执行和进度统计的“已有账号 2FA 登录（按需）”展示行 | [记录](issue-fix-archive-2026-07.md#2026-07-26-step3-5-sidepanel-display) |
| 2026-07-26 | 步骤 3.5 登录成功前旧失败广播已排除邮箱并启动下一轮 | 后台恢复请求由后台唯一裁决，不再竞争性广播节点失败 | [记录](issue-fix-archive-2026-07.md#2026-07-26-step3-5-node-error-race) |
| 2026-07-26 | 步骤 3.5 登录成功后仍执行步骤 6 并因无密码重置状态停机 | 传递条件分支结果，仅跳过真实的设置密码节点并直接进入步骤 7 | [记录](issue-fix-archive-2026-07.md#2026-07-26-step3-5-skip-redundant-password) |
| 2026-07-26 | 日志执行步骤 3.5 时界面仍显示步骤 3 运行中 | 增加独立展示状态并同步流程行和顶部状态，不改变 7 节点模型 | [记录](issue-fix-archive-2026-07.md#2026-07-26-step3-5-ui-status-sync) |
| 2026-07-27 | 第 7 步已通过但邮箱池卡片回显示“未用” | 普通侧栏回写合并并保护已用、AT、资格和选中状态，人工重置显式放行 | [记录](issue-fix-archive-2026-07.md#2026-07-27-custom-email-pool-status-rollback) |
| 2026-07-27 | 无试用资格邮箱显示“未用”，疑似会被循环选择 | 无 AT 时显示“已排除”，并验证自动运行选中下一条可用邮箱 | [记录](issue-fix-archive-2026-07.md#2026-07-27-ineligible-email-exclusion-display) |
| 2026-07-27 | 明确无试用资格状态被旧快照覆盖后长期显示未用 | 资格结论写入统一账号记录并自动回填，旧损坏条目支持人工标记 | [记录](issue-fix-archive-2026-07.md#2026-07-27-ineligible-email-canonical-recovery) |
| 2026-07-27 | 步骤 2 密码页等待被误报为内容脚本超时并重复提交邮箱 | 分离页面与响应预算；最终未知时保留现场并禁止整轮重试 | [记录](issue-fix-archive-2026-07.md#2026-07-27-step2-password-page-response-timeout) |
| 2026-07-28 | 自定义邮箱验证码未被 OpenAI 接受却被步骤 4 当作成功 | 人工确认后复核权威页面状态；拒绝或未知时保留会话停止 | [记录](issue-fix-archive-2026-07.md#2026-07-28-manual-signup-verification-confirmation) |
| 2026-07-29 | 步骤 6 最新邮件是登录通知时首次取码即终止并重开整轮 | 识别结构化非验证码状态，在原步骤有限轮询和 Resend | [记录](issue-fix-archive-2026-07.md#2026-07-29-step6-signin-notification-polling) |
| 2026-07-29 | 步骤 4 从 HTML 取件页连续提交隐藏六位数字并触发次数限制 | 只接受验证提示语绑定的正文码；旧码被拒后禁止回退到干扰数字 | [记录](issue-fix-archive-2026-07.md#2026-07-29-step4-generic-html-decoy-code) |
| 2026-07-30 | 步骤 3.5 可借用其他标签页 Session 误判登录成功 | 成功绑定当前标签页，页面和 Session 邮箱必须匹配 | [记录](issue-fix-archive-2026-07.md#2026-07-30-step3-5-current-tab-session-identity) |
| 2026-07-30 | 步骤 3.5 登录失败后自动运行清理现场并换邮箱 | 保留结构化错误并立即停机，不清现场、不换邮箱 | [记录](issue-fix-archive-2026-07.md#2026-07-30-step3-5-failure-session-preservation) |
| 2026-07-30 | 已有 TOTP 账号经 Free 资格节点后被误记为免 2FA | 保留密码和 TOTP，明确记录为已启用 2FA | [记录](issue-fix-archive-2026-07.md#2026-07-30-existing-totp-free-persistence-semantics) |
| 2026-07-30 | 步骤 3.5 分格输入日志泄露动态码 | 集中脱敏完整动态码和分格当前值 | [记录](issue-fix-archive-2026-07.md#2026-07-30-step3-5-totp-log-redaction) |
| 2026-07-30 | 步骤 6 取码耗尽后重开整轮注册 | 取码耗尽保留当前步骤 6 会话并停止，禁止清理后重开 | [记录](issue-fix-archive-2026-07.md#2026-07-30-step6-code-fetch-round-restart) |
| 2026-07-30 | 步骤 6 直连取件 URL 返回缓存旧邮件 | 为直连请求添加一次性缓存键，重发后重新拉取最新验证码邮件 | [记录](issue-fix-archive-2026-07.md#2026-07-30-step6-direct-mail-cache-bust) |
| 2026-08-05 | V3 AT/Session TXT 最后一列重新显示难以阅读的 Unix 数字时间戳 | 秒、毫秒和 ISO 来源统一导出为北京时间 `YYYY-MM-DD HH:mm:ss +08:00` | [记录](issue-fix-archive-2026-08.md#2026-08-05-free-export-readable-timestamp) |
| 2026-08-07 | 指纹浏览器中账号越多、日志越长，自动运行越卡 | 日志改为范围读取；普通状态 patch 不再全量读取 Session 或重复写完整运行态 | [记录](issue-fix-archive-2026-08.md#2026-08-07-fingerprint-browser-state-write-lag) |
| 2026-08-07 | 设置显示已保存但重载侧栏后又恢复默认值 | 接通保存按钮和统一字段监听；完整恢复回填 Local 中的自动运行配置 | [记录](issue-fix-archive-2026-08.md#2026-08-07-sidepanel-settings-save-and-restore) |
| 2026-08-08 | 修复设置后设置、邮箱池和账号列表同时显示为空 | 清理 Free 行递归运行状态，轻量化启动/保存消息并自动修复旧数据 | [记录](issue-fix-archive-2026-08.md#2026-08-08-free-results-recursive-state-message-limit) |

## 新记录规则

1. 在当月 `issue-fix-archive-YYYY-MM.md` 追加完整记录，不再新建单问题 Markdown。
2. 使用 `YYYY-MM-DD-issue-slug` 形式的稳定 HTML 锚点。
3. 写明故障现象、脱敏证据、根因、真实调用链、实现和业务安全边界。
4. 记录定向测试、完整测试、语法检查、审计、Manifest、敏感数据和必要 E2E 的真实结果。
5. 在本索引增加一行，并在提交或发布后补充准确影响。
6. 不写 TODO、虚构测试数或任何真实敏感数据；后续修复通过新增记录取代旧结论，不静默改写历史。
