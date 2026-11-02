# 身份证照片比对与登录衔接对接文档

更新：2026-10-26。适用项目：赛小蜂足球。用于交给其他研发会话接入现有能力，不要求重新开发一套人证系统。

用户已确认之前的身份证照片比对及登录衔接流程经过测试。本次重新阅读本地代码、下载当前线上函数包、读取线上H5并做无身份探针；未使用真实身份证或人脸材料重新跑正向业务，也未发布代码、修改配置或业务数据库。

## 1. 接入前必须知道

1. **账号登录与人证核验是两条链。** 微信OAuth确认渠道身份，验证手机号确认唯一自然人账号；人证核验确认球员材料和本人照片的关系。不能用姓名、身份证号或前端比对结果直接登录、签发账号会话或授予权限。
2. **身份证格式校验不是人证核验。** 18位、出生日期、末位校验码通过，仅显示“格式校验通过”；不表示号码存在、证件有效、公安库认证或持证人到场。
3. **现有比对是平台本地1:1比对。** 浏览器识别证件照片和摄像头画面，检测转头后计算描述向量距离。不是权威身份库验证，也不是已接入的权威活体认证。
4. **最终业务状态看服务端。** 上传成功、本地比对通过、审核通过、球员入队、赛事名单审核、比赛现场核验分别保存，不能共用一个“已实名”布尔值。
5. **按稳定ID和有效邀请接入。** 不按同名合并球员，不根据客户端userId/OpenID/手机号指定归属；成人本人、未成年人监护人共用能力，主体取服务端返回值。

## 2. 本次线上复核与版本差异

| 项目 | 2026-10-26复核结果 | 接入影响 |
|---|---|---|
| `webLoginApi` | Active，修改时间18:03:42，Nodejs18.15 | 是网页统一HTTP入口；此时间只是复核快照，不是本次发布 |
| 人证接口无身份探针 | `getParentProfileDraft`、`submitParentIdentityVerification`、`getParentIdentityVerification`均HTTP200且拒绝为`PARENT_AUTH_REQUIRED` | 路由可达、匿名被拒绝；不能据此声称正向链路已重测 |
| H5人脸脚本及三个模型清单 | HTTP200 | 模型清单可达；接入还须检查清单对应的bin文件及手机加载 |
| `prepareParentIdentityImage` | Active，修改时间2026-10-02 12:45:33 | 本地正式`cloudfunctions/`下缺该函数目录，线上包包含`index.js/process.cjs/baidu-ocr.cjs`等依赖；不能用空目录重建覆盖 |
| `purgeSensitiveIdentityFiles` | Active，有`dailySensitiveIdentityCleanup`定时触发器 | 线上支持Timer执行并清除原图/审核图引用；本地版本较旧，不能反向覆盖 |
| 本地与线上源码 | `webLoginApi/index.js`、H5 `app.js/index.html`摘要不一致 | 当前线上包是接入核验基线，不能整包上传本地脏目录 |
| 10月18日继续登记入口 | 当前线上`servicePrivateRegistrationList`返回“未知操作”；当前路由也不包含本地曾接入的多项servicePrivate能力 | **不能直接承诺“我的→继续球员登记”当前可用**；若需该入口，应从10月18日交接中选择性恢复并独立验收，不能只复制前端按钮 |
| 证件OCR与自动审核 | 当前上传路径写`recognitionStatus=needs_manual_review`、`recognitionErrorCode=OCR_SKIPPED_BY_PRIVACY` | 默认按人工复核接入；不能把图片预处理的OCR预览等同于正式核验材料已被OCR识别 |

上述线上状态会变化，接手会话发布前必须再次核对。证据仅保存在本地研发目录 `work/identity-integration-handoff-20261026/`，含只读源码快照、摘要及匿名探针，不含真实个人材料；不把整个线上函数ZIP发给其他项目或提交仓库。

## 3. 入口、文件与职责

正式仓库：`E:\Documents\sxf-football`。正式H5：`https://www.sxffootball.cn/service-account-h5/`。

统一HTTP入口：

```text
https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi
```

