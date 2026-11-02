# 小程序 1.2.26 开发版上传记录（报名页联系人与比赛服颜色）

- 日期：2026-10-29，Asia/Shanghai。
- 授权：用户指令「编译上传最新的小程序修改」。
- 目标：球队端小程序 `wx57164cca8676f411`，版本 `1.2.26`（开发版）。
- 结果：微信开发者工具 CLI 返回 `✔ upload`，回执 `work/upload-1.2.26-info.json`。

## 本次与 1.2.25 的差异

与上次上传的源码逐文件比对（`work/upload-1.2.25-source-manifest.json` 为基线，658 个文件）后，**只有 3 个文件变化**，都在赛事报名页：

| 文件 | 变化 |
|---|---|
| `pages/tournament/signup/signup.js` | 新增报名负责人/联系电话、17 色主备用比赛服上衣色板、报名球队选择；提交时把 `contactName`、`contactPhone`、`kitColors`、`kitColorLabels` 传给 `applyTournament` |
| `pages/tournament/signup/signup.wxml` | 新增「报名联系人」与「比赛服颜色」两个必填区、更换球队/新建球队条 |
| `pages/tournament/signup/signup.wxss` | 对应样式（`team-switch-*`、`contact-*`、`kit-picker` 等） |

`config/release.js` 版本号 `1.2.25` → `1.2.26`，标题「报名联系人与比赛服颜色」，版本日志新增首条分节。

本次上传同样是「当前工作区全量」，因此同期其他会话已在 1.2.25 中带上、且仍未提交的小程序改动一并进入本包（文件清单无新增/删除，仅上述 3 个文件哈希变化）。

## 校验项与行为约束

- 提交门槛：政策同意、免责声明、服务号绑定、竞赛组别、报名负责人、11 位联系电话、主备用球服颜色，缺一不可提交；按钮文案按缺项给出具体原因。
- 球服颜色只接受色板内 17 色，主备不能相同；短裤与球袜仍由主办方在 PC 端补录。
- 报名球队默认取当前工作空间球队，可从「我的球队」更换或新建；同一支球队报名不同组别共用一份球员库，不再为第二个组别重复建队。
- 报名页 WXML 只新增 `wx:if="{{canSwitchTeam}}"` 与 `{{kitPrimaryLabel || '请选择上衣颜色'}}` 这类简单条件与 `||`，未引入比较、三元、方法调用或数组索引。

## 包体

| 包 | 1.2.25 | **1.2.26** | 增减 |
|---|---|---|---|
| TOTAL | 3,912,185 | **3,921,574** | +9,389 |
| main | 1,963,844 | **1,964,348** | +504（全部来自 `config/release.js` 版本日志） |
| `/packageA/` | 50,324 | 50,324 | 0 |
| `/packageDiscover/` | 392,496 | 392,496 | 0 |
| `/pages/match/` | 153,341 | 153,341 | 0 |
| `/pages/team/` | 826,699 | 826,699 | 0 |
| `/pages/tournament/` | 525,481 | **534,366** | +8,885（报名页三个文件） |

主包 1,964,348 B ≈ 1918.3 KB，距 2048 KB 上限余约 130 KB。

## 验证

- 168 个小程序 JS 文件 `node --check` 全部通过（`checked=168 failed=0`）。
- `node --check miniprogram/config/release.js` 通过，读回 `version 1.2.26`、分节 39 条、首条「报名联系人与比赛服」3 项。
- 全量 WXML 表达式扫描 `work/scan-wxml-1.2.26.mjs`：131 个文件；本次改动的 `signup.wxml` **零命中**。既有页面仍有 33 处比较/三元/数组索引/方法调用（`components/guest-guide`、`pages/my-cards`、`pages/team/detail`、`packageA/pages/lineup` 等），均为 1.2.25 已带入的历史代码，本次未改动、未清理。
- 上传源：`work/mini-upload-1.2.26`（`miniprogram/` 全量 + 精简 `project.config.json`，沿用 1.2.25 的 6 条 `packOptions.ignore`、同一 AppID 与 `miniprogramRoot`）。
- 逐文件 SHA-256：源 658 / 暂存 658，**mismatch=0**，清单存 `work/upload-1.2.26-source-manifest.json`。
- `project.config.json` 无 BOM（首字节 `{ , CR, LF`），JSON 解析通过；`appid=wx57164cca8676f411`、`miniprogramRoot=miniprogram/`、`packOptions.ignore=6`。
- 命令：`cli.bat upload --project 'E:\Documents\sxf-football\work\mini-upload-1.2.26' -v 1.2.26 -d "报名页补齐报名负责人、联系电话与主备用比赛服颜色" -i work/upload-1.2.26-info.json`（CLI 位于 `D:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat`）。

## 后端依赖（已在线，无需随本次发布）

报名页新字段由 `applyTournament` 落库。只读下载线上包核对：

- 线上 `applyTournament/index.js` 已含 `contactName`（`CONTACT_PHONE_INVALID` 校验）、`kitColors`/`kitColorLabels`（`KIT_COLOR_DUPLICATED` 校验）与写入 `tournament_teams` 的 `contactName/managerName/contactPhone/managerPhone/kitColors/kitColorLabels`。
- 本地 `cloudfunctions/applyTournament/index.js` 与线上不同（442 行 vs 429 行，SHA-256 `F4C051BB…` vs `4C2AD29D…`），差异为本地多出的「同队同组别重复报名预检」与报名失败日志；**属未发布改动，本次未部署**，不影响新字段落库。

## 状态与边界

- 只上传开发版；未提交审核、未发布正式版，未设置体验版（CLI 无该命令，体验版指向以用户在公众平台确认为准）。
- 未部署任何云函数、未写业务数据库、未改动 PC/服务号 H5 或其他端口。
- 真机验收待现场：报名页两项新必填在真实机型上的输入体验、色板滑选、11 位手机号校验提示、提交后主办方报名管理能看到负责人/电话与球服颜色。
