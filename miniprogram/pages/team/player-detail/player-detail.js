// pages/team/player-detail/player-detail.js
Page({
  data: {
    loading: true,
    player: {},
    teamInfo: {}
  },

  onLoad(options) {
    const { id } = options
    if (id) {
      this.loadPlayerData(id)
    }
    this.loadTeamInfo()
  },

  onShow() {
    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1]
    const { id } = currentPage.options
    if (id && this.data.player._id) {
      this.loadPlayerData(id)
    }
  },

  loadTeamInfo() {
    const teamInfo = wx.getStorageSync('teamInfo') || {}
    this.setData({ teamInfo })
  },

  loadPlayerData(id) {
    this.setData({ loading: true })

    const db = wx.cloud.database()
    const positionMap = {
      GK: '守门员',
      DF: '后卫',
      MF: '中场',
      FW: '前锋'
    }
    const genderMap = {
      male: '男',
      female: '女',
      '男': '男',
      '女': '女'
    }
    const footMap = {
      left: '左脚',
      right: '右脚',
      both: '双脚'
    }

    db.collection('players').doc(id).get()
      .then(res => {
        const raw = res.data || {}
        const player = {
          ...raw,
          photoUrl: raw.photoUrl || raw.photo || '',
          photo: raw.photo || raw.photoUrl || '',
          birthday: raw.birthday || raw.birthDate || '',
          birthDate: raw.birthDate || raw.birthday || '',
          teamId: raw.teamId || raw.teamCode || '',
          teamCode: raw.teamCode || raw.teamId || '',
          positionLabel: positionMap[raw.position] || raw.position,
          genderLabel: genderMap[raw.gender] || raw.gender,
          strongFootLabel: footMap[raw.strongFoot] || raw.strongFoot
        }

        if (player.birthday) {
          player.age = this.calculateAge(player.birthday)
        }

        this.setData({ player, loading: false })
        wx.setNavigationBarTitle({ title: player.name || '球员详情' })
      })
      .catch(err => {
        console.error('加载球员数据失败:', err)
        wx.showToast({ title: '加载失败', icon: 'none' })
        this.setData({ loading: false })
      })
  },

  calculateAge(birthday) {
    if (!birthday) return ''
    const birth = new Date(birthday)
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    const monthDiff = today.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--
    }
    return age > 0 ? age : ''
  },

  previewImage() {
    if (this.data.player.photoUrl) {
      wx.previewImage({
        current: this.data.player.photoUrl,
        urls: [this.data.player.photoUrl]
      })
    }
  },

  callPhone() {
    const phone = this.data.player.phone
    if (phone) {
      wx.makePhoneCall({ phoneNumber: phone, fail: () => {} })
    }
  },

  onEdit() {
    const { _id, teamId, teamCode, teamName } = this.data.player
    const teamInfo = this.data.teamInfo || {}
    const realTeamId = teamId || teamCode || teamInfo._id || teamInfo.teamId || teamInfo.teamCode || ''
    const realTeamCode = teamCode || teamId || teamInfo.teamCode || teamInfo.teamId || realTeamId
    const realTeamName = teamName || teamInfo.teamName || ''

    wx.navigateTo({
      url: '/pages/team/player-add/player-add?id=' + _id + '&teamId=' + encodeURIComponent(realTeamId) + '&teamCode=' + encodeURIComponent(realTeamCode) + '&teamName=' + encodeURIComponent(realTeamName) + '&mode=edit'
    })
  },

  onDelete() {
    wx.showModal({
      title: '确认删除',
      content: `确定要删除球员「${this.data.player.name}」吗？此操作不可恢复。`,
      confirmText: '删除',
      confirmColor: '#F44336',
      success: (res) => {
        if (res.confirm) {
          this.deletePlayer()
        }
      }
    })
  },

  deletePlayer() {
    const db = wx.cloud.database()
    wx.showLoading({ title: '删除中...' })

    db.collection('players').doc(this.data.player._id).remove()
      .then(() => {
        wx.hideLoading()
        wx.showToast({ title: '删除成功', icon: 'success' })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
      })
      .catch(err => {
        wx.hideLoading()
        console.error('删除失败:', err)
        wx.showToast({ title: '删除失败', icon: 'none' })
      })
  }
})