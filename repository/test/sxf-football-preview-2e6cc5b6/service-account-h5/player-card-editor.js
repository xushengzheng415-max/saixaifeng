(function (root) {
  'use strict'
  var W = 900, H = 1290, PHOTO_X = 54, PHOTO_Y = 30, PHOTO_W = 792, PHOTO_H = 900
  var TIER_NAMES = { bronze: '铜卡', silver: '银卡', gold: '金卡' }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)) }
  function placement(width, height, mode, crop) {
    var base = Math.min(PHOTO_W / width, PHOTO_H / height)
    var zoom = clamp(crop.zoom || 1, 1, 4), dw = width * base * zoom, dh = height * base * zoom
    var maxX = Math.max(0, (dw + PHOTO_W) / 2 - 100), maxY = Math.max(0, (dh + PHOTO_H) / 2 - 120)
    var x = clamp(crop.x, -maxX / PHOTO_W, maxX / PHOTO_W), y = clamp(crop.y, -maxY / PHOTO_H, maxY / PHOTO_H)
    return { left: PHOTO_X + (PHOTO_W - dw) / 2 + x * PHOTO_W, top: PHOTO_Y + (PHOTO_H - dh) / 2 + y * PHOTO_H, width: dw, height: dh, crop: { zoom: zoom, x: x, y: y } }
  }
  function textLayout(input) { return { scale: clamp(input && input.scale || 1, .7, 1.6), x: clamp(input && input.x, -180, 180), y: clamp(input && input.y, -140, 140) } }
  function jerseyNameFor(player) {
    if (player.jerseyName) return String(player.jerseyName)
    var name = String(player.name || player.playerName || '')
    if (name.length < 2) return name.toUpperCase()
    var map = { 郑:'ZHENG', 旭:'XU', 升:'SHENG', 李:'LI', 王:'WANG', 张:'ZHANG', 刘:'LIU', 陈:'CHEN', 杨:'YANG', 赵:'ZHAO', 黄:'HUANG', 周:'ZHOU', 吴:'WU', 徐:'XU', 孙:'SUN', 马:'MA', 朱:'ZHU', 胡:'HU', 郭:'GUO', 林:'LIN', 何:'HE', 高:'GAO', 罗:'LUO' }
    return ((map[name[0]] || name[0]) + '.' + Array.from(name.slice(1, 3)).map(function (char) { return (map[char] || char)[0] }).join('')).slice(0, 10)
  }
  function html(value) { return String(value || '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] }) }
  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var image = new Image(), timer = setTimeout(function () { reject(new Error('形象照读取超时，请重新打开')) }, 15000)
      image.onload = function () { clearTimeout(timer); if (!image.naturalWidth || !image.naturalHeight) return reject(new Error('形象照无法读取')); resolve(image) }
      image.onerror = function () { clearTimeout(timer); reject(new Error('形象照无法读取，请重新打开')) }
      image.src = src
    })
  }
  function draw(canvas, image, mode, crop, player, template, layout, teamLogo) {
    layout = layout || {}; var ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#e8ece9'; ctx.fillRect(0, 0, W, H)
    if (template) ctx.drawImage(template, 0, 0, W, H)
    if (image) {
      var box = placement(image.naturalWidth, image.naturalHeight, 'portrait', crop || {})
      ctx.save(); ctx.beginPath(); ctx.rect(PHOTO_X, PHOTO_Y, PHOTO_W, PHOTO_H); ctx.clip(); ctx.drawImage(image, box.left, box.top, box.width, box.height); ctx.restore()
    }
    // 复绘原版卡面腰封：金属底图在后，人物在中间，腰封和字段始终在前。
    if (image && template) {
      ctx.save(); ctx.beginPath(); ctx.moveTo(0, 830); ctx.quadraticCurveTo(W / 2, 690, W, 830)
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.clip(); ctx.drawImage(template, 0, 0, W, H); ctx.restore()
    }
    ctx.textAlign = 'center'; ctx.fillStyle = '#1e241f'
    var number = textLayout(layout.number), nameStyle = textLayout(layout.name)
    if (player.jerseyNumber) { ctx.font = '900 ' + Math.round(156 * number.scale) + 'px sans-serif'; ctx.fillText(String(player.jerseyNumber), 132 + number.x, 340 + number.y) }
    ctx.font = '700 72px sans-serif'; ctx.fillText(String(({ GK:'守门员', DF:'后卫', MF:'中场', FW:'前锋' })[player.position] || player.position || ''), 132, 420)
    ctx.fillStyle = '#1d241e'; ctx.font = '800 ' + Math.round(96 * nameStyle.scale) + 'px sans-serif'
    var name = String(player.name || player.playerName || '球员')
    while (ctx.measureText(name).width > 690 && name.length > 1) name = name.slice(0, -2) + '…'
    ctx.fillText(name, W / 2 + nameStyle.x, 980 + nameStyle.y)
    ctx.fillStyle = '#30312b'; ctx.font = '600 48px sans-serif'; ctx.fillText(jerseyNameFor(player), W / 2, 1042)
    ctx.font = '600 42px sans-serif'
    ctx.fillText('身高 ' + (player.height == null || player.height === '' ? '—' : String(player.height) + 'cm'), 295, 1115)
    ctx.fillText('体重 ' + (player.weight == null || player.weight === '' ? '—' : String(player.weight) + 'kg'), 605, 1115)
    if (String(player.nationality || '') === '中国') {
      ctx.fillStyle = '#d72e23'; ctx.fillRect(333, 1150, 84, 60)
      ctx.fillStyle = '#f6dc42'
      function star(cx, cy, radius) { ctx.beginPath(); for (var i = 0; i < 5; i++) { var angle = i * Math.PI * 4 / 5 - Math.PI / 2, x = cx + Math.cos(angle) * radius, y = cy + Math.sin(angle) * radius; if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y) } ctx.closePath(); ctx.fill() }
      star(352, 1170, 15); [[378,1164],[387,1174],[385,1186],[375,1198]].forEach(function (point) { star(point[0], point[1], 5) })
    } else if (player.nationality) { ctx.fillStyle = '#29382d'; ctx.font = '600 30px sans-serif'; ctx.fillText(String(player.nationality), 375, 1184) }
    if (teamLogo) ctx.drawImage(teamLogo, 495, 1125, 120, 120)
  }
  function open(options) {
    options = options || {}
    var player = options.player || {}, draft = options.draft || {}, tier = TIER_NAMES[player.cardTier] ? player.cardTier : null
    var cardScore = player.playerCard || {}, canChangeBackground = cardScore.canChangeBackground === true
    var backgroundId = canChangeBackground && TIER_NAMES[player.backgroundId] ? player.backgroundId : tier
    var image = null, template = null, teamLogo = null, baseCrop = Object.assign({ zoom: 1, x: 0, y: 0 }, draft.crop || options.initialCrop || {}), crop = Object.assign({}, baseCrop)
    var layout = { name: textLayout(draft.layout && draft.layout.name), number: textLayout(draft.layout && draft.layout.number) }
    var subject = 'portrait', pointers = new Map(), gesture = null, busy = false, closed = false
    var returnFocus = document.activeElement, previousOverflow = document.body.style.overflow
    var overlay = document.createElement('div'); overlay.className = 'pc-editor'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', '编辑球员卡')
    overlay.innerHTML = '<section class="pc-sheet"><header class="pc-header"><button data-pc="close" type="button" aria-label="返回">‹</button><h1>编辑球员卡</h1><span>' + html(player.name || player.playerName) + '</span></header><main class="pc-main"><div class="pc-grade"><b>' + html(tier ? TIER_NAMES[tier] : '等级待核定') + '</b><span>' + html(cardScore.status === 'ready' ? cardScore.points + ' 分 · ' + (cardScore.nextAt == null ? '已达金卡' : '距下一级 ' + cardScore.pointsToNext + ' 分') : '生涯积分待核定') + '</span></div><div class="pc-adjust" role="group" aria-label="调整对象"><button type="button" data-pc="portrait">人物</button><button type="button" data-pc="name">姓名</button><button type="button" data-pc="number">号码</button></div><div class="pc-workspace"><div class="pc-preview"><canvas data-pc="canvas" width="900" height="1290" aria-label="' + html(tier ? TIER_NAMES[tier] : '球员') + '球员卡实时预览"></canvas></div><div class="pc-controls"><p class="pc-hint">选择对象后拖动、缩放</p><p class="pc-photo-source">使用登记时拍摄的标准形象照</p><label class="pc-background-label">卡片背景 <select data-pc="background" ' + (canChangeBackground ? '' : 'disabled') + '><option value="bronze">铜色</option><option value="silver">银色</option><option value="gold">金色</option></select></label><div class="pc-zoom"><button data-pc="minus" type="button" aria-label="缩小所选对象">−</button><input data-pc="zoom" type="range" min="70" max="160" value="100" aria-label="所选对象大小"><button data-pc="plus" type="button" aria-label="放大所选对象">＋</button><output data-pc="percent">100%</output></div><div class="pc-secondary"><button data-pc="reset" type="button">恢复位置</button><button data-pc="export" type="button">查看成卡</button></div><p class="pc-status" data-pc="status" role="status" aria-live="polite">正在读取形象照…</p><p class="pc-boundary">等级由正式生涯积分确定。</p></div></div></main><footer class="pc-footer"><button data-pc="save" type="button" disabled>' + html(options.saveText || '保存球员卡') + '</button></footer></section>'
    document.body.appendChild(overlay); document.body.style.overflow = 'hidden'
    var $ = function (key) { return overlay.querySelector('[data-pc="' + key + '"]') }, canvas = $('canvas')
    $('background').value = backgroundId || 'bronze'
    function status(text, error) { $('status').textContent = text; $('status').classList.toggle('is-error', Boolean(error)) }
    function selected() { return subject === 'portrait' ? crop : layout[subject] }
    function render() {
      if (image) crop = placement(image.naturalWidth, image.naturalHeight, 'portrait', crop).crop
      draw(canvas, image, 'portrait', crop, player, template, layout, teamLogo)
      ;['portrait', 'name', 'number'].forEach(function (key) { $(key).setAttribute('aria-pressed', String(subject === key)) })
      $('zoom').min = subject === 'portrait' ? '100' : '70'; $('zoom').max = subject === 'portrait' ? '400' : '160'
      $('zoom').value = String(Math.round((subject === 'portrait' ? crop.zoom : layout[subject].scale) * 100)); $('percent').textContent = $('zoom').value + '%'
      ;['save', 'export', 'minus', 'plus', 'zoom', 'reset'].forEach(function (key) { $(key).disabled = busy || !image || !template || !tier })
      $('number').disabled = !player.jerseyNumber
    }
    function close() { if (busy) return; closed = true; document.body.style.overflow = previousOverflow; overlay.remove(); document.removeEventListener('keydown', onKey); if (returnFocus && returnFocus.focus) returnFocus.focus() }
    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); close() }
      if (event.key === 'Tab') {
        var nodes = Array.prototype.slice.call(overlay.querySelectorAll('button:not(:disabled),input:not(:disabled)')), first = nodes[0], last = nodes[nodes.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey); $('close').onclick = close; $('close').focus()
    $('background').onchange = function () {
      if (!canChangeBackground) return
      var requested = $('background').value
      loadImage('./assets/player-cards/' + requested + '-card.png').then(function (value) { if (!closed) { backgroundId = requested; template = value; render() } }).catch(function () { $('background').value = backgroundId; status('背景读取失败，请重试', true) })
    }
    ;['portrait', 'name', 'number'].forEach(function (key) { $(key).onclick = function () { subject = key; pointers.clear(); gesture = null; render() } })
    function zoom(value) { if (busy || !image) return; if (subject === 'portrait') { var oldTop = placement(image.naturalWidth, image.naturalHeight, 'portrait', crop).top; crop.zoom = clamp(value, 1, 4); crop.y += (oldTop - placement(image.naturalWidth, image.naturalHeight, 'portrait', crop).top) / PHOTO_H } else layout[subject].scale = clamp(value, .7, 1.6); render() }
    $('zoom').oninput = function () { zoom(Number($('zoom').value) / 100) }
    $('minus').onclick = function () { zoom(selected()[subject === 'portrait' ? 'zoom' : 'scale'] - .1) }
    $('plus').onclick = function () { zoom(selected()[subject === 'portrait' ? 'zoom' : 'scale'] + .1) }
    $('reset').onclick = function () { if (subject === 'portrait') crop = Object.assign({}, baseCrop); else layout[subject] = { scale: 1, x: 0, y: 0 }; render() }
    function beginGesture() {
      var points = Array.from(pointers.values()); if (!image || !points.length) { gesture = null; return }
      var center = points.length > 1 ? { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 } : points[0]
      gesture = { x: center.x, y: center.y, start: Object.assign({}, selected()), distance: points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0 }
    }
    canvas.onpointerdown = function (event) { if (busy || !image) return; pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); canvas.setPointerCapture(event.pointerId); beginGesture() }
    canvas.onpointermove = function (event) {
      if (!pointers.has(event.pointerId) || !gesture || busy) return
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      var points = Array.from(pointers.values()), center = points.length > 1 ? { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 } : points[0], rect = canvas.getBoundingClientRect()
      if (subject === 'portrait') {
        crop.x = gesture.start.x + (center.x - gesture.x) / (rect.width * PHOTO_W / W)
        crop.y = gesture.start.y + (center.y - gesture.y) / (rect.height * PHOTO_H / H)
        if (points.length > 1 && gesture.distance) { var fixedTop = placement(image.naturalWidth, image.naturalHeight, 'portrait', gesture.start).top; crop.zoom = gesture.start.zoom * Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) / gesture.distance; crop.y += (fixedTop - placement(image.naturalWidth, image.naturalHeight, 'portrait', crop).top) / PHOTO_H }
      } else {
        layout[subject].x = clamp(gesture.start.x + (center.x - gesture.x) * W / rect.width, -180, 180)
        layout[subject].y = clamp(gesture.start.y + (center.y - gesture.y) * H / rect.height, -140, 140)
        if (points.length > 1 && gesture.distance) layout[subject].scale = clamp(gesture.start.scale * Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) / gesture.distance, .7, 1.6)
      }
      render()
    }
    function endPointer(event) { pointers.delete(event.pointerId); beginGesture() }
    canvas.onpointerup = endPointer; canvas.onpointercancel = endPointer; canvas.onlostpointercapture = endPointer
    $('export').onclick = function () {
      var viewer = document.createElement('div'); viewer.className = 'pc-full-preview'; viewer.setAttribute('role', 'dialog'); viewer.setAttribute('aria-label', '最终球员卡')
      var preview = new Image(); preview.src = canvas.toDataURL('image/jpeg', .94); preview.alt = '最终球员卡，可长按保存'
      var back = document.createElement('button'); back.type = 'button'; back.textContent = '返回编辑'
      viewer.appendChild(preview); viewer.appendChild(back); overlay.appendChild(viewer); back.focus()
      back.onclick = function () { viewer.remove(); $('export').focus() }
    }
    $('save').onclick = function () {
      if (busy || !image || !template) return
      var result = { mode: 'portrait', tier: tier, backgroundId:backgroundId, crop: Object.assign({}, crop), layout: { name: Object.assign({}, layout.name), number: Object.assign({}, layout.number) }, cardData: canvas.toDataURL('image/jpeg', .9) }
      busy = true; render(); status('正在保存球员卡…')
      Promise.resolve().then(function () { return options.onSave ? options.onSave(result) : result }).then(function () { busy = false; close() }).catch(function (error) { busy = false; render(); status(error.message || '保存失败，请重试', true) })
    }
    render()
    if (tier) loadImage('./assets/player-cards/' + backgroundId + '-card.png').then(function (value) { if (!closed) { template = value; render() } }).catch(function () { if (!closed) status('卡面素材加载失败，请刷新重试', true) })
    else status('生涯积分尚未核定，暂不能保存球员卡', true)
    if (options.teamLogoData) loadImage(options.teamLogoData).then(function (value) { if (!closed) { teamLogo = value; render() } }).catch(function () {})
    if (options.portraitSrc) loadImage(options.portraitSrc).then(function (value) { if (!closed) { image = value; render(); status('调整后查看成卡') } }).catch(function (error) { if (!closed) status(error.message, true) })
    else status('请先完成标准形象照拍摄', true)
    return { close: close }
  }
  var api = { open: open, placement: placement, draw: draw, textLayout: textLayout }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.SxfPlayerCardEditor = api
})(typeof window !== 'undefined' ? window : globalThis)
