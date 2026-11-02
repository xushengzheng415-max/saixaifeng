# 入队申请驳回后无法重新登记：根因修复与放行（20261030）

## 一、问题与根因

用户反馈：「10-29 19:11 郑漂No.1 被驳回（用真名，你这是啥），驳回后又提交了，但是我收不到她的信息」「这个页面没改过来么？」

只读取证结论（`output/diag-20261030/`，未提交，不含个人信息以外的导出）：

| 证据 | 结果 |
|---|---|
| `players` 档案 `pr_6bdb16986634c8f56521a860ee5e` | `pendingJoinStatus=rejected`、`pendingJoinRejectReason=用真名，你这是啥`、`pendingJoinRejectedAt=2026-10-29 19:12`；全库按身份证/手机号仅此 1 条，**没有任何新档案** |
| `service_entry_sessions` `0e570c4b6ae321e900580d4b64b1eba9` | create `10-29 18:37:29`，最后一次 update `10-30 19:04:28`（令牌轮换），`receipt.choiceToken == choice.nonce == draft.choiceToken`，`portraits=4`，草稿停留在 `10-29 19:11:47` |
| `notification_outbox`（郑漂俱乐部） | 该队 9 条入队通知全部 `delivered`，**没有第 10 条** |

即：10-30 19:04 她「又提交了」实际是**重开旧链接看到上次的完成页**，没有产生任何新写入，也没有新通知。

根因链（四处叠加，导致驳回后永远回到旧结果页）：

1. 球队驳回只改 `players.pendingJoinStatus`，**不清该球员会话里的 `playerRegistrationReceipt` / `playerRegistrationChoice`**。
2. `webLoginApi/serviceRegistrationResume.cjs` 的 `restore()` 在 `receipt.choiceToken === choice.nonce` 时直接 `return null`。
3. `webLoginApi/serviceRegistrationRecovery.cjs` 的 `afterOAuth()` 只在「有草稿且草稿 ≠ 回执」的会话里挑，否则退回 `rows[0]`——正好是回执会话，于是再次轮换令牌并回到完成页。
4. `scope()` / `afterOAuth()` 都不校验会话是否过期，页面因此**永不自愈**。

## 二、实现

### 2.1 `getMiniWorkspace/playerJoinReview.cjs`（驳回即放行）

- 新增 `resetRegistrationAfterReject(teamId, playerId, reason, operatorId)`：按 `registeredPlayerId` 找出该球员的会话，清空 `registeredPlayerId`、`$remove` `playerRegistrationReceipt` / `playerRegistrationChoice` / `playerRegistrationFormDraft` / `playerRegistrationCardDraft` / `playerRegistrationPortraits`，并写入 `lastRegistrationRejectAt|Reason|PlayerName|TeamId|By` 印记。
- 新增 `notifyPlayerJoinRejected(teamId, playerId)`：用 `SXF_FOOTBALL_SERVICE_BRIDGE_KEY` 调 `tournamentRegistrationFlow` 的 `notifyTeamPlayerJoinRejected`，整段 try/catch，失败只 `console.warn`。
- 驳回分支：改状态成功后先放行登记，再尽力通知，返回体追加 `reopenedSessions` 与 `notice`；两者都不影响驳回结果。
- 依赖注入新增 `cloud`（`getMiniWorkspace/index.js` 的 `playerJoinReview` 初始化行加 `cloud`）。

### 2.2 `tournamentRegistrationFlow`（服务号驳回通知）

- 新增 `notifyTeamPlayerJoinRejected(event)`：校验 bridge key → 以库为准校验 `players.pendingJoinTeamId===teamId && pendingJoinStatus==='rejected'` → 幂等键 `team_player_join_rejected:{playerId}:{rejectedAt}` → `playerServiceBinding(player)` 找球员端服务号绑定 → 复用已审核通过的模板 `servicePlayerRejectTemplateId()`（`pwUTAI-c_v9sXfcVoLjjqwvCr5_0RixPYUQiT4BFi4k`：申请人 `thing2` / 申请时间 `time3` / 驳回原因 `thing6` / 注册项目 `thing9`）→ 经 `serviceBridgeJson('template/send')` 发送，落地页为 `https://www.sxffootball.cn/service-account-h5/registration-resume.html`，并如实写 `notification_outbox`（`delivered` / `failed` / `waiting_follow_bind` / `configuration_required`）。
- 路由新增 `notifyTeamPlayerJoinRejected`。

