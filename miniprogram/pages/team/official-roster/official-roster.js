var workspace = require('../../../utils/workspace')

function fixture() {
  return { tournament: { name: '2026 河南青少年足球冠军联赛 U12组', deadlineText: '7月15日', maxPlayers: 20 }, team: { name: '赛小蜂 U12 竞技队', logo: '/images/runtime/icons/brand-v1-tab-team.png' }, requirements: { identityVerificationRequired: true, portraitRequired: true }, snapshot: { status: 'returned', returnReason: '王梓轩年龄资格异常；赵一诺缺少赛事要求的监护人授权。', playerIds: ['p1', 'p2', 'p3', 'p4', 'p5'] }, canManage: true, playerLibraryCount: 23, players: [
    { id: 'p1', name: '王梓轩', birthDate: '2013-12-26 出生', profileStatus: 'exception', statusText: '年龄资格异常', avatarText: '王' },
    { id: 'p2', name: '赵一诺', birthDate: '2014-06-11 出生', profileStatus: 'pending', statusText: '缺少赛事要求的监护人授权', avatarText: '赵' },
    { id: 'p3', name: '张子墨', birthDate: '2014-03-18 出生', profileStatus: 'complete', statusText: '已通过', avatarText: '张' },
    { id: 'p4', name: '李浩然', birthDate: '2014-09-02 出生', profileStatus: 'complete', statusText: '已通过', avatarText: '李' },
    { id: 'p5', name: '陈宇', birthDate: '2014-05-21 出生', profileStatus: 'complete', statusText: '已通过', avatarText: '陈' }
  ] }
}

function decorate(rows, ids) {
  return rows.map(function (player) {
    var item = Object.assign({}, player)
    item.selected = ids.indexOf(item.id) >= 0
    item.canSelect = item.profileStatus === 'complete'
    item.avatarText = item.avatarText || String(item.name || '球').slice(0, 1)
    item.stateClass = item.profileStatus === 'complete' ? 'roster-state-ok' : 'roster-state-problem'
    item.checkClass = item.selected ? 'roster-check roster-check-selected' : 'roster-check'
    item.profileIcon = item.profileStatus === 'exception' ? '/images/runtime/icons/brand-v2-13.png' : item.profileStatus === 'pending' ? '/images/runtime/icons/brand-v2-09.png' : '/images/runtime/icons/brand-v2-09.png'
    item.actionText = item.profileStatus === 'exception' ? '移出名单 / 查看异常' : item.profileStatus === 'pending' ? '提醒家长补充' : '已通过'
    return item
  })
}

function makeTabs(mode, rows) {
  var problem = rows.filter(function (item) { return item.profileStatus !== 'complete' }).length
  var passed = rows.length - problem
  return [
    { id: 'all', label: '全部 ' + rows.length, className: mode === 'all' ? 'roster-tab roster-tab-active' : 'roster-tab' },
    { id: 'problem', label: '需处理 ' + problem, className: mode === 'problem' ? 'roster-tab roster-tab-active' : 'roster-tab' },
    { id: 'passed', label: '已通过 ' + passed, className: mode === 'passed' ? 'roster-tab roster-tab-active' : 'roster-tab' }
  ]
}

function makeOverview(rows, ids, libraryCount) {
  var pending = rows.filter(function (item) { return item.profileStatus === 'pending' }).length
  var exception = rows.filter(function (item) { return item.profileStatus === 'exception' }).length
  var eligible = rows.filter(function (item) { return item.profileStatus === 'complete' }).length
  return {
    libraryCount: libraryCount || rows.length,
    selectedCount: ids.length,
    eligibleCount: eligible,
    pendingCount: pending,
    exceptionCount: exception,
    footerText: '已选择 ' + ids.length + ' / ' + (ids.length + 2) + ' 人',
    submitSummary: '可提交 ' + eligible + ' 人，资料待补 ' + pending + ' 人，资格异常 ' + exception + ' 人'
  }
}

function requirementText(requirements) {
  var labels = []
  if (requirements && requirements.identityVerificationRequired) labels.push('人证核验')
  if (requirements && requirements.portraitRequired) labels.push('标准形象照')
  if (requirements && requirements.parentSupplementConfigured && requirements.parentSupplementRequired) labels.push('家长补充资料')
  if (!labels.length) labels.push('姓名与出生日期')
  return labels.join('、')
}

