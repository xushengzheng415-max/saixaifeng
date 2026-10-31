# 球员端「赛小蜂足球世界」小程序工程

状态：2026-10-31 工程搭建完成（本地演示适配器 + 自检通过），**未上传、未发布、未接后端**。
规则依据见 [PRODUCT_RULES.md](PRODUCT_RULES.md)、决策见 [ADR.md](ADR.md)（2026-10-31）。

## 一、端口边界

| 项 | 值 |
|---|---|
| 端 | 球员端独立微信小程序（AppID `wxa0ac7d45bcabd140`） |
| 源码 | `miniprogram-world/`（与球队端 `miniprogram/` 平行，互不引用） |
| 云环境 | 业务环境 `cloud1-7g8ckb3c7815a011`（与球队端、PC、H5 共用，不建第二套数据库） |
| 开通环境 | `sxf-world-dev-d6gxotk5mc8bb7cb6`（2026-10-31 新建，空库，仅用于获得云开发权限与日后网关；PostgreSQL 体系，禁止放业务表） |
| 后端 | `webLoginApi` 新增 `cardWorld*` action 组（本期未实现） |
| 模式开关 | `config/env.js` 的 `MODE`：`local`（本地演示）/ `cloud`（`wx.cloud.callFunction`） |
| 身份 | 手机号自然人账号（`phone` / `phoneNumber` 双字段兼容），不新建用户体系 |
| 卡面 | 服从统一球员卡套件（[PLAYER_CARD_INTEGRATION.md](PLAYER_CARD_INTEGRATION.md)），不另存卡面字段 |

边界约束：

- 球员端只承载卡世界玩法（主卡、卡册、签约、组阵、轻对战、战报），不复制球队端机构工作台、赛程、报名审核和主办方能力。
- 与球队端不共享本地存储键；`sxf-world-card-state-v1` 仅属球员端演示态。
- 共用同一 `users` 账号与 CloudBase 环境；不因玩法数据建立第二套身份，也不把玩法数据写入正式赛果、榜单或球员资料。

## 二、工程结构

```text
miniprogram-world/
  app.js / app.json / app.wxss        # 深空黑 #07090F + 熔金 #E4B04A
  utils/engine.js                     # 纯函数确定性引擎（无随机）
  utils/mock.js                       # 演示数据：12 名杭州球员 + 1 名跨城
  utils/store.js                      # 本地状态、自然日配额归一、视图组装
  utils/api.js                        # 数据访问层（local / cloud 双分支，方法签名即服务端契约）
  config/env.js                       # 业务环境、开通环境、MODE 开关（local / cloud）
  components/holo-card               # 全息卡面（倾斜/眩光，40ms 节流）
  components/sign-reveal             # 签约揭晓 3D 翻面
  components/fut-pitch               # 球场四行阵型
  components/card-tabbar             # 自定义 3 入口 tabBar（无原生 tabBar）
  pages/card/{main,album-sign,lineup,battle,battle-log}
  assets/{card,pitch,icons}          # 主卡、卡背、球场 SVG、共享图标与 manifest
```

资源合计约 557KB（主卡 PNG 285KB、卡背 279KB 为演示素材，正式版应替换为已授权素材）。

## 三、确定性规则（服务端必须同构实现）

全链路不含随机数：发放、对手、胜负都由固定键 + FNV-1a 哈希决定，同入参恒等。

| 规则 | 实现 |
|---|---|
| 自然日 | `dateKeyShanghai(ms)` = UTC+8 取 `YYYY-MM-DD`，跨日重置配额 |
| 同城签约 | 按 `cityCode` 过滤 → 名册序（`rosterOrder`，缺省 `playerId`）→ 从游标起跳过已拥有 |
| 签约键 | `sc:{cityCode}:{dateKey}:{userId}:cursor:{cursor}` |
| 配额 | 普通每日 1 次、会员 2 次；定向签约单独计 `directedLeft`；不足返回 `QUOTA_EXCEEDED` |
| 编制 | 5 / 8 / 11；5 人永久免费，8/11 需解锁否则 `ROSTER_LOCKED` |
| 系统对手 | 同城取 5 人，种子 `dateKey + '|' + userId`，不重复、不含已拥有名单冲突 |
| 对战 | 键 `bt:{lineupId}:{opponentKey}:rule_v1`；比分 `clamp(round(power/100)+(h%3)-1, 0, 5)`；会员/付费不参与 |
| 战报 | 每场追加一条，保留最近 20 条 |
| 会员 | 未成年开启自动续费返回 `MINOR_NO_AUTORENEW` |

