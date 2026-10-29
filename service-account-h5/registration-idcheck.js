// 身份证前置核验（2026-10-29 用户要求）：填满 18 位就先查本队是否已有同身份证档案，
// 有重复立刻提示并拦住提交，不让用户填完整张表、生成完球员卡才被提交打回。
// 独立装饰脚本：不改 service-entry.js，靠 MutationObserver 绑定渲染出来的 #idCard，
// 只用服务号登记会话令牌调 webLoginApi 的 serviceEntryCheckPlayerId（会话鉴权在云函数侧完成）。
(function () {
  'use strict'
  if (window.SXF_REGISTRATION_IDCHECK_BOUND) return
  window.SXF_REGISTRATION_IDCHECK_BOUND = true

  var apiUrl = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'
  var content = document.getElementById('content')
  if (!content) return
  var query = new URLSearchParams(location.search)
  var entry = query.get('entry') || ''
  var key = 'sxf_entry_session_' + entry

  function readSession(storage) { try { return storage.getItem(key) || '' } catch (error) { return '' } }
  // 与 service-entry.js 同一取令牌口径：先 sessionStorage，再取 localStorage 里未过期的副本。
  function session() {
    var token = readSession(sessionStorage)
    if (token) return token
    try {
      var saved = JSON.parse(readSession(localStorage) || 'null')
      if (saved && saved.expiresAt > Date.now()) return saved.token || ''
    } catch (error) {}
    return ''
  }
  function post(action, data) {
    return fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action: action }, data || {}))
    }).then(function (response) { return response.json() }).then(function (response) {
      var result = response && typeof response.body === 'string' ? JSON.parse(response.body) : response
      if (!result || !result.success) {
        var message = result && (result.error || result.message) || '服务暂不可用'
        var error = new Error(message)
        error.code = result && result.code
        throw error
      }
      return result
    })
  }

  // 与后端 idDetails 同一口径：18 位、出生日期合法、校验位正确。格式问题交给页面的提示，
  // 这里只在完全合法时发起核验，避免每敲一位就打一次接口。
  function validIdentity(value) {
    if (!/^\d{17}[\dX]$/.test(value)) return false
    var birth = value.slice(6, 10) + '-' + value.slice(10, 12) + '-' + value.slice(12, 14)
    var date = new Date(birth + 'T00:00:00+08:00')
    if (!isFinite(+date) || +date > Date.now() || Number(value.slice(6, 10)) < 1900) return false
    var weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2], sum = 0
    for (var index = 0; index < 17; index += 1) sum += Number(value[index]) * weights[index]
    return '10X98765432'[sum % 11] === value[17]
  }

  var input = null, box = null, action = null, row = null, pendingQuery = ''
  var state = { value: '', conflict: null, checking: false, timer: null, serial: 0 }

  function render() {
    if (!box || !box.parentNode) return
    if (state.checking) {
      box.textContent = '正在核验身份证号是否已在本队登记…'
      box.className = 'field-hint muted'
      box.hidden = false
      action.hidden = true
      return
    }
    if (!state.conflict) {
      box.textContent = ''
      box.hidden = true
      action.hidden = true
      return
    }
    box.textContent = state.conflict.message
    box.className = 'field-hint idcheck-error'
    box.hidden = false
    // 待球队确认的档案不在查找列表里，给「去查找」反而找不到，只保留等待球队处理的说明。
    action.hidden = state.conflict.code !== 'PLAYER_IDCARD_CONFLICT'
  }

  function report(message) {
    var status = document.getElementById('status')
    if (status) {
      status.textContent = message
      status.className = 'error'
    }
    if (row) {
      try { row.scrollIntoView({ behavior: 'smooth', block: 'center' }) } catch (error) { row.scrollIntoView() }
    }
    if (input) {
      try { input.focus({ preventScroll: true }) } catch (error) { input.focus() }
    }
  }

  function check(value) {
    var token = session()
    if (!token) return
    var serial = ++state.serial
    state.checking = true
    render()
    post('serviceEntryCheckPlayerId', { serviceEntrySession: token, idCard: value }).then(function (result) {
      if (serial !== state.serial) return
      state.checking = false
      if (!input || input.value.trim().toUpperCase() !== value) return
      state.value = value
      state.conflict = result.available ? null : {
        code: result.code || 'PLAYER_IDCARD_CONFLICT',
        message: result.message || '本队已有该身份证档案，请返回查找并认领'
      }
      render()
    }).catch(function (error) {
      if (serial !== state.serial) return
      state.checking = false
      if (!input || input.value.trim().toUpperCase() !== value) return
      // 核验失败不阻断提交：服务端提交时仍会查重。只把限流这类需要用户知道的提示留下。
      state.conflict = null
      var limited = error && error.code === 'PLAYER_IDCHECK_LIMIT'
      box.textContent = limited ? error.message : ''
      box.className = 'field-hint muted'
      box.hidden = !limited
      action.hidden = true
    })
  }

  function schedule(delay) {
    if (!input) return
    var value = input.value.trim().toUpperCase()
    clearTimeout(state.timer)
    if (value !== state.value) {
      state.conflict = null
      state.checking = false
      render()
    }
    if (!validIdentity(value) || value === state.value) return
    state.timer = setTimeout(function () { check(value) }, delay == null ? 600 : delay)
  }

  function goFind() {
    if (!input) return
    pendingQuery = input.value.trim().toUpperCase()
    var back = document.getElementById('backToSearch')
    // 返回查找是页面自己的按钮：先回到查找页，再把身份证填进去自动查一次，
    // 不用用户重新输 18 位号码。
    if (back) back.click()
    var searchInput = document.getElementById('playerQuery')
    if (!searchInput || !pendingQuery) return
    searchInput.value = pendingQuery
    pendingQuery = ''
    var form = document.getElementById('searchForm')
    if (form) form.dispatchEvent(new Event('submit', { cancelable: true }))
  }

  function ensureUi() {
    var hint = document.getElementById('idCardHint')
    box = document.getElementById('idCardCheck')
    action = document.getElementById('idCardFindOwner')
    if (box && action) return
    if (!hint || !hint.parentNode) return
    box = document.createElement('small')
    box.id = 'idCardCheck'
    box.className = 'field-hint'
    box.setAttribute('role', 'status')
    box.hidden = true
    hint.parentNode.insertBefore(box, hint.nextSibling)
    action = document.createElement('button')
    action.id = 'idCardFindOwner'
    action.type = 'button'
    action.className = 'idcheck-action'
    action.textContent = '去查找并认领'
    action.hidden = true
    action.onclick = goFind
    box.parentNode.insertBefore(action, box.nextSibling)
  }

  function bind() {
    var found = document.getElementById('idCard')
    if (!found) {
      input = null
      box = null
      action = null
      row = null
      return
    }
    if (found === input) return
    input = found
    row = input.closest ? input.closest('.row') : null
    state.value = ''
    state.conflict = null
    state.checking = false
    state.serial += 1
    clearTimeout(state.timer)
    input.addEventListener('input', function () { schedule() })
    input.addEventListener('change', function () { schedule() })
    input.addEventListener('blur', function () { schedule(0) })
    ensureUi()
    render()
    // 认领模式会把档案身份证直接写进输入框（不走 input 事件），这里补一次核验。
    schedule(0)
  }

  // 命中重复时拦住提交：capture 阶段先于页面 formElement.onsubmit，事件不再下发到表单，
  // 页面也就不会进入「先生成球员卡再提交」的流程。
  document.addEventListener('submit', function (event) {
    var form = event.target
    if (!form || form.id !== 'form') return
    if (!state.conflict || !input) return
    if (input.value.trim().toUpperCase() !== state.value) return
    event.preventDefault()
    event.stopPropagation()
    render()
    report(state.conflict.message)
  }, true)
  // 同一个重复身份证也不允许先生成球员卡：生成走服务端预览，必然被同一冲突打回。
  document.addEventListener('click', function (event) {
    var target = event.target
    if (!target || !target.closest || !target.closest('#editRegistrationCard')) return
    if (!state.conflict) return
    event.preventDefault()
    event.stopPropagation()
    report(state.conflict.message)
  }, true)

  var observer = new MutationObserver(function () { bind() })
  observer.observe(content, { childList: true, subtree: true })
  bind()
})()

