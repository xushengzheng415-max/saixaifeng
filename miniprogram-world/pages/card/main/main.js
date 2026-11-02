var api = require('../../../utils/api')

var EMPTY_CARD = {
  playerId: '',
  name: '',
  nameEn: '',
  numberText: '',
  positionLabel: '',
  headHint: '',
  foilTip: '',
  cityText: '',
  scopeText: '',
  cardUrl: '',
  portraitNote: ''
}

Page({
  data: {
    card: EMPTY_CARD,
    stats: [],
    stamps: [],
    cardLabel: '球员卡',
    shareTitle: '我的赛小蜂主卡',
    loading: true,
    blocked: false,
    gateTitle: '',
    gateText: '',
    eventText: '',
    scopeText: ''
  },

  onShow: function () {
    this.loadCard()
  },

  /** 先过玩法准入（已认领球员卡 + 本赛事），再取主卡 */
  loadCard: function () {
    var self = this
    api.getAccess().then(function (access) {
      self.setData({
        blocked: !access.allowed,
        gateTitle: access.titleText || '',
        gateText: access.reasonText || '',
        eventText: access.eventShortName || ''
      })
      if (!access.allowed) {
        self.setData({ loading: false })
        return
      }
      self.loadMainCard()
    }).catch(function (err) {
      self.setData({ loading: false })
      wx.showToast({ title: err.message || '主卡加载失败', icon: 'none' })
    })
  },

  loadMainCard: function () {
    var self = this
    api.getMainCard().then(function (view) {
      self.setData({
        card: view,
        stats: view.stats || [],
        stamps: view.stamps || [],
        scopeText: view.scopeText || '',
        cardLabel: (view.name || '球员') + ' 球员卡',
        shareTitle: '我的赛小蜂主卡 · ' + (view.name || ''),
        loading: false
      })
    }).catch(function (err) {
      self.setData({ loading: false })
      wx.showToast({ title: err.message || '主卡加载失败', icon: 'none' })
    })
  },

  goAlbum: function () {
    wx.redirectTo({ url: '/pages/card/album-sign/album-sign' })
  },

  goLineup: function () {
    wx.redirectTo({ url: '/pages/card/lineup/lineup' })
  },

  goMe: function () {
    wx.navigateTo({ url: '/pages/card/me/me' })
  },

  goLog: function () {
    wx.navigateTo({ url: '/pages/card/battle-log/battle-log' })
  },

  goGrowth: function () {
    wx.pageScrollTo({
      selector: '.marks-panel',
      duration: 320,
      fail: function () {
        wx.showToast({ title: '成长印记随赛事数据点亮', icon: 'none' })
      }
    })
  },

  onShareAppMessage: function () {
    var card = this.data.card || {}
    var payload = {
      title: this.data.shareTitle || '赛小蜂足球世界',
      path: '/pages/card/main/main'
    }
    if (card.cardUrl) payload.imageUrl = card.cardUrl
    return payload
  }
})
