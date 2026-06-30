// pages/profile/profile.js
// 璧涘皬铚?- 涓汉涓績锛堟暀缁冪 v2 鈥?寰呭姙浣撶郴锛?
Page({
  data: {
    userInfo: null,
    teamInfo: null,
    role: '',
    stats: null,
    teamsCount: 0,
    // 寰呭姙缁熻
    todoStats: {
      pending: 0,      // 涓诲姙鏂瑰彂缁欐垜鐨勫緟澶勭悊浠诲姟
      reviewing: 0,    // 鎴戞彁浜ょ殑绛夊緟瀹℃牳
      done: 0,         // 宸插畬鎴?      total: 0
    },
    // 璁剧疆瀵嗙爜寮圭獥
    setPasswordVisible: false,
    newPassword: '',
    confirmPassword: '',
    hasPassword: false
  },
  onLoad: function() {
    this.loadUserInfo()
    this.loadTeamInfo()
    this.loadTeamsCount()
    this.checkPasswordStatus()
    this.loadTodoStats()
  },

  onShow: function() {
    // 鍚屾鑷畾涔?tabBar 閫変腑鐘舵€?
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().syncSelected()
    }
    this.loadUserInfo()
    this.loadTeamInfo()
    this.loadTeamsCount()
    this.checkPasswordStatus()
    this.loadTodoStats()
  },

  // ===== 鍔犺浇鐢ㄦ埛淇℃伅 =====
  loadUserInfo: function() {
    var userInfo = wx.getStorageSync('userInfo')
    if (userInfo) {
      this.setData({ userInfo: userInfo })
    }
    // 鏄剧ず褰撳墠鐧诲綍鐨勬墜鏈哄彿鍜岃鑹诧紙璋冭瘯鐢級
    var phone = wx.getStorageSync('phoneNumber') || '鏈櫥褰?'
    var role = wx.getStorageSync('currentRole') || '鏈煡'
    console.log('[profile] 褰撳墠璐﹀彿:', phone, '瑙掕壊:', role, '瀹屾暣userInfo:', userInfo)
    this.setData({
      'currentPhone': phone,
      'currentRole': role,
      // 鈽?WXML 琛ㄨ揪寮忛搧寰嬶細涓嶈兘鍐?currentRole === 'xxx'锛屾敼涓洪璁＄畻甯冨皵鍊?
      isOrganizer: role === 'organizer',
      isCoach: role === 'coach',
      isReferee: role === 'referee'
    })
  },

  // ===== 鍔犺浇鐞冮槦淇℃伅 + 缁熻鏁版嵁 =====
  loadTeamInfo: function() {
    var that = this

    // 鈽?鍏堣鍙栫湡瀹炶鑹诧紙涓嶅啀纭紪鐮?coach锛?
    var realRole = (wx.getStorageSync('currentRole') || '').toLowerCase()

    // 涓诲姙鏂规病鏈夌悆闃熶俊鎭紝鐩存帴鐢ㄨ鑹叉樉绀?
    if (realRole === 'organizer') {
      that.setData({
        teamInfo: null,
        role: 'organizer'
      })
      that.loadOrganizerStats()
      return
    }

    // 鈽?浼樺厛鐢?home 椤甸潰缂撳瓨鐨?teamInfo锛堝鐞冮槦鍦烘櫙锛?
    var cachedTeamInfo = wx.getStorageSync('teamInfo')
    if (cachedTeamInfo && cachedTeamInfo._id) {
      that.setData({
        teamInfo: cachedTeamInfo,
        role: realRole || 'coach'
      })
      that.loadStats(cachedTeamInfo._id)
      return
    }

    // 鍏煎鏃ч€昏緫锛氭寜 currentTeamId 鏌?
    var teamId = wx.getStorageSync('currentTeamId')
    if (!teamId) return

    var db = wx.cloud.database()

    db.collection('teams').doc(teamId).get({
      success: function(res) {
        if (res.data) {
          that.setData({
            teamInfo: res.data,
            role: res.data.role || 'player'
          })
          that.loadStats(teamId)
        }
      },
      fail: function(err) {
        console.error('鍔犺浇鐞冮槦澶辫触:', err)
      }
    })
  },

  // ===== 涓诲姙鏂圭粺璁★紙璧涗簨鏁般€佺悆闃熸暟绛夛級=====
  loadOrganizerStats: function() {
    var that = this
    var db = wx.cloud.database()

    var stats = {
      playerCount: 0,
      tournamentCount: 0,
      matchCount: 0,
      pendingCount: 0
    }

    // 鏌ヤ富鍔炴柟鍒涘缓鐨勮禌浜嬫暟
    db.collection('tournaments').count({
      success: function(res) {
        stats.tournamentCount = res.total || 0
        that.setData({ stats: stats })
      },
      fail: function() {
        that.setData({ stats: stats })
      }
    })

    // 鏌ユ瘮璧涙€绘暟
    db.collection('matches').count({
      success: function(res) {
        stats.matchCount = res.total || 0
        that.setData({ stats: stats })
      },
      fail: function() {}
    })
  },

  // ===== 鍔犺浇鐞冮槦鏁伴噺锛堜粠缂撳瓨锛?=====
  loadTeamsCount: function() {
    var myTeams = wx.getStorageSync('myTeams') || []
    this.setData({ teamsCount: myTeams.length })
  },

  // 鍔犺浇缁熻锛堢悆鍛樻暟銆佽禌浜嬫暟銆佹瘮璧涙暟锛?
  loadStats: function(teamId) {
    var that = this
    var db = wx.cloud.database()
    var _ = db.command

    var stats = { playerCount: 0, tournamentCount: 0, matchCount: 0 }

    if (this.data.teamInfo && this.data.teamInfo.members) {
      stats.playerCount = this.data.teamInfo.members.length || 0
    }

    // 鏌ヨ鍙傝禌璧涗簨鏁帮紙鐢?tournament_teams 涓棿琛級
    db.collection('tournament_teams').where({
      teamId: teamId
    }).count({
      success: function(res) {
        stats.tournamentCount = res.total || 0
        that.setData({ stats: stats })
      },
      fail: function() {
        that.setData({ stats: stats })
      }
    })

    // 鏌ヨ姣旇禌鏁?
    db.collection('matches').where(
      _.or([
        { homeTeamId: teamId },
        { awayTeamId: teamId }
      ])
    ).count({
      success: function(res) {
        stats.matchCount = res.total || 0
        that.setData({ stats: stats })
      },
      fail: function() {
        that.setData({ stats: stats })
      }
    })

    if (stats.playerCount > 0) {
      that.setData({ stats: stats })
    }
  },

  // ===== 鍔犺浇寰呭姙浜嬮」缁熻 =====
  loadTodoStats: function() {
    var that = this
    // 鈽?浼樺厛浠庣紦瀛樼殑 teamInfo 鍙?teamId
    var cachedTeamInfo = wx.getStorageSync('teamInfo') || {}
    var teamId = cachedTeamInfo._id || wx.getStorageSync('currentTeamId') || ''
    var phoneNumber = wx.getStorageSync('phoneNumber') || ''

    if (!teamId && !phoneNumber) {
      return
    }

    var db = wx.cloud.database()

    // 鍒濆鍖栫粺璁℃暟鎹紙榛樿鍏?锛屼笉浼氬奖鍝峌I鏄剧ず锛?
    var todoStats = { pending: 0, reviewing: 0, done: 0, total: 0 }

    // 鈽?鐩存帴鐢ㄩ檷绾ф柟妗堬細浠?tournament_teams 浼扮畻寰呭姙
    // 锛坱eam_tasks 闆嗗悎鍙兘灏氭湭鍒涘缓锛岄伩鍏嶆姤閿欏共鎵扮敤鎴凤級
    that.loadTodoFromTournamentTeams(teamId)
  },

  // 浠?team_tasks 鍒嗙姸鎬佺粺璁¤鎯?
  loadTodoDetails: function(teamId, phoneNumber, openId) {
    var that = this
    var db = wx.cloud.database()
    var todoStats = { pending: 0, reviewing: 0, done: 0, total: 0 }

    // 骞惰鏌ヨ3绉嶇姸鎬?
    db.collection('team_tasks').where(
      db.command.and([
        db.command.or([
          { teamId: teamId },
          { targetPhone: phoneNumber },
          { targetOpenId: openId }
        ]),
        { status: 'pending' }
      ])
    ).count({
      success: function(r) {
        todoStats.pending = r.total || 0
        that.updateTodoStats(todoStats)
      }
    })

    db.collection('team_tasks').where(
      db.command.and([
        db.command.or([
          { teamId: teamId },
          { targetPhone: phoneNumber },
          { targetOpenId: openId }
        ]),
        { status: db.command.in(['reviewing', 'submitted', 'pending_approval']) }
      ])
    ).count({
      success: function(r) {
        todoStats.reviewing = r.total || 0
        that.updateTodoStats(todoStats)
      }
    })

    db.collection('team_tasks').where(
      db.command.and([
        db.command.or([
          { teamId: teamId },
          { targetPhone: phoneNumber },
          { targetOpenId: openId }
        ]),
        { status: db.command.in(['approved', 'completed', 'rejected', 'done']) }
      ])
    ).count({
      success: function(r) {
        todoStats.done = r.total || 0
        that.updateTodoStats(todoStats)
      }
    })
  },

  // 闄嶇骇鏂规锛氫粠 tournament_teams 浼扮畻寰呭姙鐘舵€?
  loadTodoFromTournamentTeams: function(teamId) {
    var that = this
    var db = wx.cloud.database()
    var todoStats = { pending: 0, reviewing: 0, done: 0, total: 0 }

    // 鐢?tournament_teams 鐨?status 瀛楁浼扮畻
    // pending 鈫?寰呭鏍革紙鎶ュ悕寰呮壒锛?    // approved 鈫?宸查€氳繃锛堝彲瑙嗕负宸插畬鎴愶級
    db.collection('tournament_teams').where({
      teamId: teamId,
      status: 'pending'
    }).count({
      success: function(r) {
        todoStats.reviewing = r.total || 0
        that.updateTodoStats(todoStats)
      },
      fail: function() {}
    })

    db.collection('tournament_teams').where({
      teamId: teamId,
      status: db.command.in(['approved', 'confirmed', 'active'])
    }).count({
      success: function(r) {
        todoStats.done = r.total || 0
        that.updateTodoStats(todoStats)
      },
      fail: function() {}
    })

    // 寤惰繜璁剧疆鍒濆鍊?
    setTimeout(function() {
      that.updateTodoStats(todoStats)
    }, 500)
  },

  // 鏇存柊寰呭姙缁熻鍒扮晫闈?
  updateTodoStats: function(todoStats) {
    todoStats.total = (todoStats.pending || 0) + (todoStats.reviewing || 0)
    this.setData({
      todoStats: todoStats,
      'stats.pendingCount': todoStats.total
    })
  },

  // ===== 鐐瑰嚮寰呭姙鍗＄墖 =====
  onTodoTap: function(e) {
    var type = e.currentTarget.dataset.type
    var title = ''

    switch (type) {
      case 'pending':
        title = '待处理'
        break
      case 'reviewing':
        title = '待审核'
        break
      case 'done':
        title = '已完成'
        break
      default:
        title = '全部'
    }

    // 璺宠浆鍒板緟鍔炲垪琛ㄩ〉锛堝鏋滃瓨鍦級锛屽惁鍒欐彁绀哄紑鍙戜腑
    wx.showToast({
      title: title + '功能开发中',
      icon: 'none'
    })

    // TODO: 姝ｅ紡鐗堣烦杞?    // wx.navigateTo({ url: '/pages/todo/todo-list?type=' + type })
  },

  // ===== 妫€鏌ユ槸鍚﹀凡璁剧疆瀵嗙爜 =====
  checkPasswordStatus: function() {
    var hasPassword = wx.getStorageSync('hasPassword') === 'true'
    this.setData({ hasPassword: hasPassword })
  },

  // ===== 椤甸潰璺宠浆 =====
  goToPage: function(e) {
    var url = e.currentTarget.dataset.url
    if (url) {
      wx.navigateTo({ url: url })
    }
  },

  goToInfo: function() {
    wx.navigateTo({ url: '/pages/profile/info/info' })
  },

  goToTournamentCenter: function() {
    wx.switchTab({ url: '/pages/tournament-center/tournament-center' })
  },

  onViewIdentity: function() {
    wx.navigateTo({ url: '/pages/identity/identity' })
  },

  // 切换身份：弹出身份选择器，切换后重加载到首页
  onSwitchRole: function() {
    var that = this
    var currentRole = wx.getStorageSync('currentRole') || 'coach'
    var roleNames = {
      organizer: '赛事主办方',
      coach: '球队教练',
      referee: '裁判'
    }
    var itemList = []
    var roleKeys = []

    // 过滤掉当前身份，显示其他可选身份
    var allRoles = [
      { key: 'organizer', name: '赛事主办方' },
      { key: 'coach', name: '球队教练' },
      { key: 'referee', name: '裁判' }
    ]

    allRoles.forEach(function(r) {
      if (r.key !== currentRole) {
        itemList.push(r.name)
        roleKeys.push(r.key)
      }
    })

    if (itemList.length === 0) {
      wx.showToast({ title: '暂无其他身份可切换', icon: 'none' })
      return
    }

    wx.showActionSheet({
      itemList: itemList,
      success: function(res) {
        var newRole = roleKeys[res.tapIndex]
        if (newRole) {
          // 更新身份并清除相关缓存
          wx.setStorageSync('currentRole', newRole)
          // 清除球队相关缓存，让新身份重新加载
          wx.removeStorageSync('teamInfo')
          wx.removeStorageSync('myTeams')
          // 重新启动到首页
          wx.reLaunch({ url: '/pages/home/home' })
        }
      }
    })
  },

  // ===== 鍒囨崲/鍔犲叆鐞冮槦 =====
  onSwitchTeam: function() {
    wx.navigateTo({ url: '/pages/team/list/list' })
  },

  // ===== 璁剧疆瀵嗙爜寮圭獥 =====
  showSetPasswordModal: function() {
    this.setData({
      setPasswordVisible: true,
      newPassword: '',
      confirmPassword: ''
    })
  },

  hideSetPasswordModal: function() {
    this.setData({ setPasswordVisible: false })
  },

  preventBubble: function() {},

  onPasswordInput: function(e) {
    var field = e.currentTarget.dataset.field
    var value = e.detail.value
    var obj = {}
    obj[field] = value
    this.setData(obj)
  },

  confirmSetPassword: function() {
    var newPassword = this.data.newPassword
    var confirmPassword = this.data.confirmPassword

    if (!newPassword || newPassword.length < 8) {
      wx.showToast({ title: '密码至少8位', icon: 'none' })
      return
    }

    var hasUpper = /[A-Z]/.test(newPassword)
    var hasLower = /[a-z]/.test(newPassword)
    var hasDigit = /\d/.test(newPassword)

    if (!hasUpper || !hasLower || !hasDigit) {
      wx.showToast({ title: '需包含大写+小写+数字', icon: 'none' })
      return
    }

    if (newPassword !== confirmPassword) {
      wx.showToast({ title: '两次密码不一致', icon: 'none' })
      return
    }

    wx.showLoading({ title: '设置中...' })
    var that = this

    wx.cloud.callFunction({
      name: 'emailLogin',
      data: {
        action: 'setPassword',
        password: newPassword
      },
      success: function(res) {
        wx.hideLoading()
        if (res.result && res.result.success) {
          wx.showToast({ title: '密码设置成功', icon: 'success' })
          wx.setStorageSync('hasPassword', 'true')
          that.setData({ setPasswordVisible: false, hasPassword: true })
        } else {
          wx.showToast({ title: (res.result && res.result.error) || '设置失败', icon: 'none' })
        }
      },
      fail: function(err) {
        wx.hideLoading()
        console.error('璁剧疆瀵嗙爜澶辫触:', err)
        wx.showToast({ title: '设置失败', icon: 'none' })
      }
    })
  },

  // ===== 閫€鍑虹櫥褰?=====
  onLogout: function() {
    var that = this
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      confirmColor: '#E53935',
      success: function(res) {
        if (res.confirm) {
          wx.clearStorageSync()
          // 鈽?璁剧疆"涓诲姩閫€鍑?鏍囧織锛岄槻姝?login.js 鑷姩鐧诲綍
          wx.setStorageSync('userLoggedOut', 'true')
          wx.reLaunch({ url: '/pages/login/login' })
        }
      }
    })
  }
})










