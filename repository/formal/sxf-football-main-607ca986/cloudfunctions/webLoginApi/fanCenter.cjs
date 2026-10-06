'use strict'
const { readAll: readPlayerCardRows } = require('./data-center/reader.cjs')
const { loadOfficialFanScope, applyPlayerCardScores } = require('./fanPlayerCardScores.cjs')
const { ensureFanWallet } = require('./fanWallet.cjs')
module.exports = function createFanCenter(deps) {
  const { cloud, crypto, SERVICE_ACCOUNT_CONFIG, normalizeServiceH5Url, hashSessionToken, dateValue, httpsGet, getPublicTournamentCenter } = deps
  const FAN_H5_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
  const FAN_OAUTH_STATE_TTL_MS = 10 * 60 * 1000
function fanOAuthReturnUrl(value) {
  const url = normalizeServiceH5Url(value)
  if (!url) return ''
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'www.sxffootball.cn') return ''
    if (!['/service-account-h5/me.html', '/service-account-h5/fan-center.html', '/service-account-h5/player-cards.html'].includes(parsed.pathname)) return ''
    return parsed.origin + parsed.pathname
  } catch (error) { return '' }
}

async function ensureFanCollections(db) {
  for (const name of ['fan_oauth_states', 'fan_profiles', 'fan_h5_sessions', 'fan_supports', 'fan_points_ledger']) {
    try { await db.createCollection(name) } catch (error) {
      if (!/exist|already|duplicate/i.test(String(error && error.message || ''))) throw error
    }
  }
}

function fanPeriodKey(period, now) {
  const source = now || new Date()
  const values = {}
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(source).forEach(function (part) { if (part.type !== 'literal') values[part.type] = Number(part.value) })
  const year = Number(values.year || source.getFullYear()), month = Number(values.month || source.getMonth() + 1), dayOfMonth = Number(values.day || source.getDate())
  if (period === 'month') return year + '-' + String(month).padStart(2, '0')
  if (period === 'season') return year + '-Q' + (Math.floor((month - 1) / 3) + 1)
  const monday = new Date(Date.UTC(year, month - 1, dayOfMonth))
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
  return monday.getUTCFullYear() + '-' + String(monday.getUTCMonth() + 1).padStart(2, '0') + '-' + String(monday.getUTCDate()).padStart(2, '0')
}

async function fanPointsSummary(db, serviceAccountOpenId) {
  const rows = await readPlayerCardRows(db, 'fan_points_ledger', { serviceAccountOpenId: String(serviceAccountOpenId || '') })
  return rows.reduce(function (summary, row) {
    const delta = Number(row.delta)
    if (!Number.isSafeInteger(delta)) throw new Error('蜂蜜账本有异常记录，请稍后重试')
    if (delta > 0) summary.earned += delta
    else summary.spent -= delta
    summary.balance += delta
    return summary
  }, { balance: 0, earned: 0, spent: 0 })
}

async function fanPointsBalance(db, serviceAccountOpenId) {
  return (await fanPointsSummary(db, serviceAccountOpenId)).balance
}

function fanDateKey(now) {
  const parts = {}
  new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(now || new Date()).forEach(function (part) {
    if (part.type !== 'literal') parts[part.type] = part.value
  })
  return [parts.year, parts.month, parts.day].join('-')
}

function fanPreviousDateKey(today) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today)
  if (!match) throw new Error('签到日期无效')
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) - 1)).toISOString().slice(0, 10)
}

function fanCheckInView(profile, today) {
  const item = profile && typeof profile === 'object' ? profile : {}
  const checkedInToday = String(item.checkInLastDate || '') === today
  const previous = fanPreviousDateKey(today)
  const streak = checkedInToday || String(item.checkInLastDate || '') === previous ? Math.max(0, Number(item.checkInStreak || 0)) : 0
  return { checkedInToday, streak, dailyReward:5, sevenDayReward:100, nextMilestoneIn:7 - (streak % 7) }
}

