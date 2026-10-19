# 球员认领闭环改造（2026-10-17，本地待发布）

## 背景与需求

旭升要求：把「添加球员」改为「球员认领」；名单中未被正式认领的球员提示「未认领」；认领渠道为转发匹配后输入球员相关信息完成认领。

此前「添加球员」由管理员手动建档，档案不绑定任何账号，家长侧没有归属感也无法接管资料；本次把主入口统一为「认领」口径：管理员生成认领邀请（二维码/链接）转发给家长，家长填写姓名+出生日期后系统自动匹配名单中的无主档案并完成绑定，无匹配才新建档案。

## 改动内容

### 服务端 `cloudfunctions/getMiniWorkspace/index.js`

1. **认领状态判定**（新增 `playerClaimState`）：账号绑定（linkedUserId/playerUserId/guardianUserId/对应 OpenId 任一存在）或家长资料已正式提交（parentProfileSubmissionStatus ∈ submitted/approved/complete 或 parentProfileCompletedAt 存在）→ `claimed`；否则 `unclaimed`。手动添加（team_quick_create，只有 creatorId/creatorOpenId）与主办方导入的档案天然落入未认领。
2. **名单与详情字段**：`formatTeamPlayer` 输出 `claimStatus / isUnclaimed / claimStatusText`（未认领/已认领）；`teamPlayerDetailForWorkspace` 同步返回这三个字段。
3. **认领匹配**（`acceptTeamPlayerInviteForWorkspace`，H5 `acceptServiceTeamPlayer` 复用同一逻辑）：提交姓名+出生日期后——
   - 本人账号已有档案：维持原幂等返回（不变）；
   - 名单中恰有 1 条同名同出生日期的**无主**档案：直接认领——绑定认领人账号（guardian 或 self 口径）、补联系手机号、记录 claimSource/claimedAt，仅补充名单缺失的号码与位置（不覆盖管理员已录入内容），返回 `claimed: true`；
   - 多条无主同名档案：抛 `PLAYER_PROFILE_CHOICE_REQUIRED` 转人工，不自动选择；
   - 同名档案已被他人认领：维持 `PLAYER_PROFILE_CONFLICT` 人工核验拦截；
   - 归档/已删除档案不参与匹配（P0-3 口径不变）；
   - 无匹配：维持新建档案（不变）。

### 小程序

- **player-library**：主按钮「添加球员」→「球员认领」（直走认领邀请生成/转发流程），次按钮「邀请球员入队」→「手动添加」（直走手动建档，去掉冗余 ActionSheet）；球员列表行新增「未认领」徽标（`player-tag-unclaimed`）。
- **player-invite**：全页文案改认领口径（页面标题「球员认领」、二维码区「扫码关注服务号并认领/登记」、结果页区分「认领成功/登记成功」）；提交后按 `result.claimed` 展示对应标题。
- **team/detail**（在线注册页）：快捷操作与空态按钮「添加球员」→「球员认领」，路由由 player-add 改为 player-invite（顺带修复原路由未带 teamId 的问题）。
- **tournament/teams**：球队行按钮与建队成功弹窗「添加球员」→「球员认领」，路由改为 player-invite。
- **tournament/detail**：名单校验提示「请先添加球员或教练」→「请先认领球员或添加教练」（2 处）。
- **official-roster**：确认态成员卡与编辑态名单行均展示「未认领」标记。
- **player-detail**：头像区资料状态旁新增认领状态标签（未认领/已认领），资料卡新增「认领状态」行。
- 未改动：`pages/team/detail.js`、`pages/player/player.js`（未在 app.json 注册的死代码）；`referee-report-import` 组件的「添加球员」（导入表格加行，语义无关）。

### 服务号 H5

- **join-player.html**：标题「认领球员」。
- **service-account-h5/service-entry.js**：登记页文案改认领口径（「核对球员资料后完成认领」、自动匹配说明、「确认认领」按钮、「认领中…」状态），提交后按 `result.claimed` 提示「认领成功/登记成功」。
- **cloudfunctions/webLoginApi/service-entry.js**：兜底错误文案「球员登记失败」→「球员认领失败」。

## 验证

- `node --check`：8 个改动 JS 文件全部通过。
- `node tools/test-service-entry-registration.cjs`：**30/30 通过**（原 23 个回归 + 新增 7 个认领用例：无主档案认领绑定监护人、成年本人认领、多条无主拦截、他人已认领冲突、不覆盖已录入号码位置、补充缺失号码位置、归档无主档案不参与匹配）。

## 待办

- **未发布**：getMiniWorkspace、webLoginApi 两个云函数与 service-account-h5 静态页均为本地改动，发布需旭升授权（沿用差量发布规范）。
- 小程序前端改动需在微信开发者工具中预览确认后上传。
- 真机复测认领链路（转发→家长填写→匹配认领→未认领徽标消失）。
- 本地改动未提交 Git，等旭升决定。
