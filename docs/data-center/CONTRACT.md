# 数据契约 v1

## 平台数据总站增量合同（2026-10-23）

新增 `football-data-hub/1` 读取合同，详见 [DATA_HUB_FOUNDATION.md](DATA_HUB_FOUNDATION.md)。平台运营中心是统一运营入口，不建立第二份统计真值。首次入驻日期与档案创建、入队时间分开；双球队关系来源保留证据并报告冲突；测试来源排除；估值快照与生涯积分版本匹配；五维缺失不补中性值。旧端调用范围与免费边界不因此扩大。代码部署、迁移和页面接入分别登记。

## 名单海报人员关联与展示排序（2026-10-17，1.1.35）

teamMembers原有范围校验不变。teamMemberView.withStaff仅投影有效coaches明确登记的linkedPlayerId，返回去重linkedPlayerIds、唯一linkedPlayerId及playerLinkState=linked/missing/conflict。同一已关联成员遇到两个不同球员ID时不选第一条，不按姓名或号码匹配；此投影不合并账号/球员、不授予读权限。头像兼容photoFileID/photoFileId/photo等既有字段。前端海报仅将其与本次已授权名单卡图按稳定ID关联，未取得卡图仍保留原登记头像/姓名/职务，不虚构卡级或参与人数。

海报cardTypeId来自统一卡读取服务的当前展示种类，按gold/silver/bronze作界面排序；兼容明确tier，未知后置，同种稳定。竞技tier及积分字段不因显示卡种排序而改变。工作人员位于球员区之前，只作职务视图，仍按原snapshot.playerIds统计名单。officialRoster新增tournament.logo，仅投影已授权赛事对象的字符串logo/logoUrl，无新增外部机构查询。失败/无权不装成缺卡，完整卡仅等比缩放或整体轻微转动，头像aspectFit且不增加底板。

## 正式名单资料卡（2026-10-16，1.1.29）

不变更officialRoster接口或统计算法。手机official-roster默认view消费snapshot.playerIds，只按稳定ID投影players中已授权资料及tournamentStats；去重成员ID，缺失档案保留待核对卡，不以姓名补配、不用整队players替代名单。未采集指标显示破折号，明确0保留，状态沿snapshot，不把资料完整冒充正式审核通过。

默认查看无勾选/提交操作；mode=select才进入原选人流程，snapshot草稿/退回及canManage允许后进入，提交仍经原服务端名单/组别/资格/截止时间校验。已提交审核中或已审/锁定不再当可编辑草稿。相同路由恢复可见重读；请求带精确team/tournament/division并沿当前授权空间，换账号或离页迟到响应不渲染。卡片为球队资料展示，不新建或改绘统一竞技球员卡。

## 球队赛事详情榜单与场次（2026-10-16，1.1.28）

teamTournamentDetail在原工作空间team.view/team.manage和精确team/division校验后，完整读取该队有效报名；排除removed/replaced等历史关系，优先当前已审核记录。返回schemaVersion=team-event-overview/1。summary.rank/rankTotal/points可为null，played来自完整本队完赛状态计数；客户端未知显示破折号，合法0保留。

teamEventOverview.cjs只在上述校验后建立本次只读统计能力：限定当前tournament/division及本队实际所在组的matchIds，调用既有data-center/service.cjs，不扩大通用用户权限，不把完整dataCenter、球员或私有档案返回客户端。standingsGroups只含组内球队ID/名称、名次、赛胜平负、净胜及积分；复用统一积分规则和排序，未取得正式名次的待赛队显示未排名，来源不明或读取失败不造分。赛事、球队、球员及比赛测试来源仍按统一规则排除。

matches为稳定球队ID对应、精确组别的完整已排场次，复用现有日期/时刻解析，取消/删除/替换不当待赛，只有单一明确组别才兼容历史缺组别场次。nextMatch取实际进行中/待赛/延期记录，scheduleState区分empty/scheduled/completed；没有新排场次不能造比赛，已有比赛全结束不能当“未公布”。roster继续按本队/组别查历史快照，不覆盖球员库或真实赛果。

## 全账号球队参赛摘要（2026-10-16，1.1.27）

getMiniWorkspace默认上下文新增participatingEntriesVersion=team-participation/1、participatingEntriesState=ready/failed、participatingEntriesError及participatingEntries。摘要跨当前空间，查询范围只来自homeEntries已核验且排除测试来源的team条目；按授权teamId使用统一reader完整读取tournament_teams、对应赛事与组别最小字段，不查询其他机构经营、球员或私人数据。当前空间teams/tournaments/registrations维持原范围，不能拿它们为空证明全账号无参赛。

