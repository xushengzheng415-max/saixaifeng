'use strict'
const { readAll } = require('./data-center/reader.cjs')
const { createDataService, error } = require('./data-center/service.cjs')
module.exports = async function publicDataCenter(db,event) {
  const tournamentId = String(event.tournamentId || '').trim()
  if (!tournamentId) throw error('DATA_SCOPE_INVALID','请选择公开赛事')
  const published = await readAll(db,'publication_snapshots',{ tournamentId, sportCode:'football', type:'tournament_center', status:'published' })
  if (!published.length) throw error('DATA_NOT_PUBLISHED','该赛事尚未公开')
  const matches = (await readAll(db,'matches',{ tournamentId })).filter(row => row.schedulePublished === true || row.published === true)
  const teamIds = [...new Set(matches.flatMap(row => [row.homeTeamId,row.awayTeamId]).filter(Boolean).map(String))]
  const scope = { tournamentId, mode:'official' }
  for (const field of ['teamId','playerId','divisionId']) if (event[field]) scope[field] = String(event[field])
  const actor = { public:true, platformOwner:false, teamIds, tournamentIds:[tournamentId], matchIds:matches.map(row => String(row._id)) }
  const result = await createDataService(db).query(actor,scope)
  delete result.memberships
  return result
}
