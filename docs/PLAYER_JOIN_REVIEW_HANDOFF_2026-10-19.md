# 球员入队审核闭环 · 交接文档（2026-10-19）

> 面向接手方（其他 AI 工具 / 下一位开发者）。本文件自包含，读完即可接手，无需对话历史。
> 作者声明：代码与本地回归已完成；**尚未部署云函数、未上传 H5、未上传小程序包、未写生产数据**。

> [!IMPORTANT]
> **2026-10-19 更新（接手方补记）：第五节部署已完成。**
> `getMiniWorkspace` 与 `tournamentRegistrationFlow` 已按线上包精确差量发布并通过回下载逐字节校验与探活；`service-account-h5` 已上传（`v=20261019-review1`）并回读确认。`webLoginApi` 未改。
> **仍待用户操作：小程序在微信开发者工具编译上传**（未改版本号）。未写生产数据、未提交 Git。
> 发布细节、读回证据与真机验收清单见 [`docs/releases/player-join-review-20261019.md`](releases/player-join-review-20261019.md)。以下第一至四节描述的是改动内容与本地验证，仍然有效。

---

## 一、问题与目标（一句话）

服务号 H5 扫码登记 / 小程序邀请登记的新球员，此前**提交即直接写入球队球员库**（无球队审核环节）。本次按用户已确认口径补齐闭环：

**新登记 → 只进入球队长期球员库「待球队确认」→ 球队负责人在小程序确认 → 才正式建立球队归属（写 `teamId` + 写 `player_team_history`）；驳回则记录原因、档案保留等待重新申请。**

验收标准：
1. H5 提交后完成页显示「已提交球队确认」，球员不进在队列表。
2. 球队负责人小程序球员库出现「待确认入队」分组，含该球员，可「确认入队 / 驳回」。
3. 确认后该球员出现在在队列表，`players.teamId` 写入，`player_team_history` 新增 1 条 `joinSource='register'`。
4. 待确认期间，该档案不进入本队查找 / 恢复候选，不能借「递卡确认」绕过审核，也不能重复登记（`PLAYER_IDCARD_PENDING`）。

---

## 二、接手前必读的硬约束（不可违反）

