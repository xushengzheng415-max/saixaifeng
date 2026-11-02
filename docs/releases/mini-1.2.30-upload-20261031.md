# 小程序 1.2.30 开发版上传记录（返回链路修复）

- 日期：2026-10-31，Asia/Shanghai。
- 授权：用户指令「好的，上传吧」（承接上一轮说明「上传会同时带上工作区里其他任务已改的版本日志」）。
- 目标：球队端小程序 `wx57164cca8676f411`，版本 `1.2.30`（开发版）。
- 结果：微信开发者工具 CLI 返回 `✔ upload`，回执 `work/upload-1.2.30-info.json`。

## 本轮要解决的问题

服务号「加入团队申请审批提醒」的模板消息（`miniprogram.pagepath = pages/team/player-library/player-library?teamId=…&pendingTeamConfirm=1`，见 `cloudfunctions/getMiniWorkspace/playerRegistration.cjs:358`）直接打开小程序「球队球员库」。此时页面栈只有一页，页内自定义返回键的 `wx.navigateBack()` 等价于退出小程序回到服务号，用户无法回到球员库的上一页。

修复（3 个文件）：

| 文件 | 变化 | 大小 / SHA-256 |
|---|---|---|
| `utils/nav.js`（新增） | `back(fallbackUrl)`：栈内多页照常 `navigateBack`；栈底则 `reLaunch(fallbackUrl)`，返回留在小程序内 | 746 B / `810D4C361B4C1BCEF8735FB1EAFE1D74E981570842DC2D2BAAED17C0A7FDCC4D` |
| `pages/team/player-library/player-library.js` | `onBack` 改为回 `/pages/team/team?teamId=…&fromNotify=1`（无 teamId 时回 `/pages/teams/index`） | 11,428 B / `74C0790B5F5289A7A476726B4269CB0118DF109B6A1D15DE7B977624B5879745` |
| `pages/team/team.js` | 记录 `fromNotify`；栈底时再返回到 `/pages/teams/index`（「我的球队」tab） | 16,695 B / `88907B66EF010A5861D44EA6B5EC72CBCBD3AADFC7EE2BC136FB5E22B853DC3F` |

返回链：模板消息 → 球员库（可确认入队）→ 球队主页 → 我的球队，全程在小程序内。正常从「我的球队」进入的多级返回不受影响；未带 `fromNotify` 的分享卡片进入路径保持原行为（栈底仍返回微信）。

## 本包与 1.2.27 的差异（119 个文件）

以 `work/upload-1.2.27-source-manifest.json`（658 文件）为基线，当前工作区 770 个文件，逐文件比哈希后变化 119 个。除本轮 3 个文件外，其余为同期其他任务的产品改动，随同一包上传：

- `app.json`（4,908 B / `7CCFDBC51BAE5789B6FEBB422C7CD924A451FC7127BFDEDF05A0F2E7AE017401`）：新增 `packageCard` 分包（4 页）。
- `images/flags/*`：新增 81 个国家/地区旗帜与 `nationality-unknown.jpg`（合计约 73 KB）。
- `packageCard/*`：新增 28 个文件（`pages/main|lineup|album-sign|battle-log`、`components/tabbar`、`utils/store.js`、素材）。
- `pages/player/detail.js|wxml`、`utils/dynamic-card-draw.js`：球员卡国籍国旗相关改动。
- `utils/nationality.js`（2,215 B）、`utils/nationality-catalog.json`（11,679 B）。
- `config/release.js`（12,780 B / `D42D19ED93101F1572949EDF990BF66711BC5A03F30F64B94CC7771D306EFB74`）：版本 `1.2.29` → `1.2.30`，标题「返回链路修复」，首节新增「返回链路修复」2 项；其余 42 节（含同期的「球员卡国籍国旗」「报名免责声明」「报名球队识别修复」等）原样保留。

## 包体

| 包 | 1.2.27 | **1.2.30** | 增减 |
|---|---|---|---|
| TOTAL | 3,925,696 | **5,437,643** | +1,511,947 |
| main | 1,965,114 | **2,046,707** | +81,593 |
| `/packageA/` | 50,324 | 50,324 | 0 |
| `/packageCard/` | 0 | **1,429,631** | +1,429,631（新分包） |
| `/packageDiscover/` | 392,496 | 392,496 | 0 |
| `/pages/match/` | 153,341 | 153,341 | 0 |
| `/pages/team/` | 826,699 | **827,422** | +723（本轮两个页面） |
| `/pages/tournament/` | 537,722 | 537,722 | 0 |

主包 2,046,707 B ≈ 1998.7 KB，**距 2048 KB（2,097,152 B）上限只剩约 49 KB**：本次新增的 73 KB 旗帜与 12 KB 国籍目录几乎吃掉了 1.2.27 时的余量。主包已接近硬上限，后续任何主包内新增资源都需先清减或改放分包。

## 验证

- 暂存源 `work/mini-upload-1.2.30`（`miniprogram/` 全量 + 复用 1.2.26 已校验的精简 `project.config.json`，SHA-256 前 16 位 `D8219077B3099DA2`、无 BOM、`appid=wx57164cca8676f411`、`miniprogramRoot=miniprogram/`、`packOptions.ignore=6`）：源 770 / 暂存 770，**mismatch=0**，清单 `work/upload-1.2.30-source-manifest.json`。
- 176 个小程序 JS 文件 `node --check` 全部通过（`js=176 fail=0`）。
- JSON 合法性：`app.json`、`config/release.js`、`utils/nationality-catalog.json`、`packageCard/pages/{main,lineup,album-sign,battle-log}/*.json` 全部 OK。
- 页面登记完整性：主包 + 6 个分包共 99 个路由，`.js/.json/.wxml` 无一缺失（`routes 99 missing 0`）。
- WXML 表达式扫描：136 个文件、33 处命中（与 1.2.27 的 33 处相同，均为历史代码）；本轮改动的 `pages/team` 与新增 `packageCard` **零命中**。
- 离线用例 `work/test-nav-back.cjs` 4/4 PASS。
- 上传命令：`cli.bat upload --project 'E:\Documents\sxf-football\work\mini-upload-1.2.30' -v 1.2.30 -d "返回链路修复：服务号入队审批进入球员库后返回留在小程序内" -i work/upload-1.2.30-info.json`。

## 状态与边界

- 只上传开发版：未提交审核、未发布正式版、未设置体验版（CLI 无该命令）。
- 未改任何云函数与数据库：模板消息 `pagepath` 仍是球员库，返回链修复完全在客户端完成。
- **包内同时包含其他任务的在建改动**（`packageCard` 分包、国籍国旗、免责声明等）。这些不在本任务验收范围，是否可用需由对应任务与用户自测确认；本任务只对返回链 3 个文件负责。
- 正式版 `1.2.17` 不含本修复，用户需等正式发布后才在微信端生效。
- 同类「栈底返回会退出小程序」问题仍在模板消息落点 `pages/todo/index`（`tournamentRegistrationFlow/index.js:1827`）和 `pages/team/player-detail/player-detail`（`webLoginApi/index.js:706`），本次未改。
