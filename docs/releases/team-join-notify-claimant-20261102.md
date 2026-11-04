# 入队申请服务号通知只发认领人（2026-11-02）

状态：`tournamentRegistrationFlow` 已差量发布（共享正式后端，正式与测试共用同一函数）。PC、小程序本轮无代码改动，未重传小程序包。

## 一、问题

用户现场反馈：自己从未去认领某支球队，却收到该队的服务号通知。用户确认口径：「谁来认领球队接收服务号通知就行了」。

## 二、根因

`cloudfunctions/tournamentRegistrationFlow/index.js` 的 `notifyTeamPlayerJoin`（球员经服务号 H5 提交入队申请后，通知球队负责人）原来把候选接收人写成：

```js
[invite.inviterUserId, team.ownerId, team.ownerUserId, team.claimedByUserId, team.creatorId]
```

`team.creatorId` 只表示创建人。主办方用报名表导入预建球队时，`teams` 记录写入 `creatorId = 主办方账号`、`claimStatus = 'unclaimed'`，于是从未认领该队的主办方被当成负责人，收到「入队申请待审核」通知。

小程序侧 `getMiniWorkspace` 的 `loadAccountOwnedOrManagedTeams` 早已明确「刻意不采纳 creatorId」，通知侧没有同步这条边界。

## 三、改动

`cloudfunctions/tournamentRegistrationFlow/index.js` → `notifyTeamPlayerJoin`

- 认领关系只取 `teams.ownerId` / `ownerUserId` / `claimedByUserId`，删除 `team.creatorId`。
- 仅当球队确有认领人时，才把本次球员邀请的 `inviterUserId` 列为候选（并要求 `invite.teamId` 与本次 `teamId` 一致），顺序为发起邀请的负责人优先、其次认领账号。
- 球队未认领时一律不发送，`notification_outbox` 记 `waiting_team_claim` / `TEAM_CLAIM_REQUIRED`；认领人未完成服务号关注绑定时仍记 `waiting_follow_bind` / `SERVICE_BINDING_REQUIRED`，两种情况都不回落到创建人。

产品规则同步写入 `docs/PRODUCT_RULES.md`「球队类服务号通知接收人」。

## 四、发布方式与读回

线上包比本地该分支的 `index.js` 新（包内另有 `playerReviewIdentity.cjs`、`playerReviewNotification.cjs`、`data-center/*` 等），为避免用旧包覆盖他人成果，未整包上传本地源码：

1. `fn code download tournamentRegistrationFlow` 取最新线上包（`index.js` 190,874 B）；
2. 仅在线上包内替换 `notifyTeamPlayerJoin` 的接收人块，与线上基线 `git diff` 为 `+13 / −3` 两处；
3. `node --check` 通过；
4. `fn code update tournamentRegistrationFlow --dir <线上包>` → `函数代码更新成功`。

读回与配置：

- 状态 `部署完成`、修改时间 `2026-11-02 19:55:16`、代码大小 11,214,408 B；
- CLI 日志出现「未找到函数配置，使用默认配置」，但读回配置与部署前一致：`Nodejs18.15`、内存 256MB、超时 60s、自动安装依赖 TRUE，9 个环境变量键集合未变（不记录、不读取其值）；
- 回下载比对了 12 个业务文件：11 个非依赖文件 SHA-256 与拟发包逐一相同（`index.js` `191,583 B`、`ECCEE59543AC7EC6…`）；
- 空载 `fn invoke` 693ms 返回 `ACTION_INVALID / 不支持的报名联动操作`，证明模块加载与鉴权入口正常，未触发任何写库。

## 五、验证

- `node --check cloudfunctions/tournamentRegistrationFlow/index.js` 通过；
- 新增 `tools/test-team-join-notification-recipient.cjs` 在 main 源码上 **5/5 通过**：
  1. 未认领占位队（`creatorId`=主办方）+ 主办方与教练均有服务号绑定 → 不发送，记 `waiting_team_claim` / `TEAM_CLAIM_REQUIRED`，`recipientUserId` 为空；
  2. 未认领且无 invite → 不发送；
  3. 已认领 + 邀请发起人教练有绑定 → 发给教练（发起人优先），`delivered`；
  4. 已认领但负责人未关注、主办方有绑定 → 不回落到 `creatorId`，记 `waiting_follow_bind`；
  5. invite 属于别的球队 → 忽略 inviter，只发认领账号。

## 六、影响范围与后续

- 该函数是共享正式后端，正式与测试共用，无独立测试函数；测试端无需额外同步。
- 未认领球队的入队申请不再发服务号通知，等待球队认领并完成服务号绑定后由后续流程处理；`notification_outbox` 的 `waiting_team_claim` 记录可用于运营核对。
- 约球类通知（`friendlyMatchCenter.notifyTeamPlayers` 等）本轮未改：其接收人按本队已报名球员账号送达，与「球队负责人通知」是不同链路；如需同样收敛，须另行确认。
