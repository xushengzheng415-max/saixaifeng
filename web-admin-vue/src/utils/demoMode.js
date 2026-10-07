const MODE_KEY = 'sxfTournamentDemoMode'
const EVENT_NAME = 'sxf-tournament-demo-mode-change'

export function isDemoModeAvailable() {
  return String(import.meta.env.BASE_URL || '').startsWith('/preview/admin/')
}

export function isDemoMode(tournamentId = '') {
  if (!isDemoModeAvailable() || sessionStorage.getItem(MODE_KEY) !== '1') return false
  const activeTournamentId = sessionStorage.getItem('sxfTournamentDemoId') || ''
  return !tournamentId || !activeTournamentId || String(tournamentId) === activeTournamentId
}

export function setDemoMode(enabled, tournamentId = '') {
  if (!isDemoModeAvailable()) return false
  if (enabled) {
    sessionStorage.setItem(MODE_KEY, '1')
    if (tournamentId) sessionStorage.setItem('sxfTournamentDemoId', String(tournamentId))
  } else {
    sessionStorage.removeItem(MODE_KEY)
    sessionStorage.removeItem('sxfTournamentDemoId')
  }
  window.dispatchEvent(new Event(EVENT_NAME))
  return true
}

export function demoModeChangeEvent() {
  return EVENT_NAME
}
