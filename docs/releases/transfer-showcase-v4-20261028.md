# 2026-10-28 发现页转会口径 A2 + B2（`transfer-showcase/4`）后端部署 + 小程序上传记录

## 授权与范围

- 用户 2026-10-28 先确认「按 A2 + B2 方案执行」，随后回复「好的，执行部署并上传小程序」，授权两件事：①把本地已完成的 `transfer-showcase/4`（B2 口径）差量部署到生产 `dataCenter`；②上传小程序开发版。
- 本轮只改 `cloudfunctions/dataCenter/transfer/showcase.cjs`（后端唯一改动）与小程序 `pages/discover/*`（`discover.js`／`discover-model.js`／`discover.wxml`／`discover.wxss`）＋ `config/release.js` 版本说明。
- 未改函数配置（运行环境／内存／超时／环境变量）、未写业务数据、未建集合与索引、未推送 Git、未设置体验版与提交审核。

## 一、后端 `dataCenter` 差量部署

### 发布前核对

- 基线 = `fn code download dataCenter` 回下载的线上整包（`work/dc-online-b2-20261028`，排除 `node_modules` 共 39 个源文件）。
- staging = 基线整包 + 本轮 `transfer/showcase.cjs`（22,783 B → 26,100 B）。
- 与基线逐文件 SHA-256 比对：`ONLY_BASE=[]`、`ONLY_STAGE=[]`、`CHANGED=["transfer/showcase.cjs"]`，**只有这 1 个文件变化**。本地其他会话在 `dataCenter` 的未提交改动（`durationVerification.cjs`、`identity.cjs`、`staffPolicy.cjs`、`shared/membership.cjs`、`shared/service.cjs`、`shared/write-policy.cjs`、`shared/tournament-boards.*`）**未进入发布包**。
- staging 的 `shared/reader.cjs`、`shared/roster.cjs`、`shared/valuation.cjs`、`shared/valuation-view.cjs` 与本地 **SAME**，v4 未新增共享依赖，线上既有函数即可支撑。

### 发布与读回

- 发布前 staging `node --check transfer/showcase.cjs` 通过。
- 命令：`sxf-cloud.ps1 football run fn code update dataCenter --dir <staging> --deployMode cos` → **函数代码更新成功**。
- 读回：`fn code download dataCenter`（`work/dc-readback-b2-20261028`）与 staging 逐文件 SHA-256 **39/39 一致（ONLY_BASE=[] ONLY_STAGE=[] CHANGED=[]）**；`index.js` 6,582 B、`transfer/showcase.cjs` 26,100 B、`transfer/service.cjs` 95,485 B 等 8 个关键文件全部 SAME。
- `fn detail dataCenter`：状态 部署完成、CodeSize 11,305,790 B、Nodejs18.15、512MB、150s、InstallDependency TRUE、ModTime `2026-10-28 14:24:07`、无环境变量、无触发器。
- 线上探针（`--params`，无身份）：
  - `{"action":"transferShowcase"}` → `schema:"transfer-showcase/4"`、`scope.mode:"platform"`、`playerPool:"rank"`、`playerTotal:1`、`playerMeasuredCount:1`、`playerLimit:30`；`players[0]` 姚树基 `moneyState:"measured"`、`moneyText:"¥260"`；`transferCount:0`、`rising:[]`。
  - `{"action":"transferShowcase","tournamentId":"22dda3756aa93fd70002a29257a61fe6"}`（2026年第六届开封“立洋杯”足球联赛）→ `rosterState:"ready"`、`playerPool:"roster"`、`playerTotal:322`、`playerMeasuredCount:1`、`playerLimit:30`；第 1 名姚树基 `measured`，第 2–5 名（陈志杰／王昊／张琪／段重旭）`moneyState:"not_measured"`、`money:null` 且**照常下发形象照**；`ageGroups` 返回老年组／青年组／中年组三个竞赛组别。
