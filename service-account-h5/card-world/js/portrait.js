(function () {
  'use strict'
  // 服务号 H5 · 球员卡「换形象照」页，两种方式并存：
  //   ①「上传自己的照片」：本人单人照 → 服务端抠图成透明 PNG → 确认后写进卡面
  //      （走 cardPhotoPrepare / cardPhotoApply，价格沿用既有「换照片」规则）。
  //   ②「AI 生成形象照」：① 本人单人照 ② 球衣照片 → 拼参考板 → 生成透明形象照再写进卡面
  //      （走 cardAiPortraitPrepare / cardAiPortraitApply）。
  // 扣费、凭证、入库都在服务端，本页不决定金额。
  var Api = window.CardWorldApi
  var Dynamic = window.SxfDynamicCard
  var AI_HTTP = 'https://www.sxffootball.cn/aiPortraitDemo'
  var PENDING_KEY = 'sxf_card_ai_portrait_player'
  var BACKGROUNDS = [
    { id: 'bronze', name: '铜卡', note: '基础', rank: 0 },
    { id: 'silver', name: '银卡', note: '进阶', rank: 1 },
    { id: 'gold', name: '金卡', note: '精英', rank: 2 }
  ]
  /* 兜底门槛与 data-center/score-rules.cjs 一致，实际值由服务端 tierRule 下发。 */
  var TIER_FALLBACK = { silverAt: 45, goldAt: 100 }
  // 模型只接受 1 张参考图：左边人脸、右边球衣拼成一张参考板（几何沿用已验证的
  // service-account-h5/ai-portrait-demo.html：纯白底、脸 62%、球衣 34%）。
  // 球衣整张送，不猜正面/背面，避免把单件球衣照片裁掉一半。
  var SHEET_SIZE = 2048
  var SHEET_STEPS = [[2048, 0.92], [1800, 0.9], [1600, 0.9], [1440, 0.88]]
  var SHEET_MAX_CHARS = 3900000
  var POSES = [
    { key: 'front', label: '正面抱膀', desc: '身体正对镜头' },
    { key: 'side', label: '半侧抱膀', desc: '三分之二侧身' },
    { key: 'low', label: '低位抱膀', desc: '双手交叠在下腹' }
  ]

  var state = {
    playerId: '',
    name: '',
    teamName: '',
    mode: 'upload',
    pose: 'front',
    photo: '',
    photoImg: null,
    jersey: '',
    jerseyImg: null,
    photoBusy: false,
    // 裁剪后的照片解码完成前不要拼参考板，否则会拿空白图生成。
    photoReady: null,
    jerseyReady: null,
    // 上传自己的照片：ownPreview 是本地压缩图，ownTicket 是服务端抠图凭证。
    ownPreview: '',
    ownTicket: '',
    ownCut: '',
    ownBusy: false,
    // 确认背景图：卡级、换背景权益和背景描述都取服务端，页面只负责展示与本机合成。
    card: null,
    cardScenes: {},
    cardImages: {},
    cardBg: '',
    cardBgBusy: false,
    cardRenderSeq: 0,
    // 卡面微调：和编辑球员卡的构图换算同一套（逻辑宽 300，左右按 264、上下按 300）
    crop: { zoom: 1, x: 0, y: 0 },
    cropDrag: null,
    cropTimer: 0,
    photoReplace: null,
    price: null,
    busy: false,
    requestId: '',
    ticket: '',
    referenceTicket: '',
    result: '',
    resultId: '',
    timer: null,
    applied: false
  }

  function $(id) { return document.getElementById(id) }
  function show(id, visible) { $(id).hidden = !visible }
  function text(value) { return String(value == null ? '' : value).trim() }

  var toastTimer = null
  function toast(message) {
    var el = $('toast')
    el.textContent = text(message)
    el.hidden = false
    clearTimeout(toastTimer)
    toastTimer = setTimeout(function () { el.hidden = true }, 2800)
  }

  function note(message) {
    var el = $('generate-note')
    el.textContent = text(message)
    el.hidden = !message
  }

  function playerIdFromQuery() {
    try { return text(new URLSearchParams(location.search).get('playerId')) } catch (error) { return '' }
  }

  // 球员卡页「更换照片」会带 mode 进来：上传自己的照片 / 一键形象照（AI 合成）。
  function modeFromQuery() {
    try {
      var mode = new URLSearchParams(location.search).get('mode')
      // 入口已定好方式：卡面页「更换照片」带 mode；卡面页旧的「AI 形象照」入口不带参数，按一键形象照显示。
      return mode === 'upload' ? 'upload' : 'ai'
    } catch (error) { return 'ai' }
  }

  function rememberPlayerId(playerId) {
    try {
      if (playerId) sessionStorage.setItem(PENDING_KEY, playerId)
      else sessionStorage.removeItem(PENDING_KEY)
    } catch (error) { /* ignore */ }
  }

  function pendingPlayerId() {
    try { return text(sessionStorage.getItem(PENDING_KEY)) } catch (error) { return '' }
  }

  function rememberRequestId(requestId) {
    try { sessionStorage.setItem(PENDING_KEY + ':request', requestId) } catch (error) { /* ignore */ }
  }

  function rememberedRequestId() {
    try { return text(sessionStorage.getItem(PENDING_KEY + ':request')) } catch (error) { return '' }
  }

  function forgetRequestId() {
    try { sessionStorage.removeItem(PENDING_KEY + ':request') } catch (error) { /* ignore */ }
  }

  function newRequestId() {
    var random = Math.random().toString(36).slice(2, 10)
    return 'c' + Date.now().toString(36) + random
  }

  function backUrl() {
    return './design.html?playerId=' + encodeURIComponent(state.playerId || playerIdFromQuery())
  }

  // 合成动画：只做过程提示，真实进度以服务端返回为准；成功、失败、离开都要收掉覆盖层。
  var animTimer = null
  var ANIM_STEPS = ['gen-step-1', 'gen-step-2', 'gen-step-3']
  var ANIM_INTERVAL = 6000

  function setAnimStep(index) {
    ANIM_STEPS.forEach(function (id, i) {
      var el = $(id)
      if (!el) return
      el.className = 'gen-anim__step' + (i < index ? ' is-done' : (i === index ? ' is-active' : ''))
    })
  }

  function startGenAnim() {
    var host = $('gen-anim')
    if (!host) return
    clearInterval(animTimer)
    host.hidden = false
    var step = 0
    setAnimStep(step)
    animTimer = setInterval(function () {
      // 最后一步一直转，等真实结果回来再收掉，不假装已完成。
      if (step >= ANIM_STEPS.length - 1) return
      step += 1
      setAnimStep(step)
    }, ANIM_INTERVAL)
  }

  function stopGenAnim() {
    clearInterval(animTimer)
    animTimer = null
    ANIM_STEPS.forEach(function (id) {
      var el = $(id)
      if (el) el.className = 'gen-anim__step'
    })
    var host = $('gen-anim')
    if (host) host.hidden = true
  }

  // 方式由入口决定，页内只保留一种流程，不再出现「一键形象照又带一个上传自己的照片」。
  function setMode(mode) {
    state.mode = mode === 'upload' ? 'upload' : 'ai'
    var upload = state.mode === 'upload'
    show('upload-flow', upload)
    show('ai-flow', !upload)
    $('portrait-sub').textContent = (state.name || '球员') + (upload ? ' · 用现成单人照自动抠图' : ' · 上传头像和球服生成')
    $('player-hint').textContent = upload
      ? '用相册或拍照的现成单人照换卡面：选好后先拖动调整位置，服务端自动抠图，确认后才写进卡面。'
      : '上传一张本人照片和一张球衣照片，AI 按球衣生成带动作的透明形象照；生成按次计费，失败或放弃自动退回。'
  }

  function ownNote(message) {
    var el = $('own-note')
    el.textContent = text(message)
    el.hidden = !message
  }

  function renderPhotoReplace(photoReplace) {
    if (!photoReplace) return
    state.photoReplace = photoReplace
    var line = $('own-price-line')
    if (photoReplace.free === true) {
      line.textContent = '生涯积分已满 100 分，上传自己的照片换卡面免费。'
      return
    }
    var cost = Number(photoReplace.cost) || 0
    var balance = photoReplace.balance
    line.textContent = '未满 100 分换照片消耗 ' + cost + ' 滴蜂蜜'
      + (typeof balance === 'number' ? '（当前余额 ' + balance + ' 滴）' : '')
      + (photoReplace.available === false ? '，余额不足' : '')
  }

  /* ---------- 确认背景图（和注册球员建档同一步） ---------- */
  function tierRank(tier) {
    var hit = BACKGROUNDS.filter(function (item) { return item.id === String(tier || '') })[0]
    return hit ? hit.rank : null
  }

  function unlockPoints(item) {
    var rule = (state.card && state.card.tierRule) || TIER_FALLBACK
    var value = Number(item.id === 'silver' ? rule.silverAt : item.id === 'gold' ? rule.goldAt : 0)
    if (Number.isFinite(value) && value > 0) return value
    return item.id === 'silver' ? TIER_FALLBACK.silverAt : TIER_FALLBACK.goldAt
  }

  function pointsShort(item) {
    var at = unlockPoints(item)
    return at ? Math.max(0, at - Number((state.card && state.card.points) || 0)) : 0
  }

  function bgName(backgroundId) {
    var hit = BACKGROUNDS.filter(function (item) { return item.id === backgroundId })[0]
    return hit ? hit.name : '当前'
  }

  function cardGate(item) {
    var current = tierRank(state.card && state.card.tier)
    if (current == null) return { allowed: false, note: '积分待核定', aboveTier: false }
    if (item.rank > current) return { allowed: false, note: unlockPoints(item) + ' 分解锁', aboveTier: true }
    if (item.id !== state.card.tier && !state.card.canChangeBackground) return { allowed: false, note: '满 100 分或会员解锁', aboveTier: false }
    return { allowed: true, note: item.note, aboveTier: false }
  }

  // 卡级、积分门槛、换背景权益统一取服务端结果，页面不自己算金额或判定等级。
  function loadCardInfo() {
    if (state.card) return Promise.resolve(state.card)
    return Api.getCard(state.playerId).then(function (result) {
      var player = (result && result.player) || {}
      var score = player.playerCard || {}
      state.card = {
        tier: text(player.cardTier),
        version: Number(player.version || 0),
        backgroundId: text(player.backgroundId) || text(player.cardTier),
        points: Number(score.points || 0),
        tierRule: player.tierRule || TIER_FALLBACK,
        canChangeBackground: score.canChangeBackground === true
      }
      if (!state.cardBg) state.cardBg = state.card.backgroundId
      return state.card
    })
  }

  function loadCardScene(backgroundId) {
    if (state.cardScenes[backgroundId]) return Promise.resolve(state.cardScenes[backgroundId])
    var card = state.card
    return Api.previewCard({
      playerId: state.playerId,
      backgroundId: backgroundId,
      crop: { zoom: 1, x: 0, y: 0 },
      mode: 'portrait',
      tier: card.tier,
      expectedVersion: card.version,
      dynamicCardProtocol: 'player-card-dynamic/1'
    }).then(function (result) {
      if (!result || !result.cardScene) throw new Error((result && result.reason) || '该背景暂不支持预览')
      state.cardScenes[backgroundId] = result.cardScene
      return result.cardScene
    })
  }

  function loadCardImage(url) {
    if (state.cardImages[url]) return state.cardImages[url]
    var pending = new Promise(function (resolve, reject) {
      var image = new Image()
      image.crossOrigin = 'anonymous'
      image.onload = function () { resolve(image) }
      image.onerror = function () { delete state.cardImages[url]; reject(new Error('卡面素材读取失败')) }
      image.src = url
    })
    state.cardImages[url] = pending
    return pending
  }

  function makeCanvas(width, height) {
    var canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }

  // 占位提示始终留在容器里，只切换显隐，避免清空容器后按 id 取不到节点。
  function cardEmpty(message) {
    var empty = $('own-card-empty')
    if (!empty) return
    empty.textContent = text(message)
    empty.hidden = !message
  }

  function clampOwnCrop() {
    state.crop.zoom = Math.min(4, Math.max(1, Number(state.crop.zoom) || 1))
    state.crop.x = Math.min(2, Math.max(-2, Number(state.crop.x) || 0))
    state.crop.y = Math.min(2, Math.max(-2, Number(state.crop.y) || 0))
    return { zoom: state.crop.zoom, x: state.crop.x, y: state.crop.y }
  }

  // 拖动换算与编辑球员卡一致：卡面逻辑宽 300，人物左右位移按 264、上下按 300。
  function ownCropDelta(dx, dy, rect) {
    var logical = 300 / Math.max(1, rect.width || 300)
    return { dx: dx * logical / 264, dy: dy * logical / 300 }
  }

  function scheduleOwnRender() {
    clearTimeout(state.cropTimer)
    state.cropTimer = setTimeout(function () { paintOwnCard() }, 60)
  }

  function bindOwnStage() {
    var stage = $('own-card-canvas')
    stage.addEventListener('pointerdown', function (event) {
      if (!state.ownCut || state.cardBgBusy) return
      if (!state.cropDrag) state.cropDrag = { points: {}, last: null, distance: 0 }
      state.cropDrag.points[event.pointerId] = { x: event.clientX, y: event.clientY }
      state.cropDrag.last = { x: event.clientX, y: event.clientY }
      var ids = Object.keys(state.cropDrag.points)
      state.cropDrag.distance = ids.length > 1 ? ownPinchDistance() : 0
      try { stage.setPointerCapture(event.pointerId) } catch (error) { /* ignore */ }
    })
    stage.addEventListener('pointermove', function (event) {
      var drag = state.cropDrag
      if (!drag || !drag.points[event.pointerId]) return
      drag.points[event.pointerId] = { x: event.clientX, y: event.clientY }
      var rect = $('own-card-canvas').getBoundingClientRect()
      if (Object.keys(drag.points).length > 1) {
        var next = ownPinchDistance()
        if (drag.distance > 0 && next > 0) {
          state.crop.zoom = (Number(state.crop.zoom) || 1) * (next / drag.distance)
          clampOwnCrop()
          scheduleOwnRender()
        }
        drag.distance = next
        drag.last = null
        return
      }
      if (!drag.last) { drag.last = { x: event.clientX, y: event.clientY }; return }
      var delta = ownCropDelta(event.clientX - drag.last.x, event.clientY - drag.last.y, rect)
      state.crop.x = (Number(state.crop.x) || 0) + delta.dx
      state.crop.y = (Number(state.crop.y) || 0) + delta.dy
      clampOwnCrop()
      drag.last = { x: event.clientX, y: event.clientY }
      scheduleOwnRender()
    })
    function release(event) {
      if (!state.cropDrag || !state.cropDrag.points[event.pointerId]) return
      delete state.cropDrag.points[event.pointerId]
      if (!Object.keys(state.cropDrag.points).length) state.cropDrag = null
    }
    stage.addEventListener('pointerup', release)
    stage.addEventListener('pointercancel', release)
    stage.addEventListener('pointerleave', release)
  }

  function ownPinchDistance() {
    var drag = state.cropDrag
    if (!drag) return 0
    var points = Object.keys(drag.points).map(function (key) { return drag.points[key] })
    if (points.length < 2) return 0
    var dx = points[0].x - points[1].x
    var dy = points[0].y - points[1].y
    return Math.sqrt(dx * dx + dy * dy)
  }

  // 把抠好的人像替换卡面里的照片层，本机合成真实卡面效果；不额外让服务端生成 PNG。
  function paintOwnCard() {
    var scene = state.cardScenes[state.cardBg]
    if (!Dynamic || !scene || !state.ownCut) return Promise.resolve(false)
    if (scene.portraitIsLayer) {
      cardEmpty('当前卡面不支持在本机预览，确认后仍按所选背景写进卡片')
      return Promise.resolve(false)
    }
    var seq = ++state.cardRenderSeq
    var patched = Object.assign({}, scene, {
      assets: Object.assign({}, scene.assets, { portrait: state.ownCut }),
      crop: clampOwnCrop()
    })
    var canvas = makeCanvas(300, 430)
    return Dynamic.draw(patched, {
      canvas: canvas,
      scale: 2,
      createCanvas: makeCanvas,
      loadImage: loadCardImage
    }).then(function () {
      if (seq !== state.cardRenderSeq) return false
      var host = $('own-card-canvas')
      var previous = typeof host.querySelector === 'function' ? host.querySelector('canvas') : null
      if (previous) host.removeChild(previous)
      host.appendChild(canvas)
      cardEmpty('')
      return true
    })
  }

  function renderOwnBackgrounds() {
    var list = $('own-bg-list')
    if (!list || !state.card) return
    list.innerHTML = ''
    BACKGROUNDS.forEach(function (item) {
      var gate = cardGate(item)
      var active = item.id === state.cardBg
      var button = document.createElement('button')
      button.type = 'button'
      button.className = 'bg-option' + (active ? ' is-active' : '') + (gate.allowed ? '' : ' is-locked')
      button.disabled = !gate.allowed
      button.innerHTML = '<strong>' + bgName(item.id) + '</strong><small>' + gate.note + '</small>'
      button.addEventListener('click', function () {
        if (state.cardBgBusy || item.id === state.cardBg) return
        if (!gate.allowed) {
          toast(gate.aboveTier
            ? bgName(item.id) + '需要生涯积分满 ' + unlockPoints(item) + ' 分，还差 ' + pointsShort(item) + ' 分'
            : '更换背景需要生涯积分满 100 分或开通会员')
          return
        }
        var previous = state.cardBg
        state.cardBg = item.id
        state.cardBgBusy = true
        renderOwnBackgrounds()
        loadCardScene(item.id).then(paintOwnCard).then(function () {
          state.cardBgBusy = false
          renderOwnBackgrounds()
        }).catch(function (error) {
          state.cardBg = previous
          state.cardBgBusy = false
          renderOwnBackgrounds()
          ownNote((error && error.message) || '这个背景暂时预览不了，请换一个')
        })
      })
      list.appendChild(button)
    })
    $('own-bg-hint').textContent = cardBgHint()
  }

  function cardBgHint() {
    if (!state.card || !state.card.tier) return '球员积分待核定，只能先按当前背景确认。'
    if (!state.cardBg) return '正在读取球员卡当前背景…'
    if (state.cardBg === state.card.backgroundId) return '当前就是球员卡正在用的背景，确认后替换照片并保存版式。'
    return '确认后先保存「' + bgName(state.cardBg) + '」背景，再把这张人像和版式写进卡面。'
  }

  function confirmOwnBackground() {
    cardEmpty('正在合成卡面效果…')
    loadCardInfo().then(function () {
      renderOwnBackgrounds()
      return loadCardScene(state.cardBg)
    }).then(function () {
      return paintOwnCard()
    }).catch(function (error) {
      cardEmpty('卡面效果暂时合成不了，确认后仍按所选背景写进卡片')
      ownNote((error && error.message) || '卡面效果读取失败，请稍后重试')
    })
  }

  // 背景换了先保存背景（服务端判定卡级/换背景权益），再用一次性凭证写照片，最后存版式。
  function saveOwnBackground() {
    var card = state.card
    if (!card || !card.tier || !state.cardBg || state.cardBg === card.backgroundId) return Promise.resolve(null)
    return Api.saveCard({
      playerId: state.playerId,
      backgroundId: state.cardBg,
      crop: clampOwnCrop(),
      mode: 'portrait',
      tier: card.tier,
      expectedVersion: card.version
    }).then(function (result) {
      card.version = Number((result && result.version) || card.version + 1)
      card.backgroundId = state.cardBg
      return result
    })
  }

  // 照片写回后再存一次版式（裁剪位置）。服务端按同一张照片只记位置，不重复计费；
  // 这一步失败也不影响已经换好的照片，只提示版式没存上。
  function saveOwnLayout(version) {
    var card = state.card
    if (!card || !card.tier) return Promise.resolve(false)
    return Api.saveCard({
      playerId: state.playerId,
      backgroundId: state.cardBg || card.backgroundId,
      crop: clampOwnCrop(),
      mode: 'portrait',
      tier: card.tier,
      expectedVersion: Number(version) || card.version
    }).then(function () { return true }).catch(function () { return false })
  }

  // 选好的照片先按网关体积收敛，再直接交服务端抠图；透明预览只有用户确认后才写进卡面。
  function prepareOwnData(photoData) {
    if (!photoData || state.ownBusy) return
    state.ownBusy = true
    state.crop = { zoom: 1, x: 0, y: 0 }
    ownNote('')
    $('btn-own-apply').disabled = true
    show('own-stage', false)
    show('own-actions', false)
    show('own-confirm', false)
    dropOwnTicket()
    state.ownPreview = photoData
    show('own-preview', true)
    show('own-empty', false)
    ownNote('正在做人像分割，稍等几秒…')
    Api.prepareCardPhoto({ playerId: state.playerId, photoData: photoData }).then(function (result) {
      state.ownTicket = text(result.photoTicket)
      state.ownCut = text(result.preview)
      if (!state.ownTicket || !state.ownCut) throw new Error('抠图结果获取失败，请重新选择照片')
      $('own-cut').src = state.ownCut
      show('own-stage', true)
      show('own-confirm', true)
      show('own-actions', true)
      $('btn-own-apply').disabled = false
      ownNote('人像分割完成：在卡面上微调位置，确认版式后写进球员卡。')
      confirmOwnBackground()
    }).catch(function (error) {
      state.ownTicket = ''
      show('own-confirm', false)
      ownNote((error && error.message) || '照片处理失败，请换一张正对镜头的照片')
      toast((error && error.message) || '照片处理失败，请换一张正对镜头的照片')
    }).then(function () {
      state.ownBusy = false
    })
  }

  function dropOwnTicket() {
    var ticket = state.ownTicket
    state.ownTicket = ''
    if (!ticket || !state.playerId) return Promise.resolve(null)
    return Api.cancelCardPhoto({ playerId: state.playerId, photoTicket: ticket }).catch(function () { return null })
  }

  function applyOwn() {
    if (state.ownBusy || !state.ownTicket) return
    var replace = state.photoReplace
    var paid = replace && replace.free !== true
    var card = state.card
    var changingBg = Boolean(card && card.tier && state.cardBg && state.cardBg !== card.backgroundId)
    if (paid && typeof window.confirm === 'function') {
      var cost = Number(replace.cost) || 0
      if (!window.confirm('未满 100 分换照片要消耗 ' + cost + ' 滴蜂蜜，确认用这张替换卡面吗？'
        + (changingBg ? '（同时换成' + bgName(state.cardBg) + '背景）' : ''))) return
    }
    state.ownBusy = true
    $('btn-own-apply').disabled = true
    ownNote(changingBg ? '正在保存背景并把照片写进卡面…' : '正在写进卡面…')
    saveOwnBackground().then(function () {
      return Api.applyCardPhoto({
        playerId: state.playerId,
        photoTicket: state.ownTicket,
        requestId: newRequestId(),
        confirmPhotoReplaceHoney: paid
      })
    }).then(function (result) {
      state.ownTicket = ''
      if (result && result.photoReplaceCharge) renderPhotoReplace({
        free: false,
        cost: Number(result.photoReplaceCharge.cost) || 0,
        balance: result.photoReplaceCharge.balance,
        available: true
      })
      var appliedVersion = Number((result && result.version) || (state.card && state.card.version) || 0)
      return saveOwnLayout(appliedVersion).then(function (saved) {
        toast(saved ? '照片和版式都已保存' : '照片已替换，版式没存上，可回编辑球员卡再调')
        setTimeout(function () { location.href = backUrl() }, 700)
      })
    }).catch(function (error) {
      state.ownBusy = false
      $('btn-own-apply').disabled = false
      ownNote((error && error.message) || '替换失败，请重试')
      toast((error && error.message) || '替换失败，请重试')
    })
  }

  function retryOwn() {
    if (state.ownBusy) return
    state.ownPreview = ''
    state.ownCut = ''
    state.crop = { zoom: 1, x: 0, y: 0 }
    state.cardBg = state.card ? state.card.backgroundId : ''
    $('own-preview').src = ''
    $('own-cut').src = ''
    show('own-badge', false)
    show('own-preview', false)
    show('own-empty', true)
    show('own-stage', false)
    show('own-confirm', false)
    show('own-actions', false)
    ownNote('')
    dropOwnTicket()
    setTimeout(function () { try { $('own-input').click() } catch (error) { /* 手动点框选一样 */ } }, 60)
  }

  function renderPoses() {
    var list = $('pose-list')
    list.innerHTML = ''
    POSES.forEach(function (item) {
      var button = document.createElement('button')
      button.type = 'button'
      button.className = 'pose-option' + (state.pose === item.key ? ' is-active' : '')
      button.innerHTML = '<strong>' + item.label + '</strong><small>' + item.desc + '</small>'
      button.addEventListener('click', function () {
        if (state.busy) return
        state.pose = item.key
        renderPoses()
      })
      list.appendChild(button)
    })
  }

  function renderPrice(info) {
    var price = (info && info.aiPortrait) || info || null
    if (!price) return
    state.price = price
    $('price-cost').textContent = String(price.cost)
    var balance = price.balance
    if (typeof balance === 'number' && balance >= 0) {
      $('balance-line').textContent = '蜂蜜余额 ' + balance + ' 滴' + (price.available ? '' : '，不足以支付本次 ' + price.cost + ' 滴')
      $('btn-generate').disabled = state.busy || !price.available
    } else {
      $('balance-line').textContent = price.reason === 'HONEY_ACCOUNT_NOT_OPEN'
        ? '蜂蜜账户未开通：请先在服务号「我的」完成注册后再来生成'
        : '蜂蜜余额暂时读取不到，请稍后重试'
    }
    $('price-line').hidden = false
    if (price.memberActive && Number(price.listCost) > Number(price.cost)) {
      $('price-line').innerHTML = '每次生成并保存进卡面消耗 <strong id="price-cost">' + price.cost + '</strong> 滴蜂蜜（会员价，原价 ' + price.listCost + ' 滴）。'
    } else if (Number(price.listCost) > Number(price.cost)) {
      $('price-line').innerHTML = '每次生成并保存进卡面消耗 <strong id="price-cost">' + price.cost + '</strong> 滴蜂蜜（原价 ' + price.listCost + ' 滴）。'
    }
  }

  function setBusy(busy, message) {
    state.busy = busy
    $('btn-generate').disabled = busy
    $('btn-generate').textContent = busy ? (message || '生成中…') : '生成 AI 形象照'
    $('btn-regenerate').disabled = busy
    $('btn-use').disabled = busy
    if (!busy) clearInterval(state.timer)
  }

  function startTimer() {
    var startedAt = Date.now()
    clearInterval(state.timer)
    state.timer = setInterval(function () {
      var seconds = Math.round((Date.now() - startedAt) / 1000)
      $('btn-generate').textContent = '正在生成…' + seconds + 's'
    }, 1000)
  }

  // 上传前统一转成白底 JPEG：避免透明底变黑，也让参考板里的脸保持够大。
  // 体积不再受网关限制：参考板走云存储上传（prepareReference），这里只控制画质。
  function compress(file, maxSide) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader()
      reader.onerror = function () { reject(new Error('照片读取失败，请重新选择')) }
      reader.onload = function () {
        var image = new Image()
        image.onerror = function () { reject(new Error('照片无法识别，请换一张')) }
        image.onload = function () {
          var max = maxSide || 1600
          var scale = Math.min(1, max / Math.max(image.width || 1, image.height || 1))
          var width = Math.max(1, Math.round((image.width || 1) * scale))
          var height = Math.max(1, Math.round((image.height || 1) * scale))
          var canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          var context = canvas.getContext('2d')
          context.fillStyle = '#ffffff'
          context.fillRect(0, 0, width, height)
          context.drawImage(image, 0, 0, width, height)
          var data = ''
          var quality = 0.92
          while (quality >= 0.6) {
            try { data = canvas.toDataURL('image/jpeg', quality) } catch (error) { data = '' }
            if (data && data.length <= 2200000) break
            quality -= 0.06
            data = ''
          }
          if (!data) { reject(new Error('照片处理后仍然过大，请换一张更小的照片')); return }
          var loaded = new Image()
          loaded.onerror = function () { reject(new Error('照片无法识别，请换一张')) }
          loaded.onload = function () { resolve({ data: data, image: loaded }) }
          loaded.src = data
        }
        image.src = String(reader.result || '')
      }
      reader.readAsDataURL(file)
    })
  }

  // ---------- 取景框：人物照 3:4 竖版、球衣 1:1，选完先拖到合适位置再用 ----------
  // 比例取自平台后台「AI 形象照」的竖版预览与姿势预设，不再用横版把人物拦腰截断。
  var FRAME_OUT_WIDTH = 1200
  var FRAME_BACKGROUND = '#ffffff'
  var FRAME_MAX_CHARS = 2200000

  function frameSize(frame) {
    var rect = null
    try { rect = frame.getBoundingClientRect ? frame.getBoundingClientRect() : null } catch (error) { rect = null }
    var width = (rect && rect.width) || frame.clientWidth || 300
    var height = (rect && rect.height) || frame.clientHeight || 400
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) }
  }

  function framerBase(view) {
    var size = frameSize(view.frame)
    var cover = Math.max(size.width / view.naturalW, size.height / view.naturalH)
    var contain = Math.min(size.width / view.naturalW, size.height / view.naturalH)
    // 人物照默认铺满取景框；球衣默认整件放进框里，用户再按需要放大。
    return { size: size, scale: view.options.fit === 'contain' ? contain : cover }
  }

  function layoutFramer(view) {
    var img = view.preview
    var editing = view.editing && view.naturalW > 0
    view.frame.className = view.frameBaseClass + (editing ? ' is-editing' : '')
    if (!editing) {
      img.style.position = ''
      img.style.left = ''
      img.style.top = ''
      img.style.width = ''
      img.style.height = ''
      img.style.maxWidth = ''
      img.style.objectFit = ''
      img.style.transform = ''
      return
    }
    var info = framerBase(view)
    var scale = info.scale * view.zoom
    var destW = view.naturalW * scale
    var destH = view.naturalH * scale
    // 图比框大：最多移到刚好露出整框；图比框小：限制在框内，避免把图拖出画框。
    var limitX = destW > info.size.width ? (destW - info.size.width) / 2 : (info.size.width - destW) / 2
    var limitY = destH > info.size.height ? (destH - info.size.height) / 2 : (info.size.height - destH) / 2
    view.dx = Math.max(-limitX, Math.min(limitX, view.dx))
    view.dy = Math.max(-limitY, Math.min(limitY, view.dy))
    img.style.position = 'absolute'
    img.style.left = '50%'
    img.style.top = '50%'
    img.style.width = view.naturalW + 'px'
    img.style.height = view.naturalH + 'px'
    img.style.maxWidth = 'none'
    img.style.objectFit = 'fill'
    img.style.transformOrigin = '50% 50%'
    img.style.transform = 'translate(-50%, -50%) translate(' + view.dx + 'px, ' + view.dy + 'px) scale(' + scale + ')'
  }

  // 按当前取景框导出：白底、指定宽度，不静默降成小图。
  function exportFramer(view) {
    var info = framerBase(view)
    var outW = view.options.outWidth || FRAME_OUT_WIDTH
    var outH = Math.round(outW * info.size.height / info.size.width)
    var factor = outW / info.size.width
    var canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    var context = canvas.getContext('2d')
    context.fillStyle = FRAME_BACKGROUND
    context.fillRect(0, 0, outW, outH)
    var scale = info.scale * view.zoom * factor
    var destW = view.naturalW * scale
    var destH = view.naturalH * scale
    var centerX = outW / 2 + view.dx * factor
    var centerY = outH / 2 + view.dy * factor
    context.drawImage(view.img, centerX - destW / 2, centerY - destH / 2, destW, destH)
    var data = ''
    var quality = 0.92
    while (quality >= 0.6) {
      try { data = canvas.toDataURL('image/jpeg', quality) } catch (error) { data = '' }
      if (data && data.length <= FRAME_MAX_CHARS) break
      quality -= 0.06
      data = ''
    }
    if (!data) throw new Error('照片处理后仍然过大，请换一张更小的照片')
    return data
  }

  function enterFramer(view) {
    if (!view.img) return
    view.editing = true
    if (view.options.bar) show(view.options.bar, true)
    if (view.options.badge) show(view.options.badge, true)
    if (view.options.confirm) {
      var confirm = $(view.options.confirm)
      confirm.textContent = view.options.confirmLabel || '调整好了'
      confirm.hidden = false
    }
    if (view.options.reset) $(view.options.reset).hidden = false
    layoutFramer(view)
  }

  function resetFramer(view) {
    view.zoom = 1
    view.dx = 0
    view.dy = 0
    layoutFramer(view)
  }

  // 确认后把取景框内的画面导出成一张竖版照片，后续上传/抠图都用这张，不再用原图。
  function confirmFramer(view) {
    if (view.busy || !view.img) return
    var data = ''
    try { data = exportFramer(view) } catch (error) {
      toast((error && error.message) || '照片处理失败，请换一张')
      return
    }
    view.editing = false
    view.result = data
    view.preview.src = data
    layoutFramer(view)
    if (view.options.badge) show(view.options.badge, false)
    if (view.options.reset) $(view.options.reset).hidden = true
    if (view.options.confirm) {
      var confirm = $(view.options.confirm)
      confirm.textContent = view.options.reopenLabel || '重新调整'
      confirm.hidden = false
    }
    if (view.options.bar) show(view.options.bar, true)
    if (typeof view.options.onDone === 'function') view.options.onDone(data, view)
  }

  function toggleFramer(view) {
    if (view.busy || !view.img) return
    if (view.editing) { confirmFramer(view); return }
    if (view.result) view.preview.src = view.sourceData
    enterFramer(view)
  }

  function pickFramer(view, file) {
    if (!file || view.busy) return
    view.busy = true
    var noteEl = view.options.note ? $(view.options.note) : null
    if (noteEl) noteEl.hidden = true
    view.result = ''
    compress(file, view.options.maxSide || 1800).then(function (photo) {
      view.sourceData = photo.data
      view.img = photo.image
      view.naturalW = Math.max(1, photo.image.naturalWidth || photo.image.width || 1)
      view.naturalH = Math.max(1, photo.image.naturalHeight || photo.image.height || 1)
      view.preview.src = photo.data
      show(view.options.preview, true)
      show(view.options.empty, false)
      view.zoom = 1
      view.dx = 0
      view.dy = 0
      view.busy = false
      enterFramer(view)
    }).catch(function (error) {
      view.busy = false
      if (noteEl) {
        noteEl.textContent = (error && error.message) || '照片处理失败，请重新选择'
        noteEl.hidden = false
      }
    })
  }

  // 单指拖动改位置，双指捏合缩放；全部本地完成，不发请求。
  function bindFramer(view) {
    var pointers = {}
    var ids = []
    var gesture = null

    function updatePoint(event) {
      var id = event.pointerId == null ? 0 : event.pointerId
      pointers[id] = { x: event.clientX || 0, y: event.clientY || 0 }
      if (ids.indexOf(id) < 0) ids.push(id)
      return id
    }
    function distance() {
      var first = pointers[ids[0]]
      var second = pointers[ids[1]]
      if (!first || !second) return 0
      var dx = first.x - second.x
      var dy = first.y - second.y
      return Math.sqrt(dx * dx + dy * dy)
    }
    function midpoint() {
      var first = pointers[ids[0]] || { x: 0, y: 0 }
      var second = pointers[ids[1]] || { x: 0, y: 0 }
      return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
    }
    function snapshot() {
      if (ids.length >= 2) {
        var middle = midpoint()
        gesture = { mode: 'pinch', dist: distance() || 1, midX: middle.x, midY: middle.y, zoom: view.zoom, dx: view.dx, dy: view.dy }
        return
      }
      if (ids.length === 1 && pointers[ids[0]]) {
        gesture = { mode: 'drag', x: pointers[ids[0]].x, y: pointers[ids[0]].y, dx: view.dx, dy: view.dy }
        return
      }
      gesture = null
    }
    function follow() {
      if (!gesture) return
      if (gesture.mode === 'pinch') {
        var middle = midpoint()
        var dist = distance() || 1
        view.zoom = Math.max(1, Math.min(4, gesture.zoom * (dist / gesture.dist)))
        view.dx = gesture.dx + (middle.x - gesture.midX)
        view.dy = gesture.dy + (middle.y - gesture.midY)
      } else {
        var point = pointers[ids[0]]
        if (!point) return
        view.dx = gesture.dx + (point.x - gesture.x)
        view.dy = gesture.dy + (point.y - gesture.y)
      }
      layoutFramer(view)
    }

    view.frame.addEventListener('pointerdown', function (event) {
      if (!view.editing) return
      if (event.preventDefault) event.preventDefault()
      var id = updatePoint(event)
      snapshot()
      if (view.frame.setPointerCapture) { try { view.frame.setPointerCapture(id) } catch (error) { /* ignore */ } }
    })
    view.frame.addEventListener('pointermove', function (event) {
      if (!view.editing || !gesture) return
      if (event.preventDefault) event.preventDefault()
      updatePoint(event)
      follow()
    })
    function release(event) {
      var id = event.pointerId == null ? 0 : event.pointerId
      delete pointers[id]
      var index = ids.indexOf(id)
      if (index >= 0) ids.splice(index, 1)
      snapshot()
    }
    view.frame.addEventListener('pointerup', release)
    view.frame.addEventListener('pointercancel', release)
  }

  function createFramer(options) {
    var view = {
      options: options,
      frame: $(options.frame),
      preview: $(options.preview),
      empty: $(options.empty),
      frameBaseClass: $(options.frame).className || 'upload',
      img: null,
      sourceData: '',
      result: '',
      naturalW: 0,
      naturalH: 0,
      zoom: 1,
      dx: 0,
      dy: 0,
      editing: false,
      busy: false
    }
    bindFramer(view)
    return view
  }

  // 上传自己的照片：不再先用取景框裁一遍，选完直接服务端抠图，再在卡面上微调版式。
  // 网页入口（webLoginApi）请求体只有 100KB，这里按体积收敛到 96K 字符以内，保证能过网关。
  var OWN_PHOTO_MAX_CHARS = 96000
  var OWN_PHOTO_SIDES = [800, 720, 640, 560]

  function encodeOwnPhoto(image, maxSide) {
    var scale = Math.min(1, maxSide / Math.max(image.width || 1, image.height || 1))
    var width = Math.max(1, Math.round((image.width || 1) * scale))
    var height = Math.max(1, Math.round((image.height || 1) * scale))
    var canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    var context = canvas.getContext('2d')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    var quality = 0.86
    while (quality >= 0.5) {
      var data = ''
      try { data = canvas.toDataURL('image/jpeg', quality) } catch (error) { data = '' }
      if (data && data.length <= OWN_PHOTO_MAX_CHARS) return data
      quality -= 0.06
    }
    return ''
  }

  function shrinkOwnPhoto(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader()
      reader.onerror = function () { reject(new Error('照片读取失败，请重新选择')) }
      reader.onload = function () {
        var image = new Image()
        image.onerror = function () { reject(new Error('照片无法识别，请换一张')) }
        image.onload = function () {
          for (var index = 0; index < OWN_PHOTO_SIDES.length; index += 1) {
            var data = encodeOwnPhoto(image, OWN_PHOTO_SIDES[index])
            if (data) { resolve(data); return }
          }
          reject(new Error('这张照片压缩后仍然过大，请换一张更小的照片'))
        }
        image.src = String(reader.result || '')
      }
      reader.readAsDataURL(file)
    })
  }

  function pickOwnPhoto(file) {
    if (!file || state.ownBusy) return
    show('own-badge', true)
    $('own-badge').textContent = '读取中…'
    shrinkOwnPhoto(file).then(function (dataUrl) {
      $('own-badge').textContent = '已读取'
      prepareOwnData(dataUrl)
    }).catch(function (error) {
      show('own-badge', false)
      ownNote((error && error.message) || '照片处理失败，请重新选择')
      toast((error && error.message) || '照片处理失败，请重新选择')
    })
  }

  var photoFramer = createFramer({
    frame: 'photo-frame', preview: 'photo-preview', empty: 'photo-empty',
    bar: 'photo-edit', badge: 'photo-badge', confirm: 'btn-photo-confirm', reset: 'btn-photo-reset',
    note: 'photo-note', maxSide: 1800,
    onDone: function (dataUrl, view) {
      state.photo = dataUrl
      state.photoImg = view.img
      state.photoReady = loadImage(dataUrl, function (image) { state.photoImg = image })
    }
  })

  var jerseyFramer = createFramer({
    frame: 'jersey-frame', preview: 'jersey-preview', empty: 'jersey-empty',
    bar: 'jersey-edit', badge: 'jersey-badge', confirm: 'btn-jersey-confirm', reset: 'btn-jersey-reset',
    note: 'jersey-note', maxSide: 1600, outWidth: 1000, fit: 'contain',
    onDone: function (dataUrl, view) {
      state.jersey = dataUrl
      state.jerseyImg = view.img
      state.jerseyReady = loadImage(dataUrl, function (image) { state.jerseyImg = image })
    }
  })

  // 参考板用裁剪后的图：等图片解码完再拼，避免拿还没加载完的图空白出图。
  function loadImage(dataUrl, apply) {
    return new Promise(function (resolve) {
      var image = new Image()
      image.onload = function () { apply(image); resolve(image) }
      image.onerror = function () { resolve(null) }
      image.src = dataUrl
    })
  }

  function clearFramer(view) {
    view.img = null
    view.sourceData = ''
    view.result = ''
    view.naturalW = 0
    view.naturalH = 0
    view.zoom = 1
    view.dx = 0
    view.dy = 0
    view.editing = false
    layoutFramer(view)
    if (view.options.bar) show(view.options.bar, false)
    if (view.options.badge) show(view.options.badge, false)
    if (view.options.reset) $(view.options.reset).hidden = true
  }

  function pickPhoto(file) {
    pickFramer(photoFramer, file)
  }

  function pickJersey(file) {
    pickFramer(jerseyFramer, file)
  }


  // 参考板：纯白底，左边人脸铺满高度（占宽 62%），右边球衣整张等比放进 34% 的方块。
  function drawSheet(size) {
    var canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    var context = canvas.getContext('2d')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, size, size)
    var faceW = Math.round(size * 0.62)
    var image = state.photoImg
    if (image && image.naturalWidth && image.naturalHeight) {
      var scale = Math.max(faceW / image.naturalWidth, size / image.naturalHeight)
      var width = image.naturalWidth * scale
      var height = image.naturalHeight * scale
      context.save()
      context.beginPath()
      context.rect(0, 0, faceW, size)
      context.clip()
      context.drawImage(image, (faceW - width) / 2, (size - height) / 2, width, height)
      context.restore()
    }
    var jersey = state.jerseyImg
    if (jersey && jersey.naturalWidth && jersey.naturalHeight) {
      var boxW = Math.round(size * 0.34)
      var boxX = size - boxW - Math.round(size * 0.02)
      var boxY = Math.round(size * 0.18)
      var jerseyScale = Math.min(boxW / jersey.naturalWidth, boxW / jersey.naturalHeight)
      var jw = jersey.naturalWidth * jerseyScale
      var jh = jersey.naturalHeight * jerseyScale
      context.drawImage(jersey, boxX + (boxW - jw) / 2, boxY + (boxW - jh) / 2, jw, jh)
    }
    return canvas
  }

  // 逐级降尺寸/画质，直到 base64 长度在云存储 3MB 上限以内，不静默交白底小图。
  function encodeSheet() {
    var index = 0
    while (index < SHEET_STEPS.length) {
      var canvas = drawSheet(SHEET_STEPS[index][0])
      var data = canvas.toDataURL('image/jpeg', SHEET_STEPS[index][1])
      if (data.length <= SHEET_MAX_CHARS) return data
      index += 1
    }
    throw new Error('参考图体积过大，请换一张更小的照片后重试')
  }

  function sheetBytes(dataUrl) {
    var prefix = 'data:image/jpeg;base64,'
    var base64 = dataUrl.indexOf(prefix) === 0 ? dataUrl.slice(prefix.length) : ''
    return Math.round(base64.length * 0.75)
  }

  // 参考板先上传云存储换一张一次性凭证，再把凭证号交给生图接口：
  // 这样请求体只有几十字节，不受 HTTP 网关体积限制，画质也不会被压成小图。
  function uploadReference(dataUrl) {
    var bytes = sheetBytes(dataUrl)
    return postAi({ action: 'cardPortraitPrepareReference', cardTicket: state.ticket, bytes: bytes }).then(function (result) {
      var info = (result && result.data) || {}
      if (!info.url || !info.ticket) throw new Error('参考图上传准备失败，请重试')
      return fetch(info.url, { method: 'PUT', headers: info.headers || {}, body: convertBlob(dataUrl) }).then(function (response) {
        if (!response || !response.ok) throw new Error('参考图上传失败，请检查网络后重试')
        state.referenceTicket = text(info.ticket)
        return state.referenceTicket
      })
    })
  }

  function convertBlob(dataUrl) {
    var parts = String(dataUrl || '').split(',')
    var meta = parts[0] || ''
    var base64 = parts[1] || ''
    var mime = (meta.match(/data:([^;]+)/) || [])[1] || 'image/jpeg'
    var binary = atob(base64)
    var length = binary.length
    var bytes = new Uint8Array(length)
    for (var i = 0; i < length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: mime })
  }

  function dropReference() {
    if (!state.referenceTicket || !state.ticket) return Promise.resolve(null)
    var payload = { action: 'cardPortraitCancelReference', cardTicket: state.ticket, ticket: state.referenceTicket }
    state.referenceTicket = ''
    return postAi(payload).catch(function () { return null })
  }

  function postAi(payload) {
    return fetch(AI_HTTP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (response) {
      return response.json().catch(function () { return { success: false, error: '生图服务返回异常，请稍后重试' } })
    }).then(function (result) {
      if (!result || result.success !== true) {
        var error = new Error((result && result.error) || '生成失败，请稍后重试')
        error.code = (result && result.code) || ''
        throw error
      }
      return result
    })
  }

  function refund(reason) {
    if (!state.requestId || state.applied) return Promise.resolve(null)
    var requestId = state.requestId
    // 退款后本次请求编号作废：再次生成要拿新的请求编号，避免同一 refId 上「已扣费 + 已退回」两种流水打架。
    state.requestId = ''
    state.ticket = ''
    forgetRequestId()
    return Api.cancelAiPortrait({ playerId: state.playerId, requestId: requestId }).catch(function () { return null })
  }

  function generate() {
    if (state.busy) return
    if (!state.photo) { toast('请先上传一张你自己的单人照片'); return }
    if (!state.jersey) { toast('请再上传一张球衣照片'); return }
    if (state.price && state.price.available === false) { toast('蜂蜜不足，暂时不能生成'); return }
    // 等取景框导出的照片解码完成再拼参考板，避免用还没加载好的图出空白。
    Promise.all([state.photoReady || Promise.resolve(), state.jerseyReady || Promise.resolve()]).then(function () {
      if (!state.photoImg || !state.jerseyImg) { toast('照片还没处理好，请稍等再点生成'); return }
      runGenerate()
    })
  }

  function runGenerate() {
    setBusy(true, '正在准备…')
    note('')
    startGenAnim()
    var requestId = state.requestId || rememberedRequestId() || newRequestId()
    state.requestId = requestId
    rememberRequestId(requestId)
    Api.prepareAiPortrait({ playerId: state.playerId, requestId: requestId }).then(function (result) {
      state.ticket = text(result.generationTicket)
      if (!state.ticket) throw new Error('生图凭证签发失败，请重试')
      renderPrice(result.aiPortrait)
      startTimer()
      // 1) 单人照 + 球衣照拼参考板 2) 上传参考板换一次性凭证 3) 用凭证出图。
      setBusy(true, '正在上传参考图…')
      return uploadReference(encodeSheet()).then(function (referenceTicket) {
        var payload = {
          action: 'cardPortraitGenerate',
          cardTicket: state.ticket,
          pose: state.pose,
          referenceTicket: referenceTicket,
          jerseyRef: true,
          transparentOutput: true,
          preserveOriginal: true
        }
        return postAi(payload)
      })
    }).then(function (result) {
      var data = (result && result.data) || {}
      if (!data.image) throw new Error('没有拿到成片，请重新生成')
      state.result = data.image
      state.resultId = text(data.generatedPortraitId)
      $('result-image').src = data.image
      show('result-stage', true)
      show('result-actions', true)
      stopGenAnim()
      setBusy(false)
      $('btn-generate').hidden = true
      note('生成完成，确认满意就点「使用这张形象照」。')
    }).catch(function (error) {
      stopGenAnim()
      setBusy(false)
      $('btn-generate').hidden = false
      note((error && error.message) || '生成失败，请稍后重试')
      toast((error && error.message) || '生成失败，请稍后重试')
      // 生成没有拿到成片：参考图凭证作废，本次扣费原路退回，避免用户为失败付费。
      dropReference()
      if (!state.result) refund()
    })
  }

  function useResult() {
    if (state.busy || !state.result) return
    if (!state.resultId) { toast('这张成片缺少编号，请重新生成'); return }
    setBusy(true, '正在写入卡面…')
    note('')
    Api.applyAiPortrait({
      playerId: state.playerId,
      requestId: state.requestId,
      cardTicket: state.ticket,
      generatedPortraitId: state.resultId
    }).then(function () {
      state.applied = true
      forgetRequestId()
      setBusy(false)
      toast('形象照已用到卡面')
      setTimeout(function () { location.href = backUrl() }, 700)
    }).catch(function (error) {
      setBusy(false)
      note((error && error.message) || '写入卡面失败，请重试')
      toast((error && error.message) || '写入卡面失败，请重试')
    })
  }

  function leave() {
    stopGenAnim()
    var done = function () { location.href = backUrl() }
    // 上传自己的照片：没确认过的抠图凭证作废，临时文件由服务端清理，不产生扣费。
    dropOwnTicket()
    if (state.applied || !state.requestId) { done(); return }
    dropReference()
    refund().then(done, done)
  }

  // 「重新生成」按新的一次生成计费：换新请求编号、重新签凭证，不复用上一次已扣费的那次。
  function regenerate() {
    if (state.busy) return
    state.result = ''
    state.resultId = ''
    state.requestId = ''
    state.ticket = ''
    forgetRequestId()
    dropReference()
    show('result-stage', false)
    show('result-actions', false)
    $('btn-generate').hidden = false
    note('')
    generate()
  }

  function bind() {
    $('own-input').addEventListener('change', function (event) {
      var file = event.target.files && event.target.files[0]
      // 清空 value，允许连续选同一张照片时仍触发 change。
      try { event.target.value = '' } catch (error) { /* ignore */ }
      pickOwnPhoto(file)
    })
    $('own-preview').addEventListener('click', function () { $('own-input').click() })
    $('own-empty').addEventListener('click', function () { $('own-input').click() })
    $('btn-own-retry').addEventListener('click', retryOwn)
    $('btn-own-apply').addEventListener('click', applyOwn)
    bindOwnStage()
    $('photo-input').addEventListener('change', function (event) {
      var file = event.target.files && event.target.files[0]
      // 清空 value，允许连续选同一张照片时仍触发 change。
      try { event.target.value = '' } catch (error) { /* ignore */ }
      pickPhoto(file)
    })
    $('btn-photo-confirm').addEventListener('click', function () { toggleFramer(photoFramer) })
    $('btn-photo-reset').addEventListener('click', function () { resetFramer(photoFramer) })
    $('photo-preview').addEventListener('click', function () {
      if (photoFramer.editing) return
      $('photo-input').click()
    })
    $('photo-empty').addEventListener('click', function () { $('photo-input').click() })
    $('jersey-input').addEventListener('change', function (event) {
      var file = event.target.files && event.target.files[0]
      try { event.target.value = '' } catch (error) { /* ignore */ }
      pickJersey(file)
    })
    $('btn-jersey-confirm').addEventListener('click', function () { toggleFramer(jerseyFramer) })
    $('btn-jersey-reset').addEventListener('click', function () { resetFramer(jerseyFramer) })
    $('jersey-preview').addEventListener('click', function () {
      if (jerseyFramer.editing) return
      $('jersey-input').click()
    })
    $('jersey-empty').addEventListener('click', function () { $('jersey-input').click() })
    $('btn-generate').addEventListener('click', generate)
    $('btn-regenerate').addEventListener('click', regenerate)
    $('btn-use').addEventListener('click', useResult)
    $('btn-back').addEventListener('click', leave)
    $('btn-back-link').addEventListener('click', function (event) {
      event.preventDefault()
      leave()
    })
    $('btn-retry').addEventListener('click', function () { init() })
  }

  function showError(message) {
    show('state-loading', false)
    show('content', false)
    show('state-error', true)
    $('error-text').textContent = text(message) || '请稍后重试'
  }

  var ownPickerTried = false

  // 选了「上传自己的照片」就直接拉起相册/拍照，不用先在空白框上再点一次。
  // 进页本身来自一次点击，这里紧跟其后调用一般能通过；被浏览器拦下时点取景框一样能选。
  function autoOpenOwnPicker() {
    if (ownPickerTried) return
    ownPickerTried = true
    setTimeout(function () {
      if (state.ownCut) return
      try { $('own-input').click() } catch (error) { /* 被拦下就走手动点选 */ }
    }, 80)
  }

  function init() {
    show('state-error', false)
    show('content', false)
    show('state-loading', true)
    var playerId = state.playerId || playerIdFromQuery() || pendingPlayerId()
    state.playerId = playerId
    // 从编辑页「更换照片」进来时按传入的方式打开（upload / ai），本页只跑一种流程。
    state.mode = modeFromQuery()
    if (!playerId) { showError('缺少球员信息，请从卡库重新进入'); return }
    rememberPlayerId(playerId)
    $('btn-back-link').href = backUrl()
    // 一次请求同时拿到球员名/球队与价格余额：cardAiPortraitInfo 已做归属校验，
    // 不再额外拉 5MB 的 getMyPlayerCard 形象照大图。
    Api.ensureSession().then(function () {
      return Api.aiPortraitInfo({ playerId: playerId })
    }).then(function (result) {
      state.name = text(result.playerName)
      state.teamName = text(result.teamName)
      $('player-name').textContent = state.name || '球员'
      $('player-team').textContent = state.teamName || '—'
      show('state-loading', false)
      show('content', true)
      setMode(state.mode)
      if (state.mode === 'upload') autoOpenOwnPicker()
      renderPrice(result)
      // 换照片价格来自服务端既有的「换照片」规则，页面只展示，不自己算门槛。
      Api.cardPhotoInfo({ playerId: playerId }).then(function (info) {
        renderPhotoReplace(info && info.photoReplace)
      }).catch(function () {
        $('own-price-line').textContent = '换照片价格暂时读取不到，重新进入本页再试。'
      })
    }).catch(function (error) {
      var code = (error && error.code) || ''
      if (code === 'CARD_AI_PORTRAIT_AUTH_REQUIRED' || code === 'PLAYER_CARD_AUTH_REQUIRED') {
        showError('请先完成微信授权与手机号绑定后再生成形象照')
        return
      }
      if (code === 'PLAYER_CARD_FORBIDDEN') { showError('只能生成本人或已绑定孩子的球员形象照'); return }
      showError((error && error.message) || '读取球员失败，请稍后重试')
    })
  }

  bind()
  renderPoses()
  init()
})()
