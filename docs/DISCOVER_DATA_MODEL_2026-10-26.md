# 发现一级页数据模型与集合设计（草案）

版本：V0.1｜日期：2026-10-26｜状态：**设计草案，未创建任何集合，未部署云函数，未上线**
关联：[发现一级页研发交接](handoffs/DISCOVER_LEVEL1_TRAE_HANDOFF_2026-10-26.md)、[转会中心方案](TRANSFER_CENTER_PLAN_2026-10-26.md)、[数据中心契约](data-center/CONTRACT.md)

本文件只回答“发现一级页的数据放在哪、需要哪些集合和索引、由谁校验权限”。
文中集合名、字段名、索引均为**候选命名**，不是已确认的数据结构；标为“待确认”的条目不能通过默认值、页面行为或迁移脚本自动落地。

---

## 一、结论先行

1. **赛事栏与本队约球栏不需要新集合**：前者复用已部署的 `getTournamentList` 读取公开赛事，后者复用现有 `friendly_invites` 并由 `friendlyMatchCenter` 新 action 读取本队范围。
2. **动态发布、关注、点赞、评论属于新增能力**，需要 4 个新集合，必须先确认第八章 DQ01—DQ06 才能建表。
3. 本轮**没有创建任何集合、没有新增云函数、没有写入生产数据**；`friendlyMatchCenter.listTeamInvites` 已在 2026-10-26 部署到正式环境（函数版本 1.8.0）。
4. 发现页不承担转会业务：转会集合仍在 `cloudfunctions/dataCenter/transfer/`，发现页只通过只读公开投影 `transferShowcase` 展示已公开的完成记录与统一身价，不复制合同、报价、审核数据（2026-10-27 修订，见 2.5）。
5. **转会模块定稿为发现根目录第 4 个分栏「转会」**（2026-10-26 确认）：顶部页签为“动态／赛事／约球／转会”，赛事卡只连“赛事中心”，不再挂转会或身价入口；转会不作为赛事子页面，也不进底栏。

---

## 二、当前已接通的数据

| 列表 | 数据来源 | 调用方式 | 分页 | 实际状态 |
| --- | --- | --- | --- | --- |
| 动态（战报） | `friendly_matches` | 小程序端 `wx.cloud.database()` 只读 | 每次 8 条，按已加载条数刷新 | 既有能力，已上线 |
| 赛事（公开赛事目录） | `getTournamentList` | `wx.cloud.callFunction` | 服务端 `page`／`pageSize=20`，上滑续页，筛选命中为空时最多自动续取 3 页 | 函数已部署（线上为 2026-06-27 旧版），本次未重新部署 |
| 约球（本队邀约） | `friendly_invites` | `friendlyMatchCenter` → `action=listTeamInvites` | 服务端取最近 30 条 | **已部署（2026-10-26，函数 1.8.0）**，正式环境读回通过 |
| 转会（公开市场） | `player_valuations`／`transfer_requests`／`transfer_free_signings`／`players`／`teams`／`tournaments`／`roster_snapshots`／`divisions` | `dataCenter` → `action=transferShowcase`（身份校验前分流） | 未选赛事：服务端固定上限（身价 600／转会 300／自由转会 200 条）；已选赛事：按已审核名单批量读身价（上限 4000），`scanLimited` 如实回传 | **本地已实现（`transfer-showcase/3`），未部署**；线上函数尚无该 action，页面显示“接口尚未发布” |

### 2.1 公开赛事目录字段合同（`getTournamentList`）

客户端 `formatPublicEvent` 只整形已返回字段，缺失即省略，不补造主办方、场地、倒计时。

| 字段 | 用途 | 缺失处理 |
| --- | --- | --- |
| `_id` / `id` | 去重与跳转 | 无 ID 直接丢弃该条，不按名称合并 |
| `name` | 标题 | “未命名赛事” |
| `category` / `type`（旧） | 成人／青少年筛选与类别徽标 | 无类别则不显示徽标；校园等其它类别只出现在“全部” |
| `matchFormat` | 赛制文字 | 省略该项 |
| `city` / `region` / `location` | 区域 | 省略该项 |
| `startDate` / `endDate` | 日期区间 | 省略该项；全部缺失显示“类别、区域与日期待定” |
| `organizerName` | 主办方行（PC 端为多主办方 `join('、')` 字符串） | 无则不显示该行 |
| `status` | 状态胶囊（报名中／已发布／进行中／已结束／已取消） | “状态待确认” |
| `coverImage` / `coverUrl` / `bannerUrl` | 封面 | 统一品牌底图 `/images/runtime/team-data-emerald-stadium-v1.jpg` |

