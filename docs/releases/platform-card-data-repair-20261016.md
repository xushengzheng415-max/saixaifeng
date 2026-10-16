# 数据中心异常处理与发卡前检查（2026-10-16）

## 已确认流程

异常资料在「数据中心 → 异常处理」统一处理。发卡先检查，再选择可发卡球员、预览及确认；发卡窗口打开同一处理组件，保留已选名单。数据库由受权接口写回，用户无需直接查字段改库。

## 实现

- PlayerCardIssueRepair、PlayerCardMatchRepair位于平台data目录，数据中心与制卡页面复用；以球员、球队、比赛双方、具体问题代替主界面的内部编号表。
- auditPlayer/auditQueue和发卡资格继续读取同一个data-center/service；新增findings仅组织显示，不另算统计。
- savePlayerCardTemplate workflowAction:auditRepairInspect/auditRepairSave仅平台负责人可用。阵容只补缺失记录，从本场已审核名单按稳定ID选择首发、替补；保留既有阵容更正所需的原赛果复核边界。
- 事件按实际报告填写球员、球队、分钟和换上/换下。完整标记须核对已保存比分；统一模块验证换人顺序。兼容matchId/match_id外部事件，删除保留高修订墓碑。
- 服务端再次校验版本、正式名单、比赛锁与来源；事务写比赛原始事实和platform_settings的match_fact_repair_audit，不直接写积分/卡级。测试来源、未知资料、跨队球员、过期提交和已锁定裁判记录不得借此绕过。
- 已通过球员可先发卡；未通过者不出现在可勾选名单。保存后重查，父页面刷新候选并保留仍有效的选择；缺档案关联/照片等未自动编造。

## 真实资料修复

仅对立洋杯11场缺失时长依据的历史比赛补durationVerification；37场回读全部60分钟。详见[操作记录](../data-center/operations/2026-10-16-liyang-duration-evidence.md)。没有补造真实阵容或事件，没有替用户发卡。

## 验证与正式发布

- 实际认证分派器及canonical审计/发卡同源测试通过；补原始首发与30分钟换人后，隔离球员由待核定变ready，出场30分钟。鉴权、跨队ID、测试排除、来源确认、并发冲突、裁判锁、比分/换人校验、外部事件墓碑和审计日志通过。
- 浏览器隔离样本验证异常处理、直接补阵容、重新检查、树选择去重、保留名单、预览发放及390px适配；不写生产赛事/球员/发卡数据。
- finish-data-change的共享副本、数据中心、12组球员卡回归和治理检查通过；平台生产构建与独立边界检查通过。
- webLoginApi以本次下载的在线包为基础，仅差量更新playerCardAudit.cjs、playerCardWorkflows.cjs、新增playerCardMatchRepair.cjs。实际包裁判表检查、语法与相对依赖检查通过；其余运行文件回读不变，npm生成锁元数据除外。未修改云端配置。
- webLoginApi Active/Available，CodeSha256 `87ffcdacbbdb030b70c19613883b8c1e30b34f0b5b871f3786191011afe43af3`。线上未登录探针返回AUTH_REQUIRED。
- 独立平台正式版本 `20261016074758-b5a74e47`，27个文件HTTP成功并SHA-256一致。没有发布主办方PC/H5静态文件或小程序包。

代码提交：8885ee2、e5e6eca、b5a74e4（修复异常列表点选时被监听器清空的竞态，浏览器扫描→明细链路通过）。证据目录：work/player-card-preflight-release-20261016/、work/player-card-preflight-20261016/。
