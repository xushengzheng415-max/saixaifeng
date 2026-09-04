# 赛小蜂足球原型落地交接文档

### 2026-08-19 20:10:30 公众抽签大屏原型包待确认

- 用户确认方案 A，第一阶段只做专业版抽签；产品规则和 ADR 已更新。
- 新增 `prototype-pages/screen-draw/` 七状态原型和独立确认板：抽签介绍、球队展示、抽签进行、分组结果、发布撤回、链接无效/过期、断网恢复。
- 1920×1080 与 1366×768 均已渲染，全部无横向溢出；确认板审计为 1 区段、7 页面、0 缺页、0 缺逻辑、PASS。
- 七个 `_assets` 包均通过验证，每包 3 个布局、3 个裁片、0 个新增生产素材，状态统一为 `awaiting-user-confirmation`。素材包确认前未开始正式大屏应用或公开快照接口。

### 2026-08-19 19:37:47 公众赛事大屏待确认方案

- 新增 `docs/SCREEN_PRODUCT_DECISION_PROPOSAL.md`；提供独立公众大屏应用、PC 公开路由、暂缓三种方案，推荐独立应用第一阶段只做专业版抽签。
- 方案定义公开快照白名单、敏感字段禁入、发布/撤回/过期、不可预测令牌、统一 HTTP 入口和审计要求。
- 状态仍为待用户确认，未写入已确认产品规则，未开始大屏页面或接口实现，未部署或发布。

### 2026-08-19 19:32:59 赛事大屏真实阻塞修正

- 当前仓库只有 `ProfessionalDrawFlow.vue` 的后台大屏设置/预览和 `screen.sxffootball.cn/draw/:tournamentId` 链接生成器，没有独立公开大屏应用、公开路由或匿名只读数据接口。
- 已验收的 162 节点包含后台“大屏设置”，不能据此声称公众赛事大屏已完成；`screen` 不只是 DNS/证书问题。
- 实施前需确认大屏范围与公开数据授权方案；未确认前不从后台会话或数据库接口拼装一个公开页面。本轮未部署、未提交审核、未发布。

### 2026-08-19 19:27:41 生产就绪只读检查自动化

- 新增 `tools/check-production-readiness.ps1`，统一检查三个域名、裁判长无会话门禁和裁判通知配置状态；不发送通知、不读取通知队列、不写业务数据、不打印凭据。
- 当前读回：`coreWeb=true`；`refereeNotification=false`、`apexCompatibility=false`、`screen=false`、`full=false`。
- 缺失项仍为服务号四项生产变量、根域名兼容网站入口和 `screen.sxffootball.cn` DNS/证书/路由。本轮未部署、未提交审核、未发布。

### 2026-08-19 19:20:57 生产外部配置检查表

- 新增 `docs/PRODUCTION_EXTERNAL_CONFIGURATION.md`，覆盖微信回调域、裁判通知变量/模板字段/中转门禁、根域名与赛事大屏 DNS/证书完成条件，以及未发布候选范围。
- 文档不保存任何 AppSecret、令牌、API Key 或模板真实值；未知配置没有写入代码。
- 后续由微信开放平台、服务号和 DNS/网关管理员按清单执行；本轮未部署、未提交审核、未发布。

### 2026-08-19 19:17:24 未发布候选包清单

- 官网根 `index.html` 与线上 SHA-256 一致，无需重复上传；小程序、云函数和根入口没有本轮源码差异。
- PC 候选包为 `web-admin-vue/dist` 193 个文件、32,884,809 bytes；Vite 哈希资源图已变化，后续必须完整上传 `/admin/`，不能只替换单个 chunk。
- 家长 H5 `index.html` 与线上一致，只有 `app.js` 和 `styles.css` 需要在获准发布后更新。
- 当前用户禁止提交审核和发布，本轮仅生成清单，没有上传任何候选文件。

### 2026-08-19 19:10:24 外部配置只读复核

- 正式线上登录分包包含 `www.sxffootball.cn` 与 `/admin/#/wechat-callback`，回调分包使用 `webLoginApi` HTTP 入口，均不含浏览器 CloudBase SDK；微信开放平台后台仍需管理员确认授权回调域。
- 裁判通知配置诊断返回 `configured:false`、`results:[]`，四项缺失变量为 `SERVICE_ACCOUNT_APP_ID`、`SERVICE_ACCOUNT_APP_SECRET`、`SERVICE_ACCOUNT_REFEREE_TEMPLATE_ID`、`SERVICE_ACCOUNT_H5_URL`；未读取通知队列或发送消息。
- `www.sxffootball.cn` CNAME 正常且 HTTPS 200；根域名无网站 HTTPS；`screen.sxffootball.cn` 无 CNAME/A/HTTPS。本轮只读，未部署、未提交审核、未发布。

### 2026-08-19 19:03:17 全量视觉截图验收完成

- PC 专业版认领邀请弹层与家长 H5 01-08 共 9 个节点完成目标/回退视口截图，全部从 `visual-review-pending` 转为 `visual-accepted`。
- 严格门禁为 162/162、视觉待执行 0、visual-1:1 通过；PC 1672×941 与 1440×900 均无横向溢出，H5 目标长页与批准原图高度差 0%–3.7%，390px 回退长页全部无横向溢出。
- 儿童、身份证和透明人像继续按隐私素材边界使用代码示意或受限占位；本地 QA 不调用云函数、不创建认领邀请、不写真实资料。
- PC 构建、Node 语法、11 区段/162 页画板审计和差异检查通过。按用户要求暂不提交审核和发布，本轮未上传生产静态包。

### 2026-08-19 18:26:20 进入全量视觉截图验收

- 用户明确允许正式页面预览和目标/回退视口截图，仍禁止小程序提交审核和发布。
- 静态台账 162/162；严格视觉待验收为 9 个节点：PC 专业版球队认领邀请弹层 1 个、家长服务号 H5 01-08 共 8 个。
- `www.sxffootball.cn` 四个正式入口已上线；2026-08-18 的 `webLoginApi.setHeadReferee` 安全中转已读回 `Deployment completed / modifyTime 2026-08-18 12:22:38`，无会话探针返回 `AUTH_REQUIRED`，不再等待部署。

### 2026-08-15 11:43:01 线上状态复核

- 正式域名根目录、/admin/、/referee/、/service-account-h5/ 均 HTTP 200；主要已登记云函数为 Deployment completed。
- 线上函数列表无 setHeadReferee，无会话探针仍返回“不允许调用云函数: setHeadReferee”；PC 裁判长中转待 CloudBase 打包环境恢复后部署。小程序 1.0.19 仅开发者上传，未预览、未提交审核、未发布。

### 2026-08-15 11:39:00 旧名单换人入口收口

- 画板外旧小程序页 `miniprogram/pages/roster-change/roster-change` 不再调用线上不存在的 `submitRosterChange`；入口改为“普通换人申请已关闭”，引导报名截止后的名单变化联系主办方走异常处理，不直接部署旧的无统一租户鉴权函数。
- 全量 JS 检查、162/162 静态门禁、云函数引用缺口 0 和 `git diff --check` 通过；微信开发者工具 CLI 上传 1.0.19 成功（TOTAL 1,544,424 bytes），仅开发者上传，未预览、未提交审核、未发布。

### 2026-08-15 11:31:30 设置裁判长入口安全中转（待线上部署）

- PC `setHeadReferee` 已切到 `webLoginApi` relay；服务端按当前机构、赛事归属和当前赛事已分配裁判校验，不直接部署原未鉴权旧云函数。
- 本地 `node --check`、PC `npm run build`、162/162 门禁和 `git diff --check` 通过；CloudBase CLI 三次均卡在本地 ZIP 打包，线上函数仍为 `modifyTime 2026-08-15 10:40:49`，未上传 `/admin/`，待打包环境恢复后再部署回读。

### 2026-08-15 11:04:22 旧分享页 PDF 引用收口

- 画板外旧分享页 `miniprogram/pages/match/share/share` 不再调用不存在的 `generatePDF` 云函数，按钮改为“PDF导出待配置”；未新增未经确认的 PDF 业务规则或权限。
- 全量 JS 检查、`git diff --check` 和 162/162 静态门禁通过，云函数引用缺口/历史例外均为 0；开发者版本 1.0.18 上传成功（TOTAL 1,545,196 bytes），未预览、未提交审核、未发布。

### 2026-08-15 10:57:44 首页缺失数据提示中性化

- `pages/home/home.js` 对缺失的教练、球队、比赛和训练字段统一使用“待完善/待定”，显式视觉 fixture 不变。
- 全量 JS 检查和 162/162 静态门禁通过；开发者版本 1.0.17 上传成功（TOTAL 1,546,030 bytes），未预览、未提交审核、未发布。
### 2026-08-15 10:54:08 小程序首页视觉样例回退修正

- `pages/home/home` 只在开发者工具且显式 `visualQa=1` 时加载样例；真实上下文失败不再展示预览假数据，改为真实错误态。
- 全量 JS 检查和 162/162 静态门禁通过；开发者版本 1.0.16 上传成功（TOTAL 1,545,919 bytes），未预览、未提交审核、未发布。
### 2026-08-15 10:50:54 PC 静态包回归复核

- `web-admin-vue` `npm run build` 通过；`dist` 的四个入口 JS/CSS 资源与正式域名 `/admin/assets/` 对应文件逐字节 SHA-256 一致，无需重复上传。
- 仅只读验证，未预览、未提交、未推送。

### 2026-08-15 10:45:15 线上状态只读复核

- 正式域名 `/`、`/admin/`、`/referee/`、`/service-account-h5/` 均返回 HTTP 200；CloudBase 足球环境函数列表中的 `webLoginApi`、`getMiniWorkspace`、`onboardingWorkspace`、`organizerClaimInvite`、`applyTournament`、`serviceMatchWorkflow`、`updateMatch`、`sendRefereeTemplateMessages` 均为 `Deployment completed`。
- 小程序当前仅开发者版本 1.0.15，未提交审核、未发布；9 个视觉节点和通知模板生产变量仍待完成。未预览、未写入真实业务数据、未提交、未推送。

### 2026-08-15 10:41:12 家长历史提交引用兼容

- `completeParentProfile` 在当前要求关闭、但历史提交已存在的重复提交场景中保留既有实名与人像引用，不会因新分支把 `verificationId`、`portraitId` 或 `avatarFileId` 清空；当前显式开启要求仍按实时配置校验。
- `webLoginApi` 线上回读 `Nodejs18.15 / Deployment completed / modifyTime 2026-08-15 10:40:49`；无会话和无效邀请探针分别为 `AUTH_REQUIRED`、`PARENT_INVITE_INVALID`，未使用真实资料。

### 2026-08-15 10:37:54 家长协作入口清单同步

- 小程序家长协作页的数据源 `getMiniWorkspace.formatParentProfileInvite` 不再固定展示实名和标准形象照；仅当邀请/球员记录显式开启对应开关时加入清单，基础资料与监护授权仍保留。
- `getMiniWorkspace` 线上回读 `Nodejs18.15 / Deployment completed / modifyTime 2026-08-15 10:37:31`；无会话固定入口探针为 `AUTH_REQUIRED`，未读取或写入真实家长、球队或赛事数据。

### 2026-08-15 10:34:09 家长 H5 独立要求分支收口

- `previewParentProfileInvite` 只采信邀请/球员上明确存在的 `identityVerificationRequired`/`portraitRequired` 兼容字段；没有显式开关时，活动邀请只表示家长基础资料协作，不强制实名或标准形象照。
- `service-account-h5/app.js` 在基础资料确认后按要求进入实名、形象照或直接提交；`webLoginApi.completeParentProfile` 只校验已开启的要求。原型样例显式传入实名与形象照要求，因此批准视觉状态不被默认分支改变。
- `webLoginApi` 线上回读 `Nodejs18.15 / Deployment completed / modifyTime 2026-08-15 10:32:44`；H5 4 个文件已上传，公网 `app.js` 与本地 SHA-256 一致（`BE6FAE8DDFB09C30C8AD543402C0A4DACE703835E4635A0EC70DE19250A83681`）。无会话和无效邀请探针分别为 `AUTH_REQUIRED`、`PARENT_INVITE_INVALID`；未使用真实资料、未预览、9 个视觉节点仍待验收。

