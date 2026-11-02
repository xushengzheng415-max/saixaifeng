# 赛事转会中心后端部署技术文档

版本：v1.0｜日期：2026-10-26｜状态：**本地候选，尚未部署**。本文只描述“把已完成的底层代码安全上线”的步骤、证据与禁止项，不把 Q01—Q09 待决项写成规则。

方案与逐页设计见 [`docs/TRANSFER_CENTER_PLAN_2026-10-26.md`](../TRANSFER_CENTER_PLAN_2026-10-26.md)；字段契约见 [`docs/data-center/CONTRACT.md`](../data-center/CONTRACT.md)；入口登记见 [`docs/data-center/INTEGRATION.md`](../data-center/INTEGRATION.md)。

---

## 一、结论速览（先回答三个问题）

| 问题 | 结论 |
| --- | --- |
| 需要新建集合吗 | **需要，9 个**：`transfer_windows`、`transfer_requests`、`transfer_offers`、`transfer_events`、`transfer_cooldowns`、`player_contracts`、`player_loans`、`contract_renewals`、`transfer_free_signings`。另有 3 个既有集合做幂等登记：`player_team_memberships`、`player_transfers`、`player_valuations`。 |
| 要建索引吗 | **本轮不阻塞上线，但应在有真实数据前补上**。查询已全部改成“确定性文档 ID 直读”+“带等值条件的 `_id` 游标续页”，仍走主键即可正确运行；上线后一旦有量，按 4.2 建索引，否则单次读取会变慢但不会返回错误结果。详见第四章。 |
| 要部署几个云函数 | **必须 3 个**：`dataCenter`、`webLoginApi`（子账号审核已在 2026-10-26 确认开放，中转层必须放行 `transfer*`）、`tournamentStaffAccess`（授权接口必须接受 `event.transfer`）。三者均**不改运行配置、不加环境变量、不改超时／内存／运行环境**。 |

**执行顺序不可颠倒**：建集合必须发生在“第一次真正调用转会写动作”之前。集合缺失时读接口会降级为空，写接口会直接失败。

---

## 二、交付物清单

### 2.1 新增文件

| 文件 | 作用 |
| --- | --- |
| `cloudfunctions/dataCenter/transfer/rules.cjs` | 纯规则层：分存金额、条款归一化、窗口状态机、报价／接受／还价／拒绝／撤回／审核状态补丁、三轮上限、24 小时冷却、一年合同、租借到期判定、续约日期校验、身份判定、分页、Q01—Q09 显式拦截。 |
| `cloudfunctions/dataCenter/transfer/service.cjs` | 事务编排层：23 个领域动作（市场、球员详情、谈判、审核交接、自由签约、合同、续约、窗口、主办记录、到期任务）。 |
| `cloudfunctions/dataCenter/transfer/index.cjs` | 路由层：`transfer*` action 白名单与赛事子账号边界。 |
| `tools/test-transfer-center.cjs` | 本地回归（内存数据库桩），覆盖规则、事务、幂等、越权、子账号边界与跨函数接线断言。 |

### 2.2 修改文件（按部署目标分组）

**dataCenter（必须部署）**

| 文件 | 改动 |
| --- | --- |
| `index.js` | ① 顶部引入 `transfer/index.cjs` 与转会集合常量；② 在 staff 门禁之前接入转会路由；③ `initializeCollections` 集合名单扩展为 12 个（去重）。 |
| `identity.cjs` | staff 鉴权可接受权限数组增加 `event.transfer`（仅为让“只持转会权限”的子账号能通过鉴权，不放开其他动作）。 |
| `staffPolicy.cjs` | `SIDEBAR_RIGHTS` 增加 `event.transfer`。 |

**webLoginApi（必须，子账号审核已确认开放）**

| 文件 | 改动 |
| --- | --- |
| `staffRelayRights.cjs` | `dataCenter` 的 `transfer*` action 改为要求 `event.transfer`；非转会 action 保持原 `event.dashboard／event.teams／event.results／event.registration` 任一即可。 |

