'use strict'
const { readAll, readByIds } = require('./data-center/reader.cjs')
const { error } = require('./data-center/service.cjs')
const id = value => String(value || '').trim()
function assertOwner(actor) {
  if (!actor?.platformOwner) throw error('DATA_FORBIDDEN', '仅平台负责人可以核查完整生涯等级')
}
function active(row) { return row.deleted !== true && row.isDeleted !== true && row.status !== 'deleted' }
async function auditPlayer(db, actor, event, service) {
  assertOwner(actor)
  const playerId = id(event.playerId)
  if (!playerId || playerId.length > 100 || /[\s/\\]/.test(playerId)) throw error('DATA_SCOPE_INVALID', '请选择需要核查的球员')
  const profile = (await readByIds(db, 'players', '_id', [playerId], {fields:{name:true,teamId:true,teamCode:true,deleted:true,isDeleted:true,status:true}}))[0]
  if (!profile || !active(profile)) throw error('DATA_PLAYER_NOT_FOUND', '球员档案不存在或已删除，请核对名单关联')
  // The canonical query computes the same full-career snapshot used by card issuance.
  const result = await service.query(actor, {playerId, mode:'official'})
  const teamId = id(profile.teamId || profile.teamCode)
  const [teams, divisions] = await Promise.all([
    readByIds(db, 'teams', '_id', [teamId], {fields:{name:true,teamName:true}}),
    readByIds(db, 'divisions', '_id', (result.players || []).map(row => row.divisionId), {fields:{name:true}})
  ])
  const divisionById = new Map(divisions.map(row => [id(row._id), row]))
  const matches = await readByIds(db, 'matches', '_id', (result.issues || []).map(row=>row.matchId).filter(Boolean))
  const matchTeams = await readByIds(db, 'teams', '_id', matches.flatMap(row=>[row.homeTeamId,row.awayTeamId]), {fields:{name:true,teamName:true}})
  const teamNames = new Map(matchTeams.map(row=>[id(row._id),id(row.name||row.teamName)]))
  const ownMatches = new Set((result.players || []).filter(row=>row.playerId===playerId).flatMap(row=>row.matchIds||[]).map(id))
  const matchMap = new Map(matches.map(row=>[id(row._id),row]))
  const grouped = new Map()
  for(const issue of result.issues || []) {
    const key=id(issue.matchId)||'other',match=matchMap.get(key)
    if(!grouped.has(key)) grouped.set(key,{matchId:id(issue.matchId),matchName:match?`${teamNames.get(id(match.homeTeamId))||'主队待关联'} vs ${teamNames.get(id(match.awayTeamId))||'客队待关联'}`:'其他资料',date:id(match?.matchDate||match?.date),related:ownMatches.has(key),issues:[]})
    grouped.get(key).issues.push(issue)
  }
  return {
    success:true,
    player:{id:playerId,name:id(profile.name),teamId,teamName:id(teams[0]?.name || teams[0]?.teamName)},
    score:result.playerCard, playerTotal:result.playerTotal,
    coverage:{...result.coverage,generatedAt:result.generatedAt},
    careerRows:(result.players || []).filter(row => row.playerId === playerId).map(row => ({...row,divisionName:id(divisionById.get(id(row.divisionId))?.name)})),
    // Keep source issue codes and IDs; do not invent missing event data or silently make it zero.
    issues:result.issues || [], findings:[...grouped.values()].sort((a,b)=>Number(b.related)-Number(a.related)||a.date.localeCompare(b.date)||a.matchId.localeCompare(b.matchId)), schemaVersion:result.schemaVersion, metricVersion:result.metricVersion, dataVersion:result.dataVersion
  }
}
async function auditQueue(db, actor, event, service) {
  assertOwner(actor)
  const cursor = id(event.cursor)
  if (cursor.length > 100 || /[\s/\\]/.test(cursor)) throw error('DATA_CURSOR_INVALID', '扫描位置无效，请重新扫描')
  const limit = Math.max(1, Math.min(100, Number(event.limit) || 100))
  const all = (await readAll(db, 'players', {}, {fields:{name:true,teamId:true,teamCode:true,deleted:true,isDeleted:true,status:true}})).filter(active)
  const remaining = all.filter(row => id(row._id) > cursor), page = remaining.slice(0, limit)
  const grades = page.length ? await service.playerCardsForAuthorizedPlayers(page.map(row => id(row._id))) : new Map()
  const teams = await readByIds(db, 'teams', '_id', page.map(row => id(row.teamId || row.teamCode)), {fields:{name:true,teamName:true}})
  const byId = new Map(teams.map(row => [id(row._id), row]))
  const issues = page.flatMap(row => {
    const score = grades.get(id(row._id))
    if (!score) throw error('DATA_READ_FAILED', '未取得完整的等级结果，请重新扫描')
    if (score.status === 'ready') return []
    const teamId = id(row.teamId || row.teamCode), team = byId.get(teamId)
    return [{playerId:id(row._id),playerName:id(row.name),teamId,teamName:id(team?.name || team?.teamName),status:score.status,missing:score.missing || []}]
  })
  return {success:true,issues,totalPlayers:all.length,scannedCount:page.length,verifiedCount:page.length-issues.length,issueCount:issues.length,
    nextCursor:remaining.length > page.length ? id(page[page.length-1]._id) : null,generatedAt:new Date().toISOString()}
}
module.exports = {auditPlayer,auditQueue}