### 2026-08-15 10:22:58 正式名单要求默认值收口

- `getMiniWorkspace` 与 `webLoginApi` 已修正：未配置赛事/竞赛组别要求时，不再把标准形象照或家长资料补充历史兜底当作强制待办；显式 `identityVerificationRequired`、`portraitRequired`、`parentSupplementRequired` 仍按组别/赛事配置生效。
- 两个云函数已部署并安全回读 `Deployment completed`（`getMiniWorkspace` 10:21:25、`webLoginApi` 10:22:01）；固定 HTTP 入口无会话返回 `AUTH_REQUIRED`，未读取或写入真实业务数据。
- 家长独立 H5 邀请当前没有 `tournamentId/divisionId`，本轮未擅自选择配置归属；9 个视觉节点仍待验收，未提交、未推送、未发布。

### 2026-08-15 07:45 家长独立配置来源审计

- 家长协作入口目前从球队球员库/快速创建球员发起，`parentProfileInvite`、重新生成和 `createParentLink` 均没有赛事或组别上下文；`previewParentProfileInvite` 只能兼容读取旧球员 `requiresRealName`，标准形象照没有权威配置来源。
- 这不是前端默认值问题。按已确认的独立配置规则，未把球队级邀请自动归到某个赛事/组别，等待明确“配置归属与传递入口”后再改数据模型；本轮没有代码、部署或业务数据变更。

### 2026-08-15 07:44 实名更正接口 active 邀请门禁

- 已通过实名的更正申请现在也必须先通过当前 active 邀请预览；邀请撤销、过期或关联关系断裂时不创建更正工单。
- `webLoginApi` 线上读回 `Nodejs18.15 / modifyTime 2026-08-15 07:43:27 / Deployment completed`；无会话探针为 `PARENT_AUTH_REQUIRED`，无效邀请预览为 `PARENT_INVITE_INVALID`。未使用真实家长会话或实名记录，未预览。

### 2026-08-15 07:39 家长 H5 人像上传/确认 active 邀请门禁

- `uploadAndProcessParentPortrait` 与 `confirmParentPortrait` 在受限原图、透明派生图或头像裁切写入前重新调用邀请预览，邀请过期、撤销或球员/球队关系断裂时不再继续人像流程。
- `webLoginApi` COS 部署并读回 `Nodejs18.15 / modifyTime 2026-08-15 07:39:02 / Deployment completed`；无会话探针返回 `PARENT_AUTH_REQUIRED`，无效邀请预览返回 `PARENT_INVITE_INVALID`。未使用真实家长会话、证件或人像，未预览。

### 2026-08-15 07:35 家长 H5 身份上传/提交门禁补强

- `uploadParentIdentityDocument` 与 `submitParentIdentityVerification` 现在都重新读取 active 邀请预览；提交动作还要求当前邀请的基础资料草稿已确认且监护人授权，防止存活会话跨过已失效邀请或未完成基础资料直接产生实名记录。
- H5 已上传身份证材料但提交识别失败时，清空文件引用后显示“刷新状态或重新上传”，不再出现文案说可重试但按钮实际禁用的矛盾状态。
- `webLoginApi` 通过 COS 部署并读回 `Nodejs18.15 / modifyTime 2026-08-15 07:34:37 / Deployment completed`；无会话探针为 `PARENT_AUTH_REQUIRED`，无效邀请为 `PARENT_INVITE_INVALID`。未使用真实家长会话、证件或资料写入，未预览。

### 2026-08-15 07:11 家长 H5 匹配孩子入口防重复授权

- 家长匹配页的“这是我的孩子，开始补充”首次点击立即进入忙碌态；已有同邀请会话只执行一次资料读取，未授权时通过 `parentOAuthBusy` 阻止并行创建多个 OAuth 状态。授权入口失败会释放忙碌态，保留原错误页重试，不改变邀请、身份或资料边界。
- `node --check service-account-h5/app.js`、162/162 静态门禁和 `git diff --check` 通过；`service-account-h5/` 上传 4 个文件并回读公网 `app.js` HTTP 200，SHA-256 与本地一致（`D2EF2EBF182A7236F856370B6079BA583BD0A73B8A8C2FFF2AA190AF0EE87754`）。未预览、未使用真实家长会话或资料，9 个视觉节点仍待验收。

### 2026-08-15 07:05 专业版认领提醒弹层状态复核

- `TournamentTeams.vue` 现在在空 `claimInvitePath` 时不进入二维码计算；邀请生成成功后即时显示本次分享时间，切换、关闭和失败会清理状态。云函数接口保持兼容，未改变 `organizerClaimInvite`，未执行真实认领写入。
- `npm run build`、云函数 `node --check`、162/162 静态门禁、`git diff --check` 通过；`/admin/` 193 个文件已上传，公网 `TournamentTeams-D7uSYmr0.js` 与本地 SHA-256 一致（`F311AF1F4B1BA297E9B01E68C1F51DF558734F57408523FF451FDC515BD89D47`）。用户仍禁止预览，因此该节点继续待视觉验收。

### 2026-08-15 06:27 专业版发送认领提醒弹层空二维码占位修正

- 专业版 `TournamentTeams.vue` 在认领邀请尚未由 `organizerClaimInvite` 返回真实路径时，不再对空字符串绘制二维码；只有 `claimInvitePath` 存在才渲染代码生成的二维码，其他状态显示“生成中/待生成”占位和明确说明。
- `npm run build`、全量静态门禁和 `git diff --check` 通过；`/admin/` 193 个文件已上传，公网 `TournamentTeams-DGv1PH16.js` 与本地原始字节 SHA-256 一致。未预览或执行真实认领写入；该节点仍待视觉验收。

### 2026-08-15 06:19 家长 H5 线上动作注册与鉴权回读

- `getParentProfileDraft`、`saveParentBasicProfile`、`uploadParentIdentityDocument`、`submitParentIdentityVerification`、`getParentIdentityVerification`、`requestParentIdentityCorrection`、`uploadAndProcessParentPortrait`、`confirmParentPortrait`、`completeParentProfile` 逐项使用空会话与虚拟 invite 探针，全部 HTTP 200 + `PARENT_AUTH_REQUIRED`。
- 未读取或写入真实家长、证件、人像或资料，无需重复部署；9 个视觉节点仍待验收，未预览、未提交、未推送、未发布。

### 2026-08-15 06:13 PC 静态包线上一致性复核
- `web-admin-vue npm run build` 通过；公网 `/admin/` 引用的 `index-DbVePOJO.js`、`vue-vendor-C9beSz07.js`、`element-plus-CMVyjDO1.js` 与 `index-DpOb8WhM.css` 均与当前 `dist` 原始字节 SHA-256 一致，无需重复上传。
- 根域名、`/admin/`、`/referee/`、`/service-account-h5/` HTTP 200；未预览、未提交、未推送、未发布。

### 2026-08-15 06:05 裁判指派通知中转衔接修正
- `updateMatch` 不再直接调用 `sendRefereeTemplateMessages`；仅在网页已鉴权的 `webLoginApi` relay 中传递内部通知元数据，由统一中转生成手机号 + 通知 ID + HMAC 时间窗证明。
- `updateMatch` 与 `webLoginApi` 已部署并读回 `Deployment completed`；无会话 relay 返回 `AUTH_REQUIRED`，通知函数无证明探针返回 `INTERNAL_RELAY_REQUIRED`，没有真实比赛或通知数据写入。

### 2026-08-15 06:12 小程序视觉样例入口安全收口
- 新增 `workspace.isVisualQaEnabled`，登记页面的 `visualQa=1` 只有在微信开发者工具 `platform=devtools` 时才会加载本地样例；真实设备和普通用户不会因为手动拼接参数看到假赛事、假球队、假球员或假待办。
- 统一收口事件、待办、青训、球队资料/邀请/数据包、阵容结果、赛程、赛事详情、赛前/赛中/赛后复核与异常等页面；全量小程序 JS `node --check` 与 162/162 静态门禁通过。
- 开发者版本 `1.0.9` 已上传并回读 `TOTAL 1,546,485 bytes`、主包 `977.0 KB`；未提交审核、未发布、未预览。

### 2026-08-15 05:10 静态门禁视觉待验收统计修正

### 2026-08-15 05:44 裁判通知函数内部中转鉴权收口并上线

- `webLoginApi` 在裁判绑定成功后调用 `sendRefereeTemplateMessages` 时，使用现有服务号密钥生成带时间窗的 HMAC 中转证明；通知函数拒绝无证明的手机号/通知 ID 调用，仅保留不读写数据的 `configurationStatus` 配置诊断动作。
- 两个云函数均已部署；无证明线上回读 `INTERNAL_RELAY_REQUIRED`，配置诊断只返回 `configured:false` 和缺失变量名，不返回密钥值。通知生产变量仍需服务号管理员配置。

### 2026-08-15 05:31 小程序开发者版本上传回读

- 微信开发者工具 CLI 上传 `1.0.8` 成功，回读包体 `TOTAL 1,546,266 bytes`，主包 `976.8 KB`，分包为 `packageA 33.4 KB`、`pages/match 70.5 KB`、`pages/team 210.5 KB`、`pages/tournament 218.8 KB`。
- 仅为开发者上传验证，未提交审核、未发布，线上用户版本未切换；未执行预览。

### 2026-08-15 05:35 登记路由与云函数引用复核

- 当前 `app.json`/分包共登记 72 条小程序路由，扫描到 63 个静态云函数引用，正式路由和函数目录均无缺口。
- 唯一警告仍是旧 `miniprogram/pages/match/share/share.js` 的 `generatePDF`，不在 162 节点批准画板范围，保留为 legacy warning。

### 2026-08-15 05:29 裁判注册入口改为服务号承接

- `pages/guide/referee-info/referee-info` 已移除本地伪注册、延时假成功和 `refereeInfo` 本地存储，改为服务号 H5 承接页；页面提供入口复制和返回首页，不创建或覆盖裁判身份。
- `node --check`、页面 JSON 解析、WXML 简单表达式扫描与 `git diff --check` 通过；随后已上传开发者版本 `1.0.8`，仍未提交审核或发布。

- `tools/validate-ui-delivery.js` 已同时统计 `visual-capture-pending` 与 `visual-review-pending`；默认门禁如实输出视觉截图待执行 9，`--strict-visual` 对 9 个节点失败，避免误报为 0。
- 默认静态门禁仍通过（162/162、0 路由缺口、0 页面文件缺口）；本次只改质量报告，不改变业务代码或线上数据。

### 2026-08-15 05:08 线上回读：认领确认/审核删除竞态门禁

- `getMiniWorkspace` 的认领确认和冲突审核申请在预览后重读邀请与赛事时，新增邀请类型和赛事存在性校验；记录被删除或替换时直接阻断，不进入孤立关系或通用异常写入。
- CloudBase 线上回读：`getMiniWorkspace` Nodejs18.15，`modifyTime=2026-08-15 05:08:12`，状态 `Deployment completed`。
- `node --check`、`npm run build`、162/162 静态门禁通过；未读取或写入真实业务数据。视觉验收仍为 9 个节点，小程序 `1.0.7` 未提交审核/发布。

### 2026-08-15 05:00 线上回读：赛事截止回退与二次过期校验统一

- `getMiniWorkspace.prebuiltTeamInvite` 在邀请缺少 `inviteExpireAt/expiresAt` 时回退校验赛事 `registrationDeadline/signupDeadline/endDate`；认领确认和冲突审核申请在预览后重新读取邀请与赛事，再次执行同一有效期断言。
- CloudBase 线上回读：`getMiniWorkspace` Nodejs18.15，`modifyTime=2026-08-15 05:00:59`，状态 `Deployment completed`。
- `npm run build`、三个云函数 `node --check`、全量 UI 静态门禁（162/162）通过；未读取或写入真实邀请、赛事或审核数据。视觉验收仍保留 9 个节点，小程序 `1.0.7` 未提交审核/发布。

### 2026-08-15 04:56 线上回读：审核申请写入前二次过期校验

