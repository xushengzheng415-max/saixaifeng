# 球员端小程序「赛小蜂足球世界」· 卡世界直播对战后端接口（2026-11-04）

> 面向：负责 `miniprogram-world/` 前端的同学（本轮由 codex 实现页面）。
> 本文只描述**已按此实现的云函数接口**，页面样式与交互由前端自行决定，但下列字段、时序与错误码必须按本文消费。
>
> 代码位置：`cloudfunctions/webLoginApi/matchEngine.cjs`（共享直播内核）、`cloudfunctions/webLoginApi/cardWorld.cjs`（action 实现）。
> 状态：**本地已实现并通过回归；未部署**。线上 `webLoginApi` 还没有这些 action，部署需单独授权。

---

## 一、结论（前端只需记住五件事）

1. 直播对战是**新的 5 个 action**，全部走已有的 `cardWorld*` 前缀转发，不需要新云函数、不需要新集合创建接口。
2. **比分由服务端权威给出**：终场前只返回「已发生事件」累计的 `score`，终场后才给 `finalScore` / `result`。前端**禁止**自己算比分、胜负或抽卡。
3. 时间线固定：**1 比赛分钟 = 1 真实秒**，0–44′ 上半场，45′ 起 **20 秒中场**，46–90′ 下半场，**第 110 秒**全场结束。
4. 中场调整**免费、每方每场一次、不改变最终比分**：服务端只重排我方下半场事件，比分锁定校验失败会返回 `WORLD_MATCH_SCORE_LOCKED`（正常不会出现）。
5. 直播结束**只写战报，不抽卡、不发卡、不转移资产**。

---

## 二、调用方式与身份

沿用卡世界既有链路（`miniprogram-world/utils/api.js` 的 `callCloud`）：

```js
wx.cloud.callFunction({
  name: 'webLoginApi',
  data: { action: 'cardWorldMatchStart' },
  success: res => { /* res.result 即下方 payload */ }
})
```

- `action` 必须是 `index.js` 里 `cardWorld` 前缀统一转发的字符串，本文件列出的 5 个均已注册。
- 身份解析复用 `withWorld`：先调 `cardWorldLogin` 建立会话，后续请求携带 `authToken` / `serviceSessionToken` / `phoneCode` / `worldOpenId` 任一渠道；未解析到自然人账号时统一返回 `WORLD_LOGIN_REQUIRED`。
- 服务端仍会拒绝非球员端 AppID 调用（`WORLD_APP_DENIED`），前端不要用其它小程序的 openid 登录态调用本组接口。
- 前端**不得**上传比分、卡级、对手、事件、开始时间；这些一律由服务端按确定性种子生成。

---

## 三、前置条件（不满足时的错误码）

| 条件 | 不满足时 |
|---|---|
| 已登录并已建档（`cardWorldLogin`） | `WORLD_LOGIN_REQUIRED` / `WORLD_PROFILE_FAILED` |
| 编制为 5 人新手场（`rosterSize === 5`） | `ROSTER_LOCKED`（本期只开放 5 人） |
| 同城名册 `card_world_players` 已配置 | `WORLD_POOL_MISSING` |
| 阵容满编且合规（无空位、门将位必须是 GK、只能用本人卡册内的卡、不可重复） | `LINEUP_INVALID` |
| 同城名册人数够组对手 | `WORLD_OPPONENT_MISSING` |

> 阵容保存 `cardWorldSaveLineup` 的兼容行为：**不传 `slots` 时校验并保存服务端已存的阵容**（小程序现有「保存阵容」按钮就是这种用法）；传 `slots` 时按前端下发重建。两条路径都过同一个 `validateLineup`。

---

## 四、action 清单

| # | action | 入参 | 作用 |
|---|---|---|---|
| 1 | `cardWorldMatchStart` | 无 | 发起今日直播对战；**幂等**：同账号 + 同对手 + 同自然日永远是同一场，重复调用只返回当前进度 |
| 2 | `cardWorldMatchCurrent` | 无 | **断线恢复**：不传 `matchId` 也能拿回今日这一场；没有则 `hasMatch:false` |
| 3 | `cardWorldMatchLive` | `{ matchId }` | 逐秒轮询；只揭示已进行分钟的事件；到点自动结算 |
| 4 | `cardWorldMatchHalftimeOptions` | `{ matchId, slotIndex? }` | 中场候选：不传 `slotIndex` 只看槽位，传了返回该槽位的替补候选 |
| 5 | `cardWorldMatchHalftimeAdjust` | `{ matchId, slotIndex, playerId }` | 中场换人（每方一次），返回换人后的完整直播 payload |

