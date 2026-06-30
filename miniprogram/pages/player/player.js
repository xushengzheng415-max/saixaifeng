// pages/player/player.js - 球员管理（直接调用云数据库）
Page({


  _updateLens: function() {
    var data = this.data;
    var _pl = data.players ? data.players.length : 0;
    if (this.data.PlayersLen !== _pl) { this.setData({ 'PlayersLen': _pl}); }
  },

  data: {
    players: [],
    teamId: '',
    teamName: '',
    hasMore: false,
    page: 1,
    pageSize: 20,
    searchKey: ''
  },

  onLoad(options) {
    if (options.teamId) {
      this.setData({ 
        teamId: options.teamId,
        role: getApp().globalData.userRole || 'coach'
      })
      this.loadTeamName(options.teamId)
    }
  },

  onShow() {
    if (this.data.teamId) {
      this.loadPlayers()
    }
  },

  // 加载球队名称
  async loadTeamName(teamId) {
    try {
      const db = wx.cloud.database()
      const res = await db.collection('teams').doc(teamId).get()
      this.setData({ teamName: res.data.name })
      wx.setNavigationBarTitle({ title: res.data.name + ' - 球员管理' })
    } catch (err) {
      console.error('加载球队失败:', err)
    }
  },

  // 加载球员列表
  async loadPlayers(loadMore = false) {
    if (!loadMore) {
      this.setData({ page: 1 })
    }

    try {
      const db = wx.cloud.database()
      let query = db.collection('players')
        .where({ teamId: this.data.teamId })
        .orderBy('jerseyNumber', 'asc')
        .skip((this.data.page - 1) * this.data.pageSize)
        .limit(this.data.pageSize)

      const result = await query.get()
      const players = (result.data || []).map(function(item) {
        return Object.assign({}, item, {
          showBindStatus: item.isCreatedByCoach && !item.isBound
        })
      })

      if (loadMore) {
        this.setData({
          players: [...this.data.players, ...players],
          hasMore: players.length >= this.data.pageSize
        })
      } else {
        this.setData({
          players: players,
          hasMore: players.length >= this.data.pageSize
        })
      }
    } catch (err) {
      console.error('加载球员失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // 搜索球员
  onSearchInput(e) {
    this.setData({ searchKey: e.detail.value })
  },

  // 加载更多
  onReachBottom() {
    if (this.data.hasMore) {
      this.setData({ page: this.data.page + 1 })
      this.loadPlayers(true)
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadPlayers().then(() => wx.stopPullDownRefresh())
  },

  // 添加球员
  addPlayer() {
    wx.navigateTo({
      url: `/pages/player/detail?teamId=${this.data.teamId}`
    })
  },

  // 编辑球员
  editPlayer(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/player/detail?teamId=${this.data.teamId}&playerId=${id}`
    })
  },

  // 删除球员
  deletePlayer(e) {
    const playerId = e.currentTarget.dataset.id
    const playerName = e.currentTarget.dataset.name

    wx.showModal({
      title: '确认删除',
      content: `确定要删除球员「${playerName}」吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            const db = wx.cloud.database()
            await db.collection('players').doc(playerId).remove()
            wx.showToast({ title: '删除成功', icon: 'success' })
            this.loadPlayers()
          } catch (err) {
            wx.showToast({ title: '删除失败', icon: 'none' })
          }
        }
      }
    })
  },

  // 调用球员手机号
  callPlayer(e) {
    const phone = e.currentTarget.dataset.phone
    if (phone) {
      wx.makePhoneCall({ phoneNumber: phone })
    }
  },

  // 返回球队页
  goBack() {
    wx.navigateBack()
  }
})