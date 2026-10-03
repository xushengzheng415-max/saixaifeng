# 数据板块 H5 规则

球员注册与赛事身份核验按 `docs/PLAYER_REGISTRATION_EVENT_IDENTITY_STANDARD.md` 实施。球队级邀请默认不显示证件步骤；仅带明确赛事/组别要求的链接才能开启证件、保险或身份核验流程。

读取仓库根目录下 `docs/data-center/README.md`、CONTRACT.md 与 INTEGRATION.md 后再修改统计。新竞技统计调用 publicDataCenter 公开接口；登录功能使用各自认证接口，不依赖前端传入机构信息授权。

公开页面仅显示已发布范围，不读取私密档案。正式结果、互动应援和暂定数据分开；禁止前端按名称合并球员或自行累计生涯。缺失显示“—”，导出与页面使用同一数据版本。旧快照仅作兼容，新入口须登记并通过数据中心检查。
