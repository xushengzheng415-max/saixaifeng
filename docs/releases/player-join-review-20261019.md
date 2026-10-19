# 球员入队审核闭环发布（2026-10-19）

## 背景

服务号 H5 扫码登记 / 小程序邀请登记的新球员，此前提交即直接写入球队球员库，缺少球队审核环节。按用户已确认口径改为：

**新登记 → 只进入球队长期球员库「待球队确认」→ 球队负责人在小程序确认 → 才正式建立球队归属（写 `teamId` + 写 `player_team_history`）；驳回则记录原因、档案保留等待重新申请。**

代码与本地回归由上一手完成，见 `docs/PLAYER_JOIN_REVIEW_HANDOFF_2026-10-19.md`。本次只做部署、读回与验证。

## 发布方式

两次云函数发布均以**当时线上包为基线**、只叠加本任务文件，不使用本地目录整体上传。原因：本地 `cloudfunctions/getMiniWorkspace/node_modules` 缺 `pngjs` 与 `@resvg`（`package.json` 声明但未安装），整体上传会在运行时 443；且工作区有大量其他任务的未提交改动。

### 1. getMiniWorkspace

- 基线：线上包 5905 文件（下载于 11:27）。
- 叠加 3 个文件：`index.js`、`playerRegistration.cjs`、`playerJoinReview.cjs`（新增）。
- 差量核对：`index.js` 与线上仅 14 行差异（require、`pendingJoins`、`confirmTeamPlayerJoin`/`rejectTeamPlayerJoin` 分发）；`playerRegistration.cjs` 仅 47 行差异（`pendingJoin` 判定、号码/身份证占用、搜索排除、递卡守卫、登记写 `pendingJoin*` 而非 `teamId`、通知带 `pagePath`）。无其他任务内容混入。
- 配置：`runtime Nodejs18.15`、`handler index.main`、`timeout 150`、`memorySize 512`、`installDependency false`、`--deployMode cos --force`。
- 结果：Succeeded 1；回下载 5906 文件，三个文件与发布包、本地源码 **md5 逐字节一致**（`index.js c9495aad…`、`playerRegistration.cjs 9f5b56fa…`、`playerJoinReview.cjs 3e4eab92…`）。
- 运行配置回读：Runtime/Handler/Timeout/MemorySize 保持；两个环境变量 `SXF_FOOTBALL_SERVICE_BRIDGE_KEY`、`SXF_MATCH_PASS_SECRET` **值与长度均未变**。
- 探活：以未定义 action 调用，返回 `success:true` 完整工作空间数据，1303ms / 31.84MB（512MB 上限），证明模块加载正常、依赖完整。

### 2. tournamentRegistrationFlow

- 基线：线上包 6401 文件。
- 叠加 1 个文件：`index.js`，与线上仅 7 行差异（`requestedPage` 白名单校验 + `pendingTeamConfirm` 审计字段），即交接文档 §3.2 的 `pagePath` 支持。
- 配置：`timeout 60`、`memorySize 256`、`installDependency false`。
- 结果：Succeeded 1；回下载 6401 文件，`index.js` **md5 一致**（`0a86ea2a…`），`requestedPage` / `targetPage` / `pendingTeamConfirm` 均在线上代码中。
- 运行配置回读：Runtime/Handler/Timeout/MemorySize 保持；9 个环境变量值与数量**完全未变**。
- 探活：以错误桥密钥调用 `notifyTeamPlayerJoin`，返回 `BRIDGE_AUTH_FAILED`，623ms，无任何写入，证明加载正常且鉴权守卫生效。

### 3. service-account-h5

- 上传前核对：`me.html`、`service-private.js` 虽为 git `M`，但与线上 **0 行差异**，上传不会改变其生产内容。
- 上传：132 个文件（仅变更部分），`--concurrency 3 --retry-count 8 --retry-interval 3000`。
- 回读（`https://www.sxffootball.cn`，`Cache-Control: no-cache`）：
  - `join-player.html` → `service-entry.js?v=20261019-review1`
  - `claim-team.html` → `service-entry.js?v=20261019-review1`
  - `service-entry.js` 含 `pendingTeamConfirm`、「已提交球队确认」、「球队负责人确认后正式入队」
  - 线上 `service-entry.js` 与本地 **md5 完全一致**（`2591f7ba…`）

## 未发布

- **webLoginApi**：本轮不需要改动（H5 走通用 relay，`pendingTeamConfirm` 直接透传）。工作区存在其他任务的 `webLoginApi` 改动，未纳入本次发布；如需同步须先过 `check-referee-backend-package.cjs` 差量发布，禁止整包覆盖裁判表接口。
- **小程序**：`miniprogram/pages/team/player-library/` 的 js/wxml/wxss 改动已就绪并本地测试通过，需用户在微信开发者工具重新编译上传；**上传前先读回微信后台已有版本号再定新号**（交接时体验版为 1.1.40）。本次未改版本号。
- **Git**：所有改动仍未提交、未推送。
- **生产数据**：未写任何业务数据。

## 验证清单（待真机）

1. 服务号扫码 → 关注 → OAuth → 手机号验证 → 搜索/新建 → 上传形象照/制卡 → 提交，完成页显示「已提交球队确认」。
2. 数据：`players.teamId===''`、`pendingJoinStatus==='pending'`、`player_team_history` 无新增。
3. 球队负责人小程序球员库出现「待确认入队」卡片，可「确认入队 / 驳回」。
4. 确认后：`players.teamId` 写入、`currentHistoryId` 指向新日志（`joinSource='register'`）、`teams.playerRegistrationRevision` +1。
5. 驳回：仅 `pendingJoinStatus='rejected'`，不建归属、不写日志，球员可重新申请。
6. 防绕过：同身份证重复提交得 `PLAYER_IDCARD_PENDING`；递卡确认 pending 档案得 `PLAYER_JOIN_PENDING`。
7. 通知：服务号收到「入队审核通知」，`pagePath` 指向 `pages/team/player-library/player-library?teamId=…`，核对 `notification_outbox.targetPage`。

## 风险提示

1. `players.pendingJoinTeamId` 查询（`limit(200)`）建议加索引。
2. 小程序确认走 `getMiniWorkspace` 主入口，无 unified busy 重试；并发确认可能偶发 `TransactionBusy`，重试即可，无半截数据。
3. `pendingJoinTeamId` 确认后未清空，按 `pendingJoinStatus` 过滤，后续统计需带状态条件。
4. 待确认档案占用本队球衣号（刻意设计），长期不处理会阻塞该号码，需负责人驳回释放。

## 证据目录

`.codex-artifacts/player-join-review-release-20261019/`（online-baseline、functions、functions-trf、readback、trf-readback、fn-detail-raw/after、deploy 日志、probe 日志）。
