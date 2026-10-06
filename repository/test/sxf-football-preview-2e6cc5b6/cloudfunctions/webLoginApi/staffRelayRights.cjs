const { writeRights } = require('./staffDbRights.cjs')

const registrationActions = new Set([
  'setDivisionRegistration', 'importTeamRegistrationBatch', 'createTargetedTeamInvitations',
  'generateTeamInviteCode', 'ensureInvite', 'createTargetedRegistrationLink',
  'createTournamentClaimCode', 'reviewRegistration', 'cancelTournamentInvitation',
  'deleteUnclaimedTournamentTeam', 'removeClaimedTournamentTeam',
  'retryRegistrationNotifications', 'notificationStatus', 'getInvitation'
])
const refereeActions = new Set([
  'createRefereeFollowInvite', 'createTemporaryRefereeClaim', 'reviewTemporaryRefereeClaim'
])
const teamActions = new Set([
  'getTeamExportPhotos', 'getTeamRegistrationSource', 'listTournamentRosterPlayers',
  'approveTournamentPlayer', 'listTeamExportRoster'
])
const claimReviewActions = new Set(['listClaimReviewRequests', 'getClaimReviewProofUrls', 'decideClaimReview'])
const drawActions = new Set(['savePairingTemplate', 'ensureKnockoutPairings', 'generatePairings', 'resetPairings'])
const matchActions = new Set(['', 'saveDraft', 'importScheduleAssignments', 'scheduleExistingPairings', 'publishSchedule'])

function relayRights(name, params = {}) {
  const action = String(params.action || '')
  if (name === 'tournamentStaffAccess') return [] // This function authenticates its own caller.
  if (name === 'newsCenter') {
    if (action === 'list') return { any: ['event.news', 'news.edit', 'news.publish'] }
    if (action === 'saveDraft') return { any: ['event.news', 'news.edit'] }
    if (action === 'publish' || action === 'withdraw') return { any: ['event.news', 'news.publish'] }
    return null
  }
  if (name === 'resultCenter') {
    if (action === 'dashboard') return { any: ['event.dashboard', 'event.results', 'event.news', 'news.edit', 'news.publish'] }
    if (action === 'staffMatches' || action === 'supplementResult') return { any: ['event.results', 'result.supplement'] }
    return ['resolvePairingSources', 'publishStandings', 'correctArchivedScore'].includes(action) ? ['event.results'] : null
  }
  if (name === 'newsPreviewGenerate') return ['event.news']
  if (name === 'tournamentRegistrationFlow') return registrationActions.has(action) ? ['event.registration'] : refereeActions.has(action) ? ['event.referees'] : null
  if (name === 'organizerClaimInvite') return teamActions.has(action) ? ['event.teams'] : claimReviewActions.has(action) || action === '' ? ['event.registration'] : null
  if (name === 'generateSchedule') return drawActions.has(action) ? ['event.draw'] : matchActions.has(action) ? ['event.matches'] : action === 'publishRegulations' ? ['event.competition'] : null
  if (name === 'updateMatch') {
    if (action === 'assignByHeadReferee') return null // Head referee uses a separate personal identity.
    if (action === 'undoLastScheduleAdjustment') return ['event.matches']
    if (action === 'finishOrganizerMatch') return ['event.results']
    return writeRights('matches', 'update', params.data || {})
  }
  if (name === 'tournamentReview') return ['getRequests', 'approve', 'reject'].includes(action) ? ['event.registration'] : null
  if (name === 'reviewRosterChange') return ['event.teams']
  if (name === 'setHeadReferee') return ['event.referees']
  if (name === 'getSignatureStatus') return ['event.matches']
  if (name === 'getTournaments') return ['event.registration']
  if (name === 'baiduRemoveBg') return ['event.teams']
  if (name === 'parseTournamentRegulations') return ['event.competition']
  if (name === 'getRegulations') return { any:['event.dashboard','event.competition','event.settings'] }
  if (name === 'dataCenter') return { any: ['event.dashboard', 'event.teams', 'event.results'] }
  return null
}

module.exports = { relayRights }
