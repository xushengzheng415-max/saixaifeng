(function () {
  'use strict'

  var API_URL = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'
  var SESSION_KEY = 'sxf_referee_h5_session'
  var app = document.getElementById('app')

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

  function loading(text) {
    app.innerHTML = '<section class="loading-card"><i></i><strong>' + escapeHtml(text || '正在读取我的数据…') + '</strong><span>只读取当前微信已安全绑定的业务关系</span></section>'
  }

  function showError(message, retry) {
    app.innerHTML = '<section class="state-card"><strong>暂时无法读取我的数据</strong><p>' + escapeHtml(message || '请稍后重试') + '</p><button id="retryButton">重新加载</button></section>'
    document.getElementById('retryButton').onclick = retry
  }

  function beginOAuth() {
    loading('正在连接微信服务号…')
    api({ action: 'servicePrivateOAuthUrl' }).then(function (result) {
      if (!result.success || !result.authorizeUrl) throw new Error(result.error || '服务号授权入口暂不可用')
      location.replace(result.authorizeUrl)
    }).catch(function (error) { showError(error.message, beginOAuth) })
  }

  function completeOAuth(code, state) {
    loading('正在确认微信身份…')
    api({ action: 'servicePrivateOAuth', code: code, state: state }).then(function (result) {
      if (!result.success || !result.refereeSessionToken) throw new Error(result.error || '微信授权失败')
      localStorage.setItem(SESSION_KEY, result.refereeSessionToken)
      history.replaceState({}, document.title, location.pathname)
      loadOverview()
    }).catch(function (error) {
      localStorage.removeItem(SESSION_KEY)
      showError(error.message, beginOAuth)
    })
  }

  function roleLabel(value) {
    return ({ guardian: '家长', referee: '裁判', team: '球队', organizer: '主办方' })[value] || value
  }

  function statusLabel(value) {
    return ({ draft: '草稿', registering: '报名中', published: '已发布', ongoing: '进行中', upcoming: '待开始', finished: '已结束', completed: '已结束', ended: '已结束' })[value] || '进行中'
  }

  function mark(value, fallback) {
    return escapeHtml(String(value || fallback || '赛').trim().slice(0, 1))
  }

  function imageOrMark(url, name, className) {
    return url
      ? '<img class="' + className + '" src="' + escapeHtml(url) + '" alt="' + escapeHtml(name) + '" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="' + className + ' mark" hidden>' + mark(name) + '</span>'
      : '<span class="' + className + ' mark">' + mark(name) + '</span>'
  }

  function renderBinding() {
    app.innerHTML = '<section class="hero"><span>赛小蜂足球 · 私有数据</span><h1>尚未建立安全绑定</h1><p>“我的”不会在这里新建或合并账号。请先从真实业务入口完成手机号主账号绑定。</p></section>' +
      '<section class="service-list"><article class="service-card"><div><span class="kicker">家长与球队</span><h2>从专属邀请或小程序进入</h2><p>家长从球队发送的孩子资料邀请进入；球队负责人和主办方先在赛小蜂足球小程序完成微信手机号登录。</p></div></article>' +
      '<article class="service-card"><div><span class="kicker">裁判</span><h2>从裁判任务完成核验</h2><p>已有比赛指派的裁判可在裁判任务中验证主办方登记的手机号。</p></div><footer><small>需要真实裁判任务</small><a href="./?entry=workbench">裁判任务</a></footer></article>' +
      '<article class="service-card"><div><span class="kicker">公共数据</span><h2>无需登录查看赛事</h2><p>公开赛事、已发布赛程和已审核赛果不需要绑定账号。</p></div><footer><small>公开访问</small><a href="../admin/#/portal/home">赛事中心</a></footer></article></section>'
  }

  function entityCard(item, type) {
    var name = item.name || (type === 'child' ? '孩子' : type === 'team' ? '球队' : '赛事')
    var extra = type === 'child'
      ? (item.teamName || '球队待关联') + (item.jerseyNumber ? ' · ' + item.jerseyNumber + '号' : '')
      : type === 'team'
        ? String(item.playerCount || 0) + ' 名球员'
        : statusLabel(item.status) + ' · ' + String(item.matchCount || 0) + ' 场比赛'
    return '<article class="entity-card">' + imageOrMark(item.avatar || item.logo, name, 'entity-logo') + '<div><strong>' + escapeHtml(name) + '</strong><span>' + escapeHtml(extra) + '</span></div></article>'
  }

  function matchCard(item) {
    var score = item.status === 'upcoming' ? 'VS' : String(item.homeScore == null ? '-' : item.homeScore) + ' : ' + String(item.awayScore == null ? '-' : item.awayScore)
    return '<article class="private-match"><header><span>' + escapeHtml(item.tournamentName || '赛事') + '</span><b>' + escapeHtml(statusLabel(item.status)) + '</b></header><div><strong>' + escapeHtml(item.homeName) + '</strong><i>' + escapeHtml(score) + '</i><strong>' + escapeHtml(item.awayName) + '</strong></div><footer>' + escapeHtml([item.matchDate, item.matchTime, item.venue].filter(Boolean).join(' · ') || '比赛信息待完善') + '</footer></article>'
  }

  function section(title, count, html) {
    if (!html) return ''
    return '<section class="private-section"><header><h2>' + escapeHtml(title) + '</h2><span>' + count + '</span></header><div class="entity-list">' + html + '</div></section>'
  }

  function renderOverview(data) {
    data = data || {}
    var roles = (data.roles || []).map(roleLabel)
    var childHtml = (data.children || []).map(function (item) { return entityCard(item, 'child') }).join('')
    var teamHtml = (data.teams || []).map(function (item) { return entityCard(item, 'team') }).join('')
    var tournamentHtml = (data.tournaments || []).map(function (item) { return entityCard(item, 'tournament') }).join('')
    var refereeHtml = data.referee ? '<article class="referee-summary"><span>' + mark(data.referee.name, '裁') + '</span><div><strong>' + escapeHtml(data.referee.name) + '</strong><small>' + escapeHtml(data.referee.level || '裁判等级待完善') + ' · ' + Number(data.referee.matchCount || 0) + ' 场执裁</small></div><a href="./?entry=workbench">进入任务</a></article>' : ''
    var matchesHtml = (data.matches || []).map(matchCard).join('')
    app.innerHTML = '<section class="private-hero"><span>赛小蜂足球 · 私有数据</span><h1>我的数据</h1><p>' + escapeHtml(data.phoneMasked || '') + '</p><div>' + (roles.length ? roles.map(function (role) { return '<b>' + escapeHtml(role) + '</b>' }).join('') : '<b>暂无业务关系</b>') + '</div></section>' +
      (refereeHtml ? '<section class="private-section"><header><h2>我的执裁</h2><span>工作入口</span></header>' + refereeHtml + '</section>' : '') +
      section('我的孩子', (data.children || []).length, childHtml) +
      section('我的球队', (data.teams || []).length, teamHtml) +
      section('我的赛事', (data.tournaments || []).length, tournamentHtml) +
      section('相关比赛', (data.matches || []).length, matchesHtml) +
      (!roles.length ? '<section class="state-card compact"><strong>暂无可查看的私有数据</strong><p>新的业务关系建立后会自动出现在这里。</p></section>' : '') +
      '<section class="boundary"><strong>数据与操作分开</strong><p>这里用于查看个人有权访问的数据。球队管理、赛事配置和审批仍在小程序或 PC 完成。</p></section>'
  }

  function loadOverview() {
    loading('正在读取我的数据…')
    api({ action: 'servicePrivateOverview', serviceSessionToken: localStorage.getItem(SESSION_KEY) || '' }).then(function (result) {
      if (!result.success) {
        if (result.code === 'SERVICE_PRIVATE_AUTH_REQUIRED') {
          localStorage.removeItem(SESSION_KEY)
          return beginOAuth()
        }
        throw new Error(result.error || '私有数据读取失败')
      }
      if (result.needsBinding) return renderBinding()
      renderOverview(result.data)
    }).catch(function (error) { showError(error.message, loadOverview) })
  }

  var query = new URLSearchParams(location.search)
  var visualQa = location.hostname === '127.0.0.1' && query.get('visualQa') === '1'
  if (visualQa) renderOverview({
    phoneMasked: '138****5678',
    roles: ['guardian', 'referee', 'team', 'organizer'],
    children: [{ id: 'qa-child', name: '小蜂', teamName: '郑州青训U10', jerseyNumber: '10', position: '前锋', avatar: '' }],
    teams: [{ id: 'qa-team', name: '郑州青训U10', playerCount: 18, logo: '' }],
    tournaments: [{ id: 'qa-tournament', name: '青少年足球邀请赛', status: 'registering', startDate: '2026-10-02', matchCount: 12, logo: '' }],
    referee: { id: 'qa-referee', name: '张裁判', level: '一级', matchCount: 8 },
    matches: [
      { id: 'qa-match-1', tournamentName: '青少年足球邀请赛', homeName: '郑州青训U10', awayName: '洛阳少年U10', status: 'upcoming', matchDate: '2026-10-03', matchTime: '09:30', venue: '1号场' },
      { id: 'qa-match-2', tournamentName: '城市足球联赛', homeName: '金水少年队', awayName: '高新少年队', status: 'finished', homeScore: 2, awayScore: 1, matchDate: '2026-08-30', matchTime: '15:00', venue: '中心球场' }
    ]
  })
  else if (query.get('code') && query.get('state')) completeOAuth(query.get('code'), query.get('state'))
  else if (localStorage.getItem(SESSION_KEY)) loadOverview()
  else beginOAuth()
})()
