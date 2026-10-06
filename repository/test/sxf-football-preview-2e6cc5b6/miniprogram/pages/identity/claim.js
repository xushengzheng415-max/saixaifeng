// pages/identity/claim.js - 认领临时球员
Page({
  _updateLens: function() {
    var data = this.data;
    var _pp = data.pendingPlayers ? data.pendingPlayers.length : 0;
    if (this.data.PendingPlayersLen !== _pp) { this.setData({ 'PendingPlayersLen': _pp}); }
  },

  data: {
    pendingPlayers: [],
    claimedIds: []
  },

  onLoad() {
    this.loadPendingPlayers()
  },

  async loadPendingPlayers() {
    try {
      const userInfo = wx.getStorageSync('userInfo')
      const db = wx.cloud.database()
      const _ = db.command

      // 通过手机号匹配临时球员
      const res = await db.collection('players')
        .where({
          isCreatedByCoach: true,
          isBound: false
        })
        .get()

      // 过滤出手机号匹配的
      const myPhone = userInfo.phone || ''
      const cards = await db.collection('identity_cards').get()
      const myPhones = cards.data.map(c => c.phone).filter(Boolean)

      const matched = res.data.filter(p =>
        myPhones.includes(p.phone) || (myPhone && p.phone === myPhone)
      )

      this.setData({ pendingPlayers: matched })
    } catch (err) {
      console.error('加载待认领球员失败:', err)
    }
  },

  // 认领球员
  async claimPlayer(e) {
    const playerId = e.currentTarget.dataset.id
    const playerName = e.currentTarget.dataset.name

    wx.showModal({
      title: '确认认领',
      content: `确认认领「${playerName}」的球员档案？认领后你可以查看该球员的所有比赛数据。`,
      success: async (r) => {
        if (r.confirm) {
          wx.showLoading({ title: '认领中...' })
          try {
            const db = wx.cloud.database()
            await db.collection('players').doc(playerId).update({
              data: {
                isBound: true,
                boundTime: db.serverDate()
              }
            })

            // 更新已认领列表
            const claimed = [...this.data.claimedIds, playerId]
            this.setData({ claimedIds: claimed })

            wx.showToast({ title: '认领成功！', icon: 'success' })
            this.loadPendingPlayers()
          } catch (err) {
            wx.showToast({ title: '认领失败', icon: 'none' })
          }
          wx.hideLoading()
        }
      }
    })
  },

  // 忽略（不认领）
  ignorePlayer(e) {
    const playerId = e.currentTarget.dataset.id
    wx.showModal({
      title: '忽略此档案',
      content: '忽略后该档案仍由教练管理，你将无法查看其中的比赛数据。',
      confirmText: '确认忽略',
      success: (r) => {
        if (r.confirm) {
          const claimed = [...this.data.claimedIds, playerId]
          this.setData({ claimedIds: claimed })
          this.loadPendingPlayers()
        }
      }
    })
  }
})