**tournamentStaffAccess（必须，授权接口需接受该权限码）**

| 文件 | 改动 |
| --- | --- |
| `policy.cjs` | `SIDEBAR_RIGHTS` 增加 `event.transfer`，使 `createGrant／updateGrant` 的权限校验接受该权限码。 |

### 2.3 2026-10-26 追加确认规则对应的代码点

| 规则 | 代码点 | 可观察行为 |
| --- | --- | --- |
| 禁止自审 | `transfer/service.cjs` 的 `assertNoSelfReview`，在 `review` 幂等重放之后、状态校验之前执行 | 命中抛 `TRANSFER_REVIEW_CONFLICT`，通过与拒绝同样拦截，单据状态不变 |
| 自由签约仅赛事外球员 | `transfer/service.cjs` 的 `inEventRoster`，在 `freeAgentContext` 解析出签约赛事后执行 | 命中抛 `TRANSFER_FREE_AGENT_IN_EVENT`；签约记录写 `eventScopePolicy='outside_event_only'` |
| 子账号可审核 | `webLoginApi/staffRelayRights.cjs` + `tournamentStaffAccess/policy.cjs` + `dataCenter/identity.cjs` | 持 `event.transfer` 的子账号可通过中转并进入审核；无该权限时 `DATA_FORBIDDEN`／`TOURNAMENT_STAFF_SCOPE_DENIED` |

新增只读集合依赖：`roster_snapshots`、`rosters`（缺失时按“无名单”处理，不会报错）。不新增写集合。

### 2.4 R2 交接包续接补充（2026-10-26，同一本地候选内完成）

| 缺口项 | 本次处理 | 代码点／行为 |
| --- | --- | --- |
| 报价与审核版本 | **已补齐**：版本必须显式提交，不再有“可省略”分支 | `requiredVersion()` 应用于 `submitOffer`／`respondOffer`（接受／拒绝／还价）／`withdraw`／`review`／`respondRenewal`／`saveWindow`（窗口允许 0）；缺版本抛 `TRANSFER_VERSION_REQUIRED`，版本不一致仍抛 `TRANSFER_VERSION_CONFLICT` |
| 查询规模 | **已补齐**：不再整集合扫描后过滤 | 新增 `readRows(db, collection, where, maxRows)` 与 `readEither()`（同一集合多等值范围分读后按 `_id` 去重）；单据按 `playerId／teamId／tournamentId／fromTeamId／toTeamId`，合同／租借按 `playerId／teamId／status`，续约按 `playerId／teamId`，自由签约按 `tournamentId`，到期任务只取 `status=scheduled/active`。市场估值改为按整页（每批 20 个球员）批量读取 |
| 读取失败不得降级 | **已补齐**：原先 5 处 `.catch(() => [])` 全部改为 `readByIds`，读取错误向上抛出 | 市场球队名、我的转会球员、合同页球员、续约球员、主办记录球员 |
| 前端响应契约 | **部分补齐**：每个 `transfer*` 成功响应统一带 `schemaVersion=1`、`serverNow` | `transfer/index.cjs` 的 `withEnvelope`；`requestDetail` 已有 `canAccept／canCounter／canReject／canWithdraw／canReview`，`windowGet` 有 `canConfigure` |
| 当前赛事贯通、公开读与自然人、跨机构交接、队权来源、租借效力跨模块投影、生效时刻（Q08）、榜单与成交（M01／Q09） | **未处理**，仍属待决或需跨模块任务 | 见第九章；本轮不按猜测改身份、权限或跨模块行为。其中市场与球员详情尚未接收 `tournamentId` 上下文（写动作已强制赛事），属本轮范围外的下一步。 |

> **未改动**：`shared/*` 统一数据中心模块、所有前端页面、小程序、服务号 H5、生产数据。因此其他函数里的 `data-center/` 部署副本**不需要重新同步或发布**（`node tools/sync-data-center.mjs --check` 已通过）。

---

## 三、集合清单与创建方式

### 3.1 必须存在的集合

