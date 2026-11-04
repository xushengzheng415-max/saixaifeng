# 我的球员卡 H5：卡面设计独立页面 + 完整成卡预览 + AI 定妆照入口（2026-11-03）

## 背景

线上正式页 `/service-account-h5/card-world/index.html`（title「我的球员卡 · 赛小蜂足球」）只有
「卡面设置」一个入口且位于主卡区，卡库里每张卡只有「设为主卡」；用户反馈看不到编辑卡面、
换背景，也没有被提醒可以合成自己的 AI 定妆照。

## 线上基线（核对后确认）

| 文件 | 线上实际来源 |
|---|---|
| `card-world/index.html`、`card-world/js/app.js` | 提交 `6db69827`（holo4 发布） |
| `card-world/js/api.js` | 提交 `1ab69b4f`（换回线上裁判回调、支持 H5 预览鉴权） |
| `card-world/css/app.css`、`css/holo-cosmos.css`、`js/holo.js` | 提交 `6db69827` |

仓库此前没有与线上一致的副本：`main` 甚至不含 `service-account-h5/card-world/` 目录，
当前工作分支（`codex/platform-ops`）里的同路径文件是另一套「赛小蜂足球世界」全量玩法页
（index.html 14,708 B）。因此本次改动基于线上真实基线，不做整包覆盖。

## 本次改动

分支 `codex/h5-card-world-edit-20261103`（基于 `6db69827`，并把 `api.js` 对齐到线上 `1ab69b4f`）：

### 第二轮修正（2026-11-03 晚，用户反馈「AI 定妆照跳到不对的页面」）

根因：第一轮把 AI 按钮指向 `../registration-resume.html`，那是「继续球员登记」列表页，与 AI 形象照无关。
真实生成能力在服务号「球员登记 · 形象照」的「✦ 智能生成」弹层（`join-player.html` + `service-entry.js`
的 `aiPortraitOpen`），其输出写进该次登记的 `playerRegistrationPortraits`，并走 `serviceAiPortrait` 计费（100 滴）。

`js/portrait-entry.js`（新增）按既有能力收口：

- 只认本人、**同一支球队**且状态为 `draft` 的登记：`servicePrivateRegistrationList` → 匹配姓名+球队 →
  `servicePrivateResumeRegistration` → 按 `registration-resume.js` 相同格式写入 `sxf_entry_session_<entry>` →
  跳 `../join-player.html?entry=<entry>&ai=1`（该页形象照行就有「✦ 智能生成」）。
- `registered`（已完赛/已入队）回读的是球员卡预览页，没有形象照环节；**其他球队**的未完成登记会生成属于那次登记的形象照，
  不能改到当前卡面 —— 两种情况都不跳转，在 AI 面板内直接说明原因（`#ai-panel-note`）。
- 撤销对 `registration-resume.html` 的跳转。

### 第一轮改动

1. 卡面设计从弹层改为独立页面 `card-world/design.html`（`js/design.js`），不再用 `sheet-mask` / `preview-mask`。
   - 删除 `#settings-mask`、`#preview-mask` 两段弹层标记与对应 JS（`openSettings`、`renderBackgrounds`、
     `renderCrop`、`settingsPayload`、`previewCard`、`saveCard`、`state.settings`）。
   - 主卡「设计卡面」和卡库「编辑卡面」统一跳 `./design.html?playerId=...`。
   - 授权回调会丢掉查询串，`playerId` 另存 `sessionStorage('sxf_card_design_player')` 兜底。
2. 卡面预览改为加载**完整成卡（背景 + 形象照）**：`previewMyPlayerCard` 返回的 `imageData` 直接铺在
   `#design-stage`，不再只显示原始人像；背景缩略图也是各背景下的成卡渲染结果，逐张串行拉取。
3. AI 形象照入口固定在本页两处：`#btn-ai-portrait`（「重点」提示卡）与 `#btn-ai-portrait-crop`（照片构图区），
   失败态另外提供 `#btn-ai-error`。第一轮指向 `../registration-resume.html`，第二轮已改为经 `js/portrait-entry.js` 进入登记形象照环节。
4. 卡库每张卡新增「编辑卡面」。
5. 修正把换照片/照片合成指向小程序的旧文案：小程序只负责签约与组阵。
6. 资源版本号更新为 `?v=20261103-page2`（`css/app.css`、`js/api.js`、`js/app.js`、`js/design.js`、`js/portrait-entry.js`）。

