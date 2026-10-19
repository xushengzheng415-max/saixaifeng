# 球员注册、认领与通知专项交接（17日快照，已归档）

整理日期：2026-10-17。对象：下一位开发/测试人员及后续会话。**本轮交接只更新文档，不发布新包、不改版本号、不提交真实注册、不清理账号。**

## 2026-10-18接续说明

本文件下方是17日交接时的快照，不能继续据此判断线上接口缺失。18日已完成显式“查找→认领/新建”、正式登记必填、有效号码判重、百度抠图和统一球员卡人像微调；负责人手动占位与定向补资料独立。当前发布及验收边界以[18日发布记录](releases/player-registration-v2-20261018.md)和[当前注册标准](PLAYER_REGISTRATION_EVENT_IDENTITY_STANDARD.md)为准。未用真实手机号代做完整注册，不代表手机业务全链路已验收。

## 一、接手先看这五点

1. 用户刚确认“目前没问题了”，指的是**打开分享图片面板不再给自己误发登记回复**。该手机验收通过，不能扩展成整个注册/认领/审核链路通过。
2. 新产品规则是“球队先简洁建档，身份证核验按赛事需要开启”。球员/家长在服务号H5登记，管理人员在小程序操作。完整目标见[注册与核验标准](PLAYER_REGISTRATION_EVENT_IDENTITY_STANDARD.md)。
3. 当前有明确P0接口断点：H5经webLoginApi调用getMiniWorkspace的`acceptServiceTeamPlayer`和`acceptServiceTeamClaim`，线上getMiniWorkspace主入口均无这两个处理。不要把二维码生成成功当作登记成功。
4. 本地当前版本为**1.1.39**；CURRENT_STATUS记载该开发包由大名单海报任务上传。此前1.1.30是本会话历史上传号，**不能再用它覆盖当前版本**。版本号和何时升级由用户决定；本次分享关注状态修复只有后端发布。
5. 正式目录`E:\Documents\sxf-football`当前分支为`codex/platform-ops`，存在多任务混合未提交修改。不能切分支覆盖、reset、批量提交或整分支合入main。Gitee为可推送权威仓库，GitHub只读；本会话未提交/推送，也未执行飞书或Obsidian同步。

## 二、已确认目标与实际完成程度

| 事项 | 当前结论 |
|---|---|
| 邀请页精简 | 已实现并随历史开发包上传；保留球队、二维码用途、有效期和海报操作 |
| 服务号入队二维码 | 小程序`serviceFirst=true`，只接受service码；不再展示小程序码/复制小程序链接/转发卡片 |
| 邀请函海报 | 已实现并在用户手机截图出现：真实主账号姓名、同一手写字形、半透明黑底、短邀请语、纯图片分享、按钮上下居中 |
| 十句轮换 | 已实现十句邀请语，首次随机、后续轮换；不是十套不同背景模板 |
| 分享误发登记回复 | 2026-10-17后端最终修复，**用户手机已确认通过** |
| 已有名单球员认领本人H5账号 | 尚未完成专属认领全链路验收，不能用重新新增替代 |
| 成人/家长完整注册→球队确认 | 未完成全链路验收，仍须补接口、状态与待办闭环 |
| 不要求身份证的球队建档 | 产品已确认，旧代码仍有强制字段，不能宣称完全实现 |
| 赛事保险/资格/现场核验可选 | 目标已确认，分场景真实验收未完成 |
| 通知实际送达球队/球员 | 分享扫码入口与业务通知分开；入队待办、可处理入口和审核结果送达仍需真实验证 |
| PC/H5/知识库全面同步 | 本次不声称已同步；线上与本地H5已有不一致，见后文 |

相关的球队成员、参赛管理、本队赛程/比分修复见`releases/team-inner-pages-20261016.md`、`releases/team-match-scope-20261016.md`及`releases/match-detail-loading-20261016.md`。这些不能代替注册验收。

## 三、下一轮优先事项

### P0-1：补齐H5到后端的真实接口

本次只读核对的证据：

