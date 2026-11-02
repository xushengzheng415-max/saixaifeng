# 小程序与PC赛事数据对齐

2026-10-24，本地实现及隔离验证；尚未部署后端、上传小程序或发布PC预览/正式页面。

## 入口与数据来源

- 小程序赛事数据：积分榜、个人进球榜、球队进球最多、球队失球最少、红牌榜、黄牌榜及成绩册。补注册`pages/tournament/data/data`，支持总榜/竞赛组别。共享赛事详情新增进球最多、失球最少、成绩册入口；原赛事球队页接同一榜单投影。
- `getMiniWorkspace.tournamentData`保留工作空间鉴权，显式使用official模式并传递请求组别；新增`boards.version=tournament-boards/1`，按每个实际组别重新投影统一统计，不用teamId反推唯一组别。总榜同一稳定球员ID汇总，各组别保留本组贡献。
- `sharedTournamentData`只在当前用户有效共享授权含`event.results`或`event.dashboard`时读取精确赛事，返回榜单/奖项最小投影。仅比赛管理或其他赛事授权不放行，不写比赛、名单、用户或授权。
- PC `resultCenter.dashboard`在原手机号会话、赛事机构和子账号模块校验后，用同一`dataCenter/shared/service.cjs`读取正式积分和成绩册，保留原赛程复核/晋级操作。手机与PC球队排序共用`tournament-boards.mjs`；服务端分组投影放在`tournament-boards.cjs`，浏览器不引入服务端依赖。

## 边界

成绩册结果新增`awardsVersion=football-tournament-awards/2`标记归档完成计数修正。共享读取在有效赛事数据授权后按授权统计能力补齐参与者姓名，只输出赛事榜单/奖项，不返回手机号、证件或完整球员档案；与匿名公开赛事入口分开。

正式/待复核分开：奖项计算和成绩册已归档计数仅计approved/official/archived，不再把pending_review/退回视为已完成。所有手动奖项调整继续由原award_overrides读取，数据库故障抛错，只有明确集合不存在可降级。原缺失、测试来源隔离、比分及事件统计公式沿统一服务，未新增页面统计算法。

球队榜同进球按净胜球、积分、场次；同失球按场均失球、积分、场次，复用原PC顺序。稳定键包含竞赛组别/抽签小组/球队ID；未赛队不参与最少失球竞争，未知值不当0。个人榜顺序使用现行统一presentation，未修改评奖或竞技积分规则。旧“按助攻排序”说明不代表现行统一接口已实现该规则。

手机错误可重试，不能把失败当空榜；返回页重新读取，迟到/离页响应不覆盖新状态。成绩册只读，修改个别奖项沿PC原入口。展示与真实登录成功、发布和生产数据对账分别验收。

## 验证与发布范围

本地：数据中心主测试、共享赛事权限及207场分页专项、新增跨端榜单专项（同队/同球员跨组、合法零值、未知、成绩册待归档、失败重试及离页响应）、共享副本一致性通过；四页WXML/WXSS共8文件官方编译通过。PC生产构建通过，已有报表图片路径及大分包警告保留。原生开发者工具布局证据见`.codex-artifacts/align-tournament-20261024/`，仅使用本地隔离展示，不写线上。

拟发布精确目标：`dataCenter`、`getMiniWorkspace`、`resultCenter`对应最小差量包；PC改动先走`/preview/admin/`验收，小程序开发包单独上传和体验版设置。共享生产后端无独立测试函数；同步部署副本只是源码准备。当前未获得本任务生产发布授权，未提交或推送Git，未迁移数据库。发布时必须从最新线上包差量合入，保留各函数原配置，并回下载核对及权限探测。

## 成绩册与赛果页缺陷修复（同日追加，源码已改、未部署）

用户反馈青年组成绩册奖项错误、赛果管理页列表错乱。已修复并本地验证，尚未部署后端、未发布PC页面。

