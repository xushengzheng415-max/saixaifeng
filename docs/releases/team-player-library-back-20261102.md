# 入队通知直达对应球队与球员库返回首页发布记录（2026-11-02）

状态：`getMiniWorkspace` 已差量发布（共享正式后端，正式与测试共用）；小程序开发版 **1.2.35 已上传成功**。体验版未设置、未提审、未发布正式版小程序。

## 一、问题

用户（管理两支球队的球队管理者）反馈三点：

1. 「其中一个团队申请加入我其中一个球队，我点进去这个正标足球俱乐部，但是到达的页面却是另外一个球队的页面」；
2. 「为什么我进到这个球队球员库点这个返回键不能进到我小程序的主页」；
3. 复测：「从服务通知进到小程序，点返回键后返回到球队球员库，再点返回就没用，无法回到小程序主页面」。

用户确认口径：「关于进服务号的页面之后返回的情况，需有主页标识，提供返回小程序等选项供用户选择。要不然的话，一返回大家可能想去主页看看其他的东西就特别麻烦。」

## 二、根因

- **落点错队**：`cloudfunctions/getMiniWorkspace/playerRegistration.cjs` 的入队通知原先只在「新登记待球队确认」路径传 `pagePath`，认领与恢复/转入路径 `pagePath` 为空，`notifyTeamPlayerJoin` 回退到 `pages/teams/index`（tab 页、不带球队 ID）。点通知只能回到球队列表，用户再点进去看到的是比赛列表/当前空间里的另一支队，表现为「进了别的球队」。此外，即使用带 `teamId` 的路径直达，页面沿用当前工作空间（仍可能是另一支队）调用 `teamPlayers`，会报「球队不存在或不属于当前工作空间」。
- **返回无反应**：`pages/team/player-library/player-library.js` 的 `onBack` 原为 `nav.back('/pages/team/team?...')` 一类实现，在服务号直达的根页（页面栈只有一页）只能落到球队页或无处可退，第二次点返回没有任何反馈；且页面本身没有回小程序首页的入口。

## 三、改动

### 3.1 共享后端（已发布）

`cloudfunctions/getMiniWorkspace/playerRegistration.cjs`——两处 `notifyTeamPlayerJoin` 都带对应球队 ID 直达该队球员库：

- 主登记路径：`pages/team/player-library/player-library?teamId=<该队>` +（待球队确认时）`&pendingTeamConfirm=1`；
- 恢复/转入路径：`pages/team/player-library/player-library?teamId=<该队>`。

`miniprogramTarget` 仍为 `wx57164cca8676f411`，服务端对 `event.pagePath` 的白名单校验未放宽。

### 3.2 小程序页面（需 1.2.35 生效）

`miniprogram/pages/team/player-library/player-library.js`：

- 新增 `enterTeamWorkspace(teamId)`：`onLoad` 解析 `teamId` 后先 `workspace.loadContext()`；当前 `context.teams` 无该队时，从 `homeEntries` 取该队的 `workspaceId` 调 `workspace.switchWorkspace`，切换成功再请求 `teamPlayers`。球队不在可进入范围时抛明确提示（「该球队不在当前工作空间，或当前账号没有查看权限」），不静默套用第一支球队。
- 进入失败打 `_entryFailed`，`onShow` 不再重复空转请求；`loadPlayers` 增加 `_loadingRequest` 去重并带 `includePlayerCards:false`。
- 新增 `goHome()`：`wx.switchTab('/pages/home/home')`，失败回退 `wx.reLaunch` 同一首页。
- `onBack()`：页面栈 > 1 逐级 `navigateBack`（保留原有返回链）；页面栈只有一页（服务号直达）时 `wx.showModal` 给出「回首页 / 留在本页」选择，确认才跳首页、取消留在本页。

`player-library.wxml` / `player-library.wxss`：导航栏右侧常驻「首页」入口（共享 SVG 图标 `/images/icons/home-entry-white.svg`），可随时回主页浏览其他内容，不依赖返回键。

`miniprogram/config/release.js` 升 **1.2.35**，title「入队通知直达与球员库返回」，`sections` 头部新增「入队通知直达」「球员库首页入口与返回」「认领返回链」三段（共 55 段，原有 52 段保留）。

## 四、发布方式与读回

### 4.1 云函数

线上包早于本地 `HEAD`（本地缺 `sharedTournamentData`、`claimSelfPlayer`、`tournament-boards` 等块，属其他在途任务），因此未整包上传本地源码：

