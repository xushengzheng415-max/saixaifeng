// pages/match/squad/squad.js
// 首发阵容设置 - 支持5/7/8/11人制

Page({
  _updateLens: function() {
    var data = this.data;
    var _pl = data.players ? data.players.length : 0;
    if (this.data.PlayersLen !== _pl) { this.setData({ 'PlayersLen': _pl}); }
    var _sp = data.startingPlayers ? data.startingPlayers.length : 0;
    if (this.data.StartingPlayersLen !== _sp) { this.setData({ 'StartingPlayersLen': _sp}); }
  },

  data: {
    matchId: '',
    match: null,
    players: [],
    startingPlayers: [],  // 首发球员ID数组
    startingByPosition: {    // 按位置分组的首发球员
      GK: [],
      DF: [],
      MF: [],
      FW: []
    },
    minPlayers: 11,       // 首发人数（根据赛制：5/7/8/11）
    formatText: '11人制', // 赛制文本
    loading: true,
    saving: false,
    showPlayerCard: false,  // 是否显示球员卡弹窗
    currentPlayer: null,     // 当前查看的球员
    teamLogoUrl: '',        // 队徽URL
    positionCount: {        // 各位置人数统计
      GK: 0,
      DF: 0,
      MF: 0,
      FW: 0
    }
  },

  onLoad(options) {
    const matchId = options.matchId || ''
    this.setData({ matchId })
    
    if (matchId) {
      this.loadMatch(matchId)
      this.loadTeamPlayers()
      this.loadStartingPlayers(matchId)
    } else {
      this.loadUpcomingMatch()
    }
  },

  // 加载比赛信息
  async loadMatch(matchId) {
    try {
      const db = wx.cloud.database()
      const res = await db.collection('matches').doc(matchId).get()
      
      if (res.data) {
        const match = res.data
        const minPlayers = match.minPlayers || 11
        const formatText = this.getFormatText(minPlayers)
        
        this.setData({
          match,
          minPlayers,
          formatText
        })
      }
    } catch (err) {
      console.error('加载比赛信息失败:', err)
    }
  },

  // 加载即将进行的比赛
  async loadUpcomingMatch() {
    try {
      const db = wx.cloud.database()
      const teamId = wx.getStorageSync('currentTeamId')
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      
      const res = await db.collection('matches')
        .where({
          teamId,
          matchDate: db.command.gte(today),
          status: 'pending'
        })
        .orderBy('matchDate', 'asc')
        .limit(1)
        .get()
      
      if (res.data && res.data.length > 0) {
        const match = res.data[0]
        const minPlayers = match.minPlayers || 11
        const formatText = this.getFormatText(minPlayers)
        
        this.setData({
          matchId: match._id,
          match,
          minPlayers,
          formatText
        })
        this.loadStartingPlayers(match._id)
      }
      
      this.loadTeamPlayers()
    } catch (err) {
      console.error('加载比赛信息失败:', err)
      this.setData({ loading: false })
    }
  },

  // 加载本队球员
  async loadTeamPlayers() {
    try {
      const db = wx.cloud.database()
      const teamId = wx.getStorageSync('currentTeamId')
      
      const res = await db.collection('players')
        .where({ teamId })
        .orderBy('jerseyNumber', 'asc')
        .get()
      
      // 统计各位置人数
      const positionCount = { GK: 0, DF: 0, MF: 0, FW: 0 }
      res.data.forEach(player => {
        const pos = player.position || 'FW'
        if (positionCount.hasOwnProperty(pos)) {
          positionCount[pos]++
        }
      })
      
      this.setData({
        players: res.data || [],
        positionCount,
        loading: false
      })
      this._updatePlayerFlags()
    } catch (err) {
      console.error('加载球员列表失败:', err)
      this.setData({ loading: false })
    }
  },

  // 加载已保存的首发阵容
  async loadStartingPlayers(matchId) {
    try {
      const db = wx.cloud.database()
      const res = await db.collection('squads')
        .where({ matchId })
        .get()
      
      if (res.data && res.data.length > 0) {
        const squad = res.data[0]
        const startingPlayers = squad.playerIds || []
        this.setData({ startingPlayers })
        this.updateStartingByPosition()
        this._updatePlayerFlags()
      }
    } catch (err) {
      console.error('加载首发阵容失败:', err)
    }
  },

  // 切换球员的首发状态
  onToggleStarting(e) {
    const playerId = e.currentTarget.dataset.id
    const { startingPlayers, players, minPlayers } = this.data
    
    const index = startingPlayers.indexOf(playerId)
    
    if (index > -1) {
      // 取消首发
      startingPlayers.splice(index, 1)
    } else {
      // 设为首发
      if (startingPlayers.length >= minPlayers) {
        wx.showToast({
          title: `首发最多${minPlayers}人`,
          icon: 'none'
        })
        return
      }
      startingPlayers.push(playerId)
    }
    
    this.setData({ startingPlayers })
    this.updateStartingByPosition()
    this._updatePlayerFlags()
  },

  // 检查球员是否首发
  isStarting(playerId) {
    return this.data.startingPlayers.indexOf(playerId) > -1
  },

  // 预计算每个球员的 isStarting 标志（WXML不支持方法调用）
  _updatePlayerFlags: function() {
    var players = this.data.players || []
    var startingPlayers = this.data.startingPlayers || []
    var updated = false
    for (var i = 0; i < players.length; i++) {
      var wasStarting = players[i].isStarting
      var nowStarting = startingPlayers.indexOf(players[i]._id) > -1
      if (wasStarting !== nowStarting) {
        players[i].isStarting = nowStarting
        updated = true
      }
    }
    if (updated) {
      this.setData({ players: players })
    }
  },

  // 更新按位置分组的首发球员
  updateStartingByPosition() {
    const { startingPlayers, players } = this.data
    const startingByPosition = { GK: [], DF: [], MF: [], FW: [] }
    
    // 先找到所有首发球员的详细信息
    const startingPlayerMap = {}
    players.forEach(p => {
      if (startingPlayers.indexOf(p._id) > -1) {
        startingPlayerMap[p._id] = p
      }
    })
    
    // 按位置分组
    startingPlayers.forEach(playerId => {
      const player = startingPlayerMap[playerId]
      if (player) {
        const pos = player.position || 'FW'
        if (startingByPosition[pos]) {
          startingByPosition[pos].push(player)
        }
      }
    })
    
    this.setData({ startingByPosition })
  },

  // 显示球员卡详情
  onShowPlayerCard(e) {
    const player = e.currentTarget.dataset.player
    this.setData({
      showPlayerCard: true,
      currentPlayer: player
    })
  },

  // 关闭球员卡弹窗
  onClosePlayerCard() {
    this.setData({
      showPlayerCard: false,
      currentPlayer: null
    })
  },

  // 阻止冒泡
  preventBubble() {
    // 阻止事件冒泡
  },

  // 清空首发阵容
  onClearStarting() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空所有首发球员吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            startingPlayers: [],
            startingByPosition: { GK: [], DF: [], MF: [], FW: [] }
          })
          this._updatePlayerFlags()
        }
      }
    })
  },

  // 跳转到添加球员页面
  navigateToAddPlayer() {
    wx.navigateTo({
      url: '/pages/team/player-add/player-add'
    })
  },

  // 提交首发阵容
  async onSubmitSquad() {
    const { startingPlayers, matchId, minPlayers } = this.data
    
    if (startingPlayers.length < minPlayers) {
      wx.showToast({
        title: `至少选择${minPlayers}人首发`,
        icon: 'none'
      })
      return
    }
    
    this.setData({ saving: true })
    
    try {
      const db = wx.cloud.database()
      const teamId = wx.getStorageSync('currentTeamId')
      const openId = wx.getStorageSync('openid')
      
      // 检查是否已存在记录
      const existRes = await db.collection('squads')
        .where({ matchId })
        .get()
      
      if (existRes.data && existRes.data.length > 0) {
        // 更新首发阵容
        await db.collection('squads').doc(existRes.data[0]._id).update({
          data: {
            playerIds: startingPlayers,
            updateTime: new Date().toLocaleString()
          }
        })
      } else {
        // 创建新记录
        await db.collection('squads').add({
          data: {
            matchId,
            teamId,
            playerIds: startingPlayers,
            createTime: new Date().toLocaleString(),
            updateTime: new Date().toLocaleString(),
            creator: openId
          }
        })
      }
      
      wx.showToast({
        title: '首发阵容已保存',
        icon: 'success'
      })
      
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      
    } catch (err) {
      console.error('保存首发阵容失败:', err)
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
    }
    
    this.setData({ saving: false })
  },

  // 根据人数获取赛制文本
  getFormatText(minPlayers) {
    const formatMap = {
      5: '5人制',
      7: '7人制',
      8: '8人制',
      11: '11人制'
    }
    return formatMap[minPlayers] || `${minPlayers}人制`
  }
})
