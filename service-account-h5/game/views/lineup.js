'use strict'
// ---------- 阵容列表、阵容编辑器绘制 ----------
  function renderLineups() {
    var v = view()
    if (DEMO) { drawLineups(); return }
    v.innerHTML = '<div class="game-state">正在读取我的阵容…</div>'
    api('listMyGameLineups').then(function (r) {
      state.lineups = r.rows
      drawLineups()
    }).catch(function (e) { guard(e, renderLineups) })
  }
  function drawLineups() {
    var v = view()
    var rows = state.lineups.map(function (row) {
      return '<div class="lineup-row" data-edit="' + esc(row.lineupId) + '"><div class="lr-main"><h3>' + esc(row.name) + (row.pkEnabled ? '<span class="pk-flag">可挑战</span>' : '') + '</h3>' +
        '<p>' + row.formation.count + ' 人制 · ' + row.filled + ' 人已就位</p></div>' +
        '<div class="lr-points">' + row.totalPoints + '<small>总战力</small></div></div>'
    }).join('')
    var maxLineups = state.home ? state.home.maxLineups : 5
    var canNew = state.lineups.length < maxLineups
    v.innerHTML = '<p class="view-tip">用已送出和已收集的球员卡排布首发阵容；保存时可开启「接受挑战」。</p>' +
      (rows || '<div class="empty-box">还没有阵容，点击下方按钮组建第一套首发。</div>') +
      '<div style="margin-top:14px"><button type="button" class="new-lineup" id="newLineup" ' + (canNew ? '' : 'disabled') + '>＋ 组建新阵容' + (canNew ? '' : '（已达 5 套上限）') + '</button></div>'
    if (!TASKS[2].done) {
      var nb = document.getElementById('newLineup')
      if (nb) nb.classList.add('hl-hint')
    }
    Array.prototype.forEach.call(v.querySelectorAll('[data-edit]'), function (el) {
      el.onclick = function () { openEditor(el.getAttribute('data-edit')) }
    })
    document.getElementById('newLineup').onclick = function () { openEditor('') }
  }
  function openEditor(lineupId) {
    if (DEMO) {
      var lineup = lineupId ? state.lineups.filter(function (l) { return l.lineupId === lineupId })[0] : null
      var count = 5
      var form = FORMATIONS[0].options[0]
      var slots = {}
      form.positions.forEach(function (p) { slots[p.role] = '' })
      if (lineup) {
        lineup.slots.forEach(function (s) { if (s.playerId) slots[s.role] = s.playerId })
      }
      state.editor = {
        lineupId: lineup ? lineup.lineupId : '',
        name: lineup ? lineup.name : '',
        pkEnabled: true,
        count: count, formationId: form.id,
        slots: slots, picking: ''
      }
      drawEditor()
      return
    }
    var v = view()
    v.innerHTML = '<div class="game-state">正在准备阵容编辑器…</div>'
    var jobs = [api('listGameFormations'), loadPool()]
    if (lineupId) jobs.push(api('getMyGameLineup', { lineupId: lineupId }))
    Promise.all(jobs).then(function (results) {
      state.formations = results[0].formations
      state.pool = results[1]
      var lineup = results[2] ? results[2].lineup : null
      var group = state.formations.filter(function (g) { return g.count === (lineup ? lineup.formation.count : 5) })[0] || state.formations[0]
      var form = group.options.filter(function (o) { return lineup && o.id === lineup.formation.id })[0] || group.options[0]
      var slots = {}
      form.positions.forEach(function (p) { slots[p.role] = '' })
      if (lineup) lineup.slots.forEach(function (s) { if (s.playerId) slots[s.role] = s.playerId })
      state.editor = {
        lineupId: lineup ? lineup.lineupId : '',
        expectedVersion: lineup ? lineup.lineupVersion : null,
        name: lineup ? lineup.name : '',
        pkEnabled: lineup ? lineup.pkEnabled === true : true,
        count: group.count, formationId: form.id,
        slots: slots, picking: ''
      }
      drawEditor()
    }).catch(function (e) { guard(e, renderLineups) })
  }
  // 持卡池 = 已送出的我的卡 + 图鉴中 active 的收藏卡（按 playerId 去重）
  function loadPool() {
    return Promise.all([api('getMyGameShares'), api('getMyCollectionCodex')]).then(function (results) {
      var map = {}
      results[0].rows.forEach(function (row) {
        if (!row.shared) return
        map[row.playerId] = normCard({ playerId: row.playerId, name: row.name, tier: row.tier, points: row.points, cardUrl: row.cardUrl, cardStatus: row.cardStatus })
      })
      results[1].rows.forEach(function (row) {
        if (row.status !== 'active' || map[row.playerId]) return
        map[row.playerId] = normCard({ playerId: row.playerId, name: row.name, tier: row.tier, points: row.pointsAtCollect, cardUrl: row.cardUrl, cardStatus: row.cardStatus })
      })
      return Object.keys(map).map(function (k) { return map[k] })
    })
  }
  function currentFormation() {
    var ed = state.editor
    var groups = state.formations || FORMATIONS
    var g = groups.filter(function (f) { return f.count === ed.count })[0] || groups[0]
    return g.options.filter(function (o) { return o.id === ed.formationId })[0] || g.options[0]
  }
  function poolById(pid) { return state.pool.filter(function (p) { return p.playerId === pid })[0] || null }
  function editorTotal() {
    var t = 0
    Object.keys(state.editor.slots).forEach(function (role) {
      var p = poolById(state.editor.slots[role]); if (p) t += p.points
    })
    return t
  }
  function drawEditor() {
    var ed = state.editor, form = currentFormation(), v = view()
    // 重建前保留用户已输入的阵容名和PK开关状态
    var nameInput = document.getElementById('lineupName')
    if (nameInput) ed.name = nameInput.value
    var pkInput = document.getElementById('pkEnabled')
    if (pkInput) ed.pkEnabled = pkInput.checked
    // 按 row 分排：forward 在上、back 在中、keeper 在下
    var rows = {}
    form.positions.forEach(function (pos) {
      var r = pos.row || 'back'
      if (!rows[r]) rows[r] = []
      rows[r].push(pos)
    })
    var pitchRows = ''
    if (rows.forward) pitchRows += '<div class="pitch-row forward">' + rows.forward.map(function (pos) {
      var pid = ed.slots[pos.role] || '', p = pid ? poolById(pid) : null
      return '<div class="slot-wrap">' +
        (p
          ? '<div class="slot-card filled' + (ed.picking === pos.role ? ' picking' : '') + '" data-role="' + esc(pos.role) + '">' +
            '<div class="sc-frame"><img src="' + esc(p.cardUrl) + '" alt="' + esc(p.name) + '"></div>' +
            '<div class="sc-meta"><b>' + esc(p.name) + '</b><span>' + p.points + '分</span></div></div>'
          : '<div class="slot-card empty' + (ed.picking === pos.role ? ' picking' : '') + '" data-role="' + esc(pos.role) + '">' +
            '<div class="sc-frame"><span class="sc-empty">+</span></div>' +
            '<div class="sc-meta"><b>' + esc(pos.label) + '</b><span>点击选择</span></div></div>') +
        '</div>'
    }).join('') + '</div>'
    if (rows.back) pitchRows += '<div class="pitch-row back">' + rows.back.map(function (pos) {
      var pid = ed.slots[pos.role] || '', p = pid ? poolById(pid) : null
      return '<div class="slot-wrap">' +
        (p
          ? '<div class="slot-card filled' + (ed.picking === pos.role ? ' picking' : '') + '" data-role="' + esc(pos.role) + '">' +
            '<div class="sc-frame"><img src="' + esc(p.cardUrl) + '" alt="' + esc(p.name) + '"></div>' +
            '<div class="sc-meta"><b>' + esc(p.name) + '</b><span>' + p.points + '分</span></div></div>'
          : '<div class="slot-card empty' + (ed.picking === pos.role ? ' picking' : '') + '" data-role="' + esc(pos.role) + '">' +
            '<div class="sc-frame"><span class="sc-empty">+</span></div>' +
            '<div class="sc-meta"><b>' + esc(pos.label) + '</b><span>点击选择</span></div></div>') +
        '</div>'
    }).join('') + '</div>'
    if (rows.keeper) pitchRows += '<div class="pitch-row keeper">' + rows.keeper.map(function (pos) {
      var pid = ed.slots[pos.role] || '', p = pid ? poolById(pid) : null
      return '<div class="slot-wrap">' +
        (p
          ? '<div class="slot-card filled' + (ed.picking === pos.role ? ' picking' : '') + '" data-role="' + esc(pos.role) + '">' +
            '<div class="sc-frame"><img src="' + esc(p.cardUrl) + '" alt="' + esc(p.name) + '"></div>' +
            '<div class="sc-meta"><b>' + esc(p.name) + '</b><span>' + p.points + '分</span></div></div>'
          : '<div class="slot-card empty' + (ed.picking === pos.role ? ' picking' : '') + '" data-role="' + esc(pos.role) + '">' +
            '<div class="sc-frame"><span class="sc-empty">+</span></div>' +
            '<div class="sc-meta"><b>' + esc(pos.label) + '</b><span>点击选择</span></div></div>') +
        '</div>'
    }).join('') + '</div>'
    var pitch = '<div class="pitch-rows">' + pitchRows + '</div>'
    var usedIds = {}
    Object.keys(ed.slots).forEach(function (role) { if (ed.slots[role]) usedIds[ed.slots[role]] = true })
    var poolHtml = state.pool.map(function (p) {
      var used = usedIds[p.playerId]
      return '<div class="pool-card' + (used ? ' used' : '') + '" data-pool="' + esc(p.playerId) + '">' +
        '<div class="pc-art">' + (p.cardUrl ? '<img src="' + esc(p.cardUrl) + '" alt="' + esc(p.name) + '">' : '') + '</div>' +
        '<p>' + esc(p.name) + '</p><div class="pc-pts">' + p.points + ' 分</div></div>'
    }).join('') || '<p class="view-tip">暂无可上阵的球员卡：先在「送出」页送出你的卡，或到「图鉴」页收集。</p>'
    // 点槽位后弹出卡片库（居中、横向滑动选择）
    var pickLabel = ''
    if (ed.picking) {
      for (var pi = 0; pi < form.positions.length; pi++) {
        if (form.positions[pi].role === ed.picking) { pickLabel = form.positions[pi].label; break }
      }
    }
    var sheet = ed.picking ?
      '<div class="card-sheet-mask" data-close-sheet></div>' +
      '<div class="card-sheet"><div class="cs-head"><h4>为「<b>' + esc(pickLabel) + '</b>」选择球员卡</h4><button type="button" class="cs-close" data-close-sheet>✕</button></div>' +
      '<div class="sheet-scroll">' + poolHtml + '</div></div>' : ''
    // 保存按钮状态：位置全满 + 已填名字才可保存
    var filledCount = Object.keys(ed.slots).filter(function (r) { return ed.slots[r] }).length
    var saveReady = filledCount >= form.positions.length && ed.name
    var saveHint = saveReady ? '' : '<div id="saveHint" style="width:100%;font-size:11px;color:#d03050;margin-bottom:6px;">' +
      [filledCount < form.positions.length ? '还差 ' + (form.positions.length - filledCount) + ' 个位置' : '', ed.name ? '' : '未填写阵容名'].filter(Boolean).join('，') + '</div>'
    v.innerHTML =
      '<p class="view-tip">点空槽位选择球员卡上阵；点已上阵槽位可换下。</p>' +
      '<div class="pitch">' + pitch + '</div>' +
      sheet +
      '<div class="lineup-name-row"><input id="lineupName" maxlength="20" placeholder="阵容名称（如：周末联赛主力）" value="' + esc(ed.name) + '"></div>' +
      '<label class="pk-toggle"><input type="checkbox" id="pkEnabled"' + (ed.pkEnabled ? ' checked' : '') + '> 接受其他玩家挑战这套阵容</label>' +
      (ed.lineupId ? '<div style="margin-top:10px"><button type="button" class="gc-btn ghost" id="deleteLineup" style="border-color:rgba(255,107,125,.5);color:var(--danger)">删除这套阵容</button></div>' : '') +
      saveHint +
      '<div class="editor-bar"><div class="editor-total"><span>已上阵 ' + filledCount + '/' + form.positions.length + ' 人</span><strong>' + editorTotal() + ' 分</strong></div>' +
      '<div class="editor-actions"><button type="button" class="cancel" id="editorCancel">返回</button><button type="button" class="save" id="editorSave"' + (saveReady ? '' : ' disabled style="opacity:.45;filter:grayscale(.4);cursor:not-allowed;"') + '>保存阵容</button></div></div>'
    bindEditorEvents()
  }

