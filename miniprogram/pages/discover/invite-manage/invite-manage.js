// pages/discover/invite-manage/invite-manage.js
// 约球管理页（球队端）：报名名单 / 现场签到 / 代签 / 移除报名 / 取消邀约 / 成局 / 流局 / 提醒 / 复制报名链接
// 2026-11-02 口径：状态机（open / accepted / confirmed / cancelled / closed）与三个数字都由
// friendlyMatchCenter 服务端持有，本页只展示服务端结果并转发操作，不在端上推导状态。

function text(value) {
  return value == null ? '' : String(value).trim()
}

// 服务端未记录该计数时显示「待确认」，不显示 0
function countText(value) {
  if (value === null || value === undefined || value === '') return '待确认'
  var num = Number(value)
  return isFinite(num) ? String(Math.round(num)) : '待确认'
}

var STATUS_CLASS = {
  open: 'is-open',
  accepted: 'is-accepted',
  confirmed: 'is-confirmed',
  cancelled: 'is-terminal',
  closed: 'is-terminal'
}

function buildFilters(active, counts) {
  var defs = [
    { id: 'all', label: '全部' },
    { id: 'signup', label: '已报名' },
    { id: 'present', label: '已签到' },
    { id: 'team', label: '队伍应战' }
  ]
  return defs.map(function (def) {
    var total = counts && typeof counts[def.id] === 'number' ? counts[def.id] : null
    return {
      id: def.id,
      text: total === null ? def.label : def.label + ' ' + total,
      itemClass: def.id === active ? 'filter-chip is-on' : 'filter-chip'
    }
  })
}

// 名单行：服务端已按 kind 区分球员报名 / 队伍应战，这里只做展示与按钮预计算
function formatRow(row) {
  var roleSignup = text(row.kind) === 'signup'
  var status = text(row.status)
  var active = status === 'signup' || status === 'present'
  var present = row.present === true
  var subParts = []
  if (row.sideText) subParts.push(text(row.sideText))
  if (row.phoneMasked) subParts.push(text(row.phoneMasked))
  if (row.proxy === true) subParts.push('代签')
  return {
    key: 'row-' + text(row.responseId),
    responseId: text(row.responseId),
    roleSignup: roleSignup,
    roleTeam: !roleSignup,
    titleText: roleSignup ? (text(row.userName) || '未填姓名') : (text(row.teamName) || '球队待核验'),
    tagText: roleSignup ? '球员报名' : '队伍应战',
    tagClass: roleSignup ? 'row-tag is-signup' : 'row-tag is-team',
    subText: subParts.join(' · '),
    statusText: text(row.statusText) || '状态待确认',
    statusClass: present ? 'row-status is-present' : 'row-status',
    present: present,
    showActions: roleSignup && active,
    canCheck: roleSignup && active,
    checkText: present ? '取消签到' : '勾签到',
    checkClass: present ? 'row-btn is-on' : 'row-btn',
    checkTarget: present ? '0' : '1',
    canRemove: roleSignup && active
  }
}