### 2.3 `webLoginApi/service-entry.js`（状态域）

- 新增 `registrationRejectNotice(session)`：读 `lastRegistrationRejectAt` 得到 `at` / `atText`（北京时间）、`reason`、`playerName`。
- `player_invite_entry` 的 `context()` 返回值追加 `registrationReject`。

### 2.4 `service-account-h5`（登记页区分「已驳回」）

- `service-entry.js` 的 `showPlayerSearch()`：仅当 `data.registrationReject && !data.registeredPlayerId` 时在登记页顶部渲染 `.reject-notice` 横幅（驳回时间、理由、提示「请核对姓名、身份证号等资料后重新填写并提交」）。已提交待确认（有回执）时不显示，避免误导。
- `service-entry.css`：新增 `.reject-notice` 样式。

## 三、验证

| 检查 | 结果 |
|---|---|
| `node --check` `getMiniWorkspace/index.js`、`playerJoinReview.cjs`、`tournamentRegistrationFlow/index.js`、`webLoginApi/service-entry.js` | 通过（本地与 staging 各一次） |
| `node tools/test-player-join-review.cjs` | PASS，新增断言：驳回后 `reopenedSessions===1`、回执/选择/草稿 `$remove`、驳回印记字段、通知调用参数与 `notice.status==='delivered'` |
| `node tools/test-service-entry-registration.cjs` | 22/22 通过 |
| `node tools/test-registration-onboarding-routing.js` | 5/5 通过 |
| `node tools/sync-data-center.mjs --check` / `test-data-center` / `check-data-governance` | 全部 PASS |
| `node tools/check-referee-backend-package.cjs <staging webLoginApi>` | PASS（含报名 Word 上传范围与裁判表完整性） |
| 线上探针 `fn invoke tournamentRegistrationFlow {"action":"notifyTeamPlayerJoinRejected"}` | `{"success":false,"code":"BRIDGE_AUTH_FAILED"}`——路由在线且桥钥校验生效 |
| 线上探针 `fn invoke getMiniWorkspace {"action":"__smoke"}` | `WORKSPACE_LOAD_FAILED/无法识别当前微信账号`——模块加载正常，无非预期异常 |

差量发布前重新下载线上包比对（重要）：`webLoginApi` 在 21:26 已被其他会话发布过（`serviceInsurancePolicy.cjs`、`serviceInsurancePolicyParse.cjs`、`servicePersonalData.cjs` 三个文件比旧基线新），因此改用**新下载的线上包**为基线，只替换 `service-entry.js`，未回退其他会话的改动。`tournamentRegistrationFlow` 的线上包比本地**缺少** passport/documentType 等未发布改动（25 增 / 11 删），发布时用脚本只把本轮 55 行插入线上基线，未把这些无关改动带上线。

## 四、发布（2026-10-30 21:48–21:52）

| 函数 | 发布方式 | 回下载比对 | `fn detail` 读回 |
|---|---|---|---|
| `tournamentRegistrationFlow` | `fn code update --dir <staging> --deployMode cos` | `index.js` 186,103 B / `6A90388A…011C5`，10 个文件与上传包逐字节一致 | `Active`/`Available`、Nodejs18.15、256 MB、60 s、`InstallDependency=TRUE`、`ModTime=2026-10-30 21:48:07` |
| `getMiniWorkspace` | 同上 | 76 个文件逐字节一致（`index.js` 259,089 B / `B1BB3E03…FF91`） | `Active`/`Available`、512 MB、150 s、`InstallDependency=TRUE`、`ModTime=21:48:26` |
| `webLoginApi` | 同上（CLI 从 `cloudbaserc` 读取配置） | 139 个文件逐字节一致（`service-entry.js` 25,028 B / `CF3A6338…AC66B`）；`node_modules` 6476 个文件仅 CloudBase 自身 `.package-lock.json` 差 245 B，业务依赖逐个同名同大小 | `Active`/`Available`、512 MB、120 s、`InstallDependency=TRUE`、`ModTime=21:50:02` |

