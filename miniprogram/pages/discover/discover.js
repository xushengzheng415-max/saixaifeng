// pages/discover/discover.js
// 发现一级页：动态／赛事／约球共用同一路由，默认动态
// 约束：
// 1. WXML 只做简单插值、简单取反和简单或；比较、标签、筛选、按钮状态全部在这里预计算；
// 2. 只展示已接通的数据：本人记录的友谊赛战报、当前账号可访问的赛事；
// 3. 公开动态流、关注关系、公开邀约列表、转会市场尚未接入时单列为未接入状态，不用示例数据冒充。

var workspace = require('../../utils/workspace')
var model = require('./discover-model')

var FRIENDLY_COLLECTION = 'friendly_matches'
var FEED_PAGE_SIZE = 8
// getTournamentList 服务端分页，单页 20 条；客户端上滑续页
var EVENT_PAGE_SIZE = 20
// 筛选/搜索在已加载数据上生效，命中为空时最多自动续取 3 页，不静默截断
var EVENT_AUTO_PAGES = 3
var TAB_BAR_INDEX = 3

Page({
  data: {
    headerStyle: '',

    // 身份与上下文
    isGuest: true,
    hasTeam: false,
    isOrganizer: false,
    teamId: '',
    teamName: '',
    teamLogo: '',
    canWrite: false,
    // 城市取球队资料里登记的「所在城市」，不是手机定位；未登记时由 cityRegistered 控制文案与补充入口
    cityText: '城市待定',
    cityRegistered: false,
    guestNoticeText: '',
    showGuestNotice: false,

    // 顶部查询与主操作
    keyword: '',
    hasKeyword: false,
    // 查询只在动态与赛事栏生效：约球与转会没有对应检索接口，输入框直接禁用，避免输入后“看起来能搜其实不生效”
    searchPlaceholder: '搜索动态',
    searchDisabled: false,
    searchBoxClass: 'search-box',
    recordBtnClass: 'record-btn-disabled',

    // 页签
    activeTab: 'feed',
    tabs: model.buildTabs('feed'),
    isFeedTab: true,
    isEventTab: false,
    isInviteTab: false,
    chips: model.buildChips(model.FEED_FILTER_DEFS, 'all'),
    showFilterRow: true,
    showPublishEntry: true,
    publishMenuVisible: false,

    // 动态
    feedFilter: 'all',
    feedItems: [],
    hasFeedItems: false,
    feedNoticeText: '',
    feedRefreshText: '',
    feedEndText: '',
    feedLoading: false,
    feedStateVisible: false,
    feedStateTitle: '',
    feedStateDesc: '',
    feedStateAction: '',
    feedStateActionText: '',
    feedStateHasAction: false,

    // 赛事
    eventFilter: 'all',
    eventItems: [],
    hasEventItems: false,
    eventRefreshText: '',
    eventEndText: '',
    eventLoading: false,
    eventStateVisible: false,
    eventStateTitle: '',
    eventStateDesc: '',
    eventStateAction: '',
    eventStateActionText: '',
    eventStateHasAction: false,

    // 约球
    inviteBtnClass: 'invite-btn-disabled',
    // 约球范围：本队邀约 / 跨队公开约球（2026-10-27 用户确认公开）
    inviteScope: 'team',
    isTeamInviteScope: true,
    isPublicInviteScope: false,
    inviteScopes: [
      { id: 'team', text: '本队约球', itemClass: 'scope-item-active' },
      { id: 'public', text: '公开约球', itemClass: '' }
    ],
    publicCityText: '全部城市',
    publicCityOnly: true,
    publicCityToggleText: '查看全部城市',
    publicCityToggleDisabled: false,
    publicItems: [],
    hasPublicItems: false,
    publicNoticeText: '',
    publicRefreshText: '',
    publicEndText: '',
    publicLoading: false,
    publicStateVisible: false,
    publicStateTitle: '',
    publicStateDesc: '',
    publicStateAction: '',
    publicStateActionText: '',
    publicStateHasAction: false,
    inviteItems: [],
    hasInviteItems: false,
    inviteNoticeText: '',
    inviteRefreshText: '',
    inviteEndText: '',
    inviteLoading: false,
    inviteStateVisible: true,
    inviteStateTitle: '暂无约球邀约',
    inviteStateDesc: '',
    inviteStateAction: '',
    inviteStateActionText: '',
    inviteStateHasAction: false,

    // 转会：发现根目录的独立分栏，定位为「公开转会市场」（2026-10-27 用户确认，按原型落地）：
    // 聚合各赛事已完成的公开转会、平台身价榜与上升最快；报价、合同与审核仍在赛事转会中心。
    isTransferTab: false,
    isTransferTabClass: '',
    transferPrimaryText: '我的赛事转会中心',
    transferPrimaryDescText: '报价与合同在赛事内办理',
    transferLoaded: false,
    transferKeyword: '',
    // 范围筛选（2026-10-27 用户确认）：榜单按赛事出榜，再按年龄段（赛事竞赛组别 U8/U10…）细分，
    // 不是抽签小组；时间范围接口尚未接入，点击只做说明，不放假按钮
    transferScopeChips: model.showcaseScopeChips({}),
    transferScopeNoteText: '当前为全平台口径；按赛事查看可看到该赛事已审核名单内的全部球员与转会，时间范围筛选暂未接入。',
    // 范围选择面板：赛事列表 / 年龄段列表，选中后重新读取该范围
    transferScopeSheetVisible: false,
    transferScopeSheetKey: '',
    transferScopeSheetTitle: '',
    transferScopeSheetDesc: '',
    transferScopeOptions: [],
    // 转会焦点：最近一条已完成的公开转会
    transferFocus: {},
    showTransferFocus: false,
    // 转会动态：焦点与其余记录合并成一个列表，没有记录时只留一个空态
    transferDynamicItems: [],
    hasTransferDynamic: false,
    showTransferDynamicEmpty: false,
    transferDynamicEmptyText: '暂无公开转会，完成后在此官宣',
    transferCountText: '',
    // 身价榜：最新身价 / 上升最快 在同一张卡内切换，口径由服务端按当前赛事与年龄段给出
    transferRankRows: [],
    transferRankTab: 'top',
    transferRankTabTopClass: 'rank-tab rank-tab-active',
    transferRankTabRisingClass: 'rank-tab',
    hasTransferRank: false,
    showTransferRankEmpty: true,
    transferRankEmptyText: '暂无身价快照，平台测算后在此展示',
    transferRankFootText: '全平台 · 最新测算',
    transferTopEmptyText: '暂无身价快照，平台测算后在此展示',
    transferRankScopeLabel: '全平台',
    transferRankScopeNote: '当前为全平台口径，只统计已完成身价测算的球员；选择赛事可看到该赛事已审核名单内的全部球员（含未测算）。',
    transferRisingEmptyText: '暂无可比的上一次身价',
    // 球员身价 + 位置筛选（球队／组别筛选未接入，不展示为可用条件）
    transferPlayers: [],
    hasTransferPlayers: false,
    showTransferPlayerEmpty: false,
    transferPlayerEmptyText: '暂无完成身价测算的球员，平台测算后在此展示',
    transferPlayerEndText: '',
    transferMoreVisible: false,
    transferMoreLoading: false,
    transferMoreText: '加载更多球员',
    transferMoreError: '',
    transferFilterOpen: false,
    transferFilterToggleText: '筛选查询',
    transferPositionChips: [],
    transferPositionKey: 'all',
    transferContentVisible: true,
    transferFootnoteText: '平台只记录公开的已完成转会，不收款、不托管、不结算；成人成交金额公开，青少年成交金额不公开。',

    // 页面级错误
    showPageError: false,
    pageErrorText: ''
  },

  onLoad: function () {
    var rect = typeof wx.getMenuButtonBoundingClientRect === 'function' ? wx.getMenuButtonBoundingClientRect() : null
    var info = typeof wx.getSystemInfoSync === 'function' ? wx.getSystemInfoSync() : {}
    var top = rect && rect.top ? rect.top : (info.statusBarHeight || 24) + 6
    this.setData({ headerStyle: 'padding-top:' + top + 'px;' })
    this._scrollByTab = {}
    this._pageScrollTop = 0
    this._feedItems = []
    this._feedOffset = 0
    this._feedNoMore = false
    this._feedLoaded = false
    this._feedLoading = false
    // 公开赛事目录：服务端分页 + 客户端类别筛选
    this._eventRows = []
    this._eventPage = 0
    this._eventNoMore = false
    this._eventLoading = false
    this._eventSeq = 0
    this._eventAutoPages = 0
    this._eventFilteredCount = 0
    // 本队约球邀约
    this._inviteItems = []
    this._inviteLoaded = false
    this._inviteLoading = false
    this._inviteSeq = 0
    // 跨队公开约球（按城市筛选，函数内分页）
    this._publicItems = []
    this._publicOffset = 0
    this._publicNoMore = false
    this._publicLoading = false
    this._publicSeq = 0
    // 转会公开市场：首屏取焦点、榜单与动态；球员用服务端游标续页，位置筛选作用于已加载行。
    this._transferLoaded = false
    this._transferLoading = false
    this._transferSeq = 0
    this._transferPlayerSource = []
    this._transferCursor = ''
    this._transferHasMore = false
    this._transferPoolVersion = ''
    this._transferPositionKey = 'all'
    // 当前范围：赛事与年龄段（竞赛组别）；赛事列表与年龄段列表来自上一次回包
    this._transferTournamentId = ''
    this._transferAgeGroupId = ''
    this._transferAgeGroups = []
    this._transferEventOptions = []
    this._transferSheetScope = ''
    this._cityCache = {}
    this._scopeKey = ''
    this._feedSeq = 0
    this._citySeq = 0
  },

  onShow: function () {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().syncFromPage(TAB_BAR_INDEX)
    }
    this.refresh()
  },

  onPullDownRefresh: function () {
    var that = this
    this.refresh().then(function () {
      wx.stopPullDownRefresh()
    })
  },

  onReachBottom: function () {
    var tab = this.data.activeTab
    if (tab === 'transfer') {
      if (this._transferHasMore) this.loadTransfer('more')
      return
    }
    if (tab === 'feed') {
      if (!this.data.hasFeedItems || this.data.feedFilter !== 'all') return
      this.loadFeed('more')
      return
    }
    if (tab === 'events') {
      if (this._eventNoMore) return
      this.loadEvents('more')
      return
    }
    // 公开约球按 offset 续页；本队约球一次取回最多 30 条，不做续页
    if (tab === 'invites' && this.data.isPublicInviteScope) {
      if (this._publicNoMore || this._publicLoading) return
      this.loadPublicInvites('more')
    }
  },

  onPageScroll: function (event) {
    this._pageScrollTop = Number((event && event.scrollTop) || 0)
  },

  // ===== 上下文与身份 =====
  ensureContext: function () {
    var context = workspace.readContext()
    if (context) return Promise.resolve(context)
    if (!workspace.hasAuthenticatedUser()) return Promise.resolve(null)
    return workspace.loadContext().then(function (next) {
      return next || workspace.readContext()
    })
  },

  refresh: function () {
    var that = this
    return this.ensureContext().then(function (context) {
      that.setData({ showPageError: false, pageErrorText: '' })
      var changed = that.applyContext(context)
      if (changed) {
        that.resetCaches()
        // resetCaches 会作废进行中的城市请求（切号/换队后旧回包不能再用），这里补一次真实读取
        if (that.data.teamId) that.loadTeamCity(context, that.data.teamId, true)
      }
      return that.loadActiveTab(changed ? 'init' : 'refresh')
    }).catch(function (error) {
      that.setData({
        showPageError: true,
        pageErrorText: (error && (error.message || error.errMsg)) || '发现页加载失败，请下拉刷新重试'
      })
    })
  },

  applyContext: function (context) {
    this._context = context || null
    if (!context) {
      var guestChanged = this._scopeKey !== 'guest'
      this._scopeKey = 'guest'
      this.setData({
        isGuest: true,
        hasTeam: false,
        isOrganizer: false,
        teamId: '',
        teamName: '',
        teamLogo: '',
        canWrite: false,
        cityText: model.cityText(''),
        cityRegistered: false,
        recordBtnClass: 'record-btn-disabled',
        showGuestNotice: true,
        guestNoticeText: '游客浏览模式：发布、评论、发起约球与记分需要先登录。'
      })
      return guestChanged
    }
    var role = workspace.getPortalRole(context)
    var isOrganizer = role === 'organizer'
    var team = isOrganizer ? null : model.pickTeam(context)
    var teamId = team ? String(team.id || team._id || '') : ''
    var current = context.currentWorkspace || {}
    // 记一场/发布/约球都写入球队数据，只给具备 team.manage 的球队管理者开关，不能只凭“能看到球队”放行
    var canWrite = Boolean(team) && workspace.hasPermission('team.manage', context)
    var key = String(context.accountKey || '') + '|' + String(current.id || '') + '|' + teamId + '|' + role
    var changed = this._scopeKey !== key
    this._scopeKey = key
    var cachedCity = (this._cityCache && this._cityCache[teamId]) || ''
    this.setData({
      isGuest: false,
      hasTeam: Boolean(team),
      isOrganizer: isOrganizer,
      teamId: teamId,
      teamName: team ? (String(team.name || team.teamName || '') || '本队') : '',
      teamLogo: team ? (String(team.logo || team.teamLogo || '') || '/images/logo.png') : '',
      canWrite: canWrite,
      recordBtnClass: canWrite ? 'record-btn-ready' : 'record-btn-disabled',
      showGuestNotice: false,
      guestNoticeText: '',
      cityText: model.cityText(cachedCity, '本队城市未登记'),
      cityRegistered: Boolean(cachedCity)
    })
    // 身份/球队发生变化时由 refresh 在 resetCaches 之后重读，避免请求先发出再被 resetCaches 作废
    if (!changed) this.loadTeamCity(context, teamId, this._cityForce === true)
    return changed
  },

  // 城市只用于头部上下文；取球队资料登记的所在城市，读取失败保持待定，不补造、不调用定位
  loadTeamCity: function (context, teamId, force) {
    if (!teamId || !wx.cloud) return
    this._cityCache = this._cityCache || {}
    if (!force && Object.prototype.hasOwnProperty.call(this._cityCache, teamId)) return
    this._cityForce = false
    var that = this
    var seq = ++this._citySeq
    wx.cloud.callFunction({
      name: 'getMiniWorkspace',
      data: {
        action: 'teamProfile',
        workspaceId: String(((context || {}).currentWorkspace || {}).id || ''),
        teamId: teamId
      }
    }).then(function (response) {
      if (seq !== that._citySeq) return
      var result = (response && response.result) || {}
      if (!result.success) return
      var city = String(((result.profile || {}).city) || '')
      that._cityCache[teamId] = city
      if (that.data.teamId === teamId) {
        that.setData({ cityText: model.cityText(city, '本队城市未登记'), cityRegistered: Boolean(city) })
      }
    }).catch(function (error) {
      console.warn('[discover] 城市读取失败', error && (error.errMsg || error.message))
    })
  },

  resetCaches: function () {
    this._feedItems = []
    this._feedOffset = 0
    this._feedNoMore = false
    this._feedLoaded = false
    this._feedLoading = false
    this._eventRows = []
    this._eventPage = 0
    this._eventNoMore = false
    this._eventLoading = false
    this._eventAutoPages = 0
    this._eventFilteredCount = 0
    this._inviteItems = []
    this._inviteLoaded = false
    this._inviteLoading = false
    this._publicItems = []
    this._publicOffset = 0
    this._publicNoMore = false
    this._publicLoading = false
    this._transferLoaded = false
    this._transferLoading = false
    this._transferPlayerSource = []
    this._transferPositionKey = 'all'
    // 切号后范围回到全平台，不沿用上一个身份的赛事筛选
    this._transferCursor = ''
    this._transferHasMore = false
    this._transferPoolVersion = ''
    this._transferTournamentId = ''
    this._transferAgeGroupId = ''
    this._transferAgeGroups = []
    this._transferEventOptions = []
    this._transferSheetScope = ''
    // 账号或球队切换后不沿用上一个身份的球队城市缓存，并让旧请求返回结果失效
    this._cityCache = {}
    this._feedSeq = (this._feedSeq || 0) + 1
    this._citySeq = (this._citySeq || 0) + 1
    this._eventSeq = (this._eventSeq || 0) + 1
    this._inviteSeq = (this._inviteSeq || 0) + 1
    this._publicSeq = (this._publicSeq || 0) + 1
    this._transferSeq = (this._transferSeq || 0) + 1
    this.setData({
      feedItems: [],
      hasFeedItems: false,
      feedNoticeText: '',
      feedRefreshText: '',
      feedEndText: '',
      eventItems: [],
      hasEventItems: false,
      eventRefreshText: '',
      eventEndText: '',
      inviteItems: [],
      hasInviteItems: false,
      inviteNoticeText: '',
      inviteRefreshText: '',
      inviteEndText: '',
      publicItems: [],
      hasPublicItems: false,
      publicNoticeText: '',
      publicRefreshText: '',
      publicEndText: '',
      publicLoading: false,
      transferLoaded: false,
      transferScopeChips: model.showcaseScopeChips({}),
      transferScopeNoteText: '当前为全平台口径；按赛事查看可看到该赛事已审核名单内的全部球员与转会，时间范围筛选暂未接入。',
      transferScopeSheetVisible: false,
      transferScopeSheetKey: '',
      transferScopeSheetTitle: '',
      transferScopeSheetDesc: '',
      transferScopeOptions: [],
      transferFocus: {},
      showTransferFocus: false,
      transferDynamicItems: [],
      hasTransferDynamic: false,
      showTransferDynamicEmpty: false,
      transferDynamicEmptyText: '暂无公开转会，完成后在此官宣',
      transferCountText: '',
      transferRankRows: [],
      transferRankTab: 'top',
      transferRankTabTopClass: 'rank-tab rank-tab-active',
      transferRankTabRisingClass: 'rank-tab',
      hasTransferRank: false,
      showTransferRankEmpty: true,
      transferRankEmptyText: '暂无身价快照，平台测算后在此展示',
      transferRankFootText: '全平台 · 最新测算',
      transferRankScopeLabel: '全平台',
      transferRankScopeNote: '当前为全平台口径，只统计已完成身价测算的球员；选择赛事可看到该赛事已审核名单内的全部球员（含未测算）。',
      transferPlayers: [],
      hasTransferPlayers: false,
      showTransferPlayerEmpty: false,
      transferPlayerEndText: '',
      transferMoreVisible: false,
      transferMoreLoading: false,
      transferMoreText: '加载更多球员',
      transferMoreError: '',
      transferKeyword: '',
      transferPositionChips: [],
      transferPositionKey: 'all',
      transferFilterOpen: false,
      transferFilterToggleText: '筛选查询',
      transferContentVisible: true,
      // 空态文案回到全平台口径，切换赛事后由回包覆盖
      transferTopEmptyText: '暂无身价快照，平台测算后在此展示',
      transferRisingEmptyText: '暂无可比的上一次身价',
      transferPlayerEmptyText: '暂无完成身价测算的球员，平台测算后在此展示',
      publishMenuVisible: false
    })
  },

  // ===== 状态面板：loading / empty / error / blocked / ready =====
  setTabState: function (prefix, options) {
    options = options || {}
    var state = String(options.state || 'ready')
    var visible = state === 'loading' || state === 'empty' || state === 'error' || state === 'blocked'
    var action = visible ? String(options.action || '') : ''
    var patch = {}
    patch[prefix + 'StateVisible'] = visible
    patch[prefix + 'StateTitle'] = visible ? String(options.title || '') : ''
    patch[prefix + 'StateDesc'] = visible ? String(options.desc || '') : ''
    patch[prefix + 'StateAction'] = action
    patch[prefix + 'StateActionText'] = action ? String(options.actionText || '') : ''
    patch[prefix + 'StateHasAction'] = Boolean(action)
    this.setData(patch)
  },

  loadActiveTab: function (mode) {
    var tab = this.data.activeTab
    if (tab === 'events') return this.loadEvents(mode)
    if (tab === 'invites') {
      return this.data.isPublicInviteScope ? this.loadPublicInvites(mode) : this.loadInvites(mode)
    }
    // 转会栏是公开展示端：最高身价、上升最快与已完成转会动态，来自 dataCenter 只读投影
    if (tab === 'transfer') return this.loadTransfer(mode)
    return this.loadFeed(mode === 'more' ? 'more' : (mode === 'init' ? 'init' : 'refresh'))
  },

  // ===== 动态 =====
  loadFeed: function (mode) {
    var that = this
    var data = this.data
    if (data.isGuest) {
      this.applyGuestFeed()
      return Promise.resolve()
    }
    if (data.feedFilter !== 'all') {
      this.applyFeedFilterState()
      return Promise.resolve()
    }
    if (!wx.cloud) {
      this.setTabState('feed', { state: 'error', title: '动态加载失败', desc: '当前环境不支持读取动态数据。', action: 'retry', actionText: '重新加载' })
      return Promise.resolve()
    }
    if (this._feedLoading) return Promise.resolve()
    if (mode === 'more' && this._feedNoMore) return Promise.resolve()
    var userId = String(((this._context || {}).user || {}).id || ((this._context || {}).user || {})._id || '')
    if (!userId) {
      this.setTabState('feed', { state: 'error', title: '动态加载失败', desc: '登录状态已变化，请下拉刷新后重试。', action: 'retry', actionText: '重新加载' })
      return Promise.resolve()
    }
    var db = wx.cloud.database()
    var offset = mode === 'more' ? this._feedOffset : 0
    // 刷新时按已加载条数重取首屏（客户端 limit 上限 20），避免从战报页返回后列表塌回一屏、滚动位置丢失
    var limitSize = FEED_PAGE_SIZE
    if (mode !== 'more' && data.feedItems.length) {
      limitSize = Math.min(20, Math.max(FEED_PAGE_SIZE, data.feedItems.length))
    }
    var seq = ++this._feedSeq
    this._feedLoading = true
    if (!data.feedItems.length) {
      this.setTabState('feed', { state: 'loading', title: '正在加载动态…' })
      this.setData({ feedRefreshText: '' })
    } else {
      this.setTabState('feed', { state: 'ready' })
      this.setData({ feedRefreshText: mode === 'more' ? '正在加载更多…' : '正在刷新…' })
    }
    return db.collection(FRIENDLY_COLLECTION)
      .where({ recordedByUserId: userId })
      .orderBy('endedAt', 'desc')
      .skip(offset)
      .limit(limitSize)
      .get()
      .then(function (res) {
        if (seq !== that._feedSeq) return
        that._feedLoading = false
        var rows = (res && res.data) || []
        var items = rows.map(function (row) { return model.formatReport(row) })
        that._feedItems = mode === 'more' ? that.mergeFeed(that._feedItems, items) : items
        that._feedOffset = offset + rows.length
        that._feedNoMore = rows.length < limitSize
        that._feedLoaded = true
        that.renderFeed()
      })
      .catch(function (error) {
        if (seq !== that._feedSeq) return
        that._feedLoading = false
        var message = String((error && (error.errMsg || error.message)) || '')
        that.setData({ feedRefreshText: '' })
        that.setTabState('feed', {
          state: 'error',
          title: '动态加载失败',
          desc: message || '请检查网络后重试；未接入的公开动态不会用示例内容填充。',
          action: 'retry',
          actionText: '重新加载'
        })
      })
  },

  mergeFeed: function (current, incoming) {
    var source = current || []
    var seen = {}
    var result = []
    var i
    for (i = 0; i < source.length; i += 1) {
      var item = source[i]
      if (!item || seen[item.key]) continue
      seen[item.key] = true
      result.push(item)
    }
    for (i = 0; i < (incoming || []).length; i += 1) {
      var next = incoming[i]
      if (!next || seen[next.key]) continue
      seen[next.key] = true
      result.push(next)
    }
    return result
  },

  renderFeed: function () {
    var data = this.data
    if (data.isGuest) {
      this.applyGuestFeed()
      return
    }
    if (data.feedFilter !== 'all') {
      this.applyFeedFilterState()
      return
    }
    var filtered = model.matchKeyword(this._feedItems || [], data.keyword, model.FEED_SEARCH_FIELDS)
    var patch = {
      feedItems: filtered,
      hasFeedItems: filtered.length > 0,
      feedLoading: false,
      feedRefreshText: '',
      feedNoticeText: '',
      feedEndText: ''
    }
    if (filtered.length) {
      patch.feedNoticeText = '公开动态服务尚未接入 · 以下仅为你本人记录的场次'
      if (this._feedNoMore && !data.hasKeyword) patch.feedEndText = '没有更多了'
    }
    this.setData(patch)
    if (filtered.length) {
      this.setTabState('feed', { state: 'ready' })
      return
    }
    if (data.hasKeyword) {
      this.setTabState('feed', {
        state: 'empty',
        title: '暂无匹配动态',
        desc: '换个关键词试试，或清空搜索查看全部记录。',
        action: 'clear',
        actionText: '清空搜索'
      })
      return
    }
    if (data.canWrite) {
      this.setTabState('feed', {
        state: 'empty',
        title: '暂无球队动态',
        desc: '公开动态服务尚未接入，当前仅显示你本人记录的场次。',
        action: 'record',
        actionText: '去记一场'
      })
      return
    }
    if (data.isOrganizer) {
      this.setTabState('feed', {
        state: 'empty',
        title: '暂无球队动态',
        desc: '当前为赛事组织者身份，不写入球队动态。切换到球队管理者后可记录友谊赛。',
        action: 'profile',
        actionText: '去切换身份'
      })
      return
    }
    this.setTabState('feed', {
      state: 'empty',
      title: '暂无球队动态',
      desc: '公开动态服务尚未接入；当前账号还没有可记录比赛的球队，请先在“我的”切换球队身份。',
      action: 'profile',
      actionText: '去切换身份'
    })
  },

  applyGuestFeed: function () {
    this.setData({
      feedItems: [],
      hasFeedItems: false,
      feedLoading: false,
      feedRefreshText: '',
      feedNoticeText: '',
      feedEndText: ''
    })
    this.setTabState('feed', {
      state: 'blocked',
      title: '登录后查看动态',
      desc: '游客可以浏览公开内容；发布、评论与记分需要先登录。',
      action: 'login',
      actionText: '去登录'
    })
  },

  applyFeedFilterState: function () {
    var filter = this.data.feedFilter
    this.setData({
      feedItems: [],
      hasFeedItems: false,
      feedLoading: false,
      feedRefreshText: '',
      feedNoticeText: '',
      feedEndText: ''
    })
    if (filter === 'follow') {
      this.setTabState('feed', {
        state: 'blocked',
        title: '关注关系未接入',
        desc: '关注关系服务尚未接入，不伪造关注动态。',
        action: 'switchall',
        actionText: '查看全部'
      })
      return
    }
    this.setTabState('feed', {
      state: 'blocked',
      title: '同城动态未接入',
      desc: '同城筛选需要公开动态服务与城市字段，当前接口未接入，不展示拼凑结果。',
      action: 'switchall',
      actionText: '查看全部'
    })
  },

  // ===== 赛事（公开赛事目录 getTournamentList） =====
  loadEvents: function (mode) {
    var that = this
    if (!wx.cloud) {
      this.setTabState('event', {
        state: 'error',
        title: '赛事加载失败',
        desc: '当前环境不支持读取公开赛事目录。',
        action: 'retry',
        actionText: '重新加载'
      })
      return Promise.resolve()
    }
    if (this._eventLoading) return Promise.resolve()
    var isMore = mode === 'more'
    if (isMore && this._eventNoMore) return Promise.resolve()
    var existing = this._eventRows || []
    var startPage = isMore ? ((this._eventPage || 0) + 1) : 1
    var pagesToFetch = 1
    if (!isMore && existing.length) {
      // 刷新时按已加载页数重取，避免从赛事中心返回后列表塌回首屏、滚动位置丢失
      pagesToFetch = Math.min(EVENT_AUTO_PAGES, Math.max(1, Math.ceil(existing.length / EVENT_PAGE_SIZE)))
    }
    var seq = ++this._eventSeq
    this._eventLoading = true
    if (!existing.length || mode === 'init') {
      this.setTabState('event', { state: 'loading', title: '正在加载赛事…' })
      this.setData({ eventRefreshText: '' })
    } else {
      this.setTabState('event', { state: 'ready' })
      this.setData({ eventRefreshText: isMore ? '正在加载更多…' : '正在刷新…' })
    }
    var collected = isMore ? existing.slice() : []
    var page = startPage
    var remaining = pagesToFetch
    var lastPage = isMore ? (this._eventPage || 0) : 0
    var lastShort = false
    var step = function () {
      if (remaining <= 0 || lastShort) return Promise.resolve()
      remaining -= 1
      return that.fetchEventPage(page).then(function (rows) {
        lastPage = page
        page += 1
        if (rows.length < EVENT_PAGE_SIZE) lastShort = true
        collected = collected.concat(rows)
        return step()
      })
    }
    return step().then(function () {
      if (seq !== that._eventSeq) return
      that._eventLoading = false
      that._eventRows = that.mergeEventRows(collected)
      that._eventPage = lastPage
      that._eventNoMore = lastShort
      that.setData({ eventRefreshText: '' })
      that.renderEvents()
      if (that.shouldAutoLoadEvents()) {
        that._eventAutoPages += 1
        that.loadEvents('more')
      }
    }).catch(function (error) {
      if (seq !== that._eventSeq) return
      that._eventLoading = false
      that.setData({ eventRefreshText: '' })
      var message = String((error && (error.message || error.errMsg)) || '')
      that.setTabState('event', {
        state: 'error',
        title: '赛事加载失败',
        desc: message || '请检查网络后重试；加载失败不会用示例赛事填充。',
        action: 'retry',
        actionText: '重新加载'
      })
    })
  },

  fetchEventPage: function (page) {
    return wx.cloud.callFunction({
      name: 'getTournamentList',
      data: {
        page: page,
        pageSize: EVENT_PAGE_SIZE,
        // 新版本默认只查青少年；显式带旧类别开关，新旧部署都返回全部非草稿赛事
        includeLegacyCategory: true
      }
    }).then(function (response) {
      var result = (response && response.result) || {}
      if (result.success !== true) {
        var failure = new Error(String(result.message || result.error || '公开赛事目录返回异常'))
        failure.code = 'EVENT_API_FAIL'
        throw failure
      }
      return result.data || []
    })
  },

  // 按稳定赛事 ID 去重并整形；不按名称合并
  mergeEventRows: function (rows) {
    var seen = {}
    var items = []
    for (var i = 0; i < (rows || []).length; i += 1) {
      var row = rows[i] || {}
      var id = String(row._id || row.id || '')
      if (!id || seen[id]) continue
      seen[id] = true
      items.push(model.formatPublicEvent(row))
    }
    return items
  },

  renderEvents: function () {
    var data = this.data
    var filtered = model.matchKeyword(model.filterEvents(this._eventRows || [], data.eventFilter), data.keyword, model.EVENT_SEARCH_FIELDS)
    this._eventFilteredCount = filtered.length
    var patch = {
      eventItems: filtered,
      hasEventItems: filtered.length > 0,
      eventLoading: false,
      eventRefreshText: '',
      eventEndText: ''
    }
    if (filtered.length) patch.eventEndText = this._eventNoMore ? '没有更多赛事了' : '上滑加载更多赛事'
    this.setData(patch)
    if (filtered.length) {
      this.setTabState('event', { state: 'ready' })
      return
    }
    if (data.hasKeyword) {
      this.setTabState('event', {
        state: 'empty',
        title: '暂无匹配赛事',
        desc: '换个关键词试试，或清空搜索查看已加载的公开赛事。',
        action: 'clear',
        actionText: '清空搜索'
      })
      return
    }
    if (data.eventFilter === 'adult' || data.eventFilter === 'youth') {
      this.setTabState('event', {
        state: 'empty',
        title: data.eventFilter === 'adult' ? '暂无成人赛事' : '暂无青少年赛事',
        desc: '当前公开赛事目录暂时没有该类别赛事，可查看全部或到赛事中心浏览。',
        action: 'switchall',
        actionText: '查看全部赛事'
      })
      return
    }
    this.setTabState('event', {
      state: 'empty',
      title: '暂无符合条件赛事',
      desc: '公开赛事目录暂时没有可展示的赛事；可到赛事中心查看已发布赛事。',
      action: 'center',
      actionText: '打开赛事中心'
    })
  },

  // 类别筛选或搜索在已加载数据里没有命中时，自动续取少量页，避免把“还没加载到”误报成“没有赛事”
  shouldAutoLoadEvents: function () {
    if (this._eventNoMore) return false
    if ((this._eventAutoPages || 0) >= EVENT_AUTO_PAGES) return false
    if (this._eventFilteredCount > 0) return false
    return this.data.eventFilter !== 'all' || this.data.hasKeyword
  },

  // ===== 约球（本队邀约，只读） =====
  loadInvites: function (mode) {
    var that = this
    var data = this.data
    if (data.isGuest) {
      this.setData({
        inviteBtnClass: 'invite-btn-disabled',
        inviteItems: [],
        hasInviteItems: false,
        inviteRefreshText: '',
        inviteEndText: '',
        inviteNoticeText: ''
      })
      this.setTabState('invite', {
        state: 'blocked',
        title: '登录后发起约球',
        desc: '游客可以浏览公开赛事；发起约球和查看本队邀约需要登录并切换到有权限的球队。',
        action: 'login',
        actionText: '去登录'
      })
      return Promise.resolve()
    }
    this.setData({ inviteBtnClass: data.canWrite ? 'invite-btn-ready' : 'invite-btn-disabled' })
    if (!data.hasTeam || !data.teamId) {
      this._inviteLoading = false
      this.setData({ inviteItems: [], hasInviteItems: false, inviteRefreshText: '', inviteEndText: '', inviteNoticeText: '' })
      this.setTabState('invite', {
        state: 'blocked',
        title: '暂无约球邀约',
        desc: data.isOrganizer
          ? '当前为赛事组织者身份，查看本队邀约需要球队身份。'
          : '当前账号还没有可查看邀约的球队，请先在“我的”切换球队身份。',
        action: 'profile',
        actionText: '去切换身份'
      })
      return Promise.resolve()
    }
    if (!wx.cloud) {
      this.setTabState('invite', {
        state: 'error',
        title: '邀约加载失败',
        desc: '当前环境不支持读取本队邀约。',
        action: 'retry',
        actionText: '重新加载'
      })
      return Promise.resolve()
    }
    if (this._inviteLoading) return Promise.resolve()
    var seq = ++this._inviteSeq
    this._inviteLoading = true
    if (!data.inviteItems.length || mode === 'init') {
      this.setTabState('invite', { state: 'loading', title: '正在加载本队邀约…' })
      this.setData({ inviteRefreshText: '' })
    } else {
      this.setTabState('invite', { state: 'ready' })
      this.setData({ inviteRefreshText: '正在刷新…' })
    }
    return wx.cloud.callFunction({
      name: 'friendlyMatchCenter',
      data: { action: 'listTeamInvites', teamId: data.teamId, limit: 30 }
    }).then(function (response) {
      if (seq !== that._inviteSeq) return
      that._inviteLoading = false
      var result = (response && response.result) || {}
      that.setData({ inviteRefreshText: '' })
      if (!result.ok) {
        var code = String(result.code || '')
        var message = String(result.message || '邀约列表读取失败')
        if (code === 'UNKNOWN_ACTION') {
          // 云函数尚未发布该 action：单列未接入，不伪造空列表
          that.setData({ inviteItems: [], hasInviteItems: false, inviteNoticeText: '', inviteEndText: '' })
          that.setTabState('invite', {
            state: 'blocked',
            title: '邀约列表接口待发布',
            desc: '本队邀约列表接口尚未发布到当前环境；仍可先发起约球，生成海报分享到微信群。',
            action: '',
            actionText: ''
          })
          return
        }
        if (code === 'FORBIDDEN' || code === 'UNAUTHORIZED') {
          that.setData({ inviteItems: [], hasInviteItems: false, inviteNoticeText: '', inviteEndText: '' })
          that.setTabState('invite', {
            state: 'blocked',
            title: code === 'UNAUTHORIZED' ? '登录状态已变化' : '没有查看权限',
            desc: code === 'UNAUTHORIZED'
              ? '请下拉刷新或重新登录后再试。'
              : '当前账号不属于该球队，无法查看本队邀约。',
            action: code === 'UNAUTHORIZED' ? 'retry' : 'profile',
            actionText: code === 'UNAUTHORIZED' ? '重新加载' : '去切换身份'
          })
          return
        }
        that.setTabState('invite', {
          state: 'error',
          title: '邀约加载失败',
          desc: message,
          action: 'retry',
          actionText: '重新加载'
        })
        return
      }
      var rows = (result.data && result.data.invites) || []
      var items = rows.map(function (row) { return model.formatInvite(row) })
      that._inviteItems = items
      that._inviteLoaded = true
      that.setData({
        inviteItems: items,
        hasInviteItems: items.length > 0,
        inviteNoticeText: items.length ? '仅展示本队发起的约球邀约' : '',
        inviteEndText: items.length >= 30 ? '仅显示最近 30 条邀约' : ''
      })
      if (items.length) {
        that.setTabState('invite', { state: 'ready' })
        return
      }
      that.setTabState('invite', {
        state: 'empty',
        title: '暂无约球邀约',
        desc: '本队还没有发起约球；可先发起约球，生成海报分享到微信群，对手扫码报名。',
        action: '',
        actionText: ''
      })
    }).catch(function (error) {
      if (seq !== that._inviteSeq) return
      that._inviteLoading = false
      that.setData({ inviteRefreshText: '' })
      var message = String((error && (error.errMsg || error.message)) || '')
      that.setTabState('invite', {
        state: 'error',
        title: '邀约加载失败',
        desc: message || '请检查网络后重试；失败不会显示成“暂无邀约”。',
        action: 'retry',
        actionText: '重新加载'
      })
    })
  },

  // ===== 约球：跨队公开约球（2026-10-27 用户确认公开） =====
  // 只读列表 + 应战意向；同城按发起球队登记城市比较，不用定位城市。
  currentTeamCity: function () {
    var teamId = this.data.teamId
    if (!teamId || !this._cityCache) return ''
    return String(this._cityCache[teamId] || '')
  },

  onSwitchInviteScope: function (event) {
    var id = String((event.currentTarget.dataset || {}).id || '')
    if (!id || (id !== 'team' && id !== 'public')) return
    if (id === this.data.inviteScope) return
    var scopes = (this.data.inviteScopes || []).map(function (item) {
      var active = item.id === id
      return {
        id: item.id,
        text: item.text,
        itemClass: active ? 'scope-item-active' : ''
      }
    })
    this.setData({
      inviteScope: id,
      isTeamInviteScope: id === 'team',
      isPublicInviteScope: id === 'public',
      inviteScopes: scopes
    })
    if (id === 'public') {
      this.loadPublicInvites(this._publicItems && this._publicItems.length ? 'refresh' : 'init')
      return
    }
    this.loadInvites(this._inviteItems && this._inviteItems.length ? 'refresh' : 'init')
  },

  onTogglePublicCity: function () {
    if (this.data.publicCityToggleDisabled) {
      wx.showToast({ title: '本队城市未登记，暂按全部城市展示', icon: 'none' })
      return
    }
    var next = !this.data.publicCityOnly
    this.setData({
      publicCityOnly: next,
      publicCityToggleText: next ? '查看全部城市' : '只看同城'
    })
    this.loadPublicInvites('init')
  },

  loadPublicInvites: function (mode) {
    var that = this
    var data = this.data
    if (!wx.cloud) {
      this.setTabState('public', {
        state: 'error',
        title: '公开约球加载失败',
        desc: '当前环境不支持读取公开约球。',
        action: 'retry',
        actionText: '重新加载'
      })
      return Promise.resolve()
    }
    if (this._publicLoading) return Promise.resolve()
    var city = this.currentTeamCity()
    // 同城但本队没登记城市时，不能悄悄换成“全部城市”还显示成同城，必须显式降级
    var cityOnly = Boolean(data.publicCityOnly) && Boolean(city)
    var offset = mode === 'more' ? (this._publicOffset || 0) : 0
    var seq = ++this._publicSeq
    this._publicLoading = true
    this._publicLoadingMode = mode
    if (!offset) {
      this._publicNoMore = false
      this.setTabState('public', { state: 'loading', title: '正在加载公开约球…' })
      this.setData({ publicRefreshText: '', publicLoading: true })
    } else {
      this.setTabState('public', { state: 'ready' })
      this.setData({ publicRefreshText: '正在加载更多…' })
    }
    this.setData({
      publicCityText: cityOnly ? model.cityText(city) : '全部城市',
      publicCityToggleDisabled: !city
    })
    return wx.cloud.callFunction({
      name: 'friendlyMatchCenter',
      data: { action: 'listPublicInvites', city: cityOnly ? city : '', limit: 10, offset: offset }
    }).then(function (response) {
      if (seq !== that._publicSeq) return
      that._publicLoading = false
      that.setData({ publicRefreshText: '', publicLoading: false })
      var result = (response && response.result) || {}
      if (!result.ok) {
        var code = String(result.code || '')
        var message = String(result.message || '公开约球读取失败')
        if (offset && that._publicItems.length) {
          wx.showToast({ title: message, icon: 'none' })
          return
        }
        that.setData({ publicItems: [], hasPublicItems: false, publicNoticeText: '', publicEndText: '' })
        if (code === 'UNKNOWN_ACTION') {
          that.setTabState('public', {
            state: 'blocked',
            title: '公开约球接口待发布',
            desc: '跨队公开约球接口尚未发布到当前环境；本队约球与海报分享仍可正常使用。',
            action: '',
            actionText: ''
          })
          return
        }
        if (code === 'UNAUTHORIZED') {
          that.setTabState('public', {
            state: 'blocked',
            title: '登录状态已变化',
            desc: '请下拉刷新或重新进入小程序后再试。',
            action: 'retry',
            actionText: '重新加载'
          })
          return
        }
        that.setTabState('public', {
          state: 'error',
          title: '公开约球加载失败',
          desc: message,
          action: 'retry',
          actionText: '重新加载'
        })
        return
      }
      var payload = result.data || {}
      var rows = payload.invites || []
      var myTeamId = that.data.teamId
      var respondedMap = that._publicResponded || {}
      var items = rows.map(function (row) {
        return model.formatPublicInvite(row, myTeamId, respondedMap[String(row.inviteId || '')])
      })
      var merged = offset ? that._publicItems.concat(items) : items
      that._publicItems = merged
      that._publicOffset = offset + items.length
      that._publicNoMore = payload.hasMore !== true || !items.length
      that.setData({
        publicItems: merged,
        hasPublicItems: merged.length > 0,
        publicNoticeText: merged.length
          ? '公开约球来自各球队登记城市，只展示场地名与报名人数，不显示详细地址与联系方式。'
          : '',
        publicEndText: that._publicNoMore && merged.length ? '没有更多公开约球了' : (payload.scanLimited ? '仅展示最近一批公开邀约' : '')
      })
      if (merged.length) {
        that.setTabState('public', { state: 'ready' })
        return
      }
      that.setTabState('public', {
        state: 'empty',
        title: cityOnly ? '同城暂无公开约球' : '暂无公开约球',
        desc: cityOnly
          ? '本队登记城市暂时没有公开邀约；可切换查看全部城市，或自己发起约球并分享海报。'
          : '暂时没有球队公开约球；可先发起约球，生成海报分享到微信群。',
        action: cityOnly ? 'switchcity' : '',
        actionText: cityOnly ? '查看全部城市' : ''
      })
    }).catch(function (error) {
      if (seq !== that._publicSeq) return
      that._publicLoading = false
      that.setData({ publicRefreshText: '', publicLoading: false })
      var message = String((error && (error.errMsg || error.message)) || '')
      if (offset && that._publicItems.length) {
        wx.showToast({ title: '加载更多失败，请重试', icon: 'none' })
        return
      }
      that.setTabState('public', {
        state: 'error',
        title: '公开约球加载失败',
        desc: message || '请检查网络后重试；失败不会显示成“暂无公开约球”。',
        action: 'retry',
        actionText: '重新加载'
      })
    })
  },

  // 应战由本队代表提交意向：沿用现有 H5 应战语义（可多队应战，发起方决定），不自动锁定比赛
  onPublicRespond: function (event) {
    var id = String((event.currentTarget.dataset || {}).id || '')
    if (!id) return
    var items = this.data.publicItems || []
    var target = null
    var i
    for (i = 0; i < items.length; i += 1) {
      if (items[i].id === id) { target = items[i]; break }
    }
    if (!target) return
    if (!target.canRespond) {
      wx.showToast({ title: target.isMine ? '本队发起的邀约不能应战' : '已提交过应战', icon: 'none' })
      return
    }
    if (this.data.isGuest) {
      wx.showToast({ title: '请先登录后再应战', icon: 'none' })
      return
    }
    if (!this.data.hasTeam || !this.data.teamId) {
      wx.showToast({ title: '请先切换到球队身份', icon: 'none' })
      return
    }
    var that = this
    wx.showModal({
      title: '代表本队应战',
      content: '将向「' + target.teamName + '」提交应战意向（' + target.titleText + ' · ' + target.venueText + '）。应战后由对方球队确认，确认前邀约仍可被其他球队应战。',
      confirmText: '提交应战',
      cancelText: '再看看',
      success: function (res) {
        if (!res.confirm) return
        that.submitPublicRespond(target)
      }
    })
  },

  submitPublicRespond: function (target) {
    var that = this
    if (this._respondLoading) return
    this._respondLoading = true
    wx.showLoading({ title: '提交应战…', mask: true })
    return wx.cloud.callFunction({
      name: 'friendlyMatchCenter',
      data: { action: 'respondPublicInvite', inviteId: target.id, teamId: this.data.teamId }
    }).then(function (response) {
      wx.hideLoading()
      that._respondLoading = false
      var result = (response && response.result) || {}
      if (!result.ok) {
        var code = String(result.code || '')
        var message = String(result.message || '应战提交失败')
        if (code === 'UNKNOWN_ACTION') {
          wx.showToast({ title: '应战接口待发布', icon: 'none' })
          return
        }
        if (code === 'CLOSED') {
          wx.showModal({ title: '该邀约已关闭', content: message, showCancel: false })
          that.loadPublicInvites('init')
          return
        }
        wx.showToast({ title: message, icon: 'none' })
        return
      }
      that._publicResponded = that._publicResponded || {}
      that._publicResponded[target.id] = { responded: true }
      // 只改应战相关字段，保留卡片上已有的时间、场地与人数，不重新整形丢信息
      var items = (that.data.publicItems || []).map(function (item) {
        if (item.id !== target.id) return item
        return Object.assign({}, item, {
          responded: true,
          canRespond: false,
          actionText: '已提交应战',
          respondClass: 'public-action public-action-done'
        })
      })
      that._publicItems = items
      that.setData({ publicItems: items })
      wx.showToast({ title: result.data && result.data.alreadyResponded ? '已提交过应战' : '应战意向已提交', icon: 'none' })
    }).catch(function (error) {
      wx.hideLoading()
      that._respondLoading = false
      wx.showToast({ title: '应战提交失败，请重试', icon: 'none' })
      console.warn('[discover] 应战失败', error && (error.errMsg || error.message))
    })
  },

  // 邀约详情：查看、分享、重试与返回刷新统一只用 inviteId（旧 token 链接的详情页会自行回填）
  onOpenInviteDetail: function (event) {
    var id = String((event.currentTarget.dataset || {}).id || '')
    if (!id) return
    this.navigateOnce('/pages/discover/invite-detail/invite-detail?inviteId=' + encodeURIComponent(id))
  },

  // 发起方查看应战队伍（listSignins 已加鉴权，只回传脱敏字段）
  onViewInviteResponses: function (event) {
    var id = String((event.currentTarget.dataset || {}).id || '')
    if (!id) return
    wx.showLoading({ title: '读取应战…', mask: true })
    wx.cloud.callFunction({
      name: 'friendlyMatchCenter',
      data: { action: 'listSignins', inviteId: id }
    }).then(function (response) {
      wx.hideLoading()
      var result = (response && response.result) || {}
      if (!result.ok) {
        var code = String(result.code || '')
        var message = String(result.message || '应战列表读取失败')
        if (code === 'UNKNOWN_ACTION') message = '应战列表接口待发布'
        else if (code === 'FORBIDDEN') message = '只有发起球队可以查看应战队伍'
        wx.showModal({ title: '应战队伍', content: message, showCancel: false })
        return
      }
      var rows = (result.data && result.data.responses) || []
      if (!rows.length) {
        wx.showModal({ title: '应战队伍', content: '还没有球队应战。可把海报分享到微信群，扩大到更多球队。', showCancel: false })
        return
      }
      var lines = rows.slice(0, 8).map(function (row) {
        return (String(row.teamName || '') || '球队待核验') + (row.status === 'accepted' ? ' · 已应战' : ' · 已签到')
      })
      if (rows.length > 8) lines.push('等共 ' + rows.length + ' 支球队')
      wx.showModal({ title: '应战队伍', content: lines.join('\n'), showCancel: false })
    }).catch(function (error) {
      wx.hideLoading()
      wx.showModal({ title: '应战队伍', content: '读取失败，请稍后重试。', showCancel: false })
      console.warn('[discover] 应战列表失败', error && (error.errMsg || error.message))
    })
  },

  // ===== 页签与筛选 =====
  onSwitchTab: function (event) {
    var id = String(event.currentTarget.dataset.id || '')
    if (!id || id === this.data.activeTab) return
    this.saveScroll(this.data.activeTab)
    var tab = 'feed'
    if (id === 'events') tab = 'events'
    else if (id === 'invites') tab = 'invites'
    else if (id === 'transfer') tab = 'transfer'
    var chips = []
    if (tab === 'feed') chips = model.buildChips(model.FEED_FILTER_DEFS, this.data.feedFilter)
    else if (tab === 'events') chips = model.buildChips(model.EVENT_FILTER_DEFS, this.data.eventFilter)
    // 约球与转会没有检索接口：输入框禁用并给出对应说明，不让关键词静默失效
    var searchDisabled = tab === 'invites' || tab === 'transfer'
    var placeholder = '搜索动态'
    if (tab === 'events') placeholder = '搜索赛事名称、城市或主办方'
    else if (tab === 'invites') placeholder = '约球栏暂不支持搜索'
    else if (tab === 'transfer') placeholder = '转会市场暂不支持搜索'
    var keywordPatch = searchDisabled ? { keyword: '', hasKeyword: false } : {}
    var that = this
    this.setData({
      activeTab: tab,
      tabs: model.buildTabs(tab),
      isFeedTab: tab === 'feed',
      isEventTab: tab === 'events',
      isInviteTab: tab === 'invites',
      isTransferTab: tab === 'transfer',
      isTransferTabClass: tab === 'transfer' ? 'market-page' : '',
      // 约球与转会都没有列表筛选：直接给各自结构，不把“同城/关注”套到别的业务上
      chips: chips,
      showFilterRow: tab === 'feed' || tab === 'events',
      showPublishEntry: tab === 'feed',
      searchPlaceholder: placeholder,
      searchDisabled: searchDisabled,
      searchBoxClass: searchDisabled ? 'search-box search-box-disabled' : 'search-box',
      publishMenuVisible: false
    }, function () {
      if (Object.keys(keywordPatch).length) that.setData(keywordPatch)
      if (tab === 'events') {
        if (that._eventRows && that._eventRows.length) that.renderEvents()
        else that.loadEvents('init')
      } else if (tab === 'invites') {
        that.loadInvites('init')
      } else if (tab === 'transfer') {
        that.loadTransfer('init')
      } else if (!that._feedLoaded) {
        that.loadFeed('init')
      } else {
        that.renderFeed()
      }
      setTimeout(function () { that.restoreScroll(tab) }, 30)
    })
  },

  onSwitchFilter: function (event) {
    var id = String(event.currentTarget.dataset.id || '')
    if (!id) return
    if (this.data.activeTab === 'invites') return
    if (this.data.activeTab === 'events') {
      if (id === this.data.eventFilter) return
      this.setData({ eventFilter: id, chips: model.buildChips(model.EVENT_FILTER_DEFS, id) })
      this._eventAutoPages = 0
      if (this._eventRows && this._eventRows.length) {
        this.renderEvents()
        if (this.shouldAutoLoadEvents()) {
          this._eventAutoPages += 1
          this.loadEvents('more')
        }
      } else {
        this.loadEvents('init')
      }
      wx.pageScrollTo({ scrollTop: 0, duration: 0 })
      return
    }
    if (id === this.data.feedFilter) return
    this.setData({ feedFilter: id, chips: model.buildChips(model.FEED_FILTER_DEFS, id) })
    if (id === 'all') {
      if (!this._feedLoaded) this.loadFeed('init')
      else this.renderFeed()
    } else {
      this.applyFeedFilterState()
    }
    wx.pageScrollTo({ scrollTop: 0, duration: 0 })
  },

  saveScroll: function (tab) {
    if (!this._scrollByTab) this._scrollByTab = {}
    this._scrollByTab[tab] = Number(this._pageScrollTop || 0)
  },

  restoreScroll: function (tab) {
    var top = Number((this._scrollByTab && this._scrollByTab[tab]) || 0)
    if (!top) return
    wx.pageScrollTo({ scrollTop: top, duration: 0 })
  },

  onKeywordInput: function (event) {
    if (this.data.searchDisabled) return
    var value = String((event.detail && event.detail.value) || '')
    var that = this
    this.setData({ keyword: value, hasKeyword: Boolean(value.trim()) })
    clearTimeout(this._searchTimer)
    this._searchTimer = setTimeout(function () { that.applySearch() }, 220)
  },

  onKeywordConfirm: function () {
    clearTimeout(this._searchTimer)
    this.applySearch()
  },

  onClearKeyword: function () {
    clearTimeout(this._searchTimer)
    this.setData({ keyword: '', hasKeyword: false })
    this.applySearch()
  },

  applySearch: function () {
    var tab = this.data.activeTab
    // 约球与转会没有检索接口：输入框已禁用，这里再兜一层，避免关键词误刷列表或误套到动态、赛事
    if (tab === 'transfer' || tab === 'invites' || this.data.searchDisabled) return
    if (tab === 'events') {
      this._eventAutoPages = 0
      if (this._eventRows && this._eventRows.length) {
        this.renderEvents()
        if (this.shouldAutoLoadEvents()) {
          this._eventAutoPages += 1
          this.loadEvents('more')
        }
      } else {
        this.loadEvents('init')
      }
      return
    }
    if (tab === 'invites') {
      this.loadInvites('refresh')
      return
    }
    this.renderFeed()
  },

  // ===== 页面内操作 =====
  onStateAction: function (event) {
    var action = String(event.currentTarget.dataset.action || '')
    if (!action) return
    if (action === 'retry') {
      this.loadActiveTab('refresh')
      return
    }
    if (action === 'login') {
      this.onGoLogin()
      return
    }
    if (action === 'record') {
      this.onStartRecord()
      return
    }
    if (action === 'invite') {
      this.onStartInvite()
      return
    }
    if (action === 'center') {
      this.onOpenPublicCenter()
      return
    }
    if (action === 'clear') {
      this.onClearKeyword()
      return
    }
    if (action === 'profile') {
      // “我的”里可切换球队管理者/赛事组织者身份，不在发现页自行改身份
      wx.switchTab({ url: '/pages/profile/profile' })
      return
    }
    if (action === 'switchall') {
      this.onSwitchFilter({ currentTarget: { dataset: { id: 'all' } } })
    }
    if (action === 'switchcity') {
      // 同城为空时显式切到“全部城市”，不悄悄改变筛选口径
      this.setData({ publicCityOnly: false, publicCityToggleText: '只看同城' })
      this.loadPublicInvites('init')
    }
  },

  // 头部城市取球队资料里登记的「所在城市」，不调用定位；未登记时给出补充入口，不补造城市
  onTapCity: function () {
    var that = this
    var isTransfer = this.data.activeTab === 'transfer'
    var scopeNote = isTransfer
      ? '转会市场当前按全平台或所选赛事展示，暂不按城市筛选。'
      : '公开赛事目录当前按全部已发布赛事展示，暂未按城市强制过滤；可用上方搜索框输入城市或赛事名。'
    var sourceNote = '页面头部城市取本队资料里登记的「所在城市」，不是手机定位。'
    if (this.data.isGuest || !this.data.hasTeam) {
      wx.showModal({
        title: '城市来自球队资料',
        content: scopeNote + '\n\n' + sourceNote + '\n\n当前身份没有可管理的球队，登录并加入球队后可在球队资料里登记城市。',
        showCancel: false,
        confirmText: '知道了'
      })
      return
    }
    if (this.data.cityRegistered) {
      wx.showModal({ title: '城市来自球队资料', content: scopeNote + '\n\n' + sourceNote + '如需修改，请到球队资料里改「所在城市」。', showCancel: false, confirmText: '知道了' })
      return
    }
    if (!this.data.canWrite) {
      wx.showModal({ title: '本队城市未登记', content: scopeNote + '\n\n' + sourceNote + '\n\n本队资料还没有填写所在城市；只有球队管理者可以补充。', showCancel: false, confirmText: '知道了' })
      return
    }
    wx.showModal({
      title: '本队城市未登记',
      content: scopeNote + '\n\n' + sourceNote + '\n\n本队资料还没有填写所在城市，补充后这里会显示本队所在城市。',
      confirmText: '去补充',
      cancelText: '知道了',
      success: function (res) {
        if (res.confirm) that.openTeamProfile()
      }
    })
  },

  // 城市补充入口：球队资料页已有「所在城市」字段，返回时强制重读城市，不新建编辑页
  openTeamProfile: function () {
    var teamId = String(this.data.teamId || '')
    if (!teamId) return
    this._cityForce = true
    wx.navigateTo({
      url: '/pages/team/profile/profile?teamId=' + encodeURIComponent(teamId),
      fail: function () { wx.showToast({ title: '球队资料打开失败', icon: 'none' }) }
    })
  },

  // ===== 转会公开市场（转会焦点 / 身价榜 / 上升最快 / 球员身价 / 最新转会） =====
  // 榜单、金额与走势全部由 dataCenter.transferShowcase 统一口径计算，页面不重算、不补造；
  // 失败、空数据与接口未发布分开提示；赛事与年龄段为真实范围，时间范围未接入时明确说明，不做假按钮。
  loadTransfer: function (mode) {
    var more = mode === 'more'
    if (more && !this._transferHasMore) return Promise.resolve()
    if (!wx.cloud) {
      this.setTabState('transfer', { state: 'error', title: '转会市场加载失败', desc: '当前环境不支持读取转会数据。', action: 'retry', actionText: '重新加载' })
      return Promise.resolve()
    }
    if (this._transferLoading) return Promise.resolve()
    var that = this
    var seq = ++this._transferSeq
    this._transferLoading = true
    this.setData({ transferMoreLoading: more, transferMoreError: '', transferMoreText: more ? '正在加载…' : '加载更多球员' })
    if (!this._transferLoaded) {
      this.setTabState('transfer', { state: 'loading', title: '正在加载转会市场…' })
    }
    return wx.cloud.callFunction({
      name: 'dataCenter',
      data: {
        action: 'transferShowcase',
        // 范围：赛事 + 年龄段（竞赛组别）；都不传时为全平台口径
        tournamentId: this._transferTournamentId || '',
        ageGroupId: this._transferAgeGroupId || '',
        playerCursor: more ? (this._transferCursor || '') : ''
      }
    }).then(function (response) {
      if (seq !== that._transferSeq) return
      that._transferLoading = false
      var result = (response && response.result) || {}
      if (!result.success) {
        if (more) {
          that.setData({ transferMoreLoading: false, transferMoreError: result.code === 'DATA_VIEW_CHANGED' ? '名单已更新，请刷新列表' : '加载失败，点击重试', transferMoreText: result.code === 'DATA_VIEW_CHANGED' ? '刷新列表' : '重试加载' })
          return
        }
        that.applyTransferFailure(String(result.code || ''), String(result.error || ''))
        return
      }
      var view = model.formatShowcase(result.data || {})
      if (more) {
        if (view.playerPoolVersion !== that._transferPoolVersion || (view.playerHasMore && (!view.nextPlayerCursor || view.nextPlayerCursor === that._transferCursor))) {
          that.setData({ transferMoreLoading: false, transferMoreError: '名单已更新，请刷新列表', transferMoreText: '刷新列表' })
          return
        }
        var source = that._transferPlayerSource || []
        var seen = {}
        source.forEach(function (item) { seen[item.view.playerId || item.view.key] = true })
        view.playerSource.forEach(function (item) { var id = item.view.playerId || item.view.key; if (!seen[id]) { source.push(item); seen[id] = true } })
        that._transferPlayerSource = source
        that._transferCursor = view.nextPlayerCursor
        that._transferHasMore = view.playerHasMore
        that._transferPlayerEndText = '已展示 ' + source.length + ' 位球员，共 ' + view.playerTotal + ' 位'
        var rows = model.filterShowcasePlayers(source, that.data.transferPositionKey)
        rows = model.matchKeyword(rows, that._transferSearchKeyword || '', ['playerName', 'metaText'])
        that.setData({ transferPlayers: rows, hasTransferPlayers: rows.length > 0, showTransferPlayerEmpty: rows.length === 0, transferMoreVisible: view.playerHasMore, transferMoreLoading: false, transferMoreError: '', transferMoreText: '加载更多球员', transferPositionChips: model.showcasePositionChips(source, that.data.transferPositionKey), transferPlayerEndText: that._transferSearchKeyword ? '本页匹配 ' + rows.length + ' 位球员' : that._transferPlayerEndText })
        return
      }
      that._transferLoaded = true
      // 范围以服务端回显为准：赛事被取消或年龄段不存在时回到服务端实际口径
      that._transferTournamentId = view.tournamentId
      that._transferAgeGroupId = view.ageGroupId
      that._transferAgeGroups = view.ageGroupOptions
      that._transferPlayerEmptyText = view.playerEmptyText
      // 位置筛选只在已取回的行上生效，切范围或刷新后重置为全部
      that._transferPlayerSource = view.playerSource
      that._transferCursor = view.nextPlayerCursor
      that._transferHasMore = view.playerHasMore
      that._transferPoolVersion = view.playerPoolVersion
      that._transferPlayerEndText = view.playerEndText
      that._transferTopAll = view.topItems
      that._transferRisingAll = view.risingItems
      that._transferTopEmptyText = view.topEmptyText
      that._transferRisingEmptyText = view.risingEmptyText
      that._transferRankShort = view.rankScopeShort
      that._transferSearchKeyword = ''
      that._transferPositionKey = 'all'
      that.setData({
        transferLoaded: true,
        transferKeyword: '',
        transferScopeChips: view.scopeChips,
        transferScopeNoteText: view.scopeNoteText,
        transferRankScopeLabel: view.rankScopeLabel,
        transferRankScopeNote: view.rankScopeNote,
        transferContentVisible: !view.isEmpty,
        transferFocus: view.focus,
        showTransferFocus: view.focus.visible,
        transferDynamicItems: view.dynamicItems,
        hasTransferDynamic: view.hasDynamic,
        showTransferDynamicEmpty: !view.hasDynamic,
        transferDynamicEmptyText: view.dynamicEmptyText,
        transferCountText: view.transferCountText,
        transferTopEmptyText: view.topEmptyText,
        transferRisingEmptyText: view.risingEmptyText,
        transferPlayers: view.players,
        hasTransferPlayers: view.hasPlayers,
        showTransferPlayerEmpty: !view.hasPlayers,
        transferPlayerEmptyText: view.playerEmptyText,
        transferPlayerEndText: view.playerEndText,
        transferMoreVisible: view.playerHasMore,
        transferMoreLoading: false,
        transferMoreError: '',
        transferMoreText: '加载更多球员',
        transferPositionChips: view.positionChips,
        transferPositionKey: 'all',
        transferFilterOpen: false,
        transferFilterToggleText: '筛选查询'
      })
      that.applyTransferRankTab('top')
      if (view.isEmpty) {
        that.setTabState('transfer', {
          state: 'empty',
          title: view.scopeMode === 'tournament' ? '该范围暂无公开转会与身价' : '暂无公开转会与身价',
          desc: view.rankScopeNote
        })
      } else {
        that.setTabState('transfer', { state: 'ready' })
      }
    }).catch(function (error) {
      if (seq !== that._transferSeq) return
      that._transferLoading = false
      if (more) {
        that.setData({ transferMoreLoading: false, transferMoreError: '加载失败，点击重试', transferMoreText: '重试加载' })
        return
      }
      console.warn('[discover] 转会市场加载失败', error && (error.errMsg || error.message))
      that.setTabState('transfer', {
        state: 'error',
        title: '转会市场加载失败',
        desc: '网络或服务暂时不可用，请稍后重试。',
        action: 'retry',
        actionText: '重新加载'
      })
    })
  },

  // 后端尚未发布该 action 与真实的读取失败分开提示，不能都当“没有数据”
  onTransferRules: function () {
    wx.showModal({
      title: '市场口径',
      content: this.data.transferRankScopeNote + '\n\n上升最快对比同一球员前后两次真实身价快照。参考身价不等于成交价。\n\n' + this.data.transferFootnoteText,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  // 身价榜与上升最快共用一张卡：切换只换已加载的榜单行，不重新请求、不重算身价
  applyTransferRankTab: function (tab) {
    var rising = String(tab || '') === 'rising'
    var rows = rising ? (this._transferRisingAll || []) : (this._transferTopAll || [])
    this.setData({
      transferRankTab: rising ? 'rising' : 'top',
      transferRankTabTopClass: rising ? 'rank-tab' : 'rank-tab rank-tab-active',
      transferRankTabRisingClass: rising ? 'rank-tab rank-tab-active' : 'rank-tab',
      // 单卡展示不再挤成两栏：最新身价取前 5，上升最快取前 3，完整榜单看弹窗
      transferRankRows: rows.slice(0, rising ? 3 : 5),
      hasTransferRank: rows.length > 0,
      showTransferRankEmpty: rows.length === 0,
      transferRankEmptyText: rising
        ? (this._transferRisingEmptyText || '暂无可比的上一次身价')
        : (this._transferTopEmptyText || '暂无身价快照，平台测算后在此展示'),
      transferRankFootText: rising
        ? '对比上一次快照 · 参考身价不等于成交价'
        : ((this._transferRankShort || '全平台') + ' · 最新测算 · 参考身价不等于成交价')
    })
  },

  onTransferRankTab: function (event) {
    var tab = String(event.currentTarget.dataset.tab || 'top') === 'rising' ? 'rising' : 'top'
    if (tab === this.data.transferRankTab) return
    this.applyTransferRankTab(tab)
  },

  onTransferLoadMore: function () {
    return this.loadTransfer(this.data.transferMoreText === '刷新列表' ? 'refresh' : 'more')
  },

  onTransferSearchInput: function (event) {
    var keyword = String((event.detail && event.detail.value) || '')
    this._transferSearchKeyword = keyword
    var rows = model.filterShowcasePlayers(this._transferPlayerSource || [], this.data.transferPositionKey)
    rows = model.matchKeyword(rows, keyword, ['playerName', 'metaText'])
    this.setData({
      transferKeyword: keyword,
      transferPlayers: rows,
      hasTransferPlayers: rows.length > 0,
      showTransferPlayerEmpty: rows.length === 0,
      transferPlayerEmptyText: keyword.trim() ? '已展示球员中暂无匹配结果' : this._transferPlayerEmptyText,
      transferPlayerEndText: keyword.trim() ? '本页匹配 ' + rows.length + ' 位球员' : (this._transferPlayerEndText || '')
    })
  },

  // 榜单卡片右上「全部」：弹窗列出当前标签下的完整榜单，不跳转需要赛事权限的球员页
  onTransferRankList: function () {
    var rising = this.data.transferRankTab === 'rising'
    var rows = rising ? (this._transferRisingAll || []) : (this._transferTopAll || [])
    var lines = rows.map(function (row) {
      return row.rankText + '  ' + row.playerName + '  ' + (rising ? (row.riseText || '') + ' ' : '') + row.moneyText
    })
    wx.showModal({
      title: rising ? '上升最快' : '最新身价',
      content: lines.length ? lines.join('\n') : this.data.transferRankEmptyText,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  applyTransferFailure: function (code, message) {
    var desc = message || '转会市场加载失败，请稍后重试。'
    if (code === 'DATA_ACTION_INVALID') desc = '转会市场接口尚未发布，发布后再下拉刷新。'
    this.setTabState('transfer', {
      state: 'error',
      title: '转会市场加载失败',
      desc: desc,
      action: 'retry',
      actionText: '重新加载'
    })
  },

  // 范围筛选（2026-10-27 用户确认）：赛事与年龄段（竞赛组别）为真实可选项，时间范围未接入只做说明
  onTransferScopeTap: function (event) {
    var key = String(event.currentTarget.dataset.key || '')
    if (key === 'period') {
      wx.showModal({
        title: '时间范围暂未接入',
        content: '转会市场暂未提供按时间筛选的公开接口，当前展示所选范围内已完成的全部记录。',
        showCancel: false,
        confirmText: '知道了'
      })
      return
    }
    if (key === 'age') {
      if (!this._transferTournamentId) {
        wx.showModal({
          title: '先选择赛事',
          content: '年龄段按赛事的竞赛组别（如 U8、U10）划分；先选择赛事后，才能按年龄段查看。',
          showCancel: false,
          confirmText: '知道了'
        })
        return
      }
      var groups = this._transferAgeGroups || []
      if (groups.length <= 1) {
        wx.showModal({
          title: '暂无可选年龄段',
          content: '该赛事的已审核名单里还没有竞赛组别信息，暂不能按年龄段细分。',
          showCancel: false,
          confirmText: '知道了'
        })
        return
      }
      this.openTransferScopeSheet('age', '选择年龄段', '年龄段按该赛事的竞赛组别划分，不是抽签小组。', groups)
      return
    }
    if (key === 'event') {
      var that = this
      if (this._transferEventOptions && this._transferEventOptions.length) {
        this.openTransferScopeSheet('event', '选择赛事', '只列出最近公开的赛事；全部赛事可在赛事中心查看。', this._transferEventOptions)
        return
      }
      wx.showLoading({ title: '加载赛事…', mask: true })
      this.loadTransferEventOptions().then(function (options) {
        wx.hideLoading()
        that.openTransferScopeSheet('event', '选择赛事', '只列出最近公开的赛事；全部赛事可在赛事中心查看。', options)
      }).catch(function () {
        wx.hideLoading()
        wx.showToast({ title: '赛事列表加载失败，请稍后重试', icon: 'none' })
      })
    }
  },

  // 赛事选项复用公开赛事目录首页（最近 20 场），不另开接口、不按名称合并
  loadTransferEventOptions: function () {
    var that = this
    if (this._transferEventOptions && this._transferEventOptions.length) {
      return Promise.resolve(this._transferEventOptions)
    }
    return this.fetchEventPage(1).then(function (rows) {
      var list = [{ key: 'event-all', value: '', text: '全部赛事' }]
      var seen = {}
      for (var i = 0; i < (rows || []).length; i += 1) {
        var row = rows[i] || {}
        var id = String(row._id || row.id || '')
        if (!id || seen[id]) continue
        seen[id] = true
        var name = String(row.name || row.title || '').trim()
        if (!name) continue
        list.push({ key: 'event-' + id, value: id, text: name })
      }
      that._transferEventOptions = list
      return list
    })
  },

  openTransferScopeSheet: function (scope, title, desc, list) {
    var selected = scope === 'event' ? this._transferTournamentId : this._transferAgeGroupId
    this._transferSheetScope = scope
    this.setData({
      transferScopeSheetVisible: true,
      transferScopeSheetKey: scope,
      transferScopeSheetTitle: title,
      transferScopeSheetDesc: desc,
      transferScopeOptions: model.showcaseScopeOptions(list, selected)
    })
  },

  // 切换范围时先让旧请求结果失效，避免旧范围数据覆盖新选择
  applyTransferScopeLoading: function () {
    this._transferSeq = (this._transferSeq || 0) + 1
    this._transferLoading = false
    this.setTabState('transfer', { state: 'loading', title: '正在按所选范围加载…' })
  },

  onTransferScopePick: function (event) {
    var value = String(event.currentTarget.dataset.value || '')
    var scope = this._transferSheetScope || ''
    this._transferSheetScope = ''
    this.setData({ transferScopeSheetVisible: false, transferScopeOptions: [] })
    if (scope === 'event') {
      if (value === this._transferTournamentId) return
      this._transferTournamentId = value
      // 换赛事后年龄段口径失效：清空等新赛事名单回包再选
      this._transferAgeGroupId = ''
      this._transferAgeGroups = []
      this._transferLoaded = false
      this.applyTransferScopeLoading()
      this.loadTransfer('scope')
      return
    }
    if (scope === 'age') {
      if (value === this._transferAgeGroupId) return
      this._transferAgeGroupId = value
      this._transferLoaded = false
      this.applyTransferScopeLoading()
      this.loadTransfer('scope')
    }
  },

  onTransferScopeClose: function () {
    this._transferSheetScope = ''
    this.setData({ transferScopeSheetVisible: false, transferScopeOptions: [] })
  },

  onTransferToggleFilter: function () {
    var open = !this.data.transferFilterOpen
    this.setData({
      transferFilterOpen: open,
      transferFilterToggleText: open ? '收起筛选' : '筛选查询'
    }, function () {
      if (open && typeof wx.pageScrollTo === 'function') {
        wx.pageScrollTo({ selector: '.filter-panel', duration: 220 })
      }
    })
  },

  // 位置筛选在已取回的球员行上生效，不重新请求、不重算身价
  onTransferPositionTap: function (event) {
    var key = String(event.currentTarget.dataset.key || 'all')
    if (key === this.data.transferPositionKey) return
    var source = this._transferPlayerSource || []
    var rows = model.filterShowcasePlayers(source, key)
    rows = model.matchKeyword(rows, this._transferSearchKeyword || '', ['playerName', 'metaText'])
    this._transferPositionKey = key
    this.setData({
      transferPositionKey: key,
      transferPositionChips: model.showcasePositionChips(source, key),
      transferPlayers: rows,
      hasTransferPlayers: rows.length > 0,
      showTransferPlayerEmpty: rows.length === 0,
      transferPlayerEndText: this._transferSearchKeyword ? '本页匹配 ' + rows.length + ' 位球员' : (this._transferPlayerEndText || ''),
      transferPlayerEmptyText: this._transferSearchKeyword ? '已展示球员中暂无匹配结果' : key === 'all'
        ? (this._transferPlayerEmptyText || '暂无完成身价测算的球员，平台测算后在此展示')
        : '该位置暂无球员'
    })
  },

  onTransferFocusTap: function () {
    var focus = this.data.transferFocus || {}
    if (!focus.visible) return
    wx.showModal({
      title: focus.playerName || '转会焦点',
      content: focus.detailText || '暂无可公开的转会明细。',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  // 身价条目只做只读详情，不展示成交金额、也不跳转需要赛事权限的球员页
  onTransferRankRowTap: function (event) {
    var index = Number(event.currentTarget.dataset.index || 0)
    var item = (this.data.transferRankRows || [])[index]
    if (!item) return
    wx.showModal({ title: item.playerName, content: item.detailText || '该球员暂无可展示的身价明细。', showCancel: false, confirmText: '知道了' })
  },

  // 公开球员资料页仍未开放（2026-10-27 用户确认）；开放后查看需消耗蜂蜜滴数，标准未定，不在页面写死数量
  onTransferPlayerTap: function (event) {
    var index = Number(event.currentTarget.dataset.index || 0)
    var item = (this.data.transferPlayers || [])[index]
    if (!item) return
    var content = (item.detailText || '暂无身价摘要。') + '\n\n公开球员资料页暂未开放；开放后查看球员资料需消耗蜂蜜滴数（消耗标准待定）。'
    wx.showModal({ title: item.playerName, content: content, showCancel: false, confirmText: '知道了' })
  },

  onTransferFeedTap: function (event) {
    var index = Number(event.currentTarget.dataset.index || 0)
    var item = (this.data.transferDynamicItems || [])[index]
    if (!item) return
    wx.showModal({ title: item.playerName, content: item.detailText || '暂无可公开的转会明细。', showCancel: false, confirmText: '知道了' })
  },

  // 发现不能自己选赛事：切到赛事栏，由用户打开具体赛事后进入转会中心
  onTransferOpenEvents: function () {
    wx.showToast({ title: '请在赛事中打开具体赛事，进入转会中心', icon: 'none' })
    setTimeout(function () {
      wx.switchTab({ url: '/pages/event/index' })
    }, 600)
  },

  onTogglePublish: function () {
    if (this.data.isGuest) {
      this.promptLogin()
      return
    }
    if (!this.data.canWrite) {
      wx.showToast({ title: '请先切换到球队管理者', icon: 'none' })
      return
    }
    this.setData({ publishMenuVisible: !this.data.publishMenuVisible })
  },

  onPickPublish: function (event) {
    var kind = String(event.currentTarget.dataset.kind || '')
    this.setData({ publishMenuVisible: false })
    // 发布字段与权限已按交接标准设计，服务端发布接口未接入，不伪造成功
    if (kind === 'recruit') {
      wx.showToast({ title: '球队招募发布待接入', icon: 'none' })
      return
    }
    wx.showToast({ title: '球队动态发布待接入', icon: 'none' })
  },

  onStartRecord: function () {
    if (this.data.isGuest) {
      this.promptLogin()
      return
    }
    if (!this.data.canWrite) {
      wx.showToast({ title: '请先切换到球队管理者', icon: 'none' })
      return
    }
    this.navigateOnce('/packageDiscover/pages/record/record')
  },

  // 发起约球沿用现有创建流程：quick-create 内再进入邀约海报页
  onStartInvite: function () {
    if (this.data.isGuest) {
      this.promptLogin()
      return
    }
    if (!this.data.canWrite) {
      wx.showToast({ title: '请先切换到球队管理者', icon: 'none' })
      return
    }
    this.navigateOnce('/pages/tournament/quick-create/quick-create')
  },

  // 连点保护：同一次跳转未完成前不再响应第二次点击
  navigateOnce: function (url) {
    if (!url) return
    if (this._navigating) return
    this._navigating = true
    var that = this
    wx.navigateTo({
      url: url,
      complete: function () {
        setTimeout(function () { that._navigating = false }, 400)
      }
    })
  },

  onOpenReport: function (event) {
    var id = String(event.currentTarget.dataset.id || '')
    if (!id) return
    this.navigateOnce('/packageDiscover/pages/record/record?id=' + encodeURIComponent(id))
  },

  onDeleteFriendly: function (event) {
    var that = this
    var id = String(event.currentTarget.dataset.id || '')
    if (!id) return
    wx.showModal({
      title: '删除这场记录',
      content: '删除后战报、海报与简讯一起移除，无法恢复。',
      confirmText: '删除',
      confirmColor: '#c0423a',
      success: function (res) {
        if (!res.confirm) return
        that.callFriendlyAction('deleteFriendlyMatch', id, '已删除')
      }
    })
  },

  onPromoteFriendly: function (event) {
    var that = this
    var id = String(event.currentTarget.dataset.id || '')
    if (!id) return
    wx.showModal({
      title: '转入正式数据',
      content: '这场友谊赛会计入本队正式战绩，仍不进官方赛事排名与榜单。',
      confirmText: '转入',
      success: function (res) {
        if (!res.confirm) return
        that.callFriendlyAction('promoteFriendlyMatch', id, '已计入正式战绩')
      }
    })
  },

  callFriendlyAction: function (action, id, successText) {
    var that = this
    if (!wx.cloud) {
      wx.showToast({ title: '当前环境不支持操作', icon: 'none' })
      return
    }
    if (this._actionBusy) return
    this._actionBusy = true
    wx.showLoading({ title: '处理中', mask: true })
    wx.cloud.callFunction({
      name: 'friendlyMatchCenter',
      data: { action: action, matchId: id }
    }).then(function (response) {
      wx.hideLoading()
      that._actionBusy = false
      var result = (response && response.result) || {}
      if (!result.ok) {
        wx.showToast({ title: String(result.message || '操作失败'), icon: 'none' })
        return
      }
      wx.showToast({ title: successText, icon: 'success' })
      that.loadFeed('refresh')
    }).catch(function (error) {
      wx.hideLoading()
      that._actionBusy = false
      console.warn('[discover] 友谊赛操作失败', error && (error.errMsg || error.message))
      wx.showToast({ title: '操作失败，请稍后重试', icon: 'none' })
    })
  },

  onOpenEventCenter: function (event) {
    var id = String(event.currentTarget.dataset.id || '')
    if (!id) {
      wx.showToast({ title: '赛事ID缺失，暂时无法打开', icon: 'none' })
      return
    }
    // 仓库内只注册了 pages/public-tournament-center/index，旧 public-tournament-center/public-tournament-center 路径不存在
    this.navigateOnce('/pages/public-tournament-center/index?hash=event-' + encodeURIComponent(id))
  },

  onOpenPublicCenter: function () {
    this.navigateOnce('/pages/public-tournament-center/index')
  },

  onEventCoverError: function (event) {
    var key = String((event.currentTarget.dataset || {}).key || '')
    if (!key) return
    var items = this.data.eventItems || []
    var index = -1
    for (var i = 0; i < items.length; i += 1) {
      if (items[i].key === key) {
        index = i
        break
      }
    }
    if (!(index >= 0)) return
    var patch = {}
    patch['eventItems[' + index + '].cover'] = model.FALLBACK_COVER
    this.setData(patch)
  },

  promptLogin: function () {
    var that = this
    wx.showModal({
      title: '需要登录',
      content: '登录后可使用记分、发布和约球功能。',
      confirmText: '去登录',
      cancelText: '继续浏览',
      success: function (res) {
        if (res.confirm) that.onGoLogin()
      }
    })
  },

  onGoLogin: function () {
    wx.navigateTo({ url: '/pages/login/login' })
  },

  onShareAppMessage: function () {
    return {
      title: '赛小蜂足球 · 动态、赛事与约球',
      path: '/pages/discover/discover',
      imageUrl: '/images/brand/logo-saixiaofeng-football.png'
    }
  },

  onShareTimeline: function () {
    return {
      title: '赛小蜂足球 · 动态、赛事与约球',
      imageUrl: '/images/brand/logo-saixiaofeng-football.png'
    }
  }
})
