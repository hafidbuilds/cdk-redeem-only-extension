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
npm run check
npm run package
```

`npm run package` 从 Git 受控的运行时白名单生成 `release-artifacts/cdk-redeem-only-extension-v<version>.zip`。压缩包不包含 Git 元数据、测试、文档、本地配置、账号运行历史、日志、备份或发布目录本身。