| 集合 | 用途 | 关键字段（详见 CONTRACT.md） |
| --- | --- | --- |
| `transfer_windows` | 赛事转会窗口（单窗口，`_id = sha256('transfer-window:<tournamentId>')`） | `tournamentId`、`seasonKey`、`openFrom`、`openTo`、`version` |
| `transfer_requests` | 转会单（谈判状态机与轮次） | `tournamentId`、`playerId`、`fromTeamId`、`toTeamId`、`type`、`status`、`round`、`turn`、`currentOfferVersion`、`agreedOfferVersion` |
| `transfer_offers` | 不可变报价版本（`_id = sha256('transfer-offer:<requestId>:<version>')`） | `requestId`、`version`、`by`、`terms`、`immutable` |
| `transfer_events` | 事件日志（按 `seq` 递增，不可改写） | `requestId`、`seq`、`action`、`actorUserId`、`fromStatus`、`toStatus` |
| `transfer_cooldowns` | 破裂后同买方 24 小时冷却（`_id = sha256('transfer-cooldown:<teamId>:<playerId>')`） | `playerId`、`teamId`、`until`、`reason` |
| `player_contracts` | 线上合同（象征性文本，一年合同／续约链） | `playerId`、`teamId`、`orgId`、`status`、`validFrom`、`validTo`、`termStatus`、`renewedByContractId` |
| `player_loans` | 租借（原合同队／当前效力队分离） | `playerId`、`ownerTeamId`、`borrowerTeamId`、`kind`、`matchId`、`startAt`、`endAt`、`status`、`expiryState` |
| `contract_renewals` | 续约请求（球队发起、球员服务号回应） | `contractId`、`playerId`、`teamId`、`status`、`requestedBy` |
| `transfer_free_signings` | 自由球员签约记录（`_id = sha256('transfer-free:<userId>:<requestKey>')`） | `playerId`、`toTeamId`、`tournamentId`、`status`、`contractId` |

### 3.2 幂等登记（可能已存在，不新建业务语义）

`player_team_memberships`（归属有效关系，交接与自由签约会写）、`player_transfers`（旧转会流程）、`player_valuations`（估值快照）。`initializeCollections` 对已存在集合返回 `exists`，**不会清空或覆盖数据**。

### 3.3 交接事务还会写这些既有集合（不新建，但必须确认存在）

`players`、`teams`、`player_team_history`（归属流转日志）、`tournament_teams`（参赛关系读取）、`tournaments`、`organization_memberships`、`tournament_staff_grants`、`matches`（单场租借到期判定）。

其中 **`player_team_history` 必须已存在**：审核交接与自由签约在同一事务里写它，集合缺失会导致整笔交接回滚。若生产没有该集合，先停下并单独确认，不要顺手新建后继续。

### 3.4 创建方式（任选其一，均为幂等）

**方式 A：云开发控制台手工创建（推荐，最可控）**
在环境 `cloud1-7g8ckb3c7815a011` 的数据库中，按 3.1 的 9 个名称逐个新建空集合。无需预设字段、无需索引。

**方式 B：平台负责人调用 `initializeCollections`**
- 入口：PC 后台「数据中心」页的 **「初始化关系表」** 按钮（仅平台负责人可见），或经 `webLoginApi` relay 调用 `dataCenter` 的 `initializeCollections`（必须带平台负责人会话）。
- 期望返回：`{ success:true, items:[…] }`，共 **12** 条，状态为 `created` 或 `exists`。
- 该动作只建集合，不写业务数据。

**方式 C：`fn invoke` 直调**（需要平台负责人会话 token，通常不如方式 A/B 方便）

> 无论哪种方式，**建完必须回读集合列表确认 9 个新集合齐全**，再进入验证。

### 3.5 集合缺失时的真实表现（不要依赖它）

- 读：`readOptionalAll` 把“集合不存在”转成 `{status:'not_recorded', rows:[]}`，页面会显示空列表而不是报错。
- 写：会抛数据库错误，事务整体回滚（不会产生半成品归属）。
- 换句话说：**没建集合时，页面看起来“正常但是空的”，一旦提交才失败**——这也是必须先建集合的原因。

