// 赛事待办的跨页共用规则：本机移除记录、报名草稿收敛。
// 首页和待办页必须使用同一套判断，否则会出现“待办页已移除、首页仍显示”。

var DISMISS_KEY = 'dismissedEventTasks'

function readDismissed() {
  var list = wx.getStorageSync(DISMISS_KEY)
  return Array.isArray(list) ? list.map(String) : []
}

function writeDismissed(list) {
  wx.setStorageSync(DISMISS_KEY, list.slice(-200))
}

// 报名草稿会按赛事+组别收敛成一条，移除时也要整组移除，否则另一条会立刻补位。
function dismissKeyOf(type, id, tournamentId, divisionId) {
  if (String(type || '') === 'registration_draft') {
    return 'registration_draft|' + String(tournamentId || '') + '|' + String(divisionId || 'default')
  }
  return 'task|' + String(id || '')
}

function keyOfTask(task) {
  var item = task || {}
  return dismissKeyOf(item.type, item.id, item.tournamentId, item.divisionId)
}

function dismiss(task) {
  var key = keyOfTask(task)
  if (!key) return
  var dismissed = readDismissed()
  if (dismissed.indexOf(key) < 0) dismissed.push(key)
  writeDismissed(dismissed)
}

function filterDismissed(list) {
  var dismissed = readDismissed()
  if (!dismissed.length) return (list || []).slice()
  return (list || []).filter(function(item) {
    return dismissed.indexOf(keyOfTask(item)) < 0
  })
}

// 卡片不展示球队名，同赛事同组别的报名草稿只保留一条。
function collapseDrafts(list) {
  var seen = {}
  var result = []
  ;(list || []).forEach(function(item) {
    if (String(item.type || '') === 'registration_draft') {
      var key = String(item.tournamentId || '') + '|' + String(item.divisionId || 'default')
      if (seen[key]) return
      seen[key] = true
    }
    result.push(item)
  })
  return result
}

module.exports = {
  readDismissed: readDismissed,
  writeDismissed: writeDismissed,
  dismissKeyOf: dismissKeyOf,
  dismiss: dismiss,
  filterDismissed: filterDismissed,
  collapseDrafts: collapseDrafts
}