注意事项：

- 客户端请求显式带 `includeLegacyCategory: true`，对旧版函数为无效参数（被忽略），对新版函数用于兼容旧 `type` 类别；因此新旧部署都不会只返回青少年赛事。
- 旧版线上函数返回 `type` 而无 `category`，客户端按 `category || type` 兼容；`amateur / local / city / professional` 归入“成人”，`campus` 只进“全部”。
- 区域字段实际返回的是 `location`（仓库内函数字段），客户端按 `city || region || location` 兼容，不新增集合字段。
- 仓库内函数把 `category` 兜底写成 `item.category || item.type || 'youth'`，且 `categoryLabel` 固定为“青少年赛事”。若后续部署该版本，缺少类别字段的历史赛事会被标成青少年。客户端不读 `categoryLabel`（自行按类别键计算徽标），因此该兜底会直接影响“成人／青少年”筛选，部署前需先修掉这个默认值，避免把未分类赛事塞进青少年。
- 旧版线上函数是否返回 `startDate`／`endDate` 尚未在生产读回中核对，若缺失，卡片日期行会显示“类别、区域与日期待定”；该字段缺口需在下次部署或线上读回时确认，不能在前端补造。

### 2.2 本队约球列表接口合同（`friendlyMatchCenter.listTeamInvites`，2026-10-26 已部署）

请求：

```json
{ "action": "listTeamInvites", "teamId": "<球队ID>", "limit": 30 }
```

鉴权顺序：`resolveCallerIdentity()`（OPENID → `users`）→ `callerBelongsToTeam(teamId, caller)`（`teams` 所有者／认领，或 `team_memberships` 有效成员）。任一失败返回 `UNAUTHORIZED`／`FORBIDDEN`，不返回空列表。

响应（成功）：

```json
{
  "ok": true,
  "data": {
    "teamId": "…", "teamName": "…", "teamLogo": "…", "total": 3,
    "invites": [
      {
        "inviteId": "…", "matchDate": "2026-11-01", "matchTime": "19:00",
        "venue": "…", "venueAddress": "…",
        "maxPlayers": 20, "signedInCount": 3, "deadline": "2026-10-30 12:00",
        "status": "open", "battleCryText": "…", "createdAt": "2026-10-26T10:00:00.000Z"
      }
    ]
  }
}
```

部署记录（2026-10-26）：

- **基线**：先从正式环境下载现有函数包（`fn code download`），只在下载版本上追加 `listTeamInvites` 与主入口 case，再回传；**没有上传整个本地目录**。
- **原因**：本地 `index.js` 的 `teamFriendlyStats` 已改为依赖 `./data-center/team-history.cjs`，而正式包是旧的直接聚合实现，且正式包里没有 `data-center/` 目录（29 个文件）。整体上传本地目录会连带启用未验收的统计改造，超出本次授权范围。
- **结果**：`healthCheck` 读回 `version: "1.8.0"`；部署包内 `case 'listTeamInvites'` 已注册；重新下载的 `index.js` 与上传包 SHA256 完全一致（`74826B0A…8355`）。
- **读回**：无身份调用 `listTeamInvites` 返回 `UNAUTHORIZED 请先登录`，证明 action 已生效且鉴权先行，不是 `UNKNOWN_ACTION`。
- **遗留**：本地 `index.js` 与正式包仍有 `teamFriendlyStats` 差异；下次部署前必须先合并或明确取舍，**禁止直接用本地目录整体覆盖**。

红线：

- **绝不返回** `signinToken`、`signinUrl`；签到凭证只能由发起流程生成并分享，不能出现在任何列表接口里。
- 读取按 `teamId` 单字段（单字段索引自动生效）后函数内按 `createdAt` 倒序截取，避免为上线强制新建 `teamId + createdAt` 复合索引。
- 只覆盖“本队发起的邀约”，不做全平台公开约球撮合；跨队公开列表属于产品决策（见 DQ10；2026-10-27 已确认要做，见 2.3）。

### 2.3 跨队公开约球（2026-10-27 用户确认“做”）

约球栏内部改为两个范围：「本队约球」＝原有管理视角，「公开约球」＝跨队撮合。

| 区域 | 内容 | 数据来源 |
| --- | --- | --- |
| 范围切换 | 「本队约球／公开约球」两段，默认本队，不改变原有行为 | 前端状态 |
| 同城筛选条 | “同城范围：{本队登记城市}” + 「查看全部城市／只看同城」 | 城市取球队 `cityName/city/registrationRegion.cityName`，服务端比较 |
| 公开卡片 | 队名、队徽、城市、比赛日期时间、场地名、报名人数、截止时间、战书 | `listPublicInvites` 已脱敏字段 |
| 应战 | 「代表本队应战」→ 二次确认 → `respondPublicInvite` | 需要登录＋属于该球队 |
| 本队卡片 | 新增“已收到 N 支球队应战” + 「查看应战」→ `listSignins`（已加鉴权） | `acceptedCount` 计数 |

