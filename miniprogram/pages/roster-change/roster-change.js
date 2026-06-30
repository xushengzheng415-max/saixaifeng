// pages/roster-change/roster-change.js - 换人申请页
const db = wx.cloud.database()

Page({
  data: {
    loading: true,
    tournamentId: '',
    teamId: '',

    // 大名单上限与剩余次数
    rosterLimitText: '',
    maxRosterChanges: 3,
    remainingChanges: 3,
    remainingChangesText: '',
    noRemainingChanges: false,

    // 换出球员（当前淘汰赛大名单）
    rosterPlayers: [],
    rosterPlayersLen: 0,
    outPlayerId: '',
    outPlayerName: '',

    // 换入球员（球队球员库，排除已在名单中的）
    availablePlayers: [],
    availablePlayersLen: 0,
    inPlayerId: '',
    inPlayerName: '',

    // 换人原因
    reasonOptions: [
      { value: 'injury', label: '伤病', selected: false, selectedClass: '' },
      { value: 'suspension', label: '停赛', selected: false, selectedClass: '' },
      { value: 'tactical', label: '战术调整', selected: false, selectedClass: '' },
      { value: 'other', label: '其他', selected: false, selectedClass: '' }
    ],
    reason: '',
    reasonText: '',
    showReasonTextInput: false,

    // 预计算标志（WXML 铁律：仅插值）
    outPlayerSelected: false,
    inPlayerSelected: false,
    canSubmitChange: false,
    submitBtnClass: 'disabled'
  },

  onLoad(options) {
    var tournamentId = options.tournamentId || ''
    var teamId = options.teamId || ''
    this.setData({ tournamentId: tournamentId, teamId: teamId })

    if (!tournamentId || !teamId) {
      wx.showToast({ title: '参数缺失', icon: 'none' })
      this.setData({ loading: false })
      return
    }

    this.loadAll()
  },

  onShow() {
    if (this.data.tournamentId && this.data.teamId && !this.data.loading) {
      // 返回时刷新剩余次数
      this.loadRemainingChanges()
    }
  },

  // 加载所有数据
  loadAll: function () {
    var that = this
    that.setData({ loading: true })

    // 1. 加载赛事信息（取大名单上限、换人次数配置）
    db.collection('tournaments').doc(that.data.tournamentId).get({
      success: function (res) {
        var t = res.data || {}
        var maxChanges = (t.maxRosterChanges !== undefined && t.maxRosterChanges !== null) ? t.maxRosterChanges : 3
        var kMax = t.knockoutMaxPlayers || 0
        var limit = (kMax && kMax > 0) ? kMax : (that.resolveMaxPlayers(t))
        that.setData({
          maxRosterChanges: maxChanges,
          rosterLimitText: '淘汰赛每队大名单上限：' + limit + ' 人'
        })
        // 2. 加载淘汰赛大名单
        that.loadKnockoutRoster()
        // 3. 加载球队球员库
        that.loadTeamPlayers()
        // 4. 加载剩余换人次数
        that.loadRemainingChanges()
      },
      fail: function (err) {
        console.error('[roster-change] 加载赛事失败:', err)
        that.setData({ loading: false })
        wx.showToast({ title: '加载赛事失败', icon: 'none' })
      }
    })
  },

  // 读取每队大名单上限（回退链）
  resolveMaxPlayers: function (tournament) {
    if (!tournament) return 20
    if (tournament.maxPlayersPerTeam) return tournament.maxPlayersPerTeam
    if (tournament.maxPlayers) return tournament.maxPlayers
    if (tournament.matchFormat) {
      var defaults = { '11side': 35, '8side': 25, '7side': 20, '5side': 12 }
      if (defaults[tournament.matchFormat]) return defaults[tournament.matchFormat]
    }
    return 20
  },

  // 加载淘汰赛大名单（换出球员来源）
  loadKnockoutRoster: function () {
    var that = this
    db.collection('rosters')
      .where({
        tournamentId: that.data.tournamentId,
        teamId: that.data.teamId,
        stage: 'knockout'
      })
      .limit(1)
      .get({
        success: function (res) {
          var players = []
          if (res.data && res.data.length > 0) {
            players = res.data[0].players || []
          }
          // 预计算 selectedClass / selectedTag（WXML 铁律）
          var list = players.map(function (p) {
            return Object.assign({}, p, { selectedClass: '', selectedTag: '' })
          })
          that.setData({ rosterPlayers: list, rosterPlayersLen: list.length })
          that._updateFlags()
        },
        fail: function () {
          that.setData({ rosterPlayers: [], rosterPlayersLen: 0 })
          that._updateFlags()
        },
        complete: function () {
          that.setData({ loading: false })
        }
      })
  },

  // 加载球队球员库（换入球员来源）
  loadTeamPlayers: function () {
    var that = this
    db.collection('teams').doc(that.data.teamId).get({
      success: function (res) {
        var team = res.data || {}
        var allPlayers = team.players || []
        that._computeAvailablePlayers(allPlayers)
      },
      fail: function (err) {
        console.error('[roster-change] 加载球队球员库失败:', err)
        that.setData({ availablePlayers: [], availablePlayersLen: 0 })
        that._updateFlags()
      }
    })
  },

  // 计算可换入球员（排除已在淘汰赛大名单中的球员）
  _computeAvailablePlayers: function (allPlayers) {
    var rosterIds = {}
    var rosterPlayers = this.data.rosterPlayers || []
    for (var i = 0; i < rosterPlayers.length; i++) {
      var pid = rosterPlayers[i]._id || rosterPlayers[i].id || rosterPlayers[i].name
      if (pid) rosterIds[pid] = true
    }

    var available = []
    for (var j = 0; j < allPlayers.length; j++) {
      var p = allPlayers[j]
      var pid = p._id || p.id || p.name
      if (pid && rosterIds[pid]) continue // 已在名单中，跳过
      available.push(Object.assign({}, p, { selectedClass: '', selectedTag: '' }))
    }

    this.setData({ availablePlayers: available, availablePlayersLen: available.length })
    this._updateFlags()
  },

  // 加载剩余换人次数（查已通过申请数）
  loadRemainingChanges: function () {
    var that = this
    db.collection('roster_change_requests')
      .where({
        tournamentId: that.data.tournamentId,
        teamId: that.data.teamId,
        status: 'approved'
      })
      .count({
        success: function (cntRes) {
          var used = cntRes.total || 0
          var max = that.data.maxRosterChanges || 3
          var remaining = max - used
          if (remaining < 0) remaining = 0
          that.setData({
            remainingChanges: remaining,
            remainingChangesText: '剩余换人申请次数：' + remaining + ' / ' + max + ' 次',
            noRemainingChanges: (remaining <= 0)
          })
          that._updateFlags()
        },
        fail: function () {
          var max = that.data.maxRosterChanges || 3
          that.setData({
            remainingChanges: max,
            remainingChangesText: '剩余换人申请次数：' + max + ' / ' + max + ' 次',
            noRemainingChanges: false
          })
          that._updateFlags()
        }
      })
  },

  // 选择换出球员
  onSelectOutPlayer: function (e) {
    var idx = e.currentTarget.dataset.index
    var players = this.data.rosterPlayers
    var selectedId = this.data.outPlayerId

    for (var i = 0; i < players.length; i++) {
      if (i === idx) {
        if (players[i]._id === selectedId || players[i].id === selectedId || players[i].name === selectedId) {
          // 再次点击取消选择
          players[i].selectedClass = ''
          players[i].selectedTag = ''
          this.setData({
            rosterPlayers: players,
            outPlayerId: '',
            outPlayerName: ''
          })
        } else {
          players[i].selectedClass = 'selected'
          players[i].selectedTag = '换出'
          this.setData({
            rosterPlayers: players,
            outPlayerId: players[i]._id || players[i].id || players[i].name,
            outPlayerName: players[i].name
          })
        }
      } else {
        players[i].selectedClass = ''
        players[i].selectedTag = ''
      }
    }
    this.setData({ rosterPlayers: players })
    this._updateFlags()
  },

  // 选择换入球员
  onSelectInPlayer: function (e) {
    var idx = e.currentTarget.dataset.index
    var players = this.data.availablePlayers
    var selectedId = this.data.inPlayerId

    for (var i = 0; i < players.length; i++) {
      if (i === idx) {
        if (players[i]._id === selectedId || players[i].id === selectedId || players[i].name === selectedId) {
          players[i].selectedClass = ''
          players[i].selectedTag = ''
          this.setData({
            availablePlayers: players,
            inPlayerId: '',
            inPlayerName: ''
          })
        } else {
          players[i].selectedClass = 'selected'
          players[i].selectedTag = '换入'
          this.setData({
            availablePlayers: players,
            inPlayerId: players[i]._id || players[i].id || players[i].name,
            inPlayerName: players[i].name
          })
        }
      } else {
        players[i].selectedClass = ''
        players[i].selectedTag = ''
      }
    }
    this.setData({ availablePlayers: players })
    this._updateFlags()
  },

  // 选择换人原因
  onSelectReason: function (e) {
    var idx = e.currentTarget.dataset.index
    var options = this.data.reasonOptions
    for (var i = 0; i < options.length; i++) {
      if (i === idx) {
        options[i].selected = true
        options[i].selectedClass = 'selected'
      } else {
        options[i].selected = false
        options[i].selectedClass = ''
      }
    }
    var selected = options[idx]
    this.setData({
      reasonOptions: options,
      reason: selected.value,
      showReasonTextInput: (selected.value === 'other')
    })
    this._updateFlags()
  },

  // 其他原因文字输入
  onReasonTextInput: function (e) {
    this.setData({ reasonText: e.detail.value })
  },

  // 预计算所有 WXML 标志
  _updateFlags: function () {
    var d = this.data
    var outSelected = !!d.outPlayerId
    var inSelected = !!d.inPlayerId
    var hasReason = !!d.reason
    var noRemaining = d.noRemainingChanges
    var canSubmit = (outSelected && inSelected && hasReason && !noRemaining)

    this.setData({
      outPlayerSelected: outSelected,
      inPlayerSelected: inSelected,
      canSubmitChange: canSubmit,
      submitBtnClass: canSubmit ? '' : 'disabled'
    })
  },

  // 提交换人申请
  onSubmitChange: function () {
    var that = this
    var d = this.data

    if (!d.canSubmitChange) {
      wx.showToast({ title: '请完成换出、换入选择和原因', icon: 'none' })
      return
    }

    // 找到换出/换入球员完整信息
    var outPlayer = null
    for (var i = 0; i < d.rosterPlayers.length; i++) {
      var pid = d.rosterPlayers[i]._id || d.rosterPlayers[i].id || d.rosterPlayers[i].name
      if (pid === d.outPlayerId) { outPlayer = d.rosterPlayers[i]; break }
    }
    var inPlayer = null
    for (var j = 0; j < d.availablePlayers.length; j++) {
      var pid2 = d.availablePlayers[j]._id || d.availablePlayers[j].id || d.availablePlayers[j].name
      if (pid2 === d.inPlayerId) { inPlayer = d.availablePlayers[j]; break }
    }

    if (!outPlayer || !inPlayer) {
      wx.showToast({ title: '球员信息异常，请重新选择', icon: 'none' })
      return
    }

    wx.showModal({
      title: '确认提交',
      content: '换出：' + outPlayer.name + '\n换入：' + inPlayer.name + '\n确认提交换人申请？',
      success: function (res) {
        if (res.confirm) {
          that._callSubmitCloudFunction(outPlayer, inPlayer)
        }
      }
    })
  },

  // 调用云函数提交
  _callSubmitCloudFunction: function (outPlayer, inPlayer) {
    var that = this
    var d = this.data

    wx.showLoading({ title: '提交中...' })

    wx.cloud.callFunction({
      name: 'submitRosterChange',
      data: {
        tournamentId: d.tournamentId,
        teamId: d.teamId,
        outPlayerId: outPlayer._id || outPlayer.id || outPlayer.name,
        outPlayerName: outPlayer.name,
        outPlayerNumber: outPlayer.number || '',
        inPlayerId: inPlayer._id || inPlayer.id || inPlayer.name,
        inPlayerName: inPlayer.name,
        inPlayerNumber: inPlayer.number || '',
        inPlayerInfo: {
          idCard: inPlayer.idCard || '',
          phone: inPlayer.phone || inPlayer.phoneNumber || ''
        },
        reason: d.reason,
        reasonText: d.reason === 'other' ? d.reasonText : ''
      },
      success: function (cfRes) {
        wx.hideLoading()
        var result = cfRes.result || {}
        if (result.success) {
          wx.showToast({ title: '换人申请已提交', icon: 'success' })
          // 刷新剩余次数
          that.loadRemainingChanges()
          // 重置选择
          that._resetSelection()
        } else {
          wx.showToast({ title: result.message || '提交失败', icon: 'none', duration: 2500 })
        }
      },
      fail: function (err) {
        wx.hideLoading()
        console.error('[roster-change] 云函数调用失败:', err)
        wx.showToast({ title: '提交失败，请重试', icon: 'none' })
      }
    })
  },

  // 重置选择状态
  _resetSelection: function () {
    var rosterPlayers = this.data.rosterPlayers.map(function (p) {
      return Object.assign({}, p, { selectedClass: '', selectedTag: '' })
    })
    var availablePlayers = this.data.availablePlayers.map(function (p) {
      return Object.assign({}, p, { selectedClass: '', selectedTag: '' })
    })
    var reasonOptions = this.data.reasonOptions.map(function (r) {
      return Object.assign({}, r, { selected: false, selectedClass: '' })
    })
    this.setData({
      rosterPlayers: rosterPlayers,
      availablePlayers: availablePlayers,
      reasonOptions: reasonOptions,
      outPlayerId: '',
      outPlayerName: '',
      inPlayerId: '',
      inPlayerName: '',
      reason: '',
      reasonText: '',
      showReasonTextInput: false
    })
    this._updateFlags()
  }
})