| 约束 | 说明 |
|---|---|
| 正式仓库 | `E:\Documents\sxf-football`（Gitee `saixiaofeng/football.git` 为权威源，GitHub 只读镜像禁止推送） |
| CloudBase 环境 | `cloud1-7g8ckb3c7815a011` / `ap-shanghai` |
| CloudBase CLI | 统一用 `E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football ...`；脚本已注入 `-e <env>`，**不要再传 `--env`** |
| 凭据 | API Key 在 `%LOCALAPPDATA%\SxfCloud\credentials\`（DPAPI 加密）；**不得读取、打印、复制、记录、提交** |
| 云函数发布 | 属于生产变更，需当前任务明确授权；发布后必须回读生产状态；不得依赖全局 `tcb login` 状态 |
| webLoginApi | 发布前**必须**运行 `node tools/check-referee-backend-package.cjs <实际拟上传包目录>`，防裁判表接口回退 |
| 网页端 | 禁止 `@cloudbase/js-sdk`；网页只走 `webLoginApi` relay |
| WXML | 只允许简单插值、简单取反、简单 `\|\|`；禁止比较、三元、方法调用、数组索引（本页改动已遵守） |
| 主目录 | 存在大量未提交与**未跟踪**文件（含本次新增文件）；**禁止** `git reset --hard` / `git clean` / 整分支覆盖 |
| 分支纪律 | 主办方主线 `main` / `preview`；平台后台长期分支 `codex/platform-ops`；禁止跨分支整体合并 |
| 小程序上传 | 上传前**先读回微信后台已有版本号**再定新号（历史教训：号大的是旧代码）。当前体验版 1.1.40 |

---

## 三、已完成改动（本次，全部通过本地校验）

### 3.1 后端（`cloudfunctions/getMiniWorkspace/`）

| 文件 | 改动 |
|---|---|
| `playerRegistration.cjs`（未跟踪新增） | H5 登记核心。新增模块级 `pendingJoin(p)` / `pendingJoinPlayers(db,teamId)`；`readPlayers` 与 `saveDraft` 的球员池并入本队「待确认」档案（让其占住身份证号与球衣号）；`conflicts()` 区分 `PLAYER_IDCARD_PENDING`（本人已在本队有一条待确认申请）与 `PLAYER_IDCARD_CONFLICT`；`search` 把待确认档案排除出候选，`restore` 候选与 `confirm_restore` 增加 `PLAYER_JOIN_PENDING` 守卫（防止用递卡确认绕过球队审核）。**核心写路径**：新登记分支不再写 `teamId`，改写 `teamId:''` / `teamCode:''` / `currentHistoryId:''` / `pendingJoinTeamId` / `pendingJoinStatus:'pending'` / `pendingJoinRequestId` / `joinRequestedAt`；回执新增 `pendingTeamConfirm:!target`；通知调用带 `pagePath`（新登记直达 `pages/team/player-library/player-library?teamId=...`）。 |
| `playerJoinReview.cjs`（未跟踪新增） | 工厂 `createPlayerJoinReview(deps)` 返回 `{pendingFor, review}`。`pendingFor(teamId)`：按 `pendingJoinTeamId` 查、仅保留 `pendingJoinStatus==='pending'`、按申请时间倒序、**不下发身份证号**。`review(event,identity)`：校验 `team.manage` → `teamId`/`playerId` 必填 → 球队归属；驳回走条件更新 `where({_id, pendingJoinTeamId, pendingJoinStatus:'pending'}).update(...)`，`stats.updated!==1` 抛 `PLAYER_JOIN_STATE_CHANGED`；确认走最多 3 次循环 + 事务内重读校验 + `teams.playerRegistrationRevision` 乐观并发（`PLAYER_POOL_CHANGED` 重试），号码冲突前置拦截，写 `player_team_history`（`id='ph_'+playerId+'_'+(pendingJoinRequestId||'approved')`，`joinSource:'register'`，`leftAt:null`）并更新 players / teams。 |
| `index.js`（已修改） | 第 15 行实例化 `playerJoinReview`；`loadTeamPlayersForWorkspace`（约 1398-1428 行）在具备 `team.manage` 时返回 `pendingJoins` / `pendingJoinCount` / `hasPendingJoin`；分发新增 `confirmTeamPlayerJoin` / `rejectTeamPlayerJoin`（约 3463 行）。 |

### 3.2 后端（`cloudfunctions/tournamentRegistrationFlow/index.js`，已修改）

`notifyTeamPlayerJoin`（约 1801-1807 行）：新增受限 `pagePath` 支持（正则白名单 `^pages/[A-Za-z0-9/_-]+(\?[A-Za-z0-9=&%_.-]*)?$`，最长 128 字符，非法则回落 `SXF_FOOTBALL_SERVICE_JOIN_PAGE` 或 `pages/teams/index`）；`notification_outbox` 记录新增 `targetPage` 与 `pendingTeamConfirm` 审计字段。**用于让「请审核」的服务号模板消息直达该球队的待确认页。**

### 3.3 服务号 H5（`service-account-h5/`）

| 文件 | 改动 |
|---|---|
| `service-entry.js`（已修改） | `showRegistrationCard(completed,receipt)` 签名变更；完成页按 `receipt.pendingTeamConfirm` 显示「已提交球队确认」并提示「球队负责人确认后正式入队」；提交回调改为 `.then(function(result){editor.dispose();showRegistrationCard(true,result)})`。 |
| `join-player.html` / `claim-team.html`（已修改） | `service-entry.js` 引用版本号由 `?v=20261018-restore2` 提升为 `?v=20261019-review1`（绕过微信 / CDN 缓存）。 |

### 3.4 小程序（`miniprogram/pages/team/player-library/`，已修改 js/wxml/wxss）

- data 新增 `pendingJoins/pendingJoinCount/hasPendingJoin/showPendingJoin/reviewingId`；`loadPlayers` 写入 `pendingJoins` 后调 `applyPendingJoins()`。
- 新增 `decoratePendingJoins`（预计算 `avatarText/showJersey/jerseyText/showPosition/confirmText/rejectText`）、`applyPendingJoins`、`confirmTeamPlayerJoin`、`rejectTeamPlayerJoin`、`submitJoinReview`（`this._reviewing` 防重复 + 「处理中…」按钮态）。
- wxml 新增「待确认入队」卡片（`wx:if="{{showPendingJoin}}"`，仅 `canManage` 时展示）；wxss 新增 `.player-join-*` 样式；`loadVisualFixture` 补 2 条演示数据。
- WXML 表达式全部为简单插值，符合 3.2 红线。

### 3.5 测试与文档

- `tools/test-player-registration.cjs`（已修改）：断言改为「待球队确认」新语义（回执 `pendingTeamConfirm===true`、`teamId===''`、`pendingJoinStatus==='pending'`、`player_team_history` 为 0 条、搜索不到、号码被占、重复提交 `PLAYER_IDCARD_PENDING`、认领在队档案仍即时生效）。
- `tools/test-player-join-review.cjs`（未跟踪新增）：待确认列表不含身份证号、号码冲突拦截、事务确认、重复处理 `PLAYER_JOIN_STATE_CHANGED`、驳回不建归属、跨队 `TEAM_SCOPE_DENIED`。
- `docs/ADR.md`（新增 2026-10-19 决策）、`docs/CURRENT_STATUS.md`（新增 2026-10-19 状态）。

### 3.6 已跑通的本地校验（接手方可直接复现）

```
node tools/test-player-registration.cjs      # PASS
node tools/test-player-join-review.cjs       # PASS
node tools/test-service-entry-registration.cjs  # PASS 20/20
node tools/test-mini-player-library.cjs      # PASS
node tools/test-mini-account-participation.cjs  # PASS
node tools/sync-data-center.mjs --check      # PASS 数据中心部署副本一致
node tools/test-data-center.mjs              # PASS
node tools/check-data-governance.mjs         # PASS
node --check cloudfunctions/getMiniWorkspace/index.js            # OK
node --check cloudfunctions/getMiniWorkspace/playerRegistration.cjs  # OK
node --check cloudfunctions/getMiniWorkspace/playerJoinReview.cjs    # OK
node --check cloudfunctions/tournamentRegistrationFlow/index.js  # OK
node --check service-account-h5/service-entry.js                 # OK
```

---

## 四、数据模型（本次新增字段）

作用在 `players` 集合：

| 字段 | 含义 |
|---|---|
| `pendingJoinTeamId` | 待确认申请的目标球队（**确认后仍保留**，由 `pendingJoinStatus` 区分状态） |
| `pendingJoinStatus` | `pending` / `approved` / `rejected` |
| `pendingJoinRequestId` | `'jr_'+digest([sid,choice.nonce]).slice(0,28)`，用于生成归属日志 id |
| `pendingJoinRequestedAt`(登记时写入 `joinRequestedAt`) | 申请时间 |
| `pendingJoinRejectedAt` / `pendingJoinRejectedBy` / `pendingJoinRejectReason` | 驳回审计 |
| `pendingJoinApprovedAt` / `pendingJoinApprovedBy` | 通过审计 |
| `currentHistoryId` | 通过后指向 `player_team_history` 记录 id |

`player_team_history`：确认入队时新增 1 条（`joinSource:'register'`）。**新登记阶段不写该集合。**

`teams.playerRegistrationRevision`：确认入队时 +1（乐观并发依据）。

---

## 五、待部署清单与命令（按顺序）

> ⚠️ 部署前先确认用户授权。以下为既有可靠形态，**实际 flag 以当时 CLI 为准**；参考 `docs/PLAYER_REGISTRATION_HANDOFF_2026-10-17.md` §七 与 `docs/CURRENT_STATUS.md` 2026-09-19 条的部署/读回记录。

### 步骤 1：部署 `getMiniWorkspace`（**必须**）

包含 `playerRegistration.cjs` / `playerJoinReview.cjs` / `index.js`。用完整依赖包、`installDependency=false`（防云端 npm 重装改变依赖）。

```powershell
# 只读确认当前线上状态（不要把 fn detail 的完整输出贴进日志：会明文带出环境变量）
E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football run fn list

