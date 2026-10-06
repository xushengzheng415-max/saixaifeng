# 数据中心上线与验收

## 2026-10-05 PC 子账号正式发布

用户明确要求发布正式 PC。`preview` 中的子账号、站内信、共享赛事卡片、返回赛事空间和补录队徽更新已合入 `main`。正式构建 266 个文件已上传 `/admin/`；官网正式入口、入口 JS、TournamentSpace、TournamentConsole、TournamentStaffResults、MatchDetail 等 26 个相关 JS/CSS 资源均 HTTP 200，SHA-256 与本地构建一致；`/preview/admin/` 仍 HTTP 200 并引用预览资源。发布前补充 CloudBase 索引 `tournament_teams(tournamentId,teamId)`；此前已建 `tournament_teams(tournamentId,createTime desc)`、`divisions(tournamentId,createTime asc)`、`matches(tournamentId,matchDate asc)`、`roster_snapshots(tournamentId)`，索引列表回读一致。`resultCenter` 返回主客队名称和临时队徽地址；`webLoginApi` 子账号投影包含队徽字段并按 `teamId`/`teamCode` 关系验证球员；`resultCenter`、`webLoginApi`、`updateMatch` 均回读 Active，入口 `index.js` 哈希匹配且配置保留。没有上传小程序、服务号 H5 或球员卡 UI。真实受邀账号刷新后补录比赛、球员列表和队徽显示仍待现场确认。

## 2026-10-05 PC 子账号补录名单与队徽

受邀账号进入比赛详情时，补录相关赛事/球队关联读取依赖 `tournamentId+teamId` 索引；子账号读取投影还漏掉透明队徽和队徽文件字段，球员归属判断也只比较 `teamId` 或 `teamCode` 其中之一。现已追加 `tournament_teams(tournamentId,teamId)` 索引；staff 投影公开赛事需要展示的队徽字段，球队/球员范围同时校验两种关联键；`resultCenter.staffMatches` 返回主客队名称和队徽，比赛阵容编辑器过滤历史空占位。`resultCenter`、`webLoginApi`、`updateMatch` 已按线上包差量更新并回读 Active，线上入口源码哈希匹配，函数配置保留。正式 PC 静态发布及真实受邀账号补录、球员列表和队徽显示待现场确认。

## 2026-10-03 赛程工作台正式发布

用户确认正式发布后，最新 `main` 的本次功能提交 `fb9ee8c0` 已推送 Gitee。PC 完整构建 263 文件部署 `/admin/`；正式域名入口、`TournamentScheduleV2` 和 `MatchDetail` 的 JS/CSS 均为 HTTP 200，SHA-256 与本地构建一致。`admin/index.html` 摘要为 `E711A678666A823C04130B672F2BF8B259B6DD529ADF081EAA4C5A6AD727B87B`；赛程 JS 为 `9E4D900A253CDC7DDC524C982CA692ACB39EAD4015673ED51EB98C533B64863A`。预览 `/preview/admin/` 仍为 HTTP 200 且引用预览资源。

`updateMatch` 与 `generateSchedule` 均从线上配置拉取并只更新必要源码，恢复为 `Active`，回下载 `index.js` 与发布包 SHA-256 分别为 `0617AE59AAB320648788FDA5BB7E9868FA6C513380B86CE6F2AFA28C4D60BEB5` 和 `5BA7126FD8E65FBD948196B42F5B4205F362262DA286D1656843F19A33604C4F`。前者保留 Nodejs16.13／20 秒／256 MB，后者保留 Nodejs16.13／60 秒／512 MB，均为 `index.main` 且环境变量数 0。两函数的无会话探针均拒绝访问，未写真实比赛。`generateSchedule` 的线上比赛时长逻辑在发布源码中保留。首次不带正式配置的函数更新曾返回 `UpdateFailed/ResourceNotFound.Entryfile`；从线上拉取配置后重试成功，最终状态和代码已读回。

本地赛程、场序、裁判及球服门禁测试与 PC 构建通过，`check-data-governance` 通过。`finish-data-change` 因现有 `playerCardPublishWorker` 共享副本未同步而失败；该缺口与本次赛程代码无关。真实主办方账号在正式页面调整一场未开赛比赛并回读结果的交互验收仍待现场执行。

## 2026-10-01 照片优先展示补充

按用户确认的“报名提取头像/自主登记形象照基本都有图”调整展示：完整成卡可用时显示成卡，其余情况优先显示已授权照片；仅实际缺图提示资料补充，图片/网络异常保留重试。未修改报名照片要求、测试排除或卡级算法，也未重制已完成的 189 张成卡。

