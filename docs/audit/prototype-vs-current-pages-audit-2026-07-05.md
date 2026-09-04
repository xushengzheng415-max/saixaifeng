# 原型设计清单 vs 当前页面代码对照审计

更新时间：2026-07-05

审计范围：

- 原型目录：`C:\Users\Frank\.codex\worktrees\b88b\赛小蜂\docs\prototype\screens`
- 小程序代码：`miniprogram/`
- Web 管理后台：`web-admin-vue/src/views/`、`web-admin-vue/src/router/index.js`
- 赛事中心：小程序 `pages/tournament-center/`、Web 展示端 `views/portal/`、PC 管理端 `views/tournament-center/`

## 一、总体结论

原型目前覆盖 9 个端/身份分组，共 37 张页面图：

| 分组 | 原型页数 | 当前代码覆盖判断 |
| --- | ---: | --- |
| 主办方小程序 | 5 | 部分覆盖，缺独立主办方导航和审核详情闭环 |
| 主办方 PC | 8 | 大部分业务页存在；抽签大屏已归入抽签分组，不再单列侧边栏 |
| 球队小程序 | 8 | 大部分存在，首发/换人/完整资料仍有细节差距 |
| 球队 PC | 3 | 产品决策取消，不再建设球队 PC 端 |
| 裁判小程序 | 7 | 任务列表有，横屏赛前/赛中/赛后链路缺口最大 |
| 裁判 PC | 2 | 基础页存在，执法详情与赛果提交深度不足 |
| 球员小程序 | 2 | 功能文件存在但关键身份卡页面未注册，入口不稳定 |
| 赛事中心小程序展示端 | 2 | 有赛事中心页，但目前混合教练/裁判模式，公开展示能力不足 |
| 赛事中心 PC 管理端 | 1 | 有管理端页面，部分功能仍是 TODO/模拟数据 |

最核心问题不是页面数量不足，而是“身份场景拆分”还没有按原型落地。当前小程序和 Web 都有混合导航、共享页面、重复页面、未注册页面。原型要求的是主办方、球队、裁判、球员、赛事中心各自独立入口与闭环。

## 二、市场与端口策略结论

端口不应该按“每个身份都有小程序 + PC”机械复制，而应该按工作负载拆分。青少年足球赛事里，现场角色优先移动端，管理/批量/配置角色才需要 PC。

| 角色 | 高频场景 | 推荐主端 | PC 是否需要 | 结论 |
| --- | --- | --- | --- | --- |
| 主办方 | 创建赛事、审核报名、抽签、赛程、裁判、数据统计 | PC + 小程序 | 需要 | PC 是主工作台，小程序做随身审核和通知 |
| 赛事中心运营 | 发布赛事、维护 Banner、配置展示、处理内容 | PC | 需要 | 必须保留 PC 管理端 |
| 教练/领队 | 建队、发分享链接、报名、提交阵容、换人申请、接通知 | 小程序 | 不需要 | 取消球队 PC，球员资料由微信链接自填 |
| 普通球员/家长 | 查看身份卡、赛程、成绩、报名确认、分享 | 小程序 | 不需要 | 只做小程序 |
| 普通裁判 | 查看任务、现场签到、确认首发、记录事件、提交赛果 | 小程序/平板横屏 | 不需要 | 现场执法必须移动端优先 |
| 裁判长/裁判管理员 | 分配裁判、复核赛果、查看执法记录 | PC | 需要轻量 PC | 只给管理角色做 PC |

市场判断：

- Team/coach 类产品通常把日常队伍管理、通知、赛程、名单维护放在移动端；PC 更多用于较重的管理和批量处理。
- GameChanger 这类基层赛事工具允许教练/记分员用网页或移动端建队、维护名单和赛程，但比赛现场记分、数据采集更偏移动端。
- Arbiter 这类裁判/校际体育管理平台的 PC 价值主要在指派、合规、支付、跨学校/协会管理；普通裁判的高频动作是接受任务、查看安排、现场记录。
- 中国青少年足球的用户触点更贴近微信生态，教练、家长、裁判、球员天然更适合小程序入口。