# 部署（足球专用脚本已注入环境；独立最小配置只列目标函数，functionRoot 用仓库内相对路径）
E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football run fn deploy --config-file <仓库外最小配置.json>
```

- 本机 CLI 3.8.2 下 `tcb fn code update <name> --dir <dir> --deployMode cos` 为交互式；非交互替代为 `fn deploy --deployMode cos -y --force`。历史教训：`fn deploy --dir` 曾只更新 `ModTime` 未真正替换代码，务必**读回**确认。
- 读回判据：下载线上包，`cloudfunctions/getMiniWorkspace/playerJoinReview.cjs` 存在且 `index.js` 含 `playerJoinReview.review`；运行时保持 `Nodejs18.15` / `handler index.main` / 既有环境变量与超时内存不变。

### 步骤 2：部署 `tournamentRegistrationFlow`（**必须**）

含入队通知的 `pagePath` 支持。

```powershell
E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football run fn deploy --config-file <同一最小配置，追加该函数>
```

读回判据：线上 `index.js` 含 `requestedPage` / `targetPage` 片段，环境变量数量不变。

### 步骤 3（条件性）：部署 `webLoginApi`

**本轮审核闭环不需要改 webLoginApi**（H5 的 `serviceEntrySelectPlayer` / `serviceEntryJoinPlayer` 走通用 relay，`pendingTeamConfirm` 直接透传）。

仅当决定同步 `webLoginApi` 其他未提交改动（本次工作区确有大量其他任务改动）时才发布，且：

```powershell
node tools/check-referee-backend-package.cjs <实际拟上传包目录>   # 必须先通过
```

不得用旧包或未拉取源码覆盖裁判表接口（`recognizeRefereeReport` / `confirmRefereeReport` / `updateMatch.importPaperReport`）。

### 步骤 4：上传 H5 静态页

```powershell
E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football run hosting deploy service-account-h5 service-account-h5 --concurrency 3 --retry-count 8 --retry-interval 3000
```

- 先 `hosting list` 只读确认目录名；上传后回读 `https://www.sxffootball.cn/service-account-h5/join-player.html`，确认引用 `service-entry.js?v=20261019-review1`，且 `service-entry.js` 含 `pendingTeamConfirm` 文案。

