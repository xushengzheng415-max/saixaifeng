# 全端 UI 落地台账

2026-08-15 11:43:01 线上状态复核：正式域名根目录、/admin/、/referee/、/service-account-h5/ 均 HTTP 200；已登记主要云函数均为 Deployment completed。线上仍无 setHeadReferee，无会话探针确认当前生产函数尚未包含该中转；小程序 1.0.19 仅开发者上传，未预览、未提交审核、未发布。

2026-08-15 11:39:00 旧名单换人入口收口并上传开发者版：`miniprogram/pages/roster-change/roster-change` 不再调用线上不存在的 `submitRosterChange`，页面改为“普通换人申请已关闭”及主办方异常处理指引；未直接部署旧的无统一租户鉴权云函数。全量小程序 JS `node --check`、162/162 静态门禁、云函数引用缺口 0、`git diff --check` 通过。微信开发者工具 CLI 上传 1.0.19 成功，AppID `wx57164cca8676f411`，TOTAL 1,544,424 bytes（主包 998,479；packageA 34,157；pages/match 71,344；pages/team 216,472；pages/tournament 223,972）。仅开发者上传，未预览、未提交审核、未发布，线上用户版本未切换；普通换人业务仍按异常处理产品规则执行。

2026-08-15 11:31:30 PC 设置裁判长入口安全中转本地实现：`setHeadReferee` 已纳入网页 `webLoginApi` relay，服务端校验当前机构、赛事归属和已分配裁判关系；`node --check`、`npm run build`、162/162 门禁和 `git diff --check` 通过。CloudBase CLI 三次部署均卡在本地 ZIP 打包（ZIP 0 字节），已清理临时目录；线上 `webLoginApi` 仍为 `Deployment completed / modifyTime 2026-08-15 10:40:49`，未上传 `/admin/` 静态包，待打包环境恢复后再上线回读。
2026-08-15 11:04:22 画板外旧分享页缺失 PDF 云函数引用收口并上传开发者版：`miniprogram/pages/match/share/share.js` 不再调用不存在的 `generatePDF`，页面按钮明确显示“PDF导出待配置”，不新增未确认的导出权限或云函数；全量小程序 JS `node --check`、`git diff --check` 和静态门禁通过，云函数引用缺口降为 0、历史例外警告降为 0。微信开发者工具 CLI 上传 1.0.18 成功，AppID `wx57164cca8676f411`，TOTAL 1,545,196 bytes（主包 999,251；packageA 34,157；pages/match 71,344；pages/team 216,472；pages/tournament 223,972）。仅开发者上传，未预览、未提交审核、未发布，线上用户版本未切换；实际 PDF 导出仍待产品确认。
2026-08-15 10:57:44 小程序首页缺失业务数据提示中性化并上传开发者版：`pages/home/home.js` 不再用固定教练姓名、球队对阵、比赛日期/场地、班级教练或 92%/86% 完整度作为真实数据缺省值，缺字段统一显示“待完善/待定”；显式视觉 fixture 数据保持不变。全量小程序 JS `node --check` 通过，静态门禁 162/162。微信开发者工具 CLI 上传 1.0.17 成功，AppID `wx57164cca8676f411`，TOTAL 1,546,030 bytes（主包 999,251；packageA 34,157；pages/match 72,178；pages/team 216,472；pages/tournament 223,972）。仅开发者上传，未预览、未提交审核、未发布，线上用户版本未切换。
2026-08-15 10:54:08 小程序首页视觉样例失败回退安全修正并上传开发者版：`miniprogram/pages/home/home.js` 在真实 `workspace.loadContext` 失败且没有显式 `visualQa=1` 时不再回退到 `previewContext()`，统一展示真实错误态；本地全量小程序 JS `node --check` 通过，静态门禁 162/162。微信开发者工具 CLI 上传 1.0.16 成功，AppID `wx57164cca8676f411`，TOTAL 1,545,919 bytes（主包 999,140；packageA 34,157；pages/match 72,178；pages/team 216,472；pages/tournament 223,972）。仅开发者上传，未预览、未提交审核、未发布，线上用户版本未切换。
2026-08-15 10:50:54 PC 静态包回归复核：`web-admin-vue` `npm run build` 通过；当前 `dist` 的 `index-B9Is9pUN.js`、`vue-vendor-C9beSz07.js`、`element-plus-CMVyjDO1.js`、`index-DpOb8WhM.css` 与 `https://saixiaofeng.com/admin/assets/` 对应资源逐字节 SHA-256 一致，无需重复上传。仅只读验证，未预览、未提交、未推送。
2026-08-15 10:45:15 线上状态复核：正式域名 `/`、`/admin/`、`/referee/`、`/service-account-h5/` 均返回 HTTP 200；CloudBase 足球环境函数列表中 `webLoginApi`、`getMiniWorkspace`、`onboardingWorkspace`、`organizerClaimInvite`、`applyTournament`、`serviceMatchWorkflow`、`updateMatch` 和 `sendRefereeTemplateMessages` 均为 `Deployment completed`。小程序当前仍为开发者版本 1.0.15，未提交审核、未发布；9 个视觉节点和通知模板生产变量仍待完成。未预览、未写入真实业务数据、未提交、未推送。

2026-08-15 10:41:12 家长历史提交引用兼容修正并上线：`completeParentProfile` 在关闭当前实名/形象照要求的重复提交场景中保留既有 `verificationId`、`portraitId`、`avatarFileId`，只对当前显式开启的要求做门禁；`webLoginApi` 读回 `Nodejs18.15 / Deployment completed / modifyTime 2026-08-15 10:40:49`，无会话 `AUTH_REQUIRED`、无效邀请 `PARENT_INVITE_INVALID`，未读取或写入真实提交数据。

2026-08-15 10:37:54 家长协作入口清单同步并上线：`getMiniWorkspace.formatParentProfileInvite` 只在邀请/球员显式开启对应开关时显示实名认证和标准形象照，基础资料与监护授权保持固定；云函数线上读回 `Nodejs18.15 / Deployment completed / modifyTime 2026-08-15 10:37:31`，无会话固定入口探针 `AUTH_REQUIRED`，未读取或写入真实业务数据，未预览、未发布。

2026-08-15 10:34:09 家长 H5 独立要求分支收口并上线：`previewParentProfileInvite` 仅采信邀请/球员上明确存在的实名和形象照开关；活动邀请本身只代表家长基础资料协作，未显式配置的两项不再进入强制流程。H5 在基础资料后按 `realName/portrait` 选择实名、形象照或直接提交，`completeParentProfile` 只校验已开启的要求并保存对应引用；批准原型样例显式开启两项要求，视觉结构不变。`webLoginApi` 读回 `Nodejs18.15 / Deployment completed / modifyTime 2026-08-15 10:32:44`；`service-account-h5/` 上传 4 个文件，公网 `app.js` HTTP 200 且 SHA-256 与本地一致（`BE6FAE8DDFB09C30C8AD543402C0A4DACE703835E4635A0EC70DE19250A83681`）。无会话 `AUTH_REQUIRED`、无效邀请 `PARENT_INVITE_INVALID`；未使用真实资料、未预览、9 个视觉节点继续 `visual-review`；未提交、未推送、未发布。

2026-08-15 10:22:58 正式名单要求默认值收口并上线：`getMiniWorkspace` 与 `webLoginApi` 只在赛事/竞赛组别显式配置时计算标准形象照、家长补充资料和实名认证待办；未配置不再按历史默认生成强制待办，继续返回 `legacy-compatibility` 来源标识。两个云函数线上读回 `Nodejs18.15 / Deployment completed`（`getMiniWorkspace` 10:21:25、`webLoginApi` 10:22:01），无会话固定入口探针为 `AUTH_REQUIRED`；未读取或写入真实业务数据。家长独立 H5 的赛事/组别配置来源仍待明确，9 个视觉节点保持 `visual-review`；未提交、未推送、未发布。

2026-08-15 07:45:45 家长独立配置来源审计：家长协作页从球队球员库/快速创建球员进入，现有 `parentProfileInvite`、重新生成和快速建档调用没有赛事/组别上下文；实名只兼容旧球员字段，形象照没有配置来源。未用页面默认值替主办方选择赛事规则，独立开关传递保留为待确认的数据模型项；本轮未改代码、未部署、未写入业务数据。

2026-08-15 07:44:02 实名更正接口 active 邀请门禁补齐并上线：`requestParentIdentityCorrection` 现在先复核 active `parentInvite` 与球员/球队关系，再创建更正工单；线上 `webLoginApi` 回读 `Nodejs18.15 / modifyTime 2026-08-15 07:43:27 / Deployment completed`，无会话探针 `PARENT_AUTH_REQUIRED`，无效邀请 `PARENT_INVITE_INVALID`。未使用真实会话或实名记录，家长链路视觉节点继续 `visual-review`；未提交、未推送、未发布。

2026-08-15 07:39:42 家长 H5 人像上传/确认门禁补强并上线：`uploadAndProcessParentPortrait` 与 `confirmParentPortrait` 在任何受限人像读写前重新校验 active `parentInvite` 与球员/球队关系；`webLoginApi` COS 部署回读 `Nodejs18.15 / modifyTime 2026-08-15 07:39:02 / Deployment completed`。无会话探针返回 `PARENT_AUTH_REQUIRED`，无效邀请返回 `PARENT_INVITE_INVALID`；未使用真实家长会话、证件或人像，家长链路视觉节点继续 `visual-review`，未提交、未推送、未发布。

2026-08-15 07:35:41 家长 H5 身份上传/提交门禁补强并上线：两个身份动作都复核 active `parentInvite`；提交动作额外复核基础资料确认和监护人授权，避免会话存活但邀请或资料状态变化时写入实名记录。H5 已上传材料但提交失败时显示“刷新状态或重新上传”的准确反馈。`node --check`、162/162 静态门禁、`git diff --check` 通过；`webLoginApi` COS 部署回读 `Nodejs18.15 / modifyTime 2026-08-15 07:34:37 / Deployment completed`。无会话探针为 `PARENT_AUTH_REQUIRED`，无效邀请为 `PARENT_INVITE_INVALID`；家长链路视觉节点仍待 `visual-review`。

2026-08-15 07:11:16 家长 H5 匹配孩子入口防重复授权修正并上线：主操作按钮首次点击即禁用并显示忙碌态，已有同邀请会话只加载一次，未授权流程由 `parentOAuthBusy` 阻止并行 `parentProfileOAuthUrl` 请求；失败释放状态后仍可重试。`node --check service-account-h5/app.js`、162/162 静态门禁和 `git diff --check` 通过；`/service-account-h5/` 上传 4 个文件，公网 `app.js` 与本地 SHA-256 一致（`D2EF2EBF182A7236F856370B6079BA583BD0A73B8A8C2FFF2AA190AF0EE87754`），HTTP 200。未使用真实家长会话或资料，9 个节点继续 `visual-review`；未提交、未推送、未发布。

2026-08-15 07:05:03 专业版认领提醒弹层状态复核并完成线上回读：`TournamentTeams.vue` 的空认领路径在计算层直接停止二维码生成；生成成功后即时刷新本次分享时间，切换、关闭、失败会清理对应状态。`npm run build`、云函数 `node --check`、162/162 静态门禁和 `git diff --check` 通过；`/admin/` 上传 193 个文件，公网 `TournamentTeams-D7uSYmr0.js` HTTP 200，原始字节 SHA-256 与本地一致（`F311AF1F4B1BA297E9B01E68C1F51DF558734F57408523FF451FDC515BD89D47`）。未改变 `organizerClaimInvite` 云函数，未预览或执行真实认领写入；节点继续 `visual-review`，未提交、未推送、未发布。

2026-08-15 06:27:00 专业版发送认领提醒弹层空二维码占位修正并上线：邀请尚未生成时不再对空字符串绘制二维码，只有拿到真实 `claimInvitePath` 才显示代码生成的二维码，否则显示“生成中/待生成”状态。`npm run build`、162/162 静态门禁和 `git diff --check` 通过；`web-admin-vue/dist` 上传 `/admin/` 193 个文件，公网 `TournamentTeams-DGv1PH16.js` 与本地 SHA-256 一致（`3900162CDC82E7C04DD3B501AD1E086D24338B9E704A4545D3C89E2699C6408A`），HTTP 200。未预览或执行真实认领写入，节点继续 `visual-review`；未提交、未推送、未发布。

2026-08-15 06:19:15 家长 H5 线上动作注册与鉴权回读：`getParentProfileDraft`、`saveParentBasicProfile`、`uploadParentIdentityDocument`、`submitParentIdentityVerification`、`getParentIdentityVerification`、`requestParentIdentityCorrection`、`uploadAndProcessParentPortrait`、`confirmParentPortrait`、`completeParentProfile` 逐项使用空会话与虚拟 invite 探针，全部 HTTP 200 + `PARENT_AUTH_REQUIRED`；未读取或写入真实家长、证件、人像或资料，无需重复部署。9 个视觉节点继续 `visual-review`；未预览、未提交、未推送、未发布。

2026-08-15 06:13:30 PC 静态包线上一致性复核：重新执行 `web-admin-vue npm run build` 通过；公网 `/admin/` 当前引用的 `index-DbVePOJO.js`、`vue-vendor-C9beSz07.js`、`element-plus-CMVyjDO1.js` 与 `index-DpOb8WhM.css` 已逐字节 SHA-256 对比当前 `web-admin-vue/dist`，全部一致，无需重复上传。未预览、未提交、未推送、未发布。

2026-08-15 06:05:03 裁判指派通知中转衔接修正并上线：`updateMatch` 不再直接调用 `sendRefereeTemplateMessages`；网页已鉴权的 `webLoginApi` relay 统一携带手机号、通知 ID 与 HMAC 时间窗证明，普通直接调用不返回内部通知元数据。两个函数线上部署并完成回读，无会话 relay 返回 `AUTH_REQUIRED`，通知函数无证明探针返回 `INTERNAL_RELAY_REQUIRED`；未读取或写入真实比赛/通知数据。

