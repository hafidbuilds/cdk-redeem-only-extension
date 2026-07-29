# CDK Redeem Only

Chrome Manifest V3 扩展，用于邮箱注册、验证码处理、GPT 密码与 2FA、Access Token 读取、试用资格检测，以及 UPI、IDEAL、PIX 三个独立渠道的 CDK 兑换和 Free/Plus 账号管理。

当前扩展版本：`2.3.0`。

## 文档入口

- [使用指南](docs/USER_GUIDE.md)：安装、配置、账号分组、导入导出、诊断和常见问题。
- [开发指南](docs/DEVELOPMENT.md)：架构、模块职责、测试、安全、文档维护和发布流程。
- [贡献说明](CONTRIBUTING.md)：提交改动和 Pull Request 的最小要求。
- [故障索引](docs/audit/issue-fix-index.md)：已确认问题、修复结论和详细档案。
- [变更记录](CHANGELOG.md)：历史版本说明。
- [安全策略](SECURITY.md) 与 [第三方许可](THIRD_PARTY_NOTICES.md)。

`CODEX_PROMPT_CURRENT_PROJECT_ONLY.md` 和 `CODEX_PROJECT_COMPLETION_EXECUTION_V2.md` 是工程补全任务的实施基线，保留用于审计和后续一致性检查，不作为普通用户教程。

## 安装

1. 从 GitHub Release 下载并解压扩展包，或使用当前源码目录进行开发调试。
2. 打开 `chrome://extensions/`。
3. 开启“开发者模式”。
4. 点击“加载已解压的扩展程序”，选择扩展目录。
5. 更新代码或替换文件后，在扩展管理页点击“重新加载”。

发布包不包含本地账号、密码、Access Token、Cookie、API Key、CDK 池、运行日志或浏览器配置。首次加载后需要在侧栏填写自己的配置。

## 核心规则

- 只有远端明确确认具备试用资格的账号才能进入 Free；网络错误、未知响应和缺失字段不能解释成 Free 或 Token 无效。
- UPI、IDEAL、PIX 的 CDK 池、失败次数、远端状态、Plus 归属和删除记录始终独立。
- CDK 请求发出后，如果远端结果未知，只允许查询原请求，不重新提交同一副作用。
- Free、各渠道 Plus、2FA 路线、免 2FA 路线和 Passkey 路线通过统一账号模型投影，不能维护两套长期分叉的数据。
- 主动停止应立即停止调度；故障恢复必须保留当前账号和页面现场，除非能够证明重新开始是安全的。
- 普通日志和普通配置导出必须脱敏；敏感备份需要用户明确确认。

完整流程和字段说明见 [使用指南](docs/USER_GUIDE.md)。

## 开发验证

```powershell
npm ci
npm run syntax
npm test
npm run audit
npm run e2e
npm run check
```

`npm run e2e` 使用独立 Chrome for Testing 和临时 Profile，不连接用户日常 Chrome。隔离浏览器选择、验证结果和接入边界见 [开发指南](docs/DEVELOPMENT.md#浏览器-e2e)。

仅在准备发布时运行：

```powershell
npm run package
```

打包脚本只从 Git 受控的运行时白名单生成脱敏 ZIP；开发文档、测试、本地配置、日志和发布目录不会进入扩展包。
