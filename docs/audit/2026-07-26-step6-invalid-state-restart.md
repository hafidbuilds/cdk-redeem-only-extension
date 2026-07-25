# 步骤 6 invalid_state 会话失效原地重启

日期：2026-07-26

关联记录：[ChatGPT Session 主 Frame 切换恢复](2026-07-26-chatgpt-session-frame-recovery.md)

## 故障现象

步骤 6“设置 GPT 密码”执行期间，OpenAI 认证页明确显示：

```text
Session ended
Your sign-in session is no longer valid. Please start over to continue.
error_code: invalid_state
```

侧边栏同时显示 `set-gpt-password` 节点停止。该页面说明本次密码重置认证状态已经失效，不代表注册账号失效，也不要求回到步骤 1 更换邮箱重新注册。

## 根因

- 原有第 6 步只识别带 Try again 按钮的认证超时页，没有识别 `Session ended + error_code: invalid_state` 的终止状态。
- 页面状态因此可能落入未知页面或通信恢复分支，最终停止节点。
- 密码提交后的后台确认曾把“URL 已离开 `/reset-password/new-password`”直接视为成功；若跳到 OpenAI 认证错误页，存在误报密码设置成功的风险。
- 自动运行的通用整轮重试粒度过大，不适合这个已完成注册、只需重建密码重置状态的故障。

## 修复

- 在现有认证页恢复模块中增加精确检测：必须同时出现会话结束语义和完整 `error_code: invalid_state`，单独出现任一文本都不触发。
- `signup-page.js` 将命中页面转换为 `session_expired_page`，并抛出结构化 `SET_GPT_PASSWORD_SESSION_EXPIRED` 错误。
- 在现有 `set-gpt-password` 执行器内部捕获该错误，重新打开 ChatGPT 安全设置并从第 6 步起点重建密码重置流程。
- 重启沿用当前邮箱和已保存 GPT 密码，不清 Cookie、不切换邮箱、不重置步骤 1-5，也不重新提交注册。
- 单次节点执行最多自动重启第 6 步两次；第三次仍失效时保留真实错误并停止，防止无限循环。
- OpenAI 认证域页面不再仅凭“离开新密码 URL”判定成功，必须继续读取页面状态；`session_expired_page` 会进入第 6 步恢复。

## 安全与兼容边界

- 普通 `invalid_state` 文本、其他认证错误码或没有会话结束语义的页面不会触发本恢复。
- 已明确设置成功、密码重复、验证码错误、HTTP 500、Try again 恢复和内容脚本通信恢复继续使用原有独立路径。
- 账号身份在每次重启前与最新持久状态复核；检测到邮箱变化时停止，不跨账号继续。
- 本修复不修改邮箱 Provider、验证码新邮件基线、2FA、UPI 资格、CDK 幂等账本或兑换状态。
- 日志只记录错误类型和重启次数，不输出邮箱、验证码、密码、AT、Cookie 或敏感 URL 参数。

## 修改文件

- `content/auth-page-recovery.js`
- `content/signup-page.js`
- `background/steps/set-gpt-password.js`
- `scripts/test-set-gpt-password-session-expiry.cjs`
- `docs/audit/issue-fix-index.md`

## 回归覆盖

- 只有 `Session ended`/登录会话失效语义与 `error_code: invalid_state` 同时存在时才命中。
- 同一账号首次失效后原地重启第 6 步并完成密码设置。
- 连续失效只允许两次重启，随后抛出原结构化错误。
- OpenAI 认证错误 URL 会继续探测页面状态，不会固定返回成功。
- 无关 `invalid_state` 不触发第 6 步重启。

## 验证

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
