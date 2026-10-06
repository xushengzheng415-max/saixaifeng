// pages/my-cards/my-cards.js
// 球员卡展示页 - 从微信云数据库动态获取数据

Page({
  data: {
    players: []
  },

  onLoad: function(options) {
    // 页面加载时获取数据
    this.loadPlayers()
  },

  onShow: function() {
    // 页面显示时重新加载数据，确保数据最新
    this.loadPlayers()
  },

  // 加载球员数据
  async loadPlayers() {
    try {
      wx.showLoading({ title: '加载中...' })

      const db = wx.cloud.database()
      const res = await db.collection('players').where({
        teamId: '', // 暂不限制球队，显示所有球员
        isBound: true // 只显示已绑定的球员
      }).orderBy('createTime', 'desc').get()

      if (res.data.length > 0) {
        const players = res.data.map(player => {
          var pName = player.name || '未知'
          return {
            _id: player._id,
            name: pName,
            nameFirstChar: pName ? pName.charAt(0) : '?',
            nameUpper: pName ? pName.toUpperCase() : '',
          number: player.jerseyNumber || '',
          position: player.position || '',
          height: player.height || '',
          weight: player.weight || '',
          jerseyName: player.jerseyName || '',
          nationality: player.nationality || '中国',
          avatar: player.photo || '',
          teamLogo: player.teamLogo || '',
          cardBg: this.getCardBg(player)
          }
        })

        this.setData({
          players: players
        })
      } else {
        this.setData({
          players: []
        })
      }
    } catch (error) {
      console.error('加载球员数据失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none',
        duration: 2000
      })
      this.setData({
        players: []
      })
    } finally {
      wx.hideLoading()
    }
  },

  // 根据球员数据获取对应卡片背景颜色
  getCardBg(player) {
    // 简单的卡片等级逻辑（可根据实际需求调整）
    const age = player.age || 0
    
    if (age >= 18) {
      return 'gold' // 成年球员为金卡
    } else if (age >= 16) {
      return 'silver' // 青年球员为银卡
    } else {
      return 'bronze' // 少年球员为铜卡
    }
  },

  // 刷新数据
  refreshData() {
    this.loadPlayers()
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadPlayers()
  },

  // 点击球员卡事件（可扩展查看详情功能）
  onCardTap(e) {
    const playerId = e.currentTarget.dataset.playerId
    console.log('点击球员卡:', playerId)
  }
})
