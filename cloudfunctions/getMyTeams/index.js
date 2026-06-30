// 云函数：根据手机号/userId 查询当前用户关联的球队
// v2.0 精简：只查 ownerPhone + creatorId，不再查冗余字段
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function addTeamUnique(resultList, team, roleLabel) {
  for (var i = 0; i < resultList.length; i++) {
    if (resultList[i]._id === team._id) return false
  }
  resultList.push({
    _id: team._id,
    teamId: team.teamId || team._id,
    name: team.name || '',
    teamName: team.name || '',
    shortName: team.shortName || '',
    logo: team.logo || '',
    ownerPhone: team.ownerPhone || '',
    creatorId: team.creatorId || '',
    claimStatus: team.claimStatus || '',
    teamCode: team.teamCode || '',
    teamType: team.teamType || '',
    provinceCode: team.provinceCode || '',
    cityCode: team.cityCode || '',
    cityName: team.cityName || '',
    source: team.source || '',
    role: roleLabel || '教练'
  })
  return true
}

exports.main = async (event) => {
  const { phone, role, openId, userId } = event
  console.log('[getMyTeams] phone:', phone ? '有' : '无', 'userId:', userId ? '有' : '无', 'openId:', openId ? '有' : '无')

  if (!phone && !openId && !userId) {
    return { success: false, message: '缺少查询参数' }
  }

  try {
    var result = { success: true, teams: [], coachInfo: null }

    // ===== 方案A：ownerPhone 直查（1次查询，最快）=====
    if (phone) {
      try {
        var phoneQuery = await db.collection('teams').where({ ownerPhone: phone }).get()
        console.log('[getMyTeams] ownerPhone 查到:', phoneQuery.data.length, '支')
        if (phoneQuery.data?.length > 0) {
          for (var k = 0; k < phoneQuery.data.length; k++) {
            addTeamUnique(result.teams, phoneQuery.data[k], '所有者')
          }
        }
      } catch (e) { console.warn('[getMyTeams] ownerPhone查询失败:', e.message) }
    }

    // ===== 方案B：creatorId 直查 =====
    const lookupId = userId || openId
    if (lookupId) {
      try {
        var creatorQuery = await db.collection('teams').where({ creatorId: lookupId }).get()
        console.log('[getMyTeams] creatorId 查到:', creatorQuery.data.length, '支')
        if (creatorQuery.data?.length > 0) {
          for (var c = 0; c < creatorQuery.data.length; c++) {
            addTeamUnique(result.teams, creatorQuery.data[c], '创建者')
          }
        }
      } catch (e) { console.warn('[getMyTeams] creatorId查询失败:', e.message) }
    }

    // ===== 方案C：coach_library 兜底（历史数据）=====
    if ((role === 'coach' || !role) && phone && result.teams.length < 2) {
      try {
        var coachRes = await db.collection('coach_library')
          .where(db.command.or([{ phone }, { phoneNumber: phone }]))
          .limit(1).get()

        if (coachRes.data?.length > 0) {
          var coach = coachRes.data[0]
          result.coachInfo = {
            _id: coach._id, name: coach.name || '',
            phone: coach.phone || coach.phoneNumber || '',
            avatarUrl: coach.avatarUrl || '', idNumber: coach.idNumber || ''
          }

          var assignRes = await db.collection('coach_assignments')
            .where({ coachId: coach._id, status: 'active' }).get()

          if (assignRes.data?.length > 0) {
            var teamIds = assignRes.data.map(a => a.teamId)
            var teamsRes = await db.collection('teams').where({ _id: db.command.in(teamIds) }).get()
            console.log('[getMyTeams] coach_library 补充:', teamsRes.data.length, '支')
            if (teamsRes.data?.length > 0) {
              for (var j = 0; j < teamsRes.data.length; j++) {
                addTeamUnique(result.teams, teamsRes.data[j], '教练')
              }
            }
          }
        }
      } catch (e) { console.warn('[getMyTeams] coach_library查询失败:', e.message) }
    }

    console.log('[getMyTeams] 总计:', result.teams.length, '支')
    return result
  } catch (err) {
    console.error('[getMyTeams] 失败:', err)
    return { success: false, message: err.message || '查询失败' }
  }
}