- 冠军判定：`awards.cjs`原决赛过滤只排除半决赛与三四名，把"7-8名决赛"当成冠军决赛，且要求比分不等，点球决胜（如1:1、点球4:3）被跳过。现按名次排位赛排除规则（半决赛/三四名/名次/排位/交叉/N-M名决赛）识别冠军决赛，胜方依次取比分、点球、已归档晋级球队字段；无冠军决赛才回退积分榜首位。冠军与亚军分别记录判定依据，不再共用一条说明。
- 胜平负全0：`standings.cjs`输出单数`win/draw/loss`，`awards.cjs`读`wins/draws/losses`导致恒为0，现兼容两种字段。
- 组名重复："联赛积分榜 积分榜"与"中年组 · 联赛积分榜"来自历史单循环抽签把小组名写成`联赛积分榜`。`statistics.mjs matchGroupName`与`resultCenter groupNameOf`在读取时归一为"联赛"，不改历史数据。
- 赛果列表错乱：`.review-layout`原左列最小780px，行内六列最小约971px且`overflow:hidden`，1366/1280视口整体溢出导致列挤压与裁切。现左右列弹性、行内列宽收窄，并按左面板实际宽度用容器查询在900px/680px两档隐藏来源与时间列；窄视口原媒体查询行为保留。
- 榜单请求`Failed to fetch`：浏览器只在传输层失败时给出该英文。`dataCenter`近7日`query`调用均成功（单次2.5-5秒），无`dataCenter`失败日志；`webLoginApi`的120秒超时全部发生在裁判表识别和微信授权类action，与本页无关。现`cloud.js`把该类TypeError统一改为"网络请求未完成，请检查网络后重新加载"，榜单页保留重新加载按钮。传输层失败未取证到具体触发条件，继续按网关瞬时失败处理。
- 本地验证：`node tools/sync-data-center.mjs`、`--check`、`test-data-center.mjs`、`check-data-governance.mjs`、两处云函数`node --check`通过；PC`npm run build`通过，产物无`@cloudbase/js-sdk`。

### PC 测试版发布记录（2026-10-24）

按用户当次要求把工作区现有PC改动发布到测试版，未发布正式`/admin/`，未部署任何云函数。

- 合入方式：在`preview` worktree（`referee-sheet-preview`）把工作区6个PC文件与新增`cloudfunctions/dataCenter/shared/tournament-boards.mjs`复制入库，rebase到最新`origin/preview`（`debc9fbe`）。`TournamentResultCenter.vue`冲突保留测试分支的纪律处罚面板版式，再重新施加本次列宽/容器查询改动；`TournamentScheduleV2.vue`保留测试分支版本，未把工作区未完成的追加处罚读取改动带进测试分支。
- 提交与推送：`b78913fa`，已推送到`origin/preview`。
- 构建：`VITE_APP_BASE='/preview/admin/'`，入口只引用`/preview/admin/assets/`。
- 部署：`hosting deploy <preview worktree>/web-admin-vue/dist preview/admin`，400个文件。
- 读回：`/preview/admin/index.html` 200，入口`index-B75ryp5F.js`，本地与线上SHA-256一致（`2789…`以实际读回为准）；`/admin/index.html` 仍200且引用`index-BN6AeSwT.js`，未被覆盖。
- 已知限制：测试版前端调用正式后端，`dataCenter`未部署，因此成绩册冠军/胜平负/组名修复在测试版不会生效，仅列宽与错误提示可见。

### resultCenter 后端修复部署（2026-10-25）

用户反馈青年组冠亚军仍未修复。读回线上包确认：21:27 那次部署的`data-center/awards.cjs`仍是旧决赛识别逻辑（仅排除`半决赛|三四名`，379行），后端从未包含本次修复，前端发版不影响结果。

- 处理：`fn code download resultCenter`取线上包为基线，只替换`data-center/awards.cjs`为修复版，并按同一规则补上`data-center/statistics.mjs`的组名归一；其余线上文件原样保留，不带入工作区其他未完成改动。
- 部署：`fn code update resultCenter --dir <线上包基线目录>`，COS上传成功；配置读回保持内存512MB、超时60秒。
- 读回：重新下载线上包，`data-center/awards.cjs`415行且含`PLACEMENT_FINAL`，证明代码已替换（`fn detail`的代码大小字段未刷新，不能作为判据）。
- 生效范围：`resultCenter`的`dashboard`在请求时调用`statisticsService.query`实时计算`awards`，刷新即生效，覆盖成绩册冠亚军、胜平负与组名。
- 仍未部署：`dataCenter`。进球榜等走`dataCenter` query 的组名归一仍为旧值。

### dataCenter 及赛果行组名部署（2026-10-25）

- `dataCenter`：同样以`fn code download`线上包为基线，仅替换`shared/awards.cjs`并补`shared/statistics.mjs`的组名归一；`fn code update`上传成功，配置读回保持内存512MB、超时150秒。
- `resultCenter`补部署：线上`index.js`的`groupNameOf`在无小组名时回退成`联赛积分榜`，赛果行因此显示「中年组 · 联赛积分榜」；已改为回退`联赛`并重新上传。
- 读回：重新下载两个线上包，`dataCenter`的`shared/awards.cjs`含`PLACEMENT_FINAL`（254/261行）、`statistics.mjs`含组名归一（84/85行）；`resultCenter`的`index.js`含新`groupNameOf`（277行）。
- 日志：部署后1小时内两函数无失败记录。
- 生效范围：测试版与正式版共用同一后端，成绩册冠亚季、胜平负与组名归一均已生效；榜单类页面需刷新后重新请求。
