var workspace = require('../../../utils/workspace')
var handwriting = require('./invite-handwriting')

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

function registrantTypeForBirthDate(value) {
  var match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return 'guardian'
  var today = new Date()
  var age = today.getFullYear() - Number(match[1])
  if (today.getMonth() + 1 < Number(match[2]) || (today.getMonth() + 1 === Number(match[2]) && today.getDate() < Number(match[3]))) age -= 1
  return age >= 18 ? 'self' : 'guardian'
}

function registrantUi(type) {
  var self = type === 'self'
  return {
    registrantType: self ? 'self' : 'guardian',
    showGuardianFields: !self,
    recipientEntryLabel: self ? '本人认领' : '家长认领',
    confirmTitle: self ? '确认本人资料' : '确认孩子资料',
    matchIntro: self ? '仅显示与当前账号关联的本人资料' : '仅显示与当前账号关联的孩子资料',
    confirmActionText: self ? '确认是本人' : '确认是我的孩子',
    registerActionText: self ? '认领本人资料' : '认领孩子资料',
    authorizationText: self ? '我确认由本人登记，并同意提交必要资料。' : '我确认是该球员监护人，并同意提交必要资料。',
    successTitle: self ? '本人资料已认领' : '孩子资料已认领',
    successAuthorizationText: self ? '本人授权已确认' : '监护人授权已确认'
  }
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
    pageTitle: '球员认领', loading: true, errorText: '', team: {}, invite: {}, visualQa: false,
    showMatchStep: false, showRegisterStep: false, hasMatchedPlayer: false, matchPhoneText: '微信账号已验证',
    sharePath: '', urlLink: '', linkDisplayText: '正在生成可点击邀请链接…', linkDisabled: true,
    qrUrl: '', qrFileId: '', qrReady: false, environmentText: '', environmentTip: '', expiresAtText: '7天内有效',
    registrantType: 'guardian', showGuardianFields: true, recipientEntryLabel: '球员认领', confirmTitle: '确认球员资料', matchIntro: '仅显示与本次邀请相关的球员资料', confirmActionText: '确认并继续', registerActionText: '认领球员资料', authorizationText: '请确认登记身份并授权资料使用。', successTitle: '球员资料已认领', successAuthorizationText: '资料授权已确认', accountPhoneMasked: '',
    authorizationAgreed: false, authorizationClass: 'authorization-box',
    guardianRelation: 'father', relationFatherClass: 'relation-option active', relationMotherClass: 'relation-option', relationOtherClass: 'relation-option',
    name: '', birthDate: '', birthDateText: '请选择出生日期', maxBirthDate: '', jerseyNumber: '',
    positionLabels: ['暂不选择', '守门员', '后卫', '中场', '前锋'], positionValues: ['', 'GK', 'DF', 'MF', 'FW'], positionIndex: 0, positionText: '暂不选择',
    submitting: false, submitted: false, submittedPlayer: {}, parentProfileUrl: '', canContinueProfile: false, claimed: false, submittedSummary: '', submittedBasicText: '球员档案已认领',
    posterBusy: false, posterReady: false, posterPath: '', ownerName:'', inviteQuote:'', posterError:'', shareBusy:false
  },

  onLoad: function (options) {
    var query = options || {}
    wx.hideShareMenu({menus:['shareAppMessage','shareTimeline']})
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
      this.setData({ teamId: teamId, inviteId: inviteId, modeRecipient: true, pageTitle: '认领球员资料' })
      this.loadInvitation()
      return
    }
    if (teamId) {
      this.setData({ teamId: teamId, targetPlayerId:String(query.targetPlayerId||''), modeManager: true, pageTitle: query.targetPlayerId?'邀请补资料':'邀请球员入队' })
      this.createInviteAssets()
      return
    }
    this.setData({ loading: false, errorText: '缺少球队或邀请信息' })
  },

  createInviteAssets: function () {
    var self = this
    var context = workspace.readContext() || {}
    if (this._creating || this.data.posterBusy) return
    this._creating=true
    this.setData({ loading: true, errorText: '',posterReady:false,posterPath:'' })
    wx.cloud.callFunction({
      name: 'getMiniWorkspace',
      data: { action: 'createTeamPlayerInvite', workspaceId: (context.currentWorkspace || {}).id, teamId: this.data.teamId, playerId:this.data.targetPlayerId||'' }
    }).then(function (response) {
      var result = response.result || {}
      if (!result.success) throw new Error(result.message || '认领邀请创建失败')
      self.setData({ inviteId: String(result.inviteId || ''), sharePath: String(result.path || ''), expiresAtText: String(result.expiresAtText || '7天内有效') })
      wx.hideShareMenu({menus:['shareAppMessage','shareTimeline']})
      return wx.cloud.callFunction({
        name: 'tournamentRegistrationFlow',
        data: { action: 'generateTeamPlayerInviteAssets', serviceFirst:true, envVersion: currentEnvVersion(), inviteId: result.inviteId, token: result.token, teamId: self.data.teamId }
      })
    }).then(function (response) {
      var result = response.result || {}
      if (!result.success) throw new Error(result.message || '认领素材生成失败')
      var data = result.data || {}
      if (data.envVersion!=='service' || !data.qrCodeUrl || data.urlLink || data.path) throw new Error('未生成服务号二维码，请重试')
      var urlLink = String(data.urlLink || '')
      var env = String(data.envVersion || '')
      self.setData({
        loading: false,
        team: data.team || {},
        sharePath: '',
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
      return self.loadOwnerName()
    }).catch(function (error) {
      self.setData({ loading: false, errorText: error.message || '球员邀请生成失败' })
    }).finally(function(){self._creating=false})
  },

  loadInvitation: function () {
    var self = this
    this.setData({ loading: true, errorText: '' })
    wx.cloud.callFunction({ name: 'getMiniWorkspace', data: { action: 'teamPlayerInvite', inviteId: this.data.inviteId } })
      .then(function (response) {
        var result = response.result || {}
        if (!result.success) throw new Error(result.message || '认领邀请加载失败')
        var existingPlayer = result.existingPlayer || null
        var registrant = existingPlayer ? registrantUi(existingPlayer.registrantType) : registrantUi('guardian')
        self.setData(Object.assign({
          loading: false,
          teamId: String((result.team || {}).id || self.data.teamId || ''),
          team: result.team || {},
          invite: result.invitation || {},
          expiresAtText: String((result.invitation || {}).expiresAtText || '7天内有效'),
          showMatchStep: true,
          showRegisterStep: false,
          hasMatchedPlayer: Boolean(existingPlayer),
          pageTitle: '确认认领',
          accountPhoneMasked: String(result.accountPhoneMasked || '已验证'),
          submitted: false,
          submittedPlayer: existingPlayer || {}
        }, registrant))
      }).catch(function (error) { self.setData({ loading: false, errorText: error.message || '认领邀请加载失败' }) })
  },

  startRegistration: function () {
    this.setData(Object.assign({ showMatchStep: false, showRegisterStep: true, pageTitle: '认领球员资料' }, registrantUi(this.data.registrantType)))
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

  inputName: function (event) { this.setData({ name: event.detail.value || '' }) },
  inputNumber: function (event) { this.setData({ jerseyNumber: event.detail.value || '' }) },
  changeBirth: function (event) {
    var value = event.detail.value || ''
    var ui = registrantUi(registrantTypeForBirthDate(value))
    this.setData(Object.assign({ birthDate: value, birthDateText: value || '请选择出生日期', pageTitle: ui.registrantType === 'self' ? '本人认领' : '家长认领' }, ui))
  },
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
        name: this.data.name, birthDate: this.data.birthDate, jerseyNumber: this.data.jerseyNumber,
        position: this.data.positionValues[this.data.positionIndex] || '',
        guardianRelation: this.data.guardianRelation,
        authorizationAgreed: this.data.authorizationAgreed
      }
    }).then(function (response) {
      var result = response.result || {}
      if (!result.success) throw new Error(result.message || '球员资料提交失败')
      var parentProfileUrl = String(result.parentProfileUrl || '')
      var claimed = result.claimed === true
      self.setData({
        submitting: false,
        submittedPlayer: result.player || {},
        parentProfileUrl: parentProfileUrl,
        canContinueProfile: Boolean(parentProfileUrl),
        claimed: claimed,
        submittedSummary: claimed
          ? '已认领 ' + self.data.team.name + ' 球员库中的球员档案，请继续完成实名与形象照。'
          : '已提交至 ' + self.data.team.name + ' 球员库，等待球队负责人确认。',
        submittedBasicText: claimed ? '球员档案已认领' : '基础信息已提交'
      })
      wx.showToast({ title: result.idempotent ? '球员资料已存在' : (claimed ? '认领成功' : '球员资料已登记'), icon: 'success' })
      if (parentProfileUrl) {
        setTimeout(function () { self.openParentProfile() }, 450)
      } else {
        self.setData({ submitted: true, showRegisterStep: false, pageTitle: '提交成功' })
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
        wx.showModal({ title: self.data.successTitle, content: '实名与形象照入口暂时无法打开，可稍后从球队发送的资料协作链接继续。', showCancel: false })
      }
    })
  },

  loadVisualFixture: function (state) {
    var team = { id: 'visual-team', name: '郑州青训U9队', logo: '/images/runtime/icons/brand-v2-11.png' }
    var base = { visualQa: true, loading: false, teamId: team.id, team: team, inviteId: 'visual-invite', expiresAtText: '09-06 16:30' }
    if (state === 'manager') return this.setData(Object.assign(base, { modeManager: true, pageTitle: '发起球员认领', qrReady: false, linkDisabled: true, linkDisplayText: '可点击邀请链接将在真实环境生成', environmentText: '正式版球员认领二维码', environmentTip: '扫码后匹配或认领孩子资料' }))
    if (state === 'match') return this.setData(Object.assign(base, registrantUi('guardian'), { modeRecipient: true, pageTitle: '确认认领', showMatchStep: true, hasMatchedPlayer: true, submittedPlayer: { name: '张浩', birthDate: '2016年08月', profileStatus: '待家长补充' }, accountPhoneMasked: '138 **** 5678' }))
    if (state === 'adult') return this.setData(Object.assign(base, registrantUi('self'), { modeRecipient: true, pageTitle: '本人认领', showRegisterStep: true, name: '王强', birthDate: '1996-05-18', birthDateText: '1996-05-18', accountPhoneMasked: '138 **** 5678' }))
    if (state === 'nomatch') return this.setData(Object.assign(base, registrantUi('guardian'), { modeRecipient: true, pageTitle: '确认球员', showMatchStep: true, hasMatchedPlayer: false, accountPhoneMasked: '账号已验证' }))
    if (state === 'success') return this.setData(Object.assign(base, registrantUi('guardian'), { modeRecipient: true, pageTitle: '认领成功', submitted: true, submittedPlayer: { name: '张浩' }, claimed: true, submittedSummary: '已认领 郑州青训U9队 球员库中的球员档案，请继续完成实名与形象照。', submittedBasicText: '球员档案已认领', canContinueProfile: true, parentProfileUrl: 'https://www.sxffootball.cn/service-account-h5/?parentInvite=visual' }))
    this.setData(Object.assign(base, registrantUi('guardian'), { modeRecipient: true, pageTitle: '认领球员资料', showRegisterStep: true, name: '', birthDate: '', accountPhoneMasked: '138 **** 5678' }))
  },

  copyLink: function () {
    if (!this.data.urlLink) return wx.showToast({ title: '可点击链接尚未生成', icon: 'none' })
    wx.setClipboardData({ data: this.data.urlLink, success: function () { wx.showToast({ title: '认领链接已复制', icon: 'success' }) } })
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

  loadOwnerName: function() {
    var self=this,context=workspace.readContext() || {}
    return wx.cloud.callFunction({name:'getMiniWorkspace',data:{action:'teamMembers',workspaceId:(context.currentWorkspace || {}).id,teamId:this.data.teamId}}).then(function(response){
      var result=response.result || {}
      if(!result.success) throw new Error(result.message || '负责人资料读取失败')
      var owners=(result.members || []).filter(function(row){return row.accountTypeText==='主账户'})
      var name=owners.length===1?String(owners[0].name || '').trim():''
      if (['未命名成员','球队负责人','未命名'].indexOf(name)>=0) name=''
      self.setData({ownerName:name})
    })
  },
  generatePoster: function(saveAfter) {
    var self=this
    if(this.data.posterBusy || !this.data.qrReady)return
    if(!this.data.ownerName)return wx.showToast({title:'请先完善主账号姓名',icon:'none'})
    var quotes=handwriting.quotes
    var index=(this._quoteIndex==null?Math.floor(Math.random()*quotes.length):(this._quoteIndex+1)%quotes.length);this._quoteIndex=index
    this.setData({posterBusy:true,posterError:'',inviteQuote:quotes[index]})
    wx.showLoading({title:'生成海报'})
    return Promise.all([this.resolveImagePath('cloud://cloud1-7g8ckb3c7815a011.636c-cloud1-7g8ckb3c7815a011-1419431905/football/public-assets/team-invite-v2/stadium.png'),this.resolveImagePath((this.data.team || {}).logo || '').catch(function(){return ''}),this.resolveImagePath(this.data.qrUrl),handwriting.load(wx,self.data.inviteQuote+'— '+self.data.ownerName)]).then(function(paths){return self.drawPoster(paths[0],paths[1],paths[2],saveAfter===true,paths[3])}).catch(function(error){self.setData({posterError:error.message || '海报生成失败，请重试'});wx.showToast({title:self.data.posterError,icon:'none'})}).finally(function(){wx.hideLoading();self.setData({posterBusy:false})})
  },
  drawPoster: function(background,logo,qr,saveAfter,lettering) {
    var self=this
    return new Promise(function(resolve,reject){wx.createSelectorQuery().in(self).select('#playerInviteCanvas').fields({node:true,size:true}).exec(function(result){
      if(!result[0] || !result[0].node)return reject(new Error('画布加载失败，请重试'))
      var canvas=result[0].node;canvas.width=750;canvas.height=1200;var c=canvas.getContext('2d')
      function load(src){if(!src)return Promise.resolve(null);return new Promise(function(done,fail){var img=canvas.createImage();img.onload=function(){done(img)};img.onerror=function(){fail(new Error('海报素材加载失败'))};img.src=src})}
      Promise.all([load(background),load(logo),load(qr)]).then(function(img){
        c.drawImage(img[0],0,0,750,1200);c.textAlign='center';c.fillStyle='#fff8e4';c.font='24px sans-serif';c.fillText('赛小蜂足球 · 球员邀请函',375,74)
        if(img[1])c.drawImage(img[1],320,104,110,110)
        c.font='bold 38px sans-serif';c.fillText(shortText(self.data.team.name,18),375,260)
        roundedRect(c,40,298,670,164,18);c.fillStyle='rgba(0,0,0,.56)';c.fill();c.fillStyle='#fff8e4'
        handwriting.drawText(c,self.data.inviteQuote,375,358,46,630,lettering)
        handwriting.drawText(c,'— '+self.data.ownerName,375,425,34,590,lettering)
        c.fillStyle='rgba(0,32,20,.9)';c.fillRect(95,520,560,68);c.fillStyle='#fff';c.font='bold 34px sans-serif';c.fillText('扫码关注服务号并登记',375,565)
        roundedRect(c,175,620,400,400,20);c.fillStyle='#fff';c.fill();c.drawImage(img[2],201,646,348,348)
        c.fillStyle='#254832';c.font='24px sans-serif';c.fillText('有效期至 '+self.data.expiresAtText,375,1070)
        wx.canvasToTempFilePath({canvas:canvas,fileType:'png',success:function(r){self.setData({posterPath:r.tempFilePath,posterReady:true});if(saveAfter)self.saveImage(r.tempFilePath,'海报已保存');resolve(r.tempFilePath)},fail:function(){reject(new Error('海报导出失败，请重试'))}},self)
      }).catch(reject)
    })})
  },
  previewPoster: function(){if(this.data.posterPath)wx.previewImage({urls:[this.data.posterPath]})},
  savePoster: function(){if(this.data.posterPath)this.saveImage(this.data.posterPath,'海报已保存');else this.generatePoster(true)},
  sharePoster: function(){
    var self=this,path=this.data.posterPath
    if(!path||this._sharing)return
    if(!wx.showShareImageMenu)return this.saveImage(path,'图片已保存，请从相册分享')
    var context=workspace.readContext() || {},payload={workspaceId:(context.currentWorkspace||{}).id,teamId:this.data.teamId,inviteId:this.data.inviteId}
    this._sharing=true
    this.setData({shareBusy:true})
    return wx.cloud.callFunction({name:'getMiniWorkspace',data:Object.assign({action:'beginInvitePosterShare'},payload)}).then(function(response){
      var result=response.result || {}
      if(!result.success)throw new Error(result.message || '分享准备失败，请重试')
      return new Promise(function(resolve){
        var finished=false
        function finish(){if(finished)return;finished=true;if(!result.shareToken)return resolve();wx.cloud.callFunction({name:'getMiniWorkspace',data:Object.assign({action:'endInvitePosterShare',shareToken:result.shareToken},payload)}).catch(function(){}).then(resolve)}
        try{wx.showShareImageMenu({path:path,needShowEntrance:false,complete:finish,fail:function(error){if(String(error.errMsg || '').indexOf('cancel')<0)wx.showToast({title:'请先保存图片再分享',icon:'none'})}})}catch(error){finish();throw error}
      })
    }).catch(function(error){wx.showToast({title:error.message || '分享失败，请重试',icon:'none'})}).finally(function(){self._sharing=false;self.setData({shareBusy:false})})
  },
  goHome: function () { wx.switchTab({ url: '/pages/home/home' }) },
  onBack: function () { wx.navigateBack({ fail: function () { wx.switchTab({ url: '/pages/teams/index' }) } }) }
})