正式 webLoginApi、getMiniWorkspace 的照片读取元数据与补充入口已差量部署；从最新线上包接入，模块 ZIP 回读摘要一致。正式 PC 完整包和 H5 我的球员卡已部署：入口 `/admin/assets/index-C1FLG24j.js`、H5 JS/HTML HTTP 200 且摘要匹配。未登录 PC/个人读取仍返回 AUTH_REQUIRED/PLAYER_CARD_AUTH_REQUIRED。H5 编辑链接复核活跃邀请、有效期及稳定球员关联。

照片独立于成卡生成的专项、发布续跑回归、JS/WXML 检查、PC 构建及数据中心业务检查通过。数据中心治理检查存在 HEAD 基线已有缺口：getMiniWorkspace 的 dataCenter 入口检查及两个函数中四个统计部署副本同步检查未通过，非本轮照片改动引入，未声明治理检查全通过。

1.0.34 开发版已覆盖上传本次照片展示修订，AppID wx57164cca8676f411，总包 2230686 字节、主包 1540388 字节；仍未提交微信审核/正式发布。

2026-09-30 本轮实施状态：积分 v1 的三端显示和服务端权益门禁已在 `codex/player-card-points-implementation` 分支实现，`test-data-center`、`test-player-card-entitlement`、语法检查和 PC 构建通过。PC 使用 `dataCenter.playerCard`，小程序球员详情在原球队授权后取完整生涯卡级，C 端 H5 使用 `list/get/saveMyPlayerCard` 的共享服务积分并在保存时重查 100 分权益。`dataCenter` 与 `getMiniWorkspace` 已基于各自最新线上代码差量部署，回下载分别核对 11、10 个文件 SHA-256 全部一致；`webLoginApi` 保留线上主包并更新球员卡模块，11 个环境变量仍在，匿名制卡接口返回 `PLAYER_CARD_AUTH_REQUIRED`。H5 五个静态文件已发布并回读。PC 预览已部署，小程序开发版已上传；真实账号尚未回读。旧卡保级快照及预生成图片的可信校验仍需处理，不能称三端正式验收完成。

同日后续：PC `preview` 已合并当前实施分支并部署 `/preview/admin/`，入口与 PlayerDetail/PlayerCard 两个分包均通过正式域名 HTTP 200 和 SHA-256 回读；正式 `/admin/` 仍可访问。小程序开发版 `1.0.33` 已通过微信开发者工具上传，AppID `wx57164cca8676f411`，包体 2,676,263 字节；尚未设为体验版或正式版。H5 公开球员榜原按场次赋等级，现于线上主包的 `fanRankings` 路径接入 `fanPlayerCardScores.cjs`，一次读取正式生涯并按稳定 ID 派生积分；匿名回读 210 行中 189 行可核定、21 行待核定，最高 4 分。赛事中心实际加载的 `tournament-center-player-list-20260930.js` 与入口 HTML 已基于现网版本差量发布，未知等级不显示铜卡；两文件正式域名 HTTP 200、哈希一致。服务端第二次回下载 13 个源文件与发布包一致。上述公开接口验收不等于本人/监护、真实 PC 工作空间和小程序真机验收。

当前线上 `webLoginApi/index.js` 是其他 C 端功能的打包主文件，赛事中心实际 H5 脚本也尚未完整进入 Git 主分支。本轮只在最新线上主包加公开榜积分适配调用，仓库已保存适配模块及测试；后续合并 C 端源码时必须把 `fanRankings` 路由调用和赛事中心点击页的待核定处理一并合入，禁止直接从本功能分支的旧入口文件整包覆盖线上。

旧 `generatePlayerCard` 云函数接受客户端提交的等级，已改为直接返回 `PLAYER_CARD_LEGACY_DISABLED`。Nodejs16.13、3 秒、256 MB 的既有配置保持，线上源码回下载哈希一致；用伪造 `tier=gold` 的只读调用返回该错误码，未生成图片或写入球员。旧页面需引导到新球员详情，不能继续调用该接口。

用户本轮确认当前可登录的是龙翔杯赛事负责人身份。只读复查发现原公开应援榜对 2026-08-31 濮东晨星队—澶水先锋队测试赛仍留有 1 条无稳定球员 ID 的展示记录；该记录虽无等级与积分，也不应进入真实榜单。已将 `fanRankings` 的比赛范围收紧到数据中心核定的正式 `matchIds`，并过滤来自测试比赛的应援记录。重新部署最新线上主包并回下载 13 文件 SHA-256 全一致；按测试赛 ID 回读球员和球队榜均为 0 行，按真实立洋杯赛事 ID 回读球员 209 行、球队 16 行，189 人积分可核定、20 人待核定、最高 4 分。当前登录的测试赛事负责人身份只能验收测试数据排除，不能代替拥有真实球员访问权的账号完成三端生涯积分核对。

