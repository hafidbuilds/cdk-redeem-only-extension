# CDK Redeem Only 项目审查报告

审查日期：2026-07-04  
审查范围：当前工作树，不包含真实远端 API、OpenAI 页面、指纹浏览器端到端加载验证。  
当前版本：`manifest.json` 为 `0.2.12`。  

## 当前项目结构

- `manifest.json`：MV3 扩展入口，`background.js` 为 service worker，`sidepanel/sidepanel.html` 为侧栏入口。
- `background.js`：后台总入口，装载共享工具、邮箱 provider、流程步骤、message router、UPI/IDEAL 兑换与会员检测模块。
- `background/message-router.js`：侧栏消息路由，处理配置导入导出、会员检测、Free/Plus 操作、CDK 状态刷新。
- `background/steps/*.js`：7 步主流程实现；`background/steps/upi-redeem.js` 负责第 7 步资格检测、Free 写入、自动兑换、远端刷新。
- `background/upi-credential-membership-checker.js`：Free/Plus 分组、AT 补充、会员识别、UPI/IDEAL 卡密兑换、删除 tombstone、远端状态同步。
- `content/signup-page.js`：OpenAI/Auth 页面自动化，负责注册、密码、验证码、资料页、2FA/登录页面交互。
- `sidepanel/sidepanel.js`：侧栏主 glue 层，负责 DOM、配置、导入导出、CDK 池和 manager 实例化。
- `sidepanel/account-records-manager.js`：账号记录弹层、Free/UPI Plus/IDEAL Plus 分组、兑换按钮、导出删除等 UI 逻辑。
- `sidepanel/custom-email-pool-manager.js`：自定义邮箱池导入、筛选、启停、已用标记和删除。
- `shared/*` / `data/*` / `flows/*`：共享转换、步骤定义、静态资料、验证码规则。

## 当前本地改动

审查开始时已有未提交改动：

- `background.js`
- `sidepanel/custom-email-pool-manager.js`
- `sidepanel/sidepanel.html`
- `sidepanel/sidepanel.js`

本次审查新增：

- `scripts/audit-smoke-tests.mjs`
- `docs/audit/2026-07-04-project-audit.md`

## 主要发现

### P1：导入 CDK 后自动续兑没有按渠道筛选候选

位置：`sidepanel/account-records-manager.js:4315` 到 `4340`

`resumeFreeRedeemAfterCdkImport()` 已经读取了导入渠道 `redeemChannel`，但候选账号使用的是 `getEnabledFreeUpiCredentialMembershipRows()`，这是 UPI/IDEAL 合并候选。后续调用 `startUpiCredentialMembershipFreeRedeem(..., { channel: redeemChannel })` 会把这批合并候选按导入渠道提交。

影响：

- 导入 IDEAL CDK 后，可能把仍应跑 UPI 的 Free 账号提交到 IDEAL。
- 导入 UPI CDK 后，可能把仅 IDEAL 可用的账号提交到 UPI。
- 这会让按钮数量、导入后自动续兑行为和分渠道策略不一致。

建议：

- 将候选改为 `getEnabledFreeUpiCredentialMembershipRowsForChannel(redeemChannel)`。
- 增加静态/单元测试：UPI 日限账号只进入 IDEAL 候选；普通 Free 只进入 UPI 候选。

### P1：侧栏 JS 期待的部分 DOM 入口在 HTML 中缺失

位置：

- `sidepanel/sidepanel.js:308` 到 `316`
- `sidepanel/sidepanel.html:365` 到 `419`

`sidepanel.js` 仍绑定这些 ID：

- `btn-show-upi-credential-backups`
- `btn-export-upi-credential-backups`
- `btn-check-upi-credential-membership-local`
- `btn-import-upi-credential-membership-txt`
- `btn-import-upi-credential-membership-free-txt`
- `btn-stop-upi-credential-membership-check`
- `btn-export-upi-redeem-success-records`
- `btn-upi-redeem-cdkey-status-refresh`

但当前 HTML 在 CDK/会员区只保留了导入 CDK、一键删除、隐藏 file input、预览框和结果容器。代码使用可选链绑定，因此不会报错，但实际入口消失。

影响：

- 用户看不到手动刷新 CDK 状态按钮。
- 部分备份查看/导出、本地核验、TXT 导入、成功记录导出入口不可达。
- 如果这些功能是故意移除，JS 应清理；如果不是故意移除，HTML 应补回入口。

