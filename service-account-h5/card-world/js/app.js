(function () {
  'use strict'
  var Api = window.CardWorldApi
  var app = document.getElementById('app')
  var state = {
    players: [],
    main: null,
    membership: null,
    settings: null,
    settingsPlayerId: '',
    saving: false
  }

  var BASE_BACKGROUNDS = {
    bronze: { name: '铜卡', note: '基础卡面' },
    silver: { name: '银卡', note: '进阶卡面' },
    gold: { name: '金卡', note: '精英卡面' }
  }
  var BASE_ORDER = ['bronze', 'silver', 'gold']

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

  function normalizeCropValue(value) {
    var crop = value || {}
    return { zoom: Number(crop.zoom) || 1, x: Number(crop.x) || 0, y: Number(crop.y) || 0 }
  }

  function openSettings(playerId) {
    if (!playerId) {
      toast('还没有球员卡，先去足球世界签约')
      return
    }
    state.settingsPlayerId = String(playerId)
    state.settings = null
    show('settings-mask', true)
    loadSettings(playerId)
  }

  function loadSettings(playerId) {
    state.settingsPlayerId = String(playerId)
    state.settings = null
    $('settings-body').style.opacity = '0.5'
    updateSettingsButtons(true)
    setBackgroundState('loading')
    var cardTask = Api.getCard(playerId)
    var listTask = Api.listCards()
    Promise.all([
      cardTask.then(function (value) { return { ok: true, value: value } }, function (error) { return { ok: false, error: error } }),
      listTask.then(function (value) { return { ok: true, value: value } }, function (error) { return { ok: false, error: error } })
    ]).then(function (results) {
      var cardResult = results[0]
      var listResult = results[1]
      var card = cardResult.ok ? (cardResult.value || {}) : {}
      var player = card.player || {}
      var score = player.playerCard || {}
      var draft = card.draft || {}
      var list = listResult.ok ? ((listResult.value && listResult.value.players) || []) : []
      var playerItem = list.filter(function (item) { return String(item.id) === String(playerId) })[0] || null
      var baseCrop = normalizeCropValue(draft.crop || player.playerCardCrop)
      var settings = {
        playerId: String(playerId),
        name: player.name || '',
        tier: player.cardTier || '',
        version: Number(player.version || 0),
        backgroundId: player.backgroundId || player.cardTier || 'bronze',
        displayTemplateId: String(player.displayTemplateId || (playerItem && playerItem.displayTemplateId) || ''),
        canChangeBackground: Boolean(score.canChangeBackground),
        membershipBackground: Boolean(score.membershipBackground),
        backgroundUnlock: score.backgroundUnlock || '',
        baseCrop: baseCrop,
        crop: baseCrop,
        portrait: card.standardPortraitData || '',
        scene: card.cardScene || null,
        templates: card.templates || {},
        preloaded: (playerItem && playerItem.preloadedCards) || [],
        bases: [],
        skins: [],
        options: [],
        selection: null,
        loadError: ''
      }
      if (!cardResult.ok) settings.loadError = (cardResult.error && cardResult.error.message) || '卡面背景读取失败，请重试'
      else if (!listResult.ok) settings.loadError = '卡库背景读取失败，请重试'
      settings.bases = baseOptions(settings)
      settings.skins = skinOptions(settings)
      settings.options = settings.bases.concat(settings.skins)
      settings.selection = initialSelection(settings)
      if (settings.selection && settings.selection.kind === 'skin') settings.crop = normalizeCropValue(settings.selection.crop)
      state.settings = settings
      $('settings-body').style.opacity = '1'
      renderBackgroundList()
      renderCrop()
      updateSettingsButtons()
      if (settings.loadError) toast(settings.loadError)
    })
  }

  function baseOptions(settings) {
    var templates = settings.templates || {}
    var options = []
    BASE_ORDER.forEach(function (id) {
      var template = templates[id]
      if (!template) return
      var meta = BASE_BACKGROUNDS[id] || { name: id, note: '' }
      var allowed = Boolean(settings.canChangeBackground) || id === settings.tier
      var current = !settings.displayTemplateId && id === settings.backgroundId
      var note = meta.note
      if (!allowed) note = '未解锁 · 满 100 分或会员可用'
      else if (settings.backgroundUnlock === 'membership') note = '会员权益已生效'
      options.push({
        kind: 'base', id: id, title: template.title || meta.name, note: note,
        thumb: template.backgroundUrl || '', current: current,
        allowed: allowed, locked: !allowed,
        stateText: current ? '当前使用' : allowed ? '可选' : '未解锁',
        backgroundId: id, templateVersion: Number(template.version || 0),
        crop: settings.baseCrop
      })
    })
    return options
  }

  function skinOptions(settings) {
    return (settings.preloaded || []).filter(function (card) { return card && card.templateId }).map(function (card) {
      var current = String(card.templateId) === settings.displayTemplateId
      var ready = card.status === 'ready'
      var note = card.reason || (card.cardKind === 'honor' ? '已拥有的荣誉卡皮肤' : '已拥有的卡库皮肤')
      if (current && !ready) note = '当前展示的卡面暂不可用，请重新生成'
      return {
        kind: 'skin', id: String(card.templateId), title: card.title || '卡库皮肤',
        note: note, thumb: card.backgroundUrl || card.cardUrl || '',
        current: current, allowed: ready, locked: !ready,
        stateText: current ? '当前使用' : ready ? '可选' : card.status === 'locked' ? '未解锁' : '待制作',
        revision: Number(card.revision || 0), templateVersion: Number(card.templateVersion || 0),
        crop: normalizeCropValue(card.crop)
      }
    })
  }

  function initialSelection(settings) {
    var options = settings.options || []
    var skin = settings.displayTemplateId
      ? options.filter(function (item) { return item.kind === 'skin' && item.id === settings.displayTemplateId && item.allowed })[0]
      : null
    if (skin) return skin
    var currentBase = options.filter(function (item) { return item.kind === 'base' && item.current })[0]
    if (currentBase) return currentBase
    return options.filter(function (item) { return item.allowed })[0] || null
  }

  function isChosen(settings, item) {
    var selection = settings.selection
    return Boolean(selection && selection.kind === item.kind && String(selection.id) === String(item.id))
  }

  function setBackgroundState(mode, message) {
    var hasOptions = Boolean(state.settings && state.settings.options.length)
    $('background-loading').hidden = mode !== 'loading'
    show('background-error', mode === 'error')
    show('background-empty', mode === 'empty')
    show('background-list', mode === 'ready' || (mode === 'error' && hasOptions))
    $('btn-reload-backgrounds').hidden = mode === 'loading'
    if (mode === 'error') $('background-error-text').textContent = message || '请检查网络后重试'
  }

  function backgroundHint(settings) {
    if (!settings || settings.loadError || !settings.options.length) return ''
    if (settings.canChangeBackground) {
      return settings.backgroundUnlock === 'membership'
        ? '会员权益已生效：可选择已发布的卡面背景，保存不消耗蜂蜜。'
        : '已满足更换背景条件，保存不消耗蜂蜜。'
    }
    return '当前只能使用球员等级对应的背景；满 100 分或会员可更换。'
  }

  function updateSettingsButtons(disable) {
    var settings = state.settings
    var ready = Boolean(settings && settings.selection && settings.tier && !settings.loadError)
    $('btn-preview').disabled = Boolean(disable) || !ready
    $('btn-save').disabled = Boolean(disable) || !ready || state.saving
  }

  function selectBackground(item) {
    var settings = state.settings
    if (!settings || !item || !item.allowed) return
    settings.selection = item
    settings.crop = normalizeCropValue(item.crop || settings.baseCrop)
    renderCrop()
    renderBackgroundList()
  }

  function retrySettings() {
    if (state.settingsPlayerId) loadSettings(state.settingsPlayerId)
  }

  function renderBackgroundList() {
    var settings = state.settings
    var list = $('background-list')
    list.innerHTML = ''
    if (!settings) {
      setBackgroundState('loading')
      updateSettingsButtons(true)
      return
    }
    setBackgroundState(settings.loadError ? 'error' : settings.options.length ? 'ready' : 'empty', settings.loadError)
    $('background-hint').textContent = backgroundHint(settings)
    if (!settings.options.length) {
      updateSettingsButtons()
      return
    }
    settings.options.forEach(function (item) {
      var selected = isChosen(settings, item)
      var button = document.createElement('button')
      button.type = 'button'
      button.setAttribute('role', 'listitem')
      button.className = 'bg-option' +
        (item.current ? ' is-active' : '') +
        (selected && !item.current ? ' is-chosen' : '') +
        (item.locked ? ' is-locked' : '')
      button.disabled = !item.allowed
      button.setAttribute('data-kind', item.kind)
      button.setAttribute('data-id', item.id)
      var thumb = item.thumb
        ? '<img src="' + escapeHtml(item.thumb) + '" alt="' + escapeHtml(item.title) + '" loading="lazy" />'
        : '<span class="bg-option__thumb--empty">暂无<br>缩略图</span>'
      button.innerHTML =
        '<span class="bg-option__thumb">' + thumb + '</span>' +
        '<span class="bg-option__body">' +
        '<span class="bg-option__title">' + escapeHtml(item.title) + '</span>' +
        '<span class="bg-option__note">' + escapeHtml(item.note || '') + '</span>' +
        '<span class="bg-option__state">' + escapeHtml(item.stateText) + '</span>' +
        '</span>'
      button.addEventListener('click', function () { selectBackground(item) })
      list.appendChild(button)
      var image = button.querySelector('img')
      if (image) image.addEventListener('error', function () {
        var frame = button.querySelector('.bg-option__thumb')
        if (frame) frame.innerHTML = '<span class="bg-option__thumb--empty">暂无<br>缩略图</span>'
      })
    })
    updateSettingsButtons()
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
    var selection = settings.selection || {}
    return Object.assign({
      playerId: settings.playerId,
      backgroundId: selection.kind === 'base' ? selection.id : settings.backgroundId,
      crop: cropValues(),
      mode: 'portrait',
      tier: settings.tier,
      expectedVersion: settings.version
    }, extra || {})
  }

  function previewCard() {
    var settings = state.settings
    if (!settings) return
    var selection = settings.selection
    if (!settings.tier) { toast('球员积分待核定，暂不能预览'); return }
    if (!selection) { toast('请先选择卡面背景'); return }
    $('btn-preview').disabled = true
    var task = selection.kind === 'skin'
      ? Api.previewPreloadedCard({
        playerId: settings.playerId,
        templateId: selection.id,
        templateVersion: selection.templateVersion,
        crop: cropValues(),
        tier: settings.tier
      })
      : Api.previewCard(settingsPayload())
    task.then(function (result) {
      if (result && result.imageData) {
        $('preview-image').src = result.imageData
        show('preview-mask', true)
      } else {
        toast('该卡面暂不支持预览，请直接保存')
      }
    }).catch(function (error) {
      if (error.code === 'PLAYER_CARD_BACKGROUND_LOCKED') toast('该背景未解锁')
      else toast(error.message || '预览失败，请重试')
    }).then(function () { updateSettingsButtons() })
  }

  function saveCard() {
    var settings = state.settings
    if (!settings || state.saving) return
    var selection = settings.selection
    if (!settings.tier) { toast('球员积分待核定，暂不能保存卡面'); return }
    if (!selection) { toast('请先选择卡面背景'); return }
    state.saving = true
    updateSettingsButtons(true)
    $('btn-save').textContent = '保存中…'
    var saved = false
    var task = selection.kind === 'skin'
      ? Api.savePreloadedCard({
        playerId: settings.playerId,
        templateId: selection.id,
        expectedRevision: selection.revision,
        templateVersion: selection.templateVersion,
        crop: cropValues(),
        tier: settings.tier
      }).then(function () {
        saved = true
        return Api.selectCard(settings.playerId, selection.id)
      })
      : Api.saveCard(settingsPayload()).then(function () {
        saved = true
        if (settings.displayTemplateId) return Api.selectCard(settings.playerId, '')
      })
    task.then(function () {
      toast('卡面已保存')
      show('settings-mask', false)
      state.settings = null
      return refresh()
    }).catch(function (error) {
      if (saved) {
        toast('卡面已保存，切换展示卡面失败，请重新进入设置')
        show('settings-mask', false)
        state.settings = null
        refresh()
        return
      }
      if (error.code === 'PLAYER_CARD_PHOTO_PAY_REQUIRED') toast('换照片需去小程序合成，H5 不扣费')
      else if (error.code === 'PLAYER_CARD_CONFLICT') toast('卡面已更新，请重新打开设置')
      else if (error.code === 'PLAYER_CARD_BACKGROUND_LOCKED') toast('该背景未解锁')
      else if (error.code === 'PLAYER_CARD_TEMPLATE_CHANGED') toast('卡面已更新，请重新打开设置')
      else toast(error.message || '保存失败，请重试')
    }).then(function () {
      state.saving = false
      $('btn-save').textContent = '保存卡面'
      updateSettingsButtons()
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
    $('btn-retry-backgrounds').addEventListener('click', retrySettings)
    $('btn-reload-backgrounds').addEventListener('click', retrySettings)
    ;['crop-zoom', 'crop-x', 'crop-y'].forEach(function (id) {
      $(id).addEventListener('input', applyCropPreview)
    })
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
