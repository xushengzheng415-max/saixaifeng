var hidden = ['cancelled', 'canceled', 'withdrawn', 'rejected', 'replaced', 'invite_cancelled', 'removed', 'deleted']
function key(row) { return String(row.tournamentId || '') + ':' + String(row.divisionId || 'default') }
function rowsForTeam(rows, context, teamId) {
  var allowed = null
  if (context.participatingEntriesVersion === 'team-participation/1' && context.participatingEntriesState === 'ready') {
    allowed = (context.participatingEntries || []).filter(function(row) { return String(row.teamId) === String(teamId) }).map(function(row) { return key({ tournamentId:row.tournamentId || row.id, divisionId:row.divisionId }) })
  }
  var seen = {}
  var priority = {approved:90,confirmed:90,active:90,locked:90,accepted:80,claimed:80,pending:60}
  return (rows || []).slice().sort(function(a,b) { return (priority[String(b.status || '').toLowerCase()] || 0) - (priority[String(a.status || '').toLowerCase()] || 0) }).filter(function(row) {
    var id = key(row)
    if (!row.tournamentId || hidden.indexOf(String(row.status || '').toLowerCase()) >= 0 || (allowed && allowed.indexOf(id) < 0) || seen[id]) return false
    seen[id] = true
    return true
  })
}
function tournamentCount(rows) { return Object.keys((rows || []).reduce(function(map,row) { map[row.tournamentId] = true; return map },{})).length }
function matchState(row) {
  var raw=String(row.status || '').toLowerCase()
  if (['cancelled','canceled','removed','deleted','void'].indexOf(raw)>=0) return ''
  if (['finished','completed','archived','ended'].indexOf(raw)>=0 || row.statusText==='已结束' || row.statusText==='已归档') return 'completed'
  if (['ongoing','live','in_progress'].indexOf(raw)>=0 || row.statusText==='进行中') return 'ongoing'
  return 'not_started'
}
function matchCounts(rows) {
  var counts={not_started:0,ongoing:0,completed:0},seen={}
  ;(rows || []).forEach(function(row) { (row.matches || []).forEach(function(match) { var state=matchState(match);if(state && !seen[match.id]){seen[match.id]=true;counts[state]++} }) })
  return counts
}
function filterMatches(rows,mode) {
  return (rows || []).map(function(row) {
    var matches=(row.matches || []).filter(function(match) {return matchState(match)===mode}).map(function(match) {return Object.assign({},match,{isFinished:matchState(match)==='completed',scoreText:match.scoreText || '比分待补录'})})
    return Object.assign({},row,{matches:matches,matchCount:matches.length,hasMatches:matches.length>0,showScheduleEmpty:mode==='not_started' && !(row.matches || []).length})
  }).filter(function(row) {return row.hasMatches || row.showScheduleEmpty})
}
module.exports = { rowsForTeam:rowsForTeam, tournamentCount:tournamentCount, matchState:matchState, matchCounts:matchCounts, filterMatches:filterMatches }
