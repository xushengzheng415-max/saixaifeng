// Display compatibility for older responses; write permission stays server-side.
var STATES={scheduled:'scheduled',pending:'scheduled',upcoming:'scheduled',checked_in:'scheduled',not_started:'scheduled',ongoing:'live',live:'live',in_progress:'live',playing:'live',completed:'finished',finished:'finished',ended:'finished',archived:'finished',forfeited:'finished','待开始':'scheduled','未开始':'scheduled','进行中':'live','已结束':'finished','已取消':'cancelled'}
var OBSOLETE=['cancelled','canceled','deleted','removed','replaced','superseded','void','已取消']
function present(item){
  var raw=String(item.rawStatus || item.status || item.statusText || '').toLowerCase(),state=item.matchState || STATES[raw] || 'unknown'
  if(OBSOLETE.indexOf(raw)>=0 || OBSOLETE.indexOf(item.scheduleStatus)>=0)state='cancelled'
  var result=item.resultState
  if(result==null)result=item.canReview?'under_review':({'已退回':'returned','已归档':'archived','已核查':'archived'})[item.reviewStatus] || ''
  var score=['live','finished'].indexOf(state)>=0 && /^\d+\s*:\s*\d+$/.test(String(item.score || ''))?item.score:'— : —'
  if(result==null || !result){if(state==='finished' && score!=='— : —' && item.homeTeamId && item.awayTeamId)result='recorded';else result=''}
  return Object.assign({},item,{matchState:state,resultState:result,score:score,status:({scheduled:'未开始',live:'进行中',finished:'已结束',cancelled:'已取消',unknown:'状态待核对'})[state],statusClass:'match-state-'+state,reviewStatus:({under_review:'待复核',returned:'已退回',archived:'已归档',recorded:'已录入'})[result] || '未提交复核',hasHomeLogo:!!item.homeLogo,hasAwayLogo:!!item.awayLogo,matchMeta:[item.time || '时间待定',item.divisionName,item.matchNumber?'第'+item.matchNumber+'场':''].filter(Boolean).join(' · '),actionText:item.actionText || item.matchAction || '查看比赛'})
}
function days(items,previous){
  var prev=Array.isArray(previous)?previous:[]
  var groups=[]
  ;(items || []).map(present).filter(function(item){return item.matchState!=='cancelled'}).forEach(function(item){
    var date=item.date || '日期待定',day=groups.find(function(row){return row.id===date})
    if(!day){day={id:date,date:date,matches:[]};groups.push(day)}
    day.matches.push(item)
  })
  return groups.map(function(day){
    var old=prev.find(function(row){return row.id===day.id}),selected=old && old.matches[old.current || 0],index=selected?day.matches.findIndex(function(row){return row.id===selected.id}):0
    day.current=index<0?0:index;day.position=day.current+1;day.count=day.matches.length;day.hasMultiple=day.count>1
    return day
  })
}
module.exports={present:present,days:days}
