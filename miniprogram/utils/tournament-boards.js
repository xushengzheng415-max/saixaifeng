// Formatting only: ordering, scope membership and totals come from the shared service.
var metricLabels = {standings:'积分榜',goals:'进球榜',attack:'进球最多',defense:'失球最少',red:'红牌榜',yellow:'黄牌榜'}
function display(value) { return value === null || value === undefined || value === '' ? '—' : String(value) }
function scopeOf(boards,id) { return (boards.scopes || []).filter(function(row){return row.divisionId === id})[0] }
function rowsOf(scope,metric) {
  return ((scope || {})[metric] || []).map(function(row,index){
    var team=metric==='standings' || metric==='attack' || metric==='defense'
    return Object.assign({},row,{key:row.key || metric+':'+(row.id || row.teamId || row.playerId)+':'+index,
      displayRank:display(row.rank),displayName:team?row.teamName:row.playerName,
      secondaryText:team?[row.divisionName,row.groupName].filter(Boolean).join(' · '):row.teamName,
      pointsText:display(row.points),countText:display(metric==='attack'?row.goalsFor:metric==='defense'?row.goalsAgainst:row.value),
      playedText:display(row.played),recordText:[row.win,row.draw,row.loss].map(display).join('/'),
      averageText:metric==='defense'?row.averageAgainstText:row.averageForText,
      showPlayed:metric==='standings',showRecord:metric==='standings',showPoints:metric==='standings',showCount:metric!=='standings',showAverage:metric==='attack' || metric==='defense'})
  })
}
module.exports={metricLabels:metricLabels,scopeOf:scopeOf,rowsOf:rowsOf,display:display}
