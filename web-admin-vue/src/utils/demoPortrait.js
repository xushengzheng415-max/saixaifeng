// 演示阵容使用的本地头像。不访问网络，刷新后同一球员颜色和号码保持不变。
function xmlText(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]))
}

export function demoPlayerPortrait(player = {}) {
  const rawNumber = String(player.number ?? player.jerseyNumber ?? '').replace(/\D/g, '')
  const label = (rawNumber || String(player.name || '球员')).slice(-2) || '球员'
  const seed = String(player._id || player.id || player.playerId || player.name || label)
  const hue = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="64" fill="hsl(${hue} 42% 38%)"/><text x="64" y="76" text-anchor="middle" font-family="Arial,sans-serif" font-size="36" font-weight="700" fill="#ffffff">${xmlText(label)}</text></svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

export function stableDemoPhoto(player = {}, fallbackNumber = '') {
  const current = String(player.photo || player.photoUrl || player.avatarUrl || '')
  if (current.startsWith('data:image/') || current.startsWith('/') || current.startsWith('blob:')) {
    if (!player.photo) player.photo = current
    return current
  }
  const photo = demoPlayerPortrait({ ...player, number: player.jerseyNumber || player.number || fallbackNumber })
  player.photo = photo
  player.photoUrl = photo
  player.avatarUrl = photo
  player.photoFileID = photo
  return photo
}

// 演示开赛门禁：双方至少各有 1 名已填姓名或编号的上场球员。正式办赛不走这里。
export function demoStartLineupBlock(lineups = {}, names = {}) {
  const count = side => {
    const players = lineups?.[side]?.players
    if (!Array.isArray(players)) return 0
    return players.filter(player => player && typeof player === 'object' && !Array.isArray(player) && (player.id || player._id || player.playerId || String(player.name || player.playerName || '').trim())).length
  }
  const home = count('home')
  const away = count('away')
  if (home >= 1 && away >= 1) return ''
  const missing = []
  if (home < 1) missing.push(names.home || '主队')
  if (away < 1) missing.push(names.away || '客队')
  return `演示开赛前，双方都至少要有 1 名球员上场。${missing.join('、')}还没有首发，请先在「编辑阵容」安排上场球员。`
}
