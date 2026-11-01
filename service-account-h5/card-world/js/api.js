(function (global) {
  'use strict'
  // 服务号 H5 · 我的球员卡：统一走 webLoginApi；会话复用 sxf_referee_h5_session。
  // 本文件只封装只读/换装接口，不包含会员下单、充值、支付等交易入口。
  var API = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'
  var KEY = 'sxf_referee_h5_session'
  var RETURN_URL = 'https://www.sxffootball.cn/service-account-h5/card-world/index.html'
  // wx-open-launch-weapp 的 username 必须是足球世界小程序的原始 ID（gh_ 开头），
  // 不是 AppID（wxa0ac7d45bcabd140）。值由部署方维护；留空时页面只展示说明、不挂无效按钮。
  var WEAPP_USERNAME = 'gh_6d11304cf55f'

  function sessionToken() {
    try { return localStorage.getItem(KEY) || '' } catch (e) { return '' }
  }

  function clearSession() {
    try { localStorage.removeItem(KEY) } catch (e) { /* ignore */ }
  }

  function post(payload) {
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (response) {
      if (!response.ok) throw new Error('网络异常，请稍后重试')
      return response.json()
    }).then(function (result) {
      if (result && typeof result.body === 'string') return JSON.parse(result.body)
      return result
    })
  }

  function api(action, data) {
    var body = Object.assign({ action: action, serviceSessionToken: sessionToken() }, data || {})
    return post(body).then(function (result) {
      if (!result || result.success !== true) {
        var error = new Error((result && result.error) || '操作失败，请重试')
        error.code = (result && result.code) || ''
        throw error
      }
      return result
    })
  }

  function beginOAuth() {
    return post({ action: 'servicePrivateOAuthUrl', returnUrl: RETURN_URL }).then(function (result) {
      if (!result || !result.success || !result.authorizeUrl) throw new Error((result && result.error) || '微信授权入口暂不可用')
      location.replace(result.authorizeUrl)
    })
  }

  function completeOAuth(code, state) {
    return post({ action: 'servicePrivateOAuth', code: code, state: state }).then(function (result) {
      if (!result || !result.success || !result.refereeSessionToken) throw new Error((result && result.error) || '微信授权失败')
      try { localStorage.setItem(KEY, result.refereeSessionToken) } catch (e) { /* ignore */ }
      try { history.replaceState({}, document.title, location.pathname) } catch (e) { /* ignore */ }
      return result.refereeSessionToken
    })
  }

  function ensureSession() {
    var query = new URLSearchParams(location.search)
    var code = query.get('code')
    var state = query.get('state')
    if (code && state) return completeOAuth(code, state)
    if (sessionToken()) return Promise.resolve(sessionToken())
    return beginOAuth().then(function () { return '' })
  }

  function isWeChat() {
    return /MicroMessenger/i.test(navigator.userAgent || '')
  }

  global.CardWorldApi = {
    KEY: KEY,
    sessionToken: sessionToken,
    clearSession: clearSession,
    ensureSession: ensureSession,
    isWeChat: isWeChat,
    weappUsername: function () { return WEAPP_USERNAME },
    membershipStatus: function () { return api('servicePrivateMembershipStatus') },
    mainCard: function () { return api('cardWorldMainCard') },
    listCards: function () { return api('listMyPlayerCards') },
    getCard: function (playerId) { return api('getMyPlayerCard', { playerId: playerId }) },
    previewCard: function (data) { return api('previewMyPlayerCard', data) },
    saveCard: function (data) { return api('saveMyPlayerCard', data) },
    getPreloadedCard: function (playerId, templateId) { return api('getMyPreloadedPlayerCard', { playerId: playerId, templateId: templateId }) },
    previewPreloadedCard: function (data) { return api('previewMyPreloadedPlayerCard', data) },
    savePreloadedCard: function (data) { return api('saveMyPreloadedPlayerCard', data) },
    selectCard: function (playerId, templateId) { return api('selectMyPlayerCard', { playerId: playerId, templateId: templateId || '' }) },
    setMainCard: function (playerId) { return api('cardWorldSetMainCard', { playerId: playerId }) },
    jsSdkConfig: function (url) { return api('servicePrivateJsSdkConfig', { url: url }) }
  }
})(window)
