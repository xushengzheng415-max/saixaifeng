(function () {
  'use strict'
  // 服务号 H5 · 球员卡「AI 形象照」页：
  // 流程只有两步上传——① 本人单人照 ② 球衣照片——再把两张拼成一张参考板，
  // 上传参考板后出透明形象照，点「使用这张」直接写进球员卡面。
  // 扣费、凭证、入库都在服务端（cardAiPortraitPrepare / cardAiPortraitApply），本页不决定金额。
  var Api = window.CardWorldApi
  var AI_HTTP = 'https://www.sxffootball.cn/aiPortraitDemo'
  var PENDING_KEY = 'sxf_card_ai_portrait_player'
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
    pose: 'front',
    photo: '',
    photoImg: null,
    jersey: '',
    jerseyImg: null,
    photoBusy: false,
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

  function pickPhoto(file) {
    if (!file) return
    state.photoBusy = true
    $('photo-note').hidden = true
    compress(file, 1600).then(function (photo) {
      state.photo = photo.data
      state.photoImg = photo.image
      $('photo-preview').src = photo.data
      show('photo-preview', true)
      show('photo-empty', false)
      state.photoBusy = false
    }).catch(function (error) {
      state.photoBusy = false
      $('photo-note').textContent = (error && error.message) || '照片处理失败，请重新选择'
      $('photo-note').hidden = false
    })
  }

  function pickJersey(file) {
    if (!file) return
    $('jersey-note').hidden = true
    compress(file, 1200).then(function (jersey) {
      state.jersey = jersey.data
      state.jerseyImg = jersey.image
      $('jersey-preview').src = jersey.data
      show('jersey-preview', true)
      show('jersey-empty', false)
    }).catch(function (error) {
      $('jersey-note').textContent = (error && error.message) || '球衣照片处理失败，请重新选择'
      $('jersey-note').hidden = false
    })
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
    if (!state.photo || !state.photoImg) { toast('请先上传一张你自己的单人照片'); return }
    if (!state.jerseyImg) { toast('请再上传一张球衣照片'); return }
    if (state.price && state.price.available === false) { toast('蜂蜜不足，暂时不能生成'); return }
    setBusy(true, '正在准备…')
    note('')
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
      setBusy(false)
      $('btn-generate').hidden = true
      note('生成完成，确认满意就点「使用这张形象照」。')
    }).catch(function (error) {
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
    var done = function () { location.href = backUrl() }
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
    $('photo-input').addEventListener('change', function (event) {
      var file = event.target.files && event.target.files[0]
      // 清空 value，允许连续选同一张照片时仍触发 change。
      try { event.target.value = '' } catch (error) { /* ignore */ }
      pickPhoto(file)
    })
    $('photo-preview').addEventListener('click', function () { $('photo-input').click() })
    $('photo-empty').addEventListener('click', function () { $('photo-input').click() })
    $('jersey-input').addEventListener('change', function (event) {
      var file = event.target.files && event.target.files[0]
      try { event.target.value = '' } catch (error) { /* ignore */ }
      pickJersey(file)
    })
    $('jersey-preview').addEventListener('click', function () { $('jersey-input').click() })
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

  function init() {
    show('state-error', false)
    show('content', false)
    show('state-loading', true)
    var playerId = state.playerId || playerIdFromQuery() || pendingPlayerId()
    state.playerId = playerId
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
      $('portrait-sub').textContent = (state.name || '球员') + ' · 上传单人照和球衣直接生成'
      show('state-loading', false)
      show('content', true)
      renderPrice(result)
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