Page({
  data: {
    inviteId: '',
    loading: true,
    errorText: '',
    busyText: '',

    teamName: '',
    titleText: '',
    venueText: '',
    statusText: '状态待确认',
    statusClass: 'is-open',
    deadlineText: '',
    signupNumText: '',
    checkinNumText: '',
    acceptedNumText: '',
    acceptedTeamText: '',
    closedReasonText: '',
    hasClosedReason: false,
    canOperate: false,
    canConfirm: false,
    signinUrl: '',
    hasSigninUrl: false,

    filters: [],
    filter: 'all',
    rows: [],
    hasRows: false,
    emptyText: '',
    hasMore: false,
    loadingMore: false,
    moreText: '加载更多',
    scanLimited: false,

    proxyVisible: false,
    proxyName: '',
    proxyPhone: '',
    proxySide: 'own',
    proxyOwnClass: 'side-btn is-on',
    proxyOppClass: 'side-btn',
    proxyBusy: false,
    proxyBtnText: '确认代签'
  },

  onLoad: function (query) {
    var inviteId = text(query && (query.inviteId || query.id))
    if (!inviteId) {
      this.setData({ loading: false, errorText: '缺少邀约 ID，请从发现页约球卡片进入' })
      return
    }
    this.setData({ inviteId: inviteId, filters: buildFilters('all', null) })
    this.loadPage(1, false)
  },
  request: function (action, payload) {
    return wx.cloud.callFunction({
      name: 'friendlyMatchCenter',
      data: Object.assign({ action: action }, payload || {})
    }).then(function (res) {
      return (res && res.result) || {}
    })
  },

  showError: function (result, fallback) {
    var code = text(result && result.code)
    var message = text(result && result.message) || fallback || '操作失败，请重试'
    if (code === 'UNKNOWN_ACTION') message = '管理接口待发布，请等云函数差量发布完成后再操作'
    else if (code === 'FORBIDDEN') message = '只有发起球队管理者可以管理这条约球'
    else if (code === 'UNAUTHORIZED') message = '登录状态已变化，请重新登录后再试'
    wx.showModal({ title: '操作未完成', content: message, showCancel: false })
  },

  toast: function (title, icon) {
    wx.showToast({ title: title, icon: icon || 'success' })
  },

  loadPage: function (page, append, done) {
    var that = this
    var data = this.data
    if (!data.inviteId) return Promise.resolve()
    if (append) this.setData({ loadingMore: true, moreText: '正在加载…' })
    return this.request('listInviteSignups', {
      inviteId: data.inviteId,
      page: page,
      pageSize: 20,
      filter: data.filter
    }).then(function (result) {
      if (!result.ok) {
        var message = text(result.message) || '名单读取失败'
        if (text(result.code) === 'UNKNOWN_ACTION') message = '管理接口待发布，请等云函数差量发布完成后再操作'
        that.setData({ loading: false, loadingMore: false, errorText: message, rows: [], hasRows: false })
        return null
      }
      var payload = result.data || {}
      var invite = payload.invite || {}
      var rows = (payload.rows || []).map(formatRow)
      var merged = append ? (that.data.rows || []).concat(rows) : rows
      var counts = payload.counts || {}
      that._page = Number(payload.page) || page
      that._counts = counts
      that.setData(Object.assign(that.invitePatch(invite), {
        loading: false,
        loadingMore: false,
        errorText: '',
        rows: merged,
        hasRows: merged.length > 0,
        emptyText: merged.length ? '' : that.emptyTextOf(invite, that.data.filter),
        hasMore: payload.hasMore === true,
        moreText: payload.hasMore === true ? '加载更多' : '',
        scanLimited: payload.scanLimited === true,
        filters: buildFilters(that.data.filter, counts)
      }))
      if (typeof done === 'function') done(merged)
      return payload
    }).catch(function (error) {
      that.setData({
        loading: false,
        loadingMore: false,
        errorText: '网络错误，请下拉重试',
        rows: append ? that.data.rows : [],
        hasRows: append ? that.data.hasRows : false
      })
      console.warn('[invite-manage] 名单读取失败', error && (error.errMsg || error.message))
      if (typeof done === 'function') done([])
      return null
    })
  },

  emptyTextOf: function (invite, filter) {
    if (filter === 'present') return '还没有人签到。现场到场后勾选签到，或点「代签」补录'
    if (filter === 'team') return '还没有球队接战。可把报名链接发到对方球队群'
    if (filter === 'signup') return '还没有球员报名。把报名链接或海报发给球员即可'
    if (text(invite.signupClosedReason)) return text(invite.signupClosedReason) + '，暂无报名'
    return '还没有报名记录'
  },

  invitePatch: function (invite) {
    invite = invite || {}
    var status = text(invite.status) || 'open'
    var terminal = status === 'cancelled' || status === 'closed'
    var max = Number(invite.maxPlayers) || 0
    var signupKnown = invite.signupCountKnown === false ? false : true
    var reason = text(invite.cancelReason) || text(invite.closeReason)
    var signinUrl = text(invite.signinUrl)
    return {
      teamName: text(invite.teamName) || '本队',
      titleText: [text(invite.matchDate), text(invite.matchTime)].join(' ').trim() || '时间待协商',
      venueText: text(invite.venue) || '场地待协商',
      statusText: text(invite.statusText) || '状态待确认',
      statusClass: STATUS_CLASS[status] || 'is-open',
      deadlineText: text(invite.deadline) ? '报名截止 ' + text(invite.deadline) : '未设报名截止',
      // 三个指标卡只显示数字本身，口径由页面底部说明条解释
      signupNumText: signupKnown
        ? (countText(invite.signupCount) + (max > 0 ? ' / ' + max : ''))
        : '待确认',
      checkinNumText: countText(invite.checkinCount),
      acceptedNumText: countText(invite.acceptedCount),
      acceptedTeamText: text(invite.acceptedTeamName) ? '接战队伍：' + text(invite.acceptedTeamName) : '还没有球队接战',
      closedReasonText: reason,
      hasClosedReason: Boolean(reason),
      canOperate: !terminal,
      canConfirm: status === 'open' || status === 'accepted',
      signinUrl: signinUrl,
      hasSigninUrl: Boolean(signinUrl)
    }
  },

  reload: function (done) {
    return this.loadPage(1, false, done)
  },

  onSwitchFilter: function (event) {
    var id = text((event.currentTarget.dataset || {}).id)
    if (!id || id === this.data.filter) return
    this.setData({ filter: id, rows: [], hasRows: false, filters: buildFilters(id, this._counts || null) })
    this.loadPage(1, false)
  },

  onLoadMore: function () {
    if (!this.data.hasMore || this.data.loadingMore) return
    this.loadPage((this._page || 1) + 1, true)
  },

  // ===== 现场签到 =====
  onTogglePresent: function (event) {
    var that = this
    var dataset = event.currentTarget.dataset || {}
    var responseId = text(dataset.id)
    var on = text(dataset.on) === '1'
    if (!responseId) return
    this.setData({ busyText: '正在更新签到…' })
    this.request('checkInInviteSignup', {
      inviteId: this.data.inviteId,
      responseId: responseId,
      present: on
    }).then(function (result) {
      that.setData({ busyText: '' })
      if (!result.ok) return that.showError(result, '签到更新失败')
      that.toast(on ? '已签到' : '已取消签到')
      that.reload()
    }).catch(function (error) {
      that.setData({ busyText: '' })
      console.warn('[invite-manage] 签到失败', error && (error.errMsg || error.message))
      wx.showToast({ title: '网络错误，请重试', icon: 'none' })
    })
  },

  // ===== 代签 =====
  onOpenProxy: function () {
    this.setData({ proxyVisible: true, proxyName: '', proxyPhone: '', proxySide: 'own', proxyOwnClass: 'side-btn is-on', proxyOppClass: 'side-btn' })
  },
  onCloseProxy: function () {
    this.setData({ proxyVisible: false })
  },
  // 阻止点击弹窗内部冒泡到遮罩
  onStop: function () {},

  onProxyNameInput: function (event) {
    this.setData({ proxyName: text(event.detail.value) })
  },
  onProxyPhoneInput: function (event) {
    this.setData({ proxyPhone: text(event.detail.value).replace(/\D/g, '').slice(0, 11) })
  },
  onProxySide: function (event) {
    var side = text((event.currentTarget.dataset || {}).side) === 'opponent' ? 'opponent' : 'own'
    this.setData({
      proxySide: side,
      proxyOwnClass: side === 'own' ? 'side-btn is-on' : 'side-btn',
      proxyOppClass: side === 'opponent' ? 'side-btn is-on' : 'side-btn'
    })
  },
  onConfirmProxy: function () {
    var that = this
    var data = this.data
    if (data.proxyBusy) return
    if (!data.proxyName) {
      wx.showToast({ title: '请填写到场球员姓名', icon: 'none' })
      return
    }
    if (data.proxyPhone && data.proxyPhone.length !== 11) {
      wx.showToast({ title: '手机号需 11 位，或留空', icon: 'none' })
      return
    }
    this.setData({ proxyBusy: true, proxyBtnText: '处理中…' })
    this.request('proxyCheckInInvite', {
      inviteId: data.inviteId,
      userName: data.proxyName,
      userPhone: data.proxyPhone,
      side: data.proxySide
    }).then(function (result) {
      that.setData({ proxyBusy: false, proxyBtnText: '确认代签' })
      if (!result.ok) return that.showError(result, '代签失败')
      that.setData({ proxyVisible: false })
      that.toast('已代签')
      that.reload()
    }).catch(function (error) {
      that.setData({ proxyBusy: false, proxyBtnText: '确认代签' })
      console.warn('[invite-manage] 代签失败', error && (error.errMsg || error.message))
      wx.showToast({ title: '网络错误，请重试', icon: 'none' })
    })
  },

  // ===== 移除报名 =====
  onRemoveSignup: function (event) {
    var that = this
    var dataset = event.currentTarget.dataset || {}
    var responseId = text(dataset.id)
    var name = text(dataset.name) || '该球员'
    if (!responseId) return
    wx.showModal({
      title: '移除报名',
      content: '确定把「' + name + '」移出报名名单？名额会释放，对方不会收到通知。',
      confirmText: '移除',
      confirmColor: '#C0423A',
      success: function (modalRes) {
        if (!modalRes.confirm) return
        that.request('removeInviteSignup', { inviteId: that.data.inviteId, responseId: responseId })
          .then(function (result) {
            if (!result.ok) return that.showError(result, '移除失败')
            that.toast('已移除')
            that.reload()
          }).catch(function () {
            wx.showToast({ title: '网络错误，请重试', icon: 'none' })
          })
      }
    })
  },

  // ===== 状态机：成局 / 取消 / 流局 =====
  onConfirmInvite: function () {
    var that = this
    wx.showModal({
      title: '确认成局',
      content: '确认后本场约球记为「已成局」，已报名球员会收到成局通知。',
      confirmText: '成局',
      success: function (modalRes) {
        if (!modalRes.confirm) return
        that.request('confirmInvite', { inviteId: that.data.inviteId }).then(function (result) {
          if (!result.ok) return that.showError(result, '成局失败')
          that.toast('已成局')
          that.reload()
        }).catch(function () {
          wx.showToast({ title: '网络错误，请重试', icon: 'none' })
        })
      }
    })
  },

  onCancelInvite: function () {
    this.changeStatus('cancelInvite', '取消邀约', '取消后已报名球员会收到取消通知，且不可恢复。可填取消原因：')
  },

  onAbandonInvite: function () {
    this.changeStatus('abandonInvite', '标记流局', '流局表示本场没打成，已报名球员会收到关闭通知。可填原因：')
  },

  changeStatus: function (action, title, hint) {
    var that = this
    wx.showModal({
      title: title,
      content: hint,
      editable: true,
      placeholderText: '可不填',
      confirmText: '确认',
      confirmColor: action === 'cancelInvite' ? '#C0423A' : '#087A48',
      success: function (modalRes) {
        if (!modalRes.confirm) return
        var reason = text(modalRes.content).slice(0, 40)
        that.request(action, { inviteId: that.data.inviteId, reason: reason }).then(function (result) {
          if (!result.ok) return that.showError(result, title + '失败')
          var notify = result.data && result.data.notify
          var extra = ''
          if (notify) {
            extra = '（通知 ' + (notify.sent || 0) + ' 人，跳过 ' + (notify.skipped || 0) + ' 人）'
            if (notify.templateConfigured === false) extra = '（服务号模板未配置，暂未发送通知）'
          }
          wx.showModal({ title: title + '成功', content: (result.data && result.data.statusText ? '当前状态：' + result.data.statusText + '\n' : '') + extra, showCancel: false })
          that.reload()
        }).catch(function () {
          wx.showToast({ title: '网络错误，请重试', icon: 'none' })
        })
      }
    })
  },

  // ===== 提醒 / 复制链接 =====
  onRemind: function () {
    var that = this
    this.setData({ busyText: '正在发送提醒…' })
    this.request('remindInviteSignups', { inviteId: this.data.inviteId }).then(function (result) {
      that.setData({ busyText: '' })
      if (!result.ok) return that.showError(result, '提醒发送失败')
      var notify = (result.data && result.data.notify) || {}
      var content = notify.templateConfigured === false
        ? '服务号模板消息未配置，本次未发送。请在云函数环境变量补齐模板 ID 后重试。'
        : '已发送 ' + (notify.sent || 0) + ' 人，跳过 ' + (notify.skipped || 0) + ' 人（无 openid 或未关注服务号）'
      wx.showModal({ title: '开赛提醒', content: content, showCancel: false })
    }).catch(function () {
      that.setData({ busyText: '' })
      wx.showToast({ title: '网络错误，请重试', icon: 'none' })
    })
  },

  onCopyLink: function () {
    var url = this.data.signinUrl
    if (!url) {
      wx.showToast({ title: '没有报名链接', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: url,
      success: function () { wx.showToast({ title: '链接已复制', icon: 'success' }) }
    })
  }
})