### 步骤 5：小程序重新编译 / 上传

- 先读回微信后台已有版本号再定新号（当前体验版 1.1.40）。
- 需用户在其微信开发者工具完成（本机 CLI 依赖工具安装路径与代理环境变量；历史坑见 `docs/CURRENT_STATUS.md` 2026-09-18 条）。

---

## 六、部署后验证步骤（真机）

1. **提交端**：用真实账号走服务号扫码 → 关注 → OAuth → 手机号验证 → 搜索/新建 → 上传形象照/制卡 → 提交。完成页应为「已提交球队确认」。
2. **数据核对**：该 `players` 档案应 `teamId===''`、`pendingJoinStatus==='pending'`、`player_team_history` 无新增。
3. **球队侧**：负责人小程序 → 球队球员库 → 出现「待确认入队」卡片；点「确认入队」→ 提示「已确认入队」→ 该球员进入在队列表。
4. **数据核对**：`players.teamId` 已写、`currentHistoryId` 指向新 `player_team_history` 记录（`joinSource='register'`）、`teams.playerRegistrationRevision` +1。
5. **驳回路径**：另一条待确认申请点「驳回」→ 只改 `pendingJoinStatus='rejected'`，不建归属、不写日志；球员可重新申请。
6. **防绕过**：对同一身份证重复提交应得 `PLAYER_IDCARD_PENDING`；用「递卡确认」对 pending 档案应得 `PLAYER_JOIN_PENDING`。
7. **通知**：服务号应收到「入队审核通知」模板消息，且跳转 pagePath 指向该球队球员库待确认页（需核对 `notification_outbox.targetPage`）。

---

## 七、已知风险与注意事项