- `getMiniWorkspace` 的 `requestPrebuiltTeamClaimReview` 已在预览后重新读取邀请，并在写入审核申请前二次校验邀请有效期。
- CloudBase 线上回读：`getMiniWorkspace` Nodejs18.15，`modifyTime=2026-08-15 04:56:26`，状态 `Deployment completed`。
- 视觉验收仍保留 9 个节点；未提交、推送、发布或预览。
2026-08-15 04:52:29 邀请确认写入前二次过期校验补强并完成线上回读：`getMiniWorkspace` 在认领邀请与球队成员邀请确认动作重新读取记录后再次校验 `inviteExpireAt/expiresAt`，有效期边界竞态不会继续写入接受关系；返回 `TEAM_INVITE_EXPIRED` 或 `TEAM_MEMBER_INVITE_EXPIRED`。线上 `getMiniWorkspace` 为 `Nodejs18.15 / Deployment completed / ModTime 04:52:09`；未读取或写入真实邀请、球队成员或参赛关系。9 个视觉节点仍待验收；小程序 `1.0.7` 未提交审核/发布；未提交、未推送。
2026-08-15 04:49:52 认领邀请有效期边界补强并完成线上回读：`organizerClaimInvite` 生成端拒绝报名截止后新建认领邀请并过滤已过期 pending 邀请；`getMiniWorkspace.prebuiltTeamInvite` 预览和确认端统一校验 `inviteExpireAt/expiresAt`，过期邀请返回 `TEAM_INVITE_EXPIRED`，旧邀请缺字段时回退校验赛事报名截止/结束时间。两个函数线上读回 `Nodejs18.15 / Deployment completed`：`organizerClaimInvite` ModTime 04:48:21，`getMiniWorkspace` ModTime 04:49:02；未读取或写入真实赛事、球队或邀请数据。9 个视觉节点仍待验收；小程序 `1.0.7` 未提交审核/发布；未提交、未推送。
2026-08-15 04:41:30 家长实名退回重提边界补强并完成线上回读：`submitParentIdentityVerification` 在实名状态为 `rejected` 时，会比较当前仍处于 `uploaded` 的人像面文档与上次审核记录的 `documentIds`；若未重新上传就直接重提，返回 `PARENT_IDENTITY_REUPLOAD_REQUIRED`，只有新文档才会重新进入待审核，保持“退回后按原因重传”的已确认规则。`node --check`、`git diff --check` 通过；`webLoginApi` 线上读回 `Nodejs18.15 / Deployment completed / ModTime 2026-08-15 04:40:41`，无会话探针返回 HTTP 200 + `PARENT_AUTH_REQUIRED`，未读取或写入真实家长、证件或业务数据。9 个视觉节点继续待验收；小程序 `1.0.7` 未提交审核/发布；未提交、未推送。
2026-08-15 04:32:39 家长资料提交成功页头像预览已修正并完成线上回读：H5 确认裁切后分别展示 canvas 生成的头像与透明标准形象照，裁切缩放/位移在客户端和服务端均有界；`service-account-h5/` 4 个文件重新上传，公网 `app.js` 与本地 SHA-256 一致（`90FACCD4788BF99C48AD99B83B9B8154EB7248AB9DC435CD9859032B14AD01E1`），入口与 `index.html` HTTP 200。`node --check`、CSS 916/916、162/162 静态门禁通过；未使用真实家长会话或资料写入，节点仍待视觉验收；小程序 `1.0.7` 未提交审核/发布；未提交、未推送。

2026-08-15 04:29:28 家长标准头像派生闭环已落地并完成线上回读：H5 从受限透明预览生成 PNG 头像并提交 `avatarData` 与有界 `crop(scale/x/y)`；`webLoginApi.confirmParentPortrait` 校验会话、实名版本、人像版本和 2MB 上限后写入受限头像文件，保存 `avatarFileId/avatarCrop/avatarProcessingStatus`，资料提交记录同步关联头像文件。`webLoginApi` 线上读回 `Nodejs18.15 / Deployment completed / ModTime 2026-08-15 04:28:15`，无会话确认探针返回 `PARENT_AUTH_REQUIRED`；更新后的 H5 4 个文件上传 `/service-account-h5/`，`app.js` 公网与本地 SHA-256 一致（`A7A82D47949695EFD90EDE8870AEE3060E974DA363585F40BE446B67732C7EED`），入口 HTTP 200。未使用真实家长会话或资料写入，节点仍待视觉验收；小程序 `1.0.7` 未提交审核/发布；未提交、未推送。

2026-08-15 04:23:19 家长人像确认返回上下文已落地并完成线上回读：服务号 H5 在重新拍摄/返回取景框时保留当前球员与球队上下文；`node --check service-account-h5/app.js`、CSS 916/916 括号校验和 162/162 静态门禁通过，`/service-account-h5/` 上传 4 个文件，公网入口与 `index.html` HTTP 200，`app.js` 公网与本地 SHA-256 一致（`425EBF664FF2A4A03DD7724B0A80DA73C84BECBC0D8C2ADC805B4567B3E02AB8`）。未使用真实家长会话或资料写入，节点仍待视觉验收；小程序 `1.0.7` 未提交审核/发布；未提交、未推送。

2026-08-15 04:16:21 专业版认领邀请有效期回填已落地并完成线上回读：`TournamentTeams.vue` 以 `organizerClaimInvite` 的 `inviteExpireAt` 作为当前邀请有效期，路由切换、关闭和失败会清理旧值；PC 构建、162/162 静态门禁、`git diff --check` 通过，`/admin/` 上传 193 个文件，`TournamentTeams-DJ8Ukj-k.js` 公网与本地 SHA-256 一致（`7A717F2DA88C09EC2E90DE6C7058B44F2EEC491E9E12FF122A24CBD9590B9F32`）。未预览或写入真实认领数据，节点仍待视觉验收；小程序 `1.0.7` 未提交审核/发布；未提交、未推送。

2026-08-15 04:09:24 `webLoginApi` HTTP 请求体兼容解析补强并完成线上回读：线上 `Nodejs18.15 / Deployment completed / ModTime 2026-08-15 04:08:45`；无会话 `checkLogin` 返回 HTTP 200 + `AUTH_REQUIRED`，无效家长邀请返回 HTTP 200 + `PARENT_INVITE_INVALID`，未读取或写入真实业务数据。`node --check`、全量 UI 静态门禁通过（162/162、0 路由缺口、0 页面文件缺口）；9 个视觉节点继续待验收，小程序开发者版本 `1.0.7` 未提交审核/发布；未提交、未推送、未预览。

2026-08-15 02:40:27 `getMiniWorkspace` 线上依赖修正并完成无会话运行探针：重新启用云端依赖安装后函数读回 `Nodejs18.15 / Active / Available / ModTime 2026-08-15 02:40:27`，探针进入 `WORKSPACE_LOAD_FAILED` 鉴权分支，不再出现 `Cannot find module wx-server-sdk`；临时配置已清理，未写业务数据。小程序尚未上传发布，9 个视觉节点仍待验收；未提交、未推送。
2026-08-15 02:37:11 认领冲突人工审核链路补齐并上线：小程序冲突页提交调用 `getMiniWorkspace.requestPrebuiltTeamClaimReview`，服务端创建幂等 `team_claim_review_requests`，将邀请标记为 `review_required` 并保留球队长期资料不变；已处理邀请不能重复接收，不自动认领、不按名称合并。`getMiniWorkspace` 线上读回 `Nodejs18.15 / Active / Available / ModTime 2026-08-15 02:36:42`，无微信会话探针返回 `WORKSPACE_LOAD_FAILED`。小程序尚未上传发布，9 个视觉节点仍待验收；主办方审核工作台和证明材料上传尚未完成；未提交、未推送。
2026-08-15 02:26:10 比赛现场阵容锁定边界补强并上线：`serviceMatchWorkflow.saveRefereeRoster` 现在只允许在 `scheduled/pending/checked_in` 赛前状态保存裁判名单，双方阵容锁定后返回 `LINEUP_LOCKED`；`reviewLineup` 现在要求获授权裁判、赛前检查已完成且比赛仍处于赛前状态，已锁定或已进入赛中/赛后状态拒绝核验。`node --check` 通过，线上函数读回 `Nodejs16.13 / Active / Available / ModTime 2026-08-15 02:26:10`；未触碰真实比赛、阵容或裁判数据。小程序尚未上传发布，9 个视觉节点仍未完成；未提交、未推送。

2026-08-15 02:13:33 裁判服务号 H5 正式包补传并完成公网核对：`/referee/` 旧版 `app.js` 已替换为本地完整包，公网 115799 bytes 与本地 SHA-256 `E44C311A1F0E92B0113D6A9688A9D402A06C327C49427C8329DA5500AC9B318A` 一致；OAuth、裁判工作流、电子签字和退回修正代码均已在线。模板发送函数在线但尚无生产模板变量，缺少配置时只进入 `configuration_required`，不能宣称通知已发出。小程序尚未上传发布，9 个视觉节点仍待验收；未提交、未推送。

2026-08-15 02:09:54 PC 登录后的机构识别引导修正并上线：扫码回调清理上一个账号的机构缓存后统一进入 `/organization-onboarding`；主办方页面只信任当前 `userInfo.orgId`，旧 `currentOrganization` 不能绕过引导；引导明确区分“赛事主办方”和“青训机构”，青训未开通时不能直接创建。PC `/admin/` 已上传 191 个文件，公网相关 bundle 均 HTTP 200；未使用真实业务数据，小程序尚未上传发布，9 个视觉节点仍待验收；未提交、未推送。

2026-08-15 02:02:24 比赛现场写入边界再次收口并上线：网页统一入口 `webLoginApi.dbQuery` 对 `match_events`、`match_referees`、`squads` 的新增/修改/删除在会话与机构范围校验后统一返回 `REFEREE_WORKFLOW_REQUIRED`，PC `/referee/match/:id` 改为只读比赛和事件流水，旧 GPS 签到、开始/结束比赛按钮已移除，现场写入统一走已授权裁判服务号/H5。`webLoginApi` 线上读回 `Nodejs18.15 / Active / Available / ModTime 2026-08-15 01:59:45`；无会话写入探针返回 `AUTH_REQUIRED`，未触碰真实比赛数据。PC `/admin/` 已上传 191 个文件，小程序尚未上传发布，9 个视觉节点仍待验收；未提交、未推送。

2026-08-15 01:51:33 旧阵容适配器的读取边界再次收紧并上线：`updateMatchLineup` 不再自行读取比赛，只把 `matchId/lineupField/selectedPlayerIds` 交给 `serviceMatchWorkflow.submitLineupLegacy`，统一服务端先校验身份再解析场次球队；两个函数线上均为 `Active / Available / ModTime 2026-08-15 01:51:33`。旧签字写入口停用、签字状态只读、PC `/sign` 停用提示保持不变；未使用真实业务数据，小程序尚未上传发布，9 个视觉节点仍待验收；未提交、未推送。

2026-08-15 01:47:28 旧阵容/签字兼容入口已统一收口并上线：`updateMatchLineup` 仅适配到 `serviceMatchWorkflow.submitLineup`，旧图片签字与直接签字写入入口停用，`getSignatureStatus` 仅读不写；PC `/sign` 已提示从裁判服务号/H5进入，PC `/admin/` 191 个文件已重新上传并核对 `SignatureView` 公网字节一致。4 个函数线上均为 `Active / Available`；未使用真实球队、比赛或签字数据，小程序尚未上传发布，9 个视觉节点仍待验收；未提交、未推送。

2026-08-15 01:37:40 比赛执行阵容入口补齐并上线：正式小程序服务阵容页调用的 `serviceMatchWorkflow.getLineupTask` 与 `submitLineup` 已注册到云函数主入口；服务端校验裁判首发请求、当前场次球队、球队负责人认领、已审核赛事名单、首发人数和球员 ID。线上函数读回 `Active / Available / ModTime 2026-08-15 01:37:40`；未使用真实球队、名单或比赛数据，小程序尚未上传发布，9 个视觉节点仍待验收；未提交、未推送。

2026-08-15 01:26:54 简易版升级专业版链路已落地并上线：PC 模式对比入口调用 `upgradeDivisionToProfessional`，服务端在原竞赛组别上切换专业模式并初始化现有参赛球队正式名单待办，保留规则、参赛关系、抽签、赛程和裁判数据；已锁定竞赛方案或未生效专业版权益时拒绝升级，重复调用幂等。`webLoginApi` 线上读回 `Nodejs18.15 / Active / Available / ModTime 2026-08-15 01:26:54`；PC `/admin/` 静态包已上传并以公网字节 SHA-256 核对一致。未调用真实机构、赛事、权益或名单写入；小程序尚未上传发布，9 个视觉节点仍待验收；未提交、未推送。