- 正式站`/service-account-h5/join-player.html`、`claim-team.html`、`service-entry.js`均HTTP 200。
- 线上service-entry.js调用`serviceEntryJoinPlayer`、`serviceEntryClaimTeam`；正式本地目录缺少这三个线上静态文件，必须先收回正式源码，不能下次整目录发布时丢掉。
- 已回下载在线webLoginApi包，`service-entry.js`与本地同名云函数模块逐字节一致；模块调用getMiniWorkspace的`acceptServiceTeamPlayer`、`acceptServiceTeamClaim`。
- 在线getMiniWorkspace主入口（14:00:01版）没有上述两动作。本地目前仅有原小程序`createTeamPlayerInvite`、`teamPlayerInvite`、`acceptTeamPlayerInvite`等动作。
- 证据：`.codex-artifacts/player-registration-handoff-20261017/service-entry-readback.json`及该目录只读下载包。

先补并测试服务端登记会话、手机号已验证状态、关注证明、gate用途/邀请范围、唯一自然人账号及球队授权，再进入共享业务逻辑。**不能通过跳过findCurrentUser、接受客户端userId/OpenID或放开数据库权限来修。** 服务号OpenID不能冒充小程序OpenID，既有手机号/账号冲突必须阻断。

### P0-2：真正区分建档、入队确认和赛事核验

`acceptTeamPlayerInviteForWorkspace`仍直接为新players写入`identityVerificationRequired:true`、`portraitRequired:true`；历史档案/邀请也有此遗留值。应按已确认标准修共享服务端规则，而不是只隐藏前端证件控件。

先跑“赛事不要求认证”的建档/确认闭环，再分别测投保、资格审核、现场核验。照片后补不能被旧五步进度/平台身份审核卡住。不得为纠正默认值批量清空历史证件、赛事资格或已审核快照；历史迁移另定精确范围与授权。

### P0-3：已有档案认领与归档重测

- 已有名单里的球员必须关联原playerId，不能只按姓名新建或合并；唯一手机号识别的是自然人账号，不代表只有一个孩子/球员档案。
- 无可靠关联时，需要受控的球员专属认领/核对入口。具体落地仍需实现和测试，不得把通用球队二维码描述成“已完成认领”。
- 原小程序预览`teamPlayerInviteForWorkspace`在账号/微信关联中使用`players.find(...)`；多孩子、跨档案及已归档资料要明确处理，不能直接取首条。
- `safeGetTeamPlayers`读取teamId/teamCode后去重，本身不排除archived。当前预览可能命中已移出但仍关联账号的旧档案，导致“重新注册”仍复用旧资料。
- 已绑定其他账号时沿授权迁移/人工核验，不清理users、不静默换绑、不用同名证明归属。

### P0-4：登记提交→球队可处理→结果触达

验证当前球队/空间待办出现的是实际入队确认事项，点击能进入并处理；不能把组委会身份审核任务、其他赛事的报名任务或管理员成员邀请混进来。球队确认结果必须回到本人/监护人H5，并记录业务通知各渠道状态。队员关系、教练/领队/队医等管理成员关系与正式赛事名单分开。

不要把“写入players”“资料完整”“消息queued”当作入队审核通过或手机通知送达。

### P1：补齐用户已提出但未闭环验证的细节

- 发送验证码后显示已发送/30秒倒计时，验证重复点击、失败及恢复；不二次消费验证码。
- 出生日期年/月/日三列选择，检查闰年、月末和成年边界。
- 需要证件时，核对确认放在证件照片下方，上传反馈区分已选择、上传中和服务端成功。
- 通知页面可返回，审核状态可刷新，队伍待办严格属于当前空间。
- 正式站两个入口HTML的title含已有U+FFFD乱码替换字符；脚本本身UTF-8有效且无替换字符。修源文件编码后验收，不能只检查HTTP 200。

## 四、本次真实测试对象（只读核对快照）

| 对象 | 稳定标识 | 接手时注意 |
|---|---|---|
| 陆零後足球队 | `6d00d0e56aabf9ff003e51dc0d315ce5` | 已有球队资产，不能重建或覆盖归属 |
| 本队郑旭升旧档案 | `5ff1e8726abb99c1000ede142b5790cb` | 本次交接复查为`status=archived`、`profileStatus=pending`，仍有本人账号关联；旧identity/portrait强制标志仍为true |
| 本次通用球员邀请 | `99324d996ad2350902acf9556fa23b98` | 不是郑旭升专属认领码；有效期和当前状态须重新读回 |
| 对应服务号gate | `df40db4d6ad23b8600e5e2362b1bec96` | 分享保护及扫码证明各有范围与有效期，不复用过期proof |

