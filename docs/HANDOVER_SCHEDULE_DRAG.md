# 交接文档：PC 后台演示模式「手动排赛拖拽放不进去」

> 交接时间：2026-10-19
> 交接原因：当前会话排查「拖动无法放置」，合成拖拽验证已通过但用户真实操作仍失败，用户要求交由其他 AI 工具接手。
> 本文件仅供接手排查使用，不是产品文档。

---

## 0. 一句话结论（先读这段）

线上预览包（`/preview/admin/`）的拖拽链路，经真实 Chromium 合成拖拽测试**可以成功放置**（待排卡片 6 → 5，toast 正常，无任何 JS 报错）。

但用户真实鼠标操作仍反馈「拖不进去」。**剩余差异只可能落在三处之一**：

1. 用户端松手那一刻弹出的红色提示（最常见，见第 8 节）
2. 真实鼠标的 `drop` 事件没落在时间格内（静默弹回）
3. 用户测的不是这个构建（浏览器/CDN 缓存），或测的不是干净演示数据

**接手第一件事：拿到用户松手瞬间的 toast 原文。** 有文案 → 直接定位；没文案 → 按第 8 节优先级 2 排查。

---

## 1. 复现路径

### 1.1 URL

```
https://www.sxffootball.cn/preview/admin/#/tournaments/demo-tournaments-2553/matches?date=2026-10-22&divisionId=demo-divisions-2562
```

说明：用户提供的 `divisionId=demo-divisions-2562` 与验证时用的 `demo-division-2554` 都是演示快照里的组别 id，作用相同（组别筛选参数）。**演示数据的 `_id` 是快照生成的，每次重建可能不同**，不要硬编码这些 id。

### 1.2 演示模式（不需要登录）

- `sessionStorage['sxfTournamentDemoMode'] = '1'` —— 模式开关
- `sessionStorage['sxfDemoWorkspaceV2'] = JSON.stringify({owner, data})` —— 数据快照
- 判定前提：`import.meta.env.BASE_URL` 必须以 `/preview/admin/` 开头（见 `demoMode.js` 的 `isDemoModeAvailable()`），**正式站 `/admin/` 没有演示模式**
- 演示数据是**标签页会话级**的：关掉标签页即清空，下次进入自动重建干净数据

### 1.3 操作步骤

进入赛事 → 比赛管理 → 点右上「待排比赛」打开左侧待排抽屉 → 把左侧卡片拖到右侧场地时间格。

注意：待排抽屉默认是**收起**的；抽屉收起且没有已排比赛时，页面显示的是「暂无已编排比赛 / 进入赛程设置」引导页，这是**正常现象**（日历只返回有已排比赛或有待排抽屉展开的日期），不要误判为数据加载失败。

---

## 2. 系统链路（关键）

### 2.1 前端拖拽（TournamentScheduleV2.vue）

```
待排卡片 <article draggable="true" @dragstart="startDrag(match,$event)">
时间格   <td @click="cellClick(venue.name,time)"
             @dragover.stop.prevent="hoverDropSlot(venue.name,time,$event)"
             @drop.stop.prevent="dropToSlot(venue.name,time,$event)">
```

- `startDrag`：设置 `draggedMatchId`，`dataTransfer.setData('application/x-sxf-match-id', ...)` 和 `setData('text/plain', ...)`（Chrome 必须 setData 才能起拖）
- `dropToSlot`：从 dataTransfer 读 matchId（回退 `draggedMatchId`）→ 两段式 `assignRows`（先 dryRun 再 apply）
- 两段式调用：`callFunction('generateSchedule',{action:'importScheduleAssignments', tournamentId, rows:[{matchId,matchDate,matchTime,venue}], dryRun})`

### 2.2 演示后端（demoWorkspace.mjs → `schedule()` → `importScheduleAssignments`）

校验顺序：
1. 比赛存在、不属于已取消/遗留对阵
2. 比赛状态为 `scheduled` 且无事件（已开赛不能调整）
3. 日期/时间格式、venue 非空
4. 制式匹配（场地 `fieldFormat` vs 组别 `matchFormat`）
5. 冲突检测：**同场地且时段重叠，或共享球队** —— 遍历全部比赛（**包含被组别筛选隐藏的场地列和其他日期**）
6. 默认比赛时长 50 分钟（`durationMinutes || scheduleDraft.matchDurations[divisionId] || 50`）

### 2.3 正式后端