每条包含稳定key/id、teamId/teamName、divisionId/divisionName、所属已验证workspaceId、赛事名称/LOGO/日期/统一生命周期状态及registrationStatus。key为赛事＋球队＋组别；排除撤销、替换、删除及synthetic来源，重复有效项优先已审。仅摘要投影，不写报名、资格、名单、比赛或统计。未知组别不凭队名合并；读失败返回failed而非已确认空，旧缓存缺版本继续加载。

手机字段格式器只预计算展示，不另行聚合成绩。赛事卡片明确参赛球队/组别，进入前重新回读全账号摘要，再按对应workspace/team/division走现有teamTournamentDetail授权。明确解码工作空间URL参数，球队关系失败不能进入主办控制台。

## 卡片共用与工作身份（2026-10-16，1.1.22）

workspace-entry-card是首页/赛事/球队共用的纯展示与点击组件；workspace-entry-cards工具统一格式化、稳定key和入口校验，不在组件计算竞技指标。球队页以已过滤来源的全账号homeEntries球队摘要显示，当前共享工作空间的teams=[]不能证明账号没有球队。赛事组织者使用已验证主办/共享卡片，球队管理者用当前已授权球队的registrations生成具体teamId/tournamentId/divisionId参赛卡，重复稳定元组去重，不按姓名合并。上下文缓存开始保留原服务已返回的registrations，服务端补divisionName，赛事投影补真实LOGO临时地址；未扩机构/球员数据范围。旧缓存缺参赛关系时等待刷新，不显示已证实空状态。

1.1.26起，miniPortalRolePreferences/version=1以稳定自然人账号ID分别记录team_coach（球队管理者）或organizer（赛事组织者）；旧miniPortalRole只作兼容迁移。退出清理认证/业务数据时仅保留此非敏感界面偏好，不保留手机号、令牌、名单或权限。未取得可信账号上下文时的临时默认值不能成为记忆。我的切换前重新取得空间目录，普通空间沿用setHomeIdentity，shared空间保持event_staff授权语义；选项仍只有两种，未授权选项不可选。身份只在成功切换后更新，资源切换、普通更新和退出重登不覆盖；跨账号独立，phone-canonical-v1协议不变。偏好不是后台鉴权依据，也不改users.role或teams权属。

首次无指定空间的loadContext先读取服务端已验证目录；如默认空间不能承载记忆的工作身份，再从该目录选择合适空间进行一次受限回读。明确资源/工作空间选择不被恢复覆盖。失权不伪造访问，失败不替换偏好；同一请求仍有超时，退出会使在途代次失效，超时/换账号后的迟到响应不保存上下文。

入口进入前切目标空间并回读资源/参赛关系。球队赛事明确view=team及workspaceId/teamId/divisionId，详情直接调用原teamTournamentDetail，失败显示可重试错误，不再回落主办或公共推断路径；组织者view=organizer不先加载球队参赛页，共享继续shared路由和模块权限。角色切换不改变teams.ownerId/claimedByUserId或自然人users.role，不新增授权。

## 小程序首页资源入口（2026-10-16）

1.1.20：homeEntries增加metaLines（已维护的地区、年龄组/成立年份，或赛事日期/地点），缺失不补占位。球队摘要增加playerCount和playerCountState，指本队球员库有效真实档案人数，不表示赛事正式资格。通过统一reader最小字段完整分页读取teamId及历史teamCode，稳定playerId去重；明确teamId不属于本队时不能凭teamCode借入，码映射歧义为未知。沿用statistics.synthetic排除测试球员，排除archived/deleted。完整空结果才为ready/0，任一读取失败或预算超限为failed/null，前端显示破折号。只有homeEntries已验证的球队可读此最小投影，仅共享赛事授权不会触发球员读取。图片地址解析与库存读取并行，不读手机号、姓名、证件、头像私有素材或竞技事实。

1.1.19：homeEntriesVersion=home-entries/2表示已按统一statistics.synthetic剔除已知虚拟/测试来源；球队、机构赛事及共享赛事同规则，sharedEvents透传synthetic布尔投影。旧缓存缺该版本时不渲染，也不当作已证实空账号。虚拟数据保留原数据库，不为整理首页而删除。

新增teamDeletionInfo/deleteEmptyTeam。前者返回isOwner/canDelete/reason/revision；后者须传teamId、workspaceId、完整资料摘要revision和confirmName，服务器核对本人权属及空队条件。teamOwnership供首页与删除共用，显式owner字段优先且须一致指向当前自然人，无权属字段才接受本人有效owner关系；creatorId、机构赛事权限或管理员角色不能授权删除。关联存在检查覆盖players及旧teamCode、player_team_memberships、player_transfers、tournament_teams、roster_snapshots、match_lineup_snapshots、matches稳定ID别名、match_events及registration_player_drafts；limit(1)只断言存在，非零球员/比赛摘要也拒绝。查询失败阻断，明确集合不存在才可跳过。确认后重查，再以doc事务CAS球队摘要、写team_deletion_audits并删球队文档，不级联删球员、账号或历史。关联范围检查在事务外，不宣称它是跨集合范围锁；未接入PC旧force删除链路。

