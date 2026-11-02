# 入队通知页面体验优化与小程序上传提醒（2026-10-19）

## 问题

用户反馈：递交球员申请后，球队负责人能收到服务号模板消息，但**点击消息后进入小程序，看不到审核申请页面或消息**。

## 根因

通知链路（云函数 `pagePath` → 小程序 `player-library`）的代码逻辑已就绪，但**小程序前端 `player-library.js` 尚未上传**。用户手机上运行的是旧版小程序，旧版页面没有「待确认入队」区块的数据字段与模板渲染，因此点击通知后页面正常加载，但看不到待确认入队列表。

## 修复内容

### 1. 小程序 `player-library.js`（体验优化）

**文件**：`miniprogram/pages/team/player-library/player-library.js`

- `onLoad` 中读取 `options.pendingTeamConfirm`，存入 `highlightPending`。
- `loadPlayers` 成功后，若 `highlightPending === true`：
  - 有待确认申请时，弹出 Toast「有 N 位球员待确认入队」。
  - 无待确认申请且用户有管理权限时，弹出 Toast「暂无待确认的入队申请」。
- 弹完后自动重置 `highlightPending: false`，避免重复提示。

这样从服务号通知进入页面时，用户会立即收到明确的反馈，知道当前是否有待处理申请。

### 2. 云函数 `getMiniWorkspace/playerRegistration.cjs`（通知参数增强）

**文件**：`cloudfunctions/getMiniWorkspace/playerRegistration.cjs`

- 新登记档案发送入队通知时，`pagePath` 从：
  ```
  pages/team/player-library/player-library?teamId=<teamId>
  ```
  改为：
  ```
  pages/team/player-library/player-library?teamId=<teamId>&pendingTeamConfirm=1
  ```
- 认领/恢复入队沿用原有通知，不添加该参数（因为它们不经过待确认流程）。

## 部署状态

| 组件 | 状态 | 说明 |
|------|------|------|
| `getMiniWorkspace` 云函数 | ✅ 已部署 | 含 `playerJoinReview.cjs`、`pendingJoins` 返回 |
| `tournamentRegistrationFlow` 云函数 | ✅ 已部署 | 含 `notifyTeamPlayerJoin`、`targetPage` 支持 |
| `service-account-h5` | ✅ 已上传 | 含完成页修复、图片压缩、认领拦截修复 |
| **小程序 `player-library`** | ⏳ **待上传** | 代码已改好，需在微信开发者工具编译上传 |

## 必做：上传小程序

### 步骤

1. 打开微信开发者工具，加载本项目。
2. 点击「编译」，确认控制台无报错。
3. 点击「上传」，填写版本号（建议读回微信后台当前线上版本号后 +1，如 `1.1.41`）。
4. 上传后前往微信公众平台 → 管理 → 版本管理 → 提交审核（或设为体验版先测试）。
5. 审核通过后发布。

### 为什么必须上传

- 旧版小程序的 `player-library.js` 没有 `pendingJoins`、`showPendingJoin`、`applyPendingJoins` 等字段与方法。
- 旧版 `player-library.wxml` 没有「待确认入队」的模板区块。
- 云函数已返回 `pendingJoins`，但旧版小程序不消费该字段，因此页面渲染不出来。
- **只有上传新版小程序后，点击服务号通知才能看到「待确认入队」列表。**

## 验证清单（真机）

上传并发布后，按以下步骤验证：

1. 球员通过服务号 H5 提交入队申请（新登记）。
2. 球队负责人微信收到服务号模板消息「入队审核通知」。
3. **点击消息**，小程序打开 `player-library` 页面。
4. 页面顶部出现「待确认入队」卡片，显示球员姓名、号码、位置、登记方式、申请时间。
5. 同时弹出 Toast「有 1 位球员待确认入队」。
6. 点击「确认入队」→ 球员正式加入球队；点击「驳回」→ 记录驳回原因，球员保留档案可重新申请。
7. 若此时无待确认申请，点击消息进入后弹出 Toast「暂无待确认的入队申请」。

## 相关文件

- `miniprogram/pages/team/player-library/player-library.js`
- `miniprogram/pages/team/player-library/player-library.wxml`
- `cloudfunctions/getMiniWorkspace/playerRegistration.cjs`
- `cloudfunctions/getMiniWorkspace/playerJoinReview.cjs`
- `cloudfunctions/getMiniWorkspace/index.js`
- `cloudfunctions/tournamentRegistrationFlow/index.js`
