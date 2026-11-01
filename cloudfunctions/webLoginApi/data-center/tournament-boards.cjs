'use strict'
const text = value => String(value ?? '').trim()
async function tournamentBoards(result, divisionDirectory = []) {
  const {rankings} = require('./presentation.cjs')
  const {teamBoard} = await import('./tournament-boards.mjs')
  const flat = (result.standings || []).flatMap(group => (group.officialTeams || []).map(row => ({...row, divisionId:text(group.divisionId),divisionName:text(group.divisionName),groupName:text(group.groupName)})))
  const divisions = new Map(divisionDirectory.map(row => [text(row.id || row._id),text(row.name)]))
  for (const row of [...flat,...(result.players || [])]) if (row.divisionId && !divisions.has(text(row.divisionId))) divisions.set(text(row.divisionId),text(row.divisionName) || '未分组别')
  const scopes = []
  for (const [divisionId,divisionName] of [['','总榜'],...divisions]) {
    const scoped = divisionId ? {...result,players:(result.players || []).filter(row => text(row.divisionId) === divisionId),teams:(result.teams || []).filter(row => text(row.divisionId) === divisionId)} : result
    const ranks = await rankings(scoped)
    const teamNames = new Map(ranks.teamTotals.map(row => [text(row.id),row.name]))
    const mapPlayer = (row,index) => ({...row,rank:index+1,playerId:row.id,playerName:row.name,divisionId,divisionName,teamName:(row.teamIds || []).map(id => teamNames.get(text(id)) || '球队资料待补齐').join('、')})
    scopes.push({divisionId,divisionName,standings:flat.filter(row => !divisionId || row.divisionId === divisionId),
      goals:ranks.players.goals.rows.filter(row => row.value > 0).map(mapPlayer),
      yellow:ranks.players.yellowCards.rows.filter(row => row.value > 0).map(mapPlayer),
      red:ranks.players.redCards.rows.filter(row => row.value > 0).map(mapPlayer),
      attack:teamBoard(flat,'goals',divisionId),defense:teamBoard(flat,'conceded',divisionId)})
  }
  return {version:'tournament-boards/1',scopes,coverage:result.coverage || null}
}

module.exports={tournamentBoards}
