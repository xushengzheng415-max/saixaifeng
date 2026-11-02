'use strict'
// 会员专属卡：按球员绑定账号判定会员资格（所有会员共用一张卡面，不做金银铜档位）。
// 2026-10-31 用户确认口径：
//   1. 会员到期后卡库里的会员卡置灰、不可设为展示；
//   2. 该球员的展示卡自动回落到传统赛事卡／基础卡；
//   3. 会员卡与赛事卡并存时赛事卡优先，会员卡只能由会员手动设为展示卡；
//   4. 全部会员共用一张会员卡背景。
// 会员状态只读 member_subscriptions（_id=服务号 openId，冗余 userId=users._id），
// 与 membership.cjs 的 active 口径一致：status==='active' 且 expiresAt 未过期。
const { readOptionalAll, readByIds } = require('./data-center/reader.cjs')

const SUBSCRIPTION = 'member_subscriptions'
const USER_FIELDS = ['linkedUserId', 'playerUserId', 'guardianUserId']
const MAX_USERS = 6
const MAX_SUBSCRIPTIONS = 60
const MAX_PLAYERS = 20000

function timeValue(value) {
  if (!value) return 0
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : 0 }
  const nested = value.$date || value._date || value.date
  return nested ? timeValue(nested) : 0
}

function userIdsOf(player) {
  return [...new Set(USER_FIELDS.map(field => String(player && player[field] || '').trim()).filter(Boolean))]
}

// 订阅文档按 userId 冗余关联到登录账号；没有 userId 的老数据不参与球员侧判定。
async function subscriptionsOf(db, userIds) {
  const ids = userIds.slice(0, MAX_USERS)
  if (!ids.length) return []
  const result = await readOptionalAll(db, SUBSCRIPTION, { userId: db.command.in(ids) }, { maxRows: MAX_SUBSCRIPTIONS })
  return result.rows.filter(row => ids.includes(String(row.userId || '')))
}

function stateOf(rows, now) {
  let active = null, latest = null
  for (const row of rows) {
    const expiresAt = timeValue(row.expiresAt)
    const entry = { expiresAt, levelCode: String(row.levelCode || '') }
    if (!latest || expiresAt > latest.expiresAt) latest = entry
    if (String(row.status || '') === 'active' && expiresAt > now && (!active || expiresAt > active.expiresAt)) active = entry
    else if (String(row.status || '') === 'active' && expiresAt > now && active && expiresAt === active.expiresAt) continue
  }
  const chosen = active || latest
  return {
    active: Boolean(active),
    expiresAt: chosen ? chosen.expiresAt : 0,
    levelCode: chosen ? chosen.levelCode : '',
    hasSubscription: Boolean(latest)
  }
}

const EMPTY = { active: false, expiresAt: 0, levelCode: '', hasSubscription: false }

// cache 为单次请求内的 Map（按绑定账号集合缓存），同一家长的多名球员只查一次。
async function memberState(db, player, cache) {
  const userIds = userIdsOf(player)
  if (!userIds.length) return EMPTY
  const key = userIds.join('|')
  if (cache && cache.has(key)) return cache.get(key)
  let state
  try {
    state = stateOf(await subscriptionsOf(db, userIds), Date.now())
  } catch (error) {
    // 会员库读取失败不能阻断卡库主流程，按非会员处理；到期置灰由下次读取恢复。
    console.warn('[playerCardMembership] 会员状态读取失败', String(error && (error.code || error.message) || ''))
    state = EMPTY
  }
  if (cache) cache.set(key, state)
  return state
}

async function isActiveMember(db, player) {
  return (await memberState(db, player)).active
}

// 会员范围下的球员：绑定账号中存在有效会员的球员档案。
async function memberPlayerIds(db) {
  const rows = await readOptionalAll(db, SUBSCRIPTION, {}, { maxRows: MAX_SUBSCRIPTIONS })
  const now = Date.now()
  return [...new Set(rows.rows
    .filter(row => String(row.status || '') === 'active' && timeValue(row.expiresAt) > now)
    .map(row => String(row.userId || '').trim())
    .filter(Boolean))]
}

async function memberPlayers(db) {
  const userIds = await memberPlayerIds(db)
  if (!userIds.length) return []
  const rows = []
  for (const field of USER_FIELDS) {
    rows.push(...await readByIds(db, 'players', field, userIds, { maxRows: MAX_PLAYERS }))
  }
  return [...new Map(rows
    .filter(row => row.deleted !== true && row.isDeleted !== true && row.status !== 'deleted')
    .map(row => [String(row._id), row])).values()]
}

module.exports = { memberState, isActiveMember, memberPlayers, memberPlayerIds, USER_FIELDS, SUBSCRIPTION }
