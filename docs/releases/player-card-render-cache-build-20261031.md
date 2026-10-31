# 成卡导出缓存键加入渲染口径版本 · 2026-10-31

> 现象：平台制卡系统「排版预览」是新版面，球员详情与 H5「我的球员卡」仍是旧版面（国旗/队徽位置与字重不一致）。

## 原因

1. 球员详情（PC）与 H5 卡库只发 `dynamicCardProtocol`、不发 `playerCardRendererVersion`，因此 `playerCardAccess.webDynamic=false` → `playerCardReader.readCards` 走 `playerCardDynamic.exportCard()` 生成并缓存静态成卡 PNG。
2. `exportCard` 的缓存键只含 `card.dataVersion + VERSION`，不含渲染器代码口径。2026-10-29 的 `8ae968e0` 改动徽标锚点（`badges.y` = 上边缘）、国旗/队徽不再上移半高、国籍文字 700 字重，但没有抬 `RENDER_VERSION='resvg/2'` / `VERSION='player-card-dynamic/1'`，改动前的导出图一直被判定有效并复用。

## 源码改动

| 位置 | 内容 |
|---|---|
| `webLoginApi/playerCardRender.cjs`、`getMiniWorkspace/playerCardRender.cjs` | 新增并导出 `RENDER_BUILD='resvg-20261029-1'`（两份副本内容一致）；口径变化必须抬高该值 |
| `webLoginApi/playerCardDynamic.cjs` | `exportCard` 顶部统一 `require('./playerCardRender.cjs')`；导出缓存键改为 `card.dataVersion + VERSION + renderer.RENDER_BUILD (+':1')` |

## 校验

- `node --check`：两份 `playerCardRender.cjs`、`playerCardDynamic.cjs` 通过
- `node tools/test-player-card-unified.mjs`、`test-player-card-workflows.cjs`、`test-player-card-preload.cjs`、`test-player-card-legacy-read.cjs`、`test-player-card-cors-cache.cjs` → PASS
- `test-player-card-library.cjs`、`test-player-card-workflow-render.cjs`、`test-player-card-publish-cache.cjs` 为既有失败（stash 基线复跑与依赖分析确认与本次改动无关）
- `node tools/check-referee-backend-package.cjs <发布包>` → PASS（含报名 Word 上传权限检查）

## 发布

- `webLoginApi`：线上下载包为基线 → 仅替换 `playerCardRender.cjs`、`playerCardDynamic.cjs` → check → `fn code update webLoginApi --dir <包目录>`（共 6701 个文件）
- 保留线上配置：`Nodejs18.15`、`MemorySize=512`、`Timeout=120`、`Handler=index.main`、`InstallDependency=TRUE`、28 个环境变量键（仅回读键名，不打印值）
- 平台后台（同一任务的前序改动，按平台正式发布授权发布）：
  - `20261031074209-acbf061a`：基础卡新增「沿用新版排版」，指向最新已发布全平台金银铜套系
  - `20261031075742-77c40d01`：发布页按钮禁用时显式给出原因（无新草稿 / 预览未加载完）

## 发布回读（2026-10-31）

| 目标 | 文件 | SHA-256 | 比对 |
|---|---|---|---|
| webLoginApi 回下载 | `playerCardRender.cjs` | `5789A44B7310543235B8DDC0BCA3736AA919FEBED4763BF8A44944BCE2EE043D` | 与上传包一致 |
| webLoginApi 回下载 | `playerCardDynamic.cjs` | `79EF213053B78D80FC3D7FBF9C4306D98EF394B420DDFE67B67F66F227996700` | 与上传包一致 |
| webLoginApi | 其余 6699 个文件 | — | 除 `node_modules/.package-lock.json`（部署时重新生成）外全部一致 |
| webLoginApi 函数状态 | — | — | `Status=Active`、`AvailableStatus=Available`、`ModTime=2026-10-31 18:24:22` |
| webLoginApi HTTP 入口 | `checkLogin` | — | `HTTP 200`，返回 `AUTH_REQUIRED`（预期） |
| pingtai.sxffootball.cn | 45 个文件 | — | 摘要一致（两次发布均回读通过） |

## 后续

- 部署后球员详情与 H5 卡库首次读取会按新缓存键重生成成卡，无需在平台后台重发模板版本（同版本重发不改变 `dataVersion`，也不会触发重画）。
- 本次修复只影响按需导出的成卡；发布流程只在有 `draftVersion > publishedVersion` 时可用，因此「重复发布」并不是重生成成卡的手段。
- `main` 分支当前尚未包含 `RENDER_BUILD`（`main` 正被另一工作树的会话占用）；后续基于 `main` 的 webLoginApi 发布必须先把这两个文件引入，避免旧缓存键重新生效。
- webLoginApi 为共用正式后端，无独立测试副本；本期 PC 后台与 H5 代码未改动，无测试端同步项。