2026-08-15 06:12:44 小程序视觉样例入口安全收口并上传开发者版本：统一新增 `workspace.isVisualQaEnabled`，登记页面只有在微信开发者工具 `platform=devtools` 且显式 `visualQa=1` 时加载本地样例；全量小程序 JS `node --check`、162/162 静态门禁通过。开发者版本 `1.0.9` 上传成功，回读 TOTAL 1,546,485 bytes、主包 977.0 KB，分包为 packageA 33.4 KB、pages/match 70.5 KB、pages/team 210.6 KB、pages/tournament 218.8 KB。未提交审核、未发布、未预览。

2026-08-15 05:44:30 裁判通知函数内部中转鉴权收口并上线：`webLoginApi` 在裁判绑定成功后使用现有服务号密钥生成带时间窗的 HMAC 中转证明，`sendRefereeTemplateMessages` 拒绝无证明手机号/通知 ID 调用，`configurationStatus` 仅返回配置状态与缺失变量名；两个云函数已部署并完成线上拒绝探针，未读取或写入真实通知数据。服务号管理员仍需配置通知函数现有服务号变量，未提交、未推送、未发布。

2026-08-15 05:31:12 小程序开发者版本上传回读：微信开发者工具 CLI 上传 `1.0.8` 成功，回读包体 TOTAL 1,546,266 bytes、主包 976.8 KB，分包为 packageA 33.4 KB、pages/match 70.5 KB、pages/team 210.5 KB、pages/tournament 218.8 KB。仅为开发者上传验证，未提交审核、未发布，线上用户版本未切换；未执行预览。

2026-08-15 05:29:55 裁判小程序注册入口行为收口：已移除 `pages/guide/referee-info/referee-info` 的本地表单伪注册、延时假成功和 `refereeInfo` 本地存储，改为明确的服务号 H5 承接页；提供入口复制与返回首页，不创建或覆盖裁判身份。`node --check`、JSON 解析、WXML 简单表达式扫描和 `git diff --check` 通过；小程序开发者版本 `1.0.7` 尚未重新上传，未提交审核、未发布。

2026-08-15 04:32:39 家长资料提交成功页头像预览修正并完成线上回读：H5 确认裁切后分别展示 canvas 生成的头像与透明标准形象照，裁切缩放/位移客户端和服务端均有界；`service-account-h5/` 4 个文件重新上传，公网 `app.js` 与本地 SHA-256 一致（`90FACCD4788BF99C48AD99B83B9B8154EB7248AB9DC435CD9859032B14AD01E1`），入口与 `index.html` HTTP 200。`node --check`、CSS 916/916、162/162 静态门禁通过；未使用真实家长会话或资料写入，节点继续 `visual-review`；小程序 `1.0.7` 未提交审核/发布。
2026-08-15 04:29:28 家长标准头像派生闭环补齐并完成线上验证：H5 从受限透明预览生成 PNG 头像并提交 avatarData 与有界 crop(scale/x/y)；webLoginApi.confirmParentPortrait 校验家长会话、实名版本、人像版本和 PNG 2MB 上限后写入受限 avatar 文件，保存 avatarFileId/avatarCrop/avatarProcessingStatus，并将头像文件关联到资料提交记录。node --check、CSS 916/916 括号校验和 162/162 静态门禁通过；webLoginApi 线上读回 Nodejs18.15 / Deployment completed / ModTime 04:28:15，无会话确认探针返回 HTTP 200 + PARENT_AUTH_REQUIRED；更新后的 H5 4 个文件上传 /service-account-h5/，app.js 公网与本地 SHA-256 一致（A7A82D47949695EFD90EDE8870AEE3060E974DA363585F40BE446B67732C7EED），入口 HTTP 200。未使用真实家长会话或资料写入，节点继续 visual-review；小程序 1.0.7 未提交审核/发布。

2026-08-15 04:23:19 家长人像确认返回上下文修正并完成线上验证：H5 人像分割结果页的重新拍摄/返回取景框继续携带当前球员与球队上下文，不再回退通用占位；`node --check service-account-h5/app.js`、CSS 916/916 括号校验和 162/162 静态门禁通过。`service-account-h5/` 上传 `/service-account-h5/` 4 个文件，公网入口与 `index.html` HTTP 200，`app.js` 公网与本地 SHA-256 一致（`425EBF664FF2A4A03DD7724B0A80DA73C84BECBC0D8C2ADC805B4567B3E02AB8`）。未使用真实家长会话、实名材料、人像或业务写入，节点继续保持 `visual-review`；小程序开发者版本 `1.0.7` 未提交审核/发布。

2026-08-15 04:16:21 专业版球队认领邀请有效期回填修正并完成线上验证：PC 认领弹窗接收服务端 `inviteExpireAt`，切换参赛关系、关闭或失败时清理旧值；`npm run build`、162/162 静态门禁和 `git diff --check` 通过。`web-admin-vue/dist` 上传 `/admin/` 193 个文件，公网入口 HTTP 200，`TournamentTeams-DJ8Ukj-k.js` 公网与本地 SHA-256 一致（`7A717F2DA88C09EC2E90DE6C7058B44F2EEC491E9E12FF122A24CBD9590B9F32`）。未预览或执行真实认领写入，节点继续保持 `visual-review`；小程序开发者版本 `1.0.7` 未提交审核/发布。

2026-08-15 04:09:24 `webLoginApi` HTTP 请求体兼容解析补强并上线：兼容 HTTP body 字符串、Buffer、对象、Base64 与表单候选，线上读回 `Nodejs18.15 / Active / Available / ModTime 2026-08-15 04:08:45`。无会话 `checkLogin` 探针返回 HTTP 200 + `AUTH_REQUIRED`，无效家长邀请返回 HTTP 200 + `PARENT_INVITE_INVALID`，未读取或写入真实业务数据。`node --check`、全量 UI 静态门禁通过（162/162、0 路由缺口、0 页面文件缺口）；9 个视觉节点继续保持 `visual-review`，小程序开发者版本 `1.0.7` 未提交审核/发布；未提交、未推送、未预览。

2026-08-15 02:40:27 `getMiniWorkspace` 线上依赖修正并完成运行探针：重新启用 `package.json` 的云端依赖安装后，线上包读回 `Nodejs18.15 / Active / Available / ModTime 2026-08-15 02:40:27`；无微信会话进入 `WORKSPACE_LOAD_FAILED`，不再报缺少 `wx-server-sdk`。临时配置已清理，未写业务数据；小程序尚未上传发布，9 个视觉节点仍未完成；未提交、未推送。

2026-08-15 02:37:11 认领冲突人工审核链路补齐并上线：小程序冲突页提交现在调用 `getMiniWorkspace.requestPrebuiltTeamClaimReview`，服务端创建幂等审核请求并将受邀关系标记为 `review_required`；不自动认领、不合并球队、不改长期资料。线上 `getMiniWorkspace` 为 `Nodejs18.15 / Active / Available`，状态读回 `ModTime 2026-08-15 02:36:42`；无微信会话探针返回 `WORKSPACE_LOAD_FAILED`。小程序尚未上传发布，9 个视觉节点仍未完成；主办方审核工作台和证明材料上传仍待后续；未提交、未推送。

2026-08-15 02:26:10 比赛现场阵容锁定边界补强并上线：服务号/H5 统一工作流拒绝锁定后的裁判名单覆盖，并要求赛前检查完成后才能核验球队提交的首发；线上 `serviceMatchWorkflow` 为 `Nodejs16.13 / Active / Available`，公网函数状态读回 `ModTime 2026-08-15 02:26:10`，未使用真实比赛数据。小程序尚未上传发布，9 个视觉节点仍未完成；未提交、未推送。

2026-08-15 02:13:33 裁判服务号 H5 正式包补传并完成公网核对：`/referee/` 旧版 28KB `app.js` 已替换为本地完整 115799 bytes 版本，SHA-256 `E44C311A1F0E92B0113D6A9688A9D402A06C327C49427C8329DA5500AC9B318A` 与本地一致；公网包包含服务号 OAuth、裁判现场工作流、电子签字与退回修正链路。`sendRefereeTemplateMessages` 线上函数保持 `Active / Available`，但生产未配置模板 ID 等环境变量，缺少配置时安全回写 `configuration_required`，未发送真实通知。小程序尚未上传发布，9 个视觉节点仍未完成；未提交、未推送。

2026-08-15 02:09:54 PC 登录后的机构识别引导已同步到正式页面并上线：扫码回调清理旧机构缓存并进入 `/organization-onboarding`；主办方受保护页面仅接受当前账号 `userInfo.orgId`，不再以旧 `currentOrganization` 缓存作为机构依据。引导明确提供“赛事主办方 / 青训机构”两种业务场景，已有机构自动识别，青训未开通时只展示刷新与咨询。构建通过，`/admin/` 上传 191 个文件，`WechatCallbackView`、`OrganizationOnboarding` 和路由 bundle 公网均 HTTP 200；未使用真实业务数据。小程序尚未上传发布，9 个视觉节点仍未完成；未提交、未推送。

2026-08-15 02:02:24 比赛现场写入边界已同步到正式页面并上线：`webLoginApi.dbQuery` 对 `match_events`、`match_referees`、`squads` 的写操作在会话/机构校验后统一拒绝，PC `/referee/match/:id` 只读展示比赛与事件流水，旧 GPS 签到和开始/结束比赛按钮已移除，统一引导裁判服务号/H5。`webLoginApi` 线上为 `Nodejs18.15 / Active / Available / ModTime 2026-08-15 01:59:45`；无会话探针返回 `AUTH_REQUIRED`，未触碰真实数据。PC 构建通过，`/admin/` 已上传 191 个文件，`RefereeMatchDetail` 公网 bundle HTTP 200。小程序尚未上传发布，9 个视觉节点仍未完成；未提交、未推送。

2026-08-15 01:51:33 旧阵容适配器的读取边界再次收紧并上线：`updateMatchLineup` 不再自行读取比赛或解析球队，只把必要参数交给 `serviceMatchWorkflow.submitLineupLegacy`，由统一服务端先校验身份再解析场次侧别；两个函数线上读回 `Active / Available / ModTime 2026-08-15 01:51:33`（Nodejs16.13）。旧签字写入口停用、签字状态只读、PC `/sign` 停用提示保持不变；未使用真实球队、比赛或签字数据，小程序尚未上传发布，9 个视觉节点仍未完成。

2026-08-15 01:47:28 旧阵容/签字兼容入口已统一收口并上线：`updateMatchLineup` 只转发至 `serviceMatchWorkflow.submitLineup`，旧 `saveSignature`/`updateMatchSignature` 直接写入入口停用，`getSignatureStatus` 改为纯只读；PC `/sign` 页面显示正式裁判服务号/H5入口提示。4 个函数均读回 `Active / Available`，PC `/admin/` 重新上传 191 个文件，`SignatureView` 公网与本地 SHA-256 一致；构建、云函数语法和全量 UI 静态门禁通过。未使用真实球队、比赛或签字数据；小程序尚未上传发布，9 个视觉节点仍未完成。

2026-08-15 01:37:40 比赛执行阵容入口补齐并上线：正式小程序服务阵容页调用的 `serviceMatchWorkflow.getLineupTask` 与 `submitLineup` 已注册到云函数主入口；服务端继续校验裁判已发布首发请求、球队属于当前场次、球队负责人认领关系、已审核赛事正式名单、首发人数和球员 ID，不接受客户端伪造球员或跨场次提交。`serviceMatchWorkflow` 线上读回 `Active / Available / ModTime 2026-08-15 01:37:40`（现有线上运行时为 Nodejs16.13）；`node --check`、阵容页语法和全量 UI 静态门禁通过。未使用真实球队、名单或比赛写入；小程序尚未上传发布，9 个视觉节点仍未完成。


2026-08-15 01:26:54 简易版升级专业版链路已落地并上线：PC 模式对比入口调用 `upgradeDivisionToProfessional`，在原竞赛组别上切换专业模式并路由到正式名单待办，不重复创建组别；服务端要求有效专业版权益、阻断已锁定竞赛方案，保留规则/球队/抽签/赛程/裁判数据，并对正式名单初始化保持幂等。`webLoginApi` 线上读回 `Nodejs18.15 / Active / Available / ModTime 2026-08-15 01:26:54`；无会话探针返回 `AUTH_REQUIRED`。PC 构建通过，`/admin/` 上传 191 个文件，`TournamentDivisionCreate` 公网与本地 SHA-256 一致（`D81EF54EDD83A606D14A5348BC35FCA4D783F7118D8F7741BECBF1CE1829892A`）。未使用真实机构、赛事、权益或名单数据；小程序发布与 9 个视觉节点继续待完成。

2026-08-15 01:13:36 小程序通知闭环边界补齐并上线：`getMiniWorkspace` 的消息深链现在只允许当前已登记的小程序页面路由，未知或外部路径会被清空；历史非 `read` 回执会在标记已读时更新而不是跳过；消息中心跳转失败会保留已读结果并提示返回刷新。`node --check`、`app.json` JSON 解析、全量 UI 静态门禁通过（162/162 节点、0 缺失路由）；`getMiniWorkspace` 已部署并读回 `Nodejs18.15 / Active / Available / ModTime 2026-08-15 01:13:36`。未读取或写入真实消息、回执或业务数据，未调用真实通知发送；小程序发布和 9 个视觉节点继续保持未完成。
2026-08-15 01:06:11 裁判服务号通知发送函数同步上线：`sendRefereeTemplateMessages` 已将当前源码部署到线上，继续使用 `referee_notifications` 队列，发送前检查配置/状态，成功、失败和缺少配置均回写队列状态；未调用发送动作、未触碰真实通知队列。线上读回 `Nodejs16.13 / Active / Available / ModTime 2026-08-15 01:06:11`；H5 工作流仍由 `webLoginApi.serviceRefereeWorkflow` 统一会话中转，9 个视觉节点继续保持 `visual-review`。