async function createFanOAuthUrl(returnUrl) {
  const redirectUri = fanOAuthReturnUrl(returnUrl) || 'https://www.sxffootball.cn/service-account-h5/me.html'
  if (!SERVICE_ACCOUNT_CONFIG.APP_ID || !SERVICE_ACCOUNT_CONFIG.APP_SECRET) return { success: false, error: '服务号网页授权尚未配置，请联系主办方', code: 'SERVICE_ACCOUNT_NOT_CONFIGURED' }
  const db = cloud.database()
  await ensureFanCollections(db)
  const state = crypto.randomBytes(20).toString('hex')
  await db.collection('fan_oauth_states').doc(state).set({ data: { state, redirectUri, used: false, expiresAt: new Date(Date.now() + FAN_OAUTH_STATE_TTL_MS), createTime: db.serverDate() } })
  return { success: true, authorizeUrl: 'https://open.weixin.qq.com/connect/oauth2/authorize?appid=' + encodeURIComponent(SERVICE_ACCOUNT_CONFIG.APP_ID) + '&redirect_uri=' + encodeURIComponent(redirectUri) + '&response_type=code&scope=snsapi_userinfo&state=' + encodeURIComponent(state) + '#wechat_redirect' }
}

async function handleFanOAuth(event) {
  const code = String(event.code || '').trim(), state = String(event.state || '').trim()
  if (!code || !state) return { success: false, error: '微信授权参数不完整，请重新进入球迷中心' }
  const db = cloud.database()
  await ensureFanCollections(db)
  const stateResult = await db.collection('fan_oauth_states').doc(state).get()
  const stateRecord = Array.isArray(stateResult.data) ? stateResult.data[0] : stateResult.data
  if (!stateRecord || stateRecord.used || dateValue(stateRecord.expiresAt) <= Date.now()) return { success: false, error: '微信授权已过期，请重新进入球迷中心' }
  await db.collection('fan_oauth_states').doc(state).update({ data: { used: true, usedAt: db.serverDate() } })
  const tokenUrl = 'https://api.weixin.qq.com/sns/oauth2/access_token?appid=' + encodeURIComponent(SERVICE_ACCOUNT_CONFIG.APP_ID) + '&secret=' + encodeURIComponent(SERVICE_ACCOUNT_CONFIG.APP_SECRET) + '&code=' + encodeURIComponent(code) + '&grant_type=authorization_code'
  const oauth = await httpsGet(tokenUrl)
  if (!oauth || !oauth.openid || oauth.errcode) return { success: false, error: '微信授权失败，请重新进入球迷中心' }
  let nickname = '微信球迷', avatarUrl = ''
  if (oauth.access_token) {
    const profile = await httpsGet('https://api.weixin.qq.com/sns/userinfo?access_token=' + encodeURIComponent(oauth.access_token) + '&openid=' + encodeURIComponent(oauth.openid) + '&lang=zh_CN')
    if (profile && !profile.errcode) { nickname = String(profile.nickname || nickname).slice(0, 80); avatarUrl = String(profile.headimgurl || '').slice(0, 500) }
  }
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + FAN_H5_SESSION_TTL_MS)
  const existing = (await db.collection('fan_profiles').where({ serviceAccountOpenId: String(oauth.openid) }).limit(2).get()).data || []
  if (existing.length === 1) await db.collection('fan_profiles').doc(existing[0]._id).update({ data: { nickname, avatarUrl, unionId: String(oauth.unionid || existing[0].unionId || ''), updateTime: db.serverDate() } })
  else {
    await db.runTransaction(async transaction => {
      await transaction.collection('fan_profiles').add({ data: { serviceAccountOpenId: String(oauth.openid), unionId: String(oauth.unionid || ''), nickname, avatarUrl, honeyBalance:100, honeyWalletVersion:1, createTime: db.serverDate(), updateTime: db.serverDate() } })
      await transaction.collection('fan_points_ledger').add({ data: { serviceAccountOpenId: String(oauth.openid), delta: 100, reason: 'fan-registration-bonus', createTime: db.serverDate() } })
    })
  }
  await db.collection('fan_h5_sessions').add({ data: { tokenHash: hashSessionToken(token), serviceAccountOpenId: String(oauth.openid), active: true, expiresAt, createTime: db.serverDate(), lastUsedAt: db.serverDate() } })
  return { success: true, fanSessionToken: token, expiresAt }
}

