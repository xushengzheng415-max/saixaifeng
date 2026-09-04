var workspace = require('../../utils/workspace')
var signupDraft = require('../../utils/signup-draft')

function countPending(items) {
  return (items || []).filter(function (item) { return item.status === 'pending' || item.status === 'reviewing' }).length
}

function taskCards(items) {
  var tones = ['', 'orange', 'blue']
  var icons = [
    '/images/icons/shield.svg',
    '/images/icons/event.svg',
    '/images/icons/warning.svg'
  ]
  return (items || []).slice(0, 3).map(function (item, index) {
    return {
      id: item.id || item._id || String(index),
      title: item.title || '待处理事项',
      subtitle: item.subtitle || '待处理 1',
      count: String(item.count || 1),
      toneClass: tones[index],
      icon: icons[index],
      assetClass: 'svg-icon',
      isPrototypeReference: false,
      taskWrapStyle: '',
      taskImageStyle: ''
    }
  })
}

function formatTeam(item, index) {
  var rawCompletion = item.completionPercent != null ? item.completionPercent : item.profileCompletion
  var completion = Number(rawCompletion)
  var completionText = Number.isFinite(completion) ? '资料完整度 ' + completion + '%' : '资料完整度待完善'
  return {
    id: item.id || item._id || item.teamId || String(index),
    name: item.name || item.teamName || '未命名球队',
    logo: item.logo || item.teamLogo || '/images/logo.png',
    ownerText: item.ownerText || item.responsibleText || (item.coachName ? '负责人 ' + item.coachName : '负责人待完善'),
    playerText: String(item.playerCount || 0) + ' 名球员',
    coachText: String(item.coachCount || 0) + ' 名教练',
    eventText: String(item.tournamentCount || item.eventCount || 0) + ' 项赛事',
    completionText: completionText
  }
}

function formatMatch(item, index) {
  var dateValue = item.dateText || item.matchDateText || item.date || '日期待定'
  return {
    id: item.id || item._id || String(index),
    tournamentId: item.tournamentId || item.eventId || item.id || '',
    dateText: dateValue,
    timeText: item.timeText || item.startTime || '时间待定',
    divisionText: item.divisionText || item.divisionName || item.division || '组别待定',
    statusText: item.statusText || '状态待定',
    roundText: item.roundText || item.roundName || '轮次待定',
    venueText: item.venueText || item.location || item.venue || '场地待定',
    homeName: item.homeName || item.homeTeamName || '主队待定',
    awayName: item.awayName || item.awayTeamName || '客队待定',
    homeLogo: item.homeLogo || item.homeTeamLogo || '/images/logo.png',
    awayLogo: item.awayLogo || item.awayTeamLogo || '/images/logo.png'
  }
}

function formatTrainingCourse(item, index) {
  return {
    id: item.id || item._id || String(index),
    timeText: item.timeText || item.startTime || '时间待定',
    classText: item.classText || item.className || item.name || '班级待完善',
    venueText: item.venueText || item.location || '场地待定',
    coachText: item.coachText || item.coachName || '教练待完善',
    studentText: String(item.studentCount || item.playerCount || 0) + ' 人'
  }
}

function isDevtools() {
  try { return wx.getSystemInfoSync().platform === 'devtools' } catch (error) { return false }
}

function previewContext() {
  return {
    currentWorkspace: { id: 'preview-workspace', name: '赛小蜂足球', permissions: [] },
    currentIdentity: { id: 'team_coach', label: '球队教练' },
    unreadMessageCount: 3,
    teams: [
      { id: 'preview-u12', name: '赛小蜂 U12 竞技队', logo: '/images/logo.png', playerCount: 23, coachCount: 3, tournamentCount: 2, completionPercent: 92, coachName: '许老师' },
      { id: 'preview-u10', name: '赛小蜂 U10 梯队', logo: '/images/logo.png', playerCount: 18, coachCount: 2, tournamentCount: 1, completionPercent: 86, coachName: '许老师' }
    ],
    eventSchedule: [{ id: 'preview-match', tournamentId: 'preview-event', dateText: '8月2日', timeText: '10:30', divisionText: 'U12组', statusText: '进行中', roundText: '小组赛 第3轮', venueText: '1号场', homeName: '郑州劲风U12', awayName: '洛阳龙门U12', homeLogo: '/images/logo.png', awayLogo: '/images/logo.png' }],
    eventTasks: [
      { id: 'preview-roster', title: '正式名单待确认', subtitle: '待处理 1', count: 1, audience: 'team', status: 'pending' },
      { id: 'preview-lineup', title: '比赛阵容待提交', subtitle: '待处理 1', count: 1, audience: 'team', status: 'pending' },
      { id: 'preview-profile', title: '资料异常', subtitle: '待处理 1', count: 1, audience: 'team', status: 'reviewing' }
    ],
    statistics: { teamCount: 2, playerCount: 41 },
    trainingSchedule: [], trainingTasks: [], tournaments: []
  }
}

