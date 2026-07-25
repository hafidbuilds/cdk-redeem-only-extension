# Contributing

欢迎提交 Issue 和 Pull Request。开始前请阅读 [AGENTS.md](AGENTS.md) 和 [开发指南](docs/DEVELOPMENT.md)。

## 改动原则

- 以当前仓库真实代码和测试为准，不创建第二套前后端或重复账号、任务、Provider、兑换系统。
- 保持 UPI、IDEAL、PIX 三个渠道状态独立。
- 远端结果未知时保持 query-only，不重新提交 CDK。
- 网络错误不能直接解释为 Token 无效。
- 修改现有职责最接近的模块，并为真实调用方和状态变化增加回归测试。
- 不删除失败测试、不固定返回成功、不提高审计阈值掩盖问题。

## 提交前

```powershell
git status --short --branch
npm run syntax
npm test
npm run audit
git diff --check
```

浏览器行为变更还要遵守 [隔离浏览器 E2E 规范](docs/DEVELOPMENT.md#浏览器-e2e)。只改文档时可以跳过完整代码测试，但必须检查链接、乱码、敏感信息和 diff。

## 安全

不得提交真实邮箱、密码、Access Token、验证码、2FA Secret、Cookie、API Key、CDK、代理、手机号、敏感 URL 参数、本地配置、运行日志或浏览器 Profile。

涉及安全问题时遵守 [SECURITY.md](SECURITY.md)，不要在公开 Issue 中提供可直接利用的敏感细节。

## 文档

- 用户行为、配置或导入导出变化：更新 `docs/USER_GUIDE.md`。
- 架构、模块、测试、权限或发布变化：更新 `docs/DEVELOPMENT.md`。
- 已确认故障：追加到当月故障档案并更新 `docs/audit/issue-fix-index.md`。
- 发布版本：更新 `CHANGELOG.md`。

Pull Request 应说明实际行为变化、风险边界、运行过的命令和未验证事项。默认目标分支以仓库当前维护分支为准，不要套用其他项目的 `dev/master` 流程。
