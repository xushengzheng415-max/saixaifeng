'use strict'
// ---------- 阵容 PK、模拟比赛、对战详情与抽卡战利品 ----------
  function renderPk() {
    var v = view()
    if (DEMO) { drawPk(); return }
    v.innerHTML = '<div class="game-state">正在读取对战数据…</div>'
    Promise.all([api('listGameOpponents'), api('listMyGameMatches'), api('listMyGameLineups')]).then(function (results) {
      state.opponents = results[0].rows
      state.matches = results[1].rows
      state.matchesLoaded = true
      state.lineups = results[2].rows
      syncTasks(false)
      drawPk()
    }).catch(function (e) { guard(e, renderPk) })
  }
  function drawPk() {
    var v = view()
    var wins = 0, draws = 0, losses = 0
    if (!DEMO && state.home) { wins = state.home.wins; draws = state.home.draws; losses = state.home.losses }
    else state.matches.forEach(function (m) { if (m.result === 'win') wins++; else if (m.result === 'draw') draws++; else losses++ })
    var record = '<div class="pk-record"><div class="w"><strong>' + wins + '</strong><span>胜</span></div><div class="d"><strong>' + draws + '</strong><span>平</span></div><div class="l"><strong>' + losses + '</strong><span>负</span></div></div>'
    var src = DEMO ? OPPONENTS : state.opponents
    var opponents = src.length ? src.map(function (row) {
      var picker = state.pickLineupFor === row.lineupId
        ? '<div style="margin-top:8px">' + state.lineups.map(function (l) {
            return '<button type="button" class="gc-btn" style="margin:0 8px 8px 0;width:auto;padding:8px 14px" data-use-lineup="' + esc(l.lineupId) + '" data-vs="' + esc(row.lineupId) + '">' + esc(l.name) + '（' + l.totalPoints + '）</button>'
          }).join('') + '<button type="button" class="gc-btn ghost" style="width:auto;padding:8px 14px" data-cancel-pick>取消</button></div>'
        : ''
      return '<div class="lineup-row" style="flex-wrap:wrap"><div class="lr-main"><h3>' + esc(row.name) + '</h3>' +
        '<p>' + esc(row.ownerNickname) + ' · ' + row.formation.count + ' 人制</p></div>' +
        '<div class="lr-points" style="color:#8b98bd">???<small>战力保密</small></div>' +
        '<button type="button" class="challenge-btn" data-challenge="' + esc(row.lineupId) + '">挑战</button>' + picker + '</div>'
    }).join('') : '<div class="empty-box">暂时没有其他玩家开启挑战，等对手出现后来这里发起 PK。</div>'
    var matches = state.matches.length ? state.matches.map(function (row) {
      var badge = row.result === 'win' ? '<span class="match-badge mb-win">胜</span>' : row.result === 'lose' ? '<span class="match-badge mb-lose">负</span>' : '<span class="match-badge mb-draw">平</span>'
      var scoreText = row.score
        ? row.score.mine + ' : ' + row.score.opponent
        : (row.myGoals != null ? row.myGoals : row.myPoints) + ' : ' + (row.oppGoals != null ? row.oppGoals : row.opponentPoints)
      return '<div class="match-row" data-match="' + esc(row.matchId) + '">' + badge +
        '<div class="mr-main"><h4>' + esc(row.role === 'challenger' ? '挑战 ' : '迎战 ') + esc(row.opponentNickname) + '</h4>' +
        '<p>' + esc(row.myLineupName) + ' vs ' + esc(row.opponentLineupName) + '</p></div>' +
        '<span class="match-score">' + scoreText + '</span></div>'
    }).join('') : '<div class="empty-box">还没有对战记录。</div>'
    // 演示模式专属：强制结果开关；真实模式胜负由服务端决定，不展示
    var demoSwitch = DEMO ? '<div class="demo-switch"><b>演示</b><span>强制结果：</span>' +
      '<button type="button" data-force=""' + (state.forceResult ? '' : ' class="on"') + '>随机</button>' +
      '<button type="button" data-force="win"' + (state.forceResult === 'win' ? ' class="on"' : '') + '>胜（抽对方卡）</button>' +
      '<button type="button" data-force="lose"' + (state.forceResult === 'lose' ? ' class="on"' : '') + '>负（被抽卡）</button></div>' : ''
    v.innerHTML = '<p class="view-tip">PK 为异步对战：用你已保存的阵容挑战他人开启挑战的阵容。</p>' +
      '<div style="margin-bottom:12px"><button type="button" class="gc-btn" id="penaltyBtn" style="width:100%;padding:12px;background:linear-gradient(135deg,#ffc94d,#ff9d4d);color:#3a2a00;font-weight:800;font-size:14px;border:0;border-radius:10px">⚽ 点球大战 · 赢球送卡包</button></div>' +
      record +
      '<h3 class="section-title">可挑战的对手</h3>' +
      demoSwitch +
      opponents +
      '<h3 class="section-title">我的战绩</h3>' + matches
    if (!TASKS[3].done) {
      var cb = v.querySelector('[data-challenge]')
      if (cb) cb.classList.add('hl-hint')
    }
    var penaltyBtn = document.getElementById('penaltyBtn')
    if (penaltyBtn) penaltyBtn.onclick = function () { state.tab = 'penalty'; renderTab() }
    bindPkEvents(v)
  }
  function bindPkEvents(v) {
    Array.prototype.forEach.call(v.querySelectorAll('[data-force]'), function (b) {
      b.onclick = function () { state.forceResult = b.getAttribute('data-force'); drawPk() }
    })
    Array.prototype.forEach.call(v.querySelectorAll('[data-challenge]'), function (b) {
      b.onclick = function () {
        var defenderId = b.getAttribute('data-challenge')
        if (!state.lineups.length) { alert('请先在「阵容」页保存一套满编阵容'); return }
        if (state.lineups.length === 1) { doChallenge(state.lineups[0].lineupId, defenderId, b); return }
        state.pickLineupFor = state.pickLineupFor === defenderId ? '' : defenderId
        drawPk()
      }
    })
    Array.prototype.forEach.call(v.querySelectorAll('[data-use-lineup]'), function (b) {
      b.onclick = function () { doChallenge(b.getAttribute('data-use-lineup'), b.getAttribute('data-vs'), b) }
    })
    Array.prototype.forEach.call(v.querySelectorAll('[data-cancel-pick]'), function (b) {
      b.onclick = function () { state.pickLineupFor = ''; drawPk() }
    })
    Array.prototype.forEach.call(v.querySelectorAll('[data-match]'), function (row) {
      row.onclick = function () { openMatch(row.getAttribute('data-match')) }
    })
  }
  // FM式90分钟模拟：战力决定进球期望，产出进球/红黄牌/换人事件流（仅演示模式）
  function simulateMatch(myPts, oppPts, mySlots, oppSlots, force) {
    var diff = myPts - oppPts
    var myBase = 2 + diff / 80, oppBase = 2 - diff / 80
    var myGoals = Math.max(0, Math.round(myBase + (Math.random() * 2 - 1)))
    var oppGoals = Math.max(0, Math.round(oppBase + (Math.random() * 2 - 1)))
    if (myGoals === oppGoals && Math.random() < 0.35) { if (myPts >= oppPts) myGoals++; else oppGoals++ }
    // 演示强制结果：先定比分，再按最终比分生成事件，保证事件与比分一致
    if (force === 'win' && myGoals <= oppGoals) myGoals = oppGoals + (oppGoals === 0 ? 2 : 1)
    else if (force === 'lose' && myGoals >= oppGoals) oppGoals = myGoals + 1
    var events = [], usedMin = {}
    function rndMin() { var m; do { m = 2 + Math.floor(Math.random() * 88) } while (usedMin[m]); usedMin[m] = 1; return m }
    function pickWeighted(slots) {
      var bag = []
      slots.forEach(function (s) {
        var r = s.role || ''
        var w = r.indexOf('FW') === 0 ? 5 : r.indexOf('MF') === 0 ? 3 : r === 'GK' ? 1 : 2
        for (var i = 0; i < w; i++) bag.push(s)
      })
      return bag[Math.floor(Math.random() * bag.length)]
    }
    var i, s, mySide
    for (i = 0; i < myGoals; i++) { s = pickWeighted(mySlots); events.push({ minute: rndMin(), side: 'my', type: 'goal', ico: '⚽', text: s.name + ' 破门得分！' }) }
    for (i = 0; i < oppGoals; i++) { s = pickWeighted(oppSlots); events.push({ minute: rndMin(), side: 'opp', type: 'goal', ico: '⚽', text: s.name + ' 攻破我方球门' }) }
    var yc = 1 + Math.floor(Math.random() * 3)
    for (i = 0; i < yc; i++) { mySide = Math.random() < 0.5; s = pickWeighted(mySide ? mySlots : oppSlots); events.push({ minute: rndMin(), side: mySide ? 'my' : 'opp', type: 'yellow', ico: '🟨', text: s.name + ' 战术犯规染黄' }) }
    if (Math.random() < 0.25) { mySide = Math.random() < 0.5; s = pickWeighted(mySide ? mySlots : oppSlots); events.push({ minute: rndMin(), side: mySide ? 'my' : 'opp', type: 'red', ico: '🟥', text: s.name + ' 两黄变一红被罚下' }) }
    var sc = 1 + Math.floor(Math.random() * 2)
    for (i = 0; i < sc; i++) { mySide = Math.random() < 0.5; var arr = mySide ? mySlots : oppSlots; s = arr[Math.floor(Math.random() * arr.length)]; events.push({ minute: rndMin(), side: mySide ? 'my' : 'opp', type: 'sub', ico: '🔁', text: (mySide ? '我方' : '对方') + '换人调整，' + s.name + ' 被替换下场' }) }
    events.sort(function (a, b) { return a.minute - b.minute })
    return { myGoals: myGoals, oppGoals: oppGoals, events: events }
  }
  function doChallenge(lineupId, defenderLineupId, btn) {
    btn.disabled = true; btn.textContent = '对决中…'
    state.pickLineupFor = ''
    if (!DEMO) {
      api('challengeGameLineup', { lineupId: lineupId, defenderLineupId: defenderLineupId }).then(function (r) {
        var matchId = r.match && (r.match.matchId || r.match._id)
        return refreshHome().then(function () {
          return api('listMyGameMatches').then(function (r2) { state.matches = r2.rows; state.matchesLoaded = true })
        }).then(function () {
          syncTasks(true)
          drawPk()
          if (matchId) openMatch(matchId)
        })
      }).catch(function (e) {
        btn.disabled = false; btn.textContent = '挑战'
        if (e.code === 'PLAYER_CARD_AUTH_REQUIRED') return login()
        alert(e.message || '挑战失败，请重试')
      })
      return
    }
    setTimeout(function () {
      var myLineup = state.lineups.filter(function (l) { return l.lineupId === lineupId })[0]
      var opp = OPPONENTS.filter(function (o) { return o.lineupId === defenderLineupId })[0]
      var mySlots = myLineup.slots.map(function (s) { var p = poolById(s.playerId); return { role: s.role, name: p ? p.name : '?', tier: p ? p.tier : '', points: p ? p.points : 0 } })
      var oppSlots = [{ role: 'GK', name: '对方门将', points: 30 }, { role: 'CB1', name: '对方后卫', points: 22 }, { role: 'CB2', name: '对方后卫', points: 28 }, { role: 'FW1', name: '对方前锋', points: 50 }, { role: 'FW2', name: '对方前锋', points: 30 }]
      var sim = simulateMatch(myLineup.totalPoints, opp.totalPoints, mySlots, oppSlots, state.forceResult)
      var result = sim.myGoals > sim.oppGoals ? 'win' : sim.myGoals < sim.oppGoals ? 'lose' : 'draw'
      // 抽卡：赢 → 抽走对方一张卡入持卡池；输 → 被对方抽走一张
      var loot = null
      if (result === 'win') {
        var ln = ['赵铁脚', '钱多多', '孙大圣', '李飞刀', '韩小快', '周铁卫', '吴门神', '郑追风']
        var lt = ['bronze', 'silver', 'gold']
        var ltier = lt[Math.floor(Math.random() * lt.length)]
        var lc = { playerId: 'loot' + Date.now(), name: ln[Math.floor(Math.random() * ln.length)], tier: ltier, points: 30 + Math.floor(Math.random() * 60), jerseyNumber: String(1 + Math.floor(Math.random() * 29)) }
        lc.cardUrl = cardArt(lc.name, lc.tier, lc.jerseyNumber)
        state.pool.push({ playerId: lc.playerId, name: lc.name, tier: lc.tier, points: lc.points, cardUrl: lc.cardUrl })
        loot = { side: 'my', card: lc }
      } else if (result === 'lose' && state.pool.length) {
        var li = Math.floor(Math.random() * state.pool.length)
        var lost = state.pool[li]
        state.pool.splice(li, 1)
        state.lineups.forEach(function (l) { l.slots.forEach(function (s) { if (s.playerId === lost.playerId) s.playerId = '' }) })
        loot = { side: 'opp', card: lost }
      }
      var matchId = 'M' + Date.now()
      state.matches.unshift({
        matchId: matchId, role: 'challenger', result: result,
        myPoints: myLineup.totalPoints, opponentPoints: opp.totalPoints,
        myGoals: sim.myGoals, oppGoals: sim.oppGoals, events: sim.events, loot: loot,
        myLineupName: myLineup.name, opponentLineupName: opp.name, opponentNickname: opp.ownerNickname,
        createdAt: Date.now(),
        challenger: { name: myLineup.name, slots: mySlots },
        defender: { name: opp.name, slots: oppSlots }
      })
      shell()
      openMatch(matchId)
      if (!TASKS[3].done) completeTask()
    }, 700)
  }
  // 真实模式：把 getGameMatchDetail 的返回换算成面板渲染所需的我方视角结构
  function adaptMatch(d) {
    var meC = d.role === 'challenger'
    var mine = meC ? d.challenger : d.defender
    var theirs = meC ? d.defender : d.challenger
    var ICONS = { goal: '⚽', yellow: '🟨', red: '🟥', sub: '🔁' }
    var events = (d.events || []).map(function (ev) {
      var myEv = (ev.side === 'challenger') === meC
      var text = ev.player || '球员'
      if (ev.type === 'goal') text += myEv ? ' 破门得分！' : ' 攻破我方球门'
      else if (ev.type === 'yellow') text += ' 战术犯规染黄'
      else if (ev.type === 'red') text += ' 染红被罚下'
      else if (ev.type === 'sub') text = (myEv ? '我方' : '对方') + '换人调整，' + text + ' 被替换下场'
      return { minute: ev.minute, side: myEv ? 'my' : 'opp', type: ev.type, ico: ICONS[ev.type] || '•', text: text }
    })
    var loot = null
    if (d.steal && d.steal.direction) {
      var won = d.steal.direction === 'won'
      var tier = d.steal.tier || 'bronze'
      // 后端抽卡只回传 playerId/tier，卡面用占位图展示等级
      loot = { side: won ? 'my' : 'opp', card: { name: won ? '对方球员卡' : '我的球员卡', tier: tier, cardUrl: cardArt(won ? '对方球员卡' : '我的球员卡', tier, '★') } }
    }
    return {
      matchId: d.matchId, role: d.role, result: d.result,
      myGoals: d.score ? d.score.mine : 0, oppGoals: d.score ? d.score.opponent : 0,
      events: events, loot: loot,
      challenger: { name: mine.name }, defender: { name: theirs.name }
    }
  }
  function openMatch(matchId) {
    if (DEMO) {
      var m = state.matches.filter(function (x) { return x.matchId === matchId })[0]
      if (m) showMatchPanel(m)
      return
    }
    api('getGameMatchDetail', { matchId: matchId }).then(function (r) {
      showMatchPanel(adaptMatch(r.match))
    }).catch(function (e) {
      if (e.code === 'PLAYER_CARD_AUTH_REQUIRED') return login()
      alert(e.message || '读取对战详情失败')
    })
  }
  function showMatchPanel(m) {
    var mine = m.challenger, theirs = m.defender
    var stamp = m.result === 'win' ? '<span class="pk-stamp stamp-win">胜</span>' : m.result === 'lose' ? '<span class="pk-stamp stamp-lose">负</span>' : '<span class="pk-stamp stamp-draw">平</span>'
    var myGoals = m.myGoals != null ? m.myGoals : 0, oppGoals = m.oppGoals != null ? m.oppGoals : 0
    var tl = (m.events || []).map(function (e, i) {
      return '<div class="tl-row tl-' + e.side + ' tl-' + e.type + '" style="animation-delay:' + (200 + i * 160) + 'ms">' +
        '<span class="tl-min">' + e.minute + '′</span><span class="tl-ico">' + e.ico + '</span>' +
        '<span class="tl-text">' + esc(e.text) + '</span></div>'
    }).join('')
    // 抽卡战利品区块
    var lootHtml = ''
    if (m.loot && m.loot.card) {
      if (m.loot.side === 'my') {
        lootHtml = '<div class="loot-box"><div class="loot-title">🎁 胜利战利品</div>' +
          '<div class="loot-draw" id="lootDraw"><div class="loot-back">？<small>点击抽取对方一张卡</small></div></div></div>'
      } else {
        lootHtml = '<div class="loot-box"><div class="loot-title">💔 你被对方抽走一张卡</div>' +
          '<div class="loot-lost-row"><img src="' + m.loot.card.cardUrl + '" class="loot-card dim" alt=""><div class="loot-lost-name">' + esc(m.loot.card.name) + ' 被对方收入囊中</div></div></div>'
      }
    }
    var mask = document.createElement('div'); mask.className = 'pk-mask'
    mask.innerHTML = '<div class="pk-panel">' +
      '<div class="pk-clash"><div class="pk-side"><h4>' + esc(mine.name) + '</h4><div class="pts">' + myGoals + '</div></div>' +
      '<div class="pk-vs">VS</div>' +
      '<div class="pk-side right"><h4>' + esc(theirs.name) + '</h4><div class="pts">' + oppGoals + '</div></div></div>' +
      stamp +
      '<div class="tl-head">全场事件 · 90分钟</div>' +
      '<div class="tl-list">' + (tl || '<div class="empty-box">全场沉闷，0 : 0 互交白卷。</div>') + '</div>' +
      lootHtml +
      '<p class="pk-rules">模拟全场比赛：进球、红黄牌、换人由双方战力与临场发挥共同决定。</p>' +
      '<button type="button" class="pk-close">关闭</button></div>'
    mask.onclick = function (e) { if (e.target === mask || e.target.className === 'pk-close') mask.remove() }
    var ld = mask.querySelector('#lootDraw')
    if (ld && m.loot && m.loot.side === 'my') {
      ld.onclick = function () {
        ld.classList.add('revealed')
        ld.innerHTML = '<img src="' + m.loot.card.cardUrl + '" class="loot-card" alt=""><div class="loot-got">抽到「' + esc(m.loot.card.name) + '」' + (TIER_LABEL[m.loot.card.tier] || '') + '，已加入你的持卡池！</div>'
        // 翻到金卡再撒一次金色粒子
        if (m.loot.card.tier === 'gold') fireConfetti(true)
      }
    }
    ;(document.querySelector('.game-root') || document.body).appendChild(mask)
    // 结算胜利撒花
    if (m.result === 'win') fireConfetti(false)
  }