2026-08-15 01:03:20 比赛执行快照边界补齐并上线：`updateMatch` 在方案锁定后的首次受控裁判指派时固化 `matchId/tournamentId/divisionId/organizationId/planVersion/对阵/场地/时间` 快照；`serviceMatchWorkflow.startRefereeMatch` 在缺少快照时补固化同一结构。快照存在后，直接更新入口拒绝修改对阵、场地、时间、赛制、状态和比分，现场事件、裁判指派和签字仍走各自受控流程。两个函数均已部署并读回 `Nodejs16.13 / Active / Available`：`updateMatch` `ModTime 2026-08-15 01:02:51`、`serviceMatchWorkflow` `ModTime 2026-08-15 01:03:20`；无会话 `updateMatch` 探针返回 HTTP 200 + `AUTH_REQUIRED`，未触碰真实比赛数据，9 个视觉节点继续保持 `visual-review`。

2026-08-15 00:58:11 旧球队查询入口收口并上线：`getMyTeams` 不再使用客户端传入的手机号、微信标识或用户 ID，改用网页可信会话账号，并仅返回真实 `orgId` 属于当前机构的球队；无有效机构或机构实体时返回 `ORG_REQUIRED`。两个函数均已部署并读回 Active / Available：`getMyTeams` `Nodejs16.13 / ModTime 2026-08-15 00:57:38`、`webLoginApi` `Nodejs18.15 / ModTime 2026-08-15 00:58:11`；无会话探针返回 HTTP 200 + `AUTH_REQUIRED`，未触碰真实球队数据，9 个视觉节点继续保持 `visual-review`。

2026-08-15 00:54:08 外部报名入口收口并上线：`applyTournament` 现在要求可信网页账号与有效机构上下文，并校验提交球队真实 `orgId` 属于当前机构；赛事仍可跨机构接受公开报名，未改变赛事主办方边界。`webLoginApi` 将该入口纳入机构必需 relay。两个函数均已部署并读回 Active / Available：`applyTournament` `Nodejs16.13 / ModTime 2026-08-15 00:53:24`、`webLoginApi` `Nodejs18.15 / ModTime 2026-08-15 00:54:08`；无会话探针返回 HTTP 200 + `AUTH_REQUIRED`，未触碰真实报名或球队数据，9 个视觉节点继续保持 `visual-review`。

2026-08-15 00:50:21 赛事球队审核入口收口并上线：`tournamentReview` 的提交、查询、批准和拒绝动作现在都绑定可信网页账号与真实机构；赛事和球队必须属于当前机构，审核人和教练手机号不再接受客户端自报。`webLoginApi` 将其纳入机构必需 relay。两个函数均已部署并读回 `Nodejs18.15 / Active / Available`：`tournamentReview` `ModTime 2026-08-15 00:49:34`、`webLoginApi` `ModTime 2026-08-15 00:50:21`；无会话探针返回 HTTP 200 + `AUTH_REQUIRED`，未触碰真实审核或参赛数据，9 个视觉节点继续保持 `visual-review`。

2026-08-15 00:45:16 高风险批量删除入口收口并上线：`clearTeamPlayers` 不再接受匿名或客户端自报的球队身份，必须通过网页会话传入可信账号/机构上下文，并校验球队真实 `orgId` 与当前机构一致后才允许删除球员；`webLoginApi` 同步把该入口纳入会话和机构必需集合。两个函数均已部署并读回 `Nodejs18.15 / Active / Available`：`clearTeamPlayers` `ModTime 2026-08-15 00:44:44`、`webLoginApi` `ModTime 2026-08-15 00:45:16`；无会话探针返回 HTTP 200 + `AUTH_REQUIRED`，未触碰真实球队或球员数据，9 个视觉节点继续保持 `visual-review`。

2026-08-15 00:39:08 通用 `dbQuery` 锁定检查补强并上线：删除分支现在先读取待删记录，避免未定义记录绕过方案校验；缺少 `divisionId` 的旧参赛关系会继续按赛事及嵌套竞赛组别快照检查，锁定状态读取失败时拒绝写入。`webLoginApi` 已部署并读回 `Nodejs18.15 / Active / Available / ModTime 2026-08-15 00:39:08`；无会话删除探针返回 HTTP 200 + `AUTH_REQUIRED`，未触碰真实数据，9 个视觉节点继续保持 `visual-review`。

2026-08-15 参赛关系直接写入口补齐方案锁定保护：`applyTournament`、`clearTournamentTeams` 与 `organizerClaimInvite` 在服务端读取赛事及竞赛组别锁定状态，锁定后分别拒绝新增/重建报名、清空参赛关系和生成认领邀请，返回 `COMPETITION_PLAN_LOCKED`；未锁定流程保持不变。三个函数均已部署并读回 Active / Available：`applyTournament` `Nodejs16.13 / ModTime 2026-08-15 00:33:54`、`clearTournamentTeams` `Nodejs18.15 / ModTime 2026-08-15 00:34:07`、`organizerClaimInvite` `Nodejs18.15 / ModTime 2026-08-15 00:34:54`；未调用真实机构、赛事或球队数据，9 个视觉节点继续保持 `visual-review`。

2026-08-15 历史机构兜底入口清理并上线：`checkUserByOpenId`、`profileContentSecurity`、`manageTournamentCenterContent` 与 `backfillOrganizerOrgId` 不再把自然人 `users._id` 当作机构 `orgId`；无机构时返回空机构状态或 `user_missing_org`，保留真实 `orgId/organizationId`，不自动创建或回写个人 ID。四个函数均已部署并读回 Active / Available：`checkUserByOpenId` `Nodejs16.13 / ModTime 2026-08-15 00:26:30`、`profileContentSecurity` `Nodejs18.15 / ModTime 2026-08-15 00:26:58`、`manageTournamentCenterContent` `Nodejs18.15 / ModTime 2026-08-15 00:27:14`、`backfillOrganizerOrgId` `Nodejs18.15 / ModTime 2026-08-15 00:28:00`；未调用真实账号、机构或迁移数据，9 个视觉节点继续保持 `visual-review`。

2026-08-15 方案锁定后的直接赛程写入口补齐：`generateSchedule` 在服务端读取当前赛事/竞赛组别锁定状态，锁定后返回 `COMPETITION_PLAN_LOCKED`，不再删除重建已确认组别赛程；`updateMatch` 同步执行真实机构校验，锁定后只允许受控裁判指派，比分、状态、时间、场地和对阵字段被拒绝，裁判组仍通过已审核本机构裁判校验。两个函数不再以 `users._id` 作为机构兜底。函数已部署并读回 `generateSchedule` `Nodejs16.13 / Active / Available / ModTime 2026-08-15 00:20:11`、`updateMatch` `Nodejs16.13 / Active / Available / ModTime 2026-08-15 00:20:45`；未使用真实机构、赛事或比赛写入，9 个视觉节点继续保持 `visual-review`。

2026-08-14 公开赛事门户查询入口补齐：`getTournamentDetail`/`getTournamentMatches` 走公开只读 relay，`getRegulations` 走登录后 relay；两个公开云函数已补齐依赖并重新部署，线上读回 `Nodejs18.15 / index.main / Deployment completed`（ModTime 分别 23:25:40、23:26:16）。无赛事 ID 公开探针返回参数错误，无会话规程读取返回 `AUTH_REQUIRED`；未读取或写入真实赛事数据，9 个视觉节点继续保持 `visual-review`。

2026-08-14 PC AI 生图入口补齐：`AIImageGenerator` 与海报编辑器的 `generateAIImage` 调用明确走 `webLoginApi.callFunction`，并纳入会话必需白名单；无会话返回 `AUTH_REQUIRED`。`webLoginApi` 线上读回 `Nodejs18.15 / index.main / Deployment completed / ModTime 2026-08-14 23:16:05`；PC 构建通过，`/admin/` HTTP 200，公网 `cloud-D8xFfYuk.js` 与本地 SHA-256 一致（`17FFC7CD00D8FC805E005DC8BDC361715B15AAEF957330A9DFCBC81CCA95BBA4`）。未调用真实生图或写入业务数据，9 个视觉节点继续保持 `visual-review`。

2026-08-14 家长实名状态机边界补强：实名审核中禁止重复上传，已通过禁止再次上传或重置结论，退回状态才允许按原因重新提交；审核中重复提交保持幂等。`webLoginApi` 线上读回 `Nodejs18.15 / index.main / Deployment completed / ModTime 2026-08-14 23:09:09`；无 token、无效 token 和家长动作探针均返回 `PARENT_AUTH_REQUIRED`，未使用真实家长会话、证件或业务写入。

2026-08-14 家长失效会话错误码收口：`webLoginApi.authenticateParentH5Session` 对不存在、过期或查询异常的家长会话统一返回 HTTP 200 + `PARENT_AUTH_REQUIRED`，不再向 H5 暴露 500 空响应；实名流程仍只允许身份证人像面。`webLoginApi` 线上读回 `Nodejs18.15 / index.main / Deployment completed / ModTime 2026-08-14 23:05:49`；无 token、无效 token 和完成动作探针均返回 `PARENT_AUTH_REQUIRED`，未使用真实会话或业务写入。

2026-08-14 家长实名一面边界补强：批准家长 H5 只上传身份证人像面；`webLoginApi.uploadParentIdentityDocument` 现在在会话校验后拒绝 `side=back`，返回 `PARENT_IDENTITY_FRONT_ONLY`，不再保存不需要的反面材料。`node --check` 通过，`webLoginApi` 线上读回 `Nodejs18.15 / index.main / Deployment completed / ModTime 2026-08-14 23:01:26`；未使用真实家长会话、证件或业务写入，8 个家长 H5 节点与总计 9 个视觉节点状态不变。

2026-08-14 机构引导能力复用修正：PC `OrganizationOnboarding.vue` 增加赛事/青训创建按钮的提交锁，避免重复点击；已有唯一机构且当前账号具备对应权限时，赛事创建复用原机构并补齐 `event` 能力，青训开通复用原机构并补齐 `education` 能力与订阅状态，无权限成员不创建第二机构。`onboardingWorkspace` 已部署并读回 `Nodejs18.15 / index.main / Deployment completed / ModTime 2026-08-14 22:52:53`；`npm run build` 通过，`OrganizationOnboarding-CSPu2w3E.js` 公网与本地 SHA-256 一致（`53663780FA6D716364E8A965FA13366ACE77841691BCD8F9A70812AEFD36619B`），`/admin/` HTTP 200。未使用真实机构会话或业务写入；9 个视觉节点仍保持 `visual-review`。

2026-08-14 家长邀请会话边界修正：服务号 H5 在已有家长会话打开另一条 `parentInvite` 时会先清理旧会话并重新授权；后续家长 API 同时携带当前邀请令牌，`webLoginApi` 不匹配时返回 `PARENT_INVITE_MISMATCH`，不会把旧孩子资料带入新邀请。`webLoginApi` 线上读回 `Nodejs18.15 / index.main / Deployment completed / ModTime 2026-08-14 22:41:45`；4 个无会话家长动作返回 `PARENT_AUTH_REQUIRED`。`service-account-h5/app.js` 公网 HTTP 200，SHA-256 与本地一致（`E44C311A1F0E92B0113D6A9688A9D402A06C327C49427C8329DA5500AC9B318A`）。未使用真实家长会话或业务资料，8 个家长 H5 节点视觉待验收仍不变。

2026-08-14 专业版认领弹层关系绑定修正：`TournamentTeams.vue` 在显式 `tournamentTeamId/teamId` 不存在或不匹配时不再回退到列表中的其他球队；路由切换会清空旧邀请，忽略迟到的旧请求响应，并在旧请求结束后重试新参赛关系，避免认领链接错配或丢失。`npm run build` 通过，`/admin/` 与 `TournamentTeams-pvYlQgRn.js` 均 HTTP 200，公网 chunk SHA-256 与本地一致（`929116A2B8D65E910E08A535EC6DA5FB34F741073562026DDEE5EC4D33F355F9`）。未做交互预览或真实认领写入，节点继续保持 `visual-review`。

2026-08-14 二维码环境参数修正：`generateMiniProgramCode`、`generateQRCode` 与遗留 `generateInviteCode` 只接受 `develop/trial/release`，未传或非法值统一默认生产 `release`；PC 赛事报名二维码不再隐式落到体验版。三个函数已通过 COS 更新并线上读回：`generateMiniProgramCode` 为 `Nodejs16.13 / index.main / Deployment completed / ModTime 2026-08-14 22:16:58`，`generateQRCode` 为 `Nodejs18.15 / index.main / Deployment completed / ModTime 2026-08-14 22:17:17`，`generateInviteCode` 为 `Nodejs16.13 / index.main / Deployment completed / ModTime 2026-08-14 22:23:45`；前两者无会话探针均返回 `AUTH_REQUIRED`，遗留函数不在 relay 白名单且无源码调用，未生成真实二维码或写入业务数据。本轮未新增画板节点，视觉待验收仍为 9 个。

2026-08-14 小程序登录与机构冲突衔接修正：`onboardingWorkspace.state` 仅采信有效机构/球队关系，`pending` 成员不会被误导向首页；`getMiniWorkspace` 多机构返回 `ORG_CONFLICT`，登录端不自动择一，且本地不再把个人 `_id` 当作 `orgId`。两个云函数已线上读回：`getMiniWorkspace` `ModTime 2026-08-14 21:15:25`、`onboardingWorkspace` `ModTime 2026-08-14 21:17:59`，运行时均为 `Nodejs18.15`、入口 `index.main`、状态 `Deployment completed`。无会话探针未产生业务写入；162/162 路由和素材包不变，视觉待验收仍为 9 个。

2026-08-14 家长 H5 完成提交关系校验补强：`completeParentProfile` 写球员状态前再次校验 active 邀请的 `playerId/teamId` 与当前球员关系；关系变化返回 `PARENT_INVITE_BROKEN`，不写入。`webLoginApi` 线上读回 `Nodejs18.15 / index.main / Deployment completed / ModTime 2026-08-14 21:26:40`，无会话探针为 `PARENT_AUTH_REQUIRED`；8 个 H5 节点视觉待验收仍不变。

2026-08-14 登录缓存边界补强：首页遇到 `ORG_CONFLICT` 时先清理旧工作空间缓存再展示核验提示，避免继续沿用上一次机构数据；不新增路由或视觉节点。