1. **查询性能**：`pendingJoinPlayers` 使用 `players.where({pendingJoinTeamId}).limit(200).get()`。建议为 `players.pendingJoinTeamId` 增加索引；本队待确认数远低于 200，但需确认线上集合索引情况。
2. **事务行锁**：`playerJoinReview.review` 只在 `PLAYER_POOL_CHANGED` 时重试 3 次；CloudBase `-501001 TransactionBusy` 未单独退避重试。H5 侧（`webLoginApi/service-entry.js`）已有 `retryBusy`，但小程序确认走 `getMiniWorkspace` 主入口**没有** unified busy 重试 → 并发确认可能偶发报错，用户重试即可（无半截数据）。
3. **`pendingJoinTeamId` 确认后未清空**：`pendingFor` 按状态过滤，不影响正确性；若后续按该字段统计需注意加状态条件。
4. **不写 `player_team_history` 的影响**：待确认期间该球员不在任何球队归属日志中，与「球员归属球员本人、球队只维护关系」的口径一致，但任何按历史日志统计的页面在此期间不会计入。
5. **编号占用**：待确认档案占住本队球衣号，若球员迟迟不处理会阻塞该号码被他人使用；这是刻意的（防两人同时占号），必要时由负责人在小程序驳回后释放。
6. **演示模式（visualQa）**：`loadVisualFixture` 已补 2 条假待确认数据，仅用于视觉验收，不写库。

---

## 八、未完成 / 待用户授权（不在本次代码范围内）

- **郑旭升档案恢复**：`players` 中 `pr_b172c8846ea1c9ff07f9c111705c` 当前 `status:'archived'`。若需其重新在队，需确认是否恢复为 active 并补写 `player_team_history`（属生产数据写入，须单独授权）。
- **历史空会话清理**：`service_entry_sessions` 中「仅上传照片 / 仅选择模式、未提交回执」的空会话（做过一次清理，仍有残留），删除属生产写操作，须单独授权。
- **未提交 / 未推送 Git**：本次所有改动均未提交。

---

## 九、本次相关未提交 / 未跟踪文件清单（`git status --short` 摘录）

新增（未跟踪）：

```
cloudfunctions/getMiniWorkspace/playerRegistration.cjs
cloudfunctions/getMiniWorkspace/playerJoinReview.cjs
tools/test-player-join-review.cjs
docs/PLAYER_JOIN_REVIEW_HANDOFF_2026-10-19.md   (本文件)
```

修改：

```
cloudfunctions/getMiniWorkspace/index.js
cloudfunctions/tournamentRegistrationFlow/index.js
service-account-h5/service-entry.js
service-account-h5/join-player.html
service-account-h5/claim-team.html
miniprogram/pages/team/player-library/player-library.js
miniprogram/pages/team/player-library/player-library.wxml
miniprogram/pages/team/player-library/player-library.wxss
tools/test-player-registration.cjs
docs/ADR.md
docs/CURRENT_STATUS.md
```

> 注意：`cloudfunctions/webLoginApi/*`、`cloudfunctions/getMiniWorkspace/data-center/*`、`docs/PRODUCT_RULES.md`、`tools/test-data-center.mjs` 等也处于已修改状态，但**属其他任务/会话的改动**，本次未改动其内容；接手时按明确文件与提交核对引入，不要整包覆盖。

---

## 十、可直接转交给下一位的任务说明

> 目标：把已完成的「新登记 → 待球队确认 → 球队负责人确认/驳回」闭环部署上线并完成真机验收。
> 先读本文件与 `AGENTS.md` 第三、四、五章，再按第五节顺序部署 `getMiniWorkspace`、`tournamentRegistrationFlow`，上传 `service-account-h5/`（版本号已提升至 `20261019-review1`），最后由用户重新编译上传小程序。
> `webLoginApi` 本轮不需要为审核闭环改动；若要同步其他任务的未提交改动，**必须先过 `check-referee-backend-package.cjs` 差量发布，禁止整包覆盖裁判表接口**。
> 保留主目录所有未提交与未跟踪改动；不提交 Git、不写生产数据、不改版本号，除非用户明确授权。
> 部署后按第六节真机验证，并如实记录「已部署 / 未部署 / 待授权」三类状态，不把本地 PASS 当作线上完成。
