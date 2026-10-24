// Penalty shootout kicks decide the winner; they never count as in-play goals.
export function evaluatePenaltyShootout(input, firstSide = 'home') {
  if (!Array.isArray(input) || input.length > 20) return { home: 0, away: 0, rounds: [], complete: false, winnerSide: '', canAddRound: false, reason: '点球轮次最多20轮' }
  const rounds = input.map((row, index) => ({ round: index + 1, home: row?.home ?? '', away: row?.away ?? '' }))
  while (rounds.length && !rounds.at(-1).home && !rounds.at(-1).away) rounds.pop()
  // Display every entered kick, even when the sequence still needs correction.
  const home = rounds.filter(row => row.home === 'scored').length
  const away = rounds.filter(row => row.away === 'scored').length
  const result = (complete, reason = '', winnerSide = '', canAddRound = false) => ({ home, away, rounds, complete, reason, winnerSide, canAddRound })
  for (const row of rounds) {
    if (input[row.round - 1]?.round != null && Number(input[row.round - 1].round) !== row.round) return result(false, '点球轮次顺序不正确')
    if (![row.home, row.away].every(value => ['', 'scored', 'missed'].includes(value))) return result(false, '点球结果只能标记为进或未进')
  }
  if (!rounds.length) return result(false, '请记录点球轮次')
  if (!['home', 'away'].includes(firstSide)) return result(false, '请选择先罚球队')
  const order = firstSide === 'home' ? ['home', 'away'] : ['away', 'home']
  const score = { home: 0, away: 0 }, kicks = { home: 0, away: 0 }
  let winnerSide = ''
  for (const row of rounds) {
    for (const side of order) {
      const value = row[side]
      if (winnerSide) {
        if (value) return result(false, '已分出胜负，请核对先罚球队及后续轮次')
        continue
      }
      if (!value) return result(false, `第${row.round}轮${side === 'home' ? '主队' : '客队'}结果未填写`)
      kicks[side]++
      if (value === 'scored') score[side]++
      if (kicks.home <= 5 && kicks.away <= 5) {
        if (score.home > score.away + 5 - kicks.away) winnerSide = 'home'
        else if (score.away > score.home + 5 - kicks.home) winnerSide = 'away'
      }
      if (kicks.home >= 5 && kicks.home === kicks.away && score.home !== score.away) winnerSide = score.home > score.away ? 'home' : 'away'
    }
  }
  if (winnerSide) return result(true, '', winnerSide)
  const canAddRound = rounds.length >= 5 && rounds.length < 20 && rounds.every(row => row.home && row.away) && score.home === score.away
  return result(false, canAddRound ? '双方打平，请增加一轮点球' : '请继续记录点球轮次', '', canAddRound)
}
