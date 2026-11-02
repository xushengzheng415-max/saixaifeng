'use strict'
// ---------- 刮刮卡 ----------
  function renderScratch() {
    var v = view()
    v.innerHTML = '<div class="back-row"><button type="button" class="gc-btn ghost" data-back="collect">返回</button></div>' +
      '<h3 class="view-title">刮刮卡</h3>' +
      '<p class="view-tip">用手指在卡面上刮，刮开约两成自动揭晓奖品！</p>' +
      '<div class="scratch-wrap"><canvas id="scratchCanvas" width="280" height="160"></canvas><div class="scratch-prize" id="scratchPrize">?</div></div>' +
      '<div id="scratchResult" class="spin-result"></div>'
    bindBack()
    var canvas = document.getElementById('scratchCanvas')
    var ctx = canvas.getContext('2d')
    var prizeText = document.getElementById('scratchPrize')
    // 随机奖品：权重制，刮开后按等级真实发卡进持卡池
    var prizePool = [
      { label: '铜卡 x1', tier: 'bronze', count: 1, weight: 30 },
      { label: '银卡 x1', tier: 'silver', count: 1, weight: 22 },
      { label: '铜卡 x2', tier: 'bronze', count: 2, weight: 16 },
      { label: '卡包 x1', tier: 'any', count: 1, weight: 14 },
      { label: '金卡 x1', tier: 'gold', count: 1, weight: 8 },
      { label: '谢谢参与', tier: '', count: 0, weight: 10 }
    ]
    var totalWeight = 0
    prizePool.forEach(function (p) { totalWeight += p.weight })
    var roll = Math.random() * totalWeight
    var prize = prizePool[prizePool.length - 1]
    for (var pi = 0; pi < prizePool.length; pi++) {
      roll -= prizePool[pi].weight
      if (roll <= 0) { prize = prizePool[pi]; break }
    }
    prizeText.textContent = prize.tier ? '🎁' : '😅'
    // 画覆盖层
    ctx.fillStyle = '#3a4a6b'
    ctx.fillRect(0, 0, 280, 160)
    ctx.fillStyle = '#8b98bd'
    ctx.font = '14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('刮开涂层', 140, 80)
    ctx.globalCompositeOperation = 'destination-out'
    var isDrawing = false
    var revealed = false
    var last = null
    var W = canvas.width, H = canvas.height
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 40
    function scratch(x, y) {
      if (last) {
        ctx.beginPath()
        ctx.moveTo(last.x, last.y)
        ctx.lineTo(x, y)
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(x, y, 20, 0, Math.PI * 2)
      ctx.fill()
      last = { x: x, y: y }
    }
    // 画布绘图缓冲区(280×160)与屏幕显示尺寸可能不一致，必须按比例换算
    function getPos(e) {
      var rect = canvas.getBoundingClientRect()
      var sx = W / (rect.width || W)
      var sy = H / (rect.height || H)
      return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy }
    }
    function onStart(e) {
      if (revealed) return
      e.preventDefault()
      isDrawing = true
      last = null
      if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId) } catch (err) {} }
      var pos = getPos(e)
      scratch(pos.x, pos.y)
      playSound('tap')
    }
    function onMove(e) {
      if (!isDrawing || revealed) return
      e.preventDefault()
      var pos = getPos(e)
      scratch(pos.x, pos.y)
    }
    function onEnd() {
      if (!isDrawing && !revealed) return
      isDrawing = false
      last = null
      // 检查刮开比例
      var data = ctx.getImageData(0, 0, W, H).data
      var transparent = 0
      for (var i = 3; i < data.length; i += 4) { if (data[i] === 0) transparent++ }
      if (transparent / (W * H) > 0.2 && !revealed) {
        revealed = true
        canvas.style.display = 'none'
        prizeText.style.fontSize = '26px'
        prizeText.style.color = prize.tier ? '#ffc94d' : '#8b98bd'
        prizeText.textContent = prize.label
        var granted = []
        for (var gi = 0; gi < prize.count; gi++) granted.push(grantCard(prize.tier))
        var resultBox = document.getElementById('scratchResult')
        if (!granted.length) {
          resultBox.innerHTML = '<p class="gain-hint">这次空手而归，明天再来刮一张～</p>'
          playSound('lose')
        } else {
          resultBox.innerHTML = '<div class="scratch-gain">' + granted.map(function (c) {
            return '<div class="sg-card"><img src="' + esc(c.cardUrl) + '" alt="' + esc(c.name) + '"><span>' + esc(c.name) + ' · ' + c.points + '分</span></div>'
          }).join('') + '</div>' +
            '<p class="gain-hint">' + granted.length + ' 张卡已加入持卡池，去「阵容」页就能上阵</p>'
          playSound('collect')
          if (window.confetti) confetti({ particleCount: 60, spread: 50, origin: { y: 0.7 } })
        }
      }
    }
    canvas.style.touchAction = 'none'
    canvas.addEventListener('pointerdown', onStart)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onEnd)
    canvas.addEventListener('pointercancel', onEnd)
    canvas.addEventListener('pointerleave', onEnd)
  }

  // ---------- 点球大战（对战页彩蛋） ----------
