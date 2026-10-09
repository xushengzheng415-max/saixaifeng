'use strict'

const text = value => typeof value === 'string' ? value.trim().slice(0, 160) : ''
const orgId = row => text(row.orgId || row.organizationId || row.organization_id)
const creatorId = row => text(row.creatorId || row.createdBy || row.creatorUserId)
const memberId = row => text(row.userId || row.memberUserId)
const active = row => !['deleted','cancelled','removed','rejected','inactive','revoked'].includes(row.status) && row.isActive !== false
const SOURCE_LABELS = { pc: 'PC注册', web: 'PC注册', pc_register: 'PC注册', web_register: 'PC注册', pc_wechat: 'PC微信注册', mini: '小程序注册', miniprogram: '小程序注册', mini_program: '小程序注册', mini_register: '小程序注册', admin: '后台创建', import: '导入创建' }
function accountSummary(user) {
  // A later WeChat binding is not evidence of the original registration channel.
  const source = text(user.registrationChannel || user.registerChannel || user.registrationSource || user.registerSource || user.createdFrom)
  const loginMethods = []
  if (user.openId || user.openid || user._openid) loginMethods.push('小程序微信')
  if (user.wechatOpenId) loginMethods.push('PC微信')
  if (user.passwordHash || user.password) loginMethods.push('账号密码')
  return {
    id: text(user._id), name: text(user.contactName || user.nickname || user.userName || user.name) || '未填写姓名',
    phone: text(user.phone || user.phoneNumber), orgId: orgId(user),
    registrationSource: SOURCE_LABELS[source] || '来源未记录', sourceRecorded: Boolean(SOURCE_LABELS[source]),
    loginMethods, createTime: user.createTime || user.createdAt || null,
    lastLoginTime: user.lastLoginTime || user.lastLoginAt || null,
    status: user.status === 'disabled' || user.isActive === false ? '已停用' : '正常',
    pcStatus: user.pcAccountStatus === 'cancelled' ? '已注销' : '未注销'
  }
}
async function readAll(db, name, conditions, optional = false) {
  const rows = []
  try {
    for (let offset = 0; ; offset += 100) {
      let query = db.collection(name)
      if (conditions?.length) query = query.where(conditions.length === 1 ? conditions[0] : db.command.or(conditions))
      const page = (await query.orderBy('_id', 'asc').skip(offset).limit(100).get()).data || []
      rows.push(...page)
      if (page.length < 100) return rows
      if (offset >= 49900) throw new Error('关联记录过多，请缩小查询范围')
    }
  } catch (error) {
    if (optional && /collection.*(not exist|not found)|DATABASE_COLLECTION_NOT_EXIST/i.test(String(error.message))) return []
    throw new Error(`无法读取${name}，请重试；未将读取失败当作无数据`)
  }
}
async function getCustomerProfile(db, event) {
  const requestedUser = text(event.userId), requestedOrg = text(event.orgId)
  if (!requestedUser && !requestedOrg) throw new Error('缺少客户账号或机构')
  const [users, organizations, memberships, teamMemberships] = await Promise.all([
    readAll(db, 'users'), readAll(db, 'organizations', null, true),
    readAll(db, 'organization_memberships', null, true), readAll(db, 'team_memberships', null, true)
  ])
  const target = users.find(user => user._id === requestedUser)
  if (requestedUser && !target) throw new Error('客户账号不存在，请刷新列表')
  if (requestedOrg && !organizations.some(row => row._id === requestedOrg)) throw new Error('关联机构不存在，请核查资料')
  const orgIds = new Set(requestedOrg ? [requestedOrg] : [])
  if (!requestedOrg && target) {
    if (orgId(target)) orgIds.add(orgId(target))
    organizations.filter(row => [row.ownerId, row.creatorId, row.createdBy].includes(requestedUser)).forEach(row => orgIds.add(row._id))
    memberships.filter(row => active(row) && memberId(row) === requestedUser).forEach(row => { if (orgId(row)) orgIds.add(orgId(row)) })
  }
  const relatedMemberships = memberships.filter(row => active(row) && orgIds.has(orgId(row)))
  const userIds = new Set([requestedUser, ...relatedMemberships.map(memberId)].filter(Boolean))
  users.filter(row => orgIds.has(orgId(row))).forEach(row => userIds.add(row._id))
  organizations.filter(row => orgIds.has(row._id)).forEach(row => [row.ownerId, row.creatorId, row.createdBy].filter(Boolean).forEach(id => userIds.add(id)))
  const selectedUsers = users.filter(row => userIds.has(row._id))
  const byId = new Map(selectedUsers.map(row => [row._id, accountSummary(row)]))
  const creatorName = row => byId.get(creatorId(row))?.name || (creatorId(row) ? '未关联到当前账号' : '创建人未记录')
  const relatedTeams = teamMemberships.filter(row => active(row) && userIds.has(memberId(row))).map(row => row.teamId).filter(Boolean)
  const conditions = []
  for (const id of userIds) for (const field of ['creatorId','createdBy','creatorUserId','ownerId','ownerUserId','userId']) conditions.push({ [field]: id })
  for (const id of orgIds) for (const field of ['orgId','organizationId','organization_id']) conditions.push({ [field]: id })
  async function scoped(name, extra = []) {
    const all = [...conditions, ...extra], result = new Map()
    for (let index = 0; index < all.length; index += 15) {
      for (const row of await readAll(db, name, all.slice(index, index + 15), true)) result.set(row._id, row)
    }
    return [...result.values()]
  }
  const [teams, tournaments] = await Promise.all([scoped('teams', relatedTeams.map(id => ({ _id: id }))), scoped('tournaments')])
  const players = await scoped('players', teams.map(row => ({ teamId: row._id })))
  const teamNames = new Map(teams.map(row => [row._id, text(row.name || row.teamName) || '未命名球队']))
  const relation = row => userIds.has(creatorId(row)) ? '账号创建' : orgIds.has(orgId(row)) ? '机构关联' : '管理或成员关联'
  return { success: true, data: {
    accounts: selectedUsers.map(row => ({ ...accountSummary(row),
      relation: row._id === requestedUser ? '当前联系人账号' : '关联机构账号',
      createdTeams: teams.filter(team => creatorId(team) === row._id).map(team => text(team.name || team.teamName) || '未命名球队'),
      createdTournaments: tournaments.filter(item => creatorId(item) === row._id).map(item => text(item.name || item.tournamentName) || '未命名赛事')
    })),
    organizations: organizations.filter(row => orgIds.has(row._id)).map(row => ({ id: row._id, name: text(row.name || row.organizationName) || '未命名机构' })),
    teams: teams.map(row => ({ platformArchived: row.platformArchived === true, platformArchiveRevision: row.platformArchiveRevision || 0, id: row._id, name: teamNames.get(row._id), relation: relation(row), creatorName: creatorName(row), createTime: row.createTime || row.createdAt || null, playerCount: players.filter(p => p.teamId === row._id).length })),
    tournaments: tournaments.map(row => ({ platformArchived: row.platformArchived === true, platformArchiveRevision: row.platformArchiveRevision || 0, id: row._id, name: text(row.name || row.tournamentName) || '未命名赛事', relation: relation(row), creatorName: creatorName(row), createTime: row.createTime || row.createdAt || null, status: text(row.status) })),
    players: players.map(row => ({ id: row._id, name: text(row.name || row.playerName) || '未命名球员', teamName: teamNames.get(row.teamId) || '球队关联待核查', relation: relation(row) })),
    generatedAt: new Date().toISOString()
  } }
}
module.exports = { accountSummary, getCustomerProfile }