球员卡积分与来源过滤尚未完成正式站点和各端切换。2026-09-30 已部署新的 `dataCenter`、`webLoginApi` 外置统计模块，以及 `getMiniWorkspace`、`resultCenter` 的来源过滤入口；PC、H5 和小程序页面仍须逐项验收，不能把服务端局部切换称为全端上线。

球员卡积分 v1 的规则已登记于 [PLAYER_CARD_POINTS.md](PLAYER_CARD_POINTS.md)。截至 2026-09-30，正式环境及既有球员卡页面仍使用场次分级；完成服务端门禁、旧卡迁移和三端消费后，需单独完成预览与正式回读，不能把规则同步称作积分系统上线。

2026-09-30 第一阶段实施：隔离分支的统一数据中心提供 `football-metrics/4` 首发、真实／测试比赛及球员来源过滤与球员卡积分计算；仅平台所有者的完整正式生涯查询可获得可核定结果，范围受限或来源不明时不发放权益。PC、H5、小程序页面仍未切换。

2026-09-30 部署回读：新 `dataCenter` 为 Event 函数，`Nodejs18.15`、`index.main`、30 秒、512 MB；回下载 11 个文件 SHA-256 均一致，匿名查询返回 `AUTH_REQUIRED`。生产新建空的 `player_team_memberships`、`player_transfers` 集合，分别回读到 `playerId+_id`、`orgId+_id` 索引；未写球员、球队、比赛或积分记录。`webLoginApi` 首次更新与其他任务并发，线上未得到本轮统计模块；随后经用户授权协调暂停发布，以新的线上包为基线重制自包含包，仅替换外置 `data-center/service.cjs`、`statistics.mjs` 两文件。正式函数于 13:40:28 回读 Active，Nodejs18.15、20 秒、256 MB、Event 类型、11 个环境变量及其他源文件保持不变；回下载 12 个文件 SHA-256 均与发布包一致。匿名球员卡请求返回 `PLAYER_CARD_AUTH_REQUIRED`，公开应援榜仍成功返回 205 条。公开榜原有内嵌统计与页面、真实微信会话制卡、数据中心授权查询尚未完成新规则验收或切换，不能宣称全端积分已上线。

`getMiniWorkspace` 于 14:14:40 以其线上源码为基线差量部署：球员详情和正式名单改读共享数据服务，加入 `data-center/` 模块；原 Nodejs18.15、60 秒、512 MB、Event 类型和 1 个环境变量保留，10 个源文件线上/发布包 SHA-256 一致。无效球员详情请求返回原有范围错误，未读写真实球员。部署前补齐 `matches` 的主/客球队与赛事、`match_events` 和 `match_lineup_snapshots` 的比赛 ID、`divisions` 的赛事 ID、`players` 的球队 ID/代码分页读取索引，并回读创建成功。真实微信工作空间的两页业务回读、小程序包和旧 H5 榜单尚未切换。

正式环境只读试算（未写球员、比赛或积分记录）：`players` 1080 条，其中 750 条有测试球员标记，30 条测试球员挂在非测试球队；比赛 163 场。**前次把 9 场“已完赛”全部当作真实比赛的结论已撤回。**用户确认其中开封立洋杯 8 场为真实比赛，濮阳龙翔杯 2026-08-31 濮东晨星队对澶水先锋队 1 场为测试赛；该场双方球队均有 `synthetic=true`，新来源过滤已排除。按 8 场真实比赛重算，关联到 201 个稳定且非测试的球员 ID；187 人四项指标完整且可试算，均为铜卡（最高 4 分），14 人仍有指标缺口。真实比赛没有缺阵容；3 条旧事件尚未可靠关联球员，只影响相关指标，不把其他球员全部锁定。此为当时的只读快照，不代表其余球员是零分，也不能直接改写生产卡级。生产 `players` 中未发现已保存的 `playerCardTier` 或成卡文件字段；既有页面仍可能动态显示旧场次卡级。正式授予仍须在部署后按相同规则回读并完成授权与数据版本校验。

`resultCenter` 于 14:38:44 从线上源码基线差量部署：测试球队或测试球员涉及的比赛仍可查看原始记录，但不进入正式积分榜与发布条件；Nodejs18.15、60 秒、512 MB、Event 类型和原环境变量数量保持不变，9 个源文件线上/发布包 SHA-256 一致。匿名无效会话请求被拒绝；真实主办方会话的榜单回读和已发布快照一致性仍待验收。

