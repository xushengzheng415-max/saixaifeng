'use strict'
const crypto = require('node:crypto')
const { readAll } = require('./data-center/reader.cjs')
const { owns } = require('./teamOwnership.cjs')
const text = value => String(value == null ? '' : value).trim()
const org = row => text(row.orgId || row.organizationId || row.organization_id)
const first = reply => Array.isArray(reply.data) ? reply.data[0] : reply.data
const missing = error => /document.*(not exist|not found)|document\.getfail.*does not exist/i.test(String(error.message || ''))
function fail(code,message) { const error=new Error(message);error.code=code;throw error }
function revision(team) {
  const normalize=value=>value instanceof Date ? value.toISOString() : Array.isArray(value) ? value.map(normalize) : value && typeof value==='object' ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,normalize(value[key])])) : value
  return crypto.createHash('sha256').update(JSON.stringify(normalize(team))).digest('hex')
}
async function readTeam(db,id) {
  try { const row=first(await db.collection('teams').doc(id).get());if(row)return row }
  catch(error) { if(!missing(error))throw error }
  fail('TEAM_NOT_FOUND','球队已不存在，请刷新列表')
}
function inScope(team,scope) {
  if (!scope || !['team','organization'].includes(scope.type)) return false
  if (!(scope.permissions || []).some(right=>right==='team.view'||right==='team.manage')) return false
  return scope.type==='team' ? text(scope.teamId)===text(team._id) && (!org(scope) || org(scope)===org(team)) : Boolean(org(scope)) && org(scope)===org(team)
}
const references = [
  ['players',['teamId','teamCode'],'球队内有球员，不能删除'],
  ['player_team_memberships',['teamId'],'球队有球员归属记录，不能删除'],
  ['player_transfers',['fromTeamId','toTeamId'],'球队有转会记录，不能删除'],
  ['tournament_teams',['teamId','teamCode'],'球队有参赛记录，不能删除'],
  ['roster_snapshots',['teamId'],'球队有正式名单，不能删除'],
  ['match_lineup_snapshots',['teamId','homeTeamId','awayTeamId'],'球队有比赛阵容，不能删除'],
  ['matches',['homeTeamId','awayTeamId','homeId','awayId','teamAId','teamBId','homeTeam','awayTeam','homeTeam._id','awayTeam._id','homeTeam.id','awayTeam.id'],'球队有比赛记录，不能删除'],
  ['match_events',['teamId','teamCode'],'球队有比赛事件，不能删除'],
  ['registration_player_drafts',['teamId','sourceTeamId','claimedTeamId'],'球队有待处理球员资料，不能删除']
]
async function blocker(db,id,team) {
  if ([team.playerCount,team.rosterCount,team.tournamentCount,team.matchCount].some(value=>Number(value)>0)) return '球队已有球员或参赛记录，不能删除'
  for (const [collection,keys,message] of references) {
    const values=collection==='players'||collection==='tournament_teams' ? [...new Set([id,text(team.teamCode)].filter(Boolean))] : [id]
    const conditions=keys.flatMap(key=>values.map(value=>({[key]:value})))
    try {
      // Existence check only: one row proves the team is not empty.
      const result=await db.collection(collection).where(conditions.length===1?conditions[0]:db.command.or(conditions)).limit(1).get()
      if ((result.data || []).length) return message
    } catch(error) {
      if (/collection.*not exist|ns does not exist|NamespaceNotFound/i.test(String(error.message || ''))) continue
      fail('TEAM_DELETE_CHECK_FAILED','删除检查未完成，请稍后重试')
    }
  }
  return ''
}
async function inspect(db,identity,scope,id) {
  const team=await readTeam(db,id)
  if (!inScope(team,scope)) fail('TEAM_ACCESS_DENIED','无权操作其他球队')
  const memberships=await readAll(db,'team_memberships',{teamId:id})
  const isOwner=owns(team,identity.user,identity.openId,memberships)
  if (!isOwner) return {team,isOwner:false,canDelete:false,reason:'仅主账号可删除自己的空球队',revision:''}
  const reason=await blocker(db,id,team)
  return {team,isOwner:true,canDelete:!reason,reason,revision:revision(team)}
}
async function info(db,identity,scope,event) {
  if (!text(event.teamId)) fail('TEAM_ID_REQUIRED','缺少球队编号')
  const state=await inspect(db,identity,scope,text(event.teamId))
  return {success:true,isOwner:state.isOwner,canDelete:state.canDelete,reason:state.reason,revision:state.revision}
}
async function remove(db,identity,scope,event) {
  const id=text(event.teamId)
  if (!id) fail('TEAM_ID_REQUIRED','缺少球队编号')
  const state=await inspect(db,identity,scope,id)
  if (!state.isOwner) fail('TEAM_OWNER_REQUIRED',state.reason)
  if (!state.canDelete) fail('TEAM_NOT_EMPTY',state.reason)
  if (text(event.confirmName)!==text(state.team.name || state.team.teamName)) fail('TEAM_DELETE_CONFIRM_REQUIRED','球队名称不一致，请重新确认')
  if (!event.revision || event.revision!==state.revision) fail('TEAM_CHANGED','球队资料已变化，请重新检查')
  const auditId='empty-team-'+crypto.createHash('sha256').update(id).digest('hex')
  try { await db.createCollection('team_deletion_audits') }
  catch(error) { if(!/exist|already/i.test(String(error.message || '')))throw error }
  // Recheck related records after the confirmation, never trust client counts or force flags.
  const reason=await blocker(db,id,state.team)
  if(reason)fail('TEAM_NOT_EMPTY',reason)
  await db.runTransaction(async transaction=>{
    const current=await readTeam(transaction,id)
    if(revision(current)!==state.revision || !inScope(current,scope))fail('TEAM_CHANGED','球队资料已变化，请重新检查')
    await transaction.collection('team_deletion_audits').doc(auditId).set({data:{teamId:id,teamName:text(current.name || current.teamName),actorUserId:text(identity.user._id),workspaceId:text(scope.id),orgId:org(current),action:'delete_own_empty_team',deletedAt:db.serverDate()}})
    await transaction.collection('teams').doc(id).remove()
  })
  return {success:true,teamId:id,message:'空球队已删除'}
}
module.exports={info,remove,owns,inScope,revision,references}