更新时间：2026-08-13（Asia/Shanghai）  
正式仓库：`E:\Documents\sxf-football`  
原型画板：`E:\Documents\saixiaofeng_football\赛小蜂足球UI\赛小蜂足球UI\原型图2.0\全链路画板\2026-07-30-阶段版`

2026-08-15 01:13:36 通知中心正式链路补齐并上线：`getMiniWorkspace` 统一消息读取、未读/已读回执和消息深链，服务端新增登记页面路由白名单，历史非 `read` 回执可被正确更新，客户端跳转失败会提示刷新。线上函数读回 `Nodejs18.15 / Active / Available / ModTime 2026-08-15 01:13:36`；小程序尚未上传发布，9 个视觉节点仍待验收；未提交、未推送。

> 续接更新：本文件原列的小程序首页图标/缓存验收、PC U16 专业版步骤 5 晋级规则均已于 2026-08-13 完成；专业版步骤 6 规则定版及“规则定版－已生效”也已完成 1672 × 941 视觉、真实按钮衔接和构建验收。权威证据见 `docs/CURRENT_STATUS.md` 与 `tools/ui-delivery-inventory.js`。后续不要重做这些节点；继续时先按当前台账排除已验收页面，再选择下一批准节点。

2026-08-14 专业版认领弹层关系绑定修正：`TournamentTeams.vue` 在显式 `tournamentTeamId/teamId` 不存在或不匹配时不再回退到列表中的其他球队；路由切换会清空旧邀请，忽略迟到的旧请求响应，并在旧请求结束后重试新参赛关系，避免认领链接错配或丢失。`npm run build` 通过，`/admin/` 与 `TournamentTeams-pvYlQgRn.js` 均 HTTP 200，公网 chunk SHA-256 与本地一致（`929116A2B8D65E910E08A535EC6DA5FB34F741073562026DDEE5EC4D33F355F9`）。未做交互预览或真实认领写入，节点继续保持 `visual-review`；未提交、未推送。

2026-08-14 二维码环境参数修正：`generateMiniProgramCode`、`generateQRCode` 与遗留 `generateInviteCode` 现在只接受 `develop/trial/release`，未传或非法值统一默认生产 `release`；PC 赛事报名二维码不再隐式落到体验版。线上读回 `generateMiniProgramCode` `Nodejs16.13 / index.main / Deployment completed / ModTime 2026-08-14 22:16:58`、`generateQRCode` `Nodejs18.15 / index.main / Deployment completed / ModTime 2026-08-14 22:17:17`、`generateInviteCode` `Nodejs16.13 / index.main / Deployment completed / ModTime 2026-08-14 22:23:45`；前两者无会话 `webLoginApi.callFunction` 探针均返回 `HTTP 200 + AUTH_REQUIRED`，遗留函数不在 relay 白名单且无源码调用。未生成真实二维码、未写入业务数据、未预览、未提交、未推送；视觉待验收仍为 9 个。

2026-08-14 PC 统一入口租户边界修正：`webLoginApi` 已移除 `users._id` → `orgId` 的个人兜底，唯一有效机构才回写，多机构返回 `ORG_CONFLICT`，无机构写入返回 `ORG_REQUIRED`；机构引导入口保持可用。线上读回 `Nodejs18.15 / index.main / Active / Available / ModTime 2026-08-14 20:59:55`，无会话探针返回 `AUTH_REQUIRED`。本次不新增视觉节点，9 个视觉节点仍待任务允许预览后验收；未提交、未推送。

2026-08-14 小程序工作空间机构边界修正：`getMiniWorkspace` 不再用个人 `_id` 生成机构工作空间，pending 机构成员也不会进入机构权限目录；仅有效成员或机构实体明确 owner/creator 的关系可生成真实机构空间，无机构账号只保留明确球队关系的临时空间。线上读回 `Nodejs18.15 / index.main / Active / Available / ModTime 2026-08-14 21:08:01`，无微信会话返回 `WORKSPACE_LOAD_FAILED`。不新增视觉节点，9 个视觉节点仍待任务允许预览后验收；未提交、未推送。

2026-08-14 小程序登录与机构冲突衔接修正：`onboardingWorkspace.state` 只采信 `active/accepted/claimed` 机构/球队关系，并以真实机构成员或 owner/creator 关系校验；`getMiniWorkspace` 多机构返回 `ORG_CONFLICT`，不默认选第一家。登录端清理旧工作空间并提示人工核验，`login.js` 不再把个人 `_id` 写成本地 `orgId`，`workspace.js` 保留服务端错误 code。线上读回 `getMiniWorkspace` `Nodejs18.15 / index.main / Deployment completed / ModTime 2026-08-14 21:15:25`、`onboardingWorkspace` `Nodejs18.15 / index.main / Deployment completed / ModTime 2026-08-14 21:17:59`；无会话探针未产生业务写入。未新增视觉节点，9 个视觉节点仍待任务允许预览后验收；未提交、未推送。

2026-08-14 登录缓存边界补强：小程序首页遇到 `ORG_CONFLICT` 会先清理旧工作空间缓存再展示核验提示，不继续沿用上一次机构数据；不新增视觉节点，未提交、未推送。

2026-08-14 家长 H5 完成提交关系校验补强：`webLoginApi.completeParentProfile` 写入球员长期资料前二次确认 active 邀请仍指向同一球员与球队；关系变化返回 `PARENT_INVITE_BROKEN` 且不写入。线上读回 `Nodejs18.15 / index.main / Deployment completed / ModTime 2026-08-14 21:26:40`，无会话探针返回 `PARENT_AUTH_REQUIRED`；8 个家长 H5 节点仍待视觉复核；未使用真实会话或业务写入，未提交、未推送。

2026-08-14 竞赛组别正式定版边界补齐：`webLoginApi` 已将 `divisions` 纳入机构范围 relay，并新增 `confirmDivisionRules` 服务端定版动作；浏览器不能直接写入 `rulesLocked`、`ruleFinalized`、`rulesVersion` 等锁定字段。专业模式只有显式有效权益状态才允许定版，未写死价格、支付渠道或试用规则。线上函数读回 `Nodejs18.15 / index.main / Active / Available / ModTime 2026-08-14 23:50:09`；无会话 `divisions.list` 与 `confirmDivisionRules` 探针均返回 HTTP 200 + `AUTH_REQUIRED`。PC `npm run build` 通过，`cloud-Ddg09aof.js` 与 `DivisionRulesWizard-BgzBTgRq.js` 公网字节分别与本地 SHA-256 一致（`1B5D1F81617295F0692FA65079F381A735B94215A61BFC477EF93EA169FE57F0`、`2968FE99D145FD6AA52EE5A76006F9B73EBDCC24F997508B797A0671DC565912`），`/admin/` HTTP 200。未使用真实机构、赛事或支付数据；9 个视觉节点继续保持 `visual-review`。

2026-08-15 最终竞赛方案确认链路已补齐并上线：`webLoginApi` 新增 `confirmCompetitionPlan`，服务端校验竞赛组别规则已定版、已确认参赛球队、抽签/分组完整、赛程时间场地完整且无冲突后，保存规则/参赛关系/抽签/赛程紧凑快照，锁定方案并返回正式比赛管理路由；锁定后的通用赛程、抽签和参赛关系写入口拒绝直接修改。PC `TournamentConsole.vue` 增加“确认方案”入口，比赛管理快捷入口改到 `/tournaments/:id/matches`。线上 `webLoginApi` 读回 `Nodejs18.15 / Active / Available / ModTime 2026-08-15 00:06:33`；无会话探针返回 `HTTP 200 + AUTH_REQUIRED`。`npm run build` 通过；`cloud-ZSnvx-n_.js` 与 `TournamentConsole-CZSw21u3.js` 公网字节分别与本地 SHA-256 一致（`D50B0DA23F80A5CE6A0F404E6BE9F250A6A080454EE0AFFD27880FABD23BA10D`、`BD446109219E8C89797890CE2F4A7FAF08A975F4A645E5B43735B3EE86B4E0E6`）；`/admin/` HTTP 200。未使用真实机构、赛事或支付数据，9 个视觉节点继续保持 `visual-review`；本轮未提交、未推送、未预览。

2026-08-15 方案锁定后的直接赛程写入口补齐并上线：`generateSchedule` 在服务端读取当前赛事/竞赛组别锁定状态，锁定后返回 `COMPETITION_PLAN_LOCKED`，不再删除重建已确认组别赛程；`updateMatch` 同步执行真实机构校验，锁定后只允许受控裁判指派，比分、状态、时间、场地和对阵字段被拒绝，裁判组仍通过已审核本机构裁判校验。两个函数不再以 `users._id` 作为机构兜底。线上读回 `generateSchedule` `Nodejs16.13 / Active / Available / ModTime 2026-08-15 00:20:11`、`updateMatch` `Nodejs16.13 / Active / Available / ModTime 2026-08-15 00:20:45`；未使用真实机构、赛事或比赛写入，9 个视觉节点继续保持 `visual-review`；本轮未提交、未推送、未预览。

2026-08-15 历史机构兜底入口清理并上线：`checkUserByOpenId`、`profileContentSecurity`、`manageTournamentCenterContent` 与 `backfillOrganizerOrgId` 不再把自然人 `users._id` 当作机构 `orgId`；无机构时返回空机构状态或 `user_missing_org`，保留真实 `orgId/organizationId`，不自动创建或回写个人 ID。四个函数线上读回 Active / Available：`checkUserByOpenId` `Nodejs16.13 / ModTime 2026-08-15 00:26:30`、`profileContentSecurity` `Nodejs18.15 / ModTime 2026-08-15 00:26:58`、`manageTournamentCenterContent` `Nodejs18.15 / ModTime 2026-08-15 00:27:14`、`backfillOrganizerOrgId` `Nodejs18.15 / ModTime 2026-08-15 00:28:00`；未调用真实账号、机构或迁移数据，9 个视觉节点继续保持 `visual-review`；本轮未提交、未推送、未预览。

2026-08-15 01:06:11 裁判服务号通知发送函数同步上线：`sendRefereeTemplateMessages` 已将当前源码部署到线上，继续使用 `referee_notifications` 队列，发送前检查配置/状态，成功、失败和缺少配置均回写队列状态；未调用发送动作、未触碰真实通知队列。线上读回 `Nodejs16.13 / Active / Available / ModTime 2026-08-15 01:06:11`；H5 工作流仍由 `webLoginApi.serviceRefereeWorkflow` 统一会话中转，9 个视觉节点继续保持 `visual-review`；本轮未提交、未推送、未预览。

2026-08-15 01:03:20 比赛执行快照边界补齐并上线：`updateMatch` 在方案锁定后的首次受控裁判指派时固化 `matchId/tournamentId/divisionId/organizationId/planVersion/对阵/场地/时间` 快照；`serviceMatchWorkflow.startRefereeMatch` 在缺少快照时补固化同一结构。快照存在后，直接更新入口拒绝修改对阵、场地、时间、赛制、状态和比分，现场事件、裁判指派和签字仍走各自受控流程。两个函数线上读回 `Nodejs16.13 / Active / Available`：`updateMatch` `ModTime 2026-08-15 01:02:51`、`serviceMatchWorkflow` `ModTime 2026-08-15 01:03:20`；无会话 `updateMatch` 探针返回 HTTP 200 + `AUTH_REQUIRED`，未触碰真实比赛数据，9 个视觉节点继续保持 `visual-review`；本轮未提交、未推送、未预览。

2026-08-15 00:58:11 旧球队查询入口收口并上线：`getMyTeams` 不再使用客户端传入的手机号、微信标识或用户 ID，改用网页可信会话账号，并仅返回真实 `orgId` 属于当前机构的球队；无有效机构或机构实体时返回 `ORG_REQUIRED`。两个函数线上读回 Active / Available：`getMyTeams` `Nodejs16.13 / ModTime 2026-08-15 00:57:38`、`webLoginApi` `Nodejs18.15 / ModTime 2026-08-15 00:58:11`；无会话探针返回 HTTP 200 + `AUTH_REQUIRED`，未触碰真实球队数据，9 个视觉节点继续保持 `visual-review`；本轮未提交、未推送、未预览。

