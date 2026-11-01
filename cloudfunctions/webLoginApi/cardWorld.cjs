'use strict'
/**
 * 赛小蜂足球世界 · 卡世界服务端 action（cardWorld*）
 *
 * 设计约束：
 * 1. 玩法规则全部来自 cardWorldEngine.cjs（与 miniprogram-world/utils/engine.js 同源），
 *    本文件只负责身份、读写和视图组装，不另写签约/对战算法。
 * 2. 身份以手机号主账号为准：worldOpenId / worldUnionId 只作为球员端小程序的渠道标识，
 *    不覆盖 users.openId、users.openid、users.wechatOpenId 等已有字段。
 * 3. 前端不得上传分数、卡级、资格或对手；签约与对战结果一律在服务端按确定性键计算。
 * 4. 集合（新建于现有业务环境 cloud1-7g8ckb3c7815a011）：
 *    card_world_players  同城名册（运营侧维护，本模块只读）
 *    card_world_profiles 玩家卡世界档案（配额、编制、阵容、战报、会员档位）
 *    card_world_cards    已签约卡册（含签约时的球员快照）
 * 5. 读取不静默截断：超出单次读取上限或读取行数与总数不一致时返回明确错误码。
 */

const engine = require('./cardWorldEngine.cjs')
const profileStore = require('./cardWorldProfile.cjs')
const playerCardReader = require('./playerCardReader.cjs')
const playerCardDynamic = require('./playerCardDynamic.cjs')
const { readAll: readAllPaged } = require('./data-center/reader.cjs')

const COLLECTIONS = {
  players: 'card_world_players',
  profiles: 'card_world_profiles',
  cards: 'card_world_cards'
}

const READ_PAGE = 100
const READ_MAX = 2000
const BATTLE_LOG_MAX = 20
const CITY_PATTERN = /^\d{4,6}$/
const PHONE_FIELDS = ['phone', 'phoneNumber']
const POSITION_LABELS = { GK: '门将', DF: '后卫', MF: '中场', FW: '前锋' }
const SKILL_LABELS = {
  finishing: '终结', passing: '传球', dribbling: '盘带', tackling: '拦截',
  aerial: '争顶', saving: '扑救', pace: '速度'
}
const POSITION_GROUPS = { GK: 'GK', DF: 'DF', CB: 'DF', LB: 'DF', RB: 'DF', MF: 'MF', CM: 'MF', DM: 'MF', LM: 'MF', RM: 'MF', FW: 'FW', ST: 'FW' }

let accessTokenCache = { token: '', expiresAt: 0 }

function fail(code, message) {
  return { success: false, code: code, error: message || engine.codeMessage(code) || '操作失败，请重试' }
}

function pad2(n) {
  return n < 10 ? '0' + n : String(n)
}

/** 服务端时间戳按 Asia/Shanghai 展示，避免容器 UTC 时区导致战报时间偏移。 */
function shanghaiParts(ms) {
  const d = new Date((Number(ms) || Date.now()) + engine.SHANGHAI_OFFSET_MS)
  return {
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes()
  }
}

function isMissingCollection(error) {
  const code = Number((error && (error.errCode != null ? error.errCode : error.code)) || 0)
  if (code === -502005) return true
  return /DATABASE_COLLECTION_NOT_EXIST|Db or Table not exist|ResourceNotFound|collection not exist|COLLECTION_NOT_EXIST|invalid collection|not exist|does not exist|not found|集合不存在|数据集合不存在|表不存在/i
    .test(String((error && (error.errMsg || error.message)) || ''))
}

function positionGroup(position) {
  return POSITION_GROUPS[String(position || '').toUpperCase()] || ''
}

