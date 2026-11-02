# 发现板块约球数据模型与接口口径（2026-11-02）

状态：本地开发完成（分支 `feature/friendly-match-complete-20261102`，基线 `main e5bbe66a`），
**未推送、未合并、未部署**。本文件登记本次新增/变更的数据字段、状态值与历史数据处理口径，
以及 H5 与小程序的接口契约。发布清单与线上包比对结论见
[`releases/friendly-match-complete-20261102.md`](releases/friendly-match-complete-20261102.md)。

用户 2026-11-02 已确认口径：报名数 / 签到数 / 应战数彻底拆开；取消邀约必须通知已报名球员；
成局两条入口（对方接战、球队端人工点成局）；状态机由服务端持有；球员端只做 H5，球队端在小程序做管理页；
海报只做 H5 报名二维码；提醒以服务号模板消息为主。

---

## 一、集合与字段

### 1.1 `friendly_invites`（邀约）

保留既有字段：`teamId`、`teamName`、`opponentName`、`matchDate`、`matchTime`、`venue`、
`venueAddress`、`latitude`、`longitude`、`maxPlayers`、`deadline`、`battleCry`、
`signinToken`、`signinUrl`、`createdByUserId`、`createdAt`。

本次新增/明确语义：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `status` | string | 五态状态机，见第二节。历史邀约缺该字段时按 `open` 只读展示，写操作前补 `open` 并记 `statusSource:'legacy_normalize'` |
| `statusUpdatedAt` / `statusUpdatedBy` | Date / string | 最近一次状态变更时间与被谁变更（接战时为对方账号标识，人工操作时为发起队管理者 `userId`） |
| `statusSource` | string | 兼容标记，目前只有 `legacy_normalize`（历史邀约归一） |
| `signupCount` | number | **报名数**：球员在 H5 填姓名 + 手机号的有效报名条数（活跃 = `signup`/`present`） |
| `signupCountKnown` | boolean | `false` 表示历史邀约没有可信来源，页面必须显示「待确认」，不得当 0 |
| `signupCountSource` | string | `recount`（首次写入时按响应行重算）等来源标记 |
| `checkinCount` | number | **签到数**：管理页现场勾选 + 代签的条数（`present`） |
| `checkinCountKnown` / `checkinCountSource` | boolean / string | 同上，「已知/待确认」口径 |
| `acceptedCount` | number | **应战数**：对方球队点「接战」的次数（同一队伍接战只计一次） |
| `rejectedCount` | number | 对方明确表示无法应战的次数 |
| `acceptedTeamId` / `acceptedTeamName` | string | 首个接战队伍的标识与名称，供管理页与列表展示 |
| `cancelReason` / `closeReason` | string | 取消原因 / 流局（关闭）原因，最长 40 字 |
| `confirmedAt` | Date | 人工点「成局」的时间 |
| `remindedAt` | Date | 最近一次现场提醒时间 |
| `lastSignupAt` | Date | 最近一次新增报名时间 |
| `lastResponseAt` / `lastResponseStatus` / `lastRespondedBy` | Date / string | 保留既有：最近一次战书响应 |
| `signedInCount` | number | **仅历史兼容**：旧版把「签到」当报名口径写入，不再承载新语义，也不得再作为报名数展示 |

### 1.2 `friendly_match_responses`（报名 / 应战响应行）

一条邀约下可以有球员报名行和球队应战行两类，靠 `kind` 区分：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `inviteId` | string | 归属邀约 |
| `kind` | string | `signup`（球员报名，旧数据缺省按 `signup` 处理） / `team`（队伍应战） |
| `userId` | string | 报名人账号或对方账号标识；H5 报名无 openid 时留空 |
| `userName` | string | 报名姓名（最长 20 字）或对方球队联系人名 |
| `userPhone` / `phoneKey` | string | `userPhone` 为脱敏显示值（如 `138****0011`）；`phoneKey` 为明文 11 位，仅服务端用于幂等与通知反查，**不出现在任何列表接口** |
| `teamId` / `teamName` | string | **本次补齐**：队伍标识。`kind=team` 时必填；球员报名行为空 |
| `side` | string | `own`（本方） / `opponent`（对方） |
| `status` | string | 报名行：`signup`（已报名） / `present`（已签到） / `cancelled`（球员取消） / `removed`（管理端移除）；应战行：`accepted` / `rejected` |
| `source` | string | `h5_signup`、`proxy`（管理页代签）、`legacy_sign_in`（旧 `signIn` 接口） |
| `proxy` | boolean | 是否管理页代签 |
| `createdAt` / `respondedAt` | Date | 创建与响应时间 |
| `checkedInAt` / `checkedInBy` | Date / string | 勾签到时间与操作人 `userId` |
| `removedAt` / `removedBy` / `removeReason` | Date / string | 移除时间、操作人、原因 |
| `cancelledAt` / `cancelReason` | Date / string | 球员取消时间与原因 |

