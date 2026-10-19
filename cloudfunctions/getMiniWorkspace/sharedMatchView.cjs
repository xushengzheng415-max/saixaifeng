'use strict'

// Read-only projection of the existing match and referee record. No result writes.
const text = value => String(value == null ? '' : value).trim()
const normalized = value => text(value).toLowerCase()
const obsolete = new Set(['cancelled', 'canceled', 'deleted', 'removed', 'replaced', 'superseded', 'void'])
const liveStates = new Set(['ongoing', 'live', 'in_progress', 'playing'])
const finishedStates = new Set(['completed', 'finished', 'ended', 'archived', 'forfeited'])
const scheduledStates = new Set(['', 'scheduled', 'pending', 'upcoming', 'checked_in', 'not_started'])

function currentMatch(row) {
  return !!row && !row.deleted && !row.isDeleted && !obsolete.has(normalized(row.status)) && !obsolete.has(normalized(row.scheduleStatus))
}
function scoreReady(row) {
  return [row.homeScore, row.awayScore].every(value =>
    (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isInteger(Number(value)) && Number(value) >= 0)
}
function recordLocked(row) {
  return Boolean(row.refereeRecordLocked || row.refereeRecord || row.refereeReport || row.refereeReportSubmittedAt || row.executionState === 'recording' ||
    ['draft', 'submitted', 'approved', 'archived'].includes(normalized(row.refereeReportStatus)) ||
    ['under_review', 'returned', 'archived'].includes(normalized(row.refereeReviewStatus)))
}
function matchState(row) {
  const raw = normalized(row.status)
  if (!currentMatch(row)) return 'cancelled'
  if (liveStates.has(raw)) return 'live'
  if (finishedStates.has(raw)) return 'finished'
  return scheduledStates.has(raw) ? 'scheduled' : 'unknown'
}
function resultState(row) {
  if (!currentMatch(row)) return ''
  const review = normalized(row.refereeReviewStatus)
  if (row.refereeRecordLocked && row.refereeRecord && ['under_review', 'returned', 'archived', 'approved'].includes(review)) {
    return review === 'approved' ? 'archived' : review
  }
  // A manually entered result is visible, but never presented as a submitted referee record.
  return matchState(row) === 'finished' && row.homeTeamId && row.awayTeamId && scoreReady(row) ? 'recorded' : ''
}
function view(row, teams = new Map(), divisions = new Map()) {
  const home = teams.get(text(row.homeTeamId)) || {}, away = teams.get(text(row.awayTeamId)) || {}
  const state = matchState(row), review = resultState(row), locked = recordLocked(row)
  const homeName = text(row.homeTeamName || home.name || home.teamName) || '主队待定'
  const awayName = text(row.awayTeamName || away.name || away.teamName) || '客队待定'
  const hasScore = ['live', 'finished'].includes(state) && scoreReady(row)
  return {
    id: text(row._id), name: homeName + ' VS ' + awayName,
    homeTeamId: text(row.homeTeamId), awayTeamId: text(row.awayTeamId), homeName, awayName,
    homeLogo: text(row.homeTeamLogo || home.logoTransparent || home.logoUrl || home.logo),
    awayLogo: text(row.awayTeamLogo || away.logoTransparent || away.logoUrl || away.logo),
    divisionId: text(row.divisionId), divisionName: text(row.divisionName || divisions.get(text(row.divisionId))),
    matchNumber: text(row.matchNumber || row.matchNo || row.sequenceNumber || row.sequence),
    date: text(row.matchDate || row.date).slice(0, 10), time: text(row.matchTime || row.time || row.startTime).slice(0, 5),
    venue: text(row.venue || row.location), rawStatus: normalized(row.status), matchState: state,
    status: ({ scheduled: '未开始', live: '进行中', finished: '已结束', cancelled: '已取消', unknown: '状态待核对' })[state],
    hasScore, score: hasScore ? Number(row.homeScore) + ' : ' + Number(row.awayScore) : '— : —',
    resultState: review, reviewStatus: ({ under_review: '待复核', returned: '已退回', archived: '已归档', recorded: '已录入' })[review] || '未提交复核',
    canReview: review === 'under_review', recordLocked: locked,
    canEdit: state === 'scheduled' && !locked,
    canSupplement: ['completed', 'finished'].includes(normalized(row.status)) && !locked,
    matchAction: locked ? '查看记录' : state === 'scheduled' ? '录入比赛' : state === 'live' ? '继续录入' : ['completed', 'finished'].includes(normalized(row.status)) ? '补录事件' : '查看比赛'
  }
}
module.exports = { currentMatch, scoreReady, matchState, resultState, view }