- 探针引号踩坑补充：`sxf-cloud.ps1` 经 PS5 → npx 传参时**内嵌双引号会被丢弃**，`db nosql execute --command` 的 JSON 数组无法内联传递（`[{find...` 直接解析失败）；`fn invoke --params '{"...":"..."}'` 这种不含空格的扁平 JSON 可以正常传。只读查集合本轮未完成，改用 `fn invoke` 探针验证。

## 二、小程序上传（v1.2.22 开发版）

- `config/release.js`：`version=1.2.22`、`releaseDate=2026-10-28`、`status=体验版`、`title=发现·转会数据口径与城市来源修正`，`sections` 头部新增「发现页转会口径」3 条（共 36 段）。
- 命令：`cli.bat upload --project 'E:\Documents\sxf-football\miniprogram' -v 1.2.22 -d "赛事转会分栏展示已审核名单全员，未测算与青少年不公开如实标注；球队城市改取球队资料并支持补充" -i work/upload-1.2.22-info.json` → **upload 成功**（AppID `wx57164cca8676f411`）。
- 体积：`TOTAL 3,453,669 B`、`main 1,802,203 B`、`/pages/team/ 740,891 B`、`/pages/tournament/ 419,884 B`、`/packageDiscover/ 371,139 B`、`/pages/match/ 85,452 B`、`/packageA/ 34,100 B`；主包余量约 244 KB。
- 上传踩坑：`--project miniprogram`（相对路径）在 CLI 新起 IDE server 时被判定 `PROJECT_CONFIG_JSON_NOT_VALID_OR_NOT_EXIST (code 19)`；改为**绝对路径**即可。`project.config.json` 本身合法（appid `wx57164cca8676f411`、`ignoreUploadUnusedFiles:true`）。
- 上传成功只等于生成**开发版 v1.2.22**，未设置体验版、未提交审核。工作区其他会话未提交的小程序改动同样进入本次包。

## 三、验证（本地）

- `node --check`：`showcase.cjs`、`discover-model.js`、`discover.js`、`config/release.js` 通过。
- 后端桩件 29 项全 PASS（全平台 rank；赛事 roster 5 人入池、4 人出行；青少年 `hidden` 不给金额与形象照；`not_measured` 保留形象照；pending 名单行排除；缺资料计入 `skipped`；年龄段细分；无名单赛事空态；缺集合降级 `not_recorded`）。
- 前端桩件 26 项全 PASS（两种 `playerEndText`；三种身价状态文案与样式类；不公开球员不谎称「暂无身价快照」；缺名单赛事空态；城市三档文案）。
- WXML 扫描：无比较、三元、方法调用、数组索引；仅新增 `class="{{item.moneyClass}}"` 一处绑定。
- `tools/test-data-center.mjs`、`tools/test-transfer-center.cjs`、`tools/test-mini-transfer-center-pages.cjs`、`tools/test-guest-experience.cjs`、`tools/check-data-governance.mjs` 全部通过。
- `tools/sync-data-center.mjs --check` 仍报 12 项既有 CRLF 差异（`getMiniWorkspace`／`webLoginApi`／`resultCenter`／`updateMatch`／`serviceMatchWorkflow`／`playerCardPublishWorker`／`friendlyMatchCenter` 的 `statistics.mjs`／`service.cjs`），逐文件比对为其他会话换行漂移，与本轮无关，未执行 sync。

## 四、未完成／后续

- **体验版与真机验收**：需在微信公众平台设置体验版，并按真实手机尺寸验收「赛事范围发现球员 30 条、未测算与青少年文案、城市胶囊说明与补充入口」。生产全平台口径仍只有 1 名已测算球员，属真实数据状态。
- **展示上限**：立洋杯赛事口径池 322 人、页面一次展示 30 条（`playerLimit:30` 为既有上限，页面无续页）。若希望赛事内可继续浏览，需要在页面加续页或提高上限——属展示决策，未擅自改动。
- 生产无已完成转会与自由签约，转会焦点与最新转会仍为空态；公开球员资料页未开放（蜂蜜滴数标准未定）。
- 工作区改动未提交 Git，需按归属会话分别提交。
