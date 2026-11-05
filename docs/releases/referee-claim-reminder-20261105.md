# 裁判认领催办通知（2026-11-05）

## 背景

赛事空间「裁判管理」页里，组委会已经能看到某位裁判，说明其手机号已登记，但页面仍只能弹关注二维码并提示「重新发送认领 / 邀请扫码绑定」。用户要求：已关注服务号的裁判不再出二维码，改为直接通过服务号重发催办通知；未关注的才回退到扫码流程。

## 改动

### 后端 tournamentRegistrationFlow

- 新增 `sendRefereeClaimReminder`：校验登录机构与赛事归属、裁判归属，拒绝虚拟裁判和无有效手机号的记录；按 `service_identities.serviceAccountOpenId`、`referees.wechatWorkflowOpenId` 判断是否已关注服务号。
- 同一手机号 1 分钟内重复点击返回 `REMINDER_TOO_FREQUENT`；未关注返回 `REFEREE_NOT_SUBSCRIBED`，由前端回退二维码。
- 已关注时创建 `referee_notifications`（`templateType=referee_claim_reminder`）并通过 `__notificationRelay` 交给通知函数发送，H5 链接带本次邀请 token。
- `createRefereeFollowInviteRecord` 对已绑定手机号**不再调用二维码接口**，返回 `alreadyBound`、`qrCodeUrl` 为空；新增临时裁判时若手机号已关注，同样直接进入催办通道。
- `staffRelayRights.cjs` 的裁判动作集合加入 `sendRefereeClaimReminder`。

### 后端 sendRefereeTemplateMessages

- 新增认领催办模板通道 `sendReminderOne`，字段映射 `thing1`=裁判姓名、`thing2`=赛事名称、`thing3`=主办机构、`time4`=提交时间；模板 ID 默认 `JBSIQSLN3wJG_Lm4d066oSKsTsgSy8xRl5wmqI7HnUA`，可用环境变量 `SERVICE_ACCOUNT_REFEREE_REMINDER_TEMPLATE_ID` 覆盖。
- 未配置模板时把记录标记为 `configuration_required` 并回写原因，不误发。
- 按手机号补发（`pendingNotifications`）时排除催办记录，避免用裁判任务模板批量带发。

### 前端 web-admin-vue

- 行内按钮改为「发送认领催办」「发送绑定催办」，点击先发催办；仅当后端判定未关注服务号时才打开关注二维码弹窗。
- 添加临时裁判成功后，若手机号已关注则提示已发送催办，不再弹二维码。
- 通用「邀请持证裁判」二维码入口保持不变。

## 发布记录

| 项 | 状态 |
|---|---|
| 源码提交 | `codex/align-newest-20261105` `f6193c46` |
| 云函数 tournamentRegistrationFlow | 已发布，Active / Nodejs18.15，环境变量回读与发布前一致，代码 SHA-256 与上传包一致 |
| 云函数 sendRefereeTemplateMessages | 已发布，Active / Nodejs16.13，环境变量回读与发布前一致，代码 SHA-256 与上传包一致 |
| PC 预览 `preview` | `44c203f2`，已发布 `/preview/admin/`，入口 200 且只引用 `/preview/admin/assets/` |
| 关键分包摘要 | `assets/index-8d-ahmdo.js` 本地与线上 SHA-256 一致 |
| 正式 `/admin/` | 未发布；回读仍 200 且引用 `/admin/assets/` 旧入口 |

两个云函数均以「先下载线上包、再在线上包上做差量修改」的方式发布，保留线上已有但仓库分支尚未合并的能力（报名流程的家长订阅与球队管理权限校验、通知函数的反馈回复模板）。

## 未覆盖

- 未新增环境变量，催办模板 ID 走代码默认值；如需更换直接在环境变量配置即可。
- 小程序、服务号 H5 未因本次改动重发。
- 未做真实服务号发送验收：需要一位已关注服务号的测试裁判手机号，点击「发送认领催办」后确认收到模板消息。

## 验收建议

1. 选一位已绑定服务号的临时裁判，点击「发送认领催办」，确认不再出现二维码、服务号收到催办模板消息。
2. 选一位未绑定手机号，确认仍弹出关注二维码。
3. 1 分钟内重复点击同一位裁判，确认提示「催办发送过于频繁」。