function previewOrganizerContext() {
  return {
    currentWorkspace: { id: 'preview-organizer-workspace', name: '2026 河南青少年足球冠军联赛', permissions: [] },
    currentIdentity: { id: 'organizer', label: '赛事负责人' },
    unreadMessageCount: 3,
    teams: [],
    tournaments: [{ id: 'preview-tournament', name: '2026河南青少年足球冠军联赛', statusText: '进行中' }],
    eventSchedule: [
      { id: 'preview-match-u12', tournamentId: 'preview-tournament', timeText: '10:30', divisionText: 'U12组', statusText: '进行中', roundText: '小组赛 第3轮', venueText: '1号场', homeName: '郑州劲风U12', awayName: '洛阳龙门U12', homeLogo: '/images/logo.png', awayLogo: '/images/logo.png' },
      { id: 'preview-match-u10', tournamentId: 'preview-tournament', timeText: '15:00', divisionText: 'U10组', statusText: '进行中', roundText: '小组赛 第2轮', venueText: '2号场', homeName: '赛小蜂U10', awayName: '雏鹰U10', homeLogo: '/images/logo.png', awayLogo: '/images/logo.png' }
    ],
    eventTasks: [
      { id: 'preview-roster', title: '正式名单审核', subtitle: '待处理 3', count: 3, status: 'pending' },
      { id: 'preview-referee', title: '裁判缺员', subtitle: '待处理 1', count: 1, status: 'pending' },
      { id: 'preview-result', title: '赛果复核', subtitle: '待处理 2', count: 2, status: 'reviewing' }
    ],
    trainingSchedule: [], trainingTasks: [], statistics: { todayMatchCount: 8, pendingReviewCount: 2, exceptionCount: 1 }
  }
}

function previewTrainingContext() {
  return {
    currentWorkspace: { id: 'preview-training-workspace', name: '赛小蜂青训中心', permissions: [] },
    currentIdentity: { id: 'training_coach', label: '青训教练' },
    unreadMessageCount: 3,
    eventTasks: [], teams: [], tournaments: [], eventSchedule: [],
    trainingSchedule: [
      { id: 'training-1', timeText: '16:30', classText: 'U8 启蒙班', venueText: '东区 1 号场', coachText: '王教练', studentCount: 18 },
      { id: 'training-2', timeText: '18:00', classText: 'U10 提高班', venueText: '西区 2 号场', coachText: '刘教练', studentCount: 20 },
      { id: 'training-3', timeText: '19:30', classText: 'U12 竞技班', venueText: '东区 1 号场', coachText: '张教练', studentCount: 16 }
    ],
    trainingTasks: [
      { id: 'leave', title: '请假待审批', subtitle: '待处理 2', count: 2, status: 'pending' },
      { id: 'attendance', title: '签到异常', subtitle: '待处理 1', count: 1, status: 'pending' },
      { id: 'record', title: '课后记录待补', subtitle: '待处理 1', count: 1, status: 'reviewing' }
    ],
    statistics: { classCount: 4, studentCount: 76, pendingTrainingTaskCount: 3, trainingSubscribed: true, trainingAuthorized: true }
  }
}

