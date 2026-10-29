# 平台运营中心桌面应用窗口标题条二次修复（浅底白字根因）

2026-10-29，用户再次上传已安装应用窗口截图，红框标出的顶部仍是“浅底 + 白字”看不清。
上一轮（`platform-titlebar-wco-20261028.md`）只改了 manifest 与自绘标题条样式，实际没有生效。
本轮定位到两个叠加的真实根因并修复，只涉及 `pingtai.sxffootball.cn` 的安装/外观链路，
不改业务页面、权限或数据逻辑。

## 为什么上一轮没生效

| 根因 | 说明 | 后果 |
|---|---|---|
| manifest 被浏览器忽略 | nginx 的 mime 表没有登记 `.webmanifest`，`/manifest.webmanifest` 以 `application/octet-stream` 返回；Chrome/Edge 只解析 `application/manifest+json`（或 `json`），拿到别的类型会直接丢弃清单 | `display_override: ["window-controls-overlay", ...]` 从未生效，页面自绘标题条永远不显示，窗口仍是浏览器自绘标题条 |
| 深色主题色导致白字 | 窗口标题文字颜色不是页面控制的，而是浏览器按 manifest `theme_color` / `<meta name="theme-color">` 的亮度决定：深色主题色 → 白字。旧值是深绿 `#1B5E20`，而 Windows 11 / Edge 把标题区画成浅色 | 浅底 `#ECECEC` + 白字，对比度约 1.1:1 |

对照实验（`work/capture-window.ps1` 用 `msedge --app` 打开真实应用窗口并用 Win32
`PrintWindow` 截整窗）：主题色 `#1B5E20` 时标题文字是白色（`output/titlebar-diag/edge-app-dark.png`），
换成浅色 `#E7F0EA` 后标题文字变深色（`output/titlebar-diag/edge-app-light.png`），确认机制。

上一轮线上核查只断言了“HTML 里有 `.platform-titlebar` 节点”“线上样式文本包含
`window-controls-overlay`”，这两条在清单被忽略时同样成立，所以漏掉了根因。

## 修复

| 文件 | 变更 |
|---|---|
| `platform-admin-vue/index.html` | `theme-color` 改为浅色 `#E9F1EC`，新增 `<meta name="color-scheme" content="light">`，让浏览器固定选深色标题文字、不随系统深色模式反转 |
| `platform-admin-vue/public/manifest.webmanifest` | `theme_color` 改为 `#E9F1EC`；`display_override` 仍为 `["window-controls-overlay","standalone","minimal-ui"]` |
| `platform-admin-vue/public/sw.js` | manifest 从 cache-first 列表和 `install` 预缓存中移除，改为网络优先（`cache: 'no-store'`，失败才回退缓存）；`CACHE_NAME` 升到 `sxf-platform-shell-v2`，旧 v1 缓存由 activate 清除。此前已安装应用会长期读旧清单，导致外观更新永远不生效 |
| `platform-admin-vue/src/components/PlatformTitlebar.vue` | WCO 自绘条由深绿底白字改为浅绿渐变 `#eef5f1 → #e3efe9` + 深色文字 `#16281d`（对比度 13.13:1）；即使浏览器选中 WCO 模式，也不会再出现浅底白字 |
| `platform-admin-vue/scripts/deploy.mjs` | 发布脚本幂等写入 nginx 配置：`location = /manifest.webmanifest` 固定 `default_type application/manifest+json` + `Cache-Control: no-cache`，`/index.html` 也 `no-cache`；`nginx -t` 失败自动回滚上一份配置 |
| `tools/test-platform-pwa.cjs` | 断言改为浅色主题色 `#E9F1EC` + 亮度 > 0.7（深色会得到白字）+ `color-scheme: light` |
| `tools/test-platform-tablet-ui.cjs` | 修正 `luminance()` 只认十六进制前两位的解析缺陷（`#e3efe9` 之前得 NaN），标题条对比度基准改为 `#e3efe9`，新增回读 `nameColor` |
| `tools/check-platform-live-pwa.cjs` | 新增 CDP `Page.getAppManifest` 核查：驱动真实浏览器解析线上清单，断言无 `errors`/`manifestErrors`、`display_override[0] === 'window-controls-overlay'`、解析出的 `theme_color === '#E9F1EC'`，不再只检查 HTML 文本 |

## 验证

- `platform-admin-vue` 内 `npm run build` 通过（仅体积告警）。
- `node tools/test-platform-pwa.cjs` 0 失败（浅色主题色、亮度、`color-scheme`、`display_override`）。
- `node tools/test-platform-tablet-ui.cjs` 60 项巡检 0 失败；标题条仿真读回
  `background linear-gradient(90deg, rgb(238,245,241), rgb(227,239,233))`、`nameColor rgb(22,40,29)`、
  `nameContrast 13.13`、`height 33`、`appPaddingTop 33px`、`dragRegion drag`、
  `hiddenAfterReset true`、`paddingAfterReset 0px`（结果 `output/platform-tablet-20261028/result.json`）。
- 发布：`codex/platform-ops` 提交 `d46d3aa0`，`npm run deploy` 发布线上 release
  `20261029034800-d46d3aa0`，脚本 SHA-256 回读 45 个文件全部一致。
- HTTP 回读：`/manifest.webmanifest` 返回 `Content-Type: application/manifest+json`、
  `Cache-Control: no-cache`；登录页 `<meta name="theme-color">` 为 `#E9F1EC`，
  `<meta name="color-scheme">` 为 `light`。
