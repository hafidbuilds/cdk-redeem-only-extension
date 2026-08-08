# Free Account Tool

Chrome Manifest V3 扩展，用于邮箱注册、验证码处理、GPT 密码与 2FA/Passkey、Access Token 管理，以及 Free 账号 GCash 资格检测。

当前扩展版本：`3.0.0`。

## 当前能力

- 完整 2FA、免 2FA Free 和 Passkey 三条注册路线，共用固定九步工作流。
- 账号结果只分为 `Free 组` 和 `无资格 Free 组`。
- `eligible`、`unknown`、`checking`、`failed` 留在 Free；只有服务端明确返回 `ineligible` 才进入无资格 Free。
- 支持账号导入、AT/完整 Session 可选的逐行 TXT 分组导出、删除、启停、登录、补充/刷新 AT、批量补充完整 Session、单个资格复检和批量资格复检。
- 两个 Free 分组都会统计缺 Session 的启用账号。批量补充任务逐账号登录并实时保存，可停止、可在 Service Worker 中断后继续，完成后由 Background 自动下载本任务成功账号的 Session TXT。
- 自动注册不再执行 GCash 资格请求。三条路线在第 9 步保存账号并以 `unknown` 进入 Free；资格服务、独立 Bearer 令牌和单个/批量复检能力继续保留，按需从账号面板手动运行。
- 自动注册运行时账号面板只允许查看和导出，避免导入、删除、登录、AT 修改或复检与正在运行的状态竞争。
- 启动状态消息不携带完整 Free 账号、规范账号或 Session 仓库；账号面板按需读取账号数据。旧版本若曾把运行状态误嵌套进 Free 账号行，重新加载扩展会自动压缩修复，同时保留密码、2FA/Passkey、AT、Session 和资格证据。
- 侧栏首屏提供公开在线工具入口：`GCash 资格查询`打开 `https://gcash.20000408.xyz/`，`CDK 兑换中心`打开 `https://cdk.334401.xyz/`。两个入口只负责新标签页跳转，不把账号凭据传给网站。

V3 已移除插件内置的 UPI、IDEAL、PIX 卡密池、CDK 兑换、兑换任务、Plus 分组及其后台接口。旧版数据会在首次启动时一次性迁移：保留账号身份、凭据、有效性和明确资格证据，删除 CDK、兑换和 Plus 分类数据。顶部的 CDK 入口仅跳转到独立公开网站，不恢复插件内兑换代码。

## 文档入口

- [使用指南](docs/USER_GUIDE.md)：安装、九步流程、两个 Free 分组、导入导出和资格复检。
- [开发指南](docs/DEVELOPMENT.md)：V3 架构、数据模型、迁移、测试、安全和发布流程。
- [贡献说明](CONTRIBUTING.md)：提交改动和 Pull Request 的最小要求。
- [故障索引](docs/audit/issue-fix-index.md)：已确认问题、修复结论和详细档案。
- [变更记录](CHANGELOG.md)：当前版本与历史版本说明。
- [安全策略](SECURITY.md) 与 [第三方许可](THIRD_PARTY_NOTICES.md)。

`CODEX_PROMPT_CURRENT_PROJECT_ONLY.md` 和 `CODEX_PROJECT_COMPLETION_EXECUTION_V2.md` 仅作为历史工程基线保留；当前行为以代码、测试和本页列出的当前文档为准。

## 安装

1. 从 Release 下载并解压扩展包，或使用当前源码目录进行开发调试。
2. 打开 `chrome://extensions/`。
3. 开启“开发者模式”。
4. 点击“加载已解压的扩展程序”，选择扩展目录。
5. 更新代码或替换文件后，在扩展管理页点击“重新加载”。

发布包不包含本地账号、密码、Access Token、Cookie、API Key、运行日志或浏览器配置。首次加载后需要在侧栏填写自己的邮箱 Provider 和运行配置。只有手动执行 GCash 资格复检时才需要填写资格服务提供的 GCash 授权令牌；它不是 ChatGPT AT，也不会进入安全配置导出。

## 核心规则

- 资格分组只由 `trialEligibilityStatus` 决定；`free-ineligible` 只是界面分组名，不是持久化账号状态。
- 第 9 步先把当前账号凭据、AT/Session 和 `trialEligibilityStatus=unknown` 写入账号生命周期与 `freeAccountResults`，再结束当前轮。自动注册不会访问 GCash 资格接口。
- Manifest 声明 `unlimitedStorage`，避免大量完整 Session、Free 结果和规范账号记录达到 `chrome.storage.local` 默认容量上限。最终保存节点若遇到存储配额错误，只重试当前节点，不会把免 2FA 路线回退到第 7 步。
- 手动资格复检向服务提交 ChatGPT AT 和 `check_gcash_pm=true`，并使用独立 Bearer 令牌。资格服务访问 OpenAI 时使用服务端配置的代理，不会自动继承指纹浏览器 Profile 的本地代理地址。
- 用户配置以 `chrome.storage.local` 为唯一权威来源；浏览器或 Service Worker 重启后，旧的 Session 运行快照不得覆盖已保存的路线、接口、等待时间和邮箱 Provider。流程节点等短期状态继续保存在 Session。
- 侧栏“保存”按钮和设置区通用变更事件都会进入同一串行保存队列；首次打开或重载侧栏时，已保存的自动重试、延迟、线程间隔、Cookie 清理和授权超时设置必须回填到控件，不能只存在于 Background 状态中。
- 高频日志和普通设置更新只读写实际需要的 Session 字段，不加载完整账号结果，也不重复写入整份运行态；这可降低账号较多时在资源受限指纹浏览器中的卡顿和存储压力。
- 手动运行免 2FA 路线时，未触发 TOTP 挑战的第 4 步属于非阻塞条件节点；前面注册节点已完成或跳过后可以直接点击第 9 步保存 Free 账号。Background 会先把未使用的第 4 步记为跳过。真实 TOTP 挑战仍必须先完成第 4 步。
- 明确无资格会排除当前邮箱并结束本轮；临时失败保持在 Free，继续遵守有限重试策略。
- 账号有效性与资格状态相互独立；已停用或无效账号不会因 V3 迁移恢复启用。
- 普通日志和安全配置导出必须排除 AT、完整 Session 等敏感凭据；敏感备份需要用户明确确认。
- Session 补充任务只在任务数据中保存邮箱清单、索引和数量；密码、2FA、验证码、Cookie、AT 与 Session 不进入任务仓库或事件日志。

## 开发验证

```powershell
npm ci
npm run syntax
npm test
npm run docs:check
npm run audit
npm run e2e
```

`npm run e2e` 使用独立 Chrome for Testing 和临时 Profile，不连接用户日常 Chrome。隔离浏览器边界见 [开发指南](docs/DEVELOPMENT.md#浏览器-e2e)。

仅在准备发布时运行：

```powershell
npm run package
```

打包脚本只收集运行时白名单文件；开发文档、测试、本地配置、日志和发布目录不会进入扩展包。
