// 只派生展示状态，不写回业务记录、不改变报名或裁判权限。
function lifecycleTime(value) {
  if (value == null || value === '') return NaN
  if (value && typeof value === 'object' && value.$date != null) value = value.$date
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) value += 'T00:00:00+08:00'
  return new Date(value).getTime()
}
function matchDisplayStatus(match) {
  var status = String(match && match.status || '').toLowerCase()
  if (['cancelled', 'canceled'].indexOf(status) >= 0) return 'cancelled'
  if (['postponed', 'suspended'].indexOf(status) >= 0) return 'postponed'
  if (['completed', 'finished', 'ended', 'submitted', 'pending_review', 'review_pending', 'reviewed', 'archived'].indexOf(status) >= 0) return 'finished'
  if (['ongoing', 'live', 'in_progress', 'inprogress', 'playing', 'halftime', 'half_time', 'paused'].indexOf(status) >= 0) return 'ongoing'
  // 单场必须有实际开球状态，不根据计划时间或比分猜测。
  return 'upcoming'
}
function tournamentDisplayStatus(tournament, now, matches) {
  tournament = tournament || {}
  if (tournament.statusVersion === 'lifecycle-v1' && tournament.displayStatus) return tournament.displayStatus
  var status = String(tournament.storedStatus || tournament.status || '').toLowerCase()
  if (['cancelled', 'canceled'].indexOf(status) >= 0) return 'cancelled'
  if (['completed', 'finished', 'ended', 'archived'].indexOf(status) >= 0) return 'finished'
  var rows = Array.isArray(matches) ? matches.filter(function (row) { return matchDisplayStatus(row) !== 'cancelled' }) : []
  if (rows.some(function (row) { return matchDisplayStatus(row) === 'ongoing' })) return 'ongoing'
  // 所有计划场次均完赛才可由比赛事实派生赛事结束；局部/公开列表不作为完整赛程。
  if (tournament.matchesComplete === true && rows.length && rows.every(function (row) { return matchDisplayStatus(row) === 'finished' })) return 'finished'
  if (rows.some(function (row) { return matchDisplayStatus(row) === 'finished' })) return 'ongoing'
  if (['ongoing', 'live', 'in_progress', 'playing'].indexOf(status) >= 0) return 'ongoing'
  if (['draft', 'pending', 'pending_review', 'postponed', 'suspended'].indexOf(status) >= 0) return status
  var start = lifecycleTime(tournament.startDate || tournament.startTime || tournament.beginDate)
  var time = now == null ? Date.now() : new Date(now).getTime()
  if (Number.isFinite(start) && start <= time) return 'ongoing'
  if (status === 'registering') return 'registering'
  if (['upcoming', 'published', 'scheduled', 'ready'].indexOf(status) >= 0) return 'upcoming'
  return 'unknown'
}
function tournamentStatusText(tournament, now, matches) {
  return { registering: '报名中', ongoing: '进行中', finished: '已结束', upcoming: '待开始', draft: '筹备中', pending: '待审核', pending_review: '待审核', postponed: '已延期', suspended: '已暂停', cancelled: '已取消', unknown: '状态待确认' }[tournamentDisplayStatus(tournament, now, matches)]
}
function matchStatusText(match) {
  return { upcoming: '待开始', ongoing: '进行中', finished: '已结束', postponed: '已延期', cancelled: '已取消' }[matchDisplayStatus(match)]
}
function decorateTournament(tournament, now, matches) {
  if (!tournament) return tournament
  var status = tournamentDisplayStatus(tournament, now, matches)
  return Object.assign({}, tournament, { storedStatus: tournament.storedStatus || tournament.status || '', status: status, displayStatus: status, statusText: tournamentStatusText(tournament, now, matches), statusVersion: 'lifecycle-v1' })
}
module.exports = { lifecycleTime, matchDisplayStatus, tournamentDisplayStatus, tournamentStatusText, matchStatusText, decorateTournament }
