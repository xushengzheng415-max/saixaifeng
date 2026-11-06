# 平板横屏阵容球员卡整体缩小（测试站）

2026-11-06，用户真机截图反馈平板测试版里阵容（双队）球场的球员卡偏大，要求把 PAD 端球员卡版面整体调小，且手机端与 PC 端不受影响。本次只改平板断点下球场槽位球员卡的外框尺寸，发布到测试站 `/preview/admin/`；未改正式 `/admin/`、云函数、数据库、登录与权限链路。

## 定位依据

截图顶部为「赛小蜂足球 · 平板测试版」原生平板外壳，页面内容为「导出 / 保存双方阵容」的双队阵容编辑器，右侧那张卡片是球场槽位里已分配球员的成卡（状态占位显示「李帅杰 / 正在加载…」）。对应源码为 `web-admin-vue/src/views/tournament/VisualLineupEditor.vue` 的 `dual` 模式（由 `MatchDetail.vue` 引入），槽位卡外框为 `.slot-card-wrapper` 的固定 `126 × 181`。

## 改动

仅 `web-admin-vue/src/views/tournament/VisualLineupEditor.vue` 样式末尾新增一条平板范围规则：

```scss
html[data-tablet-landscape] .visual-lineup-editor .dual-player-slot .slot-card-wrapper {
  width: 96px;
  height: 138px;
}
```

- 单位面积缩小约 24%，比例仍为成卡原始 30:43（96 / 138 ≈ 0.696），属于整卡等比缩放。
- 卡内模板、字段、坐标、字号与绘制逻辑完全没有改动，仍由统一球员卡模块生成成卡后再缩放。
- 桌面基线 `.slot-card-wrapper { width: 126px; height: 181px; }` 保持不变；手机端小程序不涉及。
- 平板标识沿用既有的 `html[data-tablet-landscape]`（原生 `SxfFootballPad` 或横屏触控媒体条件写入），与平板导航紧凑布局同一来源。

## 验证与发布

- 分支 `codex/pad-lineup-card-scale-20261106` 从 `preview`（`1e3a4ed51`）建立，只含该文件。
- `npm ci` 后 `VITE_APP_BASE=/preview/admin/ npm run build` 通过（27.24s），`dist` 409 个文件，`dist/index.html` 入口只引用 `/preview/admin/assets/`。
- `dist/pc-release.json`：`channel=preview`、`sourceCommit=09d9b286f`、`sourceDirty=false`。
- 产物摘要：`assets/MatchDetail-DGT4_CoM.css` SHA-256 `FEC7C1D4DECA6E37DB362E2DE0A9AC540B09C8493DD07AD9DF2917480F1850EB`、`assets/MatchDetail-CHL5yIXU.js` SHA-256 `7A4DF8982A7E3C50AF1A647F4A7A1A114FDF9A3678A9DDF9E0FDC412E3D1E3BB`、`index.html` SHA-256 `38D083DE535EB038D3E8452DD17B2783DE28CBBF8A0E5C0112FF8373B97BE554`。
- `sxf-cloud football run hosting deploy <worktree>/web-admin-vue/dist preview/admin` 成功，409 个文件。
- 线上读回：`/preview/admin/index.html` 返回 200 且入口为 `/preview/admin/assets/index-BSp_B9SF.js`、`/preview/admin/assets/index-7eBerNJa.css`；下载 `MatchDetail-DGT4_CoM.css`、`MatchDetail-CHL5yIXU.js`、`index.html` 三项 SHA-256 与本地构建逐字节一致。线上 CSS 同时包含平板规则 `width:96px;height:138px` 与桌面基线 `width:126px;height:181px`。
- 正式 `/admin/index.html` 仍返回 200，入口仍是正式自己的 `/admin/assets/index-BnszUzkD.js`，本次未修改正式站。
- 证据目录：`output/pad-card-scale-20261106/`。

## 仍需处理

- 用户需在平板应用内点「刷新」或重开应用，才会加载新的 `/preview/admin/` 资源。
- 该效果为构建产物与线上资源读回验证，未在 vivo Pad3 Pro 真机复验；如仍偏大或偏小，只需调这一处尺寸。
- 正式 `/admin/` 需要另行授权，把它合入 `main` 并按正式流程发布。

## 第二轮（同日真机反馈后）

真机反馈两点：卡片 96×138 仍然偏大；球场背景草皮与白线完全不显示。

- 卡片：平板断点尺寸由 `96×138` 继续改为 `64×92`，比例仍为 30:43，卡内布局与绘制逻辑不变；桌面基线 `126×181` 未改。
- 球场：用同一构建产物、线上 CSS 与线上图片在 1237×688 视口复现，球场正常显示，说明页面代码、样式与图片本身没有问题；平板端不显示更可能卡在这张 `10667×4583 / 884332 字节` 的超大背景图在 WebView 里加载或解码失败。为此把 `src/assets/images/football-field-dual.jpg` 等比压到 `3200×1375 / 232181 字节`（质量 86），白线与草皮视觉保留。该文件同时被 PC 双队球场使用，视觉一致，只是体积和像素尺寸下降。
- 第二轮构建：`VITE_APP_BASE=/preview/admin/ npm run build` 通过，`pc-release.json` 为 `sourceCommit=aa9669d4f`、`sourceDirty=false`；`dist` 409 个文件。
- 第二轮部署：`preview/admin` 上传 409 个文件成功。
- 第二轮读回：`/preview/admin/index.html` 200，入口 `/preview/admin/assets/index-DE0T0v6X.js`、`index-7eBerNJa.css`；线上 `MatchDetail-BzUCkaYr.css` SHA-256 `844EF9BF50BEDBF998E0BC6A562CF57A040FA6F75217747CA478A5E489C6A0B1` 与本地一致，含平板规则 `64×92` 与桌面基线 `126×181`；线上 `football-field-dual-BhX1KT2o.jpg` 为 232181 字节，SHA-256 `6E6737ABF3833558B9A9A216297262AC8A156CF47C54B6D063C95385C72EB076` 与本地一致。正式 `/admin/` 本次未部署。
- 仍需真机确认：平板应用内「刷新」后看球场是否恢复、卡片大小是否合适。若球场依旧空白，则需要平板端 WebView 控制台或日志继续排查。
