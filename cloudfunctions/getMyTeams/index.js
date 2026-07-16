// getMyTeams/index.js
// Query teams for the current mini-program account. Phone binding is the primary identity.
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function firstNonEmpty() {
  for (var i = 0; i < arguments.length; i++) {
    if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== '') return arguments[i]
  }
  return ''
}

function addTeamUnique(resultList, team, roleLabel) {
  if (!team) return false
  for (var i = 0; i < resultList.length; i++) {
    if (resultList[i]._id === team._id) return false
  }
  resultList.push({
    _id: team._id,
    teamId: team.teamId || team._id,
    name: firstNonEmpty(team.name, team.teamName),
    teamName: firstNonEmpty(team.teamName, team.name),
    shortName: team.shortName || '',
    logo: firstNonEmpty(team.logo, team.logoUrl, team.teamLogo),
    teamLogo: firstNonEmpty(team.teamLogo, team.logo, team.logoUrl),
    ownerPhone: firstNonEmpty(team.ownerPhone, team.creatorPhone, team.phoneNumber, team.phone, team.contactPhone, team.mobile),
    creatorPhone: team.creatorPhone || '',
    phoneNumber: firstNonEmpty(team.phoneNumber, team.phone),
    phone: firstNonEmpty(team.phone, team.phoneNumber),
    contactPhone: team.contactPhone || '',
    mobile: team.mobile || '',
    creatorId: team.creatorId || '',
    ownerId: team.ownerId || '',
    userId: team.userId || '',
    openId: team.openId || '',
    wechatOpenId: team.wechatOpenId || '',
    _openid: team._openid || '',
    claimStatus: team.claimStatus || '',
    teamCode: team.teamCode || '',
    teamType: team.teamType || '',
    provinceCode: team.provinceCode || '',
    cityCode: team.cityCode || '',
    cityName: team.cityName || '',
    playerCount: team.playerCount || 0,
    source: team.source || '',
    role: roleLabel || 'owner'
  })
  return true
}

async function queryTeamsByOr(conditions) {
  if (!conditions || conditions.length === 0) return []
  var where = conditions.length === 1 ? conditions[0] : db.command.or(conditions)
  var res = await db.collection('teams').where(where).limit(20).get()
  return res.data || []
}

function makeConditions(fields, value) {
  if (!value) return []
  return fields.map(function(field) {
    var item = {}
    item[field] = value
    return item
  })
}

exports.main = async function(event) {
  event = event || {}
  var phone = event.phone || event.phoneNumber || ''
  var role = event.role || ''
  var openId = event.openId || event.wechatOpenId || ''
  var userId = event.userId || ''

  console.log('[getMyTeams] phone:', phone ? 'yes' : 'no', 'userId:', userId ? 'yes' : 'no', 'openId:', openId ? 'yes' : 'no')

  if (!phone && !openId && !userId) {
    return { success: false, message: 'missing query params', teams: [] }
  }

  try {
    var result = { success: true, teams: [], coachInfo: null }

    if (phone) {
      try {
        var phoneFields = ['ownerPhone', 'creatorPhone', 'phoneNumber', 'phone', 'contactPhone', 'mobile']
        var phoneTeams = await queryTeamsByOr(makeConditions(phoneFields, phone))
        console.log('[getMyTeams] phone teams:', phoneTeams.length)
        for (var p = 0; p < phoneTeams.length; p++) addTeamUnique(result.teams, phoneTeams[p], 'owner')
      } catch (e) {
        console.warn('[getMyTeams] phone query failed:', e.message || e)
      }
    }

    if (result.teams.length === 0) {
      try {
        var idConditions = []
        idConditions = idConditions.concat(makeConditions(['creatorId', 'ownerId', 'userId'], userId))
        if (!phone && !userId) {
          idConditions = idConditions.concat(makeConditions(['openId', 'wechatOpenId', '_openid'], openId))
        }
        var idTeams = await queryTeamsByOr(idConditions)
        console.log('[getMyTeams] id teams:', idTeams.length)
        for (var i = 0; i < idTeams.length; i++) addTeamUnique(result.teams, idTeams[i], 'creator')
      } catch (e2) {
        console.warn('[getMyTeams] id query failed:', e2.message || e2)
      }
    }

    if ((role === 'coach' || !role) && phone && result.teams.length === 0) {
      try {
        var coachRes = await db.collection('coach_library')
          .where(db.command.or([{ phone: phone }, { phoneNumber: phone }, { mobile: phone }]))
          .limit(1).get()

        if (coachRes.data && coachRes.data.length > 0) {
          var coach = coachRes.data[0]
          result.coachInfo = {
            _id: coach._id,
            name: coach.name || '',
            phone: firstNonEmpty(coach.phone, coach.phoneNumber, coach.mobile),
            avatarUrl: firstNonEmpty(coach.avatarUrl, coach.avatar),
            idNumber: coach.idNumber || ''
          }

          var assignRes = await db.collection('coach_assignments')
            .where({ coachId: coach._id, status: 'active' }).get()

          if (assignRes.data && assignRes.data.length > 0) {
            var teamIds = assignRes.data.map(function(a) { return a.teamId }).filter(Boolean)
            if (teamIds.length > 0) {
              var teamsRes = await db.collection('teams').where({ _id: db.command.in(teamIds) }).get()
              console.log('[getMyTeams] coach teams:', teamsRes.data.length)
              for (var j = 0; j < teamsRes.data.length; j++) addTeamUnique(result.teams, teamsRes.data[j], 'coach')
            }
          }
        }
      } catch (e3) {
        console.warn('[getMyTeams] coach query failed:', e3.message || e3)
      }
    }

    console.log('[getMyTeams] total:', result.teams.length)
    return result
  } catch (err) {
    console.error('[getMyTeams] failed:', err)
    return { success: false, message: err.message || 'query failed', teams: [] }
  }
}
