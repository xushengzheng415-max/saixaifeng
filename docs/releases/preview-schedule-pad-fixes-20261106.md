# 预览环境赛程页三项修复（PAD 侧栏 / 开赛点持久化 / 场地窗口）

日期：2026-11-06
环境：`cloud1-7g8ckb3c7815a011`
入口：`https://www.sxffootball.cn/preview/admin/`
分支：`preview`，基点 `origin/preview`（`3f108eab3`）

## 一、PAD 刷新后「待排比赛」侧栏又展开

- 根因（代码层）：`pendingDrawerOpen` 初值先读 `localStorage`（键 `sxfSchedulePendingPool:v1:<userId>`），手动展开一次后刷新会还原为展开；PAD 默认收起只是「无记忆时」的兜底。
- 根因（产物层）：上一轮发布后线上 `index.html` 于 18:37 被另一份构建覆盖为 `assets/index-CokROP0H.js`（290844 字节，与修复前旧包同尺寸），其赛程块为 `TournamentScheduleV2-Ccmpts6j.js`，不含收起逻辑与延期逻辑——即上次「产物命中」只是新文件躺在 assets 目录里。
- 改动：删除全部持久化读写；PAD 判定改为 `isPadClient(UA) || html[data-sxf-pad-client] || 横屏且粗指针触屏(min-width:600px)`；`onMounted` 再强制关闭一次；手动展开只改内存 ref。
- 会把侧栏置为展开的位置（全部）：① 初值 `!padScheduleLayout()`；② `saveSettings` 保存成功后 `setPendingDrawer(true)`；③ 模板「打开待排比赛」按钮；④ `<aside>` 头部「收起」按钮（置否）。

## 二、刷新后开赛点回到默认

- 保存链路：`saveSettings` → `callFunction('generateSchedule',{action:'saveDraft',scheduleConfig:payloadConfig()})`，校验 `result.success`。
- 丢弃点：后端 `sanitizeScheduleDraft` 只保留 `venueResources[].kickoffTimes`（`cloudfunctions/generateSchedule/index.js` 第 1506–1507 行），**顶层 `kickoffTimes` 被剥掉**；前端 `applySavedConfig` 只读顶层，读不到就退回 `sessionWindows[].start`（09:00 等默认值）。
- 改动：前端不再依赖顶层字段，开赛点由场地窗口派生（见下）；保存时按场地写入各自 `kickoffTimes`；`utils/scheduleKickoffTimes.mjs` 的 `configuredKickoffTimes` 增加「回退读取各场地 kickoffTimes」。

## 三、场地首末场未参与开赛点计算

- 口径：场地的「首场/末场」都是开赛时间点，末场表示最后一场开赛（不是关门时间）。
- 新算法：每场地在 `[首场, 末场]` 闭区间内，以 `整场时长 + 转场时间` 递进生成自己的点列；末场与网格对齐时纳入。
- 全局「开赛点」定位：候选池（各场地点列并集 + 人工补充点），已被场地窗口裁剪后的结果才用于落位与容量。
- 整场时长与后端 `divisionMatchMinutes` 同口径：单段时长 ×（halves→2，single→periodCount，其余→1）。
- 间隔文案、点位、容量都由同一份计算得出；`validateKickoffOverlap` 改为逐场地比对各自步进，避免不同制式混池误报。

### 三场地点列（按截图配置推演，转场 0）

| 场地 | 窗口 | 步进 | 点列 | 场/天 |
|---|---|---|---|---|
| 2号场地 8人制 | 18:50–20:10 | 30（整场 30） | 18:50、19:20、19:50 | 3 |
| 3号场地 11人制 | 09:00–18:00 | 45 | 09:00 起每 45 分钟至 18:00 | 13 |
| 1号场地 8人制 | 09:00–18:00 | 30 | 09:00 起每 30 分钟至 18:00 | 19 |

若该组别为上下半场（整场 = 单段×2，即 60 / 90），则对应 2 / 7 / 10 场每天。

### 理论容量

`Σ(每场地窗口内可容纳场次) × 有效比赛日`。上表合计 35 场/天 × 28 天 = **980 场**（半场口径为 19 × 28 = 532）。旧值 560 是「各制式场地数 × 4 个共用错误点位 × 28 天」并按组别重复累加得到的虚高值。

## 四、发布与回读

