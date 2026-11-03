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

1. 卡面设计从弹层改为独立页面 `card-world/design.html`（`js/design.js`），不再用 `sheet-mask` / `preview-mask`。
   - 删除 `#settings-mask`、`#preview-mask` 两段弹层标记与对应 JS（`openSettings`、`renderBackgrounds`、
     `renderCrop`、`settingsPayload`、`previewCard`、`saveCard`、`state.settings`）。
   - 主卡「设计卡面」和卡库「编辑卡面」统一跳 `./design.html?playerId=...`。
   - 授权回调会丢掉查询串，`playerId` 另存 `sessionStorage('sxf_card_design_player')` 兜底。
2. 卡面预览改为加载**完整成卡（背景 + 形象照）**：`previewMyPlayerCard` 返回的 `imageData` 直接铺在
   `#design-stage`，不再只显示原始人像；背景缩略图也是各背景下的成卡渲染结果，逐张串行拉取。
3. AI 形象照入口固定在本页两处：`#btn-ai-portrait`（「重点」提示卡）与 `#btn-ai-portrait-crop`（照片构图区），
   失败态另外提供 `#btn-ai-error`，均跳 `../registration-resume.html`（服务号「球员登记 · 形象照」的智能生成）。
4. 卡库每张卡新增「编辑卡面」。
5. 修正把换照片/照片合成指向小程序的旧文案：小程序只负责签约与组阵。
6. 资源版本号更新为 `?v=20261103-page1`（`css/app.css`、`js/app.js`、`js/design.js`）。

页面不自判会员资格、背景解锁条件与蜂蜜消耗，全部沿用服务端返回；`design.html` 不引入
`holo-cosmos.css`，只保留必要样式。

## 发布状态

| 目标 | 路径 | 状态 |
|---|---|---|
| 测试（独立副本） | `/preview/service-account-h5/card-world-ai/` | 已发布（2026-11-03 第 2 次），回下载字节一致：index 6,899 B、design.html 4,770 B、css/app.css 11,785 B、js/app.js 13,073 B、js/design.js 11,161 B |
| 测试（依赖补齐） | `/preview/service-account-h5/registration-resume.html`、`.js` | 已发布（原 404，取正式字节） |
| 正式 | `/service-account-h5/card-world/` | **未发布，待授权** |

预览页：

- 卡库：<https://cloud1-7g8ckb3c7815a011-1419431905.tcloudbaseapp.com/preview/service-account-h5/card-world-ai/index.html>
- 卡面设计：<https://cloud1-7g8ckb3c7815a011-1419431905.tcloudbaseapp.com/preview/service-account-h5/card-world-ai/design.html?playerId=...>
- 正式域名同路径：`https://www.sxffootball.cn/preview/service-account-h5/card-world-ai/`

注意：`/preview/service-account-h5/card-world/` 上仍是另一套全量玩法页（在途未验收），
本次没有覆盖它，改动放在独立 `card-world-ai` 副本中，避免清除他人未验收内容。

## 验证

- `node --check` 通过：`card-world/js/app.js`、`js/design.js`
- 回下载字节级 SHA-256 一致：index.html / design.html / css/app.css / js/app.js / js/design.js
- 残留扫描：`settings-mask`、`preview-mask`、`openSettings`、`crop-image`、`btn-ai-portrait-sheet` 均为 0 命中
- 依赖可达：`../registration-resume.html`、`js/api.js`、`js/holo.js`、`css/holo-cosmos.css`、`assets/cosmos/*` 全部 200
- 待真机确认：设计页打开即显示含背景的成卡；切换背景大图与缩略图同步更新；两处 AI 按钮能进「智能生成」形象照；保存后回到卡库
