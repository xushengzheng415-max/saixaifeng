var workspace = require('../../../utils/workspace')

Page({
  data: {
    loading: true, errorText: '', accessDenied: false, tournamentId: '',
    name: '赛事赛前工作台', dateVenueText: '赛事信息加载中', divisionText: '当前组别',
    rosterCountText: '0/0', matchCountText: '0', pendingCountText: '0',
    readinessItems: [
      { id: 'rules', label: '竞赛方案', value: '待核验', itemClass: 'pending' },
      { id: 'schedule', label: '赛程', value: '待发布', itemClass: 'pending' },
      { id: 'roster', label: '正式名单', value: '0/0', itemClass: 'pending' },
      { id: 'referee', label: '裁判安排', value: '待核验', itemClass: 'pending' }
    ],
    cards: [], hasCards: false, visualQa: false
  },

  onLoad: function(options) {
    if (workspace.isVisualQaEnabled(options)) { this.loadVisualFixture(); return }
    this.setData({ tournamentId: (options && options.id) || '' })
    this.loadWorkbench()
  },

  onShow: function() { if (!this.data.visualQa) this.loadWorkbench(true) },
  onPullDownRefresh: function() {
    var that = this
    this.loadWorkbench(true).finally(function() { wx.stopPullDownRefresh() })
  },

  loadWorkbench: function(silent) {
    var that = this
    var id = this.data.tournamentId
    if (!id) {
      this.setData({ loading: false, errorText: '缺少赛事参数' })
      return Promise.resolve()
    }
    if (!silent) this.setData({ loading: true, errorText: '' })
    var context = workspace.readContext() || {}
    var allowed = workspace.hasPermission('event.manage', context)
    var current = (context.tournaments || []).filter(function(item) { return item.id === id || item._id === id })[0] || {}
    if (!allowed || current.relation === 'participating') {
      this.setData({ loading: false, accessDenied: true })
      return Promise.resolve()
    }
    var db = wx.cloud.database()
    return Promise.all([
      db.collection('tournaments').doc(id).get(),
      db.collection('tournament_teams').where({ tournamentId: id }).get(),
      db.collection('matches').where({ tournamentId: id }).get()
    ]).then(function(results) {
      var tournament = results[0].data || {}
      var teams = results[1].data || []
      var matches = results[2].data || []
      var approved = teams.filter(function(item) { return item.status === 'approved' })
      var pending = teams.filter(function(item) { return item.status !== 'approved' && item.status !== 'rejected' })
      var scheduleReady = matches.length > 0
      var rulesReady = String(tournament.status || '') !== 'draft'
      var refsReady = matches.filter(function(item) { return !!item.refereeId }).length
      var rosterText = String(approved.length) + '/' + String(teams.length)
      var cards = [
        { id: 'roster', icon: '/images/runtime/icons/brand-v2-13.png', title: '正式名单状态', mainText: rosterText + ' 已完成', subText: pending.length ? '仍有参赛资料待处理' : '报名资料已同步', actionText: '进入审核', routeType: 'teams', itemClass: pending.length ? 'attention' : 'ready' },
        { id: 'referee', icon: '/images/runtime/icons/brand-v2-14.png', title: '裁判安排', mainText: String(refsReady) + '/' + String(matches.length) + ' 场已安排', subText: refsReady === matches.length ? '裁判安排已就绪' : '缺员场次请在 PC 后台补充', actionText: '查看详情', routeType: 'pc', itemClass: refsReady === matches.length ? 'ready' : 'attention' },
        { id: 'schedule', icon: '/images/runtime/icons/brand-v2-01.png', title: '场地与赛程', mainText: scheduleReady ? '赛程已发布' : '赛程待发布', subText: String(matches.length) + ' 场比赛', actionText: '查看赛程', routeType: 'schedule', itemClass: scheduleReady ? 'ready' : 'attention' },
        { id: 'lineup', icon: '/images/runtime/icons/brand-v2-15.png', title: '球队阵容提交状态', mainText: '首场赛前由球队提交', subText: '主办方仅查看球队提交情况', actionText: '查看提交', routeType: 'teams', itemClass: 'ready' }
      ]
      var readiness = [
        { id: 'rules', label: '竞赛方案', value: rulesReady ? '已锁定' : '待核验', itemClass: rulesReady ? 'ready' : 'pending' },
        { id: 'schedule', label: '赛程', value: scheduleReady ? '已发布' : '待发布', itemClass: scheduleReady ? 'ready' : 'pending' },
        { id: 'roster', label: '正式名单', value: rosterText, itemClass: pending.length ? 'pending' : 'ready' },
        { id: 'referee', label: '裁判安排', value: String(refsReady) + '/' + String(matches.length), itemClass: refsReady === matches.length ? 'ready' : 'pending' }
      ]
      that.setData({
        loading: false, errorText: '', name: tournament.name || current.name || '赛事赛前工作台',
        dateVenueText: (tournament.startDate || current.dateText || '日期待定') + ' · ' + (tournament.location || tournament.venue || '场地待定'),
        divisionText: tournament.divisionName || tournament.division || '当前赛事', rosterCountText: rosterText,
        matchCountText: String(matches.length), pendingCountText: String(pending.length),
        readinessItems: readiness, cards: cards, hasCards: cards.length > 0
      })
    }).catch(function(error) {
      that.setData({ loading: false, errorText: error.message || '赛前工作台加载失败' })
    })
  },

  loadVisualFixture: function() {
    this.setData({ loading: false, visualQa: true, tournamentId: 'visual-pro', name: '2026 河南青少年足球冠军联赛', dateVenueText: '7月20日 — 8月18日 · 河南省体育中心', divisionText: 'PRO · U12', rosterCountText: '16', matchCountText: '32', pendingCountText: '10', readinessItems: [{ id:'rules',label:'竞赛方案',value:'已锁定',itemClass:'ready' },{ id:'schedule',label:'赛程',value:'已发布',itemClass:'ready' },{ id:'roster',label:'正式名单',value:'待处理 3',itemClass:'pending' },{ id:'referee',label:'裁判安排',value:'待处理 1',itemClass:'pending' }], cards: [{id:'roster',icon:'/images/runtime/icons/brand-v2-13.png',title:'正式名单审核',mainText:'待处理 3 项',subText:'当前赛事正式名单核验',actionText:'进入审核',routeType:'teams',itemClass:'attention'},{id:'referee',icon:'/images/runtime/icons/brand-v2-14.png',title:'裁判安排',mainText:'待处理 1 项',subText:'缺员场次请在 PC 后台补充',actionText:'查看详情',routeType:'pc',itemClass:'attention'},{id:'schedule',icon:'/images/runtime/icons/brand-v2-01.png',title:'场地与赛程',mainText:'8 场今日比赛',subText:'赛程已发布',actionText:'查看赛程',routeType:'schedule',itemClass:'ready'}], hasCards:true })
  },
  onCardTap: function(event) {
    var type = event.currentTarget.dataset.type
    var id = this.data.tournamentId
    if (type === 'teams') { wx.navigateTo({ url: '/pages/tournament/teams/teams?id=' + id }); return }
    if (type === 'schedule') { wx.navigateTo({ url: '/pages/tournament/schedule/schedule?id=' + id }); return }
    wx.showModal({ title: '请使用 PC 管理后台', content: '裁判场次安排需在 PC 管理后台完成，小程序仅展示授权协作状态。', showCancel: false, confirmColor: '#197451' })
  },

  onTodoTap: function() { wx.switchTab({ url: '/pages/todo/index' }) },
  onBackTap: function() { wx.navigateBack() }
})
