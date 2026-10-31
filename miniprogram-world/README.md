# 赛小蜂足球世界 · 球员端小程序（`miniprogram-world/`）

独立 AppID 的球员端卡世界小程序工程，与球队端 `miniprogram/`（AppID `wx57164cca8676f411`）平行维护，
不共享页面、不复用对方的 tabBar 或本地存储。

| 项 | 值 |
|---|---|
| AppID | `wxa0ac7d45bcabd140`（赛小蜂足球世界 · 球员端） |
| 工程目录 | `miniprogram-world/` |
| 业务云环境 | `cloud1-7g8ckb3c7815a011`（与球队端、PC、H5 共用同一环境，不建第二套数据库） |
| 开通环境 | `sxf-world-dev-d6gxotk5mc8bb7cb6`（2026-10-31 新建的空环境，只用于获得云开发权限；PostgreSQL 体系，禁止放业务表） |
| 后端入口 | `webLoginApi` 新增 `cardWorld*` action 组（本期未实现，见下文「后端待接」） |
| 视觉 | 深空黑 + 熔金卡牌；共享图标见 `assets/icons/manifest.json` |
| 当前状态 | `config/env.js` `MODE = 'local'` 跑通闭环；`cloud` 分支已写好，待后端与环境共享就绪后切换 |

## 玩法口径（2026-10-31，用户已确认）

- 同城**确定性签约**：按城市名册游标取人，不随机、不概率；跳过已拥有球员。
- 无开包 / 无概率抽取 / 无蜂蜜充值；球员卡不可交易、不可转赠。
- 5 人新手场**永久免费**；8 人（社区）、11 人（城市）需解锁，未解锁返回 `ROSTER_LOCKED`。
- 每日免费签约次数：普通账号 1 次，会员 2 次；定向签约单独计数 `directedLeft`；按 Asia/Shanghai 自然日重置。
- 会员 / 付费不参与对战出分；未成年不能开启自动续费（`MINOR_NO_AUTORENEW`）。
- 轻对战为 5v5 演示性质，结果由固定键 `bt:{lineupId}:{opponentKey}:rule_v1` 决定，同阵容同对手结果恒等，不改正式赛果与榜单。

规则文本见 [`docs/PRODUCT_RULES.md`](../docs/PRODUCT_RULES.md)、工程说明见
[`docs/WORLD_PLAYER_MINIPROGRAM.md`](../docs/WORLD_PLAYER_MINIPROGRAM.md)、决策见
[`docs/ADR.md`](../docs/ADR.md)（2026-10-31）。

## 页面结构

| 路由 | 用途 |
|---|---|
| `pages/card/main/main` | 主卡：全息卡面（倾斜/眩光）、能力四项、成长印记、快捷入口、分享 |
| `pages/card/album-sign/album-sign` | 同城签约面板 + 会员与编制面板 + 卡册网格 + 签约揭晓 |
| `pages/card/lineup/lineup` | 5/8/11 编制切换、球场四行阵型、保存与发起轻对战 |
| `pages/card/battle/battle` | VS 页与战报结果页（比分、评论、复现键、分享） |
| `pages/card/battle-log/battle-log` | 战报列表（最多 20 条，超出丢弃最旧） |

无原生 tabBar，使用自定义组件 `components/card-tabbar`（3 个入口，`wx.redirectTo` 切换）。
其余组件：`holo-card`（全息卡）、`sign-reveal`（签约揭晓 3D 翻面）、`fut-pitch`（球场阵型）。

## 本地运行

1. 微信开发者工具「导入项目」→ 目录选 `miniprogram-world/`，AppID 用 `wxa0ac7d45bcabd140`。
2. 无需配置云开发即可运行：`utils/api.js` 默认走 `utils/store.js` 本地状态。
3. 演示态初始为 4 张已拥有卡（`p_1001` 前锋 / `p_1007` 右中场 / `p_1003` 中卫 / `p_1004` 门将），
   左中场留 1 个空位，正好用当日 1 次免费签约补齐。

重置演示态（控制台或「清缓存 → 清除数据存储」等效）：

```js
wx.removeStorageSync('sxf-world-card-state-v1')
```

签约/签约次数/阵容/战报都写在该键下，状态版本 `STATE_VERSION = 1`，结构变化时同步迁移 `utils/store.js` 的 `mergeState`。

## 云开发环境与模式切换

配置集中在 `config/env.js`：

