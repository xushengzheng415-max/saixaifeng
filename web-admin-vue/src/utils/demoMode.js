const MODE_KEY = 'sxfTournamentDemoMode'
const EVENT_NAME = 'sxf-tournament-demo-mode-change'
import { createDemoWorkspace } from './demoWorkspace.mjs'
const DATA_KEY = 'sxfDemoWorkspaceV2'
// 与 cloud.js 的 WEB_LOGIN_API_URL 保持一致：平台演示数据池只能走这条零 SDK 的 HTTP 入口。
const WEB_LOGIN_API_URL = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'
const POOL_KEY = 'sxfTournamentDemoPoolDataset'
let workspace
let owner
function accountKey() {
  try { const user = JSON.parse(localStorage.getItem('userInfo') || '{}'); return String(user._id || user.uid || user.phone || '') } catch { return '' }
}
// 演示数据来自平台公用的虚拟数据池，进入演示模式前拉取一次并缓存到会话。
// 这里刻意不走 callFunctionHTTP：调用链会在演示模式下被拦截到浏览器内存仓库。
function platformPoolDataset() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(POOL_KEY) || 'null')
    return saved && Array.isArray(saved.teams) && saved.teams.length ? saved : null
  } catch {
    sessionStorage.removeItem(POOL_KEY)
    return null
  }
}
export async function fetchPlatformDemoPool() {
  if (!isDemoModeAvailable()) return null
  const token = localStorage.getItem('authToken') || ''
  if (!token) return null
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timeoutId = controller ? setTimeout(() => controller.abort(), 30000) : null
  try {
    const response = await fetch(WEB_LOGIN_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'demoPoolDataset', authToken: token }),
      ...(controller ? { signal: controller.signal } : {})
    })
    const text = await response.text()
    let payload = null
    try { payload = text ? JSON.parse(text) : null } catch { payload = null }
    if (payload && typeof payload.body === 'string') { try { payload = JSON.parse(payload.body) } catch { /* 保留原响应 */ } }
    const dataset = payload?.dataset
    if (!response.ok || !payload?.success || !Array.isArray(dataset?.teams) || !dataset.teams.length) {
      console.warn('[demoMode] 平台演示数据池响应不可用，回退本地虚拟数据集：', payload?.error || payload?.message || `HTTP ${response.status}`)
      return null
    }
    try { sessionStorage.setItem(POOL_KEY, JSON.stringify(dataset)) } catch { sessionStorage.removeItem(POOL_KEY) }
    return dataset
  } catch (error) {
    console.warn('[demoMode] 平台演示数据池读取失败，回退本地虚拟数据集：', error?.message || error)
    return null
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}
export function demoRequest(action, data = {}) {
  const identity = accountKey()
  if (!workspace || owner !== identity) {
    workspace = createDemoWorkspace({assetBase:import.meta.env.BASE_URL, poolDataset: platformPoolDataset()})
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
  return ['/admin/', '/preview/admin/'].includes(String(import.meta.env.BASE_URL || ''))
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
    sessionStorage.removeItem(POOL_KEY)
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index)
      if (key?.startsWith('sxf-draw-screen:demo-')) localStorage.removeItem(key)
    }
    workspace = undefined
    owner = undefined
  }
  window.dispatchEvent(new Event(EVENT_NAME))
  return true
}

export function demoModeChangeEvent() {
  return EVENT_NAME
}
