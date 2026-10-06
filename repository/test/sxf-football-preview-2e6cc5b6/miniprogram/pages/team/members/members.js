var workspace = require('../../../utils/workspace')

function buildFilterTabs(mode, members) {
  var all = members.length
  var coaches = members.filter(function (item) { return item.kind === 'coach' }).length
  var managers = members.filter(function (item) { return item.kind === 'manager' }).length
  return [
    { id: 'all', label: '全部 ' + all, className: mode === 'all' ? 'member-filter member-filter-active' : 'member-filter' },
    { id: 'coach', label: '教练 ' + coaches, className: mode === 'coach' ? 'member-filter member-filter-active' : 'member-filter' },
    { id: 'manager', label: '管理员 ' + managers, className: mode === 'manager' ? 'member-filter member-filter-active' : 'member-filter' }
  ]
}

function visualFixture() {
  var members = [
    { id: 'leader-xu', name: '许老师', roleText: '负责人 / 主教练', phoneMasked: '173****1663', statusText: '已加入', kind: 'coach', pending: false, avatarText: '许' },
    { id: 'coach-wang', name: '王教练', roleText: '助理教练', phoneMasked: '186****2871', statusText: '已加入', kind: 'coach', pending: false, avatarText: '王' },
    { id: 'manager-liu', name: '刘老师', roleText: '领队 / 管理员', phoneMasked: '138****6721', statusText: '待确认', kind: 'manager', pending: true, avatarText: '刘' }
  ]
  return { team: { name: '赛小蜂 U12 竞技队', logo: '/images/icons/tab-team-active.svg' }, members: members, canManage: true }
}

function prepareMembers(members) {
  return members.map(function (item) {
    var row = Object.assign({}, item)
    row.phoneMasked = row.phoneMasked || ''
    row.avatarText = row.avatarText || String(row.name || '球').slice(0, 1)
    row.statusClass = row.pending ? 'member-status member-status-pending' : 'member-status member-status-active'
    return row
  })
}

function parseInviteScene(scene) {
  var raw = String(scene || '').trim()
  if (!raw) return { inviteId: '', teamId: '' }
  try { raw = decodeURIComponent(raw) } catch (error) {}
  try {
    if (raw.charAt(0) === '{') {
      var parsed = JSON.parse(raw)
      return {
        inviteId: String(parsed.memberInviteId || parsed.inviteId || parsed.token || parsed.mi || ''),
        teamId: String(parsed.teamId || parsed.t || '')
      }
    }
  } catch (error) {}
  var values = {}
  raw.split('&').forEach(function (part) {
    var index = part.indexOf('=')
    if (index < 0) return
    var key = part.slice(0, index)
    var value = part.slice(index + 1)
    try { value = decodeURIComponent(value) } catch (error) {}
    values[key] = value
  })
  var inviteId = values.memberInviteId || values.inviteId || values.token || values.mi || ''
  var teamId = values.teamId || values.t || ''
  if (!inviteId) {
    if (raw.indexOf('mi:') === 0) inviteId = raw.slice(3)
    else if (raw.indexOf('mi_') === 0 && raw.indexOf('tm_') !== 0) inviteId = raw.slice(3)
    else inviteId = raw
  }
  return { inviteId: String(inviteId || ''), teamId: String(teamId || '') }
}

function buildInvitePath(teamId, inviteId) {
  var path = '/pages/team/members/members?memberInviteId=' + encodeURIComponent(String(inviteId || ''))
  if (teamId) path += '&teamId=' + encodeURIComponent(String(teamId))
  return path
}

function hasLoginSession() {
  var user = wx.getStorageSync('userInfo') || {}
  return Boolean(user._id && !wx.getStorageSync('userLoggedOut'))
}

function currentMiniProgramEnvVersion() {
  try {
    var account = wx.getAccountInfoSync() || {}
    return String((account.miniProgram || {}).envVersion || 'release')
  } catch (error) {
    return 'release'
  }
}

