'use strict'
// ---------- 接口与登录：零 SDK，统一走 webLoginApi ----------
  // ---------- 后端接入（零 SDK，与正式版同一入口） ----------
  var API = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'
  var KEY = 'sxf_fan_h5_session'
  // URL 带 ?demo=1 时走本地硬编码假数据；默认走真实后端
  var DEMO = /[?&]demo=1/.test(location.search)
  function api(action, data) {
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ action: action, fanSessionToken: localStorage.getItem(KEY) || '' }, data || {})) }).then(function (r) { return r.json() }).then(function (r) {
      r = r && typeof r.body === 'string' ? JSON.parse(r.body) : r
      if (!r.success) {
        var error = new Error(r.error || '操作失败，请重试')
        error.code = r.code || ''
        if (r.code === 'PLAYER_CARD_AUTH_REQUIRED') localStorage.removeItem(KEY)
        throw error
      }
      return r
    })
  }
  function failBox(message, retry) {
    main.className = 'game-state'
    main.innerHTML = '<p>' + esc(message) + '</p>' + (retry ? '<button id="gameRetry" type="button">重新加载</button>' : '')
    var btn = document.getElementById('gameRetry')
    if (btn) btn.onclick = retry
  }
  function login() {
    if (!/MicroMessenger/i.test(navigator.userAgent)) {
      main.className = 'game-state'
      main.innerHTML = '<p>请在微信中打开此页面，授权后即可进入球员卡玩法。</p><p style="margin-top:10px;font-size:12px;color:#8b98bd">本地预览可在网址后加 ?demo=1 进入演示模式</p>'
      return
    }
    main.className = 'game-state'; main.textContent = '正在连接微信…'
    api('fanOAuthUrl', { returnUrl: location.origin + location.pathname }).then(function (r) { location.replace(r.authorizeUrl) }).catch(function (e) { failBox(e.message, login) })
  }
  function guard(error, retry) {
    if (error && error.code === 'PLAYER_CARD_AUTH_REQUIRED') { login(); return true }
    failBox(error && error.message || '网络异常，请重试', retry)
    return true
  }
  function fireConfetti(gold) {
    if (typeof window.confetti !== 'function') return
    var opts = { particleCount: 120, spread: 70, origin: { y: 0.6 } }
    if (gold) opts.colors = ['#ffc94d', '#fff3c4']
    window.confetti(opts)
  }

