# 数据中心上线与验收

当前仅本地实现与测试；未进行生产迁移、云函数发布或正式站点切换。规范与实现可先推仓库，部署依赖必须一并处理，避免页面先引用尚未上线的新接口。

球员卡积分 v1 的规则已登记于 [PLAYER_CARD_POINTS.md](PLAYER_CARD_POINTS.md)。截至 2026-09-30，代码仍使用场次分级；补齐首发指标、共享积分服务、旧卡迁移和三端消费后，需单独完成预览与正式回读，不能把规则同步称作积分系统上线。

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