function valueText(value) { return value === null || value === undefined || value === '' ? '—' : String(value) }
function memberCard(player) {
  var born=String(player.birthDate || '').match(/^(\d{4})-(\d{2})-(\d{2})/),age='—'
  if(born){var now=new Date(),years=now.getFullYear()-Number(born[1]);if(now.getMonth()+1<Number(born[2])||(now.getMonth()+1===Number(born[2])&&now.getDate()<Number(born[3])))years--;if(years>=0&&years<120)age=years+'岁'}
  var stats=player.tournamentStats || {},labels=[['appearances','出场'],['minutesPlayed','分钟'],['goals','进球'],['assists','助攻'],['yellowCards','黄牌'],['redCards','红牌']]
  return Object.assign({},player,{numberText:valueText(player.jerseyNumber),jerseyText:valueText(player.jerseyName),positionText:valueText(player.position),ageText:age,photoUrl:player.photoUrl || '',hasPhoto:Boolean(player.photoUrl),metrics:labels.map(function(row){return {id:row[0],label:row[1],value:valueText(stats[row[0]])}})})
}

Page({
  data: { teamId: '', tournamentId: '', divisionId: '', loading: true, submitting: false, tournament: {}, team: {}, requirements: {}, requirementText: '姓名与出生日期', players: [], visible: [], selected: [], count: 0, max: 20, canManage: false, showReturned: false, returnReason: '', filter: 'all', tabs: [], isDevtools: false, pageTitle: '正式名单', rosterTip: '只有资料完整且符合赛事要求的球员，才能进入本届参赛名单。', submitText: '提交赛事名单', overview: {},editing:false,rosterMembers:[],hasRosterMembers:false,rosterStatusText:'尚未提交',rosterCountText:'0人',errorText:'',canEditRoster:false,editRosterText:'选择球员',hasSnapshot:false },
  onLoad: function (options) {
    var query = options || {}
    var isDevtools = workspace.isVisualQaEnabled(query)
    this.setData({ teamId: String(query.teamId || ''), tournamentId: String(query.tournamentId || ''), divisionId: String(query.divisionId || ''), isDevtools: isDevtools,editing:query.mode==='select' })
    if (isDevtools) { var local = fixture(); if (query.state !== 'returned') { local.snapshot.status = 'draft'; local.snapshot.returnReason = ''; local.snapshot.playerIds = ['p3', 'p4', 'p5'] } this.hydrate(local); return }
    return this.load()
  },
  onShow: function() { if(this._loaded && !this.data.isDevtools)this.load() },
  onUnload: function() {this._unloaded=true;this._requestId=(this._requestId || 0)+1},
  hydrate: function (source) {
    var snapshot = source.snapshot || {}
    var ids = (snapshot.playerIds || []).map(function(value){return String(value)}).filter(function(value,index,array){return value && array.indexOf(value)===index})
    var rows = decorate(source.players || [], ids)
    var returned = snapshot.status === 'returned'
    var requirements = source.requirements || {}
    var byId={};rows.forEach(function(player){byId[String(player.id)]=player})
    var members=ids.map(function(id){return memberCard(byId[id] || {id:id,name:'球员资料暂不可用',statusText:'资料待核对',profileStatus:'pending'})})
    var state=String(snapshot.status || ''),locked=['approved','confirmed','locked','submitted','pending','pending_review','under_review'].indexOf(state)>=0
    var statusText=({draft:'名单草稿',submitted:'待主办方审核',pending:'待主办方审核',pending_review:'待主办方审核',under_review:'待主办方审核',approved:'已审核',confirmed:'已确认',locked:'已锁定',returned:'已退回',rejected:'已退回'})[state] || '尚未提交'
    this.setData({rosterMembers:members,hasRosterMembers:members.length>0,rosterCountText:members.length+'人',rosterStatusText:statusText,hasSnapshot:Boolean(source.snapshot),canEditRoster:source.canManage===true&&!locked,editRosterText:members.length?'编辑名单':'选择球员',errorText:''})
    this.setData({ loading: false, tournament: source.tournament || {}, team: source.team || {}, requirements: requirements, requirementText: requirementText(requirements), players: rows, selected: ids, count: ids.length, max: (source.tournament || {}).maxPlayers || 20, canManage: source.canManage, showReturned: returned, returnReason: snapshot.returnReason || '', pageTitle: returned ? '名单审核退回' : '选择本届参赛球员', rosterTip: returned ? '请按要求修改后重新提交，重新提交不会改变已通过球员的状态。' : '只有资料完整且符合赛事要求的球员，才能进入本届参赛名单。', submitText: returned ? '修改完成后重新提交' : '提交赛事名单', overview: makeOverview(rows, ids, source.playerLibraryCount) })
    if(!this.data.editing)this.setData({pageTitle:'正式名单'})
    this.applyFilter()
  },
  load: function () {
    var self = this
    var context = workspace.readContext() || {}
    var user=wx.getStorageSync('userInfo') || {},accountId=String(user._id || user.id || ''),requestId=this._requestId=(this._requestId || 0)+1
    this.setData({loading:true,errorText:''})
    return wx.cloud.callFunction({ name: 'getMiniWorkspace', data: { action: 'officialRoster', workspaceId: (context.currentWorkspace || {}).id, teamId: this.data.teamId, tournamentId: this.data.tournamentId, divisionId: this.data.divisionId } }).then(function (response) {
      var active=wx.getStorageSync('userInfo') || {}
      if(self._unloaded || self._requestId!==requestId || String(active._id || active.id || '')!==accountId)return
      var result = response.result || {}
      if (!result.success) throw new Error(result.message || '名单加载失败')
      self.hydrate(result)
      self._loaded=true
    }).catch(function (error) { if(!self._unloaded && self._requestId===requestId)self.setData({ loading: false,errorText:error.message || '名单读取失败，请重试',rosterMembers:[],hasRosterMembers:false }) })
  },
  editRoster:function(){if(!this.data.canEditRoster)return;wx.navigateTo({url:'/pages/team/official-roster/official-roster?teamId='+encodeURIComponent(this.data.teamId)+'&tournamentId='+encodeURIComponent(this.data.tournamentId)+'&divisionId='+encodeURIComponent(this.data.divisionId)+'&mode=select'})},
  openPoster:function(){if(!this.data.hasRosterMembers||this.data.loading)return;wx.navigateTo({url:'/pages/team/roster-poster/roster-poster?teamId='+encodeURIComponent(this.data.teamId)+'&tournamentId='+encodeURIComponent(this.data.tournamentId)+'&divisionId='+encodeURIComponent(this.data.divisionId)})},
  openMember:function(event){var id=event.currentTarget.dataset.id;if(!this.data.rosterMembers.some(function(row){return row.id===id}))return;wx.navigateTo({url:'/pages/team/player-detail/player-detail?id='+encodeURIComponent(id)+'&teamId='+encodeURIComponent(this.data.teamId)})},
  portraitFailed:function(event){var id=event.currentTarget.dataset.id;this.setData({rosterMembers:this.data.rosterMembers.map(function(row){return row.id===id?Object.assign({},row,{hasPhoto:false}):row})})},
  applyFilter: function () {
    var mode = this.data.filter
    var rows = this.data.players || []
    var visible = rows.filter(function (item) { return mode === 'all' || (mode === 'problem' && item.profileStatus !== 'complete') || (mode === 'passed' && item.profileStatus === 'complete') })
    this.setData({ visible: visible, tabs: makeTabs(mode, rows) })
  },
  chooseTab: function (event) { this.setData({ filter: event.currentTarget.dataset.id || 'all' }); this.applyFilter() },
  toggle: function (event) {
    if(!this.data.editing || !this.data.canEditRoster)return
    var id = event.currentTarget.dataset.id
    var row = (this.data.players || []).filter(function (item) { return item.id === id })[0]
    if (!this.data.canManage) { wx.showToast({ title: '当前身份只可查看', icon: 'none' }); return }
    if (!row || !row.canSelect) { wx.showToast({ title: '该球员资料未完成或异常', icon: 'none' }); return }
    var ids = this.data.selected.slice()
    var index = ids.indexOf(id)
    if (index >= 0) ids.splice(index, 1)
    else { if (ids.length >= this.data.max) { wx.showToast({ title: '已达到名单上限', icon: 'none' }); return } ids.push(id) }
    var nextRows = decorate(this.data.players, ids)
    this.setData({ selected: ids, count: ids.length, players: nextRows, overview: makeOverview(nextRows, ids, this.data.overview.libraryCount) })
    this.applyFilter()
  },
  handleProblem: function (event) { var id = event.currentTarget.dataset.id; wx.navigateTo({ url: '/pages/team/profile-exception/profile-exception?playerId=' + encodeURIComponent(id) + '&teamId=' + encodeURIComponent(this.data.teamId) }) },
  submit: function () {
    var self = this
    var context = workspace.readContext() || {}
    if (!this.data.editing || !this.data.canEditRoster) { wx.showToast({ title: '当前名单不可修改', icon: 'none' }); return }
    if (this.data.submitting) return
    this.setData({ submitting: true })
    wx.cloud.callFunction({ name: 'getMiniWorkspace', data: { action: 'submitOfficialRoster', workspaceId: (context.currentWorkspace || {}).id, teamId: this.data.teamId, tournamentId: this.data.tournamentId, divisionId: this.data.divisionId, playerIds: this.data.selected } }).then(function (response) {
      if (!(response.result || {}).success) throw new Error((response.result || {}).message)
      wx.showToast({ title: '已提交主办方审核', icon: 'success' }); self.setData({editing:false});self.load()
    }).catch(function (error) { wx.showToast({ title: error.message || '提交失败', icon: 'none' }) }).finally(function () { self.setData({ submitting: false }) })
  },
  back: function () { var teamId = this.data.teamId; wx.navigateBack({ fail: function () { wx.navigateTo({ url: '/pages/team/participation/participation?teamId=' + encodeURIComponent(teamId) }) } }) }
})