getMiniWorkspace默认上下文新增homeEntries，只投影本人所有权或有效球队成员关系、已验证机构赛事管理权限和active赛事共享授权对应的摘要。每项key由type与稳定业务ID组成，含id/type/workspaceId/name/logo/coverUrl/badgeText/isShared/statusText/actionText；不同ID同名资源不合并。同一赛事已有机构管理入口时优先该入口，不再显示重复共享卡。球队主账号依据当前权属字段优先、无权属字段才取本人有效owner成员关系；其他可访问球队关系标管理员，不把创建预建队的creatorId当长期所有权。logo及coverUrl的云文件批量解析为临时地址，失败仅降级图片，不改变资源权限或隐藏入口。无封面由前端复用球场素材。

homeEntries跨已验证空间汇总最小摘要，teams/tournaments及球员、赛果仍维持当前空间原范围。除球员库人数所需的最小归属/来源字段外，不查球员私有档案、课程、财务或竞技统计；前端保存上下文时保留homeEntries，点击后switchWorkspace，再以新响应核验卡片与目标空间。不存在、撤权或账号变化不得沿旧卡跳转。所有权与成员摘要使用统一reader完整分页，达到预算或读取失败不能冒充完整空结果。不写比赛、名单或统计事实。

## 手机与PC战术阵容（2026-10-16）

详情的lineupRules为原赛事/组别人数与替补上限，独立于卡图状态。lineupLayout.home/away含formation及positions[{playerId,role}]，服务端在同一阵型目录下核对人数、合法位置、位置唯一、稳定球员ID唯一及本队正式名单，保存PC原lineups结构；role是该场战术位置，不改球员长期position或统计事实。旧保存入口保留已有有效战术；纸表只有首发集合完全相同才保留旧阵型与位置，不按号码顺序猜位置。缺战术者以待排位展示，不能因为卡图/战术信息未加载把实际人数记0。权限、版本和裁判锁定继续由原服务强制校验。见 `../releases/1.1.16.md`。

## 手机纸质报告识别草稿（2026-10-15，已并入体验版1.1.11）

1.1.17增量：本类双栏纸表左主右客分别定位，姓名表头错漏不能把一队范围扩为整表；标题和独立序号/姓名列构成边界证据。行候选evidenceSide明确来源侧，reviewPolygon/reviewHeaderPolygon为原上传图的实际斜行/表头四角，前端与reviewRegion共同裁切，不混入另一队或相邻行。局部复识别只在本侧处理，新增teamTransforms记录来源；缺失/冲突仍为候选，不由比分补造事件。analysis/7、完整性检查与回读见 `../releases/1.1.17.md`。

1.1.15增量：识别证据HMAC对JSON值递归规范化，字段顺序变化不改变签名，数组顺序保留。旧格式按已知生产字段顺序严格还原后验签，不重签未知数据或绕过凭证；修改比赛、文件、图摘要、规则或识别版本仍拒绝。只读验证通过不等于比赛已保存。手机保存失败保留已核对候选及确认状态，重试沿用原草稿；授权、签报锁定和事件版本约束保持。线上热修复已回读，见 `../releases/1.1.15.md`。

1.1.14增量：行候选的reviewRegion/reviewHeaderRegion为上传图像素坐标，imageQuality.regionCoordinateSpace须为uploaded_image；增强坐标在服务端逆变换后才返回。切片仅作识别核对证据，使用真实表头及该队该行，不改变身份、角色、事件或确认状态。缺少定位不能猜相邻行，查看/放大不自动确认。保存仍走原签名和稳定球员ID流程；旧草稿需重识别。发布与边界见 `../releases/1.1.14.md`。

1.1.13增量：保留号码未识别的有效名单行，不用0表示缺失；号码/姓名/勾号仅在同一表格行单元格内组合。正式身份必须由同队该行的号码候选与姓名候选共同唯一匹配稳定ID，不能靠最近姓名或名单序号补齐。小图增强不改原始证据摘要，识别质量元数据不是竞技事实；已清楚分钟不被部分结果回退，冲突和缺失保持待核对。后端已回读上线，小程序开发包已上传，体验版标记未代查，详见 `../releases/1.1.13.md`。

1.1.11：圈号只作原文分隔，不保存进球顺序字段，跨栏手写先绑定本队本行号码，再提取圈外分钟。只有身份、角色、分钟或人数冲突才要求人工核对；清楚候选无需逐行确认。局部复识别只增强不清楚行，不回退已清楚记录，不用比分或圈号补造分钟。8人制是本次用户确认的比赛规程，不作为其他比赛默认人数；超员保留冲突，不自动删人。单独箭头或缺分钟不生成换人事件，也不能据此声称上场区间完整。