### 4.1 时间线与状态机

```
第 0 秒      → phase = firstHalf   minute 0
第 0–44 秒   → phase = firstHalf   minute 0..44     只揭示 ≤ minute 的事件
第 45 秒      → phase = halftime   minute 45        可调整窗口开始（halftimeRemainSec ≤ 20）
第 65 秒      → phase = secondHalf minute 46        调整窗口关闭
第 109 秒     → phase = secondHalf minute 90
第 110 秒     → phase = fulltime   minute 90        结算：finalScore / result / settled=true
```

- `live.progress` 是 0–1 的进度值，可直接用于进度条，但**百分比字符串要在 `.js` 里预计算**。
- `live.inProgress` 为 `false` 表示已终场（等价于 `phase === 'fulltime'`）。
- 中场换人后 `events` 会由服务端**整体重排**：前端必须用返回的 `events` 整段替换，不能自行拼接或被换下球员的旧事件。
- 换人当天写入一条 `minute = 46`、`type = 'sub'`、`side = 'challenger'`、`player = 换上球员名`、`out = 换下球员名` 的事件。

### 4.2 轮询与恢复

- 建议 **1 秒**轮询一次 `cardWorldMatchLive`（与 1 分钟=1 秒的口径一致），页面 `onHide` 停止、`onShow` 用 `cardWorldMatchCurrent` 重新对齐。
- `matchId` **不要持久化**：用 `cardWorldMatchCurrent` 恢复，服务端按「今日 + 当前账号」重算同一场。
- `cardWorldBattleLog` 与 `cardWorldMatchLive` 都是读路径**惰性结算**：到点未结算的场次会在这次读取时补结算并写战报（事务内二次校验 `settled`，重复读不会写两条）。

---

## 五、返回字段（直播 payload）

`cardWorldMatchStart` / `cardWorldMatchCurrent`（`hasMatch:true` 时）/ `cardWorldMatchLive` / `cardWorldMatchHalftimeAdjust` 都返回同一结构：

| 字段 | 类型 | 说明 |
|---|---|---|
| `success` | bool | 恒为 `true`（失败走 `success:false` + `code`） |
| `matchId` | string | 本场编号，后续轮询与换人都用它 |
| `mode` | string | 固定 `live_5v5` |
| `opponentLabel` | string | 对手名（系统对手） |
| `live.inProgress` | bool | 是否进行中 |
| `live.phase` | string | `firstHalf` / `halftime` / `secondHalf` / `fulltime` |
| `live.minute` | number | 已进行到的比赛分钟（0–90） |
| `live.fullMinute` | number | 固定 90 |
| `live.halftimeMinute` | number | 固定 45 |
| `live.progress` | number | 0–1 |
| `live.secPerMinute` | number | 固定 1（1 分钟 = 1 秒） |
| `live.halftimeRemainSec` | number | 中场剩余秒数；非中场为 0 |
| `score.mine` / `score.opponent` | number | **已揭示比分**（终场前小于等于最终比分） |
| `events[]` | array | 已揭示事件，见 5.1 |
| `myPower` / `oppPower` | number | 双方阵容战力（与阵容页 `lineupPower` 同口径） |
| `mineSlots[]` | array | 我方槽位，见 5.2 |
| `halftime.canAdjust` | bool | 当前是否可调整（中场内且本场未用过） |
| `halftime.used` | bool | 本场是否已用过调整 |
| `halftime.remainSec` | number | 中场剩余秒数 |
| `finalScore` | object \| null | 终场后 `{ mine, opponent }`，终场前为 `null` |
| `result` | string | 终场后 `win` / `lose` / `draw`，终场前为 `''` |
| `resultText` | string | 终场后 `胜` / `负` / `平`，终场前为 `''` |
| `comment` | string | 终场后的战报点评 |
| `badges[]` | array | 终场后的标签（可能为空） |
| `settled` | bool | 是否已写战报 |
| `hasMatch` | bool | 仅 `cardWorldMatchCurrent` 返回 |

