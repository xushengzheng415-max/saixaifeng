'use strict'

// 服务号卡世界 HTTP 入口（webLoginApi action 以 cardWorld 开头）。
//
// 本文件只保证：已登录且已验证手机号的服务号会话可以 cardWorldLogin 建档，
// 并让 cardWorldMainCard / cardWorldAlbum / cardWorldLineup 返回可渲染数据。
// 签约、组阵写入、轻挑战在本机未提交的 cardWorld.cjs + cardWorldEngine.cjs。
//
// 合入冲突时：
// 1. 保留本机的会话解析、loadWorld 和玩法 action。
// 2. 删除本机 ensureProfile 里直接 where().get()+add() 的实现，改为
//    require('./cardWorldProfile.cjs').ensureProfile(db, user, extra)。
// 3. index.js 里 action.indexOf('cardWorld')===0 的分支只留一处。
// 4. 不要把 service-account-h5/card-world/ 整目录用本文件代替；静态页继续走
//    ./card-world/index.html，会话键仍是 sxf_referee_h5_session，请求字段仍是 serviceSessionToken。
// 5. 若本机会话集合不是下面三个名字，设置 CARD_WORLD_SESSION_COLLECTION，或继续用本机解析。
//    本兜底不会在缺少 userId 的裁判会话上建档，也不会在多条会话里取第一条。

const crypto = require('crypto')
const profileStore = require('./cardWorldProfile.cjs')

const SESSION_COLLECTIONS = ['service_private_sessions', 'service_h5_sessions', 'referee_h5_sessions']
const LINEUP_SLOTS = [
  { key: 'st', label: '前锋', posTag: 'ST' },
  { key: 'lm', label: '左边', posTag: 'LM' },
  { key: 'rm', label: '右边', posTag: 'RM' },
  { key: 'cb', label: '中卫', posTag: 'CB' },
  { key: 'gk', label: '门将', posTag: 'GK' }
]

function fail(code, message, extra) {
  return Object.assign({ success: false, code: code, error: message }, extra || {})
}

function hashToken(token, deps) {
  if (deps && typeof deps.hashSessionToken === 'function') return deps.hashSessionToken(token)
  return crypto.createHash('sha256').update(String(token || '')).digest('hex')
}

function timeOf(value, deps) {
  if (deps && typeof deps.dateValue === 'function') return deps.dateValue(value)
  if (!value) return 0
  const raw = value && value.$date ? value.$date : value
  const time = new Date(raw).getTime()
  return Number.isFinite(time) ? time : 0
}

function rowsOf(result) {
  if (!result) return []
  if (Array.isArray(result.data)) return result.data
  return []
}

function sessionCollections() {
  const named = String(process.env.CARD_WORLD_SESSION_COLLECTION || '').trim()
  if (/^[A-Za-z0-9_]{1,64}$/.test(named)) return [named]
  return SESSION_COLLECTIONS.slice()
}

function phoneOf(user) {
  return String((user && (user.phone || user.phoneNumber)) || '').replace(/\D/g, '')
}

async function loadUser(db, userId) {
  let result
  try {
    result = await db.collection('users').doc(userId).get()
  } catch (error) {
    const text = String((error && (error.errMsg || error.message)) || '')
    if (/not exist|not found|不存在|DOCUMENT_NOT_FOUND/i.test(text)) return null
    throw error
  }
  const raw = result && result.data
  const user = Array.isArray(raw) ? raw[0] : raw
  if (!user || typeof user !== 'object') return null
  if (!user._id && !user.id && !user.userId) user._id = userId
  return user
}

async function sessionForToken(db, token, deps) {
  const tokenHash = hashToken(token, deps)
  const names = sessionCollections()
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i]
    let result
    try {
      result = await db.collection(name).where({ tokenHash: tokenHash, active: true }).limit(2).get()
    } catch (error) {
      if (profileStore.isMissingCollection(error)) continue
      console.error('[cardWorld] session lookup failed ' + JSON.stringify({
        collection: name,
        errCode: error && (error.errCode != null ? error.errCode : error.code) || '',
        errMsg: String((error && (error.errMsg || error.message)) || '').slice(0, 200)
      }))
      continue
    }
    const rows = rowsOf(result).filter(function (row) {
      return row && row.active !== false && row.userId
    })
    const live = rows.filter(function (row) {
      return !row.expiresAt || timeOf(row.expiresAt, deps) > Date.now()
    })
    if (live.length > 1) return { conflict: true }
    if (live.length === 1) return { session: live[0], collection: name }
  }
  return { session: null }
}

