# MV3 扩展隔离浏览器测试工具调研

调研日期：2026-07-26

## 目标

在不启动用户日常使用的 Google Chrome、不读取其登录状态、Cookie 或默认用户目录的前提下，自动加载当前未打包的 Manifest V3 扩展，并验证 Service Worker、扩展页面、Side Panel 和消息通信。

当前仓库已经使用 Node.js 和 Playwright。`scripts/test-extension-e2e.cjs` 通过 `launchPersistentContext('', ...)` 创建临时用户目录，但默认 `executablePath` 指向 Microsoft Edge。因此现有结果只能证明 Edge/Chromium 兼容性，不能称为 Google Chrome 验证。

## 浏览器边界

- Chrome 团队从正式版 Chrome 137 起移除了 `--load-extension`，从 Chrome 139 起又移除了品牌版 Chrome 中的 `--disable-extensions-except`。这些参数继续在 Chromium 和 Chrome for Testing 中工作。因此，正式安装版 Google Chrome 已不适合作为未打包扩展的稳定自动化目标。
- Chrome for Testing 是 Google 为自动化提供的固定版本 Chrome 发行物，不会自动更新，提供 `win32`、`win64`、Linux 和 macOS 下载。它与用户日常 Chrome 的程序目录和用户目录分离。
- Playwright 官方对扩展测试的建议是使用其随包 Chromium；Google Chrome 和 Microsoft Edge 不再是官方推荐的命令行侧载目标。
- Chrome for Testing 的下载索引项目采用 Apache-2.0，但下载得到的是 Chrome for Testing 浏览器发行物，不能把浏览器二进制本身表述为“纯开源 Chromium”。

来源：

