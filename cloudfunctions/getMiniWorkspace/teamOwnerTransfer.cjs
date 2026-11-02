'use strict'
const crypto = require('node:crypto')
const { inScope, owns } = require('./teamDeletion.cjs')

const text = value => String(value == null ? '' : value).trim()
const phoneOf = value => String(value == null ? '' : value).replace(/\D/g, '')
const first = reply => Array.isArray(reply.data) ? reply.data[0] : reply.data
const missing = error => /document.*(not exist|not found)|document\.getfail.*does not exist/i.test(String(error.message || ''))
const ownerIdOf = team => text(team.ownerId || team.ownerUserId || team.claimedByUserId)
const activeStatuses = ['active', 'accepted', 'claimed']
const membershipUserId = row => text(row.userId || row.memberUserId || row.ownerId)

function fail(code, message) { const error = new Error(message); error.code = code; throw error }
function membershipId(prefix, teamId, userId) {
  return crypto.createHash('sha256').update(prefix + ':' + text(teamId) + ':' + text(userId)).digest('hex').slice(0, 32)
}
async function readTeam(db, id) {
  try { const row = first(await db.collection('teams').doc(id).get()); if (row) return row }
  catch (error) { if (!missing(error)) throw error }
  fail('TEAM_NOT_FOUND', '球队已不存在，请刷新列表')
}
async function ensureCollections(db) {
  for (const name of ['team_memberships', 'team_owner_transfers']) {
    try { await db.createCollection(name) }
    catch (error) { if (!/exist|already|Exist/i.test(String(error.message || ''))) throw error }
  }
}
// 手机号唯一命中账号：phone 与 phoneNumber 两个历史字段都要查，重复命中必须阻断。
async function targetAccount(safeGet, phone) {
  const groups = await Promise.all([
    safeGet('users', { phone }, 5),
    safeGet('users', { phoneNumber: phone }, 5)
  ])
  const rows = new Map()
  groups.flat().forEach(row => { if (row && row._id) rows.set(String(row._id), row) })
  const users = [...rows.values()]
  if (users.length > 1) fail('TEAM_TRANSFER_ACCOUNT_CONFLICT', '该手机号存在重复账号，请先人工核验后再移交')
  return users[0] || null
}

