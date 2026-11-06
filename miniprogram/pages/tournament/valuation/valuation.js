// pages/tournament/valuation/valuation.js
// 发现页身价展示（用户 2026-10-26 确认）：只读展示本赛事已审核名单球员的身价。
// 金额、段位与“待评估／不公开”状态全部由服务端预计算，页面不自行判断青少年，也不做任何报价或审核动作。
var workspace = require('../../../utils/workspace')

Page({
  data: {
    tournamentId: '',
    tournamentName: '',
    divisionId: '',
    loading: true,
    loadingMore: false,
    errorText: '',
    items: [],
    hasItems: false,
    totalText: '',
    rosterNote: '',
    hasRosterNote: false,
    emptyText: '',
    showEmpty: false,
    endText: '',
    hasEnd: false,
    canLoadMore: false,
    scrollHeightStyle: ''
  },

  onLoad: function (options) {
    options = options || {}
    var tournamentId = String(options.id || options.tournamentId || '')
    var name = options.name ? decodeURIComponent(options.name) : ''
    this.setData({
      tournamentId: tournamentId,
      tournamentName: name,
      divisionId: String(options.divisionId || '')
    })
    if (tournamentId) {
      this.loadValuations(1)
    } else {
      this.setData({ loading: false, errorText: '缺少赛事信息，请返回重试' })
    }
  },

  onUnload: function () {
    this._revision = (this._revision || 0) + 1
  },

  onPullDownRefresh: function () {
    var self = this
    return this.loadValuations(1).then(function () {
      wx.stopPullDownRefresh()
    }).catch(function () {
      wx.stopPullDownRefresh()
    })
  },

  onReachBottom: function () {
    if (!this.data.canLoadMore || this.data.loadingMore) return
    this.loadValuations((this._page || 1) + 1)
  },

  loadValuations: function (page) {
    var self = this
    var revision = (this._revision || 0) + 1
    this._revision = revision
    var context = workspace.readContext() || {}
    var contextWorkspaceId = (context.currentWorkspace || {}).id || ''
    if (page > 1) this.setData({ loadingMore: true })
    else this.setData({ loading: true, errorText: '', items: [], hasItems: false, showEmpty: false, endText: '', hasEnd: false })
    return wx.cloud.callFunction({
      name: 'getMiniWorkspace',
      data: {
        action: 'tournamentPlayerValuations',
        workspaceId: contextWorkspaceId,
        tournamentId: this.data.tournamentId,
        divisionId: this.data.divisionId,
        page: page,
        pageSize: 20
      }
    }).then(function (reply) {
      if (revision !== self._revision) return
      var currentWorkspaceId = ((workspace.readContext() || {}).currentWorkspace || {}).id || ''
      if (currentWorkspaceId !== contextWorkspaceId) return
      var result = reply.result || {}
      if (!result.success) throw new Error(result.message || '身价读取失败，请重试')
      var incoming = (result.items || []).map(function (item, index) {
        return {
          key: item.playerId + '-' + index,
          playerId: item.playerId,
          name: item.name,
          metaText: [item.teamName, item.divisionName].filter(function (value) { return Boolean(value) }).join(' · '),
          valueText: item.valueText,
          valueClass: item.hasValue ? 'val-value val-value-ready' : (item.isHidden ? 'val-value val-value-hidden' : 'val-value val-value-pending'),
          hasTier: Boolean(item.tierText),
          tierText: item.tierText ? item.tierText + ' 段' : '',
          computedText: item.computedAt ? '测算于 ' + String(item.computedAt).slice(0, 10) : ''
        }
      })
      var merged = page > 1 ? (self.data.items || []).concat(incoming) : incoming
      var pageCount = Number(result.pageCount || 1)
      var currentPage = Number(result.page || page)
      self._page = currentPage
      var state = String(result.state || '')
      var emptyText = result.stateText || '本赛事暂无名单球员'
      var rosterNote = result.rosterState === 'ready' ? '' : '本赛事名单尚未完整登记，展示可能不完整'
      self.setData({
        loading: false,
        loadingMore: false,
        errorText: '',
        items: merged,
        hasItems: merged.length > 0,
        totalText: result.total ? '共 ' + result.total + ' 名名单球员' : '',
        rosterNote: rosterNote,
        hasRosterNote: Boolean(rosterNote),
        showEmpty: merged.length === 0,
        emptyText: emptyText,
        canLoadMore: currentPage < pageCount,
        endText: currentPage >= pageCount && merged.length > 0 ? '已显示全部球员' : '',
        hasEnd: currentPage >= pageCount && merged.length > 0
      })
    }).catch(function (error) {
      if (revision !== self._revision) return
      var message = (error && (error.message || error.errMsg)) || '身价读取失败，请重试'
      if (page > 1) self.setData({ loadingMore: false })
      else self.setData({ loading: false, errorText: message, items: [], hasItems: false, showEmpty: false })
    })
  },

  onRetry: function () {
    this.loadValuations(1)
  },

  back: function () {
    workspace.navigateBackOrHome()
  }
})
