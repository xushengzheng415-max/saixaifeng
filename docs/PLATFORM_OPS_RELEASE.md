# 平台运营后台独立发布

2026-10-09 用户确认：平台运营后台独立维护，不与主办方PC后台绑定发布。

| 项目 | 平台运营 | 主办方PC |
|---|---|---|
| 长期分支 | `codex/platform-ops` | `main` / `preview` |
| 工程 | `platform-admin-vue/` | `web-admin-vue/` |
| 构建 | 工程内 `npm ci`、`npm run build` | 原有PC构建流程 |
| 产物 | `platform-admin-vue/dist/` | `web-admin-vue/dist/` |
| 正式入口 | `https://pingtai.sxffootball.cn/` | `https://www.sxffootball.cn/admin/` |
| 发布 | 平台工程内 `npm run deploy` | PREVIEW_RELEASE_WORKFLOW.md |

平台分支固定保留，不因未合入main而删除。平台功能提交留在平台分支；跨端公共改动按独立提交审查和同步，不合并整个分支。旧PC工程中的平台代码仅为历史兼容，不继续同步修改，不作为平台正式发布源。旧 `vite.platform.config.js` 构建入口停用。

发布命令限制分支及目标，拒绝未提交的平台源码，构建后生成版本标记。仅通过既有SSH身份写入平台服务器的独立版本目录，保留旧版本，检查Nginx配置后切换站点目录，再回读线上文件摘要。禁止从该命令部署PC、H5、小程序或云函数。无权访问SSH时报告阻塞，不变更认证配置。

统一卡片绘制 `shared/player-card/draw.js`、字段协议 `cloudfunctions/webLoginApi/player-card-text-styles.json` 是允许的公共依赖；平台构建不依赖PC工程的文件或node_modules。共享后端与租户权限继续遵循AGENTS.md；前端工程拆分不代表新建数据库或自动发布共享云函数。

## 2026-10-23 共享后端代码更新的依赖保护

CloudBase CLI在缺少显式函数配置、从package.json推断配置时可能默认开启installDependency，造成传递依赖浮动。仅锁定根package-lock.json不足以证明云端安装遵循原包树，必须回下载核对实际node_modules版本/完整性。首次建队函数已改为携带完整现网依赖、关闭云端自动安装；赛事报名流程保留原false标志，其余三个本轮函数保留原true并核对实际依赖未变。

本次五个函数的无敏感值代码更新配置为`tools/football-numbering-functions.config.json`。发布前仍应回读实际配置，防止复用过时安装策略；只写name/installDependency，不把环境变量、密钥、超时等运行配置混进代码更新。继续使用足球专用sxf-cloud包装器，显式指定此config-file、函数名及刚下载线上包加最小差量的实际目录。不能因为有此配置文件就从脏工作区整包覆盖后端，也不能把fn deploy上传成功当作代码已更新。

实际状态、存量编码补发与回读证据见`docs/releases/numbering-standard-20261023.md`。

## 2026-10-28 电脑/平板自适应与可安装客户端

平台运营中心与平台后台继续共用同一套页面、权限和数据，不新建端、不改业务规则：

| 能力 | 实现 | 验证入口 |
|---|---|---|
| 平板自适应（抽屉导航、44px 触控、窄屏堆叠） | `src/assets/platform-tablet.css`、`src/components/PlatformTabletNav.vue` | `node tools/test-platform-tablet-ui.cjs` |
| 可安装客户端（PWA） | `public/manifest.webmanifest`、`public/sw.js`、`public/pwa-*.png`、`src/components/PlatformInstallGuide.vue`、`src/utils/serviceWorker.js` | `node tools/test-platform-pwa.cjs` |
| 桌面应用窗口标题条（WCO 自绘，深底白字） | `public/manifest.webmanifest` 的 `display_override`、`src/components/PlatformTitlebar.vue`、`src/main.js`、`src/assets/platform-tablet.css` | `node tools/test-platform-tablet-ui.cjs`（标题条仿真）、`node tools/check-platform-live-pwa.cjs` |
| 应用图标 | `scripts/make-pwa-icons.ps1` 由 `public/logo.png` 的蜂+足球徽标生成 | 截图见 `output/` |
| 线上安装能力核查 | 平台登录页入口、manifest、Service Worker 接管、浏览器安装判定 | `node tools/check-platform-live-pwa.cjs` |