产品决策：

1. 保留并强化主办方 PC。创建赛事、报名审核、抽签分组、赛程、裁判分配都适合 PC；抽签大屏并入抽签分组，不再作为独立侧边栏。
2. 保留赛事中心 PC 管理端。赛事发布、Banner、专题、榜单配置、展示审核属于内容运营后台。
3. 球队端取消 PC。球队负责人通过小程序发微信链接给球员/家长自填资料，球队侧不再建设 PC 管理台，也不保留 PC 批量工具作为 MVP 范围。
4. 普通裁判不做 PC。裁判核心场景在赛场，横屏小程序/平板执法台比 PC 更合理。PC 只给裁判长/赛事管理员使用。
5. 球员/家长不做 PC。身份卡、成绩、赛程、分享全部小程序完成。

因此，下文中“球队 PC”直接取消；“大屏配置”不再作为主办方侧边栏独立项，抽签大屏功能归入抽签分组；普通裁判 PC 降级或取消，裁判长/管理员 PC 保留；裁判小程序横屏执法链路仍为 P0。

## 三、小程序对照审计

### 2.1 当前小程序注册页面

`miniprogram/app.json` 当前注册 30 个可访问页面，包括：

- 首页/登录/我的：`pages/home/home`、`pages/login/login`、`pages/profile/profile`
- 球队：`pages/team/team`、`pages/team/detail/detail`、`pages/team/player-add/player-add`、`pages/team/player-detail/player-detail`
- 赛事：`pages/tournament/list/list`、`pages/tournament/create/create`、`pages/tournament/detail/detail`、`pages/tournament/signup/signup`、`pages/tournament/schedule/schedule`、`pages/tournament/draw/draw`
- 比赛/阵容：`pages/match/detail/detail`、`pages/match/squad/squad`、`packageA/pages/lineup/lineup`
- 裁判：`pages/referee/index`
- 赛事中心：`pages/tournament-center/tournament-center`
- 换人/签名：`pages/roster-change/roster-change`、`packageA/pages/signature/signature`

### 2.2 小程序不可达页面

以下 WXML/JS 文件存在，但未注册到 `app.json`，正常微信小程序内不可直接访问：

| 类型 | 未注册页面 |
| --- | --- |
| 球员身份卡 | `pages/identity/identity`、`pages/identity/claim`、`pages/player-card/player-card`、`pages/card-preview/card-preview`、`pages/my-cards/my-cards`、`pages/my-cards/detail` |
| 裁判链路 | `pages/referee/record`、`pages/referee/verify` |
| 比赛链路 | `pages/match/create/create`、`pages/match/share/share`、`pages/match/submit`、旧版 `pages/match/create`、`pages/match/detail`、`pages/match/squad` |
| 旧版/重复页 | `pages/guide/team-info`、`pages/guide/referee-info`、`pages/team/detail`、`pages/team/player-add`、`pages/player/detail`、`pages/player/player`、`pages/signature/signature` |

这些页面会造成两个风险：

- 原型需要的功能“看起来有代码”，但用户入口不可达。
- 后续维护时容易改错旧页面，正式页面没有变化。

### 2.3 主办方小程序

| 原型页 | 当前页面 | 状态 | 主要差距 | 优先级 |
| --- | --- | --- | --- | --- |
| 首页 | `pages/home/home`、`pages/manage/manage`、`pages/tournament-center/tournament-center` | 部分覆盖 | 没有主办方独立首页导航；当前是混合工作台，缺“我创建的赛事”和主办方 KPI 的完整闭环 | P0 |
| 赛事详情 | `pages/tournament/detail/detail` | 部分覆盖 | 已有邀请、报名、规程、抽签/赛程入口，但信息架构未按主办方管理视角重组 | P0 |
| 创建赛事 | `pages/tournament/create/create` | 部分覆盖 | 有基础信息、积分、换人、停赛规则；缺保存草稿/发布赛事双动作、移动端预览、规程文件上传状态 | P0 |
| 报名审核详情 | `pages/tournament/detail/detail` 内部审核动作 | 部分覆盖 | 有通过/拒绝逻辑迹象，但缺独立审核详情页、审核备注、联系人与名单入口的完整页面 | P0 |
| 上传竞赛规程 | `pages/tournament/rules/rules`、`pages/tournament/detail/detail` | 部分覆盖 | 有规程上传/展示，但缺“当前状态、文件名、大小、上传进度、失败重试、保存”的独立闭环 | P1 |

