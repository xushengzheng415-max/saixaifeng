(function () {
  'use strict'
  var Api = window.CardWorldApi
  var BACKGROUNDS = [
    { id: 'bronze', name: '铜卡', note: '基础' },
    { id: 'silver', name: '银卡', note: '进阶' },
    { id: 'gold', name: '金卡', note: '精英' }
  ]
  var state = {
    playerId: '',
    settings: null,
    thumbs: {},
    previewSeq: 0,
    previewTimer: null,
    thumbBusy: false,
    saving: false
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

  var PENDING_KEY = 'sxf_card_design_player'

  function playerIdFromQuery() {
    try { return String(new URLSearchParams(location.search).get('playerId') || '').trim() } catch (error) { return '' }
  }

  /* 微信授权回调会去掉查询串，这里把 playerId 暂存，保证回到本页后仍能继续设计。 */
  function rememberPlayerId(playerId) {
    try {
      if (playerId) sessionStorage.setItem(PENDING_KEY, playerId)
      else sessionStorage.removeItem(PENDING_KEY)
    } catch (error) { /* ignore */ }
  }

  function pendingPlayerId() {
    try { return String(sessionStorage.getItem(PENDING_KEY) || '').trim() } catch (error) { return '' }
  }

  /* AI 定妆照直接进独立的 portrait.html 生成页；生成并「使用这张」后回到本页即套进卡面。 */
  function openAiPortrait() {
    var settings = state.settings
    var playerId = (settings && settings.playerId) || playerIdFromQuery()
    if (!playerId) { toast('还没有可生成的球员卡，先回到卡库选择球员'); return }
    if (settings && settings.playerId) rememberPlayerId(settings.playerId)
    location.href = './portrait.html?playerId=' + encodeURIComponent(playerId)
  }

  function setPreviewState(text, isError) {
    var el = $('preview-state')
    el.textContent = text
    el.style.color = isError ? 'var(--gold)' : ''
  }

  function cropValues() {
    return {
      zoom: Number($('crop-zoom').value),
      x: Number($('crop-x').value),
      y: Number($('crop-y').value)
    }
  }

  function syncCropLabels() {
    $('crop-zoom-value').textContent = Number($('crop-zoom').value).toFixed(2)
    $('crop-x-value').textContent = Number($('crop-x').value).toFixed(2)
    $('crop-y-value').textContent = Number($('crop-y').value).toFixed(2)
    if (state.settings) state.settings.crop = cropValues()
  }

  function settingsPayload(backgroundId) {
    var settings = state.settings
    return {
      playerId: settings.playerId,
      backgroundId: backgroundId || settings.backgroundId,
      crop: state.settings.crop || cropValues(),
      mode: 'portrait',
      tier: settings.tier,
      expectedVersion: settings.version
    }
  }

  function handleError(error) {
    var code = (error && error.code) || ''
    if (code === 'PLAYER_CARD_PORTRAIT_REQUIRED') {
      showError('该球员还没有标准形象照，先用 AI 定妆照生成一张再回来设计卡面。', true)
      return
    }
    if (code === 'PLAYER_CARD_BACKGROUND_LOCKED') { toast('该背景尚未解锁'); setPreviewState('背景未解锁', true); return }
    if (code === 'PLAYER_CARD_TEMPLATE_CHANGED' || code === 'PLAYER_CARD_TEMPLATE_UNAVAILABLE') { toast('卡面模板已更新，请返回重新进入'); return }
    if (code === 'PLAYER_CARD_CONFLICT') { toast('卡面已在别处更新，请返回卡库重新进入'); return }
    toast((error && error.message) || '操作失败，请重试')
  }

  function requestPreview() {
    var settings = state.settings
    if (!settings) return Promise.resolve(null)
    if (!settings.tier) {
      setPreviewState('积分待核定，暂不能预览', true)
      show('design-empty', true)
      $('design-empty').textContent = '球员积分待核定，暂时无法合成卡面'
      return Promise.resolve(null)
    }
    var seq = ++state.previewSeq
    setPreviewState('正在合成…')
    $('design-empty').textContent = '正在合成卡面…'
    return Api.previewCard(settingsPayload()).then(function (result) {
      if (seq !== state.previewSeq) return null
      if (!result || !result.imageData) throw new Error('该卡面暂不支持预览，请直接保存')
      $('design-image').src = result.imageData
      show('design-image', true)
      show('design-empty', false)
      setPreviewState('背景已合成')
      return result.imageData
    }).catch(function (error) {
      if (seq !== state.previewSeq) return null
      handleError(error)
      return null
    })
  }

  function schedulePreview() {
    clearTimeout(state.previewTimer)
    state.previewTimer = setTimeout(function () { requestPreview() }, 500)
  }

  function renderBackgrounds() {
    var settings = state.settings
    var list = $('background-list')
    list.innerHTML = ''
    BACKGROUNDS.forEach(function (item) {
      var allowed = settings.canChangeBackground || item.id === settings.tier
      var active = item.id === settings.backgroundId
      var button = document.createElement('button')
      button.type = 'button'
      button.className = 'bg-option bg-option--thumb' + (active ? ' is-active' : '') + (allowed ? '' : ' is-locked')
      button.disabled = !allowed
      button.setAttribute('data-bg', item.id)
      var thumb = state.thumbs[item.id]
      var note = item.note
      if (!allowed) note = settings.membershipBackground ? '会员可用' : '未解锁'
      button.innerHTML =
        '<span class="bg-thumb">' +
        (thumb ? '<img src="' + escapeHtml(thumb) + '" alt="' + escapeHtml(item.name) + ' 背景效果" />' : '<span class="bg-thumb__ph">效果加载中</span>') +
        '</span>' +
        '<strong>' + escapeHtml(item.name) + '</strong>' +
        '<small>' + escapeHtml(note) + '</small>'
      button.addEventListener('click', function () {
        if (!allowed || active) return
        settings.backgroundId = item.id
        renderBackgrounds()
        requestPreview()
      })
      list.appendChild(button)
    })
    $('background-hint').textContent = settings.canChangeBackground
      ? (settings.backgroundUnlock === 'membership' ? '会员权益已生效' : '已解锁更换背景')
      : '满 100 分或开通会员后可更换背景'
  }

  /* 背景缩略图同样走服务端成卡渲染，保证看到的是真实背景而不是色块。
     逐张串行请求，失败即跳过，不阻塞主预览。 */
  function loadThumbs() {
    var settings = state.settings
    if (!settings || !settings.tier || state.thumbBusy) return
    var pending = BACKGROUNDS.filter(function (item) {
      if (state.thumbs[item.id]) return false
      return settings.canChangeBackground || item.id === settings.tier
    })
    if (!pending.length) return
    state.thumbBusy = true
    var chain = Promise.resolve()
    pending.forEach(function (item) {
      chain = chain.then(function () {
        return Api.previewCard(settingsPayload(item.id)).then(function (result) {
          if (!result || !result.imageData) return
          state.thumbs[item.id] = result.imageData
          renderBackgrounds()
        }).catch(function () { /* 单张缩略图失败时保留占位，不影响主流程 */ })
      })
    })
    chain.then(function () { state.thumbBusy = false })
  }

  function renderCrop() {
    var settings = state.settings
    var crop = settings.crop || { zoom: 1, x: 0, y: 0 }
    $('crop-zoom').value = String(crop.zoom || 1)
    $('crop-x').value = String(crop.x || 0)
    $('crop-y').value = String(crop.y || 0)
    syncCropLabels()
  }

  function saveCard() {
    var settings = state.settings
    if (!settings || state.saving) return
    if (!settings.tier) { toast('球员积分待核定，暂不能保存卡面'); return }
    state.saving = true
    $('btn-save').disabled = true
    $('btn-save').textContent = '保存中…'
    Api.saveCard(settingsPayload()).then(function () {
      toast('卡面已保存')
      setTimeout(function () { location.href = './index.html' }, 900)
    }).catch(function (error) {
      if (error.code === 'PLAYER_CARD_PHOTO_PAY_REQUIRED') toast('换照片需先用 AI 定妆照合成新形象照，本页不扣费')
      else handleError(error)
    }).then(function () {
      state.saving = false
      $('btn-save').disabled = false
      $('btn-save').textContent = '保存卡面'
    })
  }

  function showError(message, withAi) {
    show('state-loading', false)
    show('content', false)
    show('state-error', true)
    $('error-text').textContent = message || '请稍后重试'
    $('btn-ai-error').hidden = !withAi
  }

  function bind() {
    $('btn-retry').addEventListener('click', function () { init() })
    $('btn-ai-portrait').addEventListener('click', openAiPortrait)
    $('btn-ai-portrait-crop').addEventListener('click', openAiPortrait)
    $('btn-ai-error').addEventListener('click', openAiPortrait)
    $('btn-back').addEventListener('click', function () { location.href = './index.html' })
    $('btn-save').addEventListener('click', saveCard)
    ;['crop-zoom', 'crop-x', 'crop-y'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        syncCropLabels()
        schedulePreview()
      })
    })
  }

  function init() {
    show('state-error', false)
    show('content', false)
    show('state-loading', true)
    var playerId = state.playerId || playerIdFromQuery() || pendingPlayerId()
    state.playerId = playerId
    if (!playerId) { showError('缺少球员信息，请从卡库重新进入'); return }
    rememberPlayerId(playerId)
    Api.ensureSession().then(function () {
      return Api.getCard(playerId)
    }).then(function (result) {
      var player = result.player || {}
      var score = player.playerCard || {}
      var draft = result.draft || {}
      var tier = String(player.cardTier || '')
      state.settings = {
        playerId: playerId,
        name: String(player.name || ''),
        teamName: String(player.teamName || ''),
        tier: tier,
        version: Number(player.version || 0),
        backgroundId: String(player.backgroundId || tier || ''),
        canChangeBackground: Boolean(score.canChangeBackground),
        membershipBackground: Boolean(score.membershipBackground),
        backgroundUnlock: String(score.backgroundUnlock || ''),
        crop: draft.crop || { zoom: 1, x: 0, y: 0 }
      }
      $('design-sub').textContent = (state.settings.name || '球员') + ' · 背景与形象照'
      show('state-loading', false)
      show('content', true)
      renderBackgrounds()
      renderCrop()
      requestPreview().then(loadThumbs)
    }).catch(function (error) {
      var code = (error && error.code) || ''
      if (code === 'PLAYER_CARD_PORTRAIT_REQUIRED') { showError('该球员还没有标准形象照，先用 AI 定妆照生成一张再回来设计卡面。', true); return }
      if (code === 'PLAYER_CARD_FORBIDDEN') { showError('只能设计本人或已绑定孩子的球员卡'); return }
      showError((error && error.message) || '卡面读取失败，请稍后重试')
    })
  }

  bind()
  init()
})()
