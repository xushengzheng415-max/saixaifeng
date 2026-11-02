'use strict'
/**
 * 赛小蜂 · 直播实时数据接口 (liveFeed)
 *
 * 供导播 PC 上的 vMix 桥接脚本轮询，返回当前比赛的实时比分、计时、
 * 事件与首发名单。严格字段白名单，不下发任何球员隐私字段，球员照片
 * 仅返回本场比赛名单内球员的 CDN 地址，禁止下发整队照片库。
 *
 * 鉴权：请求必须携带 matchId 与 token。token 需与环境变量 LIVE_FEED_TOKEN
 * 一致（未配置该环境变量时接口拒绝所有请求，fail-closed）。
 *
 * 返回结构：
 * {
 *   matchId, status, period, periodStartTs, clock,
 *   home: { name, short, logo, score, lineup: [{no, name, pos, photo}] },
 *   away: { ... },
 *   lastEvent: { type, minute, side, player },
 *   events: [{ eventId, type, minute, side, playerName }]
 * }
 */

const text = (v) => (v == null ? '' : String(v).trim())
const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const toTs = (v) => {
  if (!v) return null
  if (typeof v.toDate === 'function') {
    try { return v.toDate().getTime() } catch { return null }
  }
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? t : null
}

// 比赛状态 → 直播状态映射
const LIVE_STATUS_MAP = {
  scheduled: 'SCHEDULED',
  not_started: 'SCHEDULED',
  checked_in: 'SCHEDULED',
  ready: 'SCHEDULED',
  live: 'LIVE',
  ongoing: 'LIVE',
  in_progress: 'LIVE',
  playing: 'LIVE',
  halftime: 'HALF_TIME',
  half_time: 'HALF_TIME',
  finished: 'FINISHED',
  completed: 'FINISHED',
  ended: 'FINISHED',
  archived: 'FINISHED',
  cancelled: 'CANCELLED',
  postponed: 'POSTPONED',
}

function liveStatusOf(match) {
  const raw = text(match.status || '').toLowerCase()
  return LIVE_STATUS_MAP[raw] || raw.toUpperCase() || 'SCHEDULED'
}