| 项 | 值 |
|---|---|
| 源码 commit | `050f9dca3`（三项主体）+ `54cdde347`（按场地校验） |
| 构建基点 | `origin/preview` = `3f108eab3` |
| 构建参数 | `VITE_APP_BASE=/preview/admin/`，410 个文件 |
| 线上 `index.html` 引用 | `assets/index-DjKk82Lq.js`（Last-Modified 11:10:35 GMT） |
| 入口 SHA-256 | `ED4EC4AD2ABD3272E102275439B5FE634011E0D87AAD8267DAEFC20A5040E227`（本地=线上） |
| 赛程块 | `assets/TournamentScheduleV2-BhjCphmg.js`，SHA-256 `FA60548494F514D519FE32E23EB4A887FC45A1D314818ABA30335503AAB29E3D`（本地=线上） |

线上产物命中次数：`postponedTo` 3、`isPostponedPlaceholder` 7、`postpone-badge` 1、`原定为` 1、`延期至` 1、`末场开赛` 1、`整场` 4、`data-sxf-pad-client` 1、`pointer: coarse` 1、`sxfSchedulePendingPool` 0（旧记忆键已移除）。

延期占位灰卡不受影响：网格时间列 = 场地点列 ∪ 实际比赛时间（含占位卡原定时间），占位卡按 `venues` 与 `blockMatchesForCell` 渲染，落在原日期、原场地的格子内。

## 五、后端待改（本轮未部署）

1. `generateSchedule.sanitizeScheduleDraft` 增加顶层 `kickoffTimes` 白名单，避免保存后顶层字段丢失。
2. 排期占用统一用整场时长（现为 `config.matchDuration || 50`），与前端 `matchDurations`（整场）一致。
3. `windowOverflow` 按场地末场判定，并遵守场地首场起点。
4. 场地列在已保存数据里可能是旧共用点位，需要一次重置或在下次保存时按场地重写。

## 六、延期占位日期归一化补丁 + 与报名线合并发布

日期：2026-11-06（第二次预览发布）

延期线只读排查结论：灰卡链路完好，不做大改，只补两处防御性归一化，避免 `postponedFrom.matchDate` 带时间戳或为 Date 对象时占位卡被误判为「没改过」而整体消失。

- `postponedPlaceholders` 过滤条件：`String(match.postponedFrom.matchDate).slice(0,10) !== String(match.matchDate || '').slice(0,10)`
- `calendarCellMatches` 落格条件：`String(match.matchDate || '').slice(0,10) === String(selectedDate.value || '').slice(0,10)`

不涉及场地窗口、开赛点与容量逻辑。

### 发布与回读

| 项 | 值 |
|---|---|
| 源码 commit | `b0ee26493`（归一化补丁）+ `8c37e3f8f`（报名线 `3f66ee031`） |
| 构建基点 | `origin/preview` = `8c37e3f8f`（构建前与推送前各 fetch 一次，异地一致） |
| 构建参数 | `VITE_APP_BASE=/preview/admin/`，410 个文件 |
| 线上 `index.html` 引用 | `assets/index-CO5cX_s7.js`（Last-Modified 11:24:39 GMT） |
| 入口 SHA-256 | `382BE4267B49E70DF52F8092B65EFDC47EBF488015848C847C8E4C767D7B9F57`（本地=线上） |
| 赛程块 | `assets/TournamentScheduleV2-DLcgcN7v.js`，SHA-256 `4A66FE894671F99F545A7D450AA7A9EB3B3CDE5D50C01850B2EC510A85671A9B`（本地=线上） |
| 报名块 | `assets/TournamentTeams-BPsFO0vA.js`，SHA-256 `EE434F571228883FAE191BBA50F49D3D7E4AC16D0D508159D4CC358CCDF0EA54`（本地=线上） |

赛程块线上命中：`postponedTo` 3、`isPostponedPlaceholder` 7、`postpone-badge` 1、`原定为` 1、`延期至` 1、`首场开赛` 1、`末场开赛` 1、`整场` 4、`data-sxf-pad-client` 1、`pointer: coarse` 1、`sxfSchedulePendingPool` 0、日期归一化 `slice(0,10)` 10。

报名块线上命中：`同一球员限报一个组别` 2、`报名材料` 5、`idDocs` 10（`idDocsEnabled` 为函数名，压缩后以 `idDocs` 形态存在，非字符串标识）。

三条线标记在同一次构建中齐全，正式 `/admin/` 与 `main` 本轮未动。