沿用 PC `teams.home/away` 行结构：稳定 `playerId`、号码、姓名、首发/替补/不出场、换上/换下/进球/黄牌/红牌分钟、队长与门将。`roleConvention:tick_starter_blank_bench` 仅在本次识别明确启用“未打钩按替补”时出现；默认替补行带 `roleSource:blank_as_substitute`，未知标记保留核对反馈。圈号先按记录序号处理为候选，不与后续分钟拼成129等数值；冲突比分与分钟为未知，不能取第一项或零值。`annotations/rawLines/rawFields/reviewNotes` 保留核对依据；这些是识别候选，不进入竞技统计。

手机草稿绑定本人、机构、赛事、matchId、上传路径、24小时有效期及比赛/阵容版本，依据保存的识别证据签名确认。正式球员关联与赛果一致性由 PC 同一服务复核；相同图片幂等，签报锁定及已核定阵容不能被重识别覆盖。“确认赛果”仅在用户明确确认后将本场标为已结束，正式归档/统计沿用既有独立规则。

## 比赛事件换人规则

单场换人规则从锁定快照读取，次选组别已生效版本。首发仅初始化在场状态，不计换人次数。换下球员必须当前在场；换入球员须在场外，并能唯一关联本场稳定球员 ID。普通组别遵守换人次数、窗口和换回规程；free 组别不设人数和窗口上限，可否再次上场由 `substitutionReentryAllowed` 决定。罚下球员不能再次上场。未知规程、号码/姓名歧义、名单缺失、分钟缺失和过期整场事件数组均不能转成有效换人；历史异常显示原因，修正后才接受后续录入。

`updateMatch` 与 `serviceMatchWorkflow.addRefereeEvent` 共用 `dataCenter/shared/substitution.mjs`。已定版组别使用受控操作更新本组换人规则：校验当前 `rulesVersion`，记录上一版规则摘要，保留别的组别规则、替补席配置及赛事报名字段。主办方需要单场补录时，比赛已完赛且电子裁判报告未锁定；正式电子记录锁定后只读。

## 身份与归属

当前兼容 `players._id` 作为稳定球员 ID、`teams._id` 作为稳定球队 ID。`teamId` 与历史 `teamCode` 通过适配读取，不能以名称或号码合并身份。新转会沿用原球员 ID。

- `player_team_memberships`：`playerId, teamId, orgId, status, validFrom, validTo, transferId`。历史加入时间没有证据时为 null，并标记 `startTimeUnknown`。
- `player_transfers`：申请、目标球队确认、操作者、原因、状态及时间；请求标识去重。
- `roster_snapshots`、`match_lineup_snapshots`、比赛内阵容与 `match_events`：保存当时名单和比赛事实。转会不改写这些记录。

同机构转会使用事务结束旧关系、建立新关系、更新当前所属并确认申请。跨机构转会当前明确拒绝，错误码 `TRANSFER_CROSS_ORG_REQUIRES_REVIEW`；双方授权及隐私资料交接流程完成前不得自动执行。

## 统一调用

PC：`callFunction('dataCenter', { action, scope })`，经 webLoginApi 验证会话后转发，数据中心再次验证原会话。机构范围来自服务端账号；平台所有者可以查看平台范围。

小程序球员详情：`getMiniWorkspace` 的 `action:'teamPlayerDetail'`，传工作空间、teamId和playerId，服务端校验空间与球队权限后调用共享服务。当前main未登记通用dataCenter dispatcher；不能把接口规划当作已接入。参与赛事不自动授予全赛事个人数据。

H5：webLoginApi 的 `action:'publicDataCenter'`，必须指定已发布赛事。只统计 `schedulePublished` 或 `published` 的比赛，返回正式结果和公开姓名；不读取私有档案字段，不返回成员关系。

支持范围字段：`teamId, playerId, tournamentId, divisionId, matchId, sportType, mode, from, to`。`matchId` 精确限定一场比赛，不能用赛事范围替代本场榜单。

- `sportType` 当前只能为 football。
- `mode:official`：来源确认为真实比赛、真实球员的审核通过结果，以及符合现行规则的主办方赛后补录。已退回、冲突、取消、未开赛、测试球队、测试球员或明确标记测试的比赛不计入；比赛是否发布不构成真实比赛证明。球队、球员、赛事或比赛来源无法核定时标为未知，不作为零场或正式积分。测试球员即使挂在真实球队下也不参与正式统计。
- `mode:provisional`：正式结果加现场暂定结果。不得混同正式排名。
- `from` 包含开始时刻，`to` 不包含结束时刻；统一 ISO 时间格式。

