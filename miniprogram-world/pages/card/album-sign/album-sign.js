var api = require('../../../utils/api')

var EMPTY_ALBUM = {
  tabs: [],
  activeKind: 'real',
  kindLabel: '',
  kindHint: '',
  showReal: true,
  tiles: [],
  isEmpty: true,
  countText: '共 0 张',
  emptyText: '',
  noteText: '',
  remainText: '',
  signBtn: '免费签约',
  signDisabled: true,
  freeLeft: 0,
  freeTotal: 1,
  directedLeft: 0,
  directedText: '',
  membershipTierText: '',
  memberDailyText: '',
  minorText: '',
  unlock8Text: '',
  unlock11Text: '',
  lastSignText: '',
  cityText: ''
}

var POSITION_OPTIONS = [
  { label: '前锋', value: 'FW' },
  { label: '中场', value: 'MF' },
  { label: '后卫', value: 'DF' },
  { label: '门将', value: 'GK' }
]

Page({
  data: {
    album: EMPTY_ALBUM,
    tiles: [],
    activeKind: 'real',
    revealVisible: false,
    revealCard: {},
    revealQuotaText: '',
    toastText: ''
  },

  onShow: function () {
    this.loadAlbum(this.data.activeKind)
  },

  onUnload: function () {
    this.clearToast()
  },

  /** 切换三类卡分区：真实卡保留签约，虚拟卡与自制卡只读。 */
  onSwitchKind: function (e) {
    var key = e.currentTarget.dataset.key
    if (!key || key === this.data.activeKind) return
    this.setData({ activeKind: key })
    this.loadAlbum(key)
  },

  loadAlbum: function (kind) {
    var self = this
    var active = kind || this.data.activeKind || 'real'
    api.getAlbum(active).then(function (view) {
      view.signDisabledClass = view.signDisabled ? 'is-disabled' : ''
      view.directedClass = view.directedLeft > 0 ? '' : 'is-disabled'
      self.setData({ album: view, tiles: view.tiles || [] })
    }).catch(function (err) {
      self.showToast(err.message || '卡册加载失败')
    })
  },

  onSign: function () {
    var self = this
    if (!this.data.album.showReal) return
    if (this._signing) return
    if (this.data.album.signDisabled) {
      this.showToast(this.data.album.remainText || '今日签约次数已用完')
      return
    }
    this._signing = true
    api.signSameCity({ mode: 'free_daily' }).then(function (res) {
      self._signing = false
      self.setData({
        revealVisible: true,
        revealCard: res.card,
        revealQuotaText: '今日剩余 ' + res.signQuota.dailyFreeLeft + ' 次免费签约',
        lastSignedText: '签约成功 · ' + res.card.name
      })
      self.loadAlbum(self.data.activeKind)
    }).catch(function (err) {
      self._signing = false
      self.showToast(err.message || '签约失败')
      self.loadAlbum(self.data.activeKind)
    })
  },

  onDirected: function () {
    var self = this
    if (this.data.album.directedLeft < 1) {
      this.showToast(this.data.album.directedText || '定向签约次数不足')
      return
    }
    var labels = POSITION_OPTIONS.map(function (option) {
      return option.label
    })
    wx.showActionSheet({
      itemList: labels,
      success: function (res) {
        var option = POSITION_OPTIONS[res.tapIndex]
        if (!option) return
        self.performDirected(option)
      }
    })
  },

  performDirected: function (option) {
    var self = this
    if (this._signing) return
    this._signing = true
    api.signSameCity({ mode: 'directed_position', filter: { position: option.value } }).then(function (res) {
      self._signing = false
      self.setData({
        revealVisible: true,
        revealCard: res.card,
        revealQuotaText: '定向剩余 ' + res.signQuota.directedLeft + ' 次',
        lastSignedText: '定向签约成功 · ' + res.card.name
      })
      self.loadAlbum(self.data.activeKind)
    }).catch(function (err) {
      self._signing = false
      self.showToast(err.message || '签约失败')
      self.loadAlbum(self.data.activeKind)
    })
  },

  onRevealClose: function () {
    this.setData({ revealVisible: false })
    this.loadAlbum(this.data.activeKind)
  },

  onRevealLineup: function () {
    this.setData({ revealVisible: false })
    wx.redirectTo({ url: '/pages/card/lineup/lineup' })
  },

  onRevealAgain: function () {
    this.setData({ revealVisible: false })
    this.onSign()
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
