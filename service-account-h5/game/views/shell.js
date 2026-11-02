'use strict'
// ---------- 外壳与路由：顶部 HUD、地图、tab 切换、hash 同步 ----------
  function shell() {
    var h = state.home
    var sharable = h ? h.sharableCount : state.shares.filter(function (s) { return !s.shared }).length
    var shared = h ? h.sharedCount : state.shares.filter(function (s) { return s.shared }).length
    var collected = h ? h.collectedCount : state.codex.length
    var lineupText = h ? h.lineupCount + '/' + h.maxLineups : state.lineups.length + '/5'
    var nick = h ? h.nickname : '演示玩家'
    var wins = h ? h.wins : state.matches.filter(function (m) { return m.result === 'win' }).length
    var draws = h ? h.draws : state.matches.filter(function (m) { return m.result === 'draw' }).length
    var losses = h ? h.losses : state.matches.filter(function (m) { return m.result === 'lose' }).length
    main.className = ''
    var backBtn = document.getElementById('backMapBtn')
    if (state.tab === 'map') {
      if (backBtn) backBtn.style.display = 'none'
      renderMap()
      writeHash()
      return
    }
    if (backBtn) backBtn.style.display = ''
    backBtn.onclick = function () { state.tab = 'map'; shell() }
    main.innerHTML =
      '<div class="game-hud"><div class="hud-card">' +
      '<div class="hud-nick">' + esc(nick) + '</div>' +
      '<div class="hud-record">PK 战绩 <b>' + wins + ' 胜</b> / ' + draws + ' 平 / ' + losses + ' 负</div>' +
      '<div class="hud-stats">' +
      '<div><strong>' + sharable + '</strong><span>可送出</span></div>' +
      '<div><strong>' + shared + '</strong><span>已送出</span></div>' +
      '<div><strong>' + collected + '</strong><span>已收集</span></div>' +
      '<div><strong>' + lineupText + '</strong><span>阵容</span></div>' +
      '</div></div></div>' +
      '<nav class="game-tabs" aria-label="玩法切换">' +
      tabBtn('share', '送出') + tabBtn('collect', '图鉴') + tabBtn('lineup', '阵容') + tabBtn('pk', '对战') + tabBtn('daily', '每日') +
      '</nav><div id="gameView" class="game-view inner-mode"></div>'
    Array.prototype.forEach.call(main.querySelectorAll('[data-tab]'), function (b) {
      b.onclick = function () { state.tab = b.getAttribute('data-tab'); renderTab() }
    })
    renderTab()
  }
  // ---------- 卡通冒险地图（实图素材 + 横向滑动） ----------
  function renderMap() {
    var ti = state.taskIdx
    var allDone = ti >= TASKS.length
    var target = MAP_NODES[Math.min(ti, MAP_NODES.length - 1)]
    var nodesHtml = MAP_NODES.map(function (node, i) {
      var status = i < ti ? 'done' : i === ti ? (allDone ? 'done' : 'active') : 'locked'
      var badge = status === 'done' ? '<span class="b-badge">✅</span>' : status === 'locked' ? '<span class="b-badge">🔒</span>' : '<span class="b-num">' + (i + 1) + '</span>'
      var imgName = status === 'locked' ? '建设中' : node.img
      return '<button type="button" class="b-node ' + status + '" data-node="' + node.id + '" style="left:' + node.x + '%;top:' + node.y + '%">' +
        '<span class="b-glow"></span>' + badge +
        '<img src="' + ASSET + imgName + '.png" alt="' + esc(node.label) + '">' +
        '<span class="b-label">' + esc(node.label) + '</span></button>'
    }).join('')
    var decosHtml = MAP_DECOS.map(function (d) {
      return '<span class="b-deco" style="left:' + d.x + '%;top:' + d.y + '%"><img src="' + ASSET + d.img + '.png" alt=""></span>'
    }).join('')
    main.innerHTML =
      '<div class="map-scroll" id="mapScroll"><div class="map-scene" id="mapScene">' +
      decosHtml + nodesHtml +
      (allDone ? '' : '<span class="guide-arrow" style="left:' + target.x + '%;top:' + (target.y - 12) + '%">▼</span>') +
      '<span class="b-bee" id="mapBee" style="left:' + (target.x - 9) + '%;top:' + (target.y + 3) + '%"><img src="' + poseImg('guide') + '" alt="蜂哥"></span>' +
      '</div></div>' +
      '<p class="map-tip-slide">🗺️ 蜂之小镇 · 左右滑动逛小镇，点建筑进入玩法</p>'
    Array.prototype.forEach.call(main.querySelectorAll('.b-node'), function (node) {
      node.onclick = function () {
        var id = node.getAttribute('data-node')
        // 每日领卡随时可进，不受任务锁限制
        if (id === 'daily') { state.tab = 'daily'; shell(); return }
        var idx = MAP_NODES.findIndex(function (n) { return n.id === id })
        if (idx > state.taskIdx) { showToast('🔒 先完成「' + TASKS[state.taskIdx].label + '」再来这里～'); return }
        state.tab = id === 'share' ? 'home' : id
        shell()
      }
    })
    // 自动滚动到当前任务建筑
    setTimeout(function () {
      var scroll = document.getElementById('mapScroll'), scene = document.getElementById('mapScene')
      if (!scroll || !scene) return
      scroll.scrollLeft = Math.max(0, Math.min(scene.offsetWidth * target.x / 100 - scroll.clientWidth / 2, scene.offsetWidth - scroll.clientWidth))
      // PC 端鼠标拖拽横向滚动（手机端原生 touch 已支持）
      if (scroll.dataset.dragBound) return
      scroll.dataset.dragBound = '1'
      var dragging = false, startX = 0, startLeft = 0, moved = 0
      scroll.style.cursor = 'grab'
      scroll.addEventListener('mousedown', function (e) {
        dragging = true; moved = 0; startX = e.clientX; startLeft = scroll.scrollLeft
        scroll.style.cursor = 'grabbing'
        e.preventDefault()
      })
      window.addEventListener('mousemove', function (e) {
        if (!dragging) return
        var dx = e.clientX - startX
        moved = Math.max(moved, Math.abs(dx))
        scroll.scrollLeft = startLeft - dx
      })
      window.addEventListener('mouseup', function () {
        if (!dragging) return
        dragging = false; scroll.style.cursor = 'grab'
      })
      // 拖拽时阻止节点 click（位移>6px 视为拖动而非点击）
      scroll.addEventListener('click', function (e) {
        if (moved > 6) { e.stopPropagation(); e.preventDefault(); moved = 0 }
      }, true)
    }, 60)
  }
  function tabBtn(id, label) { return '<button type="button" data-tab="' + id + '" class="' + (state.tab === id ? 'on' : '') + '">' + label + '</button>' }
  function view() { return document.getElementById('gameView') }
  // 当前页面写入地址栏 hash，重开链接可回到同一页
  var HASH_TABS = ['map', 'home', 'share', 'upgrade', 'studio', 'collect', 'lineup', 'pk', 'daily', 'penalty', 'scratch']
  function writeHash() {
    var h = '#' + state.tab
    if (location.hash !== h) { try { history.replaceState(null, '', location.pathname + location.search + h) } catch (e) { location.hash = h } }
  }
  function readHash() {
    var h = String(location.hash || '').replace(/^#/, '')
    return HASH_TABS.indexOf(h) >= 0 ? h : ''
  }
  function renderTab() {
    Array.prototype.forEach.call(main.querySelectorAll('[data-tab]'), function (b) { b.className = b.getAttribute('data-tab') === state.tab ? 'on' : '' })
    if (state.tab === 'home') renderHome()
    else if (state.tab === 'share') renderShare()
    else if (state.tab === 'upgrade') renderUpgrade()
    else if (state.tab === 'studio') renderStudio()
    else if (state.tab === 'collect') renderCodex()
    else if (state.tab === 'lineup') renderLineups()
    else if (state.tab === 'daily') renderDailySpin()
    else if (state.tab === 'penalty') renderPenalty()
    else if (state.tab === 'scratch') renderScratch()
    else renderPk()
    writeHash()
  }

  // ---------- 小屋内部（家）：送出 / 升级 / 制卡 三间房 ----------
  function homeHeader(sub) {
    return '<div class="home-head">' + (sub
      ? '<button type="button" class="home-back" id="homeBack">‹ 回到小屋</button><h3 class="section-title" style="margin:0">' + sub + '</h3>'
      : '<h3 class="section-title" style="margin:0">🏠 蜂哥的小屋</h3>') + '</div>'
  }
  function bindHomeBack() {
    var b = document.getElementById('homeBack')
    if (b) b.onclick = function () { state.tab = 'home'; renderTab() }
  }
  // 小游戏页统一的「返回」按钮绑定
  function bindBack() {
    Array.prototype.forEach.call(main.querySelectorAll('[data-back]'), function (b) {
      b.onclick = function () { state.tab = b.getAttribute('data-back'); shell() }
    })
  }