---

## 二、状态机（服务端唯一持有）

| 状态 | 文案 | 可报名 | 说明 |
| --- | --- | --- | --- |
| `open` | 报名中 | 是（未过截止且未满员） | 创建后默认状态 |
| `accepted` | 已接战 | 是（同上） | 对方球队点「接战」后由 `open` 推进；多个队伍可继续应战 |
| `confirmed` | 已成局 | 是（同上） | 发起队管理者人工点「成局」；成局后仍保留报名/取消能力以保持计数准确 |
| `cancelled` | 已取消 | 否 | 终态。人工取消，必须通知已报名球员，原因写入 `cancelReason` |
| `closed` | 已关闭 | 否 | 终态。人工标记流局，原因写入 `closeReason` |

迁移规则（服务端校验，条件更新 `where({status: 当前值})`，失败返回 `CONFLICT`）：

- `open` → `accepted`：对方点「接战」（`respondInvite` / `respondPublicInvite`），同时把首个接战队伍写入 `acceptedTeamId/Name`。
- `open` / `accepted` → `confirmed`：人工点「成局」（`confirmInvite`），写 `confirmedAt`，并通知已报名球员。
- `open` / `accepted` / `confirmed` → `cancelled`（`cancelInvite`）或 `closed`（`abandonInvite`）：终态，均通知已报名球员。
- 终态不可回退到任何非终态；重复提交同一目标状态返回幂等成功（`already: true`）。
- 历史邀约没有 `status` 时：只读按 `open` 展示，写操作前补写 `open` 后再做条件更新，避免误判冲突。

所有读取接口返回 `status`、`statusText`、`terminal`、`canSignUp`、`signupClosedReason`，
**前端不再自行推导状态、截止或满员**。

---

## 三、三个数字的口径

| 数字 | 唯一来源 | 展示规则 |
| --- | --- | --- |
| 报名数 `signupCount` | 球员在 H5 填姓名 + 手机号成功新增的活跃报名条数 | `signupCountKnown=false` 或值缺失 → 「待确认」 |
| 签到数 `checkinCount` | 球队端管理页勾选签到 + 代签 | `checkinCountKnown=false` 或值缺失 → 「待确认」 |
| 应战数 `acceptedCount` | 对方球队点「接战」（同队重复接战只计一次） | 缺失 → 「待确认」 |

- 代签（`proxyCheckInInvite`）只增加签到数，不增加报名数。
- 队伍应战行（`kind=team`）既不是报名也不算签到，禁止勾签到或按报名移除（服务端返回 `INVALID_DATA`）。
- 旧 `signedInCount` 仅作历史兼容读取，任何新页面不得把它当作报名数。

---

## 四、历史数据（缺字段）处理口径

1. 邀约缺 `signupCount` / `checkinCount`：读取时返回 `null` + `*CountKnown:false`，页面显示「待确认」，**禁止记 0**。
2. 首次对该邀约做写操作（报名、签到、代签）且能完整扫描响应行（`< 100` 条，未触发扫描上限）时，按响应行重算并写回 `signupCountSource:'recount'`；扫描被截断时保持「待确认」。
3. 邀约缺 `status`：只读按 `open`，写前补写 `open` 并记 `statusSource:'legacy_normalize'`。
4. 响应行缺 `kind`：按球员报名处理（`responseKindOf`），不改写原值；`kind=team` 才视为应战行。
5. 响应行缺 `status`：按 `signup` 处理（未签到）。
6. 不按姓名合并自然人；同一手机号重复提交按幂等更新为活跃报名，不加计数。

---

## 五、接口契约（`friendlyMatchCenter`）

