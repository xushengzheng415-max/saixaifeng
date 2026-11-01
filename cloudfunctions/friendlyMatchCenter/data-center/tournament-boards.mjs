// Shared PC/mobile presentation order. Inputs are already authorized official statistics.
const text = value => String(value ?? '').trim()
const known = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
export function teamBoard(rows, metric = 'goals', divisionId = '') {
  const selected = rows.filter(row => (!divisionId || text(row.divisionId) === divisionId) &&
    text(row.teamId) && ['played','goalsFor','goalsAgainst','goalDifference','points'].every(key => known(row[key])) && Number(row.played) > 0)
  const sorted = selected.slice().sort(metric === 'conceded'
    ? (a,b) => a.goalsAgainst-b.goalsAgainst || a.goalsAgainst/a.played-b.goalsAgainst/b.played || b.points-a.points || b.played-a.played
    : (a,b) => b.goalsFor-a.goalsFor || b.goalDifference-a.goalDifference || b.points-a.points || a.played-b.played)
  return sorted.map((row,index) => ({...row, rank:index+1, key:[row.divisionId,row.groupName,row.teamId].map(text).join(':'),
    averageForText:(Number(row.goalsFor)/Number(row.played)).toFixed(2).replace(/\.00$/, ''),
    averageAgainstText:(Number(row.goalsAgainst)/Number(row.played)).toFixed(2).replace(/\.00$/, '')}))
}