并发发布后再次回下载：`webLoginApi` 于 14:36、`getMiniWorkspace` 于 14:38 被其他任务更新；两者现网 `data-center/service.cjs`、`statistics.mjs` 的 SHA-256 仍与本实施分支一致，小程序球员详情与正式名单入口仍调用统一统计服务。因此没有用旧包反复覆盖；现网最新版本号与上述首次发布时刻不同，后续发布须以各自最新线上包为基线。

## 部署依赖

1. 验证知识库和共享模块一致性，执行完整业务测试。
2. 云函数分别打包：dataCenter、getMiniWorkspace、webLoginApi、resultCenter。共享副本已随各函数目录提供，不依赖跨目录 require。
3. 服务端需具有读写目标集合的权限；客户端规则继续禁止任意读写私有集合。
4. 平台所有者调用 dataCenter 的 initializeCollections，创建 player_team_memberships、player_transfers；重复初始化幂等。不在普通查询时自动修改数据库。
5. 既有集合 matches、match_events、match_lineup_snapshots、publication_snapshots、teams、players、tournaments、auth_sessions 需可用。
6. 按实际查询补索引：各查询等值字段 + `_id` 升序，例如 match_events(matchId,_id)、matches(tournamentId,_id)、matches(homeTeamId,_id)、matches(awayTeamId,_id)、player_team_memberships(playerId,_id)、player_transfers(orgId,_id)。需在预览环境验证 CloudBase 实际索引与权限行为。
7. 部署服务后再发布 PC 页面、H5 页面和小程序。PC 路由 /data-center，H5 data-center.html，小程序通过工作空间接口访问。
8. 使用去标识化隔离赛事回读接口和各端结果，核对 dataVersion、归属、缺失和权限；再按既有发布流程上线。

## 验收证据

tools/test-data-center.mjs 使用隔离模拟数据覆盖：5+3 的转会生涯累计、各队贡献保留、赛事/组别/项目/时间范围、未上场替补、正式与暂定、修订撤销、乌龙与点球大战、助攻去重、缺失指标、1250 条事件读取、读取失败和预算上限、公开范围、伪造身份拒绝、转会事务与幂等。

模拟测试不替代真实 CloudBase 的事务、集合初始化、索引、会话中转和线上回读。生产大数据量、跨机构历史身份和隐私授权尚需审计。

## 回滚与迁移

代码部署前保留上一版本发布包；新集合初期只承载新转会和关系历史，不删除旧事实。转会是业务事实，不能靠回滚页面恢复球员归属；如需撤回，应执行经审核的反向业务操作并保留审计记录。

旧 ID 关系映射、批量合并和生涯补录必须先提供 dry-run 报告、来源证据、冲突清单、备份和回滚策略。当前未自动执行历史数据修复或未知加入时间补写。

本地浏览器验收：PC 桌面 1440px 和手机 390px，以虚构赛事验证查询、未知值和质量队列，未出现页面错误。截图留在仓库外的 outputs/data-center-20260929。提交版本从已核对的最新 origin/main 整合，未包含原工作区其他未提交改动。

## 2026-10-01 平台模板保存与发布正式接通

### 全平台活动成卡更新

本轮正式部署 webLoginApi、getMiniWorkspace、playerCardPublishWorker，以及完整 `/admin/` 和 H5 相关文件；从线上包差量构建，保留现有应援积分、工作空间生命周期、阵容和账户转移实现。PC 构建通过，正式域名入口、平台分包、H5 编辑器、登记 app 和赛事榜单资源 HTTP 200 且 SHA256 与发布产物一致。未登录的私有成卡/预览请求分别返回 AUTH_REQUIRED / PLAYER_CARD_AUTH_REQUIRED。

新增任务续跑为 Event 函数，512 MB、60 秒、每分钟 timer；客户端 invoke 规则为 false，无 HTTP 路由。真实回读确认触发器存在，审核 1081 条来源时按现行完整积分（包含正式应援账本）认定 189 条铜卡可制、142 条指标待核定、750 条测试排除。初始同步采用已经发布的铜卡 v3，不覆盖负责人版式，不主动发布银/金草稿。最终任务 `9bafbc0f36ee5633ba15e7ee02c741c0` 回读为 active、affected=189、failures=[]；ready 的 resvg/2 成卡记录为 189，bronze.active 仍为原模板 v3，candidate=null。142 条未知指标和 750 条测试分别列入 skipped。

