# 0:0 比赛资料补录保存修复

日期：2026-10-28。端口：平台运营后台 `pingtai.sxffootball.cn`。

截图中的保存按钮由前端条件 `reason.trim().length < 4` 禁用：虽然两个确认框已勾选，原始资料来源为空，页面没有显示缺失原因。数据质量的 `EVENT_COVERAGE_PARTIAL` 表示尚无事件完整性依据，不能仅凭 0:0 推断没有换人或牌罚。

修改 `platform-admin-vue/src/views/data/PlayerCardMatchRepair.vue`：资料来源显示必填及至少4字要求；保存时就地显示资料来源错误，未确认来源时显示明确错误。0:0且当前事件列表为空时显示无事件说明及专用确认文案。仍由操作人核对原报告，不自动确认，不生成虚假事件，保存鉴权、比分匹配、阵容、版本、锁定和来源审计沿用原后端。

隔离验证：`node tools/test-platform-match-repair-ui.cjs` 覆盖勾选后空来源提示、阻止无效请求、填写后以空事件列表和完整性确认保存；`node tools/test-player-card-match-repair.cjs` 新增真实处理器0:0空事件保存、完整性回读及首发60分钟回归。没有修改真实比赛数据。

构建 `npm run build` 通过，平台工程边界通过。`test-data-center`、`check-data-governance` 通过；`sync-data-center --check` 报已有12项部署副本不同步，本轮未修改共享模块或同步这些同期改动，不能报告全量同步检查通过。

发布状态：待正式发布与资源摘要回读。平台现有发布规范仅登记正式平台域名，没有登记独立平台测试入口；本次不修改主办方PC、H5、小程序或共享后端，不将主办方 `/preview/admin/` 当作平台测试版。
