const text = value => String(value == null ? '' : value).trim()
async function read(db, name, id) {
  try {
    const response = await db.collection(name).doc(id).get()
    return Array.isArray(response.data) ? response.data[0] : response.data || null
  } catch (_) { return null }
}
async function folderRight(db, folder, tournamentId) {
  const path = text(folder).replace(/^\/+|\/+$/g, '')
  if (path === `tournament-news/${tournamentId}`) return 'event.news'
  if (path === `referee-avatars/${tournamentId}` || path === `referee-certificates/${tournamentId}`) return 'event.referees'
  if (path === 'tournament-regulations') return 'event.competition'
  if (['tournament-logos','tournament-logo-source'].includes(path)) return 'event.settings'
  if (path === 'team-logos') return 'event.teams'
  const team = path.match(/^(?:team-logos|player-photos|idcard-photos)\/([^/]+)$/)
  if (team) {
    const rows = (await db.collection('tournament_teams').where({ tournamentId, teamId:team[1] }).limit(2).get()).data || []
    return rows.length === 1 ? 'event.teams' : ''
  }
  const match = path.match(/^(?:match-supplements|match-reports)\/([^/]+)$/)
  if (match) {
    const row = await read(db, 'matches', match[1])
    return row && text(row.tournamentId) === tournamentId ? 'event.results' : ''
  }
  return ''
}
async function staffUploadRight(db, params, tournamentId, orgId, userId) {
  const action = text(params.action)
  if (action === 'startChunk' || action === 'uploadBase64') return folderRight(db, params.folder, tournamentId)
  if (['uploadChunk','finishChunk','abortChunk'].includes(action)) {
    const row = await read(db, 'chunk_sessions', text(params.uploadId))
    if (!row || text(row.staffTournamentId) !== tournamentId || text(row.staffOrgId) !== orgId || text(row.staffUserId) !== userId) return ''
    return folderRight(db, row.folder, tournamentId)
  }
  if (action === 'getTempFileURL') {
    const fileId = text(params.fileID)
    const path = fileId.replace(/^cloud:\/\/[^/]+\//, '').split('?')[0]
    if (!fileId.startsWith('cloud://') || path === fileId) return ''
    const folder = path.split('/').slice(0, path.startsWith('tournament-news/') || /^(?:match-supplements|match-reports|team-logos|player-photos|idcard-photos|referee-avatars|referee-certificates)\//.test(path) ? 2 : 1).join('/')
    const right = await folderRight(db, folder, tournamentId)
    if (!right) return ''
    if (['tournament-logos','tournament-logo-source','tournament-regulations','team-logos'].includes(folder)) {
      const event = await read(db, 'tournaments', tournamentId)
      const saved = [event?.logo, event?.logoUrl, event?.logoSourceUrl, event?.regulationsFileId, event?.regulationsUrl].map(text).includes(fileId)
      const audited = (await db.collection('tournament_staff_audit').where({ orgId, tournamentId, fileID:fileId }).limit(2).get()).data || []
      if (!saved && !audited.length) return ''
    }
    return right
  }
  return ''
}
module.exports = { staffUploadRight, folderRight }