| 文件/模块 | 职责 |
|---|---|
| `service-account-h5/app.js` | `parentInvite`邀请、资料确认、证件选图、水印、face-api摄像头比对、核验提交及结果页 |
| `service-account-h5/styles.css` | 已有登记/核验/结果页面样式；新页面优先复用 |
| `service-account-h5/vendor/face-api/` | 已有脚本、模型清单及bin文件；路径以部署位置为基准 |
| `cloudfunctions/webLoginApi/index.js` | parent系列会话、邀请校验、证件上传、核验提交/读取、双人审核和资料完成 |
| 线上`prepareParentIdentityImage` | 证件图预处理、方向/裁切及显式同意下的OCR预览；浏览器经HTTP relay调用，不直连该函数 |
| `cloudfunctions/purgeSensitiveIdentityFiles/` | 敏感文件到期删除；接入前与线上代码比对 |
| `cloudfunctions/getMiniWorkspace/playerRegistration.cjs` | 新版入队登记的身份证格式/出生日期/校验码与明确认领；不代替照片比对 |
| `cloudfunctions/webLoginApi/service-entry.js` | `entry/proof`服务号邀请OAuth、手机号验证和登记上下文 |
| 本地`serviceRegistrationRecovery.cjs`及`serviceRegistrationResume.cjs` | 之前实现的登记恢复；今天线上是否包含必须逐项检查，不能凭文件存在判为已上线 |
| `cloudfunctions/webLoginApi/baiduPlayerFace.cjs` | 经独立同意的赛场人脸库录入；不等于本地1:1比对、OCR或百度抠图 |

接入主体分为球队端小程序`wx57164cca8676f411`、球员端“赛小蜂足球世界”小程序`wxa0ac7d45bcabd140`、服务号H5、PC。两小程序OpenID、服务号OpenID和网站微信OpenID不能混用。新球员端接入须明确自己的登录/手机号会话并经后端复用能力，不复制H5令牌进小程序充当登录。

## 4. 先确认使用哪一种会话

| 链路 | 邀请/输入 | 会话参数 | 已核对的期限/约束 |
|---|---|---|---|
| 人证资料H5 | `parentInvite=pp_...` | `parentSessionToken` | parent OAuth state使用10分钟；parent H5会话使用30天常量，仍受原邀请有效性、用途及微信关系约束 |
| 球队入队登记H5 | `entry`及扫码证明`proof` | `serviceEntrySession` | 与parent会话不通用；旧实现为12小时，当前接入须重新核对对应已部署模块 |
| 服务号“我的” | 服务号OAuth/已验证手机号账号 | `serviceSessionToken` | 与上述两种不通用；相关路由今天存在缺口，不能直接依赖 |
| PC/小程序业务登录 | 各自微信授权＋唯一手机号账号 | 各端既有认证字段 | 核验照片不能生成或替代这些令牌 |

parent H5现有存储键为`localStorage.sxf_parent_h5_session`和`sessionStorage.sxf_parent_h5_pending_invite`。每次请求仍传当前邀请，服务端检查会话与邀请一致。换微信、换账号或换邀请时不能复用旧页面的核验结果；必须重新读取。

“OAuth成功”只表示该授权链成功，不应在前端跳过手机号主账号要求。parent资料补充链可以依赖原业务已建立的邀请与账号关系，**它本身不是通用手机号登录接口**。其他项目若没有该前置关系，需先接自己的手机号验证和稳定用户关系，不能只复制parent OAuth。

## 5. 最小接入顺序及接口表

顺序：打开有效邀请 → 微信授权/验证既有会话 → 读取requirements与草稿 → 确认基础资料及授权 → 按要求上传证件 → 本地比对或明确申请人工 → 提交核验 → 读取服务端结果 → 按requirements继续形象照/资料提交。若基础姓名或出生日期不同，先进入基础资料人工核对，不覆盖原档案后继续刷脸。

以下字段均为HTTP JSON中的业务参数，不含真实示例身份数据。动作返回常见结构为`{success,...}`，HTTP200不代表业务成功；网关若包装`body`字符串需先解析。