响应包含 `schemaVersion, metricVersion, dataVersion, generatedAt, scope, accessScope, coverage, summary, teams, players, issues`；球员查询另含 `playerTotal` 和授权范围内的 `memberships`。
比赛详情的公开适配入口为 `webLoginApi.publicMatchRankings`，接收 `tournamentId, matchId`，先验证该比赛在既有赛事中心公开接口中可见，再调用同一统计引擎。其 `data` 包含单场 `scope, rankings, metrics, coverage, metricVersion, dataVersion`；不返回私有档案，不以其他比赛补齐本场数据。

## 赛事新闻发布

PC `newsCenter` 只允许赛事所属机构中有赛事管理权限的主办方读写 `tournament_news`。文章类型为 `match` 或 `daily`，单场只能关联已归档赛果；每日文章必须完整关联所选日期的全部正式赛果。保存时记录来源 `matchIds` 与赛果版本；发布时重新核验，H5 `webLoginApi.publicTournamentCenter` 只返回已发布且全部来源版本仍有效的文章，赛果发生更正后立即隐藏旧稿。封面、正文照片与积分榜图存云文件 ID；未核实的停赛信息不作推断。

`accessScope` 为 platform、authorized 或 published。普通组织查询的“球员历史”是当前授权范围内的历史，不能声称覆盖尚未获得访问授权的全部赛事。

## 指标与完整度

可执行指标字典：`cloudfunctions/dataCenter/shared/statistics.mjs` 的 METRICS。本实施分支为 `football-metrics/4`，新增可核定首发、真实／测试球队及球员来源过滤与球员卡派生分；正式环境仍须以部署回读版本为准。

球员行按球员、当时球队、赛事、组别形成；`metrics` 是可确认值，`observed` 是已有记录中的数值，`coverage` 描述每项指标是否完整。覆盖不足时 metrics 为 null，页面显示“—”，不能把 observed 当完整累计。
完整度按指标分别判断：缺失换人身份影响出场和时间，不把已确认的进球、红黄牌一起清空。

- 首发：在正式首发阵容中的不同比赛 ID。
- 球员卡积分：统一按 [球员卡积分与等级规则 v1](PLAYER_CARD_POINTS.md) 使用完整职业生涯的出场、首发、出场分钟和有效进球；积分与等级是派生结果，不能由客户端或人工档案字段直接写成统计真值。本实施分支已计算 `starts`，正式环境尚未切换。
- 球员卡高级权益：仅已核定积分达到 100 分时开放再次更换卡片展示照片和在平台背景库中自由切换；首次选图不受此门槛限制。权益由服务端校验，旧金卡等级、历史保留等级或客户端字段不能代替积分凭证。当前各端尚未接入这项权限。
- 出场：实际出场的不同比赛 ID；替补未上场不算出场。
- 进球：有效进球与已进点球；乌龙球、点球大战排除。
- 助攻：同一进球同一助攻者只计一次。
- 第二张黄牌：计一张黄牌、一张红牌；按有效事件版本计算。
- 时间：正式统计以赛前保存并核定来源及单位的单场总时长为边界，再按首发与上下场区间计算。已完赛时旧计时器和当前规则不得覆盖原时长；缺少可靠赛前证据为未知。现场暂定值可在已证实的单场边界内使用当前钟，不能混入正式积分。
- 球队进失球、胜平负：正式比分记录；比分缺失为未知。常规比分平局与点球决胜需通过赛事规则解释，不能用跨赛事的积分相加生成平台排名。

嵌入与外部事件按 eventId 和 revision 合并；外部相同版本优先，撤销标记生效。无 ID 的旧记录不按姓名生成永久身份；仅可用本场当时球队阵容中的唯一姓名与号码组合关联已经存在的 ID，歧义不关联。无法确定身份时进入质量队列。空事件数组仅在现有记录明确提供时作为已记录集合，只有外部事件但没有完整采集声明时标记为部分记录。

## 更新、读取与权限

当前按请求重算，不持久化另一份统计真值。修订原始事实后，下次查询自动生成新版本；暂未引入后台统计缓存与队列。后续引入汇总时必须保持可重建、更新传播和版本发布规则。

读取使用稳定 `_id` 游标和 100 条以内分页；SDK 实际返回短页也继续读取直到空页。默认单范围预算 20,000 条，超出返回 `DATA_SCOPE_TOO_LARGE`，不是成功返回前 20,000 条。索引错误、读取失败返回 `DATA_READ_FAILED`，不能降级为空。

公开数据、组织数据、个人私密档案分别授权；页面不能通过篡改 orgId、playerId、teamId 获得其他机构数据。

## 平台模板编辑 action（2026-10-01）

listPlayerCardTemplates、getPlayerCardTemplate、savePlayerCardTemplate、previewPlayerCardTemplate、publishPlayerCardTemplate、continuePlayerCardTemplatePublish、getPlayerCardTemplatePublishStatus、retryPlayerCardTemplatePublish 由 webLoginApi 会话校验后仅允许平台负责人访问。getActivePlayerCardTemplate 返回指定基础卡种活动模板及版本，不返回球员私有资料。save 携带 revision；preview 使用受控示例资料与正式 PNG 渲染器；publish 返回 pending/blocked/active，激活前不改变活动版本。


