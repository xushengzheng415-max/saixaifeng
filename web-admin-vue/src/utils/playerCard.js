import { playerCardTemplateRequest, getPlayerReadIdentity } from './cloud'
import { createSessionReadCache } from './sessionReadCache.js'
const queues = new Map()
const cardCache = createSessionReadCache({
  identity: getPlayerReadIdentity,
  onChange: detail => window.dispatchEvent(new CustomEvent('sxf-read-cache-change', detail ? { detail } : {}))
})
if (typeof window !== 'undefined') window.addEventListener('sxf-read-cache-change', event => {
  const detail = event.detail || {}
  if (detail.reason === 'refresh' || detail.reason === 'refresh-error') return
  if (['identity', 'session', 'access'].includes(detail.reason) || (detail.tags || []).some(tag => ['players', 'teams', 'playerCards'].includes(tag))) cardCache.clear(detail.reason, false)
})

export function getCachedPlayerCard(playerId) {
  return cardCache.peek(String(playerId))?.card
}

export function readPlayerCard(playerId, { cache } = {}) {
  const id = String(playerId || '')
  return cardCache.read(id, async () => {
    const card = await enqueuePlayerCard(id)
    // Pending/failed cards must remain retryable instead of becoming warm hits.
    return { success: card.success === true && card.status === 'ready', card }
  }, { tags: ['playerCards'], bypass: cache === 'reload' }).then(result => result.card)
}

function enqueuePlayerCard(playerId) {
  const identity = getPlayerReadIdentity()
  const key = identity
  return new Promise((resolve, reject) => {
    if (!queues.has(key)) {
      queues.set(key, { identity, players: new Map() })
      setTimeout(() => flush(key), 0)
    }
    const queue = queues.get(key).players
    if (!queue.has(playerId)) queue.set(playerId, [])
    queue.get(playerId).push({ resolve, reject })
  })
}

async function flush(key) {
  const queued = queues.get(key)
  queues.delete(key)
  if (!queued) return
  const assertIdentity = () => {
    if (getPlayerReadIdentity() !== queued.identity) throw new Error('登录身份或机构已变化')
  }
  const ids = [...queued.players.keys()].sort()
  try {
    assertIdentity()
    for (let offset = 0; offset < ids.length; offset += 50) {
      assertIdentity()
      const batch = ids.slice(offset, offset + 50)
      const result = await playerCardTemplateRequest('getPlayerCardsForViewer', { playerIds: batch }, { cache: 'reload' })
      assertIdentity()
      if (!result?.success) throw new Error(result?.error || '球员卡读取失败')
      const byId = new Map((result.cards || []).map(card => [card.playerId, card]))
      for (const id of batch) for (const request of queued.players.get(id)) request.resolve({ success: true, ...(byId.get(id) || { status: 'unavailable', cardUrl: '' }) })
    }
  } catch (error) {
    for (const requests of queued.players.values()) for (const request of requests) request.reject(error)
  }
}