---

## 四、索引、配置与性能边界

### 4.1 索引现状与结论

- 所有状态文档都用**确定性 ID** 直读（`doc(id).get()`），只需要主键。
- 列表类读取是 `where({...等值字段})` + `orderBy('_id','asc')` + `_id > 游标` 的 keyset 续页，仍以主键排序；等值字段决定扫描量。
- 因此**不建索引也能正确运行**，返回结果不会因为缺索引而错误或截断；缺索引只影响读取耗时。
- 唯一仍是整集合读取的是 `transferMarket` 的 `players` 列表（上限 20,000 行，因为市场要先列出全部可浏览球员再做筛选与分页）。一旦球员档案超过该预算会抛 `DATA_SCOPE_TOO_LARGE`，届时需要专门的检索投影，不在本次范围。

### 4.2 建议索引（有真实数据量后补，不阻塞本次上线）

| 集合 | 建议索引 | 用途 |
| --- | --- | --- |
| `transfer_requests` | `tournamentId` + `_id` | 主办待审／已审列表按赛事查询 |
| `transfer_requests` | `playerId` + `_id` | 球员详情、发起时的重复单与冷却校验 |
| `transfer_requests` | `fromTeamId` + `_id`、`toTeamId` + `_id` | “我的转会”买卖两向列表 |
| `player_contracts` | `playerId` + `_id` | 自由身判定、球员详情、审核交接预读 |
| `player_contracts` | `teamId` + `_id` | 球队合同页、球队续约 |
| `player_contracts` | `status` + `_id` | 到期任务（`status=active`） |
| `player_loans` | `playerId` + `_id` | 当前效力判定 |
| `player_loans` | `status` + `_id` | 到期任务（`scheduled／active`）、市场有效租借 |
| `player_loans` | `ownerTeamId` + `_id`、`borrowerTeamId` + `_id` | 球队合同页租借分栏 |
| `contract_renewals` | `playerId` + `_id`、`teamId` + `_id` | 球员端／球队端续约待办 |
| `transfer_free_signings` | `tournamentId` + `_id` | 主办自由签约记录 |
| `player_valuations` | `playerId` + `_id` | 市场按页批量取最新估值 |
| `transfer_cooldowns` | `until` | 冷却清理（如后续增加定时任务） |

### 4.3 已知性能边界（如实记录，不隐藏）

- `transferMarket` 的球员列表仍是整集合读取（上限 20,000），见 4.1。
- “我的转会”、球队合同页、到期任务对同一集合按方向分两次等值读取（`readEither`）后合并，查询次数是 2 次而不是 1 次，以换取不依赖 `or／in` 嵌进游标条件。
- 所有超预算情况都抛 `DATA_SCOPE_TOO_LARGE`，不会静默截断；读取失败一律上抛，不会降级成空列表冒充“没有数据”。

### 4.4 配置

- 运行环境保持 **Node.js 18**，入口 `index.main`，内存／超时维持现状，**不要套用 `cloudbaserc.json` 全量配置**。
- **不新增、不修改任何环境变量**。
- 部署时 `installDependency` 必须保持 **TRUE**（历史事故：曾误设 `false` 上传 Windows 版 `node_modules`，导致函数整体加载失败）。
- `dataCenter` 生产依赖仅 `wx-server-sdk`，无新增第三方包。

---

## 五、权限（`event.transfer`）生效链路与授权方式

### 5.1 生效链路（四处，缺一不可）

1. `dataCenter/identity.cjs`：staff 鉴权接受 `event.transfer`（否则子账号连接口都进不去）。
2. `webLoginApi/staffRelayRights.cjs`：`transfer*` action 在 relay 层要求 `event.transfer`（否则 PC 子账号请求被先拦）。
3. `dataCenter/transfer/index.cjs`：审核类动作（`transferReview`／`transferAdminRequests`／`transferAdminRecord`／`transferWindowGet`／`transferWindowSave`）要求该赛事授权内显式持有 `event.transfer`；球队类动作对 staff 一律拒绝。
4. `dataCenter/transfer/service.cjs`：`requireReviewRights` 再核一次“赛事属于当前机构 + 权限命中”，平台负责人只做监督与到期任务。

