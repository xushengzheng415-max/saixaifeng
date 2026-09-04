# 赛小蜂足球长线程交接（2026-08-29）

## 1. 新任务首要目标

继续解决 PC 后台 U10 联赛抽签结果页问题：

1. “洛杉矶湖人”“安阳飞机场”等自建球队的上传队徽在联赛结果页仍显示文字占位。
2. 联赛排序结果须保持 1—8 从上到下单列，队徽、序号、球队名和卡片底图严格对齐。
3. 联赛排序海报也必须单列从上到下，真实队徽完整显示。
4. 验证“确认联赛排序”不再长时间转圈。

当前生产页面：

`https://www.sxffootball.cn/admin/#/tournaments/c1dc89f26a884b2a002042f7385deabe/draw?divisionId=c1dc89f26a89b68400403d6570144bd9&mode=quick&view=result&format=league`

## 2. 只读生产核查结果

为核查队徽字段，临时部署过只读函数 `inspectTeamLogos`；已从生产删除，本地临时文件也应删除。

按名称查询 `teams` 得到两条“安阳飞机场”：

- `_id=853d22036a896b0a002f74f23e0c15df`
  - `logo/logoUrl=https://636c-cloud1-7g8ckb3c7815a011-1419431905.tcb.qcloud.la/team-logos/1787390726495_tmvg7h.webp`
  - 创建时间 `2026-08-22T09:25:28.011Z`
- `_id=c1dc89f26a898b34003c5c960d773efe`
  - `logo=cloud://cloud1-7g8ckb3c7815a011.636c-cloud1-7g8ckb3c7815a011-1419431905/team-logos/original/1787401665139-cttwul.png`
  - 创建时间 `2026-08-22T11:42:44.136Z`

“洛杉矶湖人”未在 `teams.name/teamName` 精确查询中命中。下一步应读取当前 U10 的 `tournament_teams` 关系，确认每行 `teamId/teamName/prebuiltTeamProfile/logoUrl/teamLogo`，再按实际 `teamId` 读取长期球队，不能继续按名称猜测。

注意：同名长期球队不得自动合并。应只修复当前参赛关系所引用的队徽读取，不删除或合并数据。

## 3. 最新相关代码状态

### `web-admin-vue/src/views/tournament/QuickHybridConsole.vue`

- 联赛排序页面队徽固定为 28×28。
- 轮次预览显示真实队徽。
- `teamRow()` 优先选 `logoFileId/logoCloudFileId/cloud://`。
- `resolveTeamLogo()`：
  - `cloud://` 调 `getFileUrl()`。
  - `*.tcb.qcloud.la` URL 会反推云文件ID再调用 `getFileUrl()`。
  - 加载失败时 `clearTeamLogo()` 回退文字占位。
- “确认联赛排序”已改为只保存 `tournament_league_tables` 草稿，不再串行创建28条 `matches`。
- 旧 `quick-league-draft` 未发布比赛会并行删除；已发布、进行中、已完成比赛不动。
- 成功后进入结果页，赛程由后续赛程管理统一生成。

### `web-admin-vue/src/views/tournament/QuickDrawResult.vue`

- 小组赛结果：真实队徽、放大字体、三套海报。
- 淘汰赛结果：左右半区表格，签01—签16，左右半区海报。
- 联赛结果：当前已改为单列 `league-result-card`。
- 联赛海报：当前已改为单列 `poster-league-list`。
- `enrichTeamRecords()` 已加入与操作台类似的云文件ID/临时URL解析。
- 页面顶部和底部均可确认；确认写 `confirmedAt` 后返回抽签总览。
- 已确认页面不允许直接返回操作台；修改只能从总览发起并受赛程检查、组别名确认和修改原因保护。

### `web-admin-vue/src/views/tournament/TournamentDraw.vue`

- 抽签按 `divisionId` 锁定，流程中不切换竞赛组别。
- 总览读取实际 `tournament_groups/tournament_bracket/tournament_league_tables` 逐组识别状态。
- 已完成显示“抽签已完成”，提供查看结果/修改分组。
- 修改分组会先检查当前组别 `matches`；已有赛程则阻断。
- 赛制映射：
  - `formatType=tournament`（赛会制）→ 单淘汰签位内部流程 `format=cup`
  - `formatType=cup`（杯赛制）→ 小组阶段内部流程 `format=tournament`
  - `league` → 联赛排序
  - `hybrid` → 混合流程

