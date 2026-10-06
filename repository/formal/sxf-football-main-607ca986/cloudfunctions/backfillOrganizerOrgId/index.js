// 历史业务数据 orgId 归属预检查工具。
// 当前版本严格只读：只输出可迁移、冲突和无法判断的数量，不执行任何数据库更新。
const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex')
}

async function requirePlatformOwner(event) {
  const token = String((event && (event.__authToken || event.authToken)) || '').trim()
  if (!token) throw new Error('缺少平台所有者登录会话')
  const _ = db.command
  const sessionResult = await db.collection('auth_sessions').where({
    tokenHash: hashSessionToken(token),
    active: true,
    expiresAt: _.gt(new Date())
  }).limit(2).get()
  const sessions = sessionResult.data || []
  if (sessions.length !== 1) throw new Error('平台所有者登录会话已失效')
  const userResult = await db.collection('users').doc(sessions[0].userId).get()
  const user = Array.isArray(userResult.data) ? userResult.data[0] : userResult.data
  if (!user || user.isPlatformOwner !== true) throw new Error('仅平台所有者可以执行归属预检查')
  return user
}

function addIndex(map, key, userId) {
  const value = String(key || '').trim()
  if (!value) return
  if (!map.has(value)) map.set(value, new Set())
  map.get(value).add(userId)
}

function buildUserIndexes(users) {
  const byId = new Map()
  const byPhone = new Map()
  const byOpenId = new Map()
  users.forEach(user => {
    byId.set(user._id, user)
    ;[user.phone, user.phoneNumber].forEach(value => addIndex(byPhone, value, user._id))
    ;[user.openId, user.openid, user.wechatOpenId, user._openid, user.unionId]
      .forEach(value => addIndex(byOpenId, value, user._id))
  })
  return { byId, byPhone, byOpenId }
}

function resolveRootOwner(record, indexes, rules) {
  if (record.orgId) return { status: 'owned', orgId: String(record.orgId), source: 'orgId' }
  const candidates = new Set()
  ;(rules.idFields || []).forEach(field => {
    const value = record[field]
    if (value && indexes.byId.has(value)) candidates.add(value)
  })
  ;(rules.phoneFields || []).forEach(field => {
    const ids = indexes.byPhone.get(String(record[field] || '').trim())
    if (ids) ids.forEach(id => candidates.add(id))
  })
  ;(rules.openIdFields || []).forEach(field => {
    const ids = indexes.byOpenId.get(String(record[field] || '').trim())
    if (ids) ids.forEach(id => candidates.add(id))
  })
  if (candidates.size === 0) return { status: 'unresolved' }
  if (candidates.size > 1) return { status: 'ambiguous', candidates: Array.from(candidates) }
  const userId = Array.from(candidates)[0]
  const user = indexes.byId.get(userId)
  const orgId = String(user.orgId || user.organizationId || '').trim()
  if (!orgId) return { status: 'unresolved', userId, reason: 'user_missing_org' }
  return { status: 'resolvable', orgId, userId }
}

function resolveChildOwner(record, parentMaps) {
  if (record.orgId) return { status: 'owned', orgId: String(record.orgId), source: 'orgId' }
  const candidates = new Set()
  const addParent = (map, key) => {
    if (key && map.has(key)) candidates.add(map.get(key))
  }
  addParent(parentMaps.tournaments, record.tournamentId)
  addParent(parentMaps.teams, record.teamId)
  addParent(parentMaps.teams, record.teamCode)
  addParent(parentMaps.matches, record.matchId)
  ;(Array.isArray(record.teamIds) ? record.teamIds : []).forEach(id => addParent(parentMaps.teams, id))
  ;(Array.isArray(record.teamCodes) ? record.teamCodes : []).forEach(id => addParent(parentMaps.teams, id))
  if (candidates.size === 0) return { status: 'unresolved' }
  if (candidates.size > 1) return { status: 'ambiguous', candidates: Array.from(candidates) }
  return { status: 'resolvable', orgId: Array.from(candidates)[0], source: 'parent' }
}

function createReport(name) {
  return { collection: name, total: 0, alreadyOwned: 0, resolvable: 0, ambiguous: 0, unresolved: 0, samples: [] }
}

