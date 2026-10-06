async function loadLineupHeadCoach({ db, cloud, teamId, team = {}, players = [] }) {
  const explicitId = String(team.headCoachId || (team.headCoach && (team.headCoach.id || team.headCoach._id)) || '')
  const referencedIds = [...new Set([explicitId, ...(team.coachIds || [])].filter(Boolean).map(String))]
  const conditions = [{ teamId }, { teamCode: teamId }]
  if (referencedIds.length) conditions.push({ _id: db.command.in(referencedIds) })
  const result = await db.collection('coaches').where(db.command.or(conditions)).limit(100).get()
  const rows = result.data || []
  if (rows.length >= 100) return { coach: null, state: 'unavailable' }
  const scoped = rows.filter(row => {
    if (['archived', 'deleted', 'inactive', 'disabled', 'removed', 'rejected'].includes(String(row.status || '').toLowerCase())) return false
    const associated = [row.teamId, row.teamCode].filter(Boolean).map(String)
    return associated.includes(teamId) || (!associated.length && referencedIds.includes(String(row._id)))
  })
  const isHeadCoach = row => [row.role, row.type, row.roleType, row.roleLabel, row.position, row.staffRole]
    .some(value => ['主教练', 'head_coach', 'headcoach', 'head coach'].includes(String(value || '').trim().toLowerCase()))
  const selected = explicitId ? scoped.find(row => String(row._id) === explicitId) : null
  const candidates = selected ? [selected] : scoped.filter(isHeadCoach)
  if (candidates.length !== 1) return { coach: null, state: candidates.length > 1 ? 'ambiguous' : 'missing' }
  const coach = candidates[0]
  // 兼项资料只通过登记的稳定关联复用，不按姓名匹配球员。
  const linked = coach.linkedPlayerId ? players.find(row => String(row._id) === String(coach.linkedPlayerId)) || {} : {}
  const first = (...values) => values.find(value => value !== undefined && value !== null && value !== '') || ''
  const cardFileId = String(coach.coachCardFileId || coach.staffCardFileId || '')
  let cardUrl = '', cardState = 'missing'
  if (cardFileId) {
    try {
      const files = (await cloud.getTempFileURL({ fileList: [cardFileId] })).fileList || []
      cardUrl = String(files.find(file => file.fileID === cardFileId)?.tempFileURL || '')
    } catch (error) { console.error('[lineupHeadCoach] saved card unavailable:', error.message) }
    cardState = cardUrl ? 'ready' : 'load_failed'
  }
  return { state: 'ready', coach: {
    id: String(coach._id), name: String(first(coach.name, coach.coachName, '主教练')),
    photoUrl: String(first(coach.photoUrl, coach.photoFileID, coach.photoFileId, coach.photo, linked.photoUrl, linked.photoFileID, linked.photoFileId, linked.photo)),
    jerseyName: String(first(coach.jerseyName, linked.jerseyName)),
    nationality: String(first(coach.nationality, linked.nationality)),
    teamLogo: String(first(team.logoTransparent, team.logoUrl, team.logo)),
    cardUrl, cardState, cardTier: cardFileId && ['bronze', 'silver', 'gold'].includes(coach.coachCardTier) ? coach.coachCardTier : ''
  } }
}

module.exports = { loadLineupHeadCoach }