接口合同（`friendlyMatchCenter`）：

| action | 入参 | 权限 | 返回 | 失败码 |
| --- | --- | --- | --- | --- |
| `listPublicInvites` | `city?`／`limit`（≤30）／`offset` | 只要小程序 `openid`（游客可看） | `invites[]`：`inviteId/teamId/teamName/teamLogo/teamCity/matchDate/matchTime/venue/maxPlayers/signedInCount/deadline/status/battleCryText/createdAt`、`total/hasMore/scanLimited` | `UNAUTHORIZED`／`DATA_READ_FAILED` |
| `respondPublicInvite` | `inviteId`／`teamId` | 登录＋手机号＋属于该球队 | `responseId/alreadyResponded/status` | `UNAUTHORIZED`／`FORBIDDEN`／`NOT_FOUND`／`CLOSED`／`INVALID_PARAM`（本队自己） |
| `listSignins` | `inviteId` | 登录＋手机号＋**发起球队**成员 | `invite`（去掉 `signinToken/signinUrl`）、`responses[]`（不含手机号） | `UNAUTHORIZED`／`FORBIDDEN`／`NOT_FOUND` |

固定口径：

- 公开列表只列 `status=open` 且未过截止时间的邀约；截止时间按 Asia/Shanghai 解析（云端 UTC，直接比较会把“当天 23:59 截止”判早 8 小时）。
- 公开列表**只给场地名，不给 `venueAddress`**，也不返回 `signinToken/signinUrl`、创建人账号、手机号；报名仍走原海报 H5。
- 读取用单字段 `status` 查询（上限 100 条）后函数内排序切片，`scanLimited` 如实回传，避免为上线强制建复合索引。
- 应战沿用现有 H5 语义：只写“应战意向”，允许多队应战、由发起方决定，**不自动锁定比赛**；同一球队对同一邀约只写一次（幂等）。若要改为“先到先得自动锁定”，需另行确认。
- `listSignins` 原先无鉴权（任何拿到 `inviteId` 的人都能读到响应里的手机号与签到凭证），2026-10-27 已补鉴权并脱敏；本次部署必须一并带上，否则公开 `inviteId` 会放大该泄露面。

### 2.4 球员身价入口归属（2026-10-27 用户确认）

身价系统已具备完整展示，**入口归属平台运营中心 → 数据中心 → 球队数据**，不在发现页，也不在赛事卡：

- 路径：球队数据 → 球队档案（`TeamCareer.vue`）→ 球员历史贡献 → 球员生涯（`PlayerCareer.vue`）。
- `PlayerCareer.vue` 已展示“转会评估身价、身价走势、八项因子构成、历史快照”，无需在发现页/赛事卡重复入口。
- 小程序分包里的 `pages/tournament/valuation/valuation` 现无任何入口（赛事卡只连赛事中心），保留但不再作为身价入口；是否归档该页面需另行确认，不在本轮擅自删除。

### 2.5 转会分栏按原型落地为公开市场（2026-10-27 用户确认，取代同日更早的“入口指引”方案；同日追加四条口径后为 `transfer-showcase/3`）

用户明确：发现页的转会栏不是入口指引，而是**公共展示端**（转会市场橱窗），展示所有赛事允许公开的转会信息。办理报价、签约、收件箱与审核仍在「赛事 → 具体赛事 → 转会中心」，本栏不复制办理流程。页面按 [公开转会市场单页拆解](handoffs/PUBLIC_TRANSFER_MARKET_DECOMPOSITION_2026-10-27.md) 的 01–08 区域落地；文字、榜单、按钮、金额与走势全部代码实现，原型原图只作参考，图中姓名/球队/金额/走势均为示意，未写入数据库。

用户同日追加确认（原文）：「成交金额公开范围按照成人青少年分级公开，跨赛事转会允许！也可以租借！榜单按赛事就行！然后不按组别！按年龄段！暂不开放公开球员资料页！想看需要耗蜂蜜滴数！」四条口径按本节表格与固定口径执行。

