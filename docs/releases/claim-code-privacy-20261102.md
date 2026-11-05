# 球队认领码隐私收敛与首屏并行发布记录（2026-11-02）

状态：`getMiniWorkspace` 已差量发布（共享正式后端，正式与测试共用）；小程序开发版 **1.2.33** 已上传。体验版未设置、未提审、未发布正式版小程序。

## 一、问题

用户（球队领队）扫描赛事级认领码后反馈两点：

1. 首屏空白约 2 秒才出现球队；
2. 认领列表出现了同一赛事其他球队（截图中 7 行，除本人待认领球队外 6 行均标「已授权管理」，且每行手机号都显示本人 `173****6663`）。

## 二、根因

- 隐私：`claimableTeamsForWorkspace` 把「账号名下/机构管理」球队（`loadAccountOwnedOrManagedTeams` 宽口径）+ 工作空间目录里所有 `team.view` 球队空间一并并入认领列表，且这些行 `managerPhoneMasked` 固定用当前账号手机号，所以全部行看起来都像「我的球队」。
- 空白：`claim-code.js` 的 `loadContext` 串行执行 `claimCodeContext` → `claimableTeams` 两轮云调用；弱网下叠加 `pages/team` 分包下载，表现为白屏数秒。

## 三、改动

- `cloudfunctions/getMiniWorkspace/index.js` → `claimableTeamsForWorkspace`
  - 只保留：本人已验证手机号命中报名表邀请；主办方逐队 `organizer_team_access` 工作人员授权（`status` ∈ active/accepted/claimed、`staffId` 存在、`source=organizer_team_access`、`permissions` 含 `team.view`）。
  - 已授权行手机号改为展示球队自身登记电话，不再用当前账号号码代替。
  - 其余已授权球队从「我的球队」/工作空间进入，不进入认领列表。
- `miniprogram/pages/team/claim-code/claim-code.js`
  - `loadContext` 改为 `claimCodeContext` 与 `claimableTeams` 并行，抽出 `applyTeams` 供 `loadTeams` 复用，重复点击仍由 `_loadingContext` 去重。

## 四、发布方式与读回

### 4.1 云函数

线上包早于本地 `HEAD`（缺 `sharedTournamentData`、`claimSelfPlayer`、`tournament-boards` 等块），为避免覆盖他人成果，未整包上传本地文件：

1. `fn code download getMiniWorkspace` 取最新线上包（`index.js` 265,450 B，包 18,169,073 B）；
2. 仅在线上包内替换 `claimableTeamsForWorkspace` 中该合并块（其余文件保持线上原样，含原 `index.js.orig`）；
3. `node --check` 通过；以 `SXF_CLAIM_TEST_FUNCTION` 指向该线上包运行契约测试，**27/27 通过**；
4. `fn code update getMiniWorkspace --dir <线上包>` → `函数代码更新成功`。

读回与配置：

- 修改时间 `2026-11-02 18:54:47`、状态 `部署完成`、代码大小 18,169,296 B；
- 配置前后对比：运行时、内存、超时、自动安装依赖、环境变量均未变化（仅代码大小与修改时间变化）；
- 回下载比对 `index.js` SHA-256 = `A40D132A8F7D37E9D3C847D8B1E04BFFD41928F790D942705CBA94C3519B224D`，与拟发布文件一致；
- 空载 `fn invoke`：14ms、返回 `{"success":false,"code":"WORKSPACE_LOAD_FAILED","message":"无法识别当前微信账号"}`，证明模块加载与鉴权入口正常，未触发任何写库。

### 4.2 小程序

- 项目 `E:\Documents\sxf-football\miniprogram`、AppID `wx57164cca8676f411`、版本 `1.2.33`，MCP `upload` 成功；
- 包体：TOTAL 5,107,587 B、main 2,019,538 B、`pages/team/` 743,222 B、`packageCard/` 1,424,273 B、`pages/tournament/` 429,863 B、`packageDiscover/` 371,139 B、`pages/match/` 85,452 B、`packageA/` 34,100 B；
- 仅产生开发版；体验版设置、提审、正式发布均未执行。

## 五、生效范围

- 认领列表隐私收敛：服务端改动，已即时生效，**无需更换小程序包**。
- 首屏并行加载：属客户端改动，需 1.2.33 运行（开发者工具/预览，或设为体验版）才能看到效果；分包首次下载耗时仍存在，与云调用串行无关。

## 六、续修：认领后「返回」回到小程序内（同日，客户端）

复测反馈：认领完成后从球队页点「返回」又回到认领列表页；在认领页点「返回」在扫码直开场景会退出小程序。

根因与改动（均为客户端，需新包生效）：

- `pages/team/claim-code/claim-code.js`：`enterTeamWorkspace` 由 `wx.navigateTo` 改为 `wx.redirectTo`，认领码落地页不再留在页栈；`back` 改为 `nav.back('/pages/home/home')`，页栈只有本页时回小程序首页而不是退出。
- `pages/team/prebuilt-invite/prebuilt-invite.js`：`back` 改为 `nav.back('/pages/home/home')`。
- `pages/team/team.js`：`onBack` 统一回落到 `/pages/teams/index`（原来只在消息通知入口给 fallback）。
- `pages/team/imported-player-review/imported-player-review.js`：`back` 改为 `nav.back('/pages/teams/index')`。
- `tools/test-mini-claim-direct-team-entry.cjs` 增至 6 个场景：自动进入已认领球队必须 `redirectTo`（不得把认领页留在页栈）、认领页根页返回回首页、多层页栈正常 `navigateBack`。全套通过：6/6、认领路由测试通过、自动切换 2/2。
- 小程序 **1.2.34** 开发版上传成功：TOTAL 5,107,692 B、main 2,019,538 B、`pages/team/` 743,327 B（1.2.33 为 5,107,587 B / 743,222 B）。仍为开发版，未设置体验版、未提审。

## 七、未完成与遗留

- 线上 `getMiniWorkspace` 整体仍早于本地 `HEAD`，本地 `HEAD` 中的 `sharedTournamentData`、`claimSelfPlayer`、`tournament-boards`、`tournamentPlayerValuations` 等块未上线，需单独授权后按同一「下载线上包、差量替换、回下载比对」流程发布。
- 若用户复测后仍看到部分「已授权管理」球队，说明这些球队确有主办方逐队 `organizer_team_access` 授权记录（属合法授权范围，需产品侧确认是否也不应在认领页展示）。
