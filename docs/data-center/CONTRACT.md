# 数据契约 v1

## 赛事子账号授权（PC 测试版）

`tournament_staff_grants` 以机构、赛事、受邀手机号建立唯一邀请；受邀者用已核验的自然人账号接受后，记录 `userId` 与 `active` 状态。新授权按当前主办方侧栏十项 `event.*` 权限保存，“全部权限”展开为这十项，不存永久通配符。旧 `result.supplement`、`news.edit`、`news.publish` 继续按原操作范围校验，停用后新请求立即拒绝。`organization_memberships` 仅为新子账号建立 `event.view` 成员关系，不写入宽泛的 `event.manage`。同一用户可在不同机构或赛事拥有不同授权。

PC 经 `webLoginApi` 会话中转调用 `tournamentStaffAccess` 的 `scope/mine/invitations/managed/invite/accept/activate/update/disable`。`resultCenter.staffMatches/supplementResult` 和 `newsCenter.list/saveDraft/publish/withdraw` 每次写入前按当前用户、机构、赛事和动作重新验权；PC 通用查询、上传与云函数中转对该类账号单独收口。补录赛果使用既有 `matches` 正式结果字段与审计记录，不新建独立比分表。小程序尚未接入本授权接口。

新闻草稿、发布和撤回使用 `version` 乐观版本。更新请求须传上次读取的版本；服务端在事务内核对并递增，冲突返回“已在其他设备更新”，客户端刷新后再编辑。

## 比赛事件换人规则

单场换人规则从锁定快照读取，次选组别已生效版本。首发仅初始化在场状态，不计换人次数。换下球员必须当前在场；换入球员须在场外，并能唯一关联本场稳定球员 ID。普通组别遵守换人次数、窗口和换回规程；free 组别不设人数和窗口上限，可否再次上场由 `substitutionReentryAllowed` 决定。罚下球员不能再次上场。未知规程、号码/姓名歧义、名单缺失、分钟缺失和过期整场事件数组均不能转成有效换人；历史异常显示原因，修正后才接受后续录入。

本场阵容快照中的 `null` 或非对象空槽会作为空位剔除，不参与可换球员计算；真实球员对象仍须带有效且唯一的稳定 ID。

`updateMatch` 与 `serviceMatchWorkflow.addRefereeEvent` 共用 `dataCenter/shared/substitution.mjs`。已定版组别使用受控操作更新本组换人规则：校验当前 `rulesVersion`，记录上一版规则摘要，保留别的组别规则、替补席配置及赛事报名字段。主办方需要单场补录时，比赛已完赛且电子裁判报告未锁定；正式电子记录锁定后只读。

## 身份与归属

当前兼容 `players._id` 作为稳定球员 ID、`teams._id` 作为稳定球队 ID。`teamId` 与历史 `teamCode` 通过适配读取，不能以名称或号码合并身份。新转会沿用原球员 ID。

- `player_team_memberships`：`playerId, teamId, orgId, status, validFrom, validTo, transferId`。历史加入时间没有证据时为 null，并标记 `startTimeUnknown`。
- `player_transfers`：申请、目标球队确认、操作者、原因、状态及时间；请求标识去重。
- `roster_snapshots`、`match_lineup_snapshots`、比赛内阵容与 `match_events`：保存当时名单和比赛事实。转会不改写这些记录。

同机构转会使用事务结束旧关系、建立新关系、更新当前所属并确认申请。跨机构转会当前明确拒绝，错误码 `TRANSFER_CROSS_ORG_REQUIRES_REVIEW`；双方授权及隐私资料交接流程完成前不得自动执行。

## 统一调用

PC 的独立“数据中心”页面归平台运营后台，`/data-center` 走平台会话，不在主办方侧栏展示。底层 `dataCenter` 服务仍可由既有业务入口在授权范围内调用；经 webLoginApi 验证会话后转发，数据中心再次验证原会话，不因页面入口调整扩大或删除统计权限。

小程序：`getMiniWorkspace` 的 `action:'dataCenter'`，传工作空间和 scope。服务端校验空间与角色权限，从已授权球队和主办赛事确定范围；参与赛事不自动授予全赛事个人数据。

H5：webLoginApi 的 `action:'publicDataCenter'`，必须指定已发布赛事。只统计 `schedulePublished` 或 `published` 的比赛，返回正式结果和公开姓名；不读取私有档案字段，不返回成员关系。

支持范围字段：`teamId, playerId, tournamentId, divisionId, matchId, sportType, mode, from, to`。`matchId` 精确限定一场比赛，不能用赛事范围替代本场榜单。

- `sportType` 当前只能为 football。
- `mode:official`：来源确认为真实比赛、真实球员的审核通过结果，以及符合现行规则的主办方赛后补录。已退回、冲突、取消、未开赛、测试球队、测试球员或明确标记测试的比赛不计入；比赛是否发布不构成真实比赛证明。球队、球员、赛事或比赛来源无法核定时标为未知，不作为零场或正式积分。测试球员即使挂在真实球队下也不参与正式统计。
- `mode:provisional`：正式结果加现场暂定结果。不得混同正式排名。
- `from` 包含开始时刻，`to` 不包含结束时刻；统一 ISO 时间格式。