新增 11 个 action，加固 4 个既有 action。H5 通过 `webLoginApi` 的 `friendlySignInWorkflow` relay
（`params.workflowAction` → `action`，返回 `{success, data, version}`）调用；小程序直接
`wx.cloud.callFunction({name:'friendlyMatchCenter'})`。**新增 action 不需要改动或重发 `webLoginApi`。**

| action | 调用方 | 权限 | 关键入参 | 主要返回 / 错误 |
| --- | --- | --- | --- | --- |
| `signUpInvite` | H5 | 公开（持 token） | `token`/`inviteId`、`userName`、`userPhone`、`side`、`source` | `signupId`、`alreadySignedUp`、`signupCount(+Known)`、`maxPlayers`；`CLOSED`/`FULL`/`INVALID_PARAM` |
| `cancelInviteSignup` | H5 | 本人（按手机号） | `token`/`inviteId`、`userPhone`、`reason` | `status:'cancelled'`、`already`、`signupCount(+Known)`；`NOT_FOUND` |
| `getMyInviteStatus` | H5 | 本人（按手机号） | `token`/`inviteId`、`userPhone` | 邀约状态 + `mySignup{status,statusText,canCancel}` |
| `listInviteSignups` | 小程序管理页 | 发起队管理者 | `inviteId`、`page`、`pageSize`(5~50)、`filter`(all/signup/present/team)、`withPhone` | `invite`、`rows[]`、`counts{all,signup,present,team}`、`total`、`hasMore`、`scanLimited`；`FORBIDDEN` |
| `checkInInviteSignup` | 管理页 | 管理者 | `inviteId`、`responseId`、`present` | `present`、`already`、`checkinCount(+Known)`；`CLOSED`/`INVALID_DATA`/`FULL` |
| `proxyCheckInInvite` | 管理页 | 管理者 | `inviteId`、`userName`、`userPhone`、`side` | `responseId`、`proxy:true`、`checkinCount(+Known)`；`CLOSED`/`FULL` |
| `removeInviteSignup` | 管理页 | 管理者 | `inviteId`、`responseId`、`reason` | `removed`、`already`、`signupCount`、`checkinCount`；`INVALID_DATA` |
| `confirmInvite` | 管理页 | 管理者 | `inviteId` | `status:'confirmed'`、`from`、`notify{...}`；`CLOSED`/`CONFLICT` |
| `cancelInvite` | 管理页 | 管理者 | `inviteId`、`reason` | `status:'cancelled'`、`reason`、`notify{...}` |
| `abandonInvite` | 管理页 | 管理者 | `inviteId`、`reason` | `status:'closed'`、`reason`、`notify{...}` |
| `remindInviteSignups` | 管理页 | 管理者 | `inviteId`、`note` | `notify{...}`；`CLOSED` |
| `createInvite`（加固） | 小程序发起页 | 发起队**管理者**（owner / 管理角色成员） | 原有入参 | 新增返回 `status/statusText`，落库初始化三计数与 `*Known` |
| `getInvite`（加固） | H5 / 小程序 | 匿名可读基本信息 | `token` 或 `inviteId`；可选 `userPhone` | 白名单字段 + 服务端状态口径；仅管理者视图才回 `signinToken/signinUrl/createdByUserId/cancelReason/acceptedTeam*`；传手机号时附 `mySignup` |
| `respondInvite`（加固） | H5 / 小程序 | 公开 | `token`、`status`(accepted/rejected)、`teamId`、`teamName` | 响应行带 `kind:'team'` + 队伍标识；接战推进状态与 `acceptedCount` |
| `signIn`（加固，旧接口） | 旧 H5 链接 | 公开 | `token`、`userId`、`userName`、`userPhone` | 语义收敛为「报名并到场」，受截止/状态/满员/幂等约束；新链路请用 `signUpInvite + checkInInviteSignup` |
| `listSignins`（加固，旧接口） | 小程序 | 管理者（原为「本队成员」） | `inviteId` | 只回响应摘要，剔除 `signinToken`/`signinUrl` |
| `listPublicInvites` / `respondPublicInvite` | 小程序发现页 | 公开（游客可看；应战需登录上下文） | 公开列表分页；应战带 `token/teamId/teamName` | 公开列表只列 `open` + `accepted`，不含详细地址、手机号、凭证 |

并发与防超卖：