### 5.1 事件项

```json
{ "minute": 23, "type": "goal", "side": "challenger", "mine": true, "player": "前锋己", "out": "" }
```

| 字段 | 说明 |
|---|---|
| `minute` | 比赛分钟 |
| `type` | `goal` 进球 / `yellow` 黄牌 / `red` 红牌 / `sub` 换人 |
| `side` | `challenger`（我方） / `defender`（对手），仅供排查，页面请用 `mine` |
| `mine` | `true` 表示我方事件，`false` 表示对手事件 |
| `player` | 事件球员名（换人时为换上球员） |
| `out` | 仅换人事件可能有值（换下球员）；系统生成的换人事件为空字符串 |

> 比分严格等于已揭示 `goal` 事件数，`mine` 为 `true` 的计入 `score.mine`，其余计入 `score.opponent`。

### 5.2 槽位项（`mineSlots` / `halftimeOptions.slots`）

| 字段 | 说明 |
|---|---|
| `index` | 槽位序号（换人时回传给 `slotIndex`） |
| `slotKey` | 编制模板键：`fw` / `lm` / `rm` / `cb` / `gk`（顺序与阵容页一致） |
| `group` | 位置组 `FW` / `MF` / `DF` / `GK` |
| `groupText` | 中文位置名 |
| `playerId` / `name` / `number` | 球员标识与展示 |
| `points` | 该槽位战力（球员 `ovr`，位置匹配再 +6，与阵容页同口径） |

### 5.3 中场候选（`cardWorldMatchHalftimeOptions`）

```js
// 不传 slotIndex
{ success: true, matchId, halftime: { canAdjust: true, used: false, remainSec: 18 },
  slots: [...], slotIndex: null, bench: [] }

// 传 slotIndex = 0
{ success: true, matchId, halftime: {...},
  slots: [...], slotIndex: 0, slotText: '前锋',
  bench: [{ playerId, name, number, group, groupText, points, mismatch }] }
```

- `bench` = 本人卡册中**不在场上**的球员，最多 20 条；`mismatch:true` 表示位置组与该槽位不匹配（`points` 不含 +6）。
- **门将位（`group === 'GK'`）只返回门将候选**，与 `validateLineup` 的「门将位只能安排门将」一致。
- 候选按 `points` 降序，前端可直接按序渲染，不必再算分。
- 换人**失败不消耗本场唯一机会**：只有成功换人才写 `halftime.used = true`（被拒后可继续在中场窗口内重试）。

### 5.4 换人结果额外字段

`cardWorldMatchHalftimeAdjust` 在直播 payload 之上追加：

```js
adjust: { slotIndex: 0, playerId: 'p6', playerName: '前锋己', outName: '前锋戊' }
```

---

## 六、错误码

| 代码 | 触发场景 | 前端建议 |
|---|---|---|
| `WORLD_LOGIN_REQUIRED` | 未登录/会话失效 | 回登录页 |
| `WORLD_APP_DENIED` | 非球员端小程序 AppID | 阻断并上报 |
| `ROSTER_LOCKED` | 编制不是 5 人 | 提示本期只开放 5 人新手场 |
| `WORLD_POOL_MISSING` / `WORLD_OPPONENT_MISSING` | 同城名册未配置/人数不足 | 提示稍后再试 |
| `LINEUP_INVALID` | 阵容有空位/门将位非 GK/用了非本人卡/重复 | 回阵容页补齐 |
| `WORLD_MATCH_INVALID` | 缺少 `matchId`，或 `slotIndex`/`playerId` 非法 | 修正参数，属前端 bug |
| `WORLD_MATCH_NOT_FOUND` | 比赛不存在或已清理 | 用 `cardWorldMatchCurrent` 重对齐 |
| `WORLD_MATCH_FORBIDDEN` | 不是本场参与方 | 阻断（不要重试） |
| `WORLD_MATCH_HALFTIME_USED` | 本场已用过中场调整 | 隐藏换人入口，只展示倒计时 |
| `WORLD_MATCH_HALFTIME_CLOSED` | 不在中场（上半场/下半场/已结束） | 隐藏换人入口 |
| `WORLD_MATCH_PLAYER_UNAVAILABLE` | 换上的球员已在场上/不在本人卡册/名册不存在/门将位换了非门将 | 刷新候选列表 |
| `WORLD_MATCH_SCORE_LOCKED` | 服务端自检发现调整会改比分 | 正常不应出现；按失败提示并上报 |
| `WORLD_MATCH_ERROR` | 事务写入失败，或战绩读取发生真实错误（非「文档不存在」） | 允许重试一次；重试仍失败上报 |
| `WORLD_SERVER_ERROR` | 其它服务端异常 | 提示稍后重试 |

