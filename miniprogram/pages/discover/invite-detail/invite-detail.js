// pages/discover/invite-detail/invite-detail.js
// 约球邀约详情与个人报名页
// 约束：
// 1. 报名人数、签到人数、截止、满员与关闭状态一律以服务端 getInviteDetail 回执为准，页面不自行推算；
// 2. 查看详情、分享、重试、返回刷新都用同一个 inviteId；旧 token 链接读取成功后回填 inviteId；
// 3. 失败保留已填姓名与所选阵营；成功以服务端回执为准并重新拉取同一邀约；
// 4. 所有条件与派生文案在这里预计算，WXML 只做简单插值。

var workspace = require('../../../utils/workspace')

var STATUS_CLASS = {
  open: 'status-badge status-open',
  full: 'status-badge status-full',
  closed: 'status-badge status-closed',
  deadline: 'status-badge status-closed',
  cancelled: 'status-badge status-cancelled',
  wait: 'status-badge'
}

var STATUS_TEXT = {
  open: '报名中',
  full: '已满',
  closed: '已截止',
  deadline: '已截止',
  cancelled: '已取消',
  wait: '状态待确认'
}

var ACTION_ERROR_TEXT = {
  INVALID_PARAM: '参数不正确，请检查后重试',
  UNAUTHORIZED: '请先登录后再操作',
  FORBIDDEN: '只有发起球队管理者可以操作',
  NOT_FOUND: '邀约不存在或已取消',
  CLOSED: '报名已截止或活动已关闭',
  FULL: '报名人数已满',
  SIGNUP_REQUIRED: '请先报名后再签到',
  NOT_SIGNED_UP: '你还没有报名这场约球',
  ALREADY_PRESENT: '已签到，不能取消报名',
  NOT_MATCH_DAY: '仅比赛当天可以签到或代签',
  CONFLICT: '提交过于频繁，请稍后重试',
  UNKNOWN_ACTION: '该接口尚未发布，请联系管理员'
}

function text(value) {
  return value == null ? '' : String(value).trim()
}

function pad2(value) {
  var str = String(value)
  return str.length < 2 ? '0' + str : str
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  var num = Number(value)
  if (!isFinite(num) || num < 0) return null
  return Math.round(num)
}

// 日期只取服务端已登记的 YYYY-MM-DD，避免设备时区导致日期错位
function dayLabel(value) {
  var match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return ''
  return Number(match[2]) + '月' + Number(match[3]) + '日'
}

function clockLabel(value) {
  var match = text(value).match(/(\d{1,2}):(\d{2})/)
  if (!match) return ''
  return pad2(Number(match[1])) + ':' + pad2(Number(match[2]))
}

function timeText(value) {
  var date = value instanceof Date ? value : new Date(value)
  if (!date || isNaN(date.getTime())) return ''
  var shifted = new Date(date.getTime() + 8 * 3600 * 1000)
  return (shifted.getUTCMonth() + 1) + '月' + shifted.getUTCDate() + '日 ' +
    pad2(shifted.getUTCHours()) + ':' + pad2(shifted.getUTCMinutes())
}