H5 静态资源（只上传 2 个文件，未带目录内其他内容）：

- 暂存 `work/h5-publish-20261030-reject/`（`service-entry.js`、`service-entry.css`）。
- 正式 `service-account-h5`、测试 `preview/service-account-h5` 各 `hosting deploy` 2 个文件成功。
- HTTP 回读四处全部 200 且 SHA-256 与本地一致：`service-entry.js` `A05D8170…2F89`、`service-entry.css` `94EAC189…017D`。

测试端说明：`getMiniWorkspace` / `tournamentRegistrationFlow` / `webLoginApi` 均为**共享正式后端**，无独立测试副本；H5 已同步 `/preview/service-account-h5/`。本轮未改小程序，不重传开发包。

## 五、存量数据一次性修正

新代码只对「以后发生的驳回」生效。为让被卡住的这次立刻可重填，对会话 `0e570c4b6ae321e900580d4b64b1eba9` 手工执行了一次与 `resetRegistrationAfterReject` 同口径的更新（`db nosql execute` UPDATE）：

- 清空：`registeredPlayerId`、`playerRegistrationReceipt`、`playerRegistrationChoice`、`playerRegistrationFormDraft`、`playerRegistrationCardDraft`、`playerRegistrationPortraits`。
- 写入：`lastRegistrationRejectAt=2026-10-29 19:12`（取 `players.pendingJoinRejectedAt`）、`lastRegistrationRejectReason=用真名，你这是啥`、`lastRegistrationRejectPlayerName=郑漂No.1`、`lastRegistrationRejectTeamId=26e7c5456ae31e25004201ff7f605f38`、`lastRegistrationRejectBy=b9a701d46a884688005fc16b4218db2b`。
- 回读：上述字段与清空结果全部符合预期，`updateTime=2026-10-30 22:02:23`，会话 `expiresAt=2026-10-31 07:04:27` 未改动。

效果：她重开原链接进入**空白登记页 + 顶部驳回横幅**，这次必须填真实姓名；重新提交会生成新的 `players` 待确认档案并给球队负责人发入队通知。

## 六、遗留

1. `webLoginApi/serviceRegistrationResume.cjs` 的 `restore()` 与 `serviceRegistrationRecovery.cjs` 的 `afterOAuth()` 仍不校验会话是否过期，也仍会在「有回执」时短路。本轮只在驳回分支清理回执，未改动这两处公共判定；如需让过期/异常会话自动自愈，须另立口径并单独授权（会影响所有登记入口）。
2. PC 后台暂无「待核准入队」入口，球队负责人仍需在小程序球队工作空间确认。
3. `notification_outbox` 中 `queued`/`waiting_follow_bind` 仍无消费者：未关注服务号的负责人在绑定后不会自动补发历史通知。
4. `tools/test-service-registration-media.cjs` 第 27 行的 `baidu=0!==1` 断言仍失败（既有问题，与本轮无关）。
5. Git：本轮改动文件为 `cloudfunctions/getMiniWorkspace/playerJoinReview.cjs`、`cloudfunctions/getMiniWorkspace/index.js`、`cloudfunctions/tournamentRegistrationFlow/index.js`、`cloudfunctions/webLoginApi/service-entry.js`、`service-account-h5/service-entry.js`、`service-account-h5/service-entry.css`；工作区当前在 `codex/platform-ops` 分支且含大量其他会话未提交改动，`index.js` / `tournamentRegistrationFlow` 两个文件里也混有其他会话未发布内容，**未做整包提交**，云端已按差量发布上线。需要提交时请按文件单独核验归属分支（共享后端应进入 `main`）。