async function handleFanOverview(event) {
  const token = String(event.fanSessionToken || '').trim()
  if (!token) return { success: false, error: '请先完成微信授权', code: 'FAN_AUTH_REQUIRED' }
  const db = cloud.database()
  await ensureFanCollections(db)
  const sessions = (await db.collection('fan_h5_sessions').where({ tokenHash: hashSessionToken(token), active: true }).limit(2).get()).data || []
  if (sessions.length !== 1 || dateValue(sessions[0].expiresAt) <= Date.now()) return { success: false, error: '球迷会话已失效，请重新授权', code: 'FAN_AUTH_REQUIRED' }
  const profiles = (await db.collection('fan_profiles').where({ serviceAccountOpenId: String(sessions[0].serviceAccountOpenId || '') }).limit(2).get()).data || []
  const profile = profiles[0] || {}
  await db.collection('fan_h5_sessions').doc(sessions[0]._id).update({ data: { lastUsedAt: db.serverDate() } })
  const points = await fanPointsSummary(db, sessions[0].serviceAccountOpenId)
  return { success: true, data: { profile: { nickname: String(profile.nickname || '微信球迷'), avatarUrl: String(profile.avatarUrl || '') }, points, checkIn:fanCheckInView(profile, fanDateKey()), follows: [], predictions: [], supports: [] } }
}

async function handleFanCheckIn(event) {
  const token = String(event.fanSessionToken || '').trim()
  if (!token) return { success:false, error:'请先登录球迷账号', code:'FAN_AUTH_REQUIRED' }
  const db = cloud.database()
  await ensureFanCollections(db)
  const sessions = (await db.collection('fan_h5_sessions').where({ tokenHash:hashSessionToken(token), active:true }).limit(2).get()).data || []
  if (sessions.length !== 1 || dateValue(sessions[0].expiresAt) <= Date.now()) return { success:false, error:'登录已失效，请重新登录', code:'FAN_AUTH_REQUIRED' }
  const openId = String(sessions[0].serviceAccountOpenId || '')
  const profiles = (await db.collection('fan_profiles').where({ serviceAccountOpenId:openId }).limit(2).get()).data || []
  if (profiles.length !== 1) return { success:false, error:'球迷账号资料异常，请稍后重试', code:'FAN_PROFILE_INVALID' }
  const today = fanDateKey()
  const previous = fanPreviousDateKey(today)
  const profileId = String(profiles[0]._id)
  await ensureFanWallet(db,profileId,openId)
  let result
  try {
    const transactionResult = await db.runTransaction(async function (transaction) {
      const found = await transaction.collection('fan_profiles').doc(profileId).get()
      const profile = Array.isArray(found.data) ? found.data[0] : found.data
      if (!profile || String(profile.serviceAccountOpenId || '') !== openId) throw new Error('球迷账号资料异常')
      if (String(profile.checkInLastDate || '') === today) return { alreadyCheckedIn:true, streak:Math.max(0, Number(profile.checkInStreak || 0)), reward:0 }
      const streak = String(profile.checkInLastDate || '') === previous ? Math.max(0, Number(profile.checkInStreak || 0)) + 1 : 1
      const streakReward = streak % 7 === 0 ? 100 : 0
      if (!Number.isSafeInteger(profile.honeyBalance) || profile.honeyBalance < 0) throw new Error('蜂蜜余额异常')
      await transaction.collection('fan_profiles').doc(profileId).update({ data:{ checkInLastDate:today, checkInStreak:streak, honeyBalance:profile.honeyBalance + 5 + streakReward, checkInUpdatedAt:db.serverDate() } })
      await transaction.collection('fan_points_ledger').add({ data:{ serviceAccountOpenId:openId, delta:5, reason:'fan-daily-check-in', dateKey:today, createTime:db.serverDate() } })
      if (streakReward) await transaction.collection('fan_points_ledger').add({ data:{ serviceAccountOpenId:openId, delta:streakReward, reason:'fan-seven-day-check-in', dateKey:today, streak, createTime:db.serverDate() } })
      return { alreadyCheckedIn:false, streak, reward:5 + streakReward, streakReward }
    })
    result = transactionResult && transactionResult.result || transactionResult
  } catch (error) {
    // A parallel tap may win the transaction; read the committed day before treating it as failure.
    const latest = await db.collection('fan_profiles').doc(profileId).get()
    const profile = Array.isArray(latest.data) ? latest.data[0] : latest.data
    if (!profile || String(profile.checkInLastDate || '') !== today) throw error
    result = { alreadyCheckedIn:true, streak:Math.max(0, Number(profile.checkInStreak || 0)), reward:0 }
  }
  const points = await fanPointsSummary(db, openId)
  return { success:true, data:{ ...result, points, checkIn:{ checkedInToday:true, streak:result.streak, dailyReward:5, sevenDayReward:100, nextMilestoneIn:7 - (result.streak % 7) } }, message:result.alreadyCheckedIn ? '今天已签到' : '签到成功' }
}

