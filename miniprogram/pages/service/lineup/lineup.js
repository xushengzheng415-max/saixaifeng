Page({
  data: {
    matchId: '',
    teamId: '',
    loading: true,
    errorMsg: '',
    tournamentName: '',
    teamName: '',
    opponentName: '',
    matchTimeText: '',
    venue: '',
    startingCount: 0,
    selectedCount: 0,
    countText: '0/0',
    requirementText: '',
    players: [],
    hasPlayers: false,
    readOnly: false,
    submitted: false,
    canSubmit: false,
    submitting: false,
    submitButtonText: '提交首发名单',
    lineupStatusText: ''
  },

  onLoad: function(options) {
    var matchId = options && options.matchId ? decodeURIComponent(options.matchId) : ''
    var teamId = options && options.teamId ? decodeURIComponent(options.teamId) : ''
    this.setData({ matchId: matchId, teamId: teamId })
    if (!matchId || !teamId) {
      this.setData({ loading: false, errorMsg: '缺少比赛或球队参数' })
      return
    }
    this.loadTask()
  },

  callWorkflow: function(data, success, fail) {
    wx.cloud.callFunction({ name: 'serviceMatchWorkflow', data: data || {}, timeout: 20000, success: success, fail: fail })
  },

  draftKey: function() {
    return 'service_lineup_draft_' + this.data.matchId + '_' + this.data.teamId
  },

  loadTask: function() {
    var that = this
    that.setData({ loading: true, errorMsg: '' })
    that.callWorkflow({
      action: 'getLineupTask',
      matchId: that.data.matchId,
      teamId: that.data.teamId
    }, function(res) {
      var result = res.result || {}
      if (!result.success) {
        that.setData({ loading: false, errorMsg: result.message || '首发任务加载失败' })
        return
      }
      that.applyTask(result.data || {})
    }, function(err) {
      console.error('[service-lineup] load failed:', err)
      that.setData({ loading: false, errorMsg: '网络异常，请下拉重试' })
    })
  },

  applyTask: function(data) {
    var selectedMap = {}
    ;(data.selectedIds || []).forEach(function(id) { selectedMap[String(id)] = true })
    if (!data.readOnly) {
      var draft = wx.getStorageSync(this.draftKey()) || []
      if (Array.isArray(draft) && draft.length > 0) {
        selectedMap = {}
        draft.forEach(function(id) { selectedMap[String(id)] = true })
      }
    }

    var players = (data.players || []).map(function(item) {
      var selected = !!selectedMap[String(item._id)]
      return {
        _id: item._id,
        name: item.name || '未命名球员',
        jerseyNumber: item.jerseyNumber || '--',
        position: item.position || '位置未设置',
        selected: selected,
        rowClass: selected ? 'selected' : '',
        checkText: selected ? '✓' : ''
      }
    })
    var selectedCount = players.filter(function(item) { return item.selected }).length
    var startingCount = Number(data.startingCount || 0)
    var submitted = data.lineupStatus === 'submitted' || data.lineupStatus === 'verified' || data.lineupStatus === 'locked'
    this.setData({
      loading: false,
      tournamentName: data.tournamentName || '赛事',
      teamName: data.teamName || '球队',
      opponentName: data.opponentName || '对手球队',
      matchTimeText: data.matchTimeText || '时间待定',
      venue: data.venue || '场地待定',
      startingCount: startingCount,
      players: players,
      hasPlayers: players.length > 0,
      readOnly: !!data.readOnly,
      submitted: submitted,
      lineupStatusText: data.lineupStatusText || '',
      submitButtonText: submitted ? '首发名单已提交' : '确认提交首发',
      requirementText: '请选择' + startingCount + '名首发球员'
    })
    this.updateCount(selectedCount)
  },

  updateCount: function(selectedCount) {
    var canSubmit = !this.data.readOnly && !this.data.submitting && selectedCount === this.data.startingCount
    this.setData({
      selectedCount: selectedCount,
      countText: selectedCount + '/' + this.data.startingCount,
      canSubmit: canSubmit
    })
  },

  togglePlayer: function(e) {
    if (this.data.readOnly || this.data.submitting) return
    var playerId = String(e.currentTarget.dataset.playerId || '')
    if (!playerId) return
    var players = this.data.players.slice()
    var targetIndex = -1
    for (var i = 0; i < players.length; i++) {
      if (String(players[i]._id) === playerId) {
        targetIndex = i
        break
      }
    }
    if (targetIndex < 0) return
    var target = players[targetIndex]
    if (!target.selected && this.data.selectedCount >= this.data.startingCount) {
      wx.showToast({ title: '首发人数已选满', icon: 'none' })
      return
    }
    target.selected = !target.selected
    target.rowClass = target.selected ? 'selected' : ''
    target.checkText = target.selected ? '✓' : ''
    players[targetIndex] = target
    var selectedIds = players.filter(function(item) { return item.selected }).map(function(item) { return item._id })
    wx.setStorageSync(this.draftKey(), selectedIds)
    this.setData({ players: players })
    this.updateCount(selectedIds.length)
  },

  submitLineup: function() {
    if (!this.data.canSubmit || this.data.submitting) return
    var that = this
    wx.showModal({
      title: '确认提交首发',
      content: '提交后由裁判核验。如需修改，裁判会退回名单。',
      confirmText: '确认提交',
      success: function(res) {
        if (res.confirm) that.doSubmit()
      }
    })
  },

  doSubmit: function() {
    var that = this
    var selectedIds = that.data.players.filter(function(item) { return item.selected }).map(function(item) { return item._id })
    that.setData({ submitting: true, canSubmit: false, submitButtonText: '正在提交...' })
    wx.showLoading({ title: '正在提交...' })
    that.callWorkflow({
      action: 'submitLineup',
      matchId: that.data.matchId,
      teamId: that.data.teamId,
      selectedPlayerIds: selectedIds
    }, function(res) {
      wx.hideLoading()
      var result = res.result || {}
      if (!result.success) {
        that.setData({ submitting: false, submitButtonText: '确认提交首发' })
        that.updateCount(selectedIds.length)
        wx.showModal({ title: '提交失败', content: result.message || '请重试', showCancel: false })
        return
      }
      wx.removeStorageSync(that.draftKey())
      that.setData({
        submitting: false,
        readOnly: true,
        submitted: true,
        canSubmit: false,
        submitButtonText: '首发名单已提交',
        lineupStatusText: '已提交，等待裁判核验'
      })
      wx.showToast({ title: '提交成功', icon: 'success' })
    }, function(err) {
      wx.hideLoading()
      console.error('[service-lineup] submit failed:', err)
      that.setData({ submitting: false, submitButtonText: '确认提交首发' })
      that.updateCount(selectedIds.length)
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    })
  },

  retryLoad: function() {
    this.loadTask()
  },

  backWorkbench: function() {
    wx.redirectTo({ url: '/pages/service/workbench/workbench' })
  },

  onPullDownRefresh: function() {
    this.loadTask()
    wx.stopPullDownRefresh()
  }
})
