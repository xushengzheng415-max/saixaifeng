# 阵型模板统一方案

> 状态：**方案已确认；第一阶段（坐标真源 + 运营后台编辑器）代码已备，`webLoginApi` 已差量上线并写入 26 套种子；前端未部署、未提交、未推送**。
> 首次勘查：2026-11-07；决策确认与一期落地：2026-11-07。
> 勘查范围：`web-admin-vue`、`miniprogram`、`service-account-h5`、`cloudfunctions`、`web-admin-vue/public`、git 全历史（含已删除文件）
> 触发问题：「阵型设计的很乱，要不要再做手机版竖版阵型编辑器，编辑完把坐标发给你调整；阵型编辑器放运营后台是否更好」

---

## 〇、结论先行

1. **现在到底有几套坐标来源**：**有效渲染坐标 4 套**（PC 半场百分比、小程序竖版换轴派生、`packageA` 独立竖版表、战术板自由点位），另有 **2 份已失效或仅供手工用的坐标副本**（阵型设计器内嵌表、小程序 `formation-data.js` 手写值），合计 **6 份坐标数据**。
2. **阵型 ID / 角色序列另有 3 套**：PC/小程序的 23 套阵型 JSON、服务端 `LINEUP_FORMATION_SLOTS`、`packageA/pages/lineup` 内嵌的 5 套。
3. **历史阵型编辑器还在，且可复用**：`web-admin-vue/public/formation-designer.html`（39KB，仍在仓库里，运营后台导航里挂着入口）。它的拖拽 + `px→百分比` 换算逻辑可直接复用；但它内嵌的坐标表已经和 `formation-data.json` 漂移，且产出方式是"复制文本手工粘贴"，不能继续用。
4. **不建议做手机版竖版编辑器**。竖版不是新数据，是同一套横版百分比坐标的 90° 旋转 + 容器比例适配；现在竖版"乱"是因为三处各写了一份换算，而不是缺一个手机编辑器。编辑器低频、全端生效，放运营后台（PC）更合适——但不该做成又一个"导出文本"的工具，而应直接写库并版本化。
5. 数据层面**坐标从未入库**：`matches.lineups` / `match_lineup_snapshots` 只存阵型字符串和位置码。所以统一坐标模型**不会影响任何已审核名单快照**，这是本方案风险最低的切入点。

---

## 一、现状盘点

### 1.1 坐标来源总表

单位说明：均为**百分比**（0–100），没有一处用 px 作为持久坐标；px/rpx 只用于点位与球员卡的**显示尺寸**。

