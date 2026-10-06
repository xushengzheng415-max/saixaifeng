# 数据契约 v1

## 比赛事件换人规则

单场换人规则从锁定快照读取，次选组别已生效版本。首发仅初始化在场状态，不计换人次数。换下球员必须当前在场；换入球员须在场外，并能唯一关联本场稳定球员 ID。普通组别遵守换人次数、窗口和换回规程；free 组别不设人数和窗口上限，可否再次上场由 `substitutionReentryAllowed` 决定。罚下球员不能再次上场。未知规程、号码/姓名歧义、名单缺失、分钟缺失和过期整场事件数组均不能转成有效换人；历史异常显示原因，修正后才接受后续录入。

`updateMatch` 与 `serviceMatchWorkflow.addRefereeEvent` 共用 `dataCenter/shared/substitution.mjs`。已定版组别使用受控操作更新本组换人规则：校验当前 `rulesVersion`，记录上一版规则摘要，保留别的组别规则、替补席配置及赛事报名字段。主办方需要单场补录时，比赛已完赛且电子裁判报告未锁定；正式电子记录锁定后只读。

## 身份与归属

当前兼容 `players._id` 作为稳定球员 ID、`teams._id` 作为稳定球队 ID。`teamId` 与历史 `teamCode` 通过适配读取，不能以名称或号码合并身份。新转会沿用原球员 ID。

- `player_team_memberships`：`playerId, teamId, orgId, status, validFrom, validTo, transferId`。历史加入时间没有证据时为 null，并标记 `startTimeUnknown`。
- `player_transfers`：申请、目标球队确认、操作者、原因、状态及时间；请求标识去重。
- `roster_snapshots`、`match_lineup_snapshots`、比赛内阵容与 `match_events`：保存当时名单和比赛事实。转会不改写这些记录。

同机构转会使用事务结束旧关系、建立新关系、更新当前所属并确认申请。跨机构转会当前明确拒绝，错误码 `TRANSFER_CROSS_ORG_REQUIRES_REVIEW`；双方授权及隐私资料交接流程完成前不得自动执行。

## 统一调用

PC：`callFunction('dataCenter', { action, scope })`，经 webLoginApi 验证会话后转发，数据中心再次验证原会话。机构范围来自服务端账号；平台所有者可以查看平台范围。

小程序球员详情：`getMiniWorkspace` 的 `action:'teamPlayerDetail'`，传工作空间、teamId和playerId，服务端校验空间与球队权限后调用共享服务。当前main未登记通用dataCenter dispatcher；不能把接口规划当作已接入。参与赛事不自动授予全赛事个人数据。

H5：webLoginApi 的 `action:'publicDataCenter'`，必须指定已发布赛事。只统计 `schedulePublished` 或 `published` 的比赛，返回正式结果和公开姓名；不读取私有档案字段，不返回成员关系。

支持范围字段：`teamId, playerId, tournamentId, divisionId, matchId, sportType, mode, from, to`。`matchId` 精确限定一场比赛，不能用赛事范围替代本场榜单。

- `sportType` 当前只能为 football。
- `mode:official`：来源确认为真实比赛、真实球员的审核通过结果，以及符合现行规则的主办方赛后补录。已退回、冲突、取消、未开赛、测试球队、测试球员或明确标记测试的比赛不计入；比赛是否发布不构成真实比赛证明。球队、球员、赛事或比赛来源无法核定时标为未知，不作为零场或正式积分。测试球员即使挂在真实球队下也不参与正式统计。
- `mode:provisional`：正式结果加现场暂定结果。不得混同正式排名。
- `from` 包含开始时刻，`to` 不包含结束时刻；统一 ISO 时间格式。

响应包含 `schemaVersion, metricVersion, dataVersion, generatedAt, scope, accessScope, coverage, summary, teams, players, issues`；球员查询另含 `playerTotal` 和授权范围内的 `memberships`。
比赛详情的公开适配入口为 `webLoginApi.publicMatchRankings`，接收 `tournamentId, matchId`，先验证该比赛在既有赛事中心公开接口中可见，再调用同一统计引擎。其 `data` 包含单场 `scope, rankings, metrics, coverage, metricVersion, dataVersion`；不返回私有档案，不以其他比赛补齐本场数据。