async function requireUser(db, event, deps) {
  const token = String((event && (event.serviceSessionToken || event.refereeSessionToken)) || '').trim()
  if (!token) return fail('WORLD_LOGIN_REQUIRED', '请先完成手机号验证')
  const found = await sessionForToken(db, token, deps)
  if (found.conflict) return fail('WORLD_SESSION_CONFLICT', '请重新连接微信')
  if (!found.session || !found.session.userId) return fail('WORLD_LOGIN_REQUIRED', '请重新连接微信')
  const user = await loadUser(db, String(found.session.userId))
  if (!user) return fail('WORLD_LOGIN_REQUIRED', '请重新连接微信')
  if (!phoneOf(user)) return fail('WORLD_PHONE_UNBOUND', '请先完成手机号验证')
  return { success: true, user: user, session: found.session }
}

function cityOf(event) {
  const cityCode = String((event && event.cityCode) || '').trim()
  const cityName = String((event && event.cityName) || '').trim().slice(0, 20)
  if (!/^\d{4,6}$/.test(cityCode)) return null
  return { cityCode: cityCode, cityName: cityName }
}

async function rememberCity(db, profile, event) {
  const city = cityOf(event)
  if (!city || !profile || !profile._id) return profile
  if (profile.cityCode === city.cityCode && (profile.cityName || '') === city.cityName) return profile
  try {
    await db.collection(profileStore.COLLECTION).doc(profile._id).update({
      data: {
        cityCode: city.cityCode,
        cityName: city.cityName,
        updateTime: db.serverDate ? db.serverDate() : new Date()
      }
    })
    return Object.assign({}, profile, city)
  } catch (error) {
    console.error('[cardWorld] city update failed ' + JSON.stringify({
      errCode: error && (error.errCode != null ? error.errCode : error.code) || '',
      errMsg: String((error && (error.errMsg || error.message)) || '').slice(0, 200)
    }))
    return profile
  }
}

async function linkedPlayers(db, userId) {
  if (!db.command || typeof db.command.or !== 'function') return []
  try {
    const result = await db.collection('players').where(db.command.or([
      { linkedUserId: userId },
      { playerUserId: userId },
      { guardianUserId: userId }
    ])).limit(5).get()
    return rowsOf(result).filter(function (player) { return player && (player._id || player.id) })
  } catch (error) {
    console.warn('[cardWorld] player lookup skipped ' + JSON.stringify({
      errCode: error && (error.errCode != null ? error.errCode : error.code) || '',
      errMsg: String((error && (error.errMsg || error.message)) || '').slice(0, 200)
    }))
    return []
  }
}

function playerIdOf(player) {
  return String((player && (player._id || player.id)) || '')
}

function chooseMain(players, profile) {
  const saved = String((profile && profile.mainPlayerId) || '')
  if (saved) {
    const hit = players.filter(function (player) { return playerIdOf(player) === saved })
    if (hit.length === 1) return hit[0]
  }
  if (players.length === 1) return players[0]
  return null
}

function positionLabel(player) {
  return String((player && (player.positionLabel || player.positionName || player.position)) || '').trim()
}

function numberText(player) {
  const number = player && (player.jerseyNumber || player.number)
  if (number == null || String(number).trim() === '') return ''
  return '#' + String(number).trim()
}

function mainCard(player) {
  if (!player) {
    return { success: true, empty: true, name: '', positionLabel: '', numberText: '', cardUrl: '', stats: [], stamps: [] }
  }
  return {
    success: true,
    empty: false,
    name: String(player.name || '球员'),
    positionLabel: positionLabel(player),
    numberText: numberText(player),
    cardUrl: String(player.playerCardUrl || player.cardUrl || ''),
    stats: [
      { label: '综合', num: '—' },
      { label: '出场', num: '—' },
      { label: '进球', num: '—' },
      { label: '助攻', num: '—' }
    ],
    stamps: []
  }
}