| # | 位置 | 数据/算法来源 | 坐标语义 | 基准容器 | 是否生效 | 备注 |
|---|---|---|---|---|---|---|
| A | PC 双队阵容编辑器 | [VisualLineupEditor.vue](file:///e:/Documents/sxf-football/web-admin-vue/src/views/tournament/VisualLineupEditor.vue#L235-L280) + [formation-data.json](file:///e:/Documents/sxf-football/web-admin-vue/src/data/formation-data.json) | `x`=纵深（10→80），`y`=横向（10→90） | `.field-boundary`（容器内缩 7%/5%/86%/90%） | **生效** | 主队 `left=pos.x*0.5`；客队 `left=50+pos.x*0.5`，`y` **不镜像** |
| B | PC 阵型设计器（独立 HTML） | [formation-designer.html](file:///e:/Documents/sxf-football/web-admin-vue/public/formation-designer.html#L405-L420) 内嵌 `FORMATION_DB` | 同 A | `#fieldBoundary`（同样 7/5/86/90） | 仅手工工具有效 | 与 A **已漂移**：如 5人制 `2-2` 的 CB1，json 为 `30,25`，设计器为 `40,32` |
| C | 小程序阵型计算 | [formation-rules.js](file:///e:/Documents/sxf-football/miniprogram/utils/formation-rules.js#L9-L36) `regularPositions` | `x` 按排数取 10/30/55/80，`y` 按该排人数等分 | 横版球场 | **生效** | 完全**忽略** D 的 `x/y`，只读 `role/label` |
| D | 小程序阵型数据（横版） | [formation-data.js](file:///e:/Documents/sxf-football/miniprogram/utils/formation-data.js#L9-L20) | 手写 `x/y`（如 5人制 `2-2` GK `13.19,50.58`，CB1 `40.03,20.42`，CB2 `30.7,83.54`） | 横版球场 | **有意不使用** | `formation-rules.js#L5-L7` 注释明确声明"坐标统一在这里计算"，D 的坐标成为冗余死数据；且本身不对称（CB1 `y=20.42` vs CB2 `y=83.54`） |
| E | 小程序竖版换算 | [lineup-layout.js](file:///e:/Documents/sxf-football/miniprogram/utils/lineup-layout.js#L1-L20) | 换轴：`left = 10 + y*0.8`，`top = 10 + (100-x)*0.8` | 竖版球场 | **生效** | 常数 `0.8` / `10` 硬编码；`squad` 与 `match-lineup-editor` 共用 |
| F | `packageA/pages/lineup` 独立表 | [lineup.js](file:///e:/Documents/sxf-football/miniprogram/packageA/pages/lineup/lineup.js#L50-L142) 内嵌 `formations` | `x`=横向（10→90），`y`=纵深（12→92，GK=92） | `.positions-layer`（内缩 7/5/86/90） | **生效（入口较深）** | 仅 11 人制 5 套（`4-4-2/4-3-3/3-5-2/4-2-3-1/4-5-1`），其中 `4-5-1` **在 json 中不存在**；且 `4-5-1` 写了 **12 个位置**（多一个 AM） |
| G | 小程序战术板（自由拖拽） | [team-tactics.js](file:///e:/Documents/sxf-football/miniprogram/utils/team-tactics.js#L88-L98) `defaultPoint = 8 + depth*0.84`、[tactics-free.js](file:///e:/Documents/sxf-football/miniprogram/utils/tactics-free.js#L10-L20) | `x` 4–96，`y` 10–90 | 战术区（内缩 18px） | **生效且持久化** | 存 `team_tactics` 集合；与比赛阵容**完全不通** |
| H | 服务端阵型插槽表 | [getMiniWorkspace/index.js](file:///e:/Documents/sxf-football/cloudfunctions/getMiniWorkspace/index.js#L1945-L1985) `LINEUP_FORMATION_SLOTS` | 只有**角色码**（`GK/DF/MF/FW`），无坐标 | — | **生效**（校验 + `slotPosition`） | 8 人制额外保留历史 `2-3-2`、`2-4-1`；粒度比 A/D 粗（无 LB/CB1/LM 等） |
| I | 服务号 H5 | [tournament-center.js](file:///e:/Documents/sxf-football/service-account-h5/tournament-center.js#L307-L327) `formationRows` | **不用坐标**，按 `formation` 字符串切行 | flex 行堆叠 | **生效** | 阵型串缺失时按人数猜行数；顺时针/逆时针方向由 CSS `column-reverse` 决定 |
| J | 云函数阵型 JSON 副本 | [cloudfunctions/getMiniWorkspace/formation-data.json](file:///e:/Documents/sxf-football/cloudfunctions/getMiniWorkspace/formation-data.json) + [sharedFormation.cjs](file:///e:/Documents/sxf-football/cloudfunctions/getMiniWorkspace/sharedFormation.cjs) | 同 D | — | 供服务端读角色 | **第 3 份** 23 套 JSON 拷贝 |

**小结：坐标数据 6 份（A/B/D/F/G/J），有效渲染坐标 4 套（A/C+E/F/G），阵型 ID 清单 3 套（A-J 同源 / H / F）。**

### 1.2 各端渲染方式

| 端 | 文件 | 画布尺寸策略 | 用哪套坐标 | 等比缩放？ | 明显问题 |
|---|---|---|---|---|---|
| PC 双队编辑 | [VisualLineupEditor.vue](file:///e:/Documents/sxf-football/web-admin-vue/src/views/tournament/VisualLineupEditor.vue#L1731-L1755) | 容器 `100%×100%`，`background-size: contain` | A | **否** | 容器比例任意，但底图 `contain` 会留白；坐标按容器百分比算 → **坐标与画出来的球场线不对齐**（底图实际 2.327:1） |
| PC 单队编辑 | 同上 L1503 | `aspect-ratio: 2560/1100`（=2.327，与底图一致） | A | 是（比例对） | 生产未使用（`MatchDetail` 只传 `mode="dual"`） |
| PC 平板横屏 | 同上 L2296-L2340 | 卡 `76×109px` | A | 只缩卡 | 第三套卡尺寸（PC 126×181 / 平板 76×109 / 小程序 72×105rpx） |
| 小程序 `squad`（截图页） | [squad.wxss](file:///e:/Documents/sxf-football/miniprogram/pages/match/squad/squad.wxss#L33-L46) | `.pitch{height:840rpx}`，宽度随屏幕 | C → E | **否** | 高度固定 rpx、宽度自适应 → 球场比例随机型变化，10%–90% 的落点相对画线漂移；卡 `96×100rpx` 固定 |
| 小程序 `match-lineup-editor` | [index.wxss](file:///e:/Documents/sxf-football/miniprogram/components/match-lineup-editor/index.wxss) | 高度 100%，markings `perspective(800rpx) rotateX(18deg)` | C → E | 卡 `scale(cardScale)` JS 计算 | **画线层倾斜、点位层不倾斜** → 两个投影；slot `120×172rpx` 固定 |
| 小程序 `packageA/pages/lineup` | [lineup.wxss](file:///e:/Documents/sxf-football/miniprogram/packageA/pages/lineup/lineup.wxss#L74-L96) | `aspect-ratio: 1.6/1`（**横版**）+ `field-horizontal.png` | F（**竖版语义**：`y`=纵深） | 否 | 画布横版、坐标竖版，语义直接冲突；`4-5-1` 12 个点 |
| 战术板 | [board.wxss](file:///e:/Documents/sxf-football/miniprogram/pages/team/tactics/board/board.wxss) | 横版自由画布，`movable-view` 令牌 44px | G | 否（令牌固定 px） | 与阵容体系无任何共用 |
| 服务号 H5 | [tournament-center.js](file:///e:/Documents/sxf-football/service-account-h5/tournament-center.js#L323-L327) + `tournament-center-qa-fix.css` | 两个半场 flex 行 | I | — | 只表达"几排几人"，不表达具体站位 |

### 1.3 数据写入链路（关键差异）

| 写入端 | 云函数 / action | 落库位置 | 存了什么 | 阵型字段 |
|---|---|---|---|---|
| PC 双队编辑 | `updateMatch`（[MatchDetail.vue#L2974](file:///e:/Documents/sxf-football/web-admin-vue/src/views/tournament/MatchDetail.vue#L2974-L2998)） | `matches.lineups.home/away` | `{ formation, players:[{role,...}], substitutes }` | `formation` 字符串；`role` = **细角色**（`GK/CB1/LB/RM/ST`） |
| 小程序（新，截图页） | `getMiniWorkspace.submitMatchLineup` | `match_lineup_snapshots` + `matches.homeLineup/awayLineup` | `{ formation, formationText, starters:[{slotId, slotPosition}], substitutes }` | `formation`；`slotId=slot-N`，服务端映射成 **粗角色**（`GK/DF/MF/FW`） |
| 小程序（旧） | `updateMatchLineup` → `serviceMatchWorkflow.submitLineupLegacy` | `matches.homeLineup/awayLineup` | **只有 starters 数组** | **完全丢失阵型**（[index.js#L43-L56](file:///e:/Documents/sxf-football/cloudfunctions/updateMatchLineup/index.js#L43-L56) 只取球员 ID） |
| H5 读取 | 公开赛程接口 | `match_lineup_snapshots` | `formation` + `starters` | 只读 |

> 结论：**PC 与小程序写的是两个不同的集合、两套形状、两种角色粒度**。同一次"阵容"，在 PC 眼里是 `players[].role`，在小程序眼里是 `starters[].slotPosition`，在 H5 眼里是"按 formation 字符串切行"。这是"乱"最本质的一层。

### 1.4 阵型 ID 清单差异

| 来源 | 5人 | 7人 | 8人 | 9人 | 11人 | 差异 |
|---|---|---|---|---|---|---|
| `web-admin-vue/src/data/formation-data.json` | 2-1-1 / 2-2 / 3-1 / 1-2-1 | 3-2-1 / 2-3-1 / 2-1-2-1 / 1-4-1 | 3-3-1 / 3-2-2 / 2-2-3 / 4-2-1 / 1-3-2-1 | 3-3-2 / 3-4-1 / 3-2-3 | 4-4-2 / 4-3-3 / 4-2-3-1 / 3-5-2 / 3-4-3 / 5-3-2 / 5-4-1 | 共 23 套（4+4+5+3+7）；顶层键为 `"5人制"…"11人制"`，每套含 `name`（如 `3-3-1 (前卫控制)`）与 `positions[{role,label,x,y}]` |
| `miniprogram/utils/formation-data.js` | 同上 | 同上 | 同上 | 同上 | 同上 | ID 一致，**坐标不同** |
| `cloudfunctions/getMiniWorkspace/formation-data.json` | 同上 | 同上 | 同上 | 同上 | 同上 | 第三份拷贝 |
| `LINEUP_FORMATION_SLOTS` | 4 套 | 4 套 | **7 套**（多 `2-3-2`、`2-4-1`） | 3 套 | 7 套 | 仅角色码，无坐标 |
| `packageA/pages/lineup` | — | — | — | — | 5 套 | 独立表，独立坐标；`4-4-2/4-3-3/3-5-2/4-2-3-1/4-5-1`，其中 `4-5-1` 其他端没有 |
| `formation-designer.html` | 4 套 | 4 套 | 5 套 | 3 套 | 7 套 | **ID 与 json 完全一致**，但坐标已漂移（`cls` 字段仅设计器有） |

---

## 二、结论：现在"乱"的具体成因

### 成因 1｜坐标只活在前端常量里，且被抄了 6 份

没有任何一处把阵型坐标存在数据库或统一配置里。`formation-data.json`（PC）、`formation-data.js`（小程序）、`cloudfunctions/.../formation-data.json`（服务端）、`formation-designer.html` 内嵌表、`packageA/pages/lineup/lineup.js` 内嵌表，加上战术板自己的派生公式，共 6 份。**改一处不会带动其他端**，且没有任何机制能发现它们已经不一致。

证据：`formation-designer.html` 与 `formation-data.json` 在同一套 `2-2` 阵型上给出不同坐标（`40,32` vs `30,25`）；小程序 `formation-data.js` 的坐标被 `regularPositions` 整段覆盖，成为无人校验的冗余数据（且本身不对称）。

**更关键的旁证**：[formation-rules.js#L5-L7](file:///e:/Documents/sxf-football/miniprogram/utils/formation-rules.js#L5-L7) 的注释写着"坐标统一在这里计算，避免每套阵型各写一份手写坐标互相不一致"——说明**已经有人在小程序单端尝试过统一**。但 PC、H5、服务端、`packageA` 未跟进，结果不是消除了分裂，而是又加了一层"计算派生"的来源。

### 成因 2｜横竖版靠"换轴公式"派生，常数各自写死

- 小程序：`left = 10 + y*0.8`、`top = 10 + (100-x)*0.8`（`lineup-layout.js`），`0.8` 与 `10` 是魔数。
- 战术板：`x = 8 + depth*0.84`，客队 `92 - depth*0.84`（[team-tactics.js#L92-L99](file:///e:/Documents/sxf-football/miniprogram/utils/team-tactics.js#L92-L99)），另一个魔数。更绕的是 [`boardSlots`](file:///e:/Documents/sxf-football/miniprogram/utils/team-tactics.js#L101-L113) 先取小程序已算好的 `x/y`，再整体套一层 `defaultPoint` —— **同一条坐标被连续变换两次**。
- `packageA/pages/lineup`：干脆不用公式，直接内嵌一套竖版坐标。

同一个"横版 → 竖版"的几何变换，被实现了三种不同版本，其中一版还是手工数据。

### 成因 3｜画布比例与底图比例脱钩，坐标基准不是"球场"而是"容器"

PC 双队模式的球场是 `background-size: contain` 的位图（实际 2.327:1）铺在任意比例的容器里，而点位基准是 `.field-boundary`（容器 7%/5%/86%/90%）。当容器比例 ≠ 2.327 时，底图会上下或左右留白，**点位仍按容器百分比落位**，于是点位与画出来的边线/禁区线错位。单队模式因为写了 `aspect-ratio: 2560/1100` 反而是对的——两条路径用了两种基准。

小程序 `squad` 同理：`.pitch` 高度固定 `840rpx`、宽度随屏幕，比例每个机型都不同；`.pitch-outline` 用 `inset: 12rpx`，点位用 10%–90%，两套内缩规则互不相干。

### 成因 4｜球员卡与点位尺寸用固定 px/rpx，不随容器缩放

- PC：`126×181px`，平板 `76×109px`（`html[data-tablet-landscape]`）。
- 小程序：`squad` `96×100rpx`（卡片态 `72×105rpx`）、`match-lineup-editor` `120×172rpx`。
- 卡片本身是 `aspect-ratio: 30/43` 的固定成卡。

所以同一个阵型在 14 寸笔记本、平板横屏、大小屏手机上，点位间距在变、卡片不变，必然出现重叠或空旷。

### 成因 5｜阵型 ID 与角色序列三处维护，历史差异靠别名和硬编码兜底

8 人制的 `2-3-2` / `2-4-1` 只存在于服务端表；小程序用别名表硬映射（`3-3-2→3-3-1`、`4-2-2→3-2-2`、`4-3-1→4-2-1`、`1-3-3-1→1-3-2-1`，见 [formation-rules.js#L2](file:///e:/Documents/sxf-football/miniprogram/utils/formation-rules.js#L2)）；`packageA` 只支持 11 人制。角色粒度也不统一：PC 是 `CB1/LB/RB/LM/CM/RM/ST`，服务端是 `DF/MF/FW`。任何一次"给某个阵型加一个位置"都要同时改 3–4 个文件。

### 成因 6｜"阵型编辑器"是个复制粘贴工具，且已经失效

[LayoutView.vue#L951](file:///e:/Documents/sxf-football/web-admin-vue/src/views/layout/LayoutView.vue#L951) 在运营后台导航里挂了「阵型设计器」入口，指向 `formation-designer.html`。但：

- 它没有读库、没有写库、没有鉴权；
- 保存方式是「复制以下内容」，人工粘贴进 `formation-data.json`，然后重新构建、发布 `/admin/`；
- 它内嵌的坐标已经和 json 不一致（`2-2` 的 CB1：`40,32` vs `30,25`），说明**人工同步这条链路已经断过一次**。

### 成因 7｜战术板已经做过"坐标持久化"，但与比赛阵容完全不通

`team_tactics` 是唯一把坐标写进数据库的地方（每个令牌 `x/y` 百分比 + 自由拖拽 + 轨迹）。它证明"百分比坐标持久化"这条路在本仓库是可行的；但它和 `matches.lineups` / `match_lineup_snapshots` 没有任何共用模型，等于又长出一套。

### 成因 8｜写入形状分叉，导致"同一场比赛的阵型"有三副面孔

见 §1.3：PC 的 `players[].role`、小程序的 `starters[].slotPosition`、旧的 `selectedPlayerIds[order]`。H5 只能按 `formation` 字符串去切 `starters` 的**顺序**，于是"谁能站在哪个位置"实际取决于提交时数组顺序——这也是现场"阵型看着不对"的常见来源。

---

## 三、方案建议：以「阵型模板」为唯一真源

### 3.1 设计原则

1. **一个真源**：后台维护「阵型名 + N 个位置的百分比坐标」，所有端只读。
2. **模板只存一套坐标（横版语义）**，竖版由渲染端用固定的几何变换得到，不再维护第二份数据。
3. **坐标相对"球场线内矩形"**，不是相对外层容器；渲染端必须先算出线内矩形，再按百分比落位 → 从根上解决 §成因 3。
4. **点位尺寸按容器短边等比缩放**（一个 `scale` 系数），不再各端写死 px/rpx。
5. **版本化**：发布即 `version+1`；阵容快照可以记录当时用的模板版本，历史回看不会因为重新发布而变形。
6. **不改变现有业务键**：`formation` 字符串继续是业务主键，模板只是给这个键补上几何信息。

### 3.2 数据模型

**集合：`formation_templates`**（建议同时保留一份共享 JSON 种子，沿用 `cloudfunctions/dataCenter/shared` + `tools/sync-*.mjs` 的既有约定）

```jsonc
{
  "_id": "8-3-3-1",              // playersOnField + "-" + formation，全局唯一
  "playersOnField": 8,            // 5 | 7 | 8 | 9 | 11
  "formation": "3-3-1",           // 业务键，必须与现有 formation 字符串完全一致
  "name": "3-3-1 (前卫控制)",      // 展示名（PC 下拉、小程序 chip、H5 标题共用）
  "aliasOf": "",                  // 历史别名指向（例：8 人制 2-3-2 → 保留独立模板，aliasOf 留空）
  "orientation": "landscape",     // 模板永远按横版语义存储；竖版由渲染端旋转
  "slots": [                      // 长度必须 === playersOnField
    { "slotId": "slot-0", "role": "GK",  "label": "守门员", "position": "GK", "x": 10, "y": 50 },
    { "slotId": "slot-1", "role": "LB",  "label": "左后卫", "position": "DF", "x": 30, "y": 20 },
    { "slotId": "slot-2", "role": "CB",  "label": "中后卫", "position": "DF", "x": 30, "y": 50 }
  ],
  "status": "active",             // draft | active | archived
  "version": 3,
  "updatedBy": "<userId>",
  "updatedAt": "<serverDate>",
  "publishedAt": "<serverDate>"
}
```

**坐标约定（必须写进代码注释，禁止各端再解释一遍）**

- `x`：**本方半场纵深**，`0` = 本方球门线，`100` = 中线（不是对方底线）。
- `y`：横向，`0` = 左边线，`100` = 右边线。
- 两点都相对**线内矩形**，不是容器外框。
- 基准与实测范围以 `web-admin-vue/src/data/formation-data.json` 为准（用户已亲自校正），实测 `x ∈ [10, 80]`、`y ∈ [10, 90]`。

**两个固定变换（唯一定义，各端照抄；不做客队镜像）**

| 场景 | 公式 | 说明 |
|---|---|---|
| 横版 · 主队（左半场） | `left = x / 2`, `top = y` | 与现状 `pos.x * 0.5` 完全一致 |
| 横版 · 客队（右半场） | `left = 50 + x / 2`, `top = y` | 与现状一致，**只平移不镜像** |
| 竖版（单队） | `left = y`, `top = 100 - x` | 横版逆时针 90°；`squad` 现状 `left = 10 + y*0.8` 是"内缩后再旋转"，改成先算线内矩形再旋转即可去掉魔数 |

> 已确认决策（2026-11-07）：**手机端没有客队概念**，竖版就是横版坐标的确定性 90° 旋转，一套坐标、两套渲染。不再讨论客队镜像。

**尺寸约定**

- 球场画布：`aspect-ratio` 固定（横版 2.327:1，竖版取横版倒数并允许不足时用 `min()` 约束），保证任何屏幕比例都不变形。
- 点位卡：`cardW = K * min(canvasW, canvasH)`，`K` 由后台按人数制配置（5 人制 1/6、11 人制 1/9 之类），渲染端只做一次乘算。

### 3.3 后台编辑器最小交互（运营后台，PC）

沿用 `formation-designer.html` 已有的拖拽内核，改造成写库：

1. **顶部**：人数制切换（5/7/8/9/11）→ 阵型下拉（读 `formation_templates`）→「新建 / 复制为新阵型」。
2. **画布**：固定比例的横版球场（与最终渲染同一张底图、同一个线内矩形），N 个可拖拽圆点，拖动时吸附 1%，实时显示 `x/y`。
3. **左侧列表**：每个点位一行，「角色码 / 中文名 / 位置分类（GK-DF-MF-FW）」三个字段。角色码决定 `slot-{index}` 与服务端 `LINEUP_FORMATION_SLOTS` 的对应关系，改名不影响阵容历史。
4. **右侧预览**：横版 / 竖版双预览（同一份数据两套投影），并可切换到"14 寸笔记本 / 平板横屏 / 手机竖屏"三种容器尺寸看效果。
5. **校验**：点位数量必须等于人数制；`x/y ∈ [2, 98]`；同队点位最小间距 > 卡片宽度；角色码不重复。
6. **动作**：「保存草稿」/「发布」（`status=active, version+1`）/「归档」。发布后各端自动切到新版本，无需发版。
7. **只读**：历史版本对比（至少能看到"上一版 vs 本版"的坐标差异）。

> 权限：仅平台运营（`isPlatformOwner` / 平台后台正式发布范围）。赛事主办方不可编辑全局模板；若将来需要"赛事自定义阵型"，另开 `tournament_formation_overrides`，不要污染全局模板。

### 3.4 各端改造点

| 端 | 改造内容 | 工作量 | 是否影响业务逻辑 |
|---|---|---|---|
| 运营后台 | 新增「阵型模板」页（列表 + 编辑器 + 发布），导航沿用 [LayoutView.vue#L951](file:///e:/Documents/sxf-football/web-admin-vue/src/views/layout/LayoutView.vue#L951) 已有位置 | 中 | 否（纯新增） |
| PC 阵容编辑器 | 1) 坐标改读模板接口，去掉 `formation-data.json` 直连；2) 双队画布加 `aspect-ratio`，点位基准改为线内矩形；3) 卡尺寸改 `K*min(w,h)`（**客队不做镜像**） | 中 | 显示层，不动保存结构 |
| 小程序 `squad` | 1) 阵型列表与坐标改读模板；2) 删掉 `formation-rules.regularPositions` 的坐标计算，只保留兜底；3) 竖版用统一变换，去掉 `0.8` 魔数；4) `.pitch` 改固定 `aspect-ratio` | 中 | 保存结构不变（仍是 `slotId` + `formation`） |
| 小程序 `match-lineup-editor` | 同上；并把 `rotateX(18deg)` 从"只转画线"改成"整层一起转"或干脆去掉 | 小 | 否 |
| 小程序 `packageA/pages/lineup` | **已确认废除**页内内嵌竖版阵型表（11 人制 5 套私有坐标，且 `4-5-1` 写了 12 个点位）；该页改为读统一模板渲染，不再自持一份坐标 | 小 | 显示层，不动保存结构 |
| 服务号 H5 | 可选：保留"行堆叠"（信息足够、移动端更易读），但阵型行数改为由模板 `rows` 推导，不再从字符串硬猜 | 小 | 否 |
| 服务端 | 1) `LINEUP_FORMATION_SLOTS` 改为由模板生成（角色码来自 `slots[].position`）；2) 新增 `formationTemplates` 读取 action；3) 快照写入时记录 `formationTemplateVersion` | 中 | **是**（校验逻辑改为读模板，需回归） |
| 战术板 | 可选：`defaultPoint` 改为读模板坐标，让"战术板初始站位"与"比赛阵容站位"一致 | 小 | 否（独立集合） |

### 3.5 历史数据兼容

**不需要数据迁移。** 理由：

1. 历史阵容只存 `formation` 字符串与角色/位置码，**从来没有存过坐标**（§1.3）。换一套坐标模型，历史记录回看时用"当前 active 模板"渲染即可，视觉上可能微调，但数据含义不变。
2. `match_lineup_snapshots` 的 `slotPosition`（`GK/DF/MF/FW`）是文本，不受坐标影响。已审核/锁定快照**不需要重算**。
3. 8 人制历史 `2-3-2` / `2-4-1`：**已确认保留为正式阵型**（`status: active`），坐标按 8 人制现有排版规则补齐，已保存的老比赛名单可正常读取与展示。
4. 11 人制 `4-5-1`：**不属于正式阵型清单**（原 `packageA` 表里还写了 12 个点位），标记为 `status: retired`，禁止新建；历史名单仍按模板只读渲染，不得报错或空白。
5. `formation` 字符串必须**保持原样**（`3-3-1` 就是 `3-3-1`），不能借统一之机改名。名称差异（`3-3-1` vs 别名 `3-3-2`）继续由小程序别名表兜底。
6. 如需精确复刻历史观感，可在快照上追加可空字段 `formationTemplateVersion`，缺省时按 active 渲染——**不要回填**历史数据。
7. **`role` 编码是历史契约**：PC 的 `matches.lineups.*.players[].role` 里存的就是 `GK/CB1/LB/...`。同一 `formation` 发布后**只允许改 `x/y/label`，不允许改 `role`**；确需调整角色集合时，新建 `formation`（新 ID + `aliasOf` 指向旧的），旧模板转 `archived`，避免老阵容回看时角色对不上位置。

### 3.6 关于「要不要做手机版竖版编辑器」

**建议不做。** 逐条对照用户的三个设想：

| 用户设想 | 判断 | 理由 |
|---|---|---|
| 手机竖版编辑器，编辑完把坐标发我调整 | **不建议** | ① 竖版坐标是横版坐标的确定性旋转变换，不需要人来"编"；② 引入触屏拖拽会产生第 7 份 `px→%` 换算；③ "发给你调整"仍需要一次代码提交，等于把现在的断链再复制一遍 |
| 编辑器放运营后台 | **建议采纳** | 低频、全端生效、可版本化、可审计；且后台天生有权限与发布流程 |
| 是否需要新的坐标模型 | **不需要新模型，需要新载体** | 坐标语义已经够用（`x` 纵深 / `y` 横向 / 百分比 / 线内矩形基准），缺的是"存在哪、谁维护、怎么发版" |

唯一值得保留的"手机侧编辑"场景是**战术板**（自由拖拽、画线路），它已经在 `team_tactics` 里做了，和阵容模板是两件事，不要合并。

---

## 四、分阶段实施建议

### 4.0 第一阶段已落地（2026-11-07，后端已上线并写入 26 套种子）

用户已确认四项决策：① 坐标基准 = `web-admin-vue/src/data/formation-data.json`；② 不做客队镜像，竖版 = 横版 90° 旋转；③ `packageA/pages/lineup` 内嵌竖版表废除，改读统一渲染；④ 8 人制 `2-3-2`/`2-4-1` 保留为正式阵型，`4-5-1` 撤出清单但历史名单仍可回看。

**新增/修改文件**

| 文件 | 作用 |
|---|---|
| `shared/formation-templates.json` | **唯一真源**。含 `schemaVersion`、`coordinateSystem`（坐标语义与三个固定变换）、按人数制的 `active`/`retired` 清单、每套模板的 `positions[{role,label,x,y}]` 与并列的 `slotRoles[]` |
| `tools/sync-formation-templates.mjs` | 同步入口。默认写回副本；`--check` 只校验。校验项：点位数 = 场上人数、`slotRoles` 与角色码派生一致、阵型编号各行之和 = 人数 - 1、坐标 0–100、角色码唯一且恰好 1 名 GK；并把 `getMiniWorkspace` 的 `LINEUP_FORMATION_SLOTS` 与真源**逐阵型双向比对** |
| `web-admin-vue/src/data/formation-data.json` | 由真源生成的 PC 副本（结构不变、只含 active，排版保持原样），PC 阵容编辑器无需改动即可读到 8 人制新增的两个阵型 |
| `cloudfunctions/webLoginApi/formation-templates.json` | 服务端只读副本（由同一工具生成） |
| `cloudfunctions/webLoginApi/formationTemplates.cjs` | 阵型模板服务端：8 个 action + 服务端校验 + 平台运营权限 |
| `cloudfunctions/webLoginApi/index.js` | 注册上述 8 个 action，仍走 `webLoginApi` 单一 HTTP 入口 |
| `web-admin-vue/src/views/formation/FormationTemplates.vue` | 运营后台「阵型模板」页 |
| `web-admin-vue/src/router/index.js`、`views/layout/LayoutView.vue` | `/formation-templates` 路由；把原「阵型设计器」死链换成「阵型模板」，并对非平台运营隐藏 |

**统一后的阵型清单（共 25 个 active + 1 个 retired）**

| 人数制 | active | retired |
|---|---|---|
| 5 人制 | `2-1-1`、`2-2`、`3-1`、`1-2-1` | — |
| 7 人制 | `3-2-1`、`2-3-1`、`2-1-2-1`、`1-4-1` | — |
| 8 人制 | `3-3-1`、`3-2-2`、`2-2-3`、`4-2-1`、`1-3-2-1`、**`2-3-2`**、**`2-4-1`** | — |
| 9 人制 | `3-3-2`、`3-4-1`、`3-2-3` | — |
| 11 人制 | `4-4-2`、`4-3-3`、`4-2-3-1`、`3-5-2`、`3-4-3`、`5-3-2`、`5-4-1` | `4-5-1` |

> 8 人制 active 清单与 `getMiniWorkspace` 的 `LINEUP_FORMATION_SLOTS` 已完全一致；`4-5-1` 只存在于真源的 `retired` 段（11 人制），只能历史回看、禁止新建。

**数据结构（按 §3.2 落地，含草稿/发布分离）**

- `formation_templates`：`_id = ${人数}-${阵型编号}`（如 `8-3-3-1`）、`playersOnField`、`formation`、`name`、`description`、`aliasOf`、`orientation`、`status`（`active`/`archived`）、`version`、`slots`（已发布内容）、`draft`（工作副本，发布后清除）、`publishedAt/publishedBy`、`createTime/updateTime`。
- `formation_template_versions`：`templateKey`、`playersOnField`、`formation`、`version`、`name`、`description`、`slots`、`publishedBy`、`publishedAt`。首次发布记录 v1；内置阵型在被首次编辑时把内置内容固化为 v1。
- `slots[]`：`slotId`（`slot-N`，顺序即 `LINEUP_FORMATION_SLOTS` 顺序）、`role`（历史细角色码）、`label`、`position`（`GK/DF/MF/FW` 粗码，由 `role` 派生）、`x`、`y`。

**接口（全部走 `webLoginApi`，网页端零 SDK）**

| action | 权限 | 说明 |
|---|---|---|
| `listFormationTemplates` | 登录即可 | 内置 + 集合合并后的阵型清单（含 `retired`/`hasDraft`/`version`） |
| `getFormationTemplate` | 登录即可 | 单阵型详情：已发布 `slots`、`draft`、历史版本摘要 |
| `listFormationTemplateVersions` | 登录即可 | 历史版本（含每版 slot 快照） |
| `saveFormationTemplateDraft` | 平台运营 | 校验点位数/坐标/角色唯一/GK 唯一/阵型编号；拒绝停用与已归档阵型；已发布阵型禁止改角色集合 |
| `publishFormationTemplate` | 平台运营 | 版本号 +1、写历史快照、清除草稿；角色集合必须与已发布一致 |
| `archiveFormationTemplate` | 平台运营 | 归档（历史回看仍可用） |
| `restoreFormationTemplateVersion` | 平台运营 | 把历史版本另存为草稿，再发布即新版本 |
| `seedFormationTemplates` | 平台运营 | 内置阵型写入集合；**默认 `dryRun`**，需显式 `confirm: true` 才写库 |

**后台编辑器交互**

- 左侧人数制切换 + 阵型列表（`vN`、草稿、已停用、内置标签）。
- 中部横版半场画布：复用 `formation-designer.html` 的拖拽与 `px → 百分比` 思路，改为 Vue 指针事件；落点即 `x`（纵深，0–100）、`y`（横向，0–100），基准与 PC `.field-boundary`（`left 7% / top 5% / width 86% / height 90%`）一致。
- 右侧竖版预览：同一套坐标套 `left = y`、`top = 100 - x`，验证"一套坐标两套渲染"。
- 点位表：`role` 只读、`position` 只读（服务端派生）、`label` 与 `x/y` 可改。
- 操作：保存草稿 / 发布（版本号 +1，二次确认）/ 归档 / 历史版本抽屉（另存为新版本草稿）/ 初始化内置模板（先出 dryRun 计划再确认）/ 新建阵型（按编号自动生成点位初值）。
- 非平台运营进入页面只读，写入按钮不出现。

**本阶段不做（等用户授权）**

~~建 `formation_templates` / `formation_template_versions` 集合、写入任何模板数据、部署 `webLoginApi`~~ → 集合由用户自建、后端已差量上线、种子已写入，见下方 4.0.1。

**4.0.1 后端上线与种子写入（2026-11-07 完成）**

- 集合核对：`formation_templates`、`formation_template_versions` 均已存在且为空；索引只有默认 `_id_` / `_openid_1`。**未擅自加索引**；建议后续补 `formation_template_versions` 的 `{templateKey:1, version:-1}` 复合索引（当前数据量下不加也可用，只是历史版本查询走扫描）。
- 发布方式：从线上 `fn code download` 取包，只叠加 `formationTemplates.cjs`、`formation-templates.json` 与 `index.js` 的 8 个 `case` 分发；未用仓库目录整体覆盖（仓库 `cloudfunctions/webLoginApi` 的业务文件数量少于线上，直接整包上传会删掉现网模块）。
- 发布前 `tools/check-referee-backend-package.cjs` 两项检查（裁判表接口、报名上传权限）通过；回下载包再次执行同样通过；业务文件 6758 个逐个 SHA-256 一致，仅 `node_modules/.package-lock.json` 因线上安装产生许可元数据差异。
- 配置保持不变：Nodejs18.15 / 512MB / 120s / `InstallDependency=TRUE` / 环境变量 28 项名称未变。
- 种子：25 套 `active` + 1 套 `archived`（11 人制 `4-5-1`），`version=1`、`slots` 数 = 场上人数、`createTime/updateTime/publishedAt` 为日期类型；`formation_template_versions` 仍为 0 条（种子不写版本快照）。
- 说明：写入时无平台运营会话令牌，种子由线上模块 `seed` 逻辑在假 DB 上生成同形文档后用数据库管理命令插入，未走后台按钮；后台按钮后续用于新增/改版。

### P0｜对齐与止血（**已并入 4.0**）

- ~~以 `formation-data.json` 为基准生成共享真源~~ → 已产出 `shared/formation-templates.json`。
- ~~差异报告~~ → 已改为 `sync-formation-templates --check`，把 ID 与角色序列差异变成可执行校验。
- `packageA/pages/lineup` 的 `4-5-1` 12 点位 bug：真源里按 11 个点位登记为 `retired`，页面本身留待下一阶段改造。
- `formation-designer.html` 顶部未加"停止维护"提示（避免额外改动未授权范围），下一阶段随页面合并处理。

### P1｜几何收口（下一阶段，仍是纯前端）

- 抽一个**极薄的共享几何模块**（每端一份 20 行左右的语言对应实现，逻辑完全一致）：`toLandscape(x,y)`、`toPortrait(x,y)`、`fitPitch(w,h)`、`cardSize(minSide,playersOnField)`。
- PC 双队画布补 `aspect-ratio`，点位基准从容器改为线内矩形（**客队只平移不镜像**）。
- 小程序 `squad` / `match-lineup-editor` 去掉 `0.8` 与 `10`，改为统一变换；`match-lineup-editor` 的画线倾斜与点位对齐。
- 小程序 `.pitch` 由"固定高度"改为"固定比例"。

### P2｜模板上云（只读）

- ~~首次部署后由平台运营在后台点「初始化内置模板」写入 25 个 active + 1 个 retired~~ → 已完成（2026-11-07，26 条已入库并回读核对）。
- 新增只读接口：PC 复用本阶段的 `listFormationTemplates` / `getFormationTemplate`；小程序在 `getMiniWorkspace` 增加 `formationTemplates` action；H5 走公开接口。
- 各端改为"先读接口、失败回退本地种子"，保证弱网/离线可用。
- 服务端 `LINEUP_FORMATION_SLOTS` 改为由模板派生（`--check` 已先行锁定两边的 ID 与角色序列）。

### P3｜后台编辑器（写入 + 发布）——**主体已在 4.0 完成**

- ~~运营后台新增阵型模板页~~ → 已完成（`FormationTemplates.vue`）。
- ~~写接口（发布、归档、版本历史），权限限定平台运营~~ → 已完成（`formationTemplates.cjs`）。
- 待办：发布后 `formation-data.json` 降级为"种子/兜底"，由各端运行时读接口替代直连。

### 4.1 下一阶段（各端只读渲染）改造点清单

| 端 | 文件 | 具体改动 | 验收点 |
|---|---|---|---|
| 服务端 | `cloudfunctions/getMiniWorkspace/index.js` | 新增 `formationTemplates` action 返回 active 模板；`submitMatchLineup` 的 `LINEUP_FORMATION_SLOTS` 改为运行时由模板 `slotRoles` 生成（保留 `2-3-2`/`2-4-1`）；`4-5-1` 仅允许读取不允许新提交 | 25 个 active 阵型提交校验全通过；`4-5-1` 新提交被拒、历史回看正常 |
| PC | `web-admin-vue/src/views/tournament/VisualLineupEditor.vue` | 坐标改由 `getFormationTemplate` 提供（失败回退 `formation-data.json`）；双队容器补 `aspect-ratio: 2560/1100`；点位基准由容器改为 `.field-boundary` 线内矩形；卡尺寸改 `K*min(w,h)`；**保持客队只平移不镜像** | 5/7/8/9/11 人制点位落在线内；三种容器下相对画线位置一致 |
| 小程序 | `miniprogram/utils/lineup-layout.js` | 改为 `left = y`、`top = 100 - x`（先算线内矩形再旋转），删除 `0.8`/`10` 魔数 | 同一阵型竖版与横版点位严格互为 90° 旋转 |
| 小程序 | `miniprogram/pages/match/squad/*` | 阵型清单与坐标改读接口/本地种子；`.pitch` 由固定 `840rpx` 高度改为固定比例；卡尺寸改按容器缩放 | 小屏（≤320pt）不重叠、不越界 |
| 小程序 | `miniprogram/components/match-lineup-editor/*` | 同上去魔数；`rotateX(18deg)` 要么整层一起倾斜要么去掉 | 画线与点位同一投影 |
| 小程序 | `miniprogram/packageA/pages/lineup/*` | **删除内嵌 `formations` 表**，改为读统一模板渲染；`4-5-1` 走 `retired` 只读分支 | 该页无私有坐标；历史 `4-5-1` 名单不空白 |
| 小程序 | `miniprogram/utils/formation-rules.js`、`formation-data.js` | 删除 `regularPositions` 自算坐标与手写 `x/y`，只保留别名表与兜底 | 与真源无第二份坐标 |
| 服务号 H5 | `service-account-h5/tournament-center.js` | 阵型行数改由模板推导，不再从字符串猜 | 缺阵型串时不猜错行数 |
| 后台 | `FormationTemplates.vue` 发布后 | 各端读取活动版本；`formation-data.json` 降级为种子 | 后台改坐标发布后，无需构建前端即生效 |

**可选收口（不阻塞主线）**：战术板初始站位改读模板；PC `players[].role` 与小程序 `starters[].slotPosition` 的写入结构二选一统一。

### 风险点

| 风险 | 影响面 | 说明与对策 |
|---|---|---|
| 服务端校验改读模板 | `getMiniWorkspace.submitMatchLineup` | 校验失败会直接阻断提交；P2 需逐阵型回归 5/7/8/9/11 人制，并保证 8 人制 `2-3-2`/`2-4-1` 仍可提交 |
| `packageA/pages/lineup` 是否仍在用 | 不确定 | 入口在 `packageA/pages/match/detail`；已确认废除其私有阵型表，改为读统一模板，不依赖"是否还有入口"的判断 |
| 后台页面未部署 | 配置数据 | 后端与种子已上线，但 `FormationTemplates.vue` 所在的 `codex/*` 分支未合入 `main`，故未部署 `/admin/`；后台页面读到的仍是"内置"来源，编辑功能要等前端发布后才可用 |
| 已审核名单快照 | 无 | 快照只存 `formation` + 位置码，不含坐标；不要回填历史数据 |
| 小程序 `squad` 与 `match-lineup-editor` 两套卡片尺寸 | 视觉一致 | 统一为 `cardSize()` 后需要真机逐机型核对，特别是小屏（≤320pt）下的点位重叠 |
| 平板横屏 `html[data-tablet-landscape]` 的第三套尺寸 | 视觉一致 | 统一后应删除这组覆盖，避免又多一处尺寸定义 |
| `slotRoles` 与 `role` 双轨 | 服务端提交校验 | `slotRoles` 是 `starters[].slotPosition` 的取值来源，`role` 是历史契约；两者由同一份模板并列存储，并由 `--check` 校验派生一致性，禁止在别处再派生一份 |

---

## 五、验证清单（实施阶段使用）

- [x] 真源与 `LINEUP_FORMATION_SLOTS` 逐阵型比对通过（`node tools/sync-formation-templates.mjs --check`）
- [x] 真源与 PC 副本、服务端副本一致（同一 `--check`）
- [x] 8 人制 `2-3-2` / `2-4-1` 已作为 active 模板进入真源与 PC 副本
- [x] `4-5-1` 仅存在于 `retired` 段，服务端写接口拒绝新建/编辑
- [ ] 后台真实登录后，保存草稿 → 发布 → 历史版本回查全链路（需部署 + 建集合后验证）
- [ ] 5/7/8/9/11 人制各阵型，PC 双队编辑器的点位落在线内，且与底图边线/中圈对齐
- [ ] 同一阵型在 PC / 平板横屏 / 手机竖屏三种容器下，点位相对画线的位置一致（允许整体缩放）
- [ ] 竖版与横版的点位互为 90° 旋转关系（可用坐标数值直接验证，无需肉眼）
- [ ] 小程序 `submitMatchLineup` 对所有 active 模板均通过校验；`4-5-1` 历史名单仍可解析展示
- [ ] 已审核/已锁定快照回看，`slotPosition` 文案不变
- [ ] 发布新版本模板后，未刷新的客户端仍能正常渲染（本地种子兜底）
- [ ] 运营后台阵型模板页仅平台运营可写；赛事主办方只读

---

## 六、勘查文件索引

**PC**
- `web-admin-vue/src/views/tournament/VisualLineupEditor.vue`（双队/单队画布、槽位坐标、卡片尺寸、平板覆盖）
- `web-admin-vue/src/views/tournament/MatchDetail.vue`（阵容弹窗与保存入口）
- `web-admin-vue/src/views/layout/LayoutView.vue`（运营后台导航中的「阵型设计器」死链入口）
- `web-admin-vue/src/data/formation-data.json`（23 套阵型 + 坐标）
- `web-admin-vue/public/formation-designer.html`（历史阵型编辑器，内嵌独立坐标表）
- `web-admin-vue/src/components/player/PlayerCard.vue`（成卡 30:43）

**小程序**
- `miniprogram/utils/formation-rules.js`、`formation-data.js`、`lineup-layout.js`、`team-tactics.js`、`tactics-free.js`
- `miniprogram/pages/match/squad/*`（截图对应页）
- `miniprogram/components/match-lineup-editor/*`
- `miniprogram/packageA/pages/lineup/*`
- `miniprogram/pages/team/tactics/board/*`

**服务号 H5**
- `service-account-h5/tournament-center.js`、`tournament-center-qa-fix.css`

**云函数**
- `cloudfunctions/getMiniWorkspace/index.js`（`LINEUP_FORMATION_SLOTS`、`submitMatchLineup`、快照写入）
- `cloudfunctions/getMiniWorkspace/sharedFormation.cjs`、`formation-data.json`
- `cloudfunctions/updateMatch/index.js`（PC 阵容写入通道）
- `cloudfunctions/updateMatchLineup/index.js`（旧小程序通道，丢阵型）
- `cloudfunctions/serviceMatchWorkflow/index.js`（`submitLineup`，只存 starters 顺序）

**本阶段新增文件**
- `shared/formation-templates.json`（唯一真源）
- `tools/sync-formation-templates.mjs`（同步与校验入口）
- `cloudfunctions/webLoginApi/formation-templates.json`（服务端只读副本）
- `cloudfunctions/webLoginApi/formationTemplates.cjs`（阵型模板服务端）
- `web-admin-vue/src/views/formation/FormationTemplates.vue`（后台阵型模板页）

**决策记录（2026-11-07，用户拍板，已取代本文件原有"待确认"项）**

1. 坐标基准 = `web-admin-vue/src/data/formation-data.json`（用户亲自校正，最准）；其余五份向它收口。
2. **不做客队镜像**：手机端没有客队概念，竖版就是横版坐标确定性转 90°，一套坐标两套渲染。
3. `packageA/pages/lineup` 内嵌竖版阵型表**废除**，该页改读统一渲染。
4. 8 人制 `2-3-2`、`2-4-1` 保留为正式阵型；`4-5-1` 不属于正式清单（原表 12 个点位），从清单撤除，只禁止新建，历史名单仍须正常读取展示。
