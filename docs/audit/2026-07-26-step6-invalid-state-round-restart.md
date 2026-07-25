# 步骤 6 invalid_state 恢复耗尽后误重开整轮

日期：2026-07-26

关联记录：[步骤 6 invalid_state 会话失效原地重启](2026-07-26-step6-invalid-state-restart.md)

## 故障样本

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

## 根因

- 密码入口点击后的观察窗口只有 6 秒，慢跳转会被过早判为点击失败。
- 入口缺失或未跳转时，后台直接打开 `/reset-password/new-password`。该地址可以显示密码表单，但没有经过邮箱验证或密码入口建立的有效重置状态，提交时 OpenAI 返回 `invalid_state`。
- 第 6 步内部两次原地恢复耗尽后，结构化错误没有进入“保留认证现场”的终止分类。
- 自动运行把它当作普通可重试失败，进入同一轮第 2 次整轮尝试，从步骤 1 清 Cookie 并重新注册。

## 修复

- 将 ChatGPT 密码入口点击后的状态观察窗口从 6 秒延长到 20 秒。
- 密码入口缺失或未跳转时返回结构化 `SET_GPT_PASSWORD_RESET_ENTRY_UNAVAILABLE`，不再直接打开无状态的 `/reset-password/new-password`。
- 该错误沿用现有第 6 步局部恢复：重新打开 ChatGPT 安全设置并保留同一账号，最多重启两次。
- `SESSION_EXPIRED` 和 `RESET_ENTRY_UNAVAILABLE` 在局部恢复耗尽后均进入现有认证现场保护分类。
- 自动运行此时直接停止并保留当前账号和步骤 1-5 进度，不再进入整轮第 2 次尝试，不清 Cookie、不切换邮箱、不重新注册。
- `/reset-password/new-password` 只保留在邮箱已经明确验证、需要进入新密码页的现有合法路径中。

## 安全与兼容边界

- 本修复不把 `invalid_state` 固定解释成成功，也不在状态未知时重复确认密码已设置。
- 第 6 步局部恢复仍有两次上限，避免无休止点击和提交。
- 密码重复、验证码错误、HTTP 500、Try again 页面及明确密码设置成功继续使用各自原有路径。
- 邮箱 Provider、验证码新邮件基线、2FA、UPI 资格、Free/Plus 分组及 CDK 幂等账本没有改动。
- 日志和档案不包含真实邮箱、密码、验证码、AT、Cookie 或敏感 URL 参数。

## 修改文件

- `content/signup-page.js`
- `background/steps/set-gpt-password.js`
- `background/auto-run/retry-policy.js`
- `background/auto-run/session-runner.js`
- `scripts/test-set-gpt-password-session-expiry.cjs`
- `scripts/test-auto-run-email-guard.cjs`
- `docs/audit/issue-fix-index.md`

## 回归覆盖

- 密码入口未建立重置状态时原地重启第 6 步。
- 局部恢复不会导航到无状态的 `/reset-password/new-password`。
- `SESSION_EXPIRED` 恢复耗尽时不可进行整轮重试。
- 终止策略不要求新标签页、不切换邮箱并保留当前认证现场。
- 既有 `invalid_state` 精确检测、同账号重启、两次上限和认证错误页防误报覆盖继续通过。

## 验证

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
