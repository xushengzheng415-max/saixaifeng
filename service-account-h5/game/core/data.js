'use strict'
// ---------- 静态配置：资产路径、任务、地图节点、卡面生成、演示数据、引导文案 ----------
  var main = document.getElementById('gameMain')
  var taskBar = document.getElementById('taskBar')
  var mascot = document.getElementById('mascot')
  var bubble = document.getElementById('guideBubble')
  var TIER_LABEL = { bronze: '铜卡', silver: '银卡', gold: '金卡' }
  var TIER_COLOR = { bronze: '#e09a5f', silver: '#c9d4e8', gold: '#ffc94d' }

  // 任务定义
  var TASKS = [
    { id: 'share', label: '送出球员卡', done: false },
    { id: 'collect', label: '收集图鉴', done: false },
    { id: 'lineup', label: '组建阵容', done: false },
    { id: 'pk', label: '阵容 PK', done: false },
    { id: 'daily', label: '每日领卡', done: false }
  ]
  var state = {
    tab: 'map',
    shares: [], codex: [], hallRows: [], hallAfter: '', hallDone: false, hallLoading: false,
    lineups: null, pool: [], editor: null, formations: null,
    opponents: [], matches: [], pickLineupFor: '',
    home: null, sharesLoaded: false, matchesLoaded: false,
    taskIdx: 0, guideTimer: null, dismissedGuides: {},
    zzfxOn: false, dailySpun: false, dailyPrize: null, penaltyState: null, scratchState: null
  }

  // 地图节点配置（坐标为百分比，对应空地图.png 的四块空地）+ 实图素材
  var ASSET = './assets/game/'
  var POSE = {
    welcome: '首页欢迎、新手引导开场', guide: '地图上引导去下一个目的地', celebrate: '任务完成庆祝',
    collect: '收集图鉴成功', lineup: '组建阵容页面', pkGo: 'PK 挑战前加油', pkJudge: 'PK 对战判定结算',
    upgrade: '升级球员卡成功', studio: '制卡工坊', loading: '页面加载中等待', error: '页面加载失败出错提示',
    unlock: '进入新玩法解锁新场景', standard: '标准形象'
  }
  function poseImg(key) { return ASSET + 'fengge/' + (POSE[key] || POSE.standard) + '.png' }
  var MAP_NODES = [
    { id: 'share', label: '蜂哥的小屋', x: 18, y: 46, img: '蜜蜂小屋' },
    { id: 'collect', label: '收集图鉴', x: 38, y: 66, img: '蜂蜜图书馆' },
    { id: 'lineup', label: '组建阵容', x: 63, y: 48, img: '训练场' },
    { id: 'pk', label: '阵容 PK', x: 85, y: 70, img: '大体育场' },
    { id: 'daily', label: '每日领卡', x: 25, y: 20, img: '烧烤摊' }
  ]
  var MAP_DECOS = []

  // ---------- 生成卡面占位图（SVG data URI，真实卡图缺失时兜底） ----------
  var CARD_BGS = {
    classic: { a: '#0b142c', b: '#141f3d', label: '经典夜空' },
    honey: { a: '#4a3200', b: '#9c7400', label: '蜂蜜金巢' },
    pitch: { a: '#0a3d2a', b: '#14654c', label: '绿茵球场' },
    sakura: { a: '#4d1230', b: '#a02858', label: '樱花粉霞' },
    champion: { a: '#1e1a4d', b: '#5b2ea6', label: '冠军紫金' }
  }
  function cardArt(name, tier, num, bgKey) {
    var c = TIER_COLOR[tier] || '#8b98bd'
    var bg = CARD_BGS[bgKey] || CARD_BGS.classic
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="430" viewBox="0 0 300 430">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="' + bg.a + '"/><stop offset="1" stop-color="' + bg.b + '"/></linearGradient></defs>' +
      '<rect width="300" height="430" fill="url(#g)"/>' +
      '<rect x="6" y="6" width="288" height="418" rx="14" fill="none" stroke="' + c + '" stroke-width="3"/>' +
      '<circle cx="150" cy="170" r="78" fill="' + c + '" opacity="0.18"/>' +
      '<text x="150" y="180" font-size="80" text-anchor="middle" fill="' + c + '" font-weight="900" opacity="0.5">' + esc(num || '★') + '</text>' +
      '<text x="150" y="300" font-size="34" text-anchor="middle" fill="#eaf0ff" font-weight="800">' + esc(name) + '</text>' +
      '<text x="150" y="340" font-size="22" text-anchor="middle" fill="' + c + '" font-weight="700">' + esc(TIER_LABEL[tier] || '') + '</text>' +
      '<rect x="30" y="370" width="240" height="4" rx="2" fill="' + c + '" opacity="0.6"/></svg>'
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] }) }
  // 真实数据规整：cardUrl 为空时用 SVG 占位兜底
  function normCard(row) {
    if (!row.cardUrl) row.cardUrl = cardArt(row.name, row.tier || 'bronze', row.jerseyNumber || '★', row.bg)
    return row
  }

  // ---------- 演示模式假数据（仅 ?demo=1 时使用） ----------
  var SHARES = [
    { playerId: 'p1', name: '郑晓峰', teamName: '郑州青少队', jerseyNumber: '10', shared: false, shareId: '', tier: 'gold', points: 92, cardStatus: 'ready', cardUrl: '' },
    { playerId: 'p2', name: '李明轩', teamName: '郑州青少队', jerseyNumber: '7', shared: true, shareId: 's2', tier: 'silver', points: 68, cardStatus: 'ready', cardUrl: '' },
    { playerId: 'p3', name: '王子涵', teamName: '郑州青少队', jerseyNumber: '1', shared: true, shareId: 's3', tier: 'bronze', points: 41, cardStatus: 'ready', cardUrl: '' },
    { playerId: 'p4', name: '陈思远', teamName: '郑州青少队', jerseyNumber: '4', shared: true, shareId: 's4', tier: 'silver', points: 61, cardStatus: 'ready', cardUrl: '' },
    { playerId: 'p5', name: '刘浩然', teamName: '郑州青少队', jerseyNumber: '9', shared: true, shareId: 's5', tier: 'gold', points: 85, cardStatus: 'ready', cardUrl: '' },
    { playerId: 'p6', name: '赵梓豪', teamName: '郑州青少队', jerseyNumber: '5', shared: true, shareId: 's6', tier: 'bronze', points: 48, cardStatus: 'ready', cardUrl: '' },
    { playerId: 'p7', name: '孙一鸣', teamName: '郑州青少队', jerseyNumber: '8', shared: true, shareId: 's7', tier: 'silver', points: 72, cardStatus: 'ready', cardUrl: '' }
  ]
  SHARES.forEach(function (s) { s.bg = s.bg || 'classic'; s.cardUrl = cardArt(s.name, s.tier, s.jerseyNumber, s.bg) })

  var HALL = [
    { shareId: 'h1', playerId: 'h1p', name: '陈星辰', teamName: '开封立洋', jerseyNumber: '9', tier: 'gold', points: 88, cardStatus: 'ready', cardUrl: '', collected: false },
    { shareId: 'h2', playerId: 'h2p', name: '赵宇航', teamName: '洛阳雄鹰', jerseyNumber: '11', tier: 'silver', points: 63, cardStatus: 'ready', cardUrl: '', collected: false },
    { shareId: 'h3', playerId: 'h3p', name: '孙浩然', teamName: '新乡风暴', jerseyNumber: '5', tier: 'bronze', points: 38, cardStatus: 'ready', cardUrl: '', collected: false },
    { shareId: 'h4', playerId: 'h4p', name: '周逸飞', teamName: '许昌闪电', jerseyNumber: '23', tier: 'gold', points: 95, cardStatus: 'ready', cardUrl: '', collected: false },
    { shareId: 'h5', playerId: 'h5p', name: '吴俊豪', teamName: '焦作猛虎', jerseyNumber: '8', tier: 'silver', points: 71, cardStatus: 'ready', cardUrl: '', collected: false },
    { shareId: 'h6', playerId: 'h6p', name: '郑子墨', teamName: '漯河飞龙', jerseyNumber: '4', tier: 'bronze', points: 45, cardStatus: 'ready', cardUrl: '', collected: false }
  ]
  HALL.forEach(function (s) { s.cardUrl = cardArt(s.name, s.tier, s.jerseyNumber) })

  // 发卡：从图鉴卡池里抽一张真的进持卡池（转盘、刮刮卡共用），返回实际发放的卡
  function grantCard(tier) {
    var owned = {}
    state.pool.forEach(function (p) { owned[p.playerId] = true })
    var free = HALL.filter(function (c) { return !owned[c.playerId] })
    var wanted = function (c) { return !tier || tier === 'any' || c.tier === tier }
    var pool = free.filter(wanted)
    if (!pool.length) pool = free
    var base = pool.length
      ? pool[Math.floor(Math.random() * pool.length)]
      : (HALL.filter(wanted)[0] || HALL[0])
    var card = {
      playerId: base.playerId + (owned[base.playerId] ? '-r' + Date.now().toString(36) : ''),
      name: base.name, tier: base.tier, points: base.points, cardUrl: base.cardUrl, teamName: base.teamName
    }
    state.pool.push(card)
    return card
  }

  // 阵型坐标改为上下分排、整齐对齐（pitch 已用 flex 垂直排列）
  var FORMATIONS = [
    { count: 5, options: [{ id: '2-2', name: '2-2', positions: [
      { role: 'FW1', label: '前锋', row: 'forward', x: 33 }, { role: 'FW2', label: '前锋', row: 'forward', x: 67 },
      { role: 'CB1', label: '后卫', row: 'back', x: 33 }, { role: 'CB2', label: '后卫', row: 'back', x: 67 },
      { role: 'GK', label: '门将', row: 'keeper', x: 50 }
    ]}]},
    { count: 7, options: [{ id: '3-3', name: '3-3', positions: [
      { role: 'FW1', label: '前锋', row: 'forward', x: 25 }, { role: 'FW2', label: '前锋', row: 'forward', x: 50 }, { role: 'FW3', label: '前锋', row: 'forward', x: 75 },
      { role: 'CB1', label: '后卫', row: 'back', x: 25 }, { role: 'CB2', label: '后卫', row: 'back', x: 50 }, { role: 'CB3', label: '后卫', row: 'back', x: 75 },
      { role: 'GK', label: '门将', row: 'keeper', x: 50 }
    ]}]}
  ]

  var OPPONENTS = [
    { lineupId: 'op1', name: '开封立洋主力', formation: { count: 5, id: '2-2' }, totalPoints: 286, ownerNickname: '星辰教练', strong: false, updatedAt: Date.now() },
    { lineupId: 'op2', name: '洛阳雄鹰二队', formation: { count: 5, id: '2-2' }, totalPoints: 232, ownerNickname: '宇航爸', strong: false, updatedAt: Date.now() },
    { lineupId: 'op3', name: '郑州铁血联', formation: { count: 5, id: '2-2' }, totalPoints: 468, ownerNickname: '铁血领队', strong: true, updatedAt: Date.now() }
  ]

  // ---------- 引导系统 ----------
  var GUIDES = {
    // 地图：引导用户点第一个建筑
    map: { step: '任务 1 / 4 · 送出球员卡', text: '嗨！我是<b>蜂哥</b>！先点地图上的「<b>蜂哥的小屋</b>」进去看看吧～' },
    // 小屋：引导点"送出展示"房间
    home: { step: '任务 1 / 4 · 送出球员卡', text: '这就是你的小屋啦！点中间的「<b>送出展示</b>」房间，开始第一个玩法！' },
    // 送出页：引导点"送出展示"按钮
    share: { step: '任务 1 / 4 · 送出球员卡', text: '随便挑一张卡，点卡片下方的「<b>送出展示</b>」按钮！送出后别人就能在收集大厅看到你的卡～' },
    collect: { step: '任务 2 / 4 · 收集图鉴', text: '真棒！卡已经送出去了 🎉 现在切到「<b>图鉴</b>」页，去<b>收集大厅</b>领一张别人的卡回来，凑进你的图鉴！' },
    lineup: { step: '任务 3 / 4 · 组建阵容', text: '收集成功！接下来去「<b>阵容</b>」页，用手里的卡<b>排满一套首发</b>并保存。点空槽位再点卡就能上阵～' },
    pk: { step: '任务 4 / 4 · 阵容 PK', text: '阵容出炉！最后一步，去「<b>对战</b>」页找个对手<b>挑战</b>一下，看看你的阵容战力如何！' },
    allDone: { step: '全部完成 🎊', text: '太厉害了！四个玩法你都体验完了，蜂哥给你点赞 👍 正式上线后就能和全平台玩家一起玩啦～' }
  }
