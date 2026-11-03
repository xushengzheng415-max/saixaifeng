(function () {
  'use strict'
  // 服务号 H5 · 球员卡「AI 定妆照」页：
  // 本页只做一件事——上传参考照片、选姿势、生成透明形象照，点「使用这张」直接写进球员卡面。
  // 扣费、凭证、入库都在服务端（cardAiPortraitPrepare / cardAiPortraitApply），本页不决定金额。
  var Api = window.CardWorldApi
  var AI_HTTP = 'https://www.sxffootball.cn/aiPortraitDemo'
  var PENDING_KEY = 'sxf_card_ai_portrait_player'
  var POSES = [
    { key: 'front', label: '正面抱膀', desc: '身体正对镜头' },
    { key: 'side', label: '半侧抱膀', desc: '三分之二侧身' },
    { key: 'low', label: '低位抱膀', desc: '双手交叠在下腹' }
  ]
  var COLORS = [
    { value: '', label: '原照片' },
    { value: '#ffffff', label: '白色' },
    { value: '#d92f2f', label: '红色' },
    { value: '#1b4fb3', label: '蓝色' },
    { value: '#1f8b4c', label: '绿色' },
    { value: '#111111', label: '黑色' },
    { value: '#f2c200', label: '黄色' }
  ]

  var state = {
    playerId: '',
    name: '',
    teamName: '',
    pose: 'front',
    color: '',
    photo: '',
    photoBusy: false,
    price: null,
    busy: false,
    requestId: '',
    ticket: '',
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

  function renderColors() {
    var list = $('color-list')
    list.innerHTML = ''
    COLORS.forEach(function (item) {
      var button = document.createElement('button')
      button.type = 'button'
      button.className = 'color-option' + (state.color === item.value ? ' is-active' : '')
      button.innerHTML = (item.value
        ? '<i class="color-dot" style="background:' + item.value + '"></i>'
        : '<i class="color-dot color-dot--none">—</i>') + '<span>' + item.label + '</span>'
      button.addEventListener('click', function () {
        if (state.busy) return
        state.color = item.value
        renderColors()
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
    $('btn-generate').textContent = busy ? (message || '生成中…') : '生成 AI 定妆照'
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

  // 参考照片统一缩成 1024 以内的白底 JPEG：既避免透明底变黑，也保证请求体不被网关截断。
  function compress(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader()
      reader.onerror = function () { reject(new Error('照片读取失败，请重新选择')) }
      reader.onload = function () {
        var image = new Image()
        image.onerror = function () { reject(new Error('照片无法识别，请换一张')) }
        image.onload = function () {
          var max = 1024
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
          var quality = 0.86
          var data = canvas.toDataURL('image/jpeg', quality)
          while (data.length > 1100000 && quality > 0.5) {
            quality -= 0.08
            data = canvas.toDataURL('image/jpeg', quality)
          }
          if (data.length > 1150000) { reject(new Error('照片处理后仍然过大，请换一张更小的照片')); return }
          resolve(data)
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
    compress(file).then(function (data) {
      state.photo = data
      $('photo-preview').src = data
      show('photo-preview', true)
      show('photo-empty', false)
      state.photoBusy = false
    }).catch(function (error) {
      state.photoBusy = false
      $('photo-note').textContent = (error && error.message) || '照片处理失败，请重新选择'
      $('photo-note').hidden = false
    })
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
    if (!state.photo) { toast('请先选择一张参考照片'); return }
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
      var payload = {
        action: 'cardPortraitGenerate',
        cardTicket: state.ticket,
        pose: state.pose,
        photo: state.photo,
        transparentOutput: true,
        preserveOriginal: true
      }
      if (state.color) { payload.jerseyColor = state.color; payload.jerseyPreset = true }
      return postAi(payload)
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
      // 生成没有拿到成片：本次扣费原路退回，避免用户为失败付费。
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
    Api.ensureSession().then(function () {
      return Api.getCard(playerId)
    }).then(function (result) {
      var player = (result && result.player) || {}
      state.name = text(player.name)
      state.teamName = text(player.teamName)
      $('player-name').textContent = state.name || '球员'
      $('player-team').textContent = state.teamName || '—'
      $('portrait-sub').textContent = (state.name || '球员') + ' · 上传照片直接生成'
      show('state-loading', false)
      show('content', true)
      return Api.aiPortraitInfo({ playerId: playerId }).then(renderPrice).catch(function (error) {
        $('balance-line').textContent = (error && error.message) || '蜂蜜余额暂时读取不到'
      })
    }).catch(function (error) {
      var code = (error && error.code) || ''
      if (code === 'CARD_AI_PORTRAIT_AUTH_REQUIRED' || code === 'PLAYER_CARD_AUTH_REQUIRED') {
        showError('请先完成微信授权与手机号绑定后再生成定妆照')
        return
      }
      if (code === 'PLAYER_CARD_FORBIDDEN') { showError('只能生成本人或已绑定孩子的球员形象照'); return }
      showError((error && error.message) || '读取球员失败，请稍后重试')
    })
  }

  bind()
  renderPoses()
  renderColors()
  init()
})()