- `cloudfunctions/generateSchedule/index.js`：`importScheduleAssignments`、`scheduleExistingPairings`
- `cloudfunctions/generateSchedule/scheduler.js`：调度引擎，**本来就按 `requiredVenueFormat` 过滤场地**
- ⚠️ 正式端与演示端原本行为不一致：正式端有制式过滤、演示端没有（见根因 B）

---

## 3. 已定位根因

### 根因 A：点选放置把「场地对象」当成「场地名」传（已修，用户已确认有效）

`TournamentScheduleV2.vue` 模板里：

- 拖拽通道写的是 `venue.name` ✅
- 点选通道写成了 `cellClick(venue,time)` ❌ —— 传的是整个场地对象

对象一路传到后端，`String(entry.venue)` 变成字面量 `'[object Object]'` 存进比赛场地字段。后果：

- 这些比赛的场地名匹配不上任何列 → **格子里看不见**（用户看到"待排 76 场但很多比赛消失"）
- 冲突检测仍能命中它们 → **每次都报"该时段已有比赛"，永远放不进去**
- 用户截图已证实：报错文案是 `[object Object]该时段已有比赛`

修复：`@click="cellClick(venue.name,time)"`；演示端加 `venueNameOf()` 归一化；加 `healMatchVenues()` 自愈历史污染行（把 venue 为 `'[object Object]'` 的比赛清空排期、退回待排池）。

### 根因 B：演示自动排程不按场地制式过滤（已修）

`demoWorkspace.scheduleExistingPairings` 原先遍历**全部**场地名，导致 5 人制比赛被排进 7 人制场地。用户按组别筛选后，兼容场地列被错误排法塞满、其余比赛藏在被隐藏的列里 → 每次拖拽都撞冲突。

正式后端 `scheduler.js`（约 254-267 行）本来就有 `requiredVenueFormat` 过滤，演示端缺失，属两端行为不一致。

修复：按组别制式过滤可用场地；无兼容场地时报明确错误；容量不足文案对齐正式后端。

---

## 4. 已做的修复清单

### 4.1 前端模板（TournamentScheduleV2.vue，日历表格 `<td>` 一行）

```diff
- @click="cellClick(venue,time)"
+ @click="cellClick(venue.name,time)"
```

### 4.2 demoWorkspace.mjs

- 新增 `venueNameOf(value)`：对象取 `.name`，否则 `String().trim()`
- 新增 `healMatchVenues()`：在 `query()` 和 `schedule()` 入口调用，自愈 `'[object Object]'` 污染行
- `importScheduleAssignments`：
  - 用 `venueNameOf()` 归一化 venue，不再产出 `'[object Object]'`
  - 新增制式校验，不匹配则报 `比赛制式与场地不匹配`
- `scheduleExistingPairings`：
  - 新增 `divisionFormatOf(divisionId)` 推导组别制式
  - 按制式过滤每场比赛的可用场地 `rowVenues`
  - 无兼容场地时报 `没有兼容「X人制」的场地，请在赛程设置中调整场地制式`
  - 容量不足文案改为 `当前日期、场地或阶段容量不足，仍有N场比赛未完成安排；请增加比赛日、场地或调整时段`

> ⚠️ **这些修复只存在于「已部署的构建产物」中，工作区源码已被并行会话改掉、不含这些内容** —— 详见第 7 节。

---

## 5. 验证记录（已完成）

### 5.1 Node 端到端 · 制式过滤（9 项全过）

- 自动排程：U10（5 人制）6 场全部落 1 号场地；U12（7 人制）6 场全部落 2 号场地；**跨制式 0 场**
- 手动把 5 人制比赛放到 7 人制场地 → 正确拦截，报 `比赛制式与场地不匹配`
- 同制式正常放置 → 通过
- 同场地同时段冲突 → 正确拦截，文案带真实场地名
- 容量不足（1 个比赛日放不下 15 场）→ 报错且**回滚干净、无半截落库数据**

### 5.2 Node 端到端 · venue 对象与污染自愈（5 项全过）

- 传场地对象 → 归一化存成 `2号场地`（不再是 `[object Object]`）
- 手工注入污染行 → 下次查询自动退回待排池（`scheduleStatus: unassigned`）
- 自愈后可正常放置
- 冲突提示文案为真实场地名

### 5.3 真实 Chromium · 对线上包做合成拖拽

- 待排卡片 **6 → 5**，放置成功
- toast 正常，`drop` 事件携带正确 matchId
- 无 `error` / `unhandledrejection` 日志

**结论：线上包拖拽链路是通的。用户侧失败原因待定。**

---

## 6. 线上部署状态

