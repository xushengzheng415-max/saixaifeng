'use strict'
// ---------- 首页、升级、制卡台、送出球员卡 ----------
  function renderHome() {
    var v = view()
    var rooms = [
      { tab: 'share', icon: '🎁', title: '送出展示', desc: '授权公开你的球员卡，让全平台收集', task: 0 },
      { tab: 'upgrade', icon: '⭐', title: '升级球员卡', desc: '用比赛积分提升卡的等级', task: -1 },
      { tab: 'studio', icon: '🎨', title: '制卡工坊', desc: '给球员卡换上喜欢的背景', task: -1 }
    ]
    v.innerHTML = homeHeader('') +
      '<p class="view-tip">小屋里能打理你所有的球员卡，选一间房开始吧。</p>' +
      '<div class="home-rooms">' + rooms.map(function (r) {
        var hl = r.task === 0 && !TASKS[0].done ? ' hl-hint' : ''
        return '<button type="button" class="home-room' + hl + '" data-room="' + r.tab + '">' +
          '<span class="room-icon">' + r.icon + '</span>' +
          '<span class="room-title">' + r.title + '</span>' +
          '<span class="room-desc">' + r.desc + '</span></button>'
      }).join('') + '</div>'
    Array.prototype.forEach.call(v.querySelectorAll('[data-room]'), function (b) {
      b.onclick = function () { state.tab = b.getAttribute('data-room'); renderTab() }
    })
    // 小屋场景引导（任务0未完成时才提示）
    if (!TASKS[0].done) guide('home')
  }
  // 真实模式：升级/制卡房间依赖我的球员卡列表，未加载时先拉取
  function ensureShares(then) {
    if (DEMO || state.sharesLoaded) { then(); return }
    var v = view()
    v.innerHTML = '<div class="game-state">正在读取我的球员卡…</div>'
    api('getMyGameShares').then(function (r) {
      state.shares = r.rows.map(normCard)
      state.sharesLoaded = true
      then()
    }).catch(function (e) { guard(e, function () { ensureShares(then) }) })
  }
  // ---------- 房间：升级球员卡 ----------
  var TIER_NEXT = { bronze: { to: 'silver', at: 55 }, silver: { to: 'gold', at: 85 } }
  function renderUpgrade() {
    ensureShares(function () { drawUpgrade() })
  }
  function drawUpgrade() {
    var v = view()
    v.innerHTML = homeHeader('⭐ 升级球员卡') +
      '<p class="view-tip">每点一次「训练 +10 分」模拟一场比赛获得的积分，积分够了自动升档。</p>' +
      (state.shares.map(function (row, i) {
        var next = TIER_NEXT[row.tier]
        var pct = next ? Math.min(100, Math.round(row.points / next.at * 100)) : 100
        var status = next
          ? '<div class="upg-bar"><i style="width:' + pct + '%"></i></div><p class="upg-tip">' + row.points + ' / ' + next.at + ' 分，距 ' + TIER_LABEL[next.to] + ' 还差 ' + Math.max(0, next.at - row.points) + ' 分</p>'
          : '<p class="upg-tip" style="color:var(--gold)">已是最高档 · ' + row.points + ' 分</p>'
        var btn = next ? '<button type="button" class="gc-btn" data-train="' + row.playerId + '">训练 +10 分</button>' : ''
        return '<div class="upg-row" style="animation-delay:' + (i * 60) + 'ms"><img class="upg-thumb" src="' + esc(row.cardUrl) + '" alt="' + esc(row.name) + '">' +
          '<div class="upg-main"><h4>' + esc(row.name) + tierBadge(row.tier) + '</h4>' + status + '</div>' + btn + '</div>'
      }).join('') || '<div class="empty-box">暂无球员卡。</div>')
    bindHomeBack()
    Array.prototype.forEach.call(v.querySelectorAll('[data-train]'), function (b) {
      b.onclick = function () {
        var row = state.shares.filter(function (s) { return s.playerId === b.getAttribute('data-train') })[0]
        var before = row.tier
        row.points += 10
        var next = TIER_NEXT[before]
        if (next && row.points >= next.at) {
          row.tier = next.to
          row.cardUrl = cardArt(row.name, row.tier, row.jerseyNumber, row.bg)
          state.pool.forEach(function (p) { if (p.playerId === row.playerId) { p.tier = row.tier; p.points = row.points; p.cardUrl = row.cardUrl } })
          celebrate()
          showToast('🎉 ' + row.name + ' 升级为' + TIER_LABEL[row.tier] + '！')
        }
        state.pool.forEach(function (p) { if (p.playerId === row.playerId) p.points = row.points })
        drawUpgrade()
      }
    })
  }
  // ---------- 房间：制卡工坊（换背景） ----------
  function renderStudio() {
    ensureShares(function () { drawStudio() })
  }
  function drawStudio() {
    var v = view()
    if (!state.shares.length) { v.innerHTML = homeHeader('🎨 制卡工坊') + '<div class="empty-box">暂无球员卡。</div>'; bindHomeBack(); return }
    var sel = state.studioPlayer || state.shares[0].playerId
    var row = state.shares.filter(function (s) { return s.playerId === sel })[0] || state.shares[0]
    state.studioPlayer = row.playerId
    v.innerHTML = homeHeader('🎨 制卡工坊') +
      '<p class="view-tip">选一个球员，再给卡面挑一款背景，点「完成制卡」保存。</p>' +
      '<div class="studio-pick">' + state.shares.map(function (s) {
        return '<button type="button" class="studio-pick-btn' + (s.playerId === row.playerId ? ' on' : '') + '" data-pick="' + s.playerId + '">' + esc(s.name) + '</button>'
      }).join('') + '</div>' +
      '<div class="studio-stage"><div class="studio-card" id="studioCard"><img src="' + esc(row.cardUrl) + '" alt="' + esc(row.name) + '的球员卡"></div>' +
      '<div class="studio-bgs">' + Object.keys(CARD_BGS).map(function (key) {
        var bg = CARD_BGS[key]
        return '<button type="button" class="bg-swatch' + (row.bg === key ? ' on' : '') + '" data-bg="' + key + '" style="background:linear-gradient(135deg,' + bg.a + ',' + bg.b + ')"><span>' + bg.label + '</span></button>'
      }).join('') + '</div></div>' +
      '<button type="button" class="gc-btn" id="studioDone" style="margin-top:14px">完成制卡</button>'
    bindHomeBack()
    Array.prototype.forEach.call(v.querySelectorAll('[data-pick]'), function (b) {
      b.onclick = function () { state.studioPlayer = b.getAttribute('data-pick'); drawStudio() }
    })
    Array.prototype.forEach.call(v.querySelectorAll('[data-bg]'), function (b) {
      b.onclick = function () {
        row.bg = b.getAttribute('data-bg')
        row.cardUrl = cardArt(row.name, row.tier, row.jerseyNumber, row.bg)
        var img = document.querySelector('#studioCard img')
        if (img) img.src = row.cardUrl
        Array.prototype.forEach.call(v.querySelectorAll('.bg-swatch'), function (s) { s.className = 'bg-swatch' + (s.getAttribute('data-bg') === row.bg ? ' on' : '') })
      }
    })
    document.getElementById('studioDone').onclick = function () {
      state.pool.forEach(function (p) { if (p.playerId === row.playerId) p.cardUrl = row.cardUrl })
      showToast('🎨 ' + row.name + ' 的新卡面已保存！')
      state.tab = 'home'; renderTab()
    }
  }

  // ---------- 卡片渲染 ----------
  function tierBadge(tier) { return tier ? '<span class="gc-tier tier-' + esc(tier) + '">' + esc(TIER_LABEL[tier] || tier) + '</span>' : '' }
  function cardArtTag(row, extraTop) {
    var inner = '<img src="' + esc(row.cardUrl) + '" alt="' + esc(row.name) + '的球员卡">'
    return '<div class="gc-art" data-flip="' + esc(row.cardUrl) + '" data-flip-name="' + esc(row.name) + '">' + inner + tierBadge(row.tier) + (extraTop || '') + '</div>'
  }
  function bindFlip(container) {
    Array.prototype.forEach.call(container.querySelectorAll('[data-flip]'), function (art) {
      art.onclick = function () {
        var url = art.getAttribute('data-flip'); if (!url) return
        var mask = document.createElement('div'); mask.className = 'flip-mask'
        mask.innerHTML = '<div class="flip-card"><img src="' + esc(url) + '" alt="' + esc(art.getAttribute('data-flip-name')) + '的球员卡"></div>'
        mask.onclick = function () { mask.remove() }
        document.body.appendChild(mask)
      }
    })
  }

  // ---------- 任务1：送出球员卡 ----------
  function renderShare() {
    var v = view()
    if (!DEMO && !state.sharesLoaded) {
      v.innerHTML = '<p class="view-tip">送出 = 授权全平台公开展示并供他人收集，卡片所有权仍归你，可随时收回。</p><div class="game-state">正在读取我的球员卡…</div>'
      api('getMyGameShares').then(function (r) {
        state.shares = r.rows.map(normCard)
        state.sharesLoaded = true
        renderShare()
      }).catch(function (e) { guard(e, renderShare) })
      return
    }
    if (!state.shares.length) {
      v.innerHTML = '<p class="view-tip">送出 = 授权全平台公开展示并供他人收集，卡片所有权仍归你，可随时收回。</p><div class="empty-box">暂无已登记的球员，请先在「我的」完成球员登记。</div>'
      return
    }
    v.innerHTML = '<p class="view-tip">送出 = 授权全平台公开展示并供他人收集，卡片所有权仍归你，可随时收回。</p>' +
      '<div class="card-grid">' + state.shares.map(function (row) {
        var btn = row.shared
          ? '<button type="button" class="gc-btn ghost" data-revoke="' + esc(row.playerId) + '">收回卡片</button>'
          : '<button type="button" class="gc-btn" data-share="' + esc(row.playerId) + '">送出展示</button>'
        var meta = row.shared ? '<p class="gc-points">' + esc(TIER_LABEL[row.tier]) + ' · ' + row.points + ' 分</p>' : '<p class="gc-points" style="color:var(--dim)">未送出</p>'
        return '<div class="game-card"><div class="gc-frame">' + cardArtTag(row) +
          '<div class="gc-meta"><h3>' + esc(row.name) + '</h3><p>' + esc([row.teamName, row.jerseyNumber + ' 号'].join(' · ')) + '</p>' + meta + btn + '</div></div></div>'
      }).join('') + '</div>'
    bindFlip(v)
    // 任务指引高亮第一张未送出的卡
    if (!TASKS[0].done) {
      var firstShare = v.querySelector('[data-share]')
      if (firstShare) firstShare.classList.add('hl-hint')
      guide('share')
    }
    Array.prototype.forEach.call(v.querySelectorAll('[data-share]'), function (b) {
      b.onclick = function () {
        var pid = b.getAttribute('data-share')
        if (DEMO) {
          var row = state.shares.filter(function (s) { return s.playerId === pid })[0]
          row.shared = true; row.shareId = 's_' + pid
          b.classList.remove('hl-hint')
          // 加入持卡池
          if (!state.pool.some(function (p) { return p.playerId === pid })) {
            state.pool.push({ playerId: row.playerId, name: row.name, tier: row.tier, points: row.points, cardUrl: row.cardUrl })
          }
          shell()
          if (!TASKS[0].done) completeTask()
          else guide('share')
          return
        }
        b.disabled = true; b.textContent = '送出中…'
        api('publishPlayerCardShare', { playerId: pid }).then(function () {
          state.sharesLoaded = false
          return refreshHome()
        }).then(function () {
          syncTasks(true)
          shell()
        }).catch(function (e) {
          if (e.code === 'PLAYER_CARD_AUTH_REQUIRED') return login()
          b.disabled = false; b.textContent = '送出展示'; alert(e.message || '送出失败，请重试')
        })
      }
    })
    Array.prototype.forEach.call(v.querySelectorAll('[data-revoke]'), function (b) {
      b.onclick = function () {
        var pid = b.getAttribute('data-revoke')
        if (DEMO) {
          var row = state.shares.filter(function (s) { return s.playerId === pid })[0]
          row.shared = false; row.shareId = ''
          state.pool = state.pool.filter(function (p) { return p.playerId !== pid })
          shell()
          return
        }
        if (!confirm('收回后，已收集这张卡的玩家图鉴会标记为「已收回」，阵容中该卡不再计入战力。确认收回？')) return
        b.disabled = true; b.textContent = '收回中…'
        api('revokePlayerCardShare', { playerId: pid }).then(function () {
          state.sharesLoaded = false
          return refreshHome()
        }).then(function () {
          syncTasks(true)
          shell()
        }).catch(function (e) {
          if (e.code === 'PLAYER_CARD_AUTH_REQUIRED') return login()
          b.disabled = false; b.textContent = '收回卡片'; alert(e.message || '收回失败，请重试')
        })
      }
    })
  }

  // ---------- 任务2：收集图鉴 ----------