| 常量 | 值 | 用途 |
|---|---|---|
| `BUSINESS_ENV` | `cloud1-7g8ckb3c7815a011` | 唯一业务数据源（users / players / 赛事），共用 |
| `DEV_ENV` | `sxf-world-dev-d6gxotk5mc8bb7cb6` | 新 AppID 的开通环境（空库，仅作权限凭证/日后网关） |
| `CLOUD_FUNCTION` | `webLoginApi` | `cloud` 模式调用的云函数 |
| `MODE` | `local` / `cloud` | `local` 走 `utils/store.js`；`cloud` 走 `wx.cloud.callFunction` |

切到 `cloud` 前置条件（缺一不可）：

1. AppID `wxa0ac7d45bcabd140` 能在 `BUSINESS_ENV` 上调用云函数（环境共享/微信小程序关联已完成）；
2. `webLoginApi` 已部署 `cardWorld*` action 组；
3. 服务端返回结构与本地视图同构（见下表契约）。

环境连通性探测（只读，不碰任何线上函数）：

```js
wx.cloud.init({ env: 'cloud1-7g8ckb3c7815a011', traceUser: false })
wx.cloud.callFunction({ name: 'cardWorldProbeNotExist' })
  .then(r => console.log('PROBE_OK', r))
  .catch(e => console.error('PROBE_ERR', e.errCode, e.errMsg))
```

- `FunctionName not found` → 环境可访问，只差函数；
- `-601034 没有权限，请先开通云开发或者云托管` → AppID 未开通云开发或未被共享；
- `env not exists` / `invalid env` → 环境 ID 或关联有误。

## 自检

```powershell
cd E:\Documents\sxf-football-wt-world
node tools/test-world-player-miniprogram.cjs
```

脚本覆盖：UTC+8 日期键、签约确定性与游标、跳已拥有、配额与跨日重置、定向筛选、跨城/无可用、
阵容校验（空位/重复/缺门将/8-11 锁定）、系统对手确定性、对战同键同结果、会员不影响出分、
未成年续费阻断、战报截断、WXML 表达式红线、`node --check`、零 `Math.random`、资源体积，
以及「签约 → 上阵 → 对战 → 战报」闭环。

## 后端待接

`utils/api.js` 的方法签名即服务端契约，接入时只换实现、页面不改：

| 前端方法 | action | 说明 |
|---|---|---|
| `login` | `cardWorldLogin` | 微信授权 + 手机号命中自然人账号 |
| `getMainCard` | `cardWorldMainCard` | 主卡、四项能力、成长印记 |
| `getAlbum` | `cardWorldAlbum` | 卡册网格、配额文本、会员与编制状态 |
| `getOwnedCards` | `cardWorldOwnedCards` | 可选球员 chips |
| `getLineup` | `cardWorldLineup` | 阵型四行、进度、可否挑战 |
| `setRosterSize` | `cardWorldSetRosterSize` | 5/8/11，未解锁返回 `ROSTER_LOCKED` |
| `setSlot` | `cardWorldSetSlot` | 槽位换人，服务端复核归属 |
| `saveLineup` | `cardWorldSaveLineup` | 保存阵容，返回战力 |
| `battle` | `cardWorldBattle` | 服务端出比分与复现键 |
| `getBattleLog` | `cardWorldBattleLog` | 只读本人战报 |
| `getMembership` | `cardWorldMembership` | 档位、日签次数、编制解锁 |
| `setAutoRenew` | `cardWorldSetAutoRenew` | 未成年返回 `MINOR_NO_AUTORENEW` |
| `signSameCity` | `cardWorldSignSameCity` | 扣配额、写卡册，返回 `deterministicKey` |

返回契约：成功时结果字段与本地视图同名同结构（扁平），失败时返回 `{ success:false, code, error }`，
前端按 `code` 抛错，页面无需改动。

接入红线：

- 签约、对手、胜负、卡级与资格一律由服务端确定性计算；前端不得上传分数、卡级或自判资格。
- 身份沿用手机号自然人账号（`phone` / `phoneNumber` 双字段兼容），不新建第二套用户体系。
- 卡面数据服从统一球员卡接口（`docs/PLAYER_CARD_INTEGRATION.md`），不在球员端另存一套卡面字段。
- 会员与付费资格以服务端订阅为准，前端只展示。

## 不发版说明

本期交付为源码工程 + 自检，未上传小程序开发版、未发布云函数、未改数据库。
上传/发版与云函数发布须另行授权。
