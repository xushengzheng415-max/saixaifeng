// pages/discover/invite-create/invite-create.js
// 约球创建页（前端骨架 · 后端 friendlyMatchCenter 待接入）
// 所有字段可跳过，限额与截止由发起方设定，对手扫码进小程序报名

var workspace = require('../../../utils/workspace')
var location = require('../../../utils/location')

function text(value) {
  return value == null ? '' : String(value).trim()
}

function pad2(value) {
  var str = String(value)
  return str.length < 2 ? '0' + str : str
}

function formatDate(date) {
  if (!date) return ''
  var y = date.getFullYear()
  var m = pad2(date.getMonth() + 1)
  var d = pad2(date.getDate())
  return y + '-' + m + '-' + d
}

function formatDateText(dateStr) {
  if (!dateStr) return '待定'
  var parts = String(dateStr).split('-')
  if (parts.length !== 3) return dateStr
  return parseInt(parts[1], 10) + '月' + parseInt(parts[2], 10) + '日'
}

function formatTimeText(timeStr) {
  if (!timeStr) return '待定时间'
  return timeStr
}

Page({
  data: {
    today: '',
    teamId: '',
    teamName: '',
    teamLogo: '',
    hasTeam: false,

    matchDate: '',
    matchDateText: '今天',
    matchTime: '20:00',
    matchTimeText: '20:00',

    venue: '',
    venueAddress: '',
    venueLatitude: 0,
    venueLongitude: 0,
    hasVenueLocation: false,
    venuePresets: [],
    hasVenuePresets: false,

    signupLimit: 11,

    deadline: '',
    deadlineText: '不限',

    generateBtnClass: 'is-ready'
  },

  onLoad: function () {
    var that = this
    var context = workspace.readContext()
    if (!context) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      setTimeout(function () { wx.navigateBack() }, 1200)
      return
    }
    var role = workspace.getPortalRole(context)
    var isOrganizer = role === 'organizer'
    if (isOrganizer) {
      wx.showToast({ title: '请切换到球队管理者', icon: 'none' })
      setTimeout(function () { wx.navigateBack() }, 1200)
      return
    }
    var team = this.pickTeam(context)
    if (!team) {
      that.setData({ hasTeam: false })
      return
    }

    var now = new Date()
    var todayStr = formatDate(now)
    var todayText = parseInt(pad2(now.getMonth() + 1), 10) + '月' + parseInt(pad2(now.getDate()), 10) + '日'

    that._context = context
    that.setData({
      hasTeam: true,
      teamId: text(team.id || team._id),
      teamName: text(team.name || team.teamName) || '本队',
      teamLogo: text(team.logo || team.teamLogo) || '/images/logo.png',
      today: todayStr,
      matchDate: todayStr,
      matchDateText: todayText
    })
    that.loadVenuePresets(text(team.id || team._id))
  },

  // 常用场地：从本队历史邀约/比赛中取最近用过的场地，球队场地固定可一键复用
  loadVenuePresets: function (teamId) {
    var that = this
    if (!wx.cloud || !teamId) return
    wx.cloud.callFunction({
      name: 'friendlyMatchCenter',
      data: { action: 'listTeamVenues', teamId: teamId }
    }).then(function (res) {
      var result = (res && res.result) || {}
      var venues = (result.ok && result.data && result.data.venues) || []
      // 先把 saved 主场排前面，默认主场最前
      var saved = venues.filter(function (v) { return v.saved === true })
      saved.sort(function (a, b) { return (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) })
      var derived = venues.filter(function (v) { return v.saved !== true })
      var sorted = saved.concat(derived)
      that.setData({ venuePresets: sorted, hasVenuePresets: sorted.length > 0 })
      // 自动预填默认主场（仅首次、且用户没手动填过场地名时）
      if (!text(that.data.venue)) {
        var defaultVenue = null
        for (var i = 0; i < saved.length; i++) { if (saved[i].isDefault) { defaultVenue = saved[i]; break } }
        if (!defaultVenue && saved.length > 0) defaultVenue = saved[0]
        if (defaultVenue) {
          that.setData({
            venue: text(defaultVenue.name),
            venueAddress: text(defaultVenue.address),
            venueLatitude: Number(defaultVenue.latitude) || 0,
            venueLongitude: Number(defaultVenue.longitude) || 0,
            hasVenueLocation: Boolean(Number(defaultVenue.latitude) && Number(defaultVenue.longitude))
          })
        }
      }
    }).catch(function (error) {
      console.warn('[invite] 常用场地读取失败', error && error.message)
    })
  },

  onPickVenuePreset: function (event) {
    var index = Number(event.currentTarget.dataset.index)
    var item = this.data.venuePresets[index]
    if (!item) return
    var hasLocation = item.hasLocation === true
    this.setData({
      venue: text(item.name),
      venueAddress: text(item.address),
      venueLatitude: Number(item.latitude) || 0,
      venueLongitude: Number(item.longitude) || 0,
      hasVenueLocation: hasLocation
    })
  },

  pickTeam: function (context) {
    var teams = (context && context.teams) || []
    var current = (context && context.currentWorkspace) || {}
    var currentId = text(current.teamId || current.id)
    var matched = null
    var i
    for (i = 0; i < teams.length; i += 1) {
      if (text(teams[i].id || teams[i]._id) === currentId) {
        matched = teams[i]
        break
      }
    }
    if (!matched && teams.length) matched = teams[0]
    return matched
  },

  onDateChange: function (event) {
    var val = text(event.detail.value)
    if (!val) return
    this.setData({
      matchDate: val,
      matchDateText: formatDateText(val)
    })
  },

  onTimeChange: function (event) {
    var val = text(event.detail.value)
    if (!val) return
    this.setData({
      matchTime: val,
      matchTimeText: val
    })
  },

  onVenueInput: function (event) {
    // 手输场地名后清掉旧坐标，避免地址和导航点对不上
    this.setData({
      venue: text(event.detail.value),
      venueAddress: '',
      venueLatitude: 0,
      venueLongitude: 0,
      hasVenueLocation: false
    })
  },

  // 地图选点：返回 GCJ-02 坐标，与高德/腾讯地图一致，可直接用于导航
  onPickVenueLocation: function () {
    var that = this
    location.pickLocation({
      success: function (res) {
        var name = text(res.name)
        var address = text(res.address)
        var latitude = Number(res.latitude) || 0
        var longitude = Number(res.longitude) || 0
        if (!latitude || !longitude) return
        that.setData({
          venue: name || address,
          venueAddress: address,
          venueLatitude: latitude,
          venueLongitude: longitude,
          hasVenueLocation: true
        })
      }
    })
  },

  onOpenVenueLocation: function () {
    var data = this.data
    if (!data.hasVenueLocation) return
    wx.openLocation({
      latitude: data.venueLatitude,
      longitude: data.venueLongitude,
      name: data.venue,
      address: data.venueAddress,
      scale: 16
    })
  },

  onLimitMinus: function () {
    var v = Math.max(0, this.data.signupLimit - 1)
    this.setData({ signupLimit: v })
  },

  onLimitPlus: function () {
    var v = Math.min(60, this.data.signupLimit + 1)
    this.setData({ signupLimit: v })
  },

  onDeadlineChange: function (event) {
    var val = text(event.detail.value)
    if (!val) return
    this.setData({
      deadline: val,
      deadlineText: formatDateText(val)
    })
  },

  onGenerate: function () {
    var that = this
    var data = that.data

    if (!data.hasTeam) {
      wx.showToast({ title: '请先切换到球队', icon: 'none' })
      return
    }

    wx.showLoading({ title: '创建邀约中...', mask: true })

    var payload = {
      action: 'createInvite',
      teamId: data.teamId,
      teamName: data.teamName,
      opponentName: '',
      matchDate: data.matchDate,
      matchTime: data.matchTime,
      venue: data.venue,
      venueAddress: data.venueAddress,
      latitude: data.venueLatitude,
      longitude: data.venueLongitude,
      maxPlayers: data.signupLimit,
      deadline: data.deadline
    }

    wx.cloud.callFunction({
      name: 'friendlyMatchCenter',
      data: payload,
      success: function (res) {
        wx.hideLoading()
        var result = res.result || {}
        if (!result.ok) {
          wx.showModal({ title: '创建失败', content: result.message || '未知错误', showCancel: false })
          return
        }
        var invite = result.data || {}
        that.setData({ generateBtnClass: 'is-disabled' })
        wx.showModal({
          title: '邀约已创建 ✅',
          content: '已推送给本队球员，他们在服务号会收到签到通知。\n签到链接：' + (invite.signinUrl || ''),
          confirmText: '复制链接',
          cancelText: '完成',
          success: function (modalRes) {
            if (modalRes.confirm && invite.signinUrl) {
              wx.setClipboardData({ data: invite.signinUrl })
            } else {
              setTimeout(function () { wx.navigateBack() }, 200)
            }
          }
        })
      },
      fail: function (err) {
        wx.hideLoading()
        wx.showModal({ title: '网络错误', content: (err && err.errMsg) || '请重试', showCancel: false })
      }
    })
  },

  onShareAppMessage: function () {
    return {
      title: this.data.teamName + ' 约球邀约',
      path: '/pages/discover/discover',
      imageUrl: '/images/brand/logo-saixiaofeng-football.png'
    }
  }
})
