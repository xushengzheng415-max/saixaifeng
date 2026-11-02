# 逐人驳回服务号通知（复用报名审核结果通知模板）20261030

## 一、背景

用户上传两张微信公众平台截图并说明「之前申请驳回模板不通过」：

- 图 1：服务号模板「注册申请驳回通知」的配置关键词页，可选关键词只有申请人/申请时间/商户名称/驳回原因/申请类型/审核时间/申请项目/用户名称/用户账号，已选 4 项。
- 图 2：系统通知「新增模板消息关键词的审核不通过 14:06」——原因「关键词【球员姓名、球队名称、赛事名称】与类目未能对应匹配，请重新描述」。

结论：微信模板关键词必须落在模板所属类目的词库内，自造业务词（球员姓名/球队名称/赛事名称）必然被拒。继续给该模板申请关键词不可行。

用户选择：

- 逐人驳回通知走 **已审核通过的「报名审核结果通知」模板**（`ovXRAzKHZE3Rsex7SVtl2zR-cMNznM_P3azxG8olz1g`，字段 比赛名称 `thing6` / 报名名称 `thing9` / 组别 `thing7` / 审核结果 `thing2`），不新申请任何关键词。
- 消息点进去落在 **服务号 H5「我的参赛资料」**：`https://www.sxffootball.cn/service-account-h5/me.html`。

## 二、实现

### 2.1 `tournamentRegistrationFlow`（发送方）

在 `sendServiceReviewNotification` 之后新增：

- `playerReviewRejectedProof(fields)`：canonical 串 `playerReviewRejected|tournamentId|teamId|playerId|reviewId|timestamp|nonce`。
- `notifyPlayerReviewRejected(event)`：新 action。
  - 调用方身份用 **足球服务号 AppSecret** 做 HMAC-SHA256（两函数共用同一服务号凭据，不新增环境变量）；校验时间戳 5 分钟窗口、nonce 16–64 位十六进制、`crypto.timingSafeEqual` 比较，失败返回 `BRIDGE_AUTH_FAILED`。
  - 展示内容一律以服务端库为准：读 `players` 校验 `teamId/teamCode` 归属与 `organizerReviewStatus==='rejected'`，读 `players.organizerReviewReason`、`tournaments`、`teams`、`tournament_teams`（组别名）。
  - 幂等：`notification_outbox` 唯一键 `${businessEventId}:service_account`，`businessEventId = player_review_rejected:{playerId}:{reviewId}`；已 `delivered` 直接返回 `ALREADY_DELIVERED`。
  - 无绑定 → `waiting_follow_bind`；无模板/无中转 → `configuration_required`；发送成功才写 `delivered`，失败写 `failed` 与错误码，不伪造送达。
  - 模板数据：`thing6` 赛事名、`thing9` 球员名·球队名、`thing7` 组别名、`thing2` `驳回：原因`；均经 `templateText` 截断到 20 字。
- `playerServiceBinding(player)`：按 `guardianUserId/playerUserId/linkedUserId/userId` 查 `service_account_bindings`（`sport:'football'`、`subscribed:true`、有 `officialOpenId`），兜底用 `guardianPhone/contactPhone/phone/phoneNumber` 命中 `users` 的 `phone`/`phoneNumber`。
- action 路由新增 `if (action === 'notifyPlayerReviewRejected') return await notifyPlayerReviewRejected(event)`。

### 2.2 `webLoginApi`（触发方）

`rejectPlayer` 在写完 `players.organizerReviewStatus='rejected'` 与 `tournament_teams.playerReviewStatus='needs_resubmit'` 之后，追加 best-effort 通知：

- 每次驳回生成 `reviewId = crypto.randomBytes(16).toString('hex')`，作为本次驳回事件标识（重复驳回即新事件，都会再次通知）。
- 用 `SERVICE_ACCOUNT_CONFIG.APP_SECRET` 按同一 canonical 串签名，`cloud.callFunction({name:'tournamentRegistrationFlow', data:{action:'notifyPlayerReviewRejected', ...}})`。
- 整段 `try/catch`，失败只 `console.warn`，不影响驳回结果与返回体。

## 三、验证

| 检查 | 结果 |
|---|---|
| `node --check` `tournamentRegistrationFlow/index.js`、`webLoginApi/index.js` | 通过 |
| 线上探针 `{"action":"notifyPlayerReviewRejected"}`（无要素） | `{"success":false,"code":"NOTIFY_PAYLOAD_REQUIRED","message":"缺少球员驳回通知要素"}`——路由在线，服务号凭据已配置 |
| 线上探针（全要素 + 全 0 proof） | `{"success":false,"code":"BRIDGE_AUTH_FAILED","message":"内部调用签名无效或已过期"}`——签名校验生效 |
| `node tools/check-referee-backend-package.cjs <staging>` | `PASS`（含报名 Word 上传范围与裁判表完整性） |
| 回下载比对 | `webLoginApi/index.js` 417,410 B、`tournamentRegistrationFlow/index.js` 179,569 B 与上传包 SHA-256 完全一致 |

未做：真实微信端到端（需用户本人已关注绑定的服务号账号 + 一次真实驳回）；H5 自助重新上传。