### `web-admin-vue/src/views/tournament/TournamentTeams.vue`

- 报名管理容量统一优先读取 `expectedTeams/requiredTeams/teamRequirement/participantTeams`，最后才兼容 `maxTeams`。
- U10 定版8支后，PC显示和剩余容量按8支计算。
- 球队审核支持复选框、全选当前待审、批量通过已选。
- 虚拟球队人数按“人”显示，并可查看合成球员资料。

### `web-admin-vue/src/views/tournament/DivisionManagement.vue`

- 不再显示 `cup/tournament/league` 英文代码。
- 显示“杯赛制/赛会制/联赛制/混合制”。

## 4. 抽签与海报已完成的重要产品结论

- 每个竞赛组别独立抽签，流程中不得切换组别。
- 操作台完成抽签只生成待确认草稿。
- 结果页是唯一正式确认入口。
- 确认完成返回抽签总览，不自动进入赛程管理。
- 已确认分组不可随意修改；有赛程时禁止直接修改。
- 赛会制是集中赛期、单淘汰为主；杯赛制是小组赛＋淘汰赛；联赛制是循环赛。
- 单淘汰首次进入签位为空，只有手动/随机排位后入位；已保存草稿才恢复。
- 由于连线反复错位，单淘汰操作台已改为无连线的七列阶段表格：首轮签位、八强席位、四强席位、决赛、四强席位、八强席位、首轮签位。
- 分组/签位/联赛排序均支持海报；海报使用原创绿茵、深蓝、红金CSS主题，导出高清PNG。

## 5. 生产部署状态

- 正式仓库：`E:\Documents\sxf-football`
- CloudBase：`cloud1-7g8ckb3c7815a011`
- PC部署目标：`web-admin-vue/dist` → `/admin/`
- 最新一次PC部署成功：170个文件全部成功（CloudBase CLI 3.8.1）。
- 最新本地抽签主包（交接时）：`web-admin-vue/dist/assets/TournamentDraw-BON3_J8N.js`
- 未上传或发布小程序；本线程后半段只改PC。
- 一次性生产函数 `inspectTeamLogos` 已删除。

## 6. 验证与安全提醒

- 多次执行 `npm run build` 均通过。
- `node tools/validate-ui-delivery.js`：162/162 静态门禁通过。
- 每次PC部署均只上传 `/admin/` 静态包。
- 工作区很脏，包含用户和多个历史任务的未提交修改。严禁 reset/checkout/revert 非本任务内容。
- 早期一次交互式部署曾在本地终端回显足球 CloudBase API Key；不得在新任务打印或读取凭据，建议产品负责人后续轮换该Key。

## 7. 新任务建议执行顺序

1. 阅读 `AGENTS.md`、本交接文档、`docs/CURRENT_STATUS.md` 尾部。
2. 用临时只读函数或现有安全查询读取当前 U10 `tournament_teams` 的8条关系及实际 `teamId`。
3. 对“洛杉矶湖人”“安阳飞机场”引用的准确记录读取所有队徽字段。
4. 验证 `getFileUrl(cloud://...)` 的实际返回，不只验证函数成功标志；对返回URL做HTTP/图片类型回读。
5. 若长期球队只有失效URL但云路径仍可反推，生成有效临时URL；若文件确实不存在，页面明确提示“队徽源文件已失效，请重新上传”，不要伪造队徽。
6. 统一修复结果页和海报队徽。
7. 检查联赛单列卡片：序号列、队徽列、名称列固定网格，8行同高，背景边框对齐。
8. 构建、162门禁、只部署PC、回读线上bundle哈希与页面关键文案。

## 8. 当前工作区

`git status` 显示大量已修改与未跟踪文件，属于用户和连续任务共同工作成果。重点相关文件均为未提交状态：

- `web-admin-vue/src/views/tournament/QuickHybridConsole.vue`
- `web-admin-vue/src/views/tournament/QuickDrawResult.vue`
- `web-admin-vue/src/views/tournament/QuickTournamentConsole.vue`
- `web-admin-vue/src/views/tournament/TournamentDraw.vue`
- `web-admin-vue/src/views/tournament/TournamentTeams.vue`
- `web-admin-vue/src/views/tournament/DivisionManagement.vue`
- `docs/CURRENT_STATUS.md`

新任务必须直接使用当前正式仓库工作目录，不能新建干净worktree，否则会丢失这些未提交状态。