此前曾查到跨球队同名郑旭升档案。**禁止按姓名批量删除或合并。** 用户已经通过界面移出本队旧档案；本会话没有执行球员硬删除、账号删除或全量重置。移出是归档，不等于从零注册测试环境。继续认领测试优先沿明确原档案；从零注册测试使用明确隔离账号/球队/数据，不能进入真实统计。

## 五、分享误回复的根因与已验收修复

### 经过

1. 用户反复确认：只打开“分享图片”面板，就收到服务号“登记球员”；不需要发送，也没有主动扫码。
2. 早期仅凭SCAN记录推断用户扫了自己的码，判断不成立；SCAN证明微信渠道事件，不证明手动扫码意图。
3. 初版分享窗口过滤未覆盖重新关注后的旧状态：扫码证明subscribed=true，但既有service_account_bindings仍为unsubscribed/subscribed=false，begin查询subscribed=true返回空令牌，未建立窗口。
4. 最新版按既有有效账号关联建立分享窗口，签名scan/subscribe进入服务号登记入口时同步唯一既有账号的关注状态。用户随后明确确认“目前没问题了”。

### 不可回退的边界

- begin/end只允许当前授权球队的有效邀请；同一码、同一服务号微信、短期分享窗口且事件为SCAN才静默。
- 结束用随机令牌匹配；最长90秒，结束后保留15秒用于按原事件时间核对迟到回调。秒级时间粒度不能当成长期封禁。
- 对方扫码正常回复；首次关注事件和窗口外本人扫码保留；不能按“球队负责人”身份永久屏蔽登记。
- 关注状态不同于一次性订阅授权，不新增绑定、不改userId/OpenID、不授予通知配额；失效/迁移绑定排除，多账号冲突阻断。
- 模板“报名审核通知、入队审核通知、比赛开赛提醒”未修改；“登记球员”来自回调入口回复，不是这三个模板。

详见[初版](releases/invite-share-detection-20261017.md)、[最终修复](releases/invite-share-refollow-20261017.md)。本交接把最终手机验收标记为通过，早期记录中的“待手机复测”已由用户最新确认更新，其他测试不自动升级。

## 六、代码地图

| 范围 | 入口与作用 |
|---|---|
| 小程序邀请 | `miniprogram/pages/team/player-invite/player-invite.{js,wxml,wxss}`：serviceFirst、二维码校验、主账号署名、海报、纯图片分享及begin/end |
| 手写字形 | 同目录`invite-handwriting.js`、`invite-handwriting-core.js`；`tools/build-invite-handwriting.py`；核心留言/ASCII本地，其余姓名字形按Unicode分片只读下载 |
| 邀请海报素材 | `assets/team-invite-v2/`原始球场/字体/OFL；`assets/team-invite-handwriting-v1/`字形分片。云端`football/public-assets/...`；禁止替换回不稳定的loadFontFace兼容字体回退 |
| 旧字体助手 | `invite-poster-font.js`仍是历史文件，现行邀请页已不调用；文件存在不代表在用 |
| 分享后端 | `cloudfunctions/getMiniWorkspace/invitePosterShare.cjs`与`cloudfunctions/serviceAccountCallback/invitePosterShare.cjs`同源副本，必须一起同步；主入口保留begin/end动作 |
| 服务号回调 | `cloudfunctions/serviceAccountCallback/index.js`：签名、扫码/关注证明、分享静默、既有关注状态同步 |
| 邀请素材生成 | `cloudfunctions/tournamentRegistrationFlow/index.js`的`generateTeamPlayerInviteAssets`，必须传serviceFirst；不传仍可能落到legacy小程序码 |
| H5入口会话 | `cloudfunctions/webLoginApi/service-entry.js`：OAuth、SMS、服务号会话与登记/球队认领转发；静态三文件线上存在但尚未收回当前本地H5目录 |
| 原登记/资料/归档 | `cloudfunctions/getMiniWorkspace/index.js`：teamPlayerInvite、acceptTeamPlayerInvite、parentProfileInvite、archiveTeamPlayer等；`playerAccountTransfer.cjs`与data-center/membership.cjs保持既有归属保护 |
| 赛事资料分流 | parentProfileInviteForWorkspace的tournament/division范围及赛事requirements；不能用球队长期资料覆盖赛事快照 |
| 团队成员/名册 | 当前1.1.39大名单默认基准见[大名单规范](TEAM_ROSTER_POSTER_STANDARD.md)，不是邀请海报；人员按稳定关联，卡片复用统一套件 |

