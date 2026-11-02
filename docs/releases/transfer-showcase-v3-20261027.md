# 2026-10-27 发现页「转会」公开市场 v3（`transfer-showcase/3`）后端部署 + 小程序上传记录

## 授权与范围

- 用户 2026-10-27 回复「好的，执行部署并上传小程序」，授权两件事：①把上一轮已本地完成的 `transfer-showcase/3` 后端差量部署到生产；②上传小程序包。
- 本轮**只改 `dataCenter` 代码**（`index.js` 注释 + 新增 `transfer/showcase.cjs`）与**小程序分包结构**（`pages/discover/record` 及其独占底图迁入新分包 `packageDiscover`）。
- 未改函数配置（运行环境／内存／超时／环境变量）、未写业务数据、未建集合、未建索引、未推送 Git、未设置小程序体验版。

## 一、后端 `dataCenter` 差量部署

### 部署前核对（只读）

- 生产环境 `cloud1-7g8ckb3c7815a011`，函数 `dataCenter`，原部署时间 2026-10-27（上一轮 10-26 的 8 文件发布）。
- 基线 = `tcb fn code download dataCenter` 回下载的线上整包（6431 文件）。
- staging = 线上整包 + 新增 `transfer/showcase.cjs` + 改后 `index.js`。
- 与基线逐文件 SHA-256 比对（排除 `node_modules`，38 个源文件）：`CHANGED=index.js`、`ONLY_STAGE=transfer\showcase.cjs`，**无其他差异**。
- 其他会话在 `cloudfunctions/dataCenter` 的未提交改动（`identity.cjs`、`staffPolicy.cjs`、`shared/awards.cjs`、`shared/service.cjs`、`shared/standings.cjs`、`shared/statistics.mjs`）**未进入发布包**，避免替其他任务越权发布。
- staging 内 `shared/reader.cjs`、`shared/roster.cjs`、`shared/valuation.cjs`、`shared/valuation-view.cjs`、`shared/support.cjs`、`identity.cjs`、`staffPolicy.cjs`、`package.json` 与本地 **SAME**（`showcase.cjs` 的三个依赖 `../shared/reader.cjs`／`../shared/valuation.cjs`／`../shared/roster.cjs` 线上均已存在且内容一致）。

### 本次变更

- 新增 `transfer/showcase.cjs`（22,783 B）：`SCHEMA = 'transfer-showcase/3'` 的公开只读投影，唯一数据口径来源。
  - 成交金额：成人已记录金额下发格式化 `priceText`；青少年（`minor===true` 或年龄 <18）只回「青少年金额不公开」；年龄不明回「成交价待核实」；0／缺失回「成交价未记录」；自由签约回「无转会费」。**不下发 `amountFen`**。
  - 跨赛事／租借：`fromTournamentId`／`toTournamentId` 两端赛事名不同显示「赛事A → 赛事B」+ 跨赛事徽标；租借类型沿用 `transfer/service.cjs` 的 `TYPE_TEXT`／`LOAN_KIND_TEXT`。
  - 榜单：入参 `tournamentId`／`ageGroupId`；名单走 `readRosters` + `rosterLineApproved`（排除 `pending` 行）；年龄段取 `divisions.name` 自然排序（U8 < U10，非抽签小组）；`rosterState` 区分「无已审核名单 `none`」与「名单集合缺失 `not_recorded`」。
  - 隐私：不返回报价单、合同、审核记录、手机号、证件与任何联系方式；公开球员资料页仍不开放（蜂蜜滴数标准未定，不写死数值）。
- 修改 `index.js`：`exports.main` 最前面在 `authenticate()` 之前分流 `event.action === 'transferShowcase'`（游客可读），并更新写有「Q09 公开范围未确认、不返回成交金额」的过时注释。相对线上包仅 3 行差异。

### 发布与读回

