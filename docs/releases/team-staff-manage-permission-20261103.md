# 球队管理权限统一按 team.manage 判定（2026-11-03）

状态：`tournamentRegistrationFlow` 已差量发布（共享正式/测试后端），`Active`，修改时间 `2026-11-03 20:50:17`。

## 一、用户反馈

「黄科大，18703613316 这个账号还没有邀请球员权限」，并补充「主教练已经设为主账号了，所以他应该有分享邀约入队的权限」。页面提示：`当前账号没有生成该球队球员邀请的权限`，按钮「重新生成」。

## 二、线上数据（只读核验）

| 对象 | 结果 |
|---|---|
| `users`（`phone=18703613316`） | `_id d54fcd5d6ae6f20b006dcc3968f0638b`，`openId oH8pi3XAgd7HHst7o_NaYyq09t3E` |
| `teams`（黄科大） | `_id f803f10b6ae4b71500568b2e0958945d`，`claimStatus unclaimed`，`creatorId b9a701d46a884688005fc16b4218db2b`（主办方账号），`orgId a74ca0ce6adec67f00643a6e133b0517` |
| `team_invitations`（`0e570c4b…f15`） | `type team_member`、`source organizer_team_access`、`inviteePhone 18703613316`、`inviteeName 王亚涛`、`roleText 主教练`、`memberRole member`、`permissions ["team.view","team.manage"]`、`status accepted` |
| `team_memberships`（`643bc66e…`） | `role member`、`roles ["member"]`、`permissions ["team.view","team.manage"]`、`status accepted`、`userId d54fcd5d…` |

结论：该账号不是球队创建人，也不是「未认领」状态的例外，而是主办方按工作人员登记、已完成接受的主教练；权限位已授予 `team.manage`，问题在判定逻辑没有读取权限位。

## 三、根因

`cloudfunctions/tournamentRegistrationFlow/index.js` 的 `miniActorCanManageTeam`（约 1401–1417 行）只按 `role` / `roles` 名称判断（`owner/team_manager/manager/coach/admin/负责人/管理员/教练`），`member` 一律拒绝。而 `cloudfunctions/getMiniWorkspace/index.js`（约 393–397 行）的统一口径是：成员关系登记了 `permissions` 时以 `team.manage` 为准，没有才回看 `role/roles`。同一套授权数据、两处判定不一致，主教练被拦。

## 四、改动

`miniActorCanManageTeam` 在身份与状态校验之后补一步：

```js
if (Array.isArray(item.permissions) && item.permissions.length) return item.permissions.includes('team.manage')
```

其余 `role/roles` 判定保持原样，作为没有 `permissions` 的历史数据兜底。该判定共 4 处调用（成员邀请素材、球员邀请素材、球队邀请、报名权限）同步生效。

未改任何业务数据：`team_memberships.role` 保持 `member`，球队仍 `unclaimed`，所有权仍归 `creatorId`；无 `team.manage` 的普通成员不会被放行。

## 五、发布与读回

- 发布方式：`fn code download` 取线上包 → 只替换该函数块（`index.js` `+3` 行，无删除）→ `node --check` → `fn code update --dir`。
- 读回：`Active`、`ModTime 2026-11-03 20:50:17`、`CodeSize 11216747`、`Nodejs18.15` / 256MB / 60s / 自动安装依赖 TRUE；9 个环境变量键（`SXF_FOOTBALL_MINIPROGRAM_APPID`、`…MINIPROGRAM_APPSECRET`、`…SERVICE_ACCOUNT_APPID`、`…SERVICE_ACCOUNT_APPSECRET`、`…SERVICE_BRIDGE_KEY`、`…SERVICE_TEMPLATE_TEAM_JOIN`、`…WECHAT_BRIDGE_SECRET`、`…WECHAT_BRIDGE_URL`、`SXF_IDENTITY_HASH_KEY`）前后一致。
- 回下载比对：`index.js` SHA-256 `30F65C53C2A01488B3DAF3A8C7F2B03D2BD3E0B8FAB693270FE9A8E06584DFDC` 与拟发包一致；包内 6405 个文件与拟发包一致；新判定在第 1409 行。
- 空载 `fn invoke`：1000ms 返回 `{"success":false,"code":"ACTION_INVALID","message":"不支持的报名联动操作"}`，模块加载正常，未写库。
- 回归：`test-mini-invite-compact.cjs` PASS、`test-team-claim-code-contract.js` 27/27、`test-mini-empty-team-deletion.cjs` PASS。

## 六、验收与遗留

- 待用户用 `18703613316` 账号在小程序重新点「重新生成」，确认能生成球员邀请二维码并可分享。
- 若复测仍被拒，需继续查页面侧是否另有本地判定（该页 `pagePath` 与请求参数），以及 `getMiniWorkspace` 是否已把该队放进工作空间。
- 该函数为共享后端，正式与测试共用；小程序与 PC 前端本轮无代码改动。
