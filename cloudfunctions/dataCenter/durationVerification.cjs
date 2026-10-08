'use strict'
const crypto = require('node:crypto')
const { error } = require('./shared/service.cjs')
const first = reply => Array.isArray(reply.data) ? reply.data[0] : reply.data
const text = value => String(value == null ? '' : value).trim()
const revision = match => crypto.createHash('sha256').update(JSON.stringify([match.durationRulesSnapshot || null, match.rulesSnapshot || null, match.durationVerification || null])).digest('hex')
function authorize(actor) { if (!actor.platformOwner) throw error('DATA_FORBIDDEN','仅平台负责人可核实历史时长') }
async function inspectDuration(db, actor, event) {
  authorize(actor)
  const match = first(await db.collection('matches').doc(text(event.matchId)).get())
  if (!match) throw error('MATCH_NOT_FOUND','比赛不存在，请刷新')
  const { resolveMatchDurationEvidence } = await import('./shared/playing-time.mjs')
  const evidence = resolveMatchDurationEvidence(match)
  return { success:true, matchId:match._id, matchName:[match.homeTeamName || '主队',match.awayTeamName || '客队'].join(' vs '), tournamentId:match.tournamentId, revision:revision(match), editable:evidence.status !== 'ready', totalMinutes:evidence.totalMinutes, verification:match.durationVerification || null }
}
async function verifyDuration(db, actor, event) {
  authorize(actor)
  const minutes = Number(event.minutes), periodCount = Number(event.periodCount), basis = text(event.minutesBasis), reason = text(event.reason)
  if (!['total','period'].includes(basis) || !Number.isFinite(minutes) || minutes <= 0 || minutes > 300 || (basis === 'period' && (!Number.isInteger(periodCount) || periodCount < 1 || periodCount > 10)) || (basis === 'period' && minutes * periodCount > 600) || reason.length < 4 || reason.length > 500) throw error('DURATION_INPUT_INVALID','请填写有效时长及核实依据')
  const totalMinutes = basis === 'period' ? minutes * periodCount : minutes
  return db.runTransaction(async transaction => {
    const match = first(await transaction.collection('matches').doc(text(event.matchId)).get())
    if (!match) throw error('MATCH_NOT_FOUND','比赛不存在，请刷新')
    if (revision(match) !== event.expectedRevision) throw error('DURATION_CONFLICT','时长记录已变化，请关闭后重新核实')
    const { resolveMatchDurationEvidence } = await import('./shared/playing-time.mjs')
    if (resolveMatchDurationEvidence(match).status === 'ready') throw error('DURATION_ALREADY_VERIFIED','已有可靠时长，无需重复核实')
    const verification = { schemaVersion:'football-duration-verification/1', matchId:match._id, minutesBasis:basis, minutes, ...(basis === 'period' ? {periodCount} : {}), totalMinutes, reason, verifiedBy:actor.userId, verifiedAt:new Date().toISOString(), revision:crypto.randomUUID(), previousEvidenceRevision:revision(match) }
    // Separate audited supplement: never rewrite the pre-match rules or referee report.
    await transaction.collection('matches').doc(match._id).update({data:{durationVerification:verification}})
    return {success:true,matchId:match._id,totalMinutes,revision:verification.revision}
  })
}
module.exports = {inspectDuration,verifyDuration,revision}
