# 入队驳回通知落地页定位修复（gate 深链 + 驳回条目）

- 日期：2026-11-03。
- 状态：**已发布**。共享后端 `webLoginApi`、`tournamentRegistrationFlow` 差量发布并回读一致；H5 `registration-resume.html` / `registration-resume.js` 已同步发布正式 `/service-account-h5/` 与测试端 `/preview/service-account-h5/`，四个地址按字节回读一致。
- 分支：`codex/platform-ops`。

## 一、用户反馈

「这个驳回资料不对，但是点进去为什么是跳到我另外一个球队了？这个球队就是郑州郑漂足球俱乐部，是 17319716663 这个账号。但是我是用 15038292130 注册的球员。因为身份证号相同，所以才跳到我这个球员身上了？」

## 二、线上核验（只读）

| 对象 | 事实 |
|---|---|
| 被驳回球员 `players/pr_04540367ed884d6633de9a13a7af` | 郑旭升，`playerPhone`/`contactPhone` **15038292130**，`linkedUserId` `c1dc89f26a94dd0801308c543ccf7e6f`（15038292130 账号），`idCard 410204198607214013`，`playerInviteId 2f65da756ae9f477001d4922686e0724`，`pendingJoinTeamId d54fcd5d6ae80e3e0080522a1587bf29`（开德体育足球队），`pendingJoinStatus rejected`，`pendingJoinRejectReason 资料不对`，时间 2026-11-03 22:53:42 |
| 服务号送达 | 该账号绑定 `service_account_bindings/560e7cf5…`，`officialOpenId ogSm93Ob86ufvPE-TPcoZ6NuKFGM`、`subscribed` —— 人、队、账号都对 |
| 点开看到的条目 | `service_entry_sessions/26e7c5456ae359360043e3a5759ce1dd`，同一 15038292130 账号的另一条**未提交草稿**：郑余生，`idCard 410102199102050128`（与郑旭升**不同**），草稿更新时间 2026-11-03 22:54:39，gate `d54fcd5d6ae31e7b002d93a35dd1a593` → `teamId 26e7c5456ae31e25004201ff7f605f38`（郑州郑漂足球俱乐部） |
| 被驳回会话 `service_entry_sessions/2f65da756ae9f49d001d5bff178734c9` | 驳回后回执/草稿已清空，只剩 `lastRegistrationRejectAt/Reason/PlayerName/TeamId`（郑旭升 / 资料不对 / 开德体育足球队） |

结论：**不是身份证同号串号**（两条记录的身份证不同，另一账号里同身份证的旧草稿也没有被合并）。真实原因是落地页缺少“指向哪一条登记”的定位信息。

## 三、根因

1. 驳回通知链接是固定地址：`cloudfunctions/tournamentRegistrationFlow/index.js` 的 `notifyTeamPlayerJoinRejected` 里 `targetUrl = 'https://www.sxffootball.cn/service-account-h5/registration-resume.html'`，不带任何 `gate`/`playerId` 参数。
2. 落地页只按登录账号列出“可继续的登记”：`serviceRegistrationRecovery.cjs` 的 `list()` 只读 `playerRegistrationReceipt`（已完成）与 `playerRegistrationFormDraft`（进行中），**不读 `lastRegistrationReject*`**；而驳回时 `getMiniWorkspace/playerJoinReview.cjs` 的 `resetRegistrationAfterReject` 已清掉该会话的回执与草稿。
3. 结果：被驳回的那条从列表中消失，列表里剩下的唯一一条（按草稿更新时间）是郑余生 → 点“查看详情”必然落到郑州郑漂足球俱乐部。

## 四、改动

| 文件 | 改动 |
|---|---|
| `cloudfunctions/webLoginApi/serviceRegistrationRecovery.cjs` | `list(db,actor,{gateId})`：每条目带 `gateId`；新增“被驳回”条目（`status:'rejected'`、`rejectReason`、`rejectedAt`、按 `lastRegistrationRejectTeamId` 取球队名，缺失回落门控球队）；草稿条目同时带 `rejectReason`/`rejectedAt` 供页面提示“上次被驳回”；`gateId` 过滤时不回退到其他登记 |
| `cloudfunctions/webLoginApi/servicePrivate.cjs` | `servicePrivateRegistrationList` 透传 `event.gate`（仅接受 `/^[a-f0-9]{32}$/`，非法值退回整表列表） |
| `cloudfunctions/tournamentRegistrationFlow/index.js` | 新增 `playerInviteGateId(player)`：按 `player.playerInviteId` 在 `service_follow_gates` 找 `purpose player_invite_entry`、`status active`、未过期的门控，取最新一条；`notifyTeamPlayerJoinRejected` 的 `targetUrl` 追加 `?gate=<gateId>`（找不到门控或查询异常时保持原地址，不影响通知发出） |
| `service-account-h5/registration-resume.js` | 读取 `?gate=` 并存入 `sessionStorage`（微信授权回跳会丢掉 query，授权完成后再用）；列表请求带 `gate`；按 `registered / rejected / draft` 渲染卡片（驳回条目显示“资料被驳回 + 驳回原因”，按钮为“重新填写”）；有 gate 但无条目时提示“该登记已结束或不可继续，请重新扫码” |
| `service-account-h5/registration-resume.html` | 脚本令牌升 `?v=20261103-gate1`；新增 `.resume-entry.is-rejected` 与 `.resume-reject` 样式 |
| `tools/test-registration-recovery.cjs` | 新增用例：驳回后仅留印记的会话仍列成 `rejected` 条目、球队名取自 `lastRegistrationRejectTeamId`、`gateId` 过滤只回该门控且不回落其他登记、驳回会话可 `resume` |

