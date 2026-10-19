const collections = new Set(['players', 'teams', 'tournament_teams'])
const dbReads = new Set(['list', 'get', 'count'])

export function playerReadCacheTags(action, data = {}) {
  if (action === 'dbQuery' && dbReads.has(data.operation) && collections.has(data.collection)) {
    return data.collection === 'players' ? ['players'] : ['teams']
  }
  if (['getPlayerCardForViewer', 'getPlayerCardsForViewer'].includes(action)) return ['playerCards']
  // Statistics and career grades always read the current server snapshot. Raw
  // profile cache entries must not turn historical/unknown fields into a grade.
  return null
}

export function isReadOnlyRequest(action, data = {}) {
  if (action === 'dbQuery') return dbReads.has(data.operation)
  if (playerReadCacheTags(action, data) || action === 'platformCapacityOverview') return true
  if (/^(get|list|check|public)/.test(action)) return true
  if (action === 'rosterExceptionBoard' && data.rosterAction === 'listRoster') return true
  if (action === 'callFunction') {
    const name = data.functionName || ''
    const operation = data.functionParams?.action || ''
    // The router reads tournament staff scope while navigating protected pages.
    // Treat these lookup-only actions as reads so they do not flush player/team
    // data caches before and after every page transition.
    if (name === 'tournamentStaffAccess' && ['scope', 'mine', 'invitations', 'managed'].includes(operation)) return true
    if (name === 'resultCenter' && ['dashboard', 'staffMatches'].includes(operation)) return true
    if (name === 'dataCenter' && ['query', 'playerCard', 'playerDetail', 'catalog'].includes(operation)) return true
    // Temporary file/image processing does not modify player/team facts.
    if (['uploadFile', 'baiduRemoveBg', 'removeImageBg', 'removeLogoBg', 'generateAIImage'].includes(name)) return true
    return /^(get|list)/.test(name) || /^(get|list|query|preview|check|probe)/.test(operation)
  }
  return false
}
