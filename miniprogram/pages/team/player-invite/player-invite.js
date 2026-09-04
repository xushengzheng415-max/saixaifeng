var workspace = require('../../../utils/workspace')

function parseInviteScene(scene) {
  var raw = String(scene || '').trim()
  if (!raw) return ''
  try { raw = decodeURIComponent(raw) } catch (error) {}
  if (raw.indexOf('pi=') === 0) return raw.slice(3)
  if (raw.indexOf('playerInviteId=') === 0) return raw.slice(15)
  return raw
}

function buildInvitePath(teamId, inviteId) {
  return '/pages/team/player-invite/player-invite?teamId=' + encodeURIComponent(String(teamId || '')) + '&playerInviteId=' + encodeURIComponent(String(inviteId || ''))
}

function hasLoginSession() {
  var user = wx.getStorageSync('userInfo') || {}
  return Boolean(user._id && !wx.getStorageSync('userLoggedOut'))
}

function currentEnvVersion() {
  try {
    var account = wx.getAccountInfoSync() || {}
    return String((account.miniProgram || {}).envVersion || 'release')
  } catch (error) { return 'release' }
}

function todayText() {
  var date = new Date()
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
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

function shortText(value, length) {
  var text = String(value || '')
  return text.length > length ? text.slice(0, length - 1) + '…' : text
}

Page({
  data: {
    teamId: '', inviteId: '', modeManager: false, modeRecipient: false,
    pageTitle: '球员入队邀请', loading: true, errorText: '', team: {}, invite: {}, visualQa: false,
    showMatchStep: false, showRegisterStep: false, hasMatchedPlayer: false, matchPhoneText: '微信账号已验证',
    sharePath: '', urlLink: '', linkDisplayText: '正在生成可点击邀请链接…', linkDisabled: true,
    qrUrl: '', qrFileId: '', qrReady: false, environmentText: '', environmentTip: '', expiresAtText: '7天内有效',
    participantRole: 'guardian', roleGuardianClass: 'role-option active', rolePlayerClass: 'role-option',
    authorizationAgreed: false, authorizationClass: 'authorization-box',
    guardianRelation: 'father', relationFatherClass: 'relation-option active', relationMotherClass: 'relation-option', relationOtherClass: 'relation-option',
    name: '', birthDate: '', birthDateText: '请选择出生日期', maxBirthDate: '', guardianPhone: '', jerseyNumber: '',
    positionLabels: ['暂不选择', '守门员', '后卫', '中场', '前锋'], positionValues: ['', 'GK', 'DF', 'MF', 'FW'], positionIndex: 0, positionText: '暂不选择',
    submitting: false, submitted: false, submittedPlayer: {}, parentProfileUrl: '', canContinueProfile: false,
    posterBusy: false, posterReady: false, posterPath: ''
  },

  onLoad: function (options) {
    var query = options || {}
    this.setData({ maxBirthDate: todayText() })
    if (workspace.isVisualQaEnabled(query)) {
      this.loadVisualFixture(String(query.state || 'register'))
      return
    }
    var inviteId = String(query.playerInviteId || query.inviteId || query.token || parseInviteScene(query.scene) || '')
    var teamId = String(query.teamId || '')
    if (inviteId) {
      var returnUrl = buildInvitePath(teamId, inviteId)
      if (!hasLoginSession()) {
        wx.setStorageSync('loginRedirectUrl', returnUrl)
        wx.redirectTo({ url: '/pages/login/login?redirect=' + encodeURIComponent(returnUrl) })
        return
      }
      this.setData({ teamId: teamId, inviteId: inviteId, modeRecipient: true, pageTitle: '填写球员资料' })
      this.loadInvitation()
      return
    }
    if (teamId) {
      this.setData({ teamId: teamId, modeManager: true, pageTitle: '邀请球员入队' })
      this.createInviteAssets()
      return
    }
    this.setData({ loading: false, errorText: '缺少球队或邀请信息' })
  },

  onShareAppMessage: function () {
    return { title: '邀请你加入' + ((this.data.team || {}).name || '球队') + '并填写球员资料', path: this.data.sharePath || '/pages/teams/index' }
  },

  createInviteAssets: function () {
    var self = this
    var context = workspace.readContext() || {}
    this.setData({ loading: true, errorText: '' })
    wx.cloud.callFunction({
      name: 'getMiniWorkspace',
      data: { action: 'createTeamPlayerInvite', workspaceId: (context.currentWorkspace || {}).id, teamId: this.data.teamId }
    }).then(function (response) {
      var result = response.result || {}
      if (!result.success) throw new Error(result.message || '球员邀请创建失败')
      self.setData({ inviteId: String(result.inviteId || ''), sharePath: String(result.path || ''), expiresAtText: String(result.expiresAtText || '7天内有效') })
      wx.showShareMenu({ withShareTicket: false })
      return wx.cloud.callFunction({
        name: 'tournamentRegistrationFlow',
        data: { action: 'generateTeamPlayerInviteAssets', envVersion: currentEnvVersion(), inviteId: result.inviteId, token: result.token, teamId: self.data.teamId }
      })
    }).then(function (response) {
      var result = response.result || {}
      if (!result.success) throw new Error(result.message || '球员邀请素材生成失败')
      var data = result.data || {}
      var urlLink = String(data.urlLink || '')
      var env = String(data.envVersion || '')
      self.setData({
        loading: false,
        team: data.team || {},
        sharePath: String(data.path || self.data.sharePath || ''),
        urlLink: urlLink,
        linkDisplayText: urlLink || String(data.urlLinkStatusText || '可点击邀请链接暂未生成，请使用二维码或微信分享'),
        linkDisabled: !urlLink,
        qrUrl: String(data.qrCodeUrl || ''),
        qrFileId: String(data.qrCodeFileId || ''),
        qrReady: Boolean(data.qrCodeUrl || data.qrCodeFileId),
        environmentText: env === 'trial' ? '体验版球员邀请二维码' : (env === 'release' ? '正式版球员邀请二维码' : '开发版球员邀请二维码'),
        environmentTip: data.testOnly ? '仅供已添加的体验成员测试' : '扫码后填写球员资料并申请入队',
        expiresAtText: String(data.expiresAtText || self.data.expiresAtText || '7天内有效')
      })
    }).catch(function (error) {
      self.setData({ loading: false, errorText: error.message || '球员邀请生成失败' })
    })
  },

  loadInvitation: function () {
    var self = this
    this.setData({ loading: true, errorText: '' })
    wx.cloud.callFunction({ name: 'getMiniWorkspace', data: { action: 'teamPlayerInvite', inviteId: this.data.inviteId } })
      .then(function (response) {
        var result = response.result || {}
        if (!result.success) throw new Error(result.message || '球员邀请加载失败')
        var existingPlayer = result.existingPlayer || null
        self.setData({
          loading: false,
          teamId: String((result.team || {}).id || self.data.teamId || ''),
          team: result.team || {},
          invite: result.invitation || {},
          expiresAtText: String((result.invitation || {}).expiresAtText || '7天内有效'),
          showMatchStep: true,
          showRegisterStep: false,
          hasMatchedPlayer: Boolean(existingPlayer),
          pageTitle: '确认孩子',
          submitted: false,
          submittedPlayer: existingPlayer || {}
        })
      }).catch(function (error) { self.setData({ loading: false, errorText: error.message || '球员邀请加载失败' }) })
  },

  startRegistration: function () {
    this.setData({ showMatchStep: false, showRegisterStep: true, pageTitle: '注册孩子信息' })
  },

  chooseRelation: function (event) {
    var relation = String(event.currentTarget.dataset.relation || 'other')
    this.setData({
      guardianRelation: relation,
      relationFatherClass: relation === 'father' ? 'relation-option active' : 'relation-option',
      relationMotherClass: relation === 'mother' ? 'relation-option active' : 'relation-option',
      relationOtherClass: relation === 'other' ? 'relation-option active' : 'relation-option'
    })
  },

  confirmMatchedPlayer: function () {
    var self = this
    if (this.data.submitting) return
    this.setData({ submitting: true })
    wx.cloud.callFunction({ name: 'getMiniWorkspace', data: { action: 'acceptTeamPlayerInvite', inviteId: this.data.inviteId } })
      .then(function (response) {
        var result = response.result || {}
        if (!result.success) throw new Error(result.message || '无法继续补充资料')
        self.setData({ submitting: false, parentProfileUrl: String(result.parentProfileUrl || ''), canContinueProfile: Boolean(result.parentProfileUrl) })
        self.openParentProfile()
      }).catch(function (error) { self.setData({ submitting: false }); wx.showModal({ title: '无法继续', content: error.message || '请联系球队管理员', showCancel: false }) })
  },

  chooseRole: function (event) {
    var role = event.currentTarget.dataset.role === 'player' ? 'player' : 'guardian'
    this.setData({ participantRole: role, roleGuardianClass: role === 'guardian' ? 'role-option active' : 'role-option', rolePlayerClass: role === 'player' ? 'role-option active' : 'role-option' })
  },
  inputName: function (event) { this.setData({ name: event.detail.value || '' }) },
  inputPhone: function (event) { this.setData({ guardianPhone: event.detail.value || '' }) },
  inputNumber: function (event) { this.setData({ jerseyNumber: event.detail.value || '' }) },
  changeBirth: function (event) { var value = event.detail.value || ''; this.setData({ birthDate: value, birthDateText: value || '请选择出生日期' }) },
  changePosition: function (event) {
    var index = Number(event.detail.value || 0)
    this.setData({ positionIndex: index, positionText: this.data.positionLabels[index] || '暂不选择' })
  },
  toggleAuthorization: function () {
    var agreed = !this.data.authorizationAgreed
    this.setData({ authorizationAgreed: agreed, authorizationClass: agreed ? 'authorization-box active' : 'authorization-box' })
  },

  submitPlayer: function () {
    var self = this
    if (this.data.submitting) return
    this.setData({ submitting: true })
    wx.cloud.callFunction({
      name: 'getMiniWorkspace',
      data: {
        action: 'acceptTeamPlayerInvite', inviteId: this.data.inviteId,
        participantRole: this.data.participantRole, name: this.data.name, birthDate: this.data.birthDate,
        guardianPhone: this.data.guardianPhone, jerseyNumber: this.data.jerseyNumber,
        position: this.data.positionValues[this.data.positionIndex] || '',
        guardianRelation: this.data.guardianRelation,
        authorizationAgreed: this.data.authorizationAgreed
      }
    }).then(function (response) {
      var result = response.result || {}
      if (!result.success) throw new Error(result.message || '球员资料提交失败')
      var parentProfileUrl = String(result.parentProfileUrl || '')
      self.setData({ submitting: false, submittedPlayer: result.player || {}, parentProfileUrl: parentProfileUrl, canContinueProfile: Boolean(parentProfileUrl) })
      wx.showToast({ title: result.idempotent ? '球员资料已存在' : '球员资料已登记', icon: 'success' })
      if (parentProfileUrl) {
        setTimeout(function () { self.openParentProfile() }, 450)
      } else {
        self.setData({ submitted: true, showRegisterStep: false, pageTitle: '资料提交成功' })
      }
    }).catch(function (error) {
      self.setData({ submitting: false })
      wx.showModal({ title: '无法提交', content: error.message || '球员资料提交失败', showCancel: false })
    })
  },

  openParentProfile: function () {
    if (!this.data.parentProfileUrl) return wx.showToast({ title: '资料补充入口尚未生成', icon: 'none' })
    var self = this
    wx.navigateTo({
      url: '/pages/team/parent-service/parent-service?url=' + encodeURIComponent(this.data.parentProfileUrl),
      fail: function () {
        self.setData({ submitted: true, showRegisterStep: false, pageTitle: '资料提交成功' })
        wx.showModal({ title: '孩子信息已登记', content: '实名与形象照入口暂时无法打开，可稍后从球队发送的家长协作链接继续。', showCancel: false })
      }
    })
  },

  loadVisualFixture: function (state) {
    var team = { id: 'visual-team', name: '郑州青训U9队', logo: '/images/runtime/icons/brand-v2-11.png' }
    var base = { visualQa: true, loading: false, teamId: team.id, team: team, inviteId: 'visual-invite', expiresAtText: '09-06 16:30' }
    if (state === 'manager') return this.setData(Object.assign(base, { modeManager: true, pageTitle: '邀请球员入队', qrReady: false, linkDisabled: true, linkDisplayText: '可点击邀请链接将在真实环境生成', environmentText: '体验版球员邀请二维码', environmentTip: '扫码后匹配或登记孩子资料' }))
    if (state === 'match') return this.setData(Object.assign(base, { modeRecipient: true, pageTitle: '确认孩子', showMatchStep: true, hasMatchedPlayer: true, submittedPlayer: { name: '张浩', birthDate: '2016年08月', profileStatus: '待家长补充' }, matchPhoneText: '138 **** 5678' }))
    if (state === 'nomatch') return this.setData(Object.assign(base, { modeRecipient: true, pageTitle: '确认孩子', showMatchStep: true, hasMatchedPlayer: false, matchPhoneText: '账号已验证' }))
    if (state === 'success') return this.setData(Object.assign(base, { modeRecipient: true, pageTitle: '资料提交成功', submitted: true, submittedPlayer: { name: '张浩' }, canContinueProfile: true, parentProfileUrl: 'https://www.sxffootball.cn/service-account-h5/?parentInvite=visual' }))
    this.setData(Object.assign(base, { modeRecipient: true, pageTitle: '注册孩子信息', showRegisterStep: true, name: '', birthDate: '', guardianPhone: '' }))
  },

  copyLink: function () {
    if (!this.data.urlLink) return wx.showToast({ title: '可点击链接尚未生成', icon: 'none' })
    wx.setClipboardData({ data: this.data.urlLink, success: function () { wx.showToast({ title: '邀请链接已复制', icon: 'success' }) } })
  },
  resolveImagePath: function (source) {
    var value = String(source || '')
    if (!value) return Promise.reject(new Error('图片地址为空'))
    if (value.indexOf('cloud://') === 0) return new Promise(function (resolve, reject) { wx.cloud.downloadFile({ fileID: value, success: function (result) { resolve(result.tempFilePath) }, fail: reject }) })
    if (value.indexOf('http://') === 0 || value.indexOf('https://') === 0) return new Promise(function (resolve, reject) { wx.downloadFile({ url: value, success: function (result) { if (result.statusCode >= 200 && result.statusCode < 300) resolve(result.tempFilePath); else reject(new Error('图片下载失败')) }, fail: reject }) })
    return Promise.resolve(value)
  },
  previewQr: function () {
    var source = this.data.qrFileId || this.data.qrUrl
    if (!source) return wx.showToast({ title: '二维码尚未生成', icon: 'none' })
    this.resolveImagePath(source).then(function (path) { wx.previewImage({ urls: [path], current: path }) }).catch(function () { wx.showToast({ title: '二维码读取失败', icon: 'none' }) })
  },
  saveImage: function (path, title) {
    var self = this
    wx.saveImageToPhotosAlbum({ filePath: path, success: function () { wx.showToast({ title: title || '已保存到相册', icon: 'success' }) }, fail: function (error) {
      var message = String(error && error.errMsg || '')
      if (message.indexOf('auth') >= 0) return wx.showModal({ title: '需要相册权限', content: '请允许保存到相册后重试。', confirmText: '去设置', success: function (result) { if (result.confirm) wx.openSetting({ success: function (setting) { if (setting.authSetting && setting.authSetting['scope.writePhotosAlbum']) self.saveImage(path, title) } }) } })
      wx.showToast({ title: '保存失败', icon: 'none' })
    } })
  },
  saveQr: function () {
    var self = this, source = this.data.qrFileId || this.data.qrUrl
    if (!source) return wx.showToast({ title: '二维码尚未生成', icon: 'none' })
    this.resolveImagePath(source).then(function (path) { self.saveImage(path, '二维码已保存') }).catch(function () { wx.showToast({ title: '二维码下载失败', icon: 'none' }) })
  },

  generatePoster: function (saveAfter) {
    var self = this, qrSource = this.data.qrFileId || this.data.qrUrl
    if (!qrSource || this.data.posterBusy) return wx.showToast({ title: '请等待二维码生成', icon: 'none' })
    this.setData({ posterBusy: true })
    wx.showLoading({ title: '正在生成海报' })
    Promise.all([
      this.resolveImagePath('/images/runtime/team-data-emerald-stadium-v1.jpg').catch(function () { return '' }),
      this.resolveImagePath((this.data.team || {}).logo || '').catch(function () { return '' }),
      this.resolveImagePath(qrSource)
    ]).then(function (paths) { self.drawPoster(paths[0], paths[1], paths[2], saveAfter === true) }).catch(function () { wx.hideLoading(); self.setData({ posterBusy: false }); wx.showToast({ title: '海报素材加载失败', icon: 'none' }) })
  },
  drawPoster: function (background, logo, qr, saveAfter) {
    var self = this, context = wx.createCanvasContext('playerInviteCanvas', this)
    context.setFillStyle('#03271b'); context.fillRect(0, 0, 750, 1200)
    if (background) context.drawImage(background, 0, 0, 750, 1200)
    context.setFillStyle('rgba(0,29,19,.46)'); context.fillRect(0, 0, 750, 1200)
    context.setTextAlign('center'); context.setFillStyle('#fff'); context.setFontSize(30); context.fillText('赛小蜂足球', 375, 88)
    context.setFontSize(50); context.fillText('邀请球员加入球队', 375, 165)
    roundedRect(context, 55, 215, 640, 830, 34); context.setFillStyle('#fff'); context.fill()
    if (logo) { context.drawImage(logo, 300, 255, 150, 150) }
    context.setFillStyle('#173126'); context.setFontSize(40); context.fillText(shortText((self.data.team || {}).name || '球队', 14), 375, 460)
    context.setFillStyle('#66756d'); context.setFontSize(25); context.fillText('扫码填写球员资料并申请入队', 375, 510)
    roundedRect(context, 185, 555, 380, 380, 24); context.setFillStyle('#f2f8f4'); context.fill(); context.drawImage(qr, 210, 580, 330, 330)
    context.setFillStyle('#168d54'); context.setFontSize(29); context.fillText('微信扫码填写球员资料', 375, 980)
    context.setFillStyle('#78867f'); context.setFontSize(21); context.fillText('有效期至 ' + self.data.expiresAtText, 375, 1018)
    context.setFillStyle('rgba(255,255,255,.9)'); context.setFontSize(25); context.fillText('加入球员库不等于进入赛事正式名单', 375, 1135)
    context.draw(false, function () { setTimeout(function () { wx.canvasToTempFilePath({ canvasId: 'playerInviteCanvas', width: 750, height: 1200, destWidth: 750, destHeight: 1200, fileType: 'png', success: function (result) { wx.hideLoading(); self.setData({ posterBusy: false, posterReady: true, posterPath: result.tempFilePath }); if (saveAfter) self.saveImage(result.tempFilePath, '邀请海报已保存'); else wx.previewImage({ urls: [result.tempFilePath], current: result.tempFilePath }) }, fail: function () { wx.hideLoading(); self.setData({ posterBusy: false }); wx.showToast({ title: '海报生成失败', icon: 'none' }) } }, self) }, 180) })
  },
  savePoster: function () { if (this.data.posterPath) this.saveImage(this.data.posterPath, '邀请海报已保存'); else this.generatePoster(true) },
  goHome: function () { wx.switchTab({ url: '/pages/home/home' }) },
  onBack: function () { wx.navigateBack({ fail: function () { wx.switchTab({ url: '/pages/teams/index' }) } }) }
})