---

## 七、前端实现要点（与 WXML 限制对齐）

1. **WXML 只允许简单插值 / 取反 / `||`**：`phase` 判断、`canAdjust`、倒计时文案、事件图标、进度条宽度、胜负文案全部在 `.js` 预算成 data 字段。参考：

   ```js
   // .js 里预计算
   this.setData({
     phaseText: phase === 'halftime' ? '中场休息' : (phase === 'fulltime' ? '全场结束' : minute + '′'),
     progressWidth: Math.round(progress * 100) + '%',
     showHalftime: halftime.canAdjust === true,
     halftimeCountdown: '剩余 ' + halftime.remainSec + ' 秒'
   })
   ```

2. **不要每秒重建整棵事件列表**：事件只增不减（除换人那一次被整体替换），按 `events.length` 增量追加，换人后用返回的整段覆盖。
3. **换人必须整段替换 `events` 与 `mineSlots`**，否则页面会残留被换下球员的下半场事件。
4. **终场前不要显示胜负与比分结论**：`finalScore` / `result` / `resultText` / `comment` / `badges` 终场前都是空值，页面据此隐藏战绩模块。
5. **战报列表**（`cardWorldBattleLog`）新增了 `mode` 字段：本组接口写入的战报为 `live_5v5`，旧轻对战为 `newbie_5v5`。需要区分展示时用它，`rows` 其它字段（`scoreText` / `resultText` / `opponentText` / `timeText`）不变。
6. **不抽卡**：直播结束后只有战报，没有卡片发放；页面不要出现「抽卡」入口。
7. **中场窗口只有 20 秒**：进入 `halftime` 时若 `canAdjust` 为 `true` 就立刻亮出换人入口并显示 `remainSec` 倒计时；到 0 后前端自行收起，再提交会得到 `WORLD_MATCH_HALFTIME_CLOSED`。
8. **门将位不要给非门将候选**：服务端已只返回门将，硬提交非门将会得到 `WORLD_MATCH_PLAYER_UNAVAILABLE`；被拒的提交不消耗本场唯一一次机会，可继续在中场窗口内重试。

---

## 八、与服务端实现位置的对应关系

| 前端看到的行为 | 服务端实现 |
|---|---|
| 比分权威、事件只做呈现 | `cardWorldEngine.battleResult` 先出分，`matchEngine.buildEventStream` 再派生事件 |
| 同账号同日同一场 | `matchIdOf(userId, opponentId, dayKey)`（`cwmm_` + sha256 前 24 位） |
| 只揭示已进行分钟 | `matchEngine.liveSnapshotOf` 按 `minute` 过滤 |
| 中场暂停 20 秒 | `matchEngine.liveProgressOf` 三段推进 |
| 换人不改比分 | `matchEngine.rebuildSideSecondHalf`（进球数沿用原下半场）+ 总分自检 |
| 到点结算幂等 | `settleMatchIfDue` 事务内二次校验 `settled` |
| 不抽卡 | 结算只写 `card_world_profiles.battleLog` 与 `card_world_matches.settled` |
| 比赛归属字段 | `card_world_matches.challengerUserId` 存**自然人账号 ID**（不是小程序 openid），前端无需关心 |

---

## 九、相关文档

| 文档 | 内容 |
|---|---|
| `docs/PLAYER_CARD_GAME_OVERVIEW_20261103.md` | 玩法全景、页面概要、接口/集合清单、状态三分 |
| `docs/PRODUCT_RULES.md` | 产品规则总本（免费/付费边界、会员容量、士气伤病） |
| `cloudfunctions/webLoginApi/matchEngine.cjs` | 共享直播内核（H5 与卡世界共用，禁止各端再写一套） |
| `tools/test-card-world-match.cjs` | 本组接口的回归用例（发起/揭示/中场换人/比分锁定/结算/越权） |