## 四、发布（2026-10-30）

### 4.1 `tournamentRegistrationFlow`

- 基线：`fn code download tournamentRegistrationFlow` 线上包；**未整包覆盖本地文件**。本地 `index.js` 除本轮新增外还含其他会话未发布改动（`TERMINAL_TOURNAMENT_STATUSES` / `registrationOpen` 口径、`publicDivisionRows` + `getPublicSignupDivisions` 抽取及其 action 注册），这些不在本轮范围，发布时用脚本只把本轮新增块插入线上基线，`git diff --no-index --stat` 反查 staging 与本地差异恰为上述既存改动（45 增 / 13 删），无本轮内容混入。
- `fn code update tournamentRegistrationFlow --dir <staging> --deployMode cos` 成功（CLI 提示「未找到函数配置，使用默认配置」，读回配置未变）。
- 读回：`index.js` 179,569 B / `10AD9C0F667A20B2CA84990671D1A9C68C42B0214BE5436637FC6098A7302A9B`，含 `notifyPlayerReviewRejected` 两处引用。
- `fn detail`：`Status=Active`、`AvailableStatus=Available`、`Nodejs18.15`、256 MB、60 s、`InstallDependency=TRUE`（与发布前 2026-10-29 13:50:32 配置一致）、`ModTime=2026-10-30 16:37:34`。

### 4.2 `webLoginApi`

- 基线：`fn code download webLoginApi` 线上包，只覆盖 `index.js`；与本地差异仅 +18 行（本轮 `rejectPlayer` 通知块）。
- `check-referee-backend-package.cjs` PASS 后 `fn code update --deployMode cos` 成功（「从配置文件读取函数 [webLoginApi] 的配置」）。
- 读回：`index.js` 417,410 B / `028B8C97AE7366B8BE8A1DDB871373883BE0E4386FD6AADADD2B87204F0490C7`。
- `fn detail`：`Active`/`Available`、`Nodejs18.15`、512 MB、120 s、`InstallDependency=TRUE`、`ModTime=2026-10-30 16:37:17`，运行配置未变。

### 4.3 测试端

两个云函数是**共享正式后端**，没有独立测试副本，故无测试函数可同步；本轮未改 H5、未改小程序，不产生测试端上传。

## 五、模板更换（同日 18:48 二次发布）

用户提出「用运动员资料审核不是更好？」，随后在服务号模板库确认：模板编号 44548「注册申请驳回通知」（类目 预约/报名）本身就带 **驳回原因** 与 **注册项目**，比 72792「运动员报名材料审核通知」（只有姓名/注册项目/审核状态/提交时间/审核时间，无驳回原因）更适合逐人驳回。按用户配置（关键词 申请人、申请时间、驳回原因、注册项目，去掉「申请类型(常量)」，场景说明「球员审核驳回」）添加成功。

- 模板 ID：`pwUTAI-c_v9sXfcVoLjjqwvCr5_0RixPYUQiT4BFi4k`
- 字段：申请人 `thing2`、申请时间 `time3`、驳回原因 `thing6`、注册项目 `thing9`
- 映射：申请人=球员姓名；申请时间=驳回时间（`organizerReviewedAt`，按北京时间输出 `YYYY-MM-DD HH:mm`）；驳回原因=`organizerReviewReason`（20 字截断，空值时用「资料不符合要求，请补充后重新提交」）；注册项目=`赛事名称·竞赛组别`（20 字截断）
- 新增 `servicePlayerRejectTemplateId()`（默认值即该模板 ID，`SXF_FOOTBALL_SERVICE_TEMPLATE_PLAYER_REJECT` 可覆盖）；球队级 `sendServiceReviewNotification` 仍用「报名审核结果通知」，未改动。
- 发布：以 2026-10-30 18:2x 线上包为新基线，脚本只替换本轮块与新增模板 ID 函数；`git diff --no-index --stat` 反查 staging 与本地仍只差既存的 45 增 / 13 删无关改动。部署后回下载 `index.js` 179,887 B / `DDB38DD02F3DD1D6777A800E2BE160BDC4417426E60DDC84E910917B604C42B3` 与上传包一致；`fn detail` 回读 `Active`/`Available`/256MB/60s/`InstallDependency=TRUE`/`ModTime=2026-10-30 18:48:54`；探针 `notifyPlayerReviewRejected` 仍返回 `NOTIFY_PAYLOAD_REQUIRED`。

## 六、遗留

1. H5「我的参赛资料」在 `state==='rejected'` 时已展示状态、驳回原因（`pp-reason`）与 7 项资料缺项提示，但**仍是只读页**，文案为「资料修改请联系球队管理员在球队端更新后重新提交」；`registration-resume.html` 只处理未完成的登记草稿（`registered`/`待提交`），**不支持已驳回球员自助重传**。若要做「驳回后球员自己重新上传」，需要新口径与后端写入路径，待用户确认。
2. 真实模板消息送达需用户在微信内用已关注绑定服务号的球员账号触发一次驳回验收。
3. 本地 `tournamentRegistrationFlow/index.js` 仍含其他会话未发布改动，未随本次发布。
