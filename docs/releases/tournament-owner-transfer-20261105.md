# 赛事归属账号转移（达壹赛事）

日期：2026-11-05
环境：`cloud1-7g8ckb3c7815a011`

## 需求

用户要求把「郑州市达壹·野们足球超级联赛」的归属账号改为手机号 `173****6663`，并明确**只改赛事归属，不改机构归属**。

首轮误将机构 `a74ca0ce6adec67f00643a6e133b0517`（达壹足球俱乐部）负责人改到目标账号，导致该账号同时拥有两个机构（另一个是空机构 `b9a701d46a8849730060b4d94eff1333` 郑州赛小蜂足球俱乐部），触发 `organizationConflict`，会阻断赛事管理。已按用户澄清撤回。

## 最终落地数据

| 记录 | 字段 | 值 |
|---|---|---|
| `tournaments/26e7c5456adecdd30020191b6e6e2c3d` | `creatorId` / `organizerId` | `b9a701d46a884688005fc16b4218db2b`（173****6663） |
| 同上 | `previousCreatorId` / `previousOrganizerId` | `26e7c5456adec645001fdf9d062f1325` |
| 同上 | `orgId` | `a74ca0ce6adec67f00643a6e133b0517`（未变） |
| `organizations/a74ca0ce6adec67f00643a6e133b0517` | `ownerId` / `creatorId` / `createdBy` | `26e7c5456adec645001fdf9d062f1325`（恢复原负责人） |
| `organization_memberships/f803f10b6adef4b000257a08040a3085` | `role` / `source` | 回落为普通成员关系（`pc_wechat_onboarding`） |
| `tournament_staff_grants/54b160248197053454c4bc4abcb36eb9683f5b04f3fb6bd43183c2fe466c1d9f` | 目标账号赛事授权 | 保持 active，11 项权限（含 `event.settings`、`event.transfer`） |

已删除首轮为原负责人补建的协作授权 `44fa72886aec74a8001b26c462dfd612`（`owner_transfer_collaborator`），机构负责人本身即拥有全部权限，无需重复授权。

## 未改动

- `users.orgId` 未改（目标账号仍指向自身空机构 `b9a701d46a8849730060b4d94eff1333`）。
- 机构名称、机构成员关系、赛事 `orgId`、赛事业务数据（球队/名单/赛程/赛果）均未改。
- 保留原 pending 邀请 `d4389f5fa004b3a4fed2cbc7423cd98beb7268e2d1fa7fd5d22ee134c91f8793`。

## 执行方式

一次性运维云函数 `sxf-owner-fix`（临时目录 `%TEMP%\sxf-owner-fix`），只读 inspect + 令牌确认后 apply，执行完毕已 `fn delete` 并回读函数列表确认不存在。未提交仓库。

## 后续待确认

赛事侧侧边栏与写接口的租户判定仍以 `orgId` 为准；如要把目标账号变为**机构主账号**级别（赛事设置、删除赛事、跨赛事授权管理），仍需改机构负责人，而该账号目前已有另一个空机构，需先决定空机构的处置方式。
