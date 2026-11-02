'use strict'
// ---------- 启动与 hash 恢复 ----------
  // ---------- 启动 ----------
  // 浏览器前进/后退时跟随 hash 切页
  window.addEventListener('hashchange', function () {
    var h = readHash()
    if (!h || h === state.tab) return
    state.tab = h
    shell()
  })
  if (DEMO) {
    state.shares = SHARES.map(function (s) { return Object.assign({}, s) })
    // 预填已送出的卡到持卡池
    state.pool = state.shares.filter(function (s) { return s.shared }).map(function (s) { return { playerId: s.playerId, name: s.name, tier: s.tier, points: s.points, cardUrl: s.cardUrl } })
    state.lineups = []
    state.formations = FORMATIONS
    renderTaskBar()
    var bootTab = readHash()
    if (bootTab) state.tab = bootTab
    shell()
    if (state.tab === 'map') guide('map')
  } else {
    main.className = 'game-state'; main.textContent = '正在进入球员卡玩法…'
    Promise.all([api('getPlayerCardGameHome'), api('listMyGameMatches')]).then(function (results) {
      state.home = results[0].home
      state.matches = results[1].rows
      state.matchesLoaded = true
      state.lineups = []
      syncTasks(false)
      var bootTab = readHash()
      if (bootTab) state.tab = bootTab
      shell()
      if (state.tab === 'map') guide('map')
    }).catch(function (e) {
      if (e && e.code === 'PLAYER_CARD_AUTH_REQUIRED') { login(); return }
      failBox(e && e.message || '网络异常，请重试', function () { location.reload() })
    })
  }
