(function () {
  'use strict'
  var Api = window.CardWorldApi
  var app = document.getElementById('app')
  var state = {
    players: [],
    main: null,
    membership: null
  }

  function $(id) { return document.getElementById(id) }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
    })
  }

  function show(id, visible) { $(id).hidden = !visible }

  var toastTimer = null
  function toast(message, duration) {
    var el = $('toast')
    el.textContent = String(message || '')
    el.hidden = false
    clearTimeout(toastTimer)
    toastTimer = setTimeout(function () { el.hidden = true }, duration || 2400)
  }

  function authError(code) {
    return ['SERVICE_PRIVATE_AUTH_REQUIRED', 'SERVICE_PRIVATE_ACCOUNT_CONFLICT', 'SERVICE_PRIVATE_ACCOUNT_UNAVAILABLE', 'PLAYER_CARD_AUTH_REQUIRED'].indexOf(code) >= 0
  }

  function showError(message, code) {
    show('state-loading', false)
    show('content', false)
    show('state-error', true)
    $('error-text').textContent = message || '请稍后重试'
    if (authError(code)) {
      $('error-title').textContent = '登录已失效'
      $('btn-relogin').hidden = false
    } else {
      $('error-title').textContent = '暂时无法读取球员卡'
      $('btn-relogin').hidden = true
    }
  }

  function statText(value) {
    return value == null || value === '' ? '—' : String(value)
  }

  function renderHero() {
    var main = state.main
    var fallback = state.players.filter(function (item) { return item.cardUrl })[0] || null
    var hasMain = main && !main.empty && main.cardUrl
    var cardUrl = hasMain ? main.cardUrl : (fallback ? fallback.cardUrl : '')
    var name = hasMain ? main.name : (fallback ? fallback.name : '')
    var numberText = hasMain ? main.numberText : (fallback && fallback.jerseyNumber ? '#' + fallback.jerseyNumber : '')
    var positionLabel = hasMain ? main.positionLabel : (fallback ? fallback.position : '')
    var sub = hasMain
      ? [positionLabel, main.cityText].filter(Boolean).join(' · ')
      : [positionLabel, fallback && fallback.teamName].filter(Boolean).join(' · ')
    var stats = (hasMain && main.stats && main.stats.length) ? main.stats : null

    $('hero-image').hidden = !cardUrl
    $('hero-placeholder').hidden = Boolean(cardUrl)
    if (cardUrl) {
      $('hero-image').src = cardUrl
      $('hero-image').alt = name || '球员卡'
    } else {
      $('hero-image').removeAttribute('src')
    }
    $('hero-name').textContent = name || '我的球员卡'
    $('hero-sub').textContent = cardUrl ? (sub || '数据由数据中心统一提供') : '还没有可展示的卡'
    $('hero-number').hidden = !numberText
    $('hero-number').textContent = numberText || ''
    $('hero-note').hidden = !(hasMain && main.portraitNote)
    $('hero-note').textContent = hasMain ? (main.portraitNote || '') : ''
    $('hero-hint').hidden = !cardUrl
    syncHolo(cardUrl)
    if (cardUrl) playHoloShowcase()

    var grid = $('hero-stats')
    grid.innerHTML = ''
    var rows = stats || [
      { label: '积分', num: null }, { label: '出场', num: null },
      { label: '进球', num: null }, { label: '助攻', num: null }
    ]
    rows.slice(0, 4).forEach(function (item) {
      var cell = document.createElement('div')
      cell.innerHTML = '<b>' + escapeHtml(statText(item.num)) + '</b><span>' + escapeHtml(item.label || '') + '</span>'
      grid.appendChild(cell)
    })
  }

  function renderMembership() {
    var membership = state.membership
    if (!membership) { show('membership-panel', false); $('member-chip').hidden = true; return }
    var subscription = membership.subscription
    show('membership-panel', true)
    if (subscription && subscription.status === 'active') {
      var days = Number(subscription.daysLeft || 0)
      $('membership-state').textContent = (subscription.badgeText || subscription.levelName || '会员') + ' · 剩余 ' + days + ' 天'
      $('member-chip').hidden = false
    } else {
      $('membership-state').textContent = subscription && subscription.status === 'expired'
        ? '会员已到期，续费后恢复专属背景'
        : '当前未开通会员'
      $('member-chip').hidden = true
    }
  }

  function renderLibrary() {
    var list = $('library-list')
    list.innerHTML = ''
    var players = state.players || []
    $('library-count').textContent = players.length ? ('共 ' + players.length + ' 名球员') : '只读'
    show('library-empty', !players.length)
    var mainPlayerId = state.main && !state.main.empty ? String(state.main.playerId || '') : ''
    players.forEach(function (player) {
      var card = document.createElement('article')
      card.className = 'lib-card'
      var image = player.cardUrl
        ? '<img class="lib-card__img" src="' + escapeHtml(player.cardUrl) + '" alt="' + escapeHtml(player.name || '球员卡') + '" loading="lazy" />'
        : '<div class="lib-card__img lib-card__img--empty">暂无卡面</div>'
      var isMain = String(player.id) === mainPlayerId
      var meta = [player.position, player.teamName, player.jerseyNumber ? '#' + player.jerseyNumber : ''].filter(Boolean).join(' · ')
      card.innerHTML = image +
        '<div class="lib-card__body">' +
        '<span class="lib-card__name">' + escapeHtml(player.name || '球员') + '</span>' +
        '<span class="lib-card__meta">' + escapeHtml(meta || '数据中心未提供位置') + '</span>' +
        (isMain ? '<span class="lib-card__badge">当前主卡</span>' : '') +
        '<div class="lib-card__btns">' +
        '<button type="button" class="btn btn--ghost lib-card__btn" data-edit="' + escapeHtml(player.id) + '">编辑球员卡</button>' +
        '<button type="button" class="btn btn--ghost lib-card__btn" data-photo="' + escapeHtml(player.id) + '">换形象照</button>' +
        '<button type="button" class="btn btn--ghost lib-card__btn" data-player="' + escapeHtml(player.id) + '"' + (isMain ? ' disabled' : '') + '>' +
        (isMain ? '已是主卡' : '设为主卡') + '</button>' +
        '</div>' +
        '</div>'
      list.appendChild(card)
    })
    Array.prototype.forEach.call(list.querySelectorAll('button[data-edit]'), function (button) {
      button.addEventListener('click', function () { gotoDesign(button.getAttribute('data-edit')) })
    })
    Array.prototype.forEach.call(list.querySelectorAll('button[data-photo]'), function (button) {
      button.addEventListener('click', function () { gotoPortrait(button.getAttribute('data-photo')) })
    })
    Array.prototype.forEach.call(list.querySelectorAll('button[data-player]'), function (button) {
      button.addEventListener('click', function () { setMainCard(button.getAttribute('data-player'), button) })
    })
  }

  function setMainCard(playerId, button) {
    if (!playerId) return
    button.disabled = true
    button.textContent = '设置中…'
    Api.setMainCard(playerId).then(function () {
      return refresh().then(function () { toast('已设为主卡') })
    }).catch(function (error) {
      button.disabled = false
      button.textContent = '设为主卡'
      if (error.code === 'WORLD_CITY_REQUIRED') {
        toast('请先在「我的」完善所在城市后再设主卡')
      } else {
        toast(error.message || '设置失败，请重试')
      }
    })
  }

  function refresh() {
    return Promise.all([
      Api.mainCard().catch(function () { return null }),
      Api.listCards()
    ]).then(function (results) {
      state.main = results[0] || state.main
      state.players = (results[1] && results[1].players) || []
      renderHero()
      renderLibrary()
    })
  }

  /* 卡面设计走独立页面 design.html：预览、背景、构图和 AI 形象照入口都在该页，
     本页不再弹层设置，避免只显示形象照看不到背景。 */
  function gotoDesign(playerId) {
    if (!playerId) {
      toast('还没有球员卡，先去足球世界签约')
      return
    }
    location.href = './design.html?playerId=' + encodeURIComponent(playerId)
  }

  /* 换形象照：进「编辑球员卡」并直接弹出「更换照片」的两个选项
     （相册上传或拍摄 / 一键形象照），不再在形象照页里二次选方式。
     扣费、凭证与卡面素材入库都在服务端，本页只负责跳转。 */
  function gotoPortrait(playerId) {
    var id = String(playerId || '')
    if (!id) {
      toast('还没有球员卡，先去足球世界签约')
      return
    }
    location.href = './design.html?playerId=' + encodeURIComponent(id) + '&photo=1'
  }
  function aiPortraitPlayerId() {
    if (state.main && !state.main.empty && state.main.playerId) return state.main.playerId
    if (state.main && !state.main.empty && state.main.id) return state.main.id
    var first = state.players && state.players[0]
    return first ? (first.id || first.playerId || '') : ''
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script')
      script.src = src
      script.onload = resolve
      script.onerror = function () { reject(new Error('微信网页授权组件加载失败')) }
      document.head.appendChild(script)
    })
  }

  function setupWeappEntry() {
    var fallback = $('weapp-fallback')
    var hint = $('weapp-hint')
    if (!Api.isWeChat()) {
      show('weapp-launch', false)
      fallback.hidden = false
      hint.textContent = '请使用微信打开本页后进入足球世界小程序'
      return
    }
    var username = Api.weappUsername()
    if (!username || !/^gh_[0-9a-z]+$/i.test(username)) {
      show('weapp-launch', false)
      fallback.hidden = false
      fallback.textContent = '小程序入口配置中，请稍后从服务号菜单进入'
      hint.textContent = '签约、组阵在小程序中完成'
      return
    }
    var launch = $('launch-weapp')
    if (launch) launch.setAttribute('username', username)
    loadScript('https://res.wx.qq.com/open/js/jweixin-1.6.0.js').then(function () {
      return Api.jsSdkConfig(location.href.split('#')[0])
    }).then(function (config) {
      if (!config || !config.success) throw new Error((config && config.error) || '网页签名暂不可用')
      window.wx.config({
        debug: false,
        appId: config.appId,
        timestamp: config.timestamp,
        nonceStr: config.nonceStr,
        signature: config.signature,
        jsApiList: [],
        openTagList: ['wx-open-launch-weapp']
      })
      window.wx.ready(function () {
        show('weapp-launch', true)
        fallback.hidden = true
      })
      window.wx.error(function () {
        show('weapp-launch', false)
        fallback.hidden = false
        hint.textContent = '网页签名失败，请返回「我的」重新进入后再试'
      })
    }).catch(function () {
      show('weapp-launch', false)
      fallback.hidden = false
      hint.textContent = '请在微信中打开本页后进入足球世界小程序'
    })
  }

  // 主卡星云箔光：复用原型 holo-cosmos 层叠（front / shine / glare + 卡图 alpha 遮罩）。
  function syncHolo(cardUrl) {
    var card = $('hero-card')
    if (!card) return
    card.classList.toggle('is-empty', !cardUrl)
    if (!cardUrl) {
      card.style.removeProperty('--card-mask')
      if (window.HoloCosmos) window.HoloCosmos.releaseToIdle(card)
      return
    }
    var safe = String(cardUrl).replace(/"/g, '%22').replace(/'/g, '%27')
    card.style.setProperty('--card-mask', 'url("' + safe + '")')
    if (window.HoloCosmos && !card.__holoBound) window.HoloCosmos.bindCard(card)
  }

  var holoSwept = false
  function playHoloShowcase() {
    if (holoSwept || !window.HoloCosmos) return
    holoSwept = true
    setTimeout(function () { window.HoloCosmos.showcase($('hero-card'), 4200) }, 400)
  }

  function bind() {
    $('btn-retry').addEventListener('click', function () { init(true) })
    $('btn-relogin').addEventListener('click', function () {
      Api.clearSession()
      Api.ensureSession().catch(function (error) { toast(error.message || '重新登录失败') })
    })
    $('btn-settings').addEventListener('click', function () {
      var main = state.main && !state.main.empty ? state.main : null
      var playerId = main ? main.playerId : (state.players[0] && state.players[0].id)
      gotoDesign(playerId)
    })
    $('btn-library').addEventListener('click', function () {
      document.getElementById('library-panel').scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    /* 换形象照：进编辑球员卡并直接弹出「更换照片」（相册上传或拍摄 / 一键形象照），
       页内不再让用户二次选方式。 */
    $('btn-change-photo').addEventListener('click', function () { gotoPortrait(aiPortraitPlayerId()) })
    $('weapp-fallback').addEventListener('click', function () { toast('请使用微信打开本页后进入小程序') })
  }

  function init(isRetry) {
    show('state-error', false)
    show('content', false)
    show('state-loading', true)
    Api.ensureSession().then(function () {
      return Promise.all([
        Api.listCards(),
        Api.mainCard().catch(function () { return null }),
        Api.membershipStatus().catch(function () { return null })
      ])
    }).then(function (results) {
      state.players = (results[0] && results[0].players) || []
      state.main = results[1] || null
      state.membership = results[2] || null
      show('state-loading', false)
      show('content', true)
      $('member-chip').hidden = !(state.membership && state.membership.subscription && state.membership.subscription.status === 'active')
      renderHero()
      renderMembership()
      renderLibrary()
      setupWeappEntry()
      if (!state.players.length && !isRetry) toast('还没有球员卡，去足球世界签约后会自动出现')
    }).catch(function (error) {
      if (error && error.code === 'PLAYER_CARD_AUTH_REQUIRED') Api.clearSession()
      showError(error.message, error.code)
    })
  }

  bind()
  init(false)
})()
