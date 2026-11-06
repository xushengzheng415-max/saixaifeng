// pages/tournament/transfer/player/player.js
// 赛事转会中心 · 球员资料（只读）。合同、效力、身价与谈判状态全部来自服务端，
// 页面不推断自由身、不计算身价；报价与签约表单在下一步接入。
var workspace = require('../../../../utils/workspace')
var model = require('./player-model')

Page({
  data: {
    tournamentId: '',
    teamId: '',
    playerId: '',
    loading: true,
    errorText: '',
    hasPlayer: false,
    name: '',
    badgeText: '',
    hasBadge: false,
    metaText: '',
    teamName: '',
    effectiveText: '',
    contractText: '',
    contractNote: '',
    hasContractNote: false,
    valueText: '',
    valueClass: 'tp-value',
    hasValue: false,
    tierText: '',
    hasTier: false,
    computedText: '',
    hasComputed: false,
    negotiationText: '',
    hasNegotiation: false,
    cooldownText: '',
    hasCooldown: false,
    notes: [],
    hasNotes: false,
    footerNote: '报价、还价与签约入口将在下一步接入，本页只读展示。'
  },

  onLoad: function (options) {
    options = options || {}
    var playerId = String(options.playerId || options.id || '')
    this.setData({
      tournamentId: String(options.tournamentId || ''),
      teamId: String(options.teamId || ''),
      playerId: playerId
    })
    if (!playerId) {
      this.setData({ loading: false, errorText: '缺少球员信息，请返回重试' })
      return
    }
    this.loadPlayer()
  },

  onUnload: function () {
    this._revision = (this._revision || 0) + 1
  },

  onPullDownRefresh: function () {
    return this.loadPlayer().then(function () { wx.stopPullDownRefresh() }).catch(function () { wx.stopPullDownRefresh() })
  },

  loadPlayer: function () {
    var self = this
    var revision = (this._revision || 0) + 1
    this._revision = revision
    this.setData({ loading: true, errorText: '' })
    return wx.cloud.callFunction({
      name: 'dataCenter',
      data: {
        action: 'transferPlayerDetail',
        tournamentId: this.data.tournamentId,
        teamId: this.data.teamId,
        playerId: this.data.playerId
      }
    }).then(function (reply) {
      if (revision !== self._revision) return
      var result = (reply && reply.result) || {}
      if (!result.success) throw new Error(result.message || '球员资料读取失败，请重试')
      self.setData(Object.assign({ loading: false, errorText: '' }, model.playerViewOf(result)))
    }).catch(function (error) {
      if (revision !== self._revision) return
      self.setData({
        loading: false,
        errorText: (error && (error.message || error.errMsg)) || '球员资料读取失败，请重试',
        hasPlayer: false
      })
    })
  },

  onRetry: function () {
    this.loadPlayer()
  },

  back: function () {
    workspace.navigateBackOrHome()
  }
})
