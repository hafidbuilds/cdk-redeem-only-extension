# ChatGPT Session 主 Frame 切换恢复

日期：2026-07-26

## 故障样本

诊断文件生成于 `2026-07-25T18:32:56.684Z`。免 2FA Free 路线中，步骤 5 已确认完成账号创建，步骤 6 随后读取 ChatGPT Session/AT 时失败：

```text
Frame with ID 0 was removed.
```

失败后旧逻辑把 Chrome 页面通信异常当成普通轮次失败，在“跳过失败”开启时开始同轮第 2 次尝试并选择另一个邮箱。诊断结束时的页面探测还出现 `Receiving end does not exist`，与主 Frame 跳转后内容脚本暂时不可用一致。

## 根因

- `readCurrentChatGptSessionForExport()` 只解析一次 ChatGPT/OpenAI 标签页。
- 它通过 `chrome.scripting.executeScript()` 在目标标签页主 Frame 中请求 `/api/auth/session`。
- 注册资料提交完成后，认证页会跳转或替换主 Frame；已经发起的脚本此时可能收到 Chrome 的 `Frame with ID 0 was removed`。
- 旧实现没有把该错误归入页面生命周期异常，也没有重新解析当前标签页。
- 上层自动运行策略把未分类错误归入通用重试，因此可能放弃已完成注册的账号并换邮箱重开整轮。

该错误不表示邮箱无试用资格、AT 无效、验证码错误或账号被停用。原故障发生在读取 AT 之前，因此当时尚未完成资格检查，也尚未写入 Free。

## 修复

- 新增 `background/session-export-reader.js`，作为现有 Session 读取流程的恢复层，没有创建第二套账号或注册实现。
- 识别主 Frame 被替换、Frame 不存在、消息接收端不存在和消息通道关闭等 Chrome 生命周期错误。
- 每次恢复都会重新查询当前 ChatGPT/OpenAI 标签页，不复用已经失效的 Frame 或旧标签页快照。
- 最多原地恢复 3 次，恢复期间记录“重新定位当前标签页”的结构化警告；成功后继续原步骤 6，不重开注册流程。
- 普通 Session HTTP 失败、未登录和缺少 accessToken 不会被误判为 Frame 切换，不执行这类恢复。
- 三次恢复仍失败时返回 `CHATGPT_SESSION_FRAME_UNAVAILABLE`，标记为可人工恢复但不可整轮自动重试。
- 自动运行收到该错误后立即停止，保留当前账号现场，明确提示保持 ChatGPT 页面打开并重新执行步骤 6；即使开启“跳过失败”，也不会换邮箱重新注册。
- 中央页面通信错误分类同步识别 Frame 被移除，供其它已有页面通信路径使用。

## 回归覆盖

- `Frame with ID 0 was removed` 和 `No frame with id` 的分类。
- 旧 Frame 失败后重新解析到新标签页并成功读取 Session/AT。
- 真正的 Session/accessToken 错误只执行一次，不进行 Frame 恢复。
- 恢复耗尽后返回结构化人工恢复错误。
- 自动运行策略在“跳过失败”开启时仍停止，不选择新邮箱。
- 既有免 2FA 无资格终止、自定义邮箱池、自动运行恢复和发布包白名单行为保持不变。

## 验证

- 定向测试：17/17 通过。
- 完整单元测试：446/446 通过。
- 语法检查：386 个 tracked JavaScript 文件通过。
- 真实 MV3 E2E：1/1 通过，本机 Edge 成功加载 Service Worker 和 Sidepanel。
- Smoke、Removed Network、Phone/SMS 三项审计通过。
- Manifest/运行时引用由发布包白名单测试覆盖，新模块存在真实 `importScripts()` 调用方。
- 仅保留既有 `background.js` 超过 8000 行的非阻断警告；没有提高审计阈值。
- 未生成发布 ZIP，未修改 Manifest 版本号。
