# 数据契约 v1

## 身份与归属

当前兼容 `players._id` 作为稳定球员 ID、`teams._id` 作为稳定球队 ID。`teamId` 与历史 `teamCode` 通过适配读取，不能以名称或号码合并身份。新转会沿用原球员 ID。

- `player_team_memberships`：`playerId, teamId, orgId, status, validFrom, validTo, transferId`。历史加入时间没有证据时为 null，并标记 `startTimeUnknown`。
- `player_transfers`：申请、目标球队确认、操作者、原因、状态及时间；请求标识去重。
- `roster_snapshots`、`match_lineup_snapshots`、比赛内阵容与 `match_events`：保存当时名单和比赛事实。转会不改写这些记录。

同机构转会使用事务结束旧关系、建立新关系、更新当前所属并确认申请。跨机构转会当前明确拒绝，错误码 `TRANSFER_CROSS_ORG_REQUIRES_REVIEW`；双方授权及隐私资料交接流程完成前不得自动执行。

## 统一调用

PC：`callFunction('dataCenter', { action, scope })`，经 webLoginApi 验证会话后转发，数据中心再次验证原会话。机构范围来自服务端账号；平台所有者可以查看平台范围。

小程序：`getMiniWorkspace` 的 `action:'dataCenter'`，传工作空间和 scope。服务端校验空间与角色权限，从已授权球队和主办赛事确定范围；参与赛事不自动授予全赛事个人数据。

H5：webLoginApi 的 `action:'publicDataCenter'`，必须指定已发布赛事。只统计 `schedulePublished` 或 `published` 的比赛，返回正式结果和公开姓名；不读取私有档案字段，不返回成员关系。

支持范围字段：`teamId, playerId, tournamentId, divisionId, matchId, sportType, mode, from, to`。`matchId` 精确限定一场比赛，不能用赛事范围替代本场榜单。

- `sportType` 当前只能为 football。
- `mode:official`：审核通过的有效结果，以及符合现行规则的主办方赛后补录。已退回、冲突、取消、未开赛不计入。
- `mode:provisional`：正式结果加现场暂定结果。不得混同正式排名。
- `from` 包含开始时刻，`to` 不包含结束时刻；统一 ISO 时间格式。

响应包含 `schemaVersion, metricVersion, dataVersion, generatedAt, scope, accessScope, coverage, summary, teams, players, issues`；球员查询另含 `playerTotal` 和授权范围内的 `memberships`。
比赛详情的公开适配入口为 `webLoginApi.publicMatchRankings`，接收 `tournamentId, matchId`，先验证该比赛在既有赛事中心公开接口中可见，再调用同一统计引擎。其 `data` 包含单场 `scope, rankings, metrics, coverage, metricVersion, dataVersion`；不返回私有档案，不以其他比赛补齐本场数据。

`accessScope` 为 platform、authorized 或 published。普通组织查询的“球员历史”是当前授权范围内的历史，不能声称覆盖尚未获得访问授权的全部赛事。

## 指标与完整度

可执行指标字典：`cloudfunctions/dataCenter/shared/statistics.mjs` 的 METRICS。当前版本 `football-metrics/1`。

球员行按球员、当时球队、赛事、组别形成；`metrics` 是可确认值，`observed` 是已有记录中的数值，`coverage` 描述每项指标是否完整。覆盖不足时 metrics 为 null，页面显示“—”，不能把 observed 当完整累计。
完整度按指标分别判断：缺失换人身份影响出场和时间，不把已确认的进球、红黄牌一起清空。

- 首发：在正式首发阵容中的不同比赛 ID。
- 球员卡积分：统一按 [球员卡积分与等级规则 v1](PLAYER_CARD_POINTS.md) 使用完整职业生涯的出场、首发、出场分钟和有效进球；积分与等级是派生结果，不能由客户端或人工档案字段直接写成统计真值。当前统计模块尚未提供 `starts`，因此新积分不能冒充已上线指标。
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