// 主账号直接移交：不需要受让人确认。
// 手机号已有账号时立即写所有权；尚未注册时记 pendingOwnerPhone，由该手机号首次登录时自动认领。
async function transferDirect({ db, safeGet, maskPhone }, identity, scope, event) {
  const teamId = text(event.teamId)
  if (!teamId) fail('TEAM_ID_REQUIRED', '缺少球队编号')
  const targetPhone = phoneOf(event.targetPhone)
  if (!/^1[3-9]\d{9}$/.test(targetPhone)) fail('TEAM_TRANSFER_PHONE_INVALID', '请输入正确的 11 位手机号')
  const team = await readTeam(db, teamId)
  if (!inScope(team, scope)) fail('TEAM_ACCESS_DENIED', '无权操作其他球队')
  const actorUserId = text(identity.user && identity.user._id)
  if (targetPhone === phoneOf(identity.phone)) fail('TEAM_TRANSFER_SAME_ACCOUNT', '不能把球队移交给自己')

  const memberships = await safeGet('team_memberships', { teamId }, 200)
  if (!owns(team, identity.user, identity.openId, memberships)) fail('TEAM_OWNER_REQUIRED', '只有当前主账号可以移交球队')
  const beforeOwnerId = ownerIdOf(team)
  // 当前主账号在本队的所有关系（含历史撤权记录）一并置为退出，避免移交互相覆盖。
  const actorRows = memberships.filter(row => membershipUserId(row) === actorUserId ||
    (phoneOf(row.phone || row.phoneNumber) && phoneOf(row.phone || row.phoneNumber) === phoneOf(identity.phone)))
  const target = await targetAccount(safeGet, targetPhone)
  const targetUserId = target ? text(target._id) : ''
  if (targetUserId && targetUserId === actorUserId) fail('TEAM_TRANSFER_SAME_ACCOUNT', '不能把球队移交给自己')
  const targetRow = targetUserId ? memberships.find(row => membershipUserId(row) === targetUserId) : null
  const now = db.serverDate()
  await ensureCollections(db)
  await db.runTransaction(async transaction => {
    const fresh = await readTeam(transaction, teamId)
    if (ownerIdOf(fresh) !== beforeOwnerId || !inScope(fresh, scope)) fail('TEAM_CHANGED', '球队主账号已变化，请刷新后重试')
    await transaction.collection('teams').doc(teamId).update({ data: {
      ownerId: targetUserId,
      ownerUserId: targetUserId,
      claimedByUserId: targetUserId,
      ownerPhone: targetPhone,
      managerPhone: targetPhone,
      pendingOwnerPhone: targetUserId ? '' : targetPhone,
      claimStatus: targetUserId ? 'claimed' : 'pending',
      previousOwnerId: actorUserId,
      previousOwnerPhone: phoneOf(identity.phone),
      ownerTransferAt: now,
      updateTime: now
    } })
    for (const row of actorRows) {
      await transaction.collection('team_memberships').doc(String(row._id)).update({ data: { status: 'revoked', source: 'owner_transfer_out', updateTime: now } })
    }
    if (targetUserId) {
      const data = {
        teamId, orgId: text(team.orgId || team.organizationId || ''), userId: targetUserId,
        openId: text(target.openId || target.wechatOpenId || target._openid || ''),
        phone: targetPhone, role: 'owner', roles: ['owner'], permissions: ['team.view', 'team.manage'],
        status: 'accepted', source: 'owner_transfer_direct', updateTime: now
      }
      if (targetRow) await transaction.collection('team_memberships').doc(String(targetRow._id)).update({ data })
      else await transaction.collection('team_memberships').doc(membershipId('owner-transfer', teamId, targetUserId)).set({ data: Object.assign({ createTime: now }, data) })
    }
    await transaction.collection('team_owner_transfers').add({ data: {
      teamId, teamName: text(team.name || team.teamName), orgId: text(team.orgId),
      fromUserId: actorUserId, fromPhone: phoneOf(identity.phone), toUserId: targetUserId, toPhone: targetPhone,
      hasAccount: Boolean(targetUserId), mode: 'owner_transfer_direct', workspaceId: text(scope && scope.id),
      actorUserId, createTime: now
    } })
  })

  // 旧的“待接收主账号”邀请会让其他手机号再次获得入口，移交成功后一并作废。
  const staleInvites = await safeGet('team_invitations', { teamId, type: 'team_owner_transfer' }, 50)
  for (const invite of staleInvites) {
    if (['active', 'pending'].indexOf(String(invite.status || '').toLowerCase()) < 0) continue
    await db.collection('team_invitations').doc(String(invite._id)).update({ data: { status: 'cancelled', cancelledByOwnerTransfer: true, updateTime: now } })
  }
  // 主办方预建认领邀请还留着原主账号的 acceptedUserId/acceptedOpenId 时，
  // loadWorkspaceCatalog 会据此继续给原账号生成带 team.manage 的临时球队空间，
  // 只清 teams 所有权不够。这里解除绑定但保持 status=accepted，避免重新进入可认领流程。
  const claimInvites = await safeGet('team_invitations', { teamId, type: 'prebuilt_tournament_team' }, 50)
  for (const invite of claimInvites) {
    if (String(invite.status || '').toLowerCase() !== 'accepted') continue
    const boundUserId = text(invite.acceptedUserId)
    const boundOpenId = text(invite.acceptedOpenId)
    const boundByActor = (boundUserId && boundUserId === actorUserId) ||
      (boundOpenId && boundOpenId === text(identity.openId))
    if (!boundByActor) continue
    const data = {
      acceptedUserId: '', acceptedOpenId: '',
      previousAcceptedUserId: boundUserId, previousAcceptedOpenId: boundOpenId,
      previousAcceptedPhone: phoneOf(identity.phone),
      updateTime: now
    }
    const claimPhones = (Array.isArray(invite.allowedClaimPhones) ? invite.allowedClaimPhones : [])
      .map(phoneOf).filter(Boolean)
    if (claimPhones.length && claimPhones.indexOf(targetPhone) < 0) {
      data.previousAllowedClaimPhones = claimPhones
      data.allowedClaimPhones = [targetPhone]
    }
    await db.collection('team_invitations').doc(String(invite._id)).update({ data })
  }

  return {
    success: true,
    teamId,
    hasAccount: Boolean(targetUserId),
    targetPhoneMasked: maskPhone(targetPhone),
    targetName: text(target && (target.realName || target.name || target.nickName)),
    statusText: targetUserId ? '已移交，对方登录即可管理这支球队' : '已登记新负责人手机号，对方用该手机号登录后自动成为主账号'
  }
}

