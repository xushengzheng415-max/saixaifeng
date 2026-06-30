// pages/player/detail/detail.js
// 青训版本 - 球员资料详情页（简化版身份卡）

Page({
  data: {
    playerId: '',
    player: null,
    loading: true
  },

  onLoad(options) {
    const playerId = options.id || options.playerId || ''
    this.setData({ playerId })
    
    if (playerId) {
      this.loadPlayerDetail(playerId)
    } else {
      wx.showToast({ title: '参数错误', icon: 'none' })
      wx.navigateBack()
    }
  },

  // 加载球员详情
  async loadPlayerDetail(playerId) {
    this.setData({ loading: true })
    
    try {
      const db = wx.cloud.database()
      const res = await db.collection('players').doc(playerId).get()
      
      if (res.data) {
        const player = res.data
        
        // 格式化位置显示
        const positionMap = {
          'GK': '守门员',
          'DF': '后卫',
          'MF': '中场',
          'FW': '前锋'
        }
        player.positionText = positionMap[player.position] || player.position
        
        // 格式化性别
        player.genderText = player.gender === 'male' ? '男' : '女'
        
        // 计算年龄
        if (player.birthDate) {
          player.age = this.calculateAge(player.birthDate)
        }
        
        this.setData({
          player,
          loading: false
        })
      }
    } catch (err) {
      console.error('加载球员详情失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  // 计算年龄
  calculateAge(birthDate) {
    const birth = new Date(birthDate)
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    const monthDiff = today.getMonth() - birth.getMonth()
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--
    }
    
    return age
  },

  // 预览照片
  onPreviewPhoto() {
    const photoUrl = this.data.player && this.data.player.photoUrl
    if (photoUrl) {
      wx.previewImage({
        urls: [photoUrl],
        current: photoUrl
      })
    }
  },

  // 拨打联系人电话
  onCallContact() {
    const phone = this.data.player && this.data.player.contactPhone
    if (phone) {
      wx.makePhoneCall({
        phoneNumber: phone
      })
    }
  },

  // 编辑球员（仅教练/创建者可编辑）
  onEditPlayer() {
    const playerId = this.data.playerId
    wx.navigateTo({
      url: `/pages/team/player-edit/player-edit?id=${playerId}`
    })
  },

  // 返回
  onBack() {
    wx.navigateBack()
  }
})
