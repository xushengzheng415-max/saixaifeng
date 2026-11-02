// pages/discover/invite-create/invite-create.js
// 约球创建页：登记时间、场地、限额后创建邀约，并生成“海报 + H5 报名二维码”。
// 2026-11-02 口径：球员端报名统一走 service-account-h5/friendly-signin.html（填姓名+手机号），
// 海报只放 H5 报名二维码，不生成小程序码；小程序侧只提供球队管理页。

var workspace = require('../../../utils/workspace')
var location = require('../../../utils/location')
var qr = require('../invite-qr')

function text(value) {
  return value == null ? '' : String(value).trim()
}

function pad2(value) {
  var str = String(value)
  return str.length < 2 ? '0' + str : str
}

// 海报单行文本按字符数截断，避免 fillText 溢出到版面外
function clipText(value, max) {
  var str = text(value)
  if (!str) return ''
  return str.length > max ? str.slice(0, max - 1) + '…' : str
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

    // 海报：canvas 离屏绘制后导出图片，sheet 里只展示图片与操作按钮
    posterVisible: false,
    posterImage: '',
    posterBusy: false,
    posterSaveText: '保存海报到相册',
    canvasWidthPx: 320,
    canvasHeightPx: 427,

    // 创建结果：signinUrl 存在即视为已创建，重复点击只重开海报，不重复建邀约
    hasCreated: false,
    inviteId: '',
    signinUrl: '',
    generateBtnText: '生成报名海报',
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
    // 海报画布按屏幕宽度等比取整，导出时放大 3 倍保证分享清晰
    var info = wx.getSystemInfoSync() || {}
    var posterWidth = Math.round((Number(info.windowWidth) || 375) * 0.92)
    posterWidth = Math.max(320, Math.min(posterWidth, 420))
    var posterHeight = Math.round(posterWidth * 4 / 3)
    that._posterWidth = posterWidth
    that._posterHeight = posterHeight

    that.setData({
      hasTeam: true,
      teamId: text(team.id || team._id),
      teamName: text(team.name || team.teamName) || '本队',
      teamLogo: text(team.logo || team.teamLogo) || '/images/logo.png',
      today: todayStr,
      matchDate: todayStr,
      matchDateText: todayText,
      canvasWidthPx: posterWidth,
      canvasHeightPx: posterHeight
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

    // 已创建过：不重复建邀约，只重开海报
    if (data.hasCreated && text(data.signinUrl)) {
      that.showPoster()
      return
    }

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
        var inviteId = text(invite.inviteId || invite._id)
        var signinUrl = text(invite.signinUrl)
        if (!signinUrl) {
          wx.showModal({ title: '缺少报名链接', content: '服务端未返回报名链接，请稍后重试或联系平台', showCancel: false })
          return
        }
        // 海报文案在创建时快照，之后改表单不会和已建邀约对不上
        that._posterInfo = {
          teamName: text(data.teamName) || '本队',
          timeText: formatDateText(data.matchDate) + ' ' + formatTimeText(data.matchTime),
          venueText: text(data.venue) || '场地待协商',
          limitText: Number(data.signupLimit) > 0 ? (Number(data.signupLimit) + ' 人') : '不限',
          deadlineText: text(data.deadline) ? ('报名截止 ' + formatDateText(data.deadline)) : '报名不设截止'
        }
        that.setData({
          hasCreated: true,
          inviteId: inviteId,
          signinUrl: signinUrl,
          generateBtnText: '查看报名海报'
        })
        that.showPoster()
      },
      fail: function (err) {
        wx.hideLoading()
        wx.showModal({ title: '网络错误', content: (err && err.errMsg) || '请重试', showCancel: false })
      }
    })
  },

  // ===== 海报 =====
  showPoster: function () {
    var that = this
    if (!text(that.data.signinUrl)) {
      wx.showToast({ title: '暂无报名链接', icon: 'none' })
      return
    }
    that.setData({ posterVisible: true, posterImage: '' })
    var draw = function () { that.drawPoster() }
    if (typeof wx.nextTick === 'function') wx.nextTick(draw)
    else setTimeout(draw, 120)
  },

  onClosePoster: function () {
    this.setData({ posterVisible: false })
  },

  // 整卡遮罩拦截，避免点空白关闭
  onStop: function () {},

  // 海报版式：顶部品牌带 + 信息四行 + H5 报名二维码 + 说明。
  // 文案与 H5 报名口径一致：扫码填姓名和手机号即完成报名。
  drawPoster: function () {
    var that = this
    var info = that._posterInfo || {}
    var W = Number(that._posterWidth) || 320
    var H = Number(that._posterHeight) || Math.round(W * 4 / 3)
    var ctx = wx.createCanvasContext('invitePoster', that)
    var pad = Math.round(W * 0.075)

    // 白底
    ctx.setFillStyle('#FFFFFF')
    ctx.fillRect(0, 0, W, H)

    // 顶部品牌带
    var bandH = Math.round(H * 0.27)
    ctx.setFillStyle('#0A7B47')
    ctx.fillRect(0, 0, W, bandH)

    var brandSize = Math.round(W * 0.036)
    var teamSize = Math.round(W * 0.076)
    var sealSize = Math.round(W * 0.048)
    ctx.setTextAlign('left')
    ctx.setFillStyle('rgba(255,255,255,0.76)')
    ctx.setFontSize(brandSize)
    ctx.fillText('赛小蜂足球 · 约球', pad, pad + brandSize)
    ctx.setFillStyle('#FFFFFF')
    ctx.setFontSize(teamSize)
    ctx.fillText(clipText(info.teamName, 10), pad, pad + brandSize + Math.round(teamSize * 1.2))
    ctx.setFillStyle('#FFE4A8')
    ctx.setFontSize(sealSize)
    ctx.fillText('诚邀对手 · 扫码报名', pad, bandH - Math.round(pad * 0.85))

    // 信息四行：时间 / 场地 / 限额 / 截止
    var labelSize = Math.round(W * 0.036)
    var valueSize = Math.round(W * 0.042)
    var labelW = Math.round(W * 0.17)
    var rowGap = Math.round(H * 0.058)
    var rowY = bandH + Math.round(H * 0.075)
    var rows = [
      { label: '时间', value: clipText(info.timeText, 16) },
      { label: '场地', value: clipText(info.venueText, 16) },
      { label: '限额', value: clipText(info.limitText, 10) },
      { label: '报名', value: clipText(info.deadlineText, 16) }
    ]
    var i
    for (i = 0; i < rows.length; i += 1) {
      ctx.setTextAlign('left')
      ctx.setFillStyle('#7C8B82')
      ctx.setFontSize(labelSize)
      ctx.fillText(rows[i].label, pad, rowY + i * rowGap)
      ctx.setFillStyle('#162D22')
      ctx.setFontSize(valueSize)
      ctx.fillText(rows[i].value, pad + labelW, rowY + i * rowGap)
    }

    // H5 报名二维码
    var matrix = qr.buildMatrix(text(that.data.signinUrl))
    var boxSize = Math.round(W * 0.46)
    var boxX = Math.round((W - boxSize) / 2)
    var boxY = Math.round(H * 0.545)
    ctx.setFillStyle('#FFFFFF')
    ctx.fillRect(boxX, boxY, boxSize, boxSize)
    var captionsTop = boxY + boxSize
    if (matrix) {
      var size = matrix.size
      // 四周各留 4 个模块的静区，保证可扫
      var cell = boxSize / (size + 8)
      var originX = boxX + cell * 4
      var originY = boxY + cell * 4
      ctx.setFillStyle('#000000')
      var r
      var c
      for (r = 0; r < size; r += 1) {
        var row = matrix.modules[r]
        c = 0
        while (c < size) {
          if (!row[c]) { c += 1; continue }
          var start = c
          while (c < size && row[c]) c += 1
          // 同色连续模块合并成一条，减少绘制调用并避免拼缝
          ctx.fillRect(originX + start * cell, originY + r * cell, (c - start) * cell + 0.5, cell + 0.5)
        }
      }
      ctx.setStrokeStyle('#E7EEE9')
      ctx.setLineWidth(1)
      ctx.strokeRect(boxX, boxY, boxSize, boxSize)
    } else {
      ctx.setTextAlign('center')
      ctx.setFillStyle('#C0423A')
      ctx.setFontSize(Math.round(W * 0.036))
      ctx.fillText('二维码生成失败，请复制报名链接', W / 2, boxY + boxSize / 2)
    }

    // 二维码说明
    ctx.setTextAlign('center')
    ctx.setFillStyle('#162D22')
    ctx.setFontSize(Math.round(W * 0.040))
    ctx.fillText('微信扫码报名', W / 2, captionsTop + Math.round(W * 0.068))
    ctx.setFillStyle('#7C8B82')
    ctx.setFontSize(Math.round(W * 0.031))
    ctx.fillText('填写姓名和手机号即可，无需注册', W / 2, captionsTop + Math.round(W * 0.108))
    ctx.setFillStyle('#A7B3AC')
    ctx.setFontSize(Math.round(W * 0.028))
    ctx.fillText('赛小蜂足球 · 报名结果以发起球队现场确认', W / 2, H - Math.round(H * 0.032))

    ctx.draw(false, function () { that.exportPoster() })
  },

  exportPoster: function () {
    var that = this
    var W = Number(that._posterWidth) || 320
    var H = Number(that._posterHeight) || Math.round(W * 4 / 3)
    wx.canvasToTempFilePath({
      canvasId: 'invitePoster',
      width: W,
      height: H,
      destWidth: W * 3,
      destHeight: H * 3,
      success: function (res) {
        that.setData({ posterImage: text(res && res.tempFilePath) })
      },
      fail: function () {
        wx.showToast({ title: '海报生成失败，可复制报名链接', icon: 'none' })
      }
    }, that)
  },

  onSavePoster: function () {
    var that = this
    var filePath = text(that.data.posterImage)
    if (!filePath) {
      wx.showToast({ title: '海报还在生成，请稍候', icon: 'none' })
      return
    }
    if (that.data.posterBusy) return
    that.setData({ posterBusy: true, posterSaveText: '保存中…' })
    wx.saveImageToPhotosAlbum({
      filePath: filePath,
      success: function () {
        that.setData({ posterBusy: false, posterSaveText: '保存海报到相册' })
        wx.showToast({ title: '已保存到相册', icon: 'success' })
      },
      fail: function (err) {
        that.setData({ posterBusy: false, posterSaveText: '保存海报到相册' })
        var message = text(err && err.errMsg)
        // 用户拒绝相册权限时引导去设置，其余失败提示改用复制链接
        if (message.indexOf('auth deny') >= 0 || message.indexOf('authorize') >= 0) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许保存到相册后重试',
            confirmText: '去设置',
            cancelText: '取消',
            success: function (res) {
              if (res.confirm && typeof wx.openSetting === 'function') wx.openSetting()
            }
          })
          return
        }
        wx.showToast({ title: '保存失败，可复制报名链接分享', icon: 'none' })
      }
    })
  },

  onCopySigninUrl: function () {
    var url = text(this.data.signinUrl)
    if (!url) {
      wx.showToast({ title: '暂无报名链接', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: url,
      success: function () { wx.showToast({ title: '报名链接已复制', icon: 'none' }) }
    })
  },

  onOpenManage: function () {
    var that = this
    var id = text(that.data.inviteId)
    that.setData({ posterVisible: false })
    if (!id) {
      wx.showToast({ title: '请从发现页约球卡片进入管理', icon: 'none' })
      setTimeout(function () { wx.navigateBack() }, 1200)
      return
    }
    wx.navigateTo({ url: '/pages/discover/invite-manage/invite-manage?inviteId=' + encodeURIComponent(id) })
  },

  onShareAppMessage: function () {
    return {
      title: this.data.teamName + ' 约球邀约',
      path: '/pages/discover/discover',
      imageUrl: '/images/brand/logo-saixiaofeng-football.png'
    }
  }
})