建议：

- 做一份 DOM 契约表：每个 `getElementById()` 要么在 HTML 存在，要么在允许缺失清单中注明“废弃/动态生成”。
- 最少应确认 `btn-upi-redeem-cdkey-status-refresh` 是否需要恢复，因为用户此前多次依赖“刷新状态”。

### P2：单条删除 Plus 与分组删除 Plus 行为不一致

位置：

- 分组删除：`sidepanel/account-records-manager.js:4639` 到 `4653`
- 单条删除：`sidepanel/account-records-manager.js:4667` 到 `4713`

分组删除 `paid` 时只写对应渠道 tombstone，并清理禁用内存 Set；单条删除 `paid` 时写 tombstone 后，还会从 `upiCredentialMembershipPoolRows` 移除本地备份池里的邮箱。

影响：

- 单条删除 Plus 比分组删除更破坏性。
- 与“删除 Plus 不删除本地密码/2FA 备份”的预期不一致。
- 可能导致用户删除单行后，后续导出/登录/重新移动行为和批量删除不同。

建议：

- 统一删除语义：Plus 删除只写渠道 tombstone，不删除本地密码/2FA 池。
- 如果确实要删除本地备份，应在 UI 上使用单独按钮和明确提示。

### P2：会员核验异常路径可能短暂残留 running 状态

位置：

- 单账号检测保存 running：`background/upi-credential-membership-checker.js:3424` 到 `3434`
- 单账号 finally：`background/upi-credential-membership-checker.js:3483` 到 `3485`
- 批量检测保存 running：`background/upi-credential-membership-checker.js:3519` 到 `3529`
- 批量 finally：`background/upi-credential-membership-checker.js:3609` 到 `3611`

单账号/批量核验正常完成会写 `running:false`；但如果中途发生未被业务分支捕获的异常，`finally` 只清内存 `batchRunning`，不保证落盘 `running:false`。

影响：

- 侧栏可能短暂显示仍在运行。
- 需要下一次读取/修复逻辑才能恢复，用户会感觉“卡住”。

建议：

- 在 catch/finally 中补一个安全落盘：保留 items，写 `running:false`、清 `flowStage` 或写失败原因。
- 对 stop 与异常分开记录，避免把用户停止误标为失败。

### P2：文档与当前功能漂移

位置：

- `README.md`
- `项目文件结构说明.md`
- `项目完整链路说明.md`

当前代码已包含：

- IDEAL CDK 池与 IDEAL Plus 分组。
- 第 7 步资格通过后可自动提交兑换。
- Free 队列自动续兑和 5 秒刷新 CDK/远端状态。

但文档仍写：

- “UPI-only / UPI 专用版”。
- “第 7 步不会自动兑换 CDK”。
- 未描述 UPI/IDEAL 分渠道策略。

影响：

- GitHub 首页、教程和本地说明会误导使用者。
- 后续审查/发布时不容易判断当前行为是 bug 还是设计。

建议：

- 更新 README 和链路说明，把 Free 共用、UPI/IDEAL 分组、自动兑换策略、5 秒 CDK 刷新写清楚。

## 设计风险但不直接判 bug

### 手动兑换在自动流程运行中可执行

位置：`background/message-router.js:3798` 到 `3807`

相邻的补 AT、识别 Plus、验证 Plus、登录、移动等操作会在自动流程运行中被锁住，但 `REDEEM_UPI_CREDENTIAL_MEMBERSHIP_FREE` 只校验 `manualTrigger`。从历史需求看，“自动注册运行中三个兑换按钮仍可用”可能是刻意设计。

建议：

- 如果继续允许并发，需要补测试保证不会抢同一个账号/CDK。
- 如果要更保守，应改成自动流程运行中禁止手动兑换或进入队列。

## 当前已验证

```powershell
node --check background.js
node --check background/message-router.js
node --check background/upi-credential-membership-checker.js
node --check background/steps/upi-redeem.js
node --check sidepanel/account-records-manager.js
node --check sidepanel/sidepanel.js
node --check sidepanel/custom-email-pool-manager.js
node scripts/audit-smoke-tests.mjs
```

实际执行过的更强验证：

```powershell
$failed=@(); git ls-files '*.js' '*.mjs' | ForEach-Object { node --check $_ }
node -e "const fs=require('fs'); for (const f of ['manifest.json','package.json','rules.json']) { JSON.parse(fs.readFileSync(f,'utf8')); console.log(f+': valid JSON'); }"
node scripts/audit-smoke-tests.mjs
```

