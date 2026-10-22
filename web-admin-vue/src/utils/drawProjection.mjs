import standings from '../../../cloudfunctions/dataCenter/shared/standings.cjs'

// Only the public scoring-rule summary crosses the local projection channel.
// Draw order is not a ranking and contains no competitive statistics.
export function leagueProjectionRules(division) {
  const { win, draw, loss, drawResolution, penaltyWin, penaltyLoss } = standings.pointsRule(division)
  return { win, draw, loss, drawResolution, penaltyWin, penaltyLoss }
}

export function leagueProjectionRuleLabel(rule) {
  if (!rule) return '积分按本组联赛规则执行'
  const label = value => typeof value === 'number' && Number.isFinite(value) ? value : '—'
  return rule.drawResolution === 'penalties'
    ? `胜 ${label(rule.win)} 分 · 平局点球胜 ${label(rule.penaltyWin)} 分 / 负 ${label(rule.penaltyLoss)} 分 · 负 ${label(rule.loss)} 分`
    : `胜 ${label(rule.win)} 分 · 平 ${label(rule.draw)} 分 · 负 ${label(rule.loss)} 分`
}

export function leagueProjectionRows(state) {
  const byId = new Map((state.teams || []).map(team => [String(team.id || team.teamId), team]))
  return (state.assignments || []).map(item => ({
    id: String(item.teamId),
    name: byId.get(String(item.teamId))?.name || item.teamName || '待定',
    logo: byId.get(String(item.teamId))?.logo || '',
    position: Number.isInteger(Number(item.position)) && Number(item.position) > 0 ? Number(item.position) : '—'
  })).sort((a, b) => (Number(a.position) || Infinity) - (Number(b.position) || Infinity))
}
