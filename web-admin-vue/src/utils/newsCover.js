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
