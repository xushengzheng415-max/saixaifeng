# 入队通知接收人修复被回退后的重新发布（2026-11-03）

状态：`tournamentRegistrationFlow` 已重新发布，`Active`，修改时间 `2026-11-03 22:50:38`。

## 一、用户反馈

「为什么这个球队的团队申请审批又跑到这个我的手机号里面了？」截图：服务号「赛小蜂足球助手」连续三条「加入团队申请审批提醒」，球队均为 `郑机联FFT足球队`，申请人 `白松阁 / 陈岩 / 李昊远`，时间 `21:28 / 21:33 / 21:36`。

## 二、线上数据（只读核验）

| 对象 | 结果 |
|---|---|
| `teams`（郑机联FFT足球队） | `_id 0e570c4b6ae32e41005881592625c07e`，`claimStatus claimed`，`ownerId` 与 `claimedByUserId` 均为 `d54fcd5d6ae872d7008e7ec42f3cc02a`，`creatorId b9a701d46a884688005fc16b4218db2b`（主办方账号） |
| `users`（`d54fcd5d…8e7…`） | 手机号 `13598899362` |
| `users`（`b9a701d4…`） | 主办方账号 |
| `notification_outbox`（同一批 `team_player_join_submitted`） | `recipientUserId b9a701d46a884688005fc16b4218db2b`、`status delivered`、`channel service_account` |

球队已被认领，接收人却仍是 `creatorId`（主办方），与 2026-11-02 用户确认口径「谁认领球队谁收服务号通知」相反。

## 三、根因

下载线上包核对：线上 `index.js` 里 **没有** 2026-11-02 加入的 `claimantIds` 认领关系判定（`claimantIds` 命中 0 处），接收人候选仍包含 `team && team.creatorId`。即 2026-11-02 的修复在随后某次以旧包为基线的发布中被整体回退。

本次 20:50 的「球队管理权限」发布同样以该线上包为基线，因此也一并带着这处回退；两次说明：该函数的发布必须以**刚下载的线上包**为基线，并在发布前后用 `claimantIds` 做完整性核对。

## 四、改动

以当前线上包为基线，只替换 `notifyTeamPlayerJoin` 的接收人块：

- 新增 `claimantIds = [team.ownerId, team.ownerUserId, team.claimedByUserId]`，候选 = 该邀请的 `inviterUserId`（且 `invite.teamId` 与本次一致）+ 认领人，**仅当球队确实有认领人**。
- 去掉 `team.creatorId` 兜底；未认领球队不发通知，`notification_outbox` 记 `waiting_team_claim`（`TEAM_CLAIM_REQUIRED`）；认领人未完成服务号绑定记 `waiting_follow_bind`。
- 未改其他业务逻辑，未改任何数据。

## 五、发布与读回

- `fn code download` 取线上包 → 仅替换上述块 → `node --check` 通过 → `fn code update --dir` 成功。
- 读回：`Active`、`ModTime 2026-11-03 22:50:38`、`Nodejs18.15` / 256MB / 60s / 自动安装依赖 TRUE、9 个环境变量键未变。
- 回下载比对：`index.js` SHA-256 `0F70AB1DBE307CFF4DCCE87ED2EFF1EA871D7EF6615725A86071E76DC27412A8` 与拟发包一致；`claimantIds` 3 处；`team && team.creatorId]` 0 处。
- 空载 `fn invoke`：624ms 返回 `ACTION_INVALID`，模块加载正常、未写库。

## 六、遗留与提醒

- 已发出的三条通知无法撤回；后续同一球队的入队申请只会发给认领人 `13598899362`（其完成服务号绑定情况下），未认领时只记 `waiting_team_claim`、不发给主办方。
- 该账号下存在两支重复球队：`郑机联FFT足球队`（主办方预建、已认领）与 `郑机联fft`（本人创建）。按规则「名称相同不自动合并」，需人工核验后再决定保留哪一支、是否把赛事报名归并。
- 该函数为正式/测试共用后端，前端本轮无改动。
