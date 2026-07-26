# 开发指南

本文档是当前项目的开发入口。执行自动化开发时还必须遵守根目录 [AGENTS.md](../AGENTS.md)。

## 文档优先级

1. 当前仓库中的真实代码、目录、测试和审计结果。
2. [CODEX_PROMPT_CURRENT_PROJECT_ONLY.md](../CODEX_PROMPT_CURRENT_PROJECT_ONLY.md)。
3. [CODEX_PROJECT_COMPLETION_EXECUTION_V2.md](../CODEX_PROJECT_COMPLETION_EXECUTION_V2.md)。
4. 本开发指南、[使用指南](USER_GUIDE.md) 和当前故障档案。
5. `docs/history/` 中的历史计划仅用于追溯，不能覆盖当前实现。

不要为了匹配理想文件名建立第二套项目、搬迁整个目录或引入必须运行的独立服务。存在近似模块时优先扩展或拆分现有模块。

## 项目结构

| 路径 | 职责 |
| --- | --- |
| `manifest.json` | MV3 权限、Content Script、Side Panel 和 Service Worker 入口 |
| `background.js` | Service Worker 装载和启动入口 |
| `background/` | 任务、流程步骤、账号仓库、Provider、会员核验、兑换及远端策略 |
| `background/steps/` | 注册、密码、2FA/Passkey、AT 和兑换步骤 |
| `background/membership/` | Free/Plus 投影、导入导出、会员与兑换服务 |
| `background/routes/`、`background/router/` | 消息路由和分组处理器 |
| `content/` | OpenAI/Auth/iCloud 等页面中的 DOM 自动化和恢复 |
| `sidepanel/` | 操作界面、账号记录、设置和工作流状态 |
| `shared/` | Background 与 Side Panel 共用的格式、状态和 API 工具 |
| `scripts/` | Node 单测、语法检查、审计、E2E 和发布工具 |
| `docs/audit/` | 当前故障索引、月度修复档案和工程验收归档 |
| `docs/history/` | 已完成实施计划和设计历史，不作为当前需求 |

### 关键模块

- `background/account-repository.js` 是统一账号数据的唯一写入口，兼容层只能投影和迁移。
- `background/task-*`、任务仓库和事件存储负责 checkpoint、恢复、取消和资源锁。
- `background/external-effect-ledger.js` 记录不可逆外部副作用；远端未知状态保持 query-only。
- `background/email/provider-registry.js` 负责 Provider Definition、标准化、校验和脱敏。
- `background/verification/mail-baseline.js` 负责验证码新邮件基线及已消费邮件标记。
- `content/signup-page.js` 是认证页面主入口，复杂逻辑应拆入同目录现有辅助模块。
- `sidepanel/account-records-manager.js` 是账号面板编排层，渲染、策略和副作用分别保留在现有子模块。
- `sidepanel/membership-row-policy.js` 统一账号行的可用操作和稳定原因码。
- `sidepanel/failure-diagnostics.js` 生成有界且脱敏的最近失败诊断。

新增浏览器全局模块时，必须更新真实加载顺序、Manifest/HTML 引用、静态审计和对应 Node 测试。

## 不可回归规则

- UPI、IDEAL、PIX 的池、usage、失败、每日限制、Plus 归属、锁和 tombstone 独立。
- 只有明确资格结果才能进入 Free；缺失、未知、超时和网络错误保持失败或未知语义。
- CDK 请求发出但结果未知时不得重新提交，也不得自动换 AT、CDK 或渠道。
- Access Token 仅在明确认证失效时标记无效；普通网络错误保留当前 Token。
- 统一账号模型必须兼容 2FA、免 2FA、Passkey 和旧导入格式，不删除旧数据简化迁移。
- 主动停止不继续调度和日志回放；恢复必须遵循同一任务 checkpoint 和有限次数。
- Content Script 不能直接读取高敏存储；通过 Background 白名单消息获取最少数据。
- 日志、任务事件、普通配置导出和诊断必须经过共享脱敏器。
- 页面控件定位应从精确叶子文本向可点击祖先收敛，并保留普通容器的事件冒泡兼容；不得用包含相邻设置项的大段父容器文本替代精确语义。
- 页面操作“未找到入口”和“已经点击但导航仍在进行”必须使用不同状态；后者先在当前执行实例和标签页复核目标状态，确认超时后才能消耗受限恢复次数。
- 页面路由已明确进入目标状态、但目标 DOM 尚未挂载时，只能在路由、工作流状态和缺失目标错误同时匹配后进入有界渲染等待。步骤 4 的 75 秒预算耗尽后可使用现有 MV3 Alarm 最多 3 次续等，但必须以 `mode: continue` 保留同一尝试并从 `fetch-signup-code` 恢复；不得重置 `open-chatgpt`、清 Cookie、换邮箱或无限等待，耗尽后保持未知结果并停止。
- 步骤 5 的页面导航完成信号可能早于 React 重建资料表单。完成信号必须携带本轮临时资料草稿供后台复核使用；复核发现字段被清空时先调用现有 `refillProfileTextFields()`，字段完整后才能受限重提，禁止空表单提交和整轮注册重开。
- 第 6 步在 `#settings/Security` 缺少 Password DOM 时必须先同页复核，不能用 `reloadIfSameUrl` 反复重置 React 渲染时间；同页预算耗尽后才允许进入现有的同账号有限重启。
- 失败诊断优先选择当前运行直接错误，历史“快照”日志只能作为没有直接错误时的兜底锚点。