抽查正式 PNG 后补齐了 COS/CDN 队徽地址转永久文件 ID 的兼容，并重制所有受影响成卡。复扫新增目标曾触发批量积分缓存漏项；修正为补读新增目标且不把缓存缺失当成积分未核定，专项回归通过后恢复任务并完成。后台关闭后的 timer 续跑已用真实任务验证。正式网页最后入口 `/admin/assets/index-CZkXj3EA.js` HTTP 200 且与本地产物 SHA256 一致；三个函数的读取、发布、源图、suite、积分模块按 ZIP 回读逐文件核对摘要一致。匿名 web relay 也明确拒绝 playerCardPublishWorker。

标准照补齐边界专项校验：legacy_roster 的首次标准照补齐允许；已标准照的再次替换仍受积分限制；客户端自传源图拒绝。固定读取器专项验证活动指针变化后不返回旧版 URL、资料版本不符返回 pending。语法检查、PC 正式构建和微信上传编译通过。受账号权限约束，未宣称已通过真实负责人/监护人三端 UI 全流程验收。

小程序 1.0.34 已成功上传开发版（wx57164cca8676f411，总包 2228495 字节、主包 1538301 字节）。尚未提交微信审核或完成微信正式发布；旧微信正式页面不能据此称已切换新消费者。

用户反馈正式编辑器不能保存/发布，授权修复并按平台后台规则直接部署正式版。源码提交 e2589b34（接口及前端），43226f8c（发布文档 ID 写入修正）。从最新线上 webLoginApi 源码差量接入模板服务，保留现网 fanCenter/fanSupportPlayer/fanWallet 与公开球员 ID 修正；未覆盖为旧函数包。

建立 player_card_templates、player_card_template_versions、player_card_template_states、player_card_publish_jobs、player_card_renders 五集合，均 ADMINONLY。上传已回读的铜银金背景与黑白遮罩，初始化三份草稿（revision=1、draftVersion=1、publishedVersion=0）及三份 active=null 的卡种状态；默认布局未被自动发布。首次读库确认 players.playerCardFileId 非空数量为 0。

保存使用平台负责人会话、字段/PNG 校验及 revision 冲突校验，保存后回读草稿。发布创建不可变快照和待激活任务；渲染校验、现有卡重制通过后事务切换活动指针，后台再回读活动版本。服务端大图预览使用同一 PNG 渲染器及受控示例人物资料。灰度遮罩允许少量抗锯齿彩色边缘；黑遮挡、白透出方向已在完整样例成卡中核对。

webLoginApi 通过 COS 方式完成代码更新，包含 Linux x64 原生 resvg 依赖、pngjs、中文字体及 OFL 许可证。线上回下载的 index.js、四服务模块、两字体、两示例素材、Linux 原生库共 10 项与发布包 SHA-256 一致。真实线上无活动模板读回 status=unavailable，匿名保存返回 AUTH_REQUIRED；没有伪造管理员登录会话。尚未代用户执行真实模板保存或发布，三份草稿和空活动指针已读回。

正式 /admin/ 生产构建并完整部署，HTTP 200；入口脚本 SHA-256 A3708573D832494133BF43D8EA2A8C729DB48A682EB6FEEA99C0F0D6D1A51DF3、平台编辑页分包 SHA-256 FF1C53EA0B9796CEF7E366A2708C0278483126658E5CEFD2F54EAC3E1273391F 均线上/本地一致。未运行测试套件。PC/H5/小程序个人成卡消费接口仍需后续接入活动模板；本次仅确认后台模板保存/发布服务已部署，不把它表述为三端成卡已统一生效。

## 2026-10-01 发布状态空对象写入修复

用户真实发布铜卡草稿3时，CloudBase 把普通对象更新展开为 candidate.jobId 等点路径；当前 candidate=null，导致 Cannot create field 'jobId' in element {candidate:null}。正式读回确认铜卡 draftVersion=3/revision=3，三种活动/候选指针仍为 null，发布任务集合为空；失败事务已回滚，用户草稿未丢失。

源码 8d79eaec：candidate、active、published 和 draft 的整对象更新改用 db.command.set，兼容 null→对象及后续版本整体替换；同类写入全部核对。数据库内部错误改为可执行的简短提示，前端发布异常恢复为“发布未完成，可重试”。没有改写用户草稿，也没有手动伪造已发布状态。