**默认不放开**：不持 `event.transfer` 的子账号无法审核；`event.dashboard`、`event.teams` 等既有权限**不会**顺手获得审核资格。

### 5.2 如何在生产授予该权限（三选一）

| 方式 | 前置 | 说明 |
| --- | --- | --- |
| PC「赛事授权」界面勾选 | 需先完成 **阶段 C** 部署并补前端选项 | 最规范。当前 `web-admin-vue/src/utils/tournamentStaffRights.js` 与 `platform-admin-vue` 同名文件**都还没有** `event.transfer` 选项，界面无法勾选；补选项属于前端改动，须按其预览→正式发布流程单独进行。 |
| 调用 `tournamentStaffAccess` 的 `createGrant／updateGrant` | 需先完成 **阶段 C** 部署 | 接口层面可授权，但调用方需要一个能填该权限码的界面，否则只能手工构造请求。 |
| 直接写 `tournament_staff_grants.permissions` | 需当前任务明确授权 | 仅作为过渡，必须写审计用途说明；不要批量改、不要给全平台子账号默认加。 |

### 5.3 平台负责人专属动作（不要在验证中随意执行）

- `initializeCollections`：只建集合。
- `transferConfirmContractTerm`：核定合同期限（Q08 待决，目前无合同数据即无处可改）。
- `transferExpireDue`：到期任务。**它会真实改写数据**——合同到期会清除球员球队归属、结束归属关系并写流转历史；单场租借依据比赛正式结束推进；待核对的只做标记。目前生产无合同／租借记录，执行是空转，但仍建议按“只读验证优先”原则，只执行一次并记录返回。

---

## 六、部署步骤（可直接照做）

> 环境固定：`cloud1-7g8ckb3c7815a011`（足球只有这一个环境，“正式”即生产）。凭据使用仓库外 DPAPI 文件，**不得读取、打印、复制或提交** `cloudbaserc.json` 与任何密钥。

### 6.1 阶段 0：本地前置检查（全部必须通过）

```powershell
cd E:\Documents\sxf-football
node --check cloudfunctions/dataCenter/index.js
node --check cloudfunctions/dataCenter/identity.cjs
node --check cloudfunctions/dataCenter/staffPolicy.cjs
node --check cloudfunctions/dataCenter/transfer/rules.cjs
node --check cloudfunctions/dataCenter/transfer/service.cjs
node --check cloudfunctions/dataCenter/transfer/index.cjs
node tools/test-transfer-center.cjs
node tools/test-data-center.mjs
node tools/sync-data-center.mjs --check
node tools/check-data-governance.mjs
```

期望：`node --check` 无输出；测试输出 `PASS: 转会中心规则…赛事子账号边界` 与 `PASS: 生涯/球队/赛事归属…`；两项检查输出 `PASS`。

### 6.2 阶段 A：部署 `dataCenter`（必须）

**A1. 先取得线上包作为差量基线**

```powershell
E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football run fn list
E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football run fn code download dataCenter --dir .\.deploy\dataCenter-baseline
```

**A2. 比对差量（关键风险点）**

本地 `cloudfunctions/dataCenter/` 目前**除了转会相关 6 个文件外，还包含其他任务尚未发布的 `shared/` 改动**（`shared/awards.cjs`、`shared/standings.cjs`、`shared/statistics.mjs`）。

- 若线上包已包含这些改动：整包上传无额外影响。
- 若线上包**不含**：整包上传会把其他任务的共享模块一并推上生产。此时**默认不要整包上传**，改为“线上包 + 差量叠加”：
  1. 复制基线包为发布包；
  2. 只把 `transfer/`（整个目录）、`index.js`、`identity.cjs`、`staffPolicy.cjs` 覆盖进发布包；
  3. 明确记录 `shared/*` 三个文件未纳入本次发布。
