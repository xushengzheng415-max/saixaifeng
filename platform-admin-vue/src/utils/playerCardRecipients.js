// Group only the server-authorized candidate IDs; the directory never grants eligibility.
export function recipientTree(candidates, catalog, scope, mode = 'tournament', keyword = '', selectedIds = []) {
  const selected = new Set(selectedIds)
  candidates = candidates.filter(row => !selected.has(String(row.id)))
  const rows = new Map(candidates.map(row => [String(row.id), row]))
  const profiles = new Map((catalog.players || []).map(row => [String(row.id), row]))
  const teams = new Map((catalog.teams || []).map(row => [String(row.id), row]))
  const key = keyword.trim().toLocaleLowerCase()
  const scopeName = scope?.type === 'platform' ? '全平台' : scope?.targetName || ({tournament:'本赛事',team:'本球队',player:'指定球员'}[scope?.type] || '可发放范围')
  function leaf(row, path, labels) {
    if (key && ![row.name, row.teamName, row.id, ...labels].some(value => String(value || '').toLocaleLowerCase().includes(key))) return null
    return { id: `${path}/player/${row.id}`, label: row.name, playerId: String(row.id), row, disabled: !row.eligible || selected.has(String(row.id)) }
  }
  function group(id, label, children) {
    const present = children.filter(Boolean)
    if (!present.length) return null
    return { id, label, children: present, disabled: present.every(child => child.disabled) }
  }
  let children = []
  if (mode === 'player') children = candidates.map(row => leaf(row, 'people', [scopeName]))
  else if (mode === 'team') {
    const byTeam = new Map()
    for (const row of candidates) {
      const teamId = String(profiles.get(String(row.id))?.teamId || '')
      if (!byTeam.has(teamId)) byTeam.set(teamId, [])
      byTeam.get(teamId).push(row)
    }
    children = [...byTeam].map(([teamId, players]) => {
      const name = teams.get(teamId)?.name || (teamId ? `球队 ${teamId}` : '球队归属待核查')
      return group(`team/${teamId}`, name, players.map(row => leaf(row, `team/${teamId}`, [scopeName, name])))
    })
  } else {
    const used = new Set()
    for (const tournament of catalog.tournaments || []) {
      if (scope?.type === 'tournament' && String(tournament.id) !== String(scope.targetId)) continue
      const byTeam = new Map()
      for (const roster of catalog.rosters || []) {
        if (String(roster.tournamentId) !== String(tournament.id)) continue
        const teamId = String(roster.teamId || '')
        if (!byTeam.has(teamId)) byTeam.set(teamId, new Set())
        for (const id of roster.playerIds || []) if (rows.has(String(id))) byTeam.get(teamId).add(String(id))
      }
      const groups = [...byTeam].map(([teamId, ids]) => {
        const path = `event/${tournament.id}/team/${teamId}`, name = teams.get(teamId)?.name || `球队 ${teamId}`
        return group(path, name, [...ids].map(id => { used.add(id); return leaf(rows.get(id), path, [scopeName, tournament.name, name]) }))
      })
      children.push(group(`event/${tournament.id}`, tournament.name, groups))
    }
    if (scope?.type === 'tournament') children = children.filter(Boolean).flatMap(node => node.children)
    // Locked/legacy rosters may be absent from the directory; keep authorized players selectable.
    children.push(group('ungrouped', '未关联赛事分组', candidates.filter(row => !used.has(String(row.id))).map(row => leaf(row, 'ungrouped', [scopeName]))))
  }
  return [group('scope', scopeName, children)].filter(Boolean)
}

export function checkedRecipientIds(nodes) {
  return [...new Set(nodes.filter(node => node.playerId && !node.disabled && node.row?.eligible).map(node => node.playerId))]
}
