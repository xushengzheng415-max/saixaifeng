var workspace = require('../../../utils/workspace')

Page({
  data: {
    teamId:'', teamName:'', loading:true, saving:false, errorText:'', drafts:[], visibleDrafts:[],
    tab:'pending', pendingCount:0, conflictCount:0, excludedCount:0, selectedCount:0,
    tabPendingClass:'active', tabConflictClass:'', tabExcludedClass:'', hasRows:false, canBatchConfirm:false
  },
  onLoad:function(options) { this.setData({ teamId:String(options && options.teamId || '') }); this.loadDrafts() },
  onShow:function() { if (this.data.teamId && !this.data.loading) this.loadDrafts(true) },
  workspaceId:function() { var context=workspace.readContext() || {}; return context.currentWorkspace && context.currentWorkspace.id || '' },
  loadDrafts:function(silent) {
    var self=this
    if (!silent) this.setData({ loading:true, errorText:'' })
    wx.cloud.callFunction({ name:'getMiniWorkspace', data:{ action:'importedPlayerDrafts', workspaceId:this.workspaceId(), teamId:this.data.teamId } }).then(function(res) {
      var result=res.result || {}
      if (!result.success) throw new Error(result.message || '待确认资料加载失败')
      var rows=(result.drafts || []).map(function(item) { return Object.assign({}, item, { selected:false, rowClass:item.reviewStatus === 'conflict' ? 'draft-row conflict' : 'draft-row' }) })
      self.setData({ loading:false, teamName:result.team && result.team.name || '球队', drafts:rows, pendingCount:Number(result.counts && result.counts.pending || 0), conflictCount:Number(result.counts && result.counts.conflict || 0), excludedCount:Number(result.counts && result.counts.excluded || 0) })
      self.applyTab()
    }).catch(function(error) { self.setData({ loading:false, errorText:error.message || '待确认资料加载失败' }) })
  },
  setTab:function(event) { this.setData({ tab:String(event.currentTarget.dataset.tab || 'pending') }); this.applyTab() },
  applyTab:function() {
    var tab=this.data.tab
    var rows=this.data.drafts.filter(function(item) { return item.reviewStatus === tab }).map(function(item) { return Object.assign({}, item) })
    var selected=rows.filter(function(item) { return item.selected }).length
    this.setData({ visibleDrafts:rows, hasRows:rows.length > 0, selectedCount:selected, canBatchConfirm:tab === 'pending' && selected > 0 && !this.data.saving, tabPendingClass:tab === 'pending' ? 'active' : '', tabConflictClass:tab === 'conflict' ? 'active' : '', tabExcludedClass:tab === 'excluded' ? 'active' : '' })
  },
  toggleSelect:function(event) {
    var id=String(event.currentTarget.dataset.id || '')
    var rows=this.data.drafts.map(function(item) { if (item.id !== id || !item.canConfirm) return item; return Object.assign({}, item, { selected:!item.selected }) })
    this.setData({ drafts:rows }); this.applyTab()
  },
  selectAll:function() {
    var pending=this.data.drafts.filter(function(item) { return item.reviewStatus === 'pending' })
    var shouldSelect=pending.some(function(item) { return !item.selected })
    this.setData({ drafts:this.data.drafts.map(function(item) { return item.reviewStatus === 'pending' ? Object.assign({}, item, { selected:shouldSelect }) : item }) }); this.applyTab()
  },
  confirmSelected:function() {
    var ids=this.data.drafts.filter(function(item) { return item.reviewStatus === 'pending' && item.selected }).map(function(item) { return item.id })
    if (!ids.length) return wx.showToast({ title:'请选择球员', icon:'none' })
    this.submitReview('confirm', ids, '')
  },
  excludeOne:function(event) {
    var id=String(event.currentTarget.dataset.id || '')
    var self=this
    wx.showModal({ title:'排除这条资料？', content:'排除后不会进入球队球员库。', confirmText:'确认排除', confirmColor:'#c53b32', success:function(result) { if (result.confirm) self.submitReview('exclude', [id], '领队确认不属于本队') } })
  },
  submitReview:function(decision, ids, reason) {
    var self=this
    if (this.data.saving) return
    this.setData({ saving:true, canBatchConfirm:false })
    wx.cloud.callFunction({ name:'getMiniWorkspace', data:{ action:'reviewImportedPlayerDrafts', workspaceId:this.workspaceId(), teamId:this.data.teamId, decision:decision, draftIds:ids, reason:reason } }).then(function(res) {
      var result=res.result || {}
      if (!result.success) throw new Error(result.message || '保存失败')
      wx.showToast({ title:decision === 'confirm' ? '已进入球员库' : '已排除', icon:'success' })
      return self.loadDrafts(true)
    }).catch(function(error) { wx.showToast({ title:error.message || '保存失败', icon:'none' }) }).finally(function() { self.setData({ saving:false }); self.applyTab() })
  },
  goTeam:function() { wx.redirectTo({ url:'/pages/team/team?teamId=' + encodeURIComponent(this.data.teamId) }) },
  back:function() { wx.navigateBack() }
})
