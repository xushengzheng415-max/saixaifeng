# 接手记录：PC 后台演示模式「手动排赛拖拽放不进去」

> 接手时间：2026-10-19
> 前序：`docs/HANDOVER_SCHEDULE_DRAG.md`
> 本文件记录接手核验与真机复现结论，不是产品文档。

---

## 0. 结论（先读这段）

**线上 dist 的拖拽链路是通的。** 用真实 Chrome 155 + CDP `Input.dispatchMouseEvent` 做真实鼠标拖拽（非合成 DragEvent），在干净演示数据下 **8 场全部放置成功**（待排 8→5，日历 3 场，toast 正常「第N场已安排到X场地 HH:MM」）。

**用户看到的「禁止符号」来自落点，不是链路故障。**

`dragover` 只绑在 `<td>` 上（模板 `@dragover.stop.prevent`），因此：

| 落点 | preventDefault | dropEffect | 光标 |
|---|---|---|---|
| `TD`（时间格） | ✅ | `move` | 正常（可放置） |
| `TH`（时间列 / 场地表头） | ❌ | `move`（但未 preventDefault） | **禁止符号** |
| 表头行 / 格子缝隙 / 横向滚动区外 | ❌ | — | **禁止符号** |

落点不在 `TD` 时：`drop` 不触发 → **没有任何提示** → 卡片弹回。这与用户「没有提示！就是不让你拖，有个禁止符号」完全吻合。

---

## 1. 复现方法（可复用）

真机复现脚本在 `.codex-artifacts/schedule-drag-probe-20261019/`，用 Chrome CDP 驱动：

```bash
# 1. 启动 headless Chrome（后台任务）
chrome --headless=new --remote-debugging-port=9333 --user-data-dir=<临时目录> about:blank
# 2. 跑探针（Node 22 内置 WebSocket，无需任何依赖）
node cdp-probe17.mjs
```

关键要点（踩过的坑，接手别重复）：

1. **演示模式仍需伪造本地登录态**：路由守卫 `router/index.js:718` 要求
   `isDemoMode() && localStorage.isLoggedIn==='true' && hasOrganizerSession()`，
   `hasOrganizerSession()` 需要 `loginType='wechat'`、`currentRole`、`authSessionVersion='phone-canonical-web-v1'`、`authToken` 同时存在。只设 `sessionStorage` 会跳登录页。
2. **演示快照结构**：`{ owner, data: { sequence, tables: { tournaments, divisions, matches, teams, players, referees } } }`。
3. **`calendarConfigured` 依赖 `config.matchDates`（日期数组），不是 `matchDays`**。`applySavedConfig` 优先读 `matchDates`，其次用 `matchDays`（星期数组）推导。只给 `matchDays` 会判定未配置。
4. **待排抽屉默认收起**，收起且无已排比赛时日历不渲染（`td` 为 0）。必须先点「打开待排比赛」。
5. `view=settings` 能读到配置而 `view=map` 首屏显示「先创建赛事日历」，在补齐 `matchDates` 后可正常进入地图；如仍异常，先在 settings 点一次保存再切 map。

---

## 2. 真机测试结果

### 2.1 拖拽链路（干净演示数据，2 块 7 人制场地，8 场待排）

| 次数 | 动作 | 结果 |
|---|---|---|
| 1 | 拖到 09:00 | 成功 |
| 2 | 再拖到 10:00 | 成功 |
| 3 | 放置后仅等 200ms 再拖到 11:00 | 成功（`prevented=true` `effect=move`） |
| 4 | 拖到已被占用的格子 | 后端拒绝，不放进去（toast 3 秒后消失，容易误判为「没提示」） |

**「提交锁 `dropSaving` 卡住导致禁止符号」的假设被否定**：连续拖拽时 `dragover` 始终 `prevented=true`、`dropEffect=move`。

### 2.2 不同拖拽起点对比（同一目标坐标）

| 起点 | dragstart | drop | 放置成功 | 落点元素链 |
|---|---|---|---|---|
| 卡片队名文字 | ✅ | ✅ | **✅ 6→5** | ARTICLE → STRONG → SMALL → **TD** |
| 卡片中心 | ✅ | ✅ | ❌ | … → **TH** → SPAN → EM |
| 「点选放置」按钮 | ✅ | ✅ | ❌ | … → **TH** → SPAN → EM |
| 「拖动」按钮 | ✅ | ✅ | ❌ | **TH** → STRONG → SPAN → EM |

