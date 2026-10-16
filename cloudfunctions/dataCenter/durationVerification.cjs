'use strict'
const crypto = require('node:crypto')
const {readByIds}=require('./shared/reader.cjs')
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
  const divisionId=text(match.divisionId||match.division),division=divisionId&&divisionId!=='default'?(await readByIds(db,'divisions','_id',[divisionId]))[0]:null
  const owner=division||(await readByIds(db,'tournaments','_id',[text(match.tournamentId)]))[0]
  const rules=owner?.activeRulesSnapshot||owner?.rulesSnapshot||owner||{},version=text(owner?.activeRulesVersion||owner?.rulesVersion)
  let suggestion=null
  if(owner&&(owner.rulesLocked===true||owner.ruleFinalized===true||owner.activeRulesVersion)&&version){const basis=rules.matchMinutesBasis==='total'?'total':['halves','single'].includes(rules.periodMode)?'period':'';const minutes=Number(rules.matchMinutes),periodCount=rules.periodMode==='halves'?2:Number(rules.singlePeriodCount),total=basis==='total'?minutes:basis==='period'?minutes*periodCount:0;if(minutes>0&&minutes<=300&&total>0&&total<=600&&(basis==='total'||Number.isInteger(periodCount)&&periodCount>0&&periodCount<=10))suggestion={minutes,minutesBasis:basis,periodCount:basis==='period'?periodCount:1,totalMinutes:total,sourceName:text(owner.name||owner.divisionName||'竞赛规程'),sourceVersion:version,reason:`按已锁定竞赛规程${version}，${basis==='period'?`每半场／节${minutes}分钟，共${periodCount}段`:`整场${minutes}分钟`}；人工核实该场适用。`}}
  return { success:true, matchId:match._id, matchName:[match.homeTeamName || '主队',match.awayTeamName || '客队'].join(' vs '), tournamentId:match.tournamentId, revision:revision(match), suggestion, editable:evidence.status !== 'ready', totalMinutes:evidence.totalMinutes, verification:match.durationVerification || null }
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
