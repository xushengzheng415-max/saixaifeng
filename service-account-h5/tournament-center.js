(function () {
  'use strict'

  var API_URL = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'
  var app = document.getElementById('app')
  var activeCategory = 'all'
  var activeEventId = ''
  var scheduleTournamentId = ''
  var state = { tournaments: [], matches: [] }
  var categories = [
    { key: 'all', label: '头条' }, { key: 'amateur', label: '业余赛事' }, { key: 'youth', label: '青少年赛事' }, { key: 'city', label: '地市赛事' }, { key: 'other', label: '其他赛事' }
  ]

  function escapeHtml(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] }) }
  function api(payload) {
    return fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (response) { return response.json() })
      .then(function (result) { return result && typeof result.body === 'string' ? JSON.parse(result.body) : result })
  }
  function publicImage(url) {
    var value = String(url || '')
    if (/^https:\/\//.test(value)) return value
    var match = value.match(/^cloud:\/\/[^.]+\.([^/]+)\/(.+)$/)
    return match ? 'https://' + match[1] + '.tcb.qcloud.la/' + match[2] : ''
  }
  function categoryOf(item) {
    var text = String((item && item.category) || '') + ' ' + String((item && item.name) || '')
    if (/青少|少年|youth|u\d+/i.test(text)) return 'youth'
    if (/地市|城市|city/i.test(text)) return 'city'
    if (/业余|成人|amateur/i.test(text)) return 'amateur'
    return 'other'
  }
  function filteredTournaments() { return state.tournaments.filter(function (item) { return activeCategory === 'all' || categoryOf(item) === activeCategory }) }
  function selectedTournament() {
    var list = filteredTournaments()
    return list.filter(function (item) { return item.id === activeEventId })[0] || list[0] || null
  }
  function isLiyangTournament(item) { return /立洋杯/.test(String(item && item.name || '')) }
  function applyScheduleFilter() {
    var target = state.tournaments.filter(isLiyangTournament)[0]
    scheduleTournamentId = target ? String(target.id) : ''
    if (!scheduleTournamentId) {
      state.tournaments = []
      state.matches = []
      return
    }
    state.tournaments = state.tournaments.filter(function (item) { return String(item.id) === scheduleTournamentId })
    state.matches = state.matches.filter(function (item) { return String(item.tournamentId || '') === scheduleTournamentId })
  }
  function eventStatus(value) { return ({ registering: '报名中', ongoing: '进行中', finished: '已结束', ended: '已结束' })[value] || '赛事发布' }
  function dateKey(value) { var match = String(value || '').match(/^\d{4}-\d{2}-\d{2}/); return match ? match[0] : '' }
  function todayKey() { var now = new Date(); return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') }
  function publicEventStatus(item) {
    var value = String(item && item.status || '').toLowerCase()
    if (['ongoing', 'finished', 'ended'].indexOf(value) >= 0) return value
    var startDate = dateKey(item && item.startDate)
    var endDate = dateKey(item && item.endDate)
    var today = todayKey()
    return startDate && endDate && startDate <= today && today <= endDate ? 'ongoing' : value
  }
  function matchStatus(value) { return ({ ongoing: '进行中', finished: '已结束', upcoming: '待开始' })[value] || '待开始' }
  function dateRange(item) {
    if (item.startDate && item.endDate) return item.startDate + ' 至 ' + item.endDate
    return item.startDate || item.endDate || '日期待公布'
  }
  function matchTime(item) { return [String(item.matchDate || '').replace(/^\d{4}-/, ''), item.matchTime].filter(Boolean).join(' ') || '时间待公布' }
  function mark(value, fallback) { return escapeHtml(String(value || fallback || '赛').trim().slice(0, 1)) }
  function teamLogo(url, name) {
    var image = publicImage(url)
    return image ? '<img src="' + escapeHtml(image) + '" alt="' + escapeHtml(name) + '" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span hidden>' + mark(name, '队') + '</span>' : '<span>' + mark(name, '队') + '</span>'
  }
  function coverStyle(item) {
    var image = publicImage(item && item.cover)
    return image ? ' style="background-image:url(\'' + escapeHtml(image) + '\')"' : ''
  }
  function isKnockoutMatch(match) {
    var round = String(match && match.round || '')
    var home = String(match && match.homeName || '')
    var away = String(match && match.awayName || '')
    if (/淘汰|交叉|排位|半决|决赛|八强|四强/.test(round)) return true
    return /^(?:[A-ZＡ-Ｚ]组第\d+|场序\d+(?:胜者|负者))$/.test(home) || /^(?:[A-ZＡ-Ｚ]组第\d+|场序\d+(?:胜者|负者))$/.test(away)
  }
  function eventMatches(item) {
    return state.matches.filter(function (match) { return item && match.tournamentId === item.id && !isKnockoutMatch(match) })
      .sort(function (left, right) { return priority(left) - priority(right) || Number(left.timestamp || 0) - Number(right.timestamp || 0) })
  }
  function priority(item) { return item.status === 'ongoing' ? 0 : item.status === 'upcoming' ? 1 : 2 }
  function score(item) { if (item.status === 'upcoming') return 'VS'; var events = Array.isArray(item && item.events) ? item.events : []; if (events.length) { var home = 0, away = 0; events.forEach(function (event) { if (!isGoalEvent(event)) return; var side = event.teamSide === 'away' ? 'away' : 'home'; if (String(event.type || '').toLowerCase() === 'own_goal') side = side === 'away' ? 'home' : 'away'; if (side === 'away') away += 1; else home += 1 }); return home + ' : ' + away } return String(item.homeScore == null ? '-' : item.homeScore) + ' : ' + String(item.awayScore == null ? '-' : item.awayScore) }
  function playerEventKey(event) { return String((event && event.teamSide === 'away' ? 'away' : 'home') + '|' + (event && event.playerNumber || '') + '|' + (event && event.playerName || '')).replace(/\s/g, '') }
  function matchEventStats(match) {
    var sides = { home: { goals: 0, yellow: 0, red: 0, yellowRed: 0, players: {} }, away: { goals: 0, yellow: 0, red: 0, yellowRed: 0, players: {} } }
    ;(Array.isArray(match && match.events) ? match.events : []).forEach(function (event) {
      var type = String(event && event.type || '').toLowerCase()
      var side = event && event.teamSide === 'away' ? 'away' : 'home'
      var stat = sides[side]
      if (isGoalEvent(event)) { stat.goals += 1; return }
      if (['yellow_card', 'yellow'].indexOf(type) >= 0) {
        var yellowKey = playerEventKey(event)
        if (!stat.players[yellowKey]) stat.players[yellowKey] = { yellow: 0, red: 0, yellowRed: 0 }
        stat.players[yellowKey].yellow += 1
        return
      }
      if (['second_yellow', 'yellow_red', 'second_yellow_red', 'two_yellow_red'].indexOf(type) >= 0) {
        var secondYellowKey = playerEventKey(event)
        if (!stat.players[secondYellowKey]) stat.players[secondYellowKey] = { yellow: 0, red: 0, yellowRed: 0 }
        stat.players[secondYellowKey].yellowRed += 1
        return
      }
      if (type === 'red_card' || type === 'red') {
        var redKey = playerEventKey(event)
        if (!stat.players[redKey]) stat.players[redKey] = { yellow: 0, red: 0, yellowRed: 0 }
        var detail = String(event.description || '')
        if (/两黄|2黄|累计.*黄/.test(detail)) stat.players[redKey].yellowRed += 1
        else stat.players[redKey].red += 1
      }
    })
    Object.keys(sides).forEach(function (side) {
      var stat = sides[side]
      Object.keys(stat.players).forEach(function (key) {
        var player = stat.players[key]
        var paired = Math.min(Math.floor(player.yellow / 2), player.red)
        player.yellowRed += paired || (player.yellowRed ? 0 : Math.floor(player.yellow / 2))
        player.yellow -= paired ? paired * 2 : player.yellowRed ? Math.min(player.yellow, player.yellowRed * 2) : 0
        player.red -= paired
        stat.yellow += player.yellow
        stat.red += player.red
        stat.yellowRed += player.yellowRed
      })
    })
    return sides
  }
  function matchStatIcon(type, count) {
    if (!count) return ''
    if (type === 'yellow-red') return '<span class="match-stat match-stat--yellow-red" aria-label="两黄变红"><i><img src="./assets/match-summary/yellow-red-card.svg" alt="黄红牌"></i><b>' + escapeHtml(String(count)) + '</b></span>'
    var source = type === 'goal' ? './assets/match-summary/football.svg' : type === 'yellow' ? './assets/match-summary/yellow-card.svg' : './assets/match-summary/red-card.svg'
    var label = type === 'goal' ? '进球' : type === 'yellow' ? '黄牌' : '红牌'
    return '<span class="match-stat match-stat--' + type + '"><i><img src="' + source + '" alt="' + label + '"></i><b>' + escapeHtml(String(count)) + '</b></span>'
  }
  function matchCardEventIcon(type) {
    var source = type === 'penalty' ? 'penalty.svg' : type === 'penalty-missed' ? 'penalty-missed.svg' : type === 'own-goal' ? 'own-goal.svg' : type === 'goal' ? 'football.svg' : type === 'yellow' ? 'yellow-card.svg' : type === 'yellow-red' ? 'yellow-red-card.svg' : 'red-card.svg'
    var label = type === 'goal' ? '进球' : type === 'yellow' ? '黄牌' : type === 'yellow-red' ? '两黄变红' : '红牌'
    return '<img src="./assets/match-summary/' + source + '" alt="' + label + '">'
  }
  function matchCardEventRows(match) {
    var cardPlayers = {}, rows = []
    ;(Array.isArray(match && match.events) ? match.events.slice() : []).sort(function (left, right) { return Number(left.minute || 0) - Number(right.minute || 0) }).forEach(function (event) {
      var rawType = String(event && event.type || '').toLowerCase()
      var side = event && event.teamSide === 'away' ? 'away' : 'home'
      var type = ''
      if (['penalty_missed', 'missed_penalty', 'penalty_miss'].indexOf(rawType) >= 0) type = 'penalty-missed'
      else if (['penalty', 'penalty_goal'].indexOf(rawType) >= 0) type = 'penalty'
      else if (rawType === 'own_goal') type = 'own-goal'
      else if (isGoalEvent(event)) type = 'goal'
      else if (['yellow_card', 'yellow'].indexOf(rawType) >= 0) {
        var yellowKey = playerEventKey(event)
        cardPlayers[yellowKey] = Number(cardPlayers[yellowKey] || 0) + 1
        type = cardPlayers[yellowKey] >= 2 ? 'yellow-red' : 'yellow'
      } else if (['second_yellow', 'yellow_red', 'second_yellow_red', 'two_yellow_red'].indexOf(rawType) >= 0) type = 'yellow-red'
      else if (rawType === 'red_card' || rawType === 'red') type = /两黄|2黄|累计.*黄/.test(String(event.description || '')) || Number(cardPlayers[playerEventKey(event)] || 0) >= 1 ? 'yellow-red' : 'red'
      if (!type) return
      var player = [event.minute != null ? String(event.minute) + "'" : '', event.playerNumber ? String(event.playerNumber) + '号' : '', event.playerName || '球员待定'].filter(Boolean).join(' ')
      rows.push({ side: side, type: type, text: player })
    })
    if (!rows.length) return ''
    return '<div class="match-card-timeline">' + rows.map(function (row) {
      var code = row.type === 'penalty' ? '<em class="match-card-event-code">P</em>' : row.type === 'own-goal' ? '<em class="match-card-event-code">OG</em>' : row.type === 'penalty-missed' ? '<em class="match-card-event-code">PM</em>' : ''
      var item = '<span class="match-card-event match-card-event--' + row.type + '"><b>' + escapeHtml(row.text) + '</b>' + code + matchCardEventIcon(row.type) + '</span>'
      return '<div class="match-card-event-row"><span class="match-card-event-side match-card-event-side--home">' + (row.side === 'home' ? item : '') + '</span><i></i><span class="match-card-event-side match-card-event-side--away">' + (row.side === 'away' ? item : '') + '</span></div>'
    }).join('') + '</div>'
  }
  function matchEventSummary(match) {
    if (!match || match.status === 'upcoming') return ''
    var timeline = matchCardEventRows(match)
    return timeline ? '<section class="match-event-summary" aria-label="比赛事件">' + timeline + '</section>' : ''
  }
  function renderLoading() { app.innerHTML = '<section class="portal-loading"><i></i><strong>正在加载赛事中心</strong></section>' }
  function renderError(message) { app.innerHTML = '<section class="portal-state"><strong>赛事数据暂时无法加载</strong><p>' + escapeHtml(message || '请稍后重试') + '</p><button id="retry">重新加载</button></section>'; document.getElementById('retry').onclick = load }
  function renderEmpty() { app.innerHTML = '<section class="portal-state"><strong>暂无已发布赛事</strong><p>赛事发布后会在这里展示。</p></section>' }
  function findMatch(id) { return state.matches.filter(function (item) { return item.id === id && !isKnockoutMatch(item) })[0] || null }
  function findTournament(id) { return state.tournaments.filter(function (item) { return item.id === id })[0] || null }
  function matchEventLabel(type) { return ({ goal: '进球', score: '进球', penalty: '点球 P', penalty_goal: '点球 P', penalty_scored: '点球 P', own_goal: '乌龙球 OG', penalty_missed: '点球未进', missed_penalty: '点球未进', yellow_card: '黄牌', red_card: '红牌', substitution: '换人', stoppage_time: '补时', other: '其他' })[String(type || '').toLowerCase()] || '比赛事件' }
  function isGoalEvent(item) { return ['goal', 'score', 'own_goal', 'penalty', 'penalty_goal', 'penalty_scored'].indexOf(String(item && item.type || '').toLowerCase()) >= 0 }
  function matchEmptyView(text) { return '<section class="match-empty-view"><strong>' + escapeHtml(text) + '</strong></section>' }
  function timelineEventTone(type) { return ({ goal: 'goal', score: 'goal', own_goal: 'goal', yellow_card: 'yellow', red_card: 'red', substitution: 'substitution', stoppage_time: 'neutral', other: 'neutral' })[String(type || '').toLowerCase()] || 'neutral' }
  function scoreAfterEvent(events, targetIndex) {
    var home = 0
    var away = 0
    events.slice(0, targetIndex + 1).forEach(function (item) {
      var type = String(item.type || '').toLowerCase()
      if (!isGoalEvent(item)) return
      var side = item.teamSide === 'away' ? 'away' : 'home'
      if (type === 'own_goal') side = side === 'away' ? 'home' : 'away'
      if (side === 'away') away += 1
      else home += 1
    })
    return home + '-' + away
  }
  function timelineEventText(event, scoreText) {
    var type = String(event.type || '').toLowerCase()
    var player = [event.playerNumber ? event.playerNumber + '号' : '', event.playerName || '球员待定'].filter(Boolean).join(' ')
    if (type === 'substitution') return { main: '换上 ' + player, detail: event.assistName ? '换下 ' + (event.assistNumber ? event.assistNumber + '号 ' : '') + event.assistName : event.teamName || '' }
    if (['penalty', 'penalty_goal', 'penalty_scored'].indexOf(type) >= 0) return { main: scoreText + '　P ' + player, detail: event.teamName || '' }
    if (type === 'own_goal') return { main: scoreText + '　OG ' + player, detail: event.teamName || '' }
    if (isGoalEvent(event)) return { main: scoreText + '　' + player, detail: event.teamName || '' }
    return { main: player, detail: event.teamName || event.description || '' }
  }
  function playerChangeEvents(match, player, side) {
    var key = playerMatchKey(player)
    var changes = { inMinute: 0, outMinute: 0 }
    ;(Array.isArray(match && match.events) ? match.events : []).forEach(function (event) {
      if (!event || event.teamSide !== side || String(event.type || '').toLowerCase() !== 'substitution') return
      var inKey = String((event.playerNumber ? event.playerNumber + '-' : '') + (event.playerName || '')).replace(/\s/g, '')
      var outKey = String((event.assistNumber ? event.assistNumber + '-' : '') + (event.assistName || '')).replace(/\s/g, '')
      if (key && key === inKey) changes.inMinute = changes.inMinute || Number(event.minute || 0)
      if (key && key === outKey) changes.outMinute = changes.outMinute || Number(event.minute || 0)
    })
    return changes
  }
  function playerChangeMarks(change) {
    var marks = []
    if (change && change.outMinute) marks.push('<span class="player-change player-change--out"><i></i>' + escapeHtml(String(change.outMinute) + "'") + '</span>')
    if (change && change.inMinute) marks.push('<span class="player-change player-change--in"><i></i>' + escapeHtml(String(change.inMinute) + "'") + '</span>')
    return marks.join('')
  }
  function timelineEventIcon(type) {
    var value = String(type || '').toLowerCase()
    if (['goal', 'score'].indexOf(value) >= 0) return '<i class="timeline-event-icon timeline-event-icon--goal" aria-hidden="true"><img src="./assets/match-events/goal.png" alt=""></i>'
    if (['penalty', 'penalty_goal', 'penalty_scored'].indexOf(value) >= 0) return '<i class="timeline-event-icon" aria-hidden="true"><img src="./assets/match-summary/penalty.svg" alt=""></i>'
    if (value === 'own_goal') return '<i class="timeline-event-icon" aria-hidden="true"><img src="./assets/match-summary/own-goal.svg" alt=""></i>'
    if (['penalty_missed', 'missed_penalty', 'penalty_miss'].indexOf(value) >= 0) return '<i class="timeline-event-icon" aria-hidden="true"><img src="./assets/match-summary/penalty-missed.svg" alt=""></i>'
    if (value === 'substitution') return '<i class="timeline-event-icon timeline-event-icon--substitution" aria-hidden="true"><img src="./assets/match-events/substitution.png" alt=""></i>'
    if (value === 'yellow_card') return '<i class="timeline-event-icon timeline-event-icon--yellow" aria-hidden="true"><img src="./assets/match-events/yellow-card.png" alt=""></i>'
    if (value === 'red_card') return '<i class="timeline-event-icon timeline-event-icon--red" aria-hidden="true"><img src="./assets/match-events/red-card.png" alt=""></i>'
    return '<i class="timeline-event-icon timeline-event-icon--neutral" aria-hidden="true"></i>'
  }
  function timelineCard(event, scoreText) {
    var text = timelineEventText(event, scoreText)
    var tone = timelineEventTone(event.type)
    var side = event.teamSide === 'away' ? 'away' : 'home'
    if (String(event.type || '').toLowerCase() === 'substitution') {
      var inPlayer = [event.playerNumber ? event.playerNumber + '号' : '', event.playerName || '球员待定'].filter(Boolean).join(' ')
      var outPlayer = [event.assistNumber ? event.assistNumber + '号' : '', event.assistName || '球员待定'].filter(Boolean).join(' ')
      return '<article class="timeline-event timeline-event--substitution timeline-event--' + side + '"><span class="timeline-event-icon-box">' + timelineEventIcon(event.type) + '</span><div class="timeline-substitution-lines"><span class="timeline-substitution-line timeline-substitution-line--out"><i></i><b>换下</b><em>' + escapeHtml(outPlayer) + '</em></span><span class="timeline-substitution-line timeline-substitution-line--in"><i></i><b>换上</b><em>' + escapeHtml(inPlayer) + '</em></span></div></article>'
    }
    return '<article class="timeline-event timeline-event--' + tone + ' timeline-event--' + side + '"><span class="timeline-event-icon-box">' + timelineEventIcon(event.type) + '</span><b>' + escapeHtml(text.main) + '</b><span>' + escapeHtml(matchEventLabel(event.type)) + (text.detail ? ' · ' + escapeHtml(text.detail) : '') + '</span></article>'
  }
  function matchEventsPanel(match, goalsOnly) {
    var events = Array.isArray(match && match.events) ? match.events.slice() : []
    if (match && match.status === 'upcoming') return matchEmptyView('暂无赛况信息')
    events.sort(function (left, right) { return Number(left.minute || 0) - Number(right.minute || 0) })
    if (goalsOnly) events = events.filter(isGoalEvent)
    if (!events.length) return matchEmptyView(goalsOnly ? '暂无进球事件' : '暂无公开比赛事件')
    var groups = {}
    events.forEach(function (event, index) {
      var minute = String(event.minute == null ? 0 : event.minute)
      if (!groups[minute]) groups[minute] = []
      groups[minute].push({ event: event, scoreText: scoreAfterEvent(events, index) })
    })
    var timeline = Object.keys(groups).sort(function (left, right) { return Number(left) - Number(right) }).map(function (minute) {
      var home = groups[minute].filter(function (item) { return item.event.teamSide !== 'away' })
      var away = groups[minute].filter(function (item) { return item.event.teamSide === 'away' })
      return '<div class="timeline-row"><div class="timeline-side timeline-side--home">' + home.map(function (item) { return timelineCard(item.event, item.scoreText) }).join('') + '</div><div class="timeline-minute"><b>' + escapeHtml(minute + "'") + '</b></div><div class="timeline-side timeline-side--away">' + away.map(function (item) { return timelineCard(item.event, item.scoreText) }).join('') + '</div></div>'
    }).join('')
    return '<section class="match-events match-events--timeline"><header><b>比赛事件</b><button class="goal-filter' + (goalsOnly ? ' is-active' : '') + '" data-goal-filter="1" type="button" aria-pressed="' + (goalsOnly ? 'true' : 'false') + '">只看进球</button></header><div class="match-timeline"><i class="timeline-axis"></i>' + timeline + '</div></section>'
  }
  function bindMatchEventFilter(match, goalsOnly) {
    var control = app.querySelector('[data-goal-filter]')
    if (!control) return
    control.onclick = function () {
      var panel = document.getElementById('matchTabBody')
      if (!panel) return
      panel.innerHTML = matchEventsPanel(match, !goalsOnly)
      bindMatchEventFilter(match, !goalsOnly)
    }
  }
  function playerMatchKey(player) { return String((player && player.number ? player.number + '-' : '') + (player && player.name || '')).replace(/\s/g, '') }
  function substituteMinute(match, player, side) {
    return playerChangeEvents(match, player, side).inMinute || 0
  }
  function formationRows(lineup) {
    var starters = Array.isArray(lineup && lineup.starters) ? lineup.starters.slice() : []
    if (!starters.length) return []
    var parts = String(lineup.formation || '').match(/\d+/g) || []
    var rows = parts.map(Number).filter(function (value) { return value > 0 })
    if (rows.reduce(function (sum, value) { return sum + value }, 0) === starters.length - 1) rows.unshift(1)
    if (!rows.length || rows.reduce(function (sum, value) { return sum + value }, 0) !== starters.length) {
      rows = starters.length <= 5 ? [1, starters.length - 1] : [1, Math.ceil((starters.length - 1) / 2), Math.floor((starters.length - 1) / 2)]
    }
    var cursor = 0
    return rows.map(function (count) { var row = starters.slice(cursor, cursor + count); cursor += count; return row }).filter(function (row) { return row.length })
  }
  function pitchPlayer(player, side, match) {
    var change = playerChangeEvents(match, player, side)
    return '<article class="pitch-player"><b>' + escapeHtml(player.number || '—') + '</b><span>' + escapeHtml(player.name || '球员') + '</span>' + (player.captain ? '<i>队长</i>' : '') + playerChangeMarks(change) + '</article>'
  }
  function pitchTeam(lineup, side, fallbackName, match) {
    if (!lineup || !Array.isArray(lineup.starters) || !lineup.starters.length) return '<section class="pitch-team pitch-team--' + side + ' is-empty"><header><b>' + escapeHtml(fallbackName || '球队') + '</b><span>暂无首发</span></header></section>'
    var rows = formationRows(lineup)
    return '<section class="pitch-team pitch-team--' + side + '"><header><b>' + escapeHtml(lineup.teamName || fallbackName || '球队') + '</b><span>' + escapeHtml(lineup.formation || '') + '</span></header><div class="pitch-rows">' + rows.map(function (row) { return '<div class="pitch-row">' + row.map(function (player) { return pitchPlayer(player, side, match) }).join('') + '</div>' }).join('') + '</div></section>'
  }
  function substitutePlayerRow(player, side, match) {
    if (!player) return '<div class="substitute-player substitute-player--' + side + ' substitute-player--empty">—</div>'
    var change = playerChangeEvents(match, player, side)
    return '<div class="substitute-player substitute-player--' + side + '"><b>' + escapeHtml(player.number || '—') + '</b><span>' + escapeHtml(player.name || '球员') + (player.position ? '<small>' + escapeHtml(player.position) + '</small>' : '') + '</span><aside>' + playerChangeMarks(change) + '</aside></div>'
  }
  function substitutesPanel(match, home, away) {
    var homePlayers = Array.isArray(home && home.substitutes) ? home.substitutes : []
    var awayPlayers = Array.isArray(away && away.substitutes) ? away.substitutes : []
    var length = Math.max(homePlayers.length, awayPlayers.length)
    if (!length) return ''
    var rows = []
    for (var index = 0; index < length; index += 1) rows.push('<div class="substitute-row">' + substitutePlayerRow(homePlayers[index], 'home', match) + substitutePlayerRow(awayPlayers[index], 'away', match) + '</div>')
    return '<section class="substitutes-panel"><header><b>替补阵容</b><span>已发布名单</span></header><div class="substitute-teams"><b>' + escapeHtml(home && home.teamName || match.homeName || '主队') + '</b><b>' + escapeHtml(away && away.teamName || match.awayName || '客队') + '</b></div><div class="substitute-list">' + rows.join('') + '</div></section>'
  }
  function matchLineupPanel(match) {
    var lineups = match && match.lineups || {}
    if (!lineups.home && !lineups.away) return matchEmptyView(match && match.status === 'upcoming' ? '暂无阵容信息' : '暂无公开首发')
    return '<div class="lineup-view"><section class="lineup-pitch"><i class="pitch-center-line"></i><i class="pitch-center-circle"></i>' + pitchTeam(lineups.home, 'home', match.homeName, match) + pitchTeam(lineups.away, 'away', match.awayName, match) + '</section>' + substitutesPanel(match, lineups.home, lineups.away) + '</div>'
  }
  function matchSupportPanel(match) {
    if (!match || ['upcoming', 'ongoing'].indexOf(match.status) < 0) return ''
    var support = match.support || {}, home = Number(support.home || 0), away = Number(support.away || 0), total = home + away
    var homePercent = total ? Math.round(home / total * 100) : 50
    var awayPercent = 100 - homePercent
    return '<section class="match-support"><header><b>球迷应援</b><span>' + (total ? escapeHtml(String(total) + ' 人已支持') : '免费支持') + '</span></header><div class="support-bar"><i style="width:' + homePercent + '%"></i></div><div class="support-percent"><span>' + escapeHtml(match.homeName) + ' ' + homePercent + '%</span><span>' + escapeHtml(match.awayName) + ' ' + awayPercent + '%</span></div><div class="support-actions"><button type="button" data-support-side="home">支持主队</button><button type="button" data-support-side="away">支持客队</button></div></section>'
  }
  function bindMatchSupport(match) {
    Array.prototype.forEach.call(app.querySelectorAll('[data-support-side]'), function (button) { button.onclick = function () { var token = localStorage.getItem('sxf_fan_h5_session') || ''; if (!token) { location.href = './me.html'; return } button.disabled = true; api({ action: 'fanSupport', fanSessionToken: token, matchId: match.id, teamSide: button.getAttribute('data-support-side') }).then(function (result) { if (!result.success) throw new Error(result.error || '应援失败'); match.support = result.data.support || match.support; var panel = app.querySelector('.match-support'); if (panel) panel.outerHTML = matchSupportPanel(match); bindMatchSupport(match) }).catch(function (error) { button.disabled = false; window.alert(error.message || '应援失败') }) } })
  }
  function renderMatchPage(match) {
    if (!match) return render()
    var status = matchStatus(match.status)
    var scoreText = score(match)
    var info = [match.matchDate, match.matchTime, match.venue, match.round].filter(Boolean).join(' · ') || '比赛信息待公布'
    var goalsOnly = false
    var centre = matchEventsPanel(match, goalsOnly)
    app.innerHTML = '<section class="match-page"><header class="match-page-head"><button id="backToMatches">‹</button><div><span>' + escapeHtml(match.tournamentName || '赛事中心') + '</span><h1>' + escapeHtml(match.divisionName || match.round || '比赛详情') + '</h1></div></header>' +
      '<section class="match-score"><div><span>' + teamLogo(match.homeLogo, match.homeName) + '</span><strong>' + escapeHtml(match.homeName) + '</strong></div><b>' + escapeHtml(scoreText) + '</b><div><span>' + teamLogo(match.awayLogo, match.awayName) + '</span><strong>' + escapeHtml(match.awayName) + '</strong></div><small>' + escapeHtml(status) + '</small></section>' + matchSupportPanel(match) +
      '<nav class="match-tabs"><button class="is-active" data-match-tab="score">赛况</button><button data-match-tab="lineup">阵容</button><button data-match-tab="ranking">榜单</button></nav><div id="matchTabBody">' + centre + '</div><section class="match-info"><b>比赛信息</b><p>' + escapeHtml(info) + '</p></section></section>'
    document.getElementById('backToMatches').onclick = function () { location.hash = ''; render() }
    bindMatchSupport(match)
    bindMatchEventFilter(match, goalsOnly)
    Array.prototype.forEach.call(app.querySelectorAll('[data-match-tab]'), function (button) {
      button.onclick = function () {
        Array.prototype.forEach.call(app.querySelectorAll('[data-match-tab]'), function (item) { item.classList.remove('is-active') })
        button.classList.add('is-active')
        var panel = document.getElementById('matchTabBody')
        if (!panel) return
        var tab = button.getAttribute('data-match-tab')
        goalsOnly = false
        panel.innerHTML = tab === 'lineup' ? matchLineupPanel(match) : tab === 'ranking' ? '<section class="match-state"><strong>暂无本场榜单</strong><span>公开赛事榜单将在赛事页展示。</span></section>' : matchEventsPanel(match, goalsOnly)
        if (tab === 'score') bindMatchEventFilter(match, goalsOnly)
      }
    })
  }
  function renderEventsPage() {
    var list = state.tournaments
    app.innerHTML = '<section class="sub-page"><header class="sub-page-head"><button id="subBack">‹</button><div><span>赛小蜂足球</span><h1>赛事</h1></div></header><div class="sub-tabs"><button class="is-active">全部赛事</button><button>青少年</button><button>城市赛事</button></div><div class="event-list">' + (list.length ? list.map(function (item) { return '<button class="event-list-row" data-event="' + escapeHtml(item.id) + '"><div class="event-list-image"' + coverStyle(item) + '><span>' + mark(item.name) + '</span></div><div><small>' + escapeHtml(eventStatus(publicEventStatus(item))) + '</small><h2>' + escapeHtml(item.name) + '</h2><p>' + escapeHtml(dateRange(item) + (item.city ? ' · ' + item.city : '')) + '</p></div><i>›</i></button>' }).join('') : '<section class="portal-state"><strong>暂无已发布赛事</strong></section>') + '</div></section>' + bottomTabs('events')
    document.getElementById('subBack').onclick = function () { location.hash = ''; render() }
    bindSubPage()
  }
  function scheduleStatusText(value) { return ({ upcoming: '未开始', ongoing: '进行中', finished: '已完赛' })[String(value || '')] || '未开始' }
  function scheduleTimeValue(match) { return Number(match && match.timestamp || Date.parse([match && match.matchDate, match && match.matchTime].filter(Boolean).join(' ')) || 0) }
  function eventScheduleHtml(matches, activeStatus) {
    var current = ['upcoming', 'ongoing', 'finished'].indexOf(activeStatus) >= 0 ? activeStatus : 'all'
    var list = matches.slice().sort(function (left, right) { return scheduleTimeValue(left) - scheduleTimeValue(right) }).filter(function (match) { return current === 'all' || match.status === current })
    var filters = [{ key: 'all', label: '全部' }, { key: 'upcoming', label: '未开始' }, { key: 'ongoing', label: '进行中' }, { key: 'finished', label: '已完赛' }]
    var cards = list.length ? '<div class="event-schedule-list">' + list.map(function (match) { return '<button class="all-match-row" data-match="' + escapeHtml(match.id) + '"><header><span>' + escapeHtml(match.divisionName || match.round || '公开比赛') + '</span><b class="match-status-' + escapeHtml(match.status) + '">' + escapeHtml(scheduleStatusText(match.status)) + '</b></header><div><span>' + teamLogo(match.homeLogo, match.homeName) + '<strong>' + escapeHtml(match.homeName) + '</strong></span><i>' + escapeHtml(score(match)) + '</i><span>' + teamLogo(match.awayLogo, match.awayName) + '<strong>' + escapeHtml(match.awayName) + '</strong></span></div>' + matchEventSummary(match) + '<footer>' + escapeHtml([match.matchDate, match.matchTime, match.venue].filter(Boolean).join(' · ') || '比赛信息待公布') + '</footer></button>' }).join('') + '</div>' : '<section class="match-state"><strong>暂无符合条件的赛程</strong></section>'
    return '<div class="event-data-stack"><nav class="event-schedule-filters">' + filters.map(function (item) { return '<button class="' + (item.key === current ? 'is-active' : '') + '" data-schedule-status="' + item.key + '">' + item.label + '</button>' }).join('') + '</nav>' + cards + '</div>'
  }
  function eventGroupName(match) {
    var round = String(match && match.round || '')
    var group = round.match(/([A-ZＡ-Ｚ])组/i)
    if (group) return group[1].toUpperCase() + '组'
    return /联赛|循环/.test(round) ? '联赛组' : '已排赛球队'
  }
  function groupSequence(name) { var value = String(name || ''); var match = value.match(/^([A-Z])组$/); return match ? match[1].charCodeAt(0) : value === '联赛组' ? 0 : 999 }
  function eventGroupsHtml(matches) {
    var divisions = {}
    matches.slice().sort(function (left, right) { return scheduleTimeValue(left) - scheduleTimeValue(right) }).forEach(function (match) {
      var division = String(match.divisionName || '公开组')
      var group = eventGroupName(match)
      if (!divisions[division]) divisions[division] = {}
      if (!divisions[division][group]) divisions[division][group] = { teams: {}, order: [] }
      ;[[match.homeName, match.homeLogo], [match.awayName, match.awayLogo]].forEach(function (team) { if (team[0] && !divisions[division][group].teams[team[0]]) { divisions[division][group].teams[team[0]] = team[1] || ''; divisions[division][group].order.push(team[0]) } })
    })
    var divisionNames = Object.keys(divisions)
    if (!divisionNames.length) return '<section class="match-state"><strong>暂无公开分组</strong></section>'
    return '<div class="event-data-stack">' + divisionNames.map(function (division) {
      var groups = divisions[division]
      return '<section class="event-data-section"><header><h3>' + escapeHtml(division) + '</h3><span>' + escapeHtml(String(Object.keys(groups).length)) + ' 个分组</span></header><div class="event-group-grid">' + Object.keys(groups).sort(function (left, right) { return groupSequence(left) - groupSequence(right) || left.localeCompare(right, 'zh-CN') }).map(function (group) {
        var groupData = groups[group]
        return '<article class="event-group-card"><h4>' + escapeHtml(group) + '</h4><div>' + groupData.order.map(function (name, index) { return '<span class="event-group-team"><em>' + escapeHtml(String(index + 1)) + '</em>' + teamLogo(groupData.teams[name], name) + '<b>' + escapeHtml(name) + '</b></span>' }).join('') + '</div></article>'
      }).join('') + '</div></section>'
    }).join('') + '</div>'
  }
  function finishedEventMatches(matches) { return matches.filter(function (match) { return match.status === 'finished' && Number.isFinite(Number(match.homeScore)) && Number.isFinite(Number(match.awayScore)) }) }
  function lineupPlayerForEvent(match, event) {
    var lineups = match && match.lineups || {}
    var sides = event && event.teamSide === 'away' ? [lineups.away] : event && event.teamSide === 'home' ? [lineups.home] : [lineups.home, lineups.away]
    var eventNumber = String(event && event.playerNumber || '')
    var eventName = String(event && event.playerName || '')
    var result = null
    sides.forEach(function (lineup) {
      if (result || !lineup) return
      var players = (Array.isArray(lineup.starters) ? lineup.starters : []).concat(Array.isArray(lineup.substitutes) ? lineup.substitutes : [])
      result = players.filter(function (player) { return eventNumber && String(player && player.number || '') === eventNumber && (!eventName || String(player && player.name || '') === eventName) })[0] || players.filter(function (player) { return eventName && String(player && player.name || '') === eventName })[0] || null
    })
    return result
  }
  function rankingPlayerAvatar(avatarUrl, name) {
    var image = publicImage(avatarUrl)
    return image ? '<span class="ranking-player-avatar"><img src="' + escapeHtml(image) + '" alt="' + escapeHtml(name) + '" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><b hidden>' + mark(name, '球') + '</b></span>' : '<span class="ranking-player-avatar"><b>' + mark(name, '球') + '</b></span>'
  }
  function eventStandings(matches) {
    var tables = {}
    finishedEventMatches(matches).forEach(function (match) {
      var key = String(match.divisionName || '公开组') + '|' + eventGroupName(match)
      if (!tables[key]) tables[key] = { division: String(match.divisionName || '公开组'), group: eventGroupName(match), teams: {} }
      var table = tables[key].teams
      function team(name, logo) { if (!table[name]) table[name] = { name: name, logo: logo || '', played: 0, win: 0, draw: 0, loss: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }; return table[name] }
      var home = team(match.homeName || '主队', match.homeLogo)
      var away = team(match.awayName || '客队', match.awayLogo)
      var homeScore = Number(match.homeScore), awayScore = Number(match.awayScore)
      home.played += 1; away.played += 1; home.goalsFor += homeScore; home.goalsAgainst += awayScore; away.goalsFor += awayScore; away.goalsAgainst += homeScore
      if (homeScore > awayScore) { home.win += 1; home.points += 3; away.loss += 1 } else if (homeScore < awayScore) { away.win += 1; away.points += 3; home.loss += 1 } else { home.draw += 1; away.draw += 1; home.points += 1; away.points += 1 }
    })
    return Object.keys(tables).map(function (key) {
      var table = tables[key]
      table.rows = Object.keys(table.teams).map(function (name) { var row = table.teams[name]; row.goalDiff = row.goalsFor - row.goalsAgainst; return row }).sort(function (left, right) { return right.points - left.points || right.goalDiff - left.goalDiff || right.goalsFor - left.goalsFor || left.name.localeCompare(right.name, 'zh-CN') })
      return table
    })
  }
  function eventScorers(matches) {
    var scorers = {}
    finishedEventMatches(matches).forEach(function (match) {
      ;(Array.isArray(match.events) ? match.events : []).forEach(function (event) {
        if (['goal', 'score', 'penalty', 'penalty_goal', 'penalty_scored'].indexOf(String(event.type || '').toLowerCase()) < 0 || !event.playerName) return
        var teamName = String(event.teamName || (event.teamSide === 'away' ? match.awayName : match.homeName) || '')
        var divisionName = String(match.divisionName || '公开组')
        var groupName = eventGroupName(match)
        var key = divisionName + '|' + groupName + '|' + teamName + '|' + String(event.playerNumber || '') + '|' + String(event.playerName)
        var player = lineupPlayerForEvent(match, event)
        if (!scorers[key]) scorers[key] = { name: String(event.playerName), number: String(event.playerNumber || ''), teamName: teamName, divisionName: divisionName, groupName: groupName, avatarUrl: String(player && player.avatarUrl || ''), goals: 0 }
        scorers[key].goals += 1
      })
    })
    return Object.keys(scorers).map(function (key) { return scorers[key] }).sort(function (left, right) { return right.goals - left.goals || left.name.localeCompare(right.name, 'zh-CN') })
  }
  function eventScorerTables(scorers) {
    var tables = {}
    scorers.forEach(function (row) {
      var key = row.divisionName
      if (!tables[key]) tables[key] = { divisionName: row.divisionName, groupName: '', rows: [] }
      tables[key].rows.push(row)
    })
    return Object.keys(tables).map(function (key) {
      var table = tables[key]
      table.rows.sort(function (left, right) { return right.goals - left.goals || left.name.localeCompare(right.name, 'zh-CN') })
      return table
    })
  }
  function eventDiscipline(matches) {
    var players = {}
    finishedEventMatches(matches).forEach(function (match) {
      ;(Array.isArray(match.events) ? match.events : []).forEach(function (event) {
        var type = String(event.type || '').toLowerCase()
        if (['yellow_card', 'red_card'].indexOf(type) < 0 || !event.playerName) return
        var teamName = String(event.teamName || (event.teamSide === 'away' ? match.awayName : match.homeName) || '')
        var key = teamName + '|' + String(event.playerNumber || '') + '|' + String(event.playerName)
        var player = lineupPlayerForEvent(match, event)
        if (!players[key]) players[key] = { name: String(event.playerName), number: String(event.playerNumber || ''), teamName: teamName, avatarUrl: String(player && player.avatarUrl || ''), yellow: 0, red: 0 }
        if (type === 'red_card') players[key].red += 1
        else players[key].yellow += 1
      })
    })
    return Object.keys(players).map(function (key) { return players[key] }).sort(function (left, right) { return right.red - left.red || right.yellow - left.yellow || left.name.localeCompare(right.name, 'zh-CN') })
  }
  function eventRankingsHtml(matches, active, scorerGroup) {
    var tables = eventStandings(matches)
    var scorers = eventScorers(matches)
    var scorerTables = eventScorerTables(scorers)
    var discipline = eventDiscipline(matches)
    var standingsHtml = tables.length ? tables.map(function (table) { return '<section class="ranking-card"><header><h3>' + escapeHtml(table.division + ' · ' + table.group) + '</h3><span>积分榜</span></header><div class="standing-table"><div class="standing-head"><span>排名</span><span>球队</span><span>赛</span><span>胜平负</span><span>净胜</span><span>积分</span></div>' + table.rows.map(function (row, index) { return '<div><b>' + escapeHtml(String(index + 1)) + '</b><span class="standing-team">' + teamLogo(row.logo, row.name) + '<strong>' + escapeHtml(row.name) + '</strong></span><span>' + escapeHtml(String(row.played)) + '</span><span>' + escapeHtml(row.win + '-' + row.draw + '-' + row.loss) + '</span><span>' + escapeHtml((row.goalDiff > 0 ? '+' : '') + row.goalDiff) + '</span><em>' + escapeHtml(String(row.points)) + '</em></div>' }).join('') + '</div></section>' }).join('') : '<section class="match-state"><strong>暂无已结束比赛积分</strong></section>'
    var selectedScorerGroup = scorerGroup === 'all' || (scorerGroup && scorerTables[Number(scorerGroup)]) ? (scorerGroup || 'all') : 'all'
    var visibleScorerTables = selectedScorerGroup === 'all' ? [{ divisionName: '全部', groupName: '', rows: scorers }] : [scorerTables[Number(selectedScorerGroup)]]
    var scorerGroupTabs = '<nav class="scorer-group-tabs"><button class="' + (selectedScorerGroup === 'all' ? 'is-active' : '') + '" data-scorer-group="all">全部</button>' + scorerTables.map(function (table, index) { return '<button class="' + (selectedScorerGroup === String(index) ? 'is-active' : '') + '" data-scorer-group="' + index + '">' + escapeHtml(table.divisionName) + '</button>' }).join('') + '</nav>'
    var scorersHtml = visibleScorerTables.length ? visibleScorerTables.map(function (table) { return '<section class="ranking-card scorer-card"><header><h3>' + escapeHtml(table.divisionName) + '</h3><span>射手榜</span></header><div class="scorer-list">' + table.rows.slice(0, 50).map(function (row, index) { return '<div><b>' + escapeHtml(String(index + 1)) + '</b>' + rankingPlayerAvatar(row.avatarUrl, row.name) + '<strong>' + escapeHtml((row.number ? row.number + '号 ' : '') + row.name) + '</strong><span>' + escapeHtml(row.teamName) + '</span><em>' + escapeHtml(String(row.goals)) + '</em></div>' }).join('') + '</div></section>' }).join('') : '<section class="match-state"><strong>暂无公开射手数据</strong></section>'
    var disciplineHtml = discipline.length ? '<section class="ranking-card discipline-card"><header><h3>红黄牌</h3><span>纪律记录</span></header><div class="discipline-table"><div class="discipline-head"><span>排名</span><span>头像</span><span>球员</span><span>球队</span><span>黄牌</span><span>红牌</span></div>' + discipline.slice(0, 20).map(function (row, index) { return '<div><b>' + escapeHtml(String(index + 1)) + '</b>' + rankingPlayerAvatar(row.avatarUrl, row.name) + '<strong>' + escapeHtml((row.number ? row.number + '号 ' : '') + row.name) + '</strong><span>' + escapeHtml(row.teamName) + '</span><em>' + escapeHtml(String(row.yellow)) + '</em><i>' + escapeHtml(String(row.red)) + '</i></div>' }).join('') + '</div></section>' : '<section class="match-state"><strong>暂无公开红黄牌数据</strong></section>'
    var current = active === 'scorers' || active === 'discipline' ? active : 'standings'
    var content = current === 'scorers' ? '<section class="ranking-section-title"><h3>射手榜</h3><p>仅统计已公开进球事件</p></section>' + scorerGroupTabs + scorersHtml : current === 'discipline' ? '<section class="ranking-section-title"><h3>红黄牌</h3><p>仅统计已公开纪律事件</p></section>' + disciplineHtml : '<section class="ranking-section-title"><h3>积分榜</h3><p>仅统计已结束的公开比赛</p></section>' + standingsHtml
    return '<div class="event-data-stack"><nav class="event-ranking-tabs"><button class="' + (current === 'standings' ? 'is-active' : '') + '" data-ranking-tab="standings">积分榜</button><button class="' + (current === 'scorers' ? 'is-active' : '') + '" data-ranking-tab="scorers">射手榜</button><button class="' + (current === 'discipline' ? 'is-active' : '') + '" data-ranking-tab="discipline">红黄牌</button></nav>' + content + '</div>'
  }
  function bindScorerGroupTabs(matches) { Array.prototype.forEach.call(app.querySelectorAll('[data-scorer-group]'), function (button) { button.onclick = function () { var body = document.getElementById('eventDetailBody'); if (!body) return; body.innerHTML = eventRankingsHtml(matches, 'scorers', this.getAttribute('data-scorer-group')); bindScorerGroupTabs(matches); bindRankingTabs(matches); bindSubPage() } }) }
  function bindRankingTabs(matches) { Array.prototype.forEach.call(app.querySelectorAll('[data-ranking-tab]'), function (button) { button.onclick = function () { var body = document.getElementById('eventDetailBody'); if (!body) return; var tab = this.getAttribute('data-ranking-tab'); body.innerHTML = eventRankingsHtml(matches, tab, tab === 'scorers' ? 'all' : ''); bindRankingTabs(matches); if (tab === 'scorers') bindScorerGroupTabs(matches); bindSubPage() } }); if (app.querySelector('[data-ranking-tab].is-active') && app.querySelector('[data-ranking-tab].is-active').getAttribute('data-ranking-tab') === 'scorers') bindScorerGroupTabs(matches) }
  function eventInfoHtml(item) { return '<section class="event-info-panel"><div><span>赛事日期</span><b>' + escapeHtml(dateRange(item)) + '</b></div><div><span>举办地点</span><b>' + escapeHtml(item.city || item.venue || '地点待公布') + '</b></div><div><span>赛事状态</span><b>' + escapeHtml(eventStatus(publicEventStatus(item))) + '</b></div></section>' }
  function bindEventMatchButtons() { Array.prototype.forEach.call(app.querySelectorAll('[data-match]'), function (button) { button.onclick = function () { location.hash = 'match-' + this.getAttribute('data-match'); renderMatchPage(findMatch(this.getAttribute('data-match'))) } }) }
  function bindScheduleStatusFilters(matches) { Array.prototype.forEach.call(app.querySelectorAll('[data-schedule-status]'), function (button) { button.onclick = function () { var body = document.getElementById('eventDetailBody'); if (!body) return; body.innerHTML = eventScheduleHtml(matches, this.getAttribute('data-schedule-status')); bindScheduleStatusFilters(matches); bindEventMatchButtons(); bindSubPage() } }) }
  function renderEventDetail(item) {
    if (!item) return renderEventsPage()
    var matches = eventMatches(item)
    var views = { schedule: function () { return eventScheduleHtml(matches, 'all') }, groups: function () { return eventGroupsHtml(matches) }, rankings: function () { return eventRankingsHtml(matches, 'standings') }, info: function () { return eventInfoHtml(item) } }
    app.innerHTML = '<section class="event-detail-page"><header class="sub-page-head"><button id="eventBack">‹</button><div><span>' + escapeHtml(eventStatus(publicEventStatus(item))) + '</span><h1>' + escapeHtml(item.name) + '</h1></div></header><section class="event-detail-hero"' + coverStyle(item) + '><div><b>' + escapeHtml(dateRange(item)) + '</b><span>' + escapeHtml(item.city || item.venue || '地点待公布') + '</span></div></section><div class="event-detail-tabs"><button class="is-active" data-event-tab="schedule">赛程</button><button data-event-tab="groups">分组</button><button data-event-tab="rankings">榜单</button><button data-event-tab="info">赛事信息</button></div><div class="event-detail-body" id="eventDetailBody"></div></section>' + bottomTabs('events')
    function paint(tab) { var body = document.getElementById('eventDetailBody'); if (!body) return; body.innerHTML = views[tab](); bindEventMatchButtons(); if (tab === 'schedule') bindScheduleStatusFilters(matches); if (tab === 'rankings') bindRankingTabs(matches); bindSubPage() }
    document.getElementById('eventBack').onclick = function () { location.hash = 'events'; renderEventsPage() }
    Array.prototype.forEach.call(app.querySelectorAll('[data-event-tab]'), function (button) { button.onclick = function () { Array.prototype.forEach.call(app.querySelectorAll('[data-event-tab]'), function (item) { item.classList.remove('is-active') }); button.classList.add('is-active'); paint(button.getAttribute('data-event-tab')) } })
    paint('schedule')
    bindSubPage()
  }
  function renderMatchesPage() {
    var filter = 'all'
    function paint() {
      var list = state.matches.filter(function (item) { return !isKnockoutMatch(item) && (filter === 'all' || item.status === filter) })
      var cards = list.map(function (item) { return '<button class="all-match-row" data-match="' + escapeHtml(item.id) + '"><header><span>' + escapeHtml(item.tournamentName || '公开赛事') + '</span><b>' + escapeHtml(matchStatus(item.status)) + '</b></header><div><span>' + teamLogo(item.homeLogo, item.homeName) + '<strong>' + escapeHtml(item.homeName) + '</strong></span><i>' + escapeHtml(score(item)) + '</i><span>' + teamLogo(item.awayLogo, item.awayName) + '<strong>' + escapeHtml(item.awayName) + '</strong></span></div>' + matchEventSummary(item) + '<footer>' + escapeHtml([item.matchDate, item.matchTime, item.venue, item.divisionName].filter(Boolean).join(' · ') || '比赛信息待公布') + '</footer></button>' }).join('')
      app.innerHTML = '<section class="sub-page"><header class="sub-page-head"><button id="matchesBack">‹</button><div><span>公开比赛</span><h1>比赛</h1></div></header><div class="sub-tabs match-filter"><button class="' + (filter === 'all' ? 'is-active' : '') + '" data-filter="all">全部</button><button class="' + (filter === 'upcoming' ? 'is-active' : '') + '" data-filter="upcoming">待开始</button><button class="' + (filter === 'ongoing' ? 'is-active' : '') + '" data-filter="ongoing">进行中</button><button class="' + (filter === 'finished' ? 'is-active' : '') + '" data-filter="finished">已结束</button></div><div class="all-match-list">' + (cards || '<section class="portal-state"><strong>暂无符合条件的公开比赛</strong></section>') + '</div></section>' + bottomTabs('matches')
      document.getElementById('matchesBack').onclick = function () { location.hash = ''; render() }
      Array.prototype.forEach.call(app.querySelectorAll('[data-filter]'), function (button) { button.onclick = function () { filter = this.getAttribute('data-filter'); paint() } })
      Array.prototype.forEach.call(app.querySelectorAll('[data-match]'), function (button) { button.onclick = function () { location.hash = 'match-' + this.getAttribute('data-match'); renderMatchPage(findMatch(this.getAttribute('data-match'))) } })
      bindSubPage()
    }
    paint()
  }
  function renderRankingsPage() {
    var type = 'team', period = 'week', keyword = ''
    function periodLabel(value) { return value === 'week' ? '本周 · 周一开榜' : value === 'month' ? '本月 · 每月1日开榜' : '本季度 · 季度首日开榜' }
    function paint() {
      app.innerHTML = '<section class="sub-page"><header class="sub-page-head"><button id="rankBack">‹</button><div><span>公开互动数据</span><h1>榜单</h1></div></header><div class="ranking-switch"><button class="' + (type === 'team' ? 'is-active' : '') + '" data-rank-type="team">球队榜</button><button class="' + (type === 'player' ? 'is-active' : '') + '" data-rank-type="player">球员榜</button></div><div class="public-ranking-period"><button class="' + (period === 'week' ? 'is-active' : '') + '" data-rank-period="week">周榜</button><button class="' + (period === 'month' ? 'is-active' : '') + '" data-rank-period="month">月榜</button><button class="' + (period === 'season' ? 'is-active' : '') + '" data-rank-period="season">季榜</button></div><label class="public-ranking-search"><input id="publicRankingSearch" type="search" autocomplete="off" value="' + escapeHtml(keyword) + '" placeholder="' + (type === 'player' ? '搜索球员、号码或球队' : '搜索球队') + '"></label><section class="ranking-podium" aria-hidden="true"><img src="./assets/brand/trophy-spot.png" alt=""><div><i>2</i><i>1</i><i>3</i></div></section><div id="publicRankingBody"><section class="portal-loading"><i></i><strong>正在读取榜单…</strong></section></div></section>' + bottomTabs('rankings')
      document.getElementById('rankBack').onclick = function () { location.hash = ''; render() }
      Array.prototype.forEach.call(app.querySelectorAll('[data-rank-type]'), function (button) { button.onclick = function () { type = this.getAttribute('data-rank-type'); paint() } })
      Array.prototype.forEach.call(app.querySelectorAll('[data-rank-period]'), function (button) { button.onclick = function () { period = this.getAttribute('data-rank-period'); paint() } })
      bindSubPage()
      var searchInput = document.getElementById('publicRankingSearch')
      var rankingRows = null
      function bindSupport() {
        Array.prototype.forEach.call(app.querySelectorAll('[data-rank-support]'), function (button) { button.onclick = function (event) { if (event) event.stopPropagation(); var token = localStorage.getItem('sxf_fan_h5_session') || ''; if (!token) { location.href = './me.html'; return } button.disabled = true; api({ action:'fanSupport', fanSessionToken:token, targetType:this.getAttribute('data-rank-support-type'), targetId:this.getAttribute('data-rank-support'), tournamentId:scheduleTournamentId, period:period }).then(function (reply) { if (!reply.success) throw new Error(reply.error || '应援失败'); button.textContent = '已应援'; button.disabled = true }).catch(function (error) { button.disabled = false; window.alert(error.message || '应援失败') }) } })
      }
      function showRows() {
        if (!rankingRows) return
        var query = String(keyword || '').trim().toLowerCase()
        var rows = query ? rankingRows.filter(function (row) { return [row.name, row.number, row.teamName].join(' ').toLowerCase().indexOf(query) >= 0 }) : rankingRows
        var playerCards = '<div class="player-ranking-grid">' + rows.slice(0, 50).map(function (row, index) { var tier = ['bronze', 'silver', 'gold'].indexOf(String(row.cardTier || '')) >= 0 ? String(row.cardTier) : 'bronze'; var physical = (row.height ? row.height + 'cm' : '—cm') + ' / ' + (row.weight ? row.weight + 'kg' : '—kg'); return '<div class="player-ranking-entry"><div class="player-ranking-entry-meta"><b>' + (index + 1) + '</b><button data-rank-support="' + escapeHtml(row.targetId) + '" data-rank-support-type="player" type="button">+1 蜂豆</button></div><article class="player-ranking-card player-ranking-card--' + tier + '"><img class="player-ranking-card-bg" src="./assets/player-cards/' + tier + '-card.png" alt=""><b class="player-ranking-card-number">' + escapeHtml(row.number || '—') + '</b><div class="player-ranking-card-photo">' + rankingPlayerAvatar(row.avatarUrl, row.name) + '</div><strong>' + escapeHtml(row.name || '球员') + '</strong><i class="player-ranking-card-jersey">' + escapeHtml(row.jerseyName || row.name || '') + '</i><small>' + escapeHtml(row.teamName || '所属球队待公布') + '</small><span class="player-ranking-card-physical">' + escapeHtml(physical) + ' · ' + escapeHtml(row.nationality || '中国') + '</span><footer><em>' + escapeHtml(String(row.appearances || 0)) + ' 场 · ' + escapeHtml(String(row.goals || 0)) + ' 球 · ' + escapeHtml(String(row.assists || 0)) + ' 助</em></footer></article></div>' }).join('') + '</div>'
        var teamRows = '<div class="public-ranking-list">' + rows.slice(0, 50).map(function (row, index) { return '<div class="public-ranking-row public-ranking-row--team"><b>' + (index + 1) + '</b><span class="public-ranking-team-logo">' + teamLogo(row.logo, row.name) + '</span><span class="public-ranking-copy"><strong>' + escapeHtml(row.name) + '</strong><small>' + escapeHtml(String(row.supportCount || 0) + ' 人应援') + '</small></span><em>' + escapeHtml(String(row.supportCount || 0)) + '</em><button data-rank-support="' + escapeHtml(row.targetId) + '" data-rank-support-type="team" type="button">+1 蜂豆</button></div>' }).join('') + '</div>'
        var html = rows.length ? '<section class="public-ranking-card"><header><b>' + (type === 'player' ? '球员榜' : '球队榜') + '</b><span>' + periodLabel(period) + '</span></header>' + (type === 'player' ? playerCards : teamRows) + '</section>' : '<section class="ranking-empty"><strong>' + (query ? '未找到相关结果' : '暂无公开榜单') + '</strong></section>'
        document.getElementById('publicRankingBody').innerHTML = html
        bindSupport()
      }
      searchInput.oninput = function () { keyword = this.value; showRows() }
      api({ action: 'fanRankings', tournamentId: scheduleTournamentId, period: period }).then(function (result) {
        if (!result.success) throw new Error(result.error || '榜单暂时无法加载')
        rankingRows = type === 'player' ? ((result.data && result.data.players) || []) : ((result.data && result.data.teams) || [])
        showRows()
      }).catch(function (error) { document.getElementById('publicRankingBody').innerHTML = '<section class="portal-state"><strong>榜单暂时无法加载</strong><p>' + escapeHtml(error.message || '请稍后重试') + '</p></section>' })
    }
    paint()
  }
  function bottomTabs(active) {
    return '<nav class="bottom-tabs"><button class="' + (active === 'home' ? 'is-active' : '') + '" data-bottom="home">首页</button><button class="' + (active === 'matches' ? 'is-active' : '') + '" data-bottom="matches">比赛</button><button class="' + (active === 'events' ? 'is-active' : '') + '" data-bottom="events">赛事</button><button class="' + (active === 'rankings' ? 'is-active' : '') + '" data-bottom="rankings">应援</button><a href="./me.html">我的</a></nav>'
  }
  function bindSubPage() {
    Array.prototype.forEach.call(app.querySelectorAll('[data-event]'), function (button) { button.onclick = function () { activeEventId = this.getAttribute('data-event'); location.hash = 'event-' + activeEventId; renderEventDetail(findTournament(activeEventId)) } })
    Array.prototype.forEach.call(app.querySelectorAll('[data-bottom]'), function (button) { button.onclick = function () { var target = this.getAttribute('data-bottom'); location.hash = target === 'events' ? 'events' : target === 'rankings' ? 'rankings' : target === 'matches' ? 'matches' : ''; target === 'events' ? renderEventsPage() : target === 'rankings' ? renderRankingsPage() : target === 'matches' ? renderMatchesPage() : render() } })
  }
  function render() {
    var list = filteredTournaments()
    var featured = selectedTournament()
    if (!featured) return renderEmpty()
    var matches = eventMatches(featured).slice(0, 2)
    var tabs = categories.map(function (item) { return '<button class="' + (item.key === activeCategory ? 'is-active' : '') + '" data-category="' + item.key + '">' + item.label + '</button>' }).join('')
    var matchHtml = matches.length ? matches.map(function (item) {
      return '<button class="match-card" data-match="' + escapeHtml(item.id) + '"><strong>' + escapeHtml(matchTime(item)) + '</strong><small>' + escapeHtml(item.divisionName || item.round || '公开比赛') + '</small><div><span>' + teamLogo(item.homeLogo, item.homeName) + '<b>' + escapeHtml(item.homeName) + '</b></span><i>' + escapeHtml(score(item)) + '</i><span>' + teamLogo(item.awayLogo, item.awayName) + '<b>' + escapeHtml(item.awayName) + '</b></span></div>' + matchEventSummary(item) + '<em class="' + escapeHtml(item.status) + '">' + escapeHtml(matchStatus(item.status)) + '</em></button>'
    }).join('') : '<p class="strip-empty">暂无已发布赛程</p>'
    var updateList = scheduleTournamentId ? list.filter(function (item) { return String(item.id) === scheduleTournamentId }) : list
    var updates = updateList.slice(0, 6).map(function (item) {
      var itemMatches = eventMatches(item)
      var label = itemMatches.some(function (match) { return match.status === 'ongoing' }) ? '正在进行' : itemMatches.some(function (match) { return match.status === 'finished' }) ? '赛果已更新' : '赛程已发布'
      return '<button class="news-row" data-event="' + escapeHtml(item.id) + '"><div class="news-image"' + coverStyle(item) + '><span>' + mark(item.name) + '</span></div><div><h2>' + escapeHtml(item.name + ' ' + label) + '</h2><p>' + escapeHtml(dateRange(item) + ' · ' + itemMatches.length + ' 场公开比赛') + '</p></div><i>›</i></button>'
    }).join('')
    app.innerHTML = '<nav class="category-tabs">' + tabs + '</nav>' +
      '<section class="event-hero"' + coverStyle(featured) + '><div class="hero-shade"></div><div class="hero-copy"><span>' + escapeHtml(eventStatus(publicEventStatus(featured))) + '</span><h1>' + escapeHtml(featured.name) + '</h1><p>' + escapeHtml(dateRange(featured) + (featured.city || featured.venue ? ' · ' + (featured.city || featured.venue) : '')) + '</p></div><button class="hero-detail" data-event="' + escapeHtml(featured.id) + '">赛事详情</button><div class="pager">' + list.slice(0, 4).map(function (item) { return '<button data-event="' + escapeHtml(item.id) + '" class="' + (item.id === featured.id ? 'is-active' : '') + '" aria-label="切换赛事"></button>' }).join('') + '</div></section>' +
      '<section class="portal-section match-schedule-section"><header><h2>近期赛程' + (scheduleTournamentId ? ' · 开封立洋杯' : '') + '</h2><button data-anchor="matches">全部比赛 ›</button></header><div class="match-strip">' + matchHtml + '</div></section>' +
      '<section class="portal-section news-section"><header><h2>赛事动态</h2></header><div class="news-list">' + updates + '</div></section>' +
      '<nav class="bottom-tabs"><button class="is-active" data-home="1">首页</button><button data-anchor="matches">比赛</button><button data-anchor="events">赛事</button><button data-anchor="rankings">榜单</button><a href="./me.html">我的</a></nav>'
    bind()
  }
  function bind() {
    Array.prototype.forEach.call(app.querySelectorAll('[data-category]'), function (button) { button.onclick = function () { activeCategory = this.getAttribute('data-category'); activeEventId = ''; render() } })
    Array.prototype.forEach.call(app.querySelectorAll('[data-event]'), function (button) { button.onclick = function () { activeEventId = this.getAttribute('data-event'); if (button.classList.contains('hero-detail') || button.classList.contains('news-row')) { location.hash = 'event-' + activeEventId; renderEventDetail(findTournament(activeEventId)) } else { window.scrollTo({ top: 0, behavior: 'smooth' }); render() } } })
    Array.prototype.forEach.call(app.querySelectorAll('[data-match]'), function (button) { button.onclick = function () { location.hash = 'match-' + this.getAttribute('data-match'); renderMatchPage(findMatch(this.getAttribute('data-match'))) } })
    Array.prototype.forEach.call(app.querySelectorAll('[data-anchor]'), function (button) { button.onclick = function () { var anchor = this.getAttribute('data-anchor'); if (anchor === 'events') { location.hash = 'events'; renderEventsPage(); return } if (anchor === 'rankings') { location.hash = 'rankings'; renderRankingsPage(); return } if (anchor === 'matches') { location.hash = 'matches'; renderMatchesPage(); return } var target = app.querySelector('.news-section'); if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' }) } })
    Array.prototype.forEach.call(app.querySelectorAll('[data-bottom]'), function (button) { button.onclick = function () { var target = this.getAttribute('data-bottom'); location.hash = target === 'events' ? 'events' : target === 'rankings' ? 'rankings' : ''; target === 'events' ? renderEventsPage() : target === 'rankings' ? renderRankingsPage() : render() } })
  }
  function load() {
    renderLoading()
    api({ action: 'publicTournamentCenter' }).then(function (result) {
      if (!result.success) throw new Error(result.error || '请稍后重试')
      state.tournaments = (result.data && result.data.tournaments) || []
      state.matches = (result.data && result.data.matches) || []
      applyScheduleFilter()
      var matchId = location.hash.replace(/^#match-/, '')
      if (location.hash.indexOf('#match-') === 0 && findMatch(matchId)) renderMatchPage(findMatch(matchId))
      else if (location.hash === '#events') renderEventsPage()
      else if (location.hash.indexOf('#event-') === 0) renderEventDetail(findTournament(location.hash.replace(/^#event-/, '')))
      else if (location.hash === '#rankings') renderRankingsPage()
      else if (location.hash === '#matches') renderMatchesPage()
      else render()
    }).catch(function (error) { renderError(error.message) })
  }
  if (location.hostname === '127.0.0.1' && new URLSearchParams(location.search).get('visualQa') === '1') {
    state.tournaments = [{ id: 'qa-liyang', name: '2026年开封立洋杯足球联赛', status: 'registering', startDate: '2026-09-26', endDate: '2026-10-31', city: '开封市', category: 'adult' }]
    state.matches = [{ id: 'qa-finished', tournamentId: 'qa-liyang', tournamentName: '2026年开封立洋杯足球联赛', divisionName: '老年组', status: 'finished', matchDate: '2026-09-26', matchTime: '09:00', venue: '1号场地', homeName: '开封U40队', awayName: '开封市老友足球二队', homeScore: 3, awayScore: 1, events: [{ minute: 12, type: 'goal', teamSide: 'home', teamName: '开封U40队', playerNumber: '9', playerName: '苑斌' }, { minute: 23, type: 'substitution', teamSide: 'home', teamName: '开封U40队', playerNumber: '1', playerName: '吴克辛', assistNumber: '12', assistName: '彭斌' }, { minute: 36, type: 'goal', teamSide: 'away', teamName: '开封市老友足球二队', playerNumber: '98', playerName: '李新' }, { minute: 47, type: 'goal', teamSide: 'home', teamName: '开封U40队', playerNumber: '9', playerName: '苑斌' }], lineups: { home: { teamName: '开封U40队', formation: '3-3-1', starters: [{ number: '27', name: '吕杰' }, { number: '11', name: '于子强' }, { number: '17', name: '程芳明' }, { number: '13', name: '李艳涛' }, { number: '7', name: '王文伟' }, { number: '18', name: '王宁' }, { number: '15', name: '张红艳' }, { number: '6', name: '刘存谊' }], substitutes: [{ number: '10', name: '肖军' }, { number: '12', name: '彭斌' }, { number: '1', name: '吴克辛' }] }, away: { teamName: '开封市老友足球二队', formation: '3-3-1', starters: [{ number: '68', name: '张庆良' }, { number: '23', name: '邢汴发' }, { number: '12', name: '陈志勋' }, { number: '26', name: '秦增幅' }, { number: '98', name: '李新' }, { number: '80', name: '郭长得' }, { number: '53', name: '刘财慧' }, { number: '60', name: '杨少勇' }], substitutes: [{ number: '16', name: '徐德' }, { number: '8', name: '李少剑' }, { number: '19', name: '邹彤' }] } } }, { id: 'qa-upcoming', tournamentId: 'qa-liyang', tournamentName: '2026年开封立洋杯足球联赛', divisionName: '中年组', status: 'upcoming', matchDate: '2026-10-01', matchTime: '09:00', venue: '2号场地', homeName: '开封大道-纵横队', awayName: '开封科创联队' }]
    applyScheduleFilter()
    var visualMatchId = location.hash.replace(/^#match-/, '')
    if (location.hash.indexOf('#match-') === 0 && findMatch(visualMatchId)) renderMatchPage(findMatch(visualMatchId))
    else if (location.hash === '#events') renderEventsPage()
    else if (location.hash.indexOf('#event-') === 0) renderEventDetail(findTournament(location.hash.replace(/^#event-/, '')))
    else if (location.hash === '#rankings') renderRankingsPage()
    else if (location.hash === '#matches') renderMatchesPage()
    else render()
  } else load()
  window.addEventListener('hashchange', function () {
    var matchId = location.hash.replace(/^#match-/, '')
    if (location.hash.indexOf('#match-') === 0 && findMatch(matchId)) renderMatchPage(findMatch(matchId))
    else if (location.hash === '#events') renderEventsPage()
    else if (location.hash.indexOf('#event-') === 0) renderEventDetail(findTournament(location.hash.replace(/^#event-/, '')))
    else if (location.hash === '#rankings') renderRankingsPage()
    else if (location.hash === '#matches') renderMatchesPage()
    else render()
  })
})()
