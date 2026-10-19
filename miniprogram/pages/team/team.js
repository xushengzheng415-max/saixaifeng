var workspace = require('../../utils/workspace')
var participation = require('../../utils/team-participation-view')

function isDevtools() { try { return wx.getSystemInfoSync().platform === 'devtools' } catch (error) { return false } }

Page({
  data: {
    loading: true, errorText: '', hasTeam: false, teamId: '', teamName: '', teamLogo: '', claimText: '已认领',
    playerCount: '—', coachCount: '—', tournamentCount: '—', completionText: '', leaderText: '', foundedText: '', completionPercent: 0, localVisualQa: false,
    menuItems: [
      { id: 'profile', icon: '/images/icons/list.svg', title: '球队资料', subtitle: '队名、队徽、联系人等' },
      { id: 'members', icon: '/images/icons/team.svg', title: '球队成员', subtitle: '教练、管理员' },
      { id: 'players', icon: '/images/icons/players.svg', title: '球队球员库', subtitle: '长期资产' },
      { id: 'participation', icon: '/images/icons/event.svg', title: '参赛管理', subtitle: '报名 / 正式名单 / 单场阵容' },
      { id: 'history', icon: '/images/icons/chart.svg', title: '历史参赛记录', subtitle: '已完成赛事快照' }
    ],
    hasCurrentTournament: false, currentTournamentName: '', currentTournamentId: '', currentTournamentMeta: ''
  },
  onLoad: function(options) {
    if (isDevtools() && options && options.visualQa === '1') {
      this.setData({
        localVisualQa: true, loading: false, hasTeam: true, teamId: 'visual-qa-u12', teamName: '赛小蜂 U12 竞技队', teamLogo: '/images/runtime/icons/brand-v1-tab-team.png', claimText: '已认领', leaderText: '负责人 许老师', foundedText: '成立于 2018 年', completionText: '资料完整度 92%', completionPercent: 92, playerCount: 23, coachCount: 3, tournamentCount: 2,
        menuItems: [
          { id: 'profile', icon: '/images/icons/list.svg', title: '球队资料', subtitle: '队名、队徽、联系人等' },
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
      var data = { workspaceId:context.currentWorkspace.id, teamId:that.data.teamId }
      function read(action) { return wx.cloud.callFunction({name:'getMiniWorkspace',data:Object.assign({},data,{action:action})}).then(function(response) { var result=response.result || {}; if (!result.success) throw new Error(result.message || '球队资料读取失败'); return result }) }
      return Promise.all([
        read('teamProfile').then(function(result) { var profile=result.profile || {}; that.setData({leaderText:profile.managerName || '', foundedText:profile.foundedYear ? '成立于 ' + profile.foundedYear + ' 年' : '',completionText:typeof profile.completeness === 'number' ? '资料完整度 ' + profile.completeness + '%' : ''}) }),
        read('teamParticipation').then(function(result) {
          var rows=participation.rowsForTeam(result.items,context,data.teamId)
          var current=rows.find(function(row) { return row.competitionStatus === 'ongoing' }) || rows.find(function(row) { return row.competitionStatus === 'not_started' })
          that.setData({tournamentCount:participation.tournamentCount(rows),hasCurrentTournament:Boolean(current),currentTournamentId:current ? current.tournamentId : '',currentDivisionId:current ? current.divisionId : '',currentTournamentName:current ? current.name : '',currentTournamentMeta:current ? current.divisionName || current.statusText : ''})
        })
      ])
    }).catch(function(error) { that.setData({ loading: false, errorText: error.message || '球队详情加载失败，请重试' }) }).finally(function() { that._detailRequest=null })
    return this._detailRequest
  },
  applyContext: function(context) {
    var selected = wx.getStorageSync('teamInfo') || {}
    var id = String(selected._id || selected.id || selected.teamId || '')
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
  onBack: function() { wx.navigateBack({ delta: 1 }) },
  onMenuTap: function(event) {
    var id = event.currentTarget.dataset.id || '', teamId = this.data.teamId
    var routes = { profile: '/pages/team/profile/profile?teamId=', members: '/pages/team/members/members?teamId=', players: '/pages/team/player-library/player-library?teamId=', participation: '/pages/team/participation/participation?teamId=', history: '/pages/team/history/history?teamId=' }
    var route = routes[id] || ''
    if (!route) return
    wx.navigateTo({ url: route + teamId })
  },
  enterTournament: function() { if (this.data.currentTournamentId) wx.navigateTo({ url: '/pages/tournament/detail/detail?id=' + encodeURIComponent(this.data.currentTournamentId) + '&view=team&workspaceId=' + encodeURIComponent(((workspace.readContext() || {}).currentWorkspace || {}).id || '') + '&teamId=' + encodeURIComponent(this.data.teamId) + '&divisionId=' + encodeURIComponent(this.data.currentDivisionId || '') }) },
  onCreateTeam: function() { wx.navigateTo({ url: '/pages/onboarding/onboarding?scene=team&step=team' }) }
})
