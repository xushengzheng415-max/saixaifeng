'use strict'

/**
 * 卡世界档案初始化。
 *
 * 背景：card_world_profiles 首次建档前集合并不存在，旧 ensureProfile 先
 * where().get() 再 createCollection，导致首读直接抛 -502005 并被包成
 * WORLD_PROFILE_FAILED。本文件先读；读失败且判定为「集合不存在」时创建集合并重试一次。
 *
 * 写入前去掉 _id / _openid；userId 缺失时返回 WORLD_USER_ID_MISSING；
 * 已有重复档案返回 WORLD_PROFILE_CONFLICT；其他意外失败打印原始
 * errCode / errMsg 后再抛 WORLD_PROFILE_FAILED。
 */

const COLLECTION = 'card_world_profiles'
const RESERVED_KEYS = ['_id', '_openid']

function textOf(error) {
  return String((error && (error.errMsg || error.message)) || '')
}

function codeOf(error) {
  if (!error) return ''
  if (error.errCode != null && error.errCode !== '') return error.errCode
  return error.code != null ? error.code : ''
}

function isMissingCollection(error) {
  const code = Number(codeOf(error))
  const text = textOf(error)
  if (code === -502005) return true
  return /DATABASE_COLLECTION_NOT_EXIST|Db or Table not exist|ResourceNotFound|collection not exist|COLLECTION_NOT_EXIST|invalid collection|not exist|does not exist|not found|集合不存在|数据集合不存在|表不存在/i.test(text)
}

function isAlreadyExists(error) {
  const code = Number(codeOf(error))
  if (code === -501001 || code === -502002) return true
  return /already exist|ALREADY_EXIST|ResourceExist|Table exist|collection.*exist|已存在/i.test(textOf(error))
}

function isDuplicateWrite(error) {
  return /duplicate|E11000|DATABASE_DUPLICATE_KEY|唯一索引|唯一键/i.test(textOf(error) + ' ' + String(codeOf(error)))
}

function profileError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function rowsOf(result) {
  if (!result) return []
  if (Array.isArray(result)) return result
  if (Array.isArray(result.data)) return result.data
  return []
}

function unwrapUser(user) {
  if (!user || typeof user !== 'object') return null
  const hasId = user._id || user.id || user.userId
  if (!hasId && user.data) return unwrapUser(Array.isArray(user.data) ? user.data[0] : user.data)
  return user
}

function userIdOf(user) {
  const row = unwrapUser(user)
  const id = row && (row._id || row.id || row.userId)
  return id == null ? '' : String(id).trim()
}

function stripReserved(data) {
  const source = data && typeof data === 'object' ? data : {}
  const out = {}
  Object.keys(source).forEach(function (key) {
    if (RESERVED_KEYS.indexOf(key) >= 0) return
    if (source[key] === undefined) return
    out[key] = source[key]
  })
  return out
}

function logProfileFailure(error, userId) {
  console.error('[cardWorld] ensureProfile failed ' + JSON.stringify({
    errCode: codeOf(error),
    errMsg: textOf(error).slice(0, 300),
    userId: userId || '',
    collection: COLLECTION
  }))
}

async function ensureCollection(db, name) {
  if (!db || typeof db.createCollection !== 'function') return false
  try {
    await db.createCollection(name)
    return true
  } catch (error) {
    if (isAlreadyExists(error)) return false
    throw error
  }
}

async function readProfiles(db, userId) {
  const query = function () {
    return db.collection(COLLECTION).where({ userId: userId }).limit(2).get()
  }
  try {
    return rowsOf(await query())
  } catch (error) {
    if (!isMissingCollection(error)) throw error
    await ensureCollection(db, COLLECTION)
    return rowsOf(await query())
  }
}

function documentFrom(db, userId, extra) {
  const now = db && typeof db.serverDate === 'function' ? db.serverDate() : new Date()
  const base = {
    userId: userId,
    createdAt: now,
    updateTime: now
  }
  const extraData = typeof extra === 'function' ? (extra(db, userId) || {}) : (extra || {})
  return stripReserved(Object.assign({}, extraData, base, { userId: userId }))
}

async function insertProfile(db, doc) {
  const write = function () {
    return db.collection(COLLECTION).add({ data: doc })
  }
  try {
    return await write()
  } catch (error) {
    if (!isMissingCollection(error)) throw error
    await ensureCollection(db, COLLECTION)
    return await write()
  }
}

function createdId(result) {
  if (!result) return ''
  if (result._id) return String(result._id)
  if (result.id) return String(result.id)
  return ''
}

async function ensureProfile(db, user, extra) {
  const userId = userIdOf(user)
  if (!userId) throw profileError('WORLD_USER_ID_MISSING', '当前账号缺少用户编号，请重新登录')
  if (!db || typeof db.collection !== 'function') throw profileError('WORLD_PROFILE_FAILED', '卡世界档案初始化失败，请稍后重试')
  try {
    let rows = await readProfiles(db, userId)
    if (rows.length > 1) throw profileError('WORLD_PROFILE_CONFLICT', '卡世界档案重复，请联系管理员处理')
    if (rows.length === 1) return rows[0]

    const doc = documentFrom(db, userId, extra)
    let created
    try {
      created = await insertProfile(db, doc)
    } catch (error) {
      if (!isDuplicateWrite(error)) throw error
      rows = await readProfiles(db, userId)
      if (rows.length === 1) return rows[0]
      if (rows.length > 1) throw profileError('WORLD_PROFILE_CONFLICT', '卡世界档案重复，请联系管理员处理')
      throw error
    }

    rows = await readProfiles(db, userId)
    if (rows.length > 1) throw profileError('WORLD_PROFILE_CONFLICT', '卡世界档案重复，请联系管理员处理')
    if (rows.length === 1) return rows[0]
    return Object.assign({ _id: createdId(created) }, doc)
  } catch (error) {
    if (error && (error.code === 'WORLD_PROFILE_CONFLICT' || error.code === 'WORLD_USER_ID_MISSING')) throw error
    logProfileFailure(error, userId)
    const wrapped = profileError('WORLD_PROFILE_FAILED', '卡世界档案初始化失败，请稍后重试')
    wrapped.errCode = codeOf(error)
    wrapped.errMsg = textOf(error).slice(0, 300)
    throw wrapped
  }
}

module.exports = {
  COLLECTION: COLLECTION,
  RESERVED_KEYS: RESERVED_KEYS,
  isMissingCollection: isMissingCollection,
  isAlreadyExists: isAlreadyExists,
  stripReserved: stripReserved,
  userIdOf: userIdOf,
  ensureCollection: ensureCollection,
  ensureProfile: ensureProfile
}