| action | 主要参数 | 主要返回/下一步 |
|---|---|---|
| `previewParentProfileInvite` | `parentInvite` | `data.playerName/birthDate/teamName/registrantType/isSelfRegistration/requirements`；失效直接阻止后续 |
| `parentProfileOAuthUrl` | `parentInvite` | `authorizeUrl`；由服务端生成state和固定回调，不接受任意外站回跳 |
| `parentProfileOAuth` | 微信`code/state` | `parentSessionToken/parentInvite/expiresAt`；state只用一次；serviceFirst邀请要求同一官方微信及既有绑定 |
| `checkParentProfileSession` | `parentSessionToken,parentInvite` | 核对会话，不扩展账号权限 |
| `getParentProfileDraft` | 同上 | `data`及`draft`；requirements来自服务端，不能由页面默认开启/关闭 |
| `saveParentBasicProfile` | 同上＋`name,birthDate,registrantAuthorized`，监护时加`guardianRelation` | `nextStep/needsManualReview/requirements`；可能为manual-review、real-name、portrait、submit |
| `prepareParentIdentityImage` | 同上＋`documentType,side,base64Data`；OCR需显式`ocrConsent` | 处理后图、方向/裁切或OCR预览；仅为预处理，不表示证件已保存/核验通过 |
| `uploadParentIdentityDocument` | 同上＋`side,documentType,base64Data,reviewBase64Data,cropDetected,watermarkVersion` | `status:uploaded`等；两张图均由服务器接收成功才显示上传成功 |
| `submitParentIdentityVerification` | 同上＋`faceAssessment` | 顶层`status`：approved、pending_review或rejected；必须继续查询正式结果 |
| `getParentIdentityVerification` | 同上 | `data.status/statusText/reason/identityNumberMasked/verifiedBirthDate/gender/submittedAt/reviewedAt`等最小结果 |
| `requestParentIdentityCorrection` | 同上，细节以现行handler为准 | 已通过资料的更正入口；不能直接清空通过状态重传 |
| `completeParentProfile` | 同上及现有完成动作所需字段 | 再检查基础授权、核验/复用证据与形象照；完成资料不等于正式参赛名单通过 |
| `listIdentityReviewQueue` | 现有审核账号认证＋赛事/机构范围 | 只给有权审核者返回审核材料；不从球员端调用 |
| `reviewIdentityVerification` | 既有审核认证＋`verificationId,decision,reason` | 独立双人意见，退回必须原因；球员不能自审 |

请求适配可复用：

```js
async function parentCall(action, business) {
  const response = await fetch(WEB_HTTP_ENTRY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...business,
      action,
      parentInvite: currentInvite,
      parentSessionToken: currentParentSession
    })
  })
  let result = await response.json()
  if (typeof result.body === 'string') result = JSON.parse(result.body)
  if (!response.ok || !result.success) {
    throw Object.assign(new Error(result.error || result.message || '请求未完成，请重试'), { code: result.code })
  }
  return result
}
```

示例只说明适配方式；实际调用还应复用现有超时、换账号清理和迟到响应防护，不另引浏览器CloudBase SDK。

## 6. 证件图片、大小和上传注意事项

- 支持的`documentType`：`resident_id`、`household_register`、`passport`、`mainland_travel_permit`、`taiwan_travel_permit`。身份证需`front/back`两面；其他证件当前只需资料页。证件类型不是国籍或参赛资格判断。
- H5选图先校验，再本地预览、压缩/裁切、生成审核水印副本。必须区分“已选择、未上传”“正在上传”“服务器已保存”；不能把FileReader成功当上传成功。换证件图立即废弃旧人脸比对结果。
- 当前H5原始选图上限25MB，上传图上限3MB，压缩目标2.4MB、最长边2200。这些是当前实现限制，不能只调页面数字而不检查服务器和HTTP总包限制。
- JSON兼容路径同时传原图`base64Data`和审核副本`reviewBase64Data`。base64会扩大约三分之一，双图合计还可能超过网关限制；大图问题不能通过无条件增加重试解决。
- 当前webLoginApi还保留分阶段上传：`assetRole=original`上传单张并返回`uploadId/status:uploading_review`；再用同一邀请/side/type、`assetRole=review`和`uploadId`上传水印副本，最终变成uploaded。此路径单图为180KiB限制，与3MB兼容路径不是同一个合同。若采用必须把两阶段和失败恢复完整接入，不能混搭。
- webLoginApi可解析已有multipart适配；字段名、头部及图片编码须复用`readIdentityMultipart`，不自行发明路径或直连独立函数。`ocrConsent`当前relay按字符串`true`识别，不要传`1/yes`。
- 独立prepare函数每会话每分钟最多12次；OCR预览仅在明确同意且为身份证/护照时调用。**预览结果存在会话不表示被写入正式document的recognitionStatus**，当前正式上传仍默认`OCR_SKIPPED_BY_PRIVACY`。
- 审核中拒绝重复上传；已通过走更正入口；被退回后需重新上传人像面，旧documentIds不能原样重提。