### 2.4 球队小程序

| 原型页 | 当前页面 | 状态 | 主要差距 | 优先级 |
| --- | --- | --- | --- | --- |
| 首页 | `pages/team/team`、`pages/home/home` | 基本覆盖 | 球队卡、球员、阵容、邀请入口已有；仍需要按原型统一成球队身份首页 | P1 |
| 球员阵容 | `pages/team/team`、`pages/team/player-detail/player-detail` | 基本覆盖 | 有教练/球员 Tab 和阵容列表；资料完整度、位置筛选、待完善状态需强化 | P1 |
| 赛事报名确认 | `pages/tournament/signup/signup` | 基本覆盖 | 已有赛事信息、规程阅读、确认报名；需要补报名限制、已报名队数、底部固定操作与按钮禁用状态一致性 | P1 |
| 创建球队 | `pages/guide/team-info/team-info` | 部分覆盖 | 有 Logo、城市、队名；原型要求的领队姓名、联系电话、同步管理提示需补齐 | P1 |
| 添加球员 | `pages/team/player-add/player-add` | 基本覆盖 | 已比原型更丰富，需核对字段命名和青少年必填规则 | P1 |
| 提交首发阵容 | `pages/match/squad/squad`、`packageA/pages/lineup/lineup` | 部分覆盖 | 有首发选择和横屏阵容页；缺拖拽球场、阵型选择、队长/门将/替补 7 人完整交互 | P0 |
| 换人申请 | `pages/roster-change/roster-change` | 基本覆盖 | 已有换下/换上/原因/次数限制；需补裁判确认状态时间线 | P1 |
| 完整添加球员 | `pages/team/player-add/player-add` | 部分覆盖 | 有照片/证件/号码/位置等；需确认年龄组、监护人、学校、身高、体重是否进入正式保存和展示 | P1 |

### 2.5 裁判小程序

| 原型页 | 当前页面 | 状态 | 主要差距 | 优先级 |
| --- | --- | --- | --- | --- |
| 我的执法 | `pages/referee/index` | 部分覆盖 | 有裁判入口；需要按待执法/已完成/赛果待提交拆 Tab 和比赛卡状态 | P0 |
| 比赛执法 | `pages/match/detail/detail`、未注册 `pages/referee/record` | 缺失/部分覆盖 | 当前没有完整比分牌、计时器、事件按钮、事件日志、提交赛果一体化执法台 | P0 |
| 提交赛果 | 未注册 `pages/match/submit`、`pages/referee/record` | 缺失 | 页面存在但不可达；需要最终比分、事件分组、说明、保存草稿、确认提交 | P0 |
| 横屏赛前执法工作台 | 无正式注册页面 | 缺失 | 缺签到、双方首发提交状态、二维码邀请、一键邀请、主裁确认、PDF、开始比赛强校验 | P0 |
| 横屏首发名单确认 | 无正式注册页面 | 缺失 | 缺双方阵型、首发/替补、队长/门将标识、退回修改、确认无误、打印 PDF | P0 |
| 横屏比赛执法工作台 | 无正式注册页面 | 缺失 | 缺横屏球场、场上球员卡、替补、比分计时、红黄牌/进球/换人/伤停控制台 | P0 |
| 横屏赛后报告 | `packageA/pages/signature/signature` 仅覆盖签名 | 缺失 | 缺赛后报告字段、事件统计、场地情况、争议情况、签名、提交报告 | P0 |

裁判端是本次审计中最大缺口。当前已有裁判身份与若干记录页面雏形，但原型定义的是完整比赛执法链路，建议单独拆一个 P0 Epic。

### 2.6 球员小程序