// 受让人登录时自动认领：手机号命中 pendingOwnerPhone 且球队尚未被其他人持有。
// 不覆盖已存在的所有权，歧义情况留给人工核验。
async function bindPending({ db, safeGet }, user, openId) {
  const phone = phoneOf((user && (user.phone || user.phoneNumber)) || '')
  if (!/^1[3-9]\d{9}$/.test(phone)) return 0
  const userId = text(user && user._id)
  if (!userId) return 0
  const rows = (await safeGet('teams', { pendingOwnerPhone: phone }, 20)).filter(team =>
    team && team._id && !ownerIdOf(team) && text(team.pendingOwnerPhone) === phone)
  if (!rows.length) return 0
  await ensureCollections(db)
  let bound = 0
  for (const team of rows) {
    const teamId = String(team._id)
    const memberships = await safeGet('team_memberships', { teamId }, 200)
    const existing = memberships.find(row => membershipUserId(row) === userId)
    const now = db.serverDate()
    try {
      const applied = await db.runTransaction(async transaction => {
        const fresh = await readTeam(transaction, teamId)
        if (ownerIdOf(fresh) || text(fresh.pendingOwnerPhone) !== phone) return false
        await transaction.collection('teams').doc(teamId).update({ data: {
          ownerId: userId, ownerUserId: userId, claimedByUserId: userId,
          ownerPhone: phone, pendingOwnerPhone: '', claimStatus: 'claimed',
          ownerBoundAt: now, updateTime: now
        } })
        const data = {
          teamId, orgId: text(fresh.orgId || fresh.organizationId || ''), userId,
          openId: text(openId || user.openId || user.wechatOpenId || ''),
          phone, role: 'owner', roles: ['owner'], permissions: ['team.view', 'team.manage'],
          status: 'accepted', source: 'owner_transfer_claim', updateTime: now
        }
        if (existing) await transaction.collection('team_memberships').doc(String(existing._id)).update({ data })
        else await transaction.collection('team_memberships').doc(membershipId('owner-claim', teamId, userId)).set({ data: Object.assign({ createTime: now }, data) })
        await transaction.collection('team_owner_transfers').add({ data: {
          teamId, teamName: text(fresh.name || fresh.teamName), orgId: text(fresh.orgId),
          fromUserId: '', fromPhone: '', toUserId: userId, toPhone: phone, hasAccount: true,
          mode: 'owner_transfer_claim_on_login', workspaceId: '', actorUserId: userId, createTime: now
        } })
        return true
      })
      if (applied) bound += 1
    } catch (error) {
      // 单支球队认领失败不能阻断登录；保留 pendingOwnerPhone 由下次登录或人工处理。
      console.warn('[getMiniWorkspace] pending owner binding skipped:', teamId, error && error.message)
    }
  }
  return bound
}

module.exports = { transferDirect, bindPending }
