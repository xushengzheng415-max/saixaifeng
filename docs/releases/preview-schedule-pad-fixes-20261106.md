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
