# 步骤 4 内容脚本响应超时误重开注册

日期：2026-07-26

关联记录：[注册密码提交后过早重试与未知结果保护](2026-07-26-signup-password-transition-timeout.md)

## 故障样本

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

## 根因

- 步骤 4 内容脚本的页面准备流程可能持续观察密码到验证码的过渡，并等待验证码输入框真正可交互。
- 上一修复已允许内容脚本观察更长时间，但 `background/steps/fetch-signup-code.js` 仍把总等待和单次响应窗口都固定为 30 秒。
- 该调用优先选择无恢复能力的 `sendToContentScript()`；只要它耗尽完整 30 秒，后面的恢复分支已经没有剩余时间。
- 通信超时以普通错误进入 `fetch-signup-code` 内部重开逻辑，先回到 `open-chatgpt` 并清 Cookie，最多重开三次后才交给自动运行总策略。
- 页面已经进入验证码阶段时重开注册会丢失当前认证现场，并可能重复提交同一个邮箱。

## 修复

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

## 安全与兼容边界

- 页面通信超时不能解释为验证码错误、密码错误、邮箱无效或 Token 无效。
- 当注册页面状态无法确认时，禁止清 Cookie、切换邮箱、重新提交注册或继续自动取码；只能保留当前标签页供人工恢复。
- 明确的登录 TOTP、用户已存在、HTTP 错误页和真实验证码缺失仍使用原有独立处理，不被本修复固定为成功。
- 邮箱 Provider、验证码新邮件基线、免 2FA Free 写入、UPI 资格检查和 CDK 状态没有改动。
- 日志和档案仅保留脱敏邮箱与计时信息，不保存验证码、密码、完整 AT、Cookie 或敏感 URL 参数。

## 修改文件

- `background/steps/fetch-signup-code.js`
- `background.js`
- `background/auto-run/session-runner.js`
- `scripts/test-fetch-signup-code-prepare-timeout.cjs`
- `scripts/test-fetch-signup-code-restart-policy.cjs`
- `docs/audit/issue-fix-index.md`

## 回归覆盖

- 步骤 4 使用可恢复通信通道，并传递 75/95/105 秒三层窗口。
- 直接通信仅作为可恢复通道缺失时的兼容回退。
- 通信恢复耗尽返回不可重试、保留会话的结构化错误。
- 未知注册过渡状态在任何步骤 4 内部重开计数之前向上抛出。
- 自动运行即使开启“跳过失败”也不选择下一个邮箱。
- 既有验证码输入框短暂缺失、页面刷新恢复、密码页过渡、自定义邮箱池和免 2FA 路线保持通过。

## 验证

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