## 赛事新闻发布

PC `newsCenter` 只允许赛事所属机构中有赛事管理权限的主办方读写 `tournament_news`。文章类型为 `match` 或 `daily`，单场只能关联已归档赛果；每日文章必须完整关联所选日期的全部正式赛果。保存时记录来源 `matchIds` 与赛果版本；发布时重新核验，H5 `webLoginApi.publicTournamentCenter` 只返回已发布且全部来源版本仍有效的文章，赛果发生更正后立即隐藏旧稿。封面、正文照片与积分榜图存云文件 ID；未核实的停赛信息不作推断。

`accessScope` 为 platform、authorized 或 published。普通组织查询的“球员历史”是当前授权范围内的历史，不能声称覆盖尚未获得访问授权的全部赛事。

## 指标与完整度

可执行指标字典：`cloudfunctions/dataCenter/shared/statistics.mjs` 的 METRICS。本实施分支为 `football-metrics/4`，新增可核定首发、真实／测试球队及球员来源过滤与球员卡派生分；正式环境仍须以部署回读版本为准。

球员行按球员、当时球队、赛事、组别形成；`metrics` 是可确认值，`observed` 是已有记录中的数值，`coverage` 描述每项指标是否完整。覆盖不足时 metrics 为 null，页面显示“—”，不能把 observed 当完整累计。
完整度按指标分别判断：缺失换人身份影响出场和时间，不把已确认的进球、红黄牌一起清空。

- 首发：在正式首发阵容中的不同比赛 ID。
- 球员卡积分：统一按 [球员卡积分与等级规则 v1](PLAYER_CARD_POINTS.md) 使用完整职业生涯的出场、首发、出场分钟和有效进球；积分与等级是派生结果，不能由客户端或人工档案字段直接写成统计真值。本实施分支已计算 `starts`，正式环境尚未切换。
- 球员卡高级权益：仅已核定积分达到 100 分时开放再次更换卡片展示照片和在平台背景库中自由切换；首次选图不受此门槛限制。权益由服务端校验，旧金卡等级、历史保留等级或客户端字段不能代替积分凭证。当前各端尚未接入这项权限。
- 出场：实际出场的不同比赛 ID；替补未上场不算出场。
- 进球：有效进球与已进点球；乌龙球、点球大战排除。
- 助攻：同一进球同一助攻者只计一次。
- 第二张黄牌：计一张黄牌、一张红牌；按有效事件版本计算。
- 时间：正式统计以赛前保存并核定来源及单位的单场总时长为边界，再按首发与上下场区间计算。已完赛时旧计时器和当前规则不得覆盖原时长；缺少可靠赛前证据为未知。现场暂定值可在已证实的单场边界内使用当前钟，不能混入正式积分。
- 球队进失球、胜平负：正式比分记录；比分缺失为未知。常规比分平局与点球决胜需通过赛事规则解释，不能用跨赛事的积分相加生成平台排名。

嵌入与外部事件按 eventId 和 revision 合并；外部相同版本优先，撤销标记生效。无 ID 的旧记录不按姓名生成永久身份；仅可用本场当时球队阵容中的唯一姓名与号码组合关联已经存在的 ID，歧义不关联。无法确定身份时进入质量队列。空事件数组仅在现有记录明确提供时作为已记录集合，只有外部事件但没有完整采集声明时标记为部分记录。

## 更新、读取与权限

当前按请求重算，不持久化另一份统计真值。修订原始事实后，下次查询自动生成新版本；暂未引入后台统计缓存与队列。后续引入汇总时必须保持可重建、更新传播和版本发布规则。

读取使用稳定 `_id` 游标和 100 条以内分页；SDK 实际返回短页也继续读取直到空页。默认单范围预算 20,000 条，超出返回 `DATA_SCOPE_TOO_LARGE`，不是成功返回前 20,000 条。索引错误、读取失败返回 `DATA_READ_FAILED`，不能降级为空。

公开数据、组织数据、个人私密档案分别授权；页面不能通过篡改 orgId、playerId、teamId 获得其他机构数据。

## 平台模板编辑 action（2026-10-01）

