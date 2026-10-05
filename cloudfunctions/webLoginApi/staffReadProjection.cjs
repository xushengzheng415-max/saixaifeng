const PUBLIC_LOGO_FIELDS = ['logo', 'logoUrl', 'logoTransparentUrl', 'logoTransparent', 'logoOriginal', 'logoImage', 'logoFileID', 'logoFileId', 'teamLogo', 'teamLogoUrl', 'teamLogoImage', 'teamLogoFileID', 'teamLogoFileId', 'crest']
const PUBLIC_TEAM_FIELDS = ['_id', 'orgId', 'teamId', 'teamCode', 'name', 'teamName', ...PUBLIC_LOGO_FIELDS, 'status']
const PUBLIC_PLAYER_FIELDS = ['_id', 'teamId', 'teamCode', 'name', 'playerName', 'number', 'jerseyNumber', 'avatarUrl', 'photoUrl', 'position']
const PUBLIC_REGISTRATION_FIELDS = ['_id', 'tournamentId', 'divisionId', 'teamId', 'teamCode', 'teamName', ...PUBLIC_LOGO_FIELDS, 'status', 'registrationStatus']
const PUBLIC_MATCH_FIELDS = ['_id', 'orgId', 'tournamentId', 'divisionId', 'divisionName', 'matchDate', 'matchTime', 'venue', 'homeTeamId', 'awayTeamId', 'homeTeamName', 'awayTeamName', 'homeScore', 'awayScore', 'status', 'resultReviewStatus', 'schedulePublished']

function pick(record, fields) {
  return Object.fromEntries(fields.filter(key => record[key] !== undefined).map(key => [key, record[key]]))
}

function projectStaffRead(collection, record, moduleRight) {
  if (!record) return record
  const detailedTeamAccess = ['event.teams', 'event.registration'].includes(moduleRight)
  if (collection === 'teams' && !detailedTeamAccess) return pick(record, PUBLIC_TEAM_FIELDS)
  if (collection === 'players' && !detailedTeamAccess) return pick(record, PUBLIC_PLAYER_FIELDS)
  if (collection === 'tournament_teams' && !detailedTeamAccess) return pick(record, PUBLIC_REGISTRATION_FIELDS)
  if (collection === 'matches' && ['event.dashboard', 'event.news'].includes(moduleRight)) return pick(record, PUBLIC_MATCH_FIELDS)
  return record
}

module.exports = { projectStaffRead }
