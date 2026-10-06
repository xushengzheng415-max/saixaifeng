# 实施计划：赛事级球队认领码

**日期**：2026-09-17
**状态**：待执行（规则已确认，代码未动）
**权威依据**：`docs/PRODUCT_RULES.md` 第九节规则 11、13；`docs/ADR.md` 2026-09-17 决策

---

## Aegis Visibility

本改动把球队所有权的授权依据从「每队一个 token」换成「已验证手机号匹配」，属于权限边界变更。计划先固定**单一授权 owner** 与验证口径，再动代码，避免新老两条路径各自维护一份手机号白名单。

---

## 一、Goal

主办方为一个赛事生成**一个**认领码（小程序码 + URL Link），可群发、贴海报。球队负责人扫码后：

```text
扫码 → 小程序认领页（显示赛事信息）
     → 微信手机号快捷授权（取得已验证手机号）
     → 服务端在本赛事范围内列出「你名下可认领的待认领球队」
     → 本人明确选择 + 同意免责声明
     → 认领完成 → 转入现有参赛确认/球队中心
```

逐队「认领链接」**保留**，用于报名表未留手机号、手机号有误或需定向发送的场景（规则 13）。

**非目标**：不改认领端口（仍固定在小程序）；不做 H5/服务号认领；不新增第二份手机号白名单；不改认领后的审核与人工核验语义。

---

## 二、Architecture（本计划最关键结论）

**不新增认领动作。** 现有 `acceptPrebuiltTeamInviteForWorkspace`（`cloudfunctions/getMiniWorkspace/index.js:1920`）在入口第一件事就是调用 `prebuiltTeamInviteForWorkspace`（`:1833`），而后者在 `:1839-1840` 强制校验：

```js
const allowedClaimPhones = unique((Array.isArray(invite.allowedClaimPhones) ? invite.allowedClaimPhones : []).map(...))
if (allowedClaimPhones.length && allowedClaimPhones.indexOf(String(identity.phone || '')) < 0) throw workspaceError('TEAM_CLAIM_PHONE_MISMATCH', ...)
```

也就是说：**授权 owner 已经是唯一的**，`allowedClaimPhones` 已经是唯一资格来源。去掉 token 只是改变了「如何找到 inviteId」，不改变「谁有权认领」。

因此本计划的边界是：

| 职责 | Owner | 本次动作 |
|---|---|---|
| 赛事级码生成 | `tournamentRegistrationFlow` | 新增 `createTournamentClaimCode`，照搬 `createTargetedRegistrationLink`（`:902-928`） |
| 按邀请码解析赛事信息 | `getMiniWorkspace` | 新增 `claimCodeContext` |
| 按已验证手机号发现可认领球队 | `getMiniWorkspace` | 新增 `claimableTeams`（**只做发现**） |
| 实际认领与授权校验 | `getMiniWorkspace` | **复用 `acceptPrebuiltTeamInvite`，零改动** |

新增代码只负责「发现」，授权与写入完全走既有路径。这是本计划把风险压到最低的核心手段。

---

## 三、Tech Stack

- 小程序：原生微信小程序，`pages/team` 分包
- 云函数：Node.js 18（CloudBase），减少依赖
- PC：Vue 3 + Vite + Element Plus，**零 SDK**，统一经 `webLoginApi` 的 `callFunction` relay

---

## 四、Baseline / Authority Refs

- `AGENTS.md` §3.2（WXML 表达式红线）、§3.3（手机号是自然人账号唯一凭证）、§3.4（租户与数据边界）、§六（部署纪律）
- `docs/PRODUCT_RULES.md` 第九节规则 3、10、11、13
- `docs/ADR.md` 2026-09-17：球队认领新增赛事级认领码
- `docs/PREVIEW_RELEASE_WORKFLOW.md`（预览/正式发布流程）
- 既有实现：`cloudfunctions/tournamentRegistrationFlow/index.js:902`（赛事级码范式）、`cloudfunctions/getMiniWorkspace/index.js:1833/1920`（认领路径）、`miniprogram/pages/service/claim/claim.js`（认领码页交互形状）