Page({
  data: {
    inviteId: '',
    token: '',

    loading: true,
    loadError: false,
    errorText: '',
    showContent: false,

    isGuest: true,

    teamName: '',
    teamLogo: '/images/logo.png',
    teamCity: '',
    hasTeamCity: false,

    titleText: '',
    venueText: '',
    hasAddress: false,
    addressText: '',
    deadlineText: '',
    createdText: '',
    hasCreated: false,

    statusKind: 'wait',
    statusText: '状态待确认',
    statusClass: 'status-badge',

    hasBattleCry: false,
    battleCryLines: [],

    signupText: '报名数据待确认',
    hasSignupData: false,
    signupDetailText: '',
    hasSignupDetail: false,
    presentText: '',
    hasPresent: false,
    responseText: '',
    hasResponse: false,

    hasClosedNotice: false,
    closedNoticeText: '',

    showLogin: false,
    showSignupForm: false,
    canSignUp: false,
    canCancel: false,
    canManage: false,

    hasMySignup: false,
    mySignupText: '',
    mySignupPresent: false,
    mySignupPresentText: '',

    hasCheckIn: false,
    canSelfCheckIn: false,
    checkInText: '',

    side: 'home',
    sideHomeClass: 'side-btn side-btn-active',
    sideAwayClass: 'side-btn',
    name: '',
    submitting: false,
    signupBtnClass: 'submit-btn',
    signupBtnText: '提交报名',

    signupRows: [],
    hasSignupRows: false,
    signupTotalText: '',
    teamRows: [],
    hasTeamRows: false
  },

  onLoad: function (options) {
    var opts = options || {}
    var inviteId = text(opts.inviteId)
    var token = text(opts.token)
    if (!inviteId && !token) {
      this.setData({
        loading: false,
        loadError: true,
        errorText: '缺少邀约标识，请从邀约分享或发现页进入。'
      })
      return
    }
    this.setData({
      inviteId: inviteId,
      token: token,
      isGuest: !workspace.hasAuthenticatedUser()
    })
    this.loadInvite()
  },

  // 返回刷新：只复用同一 inviteId，重新拉取服务端回执
  onShow: function () {
    if (!this._loadedOnce) return
    if (this._loading) return
    if (!this.data.inviteId && !this.data.token) return
    this.loadInvite({ silent: true })
  },

  onPullDownRefresh: function () {
    if (this._loading) {
      wx.stopPullDownRefresh()
      return
    }
    if (!this.data.inviteId && !this.data.token) {
      wx.stopPullDownRefresh()
      return
    }
    this.loadInvite({ silent: true, stopPull: true })
  },

  loadInvite: function (options) {
    var that = this
    var opts = options || {}
    if (this._loading) {
      if (opts.stopPull) wx.stopPullDownRefresh()
      return
    }
    this._loading = true
    if (!opts.silent) this.setData({ loading: true, loadError: false, errorText: '', showContent: false })
    wx.cloud.callFunction({
      name: 'friendlyMatchCenter',
      data: {
        action: 'getInviteDetail',
        inviteId: this.data.inviteId,
        token: this.data.token
      }
    }).then(function (res) {
      that._loading = false
      that._loadedOnce = true
      if (opts.stopPull) wx.stopPullDownRefresh()
      var result = (res && res.result) || {}
      if (!result.ok) {
        that.applyLoadError(result)
        return
      }
      that.applyDetail(result.data || {})
    }).catch(function (error) {
      that._loading = false
      that._loadedOnce = true
      if (opts.stopPull) wx.stopPullDownRefresh()
      that.setData({
        loading: false,
        loadError: true,
        errorText: '网络读取失败，请重试。',
        showContent: false
      })
      console.warn('[invite-detail] 邀约读取失败', error && (error.errMsg || error.message))
    })
  },

  applyLoadError: function (result) {
    var code = text(result && result.code)
    var message = ACTION_ERROR_TEXT[code] || text(result && result.message) || '邀约读取失败'
    this.setData({
      loading: false,
      loadError: true,
      errorText: message,
      showContent: false
    })
  },

  applyDetail: function (payload) {
    var data = payload || {}
    var invite = data.invite || {}
    var counts = invite.counts || {}
    var windowState = invite.signupWindow || {}
    var mySignup = invite.mySignup || null
    var checkIn = invite.checkIn || {}
    var canManage = invite.canManage === true
    var isGuest = !workspace.hasAuthenticatedUser()

    var day = dayLabel(invite.matchDate)
    var clock = clockLabel(invite.matchTime)
    var titleText = day ? (clock ? day + ' ' + clock : day) : '比赛时间待协商'

    var signupOpen = windowState.open === true
    var kind = text(windowState.kind)
    if (kind === 'deadline') kind = 'closed'
    if (kind === 'full') kind = 'full'
    if (kind === 'cancelled') kind = 'cancelled'
    if (kind === 'closed') kind = 'closed'
    if (kind === 'open') kind = 'open'
    if (!kind) {
      kind = text(invite.status) === 'open' ? 'open' : 'cancelled'
    }
    var closedKind = kind === 'closed' || kind === 'cancelled'

    // 计数口径：有效报名只认服务端 signupCount；历史邀约没有 signupSchema 时显示待确认
    var hasSignupData = counts.hasSignupData === true && numberOrNull(counts.signupCount) !== null
    var signupCount = hasSignupData ? numberOrNull(counts.signupCount) : null
    var maxPlayers = numberOrNull(counts.maxPlayers)
    var homeCount = numberOrNull(counts.signupHomeCount)
    var awayCount = numberOrNull(counts.signupAwayCount)
    var presentCount = hasSignupData ? numberOrNull(counts.presentCount) : null
    var legacyPresent = numberOrNull(counts.legacySignedInCount)

    var signupText = '报名数据待确认'
    var signupDetailText = ''
    if (hasSignupData) {
      signupText = maxPlayers !== null && maxPlayers > 0
        ? signupCount + ' / ' + maxPlayers + ' 人已报名'
        : signupCount + ' 人已报名 · 未设限额'
      signupDetailText = '本方 ' + (homeCount || 0) + ' 人 · 对方 ' + (awayCount || 0) + ' 人'
    } else {
      signupDetailText = '该邀约尚未接入个人报名统计'
    }

    var presentText = ''
    if (hasSignupData && presentCount !== null && presentCount > 0) presentText = '已签到 ' + presentCount + ' 人'
    else if (!hasSignupData && legacyPresent !== null && legacyPresent > 0) presentText = '历史签到 ' + legacyPresent + ' 人'

    var accepted = numberOrNull(counts.acceptedCount) || 0
    var responseText = accepted > 0 ? '已收到 ' + accepted + ' 支球队应战' : '还没有球队应战'

    var battleCry = invite.battleCry || null
    var battleCryLines = []
    if (battleCry) {
      if (Array.isArray(battleCry.lines)) {
        battleCryLines = battleCry.lines.map(function (line) { return text(line) }).filter(Boolean)
      }
      var battleCryText = text(battleCry.text)
      if (!battleCryLines.length && battleCryText) {
        battleCryLines = battleCryText.split('\n').map(function (line) { return text(line) }).filter(Boolean)
      }
    }

    var hasMySignup = Boolean(mySignup)
    var sideText = mySignup && text(mySignup.side) === 'away' ? '对方' : '本方'
    var mySignupText = hasMySignup
      ? ('你已以「' + text(mySignup.name) + '」报名 · ' + sideText)
      : ''
    var mySignupPresent = Boolean(mySignup && mySignup.present)

    // 签到状态由服务端判定；未报名直接签到必须被拒绝，页面不暗自补报名
    var checkInKind = text(checkIn.kind)
    var canSelfCheckIn = checkIn.allowed === true && !isGuest
    var checkInText = text(checkIn.reason)
    if (checkInKind === 'ready') checkInText = '比赛当天可签到，签到不增加报名人数'
    if (checkInKind === 'present') checkInText = '你已完成签到'
    if (checkInKind === 'signup_required') checkInText = '未报名不能签到，请先报名'
    if (checkInKind === 'not_match_day') checkInText = '仅比赛当天可以签到'

    var signupRows = []
    if (canManage) {
      signupRows = (data.signups || []).map(function (row) {
        var present = row.present === true
        return {
          signupId: text(row.signupId),
          name: text(row.name) || '参与者待核验',
          sideText: text(row.side) === 'away' ? '对方' : '本方',
          present: present,
          statusText: present ? '已签到' : '未签到',
          statusClass: present ? 'row-badge row-badge-present' : 'row-badge',
          canManualSignIn: !present,
          manualText: present ? '已签到' : '代签'
        }
      })
    }
    var presentTotal = 0
    signupRows.forEach(function (row) { if (row.present) presentTotal += 1 })
    var signupTotalText = canManage && signupRows.length
      ? '共 ' + signupRows.length + ' 人报名，已签到 ' + presentTotal + ' 人'
      : ''

    var teamRows = []
    if (canManage) {
      teamRows = (data.teamResponses || []).map(function (row) {
        var acceptedRow = text(row.status) === 'accepted'
        return {
          responseId: text(row.responseId),
          teamName: text(row.teamName) || '球队待核验',
          statusText: acceptedRow ? '已应战' : '已拒绝',
          statusClass: acceptedRow ? 'row-badge row-badge-present' : 'row-badge'
        }
      })
    }

    var showSignupForm = signupOpen && !hasMySignup && !isGuest
    var showLogin = signupOpen && !hasMySignup && isGuest

    this.setData({
      inviteId: text(invite.inviteId) || this.data.inviteId,
      loading: false,
      loadError: false,
      errorText: '',
      showContent: true,
      isGuest: isGuest,
      teamName: text(invite.teamName) || '发起球队待核验',
      teamLogo: text(invite.teamLogo) || '/images/logo.png',
      teamCity: text(invite.teamCity),
      hasTeamCity: Boolean(text(invite.teamCity)),
      titleText: titleText,
      venueText: text(invite.venue) || '场地待协商',
      hasAddress: Boolean(text(invite.venueAddress)),
      addressText: text(invite.venueAddress),
      deadlineText: invite.deadline ? '截止 ' + (dayLabel(invite.deadline) || '时间待确认') : '未设截止时间',
      createdText: invite.createdAt ? '发起于 ' + timeText(invite.createdAt) : '',
      hasCreated: Boolean(invite.createdAt && timeText(invite.createdAt)),
      statusKind: kind,
      statusText: STATUS_TEXT[kind] || '状态待确认',
      statusClass: STATUS_CLASS[kind] || 'status-badge',
      hasBattleCry: Boolean(battleCryLines.length),
      battleCryLines: battleCryLines,
      signupText: signupText,
      hasSignupData: hasSignupData,
      signupDetailText: signupDetailText,
      hasSignupDetail: Boolean(signupDetailText),
      presentText: presentText,
      hasPresent: Boolean(presentText),
      responseText: responseText,
      hasResponse: accepted > 0,
      hasClosedNotice: closedKind,
      closedNoticeText: closedKind
        ? (kind === 'cancelled' ? '活动已取消，不能再报名。' : '报名已结束：' + (text(windowState.reason) || '已截止或已满员'))
        : '',
      showLogin: showLogin,
      showSignupForm: showSignupForm,
      canSignUp: signupOpen && !hasMySignup && !isGuest,
      canCancel: invite.canCancel === true,
      canManage: canManage,
      hasMySignup: hasMySignup,
      mySignupText: mySignupText,
      mySignupPresent: mySignupPresent,
      mySignupPresentText: mySignupPresent ? '已签到' : '',
      hasCheckIn: hasMySignup,
      canSelfCheckIn: hasMySignup && !mySignupPresent && canSelfCheckIn,
      checkInText: checkInText,
      signupRows: signupRows,
      hasSignupRows: signupRows.length > 0,
      signupTotalText: signupTotalText,
      teamRows: teamRows,
      hasTeamRows: teamRows.length > 0
    })
  },

  onPickSide: function (event) {
    var side = text((event.currentTarget.dataset || {}).side)
    if (side !== 'home' && side !== 'away') return
    if (this.data.submitting) return
    this.setData({
      side: side,
      sideHomeClass: side === 'home' ? 'side-btn side-btn-active' : 'side-btn',
      sideAwayClass: side === 'away' ? 'side-btn side-btn-active' : 'side-btn'
    })
  },

  onNameInput: function (event) {
    this.setData({ name: text(event.detail.value) })
  },

  onSubmitSignup: function () {
    var that = this
    if (this._submitting) return
    if (!this.data.inviteId) {
      wx.showToast({ title: '缺少邀约标识', icon: 'none' })
      return
    }
    if (this.data.isGuest) {
      this.onGoLogin()
      return
    }
    var name = text(this.data.name)
    if (!name) {
      wx.showToast({ title: '请填写报名姓名', icon: 'none' })
      return
    }
    if (name.length > 20) {
      wx.showToast({ title: '姓名不能超过 20 个字', icon: 'none' })
      return
    }
    this._submitting = true
    this.setData({ submitting: true, signupBtnClass: 'submit-btn is-disabled', signupBtnText: '提交中…' })
    wx.cloud.callFunction({
      name: 'friendlyMatchCenter',
      data: {
        action: 'signUpForInvite',
        inviteId: this.data.inviteId,
        side: this.data.side,
        name: name
      }
    }).then(function (res) {
      that.endSubmit()
      var result = (res && res.result) || {}
      if (!result.ok) {
        that.handleActionError(result)
        return
      }
      var payload = result.data || {}
      wx.showToast({ title: payload.alreadySignedUp ? '已经报过名了' : '报名成功', icon: 'none' })
      that.loadInvite({ silent: true })
    }).catch(function (error) {
      that.endSubmit()
      wx.showToast({ title: '网络失败，请重试', icon: 'none' })
      console.warn('[invite-detail] 报名失败', error && (error.errMsg || error.message))
    })
  },

  endSubmit: function () {
    this._submitting = false
    this.setData({ submitting: false, signupBtnClass: 'submit-btn', signupBtnText: '提交报名' })
  },

  onCancelSignup: function () {
    var that = this
    wx.showModal({
      title: '取消报名',
      content: '取消后名额会释放，可能被其他参与者占用。',
      confirmText: '取消报名',
      confirmColor: '#c0423a',
      success: function (res) {
        if (!res.confirm) return
        that.runAction('cancelInviteSignup', { inviteId: that.data.inviteId }, '已取消报名')
      }
    })
  },

  onSelfCheckIn: function () {
    var that = this
    wx.showModal({
      title: '本人签到',
      content: '确认已到场？签到只增加签到人数，不改变报名人数。',
      confirmText: '确认签到',
      success: function (res) {
        if (!res.confirm) return
        that.runAction('signInInvite', { inviteId: that.data.inviteId }, '签到成功')
      }
    })
  },

  onManualSignIn: function (event) {
    var signupId = text((event.currentTarget.dataset || {}).signupid)
    if (!signupId) return
    this.runAction('manualSignInInvite', {
      inviteId: this.data.inviteId,
      signupId: signupId
    }, '已代签')
  },

  runAction: function (action, payload, successText) {
    var that = this
    if (this._acting) return
    if (!wx.cloud) {
      wx.showToast({ title: '当前环境不支持操作', icon: 'none' })
      return
    }
    this._acting = true
    wx.showLoading({ title: '处理中…', mask: true })
    wx.cloud.callFunction({
      name: 'friendlyMatchCenter',
      data: Object.assign({ action: action }, payload || {})
    }).then(function (res) {
      wx.hideLoading()
      that._acting = false
      var result = (res && res.result) || {}
      if (!result.ok) {
        that.handleActionError(result)
        return
      }
      var data = result.data || {}
      wx.showToast({
        title: data.alreadyCanceled ? '已经取消过报名' : (data.alreadySignedIn ? '已经签到过了' : successText),
        icon: 'none'
      })
      that.loadInvite({ silent: true })
    }).catch(function (error) {
      wx.hideLoading()
      that._acting = false
      wx.showToast({ title: '网络失败，请重试', icon: 'none' })
      console.warn('[invite-detail] 操作失败 ' + action, error && (error.errMsg || error.message))
    })
  },

  handleActionError: function (result) {
    var code = text(result && result.code)
    var message = ACTION_ERROR_TEXT[code] || text(result && result.message) || '操作失败，请重试'
    wx.showToast({ title: message, icon: 'none', duration: 2500 })
    // 截止、满员、关闭或邀约消失时，重新拉取同一邀约以同步服务端状态
    if (code === 'CLOSED' || code === 'FULL' || code === 'NOT_FOUND' || code === 'NOT_MATCH_DAY') {
      this.loadInvite({ silent: true })
    }
  },

  onGoLogin: function () {
    var inviteId = this.data.inviteId
    if (!inviteId) {
      wx.navigateTo({ url: '/pages/login/login' })
      return
    }
    var redirect = '/pages/discover/invite-detail/invite-detail?inviteId=' + encodeURIComponent(inviteId)
    wx.navigateTo({ url: '/pages/login/login?redirect=' + encodeURIComponent(redirect) })
  },

  onRetry: function () {
    this.loadInvite()
  },

  onShareAppMessage: function () {
    var inviteId = this.data.inviteId
    return {
      title: (this.data.teamName || '球队') + ' 约球邀约',
      path: inviteId
        ? '/pages/discover/invite-detail/invite-detail?inviteId=' + encodeURIComponent(inviteId)
        : '/pages/discover/discover',
      imageUrl: '/images/brand/logo-saixiaofeng-football.png'
    }
  }
})
