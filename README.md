# CDK Redeem Only

这是 CDK 兑换专用版 Chrome 扩展。当前版本保留邮箱注册、邮箱验证码、设置 GPT 密码、第 7 步开通 2FA、读取 AT、试用资格检测、Free 共用分组、UPI/IDEAL/PIX 独立 CDK 池及 Plus 分组、CDK 兑换、Plus 识别/验证、导入导出。

## 教程文档

- GitHub 首页可直接打开：[教程.docx](教程.docx)
- Release 下载页也提供同一份教程：[tutorial.docx](https://github.com/kui123456789/cdk-redeem-only-extension/releases/latest/download/tutorial.docx)

完整配置说明见 [docs/CONFIG-USAGE.md](docs/CONFIG-USAGE.md)。

## 保留能力

- 自动注册邮箱账号并读取邮箱验证码。
- 设置 GPT 登录密码。
- 第 7 步开通 TOTP 2FA、读取 access token、检测是否有试用资格。
- 资格通过后保存到 Free 组；有可用 CDK 时主流程可自动提交兑换。
- Free 组导入、导出、补充 AT、一键识别 Plus、一键兑换 UPI/IDEAL/PIX、一键兑换全部。
- UPI、IDEAL 和 PIX CDK 池分开导入、删除、启用、刷新状态。
- 远端兑换成功并确认会员后，按兑换渠道移动到 UPI Plus 或 IDEAL Plus。
- Plus 组验证、导出、删除。
- 单账号登录、手动移动 Free/Plus 分组。

## 已移除

- 旧支付流程 流程。
- 旧外部钱包支付流程。
- 旧网络切换配置和切换模块。
- 旧手机验证模块。
- 本地支付 helper、支付转换网络切换和相关隐藏 UI。

邮箱验证码能力保留，因为注册和设置 GPT 密码仍需要邮箱取码。

## 安装

1. 打开 Chrome：`chrome://extensions/`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目目录，或选择脱敏发布包解压后的目录。
5. 修改代码或更新包后，回到扩展管理页点击“重新加载”。

## 必填配置

侧栏中需要填写：

- `UPI Key`：后端提供的 `X-External-Api-Key`，不要加 `Bearer`。
- `UPI Client ID`：可留空，扩展会自动生成并保存到本地。
- `UPI 卡密池` / `IDEAL 卡密池` / `PIX 卡密池`：一行一个 CDK；三个池互不影响，导入后会按对应渠道续兑符合条件的 Free 候选。
- `兑换轮数`：首轮结束后，失败账号继续进行的轮数；`0` 表示只跑首轮，同一轮每个账号只尝试一张 CDK。

默认远端：

- 兑换接口：`https://chong.nerver.cc/api/external/cdkey-redeems`
- 资格/会员查询：`https://cha.nerver.cc`

## 主流程

当前自动注册主流程只有 7 步：

1. 导入或获取注册邮箱。
2. 打开 ChatGPT 官网并提交邮箱。
3. 设置注册密码。
4. 读取并提交邮箱验证码。
5. 填写资料。
6. 等待注册完成。
7. 开通 2FA、读取 AT、检测 UPI 试用资格。

第 7 步必须确认有试用资格后才进入 Free 组。进入 Free 后，如果对应渠道有可用 CDK，主流程会自动提交兑换；远端等待中的 CDK 状态按 5 秒节奏刷新，只同步状态和失败次数。

## 任务与恢复

自动注册、补充或刷新 AT、会员核验和手动 CDK 兑换会创建持久化任务。任务摘要保存在 `accountTasksV1`，按任务隔离的事件保存在 `accountTaskEventsV1`；账号记录面板可以查看状态、checkpoint、错误和事件，并可请求取消活动任务。

Service Worker 启动时会根据持久化 checkpoint 重建资源锁并分类恢复。尚未产生远端副作用的任务可安全恢复；远端请求已经发出或结果未知时只允许查询原请求，不会重新提交 CDK；无法证明安全性的任务进入中断或人工处理状态。任务、事件和普通日志使用同一脱敏器，不保存完整密码、AT、Cookie、2FA Secret、API Key、CDK 或邮件正文。

兑换副作用账本由 `background/external-effect-ledger.js` 单独拥有：`externalEffectsV1` 保存 `prepared`、`dispatched`、`acknowledged`、`unknown`、`confirmed`、`failed` 状态，`redeemAttemptsV1` 保存对应尝试的渠道和不可逆 CDK 指纹。UPI、IDEAL、PIX 使用独立的账号锁和 CDK 锁。启动恢复只从现有渠道 usage 找回本地 CDK 并调用已有远端状态刷新；成功或明确失败才终结任务并释放锁，仍不确定的结果进入 `manual_review` 并保持锁定。

邮箱 Provider 的统一字段定义、标准化、校验和脱敏集中在 `background/email/provider-registry.js`；Hotmail、2925、iCloud、Gmail 和自定义邮箱的专用管理器仍保持原有职责。验证码轮询在 `background/verification/mail-baseline.js` 中保存请求时间、账号/任务范围和邮件 ID/指纹消费标记，普通日志不保存完整邮件正文。

Sidepanel 账号行的补 AT、会员核验、UPI/IDEAL/PIX 兑换、导出、删除、重试和停止判断统一由 `sidepanel/membership-row-policy.js` 生成，返回稳定原因码和可读原因；显示模型把同一决策附在账号行上，渲染层不再复制资格判断。

配置导出默认使用 schemaVersion 2 的安全格式，字段级排除密码、AT、2FA Secret、Cookie、API Key 和完整 CDK；从旧版 schemaVersion 1 导入时会先幂等迁移，并在覆盖前把当前完整配置保存到受限的 `settingsImportBackupsV1`（最多 3 份）。配置菜单中的“导出敏感备份”必须二次确认，且导出文件明确标记 `exportMode: sensitive`。Service Worker 启动时将 `storage.session` 限制为 `TRUSTED_CONTEXTS`，Content Script 通过 Background 白名单消息获取最少必要数据。权限用途见 [docs/architecture/permission-map.md](docs/architecture/permission-map.md)。

独立 Provider 连接测试经过 `background/runtime/remote-operation-policy.js`：默认并发上限 3、可配置上限 5，带请求超时、有限指数抖动重试和 `Retry-After`；Provider 熔断状态按作用域持久化并与 UPI/IDEAL/PIX 渠道隔离。注册页面自动化和兑换提交仍保持串行，未知兑换结果不会由该策略重新提交。

## Free / Plus

Free 导出格式：

```text
邮箱---密码---2fa---at---时间戳
```

Plus 导出格式：

```text
邮箱----密码---2fa---时间戳
```

Free 组保存已确认有试用资格、但尚未确认 Plus 的账号。三个渠道分别使用自己的卡密池和候选状态；`一键兑换全部` 会先打开渠道选择弹窗，一次只执行用户选择的一个渠道。

远端兑换成功并确认会员后，对应 AT 的邮箱按兑换渠道进入 UPI Plus 或 IDEAL Plus。失败、取消、等待中的账号会保留在 Free，并记录原因和时间戳。

## 脱敏发布

对外发布时应使用脱敏包，排除本地密钥和运行数据：

- `manifest.json` 中的 `key`
- `config.json`
- `.git`
- `.codegraph`
- `_metadata`
- `release-artifacts`
- 本地日志、缓存和运行历史

## 开发验证

```powershell
npm ci
npm run syntax
npm test
npm run audit
npm run e2e
npm run check
npm run package
```

`npm run e2e` 使用本机 Microsoft Edge 以真实 MV3 Service Worker 加载未打包扩展，验证 sidepanel、设置消息保存/恢复、账号区域和任务区域。没有可用 Edge 时，该门禁应明确记录为环境阻塞，不得用固定成功替代。

`npm run package` 从 Git 受控的运行时白名单生成 `release-artifacts/cdk-redeem-only-extension-v<version>.zip`。压缩包不包含 Git 元数据、测试、文档、本地配置、账号运行历史、日志、备份或发布目录本身。

