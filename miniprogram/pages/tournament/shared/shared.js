var sharedUi=require('../../../utils/sharedEventUi')
var matchUi=require('../../../utils/sharedMatchUi')
var KNOCKOUT_PHASES=['knockout','cup','placement','final','semifinal']
Page({
  data:{loading:true,errorText:'',name:'',dateText:'',location:'',statusText:'',modules:[],matchCount:'—',completed:'—',remaining:'—',days:[],hasMatches:false,rankAllowed:false,rankError:'',rankModeStandings:true,rankModeScorers:false,rankModeDiscipline:false,rankModeTabs:[],rankDivisions:[],rankGroups:[],hasGroupTabs:false,standingsRows:[],bracketNodes:[],bracketTabs:[],showBracketTabs:false,scorerRows:[],disciplinePlayerRows:[],disciplineTeamRows:[],showKnockoutList:false,showStandingsTable:false,showStandingsEmpty:false,showScorersTable:false,showScorersEmpty:false,showDisciplinePlayers:false,showDisciplineTeams:false,showDisciplineEmpty:false,showStandingsMore:false,standingsMoreText:'',showScorersMore:false,scorersMoreText:'',showDisciplinePlayersMore:false,disciplinePlayersMoreText:'',showDisciplineTeamsMore:false,disciplineTeamsMoreText:'',rankSheet:false,rankSheetTitle:'',sheetShowStandings:false,sheetShowScorers:false,sheetShowPlayers:false,sheetShowTeams:false,sheetRows:[]},
  onLoad:function(options){this.tournamentId=options.id || '';wx.setNavigationBarTitle({title:'赛事详情'})},
  onShow:function(){this.loadSharedEvent()},
  onPullDownRefresh:function(){this.loadSharedEvent().finally(function(){wx.stopPullDownRefresh()})},
  loadSharedEvent:function(){
    var that=this;var revision=(this.loadRevision || 0)+1;this.loadRevision=revision
    if(!this.renderedOnce){this.setData({loading:true,errorText:''})}else{wx.showNavigationBarLoading()}
    return this.fetchOverview('').then(function(reply){
      if(revision!==that.loadRevision)return
      var result=reply.result || {};if(!result.success)throw new Error(result.message || '赛事读取失败，请重试')
      wx.hideNavigationBarLoading();that.renderedOnce=true
      that.renderOverview(result)
    }).catch(function(error){
      if(revision!==that.loadRevision)return
      wx.hideNavigationBarLoading()
      if(!that.renderedOnce)return that.setData({loading:false,errorText:sharedUi.message(error),days:[],standingsRows:[],modules:[]})
      wx.showToast({title:sharedUi.message(error),icon:'none'})
    })
  },
  fetchOverview:function(divisionId){return wx.cloud.callFunction({name:'getMiniWorkspace',data:{action:'sharedTournamentOverview',tournamentId:this.tournamentId,divisionId:divisionId || ''}})},
  renderOverview:function(result){
    var that=this
    var item=result.tournament || {},summary=result.summary || {},days=matchUi.days(result.schedule,this.data.days)
    that.setData({loading:false,name:item.name,dateText:item.dateText,location:item.location,statusText:item.statusText,modules:sharedUi.modules(item.permissions).map(function(row){return Object.assign({},row,{icon:'/images/icons/'+({registration:'players',teams:'team',matches:'event',results:'shield',referees:'shield'}[row.id])+'.svg'})}),matchCount:summary.matchCount==null?'—':summary.matchCount,completed:summary.completed==null?'—':summary.completed,remaining:summary.remaining==null?'—':summary.remaining,days:days,hasMatches:days.length>0,rankAllowed:result.standingsAllowed,rankError:result.standingsError || ''})
    that.buildRank(result)
    that.applyRank()
  },
  buildRank:function(result){
    var groupsByDivision={},knockoutByDivision={},scorersByDivision={},seen={}
    ;(result.standings || []).forEach(function(group){
      var divId=group.divisionId || ''
      if(!groupsByDivision[divId])groupsByDivision[divId]=[]
      groupsByDivision[divId].push({id:group.id || divId+':'+(group.groupName || ''),name:group.groupName || group.name,teams:(group.teams || []).map(function(team){return {id:team.id,name:team.name,rank:team.rank,played:team.played,points:team.points}})})
      seen[divId]=1
    })
    ;(result.schedule || []).forEach(function(row){
      if(KNOCKOUT_PHASES.indexOf(row.phase)<0 || row.matchState==='cancelled')return
      var divId=row.divisionId || ''
      if(!knockoutByDivision[divId])knockoutByDivision[divId]=[]
      knockoutByDivision[divId].push({id:row.id,phase:row.phase || '',round:row.round || '',no:row.matchNumber || 0,meta:[row.matchNumber?'第'+row.matchNumber+'场':'',row.date,row.time].filter(Boolean).join(' · '),home:row.homeName,homeLogo:row.homeLogo || '',away:row.awayName,awayLogo:row.awayLogo || '',score:row.score,status:row.status})
      seen[divId]=1
    })
    ;(result.scorers || []).forEach(function(row){
      var divId=row.divisionId || ''
      if(!scorersByDivision[divId])scorersByDivision[divId]=[]
      scorersByDivision[divId].push(row)
      seen[divId]=1
    })
    var divisions=(result.divisions || []).filter(function(row){return row.id && seen[row.id]}).map(function(row){return {id:row.id,name:row.name}})
    Object.keys(seen).forEach(function(divId){if(divId && !divisions.some(function(row){return row.id===divId}))divisions.push({id:divId,name:divId})})
    this.rankData={divisions:divisions,groupsByDivision:groupsByDivision,knockoutByDivision:knockoutByDivision,scorersByDivision:scorersByDivision,scorers:(result.scorers || []).slice(),discipline:{players:(result.discipline && result.discipline.players) || [],teams:(result.discipline && result.discipline.teams) || []}}
    this.rankMode='standings';this.rankDivisionId='';this.rankGroupId=''
  },
  // 竖屏对阵图：按轮次文案分层，决赛在上、排位垫底；层间画汇聚连接线（1→2 汇聚、1→1 直连）
  buildBracket:function(rows){
    var ORDER=[['三四名',1],['四分之一',3],['八分之一',4],['1/4',3],['1/8',4],['半决赛',2],['四强',2],['十六强',5],['16强',5],['八强',3],['季军',1],['排位',99],['决赛',0]]
    var groups={},orderOf={},firstNo={}
    rows.forEach(function(row){
      var label=String(row.round || '').trim(),name=label,order=90
      if(row.phase==='placement'){if(!name)name='排位赛';order=99}
      else if(!label)name='淘汰赛'
      if(order===90){for(var i=0;i<ORDER.length;i++){if(label.indexOf(ORDER[i][0])>=0){order=ORDER[i][1];break}}}
      if(!groups[name]){groups[name]=[];orderOf[name]=order;firstNo[name]=row.no || 0}
      firstNo[name]=Math.min(firstNo[name],row.no || 0)
      groups[name].push(row)
    })
    var tiers=[]
    Object.keys(groups).forEach(function(name){
      var order=orderOf[name],tier=null
      for(var i=0;i<tiers.length;i++){if(tiers[i].order===order){tier=tiers[i];break}}
      if(!tier){tier={order:order,names:[],cards:[]};tiers.push(tier)}
      tier.names.push(name)
      groups[name].sort(function(a,b){return (a.no||0)-(b.no||0)}).forEach(function(row){tier.cards.push(row)})
    })
    tiers.sort(function(a,b){return a.order-b.order || (a.names[0]<b.names[0]?-1:1)})
    var card=function(match){return {id:match.id,meta:match.meta,home:match.home,homeLogo:match.homeLogo,away:match.away,awayLogo:match.awayLogo,score:match.score,status:match.status}}
    var nodes=[]
    tiers.forEach(function(tier,index){
      if(index>0){
        var prev=tiers[index-1],mode=''
        if(prev.cards.length===1 && tier.cards.length===2)mode='merge'
        else if(prev.cards.length===tier.cards.length && tier.cards.length<=2)mode='straight'
        if(mode)nodes.push({id:'link'+index,isRound:false,merge:mode==='merge',unitClass:mode==='merge'?'unit-merge':'unit-straight',units:['u0'].concat(mode==='straight' && prev.cards.length>1?['u1']:[])})
      }
      nodes.push({id:'tier'+index,isRound:true,name:tier.names.join(' / '),rows:tier.cards.map(card)})
    })
    return nodes
  },
  applyRank:function(){
    var that=this,data=this.rankData || {},mode=this.rankMode || 'standings'
    var divisions=data.divisions || []
    var layer2,validIds
    if(mode==='standings'){layer2=divisions.slice();validIds=divisions.map(function(row){return row.id})}
    else if(mode==='scorers'){layer2=[{id:'',name:'总榜'}].concat(divisions);validIds=layer2.map(function(row){return row.id})}
    else{layer2=[{id:'player',name:'球员'},{id:'team',name:'球队'}];validIds=['player','team']}
    if(validIds.indexOf(this.rankDivisionId)<0)this.rankDivisionId=validIds.length?validIds[0]:''
    var divId=this.rankDivisionId
    var groups=(data.groupsByDivision[divId] || []).slice(),knockout=(data.knockoutByDivision[divId] || []).slice()
    var discipline=data.discipline || {players:[],teams:[]}
    var groupTabs=[],hasGroupTabs=false
    if(mode==='standings'){
      var validGroup=groups.some(function(row){return row.id===that.rankGroupId}) || (knockout.length>0 && this.rankGroupId==='__knockout__')
      if(!validGroup)this.rankGroupId=groups.length?groups[0].id:(knockout.length?'__knockout__':'')
      if(knockout.length)groups.push({id:'__knockout__',name:'淘汰赛'})
      groupTabs=groups.map(function(row){return {id:row.id,name:row.name,itemClass:row.id===that.rankGroupId?'active':''}})
      hasGroupTabs=groups.length>1
    }
    var onKnockout=mode==='standings' && this.rankGroupId==='__knockout__'
    // 对阵图只画晋级链：knockout 为主线（1-4名），placement 排位单独一组（5-8名）；两类并存时显示子标签
    var mainRows=onKnockout?knockout.filter(function(row){return row.phase!=='placement'}):[]
    var placeRows=onKnockout?knockout.filter(function(row){return row.phase==='placement'}):[]
    var showBracketTabs=mainRows.length>0 && placeRows.length>0
    if(!mainRows.length)this.bracketTab='place'
    else if(!placeRows.length)this.bracketTab='main'
    else if(this.bracketTab!=='main' && this.bracketTab!=='place')this.bracketTab='main'
    var bracketTab=showBracketTabs?(this.bracketTab==='place'?'place':'main'):(mainRows.length?'main':'place')
    var bracketRows=bracketTab==='place'?placeRows:mainRows
    var selected=groups.filter(function(row){return row.id===that.rankGroupId})[0] || {}
    // 榜单默认只展示前 10 行，完整名单在「查看全部」弹层中滚动查看，避免长榜单顶走下方模块入口
    var clip=function(rows){if(rows.length<=10)return {rows:rows,more:false};return {rows:rows.slice(0,10),more:true}}
    var standingsTotal=onKnockout || !selected.teams?0:selected.teams.length
    var standingsClip=clip(standingsTotal?selected.teams.slice():[])
    var standingsMoreText='查看全部 '+standingsTotal+' 支球队'
    var scorers=mode==='scorers'?(divId?(data.scorersByDivision[divId] || []).slice():(data.scorers || []).slice()):[]
    var scorerRows=scorers.map(function(row,index){return {id:row.playerId || 'row'+index,name:row.name,teamName:row.teamName,goals:row.goals,rank:index+1}})
    var scorersClip=clip(scorerRows)
    var scorersMoreText='查看全部 '+scorerRows.length+' 名射手'
    var isPlayer=mode==='discipline' && this.rankDivisionId==='player'
    var disciplinePlayerRows=isPlayer?discipline.players.map(function(row,index){return {id:row.playerId || 'row'+index,name:row.name,teamName:row.teamName,redCards:row.redCards,yellowCards:row.yellowCards,rank:index+1}}):[]
    var disciplineTeamRows=!isPlayer && mode==='discipline'?discipline.teams.map(function(row,index){return {id:row.teamId || 'row'+index,name:row.name,redCards:row.redCards,yellowCards:row.yellowCards,rank:index+1}}):[]
    var playersClip=clip(disciplinePlayerRows),teamsClip=clip(disciplineTeamRows)
    var playersMoreText='查看全部 '+disciplinePlayerRows.length+' 名球员'
    var teamsMoreText='查看全部 '+disciplineTeamRows.length+' 支球队'
    this.setData({
      rankModeStandings:mode==='standings',rankModeScorers:mode==='scorers',rankModeDiscipline:mode==='discipline',
      rankModeTabs:[{id:'standings',name:'积分榜',itemClass:mode==='standings'?'active':''},{id:'scorers',name:'射手榜',itemClass:mode==='scorers'?'active':''},{id:'discipline',name:'红黄牌榜',itemClass:mode==='discipline'?'active':''}],
      rankDivisions:layer2.map(function(row){return {id:row.id,name:row.name,itemClass:row.id===divId?'active':''}}),
      rankGroups:groupTabs,hasGroupTabs:hasGroupTabs,
      bracketNodes:onKnockout && bracketRows.length?this.buildBracket(bracketRows):[],showKnockoutList:onKnockout && knockout.length>0,showBracketTabs:onKnockout && showBracketTabs,bracketTabs:[{id:'main',name:'1-4名',itemClass:bracketTab==='main'?'active':''},{id:'place',name:'5-8名',itemClass:bracketTab==='place'?'active':''}],
      standingsRows:standingsClip.rows,showStandingsTable:!onKnockout && standingsClip.rows.length>0,showStandingsEmpty:!onKnockout && standingsClip.rows.length===0,
      showStandingsMore:mode==='standings' && !onKnockout && standingsTotal>10,standingsMoreText:standingsMoreText,
      scorerRows:scorersClip.rows,showScorersTable:mode==='scorers' && scorersClip.rows.length>0,showScorersEmpty:mode==='scorers' && scorersClip.rows.length===0,
      showScorersMore:mode==='scorers' && scorerRows.length>10,scorersMoreText:scorersMoreText,
      disciplinePlayerRows:playersClip.rows,disciplineTeamRows:teamsClip.rows,
      showDisciplinePlayers:isPlayer,showDisciplineTeams:!isPlayer && mode==='discipline',
      showDisciplinePlayersMore:isPlayer && disciplinePlayerRows.length>10,disciplinePlayersMoreText:playersMoreText,
      showDisciplineTeamsMore:!isPlayer && mode==='discipline' && disciplineTeamRows.length>10,disciplineTeamsMoreText:teamsMoreText,
      showDisciplineEmpty:mode==='discipline' && disciplinePlayerRows.length===0 && disciplineTeamRows.length===0
    })
  },
  onRankMode:function(event){var id=event.currentTarget.dataset.id;if(!id || id===this.rankMode)return;this.rankMode=id;this.rankDivisionId='';this.rankGroupId='';this.bracketTab='main';this.applyRank()},
  onRankDivision:function(event){var id=event.currentTarget.dataset.id;if(id===undefined || id===this.rankDivisionId)return;this.rankDivisionId=id;this.rankGroupId='';this.bracketTab='main';this.applyRank()},
  onRankGroup:function(event){var id=event.currentTarget.dataset.id;if(!id || id===this.rankGroupId)return;this.rankGroupId=id;this.bracketTab='main';this.applyRank()},
  onBracketTab:function(event){var id=event.currentTarget.dataset.id;if(!id || id===this.bracketTab)return;this.bracketTab=id;this.applyRank()},
  onRankMore:function(){
    var that=this,data=this.rankData || {},mode=this.rankMode || 'standings',divId=this.rankDivisionId
    var discipline=data.discipline || {players:[],teams:[]}
    var divName=''
    ;(data.divisions || []).some(function(row){if(row.id===divId){divName=row.name;return true}return false})
    var base={standings:'积分榜',scorers:'射手榜',discipline:'红黄牌榜'}[mode] || ''
    var sheetMode=mode,rows=[],title=base
    if(mode==='standings'){
      var selected=(data.groupsByDivision[divId] || []).filter(function(row){return row.id===that.rankGroupId})[0] || {}
      rows=(selected.teams || []).slice()
      title=base+(selected.name?' · '+selected.name:'')
    }else if(mode==='scorers'){
      rows=divId?(data.scorersByDivision[divId] || []).slice():(data.scorers || []).slice()
      title=base+(divId?' · '+divName:' · 总榜')
    }else{
      var isPlayer=divId==='player'
      sheetMode=isPlayer?'players':'teams'
      title=base+(isPlayer?' · 球员':' · 球队')
      rows=isPlayer?discipline.players.map(function(row,index){return {id:row.playerId || 'row'+index,name:row.name,teamName:row.teamName,redCards:row.redCards,yellowCards:row.yellowCards,rank:index+1}}):discipline.teams.map(function(row,index){return {id:row.teamId || 'row'+index,name:row.name,redCards:row.redCards,yellowCards:row.yellowCards,rank:index+1}})
    }
    this.setData({rankSheet:true,rankSheetTitle:title,rankSheetMode:sheetMode,sheetShowStandings:sheetMode==='standings',sheetShowScorers:sheetMode==='scorers',sheetShowPlayers:sheetMode==='players',sheetShowTeams:sheetMode==='teams',sheetRows:rows})
  },
  onRankSheetClose:function(){this.setData({rankSheet:false,sheetShowStandings:false,sheetShowScorers:false,sheetShowPlayers:false,sheetShowTeams:false,sheetRows:[]})},
  onSheetStop:function(){},
  onMatch:function(event){var id=event.currentTarget.dataset.id,mode=event.currentTarget.dataset.mode;if(!event.currentTarget.dataset.open)return wx.showToast({title:'当前授权只可查看赛程',icon:'none'});wx.navigateTo({url:'/pages/tournament/shared/manage?id='+encodeURIComponent(this.tournamentId)+'&mode='+mode+'&matchId='+encodeURIComponent(id)})},
  onDayChange:function(event){
    var index=Number(event.currentTarget.dataset.index),current=Number(event.detail.current),days=this.data.days
    if(!Array.isArray(days))return
    var day=days[index]
    if(!day || current<0 || current>=day.matches.length)return
    var next=days.slice();next[index]=Object.assign({},day,{current:current,position:current+1})
    this.setData({days:next})
  },
  onModule:function(event){wx.navigateTo({url:'/pages/tournament/shared/manage?id='+encodeURIComponent(this.tournamentId)+'&mode='+event.currentTarget.dataset.id})},
  onBack:function(){wx.switchTab({url:'/pages/event/index'})}
})