## 赛事与定向预装分类（2026-10-01）

本地候选分支 codex/player-card-preload 基于新卡发布修复版本 1b046eb4。编辑器增加全平台、球队、赛事、球员分类，定向范围绑定稳定对象 ID，金银铜分别配置。旧模板缺分类时兼容全平台。对象名称由服务端回读，不接受客户端名称作为关联依据。

用户已明确：预装是添加到球员 H5 卡库，与已有卡并存；不是替换基础卡。全平台／球队／赛事／球员预装模板均按模板 ID 保存独立活动状态和发布任务；同一对象可有多张同等级卡。旧未配置 preload 的基础模板保持原活动指针兼容。预装新卡不改 players.playerCardFileId；再次发布只更新该模板已制作的专属卡。已发布模板禁止改绑，须新建。

编辑器按具体对象名称＋稳定 ID 选择球队、赛事或球员。对象检索和发布管理仅限平台负责人。H5 listMyPlayerCards 对当前授权球员添加符合范围的已发布预装卡；赛事资格取最新正式名单 approved/locked，添加记录保留规则版本与名单快照证据。player_card_library 按球员＋模板去重，添加后的卡不因转队静默删除。卡级与换背景权益仍由统一积分服务核定。预装不是授予金卡等级。

本次仅本地实现与验证；未部署、未迁移生产记录。


H5 getMyPreloadedPlayerCard、previewMyPreloadedPlayerCard、saveMyPreloadedPlayerCard 独立读取／生成／保存专属卡，模板事实及文字样式来自服务端，不接受客户端姓名、卡级、成卡图片或源图替换。selectMyPlayerCard 只改 playerCardDisplayTemplateId，可显式选回基础卡；未主动选用时保持原展示卡。仅 H5 当前页已接入卡库与展示选择，其他端尚未读取新展示选择。最终预览、保存、再次发布使用同一 PNG 渲染器。布局新增纯色／两到三色渐变、方向、字体、斜体、字距、描边与阴影；旧布局补默认值并保持原纯色。

上线前须创建 player_card_library 与 player_card_layout_presets 集合，配合已有模板／版本／状态／发布任务／成卡集合，禁止客户端直接写入；需发布 webLoginApi 新模块、字体文件及 H5 编辑器脚本，验证真实微信本人／监护人会话。当前均为本地候选，未初始化线上集合、未部署、未迁移或替换真实球员卡。


## 排版方案复用（2026-10-01）

用户要求保存排版供其他卡沿用。平台负责人通过 savePlayerCardLayoutPreset 将文字布局及全部样式、人物大小／位置、国旗／队徽大小／位置保存为命名方案；listPlayerCardLayoutPresets 支持分页及名称检索，getPlayerCardLayoutPreset 返回经过同一校验器检查的配置。集合 player_card_layout_presets 保存方案、schemaVersion、创建人和时间，同名方案不覆盖，修改另存新名称。

沿用复制到当前卡草稿，仅修改 layout/photo/badges；卡名、背景、遮罩、等级、预装对象、球员事实、已发布版本和其他卡片均不改变。保存排版不等于保存卡片草稿或发布，不携带任何照片、卡面文件、球队或球员身份。应用后需预览并保存当前卡草稿，后续编辑与方案及其他卡互不联动。本地专项及页面联测通过；集合和接口未上线。

## 主办方完赛结算补充（2026-10-01）

`updateMatch.finishOrganizerMatch` 校验原赛事机构权限、比赛记录锁及 `expectedEventRevision`，在事务中核对事件版本和状态后保存 `finished` 与两套比分字段。完整嵌入事件数组由共享 `calculateMatchEventScore` 结算有效进球、已进点球和反向乌龙球；撤销、重复 ID 与点球大战不计常规比分。缺少事件数组保留手录兼容；明确空数组为 0:0；有效进球缺少球队时拒绝结算。不得改写正在裁判记录或已提交/锁定的记录。该动作不等于裁判报告审核、正式赛果发布或生产历史数据修复。

### 比赛弃赛

PC 比赛详情的弃赛操作按 `updateMatch.forfeitMatch` 写入，要求当前赛事的比赛管理权限、赛事/球队归属、`expectedEventRevision`、弃赛方为本场主客队之一，并且裁判未接管、无锁定记录、没有比赛事件。服务端固定生成弃赛方 0、对方 3 的完赛比分、胜方与 `resultType=forfeit`，写入前后值审计并更新既有小组/联赛积分；不创建进球事件。比分读取以弃赛结果为准，不从空事件数组覆盖为 0:0。已有比赛事件或裁判记录时拒绝直接弃赛，须走赛果复核流程。