| 区域（原型） | 实现 | 数据来源 | 状态 |
| --- | --- | --- | --- |
| 01 顶部页框 | 复用既有城市、搜索、记一场与「动态／赛事／约球／转会」四栏 | 既有组件 | 已实现；转会栏搜索禁用 |
| 02 范围筛选 | 三枚胶囊：赛事／年龄段／时间。赛事与年龄段点开底部弹层真实筛选（赛事列表取公开赛事目录，年龄段取该赛事 `divisions.name`，自然排序 U8 < U10） | `getTournamentList` + 已审核赛事名单 | 赛事与年龄段已实现；时间范围仍为占位并明确提示未接入 |
| 03 转会焦点 | 球场背景 + 「已完成」徽标 + 「跨赛事」徽标（跨赛事时）+ 球员名/位置 + 双方队徽与 `→` + 赛事·日期 + 成交金额分级文案；下方一条紧凑「官宣」行 | `transfer_requests`／`transfer_free_signings`（`status=completed`）最新两条 | 已实现；只下发格式化 `priceText`，不下发 `amountFen` |
| 04 双榜单 | 身价榜（最多 8 行）、上升最快（最多 5 行）：名次、球员、球队、当前身价、`+差额 · +百分比`；标题右侧显示当前赛事名 | `player_valuations` 每人最新与上一份快照 | 已实现；按赛事出榜，再按年龄段细分 |
| 05 发现球员 | 「筛选查询」开合面板：位置 chips 本地过滤 + 参考身价 + 真实快照样走势柱 + 「查看资料」 | `player_valuations` 每人最新 + 最近 8 个快照 | 位置筛选已实现；球队筛选、公开资料页未接入 |
| 06 最新转会 | 球员、`原球队 → 新球队`（队徽 + 队名）、所属赛事（跨赛事显示 `赛事A → 赛事B`）、「跨赛事」徽标、日期、成交金额分级文案 | 同 03，去除焦点与官宣条后的剩余条目 | 已实现 |
| 07 赛事转会中心入口 | 「我的赛事转会中心」→ 提示后切到赛事栏 | 发现页不能自选赛事 | 已实现（不深链到具体赛事） |
| 08 底栏 | 复用 `custom-tab-bar` | 既有 | 未改 |

同一笔转会只出现一次：焦点取 `transfers[0]`，官宣条取紧随其后的第一条，其余进入「最新转会」列表（服务端 `transfers[]` 已排除焦点）。

接口合同（`dataCenter.transferShowcase`，`schema: transfer-showcase/3`，只读公开投影，**游客可用**）：

| 项 | 内容 |
| --- | --- |
| 入参 | `tournamentId`（可选）、`ageGroupId`（可选，仅在有赛事时生效；无赛事时服务端忽略，避免空名单把全平台过滤空） |
| 权限 | 不要求登录：该 action 在 `dataCenter` 身份校验之前分流，只返回公开字段；办理类 `transfer*` action 权限不变 |
| 返回 | `schema/updatedAt/scope{mode,tournamentId,tournamentName,ageGroupId,ageGroupText}/ageGroups[]/rosterState/valuationStatus/transferStatus/scanLimited{valuations,transfers}/skipped/transferCount/focus/transfers[]/top[]/rising[]/players[]/playerTotal/playerLimit` |
| `focus` / `transfers[]` | `kind(transfer/loan/loan_permanent/loan_renewal/free)/playerId/playerName/positionText/fromTeamName/fromTeamLogo/toTeamName/toTeamLogo/tournamentId/fromTournamentId/toTournamentId/fromTournamentName/toTournamentName/isCrossEvent/eventText/typeText/priceState/priceText/completedAt`；**不含 `amountFen`**，不含球员照片 |
| `priceState` | `public`（成人已记录成交金额，`priceText` 为服务端 `formatMoney` 文案）/`hidden`（青少年不公开）/`unknown`（年龄无法判定，待核实）/`not_recorded`（未记录金额）/`free`（自由签约，无转会费） |
| `top[]` / `rising[]` | `rank/playerId/playerName/positionText/positionBucket/teamName/teamLogo/photoUrl/money/moneyText/total/tierText/computedAt`；`rising` 另加 `previousMoney/previousMoneyText/deltaMoney/deltaText/percentText` |
| `players[]` | 同榜单字段，另加 `trend[]`（最近 8 个真实快照，旧→新） |
| `scope.mode` | `platform`（未选赛事）或 `tournament`（已选赛事并按其已审核名单过滤） |
| `rosterState` | `not_applied`（未选赛事）/`ready`/`none`（该赛事无已审核名单）/`not_recorded`（名单集合缺失）；`none` 与 `not_recorded` 分开文案，不降级成「暂无转会」 |
| 失败 | `DATA_READ_FAILED`（读取失败统一上抛，不降级成空列表） |

固定口径：

