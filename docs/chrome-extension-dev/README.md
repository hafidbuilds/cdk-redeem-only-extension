# Chrome 扩展官方文档索引

仓库不再长期保存逐页 Markdown 镜像。Chrome API 和 MV3 行为会持续变化，开发时应读取下面的官方最新文档；`sources.json` 保留完整来源清单。

## 核心概念

- [Chrome Extensions](https://developer.chrome.com/docs/extensions/)
- [Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
- [Extension Service Workers](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers)
- [Content Scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Message Passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [Storage and Cookies](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies)
- [Declare Permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
- [Match Patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns)

## 当前使用的 API

- [chrome.runtime](https://developer.chrome.com/docs/extensions/reference/api/runtime)
- [chrome.storage](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [chrome.tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs)
- [chrome.scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting)
- [chrome.cookies](https://developer.chrome.com/docs/extensions/reference/api/cookies)
- [chrome.sidePanel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)

## 测试

- [Chrome 扩展 E2E 测试](https://developer.chrome.com/docs/extensions/how-to/test/end-to-end-testing)
- [Puppeteer Chrome Extensions](https://pptr.dev/guides/chrome-extensions)
- [Chrome for Testing](https://developer.chrome.com/blog/chrome-for-testing/)

如确实需要离线副本，可显式运行 `node scripts/download-chrome-extension-docs.mjs` 重新生成 `pages/`。生成内容属于临时参考，不应与功能修改一起长期提交。

Chrome for Developers 文档通常使用 CC BY 4.0，代码示例通常使用 Apache 2.0；具体以各官方页面声明为准。
