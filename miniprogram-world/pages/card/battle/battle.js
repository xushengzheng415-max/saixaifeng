var api = require('../../../utils/api')

var EMPTY_RESULT = {
  battleId: '',
  scoreMine: '',
  scoreOpp: '',
  result: '',
  comment: '',
  resultText: '',
  resultClass: '',
  badges: [],
  deterministicKey: '',
  opponentLabel: '',
  myPowerText: '',
  oppPowerText: ''
}

var BADGE_TEXT = {
  'light-challenge': '轻对战',
  dominant: '分差明显',
  'solid-gk': '门将到岗'
}

function flattenNames(rows) {
  var names = []
  var list = rows || []
  for (var i = 0; i < list.length; i++) {
    var cells = list[i].cells || []
    for (var j = 0; j < cells.length; j++) {
      var cell = cells[j]
      if (!cell.filled) continue
      names.push({
        key: cell.key,
        name: cell.name,
        numberText: cell.numberText,
        positionLabel: cell.label
      })
    }
  }
  return names
}

Page({
  data: {
    loading: true,
    isVs: true,
    isResult: false,
    result: EMPTY_RESULT,
    myNames: [],
    oppNames: [],
    opponentLabel: '',
    toastText: ''
  },

  onLoad: function () {
    this.fight()
  },

  onUnload: function () {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
  },

  fight: function () {
    var self = this
    this.clearTimer()
    this.setData({ loading: true, isVs: true, isResult: false })
    api.battle().then(function (res) {
      var badges = (res.badges || []).map(function (key) {
        return { key: key, text: BADGE_TEXT[key] || key }
      })
      var resultText = res.result === 'win' ? '胜' : (res.result === 'lose' ? '负' : '平')
      var resultClass = res.result === 'win' ? 'is-win' : (res.result === 'lose' ? 'is-lose' : 'is-draw')
      self.setData({
        loading: false,
        myNames: flattenNames(res.myRows),
        oppNames: flattenNames(res.opponentRows),
        opponentLabel: res.opponentLabel,
        myPowerText: '阵容战力 ' + res.myPower,
        oppPowerText: '阵容战力 ' + res.oppPower,
        result: {
          battleId: res.battleId,
          scoreMine: res.scoreMine,
          scoreOpp: res.scoreOpp,
          result: res.result,
          comment: res.comment,
          resultText: resultText,
          resultClass: resultClass,
          badges: badges,
          deterministicKey: res.deterministicKey,
          opponentLabel: res.opponentLabel,
          myPowerText: '阵容战力 ' + res.myPower,
          oppPowerText: '阵容战力 ' + res.oppPower
        }
      })
      self._timer = setTimeout(function () {
        self._timer = null
        self.setData({ isVs: false, isResult: true })
      }, 1500)
    }).catch(function (err) {
      self.setData({ loading: false })
      self.showToast(err.message || '发起对战失败')
      setTimeout(function () {
        wx.navigateBack()
      }, 1200)
    })
  },

  onAgain: function () {
    this.fight()
  },

  onLog: function () {
    wx.navigateTo({ url: '/pages/card/battle-log/battle-log' })
  },

  onBack: function () {
    var pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
    } else {
      wx.redirectTo({ url: '/pages/card/lineup/lineup' })
    }
  },

  onShareAppMessage: function () {
    var result = this.data.result || {}
    return {
      title: '我在赛小蜂足球世界打完一场轻对战：' + (result.scoreMine || 0) + ' - ' + (result.scoreOpp || 0),
      path: '/pages/card/main/main'
    }
  },

  clearTimer: function () {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
  },

  showToast: function (text) {
    var self = this
    if (this._toastTimer) clearTimeout(this._toastTimer)
    this.setData({ toastText: text })
    this._toastTimer = setTimeout(function () {
      self.setData({ toastText: '' })
    }, 2200)
  }
})
