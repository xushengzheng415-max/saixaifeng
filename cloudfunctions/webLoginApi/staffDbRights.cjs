// Pure classification only. A caller must also verify identity, grant status,
// event ownership and the actual record's relation to that event.
const RIGHTS = Object.freeze({
  tournaments: ['event.dashboard', 'event.competition', 'event.registration', 'event.teams', 'event.draw', 'event.matches', 'event.results', 'event.news', 'event.referees', 'event.settings'],
  divisions: ['event.dashboard', 'event.competition', 'event.registration', 'event.draw', 'event.matches', 'event.results', 'event.settings'],
  tournament_teams: ['event.dashboard', 'event.competition', 'event.registration', 'event.teams', 'event.draw', 'event.matches', 'event.results'],
  teams: ['event.registration', 'event.teams', 'event.draw', 'event.matches', 'event.results', 'event.news'],
  players: ['event.registration', 'event.teams', 'event.matches', 'event.results'],
  coaches: ['event.teams', 'event.matches'],
  management: ['event.teams'],
  player_library: ['event.teams'],
  coach_library: ['event.teams'],
  matches: ['event.dashboard', 'event.draw', 'event.matches', 'event.results', 'event.news', 'event.referees'],
  match_events: ['event.matches', 'event.results'],
  match_referees: ['event.referees', 'event.matches'],
  tournament_referees: ['event.referees', 'event.matches'],
  referees: ['event.referees'],
  referee_invitations: ['event.referees'],
  tournament_groups: ['event.draw', 'event.competition', 'event.matches'],
  tournament_bracket: ['event.draw', 'event.results', 'event.matches'],
  tournament_league_tables: ['event.draw', 'event.results', 'event.matches'],
  rosters: ['event.teams'],
  roster_change_requests: ['event.teams'],
  squads: ['event.teams', 'event.matches'],
  standings: ['event.results'],
  schedule_info: ['event.matches'],
  team_tasks: ['event.registration', 'event.teams']
})

const SPECIAL = Object.freeze({
  confirmDivisionRules: 'event.competition',
  reviseDivisionRules: 'event.competition',
  deleteDivision: 'event.competition',
  renameDivision: 'event.competition',
  upgradeDivisionToProfessional: 'event.competition',
  confirmCompetitionPlan: 'event.competition',
  assignTournamentTeamDivision: 'event.registration',
  deleteTournamentWorkspace: 'event.settings'
})

const resultField = /^(?:homeScore|awayScore|scoreHome|scoreAway|winnerTeamId|resolution|result[A-Z_]|organizerSupplement[A-Z_]|refereeReviewStatus|refereeRecordArchivedAt|refereeRecordLocked)/
const refereeField = /^(?:referee[A-Z_]|operationRefereeId|refereeRecordKeeperId|headRefereeId)/
const drawField = /^(?:draw[A-Z_]|group[A-Z_]|pairing[A-Z_]|bracket[A-Z_])/
const registrationField = /^(?:registration[A-Z_]|signup[A-Z_]|application[A-Z_])/

function readRights(collection) {
  return RIGHTS[collection] || []
}

function writeRights(collection, operation, data = {}) {
  if (SPECIAL[operation]) return [SPECIAL[operation]]
  if (!['add', 'update', 'delete'].includes(operation) || !RIGHTS[collection]) return []
  if (collection === 'referees') return [] // Global referee credentials are not event-scoped.
  const fields = Object.keys(data || {}).filter(field => !['updateTime', 'updatedAt', 'tournamentId'].includes(field))
  // An event grant cannot change the owner, organization, record identity or
  // authorization graph, even when the caller has the settings module.
  if (fields.some(field => /^(?:_id|orgId|organizationId|organization_id|ownerId|organizerId|auth(?:orization)?|permission(?:s)?|staffGrants?|createdByUserId)$/i.test(field))) return []
  const required = new Set()
  if (collection === 'tournaments') {
    for (const field of fields) required.add(/^regulations?(?:[A-Z_]|$)|^regulationRecognition/.test(field) ? 'event.competition' : drawField.test(field) ? 'event.draw' : registrationField.test(field) ? 'event.registration' : resultField.test(field) ? 'event.results' : 'event.settings')
    if (!fields.length) required.add('event.settings')
  } else if (collection === 'divisions') {
    for (const field of fields) required.add(/^(?:draw[A-Z_]|pairing[A-Z_]|bracket[A-Z_])/.test(field) ? 'event.draw' : registrationField.test(field) ? 'event.registration' : 'event.competition')
    if (!fields.length) required.add('event.competition')
  } else if (collection === 'matches') {
    for (const field of fields) required.add(resultField.test(field) ? 'event.results' : refereeField.test(field) ? 'event.referees' : 'event.matches')
    if (!fields.length) required.add('event.matches')
  } else if (collection === 'tournament_teams') {
    for (const field of fields) required.add(/^(?:roster|player|coach|staff|lineup)/i.test(field) ? 'event.teams' : 'event.registration')
    if (!fields.length) required.add('event.registration')
  } else if (['teams', 'players', 'coaches', 'management', 'player_library', 'coach_library', 'rosters', 'roster_change_requests', 'squads'].includes(collection)) required.add('event.teams')
  else if (['tournament_groups', 'tournament_bracket', 'tournament_league_tables'].includes(collection)) required.add('event.draw')
  else if (['referees', 'referee_invitations', 'match_referees', 'tournament_referees'].includes(collection)) required.add('event.referees')
  else if (['match_events', 'standings'].includes(collection)) required.add('event.results')
  else if (collection === 'schedule_info') required.add('event.matches')
  else if (collection === 'team_tasks') required.add('event.registration')
  return [...required]
}

module.exports = { readRights, writeRights }
