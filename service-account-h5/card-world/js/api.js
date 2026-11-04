(function (global) {
  'use strict'
  // 服务号 H5 · 我的球员卡：统一走 webLoginApi；会话复用 sxf_referee_h5_session。
  // 本文件只封装只读/换装接口，不包含会员下单、充值、支付等交易入口。
  var API = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'
  var KEY = 'sxf_referee_h5_session'
  var RETURN_URL = location.origin + location.pathname
  // wx-open-launch-weapp 的 username 必须是足球世界小程序的原始 ID（gh_ 开头），
  // 不是 AppID（wxa0ac7d45bcabd140）。值由部署方维护；留空时页面只展示说明、不挂无效按钮。
  var WEAPP_USERNAME = 'gh_6d11304cf55f'

  function sessionToken() {
    try { return localStorage.getItem(KEY) || '' } catch (e) { return '' }
  }

  function clearSession() {
    try { localStorage.removeItem(KEY) } catch (e) { /* ignore */ }
  }

  // 网页入口请求体上限约 100KB，413 一般是照片没收敛到位；401/403 是登录态失效；5xx 才是服务端异常。
  function httpMessage(response) {
    if (response.status === 413) return '照片太大了（单次上传不能超过 100KB），请换一张或重新拍'
    if (response.status === 401 || response.status === 403) return '登录状态已失效，请回到签卡页重新进入'
    if (response.status === 429) return '操作太频繁，请稍后再试'
    if (response.status >= 500) return '服务繁忙，请稍后重试'
    return '网络异常，请稍后重试'
  }

  function post(payload) {
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (response) {
      if (!response.ok) {
        var error = new Error(httpMessage(response))
        error.status = response.status
        throw error
      }
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
    // 编辑球员卡只用 cardScene 里的临时地址，不要服务端再回 5MB base64 形象照（打开更快）。
    getCard: function (playerId) { return api('getMyPlayerCard', { playerId: playerId, withPortraitData: false }) },
    previewCard: function (data) { return api('previewMyPlayerCard', data) },
    saveCard: function (data) { return api('saveMyPlayerCard', data) },
    setMainCard: function (playerId) { return api('cardWorldSetMainCard', { playerId: playerId }) },
    // AI 形象照：卡面页直接生成，不再绕到「球员登记 · 形象照」。
    // 扣费与成片归属都在服务端（cardPortraitAi.cjs），前端只负责提交请求编号与参考照片。
    aiPortraitInfo: function (data) { return api('cardAiPortraitInfo', data) },
    prepareAiPortrait: function (data) { return api('cardAiPortraitPrepare', data) },
    applyAiPortrait: function (data) { return api('cardAiPortraitApply', data) },
    cancelAiPortrait: function (data) { return api('cardAiPortraitCancel', data) },
    // 换形象照 · 上传自己的照片：服务端抠图并签一次性凭证，确认后才扣费写卡面。
    // 价格沿用既有「换照片」规则（cardPhotoReplace.cjs / photoReplaceSummary），前端不算金额。
    cardPhotoInfo: function (data) { return api('cardPhotoInfo', data) },
    prepareCardPhoto: function (data) { return api('cardPhotoPrepare', data) },
    applyCardPhoto: function (data) { return api('cardPhotoApply', data) },
    cancelCardPhoto: function (data) { return api('cardPhotoCancel', data) },
    jsSdkConfig: function (url) { return api('servicePrivateJsSdkConfig', { url: url }) }
  }
})(window)