webLoginApi 从最新线上包仅替换两模板模块，以 COS 更新并回下载；playerCardPublish.cjs SHA-256 C91AC187431A05151B46E9C2B24C8812A143DB277D385FD32AF55EA83D0FA83E，playerCardTemplates.cjs D715246B917EF23D2A608998B1E87CC18D4C3E43E61D5F7CA9C4D02265BEDA4A，入口 index.js 与基线一致。正式前端构建、整包部署完成，HTTP 200；入口脚本 SHA-256 8CB3E24CA37B5D075A13E72DB51BAC6E9CA29E0FBE96785F077F48F1F979238D，平台页分包 CD31AEDA361BB8B3F2CD8BBA95217B3849597DF73BAD0FD6A84D8AF13A722690，线上/本地一致。未执行测试阶段；修复后的真实发布结果由平台负责人重新发布后核验。

## 2026-10-01 立洋杯老年组无限换人

用户确认正式发布后，本次换人规则变更提交 `cf341d5` 并推送 Gitee `main`。正式老年组规则已设为自由无限换人并允许换回；共享校验覆盖 PC 补录与服务号裁判登记。PC 正式包完整部署 `/admin/`，259 个文件上传完成。正式入口 HTTP 200，仅引用 `/admin/assets/`；入口脚本及 DivisionRulesWizard、MatchDetail、MatchReviewWorkspace 分包均通过线上/本地 SHA-256 对比。`/preview/admin/` 仍返回 HTTP 200 且继续引用预览资源路径。

## 2026-10-01 比赛结算和日历上下文补丁（未发布）

本地专项回归覆盖事件结算、空事件、乌龙球、点球、重复/撤销事件、全组别与指定组别返回、记录锁、并发事件修订和事务完赛。正式仓库 PC 构建与数据中心业务/治理检查通过；隔离 main 基线全量治理仍缺小程序登记及 support.cjs，仅本次 statistics.mjs 副本专项检查通过。发布须同时包含 PC 前端与 updateMatch 的 statistics.mjs 部署副本，禁止只发布前端造成新完赛动作被旧后端误处理。发布前从线上包核对同期修改；未授权生产数据修复，旧错比分需另行按原事件核对。

## 2026-10-02 赛制修改门禁正式部署

赛制分阶段修改门禁、比赛中换人白名单和未开赛比赛读取组别最新规则已推送 Gitee `main`（代码 `1b0ad7a`，发布记录 `69da0c2`）。正式组别管理、比赛补录与裁判登记函数均已更新代码并下载回读：`webLoginApi/index.js` 与 `divisionRuleMutationPolicy.cjs`、`updateMatch/data-center/substitution.mjs`、`serviceMatchWorkflow/data-center/substitution.mjs` 的 SHA-256 与发布包一致。更新只改函数代码，函数配置与环境变量保持原值。

正式 `/admin/` 完整上传 259 个文件。正式入口 HTTP 200 且只引用 `/admin/assets/`；入口、DivisionRulesWizard、MatchDetail、MatchReviewWorkspace 资源线上 SHA-256 均与发布包一致。`/preview/admin/` 仍返回 HTTP 200 且继续使用预览资源路径。规则变更只用于尚未开赛的比赛；已开赛与完赛场次保留原规则快照。

## 2026-10-02 比赛管理结算与日历返回正式发布

用户明确授权修复并发布。函数 `updateMatch` 以线上回下载包为基线，只更新入口并加入共享 `statistics.mjs`、`playing-time.mjs`；线上 `substitution.mjs` 保持原摘要。CloudBase 回读 `Active/Available`、`Nodejs16.13`、20 秒、256 MB、`index.main`、原环境变量数量 0；回下载入口 SHA-256 `068AA5642753723217D33033B17EE1BA9F760351D6DFABDB665508EA3FD8AE75`，统计模块 `6B6C8A511F275F882DA9928B210493CAF578AAFAC26C5314542CFC0DA6450985`，均与发布包一致。无登录会话的只读探针被拒绝。

PC 用已正式发布功能的源码基线构建完整 260 文件包，上传 `/admin/`。正式域名及托管域名 HTTP 200、入口仅引用 `/admin/assets/`；入口 `index-BydhH3nz.js` SHA-256 `E4D5980F370AB1C661AFA54B5B650F6A4B0CD15B64A9E2D5583EABEEFFB8019B`，`TournamentScheduleV2-0YSzJuE4.js` 和 `MatchDetail-Crnq82yY.js` 均与公网字节一致；另三个比赛处理分包也通过字节回读。预览 `/preview/admin/` 仍为 HTTP 200 并引用预览资源。最新 main 已合入修复，正式站本次专用构建没有发布 main 的未上线赛制调整候选。