| 原型页 | 当前页面 | 状态 | 主要差距 | 优先级 |
| --- | --- | --- | --- | --- |
| 球员首页 | `pages/player/detail/detail`、`pages/profile/profile` | 部分覆盖 | 有球员资料详情，但缺球员专属首页、参赛记录、荣誉/比赛列表的信息结构 | P1 |
| 球员身份卡 | 未注册 `pages/identity/identity`、未注册 `pages/my-cards/*` | 部分覆盖但不可达 | 身份卡和卡片预览代码存在，但未注册；生成海报/分享闭环需梳理 | P0 |

### 2.7 赛事中心小程序展示端

| 原型页 | 当前页面 | 状态 | 主要差距 | 优先级 |
| --- | --- | --- | --- | --- |
| 首页 | `pages/tournament-center/tournament-center` | 部分覆盖 | 当前是主办方卡片式/教练列表式双模式，不是公开展示端；缺游客视角 Banner、榜单、赛程聚合 | P0 |
| 赛事详情 | `pages/tournament/detail/detail`、`pages/tournament/schedule/schedule`、`pages/tournament/teams/teams` | 部分覆盖 | 详情、赛程、球队有；积分榜在小程序 `schedule` 中仍是“功能开发中”，射手榜/最新赛果缺失 | P0 |

## 四、Web 管理后台对照审计

### 3.1 Web 当前路由与页面

Web 端已具备较多管理后台页面：

- 主办方/管理后台：`DashboardView.vue`、`TournamentList.vue`、`TournamentCreate.vue`、`TournamentDetail.vue`、`TournamentEdit.vue`、`TournamentSignups.vue`、`TournamentSchedule.vue`、`TournamentDraw.vue`
- 球队/球员：`TeamList.vue`、`TeamDetail.vue`、`PlayerList.vue`、`PlayerDetail.vue`
- 裁判：`RefereeList.vue`、`RefereeMyMatches.vue`、`RefereeMatchDetail.vue`、`HeadRefereeManagement.vue`
- 赛事中心管理：`TournamentCenterAdmin.vue` 及 `AccountManagement.vue`、`TeamManagement.vue`、`PlayerManagement.vue`
- 公开赛事中心/门户：`views/portal/*`

### 3.2 主办方 PC

| 原型页 | 当前页面 | 状态 | 主要差距 | 优先级 |
| --- | --- | --- | --- | --- |
| 赛事工作台 | `DashboardView.vue`、`MyTournaments.vue` | 基本覆盖 | KPI/近期赛事/快捷入口已有基础；需要按主办方独立侧边栏重排 | P1 |
| 报名审核 | `TournamentSignups.vue` | 基本覆盖 | 审核列表、查看名单、通过/拒绝基本具备；批量通过和右侧赛事摘要需核对 | P1 |
| 创建赛事 | `TournamentCreate.vue` | 基本覆盖 | 表单很完整；需对齐原型的右侧移动端预览、草稿/发布状态和规程上传体验 | P1 |
| 赛程管理 | `TournamentSchedule.vue` | 基本覆盖 | 赛程生成/编辑存在；需补发布赛程、裁判分配、状态抽屉一致性 | P1 |
| 抽签分组 | `TournamentDraw.vue` | 基本覆盖 | 抽签/分组/保存功能较完整；需和最新“抽签大屏修正说明”对齐 | P1 |
| 抽签规则配置 | `TournamentDraw.vue` | 部分覆盖 | 有规则能力迹象；建议拆出清晰规则配置区：同协会/同校回避、种子队、规则预览 | P1 |
| 抽签大屏 | `TournamentDraw.vue` | 并入抽签分组 | 不再做独立侧边栏/独立后台配置页，作为抽签分组里的现场展示/发布能力补齐 | P1 |

### 3.3 球队 PC

| 原型页 | 当前页面 | 状态 | 主要差距 | 优先级 |
| --- | --- | --- | --- | --- |
| 管理台 | 不再建设 | 取消 | 球队端以小程序为主，球队负责人通过微信分享链接让球员/家长自填信息，不做 PC 工作台 | 取消 |
| 球员管理 | 不再建设 | 取消 | 不做 PC 录入、导入、批量维护；资料采集走小程序分享链接 | 取消 |
| 完整球员管理 | 不再建设 | 取消 | 青少年资料字段在小程序端补齐，不在 PC 端建设 | 取消 |