- `node tools/check-platform-live-pwa.cjs` 通过（`status: passed`，`failures: []`）：
  `appManifest { errors: [], manifestErrors: [], displayOverride: ["window-controls-overlay","standalone","minimal-ui"], themeColor: "#E9F1EC" }`，
  `manifest.type application/manifest+json`，`head.colorScheme light`；
  更新可刷新行为同时复验 `updateNotice { before: 0, type: 'release', refreshed: true }`，
  当前线上 `release 20261029034800-d46d3aa0`。
- 真实窗口：`msedge --app=https://pingtai.sxffootball.cn/#/platform-login` 整窗截图
  `output/titlebar-diag/live-light-titlebar.png` 显示窗口标题条为浅色、标题文字
  “赛小蜂足球平台管理员登录”为深色，清晰可读。
- 未引入 `@cloudbase/js-sdk`，登录与数据链路未改动。

## 用户侧怎么做

1. 已安装的平台窗口先**完全退出**（任务栏/托盘都关掉）再重新打开；新 Service Worker 会清掉
   v1 外壳缓存并改走网络清单。
2. 如果重开后仍是旧的浅底白字，说明旧安装记录的清单还被浏览器留着：**卸载后再“安装”一次**
   （只需这一次），之后标题条就是新的浅底深字。
3. 之后再遇到平台功能更新，点提示里的“立即刷新”即可，不用重装。
4. 浏览器标签页（不安装直接访问）一直正常，不受影响；安卓 APK 壳不使用浏览器窗口标题条，
   走自己的应用内更新（1.0.1）。

## 追加：安装版窗口标题重复应用名

用户随后截图指出标题条显示“赛小蜂足球 · 平台运营中心 - 赛小蜂足球 - 平台运营中心”。这不是浏览器
画错，而是命名规则重复：安装版（QQ 浏览器 / Edge 的“应用”窗口）把 manifest `name` + `' - '` +
`document.title` 拼成窗口标题，而各页面又各自把品牌写进 `document.title`：

| 位置 | 原值 |
|---|---|
| `index.html` `<title>` | `赛小蜂足球 · 平台运营中心`（与 manifest name 完全相同） |
| `PlatformLoginView.vue` | `赛小蜂足球平台管理员登录` |
| `TournamentCenterAdmin.vue` | `赛小蜂足球 - 平台运营中心` |

修复：标题收敛到单一来源，页面标题只写页面名，品牌只在浏览器标签页补齐。

| 文件 | 变更 |
|---|---|
| `platform-admin-vue/src/utils/appTitle.js`（新增） | `APP_NAME`、`PAGE_TITLES`、`composePageTitle(pageTitle, appWindow)`：安装版返回纯页面名，浏览器标签页返回“页面名 · 赛小蜂足球” |
| `platform-admin-vue/src/main.js` | 路由 `beforeEach` 统一 `applyRouteTitle(to.path)`，登录/控制台/系统三条路由都在此取名 |
| `platform-admin-vue/src/views/login/PlatformLoginView.vue`、`.../TournamentCenterAdmin.vue` | 删除各自的 `document.title` 赋值，避免两处规则不一致 |
| `platform-admin-vue/index.html` | 默认标题改为“运营控制台”，不再与 manifest `name` 相同 |
| `tools/test-platform-pwa.cjs` | 导入 `appTitle.js`，断言三条路由的安装版窗口标题里品牌只出现 1 次、页面标题不含品牌，并校验浏览器标签页标题 |
| `tools/test-platform-tablet-ui.cjs` | “标题重复应用名”由提示改为失败项（登录页与控制台两处） |
| `tools/check-platform-live-pwa.cjs` | 线上断言：页面标题不得包含 manifest `name`，但必须含品牌；同时回读 manifest `name`/`short_name` |

版本更新后保持一致的做法：

1. 标题只由 `src/utils/appTitle.js` 的页面名与 manifest `name` 决定，页面组件不再各自设置，发布不会漂移；
2. `npm run deploy` 每次重写 `manifest.webmanifest` 与 `release.json`，且 manifest 走网络优先（SW v2），
   安装版下次打开或刷新读到的是同一份清单；
3. 本地构建测试与线上核查都把“窗口标题重复”当作失败，回退发布会直接报错，而不是等用户发现；
4. 已安装应用收到“平台已发布新版本”提示后点“立即刷新”即可换到新的标题规则，不需要重装。

验证：`npm run build` 通过；`node tools/test-platform-pwa.cjs` passed（`titles` 读回
`/platform-login → 管理员登录`、`/tournament-center-admin → 运营控制台`、`/system → 系统管理`，
安装版不含品牌，浏览器标签页为“运营控制台 · 赛小蜂足球”）；`node tools/test-platform-tablet-ui.cjs`
60 项 0 失败；发布 release `20261029044303-31ca596b`，45 个文件 SHA-256 回读一致；
`node tools/check-platform-live-pwa.cjs` passed（线上标题 `管理员登录 · 赛小蜂足球`，manifest
`name` 仍为 `赛小蜂足球 · 平台运营中心`）；用已安装快捷方式打开的真实应用窗口读回窗口标题
`赛小蜂足球 · 平台运营中心 - 运营控制台`（修复前为 `赛小蜂足球 · 平台运营中心 - 赛小蜂足球 - 平台运营中心`）。

## 取代关系

- 取代 `docs/releases/platform-titlebar-wco-20261028.md` 中“深绿底 `#0c3b27→#0a3222` + 白字自绘条”
  的方案与配色（WCO 机制保留，配色与主题色改为浅色系）。
- 取代 `docs/PLATFORM_OPS_RELEASE.md` 中“nginx 以 `application/octet-stream` 返回 manifest
  不影响 Chrome 解析与安装，暂不改动服务器 mime 配置”的结论，该结论已被 CDP 核查证伪。