2026-08-14 PC 统一入口租户边界修正：`webLoginApi` 不再把自然人 `users._id` 当作机构 `orgId`，唯一机构才自动回写，多机构进入 `ORG_CONFLICT`，无机构写操作返回 `ORG_REQUIRED`；机构引导仍可创建新机构。线上函数读回 `Nodejs18.15 / index.main / Active / Available / ModTime 2026-08-14 20:59:55`，无会话探针为 `AUTH_REQUIRED`。本次为既有入口行为修正，不新增画板节点；162/162 路由和素材包不变，视觉待验收仍为 9 个。

2026-08-14 小程序工作空间机构边界修正：`getMiniWorkspace` 取消个人 `_id` 机构兜底和 pending 成员授权，只展示经过真实 `organizations` 校验的机构工作空间；无机构账号继续保留明确球队关系的临时空间，未确认成员不再获得机构级读取权限。函数线上读回 `Nodejs18.15 / index.main / Active / Available / ModTime 2026-08-14 21:08:01`，无微信会话返回 `WORKSPACE_LOAD_FAILED`。本次为既有工作空间行为修正，不新增画板节点；162/162 路由和素材包不变，视觉待验收仍为 9 个。

2026-08-14 竞赛组别正式定版边界补齐：`webLoginApi` 已将 `divisions` 纳入机构范围 relay，并新增 `confirmDivisionRules` 服务端定版动作；浏览器不能直接写入 `rulesLocked`、`ruleFinalized`、`rulesVersion` 等锁定字段。专业模式只有显式有效权益状态才允许定版，未写死价格、支付渠道或试用规则。线上函数读回 `Nodejs18.15 / index.main / Active / Available / ModTime 2026-08-14 23:50:09`；无会话 `divisions.list` 与 `confirmDivisionRules` 探针均返回 HTTP 200 + `AUTH_REQUIRED`。PC `npm run build` 通过，`cloud-Ddg09aof.js` 与 `DivisionRulesWizard-BgzBTgRq.js` 公网字节分别与本地 SHA-256 一致（`1B5D1F81617295F0692FA65079F381A735B94215A61BFC477EF93EA169FE57F0`、`2968FE99D145FD6AA52EE5A76006F9B73EBDCC24F997508B797A0671DC565912`），`/admin/` HTTP 200。未使用真实机构、赛事或支付数据；9 个视觉节点继续保持 `visual-review`。

2026-08-15 最终竞赛方案确认链路补齐：`confirmCompetitionPlan` 由 `webLoginApi` 服务端校验组别规则定版、已确认参赛球队、抽签/分组完整、赛程时间场地完整且无冲突，服务端保存规则/参赛关系/抽签/赛程紧凑快照后锁定方案并返回正式比赛管理路由；锁定后通用赛程、抽签和参赛关系写入口拒绝直接修改。PC 赛事控制台增加“确认方案”入口，比赛管理快捷入口改为 `/tournaments/:id/matches`。线上函数读回 `Nodejs18.15 / index.main / Active / Available / ModTime 2026-08-15 00:06:33`；无会话 `confirmCompetitionPlan` 探针返回 HTTP 200 + `AUTH_REQUIRED`。PC `npm run build` 通过，`cloud-ZSnvx-n_.js` 与 `TournamentConsole-CZSw21u3.js` 公网字节分别与本地 SHA-256 一致（`D50B0DA23F80A5CE6A0F404E6BE9F250A6A080454EE0AFFD27880FABD23BA10D`、`BD446109219E8C89797890CE2F4A7FAF08A975F4A645E5B43735B3EE86B4E0E6`），`/admin/` HTTP 200。未使用真实机构、赛事或支付数据；9 个视觉节点继续保持 `visual-review`。

## 基线

- 画板：`E:\Documents\saixiaofeng_football\赛小蜂足球UI\赛小蜂足球UI\原型图2.0\全链路画板\2026-07-30-阶段版`
- 当前可解析节点位：162；横向链路：37；页面连接：125。
- 端类型：PC/入口 74，小程序 69，家长服务号 H5 8，裁判服务号 H5 9，跨端闭环 2。
- 页面完成门槛：`approved assets`、`visual-1:1`、`button-destination`、`flow-transition`、`build-verification`。
- 当前最终画板独立源图：162；162 个批准素材包、162 条正式路由均已登记。当前逐节点权威状态以 `tools/ui-delivery-inventory.js` 的最新输出为准，旧阶段统计不再作为交付依据。
- 全量节点台账由 `tools/ui-delivery-inventory.js` 从最终画板直接生成；运行 `node tools/ui-delivery-inventory.js --json` 可获取每个节点的源图、目标视口、素材包、正式路由、业务规则和五项验收状态，避免手工台账脱离画板。

## 状态定义

| 状态 | 含义 |
|---|---|
| `runtime-fix-live` | 2026-08-15 07:57:51 getMiniWorkspace deployed via COS; readback Nodejs18.15 / Deployment completed. No preview or real roster data access/write. |
| `runtime-fix` | 2026-08-15 07:51:13：`getMiniWorkspace.officialRosterForWorkspace` 不再引用正式名单读取链路中未定义的 `invite`；工作空间、球队、赛事和名单快照边界保持不变。`node --check`、162/162 静态门禁和 `git diff --check` 通过；随后已按需部署并读回生产状态，未预览。 |
| `asset-preparing` | 原图已定位，素材包未完成或未通过校验。 |
| `asset-approved` | 素材包已校验，允许修改正式页面。 |
| `implementing` | 真实路由、数据、权限与 UI 正在落地。 |
| `visual-review` | 已运行截图，等待或正在修复视觉差异。 |
| `accepted` | 五项门槛全部通过。 |
| `blocked` | 记录精确阻塞条件，不以占位页替代。 |

## 当前阶段

> 2026-08-13 增量：PC“抽签与分组-快速模式-分组结果.png”五项门槛已通过。最终 1672 × 941 截图为 `.tmp/pc-visual-qa/draw-quick-result-unconfirmed-final-v4.png`；按钮去向、当前组别/赛制确认范围、未保存与归档只读边界及构建均已验证，权威逐节点证据以 `tools/ui-delivery-inventory.js` 为准。
>
> 2026-08-13 增量：PC“抽签与分组-专业模式-抽签设置.png”五项门槛已通过。最终 1672 × 941 截图为 `.tmp/pc-visual-qa/professional-draw-setup-final-v3.png`；两个球队池入口均先保存当前 U16 专业草稿，容量/权限校验、确认/发布影响提示和 `step=pool` 去向已验证。
>
> 2026-08-13 增量：PC“抽签与分组-专业模式-球队池.png”五项门槛已通过。最终 1672 × 941 截图为 `.tmp/pc-visual-qa/professional-draw-pool-final-v5.png`；当前组别准入、8行分页、种子上限、规避关系保存、五项校验及进入 `step=screen` 的去向已验证。

### P0 · 素材与验收基础

| 页面 | 端 | 原图视口 | 素材包 | 正式入口 | 状态 |
|---|---|---:|---|---|---|
| PC 官网广告页 | PC | 1920 × 1080 | `00-PC官网广告页_assets` | `/` | `visual-review · 1920 × 1080 major-diff 已修正，公网入口已同步，待最终微差复核` |
| PC 登录后台 | PC | 1920 × 1080 | `01-PC登录后台_assets` | `/` 的微信登录覆盖层、`/admin/#/login` | `accepted · 目标视口、关闭转场、零 SDK 与 webLoginApi 链路已登记` |
| PC 赛事空间 | PC | 1586 × 992 | `赛事空间_assets` | `/admin/#/tournament-space` | `accepted · 1586 × 992 目标视口与创建赛事转场证据已登记` |
| PC 创建赛事·基础信息 | PC | 1586 × 992 | `赛事空间-创建赛事-基础信息_assets` | `/admin/#/tournaments/create` | `accepted · 1586 × 992 目标视口、创建转场与构建证据已登记` |
| PC 赛事主控制台 | PC | 1672 × 941 | `赛事主控制台_assets` | `/admin/#/tournaments/:id` | `accepted · 1672 × 941 目标视口、快捷入口转场与构建证据已登记` |
| PC 竞赛管理·组别总览 | PC | 1618 × 972 | `竞赛管理-组别管理-5个组别最终版_assets` | `/admin/#/tournaments/:id/competition` | `accepted · 1618 × 972 目标视口与规则转场证据已登记` |
| PC 专业抽签·球队池 | PC | 1672 × 941 | `抽签与分组-专业模式-球队池_assets` | `/admin/#/tournaments/:id/draw?mode=professional&step=pool` | `accepted · 1672 × 941 目标视口与受控进入证据已登记` |
| PC 专业抽签·大屏设置 | PC | 1672 × 941 | `抽签与分组-专业模式-大屏设置_assets` | `/admin/#/tournaments/:id/draw?mode=professional&step=screen` | `accepted · 1672 × 941 目标视口与保存转场证据已登记` |

### P1 · 统一入口与身份

以上 P1 统一入口与身份链路已完成落地并通过静态/线上回读；当前仅保留 1 个 PC 认领邀请节点与 8 个家长服务号 H5 节点的视觉复核，因当前任务禁止预览不得伪造 `visual-1:1` 证据。其余节点按最新 inventory 排除，不重复实施。

| 页面 | 端 | 原图视口 | 素材包 | 正式入口 | 状态 |
|---|---|---:|---|---|---|
| 微信登录 | 小程序 | 780 × 1688 | `01-微信登录_assets` | `/pages/login/login` | `accepted · 780 × 1688 目标视口证据已登记` |
| 首次使用引导 · 选择场景 / 管理球队选中 | 小程序 | 780 × 1688 | `01-选择业务场景_assets`、`01A-选择业务场景-管理球队_assets` | `/pages/onboarding/onboarding` | `accepted · 三个场景均已接通并完成目标视口证据` |
| 首次使用引导 · 管理球队最小资料 | 小程序 | 780 × 1688 | `02-完善最小资料_assets` | `/pages/onboarding/onboarding?step=team` | `accepted · 780 × 1688 目标视口证据已登记` |
| 首次使用引导 · 管理球队创建完成 | 小程序 | 780 × 1688 | `03-创建完成_assets` | `createTeam 成功后的 onboarding 成功状态` | `accepted · 780 × 1688 目标视口证据已登记` |
| 首次使用引导 · 举办赛事选中 / 最小资料 / 创建完成 | 小程序 | 780 × 1688 | `01B-选择业务场景-举办赛事_assets`、`04-举办赛事-完善资料_assets`、`05-举办赛事-创建完成_assets` | `/pages/onboarding/onboarding` 的 event 状态流 | `accepted · event 三态目标视口证据已登记` |
| 首次使用引导 · 青训未开户服务说明 | 小程序 | 780 × 1688 | `06-青训教务-服务说明-未开户_assets` | `/pages/onboarding/onboarding` 的 training inactive 状态 | `accepted · 780 × 1688 目标视口证据已登记` |
| 首次使用引导 · 青训已开户服务说明 | 小程序 | 780 × 1688 | `07-青训教务-服务说明-已开户_assets` | `/pages/onboarding/onboarding` 的 training active 状态 | `accepted · 780 × 1688 目标视口证据已登记` |
| 首次使用引导 · 青训完善资料 / 创建完成 | 小程序 | 780 × 1688 | `08-青训教务-完善资料_assets`、`09-青训教务-创建完成_assets` | `/pages/onboarding/onboarding` 的 training profile/success 状态 | `accepted · training profile/success 目标视口证据已登记` |
| 首次使用引导 · 青训功能演示 | 小程序 | 780 × 1688 | `10-青训教务-功能演示_assets` | `/pages/onboarding/onboarding` 的只读 demo 状态 | `accepted · 780 × 1688 目标视口证据已登记` |
| 首页·赛事负责人身份 | 小程序 | 780 × 1688 | `01-首页-赛事主办场景_assets` | `/pages/home/home` | `accepted · 780 × 1688 目标视口证据已登记` |
| 首页·球队教练身份 | 小程序 | 780 × 1688 | `02-首页-球队协作场景_assets` | `/pages/home/home` | `accepted · 780 × 1688 目标视口证据已登记` |
| 首页·青训教练身份 | 小程序 | 780 × 1688 | `03-首页-青训经营场景_assets` | `/pages/home/home` | `accepted · 780 × 1688 目标视口证据已登记` |

### P2 · 主办方 PC 后台

| 页面 | 端 | 原图视口 | 素材包 | 正式入口 | 状态 |
|---|---|---:|---|---|---|
| 专业模式·U16 组赛果复核 | 主办方 PC | 1672 × 941 | `比赛管理-U16组-赛果复核_assets` | `/admin/#/tournaments/:id/matches/:matchId` | `accepted · 1672 × 941 目标视口、复核动作与构建证据已登记` |

### P4 · 服务号 H5

| 页面 | 端 | 原图视口 | 素材包 | 正式入口 | 状态 |
|---|---|---:|---|---|---|
| 专业版·我的比赛任务 | 裁判服务号 H5 | 862 × 1825 | `02-专业版我的比赛任务_assets` | 服务号 OAuth 完成后的裁判工作台首页 | `accepted · 852 × 1846 目标视口证据已登记` |
| 专业版·比赛报到与到场确认 | 裁判服务号 H5 | 862 × 1825 | `03-专业版比赛报到与到场确认_assets` | 我的比赛任务 → 指派场次 | `accepted · 852 × 1846 目标视口证据已登记` |
| 专业版·双方阵容与身份核验 | 裁判服务号 H5 | 862 × 1825 | `04-专业版双方阵容与身份核验_assets` | 赛前确认完成 → 阵容核验 | `accepted · 852 × 1846 目标视口证据已登记` |
| 专业版·实时比分与事件记录 | 裁判服务号 H5 | 862 × 1825 | `05-专业版实时比分与事件记录_assets` | 阵容核验锁定 → 现场记录 | `accepted · 852 × 1846 目标视口证据已登记` |
| 专业版·裁判报告 | 裁判服务号 H5 | 864 × 1821 | `06-专业版裁判报告_assets` | 比赛结束 → 报告草稿 | `accepted · 852 × 1846 目标视口证据已登记` |
| 专业版·电子记录确认与签字 | 裁判服务号 H5 | 878 × 1792 | `07-专业版电子记录确认与签字_assets` | 报告保存 → 电子记录确认 | `accepted · 852 × 1846 目标视口证据已登记` |
| 专业版·提交成功 | 裁判服务号 H5 | 877 × 1793 | `08-专业版提交成功_assets` | 签字提交 → 待主办方复核 | `accepted · 852 × 1846 目标视口证据已登记` |
| 专业版·退回修正与重新签字 | 裁判服务号 H5 | 862 × 1825 | `09-专业版退回修正与重新签字_assets` | 主办方退回 → 限范围修正 → 重新签字 | `accepted · 852 × 1846 目标视口证据已登记` |

