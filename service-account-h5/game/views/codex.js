'use strict'
// ---------- 图鉴与收集大厅 ----------
  function renderCodex() {
    var v = view()
    if (DEMO) { drawCodex(); return }
    v.innerHTML = '<div class="game-state">正在读取我的图鉴…</div>'
    api('getMyCollectionCodex').then(function (r) {
      state.codex = r.rows.map(normCard)
      state.codexStats = r.stats
      drawCodex()
    }).catch(function (e) { guard(e, renderCodex) })
  }
  function drawCodex() {
    var v = view()
    var stats = state.codexStats || { total: 0, bronze: 0, silver: 0, gold: 0 }
    if (DEMO) {
      stats = { total: state.codex.length, bronze: 0, silver: 0, gold: 0 }
      state.codex.forEach(function (r) { stats[r.tier]++ })
    }
    var head = '<p class="view-tip">图鉴记录你收集的全平台公开球员卡。</p>' +
      '<div class="hud-stats" style="margin:0 0 14px">' +
      '<div><strong>' + stats.total + '</strong><span>累计收集</span></div>' +
      '<div><strong>' + stats.bronze + '</strong><span>铜卡</span></div>' +
      '<div><strong>' + stats.silver + '</strong><span>银卡</span></div>' +
      '<div><strong>' + stats.gold + '</strong><span>金卡</span></div></div>' +
      '<div style="margin-bottom:12px"><button type="button" class="gc-btn" id="scratchBtn" style="width:100%;padding:12px;background:linear-gradient(135deg,#4de3c1,#2bc4a4);color:#052a22;font-weight:800;font-size:14px;border:0;border-radius:10px">🎰 刮刮卡 · 免费刮一次</button></div>'
    var grid = state.codex.length
      ? '<div class="card-grid">' + state.codex.map(function (row, i) {
          var extra = row.status === 'stolen' ? '<span class="gc-stale">已被抽走</span>' : row.status === 'stale' ? '<span class="gc-stale">已收回</span>' : ''
          return '<div class="game-card" style="animation-delay:' + Math.min(i * 40, 320) + 'ms"><div class="gc-frame">' + cardArtTag(row, extra) +
            '<div class="gc-meta"><h3>' + esc(row.name) + '</h3><p>' + esc([row.teamName, row.jerseyNumber + ' 号'].join(' · ')) + '</p>' +
            '<p class="gc-points">' + esc(TIER_LABEL[row.tier]) + ' · ' + row.pointsAtCollect + ' 分</p></div></div></div>'
        }).join('') + '</div>'
      : '<div class="empty-box">图鉴还是空的，去下方收集大厅领第一张卡吧。</div>'
    v.innerHTML = head + grid + '<h3 class="section-title">收集大厅 · 全平台公开卡</h3>' +
      '<div id="hallBox">' + renderHall() + '</div>'
    bindFlip(v)
    var scratchBtn = document.getElementById('scratchBtn')
    if (scratchBtn) scratchBtn.onclick = function () { state.tab = 'scratch'; renderTab() }
    if (!TASKS[1].done) {
      var firstCollect = v.querySelector('[data-collect]')
      if (firstCollect) firstCollect.classList.add('hl-hint')
    }
    bindHallEvents(v)
  }
  function renderHall() {
    if (!DEMO) return '<div id="hallGrid" class="card-grid"></div><div id="hallMore"></div>'
    var rows = state.hallRows.length ? state.hallRows : HALL.slice(0, 4)
    if (!state.hallRows.length) state.hallRows = rows
    var grid = rows.map(function (row) {
      var owned = row.collected
        ? '<span class="gc-collected">已收集</span>'
        : '<button type="button" class="gc-btn" data-collect="' + esc(row.shareId) + '">收入图鉴</button>'
      return '<div class="game-card"><div class="gc-frame">' + cardArtTag(row) +
        '<div class="gc-meta"><h3>' + esc(row.name) + '</h3><p>' + esc([row.teamName, row.jerseyNumber + ' 号'].join(' · ')) + '</p>' +
        '<p class="gc-points">' + esc(TIER_LABEL[row.tier]) + ' · ' + row.points + ' 分</p>' + owned + '</div></div></div>'
    }).join('')
    return '<div class="card-grid">' + grid + '</div>'
  }
  function bindHallEvents(v) {
    if (!DEMO) { loadHall(); return }
    Array.prototype.forEach.call(v.querySelectorAll('[data-collect]'), function (b) {
      b.onclick = function () {
        var sid = b.getAttribute('data-collect')
        var row = HALL.filter(function (s) { return s.shareId === sid })[0]
        row.collected = true
        state.codex.push({ playerId: row.playerId, name: row.name, teamName: row.teamName, jerseyNumber: row.jerseyNumber, tier: row.tier, pointsAtCollect: row.points, status: 'active', cardUrl: row.cardUrl, collectedAt: Date.now() })
        if (!state.pool.some(function (p) { return p.playerId === row.playerId })) {
          state.pool.push({ playerId: row.playerId, name: row.name, tier: row.tier, points: row.points, cardUrl: row.cardUrl })
        }
        shell()
        if (!TASKS[1].done) completeTask()
      }
    })
  }
  // 真实模式：收集大厅分页加载
  function loadHall() {
    if (state.hallLoading || state.hallDone) return
    state.hallLoading = true
    var grid = document.getElementById('hallGrid'), more = document.getElementById('hallMore')
    if (more) more.innerHTML = '<p class="view-tip" style="text-align:center">正在读取…</p>'
    var params = {}
    if (state.hallAfter) params.after = state.hallAfter
    api('listCollectiblePlayerCards', params).then(function (r) {
      state.hallLoading = false
      state.hallRows = state.hallRows.concat(r.rows.map(normCard))
      state.hallAfter = r.nextAfter || ''
      state.hallDone = !r.nextAfter || !r.rows.length
      if (!grid) return
      grid.innerHTML = state.hallRows.map(function (row, i) {
        var owned = row.collected
          ? '<span class="gc-collected">已收集</span>'
          : '<button type="button" class="gc-btn" data-collect="' + esc(row.shareId) + '">收入图鉴</button>'
        return '<div class="game-card" style="animation-delay:' + Math.min((i % 20) * 30, 300) + 'ms"><div class="gc-frame">' + cardArtTag(row) +
          '<div class="gc-meta"><h3>' + esc(row.name) + '</h3><p>' + esc([row.teamName, row.jerseyNumber + ' 号'].join(' · ')) + '</p>' +
          '<p class="gc-points">' + esc(TIER_LABEL[row.tier]) + ' · ' + row.points + ' 分</p>' + owned + '</div></div></div>'
      }).join('') || '<div class="empty-box" style="grid-column:1/-1">暂时没有可收集的球员卡。</div>'
      bindFlip(grid)
      Array.prototype.forEach.call(grid.querySelectorAll('[data-collect]'), function (b) {
        b.onclick = function () {
          var sid = b.getAttribute('data-collect')
          b.disabled = true; b.textContent = '收集…'
          api('collectPlayerCard', { shareId: sid }).then(function () {
            var row = state.hallRows.filter(function (x) { return x.shareId === sid })[0]
            if (row) row.collected = true
            b.outerHTML = '<span class="gc-collected">已收集</span>'
            refreshHome().then(function () {
              syncTasks(true)
              // 重新拉图鉴，让新卡立刻出现在上方图鉴区
              api('getMyCollectionCodex').then(function (r2) {
                state.codex = r2.rows.map(normCard)
                state.codexStats = r2.stats
                var hud = main.querySelector('.hud-stats')
                if (hud && state.home) hud.children[2].firstElementChild.textContent = state.home.collectedCount
                drawCodex()
              })
            })
          }).catch(function (e) {
            if (e.code === 'PLAYER_CARD_AUTH_REQUIRED') return login()
            b.disabled = false; b.textContent = '收入图鉴'
            alert(e.code === 'PLAYER_CARD_GAME_SHARE_CLOSED' ? '这张卡已被卡主收回，无法收集' : e.message || '收集失败，请重试')
          })
        }
      })
      if (more) more.innerHTML = state.hallDone
        ? (state.hallRows.length ? '<p class="view-tip" style="text-align:center">已到底</p>' : '')
        : '<button type="button" class="load-more" id="hallNext">加载更多</button>'
      var next = document.getElementById('hallNext')
      if (next) next.onclick = loadHall
    }).catch(function (e) {
      state.hallLoading = false
      if (e.code === 'PLAYER_CARD_AUTH_REQUIRED') return login()
      if (more) more.innerHTML = '<button type="button" class="load-more" id="hallRetry">读取失败，点击重试</button>'
      var retry = document.getElementById('hallRetry')
      if (retry) retry.onclick = loadHall
    })
  }

  // ---------- 任务3：组建阵容 ----------
