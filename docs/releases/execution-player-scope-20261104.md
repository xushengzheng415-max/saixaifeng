# 比赛规则：只设替补球员人数与共享账号保存修复

- 日期：2026-11-04。
- 用户确认：当前操作账号为共享账号；调整入口“不用写官员，只写球员”，球员人数应直接对应阵容替补槽位。
- 状态：在已有测试发布授权内完成修复并更新 /preview/admin/ 及共用保存接口；未覆盖正式PC静态页面，未替用户写入真实人数。

## 问题与修复

此前保存接口调用buildOrganizerScope，可能重新选择自然人默认机构；页面读取对共享账号使用buildStaffEventScope。默认机构与当前共享赛事不同时，导致页面能读但保存被organizerRecordAllowed拒绝。本轮共享账号保存按目标组别真实tournamentId及会话机构校验event.competition授权，沿用生产buildStaffEventScope与recordBelongsToStaffEvent。不会切回默认机构；旧客户端没有附带staffTournamentId时仍按资源的真实赛事校验，附带错误赛事、跨机构、撤权、协助模式或版本过期均拒绝。没有删除权限检查或授予额外赛事权限。

弹窗只保留benchPlayerLimit，不再展示或允许修改benchTotalLimit、benchOfficialLimit；旧资料和历史快照保留。阵容人数解析只使用替补球员人数，例如总人数15、官员5、球员10时显示10个替补位，不再把15当作球员名额。球员人数明确0仍有效，未设置使用既有默认/继承规则；已开始/完赛场次不套用后改规则。

## 验证

- test-division-execution-player-scope.cjs使用生产赛事范围构建器，复现本人默认机构与共享赛事机构不同的情形，验证保存成功且不调用默认机构构建器；同时覆盖缺失旧客户端标记、跨赛事/机构、撤权、版本并发、历史、兼容旧换人接口与幂等。
- test-division-execution-rules.cjs作为兼容测试入口；实际拟上传包和回下载包均执行通过。
- test-bench-limit-resolution.mjs验证只按球员计数、null/0与历史取值。
- test-division-execution-browser.cjs：真实规则页共享会话→真实赛事范围模块→隔离事务保存10名球员→回显10通过；两个旧人数项不展示，旧官员与总人数未被改写；桌面/390px检查通过。无真实云端写入。

## 发布与证据

- 功能提交68fca3fd，preview集成提交3edc89f9ff3c73bfcdfa781d39b51465ca218585已推GitHub；未推main，保留其他任务同期改动。
- 最终测试构建2978模块、34.13秒，409文件发布到preview/admin。
- 线上10项入口/规则页/比赛详情/人数模块资源均HTTP200且SHA-256与本地一致。入口c38d1f5a25db3aa005a4a514c0dc3f9680cdffdbaa807fb780f08156d189be62，DivisionRulesWizard-BrL2IRuz.js为5b4a9703ef9ee693d4174265925e40a99bb7eac45539fd26ccbe97e11051aeb2。
- 最新线上包差量只修改index.js及divisionExecutionRules.cjs，6713文件回下载全量摘要与拟上传一致，包括依赖。裁判表与报名上传防回退检查前后均通过。
- webLoginApi于2026-11-04 19:08:47更新，Active/Available；InstallDependency=FALSE、Nodejs18.15、512MB、120秒、处理器、环境变量、角色、网络与层对比保持。
- index.js摘要44baa13fd9ac7e979429e94636022606c6875c0d1d00a24396fe82cc26c5d606，模块摘要2dfbc812b10007609ee2487be990745be1bc4d48892db504bb6a91c8b8e0d3a2。
- 两个执行规则/旧换人入口未登录探针均AUTH_REQUIRED。没有使用真实账号令牌或伪造真实用户操作。
- 正式入口前后均31f17f9708a0d2463cea20bb9ace8abd7ecefb386820fd76abf2168714b3ccfc，未被测试构建覆盖。Windows独立会话发布前后正式/测试通道均8/8，记录位于output/execution-player-scope-20261104/desktop-{before,after}/。
- 证据work/execution-player-scope-20261104/{manifest,backend-readback,http-readback,auth-probe}.json；隔离UI截图output/division-execution-20261104/dialog-{desktop,mobile}.png。

## 使用边界

当前只发布测试PC界面，保存接口与正式共用。刷新测试页后重新打开调整弹窗，只填写替补球员人数；保存会更新真实组别的未来规则，已开赛/完赛规则和人员资料保持。本任务未替真实组别保存人数；真人共享账号重试结果待用户验证。