## 开发流程

1. 阅读 `AGENTS.md`、相关当前文档和真实调用代码。
2. 检查 `git status --short --branch`，识别并保留用户已有改动。
3. 使用 CodeGraph 定位调用链；不存在索引时再使用 `rg`。
4. 先写或补定向回归，再做最小职责范围内的实现。
5. 检查 Manifest/HTML 加载顺序、存储迁移、错误状态和恢复边界。
6. 运行定向测试及完整门禁，记录真实数量和失败原因。
7. 更新 [使用指南](USER_GUIDE.md)、本开发指南或故障档案中真正受影响的部分。
8. 检查 diff 和敏感数据，再创建行为明确的独立提交。

不要删除失败测试、固定返回成功、提高尺寸阈值绕过审计，或把未运行的真实 Provider 测试写成通过。

## 测试命令

```powershell
npm ci
npm run syntax
npm test
npm run audit
npm run e2e
npm run check
```

- 单测使用 `node:test` 和 `node:assert/strict`，文件位于 `scripts/test-*.cjs`。
- `npm run syntax` 检查受控 JavaScript 文件。
- `npm run audit` 检查 Manifest、加载顺序、敏感数据、移除功能残留和模块边界。
- 只改文档时可以不跑全量代码测试，但必须检查 Markdown 链接、乱码、敏感信息和 `git diff --check`。
- 业务代码、共享状态、存储、任务、兑换或工作流变更必须运行完整门禁。

### 浏览器 E2E

自动化 MV3 测试不得连接用户本地 Chrome、默认 `User Data`、登录 Profile、Cookie、历史记录或已安装扩展。

标准环境：

- Puppeteer 管理并固定 Chrome for Testing；
- 每次使用全新的临时 Profile；
- Windows 使用 `pipe: true`；
- 当前 Windows 测试机还需要 `--no-sandbox` 才能稳定建立扩展 Target；该参数只允许用于空临时 Profile 和本地 `chrome-extension://` 页面，不得用于外部网页自动化；
- 启动最多有限重试，耗尽后报告“测试基础设施失败”；
- 输出真实 `product/version`、可执行文件来源和 Profile 类型；
- Chrome for Testing、Google Chrome、Playwright Chromium 和 Edge 的结果必须分别命名。

最小 E2E 覆盖：

1. MV3 `background.js` Service Worker 启动；
2. Side Panel 渲染；
3. 设置、账号和任务控件存在；
4. Runtime 消息读写正常；
5. 使用页面内 Clipboard stub 验证诊断导出，不覆盖系统剪贴板；
6. 页面未出现未捕获脚本错误；
7. `finally` 关闭浏览器，并确认没有测试浏览器进程残留。

2026-07-26 已用 `puppeteer@25.3.0` 和隔离 Chrome for Testing `150.0.7871.24` 完成上述验证。默认 WebSocket 调试端口模式曾在 `Extensions.loadUnpacked` 时关闭 Target；Windows 上使用 `pipe: true` 和受限的 `--no-sandbox` 本地扩展测试后通过。该浏览器位于 Puppeteer 缓存，不属于扩展发布内容。

参考：

