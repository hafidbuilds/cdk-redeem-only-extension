# Manifest 权限用途表

本表按当前 `manifest.json` 和真实调用模块记录权限用途。阶段 7 不为了减少警告而删除仍被邮箱、页面自动化、Cookie、下载或兑换流程使用的权限。

| 权限 | 当前用途 | 主要调用模块 |
| --- | --- | --- |
| `sidePanel` | 打开扩展侧栏 | `sidepanel/sidepanel.html`、`background.js` |
| `alarms` | 自动运行、轮询和定时恢复 | `background/auto-run*`、`background.js` |
| `tabs` | 查询、创建、激活和关闭自动化标签页 | `background/tab-runtime.js`、`background/signup-flow-helpers.js` |
| `webNavigation` | 监听登录、回调和流程导航 | `background.js`、`background/navigation-utils.js` |
| `declarativeNetRequest` | iCloud 请求头规则 | `rules.json` |
| `debugger` | 受控页面调试与网络协助 | `background/debugger-*`、`background/passkey-api-login-executor.js` |
| `browsingData` | 清理流程完成后的站点数据 | `background.js`、`background/steps` |
| `cookies` | iCloud/OpenAI 会话 Cookie 读取与清理 | `background/passkey-api-login-executor.js`、`background/steps` |
| `storage` | 持久设置、任务、事件、运行 checkpoint | `background/bootstrap`、`background/*repository.js` |
| `scripting` | 在运行时注入现有内容脚本 | `background/content-script-registry.js`、`background/tab-runtime.js` |
| `downloads` | 用户明确请求的配置、账号和诊断导出 | `sidepanel/settings-transfer-manager.js`、`background/membership/import-export-service.js` |
| `activeTab` | 用户当前标签页的受控自动化 | `background/tab-runtime.js` |
| `https://chong.nerver.cc/*` | CDK 兑换和卡池接口 | `background/membership/redeem-service.js` |
| `https://cha.nerver.cc/*` | 会员核验、订阅和验证码辅助接口 | `background/membership`、`background/verification` |
| `https://*.icloud.com/*`、`https://*.icloud.com.cn/*` | iCloud 邮箱与会话自动化 | `content/icloud-mail.js`、`background` |
| `<all_urls>` | 现有页面自动化、回调和用户配置的自定义邮件 Provider | `background/tab-runtime.js`、`content/*` |

## 存储边界

`background/bootstrap/state-store.js` 在启动时将 `storage.session` 访问级别设置为 `TRUSTED_CONTEXTS`。Content Script 不直接读取账号、Token、Cookie、API Key、2FA Secret 或 CDK；需要动作时通过 `chrome.runtime.sendMessage` 调用 Background 白名单路由。普通设置导出使用字段级排除，敏感备份必须显式确认并仅保存在本地导入备份账本中。
