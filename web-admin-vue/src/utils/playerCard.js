import { playerCardTemplateRequest, getPlayerReadIdentity } from './cloud'
const queues = new Map()

export function readPlayerCard(playerId, { cache } = {}) {
  const identity = getPlayerReadIdentity()
  const key = JSON.stringify([identity, cache === 'reload'])
  return new Promise((resolve, reject) => {
    if (!queues.has(key)) {
      queues.set(key, { identity, cache, players: new Map() })
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
      const result = await playerCardTemplateRequest('getPlayerCardsForViewer', { playerIds: batch }, { cache: queued.cache })
      assertIdentity()
      if (!result?.success) throw new Error(result?.error || '球员卡读取失败')
      const byId = new Map((result.cards || []).map(card => [card.playerId, card]))
      for (const id of batch) for (const request of queued.players.get(id)) request.resolve({ success: true, ...(byId.get(id) || { status: 'unavailable', cardUrl: '' }) })
    }
  } catch (error) {
    for (const requests of queued.players.values()) for (const request of requests) request.reject(error)
  }
}
