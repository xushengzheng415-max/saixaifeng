// pages/my-cards/detail.js
// 球员卡详情页 - 显示单个球员的完整信息

Page({
  data: {
    playerInfo: null,
    isLoading: true
  },

  onLoad: function(options) {
    const playerId = options.playerId || options.id
    if (playerId) {
      this.loadPlayerDetails(playerId)
    } else {
      console.error('缺少球员ID参数')
      wx.showToast({
        title: '参数错误',
        icon: 'none',
        duration: 2000
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 2000)
    }
  },

  // 加载球员详细信息
  async loadPlayerDetails(playerId) {
    try {
      wx.showLoading({ title: '加载中...' })
      
      const db = wx.cloud.database()
      const res = await db.collection('players').doc(playerId).get()
      
      if (res.data) {
        const playerName = res.data.name || '未知'
        const playerData = {
          _id: res.data._id,
          name: playerName,
          nameFirstChar: playerName ? playerName.charAt(0) : '?',
          nameUpper: playerName ? playerName.toUpperCase() : '',
          number: res.data.jerseyNumber || '',
          position: res.data.position || '',
          height: res.data.height || '',
          weight: res.data.weight || '',
          jerseyName: res.data.jerseyName || '',
          nationality: res.data.nationality || '中国',
          avatar: res.data.photo || '',
          teamLogo: res.data.teamLogo || '',
          cardBg: this.getCardBg(res.data)
        }
        
        this.setData({
          playerInfo: playerData,
          isLoading: false
        })
      } else {
        throw new Error('球员信息未找到')
      }
    } catch (error) {
      console.error('加载球员详情失败:', error)
      this.setData({ isLoading: false })
      
      wx.showModal({
        title: '加载失败',
        content: error.message || '无法加载球员信息',
        showCancel: false,
        confirmText: '返回',
        success: () => {
          wx.navigateBack()
        }
      })
    } finally {
      wx.hideLoading()
    }
  },

  // 根据球员数据获取对应卡片背景颜色
  getCardBg(player) {
    const age = player.age || 0
    
    if (age >= 18) {
      return 'gold'
    } else if (age >= 16) {
      return 'silver'
    } else {
      return 'bronze'
    }
  },

  // 分享球员卡
  shareCard() {
    wx.showToast({
      title: '分享功能开发中',
      icon: 'none',
      duration: 2000
    })
  },

  // 编辑球员信息
  editCard() {
    if (this.data.playerInfo) {
      wx.navigateTo({
        url: `/pages/player/detail/detail?playerId=${this.data.playerInfo._id}`
      })
    }
  },

  // 页面分享
  onShareAppMessage: function() {
    const player = this.data.playerInfo
    return {
      title: player ? `查看${player.name}的球员卡` : '我的球员卡',
      path: `/pages/player/detail/detail?playerId=${this.data.playerInfo ? this.data.playerInfo._id : ''}`
    }
  },

  // 分享到朋友圈
  onShareTimeline: function() {
    const player = this.data.playerInfo
    return {
      title: player ? `${player.name}的球员卡 - 麦部足球赛事系统` : '我的球员卡',
      imageUrl: '/images/card-preview.png'
    }
  }
})
