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
      target.className = 'player-libraries'
      target.innerHTML = r.players.map(function (p) {
        var ready = p.playerCard && p.playerCard.status === 'ready', progress = p.playerCard && p.playerCard.progress
        var level = ready ? ({bronze:'铜卡',silver:'银卡',gold:'金卡'}[p.playerCard.tier] || '等级待核定') : '等级待核定', score = ready ? ' · ' + p.playerCard.points + ' 分' : ''
        var progressText = !p.playerCard ? '等级统计接口待接入' : ready && !progress ? '升级进度接口待接入' : '生涯比赛记录待核定'
        if (p.playerCard && (p.playerCard.reasonCodes || []).some(function(code){return code.indexOf('MATCH_DURATION_') === 0})) progressText = '比赛时长来源待核对，升级进度待核定'
        if (ready && progress) progressText = progress.nextAt == null ? '已达金卡' : '距下一级 ' + progress.pointsToNext + ' 分'
        var progressHtml = ready && progress ? '<progress max="100" value="' + html(String(progress.percent)) + '" aria-label="升级进度"></progress>' : ''
        var base = '<article class="card">' + (p.cardUrl ? '<img src="' + html(p.cardUrl) + '" alt="' + html(p.name) + '的基础卡">' : p.portraitUrl ? '<div class="player-photo"><img src="'+html(p.portraitUrl)+'" alt="球员照片"></div>' : '<div class="card-empty"><span>资料待补充</span></div>') + '<h3>基础卡</h3><p>' + html(level) + '</p><button type="button" data-player="' + html(p.id) + '">' + (p.cardUrl ? '编辑基础卡' : '制作基础卡') + '</button>' + (p.cardUrl ? '<button type="button" class="card-select" data-select-player="' + html(p.id) + '" data-template="" ' + (!p.displayTemplateId ? 'disabled' : '') + '>' + (!p.displayTemplateId ? '当前展示' : '设为展示') + '</button>' : '') + '</article>'
        var added = (p.preloadedCards || []).map(function (card) {
          var source = {platform:'全平台',team:'球队',tournament:'赛事',player:'球员'}[card.preload.type] || ''
          source += card.preload.targetName ? ' · ' + card.preload.targetName : ''
          var image = card.cardUrl ? '<img src="' + html(card.cardUrl) + '" alt="' + html(card.title) + '">' : '<div class="card-empty">' + (card.backgroundUrl ? '<img src="' + html(card.backgroundUrl) + '" alt="">' : '') + '<span>' + html(card.status === 'locked' ? '暂未解锁' : card.status === 'load_failed' ? '读取失败' : card.status === 'pending' ? '待更新' : '待制作') + '</span></div>'
          var selected = p.displayTemplateId === card.templateId
          return '<article class="card">' + image + '<h3>' + html(card.title) + '</h3><p class="card-source">' + html(source) + '</p>' + (card.reason ? '<p>' + html(card.reason) + '</p>' : '') + '<button type="button" ' + (card.status === 'load_failed' ? 'data-library-retry="' : 'data-library-player="') + html(p.id) + '" data-template="' + html(card.templateId) + '" ' + (card.status === 'locked' ? 'disabled' : '') + '>' + (card.status === 'load_failed' ? '重新加载' : card.status === 'ready' ? '编辑此卡' : '制作此卡') + '</button>' + (card.status === 'ready' ? '<button type="button" class="card-select" data-select-player="' + html(p.id) + '" data-template="' + html(card.templateId) + '" ' + (selected ? 'disabled' : '') + '>' + (selected ? '当前展示' : '设为展示') + '</button>' : '') + '</article>'
        }).join('')
        return '<section class="player-library"><h2>' + html(p.name) + '</h2><p class="player-summary">' + html(level) + score + (p.teamName ? ' · ' + html(p.teamName) : '') + '</p><p>' + html(progressText) + '</p>' + progressHtml + '<button type="button" data-grade-refresh>刷新等级</button>' + (p.displayState === 'unavailable' ? '<p class="library-error">展示卡暂不可用，请重新选择</p>' : '') + '<div class="library-grid">' + base + added + '</div></section>'
      }).join('')
      Array.prototype.forEach.call(target.querySelectorAll('[data-grade-refresh]'), function (button) { button.onclick = load })
      Array.prototype.forEach.call(target.querySelectorAll('[data-library-retry]'), function (button) { button.onclick = load })
      Array.prototype.forEach.call(target.querySelectorAll('.card img'), function (image) { image.onerror = function () {
        var card = image.closest('.card'); if (!card || card.querySelector('.image-retry')) return
        var button = document.createElement('button'); button.type = 'button'; button.className = 'card-select image-retry'; button.textContent = '重新加载'; button.onclick = load; card.appendChild(button)
      } })
      Array.prototype.forEach.call(target.querySelectorAll('[data-library-player]'), function (button) {
        button.onclick = function () {
          button.disabled = true
          api('getMyPreloadedPlayerCard', {playerId:button.getAttribute('data-library-player'),templateId:button.getAttribute('data-template')}).then(function (detail) {
            window.SxfPlayerCardLibraryEditor.open({detail:detail,api:api,onSaved:load})
          }).catch(function (e) { error(e.message,load) }).finally(function () {button.disabled = false})
        }
      })
      Array.prototype.forEach.call(target.querySelectorAll('[data-select-player]'), function (button) {
        button.onclick = function () {
          button.disabled = true
          api('selectMyPlayerCard', {playerId:button.getAttribute('data-select-player'),templateId:button.getAttribute('data-template')}).then(load).catch(function (e) {error(e.message,load)}).finally(function () {button.disabled = false})
        }
      })
      Array.prototype.forEach.call(target.querySelectorAll('[data-player]'), function (button) {
        button.onclick = function () {
          button.disabled = true
          var playerId = button.getAttribute('data-player')
          var pending = demo ? Promise.resolve({ player: r.players.find(function (p) { return p.id === playerId }), standardPortraitData:demoMode === 'adult' ? './assets/player-card-demo-adult-v1.png' : './assets/player-card-demo-portrait-v1.png', draft: demoDrafts[playerId] || null }) : api('getMyPlayerCard', { playerId: playerId })
          pending.then(function (detail) {
            var position = { GK: '守门员', DF: '后卫', MF: '中场', FW: '前锋' }; detail.player.positionLabel = position[detail.player.position] || detail.player.position
            window.SxfPlayerCardEditor.open({ player: detail.player, templates:detail.templates, draft: detail.draft, onPreview:function(draft){return api('previewMyPlayerCard',Object.assign({playerId:playerId,portraitId:detail.portraitId,expectedVersion:detail.player.version},draft))}, onClose:load, portraitSrc: detail.standardPortraitData, teamLogoData: detail.teamLogoData, initialCrop: demo ? (demoMode === 'adult' ? {zoom:1,x:0,y:0} : { zoom:1.5, x:0, y:.25 }) : null, onSave: function (draft) {
              return (demo ? Promise.resolve().then(function () { demoDrafts[playerId] = draft; demoVersions[playerId] = (demoVersions[playerId] || 0) + 1 }) : api('saveMyPlayerCard', Object.assign({ playerId: playerId,portraitId:detail.portraitId, expectedVersion: detail.player.version }, draft))).then(function () { load() })
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