结果：

- 所有 Git 跟踪的 JS/MJS 语法检查通过。
- `manifest.json`、`package.json`、`rules.json` 均为合法 JSON。
- smoke 测试通过，并提示 2 个文档漂移 warning。

## 测试示例

### 自动 smoke 测试

运行：

```powershell
node scripts/audit-smoke-tests.mjs
```

覆盖：

- MV3 manifest 基础字段。
- 核心 JS 文件存在性。
- Git 跟踪 JS/MJS 的 `node --check`。
- 步间间隔默认 10 秒。
- 配置导出包含敏感运行数据标记。
- File System Access / `chrome.downloads` 导出路径锚点。
- UPI/IDEAL Plus 删除 tombstone 锚点。
- 远端 CDK 状态刷新路由与 `skipAutoRetry`。
- 自动兑换远端刷新 5 秒间隔。
- Free 组 CDK 续兑 5 秒刷新间隔。
- 敏感运行产物没有被 Git 跟踪。
- 文档与代码行为漂移 warning。

### DOM 契约测试样例

目标：防止 JS 绑定了按钮但 HTML 中没有入口。

步骤：

1. 扫描 `sidepanel/sidepanel.js` 中所有 `document.getElementById('...')`。
2. 扫描 `sidepanel/sidepanel.html` 中所有 `id="..."`。
3. 差集按两类处理：
   - 动态创建/废弃入口：写进允许缺失清单。
   - 用户可见入口：测试失败。

重点 ID：

- `btn-upi-redeem-cdkey-status-refresh`
- `btn-import-upi-credential-membership-free-txt`
- `btn-export-upi-redeem-success-records`

### UPI/IDEAL 导入续兑测试样例

目标：导入哪个渠道的 CDK，只续兑该渠道候选。

数据：

- A：普通 Free，有 AT，无日限，UPI 可兑。
- B：UPI 明确返回“该邮箱在该渠道今日提交次数已达上限 3 次 请 24 小时后再试”，IDEAL 可兑。
- C：IDEAL 失败 3 次，已封存。

期望：

- 导入 UPI CDK：只提交 A。
- 导入 IDEAL CDK：只提交 B。
- C 永远不被 UPI/IDEAL/全部选中。

### Plus 删除测试样例

目标：删除 Plus 不回弹，且不误删本地密码/2FA。

步骤：

1. 准备同邮箱 UPI Plus 与 IDEAL Plus 各一条记录。
2. 删除 UPI Plus。
3. 刷新状态、重开侧栏、重载扩展。
4. 验证 UPI Plus 不回弹，IDEAL Plus 仍存在。
5. 验证本地密码/2FA 备份仍存在。
6. 用分组删除与单条删除各跑一次，比较结果一致性。

### 主流程自动兑换测试样例

目标：第 7 步资格通过后，自动兑换行为可解释且不会抢错账号。

场景：

- 当前注册账号 UPI 可兑且 UPI 有 CDK：当前账号提交 UPI。
- 当前注册账号 UPI 日限，IDEAL 有 CDK：当前账号提交 IDEAL。
- 当前注册账号 UPI 日限，UPI 池还有 CDK，Free 队列里还有其它 UPI 候选：自动处理其它 UPI 候选。
- 远端提交后等待结果：每 5 秒刷新状态，只同步失败次数/状态，不在刷新线程里续兑。

### 配置导入导出测试样例

目标：导出配置是可导入 JSON，且运行数据完整。

步骤：

1. 准备 Free、UPI Plus、IDEAL Plus、UPI CDK 池、IDEAL CDK 池、删除 tombstone、自定义邮箱池。
2. 点击导出配置。
3. 验证文件名为 `multipage-settings-*.json`，内容可 JSON.parse。
4. 清空本地配置后导入。
5. 验证：
   - IDEAL CDK 池还在。
   - UPI Plus/IDEAL Plus 数量一致。
   - tombstone 不丢失。
   - 自定义邮箱已用标记数量一致。

## 建议优先级

1. 先修 `resumeFreeRedeemAfterCdkImport()` 的分渠道候选筛选。
2. 再做 DOM 契约清理，决定缺失按钮是恢复还是删除死绑定。
3. 统一 Plus 单条删除/批量删除语义。
4. 给异常路径补 `running:false` 落盘。
5. 更新 README/链路文档，避免发布页误导。