2026-08-15 00:54:08 外部报名入口收口并上线：`applyTournament` 现在要求可信网页账号与有效机构上下文，并校验提交球队真实 `orgId` 属于当前机构；赛事仍可跨机构接受公开报名，未改变赛事主办方边界。`webLoginApi` 将该入口纳入机构必需 relay。两个函数线上读回 Active / Available：`applyTournament` `Nodejs16.13 / ModTime 2026-08-15 00:53:24`、`webLoginApi` `Nodejs18.15 / ModTime 2026-08-15 00:54:08`；无会话探针返回 HTTP 200 + `AUTH_REQUIRED`，未触碰真实报名或球队数据，9 个视觉节点继续保持 `visual-review`；本轮未提交、未推送、未预览。

2026-08-15 00:50:21 赛事球队审核入口收口并上线：`tournamentReview` 的提交、查询、批准和拒绝动作现在都绑定可信网页账号与真实机构；赛事和球队必须属于当前机构，审核人和教练手机号不再接受客户端自报。`webLoginApi` 将其纳入机构必需 relay。两个函数线上读回 `Nodejs18.15 / Active / Available`：`tournamentReview` `ModTime 2026-08-15 00:49:34`、`webLoginApi` `ModTime 2026-08-15 00:50:21`；无会话探针返回 HTTP 200 + `AUTH_REQUIRED`，未触碰真实审核或参赛数据，9 个视觉节点继续保持 `visual-review`；本轮未提交、未推送、未预览。

2026-08-15 00:45:16 高风险批量删除入口收口并上线：`clearTeamPlayers` 不再接受匿名或客户端自报的球队身份，必须通过网页会话传入可信账号/机构上下文，并校验球队真实 `orgId` 与当前机构一致后才允许删除球员；`webLoginApi` 同步把该入口纳入会话和机构必需集合。两个函数线上读回 `Nodejs18.15 / Active / Available`：`clearTeamPlayers` `ModTime 2026-08-15 00:44:44`、`webLoginApi` `ModTime 2026-08-15 00:45:16`；无会话探针返回 HTTP 200 + `AUTH_REQUIRED`，未触碰真实球队或球员数据，9 个视觉节点继续保持 `visual-review`；本轮未提交、未推送、未预览。

2026-08-15 00:39:08 通用 `dbQuery` 锁定检查补强并上线：删除分支现在先读取待删记录，避免未定义记录绕过方案校验；缺少 `divisionId` 的旧参赛关系会继续按赛事及嵌套竞赛组别快照检查，锁定状态读取失败时拒绝写入。`webLoginApi` 线上读回 `Nodejs18.15 / Active / Available / ModTime 2026-08-15 00:39:08`；无会话删除探针返回 HTTP 200 + `AUTH_REQUIRED`，未触碰真实数据，9 个视觉节点继续保持 `visual-review`；本轮未提交、未推送、未预览。

2026-08-15 参赛关系直接写入口补齐方案锁定保护并上线：`applyTournament`、`clearTournamentTeams` 与 `organizerClaimInvite` 在服务端读取赛事及竞赛组别锁定状态，锁定后分别拒绝新增/重建报名、清空参赛关系和生成认领邀请，返回 `COMPETITION_PLAN_LOCKED`；未锁定流程保持不变。三个函数线上读回 Active / Available：`applyTournament` `Nodejs16.13 / ModTime 2026-08-15 00:33:54`、`clearTournamentTeams` `Nodejs18.15 / ModTime 2026-08-15 00:34:07`、`organizerClaimInvite` `Nodejs18.15 / ModTime 2026-08-15 00:34:54`；未调用真实机构、赛事或球队数据，9 个视觉节点继续保持 `visual-review`；本轮未提交、未推送、未预览。

## 任务边界

- 继续完成全链路原型落地，当前优先 PC，随后小程序、服务号 H5 与跨端页。
- 必须按 `$yuanxing` 流程执行：approved assets → 正式代码 → 目标视口截图 → visual-1:1 / button-destination / flow-transition / build-verification。
- 任何页面完成后都要对照批准原型再进入下一页。
- 禁止提交、推送、预览、发布；本轮用户已明确允许功能确需线上验证时上传/部署，但每次部署必须读回生产状态或公网结果，且不得把本地 QA fixture 写入云端数据。
- 小程序自定义胶囊区域必须留出安全间距；WXML 只能使用简单插值、取反和 `||`。

## 已完成且不要重做

### PC 端

以下 U16 专业版竞赛管理页面已经在正式 `DivisionRulesWizard.vue` 中完成结构修复并有目标视口证据，不要回退或重做：

| 页面 | 截图证据 | 状态 |
|---|---|---|
| 步骤 1 赛制结构 | `.tmp/pc-visual-qa/division-rules-u16-format-overlay-v1.png` | visual 已验收；下拉选中值可见；下一步进入 `step=eligibility` |
| 步骤 2 参赛资格 | `.tmp/pc-visual-qa/division-rules-u16-eligibility-v2.png` | visual 已验收；下一步进入 `step=execution` |
| 步骤 3 比赛执行 | `.tmp/pc-visual-qa/division-rules-u16-execution-v3.png` | visual 已验收；下一步进入 `step=ranking` |
| 步骤 4 积分排名 | `.tmp/pc-visual-qa/division-rules-u16-ranking-v3.png` | visual 已验收；下一步进入 `step=advancement` |

`web-admin-vue` 的 `npm run build` 在上述 PC 修改后已通过。相应证据已写入 `docs/CURRENT_STATUS.md` 与 `tools/ui-delivery-inventory.js`。

已完成的其他 PC 页面包括赛程总览、赛事空间、创建赛事、赛事控制台、组别管理、裁判管理/裁判分配、比赛管理 U8/U16、U16 归档详情等；先读当前台账，不要重复实现。

## 当前未完成主线

### PC U16 专业版步骤 5：晋级规则

- 正式文件：`web-admin-vue/src/views/tournament/DivisionRulesWizard.vue`
- 批准原型：`02-U16组-专业版/竞赛管理-U16组-专业版-步骤5-晋级规则.png`
- approved assets：同名 `_assets` 目录，manifest 状态为 `approved`，画板 1671 × 941。
- 当前代码已重建：晋级名额、二次抽签、退赛与空位处理、右侧 8 队晋级路径预览、摘要区。
- 尚未完成：目标视口截图复核、按钮进入 `step=finalize` 的真实点击验证、台账登记、最终 build 回归。
- 之前的临时图：`.tmp/pc-visual-qa/division-rules-u16-advancement-v1.png` 只是旧稀疏版本，不能作为通过证据。

### 小程序首页：最近发现的视觉错位与图标来源混用

用户截图显示首页曾出现两种问题：

1. 一次渲染中，oil-icon 大 PNG 被当作小图标直接排版，导致盾牌、哨子、头像放大并挤乱页面。
2. 另一次渲染中，主体已经正常，但底部五中心仍显示旧的 `football-brand-v1` 图标，用户认为页面回退到旧图标。

批准球队协作首页原型：

`03-机构协作-小程序/02-首页/确认稿/02-首页-球队协作场景.png`（780 × 1688）  
approved assets：同名 `_assets` 目录，manifest 状态 `approved`。

已完成的修复（当前工作区中）：

- `miniprogram/pages/home/home.js`
2026-08-15 07:57 OFFICIAL_ROSTER_RUNTIME_FIX: removed the stale undefined invite expiry reference from getMiniWorkspace.officialRosterForWorkspace; both officialRoster and submitOfficialRoster now require an approved/confirmed/claimed/accepted tournament_teams relation; official-roster, profile-exception, and profile-progress back fallbacks capture teamId before navigateBack. Formal-roster permission and snapshot boundaries remain. node --check, 162/162 static gate, and git diff --check passed. getMiniWorkspace deployed via COS and read back Nodejs18.15 / Deployment completed / modifyTime 2026-08-15 07:57:51. No preview or real roster data access/write.
  - 首页待办卡由生成 PNG 改用共享 SVG：`shield.svg`、`event.svg`、`warning.svg`。
  - 不再把 `brand-spot/football-brand-v1/tab-*.png` 用作密集任务控件。
- `miniprogram/custom-tab-bar/index.js`
  - 五中心改为共享 SVG 映射：`tab-home/event/team/training/me.svg` 及各自 active 变体。
  - active/inactive 切换同步替换 `icon`，不再依赖旧 `iconText` 或旧角色 tab 表。
- `miniprogram/custom-tab-bar/index.wxml` / `index.wxss`
  - 使用有界 `<image>` 图标和当前五中心布局；图标尺寸为 48rpx。
- `miniprogram/images/icons/manifest.json`
  - `tab-*` 语义已改为共享 SVG，并记录 `active_file`；不能再把旧 PNG 当底部导航源。
- `miniprogram/pages/home/home.wxss`
  - 已收敛为可控的首页布局样式，给背景、队徽、指标、任务图标和比赛队徽明确尺寸/`object-fit`，避免原始 PNG 尺寸泄漏到布局。

## 小程序验证现状

已通过：

- `node --check miniprogram/pages/home/home.js`
- `node --check miniprogram/custom-tab-bar/index.js`
- `miniprogram/images/icons/manifest.json` JSON 解析
- 首页和自定义 tab 的 WXML 简单表达式扫描
- `home.wxss` 花括号配对检查

尚未通过：

- 本轮修改后的首页目标视口截图尚未成功回读。
- `tools/capture-mini-visual-qa.ps1` 依赖本机 `http://127.0.0.1:12930/mcp`；当前端口未监听，脚本会报 `Unable to connect to the remote server`。不能把桌面截图当作 visual-1:1 证据。

开发者工具截图若仍显示旧底部图标，先在当前项目执行一次“重新编译/刷新”，必要时清理项目缓存后重新打开首页；确认运行时加载的是当前工作区 `custom-tab-bar/index.js`，而不是旧编译缓存。只有重新编译后仍旧显示旧图标，才继续查 tab-bar 缓存或重复组件来源。

## 关键验证命令

```powershell
cd E:\Documents\sxf-football
node --check miniprogram\pages\home\home.js
node --check miniprogram\custom-tab-bar\index.js
node tools\validate-ui-delivery.js

powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\capture-mini-visual-qa.ps1 `
  -Page pages/home/home `
  -Query 'visualQa=1&scenario=team-coach' `
  -OutputPath .tmp/mini-visual-qa/home-team-coach-after-icon-fix.png `
  -ExpectedWidth 780 -ExpectedHeight 1688 -RequireTargetViewport

cd web-admin-vue
npm run build
```

目标小程序设备是 iPhone 13 Pro，100%，逻辑视口 390 × 844；批准原型对应 780 × 1688 @2x。截图必须检查：顶部胶囊无遮挡、首页主体不横向溢出、任务图标和队徽不放大、底部五中心图标全部来自当前共享映射。

## 下一步严格顺序

1. 在微信开发者工具重新编译当前工作区，确认首页底部五中心是否仍显示旧图标；若仍旧，搜索运行时实际加载的 tab-bar bundle 与重复 tab-bar 组件。
2. 恢复本机 Developer Tools MCP 服务后，执行首页目标视口截图并查看图片；未得到截图前不要把首页写成 visual-1:1 通过。
3. 对照批准球队协作首页原图逐项检查布局和图标；通过后再把 mini 首页证据写入 `docs/CURRENT_STATUS.md` 与 `tools/ui-delivery-inventory.js`。
4. 回到 PC U16 专业版步骤 5：捕获并查看晋你在操纵小程序截图的时候不是可以在后台操作吗？不用把微信工具放到页面最前面操控，鼠标应该不需要吧。级规则页面，测试保存按钮到 `step=finalize`，再执行 `web-admin-vue npm run build`。
5. 只有视觉、按钮去向、链路衔接和构建都通过，才更新对应台账；全程不提交、不推送、不部署。

## 新会话开场可直接粘贴

