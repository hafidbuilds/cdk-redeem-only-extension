# 用户停止后日志连续刷新

## 故障现象

自动运行执行过至少一轮后，用户点击“停止”，侧栏日志会连续快速增加和滚动，看起来像停止后仍在疯狂刷新。

## 诊断证据与根因

停止按钮通过 `STOP_FLOW` 调用后台 `requestStop()`，停止标记随后使 `autoRunLoop()` 进入收尾分支。收尾代码无论是用户主动停止还是流程故障停机，都会调用 `replayPreviousSuccessfulAutoRunRoundLogSnapshot()`。

快照回放最多读取上一成功轮的 120 条日志，并对每一条依次调用 `addLog()`。每次调用都会单独写入状态并广播一条 `LOG_ENTRY`，侧栏也会逐条追加和滚动。因此这是有限但密集的旧日志回放，不是停止按钮重复触发或无限循环。

## 修复实现

- `background/auto-run/session-runner.js` 在收尾时记录 `stoppedByUser`。
- 用户主动停止时不再回放上一轮成功日志快照，只写入当前停止结果。
- 流程因内部故障自行停止时仍保留原有快照回放，便于诊断失败上下文。
- 快照仍保存在既有 `autoRunRoundLogSnapshots` 存储中，没有删除历史数据，也没有新建第二套日志系统。
- `scripts/test-auto-run-session-runner.cjs` 增加真实 `autoRunLoop()` 回归场景：第一轮完成、第二轮收到用户停止，断言快照回放调用次数为 0，运行状态正常结束在第二轮。

## 安全与兼容边界

- 不改变 `requestStop()`、内容脚本 `STOP_FLOW` 广播、任务状态或账号记录行为。
- 不改变故障停机的诊断快照回放。
- 不改变 UPI、IDEAL、PIX、CDK、AT、Free/Plus 或注册流程规则。
- 不修改 Manifest 权限和版本，不生成发布包。
- 没有提高文件体积审计阈值；`session-runner.js` 保持在 1100 行限制内。

## 验证结果

- 定向测试：`6/6` 通过。
- 完整单元测试：`465/465` 通过。
- 语法检查：`389` 个 Git 跟踪的 JavaScript 文件通过。
- MV3 E2E：`1/1` 通过，扩展和 Sidepanel 成功加载。
- Smoke、Removed Network、Phone/SMS 三项审计通过；仅保留既有 `background.js` 超过 8000 行的非阻断警告。
- Manifest 引用：`41` 个引用、`25` 个唯一文件、`0` 缺失。
- 差异敏感数据扫描：`0` 个凭证形态命中。
- `git diff --check` 通过。

## 提交与发布影响

本修复使用独立本地 Git 提交，不打包、不修改版本号、不推送远端。
