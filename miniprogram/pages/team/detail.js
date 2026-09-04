// pages/team/detail.js - 球队详情/创建/编辑
Page({


  _updateLens: function() {
    var data = this.data;
    var _pl = data.players ? data.players.length : 0;
    if (this.data.PlayersLen !== _pl) { this.setData({ 'PlayersLen': _pl}); }
  },

  data: {
    teamId: null,
    isEdit: false,
    role: '',
    name: '',
    logo: '',
    coachName: '',
    phone: '',
    remark: '',
    teamCode: '',
    playerCount: 0,
    players: []
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ teamId: options.id, isEdit: true })
      this.loadTeam(options.id)
      this.loadPlayers(options.id)
    }
  },

  // 加载球队信息
  async loadTeam(teamId) {
    try {
      const db = wx.cloud.database()
      const res = await db.collection('teams').doc(teamId).get()
      this.setData({
        name: res.data.name,
        logo: res.data.logo || '',
        coachName: res.data.coachName || '',
        phone: res.data.phone || '',
        remark: res.data.remark || '',
        teamCode: res.data.teamCode || '',
        playerCount: res.data.playerCount || 0
      })
      wx.setNavigationBarTitle({ title: res.data.name })
    } catch (err) {
      console.error('加载球队失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  // 加载球员列表
  async loadPlayers(teamId) {
    try {
      const db = wx.cloud.database()
      const res = await db.collection('players')
        .where({ teamId: teamId })
        .orderBy('jerseyNumber', 'asc')
        .get()
      this.setData({ players: (res.data || []).map(function(item) {
        return Object.assign({}, item, { showBindStatus: item.isCreatedByCoach && !item.isBound })
      }) })
    } catch (err) {
      console.error('加载球员失败:', err)
    }
  },

  // 输入事件
  onNameInput(e) { this.setData({ name: e.detail.value }) },
  onCoachInput(e) { this.setData({ coachName: e.detail.value }) },
  onPhoneInput(e) { this.setData({ phone: e.detail.value }) },
  onRemarkInput(e) { this.setData({ remark: e.detail.value }) },

  // 选择Logo
  chooseLogo() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res) => this.uploadLogo(res.tempFiles[0].tempFilePath)
    })
  },

  async uploadLogo(filePath) {
    wx.showLoading({ title: '上传中...' })
    try {
      const cloudPath = `team-logos/${Date.now()}-${Math.random().toString(36).substr(2, 8)}.jpg`
      const res = await wx.cloud.uploadFile({ cloudPath, filePath })
      this.setData({ logo: res.fileID })
      wx.showToast({ title: '上传成功', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: '上传失败', icon: 'none' })
    }
    wx.hideLoading()
  },

  // 生成6位球队代码
  generateTeamCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 去掉容易混淆的0OI1
    let code = ''
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
  },

  // 保存球队
  async saveTeam() {
    if (!this.data.name.trim()) {
      wx.showToast({ title: '请输入球队名称', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...' })

    try {
      const db = wx.cloud.database()
      const teamData = {
        name: this.data.name.trim(),
        logo: this.data.logo,
        coachName: this.data.coachName,
        phone: this.data.phone,
        remark: this.data.remark,
        updateTime: db.serverDate()
      }

      if (this.data.isEdit) {
        await db.collection('teams').doc(this.data.teamId).update({ data: teamData })
      } else {
        teamData.teamCode = this.generateTeamCode()
        teamData.playerCount = 0
        teamData.memberOpenids = []
        teamData.memberCount = 0
        teamData.createTime = db.serverDate()
        const res = await db.collection('teams').add({ data: teamData })
        this.setData({ teamId: res._id, teamCode: teamData.teamCode, isEdit: true })
      }

      wx.showToast({ title: '保存成功', icon: 'success' })
    } catch (err) {
      console.error('保存失败:', err)
      wx.showToast({ title: '保存失败', icon: 'none' })
    }

    wx.hideLoading()
  },

  // 跳转球员管理
  goToPlayers() {
    wx.navigateTo({
      url: `/pages/team/player-library/player-library?teamId=${encodeURIComponent(this.data.teamId)}`
    })
  },

  // 添加球员（快捷入口）
  addPlayer() {
    wx.navigateTo({
      url: `/pages/team/player-add/player-add?teamId=${encodeURIComponent(this.data.teamId)}`
    })
  },

  // 复制球队代码
  copyCode() {
    wx.setClipboardData({
      data: this.data.teamCode,
      success: () => {
        wx.showToast({ title: '球队代码已复制', icon: 'success' })
      }
    })
  },

  // 编辑模式
  editTeam() {
    // 在编辑模式下显示编辑表单
  }
})
