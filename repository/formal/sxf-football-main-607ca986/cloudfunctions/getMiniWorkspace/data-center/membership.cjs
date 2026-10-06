'use strict'
const crypto = require('node:crypto')
const { error } = require('./service.cjs')
const first = result => Array.isArray(result.data) ? result.data[0] : result.data
async function archiveMembership(db,actor,playerId,teamId) {
  if (!(actor.teamIds || []).includes(teamId) && !actor.platformOwner) throw error('DATA_FORBIDDEN','无权移出该球员')
  return db.runTransaction(async transaction => {
    const player = first(await transaction.collection('players').doc(playerId).get())
    if (!player || String(player.teamId || player.teamCode || '') !== teamId) throw error('PLAYER_TEAM_CONFLICT','球员归属已变化，请刷新')
    if (player.status === 'archived') return { success:true, archived:true, idempotent:true }
    const now = new Date()
    const membershipId = player.currentMembershipId || crypto.createHash('sha256').update('leave:' + playerId + ':' + teamId).digest('hex').slice(0,32)
    let previous
    if (player.currentMembershipId) previous = first(await transaction.collection('player_team_memberships').doc(membershipId).get())
    const row = previous || { playerId,teamId,orgId:actor.orgId || '',validFrom:null,startTimeUnknown:true,source:'legacy_leave' }
    await transaction.collection('player_team_memberships').doc(membershipId).set({ data:{ ...row,status:'ended',validTo:now,endedBy:actor.userId,updateTime:now } })
    await transaction.collection('players').doc(playerId).update({ data:{status:'archived',archivedAt:now,archivedBy:actor.userId,currentMembershipId:'',updateTime:now} })
    await transaction.collection('teams').doc(teamId).update({ data:{rosterCountStatus:'needs_refresh',updateTime:now} })
    return { success:true, archived:true }
  })
}
module.exports = { archiveMembership }
