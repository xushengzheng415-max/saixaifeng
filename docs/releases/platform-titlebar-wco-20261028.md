# 平台运营中心桌面应用窗口标题条可读性修复

2026-10-28，用户上传已安装应用窗口截图并反馈“电脑端的顶层条根本看不清！”。本轮只修
`pingtai.sxffootball.cn` 在**已安装桌面应用窗口**里的窗口标题条可读性，不改任何业务页面、
权限或数据逻辑。

## 问题与根因

- 现象：窗口最顶部约 33px 的标题条里，标题文字几乎看不见。
- 像素分析：标题区背景为浅灰 `#ECECEC`（luminance 236），标题文字为纯白 `#FFFFFF`
  （luminance 255），对比度约 **1.1:1**，远低于可读下限 4.5:1。
- 该标题条由浏览器按 manifest `theme_color` / 系统窗口配色绘制，不是页面 DOM，页面内样式
  无法覆盖它；旧的 `display_override` 为 `["standalone","minimal-ui"]`，浏览器只能接管绘制。
- 同一窗口里标题被拼成“赛小蜂足球 · 平台运营中心 - 赛小蜂足球 - 平台运营中心”，也是浏览器
  叠加 manifest `name` 与应用内 `document.title` 的结果。

## 修复方式

改用 Chrome/Edge 的 **window-controls-overlay（WCO）**：把标题条区域交给页面自己绘制。

| 改动 | 文件 | 说明 |
|---|---|---|
| manifest | `platform-admin-vue/public/manifest.webmanifest` | `display_override` 改为 `["window-controls-overlay","standalone","minimal-ui"]`，`display` 仍为 `standalone` 作为不支持时的回退 |
| 自绘标题条 | `platform-admin-vue/src/components/PlatformTitlebar.vue`（新增） | 仅在 `@media (display-mode: window-controls-overlay)` 显示：深绿渐变底 `#0c3b27 → #0a3222` + 白字，白字对深绿对比度 **20.41:1**；`env(titlebar-area-x/width)` 避开系统窗口按钮，`app-region: drag` 保留拖动窗口能力 |
| 全局挂载 | `platform-admin-vue/src/main.js` | 标题条挂在路由之外，登录页、控制台、系统页一致显示 |
| 内容让位 | `platform-admin-vue/src/assets/platform-tablet.css` | WCO 模式下 `#app` 下移 `env(titlebar-area-height, 33px)`，侧栏、主区、登录页同高让位，避免被标题条遮住 |

普通浏览器标签页与平板浏览器不匹配该媒体查询：标题条 `display: none`，不占任何高度，页面
与修复前完全一致。

实现细节：高度与让位都直接使用 `env(titlebar-area-height, 33px)`，不经过自定义属性；早期版本
把 `env()` 包在 CSS 变量里，在缺少 `titlebar-area-height` 支持的环境会让整条高度失效。

## 验证

- `npm run build` 通过（1690 modules，仅体积告警）。
- `node tools/test-platform-tablet-ui.cjs`：新增标题条仿真断言。无头浏览器无法真实进入 WCO
  模式（CDP `Emulation.setEmulatedMedia` 对 display-mode 不生效，已实测四种取值），因此把页面中
  `display-mode: window-controls-overlay` 的媒体规则原样取出、去掉外层条件后重新注入，用同一份
  发布声明做几何验证，读回：`ruleCount 2`、`visible true`、`height 33`、`top 0`、
  `background linear-gradient(90deg, rgb(12,59,39), rgb(10,50,34))`、`appPaddingTop 33px`、
  `topbarTop 33`、`sidebarTop 33`、`nameColor rgb(255,255,255)`、`nameFontSize 12.5px`、
  `nameContrast 20.41`、`dragRegion drag`、`overflow false`；移除仿真样式后
  `hiddenAfterReset true`、`paddingAfterReset 0px`。同一脚本 1440 桌面 + 1180/1024 横屏 +
  820/768 竖屏 × 15 个功能页共 60 项巡检 0 失败，截图含
  `output/platform-tablet-20261028/desktop-titlebar-sim-1440.png`。同一仿真在登录页（768×1024
  竖屏）复跑：标题条可见、文字对比度 20.41、表单顶部 277px 未被遮挡、无横向溢出，重置后隐藏，
  截图 `output/platform-tablet-20261028/login-titlebar-sim-768.png`。
- `node tools/test-platform-pwa.cjs`：新增 `display_override[0] === 'window-controls-overlay'`
  与保留 `standalone` 回退的断言，0 失败。
- `node tools/check-platform-live-pwa.cjs`：新增线上 manifest `display_override` 首位校验、
  页面存在 `.platform-titlebar` 节点、线上样式含 `window-controls-overlay` 规则（命中
  `/assets/index-B4tKLyeX.css`），线上运行 0 失败。
- 未引入 `@cloudbase/js-sdk`，登录与数据链路未改动。

## 发布与回读

`codex/platform-ops` 提交 `7ab33d8a`，`platform-admin-vue` 内 `npm run deploy` 发布，
线上 release `20261028120608-7ab33d8a`（`/var/www/pingtai/releases/`，nginx 已切换并 reload），
发布脚本 SHA-256 回读 34 个文件全部一致；线上核查 0 失败。

## 用户侧注意

已安装的应用窗口是否切换到新标题条，取决于浏览器是否重新读取 manifest：

1. 关掉已安装的平台窗口后重新打开；若仍是浅色标题条，从地址栏卸载后重新“安装”一次；
2. 浏览器标签页访问 `https://pingtai.sxffootball.cn/` 时不受影响，页面本身没有变化；
3. 安卓 APK（`android-platform` WebView 壳）不经过浏览器窗口标题条，本轮改动不影响它。
