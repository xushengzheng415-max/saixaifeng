(function () {
  'use strict'
  var Api = window.CardWorldApi
  var app = document.getElementById('app')
  var state = {
    players: [],
    main: null,
    membership: null,
    settings: null,
    saving: false
  }

  var BACKGROUNDS = [
    { id: 'bronze', name: '铜卡', note: '基础' },
    { id: 'silver', name: '银卡', note: '进阶' },
    { id: 'gold', name: '金卡', note: '精英' }
  ]

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
        '<button type="button" class="btn btn--ghost lib-card__btn" data-player="' + escapeHtml(player.id) + '"' + (isMain ? ' disabled' : '') + '>' +
        (isMain ? '已是主卡' : '设为主卡') + '</button>' +
        '</div>'
      list.appendChild(card)
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

  function openSettings(playerId) {
    if (!playerId) {
      toast('还没有球员卡，先去足球世界签约')
      return
    }
    show('settings-mask', true)
    $('settings-body').style.opacity = '0.5'
    $('btn-save').disabled = true
    Api.getCard(playerId).then(function (result) {
      var player = result.player || {}
      var score = player.playerCard || {}
      var draft = result.draft || {}
      state.settings = {
        playerId: playerId,
        name: player.name || '',
        tier: player.cardTier || '',
        version: Number(player.version || 0),
        backgroundId: player.backgroundId || player.cardTier || 'bronze',
        canChangeBackground: Boolean(score.canChangeBackground),
        membershipBackground: Boolean(score.membershipBackground),
        backgroundUnlock: score.backgroundUnlock || '',
        crop: draft.crop || player.playerCardCrop || { zoom: 1, x: 0, y: 0 },
        portrait: result.standardPortraitData || '',
        scene: result.cardScene || null
      }
      $('settings-body').style.opacity = '1'
      renderBackgrounds()
      renderCrop()
      $('btn-save').disabled = false
    }).catch(function (error) {
      show('settings-mask', false)
      if (error.code === 'PLAYER_CARD_PORTRAIT_REQUIRED') toast('该球员还没有标准形象照，请先去小程序完成拍摄')
      else toast(error.message || '卡面读取失败，请重试')
    })
  }

  function renderBackgrounds() {
    var settings = state.settings
    var list = $('background-list')
    list.innerHTML = ''
    var current = settings.backgroundId
    BACKGROUNDS.forEach(function (item) {
      var allowed = settings.canChangeBackground || item.id === settings.tier
      var button = document.createElement('button')
      button.type = 'button'
      button.className = 'bg-option' + (item.id === current ? ' is-active' : '') + (allowed ? '' : ' is-locked')
      button.disabled = !allowed
      button.setAttribute('data-bg', item.id)
      var note = item.note
      if (!allowed) note = settings.membershipBackground ? '会员可用' : '未解锁'
      button.innerHTML = escapeHtml(item.name) + '<small>' + escapeHtml(note) + '</small>'
      button.addEventListener('click', function () {
        if (!allowed) return
        settings.backgroundId = item.id
        renderBackgrounds()
      })
      list.appendChild(button)
    })
    $('background-hint').textContent = settings.canChangeBackground
      ? (settings.backgroundUnlock === 'membership' ? '会员权益已生效，可不达 100 分更换背景' : '已满足更换背景条件')
      : '满 100 分或开通会员后可更换背景'
  }

  function cropValues() {
    return {
      zoom: Number($('crop-zoom').value),
      x: Number($('crop-x').value),
      y: Number($('crop-y').value)
    }
  }

  function applyCropPreview() {
    var image = $('crop-image')
    var crop = cropValues()
    image.style.transform = 'translate(-50%, -50%) translate(' + (crop.x * 100) + '%, ' + (crop.y * 100) + '%) scale(' + crop.zoom + ')'
    $('crop-zoom-value').textContent = crop.zoom.toFixed(2)
    $('crop-x-value').textContent = crop.x.toFixed(2)
    $('crop-y-value').textContent = crop.y.toFixed(2)
    if (state.settings) state.settings.crop = crop
  }

  function renderCrop() {
    var settings = state.settings
    var crop = settings.crop || { zoom: 1, x: 0, y: 0 }
    $('crop-zoom').value = String(crop.zoom || 1)
    $('crop-x').value = String(crop.x || 0)
    $('crop-y').value = String(crop.y || 0)
    var image = $('crop-image')
    if (settings.portrait) {
      image.src = settings.portrait
      image.hidden = false
      $('crop-empty').hidden = true
    } else {
      image.hidden = true
      $('crop-empty').hidden = false
      $('crop-empty').textContent = '未能读取标准形象照'
    }
    applyCropPreview()
  }

  function settingsPayload(extra) {
    var settings = state.settings
    return Object.assign({
      playerId: settings.playerId,
      backgroundId: settings.backgroundId,
      crop: cropValues(),
      mode: 'portrait',
      tier: settings.tier,
      expectedVersion: settings.version
    }, extra || {})
  }

  function previewCard() {
    if (!state.settings) return
    if (!state.settings.tier) { toast('球员积分待核定，暂不能预览'); return }
    $('btn-preview').disabled = true
    Api.previewCard(settingsPayload()).then(function (result) {
      if (!result.imageData) { toast('该卡面暂不支持预览，请直接保存'); return }
      $('preview-image').src = result.imageData
      show('preview-mask', true)
    }).catch(function (error) {
      if (error.code === 'PLAYER_CARD_BACKGROUND_LOCKED') toast('该背景未解锁')
      else toast(error.message || '预览失败，请重试')
    }).then(function () { $('btn-preview').disabled = false })
  }

  function saveCard() {
    if (!state.settings || state.saving) return
    if (!state.settings.tier) { toast('球员积分待核定，暂不能保存卡面'); return }
    state.saving = true
    $('btn-save').disabled = true
    $('btn-save').textContent = '保存中…'
    Api.saveCard(settingsPayload()).then(function () {
      toast('卡面已保存')
      show('settings-mask', false)
      return refresh()
    }).catch(function (error) {
      if (error.code === 'PLAYER_CARD_PHOTO_PAY_REQUIRED') toast('换照片需去小程序合成，H5 不扣费')
      else if (error.code === 'PLAYER_CARD_CONFLICT') toast('卡面已更新，请重新打开设置')
      else if (error.code === 'PLAYER_CARD_BACKGROUND_LOCKED') toast('该背景未解锁')
      else toast(error.message || '保存失败，请重试')
    }).then(function () {
      state.saving = false
      $('btn-save').disabled = false
      $('btn-save').textContent = '保存卡面'
    })
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
      hint.textContent = '签约、组阵、照片合成在小程序中完成'
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

  // 主卡全息手感：按住拖动时倾斜、烫金流光与高光跟随手指（与小程序 holo-card 同口径）。
  function setupHolo() {
    var card = $('hero-card')
    if (!card || !window.PointerEvent) return
    var rect = null
    var touching = false
    var last = 0
    var vars = ['--rx', '--ry', '--gx', '--gy', '--hx', '--hy', '--hx2', '--hy2']

    function measure() { rect = card.getBoundingClientRect() }
    function clamp(value) { return Math.max(0, Math.min(1, value)) }
    function apply(clientX, clientY) {
      if (!rect || !rect.width || !rect.height) measure()
      if (!rect || !rect.width || !rect.height) return
      var px = clamp((clientX - rect.left) / rect.width)
      var py = clamp((clientY - rect.top) / rect.height)
      var x = Math.round(px * 100)
      var y = Math.round(py * 100)
      card.style.setProperty('--rx', ((0.5 - py) * 16).toFixed(2) + 'deg')
      card.style.setProperty('--ry', ((px - 0.5) * 16).toFixed(2) + 'deg')
      card.style.setProperty('--gx', x + '%')
      card.style.setProperty('--gy', y + '%')
      card.style.setProperty('--hx', x + '%')
      card.style.setProperty('--hy', y + '%')
      card.style.setProperty('--hx2', (100 - x) + '%')
      card.style.setProperty('--hy2', (100 - y) + '%')
    }
    function start(event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      touching = true
      measure()
      card.classList.add('is-touching')
      apply(event.clientX, event.clientY)
    }
    function move(event) {
      if (!touching) return
      var now = Date.now()
      if (now - last < 40) return
      last = now
      apply(event.clientX, event.clientY)
    }
    function end() {
      if (!touching) return
      touching = false
      card.classList.remove('is-touching')
      vars.forEach(function (name) { card.style.removeProperty(name) })
    }

    card.addEventListener('pointerdown', start)
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    window.addEventListener('blur', end)
    window.addEventListener('resize', function () { rect = null })
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
      openSettings(playerId)
    })
    $('btn-library').addEventListener('click', function () {
      document.getElementById('library-panel').scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    $('btn-close-settings').addEventListener('click', function () { show('settings-mask', false) })
    $('settings-mask').addEventListener('click', function (event) {
      if (event.target === $('settings-mask')) show('settings-mask', false)
    })
    $('btn-close-preview').addEventListener('click', function () { show('preview-mask', false) })
    $('preview-mask').addEventListener('click', function (event) {
      if (event.target === $('preview-mask')) show('preview-mask', false)
    })
    $('btn-preview').addEventListener('click', previewCard)
    $('btn-save').addEventListener('click', saveCard)
    ;['crop-zoom', 'crop-x', 'crop-y'].forEach(function (id) {
      $(id).addEventListener('input', applyCropPreview)
    })
    $('weapp-fallback').addEventListener('click', function () { toast('请使用微信打开本页后进入小程序') })
    setupHolo()
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
