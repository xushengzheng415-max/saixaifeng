var workspace = require('../../../utils/workspace')
var pointsUI = require('../../../utils/player-points')
var playerCards = require('../../../utils/player-card')

function scopeKey() {
  var user = wx.getStorageSync('userInfo') || {}, context = workspace.readContext() || {}
  return JSON.stringify([String(user._id || user.id || ''), (context.currentWorkspace || {}).id || ''])
}
function withTimeout(request, timeout) {
  var timer
  return Promise.race([request, new Promise(function(resolve, reject) { timer = setTimeout(function() { reject(new Error('读取超时，请重试')) }, timeout || 12000) })]).finally(function() { clearTimeout(timer) })
}

function metric(value) { return typeof value === 'number' && Number.isFinite(value) ? value : '—' }

function display(value, fallback) {
  if (value === 0) return '0'
  return value ? String(value) : (fallback || '待完善')
}

Page({
  ...pointsUI.methods,
  data: {
    ...pointsUI.data,
    loading: true,
    errorText: '',
    playerId: '',
    teamId: '',
    player: {},
    teamInfo: {},
    cardScene: null, cardUrl: '', hasDynamicCard: false, hasStaticCard: false,
    cardLoading: false, cardStateText: '', cardCanRetry: false, hasFallbackPhoto: false, httpsNativeFonts: true,
    stats: { appearances: '—', goals: '—', yellowCards: '—', redCards: '—' },
    cardScore: { level:'待核定', points:'—', progress:'生涯积分待核定', canCustomize:false },
    statisticsNote: '',
    detailItems: [],
    canManage: false,
    visualQa: false
  },

  onLoad: function(options) {
    options = options || {}
    var playerId = String(options.id || options.playerId || '')
    var teamId = String(options.teamId || '')
    this.setData({ playerId: playerId, teamId: teamId })
    if (workspace.isVisualQaEnabled(options)) {
      this.loadVisualFixture()
      return
    }
    if (!playerId || !teamId) {
      this.setData({ loading: false, errorText: '球员或球队信息不完整' })
      return
    }
    this.loadPlayerData()
  },

  onShow: function() {
    if (this.data.playerId && this.data.teamId && !this.data.visualQa && !this.data.loading) this.loadPlayerData(true)
  },

  onHide: function() { this.invalidateRequests() },
  onUnload: function() { this.invalidateRequests() },
  invalidateRequests: function() {
    this._detailEpoch = (this._detailEpoch || 0) + 1
    this._cardEpoch = (this._cardEpoch || 0) + 1
    this._detailRequest = null
    this._cardRequest = null
    this._imageRequest = null
    this.setData({ loading: false, cardScene: null, cardUrl: '', hasDynamicCard: false, hasStaticCard: false, hasFallbackPhoto: false })
  },

  loadPlayerData: function(silent) {
    if (this._detailRequest) return this._detailRequest
    var that = this
    var epoch = this._detailEpoch = (this._detailEpoch || 0) + 1, scope = scopeKey()
    function current() { return epoch === that._detailEpoch && scope === scopeKey() }
    this._cardEpoch = (this._cardEpoch || 0) + 1
    this._cardRequest = null
    this._imageRequest = null
    this.setData({ errorText: '', cardScene: null, cardUrl: '', hasDynamicCard: false, hasStaticCard: false, hasFallbackPhoto: false, cardCanRetry: false, cardStateText: '' })
    if (silent !== true) this.setData({ loading: true })
    var context = workspace.readContext() || {}
    this._detailRequest = withTimeout(wx.cloud.callFunction({
      name: 'getMiniWorkspace',
      data: {
        action: 'teamPlayerDetail',
        workspaceId: context.currentWorkspace && context.currentWorkspace.id,
        teamId: this.data.teamId,
        playerId: this.data.playerId
      }
    })).then(function(response) {
      if (!current()) return
      var result = response.result || {}
      if (!result.success) throw new Error(result.message || '球员详情加载失败')
      that.setData({pointsEntryAllowed:result.canViewPointsLedger===true})
      that.hydrate(result.player || {}, result.team || {}, result.stats || {}, result.canManage === true, result.dataCenter, result.playerCard)
      that.loadPlayerCard()
    }).catch(function(error) {
      if (!current()) return
      that.setData({ loading: false, errorText: error.message || '球员详情加载失败' })
    }).finally(function() { if (epoch === that._detailEpoch) that._detailRequest = null })
    return this._detailRequest
  },

  loadPlayerCard: function() {
    if (this._imageRequest) return this._imageRequest
    if (this._cardRequest || !this.data.playerId || !this.data.teamId || this.data.visualQa) return this._cardRequest
    var that = this, epoch = this._cardEpoch = (this._cardEpoch || 0) + 1, scope = scopeKey()
    function current() { return epoch === that._cardEpoch && scope === scopeKey() }
    this.setData({ cardLoading: true, cardCanRetry: false, cardStateText: '球员卡加载中', cardScene: null, cardUrl: '', hasDynamicCard: false, hasStaticCard: false })
    this._cardRequest = withTimeout(playerCards.read(this.data.playerId, this.data.teamId)).then(function(card) {
      if (!current()) return
      var forbidden = card.status === 'forbidden', ready = card.status === 'ready'
      var dynamic = ready && !!card.cardScene, image = ready && !dynamic && typeof card.cardUrl === 'string' && /^https:\/\//.test(card.cardUrl)
      var state = forbidden ? '无权查看球员卡' : card.status === 'pending' ? '成卡更新中' : card.status === 'unavailable' ? '暂无球员卡' : '球员卡未加载'
      that.setData({ cardLoading: false, cardScene: dynamic ? card.cardScene : null, cardUrl: image ? card.cardUrl : '', hasDynamicCard: dynamic, hasStaticCard: image, hasFallbackPhoto: !forbidden && !!that.data.player.photoUrl, cardStateText: dynamic || image ? '' : state, cardCanRetry: !forbidden && !dynamic && !image && card.status !== 'unavailable' })
    }).catch(function() {
      if (current()) that.setData({ cardLoading: false, cardStateText: '球员卡未加载，请重试', cardCanRetry: true, hasFallbackPhoto: !!that.data.player.photoUrl })
    }).finally(function() { if (epoch === that._cardEpoch) that._cardRequest = null })
    return this._cardRequest
  },
  dynamicCardFailed: function() {
    if (this._imageRequest) return this._imageRequest
    if (!this.data.hasDynamicCard || this.data.visualQa) return
    var that=this, epoch=this._cardEpoch=(this._cardEpoch||0)+1, scope=scopeKey()
    function current(){return epoch===that._cardEpoch&&scope===scopeKey()}
    this._cardRequest=null
    this.setData({hasDynamicCard:false,cardScene:null,hasStaticCard:false,cardUrl:'',cardLoading:true,cardCanRetry:false,cardStateText:'正在加载完整球员卡',hasFallbackPhoto:!!this.data.player.photoUrl})
    this._imageRequest=withTimeout(playerCards.readImage(this.data.playerId,this.data.teamId),25000).then(function(card){
      if(!current())return
      var ready=card.status==='ready'&&typeof card.cardUrl==='string'&&/^https:\/\//.test(card.cardUrl),forbidden=card.status==='forbidden',unavailable=card.status==='unavailable'
      that.setData({cardLoading:false,hasStaticCard:ready,cardUrl:ready?card.cardUrl:'',hasFallbackPhoto:!forbidden&&!!that.data.player.photoUrl,cardStateText:ready?'':forbidden?'无权查看球员卡':unavailable?'暂无球员卡':'球员卡未加载，请重试',cardCanRetry:!ready&&!forbidden&&!unavailable})
    }).catch(function(){if(current())that.setData({cardLoading:false,cardStateText:'球员卡未加载，请重试',cardCanRetry:true,hasFallbackPhoto:!!that.data.player.photoUrl})}).finally(function(){if(epoch===that._cardEpoch)that._imageRequest=null})
    return this._imageRequest
  },
  cardImageFailed: function() { this.setData({ hasStaticCard: false, cardUrl: '', cardStateText: '球员卡图片未加载', cardCanRetry: true, hasFallbackPhoto: !!this.data.player.photoUrl }) },
  portraitFailed: function() { this.setData({ hasFallbackPhoto: false }) },
  previewCard: function() { if (this.data.hasStaticCard) wx.previewImage({ current: this.data.cardUrl, urls: [this.data.cardUrl] }) },

  hydrate: function(raw, team, stats, canManage, dataCenter, playerCard) {
    var positionMap = { GK: '守门员', DF: '后卫', MF: '中场', FW: '前锋' }
    var genderMap = { male: '男', female: '女', '男': '男', '女': '女' }
    var footMap = { left: '左脚', right: '右脚', both: '双脚' }
    var relationMap = { father: '父亲', mother: '母亲', guardian: '监护人', other: '其他监护人' }
    var identityMap = { verified: '人证已核验', approved: '人证已核验', complete: '人证已核验', manual_required: '每场人工核验', pending: '待人证核验', reviewing: '人证审核中', rejected: '人证异常', failed: '人证异常' }
    var portraitMap = { complete: '形象照已完成', completed: '形象照已完成', approved: '形象照已完成', processing: '形象照处理中', pending: '待形象照', rejected: '形象照异常', failed: '形象照异常' }
    var birthDate = String(raw.birthDate || '')
    var age = this.calculateAge(birthDate)
    var player = Object.assign({}, raw, {
      _id: raw.id || raw._id || this.data.playerId,
      teamId: team.id || this.data.teamId,
      photoUrl: raw.photoUrl || '',
      displayPhoto: raw.photoUrl || '/images/logo.png',
      birthday: birthDate,
      birthDate: birthDate,
      ageText: age ? String(age) : '—',
      heightText: raw.height ? String(raw.height) : '—',
      heightUnit: raw.height ? 'cm' : '',
      weightText: raw.weight ? String(raw.weight) : '—',
      weightUnit: raw.weight ? 'kg' : '',
      positionLabel: positionMap[raw.position] || display(raw.position),
      genderLabel: genderMap[raw.gender] || display(raw.gender),
      strongFootLabel: footMap[raw.strongFoot] || display(raw.strongFoot),
      profileStatusText: display(raw.profileStatusText, '待完善'),
      claimStatusText: display(raw.claimStatusText, '未认领'),
      isUnclaimed: raw.isUnclaimed === true,
      identityStatusText: identityMap[String(raw.identityStatus || '').toLowerCase()] || '待人证核验',
      portraitStatusText: portraitMap[String(raw.portraitStatus || '').toLowerCase()] || (raw.photoUrl ? '形象照已上传' : '待形象照'),
      guardianRelationText: relationMap[raw.guardianRelation] || display(raw.guardianRelation),
      hasJerseyNumber: Boolean(raw.jerseyNumber),
      hasJerseyName: Boolean(raw.jerseyName),
      hasPosition: Boolean(raw.position)
    })
    var detailItems = [
      { id: 'gender', label: '性别', value: player.genderLabel },
      { id: 'birth', label: '出生日期', value: display(birthDate) },
      { id: 'position', label: '场上位置', value: player.positionLabel },
      { id: 'foot', label: '惯用脚', value: player.strongFootLabel },
      { id: 'jersey', label: '球衣号码', value: display(raw.jerseyNumber) },
      { id: 'jerseyName', label: '球衣名', value: display(raw.jerseyName) },
      { id: 'nationality', label: '国籍', value: display(raw.nationality) },
      { id: 'hometown', label: '籍贯', value: display(raw.hometown) },
      { id: 'guardian', label: '监护人', value: display(raw.guardianName) },
      { id: 'relation', label: '监护关系', value: player.guardianRelationText },
      { id: 'phone', label: '监护手机', value: display(raw.guardianPhoneMasked) },
      { id: 'profile', label: '资料状态', value: player.profileStatusText },
      { id: 'claim', label: '认领状态', value: player.claimStatusText },
      { id: 'identity', label: '人证核验', value: player.identityStatusText },
      { id: 'portrait', label: '标准形象照', value: player.portraitStatusText }
    ]
    var ready = playerCard && playerCard.status === 'ready'
    var progress = playerCard && playerCard.progress
    var progressText = !playerCard ? '等级统计接口待接入' : ready && !progress ? '升级进度接口待接入' : '生涯比赛记录待核定'
    if (playerCard && (playerCard.reasonCodes || []).some(function(code){return code.indexOf('MATCH_DURATION_') === 0})) progressText = '比赛时长来源待核对，升级进度待核定'
    if (ready && progress) progressText = progress.nextAt == null ? '已达金卡' : '距下一级 ' + progress.pointsToNext + ' 分'
    var cardScore = { level:ready ? ({bronze:'铜卡', silver:'银卡', gold:'金卡'}[playerCard.tier] || '待核定') : '待核定', points:ready ? String(playerCard.points) : '—', progress:progressText, hasProgress:ready && progress && typeof progress.percent === 'number', progressWidth:ready && progress ? progress.percent + '%' : '', canCustomize:ready && playerCard.canChangeBackground === true }
    this.setData({ loading: false, errorText: '', hasFallbackPhoto: !!player.photoUrl, player: player, teamInfo: team, stats: { appearances: metric(stats.appearances), goals: metric(stats.goals), yellowCards: metric(stats.yellowCards), redCards: metric(stats.redCards) }, cardScore:cardScore, statisticsNote: dataCenter && dataCenter.coverage.status !== 'complete' ? '部分比赛记录不完整' : '', detailItems: detailItems, canManage: canManage })
    wx.setNavigationBarTitle({ title: player.name || '球员详情' })
  },

  calculateAge: function(birthday) {
    if (!birthday) return ''
    var birth = new Date(birthday + (birthday.indexOf('T') < 0 ? 'T00:00:00' : ''))
    if (!Number.isFinite(birth.getTime())) return ''
    var today = new Date()
    var age = today.getFullYear() - birth.getFullYear()
    var monthDiff = today.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1
    return age >= 0 ? age : ''
  },

  previewImage: function() {
    if (!this.data.player.photoUrl) return
    wx.previewImage({ current: this.data.player.photoUrl, urls: [this.data.player.photoUrl] })
  },

  onInviteProfile: function() {
    if(!this.data.canManage)return
    wx.navigateTo({url:'/pages/team/player-invite/player-invite?teamId='+encodeURIComponent(this.data.teamId)+'&targetPlayerId='+encodeURIComponent(this.data.playerId)})
  },

  onEdit: function() {
    if (!this.data.canManage) return wx.showToast({ title: '当前身份只可查看', icon: 'none' })
    wx.navigateTo({ url: '/pages/team/player-add/player-add?id=' + encodeURIComponent(this.data.playerId) + '&teamId=' + encodeURIComponent(this.data.teamId) + '&teamName=' + encodeURIComponent(this.data.teamInfo.name || '') + '&mode=edit' })
  },

  onDelete: function() {
    var that = this
    if (!this.data.canManage) return wx.showToast({ title: '当前身份无权移出球员', icon: 'none' })
    wx.showModal({ title: '移出球队', content: '将“' + (this.data.player.name || '当前球员') + '”移出长期球员库？历史赛事名单和比赛快照会继续保留。', confirmText: '确认移出', confirmColor: '#F44336', success: function(result) { if (result.confirm) that.archivePlayer() } })
  },

  archivePlayer: function() {
    var that = this
    var context = workspace.readContext() || {}
    wx.showLoading({ title: '处理中...' })
    wx.cloud.callFunction({ name: 'getMiniWorkspace', data: { action: 'archiveTeamPlayer', workspaceId: context.currentWorkspace && context.currentWorkspace.id, teamId: this.data.teamId, playerId: this.data.playerId } }).then(function(response) {
      var result = response.result || {}
      if (!result.success) throw new Error(result.message || '移出失败')
      wx.showToast({ title: '已移出球队', icon: 'success' })
      setTimeout(function() { wx.navigateBack() }, 800)
    }).catch(function(error) { wx.showToast({ title: error.message || '移出失败', icon: 'none' }) }).finally(function() { wx.hideLoading() })
  },

  loadVisualFixture: function() {
    this.setData({ visualQa: true, playerId: 'visual-player', teamId: 'visual-team' })
    this.hydrate({ id:'visual-player',name:'张子墨',jerseyName:'ZIMO',jerseyNumber:'10',photoUrl:'',birthDate:'2014-03-18',gender:'male',nationality:'中国',hometown:'河南郑州',position:'MF',strongFoot:'right',height:148,weight:39,guardianName:'张先生',guardianRelation:'father',guardianPhoneMasked:'138****6721',profileStatusText:'资料完整',claimStatusText:'未认领',isUnclaimed:true,identityStatus:'verified',portraitStatus:'complete',remark:'球队长期球员档案' }, { id:'visual-team',name:'赛小蜂 U12 竞技队',logo:'/images/logo.png',code:'SXF-U12' }, { appearances:12,goals:6,yellowCards:1,redCards:0 }, true)
  }
})
