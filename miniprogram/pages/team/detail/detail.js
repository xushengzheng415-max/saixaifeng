// pages/team/detail/detail.js
// 青训版本 - 球队详情页

Page({


  _updateLens: function() {
    var data = this.data;
    var _pl = data.players ? data.players.length : 0;
    if (this.data.PlayersLen !== _pl) { this.setData({ 'PlayersLen': _pl}); }
  },

  data: {
    teamId: '',
    team: null,
    players: [],
    stats: {
      totalPlayers: 0,
      gk: 0,
      df: 0,
      mf: 0,
      fw: 0
    },
    role: '',
    loading: true
  },

  onLoad(options) {
    const teamId = options.id || wx.getStorageSync('currentTeamId')
    if (teamId) {
      this.setData({ teamId })
      this.loadTeamDetail(teamId)
    } else {
      wx.showToast({ title: '参数错误', icon: 'none' })
      wx.navigateBack()
    }
  },

  // 加载球队详情
  async loadTeamDetail(teamId) {
    this.setData({ loading: true })
    
    try {
      const db = wx.cloud.database()
      
      // 加载球队信息
      const teamRes = await db.collection('teams').doc(teamId).get()
      
      if (teamRes.data) {
        const openId = wx.getStorageSync('openid')
        const role = teamRes.data.role || 'player'
        
        // 加载球员列表
        const playersRes = await db.collection('players')
          .where({ teamId })
          .orderBy('jerseyNumber', 'asc')
          .get()
        
        const players = playersRes.data || []
        
        // 预计算每个球员的姓名首字母（WXML不支持数组索引）
        for (var pi = 0; pi < players.length; pi++) {
          var pname = players[pi].name || ''
          players[pi].nameFirstLetter = pname.length > 0 ? pname.charAt(0) : '?'
        }
        
        // 统计各位置人数
        const stats = {
          totalPlayers: players.length,
          gk: players.filter(p => p.position === 'GK').length,
          df: players.filter(p => p.position === 'DF').length,
          mf: players.filter(p => p.position === 'MF').length,
          fw: players.filter(p => p.position === 'FW').length
        }
        
        this.setData({
          team: teamRes.data,
          shortName: teamRes.data.shortName || teamRes.data.name || '',
          players,
          stats,
          role,
          loading: false
        })
      }
    } catch (err) {
      console.error('加载球队详情失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  // 添加球员
  onAddPlayer() {
    wx.navigateTo({
      url: '/pages/team/player-add/player-add'
    })
  },

  // 查看球员详情
  onViewPlayer(e) {
    const playerId = e.currentTarget.dataset.id
    if (!playerId) {
      wx.showToast({ title: '未找到球员信息', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: `/pages/team/player-detail/player-detail?id=${encodeURIComponent(playerId)}`
    })
  },

  // 复制球队代码
  onCopyCode() {
    const code = this.data.team.teamCode
    if (code) {
      wx.setClipboardData({
        data: code,
        success: () => {
          wx.showToast({ title: '已复制', icon: 'success' })
        }
      })
    }
  },

  // 编辑球队
  onEditTeam() {
    wx.navigateTo({
      url: '/pages/guide/team-info/team-info'
    })
  },

  // 提交比赛名单
  onSubmitSquad() {
    wx.navigateTo({
      url: '/pages/match/squad/squad'
    })
  },

  // 返回
  onBack() {
    wx.navigateBack()
  }
})