## 7. 本地比对、摄像头和提交合同

复用`service-account-h5/app.js`的`loadParentFaceLibrary/loadParentFaceModels/parentFaceResult/parentFaceYaw/parentFaceDistance`及其运行代次控制，不另写第二套阈值。

| 项目 | 当前值/要求 |
|---|---|
| 库版本 | `face-api-1.7.15`；脚本`vendor/face-api/face-api.js` |
| 模型 | ssdMobilenetv1、faceLandmark68TinyNet、faceRecognitionNet |
| 人脸检测 | minConfidence 0.55，画面必须恰好1人 |
| 证件照与正脸距离 | `distance <= 0.55`才构成本地通过条件 |
| 正脸和转头画面一致性 | 描述向量距离不得大于0.5 |
| 转头变化 | `livenessMotion >= 0.045`；为当前本地动作信号，不称权威活体认证 |
| 加载超时 | 脚本15秒、模型30秒；摄像头/识别各阶段15秒，现有转头轮询有自己的截止时间 |
| parent普通请求 | 当前H5通常20秒，upload前缀动作90秒；慢模型、网络错误应独立提示并可人工回退 |

正常比对提交形态：

```js
faceAssessment: {
  method: 'local_face_1to1',
  status: 'passed',                 // 未达阈值为 needs_manual_review
  biometricConsent: true,
  algorithm: 'face-api-1.7.15',
  distance: actualDistance,
  livenessMotion: actualMotion,
  descriptor: actual128Numbers      // 真实采集结果，禁止示例向量/固定值
}
```

拒绝人脸处理的人工路径：`{method:'manual_per_event',status:'needs_manual_review',biometricConsent:false,algorithm:'none'}`。只把该状态交给服务端人工队列；不能假装算法通过或强制继续请求摄像头。

描述向量须128项，服务端检查有限数字及范围并以AES-256-GCM加密。`SXF_IDENTITY_FEATURE_KEY`只放云函数环境；缺失返回`IDENTITY_FEATURE_ENCRYPTION_REQUIRED`，不得改为明文保存或跳过。此次仅确认该环境变量名存在，未读取其值。

摄像头需要HTTPS和用户主动操作；权限拒绝、设备占用、多脸、暗光、模型失败均应可重试或转人工。切页面、pagehide、取消、改证件图时停止全部MediaStream tracks；摄像头超时后的迟到stream也必须stop，旧异步结果不能把已取消页面重新打开。过程视频帧不上传，不写入通用日志、埋点或本地存储。

**信任边界：** 服务端会核对阈值、同意、向量结构及材料，但`distance/status/livenessMotion`仍来自客户端，不能视为防篡改生物认证凭证。用于更高权限的身份登录、支付或权威实名认证，必须另行确认服务端核验/权威供应商方案；不得把本链路直接当账号密码替代品。

## 8. 状态、人工审核与数据隔离

| 状态 | 页面及业务处理 |
|---|---|
| `not_required` | 当前邀请无需核验，不显示强制上传；不擅自变成平台实名 |
| `not_started` | 允许按要求补材料 |
| `pending_review` | 已提交、等待组委会，不显示已通过、不允许重复上传 |
| `approved` | 本次核验通过；下一步仍取requirements及正式名单状态 |
| `rejected` | 展示服务端原因，按要求更换材料后重提 |
| `manual_required`等最终人工方式 | 按场人工核验范围处理；不是永久平台人证认证 |

当前自动审核分支要求：正式证件record已recognized、无recognitionWarnings、本地算法条件通过、OCR姓名和生日与稳定球员档案一致。材料不具备这些证据时进pending_review，而非客户端直接approved。当前上传默认未识别，接入方应以人工队列可完成为验收项。

人工审核复用主办/机构范围校验，两个不同审核员独立提交；同一审核员不得重复计票。两票通过才通过、两票退回则退回；意见不一致会退回并标记disputed，不是任选一票。禁止给球员、普通球队账号或只读赛事子账号开放审核材料接口。

