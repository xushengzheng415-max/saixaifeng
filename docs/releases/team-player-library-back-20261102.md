# 服务号通知经中转页落地与球员库导航调整（2026-11-02）

状态：共享后端 `getMiniWorkspace` 已差量发布（正式/测试共用，修改时间 `2026-11-02 23:44:58`、`Active`）；小程序开发版 **1.2.36 上传待微信开发者工具确认**。体验版未设置、未提审。

## 一、用户口径

- 「我从服务号的审核通知点击后能真正进入到小程序，而不是我右滑上一步又到微信页面了，我觉得应该留在小程序里面」。
- 「测试版主页标签我看了，放右上角不合适，取消吧」。

即：通知点进来后，**右滑/返回不能退回微信聊天**，要停在小程序内；上一版放在球员库右上角的「首页」标识按验收意见撤销。

## 二、做法

微信模板消息直接指定 `pagePath` 时，小程序页面栈只有一页，右滑必然退回微信聊天，页面本身无法凭空补一层。因此改为两级落地：

1. 通知 `pagePath` 指向中转页 `pages/notify-entry/notify-entry?teamId=<该队>`（新登记追加 `&pendingTeamConfirm=1`）；
2. 中转页 `onLoad` 先用 `wx.navigateTo` 打开 `pages/team/player-library/player-library?teamId=...`，中转页留在栈底；
3. 用户在内页右滑或点返回 → 回到中转页（仍在小程序内），中转页 `onShow` 立即 `wx.switchTab('/pages/home/home')`（失败回退 `reLaunch`），落到小程序首页，可继续看赛事、球场等其他内容。

用 `_entered` 标记区分「首次 onShow（还在打开业务页）」与「用户退回后的 onShow」，避免一启动就跳首页。没有 `teamId` 或打开失败时直接回首页，不留在空白页。

## 三、改动清单

| 文件 | 改动 |
|---|---|
| `miniprogram/app.json` | 主包页面列表新增 `pages/notify-entry/notify-entry` |
| `miniprogram/pages/notify-entry/notify-entry.{js,json,wxml,wxss}` | 新增中转页（深绿底「正在进入…」、custom 导航、无业务逻辑） |
| `cloudfunctions/getMiniWorkspace/playerRegistration.cjs` | 两处 `notifyTeamPlayerJoin` 的 `pagePath` 由 `pages/team/player-library/player-library?...` 改为 `pages/notify-entry/notify-entry?...`（新登记仍带 `pendingTeamConfirm=1`） |
| `miniprogram/pages/team/player-library/player-library.wxml` | 移除导航栏右上角「首页」胶囊 |
| `miniprogram/pages/team/player-library/player-library.wxss` | 删除 `.player-library-home` / `.player-library-home-icon` 两条样式 |
| `miniprogram/config/release.js` | 升 **1.2.36**，标题「通知落到小程序内页与返回留驻」，sections 头部改为「通知落地中转页 / 球员库导航 / 认领返回链」 |
| `tools/test-mini-player-library.cjs` | 改为断言「不得再有 `player-library-home`」，新增中转页断言（目标参数、首次 onShow 不跳、退回后跳首页、无参数回首页、app.json 注册） |
| `tools/test-player-registration.cjs` | 三处通知落点断言改为 `pages/notify-entry/notify-entry?teamId=...` |

球员库页内 `goHome()` 与单页栈「回首页 / 留在本页」选择保留，作为直接进入（无中转页）时的兜底；`player-library.js` 未再改动业务逻辑。

## 四、发布与读回

### 4.1 云函数（已发布）

沿用「下载线上最新包 → 只替换两行 `pagePath` → 校验 → 上传」的差量方式，未整包上传本地源码：

- 线上包 `playerRegistration.cjs` 仅替换两处路径字面量，`git diff --no-index` 为 `+2/−2`，`node --check` 通过；
- `fn code update` 成功；读回 `Active`、`ModTime 2026-11-02 23:44:58`、`Nodejs18.15` / 512MB / 超时 150s / 自动安装依赖 TRUE、环境变量键 `SXF_FOOTBALL_SERVICE_BRIDGE_KEY,SXF_MATCH_PASS_SECRET` 未变；
- 回下载比对：`playerRegistration.cjs` SHA-256 `B231E70E6AD3D5C730668A449F2CAE89277A3C45A9389B8B481A4ED5DEEAD465`（与拟发包一致），`index.js` `A40D132A8F7D37E9D3C847D8B1E04BFFD41928F790D942705CBA94C3519B224D`（与线上原包一致，证明只改了前者）；
- 空载 `fn invoke` 6ms 返回 `WORKSPACE_LOAD_FAILED/无法识别当前微信账号`，模块加载与鉴权入口正常、未写库。

### 4.2 小程序（待确认）

`upload-version 1.2.36` 通过微信开发者工具 MCP 发起，`taskId confirmation_upload_ee081242-9037-490f-9270-7661e3115cc8` 仍为 `pending`，需在开发者工具点确认后回执包体大小。

## 五、向后兼容与上线顺序

- 服务端已改指向中转页。**仍是旧小程序版本（1.2.35 及更早）的客户端没有这个页面**，点通知时微信会落到小程序默认首页而不是该队球员库。
- 因此 1.2.36（或更高）需尽快走体验版与正式发布，才能真正做到「点通知进对应球队、右滑留在小程序内」。未获提审/正式发布授权，本任务只上传开发版。

## 六、验证

- `node --check`：中转页 js、`release.js`、`playerRegistration.cjs` 通过；`require('./miniprogram/config/release.js')` 输出 `1.2.36`、55 段。
- `tools/test-player-registration.cjs`：PASS（含新登记 `pages/notify-entry/notify-entry?teamId=team&pendingTeamConfirm=1`、认领与恢复 `pages/notify-entry/notify-entry?teamId=team`）。
- `tools/test-mini-player-library.cjs` 页面段 PASS：中转页目标参数、首次 `onShow` 不跳首页、退回后跳 `/pages/home/home`、无参数直接回首页、`app.json` 已注册、球员库不再含 `player-library-home`、跨空间切队、无权限提示、返回键分支、WXML 表达式合规。
- **既有无关失败（未修复）**：同文件末尾的球员卡读取隔离段仍失败（`1f2cc2ea` 去掉 `playerCardReader.cjs` 单卡 `CARD_READ_FAILED` 兜底），与本轮无关，需单独授权。

## 七、遗留

- 小程序 1.2.36 待开发者工具确认上传；体验版、提审、正式发布均未执行。
- 玩家在旧版本点通知会落到首页；发布正式版后才完全符合用户预期。
- 线上 `getMiniWorkspace` 整体仍早于本地 `HEAD`，本轮只发布两行 `pagePath`。
