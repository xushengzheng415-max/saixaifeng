(function () {
  'use strict'
  var API = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'
  var tournament = document.getElementById('tournament'), division = document.getElementById('division'), status = document.getElementById('status'), output = document.getElementById('result'), button = document.getElementById('query'), requestGeneration = 0
  function api(data) { return fetch(API,{ method:'POST',headers:{ 'Content-Type':'application/json' },body:JSON.stringify(data) }).then(function (reply) { if (!reply.ok) throw new Error('服务暂不可用，请重试'); return reply.json() }).then(function (reply) { var result = reply && typeof reply.body === 'string' ? JSON.parse(reply.body) : reply; if (!result.success) throw new Error(result.error || result.message || '数据加载失败，请重试'); return result }) }
  function escape(value) { return String(value == null ? '' : value).replace(/[&<>"']/g,function (char) { return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char] }) }
  function metric(value) { return typeof value === 'number' && Number.isFinite(value) ? value : '—' }
  function table(headers,rows) { return '<div class="table-wrap"><table><thead><tr>' + headers.map(function (label) { return '<th>' + escape(label) + '</th>' }).join('') + '</tr></thead><tbody>' + (rows.length ? rows.map(function (row) { return '<tr>' + row.map(function (cell) { return '<td>' + escape(cell) + '</td>' }).join('') + '</tr>' }).join('') : '<tr><td colspan="' + headers.length + '">暂无已审核记录</td></tr>') + '</tbody></table></div>' }
  tournament.onchange = function () { ++requestGeneration; button.disabled = false; division.innerHTML = '<option value="">全部组别</option>'; output.innerHTML = ''; status.textContent = '仅统计已公开比赛的正式结果。' }
  document.getElementById('filters').onsubmit = function (event) {
    event.preventDefault(); if (!tournament.value) return
    var generation = ++requestGeneration
    button.disabled = true; output.innerHTML = ''; status.className = ''; status.textContent = '正在统计…'
    api({ action:'publicDataCenter', tournamentId:tournament.value, divisionId:division.value }).then(function (reply) {
      if (generation !== requestGeneration) return
      var teams = {}; reply.teams.forEach(function (row) { teams[row.teamId] = row.teamName })
      if (!division.value) { var ids = Array.from(new Set(reply.teams.map(function (row) { return row.divisionId }))); division.innerHTML = '<option value="">全部组别</option>' + ids.map(function (id) { return '<option value="' + escape(id) + '">' + escape(id) + '</option>' }).join('') }
      status.textContent = reply.coverage.status === 'complete' ? '记录完整' : '部分比赛记录不完整；“—”表示数值无法确认。'
      output.innerHTML = '<div class="meta"><span>正式结果 · 已公开比赛</span><span>记录覆盖 ' + reply.coverage.coveredMatches + '/' + reply.coverage.expectedMatches + ' 场</span></div><h2>球队成绩</h2>' + table(['球队','组别','场次','胜','平','负','进球','失球'],reply.teams.map(function (row) { return [row.teamName,row.divisionId,row.played,metric(row.wins),metric(row.draws),metric(row.losses),metric(row.goalsFor),metric(row.goalsAgainst)] })) + '<h2>球员表现</h2>' + table(['球员','当时球队','出场','进球','助攻','黄牌','红牌'],reply.players.map(function (row) { return [row.playerName,teams[row.teamId] || row.teamId,metric(row.metrics.appearances),metric(row.metrics.goals),metric(row.metrics.assists),metric(row.metrics.yellowCards),metric(row.metrics.redCards)] })) + '<p class="version">数据版本：' + escape(reply.dataVersion) + ' · 指标版本：' + escape(reply.metricVersion) + '</p>'
    }).catch(function (error) { if (generation === requestGeneration) { status.className = 'error'; status.textContent = error.message } }).finally(function () { if (generation === requestGeneration) button.disabled = false })
  }
  api({ action:'publicTournamentCenter' }).then(function (reply) {
    var catalog = reply.tournaments || reply.data && reply.data.tournaments || []
    tournament.innerHTML += catalog.map(function (item) { return '<option value="' + escape(item.id || item._id) + '">' + escape(item.name) + '</option>' }).join('')
    var requested = new URLSearchParams(location.search).get('tournamentId'); if (catalog.some(function (item) { return String(item.id || item._id) === requested })) tournament.value = requested
    status.textContent = catalog.length ? '选择赛事后查询。' : '暂无公开赛事。'
  }).catch(function (error) { status.className = 'error'; status.textContent = error.message })
})()