- [Puppeteer Chrome Extensions](https://pptr.dev/guides/chrome-extensions)
- [Chrome for Testing](https://developer.chrome.com/blog/chrome-for-testing/)
- [Chrome 扩展 E2E 指南](https://developer.chrome.com/docs/extensions/how-to/test/end-to-end-testing)
- [Playwright Chrome Extensions](https://playwright.dev/docs/chrome-extensions)

仓库的 `npm run e2e` 已使用 Puppeteer 管理的 Chrome for Testing。不得重新加入 Edge 或系统 Chrome 的静默回退；其他浏览器兼容测试必须使用单独命令并明确命名结果。

## Manifest 权限

| 权限 | 当前用途 |
| --- | --- |
| `sidePanel` | 扩展侧栏 |
| `alarms` | 自动运行、轮询和定时恢复 |
| `tabs`、`webNavigation` | 标签页和认证导航 |
| `declarativeNetRequest` | iCloud 请求规则 |
| `debugger` | 受控页面调试和 Passkey 登录辅助 |
| `browsingData`、`cookies` | 站点数据清理和会话操作 |
| `storage` | 设置、任务、事件和 checkpoint |
| `scripting` | 运行时注入现有 Content Script |
| `downloads` | 用户明确触发的账号和配置导出 |
| `activeTab`、Host 权限 | 当前页面及配置 Provider 的自动化 |

`storage.session` 仅允许可信扩展上下文访问。权限审计必须基于真实调用方；不得为了减少权限数量破坏当前邮箱、认证、Cookie、下载或兑换流程。

## 文档维护

当前文档分为三层：

- 当前入口：根目录文档、`docs/USER_GUIDE.md`、`docs/DEVELOPMENT.md`。
- 当前审计：`docs/audit/issue-fix-index.md`、月度故障档案和工程完成报告。
- 历史材料：`docs/history/`，只用于查证旧设计和实施过程。

确认并修复新问题时，在当月 `docs/audit/issue-fix-archive-YYYY-MM.md` 追加一个带稳定 HTML 锚点的完整记录，并同步更新索引。不要再为每个问题创建一个 Markdown 文件。

每条记录必须包含症状、脱敏证据、根因、真实调用链、实现、安全边界、定向及完整验证、提交或发布影响。历史记录只能追加或由新记录明确取代，不能静默删除。

Chrome 官方文档不再逐页存储在仓库；使用 `docs/chrome-extension-dev/README.md` 中的官方链接，需要离线副本时再显式运行下载脚本。

### 持续更新规则

文档和实现必须在同一个提交中更新，不能先合入代码、再依赖以后补文档。按变更影响选择唯一当前入口：

| 变化 | 必须更新 |
| --- | --- |
| 用户操作、配置、导入导出、可见错误或恢复方式 | `docs/USER_GUIDE.md` |
| 架构、模块职责、存储、工作流、Provider、权限、测试或发布流程 | `docs/DEVELOPMENT.md` |
| 已确认并修复的故障 | 当月故障档案和 `docs/audit/issue-fix-index.md` |
| Manifest 或发布版本 | `manifest.json`、界面版本和 `CHANGELOG.md` |
| 已完成或被取代的设计与实施方案 | 当月 `docs/history/` 合并归档 |

未实施的讨论方案优先放在 GitHub Issue 或 Pull Request，不在主分支新增一个长期存在的方案 Markdown。方案完成后，只把最终真实行为写入当前入口；设计过程按月归档。不得同时维护“旧方案说明”和“新功能说明”两套当前事实。

`npm run docs:check` 是强制门禁，检查：

1. Markdown 只能位于已定义的当前入口或按日期命名的归档中；
2. 已删除的旧文件名和目录不能重新出现；
3. 当前文档相对链接必须存在；
4. `CHANGELOG.md` 最新版本必须与 `manifest.json` 一致；
5. 历史归档必须明确声明当前代码和开发指南优先；
6. 故障索引必须指向真实归档锚点，归档记录也必须进入索引或显式说明豁免原因。

该命令已接入 `npm run audit`，而 `.github/workflows/ci.yml` 会在每次 push 和 Pull Request 中执行审计。确实需要新增文档类别时，应同时修改审计允许规则和本节，明确新类别的唯一职责；不要通过删除检查或扩大为任意 `docs/**/*.md` 来绕过门禁。

## 发布流程

发布只在用户明确要求时执行：

1. 同步 `manifest.json`、Side Panel 版本展示和 `CHANGELOG.md`。
2. 运行 `npm ci`、`npm run check` 和符合本指南的隔离浏览器 E2E。
3. 检查 Git diff、Manifest 引用和敏感数据。
4. 运行 `npm run package` 生成脱敏 ZIP。
5. 解压检查运行时文件齐全，开发文档和本地数据未进入包。
6. 创建发布提交和带注释 Tag，并推送当前分支和 Tag。
7. 创建公开 GitHub Release，上传 ZIP，记录 SHA-256。
8. 通过 GitHub API 再次确认 Release、Tag、资产、版本号和下载地址。

只推送分支不等于完成发布。不得手工压缩工作目录作为公开资产。

## 历史计划

已完成的实施计划和设计稿按日期合并保存在 `docs/history/`。它们可能包含当时的路径、模块名和阶段性判断，阅读时必须以当前代码和本指南为准。
