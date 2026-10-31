var api = require('../../../utils/api')

var EMPTY_CARD = {
  playerId: '',
  name: '',
  nameEn: '',
  numberText: '',
  positionLabel: '',
  cityText: '',
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
    loading: true
  },

  onShow: function () {
    this.loadCard()
  },

  loadCard: function () {
    var self = this
    api.getMainCard().then(function (view) {
      self.setData({
        card: view,
        stats: view.stats || [],
        stamps: view.stamps || [],
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

  goLog: function () {
    wx.navigateTo({ url: '/pages/card/battle-log/battle-log' })
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
