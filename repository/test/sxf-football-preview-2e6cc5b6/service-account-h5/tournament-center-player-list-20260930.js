(function () {
  'use strict'

  var API_URL = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'
  var app = document.getElementById('app')
  var activeCategory = 'all'
  var activeEventId = ''
  var scheduleTournamentId = ''
  var state = { tournaments: [], matches: [], news: [] }
  var categories = [
    { key: 'all', label: '头条' }, { key: 'amateur', label: '业余赛事' }, { key: 'youth', label: '青少年赛事' }, { key: 'city', label: '地市赛事' }, { key: 'other', label: '其他赛事' }
  ]

  function escapeHtml(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] }) }
  function supportRequestKey() { return window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12) }
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
  function formatNewsDate(value) { var match = String(value || '').match(/^\d{4}-\d{2}-\d{2}/); return match ? match[0] : String(value || '').slice(0, 10) }
  function newsImage(fileId) { return publicImage(fileId) }
  function dailyNewsTables(item) {
    var results = Array.isArray(item.dayResults) ? item.dayResults : []
    var fixtures = Array.isArray(item.nextFixtures) ? item.nextFixtures : []
    var resultRows = results.map(function (row) { return '<tr><td>' + escapeHtml(row.division || '—') + '</td><td>' + escapeHtml(row.home || '') + '</td><td><strong>' + escapeHtml(row.score || '') + '</strong></td><td>' + escapeHtml(row.away || '') + '</td></tr>' }).join('')
    var fixtureRows = fixtures.map(function (row) { return '<tr><td>' + escapeHtml(row.division || '—') + '</td><td>' + escapeHtml((row.date || '') + ' ' + (row.time || '')) + '</td><td>' + escapeHtml(row.home || '') + '</td><td>' + escapeHtml(row.away || '') + '</td><td>' + escapeHtml(row.venue || '待定') + '</td></tr>' }).join('')
    return '<section class="news-detail-section"><h2>本轮赛果</h2><div class="news-table-scroll"><table><thead><tr><th>组别</th><th>主队</th><th>比分</th><th>客队</th></tr></thead><tbody>' + resultRows + '</tbody></table></div></section>' +
      '<section class="news-detail-section"><h2>积分榜</h2>' + (item.standingsSnapshotFileId ? '<img class="news-standings-image" src="' + escapeHtml(newsImage(item.standingsSnapshotFileId)) + '" alt="正式积分榜快照">' : '<p>本期未附积分榜快照。</p>') + '</section>' +
      '<section class="news-detail-section"><h2>下轮对阵</h2>' + (fixtureRows ? '<div class="news-table-scroll"><table><thead><tr><th>组别</th><th>时间</th><th>主队</th><th>客队</th><th>场地</th></tr></thead><tbody>' + fixtureRows + '</tbody></table></div>' : '<p>下一轮赛程尚未公布。</p>') + '</section>' +
      '<section class="news-detail-section"><h2>停赛信息</h2><p>' + escapeHtml(item.suspensionNote ? '主办方提供：' + item.suspensionNote : '下轮停赛名单尚未录入，待主办方确认。') + '</p></section>'
  }
  function renderNewsDetail(item) {
    if (!item) return render()
    var coverId = item.coverFileId || (item.photoFileIds && item.photoFileIds[0]) || ''
    var body = String(item.body || '').split(/\n\s*\n/).map(function (part) { return part.trim() }).filter(Boolean)
    var extraPhotos = (Array.isArray(item.photoFileIds) ? item.photoFileIds : []).slice(1)
    var bodyHtml = body.map(function (paragraph, index) { return '<p>' + escapeHtml(paragraph).replace(/\n/g, '<br>') + '</p>' + (extraPhotos[index] ? '<img class="news-inline-image" src="' + escapeHtml(newsImage(extraPhotos[index])) + '" alt="比赛现场照片">' : '') }).join('')
    app.innerHTML = '<main class="news-detail-page"><button id="newsBack" class="news-back" type="button">‹ 返回赛事</button><article><header><small>' + escapeHtml(item.kind === 'daily' ? '每日新闻' : '单场新闻') + ' · ' + escapeHtml(formatNewsDate(item.publishedAt || item.date)) + '</small><h1>' + escapeHtml(item.title || '') + '</h1></header>' +
      (coverId ? '<img class="news-cover-image" src="' + escapeHtml(newsImage(coverId)) + '" alt="新闻封面">' : '') +
      (item.kind === 'daily' ? dailyNewsTables(item) : '<div class="news-body">' + bodyHtml + '</div>') + '</article></main>' +
      '<nav class="bottom-tabs"><button data-home="1">首页</button><button data-anchor="matches">比赛</button><button data-anchor="events">赛事</button><button data-anchor="rankings">榜单</button><a href="./me.html">我的</a></nav>'
    document.getElementById('newsBack').onclick = function () { render() }
    bind()
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
    var photo = publicImage(player.avatarUrl)
    var portrait = photo ? '<img class="pitch-player-portrait" src="' + escapeHtml(photo) + '" alt="' + escapeHtml(player.name || '球员') + '" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><b hidden>' + escapeHtml(player.number || '—') + '</b>' : '<b>' + escapeHtml(player.number || '—') + '</b>'
    return '<article class="pitch-player' + (photo ? ' pitch-player--portrait' : '') + '">' + portrait + (photo ? '<em class="lineup-shirt-number">' + escapeHtml(player.number || '—') + '</em>' : '') + '<span>' + escapeHtml(player.name || '球员') + '</span>' + (player.captain ? '<i>队长</i>' : '') + playerChangeMarks(change) + '</article>'
  }
  function pitchTeam(lineup, side, fallbackName, match) {
    if (!lineup || !Array.isArray(lineup.starters) || !lineup.starters.length) return '<section class="pitch-team pitch-team--' + side + ' is-empty"><header><b>' + escapeHtml(fallbackName || '球队') + '</b><span>暂无首发</span></header></section>'
    var rows = formationRows(lineup)
    return '<section class="pitch-team pitch-team--' + side + '"><header><b>' + escapeHtml(lineup.teamName || fallbackName || '球队') + '</b><span>' + escapeHtml(lineup.formation || '') + '</span></header><div class="pitch-rows">' + rows.map(function (row) { return '<div class="pitch-row">' + row.map(function (player) { return pitchPlayer(player, side, match) }).join('') + '</div>' }).join('') + '</div></section>'
  }
  function substitutePlayerRow(player, side, match) {
    if (!player) return '<div class="substitute-player substitute-player--' + side + ' substitute-player--empty">—</div>'
    var change = playerChangeEvents(match, player, side)
    var photo = publicImage(player.avatarUrl)
    var portrait = photo ? '<img class="substitute-player-portrait" src="' + escapeHtml(photo) + '" alt="' + escapeHtml(player.name || '球员') + '" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><b hidden>' + escapeHtml(player.number || '—') + '</b>' : '<b>' + escapeHtml(player.number || '—') + '</b>'
    return '<div class="substitute-player substitute-player--' + side + '"><span class="substitute-portrait-wrap">' + portrait + (photo ? '<em class="lineup-shirt-number">' + escapeHtml(player.number || '—') + '</em>' : '') + '</span><span>' + escapeHtml(player.name || '球员') + (player.position ? '<small>' + escapeHtml(player.position) + '</small>' : '') + '</span><aside>' + playerChangeMarks(change) + '</aside></div>'
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
  // Public match statistics v1: optional { home: {...}, away: {...} }.
  // Missing values stay null; event counters supply only goals/cards already published.
  function matchStatisticsValues(match) {
    var source = match.statistics || {}, home = source.home || {}, away = source.away || {}
    function number(value) { return value == null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0 ? null : Number(value) }
    var events = Array.isArray(match.events) ? match.events : []
    function cards(side, type) { return events.length ? events.filter(function (event) { return event.teamSide === side && event.type === type }).length : null }
    var keys = ['possession', 'goals', 'yellowCards', 'redCards', 'corners', 'shots', 'shotsOnTarget', 'fouls', 'offsides', 'passes', 'passAccuracy']
    var result = { home: {}, away: {} }
    keys.forEach(function (key) { result.home[key] = number(home[key]); result.away[key] = number(away[key]) })
    ;['home', 'away'].forEach(function (side) {
      var row = result[side]
      if (row.goals == null && match.status !== 'upcoming') row.goals = number(side === 'home' ? match.homeScore : match.awayScore)
      if (row.yellowCards == null) row.yellowCards = cards(side, 'yellow_card')
      if (row.redCards == null) row.redCards = cards(side, 'red_card')
    })
    return result
  }
  function matchStatisticsPanel(match) {
    var values = matchStatisticsValues(match)
    var fields = [['possession', '控球率', true], ['goals', '进球'], ['yellowCards', '黄牌'], ['redCards', '红牌'], ['corners', '角球'], ['shots', '射门'], ['shotsOnTarget', '射正'], ['fouls', '犯规'], ['offsides', '越位'], ['passes', '传球'], ['passAccuracy', '传球成功率', true]]
    return '<section class="match-statistics"><header><b>球队统计</b></header><div class="match-statistics-teams"><span>' + teamLogo(match.homeLogo, match.homeName) + '<b>' + escapeHtml(match.homeName) + '</b></span><span>' + teamLogo(match.awayLogo, match.awayName) + '<b>' + escapeHtml(match.awayName) + '</b></span></div>' + fields.map(function (field) {
      var home = values.home[field[0]], away = values.away[field[0]], total = (home || 0) + (away || 0)
      var comparable = home != null && away != null && total > 0
      var homeWidth = comparable ? Math.round(home / total * 100) : 0, awayWidth = comparable ? 100 - homeWidth : 0
      function label(value) { return value == null ? '—' : String(value) + (field[2] ? '%' : '') }
      return '<div class="match-statistics-row"><b>' + escapeHtml(label(home)) + '</b><span class="stat-bar stat-bar--home"><i style="width:' + homeWidth + '%"></i></span><span class="stat-label">' + field[1] + '</span><span class="stat-bar stat-bar--away"><i style="width:' + awayWidth + '%"></i></span><b>' + escapeHtml(label(away)) + '</b></div>'
    }).join('') + '</section>'
  }
  function renderMatchPlayerRankings(match) {
    var panel = document.getElementById('matchTabBody')
    if (!panel) return
    var request = 0, activeSide = 'home', roster = [], publishedIds = {}, pending = {}, supportKeys = {}
    var cached = match._fanSupportCache || null, counts = cached ? cached.counts : null
    ;['home', 'away'].forEach(function (side) {
      var lineup = match.lineups && match.lineups[side]
      if (!lineup) return
      var teamName = side === 'away' ? (match.awaySupportName || match.awayName) : (match.homeSupportName || match.homeName)
      ;(lineup.starters || []).concat(lineup.substitutes || []).forEach(function (player) {
        var id = 'player|' + match.tournamentId + '|' + teamName + '|' + String(player.number || '') + '|' + String(player.name || '')
        if (publishedIds[id]) return
        publishedIds[id] = side
        roster.push({ targetId:id, name:player.name, number:player.number, avatarUrl:player.avatarUrl })
      })
    })
    panel.innerHTML = '<section class="match-player-rankings"><nav class="match-ranking-sides" aria-label="选择球队"><button class="is-active" aria-pressed="true" data-match-rank-side="home">主队</button><button aria-pressed="false" data-match-rank-side="away">客队</button></nav><header><b id="matchSupportTeamName">' + escapeHtml(match.homeName) + '</b><a href="#rankings" id="matchSupportHome">全部应援</a></header><div id="matchPlayerRankingBody"></div></section>'
    var section = panel.querySelector('.match-player-rankings')
    document.getElementById('matchSupportHome').onclick = function (event) { event.preventDefault(); location.hash = 'rankings'; renderRankingsPage() }
    function current() { return section.isConnected && document.getElementById('matchPlayerRankingBody') && app.querySelector('[data-match-tab="ranking"].is-active') }
    function paintRows() {
      var body = document.getElementById('matchPlayerRankingBody')
      if (!body || !current()) return
      var teamRows = roster.filter(function (row) { return publishedIds[row.targetId] === activeSide })
      if (counts) teamRows.sort(function (left, right) { return Number(counts[right.targetId] || 0) - Number(counts[left.targetId] || 0) || String(left.name || '').localeCompare(String(right.name || ''), 'zh-CN') })
      body.innerHTML = teamRows.length ? teamRows.map(function (row, index) { return '<article class="match-ranking-player"><b>' + (index + 1) + '</b>' + rankingPlayerAvatar(row.avatarUrl, row.name) + '<span><strong>' + escapeHtml((row.number ? row.number + '号 ' : '') + row.name) + '</strong></span><em>' + (counts ? escapeHtml(String(counts[row.targetId] || 0)) : '—') + '</em><button type="button" data-match-player-support="' + escapeHtml(row.targetId) + '"' + (pending[row.targetId] ? ' disabled' : '') + '>' + (pending[row.targetId] ? '提交中' : '+1 滴蜂蜜') + '</button></article>' }).join('') : '<div class="match-ranking-state">暂无公开球员名单</div>'
        Array.prototype.forEach.call(body.querySelectorAll('[data-match-player-support]'), function (button) {
          button.onclick = function () {
            var token = localStorage.getItem('sxf_fan_h5_session') || ''
            if (!token) { location.href = './me.html'; return }
            var targetId = button.getAttribute('data-match-player-support')
            if (pending[targetId]) return
            pending[targetId] = true
            button.disabled = true; button.textContent = '提交中'
            api({ action: 'fanSupport', fanSessionToken: token, targetType: 'player', targetId: targetId, tournamentId: match.tournamentId, matchId: match.id, requestKey:supportKeys[targetId] || (supportKeys[targetId] = supportRequestKey()) }).then(function (reply) {
              if (!reply.success) throw new Error(reply.error || '应援失败')
              ++request
              var hadCounts = !!counts
              counts = counts || {}
              counts[targetId] = Number(reply.data && reply.data.supportCount || Number(counts[targetId] || 0) + 1)
              pending[targetId] = false
              delete supportKeys[targetId]
              match._fanSupportCache = { counts:counts, at:Date.now() }
              if (current()) paintRows()
              if (!hadCounts) loadCounts()
            }).catch(function (error) { pending[targetId] = false; if (current()) { paintRows(); window.alert(error.message || '应援失败') } })
          }
        })
    }
    function loadCounts() {
      var revision = ++request
      api({ action:'fanRankings', tournamentId:match.tournamentId, matchId:match.id, countsOnly:true }).then(function (result) {
        if (revision !== request) return
        if (!result.success) throw new Error(result.error || '应援数读取失败')
        counts = result.data.counts || {}
        match._fanSupportCache = { counts:counts, at:Date.now() }
        if (current()) paintRows()
      }).catch(function (error) { if (!current() || revision !== request) return; var body = document.getElementById('matchPlayerRankingBody'); var notice = document.createElement('div'); notice.className = 'match-ranking-state'; notice.innerHTML = escapeHtml(error.message || '应援数读取失败') + '<button type="button">重试</button>'; body.appendChild(notice); notice.querySelector('button').onclick = function () { notice.remove(); loadCounts() } })
    }
    Array.prototype.forEach.call(panel.querySelectorAll('[data-match-rank-side]'), function (button) { button.onclick = function () { activeSide = button.getAttribute('data-match-rank-side'); Array.prototype.forEach.call(panel.querySelectorAll('[data-match-rank-side]'), function (item) { item.classList.toggle('is-active', item === button); item.setAttribute('aria-pressed', item === button ? 'true' : 'false') }); document.getElementById('matchSupportTeamName').textContent = activeSide === 'home' ? match.homeName : match.awayName; paintRows() } })
    paintRows()
    if (!cached || Date.now() - cached.at > 15000) loadCounts()
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
      '<nav class="match-tabs"><button class="is-active" data-match-tab="score">赛况</button><button data-match-tab="statistics">数据</button><button data-match-tab="lineup">阵容</button><button data-match-tab="ranking">应援</button></nav><div id="matchTabBody">' + centre + '</div><section class="match-info"><b>比赛信息</b><p>' + escapeHtml(info) + '</p></section></section>'
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
        if (tab === 'ranking') { renderMatchPlayerRankings(match); return }
        panel.innerHTML = tab === 'lineup' ? matchLineupPanel(match) : tab === 'statistics' ? matchStatisticsPanel(match) : matchEventsPanel(match, goalsOnly)
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
      var podium = app.querySelector('.ranking-podium')
      if (podium) podium.hidden = type === 'player'
      bindSubPage()
      var searchInput = document.getElementById('publicRankingSearch')
      var rankingRows = null, supportKeys = {}
      function bindSupport() {
        Array.prototype.forEach.call(app.querySelectorAll('[data-rank-support]'), function (button) {
          button.onclick = function (event) {
            if (event) event.stopPropagation()
            var token = localStorage.getItem('sxf_fan_h5_session') || ''
            if (!token) { location.href = './me.html'; return }
            var targetId = button.getAttribute('data-rank-support')
            var targetType = button.getAttribute('data-rank-support-type')
            button.disabled = true
            api({ action:'fanSupport', fanSessionToken:token, targetType:targetType, targetId:targetId, tournamentId:scheduleTournamentId, period:period, requestKey:supportKeys[targetId] || (supportKeys[targetId] = supportRequestKey()) }).then(function (reply) {
              if (!reply.success) throw new Error(reply.error || '应援失败')
              var count = Number(reply.data && reply.data.supportCount)
              if (Number.isFinite(count)) {
                var target = (rankingRows || []).filter(function (row) { return row.targetId === targetId })[0]
                if (target) {
                  target.supportCount = count
                  var score = reply.data && reply.data.cardScore
                  if (score && score.scoreVersion === 'football-player-card-points/2') {
                    target.cardPoints = score.points; target.cardTier = score.tier; target.cardScoreVersion = score.scoreVersion
                    target.careerPoints = score.careerPoints; target.supportDrops = score.supportDrops; target.supportPoints = score.supportPoints
                  }
                }
                var item = button.closest('.fan-player-row, .public-ranking-row')
                var value = item && item.querySelector(targetType === 'player' ? '.fan-player-copy em' : 'em')
                if (value) value.textContent = targetType === 'player' ? '应援 ' + count + ' 滴' : String(count)
              }
              button.textContent = '已应援'
              delete supportKeys[targetId]
            }).catch(function (error) { button.disabled = false; window.alert(error.message || '应援失败') })
          }
        })
      }
      function openPlayerDetail(row, rank) {
        var previous = document.getElementById('fanPlayerDetail')
        if (previous) previous.remove()
        var career = row.careerMetrics || {}
        var scoreSyncError = Number.isFinite(row.cardPoints) && row.cardScoreVersion !== 'football-player-card-points/2'
        var ready = !scoreSyncError && row.cardScoreVersion === 'football-player-card-points/2' && ['bronze', 'silver', 'gold'].indexOf(String(row.cardTier || '')) >= 0 && Number.isFinite(row.cardPoints)
        var tier = ready ? row.cardTier : null
        var tierName = ready ? { bronze:'铜卡', silver:'银卡', gold:'金卡' }[tier] : scoreSyncError ? '统计暂不可用' : '等级待核定'
        var appearanceText = Number.isFinite(career.appearances) ? career.appearances + ' 场' : ready || scoreSyncError ? '统计暂不可用' : '待核定'
        var pointsText = ready ? row.cardPoints + ' 分' : scoreSyncError ? '统计暂不可用' : '待核定'
        var nextHint = !ready ? '' : row.cardPoints >= 100 ? '已达金卡' : row.cardPoints >= 45 ? '距金卡 ' + (100 - row.cardPoints) + ' 分' : '距银卡 ' + (45 - row.cardPoints) + ' 分'
        function field(label, value) { return '<div><dt>' + label + '</dt><dd>' + escapeHtml(value == null || value === '' ? '—' : String(value)) + '</dd></div>' }
        var physical = [row.height ? row.height + ' cm' : '', row.weight ? row.weight + ' kg' : ''].filter(Boolean).join(' / ') || '—'
        var info = field('球队', row.teamName) + field('球衣号码', row.number) + field('位置', row.position) + field('球衣名', row.jerseyName) + field('国籍', row.nationality) + field('出生日期', row.birthDate) + field('籍贯', row.nativePlace) + field('身高 / 体重', physical)
        var stats = field('参赛场次', career.appearances) + field('首发场次', career.starts) + field('出场分钟', career.minutesPlayed) + field('进球', career.goals) + field('助攻', career.assists) + field('比赛积分', row.careerPoints) + field('应援积分', row.supportPoints) + field('累计收到蜂蜜', row.supportDrops) + field('本期应援', row.supportCount)
        var name = escapeHtml((row.number ? row.number + '号 ' : '') + (row.name || '球员'))
        var position = { GK:'守门员', DF:'后卫', MF:'中场', FW:'前锋' }[row.position] || row.position || '未知'
        var shirtName = String(row.jerseyName || '')
        if (!shirtName) { var initials = { 郑:'ZHENG', 旭:'XU', 升:'SHENG', 李:'LI', 王:'WANG', 张:'ZHANG', 刘:'LIU', 陈:'CHEN', 杨:'YANG', 赵:'ZHAO', 黄:'HUANG', 周:'ZHOU', 吴:'WU', 徐:'XU', 孙:'SUN', 马:'MA', 朱:'ZHU', 胡:'HU', 郭:'GUO', 林:'LIN', 何:'HE', 高:'GAO', 罗:'LUO' }; var mapped = ''; Array.from(String(row.name || '')).forEach(function (char) { if (initials[char]) mapped += initials[char] + ' ' }); shirtName = mapped ? mapped.trim().substring(0, 10) + '.' : String(row.name || 'UNKNOWN').toUpperCase() }
        var flagMap = { 中国:'cn', CHN:'cn', 美国:'us', USA:'us', 日本:'jp', JPN:'jp', 韩国:'kr', KOR:'kr' }
        var flag = flagMap[String(row.nationality || '')] || ''
        var avatar = publicImage(row.avatarUrl), logo = publicImage(row.teamLogo)
        var avatarMarkup = avatar ? '<img class="player-photo" data-pc-photo src="' + escapeHtml(avatar) + '" alt="' + escapeHtml(row.name || '球员') + '"><span class="player-photo-empty" hidden>暂无形象照</span>' : '<span class="player-photo-empty">暂无形象照</span>'
        var flagMarkup = flag ? '<img src="https://flagcdn.com/w40/' + flag + '.png" class="flag-icon" alt="国旗">' : ''
        var logoMarkup = logo ? '<img src="' + escapeHtml(logo) + '" class="team-logo-small" alt="球队" data-pc-logo>' : ''
        var html = '<section class="fan-player-detail" id="fanPlayerDetail" role="dialog" aria-modal="true" aria-label="球员资料"><header><button type="button" data-player-detail-close="1" aria-label="返回球员榜">‹</button><strong>球员资料</strong></header><div class="fan-player-detail-content"><div class="fan-pc-card-host"><p class="fan-pc-card-state" role="status">正在读取球员卡…</p><button class="fan-pc-card-retry" type="button" data-pc-card-retry hidden>重新加载</button><div class="player-card-container" data-pc-card hidden><div class="player-card card-' + tier + '"><div class="card-bg"><img src="./assets/player-cards/' + tier + '-card.png" alt="卡面"></div><div class="player-photo-wrapper">' + avatarMarkup + '</div><div class="card-foreground" aria-hidden="true"><canvas data-pc-mask width="300" height="430"></canvas></div><div class="card-content"><div class="card-header-info"><div class="jersey-number-large">' + escapeHtml(row.number || '--') + '</div><div class="position-text">' + escapeHtml(position) + '</div></div><div class="player-info-section"><div class="player-name">' + escapeHtml(row.name || '未知球员') + '</div><div class="player-jersey-name">' + escapeHtml(shirtName) + '</div><div class="player-physical"><div class="physical-item"><span class="physical-label">身高:</span><span class="physical-value">' + escapeHtml(row.height || '--') + 'CM</span></div><div class="physical-item"><span class="physical-label">体重:</span><span class="physical-value">' + escapeHtml(row.weight || '--') + 'KG</span></div></div><div class="player-badges"><div class="badge-item">' + flagMarkup + '</div><div class="badge-item team-badge">' + logoMarkup + '</div></div></div></div></div><div class="card-level-indicator"><div class="level-badges"><span class="level-badge ' + (tier === 'bronze' ? 'active' : '') + '">铜卡</span><span class="level-arrow">→</span><span class="level-badge ' + (tier === 'silver' ? 'active' : '') + '">银卡</span><span class="level-arrow">→</span><span class="level-badge ' + (tier === 'gold' ? 'active' : '') + '">金卡</span></div><div class="match-count">参赛场次：<strong>' + appearanceText + '</strong> · 球员卡积分：<strong>' + pointsText + '</strong>' + (nextHint ? '<span class="next-level-hint">（' + nextHint + '）</span>' : '') + '</div></div></div></div><div class="fan-player-detail-head"><strong>' + name + '</strong><span>' + tierName + '</span></div><section class="fan-player-info"><h2>基本资料</h2><dl>' + info + '</dl></section><section class="fan-player-stats"><h2>比赛数据</h2><dl>' + stats + '</dl></section></div></section>'
        if (!ready) html = html.replace('./assets/player-cards/null-card.png', '')
        document.body.insertAdjacentHTML('beforeend', html)
        var detail = document.getElementById('fanPlayerDetail')
        var cardWrap = detail.querySelector('[data-pc-card]'), status = detail.querySelector('.fan-pc-card-state'), retry = detail.querySelector('[data-pc-card-retry]')
        function loadCard() {
          status.textContent = '正在读取球员卡…'; retry.hidden = true; cardWrap.hidden = true
          if (!ready) { status.textContent = scoreSyncError ? '统计暂不可用，请刷新' : '球员卡等级待核定'; return }
          var loadImage = function (src) { return new Promise(function (resolve, reject) { var image = new Image(); image.onload = function () { resolve(image) }; image.onerror = function () { reject(new Error('卡面素材读取失败')) }; image.src = src }) }
          Promise.all([loadImage('./assets/player-cards/' + tier + '-card.png'), loadImage('./assets/player-cards/layers/foreground-mask-source.png')]).then(function (images) {
            if (!detail.isConnected) return
            var canvas = detail.querySelector('[data-pc-mask]'), context = canvas.getContext('2d', { willReadFrequently:true })
            if (!context) throw new Error('卡面暂不可用')
            context.clearRect(0, 0, 300, 430); context.drawImage(images[0], 0, 0, 300, 430)
            var foreground = context.getImageData(0, 0, 300, 430); context.clearRect(0, 0, 300, 430); context.drawImage(images[1], 0, 0, 300, 430)
            var mask = context.getImageData(0, 0, 300, 430).data
            for (var i = 0; i < foreground.data.length; i += 4) { var luminance = (0.2126 * mask[i] + 0.7152 * mask[i + 1] + 0.0722 * mask[i + 2]) / 255; foreground.data[i + 3] = Math.round(foreground.data[i + 3] * (1 - luminance) * mask[i + 3] / 255) }
            context.clearRect(0, 0, 300, 430); context.putImageData(foreground, 0, 0)
            var photo = detail.querySelector('[data-pc-photo]'), placeholder = detail.querySelector('.player-photo-empty')
            if (photo) photo.onerror = function () { photo.hidden = true; if (placeholder) placeholder.hidden = false }
            var team = detail.querySelector('[data-pc-logo]'); if (team) team.onerror = function () { team.hidden = true }
            cardWrap.hidden = false; status.hidden = true
          }).catch(function () { if (!detail.isConnected) return; status.hidden = false; status.textContent = '球员卡暂时无法加载'; retry.hidden = false })
        }
        retry.onclick = loadCard; loadCard()
        var previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        function closeDetail() { detail.remove(); document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeydown) }
        function onKeydown(event) { if (event.key === 'Escape') closeDetail() }
        detail.querySelector('[data-player-detail-close]').onclick = closeDetail
        document.addEventListener('keydown', onKeydown)
      }
      function showRows() {
        if (!rankingRows) return
        var query = String(keyword || '').trim().toLowerCase()
        var rows = query ? rankingRows.filter(function (row) { return [row.name, row.number, row.teamName].join(' ').toLowerCase().indexOf(query) >= 0 }) : rankingRows
        var playerCards = '<div class="fan-player-list">' + rows.slice(0, 50).map(function (row, index) { return '<div class="fan-player-row"><button class="fan-player-open" data-player-detail="' + escapeHtml(row.targetId) + '" data-player-rank="' + (index + 1) + '" type="button"><b>' + (index + 1) + '</b>' + rankingPlayerAvatar(row.avatarUrl, row.name) + '<span class="fan-player-copy"><strong>' + escapeHtml((row.number ? row.number + '号 ' : '') + (row.name || '球员')) + '</strong><small>' + escapeHtml(row.teamName || '球队待公布') + '</small><em>应援 ' + escapeHtml(String(row.supportCount || 0)) + ' 滴</em></span></button><button class="fan-player-support" data-rank-support="' + escapeHtml(row.targetId) + '" data-rank-support-type="player" type="button">+1 滴蜂蜜</button></div>' }).join('') + '</div>'
        var teamRows = '<div class="public-ranking-list">' + rows.slice(0, 50).map(function (row, index) { return '<div class="public-ranking-row public-ranking-row--team"><b>' + (index + 1) + '</b><span class="public-ranking-team-logo">' + teamLogo(row.logo, row.name) + '</span><span class="public-ranking-copy"><strong>' + escapeHtml(row.name) + '</strong><small>' + escapeHtml(String(row.supportCount || 0) + ' 人应援') + '</small></span><em>' + escapeHtml(String(row.supportCount || 0)) + '</em><button data-rank-support="' + escapeHtml(row.targetId) + '" data-rank-support-type="team" type="button">+1 滴蜂蜜</button></div>' }).join('') + '</div>'
        var html = rows.length ? '<section class="public-ranking-card' + (type === 'player' ? ' public-ranking-card--players' : '') + '"><header><b>' + (type === 'player' ? '球员榜' : '球队榜') + '</b><span>' + periodLabel(period) + '</span></header>' + (type === 'player' ? playerCards : teamRows) + '</section>' : '<section class="ranking-empty"><strong>' + (query ? '未找到相关结果' : '暂无公开榜单') + '</strong></section>'
        document.getElementById('publicRankingBody').innerHTML = html
        bindSupport()
        Array.prototype.forEach.call(app.querySelectorAll('[data-player-detail]'), function (button) { button.onclick = function () { var targetId = button.getAttribute('data-player-detail'); var player = rows.filter(function (item) { return item.targetId === targetId })[0]; if (player) openPlayerDetail(player, Number(button.getAttribute('data-player-rank') || 0)) } })
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
    function symbol(icon) { return '<span class="bottom-tab-symbol"><img class="nav-idle" src="./assets/bottom-nav-v2/' + icon + '-idle.png" alt=""><img class="nav-active" src="./assets/bottom-nav-v2/' + icon + '-active.png" alt=""></span>' }
    function item(key, label, icon) { return '<button class="' + (active === key ? 'is-active' : '') + '" data-bottom="' + key + '" type="button"' + (active === key ? ' aria-current="page"' : '') + '>' + symbol(icon) + '<span class="bottom-tab-label">' + label + '</span></button>' }
    return '<nav class="bottom-tabs" aria-label="主导航">' + item('home', '首页', 'home') + item('matches', '比赛', 'matches') + item('events', '赛事', 'events') + item('rankings', '应援', 'support') + '<a class="' + (active === 'me' ? 'is-active' : '') + '" href="./me.html">' + symbol('me') + '<span class="bottom-tab-label">我的</span></a></nav>'
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
    var updateIds = new Set(updateList.map(function (item) { return String(item.id) }))
    var publishedNews = state.news.filter(function (item) { return updateIds.has(String(item.tournamentId)) })
    var updates = publishedNews.length ? publishedNews.slice(0, 6).map(function (item) {
      var coverId = item.coverFileId || (item.photoFileIds && item.photoFileIds[0]) || ''
      var cover = newsImage(coverId)
      var background = cover ? ' style="background-image:url(\'' + escapeHtml(cover) + '\')"' : ''
      return '<button class="news-row" data-news-id="' + escapeHtml(item.id) + '"><div class="news-image"' + background + '><span>' + (cover ? '' : mark(item.title)) + '</span></div><div><h2>' + escapeHtml(item.title || '') + '</h2><p>' + escapeHtml((item.kind === 'daily' ? '每日新闻' : '单场新闻') + ' · ' + formatNewsDate(item.publishedAt || item.date)) + '</p></div><i>›</i></button>'
    }).join('') : updateList.slice(0, 6).map(function (item) {
      var itemMatches = eventMatches(item)
      var label = itemMatches.some(function (match) { return match.status === 'ongoing' }) ? '正在进行' : itemMatches.some(function (match) { return match.status === 'finished' }) ? '赛果已更新' : '赛程已发布'
      return '<button class="news-row" data-event="' + escapeHtml(item.id) + '"><div class="news-image"' + coverStyle(item) + '><span>' + mark(item.name) + '</span></div><div><h2>' + escapeHtml(item.name + ' ' + label) + '</h2><p>' + escapeHtml(dateRange(item) + ' · ' + itemMatches.length + ' 场公开比赛') + '</p></div><i>›</i></button>'
    }).join('')
    app.innerHTML = '<nav class="category-tabs">' + tabs + '</nav>' +
      '<section class="event-hero"' + coverStyle(featured) + '><div class="hero-shade"></div><div class="hero-copy"><span>' + escapeHtml(eventStatus(publicEventStatus(featured))) + '</span><h1>' + escapeHtml(featured.name) + '</h1><p>' + escapeHtml(dateRange(featured) + (featured.city || featured.venue ? ' · ' + (featured.city || featured.venue) : '')) + '</p></div><button class="hero-detail" data-event="' + escapeHtml(featured.id) + '">赛事详情</button><div class="pager">' + list.slice(0, 4).map(function (item) { return '<button data-event="' + escapeHtml(item.id) + '" class="' + (item.id === featured.id ? 'is-active' : '') + '" aria-label="切换赛事"></button>' }).join('') + '</div></section>' +
      '<section class="portal-section match-schedule-section"><header><h2>近期赛程' + (scheduleTournamentId ? ' · 开封立洋杯' : '') + '</h2><button data-anchor="matches">全部比赛 ›</button></header><div class="match-strip">' + matchHtml + '</div></section>' +
      '<section class="portal-section news-section"><header><h2>赛事动态</h2><a href="./news.html">全部 ›</a></header><div class="news-list">' + updates + '</div></section>' +
      bottomTabs('home')
    bind()
  }
  function bind() {
    Array.prototype.forEach.call(app.querySelectorAll('[data-category]'), function (button) { button.onclick = function () { activeCategory = this.getAttribute('data-category'); activeEventId = ''; render() } })
    Array.prototype.forEach.call(app.querySelectorAll('[data-news-id]'), function (button) { button.onclick = function () { renderNewsDetail(state.news.filter(function (item) { return String(item.id) === String(button.getAttribute('data-news-id')) })[0]) } })
    Array.prototype.forEach.call(app.querySelectorAll('[data-event]'), function (button) { button.onclick = function () { activeEventId = this.getAttribute('data-event'); if (button.classList.contains('hero-detail') || button.classList.contains('news-row')) { location.hash = 'event-' + activeEventId; renderEventDetail(findTournament(activeEventId)) } else { window.scrollTo({ top: 0, behavior: 'smooth' }); render() } } })
    Array.prototype.forEach.call(app.querySelectorAll('[data-match]'), function (button) { button.onclick = function () { location.hash = 'match-' + this.getAttribute('data-match'); renderMatchPage(findMatch(this.getAttribute('data-match'))) } })
    Array.prototype.forEach.call(app.querySelectorAll('[data-anchor]'), function (button) { button.onclick = function () { var anchor = this.getAttribute('data-anchor'); if (anchor === 'events') { location.hash = 'events'; renderEventsPage(); return } if (anchor === 'rankings') { location.hash = 'rankings'; renderRankingsPage(); return } if (anchor === 'matches') { location.hash = 'matches'; renderMatchesPage(); return } var target = app.querySelector('.news-section'); if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' }) } })
    Array.prototype.forEach.call(app.querySelectorAll('[data-bottom]'), function (button) { button.onclick = function () { var target = this.getAttribute('data-bottom'); location.hash = target === 'events' ? 'events' : target === 'rankings' ? 'rankings' : target === 'matches' ? 'matches' : ''; target === 'events' ? renderEventsPage() : target === 'rankings' ? renderRankingsPage() : target === 'matches' ? renderMatchesPage() : render() } })
  }
  function load() {
    renderLoading()
    Promise.all([api({ action: 'publicTournamentCenter' }), api({ action: 'publicNews' }).catch(function () { return { success: false } })]).then(function (results) {
      var result = results[0]
      if (!result.success) throw new Error(result.error || '请稍后重试')
      state.tournaments = (result.data && result.data.tournaments) || []
      state.matches = (result.data && result.data.matches) || []
      state.news = results[1] && results[1].success && (results[1].articles || []).length ? results[1].articles : (result.data && result.data.news) || []
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