不改权限、不改数据库、不改已发出的通知内容；驳回原因文案仍以服务端库为准。

## 五、验证

- `node --check`：`serviceRegistrationRecovery.cjs`、`servicePrivate.cjs`、`tournamentRegistrationFlow/index.js`、`registration-resume.js` 全部通过。
- `node tools/test-registration-recovery.cjs`：PASS（含上述新增断言）。
- `node tools/test-service-private.cjs`：PASS（含 `registration-resume.html` 授权回跳白名单锁定）。
- `node tools/test-player-join-review.cjs`：PASS。
- `node tools/check-referee-backend-package.cjs <拟发布 webLoginApi 包>`：PASS（含内置的报名上传权限检查）。

## 六、发布与读回

### 6.1 基线

`fn code download` 取两个函数的线上包。本地分支在 `servicePrivate.cjs`、`tournamentRegistrationFlow/index.js` 上**落后于线上**（线上含 `servicePrivateParticipation`/球员审核回跳白名单/`playerReviewIdentity`/`playerReviewNotification` 等已发布功能），因此不整文件覆盖，改为“线上包 + 仅本次补丁”：

- `serviceRegistrationRecovery.cjs`：线上与该版本差异经 `git diff` 核对确认**仅本次改动**，直接替换；
- `servicePrivate.cjs`：只替换 1 行为 3 行（`+3/−1`）；
- `tournamentRegistrationFlow/index.js`：插入门控反查函数 21 行 + 目标地址 1 行（`+21/−1`）。

### 6.2 发布

- `fn code update webLoginApi --dir …`、`fn code update tournamentRegistrationFlow --dir …` 均成功。
- 读回配置：`webLoginApi` `Nodejs18.15` / 512MB / 120s / `InstallDependency TRUE`；`tournamentRegistrationFlow` `Nodejs18.15` / 256MB / 60s / `InstallDependency TRUE`；两者 `Status Active`，环境变量键未增删（25 / 9 个）。
- 回下载逐文件 SHA-256 与拟发包一致（`servicePrivate.cjs`、`serviceRegistrationRecovery.cjs`、`index.js` 三处 `equal=True`）。
- 空载 `fn invoke` 两个函数均返回受控拒绝（模块加载与鉴权入口正常、未写库）。

### 6.3 H5（正式 + 测试端）

只上传本次两个文件，未整目录覆盖：

| 地址 | 字节 | SHA-256 |
|---|---|---|
| `/service-account-h5/registration-resume.html` | 854 | `90EC2D17CEF2CD782E88B80BD25832ECD341847D2CC55C0D00A74338958E79D9` |
| `/service-account-h5/registration-resume.js` | 5152 | `9E254341855518F889D0CA89AD23818D8F9738FA3B666E78EA0FC7C8E8D0BB32` |
| `/preview/service-account-h5/registration-resume.html` | 854 | 同上 |
| `/preview/service-account-h5/registration-resume.js` | 5152 | 同上 |

四个地址 `Cache-Control: no-cache` 回读逐字节与本地一致，HTML 含 `v=20261103-gate1`。

## 七、遗留

- 赛事级（`notifyPlayerReviewRejected` → `me.html`）驳回通知仍是固定地址，本次未纳入；如需要同样做深链需单独确认落点参数。
- 测试端 `/preview/service-account-h5/` 的微信授权回跳白名单仍只登记正式 `registration-resume.html`，测试端走授权会回落到 `me.html`；本次只保证文件内容与正式一致，未扩大白名单（属产品边界，需单独授权）。
- 已发出的历史驳回通知无法改写链接，用户重新收到新通知后才带 `gate`。
- 小程序无需重传：本次改动全部在服务号 H5 与共享后端。
