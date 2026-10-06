import { playerCardTemplateRequest } from './cloud'

// 直接读取运营后台已发布的球员卡，不在前端保存卡片结果。
export function readPlayerCard(playerId) {
  const id = String(playerId || '').trim()
  if (!id) return Promise.resolve({ success: true, status: 'unavailable', cardUrl: '' })
  return playerCardTemplateRequest('getPlayerCardForViewer', { playerId: id })
}