### P1 · 我的、消息、身份切换与受限访问（增量）

| 页面 | 端 | 原图视口 | 素材包 | 正式入口 | 状态 |
|---|---|---:|---|---|---|
| 我的 | 小程序 | 780 × 1688 | `01-我的_assets` | `/pages/profile/profile` | `accepted · 780 × 1688 目标视口证据已登记` |
| 消息中心 | 小程序 | 780 × 1688 | `02-消息中心_assets` | `/pages/messages/index` | `accepted · 780 × 1688 目标视口证据已登记` |
| 切换身份 | 小程序 | 780 × 1688 | `03-切换身份_assets` | `/pages/profile/profile` 身份弹层 | `accepted · 780 × 1688 目标视口证据已登记` |
| 工作空间访问受限 | 小程序 | 780 × 1688 | `05-工作空间访问受限_assets` | `/pages/workspace/restricted/restricted?orgId=:orgId` | `accepted · 780 × 1688 目标视口、受限申请链路与云函数证据已登记` |

### P3 · 球队与赛事小程序（增量）

| 页面 | 端 | 原图视口 | 素材包 | 正式入口 | 状态 |
|---|---|---:|---|---|---|
| 球队中心 | 小程序 | 780 × 1688 | `01-球队中心_assets` | `/pages/teams/index` | `accepted · 780 × 1688 目标视口证据已登记` |
| 无球队状态 | 小程序 | 780 × 1688 | `02-无球队状态_assets` | `/pages/teams/index` 空态 | `accepted · 780 × 1688 目标视口证据已登记` |
| 创建球队 | 小程序 | 780 × 1688 | `05-创建球队_assets` | `/pages/onboarding/onboarding?scene=team&step=team` | `accepted · 390 × 844 目标视口证据、受控创建与队徽链路已登记` |
| 球队详情 | 小程序 | 780 × 1688 | `06-球队详情_assets` | `/pages/team/team` | `accepted · 780 × 1688 目标视口证据已登记` |

## 每页证据

### 小程序自定义顶部安全区（已确认）

所有自定义导航小程序页面须以右上角微信胶囊为不可占用区域：标题置于左侧安全列，页面操作不得进入胶囊范围或紧贴其下方；iPhone 13 Pro 390 × 844 目标截图验收时，必须逐页确认胶囊未被遮挡、内容未重叠。

每个节点在实施前都要追加：原图路径、素材包路径及 validator 输出、正式路由、数据接口、权限边界、控件到达表、目标视口截图、差异项和构建结果。原型裁切与布局叠图只保存为验收参考，永不进入生产页面。

2026-08-14 专业版“生成球队邀请”节点已完成目标视口与回退视口验收：正式入口 `/admin/#/tournaments/:id/teams?divisionId=:divisionId&mode=professional&action=invite`，目标截图 `.tmp/pc-visual-qa/tournament-teams-professional-invite-final-v28.png`，回退截图 `.tmp/pc-visual-qa/tournament-teams-professional-invite-fallback-1440x900-v1.png`；“完成”返回证据 `.tmp/pc-visual-qa/tournament-teams-professional-invite-complete-destination-v2.png`。二维码由当前 `tournamentId/divisionId` 邀请路径生成，完成操作不写云端、不自动认领、不按队名合并。

2026-08-14 专业版“快速添加球队”节点已完成目标视口与回退视口验收：正式入口 `/admin/#/tournaments/:id/teams?divisionId=:divisionId&mode=professional&action=quick-add`，目标截图 `.tmp/pc-visual-qa/tournament-teams-professional-quick-add-final-v8.png`，回退截图 `.tmp/pc-visual-qa/tournament-teams-professional-quick-add-fallback-1440x900-v1.png`。取消保持隔离数据不变；保存只创建当前 U16 的 `pending_claim/invited` 档案与关系，未认领前不能进入名单、阵容或比赛执行，且不按队名自动合并。

2026-08-14 专业版“加入申请”节点已完成目标视口与回退视口验收：正式入口 `/admin/#/tournaments/:id/teams?divisionId=:divisionId&mode=professional&tab=pending`，目标截图 `.tmp/pc-visual-qa/tournament-teams-professional-applications-final-v3.png`，回退截图 `.tmp/pc-visual-qa/tournament-teams-professional-applications-fallback-1440x900-v1.png`。查看保留赛事/组别；批量通过跳过疑似同名关系，审批不自动认领、不生成赛事名单、不授予长期球队所有权，拒绝不删除球队档案或自然人账号。

2026-08-14 专业版“查看球队”节点已完成目标视口与回退视口验收：正式入口 `/admin/#/teams/:teamId?fromTournament=:tournamentId&divisionId=:divisionId&mode=professional`，目标截图 `.tmp/pc-visual-qa/tournament-team-detail-professional-final-v2.png`，回退截图 `.tmp/pc-visual-qa/tournament-team-detail-professional-fallback-1440x900-v1.png`。返回和名单入口均保留赛事/U16 上下文；赛事通知仅针对当前参赛关系，不读取俱乐部训练、财务等私有数据，不写云端。

2026-08-14 专业版“查看参赛名单”节点已完成目标视口与回退视口验收：正式入口 `/admin/#/tournaments/:id/teams/:teamId/roster?divisionId=:divisionId&mode=professional`，目标截图 `.tmp/pc-visual-qa/professional-roster-view-final-v5.png`，回退截图 `.tmp/pc-visual-qa/professional-roster-view-fallback-1440x900-v2.png`。23 人锁定快照、名单要求、筛选与状态表均完整入屏；名单异常和名单变更真实跳转均保留当前赛事/U16 上下文。正式数据来自赛事名单快照，资料纠错仅提交受控申请，不覆盖球队日常球员库。
2026-08-14 专业版“球员管理”节点已按独立正式入口 `/admin/#/tournaments/:id/teams/:teamId/players?divisionId=:divisionId&mode=professional` 完成验收，没有退回已验收的 roster URL。目标截图 `.tmp/pc-visual-qa/professional-team-players-final-v2.png`，回退截图 `.tmp/pc-visual-qa/professional-team-players-fallback-1440x900-v1.png`；真实查看进入携带赛事、组别和球队范围的球员详情，纠错入口已修复并打开 `.tmp/pc-visual-qa/professional-team-players-correction-dialog-final-v11.png` 所示受控申请，不直接改写长期球员资料。

2026-08-14 专业版“发送认领提醒”节点已完成正式代码收敛与构建，但因当前任务明确禁止预览，状态保持 `visual-review`。正式入口 `/admin/#/tournaments/:id/teams?divisionId=:divisionId&mode=professional&action=claim-invite&tournamentTeamId=:tournamentTeamId`；弹层按 approved 原图重建球队摘要、参赛编号、掩码联系人、上次分享、链接/扫码两种交接、有效期、真实小程序码和取消/下载/复制动作。认领邀请由受机构/赛事/参赛关系校验的 `organizerClaimInvite` 创建或复用 `team_invitations`，小程序落地使用 `inviteId`；PC 不向指定微信发卡、不确认认领、不按名称合并。`web-admin-vue npm run build` 已通过；目标 1672 × 941 与回退 1440 × 900 截图、真实点击证据待允许预览后补齐，当前不得标记 accepted。

2026-08-14 家长服务号 H5“家长进入－匹配孩子”已完成正式代码收敛，状态保持 `visual-review`。正式入口 `/service-account-h5/?parentInvite=:token`；页面按 approved 852 × 1846 原图重建 1/5 头部、隐私说明、脱敏验证手机号、唯一孩子卡、确认入口、未匹配处理和入口限制。正式链路仍为 `previewParentProfileInvite → parentProfileOAuthUrl → parentProfileOAuth → parentSessionToken`，无效、过期或关联断裂的邀请停止流程；页面不能搜索其他球员、查看整队名单或取得球队管理权限。原型“登记孩子”因缺少受控后端且不符合唯一邀请规则，明确改为联系球队负责人核对。H5 JS 语法、CSS 结构、零 SDK 和静态链路检查通过；当前任务禁止预览，因此没有生成 852 × 1846 目标截图、回退截图或真实点击证据，不得标记 accepted。

2026-08-14 家长服务号 H5“确认基础资料”已完成本地正式实现，状态保持 `visual-review`。页面按 approved 853 × 1844 原图重建 2/5 头部、球员基础信息、受控更正区、父亲/母亲/其他监护关系、脱敏验证手机号、授权确认、人工核验提示和双底部动作。`webLoginApi.saveParentBasicProfile` 本地代码新增 `guardianRelation` 草稿字段；姓名/生日一致才进入实名，不一致继续人工核验，且不覆盖球队长期资料、赛事名单、阵容或历史快照。H5 与云函数语法、CSS 结构、零 SDK 检查通过；云函数未部署，目标/回退截图和真实点击也因当前任务禁止部署、预览而未执行，当前不能标记 accepted 或线上完成。

2026-08-14 家长服务号 H5“上传身份证实名”已完成本地正式实现，状态保持 `visual-review`。页面按 approved 853 × 1844 原图重建 3/5 头部、仅人像面说明、代码绘制证件示意、上传状态、拍摄/相册双入口、三项拍摄要求、隐私安全说明及禁用/上传/失败动作。正式入口仍在当前 `parentInvite` 的家长会话内；仅 `basicConfirmed=true` 且已确认监护授权的会话可以上传。原页面与服务端错误强制身份证正反两面，现按批准原型统一为球员本人身份证人像面一张；浏览器仅接受 JPG/PNG、3 MB 以内文件，内容只短暂驻留当前页面内存，上传后清空，不生成本地预览或公开链接。服务端受限保存文件引用、SHA-256 摘要、大小、类型和审核状态，不保存身份证号明文，也不通过球队/裁判页面暴露原图。H5 与云函数语法、CSS 563/563 花括号配对、零 SDK 及 162/162 UI delivery gate 通过；云函数未部署，且当前任务禁止预览，所以没有目标/回退截图、真实点击或真实证件上传证据，不得标记 accepted 或线上完成。

2026-08-14 家长服务号 H5“实名认证结果”已完成本地正式实现，状态保持 `visual-review`。页面按 approved 853 × 1844 原图重建 3/5 结果头部、代码绘制状态盾牌、通过/待审核/退回/未提交四种状态、脱敏认证信息、受限证件占位、复用说明、审核时间和分支动作。正式结果接口只返回当前家长会话绑定邀请的姓名、球队、脱敏证件号、核验生日、性别、资格文字、审核时间与受限保存状态，不返回证件原图、缩略图、documentIds、fileId、Base64 或身份证号明文。待审核只能刷新，退回只能按原因重传，只有通过才能进入标准形象照；“信息有误”只创建幂等的独立人工核对申请，不能修改审核结论，也不覆盖球员、名单、阵容或历史快照。H5 与云函数语法、CSS 628/628 花括号配对、零 SDK、客户端敏感字段及 162/162 UI delivery gate 检查通过；云函数未部署，当前任务又禁止预览，因此没有目标/回退截图、真实点击或云端写入证据，不得标记 accepted 或线上完成。

2026-08-14 家长服务号 H5“标准形象照拍摄指引”已完成本地正式实现，状态保持 `visual-review`。页面按 approved 853 × 1844 原图重建 4/5 头部、标准示例代码示意、四项拍摄要求、距离过近/头像裁切/光线太暗三类错误示意、球衣建议、系统去背景说明以及拍摄/相册双入口。批准素材包明确示例人物不作为生产素材，因此正式页没有引用原型儿童图片或裁片；相机与相册均进入受控取景页，上传前校验 JPG/PNG 和 3 MB，上传失败可重试，服务端仍强制实名已通过。原图和透明派生图走受限存储，不公开、不覆盖历史头像或赛事快照。H5 语法、CSS 701/701 花括号配对、照片校验、零 SDK 和 162/162 UI delivery gate 通过；未使用真实照片、未部署、未预览、未产生云端写入或点击证据，当前不得标记 accepted 或线上完成。

2026-08-14 家长服务号 H5“标准形象照取景框”已完成本地正式实现，状态保持 `visual-review`。页面按 approved 853 × 1844 原图重建深色相机壳、返回/静音/帮助/翻转控制、单人轮廓取景区、四角框、距离/光线/清晰度/姿势四项质量状态、质量提示、缩略图/快门/翻转控制和受限隐私说明。批准素材包明确取景框和提示由代码渲染，正式页没有使用原型人物截图或真实儿童照片；相机和相册均校验 JPG/PNG、3 MB，并调用实名通过门禁的 `uploadAndProcessParentPortrait`，处理失败留在原页重拍，成功进入透明效果确认。原图与透明派生图均受限保存，不公开、不覆盖历史头像或赛事快照。H5 与云函数语法、CSS 767/767 花括号配对、照片校验、零 SDK 和 162/162 UI delivery gate 通过；未部署、未预览、未产生真实照片上传或云端写入证据，当前不得标记 accepted 或线上完成。

2026-08-14 家长服务号 H5“人像分割与效果确认”已完成本地正式实现，状态保持 `visual-review`。页面按 approved 851 × 1849 原图重建 5/5 头部、分割完成状态、标准形象照预览、球员头像裁切、缩放/拖动/恢复默认、圆形/方形头像预览、确认两张照片和重新拍摄动作。正式页只接受服务端返回并通过 `data:image/png;base64` 白名单校验的透明派生图；没有真实处理结果时使用非人物占位，不使用原型儿童图或伪造透明人物。确认前服务端再次校验当前家长会话、实名通过状态、portraitId 归属及版本，重拍新增版本，旧记录仅保留受限审计状态，确认后才允许提交家长资料。H5 与云函数语法、CSS 结构、零 SDK、预览 URL 安全校验和 162/162 UI delivery gate 通过；版本化处理规则未部署，当前任务又禁止预览，所以没有目标/回退截图、真实照片处理或云端写入证据，不得标记 accepted 或线上完成。

