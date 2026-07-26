# 故障与修复索引

本索引用于快速查询真实出现过的问题。详细记录按月合并，避免每个问题产生一个 Markdown 文件，同时保留原始日期、脱敏证据、根因、实现、安全边界和验证结果。

## 查询

```powershell
rg -n "关键词" docs/audit/issue-fix-archive-*.md
git log --oneline -- docs/audit
```

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

## 新记录规则

1. 在当月 `issue-fix-archive-YYYY-MM.md` 追加完整记录，不再新建单问题 Markdown。
2. 使用 `YYYY-MM-DD-issue-slug` 形式的稳定 HTML 锚点。
3. 写明故障现象、脱敏证据、根因、真实调用链、实现和业务安全边界。
4. 记录定向测试、完整测试、语法检查、审计、Manifest、敏感数据和必要 E2E 的真实结果。
5. 在本索引增加一行，并在提交或发布后补充准确影响。
6. 不写 TODO、虚构测试数或任何真实敏感数据；后续修复通过新增记录取代旧结论，不静默改写历史。
