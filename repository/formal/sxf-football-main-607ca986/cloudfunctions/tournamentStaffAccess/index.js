const cloud = require('wx-server-sdk')
const crypto = require('crypto')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const value = input => String(input == null ? '' : input).trim()
const hash = input => crypto.createHash('sha256').update(value(input)).digest('hex')
const policy = require('./policy.cjs')
const RIGHTS = [...policy.SIDEBAR_RIGHTS, 'result.supplement', 'news.edit', 'news.publish']
const GRANTS = 'tournament_staff_grants'

async function doc(name, id) {
  if (!id) return null
  try {
    const response = await db.collection(name).doc(id).get()
    return Array.isArray(response.data) ? response.data[0] || null : response.data || null
  } catch (_) { return null }
}

async function actor(event) {
  const token = value(event.__authToken)
  if (token) {
    const sessions = (await db.collection('auth_sessions').where({ tokenHash: hash(token), active: true, expiresAt: _.gt(new Date()) }).limit(2).get()).data || []
    if (sessions.length !== 1) throw new Error('登录会话已失效')
    const user = await doc('users', value(sessions[0].userId))
    if (!user || event.__actorUserId && value(event.__actorUserId) !== value(user._id)) throw new Error('登录身份校验失败')
    return { user, orgId: value(event.orgId || sessions[0].activeOrgId || event.__actorOrgId || user.orgId), sessionId: sessions[0]._id }
  }
  const openId = value(cloud.getWXContext().OPENID)
  if (!openId) throw new Error('请先登录')
  const users = (await db.collection('users').where(_.or([{ openId }, { openid: openId }, { _openid: openId }])).limit(3).get()).data || []
  if (new Set(users.map(user => value(user._id))).size !== 1) throw new Error('微信账号身份存在冲突')
  const user = users[0]
  const phone = value(user.phone || user.phoneNumber)
  const phoneUsers = (await db.collection('users').where(_.or([{ phone }, { phoneNumber: phone }])).limit(3).get()).data || []
  if (!/^1[3-9]\d{9}$/.test(phone) || new Set(phoneUsers.map(row => value(row._id))).size !== 1 || value(phoneUsers[0]._id) !== value(user._id)) throw new Error('请先完成唯一手机号核验')
  return { user, orgId: value(event.orgId || value(event.workspaceId).replace(/^org:/, '')) }
}

async function owner(userId, orgId) {
  const org = await doc('organizations', orgId)
  if (!org) return false
  return [org.ownerId, org.creatorId, org.createdBy].map(value).includes(userId)
}

async function tournament(orgId, tournamentId) {
  const item = await doc('tournaments', tournamentId)
  if (!item || value(item.orgId || item.organizationId) !== orgId) throw new Error('赛事不存在或不属于当前机构')
  return item
}

function rights(input) {
  if (!Array.isArray(input) || !input.length || input.some(right => !RIGHTS.includes(right))) throw new Error('请选择有效权限')
  return [...new Set(input)]
}

async function audit(action, grant, who, before = null, store = db) {
  await store.collection('tournament_staff_audit').add({ data: {
    action, orgId: grant.orgId, tournamentId: grant.tournamentId, grantId: value(grant._id),
    actorUserId: value(who._id), subjectUserId: value(grant.userId), subjectPhoneMasked: value(grant.phone).replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2'),
    before, after: { status: grant.status, permissions: grant.permissions }, createTime: db.serverDate()
  } })
}

async function listOwn(identity) {
  const rows = (await db.collection(GRANTS).where({ userId: value(identity.user._id), status: 'active' }).limit(1000).get()).data || []
  if (rows.length >= 1000) throw new Error('授权记录过多，请联系平台分批查看')
  const grants = await Promise.all(rows.map(async row => ({ id: row._id, orgId: row.orgId, tournamentId: row.tournamentId, tournamentName: value((await doc('tournaments', row.tournamentId))?.name), permissions: row.permissions, status: row.status })))
  return { success: true, grants }
}

async function invitations(identity) {
  const phone = value(identity.user.phone || identity.user.phoneNumber)
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new Error('请先完成手机号核验')
  const rows = (await db.collection(GRANTS).where({ phone, status: 'pending' }).limit(1000).get()).data || []
  if (rows.length >= 1000) throw new Error('待接受邀请过多，请联系平台分批查看')
  const invitations = await Promise.all(rows.map(async row => ({ id: row._id, orgId: row.orgId, tournamentId: row.tournamentId, tournamentName: value((await doc('tournaments', row.tournamentId))?.name), name: row.name, permissions: row.permissions })))
  return { success: true, invitations }
}