listPlayerCardTemplates、getPlayerCardTemplate、savePlayerCardTemplate、previewPlayerCardTemplate、publishPlayerCardTemplate、continuePlayerCardTemplatePublish、getPlayerCardTemplatePublishStatus、retryPlayerCardTemplatePublish 由 webLoginApi 会话校验后仅允许平台负责人访问。getActivePlayerCardTemplate 返回指定基础卡种活动模板及版本，不返回球员私有资料。save 携带 revision；preview 使用受控示例资料与正式 PNG 渲染器；publish 返回 pending/blocked/active，激活前不改变活动版本。


## 赛事与定向预装分类（2026-10-01）

本地候选分支 codex/player-card-preload 基于新卡发布修复版本 1b046eb4。编辑器增加全平台、球队、赛事、球员分类，定向范围绑定稳定对象 ID，金银铜分别配置。旧模板缺分类时兼容全平台。对象名称由服务端回读，不接受客户端名称作为关联依据。

用户已明确：预装是添加到球员 H5 卡库，与已有卡并存；不是替换基础卡。全平台／球队／赛事／球员预装模板均按模板 ID 保存独立活动状态和发布任务；同一对象可有多张同等级卡。旧未配置 preload 的基础模板保持原活动指针兼容。预装新卡不改 players.playerCardFileId；再次发布只更新该模板已制作的专属卡。已发布模板禁止改绑，须新建。

编辑器按具体对象名称＋稳定 ID 选择球队、赛事或球员。对象检索和发布管理仅限平台负责人。H5 listMyPlayerCards 对当前授权球员添加符合范围的已发布预装卡；赛事资格取最新正式名单 approved/locked，添加记录保留规则版本与名单快照证据。player_card_library 按球员＋模板去重，添加后的卡不因转队静默删除。卡级与换背景权益仍由统一积分服务核定。预装不是授予金卡等级。

本次仅本地实现与验证；未部署、未迁移生产记录。


H5 getMyPreloadedPlayerCard、previewMyPreloadedPlayerCard、saveMyPreloadedPlayerCard 独立读取／生成／保存专属卡，模板事实及文字样式来自服务端，不接受客户端姓名、卡级、成卡图片或源图替换。selectMyPlayerCard 只改 playerCardDisplayTemplateId，可显式选回基础卡；未主动选用时保持原展示卡。仅 H5 当前页已接入卡库与展示选择，其他端尚未读取新展示选择。最终预览、保存、再次发布使用同一 PNG 渲染器。布局新增纯色／两到三色渐变、方向、字体、斜体、字距、描边与阴影；旧布局补默认值并保持原纯色。

上线前须创建 player_card_library 与 player_card_layout_presets 集合，配合已有模板／版本／状态／发布任务／成卡集合，禁止客户端直接写入；需发布 webLoginApi 新模块、字体文件及 H5 编辑器脚本，验证真实微信本人／监护人会话。当前均为本地候选，未初始化线上集合、未部署、未迁移或替换真实球员卡。


## 排版方案复用（2026-10-01）

用户要求保存排版供其他卡沿用。平台负责人通过 savePlayerCardLayoutPreset 将文字布局及全部样式、人物大小／位置、国旗／队徽大小／位置保存为命名方案；listPlayerCardLayoutPresets 支持分页及名称检索，getPlayerCardLayoutPreset 返回经过同一校验器检查的配置。集合 player_card_layout_presets 保存方案、schemaVersion、创建人和时间，同名方案不覆盖，修改另存新名称。

沿用复制到当前卡草稿，仅修改 layout/photo/badges；卡名、背景、遮罩、等级、预装对象、球员事实、已发布版本和其他卡片均不改变。保存排版不等于保存卡片草稿或发布，不携带任何照片、卡面文件、球队或球员身份。应用后需预览并保存当前卡草稿，后续编辑与方案及其他卡互不联动。本地专项及页面联测通过；集合和接口未上线。

## 主办方完赛结算补充（2026-10-01）

`updateMatch.finishOrganizerMatch` 校验原赛事机构权限、比赛记录锁及 `expectedEventRevision`，在事务中核对事件版本和状态后保存 `finished` 与两套比分字段。完整嵌入事件数组由共享 `calculateMatchEventScore` 结算有效进球、已进点球和反向乌龙球；撤销、重复 ID 与点球大战不计常规比分。缺少事件数组保留手录兼容；明确空数组为 0:0；有效进球缺少球队时拒绝结算。不得改写正在裁判记录或已提交/锁定的记录。该动作不等于裁判报告审核、正式赛果发布或生产历史数据修复。

