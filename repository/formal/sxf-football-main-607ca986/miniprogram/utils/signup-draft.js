var STORAGE_KEY = 'pendingTournamentSignup'

function decode(value) {
  try { return decodeURIComponent(String(value || '')) } catch (error) { return String(value || '') }
}

function queryFromPath(path) {
  var source = String(path || '')
  var query = source.indexOf('?') >= 0 ? source.split('?')[1] : ''
  var result = {}
  query.split('&').forEach(function(part) {
    if (!part) return
    var pair = part.split('=')
    result[decode(pair[0])] = decode(pair.slice(1).join('='))
  })
  return result
}

function buildPath(draft) {
  var path = '/pages/tournament/signup/signup?id=' + encodeURIComponent(draft.tournamentId || '')
  if (draft.divisionId) path += '&divisionId=' + encodeURIComponent(draft.divisionId)
  if (draft.inviteKey) path += '&inviteKey=' + encodeURIComponent(draft.inviteKey)
  path += '&from=task'
  return path
}

function normalize(draft) {
  if (!draft || !draft.tournamentId) return null
  var result = {
    tournamentId: String(draft.tournamentId || ''),
    tournamentName: String(draft.tournamentName || '赛事报名'),
    divisionId: String(draft.divisionId || 'default'),
    divisionName: String(draft.divisionName || ''),
    inviteKey: String(draft.inviteKey || ''),
    teamId: String(draft.teamId || ''),
    teamName: String(draft.teamName || ''),
    stage: String(draft.stage || 'service_follow'),
    savedAt: Number(draft.savedAt || Date.now())
  }
  result.path = buildPath(result)
  return result
}

function save(draft) {
  var normalized = normalize(draft)
  if (!normalized) return null
  wx.setStorageSync(STORAGE_KEY, normalized)
  return normalized
}

function read() {
  var stored = normalize(wx.getStorageSync(STORAGE_KEY))
  if (stored) return stored
  var returnUrl = wx.getStorageSync('teamOnboardingReturnUrl') || wx.getStorageSync('loginRedirectUrl') || ''
  if (String(returnUrl).indexOf('/pages/tournament/signup/signup') !== 0) return null
  var query = queryFromPath(returnUrl)
  var team = wx.getStorageSync('teamInfo') || wx.getStorageSync('currentTeam') || {}
  return save({
    tournamentId: query.id || query.tournamentId || '',
    divisionId: query.divisionId || 'default',
    inviteKey: query.inviteKey || '',
    teamId: team._id || team.teamId || wx.getStorageSync('currentTeamId') || '',
    teamName: team.name || team.teamName || '',
    stage: 'service_follow'
  })
}

function clear() {
  wx.removeStorageSync(STORAGE_KEY)
}

function resolveAgainstRegistrations(draft, registrations) {
  var item = normalize(draft)
  if (!item) return null
  var completed = (registrations || []).some(function(registration) {
    var sameTournament = String(registration.tournamentId || '') === item.tournamentId
    var sameTeam = !item.teamId || String(registration.teamId || '') === item.teamId
    var sameDivision = !item.divisionId || item.divisionId === 'default' || String(registration.divisionId || 'default') === item.divisionId
    var status = String(registration.status || '').toLowerCase()
    return sameTournament && sameTeam && sameDivision && ['pending', 'approved', 'confirmed', 'active', 'locked'].indexOf(status) >= 0
  })
  if (!completed) return item
  clear()
  wx.removeStorageSync('teamOnboardingReturnUrl')
  wx.removeStorageSync('loginRedirectUrl')
  return null
}

function toTask(draft) {
  var item = normalize(draft)
  if (!item) return null
  return {
    id: 'registration-draft:' + item.tournamentId + ':' + item.teamId,
    type: 'registration_draft',
    audience: 'team',
    source: 'event',
    sourceText: '报名未完成',
    status: 'pending',
    title: '继续完成赛事报名',
    subtitle: item.tournamentName || item.teamName || '赛事报名',
    tournamentId: item.tournamentId,
    teamId: item.teamId,
    divisionId: item.divisionId,
    inviteKey: item.inviteKey,
    targetPage: item.path,
    deadlineText: '请继续完成关注与报名确认'
  }
}

module.exports = { save: save, read: read, clear: clear, resolveAgainstRegistrations: resolveAgainstRegistrations, toTask: toTask, buildPath: buildPath }
