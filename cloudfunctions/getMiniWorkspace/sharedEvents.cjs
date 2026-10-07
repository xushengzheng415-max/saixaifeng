const RIGHTS = {
  'event.dashboard': '赛事主控制台', 'event.competition': '竞赛管理',
  'event.registration': '报名管理', 'event.teams': '球队管理', 'event.draw': '抽签与分组',
  'event.matches': '比赛管理', 'event.results': '赛果管理', 'event.news': '新闻中心',
  'event.referees': '裁判管理', 'event.settings': '赛事设置',
  'result.supplement': '补录成绩', 'news.edit': '新闻编辑', 'news.publish': '新闻发布／撤回'
}
const text = value => String(value == null ? '' : value).trim()

async function list(db, userId) {
  const grants = []
  for (let skip = 0; ; skip += 100) {
    let rows
    try { rows = (await db.collection('tournament_staff_grants').where({ userId: text(userId), status: 'active' }).skip(skip).limit(100).get()).data || [] }
    catch (error) {
      if (/collection.*not exist|ns does not exist|NamespaceNotFound/i.test(String(error.message || ''))) return []
      throw error
    }
    grants.push(...rows)
    if (grants.length > 1000) throw new Error('共享授权过多，请联系主办方核对')
    if (rows.length < 100) break
  }
  const result = []
  for (const grant of grants) {
    let event
    try { const reply = await db.collection('tournaments').doc(text(grant.tournamentId)).get(); event = Array.isArray(reply.data) ? reply.data[0] : reply.data }
    catch (error) { if (/document.*(not exist|not found)/i.test(String(error.message || ''))) continue; throw error }
    if (!event || text(event.orgId || event.organizationId || event.organization_id) !== text(grant.orgId)) continue
    const permissions = [...new Set((Array.isArray(grant.permissions) ? grant.permissions : []).filter(right => RIGHTS[right]))]
    if (!permissions.length) continue
    const status = text(event.status)
    result.push({
      id: text(event._id), grantId: text(grant._id), orgId: text(grant.orgId),
      name: text(event.name || event.tournamentName) || '赛事',
      isShared: true, isHosted: false, isParticipating: false, relation: 'shared', relationText: '共享赛事',
      permissions, permissionText: permissions.map(right => RIGHTS[right]).join('、'),
      status, statusText: ({draft:'待开始',upcoming:'待开始',registering:'报名中',ongoing:'进行中',completed:'已结束',finished:'已结束'})[status] || '赛事',
      dateText: [text(event.startDate).slice(0,10),text(event.endDate).slice(0,10)].filter(Boolean).join(' — '),
      location: text(event.location || event.city), modeText: '共享授权',
      teamCountText: '按赛事授权', matchCountText: '', cardClass: 'event-card-simple'
    })
  }
  return [...new Map(result.map(item => [item.id, item])).values()]
}

function workspace(item) {
  return { id: 'shared:' + item.id, type: 'tournament_shared', orgId: item.orgId, tournamentId: item.id,
    name: item.name, logo: '', capabilities: ['event'], positions: ['赛事工作人员'],
    permissions: ['event.view'], sharedPermissions: item.permissions, isTemporary: true,
    entitlements: { event: { collaboration: 'free' }, training: { status: 'unavailable', canUse: false } } }
}

function context(identity, workspaces, currentWorkspace, tournaments) {
  return { success: true, user: { id: identity.user._id, phone: identity.phone, phoneNumber: identity.phone,
    phoneVerified: true, phoneMasked: text(identity.phone).slice(0,3) + '****' + text(identity.phone).slice(-4),
    nickName: text(identity.user.nickname || identity.user.nickName || identity.user.name) || '微信用户',
    avatarUrl: text(identity.user.avatarUrl || identity.user.headimgurl) },
    workspaces, currentWorkspace, currentIdentity: { id:'event_staff', label:'赛事协作者', available:['event_staff'] },
    modules: [{id:'event',name:'赛事',enabled:true}], tournaments,
    teams:[],schedule:[],eventSchedule:[],trainingSchedule:[],upcoming:[],tasks:[],eventTasks:[],trainingTasks:[],messages:[],unreadMessageCount:0,
    statistics:{tournamentCount:tournaments.length,teamCount:0,playerCount:0,matchCount:0,pendingCount:0} }
}
module.exports = { list, workspace, context }
