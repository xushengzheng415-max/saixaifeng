# 数据中心上线与验收

球员卡积分与来源过滤尚未完成正式站点和各端切换。2026-09-30 已独立部署新的 `dataCenter` 云函数及其空关系集合；现有 PC、H5、小程序和其他云函数仍须按依赖逐项验证，不能把基础函数部署称为全端上线。

球员卡积分 v1 的规则已登记于 [PLAYER_CARD_POINTS.md](PLAYER_CARD_POINTS.md)。截至 2026-09-30，正式环境及既有球员卡页面仍使用场次分级；完成服务端门禁、旧卡迁移和三端消费后，需单独完成预览与正式回读，不能把规则同步称作积分系统上线。

2026-09-30 第一阶段实施：隔离分支的统一数据中心提供 `football-metrics/4` 首发、真实／测试比赛及球员来源过滤与球员卡积分计算；仅平台所有者的完整正式生涯查询可获得可核定结果，范围受限或来源不明时不发放权益。PC、H5、小程序现有页面及正式云函数尚未切换。

2026-09-30 部署回读：新 `dataCenter` 为 Event 函数，`Nodejs18.15`、`index.main`、30 秒、512 MB；从隔离发布包部署，回下载 11 个文件 SHA-256 均一致，匿名查询返回 `AUTH_REQUIRED`。生产新建空的 `player_team_memberships`、`player_transfers` 集合，分别回读到 `playerId+_id`、`orgId+_id` 索引；未写球员、球队、比赛或积分记录。`webLoginApi` 更新过程中发生并发发布，线上回下载显示它的外置 `data-center/service.cjs`、`statistics.mjs` 仍为旧版；本轮不能认定过滤规则已进入该函数。线上完整授权查询、三个既有云函数及页面尚待分别验收与切换。

正式环境只读试算（未写球员、比赛或积分记录）：`players` 1080 条，其中 750 条有测试球员标记，30 条测试球员挂在非测试球队；比赛 163 场。**前次把 9 场“已完赛”全部当作真实比赛的结论已撤回。**用户确认其中开封立洋杯 8 场为真实比赛，濮阳龙翔杯 2026-08-31 濮东晨星队对澶水先锋队 1 场为测试赛；该场双方球队均有 `synthetic=true`，新来源过滤已排除。按 8 场真实比赛重算，关联到 201 个稳定且非测试的球员 ID；187 人四项指标完整且可试算，均为铜卡（最高 4 分），14 人仍有指标缺口。真实比赛没有缺阵容；3 条旧事件尚未可靠关联球员，只影响相关指标，不把其他球员全部锁定。此为当时的只读快照，不代表其余球员是零分，也不能直接改写生产卡级。生产 `players` 中未发现已保存的 `playerCardTier` 或成卡文件字段；既有页面仍可能动态显示旧场次卡级。正式授予仍须在部署后按相同规则回读并完成授权与数据版本校验。

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
