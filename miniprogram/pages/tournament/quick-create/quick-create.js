var workspace = require('../../../utils/workspace')

function pad(n) { return n < 10 ? '0' + n : '' + n }

function text(value) { return value == null ? '' : String(value).trim() }

// 发起比赛只能挂在自己的球队下：取当前工作空间里选中/第一支球队，不再读旧的 currentTeam 缓存
function pickTeam(context) {
  var teams = (context && context.teams) || []
  var current = (context && context.currentWorkspace) || {}
  var currentId = text(current.teamId || current.id)
  var matched = null
  for (var i = 0; i < teams.length; i += 1) {
    if (text(teams[i].id || teams[i]._id) === currentId) {
      matched = teams[i]
      break
    }
  }
  if (!matched && teams.length) matched = teams[0]
  // 工作空间本身就是球队（teams 列表为空时）也能直接用
  if (!matched && text(current.teamId) && text(current.type) === 'team') {
    matched = { id: text(current.teamId), name: text(current.name) }
  }
  return matched
}

Page({
  data: {
    teamName: '',
    teamId: '',
    opponentName: '',
    matchDate: '',
    matchTime: '14:00',
    venue: '',
    venueAddress: '',
    venueLatitude: 0,
    venueLongitude: 0,
    venuePresets: [],
    hasVenuePresets: false,
    maxPlayers: '22',
    submitBtnClass: 'qc-submit-disabled',
    submitting: false,
    created: false,
    matchId: '',
    signupToken: ''
  },

  onLoad: function () {
    var context = workspace.readContext() || {}
    var team = pickTeam(context)
    var d = new Date(Date.now() + 24 * 3600 * 1000)
    this.setData({
      teamName: (team && text(team.name || team.teamName)) || '未绑定球队',
      teamId: (team && text(team.id || team._id || team.teamId)) || '',
      matchDate: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    })
    this.refreshBtn()
    if (team) this.loadVenuePresets(text(team.id || team._id || team.teamId))
  },

  // 常用场地：球队场地固定，优先展示已保存主场，一键带出坐标
  loadVenuePresets: function (teamId) {
    var that = this
    if (!wx.cloud || !teamId) return
    wx.cloud.callFunction({
      name: 'friendlyMatchCenter',
      data: { action: 'listTeamVenues', teamId: teamId }
    }).then(function (res) {
      var result = (res && res.result) || {}
      var venues = (result.ok && result.data && result.data.venues) || []
      var saved = venues.filter(function (v) { return v.saved === true })
      saved.sort(function (a, b) { return (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) })
      var derived = venues.filter(function (v) { return v.saved !== true })
      var sorted = saved.concat(derived)
      that.setData({ venuePresets: sorted, hasVenuePresets: sorted.length > 0 })
      if (!text(that.data.venue)) {
        var defaultVenue = null
        for (var i = 0; i < saved.length; i++) { if (saved[i].isDefault) { defaultVenue = saved[i]; break } }
        if (!defaultVenue && saved.length > 0) defaultVenue = saved[0]
        if (defaultVenue) {
          that.setData({
            venue: text(defaultVenue.name),
            venueAddress: text(defaultVenue.address),
            venueLatitude: Number(defaultVenue.latitude) || 0,
            venueLongitude: Number(defaultVenue.longitude) || 0
          })
          that.refreshBtn()
        }
      }
    }).catch(function (error) {
      console.warn('[quick-create] 常用场地读取失败', error && error.message)
    })
  },

  onPickVenuePreset: function (e) {
    var item = this.data.venuePresets[Number(e.currentTarget.dataset.index)]
    if (!item) return
    this.setData({
      venue: text(item.name),
      venueAddress: text(item.address),
      venueLatitude: Number(item.latitude) || 0,
      venueLongitude: Number(item.longitude) || 0
    })
    this.refreshBtn()
  },

  refreshBtn: function () {
    var d = this.data
    var ready = d.teamId && d.matchDate && d.venue && !d.submitting
    this.setData({ submitBtnClass: ready ? '' : 'qc-submit-disabled' })
  },

  onOpponentInput: function (e) { this.setData({ opponentName: e.detail.value }) },
  onVenueInput: function (e) { this.setData({ venue: e.detail.value }); this.refreshBtn() },
  onMaxInput: function (e) { this.setData({ maxPlayers: e.detail.value }) },
  onDateChange: function (e) { this.setData({ matchDate: e.detail.value }); this.refreshBtn() },
  onTimeChange: function (e) { this.setData({ matchTime: e.detail.value }) },

  // 对手栏「邀请对手」按钮 → 复用已有战书海报流程
  onInviteOpponent: function () {
    var d = this.data
    var url = '/pages/discover/invite-create/invite-create'
    var params = []
    if (d.matchDate) params.push('date=' + encodeURIComponent(d.matchDate))
    if (d.matchTime) params.push('time=' + encodeURIComponent(d.matchTime))
    if (d.venue) params.push('venue=' + encodeURIComponent(d.venue))
    if (params.length) url = url + '?' + params.join('&')
    wx.navigateTo({ url: url })
  },

  onSubmit: function () {
    var that = this
    var d = this.data
    if (d.submitting) return
    if (!d.teamId) { wx.showToast({ title: '未绑定球队，无法发起', icon: 'none' }); return }
    if (!d.matchDate) { wx.showToast({ title: '请选择比赛日期', icon: 'none' }); return }
    if (!d.venue) { wx.showToast({ title: '请填写场地', icon: 'none' }); return }

    d.submitting = true
    this.refreshBtn()
    wx.showLoading({ title: '发起中', mask: true })

    wx.cloud.callFunction({
      name: 'friendlyMatchCenter',
      data: {
        action: 'quickCreateMatch',
        teamId: d.teamId,
        teamName: d.teamName,
        opponentName: d.opponentName,
        matchDate: d.matchDate,
        matchTime: d.matchTime,
        venue: d.venue,
        venueAddress: d.venueAddress,
        latitude: d.venueLatitude,
        longitude: d.venueLongitude,
        maxPlayers: Number(d.maxPlayers) || 22
      }
    }).then(function (res) {
      wx.hideLoading()
      var r = (res && res.result) || {}
      if (!r.ok) throw new Error(r.message || '发起失败')
      d.submitting = false
      that.setData({
        submitting: false,
        created: true,
        matchId: r.data.matchId,
        signupToken: r.data.signupToken
      })
    }).catch(function (err) {
      wx.hideLoading()
      d.submitting = false
      that.setData({ submitting: false })
      that.refreshBtn()
      wx.showToast({ title: (err && err.message) || '发起失败', icon: 'none' })
    })
  },

  onDone: function () { wx.navigateBack() },

  onShareAppMessage: function () {
    var d = this.data
    var path = '/pages/tournament/quick-signup/quick-signup?matchId=' + d.matchId + '&token=' + d.signupToken
    var title = '⚔️ ' + d.teamName + ' 约战：' + d.matchDate + ' ' + d.matchTime + ' @' + d.venue
    if (d.opponentName) title = '⚽ ' + d.teamName + ' vs ' + d.opponentName + ' · 报名接龙'
    return { title: title, path: path }
  }
})