// 根据裁判时钟计算当前比赛分钟与 MM:SS
function computeClock(match, now) {
  const running = match.refereeClockRunning === true
  const startedAt = toTs(match.refereeClockStartedAt)
  const elapsedBefore = num(match.refereeClockElapsedSeconds) || 0
  let totalSeconds = elapsedBefore
  if (running && startedAt) {
    totalSeconds += Math.max(0, Math.floor((now - startedAt) / 1000))
  }
  totalSeconds = Math.max(0, Math.floor(totalSeconds))
  const minute = Math.floor(totalSeconds / 60)
  const second = totalSeconds % 60
  const clock = `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
  // 阶段：>45 分钟视为下半场，否则上半场；半场休息状态单独返回 HT
  const status = liveStatusOf(match)
  let period
  if (status === 'HALF_TIME') period = 'HT'
  else if (status === 'FINISHED') period = 'FT'
  else if (minute >= 45) period = '2H'
  else period = '1H'
  return { clock, minute, period, periodStartTs: running ? startedAt : null, running }
}

// 从球队对象提取队徽 fileID（兼容多种字段名）
function teamLogoFileId(team) {
  if (!team || typeof team !== 'object') return ''
  const fields = ['logoTransparent', 'logoFileId', 'logoFileID', 'teamLogoFileId', 'teamLogoFileID', 'logo', 'logoUrl', 'teamLogo']
  for (const field of fields) {
    const value = team[field]
    const candidates = value && typeof value === 'object'
      ? [value.fileID, value.fileId, value.url, value.tempFileURL]
      : [value]
    for (const c of candidates) {
      const f = text(c)
      if (f.startsWith('cloud://')) return f
    }
  }
  return ''
}

// 从球员对象提取照片 fileID
function playerPhotoFileId(player) {
  if (!player || typeof player !== 'object') return ''
  const fields = ['photoFileID', 'photoFileId', 'processedPhotoFileId', 'photoUrl', 'avatarUrl', 'photo']
  for (const field of fields) {
    const value = player[field]
    const candidates = value && typeof value === 'object'
      ? [value.fileID, value.fileId, value.url, value.tempFileURL]
      : [value]
    for (const c of candidates) {
      const f = text(c)
      if (f.startsWith('cloud://')) return f
    }
  }
  return ''
}

// 解析名单结构，返回球员条目数组
function extractLineupPlayers(lineup) {
  if (!lineup) return []
  if (Array.isArray(lineup)) return lineup
  // 对象形式：{ starters: [...], substitutes: [...] } 或 { players: [...] }
  const parts = []
  if (Array.isArray(lineup.starters)) parts.push(...lineup.starters)
  if (Array.isArray(lineup.players)) parts.push(...lineup.players)
  if (Array.isArray(lineup.substitutes)) parts.push(...lineup.substitutes)
  if (Array.isArray(lineup.bench)) parts.push(...lineup.bench)
  return parts
}

// 把名单条目投影为白名单字段
function projectLineupEntry(entry) {
  const no = entry.playerNumber ?? entry.jerseyNumber ?? entry.number ?? entry.shirtNumber ?? ''
  return {
    no: no == null ? '' : String(no),
    name: text(entry.name || entry.playerName || ''),
    pos: text(entry.position || entry.pos || ''),
    playerId: text(entry.playerId || entry.id || entry._id || ''),
  }
}

// 把比赛事件投影为白名单字段
function projectEvent(ev) {
  if (!ev || typeof ev !== 'object') return null
  const type = text(ev.type || ev.eventType || '').toLowerCase()
  const side = ev.teamSide === 'away' || ev.side === 'away' ? 'away' : 'home'
  return {
    eventId: text(ev.eventId || ev._id || ev.id || ''),
    type,
    minute: num(ev.minute),
    side,
    playerName: text(ev.playerName || ev.player || ''),
  }
}

const EVENT_TYPE_LABELS = {
  goal: '进球',
  penalty_scored: '点球命中',
  penalty_missed: '点球未进',
  own_goal: '乌龙球',
  yellow_card: '黄牌',
  red_card: '红牌',
  second_yellow_red: '两黄变红',
  substitution: '换人',
}

function projectLastEvent(ev) {
  const p = projectEvent(ev)
  if (!p) return null
  return {
    type: EVENT_TYPE_LABELS[p.type] || p.type,
    minute: p.minute,
    side: p.side,
    player: p.playerName,
  }
}

module.exports = async function liveFeed(cloud, params) {
  const matchId = text(params.matchId)
  const token = text(params.token)

  // ---- 鉴权 ----
  const expectedToken = process.env.LIVE_FEED_TOKEN || ''
  if (!expectedToken) {
    return { success: false, code: 'LIVE_FEED_NOT_CONFIGURED', error: '直播数据接口未配置' }
  }
  if (!token || token !== expectedToken) {
    return { success: false, code: 'LIVE_FEED_UNAUTHORIZED', error: '鉴权失败' }
  }
  if (!matchId) {
    return { success: false, code: 'LIVE_FEED_MATCH_ID_REQUIRED', error: '缺少比赛ID' }
  }

  const db = cloud.database()

  // ---- 读取比赛 ----
  let match
  try {
    const res = await db.collection('matches').doc(matchId).get()
    match = Array.isArray(res.data) ? res.data[0] : res.data
  } catch (e) {
    return { success: false, code: 'LIVE_FEED_MATCH_NOT_FOUND', error: '比赛不存在' }
  }
  if (!match) {
    return { success: false, code: 'LIVE_FEED_MATCH_NOT_FOUND', error: '比赛不存在' }
  }

  const now = Date.now()
  const { clock, minute, period, periodStartTs } = computeClock(match, now)
  const status = liveStatusOf(match)

  // ---- 读取球队信息（队徽） ----
  const homeTeamId = text(match.homeTeamId)
  const awayTeamId = text(match.awayTeamId)
  let homeTeam = null, awayTeam = null
  if (homeTeamId || awayTeamId) {
    try {
      const teamIds = [homeTeamId, awayTeamId].filter(Boolean)
      const res = await db.collection('teams').where({ _id: db.command.in(teamIds) }).get()
      const teams = res.data || []
      homeTeam = teams.find((t) => text(t._id) === homeTeamId) || null
      awayTeam = teams.find((t) => text(t._id) === awayTeamId) || null
    } catch (e) {
      // 球队读取失败不阻断主流程，队徽留空
    }
  }

  // ---- 解析名单并收集球员 ID ----
  const homeLineupRaw = match.homeLineup || match.lineups?.home || null
  const awayLineupRaw = match.awayLineup || match.lineups?.away || null
  const homeEntries = extractLineupPlayers(homeLineupRaw)
  const awayEntries = extractLineupPlayers(awayLineupRaw)

  const playerIds = [...new Set([
    ...homeEntries.map((e) => text(e.playerId || e.id || e._id)).filter(Boolean),
    ...awayEntries.map((e) => text(e.playerId || e.id || e._id)).filter(Boolean),
  ])]

  // ---- 读取名单内球员照片（仅名单内球员，禁止整队库） ----
  const playersById = new Map()
  if (playerIds.length) {
    try {
      const res = await db.collection('players').where({ _id: db.command.in(playerIds) }).get()
      for (const p of (res.data || [])) {
        playersById.set(text(p._id), p)
      }
    } catch (e) {
      // 球员读取失败不阻断，照片留空
    }
  }

  // ---- 收集所有需要换 CDN 链接的 fileID ----
  const fileIdToUrl = new Map()
  const homeLogoFileId = teamLogoFileId(homeTeam || match.homeTeam)
  const awayLogoFileId = teamLogoFileId(awayTeam || match.awayTeam)
  if (homeLogoFileId) fileIdToUrl.set(homeLogoFileId, '')
  if (awayLogoFileId) fileIdToUrl.set(awayLogoFileId, '')
  for (const pid of playerIds) {
    const p = playersById.get(pid)
    const fid = playerPhotoFileId(p)
    if (fid) fileIdToUrl.set(fid, '')
  }

  // 批量获取临时 CDN URL
  if (fileIdToUrl.size) {
    try {
      const fileList = [...fileIdToUrl.keys()]
      const urlRes = await cloud.getTempFileURL({ fileList })
      const list = urlRes.fileList || []
      for (const item of list) {
        if (item.fileID && item.tempFileURL) {
          fileIdToUrl.set(item.fileID, item.tempFileURL)
        }
      }
    } catch (e) {
      // URL 转换失败，相关图片留空
    }
  }

  // ---- 投影名单 ----
  const projectSideLineup = (entries) => {
    return entries.map((entry) => {
      const projected = projectLineupEntry(entry)
      const pid = projected.playerId
      const player = pid ? playersById.get(pid) : null
      const fid = player ? playerPhotoFileId(player) : ''
      projected.photo = fid ? (fileIdToUrl.get(fid) || '') : ''
      delete projected.playerId // 不出球员ID
      return projected
    })
  }

  // ---- 投影事件 ----
  const allEvents = (Array.isArray(match.events) ? match.events : [])
    .map(projectEvent)
    .filter(Boolean)
  const lastEvent = allEvents.length ? projectLastEvent(allEvents[allEvents.length - 1]) : null

  // ---- 组装返回（严格白名单） ----
  const result = {
    matchId,
    status,
    period,
    periodStartTs,
    clock,
    matchMinute: minute,
    home: {
      name: text(match.homeTeamName || homeTeam?.name || homeTeam?.teamName || match.homeTeam?.name || ''),
      short: text(match.homeTeamShort || homeTeam?.shortName || ''),
      logo: homeLogoFileId ? (fileIdToUrl.get(homeLogoFileId) || '') : '',
      score: num(match.homeScore ?? match.scoreHome) ?? 0,
      lineup: projectSideLineup(homeEntries),
    },
    away: {
      name: text(match.awayTeamName || awayTeam?.name || awayTeam?.teamName || match.awayTeam?.name || ''),
      short: text(match.awayTeamShort || awayTeam?.shortName || ''),
      logo: awayLogoFileId ? (fileIdToUrl.get(awayLogoFileId) || '') : '',
      score: num(match.awayScore ?? match.scoreAway) ?? 0,
      lineup: projectSideLineup(awayEntries),
    },
    lastEvent,
    events: allEvents.slice(-30), // 最多返回最近 30 条事件
  }

  return { success: true, data: result }
}