async function listManaged(identity) {
  if (!identity.orgId || !await owner(value(identity.user._id), identity.orgId)) throw new Error('仅机构主账号可管理授权')
  const rows = (await db.collection(GRANTS).where({ orgId: identity.orgId }).limit(1000).get()).data || []
  const tournaments = (await db.collection('tournaments').where(_.or([{ orgId: identity.orgId }, { organizationId: identity.orgId }])).limit(1000).get()).data || []
  if (tournaments.length >= 1000 || rows.length >= 1000) throw new Error('赛事或授权过多，请联系平台分批查看')
  return { success: true, tournaments: tournaments.map(row => ({ id: row._id, name: value(row.name) })), grants: rows.map(row => ({ id: row._id, orgId: row.orgId, tournamentId: row.tournamentId, tournamentName: value(tournaments.find(item => value(item._id) === value(row.tournamentId))?.name), phone: row.phone, name: row.name, permissions: row.permissions, status: row.status, userId: row.userId || '', updatedAt: row.updateTime || row.createTime })) }
}

async function invite(identity, event) {
  const orgId = identity.orgId, tournamentId = value(event.tournamentId), phone = value(event.phone)
  if (!orgId || !await owner(value(identity.user._id), orgId)) throw new Error('仅机构主账号可分发权限')
  await tournament(orgId, tournamentId)
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new Error('请输入正确手机号')
  if (phone === value(identity.user.phone || identity.user.phoneNumber)) throw new Error('不能向自己分发子账号权限')
  const permissions = rights(event.permissions)
  const existing = (await db.collection(GRANTS).where({ orgId, tournamentId, phone }).limit(2).get()).data || []
  if (existing.length) throw new Error('该手机号已在本赛事受邀，请修改原授权')
  const grant = { _id: hash(orgId + ':' + tournamentId + ':' + phone), orgId, tournamentId, phone, name: value(event.name).slice(0, 40), permissions, status: 'pending', userId: '', createdBy: value(identity.user._id), createTime: db.serverDate(), updateTime: db.serverDate() }
  await db.runTransaction(async transaction => {
    const result = await transaction.collection(GRANTS).add({ data: grant })
    grant._id = result._id
    await audit('invite', grant, identity.user, null, transaction)
  })
  return { success: true, grantId: grant._id }
}

async function accept(identity, event) {
  const grant = await doc(GRANTS, value(event.grantId))
  const phone = value(identity.user.phone || identity.user.phoneNumber)
  if (!grant || grant.status !== 'pending' || grant.phone !== phone) throw new Error('邀请不存在或不属于当前手机号')
  await tournament(value(grant.orgId), value(grant.tournamentId))
  const phoneRows = (await db.collection('users').where(_.or([{ phone }, { phoneNumber: phone }])).limit(3).get()).data || []
  if (new Set(phoneRows.map(row => value(row._id))).size !== 1) throw new Error('手机号账号存在冲突')
  const memberships = ((await db.collection('organization_memberships').where(_.or([{ userId: identity.user._id }, { memberUserId: identity.user._id }])).limit(100).get()).data || []).filter(row => value(row.orgId || row.organizationId) === value(grant.orgId))
  if (memberships.some(row => ['disabled', 'removed', 'rejected', 'inactive'].includes(value(row.status).toLowerCase()))) throw new Error('机构成员状态异常，请联系机构负责人核对')
  await db.runTransaction(async transaction => {
    const response = await transaction.collection(GRANTS).doc(grant._id).get()
    const current = Array.isArray(response.data) ? response.data[0] : response.data
    if (!current || current.status !== 'pending' || current.phone !== phone) throw new Error('邀请已被处理，请刷新')
    if (!memberships.length) await transaction.collection('organization_memberships').add({ data: { orgId: grant.orgId, userId: identity.user._id, phone, role: 'tournament_staff', permissions: ['event.view'], status: 'accepted', source: 'tournament_staff_invite', createTime: db.serverDate(), updateTime: db.serverDate() } })
    await transaction.collection(GRANTS).doc(grant._id).update({ data: { status: 'active', userId: identity.user._id, acceptedAt: db.serverDate(), updateTime: db.serverDate() } })
    if (identity.sessionId) await transaction.collection('auth_sessions').doc(identity.sessionId).update({ data: { activeOrgId: grant.orgId, updateTime: db.serverDate() } })
    await audit('accept', { ...grant, status: 'active', userId: identity.user._id }, identity.user, { status: 'pending', permissions: grant.permissions }, transaction)
  })
  return { success: true, orgId: grant.orgId, tournamentId: grant.tournamentId }
}

