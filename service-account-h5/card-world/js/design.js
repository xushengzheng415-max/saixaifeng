(function () {
  'use strict'
  var Api = window.CardWorldApi
  var BACKGROUNDS = [
    { id: 'bronze', name: '铜卡', note: '基础', rank: 0 },
    { id: 'silver', name: '银卡', note: '进阶', rank: 1 },
    { id: 'gold', name: '金卡', note: '精英', rank: 2 }
  ]
  /* 兜底门槛与 data-center/score-rules.cjs 一致；实际值由服务端 tierRule 下发。 */
  var TIER_FALLBACK = { silverAt: 45, goldAt: 100 }
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

  /* AI 形象照直接进独立的 portrait.html 生成页；生成并「使用这张」后回到本页即替换卡面形象照。 */
  function openAiPortrait() {
    var settings = state.settings
    var playerId = (settings && settings.playerId) || playerIdFromQuery()
    if (!playerId) { toast('还没有可生成的球员卡，先回到卡库选择球员'); return }
    if (settings && settings.playerId) rememberPlayerId(settings.playerId)
    location.href = './portrait.html?playerId=' + encodeURIComponent(playerId)
  }

  /* 卡面效果下方「编辑构图」：把页面滚到照片构图面板，避免用户找不到滑块。 */
  function focusCropPanel() {
    var panel = $('crop-panel')
    if (!panel) return
    try { panel.scrollIntoView({ behavior: 'smooth', block: 'center' }) } catch (error) { panel.scrollIntoView() }
    panel.classList.add('is-focused')
    setTimeout(function () { panel.classList.remove('is-focused') }, 1600)
  }

  function tierRank(tier) {
    var hit = BACKGROUNDS.filter(function (item) { return item.id === String(tier || '') })[0]
    return hit ? hit.rank : null
  }

  /* 银卡/金卡解锁所需生涯积分：服务端下发优先，前端只用兜底值。 */
  function unlockPoints(item) {
    var rule = state.settings.tierRule || TIER_FALLBACK
    var value = Number(item.id === 'silver' ? rule.silverAt : item.id === 'gold' ? rule.goldAt : 0)
    if (Number.isFinite(value) && value > 0) return value
    return item.id === 'silver' ? TIER_FALLBACK.silverAt : item.id === 'gold' ? TIER_FALLBACK.goldAt : 0
  }

  function pointsShort(item) {
    var at = unlockPoints(item)
    return at ? Math.max(0, at - Number(state.settings.points || 0)) : 0
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
      showError('该球员还没有标准形象照，先用「直接生成 AI 形象照」生成一张再回来编辑球员卡。', true)
      return
    }
    if (code === 'PLAYER_CARD_BACKGROUND_LOCKED') { toast((error && error.message) || '该背景尚未解锁'); setPreviewState('背景未解锁', true); return }
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
    var current = tierRank(settings.tier)
    list.innerHTML = ''
    BACKGROUNDS.forEach(function (item) {
      /* 只开放已达到的卡级：更高等级一律灰度锁定，并按积分门槛提示；
         同级以内改背景仍需满 100 分或会员权益（服务端同一套判定）。 */
      var aboveTier = current == null ? false : item.rank > current
      var allowed, note
      if (current == null) {
        allowed = false
        note = '积分待核定'
      } else if (aboveTier) {
        allowed = false
        note = unlockPoints(item) + ' 分解锁'
      } else if (item.id !== settings.tier && !settings.canChangeBackground) {
        allowed = false
        note = '满 100 分或会员解锁'
      } else {
        allowed = true
        note = item.note
      }
      var active = item.id === settings.backgroundId
      var button = document.createElement('button')
      button.type = 'button'
      button.className = 'bg-option bg-option--thumb' + (active ? ' is-active' : '') + (allowed ? '' : ' is-locked') + (aboveTier ? ' is-tier-locked' : '')
      button.disabled = !allowed
      button.setAttribute('data-bg', item.id)
      var thumb = state.thumbs[item.id]
      button.innerHTML =
        '<span class="bg-thumb">' +
        (thumb ? '<img src="' + escapeHtml(thumb) + '" alt="' + escapeHtml(item.name) + ' 背景效果" />' : '<span class="bg-thumb__ph">' + (aboveTier ? '解锁后可见' : '效果加载中') + '</span>') +
        (allowed ? '' : '<span class="bg-lock">🔒</span>') +
        '</span>' +
        '<strong>' + escapeHtml(item.name) + '</strong>' +
        '<small>' + escapeHtml(note) + '</small>'
      button.addEventListener('click', function () {
        if (active) return
        if (!allowed) {
          if (aboveTier) {
            toast(item.name + '需要生涯积分满 ' + unlockPoints(item) + ' 分，还差 ' + pointsShort(item) + ' 分')
          } else {
            toast('更换背景需要生涯积分满 100 分或开通会员')
          }
          return
        }
        settings.backgroundId = item.id
        renderBackgrounds()
        requestPreview()
      })
      list.appendChild(button)
    })
    $('background-hint').textContent = backgroundHint(current)
  }

  function backgroundHint(current) {
    var settings = state.settings
    if (current == null) return '积分待核定'
    if (current === 0) return '还差 ' + pointsShort(BACKGROUNDS[1]) + ' 分升银卡'
    if (current === 1) return '还差 ' + pointsShort(BACKGROUNDS[2]) + ' 分升金卡'
    return '已达金卡等级'
  }

  /* 背景缩略图同样走服务端成卡渲染，保证看到的是真实背景而不是色块。
     未达等级的缩略图也要取：页面用灰度展示，让用户看到解锁后的样式。
     逐张串行请求，失败即跳过，不阻塞主预览。 */
  function loadThumbs() {
    var settings = state.settings
    if (!settings || !settings.tier || state.thumbBusy) return
    var pending = BACKGROUNDS.filter(function (item) { return !state.thumbs[item.id] })
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
      if (error.code === 'PLAYER_CARD_PHOTO_PAY_REQUIRED') toast('换照片需先用「直接生成 AI 形象照」合成新形象照，本页不扣费')
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
    $('btn-edit-crop').addEventListener('click', focusCropPanel)
    $('btn-change-photo').addEventListener('click', openAiPortrait)
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
        points: Number(score.points || 0),
        tierRule: player.tierRule || TIER_FALLBACK,
        canChangeBackground: Boolean(score.canChangeBackground),
        crop: draft.crop || { zoom: 1, x: 0, y: 0 }
      }
      $('design-sub').textContent = (state.settings.name || '球员') + ' · 背景与形象照'
      /* 历史上已保存的背景可能高于当前卡级（例如会员越级选过金卡）：
         这里按已达到的卡级回退预览，保存时服务端同样会拒绝越级背景。 */
      var savedRank = tierRank(state.settings.backgroundId)
      var currentRank = tierRank(state.settings.tier)
      var fallbackFrom = ''
      if (savedRank != null && currentRank != null && savedRank > currentRank) {
        fallbackFrom = state.settings.backgroundId
        state.settings.backgroundId = state.settings.tier
      }
      show('state-loading', false)
      show('content', true)
      renderBackgrounds()
      renderCrop()
      requestPreview().then(loadThumbs)
      if (fallbackFrom) toast('原卡面背景超出当前卡级，已按' + BACKGROUNDS[currentRank].name + '预览，需要积分达标后才能保存')
    }).catch(function (error) {
      var code = (error && error.code) || ''
      if (code === 'PLAYER_CARD_PORTRAIT_REQUIRED') { showError('该球员还没有标准形象照，先用「直接生成 AI 形象照」生成一张再回来编辑球员卡。', true); return }
      if (code === 'PLAYER_CARD_FORBIDDEN') { showError('只能设计本人或已绑定孩子的球员卡'); return }
      showError((error && error.message) || '卡面读取失败，请稍后重试')
    })
  }

  bind()
  init()
})()
