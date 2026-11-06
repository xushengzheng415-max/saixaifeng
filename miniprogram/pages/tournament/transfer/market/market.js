// pages/tournament/transfer/market/market.js
// 赛事转会中心 · 转会市场（用户 2026-10-26：在赛事详情里直接开转会中心）。
// 页面只负责查询与展示：窗口状态、合同状态、球员资料全部由服务端返回，页面不自行判定
// 是否可报价、是否自由身，也不在本页写任何转会数据。
var workspace = require('../../../../utils/workspace')
var model = require('./market-model')

Page({
  data: {
    tournamentId: '',
    tournamentName: '',
    teamId: '',
    divisionId: '',
    loading: true,
    loadingMore: false,
    errorText: '',
    items: [],
    hasItems: false,
    totalText: '',
    emptyText: '本赛事暂无公开球员资料',
    showEmpty: false,
    endText: '',
    hasEnd: false,
    canLoadMore: false,
    keyword: '',
    hasKeyword: false,
    chips: model.chipsOf(''),
    windowText: '',
    windowNote: '',
    windowClass: 'tc-window',
    hasWindow: false,
    noteText: '',
    hasNote: false
  },

  onLoad: function (options) {
    options = options || {}
    var tournamentId = String(options.tournamentId || options.id || '')
    this._state = ''
    this.setData({
      tournamentId: tournamentId,
      tournamentName: options.name ? decodeURIComponent(options.name) : '',
      teamId: String(options.teamId || ''),
      divisionId: String(options.divisionId || '')
    })
    if (!tournamentId) {
      this.setData({ loading: false, errorText: '缺少赛事信息，请从赛事详情进入转会中心' })
      return
    }
    this.loadWindow()
    this.loadMarket(1)
  },

  onUnload: function () {
    this._revision = (this._revision || 0) + 1
    if (this._debounce) clearTimeout(this._debounce)
  },

  onPullDownRefresh: function () {
    return Promise.all([this.loadWindow(), this.loadMarket(1)]).then(function () {
      wx.stopPullDownRefresh()
    }).catch(function () {
      wx.stopPullDownRefresh()
    })
  },

  onReachBottom: function () {
    if (!this.data.canLoadMore || this.data.loadingMore) return
    this.loadMarket((this._page || 1) + 1)
  },

  // 窗口状态只有主办或本队管理者可读；读不到时保留提示，不伪造开放状态。
  loadWindow: function () {
    var self = this
    return wx.cloud.callFunction({
      name: 'dataCenter',
      data: { action: 'transferWindowGet', tournamentId: this.data.tournamentId, teamId: this.data.teamId }
    }).then(function (reply) {
      var result = (reply && reply.result) || {}
      if (!result.success) throw new Error(result.message || '窗口状态读取失败')
      var view = model.windowViewOf(result)
      var notes = (result.notes || []).filter(function (text) { return Boolean(text) })
      self.setData({
        hasWindow: view.hasWindow,
        windowText: view.windowText,
        windowNote: view.windowNote,
        windowClass: view.windowClass,
        noteText: notes.join('；'),
        hasNote: notes.length > 0
      })
    }).catch(function () {
      var view = model.WINDOW_UNKNOWN
      self.setData({ hasWindow: view.hasWindow, windowText: view.windowText, windowNote: view.windowNote, windowClass: view.windowClass })
    })
  },

  loadMarket: function (page) {
    var self = this
    var revision = (this._revision || 0) + 1
    this._revision = revision
    if (page > 1) this.setData({ loadingMore: true })
    else this.setData({ loading: true, errorText: '', items: [], hasItems: false, showEmpty: false, endText: '', hasEnd: false })
    return wx.cloud.callFunction({
      name: 'dataCenter',
      data: {
        action: 'transferMarket',
        tournamentId: this.data.tournamentId,
        keyword: this.data.keyword,
        state: this._state || '',
        page: page,
        pageSize: 20
      }
    }).then(function (reply) {
      if (revision !== self._revision) return
      var result = (reply && reply.result) || {}
      if (!result.success) throw new Error(result.message || '球员资料读取失败，请重试')
      var incoming = (result.items || []).map(model.rowOf)
      var merged = page > 1 ? (self.data.items || []).concat(incoming) : incoming
      var pageCount = Number(result.pageCount || 1)
      var currentPage = Number(result.page || page)
      self._page = currentPage
      self.setData({
        loading: false,
        loadingMore: false,
        errorText: '',
        items: merged,
        hasItems: merged.length > 0,
        totalText: result.total ? '共 ' + result.total + ' 名球员' : '',
        showEmpty: merged.length === 0,
        emptyText: model.emptyTextOf(self.data.keyword, result.marketState),
        canLoadMore: currentPage < pageCount,
        endText: currentPage >= pageCount && merged.length > 0 ? '已显示全部球员' : '',
        hasEnd: currentPage >= pageCount && merged.length > 0
      })
    }).catch(function (error) {
      if (revision !== self._revision) return
      var message = (error && (error.message || error.errMsg)) || '球员资料读取失败，请重试'
      if (page > 1) self.setData({ loadingMore: false })
      else self.setData({ loading: false, errorText: message, items: [], hasItems: false, showEmpty: false })
    })
  },

  onSearchInput: function (event) {
    var value = String((event.detail || {}).value || '')
    this.setData({ keyword: value, hasKeyword: value !== '' })
    var self = this
    if (this._debounce) clearTimeout(this._debounce)
    this._debounce = setTimeout(function () { self.loadMarket(1) }, 400)
  },

  onSearchConfirm: function () {
    if (this._debounce) clearTimeout(this._debounce)
    this.loadMarket(1)
  },

  onClearKeyword: function () {
    if (this._debounce) clearTimeout(this._debounce)
    this.setData({ keyword: '', hasKeyword: false })
    this.loadMarket(1)
  },

  onStateTap: function (event) {
    var key = String((event.currentTarget.dataset || {}).state || '')
    this._state = key
    this.setData({ chips: model.chipsOf(key) })
    this.loadMarket(1)
  },

  onOpenPlayer: function (event) {
    var playerId = String((event.currentTarget.dataset || {}).id || '')
    if (!playerId) return
    wx.navigateTo({
      url: '/pages/tournament/transfer/player/player?tournamentId=' + encodeURIComponent(this.data.tournamentId)
        + '&teamId=' + encodeURIComponent(this.data.teamId)
        + '&playerId=' + encodeURIComponent(playerId)
    })
  },

  onRetry: function () {
    this.loadMarket(1)
  },

  back: function () {
    workspace.navigateBackOrHome()
  }
})
