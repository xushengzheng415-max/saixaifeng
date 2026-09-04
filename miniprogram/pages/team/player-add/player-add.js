var workspace = require('../../../utils/workspace')

Page({
  data: {
    teamId: '',
    teamName: '',
    teamLogo: '',
    playerId: '',
    mode: 'create',
    isEdit: false,
    pageTitle: '快速添加球员',
    name: '',
    birthDate: '',
    guardianPhone: '',
    createParentLink: true,
    showParentLink: true,
    onlySaveText: '仅保存球员档案',
    isSubmitting: false,
    ageGroup: '待填写出生年月',
    canManage: false
  },

  onLoad: function (options) {
    options = options || {}
    if (workspace.isVisualQaEnabled(options)) {
      this.setData({
        teamId: 'visual-team',
        teamName: '赛小蜂 U12 竞技队',
        teamLogo: '/images/runtime/icons/brand-v2-11.png',
        name: '李浩然',
        birthDate: '2014-09-02',
        guardianPhone: '138****6721',
        ageGroup: '系统建议年龄组：U12',
        canManage: true
      })
      return
    }
    var mode = String(options.mode || 'create') === 'edit' ? 'edit' : 'create'
    var playerId = String(options.id || options.playerId || '')
    this.setData({
      teamId: String(options.teamId || ''),
      teamName: decodeURIComponent(options.teamName || ''),
      playerId: playerId,
      mode: mode,
      isEdit: mode === 'edit' && Boolean(playerId),
      pageTitle: mode === 'edit' ? '编辑球员档案' : '快速添加球员',
      showParentLink: !(mode === 'edit' && Boolean(playerId)),
      onlySaveText: mode === 'edit' ? '保存球员档案' : '仅保存球员档案',
      createParentLink: mode !== 'edit'
    })
    this.loadTeam()
  },

  loadTeam: function () {
    var ctx = workspace.readContext() || {}
    var team = (ctx.teams || []).filter(function (item) {
      return String(item.id || '') === String(this.data.teamId)
    }, this)[0]
    this.setData({
      teamLogo: (team || {}).logo || '',
      canManage: workspace.hasPermission('team.manage', ctx)
    })
    if (!this.data.canManage) return wx.showToast({ title: '当前身份只可查看', icon: 'none' })
    if (this.data.isEdit) this.loadPlayer()
  },

  loadPlayer: function () {
    var ctx = workspace.readContext() || {}
    wx.cloud.callFunction({
      name: 'getMiniWorkspace',
      data: {
        action: 'teamPlayerEdit',
        workspaceId: (ctx.currentWorkspace || {}).id,
        teamId: this.data.teamId,
        playerId: this.data.playerId
      }
    }).then(function (res) {
      var result = res.result || {}
      if (!result.success || !result.player) throw new Error(result.message || '球员档案加载失败')
      var player = result.player
      this.setData({
        name: player.name || '',
        birthDate: player.birthDate || '',
        guardianPhone: player.guardianPhone || '',
        ageGroup: this.suggestGroup(player.birthDate || '')
      })
    }.bind(this)).catch(function (error) {
      wx.showToast({ title: error.message || '球员档案加载失败', icon: 'none' })
    })
  },

  inputName: function (event) { this.setData({ name: event.detail.value || '' }) },
  inputPhone: function (event) { this.setData({ guardianPhone: event.detail.value || '' }) },
  changeBirth: function (event) {
    var value = event.detail.value || ''
    this.setData({ birthDate: value, ageGroup: this.suggestGroup(value) })
  },
  suggestGroup: function (value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '待填写出生年月'
    var age = new Date().getFullYear() - Number(value.slice(0, 4))
    return '建议年龄组：U' + Math.max(6, Math.min(18, age))
  },
  toggleLink: function (event) { this.setData({ createParentLink: event.detail.value }) },

  save: function (event) {
    if (!this.data.canManage) return wx.showToast({ title: '当前身份没有创建权限', icon: 'none' })
    if (this.data.isSubmitting) return
    var withLink = event.currentTarget.dataset.link === true && this.data.showParentLink
    this.setData({ isSubmitting: true })
    var ctx = workspace.readContext() || {}
    wx.cloud.callFunction({
      name: 'getMiniWorkspace',
      data: {
        action: 'saveTeamPlayer',
        workspaceId: (ctx.currentWorkspace || {}).id,
        teamId: this.data.teamId,
        playerId: this.data.isEdit ? this.data.playerId : '',
        name: this.data.name,
        birthDate: this.data.birthDate,
        guardianPhone: this.data.guardianPhone,
        createParentLink: withLink
      }
    }).then(function (res) {
      var result = res.result || {}
      if (!result.success) throw new Error(result.message || '保存失败')
      var title = this.data.isEdit ? '球员档案已更新' : (withLink ? '档案及协作链接已生成' : '球员档案已保存')
      wx.showToast({ title: title, icon: 'success' })
      setTimeout(function () { wx.navigateBack() }, 900)
    }.bind(this)).catch(function (error) {
      wx.showToast({ title: error.message || '保存失败', icon: 'none' })
    }).finally(function () {
      this.setData({ isSubmitting: false })
    }.bind(this))
  },

  onBack: function () { wx.navigateBack() }
})
