# 球员登记完成页修复发布（2026-10-19）

## 问题

真机反馈：新球员提交后，页面显示「已提交球队确认」，但顶部同时有红字「球员关联已变化，请重新进入」，卡面区域也是同一句错误，看起来像提交失败。

## 原因

提交本身是成功的（`pendingTeamConfirm` 回执已渲染）。问题在完成页：`showRegistrationCard(true, receipt)` 渲染完标题后仍然调用了 `preview(true)`，即再次请求 `serviceEntryPlayerCard`。

而按 2026-10-19 新口径，新登记的档案在球队确认前 **不写 `teamId`**（只写 `pendingJoinTeamId`）。`webLoginApi/serviceRegistrationMedia.cjs` 的 `card()` 要求 `player.teamId === gate.teamId`，于是直接抛 `PLAYER_CARD_FORBIDDEN`（文案「球员关联已变化，请重新进入」），`preview` 的 catch 把这句话写进了卡面和顶部提示。

一句话：**提交成功后又去回读一张此刻还不该存在的卡**。

同一路径还影响二次进入：`serviceEntryContext` 只回 `registeredPlayerId`、不回回执，重新打开链接仍走 `showRegistrationCard()` → 同样报错。

## 修复（仅 H5）

`service-account-h5/service-entry.js`：

- 完成页不再回读接口：把弹窗里**已确认的那张卡**（`onConfirmed` 收到的 `imageData`）直接传进 `showRegistrationCard(true, result, cardImage)` 展示。
- 完成页文案改为真正的成功页：标题「已提交球队确认」、状态「已提交，等待球队确认」、卡下提示「球队负责人可在小程序球员库「待确认入队」中确认，确认后正式入队。」
- 二次进入兜底：`preview` 失败若命中 `PLAYER_CARD_FORBIDDEN` / `PLAYER_CARD_AUTH_REQUIRED` 或文案「球员关联已变化 / 请先完成球员登记」，改为渲染「登记已提交 · 球员卡将在球队负责人确认后生成」，不再把服务端错误直接抛给用户。
- 缓存标记 `service-entry.js?v=20261019-done1`（`join-player.html`、`claim-team.html`）。

> 注：`webLoginApi` 抛错时只返回 `{success:false,error}`，**不带 `code`**（`index.js` 末尾 catch）。因此兜底同时按 code 与文案匹配。若要彻底可靠，应给该 catch 补 `code: err.code`，属独立改动。

## 发布

- 上传 132 个文件；回读 `https://www.sxffootball.cn`（`Cache-Control: no-cache`）：两页面均为 `v=20261019-done1`，`service-entry.js` 线上 md5 `9591af60…` 与本地一致，`showPendingNotice`、`已提交，等待球队确认`、`待确认入队` 均在线。
- 后端未改动。

## 真机验收

1. 新球员提交 → 完成页只有成功信息与已确认的球员卡，无红字。
2. 关闭页面重新打开同一链接 → 显示「登记已提交 / 球员卡将在球队负责人确认后生成」，不再是「球员关联已变化」。
3. 认领已有球员（已在队）→ 完成页显示「登记成功」并展示球员卡。

## 依赖：球队侧要看到申请，小程序必须上传新版

待确认档案的 `teamId` 为空，旧版小程序球员库按 `teamId` 取数，**看不到**这条申请。`miniprogram/pages/team/player-library` 的「待确认入队」区块已在仓库中改好但尚未上传；球队负责人要在小程序里看到并确认入队申请，需要先在微信开发者工具编译上传新版小程序（上传前先读回后台已有版本号再定新号）。
