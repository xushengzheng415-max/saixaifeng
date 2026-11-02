# 赛程填写表按比赛顺序输出 2026-11-02

状态：正式 `/admin/` 与测试 `/preview/admin/` 已发布并读回通过。本轮只改 PC 端「下载赛程表（赛程填写表）」的行顺序，未改动小程序、H5、桌面客户端与云函数。

## 问题

用户下载的「校长杯-全部组别-赛程填写表」行序为 A 组全部打完再 B、C、D 组，三四名赛排在决赛之后。原因有两层：

1. 导出行顺序只按 `matchNo` 排序，而历史对阵数据的 `matchNo` 是「组内铺满」编号，因此即使阅读目标是按轮次跨组，导出仍呈现 A 组铺满。
2. 已经排过日期/时间的旧场次受 `matchIsProtectedFromPairingReplace` 与 `ensureConfirmedDivisionPairings` 保护（`pairingGenerationSource !== 'confirmed-draw-v1'` 视为权威），点「生成对阵」不会替换旧对阵，所以旧数据里的 `A组第1 VS B组第1`、决赛在三四名之前等内容仍然存在。

## 修改

`web-admin-vue/src/utils/scheduleTemplateWorkbook.mjs` 新增比赛顺序排序：阶段档位（小组赛 → 1/4 等前期淘汰 → 排位 → 半决赛 → 三四名 → 决赛）→ 轮次 → 小组 → 场序，直接复用云函数 `generateSchedule/stageOrder.cjs` 的 `stageRankOf` / `cnToNumber`，不再另写一套阶段判断。旧数据经此排序后同样按「第一轮 A→D 组连续、第二轮再统一开赛」阅读，决赛恒为最后一场。

浏览器包内不允许残留裸 `require`，本轮已用现有 Vite `enforce:'pre'` 插件把 `stageOrder.cjs` 转成 ESM（提交 fa5c6927，预览白屏修复），正式包同样只保留 element-plus 内部 try/catch 的 `require("util")`。

## 验证

本地用 ExcelJS 读回生成的填写表断言两种数据：

- 旧口径数据（`matchNo` 组内铺满）：主序 `1,2,7,10,13,3,4,8,11,14,5,6,9,12,15,16-19,20,21,23,22`，即第一轮跨组、三四名赛在决赛之前。
- 新口径数据（按轮次跨组编号）：排序结果与原顺序一致，不破坏新数据。

构建检查：两站 `dist/index.html` 分别指向 `/preview/admin/assets/index-PTIQwVZ4.js`、`/admin/assets/index-DBtxv7by.js`；全部 JS 无裸 `require`，未引入 `@cloudbase/js-sdk`；`node tools/check-pc-alignment.mjs --live` 两通道 PC 源码摘要一致（`ef32fb09…`，`sourceDirty` 均为 false）。

线上读回：正式入口 `https://www.sxffootball.cn/admin/` 与源站入口 HTTP 200、SHA-256 均为 `2A0EB441…DB5B7C`，入口 JS/CSS 均 200；测试入口 `https://www.sxffootball.cn/preview/admin/` SHA-256 为 `95C66F95…049239`。桌面客户端 `smoke.cjs` 正式与 `--preview` 各 8 项通过。

## 仍需在业务数据侧处理

线上数据不受本轮前端改动影响。若要拿到新的对阵内容（相邻组交叉 `A1-B2 / C1-D2 / B1-A2 / D1-C2`、三四名赛与决赛的新场序），仍需在该赛事按「重置赛事时间 → 重新保存并确认抽签（会清空旧赛程）→ 生成对阵 → 自动排程 → 下载赛程填写表」重生成；旧对阵属于受保护历史数据，未获授权不做批量替换。

## 对齐重发（正式 + 测试，以本节为准）

首次发布后，正式与测试的线上 `pc-release.json` 仍记录旧的 `sourceCommit`，用户要求直接对齐正式版，故以当前 `main`/`preview` 同一提交 `8b5cf664` 重新构建两站并重发（绝对路径上传，各 407 个文件）：

| 通道 | 入口 | `index.html` SHA-256 | `pc-release.json` |
|---|---|---|---|
| 正式 `/admin/` | `/admin/assets/index-DAlGyDTc.js` | `13C8E508…95E0C7` | `sourceCommit=8b5cf664`，`formalBaselineCommit=8b5cf664`，`pcSourceSha256=ef32fb09…`，`sourceDirty=false` |
| 测试 `/preview/admin/` | `/preview/admin/assets/index-C_zASndt.js` | `FE9B79AD…CC6D456` | `sourceCommit=8b5cf664`，`pcSourceSha256=ef32fb09…`，`sourceDirty=false` |

线上入口与本地构建 SHA-256 逐一相等；入口 JS、填写表所在分块 `TournamentScheduleV2-CU3h4i0U.js`、`pc-release.json` 均 HTTP 200；`check-pc-alignment.mjs --live` 返回 `sourceAligned=true`；`smoke.cjs` 正式与 `--preview` 各 8 项 `passed`。

线上包内代码核对：`TournamentScheduleV2-CU3h4i0U.js` 同时包含 `赛程填写表` 文件名与比较器 `stageRankOf → 轮次 → 小组 → matchNo`，说明线上「下载赛程填写表」用的是新排序规则，而不是旧的 `matchNo` 单键排序。

上一节中 `index-DBtxv7by.js`、`index-PTIQwVZ4.js` 及对应摘要是首次发布记录，已被本节数值取代。

## 发布过程记录

发布用的临时异常：`sxf-cloud.ps1` 会 `Push-Location` 到仓库根再执行 `tcb`，因此相对路径 `web-admin-vue/dist` 实际取的是根工作区（`codex/platform-ops`）的构建产物。首次预览上传因此写入了错误的构建，已立即用绝对路径重新上传 407 个文件并读回正确入口；正式发布改用绝对路径 `…\schedule-formal-20261102\web-admin-vue\dist`。后续发布一律使用绝对路径。

源码提交 `3964f4c5`（修复）与 `8b5cf664`（发布记录 + 对齐基线）。线上两站均以 `8b5cf664` 构建，`pc-release.json` 的 `sourceCommit`、`formalBaselineCommit` 与仓库分支一致；后续只追加文档的提交不改变 PC 源码摘要，不会使两站失效。
