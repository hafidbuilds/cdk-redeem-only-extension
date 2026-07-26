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

## 新记录规则

1. 在当月 `issue-fix-archive-YYYY-MM.md` 追加完整记录，不再新建单问题 Markdown。
2. 使用 `YYYY-MM-DD-issue-slug` 形式的稳定 HTML 锚点。
3. 写明故障现象、脱敏证据、根因、真实调用链、实现和业务安全边界。
4. 记录定向测试、完整测试、语法检查、审计、Manifest、敏感数据和必要 E2E 的真实结果。
5. 在本索引增加一行，并在提交或发布后补充准确影响。
6. 不写 TODO、虚构测试数或任何真实敏感数据；后续修复通过新增记录取代旧结论，不静默改写历史。