响应包含 `schemaVersion, metricVersion, dataVersion, generatedAt, scope, accessScope, coverage, summary, teams, players, issues`；球员查询另含 `playerTotal` 和授权范围内的 `memberships`。
比赛详情的公开适配入口为 `webLoginApi.publicMatchRankings`，接收 `tournamentId, matchId`，先验证该比赛在既有赛事中心公开接口中可见，再调用同一统计引擎。其 `data` 包含单场 `scope, rankings, metrics, coverage, metricVersion, dataVersion`；不返回私有档案，不以其他比赛补齐本场数据。

H5 公开球员榜 `fanRankings.data.players` 的球员卡字段为 `cardTier, cardPoints, cardScoreVersion, careerMetrics, careerPoints, supportDrops, supportPoints`。`careerMetrics` 仅从统一数据服务的完整正式生涯取得 `appearances, starts, minutesPlayed, goals, assists`；某项未核定时为 null，范围不完整时整个 `careerMetrics` 为 null。v2 综合卡片积分为比赛积分加 `floor(supportDrops/10)`；`supportDrops` 是该球员生涯累计收到的有效蜂蜜，不是本期 `supportCount`、球迷账户余额或球队应援。旧榜单快照中的同名 `appearances/goals/assists/points` 不是职业生涯真值，球员资料页不得将它们与新积分混排。

`accessScope` 为 platform、authorized 或 published。普通组织查询的“球员历史”是当前授权范围内的历史，不能声称覆盖尚未获得访问授权的全部赛事。

## 指标与完整度

可执行指标字典：`cloudfunctions/dataCenter/shared/statistics.mjs` 的 METRICS。本实施分支为 `football-metrics/4`，新增可核定首发、真实／测试球队及球员来源过滤与球员卡派生分；正式环境仍须以部署回读版本为准。

球员行按球员、当时球队、赛事、组别形成；`metrics` 是可确认值，`observed` 是已有记录中的数值，`coverage` 描述每项指标是否完整。覆盖不足时 metrics 为 null，页面显示“—”，不能把 observed 当完整累计。
完整度按指标分别判断：缺失换人身份影响出场和时间，不把已确认的进球、红黄牌一起清空。

- 首发：在正式首发阵容中的不同比赛 ID。
- 球员卡积分：统一按 [球员卡积分与等级规则 v2](PLAYER_CARD_POINTS.md) 从完整正式生涯和已确认的球员应援计算；`careerPoints, supportDrops, supportPoints, points, tier, scoreVersion, careerDataVersion, supportDataVersion, dataVersion` 同源返回，不能由客户端或人工档案字段写成统计真值。当前生产仍以实际部署回读版本为准。
- 球员应援写入：`fan_supports` 与 `fan_points_ledger` 以同一 `supportId` 关联，均保存稳定 `playerId`；一笔确认应援对应一笔 `delta=-1` 扣费。球迷资料中的 `honeyBalance` 与两笔记录在文档事务中更新，重试用 `requestKey` 幂等；团队应援记录不得算入球员卡。历史无稳定 ID 或缺扣费证据的记录不回补。计分读取只接受状态已确认、球员 ID 一致且扣费凭证唯一的配对记录。
- 球员卡高级权益：仅已核定**综合积分**达到 100 分时开放再次更换卡片展示照片和在平台背景库中自由切换；首次选图不受此门槛限制。权益由服务端校验，旧金卡等级、历史保留等级或客户端字段不能代替积分凭证。
- 出场：实际出场的不同比赛 ID；替补未上场不算出场。
- 进球：有效进球与已进点球；乌龙球、点球大战排除。
- 助攻：同一进球同一助攻者只计一次。
- 第二张黄牌：计一张黄牌、一张红牌；按有效事件版本计算。
- 时间：裁判计时优先；已完赛且有明确比赛/组别规则时可按规则时长计算。仍需要完整首发与上下场依据；缺少依据为未知。规则时长不等于裁判实测，应在字段来源中注明。
- 球队进失球、胜平负：正式比分记录；比分缺失为未知。常规比分平局与点球决胜需通过赛事规则解释，不能用跨赛事的积分相加生成平台排名。

嵌入与外部事件按 eventId 和 revision 合并；外部相同版本优先，撤销标记生效。无 ID 的旧记录不按姓名生成永久身份；仅可用本场当时球队阵容中的唯一姓名与号码组合关联已经存在的 ID，歧义不关联。无法确定身份时进入质量队列。空事件数组仅在现有记录明确提供时作为已记录集合，只有外部事件但没有完整采集声明时标记为部分记录。

## 更新、读取与权限

当前按请求重算，不持久化另一份统计真值。修订原始事实后，下次查询自动生成新版本；暂未引入后台统计缓存与队列。后续引入汇总时必须保持可重建、更新传播和版本发布规则。

读取使用稳定 `_id` 游标和 100 条以内分页；SDK 实际返回短页也继续读取直到空页。默认单范围预算 20,000 条，超出返回 `DATA_SCOPE_TOO_LARGE`，不是成功返回前 20,000 条。索引错误、读取失败返回 `DATA_READ_FAILED`，不能降级为空。

公开数据、组织数据、个人私密档案分别授权；页面不能通过篡改 orgId、playerId、teamId 获得其他机构数据。
