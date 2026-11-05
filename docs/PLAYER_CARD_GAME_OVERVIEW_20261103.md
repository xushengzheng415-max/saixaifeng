# 球员卡玩法与页面概要（截至 2026-11-03，后端 2026-11-04 更新）

> **用途**：给研发、产品、设计、运营一份可查阅的整体索引——玩法口径、代码位置、页面职责、接口与数据集合、当前完成度。
> **事实来源**：本文件中的代码与接口结论均来自正式仓库 `E:\Documents\sxf-football` 的实际文件；规则结论来自 `docs/PRODUCT_RULES.md`、`docs/ADR.md`、`docs/MEMBERSHIP_HONEY_PRICING_2026-10-27.md`。
> **维护方式**：代码改动后同步更新本页「状态」与「接口/页面」两节；产品口径变化以 `docs/PRODUCT_RULES.md` 为准，本页不另立规则。
> **重要区分**：规则「已确认」不等于代码「已实现」。本页对两者分别标注，禁止把未落地的规则当成线上能力。

---

## 一、一句话现状

球员卡目前有**两套并行实现**：服务号 H5 的「球员卡玩法」（`playerCardGame*`，有阵容/符文/教练/技能/**直播式 PK + 中场换人**），和球员端小程序「赛小蜂足球世界」的「卡世界」（`cardWorld*`，同城签约/编制/轻对战，**后端已新增直播对战 + 中场换人，前端页面待接**）。用户已确认玩法重心收敛到小程序；共享直播内核已抽出（`matchEngine.cjs`），但两套后端与集合仍互不相通。

---

## 二、端口与代码位置

| 端口 | 代码位置 | 身份凭证 | 后端入口 | 入口地址 |
|---|---|---|---|---|
| 服务号 H5 | `service-account-h5/`（根目录 + `card-world/`） | `fan_h5_sessions.serviceAccountOpenId`（微信服务号会话） | `webLoginApi` 的 `playerCardGame*` / 卡世界 action | `www.sxffootball.cn`（服务号菜单） |
| 球员端小程序「赛小蜂足球世界」 | `miniprogram-world/`，位于分支 `feature/world-player-miniprogram-20261031`（worktree `E:\Documents\sxf-football-wt-world`） | 微信登录后的 `users._id`，渠道标识 `worldOpenId` / `worldUnionId` | `webLoginApi` 的 `cardWorld*` | AppID `wxa0ac7d45bcabd140` |
| 平台运营后台 | `platform-admin-vue/`（分支 `codex/platform-ops`） | 平台运营账号 | `webLoginApi` 平台类 action | `pingtai.sxffootball.cn` |
| 共享云函数 | `cloudfunctions/webLoginApi/` | — | Node.js 18 / CloudBase `cloud1-7g8ckb3c7815a011` | — |

要点：

- 小程序源码**不在主仓当前分支**（主仓 `codex/platform-ops` 无 `miniprogram-world/`），做小程序改动必须切到上述长期分支或另开功能分支。
- 网页端零 SDK 红线只约束浏览器端（H5 / PC），小程序走 `wx.cloud.callFunction` 不受此限。
- 球员卡模板、坐标、素材、卡种由平台后台配置，三端只读取成卡，不各自绘制。

---

## 三、两条并行链路（必须先分清再动手）

| 维度 | H5「球员卡玩法」 | 小程序「卡世界」 |
|---|---|---|
| 后端文件 | `cloudfunctions/webLoginApi/playerCardGame.cjs`（工厂 `createPlayerCardGame`） | `cloudfunctions/webLoginApi/cardWorld.cjs` + `cardWorldEngine.cjs` + `cardWorldProfile.cjs`（直播内核共用 `matchEngine.cjs`） |
| action 前缀 | `playerCardGame` / 无前缀（27 个，见第八节） | 统一 `cardWorld*`（18 个） |
| 数据集合 | `player_card_game_shares` / `_collections` / `_lineups` / `_matches` / `_coaches` / `_skills` / `_runes` | `card_world_players` / `card_world_profiles` / `card_world_cards` / `card_world_matches` |
| 卡池 | 全平台已公开的球员卡（dataCenter 核定积分 + FM 属性） | 同城名册 `card_world_players`（运营维护，只读） |
| 对战形态 | 90 分钟事件流（进球/黄牌/红牌/换人），**按真实时间直播**，中场可换人 | 轻对战（一次出比分与徽章）+ **直播对战（后端已实现：逐分钟揭示、中场 20 秒可换人）** |
| 胜负算法 | 战力 → 泊松分布进球 → 事件反推比分 | `score = clamp(round(power/100) + (hash%3) - 1, 0, 5)`（**比分权威**）；直播事件由该比分派生，只做呈现 |
| 页面前端 | `service-account-h5/player-card-game.*` | `miniprogram-world/pages/card/**` |

**结论：不要把 H5 的直播/中场逻辑直接搬到小程序页面。** 两者的身份、卡池、集合、算法都不同。共享内核 `matchEngine.cjs` 已抽出，卡世界直播对战后端已按「比分权威 + 事件派生」实现（见第十三节）；前端页面只消费 `cardWorldMatch*` 的返回，不自行算分。

---

## 四、已确认玩法规则（产品口径）

### 4.1 卡来源与所有权

- 卡片**不转移所有权**。「送出」= 持卡人授权公开引用（写 `players.playerCardPublic`），可随时收回。
- 收集范围 = 全平台已公开卡（share `active` 且 `playerCardPublic === true`）。
- 赛事 / 俱乐部发放的卡走比赛与任务；卡商城只卖**收藏、展示类槽位与容量**，不卖卡本体。
- 三类卡边界：国漫虚拟卡（娱乐池 + 独立图鉴）、球迷自制卡（第一版只做展示与分享，不进 PK、不可交易）、真实球员卡（独立评估与分榜），三类不得共用榜单与 PK 池。

### 4.2 等级与战力

- 等级、积分一律取 dataCenter 服务端口径；前端传入的分数/卡级只作展示，不作判定。
- 战力优先级：FM 属性 `powerFromAttrs(attrs, slotRole, tier)` →（无属性时）卡级积分回退；再叠加符文加成、状态加成 `formBonus`、卡种固定加成（epic +3 / legendary +5）。
- 卡种：`bronze / silver / gold / epic / legendary`；积分档位 `tierOfPoints`：≥92 legendary、≥82 epic、≥76 gold、≥56 silver，其余 bronze。

### 4.3 阵容

- 人数 5 / 7 / 8 / 9 / 11（`formationCounts`），每人一个位置，位置由阵型定义；同一球员不能重复。
- 校验在服务端：持有关系（`parent_profile_submissions` + `owns()`）、位置合法性、测试数据排除、乐观锁 `version`、最多 5 套阵容（`MAX_LINEUPS = 5`）。
- 教练卡独立（`coach:` 前缀），不占球员位；卡世界另有「编制」概念（5 新人 / 8 社区 / 11 城市，8 与 11 需已解锁，否则 `ROSTER_LOCKED`）。

### 4.4 会员与容量（规则已确认）

| 档位 | 卡库容量 | 版面槽位 | 阵容套数 |
|---|---|---|---|
| 免费 | 10 | 3 | 1 |
| 基础会员 | 15 | 4 | 2 |
| 进阶会员 | 20 | 5 | 3 |
| 专业会员 | 30 | 6 | 5 |
| 家庭会员（未开放，仅定义） | 50 | 8 | 5 |

- 超额**不删除，只锁定变灰**：超出容量的卡只读，不能新增收藏/开卡包/领取新卡/切换展示；先锁非展示、非阵容在用卡；当前展示卡与阵容在用卡保留可用。
- 会员到期**立即降档锁定**，无宽限期；开会员或清理到容量内自动解锁。已启用版面保留到用户主动切换。
- 合规边界：解锁卡库容量、版面槽位（收藏/展示类）不违规；**出战阵容槽、技能卡槽、符文槽、比赛阵容槽不可售、不可由会员或蜂蜜解锁**。
- 第二套阵容起为会员权益，但只用于保存与切换；**每日 PK 总场次对所有用户同一上限**，单套阵容在自然恢复内可打满。

### 4.5 士气与伤病（规则已确认，免费）

- 士气是体力值：耗尽则该阵容**不能发起 PK**（不等于判负）；伤病针对单个球员，伤员**不能加入新阵容**。
- 二者只做出战**准入**，**不参与单场结果计算**，不改变赛果、排名与竞技统计。
- 恢复对所有用户同规则、免费；蜂蜜与会员**不得购买或加速恢复**。

### 4.6 蜂蜜消耗场景（规则已确认）

- 可用场景：AI 定制背景生成、高清导出、头像框/队徽动效等**不影响赛果**的项。
- 通用背景继续对「满 100 分或有效会员」免费，不因新增场景而缩减。
- 首次开通蜂蜜账户 10 滴；球员档案首次资料齐全且已有标准形象照再发 50 滴（按 `playerId` 幂等，不补发存量）。

### 4.7 付费合规红线（球员端小程序，写入数据模型）

1. 概率由服务端决定，禁止前端 `Math.random()` 参与付费抽取链路。
2. 每个卡包/奖池的概率、保底次数、累计消费上限必须在页面公示。
3. 每个用户/每个卡包记录累计抽取次数、保底计数与消费金额，全部交易与开奖结果写入可审计流水。
4. 未满 8 周岁禁止购买卡包；8 周岁以上需监护人验证并设金额门槛。
5. UI 术语统一「开卡 / 卡包 / 收藏」，禁用「盲盒 / 抽奖 / 博彩」。

---

## 五、H5 直播式 PK 口径（本轮最新，已实现）

### 5.1 时间线

| 项 | 值 | 说明 |
|---|---|---|
| `LIVE_SECONDS_PER_MINUTE` | 1 | 1 比赛分钟 = 1 真实秒 |
| `LIVE_FULL_MINUTE` | 90 | 计时上限 90 分钟 |
| `LIVE_HALFTIME_MINUTE` | 45 | 上半场结束点 |
| `LIVE_HALFTIME_SECONDS` | 20 | 中场休息真实秒数 |
| 全场结束 | 真实 110 秒 | 45 秒上半场 + 20 秒中场 + 45 秒下半场 |

阶段枚举：`firstHalf` / `halftime` / `secondHalf` / `fulltime`。老战绩（无 `live` 字段）一律视为已结束，不揭示、不补结算。

### 5.2 三条硬约束

1. **直播只改呈现，不改结果**：事件流仍由 `matchId` 种子一次性确定性生成并落库；直播只按分钟揭示，比分由已发生进球累加。
2. **抽卡挪到全场结束**：发起时只写战绩（`settled=false`），到点由读路径 `settleMatchIfDue` 触发，事务内二次校验 `settled` 保证幂等；平局直接标记已结算、不抽卡。
3. **中场调整不改变比分与结果**：我方上半场事件与对手全部事件原样保留，只按换人后的阵容重建我方 46–90 分钟事件，且进球数沿用原下半场进球数；写入前再逐方比对总进球与 `score`，不一致直接拒绝。

### 5.3 中场换人规则（已实现）

- 免费、**每方每场一次**；仅在 `phase === 'halftime'` 的 20 秒窗口内可操作，窗口结束自动进入下半场。
- 换上的球员必须：本人有效持有（收集或自送）、积分已核定（`counted`）、不在当前场上、非测试数据、非教练卡。
- 战力按与 PK 发起**同一个 `sideScorer`** 重算，避免两套口径漂移。
- 落库字段：`events`（含 46′ `sub` 事件，带 `out`）、`[challenger|defender]` 快照、`halftimeAdjusts[side]`、`halftimeVersion`。

### 5.4 前端表现

- 战绩列表：进行中的行显示「直播」徽章与 `N′ 进行中`；中场时显示「中场休息」。
- 直播面板：分钟、进度条、双方名字与实时比分、事件倒序流（⚽🟨🟥🔄）。
- 中场区块：倒计时 +「免费调整 1 次，不改变比分」→ 选换下槽位 → 列替补（分值）→ 换上；成功后提示并继续轮询。
- 全场结束：出胜/平/负印章、抽卡结果、`查看完整战报`（转完整战报页）。

---

## 六、小程序「赛小蜂足球世界」现状

- 页面：7 个（`pages/card/main`、`album-sign`、`lineup`、`battle`、`battle-log`、`me`、`shop`），无 `tabBar`，从「我的主卡」进入各功能。
- 后端：`cardWorld.cjs` 只做身份、配额、读写与视图组装；规则全在 `cardWorldEngine.cjs`（与 `miniprogram-world/utils/engine.js` 同源，本地 `MODE=local` 副本仅用于演示，线上只认服务端）。
- 签约：按「同城 + 名册顺序 + 游标」确定性取人，**不使用随机数发放**；配额 `freeTotal/freeUsed/directedLeft` 按上海日期切分，会员档位影响每日免费次数（`memberDailyFreeTotal`）。
- 轻对战：同一确定性键产出同一结果；会员/付费不改变胜负权重；结果含 `scoreMine/scoreOpp/result/comment/badges`，战报最多保留 20 条（`BATTLE_LOG_MAX`）。
- 会员：`tier: none|member`、`isMinor`、`autoRenew`（未成年禁止自动续费，`MINOR_NO_AUTORENEW`）。
- **缺口**：无事件流、无直播、无中场调整；无卡库容量/版面槽位/士气伤病落地。

---

## 七、页面概要

### 7.1 服务号 H5（`service-account-h5/`）

| 文件 | 标题 / 入口 | 作用 | 关键能力 | 状态 |
|---|---|---|---|---|
| `me.html` | 我的 | 个人中心入口（JS 渲染当前微信已绑定业务关系） | 跳「我的球员卡」「卡世界」「球员卡玩法」等 | 已上线 |
| `player-cards.html` | 我的球员卡 | 只读展示本人球员卡（含成卡图） | `getPlayerCard*` / dataCenter 读取 | 已上线 |
| `player-card-game.html` | 球员卡玩法 | 四个 tab：**送出 / 图鉴 / 阵容 / 对战** | 27 个 action；含直播面板与中场换人 | 本地改完，**未部署** |
| `card-world/index.html` | 赛小蜂足球世界 | 卡世界 H5：**我的主卡 / 卡册签约 / 5 人组阵** | 卡世界 H5 版（stage1-2 已发布） | 已上线 |
| `card-world/card-world.html` | 卡世界 | 重定向壳 → `index.html` | — | 已上线 |
| `card-world/meet-anim-demo.html` | 组阵动画演示 | 交互演示页 | — | 演示用 |
| `my-main-card.html` | 卡世界 | 旧版跳板页 → `card-world/index.html` | — | 历史兼容 |
| `player-card-game-demo.html` | 球员卡玩法演示 | 本地演练/联调 | — | 演示用 |

`player-card-game.html` 内部 tab 与主接口：

| tab | 页面内容 | 主接口 |
|---|---|---|
| 送出 | 我方卡列表、送出/收回、公开状态 | `getPlayerCardGameHome`、`getMyGameShares`、`publishPlayerCardShare`、`revokePlayerCardShare` |
| 图鉴 | 大厅（可收集）、我的图鉴、进度 | `listCollectiblePlayerCards`、`getMyCollectionCodex`、`collectPlayerCard` |
| 阵容 | 阵型选择、槽位、保存/删除、教练/符文/技能 | `listGameFormations`、`listMyGameLineups`、`getMyGameLineup`、`saveGameLineup`、`deleteGameLineup`、`getCoachCard`、`feedCoachCard`、`listGameRunes`、`equipGameRune`、`unequipGameRune`、`decomposeGameRune`、`listGameSkills`、`useGameSkill` |
| 对战 | 对手列表、发起 PK、战报、**直播面板 + 中场换人** | `listGameOpponents`、`challengeGameLineup`、`listMyGameMatches`、`getGameMatchDetail`、`getGameMatchLive`、`getGameMatchHalftimeOptions`、`adjustGameMatchHalftime` |

### 7.2 球员端小程序「赛小蜂足球世界」（`miniprogram-world/`）

| 页面 | 标题 | 作用 | 主接口 | 状态 |
|---|---|---|---|---|
| `pages/card/main/main` | 我的主卡 | 大卡展示、成长印记、快捷入口 | `cardWorldLogin`、`cardWorldMainCard` | 开发分支 |
| `pages/card/album-sign/album-sign` | 卡册 / 签约 | 同城名册签约、卡册网格 | `cardWorldAlbum`、`cardWorldOwnedCards`、`cardWorldSignSameCity` | 开发分支 |
| `pages/card/lineup/lineup` | 我的阵容 | 编制切换（5/8/11）、槽位选人、保存 | `cardWorldLineup`、`cardWorldSetRosterSize`、`cardWorldSetSlot`、`cardWorldSaveLineup` | 开发分支 |
| `pages/card/battle/battle` | 轻对战 | 确定性出比分 + 徽章 + 评语 | `cardWorldBattle` | 开发分支 |
| `pages/card/battle-log/battle-log` | 轻对战战报 | 最近战报（最多 20 条） | `cardWorldBattleLog` | 开发分支 |
| `pages/card/me/me` | 我的 | 会员、背景卡、卡商城、签到入口 | `cardWorldMembership`、`cardWorldSetAutoRenew` | 开发分支 |
| `pages/card/shop/shop` | 卡商城 | 槽位/容量/背景卡 | 待接 | 开发分支 |

> 小程序 WXML 只允许简单插值、简单取反、简单 `||`；所有条件与派生值必须在 `.js` 里预算成 data 字段。

### 7.3 平台运营后台（`platform-admin-vue/src/views/`）

| 文件 | 作用 |
|---|---|
| `tournament-center/PlayerCardStudio.vue` | 卡皮肤工作室：模板、版面、坐标、素材、卡种配置与发布 |
| `tournament-center/PlayerCardTemplateLibrary.vue` | 模板库（发布布局后受影响的已保存卡自动重生成并切换活动版本） |
| `tournament-center/PlayerCardScoreRules.vue` | 积分规则配置 |
| `data/PlayerCardMatchRepair.vue` | 比赛卡数据修复 |
| `data/PlayerCardIssueRepair.vue` | 发卡修复 |
| `tournament-center/TournamentCenterAdmin.vue` | 赛事中心入口，球员卡入口收敛到 `cardSkins` |

---

## 八、接口清单

### 8.1 H5 球员卡玩法（27 个，`cloudfunctions/webLoginApi/playerCardGame.cjs`）

| 分组 | action |
|---|---|
| 读 | `getPlayerCardGameHome`、`getMyGameShares`、`listCollectiblePlayerCards`、`getMyCollectionCodex`、`listGameFormations`、`listMyGameLineups`、`getMyGameLineup`、`listGameOpponents`、`listMyGameMatches`、`getGameMatchDetail`、`getGameMatchLive`、`getGameMatchHalftimeOptions`、`getCoachCard`、`listGameRunes`、`listGameSkills` |
| 写 | `publishPlayerCardShare`、`revokePlayerCardShare`、`collectPlayerCard`、`saveGameLineup`、`deleteGameLineup`、`challengeGameLineup`、`adjustGameMatchHalftime`、`feedCoachCard`、`equipGameRune`、`unequipGameRune`、`decomposeGameRune`、`useGameSkill` |

> 入口登记：以上 action 必须在 `cloudfunctions/webLoginApi/index.js` 的 switch 中显式登记；漏登会直接返回「未知操作」。（`tools/test-player-card-game.cjs` 已加静态防回退断言。）

### 8.2 小程序卡世界（18 个，`cardWorld*` 前缀，`index.js` 以 `cardWorld` 前缀统一转发到 `cardWorld.cjs`）

| action | 作用 |
|---|---|
| `cardWorldLogin` | 登录/建档（手机号主账号为准，`worldOpenId` 仅作渠道标识） |
| `cardWorldMainCard` | 我的主卡视图 |
| `cardWorldAlbum` | 卡册视图 |
| `cardWorldOwnedCards` | 已拥有卡 |
| `cardWorldLineup` | 阵容视图（编制、槽位、战力） |
| `cardWorldSetRosterSize` | 切换编制（5/8/11） |
| `cardWorldSetSlot` | 设置槽位球员 |
| `cardWorldSaveLineup` | 保存阵容（不传 `slots` 时校验并保存已存阵容，传则按前端下发重建） |
| `cardWorldSignSameCity` | 同城签约（确定性取人 + 配额） |
| `cardWorldBattle` | 轻对战（确定性结果 + 战报写入） |
| `cardWorldMatchStart` | **直播对战发起**（同账号+同对手+同日幂等，落一场 `card_world_matches`） |
| `cardWorldMatchCurrent` | **直播对战断线恢复**（不传 matchId 也拿回今日这一场，无则 `hasMatch:false`） |
| `cardWorldMatchLive` | **直播轮询**（只揭示已进行分钟，到点惰性结算） |
| `cardWorldMatchHalftimeOptions` | **中场候选**（槽位 → 本人卡册未上场球员，含同口径分值） |
| `cardWorldMatchHalftimeAdjust` | **中场换人**（免费、每场一次、比分锁定校验） |
| `cardWorldBattleLog` | 战报列表（`rows[].mode` 区分 `live_5v5` / `newbie_5v5`） |
| `cardWorldMembership` | 会员视图 |
| `cardWorldSetAutoRenew` | 自动续费开关（未成年拒绝） |

> 直播对战的入参/出参/错误码/时序见 [`docs/PLAYER_CARD_WORLD_LIVE_MATCH_API.md`](PLAYER_CARD_WORLD_LIVE_MATCH_API.md)。

### 8.3 关键错误码

| 代码 | 含义 |
|---|---|
| `PLAYER_CARD_AUTH_REQUIRED` | 未登录/会话失效 |
| `PLAYER_CARD_GAME_FORBIDDEN` | 无权访问该卡/该战绩/非本人持有 |
| `PLAYER_CARD_GAME_SCORE_PENDING` | 积分待核定，不能送出/上场 |
| `PLAYER_CARD_GAME_MATCH_FORBIDDEN` | 战绩不存在或非参与方 |
| `PLAYER_CARD_GAME_HALFTIME_CLOSED` | 中场窗口已关闭 |
| `PLAYER_CARD_GAME_HALFTIME_USED` | 本场已用过中场调整 |
| `PLAYER_CARD_GAME_CARD_PENDING` | 换上的卡积分待核定 |
| `PLAYER_CARD_GAME_INVALID` | 参数/槽位/重复球员不合法 |
| `WORLD_ACTION_UNKNOWN` | 卡世界未知 action |
| `WORLD_READ_LIMIT` / `WORLD_READ_INCOMPLETE` | 读取超限/行数不一致（禁止静默截断） |
| `WORLD_PROFILE_CONFLICT` | 档案冲突（跨端不一致） |
| `QUOTA_EXCEEDED` / `NOT_SAME_CITY` / `NO_ELIGIBLE_CARD` / `ROSTER_LOCKED` / `LINEUP_INVALID` / `MINOR_NO_AUTORENEW` | 签约与阵容业务错误 |

---

## 九、数据集合

| 集合 | 归属 | 内容 |
|---|---|---|
| `player_card_game_shares` | H5 玩法 | 送出/公开引用记录（`active` / `stale`） |
| `player_card_game_collections` | H5 玩法 | 收集关系与收集时的卡快照 |
| `player_card_game_lineups` | H5 玩法 | 阵容（owner + lineupKey，含 `version`） |
| `player_card_game_matches` | H5 玩法 | 战绩：`events`、`score`、`result`、`live`、`settled`、`steal`、`halftimeAdjusts` |
| `player_card_game_coaches` | H5 玩法 | 教练卡（等级/经验） |
| `player_card_game_skills` | H5 玩法 | 技能卡（消耗品） |
| `player_card_game_runes` | H5 玩法 | 符文（品质/属性/耐久/装备球员） |
| `card_world_players` | 卡世界 | 同城名册（运营维护，只读） |
| `card_world_profiles` | 卡世界 | 玩家档案：配额、编制、阵容、战报、会员档位 |
| `card_world_cards` | 卡世界 | 已签约卡册（含签约时球员快照） |
| `card_world_matches` | 卡世界 | **直播对战**：`events`、`score`（权威比分）、`result`、`live`、`settled`、`halftimeAdjusts`、`halftimeVersion` |

> 卡片所有权与积分仍来自 `players`、`parent_profile_submissions` 与 dataCenter 核定结果；`players.playerCardPublic` 是唯一允许直写的 `playerCard*` 字段。

---

## 十、一次 H5 直播 PK 的完整时序

```
发起  challengeGameLineup
      ├─ 校验：持有/位置/士气（待实现）/每日场次（待实现）
      ├─ 计算：sideScorer 分别算双方战力（属性优先，积分回退，符文/状态/卡种加成）
      ├─ 生成：simulateMatch 一次性产出 90 分钟事件（种子 = matchId）
      └─ 落库：score / events / result / live{startAtMs,secPerMinute,fullMinute,halftimeMinute,halftimeSeconds}
             settled=false（本场不抽卡）

轮询  getGameMatchLive（页面每 1 秒）
      ├─ 0–44′  firstHalf：只揭示已发生事件
      ├─ 45′    halftime：下发 mineSlots + halftime{canAdjust,used,remainSec}
      │        ├─ getGameMatchHalftimeOptions（选槽位 → 替补候选与分值）
      │        └─ adjustGameMatchHalftime（每方一次；只重建我方下半场，比分不变）
      ├─ 46′+   secondHalf：继续揭示
      └─ 110″  fulltime：settleMatchIfDue → 胜负 + 抽卡（幂等；平局不抽卡）
```

---

## 十一、状态：已实现 / 未实现 / 待确认

### 11.1 已实现（代码可运行）

| 能力 | 位置 |
|---|---|
| 送出/收回公开引用（幂等、写回 `playerCardPublic`） | `playerCardGame.cjs` |
| 收集大厅 / 我的图鉴 / 测试数据排除 | 同上 |
| 阵容保存/删除（持有校验、阵型校验、乐观锁、最多 5 套） | 同上 |
| 战力计算（属性优先 + 积分回退 + 符文 + 状态 + 卡种） | `sideScorer` / `powerFromAttrs` |
| 教练卡、符文（耐久）、技能卡 | 同上 |
| PK 发起：确定性事件流、比分反推、同日窗口幂等、双方视角互反 | `challenge` / `simulateMatch` |
| 直播揭示 + 全场结算抽卡（读路径惰性、事务幂等、老战绩不补） | `liveProgressOf` / `settleMatchIfDue` |
| 中场免费换人（每方一次、不改比分、同一计分器） | `getHalftimeOptions` / `adjustHalftime` / `rebuildSideSecondHalf` |
| 卡世界：登录建档、同城签约、编制/槽位/阵容、轻对战、战报、会员档位、自动续费 | `cardWorld.cjs` / `cardWorldEngine.cjs` |
| **卡世界直播对战（后端）**：发起/恢复/轮询/中场候选/中场换人、读路径惰性结算只写战报 | `cardWorld.cjs` + `matchEngine.cjs`（接口契约见 `docs/PLAYER_CARD_WORLD_LIVE_MATCH_API.md`） |
| 共享直播内核（H5 与卡世界共用，禁止各端再写一套） | `matchEngine.cjs`（`liveProgressOf` / `liveSnapshotOf` / `rebuildSideSecondHalf` / `buildEventStream`） |

### 11.2 未实现（规则已确认，代码未落地）

| 项 | 说明 |
|---|---|
| 会员卡库容量 10/15/20/30/50 与超额锁定变灰 | 无容量字段、无锁定逻辑 |
| 版面槽位 3/4/5/6/8 与到期锁定 | 无槽位字段与校验 |
| 阵容套数按会员 1/2/3/5/5 | 当前固定 `MAX_LINEUPS = 5`，未按会员限制 |
| 士气（体力耗尽锁定 PK）与伤病（伤员不可入队） | 无 `morale` / `injury` 字段与准入校验 |
| 蜂蜜消耗入口（AI 定制背景、高清导出、头像框动效） | `honeyWallet.cjs` / `honeyBonus.cjs` 已有账户与流水，玩法侧未接 |
| 每日 PK 总场次上限（建议 10 场） | 未实现；需同时把 `BOT_TARGET` 6 扩到 12 以凑够对手 |
| 小程序直播式对战的**页面**（直播面板/中场换人 UI） | 后端接口已实现（`cardWorldMatch*`），页面尚未接入，由 codex 实现 |

### 11.3 待确认

- 小程序里是**替换**现有轻对战，还是**新增「直播 PK」入口**（保留轻对战）。
- H5 的 `playerCardGame` 在收敛后保留多久、是否标记为旧版。
- 扩容包/槽位定价；士气与伤病的具体数值与恢复时长（只做准入的结构已确认）。
- 每日 PK 场次上限具体值。
- 限定卡与任务产出是否计成就分；比赛卡发放条件。

---

## 十二、验证与发布状态（2026-11-03）

| 项 | 状态 |
|---|---|
| `node --check`：`playerCardGame.cjs`、`index.js`、H5 JS、测试 | 通过 |
| `node tools/test-player-card-game.cjs` | PASS（含直播揭示、中场换人、比分不变、到点结算、老战绩不补、入口防回退） |
| `node tools/test-card-world-match.cjs` | PASS（卡世界直播：发起/断线恢复/逐分钟揭示/中场候选（含门将位只给门将）/换人/比分锁定/结算幂等/越权/未登录） |
| `webLoginApi` 部署 | **未部署**（卡世界直播 5 个 action 线上尚不存在） |
| H5 静态托管 | **未部署**（资源版本 `?v=20261103-live2`） |
| 小程序上传/体验版 | **未上传**（页面由 codex 实现后另行上传） |
| Git 提交/推送 | **未提交** |

---

## 十三、收敛计划（把玩法收到「赛小蜂足球世界」小程序）

1. **抽共享引擎**（✅ 已完成 2026-11-04）：`cloudfunctions/webLoginApi/matchEngine.cjs` 导出 `liveProgressOf`、`liveSnapshotOf`、`rebuildSideSecondHalf`、`buildEventStream`、`seededRand`/`poisson`/`roleWeight` 与 `LIVE_*` 常量，H5 与卡世界都调用它；`playerCardGame.cjs` 已删除本地副本，回归 PASS。
2. **卡世界新增直播模式 action**（✅ 后端已完成 2026-11-04）：`cardWorldMatchStart` / `cardWorldMatchCurrent` / `cardWorldMatchLive` / `cardWorldMatchHalftimeOptions` / `cardWorldMatchHalftimeAdjust`，落 `card_world_matches`；比分由 `battleResult` 权威给出、事件只做呈现；中场只重排我方下半场、不改比分；到点只写战报、不抽卡（卡世界无资产转移）。
3. **小程序页面**（待 codex）：`battle` 页改为直播面板（分钟/进度/事件流/比分），中场 20 秒内出换人入口；条件与派生值全部在 `.js` 预算，严守 WXML 三条限制。接口契约见 `docs/PLAYER_CARD_WORLD_LIVE_MATCH_API.md`。
4. **配额与合规**：每日总场次对所有用户同一上限；会员只影响收藏/展示类容量，不影响出战与胜负权重。
5. **落地后**：H5 那套按用户决定保留或标记旧版；两端共用同一引擎后再谈卡库容量、版面槽位、士气伤病的实现。

---

## 十四、相关文档索引

| 文档 | 内容 |
|---|---|
| `docs/PRODUCT_RULES.md` | 产品规则总本（会员/容量/蜂蜜/三类卡边界） |
| `docs/ADR.md` | 决策记录（2026-11-03 直播式 PK 与中场调整、2026-11-02 会员容量与版面槽位） |
| `docs/CURRENT_STATUS.md` | 当前进度与发布状态 |
| `docs/MEMBERSHIP_HONEY_PRICING_2026-10-27.md` | 会员与蜂蜜定价矩阵 |
| `docs/PLAYER_CARD_INTEGRATION.md` | 球员卡套件接入规范（页面只接统一读取接口） |
| `docs/PLAYER_CARD_WORLD_LIVE_MATCH_API.md` | **卡世界直播对战 5 个 action 的后端契约（前端对接入口）** |
| `docs/PLAYER_CARD_EDITOR_HANDOFF.md` | 卡面编辑器交接 |
| `docs/data-center/PLAYER_CARD_POINTS.md` | 球员卡积分口径 |
| `docs/data-center/README.md`、`CONTRACT.md`、`INTEGRATION.md` | 数据中心统一基准（身份、指标、完整度、数据版本） |
| `docs/releases/card-world-h5-stage12-20261101.md` | 卡世界 H5 一期发布记录 |
| `docs/PLATFORM_OPS_RELEASE.md` | 平台运营后台独立发布流程 |
| `tools/test-player-card-game.cjs` | 玩法回归测试（可直接 `node` 跑） |
