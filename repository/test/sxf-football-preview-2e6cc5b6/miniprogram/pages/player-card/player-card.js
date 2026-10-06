// pages/player-card/player-card.js
// 球员卡展示页 - 兼容 PC 端与小程序端球员字段
Page({
  data: {
    players: [],
    PlayersLen: 0,
    isLoading: true
  },

  onLoad: function() {
    this.loadPlayers()
  },

  onShow: function() {
    this.loadPlayers()
  },

  normalizePlayer: function(player, teamName) {
    const tier = null

    const bgMap = {
      bronze: 'cloud://cloud1-7g8ckb3c7815a011.636c-cloud1-7g8ckb3c7815a011-1419431905/player-cards/bronze-card.png',
      silver: 'cloud://cloud1-7g8ckb3c7815a011.636c-cloud1-7g8ckb3c7815a011-1419431905/player-cards/silver-card.png',
      gold: 'cloud://cloud1-7g8ckb3c7815a011.636c-cloud1-7g8ckb3c7815a011-1419431905/player-cards/gold-card.png'
    }

    return {
      ...player,
      photoUrl: player.photoUrl || player.photo || '',
      photo: player.photo || player.photoUrl || '',
      birthday: player.birthday || player.birthDate || '',
      birthDate: player.birthDate || player.birthday || '',
      teamId: player.teamId || player.teamCode || '',
      teamCode: player.teamCode || player.teamId || '',
      teamName: player.teamName || teamName || '',
      tier: tier,
      cardBg: bgMap[tier]
    }
  },

  calculateAge: function(birthday) {
    if (!birthday) return 0
    const birth = new Date(birthday)
    if (isNaN(birth.getTime())) return 0
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    const monthDiff = today.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--
    }
    return age > 0 ? age : 0
  },

  async loadPlayers() {
    try {
      wx.showLoading({ title: '加载中...' })

      const db = wx.cloud.database()
      const teamInfo = wx.getStorageSync('teamInfo') || {}
      const teamCode = teamInfo.teamCode || teamInfo.teamId || ''
      const teamId = teamInfo._id || teamInfo.teamId || ''
      const teamName = teamInfo.teamName || ''
      const _ = db.command

      const ors = []
      if (teamCode) ors.push({ teamCode: teamCode })
      if (teamId) ors.push({ teamId: teamId })
      if (teamName) ors.push({ teamName: teamName })

      const query = ors.length > 0 ? db.collection('players').where(_.or(ors)) : db.collection('players')
      const res = await query.orderBy('createTime', 'desc').get()
      const players = (res.data || []).map(player => this.normalizePlayer(player, teamName))

      this.setData({ players, PlayersLen: players.length, isLoading: false })
    } catch (err) {
      console.error('加载球员失败:', err)
      this.setData({ players: [], PlayersLen: 0, isLoading: false })
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
    wx.hideLoading()
  },

  viewCard(e) {
    wx.showToast({ title: '详情页开发中', icon: 'none' })
  },

  shareCard(e) {
    wx.showToast({ title: '分享功能开发中', icon: 'none' })
  },

  generateCard() {
    wx.showToast({ title: '请从球员详情查看积分卡', icon: 'none' })
  },

  goCreate() {
    wx.switchTab({ url: '/pages/team/team' })
  },

  onPullDownRefresh() {
    this.loadPlayers()
  }
})
