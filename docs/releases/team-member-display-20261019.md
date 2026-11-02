# 球队成员列表展示修正发布（2026-10-19）

## 问题

1. 球队成员列表里同一自然人出现两条记录：负责人账号（微信名「武优秀」）与工作人员记录（「武朝」）。
2. 主教练（魏嘉颖）、队医（李伟）既没登记手机号也没有关联账号，状态却显示「已登记」，与「有无可识别身份」不符。
3. 认领后列表展示的是微信昵称「武优秀」，而不是本人姓名「武朝」。

## 原因

`cloudfunctions/getMiniWorkspace/teamMemberView.cjs` 是球队成员列表展示的唯一实现：

- `formatMember` 丢弃了成员记录上的 `staffId`，而 `staffId` 是球队管理权限保存时写入的**确定指向**（`organizers` 侧 `staffAccountId(role)` 会把 `'staff:<id>'` 切成 coaches 的 `_id`），导致按姓名兜底匹配失败、同一人拆成两行。
- `withStaff` 对 staff-only 行统一写死「已登记」，没有区分有无可识别身份。
- 姓名取值链把微信昵称排在名册姓名之前。

生产实据（teamId `d7580c016aabfd1200ea4dd3640b530e`）：

- `team_memberships` 1 条：`userId=8e888ff96ac38faf028fd47c787a2362`、`role=owner`、`phone=13253439995`、**`staffId=df40db4d6ad4cd720103ed545336c7db`**、`source=organizer_team_access`。
- `users` 该账号只有 `nickname: 武优秀`，`realName`/`name` 均空。
- `coaches` 4 条：`df40db4d…`=武朝/工作人员/`phone:''`/`source:organizer_player_staff`；张俊杰/领队/`15237865552`；魏嘉颖/主教练/`phone:''`；李伟/队医/`phone:''`。
- 关联球员档案 `22dda375…` 的 `name` 也是「武朝」。

## 修复（`cloudfunctions/getMiniWorkspace/teamMemberView.cjs`）

1. **显式标识优先合并**：`formatMember` 保留 `staffId`/`staffIds`；`withStaff` 先按 `staffIds` 命中成员记录，未命中才回落到 userId/手机号候选（单一候选才匹配），push 时去重。属标识匹配，不做姓名推断、不合并账号或写库。
2. **「已登记 / 未登记」区分**：staff-only 行按 `Boolean(关联账号) || Boolean(手机号)` 展示状态，二者都没有时显示「未登记」。
3. **姓名优先级**：账号本人实名（`realName`/`name`）> 名册/报名表姓名 > 微信昵称。账号没有实名时用名册姓名展示，账号已实名时不被名册姓名覆盖。

## 发布方式

沿用既有做法：以**当时线上包为基线**、只叠加改动文件，不使用本地目录整体上传（本地 `node_modules` 缺 `pngjs`/`@resvg`，整体上传会在运行时 443）。

- 基线：`fn code download getMiniWorkspace` → `.codex-artifacts/mini-member-name-20261019/baseline`，5906 文件。
- 发布包：`functions/getMiniWorkspace` = 基线 + 仓库 `teamMemberView.cjs` 1 个文件；与基线全量比对 **changed=1**，md5 `24d68a834060b401f18b5d66ae421dae`。
- 配置：`runtime Nodejs18.15`、`handler index.main`、`timeout 150`、`memorySize 512`、`installDependency false`、`--deployMode cos -y --force`；`deploy.cloudbaserc.json` 的 `functionRoot` 用仓库内相对路径。
- 结果：`成功: 1 个`，ModTime 2026-10-19 16:42:01，代码大小 12785512 → 12786250 B。
- 回读：`fn code download` → `readback`，5906 文件与发布包**全量 md5 逐字节一致（diff=0）**，`teamMemberView.cjs` = `24d68a83…`。
- 配置回读：执行方法 `index.main`、运行环境 `Nodejs18.15`、内存 512MB、超时 150s、自动安装依赖 FALSE 全部保持；环境变量仍是原 2 个键，值未改（详情未落盘、已按凭据规则清理）。

## 线上验证

`fn invoke getMiniWorkspace`（`action=teamMembers`，teamId `d7580c01…`）实际返回 4 行：

```
武朝   | 负责人 / 工作人员 | 132****9995 | 已加入 | 主账户
张俊杰 | 领队            | 152****5552 | 已登记 |
魏嘉颖 | 主教练          |            | 未登记 |
李伟   | 队医            |            | 未登记 |
```

「武朝」不再单独成行，负责人行显示本人姓名；另一次空参探活 1978ms/42.71MB 正常返回，模块加载无异常（非 443）。

## 回归

```
node --check cloudfunctions/getMiniWorkspace/teamMemberView.cjs   OK
node tools/test-mini-team-inner-pages.cjs            PASS（新增 staffId 合并、未登记状态、实名不被名册姓名覆盖三组断言）
node tools/test-mini-roster-staff-cards.cjs          PASS
node tools/test-mini-player-library.cjs              PASS
node tools/test-mini-official-roster-cards.cjs       PASS
```

## 未变更

- 小程序代码未改动、未上传（展示由服务端下发）。
- `webLoginApi`、`tournamentRegistrationFlow`、H5 静态资源本轮未动。
- 生产数据未写入（仅函数代码）；Git 未提交、未推送。
