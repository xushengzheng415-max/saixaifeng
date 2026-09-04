(function () {
  'use strict'

  const params = new URLSearchParams(location.search)
  const state = params.get('state') || 'intro'
  const app = document.getElementById('screenApp')

  const teams = [
    ['郑州劲风U16', '郑州', true], ['洛阳龙门U16', '洛阳', true], ['开封少年U16', '开封', false], ['新乡未来U16', '新乡', false],
    ['安阳星火U16', '安阳', true], ['焦作山阳U16', '焦作', false], ['许昌飞翼U16', '许昌', false], ['周口先锋U16', '周口', false],
    ['信阳绿茵U16', '信阳', true], ['南阳卧龙U16', '南阳', false], ['商丘雄鹰U16', '商丘', false], ['濮阳龙乡U16', '濮阳', false],
    ['漯河竞技U16', '漯河', true], ['平顶山逐梦U16', '平顶山', false], ['鹤壁朝歌U16', '鹤壁', false], ['三门峡天鹅U16', '三门峡', false],
    ['驻马店驿城U16', '驻马店', true], ['济源王屋U16', '济源', false], ['郑州启航U16', '郑州', false], ['洛阳青训U16', '洛阳', false],
    ['安阳少年U16', '安阳', true], ['焦作竞技U16', '焦作', false], ['许昌未来U16', '许昌', false], ['周口绿城U16', '周口', false],
    ['开封荣耀U16', '开封', true], ['信阳星锐U16', '信阳', false], ['南阳雄狮U16', '南阳', false], ['商丘未来U16', '商丘', false],
    ['濮阳少年U16', '濮阳', false], ['漯河先锋U16', '漯河', false], ['平顶山劲旅U16', '平顶山', false], ['鹤壁新星U16', '鹤壁', false]
  ].map((item, index) => ({
    id: `T${String(index + 1).padStart(2, '0')}`,
    name: item[0],
    city: item[1],
    seeded: item[2],
    short: item[0].slice(0, 2)
  }))

  const groups = Array.from({ length: 8 }, (_, groupIndex) => ({
    name: String.fromCharCode(65 + groupIndex),
    teams: teams.slice(groupIndex * 4, groupIndex * 4 + 4)
  }))

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
  }

  function crest(team, large) {
    return `<span class="team-crest${large ? ' is-large' : ''}" data-code="${escapeHtml(team.id)}"><b>${escapeHtml(team.short)}</b></span>`
  }

  function shell(content, options) {
    const opts = options || {}
    const stage = opts.stage || '抽签准备'
    const badge = opts.badge || '专业版 · U16组'
    const connection = opts.connection || '大屏已连接'
    return `
      <div class="ambient ambient-one"></div><div class="ambient ambient-two"></div>
      <header class="screen-header">
        <div class="screen-brand"><img src="../../web-admin-vue/public/logo-saixiaofeng.png" alt="赛小蜂足球"><span></span><div><b>2026 河南青少年足球冠军联赛</b><small>专业版抽签大屏</small></div></div>
        <div class="screen-context"><span class="pro-badge">${escapeHtml(badge)}</span><strong>${escapeHtml(stage)}</strong><span class="connection ${opts.offline ? 'is-offline' : ''}"><i></i>${escapeHtml(connection)}</span></div>
      </header>
      <section class="screen-content ${opts.contentClass || ''}">${content}</section>
      <footer class="screen-footer"><span>赛小蜂足球 · 公共只读大屏</span><span>发布版本 DRAW-U16-V3 · 2026.08.19</span><span>screen.sxffootball.cn</span></footer>`
  }

  function progress(active) {
    const stages = ['抽签介绍', '球队展示', '抽签进行', '分组结果']
    return `<ol class="stage-progress">${stages.map((label, index) => `<li class="${index < active ? 'is-done' : index === active ? 'is-active' : ''}"><span>${index < active ? '✓' : index + 1}</span><b>${label}</b></li>`).join('')}</ol>`
  }

  function intro() {
    const content = `
      <div class="hero-copy"><span class="eyebrow">PUBLIC DRAW · LIVE SCREEN</span><h1>专业版竞赛组别<br><em>公开抽签</em></h1><p>32 支已确认参赛球队 · 8 个小组 · 每组 4 支球队</p></div>
      <div class="intro-orbit"><div class="orbit-ring ring-one"></div><div class="orbit-ring ring-two"></div><div class="trophy-mark">赛</div><div class="orbit-label label-one"><b>32</b><span>参赛球队</span></div><div class="orbit-label label-two"><b>8</b><span>种子球队</span></div><div class="orbit-label label-three"><b>8</b><span>抽签小组</span></div></div>
      <section class="intro-bottom">${progress(0)}<div class="waiting-pill"><i></i><span>等待主办方开始抽签</span><small>公开快照已发布</small></div></section>`
    return shell(content, { stage: '抽签介绍', contentClass: 'intro-state' })
  }

  function teamWall() {
    const cards = teams.map((team, index) => `<article class="team-card ${team.seeded ? 'is-seed' : ''}"><span class="team-index">${String(index + 1).padStart(2, '0')}</span>${crest(team)}<div><b>${escapeHtml(team.name)}</b><small>${escapeHtml(team.city)}${team.seeded ? ' · 种子队' : ''}</small></div></article>`).join('')
    const content = `<div class="state-heading"><div><span class="eyebrow">TEAM PRESENTATION</span><h1>参赛球队展示</h1><p>当前竞赛组别已确认 32 支球队，金色标识为种子球队</p></div>${progress(1)}</div><div class="team-wall">${cards}</div>`
    return shell(content, { stage: '球队展示', contentClass: 'teams-state' })
  }

  function drawing() {
    const current = teams[18]
    const groupPanels = groups.map((group, index) => `<article class="draw-group ${index === 4 ? 'is-current' : ''}"><header><b>${group.name} 组</b><span>${index === 4 ? '3/4' : '4/4'}</span></header>${group.teams.slice(0, index === 4 ? 3 : 4).map(team => `<div>${crest(team)}<span>${escapeHtml(team.name)}</span></div>`).join('')}${index === 4 ? '<div class="empty-slot"><i></i><span>等待球队</span></div>' : ''}</article>`).join('')
    const content = `<div class="drawing-top"><div><span class="eyebrow">DRAWING IN PROGRESS</span><h1>第 19 / 32 签</h1></div>${progress(2)}<div class="draw-clock"><span>当前轮次</span><b>04</b></div></div><div class="drawing-layout"><section class="current-team"><span class="pulse"></span><small>正在抽取</small>${crest(current, true)}<h2>${escapeHtml(current.name)}</h2><p>${escapeHtml(current.city)} · 非种子球队</p><div class="target-group"><span>即将进入</span><b>E 组</b></div></section><section class="draw-groups">${groupPanels}</section></div>`
    return shell(content, { stage: '抽签进行中', contentClass: 'drawing-state' })
  }

  function result() {
    const panels = groups.map(group => `<article class="result-group"><header><b>${group.name} 组</b><span>4 支球队</span></header>${group.teams.map((team, index) => `<div><span class="slot-number">${index + 1}</span>${crest(team)}<span>${escapeHtml(team.name)}</span>${team.seeded ? '<i>种子</i>' : ''}</div>`).join('')}</article>`).join('')
    const content = `<div class="state-heading result-heading"><div><span class="eyebrow">DRAW COMPLETED</span><h1>U16组抽签结果</h1><p>32 支球队已完成分组 · 结果版本 DRAW-U16-V3</p></div>${progress(3)}<span class="result-seal">已完成</span></div><div class="result-grid">${panels}</div><div class="result-note"><i>✓</i><span>本结果来自主办方发布的只读快照</span><small>发布于 2026.08.19 19:30</small></div>`
    return shell(content, { stage: '分组结果', contentClass: 'result-state' })
  }

  function terminal(kind) {
    const config = {
      revoked: ['发布已撤回', '主办方已撤回本次大屏发布', '此链接不再展示抽签内容，请联系赛事主办方获取最新发布地址。', '撤'],
      invalid: ['链接无效或已过期', '无法读取公开抽签快照', '链接可能已过期、被替换或输入不完整，请返回主办方提供的最新链接。', '!'],
      offline: ['网络连接中断', '正在尝试恢复大屏连接', '当前画面保留最近一次已验证快照；网络恢复后将自动校验版本并同步。', '↻']
    }[kind]
    const offline = kind === 'offline'
    const content = `<section class="terminal-card ${kind}"><span class="terminal-icon">${config[3]}</span><span class="eyebrow">PUBLIC SCREEN STATUS</span><h1>${config[0]}</h1><h2>${config[1]}</h2><p>${config[2]}</p>${offline ? '<div class="retry-track"><i></i><span>第 3 次重连 · 5 秒后重试</span></div><div class="cached-version">已缓存版本：DRAW-U16-V3</div>' : '<div class="terminal-code">状态码：SCREEN_PUBLICATION_UNAVAILABLE</div>'}<footer><span>赛小蜂足球公共大屏</span><small>本页面不会请求后台管理数据</small></footer></section>`
    return shell(content, { stage: config[0], badge: '公众大屏', connection: offline ? '连接恢复中' : '公开链接不可用', offline, contentClass: 'terminal-state' })
  }

  const renderers = { intro, teams: teamWall, drawing, result, revoked: () => terminal('revoked'), invalid: () => terminal('invalid'), offline: () => terminal('offline') }
  app.innerHTML = (renderers[state] || renderers.invalid)()
  app.dataset.state = state
})()