| 项 | 值 |
|---|---|
| 预览站 | `https://www.sxffootball.cn/preview/admin/` |
| 当前入口 | `assets/index-DmyUnowl.v3.js` |
| 赛程分包 | `assets/TournamentScheduleV2-Ml4Pa_Z_.v3.js` |
| 哈希 | 入口 SHA256 `F41E205A815D4144837DE79A45B99B9EBAD6B31018AF62265D9D437E92805902`，与本地 `web-admin-vue/dist` 完全一致 |
| 包内容 | **含点选放置 + 第 4 节全部修复** |
| 云函数 | 本轮未改动（正式后端本来就有制式过滤，无需部署） |

**重要**：`web-admin-vue/dist/` 目录里仍保存着这份**已部署且经哈希验证的构建产物**。由于工作区源码当前不可构建（见下节），如需重新上线，直接从 `dist/` 部署即可，不要改代码重建。

部署命令：

```powershell
E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football run hosting deploy web-admin-vue/dist preview/admin --concurrency 3 --retry-count 8 --retry-interval 3000
```

---

## 7. ⚠️ 工作区源码风险（接手必读，先做这一步）

排查期间另一并行会话正在改同一批文件。**当前工作区源码与线上包不一致**，具体：

1. **当前 git 分支是 `codex/platform-ops`**（平台运营后台长期分支），不是 `main` / `preview`。按 `AGENTS.md`，PC 后台预览发布必须走 preview 分支流程。
2. `web-admin-vue/src/utils/demoWorkspace.mjs` 与 `src/views/tournament/TournamentScheduleV2.vue` 已被改成另一版本：**不含第 4 节任何修复**，且**点选放置功能已被整体移除**（源码中已无 `cellClick` / `placeToSlot` / `togglePlaceMode` / `placingMatch`）。
3. `demoWorkspace.mjs` 第 5 行 `import confirmedPairings from '../../../cloudfunctions/generateSchedule/confirmedPairings.js'`，而该文件**当前不存在** → 直接 `npm run build` 会报 `ERR_MODULE_NOT_FOUND`。
4. 仓库根目录另有大量 `cloudfunctions/**` 未提交改动（并行会话产物）。

**行动建议**

- 接手前先确认并行会话是否已停止；若未停止，请先停掉，否则会继续互相覆盖
- **禁止**从当前工作区源码构建部署（会丢掉点选放置和全部修复并导致构建失败）
- **禁止**对主仓库执行 `git reset --hard` / `git clean` / `git checkout -- .`（有大量未提交跨端改动）
- 若确需重建，必须先恢复：点选放置模板与函数、第 4 节三项修复；或从线上包/`dist/` 反解
- 需要产物时，优先直接复用 `web-admin-vue/dist/`

---

## 8. 下一步排查方向（按优先级）

### 优先级 1：拿到用户端松手瞬间的 toast 原文（最有价值）

**情况 A：有红字提示** → 提示即根因。最可能是 `某队该时段已有比赛`。

原因：冲突检测是**跨全部比赛**的，包含被组别筛选隐藏掉的场地列和其他日期。用户只看到一列兼容场地，看不到其他列已排的比赛，于是以为格子是空的。

排查方向：`visibleVenues` 只控制**显示**，但冲突检测用的是全量 `matches`。建议在 UI 上把隐藏列/其他组别的已占时段提示出来（例如在格子里标"13:00 已被 X 组别占用"），或在错误提示里明确说清是被哪场、哪个场地占的。

**情况 B：没有任何提示、卡片直接弹回** → `drop` 事件没落在时间格内。

常见落空位置：拖到格子与格子的缝隙、拖到左侧时间列、拖到表格外/横向滚动条上。建议加落点引导（"请松手到时间格内"）或扩大 `td` 落点。

### 优先级 2：真实鼠标与合成事件的差异

- Chrome 真实拖拽需要移动数像素才触发 `dragstart`；用户"拖了但没移动够"会静默失效
- 拖拽过程中若页面发生 `load()` 重渲染，卡片 DOM 被替换，可能中断拖拽
- 建议在 `dropToSlot` 入口、`catch`、以及 `dragover` 里加 `console.log` 埋点（打印 `dataTransfer.types`、落点 venue/time、是否进入 catch），再让用户复现一次，从控制台读日志

### 优先级 3：确认用户测的是哪个构建（缓存）

- 让用户用**无痕窗口**打开，或 `Ctrl+F5` 强刷
- 或在 URL 后临时加版本参数绕过微信/CDN 缓存
- 核对线上入口 chunk 是否为 `index-DmyUnowl.v3.js`

