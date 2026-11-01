'use strict'
// 测试用最小 CloudBase 数据库桩：仅覆盖本仓库脚本实际用到的链式 API。
// 不参与线上运行，只放在 tools/ 下供 node 测试复用。

function match(row, condition) {
  if (condition == null) return true
  if (Array.isArray(condition)) return condition.some(item => match(row, item))
  if (condition.__or) return condition.__or.some(item => match(row, item))
  if (condition.__and) return condition.__and.every(item => match(row, item))
  return Object.keys(condition).every(key => {
    const expected = condition[key]
    if (expected && typeof expected === 'object' && !Array.isArray(expected) && !(expected instanceof Date)) {
      if (expected.__gt !== undefined) {
        const left = row[key], right = expected.__gt
        if (left instanceof Date || right instanceof Date) return new Date(left || 0).getTime() > new Date(right).getTime()
        return left > right
      }
      if (expected.__in) return expected.__in.map(String).includes(String(row[key]))
    }
    if (expected instanceof Date) return new Date(row[key] || 0).getTime() === expected.getTime()
    return String(row[key] == null ? '' : row[key]) === String(expected == null ? '' : expected)
  })
}

function applyPatch(row, payload) {
  const patch = payload && payload.data || {}
  for (const key of Object.keys(patch)) {
    const value = patch[key]
    if (value && typeof value === 'object' && value.__set !== undefined) row[key] = value.__set
    else if (value && typeof value === 'object' && value.__remove !== undefined) delete row[key]
    else row[key] = value
  }
}

function createDb(seed, options) {
  const opts = options || {}
  const data = {}
  for (const name of Object.keys(seed || {})) data[name] = (seed[name] || []).map(row => Object.assign({}, row))
  const existing = new Set(opts.existing || Object.keys(data))
  const fail = opts.failCollections || {}
  const failWrites = opts.failWrites || {}

  function guard(name) {
    if (fail[name]) {
      const error = new Error(fail[name])
      error.code = 'DATA_READ_FAILED'
      throw error
    }
    if (!existing.has(name)) {
      const error = new Error('Db or Table not exist: ' + name)
      error.errCode = -502005
      error.code = 'DATABASE_COLLECTION_NOT_EXIST'
      throw error
    }
  }

  function guardWrite(name) {
    if (failWrites[name]) {
      const error = new Error(failWrites[name])
      error.code = 'DATA_WRITE_FAILED'
      throw error
    }
  }

  function rows(name) { return data[name] || (data[name] = []) }

  function query(name, condition) {
    let limitCount = Infinity, skipCount = 0, order = null
    const chain = {
      limit(value) { limitCount = Number(value) || Infinity; return chain },
      skip(value) { skipCount = Number(value) || 0; return chain },
      orderBy(field, direction) { order = [field, direction || 'asc']; return chain },
      field() { return chain },
      async get() {
        guard(name)
        let list = rows(name).filter(row => match(row, condition))
        if (order) {
          const [field, direction] = order
          list = list.slice().sort((left, right) => {
            const a = left[field], b = right[field]
            return (a < b ? -1 : a > b ? 1 : 0) * (direction === 'desc' ? -1 : 1)
          })
        }
        return { data: list.slice(skipCount, skipCount + limitCount) }
      },
      async count() {
        guard(name)
        return { total: rows(name).filter(row => match(row, condition)).length }
      },
      async update(payload) {
        guard(name)
        guardWrite(name)
        let updated = 0
        for (const row of rows(name)) {
          if (match(row, condition)) { applyPatch(row, payload); updated += 1 }
        }
        return { stats: { updated } }
      }
    }
    return chain
  }

  function collectionApi(name) {
    return {
      where: condition => query(name, condition),
      doc(id) {
        const docId = String(id)
        return {
          async get() {
            guard(name)
            return { data: rows(name).find(row => String(row._id) === docId) || null }
          },
          async set(payload) {
            guard(name)
            guardWrite(name)
            const index = rows(name).findIndex(row => String(row._id) === docId)
            const next = Object.assign({ _id: docId }, payload && payload.data || {})
            if (index >= 0) rows(name)[index] = next
            else rows(name).push(next)
            return { _id: docId }
          },
          async update(payload) {
            guard(name)
            guardWrite(name)
            const row = rows(name).find(item => String(item._id) === docId)
            if (row) applyPatch(row, payload)
            return { stats: { updated: row ? 1 : 0 } }
          },
          async remove() {
            guard(name)
            guardWrite(name)
            const before = rows(name).length
            data[name] = rows(name).filter(row => String(row._id) !== docId)
            return { stats: { removed: before - data[name].length } }
          }
        }
      },
      async add(payload) {
        guard(name)
        const id = String(opts.idPrefix || 'a-') + String(rows(name).length + 1)
        rows(name).push(Object.assign({ _id: id }, payload && payload.data || {}))
        return { _id: id }
      }
    }
  }

  const db = {
    serverDate: () => new Date(),
    command: {
      or: list => ({ __or: list }),
      and: list => ({ __and: list }),
      gt: value => ({ __gt: value }),
      in: list => ({ __in: list }),
      set: value => ({ __set: value }),
      remove: () => ({ __remove: true })
    },
    async createCollection(name) {
      if (existing.has(name)) {
        const error = new Error('collection already exists')
        error.errCode = -501001
        throw error
      }
      existing.add(name)
      if (!data[name]) data[name] = []
    },
    collection: collectionApi,
    async runTransaction(fn) {
      return fn({
        collection: collectionApi,
        serverDate: () => new Date()
      })
    }
  }
  return { db, data, existing }
}

module.exports = { createDb, match }
