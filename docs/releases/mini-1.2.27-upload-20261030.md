# 小程序 1.2.27 开发版上传记录（报名球队只认自己的球队）

- 日期：2026-10-30，Asia/Shanghai。
- 授权：用户指令「需要你按上次流程升到 `1.2.27` 上传开发版」。
- 目标：球队端小程序 `wx57164cca8676f411`，版本 `1.2.27`（开发版）。
- 结果：微信开发者工具 CLI 返回 `✔ upload`，回执 `work/upload-1.2.27-info.json`。

## 触发问题

用户扫码报名时，报名页显示的报名球队是「棒棒足球装备俱乐部（未知城市 · 30 名球员）」，而「我的球队」页只有「郑州郑漂足球俱乐部（郑州市 · 8 人）」，用户明确表示「我并没有在这个球队有管理权」。同一轮还报过扫码后「参赛信息暂不可用，请重试」。

根因两条：

1. 旧 `resolveSignupTeam()` 在客户端直查 `teams`，把 `ownerPhone/creatorPhone/phoneNumber/phone/contactPhone/mobile` 任一等于本账号手机号视为「这是我的球队」，再取 `teams[0]`——把「联系资料」当成了「管理权」。小程序直调 `getMyTeams` 缺 `__actorUserId/__actorOrgId` 恒返回 `AUTH_REQUIRED`，因此必然落到这条兜底查询。
2. 报名记录组别只按 `divisionId || 'default'` 取，而 `getMiniWorkspace.teamTournamentDetail` 按 `divisionId → division → default` 取；只有 `division` 字段的历史报名会被判成「未报名」，跳到无匹配组别后页面显示「参赛信息暂不可用」。

## 本次与 1.2.26 的差异

以 `work/upload-1.2.26-source-manifest.json`（658 文件）为基线逐文件比哈希，业务代码**只有 1 个文件变化**，全在赛事报名页：

| 文件 | 变化 |
|---|---|
| `pages/tournament/signup/signup.js` | 选队改为工作空间权威口径；删除手机号归属判断；新增 `loadWorkspaceTeams/workspaceTeamList/persistWorkspaceTeams/enrichTeams/registrationDivisionId`；`setTeamChoices` 放宽为「有一支即可换队/新建」 |
| `config/release.js` | 版本 `1.2.26` → `1.2.27`，标题「报名球队只认自己的球队」，版本日志首条新增「报名球队识别修复」4 项 |

`signup.wxml`、`signup.wxss` 未改；本次上传为「当前工作区全量」，其余文件与 1.2.26 逐字节相同（无新增、无删除）。

## 行为变化

- 报名球队只从 `workspace.loadContext()` 的 `homeEntries(type==='team')` ∪ `context.teams` 去重读取，与「我的球队」页 `entryCards.fromHome` 同一数据源；联系电话/联系人字段不再参与归属判断（`teamMatchesCurrentLogin` 已删除并留注释）。
- 分享链接或待办带入的 `teamId` 不在自己授权球队内时，提示「当前账号没有该球队的报名权限」并清空，不再静默套用；候选为空直接进建队，不猜测球队。
- 只有一支候选球队时也能打开「更换球队」改选或新建。
- 账号还没有任何工作空间（`尚未建立可用工作空间`）按空列表处理并走建队，不再停在「球队信息加载失败」。
- 城市、球员数仍按已授权 id 从 `teams` 补取字段（`enrichTeams`，最多 20 支），读取失败沿用工作空间数据，不阻断报名。
- 已报名判断与跳转详情的组别统一走 `registrationDivisionId()`（`divisionId → division → default`），与 `teamTournamentDetail` 一致。

## 包体

| 包 | 1.2.26 | **1.2.27** | 增减 |
|---|---|---|---|
| TOTAL | 3,921,574 | **3,925,696** | +4,122 |
| main | 1,964,348 | **1,965,114** | +766（全部来自 `config/release.js` 版本日志） |
| `/packageA/` | 50,324 | 50,324 | 0 |
| `/packageDiscover/` | 392,496 | 392,496 | 0 |
| `/pages/match/` | 153,341 | 153,341 | 0 |
| `/pages/team/` | 826,699 | 826,699 | 0 |
| `/pages/tournament/` | 534,366 | **537,722** | +3,356（`signup.js` 47174 → 50530 B） |

主包 1,965,114 B ≈ 1919.1 KB，距 2048 KB 上限余约 129 KB。增减与改动文件字节数完全对齐（+766 / +3,356）。

## 验证

- 168 个小程序 JS 文件 `node --check` 全部通过（`js=168 fail=0`）。
- `node --check miniprogram/config/release.js` 通过，读回 `version 1.2.27`、`releaseDate 2026-10-30`、分节 40 条、首条「报名球队识别修复」4 项。
- WXML 表达式扫描（`work/scan-wxml-1.2.26.mjs` 扫 `work/mini-upload-1.2.27/miniprogram`）：131 个文件、33 处命中，与 1.2.26 完全相同，均为历史代码（`components/guest-guide`、`pages/my-cards`、`pages/team/detail`、`packageA/pages/lineup` 等）；`pages/tournament/signup` **零命中**。
- 上传源 `work/mini-upload-1.2.27`（`miniprogram/` 全量 + 复用 1.2.26 已校验的精简 `project.config.json`）：源 658 / 暂存 658，**mismatch=0**，清单 `work/upload-1.2.27-source-manifest.json`。
- `project.config.json` 与 1.2.26 逐字节相同（SHA-256 前 16 位 `D8219077B3099DA2`），无 BOM（首字节 `{ , CR, LF`），`appid=wx57164cca8676f411`、`miniprogramRoot=miniprogram/`、`packOptions.ignore=6`。
- 命令：`cli.bat upload --project 'E:\Documents\sxf-football\work\mini-upload-1.2.27' -v 1.2.27 -d "报名球队只认自己的球队：报名页选队改为工作空间授权，修复参赛信息暂不可用" -i work/upload-1.2.27-info.json`（CLI 位于 `D:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat`）。

## 后端依赖与未发布项

- 本次为纯小程序端改动，未部署任何云函数、未写业务数据库。
- `applyTournament` 的 `canManageMiniTeam` 仍把 `contactPhone/phone/mobile` 当作管理权依据（后端未收紧，等用户确认后再按差量发布流程处理）。
- 本地 `cloudfunctions/applyTournament/index.js` 与线上仍不同（442 vs 429 行），属此前未发布改动，本次未部署。

## 状态与边界

- 只上传开发版；未提交审核、未发布正式版，未设置体验版（CLI 无该命令，体验版指向以用户在公众平台确认为准）。
- 上传快照与工作区核对：`pages/tournament/signup/{signup.js,wxml,wxss,json}` 与 `work/mini-upload-1.2.27` 逐文件哈希一致（50,530 / 13,372 / 11,501 / 50 B）。
- 上传后同期另一任务已把 `miniprogram/config/release.js` 改为 `1.2.28`（标题「报名免责声明与隐私条款」），该改动**不在 1.2.27 包内**，也未覆盖本次上传快照；下次上传会一并带上。
- 用户此前用「棒棒足球装备俱乐部」提交的待审报名仍留在 `tournament_teams`，小程序端没有取消报名入口；需主办方在 PC「报名管理」驳回，或后续补撤回功能。
- 真机复测点：报名页显示「郑州郑漂足球俱乐部」、棒棒足球不再出现、单支候选队也能换队/新建、扫码后不再报「参赛信息暂不可用」。