## 球员卡统一快照（本地候选，2026-10-01）

权威源是后台正式比赛事实、稳定球员 ID、赛前保存的单场时长及配对确认的应援扣款。PC 档案字段和任何端的卡面颜色都不是竞技积分权威。共享实现位于 dataCenter/shared；各函数副本通过 sync-data-center 生成，禁止分别改公式。本次指标版本 football-metrics/6，保持现网 points/2、entitlements/2 和银45／金100门槛。

所有等级读取返回 playerCard：snapshotSchemaVersion、playerId、scope、mode、status、points、tier、progress、missing、reasonCodes、coverage、scoreVersion、metricVersion、entitlementVersion、careerDataVersion、supportDataVersion、snapshotRevision 和服务端权益。ready 时 progress 含 levelStart、nextAt、pointsToNext、percent；未知时 points／tier／progress 为 null。状态保留 unverified、scope_limited、test_data_excluded；请求失败由客户端单独标记，不转成 unverified 或 0。确认的 0 分仍是 ready、bronze、progress.percent=0。

snapshotRevision 包含事实版本、完整度、核验原因、规则和应援版本，不包含响应生成时间或签名图片 URL。dataVersion 也包含被排除／来源未知的候选记录、事件撤销修订和覆盖状态。playerId 是返回行筛选；同一事实范围的单人和批量查询采用相同生涯版本及快照。coverage.playerCardComplete 按稳定 ID 核验：无关场次只有在完整的稳定 ID 阵容和事件能证明未参与时才不阻塞目标球员；缺名单或身份／事件歧义仍待核定，不以当前队籍推断历史。

PC 新入口 dataCenter.playerDetail 返回授权范围的 statistics 与独立完整生涯 playerCard。服务端先执行范围鉴权；本届／球队数据不能冒充生涯总分。原 playerCard 入口保持兼容。小程序实际球员详情入口为 getMiniWorkspace.teamPlayerDetail，使用同一服务；2026-10-08 已核对生产并登记通用 getMiniWorkspace.dataCenter dispatcher。H5 私有卡库使用 listMyPlayerCards 批量快照，公开应援摘要使用同一构造器；不扩大公开档案权限。

### 单场时长证据

新场次在授权开赛工作流中保存 durationRulesSnapshot（football-match-duration/1）：matchId、minutesBasis(total 或 period)、minutes、periodCount（仅 period）、totalMinutes、source(kind/id/version)、frozenAt、kickoffAt。配置的 matchMinutes 在现有 halves／single UI 中表示每半场／每节，必须携带明确 periodMode 和节数；明确 total 输入不可再次乘节数。frozenAt 不得晚于开赛，来源范围必须匹配该场次。开赛后保留原快照，后来改组别／赛事规程不改历史。

正式分钟来自该快照限定下的首发／换上／换下／罚下区间，自由换回累加实际区间。历史规则证据缺失、冲突或无单位时分钟为 null，返回 MATCH_DURATION_* 原因；当前规程、旧计时器、90分钟和0都不能补成历史权威值。已完赛正式统计不采用旧钟；现场暂定可在已证实时长内显示当前钟。读取不生成历史快照，不执行自动回填。没有可靠证据的旧场次将保持待核定。

通用浏览器 matches 写入不得伪造 durationRulesSnapshot／rulesSnapshot；服务端保存钩子只处理未开赛场次，并用事务防止并发重复开赛覆盖快照。此代码尚未发布。

### 纸质裁判表的无序换人组

同队同分钟的换上/换下名单分别授权与核定，不推断逐人替换关系。confirmRefereeReport接收side、minute、inIds、outIds；兼容存储槽位带substitutionPairing=unordered_batch、substitutionBatchId与批次人数。读取时以批次集合展示，不把槽位映射当作谁替谁的事实；历史明确配对记录保持原语义。每名球员自己的进入/退出分钟定义出场区间；同批窗口一次、人数按实际换上数计。人数、名单身份、当前在场、罚下、换回与规则限制不放宽。

## 平台数据中心（2026-10-08）

统一查询新增 rankings（球员／球队指标榜）、records（有效判罚与比赛事件），并支持 groupName 范围。分组排名按赛事、竞赛组别、抽签小组隔离；正式结果与现场暂定分别返回。未知指标不记零、不列入指标排名；测试来源不进入正式统计。撤销或修订事件经 effectiveEvents 统一筛选。

catalog 返回授权范围内的球队、球员、赛事、组别及已审核最新名单的安全字段。球员与球队使用稳定 ID，当前队籍与历史统计归属分开；个人联系方式和证件不进入公开榜单。平台展示全平台授权范围，机构／赛事子账号仍限定所属或被授权范围。


## 积分参数与历史时长建议（2026-10-16）

