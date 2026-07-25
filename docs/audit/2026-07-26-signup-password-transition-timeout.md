# 注册密码提交后过早重试与未知结果保护

日期：2026-07-26

## 故障样本

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

## 根因

- `prepareSignupVerificationFlow()` 虽收到 `timeoutMs: 75000`，循环条件还绑定了三次恢复计数。
- 每轮只观察 2.5 秒；按钮恢复可点击就立即再次提交，因此三次短轮询提前耗尽并绕过 75 秒总观察时间。
- 观察轮数和远端表单重交次数混用，页面仍在处理时也会重复点击。
- 初次和恢复提交只调用模拟点击，没有优先使用表单原生 `requestSubmit()`。
- 密码错误探测缺少 `aria-errormessage`、无效输入的 `aria-describedby`、结构化错误属性和 assertive live region。
- 超时错误没有稳定错误码，自动运行策略把它归入 `retry_generic`，即使远端提交结果未知也会清 Cookie、换邮箱并重开注册。

## 修复

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

## 安全边界

密码提交后的未知结果不能解释为提交失败，也不能解释为账号创建成功。未知状态下禁止清理 Cookie、切换邮箱、重开注册或继续自动提交；只能保留现场，等待人工检查当前认证页。明确页面错误仍按真实错误处理，验证码、密码和完整 AT 不写入档案或普通日志。

## 修改文件

- `content/signup-password-page.js`
- `content/signup-page.js`
- `background/signup-flow-helpers.js`
- `background/auto-run/retry-policy.js`
- `background/auto-run/session-runner.js`
- `scripts/test-signup-password-transition.cjs`
- `scripts/test-auto-run-email-guard.cjs`
- `scripts/test-auto-run-session-runner.cjs`
- `docs/audit/issue-fix-index.md`

## 回归覆盖

- 初次提交后的 10 秒观察期内不补交。
- 观察期结束后最多只补交一次，并继续观察至总超时。
- 原生 `requestSubmit()` 与点击回退路径。
- 明确密码错误和普通密码提示的区分。
- 结构化未知结果映射到终止动作。
- 开启“跳过失败”时仍只执行一次，不选择下一个邮箱。
- 既有免 2FA、自定义邮箱池、步骤 4 验证码恢复和自动运行恢复行为。

## 验证

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