function album(players, main) {
  const tiles = players.map(function (player) {
    const id = playerIdOf(player)
    const meta = [positionLabel(player) || '球员', numberText(player)].filter(Boolean).join(' · ')
    return {
      id: id,
      name: String(player.name || '球员'),
      metaText: meta,
      ovrText: '',
      cardUrl: String(player.playerCardUrl || player.cardUrl || ''),
      isMain: !!(main && playerIdOf(main) === id),
      skillText: ''
    }
  })
  return {
    success: true,
    tiles: tiles,
    signDisabled: true,
    signBtn: '免费签约',
    remainText: '档案已建立',
    countText: tiles.length ? ('共 ' + tiles.length + ' 张') : '卡册为空'
  }
}

function lineup(profile) {
  const saved = profile && profile.slots && typeof profile.slots === 'object' ? profile.slots : {}
  const rows = LINEUP_SLOTS.map(function (slot) {
    const playerId = saved[slot.key] ? String(saved[slot.key]) : ''
    return { key: slot.key, label: slot.label, posTag: slot.posTag, playerId: playerId }
  })
  const filled = rows.filter(function (slot) { return slot.playerId }).length
  return {
    success: true,
    rows: rows,
    pctText: Math.round(filled / rows.length * 100) + '%',
    pctWidth: Math.round(filled / rows.length * 100) + '%',
    tip: filled >= rows.length ? '阵容已齐，可发起轻挑战' : '凑齐 5 人（含门将）后可发起轻挑战',
    challengeDisabled: filled < rows.length
  }
}

async function openWorld(db, event, deps) {
  const auth = await requireUser(db, event, deps)
  if (!auth.success) return auth
  let profile
  try {
    const city = cityOf(event)
    profile = await profileStore.ensureProfile(db, auth.user, city || undefined)
  } catch (error) {
    if (error && error.code === 'WORLD_PROFILE_CONFLICT') return fail(error.code, error.message)
    if (error && error.code === 'WORLD_USER_ID_MISSING') return fail(error.code, error.message)
    return fail('WORLD_PROFILE_FAILED', '卡世界档案初始化失败，请稍后重试', {
      errCode: error && (error.errCode != null ? error.errCode : '')
    })
  }
  profile = await rememberCity(db, profile, event)
  const players = await linkedPlayers(db, profileStore.userIdOf(auth.user))
  return { success: true, profile: profile, players: players, main: chooseMain(players, profile) }
}

async function handle(actionOrEvent, event, deps) {
  let action = actionOrEvent
  if (actionOrEvent && typeof actionOrEvent === 'object') {
    deps = event || {}
    event = actionOrEvent
    action = String(event.action || '')
  }
  action = String(action || '')
  deps = deps || {}
  const db = deps.cloud && typeof deps.cloud.database === 'function' ? deps.cloud.database() : deps.db
  if (!db) return fail('WORLD_PROFILE_FAILED', '卡世界档案初始化失败，请稍后重试')
  if (action === 'cardWorldLogin') {
    const opened = await openWorld(db, event, deps)
    if (!opened.success) return opened
    return {
      success: true,
      profileId: opened.profile && opened.profile._id || '',
      userId: String((opened.profile && opened.profile.userId) || ''),
      cityCode: opened.profile && opened.profile.cityCode || ''
    }
  }
  if (action === 'cardWorldMainCard' || action === 'cardWorldAlbum' || action === 'cardWorldLineup') {
    const opened = await openWorld(db, event, deps)
    if (!opened.success) return opened
    if (action === 'cardWorldMainCard') return mainCard(opened.main)
    if (action === 'cardWorldAlbum') return album(opened.players, opened.main)
    return lineup(opened.profile)
  }
  return fail('WORLD_ENGINE_LOCAL', '该卡世界操作需合入本机 cardWorld.cjs 后由原玩法处理')
}

module.exports = handle
module.exports.handle = handle
module.exports.ensureProfile = profileStore.ensureProfile
module.exports.SESSION_COLLECTIONS = SESSION_COLLECTIONS