主要受限集合：`parent_profile_invites`、`parent_oauth_states`、`parent_h5_sessions`、`parent_profile_drafts`、`parent_identity_documents`、`parent_identity_verifications`、`identity_verification_attempts`、`identity_manual_reviews`、`parent_identity_correction_requests`、`sensitive_file_deletion_tasks`；资料完成还涉及`player_identity_profiles`及既有形象照/提交记录。浏览器不直接查这些表。

原图及水印审核副本受限保存30天，上传时创建删除任务；线上清理函数有定时器，每次最多100个到期任务，失败六小时后重试。存在定时器不等于已证明所有文件按期删除；接手方仍应检查任务积压/失败，不能把“30天”作为已完成清理的证据。本次未触发删除、未读真实材料。

## 9. 中断返回和完成卡片

- 已有`pp_...`流程：持当前parentSessionToken与parentInvite重新调用getParentProfileDraft/getParentIdentityVerification，按服务端状态恢复；令牌过期、邀请不匹配则重新OAuth，不复用其他球员会话。
- 新版`entry`登记曾在10月18日实现私有表单/照片/构图草稿和“我的→继续登记”；本次线上已探测到相关路由缺失，不能在新端直接调用并宣称可用。恢复工作应以`docs/releases/registration-return-20261018.md`和现行线上包逐项合入，不覆盖10月19日后认领/完成页及其他修复。
- 最终成卡确认后应显示统一渲染器的完整卡，而非抠图头像；更新资料/照片/模板后旧卡确认失效。人证照片和卡面形象照是不同素材，不把身份证原图拿去做公开球员卡。
- 中断验收必须覆盖关闭整个微信网页、清空原页面上下文后从固定业务入口重新打开；只测试刷新或退到后台不等于已覆盖。任何恢复都不能自动替本人勾选新授权、提交登记或迁移账号。

## 10. 错误处理速查

| code/情况 | 正确处理 |
|---|---|
| `PARENT_AUTH_REQUIRED` | 清理当前失效parent会话、重新从同一邀请授权；不改用其他token |
| `PARENT_INVITE_INVALID/EXPIRED/BROKEN/MISMATCH` | 阻断，重新读取/请负责人重发正确邀请 |
| `SERVICE_FOLLOW_REQUIRED` | 按原业务要求用登记时的同一微信继续，不能伪造关注状态 |
| `PARENT_BASIC_REQUIRED` | 返回基础资料确认，不跳过授权 |
| `PARENT_IDENTITY_NOT_REQUIRED` | 刷新requirements，隐藏不需要的强制核验 |
| `PARENT_IDENTITY_BACK_REQUIRED` | 补身份证国徽面 |
| `IDENTITY_IMAGE_TOO_LARGE/IDENTITY_ASSET_TOO_LARGE` | 按所选上传合同压缩原图和水印图；不要盲目重试大包 |
| `IDENTITY_UPLOAD_SESSION_INVALID` | 重新完成正确invite/side/type的两阶段上传 |
| `PARENT_IDENTITY_UNDER_REVIEW/ALREADY_APPROVED` | 读取结果，已通过走更正申请 |
| `IDENTITY_FACE_ASSESSMENT_REQUIRED` | 完成真实比对或明确选人工，不伪造passed |
| `IDENTITY_FEATURE_ENCRYPTION_REQUIRED` | 检查服务端密钥配置，不在页面补密钥 |
| `PARENT_IDENTITY_REUPLOAD_REQUIRED` | 退回后重新上传人像面再提交 |
| `IDENTITY_REVIEW_DUPLICATE_REVIEWER` | 更换第二位有权审核者，不复用同账号 |
| HTTP200但`success:false`、或未知操作 | 按失败处理；检查路由/部署版本，不跳成功页 |

## 11. 接手验收与发布

最小验收清单：