## 七、开赛点改为「顶部唯一真源 + 场地单向筛选」（第三次预览发布）

日期：2026-11-06。用户否定「按场地窗口自己递进造点」，截图证据为顶部出现未手工输入的 `17:19`（改 3号场地首场时被算出并写回顶部）。本轮彻底切断双向绑定。

### 模型

1. 顶部「开赛点」是唯一真源，只有用户手工增/删/改才写 `config.kickoffTimes`；场地字段改动不写回（`watch` 自动同步、保存回写、派生点入池三条路径全部移除）。
2. 每场地可用点 = 顶部池中落在「首场 ≤ t ≤ 末场」闭区间内的点，保持池内原序，不新增、不重排、不递进生成。
3. 窗口内 0/1 个点不补点，如实显示并提示「该时间窗内只有 N 个开赛点，请到上方开赛点补充」；首场 > 末场提示「首场晚于末场，请调整时间窗」并阻断保存。
4. 整场时长（单段 × 段数）只用于占用与冲突检测；场地行改为显示池内相邻点实际差值「相邻间隔 30/45 分钟 · N 场/天」。
5. 清理脏数据：加载时首次迁移剔除不在 5 分钟刻度上的历史派生点；`venueResources[].kickoffTimes` 中不在池内的点直接清掉。
6. 理论容量 = Σ(每场地窗口内筛出的点数) × 有效比赛日。
7. 顺带修复：首场/末场原先没有落库（后端 `saveDraft` 只保留 `name/fieldFormat/sessionWindows/kickoffTimes`，顶层 `startTime/endTime` 被剥离），现在写进场地 `sessionWindows` 首末两端，刷新后不再回落到 09:00–18:00。

### 当前数据实测（读回 `tournaments/26e7c5456adecdd30020191b6e6e2c3d.scheduleDraft`）

- 顶部池还原值：`15:00 / 17:00 / 18:50 / 20:10`（顶层 `kickoffTimes` 被后端剥离，按三块场地保存点位的并集还原）
- 三块场地旧数据没有 `startTime/endTime`，加载后窗口按 09:00–18:00 计算：每场地 2 点 → 6 场/天 × 28 天 = **168**
- 按用户截图窗口（1号 09:00–18:00、2号 18:50–20:10、3号 17:00–18:00）：2 + 2 + 1 = 5 场/天 × 28 天 = **140**（与截图数值相同，但不再由整场时长递推）

### 发布与回读

| 项 | 值 |
|---|---|
| 源码 commit | `b3f1d12bf`（模型改造）+ `81938ce0b`（首末场落库） |
| 构建基点 | `origin/preview` = `fb4f57b70` |
| 线上 `index.html` 引用 | `assets/index-DCZAYZ3B.js`（11:41:53 GMT） |
| 入口 SHA-256 | `CD602C1C019DFE277F105E6962A902E35ECDF16BE7B52A545E5459651A0A1EFF`（本地=线上） |
| 赛程块 | `assets/TournamentScheduleV2-DzCMpD6o.js`，SHA-256 `B21655FFE8B791709484E6E9B35E2B1469603C5926F6E82DBF0A024078D03249`（本地=线上） |
| 报名块 | `assets/TournamentTeams-CGvxy3xy.js`，SHA-256 `873036AB7BAF561692BA8391F3BB36C89CCE12CF4BF0291E937B26DF76F1349E`（本地=线上） |

线上命中：`postponedTo` 3、`isPostponedPlaceholder` 7、`postpone-badge` 1、`原定为` 1、`延期至` 1、`首场开赛` 1、`末场开赛` 1、`sxfSchedulePendingPool` 0、`该时间窗内只有` 2、`首场晚于末场` 2、`相邻间隔` 1、`唯一来源` 1、`data-sxf-pad-client` 1；报名线 `同一球员限报一个组别` 2、`报名材料` 5、`idDocs` 10。

### 后端待办（未部署）

1. `sanitizeScheduleDraft` 白名单补顶层 `kickoffTimes`（否则顶部池每次刷新都只能靠场地并集还原，窗口外的点会丢）。
2. 白名单补 `venueResources[].startTime/endTime`（或统一以 `sessionWindows` 首末为窗口真源，前端已按后者落库）。
3. 窗口外/窗口内点不足时的排程策略需与前端提示口径一致，不要再按整场时长补点。
