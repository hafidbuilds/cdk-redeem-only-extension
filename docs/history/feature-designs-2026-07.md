# 功能设计归档：2026-07

本文件保存免 2FA、Free 导出和 PIX 渠道的历史设计稿。当前实现及兼容规则以代码、测试和开发指南为准。

## 目录

- [免 2FA Free 路线设计](#2026-07-05-no-2fa-free-route-design)
- [Free 导出取件地址开关设计](#2026-07-10-free-export-verification-url-toggle-design)
- [PIX 兑换渠道设计](#2026-07-17-pix-redeem-channel-design)

---

<a id="2026-07-05-no-2fa-free-route-design"></a>

<!-- archived-from: docs/superpowers/specs/2026-07-05-no-2fa-free-route-design.md -->

## 免 2FA Free 路线设计

### 背景

当前主流程在第 5 步完成资料页后，继续执行第 6 步设置 GPT 登录密码，并在第 7 步通过 Nerver API 开通 TOTP 2FA、检测 UPI 试用资格，资格通过后写入 Free 组。

由于官网 2FA 开通链路当前不可用，需要保留原完整路线，同时新增一条免 2FA 路线：注册资料页完成后，不再强制设置 GPT 密码或开通 2FA，而是保存邮箱、邮箱取码链接和 AT，检测有试用资格后直接进入 Free 组。

### 目标

- 保留原 `完整 2FA 路线`，旧流程仍可使用。
- 新增 `免 2FA Free 路线`，由侧边栏开关选择。
- 免 2FA 路线必须检测 UPI 试用资格，通过后才写入 Free。
- 免 2FA Free 账号可参与 Free 组刷新、导出和 UPI/IDEAL 兑换。
- 免 2FA Free 导出支持 `邮箱---邮箱获取验证码链接---AT---时间戳`。

### 非目标

- 不绕过 OpenAI、Nerver 或任何外部服务限制。
- 不删除完整 2FA 路线。
- 不改变 UPI/IDEAL 卡密池、Plus 分组和失败次数策略。
- 不把无资格账号写入 Free。
- 不要求免 2FA 账号具备 GPT 密码或 TOTP secret。

### 流程模式

侧边栏新增主流程路线选择：

- `完整 2FA 路线`
  - 第 5 步资料页完成。
  - 第 6 步设置 GPT 登录密码。
  - 第 7 步开通 TOTP 2FA。
  - 检测 UPI 试用资格。
  - 资格通过后写入 Free。

- `免 2FA Free 路线`
  - 第 5 步资料页完成。
  - 读取当前账号邮箱。
  - 保存邮箱取码链接。
  - 读取并保存 AT。
  - 检测 UPI 试用资格。
  - 资格通过后写入 Free。
  - 跳过第 6 步设置 GPT 密码和第 7 步开通 TOTP 2FA。

### Free 记录字段

免 2FA 路线写入 Free 时，应保存以下核心字段：

```text
email
verificationUrl
accessToken
recordedAt
planType=free
status=free
trialEligible=true
twoFactorEnabled=false
gptPassword=''
totpSecret=''
```

兼容字段要求：

- `accessToken` 必须保留，兑换和刷新会员状态依赖 AT。
- `verificationUrl` 必须保留，用于导出和后续人工取码。
- `recordedAt` 必须保留，使用写入/捕获这条免 2FA Free 记录时的 Unix epoch 毫秒时间戳。
- `password` / `gptPassword` 可以为空。
- `totpSecret` 可以为空。
- 不因缺少 2FA secret 而从 Free 组隐藏。
- 缺 AT 的账号不能进入一键兑换候选。

### 导出格式

Free 导出需要兼容免 2FA 格式：

```text
邮箱---邮箱获取验证码链接---AT---时间戳
```

导出规则：

- 如果 Free 账号来自免 2FA 路线，并且有 `email`、`verificationUrl`、`accessToken`，导出四段格式。
- 第四段时间戳优先使用该账号记录的 `recordedAt`，缺失时使用账号写入 Free 时的当前 Unix epoch 毫秒。
- 如果账号有旧格式需要的密码、2FA 或其它字段，继续保留现有导出兼容逻辑。
- 导入配置时不能因为缺密码或缺 2FA secret 丢弃免 2FA Free 账号。

### 资格检测规则

两条路线都必须遵守相同的资格规则：

- 有 UPI 试用资格：写入 Free。
- 明确无资格：不写入 Free，并记录失败原因。
- 资格接口临时失败：不写入 Free，保留失败原因，避免污染 Free 池。
- 用户停止：不写入 Free，不继续后续步骤。

### UI 行为

- 侧边栏提供路线选择，推荐文案：
  - `完整 2FA 路线`
  - `免 2FA Free 路线`
- 默认值建议保持 `完整 2FA 路线`，避免旧用户升级后行为突变。
- 免 2FA 路线运行时，流程列表中第 6/7 步应显示为跳过或已按免 2FA 路线完成，日志必须说明原因。
- 日志示例：
  - `免 2FA Free 路线：第 5 步完成，开始读取邮箱、取码链接和 AT。`
  - `免 2FA Free 路线：已检测到 UPI 试用资格，写入 Free。`
  - `免 2FA Free 路线：账号缺 AT，未进入 Free。`

### 错误处理

- 拿不到当前邮箱：当前轮失败。
- 拿不到邮箱取码链接：当前轮失败或标记为缺少取码链接，不写入可导出的免 2FA Free。
- 拿不到 AT：当前轮失败或进入缺 AT 状态，不进入一键兑换候选。
- 资格检测失败：不写入 Free。
- 资格接口临时异常：记录原因，不写入 Free。
- 用户停止：停止当前轮，不写入 Free。

### 测试场景

- 完整 2FA 路线仍执行第 6 步和第 7 步，行为不变。
- 免 2FA Free 路线在第 5 步后跳过设置 GPT 密码和开通 2FA。
- 免 2FA Free 路线有资格才进入 Free。
- 免 2FA Free 账号缺 AT 时不进入一键兑换候选。
- 免 2FA Free 账号可以刷新邮箱状态。
- 免 2FA Free 账号可以参与 UPI/IDEAL 兑换。
- Free 导出能输出 `邮箱---邮箱获取验证码链接---AT---时间戳`。
- 导入包含免 2FA Free 账号的配置后，账号不会因为缺密码或缺 2FA secret 消失。

### 发布说明

实现完成后应更新：

- `manifest.json` 版本号。
- `sidepanel/sidepanel.html` 标题。
- `Release.md`。
- GitHub Release 下载包。

更新后用户需要在浏览器扩展管理页重新加载扩展。

---

<a id="2026-07-10-free-export-verification-url-toggle-design"></a>

<!-- archived-from: docs/superpowers/specs/2026-07-10-free-export-verification-url-toggle-design.md -->

## Free 导出取件地址开关设计

### 目标

在账号结果面板的 Free 组操作区增加“取件地址”按钮，让用户决定 Free TXT 导出是否包含邮箱取件地址。按钮默认开启，并在侧边栏刷新、扩展重载后保留上次选择。该设置只改变导出文本，不删除或修改账号记录中已保存的取件地址。

### 用户界面

按钮放在“导出 Free”旁，使用现有小型按钮样式和激活态：

- 开启：`取件地址：开`，带 `is-active` 和 `aria-pressed="true"`。
- 关闭：`取件地址：关`，移除激活态并设置 `aria-pressed="false"`。

按钮在 Free 组可见，不影响 Plus 导出。状态以字符串布尔值保存在 `localStorage` 键 `upiFreeExportIncludeVerificationUrl`；只有值严格等于 `false` 时关闭，其余缺失、损坏或未知值都回退为开启。切换按钮只更新偏好并重新渲染，不触发后台保存账号数据。

### 导出格式

开启时保持 V1.0.10 现有格式：

```text
2FA：邮箱---密码---2FA密钥---邮箱取件地址---AT---时间
Passkey：邮箱---密码---PASSKEY:credentialId---邮箱取件地址---AT---时间
免2FA：邮箱---邮箱取件地址---AT---时间
```

关闭时输出：

```text
2FA：邮箱---密码---2FA密钥---AT---时间
Passkey：邮箱---密码---PASSKEY:credentialId---AT---时间
免2FA：邮箱---AT---时间
```

导出请求新增布尔参数 `includeVerificationUrl`。参数缺失时按 `true` 处理，保证旧调用方和旧界面行为不变。后台结果导出服务将该参数传入统一凭据格式化模块，不在前端下载前二次修改文本。

当关闭取件地址且导出内容全部为免 2FA 行时，文件名前缀使用 `upi-membership-free-email-at`；开启时继续使用 `upi-membership-free-email-url-at`。

### 导入兼容

共享解析器新增三字段免 2FA 格式：`邮箱---AT---时间`。仅当字段数等于 3 且第三字段可识别为时间时，才按免 2FA 解析，避免把普通 `邮箱---密码---2FA密钥` 误判为免 2FA。

现有六字段/五字段 2FA、Passkey，以及四字段免 2FA 格式继续兼容。导入后没有取件地址的账号保留空 `verificationUrl`，不会伪造链接。

### 模块边界

- 新增小型 Free 导出偏好模块，负责读取、写入和切换 `includeVerificationUrl`。
- Free 结果渲染器只负责展示按钮当前状态。
- 面板事件模块只负责接收点击并调用切换函数。
- 结果导出操作把当前偏好写入后台消息 payload。
- 后台导出服务和结果格式化模块负责最终文本及文件名。
- 共享凭据格式模块负责格式输出和三字段免 2FA 解析。

### 错误处理

`localStorage` 不可用、键值损坏或不存在时默认开启。后台收到非布尔值时也默认开启。关闭取件地址不会放宽 Free 账号原有可导出条件：免 2FA 账号仍必须有邮箱和 AT；2FA/Passkey 账号仍按现有凭据完整性规则筛选。

### 测试

- 偏好模块：默认开启、保存关闭、重载恢复、损坏值回退。
- 渲染器与事件：按钮文案、激活态、`aria-pressed` 和点击切换。
- 导出操作：Free payload 正确携带 `includeVerificationUrl`，Plus 导出不受影响。
- 格式化：三条路线在开/关状态下输出正确列数。
- 解析：`邮箱---AT---时间` 可回导，且不会误判三字段 2FA 备份。
- 后台服务：关闭时文件名与内容一致，参数缺失时保持旧格式。
- 完整运行现有 `node --test scripts/test-*.cjs` 和静态审计。

---

<a id="2026-07-17-pix-redeem-channel-design"></a>

<!-- archived-from: docs/superpowers/specs/2026-07-17-pix-redeem-channel-design.md -->

## PIX 兑换渠道设计

日期：2026-07-17

### 目标

在现有 UPI、IDEAL 兑换能力之外新增独立的 PIX 渠道，并让 PIX 完整具备卡密池管理、Free 账号兑换、远端状态刷新、任务取消/重试、失败状态记录、会员结果分组和导出删除能力。

“一键兑换全部”不再固定按 UPI 再 IDEAL 的顺序执行。用户点击后先选择一个卡密池，本次批量兑换只使用所选渠道。

### 用户界面

#### 卡密池设置

在 UPI 和 IDEAL 卡密池之后新增 PIX 卡密池面板，结构和能力保持一致：

- PIX 卡密输入框；
- 导入 PIX；
- 一键删除；
- 总数、已用、可用数量摘要；
- 单条启用/停用、删除、标记可用、取消和重试；
- PIX 卡密远端状态列表；
- “刷新全部状态”同时覆盖 UPI、IDEAL、PIX。

#### Free 账号操作

Free 组增加以下信息和操作：

- PIX 候选数量；
- PIX 可用卡密数量；
- “一键兑换 PIX”按钮；
- “一键兑换全部”继续保留，但改为渠道选择入口。

点击“一键兑换全部”后复用现有 Action Modal，标题为“选择卡密池”。弹框显示三个直接操作按钮：

- `UPI（可兑换 N）`；
- `IDEAL（可兑换 N）`；
- `PIX（可兑换 N）`。

弹框正文同时显示各渠道的可用卡密数和候选账号数。没有可用卡密或没有候选账号的渠道按钮置为禁用。用户点击关闭按钮时取消操作，不启动兑换。

用户选定渠道后，系统重新读取最新账号结果和卡密池状态，避免弹框打开期间状态变化导致使用过期数量。如果此时已无可兑换账号或卡密，显示提示并结束。

本次“一键兑换全部”只运行用户选择的渠道，不自动切换或接力其他渠道。现有独立 UPI、IDEAL 操作保持原有行为，另新增独立 PIX 操作。

#### 会员结果

新增 PIX Plus 分组，并与现有分组能力一致：

- 顶部“有会员”统计包含 PIX Plus；
- 增加 PIX Plus 账号列表；
- 支持导出 PIX Plus；
- 支持删除 PIX Plus；
- “导出全部 Plus”和全部会员验证包含 PIX Plus；
- 行内渠道标签、兑换状态、CDK、取消和删除动作正确显示 PIX。

内部会员分组值使用 `pix-plus`，界面区块和导出筛选值使用 `paid-pix`。

### 渠道模型和状态

共享渠道规范化逻辑支持三个明确值：`upi`、`ideal`、`pix`。未知值继续回退到 `upi`，保持旧数据兼容。

渠道标签映射为 UPI、IDEAL、PIX。所有原先使用 UPI/IDEAL 二选一判断或 `['upi', 'ideal']` 列表的代码改为显式三渠道映射或共享渠道列表，避免 PIX 被错误归入 UPI。

PIX 使用独立状态字段：

- `pixChannelRedeemCdkeyPoolText`；
- `pixChannelRedeemCdkeyUsage`；
- `pixRedeemFailureCount`；
- `pixRedeemDailyLimitBlockedAt`；
- `pixRedeemDailyLimitBlockedUntil`；
- `pixRedeemDailyLimitReason`；
- `pixChannelEligibilityStatus`；
- `pixChannelEligibilityReason`。

PIX 卡密池和使用记录不得读取或写入 UPI、IDEAL 的状态字段。

资格检查响应按现有 UPI、IDEAL 的解析方式增加 PIX 分支，读取 PIX 渠道状态和原因；当后端没有返回 PIX 专属资格字段时，沿用现有兼容规则，将其视为未知状态并允许进入后续兑换检查。

PIX 的普通失败采用现有非 UPI 渠道的三次失败上限，仅阻止继续使用 PIX。现有 IDEAL 三次失败导致账号封存的规则保持不变；明确的跨地区支付不可用错误仍按现有规则全局封存账号。本功能不改变既有 UPI、IDEAL 失败策略。

### 旧数据兼容

仓库当前把以下 `pixRedeem*` 字段作为旧版 UPI 名称：

- `pixRedeemCdkeyPoolText`；
- `pixRedeemCdkeyUsage`；
- `pixRedeemApiBaseUrl`；
- `pixRedeemExternalApiKey`；
- `pixRedeemClientId`；
- 其他旧版 PIX/UPI 设置别名。

这些旧字段继续只作为 UPI 兼容输入，不能重新解释为新 PIX 渠道数据，否则旧设置备份会把 UPI 卡密误导入 PIX。

新 PIX 因此使用 `pixChannelRedeem*` 作为卡密池和使用记录的规范字段。设置导入导出同时保留旧 UPI 兼容行为，并显式导入导出新 PIX 字段。旧字段读取后仍规范化到 UPI；新 PIX 数据只从新字段读取。

现有 `plusPaymentMethod: "pix"` 到 UPI 的旧兼容规则不属于本次兑换渠道选择，不做修改。兑换 API 请求中的 `redeemChannel: "pix"` 和 `channel: "pix"` 才表示新 PIX 渠道。

### 后台兑换流程

PIX 复用现有兑换 API 地址、External API Key 和 Client ID，不新增独立服务器配置。提交兑换时请求体传递：

```json
{
  "channel": "pix"
}
```

兑换执行器根据渠道读取独立卡密池和使用记录，保存远端状态时写回同一渠道。批量兑换消息继续使用现有消息类型，并在 payload 中传递 `channel: "pix"`。

“一键兑换全部”的执行函数接收用户选择的渠道，并完成以下流程：

1. 检查当前是否已有核验或兑换任务；
2. 计算三个渠道的最新候选数和可用卡密数；
3. 打开渠道选择弹框；
4. 用户选择后重新读取最新状态；
5. 只为所选渠道构造账号列表；
6. 使用 `source: "free-all-<channel>"` 启动兑换；
7. 显示所选渠道的完成、停止或错误摘要。

刷新、取消和重试消息均携带渠道，并使用对应渠道的卡密池和使用记录。PIX 的远端查询、取消和重试请求传递 `channel: "pix"`。

### 错误处理

- 三个渠道均不可用时，“一键兑换全部”按钮禁用；
- 弹框内不可用渠道按钮禁用，并说明是无候选账号还是无可用卡密；
- 选择后状态发生变化时，不使用过期选择，显示最新不可兑换原因；
- PIX API 错误、日限额和远端状态使用现有统一错误分类，但写入 PIX 独立字段；
- PIX 操作失败不得修改 UPI 或 IDEAL 卡密使用记录；
- 停止兑换只停止当前选定渠道的运行任务。

### 测试策略

采用测试先行方式增加以下回归覆盖：

1. 渠道规范化接受 `pix`，未知值仍回退 UPI；
2. PIX 的失败、日限额和资格字段与 UPI、IDEAL 隔离；
3. PIX 卡密池和使用记录使用新规范字段；
4. 旧 `pixRedeem*` 卡密字段仍映射到 UPI，不会进入新 PIX；
5. API 兑换、刷新、取消和重试请求传递 `channel: "pix"`；
6. 设置导入导出保留旧 UPI 兼容并包含新 PIX 字段；
7. PIX 卡密池 UI 支持导入、删除、启停、摘要和状态列表；
8. Free 组渲染 PIX 候选和 PIX 兑换按钮；
9. “一键兑换全部”弹框显示三渠道、禁用不可用渠道，并只执行用户选择的渠道；
10. PIX Plus 分组、统计、导出和删除正确；
11. 原有 UPI、IDEAL 测试保持通过。

完成后运行相关 Node 测试、全部 `scripts/test-*.cjs`、smoke audit、修改文件的 `node --check` 和 `git diff --check`。

### 非目标

- 不新增 PIX 专用 API 地址、API Key 或 Client ID；
- 不改变现有 UPI、IDEAL 独立按钮的既有业务策略；
- 不让“一键兑换全部”支持多选或按顺序串行多个渠道；
- 不重新解释旧 `pixRedeem*` UPI 兼容数据；
- 不修改与兑换渠道无关的支付方式设置。