错误码枚举：`QUOTA_EXCEEDED` / `NOT_SAME_CITY` / `NO_ELIGIBLE_CARD` / `ROSTER_LOCKED` /
`LINEUP_INVALID` / `MINOR_NO_AUTORENEW` / `MODE_INVALID`。

## 四、接口映射（前端方法 → 待接 action）

| 前端（`utils/api.js`） | action | 说明 |
|---|---|---|
| `login` | `cardWorldLogin` | 微信授权 + 手机号命中自然人账号 |
| `getMainCard` | `cardWorldMainCard` | 主卡、四项能力、成长印记 |
| `getAlbum` | `cardWorldAlbum` | 卡册网格、配额文本、会员与编制状态 |
| `getOwnedCards` | `cardWorldOwnedCards` | 可选球员 chips |
| `getLineup` | `cardWorldLineup` | 阵型四行、进度、可否挑战 |
| `setRosterSize` | `cardWorldSetRosterSize` | 5/8/11，未解锁返回 `ROSTER_LOCKED` |
| `setSlot` | `cardWorldSetSlot` | 槽位换人，服务端复核归属 |
| `saveLineup` | `cardWorldSaveLineup` | 保存阵容，返回战力 |
| `battle` | `cardWorldBattle` | 服务端出结果，前端只展示；不接受上传分数 |
| `getBattleLog` | `cardWorldBattleLog` | 只读本人战报 |
| `getMembership` | `cardWorldMembership` | 资格以服务端订阅为准 |
| `setAutoRenew` | `cardWorldSetAutoRenew` | 未成年返回 `MINOR_NO_AUTORENEW` |
| `signSameCity` | `cardWorldSignSameCity` | 扣配额、写卡册，返回 `deterministicKey` |

返回契约：成功时字段与本地视图同名同结构；失败时 `{ success:false, code, error }`，前端按 `code` 抛错，页面不改。

接入要求：页面不改；服务端返回确定性结果；前端不得自判资格、卡级或胜负。

## 五、验证

```powershell
node tools/test-world-player-miniprogram.cjs   # 25 项：引擎规则 + 工程红线 + 签约→组阵→对战→战报闭环
node --check miniprogram-world/utils/engine.js # 其余 js 由自检统一执行
```

环境连通性探测（只读，不碰线上函数；用于确认 AppID 能否使用业务环境）：

```js
wx.cloud.init({ env: 'cloud1-7g8ckb3c7815a011', traceUser: false })
wx.cloud.callFunction({ name: 'cardWorldProbeNotExist' })
  .then(r => console.log('PROBE_OK', r))
  .catch(e => console.error('PROBE_ERR', e.errCode, e.errMsg))
```

判定：`FunctionName not found` = 环境可访问；`-601034 没有权限，请先开通云开发或者云托管` = 未开通或未被共享；
`env not exists` / `invalid env` = 环境 ID 或关联有误。

自检同时扫描 WXML 表达式（仅允许 `{{value}}` / `{{!value}}` / `{{a || b}}`）、
`Math.random` 零命中、四件套齐全、`usingComponents` 目标存在、图标 manifest 与资源体积。

## 六、当前状态与遗留

已完成：5 个页面 + 4 个组件 + 引擎/状态/适配层、共享 SVG 图标与 manifest、演示资源、
`config/env.js` 环境与模式开关、`utils/api.js` 的 `cloud` 分支（13 个 `cardWorld*` action 映射），
自检脚本（25/25 通过）。

未完成 / 需另行授权：

- **环境共享未确认**：AppID `wxa0ac7d45bcabd140` 调 `cloud1` 仍返回 `-601034 没有权限，请先开通云开发或者云托管`。
  2026-10-31 已新建开通环境 `sxf-world-dev-d6gxotk5mc8bb7cb6`（免费试用 6 个月，到期前需停用），
  还需：① 在开通环境里绑定该 AppID（AppSecret）；② 在 `cloud1` 所属账号的「环境设置 → 环境共享」添加该 AppID。
- 云函数 `cardWorld*` action 组未实现，`config/env.js` 仍为 `MODE='local'`。
- 未上传小程序开发版/体验版，未发布云函数，未改数据库，未推 Git 远端。
- 真机验收（全息倾斜、3D 翻面、球场布局、胶囊安全区）待做。
- 会员权益具体档位与 8/11 编制解锁方式、限定卡发放规则由平台侧另行确认后接入，球员端不自行判定。
- 演示卡面与图片素材为本地占位，正式版须替换为已授权素材。