function fanPeriodWindow(period, now) {
  const key = fanPeriodKey(period, now)
  if (period === 'week') {
    const start = new Date(key + 'T00:00:00+08:00')
    return { start, end: new Date(start.getTime() + 7 * 86400000) }
  }
  const parts = key.split(period === 'season' ? '-Q' : '-').map(Number)
  const month = period === 'season' ? (parts[1] - 1) * 3 : parts[1] - 1
  return { start: new Date(Date.UTC(parts[0], month, 1) - 8 * 3600000), end: new Date(Date.UTC(parts[0], month + (period === 'season' ? 3 : 1), 1) - 8 * 3600000) }
}

async function handleFanRankings(event) {
  const period = ['week', 'month', 'season'].includes(String(event.period || 'week')) ? String(event.period) : 'week'
  const tournamentId = String(event.tournamentId || '')
  const matchId = String(event.matchId || '')
  const db = cloud.database()
  if (matchId && event.countsOnly === true) {
    const found = await db.collection('matches').doc(matchId).get()
    const match = Array.isArray(found.data) ? found.data[0] : found.data
    const visible = match && (match.schedulePublished === true || match.published === true || ['ongoing', 'live', 'completed', 'finished', 'ended'].includes(String(match.status || '').toLowerCase()))
    if (!visible || (tournamentId && String(match.tournamentId || '') !== tournamentId)) return { success:false, error:'比赛尚未公开', code:'MATCH_NOT_PUBLIC' }
    const tournamentResult = await db.collection('tournaments').doc(String(match.tournamentId || '')).get()
    const tournament = Array.isArray(tournamentResult.data) ? tournamentResult.data[0] : tournamentResult.data
    if (!tournament || ['draft', 'cancelled'].includes(String(tournament.status || '').toLowerCase())) return { success:false, error:'赛事尚未公开', code:'MATCH_NOT_PUBLIC' }
    const counts = {}
    try {
      const result = await db.collection('fan_supports').where({ sourceMatchId:matchId, targetType:'player' }).field({ targetId:true }).limit(5000).get()
      ;(result.data || []).forEach(function (row) { const id = String(row.targetId || ''); if (id.startsWith('player|' + String(match.tournamentId || '') + '|')) counts[id] = Number(counts[id] || 0) + 1 })
    } catch (error) { if (!/not.*exist|502005|ResourceNotFound/i.test(String(error.message || ''))) throw error }
    return { success:true, data:{ matchId, counts } }
  }
  const center = await getPublicTournamentCenter()
  const verified = await loadOfficialFanScope(db)
  const matches = (center.data && center.data.matches || []).filter(function (match) { return verified.matchIds.has(String(match.id || '')) && (!tournamentId || String(match.tournamentId || '') === tournamentId) && (!matchId || String(match.id || '') === matchId) })
  const teams = new Map(), players = new Map()
  const teamKey = function (match, name) { return 'team|' + String(match.tournamentId || '') + '|' + String(name || '') }
  const playerKey = function (match, eventOrPlayer, teamName) { return 'player|' + String(match.tournamentId || '') + '|' + String(teamName || '') + '|' + String(eventOrPlayer.number || eventOrPlayer.playerNumber || '') + '|' + String(eventOrPlayer.name || eventOrPlayer.playerName || '') }
  const addTeam = function (match, name, logo, supportName) { if (!name || /^(场序|A组第|B组第)/.test(String(name))) return; const id = teamKey(match, supportName || name); if (!teams.has(id)) teams.set(id, { targetId:id, name:String(name), logo:String(logo || ''), supportCount:0 }) }
  const addPlayer = function (match, player, teamName, teamLogo, supportName) { const name = String(player && (player.name || player.playerName) || ''); if (!name) return; const id = playerKey(match, player, supportName || teamName); const appearances = Number(player && player.appearances || 0); const card = { targetId:id, name, number:String(player.number || player.playerNumber || ''), teamName:String(teamName || ''), teamLogo:String(teamLogo || ''), avatarUrl:String(player.avatarUrl || ''), appearances:Number.isFinite(appearances) ? Math.max(0, Math.floor(appearances)) : 0, playerId:String(player.playerId || ''), position:String(player.position || ''), jerseyName:String(player.jerseyName || ''), nationality:String(player.nationality || '中国'), birthDate:String(player.birthDate || ''), age:Number.isFinite(Number(player.age)) ? Number(player.age) : null, height:Number(player.height || 0), weight:Number(player.weight || 0), nativePlace:String(player.nativePlace || ''), goals:Number(player.goals || 0), assists:Number(player.assists || 0), points:Number(player.points || 0), supportCount:0 }; if (!players.has(id)) players.set(id, card); else { const target = players.get(id); Object.keys(card).forEach(function (key) { if ((target[key] == null || target[key] === '' || target[key] === 0) && card[key] != null && card[key] !== '') target[key] = card[key] }); target.appearances = Math.max(Number(target.appearances || 0), card.appearances) } }
  matches.forEach(function (match) {
    addTeam(match, match.homeName, match.homeLogo, match.homeSupportName); addTeam(match, match.awayName, match.awayLogo, match.awaySupportName)
    ;['home', 'away'].forEach(function (side) { const lineup = match.lineups && match.lineups[side]; if (!lineup) return; const teamName = side === 'away' ? match.awayName : match.homeName; const teamLogo = side === 'away' ? match.awayLogo : match.homeLogo; const supportName = side === 'away' ? match.awaySupportName : match.homeSupportName; (Array.isArray(lineup.starters) ? lineup.starters : []).concat(Array.isArray(lineup.substitutes) ? lineup.substitutes : []).forEach(function (player) { addPlayer(match, player, teamName, teamLogo, supportName) }) })
    ;(Array.isArray(match.events) ? match.events : []).forEach(function (item) { const away = item.teamSide === 'away'; addPlayer(match, { name:item.playerName, number:item.playerNumber, playerId:item.playerId, avatarUrl:item.avatarUrl }, away ? match.awayName : match.homeName, away ? match.awayLogo : match.homeLogo, away ? match.awaySupportName : match.homeSupportName) })
  })
  try {
    const { start, end } = fanPeriodWindow(period)
    // One support record counts in each natural time window. The selected tab
    // never determines which other leaderboards receive the same support.
    const supportFilter = { targetType: db.command.in(['team', 'player']) }
    if (matchId) supportFilter.sourceMatchId = matchId
    else supportFilter.createTime = db.command.gte(start).and(db.command.lt(end))
    const supportResult = await db.collection('fan_supports').where(supportFilter).limit(5000).get()
    const supportRows = supportResult.data || []
    supportRows.forEach(function (row) { if (row.sourceMatchId && !verified.matchIds.has(String(row.sourceMatchId))) return; const target = row.targetType === 'player' ? players.get(String(row.targetId || '')) : teams.get(String(row.targetId || '')); if (target) target.supportCount += 1 })
  } catch (error) { console.warn('[webApi] fan ranking support lookup skipped:', error.message || error) }
  await applyPlayerCardScores(Array.from(players.values()),verified.career,verified.supportTotals)
    await require('./playerCardAccess.cjs').attachPublicPlayerCards(cloud,db,Array.from(players.values()))
  return { success:true, data:{ period, teams:Array.from(teams.values()).sort((a,b) => b.supportCount - a.supportCount || a.name.localeCompare(b.name, 'zh-CN')), players:Array.from(players.values()).sort((a,b) => b.supportCount - a.supportCount || a.name.localeCompare(b.name, 'zh-CN')) } }
}

