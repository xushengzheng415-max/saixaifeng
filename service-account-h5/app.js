(function () {
  'use strict'

  var API_URL = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'
  var SESSION_KEY = 'sxf_referee_h5_session'
  var PARENT_SESSION_KEY = 'sxf_parent_h5_session'
  var PARENT_PENDING_KEY = 'sxf_parent_h5_pending_invite'
  var parentOAuthBusy = false
  var app = document.getElementById('app')
  var eventDialog = document.getElementById('eventDialog')
  var finishDialog = document.getElementById('finishDialog')
  var rosterDialog = document.getElementById('rosterDialog')
  var rosterPhotoInput = document.getElementById('rosterPhotoInput')
  var rosterDraft = { side: 'home', players: [], rawLines: [], warnings: [] }
  var currentMatch = null
  var clockTimer = null
  var workbenchFilter = 'all'
  var signatureStrokes = []
  var activeSignatureStroke = null

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"]/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]
    })
  }

  function api(payload) {
    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (response) { return response.json() }).then(function (result) {
      if (result && typeof result.body === 'string') return JSON.parse(result.body)
      return result
    })
  }

  function workflow(action, data) {
    return api(Object.assign({}, data || {}, {
      action: 'serviceRefereeWorkflow',
      workflowAction: action,
      refereeSessionToken: localStorage.getItem(SESSION_KEY) || ''
    }))
  }

  function loading(text) {
    stopClockTicker()
    app.innerHTML = '<div class="loading"><div class="spinner"></div>' + escapeHtml(text || '正在加载…') + '</div>'
  }

  function toast(text) {
    var node = document.createElement('div')
    node.className = 'toast'; node.textContent = text; document.body.appendChild(node)
    setTimeout(function () { node.remove() }, 2200)
  }

  function showError(title, message, retry) {
    app.innerHTML = '<section class="notice"><h2>' + escapeHtml(title) + '</h2><p class="muted">' + escapeHtml(message) + '</p>' +
      (retry ? '<button id="retryButton" class="primary">重新加载</button>' : '') + '</section>'
    if (retry) document.getElementById('retryButton').onclick = retry
  }

  function beginOAuth() {
    loading('正在连接微信服务号…')
    api({ action: 'serviceRefereeOAuthUrl' }).then(function (result) {
      if (!result.success) throw new Error(result.error || '服务号授权入口暂不可用')
      window.location.replace(result.authorizeUrl)
    }).catch(function (error) { showError('暂时无法进入', error.message, beginOAuth) })
  }

  function completeOAuth(code, state) {
    loading('正在确认微信身份…')
    api({ action: 'serviceRefereeOAuth', code: code, state: state }).then(function (result) {
      if (!result.success || !result.refereeSessionToken) throw new Error(result.error || '微信授权失败')
      localStorage.setItem(SESSION_KEY, result.refereeSessionToken)
      history.replaceState({}, document.title, location.pathname)
      loadWorkbench()
    }).catch(function (error) {
      localStorage.removeItem(SESSION_KEY)
      showError('微信授权失败', error.message, beginOAuth)
    })
  }

  function renderBinding() {
    app.innerHTML = '<section class="hero"><h1>绑定裁判身份</h1><p>微信授权已经完成。请验证主办方建档时登记的手机号，匹配成功后即可查看执法任务。</p></section>' +
      '<section class="card bind-form"><label>手机号<input id="bindPhone" type="tel" maxlength="11" inputmode="numeric" placeholder="请输入主办方登记的手机号"></label>' +
      '<label>短信验证码<div class="code-row"><input id="bindCode" maxlength="6" inputmode="numeric" placeholder="6位验证码"><button id="sendCode" class="secondary" type="button">获取验证码</button></div></label>' +
      '<button id="bindButton" class="primary wide" type="button">验证并绑定</button><p class="muted">手机号仅用于匹配裁判档案，不会创建主办方登录账号。</p></section>'
    document.getElementById('sendCode').onclick = sendBindCode
    document.getElementById('bindButton').onclick = verifyBindCode
  }

  function sendBindCode() {
    var phone = document.getElementById('bindPhone').value.trim()
    if (!/^1[3-9]\d{9}$/.test(phone)) return toast('请输入正确的手机号')
    var button = document.getElementById('sendCode'); button.disabled = true; button.textContent = '发送中…'
    workflow('sendBindSms', { phone: phone }).then(function (result) {
      if (!result.success) throw new Error(result.message || '验证码发送失败')
      toast('验证码已发送'); button.textContent = '已发送'
      setTimeout(function () { button.disabled = false; button.textContent = '重新获取' }, 60000)
    }).catch(function (error) { button.disabled = false; button.textContent = '获取验证码'; toast(error.message) })
  }

  function verifyBindCode() {
    var phone = document.getElementById('bindPhone').value.trim()
    var code = document.getElementById('bindCode').value.trim()
    if (!/^1[3-9]\d{9}$/.test(phone) || !/^\d{6}$/.test(code)) return toast('请填写手机号和6位验证码')
    var button = document.getElementById('bindButton'); button.disabled = true; button.textContent = '正在绑定…'
    workflow('verifyBindSms', { phone: phone, code: code }).then(function (result) {
      if (!result.success) throw new Error(result.message || '身份绑定失败')
      toast('裁判身份绑定成功'); loadWorkbench()
    }).catch(function (error) { button.disabled = false; button.textContent = '验证并绑定'; toast(error.message) })
  }

  function taskStateKey(task) {
    var label = String(task && task.matchStatusText || '')
    if (/已结束|已归档|已完成|待复核|已复核/.test(label)) return 'finished'
    if (/进行中|赛中|已开始|比赛中/.test(label)) return 'live'
    return 'pending'
  }

  function taskStateLabel(key) {
    return { pending: '待执行', live: '进行中', finished: '已结束' }[key] || '待执行'
  }

  function taskCard(task) {
    var state = taskStateKey(task)
    return '<button class="task" data-match-id="' + escapeHtml(task.matchId) + '"><div class="task-card-top"><span class="task-state task-state-' + state + '">' + escapeHtml(taskStateLabel(state)) + '</span><span class="task-role">' + escapeHtml(task.refereeRoleLabel || '操作负责人') + '</span></div>' +
      '<span class="task-tournament">' + escapeHtml(task.tournamentName || '赛事比赛') + '</span><h2><span>' + escapeHtml(task.homeTeamName) + '</span><i>VS</i><span>' + escapeHtml(task.awayTeamName) + '</span></h2>' +
      '<div class="task-meta"><span>' + escapeHtml(task.matchTimeText || '开赛时间待定') + '</span><span>' + escapeHtml(task.venue || '场地待定') + '</span></div><div class="task-foot"><span>' + escapeHtml(task.matchStatusText || taskStateLabel(state)) + '</span><b>进入任务</b></div></button>'
  }

  function renderWorkbench(data) {
    app.className = 'page'
    if (data.needsPhone) return renderBinding()
    var tasks = data.refereeTasks || []
    var counters = { pending: 0, live: 0, finished: 0 }
    tasks.forEach(function (task) { counters[taskStateKey(task)] += 1 })
    var visibleTasks = workbenchFilter === 'all' ? tasks : tasks.filter(function (task) { return taskStateKey(task) === workbenchFilter })
    var tabs = [
      ['all', '全部', tasks.length], ['pending', '待执行', counters.pending],
      ['live', '进行中', counters.live], ['finished', '已结束', counters.finished]
    ]
    app.innerHTML = '<section class="workbench-hero"><div class="workbench-hero-copy"><span>赛小蜂足球 · 裁判端</span><h1>我的比赛任务</h1><p>已绑定 ' + escapeHtml(data.phoneMasked || '裁判身份') + '，仅显示您被授权处理的比赛。</p></div><div class="workbench-hero-summary"><strong>' + tasks.length + '</strong><span>场执法任务</span></div></section>' +
      '<section class="workbench-tabs" aria-label="任务状态筛选">' + tabs.map(function (tab) {
        var active = workbenchFilter === tab[0] ? ' is-active' : ''
        return '<button type="button" class="workbench-tab' + active + '" data-task-filter="' + tab[0] + '"><span>' + tab[1] + '</span><b>' + tab[2] + '</b></button>'
      }).join('') + '</section>' +
      '<div class="task-section-head"><h2>比赛任务</h2><span>' + (workbenchFilter === 'all' ? '全部任务' : taskStateLabel(workbenchFilter)) + '</span></div>' +
      (visibleTasks.length ? '<section class="task-list">' + visibleTasks.map(taskCard).join('') + '</section>' : '<section class="empty"><h2>暂无' + escapeHtml(workbenchFilter === 'all' ? '比赛任务' : taskStateLabel(workbenchFilter) + '任务') + '</h2><p class="muted">主办方安排您为本场操作负责人后，任务会显示在这里。</p></section>')
    Array.prototype.forEach.call(document.querySelectorAll('[data-task-filter]'), function (node) {
      node.onclick = function () { workbenchFilter = node.getAttribute('data-task-filter') || 'all'; renderWorkbench(data) }
    })
    Array.prototype.forEach.call(document.querySelectorAll('[data-match-id]'), function (node) {
      node.onclick = function () { loadMatch(node.getAttribute('data-match-id')) }
    })
  }

  function loadWorkbench() {
    loading('正在加载裁判任务…')
    workflow('getWorkbench').then(function (result) {
      if (!result.success) {
        if (result.code === 'H5_AUTH_REQUIRED') { localStorage.removeItem(SESSION_KEY); return beginOAuth() }
        throw new Error(result.message || '裁判任务加载失败')
      }
      renderWorkbench(result.data || {})
    }).catch(function (error) { showError('工作台加载失败', error.message, loadWorkbench) })
  }

  function eventCard(event, canDelete) {
    var extra = event.playerName ? ((event.playerNumber ? event.playerNumber + '号 ' : '') + event.playerName) : (event.description || '')
    if (event.assistText) extra += (extra ? ' · ' : '') + event.assistText
    return '<div class="event"><span class="event-icon event-icon-' + escapeHtml(event.type || 'other') + '" aria-hidden="true"></span><span class="minute">' + escapeHtml(event.minute) + "′</span><div><strong>" + escapeHtml(event.typeText) + ' · ' + escapeHtml(event.teamName) + '</strong><small>' + escapeHtml(extra) + '</small></div>' +
      (canDelete ? '<button class="danger" data-event-id="' + escapeHtml(event.eventId) + '">删除</button>' : '') + '</div>'
  }

  function stopClockTicker() {
    if (clockTimer) clearInterval(clockTimer)
    clockTimer = null
  }

  function clockSeconds() {
    if (!currentMatch) return 0
    var seconds = Number(currentMatch.clockElapsedSeconds || 0)
    if (currentMatch.clockRunning && currentMatch.clockSnapshotAt) {
      seconds += Math.max(0, (Date.now() - new Date(currentMatch.clockSnapshotAt).getTime()) / 1000)
    }
    return Math.max(0, Math.floor(seconds))
  }

  function formatClock(seconds) {
    var minutes = Math.floor(seconds / 60)
    var rest = seconds % 60
    return String(minutes).padStart(2, '0') + ':' + String(rest).padStart(2, '0')
  }

  function currentMatchMinute() {
    return Math.min(130, Math.max(0, Math.floor(clockSeconds() / 60) + 1))
  }

  function updateClockDisplay() {
    var node = document.getElementById('matchClock')
    if (node) node.textContent = formatClock(clockSeconds())
  }

  function startClockTicker() {
    stopClockTicker()
    updateClockDisplay()
    if (currentMatch && currentMatch.clockRunning) clockTimer = setInterval(updateClockDisplay, 1000)
  }

  function clockControls(match) {
    if (!match.canFinish) return ''
    var html = '<div class="clock-controls">'
    if (match.clockPhase === 'halftime') {
      html += '<button class="clock-main clock-only" data-clock-command="second_half">▶ 开始下半场</button>'
    } else {
      html += match.clockRunning
        ? '<button class="clock-control" data-clock-command="pause">Ⅱ 暂停计时</button>'
        : '<button class="clock-control" data-clock-command="resume">▶ 继续计时</button>'
      if (match.clockPhase === 'first_half') html += '<button class="clock-main" data-clock-command="halftime">结束上半场</button>'
    }
    return html + '</div>'
  }

  function quickActions(match) {
    if (!match.canRecordEvents) return ''
    var actions = [
      ['goal', '', '进球'], ['yellow_card', '', '黄牌'], ['red_card', '', '红牌'],
      ['substitution', '', '换人'], ['stoppage_time', '', '补时'], ['other', '', '其他']
    ]
    return '<section class="quick-panel"><div class="panel-title"><strong>快捷记录</strong><span>自动带入当前 ' + currentMatchMinute() + '′</span></div><div class="quick-grid">' + actions.map(function (item) {
      return '<button type="button" class="quick-action quick-' + item[0] + '" data-quick-type="' + item[0] + '"><span aria-hidden="true"></span><b>' + item[2] + '</b></button>'
    }).join('') + '</div></section>'
  }

  function sideRoster(match, side) {
    var rosters = match && match.rosters ? match.rosters : {}
    return rosters[side] || { side: side, players: [], starterCount: 0, substituteCount: 0 }
  }

  function rosterPanel(match) {
    function sideCard(side, label, teamName) {
      var roster = sideRoster(match, side)
      var count = (roster.players || []).length
      var summary = count ? ('首发 ' + Number(roster.starterCount || 0) + ' · 替补 ' + Number(roster.substituteCount || 0)) : '尚未录入'
      var actions = match.canEditRoster
        ? '<div class="roster-actions"><button type="button" class="secondary roster-scan" data-roster-scan="' + side + '">📷 ' + (count ? '重新拍照' : '拍照识别') + '</button>' + (count ? '<button type="button" class="ghost roster-edit" data-roster-edit="' + side + '">核对名单</button>' : '') + '</div>'
        : ''
      return '<div class="roster-side-card"><div><span class="roster-side-label">' + label + '</span><strong>' + escapeHtml(teamName) + '</strong><small>' + escapeHtml(summary) + '</small></div>' + actions + '</div>'
    }
    return '<section class="roster-panel"><div class="panel-title"><strong>本场球员名单</strong><span>拍照识别后用于事件选择</span></div><div class="roster-side-grid">' +
      sideCard('home', '主队', match.homeTeamName) + sideCard('away', '客队', match.awayTeamName) + '</div></section>'
  }

  function rosterOptionValue(player) {
    var number = String(player && player.jerseyNumber || '').trim()
    return (number ? number + '号 ' : '') + String(player && player.name || '').trim()
  }

  function updateEventPlayerOptions() {
    var sideNode = document.getElementById('eventTeamSide')
    var side = sideNode && sideNode.value === 'away' ? 'away' : 'home'
    var players = sideRoster(currentMatch, side).players || []
    var html = players.map(function(player) {
      return '<option value="' + escapeHtml(rosterOptionValue(player)) + '">' + escapeHtml(player.role === 'substitute' ? '替补' : '首发') + '</option>'
    }).join('')
    document.getElementById('eventPlayerOptions').innerHTML = html
    document.getElementById('eventAssistOptions').innerHTML = html
  }

  function compressRosterImage(file) {
    return new Promise(function(resolve, reject) {
      if (!file || !/^image\/(jpeg|png)$/i.test(file.type || '')) return reject(new Error('请拍摄或选择 JPG、PNG 名单照片'))
      var reader = new FileReader()
      reader.onerror = function() { reject(new Error('无法读取照片，请重新拍摄')) }
      reader.onload = function() {
        var image = new Image()
        image.onerror = function() { reject(new Error('照片格式无法识别')) }
        image.onload = function() {
          var maxSide = 2000
          var scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
          var canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
          var context = canvas.getContext('2d')
          context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height)
          context.drawImage(image, 0, 0, canvas.width, canvas.height)
          var dataUrl = canvas.toDataURL('image/jpeg', 0.84)
          if (dataUrl.length > 6 * 1024 * 1024) dataUrl = canvas.toDataURL('image/jpeg', 0.68)
          resolve(dataUrl.split(',')[1] || '')
        }
        image.src = reader.result
      }
      reader.readAsDataURL(file)
    })
  }

  function chooseRosterPhoto(side) {
    rosterDraft.side = side === 'away' ? 'away' : 'home'
    rosterPhotoInput.value = ''
    rosterPhotoInput.click()
  }

  function collectRosterRows() {
    var players = []
    Array.prototype.forEach.call(document.querySelectorAll('#rosterRows .roster-row'), function(row) {
      players.push({
        jerseyNumber: row.querySelector('[data-roster-field=number]').value.trim(),
        name: row.querySelector('[data-roster-field=name]').value.trim(),
        role: row.querySelector('[data-roster-field=role]').value
      })
    })
    return players
  }

  function renderRosterRows() {
    var container = document.getElementById('rosterRows')
    container.innerHTML = rosterDraft.players.length ? rosterDraft.players.map(function(player, index) {
      return '<div class="roster-row" data-roster-index="' + index + '"><input data-roster-field="number" type="number" min="0" max="999" inputmode="numeric" value="' + escapeHtml(player.jerseyNumber || '') + '" aria-label="球衣号码"><input data-roster-field="name" maxlength="30" value="' + escapeHtml(player.name || '') + '" aria-label="球员姓名"><select data-roster-field="role" aria-label="球员身份"><option value="starter"' + (player.role !== 'substitute' ? ' selected' : '') + '>首发</option><option value="substitute"' + (player.role === 'substitute' ? ' selected' : '') + '>替补</option></select><button type="button" class="danger roster-remove" data-roster-remove="' + index + '" aria-label="删除">×</button></div>'
    }).join('') : '<div class="roster-empty">尚未提取到球员，请点击下方按钮手动添加。</div>'
    Array.prototype.forEach.call(document.querySelectorAll('[data-roster-remove]'), function(button) {
      button.onclick = function() {
        rosterDraft.players = collectRosterRows()
        rosterDraft.players.splice(Number(button.getAttribute('data-roster-remove')), 1)
        renderRosterRows()
      }
    })
  }

  function openRosterEditor(side, players, rawLines, warnings) {
    rosterDraft = {
      side: side === 'away' ? 'away' : 'home',
      players: (players || []).map(function(player) { return { jerseyNumber: player.jerseyNumber || '', name: player.name || '', role: player.role === 'substitute' ? 'substitute' : 'starter' } }),
      rawLines: rawLines || [],
      warnings: warnings || []
    }
    var teamName = rosterDraft.side === 'away' ? currentMatch.awayTeamName : currentMatch.homeTeamName
    document.getElementById('rosterDialogTitle').textContent = teamName + ' · 核对名单'
    document.getElementById('rosterWarnings').innerHTML = rosterDraft.warnings.map(function(item) { return '<div class="roster-warning">' + escapeHtml(item) + '</div>' }).join('')
    document.getElementById('ocrRawLines').textContent = rosterDraft.rawLines.join('\n')
    document.getElementById('ocrRawDetails').style.display = rosterDraft.rawLines.length ? 'block' : 'none'
    renderRosterRows()
    rosterDialog.showModal()
  }

  function editRoster(side) {
    var roster = sideRoster(currentMatch, side)
    openRosterEditor(side, roster.players || [], [], [])
  }

  function preMatchStepClass(active, complete) {
    return complete ? ' is-complete' : (active ? ' is-active' : '')
  }

  function renderPreMatch(match) {
    app.className = 'page'
    stopClockTicker()
    currentMatch = match
    var preMatch = match.preMatch || {}
    var checklist = preMatch.checklist || []
    var checkedCount = checklist.filter(function (item) { return item.checked }).length
    var completeReady = preMatch.refereeArrived && preMatch.teamsArrived && preMatch.checklistComplete
    var steps = [
      ['报到与到场', true], ['阵容核验', !!preMatch.completed], ['赛前会议', false], ['赛前准备', false], ['开赛确认', false]
    ]
    app.innerHTML = '<section class="pre-match-hero"><button id="backButton" class="pre-match-back" type="button" aria-label="返回任务">返回</button><span>专业版 · 现场执行</span><h1>比赛报到与到场确认</h1></section>' +
      '<section class="pre-match-teams"><div class="pre-match-division">' + escapeHtml(match.divisionName || '比赛场次') + '</div><div class="pre-match-team-row"><strong>' + escapeHtml(match.homeTeamName) + '</strong><b>VS</b><strong>' + escapeHtml(match.awayTeamName) + '</strong></div><div class="pre-match-time"><span>' + escapeHtml(match.matchTimeText) + '</span><span>' + escapeHtml(match.venue) + '</span><span>' + escapeHtml(match.matchStatusText) + '</span></div></section>' +
      '<section class="pre-match-steps">' + steps.map(function (step, index) { return '<div class="pre-match-step' + preMatchStepClass(index === 0, step[1]) + '"><b>' + (index + 1) + '</b><span>' + step[0] + '</span></div>' }).join('') + '</section>' +
      '<section class="pre-match-panel"><div class="pre-match-panel-title"><h2>裁判组报到</h2><span>' + (preMatch.refereeArrived ? '已确认' : '待确认') + '</span></div><p>仅本场获授权裁判可在抵达现场后确认报到。</p><button class="pre-match-action' + (preMatch.refereeArrived ? ' is-done' : '') + '" type="button" data-pre-match-operation="confirm_referee_arrival">' + (preMatch.refereeArrived ? '裁判已报到' : '确认本人已到场') + '</button></section>' +
      '<section class="pre-match-panel"><div class="pre-match-panel-title"><h2>双方球队到场确认</h2><span>' + (preMatch.teamsArrived ? '已确认' : '待确认') + '</span></div><div class="pre-match-team-check"><span>' + escapeHtml(match.homeTeamName) + '（主队）</span><b>' + (preMatch.teamsArrived ? '已到场' : '待确认') + '</b></div><div class="pre-match-team-check"><span>' + escapeHtml(match.awayTeamName) + '（客队）</span><b>' + (preMatch.teamsArrived ? '已到场' : '待确认') + '</b></div><button class="pre-match-action' + (preMatch.teamsArrived ? ' is-done' : '') + '" type="button" data-pre-match-operation="confirm_teams_arrival">' + (preMatch.teamsArrived ? '双方已到场' : '确认双方已到场') + '</button></section>' +
      '<section class="pre-match-panel"><div class="pre-match-panel-title"><h2>赛前检查清单</h2><span>' + checkedCount + '/' + checklist.length + '</span></div>' + checklist.map(function (item) { return '<button type="button" class="pre-match-check' + (item.checked ? ' is-checked' : '') + '" data-pre-match-operation="toggle_checklist" data-pre-match-item="' + escapeHtml(item.key) + '"><i aria-hidden="true"></i><span>' + escapeHtml(item.label) + '</span><b>' + (item.checked ? '已检查' : '待检查') + '</b></button>' }).join('') + '</section>' +
      '<section class="pre-match-bottom"><button id="completePreMatch" class="pre-match-complete" type="button"' + (completeReady ? '' : ' disabled') + '>确认赛前检查，进入阵容核验</button><button id="preMatchIssue" class="pre-match-issue" type="button">报告无法开赛</button></section>'
    document.getElementById('backButton').onclick = loadWorkbench
    Array.prototype.forEach.call(document.querySelectorAll('[data-pre-match-operation]'), function (node) {
      node.onclick = function () { updatePreMatch(node.getAttribute('data-pre-match-operation'), node.getAttribute('data-pre-match-item') || '') }
    })
    document.getElementById('completePreMatch').onclick = function () { updatePreMatch('complete_pre_match', '') }
    document.getElementById('preMatchIssue').onclick = function () {
      var reason = window.prompt('请填写无法开赛原因（将记录到本场赛前审计）')
      if (reason == null) return
      updatePreMatch('report_pre_match_issue', '', reason)
    }
  }

  function updatePreMatch(operation, itemKey, reason) {
    if (!currentMatch) return
    loading('正在保存赛前确认…')
    workflow('updatePreMatchState', { matchId: currentMatch.matchId, operation: operation, itemKey: itemKey, reason: reason || '' }).then(function (result) {
      if (!result.success) throw new Error(result.message || '赛前确认保存失败')
      toast(result.message || '赛前状态已更新'); loadMatch(currentMatch.matchId)
    }).catch(function (error) { showError('赛前确认保存失败', error.message, function () { loadMatch(currentMatch.matchId) }) })
  }

  function lineupStatusText(status) {
    return { submitted: '待核验', verified: '核验通过', locked: '已锁定', returned: '已退回修改', unclaimed: '尚未提交' }[status] || '尚未提交'
  }

  function renderLineupVerification(match) {
    app.className = 'page'
    stopClockTicker()
    currentMatch = match
    var teams = [
      { side: 'home', name: match.homeTeamName, roster: sideRoster(match, 'home') },
      { side: 'away', name: match.awayTeamName, roster: sideRoster(match, 'away') }
    ]
    var verifiedCount = teams.filter(function (team) { return ['verified', 'locked'].indexOf(team.roster.status) >= 0 }).length
    function playerRow(player, teamStatus) {
      var state = ['verified', 'locked'].indexOf(teamStatus) >= 0 ? '核验通过' : (teamStatus === 'returned' ? '名单已退回' : '待现场核验')
      return '<div class="lineup-player"><span class="lineup-number">' + escapeHtml(player.jerseyNumber || '—') + '</span><span class="lineup-player-name">' + escapeHtml(player.name) + '<small>' + (player.role === 'substitute' ? '替补' : '首发') + '</small></span><b class="lineup-player-state">' + escapeHtml(player.identityStatus || state) + '</b></div>'
    }
    function teamCard(team, expanded) {
      var roster = team.roster
      var status = roster.status || 'unclaimed'
      var starters = (roster.players || []).filter(function (player) { return player.role !== 'substitute' })
      var substitutes = (roster.players || []).filter(function (player) { return player.role === 'substitute' })
      var canReview = match.canReviewLineups && status === 'submitted'
      return '<section class="lineup-team-card' + (expanded ? ' is-expanded' : '') + '"><div class="lineup-team-heading"><div><span class="lineup-team-side">' + (team.side === 'home' ? '主队' : '客队') + '</span><h2>' + escapeHtml(team.name) + '</h2><small>' + escapeHtml(lineupStatusText(status)) + '</small></div><button type="button" class="lineup-expand" data-lineup-expand="' + team.side + '">' + (expanded ? '收起' : '展开') + '</button></div><div class="lineup-metrics"><span>首发 <b>' + starters.length + '</b> 人</span><span>替补 <b>' + substitutes.length + '</b> 人</span><span>共 <b>' + (roster.players || []).length + '</b> 人</span></div>' +
        (expanded ? '<div class="lineup-list-title">首发球员（' + starters.length + '人）</div><div class="lineup-players">' + (starters.length ? starters.map(function (player) { return playerRow(player, status) }).join('') : '<p class="lineup-empty">球队尚未提交本场首发阵容。</p>') + '</div>' + (substitutes.length ? '<div class="lineup-list-title">替补球员（' + substitutes.length + '人）</div><div class="lineup-players">' + substitutes.map(function (player) { return playerRow(player, status) }).join('') + '</div>' : '') : '') +
        '<div class="lineup-card-actions"><button type="button" class="lineup-pass" data-lineup-decision="verified" data-lineup-side="' + team.side + '"' + (canReview ? '' : ' disabled') + '>确认核验通过</button><button type="button" class="lineup-return" data-lineup-decision="returned" data-lineup-side="' + team.side + '"' + (canReview ? '' : ' disabled') + '>标记异常</button></div></section>'
    }
    var expandedSide = match.lineupExpandedSide === 'away' ? 'away' : 'home'
    app.innerHTML = '<section class="lineup-hero"><button id="backButton" class="pre-match-back" type="button">返回</button><span>专业版 · 现场执行</span><h1>双方阵容及球员身份核验</h1><p>' + escapeHtml(match.matchTimeText) + ' · ' + escapeHtml(match.venue) + '</p></section><section class="lineup-steps"><span>赛前准备</span><b>2</b><strong>阵容核验</strong><span>赛前会议</span><span>设备检查</span><span>比赛开始</span></section><section class="lineup-notice">阵容由球队提交，裁判仅现场核验，不在此编辑首发或替补。</section>' + teams.map(function (team) { return teamCard(team, team.side === expandedSide) }).join('') + '<section class="lineup-bottom"><button id="lineupDone" type="button"' + (match.lineupsLocked ? '' : ' disabled') + '>完成核验并开始比赛</button><p>已完成 ' + verifiedCount + '/2 支球队核验。发现身份不符或名单异常时，请标记异常并退回球队修改。</p></section>'
    document.getElementById('backButton').onclick = function () { renderPreMatch(match) }
    Array.prototype.forEach.call(document.querySelectorAll('[data-lineup-expand]'), function (node) {
      node.onclick = function () { match.lineupExpandedSide = node.getAttribute('data-lineup-expand'); renderLineupVerification(match) }
    })
    Array.prototype.forEach.call(document.querySelectorAll('[data-lineup-decision]'), function (node) {
      node.onclick = function () { reviewLineup(node.getAttribute('data-lineup-side'), node.getAttribute('data-lineup-decision')) }
    })
    document.getElementById('lineupDone').onclick = function () { renderMatch(match) }
  }

  function reviewLineup(side, decision) {
    if (!currentMatch) return
    var reason = ''
    if (decision === 'returned') {
      reason = window.prompt('请填写阵容或身份异常原因（将退回球队处理）')
      if (reason == null) return
    }
    loading('正在保存核验结果…')
    workflow('reviewLineup', { matchId: currentMatch.matchId, side: side, decision: decision, reason: reason }).then(function (result) {
      if (!result.success) throw new Error(result.message || '阵容核验保存失败')
      toast(result.message || '阵容核验已更新'); loadMatch(currentMatch.matchId)
    }).catch(function (error) { showError('阵容核验保存失败', error.message, function () { loadMatch(currentMatch.matchId) }) })
  }

  function renderReport(match) {
    app.className = 'page'
    currentMatch = match
    var draft = match.refereeReportDraft || { conclusion: 'normal', sections: {} }
    var keys = [['sportsmanship', '赛风赛纪'], ['discipline', '纪律与冲突'], ['injury', '伤病与急救'], ['venue', '场地与设施'], ['interruption', '比赛中断/延误'], ['other', '其他说明']]
    app.innerHTML = '<section class="workbench-hero"><div class="workbench-hero-copy"><span>专业版 · 已完赛</span><h1>裁判报告</h1><p>' + escapeHtml(match.teamsText) + ' · ' + escapeHtml(match.homeScore) + ' : ' + escapeHtml(match.awayScore) + '</p></div></section><section class="card"><h2>报告结论</h2><button id="reportConclusion" class="secondary wide">' + (draft.conclusion === 'abnormal' ? '异常完成（点击切换）' : '比赛正常完成（点击切换）') + '</button></section><section class="card"><h2>报告内容</h2>' + keys.map(function (item) { var saved = draft.sections[item[0]] || {}; return '<button class="report-item" data-report-key="' + item[0] + '"><span>' + item[1] + '</span><b>' + (saved.status === 'abnormal' ? '异常 · 已填写' : '正常') + '</b></button>' }).join('') + '<button id="saveReport" class="primary wide">保存并进入电子记录确认</button></section>'
    document.getElementById('reportConclusion').onclick = function () { draft.conclusion = draft.conclusion === 'abnormal' ? 'normal' : 'abnormal'; renderReport(match) }
    Array.prototype.forEach.call(document.querySelectorAll('[data-report-key]'), function (node) { node.onclick = function () { var key = node.getAttribute('data-report-key'); var value = draft.sections[key] || {}; var note = window.prompt('填写“' + node.textContent.trim().split('异常')[0] + '”异常说明；留空表示正常', value.note || ''); if (note === null) return; draft.sections[key] = { status: note.trim() ? 'abnormal' : 'normal', note: note.trim() }; renderReport(match) } })
    document.getElementById('saveReport').onclick = function () { loading('正在保存裁判报告…'); workflow('saveRefereeReportDraft', { matchId: match.matchId, conclusion: draft.conclusion, sections: draft.sections }).then(function (result) { if (!result.success) throw new Error(result.message); toast('报告已保存，下一步为电子记录确认'); loadMatch(match.matchId) }).catch(function (error) { showError('报告保存失败', error.message, function () { renderReport(match) }) }) }
  }

  function displayTime(value) {
    if (!value) return '提交时间待同步'
    var date = new Date(value)
    if (isNaN(date.getTime())) return String(value)
    function two(number) { return String(number).padStart(2, '0') }
    return date.getFullYear() + '-' + two(date.getMonth() + 1) + '-' + two(date.getDate()) + ' ' + two(date.getHours()) + ':' + two(date.getMinutes())
  }

  function renderElectronicRecord(match) {
    stopClockTicker()
    app.className = 'page signature-page'
    currentMatch = match
    signatureStrokes = []
    activeSignatureStroke = null
    var report = match.refereeReportDraft || {}
    var abnormal = report.conclusion === 'abnormal' ? '存在异常说明' : '正常完成'
    app.innerHTML = '<section class="signature-hero"><button id="signatureBack" class="signature-back" type="button">返回报告</button><span>专业版 PRO · 第五步</span><h1>电子记录确认与签字</h1><p>确认后将冻结本场比分、阵容、事件和裁判报告，提交主办方赛果复核。</p></section>' +
      '<section class="signature-score"><span>' + escapeHtml(match.homeTeamName) + '</span><strong>' + escapeHtml(match.homeScore) + ' : ' + escapeHtml(match.awayScore) + '</strong><span>' + escapeHtml(match.awayTeamName) + '</span></section>' +
      '<section class="signature-card"><div class="signature-card-head"><div><span>电子比赛记录</span><h2>请核对只读快照</h2></div><b>待签字</b></div><div class="signature-details"><div><span>阵容核验</span><b>双方已锁定</b></div><div><span>比赛事件</span><b>' + escapeHtml((match.events || []).length) + ' 条</b></div><div><span>裁判报告</span><b>' + escapeHtml(abnormal) + '</b></div><div><span>记录状态</span><b>提交后不可修改</b></div></div></section>' +
      '<section class="signature-card"><div class="signature-card-head"><div><span>主裁判签字</span><h2>请在框内签署本人姓名</h2></div><button id="clearSignature" class="clear-signature" type="button">清除</button></div><div class="signature-canvas-wrap"><canvas id="signaturePad" width="760" height="270" aria-label="裁判签字区"></canvas><span>签字将与本场电子记录快照一并保存</span></div><label class="signature-confirm"><input id="signatureConfirm" type="checkbox"> 我已核对比赛记录，确认以本人身份提交。</label><button id="submitSignedRecord" class="primary wide" type="button">确认签字并提交</button></section>'
    document.getElementById('signatureBack').onclick = function () { renderReport(match) }
    document.getElementById('clearSignature').onclick = function () { signatureStrokes = []; activeSignatureStroke = null; drawSignature() }
    document.getElementById('submitSignedRecord').onclick = function () {
      if (!document.getElementById('signatureConfirm').checked) return toast('请先确认已核对电子比赛记录')
      var pointCount = signatureStrokes.reduce(function (count, stroke) { return count + stroke.length }, 0)
      if (pointCount < 8) return toast('请在签字区完成本人签字')
      var button = document.getElementById('submitSignedRecord')
      button.disabled = true; button.textContent = '正在提交电子记录…'
      workflow('submitSignedRefereeRecord', { matchId: match.matchId, signature: { strokes: signatureStrokes } }).then(function (result) {
        if (!result.success) throw new Error(result.message || '电子记录提交失败')
        match.refereeRecordLocked = true
        match.refereeRecord = result.data && result.data.record ? result.data.record : null
        match.refereeReportStatus = 'submitted'
        renderSubmissionSuccess(match, false)
      }).catch(function (error) {
        button.disabled = false; button.textContent = '确认签字并提交'
        showError('电子记录提交失败', error.message, function () { renderElectronicRecord(match) })
      })
    }
    bindSignaturePad()
  }

  function signaturePoint(event, canvas) {
    var rect = canvas.getBoundingClientRect()
    return {
      x: Math.round(Math.max(0, Math.min(1000, (event.clientX - rect.left) / rect.width * 1000))),
      y: Math.round(Math.max(0, Math.min(1000, (event.clientY - rect.top) / rect.height * 1000)))
    }
  }

  function drawSignature() {
    var canvas = document.getElementById('signaturePad')
    if (!canvas) return
    var context = canvas.getContext('2d')
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.strokeStyle = '#075f3d'; context.lineWidth = 5; context.lineCap = 'round'; context.lineJoin = 'round'
    signatureStrokes.forEach(function (stroke) {
      if (stroke.length < 2) return
      context.beginPath()
      stroke.forEach(function (point, index) {
        var x = point.x / 1000 * canvas.width
        var y = point.y / 1000 * canvas.height
        if (index === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      })
      context.stroke()
    })
  }

  function bindSignaturePad() {
    var canvas = document.getElementById('signaturePad')
    if (!canvas) return
    function endStroke(event) {
      if (event) event.preventDefault()
      activeSignatureStroke = null
      if (canvas.hasPointerCapture && event && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    }
    canvas.onpointerdown = function (event) {
      event.preventDefault()
      if (signatureStrokes.length >= 20) return toast('签字笔画过多，请清除后重新签署')
      activeSignatureStroke = [signaturePoint(event, canvas)]
      signatureStrokes.push(activeSignatureStroke)
      canvas.setPointerCapture(event.pointerId)
    }
    canvas.onpointermove = function (event) {
      if (!activeSignatureStroke) return
      event.preventDefault()
      if (activeSignatureStroke.length >= 400) return
      activeSignatureStroke.push(signaturePoint(event, canvas))
      drawSignature()
    }
    canvas.onpointerup = endStroke
    canvas.onpointercancel = endStroke
    canvas.onpointerleave = function (event) { if (event.buttons === 0) endStroke(event) }
  }

  function renderSubmissionSuccess(match, recordOnly) {
    stopClockTicker()
    app.className = 'page submission-success-page'
    currentMatch = match
    var record = match.refereeRecord || {}
    var review = record.reviewStatus || match.refereeReviewStatus || 'under_review'
    var returned = review === 'returned'
    var archived = review === 'archived'
    var title = recordOnly ? '已提交电子记录' : (returned ? '记录已退回' : '提交成功')
    var stateText = returned ? '主办方已退回修正' : (archived ? '已确认归档' : '电子比赛记录已提交')
    var statusNote = returned ? (record.returnRequest && record.returnRequest.reason ? record.returnRequest.reason : '请按主办方指定内容修正后重新签字。') : (archived ? '主办方已确认归档，本场电子记录将长期保留。' : '等待复核期间记录已锁定，裁判不能主动修改；如被退回，仅可修正指定内容并重新签字提交。')
    app.innerHTML = '<section class="submission-hero"><button id="successBack" class="submission-back" type="button">返回</button><div><span>' + escapeHtml(match.division || '专业版') + ' · ' + escapeHtml(match.matchTimeText || '本场比赛') + '</span><h1>' + escapeHtml(title) + '</h1></div><b>专业版 PRO</b></section>' +
      '<section class="submission-card"><div class="success-check" aria-label="已签字提交"></div><h2>' + escapeHtml(stateText) + '</h2><div class="success-score"><span>' + escapeHtml(match.homeTeamName) + '</span><strong>' + escapeHtml(match.homeScore) + ' : ' + escapeHtml(match.awayScore) + '</strong><span>' + escapeHtml(match.awayTeamName) + '</span></div><div class="record-meta"><div><span>提交时间</span><b>' + escapeHtml(displayTime(record.submittedAt)) + '</b></div><div><span>记录编号</span><b>' + escapeHtml(record.recordNumber || '生成中') + '</b></div><div><span>主裁判</span><b>' + escapeHtml(record.submittedByPhoneMasked || '当前授权裁判') + '</b></div><div><span>签字状态</span><b class="signed-text">签字已完成</b></div></div></section>' +
      '<section class="submission-card review-card"><h2>提交状态流程</h2><div class="review-steps"><div class="done"><i></i><b>裁判已提交</b><small>' + escapeHtml(displayTime(record.submittedAt)) + '</small></div><span></span><div class="' + (archived ? 'done' : (returned ? 'returned' : 'waiting')) + '"><i></i><b>' + (returned ? '退回修正' : '主办方赛果复核') + '</b><small>' + (archived ? '已通过' : (returned ? '请处理' : '等待中')) + '</small></div><span></span><div class="' + (archived ? 'done' : 'waiting') + '"><i></i><b>确认归档</b><small>' + (archived ? '已完成' : '待完成') + '</small></div></div><div class="review-note"><strong>规则说明</strong><p>' + escapeHtml(statusNote) + '</p></div></section>' +
      (returned ? '<button id="repairRecord" class="primary wide success-action" type="button">查看退回原因并修正</button>' : '<button id="viewSubmittedRecord" class="primary wide success-action" type="button">查看已提交记录</button>') + '<button id="backWorkbench" class="success-secondary" type="button">返回我的比赛</button>'
    document.getElementById('successBack').onclick = recordOnly ? function () { renderSubmissionSuccess(match, false) } : loadWorkbench
    document.getElementById('backWorkbench').onclick = loadWorkbench
    if (returned) document.getElementById('repairRecord').onclick = function () { renderReturnCorrection(match) }
    else document.getElementById('viewSubmittedRecord').onclick = function () { renderSubmissionSuccess(match, true) }
  }

  function renderReturnCorrection(match) {
    stopClockTicker()
    app.className = 'page return-correction-page'
    currentMatch = match
    signatureStrokes = []
    activeSignatureStroke = null
    var record = match.refereeRecord || {}
    var request = record.returnRequest || {}
    var allowed = request.fields || []
    var eligibleEvents = (match.events || []).filter(function (item) {
      return allowed.indexOf('event_player') >= 0 || allowed.indexOf('event_player:' + item.eventId) >= 0
    })
    var draft = match.returnedCorrectionDraft || {}
    var selectedId = draft.eventId || (eligibleEvents[0] && eligibleEvents[0].eventId) || ''
    function selectedEvent() { return eligibleEvents.filter(function (item) { return item.eventId === selectedId })[0] || eligibleEvents[0] || {} }
    function rosterOptions(item) {
      var side = item.teamSide === 'away' ? 'away' : 'home'
      var players = ((match.rosters || {})[side] || {}).players || []
      return players.map(function (player) { return '<option value="' + escapeHtml(player.name || '') + '" data-number="' + escapeHtml(player.jerseyNumber || '') + '">' + escapeHtml((player.jerseyNumber ? player.jerseyNumber + '号 ' : '') + (player.name || '未命名球员')) + '</option>' }).join('')
    }
    if (!eligibleEvents.length) {
      app.innerHTML = '<section class="return-hero"><button id="returnCorrectionBack" class="submission-back" type="button">返回</button><div><span>专业版 PRO</span><h1>退回修正</h1></div></section><section class="return-card"><h2>修正范围未包含可处理事件</h2><p>主办方仅授权修改指定内容；请联系主办方确认退回范围。</p><button id="returnCorrectionWorkbench" class="primary wide" type="button">返回我的比赛</button></section>'
      document.getElementById('returnCorrectionBack').onclick = function () { renderSubmissionSuccess(match, false) }
      document.getElementById('returnCorrectionWorkbench').onclick = loadWorkbench
      return
    }
    var item = selectedEvent()
    app.innerHTML = '<section class="return-hero"><button id="returnCorrectionBack" class="submission-back" type="button">返回</button><div><span>' + escapeHtml(match.division || '专业版') + ' · ' + escapeHtml(match.matchTimeText || '本场比赛') + '</span><h1>退回修正</h1><p>' + escapeHtml(match.homeTeamName) + ' ' + escapeHtml(match.homeScore) + ' : ' + escapeHtml(match.awayScore) + ' ' + escapeHtml(match.awayTeamName) + '</p></div><b>专业版 PRO</b></section>' +
      '<section class="return-banner">主办方复核后退回给裁判修正，主办方未直接修改数据</section><section class="return-card"><span class="return-kicker">退回原因 · 需修正</span><h2>' + escapeHtml(request.reason || '请在限定范围内修正后重新签字提交') + '</h2><p>退回时间：' + escapeHtml(displayTime(request.returnedAt)) + '　退回人：' + escapeHtml(request.returnedBy || '赛事主办方') + '</p></section>' +
      '<section class="return-card"><h2>限定修正范围</h2><p class="scope-ok">仅允许修正指定进球事件的进球球员，不影响其他已确认内容。</p><label>选择需修正事件<select id="correctionEvent">' + eligibleEvents.map(function (eventItem) { return '<option value="' + escapeHtml(eventItem.eventId) + '"' + (eventItem.eventId === selectedId ? ' selected' : '') + '>' + escapeHtml(eventItem.minute + '′ ' + eventItem.typeText + ' · ' + eventItem.teamName) + '</option>' }).join('') + '</select></label><div class="original-event"><span>原记录（仅供参考）</span><b>' + escapeHtml(item.minute + '′ ' + item.teamName + ' · ' + (item.playerNumber ? item.playerNumber + '号 ' : '') + (item.playerName || '未填写球员')) + '</b></div><label>修正后的进球球员<select id="correctionPlayer">' + rosterOptions(item) + '</select></label><div class="compare-table"><div><b>项目</b><b>原记录</b><b>修正后</b></div><div><span>进球时间</span><span>' + escapeHtml(item.minute + '′') + '</span><span>' + escapeHtml(item.minute + '′') + '</span></div><div><span>进球队</span><span>' + escapeHtml(item.teamName) + '</span><span>' + escapeHtml(item.teamName) + '</span></div><div><span>进球球员</span><span class="before-player">' + escapeHtml((item.playerNumber ? item.playerNumber + '号 ' : '') + (item.playerName || '未填写')) + '</span><span id="afterPlayer" class="after-player">请选择</span></div></div><label>修改原因说明（必填）<textarea id="correctionReason" maxlength="300" placeholder="请说明本次修正的原因">' + escapeHtml(draft.reason || '') + '</textarea></label><button id="saveCorrection" class="secondary wide" type="button">暂存修正</button></section>' +
      '<section class="return-card locked-fields"><h2>以下内容已锁定，仅可查看</h2><div><span>其他比分数据</span><span>阵容快照</span><span>其他比赛事件</span><span>裁判报告</span></div></section><section class="return-card"><h2>重新确认并签名</h2><p>请确认已按退回要求修正，仅本次退回范围内的变更会进入新版本记录。</p><div class="signature-canvas-wrap"><canvas id="signaturePad" width="760" height="270" aria-label="重新签字区"></canvas><span>重新签字将生成新的电子记录版本</span></div><label class="signature-confirm"><input id="resubmitConfirm" type="checkbox"> 我已核对本次限定修正，并确认重新签字提交。</label><button id="resubmitReturnedRecord" class="primary wide" type="button">重新签字并提交</button></section>'
    function updateAfterPlayer() {
      var select = document.getElementById('correctionPlayer')
      var selected = select.options[select.selectedIndex]
      document.getElementById('afterPlayer').textContent = selected ? selected.textContent : '请选择'
    }
    function changeEvent() { selectedId = document.getElementById('correctionEvent').value; renderReturnCorrection(match) }
    document.getElementById('returnCorrectionBack').onclick = function () { renderSubmissionSuccess(match, false) }
    document.getElementById('correctionEvent').onchange = changeEvent
    document.getElementById('correctionPlayer').onchange = updateAfterPlayer
    if (draft.after && draft.after.playerName) document.getElementById('correctionPlayer').value = draft.after.playerName
    updateAfterPlayer()
    function correctionPayload() {
      var playerSelect = document.getElementById('correctionPlayer')
      var option = playerSelect.options[playerSelect.selectedIndex]
      return { matchId: match.matchId, eventId: document.getElementById('correctionEvent').value, playerName: playerSelect.value, playerNumber: option ? option.getAttribute('data-number') || '' : '', reason: document.getElementById('correctionReason').value.trim() }
    }
    document.getElementById('saveCorrection').onclick = function () {
      var payload = correctionPayload()
      if (!payload.playerName || !payload.reason) return toast('请选择修正后的球员并填写修改原因')
      var button = document.getElementById('saveCorrection'); button.disabled = true; button.textContent = '正在暂存…'
      workflow('saveReturnedRecordCorrection', payload).then(function (result) {
        if (!result.success) throw new Error(result.message || '修正暂存失败')
        match.returnedCorrectionDraft = result.data && result.data.correction ? result.data.correction : payload
        toast('限定修正已暂存，请重新签字提交'); button.disabled = false; button.textContent = '已暂存修正'
      }).catch(function (error) { button.disabled = false; button.textContent = '暂存修正'; toast(error.message) })
    }
    document.getElementById('resubmitReturnedRecord').onclick = function () {
      if (!document.getElementById('resubmitConfirm').checked) return toast('请先确认本次限定修正')
      var pointCount = signatureStrokes.reduce(function (count, stroke) { return count + stroke.length }, 0)
      if (pointCount < 8) return toast('请在签字区完成本人签字')
      var payload = correctionPayload()
      if (!payload.playerName || !payload.reason) return toast('请先完成修正内容和修改原因')
      var button = document.getElementById('resubmitReturnedRecord'); button.disabled = true; button.textContent = '正在重新提交…'
      workflow('saveReturnedRecordCorrection', payload).then(function (saved) {
        if (!saved.success) throw new Error(saved.message || '修正暂存失败')
        return workflow('resubmitReturnedRecord', { matchId: match.matchId, signature: { strokes: signatureStrokes } })
      }).then(function (result) {
        if (!result.success) throw new Error(result.message || '重新提交失败')
        match.refereeRecord = result.data && result.data.record ? result.data.record : match.refereeRecord
        match.refereeRecordLocked = true; match.refereeReviewStatus = 'under_review'; match.returnedCorrectionDraft = null
        renderSubmissionSuccess(match, false)
      }).catch(function (error) { button.disabled = false; button.textContent = '重新签字并提交'; toast(error.message) })
    }
    bindSignaturePad()
  }

  function renderMatch(match) {
    if (match.refereeRecordLocked && match.refereeRecord && (match.refereeRecord.reviewStatus === 'returned' || match.refereeReviewStatus === 'returned')) return renderReturnCorrection(match)
    if (match.refereeRecordLocked && match.refereeRecord) return renderSubmissionSuccess(match, false)
    if (match.canManagePreMatch && !(match.preMatch && match.preMatch.completed)) return renderPreMatch(match)
    if (match.canReviewLineups && !match.lineupsLocked) return renderLineupVerification(match)
    if (match.canSubmitReport && match.refereeReportStatus === 'draft') return renderElectronicRecord(match)
    if (match.canSubmitReport) return renderReport(match)
    stopClockTicker()
    app.className = 'page live-match-page'
    currentMatch = match
    var startControl = match.canStart ? '<button id="startMatch" class="start-console">开始比赛并启动计时</button>' : ''
    var finishControl = match.canFinish ? '<button id="finishMatch" class="finish-console">结束比赛</button>' : ''
    var submitControl = match.canSubmitReport ? '<button id="submitReport" class="report-submit">提交裁判报告并锁定</button>' : ''
    app.innerHTML = '<section class="match-head compact"><button id="backButton" class="ghost back">← 返回任务</button><div class="row"><span class="eyebrow">' + escapeHtml(match.tournamentName) + '</span><span class="operator-pill">' + escapeHtml(match.refereeRoleLabel || '操作负责人') + '</span></div><h1>' + escapeHtml(match.teamsText) + '</h1><div class="meta inline-meta"><span>' + escapeHtml(match.matchTimeText) + '</span><span>' + escapeHtml(match.venue) + '</span></div></section>' +
      '<section class="match-console"><div class="console-status"><span class="live-dot ' + (match.clockRunning ? 'is-running' : '') + '"></span><b>' + escapeHtml(match.clockPhaseText || match.matchStatusText) + '</b><span>' + escapeHtml(match.matchStatusText) + '</span></div><div id="matchClock" class="match-clock">' + formatClock(Number(match.clockElapsedSeconds || 0)) + '</div><div class="clock-caption">比赛计时</div>' + clockControls(match) +
      '<div class="scoreboard"><div class="team home"><span>主队</span><strong>' + escapeHtml(match.homeTeamName) + '</strong></div><div class="score-number"><b>' + escapeHtml(match.homeScore) + '</b><i>:</i><b>' + escapeHtml(match.awayScore) + '</b></div><div class="team away"><span>客队</span><strong>' + escapeHtml(match.awayTeamName) + '</strong></div></div>' + startControl + (match.refereeRecordLocked ? '<div class="locked">裁判报告已提交，比分和比赛事件已锁定。</div>' : '') + '</section>' +
      rosterPanel(match) + quickActions(match) + '<div class="finish-area">' + finishControl + submitControl + '</div>' +
      '<div class="panel-title event-heading"><strong>比赛事件</strong><span>共 ' + (match.events || []).length + ' 条</span></div><section class="event-list">' + ((match.events || []).length ? match.events.map(function (item) { return eventCard(item, match.canRecordEvents) }).join('') : '<div class="event-empty"><span>◎</span><p>暂无比赛事件</p><small>点击上方快捷按钮开始记录</small></div>') + '</section>'
    document.getElementById('backButton').onclick = loadWorkbench
    if (document.getElementById('startMatch')) document.getElementById('startMatch').onclick = startMatch
    if (document.getElementById('finishMatch')) document.getElementById('finishMatch').onclick = openFinish
    if (document.getElementById('submitReport')) document.getElementById('submitReport').onclick = submitReport
    Array.prototype.forEach.call(document.querySelectorAll('[data-clock-command]'), function (node) {
      node.onclick = function () { controlClock(node.getAttribute('data-clock-command')) }
    })
    Array.prototype.forEach.call(document.querySelectorAll('[data-quick-type]'), function (node) {
      node.onclick = function () { openEvent(node.getAttribute('data-quick-type')) }
    })
    Array.prototype.forEach.call(document.querySelectorAll('[data-roster-scan]'), function (node) {
      node.onclick = function () { chooseRosterPhoto(node.getAttribute('data-roster-scan')) }
    })
    Array.prototype.forEach.call(document.querySelectorAll('[data-roster-edit]'), function (node) {
      node.onclick = function () { editRoster(node.getAttribute('data-roster-edit')) }
    })
    Array.prototype.forEach.call(document.querySelectorAll('[data-event-id]'), function (node) {
      node.onclick = function () { deleteEvent(node.getAttribute('data-event-id')) }
    })
    startClockTicker()
  }

  function loadMatch(matchId) {
    loading('正在加载比赛…')
    workflow('getRefereeMatch', { matchId: matchId }).then(function (result) {
      if (!result.success) throw new Error(result.message || '比赛加载失败')
      renderMatch((result.data || {}).match || {})
    }).catch(function (error) { showError('比赛加载失败', error.message, function () { loadMatch(matchId) }) })
  }

  function runMatchAction(action, data, successText) {
    loading('正在保存…')
    workflow(action, Object.assign({ matchId: currentMatch.matchId }, data || {})).then(function (result) {
      if (!result.success) throw new Error(result.message || '操作失败')
      toast(successText); loadMatch(currentMatch.matchId)
    }).catch(function (error) { showError('保存失败', error.message, function () { loadMatch(currentMatch.matchId) }) })
  }

  function startMatch() {
    if (confirm('确认本场比赛现在开始？')) runMatchAction('startRefereeMatch', {}, '比赛已开始')
  }

  function controlClock(command) {
    var confirmText = command === 'halftime' ? '确认结束上半场并进入中场休息？' : ''
    if (confirmText && !confirm(confirmText)) return
    runMatchAction('controlRefereeClock', { command: command }, '比赛计时已更新')
  }

  function openEvent(type) {
    var form = document.getElementById('eventForm')
    form.reset()
    form.elements.type.value = type || 'goal'
    form.elements.minute.value = currentMatchMinute()
    document.getElementById('eventDialogTitle').textContent = ({ goal: '记录进球', yellow_card: '记录黄牌', red_card: '记录红牌', substitution: '记录换人', stoppage_time: '记录补时', other: '记录其他事件' })[type] || '记录比赛事件'
    document.getElementById('eventType').dispatchEvent(new Event('change'))
    updateEventPlayerOptions()
    eventDialog.showModal()
  }

  function openFinish() {
    finishDialog.querySelector('[name=homeScore]').value = currentMatch.homeScore || 0
    finishDialog.querySelector('[name=awayScore]').value = currentMatch.awayScore || 0
    document.getElementById('finishHomeLabel').childNodes[0].nodeValue = currentMatch.homeTeamName
    document.getElementById('finishAwayLabel').childNodes[0].nodeValue = currentMatch.awayTeamName
    finishDialog.showModal()
  }

  function deleteEvent(eventId) {
    if (confirm('确认删除这条比赛事件？')) runMatchAction('deleteRefereeEvent', { eventId: eventId }, '事件已删除')
  }

  function submitReport() {
    if (confirm('提交后比分和全部比赛事件将锁定，不能再修改。确认提交裁判报告吗？')) runMatchAction('submitRefereeReport', {}, '裁判报告已提交')
  }

  function parseRosterSelection(value) {
    var text = String(value || '').trim()
    var match = text.match(/^(\d{1,3})号?\s+(.+)$/)
    return match ? { number: match[1], name: match[2].trim() } : { number: '', name: text }
  }

  rosterPhotoInput.onchange = function (event) {
    var file = event.target.files && event.target.files[0]
    if (!file || !currentMatch) return
    var matchId = currentMatch.matchId
    var side = rosterDraft.side
    loading('正在压缩并识别名单…')
    compressRosterImage(file).then(function (imageBase64) {
      return workflow('recognizeRefereeRoster', { matchId: matchId, side: side, imageBase64: imageBase64 })
    }).then(function (result) {
      if (!result.success) throw new Error(result.message || '名单识别失败')
      var data = result.data || {}
      openRosterEditor(side, data.players || [], data.rawLines || [], data.warnings || [])
    }).catch(function (error) {
      showError('名单识别失败', error.message, function () { loadMatch(matchId) })
    })
  }

  document.getElementById('closeRosterDialog').onclick = function () { rosterDialog.close() }
  document.getElementById('addRosterPlayer').onclick = function () {
    rosterDraft.players = collectRosterRows()
    rosterDraft.players.push({ jerseyNumber: '', name: '', role: 'starter' })
    renderRosterRows()
    var rows = document.querySelectorAll('#rosterRows .roster-row')
    if (rows.length) rows[rows.length - 1].querySelector('[data-roster-field=number]').focus()
  }
  document.getElementById('rosterForm').onsubmit = function (event) {
    event.preventDefault()
    var players = collectRosterRows()
    if (!players.length) return toast('请至少录入1名球员')
    if (players.some(function (player) { return !player.name })) return toast('请补全所有球员姓名')
    var side = rosterDraft.side
    var matchId = currentMatch.matchId
    var button = event.target.querySelector('[type=submit]')
    button.disabled = true; button.textContent = '正在保存…'
    workflow('saveRefereeRoster', { matchId: matchId, side: side, players: players }).then(function (result) {
      if (!result.success) throw new Error(result.message || '名单保存失败')
      rosterDialog.close(); toast(result.message || '名单已保存'); loadMatch(matchId)
    }).catch(function (error) {
      button.disabled = false; button.textContent = '确认并保存本场名单'; toast(error.message)
    })
  }
  document.getElementById('eventTeamSide').onchange = updateEventPlayerOptions
  document.getElementById('eventType').onchange = function (event) {
    var type = event.target.value
    document.getElementById('playerField').style.display = ['stoppage_time', 'other'].indexOf(type) >= 0 ? 'none' : 'grid'
    document.getElementById('assistField').style.display = ['goal', 'substitution'].indexOf(type) >= 0 ? 'grid' : 'none'
  }
  document.getElementById('closeEventDialog').onclick = function () { eventDialog.close() }
  document.getElementById('closeFinishDialog').onclick = function () { finishDialog.close() }
  document.getElementById('eventForm').onsubmit = function (event) {
    event.preventDefault()
    var form = new FormData(event.target); var minute = Number(form.get('minute'))
    if (!Number.isInteger(minute) || minute < 0 || minute > 130) return toast('请输入0至130之间的比赛分钟')
    eventDialog.close()
    var selectedPlayer = parseRosterSelection(form.get('playerName'))
    var selectedAssist = parseRosterSelection(form.get('assistName'))
    runMatchAction('addRefereeEvent', {
      type: form.get('type'), teamSide: form.get('teamSide'), minute: minute,
      playerName: selectedPlayer.name, playerNumber: selectedPlayer.number,
      assistName: selectedAssist.name, assistNumber: selectedAssist.number,
      description: String(form.get('description') || '').trim()
    }, '比赛事件已保存')
    event.target.reset()
  }
  document.getElementById('finishForm').onsubmit = function (event) {
    event.preventDefault(); var form = new FormData(event.target)
    var homeScore = Number(form.get('homeScore')); var awayScore = Number(form.get('awayScore'))
    if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0 || homeScore > 99 || awayScore > 99) return toast('请输入0至99之间的有效比分')
    finishDialog.close(); runMatchAction('finishRefereeMatch', { homeScore: homeScore, awayScore: awayScore }, '比分已确认')
  }

  function setParentShell() {
    var topbar = document.querySelector('.topbar')
    document.body.classList.add('parent-service-shell')
    document.title = '补充球员资料｜赛小蜂足球'
    if (topbar) topbar.hidden = true
  }

  function parentBirthMonth(value) {
    var text = String(value || '')
    var match = text.match(/^(\d{4})-(\d{2})/)
    return match ? match[1] + '年' + match[2] + '月' : (text || '待补充')
  }

  function parentCompetitionAge(value) {
    var year = Number(String(value || '').slice(0, 4))
    if (!year) return '待核验'
    return Math.max(0, new Date().getFullYear() - year) + '岁'
  }

  function parentFullBirthDate(value) {
    var match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
    return match ? match[1] + '年' + match[2] + '月' + match[3] + '日' : '待核验'
  }

  function renderParentInvite(data) {
    setParentShell()
    app.className = 'page parent-profile-page'
    app.innerHTML = '<section class="parent-match-hero"><button id="parentInviteBack" class="parent-match-back" type="button" aria-label="返回">‹</button><div><h1>补充球员资料</h1><p>' + escapeHtml(data.teamName || '球队') + ' · 家长专属入口</p></div><strong>1/5</strong></section>' +
      '<main class="parent-match-content"><section class="parent-privacy-banner"><span class="parent-shield" aria-hidden="true">✓</span><p>为保护隐私，您只能匹配自己的孩子，无法查看整队名单。</p></section>' +
      '<section class="parent-match-card"><h2>确认您的孩子</h2><p class="parent-match-subtitle">我们将根据您已验证的手机号进行匹配</p><div class="parent-phone-verified"><span>●</span><strong>已验证手机号</strong><b>' + escapeHtml(data.guardianPhoneMasked || '待核验') + '</b></div>' +
      '<p class="parent-match-found"><span aria-hidden="true"></span>系统已为您匹配到以下孩子</p><article class="parent-child-card"><div class="parent-child-avatar"><b>' + escapeHtml(String(data.playerName || '球员').slice(0, 1)) + '</b><span>球员</span></div><div class="parent-child-main"><h3>' + escapeHtml(data.playerName || '球员') + '</h3><dl><div><dt>出生年月</dt><dd>' + escapeHtml(parentBirthMonth(data.birthDate)) + '</dd></div><div><dt>比赛日年龄</dt><dd>' + escapeHtml(parentCompetitionAge(data.birthDate)) + '</dd></div><div><dt>状态</dt><dd><span>待家长补充</span></dd></div></dl></div></article>' +
      '<button id="parentContinue" class="parent-match-primary" type="button"><span>✓</span>这是我的孩子，开始补充</button></section>' +
      '<div class="parent-no-match"><span></span><b>没有匹配到？</b><span></span></div><button id="parentInviteHelp" class="parent-match-secondary" type="button">联系球队负责人核对邀请</button><p class="parent-help-copy">邀请只对应一名已建档球员；资料不一致时，请由球队负责人重新核对并生成邀请。</p>' +
      '<section class="parent-entry-boundary"><span class="parent-shield parent-shield-lock" aria-hidden="true">✓</span><p>本入口仅用于本次赛事资料补充，不公开监护人手机号。</p></section></main>'
    document.getElementById('parentContinue').onclick = function () {
      var continueButton = document.getElementById('parentContinue')
      if (continueButton.disabled) return
      var inviteToken = String(data.parentInvite || new URLSearchParams(location.search).get('parentInvite') || '').trim()
      var sessionToken = localStorage.getItem(PARENT_SESSION_KEY) || ''
      var boundInvite = sessionStorage.getItem(PARENT_PENDING_KEY) || ''
      continueButton.disabled = true
      continueButton.setAttribute('aria-busy', 'true')
      if (sessionToken && boundInvite && boundInvite === inviteToken) {
        continueButton.textContent = '正在打开资料…'
        loadParentBasicForm()
      }
      else {
        localStorage.removeItem(PARENT_SESSION_KEY)
        if (inviteToken) sessionStorage.setItem(PARENT_PENDING_KEY, inviteToken)
        continueButton.textContent = '正在进入授权…'
        beginParentOAuth()
      }
    }
    document.getElementById('parentInviteBack').onclick = function () { if (history.length > 1) history.back(); else { window.close(); toast('请返回微信继续使用') } }
    document.getElementById('parentInviteHelp').onclick = function () { toast('请联系发送本邀请的球队负责人重新核对球员资料') }
  }

  function loadParentInvite(token) {
    loading('正在核验家长协作邀请…')
    api({ action: 'previewParentProfileInvite', parentInvite: token }).then(function (result) {
      if (!result.success) throw new Error(result.error || '家长协作链接无效')
      renderParentInvite(Object.assign({}, result.data || {}, { parentInvite: token }))
    }).catch(function (error) { showError('暂时无法打开邀请', error.message, function () { loadParentInvite(token) }) })
  }

  function beginParentOAuth() {
    if (parentOAuthBusy) return
    var token = new URLSearchParams(location.search).get('parentInvite') || sessionStorage.getItem(PARENT_PENDING_KEY) || ''
    if (!token) return showError('邀请已失效', '未找到家长协作邀请，请从球队发送的链接重新进入。', function () { location.reload() })
    parentOAuthBusy = true
    loading('正在连接服务号授权…')
    api({ action: 'parentProfileOAuthUrl', parentInvite: token }).then(function (result) {
      if (!result.success) throw new Error(result.error || '服务号授权入口暂不可用')
      sessionStorage.setItem(PARENT_PENDING_KEY, token)
      window.location.replace(result.authorizeUrl)
    }).catch(function (error) {
      parentOAuthBusy = false
      showError('暂时无法继续', error.message, beginParentOAuth)
    })
  }

  function completeParentOAuth(code, state) {
    loading('正在确认家长服务会话…')
    api({ action: 'parentProfileOAuth', code: code, state: state }).then(function (result) {
      if (!result.success || !result.parentSessionToken) throw new Error(result.error || '服务号授权失败')
      localStorage.setItem(PARENT_SESSION_KEY, result.parentSessionToken)
      sessionStorage.setItem(PARENT_PENDING_KEY, result.parentInvite || '')
      history.replaceState({}, document.title, location.pathname + '?parentInvite=' + encodeURIComponent(result.parentInvite || ''))
      loadParentBasicForm()
    }).catch(function (error) { showError('服务号授权失败', error.message, beginParentOAuth) })
  }

  function parentApi(action, data) {
    var queryInvite = new URLSearchParams(location.search).get('parentInvite') || ''
    var pendingInvite = sessionStorage.getItem(PARENT_PENDING_KEY) || ''
    return api(Object.assign({ action: action, parentSessionToken: localStorage.getItem(PARENT_SESSION_KEY) || '', parentInvite: queryInvite || pendingInvite }, data || {}))
  }

  function loadParentBasicForm() {
    loading('正在读取家长确认资料…')
    parentApi('getParentProfileDraft').then(function (result) {
      if (!result.success) throw new Error(result.error || '家长服务会话已失效')
      var draft = result.draft || {}
      if (draft.needsManualReview && draft.manualReviewStatus !== 'resolved') return renderParentBasicManualReview(result.data || {}, draft)
      renderParentBasicForm(result.data || {}, draft)
    }).catch(function (error) { localStorage.removeItem(PARENT_SESSION_KEY); showError('暂时无法继续', error.message, beginParentOAuth) })
  }

  function renderParentBasicManualReview(data, draft) {
    setParentShell()
    app.className = 'page parent-profile-page parent-basic-review-page'
    app.innerHTML = '<section class="parent-hero"><span>赛小蜂足球 · 家长服务</span><h1>资料正在人工核验</h1><p>' + escapeHtml(data.playerName || '球员') + ' · ' + escapeHtml(data.teamName || '球队') + '</p></section>' +
      '<section class="parent-card parent-manual-review-card"><div class="parent-result-emblem parent-result-pending"><span></span></div><h2>请等待球队管理员核对</h2><p class="muted">您提交的姓名或出生日期与球队现有资料不一致。核验完成前不能继续实名认证或形象照步骤，也不会覆盖历史赛事资料。</p><dl class="parent-manual-review-meta"><div><dt>提交姓名</dt><dd>' + escapeHtml(draft.requestedName || '待核验') + '</dd></div><div><dt>提交出生日期</dt><dd>' + escapeHtml(draft.requestedBirthDate || '待核验') + '</dd></div></dl><button id="parentManualReviewRefresh" class="primary wide" type="button">刷新核验状态</button><button id="parentManualReviewBack" class="secondary wide" type="button">返回邀请页</button></section>'
    document.getElementById('parentManualReviewRefresh').onclick = loadParentBasicForm
    document.getElementById('parentManualReviewBack').onclick = function () { loadParentInvite(sessionStorage.getItem(PARENT_PENDING_KEY) || '') }
  }

  function renderParentBasicForm(data, draft) {
    setParentShell()
    app.className = 'page parent-profile-page'
    var selectedRelation = ['father', 'mother', 'other'].indexOf(draft.guardianRelation) >= 0 ? draft.guardianRelation : 'father'
    var requestedName = draft.requestedName || data.playerName || ''
    var requestedBirthDate = draft.requestedBirthDate || data.birthDate || ''
    app.innerHTML = '<section class="parent-match-hero parent-basic-hero"><button id="parentBack" class="parent-match-back" type="button" aria-label="返回">‹</button><div><h1>确认基础资料</h1><p>' + escapeHtml(data.playerName || '球员') + ' · ' + escapeHtml(data.teamName || '球队') + '</p></div><strong>2/5</strong></section>' +
      '<main class="parent-basic-content"><p class="parent-basic-intro">请先核对教练登记的信息，证件信息将在下一步自动识别。</p><section class="parent-basic-card"><h2>球员基础信息</h2><dl class="parent-basic-list"><div><dt>球员姓名</dt><dd>' + escapeHtml(data.playerName || '待补充') + '<span>✓</span></dd></div><div><dt>出生年月</dt><dd>' + escapeHtml(parentBirthMonth(data.birthDate)) + '<span>✓</span></dd></div><div><dt>比赛日年龄</dt><dd>' + escapeHtml(parentCompetitionAge(data.birthDate)) + '<span>✓</span></dd></div><div><dt>所属球队</dt><dd>' + escapeHtml(data.teamName || '待核验') + '<span>✓</span></dd></div></dl><details class="parent-correction"><summary>姓名或出生年月有误？提交更正</summary><div><label>正确姓名<input id="parentName" maxlength="30" value="' + escapeHtml(requestedName) + '"></label><label>正确出生日期<input id="parentBirthDate" type="date" value="' + escapeHtml(requestedBirthDate) + '"></label><p>更正将进入人工核验，核验前不能继续实名步骤，也不会覆盖历史赛事资料。</p></div></details></section>' +
      '<section class="parent-basic-card parent-guardian-card"><h2>监护关系</h2><div class="parent-relation-options"><label><input type="radio" name="guardianRelation" value="father"' + (selectedRelation === 'father' ? ' checked' : '') + '><span></span>父亲</label><label><input type="radio" name="guardianRelation" value="mother"' + (selectedRelation === 'mother' ? ' checked' : '') + '><span></span>母亲</label><label><input type="radio" name="guardianRelation" value="other"' + (selectedRelation === 'other' ? ' checked' : '') + '><span></span>其他监护人</label></div><div class="parent-verified-phone"><span>✓</span>已验证手机号　<strong>' + escapeHtml(data.guardianPhoneMasked || '待核验') + '</strong></div></section>' +
      '<div class="parent-basic-warning"><span class="parent-shield" aria-hidden="true">✓</span><p>如姓名或出生年月有误，请提交更正并等待人工核验，避免实名认证失败。</p></div><label class="parent-basic-consent"><input id="parentConsent" type="checkbox"' + (draft.guardianAuthorized ? ' checked' : '') + '><span></span><b>我确认是该球员监护人，并同意为本次赛事提交必要资料</b></label><button id="saveParentBasic" class="parent-match-primary parent-basic-next" type="button">信息无误，下一步</button><button id="parentRematch" class="parent-match-secondary" type="button">返回重新匹配</button></main>'
    document.getElementById('parentBack').onclick = function () { loadParentInvite(sessionStorage.getItem(PARENT_PENDING_KEY) || '') }
    document.getElementById('parentRematch').onclick = function () { loadParentInvite(sessionStorage.getItem(PARENT_PENDING_KEY) || '') }
    document.getElementById('saveParentBasic').onclick = function () {
      var relation = document.querySelector('[name=guardianRelation]:checked')
      if (!relation) return toast('请选择与球员的监护关系')
      if (!document.getElementById('parentConsent').checked) return toast('请先确认监护人授权')
      var button = document.getElementById('saveParentBasic'); button.disabled = true; button.textContent = '正在保存确认…'
      parentApi('saveParentBasicProfile', { name: document.getElementById('parentName').value.trim(), birthDate: document.getElementById('parentBirthDate').value, guardianRelation: relation.value, guardianAuthorized: true }).then(function (result) {
        if (!result.success) throw new Error(result.error || '保存失败')
        if (result.needsManualReview) return showError('资料已提交人工核验', '姓名或出生年月与球队现有资料不一致，核验完成前不能继续实名与形象照步骤。', function () { loadParentBasicForm() })
        toast(result.nextStep === 'submit' ? '基础资料已确认，正在提交资料' : '基础资料已确认，进入下一步')
        if (result.nextStep === 'submit') submitParentProfile(data)
        else renderParentNextStep(Object.assign({}, data, { requirements: result.requirements || data.requirements || {} }))
      }).catch(function (error) { button.disabled = false; button.textContent = '信息无误，下一步'; toast(error.message) })
    }
  }

  function submitParentProfile(data) {
    loading('正在提交家长资料…')
    parentApi('completeParentProfile').then(function (result) {
      if (!result.success) throw new Error(result.error || '资料提交失败')
      renderParentSubmitSuccess(Object.assign({}, result, { requirements: result.requirements || (data && data.requirements) || {} }))
    }).catch(function (error) { showError('资料提交失败', error.message, function () { submitParentProfile(data) }) })
  }

  function renderParentNextStep(data) {
    setParentShell()
    app.className = 'page parent-profile-page'
    var requirements = (data && data.requirements) || {}
    var needsIdentity = requirements.realName === true
    var needsPortrait = requirements.portrait === true
    var nextTitle = needsIdentity ? '下一步：实名认证' : (needsPortrait ? '下一步：标准形象照' : '下一步：提交资料')
    var nextCopy = needsIdentity
      ? '身份材料只用于赛事报名与身份核验。上传、核验结果、拍摄和透明人像确认会保留独立流程记录。'
      : (needsPortrait ? '本次邀请未开启实名认证，接下来补充标准形象照并提交资料。' : '本次邀请未开启实名认证或标准形象照要求，基础资料确认后即可提交。')
    var buttonText = needsIdentity ? '开始实名认证' : (needsPortrait ? '开始拍摄标准形象照' : '提交资料')
    app.innerHTML = '<section class="parent-hero"><span>赛小蜂足球 · 家长服务</span><h1>基础资料已确认</h1><p>仅展示本次邀请已开启的资料要求。</p></section><section class="parent-card"><h2>' + nextTitle + '</h2><p class="muted">' + nextCopy + '</p><button id="parentNextStep" class="primary wide">' + buttonText + '</button></section>'
    document.getElementById('parentNextStep').onclick = function () {
      if (needsIdentity) renderParentIdentityUpload()
      else if (needsPortrait) renderPortraitGuide(data)
      else submitParentProfile(data)
    }
  }

  function readParentImage(file) {
    return new Promise(function (resolve, reject) { var reader = new FileReader(); reader.onload = function () { resolve(reader.result) }; reader.onerror = function () { reject(new Error('读取材料失败')) }; reader.readAsDataURL(file) })
  }

  function validateParentIdentityFile(file) {
    if (!file) return '请先拍摄或选择身份证人像面'
    if (['image/jpeg', 'image/png'].indexOf(file.type) < 0) return '仅支持 JPG 或 PNG 图片'
    if (file.size > 3 * 1024 * 1024) return '图片不能超过 3MB'
    return ''
  }

  function validateParentPortraitFile(file) {
    if (!file) return '请先拍摄或选择一张照片'
    if (['image/jpeg', 'image/png'].indexOf(file.type) < 0) return '仅支持 JPG 或 PNG 照片'
    if (file.size > 3 * 1024 * 1024) return '照片不能超过 3MB'
    return ''
  }

  function renderParentIdentityUpload() {
    setParentShell()
    app.className = 'page parent-profile-page parent-identity-page'
    app.innerHTML = '<header class="parent-match-hero parent-basic-hero parent-identity-hero"><button id="identityBackButton" class="parent-match-back" type="button" aria-label="返回"><span></span></button><div><h1>实名认证</h1><p>球员实名 · 专业版参赛资格</p></div><strong>3/5</strong></header>' +
      '<main class="parent-identity-content"><section class="parent-privacy-banner parent-identity-banner"><span class="parent-shield" aria-hidden="true"></span><p>只需上传球员本人身份证人像面，<br>不需要学籍证明，不需要人脸识别。</p></section>' +
      '<section class="parent-identity-card"><h2>上传身份证实名</h2><p class="parent-identity-subtitle">请上传球员本人身份证人像面</p><div class="parent-id-dropzone" aria-hidden="true"><div class="parent-id-illustration"><span class="parent-id-lines"></span><span class="parent-id-scan"><i></i></span><span class="parent-id-person"></span><b>身份证人像面</b></div></div>' +
      '<div id="identityUploadStatus" class="parent-upload-status"><span></span><b>未上传</b></div>' +
      '<input id="identityCamera" class="visually-hidden" type="file" accept="image/jpeg,image/png" capture="environment"><input id="identityAlbum" class="visually-hidden" type="file" accept="image/jpeg,image/png">' +
      '<button id="identityCameraButton" class="parent-upload-action parent-upload-camera" type="button"><span class="parent-camera-icon"></span>拍摄身份证（推荐）</button><button id="identityAlbumButton" class="parent-upload-action parent-upload-album" type="button"><span class="parent-album-icon"></span>从相册选择</button></section>' +
      '<section class="parent-identity-requirements"><h2>拍摄要求</h2><ul><li><span aria-hidden="true"></span><p><b>四角完整：</b>证件四角需在画面内，无遮挡或缺角</p></li><li><span aria-hidden="true"></span><p><b>文字清晰：</b>所有文字清晰可辨，避免模糊</p></li><li><span aria-hidden="true"></span><p><b>无反光遮挡：</b>避免强光、反光或手指遮挡关键信息</p></li></ul></section>' +
      '<section class="parent-identity-safety"><h2><span class="parent-lock-icon"></span>隐私安全说明</h2><ul><li>用于 OCR 读取姓名、身份证号、出生日期、性别；</li><li>球队和裁判只能查看“已实名/未实名”状态，不能查看身份证原图；</li><li>证件数据加密存储，严格保护用户隐私安全。</li></ul></section>' +
      '<button id="submitIdentity" class="parent-identity-submit" type="button" disabled>上传并开始识别</button></main>'
    var selectedIdentityFile = null
    var cameraInput = document.getElementById('identityCamera')
    var albumInput = document.getElementById('identityAlbum')
    var status = document.getElementById('identityUploadStatus')
    var submit = document.getElementById('submitIdentity')
    var identityUploadCompleted = false
    function setUploadStatus(kind, text) {
      status.className = 'parent-upload-status parent-upload-status-' + kind
      status.querySelector('b').textContent = text
    }
    function chooseIdentity(file) {
      identityUploadCompleted = false
      var error = validateParentIdentityFile(file)
      if (error) { selectedIdentityFile = null; submit.disabled = true; setUploadStatus('error', error); return toast(error) }
      selectedIdentityFile = file
      submit.disabled = false
      setUploadStatus('ready', '已选择，等待安全上传')
    }
    cameraInput.onchange = function () { chooseIdentity(cameraInput.files[0]) }
    albumInput.onchange = function () { chooseIdentity(albumInput.files[0]) }
    document.getElementById('identityCameraButton').onclick = function () { cameraInput.click() }
    document.getElementById('identityAlbumButton').onclick = function () { albumInput.click() }
    document.getElementById('identityBackButton').onclick = loadParentBasicForm
    submit.onclick = function () {
      var error = validateParentIdentityFile(selectedIdentityFile)
      if (error) return toast(error)
      submit.disabled = true; submit.textContent = '正在安全上传…'; setUploadStatus('uploading', '正在加密上传')
      readParentImage(selectedIdentityFile).then(function (base64Data) {
        return parentApi('uploadParentIdentityDocument', { side: 'front', base64Data: base64Data })
      }).then(function (uploadResult) {
        selectedIdentityFile = null; cameraInput.value = ''; albumInput.value = ''
        if (!uploadResult.success) throw new Error(uploadResult.error || '身份证人像面上传失败')
        identityUploadCompleted = true
        setUploadStatus('success', '上传完成，正在提交识别')
        submit.textContent = '正在提交识别…'
        return parentApi('submitParentIdentityVerification')
      }).then(function (result) {
        if (!result.success) throw new Error(result.error || '实名核验提交失败')
        loadParentIdentityResult()
      }).catch(function (uploadError) {
        submit.disabled = !selectedIdentityFile
        submit.textContent = identityUploadCompleted ? '请重新读取审核状态' : '重新上传并开始识别'
        setUploadStatus('error', identityUploadCompleted ? '材料已上传，提交未完成，请刷新状态或重新上传' : '上传失败，请重试')
        toast(uploadError.message)
      })
    }
  }

  function renderParentIdentityPending() {
    setParentShell()
    app.className = 'page parent-profile-page'
    app.innerHTML = '<section class="parent-hero"><span>赛小蜂足球 · 家长服务</span><h1>实名认证已提交</h1><p>材料已进入受限核验队列。核验结果会决定是否可继续标准形象照步骤。</p></section><section class="parent-card"><h2>等待核验结果</h2><p class="muted">请勿重复上传或将身份材料发送到群聊。若材料不清晰，将在本页显示补充原因。</p><button id="identityRefresh" class="primary wide">刷新核验状态</button></section>'
    document.getElementById('identityRefresh').onclick = loadParentIdentityResult
  }

  function loadParentIdentityResult() {
    loading('正在读取实名认证结果…')
    parentApi('getParentIdentityVerification').then(function (result) {
      if (!result.success) throw new Error(result.error || '读取审核状态失败')
      renderParentIdentityResult(result.data || {})
    }).catch(function (error) { showError('暂时无法读取审核结果', error.message, loadParentIdentityResult) })
  }

  function renderParentIdentityResult(data) {
    setParentShell()
    var status = data.status || 'pending_review'
    var requirements = data.requirements || { realName: false, portrait: false }
    var approved = status === 'approved', rejected = status === 'rejected', notStarted = status === 'not_started'
    var title = approved ? '实名认证通过' : (rejected ? '实名认证需要补充' : (notStarted ? '尚未提交实名认证' : '实名认证审核中'))
    var subtitle = approved ? '姓名与身份证号匹配，球员身份已建立' : (rejected ? '请根据审核原因重新上传清晰材料' : (notStarted ? '请先上传球员本人身份证人像面' : '材料已进入受限审核队列，请耐心等待'))
    var stateClass = approved ? 'approved' : (rejected ? 'rejected' : (notStarted ? 'not-started' : 'pending'))
    var details = ''
    var actions = ''
    if (approved) {
      details = '<section class="parent-result-card parent-result-information"><h2>认证信息</h2><dl><div><dt>姓名</dt><dd>' + escapeHtml(data.playerName || '球员') + '</dd></div><div><dt>身份证号</dt><dd>' + escapeHtml(data.identityNumberMasked || '仅系统加密保存') + '</dd></div><div><dt>出生日期</dt><dd>' + escapeHtml(parentFullBirthDate(data.verifiedBirthDate || data.birthDate)) + '</dd></div><div><dt>性别</dt><dd>' + escapeHtml(data.gender || '待核验') + '</dd></div><div><dt>比赛日年龄</dt><dd>' + escapeHtml(parentCompetitionAge(data.verifiedBirthDate || data.birthDate)) + '</dd></div><div><dt>资格状态</dt><dd class="parent-result-qualified">' + escapeHtml(data.qualificationStatusText || '实名核验已通过') + '</dd></div></dl><p class="parent-result-audit">审核完成：' + escapeHtml(displayTime(data.reviewedAt)) + '</p></section>' +
        '<section class="parent-result-card parent-document-safe"><h2>证件原图 <span>（仅系统加密保存）</span></h2><div class="parent-document-summary"><span class="parent-document-placeholder" aria-hidden="true"><i></i></span><p><b class="parent-mini-shield"></b>加密保存，仅授权系统核验</p></div></section>' +
        '<section class="parent-result-notice"><span class="parent-mini-shield" aria-hidden="true"></span><p>本次实名结果将绑定球员平台档案，后续赛事经监护人授权可复用，无需重复上传。</p></section>'
      actions = (requirements.portrait === true ? '<button id="portraitNext" class="parent-result-primary" type="button">下一步：拍摄球员形象照</button>' : '<button id="submitParentProfile" class="parent-result-primary" type="button">提交资料</button>') + '<button id="requestIdentityCorrection" class="parent-result-secondary" type="button"' + (data.correctionRequested ? ' disabled' : '') + '>' + (data.correctionRequested ? '更正申请处理中' : '信息有误，申请更正') + '</button>'
    } else if (rejected) {
      details = '<section class="parent-result-card parent-result-review"><h2>审核结果</h2><dl><div><dt>提交时间</dt><dd>' + escapeHtml(displayTime(data.submittedAt)) + '</dd></div><div><dt>审核状态</dt><dd class="parent-result-rejected-text">需要补充材料</dd></div></dl><div class="parent-result-reason"><b>退回原因</b><p>' + escapeHtml(data.reason || '证件人像面不够清晰或信息不完整，请重新拍摄后提交。') + '</p></div></section><section class="parent-result-notice parent-result-notice-warning"><span aria-hidden="true"></span><p>重新上传只替换本次待核验材料，不会修改球队长期资料或历史赛事快照。</p></section>'
      actions = '<button id="retryIdentity" class="parent-result-primary" type="button">重新上传身份证人像面</button>'
    } else if (notStarted) {
      details = '<section class="parent-result-card parent-result-review"><h2>尚未提交</h2><p>完成基础资料确认后，请上传球员本人身份证人像面进行实名核验。</p></section>'
      actions = '<button id="startIdentity" class="parent-result-primary" type="button">上传身份证人像面</button>'
    } else {
      details = '<section class="parent-result-card parent-result-review"><h2>审核详情</h2><dl><div><dt>提交时间</dt><dd>' + escapeHtml(displayTime(data.submittedAt)) + '</dd></div><div><dt>当前状态</dt><dd class="parent-result-pending-text">等待受限审核</dd></div></dl><p>审核完成后本页会显示通过结果或明确的补充原因。家长端不能修改审核结论。</p></section><section class="parent-result-notice"><span class="parent-mini-shield" aria-hidden="true"></span><p>证件原图不会在页面展示，也不会提供公开访问链接。</p></section>'
      actions = '<button id="refreshIdentity" class="parent-result-primary" type="button">刷新审核状态</button>'
    }
    app.className = 'page parent-profile-page parent-result-page'
    app.innerHTML = '<header class="parent-match-hero parent-basic-hero parent-result-header"><button id="parentResultBack" class="parent-match-back" type="button" aria-label="返回"><span></span></button><div><h1>实名认证结果</h1><p>' + escapeHtml(data.playerName || '球员') + ' · ' + escapeHtml(data.teamName || '专业版参赛资格') + '</p></div><strong>3/5</strong></header><main class="parent-result-content"><section class="parent-result-hero parent-result-' + stateClass + '"><div class="parent-result-emblem" aria-hidden="true"><span></span></div><h2>' + escapeHtml(title) + '</h2><p>' + escapeHtml(subtitle) + '</p></section>' + details + '<div class="parent-result-actions">' + actions + '</div></main>'
    document.getElementById('parentResultBack').onclick = function () { if (history.length > 1) history.back(); else { window.close(); toast('请返回微信继续使用') } }
    var retry = document.getElementById('retryIdentity'), start = document.getElementById('startIdentity'), refresh = document.getElementById('refreshIdentity'), portrait = document.getElementById('portraitNext'), submit = document.getElementById('submitParentProfile')
    if (retry || start) (retry || start).onclick = renderParentIdentityUpload
    if (refresh) refresh.onclick = loadParentIdentityResult
    if (portrait) portrait.onclick = function () { renderPortraitGuide(data) }
    if (submit) submit.onclick = function () { submitParentProfile(data) }
    var correction = document.getElementById('requestIdentityCorrection')
    if (correction && !data.correctionRequested) correction.onclick = function () {
      if (!window.confirm('确认实名信息有误并提交人工核对申请？提交后不会自动修改当前实名结果。')) return
      correction.disabled = true; correction.textContent = '正在提交更正申请…'
      parentApi('requestParentIdentityCorrection', { reason: '家长反馈实名信息有误，请人工核对' }).then(function (result) {
        if (!result.success) throw new Error(result.error || '更正申请提交失败')
        correction.textContent = '更正申请处理中'
        toast(result.duplicate ? '更正申请已在处理中' : '已提交人工核对申请')
      }).catch(function (error) { correction.disabled = false; correction.textContent = '信息有误，申请更正'; toast(error.message) })
    }
  }

  function renderPortraitGuide(data) {
    setParentShell()
    var playerName = data && data.playerName ? data.playerName : '球员'
    app.className = 'page parent-profile-page parent-guide-page'
    app.innerHTML = '<header class="parent-match-hero parent-basic-hero parent-guide-header"><button id="portraitGuideBack" class="parent-match-back" type="button" aria-label="返回"><span></span></button><div><h1>拍摄球员形象照</h1><p>' + escapeHtml(playerName) + ' · 让球队形象更统一</p></div><strong>4/5</strong></header>' +
      '<main class="parent-guide-content"><section class="parent-guide-hero"><div class="parent-guide-visual" aria-hidden="true"><div class="parent-guide-person"><i></i><b></b></div><span class="parent-frame-corner parent-frame-corner-tl"></span><span class="parent-frame-corner parent-frame-corner-tr"></span><span class="parent-frame-corner parent-frame-corner-bl"></span><span class="parent-frame-corner parent-frame-corner-br"></span></div><div class="parent-guide-checks"><strong>标准示例</strong><ul><li><span aria-hidden="true"></span>穿本队球衣效果更好</li><li><span aria-hidden="true"></span>正面看镜头</li><li><span aria-hidden="true"></span>双臂交叉</li><li><span aria-hidden="true"></span>头部、手臂和腰部完整入镜</li></ul></div></section>' +
      '<section class="parent-guide-errors"><h2>常见错误示例</h2><div class="parent-guide-error-grid"><article class="guide-error guide-error-close"><div aria-hidden="true"><i></i></div><span class="guide-error-mark" aria-hidden="true"></span><p>距离过近</p></article><article class="guide-error guide-error-crop"><div aria-hidden="true"><i></i></div><span class="guide-error-mark" aria-hidden="true"></span><p>头像裁切</p></article><article class="guide-error guide-error-dark"><div aria-hidden="true"><i></i></div><span class="guide-error-mark" aria-hidden="true"></span><p>光线太暗</p></article></div></section>' +
      '<section class="parent-guide-notice"><span class="parent-bulb-icon" aria-hidden="true"></span><p>球衣是建议，不作为提交限制；系统会自动去除背景并生成透明人像图。</p></section>' +
      '<div class="parent-guide-actions"><button id="openPortraitCamera" class="parent-guide-camera" type="button"><span class="parent-camera-icon"></span>立即拍摄标准形象照（推荐）</button><button id="openPortraitAlbum" class="parent-guide-album" type="button"><span class="parent-album-icon"></span>从相册选择已有照片</button></div></main>'
    document.getElementById('portraitGuideBack').onclick = loadParentIdentityResult
    document.getElementById('openPortraitCamera').onclick = function () { renderPortraitCamera('camera', data) }
    document.getElementById('openPortraitAlbum').onclick = function () { renderPortraitCamera('album', data) }
  }

  function renderPortraitCamera(source, data) {
    setParentShell()
    var useCamera = source !== 'album'
    var playerName = data && data.playerName ? data.playerName : '球员'
    app.className = 'page parent-profile-page parent-camera-page'
    app.innerHTML = '<header class="parent-camera-topbar"><button id="portraitCameraBack" class="parent-camera-back" type="button" aria-label="返回"><span></span></button><h1>拍摄标准形象照</h1><div class="parent-camera-top-actions"><button id="portraitMute" type="button" aria-label="静音"><span></span></button><button id="portraitHelp" type="button" aria-label="拍摄帮助">?</button></div></header>' +
      '<main class="parent-camera-stage-page"><section id="portraitStage" class="parent-camera-stage"><div class="parent-camera-tip">请让球员站入轮廓内</div><div class="parent-camera-silhouette" aria-hidden="true"><i></i><b></b></div><span class="parent-camera-corner parent-camera-corner-tl"></span><span class="parent-camera-corner parent-camera-corner-tr"></span><span class="parent-camera-corner parent-camera-corner-bl"></span><span class="parent-camera-corner parent-camera-corner-br"></span><div class="parent-camera-quality"><span><i></i>距离合适</span><span><i></i>光线良好</span><span><i></i>人物清晰</span><span><i></i>姿势完整</span></div><div class="parent-camera-hint">保持不动，系统将自动检查照片质量</div><input id="portraitFile" class="visually-hidden" type="file" accept="image/jpeg,image/png"' + (useCamera ? ' capture="user"' : '') + '><div class="parent-camera-controls"><button id="portraitThumbnail" class="parent-camera-thumbnail" type="button" aria-label="从相册选择"><span></span></button><button id="capturePortraitButton" class="parent-camera-shutter" type="button" aria-label="' + (useCamera ? '拍摄照片' : '从相册选择照片') + '"><span></span></button><button id="portraitFlip" class="parent-camera-flip" type="button" aria-label="切换摄像头"><span></span></button></div></section><section class="parent-camera-privacy"><span class="parent-mini-shield" aria-hidden="true"></span><p>照片只用于生成标准透明人像，原图与派生图均受限保存，不会公开展示。</p></section><p id="portraitCameraStatus" class="parent-camera-status">' + (useCamera ? '点击中央按钮拍摄，或从左下角选择已有照片' : '请选择一张清晰的单人正面照片') + '</p></main>'
    var input = document.getElementById('portraitFile')
    var capture = document.getElementById('capturePortraitButton')
    var status = document.getElementById('portraitCameraStatus')
    var stage = document.getElementById('portraitStage')
    function processPortraitFile(file) {
      var validationError = validateParentPortraitFile(file)
      if (validationError) { status.textContent = validationError; return toast(validationError) }
      capture.disabled = true; status.textContent = '正在安全上传并进行人像分割…'; stage.classList.add('is-processing')
      readParentImage(file).then(function (base64Data) { return parentApi('uploadAndProcessParentPortrait', { base64Data: base64Data }) }).then(function (result) {
        if (!result.success) throw new Error(result.error || '人像分割失败')
        input.value = ''
         // 保留实名认证结果带来的球员/球队上下文，重拍或返回取景框时不能退回通用占位。
         renderPortraitConfirmation(Object.assign({}, data || {}, result))
      }).catch(function (error) { capture.disabled = false; stage.classList.remove('is-processing'); status.textContent = '处理失败，请重新拍摄或选择照片'; toast(error.message) })
    }
    document.getElementById('portraitCameraBack').onclick = function () { renderPortraitGuide(data) }
    document.getElementById('portraitHelp').onclick = function () { toast('请保持单人正面、头部和肩部完整入镜') }
    document.getElementById('portraitMute').onclick = function () { toast('已关闭拍摄提示音') }
    document.getElementById('portraitFlip').onclick = function () { stage.classList.toggle('is-front-camera'); toast(stage.classList.contains('is-front-camera') ? '已切换前置摄像头' : '已切换后置摄像头') }
    document.getElementById('portraitThumbnail').onclick = function () { input.removeAttribute('capture'); input.click() }
    capture.onclick = function () { input.click() }
    input.onchange = function () { processPortraitFile(input.files[0]) }
    if (!useCamera) setTimeout(function () { input.removeAttribute('capture'); input.click() }, 0)
  }

  function renderPortraitConfirmation(result) {
    setParentShell()
    app.className = 'page parent-profile-page parent-confirm-page'
    var rawPreview = String(result.transparentPreview || '')
    var previewSrc = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(rawPreview) ? rawPreview : ''
    var previewImage = previewSrc
      ? '<img class="parent-portrait-result-image" src="' + escapeHtml(previewSrc) + '" alt="透明标准形象照">'
      : '<div class="parent-portrait-placeholder"><b>透明人像预览</b><span>本地验收不使用真实儿童照片</span></div>'
    var avatarImage = previewSrc
      ? '<img class="parent-avatar-result-image" src="' + escapeHtml(previewSrc) + '" alt="球员头像裁切预览">'
      : '<div class="parent-avatar-placeholder"><b>球员头像</b><span>透明派生图</span></div>'
    app.innerHTML = '<header class="parent-confirm-header"><button id="portraitConfirmBack" class="parent-confirm-back" type="button" aria-label="返回"><span></span></button><div><h1>确认球员照片</h1><p>球员 · 一次拍摄生成两种素材</p></div><strong>5/5</strong></header><main class="parent-confirm-content"><div class="parent-confirm-status"><span class="parent-mini-shield" aria-hidden="true"></span><b>人像分割完成</b></div>' +
      '<section class="parent-confirm-card parent-standard-card"><div class="parent-confirm-card-head"><div><h2>标准形象照</h2><p>用于阵容海报、球员卡和赛事视觉</p></div><button id="regenerateStandard" class="parent-regenerate" type="button"><span></span>重新生成</button></div><div class="parent-checker parent-standard-preview">' + previewImage + '</div></section>' +
      '<section class="parent-confirm-card parent-avatar-card"><div class="parent-confirm-card-head"><div><h2>球员头像</h2><p>头像来自同一张原图，无需重新拍摄；<br>用于名单、数据榜和小尺寸头像</p></div><button id="regenerateAvatar" class="parent-regenerate" type="button"><span></span>重新生成</button></div><div id="avatarCropStage" class="parent-checker parent-avatar-crop-stage"><div class="parent-avatar-crop-frame">' + avatarImage + '<i class="parent-crop-handle parent-crop-handle-tl"></i><i class="parent-crop-handle parent-crop-handle-tr"></i><i class="parent-crop-handle parent-crop-handle-bl"></i><i class="parent-crop-handle parent-crop-handle-br"></i><span class="parent-crop-circle"></span></div></div><div class="parent-crop-slider"><button id="cropZoomOut" type="button" aria-label="缩小"><span class="parent-crop-minus"></span></button><input id="cropZoom" type="range" min="80" max="140" value="100"><button id="cropZoomIn" type="button" aria-label="放大"><span class="parent-crop-plus"></span></button></div><div class="parent-crop-actions"><button id="cropDragHint" type="button"><span></span>拖动并缩放头像</button><button id="cropReset" type="button"><span></span>恢复默认</button></div></section>' +
      '<div class="parent-avatar-previews"><div><span>圆形头像预览</span><div class="parent-avatar-preview-circle">' + avatarImage + '</div></div><div><span>方形头像预览</span><div class="parent-avatar-preview-square">' + avatarImage + '</div></div></div>' +
      '<section class="parent-confirm-actions"><button id="confirmPortrait" class="parent-confirm-primary" type="button">确认使用这两张照片</button><button id="retryPortrait" class="parent-confirm-secondary" type="button">重新拍摄</button></section></main>'
    var cropStage = document.getElementById('avatarCropStage')
    var cropFrame = cropStage.querySelector('.parent-avatar-crop-frame')
    var cropImage = cropStage.querySelector('.parent-avatar-result-image')
    var cropZoom = document.getElementById('cropZoom')
    var cropScale = 1
    var cropX = 0
    var cropY = 0
    var dragState = null
    var confirmedAvatarPreview = ''
    var previewImages = Array.prototype.slice.call(document.querySelectorAll('.parent-avatar-preview-circle .parent-avatar-result-image, .parent-avatar-preview-square .parent-avatar-result-image'))
    function updateCrop() {
      cropScale = Math.min(1.4, Math.max(.8, Number(cropScale) || 1))
      cropX = Math.min(512, Math.max(-512, Number(cropX) || 0))
      cropY = Math.min(512, Math.max(-512, Number(cropY) || 0))
      var mainTransform = 'translate(' + cropX + 'px,' + cropY + 'px) scale(' + cropScale + ')'
      if (cropImage) cropImage.style.transform = mainTransform
      var frameWidth = (cropFrame && cropFrame.clientWidth) || 256
      previewImages.forEach(function (image) {
        var frame = image.parentElement
        var ratio = frame && frame.clientWidth ? frame.clientWidth / frameWidth : 1
        image.style.transform = 'translate(' + (cropX * ratio) + 'px,' + (cropY * ratio) + 'px) scale(' + cropScale + ')'
      })
      if (cropZoom) cropZoom.value = String(Math.round(cropScale * 100))
    }
    function resetCrop() { cropScale = 1; cropX = 0; cropY = 0; updateCrop() }
    cropZoom.oninput = function () { cropScale = Number(cropZoom.value) / 100; updateCrop() }
    document.getElementById('cropZoomOut').onclick = function () { cropScale = Math.max(.8, cropScale - .1); updateCrop() }
    document.getElementById('cropZoomIn').onclick = function () { cropScale = Math.min(1.4, cropScale + .1); updateCrop() }
    document.getElementById('cropReset').onclick = resetCrop
    document.getElementById('cropDragHint').onclick = function () { toast('可在头像框内拖动调整位置') }
     if (cropFrame && cropImage) {
       cropFrame.onpointerdown = function (event) { dragState = { x: event.clientX, y: event.clientY, startX: cropX, startY: cropY }; cropFrame.setPointerCapture(event.pointerId) }
       cropFrame.onpointermove = function (event) { if (!dragState) return; cropX = dragState.startX + event.clientX - dragState.x; cropY = dragState.startY + event.clientY - dragState.y; updateCrop() }
       cropFrame.onpointerup = function () { dragState = null }
       cropFrame.onpointercancel = function () { dragState = null }
     }
    function createAvatarData() {
      if (!previewSrc) return Promise.reject(new Error('透明人像预览尚未生成，暂不能确认头像裁切'))
      return new Promise(function (resolve, reject) {
        var image = new Image()
        image.onload = function () {
          var canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512
          var context = canvas.getContext('2d'); var frameSize = (cropFrame && cropFrame.clientWidth) || 256
          var baseScale = Math.max(512 / image.naturalWidth, 512 / image.naturalHeight)
          var drawScale = baseScale * cropScale
          var drawWidth = image.naturalWidth * drawScale, drawHeight = image.naturalHeight * drawScale
          var ratio = 512 / frameSize
          var offsetX = (512 - drawWidth) / 2 + cropX * ratio, offsetY = (512 - drawHeight) / 2 + cropY * ratio
          context.clearRect(0, 0, 512, 512)
          context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight)
          resolve(canvas.toDataURL('image/png'))
        }
        image.onerror = function () { reject(new Error('头像裁切预览读取失败，请重新拍摄')) }
        image.src = previewSrc
      })
    }
     function regeneratePortrait() { renderPortraitCamera('camera', result) }
     document.getElementById('portraitConfirmBack').onclick = function () { renderPortraitCamera('camera', result) }
    document.getElementById('regenerateStandard').onclick = regeneratePortrait
    document.getElementById('regenerateAvatar').onclick = regeneratePortrait
     document.getElementById('retryPortrait').onclick = regeneratePortrait
     document.getElementById('confirmPortrait').onclick = function () {
      var button = document.getElementById('confirmPortrait'); button.disabled = true; button.textContent = '正在生成头像并确认…'
      createAvatarData().then(function (avatarData) {
        confirmedAvatarPreview = avatarData
        return parentApi('confirmParentPortrait', {
          portraitId: result.portraitId,
          avatarData: avatarData,
          crop: { scale: Number(cropScale.toFixed(3)), x: Number(cropX.toFixed(2)), y: Number(cropY.toFixed(2)) }
        })
      }).then(function (saved) {
        if (!saved.success) throw new Error(saved.error || '确认失败')
        return parentApi('completeParentProfile')
      }).then(function (completed) {
        if (!completed.success) throw new Error(completed.error || '资料提交失败')
        renderParentSubmitSuccess(Object.assign({}, completed, { transparentPreview: previewSrc, avatarPreview: confirmedAvatarPreview }))
      }).catch(function (error) { button.disabled = false; button.textContent = '确认使用这两张照片'; toast(error.message) })
    }
  }

  function renderParentSubmitSuccess(result) {
    setParentShell()
    result = result || {}
    var requirements = result.requirements || { realName: false, portrait: false }
    var rawPreview = String(result.transparentPreview || '')
    var previewSrc = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(rawPreview) ? rawPreview : ''
    var rawAvatarPreview = String(result.avatarPreview || '')
    var avatarPreviewSrc = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(rawAvatarPreview) ? rawAvatarPreview : ''
    var previewImage = previewSrc
      ? '<img class="parent-success-portrait-image" src="' + escapeHtml(previewSrc) + '" alt="已提交的标准形象照">'
      : '<div class="parent-success-placeholder"><b>受限预览</b><span>本地验收不使用真实儿童照片</span></div>'
    var avatarImage = avatarPreviewSrc
      ? '<img class="parent-success-avatar-image" src="' + escapeHtml(avatarPreviewSrc) + '" alt="已提交的球员头像">'
      : '<div class="parent-success-placeholder"><b>球员头像</b><span>等待受限预览</span></div>'
    var progressItems = ['基础资料已核对']
    if (requirements.realName === true) progressItems.push('实名认证已通过')
    if (requirements.portrait === true) {
      progressItems.push('标准形象照已生成')
      progressItems.push('球员头像已裁切')
    }
    var progressMarkup = progressItems.map(function (label, index) {
      var icon = index === 0 ? 'parent-progress-document' : (label.indexOf('实名') >= 0 ? 'parent-progress-shield' : (label.indexOf('头像') >= 0 ? 'parent-progress-head' : 'parent-progress-document'))
      return '<li><span class="parent-progress-icon ' + icon + '" aria-hidden="true"></span><b>' + escapeHtml(label) + '</b><strong>已完成<i></i></strong></li>'
    }).join('')
    var previewMarkup = requirements.portrait === true
      ? '<section class="parent-success-card parent-submitted-preview"><div class="parent-success-card-title"><h2>资料预览</h2><span>仅展示本次赛事已开启的要求</span></div><div class="parent-success-preview-grid"><figure><figcaption>标准形象照</figcaption><div class="parent-success-standard parent-checker">' + previewImage + '</div></figure><figure><figcaption>球员头像</figcaption><div class="parent-success-avatar parent-checker">' + avatarImage + '</div></figure></div></section>'
      : '<section class="parent-success-card parent-submitted-preview"><div class="parent-success-card-title"><h2>资料预览</h2><span>本次邀请未开启标准形象照要求</span></div><p class="parent-success-no-preview">基础资料已提交，后续如需实名或照片由主办方重新开启对应要求。</p></section>'
    var playerName = escapeHtml(result.playerName || '球员')
    var teamName = escapeHtml(result.teamName || '当前球队')
    var submittedAt = escapeHtml(displayTime(result.submittedAt || result.updateTime))
    app.className = 'page parent-profile-page parent-success-page'
    app.innerHTML = '<header class="parent-success-header"><div><span>赛小蜂足球 · 家长服务</span><h1>资料提交成功</h1><p>' + playerName + ' · ' + teamName + '</p></div><button id="closeParentService" class="parent-success-close" type="button">完成</button></header>' +
      '<main class="parent-success-content"><section class="parent-success-hero"><div class="parent-success-check" aria-hidden="true"><span></span></div><h2>已完成本次赛事要求</h2><p>资料已提交给球队负责人确认</p></section>' +
      '<section id="parentSubmittedSummary" class="parent-success-card parent-progress-card"><h2>资料提交进度</h2><ul class="parent-progress-list">' + progressMarkup + '</ul></section>' +
      previewMarkup +
      '<section class="parent-success-card parent-status-card"><h2>状态跟踪</h2><div class="parent-status-track"><div class="parent-status-line"><span class="parent-status-node is-done"><i></i></span><span class="parent-status-node is-current"><i></i></span><span class="parent-status-node"><i></i></span></div><div class="parent-status-labels"><div><b>家长已提交</b><small>' + submittedAt + '</small></div><div><b>球队负责人确认</b><small>待处理</small></div><div><b>进入正式参赛名单</b><small>未开始</small></div></div></div></section>' +
      '<section class="parent-success-notice"><span class="parent-info-icon" aria-hidden="true">i</span><p>是否需要实名认证和照片由主办方设置；本页只显示本次赛事已开启的要求。</p></section><section class="parent-success-notice"><span class="parent-notice-shield" aria-hidden="true"></span><p>实名结果绑定球员平台档案，后续赛事仅在监护人授权后复用。</p></section>' +
      '<div class="parent-success-actions"><button id="closeParentServicePrimary" class="parent-success-primary" type="button">完成并关闭</button><button id="viewSubmittedData" class="parent-success-secondary" type="button">查看已提交资料</button></div></main>'
    function closeParentService() { window.close(); toast('资料已提交，可返回微信继续使用') }
    document.getElementById('closeParentService').onclick = closeParentService
    document.getElementById('closeParentServicePrimary').onclick = closeParentService
    document.getElementById('viewSubmittedData').onclick = function () {
      var summary = document.getElementById('parentSubmittedSummary')
      if (summary) summary.scrollIntoView({ behavior: 'smooth', block: 'start' })
      toast('已定位到本次提交的资料清单')
    }
  }

  var query = new URLSearchParams(location.search)
  var visualParentQa = location.hostname === '127.0.0.1' && query.get('visualQa') === '1' && query.get('parentView')
  var visualRefereeQa = location.hostname === '127.0.0.1' && query.get('visualQa') === '1' && query.get('refereeView')
  if (visualRefereeQa) {
    var refereeView = query.get('refereeView')
    var refereeMatch = {
      matchId: 'qa-referee-match-001', tournamentName: '2026 郑州青少年足球邀请赛', divisionName: 'U16 专业组',
      homeTeamName: '郑州劲风U16', awayTeamName: '中原雄鹰U16', teamsText: '郑州劲风U16 VS 中原雄鹰U16',
      homeScore: 2, awayScore: 1, matchTimeText: '08 月 16 日 15:30', venue: 'A1 场地', refereeRoleLabel: '主裁判',
      matchStatusText: '比赛进行中', clockPhaseText: '下半场 · 进行中', clockElapsedSeconds: 4120, clockRunning: false,
      canStart: false, canFinish: true, canRecordEvents: true, canSubmitReport: false, refereeRecordLocked: false,
      preMatch: { refereeArrived: true, teamsArrived: true, checklistComplete: false, completed: false, checklist: [
        { key: 'venue', label: '场地与球门安全检查', checked: true }, { key: 'equipment', label: '比赛用球和计时设备检查', checked: true },
        { key: 'medical', label: '医疗与应急联络确认', checked: false }, { key: 'kit', label: '双方队服颜色确认', checked: false }
      ] },
      rosters: { home: { status: 'submitted', players: [{ jerseyNumber: 1, name: '刘子轩', role: 'starter' }, { jerseyNumber: 9, name: '李晨阳', role: 'starter' }, { jerseyNumber: 11, name: '张浩然', role: 'starter' }, { jerseyNumber: 16, name: '赵一鸣', role: 'substitute' }] }, away: { status: 'submitted', players: [{ jerseyNumber: 1, name: '周嘉宇', role: 'starter' }, { jerseyNumber: 6, name: '王子豪', role: 'starter' }, { jerseyNumber: 10, name: '陈宇航', role: 'starter' }, { jerseyNumber: 18, name: '孙亦凡', role: 'substitute' }] } },
      events: [
        { eventId: 'qa-event-1', minute: 12, type: 'goal', typeText: '进球', teamName: '郑州劲风U16', playerName: '李晨阳', playerNumber: 9 },
        { eventId: 'qa-event-2', minute: 48, type: 'yellow_card', typeText: '黄牌', teamName: '中原雄鹰U16', playerName: '王子豪', playerNumber: 6 },
        { eventId: 'qa-event-3', minute: 61, type: 'goal', typeText: '进球', teamName: '中原雄鹰U16', playerName: '陈宇航', playerNumber: 10 }
      ]
    }
    if (refereeView === 'tasks') {
      renderWorkbench({ phoneMasked: '138****2468', refereeTasks: [refereeMatch, Object.assign({}, refereeMatch, { matchId: 'qa-referee-match-002', homeTeamName: '金水少年U16', awayTeamName: '航海蓝星U16', teamsText: '金水少年U16 VS 航海蓝星U16', matchStatusText: '待执行', clockPhaseText: '赛前待确认', homeScore: 0, awayScore: 0 })] })
    } else if (refereeView === 'prematch') renderPreMatch(refereeMatch)
    else if (refereeView === 'lineup') renderLineupVerification(refereeMatch)
    else if (refereeView === 'report') renderReport(Object.assign({}, refereeMatch, { refereeReportDraft: { conclusion: 'normal', sections: { sportsmanship: { status: 'normal' }, discipline: { status: 'abnormal', note: '已记录黄牌' } } } }))
    else if (refereeView === 'signature') renderElectronicRecord(Object.assign({}, refereeMatch, { refereeReportDraft: { conclusion: 'normal', sections: {} } }))
    else if (refereeView === 'success') renderSubmissionSuccess(Object.assign({}, refereeMatch, { division: 'U16 专业组', refereeRecord: { reviewStatus: 'under_review', recordNumber: 'RR-20260816-001', submittedAt: '2026-08-16T17:32:00+08:00', submittedByPhoneMasked: '138****2468' } }), false)
    else if (refereeView === 'returned') renderReturnCorrection(Object.assign({}, refereeMatch, { division: 'U16 专业组', refereeRecord: { reviewStatus: 'returned', recordNumber: 'RR-20260816-001', submittedAt: '2026-08-16T17:32:00+08:00', submittedByPhoneMasked: '138****2468', returnRequest: { reason: '第 61 分钟进球球员需按现场记录更正', returnedAt: '2026-08-16T18:10:00+08:00', returnedBy: '赛事主办方', fields: ['event_player:qa-event-3'] } } }))
    else renderMatch(refereeMatch)
  } else if (visualParentQa) {
    var view = query.get('parentView')
    var sample = { playerName: '李晨阳', teamName: '郑州劲风U12', guardianPhoneMasked: '138****2468', birthDate: '2014-06-18', requirements: { realName: true, portrait: true, parentSupplementRequired: true } }
    if (view === 'match') renderParentInvite(sample)
    else if (view === 'basic') renderParentBasicForm(sample, { guardianAuthorized: false })
    else if (view === 'identity') renderParentIdentityUpload()
    else if (view === 'result') renderParentIdentityResult({ status: 'approved', statusText: '实名认证已通过', requirements: { realName: true, portrait: true }, playerName: '李晨阳', teamName: '郑州劲风U12', identityNumberMasked: '41************1234', verifiedBirthDate: '2014-06-18', gender: '男', qualificationStatusText: '实名核验已通过', reviewedAt: '2026-08-14T10:30:00+08:00', documentStored: true })
    else if (view === 'resultPending') renderParentIdentityResult({ status: 'pending_review', requirements: { realName: true, portrait: true }, playerName: '李晨阳', teamName: '郑州劲风U12', submittedAt: '2026-08-14T10:25:00+08:00' })
    else if (view === 'resultRejected') renderParentIdentityResult({ status: 'rejected', requirements: { realName: true, portrait: true }, playerName: '李晨阳', teamName: '郑州劲风U12', submittedAt: '2026-08-14T10:25:00+08:00', reason: '证件人像面边缘缺失，请重新拍摄完整证件。' })
    else if (view === 'guide') renderPortraitGuide()
    else if (view === 'camera') renderPortraitCamera()
    else if (view === 'confirm') renderPortraitConfirmation({ portraitId: 'qa-portrait-001', transparentPreview: '' })
    else if (view === 'success') renderParentSubmitSuccess({ playerName: '张浩', teamName: '郑州青训U9队', submittedAt: '2026-07-18T14:30:00+08:00', requirements: { realName: true, portrait: true }, transparentPreview: '' })
    else renderParentInvite(sample)
  } else if (query.get('code') && query.get('state') && sessionStorage.getItem(PARENT_PENDING_KEY)) completeParentOAuth(query.get('code'), query.get('state'))
  else if (query.get('parentInvite')) loadParentInvite(query.get('parentInvite'))
  else if (query.get('code') && query.get('state')) completeOAuth(query.get('code'), query.get('state'))
  else if (localStorage.getItem(SESSION_KEY)) loadWorkbench()
  else beginOAuth()
})()
