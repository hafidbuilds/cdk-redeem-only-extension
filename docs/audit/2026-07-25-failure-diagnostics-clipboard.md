# 最近失败诊断剪贴板导出

日期：2026-07-25

## 实现

- 顶部“配置”菜单新增“导出最近一次失败诊断”。
- 点击后读取当前持久化日志，定位最近一条错误或失败消息，并保留其前后各 100 条日志。
- 读取活动标签页 URL，并通过现有 `GET_LOGIN_AUTH_STATE` 内容脚本消息获取认证页面和验证码输入框状态。
- 内容脚本不可用时仍导出日志、工作流状态、当前 URL 和脱敏后的探测错误。
- 诊断以 schemaVersion 1 的 JSON 直接写入剪贴板，不创建本地文件；成功后提示“已导出至剪贴板”。

## 安全边界

- 诊断只选择必要的日志、工作流和页面布尔状态，不序列化完整 Background State 或 DOM。
- 日志和页面错误再次脱敏验证码、密码、AT/JWT、Bearer Token、Cookie、2FA、API Key、CDK、长 Token 和完整邮箱。
- URL 查询参数值全部替换为 `[REDACTED]`，包含敏感参数的 Hash 不保留原值。
- 功能复用现有用户点击触发的 Clipboard API，没有新增 Manifest 权限。

## 验证

- 定向测试：7/7 通过，覆盖 201 条日志窗口、敏感信息脱敏、剪贴板内容和成功提示。
- 完整单元测试：419/419 通过。
- E2E：1/1 通过；真实点击菜单按钮、截获剪贴板 JSON、解析 schema 并验证成功 Toast。
- 语法检查：382 个 tracked JavaScript 文件通过。
- 审计：Smoke、Removed Network、Phone/SMS 均通过；仅保留既有 `background.js` 15243 行体积警告。
- Manifest：34 个引用，0 个缺失。
- CodeGraph：384 个文件、6899 个节点、26827 条边，索引 up to date。
- 本阶段不生成发布 ZIP。