- 报名最后一席使用条件更新 `where({_id, status: in(open/accepted/confirmed), signupCount: lt(maxPlayers)})` 自增，`stats.updated !== 1` 即返回 `FULL`；写响应行失败回滚 `-1`。
- 签到用 `checkinCount: lt(maxPlayers)` 守卫，取消签到用 `gt(0)` 守卫。
- 状态推进用 `where({status: 当前值})` 守卫，冲突返回 `CONFLICT` 提示刷新。

---

## 六、通知

### 6.1 模板与路由（每模板独立映射表）

字段适配层在 `cloudfunctions/friendlyMatchCenter/template-fields.cjs`，`TEMPLATE_DEFS` 是唯一权威表；
业务代码只传语义值（状态句 / 时间 / 场地 / 发起球队 / 接收人），不出现 `thing*`、`time*` 字段名。

| templateKey | 模板 | 编号 | 字段映射 | 接收人兜底 | 模板 ID 来源 |
| --- | --- | --- | --- | --- | --- |
| `success`（A） | 约球成功通知 | 58013 | 约球名称 `thing1` / 约球时间 `time2` / 约球地址 `thing3` / 组织者 `thing4` / 参与人 `thing5` | 球队球员 | `SXF_INVITE_TEMPLATE_ID` → `SXF_SIGNIN_TEMPLATE_ID`（旧名兼容，两者可同时指向 A） |
| `cancel`（B） | 约球已取消通知 | 58014 | 约球名称 `thing1` / 约球时间 `time2` / 约球地址 `thing3` / 组织者 `thing4` / 报名人 `thing6` | 队员 | `SXF_CANCEL_TEMPLATE_ID` |

两个模板都没有 `first` / `keyword*` / `remark` 位，跳转文案由微信固定为「点击查看详情」，跳转地址只走 `message.url`。

路由表（`NOTIFY_SCENE`，同样在云函数内，显式驱动）：

| 场景 | kind | 模板 |
| --- | --- | --- |
| 发起约球推送本队球员 | `invite` | A |
| 对方接战 / 拒战通知发起人 | `response` | A |
| 人工成局 | `confirmed` | A |
| 开赛前提醒（管理页手动） | `reminder` | A |
| 取消邀约 | `cancelled` | B |
| 流局（人工关闭） | `closed` | B |

回落规则：`cancel` 未配置 `SXF_CANCEL_TEMPLATE_ID` 时按语义回落到 A，且字段映射同步切回 A（`thing6` 不会发给 A 模板）；
返回结构中 `templateKey` 标明实际用的模板、`requestedTemplateKey` 保留原语义、`templateFallback:true` 标明发生了回落。

### 6.2 字段值规则（两模板通用）

- `thing*` 一律 ≤ 20 字，超长按字符截断并补 `…`（`clipThing`，按 Unicode 字符计数，不切半个字）。
- `time2` 由 `matchDate` + `matchTime` 生成：`YYYY-MM-DD HH:mm~HH:mm`；只有开始时间输出单个 `YYYY-MM-DD HH:mm`；
  结束时间早于开始只保留开始；日期或时间无法解析（如「待定」）返回 `ok:false`，调用方整条跳过发送并写 `skippedReason`，绝不发脏数据。
- `thing1` 承载状态语义：发起约球 / 已接战 / 已拒战 / 已成局 / 已取消 / 已流局 / 开赛提醒。
- `thing3` 场地为空时填「待确认」；`thing4` 为发起球队名，为空填「我方」。
- `thing5`（A 参与人）/ `thing6`（B 报名人）为接收人姓名：报名通知优先用报名行姓名，其次 `users` 档案，最后用模板各自兜底文案。

### 6.3 取消原因（B 模板没有独立原因位）

- 取消 / 流局 / 提醒的备注优先并入 `thing1`，形如「`「A 队」约球已取消·场地被占`」。
- 合并后超过 20 字时只保留状态句（如「`「A 队」约球已取消`」），完整原因通过返回结构 `notify.reason` 回传，`notify.reasonClipped:true` 标记被截断，便于排查。

### 6.4 通道与统计口径

- 载体：服务号模板消息。优先走固定出口桥接 `ops/wechat-football-bridge`（`template/send`，要求 `{message:{touser,template_id,url,data}}` 包装）；
  未配桥接时退回直连，需要 `SERVICE_ACCOUNT_APP_ID` / `SERVICE_ACCOUNT_APP_SECRET`。