### 3.4 裁判 PC

| 原型页 | 当前页面 | 状态 | 主要差距 | 优先级 |
| --- | --- | --- | --- | --- |
| 执法工作台 | `RefereeMyMatches.vue` | 部分覆盖 | 有我的执法入口；需补任务 KPI、赛果状态、执法记录聚合 | P1 |
| 执法工作台详情 | `RefereeMatchDetail.vue` | 部分覆盖 | 需要补提交赛果、事件记录、黄牌/红牌/进球统计，以及和小程序执法数据同步 | P1 |

## 五、赛事中心对照审计

### 4.1 赛事中心小程序展示端

当前 `pages/tournament-center/tournament-center` 注释显示“双模式：主办方卡片式 / 教练列表式”，不是原型里的公开展示端。

| 原型模块 | 当前状态 | 差距 |
| --- | --- | --- |
| 赛事列表 | 部分覆盖 | 有列表，但身份混合，缺公开展示定位 |
| 赛程 | 部分覆盖 | 可跳赛程页，但首页聚合不完整 |
| 榜单 | 缺失/部分覆盖 | 小程序赛程页积分榜仍显示“功能开发中”，射手榜缺失 |
| 赛事详情入口 | 基本覆盖 | 可进入赛事详情，但详情页仍偏报名/管理混合 |

建议将赛事中心小程序拆成“公众展示模式”，不要和教练参赛列表、主办方卡片管理混在同一个信息架构里。

### 4.2 Web 赛事中心公开展示端

当前 `web-admin-vue/src/views/portal/` 覆盖较好：

- `HomePage.vue`：首页 Banner、快捷入口、热门比赛、排行
- `TournamentListPage.vue`：赛事列表
- `TournamentDetailPage.vue`：赛事详情
- `RankingsTab.vue`：积分榜/射手榜能力
- `SquadsTab.vue`、`MatchesTab.vue` 等详情 Tab

主要问题：

- 多处仍有演示数据或静态数据，需要确认真实接口接入程度。
- 公开展示端和赛事中心官网定位需要进一步收口到“青少年足球赛事展示”。
- TopNav 中存在“球队/榜单”等入口，但与小程序赛事中心原型还没有统一信息架构。

### 4.3 赛事中心 PC 管理端

当前 `TournamentCenterAdmin.vue` 覆盖了赛事审核、认领审核、配置、Banner/Logo 上传等能力，但审计发现源码中仍有 TODO 和模拟数据痕迹：

- 审核列表获取处存在 TODO 注释。
- 管理端首页已具备内容管理雏形，但与原型“赛事发布、内容管理、官网配置、轮播图、赛事专题、数据概览、预览区”还需逐项核对真实数据。
- 子组件 `TeamManagement.vue`、`PlayerManagement.vue` 已存在，适合作为赛事中心数据管理基础。

## 六、P0 改造清单

1. 小程序按身份拆导航
   - 主办方、球队、裁判、球员、赛事中心展示端需要各自入口和首页。
   - 当前混合首页/混合赛事中心会让原型无法准确落地。

2. 裁判小程序完整执法链路
   - 新增或注册：我的执法、比赛执法、提交赛果、横屏赛前工作台、横屏首发确认、横屏比赛工作台、横屏赛后报告。
   - 重点打通：签到、首发提交状态、二维码/邀请教练、主裁确认、计时、事件记录、赛后签名与报告。

3. 赛事中心小程序公开展示端
   - 从 `pages/tournament-center/tournament-center` 中拆出公开展示模式。
   - 补齐首页赛事列表、赛程聚合、积分榜、射手榜、赛事详情、最新赛果。

4. 主办方小程序审核闭环
   - 独立报名审核详情页。
   - 独立竞赛规程上传页或把现有规则页改造成完整上传状态闭环。
   - 创建赛事补保存草稿/发布赛事。

