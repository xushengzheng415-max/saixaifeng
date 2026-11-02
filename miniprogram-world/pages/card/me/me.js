var api = require('../../../utils/api')

var EMPTY_ME = {
  couponBalanceText: '0',
  couponNote: '',
  slots: [],
  slotNote: '',
  membershipTierText: '',
  cardCountText: '',
  cardPoolText: '',
  bgFreeText: '',
  bgStoreText: '',
  bgBtnText: '',
  bgBtnClass: 'is-disabled'
}

Page({
  data: {
    me: EMPTY_ME,
    loading: true
  },

  onShow: function () {
    this.loadMe()
  },

  loadMe: function () {
    var self = this
    api.getMe().then(function (view) {
      self.setData({ me: view, loading: false })
    }).catch(function (err) {
      self.setData({ loading: false })
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
    })
  },

  goShop: function () {
    wx.navigateTo({ url: '/pages/card/shop/shop' })
  },

  goAlbum: function () {
    wx.redirectTo({ url: '/pages/card/album-sign/album-sign' })
  },

  goBg: function () {
    wx.showToast({ title: '背景卡本期未上架', icon: 'none' })
  }
})