安装方式：Windows 用 Edge/Chrome 地址栏“安装”；iPad 用 Safari“添加到主屏幕”；安卓平板可下载 APK 安装包（见下节），也可用 Chrome“添加到主屏幕”。安装后以独立窗口或独立应用运行，账号、权限与数据仍经 `webLoginApi` 获取，与网页版完全一致。安装入口只在未安装时出现，已安装（standalone）或已在 APK 内运行时自动隐藏。

入口位置有两处，未登录也能看到：平台管理员登录页表单下方（电脑“安装客户端”、安卓“下载安卓安装包”、iPad“添加到主屏幕”按钮 + 分设备说明），以及登录后控制台顶栏。点击后弹出分端安装步骤；浏览器直接支持安装时（`beforeinstallprompt`）改为直接触发系统安装。安卓分支只在登录页优先给安装包，控制台顶栏仍保留“添加到主屏幕”引导。

Service Worker 边界：只缓存本站 `/index.html`、构建产物 `/assets/` 与图标清单；跨域（`webLoginApi` 等）请求不拦截、不缓存，缓存中不保存任何登录态或业务数据。仅在正式构建注册（`import.meta.env.PROD`），开发态不注册，避免热更新被缓存干扰。HTTPS 是安装前提。

验证结果（2026-10-28 本地）：`npm run build` 通过；`tools/test-platform-tablet-ui.cjs` 覆盖 1440 桌面 + 1180/1024 横屏平板 + 820/768 竖屏平板 × 15 个功能页，0 失败；`tools/test-platform-pwa.cjs` 校验清单、图标尺寸、Service Worker 接管、缓存边界、断网外壳、电脑/iPad/Android 安装入口、登录页入口（电脑“安装客户端”、iPad“添加到主屏幕”、安卓“下载安卓安装包”）、安卓 APK 弹窗分支与已安装隐藏，0 失败。截图与结果见 `output/platform-tablet-20261028/`、`output/platform-pwa-20261028/`。

验证脚本的 Playwright 统一由 `tools/lib/load-playwright.cjs` 加载，优先使用仓库内 `npm install --no-save playwright-core`，缓存运行时路径失效时不再整批失败。

状态（标题条修复时）：2026-10-28 已提交 `codex/platform-ops` 并发布正式站点 `pingtai.sxffootball.cn`，当次线上 release `20261028120608-7ab33d8a`（34 个文件 SHA-256 回读一致；更新可刷新版本见下文 `20261028140847-1639c58a`）。`node tools/check-platform-live-pwa.cjs` 回读通过：登录页显示“安装客户端”及电脑/安卓/iPad 三种安装说明，manifest 三图标解析正常且 `display_override` 首选 `window-controls-overlay`，线上样式含自绘标题条规则，Service Worker 已激活并接管页面（scope `/`），Chrome 安装判定的唯一提示为无头/无痕环境限制 `in-incognito`。nginx 以 `application/octet-stream` 返回 `manifest.webmanifest`（mime 表未登记该扩展名），实测不影响 Chrome 解析与安装，暂不改动服务器 mime 配置。

## 2026-10-28 安卓平板安装包（APK）1.0.0

用户要求“做一个 APK 的安装包，能在平板上用，安卓的”，据此新增原生 WebView 客户端，只作为平台站点的打开方式，不复制页面、不另建端：

| 项目 | 值 |
|---|---|
| 源码 | `android-platform/`（Java WebView 壳 + Gradle 工程） |
| 包名 / 版本 | `cn.sxffootball.platform` / 1.0.0（versionCode 1） |
| 系统要求 | minSdk 24（Android 7.0），targetSdk 34 |
| 启动页 | `https://pingtai.sxffootball.cn/#/platform-login` |
| 下载 | `https://www.sxffootball.cn/desktop/platform/android/SxfPlatform-1.0.0.apk` |
| 更新清单 / 摘要 | `desktop/platform/android/latest.json`、`SHA256SUMS.txt` |
| 登录页入口 | `PlatformInstallGuide.vue` 的 `ANDROID_APK_URL` 与 `apk` 分支（仅安卓设备） |

