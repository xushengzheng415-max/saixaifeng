'use strict'
const FIELDS={save:['matchDate','matchTime','venue'],lineup:['lineups'],start:['status','events'],events:['events'],finish:['status','homeScore','awayScore'],import:['lineups','events','status','homeScore','awayScore','organizerSupplementFiles'],paperImport:['lineups','events','status','paperReportImports']}
const crypto=require('crypto')
function revision(match) {return crypto.createHash('sha256').update(JSON.stringify([match.lineups || {},match.status,match.executionState,match.refereeRecordLocked,match.refereeRecord,Number(match.matchEventRevision || 0)])).digest('hex')}
function assert(actor,event,match) {
  const scope=actor.miniScope
  if(!scope) {if(event.action==='importOrganizerReport') throw new Error('纸质裁判表导入需要手机赛事授权');return}
  if(scope.tournamentId!==String(match.tournamentId || '')) throw new Error('手机操作超出授权赛事')
  if(['lineup','start','import','paperImport'].includes(scope.operation) && scope.recordRevision!==revision(match)) throw new Error('比赛或首发状态已更新，请重新核对')
  const fields=FIELDS[scope.operation]
  if(!fields || Object.keys(event.data || {}).some(key=>!fields.includes(key))) throw new Error('手机操作字段未授权')
  if(scope.operation==='finish' && event.action!=='finishOrganizerMatch' || scope.operation==='import' && event.action!=='importOrganizerReport' || scope.operation==='paperImport' && event.action!=='importPaperReport' || !['finish','import','paperImport'].includes(scope.operation) && event.action) throw new Error('手机操作入口未授权')
  if(scope.operation==='paperImport' && (!['scheduled','pending','upcoming','checked_in','not_started','','finished','completed'].includes(String(match.status || '')) || event.data.status!=='finished'))throw new Error('比赛状态已变化，请重新核对裁判表')
  if(['start','lineup','import'].includes(scope.operation) && !['scheduled','pending','upcoming','checked_in','not_started',''].includes(String(match.status || ''))) throw new Error('比赛状态已变化，请刷新')
  if(scope.operation==='start' && event.data.status!=='ongoing' || scope.operation==='import' && event.data.status!=='finished') throw new Error('手机比赛状态无效')
  if(scope.operation==='start' && ((match.events || []).length || !Array.isArray(event.data.events) || event.data.events.length)) throw new Error('开始比赛不能覆盖已有事件')
  if(scope.operation==='import' && ((match.events || []).length || Number(event.expectedEventRevision)!==Number(match.matchEventRevision || 0))) throw new Error('已有比赛事件，不能覆盖裁判原始记录')
}
async function validateGrant(tx,actor) {
  if(!actor.miniScope) return
  const response=await tx.collection('tournament_staff_grants').doc(actor.miniScope.grantId).get(),row=Array.isArray(response.data)?response.data[0]:response.data
  const rights=['event.matches'].concat(['finish','import','paperImport'].includes(actor.miniScope.operation)?['event.results']:[],actor.miniScope.operation==='paperImport'?['event.teams']:[])
  if(!row || row.status!=='active' || String(row.userId)!==String(actor.user._id) || String(row.orgId)!==String(actor.orgId) || String(row.tournamentId)!==actor.miniScope.tournamentId || rights.some(right=>!(row.permissions || []).includes(right))) throw new Error('赛事授权已停用或变化，请返回赛事列表')
}
module.exports={assert,validateGrant}