async function activate(identity, event) {
  const grant = await doc(GRANTS, value(event.grantId))
  if (!identity.sessionId || !grant || grant.status !== 'active' || value(grant.userId) !== value(identity.user._id)) throw new Error('当前授权已失效')
  await tournament(value(grant.orgId), value(grant.tournamentId))
  await db.collection('auth_sessions').doc(identity.sessionId).update({ data: { activeOrgId: grant.orgId, updateTime: db.serverDate() } })
  return { success: true, orgId: grant.orgId, tournamentId: grant.tournamentId }
}

async function activateOrganizerWorkspace(identity, event) {
  const orgId = value(event.orgId)
  if (!identity.sessionId || !orgId) throw new Error('机构工作空间信息缺失，请重新登录')
  const organization = await doc('organizations', orgId)
  if (!organization) throw new Error('机构不存在或已停用')
  const isOwner = [organization.ownerId, organization.creatorId, organization.createdBy]
    .map(value).includes(value(identity.user._id))
  if (!isOwner) throw new Error('仅本人机构负责人可切换到该机构')
  await db.collection('auth_sessions').doc(identity.sessionId).update({ data: { activeOrgId: orgId, updateTime: db.serverDate() } })
  return { success: true, orgId, isOwner }
}

async function change(identity, event, disabled) {
  if (!identity.orgId || !await owner(value(identity.user._id), identity.orgId)) throw new Error('仅机构主账号可修改授权')
  const grant = await doc(GRANTS, value(event.grantId))
  if (!grant || grant.orgId !== identity.orgId) throw new Error('授权不存在')
  await tournament(identity.orgId, grant.tournamentId)
  if (value(grant.userId) === value(identity.user._id)) throw new Error('不能修改自己的授权')
  await db.runTransaction(async transaction => {
    const response = await transaction.collection(GRANTS).doc(grant._id).get()
    const current = Array.isArray(response.data) ? response.data[0] : response.data
    if (!current || current.orgId !== identity.orgId) throw new Error('授权已变化，请刷新')
    const before = { status: current.status, permissions: current.permissions }
    const permissions = disabled ? current.permissions : rights(event.permissions)
    const status = disabled ? 'disabled' : current.userId ? 'active' : 'pending'
    await transaction.collection(GRANTS).doc(grant._id).update({ data: { permissions, status, updateTime: db.serverDate(), updatedBy: identity.user._id } })
    await audit(disabled ? 'disable' : 'update', { ...current, permissions, status }, identity.user, before, transaction)
  })
  return { success: true }
}

exports.main = async (event = {}) => {
  try {
    const identity = await actor(event)
    const action = value(event.action)
    if (action === 'scope') {
      const own = await listOwn(identity)
      const pending = await invitations(identity)
      const isOwner = Boolean(identity.orgId && await owner(value(identity.user._id), identity.orgId))
      const isStaff = Boolean(own.grants.length || pending.invitations.length || identity.orgId && await policy.isStaff(db, identity.user._id, identity.orgId))
      return { success: true, isOwner, isStaff, activeOrgId: identity.orgId, grants: own.grants, invitations: pending.invitations }
    }
    if (action === 'mine') return await listOwn(identity)
    if (action === 'invitations') return await invitations(identity)
    if (action === 'managed') return await listManaged(identity)
    if (action === 'invite') return await invite(identity, event)
    if (action === 'accept') return await accept(identity, event)
    if (action === 'activate') return await activate(identity, event)
    if (action === 'activateOrganizerWorkspace') return await activateOrganizerWorkspace(identity, event)
    if (action === 'update') return await change(identity, event, false)
    if (action === 'disable') return await change(identity, event, true)
    return { success: false, code: 'UNSUPPORTED_ACTION', message: '不支持的操作' }
  } catch (error) {
    return { success: false, code: 'STAFF_ACCESS_DENIED', message: error.message || '授权操作失败' }
  }
}