生产只读核对：2026-10-01 中年组场序 #16（当前 `ongoing`）、#17（当前 `scheduled`）均无内嵌进球事件，独立 `match_events` 表也无两场事件；无法仅凭旧页面输入恢复进球或推断比分，未改写生产比赛记录。需由有权限的现场/主办方按实际赛况重新记录并结束比赛。未使用真实主办方会话对新写入链路做业务回读，本次只确认代码、权限拒绝及静态资源上线。

## 2026-10-06 共享赛事弃赛入口正式发布

同一比赛详情在预览版已有“弃赛”按钮，正式版缺失。本次将经审计的弃赛写入接入主办方及获授赛事比赛管理权限的共享账号；弃赛方由服务端核验为本场参赛队，未开始/进行中的比赛才可提交，并校验比赛事件版本、裁判锁和已有比赛事件。服务器保存 0:3 或 3:0、弃赛方和胜方，写入操作者审计并同步积分；不伪造进球事件。赛果读取保留正式弃赛比分。

功能提交 `b6f9c451`，已合入并推送 Gitee `main`，合并提交 `f76b5d80`。正式 `updateMatch` 与 `resultCenter` 从线上代码包差量更新并回下载核对；两函数 `index.js` SHA-256 分别为 `6527DF95614495222769DDA6D81714F3ECAE19F646F1CA797A39E621537A1913` 和 `5C22D53EB091B7EF59C4651E1302F8D369B593312930798740E5C658CE48D5BF`，均与部署包一致，函数配置未改。

正式 PC 从合并后的 `main` 构建并完整上传 `/admin/`，共 267 个文件。`https://www.sxffootball.cn/admin/` 返回 HTTP 200；入口及 `MatchDetail-DApjqI7g.js` 线上字节的 SHA-256 均与构建产物一致，详情分包内已包含“弃赛”和 `forfeitMatch`。预览 `/preview/admin/` 仍返回 HTTP 200 且引用预览资源。只完成代码/资源发布核对，没有用真实共享账号提交弃赛，也没有改动赛事数据；未运行独立测试套件。


## 2026-10-01 球员卡统一候选：本地验证，未部署

初始基于 main 93ce4890，交付前跟进 main 69da0c28，隔离分支 codex/player-card-unify-local。统一指标版本 football-metrics/6，等级／权益保持现网 v2。PC build、数据中心回归、12组统一合同、裁判全流程、卡权限与治理检查通过。当前只交付本地集成提交；没有 main 推送、云函数部署、资源或数据初始化、历史回填、小程序上传或正式账号跨端验收。

正式回读显示 dataCenter 和 getMiniWorkspace 为 metrics/5，webLoginApi 和 playerCardPublishWorker 为 metrics/4，四者都为 points/2。因此不能用未核验的旧 main 整包覆盖生产。指定发布线程先合入此候选、同步共享模块并复测，再按精确文件差量串行发布。历史缺证据场次保持待核定；恢复真实进度需要逐场可追溯的旧时长证据和另行授权的数据修复，不能用当前组别配置补写。详见 PLAYER_CARD_UNIFY_HANDOFF.md。

## 2026-10-06 主办方侧栏隐藏平台数据中心

回归原因：2026-09-29 的数据中心功能提交将 `/data-center` 加进主办方 `organizerNavItems`。2026-10-03 曾移除，但后续主办方子账号合并从旧快照带回了这一行；正式页面整包部署时再次显示。数据中心一直配置在 `adminNavItems` 和平台会话路由中，本次只从主办方菜单移除，平台运营后台保留。

修复提交 `e6aad0d` 已合入并推送 Gitee `main`，合并提交 `8086ad5f`。正式 `/admin/` 完整上传 267 个文件，入口、主入口脚本与 `LayoutView-BWOhtd6V.js` 均 HTTP 200，线上 SHA-256 与构建产物一致；侧栏分包不再包含主办方数据中心路径，仍保留平台后台“数据中心”标签。预览 `/preview/admin/` 返回 HTTP 200 且继续引用预览资源。没有改云函数或业务数据，也未运行独立测试套件。

## 2026-10-06 个人赛事与共享赛事并存正式发布

确认规则：共享赛事权限不构成加入主办方机构工作空间；本人赛事与共享赛事同列在赛事空间，共享卡只出现一个“共享赛事”标识；共享账号可创建自己的机构和赛事；“返回赛事空间”仅退出当前赛事上下文并切回本人机构，不撤销共享授权。

源码 `8b53304` 已合入并推送 Gitee `main`（合并提交 `c0a002e`）。PC 构建成功后完整上传正式 `/admin/`，共 267 个文件。正式入口 `index.html`、主入口 `index-urNFXls5.js`、布局分包 `LayoutView-BDV4jEyZ.js`、赛事空间分包 `TournamentSpace-TepU4wmp.js` 均 HTTP 200，线上 SHA-256 与构建产物一致；赛事空间分包包含“创建我的赛事”和单个共享标识，布局分包包含“返回赛事空间”及本人机构切换动作。预览 `/preview/admin/` 仍返回 HTTP 200 并引用预览资源。