后三种失败**不是起点问题**，而是前一次放置后布局变化，旧坐标落到 `TH` 上。这也说明：**坐标偏一点就落到表头/时间列，用户很容易踩到。**

### 2.3 界面实测尺寸（1600×1000 视口）

- 左侧待排抽屉约 200px
- 时间列（`TH`）约 90px 宽，正好在「待排卡片 → 场地格」的拖拽路径上
- 单块场地列约 560px 宽；**第 2 块场地列被横向截断**，需横向滚动才能看到
- 单个 `TD` 高约 130px，内部空态显示「1号场地 · 09:00 / 拖入比赛」

---

## 3. 对前序交接文档的更正

前序文档第 4、6 节关于「dist 含全部修复」的描述**是对的**，我最初误判为「不含」，原因是搜错了 chunk：

- `demoWorkspace` 的后端逻辑被打进入口包 **`assets/index-DmyUnowl.v3.js`**，不在赛程分包 `TournamentScheduleV2-Ml4Pa_Z_.v3.js` 里。
- 入口包中确认存在：`该时段已有比赛`(2)、`比赛制式与场地不匹配`(1)、`没有兼容`(1)、`容量不足`(1)、`object Object` 自愈(1)、`fieldFormat`(4)、`matchFormat`(5)。
- `venueNameOf` 被压缩为 `E(m){return m&&typeof m=="object"?String(m.name||"").trim():String(m||"").trim()}`，按原名搜索为 0 属正常。

**线上部署状态复核**：`https://www.sxffootball.cn/preview/admin/index.html` 入口确为 `assets/index-DmyUnowl.v3.js`，与本地 `dist/` 一致，可排除「用户测的是别的构建」。

---

## 4. 源码与 dist 的差异（仍需注意）

| 项 | dist（线上） | 当前源码（`codex/platform-ops`） |
|---|---|---|
| `startDrag` | 无 `dropSaving` 检查 | **有** `if(dropSaving.value){event.preventDefault();return}` |
| `applySavedConfig` | 用 `matchDates` | 用 `matchDays` |
| 点选放置 | 有（`_l`/`kl`/`bl`） | **已移除** |
| `confirmedPairings.js` | 不引用 | 第 5 行 import，**文件缺失** |

**风险**：源码版 `startDrag` 在 `dropSaving` 为真时会 `preventDefault()` 直接取消拖拽——一旦该版本上线，用户会遇到「按下去就拖不动 + 禁止符号」。**部署源码版会引入比线上更严重的问题。**

---

## 5. 建议的修复（待用户确认）

按影响从大到小：

1. **消除误导性禁止符号**：给 `.calendar-scroll` / 日历容器加 `@dragover.prevent`，让整个日历区域不再显示禁止光标；在 `drop` 时若落点不是 `TD`，提示「请拖到场地时间格内」。
2. **表头也接受拖拽**：`TH` 加 `@dragover.prevent`，拖到表头时引导「请往下拖到时间格」。
3. **扩大有效落点**：减少格子间缝隙，或给 `TD` 增加内边距，降低「差几像素落空」的概率。
4. **解决横向截断**：场地列在 1600px 下仍被截断，建议压缩列宽或拖拽时自动横向滚动到目标列。
5. **冲突提示更持久**：冲突 toast 建议延长到 6-8 秒，或在格子内就地标注占用信息（避免用户以为「没提示」）。

**前置条件**：当前工作区源码不可构建（缺 `confirmedPairings.js`），改动前需先从 `codex/fix-demo-screen-open-20261017`（提交 `9ef54bc7`）恢复该文件，或直接基于 `dist/` 反解。

---

## 6. 约束（沿用）

- `/preview/admin/` 有长期部署授权，但**必须走 preview 分支流程**；当前在 `codex/platform-ops`，不能直接部署。
- 禁止对主仓库 `git reset --hard` / `git clean` / `git checkout -- .`（大量未提交跨端改动）。
- 禁止读取/打印/提交凭据文件（`%LOCALAPPDATA%\SxfCloud\credentials\`）。
- 云函数本轮无需改动。
