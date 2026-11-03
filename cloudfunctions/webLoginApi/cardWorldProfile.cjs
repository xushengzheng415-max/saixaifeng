'use strict'

// 卡世界档案初始化。本机完整玩法仍在未提交的 cardWorld.cjs / cardWorldEngine.cjs。
// 合入时不要删除本文件，也不要恢复「查询失败就直接 fail(WORLD_PROFILE_FAILED)」的旧 ensureProfile。
// 本机 ensureProfile 应改成：
//   const { ensureProfile } = require('./cardWorldProfile.cjs')
//   const profile = await ensureProfile(db, user, function (database, userId) {
//     return { /* 原 doc 字段；不要带 _id / _openid，createdAt、updateTime 可省略 */ }
//   })
// 集合 card_world_profiles 不存在时会 createCollection 并重试一次。
// 写入前去掉 _id、_openid。users 文档若缺 _id，用 id / userId，或由调用方补上会话里的 userId。
// 意外失败会打 [cardWorld] ensureProfile failed，带原始 errCode / errMsg，再抛 WORLD_PROFILE_FAILED。

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
  return /DATABASE_COLLECTION_NOT_EXIST|Db or Table not exist|ResourceNotFound|collection not exist|TABLE_NOT_EXIST|database collection not exists|集合不存在|数据集合不存在|表不存在/i.test(text)
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

function documentFrom(db, userId, user, extra) {
  const now = db && typeof db.serverDate === 'function' ? db.serverDate() : new Date()
  const base = {
    userId: userId,
    status: 'active',
    createdAt: now,
    updateTime: now
  }
  const extraData = typeof extra === 'function' ? (extra(db, userId, unwrapUser(user)) || {}) : (extra || {})
  return stripReserved(Object.assign(base, extraData, { userId: userId }))
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
    if (rows.length > 1) throw profileError('WORLD_PROFILE_CONFLICT', '卡世界档案重复，请联系客服核对')
    if (rows.length === 1) return rows[0]
    const doc = documentFrom(db, userId, user, extra)
    let created
    try {
      created = await insertProfile(db, doc)
    } catch (error) {
      if (!isDuplicateWrite(error)) throw error
      rows = await readProfiles(db, userId)
      if (rows.length === 1) return rows[0]
      if (rows.length > 1) throw profileError('WORLD_PROFILE_CONFLICT', '卡世界档案重复，请联系客服核对')
      throw error
    }
    rows = await readProfiles(db, userId)
    if (rows.length > 1) throw profileError('WORLD_PROFILE_CONFLICT', '卡世界档案重复，请联系客服核对')
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