2026-08-14 家长服务号 H5“资料提交成功”已完成本地正式实现，状态保持 `visual-review`。页面按 approved 852 × 1846 原图重建深绿球场头部、资料提交成功勾选、四项资料完成清单、标准形象照/球员头像受限预览、家长已提交—球队负责人确认—进入正式参赛名单状态轨迹、两条赛事范围说明和“完成并关闭/查看已提交资料”动作。正式页只消费 `completeParentProfile` 返回的公开球员/球队摘要与当前页面内通过 `data:image/png;base64` 白名单的透明图；没有真实处理结果时使用非人物占位，不使用原型儿童图或伪造头像。状态明确为已提交、待球队负责人确认，未把提交误报为正式名单生效；实名原件、原图、fileId、赛事名单和历史快照不进入浏览器展示范围。H5 与云函数语法、CSS 916/916 花括号配对、零 SDK、客户端敏感字段扫描、结果 URL 白名单和 162/162 UI delivery gate 通过；完成接口的公开摘要改动未部署，当前任务又禁止预览，因此没有目标/回退截图、真实照片处理或云端写入证据，不得标记 accepted 或线上完成。

## 素材规则

- 有真实场景、纹理或科技氛围背景的区域，优先采用无文字、无水印、无 UI 的 Image2 候选，候选先进入原图旁素材包的 `07-generated/`。
- 常规图标先查共享图标库；缺失时下载 Iconfont 的可追溯 SVG，保存详情 URL、图标 ID、作者/项目、许可和 canonical SVG。
- 队徽默认透明、无外框；上传必须走共享裁剪与透明抠图流程，保留原图和确认的 alpha 派生图。

2026-08-14 online validation: the service-account H5 package was uploaded to `/service-account-h5/`; public HTTP GET checks returned `200` for the entry, `index.html`, and `app.js`. The existing `/referee/` path was not overwritten. The read-only `webLoginApi` health check returned HTTP `200` with `AUTH_REQUIRED`. Cloud function code update was attempted but stopped during CloudBase CLI packaging, so the backend change is not claimed as live. No commit or push was performed.

2026-08-14 PC 认领邀请线上验证补记：web-admin-vue/dist 已上传至固定 /admin/，/admin/ 与 /admin/index.html 公网读取均为 HTTP 200。认领邀请仍按赛事/组别关系作用域和 hash 路由进入；未执行预览或真实认领写入，因此节点继续保持 visual-review，不标记 accepted。

2026-08-14 PC 认领邀请链路修正：发现旧实现把 `tournament_teams` 关系 ID 直接拼成 `prebuilt-invite` 参数，而小程序正式入口只接受 `team_invitations._id`。现已新增 `organizerClaimInvite`，由网页会话服务端校验当前机构与赛事归属、组别和参赛关系后幂等创建/复用 `prebuilt_tournament_team` 邀请，生成真实小程序码并回写 `claimInviteId/lastInviteTime`；PC 复制路径改为 `/pages/team/prebuilt-invite/prebuilt-invite?inviteId=:inviteId`。云函数已线上读回 `Nodejs18.15 / Deployment completed`，无会话调用 `webLoginApi` 返回 `HTTP 200 + AUTH_REQUIRED`；本次 `/admin/` 上传 191 个文件成功，公网认领 JS/CSS 均 HTTP 200 且与本地构建 SHA-256 一致。未执行真实机构会话、认领写入或预览，故仍不标记视觉验收。


2026-08-14 线上验证更正：自定义域名 `saixiaofeng.com` 已映射到同一 CloudBase Hosting 环境，根站、`/admin/`、`/service-account-h5/` 与保留的 `/referee/` 公网读取均返回 HTTP 200。`webLoginApi` 的运行时/入口/超时配置更新为 Nodejs18.15、`index.main`、20 秒，但代码更新仍停在 CloudBase CLI 打包阶段并已停止；`getParentProfileDraft`、`checkParentProfileSession`、`completeParentProfile` 的无会话探针仍返回“未知操作”，因此家长后端代码尚未线上生效，不得标记线上完成。未提交、未推送。


2026-08-14 线上验证完成更正：webLoginApi 已通过项目临时函数配置和 COS 代码上传成功更新，CloudBase 函数列表读回 Nodejs18.15、Deployment completed、修改时间 2026-08-14 16:45:30。固定入口对 getParentProfileDraft、checkParentProfileSession、completeParentProfile 的无会话探针均返回 HTTP 200 + PARENT_AUTH_REQUIRED，不再返回“未知操作”，证明家长后端代码已经线上生效；真实家长会话、实名材料和照片处理仍未执行。自定义域名 saixiaofeng.com 继续提供同一 Hosting 环境。未提交、未推送。

2026-08-14 PC 机构工作空间引导补齐：这是现有“微信登录 → 赛事空间”已验收链路的行为延伸，没有新增画板节点或替换已批准素材。正式入口 `/admin/#/organization-onboarding`；页面先让用户选择赛事主办方或青训机构，再按后端资格进入最小创建或咨询状态；直接访问空机构的 `/tournament-space` 也会回到该引导，不再停留在空白赛事空间。已有业务关系不自动创建第二机构；青训开通资格只由 `onboardingWorkspace` 后端状态决定。`npm run build`、两个云函数 `node --check`、UI delivery 162/162 与静态门禁通过；`onboardingWorkspace`、`webLoginApi` 已部署并读回 `Deployment completed`，最终公网资源 `/admin/assets/OrganizationOnboarding-BuAhaRba.js` 与对应 CSS 返回 HTTP 200。由于本轮没有新增原型源图，未把行为延伸误记为新的 1:1 visual-review 节点。

2026-08-14 家长 H5 线上鉴权补验：沿用已批准“家长进入－匹配孩子”及后续 2/5–5/5 资产包，未新增画板节点。公网静态 `app.js` 与本地正式源文件 SHA-256 一致；10 个家长会话保护动作均已线上读回 `HTTP 200 + PARENT_AUTH_REQUIRED`，证明 `webLoginApi` 的家长链路代码和会话门禁已生效。没有真实家长会话、证件、人像或云端业务写入，因此仍保持 `visual-review`，不标记 `visual-1:1` 或 `accepted`。

2026-08-14 小程序“工作空间访问受限”正式链路补齐：`workspaceAccess` 与 `getMiniWorkspace` 已部署并读回 `Nodejs18.15 / Deployment completed`。`getMiniWorkspace` 现在对指定 `org:<orgId>` 严格校验，找不到授权工作空间时返回无权错误，不再静默切换到第一个可用机构；`miniprogram/utils/workspace.js` 捕获该错误后自动进入 `/pages/workspace/restricted/restricted?orgId=:orgId`，受限页使用 `workspaceAccess` 读取成员状态并提交当前机构访问申请，获得授权后按原机构 ID 回载首页。云函数无会话探针分别返回 `登录状态已失效` 与 `WORKSPACE_LOAD_FAILED`，未写入业务数据；WXML/JS 静态检查通过。后续 inventory 复核确认已有 `.tmp/mini-visual-qa/workspace-restricted-iphone13pro-100-v1.png` 目标视口证据，表格状态同步为 `accepted`，不再保留旧的 visual-capture-pending 判断。

2026-08-14 根站线上同步校正：本地正式 `index.html` 与 `https://saixiaofeng.com/` 公网内容此前存在差异，已重新上传根入口和 `logo-saixiaofeng.png`；当前本地/公网 SHA-256 完全一致，根站与 logo 均返回 HTTP 200。官网节点继续保持 `visual-review`，登录后台节点按已有目标视口与关闭转场证据标记 `accepted`。

2026-08-14 台账冲突更正：`tools/ui-delivery-inventory.js` 的最新重复证据条目已将“创建球队”标记为 `visual-accepted`，证据为 `.tmp/mini-visual-qa/team-create-final-v5.png`（390 × 844 目标逻辑视口）及静态交付门禁；本表状态同步为 `accepted`，不再把该节点列为待补齐字段。

2026-08-14 家长 H5 后端线上闭环补记（以本条最新读回为准，替代此前较早的函数时间记录）：在前述静态包已上传且公网 `app.js` 与本地 `service-account-h5/app.js` SHA-256 一致的基础上，现已通过临时最小函数配置将正式 `cloudfunctions/webLoginApi/index.js` 部署到固定 CloudBase 环境。函数列表读回 `webLoginApi` 为 Nodejs18.15、`index.main`、修改时间 2026-08-14 19:07:27、`Deployment completed`；`previewParentProfileInvite` 的无效邀请探针返回 HTTP 200 + `PARENT_INVITE_INVALID`，10 个受保护家长动作均返回 HTTP 200 + `PARENT_AUTH_REQUIRED`，未再出现未知操作。未使用真实家长会话、证件、人像或业务写入；8 个 H5 节点仍保持 `visual-review`，等待允许预览后再做目标/回退视口验收。

2026-08-14 小程序消息中心正式通知链路补齐：消息中心视觉节点已有批准目标截图并保持 `visual-accepted`，本轮只补行为，不重开视觉验收。`cloudfunctions/getMiniWorkspace/index.js` 现已在服务端完成名单提交、名单退回、比赛阵容提交和比赛阵容退回后的通知写入；通知按当前 `orgId`、组织成员 `event.manage` 或球队成员关系定向写入 `messages`，保留去重键、分类、受控 `/pages/` 深链和未读状态，现有 `messages` / `message_receipts` 读取与已读动作继续复用同一工作空间边界。组织成员查询兼容 `orgId` 与 `organizationId` 字段；当受众查询失败或为空时不降级为机构广播，通知写入失败不会回滚核心业务动作。函数已部署并读回 `Nodejs18.15 / Deployment completed`，修改时间 `2026-08-14 19:23:26`；仅执行语法、台账和部署状态验证，未使用真实机构会话、验收夹具或业务写入，未启动预览。

2026-08-14 球队赛事数据包机构边界修正：复核 `getMiniWorkspace` 时发现数据包申请和导出仍使用兼容字段 `users.orgId` 写入请求记录，账号旧机构字段过期时会与当前工作空间不一致。现改为在受权限工作空间校验后重新读取当前 `workspaceId` 的 `orgId`，`requestTeamDataPackage` 与 `requestTeamDataExport` 均只写入该机构边界；数据包读取也要求同一 `orgId`，未改变专业版/简易版权益判断、数据包状态或赛事数据只读规则。函数重新部署并读回 `Nodejs18.15 / Deployment completed`，修改时间 `2026-08-14 19:30:55`；未使用真实机构会话、未创建数据包/导出请求、未启动预览。

2026-08-14 球队成员邀请落地修正：复核已验收的“球队成员”节点时发现 `createTeamMemberInvite` 返回的 `/pages/team/member-invite/member-invite` 未登记在小程序 `app.json`，分享后会落到不存在的页面。现改为使用已登记且已有批准素材包的 `/pages/team/members/members?teamId=:teamId&memberInviteId=:inviteId`，新增 `teamMemberInvite` 预览和 `acceptTeamMemberInvite` 明确确认动作；邀请记录写入当前工作空间 `orgId`、成员角色、七天有效期，接收后建立 `team_memberships` 关系并回写处理人，不按手机号、名称自动绑定。默认球队成员视觉节点保持原验收状态，本次是行为补齐，不新增视觉节点；`getMiniWorkspace` 已部署并读回 `Nodejs18.15 / Deployment completed`，修改时间 `2026-08-14 19:43:50`。未创建真实邀请、未接受邀请、未预览、未提交、未推送。

2026-08-14 球员编辑与小程序路由收敛：路由审计发现赛事详情、球队详情和旧球员详情仍有入口指向未登记的 `/pages/match/*`、`/pages/player-add/player-add`、`/pages/team-detail/team-detail`、`/pages/team/player-edit/player-edit` 等路径，已统一收敛到 `app.json` 中现有的赛事创建/详情、球队详情、球队球员库和 `team/player-add` 页面；卡片预览与比赛分享页也补登记到 `app.json`，全量页面引用审计不再有缺失路径。复用已验收的“三字段添加球员”页面增加 `mode=edit`：后端新增 `teamPlayerEdit` 受限读取，`saveTeamPlayer` 在 `playerId` 存在时只更新当前工作空间/球队下的姓名、出生日期和监护人电话，并排除自身做重复核验；不改赛事正式名单、单场阵容或历史快照。`getMiniWorkspace` 已部署并读回 `Nodejs18.15 / Deployment completed`，修改时间 `2026-08-14 19:56:50`；小程序 JS/WXML、云函数语法、路由与 UI delivery 静态门禁通过。未使用真实账号编辑球员、未预览、未提交、未推送。
2026-08-14 UI 交付门禁防回归：此前路由审计发现“源码页面存在但 `app.json` 未登记”的缺口，现已固化到 `tools/validate-ui-delivery.js`。门禁会解析主包/分包登记表，扫描小程序页面、工具和云函数返回的 `/pages/...` 深链，并校验每个已登记页面的 `.js/.wxml` 文件；当前读回为 72 个已登记小程序路由、0 个缺失、0 个页面文件缺口，`node tools/validate-ui-delivery.js` 与 `node --check` 均通过。该改动只加强静态质量门禁，不新增业务页面、不改变视觉节点，也不触发线上写入。

2026-08-14 专业版认领邀请租户边界修正：复核 `organizerClaimInvite` 时发现赛事归属校验之后，参赛关系和球队的 `orgId/organizationId` 仍未与当前网页会话机构再次比对，待复用邀请查询也未带 `organizerOrgId`。现已补齐两层同机构校验，并只在当前机构范围内复用待处理邀请；不匹配时阻断，不按名称或旧关系字段降级。`node --check cloudfunctions/organizerClaimInvite/index.js`、`git diff --check` 通过；函数已用固定 football 环境 COS 强制更新，读回 `Nodejs18.15 / Active`、`ModTime 2026-08-14 20:25:16`，无会话 `webLoginApi.callFunction(organizerClaimInvite)` 返回 HTTP 200 + `AUTH_REQUIRED`。未创建真实邀请、未执行认领写入、未预览；该节点继续保持 `visual-review`。

