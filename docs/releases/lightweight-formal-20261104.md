# 轻量赛事模式正式发布（2026-11-04）

用户确认方案①：把已在 `/preview/admin/` 验收的「轻量赛事模式（只记比分/做排名）」合入 `main`，并发布正式 `/admin/`，随后同步测试端 `/preview/admin/`。

## 一、源码与提交链

| 环节 | 提交 | 说明 |
|---|---|---|
| 正式基线 | `26a41dc9` | 本地 `main`，含排程阻断与背景卡/皮肤入口 |
| 轻量功能来源 | `03e1860a`、`e177293f` | `feature/lightweight-tournament-20261102`（整链路 + 数据边界收窄与队徽抠图链路对齐） |
| 轻量合入 main | `06928f39` | 合并提交 |
| 纳入 GitHub main 最新 | `a36625ef` | 合入 `3590c8e4`/`d45e5626`（球队负责人权威显示，含 `TeamDetail.vue`） |
| 统一 main/preview 拓扑 | `01931997` | 纳入远端 preview 合并提交 `aa15a31b`，树与 `a36625ef` 相同 |

- 合入文件：PC 前端 10 个（含新增 `web-admin-vue/src/components/tournament/TeamLogoAiGenerator.vue`、`web-admin-vue/src/utils/lightweightMode.js`，以及 `LayoutView.vue`、`PairingResult.vue`、`TournamentConsole.vue`、`TournamentCreateBasic.vue`、`TournamentEditBasic.vue`、`TournamentResultCenter.vue`、`TournamentScheduleV2.vue`、`TournamentTeams.vue`），小程序 3 个，共享后端 4 个。
- 唯一冲突：`TournamentScheduleV2.vue` 的 `<style>` 块（排程阻断 `auto-issue` 与轻量 `light-score`/`quick-schedule` 并存）。两侧样式均保留，未删除任一侧功能。
- 合入后 `cloudfunctions/dataCenter/shared/service.cjs`、`generateAIImage/index.js`、`resultCenter/index.js`、`serviceMatchWorkflow/index.js` 与轻量分支 `e177293f` 逐文件一致。

## 二、后端状态（未重复发布）

轻量所需共享后端已在预览验收阶段上线，正式与测试共用同一份：

- `dataCenter` 修改时间 `2026-11-02 20:25:16`、`resultCenter` `20:26:00`、`generateAIImage` `20:08:07`；线上包内均含 `lightweightMode` 判定，`generateAIImage` 已含 `generateTeamLogoCandidates`、`removeLogoBg` 调用与 `generated_not_cutout` 标记；`serviceMatchWorkflow` 包内同样含 `lightweightMode`（第 2392 行）。
- 因此本次未上传任何云函数，配置与环境变量未变更。

## 三、构建与部署

构建均在 `web-admin-vue` 独立工作区（`E:\Documents\sxf-light-formal-20261104`，`node_modules` 经 junction 复用主仓），未使用含其他任务未提交改动的 `codex/platform-ops` 工作区。

| 端口 | 构建 base | 入口 | 线上 SHA-256 读回 | 上传 |
|---|---|---|---|---|
| 正式 `/admin/` | `/admin/` | `assets/index-C0t66jEi.js`（289,524 B） | `E82E0AC2A674590583EABC3C90AAD740BB785D327BC55BEFBBBEC1D902281016` 与本地一致 | 407 文件成功 |
| 测试 `/preview/admin/` | `/preview/admin/` | `assets/index-DXWhunM0.js`（289,556 B） | `B7847090D3F3240DED880778F6BF8F564EA1C4CBE060D355CECD5031ADF8F992` 与本地一致 | 407 文件成功 |

关键分包读回：

- 正式 `TournamentScheduleV2-DNUxdfjg.js` 222,772 B、`TournamentTeams-HAqbUhPv.js` 241,804 B。
- 测试 `TournamentScheduleV2-DBPtPsdR.js` 222,804 B、`TournamentTeams-YgyRcNyl.js` 241,852 B，两者线上 SHA-256 与本地构建一致。
- 两站同一分包去掉 base 前缀后字符数完全相同（ScheduleV2 206,803；Teams 221,274），差异仅出现在依赖列表里的入口/chunk 文件名引用，业务代码逐字符一致。
- 文案命中：正式 ScheduleV2 含「轻量模式」3 处、「一键生成赛程」5 处、「自动排程未完成」1 处；正式 Teams 含「AI 队徽」5 处、「白底（未抠图）」1 处。

## 四、验证

- `node --check`：4 个云函数文件与 3 个小程序页面文件通过。
- 前端产物 407 文件，`dist` 内无 `@cloudbase/js-sdk` 引用，入口与分包路径均带 `/admin/`、`/preview/admin/` 前缀。
- 构建纪律：每次构建前清空 `dist`，串行执行，避免并发写产物（首次并行误发命令造成一次 `prepareOutDir` 失败，已作废并重做）。
- 分支读回：GitHub `main` `3590c8e4..01931997`、`preview` `aa15a31b..01931997`；Gitee（及本地 `origin`）`main`/`preview` `18ce22ba..01931997`，均为快进推送。

## 五、遗留与说明

- `node tools/sync-data-center.mjs --check` 在正式基线 `26a41dc9` 上即为不通过（既有存量不同步，涉及 `updateMatch`、`playerCardPublishWorker`、`serviceMatchWorkflow` 等副本）；本次合并新增 1 项 `resultCenter/service.cjs`。轻量的平台级过滤只在「未限定单赛事」时生效，`resultCenter` 处理单赛事口径，故未做全量 `sync`，以免覆盖其他会话在途副本。需后续单独整理。
- 小程序 3 个文件已进源码，但本次任务范围仅 PC，未上传体验版、未提交审核。
- 正式环境上线后建议按现场验收：轻量赛事「录入比分 → 自动排名」、一键生成赛程、AI 队徽生成与本地抠白提示、球队负责人显示。