### 比赛弃赛

PC 比赛详情的弃赛操作按 `updateMatch.forfeitMatch` 写入，要求当前赛事的比赛管理权限、赛事/球队归属、`expectedEventRevision`、弃赛方为本场主客队之一，并且裁判未接管、无锁定记录、没有比赛事件。服务端固定生成弃赛方 0、对方 3 的完赛比分、胜方与 `resultType=forfeit`，写入前后值审计并更新既有小组/联赛积分；不创建进球事件。比分读取以弃赛结果为准，不从空事件数组覆盖为 0:0。已有比赛事件或裁判记录时拒绝直接弃赛，须走赛果复核流程。


## 球员卡统一快照（本地候选，2026-10-01）

权威源是后台正式比赛事实、稳定球员 ID、赛前保存的单场时长及配对确认的应援扣款。PC 档案字段和任何端的卡面颜色都不是竞技积分权威。共享实现位于 dataCenter/shared；各函数副本通过 sync-data-center 生成，禁止分别改公式。本次指标版本 football-metrics/6，保持现网 points/2、entitlements/2 和银45／金100门槛。

所有等级读取返回 playerCard：snapshotSchemaVersion、playerId、scope、mode、status、points、tier、progress、missing、reasonCodes、coverage、scoreVersion、metricVersion、entitlementVersion、careerDataVersion、supportDataVersion、snapshotRevision 和服务端权益。ready 时 progress 含 levelStart、nextAt、pointsToNext、percent；未知时 points／tier／progress 为 null。状态保留 unverified、scope_limited、test_data_excluded；请求失败由客户端单独标记，不转成 unverified 或 0。确认的 0 分仍是 ready、bronze、progress.percent=0。

snapshotRevision 包含事实版本、完整度、核验原因、规则和应援版本，不包含响应生成时间或签名图片 URL。dataVersion 也包含被排除／来源未知的候选记录、事件撤销修订和覆盖状态。playerId 是返回行筛选；同一事实范围的单人和批量查询采用相同生涯版本及快照。coverage.playerCardComplete 按稳定 ID 核验：无关场次只有在完整的稳定 ID 阵容和事件能证明未参与时才不阻塞目标球员；缺名单或身份／事件歧义仍待核定，不以当前队籍推断历史。

PC 新入口 dataCenter.playerDetail 返回授权范围的 statistics 与独立完整生涯 playerCard。服务端先执行范围鉴权；本届／球队数据不能冒充生涯总分。原 playerCard 入口保持兼容。小程序实际球员详情入口为 getMiniWorkspace.teamPlayerDetail，使用同一服务；当前 main 未登记通用 getMiniWorkspace.dataCenter dispatcher。H5 私有卡库使用 listMyPlayerCards 批量快照，公开应援摘要使用同一构造器；不扩大公开档案权限。

### 单场时长证据

新场次在授权开赛工作流中保存 durationRulesSnapshot（football-match-duration/1）：matchId、minutesBasis(total 或 period)、minutes、periodCount（仅 period）、totalMinutes、source(kind/id/version)、frozenAt、kickoffAt。配置的 matchMinutes 在现有 halves／single UI 中表示每半场／每节，必须携带明确 periodMode 和节数；明确 total 输入不可再次乘节数。frozenAt 不得晚于开赛，来源范围必须匹配该场次。开赛后保留原快照，后来改组别／赛事规程不改历史。

正式分钟来自该快照限定下的首发／换上／换下／罚下区间，自由换回累加实际区间。历史规则证据缺失、冲突或无单位时分钟为 null，返回 MATCH_DURATION_* 原因；当前规程、旧计时器、90分钟和0都不能补成历史权威值。已完赛正式统计不采用旧钟；现场暂定可在已证实时长内显示当前钟。读取不生成历史快照，不执行自动回填。没有可靠证据的旧场次将保持待核定。

通用浏览器 matches 写入不得伪造 durationRulesSnapshot／rulesSnapshot；服务端保存钩子只处理未开赛场次，并用事务防止并发重复开赛覆盖快照。此代码尚未发布。
