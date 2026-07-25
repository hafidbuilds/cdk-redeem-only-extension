# Releasing

这个文件用于记录把当前仓库正式发布到 GitHub 的最小流程。

## 发布前检查

1. 确认 `README.md`、`LICENSE`、`THIRD_PARTY_NOTICES.md` 已更新
2. 确认本次 Release 文案已经整理完成，建议放在 `docs/releases/` 目录留档
3. 确认 `manifest.json`、侧边栏标题和版本展示文案已经同步到目标版本号
4. 检查代码、截图、默认配置里没有真实密钥、代理、手机号、邮箱、Cookie、回调地址
5. 确认 `docs/images` 中的 README 图片可以正常显示
6. 运行 `npm run check`，确认语法、完整测试和三项审计全部通过
7. 检查 `git diff`，确认没有把本地临时文件一起带上
8. 运行 `npm run package`，只使用生成的脱敏 ZIP，不直接压缩工作目录
9. 解压生成的 ZIP，确认 `manifest.json`、Background 和 Sidepanel 引用均存在

## 当前版本建议

- 当前待发布版本：`v2.0.0`
- 当前扩展版本号：`2.0.0`
- Release 文案来源：`Release.md` 中的 `CDK Redeem Only V2.0.0` 小节
- GitHub Release 正文可直接复制该小节内容

## 首次发布

1. 创建新的 GitHub 仓库
2. 设置默认分支为 `main`
3. 推送当前代码
4. 检查仓库首页 README、图片和许可证识别是否正常
5. 创建首个 Release，例如 `v0.1.0`

## 推送示例

```powershell
git status
git add .
git commit -m "Initial open source release"
git remote remove origin
git remote add origin https://github.com/<your-name>/<your-repo>.git
git branch -M main
git push -u origin main
```

## 常规发版建议

```powershell
npm ci
npm run check
npm run package
git status
git add manifest.json sidepanel/sidepanel.html Release.md RELEASING.md
git commit -m "Prepare v2.0.0 release"
git tag -a v2.0.0 -m "CDK Redeem Only V2.0.0"
git push origin main
git push origin v2.0.0
```

默认发布包路径：`release-artifacts/cdk-redeem-only-extension-v2.0.0.zip`。该目录不进入 Git。

## Release 说明建议

建议在 Release 页面说明：

- 本次版本的核心新增能力
- 关键修复项
- 目前仍推荐的导出方式和使用限制
- 需要用户自行配置的外部服务
- 与 Issue / 社区反馈对应的改动来源
