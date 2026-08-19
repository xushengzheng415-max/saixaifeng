const db = wx.cloud.database()
const { provinceNameCodeMap, cityNameLetterMap } = require('../../../utils/teamCodeRegions')
const workspace = require('../../../utils/workspace')

Page({
  data: {
    tournamentId: '',
    tournamentName: '',
    divisionOptions: [],
    showDivisionTabs: false,
    activeDivisionId: 'default',
    activeDivisionName: '默认组',
    teams: [],
    teamsLen: 0,
    hasTeamsLen: false,
    loading: true,
    errorMsg: '',
    maxTeams: 0,
    isOrganizer: false,
    showCreateTeam: false,
    submittingTeam: false,
    regionText: '',
    teamTypeIndex: 0,
    teamTypeText: '一线队',
    teamTypeOptions: [
      { label: '一线队', code: '01' },
      { label: '二线队', code: '02' },
      { label: 'U8', code: '08' },
      { label: 'U9', code: '09' },
      { label: 'U10', code: '10' },
      { label: 'U11', code: '11' },
      { label: 'U12', code: '12' },
      { label: 'U13', code: '13' },
      { label: 'U14', code: '14' },
      { label: 'U15', code: '15' },
      { label: 'U16', code: '16' },
      { label: 'U17', code: '17' },
      { label: 'U18', code: '18' }
    ],
    createForm: {
      name: '',
      shortName: '',
      provinceCode: '',
      cityCode: '',
      cityName: '',
      teamType: '01',
      establishedDate: '',
      logo: '',
      logoFileId: '',
      description: ''
    }
  },

  onLoad(options) {
    var context = workspace.readContext() || {}
    var tournamentId = options && options.id ? options.id : ''
    var tournament = (context.tournaments || []).find(function(item) {
      return item.id === tournamentId || item._id === tournamentId
    })
    var canManage = workspace.hasPermission('event.manage', context) &&
      tournament && tournament.relation === 'hosted'
    this.setData({ isOrganizer: !!canManage })
    if (options && options.id) {
      this.setData({ tournamentId: options.id, activeDivisionId: options.divisionId || 'default' })
      this.loadData()
    }
  },

  async loadData() {
    try { wx.cloud.init({ env: 'cloud1-7g8ckb3c7815a011', traceUser: false }) } catch(e) {}
    this.setData({ loading: true, errorMsg: '' })
    try {
      var tournamentRes = await db.collection('tournaments').doc(this.data.tournamentId).get()
      var tournament = tournamentRes.data || {}
      var divisions = Array.isArray(tournament.divisions) && tournament.divisions.length
        ? tournament.divisions
        : [{ id: 'default', name: '默认组', maxTeams: Number(tournament.maxTeams || 0), maxPlayersPerTeam: Number(tournament.maxPlayersPerTeam || tournament.maxPlayers || 0) }]
      var preferred = this.data.activeDivisionId !== 'default' ? this.data.activeDivisionId : (tournament.defaultDivisionId || divisions[0].id)
      var active = divisions.find(function(item) { return item.id === preferred }) || divisions[0]
      var displayDivisions = divisions.map(function(item) {
        return Object.assign({}, item, { tabClass: item.id === active.id ? 'active' : '' })
      })
      this.setData({
        tournamentName: tournament.name || '',
        divisionOptions: displayDivisions,
        showDivisionTabs: displayDivisions.length > 1,
        activeDivisionId: active.id,
        activeDivisionName: active.name,
        maxTeams: Number(active.maxTeams || tournament.maxTeams || 0)
      })
      await this.loadTeamsForDivision()
    } catch (err) {
      console.error('加载赛事球队失败:', err)
      this.setData({ loading: false, errorMsg: '加载失败' })
    }
  },

  async loadTeamsForDivision() {
    var res = await db.collection('tournament_teams').where({ tournamentId: this.data.tournamentId, status: 'approved' }).get()
    var activeDivisionId = this.data.activeDivisionId
    var records = (res.data || []).filter(function(item) { return (item.divisionId || 'default') === activeDivisionId })
    var teamIds = records.map(function(item) { return item.teamId }).filter(Boolean)
    var teamMap = {}
    try {
      var chunks = []
      for (var i = 0; i < teamIds.length; i += 20) chunks.push(teamIds.slice(i, i + 20))
      var detailResults = await Promise.all(chunks.map(function(ids) {
        return db.collection('teams').where({ _id: db.command.in(ids) }).limit(20).get()
      }))
      detailResults.forEach(function(result) {
        ;(result.data || []).forEach(function(team) { teamMap[team._id] = team })
      })
    } catch (detailErr) {
      console.warn('加载球队详情失败，使用报名记录:', detailErr)
    }
    var teams = records.map(function(t) {
      var detail = teamMap[t.teamId] || {}
      var teamName = detail.name || t.teamName || t.name || '未知球队'
      return {
        _id: t._id,
        teamId: t.teamId,
        teamCode: detail.teamCode || t.teamCode || '',
        teamName: teamName,
        teamLogo: detail.logo || detail.logoUrl || t.teamLogo || t.logo || '',
        teamCity: detail.cityName || t.teamCity || t.city || '',
        playerCount: Number(detail.playerCount || t.playerCount || 0),
        firstChar: teamName.charAt(0)
      }
    })
    var len = teams.length
    this.setData({ teams: teams, teamsLen: len, hasTeamsLen: len > 0, loading: false, errorMsg: '' })
  },

  onDivisionTap(e) {
    var id = e.currentTarget.dataset.id
    if (!id || id === this.data.activeDivisionId) return
    var active = this.data.divisionOptions.find(function(item) { return item.id === id })
    var divisions = this.data.divisionOptions.map(function(item) {
      item.tabClass = item.id === id ? 'active' : ''
      return item
    })
    this.setData({
      divisionOptions: divisions,
      activeDivisionId: id,
      activeDivisionName: active ? active.name : '',
      maxTeams: Number((active && active.maxTeams) || 0)
    })
    this.loadTeamsForDivision().catch(err => {
      console.error('切换组别失败:', err)
      this.setData({ loading: false, errorMsg: '加载失败' })
    })
  },

  resetCreateTeamForm() {
    this.setData({
      regionText: '',
      teamTypeIndex: 0,
      teamTypeText: '一线队',
      createForm: {
        name: '',
        shortName: '',
        provinceCode: '',
        cityCode: '',
        cityName: '',
        teamType: '01',
        establishedDate: '',
        logo: '',
        logoFileId: '',
        description: ''
      }
    })
  },

  openCreateTeam() {
    if (this.data.maxTeams > 0 && this.data.teamsLen >= this.data.maxTeams) {
      wx.showToast({ title: '参赛名额已满', icon: 'none' })
      return
    }
    this.resetCreateTeamForm()
    this.setData({ showCreateTeam: true })
  },

  closeCreateTeam() {
    if (!this.data.submittingTeam) this.setData({ showCreateTeam: false })
  },

  stopTap() {},

  onCreateNameInput(e) { this.setData({ 'createForm.name': e.detail.value || '' }) },
  onCreateShortNameInput(e) { this.setData({ 'createForm.shortName': e.detail.value || '' }) },
  onCreateDescriptionInput(e) { this.setData({ 'createForm.description': e.detail.value || '' }) },
  onCreateDateChange(e) { this.setData({ 'createForm.establishedDate': e.detail.value || '' }) },

  onCreateRegionChange(e) {
    var region = e.detail.value || []
    var provinceName = region[0] || ''
    var cityName = region[1] || ''
    var provinceCode = provinceNameCodeMap[provinceName] || ''
    var cityCode = cityNameLetterMap[cityName] || cityNameLetterMap[cityName.replace(/市$/, '')] || ''
    this.setData({
      regionText: region.join(' '),
      'createForm.provinceCode': provinceCode,
      'createForm.cityCode': cityCode,
      'createForm.cityName': cityName
    })
  },

  onCreateTeamTypeChange(e) {
    var index = Number(e.detail.value || 0)
    var option = this.data.teamTypeOptions[index] || this.data.teamTypeOptions[0]
    this.setData({
      teamTypeIndex: index,
      teamTypeText: option.label,
      'createForm.teamType': option.code
    })
  },

  chooseCreateLogo() {
    var that = this
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success(res) {
        var filePath = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath
        if (filePath) that.compressAndUploadLogo(filePath)
      }
    })
  },

  compressAndUploadLogo(filePath) {
    var that = this
    wx.showLoading({ title: '压缩上传中...' })
    wx.compressImage({
      src: filePath,
      quality: 70,
      compressedWidth: 640,
      compressedHeight: 640,
      success(compressed) {
        var cloudPath = 'team-logos/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.jpg'
        wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: compressed.tempFilePath,
          success(uploaded) {
            that.setData({
              'createForm.logo': uploaded.fileID,
              'createForm.logoFileId': uploaded.fileID
            })
            wx.showToast({ title: 'Logo上传成功', icon: 'success' })
          },
          fail(err) {
            console.error('Logo上传失败:', err)
            wx.showToast({ title: 'Logo上传失败', icon: 'none' })
          },
          complete() { wx.hideLoading() }
        })
      },
      fail(err) {
        wx.hideLoading()
        console.error('Logo压缩失败:', err)
        wx.showToast({ title: '图片压缩失败', icon: 'none' })
      }
    })
  },

  async generateTeamCode(provinceCode, cityCode, teamType) {
    var prefix = provinceCode + cityCode
    var maxSequence = 0
    var result = await db.collection('teams').limit(500).get()
    ;(result.data || []).forEach(function(team) {
      var code = team.teamCode || ''
      if (code.substring(0, 4) === prefix) {
        var sequence = parseInt(code.substring(4, 7), 10)
        if (!isNaN(sequence)) maxSequence = Math.max(maxSequence, sequence)
      }
    })
    var sequenceText = String(maxSequence + 1)
    while (sequenceText.length < 3) sequenceText = '0' + sequenceText
    return prefix + sequenceText + teamType
  },

  async submitCreateTeam() {
    var form = this.data.createForm
    if (!form.name.trim() || !form.shortName.trim()) {
      wx.showToast({ title: '请填写球队全称和简称', icon: 'none' })
      return
    }
    if (!form.provinceCode || !form.cityCode) {
      wx.showToast({ title: '请选择所属地区', icon: 'none' })
      return
    }
    if (!form.establishedDate) {
      wx.showToast({ title: '请选择成立时间', icon: 'none' })
      return
    }

    this.setData({ submittingTeam: true })
    wx.showLoading({ title: '正在创建...' })
    var createdTeamId = ''
    var linkedToTournament = false
    try {
      var user = wx.getStorageSync('userInfo') || {}
      var ownerPhone = user.phoneNumber || user.phone || wx.getStorageSync('phoneNumber') || ''
      var creatorId = user._id || wx.getStorageSync('userId') || ''
      var openId = user.openId || user.openid || wx.getStorageSync('openid') || ''
      var teamCode = await this.generateTeamCode(form.provinceCode, form.cityCode, form.teamType)
      var teamData = {
        name: form.name.trim(),
        shortName: form.shortName.trim(),
        provinceCode: form.provinceCode,
        cityCode: form.cityCode,
        cityName: form.cityName,
        teamType: form.teamType,
        teamCode: teamCode,
        establishedDate: form.establishedDate,
        logo: form.logo || '',
        logoUrl: form.logo || '',
        description: form.description || '',
        ownerPhone: ownerPhone,
        creatorPhone: ownerPhone,
        contactPhone: ownerPhone,
        phoneNumber: ownerPhone,
        phone: ownerPhone,
        mobile: ownerPhone,
        openId: openId,
        wechatOpenId: openId,
        creatorId: creatorId,
        source: 'miniprogram',
        claimStatus: ownerPhone ? 'claimed' : 'unclaimed',
        playerCount: 0,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
      var created = await db.collection('teams').add({ data: teamData })
      createdTeamId = created._id
      await db.collection('tournament_teams').add({
        data: {
          tournamentId: this.data.tournamentId,
          divisionId: this.data.activeDivisionId,
          divisionName: this.data.activeDivisionName,
          teamId: createdTeamId,
          teamName: teamData.name,
          teamCode: teamCode,
          status: 'approved',
          approveTime: db.serverDate(),
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })
      linkedToTournament = true
      this.setData({ showCreateTeam: false })
      this.loadData()
      wx.hideLoading()
      wx.showModal({
        title: '创建成功',
        content: '球队已加入赛事，是否现在添加球员？',
        confirmText: '添加球员',
        cancelText: '稍后添加',
        success: modal => {
          if (modal.confirm) {
            wx.navigateTo({
              url: '/pages/team/player-add/player-add?teamId=' + encodeURIComponent(createdTeamId) + '&teamCode=' + encodeURIComponent(teamCode) + '&teamName=' + encodeURIComponent(teamData.name)
            })
          }
        }
      })
    } catch (err) {
      console.error('添加球队失败:', err)
      if (createdTeamId && !linkedToTournament) {
        try { await db.collection('teams').doc(createdTeamId).remove() } catch (rollbackErr) { console.warn('回滚球队失败:', rollbackErr) }
      }
      wx.hideLoading()
      wx.showToast({ title: '添加球队失败', icon: 'none' })
    } finally {
      this.setData({ submittingTeam: false })
    }
  },

  onAddPlayer(e) {
    var teamId = e.currentTarget.dataset.id || ''
    var teamCode = e.currentTarget.dataset.code || teamId
    var teamName = e.currentTarget.dataset.name || ''
    wx.navigateTo({
      url: '/pages/team/player-add/player-add?teamId=' + encodeURIComponent(teamId) + '&teamCode=' + encodeURIComponent(teamCode) + '&teamName=' + encodeURIComponent(teamName)
    })
  },

  onViewTeam(e) {
    var teamId = e.currentTarget.dataset.id || ''
    if (!teamId) {
      wx.showToast({ title: '未找到球队信息', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: '/pages/team/detail/detail?id=' + encodeURIComponent(teamId)
    })
  },

  onShareAppMessage() {
    return {
      title: '邀请球队报名参赛：' + (this.data.tournamentName || '赛小蜂足球赛事'),
      path: '/pages/tournament/signup/signup?id=' + this.data.tournamentId + '&divisionId=' + encodeURIComponent(this.data.activeDivisionId)
    }
  }
})
