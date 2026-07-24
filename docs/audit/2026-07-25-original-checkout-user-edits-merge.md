# 原始检出目录用户改动合并

日期：2026-07-25

## 比较范围

- 来源目录：`cdk-redeem-only-extension-main`，基于 `v1.0.14` / `cf8d9b1`，保留 19 个已修改文件和 5 个未跟踪测试文件。
- 目标目录：当前工程 `cdk-redeem-only-extension-v1.0.14-working-20260725`，比较前 `main` 工作树干净。
- 比较方式：以当前工程初始提交 `e19e095` 为共同内容基线，先构造来源目录工作树相对该基线的增量，再对当前 `HEAD` 做三方应用；没有整文件覆盖当前阶段实现。

24 个候选文件中，13 个来源改动在当前工程建立时已经存在，其中 11 个至今仍逐字节一致，另外 2 个已在当前工程后续阶段继续演进。来源目录在工程建立后又产生 11 个文件的增量。

## 已合并

- 步骤 4 验证码页等待时间扩展到 30 秒，给动态挂载的验证码输入框留出稳定时间。
- 第一次出现“未找到验证码输入框”时先等待 3 秒并重新检测，不立即刷新有效验证页；第二次仍缺失时才刷新受信任的 OpenAI 验证页。
- 步骤 5 增加资料字段完整性检测，name 或 age 不完整时禁止内容脚本和 Background 恢复逻辑提交空表单。
- 页面重渲染清空资料字段后，使用既有输入函数重新填写并再次确认字段稳定，再允许提交。
- 新增资料页回归测试，并扩展验证码输入框恢复测试。

合并文件：

- `background.js`
- `background/verification/resend-controller.js`
- `content/signup-page.js`
- `content/signup-profile-page.js`
- `scripts/test-signup-profile-page.cjs`
- `scripts/test-step4-verification-input-recovery.cjs`

## 未重复引入

来源增量还包含日志区“导出诊断”按钮、下载 JSON 和一套局部脱敏逻辑，共 5 个文件。当前工程已经通过 `sidepanel/failure-diagnostics.js` 提供“导出最近一次失败诊断”到剪贴板，覆盖前后各 100 条日志、页面检测状态和更完整的敏感信息脱敏。

为避免长期保留两套诊断入口、两套脱敏规则和“下载文件/复制剪贴板”两种冲突行为，旧诊断增量未合并。当前唯一行为仍为复制 JSON 到剪贴板，并提示“已导出至剪贴板”。

## 验证

- 定向测试：7/7 通过。
- 完整单元测试：425/425 通过。
- E2E：1/1 通过。
- 语法检查：383 个 tracked JavaScript 文件通过。
- 审计：Smoke、Removed Network、Phone/SMS 均通过；仅保留既有 `background.js` 15264 行警告。
- 文件大小门禁：`background/verification/resend-controller.js` 2000 行，`content/signup-page.js` 7000 行，均未提高阈值。
- Manifest：MV3，全部引用存在。
- 敏感检查：被跟踪的敏感运行时文件 0，高置信密钥命中 0。
- 本阶段未生成发布 ZIP，来源目录的未提交工作树未被修改。
