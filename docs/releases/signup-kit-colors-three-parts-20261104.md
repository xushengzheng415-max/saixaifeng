# 扫码报名比赛服颜色：主备两套补齐上衣/短裤/球袜，颜色面板带真实色块

日期：2026-11-04
分支：`codex/platform-ops`
状态：**本地已完成并通过测试，未部署**（`applyTournament` 云函数待授权发布，小程序待上传新版本）

## 一、用户口径

> 在扫码报名的时候有个问题！选择队服时只能选上衣，不能选短裤和袜子；另外，下拉菜单中仅有文字而无颜色的部分需补充。

## 二、根因

1. 报名页 `miniprogram/pages/tournament/signup/signup.js` 只维护 `kitPrimaryColor` / `kitSecondaryColor` 两个「上衣」字段，提交时固定写 `kitColors.primary.jersey`、`kitColors.secondary.jersey`；`cloudfunctions/applyTournament/index.js` 的 `readKitColor()` 也只读 `jersey`，短裤与球袜此前只能由主办方在 PC 端球队详情补录。
2. 颜色选择用的是原生 `<picker>`，下拉列表只有文字：`range="{{kitColorLabels}}"` 只传了名称数组，微信原生 picker 无法渲染色块，因此「只有文字没有颜色」。

## 三、改动

### 3.1 报名页（小程序）

- `signup.js`
  - 新增 `KIT_SLOTS = [jersey 上衣, shorts 短裤, socks 球袜]`、`KIT_SETS = [primary 主比赛服, secondary 备用比赛服]`；色板继续复用 `KIT_COLOR_OPTIONS`（17 色，全部带 `#RRGGBB`）。
  - 新增页面内选择态 `kitSelection`（不入 data，避免小子段频繁 setData），派生渲染结构 `kitSets`：`syncKitSets()` 预先算好 `color`、`colorLabel`、`valueClass`、`swatchClass`，WXML 只做插值。
  - `onKitSlotTap` / `onKitColorPick` / `onKitColorClear` / `onKitPanelClose` 取代原 `onKitColorChange`；面板标题按「主比赛服 · 短裤」这类口径生成。
  - `kitColorPayload()` 只提交真正选过的部位，未选的短裤/球袜不写空值。
  - 校验口径：**主、备用两套的上衣仍必填**（保持原报名阻塞条件不变），短裤与球袜可按需补充。
- `signup.wxml`
  - 比赛服区块改为两套 × 三个部位的可点色块卡片（`wx:for` 两层，`kitSets → set.slots`），不写任何比较、三元、方法调用或数组索引。
  - 新增底部颜色面板：每个颜色都渲染 `kit-color-dot` 真实色块 + 名称，选中态高亮，已选部位可「清除该部位颜色」。
- `signup.wxss`
  - 删除 `.kit-picker*`，新增 `.kit-slot*`（空白部位用斜纹底表示未选）与 `.kit-panel*` / `.kit-color-*` 样式。

### 3.2 云函数 `applyTournament`

- `readKitColor` → `readKitColors` / `readKitLabels`：按 `['jersey','shorts','socks']` 归一化，仍只接受 `/^#([0-9A-F]{6})$/`，非法色值与非本部位字段不写库。
- 建报名记录时按实际选中的部位落 `kitColors` / `kitColorLabels`（`hasPrimaryKit`、`hasSecondaryKit` 判定），不再固定只写 `jersey`。
- 与 PC 端 `web-admin-vue/src/utils/registrationKitColors.js`（`normalizeKitColors` 已支持 `jersey/shorts/socks`）口径一致，球队详情可直接回显。

## 四、验证

- `node --check miniprogram/pages/tournament/signup/signup.js`、`node --check cloudfunctions/applyTournament/index.js` 通过。
- 新增 `tools/test-mini-signup-kit-colors.cjs` → PASS，覆盖：
  - WXML 表达式红线（无 `===/?/方法调用/数组索引/运算`）、无原生 `<picker>` 残留；
  - 两套比赛服都渲染「上衣 / 短裤 / 球袜」三个部位；
  - 色板 17 项全部带十六进制色值（无「只有文字」项）；
  - 用 `Page()` 桩驱动真实页面方法：选「主比赛服 · 短裤」→ 面板标题与 17 个选项正确、未选时无「清除」、选中后 `color/colorLabel` 正确；
  - 三个部位分别选不同颜色后 `kitColorPayload()` 输出 `{primary:{jersey,shorts,socks}}`；清除球袜后仅剩 `jersey/shorts`；备用套标题与落值正确；
  - 云函数源码断言：三部位归一化、十六进制校验、按已选部位落库、旧 `kitPrimaryColor || kitSecondaryColor` 分支已移除。
- `node tools/check-miniprogram-package-size.cjs`：主包上传口径 **1938.0 KB / 2048 KB（余量 110.0 KB）**，分包归属校验通过。
- `node tools/validate-ui-delivery.js`：仅剩 1 条既有误报（`'/pages/tournament/' + page` 动态拼接未在 `app.json` 登记），与本次改动无关。

## 五、发布计划（待授权）

1. 云函数 `applyTournament`：按「线上包差量 + `node --check`」发布，读回 `Active`、运行时/内存/超时/`InstallDependency` 与环境变量键不变，回下载比对 SHA-256。
2. 小程序：上传新版本（`release.js` 版本号顺延至 1.2.40，条目写「扫码报名可选上衣/短裤/球袜，颜色可看色块」），再按规则同步体验版。
3. 未发布的期间线上行为不变：旧包只提交上衣颜色，云函数改动向后兼容（`jersey`-only 载荷仍按原口径落库）。

## 六、未做

- 未把短裤/球袜改为必填（避免卡住正在报名的球队；如需强制，只改 `updateSubmitStatus` 的 `kitOk` 判定）。
- 未做主/备用撞色实时提示（PC 端「撞色提醒」口径不变）。
- 服务号 H5 报名入口若也采集比赛服颜色，需另行对齐三部位口径。
