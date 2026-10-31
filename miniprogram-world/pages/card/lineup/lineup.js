var api = require('../../../utils/api')

var EMPTY_LINEUP = {
  rows: [],
  rosterSize: 5,
  filledText: '0 / 5 人',
  pctText: '0%',
  pctWidth: '0%',
  canChallenge: false,
  challengeDisabled: true,
  tip: '',
  size5On: 'is-on',
  size8On: '',
  size11On: '',
  unlock8Class: 'is-locked',
  unlock11Class: 'is-locked',
  unlock8Text: '社区 8 🔒',
  unlock11Text: '城市 11 🔒',
  cityText: ''
}

Page({
  data: {
    lineup: EMPTY_LINEUP,
    rows: [],
    ownedChips: [],
    hasChips: false,
    pickerVisible: false,
    pickerTitle: '',
    activeKey: '',
    toastText: ''
  },

  onShow: function () {
    this.loadLineup()
  },

  onUnload: function () {
    this.clearToast()
  },

  loadLineup: function (activeKey) {
    var self = this
    api.getLineup().then(function (view) {
      self.applyLineup(view, activeKey || '')
    }).catch(function (err) {
      self.showToast(err.message || '阵容加载失败')
    })
  },

  applyLineup: function (view, activeKey) {
    view.challengeClass = view.challengeDisabled ? 'is-disabled' : ''
    this.setData({
      lineup: view,
      rows: view.rows || [],
      activeKey: activeKey || ''
    })
    if (activeKey) this.loadChips()
  },

  loadChips: function () {
    var self = this
    api.getOwnedCards().then(function (chips) {
      var list = chips || []
      self.setData({ ownedChips: list, hasChips: list.length > 0 })
    })
  },

  noop: function () {},

  onSlot: function (e) {
    var key = e.detail && e.detail.key
    if (!key) return
    var lineup = this.data.lineup
    if (lineup.rosterSize !== 5) {
      this.showToast(lineup.tip || '该编制尚未开放')
      return
    }
    var label = ''
    var rows = this.data.rows || []
    for (var i = 0; i < rows.length; i++) {
      for (var j = 0; j < rows[i].cells.length; j++) {
        if (rows[i].cells[j].key === key) label = rows[i].cells[j].label
      }
    }
    this.setData({
      pickerVisible: true,
      pickerTitle: '选择' + (label || '位置') + '球员',
      activeKey: key
    }, function () {
      this.loadChips()
    }.bind(this))
  },

  onPick: function (e) {
    var playerId = e.currentTarget.dataset.id
    if (!playerId) return
    var self = this
    var key = this.data.activeKey
    api.setSlot(key, playerId).then(function (view) {
      self.setData({ pickerVisible: false })
      self.applyLineup(view, key)
    }).catch(function (err) {
      self.showToast(err.message || '该球员不能放到这个位置')
    })
  },

  onRemoveSlot: function () {
    var self = this
    var key = this.data.activeKey
    api.setSlot(key, '').then(function (view) {
      self.setData({ pickerVisible: false })
      self.applyLineup(view, key)
    }).catch(function (err) {
      self.showToast(err.message || '移除失败')
    })
  },

  onClosePicker: function () {
    this.setData({ pickerVisible: false })
  },

  onChangeSize: function (e) {
    var size = parseInt(e.currentTarget.dataset.size, 10)
    if (!size || size === this.data.lineup.rosterSize) return
    var self = this
    api.setRosterSize(size).then(function (view) {
      self.applyLineup(view, '')
    }).catch(function (err) {
      self.showToast(err.message || '该编制尚未解锁')
    })
  },

  onSave: function () {
    var self = this
    api.saveLineup(null).then(function () {
      self.showToast('阵容已保存')
      self.loadLineup('')
    }).catch(function (err) {
      self.showToast(err.message || '阵容未完成')
    })
  },

  onChallenge: function () {
    if (this.data.lineup.challengeDisabled) {
      this.showToast(this.data.lineup.tip || '阵容未完成')
      return
    }
    wx.navigateTo({ url: '/pages/card/battle/battle' })
  },

  goLog: function () {
    wx.navigateTo({ url: '/pages/card/battle-log/battle-log' })
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