平台模板鉴权后scoreRulesRead/Save/Preview/Begin/Continue管理配置。platform_settings内player-card-score-rules为活动/草稿指针；recordType为player_card_score_rule_version/publish/floor的记录分别保存历史、可恢复准备任务与稳定playerId的保留卡级。未配置默认V2，查询失败不伪造默认规则；后续版本按统一参数与保留记录计算。试算绑定修订、参数、操作者、数据摘要及15分钟证明，按25条准备完成后事务激活，不写球员或赛果。inspectDuration.suggestion来自锁定规程，仅作人工核实建议，不自动覆盖历史。详见PLAYER_CARD_POINTS.md及../releases/platform-score-rules-20261016.md。


## 2026-10-16 异常原始事实补录边界

平台负责人经savePlayerCardTemplate的auditRepairInspect/Save工作流处理已结束且未由裁判接管锁定的旧比赛。仅补缺失阵容或有来源依据的事件；稳定正式名单ID、提交版本、事件修订、完整事件与正式比分均须服务端校验。事务保存match_fact_repair_audit，不提供任意写积分或卡级接口。时长规则仍由统一证据解析，立洋杯专项修复只补历史durationVerification，不伪造赛前快照。


## 2026-10-16 个人记录参与范围

coverage.participationPolicy=recorded-participants/1；playerCardMatchIds按稳定球员ID保存其正式名单/实际事件关联，playerCardComplete仅在其实际关联范围校验来源，完整读取下无登记者由unlistedPlayerCardComplete确认0比赛指标。个人service与公开摘要调用同一playerCardScope；个人issues按影响范围过滤，整体数据质量issues不清除。非平台访问将playerCardComplete及playerCardMatchIds均裁剪到授权可见球员，不能用新增覆盖字段扩大身份或赛事信息访问。


## 2026-10-16 个人积分账单与申诉

accountingPolicy=evidence-points/1、creditedMetrics、uncreditedFields、breakdown与原metrics/coverage分离；原事实缺失不写0，奖励无依据不计。points-ledger/1账单按比赛说明各项得分，服务器严格对账；原始playerContributions不通过常规query输出。

申诉使用platform_settings/recordType=player_points_appeal与active指针；请求幂等、同人/场/项待处理去重、revision CAS。本人/监护绑定可提交及读取，负责人可处理；普通球队管理权不开放私人生涯。状态“依据已补录”需服务端确认账单版本变化，补原始事实仍遵守裁判锁。所有姓名、球队、积分来自受控记录，不采信客户端计分。
# 小程序个人空容器与基础创建（2026-10-18，本地待部署）

`getMiniWorkspace`仅在可信登录身份的授权目录读取成功且确无工作空间时，返回`currentWorkspace.type=personal`、保留的`personal:<userId>`显示ID、空permissions/capabilities及空业务数组，`workspaces=[]`。此显示ID不加入授权目录，所有既有业务action仍调用原归属/权限校验，不把它当机构或球队ID。网络失败、目录未读齐、身份冲突仍返回错误，不能转换为空容器。

`onboardingWorkspace.createEventSpace`沿用已存在的手机号账号及明确主办机构授权；可传orgId时再次核验该机构。手机基础创建传`entryPoint=mini_quick_create`、requestId、startDate/endDate，日期成对校验并保存为PC同字段。重试ID按服务端账号和requestId确定，已存在且内容指纹相同返回同一赛事；内容冲突或他人机构拒绝，不按名称合并。该创建只保存草稿，不生成参赛关系、名单、赛程、统计或收费。具体实现/发布状态见INTEGRATION和实施记录。

## 球员登记临时制卡（2026-10-18）

servicePlayerRegistration.preview在既有服务号/手机号/本队邀请/显式选择鉴权后验证资料和照片，仅返回制卡必要事实与指纹，不返回身份证、联系手机号或虚假授权状态；不写players或正式卡库。既有球员仍用playerCardForAuthorizedPlayer；新档案的精确未来稳定ID由服务端按会话和选择nonce生成，只读内部方法playerCardForAuthorizedRegistrationDraft复用同一完整数据读取与buildPlayerCard。该ID已存在则拒绝草稿路径，已知完整零记录可按现行规则计算初始预览，读取失败/未知/测试来源不默认铜卡。结果registrationPreview=true不可作为正式积分或授予凭证。

serviceEntryPlayerCard(draft=true)生成预览并将事实指纹、照片ID、构图、模板版本、私有预览令牌与15分钟期限写入service_entry_sessions；confirm=true只确认此临时构图。renderRequest防止迟到响应覆盖新预览，确认和正式提交均验证。最终serviceEntryJoinPlayer携带cardPreviewRequired及cardPreviewToken，资料/照片变化、未确认、过期、模板变化均拒绝；正确构图随正式登记事务写入。号码check_number只返回是否可用与中文提示，不返回其他球员姓名；提交仍以完整有效库及球队revision防并发占号。