---

## 五、Compatibility Boundary

**保持不变（不得破坏）**：

- 逐队 `organizerClaimInvite` 的入参与返回契约
- `acceptPrebuiltTeamInvite` 的入参（`inviteId` + `choice` + `disclaimerAgreed`）与返回（`reviewRequired` / `destination` / `registrationId`）
- `team_invitations.allowedClaimPhones` / `claimantCandidates` 作为唯一资格来源
- `assertPrebuiltInviteActive` 的有效期与赛事锁定校验
- 认领冲突仍进人工核验（`claim-conflict`），不自动合并

**允许新增**：`tournament_invites` 中 `inviteType='tournament_claim_code'` 的新记录类型；`getMiniWorkspace` 两个新 action；`pages/team` 分包一个新页面；PC 一个新弹层。

---

## 六、TDD Route

```text
TDD Route:
- mode: off（Aegis TDD mode 默认）
- decision: skipped
- authority: 无显式 strict 请求
- test posture: 沿用项目既有契约回归模式（tools/test-*-contract.mjs：真实云函数代码 + SDK 桩）
- verification: 新增 1 份契约回归 + node --check + WXML 红线扫描 + PC 构建
```

本计划不写 RED/GREEN 步骤。但**授权边界必须有反向用例**（见 Task 5），不允许只验证正常路径。

---

## 七、Requirement Ready Check

```text
Requirement Ready Check:
- Requirement source refs: PRODUCT_RULES §九 11/13；ADR 2026-09-17（用户已确认）
- Goals and scope refs: 本文第一节
- User / scenario refs: 球队负责人（报名表登记的领队或主教练手机号持有人）
- Acceptance / verification criteria refs: 本文 Task 5 用例集
- Open blocker questions: 无
- Decision: ready
```

---

## 八、Change Necessity

单靠文档或配置无法实现「一个赛事一个码 + 按手机号发现自己的球队」：现状是 `organizerClaimInvite` 严格按 `tournamentTeamId` 逐队生成邀请，赛事级「邀约球队」只覆盖报名不覆盖认领，没有任何按手机号发现待认领球队的接口。

**最小代码边界** = 1 个码生成 action + 2 个只读查询 action + 1 个小程序页面 + 1 个 PC 弹层。不需要新集合、不需要新云函数、不需要改数据结构。

---

## 九、Ripple Signal Triage

命中信号：新增 producer/consumer 契约（`getMiniWorkspace` 新 action）、权限面（手机号授权）、persistence（`tournament_invites` 新类型）、PC↔云函数链路。

```text
Ripple Signal Triage:
- Canonical owner: 授权与认领写入 = getMiniWorkspace；赛事级码生成 = tournamentRegistrationFlow
- Downstream consumers: 小程序认领页（新）、PC 报名管理（新入口）、getMiniWorkspace 既有认领路径（复用）
- Source-of-truth risk: 手机号白名单只允许 allowedClaimPhones 一处；禁止在小程序端或 PC 端复刻匹配规则
- Fallback/retirement: 无新增 fallback；逐队链接按规则 13 明确保留，无退役项
- Verification impact: 必须覆盖「手机号不匹配则不可见且不可认领」的反向用例
```

---

## 十、Plan Pressure Test

- **Owner fit**：新增发现接口放在 `getMiniWorkspace`（它已 own 认领与工作空间身份），码生成放在 `tournamentRegistrationFlow`（它已 own 赛事级码）。无重复 owner。
- **Higher-level path**：不存在更上层的统一入口可复用；`createTargetedRegistrationLink` 与本次是同级、不同用途（报名 vs 认领），不应合并。
- **Verification scope**：可观测、可回归，无需人工视觉验收即可判定授权边界。
- **Executability**：Task 1/2 相互独立，可并行；Task 3 依赖 Task 2，Task 4 依赖 Task 1，Task 5 依赖 1-4。

结论：可执行。

---

## 十一、Tasks

### Task 1 — 服务端：赛事级认领码生成

**文件**：`cloudfunctions/tournamentRegistrationFlow/index.js`

**目的**：主办方能为一个赛事生成一个认领码。

