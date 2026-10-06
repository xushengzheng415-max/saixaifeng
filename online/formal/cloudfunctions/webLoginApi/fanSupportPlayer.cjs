'use strict'
const crypto = require('node:crypto')
const { createDataService } = require('./data-center/service.cjs')
const { balanceOf, ensureFanWallet } = require('./fanWallet.cjs')

function supportIdFor(openId, targetId, requestKey) {
  return crypto.createHash('sha256').update(JSON.stringify([openId,targetId,requestKey])).digest('hex')
}

async function optionalDocument(transaction, collection, documentId) {
  try {
    const result = await transaction.collection(collection).doc(documentId).get()
    return Array.isArray(result.data) ? result.data[0] : result.data
  } catch (failure) {
    if (/not.exist|not.found|不存在|DOCUMENT_NOT_EXIST|ResourceNotFound|404/i.test(String(failure.code || '') + ' ' + String(failure.message || ''))) return null
    throw failure
  }
}

async function handleRankingSupport(event, deps) {
  const { cloud, hashSessionToken, dateValue, fanPeriodKey, handleFanRankings } = deps
  const db = cloud.database(), token = String(event.fanSessionToken || '').trim()
  if (!token) return { success:false, code:'FAN_AUTH_REQUIRED', error:'请先进入球迷中心' }
  const sessions = (await db.collection('fan_h5_sessions').where({ tokenHash:hashSessionToken(token), active:true }).limit(2).get()).data || []
  if (sessions.length !== 1 || dateValue(sessions[0].expiresAt) <= Date.now()) return { success:false, code:'FAN_AUTH_REQUIRED', error:'球迷会话已失效，请重新授权' }
  const openId = String(sessions[0].serviceAccountOpenId || '')
  const profiles = (await db.collection('fan_profiles').where({ serviceAccountOpenId:openId }).limit(2).get()).data || []
  if (profiles.length !== 1) return { success:false, code:'FAN_PROFILE_INVALID', error:'球迷账号资料异常' }
  const targetId = String(event.targetId || '').trim()
  const targetType = event.targetType === 'player' ? 'player' : event.targetType === 'team' ? 'team' : ''
  if (!targetType) return { success:false, code:'FAN_TARGET_INVALID', error:'应援对象无效' }
  const period = ['week','month','season'].includes(String(event.period || 'week')) ? String(event.period) : 'week'
  const tournamentId = String(event.tournamentId || '')
  const sourceMatchId = String(event.matchId || '')
  const ranking = await handleFanRankings({ period, tournamentId, matchId:sourceMatchId })
  const target = ranking?.data?.[targetType === 'player' ? 'players' : 'teams']?.find(row => row.targetId === targetId)
  if (!target || (targetType === 'player' && (!String(target.playerId || '') || target.cardScoreVersion !== 'football-player-card-points/2'))) return { success:false, code:'FAN_TARGET_INVALID', error:'仅可应援已核实的正式对象' }
  const requestKey = String(event.requestKey || '').trim() || crypto.randomBytes(16).toString('hex')
  if (!/^[a-z0-9-]{8,80}$/i.test(requestKey)) return { success:false, code:'FAN_REQUEST_INVALID', error:'请刷新页面后重试' }
  const supportId = supportIdFor(openId,targetId,requestKey)
  const profileId = String(profiles[0]._id)
  try { await ensureFanWallet(db,profileId,openId) }
  catch (failure) { return { success:false, code:'FAN_WALLET_UNAVAILABLE', error:failure.message || '蜂蜜余额暂不可用' } }
  let transactionResult
  try {
    transactionResult = await db.runTransaction(async transaction => {
      const found = await transaction.collection('fan_profiles').doc(profileId).get()
      const profile = Array.isArray(found.data) ? found.data[0] : found.data
      if (!profile || String(profile.serviceAccountOpenId || '') !== openId) throw new Error('球迷账号资料异常')
      const previous = await optionalDocument(transaction,'fan_supports',supportId)
      const balance = profile.honeyBalance
      if (!Number.isSafeInteger(balance) || balance < 0) throw new Error('蜂蜜余额异常')
      if (previous) return { idempotent:true, balance }
      if (balance < 1) return { insufficient:true, balance }
      // The shared profile write serializes concurrent debits for this fan.
      await transaction.collection('fan_profiles').doc(profileId).update({ data:{ honeyBalance:balance - 1, supportWriteVersion:Number(profile.supportWriteVersion || 0) + 1, supportUpdatedAt:db.serverDate() } })
      const data = { supportId, supportVersion:targetType === 'player' ? 'football-card-support/1' : 'fan-ranking-support/2', status:'confirmed', tokenHash:hashSessionToken(token), serviceAccountOpenId:openId, targetType, targetId, playerId:targetType === 'player' ? String(target.playerId) : '', periodKey:fanPeriodKey(period), tournamentId, sourceMatchId, cost:1, createTime:db.serverDate() }
      await transaction.collection('fan_supports').doc(supportId).set({ data })
      await transaction.collection('fan_points_ledger').doc('support-'+supportId).set({ data:{ supportId, serviceAccountOpenId:openId, delta:-1, reason:'fan-ranking-support', targetType, targetId, playerId:targetType === 'player' ? String(target.playerId) : '', periodKey:fanPeriodKey(period), tournamentId, sourceMatchId, createTime:db.serverDate() } })
      return { balance:balance - 1, idempotent:false }
    })
  } catch (failure) {
    console.warn('[fanPlayerSupport]', failure.code || 'TRANSACTION_FAILED')
    return { success:false, code:'FAN_SUPPORT_RETRY', error:'应援未确认，请重试' }
  }
  const result = transactionResult?.result || transactionResult
  if (result.insufficient) return { success:false, code:'FAN_POINTS_INSUFFICIENT', error:'蜂蜜不足，签到可得蜂蜜', balance:result.balance }
  let cardScore = null
  if (targetType === 'player') {
    try {
      const score = await (deps.loadCardScore ? deps.loadCardScore(String(target.playerId)) : createDataService(db).playerCardForAuthorizedPlayer(String(target.playerId)))
      if (score.status === 'ready') cardScore = { points:score.points, tier:score.tier, careerPoints:score.careerPoints, supportDrops:score.supportDrops, supportPoints:score.supportPoints, scoreVersion:score.scoreVersion }
    } catch (failure) { console.warn('[fanPlayerSupport] score refresh failed:', failure.code || 'DATA_READ_FAILED') }
  }
  return { success:true, data:{ targetId, targetType, playerId:targetType === 'player' ? String(target.playerId) : '', cost:1, balance:result.balance, supportCount:Number(target.supportCount || 0) + (result.idempotent ? 0 : 1), idempotent:result.idempotent, cardScore }, message:result.idempotent ? '已应援' : '应援成功' }
}

module.exports = { handleRankingSupport, supportIdFor, balanceOf }