APK 60,276 字节，SHA-256 `f641bdb8a85735a7c6858a00ac8893c042f8f5632fd60c21011dc68f947889d8`；`apksigner` v2 验签通过，证书 SHA-256 `d08c6c23e40f32ce04767b6ecd488dc2c857fdffb56dfc5b13e9a47d949150cc`；`aapt2 dump badging` 读回包名、版本、SDK 版本、启动 Activity 与五档图标；`node android-platform/test/config.test.cjs` 9 项通过。签名口令由明文 properties 迁移为 Windows DPAPI 加密文件，构建脚本只在进程内解密，不打印、不入库。

发布只新增 `www.sxffootball.cn/desktop/platform/android/` 三个文件（APK → 摘要 → 清单顺序），未触碰 `desktop/windows/`、主办方 `desktop/android/`、`/admin/`、云函数或环境配置。线上回读：三个文件均 HTTP 200，APK 类型 `application/vnd.android.package-archive`、大小与 SHA-256 与本地及清单一致；安卓 UA 登录页显示“下载安卓安装包”，弹窗进入 `apk` 分支并提供“下载安装包”按钮。详细记录见 `docs/releases/android-platform-1.0.0-20261028.md`，安装与升级步骤见 `android-platform/README.md`。

限制（1.0.0 当时）：本机无安卓设备，真机安装、登录、上传、导出保存、断网恢复与覆盖升级未验证；客户端不内置自动更新，升级需重新下载覆盖安装（已由下节 1.0.1 的应用内更新取代）。

## 2026-10-28 桌面应用窗口标题条可读性修复

用户反馈“电脑端的顶层条根本看不清！”。实测已安装应用窗口顶部约 33px 的标题条由浏览器绘制（非页面 DOM），浅灰底 `#ECECEC` + 纯白字，对比度约 1.1:1，页面样式无法覆盖。

修复：manifest `display_override` 改为 `["window-controls-overlay","standalone","minimal-ui"]`，由新增的 `src/components/PlatformTitlebar.vue` 在 `@media (display-mode: window-controls-overlay)` 内自绘深绿底 `#0c3b27→#0a3222` + 白字标题条（对比度 20.41:1），用 `env(titlebar-area-x/width)` 避开系统窗口按钮并保留 `app-region: drag`；`src/assets/platform-tablet.css` 在同模式下把 `#app` 下移 `env(titlebar-area-height, 33px)`，侧栏与主区同步让位。普通浏览器标签页不匹配该媒体查询，标题条 `display: none` 且不占高度，页面与修复前一致。

验证：`npm run build` 通过；`node tools/test-platform-tablet-ui.cjs` 新增 WCO 媒体规则仿真断言（无头浏览器无法真实进入 WCO 模式，改用注入同一份发布声明验证几何），读回标题条高 33px、贴顶、内容与侧栏均在 33px 之下、文字 12.5px 白色对比度 20.41、可拖动、无横向溢出、移除后隐藏且无占位，登录页同仿真下表单顶部 277px 未被遮挡，60 项页面巡检 0 失败，截图 `output/platform-tablet-20261028/desktop-titlebar-sim-1440.png`、`login-titlebar-sim-768.png`；`node tools/test-platform-pwa.cjs` 增加 `display_override` 断言，0 失败；线上 release `20261028120608-7ab33d8a`，`node tools/check-platform-live-pwa.cjs` 校验线上 manifest、`.platform-titlebar` 节点与线上样式中的 WCO 规则，0 失败。

用户侧：已安装窗口需重新打开（必要时卸载后重新“安装”）才会读到新的 manifest 并切换为自绘标题条；浏览器标签页不受影响；安卓 APK 壳不使用浏览器窗口标题条，本轮不影响。详细记录见 `docs/releases/platform-titlebar-wco-20261028.md`。

## 2026-10-28 更新可刷新（不再反复重装）

用户要求“平台运营后台也装上更新可刷新的功能，要不然平台更新老是反复安装也是不好的”。日常功能更新
改为“检测新版本 → 一键刷新”，只有图标/窗口外观变化才需要重开或重装：