1. `fn code download getMiniWorkspace` 取最新线上包；
2. 仅在线上包内替换 `playerRegistration.cjs` 两处 `pagePath` 块（其余文件保持线上原样；与基线 `git diff --no-index` 为 `+5/−3`）；
3. `node --check` 通过后 `fn code update getMiniWorkspace --dir <线上包>` → 代码更新成功。

读回与配置：

- 修改时间 `2026-11-02 21:23:46`、状态 `Active`；
- 配置前后对比：运行时 `Nodejs18.15`、内存 512MB、超时 150s、自动安装依赖 TRUE、环境变量键 `SXF_FOOTBALL_SERVICE_BRIDGE_KEY,SXF_MATCH_PASS_SECRET` 均未变化；
- 回下载比对：`playerRegistration.cjs` SHA-256 `DD73518ABB161983CF5F53C4B1B891A1CC50DD8DE7830F0252FB70CFD1686C8B`、`index.js` `A40D132A8F7D37E9D3C847D8B1E04BFFD41928F790D942705CBA94C3519B224D`（后者与线上原包一致，证明只改了前者）；
- 空载 `fn invoke`：14ms、返回 `{"success":false,"code":"WORKSPACE_LOAD_FAILED","message":"无法识别当前微信账号"}`，模块加载与鉴权入口正常，未触发任何写库。

### 4.2 小程序

- 项目 `E:\Documents\sxf-football\miniprogram`、AppID `wx57164cca8676f411`、版本 `1.2.35`；
- 通过微信开发者工具 MCP `upload` 上传（`taskId confirmation_upload_00e7104a-db10-4442-8133-58f1c8cdcab6`），确认后回执 `status=success`、`detail=execution_success`；
- 包体：TOTAL 5,110,367 B、main 2,020,534 B、`pages/team/` 745,006 B、`packageCard/` 1,424,273 B、`pages/tournament/` 429,863 B、`packageDiscover/` 371,139 B、`pages/match/` 85,452 B、`packageA/` 34,100 B；
- 仅产生开发版；体验版设置、提审、正式发布均未执行。

## 五、验证

- `node --check`：`playerRegistration.cjs`、`player-library.js` 通过。
- `tools/test-mini-player-library.cjs`：页面段通过——通知直达同空间不切空间；跨空间按 `homeEntries` 切到 `team:two` 且请求带 `teamId=other`；无权限球队报错且不发请求、`onShow` 不空转；返回键栈 1 弹「回首页 / 留在本页」、取消不跳转、确认走 `switchTab('/pages/home/home')`、`switchTab` 失败回退 `reLaunch`；栈 2 只 `navigateBack(1)` 不弹选择；WXML 校验含 `bindtap="goHome"` 与表达式黑白名单。
- `tools/test-player-registration.cjs`：三处通知落点断言全部通过（新登记 `...?teamId=team&pendingTeamConfirm=1`；认领 `...?teamId=team` 且 `pendingTeamConfirm=false`；恢复 `...?teamId=team`）。
- `test-player-join-review.cjs`、`test-mini-team-claim-routing.cjs`、`test-mini-claim-direct-team-entry.cjs` 通过。
- **既有无关失败（未修复）**：`tools/test-mini-player-library.cjs` 的球员卡读取隔离段在 `HEAD` 上同样失败——`1f2cc2ea` 的 `playerCardReader.cjs` 去掉了单张卡异常兜底（`CARD_READ_FAILED`），单卡读取报错会中断整份名单的卡数据。本轮未改该共享后端，需单独授权后再修。

## 六、生效范围

- 通知直达对应球队：服务端改动，已即时生效，**无需更换小程序包**（旧包也能收到带 `teamId` 的跳转参数）。
- 「首页」常驻入口、单页栈「回首页 / 留在本页」选择、进入前切工作空间：属客户端改动，需 1.2.35（或更高）运行才可见。

## 七、遗留

- 线上 `getMiniWorkspace` 整体仍早于本地 `HEAD`；本轮只发布了两处通知落点，其余在途块未上线。
- 小程序 1.2.35 上传成功但未设体验版、未提审；真机复测（点通知进对应球队、点返回弹「回首页/留在本页」、点「首页」回主页）待用户验收。
- 球员卡单卡失败兜底回归待单独确认修复范围（影响正式名单海报等使用球员卡的页面）。
