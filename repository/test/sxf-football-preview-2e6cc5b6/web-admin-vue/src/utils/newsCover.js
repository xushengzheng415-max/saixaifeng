export function createMatchNewsCover(match, tournamentName) {
  if (!match || match.resultStatus !== 'approved' || match.homeScore == null || match.awayScore == null) return ''
  const canvas = document.createElement('canvas')
  canvas.width = 960
  canvas.height = 540
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.fillStyle = '#053825'
  ctx.fillRect(0, 0, 960, 540)
  ctx.fillStyle = '#075039'
  ctx.fillRect(0, 0, 960, 228)
  ctx.strokeStyle = 'rgba(219,190,119,.45)'
  ctx.lineWidth = 2
  ctx.strokeRect(28, 28, 904, 484)
  ctx.fillStyle = '#d8bd7b'
  ctx.font = '600 23px sans-serif'
  ctx.fillText('赛小蜂足球  /  比赛战报', 65, 79)
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 32px sans-serif'
  const eventName = String(tournamentName || '足球赛事')
  let size = 32
  while (ctx.measureText(eventName).width > 830 && size > 20) { size -= 1; ctx.font = `700 ${size}px sans-serif` }
  ctx.fillText(eventName, 65, 137)
  ctx.fillStyle = '#d4e5d8'
  ctx.font = '23px sans-serif'
  ctx.fillText([match.matchDate, match.divisionName].filter(Boolean).join('  ·  '), 65, 183)
  const drawTeam = (name, center) => {
    const value = String(name || '待定球队')
    let fontSize = 29
    ctx.font = `700 ${fontSize}px sans-serif`
    while (ctx.measureText(value).width > 270 && fontSize > 18) { fontSize -= 1; ctx.font = `700 ${fontSize}px sans-serif` }
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.fillText(value, center, 371)
  }
  drawTeam(match.homeTeamName, 208)
  drawTeam(match.awayTeamName, 752)
  ctx.fillStyle = '#ffffff'
  ctx.font = '800 88px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(`${match.homeScore} : ${match.awayScore}`, 480, 365)
  ctx.font = '21px sans-serif'
  ctx.fillStyle = '#d8bd7b'
  ctx.fillText('全场比分', 480, 431)
  ctx.font = '20px sans-serif'
  ctx.fillStyle = '#d4e5d8'
  ctx.fillText([match.matchTime, match.venue].filter(Boolean).join('  ·  '), 480, 482)
  return canvas.toDataURL('image/png')
}

export function createDailyNewsCover(date, tournamentName, count) {
  if (!date || !count) return ''
  const canvas = document.createElement('canvas')
  canvas.width = 960
  canvas.height = 540
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.fillStyle = '#053825'
  ctx.fillRect(0, 0, 960, 540)
  ctx.fillStyle = '#075039'
  ctx.fillRect(0, 0, 960, 228)
  ctx.strokeStyle = 'rgba(219,190,119,.45)'
  ctx.lineWidth = 2
  ctx.strokeRect(28, 28, 904, 484)
  ctx.fillStyle = '#d8bd7b'
  ctx.font = '600 23px sans-serif'
  ctx.fillText('赛小蜂足球  /  每日新闻', 65, 79)
  ctx.fillStyle = '#ffffff'
  let size = 32
  const eventName = String(tournamentName || '足球赛事')
  ctx.font = `700 ${size}px sans-serif`
  while (ctx.measureText(eventName).width > 830 && size > 20) { size -= 1; ctx.font = `700 ${size}px sans-serif` }
  ctx.fillText(eventName, 65, 137)
  ctx.textAlign = 'center'
  ctx.font = '800 58px sans-serif'
  ctx.fillText('比赛日战报', 480, 348)
  ctx.font = '27px sans-serif'
  ctx.fillStyle = '#d8bd7b'
  ctx.fillText(`${date}  ·  ${count} 场正式赛果`, 480, 421)
  return canvas.toDataURL('image/png')
}

export function createStandingsNewsSnapshot(groups, tournamentName, date) {
  const tables = (Array.isArray(groups) ? groups : []).filter(group => group.officialMatchCount > 0 && Array.isArray(group.officialTeams) && group.officialTeams.length)
  if (!tables.length) return ''
  const height = 130 + tables.reduce((sum, group) => sum + 83 + group.officialTeams.length * 42, 0) + 35
  const canvas = document.createElement('canvas')
  canvas.width = 960
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 960, height)
  ctx.fillStyle = '#06412b'
  ctx.fillRect(0, 0, 960, 118)
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 27px sans-serif'
  ctx.fillText(String(tournamentName || '足球赛事').slice(0, 28), 40, 48)
  ctx.font = '20px sans-serif'
  ctx.fillText(`正式积分榜 · 截至 ${date}`, 40, 87)
  let y = 138
  for (const group of tables) {
    ctx.fillStyle = '#0b5839'
    ctx.font = '700 21px sans-serif'
    ctx.fillText([group.divisionName, group.groupName].filter(Boolean).join(' · '), 40, y)
    y += 27
    ctx.fillStyle = '#eaf3ed'
    ctx.fillRect(40, y, 880, 34)
    ctx.fillStyle = '#506a59'
    ctx.font = '16px sans-serif'
    for (const [label, x] of [['排名', 52], ['球队', 124], ['赛', 510], ['胜', 575], ['平', 640], ['负', 705], ['净胜球', 770], ['积分', 874]]) ctx.fillText(label, x, y + 23)
    y += 34
    for (const team of group.officialTeams) {
      ctx.strokeStyle = '#e4eee7'
      ctx.beginPath(); ctx.moveTo(40, y + 41); ctx.lineTo(920, y + 41); ctx.stroke()
      ctx.fillStyle = '#243d2d'
      ctx.font = '17px sans-serif'
      ctx.fillText(String(team.rank), 52, y + 27)
      let fontSize = 17
      const name = String(team.teamName || '')
      ctx.font = `${fontSize}px sans-serif`
      while (ctx.measureText(name).width > 350 && fontSize > 13) { fontSize -= 1; ctx.font = `${fontSize}px sans-serif` }
      ctx.fillText(name, 124, y + 27)
      ctx.font = '17px sans-serif'
      for (const [value, x] of [[team.played, 510], [team.win, 575], [team.draw, 640], [team.loss, 705], [team.goalDifference, 790], [team.points, 885]]) ctx.fillText(String(value ?? '—'), x, y + 27)
      y += 42
    }
    y += 22
  }
  return canvas.toDataURL('image/png')
}
