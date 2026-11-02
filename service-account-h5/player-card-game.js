(function () {
  'use strict'
  var API = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'
  var KEY = 'sxf_fan_h5_session'
  var main = document.getElementById('gameMain')
  var TIER_LABEL = { bronze: '铜卡', silver: '银卡', gold: '金卡' }
  var state = {
    home: null, tab: 'share', epoch: 0,
    shares: null,
    codex: null, hall: { rows: [], after: '', tier: '', done: false, loading: false, loaded: false },
    lineups: null, formations: null, pool: null,
    editor: null,
    opponents: null, matches: null, pickLineupFor: ''
  }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] }) }
  function api(action, data) {
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ action: action, fanSessionToken: localStorage.getItem(KEY) || '' }, data || {})) }).then(function (r) { return r.json() }).then(function (r) {
      r = r && typeof r.body === 'string' ? JSON.parse(r.body) : r
      if (!r.success) {
        var error = new Error(r.error || '操作失败，请重试')
        error.code = r.code || ''
        if (r.code === 'PLAYER_CARD_AUTH_REQUIRED') localStorage.removeItem(KEY)
        throw error
      }
      return r
    })
  }
  function failBox(message, retry) {
    main.className = 'game-state'
    main.innerHTML = '<p>' + esc(message) + '</p>' + (retry ? '<button id="gameRetry" type="button">重新加载</button>' : '')
    var btn = document.getElementById('gameRetry')
    if (btn) btn.onclick = retry
  }
  function login() {
    if (!/MicroMessenger/i.test(navigator.userAgent)) {
      main.className = 'game-state'
      main.innerHTML = '<p>请在微信中打开此页面，授权后即可进入球员卡玩法。</p>'
      return
    }
    main.className = 'game-state'; main.textContent = '正在连接微信…'
    api('fanOAuthUrl', { returnUrl: location.origin + location.pathname }).then(function (r) { location.replace(r.authorizeUrl) }).catch(function (e) { failBox(e.message, login) })
  }
  function guard(error, retry) {
    if (error && error.code === 'PLAYER_CARD_AUTH_REQUIRED') { login(); return true }
    failBox(error && error.message || '网络异常，请重试', retry)
    return true
  }

  // ---------- 骨架 ----------
  function shell() {
    var h = state.home
    main.className = ''
    main.innerHTML =
      '<div class="game-hud"><div class="hud-card">' +
      '<div class="hud-nick">' + esc(h.nickname) + '</div>' +
      '<div class="hud-record">PK 战绩 <b>' + h.wins + ' 胜</b> / ' + h.draws + ' 平 / ' + h.losses + ' 负</div>' +
      '<div class="hud-stats">' +
      '<div><strong>' + h.sharableCount + '</strong><span>可送出</span></div>' +
      '<div><strong>' + h.sharedCount + '</strong><span>已送出</span></div>' +
      '<div><strong>' + h.collectedCount + '</strong><span>已收集</span></div>' +
      '<div><strong>' + h.lineupCount + '/' + h.maxLineups + '</strong><span>阵容</span></div>' +
      '</div></div></div>' +
      '<nav class="game-tabs" aria-label="玩法切换">' +
      tabBtn('share', '送出') + tabBtn('collect', '图鉴') + tabBtn('lineup', '阵容') + tabBtn('pk', '对战') +
      '</nav><div id="gameView" class="game-view"></div>'
    Array.prototype.forEach.call(main.querySelectorAll('[data-tab]'), function (b) {
      b.onclick = function () { state.tab = b.getAttribute('data-tab'); renderTab() }
    })
    renderTab()
  }
  function tabBtn(id, label) { return '<button type="button" data-tab="' + id + '" class="' + (state.tab === id ? 'on' : '') + '">' + label + '</button>' }
  function view() { return document.getElementById('gameView') }
  function renderTab() {
    Array.prototype.forEach.call(main.querySelectorAll('[data-tab]'), function (b) { b.className = b.getAttribute('data-tab') === state.tab ? 'on' : '' })
    if (state.tab === 'share') renderShare()
    else if (state.tab === 'collect') renderCodex()
    else if (state.tab === 'lineup') renderLineups()
    else renderPk()
  }
  function refreshHome() {
    return api('getPlayerCardGameHome').then(function (r) { state.home = r.home })
  }

  // ---------- 卡片渲染 ----------
  function tierBadge(tier) { return tier ? '<span class="gc-tier tier-' + esc(tier) + '">' + esc(TIER_LABEL[tier] || tier) + '</span>' : '' }
  function cardArt(row, extraTop) {
    var inner = row.cardUrl ? '<img src="' + esc(row.cardUrl) + '" alt="' + esc(row.name) + '的球员卡" loading="lazy">' : '<div class="gc-empty">球员卡<br>生成中</div>'
    return '<div class="gc-art" data-flip="' + esc(row.cardUrl || '') + '" data-flip-name="' + esc(row.name) + '">' + inner + tierBadge(row.tier) + (extraTop || '') + '</div>'
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

  // ---------- 视图一：送出球员卡 ----------
  function renderShare() {
    var v = view(); v.innerHTML = '<p class="view-tip">送出 = 授权全平台公开展示并供他人收集，卡片所有权仍归你，可随时收回。送出后可进入阵容与对战。</p><div class="game-state">正在读取我的球员卡…</div>'
    api('getMyGameShares').then(function (r) {
      state.shares = r.rows
      if (!r.rows.length) { v.innerHTML = '<p class="view-tip">送出 = 授权全平台公开展示并供他人收集，卡片所有权仍归你，可随时收回。</p><div class="empty-box">暂无已登记的球员，请先在「我的」完成球员登记。</div>'; return }
      v.innerHTML = '<p class="view-tip">送出 = 授权全平台公开展示并供他人收集，卡片所有权仍归你，可随时收回。送出后可进入阵容与对战。</p>' +
        '<div class="card-grid">' + r.rows.map(function (row) {
          var btn = row.shared
            ? '<button type="button" class="gc-btn ghost" data-revoke="' + esc(row.playerId) + '">收回卡片</button>'
            : '<button type="button" class="gc-btn" data-share="' + esc(row.playerId) + '">送出展示</button>'
          var meta = row.shared ? '<p class="gc-points">' + esc(TIER_LABEL[row.tier] || '等级核定中') + (row.points != null ? ' · ' + row.points + ' 分' : '') + '</p>' : '<p class="gc-points" style="color:var(--dim)">未送出</p>'
          return '<div class="game-card"><div class="gc-frame">' + cardArt(row) +
            '<div class="gc-meta"><h3>' + esc(row.name) + '</h3><p>' + esc([row.teamName, row.jerseyNumber ? row.jerseyNumber + ' 号' : ''].filter(Boolean).join(' · ')) + '</p>' + meta + btn + '</div></div></div>'
        }).join('') + '</div>'
      bindFlip(v)
      Array.prototype.forEach.call(v.querySelectorAll('[data-share]'), function (b) {
        b.onclick = function () {
          b.disabled = true; b.textContent = '送出中…'
          api('publishPlayerCardShare', { playerId: b.getAttribute('data-share') }).then(function () { return refreshHome() }).then(shell).catch(function (e) {
            if (e.code === 'PLAYER_CARD_AUTH_REQUIRED') return login()
            b.disabled = false; b.textContent = '送出展示'; alert(e.message || '送出失败，请重试')
          })
        }
      })
      Array.prototype.forEach.call(v.querySelectorAll('[data-revoke]'), function (b) {
        b.onclick = function () {
          if (!confirm('收回后，已收集这张卡的玩家图鉴会标记为「已收回」，阵容中该卡不再计入战力。确认收回？')) return
          b.disabled = true; b.textContent = '收回中…'
          api('revokePlayerCardShare', { playerId: b.getAttribute('data-revoke') }).then(function () { return refreshHome() }).then(shell).catch(function (e) {
            if (e.code === 'PLAYER_CARD_AUTH_REQUIRED') return login()
            b.disabled = false; b.textContent = '收回卡片'; alert(e.message || '收回失败，请重试')
          })
        }
      })
    }).catch(function (e) { guard(e, renderShare) })
  }

  // ---------- 视图二：收集图鉴 ----------
  function renderCodex() {
    var v = view(); v.innerHTML = '<div class="game-state">正在读取我的图鉴…</div>'
    api('getMyCollectionCodex').then(function (r) {
      state.codex = r
      var s = r.stats
      var head = '<p class="view-tip">图鉴记录你收集的全平台公开球员卡；卡主收回后标记为「已收回」，不再计入阵容战力。</p>' +
        '<div class="hud-stats" style="margin:0 0 14px">' +
        '<div><strong>' + s.total + '</strong><span>累计收集</span></div>' +
        '<div><strong>' + s.bronze + '</strong><span>铜卡</span></div>' +
        '<div><strong>' + s.silver + '</strong><span>银卡</span></div>' +
        '<div><strong>' + s.gold + '</strong><span>金卡</span></div></div>'
      var grid = r.rows.length
        ? '<div class="card-grid">' + r.rows.map(function (row, i) {
            var stale = row.status === 'stale' ? '<span class="gc-stale">已收回</span>' : ''
            return '<div class="game-card" style="animation-delay:' + Math.min(i * 40, 320) + 'ms"><div class="gc-frame">' + cardArt(row, stale) +
              '<div class="gc-meta"><h3>' + esc(row.name) + '</h3><p>' + esc([row.teamName, row.jerseyNumber ? row.jerseyNumber + ' 号' : ''].filter(Boolean).join(' · ')) + '</p>' +
              '<p class="gc-points">' + esc(TIER_LABEL[row.tier] || '') + ' · ' + row.pointsAtCollect + ' 分</p></div></div></div>'
          }).join('') + '</div>'
        : '<div class="empty-box">图鉴还是空的，去下方收集大厅领取第一张卡吧。</div>'
      v.innerHTML = head + grid + '<h3 class="section-title">收集大厅 · 全平台公开卡</h3><div id="hallBox"></div>'
      bindFlip(v)
      renderHall(true)
    }).catch(function (e) { guard(e, renderCodex) })
  }
  function renderHall(reset) {
    var box = document.getElementById('hallBox'); if (!box) return
    var hall = state.hall
    if (reset) { hall.rows = []; hall.after = ''; hall.done = false; hall.loaded = false }
    var filter = '<div class="collect-filter">' +
      ['', 'bronze', 'silver', 'gold'].map(function (t) {
        return '<button type="button" data-tier="' + t + '" class="' + (hall.tier === t ? 'on' : '') + '">' + (t ? TIER_LABEL[t] : '全部') + '</button>'
      }).join('') + '</div>'
    box.innerHTML = filter + '<div id="hallGrid" class="card-grid"></div><div id="hallMore"></div>'
    Array.prototype.forEach.call(box.querySelectorAll('[data-tier]'), function (b) {
      b.onclick = function () {
        state.hall = { rows: [], after: '', tier: b.getAttribute('data-tier'), done: false, loading: false, loaded: false }
        renderHall(false)
      }
    })
    loadHall()
  }
  function loadHall() {
    var hall = state.hall
    if (hall.loading || hall.done) return
    hall.loading = true
    var grid = document.getElementById('hallGrid'), more = document.getElementById('hallMore')
    if (more) more.innerHTML = '<p class="view-tip" style="text-align:center">正在读取…</p>'
    var params = { limit: 20 }
    if (hall.after) params.after = hall.after
    if (hall.tier) params.tier = hall.tier
    api('listCollectiblePlayerCards', params).then(function (r) {
      hall.loading = false
      hall.rows = hall.rows.concat(r.rows)
      hall.after = r.nextAfter || ''
      hall.done = !r.nextAfter || !r.rows.length
      if (!grid) return
      grid.innerHTML = hall.rows.map(function (row, i) {
        var owned = row.collected
          ? '<span class="gc-collected">已收集</span>'
          : '<button type="button" class="gc-btn" data-collect="' + esc(row.shareId) + '">收入图鉴</button>'
        return '<div class="game-card" style="animation-delay:' + Math.min((i % 20) * 30, 300) + 'ms"><div class="gc-frame">' + cardArt(row) +
          '<div class="gc-meta"><h3>' + esc(row.name) + '</h3><p>' + esc([row.teamName, row.jerseyNumber ? row.jerseyNumber + ' 号' : ''].filter(Boolean).join(' · ')) + '</p>' +
          '<p class="gc-points">' + esc(TIER_LABEL[row.tier] || '') + (row.points != null ? ' · ' + row.points + ' 分' : '') + '</p>' + owned + '</div></div></div>'
      }).join('') || '<div class="empty-box" style="grid-column:1/-1">暂时没有可收集的球员卡。</div>'
      bindFlip(grid)
      Array.prototype.forEach.call(grid.querySelectorAll('[data-collect]'), function (b) {
        b.onclick = function () {
          b.disabled = true; b.textContent = '收集…'
          api('collectPlayerCard', { shareId: b.getAttribute('data-collect') }).then(function (r2) {
            var row = hall.rows.filter(function (x) { return x.shareId === b.getAttribute('data-collect') })[0]
            if (row) row.collected = true
            b.outerHTML = '<span class="gc-collected">已收集</span>'
            refreshHome().then(function () {
              var hud = main.querySelector('.hud-stats')
              if (hud && state.home) hud.children[2].firstElementChild.textContent = state.home.collectedCount
            })
          }).catch(function (e) {
            if (e.code === 'PLAYER_CARD_AUTH_REQUIRED') return login()
            b.disabled = false; b.textContent = '收入图鉴'
            alert(e.code === 'PLAYER_CARD_GAME_SHARE_CLOSED' ? '这张卡已被卡主收回，无法收集' : e.message || '收集失败，请重试')
          })
        }
      })
      if (more) more.innerHTML = hall.done
        ? (hall.rows.length ? '<p class="view-tip" style="text-align:center">已到底</p>' : '')
        : '<button type="button" class="load-more" id="hallNext">加载更多</button>'
      var next = document.getElementById('hallNext')
      if (next) next.onclick = loadHall
    }).catch(function (e) {
      hall.loading = false
      if (e.code === 'PLAYER_CARD_AUTH_REQUIRED') return login()
      if (more) more.innerHTML = '<button type="button" class="load-more" id="hallRetry">读取失败，点击重试</button>'
      var retry = document.getElementById('hallRetry')
      if (retry) retry.onclick = loadHall
    })
  }

  // ---------- 视图三：组建阵容 ----------
  function renderLineups() {
    var v = view(); v.innerHTML = '<div class="game-state">正在读取我的阵容…</div>'
    api('listMyGameLineups').then(function (r) {
      state.lineups = r.rows
      var rows = r.rows.map(function (row) {
        return '<div class="lineup-row" data-edit="' + esc(row.lineupId) + '"><div class="lr-main"><h3>' + esc(row.name) + (row.pkEnabled ? '<span class="pk-flag">可挑战</span>' : '') + '</h3>' +
          '<p>' + row.formation.count + ' 人制 · ' + row.filled + ' 人已就位</p></div>' +
          '<div class="lr-points">' + row.totalPoints + '<small>总战力</small></div></div>'
      }).join('')
      var canNew = r.rows.length < (state.home ? state.home.maxLineups : 5)
      v.innerHTML = '<p class="view-tip">用已送出和已收集的球员卡排布首发阵容；保存时可开启「接受挑战」，其他玩家即可向你发起 PK。</p>' +
        (rows || '<div class="empty-box">还没有阵容，点击下方按钮组建第一套首发。</div>') +
        '<div style="margin-top:14px"><button type="button" class="new-lineup" id="newLineup" ' + (canNew ? '' : 'disabled') + '>＋ 组建新阵容' + (canNew ? '' : '（已达 5 套上限）') + '</button></div>'
      Array.prototype.forEach.call(v.querySelectorAll('[data-edit]'), function (rowEl) {
        rowEl.onclick = function () { openEditor(rowEl.getAttribute('data-edit')) }
      })
      document.getElementById('newLineup').onclick = function () { openEditor('') }
    }).catch(function (e) { guard(e, renderLineups) })
  }
  function openEditor(lineupId) {
    var v = view(); v.innerHTML = '<div class="game-state">正在准备阵容编辑器…</div>'
    var jobs = [api('listGameFormations'), state.pool ? Promise.resolve(state.pool) : loadPool()]
    if (lineupId) jobs.push(api('getMyGameLineup', { lineupId: lineupId }))
    Promise.all(jobs).then(function (results) {
      state.formations = results[0].formations
      state.pool = results[1]
      var lineup = results[2] ? results[2].lineup : null
      var count = lineup ? lineup.formation.count : 5
      var form = formationOf(count, lineup ? lineup.formation.id : '')
      if (!form) form = formationOf(count, '')
      var slots = {}
      form.positions.forEach(function (p) { slots[p.role] = '' })
      if (lineup) lineup.slots.forEach(function (s) { if (s.playerId) slots[s.role] = s.playerId })
      state.editor = {
        lineupId: lineup ? lineup.lineupId : '',
        expectedVersion: lineup ? lineup.lineupVersion : null,
        name: lineup ? lineup.name : '',
        pkEnabled: lineup ? lineup.pkEnabled === true : true,
        count: count, formationId: form.id,
        slots: slots, picking: ''
      }
      drawEditor()
    }).catch(function (e) { guard(e, renderLineups) })
  }
  function loadPool() {
    return Promise.all([api('getMyGameShares'), api('getMyCollectionCodex')]).then(function (results) {
      var map = new Map()
      results[0].rows.forEach(function (row) { if (row.shared) map.set(row.playerId, { playerId: row.playerId, name: row.name, tier: row.tier, points: row.points, cardUrl: row.cardUrl, cardStatus: row.cardStatus }) })
      results[1].rows.forEach(function (row) {
        if (row.status !== 'active' || map.has(row.playerId)) return
        map.set(row.playerId, { playerId: row.playerId, name: row.name, tier: row.tier, points: row.pointsAtCollect, cardUrl: row.cardUrl, cardStatus: row.cardStatus })
      })
      return Array.from(map.values())
    })
  }
  function formationOf(count, id) {
    var group = (state.formations || []).filter(function (f) { return f.count === count })[0]
    if (!group) return null
    return group.options.filter(function (o) { return o.id === id })[0] || group.options[0]
  }
  function currentFormation() { return formationOf(state.editor.count, state.editor.formationId) }
  function poolById(playerId) { return (state.pool || []).filter(function (p) { return p.playerId === playerId })[0] || null }
  function editorTotal() {
    var t = 0
    Object.keys(state.editor.slots).forEach(function (role) {
      var p = poolById(state.editor.slots[role]); if (p && p.points != null) t += p.points
    })
    return t
  }
  function drawEditor() {
    var ed = state.editor, form = currentFormation(), v = view()
    var counts = (state.formations || []).map(function (g) { return g.count })
    var pitch = form.positions.map(function (pos) {
      var pid = ed.slots[pos.role] || '', p = pid ? poolById(pid) : null
      var inner = p && p.cardUrl ? '<img src="' + esc(p.cardUrl) + '" alt="' + esc(p.name) + '">' : '<span>' + esc(pos.label || pos.role) + '</span>'
      return '<div class="slot' + (pid ? ' filled' : '') + (ed.picking === pos.role ? ' picking' : '') + '" data-role="' + esc(pos.role) + '" style="left:' + pos.x + '%;top:' + pos.y + '%">' +
        '<div class="slot-circle">' + inner + '</div>' +
        (p ? '<div class="slot-name">' + esc(p.name) + '</div>' : '<div class="slot-label">' + esc(pos.label || pos.role) + '</div>') + '</div>'
    }).join('')
    var usedIds = {}
    Object.keys(ed.slots).forEach(function (role) { if (ed.slots[role]) usedIds[ed.slots[role]] = true })
    var poolHtml = (state.pool || []).map(function (p) {
      var used = usedIds[p.playerId]
      return '<div class="pool-card' + (used ? ' used' : '') + '" data-pool="' + esc(p.playerId) + '">' +
        '<div class="pc-art">' + (p.cardUrl ? '<img src="' + esc(p.cardUrl) + '" alt="' + esc(p.name) + '">' : '') + '</div>' +
        '<p>' + esc(p.name) + '</p><div class="pc-pts">' + (p.points != null ? p.points + ' 分' : '—') + '</div></div>'
    }).join('') || '<p class="view-tip">暂无可上阵的球员卡：先在「送出」页送出你的卡，或到「图鉴」页收集。</p>'
    var options = ((state.formations || []).filter(function (g) { return g.count === ed.count })[0] || { options: [] }).options.map(function (o) {
      return '<button type="button" data-form="' + esc(o.id) + '" class="' + (o.id === ed.formationId ? 'on' : '') + '">' + esc(o.name || o.id) + '</button>'
    }).join('')
    v.innerHTML =
      '<p class="view-tip">点空槽位，再点下方球员卡上阵；点已上阵槽位可换下。底部合计仅为预览，保存时以服务端核定为准。</p>' +
      '<div class="formation-pick">' + counts.map(function (c) {
        return '<button type="button" data-count="' + c + '" class="' + (c === ed.count ? 'on' : '') + '">' + c + ' 人制</button>'
      }).join('') + '</div>' +
      '<div class="formation-pick">' + options + '</div>' +
      '<div class="pitch">' + pitch + '</div>' +
      '<div class="editor-pool"><h4>我的持卡（点击上阵）</h4><div class="pool-scroll">' + poolHtml + '</div></div>' +
      '<div class="lineup-name-row"><input id="lineupName" maxlength="20" placeholder="阵容名称（如：周末联赛主力）" value="' + esc(ed.name) + '"></div>' +
      '<label class="pk-toggle"><input type="checkbox" id="pkEnabled" ' + (ed.pkEnabled ? 'checked' : '') + '> 接受其他玩家挑战这套阵容</label>' +
      (ed.lineupId ? '<div style="margin-top:10px"><button type="button" class="gc-btn ghost" id="deleteLineup" style="border-color:rgba(255,107,125,.5);color:var(--danger)">删除这套阵容</button></div>' : '') +
      '<div class="editor-bar"><div class="editor-total"><span>已上阵 ' + Object.keys(ed.slots).filter(function (r) { return ed.slots[r] }).length + '/' + form.positions.length + ' 人</span><strong id="editorTotal">' + editorTotal() + ' 分</strong></div>' +
      '<div class="editor-actions"><button type="button" class="cancel" id="editorCancel">返回</button><button type="button" class="save" id="editorSave">保存阵容</button></div></div>'
    bindEditorEvents()
  }
  function bindEditorEvents() {
    var ed = state.editor, v = view()
    Array.prototype.forEach.call(v.querySelectorAll('[data-count]'), function (b) {
      b.onclick = function () {
        var c = Number(b.getAttribute('data-count'))
        if (c === ed.count) return
        ed.count = c
        var form = formationOf(c, '')
        ed.formationId = form.id
        ed.slots = {}; form.positions.forEach(function (p) { ed.slots[p.role] = '' })
        ed.picking = ''
        drawEditor()
      }
    })
    Array.prototype.forEach.call(v.querySelectorAll('[data-form]'), function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-form')
        if (id === ed.formationId) return
        var old = ed.slots
        ed.formationId = id
        var form = currentFormation()
        ed.slots = {}
        form.positions.forEach(function (p) { ed.slots[p.role] = old[p.role] || '' })
        ed.picking = ''
        drawEditor()
      }
    })
    Array.prototype.forEach.call(v.querySelectorAll('.slot'), function (s) {
      s.onclick = function () {
        var role = s.getAttribute('data-role')
        if (ed.slots[role]) { ed.slots[role] = ''; ed.picking = role; drawEditor(); return }
        ed.picking = ed.picking === role ? '' : role
        drawEditor()
      }
    })
    Array.prototype.forEach.call(v.querySelectorAll('[data-pool]'), function (card) {
      card.onclick = function () {
        if (card.className.indexOf('used') >= 0) return
        var pid = card.getAttribute('data-pool')
        var role = ed.picking && !ed.slots[ed.picking] ? ed.picking : ''
        if (!role) {
          var form = currentFormation()
          for (var i = 0; i < form.positions.length; i++) { if (!ed.slots[form.positions[i].role]) { role = form.positions[i].role; break } }
        }
        if (!role) return
        ed.slots[role] = pid
        ed.picking = ''
        drawEditor()
      }
    })
    document.getElementById('editorCancel').onclick = function () { state.editor = null; renderLineups() }
    document.getElementById('editorSave').onclick = function () {
      var name = (document.getElementById('lineupName').value || '').trim()
      if (!name) { alert('请填写阵容名称'); return }
      var form = currentFormation()
      var slots = form.positions.map(function (p) { return { role: p.role, playerId: ed.slots[p.role] || '' } })
      if (slots.some(function (s) { return !s.playerId })) { alert('首发还没有排满，请把每个位置都安排上球员'); return }
      var btn = document.getElementById('editorSave')
      btn.disabled = true; btn.textContent = '保存中…'
      var payload = {
        name: name, formation: { count: ed.count, id: ed.formationId }, slots: slots,
        pkEnabled: document.getElementById('pkEnabled').checked
      }
      if (ed.lineupId) { payload.lineupId = ed.lineupId; payload.expectedVersion = ed.expectedVersion }
      api('saveGameLineup', payload).then(function () {
        state.editor = null; state.pool = null
        refreshHome().then(shell).then(function () { state.tab = 'lineup'; renderTab() })
      }).catch(function (e) {
        btn.disabled = false; btn.textContent = '保存阵容'
        if (e.code === 'PLAYER_CARD_AUTH_REQUIRED') return login()
        if (e.code === 'PLAYER_CARD_GAME_LINEUP_CONFLICT') { alert('这套阵容已在别处更新，请返回后重新打开'); return }
        alert(e.message || '保存失败，请重试')
      })
    }
    var del = document.getElementById('deleteLineup')
    if (del) del.onclick = function () {
      if (!confirm('删除后不可恢复，确认删除这套阵容？')) return
      api('deleteGameLineup', { lineupId: ed.lineupId }).then(function () {
        state.editor = null
        refreshHome().then(shell).then(function () { state.tab = 'lineup'; renderTab() })
      }).catch(function (e) {
        if (e.code === 'PLAYER_CARD_AUTH_REQUIRED') return login()
        alert(e.message || '删除失败，请重试')
      })
    }
  }

  // ---------- 视图四：阵容 PK ----------
  function renderPk() {
    var v = view(); v.innerHTML = '<div class="game-state">正在读取对战数据…</div>'
    Promise.all([api('listGameOpponents'), api('listMyGameMatches')]).then(function (results) {
      state.opponents = results[0].rows; state.matches = results[1].rows
      var h = state.home || { wins: 0, draws: 0, losses: 0 }
      var record = '<div class="pk-record"><div class="w"><strong>' + h.wins + '</strong><span>胜</span></div><div class="d"><strong>' + h.draws + '</strong><span>平</span></div><div class="l"><strong>' + h.losses + '</strong><span>负</span></div></div>'
      var opponents = state.opponents.length ? state.opponents.map(function (row) {
        var picker = state.pickLineupFor === row.lineupId
          ? '<div style="margin-top:8px">' + (state.lineups || []).filter(function (l) { return true }).map(function (l) {
              return '<button type="button" class="gc-btn" style="margin:0 8px 8px 0;width:auto;padding:8px 14px" data-use-lineup="' + esc(l.lineupId) + '" data-vs="' + esc(row.lineupId) + '">' + esc(l.name) + '（' + l.totalPoints + '）</button>'
            }).join('') + '<button type="button" class="gc-btn ghost" style="width:auto;padding:8px 14px" data-cancel-pick>取消</button></div>'
          : ''
        return '<div class="lineup-row" style="flex-wrap:wrap"><div class="lr-main"><h3>' + esc(row.name) + '</h3>' +
          '<p>' + esc(row.ownerNickname) + ' · ' + row.formation.count + ' 人制</p></div>' +
          '<div class="lr-points">???<small>战力保密</small></div>' +
          '<button type="button" class="challenge-btn" data-challenge="' + esc(row.lineupId) + '">挑战</button>' + picker + '</div>'
      }).join('') : '<div class="empty-box">暂时没有其他玩家开启挑战，等对手出现后来这里发起 PK。</div>'
      var matches = state.matches.length ? state.matches.map(function (row) {
        var badge = row.result === 'win' ? '<span class="match-badge mb-win">胜</span>' : row.result === 'lose' ? '<span class="match-badge mb-lose">负</span>' : '<span class="match-badge mb-draw">平</span>'
        return '<div class="match-row" data-match="' + esc(row.matchId) + '">' + badge +
          '<div class="mr-main"><h4>' + esc(row.role === 'challenger' ? '挑战 ' : '迎战 ') + esc(row.opponentNickname) + '</h4>' +
          '<p>' + esc(row.myLineupName) + ' vs ' + esc(row.opponentLineupName) + '</p></div>' +
          '<span class="match-score">' + (row.score ? row.score.mine + ' : ' + row.score.opponent : row.myPoints + ' : ' + row.opponentPoints) + '</span></div>'
      }).join('') : '<div class="empty-box">还没有对战记录。</div>'
      v.innerHTML = '<p class="view-tip">PK 为异步对战：用你已保存的阵容挑战他人开启挑战的阵容，战力由服务端按球员卡实时等级与积分重新核算。同一阵容每天对同一对手限挑战一次。</p>' +
        record +
        '<h3 class="section-title">可挑战的对手</h3>' + opponents +
        '<h3 class="section-title">我的战绩</h3>' + matches
      bindPkEvents(v)
    }).catch(function (e) { guard(e, renderPk) })
  }
  function bindPkEvents(v) {
    Array.prototype.forEach.call(v.querySelectorAll('[data-challenge]'), function (b) {
      b.onclick = function () {
        var defenderId = b.getAttribute('data-challenge')
        if (!state.lineups) {
          b.disabled = true
          api('listMyGameLineups').then(function (r) {
            b.disabled = false
            state.lineups = r.rows
            if (!r.rows.length) { alert('请先在「阵容」页保存一套满编阵容'); return }
            if (r.rows.length === 1) return doChallenge(r.rows[0].lineupId, defenderId, b)
            state.pickLineupFor = defenderId; renderPk()
          }).catch(function (e) { b.disabled = false; if (e.code === 'PLAYER_CARD_AUTH_REQUIRED') return login(); alert(e.message || '读取失败') })
          return
        }
        if (!state.lineups.length) { alert('请先在「阵容」页保存一套满编阵容'); return }
        if (state.lineups.length === 1) { doChallenge(state.lineups[0].lineupId, defenderId, b); return }
        state.pickLineupFor = state.pickLineupFor === defenderId ? '' : defenderId
        renderPk()
      }
    })
    Array.prototype.forEach.call(v.querySelectorAll('[data-use-lineup]'), function (b) {
      b.onclick = function () { doChallenge(b.getAttribute('data-use-lineup'), b.getAttribute('data-vs'), b) }
    })
    Array.prototype.forEach.call(v.querySelectorAll('[data-cancel-pick]'), function (b) {
      b.onclick = function () { state.pickLineupFor = ''; renderPk() }
    })
    Array.prototype.forEach.call(v.querySelectorAll('[data-match]'), function (row) {
      row.onclick = function () { openMatch(row.getAttribute('data-match')) }
    })
  }
  function doChallenge(lineupId, defenderLineupId, btn) {
    btn.disabled = true; btn.textContent = '对决中…'
    state.pickLineupFor = ''
    api('challengeGameLineup', { lineupId: lineupId, defenderLineupId: defenderLineupId }).then(function (r) {
      refreshHome().then(function () {
        renderPk()
        if (r.match && r.match._id) openMatch(r.match._id)
      })
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = '挑战'
      if (e.code === 'PLAYER_CARD_AUTH_REQUIRED') return login()
      alert(e.message || '挑战失败，请重试')
    })
  }
  function openMatch(matchId) {
    api('getGameMatchDetail', { matchId: matchId }).then(function (r) {
      var m = r.match
      var meChallenger = m.role === 'challenger'
      var mine = meChallenger ? m.challenger : m.defender
      var theirs = meChallenger ? m.defender : m.challenger
      var stamp = m.result === 'win' ? '<span class="pk-stamp stamp-win">胜</span>' : m.result === 'lose' ? '<span class="pk-stamp stamp-lose">负</span>' : '<span class="pk-stamp stamp-draw">平</span>'
      // 新版后端返回真实比分 + 90 分钟事件流 + 输赢抽卡结果；旧战绩回退为战力展示
      var clashPts = m.score
        ? '<div class="pts">' + m.score.mine + ' : ' + m.score.opponent + '</div>'
        : '<div class="pts">' + mine.totalPoints + '</div>'
      var clashPtsRight = m.score ? '' : '<div class="pts">' + theirs.totalPoints + '</div>'
      var eventIcons = { goal: '⚽', yellow: '🟨', red: '🟥', sub: '🔄' }
      var events = m.score && Array.isArray(m.events) && m.events.length
        ? '<div class="pk-events">' + m.events.map(function (ev) {
            var mineEvent = meChallenger ? ev.side === 'challenger' : ev.side === 'defender'
            return '<div class="pk-ev' + (mineEvent ? ' mine' : '') + '"><b>' + ev.minute + '&prime;</b>' + (eventIcons[ev.type] || '•') + '<span>' + esc(ev.player) + '</span></div>'
          }).join('') + '</div>'
        : ''
      var steal = m.steal
        ? '<p class="pk-steal">' + (m.steal.direction === 'won' ? '🎁 你抽走了对方一张卡！' : m.steal.direction === 'lost' ? '💔 你被对方抽走一张卡' : '') + '</p>'
        : ''
      function slotCol(side) {
        return '<div class="ps-col"><h5>' + esc(side.name) + ' · ' + side.formation.count + ' 人制</h5>' +
          side.slots.map(function (s) {
            return '<div class="ps-row' + (s.counted ? '' : ' dim') + '"><span>' + esc(s.name) + '</span><b>' + (s.counted ? s.points : '不计') + '</b></div>'
          }).join('') + '</div>'
      }
      var mask = document.createElement('div'); mask.className = 'pk-mask'
      mask.innerHTML = '<div class="pk-panel">' +
        '<div class="pk-clash"><div class="pk-side"><h4>' + esc(mine.name) + '</h4>' + clashPts + '</div>' +
        '<div class="pk-vs">VS</div>' +
        '<div class="pk-side right"><h4>' + esc(theirs.name) + '</h4>' + clashPtsRight + '</div></div>' +
        stamp + steal + events +
        '<div class="pk-slots">' + slotCol(mine) + slotCol(theirs) + '</div>' +
        '<p class="pk-rules">战力按挑战时刻服务端核定的球员卡积分实时重算；已收回 / 未就绪的卡不计分。赢家抽走输家一张已收集的卡。</p>' +
        '<button type="button" class="pk-close">关闭</button></div>'
      mask.onclick = function (e) { if (e.target === mask || e.target.className === 'pk-close') mask.remove() }
      document.body.appendChild(mask)
    }).catch(function (e) {
      if (e.code === 'PLAYER_CARD_AUTH_REQUIRED') return login()
      alert(e.message || '读取对战详情失败')
    })
  }

  // ---------- 启动 ----------
  main.className = 'game-state'; main.textContent = '正在进入球员卡玩法…'
  refreshHome().then(shell).catch(function (e) {
    if (e && e.code === 'PLAYER_CARD_AUTH_REQUIRED') { login(); return }
    failBox(e && e.message || '网络异常，请重试', function () { location.reload() })
  })
})()
