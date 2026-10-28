# 平台运营中心“更新可刷新”发布

2026-10-28。用户提出“然后你把这个平台运营后台也装上这种更新可刷新的功能，要不然平台更新老是
反复安装也是不好的”。本轮给平台运营中心（网页 / PWA / 安卓壳内加载的同一套站点）加上“检测新版本
→ 一键刷新”的能力：日常功能更新刷新即可生效，不再需要卸载重装；只有图标、窗口模式这类外观清单
变化才需要重开应用（必要时重装一次）。

## 实现的判断来源

平台站是纯静态前端（Vercel 之外的 nginx 目录切换发布），每次 `npm run deploy` 都会在 `dist` 里写
`release.json`，因此页面可以只凭两个公开文件判断有没有新版本：

| 文件 | 变化含义 | 提示 | 用户动作 |
|---|---|---|---|
| `/release.json`（`scripts/deploy.mjs` 写入） | 有新的正式发布（含 `release` 标识、分支、提交） | “平台已发布新版本” | “立即刷新”，无需重新登录 |
| `/manifest.webmanifest` 文本指纹 | 图标、窗口模式等应用外观变化 | “应用外观已更新” | “知道了”，重开应用；仍是旧样式再重装一次 |

两者都只读公开静态文件，不涉及登录态、Cookie、业务数据或云函数。

## 代码入口

- `platform-admin-vue/src/utils/platformUpdate.js`
  - `startPlatformUpdateWatch(onUpdate)`：仅 `import.meta.env.PROD` 启用；打开页面先取一次基线，
    之后每 5 分钟轮询，并在 `focus`、`online`、`visibilitychange`（页面可见时）与自定义事件
    `sxf-platform-check-update` 触发时补查；发现变化只回调一次，避免反复弹窗。
  - `refreshPlatformShell()`：先 `navigator.serviceWorker.getRegistration().update()` 拉一次新外壳，
    再 `location.reload()`，避免刷新回旧缓存。
  - 请求带 `?t=` 时间戳与 `cache: 'no-store'`，绕过 CDN 与 Service Worker 缓存。
- `platform-admin-vue/src/components/PlatformUpdateNotice.vue`：右下角提示卡片（`role="status"`），
  `data-type="release|shell"` 便于测试与排查；WCO 应用窗口下自动让到自绘标题条下方
  （`top: calc(env(titlebar-area-height, 33px) + 12px)`），窄屏改为左右贴边。
- `platform-admin-vue/src/main.js`：在根节点挂 `PlatformUpdateNotice`，与页面和路由同级。
- `platform-admin-vue/public/sw.js`：`isCacheableAsset()` 对任何带查询参数的请求直接返回 `false`，
  更新探测（`/release.json?t=…`、`/manifest.webmanifest?t=…`）只走网络、绝不进缓存；
  `/assets/` 结构化资源仍是缓存优先，导航仍是网络优先，跨域请求照旧不拦截。

## 验证

- `node tools/test-platform-pwa.cjs`：0 失败。新增用例把 `/release.json` 做成可变响应——首屏读到
  `qa-release-0001` 时提示数为 0；改成 `qa-release-0002` 后派发 `sxf-platform-check-update`，
  出现 `data-type=release` 的提示，文案含“立即刷新”“不需要重新安装”，截图
  `output/platform-pwa-20261028/desktop-update-notice.png`，点击后页面确实重新加载
  （`updateNotice = { before: 0, after: {type:'release', …}, refreshed: true }`）。同时断言缓存里
  不会混入带查询参数的探测请求。
- `node tools/test-platform-tablet-ui.cjs`：60 个文件页面巡检 0 失败（提示层不影响布局）。
- `node tools/check-platform-live-pwa.cjs`：新增“更新可刷新”线上核查——`/release.json` 必须 HTTP 200
  且带 `release`，线上包必须包含 `sxf-platform-check-update`，发布清单分支必须是
  `codex/platform-ops`。结果 `updateCheck = { status: 200, release: '20261028140847-1639c58a',
  branch: 'codex/platform-ops', hasUpdateWatch: true }`，整体 `status: passed`，0 失败。

## 发布

`platform-admin-vue` 下 `npm run deploy`（分支 `codex/platform-ops`，源码干净，构建后写
`release.json` 并逐文件 SHA-256 回读）。本次发布 release **`20261028140847-1639c58a`**，45 个文件
摘要一致，站点为 <https://pingtai.sxffootball.cn/>。安卓安装包侧的应用内更新见
`docs/releases/android-platform-1.0.1-20261028.md`。

## 用户侧表现

1. 已安装的桌面应用 / 添加到主屏幕 / 安卓 APK 打开后，若有新发布，右下角出现“平台已发布新版本”，
   点“立即刷新”即是最新版本，登录态保留，不需要重新安装。
2. 提示不会刷屏：同一次发布只提示一次，刷新后以新版本为基线继续检查。
3. 图标或窗口外观变化时提示“应用外观已更新”，重开应用即可；极少数仍显示旧图标的，卸载后重装一次。
4. 安卓安装包本身有新版本时，由客户端自己弹“发现新版本”，一键下载并校验后交给系统安装器。
