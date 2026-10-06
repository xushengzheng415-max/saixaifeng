'use strict'

class DataReadError extends Error {
  constructor(code, collection, message) {
    super(message)
    this.code = code
    this.collection = collection
  }
}

// Stable keyset pagination; reaching the budget is an error, never a complete result.
async function readAll(db, collection, where = {}, options = {}) {
  const pageSize = Math.min(100, Math.max(1, options.pageSize || 100))
  const maxRows = options.maxRows || 20000
  const rows = []
  let cursor = ''
  for (;;) {
    const condition = cursor ? db.command.and([where, { _id: db.command.gt(cursor) }]) : where
    let page
    try {
      let query = db.collection(collection).where(condition)
      if (options.fields) query = query.field({ ...options.fields, _id: true })
      page = (await query.orderBy('_id', 'asc').limit(Math.min(pageSize, maxRows - rows.length + 1)).get()).data || []
    } catch (error) {
      throw new DataReadError('DATA_READ_FAILED', collection, '数据读取失败，请重试或检查索引')
    }
    for (const row of page) {
      const id = String(row._id || '')
      if (!id || (cursor && id <= cursor)) throw new DataReadError('DATA_CURSOR_INVALID', collection, '分页顺序异常，请检查数据')
      cursor = id
      rows.push(row)
      if (rows.length > maxRows) throw new DataReadError('DATA_SCOPE_TOO_LARGE', collection, '数据范围过大，请缩小范围或使用分批导出')
    }
    // Some SDKs cap the requested page size. An empty page, rather than a short page,
    // proves exhaustion and also handles an exact multiple of the SDK limit.
    if (!page.length) return rows
  }
}

async function readByIds(db, collection, field, ids, options = {}) {
  const unique = [...new Set((ids || []).filter(Boolean).map(String))]
  const rows = new Map()
  for (let start = 0; start < unique.length; start += 20) {
    const page = await readAll(db, collection, { [field]: db.command.in(unique.slice(start, start + 20)) }, options)
    page.forEach(row => rows.set(String(row._id), row))
    if (rows.size > (options.maxRows || 20000)) throw new DataReadError('DATA_SCOPE_TOO_LARGE', collection, '数据范围过大，请缩小范围')
  }
  return [...rows.values()]
}

module.exports = { readAll, readByIds, DataReadError }