Page({
  data: {
    loading: true, isLoggedIn: false, errorText: '', roleTitle: '球队教练',
    isOrganizer: false, isTeamCoach: true, isTrainingCoach: false,
    unreadMessageCount: 0, hasUnreadMessages: false,
    overviewTitle: '球队协作概览', overviewName: '暂无可管理球队', hasOverviewName: true,
    overviewStatus: '', hasOverviewStatus: false, overviewLogo: '', hasOverviewLogo: false,
    metrics: [], homeTaskCards: [], hasTaskCards: false, trainingCourses: [], hasTrainingCourses: false,
    matches: [], hasMatches: false, teams: [], hasTeams: false,
    showOtherRoleContent: false, otherSectionTitle: '', otherSectionEmptyText: '', matchSectionTitle: '最近比赛', overviewClass: '', topbarClass: '',
    localVisualQa: false
  },

  onLoad: function (options) {
    if (isDevtools() && options && options.visualQa === '1' && options.scenario === 'team-coach') {
      this.setData({ localVisualQa: true })
      this.applyContext(previewContext())
      return
    }
    if (isDevtools() && options && options.visualQa === '1' && options.scenario === 'organizer') {
      this.setData({ localVisualQa: true })
      this.applyContext(previewOrganizerContext())
      return
    }
    if (isDevtools() && options && options.visualQa === '1' && options.scenario === 'training-coach') {
      this.setData({ localVisualQa: true })
      this.applyContext(previewTrainingContext())
      return
    }
    this.loadData()
  },
  onShow: function () {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().syncFromPage(0)
    if (this.data.localVisualQa) return
    var cached = workspace.readContext()
    if (cached) this.applyContext(cached)
    this.loadData(true)
  },
  onPullDownRefresh: function () { this.loadData(true).finally(function () { wx.stopPullDownRefresh() }) },

  loadData: function (silent) {
    var userInfo = wx.getStorageSync('userInfo') || null
    if (!userInfo || !userInfo._id) { this.setData({ loading: false, isLoggedIn: false }); return Promise.resolve() }
    var that = this
    if (!silent) this.setData({ loading: true, errorText: '', isLoggedIn: true })
    var cached = workspace.readContext()
    if (cached) this.applyContext(cached)
    return workspace.loadContext().then(function (context) { that.applyContext(context) }).catch(function (error) {
      if (error && error.code === 'ORG_CONFLICT') {
        workspace.clearContext()
        that.setData({ loading: false, errorText: error.message || '当前账号关联多个机构，请联系管理员核验' })
        return
      }
      if (cached) { that.applyContext(cached); return }
      that.setData({ loading: false, errorText: error.message || '首页加载失败，请重试' })
    })
  },

  applyContext: function (context) {
    if (!context || !context.currentWorkspace) return
    var identity = context.currentIdentity || {}
    var role = identity.id || 'team_coach'
    var isOrganizer = role === 'organizer'
    var isTrainingCoach = role === 'training_coach'
    var isTeamCoach = !isOrganizer && !isTrainingCoach
    var rawTeams = (context.teams || []).slice(0, 2)
    var teams = rawTeams.map(formatTeam)
    var matches = (context.eventSchedule || context.schedule || []).slice(0, isOrganizer ? 2 : 1).map(formatMatch)
    var eventTasks = (context.eventTasks || []).slice()
    var localDraft = signupDraft.resolveAgainstRegistrations(signupDraft.read(), context.registrations || [])
    var localDraftTask = signupDraft.toTask(localDraft)
    if (localDraftTask && !eventTasks.some(function(item) {
      return item.type === 'registration_draft' && item.tournamentId === localDraftTask.tournamentId && item.teamId === localDraftTask.teamId
    })) eventTasks.unshift(localDraftTask)
    var trainingTasks = context.trainingTasks || []
    var trainingCourses = (context.trainingSchedule || []).slice(0, 3).map(formatTrainingCourse)
    var stats = context.statistics || {}
    var cards = taskCards(isTrainingCoach ? trainingTasks : eventTasks.filter(function (item) { return isOrganizer || item.audience === 'team' || !item.audience }))
    var firstTeam = teams[0] || {}
    var data = {
      loading: false, isLoggedIn: true, errorText: '', roleTitle: identity.label || (isOrganizer ? '赛事负责人' : (isTrainingCoach ? '青训教练' : '球队教练')),
      isOrganizer: isOrganizer, isTeamCoach: isTeamCoach, isTrainingCoach: isTrainingCoach,
      unreadMessageCount: Number(context.unreadMessageCount || 0), hasUnreadMessages: Number(context.unreadMessageCount || 0) > 0,
      teams: teams, hasTeams: teams.length > 0, matches: matches, hasMatches: matches.length > 0, trainingCourses: trainingCourses, hasTrainingCourses: trainingCourses.length > 0,
      homeTaskCards: cards, hasTaskCards: cards.length > 0,
      showOtherRoleContent: false,
      otherSectionTitle: isOrganizer ? '今日比赛' : '今日课程',
      otherSectionEmptyText: isOrganizer ? '当前没有可见赛事赛程' : '当前没有课程安排',
      matchSectionTitle: isOrganizer ? '今日比赛' : '最近比赛',
      overviewClass: isOrganizer ? 'organizer-overview' : '',
      topbarClass: isOrganizer ? 'organizer-topbar' : ''
    }
    if (isOrganizer) {
      var tournament = (context.tournaments || [])[0] || {}
      data.overviewTitle = '今日赛事概况'; data.overviewName = tournament.name || '暂无进行中的赛事'; data.hasOverviewName = true
      data.overviewStatus = tournament.statusText || '待创建'; data.hasOverviewStatus = true; data.overviewLogo = ''; data.hasOverviewLogo = false
      data.metrics = [{ label: '今日比赛', value: String(stats.todayMatchCount || matches.length), icon: '/images/icons/event.svg' }, { label: '待复核', value: String(stats.pendingReviewCount || countPending(eventTasks)), icon: '/images/icons/shield.svg' }, { label: '异常', value: String(stats.exceptionCount || eventTasks.filter(function (item) { return item.status === 'reviewing' }).length), icon: '/images/icons/warning.svg' }]
    } else if (isTrainingCoach) {
      data.overviewTitle = '今日青训概览'; data.overviewName = ''; data.hasOverviewName = false; data.overviewStatus = ''; data.hasOverviewStatus = false; data.overviewLogo = ''; data.hasOverviewLogo = false
      data.metrics = [{ label: '班级', value: String(stats.classCount || trainingCourses.length), icon: '/images/icons/training.svg' }, { label: '学员', value: String(stats.studentCount || 0), icon: '/images/icons/players.svg' }, { label: '待办事项', value: String(stats.pendingTrainingTaskCount || countPending(trainingTasks)), icon: '/images/icons/list.svg' }]
    } else {
      data.overviewTitle = '球队协作概览'; data.overviewName = firstTeam.name || '暂无可管理球队'; data.hasOverviewName = true; data.overviewStatus = ''; data.hasOverviewStatus = false
      data.overviewLogo = firstTeam.logo || ''; data.hasOverviewLogo = Boolean(firstTeam.logo)
      data.metrics = [{ label: '我的球队', value: String(stats.teamCount || teams.length), icon: '/images/icons/players.svg' }, { label: '球员总数', value: String(stats.playerCount || 0), icon: '/images/icons/players.svg' }, { label: '赛事待办', value: String(countPending(eventTasks)), icon: '/images/icons/list.svg' }]
    }
    this.setData(data)
  },

  goToMessages: function () { wx.navigateTo({ url: '/pages/messages/index' }) },
  goToTodo: function () { wx.navigateTo({ url: '/pages/todo/index' }) },
  goToSchedule: function () { wx.navigateTo({ url: '/pages/schedule/index' }) },
  goToTeams: function () { wx.switchTab({ url: '/pages/teams/index' }) },
  goToOtherSection: function () { if (this.data.isOrganizer) wx.switchTab({ url: '/pages/event/index' }); else wx.switchTab({ url: '/pages/training/index' }) },
  goToLogin: function () { wx.navigateTo({ url: '/pages/login/login' }) },
  goToPublicTournaments: function () { wx.navigateTo({ url: '/pages/tournament/list/list' }) },
  onTournamentTap: function (event) { var id = event.currentTarget.dataset.id; if (id) wx.navigateTo({ url: '/pages/tournament/detail/detail?id=' + id }) },
  onTeamTap: function (event) {
    var id = event.currentTarget.dataset.id
    var team = (this.data.teams || []).filter(function (item) { return item.id === id })[0]
    if (!team) return
    wx.setStorageSync('teamInfo', { _id: team.id, teamId: team.id, teamName: team.name, teamLogo: team.logo })
    wx.navigateTo({ url: '/pages/team/team' })
  }
})