- 发布前：staging `node --check index.js`、`node --check transfer/showcase.cjs` 通过。
- 命令：`sxf-cloud.ps1 football run fn code update dataCenter --dir <staging> --deployMode cos` → **函数代码更新成功**（CLI 提示“未找到函数 [dataCenter] 的配置，使用默认配置”，但 `fn detail` 证实配置未被改动）。
- 读回：`tcb fn code download dataCenter <readback>` 与 staging 逐文件 SHA-256 比对 11 个关键文件 **MISSING=0 DIFF=0**；`transfer/showcase.cjs` 线上 22,783 B，哈希与本地一致。
- `tcb fn detail dataCenter`：状态 部署完成、`CodeSize=11,304,667`、内存 512MB、`Nodejs18.15`、超时 150s、`InstallDependency=TRUE`、`ModTime=2026-10-27 23:57:01`，无环境变量、无触发器。
- 线上探针（无身份）：
  - `fn invoke dataCenter --params '{"action":"transferShowcase"}'` → `{"success":true,"data":{"schema":"transfer-showcase/3",...}}`，全平台口径回 1 名身价球员（姚树基 ¥260，`top`／`players` 各 1 条、`transferCount:0`、`rising:[]`、`payerTotal:1`）。
  - `{"action":"transferShowcase","tournamentId":"probe"}` → `scope.mode:"tournament"`、`rosterState:"none"`、榜单为空、未报错。
  - 生产当前无已完成转会，转会列表为空属真实数据状态，页面走空态。

### 探针踩坑（务必沿用）

`tcb fn invoke -d '<json>'` 与 `-d @file` **都不会**把 JSON 解析成对象传给 Event 函数，无论 payload 内容恒返回 `AUTH_REQUIRED`（实测 `-d 'abc'` 同样）。必须用 `--params '<json>'`。

因此 `docs/releases/transfer-center-backend-20261026.md` 中「`transferWindowGet` 返回 `AUTH_REQUIRED` 证明 `transfer*` 路由在线」只是弱证据；后续入口探针一律用 `--params`。

另：CloudBase MCP（`mcp_cloudbase_manageFunctions`）绑定的是篮球环境，对 `cloud1-7g8ckb3c7815a011` 报 `[DescribeEnvInfo] env not found in list`，本轮全部云端操作改走 `sxf-cloud.ps1 football run <tcb args>`。

## 二、小程序上传（v1.2.20 开发版）

### 阻塞与减包

首轮上传被 `code 10, 代码包大小超过限制, main package source size 2118KB exceed max limit 2048KB` 拦住。排查结论：

- `ignoreUploadUnusedFiles` 已生效（候选 2496KB → 实际 2118KB，自动剔除约 378KB 未使用图片）。
- 仅分包引用的图片只有 40KB；`.md/.txt/.tmp` 垃圾仅 16KB；无重复图片；大图 bpp 已 0.1–0.18，重压会明显损画质；关 `uploadWithSourceMap`、剔除 `packOptions.include` 均不足以补 70KB 缺口。
- 最终采用结构性减包：把 `pages/discover/record`（62.3KB）与它**独占**的 5 张底图（`poster-bg-classic`／`poster-bg-wuxia-1..3`／`record-adult-bg`，319.6KB）迁入新分包 `packageDiscover`。

### 改动清单

- 移动：`pages/discover/record/record.{js,json,wxml,wxss}` → `packageDiscover/pages/record/`；`images/runtime/{poster-bg-classic,poster-bg-wuxia-1,poster-bg-wuxia-2,poster-bg-wuxia-3,record-adult-bg}.jpg` → `packageDiscover/images/runtime/`。
- `app.json`：主包 `pages` 移除 `pages/discover/record/record`；`subpackages` 新增 `{"root":"packageDiscover","pages":["pages/record/record"]}`（置于首位）。
- `pages/discover/discover.js`：2 处 `navigateOnce('/pages/discover/record/record'...)` → `/packageDiscover/pages/record/record`。
- `packageDiscover/pages/record/record.js`：5 处底图路径 + `onShareAppMessage` 的 `path` 改为 `/packageDiscover/...`；顶部注释同步。
- `packageDiscover/pages/record/record.wxml`：页面背景图 `record-adult-bg.jpg` 改为 `/packageDiscover/...`。
- 层级不变：`require('../../../utils/workspace')`、`@import "../../../styles/proto.wxss"` 仍指向主包（分包引用主包资源合法，`pages/team/team.wxss` 已有同型写法）；未改视觉素材、未改业务逻辑、未改 WXML 表达式结构。