**最小改动**：新增 `async function createTournamentClaimCode(event)`，在 action 分发处（约 `:1910`）注册。

照搬 `createTargetedRegistrationLink`（`:902-928`）的结构，差异点：

- 校验：`webActor` 登录 + `recordOrgId(tournament) === actor.orgId`；赛事锁定态直接拒绝（复用既有锁定判定）
- 落库：`tournament_invites` 新增记录，`inviteType:'tournament_claim_code'`、`inviteKey: randomKey(16)`、`status:'active'`、`longTerm:true`、`page: CLAIM_CODE_PAGE`
- 有效期：与逐队认领邀请同一口径，即 `registrationDeadline || signupDeadline || endDate`，缺失时回退 30 天；`expiresAt` 随返回给 PC 展示。**码本身不是授权凭据**——即使码被转发到无关人手里，也只有手机号命中 `allowedClaimPhones` 的人能看到并认领球队，真正的有效期与资格判定仍在逐条 `assertPrebuiltInviteActive` 中执行
- 小程序码：`miniProgramCode({ scene: 'c=' + inviteKey, page: CLAIM_CODE_PAGE, envVersion, checkPath:!testOnly })`，上传云存储，取临时 URL
- URL Link：`directMiniProgramUrlLink(CLAIM_CODE_PAGE, 'c=' + encodeURIComponent(inviteKey))`，`testOnly` 时置空
- 审计：`addAudit('tournament_claim_code_created', ...)`
- 返回：`{ success, message, data:{ inviteId, path, urlLink, qrCodeUrl, envVersion, testOnly, tournamentName, expiresAt } }`

**兼容影响**：纯新增，不改既有 action。

**验证**：`node --check cloudfunctions/tournamentRegistrationFlow/index.js`

---

### Task 2 — 服务端：按手机号发现可认领球队

**文件**：`cloudfunctions/getMiniWorkspace/index.js`

**目的**：解析邀请码 → 赛事信息；按已验证手机号列出本赛事内可认领的待认领球队。

**最小改动**：新增两个只读 action，在 action 分发处（`:2699-2701` 一带）注册。

**2a. `claimCodeContext`**（不需要手机号，用于展示赛事信息）

- 入参：`inviteKey`
- 查 `tournament_invites` where `inviteKey` + `inviteType='tournament_claim_code'` + `status='active'`
- 返回：赛事名、组别摘要、报名截止、主办方名、当前账号是否已绑定手机号（`needsPhone`）
- 无效/失效 → 返回受控错误码，不抛原始数据库错误

**2b. `claimableTeams`**（需要 `identity.phone`）

- 入参：`inviteKey`
- 未绑定手机号 → 返回 `needsPhone:true`，不返回任何球队
- 查询：`team_invitations` where `tournamentId` + `type='prebuilt_tournament_team'`，**分页拉取后在 Node 侧过滤** `allowedClaimPhones` 是否包含 `identity.phone`；不要依赖数组字段的索引匹配语义
- 每条候选再执行 `assertPrebuiltInviteActive(invite, tournament)`，过期/锁定/已处理的跳过
- 排除球队已 `claimed` 或已有 owner 的（这类仍走 `requiresReview`，在列表中标注而非隐藏）
- 返回：`[{ inviteId, teamId, teamName, divisionName, managerName, managerPhoneMasked, requiresReview }]`
- **硬约束**：返回列表中的每一项都必须已经过手机号匹配；绝不能返回未匹配的球队让前端过滤

**兼容影响**：纯新增只读 action。

**验证**：`node --check cloudfunctions/getMiniWorkspace/index.js`

---

### Task 3 — 小程序：认领码页面

**新建文件**：

- `miniprogram/pages/team/claim-code/claim-code.js`
- `miniprogram/pages/team/claim-code/claim-code.json`
- `miniprogram/pages/team/claim-code/claim-code.wxml`
- `miniprogram/pages/team/claim-code/claim-code.wxss`

**修改**：`miniprogram/app.json` → `subpackages` 中 `root: "pages/team"` 的 `pages` 数组新增 `"claim-code/claim-code"`

