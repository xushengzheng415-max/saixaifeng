// pages/tournament/detail/detail.js
const app = getApp()
const db = wx.cloud.database()
const workspace = require('../../../utils/workspace')

Page({
  data: {
    loading: true,
    visualQa: false,
    visualSummary: {},
    visualPreTasks: [],
    visualPostTasks: [],
    tournamentId: '',
    // 赛事基本信息
    name: '',
    status: '',
    statusText: '',
    type: '',
    format: '',
    startDate: '',
    endDate: '',
    location: '',
    description: '',
    coverUrl: '',
    organizerName: '',

    // 权限
    isOrganizer: false,
    isCoach: false,
    myTeamId: '',
    myTeamName: '',

    // 球队相关（预计算长度）
    teams: [],
    approvedTeams: [],
    pendingTeams: [],
    teamsLen: 0,
    approvedTeamsLen: 0,
    pendingTeamsLen: 0,

    // 参赛名单
    rosterInfo: {
      status: '',
      statusText: '',
      statusDesc: '',
      submitted: false,
      canEdit: false,
      canRequestModify: false,
      hasDraft: false,
      playerCount: 0
    },
    coachList: [],
    playerList: [],
    coachListLen: 0,
    playerListLen: 0,

    // 当前Tab
    currentTab: 'roster',  // roster | stats | schedule | teams

    // 数据统计
    goalsRanking: [],
    assistsRanking: [],
    goalsRankingLen: 0,
    assistsRankingLen: 0,

    // 积分榜
    standings: [],
    standingsLen: 0,

    // 赛程
    matches: [],
    teamMatches: [],
    generateScheduleText: '生成赛程',
    matchesLen: 0,
    teamMatchesLen: 0,
    upperHalfLen: 0,
    lowerHalfLen: 0,

    // 赛程信息
    scheduleInfo: {
      hasGroups: false,
      scheduleType: '',
      groups: [],
      upperHalf: [],
      lowerHalf: [],
      cupBracketSize: 0,
      cupByeCount: 0,
      ranking: [],
      leagueLoopType: '',
      useGroups: false,
      cupAdvanceCount: 0
    },

    // 预计算标志（避免 WXML 中使用复杂表达式）
    showStartDate: false,
    showEndDate: false,
    showDateSeparator: false,
    tabRoster: '',
    tabStats: '',
    tabSchedule: '',
    tabTeams: '',
    isTabRoster: false,
    isTabStats: false,
    isTabSchedule: false,
    isTabTeams: false,
    rosterNotApproved: true,
    rosterStatusPending: false,
    noStatsData: true,
    noScheduleData: true,
    noTeamsData: true,
    isScheduleGroup: false,
    isScheduleCup: false,
    isScheduleLeague: false,
    leagueLoopText: '',

    // 比赛制式 + 每队人数上限（P0 功能：网页端创建赛事设置）
    matchFormat: '11side',
    maxPlayersPerTeam: 35,
    knockoutMaxPlayers: 0,
    knockoutRosterEnabled: false,
    knockoutRosterOpen: false,
    maxRosterChanges: 3,
    // 人数上限提示文案（预计算，避免 WXML 拼接）
    rosterLimitText: '',
    knockoutLimitText: '',
    showKnockoutRoster: false,
    showRosterChangeEntry: false,
    showRules: false,
    // ★ P1-4: 预计算规则相关字段（避免 WXML 三元/!== 表达式）
    rulesToggleIcon: '?',
    hasForfeitRule: false,
    allowSubBackText: '否',
    // ★ P1-4: 预计算 && 组合条件字段
    showLoading: false,
    showSignupSection: false,
    showRosterTab: false,
    showSubmitRosterBtn: false,
    showSubmitBar: false,
    showAllMatches: false,
    showTeamsTab: false,
    showApprovedTeamsTitle: false,
    // 报名信息
    signupStatus: '',
    signupIcon: '',
    signupTitle: '',
    signupDesc: '',
    // ★ 卡片快捷操作预计算字段
    showQuickActions: false,
    isQuickOrganizer: false,
    isQuickCoach: false,
    quickCard1Icon: '',
    quickCard1Title: '',
    quickCard1Desc: '',
    quickCard2Icon: '',
    quickCard2Title: '',
    quickCard2Desc: '',
    quickCard3Icon: '',
    quickCard3Title: '',
    quickCard3Desc: '',
    quickCard4Icon: '',
    quickCard4Title: '',
    quickCard4Desc: '',
    // ★ 信息同步新增字段
    logoUrl: '',
    typeText: '',
    registerDeadline: '',
    createTimeText: '',
    maxTeams: 0,
    dayCount: 0,
    regulationsUrl: '',
    regulationsFileId: '',
    regulationsFileName: '',
    hasRegulationsFile: false,
    showRegulationsCard: false,
    regulationsStatusText: '未上传',
    regulationsActionText: '上传',
    websiteUrl: '',
    inviteSharePath: '',
    // 赛制规则完整字段（预计算，避免 WXML 深度属性链）
    rulePointsEnableGoalBonus: false,
    rulePointsGoalBonus: 0,
    rulePointsEnableCardDeduction: false,
    rulePointsYellowCardDeduction: 0,
    rulePointsRedCardDeduction: 0,
    ruleSubsExtraHalftime: false,
    ruleSubsHalftimeCount: 0,
    ruleSuspendTwoYellowMatches: 0,
    ruleSuspendCarryRed: false,
    ruleSuspendCarryYellow: false,
    hasRulesObject: false,
    hasRulesString: false,
    rulesStringContent: ''
  },

  normalizeRegulationsFileName: function (value, fallback) {
    var text = value === undefined || value === null ? '' : String(value)
    text = text || fallback || '竞赛规程'
    text = text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')

    text = text.replace(/&#(x?[0-9a-fA-F]+);/g, function (match, code) {
      var point = code.charAt(0).toLowerCase() === 'x'
        ? parseInt(code.slice(1), 16)
        : parseInt(code, 10)
      if (!point || point < 0) return ''
      try {
        return String.fromCodePoint ? String.fromCodePoint(point) : String.fromCharCode(point)
      } catch (e) {
        return ''
      }
    })

    text = text.replace(/\uD83D[\uDCC3\uDCC4]/g, '')
    text = text.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
    return text || fallback || '竞赛规程'
  },

  // 规则折叠
  toggleRules: function () {
    var newShowRules = !this.data.showRules
    this.setData({ showRules: newShowRules, rulesToggleIcon: newShowRules ? '▼' : '?' })
  },

  onDownloadRegulations: function () {
    var fileId = this.data.regulationsFileId
    var url = this.data.regulationsUrl

    if (fileId) {
      wx.showLoading({ title: '下载中...' })
      wx.cloud.downloadFile({
        fileID: fileId,
        success: function (res) {
          wx.hideLoading()
          wx.openDocument({
            filePath: res.tempFilePath,
            showMenu: true,
            fail: function () {
              wx.showToast({ title: '无法打开文件', icon: 'none' })
            }
          })
        },
        fail: function () {
          wx.hideLoading()
          wx.showToast({ title: '下载失败', icon: 'none' })
        }
      })
      return
    }

    if (!url) {
      wx.showToast({ title: '暂无规程文件', icon: 'none' })
      return
    }

    wx.showLoading({ title: '下载中...' })
    wx.downloadFile({
      url: url,
      success: function (res) {
        wx.hideLoading()
        if (res.statusCode === 200) {
          wx.openDocument({
            filePath: res.tempFilePath,
            showMenu: true,
            fail: function () {
              wx.showToast({ title: '无法打开文件', icon: 'none' })
            }
          })
        }
      },
      fail: function () {
        wx.hideLoading()
        wx.showToast({ title: '下载失败', icon: 'none' })
      }
    })
  },

  onUploadRegulations: function () {
    var that = this
    if (!that.data.isOrganizer) {
      wx.showToast({ title: '仅主办方可上传', icon: 'none' })
      return
    }

    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf', 'doc', 'docx', 'txt', 'jpg', 'jpeg', 'png', 'gif', 'webp'],
      success: function (res) {
        var file = res.tempFiles && res.tempFiles[0]
        if (!file || !file.path) return
        that.uploadRegulationsFile(file)
      }
    })
  },

  uploadRegulationsFile: function (file) {
    var that = this
    var fileName = that.normalizeRegulationsFileName(file.name, '竞赛规程-' + Date.now())
    var size = file.size || 0
    if (size > 10 * 1024 * 1024) {
      wx.showToast({ title: '文件不能超过10MB', icon: 'none' })
      return
    }

    var safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
    var cloudPath = 'tournament-regulations/' + that.data.tournamentId + '/' + Date.now() + '-' + safeName
    wx.showLoading({ title: '上传中...' })

    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: file.path,
      success: function (uploadRes) {
        var fileID = uploadRes.fileID
        var saveUpload = function (tempUrl) {
          db.collection('tournaments').doc(that.data.tournamentId).update({
            data: {
              regulationsFileId: fileID,
              regulationsUrl: tempUrl || '',
              regulationsFileName: fileName,
              updateTime: db.serverDate()
            },
            success: function () {
              wx.hideLoading()
              that.setData({
                regulationsFileId: fileID,
                regulationsUrl: tempUrl || '',
                regulationsFileName: fileName,
                hasRegulationsFile: true,
                showRegulationsCard: true,
                regulationsStatusText: '已上传的竞赛规程文档',
                regulationsActionText: '更换'
              })
              wx.showToast({ title: '上传成功', icon: 'success' })
            },
            fail: function (err) {
              wx.hideLoading()
              console.error('[detail] 保存竞赛规程失败:', err)
              wx.showToast({ title: '保存失败', icon: 'none' })
            }
          })
        }

        wx.cloud.getTempFileURL({
          fileList: [fileID],
          success: function (urlRes) {
            var item = urlRes.fileList && urlRes.fileList[0]
            saveUpload((item && item.tempFileURL) || '')
          },
          fail: function () {
            saveUpload('')
          }
        })
      },
      fail: function (err) {
        wx.hideLoading()
        console.error('[detail] 上传竞赛规程失败:', err)
        wx.showToast({ title: '上传失败', icon: 'none' })
      }
    })
  },

  onQuickCard1: function () {
    var id = this.data.tournamentId
    wx.navigateTo({ url: '/pages/tournament/teams/teams?id=' + id })
  },
  onQuickCard2: function () {
    var id = this.data.tournamentId
    wx.navigateTo({ url: '/pages/tournament/draw/draw?id=' + id })
  },
  onQuickCard3: function () {
    // 赛程安排 → 跳转独立页面
    var id = this.data.tournamentId
    wx.navigateTo({ url: '/pages/tournament/schedule/schedule?id=' + id })
  },
  onQuickCard4: function () {
    // 赛前工作台统一承接名单审核、赛程确认和裁判安排的主办方移动协作。
    var id = this.data.tournamentId
    wx.navigateTo({ url: '/pages/tournament/pre-match/pre-match?id=' + id })
  },
  onQuickScrollRules: function () {
    // 滚动到竞赛规程区
    this.setData({ showRules: true, rulesToggleIcon: '▼' })
  },

  onCopyWebsiteUrl: function () {
    wx.setClipboardData({
      data: this.data.websiteUrl,
      success: function () {
        wx.showToast({ title: '链接已复制', icon: 'success' })
      }
    })
  },

  onShareAppMessage: function (e) {
    var tournamentName = this.data.name || '赛小蜂足球赛事'
    var path = this.data.inviteSharePath || ('/pages/tournament/signup/signup?id=' + this.data.tournamentId + '&from=share')
    return {
      title: '邀请球队报名参赛：' + tournamentName,
      path: path
    }
  },

  onLoad(options) {
    if (workspace.isVisualQaEnabled(options)) {
      this.loadVisualFixture()
      return
    }
    if (options && options.id) {
      this.setData({ tournamentId: options.id })
      this.loadTournament()
    } else {
      this.setData({ loading: false })
    }
  },

  onShow() {
    if (this.data.tournamentId && !this.data.visualQa) {
      this.loadTournament()
    }
  },

  onPullDownRefresh() {
    if (this.data.visualQa) { wx.stopPullDownRefresh(); return }
    this.loadTournament().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  loadVisualFixture: function () {
    this.setData({
      visualQa: true, loading: false, tournamentId: 'visual-pro',
      visualSummary: { name: '2026 河南青少年足球冠军联赛', tag: '我主办的', mode: 'PRO · U12', status: '进行中', dateVenue: '7月20日—8月18日 · 河南省体育中心', teamCount: '16', matchCount: '32', pendingCount: '10' },
      visualPreTasks: [
        { icon: '/images/runtime/icons/brand-v2-13.png', title: '报名审核', count: '待处理 6', route: 'teams' },
        { icon: '/images/runtime/icons/brand-v2-03.png', title: '正式名单审核', count: '待处理 3', route: 'teams' },
        { icon: '/images/runtime/icons/brand-v2-14.png', title: '裁判安排', count: '待处理 1', route: 'pre' }
      ],
      visualPostTasks: [
        { icon: '/images/runtime/icons/brand-v2-09.png', title: '待复核', count: '待处理 2', route: 'schedule' },
        { icon: '/images/runtime/icons/brand-v2-13.png', title: '异常', count: '待处理 1', route: 'pre' }
      ]
    })
  },

  onVisualRoute: function (event) {
    var route = event.currentTarget.dataset.route
    var id = this.data.tournamentId
    if (route === 'teams') { wx.navigateTo({ url: '/pages/tournament/teams/teams?id=' + id }); return }
    if (route === 'schedule') { wx.navigateTo({ url: '/pages/tournament/schedule/schedule?id=' + id }); return }
    wx.navigateTo({ url: '/pages/tournament/pre-match/pre-match?id=' + id })
  },

  // 读取大名单上限回退链（P0 功能：maxPlayersPerTeam ?? maxPlayers ?? 默认值 ?? 20）
  resolveMaxPlayers: function (tournament) {
    if (!tournament) return 20
    if (tournament.maxPlayersPerTeam) return tournament.maxPlayersPerTeam
    if (tournament.maxPlayers) return tournament.maxPlayers
    if (tournament.matchFormat) {
      var defaults = { '11side': 35, '8side': 25, '7side': 20, '5side': 12 }
      if (defaults[tournament.matchFormat]) return defaults[tournament.matchFormat]
    }
    return 20
  },

  // 读取淘汰赛阶段人数上限（空值时沿用第一阶段上限）
  resolveKnockoutMaxPlayers: function () {
    var kMax = this.data.knockoutMaxPlayers
    if (kMax && kMax > 0) return kMax
    return this.data.maxPlayersPerTeam
  },

  // 预计算所有长度字段（避免 WXML 中调用 .length）
  _updateLens: function () {
    var data = this.data
    var _teams = data.teams ? data.teams.length : 0
    var _approved = data.approvedTeams ? data.approvedTeams.length : 0
    var _pending = data.pendingTeams ? data.pendingTeams.length : 0
    var _coaches = data.coachList ? data.coachList.length : 0
    var _players = data.playerList ? data.playerList.length : 0
    var _goals = data.goalsRanking ? data.goalsRanking.length : 0
    var _assists = data.assistsRanking ? data.assistsRanking.length : 0
    var _standings = data.standings ? data.standings.length : 0
    var _matches = data.matches ? data.matches.length : 0
    var _teamMatches = data.teamMatches ? data.teamMatches.length : 0
    var _upperHalf = data.scheduleInfo.upperHalf ? data.scheduleInfo.upperHalf.length : 0
    var _lowerHalf = data.scheduleInfo.lowerHalf ? data.scheduleInfo.lowerHalf.length : 0

    var changes = {}
    if (this.data.teamsLen !== _teams) { changes['teamsLen'] = _teams }
    if (this.data.approvedTeamsLen !== _approved) { changes['approvedTeamsLen'] = _approved }
    if (this.data.pendingTeamsLen !== _pending) { changes['pendingTeamsLen'] = _pending }
    if (this.data.coachListLen !== _coaches) { changes['coachListLen'] = _coaches }
    if (this.data.playerListLen !== _players) { changes['playerListLen'] = _players }
    if (this.data.goalsRankingLen !== _goals) { changes['goalsRankingLen'] = _goals }
    if (this.data.assistsRankingLen !== _assists) { changes['assistsRankingLen'] = _assists }
    if (this.data.standingsLen !== _standings) { changes['standingsLen'] = _standings }
    if (this.data.matchesLen !== _matches) { changes['matchesLen'] = _matches }
    if (this.data.teamMatchesLen !== _teamMatches) { changes['teamMatchesLen'] = _teamMatches }
    if (this.data.upperHalfLen !== _upperHalf) { changes['upperHalfLen'] = _upperHalf }
    if (this.data.lowerHalfLen !== _lowerHalf) { changes['lowerHalfLen'] = _lowerHalf }

    if (Object.keys(changes).length > 0) {
      this.setData(changes)
    }

    // 更新生成赛程按钮文字
    var genText = _matches > 0 ? '重新生成赛程' : '生成赛程'
    if (this.data.generateScheduleText !== genText) {
      this.setData({ generateScheduleText: genText })
    }

    // 预计算所有WXML条件标志（避免 === / !== / && / 三元表达式）
    this._updateFlags()
  },

  // 预计算所有WXML条件标志
  _updateFlags: function () {
    var d = this.data
    var sd = d.startDate || ''
    var ed = d.endDate || ''
    var ct = d.currentTab || ''
    var ri = d.rosterInfo || {}
    var rs = ri.status || ''
    var si = d.scheduleInfo || {}
    var st = si.scheduleType || ''

    var flags = {}

    // 日期显示
    flags['showStartDate'] = !!sd
    flags['showEndDate'] = !!ed
    flags['showDateSeparator'] = (!!sd && !!ed)

    // Tab 高亮class
    flags['tabRoster'] = (ct === 'roster') ? 'active' : ''
    flags['tabStats'] = (ct === 'stats') ? 'active' : ''
    flags['tabSchedule'] = (ct === 'schedule') ? 'active' : ''
    flags['tabTeams'] = (ct === 'teams') ? 'active' : ''

    // Tab 显示标志
    flags['isTabRoster'] = (ct === 'roster')
    flags['isTabStats'] = (ct === 'stats')
    flags['isTabSchedule'] = (ct === 'schedule')
    flags['isTabTeams'] = (ct === 'teams')

    // 参赛名单状态
    flags['rosterNotApproved'] = (rs !== 'approved' && rs !== 'confirmed')
    flags['rosterStatusPending'] = (rs === 'pending_approval')

    // 数据统计空状态
    var _goals = d.goalsRankingLen || 0
    var _assists = d.assistsRankingLen || 0
    var _standings = d.standingsLen || 0
    flags['noStatsData'] = (_goals === 0 && _assists === 0 && _standings === 0)

    // 赛程空状态
    var _matchCnt = d.isCoach ? (d.teamMatchesLen || 0) : (d.matchesLen || 0)
    flags['noScheduleData'] = (_matchCnt === 0 && !si.hasGroups)

    // 球队管理空状态
    var _teamCnt = d.isOrganizer ? (d.teamsLen || 0) : (d.approvedTeamsLen || 0)
    flags['noTeamsData'] = (_teamCnt === 0)

    // 赛制类型
    flags['isScheduleGroup'] = (st === 'group')
    flags['isScheduleCup'] = (st === 'cup')
    flags['isScheduleLeague'] = (st === 'league')

    // 循环赛类型文字
    var lt = si.leagueLoopType || ''
    flags['leagueLoopText'] = (lt === 'single') ? '单循环' : '双循环'

    // 每队人数上限提示文案（P0 功能）
    flags['rosterLimitText'] = '本赛事每队大名单上限：' + (d.maxPlayersPerTeam || 35) + ' 人'

    // 淘汰赛第二阶段名单入口（P1 功能：主办方手动开启窗口后可提交）
    var kEnabled = d.knockoutRosterEnabled || false
    var kOpen = d.knockoutRosterOpen || false
    flags['showKnockoutRoster'] = (kEnabled && kOpen)
    // 淘汰赛阶段人数上限文案
    var kMax = d.knockoutMaxPlayers || 0
    var kLimit = (kMax && kMax > 0) ? kMax : (d.maxPlayersPerTeam || 35)
    flags['knockoutLimitText'] = '淘汰赛阶段每队大名单上限：' + kLimit + ' 人'

    // 换人申请入口按钮（淘汰赛期间、剩余次数>0、有球队权限才显示）
    var canChange = (kEnabled && kOpen && d.isCoach && (d.maxRosterChanges || 0) > 0 && !!d.myTeamId)
    flags['showRosterChangeEntry'] = canChange

    // ★ P1-4: 预计算规则相关字段（避免 WXML 三元/!== 表达式）
    flags['rulesToggleIcon'] = d.showRules ? '▼' : '?'
    // hasForfeitRule: rulePoints.forfeit !== undefined
    var rp = d.rulePoints || {}
    flags['hasForfeitRule'] = (rp.forfeit !== undefined && rp.forfeit !== null)
    // allowSubBackText: ruleSubs.allowSubBack ? '是' : '否'
    var rsub = d.ruleSubs || {}
    flags['allowSubBackText'] = rsub.allowSubBack ? '是' : '否'

    // ★ P1-4: 预计算 && 组合条件字段
    flags['showLoading'] = (!!d.loading && !d.errorMsg)
    flags['showSignupSection'] = (!d.isOrganizer && !!d.signupStatus)
    flags['showRosterTab'] = (!!d.isTabRoster && !!d.isCoach)
    var riCanEdit = !!(ri.canEdit)
    flags['showSubmitRosterBtn'] = (riCanEdit && (d.playerListLen || 0) > 0)
    var riSubmitted = !!(ri.submitted)
    flags['showSubmitBar'] = (!riSubmitted && (d.playerListLen || 0) > 0)
    flags['showAllMatches'] = ((d.matchesLen || 0) > 0 && !d.isCoach)
    flags['showTeamsTab'] = (!!d.isTabTeams && !!d.isOrganizer)
    flags['showApprovedTeamsTitle'] = (!!d.isOrganizer && (d.approvedTeamsLen || 0) > 0)

    // ★ 赛制规则完整字段预计算（避免 WXML 深度属性链）
    var rp2 = d.rulePoints || {}
    flags['rulePointsEnableGoalBonus'] = !!(rp2.enableGoalBonus)
    flags['rulePointsGoalBonus'] = rp2.goalBonusPoints || 0
    flags['rulePointsEnableCardDeduction'] = !!(rp2.enableCardDeduction)
    flags['rulePointsYellowCardDeduction'] = rp2.yellowCardDeduction || 0
    flags['rulePointsRedCardDeduction'] = rp2.redCardDeduction || 0
    var rsub2 = d.ruleSubs || {}
    flags['ruleSubsExtraHalftime'] = !!(rsub2.extraSubsAtHalftime || rsub2.extraSubstitutionAtHalftime)
    flags['ruleSubsHalftimeCount'] = rsub2.halftimeSubstitutions || rsub2.extraSubsAtHalfTime || 0
    var rsus2 = d.ruleSuspend || {}
    flags['ruleSuspendTwoYellowMatches'] = rsus2.twoYellowToRedSuspension || rsus2.secondYellowSuspensionMatches || 0
    flags['ruleSuspendCarryRed'] = !!(rsus2.carryRedCardToNextSeason)
    flags['ruleSuspendCarryYellow'] = !!(rsus2.carryYellowCardToNextSeason)

    // ★ 卡片快捷操作预计算
    flags['showQuickActions'] = !!((d.isOrganizer || d.isCoach) && !d.showLoading && !d.errorMsg)
    flags['isQuickOrganizer'] = !!d.isOrganizer
    flags['isQuickCoach'] = !!d.isCoach
    // 主办方4卡片
    flags['quickCard1Icon'] = '👥'
    flags['quickCard1Title'] = '参赛球队'
    flags['quickCard1Desc'] = (d.approvedTeamsLen || 0) + ' 队'
    flags['quickCard2Icon'] = '📋'
    flags['quickCard2Title'] = '抽签分组'
    flags['quickCard2Desc'] = '查看分组'
    flags['quickCard3Icon'] = '📅'
    flags['quickCard3Title'] = '赛程安排'
    flags['quickCard3Desc'] = (d.matchesLen || 0) + ' 场'
    flags['quickCard4Icon'] = '赛'
    flags['quickCard4Title'] = '赛前工作台'
    flags['quickCard4Desc'] = (d.pendingTeamsLen || 0) + ' 待处理'

    this.setData(flags)
  },

  loadTournament: function () {
    var that = this
    that.setData({ loading: true })

    try { wx.cloud.init({ env: 'cloud1-7g8ckb3c7815a011', traceUser: false }) } catch(e) {}

    var _timeout = setTimeout(function() {
      that.setData({ loading: false, errorMsg: '查询超时，请稍后再试' })
    }, 15000)

    return db.collection('tournaments').doc(that.data.tournamentId).get({
      success: function (res) {
        clearTimeout(_timeout)
        var t = res.data || {}
        if (t && t.rules && typeof t.rules === 'object') {
          try {
            var r = t.rules;
            var ps = (r && r.points) || {};
            var sub = r && r.maxSubstitutions !== undefined ? { maxSubstitutions: r.maxSubstitutions, allowSubBack: r.allowSubBack, extraSubsAtHalfTime: r.extraSubsAtHalfTime } : ((r && r.substitutionRule) || null);
            var sus = r && r.accumulatedYellowCards !== undefined ? { accumulatedYellowCards: r.accumulatedYellowCards, suspensionMatches: r.suspensionMatches, directRedCardSuspension: r.directRedCardSuspension, twoYellowToRedSuspension: r.twoYellowToRedSuspension } : ((r && r.suspensionRule) || null);
            that.setData({ hasRules: !!(ps.win !== undefined || sub || sus), rulePoints: ps, ruleSubs: sub, ruleSuspend: sus });
          } catch(e) { console.warn('[detail] 规则解析异常:', e); }
        }
        var normalizedStatus = t.status || 'upcoming'
        var statusMap = {
          upcoming: { text: '未开始', desc: '赛事尚未开始' },
          ongoing: { text: '进行中', desc: '赛事正在进行' },
          completed: { text: '已结束', desc: '赛事已结束' },
          cancelled: { text: '已取消', desc: '赛事已被取消' }
        }
        var st = statusMap[normalizedStatus] || { text: normalizedStatus, desc: '' }

        that.setData({
          name: t.name || '',
          status: normalizedStatus,
          statusText: st.text,
          type: t.type || 'league',
          format: t.format || '',
          startDate: t.startDate || '',
          endDate: t.endDate || '',
          location: t.location || '',
          description: t.description || '',
          coverUrl: t.coverUrl || t.coverImage || t.logo || t.logoUrl || '',
          organizerName: t.organizerName || ''
        })

        // ★ 信息同步：读取网页端有的字段
        var typeNames = { tournament: '赛会制', cup: '杯赛制', league: '联赛制', combined: '复合制' }
        var resolvedTypeText = typeNames[t.type] || t.type || ''
        var regUrl = t.regulationsUrl || ''
        var regFileId = typeof t.regulationsFileId === 'string' ? t.regulationsFileId : ''
        var regFileName = that.normalizeRegulationsFileName(t.regulationsFileName, '竞赛规程')
        var hasRegFile = !!(regUrl || regFileId)
        var createTimeText = ''
        if (t.createTime) {
          var ct2 = new Date(t.createTime)
          createTimeText = ct2.getFullYear() + '-' + String(ct2.getMonth()+1).padStart(2,'0') + '-' + String(ct2.getDate()).padStart(2,'0')
        }
        // 赛程天数
        var dayCount = 0
        if (t.startDate && t.endDate) {
          var sDate = new Date(t.startDate)
          var eDate = new Date(t.endDate)
          dayCount = Math.ceil((eDate - sDate) / (1000*60*60*24)) + 1
        }
        // 官网链接
    var websiteUrl = 'https://www.sxffootball.cn/t/' + that.data.tournamentId
        // rules 字符串内容
        var hasRulesStr = !!(t.rules && typeof t.rules === 'string')
        var rulesStrContent = hasRulesStr ? t.rules : ''
        // rules 对象
        var hasRulesObj = !!(t.rules && typeof t.rules === 'object')

        that.setData({
          logoUrl: t.logoUrl || t.logo || t.coverUrl || '',
          typeText: resolvedTypeText,
          registerDeadline: t.registerDeadline || '',
          createTimeText: createTimeText,
          maxTeams: t.maxTeams || 0,
          dayCount: dayCount,
          regulationsUrl: regUrl,
          regulationsFileId: regFileId,
          regulationsFileName: regFileName,
          hasRegulationsFile: hasRegFile,
          showRegulationsCard: hasRegFile,
          regulationsStatusText: hasRegFile ? '已上传的竞赛规程文档' : '未上传',
          regulationsActionText: hasRegFile ? '更换' : '上传',
          websiteUrl: websiteUrl,
          inviteSharePath: '/pages/tournament/signup/signup?id=' + that.data.tournamentId + '&from=share',
          hasRulesObject: hasRulesObj,
          hasRulesString: hasRulesStr,
          rulesStringContent: rulesStrContent
        })

        // ★ 读取比赛制式 + 每队人数上限（P0 功能：网页端设置后小程序同步显示）
        var resolvedFormat = t.matchFormat || '11side'
        var resolvedMax = that.resolveMaxPlayers(t)
        var kMax = t.knockoutMaxPlayers || 0
        var kEnabled = t.knockoutRosterEnabled || false
        var kOpen = t.knockoutRosterOpen || false
        var maxChanges = (t.maxRosterChanges !== undefined && t.maxRosterChanges !== null) ? t.maxRosterChanges : 3
        that.setData({
          matchFormat: resolvedFormat,
          maxPlayersPerTeam: resolvedMax,
          knockoutMaxPlayers: kMax,
          knockoutRosterEnabled: kEnabled,
          knockoutRosterOpen: kOpen,
          maxRosterChanges: maxChanges
        })
        that._updateFlags()

        // 关闭加载状态
        that.setData({ loading: false, errorMsg: '' })
        // 加载球队列表
        that.loadTeams()

        // 判断权限并加载数据
        try { that.checkPermissionAndLoadData(t) } catch(e) { console.error('[detail] 权限判断异常:', e) }
      },
      fail: function (err) {
        clearTimeout(_timeout)
        console.error('[detail] 加载赛事失败:', err)
        that.setData({ loading: false, errorMsg: '加载失败: ' + (err.errMsg || JSON.stringify(err)) })
      }
    })
  },

  checkPermissionAndLoadData: function (tournament) {
    var that = this
    var context = workspace.readContext() || {}
    var currentTournaments = context.tournaments || []
    var currentTournament = currentTournaments.find(function(item) {
      return item.id === that.data.tournamentId || item._id === that.data.tournamentId
    })
    var isOrganizer = !!(
      workspace.hasPermission('event.manage', context) &&
      currentTournament &&
      currentTournament.relation === 'hosted'
    )
    var accessibleTeamIds = workspace.getAccessibleTeamIds(context)
    var isCoach = false
    var myTeamId = ''
    var myTeamName = ''

    if (tournament.teams && tournament.teams.length > 0) {
      for (var i = 0; i < tournament.teams.length; i++) {
        var tt = tournament.teams[i]
        var teamId = tt.teamId || tt._id || ''
        if (accessibleTeamIds.indexOf(teamId) >= 0) {
          isCoach = true
          myTeamId = teamId
          myTeamName = tt.teamName || ''
          break
        }
      }
    }
    if (!isCoach && currentTournament && currentTournament.relation === 'participating' && accessibleTeamIds.length) {
      isCoach = true
      myTeamId = accessibleTeamIds[0]
      var currentTeams = context.teams || []
      var myTeam = currentTeams.find(function(item) { return item.id === myTeamId })
      myTeamName = myTeam ? myTeam.name : ''
    }

    that.setData({
      isOrganizer: isOrganizer,
      isCoach: isCoach,
      myTeamId: myTeamId,
      myTeamName: myTeamName,
      showRegulationsCard: isOrganizer || that.data.hasRegulationsFile
    })

    // 根据当前机构授权设置默认 Tab 和加载数据
    if (isOrganizer) {
      that.setData({ currentTab: 'teams' })
      that.loadAllData()
    } else if (isCoach) {
      that.setData({ currentTab: 'roster' })
      that.loadRosterInfo()
      that.loadScheduleInfo()
    } else {
      that.setData({ currentTab: 'schedule' })
      that.loadScheduleInfo()
      that.loadStats()
      that.loadStandings()
      that.loadTeams()
    }
  },

  loadTeams: function () {
    var that = this
    db.collection('tournament_teams')
      .where({ tournamentId: that.data.tournamentId })
      .orderBy('applyTime', 'asc')
      .get({
        success: function (res) {
          var list = res.data || []
          var approved = []
          var pending = []

          for (var i = 0; i < list.length; i++) {
            if (list[i].status === 'approved') {
              approved.push(list[i])
            } else if (list[i].status === 'pending') {
              pending.push(list[i])
            }
          }

          that.setData({
            teams: list,
            approvedTeams: approved,
            pendingTeams: pending
          })
          that._updateLens()
        },
        fail: function (err) {
          console.error('[detail] 加载球队失败:', err)
        }
      })
  },

  loadAllData: function () {
    this.loadRosterInfo()
    this.loadStats()
    this.loadStandings()
    this.loadScheduleInfo()
    this.loadTeams()
  },

  loadRosterInfo: function () {
    var that = this
    if (!that.data.isCoach || !that.data.myTeamId) return

    db.collection('rosters')
      .where({
        tournamentId: that.data.tournamentId,
        teamId: that.data.myTeamId
      })
      .limit(1)
      .get({
        success: function (res) {
          var roster = null
          if (res.data && res.data.length > 0) {
            roster = res.data[0]
          }

          if (!roster) {
            that.setData({
              rosterInfo: {
                status: 'not_submitted',
                statusText: '未提交参赛名单',
                statusDesc: '请编辑并提交本次赛事的正式参赛名单',
                submitted: false,
                isLocked: false,
                canEdit: true,
                canRequestModify: false,
                hasDraft: false,
                playerCount: 0
              },
              coachList: [],
              playerList: []
            })
          } else {
            var rs = roster.status || 'not_submitted'
            var sm = {
              not_submitted: { text: '未提交', desc: '请编辑并提交本次赛事的正式参赛名单', canEdit: true },
              drafting: { text: '编辑中', desc: '正在编辑参赛名单，请完成后提交', canEdit: true },
              submitted: { text: '已提交', desc: '名单已提交，等待主办方审核', canEdit: false },
              pending_approval: { text: '审核中', desc: '主办方正在审核您的参赛名单', canEdit: false },
              approved: { text: '已通过', desc: '参赛名单审核通过 ✓', canEdit: false, canRequestModify: true },
              confirmed: { text: '已确认', desc: '参赛名单已最终确认', canEdit: false },
              modification_requested: { text: '需修改', desc: '主办方要求修改参赛名单，请修改后重新提交', canEdit: true },
              rejected: { text: '被退回', desc: '参赛名单被退回，请修改后重新提交', canEdit: true }
            }
            var info = sm[rs] || sm.not_submitted

            var players = roster.players || []
            var coaches = roster.coaches || []

            that.setData({
              rosterInfo: {
                status: rs,
                statusText: info.text,
                statusDesc: info.desc,
                submitted: ['approved', 'confirmed'].indexOf(rs) >= 0,
                isLocked: !info.canEdit,
                canEdit: info.canEdit,
                canRequestModify: !!info.canRequestModify,
                hasDraft: players.length > 0,
                playerCount: players.length
              },
              coachList: coaches,
              playerList: players
            })
          }
          that._updateLens()
        },
        fail: function (err) {
          console.error('[detail] 加载参赛名单失败:', err)
        }
      })
  },

  loadStats: function () {
    var that = this
    db.collection('match_events')
      .where({ tournamentId: that.data.tournamentId })
      .count({
        success: function (cntRes) {
          if (cntRes.total === 0) {
            that.setData({ goalsRanking: [], assistsRanking: [] })
            that._updateLens()
            return
          }

          // 查询所有事件做统计
          db.collection('match_events')
            .where({ tournamentId: that.data.tournamentId })
            .limit(500)
            .get({
              success: function (evtsRes) {
                var evts = evtsRes.data || []
                var goalsMap = {}
                var assistsMap = {}

                for (var i = 0; i < evts.length; i++) {
                  var e = evts[i]
                  if (e.type === 'goal' && e.playerName) {
                    goalsMap[e.playerName] = (goalsMap[e.playerName] || 0) + 1
                  }
                  if (e.type === 'assist' && e.playerName) {
                    assistsMap[e.playerName] = (assistsMap[e.playerName] || 0) + 1
                  }
                }

                var goalsArr = []
                var assistsArr = []
                for (var k in goalsMap) {
                  if (goalsMap.hasOwnProperty(k)) {
                    goalsArr.push({ name: k, count: goalsMap[k] })
                  }
                }
                for (var k2 in assistsMap) {
                  if (assistsMap.hasOwnProperty(k2)) {
                    assistsArr.push({ name: k2, count: assistsMap[k2] })
                  }
                }

                // 排序取前10，预计算topClass
                goalsArr.sort(function (a, b) { return b.count - a.count })
                assistsArr.sort(function (a, b) { return b.count - a.count })

                var gFinal = []
                for (var gi = 0; gi < goalsArr.length && gi < 10; gi++) {
                  gFinal.push({
                    name: goalsArr[gi].name,
                    count: goalsArr[gi].count,
                    topClass: (gi < 3) ? 'top3' : ''
                  })
                }
                var aFinal = []
                for (var ai = 0; ai < assistsArr.length && ai < 10; ai++) {
                  aFinal.push({
                    name: assistsArr[ai].name,
                    count: assistsArr[ai].count,
                    topClass: (ai < 3) ? 'top3' : ''
                  })
                }

                that.setData({
                  goalsRanking: gFinal,
                  assistsRanking: aFinal
                })
                that._updateLens()
              }
            })
        }
      })
  },

  loadStandings: function () {
    var that = this
    if (that.data.format !== 'league' && that.data.type !== 'league') {
      that.setData({ standings: [] })
      that._updateLens()
      return
    }

    db.collection('standings')
      .where({ tournamentId: that.data.tournamentId })
      .orderBy('points', 'desc')
      .orderBy('goalDiff', 'desc')
      .get({
        success: function (res) {
          var arr = res.data || []
          that.setData({ standings: arr })
          that._updateLens()
        },
        fail: function () {
          that.setData({ standings: [] })
          that._updateLens()
        }
      })
  },

  loadScheduleInfo: function () {
    var that = this

    // 加载比赛列表
    db.collection('matches')
      .where({ tournamentId: that.data.tournamentId })
      .orderBy('matchTime', 'asc')
      .limit(200)
      .get({
        success: function (mRes) {
          var matches = mRes.data || []

          // 如果是教练视角，过滤本队比赛
          if (that.data.isCoach) {
            that.filterTeamMatches(matches)
          } else {
            that.setData({ matches: matches })
          }

          that._updateLens()
        },
        fail: function () {
          that.setData({ matches: [], teamMatches: [] })
          that._updateLens()
        }
      })

    // 加载分组/赛制信息
    db.collection('schedule_info')
      .where({ tournamentId: that.data.tournamentId })
      .limit(1)
      .get({
        success: function (sRes) {
          if (sRes.data && sRes.data.length > 0) {
            var info = sRes.data[0]
            var groups = (info.groups || []).map(function (g) {
              g._teamsLen = (g.teams || []).length
              return g
            })

            that.setData({
              scheduleInfo: {
                hasGroups: true,
                scheduleType: info.scheduleType || '',
                groups: groups,
                upperHalf: info.upperHalf || [],
                lowerHalf: info.lowerHalf || [],
                cupBracketSize: info.cupBracketSize || 0,
                cupByeCount: info.cupByeCount || 0,
                ranking: info.ranking || [],
                leagueLoopType: info.leagueLoopType || '',
                useGroups: info.useGroups || false,
                cupAdvanceCount: info.cupAdvanceCount || 0
              }
            })
          } else {
            that.setData({
              scheduleInfo: {
                hasGroups: false,
                scheduleType: '',
                groups: [],
                upperHalf: [],
                lowerHalf: [],
                cupBracketSize: 0,
                cupByeCount: 0,
                ranking: [],
                leagueLoopType: '',
                useGroups: false,
                cupAdvanceCount: 0
              }
            })
          }
        }
      })
  },

  filterTeamMatches: function (matches) {
    if (!matches) matches = this.data.matches
    var teamMatches = []
    var myTeamName = this.data.myTeamName

    for (var i = 0; i < matches.length; i++) {
      var m = matches[i]
      if (m.homeTeamName === myTeamName || m.awayTeamName === myTeamName) {
        teamMatches.push(m)
      }
    }

    this.setData({
      teamMatches: teamMatches,
      myTeamName: myTeamName
    })
    this._updateLens()
  },

  // ---- UI 操作 -----

  switchTab: function (e) {
    var tab = e.currentTarget.dataset.tab
    this.setData({ currentTab: tab })
  },

  onAddPlayer: function () {
    wx.navigateTo({
      url: '/pages/team/player-add/player-add?teamId=' + encodeURIComponent(this.data.myTeamId)
    })
  },

  onAddCoach: function () {
    if (!this.data.myTeamId) {
      wx.showToast({ title: '请先选择当前球队', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: '/pages/team/members/members?teamId=' + encodeURIComponent(this.data.myTeamId) + '&role=coach'
    })
  },

  onDeletePlayer: function (e) {
    var idx = e.currentTarget.dataset.index
    var that = this
    wx.showModal({
      title: '确认删除',
      content: '确定要删除该球员吗？',
      success: function (res) {
        if (res.confirm) {
          var players = that.data.playerList
          players.splice(idx, 1)
          that.setData({
            playerList: players,
            'rosterInfo.playerCount': players.length,
            'rosterInfo.hasDraft': players.length > 0
          })
          that._updateLens()
        }
      }
    })
  },

  onSubmitRoster: function () {
    var that = this
    var pl = that.data.playerList
    var cl = that.data.coachList

    if ((!pl || pl.length === 0) && (!cl || cl.length === 0)) {
      wx.showToast({ title: '请先添加球员或教练', icon: 'none' })
      return
    }

    // ★ 人数上限校验（P0 功能：超员拦截）
    var maxLimit = that.data.maxPlayersPerTeam || 35
    if (pl && pl.length > maxLimit) {
      wx.showToast({
        title: '超出大名单上限(' + maxLimit + '人)，请删除多余球员',
        icon: 'none',
        duration: 2500
      })
      return
    }

    wx.showLoading({ title: '提交中...' })

    var rosterData = {
      tournamentId: that.data.tournamentId,
      teamId: that.data.myTeamId,
      teamName: that.data.myTeamName,
      coaches: cl || [],
      players: pl || [],
      status: 'submitted',
      stage: 'group',
      submitTime: new Date(),
      updatedAt: new Date()
    }

    // 先查询是否已有记录（兼容历史数据无 stage 字段）
    db.collection('rosters')
      .where({
        tournamentId: that.data.tournamentId,
        teamId: that.data.myTeamId
      })
      .limit(1)
      .get({
        success: function (qRes) {
          if (qRes.data && qRes.data.length > 0) {
            // 更新
            db.collection('rosters').doc(qRes.data[0]._id).update({
              data: rosterData,
              success: function () {
                wx.hideLoading()
                wx.showToast({ title: '提交成功', icon: 'success' })
                that.loadRosterInfo()
              },
              fail: function () {
                wx.hideLoading()
                wx.showToast({ title: '提交失败', icon: 'none' })
              }
            })
          } else {
            // 新增
            db.collection('rosters').add({
              data: rosterData,
              success: function () {
                wx.hideLoading()
                wx.showToast({ title: '提交成功', icon: 'success' })
                that.loadRosterInfo()
              },
              fail: function () {
                wx.hideLoading()
                wx.showToast({ title: '提交失败', icon: 'none' })
              }
            })
          }
        }
      })
  },

  // ★ 提交第二阶段名单（P1 功能：淘汰赛阶段独立名单）
  onSubmitKnockoutRoster: function () {
    var that = this
    var pl = that.data.playerList
    var cl = that.data.coachList

    if (!that.data.knockoutRosterOpen) {
      wx.showToast({ title: '淘汰赛名单提交窗口尚未开启', icon: 'none' })
      return
    }

    if ((!pl || pl.length === 0) && (!cl || cl.length === 0)) {
      wx.showToast({ title: '请先添加球员或教练', icon: 'none' })
      return
    }

    // 按淘汰赛人数上限校验
    var kMax = that.resolveKnockoutMaxPlayers()
    if (pl && pl.length > kMax) {
      wx.showToast({
        title: '超出淘汰赛大名单上限(' + kMax + '人)，请删除多余球员',
        icon: 'none',
        duration: 2500
      })
      return
    }

    wx.showLoading({ title: '提交中...' })
    var rosterData = {
      tournamentId: that.data.tournamentId,
      teamId: that.data.myTeamId,
      teamName: that.data.myTeamName,
      coaches: cl || [],
      players: pl || [],
      status: 'submitted',
      stage: 'knockout',
      submitTime: new Date(),
      updatedAt: new Date()
    }

    // 查询是否已有第二阶段记录
    db.collection('rosters')
      .where({
        tournamentId: that.data.tournamentId,
        teamId: that.data.myTeamId,
        stage: 'knockout'
      })
      .limit(1)
      .get({
        success: function (qRes) {
          if (qRes.data && qRes.data.length > 0) {
            db.collection('rosters').doc(qRes.data[0]._id).update({
              data: rosterData,
              success: function () {
                wx.hideLoading()
                wx.showToast({ title: '第二阶段名单提交成功', icon: 'success' })
                that.loadRosterInfo()
              },
              fail: function () {
                wx.hideLoading()
                wx.showToast({ title: '提交失败', icon: 'none' })
              }
            })
          } else {
            db.collection('rosters').add({
              data: rosterData,
              success: function () {
                wx.hideLoading()
                wx.showToast({ title: '第二阶段名单提交成功', icon: 'success' })
                that.loadRosterInfo()
              },
              fail: function () {
                wx.hideLoading()
                wx.showToast({ title: '提交失败', icon: 'none' })
              }
            })
          }
        }
      })
  },

  // ★ 跳转换人申请页面（P1 功能）
  onNavigateToRosterChange: function () {
    if (!this.data.myTeamId) {
      wx.showToast({ title: '没有球队权限', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: '/pages/roster-change/roster-change?tournamentId=' + this.data.tournamentId +
           '&teamId=' + this.data.myTeamId
    })
  },

  onGenerateSchedule: function () {
    wx.navigateTo({
      url: '/pages/tournament/schedule/schedule?id=' + this.data.tournamentId
    })
  },

  onApproveTeam: function (e) {
    var teamId = e.currentTarget.dataset.id
    var that = this

    wx.showModal({
      title: '通过审核',
      content: '确定通过该球队的报名申请？',
      success: function (res) {
        if (res.confirm) {
          db.collection('tournament_teams').doc(teamId).update({
            data: { status: 'approved', approveTime: new Date() },
            success: function () {
              wx.showToast({ title: '已通过', icon: 'success' })
              that.loadTeams()
            }
          })
        }
      }
    })
  },

  onRejectTeam: function (e) {
    var teamId = e.currentTarget.dataset.id
    var that = this

    wx.showModal({
      title: '拒绝申请',
      content: '确定拒绝该球队的报名申请？',
      success: function (res) {
        if (res.confirm) {
          db.collection('tournament_teams').doc(teamId).update({
            data: { status: 'rejected', rejectTime: new Date() },
            success: function () {
              wx.showToast({ title: '已拒绝', icon: 'success' })
              that.loadTeams()
            }
          })
        }
      }
    })
  },

  onViewMatch: function (e) {
    var matchId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: '/pages/match/detail/detail?matchId=' + matchId
    })
  },

  onManageTeam: function () {
    wx.navigateTo({
      url: '/pages/team/detail/detail?teamId=' + encodeURIComponent(this.data.myTeamId)
    })
  },

  // 报名参赛
  goSignup: function (e) {
    var that = this
    var tid = that.data.tournamentId
    if (!tid) {
      wx.showToast({ title: '赛事ID缺失', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/tournament/signup/signup?id=' + tid })
  }
})
