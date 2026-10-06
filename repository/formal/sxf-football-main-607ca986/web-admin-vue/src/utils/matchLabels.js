export function formatMatchPhase(match = {}) {
  const phase = String(match.phase || match.scheduleType || '').toLowerCase()
  const label = {
    group: '小组赛',
    league: '联赛阶段',
    knockout: '淘汰赛',
    cup: '淘汰赛',
    final: '决赛阶段',
    ranking: '排位赛'
  }[phase] || match.phase || '-'
  const groupName = String(match.group || match.pool || '').trim()
  return phase === 'group' && groupName ? `${label} · ${groupName}` : label
}

export function formatMatchRound(match = {}) {
  const phase = String(match.phase || match.scheduleType || '').toLowerCase()
  const roundNumber = Number(match.round ?? match.roundNumber ?? match.scheduleRound)
  const hasRoundNumber = Number.isFinite(roundNumber) && roundNumber > 0
  const rawRoundName = String(match.roundName || '').trim()

  if (['league', 'group'].includes(phase) && hasRoundNumber) {
    return `第${roundNumber}轮`
  }

  const semanticRoundName = rawRoundName
    .replace(/^(淘汰赛|杯赛阶段)\s*/, '')
    .trim()
  const genericNames = new Set(['', '联赛', '联赛阶段', '小组赛', '淘汰赛', '杯赛阶段'])
  if (!genericNames.has(semanticRoundName) && !semanticRoundName.startsWith('小组赛 ')) {
    return semanticRoundName
  }

  return hasRoundNumber ? `第${roundNumber}轮` : '-'
}