module.exports = function createCardWorld(deps) {
  const cloud = deps.cloud
  const authenticateWebSession = deps.authenticateWebSession
  const authenticateServicePrivate = deps.authenticateServicePrivate
  const httpsGet = deps.httpsGet
  const httpsPost = deps.httpsPost

  function database() {
    return cloud.database()
  }

  function worldAppId() {
    return String(process.env.WORLD_MINI_PROGRAM_APP_ID || '').trim()
  }

  function worldAppSecret() {
    return String(process.env.WORLD_MINI_PROGRAM_APP_SECRET || '').trim()
  }

  /* ---------------- 集合与读取 ---------------- */

  async function ensureCollections(db) {
    for (const name of Object.values(COLLECTIONS)) {
      try {
        await db.createCollection(name)
      } catch (error) {
        if (!profileStore.isAlreadyExists(error)) {
          console.warn('[cardWorld] collection prepare failed:', name, JSON.stringify({
            errCode: error && (error.errCode != null ? error.errCode : error.code) || '',
            errMsg: String((error && (error.errMsg || error.message)) || '').slice(0, 200)
          }))
        }
      }
    }
  }

  /**
   * 分页读全量，先 count 再逐页取；总数与实读行数不一致时报错，不返回不完整数据。
   */
  async function readAll(name, where, orderField) {
    const db = database()
    const countResult = await db.collection(name).where(where).count()
    const total = Number(countResult && countResult.total) || 0
    if (total > READ_MAX) {
      throw Object.assign(new Error('卡世界数据量超出单次读取上限（' + READ_MAX + '）'), { code: 'WORLD_READ_LIMIT' })
    }
    const rows = []
    for (let offset = 0; offset < total; offset += READ_PAGE) {
      let query = db.collection(name).where(where)
      if (orderField) query = query.orderBy(orderField, 'asc')
      const result = await query.skip(offset).limit(READ_PAGE).get()
      rows.push(...((result && result.data) || []))
    }
    if (rows.length !== total) {
      throw Object.assign(new Error('卡世界数据读取不完整，请重试'), { code: 'WORLD_READ_INCOMPLETE' })
    }
    return rows
  }

  async function readCards(userId) {
    try {
      return await readAll(COLLECTIONS.cards, { userId: userId })
    } catch (error) {
      if (isMissingCollection(error)) return []
      throw error
    }
  }

  /** 同城名册缺失时返回 missing=true，由调用方给出「名册未配置」而不是「只能签同城」。 */
  async function readPlayerPool(cityCode) {
    if (!cityCode) return { rows: [], missing: true }
    try {
      return { rows: await readAll(COLLECTIONS.players, { cityCode: cityCode }, 'rosterOrder'), missing: false }
    } catch (error) {
      if (isMissingCollection(error)) return { rows: [], missing: true }
      throw error
    }
  }

  /* ---------------- 身份 ---------------- */

  async function findUserById(userId) {
    const id = String(userId || '').trim()
    if (!id) return null
    try {
      const result = await database().collection('users').doc(id).get()
      return (result && result.data) || null
    } catch (error) {
      return null
    }
  }

  async function findUserByPhone(phone) {
    const value = String(phone || '').trim()
    if (!value) return { error: fail('WORLD_PHONE_REQUIRED', '需要手机号才能进入卡世界') }
    const db = database()
    const rows = []
    for (const field of PHONE_FIELDS) {
      const result = await db.collection('users').where({ [field]: value }).limit(20).get()
      rows.push(...((result && result.data) || []))
    }
    const unique = []
    for (const row of rows) {
      if (!row || !row._id) continue
      if (unique.some(item => item._id === row._id)) continue
      unique.push(row)
    }
    if (!unique.length) {
      return { error: fail('WORLD_PHONE_UNBOUND', '该手机号还没有赛小蜂账号，请先在服务号完成注册') }
    }
    if (unique.length > 1) {
      console.error('[cardWorld] 手机号命中多个账号，已阻断：', unique.length)
      return { error: fail('WORLD_PHONE_CONFLICT', '账号数据异常，请联系管理员处理') }
    }
    return { user: unique[0] }
  }

  async function findUserByWorldOpenId(openid) {
    const value = String(openid || '').trim()
    if (!value) return { user: null }
    const result = await database().collection('users').where({ worldOpenId: value }).limit(2).get()
    const rows = (result && result.data) || []
    if (rows.length > 1) {
      console.error('[cardWorld] worldOpenId 命中多个账号：', rows.length)
      return { error: fail('WORLD_OPENID_CONFLICT', '账号数据异常，请联系管理员处理') }
    }
    return { user: rows[0] || null }
  }

  async function fetchWorldAccessToken() {
    const appid = worldAppId()
    const secret = worldAppSecret()
    if (!appid || !secret) {
      return { error: fail('WORLD_PHONE_CONFIG_MISSING', '球员端小程序手机号能力未配置，请联系管理员') }
    }
    if (accessTokenCache.token && accessTokenCache.expiresAt > Date.now()) {
      return { token: accessTokenCache.token }
    }
    const url = 'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=' +
      encodeURIComponent(appid) + '&secret=' + encodeURIComponent(secret)
    const reply = await httpsGet(url)
    if (!reply || reply.errcode || !reply.access_token) {
      console.error('[cardWorld] 获取球员端 access_token 失败:', reply && reply.errcode, reply && reply.errmsg)
      return { error: fail('WORLD_PHONE_CONFIG_MISSING', '微信接口暂不可用，请稍后重试') }
    }
    accessTokenCache = {
      token: String(reply.access_token),
      expiresAt: Date.now() + Math.max(60, (Number(reply.expires_in) || 7200) - 300) * 1000
    }
    return { token: accessTokenCache.token }
  }

  /** getPhoneNumber 组件返回的 code 换取手机号；同一 code 只能消费一次。 */
  async function resolvePhoneFromCode(phoneCode) {
    const tokenResult = await fetchWorldAccessToken()
    if (tokenResult.error) return tokenResult
    const path = '/wxa/business/getuserphonenumber?access_token=' + encodeURIComponent(tokenResult.token)
    let reply
    try {
      reply = await httpsPost('api.weixin.qq.com', 443, path, { 'content-type': 'application/json' }, { code: String(phoneCode) })
    } catch (error) {
      console.error('[cardWorld] 手机号换取网络异常:', (error && error.message) || error)
      return { error: fail('WORLD_PHONE_AUTH_FAILED', '手机号验证失败，请重试') }
    }
    if (Number((reply && reply.errcode) || 0) !== 0) {
      console.error('[cardWorld] 手机号换取失败:', reply && reply.errcode, reply && reply.errmsg)
      return { error: fail('WORLD_PHONE_AUTH_FAILED', '手机号验证失败，请重试') }
    }
    const phone = String((reply && reply.phone_info && reply.phone_info.phoneNumber) || '')
    if (!phone) return { error: fail('WORLD_PHONE_AUTH_FAILED', '手机号验证失败，请重试') }
    return { phone: phone }
  }

  /**
   * 身份解析顺序：服务号 H5 会话 → PC/H5 authToken → getPhoneNumber 手机号 → 已绑定的球员端 openId。
   * 任一渠道命中的账号都必须是同一自然人（手机号主账号），冲突时阻断。
   */
  async function resolveUser(params, wxContext) {
    const context = wxContext || {}
    const appid = String(context.APPID || '').trim()
    const expectedAppId = worldAppId()
    if (expectedAppId && appid && appid !== expectedAppId) {
      console.error('[cardWorld] 拒绝非球员端小程序调用:', appid)
      return { error: fail('WORLD_APP_DENIED', '当前小程序没有卡世界权限') }
    }

    const serviceToken = String(params.serviceSessionToken || '').trim()
    if (serviceToken) {
      if (typeof authenticateServicePrivate !== 'function') {
        return { error: fail('WORLD_LOGIN_REQUIRED', '服务号会话鉴权未就绪，请稍后重试') }
      }
      const auth = await authenticateServicePrivate({ serviceSessionToken: serviceToken })
      if (!auth || auth.success === false) {
        return { error: fail(auth && auth.code === 'SERVICE_PRIVATE_AUTH_REQUIRED' ? 'WORLD_LOGIN_REQUIRED' : ((auth && auth.code) || 'WORLD_LOGIN_REQUIRED'), (auth && auth.error) || '请先在「我的」完成登录') }
      }
      if (auth.needsBinding || !auth.user) {
        return { error: fail('WORLD_PHONE_UNBOUND', '请先在「我的」完成手机号绑定后再进入赛小蜂足球世界') }
      }
      const user = await findUserById(auth.user._id)
      if (!user) return { error: fail('WORLD_USER_MISSING', '账号不存在，请重新登录') }
      return { user: user, via: 'service_h5' }
    }

    const token = String(params.authToken || '').trim()
    if (token) {
      const auth = await authenticateWebSession({ authToken: token })
      if (!auth || !auth.success) {
        return { error: fail('WORLD_LOGIN_REQUIRED', (auth && auth.error) || '登录会话已失效，请重新登录') }
      }
      const user = await findUserById(auth.userId)
      if (!user) return { error: fail('WORLD_USER_MISSING', '账号不存在，请重新登录') }
      return { user: user, via: 'web_session' }
    }

    const phoneCode = String(params.phoneCode || '').trim()
    if (phoneCode) {
      const phoneResult = await resolvePhoneFromCode(phoneCode)
      if (phoneResult.error) return phoneResult
      const found = await findUserByPhone(phoneResult.phone)
      if (found.error) return found
      return { user: found.user, via: 'world_phone' }
    }

    const bound = await findUserByWorldOpenId(context.OPENID)
    if (bound.error) return bound
    if (!bound.user) return { error: fail('WORLD_LOGIN_REQUIRED', '请先完成手机号验证') }
    return { user: bound.user, via: 'world_openid' }
  }

  /** 记录球员端渠道标识；已有不同微信时不静默换绑。 */
  async function bindWorldChannel(user, wxContext) {
    const context = wxContext || {}
    const openid = String(context.OPENID || '').trim()
    const unionid = String(context.UNIONID || '').trim()
    if (!openid) return null
    const storedOpenId = String(user.worldOpenId || '').trim()
    const storedUnionId = String(user.worldUnionId || '').trim()
    if (storedOpenId && storedOpenId !== openid) {
      if (storedUnionId && unionid && storedUnionId !== unionid) {
        console.error('[cardWorld] 账号已绑定其他微信，拒绝换绑:', user._id)
        return { error: fail('WORLD_CHANNEL_CONFLICT', '该账号已绑定其他微信，请联系客服核验') }
      }
    }
    const patch = {}
    if (storedOpenId !== openid) patch.worldOpenId = openid
    if (unionid && storedUnionId !== unionid) patch.worldUnionId = unionid
    if (!Object.keys(patch).length) return null
    patch.worldChannelBoundAt = database().serverDate()
    try {
      await database().collection('users').doc(user._id).update({ data: patch })
    } catch (error) {
      console.error('[cardWorld] 渠道标识写入失败:', (error && error.message) || error)
      return { error: fail('WORLD_CHANNEL_SAVE_FAILED', '账号渠道绑定失败，请稍后重试') }
    }
    user.worldOpenId = patch.worldOpenId || storedOpenId
    if (patch.worldUnionId) user.worldUnionId = patch.worldUnionId
    return null
  }

  /* ---------------- 档案 ---------------- */

  function defaultProfile(user) {
    const cityCode = String(user.cityCode || '').trim()
    return {
      userId: user._id,
      cityCode: CITY_PATTERN.test(cityCode) ? cityCode : '',
      cityName: String(user.cityName || '').trim(),
      mainPlayerId: '',
      mainCard: null,
      cursor: 0,
      quota: { dateKey: '', freeTotal: 0, freeUsed: 0, directedLeft: 0 },
      rosterSize: engine.ROSTER_SIZES.NEWBIE,
      slots: engine.buildSlots(engine.ROSTER_SIZES.NEWBIE),
      battleLog: [],
      membership: { tier: 'none', isMinor: false, autoRenew: false, rosterUnlocks: { size8: false, size11: false } },
      lastSignedName: '',
      lastSignAt: 0
    }
  }

  async function ensureProfile(user) {
    const db = database()
    /* 先保证集合存在，再读档案：旧实现先读会因集合缺失直接抛 -502005。 */
    await ensureCollections(db)
    return profileStore.ensureProfile(db, user, function (database) {
      const doc = defaultProfile(user)
      doc.createdAt = database.serverDate()
      doc.updateTime = database.serverDate()
      return doc
    })
  }

  async function updateProfile(profileId, patch) {
    const data = Object.assign({ updateTime: database().serverDate() }, patch)
    return database().collection(COLLECTIONS.profiles).doc(profileId).update({ data: data })
  }

  function profileMembership(profile) {
    const raw = (profile && profile.membership) || {}
    return {
      tier: raw.tier === 'member' ? 'member' : 'none',
      isMinor: raw.isMinor === true,
      autoRenew: raw.autoRenew === true,
      rosterUnlocks: {
        size8: !!(raw.rosterUnlocks && raw.rosterUnlocks.size8),
        size11: !!(raw.rosterUnlocks && raw.rosterUnlocks.size11)
      }
    }
  }

  async function ensureCity(profile, params) {
    const stored = String(profile.cityCode || '').trim()
    if (CITY_PATTERN.test(stored)) return { cityCode: stored }
    const incoming = String(params.cityCode || '').trim()
    if (!CITY_PATTERN.test(incoming)) {
      return { error: fail('WORLD_CITY_REQUIRED', '请先在账号资料中选择所在城市') }
    }
    const cityName = String(params.cityName || profile.cityName || '').trim()
    await updateProfile(profile._id, { cityCode: incoming, cityName: cityName })
    profile.cityCode = incoming
    profile.cityName = cityName
    return { cityCode: incoming }
  }

  /* ---------------- 名册与卡册 ---------------- */

  function normalizePlayer(raw, fallbackId) {
    const source = raw || {}
    const player = {}
    player.playerId = String(source.playerId || fallbackId || '')
    player.name = String(source.name || '')
    player.nameEn = String(source.nameEn || '')
    player.number = Number(source.number) || 0
    player.position = String(source.position || '')
    player.group = String(source.group || positionGroup(player.position))
    player.positionLabel = String(source.positionLabel || POSITION_LABELS[player.position] || player.position || '')
    player.skillTag = String(source.skillTag || '')
    player.skillLabel = String(source.skillLabel || SKILL_LABELS[player.skillTag] || '')
    player.ovr = Number(source.ovr) || 0
    player.appearances = Number(source.appearances) || 0
    player.goals = Number(source.goals) || 0
    player.assists = Number(source.assists) || 0
    player.rosterOrder = Number(source.rosterOrder) || 0
    player.cityCode = String(source.cityCode || '')
    player.cardUrl = String(source.cardUrl || '')
    player.portraitAuthorized = source.portraitAuthorized === true
    return player
  }

  function isValidPoolRow(row) {
    return !!(row && String(row.playerId || '').trim() && String(row.name || '').trim() && Number(row.ovr) > 0)
  }

  function buildPlayersById(poolRows, cards) {
    const map = {}
    let skipped = 0
    for (const row of poolRows || []) {
      if (!isValidPoolRow(row)) {
        skipped++
        continue
      }
      map[String(row.playerId)] = normalizePlayer(row)
    }
    if (skipped) console.warn('[cardWorld] 名册存在字段不完整的球员，已跳过:', skipped)
    for (const card of cards || []) {
      const playerId = String((card && card.playerId) || '')
      if (!playerId || map[playerId]) continue
      map[playerId] = normalizePlayer(card.snapshot, playerId)
    }
    return map
  }

  function ownedIdsOf(cards) {
    const ids = []
    for (const card of cards || []) {
      const playerId = String((card && card.playerId) || '')
      if (playerId && ids.indexOf(playerId) < 0) ids.push(playerId)
    }
    return ids
  }

  /** 固定按编制模板重建槽位，只沿用服务端已存的 playerId，不接受前端下发槽位定义。 */
  function currentSlots(profile) {
    const size = Number(profile.rosterSize) || engine.ROSTER_SIZES.NEWBIE
    const base = engine.buildSlots(size)
    const stored = Array.isArray(profile.slots) ? profile.slots : []
    for (const slot of base) {
      for (const item of stored) {
        if (item && item.key === slot.key && item.playerId) {
          slot.playerId = String(item.playerId)
          break
        }
      }
    }
    return base
  }

  /* ---------------- 视图 ---------------- */

  function quotaView(profile) {
    const tier = profileMembership(profile).tier
    const dateKey = engine.dateKeyShanghai(Date.now())
    return engine.normalizeQuota(profile.quota, tier, dateKey)
  }

  function placeholderStamps() {
    /*
     * 贴纸规则尚未由产品确认，这里沿用 local 演示的占位集合，
     * 服务端不做资格判定；确认规则后只在此处接统一发放结果。
     */
    return [
      { key: 'frame', icon: '🥇', name: '熔金边框', lockedClass: '' },
      { key: 'debut', icon: '✨', name: '首秀贴纸', lockedClass: '' },
      { key: 'ten', icon: '🔒', name: '十场出勤', lockedClass: 'is-locked' },
      { key: 'night', icon: '🔒', name: '破门之夜', lockedClass: 'is-locked' }
    ]
  }

  function statValue(value) {
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : '—'
  }

  function mainCardView(world) {
    const profile = world.profile
    const cityText = [profile.cityName, profile.cityCode].filter(Boolean).join(' · ')

    /* 优先展示主数据里的本人球员卡（卡面图与箔光由 H5 复用现有组件）。 */
    if (world.selfMain) {
      const card = world.selfMain.card || {}
      const player = world.selfMain.player || {}
      const stats = world.selfMain.stats || {}
      const position = String(player.position || '')
      const number = player.number != null ? player.number : player.jerseyNumber
      return {
        empty: false,
        playerId: String(player._id || player.id || card.playerId || ''),
        name: String(player.name || ''),
        nameEn: String(player.nameEn || ''),
        numberText: number ? '#' + number : '',
        positionLabel: String(player.positionLabel || POSITION_LABELS[position] || position || ''),
        cityText: cityText,
        cardUrl: String(card.cardUrl || ''),
        /* 全部来自数据中心；未采集/未核验为 null，展示为「—」，不补零。 */
        stats: [
          { label: '积分', num: statValue(stats.points) },
          { label: '出场', num: statValue(stats.appearances) },
          { label: '进球', num: statValue(stats.goals) },
          { label: '助攻', num: statValue(stats.assists) }
        ],
        stamps: placeholderStamps(),
        portraitNote: player.portraitAuthorized === false ? '形象照未授权，分享使用号码与阵容卡' : ''
      }
    }

    const playersById = world.playersById
    const ownedIds = ownedIdsOf(world.cards)
    const chosen = String(profile.mainPlayerId || '')
    const mainPlayerId = playersById[chosen] ? chosen : (ownedIds[0] || '')
    const player = mainPlayerId ? playersById[mainPlayerId] : null
    if (!player) {
      return {
        empty: true,
        playerId: '',
        name: '',
        nameEn: '',
        numberText: '',
        positionLabel: '',
        cityText: cityText,
        cardUrl: '',
        stats: [],
        stamps: [],
        portraitNote: ''
      }
    }
    return {
      empty: false,
      playerId: player.playerId,
      name: player.name,
      nameEn: player.nameEn,
      numberText: player.number ? '#' + player.number : '',
      positionLabel: player.positionLabel,
      cityText: cityText,
      cardUrl: player.cardUrl,
      stats: [
        { label: '综合', num: statValue(player.ovr) },
        { label: '出场', num: statValue(player.appearances) },
        { label: '进球', num: statValue(player.goals) },
        { label: '助攻', num: statValue(player.assists) }
      ],
      stamps: placeholderStamps(),
      portraitNote: player.portraitAuthorized ? '' : '形象照未授权，分享使用号码与阵容卡'
    }
  }

  function albumView(world) {
    const profile = world.profile
    const playersById = world.playersById
    const quota = quotaView(profile)
    const membership = profileMembership(profile)
    const memberView = engine.membershipView(membership)
    const cards = world.cards || []
    const tiles = []
    for (const card of cards) {
      const player = playersById[String(card.playerId || '')]
      if (!player) continue
      const isMain = player.playerId === String(profile.mainPlayerId || '')
      tiles.push({
        id: player.playerId,
        name: player.name,
        cardUrl: player.cardUrl,
        isMain: isMain,
        mainLabel: isMain ? '主卡' : '',
        metaText: player.positionLabel + ' · #' + player.number,
        skillText: player.skillLabel,
        ovrText: String(player.ovr)
      })
    }
    const freeLeft = engine.dailyFreeLeft(quota, membership.tier)
    return {
      tiles: tiles,
      isEmpty: tiles.length === 0,
      countText: '共 ' + tiles.length + ' 张',
      freeLeft: freeLeft,
      freeTotal: quota.freeTotal || engine.memberDailyFreeTotal(membership.tier),
      remainText: freeLeft > 0
        ? ('今日剩余 ' + freeLeft + ' 次')
        : '明日再来 · 免费 ' + (quota.freeTotal || 1) + ' 次/日',
      signDisabled: freeLeft < 1,
      signBtn: freeLeft > 0 ? '免费签约' : '今日已签约',
      directedLeft: quota.directedLeft || 0,
      directedText: (quota.directedLeft || 0) > 0 ? ('定向剩余 ' + quota.directedLeft + ' 次') : '定向签约次数可在活动中获得',
      membershipTierText: memberView.tierText,
      memberDailyText: '会员每日 ' + memberView.dailySignQuota + ' 次',
      minorText: memberView.isMinor ? '未成年账号不开启自动续费' : '',
      unlock8Text: memberView.rosterUnlocks.size8 ? '社区 8 人编制已解锁' : '社区 8 人编制未解锁',
      unlock11Text: memberView.rosterUnlocks.size11 ? '城市 11 人编制已解锁' : '城市 11 人编制未解锁',
      lastSignedName: String(profile.lastSignedName || ''),
      lastSignText: profile.lastSignedName ? ('签约成功 · ' + profile.lastSignedName) : '',
      cityText: profile.cityName || ''
    }
  }

  function lineupView(world, activeKey) {
    const profile = world.profile
    const slots = currentSlots(profile)
    const playersById = world.playersById
    const membership = profileMembership(profile)
    const size = Number(profile.rosterSize) || engine.ROSTER_SIZES.NEWBIE
    const rows = engine.pitchRows(slots, playersById, activeKey || '')
    let filled = 0
    for (const slot of slots) if (slot.playerId) filled++
    const check = engine.validateLineup({
      slots: slots,
      rosterSize: size,
      ownedIds: ownedIdsOf(world.cards),
      playersById: playersById,
      unlocks: membership.rosterUnlocks
    })
    const pct = Math.min(100, Math.round((filled / size) * 100))
    const isNewbie = size === engine.ROSTER_SIZES.NEWBIE
    return {
      rows: rows,
      rosterSize: size,
      filledText: filled + ' / ' + size + ' 人',
      pctText: pct + '%',
      pctWidth: pct + '%',
      canChallenge: isNewbie && check.ok,
      challengeDisabled: !(isNewbie && check.ok),
      tip: isNewbie
        ? (check.ok ? '可发起轻对战 · 新手场不上榜' : (check.message || '凑齐 5 人（含门将）'))
        : (check.ok ? '该编制阵容已完整' : (check.message || '该编制尚未解锁')),
      size5On: size === 5 ? 'is-on' : '',
      size8On: size === 8 ? 'is-on' : '',
      size11On: size === 11 ? 'is-on' : '',
      unlock8Class: membership.rosterUnlocks.size8 ? '' : 'is-locked',
      unlock11Class: membership.rosterUnlocks.size11 ? '' : 'is-locked',
      unlock8Text: membership.rosterUnlocks.size8 ? '社区 8' : '社区 8 🔒',
      unlock11Text: membership.rosterUnlocks.size11 ? '城市 11' : '城市 11 🔒',
      cityText: profile.cityName || ''
    }
  }

  function ownedChips(world) {
    const chips = []
    for (const playerId of ownedIdsOf(world.cards)) {
      const player = world.playersById[playerId]
      if (!player) continue
      chips.push({
        id: player.playerId,
        label: player.name + ' · ' + player.positionLabel + ' · ' + player.ovr,
        group: player.group
      })
    }
    return chips
  }

  function battleLogView(world) {
    const rows = []
    for (const entry of (world.profile.battleLog || [])) {
      if (!entry || !entry.id) continue
      const parts = shanghaiParts(entry.playedAt)
      const timeText = parts.month + '/' + parts.day + ' ' + parts.hour + ':' + pad2(parts.minute)
      rows.push({
        id: String(entry.id),
        resultText: entry.result === 'win' ? '胜' : (entry.result === 'lose' ? '负' : '平'),
        resultClass: entry.result === 'win' ? 'is-win' : (entry.result === 'lose' ? 'is-lose' : 'is-draw'),
        scoreText: Number(entry.scoreMine || 0) + ' – ' + Number(entry.scoreOpp || 0),
        comment: entry.comment || '',
        opponentText: entry.opponentLabel || '',
        timeText: timeText
      })
    }
    return { isEmpty: rows.length === 0, rows: rows }
  }

  function membershipView(profile) {
    const view = engine.membershipView(profileMembership(profile))
    return {
      tier: view.tier,
      tierText: view.tierText,
      dailySignQuota: view.dailySignQuota,
      rosterUnlocks: view.rosterUnlocks,
      isMinor: view.isMinor,
      minorNotice: view.isMinor ? '未成年账号不能开启自动续费' : '',
      /* 支付与续费统一在服务号 H5 办理，球员端不在小程序内开自动续费 */
      autoRenew: view.autoRenew,
      autoRenewAllowed: false,
      autoRenewNotice: '续费与自动续费请在赛小蜂服务号 H5 办理'
    }
  }

  /* ---------------- 本人球员卡（主数据只读引用） ---------------- */

  async function selfPlayers(userId) {
    const db = database()
    const command = db && db.command
    if (!userId || !command || typeof command.or !== 'function') return []
    try {
      /* 按 data-center/reader.cjs 游标分页读全量，不设固定条数截断。 */
      const rows = await readAllPaged(db, 'players', command.or([
        { linkedUserId: String(userId) },
        { playerUserId: String(userId) },
        { guardianUserId: String(userId) }
      ]))
      return (rows || []).filter(row => row && (row._id || row.id))
    } catch (error) {
      if (isMissingCollection(error)) return []
      console.warn('[cardWorld] 本人球员读取失败:', JSON.stringify({
        errCode: error && (error.errCode != null ? error.errCode : error.code) || '',
        errMsg: String((error && (error.errMsg || error.message)) || '').slice(0, 200)
      }))
      return []
    }
  }

  async function readSelfCards(players) {
    if (!players || !players.length) return []
    try {
      /* 不带 dynamic 选项：先读描述，避免为所有球员批量导出成卡图。 */
      return await playerCardReader.readCards(cloud, database(), players)
    } catch (error) {
      console.warn('[cardWorld] 本人球员卡读取失败:', JSON.stringify({
        errCode: error && (error.errCode != null ? error.errCode : error.code) || '',
        errMsg: String((error && (error.errMsg || error.message)) || '').slice(0, 200)
      }))
      return []
    }
  }

  /** 已发布优先，其次最新卡面数据；返回第一张可展示的卡。 */
  function pickSelfCard(cards) {
    return (cards || [])
      .filter(card => card && card.status === 'ready' && (card.cardUrl || card.cardScene))
      .sort((left, right) =>
        Number(right.publishedVersion || 0) - Number(left.publishedVersion || 0) ||
        Number(right.cardDataVersion || 0) - Number(left.cardDataVersion || 0))[0] || null
  }

  /** 统计统一走数据中心；未采集/未核验的值保持 null，展示端不得补零。 */
  async function selfCardStats(playerId) {
    try {
      const { createDataService } = require('./data-center/service.cjs')
      const score = await createDataService(database()).playerCardForAuthorizedPlayer(String(playerId))
      const metrics = (score && score.metrics) || {}
      return {
        status: String((score && score.status) || ''),
        points: score ? score.points : null,
        appearances: metrics.appearances,
        goals: metrics.goals,
        assists: metrics.assists
      }
    } catch (error) {
      console.warn('[cardWorld] 主卡统计读取失败:', String((error && (error.message || error.errMsg)) || error).slice(0, 200))
      return { status: '', points: null, appearances: null, goals: null, assists: null }
    }
  }

  async function ensureCardUrl(player, card) {
    if (!card) return null
    if (card.cardUrl) return card
    if (!card.cardScene) return null
    try {
      return Object.assign({}, card, await playerCardDynamic.exportCard(cloud, database(), player, card))
    } catch (error) {
      console.warn('[cardWorld] 主卡成卡图导出失败:', String((error && error.message) || error).slice(0, 200))
      return null
    }
  }

  function cardRefOf(card) {
    return {
      playerId: String(card.playerId || ''),
      cardId: String(card.cardId || ''),
      templateId: String(card.templateId || ''),
      cardTypeId: String(card.cardTypeId || ''),
      publishedVersion: Number(card.publishedVersion || 0),
      cardDataVersion: Number(card.cardDataVersion || 0)
    }
  }

  function sameCardRef(left, right) {
    if (!left || !right) return false
    if (String(left.playerId || '') !== String(right.playerId || '')) return false
    if (left.cardId && right.cardId) return String(left.cardId) === String(right.cardId)
    return String(left.templateId || '') === String(right.templateId || '')
  }

  /**
   * 自动读取本人球员卡并写入档案 mainCard（只存引用，不复制主数据）。
   * 档案里已有可用的人工选择时保持不变；否则取已发布/最新的一张。
   */
  async function resolveSelfMain(user, profile) {
    const players = await selfPlayers(user._id)
    if (!players.length) return null
    const cards = await readSelfCards(players)
    const ready = (cards || []).filter(card => card && card.status === 'ready')
    if (!ready.length) return null

    const pinned = profile && profile.mainCard && profile.mainCard.auto !== true
    const manual = pinned
      ? ready.filter(card => sameCardRef(profile.mainCard, card))[0]
      : null
    let chosen = manual || pickSelfCard(ready)
    if (!chosen) return null
    const player = players.filter(row => String(row._id || row.id) === String(chosen.playerId || ''))[0]
    if (!player) return null
    chosen = await ensureCardUrl(player, chosen)
    if (!chosen || !chosen.cardUrl) return null

    const nextRef = cardRefOf(chosen)
    if (!manual) nextRef.auto = true
    if (!sameCardRef(profile.mainCard, nextRef) || String(profile.mainPlayerId || '') !== nextRef.playerId) {
      await updateProfile(profile._id, { mainPlayerId: nextRef.playerId, mainCard: nextRef })
      profile.mainPlayerId = nextRef.playerId
      profile.mainCard = nextRef
    }
    return { player: player, card: chosen, cards: ready, players: players, stats: await selfCardStats(nextRef.playerId) }
  }

  /* ---------------- 世界状态 ---------------- */


  async function loadWorld(user, params, options) {
    let profile
    try {
      profile = await ensureProfile(user)
    } catch (error) {
      if (error && (error.code === 'WORLD_PROFILE_CONFLICT' || error.code === 'WORLD_USER_ID_MISSING')) {
        return { error: fail(error.code, error.message) }
      }
      console.error('[cardWorld] 档案初始化失败:', JSON.stringify({
        errCode: error && (error.errCode != null ? error.errCode : error.code) || '',
        errMsg: String((error && (error.errMsg || error.message)) || '').slice(0, 300)
      }))
      return { error: fail('WORLD_PROFILE_FAILED', '卡世界档案初始化失败，请稍后重试') }
    }
    const city = await ensureCity(profile, params || {})
    if (city.error) return { error: city.error }
    let selfMain = null
    /* 只有登录/主卡/设主卡需要读本人球员卡，避免卡册与组阵请求多付一次主数据读取。 */
    if (options && options.selfCards) {
      try {
        selfMain = await resolveSelfMain(user, profile)
      } catch (error) {
        console.warn('[cardWorld] 主卡同步失败:', String((error && (error.errMsg || error.message)) || error).slice(0, 200))
      }
    }
    const cards = await readCards(user._id)
    const pool = await readPlayerPool(city.cityCode)
    return {
      user: user,
      profile: profile,
      cityCode: city.cityCode,
      cards: cards,
      pool: pool,
      selfMain: selfMain,
      playersById: buildPlayersById(pool.rows, cards)
    }
  }

  async function withWorld(params, wxContext, fn, options) {
    const resolved = await resolveUser(params, wxContext)
    if (resolved.error) return resolved.error
    const channelError = await bindWorldChannel(resolved.user, wxContext)
    if (channelError) return channelError.error
    const world = await loadWorld(resolved.user, params, options)
    if (world.error) return world.error
    return fn(world, resolved.user, params)
  }

  /* ---------------- action 实现 ---------------- */

  async function login(params, wxContext) {
    return withWorld(params, wxContext, async function (world, user) {
      return {
        success: true,
        userId: user._id,
        cityCode: world.cityCode,
        cityName: world.profile.cityName || '',
        mode: 'cloud',
        ownedCount: (world.cards || []).length,
        mainPlayerId: String(world.profile.mainPlayerId || ''),
        mainCardReady: !!world.selfMain,
        poolMissing: !!world.pool.missing
      }
    }, { selfCards: true })
  }

  async function mainCardAction(params, wxContext) {
    return withWorld(params, wxContext, async function (world) {
      return Object.assign({ success: true }, mainCardView(world))
    }, { selfCards: true })
  }

  async function setMainCardAction(params, wxContext) {
    return withWorld(params, wxContext, async function (world) {
      const selfMain = world.selfMain
      if (!selfMain || !Array.isArray(selfMain.cards) || !selfMain.cards.length) {
        return fail('WORLD_MAIN_CARD_EMPTY', '还没有主卡，请先在「卡册·签约」领取球员卡')
      }
      const playerId = String(params.playerId || '').trim()
      const cardId = String(params.cardId || '').trim()
      const chosen = selfMain.cards.filter(function (card) {
        if (playerId && String(card.playerId || '') !== playerId) return false
        if (cardId && String(card.cardId || '') !== cardId) return false
        return true
      })[0]
      if (!chosen) return fail('WORLD_MAIN_CARD_NOT_FOUND', '该球员卡不在本人卡库中')
      const player = (selfMain.players || []).filter(function (row) {
        return String(row._id || row.id) === String(chosen.playerId || '')
      })[0]
      if (!player) return fail('WORLD_MAIN_CARD_NOT_FOUND', '球员资料不存在')
      const card = await ensureCardUrl(player, chosen)
      if (!card || !card.cardUrl) return fail('WORLD_MAIN_CARD_NOT_READY', '该球员卡暂不可展示，请稍后重试')
      const ref = cardRefOf(card)
      await updateProfile(world.profile._id, { mainPlayerId: ref.playerId, mainCard: ref })
      world.profile.mainPlayerId = ref.playerId
      world.profile.mainCard = ref
      world.selfMain = {
        player: player,
        card: card,
        cards: selfMain.cards,
        players: selfMain.players,
        stats: await selfCardStats(ref.playerId)
      }
      return Object.assign({ success: true }, mainCardView(world))
    }, { selfCards: true })
  }

  async function albumAction(params, wxContext) {
    return withWorld(params, wxContext, async function (world) {
      return Object.assign({ success: true }, albumView(world))
    })
  }

  async function ownedCardsAction(params, wxContext) {
    return withWorld(params, wxContext, async function (world) {
      return { success: true, chips: ownedChips(world) }
    })
  }

  async function lineupAction(params, wxContext) {
    return withWorld(params, wxContext, async function (world) {
      return Object.assign({ success: true }, lineupView(world, String(params.activeKey || '')))
    })
  }

  async function battleLogAction(params, wxContext) {
    return withWorld(params, wxContext, async function (world) {
      return Object.assign({ success: true }, battleLogView(world))
    })
  }

  async function membershipAction(params, wxContext) {
    return withWorld(params, wxContext, async function (world) {
      return Object.assign({ success: true }, membershipView(world.profile))
    })
  }

  function normalizeFilter(filter) {
    if (!filter || typeof filter !== 'object') return null
    const next = {}
    if (filter.position) next.position = String(filter.position)
    if (filter.skillTag) next.skillTag = String(filter.skillTag)
    return (next.position || next.skillTag) ? next : null
  }

  async function signSameCityAction(params, wxContext) {
    return withWorld(params, wxContext, async function (world, user) {
      if (world.pool.missing) {
        return fail('WORLD_POOL_MISSING', '同城名册尚未配置，请联系运营')
      }
      const profile = world.profile
      const membership = profileMembership(profile)
      const dateKey = engine.dateKeyShanghai(Date.now())
      const ownedIds = ownedIdsOf(world.cards)
      const cursorBefore = Math.max(0, Math.round(profile.cursor || 0))
      const quotaBefore = engine.normalizeQuota(profile.quota, membership.tier, dateKey)

      const result = engine.signSameCity({
        players: world.pool.rows,
        cityCode: world.cityCode,
        ownedIds: ownedIds,
        cursor: cursorBefore,
        mode: String(params.mode || 'free_daily'),
        filter: normalizeFilter(params.filter),
        dateKey: dateKey,
        userId: user._id,
        quota: quotaBefore,
        tier: membership.tier
      })
      if (!result.ok) return fail(result.code, result.message)

      const player = normalizePlayer(result.player, result.player && result.player.playerId)
      /*
       * 配额占用用「读到的原值」做条件更新（乐观锁）：
       * 条件不匹配说明期间有并发签约，宁可让用户刷新重试，也不能重复发放同一张卡。
       * 旧档案若没有 quota 子字段则退回按 _id 更新，避免条件永远不命中。
       */
      const storedQuota = profile.quota
      const claimCondition = { _id: profile._id }
      const hasStoredQuota = !!storedQuota && typeof storedQuota === 'object' && typeof storedQuota.dateKey === 'string'
      if (hasStoredQuota) {
        claimCondition['quota.dateKey'] = storedQuota.dateKey
        claimCondition['quota.freeUsed'] = Number(storedQuota.freeUsed) || 0
      }
      const claimData = {
        quota: result.quota,
        cursor: result.nextCursor,
        lastSignedName: player.name,
        lastSignAt: Date.now(),
        updateTime: database().serverDate()
      }
      const claim = await database().collection(COLLECTIONS.profiles)
        .where(claimCondition)
        .update({ data: claimData })
      if (!claim || !claim.stats || !Number(claim.stats.updated)) {
        return fail('WORLD_STATE_CONFLICT', '签约状态已变化，请刷新后重试')
      }

      try {
        await database().collection(COLLECTIONS.cards).add({
          data: {
            userId: user._id,
            playerId: player.playerId,
            cityCode: world.cityCode,
            source: 'sign_same_city',
            mode: String(params.mode || 'free_daily'),
            dateKey: dateKey,
            obtainedAt: Date.now(),
            deterministicKey: result.deterministicKey,
            snapshot: {
              name: player.name,
              nameEn: player.nameEn,
              number: player.number,
              position: player.position,
              positionLabel: player.positionLabel,
              group: player.group,
              skillTag: player.skillTag,
              skillLabel: player.skillLabel,
              ovr: player.ovr,
              cardUrl: player.cardUrl,
              portraitAuthorized: player.portraitAuthorized
            },
            createdTime: database().serverDate()
          }
        })
      } catch (error) {
        console.error('[cardWorld] 签约写卡失败，回滚配额:', (error && error.message) || error)
        try {
          await database().collection(COLLECTIONS.profiles).doc(profile._id).update({
            data: {
              quota: profile.quota,
              cursor: cursorBefore,
              lastSignedName: String(profile.lastSignedName || ''),
              lastSignAt: Number(profile.lastSignAt || 0),
              updateTime: database().serverDate()
            }
          })
        } catch (rollbackError) {
          console.error('[cardWorld] 配额回滚失败:', (rollbackError && rollbackError.message) || rollbackError)
        }
        return fail('WORLD_SIGN_SAVE_FAILED', '签约保存失败，请稍后重试')
      }

      return {
        success: true,
        ok: true,
        card: {
          cardId: 'c_' + player.playerId,
          playerId: player.playerId,
          name: player.name,
          nameEn: player.nameEn,
          numberText: player.number ? '#' + player.number : '',
          positionLabel: player.positionLabel,
          skillLabel: player.skillLabel,
          ovrText: String(player.ovr),
          cardUrl: player.cardUrl,
          cityCode: world.cityCode
        },
        signQuota: {
          dailyFreeLeft: engine.dailyFreeLeft(result.quota, membership.tier),
          dailyFreeTotal: result.quota.freeTotal,
          directedLeft: result.quota.directedLeft
        },
        deterministicKey: result.deterministicKey
      }
    })
  }

  async function setRosterSizeAction(params, wxContext) {
    return withWorld(params, wxContext, async function (world) {
      const size = Math.round(Number(params.size) || 0)
      if (size !== 5 && size !== 8 && size !== 11) {
        return fail(engine.CODES.MODE_INVALID, '编制人数无效')
      }
      const profile = world.profile
      const membership = profileMembership(profile)
      const ownedIds = ownedIdsOf(world.cards)
      const check = engine.validateLineup({
        slots: engine.buildSlots(size),
        rosterSize: size,
        ownedIds: ownedIds,
        playersById: world.playersById,
        unlocks: membership.rosterUnlocks
      })
      /* 空阵容返回 LINEUP_INVALID 属正常；未解锁必须先阻断 */
      if (!check.ok && check.code === engine.CODES.ROSTER_LOCKED) return fail(check.code, check.message)

      const previous = currentSlots(profile)
      const slots = engine.buildSlots(size)
      for (const slot of slots) {
        for (const prev of previous) {
          if (!prev.playerId || prev.playerId === slot.playerId) continue
          const player = world.playersById[prev.playerId]
          if (!player || player.group !== slot.group) continue
          if (slots.some(item => item.playerId === prev.playerId)) continue
          slot.playerId = prev.playerId
        }
      }
      await updateProfile(profile._id, { rosterSize: size, slots: slots })
      profile.rosterSize = size
      profile.slots = slots
      return Object.assign({ success: true }, lineupView(world, ''))
    })
  }

  async function setSlotAction(params, wxContext) {
    return withWorld(params, wxContext, async function (world) {
      const key = String(params.key || '').trim()
      const playerId = String(params.playerId || '').trim()
      const profile = world.profile
      const slots = currentSlots(profile)
      const target = slots.filter(item => item.key === key)[0]
      if (!target) return fail(engine.CODES.LINEUP_INVALID, '缺少槽位')
      if (playerId && ownedIdsOf(world.cards).indexOf(playerId) < 0) {
        return fail(engine.CODES.LINEUP_INVALID, '只能使用卡册内的球员卡')
      }
      if (playerId) {
        for (const slot of slots) if (slot.playerId === playerId) slot.playerId = ''
      }
      target.playerId = playerId
      await updateProfile(profile._id, { slots: slots })
      profile.slots = slots
      return Object.assign({ success: true }, lineupView(world, key))
    })
  }

  async function saveLineupAction(params, wxContext) {
    return withWorld(params, wxContext, async function (world) {
      const profile = world.profile
      const size = Number(profile.rosterSize) || engine.ROSTER_SIZES.NEWBIE
      const membership = profileMembership(profile)
      const base = engine.buildSlots(size)
      const knownKeys = base.map(item => item.key)
      const incoming = Array.isArray(params.slots) ? params.slots : []
      const assigned = {}
      for (const item of incoming) {
        if (!item || !item.key) continue
        const slotKey = String(item.key)
        if (knownKeys.indexOf(slotKey) < 0) return fail(engine.CODES.LINEUP_INVALID, '阵容包含未知槽位')
        assigned[slotKey] = String(item.playerId || '')
      }
      const slots = base.map(item => Object.assign({}, item, { playerId: assigned[item.key] || '' }))
      const check = engine.validateLineup({
        slots: slots,
        rosterSize: size,
        ownedIds: ownedIdsOf(world.cards),
        playersById: world.playersById,
        unlocks: membership.rosterUnlocks
      })
      if (!check.ok) return fail(check.code, check.message)
      await updateProfile(profile._id, { slots: slots })
      profile.slots = slots
      return { success: true, ok: true, power: check.power, rosterSize: size }
    })
  }

  async function battleAction(params, wxContext) {
    return withWorld(params, wxContext, async function (world, user) {
      const profile = world.profile
      const membership = profileMembership(profile)
      const size = Number(profile.rosterSize) || engine.ROSTER_SIZES.NEWBIE
      if (size !== engine.ROSTER_SIZES.NEWBIE) {
        return fail(engine.CODES.ROSTER_LOCKED, '本期仅开放 5 人新手场')
      }
      if (world.pool.missing) return fail('WORLD_POOL_MISSING', '同城名册尚未配置，请联系运营')
      const slots = currentSlots(profile)
      const check = engine.validateLineup({
        slots: slots,
        rosterSize: size,
        ownedIds: ownedIdsOf(world.cards),
        playersById: world.playersById,
        unlocks: membership.rosterUnlocks
      })
      if (!check.ok) return fail(check.code, check.message)

      const seed = engine.dateKeyShanghai(Date.now()) + '|' + user._id
      const opponent = engine.buildSystemOpponent({
        players: world.pool.rows,
        cityCode: world.cityCode,
        seed: seed
      })
      if (!opponent.slots.some(item => item.playerId)) {
        return fail('WORLD_OPPONENT_MISSING', '同城名册不足，暂时无法生成对手')
      }

      const result = engine.battleResult({
        lineupId: 'lu_' + size + '_' + user._id,
        lineupSlots: slots,
        opponentSlots: opponent.slots,
        playersById: world.playersById,
        opponent: { type: opponent.type, opponentId: opponent.opponentId }
      })
      const playedAt = Date.now()
      const entry = engine.battleLogEntry(result, {
        mode: 'newbie_5v5',
        opponentLabel: opponent.label,
        at: playedAt
      })
      const log = engine.trimBattleLog([entry].concat(profile.battleLog || []), BATTLE_LOG_MAX)
      await updateProfile(profile._id, { battleLog: log })
      profile.battleLog = log

      return {
        success: true,
        battleId: result.battleId,
        scoreMine: result.scoreMine,
        scoreOpp: result.scoreOpp,
        result: result.result,
        comment: result.comment,
        badges: result.badges,
        deterministicKey: result.deterministicKey,
        opponentLabel: opponent.label,
        opponentRows: engine.pitchRows(opponent.slots, world.playersById, ''),
        myRows: engine.pitchRows(slots, world.playersById, ''),
        myPower: result.powerMine,
        oppPower: result.powerOpp
      }
    })
  }

  async function setAutoRenewAction(params, wxContext) {
    return withWorld(params, wxContext, async function (world) {
      const profile = world.profile
      if (params.enabled === true) {
        return fail('WORLD_AUTORENEW_ON_H5', '续费与自动续费请在赛小蜂服务号 H5 办理')
      }
      const next = Object.assign({}, profileMembership(profile), { autoRenew: false })
      await updateProfile(profile._id, { membership: next })
      profile.membership = next
      return Object.assign({ success: true }, membershipView(profile))
    })
  }

  const ACTIONS = {
    cardWorldLogin: login,
    cardWorldMainCard: mainCardAction,
    cardWorldSetMainCard: setMainCardAction,
    cardWorldAlbum: albumAction,
    cardWorldOwnedCards: ownedCardsAction,
    cardWorldLineup: lineupAction,
    cardWorldBattleLog: battleLogAction,
    cardWorldMembership: membershipAction,
    cardWorldSignSameCity: signSameCityAction,
    cardWorldSetRosterSize: setRosterSizeAction,
    cardWorldSetSlot: setSlotAction,
    cardWorldSaveLineup: saveLineupAction,
    cardWorldBattle: battleAction,
    cardWorldSetAutoRenew: setAutoRenewAction
  }

  async function handle(action, params, wxContext) {
    const key = String(action || '').trim()
    const handler = ACTIONS[key]
    if (!handler) return fail('WORLD_ACTION_UNKNOWN', '未知的卡世界操作：' + key)
    try {
      return await handler(params || {}, wxContext || {})
    } catch (error) {
      const code = String((error && error.code) || '')
      if (code === 'WORLD_READ_LIMIT' || code === 'WORLD_READ_INCOMPLETE' || code === 'WORLD_PROFILE_CONFLICT') {
        return fail(code, error.message)
      }
      console.error('[cardWorld] action failed:', key, (error && error.message) || error)
      return fail('WORLD_SERVER_ERROR', '服务暂时不可用，请稍后重试')
    }
  }

  return { handle: handle, ACTIONS: ACTIONS }
}
