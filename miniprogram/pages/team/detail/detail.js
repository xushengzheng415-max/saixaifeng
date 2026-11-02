// pages/team/detail/detail.js
// 青训版本 - 球队详情页

var location = require('../../../utils/location')

function text(v){return v==null?'':String(v).trim()}

Page({

  _updateLens: function() {
    var data = this.data;
    var _pl = data.players ? data.players.length : 0;
    if (this.data.PlayersLen !== _pl) { this.setData({ 'PlayersLen': _pl}); }
  },

  data: {
    teamId: '',
    team: null,
    players: [],
    stats: {
      totalPlayers: 0,
      gk: 0,
      df: 0,
      mf: 0,
      fw: 0
    },
    role: '',
    loading: true,

    // 主场
    homeVenues: [],
    hasHomeVenues: false,
    venueEditorVisible: false,
    editingVenueId: '',
    editorVenueName: '',
    editorVenueAddress: '',
    editorVenueLat: 0,
    editorVenueLng: 0,
    editorVenueHasLoc: false
  },

  onLoad(options) {
    const teamId = options.id || wx.getStorageSync('currentTeamId')
    if (teamId) {
      this.setData({ teamId })
      this.loadTeamDetail(teamId)
    } else {
      wx.showToast({ title: '参数错误', icon: 'none' })
      wx.navigateBack()
    }
  },

  // 加载球队详情
  async loadTeamDetail(teamId) {
    this.setData({ loading: true })
    
    try {
      const db = wx.cloud.database()
      
      // 加载球队信息
      const teamRes = await db.collection('teams').doc(teamId).get()
      
      if (teamRes.data) {
        const openId = wx.getStorageSync('openid')
        const role = teamRes.data.role || 'player'
        
        // 加载球员列表
        const playersRes = await db.collection('players')
          .where({ teamId })
          .orderBy('jerseyNumber', 'asc')
          .get()
        
        const players = playersRes.data || []
        
        // 预计算每个球员的姓名首字母（WXML不支持数组索引）
        for (var pi = 0; pi < players.length; pi++) {
          var pname = players[pi].name || ''
          players[pi].nameFirstLetter = pname.length > 0 ? pname.charAt(0) : '?'
        }
        
        // 统计各位置人数
        const stats = {
          totalPlayers: players.length,
          gk: players.filter(p => p.position === 'GK').length,
          df: players.filter(p => p.position === 'DF').length,
          mf: players.filter(p => p.position === 'MF').length,
          fw: players.filter(p => p.position === 'FW').length
        }
        
        this.setData({
          team: teamRes.data,
          shortName: teamRes.data.shortName || teamRes.data.name || '',
          players,
          stats,
          role,
          loading: false
        })
        this.loadHomeVenues()
      }
    } catch (err) {
      console.error('加载球队详情失败:', err)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  // 球员认领（转发家长匹配认领）
  onAddPlayer() {
    wx.navigateTo({
      url: '/pages/team/player-invite/player-invite?teamId=' + encodeURIComponent(this.data.teamId || '')
    })
  },

  // 查看球员详情
  onViewPlayer(e) {
    const playerId = e.currentTarget.dataset.id
    if (!playerId) {
      wx.showToast({ title: '未找到球员信息', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: `/pages/team/player-detail/player-detail?id=${encodeURIComponent(playerId)}`
    })
  },

  // 复制球队代码
  onCopyCode() {
    const code = this.data.team.teamCode
    if (code) {
      wx.setClipboardData({
        data: code,
        success: () => {
          wx.showToast({ title: '已复制', icon: 'success' })
        }
      })
    }
  },

  // 编辑球队
  onEditTeam() {
    wx.navigateTo({
      url: '/pages/guide/team-info/team-info'
    })
  },

  // 提交比赛名单
  onSubmitSquad() {
    wx.navigateTo({
      url: '/pages/match/squad/squad'
    })
  },

  // 返回
  onBack() {
    wx.navigateBack()
  },

  // ===== 主场管理 =====
  loadHomeVenues: function () {
    var that = this
    if (!wx.cloud || !this.data.teamId) return
    wx.cloud.callFunction({
      name: 'friendlyMatchCenter',
      data: { action: 'listTeamVenues', teamId: this.data.teamId }
    }).then(function (res) {
      var result = (res && res.result) || {}
      var list = []
      if (result.ok && result.data && result.data.venues) {
        list = result.data.venues.filter(function (v) { return v.saved === true })
      }
      that.setData({ homeVenues: list, hasHomeVenues: list.length > 0 })
    }).catch(function (error) {
      console.warn('[team-detail] 主场加载失败', error && error.message)
    })
  },

  openAddVenue: function () {
    this.setData({
      venueEditorVisible: true,
      editingVenueId: '',
      editorVenueName: '',
      editorVenueAddress: '',
      editorVenueLat: 0,
      editorVenueLng: 0,
      editorVenueHasLoc: false
    })
  },

  editVenue: function (e) {
    var idx = Number(e.currentTarget.dataset.index)
    var item = this.data.homeVenues[idx]
    if (!item) return
    this.setData({
      venueEditorVisible: true,
      editingVenueId: item.id || '',
      editorVenueName: text(item.name),
      editorVenueAddress: text(item.address),
      editorVenueLat: Number(item.latitude) || 0,
      editorVenueLng: Number(item.longitude) || 0,
      editorVenueHasLoc: Boolean(Number(item.latitude) && Number(item.longitude))
    })
  },

  closeVenueEditor: function () {
    this.setData({ venueEditorVisible: false })
  },

  onEditorNameInput: function (e) {
    this.setData({ editorVenueName: text(e.detail.value) })
  },

  onPickEditorLocation: function () {
    var that = this
    location.pickLocation({
      success: function (res) {
        that.setData({
          editorVenueName: that.data.editorVenueName || text(res.name) || text(res.address),
          editorVenueAddress: text(res.address),
          editorVenueLat: Number(res.latitude) || 0,
          editorVenueLng: Number(res.longitude) || 0,
          editorVenueHasLoc: Boolean(res.latitude && res.longitude)
        })
      }
    })
  },

  clearEditorLocation: function () {
    this.setData({
      editorVenueAddress: '',
      editorVenueLat: 0,
      editorVenueLng: 0,
      editorVenueHasLoc: false
    })
  },

  saveVenue: function () {
    var that = this
    var d = this.data
    var name = text(d.editorVenueName)
    if (!name) { wx.showToast({ title: '请输入场地名称', icon: 'none' }); return }
    var payload = {
      action: 'upsertTeamVenue',
      teamId: d.teamId,
      name: name,
      address: text(d.editorVenueAddress),
      latitude: Number(d.editorVenueLat) || 0,
      longitude: Number(d.editorVenueLng) || 0
    }
    if (d.editingVenueId) payload.venueId = d.editingVenueId
    wx.showLoading({ title: '保存中' })
    wx.cloud.callFunction({
      name: 'friendlyMatchCenter',
      data: payload
    }).then(function (res) {
      wx.hideLoading()
      var r = (res && res.result) || {}
      if (!r.ok) throw new Error(r.message || '保存失败')
      that.setData({ venueEditorVisible: false })
      that.loadHomeVenues()
      wx.showToast({ title: '已保存', icon: 'success' })
    }).catch(function (error) {
      wx.hideLoading()
      wx.showToast({ title: error.message || '保存失败', icon: 'none' })
    })
  },

  deleteVenue: function (e) {
    var that = this
    var item = this.data.homeVenues[Number(e.currentTarget.dataset.index)]
    if (!item || !item.id) return
    wx.showModal({
      title: '删除主场',
      content: '确定删除「' + text(item.name) + '」？',
      success: function (r) {
        if (!r.confirm) return
        wx.showLoading({ title: '删除中' })
        wx.cloud.callFunction({
          name: 'friendlyMatchCenter',
          data: { action: 'deleteTeamVenue', teamId: that.data.teamId, venueId: item.id }
        }).then(function (res) {
          wx.hideLoading()
          var rr = (res && res.result) || {}
          if (!rr.ok) throw new Error(rr.message || '删除失败')
          that.loadHomeVenues()
          wx.showToast({ title: '已删除', icon: 'success' })
        }).catch(function (err) {
          wx.hideLoading()
          wx.showToast({ title: err.message || '删除失败', icon: 'none' })
        })
      }
    })
  },

  setDefaultVenue: function (e) {
    var that = this
    var item = this.data.homeVenues[Number(e.currentTarget.dataset.index)]
    if (!item || !item.id) return
    wx.cloud.callFunction({
      name: 'friendlyMatchCenter',
      data: { action: 'setDefaultTeamVenue', teamId: that.data.teamId, venueId: item.id }
    }).then(function (res) {
      var rr = (res && res.result) || {}
      if (!rr.ok) throw new Error(rr.message || '设置失败')
      that.loadHomeVenues()
      wx.showToast({ title: '已设为默认', icon: 'success' })
    }).catch(function (err) {
      wx.showToast({ title: err.message || '设置失败', icon: 'none' })
    })
  },

  openVenueMap: function (e) {
    var item = this.data.homeVenues[Number(e.currentTarget.dataset.index)]
    if (!item || !Number(item.latitude)) return
    wx.openLocation({
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
      name: text(item.name),
      address: text(item.address),
      scale: 16
    })
  }
})
