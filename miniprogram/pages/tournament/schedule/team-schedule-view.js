function score(value) {
  return (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isInteger(Number(value)) && Number(value) >= 0 ? String(Number(value)) : '—'
}
function present(result, teamId) {
  if (!result || !result.success || !result.participating || String((result.team || {}).id || '') !== String(teamId)) throw new Error('当前球队没有该组别的参赛记录')
  var matches = (result.matches || []).filter(function(row) {
    return row.id && ['cancelled','canceled','removed','deleted'].indexOf(String(row.status)) < 0 && [String((row.home || {}).id || ''),String((row.away || {}).id || '')].indexOf(String(teamId)) >= 0
  }).map(function(row) {
    var home=row.home || {},away=row.away || {},finished=row.status==='finished',live=row.status==='ongoing'
    var homeScore=score(row.homeScore),awayScore=score(row.awayScore),hasScore=homeScore!=='—' && awayScore!=='—'
    return {_id:row.id,matchTimeText:[row.dateText,row.timeText].filter(Boolean).join(' ') || '时间待定',
      homeTeamName:home.name || '主队待定',awayTeamName:away.name || '客队待定',homeTeamLogo:home.logo || '',awayTeamLogo:away.logo || '',
      homeFirstChar:String(home.name || '主').slice(0,1),awayFirstChar:String(away.name || '客').slice(0,1),
      homeDisplayScore:finished || live ? homeScore : '—',awayDisplayScore:finished || live ? awayScore : '—',
      homeWinnerClass:finished && hasScore && Number(homeScore)>Number(awayScore) ? 'mc-winner' : '',awayWinnerClass:finished && hasScore && Number(awayScore)>Number(homeScore) ? 'mc-winner' : '',
      isFinished:finished,round:row.roundText || row.roundName || '本队赛程',venue:row.venue || '',statusText:row.statusText || '状态待确认',
      actionText:'查看比赛详情',actionClass:finished ? 'archived' : live ? 'live' : 'upcoming'}
  })
  var groups=[]
  matches.forEach(function(row) {var last=groups[groups.length-1];if(!last || last.round!==row.round){last={round:row.round,matches:[]};groups.push(last)}last.matches.push(row)})
  var standings=(result.standingsGroups || []).filter(function(group) {return (group.rows || []).some(function(row) {return String(row.teamId)===String(teamId)})}).map(function(group) {
    return {name:group.name,rows:(group.rows || []).map(function(row) {return Object.assign({},row,{rankText:row.rank==null?'—':String(row.rank),playedText:row.played==null?'—':String(row.played),pointsText:row.points==null?'—':String(row.points),recordText:row.win==null||row.draw==null||row.loss==null?'—':row.win+'/'+row.draw+'/'+row.loss,rowClass:String(row.teamId)===String(teamId)?'is-current':''})})}
  })
  return {tournamentName:(result.tournament || {}).name || '',typeText:(result.division || {}).name || '',formatText:'',scopeText:(result.team || {}).name || '',
    matches:matches,resultMatches:matches.filter(function(row){return row.isFinished}),groupedMatches:groups,hasNoMatches:matches.length===0,hasResults:matches.some(function(row){return row.isFinished}),
    scopeCountText:'本队 '+matches.length+' 场比赛',teamStandingsGroups:standings,showTeamStandings:standings.length>0 && result.standingsState!=='failed',teamStandingsFailed:result.standingsState==='failed'}
}
module.exports={present:present}