// ---------- 确认取卡后直接提交（2026-10-29 用户反馈） ----------
// 现状只有「先点提交 → 弹层里确认」会自动提交；用户自己点「生成球员卡 / 调整球员卡」进弹层时，
// 确认完只回到表单，还要再往下找提交按钮，容易被当成「已经提交了」。
// 这里补上：确认取卡后如果资料齐全，直接走同一个提交入口，成功后由页面自己变成结果页。
;(function () {
  var confirming = false
  var submitted = false
  function overlay() { return document.querySelector('.registration-card-overlay') }
  function registrationForm() {
    var form = document.getElementById('form')
    if (!form) return null
    // 只有登记/认领表单才有「生成球员卡」，其他表单的提交不被接管。
    if (!document.getElementById('editRegistrationCard')) return null
    return form
  }
  function submitButton() {
    var form = registrationForm()
    return form ? form.querySelector('button[type="submit"]') : null
  }
  document.addEventListener('click', function (event) {
    var target = event.target
    if (!target || !target.closest) return
    var confirm = target.closest('.registration-card-overlay [data-card="confirm"]')
    if (!confirm || confirm.disabled) return
    confirming = true
    submitted = false
  }, true)
  function tick() {
    var dialog = overlay()
    if (!confirming) {
      // 用户自己取卡时把「确认使用」说清楚：点下去就是提交登记，不是再看一眼。
      if (!dialog || !registrationForm()) return
      var confirm = dialog.querySelector('[data-card="confirm"]')
      if (confirm && !confirm.disabled && confirm.textContent.trim() === '确认使用') confirm.textContent = '确认并提交登记'
      return
    }
    if (dialog) return
    confirming = false
    var state = document.getElementById('photoState')
    if (!state || String(state.textContent || '').trim() !== '球员卡已确认') return
    var button = submitButton()
    if (!button || button.disabled || submitted) return
    submitted = true
    setTimeout(function () {
      var current = submitButton()
      if (!current || current.disabled) return
      current.click()
    }, 80)
  }
  new MutationObserver(tick).observe(document.body, { childList: true, subtree: true, characterData: true })
})()
