(function () {
  'use strict'
  var API = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'
  var KEY = 'sxf_fan_h5_session', target = document.getElementById('cards')
  var query = new URLSearchParams(location.search), demo = ['127.0.0.1', 'localhost'].includes(location.hostname) && query.get('demo') === '1'
  var demoMode = query.get('participantMode') === 'adult' ? 'adult' : 'youth'
  var demoDrafts = {}, demoVersions = {}
  function html(value) { return String(value || '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] }) }
  function api(action, data) {
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ action: action, fanSessionToken: localStorage.getItem(KEY) || '' }, data || {})) }).then(function (r) { return r.json() }).then(function (r) {
      r = r && typeof r.body === 'string' ? JSON.parse(r.body) : r
      if (!r.success) { var error = new Error(r.error || '读取失败，请重试'); error.code = r.code; throw error }
      return r
    })
  }
  function error(message, retry) { target.className = 'state'; target.innerHTML = '<p>' + html(message) + '</p><button id="cardRetry" type="button">重新加载</button>'; document.getElementById('cardRetry').onclick = retry }
  function login() {
    target.textContent = '正在连接微信…'
    api('fanOAuthUrl', { returnUrl: location.origin + location.pathname }).then(function (r) { location.replace(r.authorizeUrl) }).catch(function (e) { error(e.message, login) })
  }
  function load() {
    target.className = 'state'; target.textContent = '正在读取球员卡…'
    var request = demo ? Promise.resolve({ players: [
      { id: 'demo-bronze', name: '示例球员', teamName: demoMode === 'adult' ? '成年示例队' : '青训示例队', jerseyNumber: '10', jerseyName:'SAMPLE', position: 'FW', height:demoMode === 'adult' ? 178 : 142, weight:demoMode === 'adult' ? 72 : 36, nationality:'中国', appearances: 0, cardTier: 'bronze' }
    ].map(function (p) { return Object.assign(p, { version: demoVersions[p.id] || 0, cardUrl: demoDrafts[p.id] && demoDrafts[p.id].cardData || '' }) }) }) : api('listMyPlayerCards')
    request.then(function (r) {
      if (!r.players.length) { target.innerHTML = '<p>暂无已绑定的球员，请先完成球员登记。</p><a href="./me.html">返回我的</a>'; return }
      target.className = 'cards'
      target.innerHTML = r.players.map(function (p) { var level = { bronze:'铜卡', silver:'银卡', gold:'金卡' }[p.cardTier] || '等级待核定'; var score = p.playerCard && p.playerCard.status === 'ready' ? ' · ' + p.playerCard.points + ' 分' : ''; return '<article class="card">' + (p.cardUrl ? '<img src="' + html(p.cardUrl) + '" alt="' + html(p.name) + '的球员卡">' : (p.cardTier ? '<div class="card-empty"><img src="./assets/player-cards/' + p.cardTier + '-card.png" alt=""><span>待制作</span></div>' : '<div class="card-empty">等级待核定</div>')) + '<h2>' + html(p.name) + '</h2><p>' + html(level) + score + (p.teamName ? ' · ' + html(p.teamName) : '') + '</p><button type="button" data-player="' + html(p.id) + '">' + (p.cardUrl ? '编辑球员卡' : '制作球员卡') + '</button></article>' }).join('')
      Array.prototype.forEach.call(target.querySelectorAll('[data-player]'), function (button) {
        button.onclick = function () {
          button.disabled = true
          var playerId = button.getAttribute('data-player')
          var pending = demo ? Promise.resolve({ player: r.players.find(function (p) { return p.id === playerId }), standardPortraitData:demoMode === 'adult' ? './assets/player-card-demo-adult-v1.png' : './assets/player-card-demo-portrait-v1.png', draft: demoDrafts[playerId] || null }) : api('getMyPlayerCard', { playerId: playerId })
          pending.then(function (detail) {
            var position = { GK: '守门员', DF: '后卫', MF: '中场', FW: '前锋' }; detail.player.positionLabel = position[detail.player.position] || detail.player.position
            window.SxfPlayerCardEditor.open({ player: detail.player, draft: detail.draft, portraitSrc: detail.standardPortraitData, teamLogoData: detail.teamLogoData, initialCrop: demo ? (demoMode === 'adult' ? {zoom:1,x:0,y:0} : { zoom:1.5, x:0, y:.25 }) : null, onSave: function (draft) {
              return (demo ? Promise.resolve().then(function () { demoDrafts[playerId] = draft; demoVersions[playerId] = (demoVersions[playerId] || 0) + 1 }) : api('saveMyPlayerCard', Object.assign({ playerId: playerId, expectedVersion: detail.player.version }, draft))).then(function () { load() })
            } })
          }).catch(function (e) { error(e.message, load) }).finally(function () { button.disabled = false })
        }
      })
    }).catch(function (e) { if (e.code === 'PLAYER_CARD_AUTH_REQUIRED') { localStorage.removeItem(KEY); login() } else error(e.message, load) })
  }
  if (demo) load()
  else if (query.get('code') && query.get('state')) api('fanOAuth', { code: query.get('code'), state: query.get('state') }).then(function (r) { localStorage.setItem(KEY, r.fanSessionToken); history.replaceState({}, '', location.pathname); load() }).catch(function (e) { error(e.message, login) })
  else if (localStorage.getItem(KEY)) load()
  else login()
})()
