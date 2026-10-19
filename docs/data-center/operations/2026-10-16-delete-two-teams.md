# 2026-10-16 指定球队与虚拟球员清理

环境：cloud1-7g8ckb3c7815a011。当前用户通过首页截图明确要求批量删除安阳飞机场、开封球友及里面的虚拟球员；预检发现一条已审核怀川杯报名，用户进一步明确选择撤销这条报名并删除球队。本操作不把一般球队、真实球员或任何比赛历史加入清理范围，也不修改小程序仅主账号可删空球队的通用规则。

| 球队 | 稳定球队ID | 删除虚拟球员 |
| --- | --- | --- |
| 安阳飞机场 | 853d22036a896b0a002f74f23e0c15df | 15 |
| 开封球友 | 853d22036a896b75002f89f42367b0fb | 15 |

两队同属b9a701d46a8849730060b4d94eff1333机构；30份目标球员全部synthetic=true，按稳定球员ID、teamId和来源标记联合条件删除。没有按名称批删数据库，没有删除users或云文件。

预检和删除前重查：matches、match_events、roster_snapshots、match_lineup_snapshots、player_team_memberships、player_transfers、registration_player_drafts均无关联；球员卡/卡库/渲染记录无目标数据。报名935443556a9bd524066e7f3117f9d9ca属于2026年“怀川”杯全国青少年足球邀请赛（935443556a962e9a04b0bdf4322f9e84），经用户追加确认从approved变为withdrawn，保留审核与撤销记录，不删除赛事。两条pending球队邀请和两条pending报名草稿待办置cancelled；五条completed待办保持。未改已存在赛事的其他球队或计数缓存。

先生成完整本地备份及精确操作计划，文件位于.codex-artifacts/bulk-delete-two-teams-20261016，包含backup.json、backup-manifest.json、plan.json及result.json。备份SHA-256为9ea7f08538eb9044d02cbd1e80a43fc3fc8f57e4305c627816bf4332dcbeaf20，不提交含原始业务资料的备份。创建team_deletion_audits，写两条当前聊天授权的清理审计，最终均completed且readbackVerified=true。

结果回读：目标球队0份、目标球员及两队剩余球员0份；报名withdrawn 1条、邀请cancelled 2条、待办cancelled 2条/completed 5条。陆零後、开封立洋两支对照球队仍在，34个此前对照球员文档ID全部仍在。没有比赛、名单、球员转会或竞技统计写入，没有代码部署/小程序版本变更，没有Git提交/推送。首页下拉刷新后按现有授权重新读取，不再返回被删球队。