2026-08-14 小程序云函数引用门禁：`tools/validate-ui-delivery.js` 现在扫描小程序源码中的静态 `wx.cloud.callFunction/cloud.callFunction` 引用，并将不存在的函数作为门禁失败；当前唯一缺口为旧 `miniprogram/pages/match/share/share.js` 的 `generatePDF`，该页面不在 162 节点已批准画板范围，因此记录为明确的 legacy warning，不伪装成正式节点完成。当前门禁读回 162/162 节点、72 条小程序路由、0 个路由缺失、0 个页面文件缺口，正式门禁通过。

2026-08-14 专业版认领邀请环境修正：`organizerClaimInvite` 生成小程序码时不再隐式使用 `trial`；现在只接受 `develop/trial/release`，非法或未传值统一使用生产 `release`，避免主办方线上分享误落到体验版。函数已通过 COS 更新并读回 `Nodejs18.15 / Active`、`ModTime 2026-08-14 20:32:28`；无会话鉴权探针继续返回 HTTP 200 + `AUTH_REQUIRED`。未生成真实小程序码、未写入邀请、未预览，认领节点仍保持 `visual-review`。

2026-08-14 PC 机构识别行为补齐：`onboardingWorkspace.state` 现在从用户机构字段、`organization_memberships`、球队成员关联球队及本人赛事关系收集机构候选；唯一机构自动识别，多机构只进入人工核验，不静默选第一条。`OrganizationOnboarding.vue` 兼容 `organization.id` 与 `organization._id`，修正既有“登录后机构提示/赛事空间”行为，不新增画板节点。云函数线上读回 `Nodejs18.15 / Active / ModTime 2026-08-14 20:45:41`；`/admin/` 静态包已同步，机构引导 chunk 公网 HTTP 200 且 SHA-256 与本地一致。无会话探针返回 `AUTH_REQUIRED`，未使用真实机构会话、未预览，未提交、未推送。
2026-08-14 网页通用 `dbQuery` 租户边界补强：球队、赛事、裁判和长期球员库不再用 `creatorId/ownerId` 替代当前机构；球员、教练、比赛等派生数据只通过当前机构球队或明确赛事/比赛授权关系访问。`orgId`、`organizationId`、`organization_id` 兼容读取，字段冲突时拒绝访问；`webLoginApi` 已更新并线上读回 `Nodejs18.15 / modifyTime 2026-08-14 21:36:54 / Deployment completed`，无会话 `dbQuery` 探针为 `AUTH_REQUIRED`。本轮未新增原型节点，162/162 素材包与 9 个视觉待验收节点状态不变。
2026-08-14 网页图片上传入口安全边界补齐：`webLoginApi.uploadImage` 与 `uploadToCosDirect` 现在要求有效网页 `authToken`，并限制目录/文件名格式及单文件 8MB 上限；线上函数读回 `Nodejs18.15 / modifyTime 2026-08-14 21:45:24 / Deployment completed`，无会话两个上传探针均返回 `AUTH_REQUIRED`，临时探针对象已删除并读回不存在。本轮未新增原型节点，162/162 素材包与 9 个视觉待验收节点状态不变。
2026-08-14 旧赛事中心 relay 收口：`getTeams/getPlayers/getTournaments` 读取统一转入受保护 `dbQuery`，球队/球员增删改和强制删除球队统一校验当前机构；9 个遗留函数的无会话 `callFunction` 探针均返回 `AUTH_REQUIRED`。线上 `webLoginApi` 读回 `Nodejs18.15 / modifyTime 2026-08-14 21:52:10 / Deployment completed`，本轮未新增原型节点，视觉待验收仍为 9 个。

2026-08-14 通用函数中转权限收口：`generatePlayerCard`、`generateQRCode`、`removeImageBg`、`baiduRemoveBg` 现在统一要求有效网页会话；4 个无会话 `callFunction` 探针均返回 `AUTH_REQUIRED`，线上 `webLoginApi` 读回 `Nodejs18.15 / modifyTime 2026-08-14 21:58:11 / Deployment completed`。本轮未新增原型节点，162/162 素材包与 9 个视觉待验收节点状态不变。

2026-08-14 网页端高风险 relay 统一收口：规程 AI 解析、裁判签名、比赛阵容、赛事报名/审核和“我的球队”等 9 个中转入口现在统一要求有效网页会话；`parseTournamentRegulations` 已由独立函数地址切回 `webLoginApi` relay。9 个无会话探针均返回 `AUTH_REQUIRED`，线上函数读回 `Nodejs18.15 / modifyTime 2026-08-14 22:06:09 / Deployment completed`。`/admin/` 静态包 191 个文件上传成功，入口 HTTP 200，线上 cloud chunk 读回 relay 映射。本轮未新增原型节点，视觉待验收仍为 9 个。

2026-08-14 正式域名线上读回：`https://saixiaofeng.com/`、`/admin/` 及本轮更新的 cloud relay chunk 均返回 `HTTP 200`；未打开交互预览，视觉待验收状态不变。

2026-08-14 公开轮播读取运行时修正：`getBanners` 改用 `DYNAMIC_CURRENT_ENV` 初始化，保留 inactive 过滤和图片字段兼容；线上读回 `Nodejs16.13 / modifyTime 2026-08-14 22:12:46 / Deployment completed`，无会话 relay 返回 2 条启用数据。本轮未新增原型节点，视觉待验收仍为 9 个。
2026-08-14 名单变更审核安全收口：`reviewRosterChange` 统一走 `webLoginApi.callFunction`，要求有效网页会话与当前机构；服务端校验赛事 `orgId`、报名关系和可信审核人，不接受浏览器伪造的 `reviewerId/reviewerName`。`reviewRosterChange` 与 `webLoginApi` 已线上读回 `Nodejs18.15 / index.main / Deployment completed`（ModTime 分别 23:32:45、23:32:27）；无会话探针返回 HTTP 200 + `AUTH_REQUIRED`。PC 构建通过，`cloud-cCe_I_Am.js` 公网与本地 SHA-256 一致（`46C8465C20BC2E7863E4BFCFB11DA33C380A07E839ABCF623EE36B150289FC3A`），`/admin/` HTTP 200。未写入真实名单数据，9 个视觉节点继续保持 `visual-review`。
2026-08-15 02:58:08 认领冲突审核工作台正式落地并上线：新增 `/admin/#/tournaments/:id/claim-reviews`，主办方按当前机构查看冲突请求、开始核验、要求补材料、通过或不通过；审核通过只解锁受邀人后续确认，不自动合并球队或覆盖长期资料。`organizerClaimInvite` 与 `getMiniWorkspace` 已部署并读回 `Nodejs18.15 / Deployment completed`；无会话探针返回登录失效/`WORKSPACE_LOAD_FAILED`。PC 构建通过，`/admin/` 上传 193 个文件，新审核页 JS/CSS 公网 HTTP 200。证明材料上传、小程序正式上传发布、9 个视觉节点和通知模板配置仍待完成；未提交、未推送、未预览。
2026-08-15 03:23:04 认领冲突证明材料上传闭环正式落地并上线：小程序冲突页按材料类型上传最多 3 张图片，服务端校验当前邀请专属 `claim-review-proofs/<inviteId>/` 路径、材料类型/数量/大小并要求至少一项；主办方审核工作台增加“查看证明材料”，只在当前机构权限内生成临时查看链接，不公开文件 ID，不自动改变球队所有权。`getMiniWorkspace` 与 `organizerClaimInvite` 线上读回 `Deployment completed / Nodejs18.15`；无会话探针返回登录失效/`WORKSPACE_LOAD_FAILED`。PC 构建通过，`/admin/` 上传 193 个文件，审核页 JS/CSS 公网 HTTP 200。未使用真实证明文件；小程序正式发布、9 个视觉节点和通知模板配置仍待完成；未提交、未推送、未预览。

2026-08-15 03:39:06 小程序开发者版本上传门禁通过：首次上传因主包 14,337KB 超限被拒，已把运行时背景改为压缩 JPEG、品牌图标改为 128px 运行副本，并把球队/比赛/赛事低频页面按原路径拆入分包；批准源素材保留在 `docs/prototype-assets/miniprogram-source-20260815/`。开发者版本 `1.0.6` 上传成功，微信回读主包 1.9MB，分包为 `packageA` 33.4KB、`pages/match` 105.2KB、`pages/team` 222.2KB、`pages/tournament` 218.8KB。根域名、`/admin/`、`/referee/` HTTP 200；此为开发者上传，不是提交审核或发布，线上用户版本尚未切换。静态 UI 门禁 162/162、路由和页面文件缺口均为 0；9 个视觉节点与通知模板生产配置仍待完成。
2026-08-15 03:41:47 小程序当前配置复核后再次上传开发者版本 `1.0.7` 成功：微信回读主包 1.9MB、`packageA` 33.4KB、`pages/match` 105.2KB、`pages/team` 222.2KB、`pages/tournament` 218.8KB。仍未提交审核或发布，线上用户版本未切换。
2026-08-15 03:50:16 裁判通知模板配置诊断闭环补强并上线：`sendRefereeTemplateMessages` 仅回读缺失环境变量名，不回读密钥值；线上 `Nodejs16.13 / Deployment completed / ModTime 03:49:30`。虚拟手机号空队列探针返回 `success:true`、`results:[]`，缺少 `SERVICE_ACCOUNT_APP_ID`、`SERVICE_ACCOUNT_APP_SECRET`、`SERVICE_ACCOUNT_REFEREE_TEMPLATE_ID`、`SERVICE_ACCOUNT_H5_URL`，未触发真实通知。模板生产发送仍待有权限的服务号管理员配置环境变量。
2026-08-15 04:41:30 家长实名退回重提边界补强并完成线上回读：`submitParentIdentityVerification` 在 `rejected` 状态下比较当前 `uploaded` 人像面文档与上次审核记录的 `documentIds`；未重新上传就直接重提返回 `PARENT_IDENTITY_REUPLOAD_REQUIRED`，只有新文档才会重新进入 `pending_review`。`node --check`、`git diff --check` 通过；`webLoginApi` 线上读回 `Nodejs18.15 / Deployment completed / ModTime 2026-08-15 04:40:41`，无会话探针返回 HTTP 200 + `PARENT_AUTH_REQUIRED`，未读取或写入真实家长、证件或业务数据。9 个视觉节点继续待验收；小程序 `1.0.7` 未提交审核/发布。
2026-08-15 04:49:52 认领邀请有效期边界补强并完成线上回读：`organizerClaimInvite` 生成端拒绝报名截止后新建认领邀请并过滤已过期 pending 邀请；`getMiniWorkspace.prebuiltTeamInvite` 预览和确认端统一校验 `inviteExpireAt/expiresAt`，过期邀请返回 `TEAM_INVITE_EXPIRED`，旧邀请缺字段时回退校验赛事报名截止/结束时间。两个函数线上读回 `Nodejs18.15 / Deployment completed`：`organizerClaimInvite` ModTime 04:48:21，`getMiniWorkspace` ModTime 04:49:02；未读取或写入真实赛事、球队或邀请数据。9 个视觉节点仍待验收；小程序 `1.0.7` 未提交审核/发布。
2026-08-15 04:52:29 邀请确认写入前二次过期校验补强并完成线上回读：`getMiniWorkspace` 在认领邀请与球队成员邀请确认动作重新读取记录后再次校验 `inviteExpireAt/expiresAt`，有效期边界竞态不会继续写入接受关系；返回 `TEAM_INVITE_EXPIRED` 或 `TEAM_MEMBER_INVITE_EXPIRED`。线上 `getMiniWorkspace` 为 `Nodejs18.15 / Deployment completed / ModTime 04:52:09`；未读取或写入真实邀请、球队成员或参赛关系。9 个视觉节点仍待验收；小程序 `1.0.7` 未提交审核/发布。
2026-08-15 04:56：`getMiniWorkspace` 的 `requestPrebuiltTeamClaimReview` 已补齐预览后、写入审核申请前的二次邀请过期校验；线上回读 `modifyTime=2026-08-15 04:56:26`，状态 `Deployment completed`。视觉验收仍有 9 个节点待执行；未提交、推送、发布或预览。
2026-08-15 05:00:59：`getMiniWorkspace.prebuiltTeamInvite` 已补齐邀请缺少 `inviteExpireAt/expiresAt` 时的赛事 `registrationDeadline/signupDeadline/endDate` 回退校验；认领确认和冲突审核申请在预览后重读邀请与赛事并再次断言有效期。线上回读 `Nodejs18.15 / Deployment completed / ModTime 05:00:59`；`npm run build`、三个云函数 `node --check`、162/162 静态门禁通过；未读取或写入真实数据。视觉验收仍有 9 个节点待执行，小程序 `1.0.7` 未提交审核/发布。
2026-08-15 05:08:12：`getMiniWorkspace` 认领确认和冲突审核申请在预览后重读邀请与赛事时新增邀请类型、赛事存在性校验，删除/替换竞态直接阻断，避免孤立关系或通用异常写入。线上回读 `Nodejs18.15 / Deployment completed / ModTime 05:08:12`；`node --check`、`npm run build`、162/162 静态门禁通过。视觉验收仍有 9 个节点待执行，小程序 `1.0.7` 未提交审核/发布。
2026-08-15 05:10:21：修正 `tools/validate-ui-delivery.js` 的视觉待验收统计，同时识别 `visual-capture-pending` 与 `visual-review-pending`；默认门禁现在如实输出视觉截图待执行 9，`--strict-visual` 对 9 个节点失败。默认静态门禁仍通过 162/162、0 路由缺口、0 页面文件缺口；未改变业务代码、线上数据或发布状态。
2026-08-15 05:13:31 PC 认领邀请弹窗行为修正并完成线上回读：`TournamentTeams.vue` 优先使用 `organizerClaimInvite` 返回的服务端认领路径；有效期按日期型/带具体时间型值准确展示；关闭、切换和失败会清理旧邀请状态。`npm run build`、`git diff --check`、`node --check`、162/162 静态门禁通过；`web-admin-vue/dist` 已上传 `/admin/` 193 个文件，公网 `TournamentTeams-wXyHwYOE.js` 原始字节 SHA-256 与本地一致（`923D4414690E421BDF33B4951DE82E2B0B6A20DC8493CB5053F8B849ED66C031`）。未执行预览或真实认领写入，节点继续 `visual-review`；小程序 `1.0.7` 未提交审核/发布。
2026-08-15 05:23:28 家长 H5 基础资料人工核验阻断补齐并完成线上回读：读取 `needsManualReview` 后进入人工核验状态，只允许刷新或返回邀请，不重复展示可继续实名的编辑表单；不覆盖历史球员、名单、阵容和赛事快照。`node --check`、CSS 924/924、162/162 静态门禁通过；`service-account-h5/` 上传 4 个文件，公网 `app.js` 原始字节 SHA-256 与本地一致（`8CAD262DCC40271C9415233B753DB810071A60C5E1301CA45B62CA66F12E7707`）。未预览或使用真实家长会话，8 个家长节点继续 `visual-review`；小程序 `1.0.7` 未提交审核/发布。
2026-08-15 06:32:00 CloudBase 足球环境函数全量状态只读回读：`fn list --limit 100 --json` 返回的 `webLoginApi`、`updateMatch`、`sendRefereeTemplateMessages`、`organizerClaimInvite`、`getMiniWorkspace`、`onboardingWorkspace`、`serviceMatchWorkflow` 等正式函数均为 `Deployment completed`；未读取函数详情或敏感配置，未执行真实业务写入。
2026-08-15 06:41:00 家长 H5 头像裁切预览同步修正并上线：确认页同步更新主裁切框、圆形预览和方形预览的缩放/位移，提交到 `confirmParentPortrait` 的裁切参数与用户看到的预览保持一致。`node --check service-account-h5/app.js`、CSS 924/924、162/162 静态门禁通过；`service-account-h5/` 4 个文件上传 `/service-account-h5/`，公网 `app.js` HTTP 200，原始字节 SHA-256 与本地一致（`8E4E25EADAB03C91617CA2E5D05C879E0D4B43580D9CA3A1712729ECA9774061`）。未预览或使用真实家长会话，节点继续 `visual-review`；未提交、未推送、未发布。
2026-08-15 06:48:00 家长 H5 成功页示例数据回退收口并上线：生产成功页姓名/球队缺失时改用“球员/当前球队”中性占位，不再显示固定示例儿童或青训队名称；本地视觉样例仍只在 127.0.0.1 且显式 `visualQa=1` 时使用示例。`node --check service-account-h5/app.js`、162/162 静态门禁通过；`/service-account-h5/app.js` HTTP 200，公网与本地 SHA-256 一致（`07B94554F675C57C625E643BCF43AB9D07E758DB39CFE807B728257C17177048`）。未预览或使用真实家长会话，节点继续 `visual-review`；未提交、未推送、未发布。
2026-08-15 06:56:00 家长 H5 成功页头像资产边界回归修正并上线：缺少当前头像裁切结果时不再复用透明标准形象照，改显示受限头像占位；只有确认生成的 `avatarPreview` 才展示球员头像。`node --check service-account-h5/app.js`、162/162 静态门禁通过；公网 `/service-account-h5/app.js` HTTP 200，SHA-256 与本地一致（`C85D4F75671CBC1DA2C7147CDCED174FD6F292E571F95395DCF9151C27870BC6`）。未预览或使用真实家长会话，节点继续 `visual-review`；未提交、未推送、未发布。