- 无论哪种方式，`index.js` 必须与本地版本**逐字节一致**（它已包含 penalties 等既有入口，缺任何分支都会造成接口回退）。

**A3. 部署（保持现有配置，只更新代码）**

MCP 方式（codex 侧）：用 `manageFunctions` / `deployApply` 对 `dataCenter` 上传代码，`installDependency` 保持 TRUE，不提交运行配置变更。

CLI 方式：

```powershell
cd E:\Documents\sxf-football\.deploy\dataCenter-baseline   # 历史经验：需在函数目录内执行，避免 EPERM
E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football run fn code update dataCenter --deployMode cos
```

> 不要使用会套用 `cloudbaserc.json` 全量配置的 `fn deploy`；不要把 `--dir` 指向上级目录。

**A4. 部署后读回**

```powershell
E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football run fn code download dataCenter --dir .\.deploy\dataCenter-after
```

比对 `index.js`、`identity.cjs`、`staffPolicy.cjs`、`transfer/*` 的 SHA-256 与发布包一致；确认函数状态 `Active`、运行环境、内存、超时、环境变量数量未变。

### 6.3 阶段 B：建立集合

按第三章 3.4 任选一种方式创建 9 个集合，然后回读集合列表确认齐全。
若在部署阶段 A 之前就用方式 B，注意 `initializeCollections` 需要**已部署的新版 `dataCenter`** 才能识别 9 个转会集合；旧版只会建 3 个既有集合。因此顺序是：**先部署 A，再建集合**。

### 6.4 阶段 C：只读验证（不写业务数据）

| 探针 | 请求 | 期望 |
| --- | --- | --- |
| 新代码已加载 | `dataCenter` + `{ "action": "transferMarket", "pageSize": 5 }`（不带会话） | `AUTH_REQUIRED`（不再是“未知操作”） |
| 平台负责人专属门禁 | 非平台负责人会话调用 `{ "action": "transferExpireDue" }` | `DATA_FORBIDDEN`「仅平台负责人可执行到期任务」 |
| 无赛事权限的审核 | 无 `event.transfer` 的会话调用 `{ "action": "transferAdminRequests", "tournamentId": "<真实赛事ID>" }` | `DATA_FORBIDDEN` |
| 集合已就绪 | 平台负责人调用 `{ "action": "initializeCollections" }` | 12 条 `items`，全部 `created`/`exists`，无异常 |
| 既有入口未回退 | 平台负责人／机构账号调用 `{ "action": "catalog" }` | 与部署前一致的正常返回 |
| 市场无数据也安全 | 登录球队管理者调用 `{ "action": "transferMarket" }` | `success:true`、`schemaVersion:1`、`serverNow` 为 ISO 时间、`items:[]`、`marketState:'not_recorded'` 或 `ready`，不报错 |
| 自审拦截已生效 | 以“管理任一方球队”的账号对一笔待审单调用 `{ "action": "transferReview", "decision": "reject", "reason": "验证" }` | `TRANSFER_REVIEW_CONFLICT`（**仅在存在真实待审单时才有意义；验证阶段不造单，改用本地测试覆盖**） |
| 自由签约资格已生效 | 对已被列入本赛事名单的球员调用 `{ "action": "transferSignFreeAgent", ... }` | `TRANSFER_FREE_AGENT_IN_EVENT`（同上，无真实数据时不手工造单，靠本地测试覆盖） |

平台负责人可再执行一次 `{ "action": "transferExpireDue" }` 记录返回（当前无合同即空转），但**不要**为了“测试”而手工造合同、造转会单或造球员；自审与自由签约两条新规则由本地测试证明，不在生产造数据验证。

### 6.5 阶段 D（必须）：`webLoginApi` —— 子账号审核中转

> 该函数含裁判表识别／分组保存／纸质报告等已上线接口，**禁止整包覆盖本地目录**。

