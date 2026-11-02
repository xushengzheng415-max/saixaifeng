'use strict'
const crypto = require('node:crypto')
const { error } = require('./service.cjs')
const first = result => Array.isArray(result.data) ? result.data[0] : result.data
// 球员档案个人持有（2026-10-18 用户确认）：移出球队只解除归属关系，档案保持有效
// 并留在球员自己手里，队端不留归档副本；每次进出写 player_team_history 流转日志。
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
    // 解除关系：清空在队标记，状态保持有效，资料与赛事历史完整保留。
    await transaction.collection('players').doc(playerId).update({ data:{teamId:'',teamCode:'',currentMembershipId:'',currentHistoryId:'',leftTeamAt:now,leftTeamBy:actor.userId,updateTime:now} })
    const historyId = String(player.currentHistoryId || '')
    let closed = false
    if (historyId) {
      const record = first(await transaction.collection('player_team_history').doc(historyId).get())
      if (record && !record.leftAt) { await transaction.collection('player_team_history').doc(historyId).update({ data:{leftAt:now,leftSource:'team_remove',leftBy:actor.userId,updateTime:now} }); closed = true }
    }
    if (!closed) await transaction.collection('player_team_history').add({ data:{ playerId,teamId,orgId:String(player.orgId||actor.orgId||''),joinedAt:player.joinedTeamAt||null,leftAt:now,joinSource:'legacy',leftSource:'team_remove',leftBy:actor.userId,createTime:now,updateTime:now } })
    await transaction.collection('teams').doc(teamId).update({ data:{rosterCountStatus:'needs_refresh',updateTime:now} })
    return { success:true, archived:true }
  })
}
module.exports = { archiveMembership }
