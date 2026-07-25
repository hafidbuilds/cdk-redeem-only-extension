# 步骤 6 安全设置页 interactive 误判

## 故障现象

账号注册和资料提交已经完成，步骤 6 打开 `https://chatgpt.com/#settings/Security` 后，页面长期保持 `document.readyState=interactive`。插件等待 30 秒后报“ChatGPT 安全设置页长时间未完成加载”，并把错误当作普通失败，从步骤 1 开始整轮重试。

脱敏诊断同时显示：步骤 1 至 5 已完成，失败发生在 `set-gpt-password`；停止前页面仍可访问，没有验证码输入错误、账号停用或诊断采集错误。

## 根因

`startSetGptPasswordResetFlow()` 在查询密码入口前，先调用 `waitForDocumentLoadComplete()`，硬性要求安全设置页达到 `readyState=complete`。

ChatGPT 设置页是动态页面，关键控件可以在 `interactive` 状态下已经可用，而部分资源可能使 `complete` 长时间不出现。这道硬门槛会阻止后续既有的密码入口和安全导航轮询，并抛出未结构化的普通错误，最终触发整轮注册重试。

## 修复实现

- 移除安全设置页专用的 `readyState=complete` 前置硬门槛。
- 继续复用 `waitForChatGptSettingsPasswordAction(25000)`，按可见、启用的密码入口或安全设置导航判断页面是否可操作。
- 页面处于 `interactive` 且关键控件已出现时直接继续步骤 6。
- 关键控件确实未出现时返回既有 `resetEntryMissing` 结构化结果，由后台使用同一账号限次重启步骤 6。
- 恢复耗尽后仍按既有保护停止当前轮，不返回步骤 1，不清理当前账号现场，也不重新注册邮箱。

## 安全与兼容边界

- 不改变步骤 1 至 5、验证码、账号、AT、Free/Plus、UPI、IDEAL、PIX 或 CDK 行为。
- 不固定返回成功；必须找到真实可操作的密码入口，或者进入既有受限恢复。
- 不删除账号或历史数据，不修改 Manifest、版本号或权限，不生成发布包。
- `content/signup-page.js` 从 6999 行降至 6998 行，没有提高 7000 行审计阈值。

## 回归覆盖

- 新增测试确认 `startSetGptPasswordResetFlow()` 不再调用 `waitForDocumentLoadComplete()`。
- 新增测试确认该流程仍调用密码入口轮询并保留 `resetEntryMissing` 结果。
- 既有测试确认缺少入口时使用同一邮箱重启步骤 6，不打开无状态新密码 URL。
- 既有测试确认步骤 6 恢复次数受限，耗尽后停止且不重启注册轮。

## 验证结果

- 定向测试：`17/17` 通过。
- 完整单元测试：`466/466` 通过。
- 语法检查：`389` 个 Git 跟踪的 JavaScript 文件通过。
- MV3 E2E：`1/1` 通过，扩展与 Sidepanel 成功加载。
- Smoke、Removed Network、Phone/SMS 三项审计通过；仅保留既有 `background.js` 超过 8000 行的非阻断警告。
- Manifest 引用：`41` 个引用、`25` 个唯一文件、`0` 缺失。
- 差异敏感数据扫描：`0` 个凭证形态命中。
- `git diff --check` 通过。

## 提交与发布影响

本修复使用独立本地 Git 提交，不打包、不修改版本号、不推送远端。