`onboardingWorkspace` 与 `tournamentStaffAccess` 从各自线上包差量更新，回下载入口 SHA-256 分别为 `A9A90C9C1B0D09052F93023F7590B9621FF5C34D13A05641A5546036ED6ED0BE`、`C08EF18AF3671D645B6EECAA112C0406A3A9DCCE9E4AF44FC0792B9AD8E0D355`，均与部署包一致。没有改集合结构、写业务数据或使用真实账号创建机构/赛事，也未运行独立测试套件。

## 2026-10-06 共享授权线上与线下告知正式发布

新增统一操作规范 `docs/SHARED_TOURNAMENT_ACCESS.md`，并在 `docs/README.md` 登记。PC 账号管理页的分发和受邀入口链接到同一份线上说明；顶部有待接受邀请时显示“赛事邀请”，点击后直达待接受邀请。线上规范页面提供打印/另存 PDF，供主办方线下交接；纸质交接提醒本人仍须登录并在线接受。

Gitee `main` 已合并本次改动（代码提交 `c9e50f9`，合并提交 `bd71123b`）。正式 `/admin/` 完整上传 268 个文件；入口、规范 HTML、`LayoutView-DyKYkt6M.js`、`TournamentStaffAccess-WKCnzBfD.js` 均 HTTP 200，线上 SHA-256 与构建产物一致。预览 `/preview/admin/` 仍为 HTTP 200 且使用预览资源路径。本次没有发送短信/微信，没有打印或转交纸质文件，也未运行独立测试套件。

## 2026-10-06 共享赛事导航读取取消提示修正

主办方/平台会话通道在路由没有改变身份时不再重复清空读取缓存；读取身份键加入共享工作人员状态、赛事和权限。由导航或账号上下文切换造成的 `READ_CACHE_INVALIDATED`、`SESSION_ACCOUNT_MISMATCH` 仅按过期读取取消处理，不再由 `queryList` 显示为权限异常。真实授权拒绝仍沿用原错误反馈。

改动已合入并推送 Gitee `main`（功能提交 `1651e77`，合并提交 `14743acf`）。正式 `/admin/` 完整上传 268 个文件；`index.html`、主入口、`cloud`、`LayoutView`、`TournamentTeams` 分包均 HTTP 200，线上 SHA-256 与构建产物一致；预览 `/preview/admin/` 仍正常。没有修改云函数或授权数据，未运行独立测试套件。

## 2026-10-06 补齐竞赛管理读取参赛球队权限

原因：子账号授权项包含 `event.competition`，但 `staffDbRights.readRights('tournament_teams')` 未把竞赛管理模块纳入读取白名单，导致“全部权限”账号进入竞赛管理时仍被拒绝读取本赛事的参赛关系。现只补 `event.competition` 的读取映射；行级范围继续限制为当前获授权赛事，新增、修改和删除权限保持原口径。

功能提交 `4ee46ee` 已合入并推送 Gitee `main`（合并提交 `a45f6611`）。生产 `webLoginApi` 从线上包差量更新；线上 `index.js` 保持原摘要 `2BD303520AFB5607034CA3A616D72CF8B34EB792E4EAA58BAF876459962C85A5`，`staffDbRights.cjs` 回下载 SHA-256 `7FD55D76D8CCC56FFDA2163ECD9E784DE2C4A408FABA0C86744CB0E07E2E8D9E` 与部署包一致。没有修改授权记录或赛事数据，也未运行独立测试套件。

## 2026-10-06 抽签页球员读取权限收敛与完整权限修复

抽签模块加载中的球员读取现在需要同时拥有 `event.draw` 和 `event.teams`；只获得抽签权限的账号仍不能读取球员资料。“全部权限”包含这两项，因此该账号完整授权可通过。行级校验仍限制在本赛事登记球队关联的球员。

源码提交 `8f1fb0d` 已合入并推送 Gitee `main`（合并提交 `56d8becc`）。生产 `webLoginApi` 代码更新命令返回成功；函数详情为 Active/Available、Nodejs18.15、`index.main`，ModTime `2026-10-06 19:39:12`。部署后 `fn code download` 两次返回 CLI `Invalid URL`，因此尚未完成文件级摘要回读；未写入赛事数据、未使用真实账号操作，也未运行独立测试套件。