function fitPosterText(value, maxLength) {
  var text = String(value || '')
  if (text.length <= maxLength) return text
  return text.slice(0, Math.max(1, maxLength - 1)) + '…'
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.lineTo(x + width - radius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + radius)
  context.lineTo(x + width, y + height - radius)
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  context.lineTo(x + radius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - radius)
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
  context.closePath()
}

Page({
  data: {
    teamId: '', loading: true, team: {}, members: [], visible: [], memberCount: 0,
    canManage: false, keyword: '', filter: 'all', filterTabs: [], sharePath: '', isDevtools: false,
    inviteMode: false, invite: {}, inviteAccepted: false, inviteAvailable: true, inviteStatusText: '', showMemberLoading: true, showMemberContent: false,
    inviteSheetVisible: false, inviteBusy: false, inviteReady: false, inviteAssetError: '',
    memberInviteId: '', memberInviteToken: '', invitePath: '', inviteUrlLink: '', inviteCopyValue: '',
    inviteCopyLabel: '链接生成中', inviteLinkDisplayText: '正在生成可点击邀请链接…', inviteCopyDisabled: true,
    inviteQrUrl: '', inviteQrFileId: '', inviteQrReady: false,
    invitePosterBusy: false, invitePosterReady: false, invitePosterPath: '',
    inviteEnvironmentText: '', inviteEnvironmentTip: '', inviteTestOnly: false,
    inviteExpiresAtText: '7天内有效'
  },
  onLoad: function (options) {
    var query = options || {}
    var isDevtools = workspace.isVisualQaEnabled(query)
    var sceneInfo = parseInviteScene(query.scene)
    var inviteId = String(query.memberInviteId || query.inviteId || query.token || sceneInfo.inviteId || '')
    var teamId = String(query.teamId || sceneInfo.teamId || '')
    if (inviteId && !isDevtools && !hasLoginSession()) {
      var returnUrl = buildInvitePath(teamId, inviteId)
      wx.setStorageSync('loginRedirectUrl', returnUrl)
      wx.redirectTo({ url: '/pages/login/login?redirect=' + encodeURIComponent(returnUrl) })
      return
    }
    this.setData({
      teamId: teamId,
      isDevtools: isDevtools,
      inviteMode: Boolean(inviteId),
      memberInviteId: inviteId,
      showMemberLoading: !inviteId,
      showMemberContent: false
    })
    if (inviteId) {
      this.loadInvite(inviteId)
      return
    }
    if (isDevtools) {
      var fixture = visualFixture()
      var fixtureMembers = prepareMembers(fixture.members)
      this.setData({ loading: false, showMemberLoading: false, showMemberContent: true, team: fixture.team, members: fixtureMembers, memberCount: fixtureMembers.length, canManage: fixture.canManage })
      this.filter()
      return
    }
    this.load()
  },
  onShareAppMessage: function () {
    var inviteId = this.data.memberInviteId || (this.data.invite || {}).id || ''
    if (inviteId) {
      return {
        title: '邀请你加入' + (this.data.team.name || '球队') + '的管理团队',
        path: this.data.invitePath || this.data.sharePath || buildInvitePath(this.data.teamId, inviteId)
      }
    }
    return { title: '邀请你加入球队管理团队', path: '/pages/team/team' }
  },
  loadInvite: function (inviteId) {
    var self = this
    wx.cloud.callFunction({
      name: 'getMiniWorkspace',
      data: { action: 'teamMemberInvite', inviteId: inviteId }
    }).then(function (response) {
      var result = response.result || {}
      if (!result.success) throw new Error(result.message || '邀请加载失败')
      var team = result.team || {}
      var invitation = result.invitation || {}
      self.setData({
        loading: false, showMemberLoading: false, showMemberContent: false,
        inviteAvailable: true, inviteStatusText: '', team: team, invite: invitation,
        inviteAccepted: Boolean(result.alreadyMember),
        teamId: String(team.id || self.data.teamId || ''),
        memberInviteId: String(invitation.id || inviteId || ''),
        invitePath: buildInvitePath(team.id || self.data.teamId, invitation.id || inviteId)
      })
    }).catch(function (error) {
      self.setData({ loading: false, showMemberLoading: false, showMemberContent: false, inviteAvailable: false, inviteStatusText: error.message || '邀请加载失败' })
      wx.showToast({ title: error.message || '邀请加载失败', icon: 'none' })
    })
  },
  acceptInvite: function () {
    var self = this
    if (!this.data.invite || !this.data.invite.id || this.data.inviteAccepted) {
      this.returnHome()
      return
    }
    wx.cloud.callFunction({
      name: 'getMiniWorkspace',
      data: { action: 'acceptTeamMemberInvite', inviteId: this.data.invite.id }
    }).then(function (response) {
      var result = response.result || {}
      if (!result.success) throw new Error(result.message || '加入球队失败')
      self.setData({ inviteAccepted: true, teamId: result.teamId || self.data.teamId })
      wx.showToast({ title: '已加入球队', icon: 'success' })
    }).catch(function (error) {
      wx.showToast({ title: error.message || '加入球队失败', icon: 'none' })
    })
  },
  load: function () {
    var self = this
    var context = workspace.readContext() || {}
    wx.cloud.callFunction({
      name: 'getMiniWorkspace',
      data: { action: 'teamMembers', workspaceId: (context.currentWorkspace || {}).id, teamId: this.data.teamId }
    }).then(function (response) {
      var result = response.result || {}
      if (!result.success) throw new Error(result.message || '成员加载失败')
      var members = prepareMembers(result.members || [])
      self.setData({ loading: false, showMemberLoading: false, showMemberContent: true, team: result.team || {}, members: members, memberCount: members.length, canManage: result.canManage })
      self.filter()
    }).catch(function (error) {
      self.setData({ loading: false, showMemberLoading: false, showMemberContent: true })
      wx.showToast({ title: error.message || '成员加载失败', icon: 'none' })
    })
  },
  search: function (event) {
    this.setData({ keyword: String(event.detail.value || '') })
    this.filter()
  },
  chooseFilter: function (event) {
    this.setData({ filter: event.currentTarget.dataset.id })
    this.filter()
  },
  filter: function () {
    var key = this.data.keyword
    var mode = this.data.filter
    var members = this.data.members || []
    var rows = members.filter(function (item) {
      var phone = item.phoneMasked || ''
      var name = item.name || ''
      var hit = !key || name.indexOf(key) >= 0 || phone.indexOf(key) >= 0
      return hit && (mode === 'all' || item.kind === mode)
    })
    this.setData({ visible: rows, filterTabs: buildFilterTabs(mode, members) })
  },
  invite: function () {
    var self = this
    var context = workspace.readContext() || {}
    if (!this.data.canManage || this.data.inviteBusy) return
    this.setData({
      inviteSheetVisible: true,
      inviteBusy: true,
      inviteReady: false,
      inviteAssetError: '',
      memberInviteId: '',
      memberInviteToken: '',
      invitePath: '',
      inviteUrlLink: '',
      inviteCopyValue: '',
      inviteCopyLabel: '链接生成中',
      inviteLinkDisplayText: '正在生成可点击邀请链接…',
      inviteCopyDisabled: true,
      inviteQrUrl: '',
      inviteQrFileId: '',
      inviteQrReady: false,
      invitePosterReady: false,
      invitePosterPath: '',
      inviteExpiresAtText: '7天内有效'
    })
    wx.cloud.callFunction({
      name: 'getMiniWorkspace',
      data: { action: 'createTeamMemberInvite', workspaceId: (context.currentWorkspace || {}).id, teamId: this.data.teamId }
    }).then(function (response) {
      var result = response.result || {}
      if (!result.success) throw new Error(result.message || '邀请创建失败')
      var inviteId = String(result.inviteId || '')
      var token = String(result.token || '')
      var path = String(result.path || buildInvitePath(self.data.teamId, inviteId))
      self.setData({
        memberInviteId: inviteId,
        memberInviteToken: token,
        sharePath: path,
        invitePath: path,
        inviteCopyValue: '',
        inviteCopyLabel: '链接生成中',
        inviteLinkDisplayText: '正在生成可点击邀请链接…',
        inviteCopyDisabled: true,
        inviteExpiresAtText: String(result.expiresAtText || '7天内有效'),
        inviteReady: true
      })
      wx.showShareMenu({ withShareTicket: false })
      return wx.cloud.callFunction({
        name: 'tournamentRegistrationFlow',
        data: {
          action: 'generateTeamMemberInviteAssets',
          envVersion: currentMiniProgramEnvVersion(),
          inviteId: inviteId,
          memberInviteId: inviteId,
          token: token,
          teamId: self.data.teamId,
          path: path
        }
      })
    }).then(function (response) {
      if (!response) return
      var result = response.result || {}
      if (result.success === false) throw new Error(result.message || '二维码生成失败')
      var assets = result.data || result
      var path = String(assets.path || self.data.invitePath || '')
      var urlLink = String(assets.urlLink || '')
      var qrCodeUrl = String(assets.qrCodeUrl || '')
      var qrCodeFileId = String(assets.qrCodeFileId || '')
      var envVersion = String(assets.envVersion || '')
      var testOnly = Boolean(assets.testOnly)
      var linkReady = Boolean(urlLink)
      var environmentText = '小程序邀请二维码'
      if (envVersion === 'trial') environmentText = '体验版邀请二维码'
      if (envVersion === 'release') environmentText = '正式版邀请二维码'
      self.setData({
        inviteBusy: false,
        inviteReady: true,
        invitePath: path,
        sharePath: path,
        inviteUrlLink: urlLink,
        inviteCopyValue: urlLink,
        inviteCopyLabel: linkReady ? '复制邀请链接' : '链接暂不可用',
        inviteLinkDisplayText: linkReady ? urlLink : String(assets.urlLinkStatusText || '可点击邀请链接暂未生成，请使用二维码或微信分享'),
        inviteCopyDisabled: !linkReady,
        inviteQrUrl: qrCodeUrl,
        inviteQrFileId: qrCodeFileId,
        inviteQrReady: Boolean(qrCodeUrl || qrCodeFileId),
        inviteExpiresAtText: String(assets.expiresAtText || self.data.inviteExpiresAtText || '7天内有效'),
        inviteEnvironmentText: environmentText,
        inviteEnvironmentTip: testOnly ? '当前二维码仅供体验成员测试' : '扫码即可进入球队邀请页',
        inviteTestOnly: testOnly,
        inviteAssetError: ''
      })
    }).catch(function (error) {
      var hasInvite = Boolean(self.data.memberInviteId)
      self.setData({
        inviteBusy: false,
        inviteReady: hasInvite,
        inviteCopyValue: '',
        inviteCopyLabel: '链接暂不可用',
        inviteLinkDisplayText: '可点击邀请链接暂未生成，请使用二维码或微信分享',
        inviteCopyDisabled: true,
        inviteAssetError: error.message || (hasInvite ? '二维码生成失败，请稍后重试' : '邀请创建失败')
      })
      if (!hasInvite) wx.showToast({ title: error.message || '邀请创建失败', icon: 'none' })
    })
  },
  closeInvitePanel: function () {
    if (this.data.inviteBusy || this.data.invitePosterBusy) return
    this.setData({ inviteSheetVisible: false })
  },
  noop: function () {},
  copyInviteLink: function () {
    var value = this.data.inviteCopyValue
    if (!value) {
      wx.showToast({ title: '可点击邀请链接尚未生成', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: value,
      success: function () { wx.showToast({ title: '邀请链接已复制', icon: 'success' }) },
      fail: function () { wx.showToast({ title: '复制失败，请重试', icon: 'none' }) }
    })
  },
  resolveImagePath: function (source) {
    var value = String(source || '')
    if (!value) return Promise.reject(new Error('图片地址为空'))
    if (value.indexOf('cloud://') === 0) {
      return new Promise(function (resolve, reject) {
        wx.cloud.downloadFile({
          fileID: value,
          success: function (result) { resolve(result.tempFilePath) },
          fail: reject
        })
      })
    }
    if (value.indexOf('http://') === 0 || value.indexOf('https://') === 0) {
      return new Promise(function (resolve, reject) {
        wx.downloadFile({
          url: value,
          success: function (result) {
            if (result.statusCode >= 200 && result.statusCode < 300) resolve(result.tempFilePath)
            else reject(new Error('图片下载失败'))
          },
          fail: reject
        })
      })
    }
    return new Promise(function (resolve, reject) {
      wx.getImageInfo({
        src: value,
        success: function (result) { resolve(result.path || value) },
        fail: reject
      })
    })
  },
  previewInviteQr: function () {
    var self = this
    var source = this.data.inviteQrFileId || this.data.inviteQrUrl
    if (!source) {
      wx.showToast({ title: '二维码尚未生成', icon: 'none' })
      return
    }
    wx.showLoading({ title: '正在打开' })
    this.resolveImagePath(source).then(function (path) {
      wx.hideLoading()
      wx.previewImage({ urls: [path], current: path })
    }).catch(function () {
      wx.hideLoading()
      self.setData({ inviteAssetError: '二维码读取失败，请稍后重试' })
      wx.showToast({ title: '二维码读取失败', icon: 'none' })
    })
  },
  saveImageToAlbum: function (path, successText) {
    var self = this
    wx.saveImageToPhotosAlbum({
      filePath: path,
      success: function () { wx.showToast({ title: successText || '已保存到相册', icon: 'success' }) },
      fail: function (error) {
        var message = String(error && error.errMsg || '')
        if (message.indexOf('auth deny') >= 0 || message.indexOf('auth denied') >= 0 || message.indexOf('authorize:fail') >= 0) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许保存到相册，再返回重新保存。',
            confirmText: '去设置',
            success: function (result) {
              if (!result.confirm) return
              wx.openSetting({
                success: function (setting) {
                  if (setting.authSetting && setting.authSetting['scope.writePhotosAlbum']) {
                    self.saveImageToAlbum(path, successText)
                  }
                }
              })
            }
          })
          return
        }
        wx.showToast({ title: '保存失败，请重试', icon: 'none' })
      }
    })
  },
  saveInviteQr: function () {
    var self = this
    var source = this.data.inviteQrFileId || this.data.inviteQrUrl
    if (!source) {
      wx.showToast({ title: '二维码尚未生成', icon: 'none' })
      return
    }
    wx.showLoading({ title: '正在保存' })
    this.resolveImagePath(source).then(function (path) {
      wx.hideLoading()
      self.saveImageToAlbum(path, '二维码已保存')
    }).catch(function () {
      wx.hideLoading()
      wx.showToast({ title: '二维码下载失败', icon: 'none' })
    })
  },
  generateInvitePoster: function (saveAfter) {
    var self = this
    var shouldSave = saveAfter === true
    var qrSource = this.data.inviteQrFileId || this.data.inviteQrUrl
    if (!qrSource) {
      wx.showToast({ title: '请等待二维码生成', icon: 'none' })
      return
    }
    if (this.data.invitePosterBusy) return
    this.setData({ invitePosterBusy: true })
    wx.showLoading({ title: '正在生成海报' })
    var backgroundTask = this.resolveImagePath('/images/runtime/team-data-emerald-stadium-v1.jpg').catch(function () { return '' })
    var logoTask = this.resolveImagePath((this.data.team || {}).logo || '').catch(function () { return '' })
    var qrTask = this.resolveImagePath(qrSource)
    Promise.all([backgroundTask, logoTask, qrTask]).then(function (paths) {
      self.drawInvitePoster(paths[0], paths[1], paths[2], shouldSave)
    }).catch(function () {
      wx.hideLoading()
      self.setData({ invitePosterBusy: false })
      wx.showToast({ title: '海报素材加载失败', icon: 'none' })
    })
  },
  drawInvitePoster: function (backgroundPath, logoPath, qrPath, saveAfter) {
    var self = this
    var context = wx.createCanvasContext('invitePosterCanvas', this)
    context.setFillStyle('#03271b')
    context.fillRect(0, 0, 750, 1200)
    if (backgroundPath) context.drawImage(backgroundPath, 0, 0, 750, 1200)
    context.setFillStyle('rgba(0, 29, 19, 0.38)')
    context.fillRect(0, 0, 750, 1200)

    context.setTextAlign('center')
    context.setFillStyle('#ffffff')
    context.setFontSize(30)
    context.fillText('赛小蜂足球', 375, 92)
    context.setFontSize(52)
    context.fillText('邀请加入球队管理', 375, 172)

    roundedRect(context, 55, 220, 640, 820, 34)
    context.setFillStyle('#ffffff')
    context.fill()

    if (logoPath) {
      context.save()
      roundedRect(context, 295, 262, 160, 160, 28)
      context.clip()
      context.drawImage(logoPath, 295, 262, 160, 160)
      context.restore()
    } else {
      context.setFillStyle('#e8f6ed')
      context.beginPath()
      context.arc(375, 342, 80, 0, Math.PI * 2)
      context.fill()
      context.setFillStyle('#168d54')
      context.setFontSize(36)
      context.fillText('球队', 375, 354)
    }

    context.setFillStyle('#12241a')
    context.setFontSize(40)
    context.fillText(fitPosterText((self.data.team || {}).name || '赛小蜂球队', 14), 375, 480)
    context.setFillStyle('#65736a')
    context.setFontSize(25)
    context.fillText('诚邀你加入球队协作空间', 375, 528)

    roundedRect(context, 185, 566, 380, 380, 24)
    context.setFillStyle('#f3f8f5')
    context.fill()
    context.drawImage(qrPath, 210, 591, 330, 330)

    context.setFillStyle('#168d54')
    context.setFontSize(29)
    context.fillText('微信扫码加入球队协作', 375, 992)
    context.setFillStyle('#75827a')
    context.setFontSize(21)
    context.fillText('有效期至 ' + fitPosterText(self.data.inviteExpiresAtText || '7天内有效', 22), 375, 1025)

    context.setFillStyle('rgba(255,255,255,.92)')
    context.setFontSize(27)
    context.fillText('加入球队协作 · 共建球队资料', 375, 1112)
    context.setFillStyle('rgba(255,255,255,.68)')
    context.setFontSize(21)
    context.fillText('球队成员关系不等于赛事正式参赛名单', 375, 1154)

    context.draw(false, function () {
      setTimeout(function () {
        wx.canvasToTempFilePath({
          canvasId: 'invitePosterCanvas',
          x: 0,
          y: 0,
          width: 750,
          height: 1200,
          destWidth: 750,
          destHeight: 1200,
          fileType: 'png',
          quality: 1,
          success: function (result) {
            wx.hideLoading()
            self.setData({
              invitePosterBusy: false,
              invitePosterReady: true,
              invitePosterPath: result.tempFilePath
            })
            if (saveAfter) {
              self.saveImageToAlbum(result.tempFilePath, '邀请海报已保存')
              return
            }
            wx.previewImage({ urls: [result.tempFilePath], current: result.tempFilePath })
          },
          fail: function () {
            wx.hideLoading()
            self.setData({ invitePosterBusy: false })
            wx.showToast({ title: '海报生成失败', icon: 'none' })
          }
        }, self)
      }, 180)
    })
  },
  previewInvitePoster: function () {
    var path = this.data.invitePosterPath
    if (!path) {
      this.generateInvitePoster()
      return
    }
    wx.previewImage({ urls: [path], current: path })
  },
  saveInvitePoster: function () {
    if (!this.data.invitePosterPath) {
      this.generateInvitePoster(true)
      return
    }
    this.saveImageToAlbum(this.data.invitePosterPath, '邀请海报已保存')
  },
  returnHome: function () { wx.switchTab({ url: '/pages/home/home' }) },
  resend: function () {
    this.invite()
  },
  back: function () {
    wx.navigateBack({ fail: function () { wx.switchTab({ url: '/pages/teams/index' }) } })
  }
})