**目的**：扫码落地页，展示赛事信息 → 手机号授权 → 列出可认领球队 → 确认认领。

**数据流**：

1. `onLoad(options)`：取 `options.scene` 解析 `c=<inviteKey>`（参考 `pages/service/claim/claim.js:22-30` 的 scene 解析）
2. 调 `getMiniWorkspace` `claimCodeContext` → 渲染赛事信息
3. 「微信手机号快捷授权」按钮：`open-type="getPhoneNumber"` → 复用 小程序 既有手机号绑定路径（`checkUserByOpenId` + `phoneCode`，见 `miniprogram/pages/login/login.js`；该函数经 `cloud.openapi.phonenumber.getPhoneNumber` 解码并同时写 `phone`/`phoneNumber`）
4. 绑定成功后调 `claimableTeams` → 渲染候选列表
5. 用户选择一支 → 勾选免责声明 → 调既有 `acceptPrebuiltTeamInvite`，入参 `{ inviteId, choice:'prebuilt', disclaimerAgreed:true }`
6. 按返回分流：`reviewRequired` → `claim-conflict`；`destination='imported-player-review'` → `imported-player-review`；否则 → `team-center`
7. 空列表 → 明确文案「未找到你名下待认领的球队」+ 提示联系主办方（不要静默空白）

**WXML 红线（AGENTS.md §3.2）**：只允许 `{{value}}`、`{{!value}}`、`{{a || b}}`。禁止比较运算、三元、方法调用、数组索引。所有条件与派生文案必须在 `.js` 里预计算成 data 字段。

**兼容影响**：新页面，不影响既有页面。

**验证**：WXML 红线扫描（无 `===`/`!==`/三元/`.find(`/`[0]`）；`wx.cloud.callFunction` 名称与 action 拼写正确

---

### Task 4 — PC：赛事认领码入口

**文件**：`web-admin-vue/src/views/tournament/TournamentTeams.vue`

**目的**：主办方在报名管理生成/下载/复制赛事级认领码。

**最小改动**：

- 顶部操作区新增「赛事认领码」按钮 + 弹层，复用现有认领弹层的结构与样式（模板 `:262-269`，逻辑 `openClaimReminder` `:1394`、`closeClaimInvite` `:2534`）
- 调用链：`cloud.js` → `webLoginApi` 的 `callFunction` relay → `tournamentRegistrationFlow.createTournamentClaimCode`
- **禁止**引入 `@cloudbase/js-sdk`
- 展示：小程序码、URL Link、有效期、`testOnly` 时明确标注体验版且不展示为正式链接
- 资源路径必须兼容 `/admin/` 与 `/preview/admin/` 子目录，使用现有 `publicBase`

**兼容影响**：既有逐队「认领链接」按钮与弹层保持不变。

**验证**：`cd web-admin-vue; npm run build`；产物中确认无 `@cloudbase/js-sdk`；检查 `dist/index.html` 的 base 引用

---

### Task 5 — 契约回归（授权边界反向用例）

**新建**：`tools/test-team-claim-code-contract.mjs`（沿用 `tools/test-*.mjs` 既有模式：加载真实云函数代码 + SDK 桩）

**必须覆盖**：

| 用例 | 期望 |
|---|---|
| 手机号命中 `allowedClaimPhones` | 可见且可认领 |
| 手机号**不在** `allowedClaimPhones` | 不出现在列表；直接调 `acceptPrebuiltTeamInvite` 仍抛 `TEAM_CLAIM_PHONE_MISMATCH` |
| 手机号未绑定 | 返回 `needsPhone:true`，列表为空，不泄露任何球队名 |
| 邀请已过期 / 赛事已锁定 | 从列表剔除；直接认领被拒 |
| 球队已被他人认领 | 列表中标注 `requiresReview`，直接认领进人工核验 |
| 一个手机号命中多支队 | 全部返回，由用户选择 |
| 伪造前端传入别的 `teamId` | 服务端拒绝（授权不依赖前端参数） |
| 邀请码无效/已停用 | `claimCodeContext` 返回受控错误，不抛原始 DB 错误 |

