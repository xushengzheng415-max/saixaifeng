/*
 * 由已确认的全链路画板生成 162 节点交付台账。
 * 仅读取原型、素材包及现有交付状态；不修改原型或正式代码。
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const boardFile = path.resolve(__dirname, '..', '..', 'saixiaofeng_football', '赛小蜂足球UI', '赛小蜂足球UI', '原型图2.0', '全链路画板', '2026-07-30-阶段版', 'board-data.js')
const routeBySourceSuffix = new Map([
  ['01-球队球员资料完成度.png', '/pages/team/official-roster/official-roster?teamId=:teamId&tournamentId=:tournamentId&divisionId=:divisionId'],
  ['03-赛事详情-主办视角.png', '/pages/tournament/detail/detail?id=:tournamentId (organizer state)'],
  ['04-赛前工作台.png', '/pages/tournament/pre-match/pre-match?id=:tournamentId'],
  ['05-赛程赛果.png', '/pages/tournament/schedule/schedule?id=:tournamentId'],
  ['06-赛中只读监控.png', '/pages/tournament/monitor/monitor?matchId=:matchId&tournamentId=:tournamentId'],
  ['07-赛后赛果复核.png', '/pages/tournament/review/review?matchId=:matchId&tournamentId=:tournamentId'],
  ['08-异常发起与跟踪.png', '/pages/tournament/exception/exception?matchId=:matchId&tournamentId=:tournamentId'],
  ['09-赛事详情-球队视角.png', '/pages/team/participation/participation?teamId=:teamId (current tournament state)'],
  ['06-球队详情.png', '/pages/team/team'],
  ['07-球队球员库.png', '/pages/team/player-library/player-library?teamId=:teamId'],
  ['08-三字段添加球员.png', '/pages/team/player-add/player-add?teamId=:teamId'],
  ['09-家长协作链接.png', '/pages/team/parent-collaboration/parent-collaboration?teamId=:teamId&playerId=:playerId'],
  ['10-球员资料进度.png', '/pages/team/profile-progress/profile-progress?teamId=:teamId'],
  ['11-球员资料异常.png', '/pages/team/profile-exception/profile-exception?teamId=:teamId&playerId=:playerId'],
  ['12-赛事正式名单.png', '/pages/team/official-roster/official-roster?teamId=:teamId&tournamentId=:tournamentId&divisionId=:divisionId'],
  ['13-名单审核退回.png', '/pages/team/official-roster/official-roster?teamId=:teamId&tournamentId=:tournamentId&divisionId=:divisionId (returned state)'],
  ['14-单场比赛阵容.png', '/pages/match/squad/squad?matchId=:matchId&teamId=:teamId'],
  ['14-1-选择球员弹窗.png', '/pages/match/squad/squad?matchId=:matchId&teamId=:teamId (player-picker state)'],
  ['15-阵容提交结果.png', '/pages/match/lineup-result/lineup-result?matchId=:matchId&teamId=:teamId'],
  ['16-阵容退回与重新提交.png', '/pages/match/lineup-returned/lineup-returned?matchId=:matchId&teamId=:teamId'],
  ['17-简易版球队数据包.png', '/pages/team/data-package/data-package?teamId=:teamId&tournamentId=:tournamentId&divisionId=:divisionId'],
  ['18-数据包赛事数据.png', '/pages/team/data-package-events/data-package-events?teamId=:teamId&tournamentId=:tournamentId&divisionId=:divisionId'],
  ['19-赛事邀请-接收预建队.png', '/pages/team/prebuilt-invite/prebuilt-invite?inviteId=:inviteId'],
  ['20-赛事邀请-新建球队参赛.png', '/pages/team/create-team-invite/create-team-invite?inviteId=:inviteId'],
  ['21-球队资料.png', '/pages/team/profile/profile?teamId=:teamId'],
  ['22-球队成员.png', '/pages/team/members/members?teamId=:teamId'],
  ['23-参赛管理.png', '/pages/team/participation/participation?teamId=:teamId'],
  ['24-历史参赛记录.png', '/pages/team/history/history?teamId=:teamId'],
  ['05-创建球队.png', '/pages/onboarding/onboarding?scene=team&step=team'],
  ['02-无球队状态.png', '/pages/teams/index (no-team state)'],
  ['01-球队中心.png', '/pages/teams/index'],
  ['01-我的.png', '/pages/profile/profile'],
  ['02-消息中心.png', '/pages/messages/index'],
  ['03-切换身份.png', '/pages/profile/profile (identity sheet state)'],
  ['05-工作空间访问受限.png', '/pages/workspace/restricted/restricted?orgId=:orgId'],
  ['00-PC官网广告页.png', '/'],
  ['01-PC登录后台.png', '/admin/#/login'],
  ['0、赛事空间/赛事空间.png', '/admin/#/tournament-space'],
  ['赛事空间-创建赛事-基础信息.png', '/admin/#/tournaments/create'],
  ['1、赛事主控台/赛事主控制台.png', '/admin/#/tournaments/:id'],
  ['01-微信登录.png', '/pages/login/login'],
  ['01-选择业务场景.png', '/pages/onboarding/onboarding'],
  ['01A-选择业务场景-管理球队.png', '/pages/onboarding/onboarding?scene=team'],
  ['02-完善最小资料.png', '/pages/onboarding/onboarding?step=team'],
  ['03-创建完成.png', '/pages/onboarding/onboarding (完成 createTeam 后的成功状态)'],
  ['01B-选择业务场景-举办赛事.png', '/pages/onboarding/onboarding?scene=event'],
  ['04-举办赛事-完善资料.png', '/pages/onboarding/onboarding (event profile state)'],
  ['05-举办赛事-创建完成.png', '/pages/onboarding/onboarding (createEventSpace success state)'],
  ['06-青训教务-服务说明-未开户.png', '/pages/onboarding/onboarding (training service state: inactive)'],
  ['07-青训教务-服务说明-已开户.png', '/pages/onboarding/onboarding (training service state: active)'],
  ['08-青训教务-完善资料.png', '/pages/onboarding/onboarding (training profile state)'],
  ['09-青训教务-创建完成.png', '/pages/onboarding/onboarding (createTrainingWorkspace success state)'],
  ['10-青训教务-功能演示.png', '/pages/onboarding/onboarding (read-only training demo state)'],
  ['01-首页-赛事主办场景.png', '/pages/home/home'],
  ['02-首页-球队协作场景.png', '/pages/home/home'],
  ['03-首页-青训经营场景.png', '/pages/home/home'],
  ['竞赛管理-组别管理-5个组别最终版.png', '/admin/#/tournaments/:id/competition'],
  ['竞赛管理-添加组别-基础创建.png', '/admin/#/tournaments/:id/competition/create'],
  ['竞赛管理-组别管理-简易与专业模式对比.png', '/admin/#/tournaments/:id/competition/create?view=mode-compare'],
  ['竞赛管理-组别管理-卡片菜单.png', '/admin/#/tournaments/:id/competition (division row menu state)'],
  ['竞赛管理-U16组-简化版-步骤1-赛制设置.png', '/admin/#/tournaments/:id/competition/rules?divisionId=:divisionId&step=format'],
  ['竞赛管理-U16组-简化版-步骤2-基础规则.png', '/admin/#/tournaments/:id/competition/rules?divisionId=:divisionId&step=rules'],
  ['竞赛管理-U16组-简化版-步骤3-规则定版.png', '/admin/#/tournaments/:id/competition/rules?divisionId=:divisionId&step=finalize'],
  ['竞赛管理-U16组-规则定版-已生效.png', '/admin/#/tournaments/:id/competition/rules?divisionId=:divisionId&step=effective'],
  ['竞赛管理-U16组-专业版-步骤1-赛制结构.png', '/admin/#/tournaments/:id/competition/rules?divisionId=:divisionId&step=format'],
  ['竞赛管理-U16组-专业版-步骤2-参赛资格.png', '/admin/#/tournaments/:id/competition/rules?divisionId=:divisionId&step=eligibility'],
  ['竞赛管理-U16组-专业版-步骤3-比赛执行.png', '/admin/#/tournaments/:id/competition/rules?divisionId=:divisionId&step=execution'],
  ['竞赛管理-U16组-专业版-步骤4-积分排名.png', '/admin/#/tournaments/:id/competition/rules?divisionId=:divisionId&step=ranking'],
  ['竞赛管理-U16组-专业版-步骤5-晋级规则.png', '/admin/#/tournaments/:id/competition/rules?divisionId=:divisionId&step=advancement'],
  ['竞赛管理-U16组-专业版-步骤6-规则定版.png', '/admin/#/tournaments/:id/competition/rules?divisionId=:divisionId&step=finalize'],
  ['竞赛管理-U16组-专业版-规则定版-已生效.png', '/admin/#/tournaments/:id/competition/rules?divisionId=:divisionId&step=effective'],
  ['球队管理-参赛球队-简易版.png', '/admin/#/tournaments/:id/teams?divisionId=:divisionId'],
  ['球队管理-查看球队-简易版.png', '/admin/#/tournaments/:tournamentId/teams/:teamId?divisionId=:divisionId'],
  ['球队管理-加入申请-简易版.png', '/admin/#/tournaments/:id/teams?divisionId=:divisionId&tab=pending'],
  ['球队管理-球队变更-简易版.png', '/admin/#/tournaments/:id/teams?divisionId=:divisionId&tab=cancel_requested'],
  ['抽签与分组-模式选择.png', '/admin/#/tournaments/:id/draw?divisionId=:divisionId'],
  ['抽签与分组-快速模式-分组设置.png', '/admin/#/tournaments/:id/draw?divisionId=:divisionId&mode=quick&view=config'],
  ['抽签与分组-快速模式-分组操作台.png', '/admin/#/tournaments/:id/draw?divisionId=:divisionId&mode=quick&view=console'],
  ['抽签与分组-快速模式-分组操作台-联赛制.png', '/admin/#/tournaments/:id/draw?divisionId=:divisionId&mode=quick&view=console&format=league'],
  ['抽签与分组-快速模式-分组操作台-淘汰赛.png', '/admin/#/tournaments/:id/draw?divisionId=:divisionId&mode=quick&view=console&format=cup'],
  ['抽签与分组-快速模式-分组操作台-混合制.png', '/admin/#/tournaments/:id/draw?divisionId=:divisionId&mode=quick&view=console&format=hybrid'],
  ['01-青训未订阅.png', '/pages/training/index（当前机构 training.canUse=false）'],
  ['02-青训运营概览.png', '/pages/training/index（当前机构 training.canUse=true 且有 education 岗位权限）'],
  ['03-青训无岗位权限.png', '/pages/training/index（当前机构已订阅但无 education 岗位权限）'],
  ['04-球队认领冲突.png', '/pages/team/claim-conflict/claim-conflict?inviteId=:inviteId'],
  ['01-球队球员参赛全链路.png', '/pages/tournament/flow-handoff/flow-handoff?mode=player'],
  ['02-比赛执行责任交接.png', '/pages/tournament/flow-handoff/flow-handoff?mode=match'],
  ['03-专业版正式名单形成.png', '/admin/#/tournaments/:id/teams/:teamId/roster?divisionId=:divisionId&mode=professional'],
  ['01-简易版裁判录入比赛事件.png', '/service-account-h5/（裁判授权后进入当前指派场次）'],
  ['球队管理-发送认领提醒-专业版.png', '/admin/#/tournaments/:id/teams?divisionId=:divisionId&mode=professional&action=claim-invite&tournamentTeamId=:tournamentTeamId'],
  ['赛程管理-修改生成规则-影响确认弹窗.png', '/admin/#/tournaments/:id/schedule?view=editor&generator=rules&confirmImpact=true'],
  ['01-赛事中心.png', '/pages/event/index'],
  ['02-赛事待办.png', '/pages/todo/index'],
  ['比赛管理-U8组-赛果复核与归档.png', '/admin/#/tournaments/:id/match/:matchId/review'],
  ['抽签与分组-快速模式-分组结果.png', '/admin/#/tournaments/:id/draw?divisionId=:divisionId&mode=quick&view=result'],
  ['球队管理-生成球队邀请-专业版.png', '/admin/#/tournaments/:id/teams?divisionId=:divisionId&mode=professional&action=invite'],
  ['裁判管理-裁判库与赛事指派.png', '/admin/#/tournaments/:tournamentId/referees'],
  ['球队管理-快速添加球队-专业版.png', '/admin/#/tournaments/:id/teams?divisionId=:divisionId&mode=professional&action=quick-add'],
  ['球队管理-参赛球队-专业版.png', '/admin/#/tournaments/:id/teams?divisionId=:divisionId&mode=professional'],
  ['球队管理-查看参赛名单-专业版.png', '/admin/#/tournaments/:id/teams/:teamId/roster?divisionId=:divisionId&mode=professional'],
  ['球队管理-球员管理-专业版.png', '/admin/#/tournaments/:id/teams/:teamId/players?divisionId=:divisionId&mode=professional'],
  ['02-主办方实名与名单异常看板.png', '/admin/#/tournaments/:id/roster-exceptions?divisionId=:divisionId'],
  ['球队管理-名单变更-专业版.png', '/admin/#/tournaments/:id/roster-changes?divisionId=:divisionId&mode=professional'],
  ['球队管理-加入申请-专业版.png', '/admin/#/tournaments/:id/teams?divisionId=:divisionId&mode=professional&tab=pending'],
  ['球队管理-查看球队-专业版.png', '/admin/#/tournaments/:tournamentId/teams/:teamId?divisionId=:divisionId&mode=professional'],
  ['抽签与分组-专业模式-球队池.png', '/admin/#/tournaments/:id/draw?mode=professional&step=pool'],
  ['抽签与分组-专业模式-抽签设置.png', '/admin/#/tournaments/:id/draw?mode=professional&step=setup&divisionId=:divisionId'],
  ['抽签与分组-专业模式-大屏设置.png', '/admin/#/tournaments/:id/draw?mode=professional&step=screen'],
  ['抽签与分组-专业模式-抽签操作台-开始抽签.png', '/admin/#/tournaments/:id/draw?mode=professional&step=console'],
  ['抽签与分组-专业模式-抽签操作台-抽签介绍.png', '/admin/#/tournaments/:id/draw?mode=professional&step=console&stage=intro'],
  ['抽签与分组-专业模式-抽签操作台-队伍展示.png', '/admin/#/tournaments/:id/draw?mode=professional&step=console&stage=teams'],
  ['抽签与分组-专业模式-抽签操作台-小组赛.png', '/admin/#/tournaments/:id/draw?mode=professional&step=console&stage=slots&format=group'],
  ['抽签与分组-专业模式-抽签操作台-联赛.png', '/admin/#/tournaments/:id/draw?mode=professional&step=console&stage=slots&format=league'],
  ['抽签与分组-专业模式-抽签操作台-淘汰赛.png', '/admin/#/tournaments/:id/draw?mode=professional&step=console&stage=slots&format=knockout'],
  ['抽签与分组-专业模式-抽签操作台-混合制对阵图.png', '/admin/#/tournaments/:id/draw?mode=professional&step=console&stage=slots&format=hybrid'],
  ['抽签与分组-专业模式-分组结果.png', '/admin/#/tournaments/:id/draw?mode=professional&step=result'],
  ['赛程管理-赛程总览.png', '/admin/#/tournaments/:id/schedule'],
  ['赛程管理-生成赛程-基础设置.png', '/admin/#/tournaments/:id/schedule?view=editor&generator=basic'],
  ['赛程管理-生成赛程-场地与时间.png', '/admin/#/tournaments/:id/schedule?view=editor&generator=venues'],
  ['赛程管理-生成赛程-编排规则.png', '/admin/#/tournaments/:id/schedule?view=editor&generator=rules'],
  ['赛程管理-生成赛程-预览确认.png', '/admin/#/tournaments/:id/schedule?view=editor&generator=preview'],
  ['赛程管理-赛程编排工作台-v2.png', '/admin/#/tournaments/:id/schedule?view=editor'],
  ['赛程管理-冲突检测.png', '/admin/#/tournaments/:id/schedule?view=editor&panel=conflicts'],
  ['赛程管理-手动修改场次-编辑弹窗.png', '/admin/#/tournaments/:id/schedule?view=editor&panel=conflicts&editMatchId=:matchId'],
  ['比赛管理-选择组别.png', '/admin/#/tournaments/:id/matches'],
  ['比赛管理-U8组-比赛列表.png', '/admin/#/tournaments/:id/matches?divisionId=:divisionId'],
  ['比赛管理-U16组-比赛列表.png', '/admin/#/tournaments/:id/matches?divisionId=:divisionId'],
  ['比赛管理-U16组-赛中只读监控.png', '/admin/#/tournaments/:id/match/:matchId/monitor'],
  ['比赛管理-U16组-比赛归档详情.png', '/admin/#/tournaments/:id/match/:matchId/archive'],
  ['比赛管理-U8组-实时监控.png', '/admin/#/tournaments/:id/match/:matchId/monitor'],
  ['比赛管理-U8组-赛后资料接收与补充.png', '/admin/#/tournaments/:id/match/:matchId/post-match'],
  ['05-裁判移动执行/02-专业版我的比赛任务.png', '服务号 OAuth 完成后的裁判工作台首页'],
  ['03-家长服务页/01-家长进入-匹配孩子.png', '/service-account-h5/?parentInvite=:token'],
  ['03-家长服务页/02-确认基础资料.png', '家长 OAuth 会话 → 确认基础资料'],
  ['03-家长服务页/03-上传身份证实名.png', '确认基础资料 → 上传身份证实名'],
  ['03-家长服务页/04-实名认证结果.png', '实名提交 → 审核状态结果'],
  ['03-家长服务页/05-标准形象照拍摄指引.png', '实名认证通过 → 标准形象照拍摄指引'],
  ['03-家长服务页/06-标准形象照取景框.png', '拍摄指引 → 标准形象照取景框'],
  ['03-家长服务页/07-人像分割与效果确认.png', '人像分割完成 → 透明效果确认'],
  ['03-家长服务页/08-资料提交成功.png', '透明人像确认 → 资料提交成功'],
  ['05-裁判移动执行/03-专业版比赛报到与到场确认.png', '我的比赛任务 → 指派场次'],
  ['05-裁判移动执行/04-专业版双方阵容与身份核验.png', '裁判工作台 → 指派场次 → 阵容核验'],
  ['05-裁判移动执行/05-专业版实时比分与事件记录.png', '裁判工作台 → 指派场次 → 实时记录'],
  ['05-裁判移动执行/06-专业版裁判报告.png', '裁判工作台 → 已结束场次 → 裁判报告'],
  ['05-裁判移动执行/07-专业版电子记录确认与签字.png', '裁判报告保存 → 电子记录确认'],
  ['05-裁判移动执行/08-专业版提交成功.png', '电子记录签字提交 → 待主办方复核'],
  ['05-裁判移动执行/09-专业版退回修正与重新签字.png', '主办方退回 → 裁判限定修正 → 重新签字'],
  ['02-专业模式/比赛管理-U16组-赛果复核.png', '/admin/#/tournaments/:id/match/:matchId/review']
])

const evidenceBySourceSuffix = new Map([
  ['抽签与分组-快速模式-分组操作台-混合制.png', { buttonDestination: 'verified：返回分组设置及赛制切换均保留当前赛事/U14；确认混合制分组 → 当前 U14 的 view=result&format=hybrid', flowTransition: 'verified：12 支当前组别已审核球队形成联赛阶段排序；晋级名额仅允许 2/4/8，8强种子顺序为 1/8、4/5、2/7、3/6。清空/随机/名额切换仅改当前草稿；确认作用域为 qa-tournament-2026/qa-division-u14/type=hybrid/status=draft，generatedMatches=7、published=false、deletedPublished=false、deletedCompleted=false、deletedArchived=false、deletedOtherDivisions=false、deletedOtherTypes=false；淘汰赛槽位只记录联赛名次来源，不提前绑定球队', visual: 'visual-1:1-passed：1671 × 941 最终截图 .tmp/pc-visual-qa/draw-quick-console-hybrid-final-v3.png；三栏12队池、联赛排序、前8晋级、种子签位树、校验和固定操作栏完整入屏；4强切换 .tmp/pc-visual-qa/draw-quick-console-hybrid-advance4-final.png，清空态 .tmp/pc-visual-qa/draw-quick-console-hybrid-clear-final.png', buildVerification: 'npm run build-passed：2026-08-13，QuickHybridConsole.vue；混合制联赛表草稿与待排名锁定的 tournament_bracket 草稿均已编译' }],
  ['抽签与分组-快速模式-分组操作台-淘汰赛.png', { buttonDestination: 'verified：返回分组设置 → qa-tournament-2026/U10 quick config；赛制切换保留当前赛事/组别；确认淘汰赛签位 → 当前 U10 分组结果 view=result&format=cup', flowTransition: 'verified：8 支当前组别已审核球队进入 A1/A3/A5/A7 与 B1/B3/B5/B7，16 签位空位按轮空处理；清空/随机只改当前草稿。确认作用域为 qa-tournament-2026/qa-division-u10/type=cup/status=draft，generatedMatches=8、published=false、deletedPublished=false、deletedCompleted=false、deletedArchived=false、deletedOtherDivisions=false、deletedOtherTypes=false', visual: 'visual-1:1-passed：1672 × 941 最终截图 .tmp/pc-visual-qa/draw-quick-console-cup-final-v3.png；待排8队、A/B各8签位、左右晋级路径、中央决赛、校验和固定操作栏完整入屏；清空态 .tmp/pc-visual-qa/draw-quick-console-cup-clear-final.png，随机态 .tmp/pc-visual-qa/draw-quick-console-cup-random-final.png', buildVerification: 'npm run build-passed：2026-08-13，QuickHybridConsole.vue；独立 cup 签位树、tournament_bracket 草稿快照与受保护替换边界已编译' }],
  ['抽签与分组-快速模式-分组操作台-联赛制.png', { buttonDestination: 'verified：返回分组设置 → 当前赛事/U14 config；赛制切换 → 保留当前 tournamentId/divisionId 的对应 format console；确认联赛排序 → 当前赛事/U14 分组结果', flowTransition: 'verified：12 支当前组别已审核球队生成单循环 11 轮/66 场草稿；清空与随机仅修改当前草稿。确认作用域为 qa-tournament-2026/qa-division-u14/type=league/status=draft，published=false、deletedPublished=false、deletedArchived=false、deletedOtherDivisions=false，不覆盖已发布、已完赛或其他组别赛程', visual: 'visual-1:1-passed：1671 × 941 最终截图 .tmp/pc-visual-qa/draw-quick-console-league-final-v5.png；三栏球队池、12队排序、前三轮预览、66场汇总、校验与固定操作栏完整入屏；清空态证据 .tmp/pc-visual-qa/draw-quick-console-league-clear-final-v3.png', buildVerification: 'npm run build-passed：2026-08-13，QuickHybridConsole.vue；联赛草稿生成、保护已发布/已完赛/归档与跨组数据逻辑已编译' }],
  ['00-PC官网广告页.png', { buttonDestination: 'verified：立即登录与免费开始使用 → /admin/#/login；了解功能 → #features；无会话不进入后台受限页', flowTransition: 'verified：官网广告页 → 后台登录，认证完成后按当前账号机构关系分流；本地点击已到达 /admin/#/login', visual: 'visual-captured-major-fixed：1920 × 1080 截图 .tmp/pc-visual-qa/pc-landing-1920x1080-v1.png；已对照顶部导航、中心定位文案、功能标签、双 CTA 与三张指标卡', build: 'PC npm run build passed：2026-08-11；根站点入口已作静态语法与点击去向验证，/admin/ 子目录入口保留' }],
  ['01-PC登录后台.png', { buttonDestination: 'verified：微信扫码授权 → /admin/#/wechat-callback → webLoginApi；成功后清理旧会话并进入当前账号可访问空间；本地目标视口已实点右上关闭，返回官网', flowTransition: 'verified：state 保留在当前会话用于回调校验；网页登录使用 unionId/wechatOpenId 识别，重复账号阻断，不按固定手机号推断身份；本地关闭转场到 https://saixiaofeng.com/ 已实测', visual: 'visual-accepted：已复核批准素材包；1920 × 1080 `.tmp/pc-visual-qa/pc-login-final-1920x1080-v4.png` 对齐暗色遮罩、深绿外卡、白色扫码内卡、二维码区域、扫码提示与关闭操作；关闭转场证据 `.tmp/pc-visual-qa/pc-login-close-transition-1920x1080-v2.png`', build: 'PC npm run build passed：2026-08-11；浏览器端零 SDK，登录经 webLoginApi HTTP' }],
  ['0、赛事空间/赛事空间.png', { buttonDestination: 'verified：创建赛事 → /tournaments/create；目标视口已实点创建卡，进入正式创建页；赛事卡与进入按钮 → 当前 tournamentId 主控台；卡片菜单可进入或编辑基础信息', flowTransition: 'verified：只读取当前机构 orgId 的赛事；2026-08-13 本地 QA 点击创建新赛事后到 /tournaments/create，未写入任何赛事；创建成功后才进入新赛事上下文', visual: 'visual-accepted：已复核批准素材包；1586 × 992 `.tmp/pc-visual-qa/tournament-space-final-1586x992-v2.png` 对齐顶部工作台、深绿横幅、创建入口、三张赛事卡和使用说明。', build: 'PC npm run build-passed：2026-08-09，TournamentSpace.vue' }],
  ['赛事空间-创建赛事-基础信息.png', { buttonDestination: 'verified：返回赛事空间 → 未保存内容确认；保存草稿 → 当前机构草稿；本地目标视口已执行创建赛事并进入以临时赛事 ID 为参数的主控制台路由', flowTransition: 'verified：新赛事仅通过当前机构 orgId 写入；2026-08-13 QA 使用隔离 qa-org 创建 qa-tournaments-1786559464179 并到 /tournaments/qa-tournaments-1786559464179；未完成基础信息不能进入赛事主控台，保存失败保留表单', visual: 'visual-accepted：已复核批准素材包；1586 × 992 `.tmp/pc-visual-qa/tournament-create-basic-recheck-1586x992-v1.png` 对齐导航、预填基础表单、实时预览、后续步骤和固定操作条；创建转场证据 `.tmp/pc-visual-qa/tournament-create-basic-created-transition-1586x992-v2.png`', build: 'PC npm run build-passed：2026-08-09，TournamentCreateBasic.vue' }],
  ['1、赛事主控台/赛事主控制台.png', { buttonDestination: 'verified：阶段、待办及六个快捷入口均携带当前 tournamentId 进入正式组别、球队、名单、抽签、赛程、比赛页；本地目标视口已实点组别管理；退出 → 赛事空间', flowTransition: 'verified：主控台只读当前授权赛事、参赛关系与场次；2026-08-13 QA 点击组别管理后到 /tournaments/qa-tournament-2026/competition；PC 赛中入口保持只读，复核由赛后受控路由处理', visual: 'visual-accepted：已复核批准素材包；1672 × 941 `.tmp/pc-visual-qa/tournament-console-recheck-1672x941-v1.png` 对齐赛事上下文、四项概览、阶段闭环、待办、组别、近期比赛和六项快捷入口；转场 `.tmp/pc-visual-qa/tournament-console-shortcut-transition-1672x941-v1.png`', build: 'PC npm run build-passed：2026-08-09，TournamentConsole.vue' }],
  ['01-微信登录.png', { buttonDestination: 'static-verified：微信登录 → 小程序授权会话；成功 → 已有工作空间首页或首次使用引导；取消/失败 → 留在登录页并可重试', flowTransition: 'static-verified：小程序 openId 与 PC wechatOpenId 分字段保存；跨应用识别仅依赖 unionId，不能静默换绑', visual: 'visual-capture-pending：素材包已批准；需 780 × 1688 目标视口截图叠图', build: 'node --check passed：miniprogram 登录页；小程序会话经云函数鉴权' }],
  ['竞赛管理-组别管理-5个组别最终版.png', { buttonDestination: 'verified：添加组别 → 当前赛事基础创建；各行规则入口 → 当前 divisionId 的开始/继续/查看规则；本地目标视口已实点 U8 查看规则；行菜单 → 当前赛事球队、抽签或赛程', flowTransition: 'verified：组别属于当前 tournamentId；2026-08-13 U8 查看规则进入 /tournaments/qa-tournament-2026/competition/rules?divisionId=qa-division-u8&step=effective；简易/专业模式及规则进度均按组别独立保存，不能由名称推断赛制', visual: 'visual-accepted：已复核批准素材包；1618 × 972 `.tmp/pc-visual-qa/division-management-recheck-1618x972-v1.png` 对齐赛事壳、统计卡、五行组别表、规则状态、操作和配置流程；转场 `.tmp/pc-visual-qa/division-management-rule-transition-1618x972-v1.png`', build: 'PC npm run build-passed：2026-08-09，DivisionManagement.vue' }],
  ['竞赛管理-添加组别-基础创建.png', { buttonDestination: 'static-verified：保存 → 当前赛事新建 division；下一步 → 模式对比；取消 → 组别总览', flowTransition: 'static-verified：组别名称与赛制基础信息校验通过后才可进入规则设置，不能覆盖同赛事既有组别', visual: 'visual-capture-pending：素材包已批准；需 1672 × 941 目标视口截图叠图', build: 'PC npm run build passed：TournamentDivisionCreate 已编译' }],
  ['竞赛管理-组别管理-简易与专业模式对比.png', { buttonDestination: 'static-verified：选择简易/专业模式 → 当前 divisionId 对应规则向导；返回 → 基础创建', flowTransition: 'static-verified：模式一经规则定版锁定；专业版按组别计费边界不由页面默认值改变', visual: 'visual-capture-pending：素材包已批准；需 1672 × 941 目标视口截图叠图', build: 'PC npm run build passed：DivisionManagement 模式选择已编译' }],
  ['竞赛管理-组别管理-卡片菜单.png', { buttonDestination: 'static-verified：编辑/规则/球队/抽签/赛程菜单 → 当前 tournamentId、divisionId 对应页；删除仅显示受控确认', flowTransition: 'static-verified：菜单动作始终携带当前组别，不能将 DrawGroup 与竞赛组别混用', visual: 'visual-capture-pending：素材包已批准；需 1672 × 941 目标视口截图叠图', build: 'PC npm run build passed：DivisionManagement 已编译' }],
  ['竞赛管理-U16组-简化版-步骤1-赛制设置.png', { buttonDestination: 'static-verified：下一步 → 当前 divisionId 基础规则；返回 → 组别管理', flowTransition: 'static-verified：赛制配置先保存为草稿，未定版前不生成赛程或覆盖历史数据', visual: 'visual-capture-pending：素材包已批准；需 1672 × 941 目标视口截图叠图', build: 'PC npm run build passed：DivisionRulesWizard 已编译' }],
  ['竞赛管理-U16组-简化版-步骤2-基础规则.png', { buttonDestination: 'static-verified：上一步 → 赛制设置；下一步 → 规则定版；校验失败留在当前步骤', flowTransition: 'static-verified：基础规则仅保存当前组别草稿，不能写入其他组别或赛事', visual: 'visual-capture-pending：素材包已批准；需 1672 × 941 目标视口截图叠图', build: 'PC npm run build passed：DivisionRulesWizard 已编译' }],
  ['竞赛管理-U16组-简化版-步骤3-规则定版.png', { buttonDestination: 'static-verified：确认定版 → 规则已生效；返回 → 基础规则', flowTransition: 'static-verified：定版前再次确认影响；定版后规则锁定，后续变更进入受控修改路径', visual: 'visual-capture-pending：素材包已批准；需 1672 × 941 目标视口截图叠图', build: 'PC npm run build passed：DivisionRulesWizard 已编译' }],
  ['竞赛管理-U16组-规则定版-已生效.png', { buttonDestination: 'static-verified：返回组别 → 当前 divisionId 总览；后续球队/抽签入口 → 当前组别流程', flowTransition: 'static-verified：生效规则成为当前组别赛程、抽签和比赛管理的约束，不回写其他组别', visual: 'visual-capture-pending：素材包已批准；需 1672 × 941 目标视口截图叠图', build: 'PC npm run build passed：DivisionRulesWizard 已编译' }],
  ['竞赛管理-U16组-专业版-步骤1-赛制结构.png', { buttonDestination: 'verified：保存并进入参赛资格 → 当前 tournamentId/divisionId rules?step=eligibility；返回 → 组别管理', flowTransition: 'verified：专业规则向导仅按当前 tournamentId/divisionId 连续保存草稿；赛制结构未定版前不发布规则、不改写历史快照，后续步骤不可越过未完成状态', visual: 'visual-captured-major-fixed：1672 × 941 截图 .tmp/pc-visual-qa/division-rules-professional-format-1672x941-v2.png；已对照专业模式壳、六步进度、四类赛制、三阶段结构和固定下一步操作；最终微差待统一叠图复核', build: 'PC npm run build passed：2026-08-09，DivisionRulesWizard 专业向导已编译' }],
  ['竞赛管理-U16组-专业版-步骤2-参赛资格.png', { buttonDestination: 'verified：上一步 → 当前 divisionId 赛制结构；保存并进入比赛执行 → 当前 divisionId rules?step=execution', flowTransition: 'verified：年龄、名单、证件与准入条件仅保存当前赛事的 divisionId 草稿和报名快照边界，长期球队/球员库不被筛选结果改写', visual: 'visual-captured-major-fixed：1672 × 941 截图 .tmp/pc-visual-qa/division-rules-professional-eligibility-1672x941-v2.png；已对照专业六步状态、资格四区块与固定上下步操作；最终微差待统一叠图复核', build: 'PC npm run build passed：2026-08-09，DivisionRulesWizard 专业向导已编译' }],
  ['竞赛管理-U16组-专业版-步骤3-比赛执行.png', { buttonDestination: 'verified：上一步 → 当前 divisionId 参赛资格；保存并进入积分排名 → 当前 divisionId rules?step=ranking', flowTransition: 'verified：比赛时长、阵容、换人、比分事件、裁判报告与纪律设置保存为当前专业组别规则草稿；不得绕过裁判现场记录、赛后复核或赛事权限', visual: 'visual-captured-major-fixed：1672 × 941 截图 .tmp/pc-visual-qa/division-rules-professional-execution-1672x941-v1.png；已对照专业六步状态、四项执行规则区块与上下步操作；最终微差待统一叠图复核', build: 'PC npm run build passed：2026-08-09，DivisionRulesWizard 专业向导已编译' }],
  ['竞赛管理-U16组-专业版-步骤4-积分排名.png', { buttonDestination: 'verified：上一步 → 当前 divisionId 比赛执行；保存并进入晋级规则 → 当前 divisionId rules?step=advancement', flowTransition: 'verified：胜平负积分、同分比较、淘汰赛平局和排名发布仅保存当前组别草稿；不得改写已归档比赛赛果快照或跨组别排名', visual: 'visual-captured-major-fixed：1671 × 941 截图 .tmp/pc-visual-qa/division-rules-professional-ranking-1671x941-v1.png；已对照专业六步状态、四项积分排名区块与上下步操作；最终微差待统一叠图复核', build: 'PC npm run build passed：2026-08-09，DivisionRulesWizard 专业向导已编译' }],
  ['竞赛管理-U16组-专业版-步骤5-晋级规则.png', { buttonDestination: 'verified：1671 × 941 本地真实点击“保存并进入规则定版”命中可用主按钮，并进入当前 tournamentId/divisionId rules?step=finalize；上一步仍指向当前组别积分排名', flowTransition: 'verified：晋级名额、种子/非种子分池、回避和递补只校验当前专业组别；本地 QA 不写云端，也不改写已生成赛程、抽签或历史快照；目标页证据 .tmp/pc-visual-qa/division-rules-u16-finalize-destination.png', visual: 'visual-accepted-major-reviewed：1671 × 941 最终截图 .tmp/pc-visual-qa/division-rules-u16-advancement-final.png；三块规则卡、横向晋级路径、路径校验、底部摘要与操作按钮均完整位于目标视口，无固定栏遮挡', build: 'PC npm run build passed：2026-08-13，DivisionRulesWizard 专业晋级页已编译；UI delivery gate、git diff --check 通过' }],
  ['竞赛管理-U16组-专业版-步骤6-规则定版.png', { buttonDestination: 'verified：五个“查看详情”分别回到当前 divisionId 的赛制结构、参赛资格、比赛执行、积分排名和晋级规则；打印/预览调用正式打印视图；导出 Word 生成转义后的当前规则 .doc；1672 × 941 本地真实点击“确认规则并进入球队管理”命中可用主按钮并进入 /tournaments/qa-tournament-2026/teams?divisionId=qa-division-u16', flowTransition: 'verified：确认仅更新当前 professional divisionId 的 rulesLocked、ruleStatus、ruleProgress、rulesVersion 与 rulesSnapshot，再携带同一 tournamentId/divisionId 进入球队管理；隔离 QA 证据 .tmp/pc-visual-qa/division-rules-u16-finalize-teams-destination.png 未发生云端写入，也未修改其他组别、已生成赛程或历史比赛快照', visual: 'visual-accepted-major-reviewed：1672 × 941 最终截图 .tmp/pc-visual-qa/division-rules-u16-finalize-final.png；五段规则方案、完成状态、定版信息、自动规程、锁定提示及三项底部操作完整位于目标视口，scrollWidth=1672，主体/侧栏 bottom=794.375，固定操作栏 top=859，无覆盖或横向溢出', build: 'PC npm run build passed：2026-08-13，DivisionRulesWizard 专业规则定版与 Word 规程导出已编译；未引入 @cloudbase/js-sdk，UI delivery gate、git diff --check 通过' }],
  ['竞赛管理-U16组-专业版-规则定版-已生效.png', { buttonDestination: 'verified：1672 × 941 本地真实点击“返回组别管理”进入 /tournaments/qa-tournament-2026/competition；“进入抽签分组”进入 /tournaments/qa-tournament-2026/draw?divisionId=qa-division-u16；“进入赛程管理”进入 /tournaments/qa-tournament-2026/schedule?divisionId=qa-division-u16；打印与导出只读取当前快照', flowTransition: 'verified：已生效专业规则只读当前 divisionId 的 V1.1 快照，前端无编辑或降级入口；抽签、赛程和比赛继续受该版本约束，调整必须生成新版本并保留审计，报名截止后的身份锁定不能解除；本地点击未发生云端写入', visual: 'visual-accepted-major-reviewed：1672 × 941 最终截图 .tmp/pc-visual-qa/division-rules-u16-effective-final.png；五段只读规则、V1.1 定版信息、四项影响范围、不可降级提示与导出区完整显示，scrollWidth=1672，主体/侧栏 bottom=836.875，固定操作栏 top=859，无覆盖或横向溢出', build: 'PC npm run build passed：2026-08-13，DivisionRulesWizard 专业已生效页已编译；未引入 @cloudbase/js-sdk，git diff --check 通过' }],
  ['03-家长服务页/01-家长进入-匹配孩子.png', { buttonDestination: 'verified：家长协作链接 → parentInvite 预览；确认并继续 → 服务号 OAuth；失效链接 → 可重试错误页', flowTransition: 'verified：邀请仅对应一名球员；未授权前不提交或覆盖资料', visual: 'visual-captured-major-fixed：852 × 1846 截图 .tmp/h5-visual-qa/parent-match-852x1846-v2.png；已对照家长壳、孩子匹配、资料核对与继续入口', build: 'node --check passed：service-account-h5/app.js；经 webLoginApi HTTP 会话' }],
  ['03-家长服务页/02-确认基础资料.png', { buttonDestination: 'verified：确认并继续 → 保存基础资料并进入实名；返回 → 邀请说明；姓名/生日不一致 → 人工核验', flowTransition: 'verified：监护人授权与资料草稿独立保存，不直接覆盖历史参赛记录', visual: 'visual-captured-major-fixed：852 × 1846 截图 .tmp/h5-visual-qa/parent-basic-852x1846-v2.png；已对照家长壳、基础资料表单、授权与返回入口', build: 'node --check passed：service-account-h5/app.js；parentProfile HTTP 工作流' }],
  ['03-家长服务页/03-上传身份证实名.png', { buttonDestination: 'verified：上传正反面并提交 → 实名核验结果；返回 → 基础资料；上传失败 → 原页可重试', flowTransition: 'verified：身份证材料受限上传，审核结论由服务端流程返回，家长不能自改结论', visual: 'visual-captured-major-fixed：852 × 1846 截图 .tmp/h5-visual-qa/parent-identity-852x1846-v2.png；已对照受限材料上传、说明与恢复入口', build: 'node --check passed：service-account-h5/app.js；身份材料通过 parentProfile HTTP 工作流' }],
  ['03-家长服务页/04-实名认证结果.png', { buttonDestination: 'verified：通过 → 标准形象照指引；驳回 → 重新上传；审核中 → 刷新结果', flowTransition: 'verified：仅审核通过才能进入人像流程；审核中和驳回保留恢复路径', visual: 'visual-captured-major-fixed：852 × 1846 截图 .tmp/h5-visual-qa/parent-result-852x1846-v2.png；已对照实名通过结果、审核边界与下一步', build: 'node --check passed：service-account-h5/app.js；getParentIdentityVerification 已接入' }],
  ['03-家长服务页/05-标准形象照拍摄指引.png', { buttonDestination: 'verified：打开取景框 → 标准形象照取景框；返回 → 实名结果', flowTransition: 'verified：仅已通过实名的会话可进入；原图与透明派生图将独立受限保存', visual: 'visual-captured-major-fixed：852 × 1846 截图 .tmp/h5-visual-qa/parent-guide-852x1846-v2.png；已对照拍摄要求、主操作与返回入口', build: 'node --check passed：service-account-h5/app.js；parentProfile HTTP 工作流' }],
  ['03-家长服务页/06-标准形象照取景框.png', { buttonDestination: 'verified：拍摄/选择 → 人像分割；重新拍摄 → 指引；失败 → 原页重试', flowTransition: 'verified：只接受单人 JPG/PNG；处理前保留原图，处理失败不生成公开链接', visual: 'visual-captured-major-fixed：852 × 1846 截图 .tmp/h5-visual-qa/parent-camera-852x1846-v2.png；已对照取景框、材料限制与拍摄返回入口', build: 'node --check passed：service-account-h5/app.js；uploadAndProcessParentPortrait 已接入' }],
  ['03-家长服务页/07-人像分割与效果确认.png', { buttonDestination: 'verified：确认透明效果 → 提交成功；重新拍摄 → 取景框', flowTransition: 'verified：透明派生图确认后才成为当前资料版本；原图仍受限保存，不替换历史赛事快照', visual: 'visual-captured-major-fixed：852 × 1846 截图 .tmp/h5-visual-qa/parent-confirm-852x1846-v2.png；本地验收使用非真实儿童照片占位，已对照透明预览与确认/重拍入口', build: 'node --check passed：service-account-h5/app.js；confirmParentPortrait 已接入' }],
  ['03-家长服务页/08-资料提交成功.png', { buttonDestination: 'verified：完成 → 返回微信；无再次提交按钮', flowTransition: 'verified：基础资料、实名和透明人像形成受限版本；球队仅看到完成状态，赛事名单与历史快照不被覆盖', visual: 'visual-captured-major-fixed：852 × 1846 截图 .tmp/h5-visual-qa/parent-success-852x1846-v2.png；已对照提交摘要、快照保护说明与完成入口', build: 'node --check passed：service-account-h5/app.js；completeParentProfile 已接入' }],
  ['21-球队资料.png', { buttonDestination: 'static-verified：保存资料 → 当前 teamId 长期球队档案；返回 → 球队详情；失败 → 原表单可恢复', flowTransition: 'static-verified：仅 team.manage 可编辑；长期球队资料不覆盖赛事名单、阵容或已完赛快照', visual: 'visual-capture-pending：素材包已批准；需 780 × 1688 目标视口截图叠图', build: 'node --check passed：miniprogram/pages/team/profile/profile.js；getMiniWorkspace saveTeamProfile 鉴权' }],
  ['22-球队成员.png', { buttonDestination: 'static-verified：邀请成员 → 当前 teamId 受控邀请；成员筛选 → 当前成员关系；返回 → 球队详情', flowTransition: 'static-verified：成员关系是长期球队协作数据，不等同赛事正式名单；仅可管理者创建邀请', visual: 'visual-capture-pending：素材包已批准；需 780 × 1688 目标视口截图叠图', build: 'node --check passed：miniprogram/pages/team/members/members.js；createTeamMemberInvite 鉴权' }],
  ['09-家长协作链接.png', { buttonDestination: 'static-verified：生成/复制家长协作链接 → 当前 playerId 的受限 parentInvite；返回 → 球员资料或球队详情', flowTransition: 'static-verified：链接仅进入家长服务号资料流程，不暴露球队管理权限或其他球员资料', visual: 'visual-capture-pending：素材包已批准；需 780 × 1688 目标视口截图叠图', build: 'node --check passed：miniprogram/pages/team/parent-collaboration/parent-collaboration.js；服务号 parentInvite 流程已接入' }],
  ['23-参赛管理.png', { buttonDestination: 'static-verified：赛事卡 → 当前 tournamentId 球队视角；正式名单/阵容待办 → 当前赛事动作；返回 → 球队详情', flowTransition: 'static-verified：参赛关系属于赛事快照，球队日常资料变更不反向覆盖已审核名单', visual: 'visual-capture-pending：素材包已批准；需 780 × 1688 目标视口截图叠图', build: 'node --check passed：miniprogram/pages/team/participation/participation.js；teamParticipation 工作空间校验' }],
  ['24-历史参赛记录.png', { buttonDestination: 'static-verified：历史赛事卡 → 对应只读赛事记录；返回 → 球队详情', flowTransition: 'static-verified：历史参赛记录只读来自已归档关系，不能由球队资料编辑改变', visual: 'visual-capture-pending：素材包已批准；需 780 × 1688 目标视口截图叠图', build: 'node --check passed：miniprogram/pages/team/history/history.js；历史记录使用授权关系读取' }],
  ['10-球员资料进度.png', { buttonDestination: 'static-verified：缺失资料球员 → 当前 playerId 资料补充；正式名单 → 当前赛事名单；返回 → 球队详情', flowTransition: 'static-verified：资料完成度由实名、照片与必填资料状态计算；未完成球员不能被正常提交入赛事名单', visual: 'visual-capture-pending：素材包已批准；需 780 × 1688 目标视口截图叠图', build: 'node --check passed：miniprogram/pages/team/profile-progress/profile-progress.js；工作空间权限校验' }],
  ['11-球员资料异常.png', { buttonDestination: 'static-verified：查看异常/重新补充 → 当前 playerId 资料流程；返回 → 资料进度', flowTransition: 'static-verified：异常只修改当前球员资料版本；已审核赛事名单与历史快照保持不变', visual: 'visual-capture-pending：素材包已批准；需 780 × 1688 目标视口截图叠图', build: 'node --check passed：miniprogram/pages/team/profile-exception/profile-exception.js；工作空间权限校验' }],
  ['13-名单审核退回.png', { buttonDestination: 'static-verified：查看退回原因 → 当前赛事名单；补齐资料/重新提交 → 当前 tournamentId roster snapshot；返回 → 球队赛事关系', flowTransition: 'static-verified：退回只作用当前赛事正式名单快照，不能重写球队长期球员库或已归档名单', visual: 'visual-capture-pending：素材包已批准；需 780 × 1688 目标视口截图叠图', build: 'node --check passed：miniprogram/pages/team/official-roster/official-roster.js；submitOfficialRoster 鉴权' }],
  ['20-赛事邀请-新建球队参赛.png', { buttonDestination: 'static-verified：接受邀请并创建球队 → 当前 inviteId 创建页；创建成功 → 球队中心；返回 → 邀请上下文', flowTransition: 'static-verified：新建长期球队后只建立当前赛事报名关系，不合并同名球队或覆盖既有资产', visual: 'visual-capture-pending：素材包已批准；需 780 × 1688 目标视口截图叠图', build: 'node --check passed：miniprogram/pages/team/create-team-invite/create-team-invite.js；邀请流程经 getMiniWorkspace 校验' }],
  ['19-赛事邀请-接收预建队.png', { buttonDestination: 'static-verified：使用现有球队/接收预建队 → 当前 inviteId 受控接收；冲突 → 认领冲突页；成功 → 球队中心', flowTransition: 'static-verified：预建队归属冲突标为 review_required，禁止自动合并；既有球队仅建立当前赛事关系', visual: 'visual-capture-pending：素材包已批准；需 780 × 1688 目标视口截图叠图', build: 'node --check passed：miniprogram/pages/team/prebuilt-invite/prebuilt-invite.js；acceptPrebuiltTeamInvite 服务端校验' }],
  ['14-单场比赛阵容.png', { buttonDestination: 'static-verified：选择阵型 → 当前场次阵型；添加/移动球员 → 当前正式名单球员落位；提交 → 阵容结果；返回 → 赛事球队视角', flowTransition: 'static-verified：球员来源受当前赛事正式名单约束；阵型位置与替补保存为 matchId/teamId 快照，不修改长期球员库', visual: 'visual-capture-pending：素材包已批准；需 780 × 1688 目标视口截图叠图', build: 'node --check passed：miniprogram/pages/match/squad/squad.js；阵容工作流受赛事关系校验' }],
  ['14-1-选择球员弹窗.png', { buttonDestination: 'static-verified：选择正式名单球员 → 当前阵型位置；关闭 → 返回阵容；未完成/异常球员不可选', flowTransition: 'static-verified：弹窗只显示当前 matchId/teamId 可用正式名单，已落位球员不能重复选择', visual: 'visual-capture-pending：素材包已批准；需 780 × 1688 目标视口截图叠图', build: 'node --check passed：miniprogram/pages/match/squad/squad.js；选择状态由 JS 预计算' }],
  ['15-阵容提交结果.png', { buttonDestination: 'static-verified：返回赛事/查看阵容 → 当前比赛阵容快照；无重复提交死按钮', flowTransition: 'static-verified：提交成功后阵容状态进入待处理或已提交，后续修改走退回/重新提交规则', visual: 'visual-capture-pending：素材包已批准；需 780 × 1688 目标视口截图叠图', build: 'node --check passed：miniprogram/pages/match/lineup-result/lineup-result.js；阵容提交工作流已接入' }],
  ['16-阵容退回与重新提交.png', { buttonDestination: 'static-verified：查看退回原因 → 当前阵容；重新编辑 → 当前场次阵容；再次提交 → 当前阵容结果', flowTransition: 'static-verified：退回只作用当前场次快照；重新提交需重做正式名单、落位和人数校验', visual: 'visual-capture-pending：素材包已批准；需 780 × 1688 目标视口截图叠图', build: 'node --check passed：miniprogram/pages/match/lineup-returned/lineup-returned.js；受控阵容重提流程' }],
  ['17-简易版球队数据包.png', { buttonDestination: 'static-verified：赛事数据 → 当前球队/赛事数据页；导出/申请 → 受控数据包动作；返回 → 球队中心', flowTransition: 'static-verified：数据包仅汇总当前授权赛事数据，不能暴露其他机构、球队或未授权赛事记录', visual: 'visual-capture-pending：素材包已批准；需 780 × 1688 目标视口截图叠图', build: 'node --check passed：miniprogram/pages/team/data-package/data-package.js；数据包工作空间校验' }],
  ['18-数据包赛事数据.png', { buttonDestination: 'static-verified：筛选/查看数据 → 当前 tournamentId 数据详情；返回 → 数据包总览', flowTransition: 'static-verified：赛事数据按当前球队授权关系读取，历史赛果只读，不作为球队资料写回', visual: 'visual-capture-pending：素材包已批准；需 780 × 1688 目标视口截图叠图', build: 'node --check passed：miniprogram/pages/team/data-package-events/data-package-events.js；数据包工作空间校验' }],
  ['抽签与分组-专业模式-球队池.png', { buttonDestination: 'verified：保存并进入下一步实点到当前赛事/U16组 professional&step=screen；返回 → 抽签设置；无审核球队或资格异常时阻止下一步', flowTransition: 'verified：仅当前 tournamentId/divisionId 已审核 tournament_teams 可进入；poolValidated 后才可保存大屏设置', visual: 'visual-captured-major-fixed：1672 × 941 .tmp/pc-visual-qa/professional-draw-pool-u16-1672x941-v1.png；素材包已批准；最终透明叠图微差复核待全量收口', build: 'PC npm run build passed：ProfessionalDrawFlow 已实现球队池校验与受控下一步' }],
  ['抽签与分组-专业模式-大屏设置.png', { buttonDestination: 'verified：保存并进入下一步实点到当前赛事/U16组 professional&step=console&stage=intro；返回 → 球队池；取消/失败 → 保留设置可重试', flowTransition: 'verified：仅 poolValidated 后可进入；screenSavedAt 后才允许开始抽签，持续携带当前赛事和组别', visual: 'visual-captured-major-fixed：1672 × 941 .tmp/pc-visual-qa/professional-draw-screen-u16-1672x941-v1.png；素材包已批准；最终透明叠图微差复核待全量收口', build: 'PC npm run build passed：ProfessionalDrawFlow 已实现大屏设置和受控下一步' }],
  ['抽签与分组-快速模式-分组操作台-联赛制.png', { buttonDestination: 'verified：返回分组设置 → 当前 divisionId config；赛制切换 → 当前 divisionId/format console；确认联赛排序 → 当前组别受控确认动作', flowTransition: 'verified：format=league 明确加载联赛制；仅当前赛事/组别的已审核 tournament_teams 可排序。保存确认后才写入 tournament_league_tables，并清理当前组别旧赛程', visual: 'visual-captured-major-fixed：1672 × 941 截图 .tmp/pc-visual-qa/draw-quick-console-league-1672x941-v6.png；已对照三栏队伍池、联赛排序、轮次预览、校验与操作栏；最终微差待统一叠图复核', buildVerification: 'npm run build-passed：2026-08-10，QuickHybridConsole.vue、TournamentDraw.vue' }],
  ['抽签与分组-快速模式-分组操作台-淘汰赛.png', { buttonDestination: 'verified：淘汰赛深链 → 当前赛事/组别对阵树；返回分组设置实点到 /tournaments/qa-tournament-001/draw?divisionId=qa-division-u12&mode=quick&view=config；随机/清空 → 当前草稿；确认保存 → 当前组别对阵快照并进入分组结果', flowTransition: 'verified：format=cup 明确加载独立的左右镜像签位树；仅当前赛事/组别的已审核 tournament_teams 可进入签位。确认后只写 type=cup 的 tournament_bracket，并清理当前组别旧赛程', visual: 'visual-captured-major-fixed：1672 × 941 .tmp/pc-visual-qa/draw-quick-console-cup-1672x941-v5.png；素材包已批准；最终透明叠图微差复核待全量收口', buildVerification: 'PC npm run build passed：QuickHybridConsole 的 cup 对阵树、重复队伍防护、随机、清空和按赛制保存链路已编译' }],
  ['抽签与分组-快速模式-分组操作台-混合制.png', { buttonDestination: 'verified：混合制深链 → 当前赛事/组别混合制操作台；上移/下移/随机/清空 → 当前草稿排序；确认混合制分组 → 当前组别联赛表、淘汰赛签位并进入分组结果；返回 → 抽签设置', flowTransition: 'verified：仅当前赛事/组别审核 tournament_teams 可排序；晋级名额必须为不超过球队数的偶数。确认只写 type=hybrid 的 tournament_league_tables/tournament_bracket，并清理当前组别旧赛程', visual: 'visual-captured-major-fixed：1671 × 941 .tmp/pc-visual-qa/draw-quick-console-hybrid-1671x941-v2.png；素材包已批准；最终透明叠图微差复核待全量收口', buildVerification: 'PC npm run build passed：QuickHybridConsole 真实排序、按名次晋级签位、确认保存已编译' }],
  ['01-青训未订阅.png', { buttonDestination: 'verified：了解开通方式 → 已确认的开通说明；工作空间切换 → 当前自然人可访问空间；返回 → 小程序 TabBar。', flowTransition: 'verified：training.canUse=false 且非临时空间时显示，不能由页面默认值绕过订阅。', visual: 'visual-accepted：`.tmp/mini-visual-qa/training-locked-final-v1.png` 已在批准的 390×844 逻辑目标视口捕获；核对了胶囊安全区、机构权益摘要、未开通说明、开通动作与底部训练 Tab。', buildVerification: 'verified：node --check miniprogram/pages/training/index.js；WXML 表达式仅使用预计算字段。' }],
  ['02-青训运营概览.png', { buttonDestination: 'verified：工作空间切换 → 当前自然人可访问空间；课程/待办在无详情接口时是只读信息卡，不展示伪跳转或死按钮。', flowTransition: 'verified：仅 training.canUse=true、非临时空间且 education.view/manage/execute 岗位权限满足时展示；列表数据来自工作空间上下文。', visual: 'visual-accepted：`.tmp/mini-visual-qa/training-active-final-v1.png` 已在批准的 390×844 逻辑目标视口捕获；核对了胶囊安全区、机构权益、移动执行边界、课程安排、待办列表与底部训练 Tab。', buildVerification: 'verified：node --check miniprogram/pages/training/index.js；WXML 表达式仅使用预计算字段。' }],
  ['03-青训无岗位权限.png', { buttonDestination: 'verified：工作空间切换仅切换当前自然人可访问空间；无教育岗位时不渲染课程写入、签到或消课入口。', flowTransition: 'verified：机构开通不等于当前自然人有执行权；权益与岗位同时满足后才展示移动执行信息。', visual: 'visual-accepted：`.tmp/mini-visual-qa/training-restricted-final-v1.png` 已在批准的 390×844 逻辑目标视口捕获；核对了已开通状态与无岗位权限提示的清晰分离。', buildVerification: 'verified：node --check miniprogram/pages/training/index.js；WXML 表达式仅使用预计算字段。' }],
  ['04-球队认领冲突.png', { buttonDestination: 'verified: conflict users can submit an independent manual-review request or return to the prior selection; no path automatically claims, merges, or alters an existing team.', flowTransition: 'verified: only a server reviewRequired result can reach this route. Manual review preserves long-term team assets and history until verification; visualQa changes no records.', visual: 'visual-accepted: `.tmp/mini-visual-qa/claim-conflict-final-v3.png` captured at approved 390x844 logical target; compared for capsule-safe heading, conflict notice, candidate team evidence, three reasons, manual-review/return actions and proof-material guidance.', buildVerification: 'verified: node --check miniprogram/pages/team/claim-conflict/claim-conflict.js; WXML restriction check; target visual capture passed on 2026-08-13.' }],
  ['01-球队球员参赛全链路.png', { buttonDestination: 'verified：长期球队/球员资料 → 球队中心或资料完成度；正式名单与阵容 → 当前赛事中心；返回 → 上一页或赛事 Tab。', flowTransition: 'verified：页面明确长期球队资料、赛事正式名单与单场阵容三类数据不可互相覆盖；各入口由对应端的真实授权再次校验。', visual: 'visual-accepted：`.tmp/mini-visual-qa/flow-handoff-player-final-v2.png` 已在批准的 390×844 逻辑目标视口捕获；核对了胶囊安全区、三端资料/名单/阵容交接、责任边界与主入口。', buildVerification: 'verified：node --check miniprogram/pages/tournament/flow-handoff/flow-handoff.js；app.json JSON parse 通过；WXML 无复杂表达式。' }],
  ['02-比赛执行责任交接.png', { buttonDestination: 'verified：赛前 → 赛事中心；赛中裁判 → 裁判任务；赛后 → 赛事列表；返回 → 上一页或赛事 Tab。', flowTransition: 'verified：赛中写入归属裁判，主办方赛中只读，赛后由主办方受控复核；各入口保留自身权限校验。', visual: 'visual-accepted：`.tmp/mini-visual-qa/flow-handoff-match-final-v2.png` 已在批准的 390×844 逻辑目标视口捕获；核对了胶囊安全区、赛前/赛中/赛后职责切分、只读边界与赛事主入口。', buildVerification: 'verified：node --check miniprogram/pages/tournament/flow-handoff/flow-handoff.js；app.json JSON parse 通过；WXML 无复杂表达式。' }],
  ['03-专业版正式名单形成.png', { buttonDestination: 'verified：专业版球队名单 → 当前赛事/组别球队 roster；异常名单 → 当前赛事名单异常看板；返回 → 参赛球队', flowTransition: 'verified：资格、实名和资料完成度先在球队端形成当前赛事 roster snapshot，主办方审核后才作为正式名单；退回仅更新当前赛事快照', visual: 'visual-captured-major-fixed：1672 × 941 截图 .tmp/pc-visual-qa/professional-roster-u16-1672x941-v13.png；已对照赛事上下文、U16 名单快照、状态筛选与操作入口', buildVerification: 'PC npm run build passed：ProfessionalTournamentRoster 与 RosterExceptionBoard 已编译；浏览器端经 webLoginApi 零 SDK 链路' }],
  ['01-简易版裁判录入比赛事件.png', { buttonDestination: 'verified：裁判服务号授权 → 绑定手机号 → 当前指派任务 → 场次事件/比分写入 → 完赛；PC 监控与复核读取同一场次', flowTransition: 'verified：只有已绑定并受指派的裁判会话可写入 addRefereeEvent/finishRefereeMatch；主办方赛中无写入入口', visual: 'visual-captured-major-fixed：852 × 1846 截图 .tmp/h5-visual-qa/referee-live-852x1846-v1.png；已对照深色比分台、计时、名单、快捷事件与事件流水', buildVerification: 'node --check passed：service-account-h5/app.js；服务号采用 webLoginApi HTTP 工作流，不使用网页 SDK' }],
  ['球队管理-发送认领提醒-专业版.png', { buttonDestination: 'static-verified：专业版球队管理的认领提醒 → 当前赛事/组别邀请动作；复制/发送 → 当前邀请链接；返回 → 参赛球队', flowTransition: 'static-verified：邀请保持 tournamentId、divisionId 与预建球队上下文；接收冲突进入人工核验，不自动合并', visual: 'visual-capture-pending：素材包已批准；需 1672 × 941 目标视口截图叠图', buildVerification: 'PC npm run build passed：TournamentTeams 专业版邀请入口已编译' }],
  ['赛程管理-修改生成规则-影响确认弹窗.png', { buttonDestination: 'static-verified：修改规则 → 当前赛事赛程规则编辑；确认影响 → 仅当前组别受影响场次重算；取消 → 返回原规则', flowTransition: 'static-verified：规则修改在确认前不覆盖已保存赛程，确认后保留影响提示和受控重排路径', visual: 'visual-captured-major-fixed：1672 × 941 已与原图对照；影响分类、赛程快照、自动保存选择、受控修改按钮和遮罩层已补齐；共享侧栏品牌区微差待统一复核', buildVerification: 'npm run build-passed：2026-08-09，TournamentSchedule.vue' }],
  ['01-赛事中心.png', { buttonDestination: 'verified: workspace switch remains controlled; relation/status tabs only filter the current authorized list; each event card opens its current event detail; the approval card opens its authorized team-review route.', flowTransition: 'verified: event data remains scoped by the current workspace context; the visualQa fixture is developer-tools-only and does not replace authorized production records or permissions.', visual: 'visual-accepted: `.tmp/mini-visual-qa/event-center-after-rebuild-v1.png` captured at approved 390x844 logical target; compared for capsule-safe event heading, workspace switch, relationship/status filters, professional and simple event cards, and approval handoff.', buildVerification: 'verified: node --check miniprogram/pages/event/index.js; WXML restriction check; visual target capture passed on 2026-08-12.' }],
  ['02-赛事待办.png', { buttonDestination: 'verified: each task carries its current tournament/team/audience context to the existing authorized review or signup route; stage tabs filter only the current task set; return remains in the event tab.', flowTransition: 'verified: production tasks remain workspace-authorized; task status and stage are derived in JS, while visualQa is local-only and cannot send reminders, create reviews, or alter cloud records.', visual: 'visual-accepted: `.tmp/mini-visual-qa/todo-after-safe-nav-v4.png` captured at approved 390x844 logical target; compared for capsule-safe custom heading, professional event summary, stage filters, task hierarchy, task counts, and oil-icon task family.', buildVerification: 'verified: node --check miniprogram/pages/todo/index.js; WXML restriction check; target visual capture passed on 2026-08-12.' }],
  ['比赛管理-U8组-赛果复核与归档.png', { buttonDestination: 'verified：返回 → 当前组别比赛列表；查看原始提交 → 只读证据；保存草稿 → 当前复核会话；退回重传 → 限定字段退回对话框；复核通过并归档 → reviewRefereeRecord archive', flowTransition: 'verified：裁判提交快照只读；退回仅允许指定字段；归档永久保留快照；本地 visualQa=1 使用隔离验收快照', visual: 'visual-captured-major-fixed：1618 × 972 截图 .tmp/pc-visual-qa/match-review-u8-final-1618x972.png；已核对四步进度、场次、赛果、三证据面板、草稿、退回和归档操作', buildVerification: 'npm run build-passed：2026-08-09，MatchReviewWorkspace.vue' }],
  ['抽签与分组-专业模式-抽签设置.png', { buttonDestination: 'verified：前往球队池配置实点到当前赛事/U16组 professional&step=pool；保存并进入下一步 → 当前 tournamentId/divisionId 的球队池', flowTransition: 'verified：抽签设置 → 已保存 setupSavedAt → 球队池 → poolValidated → 大屏设置 → screenSavedAt → 抽签操作台 → 抽签结果。未完成步骤不能经 URL 提前跳入', visual: 'visual-captured-major-fixed：1672 × 941 .tmp/pc-visual-qa/professional-draw-setup-u16-1672x941-v1.png；素材包已批准；最终透明叠图微差复核待全量收口', buildVerification: 'PC npm run build passed：ProfessionalDrawFlow 已实现 setup 表单、统一五步标签和受控下一步' }],
  ['02-主办方实名与名单异常看板.png', { buttonDestination: 'static-verified：专业版参赛名单异常入口 → 当前赛事/组别异常看板；查看处理 → 当前快照详情；待审核名单退回 → 必填原因的受控 returnRoster 动作；球队名单 → 当前赛事球队名单页；返回 → 当前赛事参赛球队', flowTransition: 'static-verified：服务端先校验主办方赛事归属，再由当前 tournament_teams、roster_snapshots 和对应球员资料生成最小数据集；退回只修改当前赛事名单快照，不覆盖球队长期资料', visual: 'visual-capture-pending：素材包已批准；需 1672 × 941 目标视口截图叠图', buildVerification: 'node --check passed：cloudfunctions/webLoginApi/index.js；PC npm run build passed；浏览器端经 webLoginApi 零 SDK 链路' }],
  ['01-球队球员资料完成度.png', { buttonDestination: 'verified：完整资料球员可选择；未完成/异常球员只进入当前 playerId 补充资料流程；提交只创建当前 tournamentId 的赛事正式名单快照；返回球队赛事关系。', flowTransition: 'verified：长期球队球员库与本届赛事名单分离；只写入当前赛事 roster snapshot，随后等待主办方审核；退回只作用当前快照。', visual: 'visual-accepted：源画板为 862×1825 服务号比例闭环看板；`.tmp/mini-visual-qa/official-roster-current-selection-final-v2.png` 与 `.tmp/mini-visual-qa/official-roster-returned-final-v2.png` 已在当前已批准 iPhone 13 Pro 390×844 逻辑目标视口分别验收普通选择与审核退回状态。已核对赛事要求、球队球员库→本届已选数量关系、资料补充/资格异常、底部提交摘要与退回重提动作。', buildVerification: 'verified：node --check miniprogram/pages/team/official-roster/official-roster.js；getMiniWorkspace officialRoster/submitOfficialRoster 使用工作空间权限校验；WXML 限制检查通过。' }],
  ['04-赛前工作台.png', { buttonDestination: 'verified: roster cards open the current tournament team review; schedule opens the current schedule; referee card remains a PC-only controlled handoff; unfinished items open the event todo tab.', flowTransition: 'verified: only an authorized organizer workspace may enter; teams submit lineups and referees complete live operations in their own controlled endpoints. visualQa is local-only.', visual: 'visual-accepted: `.tmp/mini-visual-qa/pre-match-after-rebuild-v1.png` captured at approved 390x844 logical target; compared for capsule-safe workbench heading, current-event summary, readiness rail, roster/referee/schedule tasks and cross-end boundary note.', buildVerification: 'verified: node --check miniprogram/pages/tournament/pre-match/pre-match.js; WXML restriction check; target visual capture passed on 2026-08-13.' }],
  ['03-赛事详情-主办视角.png', { buttonDestination: 'verified: organizer overview task cards enter the current teams, schedule, or pre-match workbench routes only; no card writes tournament data. The production detail retains its formal existing flows.', flowTransition: 'verified: organizer and team views stay authorization-separated. The visualQa overview is developer-tools-only and hands off into existing scoped pages with the current tournamentId.', visual: 'visual-accepted: `.tmp/mini-visual-qa/tournament-detail-organizer-final-v3.png` captured at approved 390x844 logical target; compared for capsule-safe heading, professional event summary, pre-match management tasks, match management handoff and post-match actions.', buildVerification: 'verified: node --check miniprogram/pages/tournament/detail/detail.js; WXML restriction check; target visual capture passed on 2026-08-13.' }],
  ['05-赛程赛果.png', { buttonDestination: 'verified: a current/ongoing match opens only its authorized monitor; a completed match opens its authorized review; non-organizers keep the existing match-detail route. No mini-program score/event write action is rendered.', flowTransition: 'verified: score display is derived from a current match snapshot; only finished results are presented as archived. visualQa fixture is local-only and does not write a match.', visual: 'visual-accepted: `.tmp/mini-visual-qa/tournament-schedule-final-v3.png` captured at approved 390x844 logical target; compared for capsule-safe navigation, event header, schedule/result/ranking tabs, large readable match cards, status pills and read-only handoff actions.', buildVerification: 'verified: node --check miniprogram/pages/tournament/schedule/schedule.js; WXML restriction check; target visual capture passed on 2026-08-13.' }],
  ['06-赛中只读监控.png', { buttonDestination: 'verified: the organizer opens only the current authorized match monitor; contact-referee is a phone/handoff action, abnormal opens the separate exception flow, and refresh reloads a read-only snapshot.', flowTransition: 'verified: no score, event, signature, lineup or referee-record write control exists in this organizer view. visualQa is developer-tools-only.', visual: 'visual-accepted: `.tmp/mini-visual-qa/tournament-monitor-v1.png` captured at approved 390x844 logical target; compared for capsule-safe monitor shell, live score, on-site state, read-only event timeline, abnormal state and non-writing support actions.', buildVerification: 'verified: node --check miniprogram/pages/tournament/monitor/monitor.js; WXML restriction check; target visual capture passed on 2026-08-13.' }],
  ['07-赛后赛果复核.png', { buttonDestination: 'verified: archive remains confirmation-gated; return requires a reason and calls the controlled reviewRefereeRecord action with a constrained field list; back returns to schedule.', flowTransition: 'verified: the server validates event.manage, organizer relation, locked referee record and under_review state. The client exposes no direct score/event write path; visualQa cannot submit.', visual: 'visual-accepted: `.tmp/mini-visual-qa/tournament-review-v1.png` captured at approved 390x844 logical target; compared for capsule-safe review shell, locked record summary, evidence strip, referee source, return-reason field and archive/return controls.', buildVerification: 'verified: node --check miniprogram/pages/tournament/review/review.js; WXML restriction check; target visual capture passed on 2026-08-13.' }],
  ['08-异常发起与跟踪.png', { buttonDestination: 'verified: monitor opens the current match exception flow; contact-referee only invokes a phone/handoff action; submit calls the controlled reportMatchException action; reports remain an independent timeline.', flowTransition: 'verified: server validates event.manage and the organizer match relation. Exceptions do not write score, event, signature or referee-record fields; visualQa blocks uploads and submission.', visual: 'visual-accepted: `.tmp/mini-visual-qa/tournament-exception-v1.png` captured at approved 390x844 logical target; compared for capsule-safe match summary, exception-type selection, description/contact/evidence form, report submission actions and processing timeline.', buildVerification: 'verified: node --check miniprogram/pages/tournament/exception/exception.js; WXML restriction check; target visual capture passed on 2026-08-13.' }],
  ['09-赛事详情-球队视角.png', { buttonDestination: 'verified：进入赛事 → 当前 tournamentId 团队视角详情；处理本场阵容 → 当前 nextMatchId/teamId 阵容页；返回 → 球队中心。', flowTransition: 'verified：参赛关系、正式名单状态和下一场次由 teamParticipation 受当前工作空间授权返回；球队视角不暴露主办方审核与裁判安排控制。', visual: 'visual-accepted：`.tmp/mini-visual-qa/team-participation-current-final-v2.png` 已在批准的 390×844 逻辑目标视口捕获；核对了胶囊安全区、当前球队赛事摘要、参赛状态筛选、赛事快照、当前场阵容交接与报名待确认状态。', buildVerification: 'verified：node --check miniprogram/pages/team/participation/participation.js；云函数 teamParticipation 使用工作空间权限校验。' }],
  ['14-1-选择球员弹窗.png', { buttonDestination: 'static-verified：场上空位 → 位置优先球员选择；全部名单 → 当前正式名单；加号 → 填入当前 slotId；关闭/遮罩 → 不写入', flowTransition: 'static-verified：候选仅来自当前 matchId/teamId 的已审核正式名单；已安排球员不可重复选择，选择后回到同一场次草稿', visual: 'visual-capture-pending：素材包已批准；需 390 × 844 目标视口截图叠图', buildVerification: 'node --check passed：miniprogram/pages/match/squad/squad.js；WXML expression check passed' }],
  ['14-单场比赛阵容.png', { buttonDestination: 'static-verified：选阵型 → 正式名单；长按未安排球员 → 场上位置落位；普通点按 → 先选位置再选球员；替补 → 独立替补席；提交 → 当前 matchId 的阵容结果', flowTransition: 'static-verified：只读取已审核赛事正式名单；阵型、位置、首发与替补随 matchId 保存为阵容快照；退回仅允许针对当前快照重提', visual: 'visual-capture-pending：素材包已批准；需 390 × 844 目标视口截图叠图', buildVerification: 'node --check passed：miniprogram/pages/match/squad/squad.js；WXML expression check passed' }],
  ['球队管理-查看参赛名单-专业版.png', { buttonDestination: 'static-verified：查看名单 → 当前 teamId 的赛事名单快照；异常处理/名单变更 → 对应当前赛事、组别流程；返回 → 专业参赛球队总览', flowTransition: 'static-verified：正式名单与球队日常球员库分离，已审核或已完赛名单不会被日常资料编辑覆盖', visual: 'visual-capture-pending：素材包已批准；需 1672 × 941 截图叠图', buildVerification: 'PC npm run build passed；webLoginApi rosterExceptionBoard 使用赛事参赛关系和名单快照范围' }],
  ['球队管理-球员管理-专业版.png', { buttonDestination: 'static-verified：当前球队/组别 → 受当前赛事参赛关系约束；查看 → 当前球员详情；申请资料纠错 → 受控 correction request；名单异常/名单变更/返回 → 对应当前赛事入口', flowTransition: 'static-verified：服务端仅返回当前主办方、赛事、参赛球队和名单快照相关球员；名单未提交时显示空态，锁定状态不开放普通编辑', visual: 'visual-capture-pending：素材包已批准；需 1672 × 941 目标视口截图叠图', buildVerification: 'node --check passed：cloudfunctions/webLoginApi/index.js；PC npm run build passed' }],
  ['球队管理-参赛球队-专业版.png', { buttonDestination: 'static-verified：进入球队/名单/邀请/申请/变更 → 对应当前赛事与组别正式入口；返回 → 赛事主控台', flowTransition: 'static-verified：专业列表只读取当前报名关系、认领、资格与名单状态；未认领或资格未完成不得进入专业执行链路', visual: 'visual-capture-pending：素材包已批准；需 1672 × 941 截图叠图', buildVerification: 'existing formal TournamentTeams；下一轮视觉对比修正' }],
  ['球队管理-快速添加球队-专业版.png', { buttonDestination: 'static-verified：提交 → 创建当前专业组别参赛档案并生成定向认领邀请；取消/返回 → 无写入；认领 → 小程序确认链路', flowTransition: 'static-verified：联系人与手机号为专业版必填核验字段，未认领球队不能进入名单、阵容或比赛执行', visual: 'visual-capture-pending：素材包已批准；需 1672 × 941 截图叠图', buildVerification: 'existing formal TournamentTeams 创建流程；下一轮视觉对比修正' }],
  ['球队管理-名单变更-专业版.png', { buttonDestination: 'static-verified：状态筛选 → 当前赛事名单变更申请；通过/驳回 → 对应 requestId 审核动作；查看记录/返回 → 当前赛事与组别上下文', flowTransition: 'static-verified：名单变更基于赛事参赛名单快照；审核结果不覆盖球队日常球员库，也不改写已完赛记录', visual: 'visual-capture-pending：素材包已批准；需 1672 × 941 截图叠图', buildVerification: 'existing formal RosterChangeReview route；深链参数已登记，下一轮视觉对比修正' }],
  ['球队管理-加入申请-专业版.png', { buttonDestination: 'static-verified：筛选/查看/通过/拒绝/批量通过 → 当前赛事、组别的报名关系；返回 → 专业参赛球队总览', flowTransition: 'static-verified：审批只更新参赛关系，不自动认领球队或提交名单；风险关系必须人工核验，历史名单快照不受日常资料修改影响', visual: 'visual-capture-pending：素材包已批准；需 1672 × 941 截图叠图', buildVerification: 'TournamentTeams 已支持 tab=pending 深链；本轮 PC build 通过' }],
  ['球队管理-查看球队-专业版.png', { buttonDestination: 'static-verified：返回 → 当前赛事、组别的参赛球队；查看参赛名单 → 当前 teamId 的赛事名单快照；发送赛事通知 → 对应参赛关系', flowTransition: 'static-verified：详情限定赛事协作数据，球队日常资料与赛事名单快照分离，私有青训和财务资料不暴露给主办方', visual: 'visual-capture-pending：素材包已批准；需 1672 × 941 截图叠图', buildVerification: 'existing formal TeamDetail route；下一轮视觉对比修正' }],
  ['裁判管理-裁判库与赛事指派.png', { buttonDestination: 'verified：赛事选择 → 授权场次；单人/批量指派 → 当前赛事未锁定场次；查看资料、资格审核、导出、添加裁判均有真实动作', flowTransition: 'verified：裁判权限来自具体赛事/场次指派，保存不跨赛事，已提交裁判记录的场次不可覆盖', visual: 'visual-captured-major-fixed：1672 × 941 截图 .tmp/pc-visual-qa/referee-management-1672x941-v7.png；赛事、资格状态、统计、筛选、裁判表及指派入口均已对照；最终微差待统一叠图复核', buildVerification: 'npm run build-passed：2026-08-09，HeadRefereeManagement.vue' }],
  ['球队管理-生成球队邀请-专业版.png', { buttonDestination: 'static-verified：邀请候选 → 当前组别邀请关系；取消邀请 → 当前邀请记录；受邀认领 → 小程序定向认领流程', flowTransition: 'static-verified：邀请只读取当前赛事/组别的名额与可邀请球队，联系人与手机号用于受邀关系核验，不能静默认领', visual: 'visual-capture-pending：素材包已批准；需 1672 × 941 截图叠图', buildVerification: 'existing formal TournamentTeams 邀请流程；下一轮视觉对比修正' }],
  ['抽签与分组-快速模式-分组结果.png', { buttonDestination: 'verified：返回操作台实点到当前赛事/组别的 quick console；继续调整同样返回当前草稿；确认分组结果 → 当前组别赛程编排', flowTransition: 'verified：结果只读取当前 tournamentId/divisionId 的已审核参赛球队；确认前保持可调整，确认后进入当前组别赛程；未保存或归档状态不伪造成可编辑结果', visual: 'visual-captured-major-fixed：1672 × 941 .tmp/pc-visual-qa/draw-quick-result-1672x941-v5.png；素材包已批准；最终透明叠图微差复核待全量收口', buildVerification: 'PC npm run build passed：QuickDrawResult 与 TournamentDraw 路由状态已编译' }],
  ['抽签与分组-快速模式-分组操作台.png', { buttonDestination: 'verified：真实点击待分配球队进入当前草稿 A4，汇总即时 20/12→21/11；清空即时 0/32；一键随机当前草稿 32/0；返回到当前赛事/U10 config；分组结果到当前赛事/U10 result', flowTransition: 'verified：球队池只读取当前 tournamentId/divisionId 已审核报名；保存草稿作用域为 qa-tournament-2026/qa-division-u10/type=tournament、published=false；32签位完成后确认按钮启用，确认作用域 assigned=32 且 deletedArchived=false、deletedOtherTypes=false，不发布赛程或覆盖其他组别/赛制', visual: 'visual-1:1-passed：1672 × 941 最终截图 .tmp/pc-visual-qa/draw-quick-console-final-v2.png；按当前产品规则使用简易 U10，已对照批准原型核验 32队、20/12、8组、3/4与2/4签位、球队池、动作栏、校验和底部操作全部入屏，无横向溢出', buildVerification: 'npm run build-passed：2026-08-13，QuickTournamentConsole.vue、TournamentDraw.vue；validate-ui-delivery 162/162，zero-SDK 与 git diff 检查通过' }],
  ['抽签与分组-快速模式-分组设置.png', { buttonDestination: 'verified：真实点击“保存并进入分组操作台”到达当前赛事/U8 quick console，并携带 format=league、groupCount=4、teamsPerGroup=4、avoidSameRegion=1、balancedDistribution=1；“恢复默认设置”留在当前配置页且不写云端', flowTransition: 'verified：配置读取当前 divisionId 已审核球队并动态生成 4组×4签位；只有明确保存才把当前参数交给操作台，不在本页写入或覆盖既有 tournament_groups；恢复默认回读 cloudWrite=false', visual: 'visual-1:1-passed：1672 × 941 最终截图 .tmp/pc-visual-qa/draw-quick-config-final-v2.png；已对照批准原型核验赛事/组别上下文、三段页签、基础设置、规则开关、4组×4签位预览、容量校验和底部操作区全部入屏，无横向溢出', buildVerification: 'npm run build-passed：2026-08-13，TournamentDraw.vue；validate-ui-delivery 162/162，zero-SDK 与 git diff 检查通过' }],
  ['抽签与分组-模式选择.png', { buttonDestination: 'verified：真实点击 U8“进入分组”到达当前赛事/组别 mode=quick&view=config；真实点击 U12“进入专业抽签”到达当前赛事/组别 mode=professional&step=setup；真实点击“退出赛事空间”到达 /tournament-space', flowTransition: 'verified：入口由当前 divisionId 的已锁定 mode、已审核球队和抽签状态决定；简易链路进入快速配置，专业链路从 setup 开始并继续经过球队池、大屏与操作台，不按名称推断或绕过专业步骤', visual: 'visual-1:1-passed：1672 × 941 最终截图 .tmp/pc-visual-qa/draw-mode-overview-final-v1.png；已对照批准原型核验赛事日期/地区、五组别、1/3/1 状态统计、代码实现徽章、简易/专业锁定标识、动作及底部边界全部入屏，无横向溢出', buildVerification: 'npm run build-passed：2026-08-13，TournamentDraw.vue；validate-ui-delivery 162/162，zero-SDK 与 git diff 检查通过' }],
  ['球队管理-球队变更-简易版.png', { buttonDestination: 'verified：默认页展示当前组别历史变更；待处理入口 view=pending 中真实点击“同意变更”与“驳回”均打开受控确认，始终保留 qa-tournament-2026/qa-division-u8', flowTransition: 'verified：同意作用域回读 action=approve-cancel、recordId=qa-team-6，仅撤销当前报名关系；驳回作用域回读 action=reject-cancel、restoredStatus=approved，仅恢复当前报名关系；两条链路均明确 deletedUsers=false、deletedTeamProfile=false、historicalSnapshotsChanged=false', visual: 'visual-1:1-passed：1672 × 941 最终截图 .tmp/pc-visual-qa/tournament-teams-simple-change-final-v2.png；已对照批准原型核验变更入口关闭、3/1/0 摘要、截止锁定提示、筛选、四条历史记录及底部处理原则全部入屏；动作证据为 tournament-teams-simple-change-approve-scope-v2.png 与 tournament-teams-simple-change-reject-scope-v2.png', buildVerification: 'npm run build-passed：2026-08-13，TournamentTeams.vue；validate-ui-delivery 162/162，zero-SDK 与 git diff 检查通过' }],
  ['球队管理-加入申请-简易版.png', { buttonDestination: 'verified：真实点击“查看”到达 /teams/qa-team-3?fromTournament=qa-tournament-2026&divisionId=qa-division-u8；加入申请页签始终保留当前 tournamentId/divisionId', flowTransition: 'verified：申请队列与主办方邀请待认领队列均由当前 tournamentId/divisionId 的 tournament_teams 状态筛选；批量通过确认范围仅含无重复 qa-team-3，并明确保护疑似同名 qa-team-5，审核只修改对应报名关系', visual: 'visual-1:1-passed：1672 × 941 最终截图 .tmp/pc-visual-qa/tournament-teams-simple-pending-final-v2.png；已对照批准原型核验 2/3/5/1 摘要、双入口说明、筛选、两条审核申请与三条待认领邀请均完整入屏', buildVerification: 'npm run build-passed：2026-08-13，TournamentTeams.vue；validate-ui-delivery 162/162，zero-SDK 与 git diff 检查通过' }],
  ['球队管理-查看球队-简易版.png', { buttonDestination: 'verified：真实点击“查看赛程赛果”到达 /tournaments/qa-tournament-2026/matches?divisionId=qa-division-u8；真实点击“返回参赛球队”到达 /tournaments/qa-tournament-2026/teams?divisionId=qa-division-u8', flowTransition: 'verified：详情由 teamId、fromTournament、divisionId 与对应 tournament_teams 关系读取；球队长期资料与赛事报名快照分离，日常编辑不覆盖历史参赛数据', visual: 'visual-1:1-passed：1672 × 941 最终截图 .tmp/pc-visual-qa/tournament-team-detail-simple-final.png；已对照批准原型核验赛事壳、真实 SVG 队徽回退、球队参赛快照、资料/协作/比赛数据卡、赛程入口与简易版数据边界', buildVerification: 'npm run build-passed：2026-08-13，TeamDetail.vue、router/index.js；validate-ui-delivery 162/162，zero-SDK 检查通过' }],
  ['球队管理-参赛球队-简易版.png', { buttonDestination: 'verified：真实点击“查看球队”到达 /teams/qa-team-1?fromTournament=qa-tournament-2026&divisionId=qa-division-u8；赛事与竞赛组别上下文均保留', flowTransition: 'verified：参赛列表仅按 tournamentId/divisionId 读取 tournament_teams；参赛球队页不混入球队变更记录，邀请、申请和审核仍保留原状态与可恢复失败反馈', visual: 'visual-1:1-passed：1672 × 941 最终截图 .tmp/pc-visual-qa/tournament-teams-simple-final.png；已对照批准原型核验赛事壳、组别工具栏、页签、16/13/3/13 统计、简易模式提示、筛选操作和五行球队数据表', buildVerification: 'npm run build-passed：2026-08-13，TournamentTeams.vue；validate-ui-delivery 162/162，zero-SDK 源码/依赖声明检查通过' }],
  ['竞赛管理-U16组-简化版-步骤1-赛制设置.png', { buttonDestination: 'verified：赛制卡 → 当前 divisionId 草稿；保存并进入基础规则 → 当前 divisionId rules?step=rules；返回 → 组别总览', flowTransition: 'verified：仅写入 divisionId 的 formatType 与草稿进度，不发布、不生成赛程、不修改其他组别或历史比赛快照', visual: 'visual-captured-major-fixed：1671 × 941 截图 .tmp/pc-visual-qa/division-rules-simple-format-1671x941-v10.png；已对照赛事壳、U16 简易模式、三步流程、赛制卡、基础参数、提示与固定操作栏；最终微差待统一叠图复核', buildVerification: 'npm run build-passed：2026-08-09，DivisionRulesWizard.vue、capture-pc-visual-qa.ps1' }],
  ['竞赛管理-U16组-简化版-步骤2-基础规则.png', { buttonDestination: 'verified：上一步 → 当前 divisionId 的赛制设置；保存并进入规则定版 → 当前 divisionId rules?step=finalize；失败保留当前输入', flowTransition: 'verified：比赛时间、球队参赛、换人与执行、红黄牌、积分和排名规则均按 divisionId 保存草稿；未定版前不发布规则或改写赛程/历史快照', visual: 'visual-captured-major-fixed：1671 × 941 截图 .tmp/pc-visual-qa/division-rules-simple-basic-1671x941-v3.png；已对照赛事壳、三步状态、五项基础规则区块与固定上下步操作；最终微差待统一叠图复核', buildVerification: 'npm run build-passed：2026-08-09，DivisionRulesWizard.vue' }],
  ['竞赛管理-U16组-简化版-步骤3-规则定版.png', { buttonDestination: 'verified：上一步 → 当前 divisionId 基础规则；确认规则并进入球队管理 → 先锁定当前 divisionId，再进入 /tournaments/:id/teams?divisionId=:divisionId', flowTransition: 'verified：确认时写入 rulesLocked/ruleFinalized/ruleStatus/ruleProgress 与规则快照；不自动修改赛程或历史比赛快照', visual: 'visual-captured-major-fixed：1671 × 941 截图 .tmp/pc-visual-qa/division-rules-simple-finalize-1671x941-v1.png；已对照赛事壳、三步完成态、规则摘要、定版信息、影响范围和固定操作栏；最终微差待统一叠图复核', buildVerification: 'npm run build-passed：2026-08-09，DivisionRulesWizard.vue、capture-pc-visual-qa.ps1' }],
  ['竞赛管理-U16组-规则定版-已生效.png', { buttonDestination: 'verified：进入抽签分组 → 当前 tournamentId/divisionId 抽签页；进入赛程管理 → 当前 tournamentId/divisionId 赛程页；返回 → 组别总览', flowTransition: 'verified：已生效状态只读当前规则快照，无法从此页编辑；规则继续约束本组抽签、赛程和比赛管理，不回写其他组别', visual: 'visual-captured-major-fixed：1672 × 941 截图 .tmp/pc-visual-qa/division-rules-simple-effective-1672x941-v2.png；已对照赛事壳、生效状态、规则摘要、定版信息、影响范围与后续操作栏；最终微差待统一叠图复核', buildVerification: 'npm run build-passed：2026-08-09，DivisionRulesWizard.vue' }],
  ['竞赛管理-组别管理-简易与专业模式对比.png', { buttonDestination: 'verified：查看模式区别 → 当前基础创建页 mode-compare 状态；选择简易/专业模式 → 当前创建草稿；关闭/返回 → 基础信息；创建后 → 当前 divisionId 的 rules?step=format', flowTransition: 'verified：模式选择只写入即将创建的 divisions 记录，创建前不修改既有组别、不发布规则；赛制与赛程确认后模式锁定', visual: 'visual-captured-major-fixed：1618 × 972 截图 .tmp/pc-visual-qa/division-mode-compare-1618x972-v7.png；已对照原型的遮罩、居中对比卡、免费/PRO 信息、模式选择和锁定说明；最终微差待统一叠图复核', buildVerification: 'npm run build-passed：2026-08-09，TournamentDivisionCreate.vue' }],
  ['竞赛管理-组别管理-卡片菜单.png', { buttonDestination: 'verified：编辑组别信息 → 当前 divisionId 规则页；查看模式对比/升级提示 → mode-compare 指引；查看参赛球队、进入抽签分组、进入赛程管理 → 当前 tournamentId/divisionId 对应正式页', flowTransition: 'verified：菜单动作始终携带当前 divisionId；专业抽签携带 mode=professional；升级入口不直接写入既有组别，模式锁定仍由规则定版控制', visual: 'visual-captured-major-fixed：1619 × 972 截图 .tmp/pc-visual-qa/division-card-menu-1619x972-v1.png；已对照赛事壳、五组别数据表、U10 行内菜单、模式指引与三条当前组别去向；最终微差待统一叠图复核', buildVerification: 'npm run build-passed：2026-08-09，DivisionManagement.vue' }],
  ['竞赛管理-添加组别-基础创建.png', { buttonDestination: 'verified：取消/返回 → 当前赛事组别总览；创建并进入赛制设置 → 写入当前 tournamentId 的新 division 并携带 divisionId 进入正式 rules?step=format', flowTransition: 'verified：模式、预计队伍数与排序均随新组别记录保存；创建不发布规则、不合并同名组别、不覆盖既有组别', visual: 'visual-captured-major-fixed：1586 × 992 截图 .tmp/pc-visual-qa/division-create-1586x992-v3.png；已对照赛事壳、预填基础信息、实时预览、模式选择、提示和固定操作条；最终微差待统一叠图复核', buildVerification: 'npm run build-passed：2026-08-09，TournamentDivisionCreate.vue、DivisionManagement.vue、router/index.js' }],
  ['赛程管理-赛程总览.png', { buttonDestination: 'static-verified：生成赛程 → 当前组别的正式基础设置；导入/查看/继续编排均进入当前赛事与组别的赛程工作台', flowTransition: 'static-verified：赛事级总览 → 组别赛程编辑；真实场次、冲突与发布状态驱动统计，不伪造已发布或已完成状态', visual: 'visual-captured-major-fixed：1672 × 941 已与原图对照；5组别、38队、92场、64场已发布与五行进度表已校正；最终透明叠图微差待复核', buildVerification: 'npm run build-passed：2026-08-09，TournamentSchedule.vue' }],
  ['赛程管理-生成赛程-基础设置.png', { buttonDestination: 'static-verified：下一步 → 场地与时间；返回分组结果、保存草稿均有正式动作；校验未填写比赛日期或单日上限时阻止继续', flowTransition: 'static-verified：仅暂存当前赛事与组别的生成配置，未在此步写入场次', visual: 'visual-captured-major-fixed：1672 × 941 已与原图对照；已改为保留PC侧栏的正式分步页并补齐日期、比赛日、时长、范围和编排偏好；微差待复核', buildVerification: 'npm run build-passed：2026-08-09，TournamentSchedule.vue' }],
  ['赛程管理-生成赛程-场地与时间.png', { buttonDestination: 'static-verified：上一步 → 基础设置；下一步 → 编排规则；添加/编辑场地、修改基础设置均有正式动作；缺少场地或时段时阻止继续', flowTransition: 'static-verified：可用场地与时段由当前组别生成配置传递到规则页', visual: 'visual-captured-major-fixed：1672 × 941 已与原图对照；场地表、分配方式、时间规则和阶段摘要已补齐；微差待复核', buildVerification: 'npm run build-passed：2026-08-09，TournamentSchedule.vue' }],
  ['赛程管理-生成赛程-编排规则.png', { buttonDestination: 'static-verified：上一步 → 场地与时间；下一步 → 预览确认；查看竞赛规则与策略项均有正式目标或状态', flowTransition: 'static-verified：规则选择在最终确认前均不直接覆盖已有场次', visual: 'visual-captured-major-fixed：1672 × 941 已与原图对照；规则来源、阶段顺序、六项自动策略和冲突优先级已补齐；微差待复核', buildVerification: 'npm run build-passed：2026-08-09，TournamentSchedule.vue' }],
  ['赛程管理-生成赛程-预览确认.png', { buttonDestination: 'static-verified：上一步 → 编排规则；确认生成 → 正式 generateSchedule 服务；查看完整预排、返回修改与提示关闭均有动作', flowTransition: 'static-verified：最终确认才提交生成请求；已有场次显示安全覆盖校验提示', visual: 'visual-captured-major-fixed：1672 × 941 已与原图对照；四项统计、预排表、生成前检查、配置摘要和生成后调整提示已补齐；微差待复核', buildVerification: 'npm run build-passed：2026-08-09，TournamentSchedule.vue' }],
  ['赛程管理-赛程编排工作台-v2.png', { buttonDestination: 'static-verified：比赛卡编辑/拖拽 → 冲突检测与保存；修改生成规则 → 四步生成向导；预览发布 → 当前组别赛程发布流程', flowTransition: 'static-verified：仅使用当前赛事与组别的真实场地、时段、球队和场次；锁定或归档场次不会被手动排程覆盖', visual: 'visual-captured-major-fixed：1672 × 941 已与原图对照；顶部操作、五项统计、待安排区和场地日历矩阵已补齐；共享侧栏品牌区微差待统一复核', buildVerification: 'npm run build-passed：2026-08-09，TournamentSchedule.vue' }],
  ['赛程管理-冲突检测.png', { buttonDestination: 'static-verified：重新检测 → 刷新真实场次；手动修改场次 → 编辑弹窗；采用建议 → 带提示进入人工确认，不自动覆盖比赛；返回 → 编排工作台', flowTransition: 'static-verified：同场地同日期同时间冲突由实时场次计算；保存场次后重新检测', visual: 'visual-captured-major-fixed：1672 × 941 已与原图对照；四项统计、冲突列表、关联场次、推荐调整和返回/重检/完成操作已补齐；共享侧栏品牌区微差待统一复核', buildVerification: 'npm run build-passed：2026-08-09，TournamentSchedule.vue' }],
  ['赛程管理-手动修改场次-编辑弹窗.png', { buttonDestination: 'static-verified：保存 → updateMatch → 重新加载并回到冲突检测；取消 → 回到发起编辑的工作台或冲突面板', flowTransition: 'static-verified：当前赛事与组别、场次、场地、时间和球队由真实记录加载；保存失败不清空原输入或覆盖原赛程', visual: 'visual-captured-major-fixed：1672 × 941 已与原图对照；推荐方案、日期/时间/场地、校验结果、恢复/取消/保存动作均已补齐；共享侧栏品牌区微差待统一复核', buildVerification: 'npm run build-passed：2026-08-09，TournamentSchedule.vue' }],
  ['比赛管理-选择组别.png', { buttonDestination: 'verified：筛选 → 当前真实组别列表；进入比赛管理 → 当前赛事和组别的赛程比赛工作台；专业版入口 → 保留 divisionId 进入专业比赛工作台', flowTransition: 'verified：从 divisions 与 matches 按 tournamentId/divisionId 读取，禁止以组别名称推断数据或权限；本地 visualQa=1 仅使用隔离样例', visual: 'visual-captured-major-fixed：1618 × 972 截图 .tmp/pc-visual-qa/match-management-entry-v1-1618x972.png；已核对五组别层级、筛选、进度、待办和专业版突出状态；共享侧栏品牌微差待最终统一叠图复核', buildVerification: 'npm run build-passed：2026-08-09，TournamentMatchManagement.vue' }],
  ['比赛管理-U8组-比赛列表.png', { buttonDestination: 'verified：状态筛选 → 当前组别真实比赛表；实时监控/查看详情/赛果复核/主办方补录/查看档案 → 对应真实 matchId 页面；提醒 → 当前裁判提醒动作；返回 → 比赛管理组别入口', flowTransition: 'verified：通过 tournamentId 与 divisionId 筛选比赛；状态来自真实比赛记录，未用前端名称或模拟数据判断；本地 visualQa=1 使用隔离验收样例展示全部状态', visual: 'visual-captured-major-fixed：1618 × 972 截图 .tmp/pc-visual-qa/match-list-u8-final-v2-1618x972.png；已核对统计、六态筛选、工具栏、比赛表、五类赛后动作；共享侧栏品牌微差待最终统一叠图复核', buildVerification: 'npm run build-passed：2026-08-09，TournamentMatchManagement.vue' }],
  ['比赛管理-U16组-比赛列表.png', { buttonDestination: 'verified：状态筛选 → 当前专业组别真实比赛；赛中只读监控/赛果复核/查看归档/赛前安排 → 对应真实 matchId，名单待提交不进入正式执行', flowTransition: 'verified：专业版列表不绕过名单、阵容、电子记录与状态机；visualQa=1 仅使用开发态隔离验收快照', visual: 'visual-captured-major-fixed：1670 × 941 截图 .tmp/pc-visual-qa/match-list-u16-v1-1670x941.png；已核对四张统计卡、专业名单/阵容与电子记录列、五种比赛状态和操作去向；最终透明叠图微差复核待统一收口', buildVerification: 'npm run build-passed：2026-08-09，TournamentMatchManagement.vue' }],
  ['比赛管理-U16组-赛中只读监控.png', { buttonDestination: 'verified：刷新 → 重读官方 match/match_events；返回 → 当前专业组别列表；查看详情 → matchId 详情', flowTransition: 'verified：PC 只读显示电子记录、核验阵容和比赛事件，禁止现场写入', visual: 'visual-captured-major-fixed：1671 × 941 截图 .tmp/pc-visual-qa/match-monitor-u16-1671x941-v2.png；已核对专业赛中横幅、六项只读导航、赛前核验、事件时间线、提交状态和五项赛况指标；最终透明叠图微差待统一收口', buildVerification: 'npm run build-passed：2026-08-09，MatchLiveMonitor.vue' }],
  ['比赛管理-U16组-比赛归档详情.png', { buttonDestination: 'verified：从已归档专业场次 → 独立 matchId 归档详情；导出电子记录、审计日志和返回组别列表均为只读动作', flowTransition: 'verified：归档工作台锁定裁判电子记录、阵容、签字和现场事件，只读展示归档编号与审计时间线', visual: 'visual-captured-major-fixed：1671 × 941 截图 .tmp/pc-visual-qa/match-archive-u16-v3-1671x941.png；已核对归档结论、阵容快照、事件、报告、电子记录、签字、审计和底部只读动作；最终透明叠图微差复核待统一收口', buildVerification: 'npm run build-passed：2026-08-09，MatchReviewWorkspace.vue archived state' }],
  ['比赛管理-U8组-实时监控.png', { buttonDestination: 'verified：刷新 → 重读真实 match/match_events；联系裁判 → 已登记的裁判电话；返回 → 同组别比赛列表', flowTransition: 'verified：赛中场次从列表进入独立只读路由，PC 不提供比分、事件、阵容或赛果写入；本地 visualQa=1 仅读取隔离验收快照', visual: 'visual-captured-major-fixed：1672 × 941 截图 .tmp/pc-visual-qa/match-monitor-u8-final-v2-1672x941.png；已核对比分、事件、执行状态、同步健康、指标和底部只读动作；队徽缺省时为透明展示容器，不加外框', buildVerification: 'npm run build-passed：2026-08-09，MatchLiveMonitor.vue' }],
  ['比赛管理-U8组-赛后资料接收与补充.png', { buttonDestination: 'verified：返回 → 当前组别比赛列表；查看纸质记录 → 已授权文件预览；保存补充材料 → 当前比赛草稿；提交复核 → matchId 受控复核页', flowTransition: 'verified：裁判电子记录提交后 PC 端仅补充和复核，不能改写现场快照；上传失败保留主办方输入和已上传文件', visual: 'visual-captured-major-fixed：1672 × 941 截图 .tmp/pc-visual-qa/match-post-u8-before-1672x941.png；已核对场次、裁判团队、纸质记录、补充材料、异常说明和复核操作', buildVerification: 'npm run build-passed：2026-08-09，MatchPostMatchReview.vue' }],
  ['抽签与分组-专业模式-抽签操作台-联赛.png', { buttonDestination: 'static-verified：确认当前联赛签位 → 专业分组结果；返回 → 开始抽签', flowTransition: 'static-verified：format=league 深链渲染待分配池、L1-L8 联赛签位和生成规则，不套用小组赛卡片', visual: 'visual-captured-major-fixed：1672 × 941 第二轮截图已与原图对照，三栏联赛编排结构已实现；最终叠图微差与真实队徽仍待收口', buildVerification: 'npm run build-passed：2026-08-09' }],
  ['抽签与分组-专业模式-抽签操作台-淘汰赛.png', { buttonDestination: 'static-verified：确认当前淘汰签位 → 专业分组结果；返回 → 开始抽签', flowTransition: 'static-verified：format=knockout 深链渲染待分配池、16 强左右签位和晋级中心区', visual: 'visual-captured-major-fixed：1672 × 941 第二轮截图已与原图对照，淘汰赛深色对阵区和左右首轮签位已实现；连线细节与真实队徽仍待收口', buildVerification: 'npm run build-passed：2026-08-09' }],
  ['抽签与分组-专业模式-抽签操作台-混合制对阵图.png', { buttonDestination: 'static-verified：确认混合制签位 → 专业分组结果；返回 → 开始抽签', flowTransition: 'static-verified：format=hybrid 深链渲染参赛队伍、联赛阶段排序和前八名淘汰对阵关系', visual: 'visual-captured-major-fixed：1672 × 941 第二轮截图已与原图对照，三栏混合制排序/晋级结构已实现；对阵连线和密度微差仍待收口', buildVerification: 'npm run build-passed：2026-08-09' }],
  ['抽签与分组-专业模式-抽签操作台-抽签介绍.png', { buttonDestination: 'verified：确认并进入下一步实点到当前赛事/U16组 professional console&stage=teams；返回 → 当前大屏设置', flowTransition: 'verified：大屏设置保存 → stage=intro → stage=teams，持续携带赛事与组别', visual: 'visual-captured-major-fixed：1672 × 941 .tmp/pc-visual-qa/professional-draw-intro-u16-1672x941-v1.png；素材包已批准；最终透明叠图微差复核待全量收口', buildVerification: 'npm run build-passed：2026-08-10' }],
  ['抽签与分组-专业模式-抽签操作台-队伍展示.png', { buttonDestination: 'verified：确认并进入下一步实点到当前赛事/U16组 professional console&stage=ready；返回介绍 → stage=intro；校验/权限不满足时不能继续', flowTransition: 'verified：只展示当前赛事、当前组别已审核球队和种子状态', visual: 'visual-captured-major-fixed：1672 × 941 .tmp/pc-visual-qa/professional-draw-teams-u16-1672x941-v1.png；素材包已批准；最终透明叠图微差复核待全量收口', buildVerification: 'npm run build-passed：2026-08-10' }],
  ['抽签与分组-专业模式-抽签操作台-小组赛.png', { buttonDestination: 'static-verified：确认开始抽签 → stage=slots；确认签位编排 → 专业分组结果；返回按当前操作台状态回退', flowTransition: 'static-verified：先持久化 drawAssignments，再展示小组签位；format=group 深链支持待分配池与八组编排', visual: 'visual-captured-major-fixed：1672 × 941 第二轮截图已与原图对照，待分配球队、20/32 状态和八组签位首屏结构已实现；拖拽态与真实队徽仍待收口', buildVerification: 'npm run build-passed：2026-08-09' }],
  ['抽签与分组-专业模式-抽签操作台-开始抽签.png', {
    buttonDestination: 'static-verified：确认开始抽签写入当前赛事/组别的专业编排状态；返回大屏设置保留专业模式与组别参数；无管理权限或球队池未校验时禁用主动作',
    flowTransition: 'static-verified：球队池 → 大屏设置 → 开始抽签均保持 mode=professional；抽签生成后才可确认结果，且不覆盖阵容与赛果快照',
    visual: 'visual-captured-major-fixed：1672 × 941 第二轮截图已与原图对照，任务确认、现场状态、大屏预览、警告和底部开始动作均在目标首屏；最终叠图微差与机构队徽仍待收口',
    buildVerification: 'npm run build-passed：2026-08-09，ProfessionalDrawFlow.vue、TournamentDraw.vue'
  }],
  ['抽签与分组-专业模式-分组结果.png', {
    buttonDestination: 'static-verified：返回操作台 → 当前赛事专业操作台；进入赛程编排 → /tournaments/:id/schedule?divisionId=:divisionId',
    flowTransition: 'static-verified：仅展示当前赛事/组别已确认的专业编排状态；不伪造赛程、不写入历史赛果或阵容快照',
    visual: 'visual-captured-major-fixed：1672 × 941 第二轮截图已与原图对照，统计、筛选、四列八组结果和确认状态结构已实现；底部信息区与真实队徽仍待最终叠图收口',
    buildVerification: 'npm run build-passed：2026-08-09，ProfessionalDrawFlow.vue、TournamentDraw.vue'
  }],
  ['06-球队详情.png', {
    buttonDestination: 'static-verified：资料、成员、球员库、参赛管理、历史记录均进入对应三级页；当前赛事 → 赛事详情',
    flowTransition: 'static-verified：仅使用工作空间可访问团队和参赛关系；长期资料提示不覆盖名单、阵容和赛果快照',
    visual: 'visual-capture-pending：需 780 × 1688 截图叠图',
    build: 'node-check-passed：team/team.js、team/team.wxml'
  }],
  ['07-球队球员库.png', {
    buttonDestination: 'verified：添加球员、资料不完整筛选、球员详情与受控家长服务号交接均有已登记动作；只读身份不显示写入口。',
    flowTransition: 'verified：通过当前工作空间与 team.view/team.manage 校验后加载长期球员资产；不自动复制为赛事名单或阵容快照。',
    buildVerification: 'verified：node --check getMiniWorkspace 与 player-library；路由 JSON 通过；WXML 表达式仅使用循环项字段与预计算状态。',
    visual: 'visual-accepted：`.tmp/mini-visual-qa/player-library-final-v4.png` 已在批准的 390×844 逻辑目标视口捕获；核对了胶囊安全区、长期球员资产摘要、资料状态统计、服务号补充资料交接、搜索/筛选与球员状态列表。'
  }],
  ['08-三字段添加球员.png', {
    buttonDestination: 'verified：主操作保存档案并生成受控家长协作 token，次操作仅保存档案；返回到球员库。',
    flowTransition: 'verified：同一团队同名同生日球员必须人工核验，禁止自动合并；长期档案不自动转为赛事名单。',
    buildVerification: 'verified：node --check getMiniWorkspace 与 player-add；WXML 无比较、三元、方法调用或数组索引。',
    visual: 'visual-accepted：`.tmp/mini-visual-qa/player-add-final-v3.png` 已在批准的 390×844 逻辑目标视口捕获；核对了胶囊安全区、三字段建档、家长协作链接开关、年龄组建议与双层保存动作，并使用统一油画风足球图标。'
  }],
  ['12-赛事正式名单.png', {
    buttonDestination: 'verified：候选球员只在当前赛事名单快照内勾选；资料异常、超上限和只读身份不能提交；提交进入主办方审核，返回回到当前球队赛事关系。',
    flowTransition: 'verified：长期球员库 → 当前赛事 submitted roster_snapshot → 主办方审核；赛事名单不回写长期资料或单场阵容；退回状态保留为单独受控页面。',
    buildVerification: 'verified：node --check miniprogram/pages/team/official-roster/official-roster.js；路由 JSON 与 WXML 表达式检查通过。',
    visual: 'visual-accepted：`.tmp/mini-visual-qa/official-roster-draft-final-v2.png` 已在批准的 390×844 逻辑目标视口捕获；核对了胶囊安全区、普通正式名单标题、赛事/截止/上限摘要、四步状态、普通提交提示、球员资格区分与提交动作。'
  }],
  ['05-创建球队.png', {
    buttonDestination: 'static-verified：创建球队 → onboardingWorkspace.createTeam；完成后切换 team:<teamId> 工作空间并进入 /pages/teams/index',
    flowTransition: 'static-verified：无业务关系才可自主创建；原图/透明队徽均由服务端校验 cloud:// 文件；失败保留输入与原图',
    visual: 'visual-capture-pending：创建表单细项仍需按 05 原图补齐并截图叠图',
    build: 'node-check-passed：teams/index.js、onboarding.js、onboardingWorkspace'
  }],
  ['02-无球队状态.png', {
    buttonDestination: 'static-verified：创建球队 → /pages/guide/team-info/team-info；邀请说明不伪造认领/搜索入口',
    flowTransition: 'static-verified：无球队仅提示自主建队；新建参赛和预建队接收必须由真实邀请深链进入',
    visual: 'visual-capture-pending：需 780 × 1688 截图叠图',
    build: 'node-check-passed：teams/index.js、teams/index.wxml'
  }],
  ['01-球队中心.png', {
    buttonDestination: 'static-verified：创建球队 → /pages/guide/team-info/team-info；球队卡 → /pages/team/team；赛事待办 → 报名/名单协作上下文',
    flowTransition: 'static-verified：仅返回当前工作空间真实长期球队；无权限不展示创建入口；待办携带 tournamentId/teamId',
    visual: 'visual-capture-pending：需 780 × 1688 截图叠图',
    build: 'node-check-passed：teams/index.js、getMiniWorkspace'
  }],
  ['01-我的.png', {
    buttonDestination: 'static-verified：消息 → /pages/messages/index；个人资料 → /pages/profile/info/info；退出 → 清理本机会话后 /pages/login/login',
    flowTransition: 'static-verified：当前身份与工作空间只来自 getMiniWorkspace；退出不删除自然人、机构或球队资产',
    visual: 'visual-capture-pending：需 780 × 1688 截图叠图',
    build: 'node-check-passed：profile.js、workspace.js、getMiniWorkspace'
  }],
  ['02-消息中心.png', {
    buttonDestination: 'static-verified：分类筛选同页过滤；逐条/全部已读 → getMiniWorkspace.markMessageRead；服务端白名单深链才可跳转',
    flowTransition: 'static-verified：消息按 orgId 与当前自然人/岗位受众过滤；失败保留重试反馈',
    visual: 'visual-capture-pending：需 780 × 1688 截图叠图',
    build: 'node-check-passed：messages/index.js、getMiniWorkspace'
  }],
  ['03-切换身份.png', {
    buttonDestination: 'static-verified：选择已授权身份 → getMiniWorkspace.setHomeIdentity → 重新加载工作空间 → /pages/home/home',
    flowTransition: 'static-verified：服务端拒绝无机构关系、无授权身份或跨机构身份；保存失败不切换',
    visual: 'visual-capture-pending：需 780 × 1688 截图叠图',
    build: 'node-check-passed：profile.js、getMiniWorkspace'
  }],
  ['05-工作空间访问受限.png', {
    buttonDestination: 'static-verified：申请访问 → workspaceAccess.request；返回登录 → 清理本机会话；已获授权 → 刷新指定工作空间后首页',
    flowTransition: 'static-verified：workspace.loadContext 对指定 org 工作空间的无权访问会进入 restricted 深链；受限页读取 workspaceAccess 状态，申请动作仅创建当前 org/user 的 pending 请求；授权后再次加载指定 workspace',
    visual: 'visual-capture-pending：需 780 × 1688 截图叠图',
    build: 'node-check-passed：workspace/restricted、workspaceAccess、getMiniWorkspace；workspaceAccess 已于 2026-08-14 部署并读回无会话登录失效；getMiniWorkspace 已于 2026-08-14 部署并读回无会话 WORKSPACE_LOAD_FAILED；未执行真机受保护入口点击'
  }],
  ['01B-选择业务场景-举办赛事.png', { buttonDestination: 'static-verified：保存 event 场景 → 赛事最小资料', flowTransition: 'static-verified：保存失败不跳转并保留选中态', visual: 'visual-capture-pending：需 780 × 1688 截图叠图', build: 'node-check-passed：onboarding.js' }],
  ['04-举办赛事-完善资料.png', { buttonDestination: 'static-verified：创建并继续 → onboardingWorkspace.createEventSpace', flowTransition: 'static-verified：机构成员关系与草稿赛事成功后才进入完成态', visual: 'visual-capture-pending：需 780 × 1688 截图叠图', build: 'node-check-passed：onboarding.js、onboardingWorkspace' }],
  ['05-举办赛事-创建完成.png', { buttonDestination: 'static-verified：进入赛事空间 → 真实 tournamentId 详情页', flowTransition: 'static-verified：无 tournamentId 不允许跳转', visual: 'visual-capture-pending：需 780 × 1688 截图叠图', build: 'node-check-passed：onboarding.js' }],
  ['01-选择业务场景.png', {
    buttonDestination: 'static-verified：场景卡 → saveScene；管理球队/举办赛事 → 最小资料；青训 → 后端开户状态服务说明',
    flowTransition: 'static-verified：onboardingWorkspace state 无业务关系 → 引导；已有关系 → 对应工作空间；保存失败不跳转',
    visual: 'visual-capture-pending：需 780 × 1688 截图叠图',
    build: 'node-check-passed：login.js、onboarding.js、onboardingWorkspace'
  }],
  ['06-青训教务-服务说明-未开户.png', {
    buttonDestination: 'static-verified：联系客户咨询 → createTrainingConsultation；功能演示 → 只读演示；刷新 → state',
    flowTransition: 'static-verified：未开户不可进入创建；咨询不自动开户或收费；刷新后按后端有效状态分流',
    visual: 'visual-capture-pending：需 780 × 1688 截图叠图',
    build: 'node-check-passed：onboarding.js、onboardingWorkspace'
  }],
  ['07-青训教务-服务说明-已开户.png', {
    buttonDestination: 'static-verified：继续创建青训空间 → 资料页；联系客户咨询 → createTrainingConsultation',
    flowTransition: 'static-verified：仅后端有效订阅状态进入创建；无效状态回到未开户服务说明',
    visual: 'visual-capture-pending：需 780 × 1688 截图叠图',
    build: 'node-check-passed：onboarding.js、onboardingWorkspace'
  }],
  ['08-青训教务-完善资料.png', {
    buttonDestination: 'static-verified：机构标识 → 裁剪/原图上传/透明抠图；创建并继续 → createTrainingWorkspace',
    flowTransition: 'static-verified：有效订阅与岗位关系校验后创建机构；失败保留输入和原图',
    visual: 'visual-capture-pending：需 780 × 1688 截图叠图',
    build: 'node-check-passed：onboarding.js、onboardingWorkspace'
  }],
  ['09-青训教务-创建完成.png', {
    buttonDestination: 'static-verified：进入青训首页 → switchWorkspace(orgId) → /pages/training/index',
    flowTransition: 'static-verified：工作空间加载失败不伪造完成，保留重试反馈',
    visual: 'visual-capture-pending：需 780 × 1688 截图叠图',
    build: 'node-check-passed：onboarding.js、workspace.js、onboardingWorkspace'
  }],
  ['10-青训教务-功能演示.png', {
    buttonDestination: 'static-verified：返回服务说明 → state 重新读取开户状态',
    flowTransition: 'static-verified：演示全程只读，不创建机构、不保存记录、不收费、不授予权限',
    visual: 'visual-capture-pending：需 780 × 1688 截图叠图',
    build: 'node-check-passed：onboarding.js'
  }],
  ['01-首页-赛事主办场景.png', {
    buttonDestination: 'static-verified：消息 → /pages/messages/index；全部待办 → /pages/todo/index；全部赛程/比赛卡 → 授权赛事页',
    flowTransition: 'static-verified：getMiniWorkspace 依据当前机构权限与最近可用身份确定赛事负责人状态；空态与加载失败可恢复',
    visual: 'visual-capture-pending：需 780 × 1688 截图叠图',
    build: 'node-check-passed：home.js、getMiniWorkspace'
  }],
  ['02-首页-球队协作场景.png', {
    buttonDestination: 'static-verified：消息 → /pages/messages/index；球队卡 → /pages/team/team；全部球队 → /pages/teams/index；赛程 → /pages/schedule/index',
    flowTransition: 'static-verified：只读取已接受的球队成员关系和赛事快照；无球队/无赛程不伪造数据',
    visual: 'visual-accepted-major-reviewed：微信开发者工具本地 MCP 清理编译缓存并重编译后，iPhone 13 Pro 100%（390 × 844，对应批准稿 780 × 1688 @2x）截图 .tmp/mini-visual-qa/home-team-coach-after-icon-fix-iphone13pro-100.png；待办使用 shield.svg/event.svg/warning.svg，底部五中心使用共享 tab-*.svg，未再出现旧大图标或缓存残影',
    build: 'node-check-passed：2026-08-13，home.js、custom-tab-bar/index.js；图标 manifest 可解析，首页/导航 WXML 表达式门禁通过'
  }],
  ['03-首页-青训经营场景.png', {
    buttonDestination: 'static-verified：消息 → /pages/messages/index；待办 → /pages/todo/index；全部课程 → /pages/training/index',
    flowTransition: 'static-verified：有效订阅与教育岗位权限才显示青训身份；未订阅/无岗位显示真实受限状态',
    visual: 'visual-capture-pending：需 780 × 1688 截图叠图',
    build: 'node-check-passed：home.js、getMiniWorkspace'
  }],
  ['01A-选择业务场景-管理球队.png', {
    buttonDestination: 'static-verified：管理球队选中 → 保存 team 场景 → /pages/onboarding/onboarding?step=team',
    flowTransition: 'static-verified：选择保存失败不跳转；返回后恢复选择',
    visual: 'visual-capture-pending：需 780 × 1688 截图叠图',
    build: 'node-check-passed：onboarding.js'
  }],
  ['02-完善最小资料.png', {
    buttonDestination: 'static-verified：队徽 → 裁剪/原图上传/透明抠图；创建并继续 → onboardingWorkspace.createTeam',
    flowTransition: 'static-verified：创建成功 → 创建完成；失败保留名称与原图；透明抠图失败回退原图并明示',
    visual: 'visual-capture-pending：需 780 × 1688 截图叠图',
    build: 'node-check-passed：onboarding.js、onboardingWorkspace'
  }],
  ['03-创建完成.png', {
    buttonDestination: 'static-verified：进入球队首页 → switchWorkspace(teamId) → /pages/teams/index',
    flowTransition: 'static-verified：工作空间失败不伪造完成，保留重试信息',
    visual: 'visual-capture-pending：需 780 × 1688 截图叠图',
    build: 'node-check-passed：onboarding.js、workspace.js'
  }],
  ['05-裁判移动执行/02-专业版我的比赛任务.png', {
    buttonDestination: 'verified：状态筛选 → 同页真实任务过滤；任务卡 → loadMatch(matchId)',
    flowTransition: 'verified：OAuth 缺失 → 授权；身份未绑定 → 短信匹配；失败 → 重试',
    visual: 'visual-captured-major-fixed：852 × 1846 截图 .tmp/h5-visual-qa/referee-tasks-852x1846-v2.png；已对照裁判壳、统计筛选、任务卡与进入入口',
    build: 'node-check-passed：service-account-h5/app.js'
  }],
  ['05-裁判移动执行/03-专业版比赛报到与到场确认.png', {
    buttonDestination: 'verified：确认报到/到场/检查 → updatePreMatchState；完成 → 阵容核验阶段',
    flowTransition: 'verified：未完成赛前检查 → 禁止 startRefereeMatch；无法开赛 → 保存原因与审计',
    visual: 'visual-captured-major-fixed：852 × 1846 截图 .tmp/h5-visual-qa/referee-prematch-852x1846-v1.png；已对照五步赛前流程、到场确认、检查清单与开赛阻断',
    build: 'node-check-passed：service-account-h5/app.js；serviceMatchWorkflow；webLoginApi'
  }],
  ['05-裁判移动执行/04-专业版双方阵容与身份核验.png', {
    buttonDestination: 'verified：通过/退回 → reviewLineup；双边锁定 → 可开始比赛',
    flowTransition: 'verified：赛前确认完成 → 阵容核验；未双边核验 → 后端阻止开赛',
    visual: 'visual-captured-major-fixed：852 × 1846 截图 .tmp/h5-visual-qa/referee-lineup-852x1846-v1.png；已对照步骤、只读提示、双队名单、身份核验与开赛阻断',
    build: 'node-check-passed：service-account-h5/app.js；serviceMatchWorkflow；webLoginApi'
  }],
  ['05-裁判移动执行/05-专业版实时比分与事件记录.png', {
    buttonDestination: 'static-verified：计时/事件/结束比赛 → 对应 serviceRefereeWorkflow 动作',
    flowTransition: 'static-verified：双方阵容锁定 → 允许开赛；报告锁定 → 禁止再写比分和事件',
    visual: 'visual-captured-major-fixed：852 × 1846 截图 .tmp/h5-visual-qa/referee-live-852x1846-v1.png；已对照深色比分台、计时、名单、快捷事件与事件流水',
    build: 'node-check-passed：service-account-h5/app.js；serviceMatchWorkflow'
  }],
  ['05-裁判移动执行/06-专业版裁判报告.png', {
    buttonDestination: 'static-verified：报告内容 → saveRefereeReportDraft；保存后 → 电子记录确认',
    flowTransition: 'static-verified：比赛结束 → 报告草稿；草稿已保存 → 强制进入签字确认',
    visual: 'visual-captured-major-fixed：852 × 1846 截图 .tmp/h5-visual-qa/referee-report-852x1846-v1.png；已对照已完赛头图、报告结论、六类事项与电子记录入口',
    build: 'node-check-passed：service-account-h5/app.js；serviceMatchWorkflow；webLoginApi'
  }],
  ['05-裁判移动执行/07-专业版电子记录确认与签字.png', {
    buttonDestination: 'static-verified：返回报告 → renderReport；确认签字 → submitSignedRefereeRecord',
    flowTransition: 'static-verified：报告草稿 → 真实笔迹校验 → 快照哈希、锁定并进入待复核',
    visual: 'visual-captured-major-fixed：852 × 1846 截图 .tmp/h5-visual-qa/referee-signature-852x1846-v1.png；已对照只读快照、签字画布、本人确认与提交入口',
    build: 'node-check-passed：service-account-h5/app.js；serviceMatchWorkflow；webLoginApi'
  }],
  ['05-裁判移动执行/08-专业版提交成功.png', {
    buttonDestination: 'static-verified：查看已提交记录 → 只读记录页；返回我的比赛 → loadWorkbench',
    flowTransition: 'static-verified：签字提交 → 待主办方复核；归档/退回状态 → 相应只读或修正入口',
    visual: 'visual-captured-major-fixed：852 × 1846 截图 .tmp/h5-visual-qa/referee-success-852x1846-v1.png；已对照提交编号、签字状态、主办复核流程、锁定说明与回流入口',
    build: 'node-check-passed：service-account-h5/app.js；serviceMatchWorkflow；webLoginApi'
  }],
  ['05-裁判移动执行/09-专业版退回修正与重新签字.png', {
    buttonDestination: 'static-verified：暂存限定修正 → saveReturnedRecordCorrection；重新签字 → resubmitReturnedRecord',
    flowTransition: 'static-verified：主办方限定退回 → 仅事件球员字段可改 → 新签字版本进入待复核',
    visual: 'visual-captured-major-fixed：852 × 1846 截图 .tmp/h5-visual-qa/referee-returned-852x1846-v1.png；已对照退回理由、单字段修正范围、锁定字段与重新签字入口',
    build: 'node-check-passed：service-account-h5/app.js；serviceMatchWorkflow；webLoginApi'
  }],
  ['02-专业模式/比赛管理-U16组-赛果复核.png', {
    buttonDestination: 'verified：确认归档 / 指定事件球员字段退回 → reviewRefereeRecord',
    flowTransition: 'verified：待复核 → 归档或退回；退回 → 裁判 H5 限定修正与重新签字',
    visual: 'visual-captured-major-fixed：1672 × 941 截图 .tmp/pc-visual-qa/match-review-u16-1672x941-v3.png；只读状态、赛果横幅、证据导航、阵容、事件、报告、电子记录、签字及受控操作已对照；最终微差待统一叠图复核',
    build: 'build-passed：web-admin-vue npm run build；node-check-passed：webLoginApi'
  }]
])

evidenceBySourceSuffix.set('抽签与分组-专业模式-抽签操作台-开始抽签.png', {
  buttonDestination: 'verified：确认开始抽签实点到当前赛事/U16组 professional&step=console&stage=slots；返回队伍展示 → stage=teams；无管理权限或球队池未校验时禁用主动作',
  flowTransition: 'verified：球队池 → 大屏设置 → 队伍展示 → 开始抽签均保持 mode=professional；开始后持久化当前组别 drawAssignments/drawGeneratedAt 并进入签位编排，不覆盖阵容与赛果快照',
  visual: 'visual-captured-major-fixed：1672 × 941 .tmp/pc-visual-qa/professional-draw-ready-u16-1672x941-v3.png；素材包已批准；任务确认、现场状态、大屏预览、警告和底部开始动作均在目标首屏，最终透明叠图微差待全量收口',
  buildVerification: 'PC npm run build passed：ProfessionalDrawFlow 的开始抽签持久化与 stage=slots 跳转已编译'
})
evidenceBySourceSuffix.set('抽签与分组-快速模式-分组结果.png', {
  buttonDestination: 'verified：返回分组操作台和继续调整均保留 qa-tournament-2026 / qa-division-u10 / format=tournament；导出生成当前 32 行本地分组表；确认后进入 /tournaments/qa-tournament-2026/schedule?divisionId=qa-division-u10&view=editor',
  flowTransition: 'verified：只读取当前赛事/组别/赛制已保存快照；未保存态不显示正式结果或确认按钮，归档快照只读。确认作用域仅含当前 U10 的 8 条 tournament_groups 草稿，targetStatus=confirmed、published=false、schedulePublished=false、deletedRecords=false、changedOtherDivisions=false、changedOtherFormats=false',
  visual: 'visual-1:1-passed：1672 × 941 最终截图 .tmp/pc-visual-qa/draw-quick-result-unconfirmed-final-v4.png；32队、8组、待确认、筛选/视图/导出工具条及固定确认栏完整入屏，无横向溢出。空结果和归档只读证据分别为 draw-quick-result-empty-state.png、draw-quick-result-archived-state.png',
  buildVerification: 'npm run build-passed：2026-08-13，QuickDrawResult.vue；当前赛制查询、结果状态、确认边界和赛程编辑去向均已编译'
})
evidenceBySourceSuffix.set('抽签与分组-专业模式-抽签设置.png', {
  buttonDestination: 'verified：页内“前往球队池配置”和底部“保存并进入下一步”统一走受控保存；本地实点到 qa-tournament-2026 / qa-division-u16 / mode=professional / step=pool，未绕过当前设置保存',
  flowTransition: 'verified：32 支当前 U16 已审核球队、8组×4队、8支种子及规避/晋级/展示参数进入当前组别专业草稿；作用域回读 targetStatus=draft、published=false、schedulePublished=false、historicalSnapshotsChanged=false、otherDivisionsChanged=false、cloudWrite=false。零球队、容量不足、种子数超限或无权限时禁用下一步；已有 confirmed/published 结果时必须确认影响范围',
  visual: 'visual-1:1-passed：1672 × 941 最终截图 .tmp/pc-visual-qa/professional-draw-setup-final-v3.png；赛事上下文、五步锁定进度线、三种抽签方式、三列参数卡、展示选项、风险提示、汇总与主按钮全部完整入屏，无横向溢出',
  buildVerification: 'npm run build-passed：2026-08-13，ProfessionalDrawFlow.vue；setup 校验、受控保存、确认/发布影响提示与 pool 去向均已编译'
})
evidenceBySourceSuffix.set('抽签与分组-专业模式-球队池.png', {
  buttonDestination: 'verified：真实点击“保存并进入下一步”保留 qa-tournament-2026 / qa-division-u16 / mode=professional，并进入 step=screen 大屏设置；四页分页、筛选、种子切换与查看关系均停留当前球队池作用域',
  flowTransition: 'verified：仅当前赛事/U16 已审核的 32 支 tournament_teams 进入球队池；回读 8 支种子及按 teamId 保存的全部规避关系，poolValidated=true。longTermTeamProfilesChanged=false、otherDivisionsChanged=false、published=false、cloudWrite=false；种子不足/超限、无球队、关系未识别、规则冲突或无权限均不能解锁下一步',
  visual: 'visual-1:1-passed：1672 × 941 最终截图 .tmp/pc-visual-qa/professional-draw-pool-final-v5.png；五步进度、32/8/24/6/2/0 汇总、筛选批量工具、8行×4页球队表、待抽签/种子/关系操作、种子/普通池侧栏、五项校验及底部主按钮完整入屏，无横向溢出',
  buildVerification: 'npm run build-passed：2026-08-13，ProfessionalDrawFlow.vue；当前组别准入、分页、种子上限、规避关系持久化、校验门槛与 screen 去向均已编译'
})
evidenceBySourceSuffix.set('抽签与分组-专业模式-大屏设置.png', {
  buttonDestination: 'verified：后台 DevTools/CDP 实点“保存并进入下一步”保留 qa-tournament-2026 / qa-division-u16 / mode=professional，并进入 step=console&stage=intro；“打开抽签大屏”生成当前赛事/组别专属安全预览地址，不复用全屏预览动作',
  flowTransition: 'verified：仅 poolValidated、当前赛事/U16 管理权限和在线设备同时满足时允许进入操作台；本地 QA 回读完整 screen 配置，longTermTeamProfilesChanged=false、otherDivisionsChanged=false、published=false、cloudWrite=false；离线状态显示 0 台并禁用下一步',
  visual: 'visual-1:1-passed：1672 × 941 最终截图 .tmp/pc-visual-qa/professional-draw-screen-final-v4.png；五步进度、双大屏动作、赛事抽签预览、B组结果、小组进度、18/32 状态、展示/主题/动画/声音设置、动态设备信息及底部主按钮完整入屏，无横向溢出或底部裁切',
  buildVerification: 'npm run build-passed：2026-08-13，ProfessionalDrawFlow.vue；动态大屏地址、可持久化展示配置、弹窗失败反馈、设备离线门槛和 console/introduction 去向均已编译'
})
evidenceBySourceSuffix.set('抽签与分组-专业模式-抽签操作台-抽签介绍.png', {
  buttonDestination: 'verified：后台 DevTools/CDP 实点“确认并进入下一步”保留 qa-tournament-2026 / qa-division-u16 / mode=professional，并进入 step=console&stage=teams；查看全部球队进入同一当前组别队伍展示；投屏辅助动作绑定当前介绍页同步处理器并提供离线反馈',
  flowTransition: 'verified：只读取当前赛事/U16 的抽签配置、已审核球队与种子状态；QA 回读 drawAssignmentsCreated=false、scheduleChanged=false、resultsChanged=false、rosterSnapshotsChanged=false、published=false、cloudWrite=false，介绍页不生成抽签结果或修改赛程/赛果/阵容名单',
  visual: 'visual-1:1-passed：1672 × 941 最终截图 .tmp/pc-visual-qa/professional-draw-intro-final-v2.png；赛事与五步上下文、五段操作台子流程、32/8/4/8 摘要、规则、现场流程、16 队概览、大屏状态、开始前检查及底部主动作完整入屏，无横向溢出或底部裁切',
  buildVerification: 'npm run build-passed：2026-08-14，ProfessionalDrawFlow.vue；抽签介绍受控投屏状态、离线反馈、当前组别 teams 去向与只读业务边界均已编译'
})
evidenceBySourceSuffix.set('抽签与分组-专业模式-抽签操作台-队伍展示.png', {
  buttonDestination: 'verified：后台 DevTools/CDP 实点“确认并进入下一步”保留 qa-tournament-2026 / qa-division-u16 / mode=professional，并进入 step=console&stage=ready；展示方式、种子突出开关只作用当前展示，投向大屏使用当前球队墙同步处理器',
  flowTransition: 'verified：只展示当前赛事/U16 已审核的 32 支 tournament_teams 和 8 支种子队；无管理权限或球队池校验失败时禁止继续。QA 回读 longTermTeamProfilesChanged=false、tournamentRosterSnapshotsChanged=false、matchLineupSnapshotsChanged=false、drawAssignmentsCreated=false、published=false、cloudWrite=false',
  visual: 'visual-1:1-passed：1671 × 941 最终截图 .tmp/pc-visual-qa/professional-draw-teams-final-v2.png；五步与五子步骤、32/8 摘要、三种展示方式、种子突出、8列×4行球队墙、真实/占位队徽、地区、种子标记、大屏状态及底部主动作完整入屏，无横向溢出或裁切',
  buildVerification: 'npm run build-passed：2026-08-14，ProfessionalDrawFlow.vue；当前组别球队墙、受控投屏、球队池/权限门槛和 ready 去向均已编译'
})
evidenceBySourceSuffix.set('抽签与分组-专业模式-抽签操作台-开始抽签.png', {
  buttonDestination: 'verified：后台 DevTools/CDP 实点“确认开始抽签”在本地隔离确认后，为 qa-tournament-2026 / qa-division-u16 生成 32 个唯一球队签位、8 组×4 支，并进入 step=console&stage=slots；返回队伍展示保留当前赛事、组别和专业模式',
  flowTransition: 'verified：生产环境开始前二次确认锁定影响，只有管理权限、球队池校验和在线大屏同时满足才可执行；只更新当前组别 professionalDrawConfigs.drawAssignments/drawGeneratedAt/drawStatus。保存失败回滚本地签位并留页。QA 回读 scheduleChanged=false、historicalResultsChanged=false、tournamentRosterSnapshotsChanged=false、matchLineupSnapshotsChanged=false、otherDivisionsChanged=false、published=false、cloudWrite=false',
  visual: 'visual-1:1-passed：1672 × 941 最终截图 .tmp/pc-visual-qa/professional-draw-ready-final-v4.png；五步与五子步骤、任务确认、32/8/4/8 摘要、四项校验、现场人员、大屏预览、锁定警告和底部开始动作完整入屏，无横向溢出或裁切',
  buildVerification: 'npm run build-passed：2026-08-14，ProfessionalDrawFlow.vue；不可逆确认、设备/权限/球队池门槛、当前组别签位生成、保存失败回滚与 slots 去向均已编译'
})
evidenceBySourceSuffix.set('抽签与分组-专业模式-抽签操作台-小组赛.png', {
  buttonDestination: 'verified：32/32 完整状态实点“确认签位编排”进入当前赛事/U16组 professional&step=result&format=group；20/32、重复球队、重复签位、越界签位、无权限状态均禁用确认；返回 → stage=ready',
  flowTransition: 'verified：待分配球队支持点击顺序放置和拖拽到空签位；确认只提交当前 tournamentId/divisionId 的 drawAssignments，失败保留当前签位；本地 QA 读回 assignmentCount=32、complete/uniqueTeams/uniquePositions/knownTeams/validPositions=true、cloudWrite=false，且不生成赛程、不改名单、阵容或历史赛果',
  visual: 'visual-accepted：批准素材包已复核；1672 × 941 `.tmp/pc-visual-qa/professional-draw-slots-group-final-v2.png` 完整呈现 20/32、12 支待分配球队、八组四签位、种子标识、状态栏和底部操作区，无裁切或横向溢出；结果去向证据 `.tmp/pc-visual-qa/professional-draw-slots-group-destination-v4.png`',
  buildVerification: 'PC npm run build passed：2026-08-14，ProfessionalDrawFlow.vue；UI delivery 162/162、git diff --check 通过'
})
evidenceBySourceSuffix.set('裁判管理-裁判库与赛事指派.png', {
  buttonDestination: 'verified：当前赛事裁判库的“指派场次”可进入四人裁判组工作弹窗；确认后返回同一 tournamentId 的裁判列表，查看资料、资格审核、导出和添加裁判均保留正式受控动作',
  flowTransition: 'verified：本地目标视口环境已实测选择 qa-match-upcoming、确认指派，写入 mainReferee=qa-ref-3/assistant1=qa-ref-4 后关闭弹窗并移除 assignment 查询参数；生产仍经 updateMatch 服务端链路，已锁定电子记录的场次不可覆盖',
  visual: 'visual-accepted：已核对批准素材包；1672 × 941 首屏 .tmp/pc-visual-qa/referee-management-1672x941-final-v10.png，指派态 .tmp/pc-visual-qa/referee-assignment-dialog-1672x941-v5.png；赛事壳、资格提示、四项统计、筛选、裁判库、状态与四人指派工作区均在目标视口复核',
  buildVerification: 'PC npm run build passed：2026-08-13，HeadRefereeManagement.vue、visualQaFixtures.js、capture-pc-visual-qa.ps1'
})

evidenceBySourceSuffix.set('球队管理-快速添加球队-专业版.png', {
  buttonDestination: 'verified：专业版“快速添加球队”要求球队名称、负责人和联系电话；保存后创建当前 tournamentId / divisionId 的 teams 与 tournament_teams 关系，状态为待认领，不会因同名自动合并。保存并返回列表移除 quick-add 状态；保存并继续添加保留当前赛事、组别和弹窗。',
  flowTransition: 'verified：2026-08-13 本地目标视口实测“保存并返回列表”后进入 /tournaments/qa-tournament-2026/teams?divisionId=qa-division-u16&mode=professional&visualQa=1；“保存并继续添加”保留同一路由的 action=quick-add，并清空新建表单，未跨组别或写入云端。',
  visual: 'visual-accepted：已核对批准素材包；1672 × 941 截图 `.tmp/pc-visual-qa/tournament-teams-professional-quick-add-u16-final-v3.png`，复核了原型中的双栏队徽上传区、赛事编号、所属组别、负责人信息、认领说明及三按钮底栏。继续添加状态证据为 `.tmp/pc-visual-qa/quick-add-action-debug-v1.png`。',
  buildVerification: 'PC npm run build passed：2026-08-13，TournamentTeams.vue。'
})

evidenceBySourceSuffix.set('球队管理-参赛球队-专业版.png', {
  buttonDestination: 'verified：当前专业组别的查看球队、查看名单、发送认领提醒、邀请与快速添加均携带 tournamentId 与 divisionId；本地目标视口实点“查看名单”进入 `/tournaments/qa-tournament-2026/teams/qa-team-zhengzhou/roster?divisionId=qa-division-u16&mode=professional`。',
  flowTransition: 'verified：筛选仅作用于当前 tournament_teams 范围；未认领球队只能发认领提醒，不会进入正式名单或比赛执行。球队长期资料、赛事参赛关系与名单快照保持分层，未按名称自动合并。',
  visual: 'visual-accepted：已核对批准素材包；1672 × 941 截图 `.tmp/pc-visual-qa/tournament-teams-professional-overview-final-v2.png`，复核了专业版标签、四项数据卡、认领与名单提示、四组筛选器、邀请/快速添加入口、八列球队清单和操作状态。',
  buildVerification: 'PC npm run build passed：2026-08-13，TournamentTeams.vue。'
})

evidenceBySourceSuffix.set('球队管理-查看参赛名单-专业版.png', {
  buttonDestination: 'verified：返回参赛球队、加入申请、名单异常和名单变更均携带当前 tournamentId、divisionId 与专业版模式；真实点击“返回参赛球队”进入 `/tournaments/qa-tournament-2026/teams?divisionId=qa-division-u16&mode=professional`，“名单异常”进入 `/tournaments/qa-tournament-2026/roster-exceptions?divisionId=qa-division-u16&mode=professional`，“名单变更”进入 `/tournaments/qa-tournament-2026/roster-changes?divisionId=qa-division-u16&mode=professional`。',
  flowTransition: 'verified：正式页面通过 `rosterExceptionBoard/listRoster` 读取当前赛事、组别、球队的名单快照，不把日常球员库当作正式名单。资料纠错只针对 snapshotId/playerId 提交申请，不直接覆盖球队长期球员资料；锁定名单保持赛事快照边界。',
  visual: 'visual-1:1-passed：已核对批准素材包；1672 × 941 最终截图 `.tmp/pc-visual-qa/professional-roster-view-final-v5.png`，23 条锁定名单加载完成、首屏可见 10 条，赛事/组别、五入口、锁定提示、当前球队、名单要求、筛选器和九列表格均完整入屏；1440 × 900 回退截图 `.tmp/pc-visual-qa/professional-roster-view-fallback-1440x900-v2.png`。异常与变更去向证据为 `.tmp/pc-visual-qa/professional-roster-view-exceptions-destination-v3.png`、`.tmp/pc-visual-qa/professional-roster-view-changes-destination-v3.png`。',
  buildVerification: 'npm run build-passed：2026-08-14，ProfessionalTournamentRoster.vue；validate-ui-delivery 162/162、zero-SDK import 与 scoped git diff 检查通过。'
})

evidenceBySourceSuffix.set('球队管理-球员管理-专业版.png', {
  buttonDestination: 'verified：专业版球员页复用当前赛事正式名单视图；本地目标视口调用“查看”后进入 `/players/qa-player-1?fromTournament=qa-tournament-2026&divisionId=qa-division-u16&teamId=qa-team-zhengzhou&mode=professional`，完整保留赛事、组别和球队范围。',
  flowTransition: 'verified：搜索和状态筛选仅处理当前正式名单快照；锁定后不提供普通名单编辑。资料纠错通过受控 snapshotId/playerId 流程，不会从看板直接改写长期球员资料或跨组别合并。',
  visual: 'visual-accepted：已核对批准素材包；1672 × 941 当前页面截图 `.tmp/pc-visual-qa/professional-team-players-final-v1.png`，复核了赛事与组别上下文、锁定提示、当前球队、名单要求、筛选栏、九列球员状态表和纠错入口。',
  buildVerification: 'PC npm run build passed：2026-08-13，ProfessionalTournamentRoster.vue。'
})
evidenceBySourceSuffix.set('球队管理-生成球队邀请-专业版.png', {
  buttonDestination: 'verified：当前专业组别的“生成球队邀请”进入邀请凭证；复制链接与下载小程序码均承载当前 tournamentId/divisionId，完成或取消返回同一专业组别的参赛球队页。',
  flowTransition: 'verified：2026-08-13 本地目标视口实点“完成”后移除 action=invite，保留 tournamentId=qa-tournament-2026、divisionId=qa-division-u16 与 mode=professional；邀请关系仍由既有受控发送流程创建，球队名称不会自动认领或合并。',
  visual: 'visual-accepted：已核对批准素材包；1672 × 941 截图 `.tmp/pc-visual-qa/tournament-teams-professional-invite-u16-final-v19.png`，含可扫码二维码、当前组别、加入方式、有效期、链接与操作区；已按原图复核弹窗结构。',
  buildVerification: 'PC npm run build passed：2026-08-13，TournamentTeams.vue。'
})
evidenceBySourceSuffix.set('球队管理-参赛球队-专业版.png', {
    buttonDestination: 'verified：目标视口“查看球队”正式入口已迁移为 `/tournaments/qa-tournament-2026/teams/qa-team-zhengzhou?divisionId=qa-division-u16`；“查看名单”进入 `/tournaments/qa-tournament-2026/teams/qa-team-zhengzhou/roster?divisionId=qa-division-u16&mode=professional`；旧 `/teams/:id` 路由已删除，邀请与快速添加继续保持当前赛事/组别上下文',
  flowTransition: 'verified：页面只使用当前 tournamentId/divisionId 的 tournament_teams 关系；未认领状态保留认领提醒，名单状态来自赛事名单快照；不按名称跨组关联，长期球队资料不覆盖参赛名单、阵容或赛果',
  visual: 'visual-accepted：批准素材包已复核；1672 × 941 `.tmp/pc-visual-qa/tournament-teams-professional-overview-final-v4.png` 完整呈现标题/组别选择、五页签、32/25/24/4 汇总、专业规则提示、四项筛选、邀请/快速添加及前十行八列表格，无横向溢出；按钮去向证据为 `tournament-teams-professional-view-team-destination-v1.png`、`tournament-teams-professional-roster-destination-v1.png`',
  buildVerification: 'PC npm run build passed：2026-08-14，TournamentTeams.vue；UI delivery 162/162、git diff --check 通过'
})
evidenceBySourceSuffix.set('球队管理-查看参赛名单-专业版.png', {
  buttonDestination: 'verified：返回参赛球队实点到 /tournaments/:id/teams?divisionId=:divisionId；名单异常和名单变更均保留当前赛事、组别上下文',
  flowTransition: 'verified：主办方只读取当前赛事参赛关系对应的正式名单快照；资料纠错仅向当前赛事快照提交申请，不覆盖球队长期球员资料',
  visual: 'visual-captured-major-fixed：1672 × 941 .tmp/pc-visual-qa/professional-roster-u16-1672x941-v13.png；素材包已批准；赛事壳、专业组别、12 人正式名单、状态筛选和名单操作已在目标首屏核对，最终透明叠图微差待全量收口',
  buildVerification: 'PC npm run build passed：ProfessionalTournamentRoster 与隔离 visualQa roster fixture 已编译'
})
evidenceBySourceSuffix.set('02-主办方实名与名单异常看板.png', {
  buttonDestination: 'verified：返回参赛球队实点到 /tournaments/:id/teams?divisionId=:divisionId&mode=professional；“查看处理”在当前页选中异常记录，“查看球队名单”保留赛事、组别和球队范围；退回须先填写原因，再进入明确的二次确认。',
  flowTransition: 'verified：主办方只读取当前赛事/组别名单快照的资料异常；退回只调用 rosterExceptionBoard.returnRoster 更新明确 snapshotId，球队补齐后再提交，不覆盖长期球队或球员资料。',
  visual: 'visual-accepted：已核对批准素材包；1672 × 941 当前截图 `.tmp/pc-visual-qa/roster-exceptions-final-v2.png`，复核了四项统计、筛选、异常列表、右侧详情及处理区。',
  buildVerification: 'PC npm run build passed：2026-08-13；RosterExceptionBoard.vue。'
})
evidenceBySourceSuffix.set('球队管理-名单变更-专业版.png', {
  buttonDestination: 'verified：待审核记录的通过/驳回主操作在本地验收通道可定位并点击；参赛球队、名单与异常页签均保持当前赛事和组别上下文',
  flowTransition: 'verified：名单变更只修改当前赛事名单快照并完整保留前后版本；锁定后普通变更禁止，资料纠错转入异常看板，不覆盖日常球员库',
  visual: 'visual-captured-major-fixed：1672 × 941 .tmp/pc-visual-qa/roster-changes-professional-u16-1672x941-v1.png；素材包已批准；赛事上下文、五页签、锁定状态、四项统计、筛选、变更记录及受控操作已在目标首屏核对，最终透明叠图微差待全量收口',
  buildVerification: 'PC npm run build passed：RosterChangeReview 与隔离 visualQa 变更快照已编译'
})
evidenceBySourceSuffix.set('球队管理-加入申请-专业版.png', {
  buttonDestination: 'verified：当前组别专业申请的通过主操作在本地验收通道可定位并点击；拒绝及查看操作保持当前赛事和组别上下文',
  flowTransition: 'verified：审批只更新 tournament_teams 当前报名关系；不会自动认领、提交正式名单或合并同名球队，风险关系仍需人工核验',
  visual: 'visual-captured-major-fixed：1672 × 941 .tmp/pc-visual-qa/tournament-teams-professional-pending-u16-v2.png；素材包已批准；赛事上下文、专业版容量、五页签、统计、申请表和两条认领状态记录已在目标首屏核对，最终透明叠图微差待全量收口',
  buildVerification: 'PC npm run build passed：TournamentTeams 专业申请 fixture 与正式审批分支已编译'
})
evidenceBySourceSuffix.set('球队管理-查看球队-专业版.png', {
  buttonDestination: 'verified：查看参赛名单实点到 /tournaments/:id/teams/:teamId/roster，并保留 divisionId 与 mode=professional；返回保持当前赛事球队列表',
  flowTransition: 'verified：专业详情只读取当前赛事参赛关系、名单快照和协作状态；不暴露俱乐部日常训练或财务，长期球队资料不能改写赛事快照',
  visual: 'visual-captured-major-fixed：1672 × 941 .tmp/pc-visual-qa/tournament-team-detail-professional-u16-v1.png；素材包已批准；赛事头、U16 参赛编号、认领/确认、三张范围卡、专业协作和名单入口已在目标首屏核对，最终透明叠图微差待全量收口',
  buildVerification: 'PC npm run build passed：TeamDetail 专业赛事详情分支已编译'
})
evidenceBySourceSuffix.set('球队管理-球员管理-专业版.png', {
  buttonDestination: 'verified：独立 `/tournaments/:id/teams/:teamId/players` 入口保留赛事、组别和球队范围；真实点击“查看”进入 `/players/qa-player-1?fromTournament=qa-tournament-2026&divisionId=qa-division-u16&teamId=qa-team-zhengzhou&mode=professional`。',
  flowTransition: 'verified：入口仅显示当前主办方授权的赛事/球队/组别 roster snapshot，锁定后不开放普通编辑；“申请资料纠错”已真实打开刘洋的受控申请弹层，提交继续使用 snapshotId/playerId，不直接覆盖长期球员资料。',
  visual: 'visual-1:1-passed：已复核 approved 素材包；1672 × 941 最终截图 `.tmp/pc-visual-qa/professional-team-players-final-v2.png`，23 条快照加载完成、首屏可见 10 条；1440 × 900 回退截图 `.tmp/pc-visual-qa/professional-team-players-fallback-1440x900-v1.png`。查看去向证据 `.tmp/pc-visual-qa/professional-team-players-view-destination-v1.png`，纠错弹层证据 `.tmp/pc-visual-qa/professional-team-players-correction-dialog-final-v11.png`。当前 U16/23 人替代旧原型 U12/684 汇总是已确认产品规则差异。',
  buildVerification: 'npm run build-passed：2026-08-14，ProfessionalTournamentRoster.vue 与独立 players 路由；validate-ui-delivery 162/162、zero-SDK import 与 scoped diff 检查通过。'
})
evidenceBySourceSuffix.set('球队管理-生成球队邀请-专业版.png', {
  buttonDestination: 'verified：邀请凭证的复制链接、下载小程序码均承载 qa-tournament-2026/qa-division-u16；目标视口真实点击“完成”返回当前专业组别参赛球队，证据 `.tmp/pc-visual-qa/tournament-teams-professional-invite-complete-destination-v2.png`',
  flowTransition: 'verified：完成后仅移除 action=invite，保留 tournamentId=qa-tournament-2026、divisionId=qa-division-u16、mode=professional；回读 cloudWrite=false、autoClaimed=false、mergedByName=false，认领仍由小程序负责人完成',
  visual: 'visual-1:1-passed：批准素材包已复核；1672 × 941 最终截图 `.tmp/pc-visual-qa/tournament-teams-professional-invite-final-v28.png`，真实二维码、当前组别、加入方式、有效期、链接及双操作完整入屏；1440 × 900 回退截图 `.tmp/pc-visual-qa/tournament-teams-professional-invite-fallback-1440x900-v1.png` 无裁切',
  buildVerification: 'PC npm run build passed：2026-08-14，TournamentTeams.vue；二维码使用 qrcode 矢量模块渲染并保留 PNG 下载数据；UI delivery 与零 SDK 门禁待本轮回归'
})
evidenceBySourceSuffix.set('球队管理-快速添加球队-专业版.png', {
  buttonDestination: 'verified：真实点击“取消”返回当前 qa-tournament-2026/qa-division-u16 专业球队列表且 teams/relations 均保持 34；真实点击“保存并返回列表”返回同一路由，证据 `.tmp/pc-visual-qa/tournament-teams-professional-quick-add-cancel-destination-v1.png` 与 `tournament-teams-professional-quick-add-save-return-v1.png`',
  flowTransition: 'verified：隔离验收创建郑州青训U16队及当前 U16 参赛关系，均为 pending_claim/invited；回读 rosterEligible=false、autoMergedByName=false、cloudWrite=false，负责人和手机号保留用于小程序定向认领',
  visual: 'visual-1:1-passed：批准素材包已复核；1672 × 941 最终截图 `.tmp/pc-visual-qa/tournament-teams-professional-quick-add-final-v8.png`，队徽上传、名称/编号/组别、负责人/电话、认领说明与三操作完整入屏；1440 × 900 回退截图 `.tmp/pc-visual-qa/tournament-teams-professional-quick-add-fallback-1440x900-v1.png` 无裁切或横向溢出',
  buildVerification: 'PC npm run build passed：2026-08-14，TournamentTeams.vue；UI delivery 162/162、零 SDK 与 git diff --check 通过'
})
evidenceBySourceSuffix.set('球队管理-发送认领提醒-专业版.png', {
  buttonDestination: 'verified：复制链接入口在本地目标视口可定位；链接携带当前 tournamentId、divisionId 与 tournament-team 上下文，返回不改写认领状态',
  flowTransition: 'verified：PC 只准备定向认领交接，不直接向指定微信发卡或确认认领；身份冲突进入人工核验，不自动合并账号或球队',
  visual: 'visual-captured-major-fixed：1672 × 941 .tmp/pc-visual-qa/tournament-teams-professional-claim-invite-u16-v3.png；素材包已批准；待认领球队、组别、链接、两种分享方式、冲突说明和返回入口已在目标首屏核对',
  buildVerification: 'PC npm run build passed：TournamentTeams 定向认领交接视图与复制路径已编译'
})
evidenceBySourceSuffix.set('01-微信登录.png', {
  buttonDestination: 'verified：微信主登录先校验协议，再经 getOpenId/checkUserByOpenId 建立真实会话并按工作空间分流；手机号备用入口已到 /pages/login/phone-login/phone-login；协议和隐私政策均为独立页面',
  flowTransition: 'verified：小程序只以 openId 建立会话，手机号不替代微信登录；手机号授权仅在认领与身份核验等显式业务步骤使用，登录页不伪造手机号身份或固定角色分流',
  visual: 'visual-capture-pending：素材包已批准；需 780 × 1688 真机/开发者工具截图叠图',
  buildVerification: 'node --check passed：miniprogram/pages/login/login.js、phone-login/phone-login.js；app.json 路由与 WXML 简单表达式校验通过'
})
evidenceBySourceSuffix.set('01A-选择业务场景-管理球队.png', {
  buttonDestination: 'static-verified：管理球队选中 → saveScene(team) → 完善最小球队资料；返回/失败保留已选 team 场景',
  flowTransition: 'static-verified：场景只保存 onboarding 草稿，不授予角色；创建球队仍走 onboardingWorkspace 经鉴权动作',
  visual: 'visual-capture-pending：素材包已批准；需 780 × 1688 真机/开发者工具截图叠图',
  buildVerification: 'node --check passed：miniprogram/pages/onboarding/onboarding.js；WXML 仅使用简单插值、取反与预计算 class'
})
evidenceBySourceSuffix.set('02-完善最小资料.png', {
  buttonDestination: 'static-verified：名称/队徽 → createTeam → 当前球队成功态；失败保留草稿，后续入口 → 球队工作空间',
  flowTransition: 'static-verified：创建动作由 onboardingWorkspace 鉴权；队徽处理和球队资料不自动覆盖赛事名单快照',
  visual: 'visual-capture-pending：素材包已批准；需 780 × 1688 真机/开发者工具截图叠图',
  buildVerification: 'node --check passed：miniprogram/pages/onboarding/onboarding.js；WXML 仅使用预计算状态'
})
evidenceBySourceSuffix.set('03-创建完成.png', {
  buttonDestination: 'static-verified：进入球队首页 → 切换到新建球队工作空间 → /pages/teams/index；失败显示恢复提示',
  flowTransition: 'static-verified：成功态引用服务端返回的团队标识和可选赛事参赛关系，不以名称推断或合并球队',
  visual: 'visual-capture-pending：素材包已批准；需 780 × 1688 真机/开发者工具截图叠图',
  buildVerification: 'node --check passed：onboarding.js；workspace.switchWorkspace 失败路径已保留'
})
evidenceBySourceSuffix.set('01B-选择业务场景-举办赛事.png', {
  buttonDestination: 'static-verified：举办赛事选中 → saveScene(event) → 完善赛事资料；失败保留 event 选择',
  flowTransition: 'static-verified：选择场景不授予主办方身份；创建赛事仍由服务端校验当前用户和工作空间',
  visual: 'visual-capture-pending：素材包已批准；需 780 × 1688 真机/开发者工具截图叠图',
  buildVerification: 'node --check passed：onboarding.js；WXML 预计算选中 class'
})
evidenceBySourceSuffix.set('04-举办赛事-完善资料.png', {
  buttonDestination: 'static-verified：赛事名称/城市/标识 → createEventSpace → 当前赛事成功态 → /pages/tournament/detail/detail?tournamentId=:id',
  flowTransition: 'static-verified：赛事空间由 onboardingWorkspace 建立，失败不清空草稿；复杂赛制和规则随后进入赛事空间受控配置',
  visual: 'visual-capture-pending：素材包已批准；需 780 × 1688 真机/开发者工具截图叠图',
  buildVerification: 'node --check passed：onboarding.js；场景、资料和成功态均为显式预计算状态'
})

// Current, target-viewport evidence for the team-onboarding profile step.
// Kept in ASCII escapes because this inventory also serves older Windows shells.
evidenceBySourceSuffix.set('02-\u5b8c\u5584\u6700\u5c0f\u8d44\u6599.png', {
  buttonDestination: 'verified: name / crest -> createTeam -> current-team success state; errors preserve the draft.',
  flowTransition: 'verified: onboardingWorkspace authorizes creation; team profile does not overwrite tournament roster snapshots.',
  visual: 'visual-accepted: 780x1688 target viewport reviewed; .tmp/mini-visual-qa/onboarding-team-profile-iphone13pro-100-v10.png; shared green crest-upload treatment.',
  buildVerification: 'passed: node --check miniprogram/pages/onboarding/onboarding.js; tools/validate-ui-delivery.js; simple WXML expressions.'
})

evidenceBySourceSuffix.set('03-\u521b\u5efa\u5b8c\u6210.png', {
  buttonDestination: 'verified: enterTeamHome switches to the newly created team workspace, then opens /pages/teams/index.',
  flowTransition: 'verified: success state requires the service-created team id; workspace failures remain recoverable and do not fake success.',
  visual: 'visual-accepted: 780x1688 target viewport reviewed; .tmp/mini-visual-qa/onboarding-team-success-iphone13pro-100-v4.png; success hierarchy and follow-up actions use the unified green line-icon system.',
  buildVerification: 'passed: node --check miniprogram/pages/onboarding/onboarding.js; tools/validate-ui-delivery.js; simple WXML expressions.'
})

evidenceBySourceSuffix.set('\u7403\u961f\u7ba1\u7406-\u52a0\u5165\u7533\u8bf7-\u7b80\u6613\u7248.png', {
  buttonDestination: 'verified: pending application approve/reject controls target the current tournament_teams relationship; target-viewport click located the approve control.',
  flowTransition: 'verified: filtering and approval remain scoped to the current tournamentId and divisionId; approval changes only the participation relationship and does not merge long-term teams.',
  visual: 'visual-accepted: 1672x941 screenshot .tmp/pc-visual-qa/tournament-teams-simple-pending-u8-v4.png; compared with approved simple-application crop for tabs, statistics, filter row, application fields, risk tags, and pending rows.',
  buildVerification: 'passed: web-admin-vue npm run build 2026-08-11; visual QA fixture active and target route resolved.'
})

evidenceBySourceSuffix.set('\u7403\u961f\u7ba1\u7406-\u52a0\u5165\u7533\u8bf7-\u4e13\u4e1a\u7248.png', {
  buttonDestination: 'verified: professional pending-application approve/reject controls target only the current tournament_teams relationship; the target route resolves with the U16 professional context.',
  flowTransition: 'verified: application review remains scoped to current tournamentId and divisionId; approval does not auto-claim a team, submit a roster, or merge a same-name team.',
  visual: 'visual-accepted: 1672x941 screenshot .tmp/pc-visual-qa/tournament-teams-professional-pending-u16-v4.png; compared with the approved professional application crop for review tabs, metrics, filters, applicant fields, claim status, risk checks, and actions.',
  build: 'passed: web-admin-vue npm run build 2026-08-11; visual QA fixture active and target route resolved.'
})

evidenceBySourceSuffix.set('01-\u5fae\u4fe1\u767b\u5f55.png', {
  buttonDestination: 'verified: agreement-required WeChat login calls getOpenId/checkUserByOpenId for a real session; phone login and the two agreement links retain their formal destinations.',
  flowTransition: 'verified: successful login follows the returned workspace context; no fixed phone number or role is used for routing, and login failure remains recoverable.',
  visual: 'visual-accepted: 780x1688 target artboard at iPhone 13 Pro 390x844 screenshot .tmp/mini-visual-qa/login-iphone13pro-100-v6.png; compared with approved stadium background, brand zone, bottom login panel, and agreement row.',
  build: 'passed: login.js node --check; target viewport capture channel reports 390x844 / approved 2x artboard match.'
})

evidenceBySourceSuffix.set('01A-\u9009\u62e9\u4e1a\u52a1\u573a\u666f-\u7ba1\u7406\u7403\u961f.png', {
  buttonDestination: 'verified: selecting team saves the onboarding team scene through onboardingWorkspace, then continues to the team-profile step; the other two selections preserve their own event/training branches.',
  flowTransition: 'verified: a scene selection only records onboarding intent and grants no role; team creation remains server-authorized in the following step.',
  visual: 'visual-accepted: 780x1688 target artboard at iPhone 13 Pro 390x844 screenshot .tmp/mini-visual-qa/onboarding-scene-team-iphone13pro-100-v2.png; compared with approved stepper, three scene cards, selected team state, CTA, and stadium background.',
  build: 'passed: onboarding.js node --check; target viewport capture reports approved 2x artboard match.'
})

evidenceBySourceSuffix.set('01B-\u9009\u62e9\u4e1a\u52a1\u573a\u666f-\u4e3e\u529e\u8d5b\u4e8b.png', {
  buttonDestination: 'verified: selecting event saves the onboarding event scene through onboardingWorkspace, then continues to the event-profile step without changing the team or training branch.',
  flowTransition: 'verified: selection stores onboarding intent only; event-space creation remains server-authorized in the following step.',
  visual: 'visual-accepted: 780x1688 target artboard at iPhone 13 Pro 390x844 screenshot .tmp/mini-visual-qa/onboarding-scene-event-iphone13pro-100-v1.png; compared with approved selected event state, stepper, cards, CTA, and stadium background.',
  build: 'passed: onboarding.js node --check; target viewport capture reports approved 2x artboard match.'
})

evidenceBySourceSuffix.set('04-\u4e3e\u529e\u8d5b\u4e8b-\u5b8c\u5584\u8d44\u6599.png', {
  buttonDestination: 'verified: name, city, and optional event mark submit through createEventSpace; success continues to the current event-space detail route.',
  flowTransition: 'verified: event creation is authorized by onboardingWorkspace and retains drafts/errors; competition configuration stays in the subsequent event workspace.',
  visual: 'visual-accepted: 780x1688 target artboard at iPhone 13 Pro 390x844 screenshot .tmp/mini-visual-qa/onboarding-event-profile-iphone13pro-100-v1.png; compared with approved event profile stepper, form panel, mark row, two fields, note, and CTA.',
  build: 'passed: onboarding.js node --check; target viewport capture reports approved 2x artboard match.'
})

evidenceBySourceSuffix.set('05-\u4e3e\u529e\u8d5b\u4e8b-\u521b\u5efa\u6210\u529f.png', {
  buttonDestination: 'verified: enterEventSpace opens the created event detail using the service-returned tournament id; missing identifiers remain recoverable errors.',
  flowTransition: 'verified: success state follows createEventSpace and references the new event only; later competition configuration is performed in that event workspace.',
  visual: 'visual-accepted: 780x1688 target artboard at iPhone 13 Pro 390x844 screenshot .tmp/mini-visual-qa/onboarding-event-success-iphone13pro-100-v5.png; compared with approved completion stepper, success card, event summary, action hints, and CTA.',
  build: 'passed: onboarding.js node --check; target viewport capture reports approved 2x artboard match.'
})

evidenceBySourceSuffix.set('05-\u4e3e\u529e\u8d5b\u4e8b-\u521b\u5efa\u5b8c\u6210.png', {
  buttonDestination: 'verified: enterEventSpace opens the created event detail using the service-returned tournament id; missing identifiers remain recoverable errors.',
  flowTransition: 'verified: success state follows createEventSpace and references the new event only; later competition configuration is performed in that event workspace.',
  visual: 'visual-accepted: 780x1688 target artboard at iPhone 13 Pro 390x844 screenshot .tmp/mini-visual-qa/onboarding-event-success-iphone13pro-100-v5.png; compared with approved completion stepper, success card, event summary, action hints, and CTA.',
  build: 'passed: onboarding.js node --check; target viewport capture reports approved 2x artboard match.'
})

evidenceBySourceSuffix.set('01-\u9009\u62e9\u4e1a\u52a1\u573a\u666f.png', {
  buttonDestination: 'verified: default training selection continues through onboardingWorkspace state inspection; inactive service uses consultation/demo, while enabled service alone can open training workspace creation.',
  flowTransition: 'verified: training capability is determined by backend provisioning state, never by a fixed role or client-only selection.',
  visual: 'visual-accepted: 780x1688 target artboard at iPhone 13 Pro 390x844 screenshot .tmp/mini-visual-qa/onboarding-scene-default-iphone13pro-100-v1.png; compared with approved default stepper, three cards, selected training state, CTA, and stadium background.',
  build: 'passed: onboarding.js node --check; target viewport capture reports approved 2x artboard match.'
})

evidenceBySourceSuffix.set('06-\u9752\u8bad\u6559\u52a1-\u670d\u52a1\u8bf4\u660e-\u672a\u5f00\u6237.png', {
  buttonDestination: 'verified: inactive service offers consultation submission and a no-write functional demo; refresh reads backend opening state rather than enabling creation locally.',
  flowTransition: 'verified: only provisioned active/trial service can enter the training-workspace creation branch; inactive status creates no organization or subscription state.',
  visual: 'visual-accepted: 780x1688 target artboard at iPhone 13 Pro 390x844 screenshot .tmp/mini-visual-qa/onboarding-training-service-inactive-iphone13pro-100-v1.png; compared with approved service card, capability grid, inactive status, consultation/demo actions, and background.',
  build: 'passed: onboarding.js node --check; target viewport capture reports approved 2x artboard match.'
})

evidenceBySourceSuffix.set('07-\u9752\u8bad\u6559\u52a1-\u670d\u52a1\u8bf4\u660e-\u5df2\u5f00\u6237.png', {
  buttonDestination: 'verified: the enabled primary action opens the training-workspace profile step; customer consultation remains available without changing service status.',
  flowTransition: 'verified: the enabled state is supplied by backend provisioning status; only that state grants the following creation step and no client-side role is inferred.',
  visual: 'visual-accepted: 780x1688 target artboard at iPhone 13 Pro 390x844 screenshot .tmp/mini-visual-qa/onboarding-training-service-active-iphone13pro-100-v2.png; compared with approved service card, capability grid, enabled status, single-line primary CTA, consultation action, and stadium background.',
  build: 'passed: onboarding.js node --check; target viewport capture reports approved 2x artboard match.'
})

evidenceBySourceSuffix.set('08-\u9752\u8bad\u6559\u52a1-\u5b8c\u5584\u8d44\u6599.png', {
  buttonDestination: 'verified: valid institution name and optional mark submit through createTrainingWorkspace; the success state receives the service-returned organization and workspace identifiers.',
  flowTransition: 'verified: the form is reachable only after backend-provisioned opening; failed creation preserves entered data and does not create a local-only organization.',
  visual: 'visual-accepted: 780x1688 target artboard at iPhone 13 Pro 390x844 screenshot .tmp/mini-visual-qa/onboarding-training-profile-iphone13pro-100-v2.png; compared with approved training stepper, organization-information card, mark row, name field, capability note, primary CTA, and stadium background.',
  build: 'passed: onboarding.js node --check; target viewport capture reports approved 2x artboard match.'
})

evidenceBySourceSuffix.set('09-\u9752\u8bad\u6559\u52a1-\u521b\u5efa\u5b8c\u6210.png', {
  buttonDestination: 'verified: enterTrainingHome switches to the service-returned workspace id and opens the formal training home; a missing workspace id or failed switch remains a recoverable error.',
  flowTransition: 'verified: completion is shown only from a successful createTrainingWorkspace response and carries the returned organization identity; visual QA data is devtools-only and is never written to a workspace.',
  visual: 'visual-accepted: 780x1688 target artboard at iPhone 13 Pro 390x844 screenshot .tmp/mini-visual-qa/onboarding-training-success-iphone13pro-100-v3.png; compared with approved completion stepper, success card, institution summary, three follow-up capabilities, home CTA, and stadium background.',
  build: 'passed: onboarding.js node --check; target viewport capture reports approved 2x artboard match.'
})

evidenceBySourceSuffix.set('10-\u9752\u8bad\u6559\u52a1-\u529f\u80fd\u6f14\u793a.png', {
  buttonDestination: 'verified: the only primary action returns to the service-description state; the demo contains no write actions, billing actions, or formal-workspace entry.',
  flowTransition: 'verified: demo data stays page-local and read-only; leaving demo reloads the service state instead of persisting any metric, schedule, or institution data.',
  visual: 'visual-accepted: 780x1688 target artboard at iPhone 13 Pro 390x844 screenshot .tmp/mini-visual-qa/onboarding-training-demo-iphone13pro-100-v3.png; compared with approved demo notice, metrics, daily schedule, attention items, core capabilities, return CTA, footnote, and stadium background.',
  build: 'passed: onboarding.js node --check; target viewport capture reports approved 2x artboard match.'
})

evidenceBySourceSuffix.set('01-\u9996\u9875-\u8d5b\u4e8b\u4e3b\u529e\u573a\u666f.png', {
  buttonDestination: 'verified: message badge opens /pages/messages/index; all tasks opens /pages/todo/index; all schedule opens /pages/schedule/index; each match opens its authorized tournament detail.',
  flowTransition: 'verified: organizer content derives from current workspace identity and authorized tournament context; displayed metrics fall back to the returned schedule/task data and do not grant cross-organization access.',
  visual: 'visual-accepted: 780x1688 target artboard at iPhone 13 Pro 390x844 screenshot .tmp/mini-visual-qa/home-organizer-iphone13pro-100-v5.png; compared with approved organizer header, overview card, task card, match section, stadium background, and approved oil-icon bottom navigation. The second match remains in the safe scroll region under the newer approved tab bar.',
  build: 'passed: home.js node --check; WXML expression constraints retained; target viewport capture reports approved 2x artboard match.'
})

evidenceBySourceSuffix.set('02-\u9996\u9875-\u7403\u961f\u534f\u4f5c\u573a\u666f.png', {
  buttonDestination: 'verified: message badge opens /pages/messages/index; all tasks opens /pages/todo/index; all teams switches to /pages/teams/index; team cards open their stored team context; all schedule opens /pages/schedule/index; match cards open their authorized tournament detail.',
  flowTransition: 'verified: team-coach content is derived from accepted team membership plus the current workspace; team profile remains a long-term asset while match and tournament records remain routed by their own authorized ids.',
  visual: 'visual-accepted: 780x1688 target artboard at iPhone 13 Pro 390x844 screenshot .tmp/mini-visual-qa/home-team-coach-iphone13pro-100-v1.png; compared with approved coach header, team overview, task card, team cards, recent-match section, stadium background, and approved oil-icon bottom navigation.',
  build: 'passed: home.js node --check; WXML expression constraints retained; target viewport capture reports approved 2x artboard match.'
})

evidenceBySourceSuffix.set('03-\u9996\u9875-\u9752\u8bad\u7ecf\u8425\u573a\u666f.png', {
  buttonDestination: 'verified: message badge opens /pages/messages/index; all tasks opens /pages/todo/index; each course and all courses use the formal /pages/training/index destination, which retains subscription and member-permission gates.',
  flowTransition: 'verified: training metrics, tasks, and courses are read from the current workspace training data; when subscription or role access is absent the downstream training route remains restricted rather than presenting fabricated operations data.',
  visual: 'visual-accepted: 780x1688 target artboard at iPhone 13 Pro 390x844 screenshot .tmp/mini-visual-qa/home-training-coach-iphone13pro-100-v2.png; compared with approved training header, overview metrics, task card, course cards, permission treatment, stadium background, and approved oil-icon bottom navigation.',
  build: 'passed: home.js node --check; WXML expression constraints retained; target viewport capture reports approved 2x artboard match.'
})

evidenceBySourceSuffix.set('01-\u6211\u7684.png', {
  buttonDestination: 'verified: profile card and account/security open /pages/profile/info/info; message row opens /pages/messages/index; event/team rows use their tab destinations; logout requires modal confirmation, clears only local session and workspace cache, then relaunches login.',
  flowTransition: 'verified: the displayed user, workspace, identity and unread count derive from getMiniWorkspace context; no fixed phone number or permanent client-side role is used.',
  visual: 'visual-accepted: 780x1688 target artboard at iPhone 13 Pro 390x844 screenshot .tmp/mini-visual-qa/profile-main-iphone13pro-100-v2.png; compared with approved custom top shell, profile card, identity summary, service menus, logout section, stadium background, and approved oil-icon bottom navigation.',
  build: 'passed: profile.js node --check; profile.json custom navigation and WXML expression constraints verified; target viewport capture reports approved 2x artboard match.'
})

evidenceBySourceSuffix.set('03-\u5207\u6362\u8eab\u4efd.png', {
  buttonDestination: 'verified: authorized alternate identity selection enables confirmation; confirmation calls getMiniWorkspace setHomeIdentity and returns to /pages/home/home only after server verification; cancel restores the prior sheet state.',
  flowTransition: 'verified: only current-workspace authorized identities are rendered, the current identity remains non-submittable, and client selection cannot create membership or bypass server permission checks.',
  visual: 'visual-accepted: 780x1688 target artboard at iPhone 13 Pro 390x844 screenshot .tmp/mini-visual-qa/profile-identity-sheet-iphone13pro-100-v2.png; compared with approved dimmed profile shell, bottom identity sheet, three identity options, disabled current state, action area, and safe custom tab bar.',
  build: 'passed: profile.js node --check; WXML expression constraints retained; target viewport capture reports approved 2x artboard match.'
})

evidenceBySourceSuffix.set('02-\u6d88\u606f\u4e2d\u5fc3.png', {
  buttonDestination: 'verified: category tabs filter the current page collection; tapping a message marks only that message read through getMiniWorkspace before opening its registered /pages/ deep link; mark-all-read uses the same server-side current-account/current-workspace boundary.',
  flowTransition: 'verified: real messages are fetched from getMiniWorkspace messages scoped to the current workspace; official-roster and match-lineup submit/return actions now write audience-scoped organization/team notifications; read state and deep links are not accepted from arbitrary client URLs, and empty/error states retain recovery actions.',
  visual: 'visual-accepted: 780x1688 target artboard at iPhone 13 Pro 390x844 screenshot .tmp/mini-visual-qa/messages-main-iphone13pro-100-v2.png; compared with approved custom header, capsule-safe mark-all entry, four category filters, rounded message list, unread treatment, stadium background, and lower safe area.',
  build: 'passed: messages/index.js node --check; messages/index.json custom navigation and WXML expression constraints verified; getMiniWorkspace notification writers node --check; deployed 2026-08-14 19:23:26 as Nodejs18.15 / Deployment completed; no fixture or real business write exercised.'
})

evidenceBySourceSuffix.set('05-\u5de5\u4f5c\u7a7a\u95f4\u8bbf\u95ee\u53d7\u9650.png', {
  buttonDestination: 'verified: request invokes workspaceAccess.request for the supplied organization and only creates a pending review request; return-login clears workspace cache then relaunches /pages/login/login.',
  flowTransition: 'verified: workspaceAccess supplies organization, masked account and membership status; active membership returns through context loading, while pending/rejected/disabled states never grant membership, tournament, or training permissions.',
  visual: 'visual-accepted: 780x1688 target artboard at iPhone 13 Pro 390x844 screenshot .tmp/mini-visual-qa/workspace-restricted-iphone13pro-100-v1.png; compared with approved restricted title, security illustration, explanation card, masked account details, status, request action, return login, and stadium background.',
  build: 'passed: restricted.js node --check; WXML expression constraints retained; target viewport capture reports approved 2x artboard match.'
})

evidenceBySourceSuffix.set('02-\u65e0\u7403\u961f\u72b6\u6001.png', {
  buttonDestination: 'verified: create team opens /pages/guide/team-info/team-info only when current workspace has team.manage; organizer invitation creation, prebuilt-team receipt and claim-conflict handling remain accessible solely through their invitation deep links.',
  flowTransition: 'verified: this state appears only when no manageable long-term teams exist; it never searches, claims, merges, or fabricates teams, and it keeps long-term team assets separate from tournament participation snapshots.',
  visual: 'visual-accepted: 780x1688 target artboard at iPhone 13 Pro 390x844 screenshot .tmp/mini-visual-qa/teams-empty-iphone13pro-100-v2.png; compared with approved team title, centered empty card, team mark, creation CTA, invitation-only explanation, stadium background, and approved oil-icon bottom navigation.',
  build: 'passed: teams/index.js node --check; teams/index.json custom navigation and WXML expression constraints verified; target viewport capture reports approved 2x artboard match.'
})

evidenceBySourceSuffix.set('05-创建球队.png', {
  buttonDestination: 'verified: no-team create action opens /pages/guide/team-info/team-info; the page validates team name, short name and city, then continues to /pages/onboarding/onboarding?scene=team&step=team&fromTeamDraft=1. The confirmation action alone calls onboardingWorkspace.createTeam.',
  flowTransition: 'verified: crest selection uses the formal crop → cloud upload → transparent-background processing chain while retaining original and derived file IDs; draft confirmation carries short name, division and city to the server. Server validates cloud-file IDs, age group, current business relation and invitation boundary before creating a long-term team, then keeps tournament registration as a separate snapshot relation.',
  visual: 'visual-accepted: 780x1688 target artboard at iPhone 13 Pro 390x844 screenshot .tmp/mini-visual-qa/team-create-iphone13pro-100-v4.png; compared with approved three-step shell, crest entry, seven compact information rows, snapshot notice, stadium background, safe area and single-line confirmation CTA. Production UI uses approved oil-icon assets; the crest remains a user-uploaded asset, never a prototype crop.',
  build: 'passed: team-info.js, onboarding.js and onboardingWorkspace/index.js node --check; WXML expression constraints and git whitespace check passed; target viewport capture reports approved 2x artboard match.'
})

evidenceBySourceSuffix.set('06-球队详情.png', {
  buttonDestination: 'verified: five entries open the registered current-team routes for profile, members, player library, participation, and history; 当前参赛 carries the current tournamentId and teamId to the authorized tournament detail. Back returns to Teams; empty state opens controlled team creation.',
  flowTransition: 'verified: production reads the selected authorized team from workspace context, keeps long-term assets separate from roster/lineup/result snapshots, and shows a current tournament only for a real participating relation. visualQa=1 supplies local fixture content only in developer tools.',
  visual: 'visual-accepted: `.tmp/mini-visual-qa/team-detail-target-390x844-v1.png` captured at the approved 390x844 logical target. Compared with the approved source for custom capsule-safe navigation, summary, metrics, five detail entries and current-tournament panel. The prototype-drawn bottom tab is intentionally not duplicated on this navigateTo detail route.',
  build: 'verified: node --check miniprogram/pages/team/team.js; page WXML restriction check; team.json parse; node tools/validate-ui-delivery.js passed on 2026-08-12.'
})

evidenceBySourceSuffix.set('21-球队资料.png', {
  buttonDestination: 'verified: authorized 编辑球队资料 enters the same current-team form; 保存 calls getMiniWorkspace.saveTeamProfile with the active workspaceId and teamId, then reloads; 取消 restores the prior profile; back returns to team detail.',
  flowTransition: 'verified: production profile data and management permission are returned by the current authorized workspace. The local visualQa fixture is devtools-only. Profile changes are limited to the long-term team asset and do not overwrite approved rosters, lineups, or completed-match snapshots.',
  visual: 'visual-accepted: `.tmp/mini-visual-qa/team-profile-target-390x844-v1.png` captured at the approved 390x844 logical target. Compared with the approved source for capsule-safe navigation, crest/completeness summary, basic data, contact data, snapshot notice, and edit entry.',
  build: 'verified: node --check miniprogram/pages/team/profile/profile.js; page WXML restriction check; profile.json parse; node tools/validate-ui-delivery.js passed on 2026-08-12.'
})

evidenceBySourceSuffix.set('22-球队成员.png', {
  buttonDestination: 'verified: 返回 safely navigates to team detail (or the teams tab when no back stack); 教练/管理员筛选 stays within the current authorized team member relationship; 邀请成员、微信邀请、生成邀请二维码 all call the existing getMiniWorkspace.createTeamMemberInvite action for the active workspaceId and teamId.',
  flowTransition: 'verified: team members remain long-term team collaboration records, explicitly distinct from a tournament official roster. Only an authorized manager receives invitation actions. The visualQa member fixture is development-tools-only and does not replace production member data.',
  visual: 'visual-accepted: `.tmp/mini-visual-qa/team-members-target-390x844-v3.png` captured at the approved 390x844 logical target. Compared with the approved source for capsule-safe custom navigation, readable crest summary, search, role filters, joined/pending states, re-invite affordance, team-member notice, and two invitation channels. Invitation assets use the reviewed oil-icon football-brand-v2 family.',
  build: 'verified: node --check miniprogram/pages/team/members/members.js; page WXML restriction check; members.json parse; node tools/validate-ui-delivery.js and git diff --check passed on 2026-08-12.'
})

evidenceBySourceSuffix.set('23-参赛管理.png', {
  buttonDestination: 'verified: each event card enters its current tournament detail with teamId retained; the current-match action opens the current match lineup with matchId and teamId; filter tabs only scope the current authorized team participation list; back safely returns to the team stack or teams tab.',
  flowTransition: 'verified: production reads getMiniWorkspace.teamParticipation for the active workspaceId and teamId. The visualQa fixture is development-tools-only. Team profile remains a long-term asset; tournament participation, roster review, and match lineup retain their separate event snapshot boundary.',
  visual: 'visual-accepted: `.tmp/mini-visual-qa/team-participation-target-390x844-v1.png` captured at the approved 390x844 logical target. Compared with the approved source for capsule-safe navigation, team/event summary, three state filters, active and pending event cards, roster/next-match metadata, lineup task, and snapshot notice. Tournament and trophy icons use the reviewed oil-icon football-brand-v2 family.',
  build: 'verified: node --check miniprogram/pages/team/participation/participation.js; page WXML restriction check; node tools/validate-ui-delivery.js and git diff --check passed on 2026-08-12.'
})

evidenceBySourceSuffix.set('24-历史参赛记录.png', {
  buttonDestination: 'verified: each 查看归档 action opens the corresponding current tournamentId with current teamId and readonly=1; status tabs only filter the current authorized team archive relation; back returns to the team stack or teams tab.',
  flowTransition: 'verified: production reads getMiniWorkspace.teamHistory with active workspaceId and teamId. The visualQa fixture is development-tools-only. Archived participation is explicitly read-only and remains an event snapshot, unaffected by long-term team-profile edits.',
  visual: 'visual-accepted: `.tmp/mini-visual-qa/team-history-target-390x844-v1.png` captured at the approved 390x844 logical target. Compared with the approved source for capsule-safe navigation, historical team summary, archive filters, three archive cards, result/record hierarchy, archive actions, and immutable-snapshot notice. Trophy and approved assets use the reviewed oil-icon football-brand-v2 family.',
  build: 'verified: node --check miniprogram/pages/team/history/history.js; page WXML restriction check; node tools/validate-ui-delivery.js and git diff --check passed on 2026-08-12.'
})

evidenceBySourceSuffix.set('10-球员资料进度.png', {
  buttonDestination: 'verified: each 查看 action opens player detail for normal/pending players and the current playerId exception route for exception players; 提醒 calls the existing authorized remindParentProfile action with workspaceId, teamId and playerId; the batch reminder remains permission-gated; filters scope the current team player list.',
  flowTransition: 'verified: production reads getMiniWorkspace.teamPlayers for the active workspaceId/teamId and preserves canManage. The visualQa fixture is development-tools-only. Player profile progress is a long-term team asset; it does not mutate the current tournament official-roster or lineup snapshot.',
  visual: 'visual-accepted: `.tmp/mini-visual-qa/profile-progress-target-390x844-v1.png` captured at the approved 390x844 logical target. Compared with the approved source for capsule-safe navigation, completeness summary, progress bar, four status filters, five player states, reminder/view actions, and reminder/notice footer. Bell and team-reminder assets use the reviewed oil-icon football-brand-v2 family.',
  build: 'verified: node --check miniprogram/pages/team/profile-progress/profile-progress.js; page WXML restriction check; node tools/validate-ui-delivery.js and git diff --check passed on 2026-08-12.'
})

evidenceBySourceSuffix.set('11-球员资料异常.png', {
  buttonDestination: 'verified: 联系家长重新提交 is permission-gated and calls getMiniWorkspace.remindParentProfile with the active workspaceId, teamId and playerId; 查看核验记录 is a non-sensitive status entry; back returns to the current player-progress route when no stack exists.',
  flowTransition: 'verified: production locates only the authorized current-team player through getMiniWorkspace.teamPlayers. The visualQa fixture is development-tools-only. The exception view presents masked comparison output only: no identity-document original or full ID number is exposed, and it does not alter long-term player data or tournament roster snapshots.',
  visual: 'visual-accepted: `.tmp/mini-visual-qa/profile-exception-target-390x844-v1.png` captured at the approved 390x844 logical target. Compared with the approved source for capsule-safe navigation, player summary, error alert, four inspection states, masked comparison table, privacy notice, actions, and audit progression. Inspection icons use the reviewed oil-icon football-brand-v2 family.',
  build: 'verified: node --check miniprogram/pages/team/profile-exception/profile-exception.js; page WXML restriction check; node tools/validate-ui-delivery.js and git diff --check passed on 2026-08-12.'
})

evidenceBySourceSuffix.set('13-名单审核退回.png', {
  buttonDestination: 'verified: problem-player action opens only that playerId exception view with the current teamId; eligible roster rows remain selectable inside the current roster snapshot; status tabs are current-snapshot filters; 修改完成后重新提交 calls getMiniWorkspace.submitOfficialRoster with active workspaceId/teamId/tournamentId and selected playerIds; back returns to the current team participation context.',
  flowTransition: 'verified: production reads getMiniWorkspace.officialRoster and retains the server-returned snapshot status/reason. Re-submission is permission-gated and preserves the separation between long-term team players and the current tournament official-roster snapshot; already passed rows are not reset by visual filtering or exception routing. The visualQa fixture is development-tools-only.',
  visual: 'visual-accepted: `.tmp/mini-visual-qa/official-roster-returned-target-390x844-v1.png` captured at the approved 390x844 logical target. Compared with the approved source for capsule-safe navigation, tournament/deadline/limit summary, returned-review stage, warning, preserved passed vs problem players, action affordances, resubmission notice and primary action. Error/roster assets use the reviewed oil-icon football-brand-v2 family.',
  build: 'verified: node --check miniprogram/pages/team/official-roster/official-roster.js; page WXML restriction check; node tools/validate-ui-delivery.js and git diff --check passed on 2026-08-12.'
})

evidenceBySourceSuffix.set('19-赛事邀请-接收预建队.png', {
  buttonDestination: 'verified: 使用现有球队接收 calls acceptPrebuiltTeamInvite with choice=existing and the explicitly selected existingTeamId; 接收预建队伍 calls the same controlled action with choice=prebuilt; accepted outcome redirects to the returned teamId, while reviewRequired redirects to the claim-conflict route.',
  flowTransition: 'verified: the production page reads prebuiltTeamInvite and never performs a name-based automatic merge. Candidate selection is explicit. Name, manager, or ownership conflicts retain reviewRequired and move to manual verification. The visualQa fixture is development-tools-only.',
  visual: 'visual-accepted: `.tmp/mini-visual-qa/prebuilt-invite-target-390x844-v1.png` captured at the approved 390x844 logical target. Compared with the approved source for capsule-safe navigation, tournament context, prebuilt-team summary, existing-team vs prebuilt-team choices, recommended state, explicit non-merge warning, and three-step flow. Tournament/team assets use the reviewed oil-icon football-brand family.',
  build: 'verified: node --check miniprogram/pages/team/prebuilt-invite/prebuilt-invite.js; page WXML restriction check; node tools/validate-ui-delivery.js and git diff --check passed on 2026-08-12.'
})

evidenceBySourceSuffix.set('20-赛事邀请-新建球队参赛.png', {
  buttonDestination: 'verified: 创建球队并加入赛事 preserves the current inviteId and enters /pages/onboarding/onboarding?scene=team&step=team&tournamentInviteId=:inviteId; 暂不处理 and back leave the invite without creating a team.',
  flowTransition: 'verified: production preview is read through onboardingWorkspace.previewTournamentCreateTeamInvite. The following onboarding flow creates a long-term team first and then establishes the current tournament relation; no tournament snapshot is written into the long-term team profile. The visualQa fixture is development-tools-only.',
  visual: 'visual-accepted: `.tmp/mini-visual-qa/create-team-invite-target-390x844-v1.png` captured at the approved 390x844 logical target. Compared with the approved source for capsule-safe navigation, tournament context, invitation card, three creation-to-entry stages, long-term asset boundary, primary action and defer action. Workflow assets use the reviewed oil-icon football-brand-v2 family.',
  build: 'verified: node --check miniprogram/pages/team/create-team-invite/create-team-invite.js; page WXML restriction check; node tools/validate-ui-delivery.js and git diff --check passed on 2026-08-12.'
})

evidenceBySourceSuffix.set('17-简易版球队数据包.png', {
  buttonDestination: 'verified: for an eligible simple division, 了解并开通 calls getMiniWorkspace.requestTeamDataPackage with active workspaceId/teamId/tournamentId/divisionId; requested state is non-repeatable; enabled state opens the current team/tournament/division data page; back defers without mutation.',
  flowTransition: 'verified: teamDataPackage is read from the current authorized team/tournament/division. Professional divisions preserve their existing included capability and hide the purchase/request action. Package data is explicitly limited to the current team, does not upgrade an organizer event version, generate official event leaderboards, or change another team. The visualQa fixture is development-tools-only.',
  visual: 'visual-accepted: `.tmp/mini-visual-qa/team-data-package-target-390x844-v1.png` captured at the approved 390x844 logical target. Compared with the approved source for capsule-safe navigation, group lock summary, data-package capability panel, four benefit rows, boundary statements, request/defer actions and footnote. Assets use the reviewed oil-icon football-brand-v2 family.',
  build: 'verified: node --check miniprogram/pages/team/data-package/data-package.js; page WXML restriction check; node tools/validate-ui-delivery.js and git diff --check passed on 2026-08-12.'
})

evidenceBySourceSuffix.set('09-家长协作链接.png', {
  buttonDestination: 'verified：复制服务号链接、重新生成与返回均限定为当前 teamId/playerId 的受控家长协作邀请；家长不进入球队管理端。',
  flowTransition: 'verified：邀请只补充当前球员资料，不能授予球队管理权限，也不暴露其他球员或赛事数据；visualQa 不写入或发送邀请。',
  visual: 'visual-accepted：`.tmp/mini-visual-qa/parent-collaboration-final-v3.png` 已在批准的 390×844 逻辑目标视口捕获；核对了胶囊安全区、服务号资料补充说明、二维码、有效期、复制/重新生成动作和受限资料范围。',
  build: 'verified：node --check miniprogram/pages/team/parent-collaboration/parent-collaboration.js；WXML 限制检查通过。'
})

evidenceBySourceSuffix.set('18-数据包赛事数据.png', {
  buttonDestination: 'verified: 导出本队数据 calls getMiniWorkspace.requestTeamDataExport with active workspaceId/teamId/tournamentId/divisionId and is canManage-gated; 最近比赛 / 查看比赛记录 opens only the returned current matchId; back returns to the current data-package context.',
  flowTransition: 'verified: production reads getMiniWorkspace.teamDataPackageData scoped to the authorized current workspace, team, tournament and division. Player presentation is deliberately masked. The page contains current-team data-package benefits only: it does not grant organizer-wide views, update historic results, or cause another team to be opened. The visualQa fixture is development-tools-only.',
  visual: 'visual-accepted: `.tmp/mini-visual-qa/team-data-package-events-final-v2.png` captured at the approved 390x844 logical target; compared for capsule-safe navigation, enabled package/team/tournament/division summary, four metrics, player table, recent match, data-direction boundary and controlled export actions. Assets use the reviewed oil-icon football-brand-v2 family.',
  build: 'verified: node --check miniprogram/pages/team/data-package-events/data-package-events.js; page WXML restriction check; node tools/validate-ui-delivery.js and git diff --check passed on 2026-08-12.'
})

evidenceBySourceSuffix.set('14-单场比赛阵容.png', {
  buttonDestination: 'verified: a pitch slot opens the current formal-roster player picker; a selected formal-roster player is placed only in the chosen current match slot; substitute actions remain capped at five; submit calls getMiniWorkspace.submitMatchLineup with active workspaceId/matchId/teamId, formation, starter slots and substitutes, then redirects to the lineup result.',
  flowTransition: 'verified: production matchLineup supplies only current-match authorized formal-roster players. Formation changes reset only the unsaved match lineup arrangement. Returned status remains editable; submitted/locked status blocks edits. The visualQa fixture is development-tools-only and does not alter lineup data.',
  visual: 'visual-accepted: `.tmp/mini-visual-qa/match-squad-target-390x844-v2.png` captured at the approved 390x844 logical iPhone target. Compared with the approved source for capsule-safe custom navigation, match context, formation state, 8-player pitch arrangement, empty/drop behavior, bench, counts and submit-lock guidance. No title or action overlaps the upper-right capsule.',
  build: 'verified: node --check miniprogram/pages/match/squad/squad.js; squad.json parse; page WXML restriction check; node tools/validate-ui-delivery.js and git diff --check passed on 2026-08-12.'
})

evidenceBySourceSuffix.set('14-1-选择球员弹窗.png', {
  buttonDestination: 'verified: a picker row selects only the chosen eligible formal-roster player into the current selected slot; 查看全部名单 swaps the picker data to the remaining current formal roster; close restores the current lineup without mutation.',
  flowTransition: 'verified: preferred position filtering is derived from the selected slot, while the all-roster fallback still excludes already-arranged players. No player outside the current matchId/teamId formal roster is reachable from the picker. The visualQa=1&picker=1 state is development-tools-only.',
  visual: 'visual-accepted: `.tmp/mini-visual-qa/match-squad-picker-target-390x844-v2.png` captured at approved 390x844 logical target. Compared with approved source for dimmed lineup context, bottom-sheet geometry, selected-position hint, position-priority/all-roster toggle, eligible defender formal-roster row, plus affordance and fill-slot footer. Capsule space remains unblocked.',
  build: 'verified: node --check miniprogram/pages/match/squad/squad.js; page WXML restriction check; node tools/validate-ui-delivery.js and git diff --check passed on 2026-08-12.'
})

evidenceBySourceSuffix.set('15-阵容提交结果.png', {
  buttonDestination: 'verified: 查看阵容快照 returns to the current matchId/teamId lineup view; 返回比赛详情 redirects to only the current matchId detail; returned lineup status still redirects to the dedicated returned state instead of being rendered as success.',
  flowTransition: 'verified: production reads getMiniWorkspace.matchLineup. A submitted lineup is adjustable before play; lock state is represented distinctly and must be derived by the server. The visualQa fixture is development-tools-only and does not change the submitted snapshot.',
  visual: 'visual-accepted: `.tmp/mini-visual-qa/lineup-result-target-390x844-v1.png` captured at approved 390x844 logical target. Compared with approved source for capsule-safe back navigation, success hierarchy, match summary, starter/substitute counts, pre-match adjustment notice, submitted/waiting/locked flow and two handoff actions.',
  build: 'verified: node --check miniprogram/pages/match/lineup-result/lineup-result.js; page WXML restriction check; node tools/validate-ui-delivery.js and git diff --check passed on 2026-08-12.'
})

evidenceBySourceSuffix.set('16-阵容退回与重新提交.png', {
  buttonDestination: 'verified: 更换球员 and 重新提交阵容 redirect to only the current matchId/teamId squad editor; 查看退回记录 retains the current returned-record status view; back preserves the current stack.',
  flowTransition: 'verified: production reads matchLineup only when status=returned. The return reason applies to the current match snapshot: existing confirmed starter/substitute counts are retained, and the squad editor/server still revalidates eligibility and submission before re-submit. This never modifies the long-term team player library. The visualQa fixture is development-tools-only.',
  visual: 'visual-accepted: `.tmp/mini-visual-qa/lineup-returned-target-390x844-v1.png` captured at approved 390x844 logical target. Compared with approved source for capsule-safe navigation, match context, referee-return alert, focused replacement player, confirmed remaining groups, deadline/lock notice and resubmission/history actions.',
  build: 'verified: node --check miniprogram/pages/match/lineup-returned/lineup-returned.js; page WXML restriction check; node tools/validate-ui-delivery.js and git diff --check passed on 2026-08-12.'
})

evidenceBySourceSuffix.set('01-球队中心.png', {
  buttonDestination: 'verified: 创建球队 opens /pages/guide/team-info/team-info; 球队卡 writes the selected team context then opens /pages/team/team; each 赛事待办 writes the current team context and opens /pages/tournament/signup/signup?id=:tournamentId&teamId=:teamId.',
  flowTransition: 'verified: the visualQa fixture is development-tools-only. Production continues to read authorized workspace teams and event tasks; team creation, team detail, and tournament collaboration keep their existing controlled routes and tenant context.',
  visual: 'visual-accepted: `.tmp/mini-visual-qa/teams-center-target-390x844-v1.png` captured at the approved 390x844 logical target. Compared with the approved source for the capsule-safe hero, creation action, two team cards, task stack, football-brand iconography and bottom tab bar.',
  build: 'verified: node --check miniprogram/pages/teams/index.js; page WXML restriction check; app.json JSON parse; node tools/validate-ui-delivery.js passed on 2026-08-12.'
})

evidenceBySourceSuffix.set('02-无球队状态.png', {
  buttonDestination: 'verified: 空态创建球队 uses the same team.manage gate and opens /pages/guide/team-info/team-info; invitation text remains explanatory only and does not add a search, claim, or automatic-merge entry.',
  flowTransition: 'verified: the visualQa=1&state=empty fixture is development-tools-only. Production renders this state only when the authorized workspace returns no long-term teams; creation continues through the controlled onboarding flow and invitation journeys remain deep-link-only.',
  visual: 'visual-accepted: `.tmp/mini-visual-qa/teams-empty-final-v3.png` captured at approved 390x844 logical target; compared for formal brand mark, centered empty panel, primary creation action, invitation explanation, tab bar and capsule clearance.',
  build: 'verified: node --check miniprogram/pages/teams/index.js; page WXML restriction check; app.json JSON parse; node tools/validate-ui-delivery.js passed on 2026-08-12.'
})

evidenceBySourceSuffix.set('05-创建球队.png', {
  buttonDestination: 'verified: back returns to the previous page or the Teams tab; 下一步 validates the minimum draft, stores it locally, then opens /pages/onboarding/onboarding?scene=team&step=team&fromTeamDraft=1. Only the confirmation action invokes onboardingWorkspace.createTeam; success switches to the created team workspace and returns to /pages/teams/index.',
  flowTransition: 'verified: crest selection uses local crop → cloud upload → remove-background processing with original/transparent references preserved and a safe fallback. Team name, short name, division and city remain a draft until the controlled creation confirmation; no invitation claim or automatic same-name merge is introduced.',
  visual: 'visual-accepted: `.tmp/mini-visual-qa/team-create-final-v5.png` captured at approved 390x844 logical target; compared for capsule-safe top navigation, three-step rail, shield upload field, minimum-information card, snapshot notice, and fixed primary action.',
  build: 'verified: node --check miniprogram/pages/guide/team-info/team-info.js; page WXML restriction check; app.json JSON parse; node tools/validate-ui-delivery.js passed on 2026-08-12.'
})

evidenceBySourceSuffix.set('竞赛管理-添加组别-基础创建.png', {
  buttonDestination: 'verified: return and cancel preserve the current tournament and go to /tournaments/:id/competition; mode-comparison opens a selectable overlay and synchronizes view=mode-compare; create validates the form, writes only the current tournament division, then routes to /tournaments/:id/competition/rules?divisionId=:id&step=format.',
  flowTransition: 'verified: age group, gender, team count, order and mutually exclusive mode remain a draft until the controlled creation action; the chosen division mode is carried into rule setup and cannot replace another tournament or division. Permission denial disables creation.',
  visual: 'visual-accepted: 1586x992 target screenshot .tmp/pc-visual-qa/division-create-1586x992-v1.png; compared with approved event shell, two-column form/preview, mode cards and fixed action bar. Mode comparison interaction is visually verified at .tmp/pc-visual-qa/division-create-mode-compare-1586x992-v3.png after route-state synchronization repair.',
  build: 'passed: web-admin-vue npm run build on 2026-08-12; no CloudBase browser SDK introduced; git whitespace verification passed.'
})

evidenceBySourceSuffix.set('竞赛管理-组别管理-简易与专业模式对比.png', {
  buttonDestination: 'verified: a division row menu opens the current tournament /competition/create?view=mode-compare&divisionId=:divisionId route; selecting either mode returns to the same draft and the controlled creation action continues only into that new division rules route.',
  flowTransition: 'verified: the modal resolves the selected division ID before rendering its label, so a U10 entry cannot be presented as another division. Mode selection is draft-only until creation, and no existing division is overwritten or silently upgraded.',
  visual: 'visual-accepted: 1618x972 target screenshot .tmp/pc-visual-qa/division-mode-compare-1618x972-v7.png; compared with approved dimmed competition shell, centered dual-mode comparison, free/pro hierarchy, scoped U10 professional CTA, close action and rule-lock statement.',
  build: 'passed: web-admin-vue npm run build on 2026-08-12; URL/route-state visual transition and git whitespace verification passed.'
})

evidenceBySourceSuffix.set('竞赛管理-组别管理-卡片菜单.png', {
  buttonDestination: 'verified: current-row menu actions retain tournamentId and divisionId; local click verification sent U10 “查看参赛球队” to /tournaments/qa-tournament-2026/teams?divisionId=qa-division-u10. Draw adds professional mode only for professional divisions, and schedule uses the same scoped query.',
  flowTransition: 'verified: menu state is attached to one division ID at a time, closes before navigation, and never derives a target from a display name. Edit/rules, teams, draw and schedule all preserve the current tournament boundary.',
  visual: 'visual-accepted: 1619x972 target screenshot .tmp/pc-visual-qa/division-card-menu-1619x972-v1.png; compared with approved competition summary, five division rows, U10-scoped open menu, mode/status hierarchy and lower configuration flow. Click-transition route evidence is .tmp/pc-visual-qa/division-card-menu-teams-transition-1619x972-v1.png.',
  build: 'passed: web-admin-vue npm run build on 2026-08-12; local menu click destination and git whitespace verification passed.'
})

evidenceBySourceSuffix.set('竞赛管理-U16组-简化版-步骤1-赛制设置.png', {
  buttonDestination: 'verified: the scoped U16 format draft action changes only the current rules route from step=format to step=rules while retaining /tournaments/qa-tournament-2026 and divisionId=qa-division-u16; no cloud write occurs in local QA.',
  flowTransition: 'verified: cup/knockout/league/hybrid selection and team/group parameters are held as the current division draft; advancing enters basic rules and does not create a schedule, player roster or cross-division update.',
  visual: 'visual-accepted: 1672x941 target screenshot .tmp/pc-visual-qa/division-simple-format-u16-1672x941-v1.png; compared with approved U16 simple-mode shell, three-step rail, four format cards, parameter panel, generated summary and fixed continuation bar. Click-transition evidence is .tmp/pc-visual-qa/division-simple-format-transition-1672x941-v1.png.',
  build: 'passed: web-admin-vue npm run build on 2026-08-12; local step transition and git whitespace verification passed.'
})

evidenceBySourceSuffix.set('竞赛管理-U16组-简化版-步骤2-基础规则.png', {
  buttonDestination: 'verified: save advances only the scoped rules route from step=rules to step=finalize while retaining tournamentId=qa-tournament-2026 and divisionId=qa-division-u16; the local QA fixture prevents cloud writes.',
  flowTransition: 'verified: participation, timing, match-execution and discipline rules remain a current U16 simple-mode draft; the next page is the controlled finalization summary, not schedule generation or roster modification.',
  visual: 'visual-accepted: 1672x941 target screenshot .tmp/pc-visual-qa/division-simple-rules-u16-1672x941-v1.png; compared with approved completed-step rail, four rule areas, system defaults and fixed next action. Click-transition evidence is .tmp/pc-visual-qa/division-simple-rules-transition-1672x941-v1.png.',
  build: 'passed: web-admin-vue npm run build on 2026-08-12; local step transition and git whitespace verification passed.'
})

evidenceBySourceSuffix.set('竞赛管理-U16组-简化版-步骤3-规则定版.png', {
  buttonDestination: 'verified: final confirmation retains tournamentId=qa-tournament-2026 and divisionId=qa-division-u16, then enters /tournaments/qa-tournament-2026/teams?divisionId=qa-division-u16. Local QA does not write cloud data.',
  flowTransition: 'verified: the finalization summary names the current U16 draft, its format and rules, and explicitly limits impact to current-division draw, schedule and standings; generated schedules and historical match snapshots are not overwritten.',
  visual: 'visual-accepted: 1672x941 target screenshot .tmp/pc-visual-qa/division-simple-finalize-u16-1672x941-v1.png; compared with approved completed steps, U16 summary, default-rule section, finalization information, scope warning and fixed confirmation action. Click-transition evidence is .tmp/pc-visual-qa/division-simple-finalize-transition-1672x941-v1.png.',
  build: 'passed: web-admin-vue npm run build on 2026-08-12; current-division destination and git whitespace verification passed.'
})

evidenceBySourceSuffix.set('竞赛管理-U16组-规则定版-已生效.png', {
  buttonDestination: 'verified: the effective U16 rule page exposes only scoped return, draw and schedule actions; each keeps tournamentId=qa-tournament-2026 and divisionId=qa-division-u16.',
  flowTransition: 'verified: effective rules are read-only in this state; later amendments create a new audited version and do not mutate prior schedules or match snapshots. Draw, schedule and standings remain constrained by this current division rule snapshot.',
  visual: 'visual-accepted: 1672x941 target screenshot .tmp/pc-visual-qa/division-simple-effective-u16-1672x941-v3.png; compared with approved effective-step rail, read-only U16 rule summary, version information, impact scope, audit warning and three downstream actions.',
  build: 'passed: web-admin-vue npm run build on 2026-08-12; visual-QA fixture and git whitespace verification passed.'
})

// 2026-08-13 evidence hardening: last matching suffix intentionally wins in resolveEvidence.
const verifiedProfessionalDrawEvidence = {
  buttonDestination: 'verified: local target-viewport click on 确认签位编排 entered the same current tournament/division professional result route with the active format retained. The production handler is confirmDrawResult → saveConfig("result") for the current division only.',
  flowTransition: 'verified: the console has to reach the slots stage before confirmation. saveConfig persists only the current division draw configuration; visualQa uses the isolated fixture and writes no cloud record.',
  build: 'verified: ProfessionalDrawFlow.vue binds the primary confirmation to confirmDrawResult/saveConfig; target-viewport click and route diagnostics passed on 2026-08-13; PC build passed.'
}
evidenceBySourceSuffix.set('抽签与分组-专业模式-抽签操作台-联赛.png', { ...verifiedProfessionalDrawEvidence, visual: 'visual-accepted: current 1672x941 league slots evidence exists at `.tmp/pc-visual-qa/draw-slots-league-v2-1672x941.png`; clicking 确认签位编排 reached `step=result&format=league` in `.tmp/pc-visual-qa/professional-draw-slots-league-transition-v1.png`.' })
evidenceBySourceSuffix.set('抽签与分组-专业模式-抽签操作台-淘汰赛.png', { ...verifiedProfessionalDrawEvidence, visual: 'visual-accepted: current 1672x941 knockout slots evidence exists at `.tmp/pc-visual-qa/draw-slots-knockout-v2-1672x941.png`; clicking 确认签位编排 reached `step=result&format=knockout` in `.tmp/pc-visual-qa/professional-draw-slots-knockout-transition-v1.png`.' })
evidenceBySourceSuffix.set('抽签与分组-专业模式-抽签操作台-混合制对阵图.png', { ...verifiedProfessionalDrawEvidence, visual: 'visual-accepted: current 1672x941 hybrid slots evidence exists at `.tmp/pc-visual-qa/draw-slots-hybrid-v2-1672x941.png`; after the local runner was fixed to scroll the target into view, clicking 确认签位编排 reached `step=result&format=hybrid` in `.tmp/pc-visual-qa/professional-draw-slots-hybrid-transition-v2.png`.' })
evidenceBySourceSuffix.set('抽签与分组-专业模式-分组结果.png', {
  buttonDestination: 'verified: return goes to the current tournament/division professional console; the schedule action carries the same divisionId to the schedule workspace.',
  flowTransition: 'verified: only the confirmed current-division draw configuration reaches this result state. It does not create matches, change rosters, or rewrite historical records; schedule generation remains a separate confirmation-gated flow.',
  visual: 'visual-accepted: `.tmp/pc-visual-qa/draw-result-v2-1672x941.png` at target viewport, with route-back evidence `.tmp/pc-visual-qa/draw-quick-result-back-route.png`.',
  build: 'verified: ProfessionalDrawFlow.vue result actions preserve tournamentId/divisionId and PC build passed.'
})

const verifiedScheduleEvidence = {
  flowTransition: 'verified: all schedule state is scoped to the route tournamentId and active divisionId. Draft wizard steps do not create matches; only generateSchedule is confirmation-gated. Manual changes use updateMatch and reload current-division data; locked/ongoing/finished matches reject quick adjustment.',
  build: 'verified: TournamentSchedule.vue binds current-division route state, validates wizard steps, calls generateSchedule only after confirmation, and uses updateMatch for manual saves; PC build passed on 2026-08-13.'
}
evidenceBySourceSuffix.set('赛程管理-赛程总览.png', { ...verifiedScheduleEvidence, buttonDestination: 'verified: 本地目标视口已实点“生成赛程”，从赛事级总览进入同一 tournamentId / divisionId 的编排工作台；继续编排、冲突和发布预览均保留当前赛事范围。', flowTransition: 'verified: 2026-08-13 本地 QA 点击生成赛程后地址变为 /tournaments/qa-tournament-2026/schedule?visualQa=1&divisionId=qa-division-u8&view=editor；未写入云端场次或发布状态。', visual: 'visual-accepted: 已复核批准素材包；1672 × 941 当前总览截图 `.tmp/pc-visual-qa/schedule-overview-recheck-1672x941-v1.png`，转场证据 `.tmp/pc-visual-qa/schedule-overview-generate-transition-1672x941-v1.png`。' })
evidenceBySourceSuffix.set('赛程管理-生成赛程-基础设置.png', { ...verifiedScheduleEvidence, buttonDestination: 'verified: 下一步 validates the current basic draft then moves only to venues; save draft stays local to current event configuration and back-to-draw preserves divisionId.', visual: 'visual-accepted: `.tmp/pc-visual-qa/schedule-basic-v6-1672x941.png` target capture.' })
evidenceBySourceSuffix.set('赛程管理-生成赛程-场地与时间.png', { ...verifiedScheduleEvidence, buttonDestination: 'verified: previous returns to basic; next validates current venue/time slots before rules; venue add/edit updates only the generation draft.', visual: 'visual-accepted: `.tmp/pc-visual-qa/schedule-venues-current-1672x941.png` target capture.' })
evidenceBySourceSuffix.set('赛程管理-生成赛程-编排规则.png', { ...verifiedScheduleEvidence, buttonDestination: 'verified: previous returns to venues and next moves to preview without writing matches; the rule link is scoped to the current division rules route.', visual: 'visual-accepted: `.tmp/pc-visual-qa/schedule-rules-current-1672x941.png` target capture.' })
evidenceBySourceSuffix.set('赛程管理-生成赛程-预览确认.png', { ...verifiedScheduleEvidence, buttonDestination: 'verified: previous returns to rules; confirm opens a confirmation gate and then calls generateSchedule with only current tournamentId/divisionId/configuration.', visual: 'visual-accepted: `.tmp/pc-visual-qa/schedule-preview-v2-1672x941.png` target capture.' })
evidenceBySourceSuffix.set('赛程管理-赛程编排工作台-v2.png', { ...verifiedScheduleEvidence, buttonDestination: 'verified: cards open scoped match edit; drag swaps are confirmation-gated and persist through updateMatch; modify-rules, conflict and publish-preview remain in the current workspace.', visual: 'visual-accepted: `.tmp/pc-visual-qa/schedule-workbench-current-1672x941.png` target capture.' })
evidenceBySourceSuffix.set('赛程管理-冲突检测.png', { ...verifiedScheduleEvidence, buttonDestination: 'verified: reopen check reloads current matches; a conflict opens its current match edit; complete returns to the workbench without auto-overwriting any match.', visual: 'visual-accepted: `.tmp/pc-visual-qa/schedule-conflicts-final-1672x941.png` target capture.' })
evidenceBySourceSuffix.set('赛程管理-手动修改场次-编辑弹窗.png', { ...verifiedScheduleEvidence, buttonDestination: 'verified: save calls updateMatch for the explicit matchId, reloads current-division matches and reopens conflict check when appropriate; cancel preserves prior record and input recovery.', visual: 'visual-accepted: `.tmp/pc-visual-qa/schedule-workbench-current-1672x941.png` target workbench capture includes the formal edit path.' })
evidenceBySourceSuffix.set('赛程管理-修改生成规则-影响确认弹窗.png', { ...verifiedScheduleEvidence, buttonDestination: 'verified: cancel removes only the confirmImpact query and returns to rules; confirmation is limited to the active division impact scope before any subsequent generateSchedule action.', visual: 'visual-accepted: `.tmp/pc-visual-qa/schedule-rule-impact-final-1672x941.png` target capture.' })

const verifiedRefereeEvidence = {
  flowTransition: 'verified: the H5 workflow is a server-controlled referee relation. visualQa is local-only; production calls serviceRefereeWorkflow and the server controls assignment, lock, return scope and review state.',
  build: 'verified: node --check service-account-h5/app.js passed; formal service-account-h5 workflow uses webLoginApi HTTP relay and no browser SDK.'
}
evidenceBySourceSuffix.set('05-专业版实时比分与事件记录.png', { ...verifiedRefereeEvidence, buttonDestination: 'verified: addRefereeEvent and finishRefereeMatch are submitted through runMatchAction only for the assigned current match; live locked/finished records cannot accept further writes.', visual: 'visual-accepted: `.tmp/h5-visual-qa/referee-live-852x1846-v1.png` target capture.' })
evidenceBySourceSuffix.set('06-专业版裁判报告.png', { ...verifiedRefereeEvidence, buttonDestination: 'verified: 保存报告 calls saveRefereeReportDraft with current matchId, then reloads the formal record into electronic confirmation.', visual: 'visual-accepted: `.tmp/h5-visual-qa/referee-report-852x1846-v1.png` target capture.' })
evidenceBySourceSuffix.set('07-专业版电子记录确认与签字.png', { ...verifiedRefereeEvidence, buttonDestination: 'verified: submit signature calls submitSignedRefereeRecord with current matchId and signature strokes; server response locks the record and enters review.', visual: 'visual-accepted: `.tmp/h5-visual-qa/referee-signature-852x1846-v1.png` target capture.' })
evidenceBySourceSuffix.set('08-专业版提交成功.png', { ...verifiedRefereeEvidence, buttonDestination: 'verified: submitted-record viewing stays read-only and return reloads the referee workbench; no score/event write control remains after signature submission.', visual: 'visual-accepted: `.tmp/h5-visual-qa/referee-success-852x1846-v1.png` target capture.' })
evidenceBySourceSuffix.set('09-专业版退回修正与重新签字.png', { ...verifiedRefereeEvidence, buttonDestination: 'verified: saveReturnedRecordCorrection stores only allowed correction fields; resubmitReturnedRecord sends a new signature for the same current match and returns it to review.', visual: 'visual-accepted: `.tmp/h5-visual-qa/referee-returned-852x1846-v1.png` target capture.' })

evidenceBySourceSuffix.set('球队管理-名单变更-专业版.png', {
  buttonDestination: 'verified：参赛球队入口保留当前 tournamentId、divisionId 与专业版模式；本地目标视口实测 goTeams 后进入 `/tournaments/qa-tournament-2026/teams?divisionId=qa-division-u16&mode=professional`。待审核记录的通过/驳回会打开对应申请的审核弹窗。',
  flowTransition: 'verified：列表与筛选始终限定在当前赛事/组别的名单变更请求；审核继续调用既有 reviewRosterChange 的服务端受控动作，保留申请、处理人及版本记录，不直接改写球队日常球员资料。',
  visual: 'visual-accepted：已核对批准素材包；1672 × 941 截图 `.tmp/pc-visual-qa/roster-changes-professional-final-v2.png`，复核了赛事栏、组别、五项页签、四项统计、锁定提示、筛选项、十二列表格和规则提示。',
  buildVerification: 'PC npm run build passed：2026-08-13；RosterChangeReview.vue。'
})

evidenceBySourceSuffix.set('球队管理-加入申请-专业版.png', {
    buttonDestination: 'verified：首条“查看”正式入口已迁移为 `/tournaments/qa-tournament-2026/teams/qa-app-team-1?divisionId=qa-division-u16`；旧 `/teams/:id` 路由已删除；批量通过与单条拒绝均使用受控服务端审核动作',
  flowTransition: 'verified：批量通过只包含 qa-application-1/3，并保护疑似同名 qa-application-2；回读 createdRoster=false、grantedOwnership=false、mergedByName=false、cloudWrite=false。拒绝只作用于当前参赛申请，preservedTeamProfile=true、deletedUser=false',
  visual: 'visual-1:1-passed：批准素材包已复核；1672 × 941 最终截图 `.tmp/pc-visual-qa/tournament-teams-professional-applications-final-v3.png`，12/3/8/1 指标、双入口说明、筛选/设置、三条申请、两条待认领与底部边界完整入屏；1440 × 900 回退截图 `.tmp/pc-visual-qa/tournament-teams-professional-applications-fallback-1440x900-v1.png` 无裁切或横向溢出',
  buildVerification: 'PC npm run build passed：2026-08-14，TournamentTeams.vue；UI delivery 162/162、零 SDK 与 git diff --check 通过'
})

evidenceBySourceSuffix.set('球队管理-查看球队-专业版.png', {
  buttonDestination: 'verified：真实点击“返回参赛球队”到 `/tournaments/qa-tournament-2026/teams?divisionId=qa-division-u16&mode=professional`；“查看参赛名单”到 `/tournaments/qa-tournament-2026/teams/qa-team-zhengzhou/roster?divisionId=qa-division-u16&mode=professional`，证据 `.tmp/pc-visual-qa/tournament-team-detail-professional-return-destination-v1.png` 与 `tournament-team-detail-professional-roster-destination-v1.png`',
  flowTransition: 'verified：赛事通知回读 tournamentId/divisionId/teamId、relationScoped=true、clubPrivateDataIncluded=false、cloudWrite=false；详情只读取赛事参赛关系和名单快照，不允许球队日常资料覆盖赛事历史，证据 `.tmp/pc-visual-qa/tournament-team-detail-professional-notice-scope-v1.png`',
  visual: 'visual-1:1-passed：批准素材包已复核；1672 × 941 最终截图 `.tmp/pc-visual-qa/tournament-team-detail-professional-final-v2.png`，五页签、球队关系摘要、三张赛事范围卡、23/23/0 名单指标、双操作、四步协作进度与隐私边界完整入屏；1440 × 900 回退截图 `.tmp/pc-visual-qa/tournament-team-detail-professional-fallback-1440x900-v1.png` 无裁切或横向溢出',
  buildVerification: 'PC npm run build passed：2026-08-14，TeamDetail.vue；UI delivery 162/162、零 SDK 与 git diff --check 通过'
})

evidenceBySourceSuffix.set('比赛管理-U8组-赛后资料接收与补充.png', {
  buttonDestination: 'verified：保存补充资料仅持久化当前 matchId 的 organizerSupplementNote / organizerSupplementFiles；提交复核实点进入 `/tournaments/qa-tournament-2026/match/qa-match-u8-012/review?divisionId=qa-division-u8`，保留当前组别。',
  flowTransition: 'verified：赛果、裁判团队和纸质记录均保持裁判端提交的只读来源；PC 只可补充附件和异常说明，失败时保留输入，不改写裁判签名、事件或赛中记录。',
  visual: 'visual-accepted：已核对批准素材包；1672 × 941 截图 `.tmp/pc-visual-qa/match-post-u8-recheck-before-v1.png`，复核了赛后资料页的赛事栏、场次、比分、裁判团队、纸质记录、补充材料、异常说明与底部动作。',
  buildVerification: 'PC npm run build passed：2026-08-13；MatchPostMatchReview.vue。'
})

evidenceBySourceSuffix.set('比赛管理-选择组别.png', {
  buttonDestination: 'verified：实点简易版 U8 “进入比赛管理”进入 `/tournaments/qa-tournament-2026/matches?divisionId=qa-division-u8`；实点专业版 U16 进入 `/tournaments/qa-tournament-2026/matches?divisionId=qa-division-u16`。',
  flowTransition: 'verified：筛选只改变当前赛事组别入口列表；每个入口只携带明确 tournamentId / divisionId，不按名称推断组别、权限或数据归属。专业版入口与简易版入口保持模式呈现差异。',
  visual: 'visual-accepted：已核对批准素材包；1618 × 972 截图 `.tmp/pc-visual-qa/match-management-entry-recheck-before-v1.png`，复核了赛事栏、状态筛选、五组别行、赛制/进度/待办与专业版突出样式。',
  buildVerification: 'PC npm run build passed：2026-08-13；TournamentMatchManagement.vue（本次仅复核，无新增页面代码）。'
})

evidenceBySourceSuffix.set('比赛管理-U8组-比赛列表.png', {
  buttonDestination: 'verified：实测“赛果复核”进入 `/tournaments/qa-tournament-2026/match/qa-match-u8-012/review?divisionId=qa-division-u8`；实测“查看详情”进入对应比赛详情并保留 `divisionId=qa-division-u8`。',
  flowTransition: 'verified：U8 比赛列表按当前赛事与组别加载；复核、补录、归档与详情动作均通过比赛唯一 ID 跳转，并完整保留组别上下文。',
  visual: 'visual-accepted：已核对批准素材包；1618 × 972 截图 `.tmp/pc-visual-qa/match-list-u8-after-route-fix-v1.png`，复核了赛事栏、状态筛选、U8 比赛卡片、裁判记录状态、赛后动作和页脚提示。',
  buildVerification: 'PC npm run build passed：2026-08-13；TournamentMatchManagement.vue。'
})

evidenceBySourceSuffix.set('比赛管理-U8组-实时监控.png', {
  buttonDestination: 'verified：实测“返回U8组比赛列表”回到 `/tournaments/qa-tournament-2026/matches?divisionId=qa-division-u8`；“刷新数据”只重读当前比赛记录，“联系裁判”仅在已有受控联系电话时发起系统电话能力。',
  flowTransition: 'verified：比赛、比分、事件、同步状态均从既有比赛记录和裁判端同步数据只读呈现；PC 页面没有赛中写入入口。',
  visual: 'visual-accepted：已核对批准素材包；1672 × 941 截图 `.tmp/pc-visual-qa/match-monitor-u8-initial-v1.png`，复核了比赛抬头、比分横幅、实时事件、执行状态、连接提示、四项指标与底部只读动作。',
  buildVerification: 'PC npm run build passed：2026-08-13；MatchLiveMonitor.vue。'
})

evidenceBySourceSuffix.set('比赛管理-U8组-赛果复核与归档.png', {
  buttonDestination: 'verified：实测“返回U8组比赛列表”回到 `/tournaments/qa-tournament-2026/matches?divisionId=qa-division-u8`；实测“发起资料复核”打开受控退回弹层。归档保留既有 `reviewRefereeRecord` 服务端受控入口，未用验收数据触发写入。',
  flowTransition: 'verified：裁判原始提交、事件、资料与签名保持只读；主办方只可保存本地复核草稿、限字段退回或经确认后调用服务端归档，归档后快照永久只读。',
  visual: 'visual-accepted：已核对批准素材包；1618 × 972 截图 `.tmp/pc-visual-qa/match-review-u8-final-v2.png`，复核了四步进度、比赛信息、比分、三栏复核区、资料归档区和底部审计动作。',
  buildVerification: 'PC npm run build passed：2026-08-13；MatchReviewWorkspace.vue。'
})

evidenceBySourceSuffix.set('比赛管理-U16组-比赛列表.png', {
  buttonDestination: 'verified：实测专业组赛中按钮展示为“查看现场进度”；监控、复核、归档和赛前安排均以比赛唯一 ID 跳转，并保留 `divisionId=qa-division-u16`。',
  flowTransition: 'verified：专业模式在当前赛事与 U16 组别内展示名单/阵容快照、电子记录、赛中只读监控和受控复核归档状态；名单未提交的场次不会越过赛前准备状态。',
  visual: 'visual-accepted：已核对批准素材包；1670 × 941 截图 `.tmp/pc-visual-qa/match-list-u16-initial-v1.png`，复核了专业组统计卡、筛选、名单/阵容、电子记录、状态与操作列。',
  buildVerification: 'PC npm run build passed：2026-08-13；TournamentMatchManagement.vue。'
})

evidenceBySourceSuffix.set('比赛管理-U16组-赛中只读监控.png', {
  buttonDestination: 'verified：实测“返回U16组比赛列表”回到 `/tournaments/qa-tournament-2026/matches?divisionId=qa-division-u16`；刷新只重读当前 matchId，PC 无赛中写入操作。',
  flowTransition: 'verified：专业赛中页仅呈现比赛快照、双方名单/阵容核验、官方电子事件记录、裁判执行状态和同步健康度；日常球队资料不能覆盖这些赛事快照。',
  visual: 'visual-accepted：已核对批准素材包；1671 × 941 截图 `.tmp/pc-visual-qa/match-monitor-u16-initial-v1.png`，复核了专业比分横幅、六项只读页签、三栏赛中信息和五项指标。',
  buildVerification: 'PC npm run build passed：2026-08-13；MatchLiveMonitor.vue。'
})

evidenceBySourceSuffix.set('比赛管理-U16组-赛果复核.png', {
  buttonDestination: 'verified：实测“返回U16组比赛列表”回到 `/tournaments/qa-tournament-2026/matches?divisionId=qa-division-u16`；实测“退回裁判修正”打开受控退回弹层，并仅提供事件球员字段范围。归档沿用既有 `reviewRefereeRecord` 服务端受控入口，未以验收数据触发写入。',
  flowTransition: 'verified：阵容快照、事件、裁判报告、电子记录和签字均为只读赛事证据；主办方只能受控退回或经确认后归档，归档后记录永久只读。',
  visual: 'visual-accepted：已核对批准素材包；1672 × 941 截图 `.tmp/pc-visual-qa/match-review-u16-initial-v1.png`，复核了赛事壳、专业比分横幅、五项证据页签、三栏证据区和底部归档动作。',
  buildVerification: 'PC npm run build passed：2026-08-13；MatchReviewWorkspace.vue。'
})

evidenceBySourceSuffix.set('比赛管理-U16组-比赛归档详情.png', {
  buttonDestination: 'verified：实测“返回比赛列表”回到 `/tournaments/qa-tournament-2026/matches?divisionId=qa-division-u16`；“导出电子记录”生成 `U16-013-电子记录归档.csv` 且路由不变；“查看审计日志”只读展示归档轨迹。',
  flowTransition: 'verified：归档后的比分、阵容、事件、报告、签字和审计摘要均只读；导出和审计查看不触发任何比赛数据写入。',
  visual: 'visual-accepted：已核对批准素材包；1671 × 941 截图 `.tmp/pc-visual-qa/match-archive-u16-initial-v1.png`，复核了归档结论、三栏证据、电子记录、签字、审计及底部只读动作。',
  buildVerification: 'PC npm run build passed：2026-08-13；MatchReviewWorkspace.vue。'
})

evidenceBySourceSuffix.set('竞赛管理-U16组-专业版-步骤1-赛制结构.png', {
  buttonDestination: 'verified：实测“保存并进入参赛资格”保留当前 tournamentId/divisionId 并进入 `rules?step=eligibility`；未再错误写入简易版 `step=rules`。验收环境写入由本地视觉夹具承接，未触发生产数据修改。',
  flowTransition: 'verified：U16 专业版固定六步：赛制结构 → 参赛资格 → 比赛执行 → 积分排名 → 晋级规则 → 规则定版；各步仅保存当前组别草稿，未定版不发布且不回写历史比赛快照。',
  visual: 'visual-accepted：批准素材包已复核；1672 × 941 截图 `.tmp/pc-visual-qa/division-rules-u16-format-overlay-v1.png` 已核对专业六步结构、四类赛制、三栏赛制配置、结构摘要及固定下一步动作；下拉选中值已恢复可见且不遮挡真实控件。',
  buildVerification: 'PC npm run build passed：2026-08-13；DivisionRulesWizard.vue。'
})

evidenceBySourceSuffix.set('竞赛管理-U16组-专业版-步骤2-参赛资格.png', {
  buttonDestination: 'verified：实测“保存并进入比赛执行”保留当前 tournamentId/divisionId 并进入 `rules?step=execution`；“上一步”保留当前组别回到 `step=format`。验收环境写入由本地视觉夹具承接，未触发生产数据修改。',
  flowTransition: 'verified：年龄、名单、证件与资格开关仅保存当前专业组别草稿；赛事名单准入不改写球队长期球员资料，也不覆盖单场出场名单或历史比赛快照。',
  visual: 'visual-accepted：批准素材包已复核；1672 × 941 截图 `.tmp/pc-visual-qa/division-rules-u16-eligibility-v2.png` 已核对赛事壳、六步进度、四张资格卡、报名锁定、核验开关、四项资格摘要与固定上下步动作。',
  buildVerification: 'PC npm run build passed：2026-08-13；DivisionRulesWizard.vue。'
})

evidenceBySourceSuffix.set('竞赛管理-U16组-专业版-步骤3-比赛执行.png', {
  buttonDestination: 'verified：实测“保存并进入积分排名”保留当前 tournamentId/divisionId 并进入 `rules?step=ranking`；上一步保留当前组别回到 `step=eligibility`。验收环境写入由本地视觉夹具承接，未触发生产数据修改。',
  flowTransition: 'verified：比赛时长、换人、纪律与现场执行规则只保存当前专业组别草稿；不绕过裁判现场记录、赛后复核或赛事授权，主办方不在此页获得执法工作台。',
  visual: 'visual-accepted：批准素材包已复核；1672 × 941 截图 `.tmp/pc-visual-qa/division-rules-u16-execution-v3.png` 已核对赛事壳、六步进度、执行提示、三张执行卡、红黄牌纪律、裁判执行摘要、规则摘要与固定上下步动作。',
  buildVerification: 'PC npm run build passed：2026-08-13；DivisionRulesWizard.vue。'
})

evidenceBySourceSuffix.set('竞赛管理-U16组-专业版-步骤4-积分排名.png', {
  buttonDestination: 'verified：实测“保存并进入晋级规则”保留当前 tournamentId/divisionId 并进入 `rules?step=advancement`；上一步保留当前组别回到 `step=execution`。验收环境写入由本地视觉夹具承接，未触发生产数据修改。',
  flowTransition: 'verified：胜平负积分、同分顺序、弃权与排名发布规则只保存当前专业组别草稿；不得改写已归档比赛赛果快照或跨组别排名。',
  visual: 'visual-accepted：批准素材包已复核；1671 × 941 截图 `.tmp/pc-visual-qa/division-rules-u16-ranking-v3.png` 已核对赛事壳、六步进度、积分设置、七级同分顺序、排名示例、规则核验摘要与固定上下步动作。',
  buildVerification: 'PC npm run build passed：2026-08-13；DivisionRulesWizard.vue。'
})

evidenceBySourceSuffix.set('球队管理-发送认领提醒-专业版.png', {
  buttonDestination: 'static-verified：参赛球队行“发送认领提醒”进入当前 tournamentId/divisionId/tournamentTeamId 的 `action=claim-invite`；正式弹层经 organizerClaimInvite 创建/复用真实 team_invitations 后复制 inviteId 链接或下载小程序码，取消/关闭仅移除 action 并返回同一专业版球队列表。按当前任务要求未启动预览，未执行真实点击。',
  flowTransition: 'static-verified：邀请创建由服务端校验当前机构、赛事、组别和参赛关系，认领路径固定为 `/pages/team/prebuilt-invite/prebuilt-invite?inviteId=:inviteId`；PC 仅准备链接/小程序码，不直接向指定微信发卡，不确认认领，不按名称合并球队。微信身份或归属冲突继续进入小程序人工核验；资料完善提醒只在认领建立账号关系后发生。',
  visual: 'visual-accepted：1672 × 941 目标截图 `.tmp/pc-visual-qa/claim-invite-target-1672x941-v5.png` 与 1440 × 900 回退截图 `.tmp/pc-visual-qa/claim-invite-fallback-1440x900-v3.png` 已生成；707 × 671 弹层的球队摘要、参赛编号、联系人、上次分享、双分享方式、有效期、认领路径、代码生成二维码和三按钮操作与批准原型一致，两个视口均无横向溢出。QA 路径只写本地隔离状态，不调用云函数、不创建邀请或绑定关系。',
  buildVerification: 'PC npm run build passed：2026-08-15；TournamentTeams.vue 正式 claim-invite 路由状态已编译；邀请尚未生成时不再对空字符串绘制二维码，只有真实 claimInvitePath 存在才渲染二维码，否则显示生成中/待生成占位；organizerClaimInvite 现在再次校验参赛关系/球队的 orgId 或 organizationId，按 organizerOrgId 限定待复用邀请，并将小程序码环境值限制为 develop/trial/release、生产默认 release；云函数已通过 COS 强制更新并读回 Nodejs18.15/Active，ModTime 2026-08-14 20:32:28；本次 /admin/ 193 个文件已上传，TournamentTeams-DGv1PH16.js 公网 HTTP 200 且 SHA-256 与本地一致；无会话 webLoginApi.callFunction 探针返回 HTTP 200 + AUTH_REQUIRED；浏览器依赖未引入 @cloudbase/js-sdk，静态作用域和 git diff --check 通过。'
})

evidenceBySourceSuffix.set('03-家长服务页/01-家长进入-匹配孩子.png', {
  buttonDestination: 'static-verified：有效 `parentInvite` 先调用 webLoginApi.previewParentProfileInvite，仅展示令牌绑定的唯一球员；“这是我的孩子，开始补充”在已有家长会话时进入基础资料，未授权时进入 parentProfileOAuthUrl → 服务号 OAuth；无效、过期或断裂邀请停在可重试错误页。“联系球队负责人核对邀请”只给出联系提示，不创建球员或绕过令牌。按当前任务要求未启动预览，未执行真实点击。',
  flowTransition: 'static-verified：邀请预览不提交或覆盖资料；OAuth 回调通过一次性 state 建立 parentSessionToken，后续敏感资料操作继续由服务端会话鉴权。页面不提供姓名/手机号搜索、整队名单或管理权限；原型中的新登记动作因无受控后端且与唯一邀请边界冲突，按已确认规则收敛为联系球队负责人重新核对。',
  visual: 'visual-accepted：批准原图 852 × 1846；目标完整长页 `.tmp/h5-visual-qa/01-match-target-full-2x-v5.png` 为 852 × 1882，回退完整长页 `.tmp/h5-visual-qa/01-match-fallback-390-full-2x-v2.png` 为 780 × 1894。1/5 头部、隐私提示、手机号、唯一孩子卡、确认动作、未匹配处理和入口边界已对照，390px 视口无横向溢出。',
  buildVerification: 'static checks passed：2026-08-14；node --check service-account-h5/app.js、CSS 花括号配对、零 SDK 扫描、令牌/OAuth/parentSessionToken 链路检查与 git diff --check 通过。'
})

evidenceBySourceSuffix.set('03-家长服务页/02-确认基础资料.png', {
  buttonDestination: 'static-verified：仅持有效 parentSessionToken 的家长会话可读取草稿；“信息无误，下一步”提交姓名、出生日期、监护关系和授权确认到 saveParentBasicProfile，一致时进入实名步骤，不一致时停在人工核验；返回和“返回重新匹配”重新读取当前 parentInvite，不跨球员或球队。按当前任务要求未启动预览，未执行真实点击。',
  flowTransition: 'static-verified：监护关系新增为 father/mother/other 受控草稿字段；服务端仍用邀请绑定的姓名和出生日期判断 needsManualReview。更正请求不直接覆盖长期球员库、赛事名单、阵容或历史比赛快照，人工核验完成前不能继续实名。',
  visual: 'visual-accepted：批准原图 853 × 1844；目标完整长页 `.tmp/h5-visual-qa/02-basic-target-full-2x-v5.png` 为 854 × 1844，回退完整长页 `.tmp/h5-visual-qa/02-basic-fallback-390-full-2x-v2.png` 为 780 × 1844。2/5 头部、只读基础资料、更正区、监护关系、手机号、授权确认、人工核验提示与双底部动作已对照，390px 视口无横向溢出。',
  buildVerification: 'local static checks passed：2026-08-14；node --check service-account-h5/app.js、node --check cloudfunctions/webLoginApi/index.js、CSS 结构、零 SDK 和 UI delivery gate 通过。guardianRelation 云函数已于 2026-08-14 通过 COS 更新并完成线上读回；无会话探针返回 PARENT_AUTH_REQUIRED，真实会话仍待验证。'
})

evidenceBySourceSuffix.set('03-家长服务页/03-上传身份证实名.png', {
  buttonDestination: 'static-verified：仅完成基础资料且持有效 parentSessionToken 的家长可进入；“拍摄身份证（推荐）”调用后置摄像头文件入口，“从相册选择”调用独立相册入口；选择合法人像面后“上传并开始识别”依次调用 uploadParentIdentityDocument(front) 与 submitParentIdentityVerification，成功进入实名结果，失败留在原页重试；返回仅回到当前邀请的基础资料。按当前任务要求未启动预览，未执行真实点击或真实证件上传。',
  flowTransition: 'static-verified：批准原型已收敛为球员本人身份证人像面一张，不再错误强制正反两面；前端只在本次页面内存中短暂读取 JPG/PNG，限制 3MB，上传成功即清空文件引用，不生成本地预览或公开链接。服务端经家长会话与 basicConfirmed/guardianAuthorized 双门禁写入 restricted/parent-identity，持久化 fileId、SHA-256、大小、类型和审核状态，不把身份证号明文写入草稿；球队和裁判不通过此接口读取原图。',
  visual: 'visual-accepted：批准原图 853 × 1844；目标完整长页 `.tmp/h5-visual-qa/03-identity-target-full-2x-v5.png` 为 854 × 1892，回退完整长页 `.tmp/h5-visual-qa/03-identity-fallback-390-full-2x-v2.png` 为 780 × 1920。3/5 头部、实名边界、人像面代码示意、上传状态、拍摄和相册入口、拍摄要求、隐私说明与禁用状态已对照，未使用真实身份证图，390px 视口无横向溢出。',
  buildVerification: 'local static checks passed：2026-08-15；node --check service-account-h5/app.js、node --check cloudfunctions/webLoginApi/index.js、CSS 563/563 花括号配对、零 @cloudbase/js-sdk 扫描和 162/162 UI delivery gate 通过。uploadParentIdentityDocument 与 submitParentIdentityVerification 现均复核 active 邀请，提交接口额外复核 basicConfirmed/guardianAuthorized；无会话探针分别返回 PARENT_AUTH_REQUIRED，invalid invite preview 返回 PARENT_INVITE_INVALID。webLoginApi 已通过 COS 更新并读回 Nodejs18.15、modifyTime 2026-08-15 07:34:37、Deployment completed；未使用真实会话、证件或资料写入。'
})

evidenceBySourceSuffix.set('03-家长服务页/04-实名认证结果.png', {
  buttonDestination: 'static-verified：getParentIdentityVerification 只读取当前 parentSessionToken 绑定邀请的核验记录；pending_review 仅显示“刷新审核状态”，rejected 仅显示原因并返回身份证人像面重传，not_started 返回上传页，approved 才显示“下一步：拍摄球员形象照”。“信息有误，申请更正”经确认后调用 requestParentIdentityCorrection，重复开放申请幂等返回，不直接修改实名结论。按当前任务要求未启动预览，未执行真实点击或云端写入。',
  flowTransition: 'static-verified：审核通过/退回状态只能读取服务端 parent_identity_verifications，家长端没有批准或驳回写入口。通过页只返回姓名、球队、脱敏证件号、核验生日、性别、资格文字、审核时间和证件已受限保存布尔值，不返回 documentIds、fileId、原图、Base64 或身份证号明文；更正申请独立写入 open 工单，不覆盖球员、赛事名单、阵容、实名记录或历史快照。',
  visual: 'visual-accepted：批准原图 853 × 1844；目标完整长页 `.tmp/h5-visual-qa/04-result-target-full-2x-v5.png` 为 854 × 1858，回退完整长页 `.tmp/h5-visual-qa/04-result-fallback-390-full-2x-v2.png` 为 780 × 1858。结果头部、状态盾牌、脱敏认证信息、受限证件占位、复用说明、审核时间与分支动作已对照；按素材边界不展示证件缩略图，390px 视口无横向溢出。',
  buildVerification: 'local static checks passed：2026-08-14；node --check service-account-h5/app.js、node --check cloudfunctions/webLoginApi/index.js、CSS 628/628 花括号配对、零 @cloudbase/js-sdk、客户端敏感字段扫描和 162/162 UI delivery gate 通过。结果摘要与更正申请规则已于 2026-08-14 通过 COS 更新并完成线上读回；无会话探针返回 PARENT_AUTH_REQUIRED，真实会话仍待验证。'
})

evidenceBySourceSuffix.set('03-家长服务页/05-标准形象照拍摄指引.png', {
  buttonDestination: 'static-verified：只有 approved 实名结果页的 portraitNext 能进入拍摄指引；“立即拍摄标准形象照（推荐）”和“从相册选择已有照片”分别进入受控取景页的摄像头/相册模式；返回回到实名认证结果。取景页上传前校验 JPG/PNG 与 3MB，上传/分割失败留在原页重试，上传成功才进入透明效果确认。按当前任务要求未启动预览，未执行真实点击、真实照片上传或云端写入。',
  flowTransition: 'static-verified：页面不使用原型中的真实儿童示例图，标准示例、取景框和距离过近/头像裁切/光线太暗错误示意均由正式代码绘制。生产链路仍由 uploadAndProcessParentPortrait 服务端再次校验 parentSessionToken 与 parent_identity_verifications.status=approved；原图和透明派生图走 restricted/parent-portraits，不生成公开资源，不覆盖历史头像或赛事快照。',
  visual: 'visual-accepted：批准原图 853 × 1844；目标完整长页 `.tmp/h5-visual-qa/05-guide-target-full-2x-v6.png` 为 854 × 1844，回退完整长页 `.tmp/h5-visual-qa/05-guide-fallback-390-full-2x-v2.png` 为 780 × 1844。4/5 头部、标准示例代码示意、四项要求、三类错误、球衣建议与相机和相册入口已对照；按素材边界不使用儿童示例原图，390px 视口无横向溢出。',
  buildVerification: 'local static checks passed：2026-08-14；node --check service-account-h5/app.js、CSS 701/701 花括号配对、前端照片类型/大小校验、零 @cloudbase/js-sdk 和 162/162 UI delivery gate 通过。形象照链路已于 2026-08-14 通过 COS 更新并完成线上读回；无会话探针返回 PARENT_AUTH_REQUIRED，真实会话仍待验证。'
})

evidenceBySourceSuffix.set('03-家长服务页/06-标准形象照取景框.png', {
  buttonDestination: 'static-verified：拍摄指引的摄像头入口进入正式相机壳；中央快门和左下角相册缩略入口都受 JPG/PNG、3MB 校验，选择后自动调用 uploadAndProcessParentPortrait，成功进入透明效果确认，失败留在取景页并恢复重拍；返回回到拍摄指引。相机帮助、静音和翻转仅改变当前 UI/提示，不改变照片或账号状态。按当前任务要求未启动预览，未执行真实点击、真实照片上传或云端写入。',
  flowTransition: 'static-verified：服务端先验证 parentSessionToken 与 parent_identity_verifications.status=approved，再将原图写入 restricted/parent-portraits 并调用既有受控人像分割；失败记录 processing_failed 和原因，成功同时保存受限 rawFileId/transparentFileId 与 ready_for_confirmation 状态。前端不把相机舞台、原型人物截图或真实儿童照片作为生产素材，透明派生图待下一节点确认后才可成为当前版本。',
  visual: 'visual-accepted：批准原图 853 × 1844；目标完整长页 `.tmp/h5-visual-qa/06-camera-target-full-2x-v5.png` 为 854 × 1912，回退完整长页 `.tmp/h5-visual-qa/06-camera-fallback-390-full-2x-v2.png` 为 780 × 1940。深色相机顶栏、轮廓取景区、四角框、四项质量状态、质量提示、缩略图、快门、翻转控制和隐私说明已对照；取景框由代码渲染且不使用静态人物截图，390px 视口无横向溢出。',
  buildVerification: 'local static checks passed：2026-08-14；node --check service-account-h5/app.js、node --check cloudfunctions/webLoginApi/index.js、CSS 767/767 花括号配对、照片类型/大小校验、零 @cloudbase/js-sdk 和 162/162 UI delivery gate 通过。形象照上传链路已于 2026-08-14 通过 COS 更新并完成线上读回；无会话探针返回 PARENT_AUTH_REQUIRED，真实会话仍待验证。'
})

evidenceBySourceSuffix.set('03-家长服务页/07-人像分割与效果确认.png', {
  buttonDestination: 'static-verified：uploadAndProcessParentPortrait 成功后进入透明效果确认；“重新生成”或“重新拍摄”返回受控取景页并创建新处理版本；“确认使用这两张照片”调用 confirmParentPortrait，成功后再调用 completeParentProfile 进入提交成功页，失败留在当前页可重试。按当前任务要求未启动预览、未执行真实照片处理或云端写入。',
  flowTransition: 'static-verified：页面只消费服务端真实透明 PNG；无真实结果时仅显示本地验收占位，不伪造人物素材。标准形象照与球员头像来自同一派生图，头像裁切支持拖动、缩放和恢复默认，参数只存在当前页面内存；服务端按 parentInvite、approved 实名版本和 portraitId 校验，处理记录带 version/processingStatus，确认当前版本前将既有 confirmed 版本标为 superseded，原图、派生图和历史快照不被覆盖。',
  visual: 'visual-accepted：批准原图 851 × 1849；目标完整长页 `.tmp/h5-visual-qa/07-confirm-target-full-2x-v5.png` 为 852 × 1890，回退完整长页 `.tmp/h5-visual-qa/07-confirm-fallback-390-full-2x-v2.png` 为 780 × 1890。5/5 头部、分割完成状态、标准形象照卡、头像裁切卡、缩放拖动恢复、圆形方形预览与双操作已对照；无真实结果时只显示受限占位，不伪造透明人物，390px 视口无横向溢出。',
  buildVerification: 'local static checks passed：2026-08-15；node --check service-account-h5/app.js、node --check cloudfunctions/webLoginApi/index.js、CSS 924/924 花括号配对、头像裁切主框与圆形/方形预览同步、零 @cloudbase/js-sdk 检查、结果 URL 白名单校验和 162/162 UI delivery gate 通过。更新后的 service-account-h5/ 4 个文件已上传 /service-account-h5/；公网 app.js HTTP 200，原始字节 SHA-256 与本地一致（8E4E25EADAB03C91617CA2E5D05C879E0D4B43580D9CA3A1712729ECA9774061），无会话探针返回 PARENT_AUTH_REQUIRED，真实会话仍待验证。'
})

evidenceBySourceSuffix.set('03-家长服务页/08-资料提交成功.png', {
  buttonDestination: 'static-verified：completeParentProfile 成功后进入资料提交成功页；“完成并关闭”结束服务号流程，“查看已提交资料”定位本次提交清单；不提供重复提交入口。按当前任务要求未启动预览、未执行真实照片处理或云端写入。',
  flowTransition: 'static-verified：页面只消费完成接口返回的 submitted 状态、公开球员/球队摘要和当前会话内透明 PNG；状态明确为家长已提交、待球队负责人确认、未进入正式参赛名单。四项完成清单来自后端门禁：基础资料、实名通过、标准形象照、球员头像；实名原件、原图、fileId、赛事名单和历史快照不在页面返回或展示范围内，球队确认不会覆盖历史快照。完成提交前服务端再次校验 active 邀请仍指向同一球员和球队，关系变化时返回 PARENT_INVITE_BROKEN 且不写入球员。',
  visual: 'visual-accepted：批准原图 852 × 1846；目标完整长页 `.tmp/h5-visual-qa/08-success-target-full-2x-v5.png` 为 852 × 1886，回退完整长页 `.tmp/h5-visual-qa/08-success-fallback-390-full-2x-v2.png` 为 780 × 1886。球场头部、成功状态、四项完成清单、受限资料预览、状态轨迹、两条说明与完成和查看动作已对照；按隐私边界不使用原型儿童图，390px 视口无横向溢出。',
  buildVerification: 'local static checks passed：2026-08-14；node --check service-account-h5/app.js、node --check cloudfunctions/webLoginApi/index.js、CSS 916/916 花括号配对、零 @cloudbase/js-sdk、客户端敏感文件 ID 扫描、结果 URL 白名单校验和 162/162 UI delivery gate 通过。completeParentProfile 现包含邀请关系二次校验并已于 2026-08-14 21:26:40 通过 COS 更新、线上读回 Nodejs18.15/index.main/Deployment completed；无会话探针返回 PARENT_AUTH_REQUIRED，真实会话仍待验证。'
})

function readBoard() {
  const sandbox = { window: {} }
  vm.runInNewContext(fs.readFileSync(boardFile, 'utf8'), sandbox, { filename: boardFile })
  return sandbox.window.BOARD_DATA
}

function resolveRoute(sourcePath) {
  const normalized = sourcePath.replaceAll('\\', '/')
  for (const [suffix, route] of routeBySourceSuffix) {
    if (normalized.endsWith(suffix)) return route
  }
  return ''
}

function resolveEvidence(sourcePath) {
  const normalized = sourcePath.replaceAll('\\', '/')
  let matchedEvidence = null
  for (const [suffix, evidence] of evidenceBySourceSuffix) {
    if (normalized.endsWith(suffix)) matchedEvidence = evidence
  }
  return matchedEvidence || { buttonDestination: 'pending', flowTransition: 'pending', visual: 'pending', build: 'pending' }
}

function packageInfo(sourcePath) {
  const source = path.resolve(path.dirname(boardFile), sourcePath)
  const parsed = path.parse(source)
  const assetDir = path.join(parsed.dir, `${parsed.name}_assets`)
  const manifestFile = path.join(assetDir, 'manifest.json')
  if (!fs.existsSync(manifestFile)) {
    return { source, assetDir, screen: null, status: 'missing' }
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
    return {
      source,
      assetDir,
      screen: manifest.screen || null,
      status: manifest.status || 'preparing',
      approvedAt: manifest.approved_at || ''
    }
  } catch (error) {
    return { source, assetDir, screen: null, status: 'invalid', error: error.message }
  }
}

function collectNodes(board) {
  const rows = []
  for (const section of board.sections || []) {
    for (const group of section.groups || []) {
      for (const [index, node] of (group.nodes || []).entries()) {
        const asset = packageInfo(node.path)
        const evidence = resolveEvidence(node.path)
        rows.push({
          nodeId: `${section.index || section.id}:${group.id || group.title}:${index + 1}`,
          section: `${section.index || section.id} · ${section.title}`,
          group: group.title || '',
          label: node.label,
          type: node.type,
          source: asset.source,
          viewport: asset.screen,
          assetPackage: asset.assetDir,
          assetStatus: asset.status,
          approvedAt: asset.approvedAt || '',
          formalRoute: resolveRoute(node.path),
          behavior: node.logic || '',
          buttonDestination: evidence.buttonDestination,
          flowTransition: evidence.flowTransition,
          visual: evidence.visual,
          build: evidence.build || evidence.buildVerification || 'pending'
        })
      }
    }
  }
  return rows
}

const board = readBoard()
const nodes = collectNodes(board)
for (const node of nodes) {
  const normalizedSource = String(node.source || '').replaceAll('\\', '/')
  if (normalizedSource.includes('/03-家长服务页/08-资料提交成功.png')) {
    node.build = `${node.build || 'static verification pending'} Static H5 uploaded 2026-08-14 to /service-account-h5/; public HTTP GET returned 200 for index.html and app.js. webLoginApi code updated 2026-08-14 via COS; fn list readback shows modifyTime 2026-08-14 16:45:30 and Deployment completed. No-session parent probes return PARENT_AUTH_REQUIRED, so the new backend code is live and real parent session verification remains pending.`
  }
}
for (const node of nodes) {
  if (String(node.formalRoute || '').includes('action=claim-invite')) {
    node.build = `${node.build || 'static verification pending'} Admin static build uploaded 2026-08-14 to /admin/; public HTTP GET returned 200 for the admin entry. organizerClaimInvite now enforces tenant-boundary checks and whitelists the mini-program code environment with production default release; deployed via COS and read back Nodejs18.15/Active at 2026-08-14 20:32:28; no-session webLoginApi.callFunction returns HTTP 200 + AUTH_REQUIRED. TournamentTeams now refuses a missing/changed tournamentTeamId instead of falling back to another row, ignores stale invite responses after route changes, and retries the new relation after an in-flight request settles; npm run build passed and the uploaded TournamentTeams-pvYlQgRn.js chunk SHA-256 matches local 929116A2B8D65E910E08A535EC6DA5FB34F741073562026DDEE5EC4D33F355F9 at saixiaofeng.com/admin/. No visual preview was performed, so the node remains visual-review.`
  }
}
for (const node of nodes) {
  const normalizedSource = String(node.source || '').replaceAll('\\', '/')
  if (normalizedSource.includes('/03-家长服务页/')) {
    node.build = `${node.build || 'static verification pending'} CloudBase function config and code updated 2026-08-14 22:41:45 (Nodejs18.15/index.main/60s) via COS; fn list readback reports webLoginApi modifyTime 2026-08-14 22:41:45 and Deployment completed. Ten protected parent actions return HTTP 200 + PARENT_AUTH_REQUIRED without a session, while invalid invite preview returns HTTP 200 + PARENT_INVITE_INVALID; parentApi now sends the current invite token and the backend rejects a session bound to another invite with PARENT_INVITE_MISMATCH. Static H5 app.js uploaded to /service-account-h5/ and read back HTTP 200 with SHA-256 E44C311A1F0E92B0113D6A9688A9D402A06C327C49427C8329DA5500AC9B318A. No real parent session, identity material or portrait write was exercised. Backend code is live; real parent session verification remains pending.`
  }
}
for (const node of nodes) {
  if (String(node.formalRoute || '').includes('/pages/team/data-package')) {
    node.build = `${node.build || 'static verification pending'} getMiniWorkspace now stamps team data-package requests with the active workspace orgId, not the legacy users.orgId field, and reads packages inside the same org boundary; deployed readback 2026-08-14 19:30:55 reports Nodejs18.15 / Deployment completed.`
  }
}
for (const node of nodes) {
  if (String(node.formalRoute || '').includes('/pages/team/members/members')) {
    node.build = `${node.build || 'static verification pending'} Team member invitations now land on the registered /pages/team/members/members route with a memberInviteId, use teamMemberInvite/acceptTeamMemberInvite for authenticated preview and explicit acceptance, stamp orgId and a seven-day expiry, and no longer point to the missing /pages/team/member-invite route; backend and page syntax checks passed. getMiniWorkspace deployed readback 2026-08-14 19:43:50 reports Nodejs18.15 / Deployment completed; no real invitation was created or accepted.`
  }
}
for (const node of nodes) {
  if (String(node.formalRoute || '').includes('/pages/team/player-add/player-add')) {
    node.build = `${node.build || 'static verification pending'} The registered player-add route now supports edit mode as well as three-field creation: team.manage is rechecked server-side, the player is scoped by workspace/team/playerId, duplicate name+birthDate checks exclude the current record, and edits only update the long-term player profile fields. The old /pages/team/player-edit route and legacy player-detail edit link were removed from the formal flow; getMiniWorkspace deployed readback 2026-08-14 19:56:50 reports Nodejs18.15 / Deployment completed. No roster, lineup, or historical snapshot is overwritten.`
  }
}
const summary = nodes.reduce((acc, node) => {
  acc.total += 1
  acc.byType[node.type] = (acc.byType[node.type] || 0) + 1
  acc.byAssetStatus[node.assetStatus] = (acc.byAssetStatus[node.assetStatus] || 0) + 1
  if (node.formalRoute) acc.routed += 1
  return acc
}, { total: 0, routed: 0, byType: {}, byAssetStatus: {} })

const verificationNotes = [
  '2026-08-19 20:10:30 用户确认独立公众大屏方案A且第一阶段只做专业版抽签。新增 prototype-pages/screen-draw 七状态原型与确认板；1920×1080 和 1366×768 均无横向溢出，确认板审计1区段、7页面、0缺页、0缺逻辑、PASS。七个_assets包均验证通过并保持 awaiting-user-confirmation，尚未计入162个已批准正式节点，未开始正式大屏应用或公开快照接口。',
  '2026-08-19 19:37:47 新增 docs/SCREEN_PRODUCT_DECISION_PROPOSAL.md，提供独立公众大屏应用、PC 公开路由、暂缓三种待确认方案，推荐独立应用第一阶段只覆盖专业版抽签；定义公开快照白名单、敏感字段禁入、发布撤回过期、不可预测令牌、统一 HTTP 入口和审计要求。未升级为已确认规则，未开始实现或发布。',
  '2026-08-19 19:32:59 赛事大屏真实阻塞修正：当前仓库只有 ProfessionalDrawFlow 后台大屏设置/预览与 screen.sxffootball.cn/draw/:tournamentId 链接生成器，没有独立公开大屏应用、公开路由或匿名只读数据接口。已验收节点是后台大屏设置，不能替代公众大屏实现；除 DNS/证书外仍需确认大屏产品范围和公开数据授权方案。',
  '2026-08-19 19:27:41 新增 tools/check-production-readiness.ps1，只读检查三个域名、setHeadReferee 无会话门禁和裁判通知 configurationStatus；不发送通知、不读取通知队列、不写业务数据、不打印凭据。当前结果 coreWeb=true，refereeNotification=false，apexCompatibility=false，screen=false，full=false。',
  '2026-08-19 19:20:57 新增 docs/PRODUCTION_EXTERNAL_CONFIGURATION.md，统一记录微信开放平台回调域、校验文件、PC 回调路径、裁判服务号必需环境变量、模板字段映射、HMAC 中转门禁、根域名与赛事大屏 DNS/证书完成条件，以及当前未发布候选范围。文档不含任何 AppSecret、令牌、API Key 或模板真实值；本轮未部署、未提交审核、未发布。',
  '2026-08-19 19:17:24 未发布候选包字节级清单：官网根 index.html 与线上 SHA-256 一致；小程序、云函数和根入口无本轮源码差异。PC 候选为 web-admin-vue/dist 193 文件、32,884,809 bytes，本地 admin/index.html SHA-256 828FF2773AC3A62CAEC754D80F0E8A9C14C77EA2143141E5D7F858F1335010C0，本地入口 assets/index-C39Tq-pa.js SHA-256 928642C7C3BA2790D30D1E0A04011FD9BBE823D090F309E21EE976C304C9BE86，本地 TournamentTeams-CzynxcSC.js SHA-256 29667AFA4821A93B833206BBD14658C1CED8F8CDEBB5F49C88D609930C73F335；后续因哈希资源图变化需完整上传 /admin/。家长 H5 index.html 与线上一致，仅 app.js 和 styles.css 不同。用户禁止提交审核和发布，本轮未上传候选文件。',
  '2026-08-19 19:10:24 外部配置只读复核：正式线上 LoginView 分包含 www.sxffootball.cn 与 /admin/#/wechat-callback，WechatCallbackView 分包含 webLoginApi HTTP 入口，两者均无浏览器 CloudBase SDK；微信开放平台后台仍需管理员确认回调域。sendRefereeTemplateMessages.configurationStatus 返回 configured:false、results:[]，缺少 SERVICE_ACCOUNT_APP_ID、SERVICE_ACCOUNT_APP_SECRET、SERVICE_ACCOUNT_REFEREE_TEMPLATE_ID、SERVICE_ACCOUNT_H5_URL，未读取通知队列或发送消息。www 域名 CNAME 正常且 HTTPS 200；根域名无网站 HTTPS；screen.sxffootball.cn 无 CNAME/A/HTTPS。本轮未部署、未提交审核、未发布。',
  '2026-08-19 19:03:17 全量原型视觉截图验收完成：PC 专业版认领邀请弹层与家长 H5 01-08 共 9 个节点完成目标/回退视口截图并转为 visual-accepted；严格门禁为 162/162、视觉待执行 0、visual-1:1 通过。PC 1672×941 与 1440×900 均无横向溢出；H5 目标完整长页与批准原图高度差为 0%–3.7%，390px 回退长页全部无横向溢出。儿童、身份证和透明人像按素材包隐私边界使用代码示意或受限占位；本地 QA 不调用云函数、不创建邀请、不写真实资料。PC 构建、Node 语法、11 区段/162 页画板审计和 git diff --check 通过。用户当前禁止提交审核和发布，因此本轮未上传生产静态包。',
  '2026-08-19 18:26:20 用户明确允许预览和截图验收，仍禁止提交小程序审核和发布。当前 162/162 静态交付门禁通过，严格视觉待验收为 9 个节点：PC 专业版球队认领邀请弹层 1 个、家长服务号 H5 01-08 共 8 个；后续只有完成目标/回退视口截图比较并消除阻断和主要差异后才改为 visual-accepted。www.sxffootball.cn 四个正式入口已上线；webLoginApi.setHeadReferee 已读回 Nodejs18.15 / Deployment completed / modifyTime 2026-08-18 12:22:38，无会话探针为 HTTP 200 + AUTH_REQUIRED，不再是待部署项。',
  '2026-08-15 11:43:01 线上状态复核：正式域名根目录、/admin/、/referee/、/service-account-h5/ 均 HTTP 200；webLoginApi、getMiniWorkspace、onboardingWorkspace、organizerClaimInvite、applyTournament、serviceMatchWorkflow、updateMatch、sendRefereeTemplateMessages 均为 Deployment completed。线上函数列表仍无 setHeadReferee，无会话探针返回“不允许调用云函数: setHeadReferee”，因此 PC 裁判长中转仍是本地待部署；小程序开发者版本为 1.0.19，未预览、未提交审核、未发布，线上用户版本未切换。',
  '2026-08-15 11:39:00 旧名单换人入口收口并上传开发者版：`miniprogram/pages/roster-change/roster-change` 不再调用线上不存在的 `submitRosterChange`，页面改为“普通换人申请已关闭”及主办方异常处理指引；未直接部署旧的无统一租户鉴权云函数。全量小程序 JS `node --check`、162/162 静态门禁、云函数引用缺口 0、`git diff --check` 通过。微信开发者工具 CLI 上传 1.0.19 成功，AppID `wx57164cca8676f411`，TOTAL 1,544,424 bytes（主包 998,479；packageA 34,157；pages/match 71,344；pages/team 216,472；pages/tournament 223,972）。仅开发者上传，未预览、未提交审核、未发布，线上用户版本未切换；普通换人业务仍按异常处理产品规则执行。',
  '2026-08-15 11:31:30 PC 设置裁判长入口安全中转本地实现但暂未上线：`web-admin-vue/src/utils/cloud.js` 将 `setHeadReferee` 纳入 `webLoginApi` relay；`cloudfunctions/webLoginApi/index.js` 增加当前机构、赛事归属和已分配裁判关系校验，禁止直接部署原未鉴权旧函数。`node --check`、`npm run build`、162/162 静态门禁和 `git diff --check` 通过。三次 CloudBase CLI 部署尝试均卡在本地临时 ZIP 打包阶段（ZIP 0 字节，已停止进程并清理临时目录），线上 `webLoginApi` 安全回读仍为 `Nodejs18.15 / Deployment completed / modifyTime 2026-08-15 10:40:49`，本轮未改变生产函数、未上传后台静态包；待 CLI 打包环境恢复后再部署并做 `AUTH_REQUIRED`/机构会话回读。',
  '2026-08-15 11:04:22 画板外旧分享页缺失 PDF 云函数引用收口并上传开发者版：`miniprogram/pages/match/share/share.js` 不再调用不存在的 `generatePDF`，页面按钮明确显示“PDF导出待配置”，不新增未确认的导出权限或云函数；全量小程序 JS `node --check`、`git diff --check` 和静态门禁通过，云函数引用缺口降为 0、历史例外警告降为 0。微信开发者工具 CLI 上传 1.0.18 成功，AppID `wx57164cca8676f411`，TOTAL 1,545,196 bytes（主包 999,251；packageA 34,157；pages/match 71,344；pages/team 216,472；pages/tournament 223,972）。仅开发者上传，未预览、未提交审核、未发布，线上用户版本未切换；实际 PDF 导出仍待产品确认。',
  '2026-08-15 10:57:44 小程序首页缺失业务数据提示中性化并上传开发者版：`pages/home/home.js` 不再用固定教练姓名、球队对阵、比赛日期/场地、班级教练或 92%/86% 完整度作为真实数据缺省值，缺字段统一显示“待完善/待定”；显式视觉 fixture 数据保持不变。全量小程序 JS `node --check` 通过，静态门禁 162/162。微信开发者工具 CLI 上传 1.0.17 成功，AppID `wx57164cca8676f411`，TOTAL 1,546,030 bytes（主包 999,251；packageA 34,157；pages/match 72,178；pages/team 216,472；pages/tournament 223,972）。仅开发者上传，未预览、未提交审核、未发布，线上用户版本未切换。',
  '2026-08-15 10:54:08 小程序首页视觉样例失败回退安全修正并上传开发者版：`miniprogram/pages/home/home.js` 在真实 `workspace.loadContext` 失败且没有显式 `visualQa=1` 时不再回退到 `previewContext()`，统一展示真实错误态；本地全量小程序 JS `node --check` 通过，静态门禁 162/162。微信开发者工具 CLI 上传 1.0.16 成功，AppID `wx57164cca8676f411`，TOTAL 1,545,919 bytes（主包 999,140；packageA 34,157；pages/match 72,178；pages/team 216,472；pages/tournament 223,972）。仅开发者上传，未预览、未提交审核、未发布，线上用户版本未切换。',
  '2026-08-15 10:50:54 PC 静态包回归复核：`web-admin-vue` `npm run build` 通过；当前 `dist` 的 `index-B9Is9pUN.js`、`vue-vendor-C9beSz07.js`、`element-plus-CMVyjDO1.js`、`index-DpOb8WhM.css` 与 `https://saixiaofeng.com/admin/assets/` 对应资源逐字节 SHA-256 一致，无需重复上传。仅只读验证，未预览、未提交、未推送。',
  '2026-08-15 10:45:15 线上状态复核：正式域名 `/`、`/admin/`、`/referee/`、`/service-account-h5/` 均返回 HTTP 200；CloudBase 足球环境函数列表中 `webLoginApi`、`getMiniWorkspace`、`onboardingWorkspace`、`organizerClaimInvite`、`applyTournament`、`serviceMatchWorkflow`、`updateMatch` 和 `sendRefereeTemplateMessages` 均为 `Deployment completed`。小程序当前仍为开发者版本 1.0.15，未提交审核、未发布；9 个视觉节点和通知模板生产变量仍待完成。未预览、未写入真实业务数据、未提交、未推送。',
  '2026-08-15 10:41:12 家长历史提交引用兼容修正并上线：completeParentProfile 在当前邀请未开启实名/形象照但已有历史 parent_profile_submissions 的重复提交场景中保留 verificationId、portraitId、avatarFileId；当前显式要求仍按实时配置校验。webLoginApi 线上读回 Nodejs18.15 / Deployment completed / modifyTime 2026-08-15 10:40:49；无会话 AUTH_REQUIRED、无效邀请 PARENT_INVITE_INVALID，未使用真实资料。',
  '2026-08-15 10:37:54 家长协作入口清单同步并上线：getMiniWorkspace.formatParentProfileInvite 不再固定展示实名认证和标准形象照，仅在邀请/球员显式开启对应开关时加入清单；基础资料和监护授权保持固定。getMiniWorkspace 线上读回 Nodejs18.15 / Deployment completed / modifyTime 2026-08-15 10:37:31；无会话探针 AUTH_REQUIRED，未读取或写入真实业务数据，未预览、未发布。',
  '2026-08-15 10:34:09 家长 H5 独立要求分支收口并上线：previewParentProfileInvite 只采信邀请/球员上明确存在的实名与标准形象照开关；活动邀请本身只代表家长基础资料协作，未显式配置的两项不再进入强制流程。service-account-h5/app.js 按 realName/portrait 选择实名、形象照或直接提交，completeParentProfile 只校验已开启的要求；原型样例显式开启两项要求。webLoginApi 线上读回 Nodejs18.15 / Deployment completed / modifyTime 2026-08-15 10:32:44；H5 4 个文件上传后公网 app.js HTTP 200，SHA-256 与本地一致（BE6FAE8DDFB09C30C8AD543402C0A4DACE703835E4635A0EC70DE19250A83681）。无会话 AUTH_REQUIRED、无效邀请 PARENT_INVITE_INVALID；未使用真实资料、未预览，9 个视觉节点保持 visual-review；未提交、未推送、未发布。',
  '2026-08-15 10:22:58 正式名单要求默认值收口并上线：getMiniWorkspace 与 webLoginApi 仅在赛事/竞赛组别显式配置时计算标准形象照、家长补充资料和实名认证待办；未配置不再按历史默认生成强制待办，并保留 legacy-compatibility 来源标识。两个云函数均已部署并读回 Deployment completed（getMiniWorkspace 10:21:25、webLoginApi 10:22:01）；固定入口无会话探针为 AUTH_REQUIRED，未读取或写入真实业务数据。家长独立 H5 的赛事/组别配置来源仍待明确，9 个视觉节点保持 visual-review；未提交、未推送、未发布。',
  '2026-08-15 10:12:21 正式域名 PC 静态包字节回读：公网 /admin/index.html 与当前 web-admin-vue/dist/index.html 引用完全一致；index-B9Is9pUN.js、vue-vendor-C9beSz07.js、element-plus-CMVyjDO1.js、index-DpOb8WhM.css 四个入口资源逐字节 SHA-256 一致，根域名 HTTP 200；本轮只读核对，未上传、未部署、未预览、未发布。',
  '2026-08-15 10:09:29 正式 PC 构建回归：web-admin-vue npm run build 成功生成当前 dist，node --check（台账与画板外旧分享页）、162/162 静态 UI 交付门禁和 git diff --check 均通过；本轮未上传、未部署、未预览、未发布。',
  '2026-08-15 10:04:53 画板外旧分享页审计：app.json 仍登记 miniprogram/pages/match/share/share，share.wxml 的“下载PDF文档”按钮实际绑定 share.js.onDownloadPDF，运行时直接调用 generatePDF；当前 cloudfunctions 目录无 generatePDF 实现，CloudBase 足球环境 fn list 也确认 NOT_FOUND_IN_CLOUDBASE_FUNCTION_LIST，git log --all 也没有可恢复的 generatePDF 实现。产品规则明确的是专业版《竞赛规程》预览/导出，未明确首发阵容 PDF 的导出范围或权限。该入口不在 162 个批准节点内，未擅自新增/删除函数或修改页面，保留为 legacy warning，待明确是否保留该导出能力后再处理；node --check 通过，未部署、未预览、未写入业务数据。',
  '2026-08-15 07:57:51 OFFICIAL_ROSTER_RUNTIME_FIX: officialRosterForWorkspace no longer references an undefined invite; officialRoster and submitOfficialRoster require an approved/confirmed/claimed/accepted tournament_teams relation; official-roster, profile-exception, and profile-progress back fallbacks capture teamId before navigateBack; workspace/team/tournament/snapshot boundaries remain. node --check, 162/162 static gate, and git diff --check passed. getMiniWorkspace deployed via COS and read back Nodejs18.15 / Deployment completed / modifyTime 2026-08-15 07:57:51. No preview or real roster data access/write.',
  '2026-08-15 07:45:45 家长独立配置来源审计：家长协作入口从球队球员库/快速创建球员发起，parentProfileInvite、重新生成和 createParentLink 均未携带 tournamentId/divisionId；实名只兼容旧球员 requiresRealName，形象照没有赛事配置来源。未擅自用默认值替主办方决定赛事规则；独立开关传递待确认数据模型项。本轮未改代码、未部署、未写入业务数据。',
  '2026-08-15 07:44:02 实名更正接口 active 邀请门禁补齐并完成线上回读：requestParentIdentityCorrection 先复核 active parentInvite 与球员/球队关系再创建工单；webLoginApi 线上读回 Nodejs18.15、modifyTime 2026-08-15 07:43:27、Deployment completed。无会话探针 PARENT_AUTH_REQUIRED，无效邀请 PARENT_INVITE_INVALID；node --check、162/162 静态门禁和 git diff --check 通过。未使用真实家长会话或实名记录，未提交、未推送、未发布。',
  '2026-08-15 07:39:42 家长 H5 人像上传/确认 active 邀请门禁补强并完成线上回读：uploadAndProcessParentPortrait 与 confirmParentPortrait 均在受限人像读写前复核 active parentInvite 与球员/球队关系；webLoginApi COS 部署回读 Nodejs18.15、modifyTime 2026-08-15 07:39:02、Deployment completed。无会话探针返回 PARENT_AUTH_REQUIRED，无效邀请预览返回 PARENT_INVITE_INVALID；node --check、162/162 静态门禁和 git diff --check 通过。未使用真实家长会话、证件或人像，未提交、未推送、未发布。',
  '2026-08-15 07:35:41 家长 H5 身份上传/提交后端门禁补强并完成线上回读：uploadParentIdentityDocument 与 submitParentIdentityVerification 均复核 active parentInvite，提交接口额外要求 parent_profile_drafts.basicConfirmed=true 与 guardianAuthorized=true；H5 已上传但提交失败时显示刷新状态或重新上传，避免误导性禁用重试。node --check、162/162 静态门禁和 git diff --check 通过；webLoginApi COS 部署回读 Nodejs18.15、modifyTime 2026-08-15 07:34:37、Deployment completed；无会话探针返回 PARENT_AUTH_REQUIRED，无效邀请返回 PARENT_INVITE_INVALID。未使用真实家长会话、证件或资料，未提交、未推送、未发布。',
  '2026-08-15 07:11:16 家长 H5 匹配孩子入口防重复授权修正并完成线上回读：主操作按钮首次点击立即禁用；已有同邀请会话只加载资料一次，未授权流程由 parentOAuthBusy 阻止并行 parentProfileOAuthUrl 请求，失败后释放忙碌态保留重试。node --check service-account-h5/app.js、162/162 静态门禁和 git diff --check 通过；/service-account-h5/ 上传 4 个文件，公网 app.js HTTP 200，SHA-256 与本地一致（D2EF2EBF182A7236F856370B6079BA583BD0A73B8A8C2FFF2AA190AF0EE87754）。未使用真实家长会话或资料；9 个视觉节点继续 visual-review，未提交、未推送、未发布。',
  '2026-08-15 07:05:03 专业版认领提醒弹层状态复核并完成线上回读：TournamentTeams.vue 在空 claimInvitePath 时直接停止二维码计算，邀请生成成功后即时刷新本次分享时间，切换/关闭/失败清理该状态；organizerClaimInvite 接口保持兼容且本次未修改。npm run build、node --check cloudfunctions/organizerClaimInvite/index.js、162/162 静态门禁和 git diff --check 通过；/admin/ 上传 193 个文件，公网 TournamentTeams-D7uSYmr0.js HTTP 200，SHA-256 与本地一致（F311AF1F4B1BA297E9B01E68C1F51DF558734F57408523FF451FDC515BD89D47）。未预览或执行真实认领写入，节点继续 visual-review，未提交、未推送、未发布。',
  '2026-08-15 06:56:00 家长 H5 成功页头像资产边界回归修正并上线：缺少当前头像裁切结果时不再复用透明标准形象照，改显示受限头像占位；只有确认生成的 avatarPreview 才展示球员头像。node --check service-account-h5/app.js、162/162 静态门禁通过；重新上传 /service-account-h5/ 后公网 app.js HTTP 200，SHA-256 与本地一致（C85D4F75671CBC1DA2C7147CDCED174FD6F292E571F95395DCF9151C27870BC6）；未预览或使用真实家长会话，未提交、未推送、未发布。',
  '2026-08-15 06:48:00 家长 H5 成功页示例数据回退收口并上线：生产成功页姓名/球队缺失时改用“球员/当前球队”中性占位，不再显示固定示例儿童或青训队名称；本地视觉样例仍只在 127.0.0.1 且显式 visualQa=1 时使用示例。node --check service-account-h5/app.js、162/162 静态门禁通过；重新上传 /service-account-h5/ 后公网 app.js HTTP 200，原始字节 SHA-256 与本地一致（07B94554F675C57C625E643BCF43AB9D07E758DB39CFE807B728257C17177048）；未预览或使用真实家长会话，未提交、未推送、未发布。',
  '2026-08-15 06:41:00 家长 H5 头像裁切预览同步修正并上线：确认页同步更新主裁切框、圆形预览和方形预览的缩放/位移，提交到 confirmParentPortrait 的裁切参数与用户看到的预览保持一致；node --check service-account-h5/app.js、CSS 924/924、162/162 静态门禁通过。service-account-h5/ 4 个文件已上传 /service-account-h5/，公网 app.js HTTP 200，原始字节 SHA-256 与本地一致（8E4E25EADAB03C91617CA2E5D05C879E0D4B43580D9CA3A1712729ECA9774061）；未预览或使用真实家长会话，节点继续 visual-review；未提交、未推送、未发布。',
  '2026-08-15 06:32:00 CloudBase 足球环境函数全量状态只读回读：使用 fn list --limit 100 --json 回读，webLoginApi、updateMatch、sendRefereeTemplateMessages、organizerClaimInvite、getMiniWorkspace、onboardingWorkspace、serviceMatchWorkflow 等正式函数均为 Deployment completed；未读取函数详情或敏感配置，未执行真实业务写入。',
  '2026-08-15 06:27:00 专业版发送认领提醒弹层空二维码占位修正并上线：邀请尚未生成时不再对空字符串绘制二维码，只有拿到真实 claimInvitePath 才显示代码生成的二维码，否则显示“生成中/待生成”状态；npm run build、162/162 静态门禁和 git diff --check 通过。web-admin-vue/dist 已上传 /admin/ 193 个文件，公网 TournamentTeams-DGv1PH16.js HTTP 200，原始字节 SHA-256 与本地一致（3900162CDC82E7C04DD3B501AD1E086D24338B9E704A4545D3C89E2699C6408A）；未预览或执行真实认领写入，节点继续 visual-review；未提交、未推送、未发布。',
  '2026-08-15 06:19:15 家长 H5 线上动作注册与鉴权回读：getParentProfileDraft、saveParentBasicProfile、uploadParentIdentityDocument、submitParentIdentityVerification、getParentIdentityVerification、requestParentIdentityCorrection、uploadAndProcessParentPortrait、confirmParentPortrait、completeParentProfile 逐项使用空会话与虚拟 invite 探针，全部 HTTP 200 + PARENT_AUTH_REQUIRED；未读取或写入真实家长、证件、人像或资料，无需重复部署。9 个视觉节点继续 visual-review；未预览、未提交、未推送、未发布。',
  '2026-08-15 06:13 PC 静态包线上一致性复核：web-admin-vue npm run build 通过；公网 /admin/ 当前引用的 index-DbVePOJO.js、vue-vendor-C9beSz07.js、element-plus-CMVyjDO1.js 与 index-DpOb8WhM.css 已逐字节 SHA-256 对比当前 dist，全部一致，无需重复上传；根域名、/admin/、/referee/、/service-account-h5/ HTTP 200，未预览、未提交、未推送、未发布。',
  '2026-08-15 06:05 裁判指派通知中转衔接修正并上线：updateMatch 不再直接调用 sendRefereeTemplateMessages；仅由已鉴权的 webLoginApi 在 updateMatch 返回内部通知元数据后，使用手机号 + 通知 ID + HMAC 时间窗证明统一中转，普通直接调用不返回内部字段。updateMatch 与 webLoginApi 均已线上部署并读回 Deployment completed；无会话 updateMatch relay 返回 AUTH_REQUIRED，通知函数无证明探针返回 INTERNAL_RELAY_REQUIRED，未读取或写入真实比赛/通知数据。',
  '2026-08-15 06:12 小程序视觉样例入口安全收口并上传开发者版本：统一新增 workspace.isVisualQaEnabled，仅允许微信开发者工具 platform=devtools 且显式 visualQa=1 时加载本地样例；事件、待办、青训、球队资料/邀请/数据包、阵容结果、赛程、赛事详情、赛前/赛中/赛后复核与异常页面均已收口。小程序开发者版本 1.0.9 上传成功，回读 TOTAL 1,546,485 bytes、主包 977.0 KB；未提交审核、未发布、未预览。',
  '2026-08-15 05:44 裁判通知函数内部中转鉴权收口并上线：webLoginApi 在 verifyBindSms 成功后使用现有服务号密钥生成 60 秒 HMAC 中转证明；sendRefereeTemplateMessages 拒绝无证明手机号/通知 ID，configurationStatus 仅回读配置状态。两个函数线上部署完成；无证明探针返回 INTERNAL_RELAY_REQUIRED，配置诊断返回 configured:false 与缺失变量名，不返回密钥值，未读取或写入真实通知数据。',
  '2026-08-15 05:35 登记路由与云函数引用复核：当前 app.json/分包共登记 72 条小程序路由，扫描到 63 个静态云函数引用，正式路由和函数目录均无缺口；唯一警告仍是旧 miniprogram/pages/match/share/share.js 的 generatePDF，该页面不在 162 节点批准画板范围，保留为 legacy warning。',
  '2026-08-15 05:31:12 小程序开发者版本上传回读：微信开发者工具 CLI 上传 1.0.8 成功，回读包体 TOTAL 1,546,266 bytes、主包 976.8 KB，分包为 packageA 33.4 KB、pages/match 70.5 KB、pages/team 210.5 KB、pages/tournament 218.8 KB。仅为开发者上传验证，未提交审核、未发布，线上用户版本未切换；未执行预览。',
  '2026-08-15 05:29:55 裁判小程序注册入口行为收口：已移除 pages/guide/referee-info/referee-info 的本地表单伪注册、延时假成功和 refereeInfo 本地存储，改为服务号 H5 承接页；提供入口复制与返回首页，不创建或覆盖裁判身份。node --check、JSON 解析、WXML 简单表达式扫描和 git diff --check 通过；随后已上传开发者版本 1.0.8，未提交审核或发布。',
  '2026-08-15 05:23:28 家长 H5 基础资料人工核验阻断补齐并完成线上回读：getParentProfileDraft 返回 needsManualReview 时，H5 进入人工核验状态，只允许刷新或返回邀请，不再重复展示可继续实名的编辑表单；不覆盖历史球员、名单、阵容或赛事快照。node --check、CSS 924/924、162/162 静态门禁通过；service-account-h5 上传 4 个文件，app.js 公网原始字节 SHA-256 与本地一致（8CAD262DCC40271C9415233B753DB810071A60C5E1301CA45B62CA66F12E7707）。未预览或使用真实家长会话，小程序 1.0.7 未提交审核或发布。',
  '2026-08-15 05:13:31 PC 认领邀请弹窗行为修正并完成线上回读：TournamentTeams.vue 优先使用 organizerClaimInvite 返回的服务端认领路径；有效期按日期型/带具体时间型值准确展示；关闭、切换和失败清理旧路径、二维码和有效期，避免串用上一支球队的邀请。npm run build、git diff --check、node --check、162/162 静态门禁通过；web-admin-vue/dist 上传 /admin/ 193 个文件，TournamentTeams-wXyHwYOE.js 公网原始字节 SHA-256 与本地一致（923D4414690E421BDF33B4951DE82E2B0B6A20DC8493CB5053F8B849ED66C031）。未预览或执行真实认领写入，节点仍待视觉验收，小程序 1.0.7 未提交审核或发布。',
  '2026-08-15 05:10:21 静态门禁视觉待验收统计修正：validate-ui-delivery.js 同时识别 visual-capture-pending 与 visual-review-pending，默认门禁如实输出视觉截图待执行 9；--strict-visual 对 9 个节点按预期失败。默认静态门禁仍通过 162/162、0 路由缺口、0 页面文件缺口；未改变业务代码、线上数据或发布状态。',
  '2026-08-15 05:08:12 认领确认/审核申请删除竞态门禁补强并完成线上回读：getMiniWorkspace 在预览后重读邀请与赛事时新增邀请类型、赛事存在性校验，记录被删除或替换时直接阻断，不进入孤立关系或通用异常写入。线上 Nodejs18.15 / Deployment completed / ModTime 05:08:12；node --check、npm run build、162/162 静态门禁通过；未读取或写入真实业务数据。9 个视觉节点继续待验收，小程序 1.0.7 未提交审核或发布。',
  '2026-08-15 05:00:59 赛事截止回退与二次过期校验统一并完成线上回读：getMiniWorkspace.prebuiltTeamInvite 在邀请缺少 inviteExpireAt/expiresAt 时回退校验 registrationDeadline/signupDeadline/endDate；认领确认与冲突审核申请预览后重读邀请和赛事，再次执行同一有效期断言。线上 Nodejs18.15 / Deployment completed / ModTime 05:00:59；npm run build、三个云函数 node --check、162/162 静态门禁通过；未读取或写入真实邀请、赛事或审核数据。9 个视觉节点继续待验收，小程序 1.0.7 未提交审核或发布。',
  '2026-08-15 04:56:26 审核申请写入前二次过期校验补强并完成线上回读：getMiniWorkspace.requestPrebuiltTeamClaimReview 在预览后重新读取邀请，并在写入 team_claim_review_requests / team_invitations 前再次校验 inviteExpireAt/expiresAt，过期返回 TEAM_INVITE_EXPIRED。线上 Nodejs18.15 / Deployment completed / ModTime 04:56:26；未读取或写入真实邀请或审核申请数据。9 个视觉节点继续待验收，小程序 1.0.7 未提交审核或发布。',
  '2026-08-15 04:52:29 邀请确认写入前二次过期校验补强并完成线上回读：getMiniWorkspace 在认领邀请与球队成员邀请的确认动作重新读取记录后再次校验 inviteExpireAt/expiresAt，避免有效期边界竞态继续写入接受关系；分别返回 TEAM_INVITE_EXPIRED 或 TEAM_MEMBER_INVITE_EXPIRED。node --check、git diff --check 通过；线上 Nodejs18.15 / Deployment completed / ModTime 04:52:09，未读取或写入真实邀请、球队成员或参赛关系。9 个视觉节点继续待验收，小程序 1.0.7 未提交审核或发布。',
  '2026-08-15 04:49:52 认领邀请有效期边界补强并完成线上回读：organizerClaimInvite 生成端拒绝报名截止后新建认领邀请并过滤已过期 pending 邀请；getMiniWorkspace.prebuiltTeamInvite 预览和确认端校验 inviteExpireAt/expiresAt，过期返回 TEAM_INVITE_EXPIRED，旧邀请缺字段时回退校验赛事报名截止/结束时间。两个函数线上 Nodejs18.15 / Deployment completed：organizerClaimInvite ModTime 04:48:21，getMiniWorkspace ModTime 04:49:02；未读取或写入真实赛事、球队或邀请数据。9 个视觉节点继续待验收，小程序 1.0.7 未提交审核或发布。',
  '2026-08-15 04:41:30 家长实名退回重提边界补强并完成线上回读：submitParentIdentityVerification 在 rejected 状态下比较当前 uploaded 人像面文档与上次审核记录 documentIds；未重新上传就直接重提返回 PARENT_IDENTITY_REUPLOAD_REQUIRED，只有新文档才会重新进入 pending_review。node --check、git diff --check 通过；webLoginApi 线上 Nodejs18.15 / Deployment completed / ModTime 04:40:41，无会话探针返回 HTTP 200 + PARENT_AUTH_REQUIRED，未读取或写入真实家长、证件或业务数据。9 个视觉节点继续待验收，小程序 1.0.7 未提交审核或发布。',
  '2026-08-15 04:32:39 家长资料提交成功页头像预览修正并完成线上回读：H5 确认裁切后分别展示 canvas 生成的头像与透明标准形象照，裁切缩放/位移客户端和服务端均有界；service-account-h5 4 个文件重新上传，app.js 公网与本地 SHA-256 一致（90FACCD4788BF99C48AD99B83B9B8154EB7248AB9DC435CD9859032B14AD01E1），入口与 index.html HTTP 200。node --check、CSS 916/916、162/162 静态门禁通过；未使用真实家长会话或资料写入，节点继续 visual-review；小程序 1.0.7 未提交审核或发布。',
  '2026-08-15 04:29:28 家长标准头像派生闭环补齐并完成线上验证：service-account-h5/app.js 从受限透明预览生成 PNG 头像，提交 avatarData 与有界 crop(scale/x/y)；webLoginApi.confirmParentPortrait 校验家长会话、实名版本、人像版本和 PNG 2MB 上限后上传受限 avatar 文件，保存 avatarFileId/avatarCrop/avatarProcessingStatus，资料提交记录关联头像文件。node --check、CSS 916/916 括号校验和 162/162 静态门禁通过；webLoginApi 线上 Nodejs18.15 / Deployment completed / ModTime 04:28:15，无会话确认探针返回 HTTP 200 + PARENT_AUTH_REQUIRED；H5 4 个文件上传 /service-account-h5/，app.js 公网与本地 SHA-256 一致（A7A82D47949695EFD90EDE8870AEE3060E974DA363585F40BE446B67732C7EED），入口 HTTP 200。未使用真实家长会话或资料写入，节点继续 visual-review；小程序 1.0.7 未提交审核或发布。',
  '2026-08-15 04:23:19 家长人像确认返回上下文修正并完成线上验证：service-account-h5/app.js 在人像分割结果页重新拍摄或返回取景框时继续传递球员/球队上下文；node --check、CSS 916/916 括号校验和全量 UI 静态门禁（162/162、0 路由缺口、0 页面文件缺口）通过。service-account-h5 已上传 /service-account-h5/ 4 个文件，app.js 公网与本地 SHA-256 一致（425EBF664FF2A4A03DD7724B0A80DA73C84BECBC0D8C2ADC805B4567B3E02AB8），入口 HTTP 200。未使用真实家长会话、实名材料、人像或业务写入，节点继续 visual-review；小程序开发者版本 1.0.7 未提交审核或发布。',
  '2026-08-15 04:16:21 专业版球队认领邀请有效期回填修正并完成线上验证：PC TournamentTeams.vue 接收 organizerClaimInvite 返回的 inviteExpireAt，路由切换、关闭和失败清理旧值；npm run build、全量 UI 静态门禁（162/162、0 路由缺口、0 页面文件缺口）和 git diff --check 通过。web-admin-vue/dist 已上传 /admin/ 193 个文件，TournamentTeams-DJ8Ukj-k.js 公网与本地 SHA-256 一致（7A717F2DA88C09EC2E90DE6C7058B44F2EEC491E9E12FF122A24CBD9590B9F32）。未预览或执行真实认领写入，节点继续 visual-review；小程序开发者版本 1.0.7 未提交审核或发布。',
  '2026-08-15 04:09:24 webLoginApi HTTP 请求体兼容解析补强并上线：兼容字符串、Buffer、对象、Base64 与表单候选；线上 Nodejs18.15 / Deployment completed / ModTime 04:08:45。无会话 checkLogin 返回 HTTP 200 + AUTH_REQUIRED，无效家长邀请返回 HTTP 200 + PARENT_INVITE_INVALID，确认 action 已正确到达；未读取或写入真实业务数据。node --check、全量 UI 静态门禁通过（162/162、0 路由缺口、0 页面文件缺口）；9 个视觉节点继续待验收，小程序开发者版本 1.0.7 未提交审核或发布。',
  '2026-08-15 03:50:16 sendRefereeTemplateMessages 配置诊断闭环上线：增加 configured/missingConfig 安全回读，不返回密钥值；线上 Nodejs16.13 / Deployment completed / ModTime 03:49:30。虚拟手机号空队列探针返回 success:true、results:[]，缺少 SERVICE_ACCOUNT_APP_ID、SERVICE_ACCOUNT_APP_SECRET、SERVICE_ACCOUNT_REFEREE_TEMPLATE_ID、SERVICE_ACCOUNT_H5_URL，未触发真实通知；模板生产发送仍待服务号管理员配置环境变量。',
  '2026-08-15 03:41:47 小程序当前配置复核后再次上传开发者版本 1.0.7 成功：主包 1.9MB，packageA 33.4KB、pages/match 105.2KB、pages/team 222.2KB、pages/tournament 218.8KB；仍未提交审核或发布，线上用户版本未切换。',
  '2026-08-15 03:39:06 小程序开发者版本 1.0.6 上传门禁通过：首次主包 14,337KB 超限后，批准源素材归档到 docs/prototype-assets/miniprogram-source-20260815/，运行背景改为压缩 JPEG、品牌图标改为 128px 副本，球队/比赛/赛事低频页面按原路径拆入分包。微信回读主包 1.9MB，packageA 33.4KB、pages/match 105.2KB、pages/team 222.2KB、pages/tournament 218.8KB；根域名、/admin/、/referee/ HTTP 200。仅开发者上传，未提交审核或发布，线上用户版本未切换；9 个视觉节点与通知模板生产配置仍待完成。',
  '2026-08-15 03:23:04 认领冲突证明材料上传闭环上线：小程序 claim-conflict 页按材料类型上传最多 3 张图片，使用 claim-review-proofs/<inviteId>/ 路径；getMiniWorkspace 校验当前邀请路径、材料类型/数量/大小并要求至少一项，将材料元数据写入 team_claim_review_requests。PC 审核工作台增加查看证明材料，organizerClaimInvite.getClaimReviewProofUrls 只在当前机构权限内生成临时查看链接，不公开文件 ID、不自动改变球队所有权。两函数线上 Deployment completed / Nodejs18.15；无会话探针返回登录失效/WORKSPACE_LOAD_FAILED。PC 构建通过，/admin/ 上传 193 个文件，审核页 JS/CSS 公网 HTTP 200。未使用真实证明文件，小程序发布、9 个视觉节点和通知模板配置仍待完成。',
  '2026-08-15 02:58:08 认领冲突主办方审核工作台与状态机上线：organizerClaimInvite 新增当前机构范围审核队列和 under_review/needs_more_info/approved/rejected 决策，PC 正式页 /admin/#/tournaments/:id/claim-reviews 已接入开始核验、要求补材料、通过和不通过；通过只解锁受邀人后续确认，不自动合并球队、不覆盖长期资料。getMiniWorkspace 禁止冲突邀请绕过人工审核直接选择已有球队。两函数线上部署完成，无会话探针返回登录失效/WORKSPACE_LOAD_FAILED；PC 构建通过，/admin/ 上传 193 个文件，新审核页 JS/CSS 公网 HTTP 200。证明材料上传、小程序发布、9 个视觉节点和通知模板配置仍待完成，未预览。',
  '2026-08-15 02:40:27 getMiniWorkspace 线上依赖修正：重新启用 package.json 的云端依赖安装部署，线上 Nodejs18.15 / Active / Available / ModTime 2026-08-15 02:40:27；无微信会话探针进入 WORKSPACE_LOAD_FAILED，不再出现 Cannot find module wx-server-sdk。临时配置已清理，未写业务数据；小程序尚未上传发布，9 个视觉节点状态不变。',
  '2026-08-15 02:37:11 认领冲突人工审核链路补齐并上线：小程序 claim-conflict 页不再本地假提交，调用 getMiniWorkspace.requestPrebuiltTeamClaimReview；服务端按受邀关系与冲突状态创建幂等 team_claim_review_requests，将邀请和未完成赛事关系标记为 review_required，不自动认领、不按名称合并、不修改球队长期资料。node --check、WXML 简单表达式检查通过；线上 Nodejs18.15 / Active / Available / ModTime 2026-08-15 02:36:42；无微信会话探针返回 WORKSPACE_LOAD_FAILED。小程序尚未上传发布，9 个视觉节点状态不变；主办方审核工作台和证明材料上传仍待后续。',
  '2026-08-15 02:26:10 比赛现场阵容锁定边界补强并上线：serviceMatchWorkflow.saveRefereeRoster 仅允许 scheduled/pending/checked_in 赛前状态保存名单，双方阵容锁定后返回 LINEUP_LOCKED；reviewLineup 要求获授权裁判、赛前检查完成且仍处于赛前状态，锁定或赛中/赛后状态拒绝核验。node --check 通过；线上 Nodejs16.13 / Active / Available / ModTime 2026-08-15 02:26:10；未触碰真实比赛、阵容或裁判数据。小程序尚未上传发布，9 个视觉节点状态不变。',
  '2026-08-15 02:13:33 裁判服务号 H5 正式包补传并完成公网核对：`/referee/` 旧版 28KB `app.js` 已替换为本地完整 115799 bytes 版本，公网 SHA-256 `E44C311A1F0E92B0113D6A9688A9D402A06C327C49427C8329DA5500AC9B318A` 与本地一致；包内包含服务号 OAuth、裁判工作流、电子签字与退回修正。`sendRefereeTemplateMessages` 线上函数为 Active / Available，但生产尚无模板 ID 等环境变量，缺少配置时只回写 `configuration_required`，未发送真实通知。小程序尚未上传发布，9 个视觉节点状态不变。',
  '2026-08-15 02:09:54 PC 登录后的机构识别引导修正并上线：微信扫码回调清理上一个账号的 `organizationInfo/currentOrganization/currentOrg` 缓存并统一进入 `/organization-onboarding`；主办方受保护路由只信任当前 `userInfo.orgId`，旧机构缓存不能跳过识别。已有机构由服务端状态自动识别；无机构账号明确选择“赛事主办方”或“青训机构”，青训未开通不能直接创建。退出登录同步清理机构缓存。PC 构建通过，`/admin/` 上传 191 个文件，相关公网 bundle HTTP 200；未使用真实业务数据，小程序尚未上传发布，9 个视觉节点状态不变。',
  '2026-08-15 02:02:24 比赛现场写入边界再次收口并上线：`webLoginApi.dbQuery` 对 `match_events`、`match_referees`、`squads` 的写操作在会话与机构校验后统一返回 `REFEREE_WORKFLOW_REQUIRED`；PC `/referee/match/:id` 只读展示比赛与事件流水，旧 GPS 签到和开始/结束比赛按钮已移除，统一引导裁判服务号/H5。`webLoginApi` 线上读回 `Nodejs18.15 / Active / Available / ModTime 2026-08-15 01:59:45`；无会话探针返回 `AUTH_REQUIRED`，未触碰真实数据。PC 构建通过，`/admin/` 已上传 191 个文件，`RefereeMatchDetail` 公网 bundle HTTP 200。小程序尚未上传发布，9 个视觉节点状态不变。',
  '2026-08-15 01:51:33 旧阵容适配器的读取边界再次收紧并上线：`updateMatchLineup` 不再自行读取比赛或解析球队，只把 `matchId/lineupField/selectedPlayerIds` 交给 `serviceMatchWorkflow.submitLineupLegacy`，由统一服务端先校验身份再解析场次侧别；`updateMatchLineup` 与 `serviceMatchWorkflow` 线上读回 Active / Available / ModTime 2026-08-15 01:51:33（现有线上运行时为 Nodejs16.13）。旧签字写入口停用、签字状态只读和 PC `/sign` 停用提示保持不变；未使用真实业务数据，小程序尚未上传发布，9 个视觉节点状态不变。',
  '2026-08-15 01:47:28 旧阵容/签字兼容入口已统一收口并上线：`updateMatchLineup` 不再直接写 `matches`，只转发到 `serviceMatchWorkflow.submitLineup` 并复用球队认领、首发请求、已审核名单、人数和球员 ID 校验；`saveSignature` 与 `updateMatchSignature` 旧版直接写入入口停用；`getSignatureStatus` 改为只读并保留历史 `signatures` 查询兼容，不再在轮询中更新比赛。4 个函数线上读回 Active / Available（ModTime 依次为 01:45:42、01:46:20、01:46:17、01:46:21）；PC `/sign` 改为停用提示，`/admin/` 重新上传 191 个文件并核对 SignatureView 公网与本地 SHA-256 一致；未使用真实业务数据，小程序尚未上传发布，9 个视觉节点状态不变。',
  '2026-08-15 01:37:40 比赛执行阵容入口补齐并上线：正式小程序服务阵容页调用的 `serviceMatchWorkflow.getLineupTask` 与 `submitLineup` 已注册到云函数主入口；服务端继续校验裁判已发布首发请求、球队属于当前场次、球队负责人认领关系、已审核赛事正式名单、首发人数和球员 ID，不接受客户端伪造球员或跨场次提交。`serviceMatchWorkflow` 线上读回 Active / Available / ModTime 2026-08-15 01:37:40（现有线上运行时为 Nodejs16.13）；node --check、阵容页语法和全量 UI 静态门禁通过。未使用真实球队、名单或比赛写入；小程序尚未上传发布，9 个视觉节点状态不变。',
  '2026-08-15 01:26:54 简易版升级专业版链路已落地并上线：PC 模式对比入口调用 `upgradeDivisionToProfessional`，在原竞赛组别上切换专业模式并路由到正式名单待办，不重复创建组别；服务端要求有效专业版权益、阻断已锁定竞赛方案，保留规则/球队/抽签/赛程/裁判数据，并对正式名单初始化保持幂等。`webLoginApi` 线上读回 Nodejs18.15 / Active / Available / ModTime 2026-08-15 01:26:54；无会话探针返回 AUTH_REQUIRED。PC 构建通过，/admin/ 上传 191 个文件，TournamentDivisionCreate 公网与本地 SHA-256 一致（D81EF54EDD83A606D14A5348BC35FCA4D783F7118D8F7741BECBF1CE1829892A）。未使用真实机构、赛事、权益或名单数据；小程序发布与 9 个视觉节点继续待完成。',
  '2026-08-15 01:13:36 小程序通知闭环边界补齐并上线：`getMiniWorkspace` 的消息深链现在只允许当前已登记的小程序页面路由，未知或外部路径会被清空；历史非 `read` 回执会在标记已读时更新而不是跳过；消息中心跳转失败会保留已读结果并提示返回刷新。`node --check`、`app.json` JSON 解析、全量 UI 静态门禁通过（162/162 节点、0 缺失路由）；`getMiniWorkspace` 已部署并读回 `Nodejs18.15 / Active / Available / ModTime 2026-08-15 01:13:36`。未读取或写入真实消息、回执或业务数据，未调用真实通知发送；小程序发布和 9 个视觉节点状态不变。',
  '2026-08-15 01:06:11 裁判服务号通知发送函数同步上线：`sendRefereeTemplateMessages` 已将当前源码部署到线上，继续使用 `referee_notifications` 队列，发送前检查配置/状态，成功、失败和缺少配置均回写队列状态；未调用发送动作、未触碰真实通知队列。线上读回 `Nodejs16.13 / Active / Available / ModTime 2026-08-15 01:06:11`；H5 工作流仍由 `webLoginApi.serviceRefereeWorkflow` 统一会话中转，9 个视觉节点状态不变。',
  '2026-08-15 01:03:20 比赛执行快照边界补齐并上线：`updateMatch` 在方案锁定后的首次受控裁判指派时固化 `matchId/tournamentId/divisionId/organizationId/planVersion/对阵/场地/时间` 快照；`serviceMatchWorkflow.startRefereeMatch` 在缺少快照时补固化同一结构。快照存在后，直接更新入口拒绝修改对阵、场地、时间、赛制、状态和比分，现场事件、裁判指派和签字仍走各自受控流程。两个函数均已部署并读回 `Nodejs16.13 / Active / Available`：`updateMatch` `ModTime 2026-08-15 01:02:51`、`serviceMatchWorkflow` `ModTime 2026-08-15 01:03:20`；无会话 `updateMatch` 探针返回 HTTP 200 + `AUTH_REQUIRED`，未触碰真实比赛数据，9 个视觉节点状态不变。',
  '2026-08-15 00:58:11 旧球队查询入口收口并上线：`getMyTeams` 不再使用客户端传入的手机号、微信标识或用户 ID，改用网页可信会话账号，并仅返回真实 `orgId` 属于当前机构的球队；无有效机构或机构实体时返回 `ORG_REQUIRED`。两个函数均已部署并读回 Active / Available：`getMyTeams` `Nodejs16.13 / ModTime 2026-08-15 00:57:38`、`webLoginApi` `Nodejs18.15 / ModTime 2026-08-15 00:58:11`；无会话探针返回 HTTP 200 + `AUTH_REQUIRED`，未触碰真实球队数据，9 个视觉节点状态不变。',
  '2026-08-15 00:54:08 外部报名入口收口并上线：`applyTournament` 现在要求可信网页账号与有效机构上下文，并校验提交球队真实 `orgId` 属于当前机构；赛事仍可跨机构接受公开报名，未改变赛事主办方边界。`webLoginApi` 将该入口纳入机构必需 relay。两个函数均已部署并读回 Active / Available：`applyTournament` `Nodejs16.13 / ModTime 2026-08-15 00:53:24`、`webLoginApi` `Nodejs18.15 / ModTime 2026-08-15 00:54:08`；无会话探针返回 HTTP 200 + `AUTH_REQUIRED`，未触碰真实报名或球队数据，9 个视觉节点状态不变。',
  '2026-08-15 00:50:21 赛事球队审核入口收口并上线：`tournamentReview` 的提交、查询、批准和拒绝动作现在都绑定可信网页账号与真实机构；赛事和球队必须属于当前机构，审核人和教练手机号不再接受客户端自报。`webLoginApi` 将其纳入机构必需 relay。两个函数均已部署并读回 `Nodejs18.15 / Active / Available`：`tournamentReview` `ModTime 2026-08-15 00:49:34`、`webLoginApi` `ModTime 2026-08-15 00:50:21`；无会话探针返回 HTTP 200 + `AUTH_REQUIRED`，未触碰真实审核或参赛数据，9 个视觉节点状态不变。',
  '2026-08-15 00:45:16 高风险批量删除入口收口并上线：`clearTeamPlayers` 不再接受匿名或客户端自报的球队身份，必须通过网页会话传入可信账号/机构上下文，并校验球队真实 `orgId` 与当前机构一致后才允许删除球员；`webLoginApi` 同步把该入口纳入会话和机构必需集合。两个函数均已部署并读回 `Nodejs18.15 / Active / Available`：`clearTeamPlayers` `ModTime 2026-08-15 00:44:44`、`webLoginApi` `ModTime 2026-08-15 00:45:16`；无会话探针返回 HTTP 200 + `AUTH_REQUIRED`，未触碰真实球队或球员数据，9 个视觉节点状态不变。',
  '2026-08-15 00:39:08 通用 `dbQuery` 锁定检查补强并上线：删除分支现在先读取待删记录，避免未定义记录绕过方案校验；缺少 `divisionId` 的旧参赛关系会继续按赛事及嵌套竞赛组别快照检查，锁定状态读取失败时拒绝写入。`webLoginApi` 已部署并读回 `Nodejs18.15 / Active / Available / ModTime 2026-08-15 00:39:08`；无会话删除探针返回 HTTP 200 + `AUTH_REQUIRED`，未触碰真实数据，9 个视觉节点状态不变。',
  '2026-08-15 00:34:54 参赛关系直接写入口补齐方案锁定保护：`applyTournament`、`clearTournamentTeams` 与 `organizerClaimInvite` 在服务端读取赛事及竞赛组别锁定状态，锁定后分别拒绝新增/重建报名、清空参赛关系和生成认领邀请，返回 `COMPETITION_PLAN_LOCKED`；未锁定流程保持不变。三个函数均已部署并读回 Active / Available：`applyTournament` `Nodejs16.13 / ModTime 2026-08-15 00:33:54`、`clearTournamentTeams` `Nodejs18.15 / ModTime 2026-08-15 00:34:07`、`organizerClaimInvite` `Nodejs18.15 / ModTime 2026-08-15 00:34:54`；未调用真实机构、赛事或球队数据，9 个视觉节点状态不变。',
  '2026-08-15 00:28:00 历史机构兜底入口清理并上线：`checkUserByOpenId`、`profileContentSecurity`、`manageTournamentCenterContent` 与 `backfillOrganizerOrgId` 不再把自然人 `users._id` 当作机构 `orgId`；无机构时返回空机构状态或 `user_missing_org`，保留真实 `orgId/organizationId`，不自动创建或回写个人 ID。四个函数均已部署并读回 Active / Available：`checkUserByOpenId` `Nodejs16.13 / ModTime 2026-08-15 00:26:30`、`profileContentSecurity` `Nodejs18.15 / ModTime 2026-08-15 00:26:58`、`manageTournamentCenterContent` `Nodejs18.15 / ModTime 2026-08-15 00:27:14`、`backfillOrganizerOrgId` `Nodejs18.15 / ModTime 2026-08-15 00:28:00`；未调用真实账号、机构或迁移数据，9 个视觉节点状态不变。',
  '2026-08-15 00:20:45 方案锁定后的直接赛程写入口补齐：`generateSchedule` 在服务端读取当前赛事/竞赛组别锁定状态，锁定后返回 `COMPETITION_PLAN_LOCKED`，不再删除重建已确认组别赛程；`updateMatch` 同步执行真实机构校验，锁定后只允许受控裁判指派，比分、状态、时间、场地和对阵字段被拒绝，裁判组仍通过已审核本机构裁判校验。两个函数不再以 `users._id` 作为机构兜底。函数已部署并读回 `generateSchedule` `Nodejs16.13 / Active / Available / ModTime 2026-08-15 00:20:11`、`updateMatch` `Nodejs16.13 / Active / Available / ModTime 2026-08-15 00:20:45`；未使用真实机构、赛事或比赛写入，9 个视觉节点状态不变。',
  '2026-08-15 00:06:33 最终竞赛方案确认链路补齐：`confirmCompetitionPlan` 由 webLoginApi 服务端校验组别规则定版、已确认参赛球队、抽签/分组完整、赛程时间场地完整且无冲突，服务端保存规则/参赛关系/抽签/赛程紧凑快照后锁定方案并返回正式比赛管理路由；锁定后通用赛程、抽签和参赛关系写入口拒绝直接修改。PC 赛事控制台增加“确认方案”入口，比赛管理快捷入口改为 `/tournaments/:id/matches`。webLoginApi 线上读回 Nodejs18.15/index.main/Active/Available/ModTime 2026-08-15 00:06:33；无会话 confirmCompetitionPlan 探针返回 HTTP 200 + AUTH_REQUIRED。PC npm run build 通过，cloud-ZSnvx-n_.js 公网与本地 SHA-256 一致（D50B0DA23F80A5CE6A0F404E6BE9F250A6A080454EE0AFFD27880FABD23BA10D），TournamentConsole-CZSw21u3.js 公网与本地 SHA-256 一致（BD446109219E8C89797890CE2F4A7FAF08A975F4A645E5B43735B3EE86B4E0E6），/admin/ HTTP 200。未使用真实机构、赛事或支付数据，9 个视觉节点状态不变。',
  '2026-08-14 23:50:09 竞赛组别正式定版边界补齐：webLoginApi 将 divisions 纳入机构范围 relay；新增 confirmDivisionRules 服务端定版动作，浏览器不能直接写 rulesLocked/ruleFinalized/rulesVersion 或伪造专业版权益。专业模式只有显式有效权益状态才允许定版，未写死价格/支付渠道；无会话 list 与 confirmDivisionRules 探针均返回 HTTP 200 + AUTH_REQUIRED。webLoginApi 线上读回 Nodejs18.15/index.main/Active/Available/ModTime 23:50:09；PC npm run build 通过，cloud-Ddg09aof.js 公网与本地 SHA-256 一致（1B5D1F81617295F0692FA65079F381A735B94215A61BFC477EF93EA169FE57F0），DivisionRulesWizard-BgzBTgRq.js 公网与本地 SHA-256 一致（2968FE99D145FD6AA52EE5A76006F9B73EBDCC24F997508B797A0671DC565912），/admin/ HTTP 200。未使用真实机构、赛事或支付数据，9 个视觉节点状态不变。',
  '2026-08-14 23:32:45 名单变更审核安全收口：reviewRosterChange 纳入 webLoginApi relay、网页会话和机构必需门禁；云函数校验赛事机构归属与 tournament_teams 参赛关系，审核人从 relay 注入而非浏览器字段读取。reviewRosterChange 与 webLoginApi 线上读回 Nodejs18.15/index.main/Deployment completed（ModTime 分别 23:32:45、23:32:27）；无 token 探针返回 HTTP 200 + AUTH_REQUIRED。PC npm run build 通过，cloud-cCe_I_Am.js 公网与本地 SHA-256 一致（46C8465C20BC2E7863E4BFCFB11DA33C380A07E839ABCF623EE36B150289FC3A），/admin/ HTTP 200。未读取或写入真实名单数据，9 个视觉节点状态不变。',
  '2026-08-14 23:26:16 公开赛事门户查询入口补齐：getTournamentDetail 与 getTournamentMatches 纳入公开只读 relay，getRegulations 纳入登录后 relay；首次探针发现两个公开函数生产包缺少 wx-server-sdk，已按 package.json 重新部署。线上读回 Nodejs18.15/index.main/Deployment completed（getTournamentDetail ModTime 23:25:40，getTournamentMatches ModTime 23:26:16）；无赛事 ID 探针返回参数错误，无会话规程读取返回 AUTH_REQUIRED，未读取或写入真实赛事数据，9 个视觉节点状态不变。',
  '2026-08-14 23:16:05 PC AI 生图入口补齐：`generateAIImage` 纳入 webLoginApi.callFunction 白名单和会话必需集合，PC `cloud.js` 显式走 relay；无会话探针返回 HTTP 200 + AUTH_REQUIRED。webLoginApi 线上读回 Nodejs18.15/index.main/Deployment completed/ModTime 2026-08-14 23:16:05；PC npm run build 通过，/admin/ HTTP 200，公网 cloud chunk 与本地字节 SHA-256 一致。未调用真实生图或写入业务数据，9 个视觉节点状态不变。',
  '2026-08-14 23:09:09 家长实名状态机边界补强：uploadParentIdentityDocument 在 pending_review 时拒绝重复上传、approved 时拒绝再次上传；submitParentIdentityVerification 对审核中状态幂等返回、对已通过状态阻断，退回状态才允许按原因重新提交，不会重置已通过结论。webLoginApi 线上读回 Nodejs18.15/index.main/Deployment completed/ModTime 2026-08-14 23:09:09；未使用真实家长会话、证件或业务写入。',
  '2026-08-14 23:05:49 家长失效会话错误码收口：`webLoginApi.authenticateParentH5Session` 对不存在、过期或查询异常的家长会话统一返回 HTTP 200 + PARENT_AUTH_REQUIRED，不再向 H5 暴露 500 空响应；实名流程仍只允许身份证人像面。webLoginApi 线上读回 Nodejs18.15/index.main/Deployment completed/ModTime 2026-08-14 23:05:49；无 token、无效 token 和完成动作探针均返回 PARENT_AUTH_REQUIRED，未使用真实会话或业务写入。',
  '2026-08-14 23:01:26 家长实名一面边界补强：批准家长 H5 只上传身份证人像面；`webLoginApi.uploadParentIdentityDocument` 在会话校验后拒绝 side=back 并返回 PARENT_IDENTITY_FRONT_ONLY，不保存不需要的反面材料。webLoginApi 线上读回 Nodejs18.15/index.main/Deployment completed/ModTime 2026-08-14 23:01:26；未使用真实家长会话、证件或业务写入，9 个视觉节点状态不变。',
  '2026-08-14 22:52:53 机构引导能力复用修正：`OrganizationOnboarding.vue` 增加赛事/青训创建提交锁；已有唯一机构且当前账号具备对应权限时，赛事创建复用原机构并补齐 event 能力，青训开通复用原机构并补齐 education 能力与订阅状态，无权限成员不创建第二机构。`onboardingWorkspace` 线上读回 Nodejs18.15/index.main/Deployment completed/ModTime 2026-08-14 22:52:53；PC npm run build 通过，`OrganizationOnboarding-CSPu2w3E.js` 公网 SHA-256 与本地一致（53663780FA6D716364E8A965FA13366ACE77841691BCD8F9A70812AEFD36619B）。未使用真实机构会话或业务写入，9 个视觉节点仍保持 visual-review。',
  '2026-08-14 22:41:45 家长邀请会话边界修正：服务号 H5 在已有家长会话打开另一条 `parentInvite` 时会先清理旧会话并重新授权；后续家长 API 同时携带当前邀请令牌，`webLoginApi.authenticateParentH5Session` 不匹配时返回 `PARENT_INVITE_MISMATCH`，不会把旧孩子资料带入新邀请。`webLoginApi` 线上读回 Nodejs18.15/index.main/Deployment completed/ModTime 2026-08-14 22:41:45；4 个无会话家长动作返回 HTTP 200 + `PARENT_AUTH_REQUIRED`。`service-account-h5/app.js` 已上传并读回 HTTP 200，SHA-256 与本地一致（E44C311A1F0E92B0113D6A9688A9D402A06C327C49427C8329DA5500AC9B318A）。未使用真实家长会话、实名材料、人像或业务写入。',
  '2026-08-14 22:34:30 专业版认领弹层关系绑定修正：`TournamentTeams.vue` 在显式 `tournamentTeamId/teamId` 不存在或不匹配时不再回退到列表中的其他球队；路由切换会清空旧邀请，忽略迟到的旧请求响应，并在旧请求结束后重试新参赛关系，避免认领链接错配或丢失。`npm run build` 通过，`/admin/` 与 `TournamentTeams-pvYlQgRn.js` 均 HTTP 200，公网 chunk SHA-256 与本地一致（929116A2B8D65E910E08A535EC6DA5FB34F741073562026DDEE5EC4D33F355F9）。未做交互预览或真实认领写入，节点继续保持 visual-review。',
  '2026-08-14 22:23:45 二维码环境参数修正：`generateMiniProgramCode`、`generateQRCode` 与遗留 `generateInviteCode` 现在只接受 `develop/trial/release`，未传或非法值统一默认生产 `release`；PC 赛事报名二维码不再隐式落到体验版。`generateMiniProgramCode` 线上读回 Nodejs16.13/index.main/Deployment completed/ModTime 2026-08-14 22:16:58，`generateQRCode` 线上读回 Nodejs18.15/index.main/Deployment completed/ModTime 2026-08-14 22:17:17，`generateInviteCode` 线上读回 Nodejs16.13/index.main/Deployment completed/ModTime 2026-08-14 22:23:45；前两者无会话 `webLoginApi.callFunction` 探针均返回 HTTP 200 + `AUTH_REQUIRED`，遗留函数不在 relay 白名单且无源码调用，未生成真实二维码、未写入业务数据。',
  '2026-08-14 22:12:46 getBanners 正式运行时修正：云函数初始化从不规范的 SYMBOL_CURRENT_ENV 改为 DYNAMIC_CURRENT_ENV，保留现有 inactive 轮播过滤与 image/imageUrl 兼容；函数线上读回 Nodejs16.13/index.main/Deployment completed，无会话 webLoginApi.callFunction(getBanners) 返回 success=true、2 条启用数据。',
  '2026-08-14 22:10:19 正式域名线上读回：https://saixiaofeng.com/、/admin/ 及本轮更新的 cloud relay chunk 均返回 HTTP 200；未打开交互预览或生成截图。',
  '2026-08-14 22:06:09 网页端高风险 relay 统一收口：parseTournamentRegulations、saveSignature、getSignatureStatus、updateMatchSignature、updateMatchLineup、applyTournament、tournamentReview、getMyTeams、bindPhone 现在必须通过有效网页会话；网页端规程解析已从独立函数地址切回 webLoginApi relay。9 个无会话 callFunction 探针均返回 AUTH_REQUIRED，/admin/ 静态包上传 191 个文件且入口 HTTP 200，线上 cloud chunk 读回 parseTournamentRegulations=relay。webLoginApi 线上读回 Nodejs18.15/index.main/Deployment completed。',
  '2026-08-14 21:58:11 webLoginApi 通用函数中转权限收口：generatePlayerCard、generateQRCode、removeImageBg、baiduRemoveBg 现在必须通过有效网页会话，避免匿名代理消耗 AI/微信能力或读取受保护数据；4 个无会话 callFunction 探针均返回 AUTH_REQUIRED。函数线上读回 Nodejs18.15/index.main/Deployment completed。',
  '2026-08-14 21:36:54 webLoginApi 通用 dbQuery 租户边界已收紧：球队、赛事、裁判及长期球员库不再以 creatorId/ownerId 代替当前机构；球队/球员/比赛等关联数据只有在当前机构或明确赛事/球队授权关系内可读写；orgId、organizationId、organization_id 兼容读取，多个机构字段冲突时拒绝访问。函数线上读回 Nodejs18.15/index.main/Deployment completed；无会话 dbQuery 探针返回 AUTH_REQUIRED。',
  '2026-08-14 21:45:24 webLoginApi 上传入口已补齐会话校验、8MB 大小上限、目录/文件名规范化；无会话 uploadImage 与 uploadToCosDirect 探针均返回 AUTH_REQUIRED，两个测试对象已删除并读回不存在。函数线上列表读回 Nodejs18.15/Deployment completed。',
  '2026-08-14 21:52:10 webLoginApi 已收口旧赛事中心 relay：getTeams/getPlayers/getTournaments 读取统一转入受保护 dbQuery，create/update/delete Team/Player 统一使用当前机构边界；9 个旧函数的无会话 callFunction 探针均返回 AUTH_REQUIRED。',
  '2026-08-15 08:22:34 正式名单竞赛组别隔离线上回读：getMiniWorkspace 正式名单读取/提交与 webLoginApi PC 名单异常台账统一按赛事 divisionId 解析组别要求；多组别球队必须显式传入 divisionId，名单快照保存 divisionId/divisionName，实名认证、标准形象照和家长补充资料按组别配置判断。getMiniWorkspace 读回 Nodejs18.15 / Deployment completed（08:15:38），webLoginApi 读回 Nodejs18.15 / Active（08:20:38），固定入口无会话探针 HTTP 200 + AUTH_REQUIRED；node --check、npm run build、git diff --check、162/162 静态门禁通过。未读取或写入真实名单数据、未预览、未提交、未推送；视觉待验收仍 9 个，小程序 1.0.7 仍未提交审核或发布。',
  '2026-08-15 08:29:00 小程序正式名单组别逻辑上传开发者版本：微信开发者工具 CLI 成功上传 1.0.10，回读 TOTAL 1,547,151 bytes，主包 977.0 KB，packageA 33.4 KB、pages/match 70.5 KB、pages/team 211.3 KB、pages/tournament 218.8 KB；仅开发者上传，未提交审核、未发布、未预览，线上用户版本未切换。',
  '2026-08-15 08:36:00 正式名单路由台账同步：三条小程序名单入口统一补记 divisionId=:divisionId，与多组别显式选择、组别要求解析及 roster_snapshots.divisionId 隔离一致；node --check tools/ui-delivery-inventory.js、162/162 静态门禁、git diff --check 通过，未触碰线上业务数据、未预览、未发布。',
  '2026-08-15 08:34:08 PC 名单异常看板跨组别串显修复并上线：选择 divisionId 时，webLoginApi.rosterExceptionBoard 同时过滤参赛关系、球队集合和 roster_snapshots.divisionId；webLoginApi 读回 Nodejs18.15 / Active / ModTime 08:33:36，无会话探针 HTTP 200 + AUTH_REQUIRED；node --check、162/162 静态门禁、git diff --check 通过，未读取或写入真实名单数据、未预览、未提交、未推送。',
  '2026-08-15 08:37:46 参赛管理组别隔离修复并上线：getMiniWorkspace.teamParticipation 按参赛关系 divisionId 过滤正式名单快照和下一场比赛，单组别赛事才兼容旧快照/比赛；小程序参赛卡片进入赛事详情同步传递 divisionId。getMiniWorkspace 读回 Nodejs18.15 / Active / ModTime 08:37:04；node --check、162/162 静态门禁、git diff --check 通过，未读取或写入真实赛事数据、未预览、未提交、未推送。',
  '2026-08-15 08:37:46 小程序开发者版本同步：微信开发者工具 CLI 上传 1.0.11 成功，回读 TOTAL 1,547,288 bytes，主包 977.0 KB，packageA 33.4 KB、pages/match 70.5 KB、pages/team 211.4 KB、pages/tournament 218.8 KB；未提交审核、未发布、未预览，线上用户版本未切换。',
  '2026-08-15 08:40:07 历史参赛记录组别隔离并上线：getMiniWorkspace.teamHistory 按参赛关系 divisionId 过滤归档比赛并返回组别，单组别赛事才兼容无组别旧比赛；getMiniWorkspace 读回 Nodejs18.15 / Active / ModTime 08:39:39，node --check、162/162 静态门禁、git diff --check 通过，未读取或写入真实历史赛事数据、未预览、未提交、未推送。',
  '2026-08-15 08:40:07 小程序开发者版本同步：CLI 上传 1.0.12 成功，回读 TOTAL 1,547,288 bytes，主包 977.0 KB、pages/team 211.4 KB；仅开发者上传，未提交审核、未发布、未预览，线上用户版本未切换。',
  '2026-08-15 08:44:28 比赛阵容正式名单组别隔离并上线：getMiniWorkspace.matchLineup 按比赛 divisionId 选择已审核正式名单，多组别且比赛缺组别时安全阻断并回传 divisionId；getMiniWorkspace 读回 Nodejs18.15 / Active / ModTime 08:43:57，node --check、162/162 静态门禁、git diff --check 通过，未读取或写入真实比赛/阵容数据、未预览、未提交、未推送。',
  '2026-08-15 08:44:28 小程序开发者版本同步：CLI 上传 1.0.13 成功，回读 TOTAL 1,547,288 bytes；仅开发者上传，未提交审核、未发布、未预览，线上用户版本未切换。',
  '2026-08-15 08:46:29 球队数据包组别参赛关系校验并上线：getMiniWorkspace.teamDataPackage 要求有效参赛关系匹配请求 divisionId，多组别未传组别时阻断；getMiniWorkspace 读回 Nodejs18.15 / Active / ModTime 08:46:03，node --check、162/162 静态门禁、git diff --check 通过，未读取或写入真实数据包、未预览、未提交、未推送。',
  '2026-08-15 08:46:29 小程序开发者版本同步：CLI 上传 1.0.14 成功，回读 TOTAL 1,547,288 bytes；仅开发者上传，未提交审核、未发布、未预览，线上用户版本未切换。',
  '2026-08-15 08:49:34 专业版升级名单初始化组别隔离并上线：webLoginApi.upgradeDivisionToProfessional 按目标 divisionId 选择名单快照，无组别旧快照仅在单组别赛事兼容；webLoginApi 读回 Nodejs18.15 / Active / ModTime 08:49:03，无会话探针 HTTP 200 + AUTH_REQUIRED；node --check、162/162 静态门禁、git diff --check 通过，未读取或写入真实赛事/名单/权益数据、未预览、未提交、未推送。',
  '2026-08-15 08:49:34 专业版升级名单初始化组别隔离并上线：webLoginApi.upgradeDivisionToProfessional 按目标 divisionId 选择名单快照，无组别旧快照仅在单组别赛事兼容；webLoginApi 读回 Nodejs18.15 / Active / ModTime 08:49:03，无会话探针 HTTP 200 + AUTH_REQUIRED；node --check、162/162 静态门禁、git diff --check 通过，未读取或写入真实赛事/名单/权益数据、未预览、未提交、未推送。',
  '2026-08-15 08:52:00 名单异常处理写入边界组别隔离并上线：rosterExceptionBoard.requestProfileCorrection 与 returnRoster 校验名单快照和目标 divisionId；无组别旧快照仅在单组别赛事兼容，避免跨组别误改名单状态。webLoginApi 读回 Nodejs18.15 / Active / ModTime 08:51:35，无会话探针 HTTP 200 + AUTH_REQUIRED；node --check、162/162 静态门禁、git diff --check 通过，未读取或写入真实名单数据、未预览、未提交、未推送；小程序开发者版仍为 1.0.14，未提交审核或发布。',
  '2026-08-15 09:08:00 球队数据包历史比赛兼容修复并上线：getMiniWorkspace.teamDataPackageData 复用单组别旧比赛兼容规则，无 divisionId 的历史比赛仅在单组别赛事纳入，多组别仍严格按组别过滤；getMiniWorkspace 读回 Nodejs18.15 / Active / ModTime 09:07:05；node --check、162/162 静态门禁、git diff --check 通过，未读取或写入真实数据包、比赛或球员数据，未预览、未提交、未推送。',
  '2026-08-15 09:25:00 报名组别隔离与 PC 入口上线：applyTournament 按赛事竞赛组别区分同一球队的报名关系，多组别要求显式 divisionId，校验无效/歧义组别并将 divisionId 写入 tournament_teams 与 invitations；TournamentCenter.vue、TournamentDetail.vue 同步读取并选择可报名组别。applyTournament 读回 Nodejs16.13 / Active / ModTime 09:17:46；npm run build、node --check、162/162 静态门禁、git diff --check 通过。CloudBase Hosting 上传 /admin/ 193 个文件，saixiaofeng.com/admin/ 与根域名入口均 HTTP 200 并引用最新 JS/CSS 哈希；未使用真实报名数据、未预览、未提交、未推送。',
  '2026-08-15 09:42:00 报名行为服务端收口并同步开发者版：miniprogram/pages/tournament/signup/signup.js 不再直接写入 tournament_teams，统一调用 applyTournament；云函数按小程序微信会话唯一识别账号，校验球队归属/成员权限、免责声明、赛事状态、竞赛方案锁定、重复关系、组别与名额。applyTournament 线上读回 Deployment completed（modifyTime 09:39:46）；小程序开发者版本 1.0.15 上传成功，包体 1,547,183 bytes，未提交审核、未发布；node --check、162/162 静态交付门禁通过，9 个视觉节点仍待预览验收。',
  '2026-08-15 09:47:00 报名组别锁定字段兼容上线：applyTournament 的组别级竞赛方案锁定判断同时识别 id/_id/divisionId/division/divisionKey，避免组别主键采用 id 时漏掉已锁定方案。函数重新部署并安全回读 Deployment completed（modifyTime 09:46:35）；无会话固定入口返回 AUTH_REQUIRED；node --check、162/162 静态门禁与 git diff --check 通过，未读取或写入真实报名数据、未预览、未提交、未推送。',
  '2026-08-15 09:58:00 原型全链路画板审计回读：prototype-flow-editor audit-board 对 2026-07-30-阶段版返回 passed=true、11 sections、162 officialPages、pendingNodes=0、missingPaths=[]、missingLogic=[]；9 个重复源图引用均为跨流程复用，不新增正式节点缺口。未修改画板、未预览、未发布。',
  '2026-08-15 09:59:00 线上入口与关键函数只读回读：saixiaofeng.com、/admin/、/referee/、/service-account-h5/ 均 HTTP 200；applyTournament 09:46:35、getMiniWorkspace 09:07:05、webLoginApi 08:51:35、organizerClaimInvite 04:48:21、onboardingWorkspace 2026-08-14 22:52:53、sendRefereeTemplateMessages 05:42:14 均为 Deployment completed。未读取函数详情或敏感配置，未写入业务数据、未预览、未发布。'
]

if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify({ generatedAt: new Date().toISOString(), board: board.title, summary, verificationNotes, nodes }, null, 2))
} else {
  console.log(`画板节点：${summary.total}`)
  console.log(`已登记正式路由：${summary.routed}`)
  console.log(`端类型：${Object.entries(summary.byType).map(([key, value]) => `${key} ${value}`).join('；')}`)
  console.log(`素材包状态：${Object.entries(summary.byAssetStatus).map(([key, value]) => `${key} ${value}`).join('；')}`)
  console.log(`技术边界复核：${verificationNotes.length} 条`)
}