> 继续 `E:\Documents\sxf-football` 的赛小蜂足球原型落地。先读 `AGENTS.md`、`docs/CURRENT_STATUS.md`、`docs/UI_DELIVERY.md`、`tools/ui-delivery-inventory.js` 和当前 git 工作区，不重做已验收页面。必须使用 `$yuanxing` 流程。当前先修复小程序首页图标来源/开发者工具缓存问题：`home.js` 待办图标已切到 `shield.svg/event.svg/warning.svg`，底部五中心已切到 `tab-*.svg`，manifest 已同步，首页 wxss 已收敛；先在微信开发者工具重新编译并取得 iPhone 13 Pro 100% 的目标视口截图。截图验证通过后再回到 PC U16 专业版步骤 5 晋级规则，完成截图、button-destination、flow-transition、build-verification。禁止提交、推送、部署、发布；不要询问，直接实施并更新台账。

## 2026-08-13 续接增量（以本节覆盖上方旧待办）

- 小程序首页图标与开发者工具缓存问题已经通过本地 MCP 后台重新编译和 iPhone 13 Pro 100% 截图验收，证据为 `.tmp/mini-visual-qa/home-team-coach-after-icon-fix-iphone13pro-100.png`；不要重做。
- PC U16 专业版步骤 5、步骤 6 和规则已生效均已完成 1672 × 941 截图、真实按钮去向、链路和构建验收；权威证据见 `docs/CURRENT_STATUS.md`；不要重做。
- PC“球队管理-参赛球队-简易版”已完成正式页收敛。最终截图为 `.tmp/pc-visual-qa/tournament-teams-simple-final.png`；真实点击“查看球队”到达 `/teams/qa-team-1?fromTournament=qa-tournament-2026&divisionId=qa-division-u8`，目标证据为 `.tmp/pc-visual-qa/tournament-teams-simple-view-team-destination.png`。
- `web-admin-vue npm run build` 和 `node tools/validate-ui-delivery.js` 已通过；台账为 162/162。没有提交、推送、部署、预览或发布。
- 下一候选节点按台账顺序是“球队管理-查看球队-简易版.png”。继续前必须重新读取它的 approved `_assets` 包，并先检查当前台账证据，避免重做已验收内容。
- “球队管理-查看球队-简易版.png”也已完成最终验收：`.tmp/pc-visual-qa/tournament-team-detail-simple-final.png`。赛程赛果与返回参赛球队两个真实点击均保留 `qa-tournament-2026 / qa-division-u8`；不要重做。
- 下一候选节点改为“球队管理-加入申请-简易版.png”，正式入口 `/tournaments/:id/teams?divisionId=:divisionId&tab=pending`；继续前读取同名 approved `_assets` 包和当前台账证据。
- “球队管理-加入申请-简易版.png”已完成最终验收：`.tmp/pc-visual-qa/tournament-teams-simple-pending-final-v2.png`。双队列、2/3/5/1 统计、查看球队去向和批量通过风险保护均已验证；不要重做。
- 下一候选节点改为“球队管理-球队变更-简易版.png”，正式入口 `/tournaments/:id/teams?divisionId=:divisionId&tab=cancel_requested`。
- “球队管理-球队变更-简易版.png”已完成最终验收：`.tmp/pc-visual-qa/tournament-teams-simple-change-final-v2.png`。默认历史工作区及同意/驳回两条待处理链路均已验证；动作只影响 `qa-tournament-2026 / qa-division-u8 / qa-team-6` 当前报名关系，自然人账号、长期球队档案和历史快照均受保护；不要重做。
- 下一候选节点改为“抽签与分组-模式选择.png”，正式入口 `/tournaments/:id/draw?divisionId=:divisionId`；继续前必须读取同名 approved `_assets` 包并检查现有截图/台账，避免重做已验收内容。
- “抽签与分组-模式选择.png”已完成最终验收：`.tmp/pc-visual-qa/draw-mode-overview-final-v1.png`。U8 快速分组、U12 专业抽签 setup 和退出赛事空间三个真实去向均已验证，专业链路未绕过资格/球队池/大屏步骤；不要重做。
- 下一候选节点改为“抽签与分组-快速模式-分组设置.png”，正式入口 `/tournaments/:id/draw?divisionId=:divisionId&mode=quick&view=config`；继续前读取同名 approved `_assets` 包并检查现有截图/台账。
- “抽签与分组-快速模式-分组设置.png”已完成最终验收：`.tmp/pc-visual-qa/draw-quick-config-final-v2.png`。完整设置/预览/校验结构、恢复默认无云写，以及携带 U8、4×4 和两项规则进入操作台均已验证；不要重做。
- 下一候选节点改为“抽签与分组-快速模式-分组操作台.png”，正式入口 `/tournaments/:id/draw?divisionId=:divisionId&mode=quick&view=console`；继续前读取同名 approved `_assets` 包并按赛制核对当前组件分支。
- “抽签与分组-快速模式-分组操作台.png”已完成最终验收：`.tmp/pc-visual-qa/draw-quick-console-final-v2.png`。按当前规则使用简易 U10 验证 32队/8组工作台；手动入位、清空、随机、保存草稿、完成态确认作用域和分组结果去向均已通过，归档及其他赛制记录受保护；不要重做。
- 下一候选节点按台账顺序是“抽签与分组-快速模式-分组操作台-联赛制.png”，正式入口 `/tournaments/:id/draw?divisionId=:divisionId&mode=quick&view=console&format=league`；继续前读取同名 approved `_assets` 包并核对 `QuickHybridConsole.vue` 当前实现。
- “抽签与分组-快速模式-分组操作台-联赛制.png”已完成最终验收：`.tmp/pc-visual-qa/draw-quick-console-league-final-v5.png`。当前简易 U14 的 12 队单循环正确生成 11 轮/66 场预览；清空态即时重绘，确认只生成 `type=league/status=draft` 的当前组别草稿，已发布、进行中、已完赛、归档和其他组别赛程均受保护；不要重做。
- 下一候选节点按台账顺序为“抽签与分组-快速模式-分组操作台-淘汰赛.png”，正式入口 `/tournaments/:id/draw?divisionId=:divisionId&mode=quick&view=console&format=cup`。继续前重新读取同名 approved `_assets` 包，并复核 `QuickHybridConsole.vue` 的淘汰赛分支，不能沿用本次联赛轮次语义。
- “抽签与分组-快速模式-分组操作台-淘汰赛.png”已完成最终验收：`.tmp/pc-visual-qa/draw-quick-console-cup-final-v3.png`。当前简易 U10 的 8 支球队、16 签位、左右晋级树与中央决赛均完整；清空、随机、确认草稿和结果页去向已验证，已发布/已完赛/归档/其他组别/其他赛制记录受保护；不要重做。
- 下一候选节点按台账顺序为“抽签与分组-快速模式-分组操作台-混合制.png”，正式入口 `/tournaments/:id/draw?divisionId=:divisionId&mode=quick&view=console&format=hybrid`。继续前重新读取同名 approved `_assets` 包并核对联赛阶段与淘汰赛晋级签位的组合语义。
- “抽签与分组-快速模式-分组操作台-混合制.png”已完成最终验收：`.tmp/pc-visual-qa/draw-quick-console-hybrid-final-v3.png`。当前简易 U14 的 12 队联赛阶段、前 8 晋级及 1/8、4/5、2/7、3/6 种子位已完成；2/4/8 名额切换、清空、随机、确认双草稿和结果页去向均已验证，历史及跨组/跨赛制数据受保护；不要重做。
- 下一候选节点按台账顺序为“抽签与分组-快速模式-分组结果-未确认.png”，正式入口 `/tournaments/:id/draw?divisionId=:divisionId&mode=quick&view=result`。继续前重新读取同名 approved `_assets` 包，并核对 `QuickDrawResult.vue` 的赛制分支、未确认状态与发布边界。
- “抽签与分组-快速模式-分组结果.png”已完成最终验收：`.tmp/pc-visual-qa/draw-quick-result-unconfirmed-final-v4.png`。当前简易 U10 的 32 队、8 组、待确认状态、导出和固定确认栏均完整；空结果不会伪造成正式结果，归档快照只读。确认只锁定当前 U10/tournament 的 8 条分组草稿，不发布赛程、不删除记录、不影响其他组别/赛制，随后进入当前组别赛程编排编辑页；不要重做。
- “抽签与分组-专业模式-抽签设置.png”已完成最终验收：`.tmp/pc-visual-qa/professional-draw-setup-final-v3.png`。五步锁定进度、三种方式、32队/8组/每组4队/8种子及规则/展示/风险/底部保存均完整入屏；两个球队池入口统一先保存当前 U16 专业草稿。零球队、容量不足、种子超限或无权限时禁用，已有确认/发布结果必须确认影响范围；实点进入当前 U16 `step=pool`，不写云端、不影响历史或其他组别；不要重做。
- 下一候选节点按台账顺序为“抽签与分组-专业模式-球队池.png”，正式入口 `/tournaments/:id/draw?mode=professional&step=pool&divisionId=:divisionId`；继续前重新读取同名 approved `_assets` 包，并核对球队准入、种子上限、规避关系、校验与进入大屏设置边界。
- “抽签与分组-专业模式-球队池.png”已完成最终验收：`.tmp/pc-visual-qa/professional-draw-pool-final-v5.png`。当前 U16 的 32支准入、8种子、24普通、6同地区、2同机构、0冲突，8行×4页表格和种子/关系操作、侧栏五项校验及底部主按钮完整；实点只保存当前 U16 的种子和规避关系并进入 `step=screen`，不改长期球队资料、不影响其他组别、不发布；不要重做。
- 下一候选节点按台账顺序为“抽签与分组-专业模式-大屏设置.png”，正式入口 `/tournaments/:id/draw?mode=professional&step=screen&divisionId=:divisionId`；继续前重新读取同名 approved `_assets` 包，并核对预览内容、主题/布局、声音与屏幕连接、保存进入抽签操作台的边界。

## 2026-08-14 续接覆盖（以当前台账为准）

本文件前文的“当前未完成主线”“下一步严格顺序”和旧候选列表属于历史交接记录，已被 `docs/CURRENT_STATUS.md`、`docs/UI_DELIVERY.md` 与 `tools/ui-delivery-inventory.js` 的最新记录覆盖。当前正式台账复核结果为：162/162 节点已登记、162/162 素材包为 `approved`、162/162 正式路由具备目标文件；小程序 72 条已登记路由无缺失，页面 `.js/.wxml` 文件缺口为 0。

当前唯一未完成类别是视觉复核，精确为 9 个节点：专业版“分享球队认领邀请”1 个，以及家长服务号 H5 1/5–5/5 共 8 个。由于当前任务明确禁止预览，不得生成目标/回退截图，也不得把这些节点标为 `visual-1:1` 或 `accepted`。这些节点的正式代码、行为边界、鉴权和线上静态/函数验证可以继续推进，但不能伪造视觉验收证据。

2026-08-14 已完成的后续行为修正包括：PC 认领邀请使用真实 `team_invitations._id`，`organizerClaimInvite` 复用邀请时增加当前机构边界并已线上读回；球队成员邀请、球员编辑和小程序深链已收敛到已登记页面；UI 交付门禁已固化小程序路由和页面文件审计。继续工作时先排除以上已完成行为和全部 `visual-review` 节点，只有发现新的正式行为缺口才实施，不按本文件旧候选顺序重做页面。
认领邀请小程序码环境已收敛为 `develop/trial/release` 白名单，未传或非法值默认生产 `release`；交付门禁另有 1 条明确 legacy warning：旧 `miniprogram/pages/match/share/share.js` 引用尚不存在的 `generatePDF`，该页面不在当前批准画板，不作为 162 节点完成条件，也不得因此重做正式原型页面。

