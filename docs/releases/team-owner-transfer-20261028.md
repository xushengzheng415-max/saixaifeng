# 球队主账号免确认移交（2026-10-28）

用户口径：「B，走移交但是不需要对方确认！对方登录就能看到自己的球队信息」。本条替代旧口径「主账号移交必须由受让人在小程序确认」；首次认领与受邀接收参赛仍必须本人确认，不受影响。

## 触发问题

账号 `17319716663`（`b9a701d4…db2b`）的首页「我的球队」出现 `陆零後足球队`、`开封立洋足球队` 两支球队，用户自认不是主账号。

只读回读结论：两支球队均由主办方账号（`18637842065`）从报名表导入（`source=registration_docx_import`），`ownerId`／`claimedByUserId` 都指向该账号；`陆零後` 成员关系为 `role=owner`／`accepted`（`organizer_team_access`），`开封立洋` 成员关系已 `revoked`（`organizer_claimant_bind`）但所有权字段未清，所以仍按主账号展示（首页卡片无「管理员」标签即主账号判定）。报名联系人手机号当时均未注册账号。两支球队各有 37 名球员与 4 条参赛记录，不满足「主账号删除空球队」。

## 实现

| 位置 | 内容 |
|---|---|
| `cloudfunctions/getMiniWorkspace/teamOwnerTransfer.cjs` | `transferDirect`（主账号直接移交）、`bindPending`（受让人登录自动认领） |
| `cloudfunctions/getMiniWorkspace/index.js` | 新动作 `transferTeamOwnerDirect`；`loadWorkspaceCatalog` 先跑 `bindPendingTeamOwners` 再读取自有球队 |
| `miniprogram/pages/team/profile/` | 主账号可见「移交主账号给新负责人」：输入手机号 → 二次确认 → 清理工作空间并回到球队列表 |
| `docs/PRODUCT_RULES.md`／`docs/ADR.md` | 规则与决策记录 |

行为要点：

- 只有当前主账号能移交自己名下球队；`phone` 与 `phoneNumber` 双字段查重，命中多个账号直接阻断，不挑第一条。
- 受让人已有账号：立即改绑所有权并建 `owner` 关系，原主账号关系置 `revoked`，球员、参赛名单、赛果与历史归属不变。
- 受让人未注册：写 `pendingOwnerPhone`、`claimStatus=pending`，该手机号首次登录自动认领并转 `claimed`，登录即见球队。
- 每次移交（含登录自动认领）写 `team_owner_transfers` 审计；移交成功后作废该队残留的「待接收主账号」邀请。

## 验证

- `node --check`：`teamOwnerTransfer.cjs`、`index.js`、`profile.js` 通过。
- `tools/test-mini-team-owner-transfer.cjs`：7 组用例通过；`tools/test-mini-empty-team-deletion.cjs` 回归通过。

## 发布状态

- **小程序**：`cli.bat upload --project miniprogram -v 1.2.21` 成功（AppID `wx57164cca8676f411`；TOTAL 3,452,895 B，main 1,801,429 B，`/pages/team/` 740,891 B，`/pages/tournament/` 419,884 B，`/packageDiscover/` 371,139 B，`/pages/match/` 85,452 B，`/packageA/` 34,100 B）。上传成功只等于生成**开发版**，未设体验版、未提交审核；其他会话未提交的小程序改动同样进入本次包。
- **云函数已上线**：本地目录混有其他会话未发布改动，未整包覆盖；以线上回下载包 `work/online-getMiniWorkspace-20261028/` 为基线差量拼出 `work/deploy-getMiniWorkspace-20261028/`（仅 `CHANGED index.js`、`ADDED teamOwnerTransfer.cjs`），`fn code update --deployMode cos` 成功。`fn detail` 前后比对配置与环境变量未变（Nodejs18.15／512MB／150s／InstallDependency TRUE），仅 `CodeSize 11,814,565 → 11,825,141`。回下载 `work/verify-getMiniWorkspace-20261028/` 两文件 SHA-256 与 staging 一致（`index.js` `5831E157…8ADE3E`、`teamOwnerTransfer.cjs` `BBCA59FE…FB0FE5`）。
- **两支球队已实际移交**（用户授权「好的，执行吧」）：
  | 球队 | `_id` | 新负责人 | 手机号 | 现状 |
  |---|---|---|---|---|
  | 陆零後足球队 | `6d00d0e56aabf9ff003e51dc0d315ce5` | 冉伟强 | `139****6658` | `ownerId` 空、`pendingOwnerPhone` 已写、`claimStatus=pending`，待其登录自动认领 |
  | 开封立洋足球队 | `6d00d0e56aacf5ad0050b9e929fbec86` | 屈恒 | `185****2019` | 同上 |
- 写库范围（每条都带 `_id`＋原 `ownerId` 双条件，`multi:false`）：`teams` 2 条、`team_memberships` 2 条（原账号 → `revoked`／`owner_transfer_out`）、`team_owner_transfers` 审计 2 条、`team_invitations` 1 条「待接收主账号」邀请置 `cancelled`；另解除两支 `prebuilt_tournament_team` 认领邀请对原账号的绑定（`acceptedUserId`／`acceptedOpenId` 置空并留 `previous*` 审计，`status` 保持 `accepted`），`陆零後` 的 `allowedClaimPhones` 改指新负责人，避免旧账号继续拿到含 `team.manage` 的临时球队空间。
- 回读证据：两队所有权三段字段均为空；原账号在这两队无 `active/accepted/claimed` 关系；按 `acceptedUserId`／`acceptedOpenId`／`inviteeUserId`、按 `ownerId`／`ownerUserId`／`claimedByUserId` 反查原账号均无结果；主办方机构 `935443556aa8…` 对原账号仅 `event.view`，不含球队权限。
- **代码补漏（同日二次差量部署）**：上面「解除认领邀请绑定」原先只做了数据侧处理，`transferDirect` 本身未覆盖该路径，会让后续每次应用内移交都留下同样的可见性残留。已在 `teamOwnerTransfer.cjs` 增加该步骤（保持 `status=accepted`，仅在 `allowedClaimPhones` 与目标手机号不一致时改指目标手机号并留 `previousAllowedClaimPhones`），`tools/test-mini-team-owner-transfer.cjs` 加第 8 组后 8 组通过；重新 COS 部署后回下载 `index.js` 仍为 `5831E157…8ADE3E`、`teamOwnerTransfer.cjs` 为 `A248C3AA…EDA11` 与本地一致；`fn invoke` 冷启动 632ms、仅返回预期的「无法识别当前微信账号」，无加载错误。`InstallDependency TRUE` 会重装 `node_modules`，本次回下载仅 `qs`／`follow-redirects`／`.package-lock.json` 版本漂移，无源码额外改动。
- **待办**：受让人用该手机号登录后自动成为主账号（无需对方确认）；体验版需在微信公众平台手动设置；未提交审核、未推 Git。