2026-08-15 08:22:34 正式名单竞赛组别边界补齐并上线：小程序正式名单读取/提交和 PC 名单异常台账均按赛事 `divisionId` 解析同一份组别要求；多组别球队必须显式选择组别，名单快照保存 `divisionId/divisionName`，实名认证、标准形象照及家长补充资料不再使用跨组别或无依据的默认判断。云函数 `getMiniWorkspace`、`webLoginApi` 已完成部署并安全读回，固定 HTTP 入口无会话返回 `AUTH_REQUIRED`；`node --check`、`npm run build`、`git diff --check`、162/162 静态门禁通过。未使用真实名单数据、未预览；视觉待验收仍 9 个，小程序 `1.0.7` 仍未提交审核/发布。

2026-08-15 08:29:00 小程序正式名单组别逻辑上传开发者版本：微信开发者工具 CLI 成功上传 `1.0.10`，回读 TOTAL 1,547,151 bytes（主包 977.0 KB；`packageA` 33.4 KB、`pages/match` 70.5 KB、`pages/team` 211.3 KB、`pages/tournament` 218.8 KB）。仍未提交审核、未发布、未预览，线上用户版本未切换。

2026-08-15 08:36:00 正式名单路由台账同步：三条小程序名单入口统一补记 `divisionId=:divisionId`，与多组别显式选择、组别要求解析及 `roster_snapshots.divisionId` 隔离一致。`node --check tools/ui-delivery-inventory.js`、162/162 静态门禁、`git diff --check` 通过；本轮不触碰业务数据、不预览、不发布。

2026-08-15 08:34:08 PC 名单异常看板跨组别串显修复并上线：按 `divisionId` 过滤参赛球队及名单快照，避免同一球队其他竞赛组别的异常记录混入当前看板；未选组别时保留全赛事汇总。`webLoginApi` 线上读回 `Nodejs18.15 / Active / ModTime 08:33:36`，无会话探针 HTTP 200 + `AUTH_REQUIRED`；`node --check`、162/162 静态门禁、`git diff --check` 通过。未使用真实名单数据，未预览、未提交、未推送。

2026-08-15 08:37:46 参赛管理组别隔离修复并上线：小程序参赛管理与 `getMiniWorkspace.teamParticipation` 按 `divisionId` 分离名单快照和下一场比赛，旧数据仅在单组别赛事中兼容；进入赛事详情同步传递 `divisionId`。云函数读回 `Nodejs18.15 / Active / ModTime 08:37:04`，`node --check`、162/162 静态门禁、`git diff --check` 通过。未使用真实赛事数据，未预览、未提交、未推送。

2026-08-15 08:37:46 小程序开发者版本同步：CLI 上传 `1.0.11` 成功，回读 TOTAL 1,547,288 bytes（主包 977.0 KB；`packageA` 33.4 KB、`pages/match` 70.5 KB、`pages/team` 211.4 KB、`pages/tournament` 218.8 KB）。未提交审核、未发布、未预览，线上用户版本未切换。

2026-08-15 08:40:07 历史参赛记录组别隔离并上线：`teamHistory` 按参赛关系 `divisionId` 过滤归档比赛，返回记录带出组别，避免跨组别混算；单组别赛事才兼容旧比赛。`getMiniWorkspace` 读回 `Nodejs18.15 / Active / ModTime 08:39:39`，`node --check`、162/162 静态门禁、`git diff --check` 通过。未使用真实历史数据，未预览、未提交、未推送。

2026-08-15 08:40:07 小程序开发者版本同步：CLI 上传 `1.0.12` 成功，TOTAL 1,547,288 bytes；仅开发者上传，未提交审核、未发布、未预览。

2026-08-15 08:44:28 比赛阵容正式名单组别隔离并上线：`matchLineup` 按比赛 `divisionId` 选择已审核名单，多组别且比赛缺组别时安全阻断，并返回组别信息。`getMiniWorkspace` 读回 `Nodejs18.15 / Active / ModTime 08:43:57`，`node --check`、162/162 静态门禁、`git diff --check` 通过。未使用真实比赛/阵容数据，未预览、未提交、未推送。

2026-08-15 08:44:28 小程序开发者版本同步：CLI 上传 `1.0.13` 成功，TOTAL 1,547,288 bytes；未提交审核、未发布、未预览。

2026-08-15 08:46:29 球队数据包组别参赛关系校验并上线：`teamDataPackage` 要求球队在当前赛事存在有效参赛关系，并匹配请求 `divisionId`；多组别不再默认选组。`getMiniWorkspace` 读回 `Nodejs18.15 / Active / ModTime 08:46:03`，`node --check`、162/162 静态门禁、`git diff --check` 通过。未使用真实数据包，未预览、未提交、未推送。

2026-08-15 08:46:29 小程序开发者版本同步：CLI 上传 `1.0.14` 成功，TOTAL 1,547,288 bytes；未提交审核、未发布、未预览。

2026-08-15 08:49:34 专业版升级名单初始化组别隔离并上线：升级目标组别只读取匹配 `divisionId` 的名单快照，无组别旧快照仅在单组别赛事兼容。`webLoginApi` 读回 `Nodejs18.15 / Active / ModTime 08:49:03`，无会话探针 HTTP 200 + `AUTH_REQUIRED`；`node --check`、162/162 静态门禁、`git diff --check` 通过。未使用真实赛事、名单或权益数据，未预览、未提交、未推送。

2026-08-15 08:52:00 名单异常处理写入边界组别隔离并上线：`requestProfileCorrection`、`returnRoster` 校验名单快照与目标 `divisionId`，无组别旧快照仅在单组别赛事兼容；`webLoginApi` 读回 `Nodejs18.15 / Active / ModTime 08:51:35`，无会话探针 HTTP 200 + `AUTH_REQUIRED`。`node --check`、162/162 静态门禁、`git diff --check` 通过；未使用真实名单数据，未预览、未提交、未推送。

2026-08-15 09:08:00 球队数据包历史比赛兼容修复并上线：`teamDataPackageData` 统计时复用单组别旧比赛兼容规则，无 `divisionId` 的历史比赛仅在单组别赛事纳入，多组别仍严格隔离。`getMiniWorkspace` 读回 `Nodejs18.15 / Active / ModTime 09:07:05`；`node --check`、162/162 静态门禁、`git diff --check` 通过。未使用真实数据包或比赛数据，未预览、未提交、未推送。
2026-08-15 09:25:00 报名入口组别隔离并上线：`applyTournament` 按赛事竞赛组别区分同一球队的报名关系，多组别要求显式 `divisionId`，并将组别写入报名/邀请记录；PC `TournamentCenter`、`TournamentDetail` 在有多个可报名组别时展示并校验选择，单组别保持兼容。函数读回 `Nodejs16.13 / Active / ModTime 09:17:46`，PC `npm run build` 通过；CloudBase Hosting 上传 `/admin/` 193 个文件后，正式域名 `/admin/`、新 JS/CSS 和根域名入口均 HTTP 200 并引用最新构建哈希。未预览、未使用真实报名数据、未提交、未推送；9 个视觉节点继续 `visual-review`。
2026-08-15 09:42 报名行为服务端收口并同步开发者版：小程序报名页已移除客户端 `tournament_teams` 写入，统一调用 `applyTournament`；报名组别、身份归属、重复关系与名额由服务端决定。云函数线上读回 `Deployment completed`（modifyTime `2026-08-15 09:39:46`），开发者版本 `1.0.15` 上传成功（`1,547,183 bytes`），未提交审核/发布。静态交付门禁维持 162/162，视觉待验收仍 9 个，未执行预览。
2026-08-15 09:47 报名组别锁定字段兼容上线：`applyTournament` 组别级竞赛方案锁定判断补齐 `id/_id` 兼容字段，线上读回 `Deployment completed`（modifyTime `2026-08-15 09:46:35`），无会话入口返回 `AUTH_REQUIRED`。静态门禁 162/162，9 个视觉节点继续待预览验收。
2026-08-15 09:55 台账机器可读性修正：09:42 与 09:47 两条最新线上回读已从文件尾部注释归入 `tools/ui-delivery-inventory.js` 的 `verificationNotes`，`--json` 可完整读回；`node --check`、162/162 静态门禁与 `git diff --check` 通过。未改变业务代码、线上数据、部署或视觉验收状态。
2026-08-15 09:58 原型全链路画板审计回读：`audit-board.mjs` 返回 `passed=true`、11 个分组、162 个正式页面、0 个 pending、0 个缺失路径、0 个缺失行为逻辑；9 个重复源图引用均为跨流程复用。未修改画板、未预览、未发布。
2026-08-15 09:59 线上入口与关键函数只读回读：根域名、`/admin/`、`/referee/`、`/service-account-h5/` 均 HTTP 200；报名、工作空间、机构引导、认领邀请、网页登录和裁判通知函数均为 `Deployment completed`，时间与当前线上列表一致。未读取函数详情或敏感配置，未写入业务数据、未预览、未发布。
2026-08-15 10:04:53 画板外旧分享页审计：`app.json` 仍登记 `miniprogram/pages/match/share/share`，`share.wxml` 的“下载PDF文档”按钮实际绑定 `share.js.onDownloadPDF`，运行时直接调用 `generatePDF`；当前 `cloudfunctions` 目录无 `generatePDF` 实现，CloudBase 足球环境 `fn list` 也确认 `NOT_FOUND_IN_CLOUDBASE_FUNCTION_LIST`，`git log --all` 也没有可恢复的 `generatePDF` 实现。产品规则明确的是专业版《竞赛规程》预览/导出，未明确首发阵容 PDF 的导出范围或权限。该入口不在 162 个批准节点内，未擅自新增/删除函数或修改页面，保留为 legacy warning，待明确是否保留该导出能力后再处理；`node --check` 通过，未部署、未预览、未写入业务数据。
2026-08-15 10:09:29 正式 PC 构建回归：`web-admin-vue npm run build` 成功生成当前 `dist`，`node --check`（台账与画板外旧分享页）、162/162 静态 UI 交付门禁和 `git diff --check` 均通过；本轮未上传、未部署、未预览、未发布。
2026-08-15 10:12:21 正式域名 PC 静态包字节回读：公网 `/admin/index.html` 与当前 `web-admin-vue/dist/index.html` 引用完全一致；四个入口 JS/CSS 资源逐字节 SHA-256 一致，根域名 HTTP 200；本轮只读核对，未上传、未部署、未预览、未发布。