5. 球员身份卡入口
   - 注册并梳理 `pages/identity/identity`、`pages/my-cards/*`、`pages/player-card/player-card`。
   - 补球员首页到身份卡、海报生成、分享的闭环。

## 七、P1 改造清单

1. Web 主办方侧边栏重排
   - 按当前决策建议：工作台、我的赛事、创建赛事、报名审核、抽签分组、赛程管理、裁判管理、数据统计、设置。
   - 不再单列“大屏配置”；抽签大屏入口归入“抽签分组”。

2. 球队小程序完整资料字段
   - 确认年龄组、身高、体重、监护人、联系电话、学校、证件照片全部进入保存、展示、审核。

3. 阵容提交体验增强
   - 补阵型选择、拖拽球场、首发 11 人、替补 7 人、队长、门将。
   - 与裁判端首发确认打通。

4. 报名确认体验补齐
   - 补报名限制、已报名队数、固定底部操作、按钮禁用状态。

## 八、P2 清理清单

1. 清理或注册小程序旧页面
   - 对所有未注册页面标记“保留/迁移/删除”。
   - 优先处理身份卡、裁判记录、比赛分享、旧版 detail/create/squad。

2. 统一页面命名和入口
   - 避免 `pages/team/player-add` 和 `pages/team/player-add/player-add` 这类双版本长期共存。

3. 统一赛事中心数据源
   - 小程序赛事中心、Web portal、PC 管理端需要共享赛事发布状态、榜单、赛程、球队数据。

4. 移除或替换演示数据
   - Web portal 中仍有静态青少年赛事/球队示例，需标注 demo 或接真实接口。

5. 球队 PC 取消
   - 不建设完整球队后台，也不保留 PC 批量工具；球队负责人通过小程序分享链接，让球员/家长在微信内自填信息。

6. 普通裁判 PC 取消或降级
   - 普通裁判的赛场工作全部转到小程序/平板横屏；PC 仅保留裁判长/管理员版本。

## 九、建议实施顺序

第一阶段：路由和身份入口梳理

- 小程序注册/清理页面。
- 明确主办方、球队、裁判、球员、赛事中心各自首页。
- Web 侧栏按身份拆清楚。

第二阶段：P0 闭环

- 主办方小程序审核/规程/创建赛事。
- 裁判小程序横屏执法链路。
- 赛事中心小程序公开展示端。
- 抽签分组内补齐抽签大屏展示/发布能力。

第三阶段：数据一致性

- 阵容提交与裁判确认打通。
- 报名审核与参赛名单打通。
- 榜单/赛程/赛果在小程序和 Web portal 共用数据。

第四阶段：体验打磨

- 球员身份卡、海报、分享。
- 球队 PC 取消；普通裁判 PC 取消或降级；裁判长/管理员 PC 补齐统计和详情。
- 清理旧页面与演示数据。

## 十、审计证据索引

关键代码入口：

- `miniprogram/app.json`
- `miniprogram/pages/tournament-center/tournament-center.wxml`
- `miniprogram/pages/tournament/schedule/schedule.wxml`
- `miniprogram/pages/tournament/detail/detail.js`
- `miniprogram/pages/tournament/create/create.wxml`
- `miniprogram/pages/team/player-add/player-add.wxml`
- `miniprogram/pages/roster-change/roster-change.wxml`
- `miniprogram/packageA/pages/lineup/lineup.wxml`
- `web-admin-vue/src/router/index.js`
- `web-admin-vue/src/views/tournament/TournamentDraw.vue`
- `web-admin-vue/src/views/tournament-center/TournamentCenterAdmin.vue`
- `web-admin-vue/src/views/portal/tournament/detail/RankingsTab.vue`

原型说明入口：

- `docs/prototype/screens/每张图模块元素分析.md`
- `docs/prototype/screens/第二批核心页面模块元素分析.md`
- `docs/prototype/screens/第三批裁判比赛链路与抽签大屏模块分析.md`
- `docs/prototype/screens/第四批抽签大屏修正说明.md`
