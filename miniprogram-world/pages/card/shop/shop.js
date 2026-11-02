var api = require('../../../utils/api')

var EMPTY_SHOP = {
  couponBalanceText: '0',
  couponNote: '',
  items: [],
  rules: [],
  emptyCouponText: '',
  storeNote: ''
}

Page({
  data: {
    shop: EMPTY_SHOP,
    toastText: ''
  },

  onShow: function () {
    this.loadShop()
  },

  onUnload: function () {
    this.clearToast()
  },

  loadShop: function () {
    var self = this
    api.getShop().then(function (view) {
      self.setData({ shop: view })
    }).catch(function (err) {
      wx.showToast({ title: err.message || '商城加载失败', icon: 'none' })
    })
  },

  findItem: function (key) {
    var items = this.data.shop.items || []
    for (var i = 0; i < items.length; i++) {
      if (items[i].key === key) return items[i]
    }
    return null
  },

  onBuy: function (e) {
    var key = e.currentTarget.dataset.key
    var item = this.findItem(key)
    if (!item) return
    if (!item.canBuy) {
      this.showToast(item.disabledText || '暂时无法兑换')
      return
    }
    if (this._buying) return
    this._buying = true
    var self = this
    api.buySlot(key).then(function (res) {
      self._buying = false
      self.setData({ shop: res.shop })
      self.showToast(res.label + ' 已扩容至 ' + res.capacity[key] + ' 个')
    }).catch(function (err) {
      self._buying = false
      self.showToast(err.message || '兑换失败')
      self.loadShop()
    })
  },

  showToast: function (text) {
    var self = this
    this.clearToast()
    this.setData({ toastText: text })
    this._toastTimer = setTimeout(function () {
      self.setData({ toastText: '' })
    }, 2200)
  },

  clearToast: function () {
    if (this._toastTimer) {
      clearTimeout(this._toastTimer)
      this._toastTimer = null
    }
  }
})
