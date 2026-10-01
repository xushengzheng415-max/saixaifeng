const collections = new Set(['players', 'teams', 'tournament_teams'])
const dbReads = new Set(['list', 'get', 'count'])

export function playerReadCacheTags(action, data = {}) {
  if (action === 'dbQuery' && dbReads.has(data.operation) && collections.has(data.collection)) {
    return data.collection === 'players' ? ['players'] : ['teams']
  }
  if (['getPlayerCardForViewer', 'getPlayerCardsForViewer'].includes(action)) return ['playerCards']
  if (action === 'callFunction' && data.functionName === 'dataCenter' && ['query', 'playerCard'].includes(data.functionParams?.action)) return ['statistics']
  return null
}

export function isReadOnlyRequest(action, data = {}) {
  if (action === 'dbQuery') return dbReads.has(data.operation)
  if (playerReadCacheTags(action, data) || action === 'platformCapacityOverview') return true
  if (/^(get|list|check|public)/.test(action)) return true
  if (action === 'callFunction') {
    const name = data.functionName || ''
    const operation = data.functionParams?.action || ''
    // Temporary file/image processing does not modify player/team facts.
    if (['uploadFile', 'baiduRemoveBg', 'removeImageBg', 'removeLogoBg', 'generateAIImage'].includes(name)) return true
    return /^(get|list)/.test(name) || /^(get|list|query|preview|check|probe)/.test(operation)
  }
  return false
}
