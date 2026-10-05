const text = value => String(value == null ? '' : value).trim()
const FILE_REFERENCE_FIELDS = Object.freeze({
  team: ['logo','logoUrl','logoTransparentUrl','logoTransparent','logoOriginal','logoImage','teamLogo','teamLogoUrl','teamLogoImage','teamLogoFileID','teamLogoFileId','logoFileID','logoFileId','logoTransparentFileId','logoCloudFileId','avatarUrl','crest'],
  player: ['photoUrl','photo','photoFileId','photoFileID','avatarUrl','avatarFileId','portraitUrl','portraitFileId','imageUrl','headImgUrl','standardPortraitUrl']
})
const TEAM_ASSET_MODULES = new Set(['event.dashboard','event.registration','event.teams','event.draw','event.matches','event.results'])
function containsFile(record, fields, fileId) {
  const includes = (value, depth = 0) => {
    if (typeof value === 'string') return text(value) === fileId
    if (!value || typeof value !== 'object' || depth > 3) return false
    if ([value.fileID,value.fileId,value.url,value.cloudFileId].some(item => text(item) === fileId)) return true
    return Object.values(value).some(item => includes(item, depth + 1))
  }
  return fields.some(field => includes(record && record[field]))
}
function moduleRight(params, fallback) {
  const requested = text(params && (params.staffModule || params.__staffModule))
  if (['event.teams','event.registration','event.settings'].includes(fallback) && TEAM_ASSET_MODULES.has(requested)) return requested
  return fallback
}
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
  if (/^(?:team-logos|player-photos)\/imports\/[^/]+$/.test(path)) return path.split('/')[2] === tournamentId ? 'event.registration' : ''
  if (path === 'tournament-regulations') return 'event.competition'
  if (['tournament-logos','tournament-logo-source'].includes(path)) return 'event.settings'
  if (['team-logos','player-photos'].includes(path)) return 'event.teams'
  const team = path.match(/^(?:team-logos|player-photos)\/([^/]+)$/)
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
    if (/^idcard-photos\//.test(path)) return ''

    // Staff uploads have a server-created audit link to exactly one event. Use
    // that link for root-level team/player images whose storage path has no ID.
    try {
      const audited = (await db.collection('tournament_staff_audit').where({ orgId, tournamentId, fileID:fileId }).limit(2).get()).data || []
      for (const row of audited) {
        if (row.action !== 'upload.file' || text(row.fileID) !== fileId) continue
        const auditedRight = await folderRight(db, row.folder, tournamentId)
        if (auditedRight) return moduleRight(params, auditedRight)
      }
    } catch (_) { /* fall through to persisted event references */ }

    const event = await read(db, 'tournaments', tournamentId)
    if (!event) return ''
    if (containsFile(event, FILE_REFERENCE_FIELDS.team.concat(['logoSourceUrl']), fileId)) {
      return moduleRight(params, 'event.settings')
    }
    if (containsFile(event, ['regulationsFileId','regulationsUrl','regulationsSourceFileId'], fileId)) return moduleRight(params, 'event.competition')

    const registrations = (await db.collection('tournament_teams').where({ tournamentId }).limit(1000).get()).data || []
    if (registrations.some(row => containsFile(row, FILE_REFERENCE_FIELDS.team, fileId))) return moduleRight(params, 'event.registration')
    if (registrations.length >= 1000) return ''
    const teamIds = [...new Set(registrations.map(row => text(row.teamId)).filter(Boolean))]
    const teamCodes = [...new Set(registrations.map(row => text(row.teamCode)).filter(Boolean))]
    const command = db.command
    for (let offset = 0; offset < teamIds.length; offset += 20) {
      const batch = teamIds.slice(offset, offset + 20)
      const teams = (await db.collection('teams').where({ _id: command.in(batch) }).limit(batch.length).get()).data || []
      if (teams.some(row => containsFile(row, FILE_REFERENCE_FIELDS.team, fileId))) return moduleRight(params, 'event.teams')
      const players = (await db.collection('players').where({ teamId: command.in(batch) }).limit(1000).get()).data || []
      if (players.some(row => containsFile(row, FILE_REFERENCE_FIELDS.player, fileId))) return moduleRight(params, 'event.teams')
      teamCodes.push(...teams.map(row => text(row.teamCode || row.code)).filter(Boolean))
    }
    const uniqueTeamCodes = [...new Set(teamCodes)]
    for (let offset = 0; offset < uniqueTeamCodes.length; offset += 20) {
      const batch = uniqueTeamCodes.slice(offset, offset + 20)
      const players = (await db.collection('players').where({ teamCode: command.in(batch) }).limit(1000).get()).data || []
      if (players.some(row => containsFile(row, FILE_REFERENCE_FIELDS.player, fileId))) return moduleRight(params, 'event.teams')
    }

    const folder = path.split('/').slice(0, path.startsWith('tournament-news/') || /^(?:match-supplements|match-reports|team-logos|player-photos|referee-avatars|referee-certificates)\//.test(path) ? 2 : 1).join('/')
    const pathParts = path.split('/')
    if (['team-logos','player-photos'].includes(pathParts[0]) && pathParts[1] === 'imports' && pathParts[2] === tournamentId) return moduleRight(params, 'event.registration')
    if (['tournament-logos','tournament-logo-source','tournament-regulations','team-logos','player-photos'].includes(folder)) return ''
    return folderRight(db, folder, tournamentId)
  }
  return ''
}
module.exports = { staffUploadRight, folderRight }