1. 下载线上包：`fn code download webLoginApi --dir .\.deploy\webLoginApi-baseline`。
2. 在发布包内**只替换** `staffRelayRights.cjs`（把 `dataCenter` 分支改为：`transfer*` 要求 `event.transfer`，其余保持原逻辑），其余文件不动。
3. 必过防回退检查：

```powershell
node tools/check-referee-backend-package.cjs .\.deploy\webLoginApi-baseline
```

期望输出：`裁判表识别、分组保存及必要依赖检查通过`。不通过则先合并最新 `main` 或用刚下载的线上包重做差量，**不要“上传成功”当成通过**。
4. `node --check` 发布包内 `index.js` 与 `staffRelayRights.cjs`。
5. 部署（`installDependency` 保持 TRUE，配置不变），回下载比对 `staffRelayRights.cjs` SHA-256。
6. 探针：无 `event.transfer` 的子账号调用 `transferReview` 应返回 `TOURNAMENT_STAFF_SCOPE_DENIED`；有该权限的账号才进入业务校验。

### 6.6 阶段 E（必须）：`tournamentStaffAccess` —— 授权接口接受该权限码

线上包 + 仅替换 `policy.cjs`（`SIDEBAR_RIGHTS` 加 `event.transfer`），`node --check` 通过后差量部署，回下载比对 SHA-256。随后可用 `createGrant/updateGrant` 授予该权限。

### 6.7 前端授权选项（源码已加，需各自发布流程）

- `web-admin-vue/src/utils/tournamentStaffRights.js`：已在 2026-10-26 追加 `{ key: 'event.transfer', label: '转会中心', suffix: '/transfer' }`，`npm run build` 本地通过。该选项会出现在赛事子账号授权勾选中；**尚未发布**，须按其预览→验收→正式流程上线，本轮不部署 PC。
- `platform-admin-vue/src/utils/tournamentStaffRights.js`：同名拷贝，当前平台工程无授权页面引用；如需平台侧授权，在 `codex/platform-ops` 分支按该分支流程同步，不在本次范围。
- 注意：转会中心 PC 页面与路由尚未开发，勾选该权限在页面落地前不会产生任何可点击入口，仅用于提前授予审核资格。若你希望“页面先上线再开放勾选”，可暂缓该文件发布，仅执行云端步骤。

---

## 七、回滚方案

1. 保留阶段 A1 下载的线上包（回滚基线）。
2. 若新包异常：把该基线包原样 `fn code update` 回去，读回比对 SHA-256 一致即视为回滚完成。
3. **数据层无需回滚**：本轮上线前不存在转会页面／调用方，不会产生转会单、合同或租借记录；新建的空集合保留无害（后续上线仍要用）。
4. 若已执行过 `transferExpireDue` 且有真实合同，回滚代码不会撤销已写入的归属变更——这正是“验证阶段不造数据”的原因。

---

## 八、禁止事项（部署期间）

- 不开发／不发布 PC、小程序、服务号任何转会页面；不修改前端其它模块。
- 不迁移历史合同、不给存量球员补合同、不改 `players.teamId`、不改赛事参赛关系。
- 不造测试转会单／测试合同／测试报价，不用真实球员试签。
- 不把 Q01—Q09 的待决项写成页面默认值、迁移脚本或硬编码规则；相关动作仍返回 `Qxx_PENDING`。
- 不为转会新增支付、到账、薪资、经纪人字段或流程（方案明确不做）。
- 不整包覆盖 `webLoginApi`（裁判表接口防回退）；不套用 `cloudbaserc.json` 全量配置；不改环境变量与其他函数运行配置。
- 不把集合缺失当成“功能正常”：空列表 + 提交报错才是缺集合的真实表现。
- 不把“上传成功”当成上线完成，必须有回下载比对与探针结果。

---

## 九、待确认事项（不要自行决定）

### 9.1 方案内 Q01—Q09（代码目前显式拦截）