- **成交金额按成人／青少年分级公开**：成人（`minor!==true` 且 `parseAge(birthDate||birthday)>=18`，或快照明确非未成年）已记录金额时下发格式化 `priceText`，展示为金色强调；青少年（`minor===true` 或年龄 <18）只显示「青少年金额不公开」，不展示位数、区间或星号占位；年龄无法判定（`minor` 与生日都取不到）显示「成交价待核实」，不猜测；已记录为 0 或空显示「成交价未记录」；自由签约显示「无转会费」。**任何情况下都不下发 `amountFen`**，页面不做前端遮挡。
- **跨赛事转会允许**：命中 `tournamentId`／`fromTournamentId`／`toTournamentId` 任一的转会都进入该赛事范围；两端赛事名都有且不同时显示「赛事A → 赛事B」并加「跨赛事」徽标，单赛事记录不拼接。
- **租借允许**：正式转会、租借（整赛季／单场）、租借转永久、租借续租、自由球员签约都进入公开列表，类型文案沿用 `transfer/service.cjs` 的同一套 `TYPE_TEXT`／`LOAN_KIND_TEXT`。
- **榜单按赛事出榜，再按年龄段细分**：年龄段＝赛事竞赛组别（`divisions.name`，U8/U10…），**不是抽签小组（A/B 组）**；范围只取该赛事已审核名单（`rosterLineApproved`，`pending` 行排除）。
- **青少年不公开**：`minor=true` 的快照不进入任何榜单，因此不会出现其货币金额；转会动态一律不下发球员照片，页面用姓名首字头像。
- **不返回**报价单、合同、审核记录、手机号、证件与任何签到/登录凭据；也不从这些私有接口拼接公开动态。
- **只展示真实记录**：两名及以上快照才参与“上升最快”，未测算（`money` 为空）不进榜，球员资料缺失或已删除的行跳过并计数回传。
- **公开球员资料页暂不开放**：点「查看资料」只提示「公开球员资料页暂未开放；开放后查看球员资料需消耗蜂蜜滴数（消耗标准待定）」。**蜂蜜滴数标准未定，页面与服务端都不得写死数值**；现有赛事内球员详情含办理上下文，不能仅凭 `playerId` 绕过权限。
- **榜单算法沿用数据中心口径**：`money` 与最近两份快照差额由服务端计算，页面不另写公式；原型图的“近 7 天涨幅”未确认，页面只写“上涨/最新快照对比”，不写 7 天。
- 读取方式：单字段过滤（`coverage=complete`／`status=completed`）+ `_id` 键集分页，未选赛事上限 600／300／200 条（已达到上限即 `scanLimited=true`）；已选赛事按名单 `playerId` 批量读取身价（`readByIds`，20 条一批，上限 4000），不把截断结果当成完整榜单。
- 搜索框在该分栏继续禁用，placeholder 为「转会市场暂不支持搜索」（展示端没有检索接口）。

未接入清单（点击给出明确提示，不以假数据填充）：

1. 时间范围筛选（胶囊仍为占位，点击提示「时间范围暂未接入」）。
2. 球队筛选（当前只有位置 chips 对已加载球员做本地过滤，面板说明写明球队筛选暂未接入）。
3. 公开球员资料页（未来开放需消耗蜂蜜滴数，滴数标准未定）。
4. 焦点／成交列表的分页与排序参数（服务端固定上限，仅用 `scanLimited` 如实提示）。
5. 转会搜索（该栏输入框禁用）。
6. 「我的赛事转会中心」深链到具体赛事（只能切到赛事栏，由用户自选可办理赛事）。
7. 赛事范围下拉只列公开赛事目录的首批 20 场（`getTournamentList` 单页），更多赛事需在赛事栏查看。

---

## 三、现有集合复用清单（不新建、不改结构）

| 集合 | 发现页用途 | 读／写 | 边界 |
| --- | --- | --- | --- |
| `friendly_matches` | 战报（本人记录的友谊赛） | 客户端只读 + `friendlyMatchCenter` 删除／推广 | 本人／本队范围，不当成全平台动态 |
| `friendly_invites` | 本队约球邀约 | 云函数只读（新 action） | 本队成员，脱敏签到凭证 |
| `teams` | 球队名称、Logo、城市 | 云函数读 | 只取展示字段 |
| `team_memberships` | 成员校验 | 云函数读 | `active / accepted / claimed` 有效成员 |
| `users` | 自然人账号身份 | 云函数读 | 只用于身份，不作为业务归属 |
| `tournaments` / `publication_snapshots` | 公开赛事来源 | `getTournamentList` 读 | 只读已发布，不读草稿 |

不为发现页给上述集合加字段：公开／关注／点赞评论等新语义一律放新集合，避免把“日常资料”和“公开内容”混在同一文档里。

