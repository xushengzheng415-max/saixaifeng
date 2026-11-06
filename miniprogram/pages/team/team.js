var workspace = require('../../utils/workspace')
var participation = require('../../utils/team-participation-view')
var location = require('../../utils/location')
var nav = require('../../utils/nav')

function isDevtools() { try { return wx.getSystemInfoSync().platform === 'devtools' } catch (error) { return false } }

function text(value) { return value == null ? '' : String(value).trim() }

Page({
  data: {
    loading: true, errorText: '', hasTeam: false, teamId: '', teamName: '', teamLogo: '', claimText: '已认领',
    playerCount: '—', coachCount: '—', tournamentCount: '—', completionText: '', leaderText: '', foundedText: '', completionPercent: 0, localVisualQa: false,
    hasFriendly: false, friendlySummaryText: '', friendlyWin: 0, friendlyDraw: 0, friendlyLose: 0, friendlyGoalsFor: 0, friendlyGoalsAgainst: 0, friendlyOfficialText: '',
    menuItems: [
      { id: 'profile', icon: '/images/icons/list.svg', title: '球队资料', subtitle: '队名、队徽、联系人等' },
      { id: 'tactics', icon: '/images/icons/ball.svg', title: '战术板', subtitle: '' },
      { id: 'members', icon: '/images/icons/team.svg', title: '球队成员', subtitle: '教练、管理员' },
      { id: 'players', icon: '/images/icons/players.svg', title: '球队球员库', subtitle: '长期资产' },
      { id: 'participation', icon: '/images/icons/event.svg', title: '参赛管理', subtitle: '报名 / 正式名单 / 单场阵容' },
      { id: 'history', icon: '/images/icons/chart.svg', title: '历史参赛记录', subtitle: '已完成赛事快照' }
    ],
    hasCurrentTournament: false, currentTournamentName: '', currentTournamentId: '', currentTournamentMeta: '',
    homeVenues: [], hasHomeVenues: false, venueEditorVisible: false, venueEditorTitle: '添加主场', editingVenueId: '',
    editorVenueName: '', editorVenueAddress: '', editorVenueLat: 0, editorVenueLng: 0, editorVenueHasLoc: false
  },
  onLoad: function(options) {
    this._queryTeamId = text(options && (options.teamId || options.id))
    // 由球员库的「返回」带入时，本页可能是栈底；再返回应回到「我的球队」，不能退出小程序。
    this._fromNotify = text(options && options.fromNotify) === '1'
    if (isDevtools() && options && options.visualQa === '1') {
      this.setData({
        localVisualQa: true, loading: false, hasTeam: true, teamId: 'visual-qa-u12', teamName: '赛小蜂 U12 竞技队', teamLogo: '/images/runtime/icons/brand-v1-tab-team.png', claimText: '已认领', leaderText: '负责人 许老师', foundedText: '成立于 2018 年', completionText: '资料完整度 92%', completionPercent: 92, playerCount: 23, coachCount: 3, tournamentCount: 2,
        hasFriendly: true, friendlySummaryText: '共 8 场', friendlyWin: 5, friendlyDraw: 2, friendlyLose: 1, friendlyGoalsFor: 21, friendlyGoalsAgainst: 11, friendlyOfficialText: '已转正式 3 场 · 2 胜 1 平 0 负',
        menuItems: [
          { id: 'profile', icon: '/images/icons/list.svg', title: '球队资料', subtitle: '队名、队徽、联系人等' },
          { id: 'tactics', icon: '/images/icons/ball.svg', title: '战术板', subtitle: '' },
          { id: 'members', icon: '/images/icons/team.svg', title: '球队成员', subtitle: '教练、管理员' },
          { id: 'players', icon: '/images/icons/players.svg', title: '球队球员库', subtitle: '长期资产 · 23 人' },
          { id: 'participation', icon: '/images/icons/event.svg', title: '参赛管理', subtitle: '报名 / 正式名单 / 单场阵容' },
          { id: 'history', icon: '/images/icons/chart.svg', title: '历史参赛记录', subtitle: '3 次参赛记录' }
        ],
        hasCurrentTournament: true, currentTournamentName: '2026河南青少年足球冠军联赛', currentTournamentId: 'visual-qa-tournament', currentTournamentMeta: 'U12组 · 小组赛 · 进行中'
      })
      return
    }
    this.loadData()
  },
  onShow: function() { if (!this.data.localVisualQa) this.loadData(true) },
  loadData: function(silent) {
    var that = this
    if (this._detailRequest) return this._detailRequest
    if (!silent) this.setData({ loading: true, errorText: '' })
    var cached = workspace.readContext()
    if (cached) this.applyContext(cached)
    this._detailRequest = workspace.loadContext().then(function(context) {
      that.applyContext(context)
      if (!that.data.teamId || !that.data.hasTeam) return
      that.loadHomeVenues()
      var data = { workspaceId:context.currentWorkspace.id, teamId:that.data.teamId }
      function read(action) { return wx.cloud.callFunction({name:'getMiniWorkspace',data:Object.assign({},data,{action:action})}).then(function(response) { var result=response.result || {}; if (!result.success) throw new Error(result.message || '球队资料读取失败'); return result }) }
      return Promise.all([
        read('teamProfile').then(function(result) { var profile=result.profile || {}; that.setData({leaderText:profile.managerName || '', foundedText:profile.foundedYear ? '成立于 ' + profile.foundedYear + ' 年' : '',completionText:typeof profile.completeness === 'number' ? '资料完整度 ' + profile.completeness + '%' : ''}) }),
        read('teamParticipation').then(function(result) {
          var rows=participation.rowsForTeam(result.items,context,data.teamId)
          var current=rows.find(function(row) { return row.competitionStatus === 'ongoing' }) || rows.find(function(row) { return row.competitionStatus === 'not_started' })
          that.setData({tournamentCount:participation.tournamentCount(rows),hasCurrentTournament:Boolean(current),currentTournamentId:current ? current.tournamentId : '',currentDivisionId:current ? current.divisionId : '',currentTournamentName:current ? current.name : '',currentTournamentMeta:current ? current.divisionName || current.statusText : ''})
        }),
        that.readFriendlyStats(data.teamId).then(function(stats) { that.applyFriendlyStats(stats) })
      ])
    }).catch(function(error) { that.setData({ loading: false, errorText: error.message || '球队详情加载失败，请重试' }) }).finally(function() { that._detailRequest=null })
    return this._detailRequest
  },
  applyContext: function(context) {
    var selected = wx.getStorageSync('teamInfo') || {}
    var id = text(this._queryTeamId) || String(selected._id || selected.id || selected.teamId || '')
    var teams = context.teams || []
    var team = teams.filter(function(item) { return String(item.id || '') === id })[0] || (!id && teams.length === 1 ? teams[0] : null)
    if (!team) { this.setData({ loading: false, hasTeam: false }); return }
    var items = this.data.menuItems.map(function(item) {
      if (item.id === 'players') return Object.assign({}, item, { subtitle: '长期资产 · ' + Number(team.playerCount || 0) + ' 人' })
      return item
    })
    var completionPercent = team.completionPercent == null ? (team.profileCompletion == null ? null : team.profileCompletion) : team.completionPercent
    function count(value) { return typeof value === 'number' && Number.isFinite(value) ? value : '—' }
    this.setData({ loading: false, errorText:'', hasTeam: true, teamId: team.id, teamName: team.name, teamLogo: team.logo || '', claimText: team.claimText || '已认领', leaderText: team.ownerName || team.managerName || '', foundedText: team.foundedYear ? ('成立于 ' + team.foundedYear + ' 年') : '', completionText: typeof completionPercent === 'number' ? ('资料完整度 ' + completionPercent + '%') : '', completionPercent: completionPercent, playerCount: count(team.playerCount), coachCount: count(team.coachCount), tournamentCount: count(team.tournamentCount), menuItems: items, hasCurrentTournament: false, currentTournamentName: '', currentTournamentId: '', currentTournamentMeta: '' })
  },
  readFriendlyStats: function(teamId) {
    if (!wx.cloud || !teamId) return Promise.resolve(null)
    return wx.cloud.callFunction({ name: 'friendlyMatchCenter', data: { action: 'teamFriendlyStats', teamId: teamId } }).then(function(response) {
      var result = (response && response.result) || {}
      if (!result.ok) throw new Error(text(result.message) || '约球数据读取失败')
      return result.data && result.data.stats ? result.data.stats : null
    }).catch(function(error) {
      console.warn('[team] 约球数据读取失败', error && error.message)
      return null
    })
  },
  applyFriendlyStats: function(stats) {
    if (!stats || !stats.total) {
      this.setData({ hasFriendly: false, friendlySummaryText: '', friendlyOfficialText: '' })
      return
    }
    var official = Number(stats.official) || 0
    var officialText = official > 0
      ? ('已转正式 ' + official + ' 场 · ' + (Number(stats.officialWin) || 0) + ' 胜 ' + (Number(stats.officialDraw) || 0) + ' 平 ' + (Number(stats.officialLose) || 0) + ' 负')
      : '还没有场次转入正式战绩'
    this.setData({
      hasFriendly: true,
      friendlySummaryText: '共 ' + stats.total + ' 场',
      friendlyWin: Number(stats.win) || 0,
      friendlyDraw: Number(stats.draw) || 0,
      friendlyLose: Number(stats.lose) || 0,
      friendlyGoalsFor: Number(stats.goalsFor) || 0,
      friendlyGoalsAgainst: Number(stats.goalsAgainst) || 0,
      friendlyOfficialText: officialText
    })
  },
  // ===== 我的主场 =====
  loadHomeVenues: function() {
    var that = this
    if (!wx.cloud || !this.data.teamId) return
    wx.cloud.callFunction({ name: 'friendlyMatchCenter', data: { action: 'listTeamVenues', teamId: this.data.teamId } }).then(function(response) {
      var result = (response && response.result) || {}
      var list = result.ok && result.data && result.data.venues ? result.data.venues.filter(function(v) { return v.saved === true }) : []
      that.setData({ homeVenues: list, hasHomeVenues: list.length > 0 })
    }).catch(function(error) { console.warn('[team] 主场加载失败', error && error.message) })
  },
  openAddVenue: function() {
    var that = this
    location.pickLocation({
      success: function (res) {
        var name = String(res.name || '').trim() || String(res.address || '').trim()
        var address = String(res.address || '').trim()
        var lat = Number(res.latitude) || 0
        var lng = Number(res.longitude) || 0
        if (!name) { wx.showToast({ title: '未获取到场地名称', icon: 'none' }); return }
        if (name.length > 30) name = name.slice(0, 30)
        wx.showLoading({ title: '保存主场' })
        wx.cloud.callFunction({
          name: 'friendlyMatchCenter',
          data: { action: 'upsertTeamVenue', teamId: that.data.teamId, name: name, address: address, latitude: lat, longitude: lng }
        }).then(function (response) {
          wx.hideLoading()
          var result = (response && response.result) || {}
          if (!result.ok) throw new Error(result.message || '保存失败')
          wx.showToast({ title: '已添加主场', icon: 'success' })
          that.loadHomeVenues()
        }).catch(function (error) {
          wx.hideLoading()
          console.error('[team] 保存主场失败', error && error.message)
          wx.showToast({ title: (error && error.message) || '保存失败', icon: 'none' })
        })
      }
    })
  },
  editVenue: function(event) {
    var item = this.data.homeVenues[Number(event.currentTarget.dataset.index)]
    if (!item) return
    this.setData({ venueEditorVisible: true, venueEditorTitle: '编辑主场', editingVenueId: item.id || '', editorVenueName: text(item.name), editorVenueAddress: text(item.address), editorVenueLat: Number(item.latitude) || 0, editorVenueLng: Number(item.longitude) || 0, editorVenueHasLoc: Boolean(Number(item.latitude) && Number(item.longitude)) })
  },
  closeVenueEditor: function() { this.setData({ venueEditorVisible: false }) },
  onEditorNameInput: function(event) { this.setData({ editorVenueName: text(event.detail.value) }) },
  onPickEditorLocation: function() {
    var that = this
    wx.chooseLocation({
      success: function(res) {
        that.setData({ editorVenueName: that.data.editorVenueName || text(res.name) || text(res.address), editorVenueAddress: text(res.address), editorVenueLat: Number(res.latitude) || 0, editorVenueLng: Number(res.longitude) || 0, editorVenueHasLoc: Boolean(res.latitude && res.longitude) })
      },
      fail: function(error) {
        if ((error && error.errMsg || '').indexOf('cancel') > -1) return
        wx.showToast({ title: '地图选点不可用', icon: 'none' })
      }
    })
  },
  clearEditorLocation: function() { this.setData({ editorVenueAddress: '', editorVenueLat: 0, editorVenueLng: 0, editorVenueHasLoc: false }) },
  saveVenue: function() {
    var that = this
    var data = this.data
    var name = text(data.editorVenueName)
    if (!name) { wx.showToast({ title: '请输入场地名称', icon: 'none' }); return }
    var payload = { action: 'upsertTeamVenue', teamId: data.teamId, name: name, address: text(data.editorVenueAddress), latitude: Number(data.editorVenueLat) || 0, longitude: Number(data.editorVenueLng) || 0 }
    if (data.editingVenueId) payload.venueId = data.editingVenueId
    wx.showLoading({ title: '保存中' })
    wx.cloud.callFunction({ name: 'friendlyMatchCenter', data: payload }).then(function(response) {
      wx.hideLoading()
      var result = (response && response.result) || {}
      if (!result.ok) throw new Error(result.message || '保存失败')
      that.setData({ venueEditorVisible: false })
      that.loadHomeVenues()
      wx.showToast({ title: '已保存', icon: 'success' })
    }).catch(function(error) {
      wx.hideLoading()
      wx.showToast({ title: error.message || '保存失败', icon: 'none' })
    })
  },
  deleteVenue: function(event) {
    var that = this
    var item = this.data.homeVenues[Number(event.currentTarget.dataset.index)]
    if (!item || !item.id) return
    wx.showModal({
      title: '删除主场',
      content: '确定删除「' + text(item.name) + '」？',
      success: function(result) {
        if (!result.confirm) return
        wx.showLoading({ title: '删除中' })
        wx.cloud.callFunction({ name: 'friendlyMatchCenter', data: { action: 'deleteTeamVenue', teamId: that.data.teamId, venueId: item.id } }).then(function(response) {
          wx.hideLoading()
          var res = (response && response.result) || {}
          if (!res.ok) throw new Error(res.message || '删除失败')
          that.loadHomeVenues()
          wx.showToast({ title: '已删除', icon: 'success' })
        }).catch(function(error) {
          wx.hideLoading()
          wx.showToast({ title: error.message || '删除失败', icon: 'none' })
        })
      }
    })
  },
  setDefaultVenue: function(event) {
    var that = this
    var item = this.data.homeVenues[Number(event.currentTarget.dataset.index)]
    if (!item || !item.id) return
    wx.cloud.callFunction({ name: 'friendlyMatchCenter', data: { action: 'setDefaultTeamVenue', teamId: this.data.teamId, venueId: item.id } }).then(function(response) {
      var result = (response && response.result) || {}
      if (!result.ok) throw new Error(result.message || '设置失败')
      that.loadHomeVenues()
      wx.showToast({ title: '已设为默认', icon: 'success' })
    }).catch(function(error) { wx.showToast({ title: error.message || '设置失败', icon: 'none' }) })
  },
  openVenueMap: function(event) {
    var item = this.data.homeVenues[Number(event.currentTarget.dataset.index)]
    if (!item || !Number(item.latitude)) return
    wx.openLocation({ latitude: Number(item.latitude), longitude: Number(item.longitude), name: text(item.name), address: text(item.address), scale: 16 })
  },
  onBack: function() { nav.back(this._fromNotify ? '/pages/teams/index' : '') },
  onMenuTap: function(event) {
    var id = event.currentTarget.dataset.id || '', teamId = this.data.teamId
    var routes = { profile: '/pages/team/profile/profile?teamId=', tactics: '/pages/team/tactics/board/board?teamId=', members: '/pages/team/members/members?teamId=', players: '/pages/team/player-library/player-library?teamId=', participation: '/pages/team/participation/participation?teamId=', history: '/pages/team/history/history?teamId=' }
    var route = routes[id] || ''
    if (!route) return
    wx.navigateTo({ url: route + teamId })
  },
  enterTournament: function() { if (this.data.currentTournamentId) wx.navigateTo({ url: '/pages/tournament/detail/detail?id=' + encodeURIComponent(this.data.currentTournamentId) + '&view=team&workspaceId=' + encodeURIComponent(((workspace.readContext() || {}).currentWorkspace || {}).id || '') + '&teamId=' + encodeURIComponent(this.data.teamId) + '&divisionId=' + encodeURIComponent(this.data.currentDivisionId || '') }) },
  onCreateTeam: function() { wx.navigateTo({ url: '/pages/onboarding/onboarding?scene=team&step=team' }) }
})
