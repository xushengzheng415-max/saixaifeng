import { playerCardTemplateRequest } from './cloud'

// 直接读取运营后台已发布的球员卡，不在前端保存卡片结果。
export function readPlayerCard(playerId) {
  const id = String(playerId || '').trim()
  if (!id) return Promise.resolve({ success: true, status: 'unavailable', cardUrl: '' })
  return playerCardTemplateRequest('getPlayerCardForViewer', { playerId: id })
}

// 阵容编辑器一次从卡库读取本场名单；结果只保存在当前弹窗内存中。
export async function readPlayerCards(playerIds) {
  const ids = [...new Set((Array.isArray(playerIds) ? playerIds : []).map(id => String(id || '').trim()).filter(Boolean))]
  const cards = []
  for (let offset = 0; offset < ids.length; offset += 100) {
    const result = await playerCardTemplateRequest('getPlayerCardsForViewer', { playerIds: ids.slice(offset, offset + 100) })
    if (!result?.success) throw new Error(result?.error || '球员卡读取失败')
    cards.push(...(Array.isArray(result.cards) ? result.cards : []))
  }
  return { success: true, cards }
}