---

## 四、待建集合草案（尚未创建）

### 4.1 方案 A：统一动态表 `discover_posts`（草案，待 DQ01 确认）

一条文档同时承载“战报转发／球队动态／球队招募”，用 `postType` 区分。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `_id` | string | 自动 |
| `postType` | string | `report`（战报）／`news`（球队动态）／`recruit`（球队招募） |
| `teamId` | string | 发布球队（归属边界，必填） |
| `orgId` | string | 发布时球队所属机构，仅作隔离校验冗余，不代替 `teamId` |
| `authorUserId` | string | 具体发布人（`users._id`），只表示创建人 |
| `visibility` | string | `public`／`city`／`followers`／`team`（DQ02） |
| `status` | string | `draft`／`pending`／`published`／`rejected`／`archived`（DQ03） |
| `city` | string | 同城视图字段，取值口径见 DQ09 |
| `title` | string | 列表标题 |
| `content` | string | 正文（纯文本，长度上限待定） |
| `images` | array | 图片 `fileId` 列表，数量上限待定 |
| `sourceRef` | object | 战报转发时记录 `friendlyMatchId`，不复制比分字段 |
| `tournamentId` | string | 可选，赛事相关动态 |
| `recruit` | object | 招募专属字段（位置、人数、年龄组、联系方式展示方式，DQ04） |
| `counts` | object | `likeCount`／`commentCount`，由云函数事务维护（见 4.6） |
| `audit` | object | 审核人、时间、原因（仅在 DQ03 要求审核时使用） |
| `createdAt` / `updatedAt` / `publishedAt` | date | 列表排序用 `publishedAt` |

候选索引（等值字段在前、排序字段在后）：

| # | 字段顺序 | 支撑查询 | 是否必须 |
| --- | --- | --- | --- |
| 1 | `status` + `visibility` + `publishedAt desc` | 公开主流 | 必须 |
| 2 | `city` + `status` + `publishedAt desc` | 同城视图 | 必须（若保留同城） |
| 3 | `teamId` + `publishedAt desc` | 本队动态、我的发布 | 必须 |
| 4 | `postType` + `status` + `publishedAt desc` | 战报／动态／招募分栏 | 必须 |
| 5 | `tournamentId` + `publishedAt desc` | 赛事关联动态 | 可选 |

### 4.2 方案 B：分表 `team_posts` + `team_recruitments`

| 维度 | 方案 A 统一表 | 方案 B 分表 |
| --- | --- | --- |
| 三栏按类型排序 | 单索引即可 | 需两次查询后在客户端合并排序，分页不稳定 |
| 招募专属字段 | 一个可选子对象 | 独立字段，结构更干净 |
| 关注流 | 一次查询 | 两路查询分别分页 |
| 维护成本 | 低 | 高（两套云函数分支与索引） |
| 未来扩展（视频、活动报名） | 加字段 | 需再拆表 |

建议：若确认“动态栏按战报／球队动态／球队招募三个子筛并在同一列表混排”，选 A；若三类永远分开展示且招募会继续长成独立业务，选 B。**未确认前不建表。**

### 4.3 `team_follows`

| 字段 | 说明 |
| --- | --- |
| `followerTeamId` | 关注方球队（关注按球队维度，不按个人，DQ05） |
| `followerUserId` | 操作人，便于审计，不作归属 |
| `targetTeamId` | 被关注球队 |
| `targetOrgId` | 被关注球队所属机构，用于隔离校验 |
| `createdAt` | 时间 |

索引：`followerTeamId + createdAt desc`（我的关注）、`targetTeamId + createdAt desc`（粉丝）；业务侧用 `followerTeamId + targetTeamId` 查询判断是否已关注（唯一性由云函数事务保证，CloudBase 无唯一索引时不得依赖数据库约束）。

### 4.4 `post_likes`

| 字段 | 说明 |
| --- | --- |
| `postId` | 被点赞动态 |
| `teamId` / `userId` | 点赞主体（球队还是个人需 DQ05 一并确认） |
| `createdAt` | 时间 |

索引：`postId + createdAt desc`、`userId + createdAt desc`；重复点赞由云函数先查后写并配合计数事务。

### 4.5 `post_comments`

| 字段 | 说明 |
| --- | --- |
| `postId` | 所属动态 |
| `teamId` / `authorUserId` | 评论者 |
| `content` | 纯文本 |
| `status` | `published`／`hidden`／`deleted` |
| `createdAt` | 时间 |

索引：`postId + status + createdAt asc`、`authorUserId + createdAt desc`。

### 4.6 计数一致性

