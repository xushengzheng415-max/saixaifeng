# 平板应用固定侧栏回归修复（测试站）

2026-11-04，用户真机截图反馈平板测试版再次出现固定侧栏，要求恢复“无侧栏、左上角小方块按钮呼出菜单”的紧凑布局。本次只恢复测试站`/preview/admin/`的平板布局源码并重新发布，未改动正式`/admin/`。

## 回归原因

线上读回证实不是缓存问题：发布前的`/preview/admin/index.html`指向`assets/index-qbQfXlyl.js`与`index-2u7riYju.css`，下载后检索不到`SxfFootballPad`、`data-tablet-landscape`、`tablet-menu-toggle`任一字样。

`github/preview`与`github/main`核对结果：两条分支都只剩`web-admin-vue/src/assets/tablet-landscape.css`这一个残留文件，`utils/tabletLayout.js`、`components/TabletNavigation.vue`、`main.js`的`installTabletLayout()`调用与`LayoutView.vue`的`TabletNavigation`挂载点均已丢失。平板适配最初只合并进`preview`（`fcf519970`、`00ce64c18`），后续`preview`按`main`重建时被覆盖，于是`html[data-tablet-landscape]`标记永远没有写入，侧栏隐藏规则成为死代码，平板显示回到桌面布局。

## 修复范围

从`00ce64c18`恢复本轮已验证的最终实现，不重新设计：

- `web-admin-vue/src/utils/tabletLayout.js`：保留横屏触控媒体条件，并识别原生`SxfFootballPad/<版本>`用户代理，挂载前写入`data-tablet-landscape`。
- `web-admin-vue/src/components/TabletNavigation.vue`：44×44菜单小方块、复用`currentNavItems`与原激活/跳转逻辑、抽屉关闭规则不变。
- `web-admin-vue/src/main.js`：重新引入`assets/tablet-landscape.css`并在挂载前调用`installTabletLayout()`。
- `web-admin-vue/src/views/layout/LayoutView.vue`：在内嵌页头与桌面页头两处恢复`TabletNavigation`挂载点，桌面端行为不变。
- `tools/test-tablet-layout-detection.cjs`、`tools/test-pad-compact-ui.cjs`：识别与紧凑布局检查脚本恢复。

未修改云函数、数据库、登录链路、身份权限、统计口径或小程序/服务号；`web-admin-vue`内其余文件与`preview`基线一致。桌面端仍是原侧栏，平板标识只在布局层生效，不授予任何角色或业务权限。

## 验证

- 分支自`github/preview`（`3edc89f9f`）建立：`codex/pad-nav-restore-20261104`，只含上述文件。
- `npm ci`后`VITE_APP_BASE=/preview/admin/ npm run build`通过（19.73s）；`dist/index.html`入口`/preview/admin/assets/index-CxxdV5gn.js`，CSS`index-7eBerNJa.css`。
- `node tools/test-tablet-layout-detection.cjs`三项通过：原生标识在鼠标/桌面媒体下仍走紧凑布局、普通桌面不受影响、标识必须是完整版本号令牌。
- 发布后读回`/preview/admin/index.html`：入口资产与本地构建一致；JS含`SxfFootballPad`与`data-tablet-landscape`，CSS含`data-tablet-landscape`、`.sidebar{display:none}`与`tablet-menu-toggle`，共409文件部署成功。
- 本地构建摘要：`index.html`A632498253751A728D7E67937EF7FD4ABBC0DC90095D425BDB1145E13BF2B03E，入口JS`2B95EF63C61A56C2C34ACAD490B81AF17732E9B223D636A370291CE295943713`，入口CSS`1897E693DB293BAC528FCC113AA9BEEAB5DF4E59D80FE930C6FA9FAAF3C810BF`。

上述为浏览器与接口读回验证，未在vivo Pad3 Pro真机复验；最终效果需用户在平板应用内点“刷新”后确认。

## 仍需处理

- 正式`/admin/`仍无平板布局代码，本次未发布正式站，正式发布需另行授权并先经预览验收。
- 平板布局多次因`preview`从`main`重建而丢失。长期应收敛进`main`，或把`tabletLayout.js`、`TabletNavigation.vue`、`main.js`与`LayoutView.vue`的挂载点纳入重建前检查，避免只留`tablet-landscape.css`残留。
