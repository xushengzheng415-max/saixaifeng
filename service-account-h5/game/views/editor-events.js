'use strict'
// ---------- 编辑器与选卡弹层事件绑定 ----------
  function bindEditorEvents() {
    var ed = state.editor, v = view()
    Array.prototype.forEach.call(v.querySelectorAll('.slot-card'), function (s) {
      s.onclick = function () {
        var role = s.getAttribute('data-role')
        if (ed.slots[role]) { ed.slots[role] = ''; ed.picking = role; drawEditor(); return }
        ed.picking = ed.picking === role ? '' : role
        drawEditor()
      }
    })
    // 关闭卡片库弹层
    Array.prototype.forEach.call(v.querySelectorAll('[data-close-sheet]'), function (el) {
      el.onclick = function () { ed.picking = ''; drawEditor() }
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
    var nameInput = document.getElementById('lineupName')
    if (nameInput) {
      nameInput.oninput = function () {
        ed.name = nameInput.value
        var saveBtn = document.getElementById('editorSave')
        var hintEl = document.getElementById('saveHint')
        var fc = Object.keys(ed.slots).filter(function (r) { return ed.slots[r] }).length
        var form = currentFormation()
        var ready = fc >= form.positions.length && ed.name
        if (saveBtn) {
          if (ready) { saveBtn.removeAttribute('disabled'); saveBtn.style.opacity = ''; saveBtn.style.filter = ''; saveBtn.style.cursor = '' }
          else { saveBtn.setAttribute('disabled', ''); saveBtn.style.opacity = '.45'; saveBtn.style.filter = 'grayscale(.4)'; saveBtn.style.cursor = 'not-allowed' }
        }
        if (hintEl) {
          var parts = []
          if (fc < form.positions.length) parts.push('还差 ' + (form.positions.length - fc) + ' 个位置')
          if (!ed.name) parts.push('未填写阵容名')
          hintEl.textContent = parts.join('，')
          hintEl.style.display = parts.length ? '' : 'none'
        }
      }
    }
    document.getElementById('editorCancel').onclick = function () { state.editor = null; renderLineups() }
    document.getElementById('editorSave').onclick = function () {
      var name = (document.getElementById('lineupName').value || '').trim()
      if (!name) { alert('请填写阵容名称'); return }
      var form = currentFormation()
      var slots = form.positions.map(function (p) { return { role: p.role, playerId: ed.slots[p.role] || '' } })
      if (slots.some(function (s) { return !s.playerId })) { alert('首发还没有排满，请把每个位置都安排上球员'); return }
      if (DEMO) {
        var total = editorTotal()
        var lid = ed.lineupId || 'L' + Date.now()
        if (ed.lineupId) {
          var old = state.lineups.filter(function (l) { return l.lineupId === lid })[0]
          old.name = name; old.slots = slots; old.filled = slots.length; old.totalPoints = total
        } else {
          state.lineups.push({ lineupId: lid, name: name, formation: { count: 5, id: '2-2' }, slots: slots, filled: slots.length, totalPoints: total, pkEnabled: true, lineupVersion: 1 })
        }
        state.editor = null
        state.tab = 'lineup' // 显式留在阵容页，防止任何隐含跳转
        shell()
        if (!TASKS[2].done) completeTask()
        return
      }
      var btn = document.getElementById('editorSave')
      btn.disabled = true; btn.textContent = '保存中…'
      var payload = {
        name: name, formation: { count: ed.count, id: ed.formationId }, slots: slots,
        pkEnabled: document.getElementById('pkEnabled').checked
      }
      if (ed.lineupId) { payload.lineupId = ed.lineupId; payload.expectedVersion = ed.expectedVersion }
      api('saveGameLineup', payload).then(function () {
        state.editor = null
        return refreshHome()
      }).then(function () {
        syncTasks(true)
        state.tab = 'lineup'
        shell()
      }).catch(function (e) {
        btn.disabled = false; btn.textContent = '保存阵容'
        if (e.code === 'PLAYER_CARD_AUTH_REQUIRED') return login()
        if (e.code === 'PLAYER_CARD_GAME_LINEUP_CONFLICT') { alert('这套阵容已在别处更新，请返回后重新打开'); return }
        alert(e.message || '保存失败，请重试')
      })
    }
    var del = document.getElementById('deleteLineup')
    if (del) del.onclick = function () {
      if (!confirm('确认删除这套阵容？')) return
      if (DEMO) {
        state.lineups = state.lineups.filter(function (l) { return l.lineupId !== ed.lineupId })
        state.editor = null; shell()
        return
      }
      api('deleteGameLineup', { lineupId: ed.lineupId }).then(function () {
        state.editor = null
        return refreshHome()
      }).then(function () {
        syncTasks(true)
        state.tab = 'lineup'
        shell()
      }).catch(function (e) {
        if (e.code === 'PLAYER_CARD_AUTH_REQUIRED') return login()
        alert(e.message || '删除失败，请重试')
      })
    }
  }

  // ---------- 任务4：阵容 PK ----------