function recordResolution(report, record, resolution) {
  report.total++
  if (resolution.status === 'owned') report.alreadyOwned++
  else if (resolution.status === 'resolvable') report.resolvable++
  else if (resolution.status === 'ambiguous') report.ambiguous++
  else report.unresolved++
  if (resolution.status !== 'owned' && report.samples.length < 10) {
    report.samples.push({
      id: record._id,
      name: record.name || record.teamName || record.matchName || '',
      status: resolution.status,
      proposedOrgId: resolution.orgId || '',
      candidates: resolution.candidates || []
    })
  }
}

async function loadCollection(name) {
  const result = await db.collection(name).limit(1000).get()
  return result.data || []
}

exports.main = async event => {
  try {
    await requirePlatformOwner(event || {})
    if (event && event.mode && event.mode !== 'dryRun') {
      return { success: false, error: '当前版本仅支持 dryRun，不允许写入历史数据' }
    }

    const users = await loadCollection('users')
    const indexes = buildUserIndexes(users)
    const parentMaps = { tournaments: new Map(), teams: new Map(), matches: new Map() }
    const reports = []

    const rootRules = {
      tournaments: {
        idFields: ['creatorId', 'organizerId', 'ownerId', 'userId', 'createdBy'],
        phoneFields: ['creatorPhone', 'organizerPhone', 'ownerPhone', 'contactPhone', 'phoneNumber', 'phone'],
        openIdFields: ['openId', 'openid', 'wechatOpenId', '_openid']
      },
      teams: {
        idFields: ['creatorId', 'ownerId', 'userId', 'createdBy'],
        phoneFields: ['ownerPhone', 'creatorPhone', 'contactPhone', 'phoneNumber', 'phone', 'mobile'],
        openIdFields: ['openId', 'openid', 'wechatOpenId', '_openid']
      },
      referees: {
        idFields: ['creatorId', 'organizerId', 'ownerId', 'userId', 'createdBy'],
        phoneFields: ['creatorPhone', 'organizerPhone', 'ownerPhone'],
        openIdFields: ['openId', 'openid', 'wechatOpenId', '_openid']
      },
      player_library: {
        idFields: ['owner', 'creatorId', 'userId', 'createdBy'],
        phoneFields: ['creatorPhone'],
        openIdFields: []
      },
      coach_library: {
        idFields: ['creator', 'creatorId', 'userId', 'createdBy'],
        phoneFields: ['creatorPhone'],
        openIdFields: []
      }
    }

    for (const name of Object.keys(rootRules)) {
      const records = await loadCollection(name)
      const report = createReport(name)
      records.forEach(record => {
        const resolution = resolveRootOwner(record, indexes, rootRules[name])
        recordResolution(report, record, resolution)
        if ((name === 'tournaments' || name === 'teams') && resolution.orgId) {
          const map = name === 'tournaments' ? parentMaps.tournaments : parentMaps.teams
          map.set(record._id, resolution.orgId)
          if (name === 'teams') {
            if (record.teamCode) map.set(record.teamCode, resolution.orgId)
            if (record.code) map.set(record.code, resolution.orgId)
          }
        }
      })
      reports.push(report)
    }

    const firstLevel = [
      'players', 'coaches', 'management', 'matches', 'tournament_referees',
      'tournament_teams', 'tournament_groups', 'tournament_bracket',
      'tournament_league_tables', 'rosters', 'roster_change_requests',
      'standings', 'schedule_info', 'team_tasks'
    ]
    for (const name of firstLevel) {
      const records = await loadCollection(name)
      const report = createReport(name)
      records.forEach(record => {
        const resolution = resolveChildOwner(record, parentMaps)
        recordResolution(report, record, resolution)
        if (name === 'matches' && resolution.orgId) parentMaps.matches.set(record._id, resolution.orgId)
      })
      reports.push(report)
    }

    for (const name of ['match_events', 'match_referees', 'squads']) {
      const records = await loadCollection(name)
      const report = createReport(name)
      records.forEach(record => recordResolution(report, record, resolveChildOwner(record, parentMaps)))
      reports.push(report)
    }

    const usersMissingOrgId = users.filter(user => !user.orgId).length
    return {
      success: true,
      mode: 'dryRun',
      writePerformed: false,
      applyBlocked: true,
      users: { total: users.length, missingOrgId: usersMissingOrgId },
      reports
    }
  } catch (err) {
    console.error('[backfillOrganizerOrgId] dryRun failed:', err)
    return { success: false, error: err.message || '归属预检查失败', writePerformed: false }
  }
}
