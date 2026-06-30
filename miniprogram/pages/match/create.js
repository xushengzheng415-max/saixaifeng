// pages/match/create.js - 创建赛事
Page({

  data: {
    // 赛事类型
    type: 'campus', // campus=校园足球, amateur=业余足球
    // 基本信息
    name: '',
    startDate: '',
    endDate: '',
    location: '',
    description: '',
    // 报名设置
    maxTeams: 16,
    maxPlayers: 25,
    // 业余足球官员角色选项 (pre-computed for WXML compatibility)
    officialRoles: [
      { name: '助理教练', _selected: false },
      { name: '队医', _selected: false },
      { name: '翻译', _selected: false },
      { name: '新闻官', _selected: false }
    ],
    selectedOfficials: [],
    // 官员角色中文名映射
    roleMap: {
      'assistant_coach': '助理教练',
      'doctor': '队医',
      'translator': '翻译',
      'press_officer': '新闻官'
    }
  },

  // 选择赛事类型
  selectType(e) {
    this.setData({ type: e.currentTarget.dataset.type })
  },

  // 日期选择
  onStartDateChange(e) { this.setData({ startDate: e.detail.value }) },
  onEndDateChange(e) { this.setData({ endDate: e.detail.value }) },

  // 输入
  onNameInput(e) { this.setData({ name: e.detail.value }) },
  onLocationInput(e) { this.setData({ location: e.detail.value }) },
  onDescInput(e) { this.setData({ description: e.detail.value }) },
  onMaxTeamsInput(e) { this.setData({ maxTeams: parseInt(e.detail.value) || 16 }) },
  onMaxPlayersInput(e) { this.setData({ maxPlayers: parseInt(e.detail.value) || 25 }) },

  // 切换官员角色选择
  toggleOfficial(e) {
    const role = e.currentTarget.dataset.role
    let selected = this.data.selectedOfficials
    const idx = selected.indexOf(role)
    if (idx > -1) {
      selected.splice(idx, 1)
    } else {
      selected.push(role)
    }
    this.setData({ selectedOfficials: selected })
    this._refreshOfficialRoles()
  },

  // Refresh _selected flags on officialRoles (WXML can't call contains)
  _refreshOfficialRoles: function() {
    var selected = this.data.selectedOfficials || []
    var roles = this.data.officialRoles || []
    var updated = roles.map(function(r) {
      return { name: r, _selected: selected.indexOf(r) > -1 }
    })
    this.setData({ officialRoles: updated })
  },

  // 创建赛事
  async createTournament() {
    const { name, type, startDate } = this.data

    if (!name.trim()) {
      wx.showToast({ title: '请输入赛事名称', icon: 'none' })
      return
    }
    if (!startDate) {
      wx.showToast({ title: '请选择开始日期', icon: 'none' })
      return
    }

    wx.showLoading({ title: '创建中...' })

    try {
      const db = wx.cloud.database()
      const tournamentData = {
        name: this.data.name.trim(),
        type: this.data.type,
        typeName: this.data.type === 'campus' ? '校园足球' : '业余足球',
        startDate: this.data.startDate,
        endDate: this.data.endDate,
        location: this.data.location,
        description: this.data.description,
        maxTeams: this.data.maxTeams,
        maxPlayers: this.data.maxPlayers,
        // 业余足球官员角色配置
        officialRoles: this.data.type === 'amateur' ? this.data.selectedOfficials : [],
        // 报名状态
        status: 'registering',
        registeredTeams: 0,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }

      const res = await db.collection('tournaments').add({ data: tournamentData })

      wx.showToast({ title: '创建成功', icon: 'success' })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    } catch (err) {
      console.error('创建赛事失败:', err)
      wx.showToast({ title: '创建失败', icon: 'none' })
    }

    wx.hideLoading()
  }
})