### 上传前复核

- `node --check packageDiscover/pages/record/record.js`、`node --check pages/discover/discover.js` 通过。
- `app.json` 结构校验：40 个主包页、5 个分包（`packageDiscover:1`、`packageA:2`、`pages/team:25`、`pages/match:5`、`pages/tournament:22`）、主包与分包无重复页、tabBar 5 项全在主包。
- 分包页面 `.js/.wxml/.wxss` 全部存在；`record.wxml` 73 条插值仅 5 条简单取反、0 违规；`/packageDiscover/...` 图片与跳转引用全部可解析。
- 全仓库仅 `outputs/` 历史原型清单与 `.workbuddy-ai/memory` 仍写旧路径（历史产物，不改）。

### 上传结果

- `cli.bat upload --project miniprogram -v 1.2.20 -d "发现页新增转会公开市场分栏；转会记录页迁入分包减包"` → **upload 成功**。
- 体积：`TOTAL 3.3MB (3,491,419 B)`；**`main` 1.8MB (1,842,511 B)**；`/packageDiscover/` 362.4KB (371,139 B)；`/pages/team/` 721.0KB；`/pages/tournament/` 410.0KB；`/pages/match/` 83.4KB；`/packageA/` 33.3KB。
- 主包上限 2048KB，现约 1799KB，余量约 249KB。
- `miniprogram/config/release.js`：`version=1.2.20`、`releaseDate=2026-10-27`、`status=体验版`、`title=发现·公开转会市场`，`sections` 头部新增 5 条「发现转会公开市场」说明（共 35 段）。

### 体验版状态

上传成功只等于生成**开发版 v1.2.20**，**不等于体验版生效**。本轮无微信公众平台会话，未设置体验版、未提交审核。

同时，工作区仍有其他会话 **108 处**小程序未提交改动，已一并进入本次上传包（本次仅按需改动上述 5 个文件与其移动的素材）。

## 三、其他核对

- `node tools/check-data-governance.mjs` PASS。
- `node tools/test-data-center.mjs` PASS。
- `node tools/sync-data-center.mjs --check` 报 `getMiniWorkspace|webLoginApi|resultCenter|updateMatch|serviceMatchWorkflow|playerCardPublishWorker|friendlyMatchCenter` 的 `statistics.mjs`／`service.cjs` 未同步；逐文件比对确认为**纯 CRLF/LF 字节差**（内容全等，长度一致），属其他会话既有换行漂移，与本轮文件无关，**未执行 sync**（避免把他人未提交内容灌进部署副本）。
- 云函数为正式共享后端，本环境无独立测试后端；小程序本轮即为其对应测试端同步（上传开发版）。

## 四、未完成／后续

- 小程序体验版设置与真机验收：发现页「转会」分栏的范围弹层（赛事／年龄段）、焦点卡成人金色成交价、跨赛事徽标、最新转会列表与空态；转会记录页（`packageDiscover`）分包加载与海报生成。
- 生产当前无已完成转会，「最新转会」为空态属真实数据状态；要看到非空列表需先有 `status=completed` 的转会或自由签约单据。
- 公开球员资料页仍未开放；开放前需先确认蜂蜜滴数消耗标准（不得写死）。
- 时间范围筛选、球队筛选、转会搜索、焦点/成交列表分页排序参数仍未接入（页面已给「未接入」提示）。
- 工作区改动未提交 Git，需各归属会话分别提交。
