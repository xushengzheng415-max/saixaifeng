var workspace = require('../../../utils/workspace')

function display(value, fallback) {
  if (value === 0) return '0'
  return value ? String(value) : (fallback || '待完善')
}

Page({
  data: {
    loading: true,
    errorText: '',
    playerId: '',
    teamId: '',
    player: {},
    teamInfo: {},
    stats: { appearances: 0, goals: 0, yellowCards: 0, redCards: 0 },
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

  loadPlayerData: function(silent) {
    var that = this
    if (!silent) this.setData({ loading: true, errorText: '' })
    var context = workspace.readContext() || {}
    return wx.cloud.callFunction({
      name: 'getMiniWorkspace',
      data: {
        action: 'teamPlayerDetail',
        workspaceId: context.currentWorkspace && context.currentWorkspace.id,
        teamId: this.data.teamId,
        playerId: this.data.playerId
      }
    }).then(function(response) {
      var result = response.result || {}
      if (!result.success) throw new Error(result.message || '球员详情加载失败')
      that.hydrate(result.player || {}, result.team || {}, result.stats || {}, result.canManage === true)
    }).catch(function(error) {
      that.setData({ loading: false, errorText: error.message || '球员详情加载失败' })
    })
  },

  hydrate: function(raw, team, stats, canManage) {
    var positionMap = { GK: '守门员', DF: '后卫', MF: '中场', FW: '前锋' }
    var genderMap = { male: '男', female: '女', '男': '男', '女': '女' }
    var footMap = { left: '左脚', right: '右脚', both: '双脚' }
    var relationMap = { father: '父亲', mother: '母亲', guardian: '监护人', other: '其他监护人' }
    var identityMap = { verified: '已实名', approved: '已实名', complete: '已实名', pending: '待实名', reviewing: '实名审核中', rejected: '实名异常', failed: '实名异常' }
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
      identityStatusText: identityMap[String(raw.identityStatus || '').toLowerCase()] || '待实名',
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
      { id: 'identity', label: '实名认证', value: player.identityStatusText },
      { id: 'portrait', label: '标准形象照', value: player.portraitStatusText }
    ]
    this.setData({ loading: false, errorText: '', player: player, teamInfo: team, stats: { appearances: Number(stats.appearances || 0), goals: Number(stats.goals || 0), yellowCards: Number(stats.yellowCards || 0), redCards: Number(stats.redCards || 0) }, detailItems: detailItems, canManage: canManage })
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
    this.hydrate({ id:'visual-player',name:'张子墨',jerseyName:'ZIMO',jerseyNumber:'10',photoUrl:'',birthDate:'2014-03-18',gender:'male',nationality:'中国',hometown:'河南郑州',position:'MF',strongFoot:'right',height:148,weight:39,guardianName:'张先生',guardianRelation:'father',guardianPhoneMasked:'138****6721',profileStatusText:'资料完整',identityStatus:'verified',portraitStatus:'complete',remark:'球队长期球员档案' }, { id:'visual-team',name:'赛小蜂 U12 竞技队',logo:'/images/logo.png',code:'SXF-U12' }, { appearances:12,goals:6,yellowCards:1,redCards:0 }, true)
  }
})