- [Chrome 扩展团队关于品牌版 Chrome 侧载参数的公告](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/FxMU1TvxWWg/m/daZVTYNlBQAJ)
- [Chrome for Testing 官方介绍](https://developer.chrome.com/blog/chrome-for-testing/)
- [Chrome for Testing 下载索引与 Windows 平台说明](https://github.com/GoogleChromeLabs/chrome-for-testing)
- [Playwright Chrome extensions](https://playwright.dev/docs/chrome-extensions)

## 候选对比

| 候选 | 许可证与维护状态 | MV3/隔离能力 | Windows/CI 与当前项目接入 | 结论 |
| --- | --- | --- | --- | --- |
| **Puppeteer + Chrome for Testing** | Puppeteer 为 Apache-2.0；npm `25.3.0` 发布于 2026-07-01，仓库持续维护 | `enableExtensions` 可直接加载目录；有 `installExtension()`、扩展枚举、MV3 Service Worker、扩展 Action 和内容脚本 Realm API；默认下载匹配的 Chrome for Testing，并使用临时 Profile | 支持 Windows；可在本地或 CI 缓存浏览器。当前单个 Playwright E2E 可窄幅改写为 Puppeteer，不影响扩展业务代码 | **首选**，最接近真实 Chrome 且完全不碰本地 Chrome |
| **Playwright + 随包 Chromium** | Apache-2.0；npm `1.62.0` 发布于 2026-07-24，仓库持续维护 | 官方支持 persistent context、MV3 Service Worker、扩展页面和新版 headless；空 `userDataDir` 会创建临时目录 | Windows/CI 成熟；当前项目已经依赖 Playwright，只需安装其 Chromium 并停止硬编码 Edge | **最小改动备选**，但验证对象应明确写成 Chromium，不是 Google Chrome |
| **`@puppeteer/browsers` + Chrome for Testing + 现有 Playwright** | Apache-2.0；npm `3.0.6` 发布于 2026-07-01 | 工具负责下载、固定和定位 Chrome for Testing；当前 Playwright 仍负责测试 | Windows 有官方 `win32`/`win64` 资产；接入量小，但 Playwright 对自定义 `executablePath` 明确不保证最佳兼容性 | 可作为过渡方案，不如完整 Puppeteer 路线稳定 |
| **Mozilla web-ext + Chrome for Testing** | MPL-2.0；`10.5.0` 发布于 2026-07-10，仓库持续维护 | Chrome 126+ 可通过 CDP `Extensions.loadUnpacked` 加载目录，并可创建临时 Profile；适合启动、自动重载和基础验证 | 必须显式指定 CfT 路径才不会发现并调用本机浏览器；它不是完整断言框架，测试 UI 仍需 Puppeteer/WebDriver | 适合开发启动器，不适合单独替代当前 E2E |
| **Selenium WebDriver + Selenium Manager + Chrome for Testing** | Selenium 为 Apache-2.0；`selenium-webdriver 4.46.0` 发布于 2026-07-11 | ChromeOptions 可加载扩展和指定隔离用户目录；Selenium Manager 可管理浏览器/Driver | Windows 和 CI 支持成熟，但 MV3 Service Worker、扩展内部页面与 Side Panel 的操作不如 Puppeteer/Playwright 直接；需要重写现有 E2E | 可用但迁移成本高，不推荐当前项目采用 |

维护状态来自对应 GitHub API、GitHub Release 和 npm registry 的 2026-07-26 查询结果：

- [microsoft/playwright](https://github.com/microsoft/playwright)
- [puppeteer/puppeteer](https://github.com/puppeteer/puppeteer)
- [SeleniumHQ/selenium](https://github.com/SeleniumHQ/selenium)
- [mozilla/web-ext](https://github.com/mozilla/web-ext)
- [`@puppeteer/browsers`](https://pptr.dev/browsers-api/)

## 推荐方案

推荐采用 **Puppeteer + 自动下载的固定版本 Chrome for Testing + 每次测试独立临时 Profile**：

1. Puppeteer 是 Chrome Browser Automation 团队维护的开源 Node.js 项目，安装 `puppeteer` 时会下载与该版本匹配的 Chrome for Testing，不调用系统 Chrome。
2. 使用 `enableExtensions: [extensionRoot]` 加载当前仓库，无需打包 CRX，也不需要访问 `chrome://extensions` 手工安装。
3. 通过 `service_worker` Target 获取 MV3 后台，打开 `chrome-extension://<id>/sidepanel/sidepanel.html` 验证现有 Side Panel。
4. 默认临时 Profile 不包含用户账号、Cookie、密码和 AT；测试结束调用 `browser.close()`。
5. Side Panel 和其他可视 UI 使用 `headless: false`；仅 Service Worker 和基本页面回归可使用 Chrome 新版 headless。不要使用旧 `chrome-headless-shell` 作为扩展 UI 验证依据。
6. 在测试输出中固定打印并断言 `product/version`、浏览器可执行文件来源、Profile 类型和扩展 ID，使报告不会再把 Edge、Chromium 和 Chrome for Testing 混称为 Chrome。

## 本机隔离验证

2026-07-26 在系统临时目录安装 `puppeteer@25.3.0`，未修改本仓库依赖，也未读取或连接用户 Chrome Profile。Puppeteer 自动下载并启动 Chrome for Testing `150.0.7871.24`，使用临时 Profile 加载当前仓库：

- MV3 `background.js` Service Worker：已启动并识别；
- `sidepanel/sidepanel.html`：已加载；
- 设置区和配置按钮：已识别；
- 账号列表和任务列表：已识别；
- 本次验证未写入账号、设置、Cookie、密码、AT 或系统剪贴板。

Windows 上本次验证必须使用 `pipe: true`。默认 WebSocket 调试端口模式在调用 `Extensions.loadUnpacked` 时出现浏览器 Target 提前关闭；切换到 pipe 传输后，扩展加载和上述页面断言通过。因此，后续若正式接入 Puppeteer，应将 pipe 传输和独立临时 Profile 固化到测试启动配置，并为浏览器启动失败保留明确诊断。

官方接入依据：

- [Puppeteer 安装和自动下载 Chrome for Testing](https://pptr.dev/guides/installation)
- [Puppeteer 支持的浏览器版本](https://pptr.dev/supported-browsers)
- [Puppeteer Chrome Extensions API](https://pptr.dev/guides/chrome-extensions)
- [Chrome 官方扩展 E2E 测试指南](https://developer.chrome.com/docs/extensions/how-to/test/end-to-end-testing)
- [Chrome 官方 MV3 Service Worker 终止/恢复测试](https://developer.chrome.com/docs/extensions/how-to/test/test-serviceworker-termination-with-puppeteer)

## 不推荐的做法

- 不再以用户本地 Google Chrome、默认 User Data 或已经登录的 Profile 作为自动测试环境。
- 不再把 Microsoft Edge 的 E2E 结果写成 Google Chrome 已通过。
- 不把 Playwright 随包 Chromium 的结果写成 Chrome for Testing 已通过。
- 不依赖 Chrome 137/139 以后正式品牌版 Chrome 已移除的扩展侧载参数。
- 不为引入测试工具而迁移扩展目录、重写业务模块或新增独立服务。

本文件只记录调研结论，未修改业务代码、测试脚本、依赖或发布版本。