页面不自判会员资格、背景解锁条件与蜂蜜消耗，全部沿用服务端返回；`design.html` 不引入
`holo-cosmos.css`，只保留必要样式。

## 发布状态

| 目标 | 路径 | 状态 |
|---|---|---|
| 测试（独立副本） | `/preview/service-account-h5/card-world-ai/` | 已发布 page2，与正式端字节完全一致 |
| 正式 | `/service-account-h5/card-world/` | **已发布 page2（2026-11-03，用户授权）**，7 个文件回下载字节一致：index 7,135 B、design.html 5,077 B、css/app.css 11,874 B、js/api.js 4,284 B、js/app.js 13,851 B、js/design.js 11,693 B、js/portrait-entry.js 4,167 B |

发布前基线核对（回下载与 git blob 比对，去 BOM/CRLF 后完全相等）：`index.html`、`css/app.css`、
`js/app.js` = `6db69827`；`js/api.js` = 本分支 HEAD（对齐线上 `1ab69b4f`）。未触碰
`js/holo.js`、`css/holo-cosmos.css`、`assets/*`。

预览页：

- 卡库：<https://cloud1-7g8ckb3c7815a011-1419431905.tcloudbaseapp.com/preview/service-account-h5/card-world-ai/index.html>
- 卡面设计：<https://cloud1-7g8ckb3c7815a011-1419431905.tcloudbaseapp.com/preview/service-account-h5/card-world-ai/design.html?playerId=...>
- 正式域名同路径：`https://www.sxffootball.cn/preview/service-account-h5/card-world-ai/`

正式页：

- 卡库：<https://www.sxffootball.cn/service-account-h5/card-world/index.html>
- 卡面设计：`https://www.sxffootball.cn/service-account-h5/card-world/design.html?playerId=...`（从卡库点「设计卡面」自动带上）

注意：`/preview/service-account-h5/card-world/` 上仍是另一套全量玩法页（在途未验收），
本次没有覆盖它，测试副本放在独立 `card-world-ai`。

## 已知限制（需要产品决策）

- AI 定妆照只能在「球员登记 · 形象照」的「✦ 智能生成」里生成，输出属于那一次登记的
  `playerRegistrationPortraits`；**已入队（registered）球员目前没有自助换形象照/AI 定妆照的接口**，
  只能由球队重新发起一次登记邀请。
- `join-player.html?ai=1` 需登记页配合才能自动展开「✦ 智能生成」；该页属 `codex/platform-ops`
  （文件 `service-account-h5/service-entry.js`，本地工作树有大量他人未提交改动），本次未修改，
  因此当前落点仍是登记页的形象照行（点「✦ 智能生成」即可）。
- 若要做「我的球员卡 → 独立 AI 形象照 / 换照片」自助能力，需新增按 `playerId` 校验归属的服务端接口，
  并确认谁能发起、是否需球队审核、与「100 分换照片」的计费关系。

## 验证

- `node --check` 通过：`card-world/js/app.js`、`js/design.js`、`js/api.js`、`js/portrait-entry.js`
- `js/portrait-entry.js` 逻辑自测（`.codex-artifacts/h5-card-edit-20261103/portrait-entry.test.js`）：
  同队待提交 → 命中并写入 `sxf_entry_session_<entry>`；跨队待提交 → 不拉起并给出说明；已登记 → 说明
- 正式端回下载字节级 SHA-256 一致：index.html / design.html / css/app.css / js/api.js / js/app.js / js/design.js / js/portrait-entry.js
- 正式端与测试副本逐文件哈希相同（无落后）
- 残留扫描：`settings-mask`、`preview-mask`、`openSettings`、`crop-image`、`btn-ai-portrait-sheet` 均为 0 命中；
  `registration-resume` 链接 0 命中（只剩 `join-player.html?entry=...&ai=1`）
- 待真机确认：设计页打开即显示含背景的成卡；切换背景大图与缩略图同步更新；有同队待提交登记时 AI 按钮进入登记形象照行；否则原地说明
- 回滚基线：`.codex-artifacts/h5-card-edit-20261103/prod-readback-page1/`（page1 正式字节）