`counts.likeCount`／`counts.commentCount` 是读性能冗余，不是权威数据。规则：

- 只允许云函数在点赞／取消／评论／删除的同一事务里增减，页面不得自行加减后写回。
- 提供一次性重建口径（按 `post_likes`／`post_comments` 实际条数重算），用于修复漂移。
- 写入失败必须整笔回滚，不能出现“点了赞但计数没变”的静默状态。

### 4.7 集合创建方式

集合与索引属于云端变更，需要单独授权：

- 若最终纳入数据中心统一初始化，须在 `cloudfunctions/dataCenter` 的 `initializeCollections` 名单登记；
- 否则在 CloudBase 控制台手工创建空集合与上表索引，并回读确认。

两条路径都不得顺带写入示例数据。

---

## 五、接口规划（新增能力，未实现）

优先扩展既有函数而不是新增函数；若动态规模需要独立边界，再新建 `discoverCenter`（与 `friendlyMatchCenter` 同为球队端函数），不复用 `dataCenter` 的统计职责。

| action | 入参 | 关键校验 | 失败码 |
| --- | --- | --- | --- |
| `listPublicPosts` | `cursor`、`limit`、`postType` | 只返回 `status=published` 且 `visibility=public` | `INVALID_PARAM` |
| `listCityPosts` | `city`、`cursor` | 城市口径经服务端确认，不信任前端传任意城市 | `INVALID_PARAM` |
| `listFollowingPosts` | `teamId`、`cursor` | 按 `team_follows` 反向取目标球队，无关注返回空而非全站 | `UNAUTHORIZED` |
| `listTeamPosts` | `teamId`、`cursor` | 本队成员或公开可见的动态 | `FORBIDDEN` |
| `getPost` | `postId` | 按 `visibility` 判定 | `FORBIDDEN` |
| `createPost` | `teamId`、`postType`、标题正文图片 | `team.manage` 且 `teamId` 属于调用者可用球队 | `FORBIDDEN`／`INVALID_PARAM` |
| `updatePost`／`deletePost` | `postId`、版本号 | 仅作者球队管理权限，软删除保留审计 | `FORBIDDEN`／`CONFLICT` |
| `likePost`／`unlikePost` | `postId` | 登录 + 可见性校验 + 幂等 | `DUPLICATE`／`FORBIDDEN` |
| `listComments`／`createComment`／`deleteComment` | `postId`、`content` | 登录 + 可见性 + 长度限制 | `FORBIDDEN`／`INVALID_PARAM` |
| `followTeam`／`unfollowTeam` | `targetTeamId` | 不能关注自己；跨机构是否允许见 DQ05 | `INVALID_PARAM` |

统一约定：

- 响应沿用现有函数信封（成功 `{ ok: true, data }`，失败 `{ ok: false, code, message }`），页面按 `code` 分支，不把失败显示成“暂无数据”。
- 未发布的 action 线上会返回 `UNKNOWN_ACTION`，页面必须走“接口待发布”状态（本页已按此实现）。
- 列表一律 cursor 分页，禁止一次性拉全表；单页上限 20。
- `orgId`／`teamId` 由服务端从 `users` → `team_memberships` 推导，不接受前端声明的机构归属。

---

## 六、权限与隐私红线核对

| 红线 | 本设计的落实 |
| --- | --- |
| `orgId` 是隔离边界 | 新集合写入时冗余 `orgId`，读取按 `teamId`/`orgId` 双校验，`authorUserId` 只作创建人 |
| 主办方不得读俱乐部私有数据 | 动态只承载公开内容；课程、财务、学员等字段一律不进动态集合 |
| `users` 不属业务清理范围 | 删除动态／关注／评论不动 `users` |
| 手机号唯一凭证 | 动态、评论、招募展示不落手机号；招募联系方式若需要，只能经服务端二次校验后单独返回 |
| 名称相同不自动合并 | 动态列表按 `teamId`／`postId` 稳定 ID 去重，不按球队名合并 |
| 缺失不等于 0 | 计数缺失显示“—”，不显示 0；失败与空态分开 |
| 游客可浏览公开内容 | 公开赛事已放行；公开动态是否允许游客浏览见 DQ02 |

---

## 七、上线顺序与回滚

1. 确认第八章 DQ01—DQ06、DQ09、DQ10，形成书面结论。
2. 创建空集合与索引（只读探针验证集合存在，不写业务数据）。
3. 实现并本地测试云函数 action；取得部署授权后差量发布，回下载比对源码并线上读回一次真实列表。
4. 小程序先开发版验证，再按发布流程处理体验版／正式版；页面已具备 `UNKNOWN_ACTION` 降级，可在后端未上线时安全发布前端。
5. 回滚：集合与索引保留（避免删数据），函数回滚到上一版本，页面自动回到“接口待发布／暂无内容”状态。