async function handleFanSupport(event) {
  const token = String(event.fanSessionToken || '').trim()
  if (!token) return { success: false, error: '请先进入球迷中心', code: 'FAN_AUTH_REQUIRED' }
  const targetType = String(event.targetType || '').trim()
  if (targetType === 'team' || targetType === 'player') {
    const db = cloud.database(); await ensureFanCollections(db)
    const sessions = (await db.collection('fan_h5_sessions').where({ tokenHash: hashSessionToken(token), active: true }).limit(2).get()).data || []
    if (sessions.length !== 1 || dateValue(sessions[0].expiresAt) <= Date.now()) return { success:false, error:'球迷会话已失效，请重新授权', code:'FAN_AUTH_REQUIRED' }
    const period = ['week','month','season'].includes(String(event.period || 'week')) ? String(event.period) : 'week'
    const targetId = String(event.targetId || '').trim()
    const sourceMatchId = String(event.matchId || '')
    const rankings = await handleFanRankings({ period, tournamentId:String(event.tournamentId || ''), matchId:sourceMatchId })
    const list = targetType === 'player' ? rankings.data.players : rankings.data.teams
    const target = list.find(function (item) { return item.targetId === targetId })
    if (!target) return { success:false, error:'榜单对象不存在或未公开', code:'FAN_TARGET_INVALID' }
    const balance = await fanPointsBalance(db, sessions[0].serviceAccountOpenId)
    if (balance < 1) return { success:false, error:'蜂蜜不足，签到可得蜂蜜', code:'FAN_POINTS_INSUFFICIENT', balance }
    await db.collection('fan_supports').add({ data:{ tokenHash:hashSessionToken(token), serviceAccountOpenId:String(sessions[0].serviceAccountOpenId || ''), targetType, targetId, periodKey:fanPeriodKey(period), tournamentId:String(event.tournamentId || ''), sourceMatchId, cost:1, createTime:db.serverDate() } })
    await db.collection('fan_points_ledger').add({ data:{ serviceAccountOpenId:String(sessions[0].serviceAccountOpenId || ''), delta:-1, reason:'fan-ranking-support', targetType, targetId, periodKey:fanPeriodKey(period), createTime:db.serverDate() } })
    return { success:true, data:{ targetId, targetType, cost:1, balance:balance - 1, supportCount:Number(target.supportCount || 0) + 1 }, message:'应援成功' }
  }
  const matchId = String(event.matchId || '').trim()
  const teamSide = event.teamSide === 'away' ? 'away' : event.teamSide === 'home' ? 'home' : ''
  if (!matchId || !teamSide) return { success: false, error: '支持信息不完整', code: 'FAN_SUPPORT_INVALID' }
  const db = cloud.database()
  await ensureFanCollections(db)
  const sessions = (await db.collection('fan_h5_sessions').where({ tokenHash: hashSessionToken(token), active: true }).limit(2).get()).data || []
  if (sessions.length !== 1 || dateValue(sessions[0].expiresAt) <= Date.now()) return { success: false, error: '球迷会话已失效，请重新授权', code: 'FAN_AUTH_REQUIRED' }
  let match = null
  try { const result = await db.collection('matches').doc(matchId).get(); match = Array.isArray(result.data) ? result.data[0] : result.data } catch (error) { return { success: false, error: '比赛不存在', code: 'MATCH_NOT_FOUND' } }
  if (!match || !(match.schedulePublished === true || match.published === true) || ['scheduled', 'pending', 'checked_in', 'ongoing', 'live'].indexOf(String(match.status || 'scheduled').toLowerCase()) < 0) return { success: false, error: '当前比赛暂未开放应援', code: 'FAN_SUPPORT_CLOSED' }
  const tokenHash = hashSessionToken(token)
  const existing = (await db.collection('fan_supports').where({ tokenHash, matchId }).limit(2).get()).data || []
  if (!existing.length) await db.collection('fan_supports').add({ data: { tokenHash, matchId, tournamentId: String(match.tournamentId || ''), teamSide, createTime: db.serverDate() } })
  const rows = (await db.collection('fan_supports').where({ matchId }).limit(5000).get()).data || []
  const home = rows.filter(row => row.teamSide === 'home').length
  const away = rows.filter(row => row.teamSide === 'away').length
  return { success: true, data: { matchId, support: { home, away, total: home + away, voted: true, teamSide } }, message: existing.length ? '你已经支持过本场比赛' : '应援成功' }
}

  return { createFanOAuthUrl, handleFanOAuth, handleFanOverview, handleFanCheckIn, handleFanRankings, handleFanSupport, fanPeriodKey }
}