**验证**：`node tools/test-team-claim-code-contract.mjs` 全通过

---

### Task 6 — 收尾与文档

- `git diff --check` 通过
- 修改的云函数逐个 `node --check`
- WXML 红线扫描
- `docs/CURRENT_STATUS.md` 追加本轮条目，**只写实际完成的验证结果**；未部署就写未部署
- **部署需当前任务明确授权**；PC 只允许先部署 `/preview/admin/`（PREVIEW_RELEASE_WORKFLOW），不得直接部署正式 `/admin/`

---

## 十二、Verification（整体）

```powershell
# 云函数语法
node --check cloudfunctions/getMiniWorkspace/index.js
node --check cloudfunctions/tournamentRegistrationFlow/index.js

# 契约回归
node tools/test-team-claim-code-contract.mjs

# PC 构建（注意 base）
cd web-admin-vue
$env:VITE_APP_BASE = '/preview/admin/'
npm run build
Remove-Item Env:VITE_APP_BASE

# 差异与红线
git diff --check
```

---

## 十三、Risks

| 风险 | 处理 |
|---|---|
| **授权被前端绕过**——去掉 token 后只靠前端过滤 | Task 2 硬约束：返回列表必须服务端已过滤；Task 5 覆盖「伪造 teamId」反向用例 |
| 手机号匹配依赖数组字段索引语义，CloudBase 行为不确定 | 在 Node 侧分页拉取后过滤，不依赖索引；代价是分页边界，需覆盖邀请数 > 100 的赛事 |
| 一个赛事邀请数很多（批量导入上百支） | 分页 `listAll` 风格实现，设置上限与提前退出，避免超时 |
| 赛事锁定/有效期被绕过 | 逐条 `assertPrebuiltInviteActive`，不因批量查询而省略 |
| 认领后把球队归到错误机构 | 复用既有 `createRegistrationReviewArtifacts` 与机构绑定逻辑，不新写归属判断 |
| 手机号未绑定时列表泄露球队信息 | 未绑定直接返回空列表 + `needsPhone` |
| 认领码被转发给无关人员 | 码不承载授权：无关人员扫码后手机号不命中任何 `allowedClaimPhones`，列表为空且看不到球队名 |

---

## 十四、Retirement

**无退役项。** 逐队「认领链接」按 `PRODUCT_RULES` 规则 13 明确保留（无手机号、手机号有误、定向发送三类场景），保留原因与触发条件已写入 ADR 2026-09-17。

---

## 十五、Execution Route

**inline**。理由：Task 1 与 Task 2 可并行，但 Task 3/4/5 存在顺序依赖（页面依赖 action 就绪、回归依赖全部就绪），协调成本高于收益；且改动集中在 2 个云函数 + 1 个新页 + 1 个 PC 文件，由单一执行者保持上下文更稳妥。

`User confirmation required: yes — 部署（云函数上线 / PC 预览发布 / 正式站）必须取得当前任务明确授权。`

---

## 附录 A：执行前置检查（不在本计划范围，但需先决定）

`web-admin-vue/src/views/tournament/DivisionManagement.vue` 的 `capacityText` 取值为：

```js
[division.expectedTeams, division.requiredTeams, division.teamRequirement, division.participantTeams, division.maxTeams]
```

而服务端权威实现 `cloudfunctions/tournamentRegistrationFlow/index.js:23-26` 的 `divisionCapacity()` 候选列表为：

```js
[division.expectedTeams, division.requiredTeams, division.teamRequirement, division.participantTeams, division.maxTeams, division.teamLimit, tournament.maxTeams]
```

**PC 少了 `teamLimit` 与 `tournament.maxTeams` 两个兜底**。当某个组别的容量来自这两个字段时，PC 会显示「未设置」，而服务端仍按真实容量阻断报名（`已满`）。同一份容量数据存在两个不一致的 owner。

建议：把 PC 的候选列表对齐 `divisionCapacity`，或改由服务端在组别读接口返回容量值，避免前端复刻规则。**这是独立于认领码的缺陷，需单独确认后处理。**