| 判断来源 | 变化含义 | 提示与动作 | 实现 |
|---|---|---|---|
| `/release.json`（deploy 每次写入） | 有新的正式发布 | “平台已发布新版本”→“立即刷新”，保留登录态 | `src/utils/platformUpdate.js`、`src/components/PlatformUpdateNotice.vue`、`src/main.js` |
| `/manifest.webmanifest` 文本指纹 | 图标、窗口模式等外观变化 | “应用外观已更新”→重开应用，必要时重装一次 | 同上 |
| `latest.json`（www 静态托管） | 安卓安装包有新版本 | 客户端弹“发现新版本”→一键下载 + SHA-256 校验 + 系统安装器 | `android-platform/.../MainActivity.java`、`release/publish-1.0.1/` |

实现边界：只读公开静态文件，不读登录态、不写业务数据、不调用云函数；只在正式构建启用
（`import.meta.env.PROD`），开发态不触发。轮询 5 分钟一次，并在窗口获得焦点、恢复联网、页面重新可见
时补查，同一次发布只提示一次。刷新前先 `serviceWorker.update()` 再 `reload()`，避免回到旧缓存。
`public/sw.js` 改为带查询参数的请求一律不进缓存，更新探测（`?t=` 时间戳）只走网络。

验证：`node tools/test-platform-pwa.cjs` 0 失败，含“发布清单变化→提示→点击刷新”用例与“探测请求不进
缓存”断言；`node tools/test-platform-tablet-ui.cjs` 60 文件 0 失败；`node tools/check-platform-live-pwa.cjs`
新增线上核查（`release.json` HTTP 200 且含 `release`、线上包含 `sxf-platform-check-update`、清单分支为
`codex/platform-ops`；另在线上页面拦截 `/release.json` 模拟新发布，验证“基线不弹窗→提示→点立即刷新
真的重载”），回读 `release 20261028140847-1639c58a`、`hasUpdateWatch true`、
`updateNotice { before: 0, type: 'release', refreshed: true }`，0 失败。
安卓壳 `test/config.test.cjs` 13 项、`bridge.test.cjs` 4 项通过；APK 1.0.1 见下节。

当前状态：release `20261028140847-1639c58a`，45 个文件 SHA-256 回读一致。详细记录见
`docs/releases/platform-update-refresh-20261028.md`。

## 2026-10-28 安卓安装包 1.0.1（应用内更新）

| 项目 | 值 |
|---|---|
| 版本 | 1.0.1（versionCode 2，可覆盖升级） |
| 下载 | `https://www.sxffootball.cn/desktop/platform/android/SxfPlatform-1.0.1.apk` |
| 大小 / 摘要 | 64,896 字节 / `85d4a547a24e0089b60c780c0bc15645efca9b1a3172840fc03fcb509bd559ba` |
| 签名 | 与 1.0.0 同一证书 `d08c6c23…d949150cc` |
| 更新清单 | `desktop/platform/android/latest.json`（`versionCode 2`、`version 1.0.1`） |
| 权限 | 新增 `REQUEST_INSTALL_PACKAGES`（首次更新需在系统设置允许“安装未知应用”） |

客户端打开时（6 小时节流）读取 `latest.json`，有更高 `versionCode` 即弹窗，下载后用 SHA-256 校验，
再交给系统安装器覆盖安装——不必再自己找下载地址。

**发布踩坑（已修正）**：`tcb hosting deploy` 的第二个参数是云端目录而不是键名。把单个文件配
`desktop/platform/android` 上传，会生成一个名为该路径的错误键（内容恰是 `latest.json`），真正的
`SxfPlatform-1.0.1.apk` 反而 404。已删除该错误键，改用整目录上传
`hosting deploy android-platform\release\publish-1.0.1 desktop/platform/android`，`hosting list` 复验为
4 个文件且无额外目录键；线上回读 `SxfPlatform-1.0.1.apk` 与 `SxfPlatform-1.0.0.apk` 均 200、
类型 `application/vnd.android.package-archive`、大小与 SHA-256 与清单一致。详细记录见
`docs/releases/android-platform-1.0.1-20261028.md`，构建/发布步骤见 `android-platform/README.md`。

限制：本机无安卓设备，真机“检查更新→下载→校验→系统安装→覆盖升级”链路未实测。