| 编号 | 待决内容 |
| --- | --- |
| Q01 | 是否要求买卖两队必须参加同一赛事 |
| Q02 | 跨赛事（不同赛事窗口）审批归属；自由签约是否另需主办审核（球员资格已确认：仅赛事外球员可签） |
| Q03 | 窗口数量、提前关闭、关闭后待审单如何处理 |
| Q04 | 一轮的口径、提前拒绝／撤回是否触发 24 小时冷却、未回复超时 |
| Q05 | 整赛季租借的认定口径、续租对应赛季与是否重审 |
| Q06 | 单场租借到期依据（比赛取消／延期／赛果撤销如何处理） |
| Q07 | 到期前提醒阈值、未回复如何处理 |
| Q08 | 一年合同从哪个生效日计算、旧球员补合同起算日 |
| Q09 | 报价与成交金额的公开范围、零元自由签约是否允许 |

### 9.2 本轮实现暴露的边界（D01／D03 已于 2026-10-26 确认；D04 按 R2 交接包实施）

| 编号 | 问题 | 结论／现状 |
| --- | --- | --- |
| D01 | 同一机构既管球队又管赛事时是否允许自审 | **已确认禁止**。`transferReview` 命中管理关系即抛 `TRANSFER_REVIEW_CONFLICT`，通过与拒绝都拦截，须换人审核。注意：机构负责人可通过机构范围管理本部球队，因此“同一人既管赛事又管这两支球队”时将无法审核，需由其他管理员或平台负责人处理。 |
| D02 | 第一版是否接受“整集合读取 + 内存过滤”的性能形态 | **已改善**：报价、单据、合同、租借、续约、自由签约、主办记录与到期任务均改为带等值范围的读取；仅 `transferMarket` 的球员列表仍是整集合读取（上限 20,000）。见 4.1／4.3。 |
| D03 | 是否现在开放赛事子账号转会审核 | **已确认开放**。阶段 D／E 由“按需”改为“必须”；前端授权选项仍待按各端发布流程补充。 |
| D04 | 报价／接受／撤回／审核／续约是否允许省略版本号 | **按 R2 交接包 §五「报价与审核版本」实施**：版本必须由调用方显式提交，省略即抛 `TRANSFER_VERSION_REQUIRED`，版本不一致抛 `TRANSFER_VERSION_CONFLICT`。旧页面或不带版本的重试不能覆盖他人已确认的条款。 |

---

## 十、本轮本地验证证据（已执行）

| 检查 | 结果 |
| --- | --- |
| `node --check`（`dataCenter/index.js`、`identity.cjs`、`staffPolicy.cjs`、`transfer/rules.cjs`、`transfer/service.cjs`、`transfer/index.cjs`、`webLoginApi/staffRelayRights.cjs`、`tournamentStaffAccess/policy.cjs`、`tools/test-transfer-center.cjs`） | 全部通过 |
| `node tools/test-transfer-center.cjs` | PASS（规则／审核交接／自审拦截／自由签约资格／续约／到期／子账号边界／跨函数接线／版本必填／查询范围／响应信封） |
| `node tools/test-data-center.mjs` | PASS（既有数据中心行为未破坏） |
| `node tools/sync-data-center.mjs --check` | PASS（共享源码与部署副本一致，其他函数副本无需重发） |
| `node tools/check-data-governance.mjs` | PASS |
| `node tools/sync-obsidian-data-center.mjs --check` | `status: current`，无冲突 |

**本轮未执行**：未部署任何云函数、未创建生产集合、未写入生产数据、未改前端、未推送 Git。

---

## 十一、相关文档

- 方案与逐页设计：[`TRANSFER_CENTER_PLAN_2026-10-26.md`](../TRANSFER_CENTER_PLAN_2026-10-26.md)
- 数据契约：[`data-center/CONTRACT.md`](../data-center/CONTRACT.md)
- 入口登记：[`data-center/INTEGRATION.md`](../data-center/INTEGRATION.md)
- 当前进度：[`CURRENT_STATUS.md`](../CURRENT_STATUS.md)
- 发布流程：[`PREVIEW_RELEASE_WORKFLOW.md`](../PREVIEW_RELEASE_WORKFLOW.md)、[`data-center/RELEASE.md`](../data-center/RELEASE.md)