---

## 八、待产品确认清单

| 编号 | 问题 | 不确认的后果 |
| --- | --- | --- |
| DQ01 | 动态采用统一表 `discover_posts` 还是分表 `team_posts` + `team_recruitments` | 决定索引与接口形态，选错需迁移 |
| DQ02 | 动态可见范围：全平台公开／仅同城／仅关注／仅本队；游客是否可见 | **范围已定（2026-10-27）：同城**（不做全平台公开流）；游客是否可见仍未定 |
| DQ03 | 发布是否审核（平台审核／主办方审核／免审），审核人与申诉入口 | 决定 `status`／`audit` 字段与发布链路 |
| DQ04 | 战报能否一键转公开动态；比分、对手名、球员姓名是否脱敏 | 涉及第三方数据公开，不能默认放行 |
| DQ05 | 关注主体是球队还是自然人；能否关注跨机构球队；点赞主体同问 | 决定 `team_follows`／`post_likes` 主键 |
| DQ06 | 评论是否开放、是否需要敏感词／举报／先审后发 | 决定评论表状态机与运营成本 |
| DQ07 | 招募是否带联系方式、联系谁、如何防骚扰 | 涉及手机号展示，必须单独确认 |
| DQ08 | **已定稿（2026-10-26）**：赛事卡只连“赛事中心”，不再挂“转会市场／球员身价”；转会改为发现第 4 分栏，不嵌套在赛事内 | —（已确认，见 2.5） |
| DQ09 | “同城”口径：球队 `city`／赛事 `city`／用户定位城市 | **已按“发起主体登记城市”实现（2026-10-27）**：约球按球队城市、赛事按赛事城市；不使用定位城市（定位需补隐私声明，当前 `chooseLocation` 仍被后台隐私指引拦截）。仅做“市”字归一，不改写原值。如要改为定位城市需另行确认 |
| DQ10 | 约球是否需要跨队公开撮合列表 | **已定（2026-10-27）：做**。已实现 `friendlyMatchCenter.listPublicInvites`（公开只读、同城筛选、脱敏）与 `respondPublicInvite`（本队代表提交应战意向、幂等、过期与自身邀约拦截），见 2.3 |
| DQ11 | 发现页转会栏的定位：入口指引／公开展示端 | **已定（2026-10-27）：公开展示端**。已实现 `dataCenter.transferShowcase`（最高身价／上升最快／已完成转会动态，游客可读）并重写发现页转会栏，见 2.5 |

DQ08（2026-10-26）、DQ10、DQ11 与 DQ02 的范围、DQ09 的口径已定；DQ01、DQ03—DQ07 仍是建表前置条件，其中 DQ03（是否审核）与 DQ02 的“游客是否可见”仍阻塞动态表落地。DQ11 仍待确认的只剩“成交金额是否公开”（Q09 转会中心待决规则）。

---

## 九、与转会中心的关系

- 发现页不新建转会相关集合，不复制 `dataCenter/transfer/` 的合同、报价、审核、窗口数据。
- 发现页赛事卡片只保留“赛事中心”一个入口；转会的入口放在发现根目录第 4 分栏，窗口倒计时、报价、收件箱、主办审核仍由赛事转会中心实现。
- 若后续需要“市场最新成交”出现在发现页，只能读转会中心的服务端投影，不能另建统计口径。

---

## 十、本轮明确未做

- 未创建 `discover_posts`、`team_posts`、`team_recruitments`、`team_follows`、`post_likes`、`post_comments` 任何集合或索引。
- `friendlyMatchCenter.listTeamInvites` 已部署（1.8.0）；未写入生产业务数据、未上传小程序、未提交审核。
- 本地 `index.js` 中更新的 `teamFriendlyStats`（依赖 `data-center/team-history.cjs`）尚未部署。
- 未实现动态公开流、关注流、点赞评论、跨队公开约球、同城强制过滤。
- 转会分栏只有窗口状态、主操作 CTA（去赛事栏选赛事）与规则速览；球员市场入口只做“去赛事栏选赛事”指引（真实市场在赛事转会中心内），我的合同、收件箱仍标“待接入”并只提示“待接入”，没有可用页面。
- 约球分栏只有“发起约球”与本队邀约列表，无报名／签到管理入口；现有签到在服务号 H5 `friendly-signin.html?token=`，而 `listTeamInvites` 故意不返回 `signinToken`，球队侧管理入口尚未设计。
- 未新增动态详情页、发布详情页、评论管理页（按交接范围）。