- 同一微信＋唯一手机号主账号；不同微信/账号/邀请及重复手机号候选都阻断。
- 成人/监护人、无需证件/需证件分支与requirements一致；更改基础资料进入人工核对。
- 前后面、不同证件类型、相册/拍摄、方向/裁切、水印、超大图片、部分上传失败/重试。
- 正脸/转头/同一人、零脸/多脸、距离不通过、拒绝摄像头、弱网/模型超时、主动选人工。
- 模型资源清单对应bin全部可下载；路径在正式和已登记预览目录都正确。
- pending/approved/rejected、两名独立审核员、冲突意见、退回重传、更正申请。
- 关闭网页再从固定入口重开，恢复原状态；换球员/换账号无资料串用，取消后的迟到结果不能回写。
- 核验通过后仍不自动入正式名单、生成登录权限或覆盖历史参赛快照；证件不进入卡片、埋点和公开资源。

本次可重跑的本地命令：

```powershell
node tools/test-registration-recovery.cjs
node tools/test-service-private.cjs
node tools/test-player-registration.cjs
node tools/test-service-entry-registration.cjs
node tools/check-data-governance.mjs
node tools/sync-data-center.mjs --check
```

前两项本次通过（service-private共18项），只是对应本地实现和隔离数据，**不证明当前线上恢复路由存在**。历史`test-parent-standard-profile-flow.js`当前有5项失败，包含“新建球员统一强制核验”旧断言和“OCR只保存脱敏号码”等；`test-basic-import-and-identity-contract.mjs`当前先失败于强制`identityVerificationRequired:true`断言。接手方需按现行产品规则区分旧测试与真实回归，不能通过恢复过时强制核验规则把脚本变绿。本次未改动这些运行代码或旧测试。

正式发布前重新下载当下线上函数包做必要差量，保留运行配置/依赖/未涉及模块；检查相对require，并对实际拟上传的webLoginApi目录执行`node tools/check-referee-backend-package.cjs <目录>`。网页继续零SDK，只有webLoginApi公开HTTP relay。任何生产发布/配置/数据库变更按当前任务授权执行；本交接文档不构成新增云端写入授权。

发布后须回下载比对、读回Active/配置、匿名拒绝探针，并同步对应已登记测试端；H5正式与`/preview/service-account-h5/`分别回读HTTP/摘要，共用正式后端必须明确记录。小程序两个AppID分别按其当前发布流程验收；未修改的小程序不要因文档或H5更新重传。不要用旧测试函数包覆盖正式后端。

## 12. 可直接发给其他会话的接入指令

> 请先读 `E:\Documents\sxf-football\docs\handoffs\IDENTITY_PHOTO_AUTH_INTEGRATION_2026-10-26.md`，按现有身份证照片与本人摄像头1:1平台核验能力接入本任务指定端口。账号继续走微信授权及唯一手机号主账号，不把本地比对当通用人脸登录、权威实名或赛事资格。先核对当前线上webLoginApi和prepareParentIdentityImage包，再决定最小修改。重点检查当前线上继续登记路由缺失、正式上传默认人工复核、本地与线上版本不一致、prepare函数本地源码缺失四项；不要复制旧包或依文件存在宣称在线。复用当前邀请、独立会话、requirements、上传/比对/双人审核状态，覆盖关闭WebView后重入和跨账号隔离。保留其他会话改动，禁止整包覆盖或自行迁移数据。实现、测试、生产授权、正式/测试发布和资源回读分别记录。

## 13. 关联规范与归档

- `AGENTS.md`：账号/租户/部署和知识库归档约束。
- `docs/PLAYER_REGISTRATION_EVENT_IDENTITY_STANDARD.md`：登记、名单和比赛核验分层；若历史段落与当前用户指令冲突，先核对新规则，不照抄旧认领门槛。
- `docs/releases/service-entry-registration-20261017.md`、`player-claim-identity-20261019.md`：服务号身份与后续认领修订。
- `docs/releases/registration-card-smooth-20261018.md`、`registration-id-input-20261018.md`、`registration-return-20261018.md`：制卡、身份证输入与恢复历史实现；上线状态以当前复核为准。
- `docs/data-center/README.md/CONTRACT.md/INTEGRATION.md`：稳定身份、授权与统一数据入口，不扩写竞技统计。

本文登记至白名单后，同步至 `E:\Documents\LLM-Wiki-Knowledge-Base\01_Raw\01_赛小蜂足球\小程序与PC\数据中心\研发交接\IDENTITY_PHOTO_AUTH_INTEGRATION_2026-10-26.md`，以同步脚本`--check`摘要为归档结果，不手工覆盖冲突镜像。
