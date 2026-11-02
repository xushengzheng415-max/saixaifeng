(function () {
  'use strict'
  var API = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'
  var KEY = 'sxf_fan_h5_session', target = document.getElementById('cards')
  var query = new URLSearchParams(location.search), demo = ['127.0.0.1', 'localhost'].includes(location.hostname) && query.get('demo') === '1'
  var demoMode = query.get('participantMode') === 'adult' ? 'adult' : 'youth'
  var demoDrafts = {}, demoVersions = {}
  var selectedPlayerId = ''
  var LEVEL_NAMES = { bronze: '铜卡', silver: '银卡', gold: '金卡' }
  function html(value) { return String(value || '').replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] }) }
  function api(action, data) {
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ action: action, fanSessionToken: localStorage.getItem(KEY) || '' }, data || {})) }).then(function (r) { return r.json() }).then(function (r) {
      r = r && typeof r.body === 'string' ? JSON.parse(r.body) : r
      if (!r.success) { var error = new Error(r.error || '读取失败，请重试'); error.code = r.code; error.photoReplaceCost = r.photoReplaceCost; throw error }
      return r
    })
  }
  function error(message, retry) { target.className = 'state'; target.innerHTML = '<p>' + html(message) + '</p><button id="cardRetry" type="button">重新加载</button>'; document.getElementById('cardRetry').onclick = retry }
  function login() {
    if (!/MicroMessenger/i.test(navigator.userAgent)) {
      target.className = 'state'
      target.innerHTML = '<p>请在微信中打开此链接，登录后查看球员卡。</p>'
      return
    }
    target.textContent = '正在连接微信…'
    api('fanOAuthUrl', { returnUrl: location.origin + location.pathname }).then(function (r) { location.replace(r.authorizeUrl) }).catch(function (e) { error(e.message, login) })
  }
  function levelInfo(p) {
    var ready = p.playerCard && p.playerCard.status === 'ready', progress = p.playerCard && p.playerCard.progress
    var level = ready ? (LEVEL_NAMES[p.playerCard.tier] || '等级待核定') : '等级待核定'
    var progressText = !p.playerCard ? '等级统计接口待接入' : ready && !progress ? '升级进度接口待接入' : '生涯比赛记录待核定'
    if (p.playerCard && (p.playerCard.reasonCodes || []).some(function (code) { return code.indexOf('MATCH_DURATION_') === 0 })) progressText = '比赛时长来源待核对，升级进度待核定'
    if (ready && progress) progressText = progress.nextAt == null ? '已达金卡' : '距下一级 ' + progress.pointsToNext + ' 分'
    return { ready: ready, progress: progress, level: level, tier: ready ? String(p.playerCard.tier || '') : '', score: ready ? p.playerCard.points : null, progressText: progressText }
  }
  function currentCard(p) {
    if (p.displayTemplateId) {
      var card = (p.preloadedCards || []).filter(function (c) { return c.templateId === p.displayTemplateId })[0]
      if (card) return { title: card.title, url: card.cardUrl || '', templateId: card.templateId, kind: 'preload' }
    }
    return { title: '基础卡', url: p.cardUrl || '', templateId: '', kind: 'base' }
  }
  function mainCardHtml(p) {
    var current = currentCard(p), body
    if (current.url) body = '<img class="pc-main-img" src="' + html(current.url) + '" alt="' + html(p.name) + '的' + html(current.title) + '" data-main-img>'
    else if (current.kind === 'base' && p.portraitUrl) body = '<div class="pc-main-img pc-main-photo"><img src="' + html(p.portraitUrl) + '" alt="球员照片"></div>'
    else body = '<div class="pc-main-img pc-main-empty"><span>' + (current.kind === 'base' ? '资料待补充' : '卡片待更新') + '</span></div>'
    var warn = p.displayState === 'unavailable' ? '<p class="pc-warn">当前展示卡暂不可用，请在卡库重新选择</p>' : ''
    return '<section class="pc-main">' + body + '<h2 class="pc-main-title">' + html(current.title) + '</h2>' + warn +
      '<p class="pc-member-tip">开通会员可不达 100 分更换卡面背景；未满 100 分换照片每次 100 滴蜂蜜 · <a href="./me.html">去开通</a></p>' +
      '<div class="pc-main-actions"><button type="button" class="pc-btn pc-btn-primary" data-edit-current="' + html(p.id) + '" data-kind="' + current.kind + '" data-template="' + html(current.templateId) + '">' + (current.url ? '编辑此卡' : '制作此卡') + '</button></div></section>'
  }
  function pointsHtml(p, info) {
    var scorePart = info.score == null ? '' : '<span class="pc-points-score">' + info.score + '<small>分</small></span>'
    var percent = info.ready && info.progress ? Math.max(0, Math.min(100, Number(info.progress.percent) || 0)) : null
    var bar = percent == null ? '' : '<span class="pc-progress"><span class="pc-progress-fill" style="width:' + percent + '%"></span></span>'
    return '<section class="pc-points"><div class="pc-points-row"><span class="pc-tier pc-tier-' + html(info.tier || 'none') + '">' + html(info.level) + '</span>' + scorePart + '</div>' + bar +
      '<p class="pc-points-text">' + html(info.progressText) + '</p><div class="pc-points-actions"><button type="button" class="pc-btn pc-btn-ghost" data-points-player="' + html(p.id) + '" data-points-name="' + html(p.name) + '">积分明细</button><button type="button" class="pc-btn pc-btn-ghost" data-grade-refresh>刷新等级</button></div></section>'
  }
  function libraryItemInner(image, statusText, dimmed) {
    if (image && !statusText) return image
    if (image) return image.replace('class="', 'class="is-dimmed ') + '<span class="lib-overlay">' + html(statusText) + '</span>'
    return '<span class="lib-placeholder">' + html(statusText) + '</span>'
  }
  var TIER_LABELS = { bronze: '铜卡', silver: '银卡', gold: '金卡' }
  function groupLabel(cards) {
    var scope = cards[0].preload || {}
    if (scope.targetName) return String(scope.targetName)
    return scope.type === 'team' ? '球队卡组' : scope.type === 'player' ? '球员专属卡' : scope.type === 'tournament' ? '赛事卡组' : '平台卡组'
  }
  function cardKindLabel(kind) { return kind === 'progression' ? '进阶卡组' : kind === 'honor' ? '荣誉卡组' : '外观卡组' }
  function libraryTile(card, selected, playerId) {
    var statusText = '', action = ''
    if (card.status === 'load_failed') statusText = '读取失败'
    else if (card.status === 'pending') statusText = '待更新'
    else if (card.status !== 'ready') statusText = '待制作'
    if (!selected) {
      if (card.status === 'ready') action = 'data-lib-action="select"'
      else if (card.status === 'load_failed') action = 'data-lib-action="retry"'
      else action = 'data-lib-action="edit"'
    }
    var image = card.cardUrl ? '<img src="' + html(card.cardUrl) + '" alt="' + html(card.title) + '" class="lib-img">' : card.backgroundUrl ? '<img src="' + html(card.backgroundUrl) + '" alt="" class="lib-img">' : ''
    var state = selected ? '' : statusText ? '<span class="lib-state">' + html(statusText) + '</span>' : action ? '<span class="lib-state is-action">点击展示</span>' : ''
    var remove = '<button type="button" class="lib-del" data-lib-delete data-player="' + html(playerId) + '" data-template="' + html(card.templateId) + '" aria-label="移除此卡">移除</button>'
    return '<div class="lib-item' + (selected ? ' is-current' : '') + '" ' + action + ' data-player="' + html(playerId) + '" data-template="' + html(card.templateId) + '">' +
      '<div class="lib-thumb">' + libraryItemInner(image, statusText, true) + (selected ? '<span class="lib-check">展示中</span>' : '') + '</div>' +
      '<div class="lib-foot"><span class="lib-name">' + html(card.title) + '</span></div><div class="lib-meta">' + state + remove + '</div></div>'
  }
  function libraryHtml(p) {
    var baseSelected = !p.displayTemplateId
    var baseImage = p.cardUrl ? '<img src="' + html(p.cardUrl) + '" alt="基础卡" class="lib-img">' : p.portraitUrl ? '<img src="' + html(p.portraitUrl) + '" alt="球员照片" class="lib-img">' : ''
    var baseAction = baseSelected ? '' : p.cardUrl ? 'data-lib-action="select" data-template=""' : 'data-lib-action="edit-base"'
    var baseState = baseSelected ? '' : '<span class="lib-state is-action">' + (p.cardUrl ? '点击展示' : '去制作') + '</span>'
    var baseTile = '<div class="lib-item' + (baseSelected ? ' is-current' : '') + '" ' + baseAction + ' data-player="' + html(p.id) + '">' +
      '<div class="lib-thumb">' + libraryItemInner(baseImage, baseImage ? '' : '待制作') + (baseSelected ? '<span class="lib-check">展示中</span>' : '') + '</div>' +
      '<div class="lib-foot"><span class="lib-name">基础卡</span></div><div class="lib-meta">' + baseState + '</div></div>'
    var order = [], bySet = {}
    ;(p.preloadedCards || []).forEach(function (card) {
      var key = String(card.setId || (card.preload && card.preload.targetId) || card.templateId)
      if (!bySet[key]) { bySet[key] = []; order.push(key) }
      bySet[key].push(card)
    })
    var sections = ['<section class="lib-group"><div class="lib-group-head"><span class="lib-group-name">基础卡</span><span class="lib-group-caption">基础版 · 始终可用</span></div><div class="lib-grid">' + baseTile + '</div></section>']
    order.forEach(function (key) {
      var cards = bySet[key], unlocked = [], locked = []
      cards.forEach(function (card) { (card.status === 'locked' ? locked : unlocked).push(card) })
      var body = unlocked.length
        ? '<div class="lib-grid">' + unlocked.map(function (card) { return libraryTile(card, p.displayTemplateId === card.templateId, p.id) }).join('') + '</div>'
        : '<p class="lib-empty">该卡组档位尚未解锁</p>'
      var locks = locked.length ? '<p class="lib-locks">未解锁档位：' + locked.map(function (card) { return html(TIER_LABELS[card.tier] || card.title) }).join(' · ') + '（随球员等级自动解锁）</p>' : ''
      sections.push('<section class="lib-group"><div class="lib-group-head"><span class="lib-group-name">' + html(groupLabel(cards)) + '</span><span class="lib-group-caption">' + cardKindLabel(cards[0].cardKind) + ' · 共 ' + cards.length + ' 档</span></div>' + body + locks + '</section>')
    })
    return '<section class="pc-library"><h3 class="pc-library-title">卡库<span class="pc-library-hint">点选卡片即可切换展示</span></h3>' + sections.join('') + '</section>'
  }
  function render(players) {
    target.className = 'pc'
    if (!players.some(function (p) { return p.id === selectedPlayerId })) selectedPlayerId = players[0].id
    var p = players.filter(function (x) { return x.id === selectedPlayerId })[0]
    var tabs = players.length > 1 ? '<nav class="pc-tabs">' + players.map(function (item) {
      return '<button type="button" class="pc-tab' + (item.id === selectedPlayerId ? ' is-active' : '') + '" data-tab-player="' + html(item.id) + '">' + html(item.name) + (item.teamName ? '<small>' + html(item.teamName) + '</small>' : '') + '</button>'
    }).join('') + '</nav>' : ''
    target.innerHTML = tabs + '<div class="pc-player">' + mainCardHtml(p) + pointsHtml(p, levelInfo(p)) + libraryHtml(p) + '</div>'
    bind(players)
  }
  function saveMyPlayerCard(payload) {
    return api('saveMyPlayerCard', payload).catch(function (e) {
      if (e.code !== 'PLAYER_CARD_PHOTO_PAY_REQUIRED') throw e
      var cost = e.photoReplaceCost || 100
      if (!confirm('未满 100 分更换照片需消耗 ' + cost + ' 滴蜂蜜，是否继续？')) throw e
      return api('saveMyPlayerCard', Object.assign({}, payload, { confirmPhotoReplaceHoney: true }))
    })
  }
  function openBaseEditor(players, playerId, button) {
    if (button) button.disabled = true
    var pending = demo ? Promise.resolve({ player: players.filter(function (p) { return p.id === playerId })[0], standardPortraitData: demoMode === 'adult' ? './assets/player-card-demo-adult-v1.png' : './assets/player-card-demo-portrait-v1.png', draft: demoDrafts[playerId] || null }) : api('getMyPlayerCard', { playerId: playerId })
    pending.then(function (detail) {
      var position = { GK: '守门员', DF: '后卫', MF: '中场', FW: '前锋' }; detail.player.positionLabel = position[detail.player.position] || detail.player.position
      window.SxfPlayerCardEditor.open({ scene: detail.cardScene, player: detail.player, templates: detail.templates, draft: detail.draft, onPreview: function (draft) { return api('previewMyPlayerCard', Object.assign({ playerId: playerId, portraitId: detail.portraitId, expectedVersion: detail.player.version }, draft)) }, onClose: load, portraitSrc: detail.standardPortraitData, teamLogoData: detail.teamLogoData, initialCrop: demo ? (demoMode === 'adult' ? { zoom: 1, x: 0, y: 0 } : { zoom: 1.5, x: 0, y: .25 }) : null, onSave: function (draft) {
        return (demo ? Promise.resolve().then(function () { demoDrafts[playerId] = draft; demoVersions[playerId] = (demoVersions[playerId] || 0) + 1 }) : saveMyPlayerCard(Object.assign({ playerId: playerId, portraitId: detail.portraitId, expectedVersion: detail.player.version }, draft))).then(function () { load() })
      } })
    }).catch(function (e) { error(e.message, load) }).finally(function () { if (button) button.disabled = false })
  }
  function openPreloadEditor(playerId, templateId, button) {
    if (button) button.disabled = true
    api('getMyPreloadedPlayerCard', { playerId: playerId, templateId: templateId }).then(function (detail) {
      window.SxfPlayerCardLibraryEditor.open({ detail: detail, api: api, onSaved: load })
    }).catch(function (e) { error(e.message, load) }).finally(function () { if (button) button.disabled = false })
  }
  function bind(players) {
    Array.prototype.forEach.call(target.querySelectorAll('[data-tab-player]'), function (button) {
      button.onclick = function () { selectedPlayerId = button.getAttribute('data-tab-player'); render(players) }
    })
    Array.prototype.forEach.call(target.querySelectorAll('[data-edit-current]'), function (button) {
      button.onclick = function () {
        if (button.getAttribute('data-kind') === 'preload') openPreloadEditor(button.getAttribute('data-edit-current'), button.getAttribute('data-template'), button)
        else openBaseEditor(players, button.getAttribute('data-edit-current'), button)
      }
    })
    Array.prototype.forEach.call(target.querySelectorAll('[data-points-player]'), function (button) {
      if (demo) { button.disabled = true; return }
      button.onclick = function () { window.SxfPlayerPoints.open({ playerId: button.getAttribute('data-points-player'), playerName: button.getAttribute('data-points-name'), api: api }) }
    })
    Array.prototype.forEach.call(target.querySelectorAll('[data-grade-refresh]'), function (button) { button.onclick = load })
    Array.prototype.forEach.call(target.querySelectorAll('[data-lib-delete]'), function (button) {
      button.onclick = function (e) {
        if (e && e.stopPropagation) e.stopPropagation()
        var playerId = button.getAttribute('data-player'), templateId = button.getAttribute('data-template')
        var p = players.filter(function (x) { return x.id === playerId })[0]
        var card = p ? (p.preloadedCards || []).filter(function (c) { return c.templateId === templateId })[0] : null
        if (!p || !card) return
        if (!confirm('确定删除「' + card.title + '」吗？删除后将从卡库移除，无法恢复。')) return
        button.disabled = true; button.style.opacity = '.4'
        api('deleteMyPlayerCard', { playerId: playerId, templateId: templateId }).then(function () {
          p.preloadedCards = (p.preloadedCards || []).filter(function (c) { return c.templateId !== templateId })
          if (p.displayTemplateId === templateId) { p.displayTemplateId = ''; p.displayState = 'base' }
          render(players)
        }).catch(function (e) { error(e.message, load); button.disabled = false; button.style.opacity = '' })
      }
    })
    Array.prototype.forEach.call(target.querySelectorAll('[data-lib-action]'), function (item) {
      item.onclick = function () {
        var action = item.getAttribute('data-lib-action'), playerId = item.getAttribute('data-player'), templateId = item.getAttribute('data-template') || ''
        if (action === 'retry') { load(); return }
        if (action === 'edit-base') { openBaseEditor(players, playerId); return }
        if (action === 'edit') { openPreloadEditor(playerId, templateId); return }
        if (action !== 'select') return
        item.style.pointerEvents = 'none'; item.style.opacity = '.6'
        api('selectMyPlayerCard', { playerId: playerId, templateId: templateId }).then(function () {
          var p = players.filter(function (x) { return x.id === playerId })[0]
          if (p) { p.displayTemplateId = templateId; p.displayState = templateId ? 'ready' : 'base' }
          render(players)
        }).catch(function (e) { error(e.message, load) })
      }
    })
    Array.prototype.forEach.call(target.querySelectorAll('img'), function (image) {
      image.onerror = function () {
        var item = image.closest('.lib-item')
        if (item && !item.querySelector('.lib-placeholder') && !item.querySelector('.lib-overlay')) {
          image.style.display = 'none'
          var span = document.createElement('span'); span.className = 'lib-overlay'; span.textContent = '读取失败'
          ;(image.closest('.lib-thumb') || item).appendChild(span)
          item.setAttribute('data-lib-action', 'retry'); item.onclick = load
          return
        }
        var main = image.closest('.pc-main')
        if (main && !main.querySelector('.pc-main-retry')) {
          image.style.display = 'none'
          var button = document.createElement('button'); button.type = 'button'; button.className = 'pc-btn pc-btn-ghost pc-main-retry'; button.textContent = '图片读取失败，点击重试'; button.onclick = load
          main.insertBefore(button, main.querySelector('.pc-main-actions'))
        }
      }
    })
  }
  function load() {
    target.className = 'state'; target.textContent = '正在读取球员卡…'
    var request = demo ? Promise.resolve({ players: [
      { id: 'demo-bronze', name: '示例球员', teamName: demoMode === 'adult' ? '成年示例队' : '青训示例队', jerseyNumber: '10', jerseyName: 'SAMPLE', position: 'FW', height: demoMode === 'adult' ? 178 : 142, weight: demoMode === 'adult' ? 72 : 36, nationality: '中国', appearances: 0, cardTier: 'bronze' }
    ].map(function (p) { return Object.assign(p, { version: demoVersions[p.id] || 0, cardUrl: demoDrafts[p.id] && demoDrafts[p.id].cardData || '' }) }) }) : api('listMyPlayerCards')
    request.then(function (r) {
      if (!r.players.length) { target.className = 'state'; target.innerHTML = '<p>暂无已绑定的球员，请先完成球员登记。</p><a href="./me.html">返回我的</a>'; return }
      render(r.players)
    }).catch(function (e) { if (e.code === 'PLAYER_CARD_AUTH_REQUIRED') { localStorage.removeItem(KEY); login() } else error(e.message, load) })
  }
  if (demo) load()
  else if (query.get('code') && query.get('state')) api('fanOAuth', { code: query.get('code'), state: query.get('state') }).then(function (r) { localStorage.setItem(KEY, r.fanSessionToken); history.replaceState({}, '', location.pathname); load() }).catch(function (e) { error(e.message, login) })
  else if (localStorage.getItem(KEY)) load()
  else login()
})()
