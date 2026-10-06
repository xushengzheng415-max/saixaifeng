// packageA/pages/lineup/lineup.js
// 教练提交首发阵容 - 横屏模式 - 纯 ES5 语法
var db = wx.cloud.database()
var _ = db.command

Page({
  data: {
    matchId: '',
    teamId: '',
    isHome: true,
    teamName: '',
    opponentName: '',
    isReadOnly: false,
    isSubmitting: false,
    formations: [],
    currentFormation: null,
    positions: [],
    selectedCount: 0,
    substitutes: [],
    showPlayerPanel: false,
    currentPositionIndex: -1,
    currentPositionLabel: '',
    allPlayers: [],
    filteredPlayers: [],
    searchKeyword: '',
    selectedPlayerId: '',
    showFormationModal: false,
    showSuccessModal: false
  ,
  },
  onLoad: function(options) {
    var matchId = (options.matchId || '')
    var teamId = (options.teamId || '')
    var isHome = (options.isHome !== 'false')

    this.setData({
      matchId: matchId,
      teamId: teamId,
      isHome: isHome
    })

    this.loadFormations()
    this.loadTeamInfo()
    this.loadPlayers()
    this.checkSubmitted()
  },

  // ========== 阵型数据 ==========
  loadFormations: function() {
    var formations = [
      {
        id: '4-4-2',
        name: '4-4-2',
        playerCount: 11,
        positions: [
          { id: 'gk',  label: 'GK', x: 50, y: 92, type: 'gk' },
          { id: 'lb',  label: 'LB', x: 15, y: 72, type: 'def' },
          { id: 'cb1', label: 'CB', x: 35, y: 78, type: 'def' },
          { id: 'cb2', label: 'CB', x: 65, y: 78, type: 'def' },
          { id: 'rb',  label: 'RB', x: 85, y: 72, type: 'def' },
          { id: 'lm',  label: 'LM', x: 15, y: 42, type: 'mid' },
          { id: 'cm1', label: 'CM', x: 35, y: 48, type: 'mid' },
          { id: 'cm2', label: 'CM', x: 65, y: 48, type: 'mid' },
          { id: 'rm',  label: 'RM', x: 85, y: 42, type: 'mid' },
          { id: 'st1', label: 'ST', x: 35, y: 15, type: 'fwd' },
          { id: 'st2', label: 'ST', x: 65, y: 15, type: 'fwd' }
        ]
      },
      {
        id: '4-3-3',
        name: '4-3-3',
        playerCount: 11,
        positions: [
          { id: 'gk',  label: 'GK', x: 50, y: 92, type: 'gk' },
          { id: 'lb',  label: 'LB', x: 15, y: 72, type: 'def' },
          { id: 'cb1', label: 'CB', x: 35, y: 78, type: 'def' },
          { id: 'cb2', label: 'CB', x: 65, y: 78, type: 'def' },
          { id: 'rb',  label: 'RB', x: 85, y: 72, type: 'def' },
          { id: 'cdm',  label: 'CDM', x: 50, y: 58, type: 'mid' },
          { id: 'cm',  label: 'CM', x: 35, y: 42, type: 'mid' },
          { id: 'cam', label: 'CAM', x: 65, y: 38, type: 'mid' },
          { id: 'st1', label: 'ST', x: 25, y: 15, type: 'fwd' },
          { id: 'st2', label: 'ST', x: 50, y: 12, type: 'fwd' },
          { id: 'st3', label: 'ST', x: 75, y: 15, type: 'fwd' }
        ]
      },
      {
        id: '3-5-2',
        name: '3-5-2',
        playerCount: 11,
        positions: [
          { id: 'gk',  label: 'GK', x: 50, y: 92, type: 'gk' },
          { id: 'cb1', label: 'CB', x: 25, y: 75, type: 'def' },
          { id: 'cb2', label: 'CB', x: 50, y: 78, type: 'def' },
          { id: 'cb3', label: 'CB', x: 75, y: 75, type: 'def' },
          { id: 'lwb', label: 'LWB', x: 10, y: 50, type: 'mid' },
          { id: 'cm1', label: 'CM', x: 30, y: 48, type: 'mid' },
          { id: 'cm2', label: 'CM', x: 50, y: 50, type: 'mid' },
          { id: 'cm3', label: 'CM', x: 70, y: 48, type: 'mid' },
          { id: 'rwb', label: 'RWB', x: 90, y: 50, type: 'mid' },
          { id: 'st1', label: 'ST', x: 35, y: 15, type: 'fwd' },
          { id: 'st2', label: 'ST', x: 65, y: 15, type: 'fwd' }
        ]
      },
      {
        id: '4-2-3-1',
        name: '4-2-3-1',
        playerCount: 11,
        positions: [
          { id: 'gk',  label: 'GK', x: 50, y: 92, type: 'gk' },
          { id: 'lb',  label: 'LB', x: 15, y: 72, type: 'def' },
          { id: 'cb1', label: 'CB', x: 35, y: 78, type: 'def' },
          { id: 'cb2', label: 'CB', x: 65, y: 78, type: 'def' },
          { id: 'rb',  label: 'RB', x: 85, y: 72, type: 'def' },
          { id: 'cdm1', label: 'CDM', x: 35, y: 55, type: 'mid' },
          { id: 'cdm2', label: 'CDM', x: 65, y: 55, type: 'mid' },
          { id: 'lam',  label: 'LAM', x: 20, y: 35, type: 'mid' },
          { id: 'cam',  label: 'CAM', x: 50, y: 38, type: 'mid' },
          { id: 'ram',  label: 'RAM', x: 80, y: 35, type: 'mid' },
          { id: 'st',   label: 'ST', x: 50, y: 15, type: 'fwd' }
        ]
      },
      {
        id: '4-5-1',
        name: '4-5-1',
        playerCount: 11,
        positions: [
          { id: 'gk',  label: 'GK', x: 50, y: 92, type: 'gk' },
          { id: 'lb',  label: 'LB', x: 15, y: 72, type: 'def' },
          { id: 'cb1', label: 'CB', x: 35, y: 78, type: 'def' },
          { id: 'cb2', label: 'CB', x: 65, y: 78, type: 'def' },
          { id: 'rb',  label: 'RB', x: 85, y: 72, type: 'def' },
          { id: 'lm',  label: 'LM', x: 12, y: 45, type: 'mid' },
          { id: 'cm1', label: 'CM', x: 30, y: 50, type: 'mid' },
          { id: 'cm2', label: 'CM', x: 50, y: 52, type: 'mid' },
          { id: 'cm3', label: 'CM', x: 70, y: 50, type: 'mid' },
          { id: 'rm',  label: 'RM', x: 88, y: 45, type: 'mid' },
          { id: 'am',  label: 'AM', x: 50, y: 30, type: 'mid' },
          { id: 'st',  label: 'ST', x: 50, y: 12, type: 'fwd' }
        ]
      }
    ]

    // 初始化 positions（空位）
    var initPositions = []
    for (var i = 0; i < formations[0].positions.length; i++) {
      var p = formations[0].positions[i]
      initPositions.push({
        id: p.id,
        label: p.label,
        x: p.x,
        y: p.y,
        type: p.type,
        playerId: '',
        playerName: '',
        jerseyNumber: ''
      })
    }

    this.setData({
      formations: formations,
      currentFormation: formations[0],
      positions: initPositions,
      selectedCount: 0
    })
  },

  // ========== 数据加载 ==========
  loadTeamInfo: function() {
    var that = this
    db.collection('teams').doc(this.data.teamId).get({
      success: function(res) {
        if (res.data) {
          that.setData({ teamName: res.data.name || '我方球队' })
        }
        that.loadOpponentInfo()
      },
      fail: function(err) {
        console.error('加载球队信息失败:', err)
      }
    })
  },

  loadOpponentInfo: function() {
    var that = this
    db.collection('matches').doc(this.data.matchId).get({
      success: function(res) {
        if (!res.data) return
        var opponentId = that.data.isHome
          ? res.data.awayTeamId
          : res.data.homeTeamId
        if (!opponentId) return
        db.collection('teams').doc(opponentId).get({
          success: function(oppRes) {
            if (oppRes.data) {
              that.setData({ opponentName: oppRes.data.name || '对手球队' })
            }
          }
        })
      }
    })
  },

  loadPlayers: function() {
    var that = this
    db.collection('players')
      .where({ teamId: that.data.teamId })
      .orderBy('jerseyNumber', 'asc')
      .get({
        success: function(res) {
          that.setData({ allPlayers: (res.data || []) })
          that.loadSavedLineup()
        },
        fail: function(err) {
          console.error('加载球员失败:', err)
          wx.showToast({ title: '加载球员失败', icon: 'none' })
        }
      })
  },

  checkSubmitted: function() {
    var that = this
    db.collection('matches').doc(this.data.matchId).get({
      success: function(res) {
        if (!res.data) return
        var field = that.data.isHome ? 'homeLineup' : 'awayLineup'
        var lineup = res.data[field]
        if (lineup && lineup.submitted === true) {
          that.setData({ isReadOnly: true })
          wx.showModal({
            title: '提示',
            content: '首发阵容已提交，如需修改请联系第四官员',
            showCancel: false
          })
        }
      }
    })
  },

  loadSavedLineup: function() {
    var that = this
    db.collection('matches').doc(this.data.matchId).get({
      success: function(res) {
        if (!res.data) return
        var field = that.data.isHome ? 'homeLineup' : 'awayLineup'
        var lineup = res.data[field]
        if (!lineup || !lineup.positions) return

        // 填充已选位置
        var newPositions = []
        for (var i = 0; i < that.data.positions.length; i++) {
          var p = that.data.positions[i]
          var saved = null
          for (var j = 0; j < lineup.positions.length; j++) {
            if (lineup.positions[j].positionId === p.id) {
              saved = lineup.positions[j]
              break
            }
          }
          if (saved) {
            newPositions.push({
              id: p.id,
              label: p.label,
              x: p.x,
              y: p.y,
              type: p.type,
              playerId: saved.playerId || '',
              playerName: saved.playerName || '',
              jerseyNumber: saved.jerseyNumber || ''
            })
          } else {
            newPositions.push(p)
          }
        }

        // 计算已选数量
        var count = 0
        for (var k = 0; k < newPositions.length; k++) {
          if (newPositions[k].playerId) count++
        }

        // 填充替补
        var subs = []
        if (lineup.substitutes && lineup.substitutes.length) {
          for (var m = 0; m < lineup.substitutes.length; m++) {
            var sub = lineup.substitutes[m]
            // 尝试从 allPlayers 找姓名
            var foundName = ''
            var foundNum = ''
            var foundPos = ''
            for (var n = 0; n < that.data.allPlayers.length; n++) {
              if (that.data.allPlayers[n]._id === sub.playerId) {
                foundName = that.data.allPlayers[n].name || ''
                foundNum = that.data.allPlayers[n].jerseyNumber || ''
                foundPos = that.data.allPlayers[n].position || ''
                break
              }
            }
            subs.push({
              id: sub.playerId || '',
              name: foundName || (sub.playerName || ''),
              jerseyNumber: foundNum || (sub.jerseyNumber || ''),
              position: foundPos || ''
            })
          }
        }

        that.setData({
          positions: newPositions,
          selectedCount: count,
          substitutes: subs
        })
      }
    })
  },

  // ========== 交互事件 ==========
  onPositionTap: function(e) {
    if (this.data.isReadOnly) {
      wx.showToast({ title: '已提交，不可修改', icon: 'none' })
      return
    }
    var index = e.currentTarget.dataset.index
    var positions = this.data.positions
    var position = positions[index]

    // 收集已被使用的球员 ID
    var usedIds = []
    for (var i = 0; i < positions.length; i++) {
      if (positions[i].playerId) {
        usedIds.push(positions[i].playerId)
      }
    }
    for (var j = 0; j < this.data.substitutes.length; j++) {
      usedIds.push(this.data.substitutes[j].id)
    }

    // 过滤可用球员
    var filtered = []
    for (var k = 0; k < this.data.allPlayers.length; k++) {
      var pl = this.data.allPlayers[k]
      var used = false
      for (var u = 0; u < usedIds.length; u++) {
        if (usedIds[u] === pl._id) {
          used = true
          break
        }
      }
      if (!used) filtered.push(pl)
    }

    this.setData({
      showPlayerPanel: true,
      currentPositionIndex: index,
      currentPositionLabel: position.label,
      filteredPlayers: filtered,
      searchKeyword: '',
      selectedPlayerId: position.playerId || ''
    })
  },

  onSearchInput: function(e) {
    var keyword = (e.detail.value || '').toLowerCase()
    var positions = this.data.positions

    var usedIds = []
    for (var i = 0; i < positions.length; i++) {
      if (positions[i].playerId) {
        usedIds.push(positions[i].playerId)
      }
    }
    for (var j = 0; j < this.data.substitutes.length; j++) {
      usedIds.push(this.data.substitutes[j].id)
    }

    var filtered = []
    for (var k = 0; k < this.data.allPlayers.length; k++) {
      var pl = this.data.allPlayers[k]
      // 跳过已使用
      var used = false
      for (var u = 0; u < usedIds.length; u++) {
        if (usedIds[u] === pl._id) {
          used = true
          break
        }
      }
      if (used) continue
      if (!keyword) {
        filtered.push(pl)
      } else {
        var nameMatch = pl.name && pl.name.toLowerCase().indexOf(keyword) !== -1
        var numStr = pl.jerseyNumber ? String(pl.jerseyNumber) : ''
        var numMatch = numStr.indexOf(keyword) !== -1
        if (nameMatch || numMatch) filtered.push(pl)
      }
    }

    this.setData({
      searchKeyword: keyword,
      filteredPlayers: filtered
    })
  },

  // 选择球员（首发位置 或 替补）
  onPlayerSelect: function(e) {
    var player = e.currentTarget.dataset.player
    if (!player) return
    if (!player._id) return

    var index = this.data.currentPositionIndex

    if (index >= 0) {
      // ===== 填充首发位置 =====
      var keyId = 'positions[' + index + '].playerId'
      var keyName = 'positions[' + index + '].playerName'
      var keyNum = 'positions[' + index + '].jerseyNumber'
      var data = {}
      data[keyId] = player._id
      data[keyName] = player.name || ''
      data[keyNum] = player.jerseyNumber || ''

      // 重新计算 selectedCount
      var newPositions = []
      for (var i = 0; i < this.data.positions.length; i++) {
        if (i === index) {
          newPositions.push({
            id: this.data.positions[i].id,
            label: this.data.positions[i].label,
            x: this.data.positions[i].x,
            y: this.data.positions[i].y,
            type: this.data.positions[i].type,
            playerId: player._id,
            playerName: player.name || '',
            jerseyNumber: player.jerseyNumber || ''
          })
        } else {
          newPositions.push(this.data.positions[i])
        }
      }
      var count = 0
      for (var j = 0; j < newPositions.length; j++) {
        if (newPositions[j].playerId) count++
      }

      data.positions = newPositions
      data.selectedCount = count
      data.showPlayerPanel = false
      data.selectedPlayerId = ''
      this.setData(data)

    } else {
      // ===== 添加替补（currentPositionIndex === -1）=====
      if (this.data.substitutes.length >= 12) {
        wx.showToast({ title: '最多12名替补', icon: 'none' })
        return
      }

      // 检查是否已被使用
      var usedIds = []
      for (var a = 0; a < this.data.positions.length; a++) {
        if (this.data.positions[a].playerId) {
          usedIds.push(this.data.positions[a].playerId)
        }
      }
      for (var b = 0; b < this.data.substitutes.length; b++) {
        usedIds.push(this.data.substitutes[b].id)
      }
      var already = false
      for (var c = 0; c < usedIds.length; c++) {
        if (usedIds[c] === player._id) {
          already = true
          break
        }
      }
      if (already) {
        wx.showToast({ title: '该球员已在阵容中', icon: 'none' })
        return
      }

      var newSubs = this.data.substitutes.slice()
      newSubs.push({
        id: player._id,
        name: player.name || '',
        jerseyNumber: player.jerseyNumber || '',
        position: player.position || ''
      })

      this.setData({
        substitutes: newSubs,
        showPlayerPanel: false,
        selectedPlayerId: ''
      })
    }
  },

  onRemovePlayer: function() {
    var index = this.data.currentPositionIndex
    if (index < 0) return

    var keyId = 'positions[' + index + '].playerId'
    var keyName = 'positions[' + index + '].playerName'
    var keyNum = 'positions[' + index + '].jerseyNumber'
    var data = {}
    data[keyId] = ''
    data[keyName] = ''
    data[keyNum] = ''

    var newPositions = []
    for (var i = 0; i < this.data.positions.length; i++) {
      if (i === index) {
        newPositions.push({
          id: this.data.positions[i].id,
          label: this.data.positions[i].label,
          x: this.data.positions[i].x,
          y: this.data.positions[i].y,
          type: this.data.positions[i].type,
          playerId: '',
          playerName: '',
          jerseyNumber: ''
        })
      } else {
        newPositions.push(this.data.positions[i])
      }
    }
    var count = 0
    for (var j = 0; j < newPositions.length; j++) {
      if (newPositions[j].playerId) count++
    }

    data.positions = newPositions
    data.selectedCount = count
    data.showPlayerPanel = false
    data.selectedPlayerId = ''
    this.setData(data)
  },

  closePlayerPanel: function() {
    this.setData({ showPlayerPanel: false })
  },

  // ========== 替补管理 ==========
  onAddSubstitute: function() {
    if (this.data.isReadOnly) {
      wx.showToast({ title: '已提交，不可修改', icon: 'none' })
      return
    }
    if (this.data.substitutes.length >= 12) {
      wx.showToast({ title: '最多12名替补', icon: 'none' })
      return
    }

    var usedIds = []
    for (var i = 0; i < this.data.positions.length; i++) {
      if (this.data.positions[i].playerId) {
        usedIds.push(this.data.positions[i].playerId)
      }
    }
    for (var j = 0; j < this.data.substitutes.length; j++) {
      usedIds.push(this.data.substitutes[j].id)
    }

    var available = []
    for (var k = 0; k < this.data.allPlayers.length; k++) {
      var pl = this.data.allPlayers[k]
      var used = false
      for (var u = 0; u < usedIds.length; u++) {
        if (usedIds[u] === pl._id) {
          used = true
          break
        }
      }
      if (!used) available.push(pl)
    }

    if (available.length === 0) {
      wx.showToast({ title: '无可用球员', icon: 'none' })
      return
    }

    this.setData({
      showPlayerPanel: true,
      currentPositionIndex: -1,
      currentPositionLabel: '添加替补',
      filteredPlayers: available,
      searchKeyword: '',
      selectedPlayerId: ''
    })
  },

  onRemoveSubstitute: function(e) {
    if (this.data.isReadOnly) {
      wx.showToast({ title: '已提交，不可修改', icon: 'none' })
      return
    }
    var index = e.currentTarget.dataset.index
    var newSubs = []
    for (var i = 0; i < this.data.substitutes.length; i++) {
      if (i !== index) newSubs.push(this.data.substitutes[i])
    }
    this.setData({ substitutes: newSubs })
  },

  // ========== 阵型选择 ==========
  showFormationPicker: function() {
    this.setData({ showFormationModal: true })
  },

  hideFormationPicker: function() {
    this.setData({ showFormationModal: false })
  },

  onFormationSelect: function(e) {
    var formation = e.currentTarget.dataset.formation
    if (!formation) return

    // 保留已选球员（同类型优先）
    var oldPositions = this.data.positions
    var newPositions = []
    for (var i = 0; i < formation.positions.length; i++) {
      var fp = formation.positions[i]
      var keptPlayer = null
      for (var j = 0; j < oldPositions.length; j++) {
        if (oldPositions[j].type === fp.type && oldPositions[j].playerId) {
          keptPlayer = oldPositions[j]
          break
        }
      }
      if (keptPlayer) {
        newPositions.push({
          id: fp.id,
          label: fp.label,
          x: fp.x,
          y: fp.y,
          type: fp.type,
          playerId: keptPlayer.playerId,
          playerName: keptPlayer.playerName,
          jerseyNumber: keptPlayer.jerseyNumber
        })
      } else {
        newPositions.push({
          id: fp.id,
          label: fp.label,
          x: fp.x,
          y: fp.y,
          type: fp.type,
          playerId: '',
          playerName: '',
          jerseyNumber: ''
        })
      }
    }

    var count = 0
    for (var k = 0; k < newPositions.length; k++) {
      if (newPositions[k].playerId) count++
    }

    this.setData({
      currentFormation: formation,
      positions: newPositions,
      selectedCount: count,
      showFormationModal: false
    })
  },

  // ========== 提交 ==========
  onCancel: function() {
    wx.navigateBack()
  },

  onSubmit: function() {
    if (this.data.selectedCount < 11) {
      wx.showToast({ title: '请选满11名首发', icon: 'none' })
      return
    }
    if (this.data.isReadOnly) {
      wx.showToast({ title: '已提交，不可重复提交', icon: 'none' })
      return
    }
    var that = this
    wx.showModal({
      title: '确认提交',
      content: '提交后不可修改，如需修改需联系第四官员。确认提交？',
      success: function(res) {
        if (res.confirm) {
          that.doSubmit()
        }
      }
    })
  },

  doSubmit: function() {
    if (this.data.isSubmitting) return
    this.setData({ isSubmitting: true })

    // 构造首发名单
    var starters = []
    for (var i = 0; i < this.data.positions.length; i++) {
      var p = this.data.positions[i]
      starters.push({
        positionId: p.id,
        positionLabel: p.label,
        playerId: p.playerId || '',
        playerName: p.playerName || '',
        jerseyNumber: p.jerseyNumber || ''
      })
    }

    // 构造替补名单
    var substitutes = []
    for (var j = 0; j < this.data.substitutes.length; j++) {
      var s = this.data.substitutes[j]
      substitutes.push({
        playerId: s.id || '',
        playerName: s.name || '',
        jerseyNumber: s.jerseyNumber || '',
        position: s.position || ''
      })
    }

    var lineupData = {
      formation: (this.data.currentFormation && this.data.currentFormation.name) || '',
      positions: starters,
      substitutes: substitutes,
      submitted: true,
      submittedAt: new Date(),
      submittedBy: (wx.getStorageSync('userId') || '')
    }

    var field = this.data.isHome ? 'homeLineup' : 'awayLineup'
    var that = this

    wx.cloud.callFunction({
      name: 'updateMatchLineup',
      data: {
        matchId: that.data.matchId,
        lineupField: field,
        lineupData: lineupData
      },
      success: function(res) {
        that.setData({ isSubmitting: false })
        if (res.result && res.result.code === 0) {
          that.setData({
            isReadOnly: true,
            showSuccessModal: true
          })
        } else {
          wx.showToast({
            title: (res.result && res.result.message) || '提交失败',
            icon: 'none'
          })
        }
      },
      fail: function(err) {
        that.setData({ isSubmitting: false })
        console.error('提交首发阵容失败:', err)
        wx.showToast({ title: '提交失败，请重试', icon: 'none' })
      }
    })
  },

  onSuccessConfirm: function() {
    this.setData({ showSuccessModal: false })
    wx.navigateBack()
  }
})
