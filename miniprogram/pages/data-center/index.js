var workspace = require('../../utils/workspace')
function metric(value) { return typeof value === 'number' && Number.isFinite(value) ? String(value) : '—' }
Page({
  data:{ subjects:[{id:'team',label:'球队历史'},{id:'player',label:'球员历史'},{id:'tournament',label:'主办赛事'}],subjectIndex:0,subjectLabel:'球队历史',objectIndex:0,options:[],objectName:'',catalogLoading:true,queryDisabled:true,loading:false,errorText:'',hasResult:false,players:[],teams:[],playerTotals:[],hasTeams:false,hasPlayers:false,hasPlayerTotal:false },
  onLoad:function () { this.loadCatalog() },
  onPullDownRefresh:function () { var task = this.data.hasResult ? this.query() : this.loadCatalog(); Promise.resolve(task).finally(function () { wx.stopPullDownRefresh() }) },
  api:function (input) { var context = workspace.readContext() || {}; return wx.cloud.callFunction({name:'getMiniWorkspace',data:Object.assign({action:'dataCenter',workspaceId:(context.currentWorkspace || {}).id || ''},input)}).then(function (reply) { var result = reply.result || {}; if (!result.success) throw new Error(result.message || result.error || '数据加载失败，请重试'); return result }) },
  loadCatalog:function () { var that = this; this.setData({catalogLoading:true,errorText:''}); return this.api({operation:'catalog'}).then(function (result) { that.catalog = result; that.applyOptions() }).catch(function (error) { that.setData({errorText:error.message}) }).finally(function () { that.setData({catalogLoading:false}) }) },
  applyOptions:function () { var current = this.data.subjects[this.data.subjectIndex]; var subject = current.id; var catalog = this.catalog || {}; var options = catalog[subject === 'team' ? 'teams' : subject === 'player' ? 'players' : 'tournaments'] || []; this.setData({options:options,subjectLabel:current.label,objectIndex:0,objectName:options[0] && options[0].name || '',queryDisabled:!options.length,hasResult:false}) },
  changeSubject:function (event) { this.setData({subjectIndex:Number(event.detail.value)}); this.applyOptions() },
  changeObject:function (event) { var index = Number(event.detail.value); this.setData({objectIndex:index,objectName:(this.data.options[index] || {}).name || '',hasResult:false}) },
  query:function () {
    var that = this, object = this.data.options[this.data.objectIndex]; if (!object) return Promise.resolve()
    var field = {team:'teamId',player:'playerId',tournament:'tournamentId'}[this.data.subjects[this.data.subjectIndex].id]; var scope = {mode:'official'}; scope[field] = object.id
    this.setData({loading:true,errorText:'',hasResult:false})
    return this.api({scope:scope}).then(function (result) {
      var catalog = that.catalog || {}, names = function (collection,id) { var row = (catalog[collection] || []).filter(function (item) { return item.id === id })[0]; return row && row.name || id }
      var players = result.players.map(function (row) { var item = Object.assign({},row,{key:[row.playerId,row.teamId,row.tournamentId,row.divisionId].join('|'),teamName:names('teams',row.teamId),tournamentName:names('tournaments',row.tournamentId)}); ['appearances','goals','assists','yellowCards','redCards'].forEach(function (field) { item[field+'Text'] = metric(row.metrics[field]) }); return item })
      var teams = result.teams.map(function (row) { var item = Object.assign({},row,{key:[row.teamId,row.tournamentId,row.divisionId].join('|'),tournamentName:names('tournaments',row.tournamentId)}); ['wins','draws','losses','goalsFor','goalsAgainst'].forEach(function (field) { item[field+'Text'] = metric(row[field]) }); return item })
      var fields = [{id:'appearances',label:'出场'},{id:'goals',label:'进球'},{id:'assists',label:'助攻'},{id:'yellowCards',label:'黄牌'},{id:'redCards',label:'红牌'}]
      that.setData({hasResult:true,players:players,teams:teams,hasPlayers:players.length>0,hasTeams:teams.length>0,hasPlayerTotal:!!result.playerTotal,playerTotals:result.playerTotal ? fields.map(function (field) { return Object.assign({},field,{value:metric(result.playerTotal.metrics[field.id])}) }) : [],coveredMatches:result.coverage.coveredMatches,expectedMatches:result.coverage.expectedMatches,partial:result.coverage.status!=='complete',dataVersion:result.dataVersion})
    }).catch(function (error) { that.setData({errorText:error.message}) }).finally(function () { that.setData({loading:false}) })
  },
  retry:function () { return this.catalog ? this.query() : this.loadCatalog() }
})
