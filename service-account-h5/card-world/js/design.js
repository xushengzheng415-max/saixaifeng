(function () {
  'use strict'
  // 服务号 H5 · 编辑球员卡：卡面在手机本机实时合成（player-card-dynamic/1 描述协议 + 浏览器 canvas），
  // 不再每次改背景/拖构图都等服务端出一张 PNG，所以打开和拖动都更快。
  // 保存仍走服务端校验（卡级、背景解锁、换照片计费都在后端判定），本页只负责展示与交互。
  var Api = window.CardWorldApi
  var Dynamic = window.SxfDynamicCard
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
    scenes: {},
    thumbs: {},
    crop: { zoom: 1, x: 0, y: 0 },
    cropping: false,
    renderSeq: 0,
    thumbBusy: false,
    fontsReady: false,
    drag: null,
    tap: null,
    saving: false
  }
  var imageCache = {}

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

  /* 换照片/换形象照统一进 portrait.html：mode=upload 是相册上传或拍摄，mode=ai 是一键形象照。 */
  function openPhotoPage(mode) {
    var settings = state.settings
    var playerId = (settings && settings.playerId) || playerIdFromQuery()
    if (!playerId) { toast('还没有可编辑的球员卡，先回到卡库选择球员'); return }
    rememberPlayerId(playerId)
    location.href = './portrait.html?playerId=' + encodeURIComponent(playerId) + '&mode=' + (mode === 'ai' ? 'ai' : 'upload')
  }

  function openPhotoSheet() {
    closeCrop()
    show('photo-sheet', true)
  }

  function closePhotoSheet() { show('photo-sheet', false) }

  /* 「更换卡面」把页面滚到背景卡面，并短暂高亮，避免用户在长页面里找不到。 */
  function focusBackgroundPanel() {
    var panel = $('background-panel')
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
    var rule = (state.settings && state.settings.tierRule) || TIER_FALLBACK
    var value = Number(item.id === 'silver' ? rule.silverAt : item.id === 'gold' ? rule.goldAt : 0)
    if (Number.isFinite(value) && value > 0) return value
    return item.id === 'silver' ? TIER_FALLBACK.silverAt : item.id === 'gold' ? TIER_FALLBACK.goldAt : 0
  }

  function pointsShort(item) {
    var at = unlockPoints(item)
    return at ? Math.max(0, at - Number(state.settings.points || 0)) : 0
  }

  function setPreviewState(message, isError) {
    var el = $('preview-state')
    el.textContent = message
    el.style.color = isError ? 'var(--gold)' : ''
  }

  function cropValues() {
    return { zoom: Number(state.crop.zoom) || 1, x: Number(state.crop.x) || 0, y: Number(state.crop.y) || 0 }
  }

  function syncCropLabels() {
    var zoom = $('crop-zoom')
    if (zoom) zoom.value = String(cropValues().zoom)
    $('crop-zoom-value').textContent = cropValues().zoom.toFixed(2)
  }

  function clampCrop() {
    state.crop.zoom = Math.min(4, Math.max(1, Number(state.crop.zoom) || 1))
    state.crop.x = Math.min(2, Math.max(-2, Number(state.crop.x) || 0))
    state.crop.y = Math.min(2, Math.max(-2, Number(state.crop.y) || 0))
  }

  function settingsPayload(backgroundId) {
    var settings = state.settings
    return {
      playerId: settings.playerId,
      backgroundId: backgroundId || settings.backgroundId,
      crop: cropValues(),
      mode: 'portrait',
      tier: settings.tier,
      expectedVersion: settings.version
    }
  }

  function handleError(error) {
    var code = (error && error.code) || ''
    if (code === 'PLAYER_CARD_PORTRAIT_REQUIRED') {
      showError('该球员还没有标准形象照，先用「一键形象照」生成一张再回来编辑球员卡。', true)
      return
    }
    if (code === 'PLAYER_CARD_BACKGROUND_LOCKED') { toast((error && error.message) || '该背景尚未解锁'); setPreviewState('背景未解锁', true); return }
    if (code === 'PLAYER_CARD_TEMPLATE_CHANGED' || code === 'PLAYER_CARD_TEMPLATE_UNAVAILABLE') { toast('卡面模板已更新，请返回重新进入'); return }
    if (code === 'PLAYER_CARD_CONFLICT') { toast('卡面已在别处更新，请返回卡库重新进入'); return }
    toast((error && error.message) || '操作失败，请重试')
  }

  /* ---------- 本机合成 ---------- */
  function loadCached(url) {
    if (imageCache[url]) return imageCache[url]
    var pending = new Promise(function (resolve, reject) {
      var img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = function () { resolve(img) }
      img.onerror = function () { delete imageCache[url]; reject(new Error('卡面素材读取失败')) }
      img.src = url
    })
    imageCache[url] = pending
    return pending
  }

  function makeCanvas(width, height) {
    var canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }

  function drawScene(scene, canvas, scale) {
    return Dynamic.draw(scene, {
      canvas: canvas,
      scale: scale,
      createCanvas: makeCanvas,
      loadImage: loadCached
    })
  }

  /* 字体单独加载：只按 scene.fonts 拉字库，不再让渲染器先画一整张卡（首屏少一半工作量）。
     字体没到之前先用系统字体出图，到位后再重画一次，用户不用盯着空白等。 */
  var fontJobs = {}
  function loadFonts(scene) {
    var fonts = (scene && scene.fonts) || []
    if (!fonts.length || typeof FontFace === 'undefined' || !document.fonts) return Promise.resolve(false)
    var jobs = fonts.map(function (font) {
      var key = String(font.family) + '|' + String(font.weight || 400) + '|' + String(font.url)
      if (fontJobs[key]) return fontJobs[key]
      var face = new FontFace(font.family, 'url(' + font.url + ')', { weight: String(font.weight || 400) })
      fontJobs[key] = face.load().then(function (loaded) {
        try { document.fonts.add(loaded) } catch (error) { /* 已存在同名字体时忽略 */ }
        return true
      }, function () { delete fontJobs[key]; return false })
      return fontJobs[key]
    })
    return Promise.all(jobs).then(function (results) {
      return results.some(Boolean)
    }, function () { return false })
  }

  function currentScene() {
    var settings = state.settings
    return settings ? state.scenes[settings.backgroundId] || null : null
  }

  function renderMain() {
    var scene = currentScene()
    if (!scene) return Promise.resolve(false)
    var seq = ++state.renderSeq
    var canvas = makeCanvas(300, 430)
    return drawScene(Object.assign({}, scene, { crop: cropValues() }), canvas, 2).then(function () {
      if (seq !== state.renderSeq) return false
      var host = $('design-canvas')
      host.innerHTML = ''
      host.appendChild(canvas)
      show('design-empty', false)
      setPreviewState(state.cropping ? '拖动照片调整位置' : '卡面已就绪')
      return true
    }).catch(function (error) {
      if (seq !== state.renderSeq) return false
      setPreviewState((error && error.message) || '卡面合成失败', true)
      return false
    })
  }

  var renderTimer = null
  function scheduleRender() {
    if (renderTimer) return
    renderTimer = setTimeout(function () { renderTimer = null; renderMain() }, 60)
  }

  /* 背景/姿势改了才需要问服务端要新的卡面描述（只回 JSON 素材地址，不回整张 PNG）。 */
  function loadScene(backgroundId) {
    if (state.scenes[backgroundId]) return Promise.resolve(state.scenes[backgroundId])
    var payload = Object.assign(settingsPayload(backgroundId), { dynamicCardProtocol: 'player-card-dynamic/1' })
    return Api.previewCard(payload).then(function (result) {
      // 服务端在缺素材时会回 status/reason，直接透出原因，别让用户面对「合成失败」。
      if (!result || !result.cardScene) throw new Error((result && result.reason) || '该卡面暂不支持预览，请直接保存')
      state.scenes[backgroundId] = result.cardScene
      return result.cardScene
    })
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
        var previous = settings.backgroundId
        settings.backgroundId = item.id
        renderBackgrounds()
        setPreviewState('正在换背景…')
        loadScene(item.id).then(function (scene) {
          loadFonts(scene)
          return renderMain()
        }).catch(function (error) {
          settings.backgroundId = previous
          renderBackgrounds()
          handleError(error)
        })
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

  /* 缩略图也用本机合成：拿该背景的卡面描述画一张 300×430 的小图，省掉服务端逐张出 PNG。 */
  function loadThumbs() {
    var settings = state.settings
    if (!settings || !settings.tier || state.thumbBusy) return
    var pending = BACKGROUNDS.filter(function (item) { return !state.thumbs[item.id] })
    if (!pending.length) return
    state.thumbBusy = true
    Promise.all(pending.map(function (item) {
      return loadScene(item.id).then(function (scene) {
        var canvas = makeCanvas(300, 430)
        return drawScene(Object.assign({}, scene, { crop: { zoom: 1, x: 0, y: 0 } }), canvas, 1).then(function () {
          state.thumbs[item.id] = canvas.toDataURL('image/png')
        })
      }).catch(function () { /* 单张缩略图失败时保留占位，不影响主流程 */ })
    })).then(function () {
      state.thumbBusy = false
      renderBackgrounds()
    })
  }

  /* ---------- 编辑构图：直接在卡面上拖 ---------- */
  function enterCrop() {
    if (!state.settings || !currentScene()) return
    state.cropping = true
    show('crop-bar', true)
    $('btn-edit-crop').className = 'btn btn--gold'
    $('design-stage').classList.add('is-cropping')
    syncCropLabels()
    setPreviewState('拖动照片调整位置')
    try { $('design-stage').scrollIntoView({ behavior: 'smooth', block: 'center' }) } catch (error) { /* ignore */ }
  }

  function closeCrop() {
    if (!state.cropping) return
    state.cropping = false
    show('crop-bar', false)
    $('btn-edit-crop').className = 'btn btn--ghost'
    $('design-stage').classList.remove('is-cropping')
    setPreviewState('卡面已就绪')
  }

  /* 拖动换算：卡面逻辑宽 300，人物层左右位移按 264、上下按 300（与渲染器同一套换算）。 */
  function pointToCrop(dx, dy, rect) {
    var logical = 300 / Math.max(1, rect.width)
    return { dx: dx * logical / 264, dy: dy * logical / 300 }
  }

  function stagePointers() {
    return state.drag ? state.drag.points : null
  }

  function bindStage() {
    var stage = $('design-stage')
    stage.addEventListener('pointerdown', function (event) {
      if (!state.settings || !currentScene()) return
      // 没进构图时这次按下先当作「点卡面」候选，不抢页面滚动：
      // 手指明显移动就是翻页滚动，几乎没动才进构图（进构图后 touch-action 才置为 none）。
      if (!state.cropping) {
        state.tap = { x: event.clientX, y: event.clientY, moved: false }
        return
      }
      if (!state.drag) state.drag = { points: {}, last: null, distance: 0 }
      state.drag.points[event.pointerId] = { x: event.clientX, y: event.clientY }
      state.drag.last = { x: event.clientX, y: event.clientY }
      var ids = Object.keys(state.drag.points)
      state.drag.distance = ids.length > 1 ? distanceOf() : 0
      try { stage.setPointerCapture(event.pointerId) } catch (error) { /* ignore */ }
    })
    stage.addEventListener('pointermove', function (event) {
      if (!state.cropping) {
        if (!state.tap || state.tap.moved) return
        if (Math.abs(event.clientX - state.tap.x) > 12 || Math.abs(event.clientY - state.tap.y) > 12) state.tap.moved = true
        return
      }
      var drag = state.drag
      if (!drag || !drag.points[event.pointerId]) return
      drag.points[event.pointerId] = { x: event.clientX, y: event.clientY }
      var ids = Object.keys(drag.points)
      var rect = $('design-canvas').getBoundingClientRect()
      if (ids.length > 1) {
        var next = distanceOf()
        if (drag.distance > 0 && next > 0) {
          state.crop.zoom = (Number(state.crop.zoom) || 1) * (next / drag.distance)
          clampCrop()
          syncCropLabels()
          scheduleRender()
        }
        drag.distance = next
        drag.last = null
        return
      }
      if (!drag.last) { drag.last = { x: event.clientX, y: event.clientY }; return }
      var delta = pointToCrop(event.clientX - drag.last.x, event.clientY - drag.last.y, rect)
      state.crop.x = (Number(state.crop.x) || 0) + delta.dx
      state.crop.y = (Number(state.crop.y) || 0) + delta.dy
      clampCrop()
      drag.last = { x: event.clientX, y: event.clientY }
      scheduleRender()
    })
    function releaseDrag(event) {
      if (!state.drag || !state.drag.points[event.pointerId]) return
      delete state.drag.points[event.pointerId]
      if (!Object.keys(state.drag.points).length) state.drag = null
    }
    function release(event) {
      if (state.cropping) {
        releaseDrag(event)
        return
      }
      // 点一下卡面就进构图；手指有过的移动说明是在翻页滚动，不打断。
      if (state.tap && !state.tap.moved) enterCrop()
      state.tap = null
    }
    stage.addEventListener('pointerup', release)
    stage.addEventListener('pointercancel', function (event) {
      if (state.cropping) releaseDrag(event)
      state.tap = null
    })
    stage.addEventListener('pointerleave', function (event) {
      if (event.pointerType === 'mouse') {
        if (state.cropping) releaseDrag(event)
        state.tap = null
      }
    })

    function distanceOf() {
      var ids = stagePointers() ? Object.keys(stagePointers()) : []
      if (ids.length < 2) return 0
      var a = stagePointers()[ids[0]]
      var b = stagePointers()[ids[1]]
      return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2))
    }
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
      if (error.code === 'PLAYER_CARD_PHOTO_PAY_REQUIRED') toast('换照片请用「更换照片」上传自己照片或一键生成，本页只保存背景与构图')
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
    $('btn-change-photo').addEventListener('click', openPhotoSheet)
    $('btn-change-bg').addEventListener('click', focusBackgroundPanel)
    $('btn-edit-crop').addEventListener('click', function () {
      if (state.cropping) closeCrop()
      else enterCrop()
    })
    $('btn-crop-done').addEventListener('click', function () {
      closeCrop()
      renderMain()
    })
    $('btn-crop-reset').addEventListener('click', function () {
      state.crop = { zoom: 1, x: 0, y: 0 }
      syncCropLabels()
      renderMain()
    })
    $('crop-zoom').addEventListener('input', function () {
      state.crop.zoom = Number($('crop-zoom').value)
      clampCrop()
      syncCropLabels()
      scheduleRender()
    })
    Array.prototype.forEach.call(document.querySelectorAll('[data-sheet-close]'), function (node) {
      node.addEventListener('click', closePhotoSheet)
    })
    $('opt-upload').addEventListener('click', function () { closePhotoSheet(); openPhotoPage('upload') })
    $('opt-ai').addEventListener('click', function () { closePhotoSheet(); openPhotoPage('ai') })
    $('btn-ai-error').addEventListener('click', function () { openPhotoPage('ai') })
    $('btn-back').addEventListener('click', function () { location.href = './index.html' })
    $('btn-save').addEventListener('click', saveCard)
    bindStage()
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
        canChangeBackground: Boolean(score.canChangeBackground)
      }
      var saved = draft.crop || { zoom: 1, x: 0, y: 0 }
      state.crop = { zoom: Number(saved.zoom) || 1, x: Number(saved.x) || 0, y: Number(saved.y) || 0 }
      clampCrop()
      $('design-sub').textContent = (state.settings.name || '球员') + ' · 更换照片 · 更换卡面 · 编辑构图'
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
      syncCropLabels()
      var ready
      if (!fallbackFrom && result.cardScene) {
        // getMyPlayerCard 已带回当前背景的卡面描述，直接用，省掉一次请求。
        state.scenes[state.settings.backgroundId] = result.cardScene
        ready = renderMain()
      } else {
        ready = loadScene(state.settings.backgroundId).then(function () { return renderMain() })
      }
      ready.then(function (rendered) {
        if (!rendered) return
        // 先把卡面给用户看，字体和另外两张缩略图随后补上，不拖慢首屏。
        loadFonts(currentScene()).then(function (loaded) {
          if (!loaded || state.fontsReady) return
          state.fontsReady = true
          scheduleRender()
        })
        setTimeout(loadThumbs, 220)
      }, function (error) { handleError(error) })
      if (fallbackFrom) toast('原卡面背景超出当前卡级，已按' + BACKGROUNDS[currentRank].name + '预览，需要积分达标后才能保存')
    }).catch(function (error) {
      var code = (error && error.code) || ''
      if (code === 'PLAYER_CARD_PORTRAIT_REQUIRED') { showError('该球员还没有标准形象照，先用「一键形象照」生成一张再回来编辑球员卡。', true); return }
      if (code === 'PLAYER_CARD_FORBIDDEN') { showError('只能编辑本人或已绑定孩子的球员卡'); return }
      showError((error && error.message) || '卡面读取失败，请稍后重试')
    })
  }

  bind()
  init()
})()
