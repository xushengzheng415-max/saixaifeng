'use strict'
const crypto = require('node:crypto')
const { error } = require('./shared/service.cjs')
const { readAll } = require('./shared/reader.cjs')
const first = result => Array.isArray(result.data) ? result.data[0] : result.data
const text = value => String(value || '').trim()
const belongs = (team,actor) => actor.platformOwner || (actor.manageTeamIds || actor.teamIds || []).includes(text(team?._id))
const orgOf = team => text(team?.orgId || team?.organizationId)
const hash = value => crypto.createHash('sha256').update(value).digest('hex').slice(0,32)
async function optionalDoc(transaction,collection,documentId) {
  try { return first(await transaction.collection(collection).doc(documentId).get()) }
  catch (failure) {
    if (/document.*(not exist|not found)|DOCUMENT_NOT_FOUND/i.test(String(failure.errMsg || failure.message || ''))) return null
    throw failure
  }
}

async function requestTransfer(db,actor,event) {
  const playerId = text(event.playerId), fromTeamId = text(event.fromTeamId), toTeamId = text(event.toTeamId)
  if (!playerId || !fromTeamId || !toTeamId || fromTeamId === toTeamId) throw error('TRANSFER_INVALID','请选择不同的目标球队')
  if (!/^[a-zA-Z0-9_-]{12,100}$/.test(text(event.requestKey))) throw error('TRANSFER_KEY_REQUIRED','转会请求标识无效，请重新提交')
  const transferId = hash(actor.userId + ':' + event.requestKey)
  return db.runTransaction(async transaction => {
    const existing = await optionalDoc(transaction,'player_transfers',transferId)
    if (existing) {
      if (existing.playerId !== playerId || existing.fromTeamId !== fromTeamId || existing.toTeamId !== toTeamId) throw error('TRANSFER_KEY_CONFLICT','请求标识已用于其他转会')
      return { success:true, id:transferId, status:existing.status, idempotent:true }
    }
    const player = first(await transaction.collection('players').doc(playerId).get())
    const fromTeam = first(await transaction.collection('teams').doc(fromTeamId).get())
    const toTeam = first(await transaction.collection('teams').doc(toTeamId).get())
    if (!player || text(player.teamId || player.teamCode) !== fromTeamId || player.status === 'deleted') throw error('TRANSFER_PLAYER_CONFLICT','球员归属已变化，请刷新')
    if (!fromTeam || !toTeam || !belongs(fromTeam,actor)) throw error('DATA_FORBIDDEN','无权转出该球员')
    // Cross-organization transfer needs a separate consent/privacy flow; do not
    // silently expose the existing private profile to a new organization.
    if (!orgOf(fromTeam) || orgOf(fromTeam) !== orgOf(toTeam)) throw error('TRANSFER_CROSS_ORG_REQUIRES_REVIEW','跨机构转会需完成双方授权与隐私资料交接')
    if (!belongs(toTeam,actor)) throw error('DATA_FORBIDDEN','无权管理目标球队')
    const data = { playerId, fromTeamId, toTeamId, orgId:orgOf(fromTeam), status:'pending', requestedBy:actor.userId, reason:text(event.reason).slice(0,200), createTime:new Date(), updateTime:new Date() }
    await transaction.collection('player_transfers').doc(transferId).set({ data })
    return { success:true, id:transferId, status:'pending' }
  })
}

async function acceptTransfer(db,actor,event) {
  const transferId = text(event.transferId)
  if (!transferId) throw error('TRANSFER_INVALID','请选择转会申请')
  return db.runTransaction(async transaction => {
    const request = first(await transaction.collection('player_transfers').doc(transferId).get())
    if (!request) throw error('TRANSFER_NOT_FOUND','转会申请不存在')
    const target = first(await transaction.collection('teams').doc(request.toTeamId).get())
    if (!target || !belongs(target,actor)) throw error('DATA_FORBIDDEN','无权确认该转会')
    if (request.status === 'accepted') return { success:true, id:transferId, playerId:request.playerId, idempotent:true }
    if (request.status !== 'pending') throw error('TRANSFER_STATE_CONFLICT','申请状态已变化，请刷新')
    const player = first(await transaction.collection('players').doc(request.playerId).get())
    const source = first(await transaction.collection('teams').doc(request.fromTeamId).get())
    if (!source || !belongs(source,actor) || orgOf(source) !== orgOf(target) || orgOf(target) !== request.orgId) throw error('DATA_FORBIDDEN','机构或球队归属已变化，请重新核验')
    if (!player || text(player.teamId || player.teamCode) !== request.fromTeamId) throw error('TRANSFER_PLAYER_CONFLICT','球员归属已变化，请重新申请')
    const now = new Date()
    const previousMembershipId = text(player.currentMembershipId)
    const previous = previousMembershipId ? await optionalDoc(transaction,'player_team_memberships',previousMembershipId) : null
    const closedId = previous?._id || hash('legacy:' + request.playerId + ':' + request.fromTeamId + ':' + transferId)
    const closed = previous || { playerId:request.playerId, teamId:request.fromTeamId, orgId:request.orgId, validFrom:null, startTimeUnknown:true, source:'legacy_transfer' }
    await transaction.collection('player_team_memberships').doc(closedId).set({ data:{ ...closed, status:'ended', validTo:now, transferId, updateTime:now } })
    const membershipId = hash('membership:' + transferId)
    await transaction.collection('player_team_memberships').doc(membershipId).set({ data:{ playerId:request.playerId, teamId:request.toTeamId, orgId:request.orgId, validFrom:now, validTo:null, status:'active', transferId, createTime:now, updateTime:now } })
    await transaction.collection('players').doc(request.playerId).update({ data:{ teamId:request.toTeamId, teamCode:request.toTeamId, teamName:text(target.name || target.teamName), currentMembershipId:membershipId, status:'active', updateTime:now } })
    for (const teamId of [request.fromTeamId,request.toTeamId]) await transaction.collection('teams').doc(teamId).update({ data:{ rosterCountStatus:'needs_refresh', updateTime:now } })
    await transaction.collection('player_transfers').doc(transferId).update({ data:{ status:'accepted', acceptedBy:actor.userId, acceptedAt:now, updateTime:now } })
    // Match events, rosters and archived results are intentionally immutable here.
    return { success:true, id:transferId, playerId:request.playerId, membershipId }
  })
}

async function listTransfers(db,actor) {
  const rows = await readAll(db,'player_transfers',actor.platformOwner ? {} : { orgId:actor.orgId })
  return { success:true, items:rows.filter(row => actor.platformOwner || actor.teamIds.includes(row.fromTeamId) || actor.teamIds.includes(row.toTeamId)).map(row => ({ id:row._id, playerId:row.playerId, fromTeamId:row.fromTeamId, toTeamId:row.toTeamId, status:row.status, reason:row.reason, createTime:row.createTime })) }
}
module.exports = { requestTransfer, acceptTransfer, listTransfers }
