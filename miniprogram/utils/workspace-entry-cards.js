var hidden = ['cancelled','withdrawn','rejected','replaced','invite_cancelled','removed','deleted']
function role(context, workspace) {
  if (workspace && workspace.getPortalRole) return workspace.getPortalRole(context)
  var id = ((context || {}).currentIdentity || {}).id
  return id === 'organizer' || id === 'event_staff' ? 'organizer' : 'team_coach'
}
function format(item) {
  var isTeam = item.type === 'team'
  var ready = isTeam && item.playerCountState === 'ready' && typeof item.playerCount === 'number' && item.playerCount >= 0
  var fallback = isTeam ? '/images/runtime/icons/brand-v1-tab-team.png' : '/images/runtime/icons/brand-v1-tab-event.png'
  var meta = (item.metaLines || []).filter(function(value) { return typeof value === 'string' && value.trim() }).slice(0,2)
  return Object.assign({}, item, {
    key:item.key || item.type + ':' + item.id, hasBadge:Boolean(item.badgeText), hasStatus:Boolean(item.statusText),
    metaLines:meta, hasMeta:meta.length > 0, logo:item.logo || fallback, fallbackLogo:fallback,
    showPlayerCount:isTeam, playerCountText:ready ? String(item.playerCount) : '—', playerCountUnit:ready ? '人' : '',
    playerCountLabel:item.playerCountState === 'failed' ? '球员库暂不可读' : '球员库', kindText:isTeam ? '球队' : '赛事',
    actionText:item.actionText || (isTeam ? '进入球队' : '进入赛事'),
    hasParticipant:Boolean(item.isParticipating && item.teamName),participantText:(item.teamName || '') + (item.divisionName ? ' · ' + item.divisionName : '')
  })
}
function fromHome(context, type) {
  if (!context || context.homeEntriesVersion !== 'home-entries/2') return []
  return (context.homeEntries || []).filter(function(item) { return !type || item.type === type }).map(format)
}
function teamEvents(context) {
  if (context.participatingEntriesVersion === 'team-participation/1') {
    if (context.participatingEntriesState !== 'ready') return []
    var allowed = fromHome(context,'team')
    return (context.participatingEntries || []).filter(function(row) {
      return row.id && row.teamId && allowed.some(function(team) { return team.id === row.teamId && team.workspaceId === row.workspaceId })
    }).map(function(row) { return format(Object.assign({},row,{type:'tournament',isParticipating:true,isHosted:false,isShared:false,metaLines:[row.dateText].filter(Boolean)})) })
  }
  var events = context.tournaments || [], teams = context.teams || [], result = [], seen = {}
  ;(context.registrations || []).forEach(function(registration) {
    if (hidden.indexOf(String(registration.status || '').toLowerCase()) >= 0) return
    var team = teams.filter(function(item) { return item.id === registration.teamId })[0]
    var event = events.filter(function(item) { return item.id === registration.tournamentId })[0]
    if (!team || !event) return
    var summary = fromHome(context,'tournament').filter(function(item) { return item.id === event.id })[0] || {}
    var key = 'participating:' + event.id + ':' + team.id + ':' + (registration.divisionId || 'default')
    if (seen[key]) return
    seen[key] = true
    result.push(format(Object.assign({}, event, {type:'tournament',key:key,workspaceId:context.currentWorkspace.id,
      logo:summary.logo || event.logo || '', badgeText:'', isShared:false, isHosted:false, isParticipating:true,
      teamId:team.id, teamName:team.name,divisionName:registration.divisionName || '',divisionId:registration.divisionId || '', relation:'participating',
      metaLines:[team.name + (registration.divisionName ? ' · ' + registration.divisionName : ''),event.dateText || ''].filter(Boolean), actionText:'参赛事项'})))
  })
  return result
}
function open(page, entry, workspace, api) {
  if (!entry || page.data.openingEntryKey) return Promise.resolve()
  var original = workspace.readContext() || {}, selectedRole = role(original,workspace)
  var userId = (api.getStorageSync('userInfo') || {})._id
  if (!userId) { api.showToast({title:'请先登录',icon:'none'});return Promise.resolve() }
  if (entry.type === 'tournament' && selectedRole === 'team_coach' && original.participatingEntriesVersion !== 'team-participation/1') {
    page.setData({openingEntryKey:entry.key})
    api.showLoading({title:'正在更新参赛记录',mask:true})
    return workspace.loadContext().then(function(context) {
      if ((api.getStorageSync('userInfo') || {})._id !== userId) return
      if (role(context,workspace) !== selectedRole) throw new Error('身份已切换，请重新进入')
      if (context.participatingEntriesVersion !== 'team-participation/1' || context.participatingEntriesState !== 'ready') throw new Error('参赛记录未就绪，请稍后重试')
      if (page.applyContext) page.applyContext(context)
      page.setData({openingEntryKey:''})
      return open(page,entry,workspace,api)
    }).catch(function(error) { if ((api.getStorageSync('userInfo') || {})._id === userId) api.showToast({title:error.message || '参赛记录读取失败，请重试',icon:'none'}) }).finally(function() {api.hideLoading();page.setData({openingEntryKey:''})})
  }
  if (entry.type === 'tournament' && selectedRole === 'team_coach') {
    var candidates = teamEvents(original).filter(function(item) { return item.id === entry.id && (!entry.teamId || item.teamId === entry.teamId) && (!entry.divisionId || item.divisionId === entry.divisionId) })
    if (!candidates.length) { api.showToast({title:'未找到参赛记录，请刷新重试',icon:'none'});return Promise.resolve() }
    if (candidates.length > 1) return new Promise(function(resolve) {
      api.showActionSheet({itemList:candidates.map(function(item) { return item.participantText }),success:function(result) { resolve(open(page,candidates[result.tapIndex],workspace,api)) },fail:function() { resolve() }})
    })
    entry = candidates[0]
  } else if (entry.isParticipating) {
    api.showToast({title:'身份已切换，请刷新赛事列表',icon:'none'});return Promise.resolve()
  }
  var key = entry.key
  page._loadEpoch = (page._loadEpoch || 0) + 1
  page.setData({openingEntryKey:key})
  api.showLoading({title:'正在进入',mask:true})
  return workspace.switchWorkspace(entry.workspaceId).then(function(context) {
    if ((api.getStorageSync('userInfo') || {})._id !== userId) return
    if (role(context,workspace) !== selectedRole) throw new Error('身份已切换，请重新进入')
    if (page.applyContext) page.applyContext(context)
    if (context.currentWorkspace.id !== entry.workspaceId) throw new Error('权限已变更，请刷新列表')
    if (entry.type === 'tournament' && selectedRole === 'team_coach') {
      var registration = teamEvents(context).filter(function(item) { return item.key === key })[0]
      if (!registration) throw new Error('参赛关系已变更，请刷新列表')
      return api.navigateTo({url:'/pages/tournament/detail/detail?id=' + encodeURIComponent(entry.id) + '&view=team&workspaceId=' + encodeURIComponent(entry.workspaceId) + '&teamId=' + encodeURIComponent(entry.teamId) + '&divisionId=' + encodeURIComponent(entry.divisionId || '')})
    }
    var fresh = (context.homeEntries || []).filter(function(item) { return item.key === key && item.workspaceId === entry.workspaceId })[0]
    if (!fresh) throw new Error('权限已变更，请刷新列表')
    if (entry.type === 'team') {
      var team = (context.teams || []).filter(function(item) { return item.id === entry.id })[0]
      if (!team) throw new Error('球队暂不可用，请刷新列表')
      api.setStorageSync('teamInfo',{_id:team.id,teamId:team.id,teamName:team.name,teamLogo:team.logo})
      return api.navigateTo({url:'/pages/team/team'})
    }
    return api.navigateTo({url:'/pages/tournament/' + (fresh.isShared ? 'shared/shared' : 'detail/detail') + '?id=' + encodeURIComponent(fresh.id) + (fresh.isShared ? '' : '&view=organizer')})
  }).catch(function(error) {
    if ((api.getStorageSync('userInfo') || {})._id === userId) api.showToast({title:error.message || '进入失败，请重试',icon:'none'})
  }).finally(function() { api.hideLoading();page.setData({openingEntryKey:''}) })
}
module.exports = {format:format,fromHome:fromHome,teamEvents:teamEvents,role:role,open:open}
