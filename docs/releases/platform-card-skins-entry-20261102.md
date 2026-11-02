# 平台运营中心新增「背景卡 / 皮肤」入口（正式发布）

日期：2026-11-02（Asia/Shanghai）。用户在聊天中指出现有运营中心左侧没有「背景卡 / 皮肤」，按既有平台后台正式发布授权（2026-10-01，界面直接发正式）执行。

## 问题定位

- 用户截图来自平台后台 `https://pingtai.sxffootball.cn/`（左栏含反馈管理、积分规则、营销活动分组、会员管理、赛事保险、自测身价、AI 形象照、蜂蜜充值、支付设置），不是 `https://www.sxffootball.cn/admin/`（该站左栏只有运营总览/主办方联系人/账号管理/全平台赛事/全平台球队/数据中心/球员卡系统/反馈管理/积分规则/问题与协助/内容运营，无上述营销分组）。
- 平台后台源码 `platform-admin-vue` 中 `playerCards`（球员卡系统）直接挂 `PlayerCardStudio.vue`，即「制作项目 / 已发布样式库 / 发放记录」套系工作室，因此功能存在但没有独立「背景卡 / 皮肤」导航项。
- `feat/card-world-h5-stage1-2` 的 `08e33b0a` 只在 `web-admin-vue` 的运营中心页接线（该页已不是当前线上平台后台），不影响 pingtai。

## 改动

分支 `codex/platform-ops`，仅 1 个文件、6 行新增 4 行调整：`platform-admin-vue/src/views/tournament-center/TournamentCenterAdmin.vue`。

- 新增导航项 `cardSkins`「背景卡 / 皮肤」，排在「球员卡系统」之后。
- `section=cardSkins` 纳入合法 section 白名单，并补充页面标题与说明。
- 「背景卡 / 皮肤」渲染 `PlayerCardStudio.vue`（套系工作室：制作项目 / 已发布样式库 / 发放记录）。
- 「球员卡系统」改为渲染 `PlayerCardTemplateLibrary.vue`（模板编辑 / 成卡库），组件在本工程已有且支持独立挂载；两块不再重复展示同一页。
- 未改动任何接口、数据、权限与后端。

## 发布与回读

- 提交 `af2779273`，发布脚本 `npm run deploy`（构建 → tar → scp → nginx 切 root → 全量摘要回读）。
- 发布号 `20261102103152-af277927`，线上 `release.json` commit 与提交一致，45 个文件摘要一致。
- 线上入口 `assets/index-jYYPlAUh.js`。
- 分包 `assets/TournamentCenterAdmin-Bw2XirIX.js`：HTTP 200 / 473,340 B，SHA-256 `58E580CB4509CF502D1C301C6B1E64D6AB8DA778606AC6424B326F33CD21380C` 与本地一致；命中 `背景卡 / 皮肤` 2、`cardSkins` 4、`制作项目` 1、`模板编辑` 1、`成卡库` 3。
- 发布前线上为 `2026-10-31 15:57` 的 `TournamentCenterAdmin-FhMkkH1G.js`（无 cardSkins）；`77c40d01..HEAD` 期间 `platform-admin-vue` 无其他提交，本次只带入本改动。
- 未做浏览器内账号登录验收：需平台负责人登录后强刷确认两个入口的实际渲染。

## 待确认

- 若希望「球员卡系统」继续保留套系工作室、只新增一个同名入口，需回退本次导航拆分决定；当前实现遵循 `08e33b0a` 在 PC 端的原始拆分意图。
