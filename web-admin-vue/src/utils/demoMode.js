const MODE_KEY = 'sxfTournamentDemoMode'
const EVENT_NAME = 'sxf-tournament-demo-mode-change'
import { createDemoWorkspace } from './demoWorkspace.mjs'
const DATA_KEY = 'sxfDemoWorkspaceV2'
let workspace
let owner
function accountKey() {
  try { const user = JSON.parse(localStorage.getItem('userInfo') || '{}'); return String(user._id || user.uid || user.phone || '') } catch { return '' }
}
export function demoRequest(action, data = {}) {
  const identity = accountKey()
  if (!workspace || owner !== identity) {
    workspace = createDemoWorkspace({assetBase:import.meta.env.BASE_URL})
    owner = identity
    try { const saved = JSON.parse(sessionStorage.getItem(DATA_KEY) || 'null'); if (saved?.owner === identity) workspace.restore(saved.data) } catch { sessionStorage.removeItem(DATA_KEY) }
  }
  const before = workspace.snapshot()
  try {
    const result = workspace.request(action, data)
    sessionStorage.setItem(DATA_KEY, JSON.stringify({ owner: identity, data: workspace.snapshot() }))
    return result
  } catch (error) {
    workspace.restore(before)
    if (error?.name === 'QuotaExceededError') throw new Error('演示数据已满，请退出演示后重新开始')
    throw error
  }
}

export function isDemoModeAvailable() {
  return String(import.meta.env.BASE_URL || '').startsWith('/preview/admin/')
}

export function isDemoMode(tournamentId = '') {
  if (!isDemoModeAvailable() || sessionStorage.getItem(MODE_KEY) !== '1') return false
  const routeId = typeof window !== 'undefined' ? String(window.location?.hash || '').match(/^#?\/tournaments\/([^/?#]+)/)?.[1] || '' : ''
  const targetId = String(tournamentId || (routeId === 'create' ? '' : routeId))
  return !targetId || targetId.startsWith('demo-')
}

export function leaveDemoForRealTournament(tournamentId) {
  const targetId = String(tournamentId || '')
  if (!isDemoModeAvailable() || !targetId || targetId === 'create' || targetId.startsWith('demo-') || sessionStorage.getItem(MODE_KEY) !== '1') return false
  setDemoMode(false)
  return true
}

export function setDemoMode(enabled, tournamentId = '') {
  if (!isDemoModeAvailable()) return false
  if (enabled) {
    sessionStorage.setItem(MODE_KEY, '1')
    if (tournamentId) sessionStorage.setItem('sxfTournamentDemoId', String(tournamentId))
  } else {
    sessionStorage.removeItem(MODE_KEY)
    sessionStorage.removeItem('sxfTournamentDemoId')
    sessionStorage.removeItem(DATA_KEY)
    workspace = undefined
    owner = undefined
  }
  window.dispatchEvent(new Event(EVENT_NAME))
  return true
}

export function demoModeChangeEvent() {
  return EVENT_NAME
}