- openid 只认服务号渠道：`users.serviceAccountOpenId` / `users.officialOpenId` → `service_identities.serviceAccountOpenId`（`phone` + `phoneVerified:true`）；
  不读小程序 / 网站渠道的 `wechatOpenId`、`openId`。
- 触发：取消邀约、流局、人工成局、开赛前提醒（管理页手动触发）。
- 对象：仅该邀约的在册活跃报名行（`signup`/`present`），按 `phoneKey` 反查 `users`（兼容 `phone`/`phoneNumber`）。
- 返回 `notify{kind,total,sent,skipped,failed,templateKey,templateTitle,templateId,templateConfigured,templateFallback,requestedTemplateKey,statusName,reason,reasonClipped,skippedReason}`；
  只有 `sendTemplate` 明确成功才计 `sent`，模板缺失 / 通道未配置 / openid 缺失一律计 `skipped`，不阻断主流程。
- 小程序订阅消息本次不接，`healthCheck` 暴露 `miniProgramSubscribe:'not-enabled'` 作为接口位；
  `healthCheck.templateRoutes` 同时暴露每套模板的 `fieldMap`、生效模板 ID 与回落情况，发布后可直接读回核对。

### 6.5 环境变量（由有权限者配置，代码不写云端）

| 变量 | 用途 | 说明 |
| --- | --- | --- |
| `SXF_INVITE_TEMPLATE_ID` | A 模板 | 模板 A 上线后填 58013 的模板 ID |
| `SXF_SIGNIN_TEMPLATE_ID` | A 模板（旧名兼容） | 与 `SXF_INVITE_TEMPLATE_ID` 同值即可，代码按顺序回落 |
| `SXF_CANCEL_TEMPLATE_ID` | B 模板 | 填 58014 的模板 ID；不配时取消通知回落 A |

本地示例（仅文档，不入库真实值）：

```powershell
SXF_INVITE_TEMPLATE_ID=<模板 A 58013 的 ID>
SXF_SIGNIN_TEMPLATE_ID=<与 A 同值>
SXF_CANCEL_TEMPLATE_ID=<模板 B 58014 的 ID>
```

### 6.6 已知语义偏差（待办）

- 开赛提醒复用 A「约球成功通知」的标题，微信侧标题与提醒语义不完全对应，接收人看到的标题仍是「约球成功通知」。
- 若需要独立提醒标题，在服务号后台再申请一个提醒类模板即可接入：`TEMPLATE_DEFS` 加一条 `reminder` 定义、`NOTIFY_SCENE.reminder.templateKey` 指向它、补一个 `SXF_REMINDER_TEMPLATE_ID`，业务代码无需改动。

---

## 七、客户端入口

| 端 | 入口 | 说明 |
| --- | --- | --- |
| H5 | `service-account-h5/friendly-signin.html?token=` | 报名（姓名 + 手机号）、查看自己报名状态、取消报名、对方接战/拒战；手机号只存本端 `localStorage`（键 `sxf_friendly_signup_<token>`）用于回显，不做身份凭证 |
| 小程序发现页 | `pages/discover/discover` | 本队卡整卡进入管理页；卡片展示报名/签到/应战三个数字，缺字段显示「待确认」 |
| 小程序发起页 | `pages/discover/invite-create/invite-create` | 创建邀约后 canvas 生成海报（球队名/时间/场地/限额 + H5 报名二维码）→ 保存相册 / 复制报名链接 / 进入管理名单；不加小程序码 |
| 小程序管理页 | `pages/discover/invite-manage/invite-manage?inviteId=` | 报名名单（分页 + 筛选）、勾签到/取消签到、代签、移除报名、取消邀约、点成局/流局、现场提醒、复制报名链接 |

二维码编码器为纯 JS 实现（`miniprogram/pages/discover/invite-qr.js`），不新增云函数或小程序依赖。

---

## 八、未做与后续

- 小程序订阅消息接口位（`miniProgramSubscribe:'not-enabled'`）未接。
- 开赛提醒当前复用 A 模板「约球成功通知」标题；如需独立提醒模板，后台再加一个即可接入（见 6.6）。
- 开赛前自动提醒的定时触发器未创建（线上函数无触发器配置），目前只能管理页手动触发。
- 成局/流局后的记分、归档、转正式战绩不在本次范围。
- 未做面向球员的小程序详情页与小程序码（用户口径）。