### 优先级 4：确认用户测的是哪份演示数据

- 演示数据 id 依快照而定，旧快照可能残留污染行
- 建议让用户退出演示模式再重进（`setDemoMode(false)` 会清掉 `sessionStorage` 数据与模式），拿到干净数据

### 优先级 5：兜底方案

点选放置通道**已在线上可用，且用户已确认有效**（"现在点选没问题了"）。若拖拽短期难修，可让用户先用点选放置完成排赛。

---

## 9. 测试方法（接手可直接复用）

演示模式不能靠"打开页面就切换演示模式"来测，因为：

- hash 路由跳转**不会重新加载页面**，`demoRequest` 的模块级 workspace 单例会保留旧身份（空数据），于是报"演示空间中没有这条记录"
- 页内动态 `import('.../demoWorkspace.mjs')` 会因 Vite `fs.allow` 限制失败（它引用了 `web-admin-vue` 之外的 `cloudfunctions/**`）

**可行方案：Node 预生成快照 + 本地 CORS HTTP 服务 + 页面 fetch 注入 sessionStorage + 强制整页 reload**

1. Node 脚本用 `createDemoWorkspace()` 造数据并 `workspace.snapshot()`，写 JSON
   - 若 Node 直接 import 报模块缺失（如 `confirmedPairings.js`），可先生成一份打桩副本再 import
2. 本地起 CORS 服务（如 8765）提供该 JSON
3. 浏览器里：
   ```js
   fetch('http://localhost:8765/').then(r=>r.text()).then(t=>{
     sessionStorage.setItem('sxfTournamentDemoMode','1')
     sessionStorage.setItem('sxfDemoWorkspaceV2',t)
     setTimeout(()=>location.reload(),300)   // 必须 reload，否则单例残留
   })
   ```
4. 合成拖拽（Chromium 有效）：
   ```js
   const card=document.querySelector('.pending-list article')
   const td=[...document.querySelectorAll('td')].find(x=>x.textContent.includes('13:00'))
   const dt=new DataTransfer()
   card.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:dt}))
   td.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt}))
   td.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}))
   ```
   放置成功判据：`document.querySelectorAll('.pending-list article').length` 减少 1

**注意**：评估脚本要采用两段式（异步结果写 `window.__x`，立即返回，再二次读取），否则易因页面 reload 销毁执行上下文而拿到 `undefined`。

---

## 10. 关键文件索引

| 文件 | 作用 |
|---|---|
| `web-admin-vue/src/views/tournament/TournamentScheduleV2.vue` | 赛程地图页：拖拽、点选放置、冲突提示、容量筛查 |
| `web-admin-vue/src/utils/demoWorkspace.mjs` | 演示模式本地仓储：`importScheduleAssignments`、`scheduleExistingPairings`、`generatePairings` |
| `web-admin-vue/src/utils/demoMode.js` | 演示模式开关、快照读写、`isDemoMode()` 判定 |
| `web-admin-vue/src/utils/scheduleKickoffTimes.mjs` | 开赛时间解析（`configuredKickoffTimes`、`kickoffPeriod`） |
| `web-admin-vue/src/views/tournament/PairingResult.vue` | 赛程中心页 |
| `cloudfunctions/generateSchedule/index.js` | 正式后端：`importScheduleAssignments`、`scheduleExistingPairings` |
| `cloudfunctions/generateSchedule/scheduler.js` | 正式调度引擎（含 `requiredVenueFormat` 场地过滤） |
| `web-admin-vue/dist/` | 已部署且经哈希验证的构建产物（可直接复用） |
| `docs/PREVIEW_RELEASE_WORKFLOW.md` | 预览/正式发布流程 |
| `AGENTS.md` | 项目红线（身份、租户、WXML、发布纪律） |

---

## 11. 约束提醒

- **发布**：`/preview/admin/`（测试版）有长期直接部署授权；`/admin/`（正式版）**必须用户明确指示**才能部署
- **构建**：`$env:VITE_APP_BASE='/preview/admin/'; npm run build`（但见第 7 节风险，当前源码不可构建）
- **禁止**：读取/打印/提交凭据文件（`%LOCALAPPDATA%\SxfCloud\credentials\`）；对主仓库 `reset --hard` / `clean`
- **云函数**：正式后端本轮无需改动；如需改动，发布前必须跑 `node tools/check-referee-backend-package.cjs <包目录>` 防回退
- **分支纪律**：主办方走 `main` / `preview`；平台走 `codex/platform-ops`；禁止跨分支整体合并或覆盖
