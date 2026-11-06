var workspace = require('../../../utils/workspace')
var cardService = require('../../../utils/player-card')
var lineupLayout = require('../../../utils/lineup-layout')

var POSITION_TEXT = { GK: '守门员', DF: '后卫', MF: '中场', FW: '前锋' }

function positionText(code) {
  var value = String(code || '').trim()
  return POSITION_TEXT[value.toUpperCase()] || (/[\u4e00-\u9fa5]/.test(value) ? value : '')
}

// 本页可选阵型：与 PC 端 web-admin-vue/src/data/formation-data.json 同一套、同顺序。
// 站位坐标不手写，统一由 lineupLayout 按「阵型 id = 每排人数」计算。
var SQUAD_FORMATIONS = {
  5: ['2-2', '3-1', '1-2-1', '2-1-1'],
  7: ['3-2-1', '2-3-1', '2-1-2-1', '1-4-1'],
  8: ['3-3-1', '3-2-2', '2-2-3', '4-2-1', '1-3-2-1'],
  9: ['3-3-2', '3-4-1', '3-2-3'],
  11: ['4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '3-4-3', '5-3-2', '5-4-1']
}

var FORMATIONS = {}
Object.keys(SQUAD_FORMATIONS).forEach(function (key) {
  var rows = lineupLayout.FORMATIONS[key] || []
  FORMATIONS[key] = SQUAD_FORMATIONS[key].map(function (id) {
    var row = rows.filter(function (item) { return item.id === id })[0]
    return row ? { id: row.id, label: row.id } : null
  }).filter(Boolean)
})

function slotsFor(minPlayers, formation) {
  var rows = FORMATIONS[minPlayers]
  if (!rows || !rows.length) return []
  var current = rows.filter(function (item) { return item.id === formation })[0] || rows[0]
  // slotId 保持 slot-<序号>：提交接口按序号换算位置，历史阵容也按同一规则回填。
  return lineupLayout.slotsFor(minPlayers, current.id).map(function (slot, index) {
    return Object.assign({}, slot, { id: 'slot-' + index })
  })
}

function selectedIds(slots, substitutes) {
  return slots.map(function (item) { return item.playerId }).filter(Boolean).concat(substitutes.map(function (item) { return item.id }))
}

function decorateSlots(slots, selectedSlotId) {
  return slots.map(function (slot) {
    return Object.assign({}, slot, { slotClass: (slot.empty ? 'empty ' : '') + (slot.id === selectedSlotId ? 'active' : '') })
  })
}

Page({
  data: {
    matchId: '', teamId: '', loading: true, saving: false, confirmingArrival:false, canManage: false, match: {}, minPlayers: 0, sizeText: '', sizeUnsupported: false, teamArrived:false, allArrived:false, arrivalStatusText:'待报到', arrivalButtonText:'确认本队到场', arrivalButtonDisabled:true, canConfirmArrival:false,
    formation: '', formationOptions: [], slots: [], selectedSlotId: '', substitutes: [], benchLimit: 5,
    headCoach: null, headCoachState: 'missing',
    starterCount: 0, substituteCount: 0, selectedCount: 0, submitDisabled: true, locked: false, preSubmitted: false, allowPreSubmit: false, finalWindowOpen: false, submitButtonText: '确认并提交本场阵容', submissionWindowText: '', returned: false, returnReason: '', emptyPlayers: false,
    dragging: false, draggingPlayerId: '', draggingPlayerName: '',
    playerPickerVisible: false, pickerMode: 'starter', pickerIsStarter:true, pickerTitle: '', pickerHint: '', pickerPlayers: [], pickerAllPlayers: [], pickerHasPreferred: false, pickerEmpty: false, cardAssetsError: false
  },
  onLoad: function (options) {
    var query = options || {}
    this.setData({ matchId: String(query.matchId || ''), teamId: String(query.teamId || ''), isDevtools: workspace.isVisualQaEnabled(query) })
    if (this.data.isDevtools) { this.loadVisualFixture(String(query.picker || '') === '1'); return }
    this.load()
  },
  onShow:function(){var self=this;this.refreshCardMetadata();clearInterval(this._cardTimer);this._cardTimer=setInterval(function(){self.refreshCardMetadata()},60000)},
  onHide:function(){clearInterval(this._cardTimer)},
  onUnload:function(){clearInterval(this._cardTimer);this._cardGeneration=(this._cardGeneration||0)+1},
  refreshCardMetadata:function(){
    var rows=this._rosterPlayers||[];if(this.data.isDevtools||!rows.length||this._readingCards)return
    this._readingCards=true;var self=this,generation=this._cardGeneration||0
    cardService.batch(rows.map(function(player){return player.id}),this.data.teamId).then(function(result){
      if(generation!==(self._cardGeneration||0))return
      var byId={};(result.cards||[]).forEach(function(card){byId[card.playerId]=card})
      function metadata(item,id){var card=byId[id];return card?Object.assign({},item,{cardScene:card.cardScene||null,cardUrl:card.cardUrl||'',cardState:card.status,portraitUrl:card.portraitUrl||'',avatar:card.portraitUrl||item.avatar||'',photoUrl:card.portraitUrl||item.photoUrl||'',templateId:card.templateId||'',publishedVersion:card.publishedVersion||0,cardDataVersion:card.cardDataVersion||0}):item}
      self._rosterPlayers=rows.map(function(player){return metadata(player,player.id)})
      self.setData({slots:self.data.slots.map(function(slot){return metadata(slot,slot.playerId)}),substitutes:self.data.substitutes.map(function(player){return metadata(player,player.id)}),pickerPlayers:self.data.pickerPlayers.map(function(player){return metadata(player,player.id)}),pickerAllPlayers:self.data.pickerAllPlayers.map(function(player){return metadata(player,player.id)})})
    }).catch(function(error){console.warn('[card-refresh]',error.message)}).finally(function(){self._readingCards=false})
  },
  loadVisualFixture: function (showPicker) {
    var min = 8
    var formation = '2-3-2'
    var options = FORMATIONS[min].map(function (item, index) { return { id: item.id, label: item.label, selected: index === 0, tabClass: index === 0 ? 'selected' : '' } })
    var players = [
      { id: 'p1', name: '周一航', jerseyNumber: 1, position: 'GK' }, { id: 'p2', name: '赵天宇', jerseyNumber: 4, position: 'DF' }, { id: 'p3', name: '王浩宇', jerseyNumber: 8, position: 'DF' },
      { id: 'p4', name: '陈思远', jerseyNumber: 10, position: 'MF' }, { id: 'p5', name: '刘子墨', jerseyNumber: 7, position: 'MF' }, { id: 'p6', name: '张子轩', jerseyNumber: 11, position: 'MF' },
      { id: 'p7', name: '李昊阳', jerseyNumber: 9, position: 'FW' }, { id: 'p8', name: '孙子豪', jerseyNumber: 12, position: 'DF' }, { id: 'p9', name: '马子航', jerseyNumber: 15, position: 'DF' },
      { id: 'p10', name: '李泽宇', jerseyNumber: 16, position: 'MF' }, { id: 'p11', name: '周子睿', jerseyNumber: 17, position: 'FW' }
    ]
    var slots = slotsFor(min, formation)
    this.setData({ loading: false, canManage: true, match: { homeTeamName: '本队', awayTeamName: '对手', matchDate: '8月2日 10:30', venue: '1号场地', homeLogo: '', awayLogo: '' }, minPlayers: min, formationOptions: options, formation: formation, slots: decorateSlots(slots, ''), substitutes: [], benchLimit: 8, locked: false, returned: false, emptyPlayers: false, allowPreSubmit: true, submitButtonText: '赛前预提交阵容' })
    this.refreshSelection(players)
    if (showPicker) this.openPlayerPicker('slot-2', false)
  },
  load: function () {
    var self = this
    var context = workspace.readContext() || {}
    if (!this.data.matchId || !this.data.teamId) {
      this.setData({ loading: false })
      wx.showToast({ title: '缺少比赛或球队信息', icon: 'none' })
      return
    }
    wx.cloud.callFunction({ name: 'getMiniWorkspace', data: { action: 'matchLineup', workspaceId: (context.currentWorkspace || {}).id, matchId: this.data.matchId, teamId: this.data.teamId } })
      .then(function (res) {
        var result = res.result || {}
        if (!result.success) throw new Error(result.message || '阵容加载失败')
        var min = Number((result.match || {}).minPlayers || 0)
        var sizeUnsupported = !FORMATIONS[min]
        var options = (FORMATIONS[min] || []).map(function (item, index) { return { id: item.id, label: item.label, selected: index === 0, tabClass: index === 0 ? 'selected' : '' } })
        var lineup = result.lineup || {}
        var formation = options.some(function (item) { return item.id === lineup.formation }) ? lineup.formation : (options[0] ? options[0].id : '')
        options = options.map(function (item) { return Object.assign({}, item, { selected: item.id === formation, tabClass: item.id === formation ? 'selected' : '' }) })
        var slots = slotsFor(min, formation)
        var playerMap = {}
        ;(result.players || []).forEach(function (player) { playerMap[player.id] = player })
        ;(lineup.starters || []).forEach(function (starter) {
          var index = slots.map(function (slot) { return slot.id }).indexOf(starter.slotId)
          var player = playerMap[starter.playerId]
          if (index >= 0 && player) slots[index] = self.toSlot(slots[index], player)
        })
        var subs = (lineup.substitutes || []).map(function (item) { return playerMap[item.playerId] }).filter(Boolean).map(function (player) { return Object.assign({}, player, { positionText: positionText(player.position) }) })
        var match=result.match || {}
        var canConfirmArrival=result.canManage && !match.teamArrived
        self.setData({ loading: false, headCoach: result.headCoach || null, headCoachState: result.headCoachState || 'missing', headCoachStateText:({ambiguous:'待确认',unavailable:'暂不可用'}[result.headCoachState]||'待设置'), canManage: result.canManage, match: match, minPlayers: min, sizeText: min ? min + '人制' : '人数待确认', sizeUnsupported: sizeUnsupported, formationOptions: options, formation: formation, slots: decorateSlots(slots, ''), substitutes: subs, benchLimit: Number(match.benchLimit || 5), cardAssetsError: result.cardAssetsError === true, locked: result.locked === true || lineup.status === 'submitted' || lineup.status === 'locked', preSubmitted: result.preSubmitted === true || lineup.status === 'pre_submitted', allowPreSubmit: result.allowPreSubmit === true || result.preSubmitAllowed === true, finalWindowOpen: result.finalWindowOpen === true, submitButtonText: result.submitButtonText || '确认并提交本场阵容', submissionWindowText: result.submissionWindowText || '', returned: lineup.status === 'returned', returnReason: lineup.returnReason || '', emptyPlayers: !(result.players || []).length, teamArrived:Boolean(match.teamArrived), allArrived:Boolean(match.allArrived), arrivalStatusText:match.allArrived ? '三方已报到' : (match.teamArrived ? '本队已报到，等待其他方' : '等待本队负责人确认'), arrivalButtonText:match.teamArrived ? '本队已报到' : '确认本队到场', arrivalButtonDisabled:!canConfirmArrival, canConfirmArrival:canConfirmArrival })
        self.refreshSelection(result.players || [])
      })
      .catch(function (error) { self.setData({ loading: false }); wx.showToast({ title: error.message || '阵容加载失败', icon: 'none' }) })
  },
  toSlot: function (slot, player) {
    return Object.assign({}, slot, { empty: false, playerId: player.id, playerName: player.name || '未命名球员', jerseyText: player.jerseyNumber ? String(player.jerseyNumber) : '—', avatar: player.photoUrl || '', cardScene:player.cardScene||null,cardUrl: player.cardUrl || '', cardState: player.cardState || 'missing', cardTier: player.cardTier || '', jerseyName: player.jerseyName || '', height: player.height, weight: player.weight, nationality: player.nationality || '', teamLogo: player.teamLogo || '' })
  },
  refreshSelection: function (rawPlayers) {
    var ids = selectedIds(this.data.slots, this.data.substitutes)
    this._rosterPlayers = (rawPlayers || this._rosterPlayers || []).map(function (player) { var used = ids.indexOf(player.id) >= 0; return Object.assign({}, player, { selected: used, disabled: used }) })
    var starters = this.data.slots.filter(function (slot) { return !slot.empty }).length
    this.setData({ showSubmit:this.data.canManage&&!this.data.locked&&!this.data.sizeUnsupported&&starters===this.data.minPlayers,showBenchAdd:this.data.substitutes.length<this.data.benchLimit,benchAddClass:(!this.data.canManage||this.data.locked)?'disabled':'',starterCount: starters, substituteCount: this.data.substitutes.length, selectedCount: ids.length, submitDisabled: this.data.sizeUnsupported || starters !== this.data.minPlayers || this.data.locked || !this.data.canManage || !(this.data.allowPreSubmit || (this.data.finalWindowOpen && this.data.allArrived)) })
  },
  confirmArrival:function() {
    var self=this
    if (!this.data.canConfirmArrival || this.data.confirmingArrival) return
    var context=workspace.readContext() || {}
    this.setData({ confirmingArrival:true, arrivalButtonDisabled:true })
    wx.cloud.callFunction({ name:'getMiniWorkspace', data:{ action:'confirmTeamArrival', workspaceId:(context.currentWorkspace || {}).id, matchId:this.data.matchId, teamId:this.data.teamId } }).then(function(res) { var result=res.result || {}; if (!result.success) throw new Error(result.message || '报到失败'); wx.showToast({ title:'本队已报到', icon:'success' }); return self.load() }).catch(function(error) { wx.showToast({ title:error.message || '报到失败', icon:'none' }) }).finally(function() { self.setData({ confirmingArrival:false, arrivalButtonDisabled:!self.data.canConfirmArrival }) })
  },
  selectFormation: function (event) {
    if (this.data.locked || !this.data.canManage) return
    var formation = event.currentTarget.dataset.id
    if (formation === this.data.formation) return
    var currentPlayers = this.data.slots.filter(function (slot) { return !slot.empty }).map(function (slot) {
      var player = (this._rosterPlayers || []).filter(function (item) { return item.id === slot.playerId })[0]
      return player ? { player: player, position: slot.position } : null
    }, this).filter(Boolean)
    var slots = slotsFor(this.data.minPlayers, formation)
    slots.forEach(function (slot, index) {
      var preferred = currentPlayers.findIndex(function (item) { return item.position === slot.position })
      if (preferred < 0) return
      slots[index] = this.toSlot(slot, currentPlayers.splice(preferred, 1)[0].player)
    }, this)
    slots.forEach(function (slot, index) { if (slot.empty && currentPlayers.length) slots[index] = this.toSlot(slot, currentPlayers.shift().player) }, this)
    this.setData({ formation: formation, formationOptions: this.data.formationOptions.map(function (item) { var selected = item.id === formation; return Object.assign({}, item, { selected: selected, tabClass: selected ? 'selected' : '' }) }), slots: decorateSlots(slots, '') })
    this.refreshSelection()
  },
  chooseSlot: function (event) {
    if (this.data.locked || !this.data.canManage) { wx.showToast({ title: this.data.locked ? '阵容已锁定' : '当前账号无编排权限', icon: 'none' }); return }
    var id = event.currentTarget.dataset.id
    if (this.data.draggingPlayerId) {
      this.placePlayerInSlot(this.data.draggingPlayerId, id)
      return
    }
    this.openPlayerPicker(id, false)
  },
  openPlayerPicker: function (slotId, showAll) {
    var slot = this.data.slots.filter(function (item) { return item.id === slotId })[0]
    if (!slot) return
    var candidates = (this._rosterPlayers || []).filter(function (item) { return item.id !== slot.playerId })
    var preferred = candidates.filter(function (item) { return item.position === slot.position })
    var rows = showAll || !preferred.length ? candidates : preferred
    var substitutes = this.data.substitutes
    var starters = this.data.slots
    var decoratePlayer = function (item) {
      var location = starters.some(function (starter) { return starter.playerId === item.id }) ? '已在首发' : (substitutes.some(function (sub) { return sub.id === item.id }) ? '已在替补' : '')
      return Object.assign({}, item, { pickerStatusText: location })
    }
    this.setData({
      selectedSlotId: slotId,
      slots: decorateSlots(this.data.slots, slotId),
      playerPickerVisible: true,
      pickerMode: 'starter', pickerIsStarter:true,
      pickerTitle: slot.empty ? '选择球员' : '更换球员',
      pickerHint: showAll ? '全部可选球员' : slot.title,
      pickerPlayers: rows.map(decoratePlayer),
      pickerAllPlayers: candidates.map(decoratePlayer),
      pickerHasPreferred: preferred.length > 0,
      pickerEmpty: rows.length === 0
    })
  },
  showAllPickerPlayers: function () {
    this.setData({ pickerPlayers: this.data.pickerAllPlayers, pickerHint: '全部可选球员', pickerEmpty: this.data.pickerAllPlayers.length === 0 })
  },
  openSubstitutePicker: function () {
    if (this.data.locked || !this.data.canManage) { wx.showToast({ title: this.data.locked ? '阵容已锁定' : '当前账号无编排权限', icon: 'none' }); return }
    if (this.data.substitutes.length >= this.data.benchLimit) return
    var rows = (this._rosterPlayers || []).filter(function (player) { return !player.selected }).map(function (player) {
      return Object.assign({}, player, { pickerStatusText: '' })
    })
    this.setData({ playerPickerVisible: true, pickerMode: 'substitute', pickerIsStarter:false, selectedSlotId: '', pickerTitle: '选择替补', pickerHint: '', pickerPlayers: rows, pickerAllPlayers: rows, pickerEmpty: rows.length === 0 })
  },
  closePlayerPicker: function () {
    this.setData({ playerPickerVisible: false, selectedSlotId: '', pickerPlayers: [], pickerAllPlayers: [], slots: decorateSlots(this.data.slots, '') })
  },
  startPlayerDrag: function (event) {
    if (this.data.locked || !this.data.canManage) return
    var id = event.currentTarget.dataset.id
    var player = (this._rosterPlayers || []).filter(function (item) { return item.id === id })[0]
    if (!player || player.disabled) return
    this.setData({ dragging: true, draggingPlayerId: id, draggingPlayerName: player.name || '该球员', selectedSlotId: '', slots: decorateSlots(this.data.slots, '') })
    wx.vibrateShort({ type: 'light' })
  },
  cancelPlayerDrag: function () {
    if (!this.data.dragging) return
    this.setData({ dragging: false, draggingPlayerId: '', draggingPlayerName: '' })
  },
  placePlayerInSlot: function (playerId, slotId) {
    var player = (this._rosterPlayers || []).filter(function (item) { return item.id === playerId })[0]
    if (!player) return
    var slots = this.data.slots.slice()
    var targetIndex = slots.findIndex(function (slot) { return slot.id === slotId })
    if (targetIndex < 0) return
    var previousId = slots[targetIndex].playerId
    var previous = (this._rosterPlayers || []).filter(function (item) { return item.id === previousId })[0]
    var sourceIndex = slots.findIndex(function (slot) { return slot.playerId === playerId })
    var substitutes = this.data.substitutes.slice()
    var benchIndex = substitutes.findIndex(function (item) { return item.id === playerId })
    if (sourceIndex >= 0 && sourceIndex !== targetIndex) {
      slots[sourceIndex] = previous ? this.toSlot(slots[sourceIndex], previous) : this.clearSlot(slots[sourceIndex])
    } else if (benchIndex >= 0) {
      if (previous) substitutes[benchIndex] = previous
      else substitutes.splice(benchIndex, 1)
    }
    slots[targetIndex] = this.toSlot(slots[targetIndex], player)
    this.setData({ slots: decorateSlots(slots, ''), substitutes: substitutes, selectedSlotId: '', dragging: false, draggingPlayerId: '', draggingPlayerName: '', playerPickerVisible: false, pickerPlayers: [], pickerAllPlayers: [] })
    this.refreshSelection()
  },
  clearSlot: function (slot) {
    return Object.assign({}, slot, { empty: true, playerId: '', playerName: '选择球员', jerseyText: '+', avatar: '', cardUrl: '', cardState: 'missing' })
  },
  choosePlayer: function (event) {
    if (this.data.locked || !this.data.canManage) return
    var id = event.currentTarget.dataset.id
    var player = (this._rosterPlayers || []).filter(function (item) { return item.id === id })[0]
    if (!player) return
    if (this.data.pickerMode === 'substitute') {
      this.addSubstitute(event)
      this.closePlayerPicker()
      return
    }
    var selectedSlot = this.data.selectedSlotId
    if (!selectedSlot) { wx.showToast({ title: '请先点选场上的一个位置', icon: 'none' }); return }
    this.placePlayerInSlot(id, selectedSlot)
  },
  removeSlotPlayer: function (event) {
    if (this.data.locked || !this.data.canManage) return
    var id = event.currentTarget.dataset.id
    var slots = this.data.slots.map(function (slot) { return slot.id === id ? this.clearSlot(slot) : slot }, this)
    this.setData({ slots: decorateSlots(slots, this.data.selectedSlotId) })
    this.refreshSelection()
  },
  addSubstitute: function (event) {
    if (this.data.locked || !this.data.canManage) return
    var id = event.currentTarget.dataset.id
    var player = (this._rosterPlayers || []).filter(function (item) { return item.id === id })[0]
    if (!player || player.disabled) return
    if (this.data.substitutes.length >= this.data.benchLimit) { wx.showToast({ title: '替补席已满', icon: 'none' }); return }
    this.setData({ substitutes: this.data.substitutes.concat([Object.assign({}, player, { positionText: positionText(player.position) })]) })
    this.refreshSelection()
  },
  removeSubstitute: function (event) {
    if (this.data.locked || !this.data.canManage) return
    var id = event.currentTarget.dataset.id
    this.setData({ substitutes: this.data.substitutes.filter(function (player) { return player.id !== id }) })
    this.refreshSelection()
  },
  submit: function () {
    var self = this
    if (this.data.submitDisabled || this.data.saving) return
    if (this.data.sizeUnsupported) { wx.showModal({ title: '无法提交阵容', content: '当前竞赛组别未设置几人制（仅支持 5/7/8/9/11 人制），请联系主办方补充竞赛规则。', showCancel: false }); return }
    var missingNames = this.data.slots.filter(function (slot) { return !slot.empty && (!slot.jerseyText || slot.jerseyText === '—') }).map(function (slot) { return slot.playerName })
    this.data.substitutes.forEach(function (player) { if (!String(player.jerseyNumber || '').trim()) missingNames.push(player.name) })
    if (missingNames.length) {
      wx.showModal({ title: '缺少球衣号码', content: '请先在球员资料中补全球衣号码：' + missingNames.join('、'), showCancel: false })
      return
    }
    var context = workspace.readContext() || {}
    var starters = this.data.slots.map(function (slot) { return { playerId: slot.playerId, slotId: slot.id, position: slot.position, positionText: positionText(slot.position) } })
    var substitutes = this.data.substitutes.map(function (player) { return { playerId: player.id, position: String(player.position || '').toUpperCase(), positionText: positionText(player.position) } })
    this.setData({ saving: true })
    wx.cloud.callFunction({ name: 'getMiniWorkspace', data: { action: 'submitMatchLineup', workspaceId: (context.currentWorkspace || {}).id, matchId: this.data.matchId, teamId: this.data.teamId, formation: this.data.formation, starters: starters, substitutes: substitutes } })
      .then(function (res) { var result = res.result || {}; if (!result.success) throw new Error(result.message || '提交失败'); wx.redirectTo({ url: '/pages/match/lineup-result/lineup-result?matchId=' + encodeURIComponent(self.data.matchId) + '&teamId=' + encodeURIComponent(self.data.teamId) }) })
      .catch(function (error) { wx.showToast({ title: error.message || '提交失败', icon: 'none' }) })
      .finally(function () { self.setData({ saving: false }) })
  },
  noop: function () {},
  back: function () { wx.navigateBack() }
})
