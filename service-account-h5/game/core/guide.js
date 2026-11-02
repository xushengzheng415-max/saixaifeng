'use strict'
// ---------- 引导角色、任务进度、toast 与撒花 ----------
  function setPose(key) { mascotImg.src = poseImg(key) }
  function guide(key, force) {
    var g = GUIDES[key]
    if (!g) return
    // 已被用户关闭过的引导不再自动弹出；点蜂哥可强制重看
    if (!force && state.dismissedGuides[key]) return
    clearTimeout(state.guideTimer)
    setPose(GUIDE_POSES[key] || 'standard')
    var skipBtn = key === 'allDone' ? '' : '<button type="button" class="bubble-skip">下一步 ▶</button>'
    bubble.innerHTML = '<button type="button" class="bubble-close" title="关闭">✕</button><span class="bubble-step">' + esc(g.step) + '</span>' + g.text + skipBtn
    var sb = bubble.querySelector('.bubble-skip')
    if (sb) sb.onclick = function (e) { e.stopPropagation(); skipTask() }
    var cb = bubble.querySelector('.bubble-close')
    if (cb) cb.onclick = function (e) { e.stopPropagation(); state.dismissedGuides[key] = true; bubble.classList.add('hide') }
    bubble.classList.remove('hide')
    mascot.classList.add('mascot-talk')
    state.guideTimer = setTimeout(function () { mascot.classList.remove('mascot-talk') }, 1200)
  }
  function skipTask() {
    if (state.taskIdx >= TASKS.length) return
    TASKS[state.taskIdx].done = true
    state.taskIdx++
    renderTaskBar()
    if (state.taskIdx < TASKS.length) {
      var nextId = TASKS[state.taskIdx].id
      showToast('进入下一玩法：' + TASKS[state.taskIdx].label)
      // 跳转到下一任务对应的页面（share → 小屋 home）
      state.tab = nextId === 'share' ? 'home' : nextId
      shell()
      setTimeout(function () { guide(nextId, true) }, 500)
    } else {
      guide('allDone', true)
    }
  }
  var GUIDE_POSES = { share: 'welcome', collect: 'collect', lineup: 'lineup', pk: 'pkGo', allDone: 'celebrate', map: 'guide' }
  mascot.onclick = function () { guide(currentTaskKey(), true) }
  function currentTaskKey() {
    if (TASKS.every(function (t) { return t.done })) return 'allDone'
    return TASKS[state.taskIdx].id
  }
  function completeTask() {
    TASKS[state.taskIdx].done = true
    showToast('任务完成：' + TASKS[state.taskIdx].label + ' ✓')
    celebrate()
    state.taskIdx++
    renderTaskBar()
    // 不自动跳页、不自动弹气泡；留给用户自己操作
  }
  // 真实模式：任务完成度由后端数据驱动；celebrateNew=true 时对新完成的任务弹出庆祝
  function syncTasks(celebrateNew) {
    if (DEMO) { renderTaskBar(); return }
    var prev = TASKS.map(function (t) { return t.done })
    var h = state.home || {}
    TASKS[0].done = (h.sharedCount || 0) > 0
    TASKS[1].done = (h.collectedCount || 0) > 0
    TASKS[2].done = (h.lineupCount || 0) > 0
    TASKS[3].done = !!(state.matchesLoaded && state.matches.length)
    var idx = TASKS.length
    for (var i = 0; i < TASKS.length; i++) { if (!TASKS[i].done) { idx = i; break } }
    state.taskIdx = idx
    renderTaskBar()
    if (celebrateNew) {
      TASKS.forEach(function (t, i) {
        if (t.done && !prev[i]) { showToast('任务完成：' + t.label + ' ✓'); celebrate() }
      })
    }
  }
  function refreshHome() {
    if (DEMO) return Promise.resolve()
    return api('getPlayerCardGameHome').then(function (r) { state.home = r.home })
  }
  function showToast(text) {
    var t = document.createElement('div'); t.className = 'task-toast'; t.textContent = text
    document.body.appendChild(t)
    setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(function () { t.remove() }, 400) }, 1800)
  }
  function celebrate() {
    var c = document.createElement('div'); c.className = 'celebrate'
    var colors = ['#4de3c1', '#ffc94d', '#ff6b7d', '#5aa2ff', '#e09a5f']
    for (var i = 0; i < 40; i++) {
      var p = document.createElement('div'); p.className = 'confetti'
      p.style.left = Math.random() * 100 + '%'
      p.style.background = colors[Math.floor(Math.random() * colors.length)]
      p.style.animationDelay = (Math.random() * 0.5) + 's'
      p.style.animationDuration = (1.2 + Math.random() * 0.8) + 's'
      p.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)'
      c.appendChild(p)
    }
    document.body.appendChild(c)
    setTimeout(function () { c.remove() }, 2600)
  }
  function renderTaskBar() {
    taskBar.innerHTML = TASKS.map(function (t, i) {
      var cls = i < state.taskIdx ? 'done' : i === state.taskIdx ? 'active' : ''
      return '<span class="task-chip ' + cls + '"><span class="t-dot"></span>' + (i + 1) + '. ' + esc(t.label) + (t.done ? ' ✓' : '') + '</span>'
    }).join('')
  }

  // ---------- 骨架 ----------