2026-08-14 PC 机构识别行为补齐：`onboardingWorkspace.state` 不再只依赖 `users.orgId`，会从机构成员关系、球队成员关联球队和本人赛事关系识别唯一机构；多个机构不自动选第一条，进入人工核验。`OrganizationOnboarding.vue` 同时兼容 `id/_id` 返回值。云函数读回 `Nodejs18.15 / Active / ModTime 2026-08-14 20:45:41`，`/admin/` 机构引导 chunk 公网 HTTP 200 且与本地 SHA-256 一致；无会话探针为 `AUTH_REQUIRED`。这是既有机构引导的行为修正，不新增视觉节点；未使用真实机构会话、未预览、未提交、未推送。
2026-08-14 网页通用 `dbQuery` 租户边界补强：球队、赛事、裁判和长期球员库不再用 `creatorId/ownerId` 替代当前机构；球员、教练、比赛等派生数据只通过当前机构球队或明确赛事/比赛授权关系访问。`orgId`、`organizationId`、`organization_id` 兼容读取，字段冲突时拒绝访问；`webLoginApi` 已更新并线上读回 `Nodejs18.15 / modifyTime 2026-08-14 21:36:54 / Deployment completed`，无会话 `dbQuery` 探针为 `AUTH_REQUIRED`。本轮未新增原型节点，162/162 素材包与 9 个视觉待验收节点状态不变。
2026-08-14 网页图片上传入口安全边界补齐：`webLoginApi.uploadImage` 与 `uploadToCosDirect` 现在要求有效网页 `authToken`，并限制目录/文件名格式及单文件 8MB 上限；线上函数读回 `Nodejs18.15 / modifyTime 2026-08-14 21:45:24 / Deployment completed`，无会话两个上传探针均返回 `AUTH_REQUIRED`，临时探针对象已删除并读回不存在。本轮未新增原型节点，162/162 素材包与 9 个视觉待验收节点状态不变。
2026-08-14 旧赛事中心 relay 收口：`getTeams/getPlayers/getTournaments` 读取统一转入受保护 `dbQuery`，球队/球员增删改和强制删除球队统一校验当前机构；9 个遗留函数的无会话 `callFunction` 探针均返回 `AUTH_REQUIRED`。线上 `webLoginApi` 读回 `Nodejs18.15 / modifyTime 2026-08-14 21:52:10 / Deployment completed`，本轮未新增原型节点，视觉待验收仍为 9 个。
2026-08-14 通用函数中转权限收口：`generatePlayerCard`、`generateQRCode`、`removeImageBg`、`baiduRemoveBg` 现在统一要求有效网页会话；4 个无会话 `callFunction` 探针均返回 `AUTH_REQUIRED`。线上 `webLoginApi` 读回 `Nodejs18.15 / modifyTime 2026-08-14 21:58:11 / Deployment completed`，本轮未新增原型节点，视觉待验收仍为 9 个。
2026-08-14 网页端高风险 relay 统一收口：规程 AI 解析、裁判签名、比赛阵容、赛事报名/审核和“我的球队”等 9 个入口现在统一要求有效网页会话；`parseTournamentRegulations` 已从独立函数地址切回 `webLoginApi` relay。9 个无会话探针均返回 `AUTH_REQUIRED`；线上 `webLoginApi` 读回 `Nodejs18.15 / modifyTime 2026-08-14 22:06:09 / Deployment completed`，`/admin/` 静态包 191 个文件上传成功并以 HTTP 200 读回。未新增原型节点，视觉待验收仍为 9 个。
2026-08-14 正式域名线上读回：`https://saixiaofeng.com/`、`/admin/` 以及本轮更新的 cloud relay chunk 均返回 `HTTP 200`；只做 HTTP 状态和静态内容核对，未打开交互预览或生成截图。
2026-08-14 公开轮播读取运行时修正：`getBanners` 使用 `DYNAMIC_CURRENT_ENV` 初始化，保留 inactive 过滤和图片字段兼容；线上读回 `Nodejs16.13 / modifyTime 2026-08-14 22:12:46 / Deployment completed`，无会话 relay 返回 2 条启用数据。未新增原型节点，视觉待验收仍为 9 个。
2026-08-14 机构引导能力复用修正：`OrganizationOnboarding.vue` 增加赛事/青训提交锁；已有唯一机构且当前账号具备对应权限时，赛事创建复用原机构并补齐 `event` 能力，青训开通复用原机构并补齐 `education` 能力与订阅状态，无权限成员不创建第二机构。`onboardingWorkspace` 已线上读回 `Nodejs18.15 / Deployment completed / ModTime 2026-08-14 22:52:53`；`web-admin-vue` 构建通过，机构引导 chunk 公网 SHA-256 与本地一致。未使用真实机构会话或业务写入，9 个视觉节点仍保持待验收；未提交、未推送。
2026-08-14 家长实名一面边界补强：批准家长 H5 只上传身份证人像面；`webLoginApi.uploadParentIdentityDocument` 现在拒绝 `side=back` 并返回 `PARENT_IDENTITY_FRONT_ONLY`。`webLoginApi` 已线上读回 `Nodejs18.15 / Deployment completed / ModTime 2026-08-14 23:01:26`；未使用真实家长会话、证件或业务写入，9 个视觉节点仍保持待验收；未提交、未推送。
2026-08-14 家长失效会话错误码收口：`webLoginApi.authenticateParentH5Session` 对不存在、过期或查询异常的家长会话统一返回 `HTTP 200 + PARENT_AUTH_REQUIRED`，不再出现 500 空响应；实名流程仍只允许身份证人像面。`webLoginApi` 线上读回 `Nodejs18.15 / Deployment completed / ModTime 2026-08-14 23:05:49`；未使用真实家长会话或业务写入，9 个视觉节点仍待验收；未提交、未推送。
2026-08-14 家长实名状态机边界补强：审核中禁止重复上传，已通过禁止再次上传或重置结论，退回状态才允许按原因重新提交；重复提交审核中状态保持幂等。`webLoginApi` 线上读回 `Nodejs18.15 / Deployment completed / ModTime 2026-08-14 23:09:09`；未使用真实家长会话、证件或业务写入，9 个视觉节点仍待验收；未提交、未推送。
2026-08-14 23:16:05 PC AI 生图入口补齐：`generateAIImage` 纳入 `webLoginApi.callFunction` 白名单和会话必需集合，PC `cloud.js` 显式标记为 relay；未登录探针返回 HTTP 200 + `AUTH_REQUIRED`。`webLoginApi` 线上读回 `Nodejs18.15 / index.main / Deployment completed / ModTime 2026-08-14 23:16:05`；`npm run build` 通过，`/admin/` HTTP 200，公网 `cloud-D8xFfYuk.js` 与本地 SHA-256 一致。未调用真实生图或写入业务数据，9 个视觉节点仍因禁止预览保持视觉待验收。
2026-08-14 23:26:16 公开赛事门户查询入口补齐：`getTournamentDetail` 与 `getTournamentMatches` 纳入公开只读 relay，`getRegulations` 纳入登录后 relay；线上探针先发现两个公开函数生产包缺少 `wx-server-sdk`，已按各自 `package.json` 重新部署并读回 `Nodejs18.15 / index.main / Deployment completed`（ModTime 分别 23:25:40、23:26:16）。无赛事 ID 公开探针返回参数错误，无会话规程读取返回 `AUTH_REQUIRED`；未读取或写入真实赛事数据，9 个视觉节点仍因禁止预览保持视觉待验收。
2026-08-14 名单变更审核安全收口：`reviewRosterChange` 已纳入网页统一 relay、会话和机构门禁；线上函数读回 `Nodejs18.15 / index.main / Deployment completed`（ModTime 23:32:45），`webLoginApi` ModTime 23:32:27。服务端校验赛事机构、`tournament_teams` 参赛关系并使用 relay 注入的审核人身份；无 token 探针返回 HTTP 200 + `AUTH_REQUIRED`。PC 构建通过，`cloud-cCe_I_Am.js` 公网与本地 SHA-256 一致（`46C8465C20BC2E7863E4BFCFB11DA33C380A07E839ABCF623EE36B150289FC3A`）；未读取或写入真实名单数据。继续排除已验收节点，9 个视觉节点仍不得标记为 `visual-1:1`。
2026-08-15 02:58:08 认领冲突主办方审核工作台与状态机已上线：PC `/admin/#/tournaments/:id/claim-reviews` 已接入当前机构审核队列、开始核验、要求补材料、通过和不通过；服务端决策只推进到受邀人确认，不自动合并或改球队长期资料。`organizerClaimInvite`、`getMiniWorkspace` 线上部署完成，无会话探针返回登录失效/`WORKSPACE_LOAD_FAILED`；PC `/admin/` 上传 193 个文件，新审核页资源 HTTP 200。证明材料上传、小程序发布、9 个视觉节点及通知模板配置仍待后续；未提交、未推送、未预览。
2026-08-15 03:23:04 认领冲突证明材料上传闭环已上线：小程序冲突页按材料类型上传最多 3 张图片，`getMiniWorkspace` 校验邀请专属路径并把材料元数据写入审核请求；主办方审核页可通过 `organizerClaimInvite.getClaimReviewProofUrls` 在当前机构权限内生成临时查看链接。未公开文件 ID、不自动合并球队或改变所有权。两个函数线上为 `Deployment completed / Nodejs18.15`，无会话探针返回登录失效/`WORKSPACE_LOAD_FAILED`；PC `/admin/` 上传 193 个文件，审核页资源 HTTP 200。未使用真实证明文件，小程序发布、9 个视觉节点和通知模板配置仍待后续；未提交、未推送、未预览。
2026-08-15 03:39:06 小程序开发者版本 `1.0.6` 已通过微信开发者工具 CLI 上传门禁：主包 1.9MB，分包为 `packageA`、`pages/match`、`pages/team`、`pages/tournament`。原型源图保留并归档到 `docs/prototype-assets/miniprogram-source-20260815/`，运行资源使用压缩 JPEG/128px 图标；根域名、`/admin/`、`/referee/` HTTP 200。注意：这是开发者版本上传，不是提交审核或发布，线上用户版本未切换；9 个视觉节点和通知模板生产配置仍待完成，禁止预览、提交、推送。
2026-08-15 03:41:47 小程序当前配置复核后再次上传开发者版本 `1.0.7` 成功，包体读回与 1.0.6 相同（主包 1.9MB、分包合计约 0.6MB）。仍未提交审核或发布，线上用户版本未切换。
2026-08-15 03:50:16 `sendRefereeTemplateMessages` 增加安全配置状态回读并上线，线上 `Nodejs16.13 / Deployment completed / ModTime 03:49:30`；虚拟手机号空队列探针返回 `configured:false` 与 4 个缺失环境变量名，未触发真实通知或写入业务数据。后续只需由服务号管理员在 CloudBase 环境变量中补齐值；不要把 AppSecret、模板 ID 或其他密钥写入仓库。
### 2026-08-15 05:13 PC 认领邀请弹窗线上回读

- `TournamentTeams.vue` 优先使用服务端返回的认领路径；有效期按服务端日期/时间准确展示；关闭、切换和失败清理旧邀请状态。
- `npm run build`、`git diff --check`、`node --check`、162/162 静态门禁通过；`/admin/` 上传 193 个文件，`TournamentTeams-wXyHwYOE.js` 公网原始字节 SHA-256 与本地一致（`923D4414690E421BDF33B4951DE82E2B0B6A20DC8493CB5053F8B849ED66C031`）。未预览、未执行真实认领写入；节点仍待视觉验收，小程序 `1.0.7` 未提交审核/发布。
### 2026-08-15 05:23 家长 H5 人工核验阻断线上回读

- 基础资料不一致提交后，H5 读取 `needsManualReview` 会进入人工核验状态，不能重复展示可继续实名的编辑表单；只提供刷新和返回邀请。
- `node --check`、CSS 924/924、162/162 静态门禁通过；`/service-account-h5/` 上传 4 个文件，公网 `app.js` 原始字节 SHA-256 与本地一致（`8CAD262DCC40271C9415233B753DB810071A60C5E1301CA45B62CA66F12E7707`）。未预览、未使用真实家长会话或资料写入；8 个家长 H5 节点仍待视觉验收，小程序 `1.0.7` 未提交审核/发布。
### 2026-08-15 06:32 CloudBase 函数全量状态只读回读
- 使用 `fn list --limit 100 --json` 回读足球环境函数状态，`webLoginApi`、`updateMatch`、`sendRefereeTemplateMessages`、`organizerClaimInvite`、`getMiniWorkspace`、`onboardingWorkspace`、`serviceMatchWorkflow` 等正式函数均为 `Deployment completed`。
- 本次仅做状态读取，未读取函数详情或敏感配置，未执行真实业务写入；小程序仍仅为开发者版本上传，未提交审核或发布。
### 2026-08-15 06:41 家长 H5 头像裁切预览同步修正
- 确认页的主裁切框、圆形头像预览和方形头像预览现在共享同一组缩放/位移状态；用户看到的预览与提交给 `confirmParentPortrait` 的裁切参数保持一致。
- `service-account-h5/` 4 个文件已上传并完成公网字节回读；未使用真实家长会话、实名材料或人像，8 个家长 H5 视觉节点继续待视觉验收。
### 2026-08-15 06:48 家长 H5 成功页示例数据回退收口
- 生产成功页缺少接口摘要时不再回退到固定示例姓名/球队，改用“球员/当前球队”；本地视觉 QA 分支仍受 `127.0.0.1 + visualQa=1` 门禁保护。
- H5 包已重新上传并完成公网字节回读；未使用真实家长会话或资料，家长视觉节点仍待验收。
### 2026-08-15 06:56 家长 H5 成功页头像资产边界回归修正
- 成功页严格区分透明标准形象照与球员头像：缺少本次头像裁切结果时只显示受限占位，不复用透明图；真实 `avatarPreview` 才进入头像展示。
- 已重新上传并回读 `/service-account-h5/app.js`；未使用真实家长资料，家长视觉节点仍待验收。