## 七、上线与仓库状态

交接只读核对的函数状态：

| 函数 | 最后修改 | 状态 | 备注 |
|---|---|---|---|
| getMiniWorkspace | 2026-10-17 14:00:01 | Active | 分享模块修复，关闭云端重装依赖 |
| serviceAccountCallback | 2026-10-17 13:59:46 | Active | 回调及分享模块修复，关闭云端重装依赖 |
| webLoginApi | 2026-10-16 23:03:53 | Active | 本轮只读回下载，未发布 |
| tournamentRegistrationFlow | 2026-10-09 00:27:31 | Active | 服务号二维码能力已存在，本轮未发布 |

最终分享修复从最新线上包差量发布，5902/6407全部文件与候选一致；环境变量/角色/VPC/运行时/内存/超时/handler保持。getMiniWorkspace和callback用完整依赖包、`installDependency=false`防止云端npm重装改变依赖。webLoginApi的裁判表OCR等正式能力不得被旧包覆盖。

下一次发布必须重新下载当时线上包，**不能直接复用本次证据目录当部署基线**。使用足球专用`E:\Documents\sxf-basketball\tools\sxf-cloud.ps1`，独立最小配置只列目标函数；批量functionRoot使用正式仓库内相对路径，避免Windows绝对路径被重复拼接。禁止在正式总配置下随意`--all`，禁止读取/打印凭据文件或覆盖全局登录。

仓库未提交状态和线上生产状态不同。旧分支/临时worktree/缓存包不能整包覆盖当前正式目录或后端；按明确文件/提交核对引入，保持其他会话修改。静态H5/主办方后台预览/正式发布各自遵循AGENTS；本轮交接没有替用户发布新前端或同步外部知识库。

## 八、继续验收顺序

- [ ] 先读AGENTS、当前标准、本文和数据中心README/CONTRACT/INTEGRATION；核对当前源码/线上包/版本。
- [ ] 收回线上三份H5静态源码并核验编码，补齐并测试服务号到getMiniWorkspace的受控动作。
- [ ] 在明确隔离数据上跑成人新登记：扫码→关注→手机号验证→基础资料/授权→提交；证件要求关闭时不得出现强制证件门槛。
- [ ] 球队本人账号收到当前球队待办，能进入确认/拒绝；本人H5显示结果，通知实际送达并有可核对记录。
- [ ] 老档案认领：沿原playerId；分别测已有可靠关联、无手机号/需专属邀请、已绑定其他账号、同名/多孩子候选、archived旧档案。
- [ ] 未成年人由监护人办理，多个孩子明确选择；不创建重复自然人账号。
- [ ] 赛事不核验、仅保险、资格审核、现场扫码分别测试；不得通过团队“资料完整”绕过赛事规则。
- [ ] 回归分享：已关注、取消后重新关注、仅打开面板、取消发送、真正接收人扫码、分享人之后主动扫码；保留用户已确认通过的行为。
- [ ] 统一记录各端发布/回读/真实手机验收、未完成事项与Git同步状态，再向用户交付。

运行专项：`node tools/test-invite-share-refollow.cjs`、`test-invite-poster-share.cjs`、`test-mini-invite-compact.cjs`、`test-invite-handwriting.cjs`；修改涉及共享数据机制还须`node tools/sync-data-center.mjs --check`、`node tools/test-data-center.mjs`、`node tools/check-data-governance.mjs`。本地PASS不代替实际包检查或真实账号验收。

## 九、可直接转交下一位的任务说明

> 先修注册闭环，不重画邀请海报，不调整1.1.39大名单定版，不自行升级版本。读取本交接及标准，先补H5服务号会话到getMiniWorkspace的两个受控动作，清理团队建档错误强制核验，并落实已有档案认领、归档候选和球队确认入队的状态/待办/通知闭环。保留当前共享后端、其他任务修改和所有真实历史数据。已验收分享误回复不得回退。发布用当时最新线上包差量、保留配置/依赖并回读；所有未验收点如实标注，不把用户对分享的确认扩展为整条注册已完成。