### 2026-08-15 08:22 正式名单竞赛组别隔离线上回读
- `getMiniWorkspace` 正式名单读取/提交与 PC 名单异常台账统一按赛事/竞赛组别解析要求；多组别球队必须带 `divisionId`，名单快照保存 `divisionId/divisionName`，实名认证、标准形象照和家长补充资料按组别配置判断。
- `getMiniWorkspace` 读回 `Nodejs18.15 / Deployment completed / 08:15:38`，`webLoginApi` 读回 `Nodejs18.15 / Active / 08:20:38`；固定入口无会话探针为 HTTP 200 + `AUTH_REQUIRED`。`node --check`、`npm run build`、`git diff --check`、162/162 静态门禁通过。
- 未读取或写入真实名单数据，未预览、未提交、未推送；视觉待验收仍 9 个，小程序 `1.0.7` 仍仅为开发者版本，未提交审核或发布。

### 2026-08-15 08:29 小程序开发者版本上传回读
- 正式名单组别逻辑对应的小程序源码已用微信开发者工具 CLI 上传 `1.0.10`，回读 TOTAL 1,547,151 bytes，主包 977.0 KB，分包为 `packageA` 33.4 KB、`pages/match` 70.5 KB、`pages/team` 211.3 KB、`pages/tournament` 218.8 KB。
- 仅开发者版本上传；未提交审核、未发布、未预览，线上用户版本未切换。

### 2026-08-15 08:36 正式名单路由台账同步
- `tools/ui-delivery-inventory.js` 中三条名单入口已统一补记 `divisionId=:divisionId`：球员资料完成度、赛事正式名单、名单审核退回；与当前多组别显式选择及名单快照隔离实现一致。
- `node --check tools/ui-delivery-inventory.js`、162/162 静态门禁、`git diff --check` 通过；未触碰线上业务数据、未预览、未发布。

### 2026-08-15 08:34 PC 名单异常看板组别过滤线上回读
- 选择 `divisionId` 时，`webLoginApi.rosterExceptionBoard` 现在同步过滤参赛关系、球队和 `roster_snapshots.divisionId`，不再混入同球队其他竞赛组别的名单快照；不选组别仍返回全赛事汇总。
- `webLoginApi` 读回 `Nodejs18.15 / Active / ModTime 08:33:36`，无会话探针返回 HTTP 200 + `AUTH_REQUIRED`；未读取或写入真实名单数据，未预览、未提交、未推送。

### 2026-08-15 08:37 参赛管理组别隔离与开发者版同步
- `getMiniWorkspace.teamParticipation` 按参赛关系 `divisionId` 过滤正式名单快照和下一场比赛，单组别赛事才兼容无组别旧快照/比赛；小程序参赛卡片进入赛事详情同步传递 `divisionId`。
- `getMiniWorkspace` 读回 `Nodejs18.15 / Active / ModTime 08:37:04`；小程序开发者版 `1.0.11` 上传成功，TOTAL 1,547,288 bytes，主包 977.0 KB，`pages/team` 211.4 KB。
- 未读取或写入真实赛事数据，未预览、未提交审核、未发布、未推送。

### 2026-08-15 08:40 历史参赛记录组别隔离与开发者版同步
- `getMiniWorkspace.teamHistory` 按 `divisionId` 过滤归档比赛并返回组别，单组别赛事才兼容无组别旧记录，避免多个组别的战绩混算。
- `getMiniWorkspace` 读回 `Nodejs18.15 / Active / ModTime 08:39:39`；小程序开发者版 `1.0.12` 上传成功，TOTAL 1,547,288 bytes。
- 未读取或写入真实历史数据，未预览、未提交审核、未发布、未推送。

### 2026-08-15 08:44 比赛阵容组别隔离与开发者版同步
- `getMiniWorkspace.matchLineup` 按比赛 `divisionId` 选择已审核正式名单；多组别而比赛缺少组别信息时直接阻断，避免跨组别取名单，并回传 `divisionId`。
- `getMiniWorkspace` 读回 `Nodejs18.15 / Active / ModTime 08:43:57`；小程序开发者版 `1.0.13` 上传成功，TOTAL 1,547,288 bytes。
- 未读取或写入真实比赛/阵容数据，未预览、未提交审核、未发布、未推送。

### 2026-08-15 08:46 球队数据包组别参赛关系与开发者版同步
- `getMiniWorkspace.teamDataPackage` 校验有效参赛关系与请求 `divisionId` 一致；多组别未传组别时阻断，单组别才兼容自动回填。
- `getMiniWorkspace` 读回 `Nodejs18.15 / Active / ModTime 08:46:03`；小程序开发者版 `1.0.14` 上传成功，TOTAL 1,547,288 bytes。
- 未读取或写入真实数据包，未预览、未提交审核、未发布、未推送。

### 2026-08-15 08:49 专业版升级名单初始化组别隔离
- `webLoginApi.upgradeDivisionToProfessional` 按目标 `divisionId` 选择名单快照；其他组别快照不再参与初始化，无组别旧快照仅在单组别赛事兼容。
- `webLoginApi` 读回 `Nodejs18.15 / Active / ModTime 08:49:03`，无会话探针 HTTP 200 + `AUTH_REQUIRED`；未读取或写入真实赛事、名单或权益数据，未预览、未提交、未推送。

### 2026-08-15 08:52 名单异常处理写入边界组别隔离
- `rosterExceptionBoard.requestProfileCorrection` 与 `returnRoster` 现在校验名单快照和目标 `divisionId`；无组别旧快照仅在该赛事球队单组别时兼容，避免跨组别误改名单状态。
- `webLoginApi` 读回 `Nodejs18.15 / Active / ModTime 08:51:35`，无会话探针 HTTP 200 + `AUTH_REQUIRED`；162/162 静态门禁、`node --check`、`git diff --check` 通过。未读取或写入真实名单数据，未预览、未提交、未推送；小程序开发者版仍为 `1.0.14`，未提交审核或发布。

### 2026-08-15 09:08 球队数据包历史比赛兼容
- `getMiniWorkspace.teamDataPackageData` 统计比赛时复用单组别旧数据兼容规则；无 `divisionId` 的历史比赛只在赛事单组别时纳入，多组别继续严格按组别隔离。
- `getMiniWorkspace` 读回 `Nodejs18.15 / Active / ModTime 09:07:05`；`node --check`、162/162 静态门禁、`git diff --check` 通过。未读取或写入真实数据包、比赛或球员数据，未预览、未提交、未推送。

### 2026-08-15 09:25 报名组别隔离与正式域名回读
- `applyTournament` 现在按赛事竞赛组别建立报名关系：多组别必须显式选择 `divisionId`，无效/歧义组别直接阻断，并同步写入 `tournament_teams` 与 `invitations`；单组别旧关系保持兼容。PC `TournamentCenter.vue`、`TournamentDetail.vue` 已增加可报名组别读取和选择校验。
- `applyTournament` 读回 `Nodejs16.13 / Active / ModTime 09:17:46`；PC `npm run build`、`node --check`、162/162 静态门禁、`git diff --check` 通过。CloudBase Hosting 已上传 `/admin/` 193 个文件，正式域名 `/admin/`、新入口资源和根域名入口均 HTTP 200，最新入口引用 `index-B9Is9pUN.js` 与 `index-DpOb8WhM.css`。
- 未使用真实报名数据、未预览、未提交、未推送；小程序开发者版仍为 `1.0.14`，未提交审核或发布；9 个视觉节点继续待验收。
### 2026-08-15 09:42 小程序公开报名服务端闭环
- `miniprogram/pages/tournament/signup/signup.js` 已移除对 `tournament_teams` 的客户端直接写入，统一调用 `applyTournament`；服务端按小程序微信会话识别唯一账号，校验球队归属/成员权限、免责声明、报名状态、组别和名额，公开赛事可跨主办机构报名。
- `applyTournament` 已线上更新并安全读回 `Deployment completed`（`modifyTime 2026-08-15 09:39:46`）；小程序开发者版本 `1.0.15` 上传成功（`1,547,183 bytes`），未提交审核、未发布。
- `node --check`、路由与 UI delivery 静态门禁通过；9 个视觉节点仍因未允许预览保持待验收，未写真实报名数据。
### 2026-08-15 09:47 报名组别锁定兼容
- `applyTournament` 的组别级竞赛方案锁定判断补齐 `id/_id` 字段，和现有 `divisionId/division/divisionKey` 兼容；函数重新部署并读回 `Deployment completed`（`modifyTime 2026-08-15 09:46:35`）。
- 无会话固定入口探针返回 `AUTH_REQUIRED`；未读取或写入真实报名数据，9 个视觉节点仍保持待验收。

### 2026-08-15 09:55 台账机器可读性修正
- 09:42 服务端报名收口和 09:47 组别锁定兼容两条最新线上回读已从 `tools/ui-delivery-inventory.js` 文件尾部注释归入 `verificationNotes` 数组；`--json` 返回 98 条记录。
- `node --check`、162/162 静态门禁和 `git diff --check` 通过；未改变业务代码、线上数据、部署或视觉验收状态。

### 2026-08-15 09:58 原型全链路画板审计回读
- `audit-board.mjs` 对 `E:\Documents\saixiaofeng_football\赛小蜂足球UI\赛小蜂足球UI\原型图2.0\全链路画板\2026-07-30-阶段版` 返回 `passed=true`、11 个分组、162 个正式页面、`pendingNodes=0`、无缺失路径或行为逻辑。
- 9 个重复源图引用均为跨流程复用，不新增正式节点缺口；未修改画板、未预览、未发布。

### 2026-08-15 09:59 线上状态只读回读
- `saixiaofeng.com/`、`/admin/`、`/referee/`、`/service-account-h5/` 均返回 HTTP 200；`applyTournament`、`getMiniWorkspace`、`webLoginApi`、`organizerClaimInvite`、`onboardingWorkspace`、`sendRefereeTemplateMessages` 均为 `Deployment completed`。
- 本次未读取函数详情或敏感配置，未写入业务数据、未预览、未发布。
2026-08-15 10:04:53 画板外旧分享页审计：`app.json` 仍登记 `miniprogram/pages/match/share/share`，`share.wxml` 的“下载PDF文档”按钮实际绑定 `share.js.onDownloadPDF`，运行时直接调用 `generatePDF`；当前 `cloudfunctions` 目录无 `generatePDF` 实现，CloudBase 足球环境 `fn list` 也确认 `NOT_FOUND_IN_CLOUDBASE_FUNCTION_LIST`，`git log --all` 也没有可恢复的 `generatePDF` 实现。产品规则明确的是专业版《竞赛规程》预览/导出，未明确首发阵容 PDF 的导出范围或权限。该入口不在 162 个批准节点内，未擅自新增/删除函数或修改页面，保留为 legacy warning，待明确是否保留该导出能力后再处理；`node --check` 通过，未部署、未预览、未写入业务数据。
2026-08-15 10:09:29 正式 PC 构建回归：`web-admin-vue npm run build` 成功生成当前 `dist`，`node --check`（台账与画板外旧分享页）、162/162 静态 UI 交付门禁和 `git diff --check` 均通过；本轮未上传、未部署、未预览、未发布。
2026-08-15 10:12:21 正式域名 PC 静态包字节回读：公网 `/admin/index.html` 与当前 `web-admin-vue/dist/index.html` 引用完全一致；四个入口 JS/CSS 资源逐字节 SHA-256 一致，根域名 HTTP 200；本轮只读核对，未上传、未部署、未预览、未发布。
